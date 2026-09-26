/**
 * Migración 0012 (revisión de producción, 2026-09-26): cada foto guarda la cuenta que la subió.
 *
 * Hasta aquí `reporte_foto` no decía de quién era una foto: `POST /api/v1/fotos` exige sesión, pero
 * la fila no la anotaba. Con eso no se podía acotar cuántas fotos sube una cuenta ni exigir que
 * quien asocia una foto a su reporte sea quien la subió; bastaba conocer un `objeto_key` recién
 * subido por otra persona.
 *
 * Misma técnica que migracion-0010 y 0011: una base con las migraciones ANTERIORES recibe filas y
 * después se le aplica el directorio real. Aquí la base «vieja» se prepara con `hasta`, que es a la
 * vez la forma de probar esa opción contra PostgreSQL de verdad (PGlite + PostGIS).
 */
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import { aplicarMigraciones, listarMigraciones, type ResultadoMigracion } from '../src/migrar.js';

const ES_0012 = /^0012_.+\.sql$/;
const numero = (f: string) => f.slice(0, 4);

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

let db: Awaited<ReturnType<typeof crearPglite>>;
let ex: Ejecutor;
let hasta0011: ResultadoMigracion;
let resto: ResultadoMigracion;
let vecina: string;
let fotoVieja: string;

beforeAll(async () => {
  db = await crearPglite();
  ex = ejecutorPglite(db);
  hasta0011 = await aplicarMigraciones(ex, { hasta: '0011' });

  // Estado de una base en uso antes de 0012: una cuenta y una foto que ya subió.
  const [u] = await ex.consultar<{ id: string }>(
    `INSERT INTO usuario (email, nombre, password_hash)
     VALUES ('vecina-0012@test.local', 'Vecina 0012', 'scrypt$x$y') RETURNING id::text`,
  );
  vecina = u!.id;
  const [f] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado)
     VALUES ('anterior-a-0012.jpg', 'image/jpeg', 1234, 640, 480, true) RETURNING id::text`,
  );
  fotoVieja = f!.id;

  resto = await aplicarMigraciones(ex);
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe('hasta contra una base real', () => {
  it('hasta 0011 aplicó exactamente hasta 0011 y dejó las posteriores; la 0012 era la que faltaba', () => {
    const todas = listarMigraciones();
    expect(hasta0011.aplicadas).toEqual(todas.filter((f) => numero(f) <= '0011'));
    expect(hasta0011.pendientes).toEqual(todas.filter((f) => numero(f) > '0011'));
    expect(resto.aplicadas.some((f) => ES_0012.test(f))).toBe(true);
    expect(resto.aplicadas).toEqual(todas.filter((f) => numero(f) > '0011'));
  });

  it('sobre una base más adelantada falla y no deshace nada', async () => {
    const antes = await ex.consultar<{ nombre: string }>(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    await expect(aplicarMigraciones(ex, { hasta: '0009' })).rejects.toThrow(/posteriores a 0009/);
    const despues = await ex.consultar<{ nombre: string }>(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    expect(despues).toEqual(antes);
  });
});

describe('migración 0012: reporte_foto.subido_por', () => {
  it('existe un único 0012_*.sql', () => {
    expect(listarMigraciones().filter((f) => ES_0012.test(f))).toHaveLength(1);
  });

  it('añade subido_por uuid, que admite NULL', async () => {
    const [c] = await ex.consultar<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reporte_foto' AND column_name = 'subido_por'`,
    );
    expect(c).toEqual({ data_type: 'uuid', is_nullable: 'YES' });
  });

  it('referencia a usuario(id) y, si se borra la cuenta, deja la foto sin autor (SET NULL)', async () => {
    const [fk] = await ex.consultar<{ referida: string; al_borrar: string }>(
      `SELECT c.confrelid::regclass::text AS referida, c.confdeltype::text AS al_borrar
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'reporte_foto'::regclass AND c.contype = 'f' AND a.attname = 'subido_por'`,
    );
    expect(fk).toEqual({ referida: 'usuario', al_borrar: 'n' });
  });

  it('tiene índice (subido_por, creado_en): cuota por cuenta y borrado de cuentas sin recorrer la tabla', async () => {
    const indices = await ex.consultar<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'reporte_foto'`,
    );
    expect(indices.map((i) => i.indexdef).join('\n')).toMatch(/\(subido_por, creado_en\)/);
  });

  it('las fotos de antes de 0012 conservan sus datos y quedan sin autor', async () => {
    const [f] = await ex.consultar<Record<string, unknown>>(
      `SELECT objeto_key, mime, bytes, ancho, alto, exif_sanitizado, subido_por FROM reporte_foto WHERE id = $1`,
      [fotoVieja],
    );
    expect(f).toEqual({
      objeto_key: 'anterior-a-0012.jpg',
      mime: 'image/jpeg',
      bytes: 1234,
      ancho: 640,
      alto: 480,
      exif_sanitizado: true,
      subido_por: null,
    });
  });

  it('guarda el autor, rechaza uno inexistente (23503) y al borrar la cuenta la foto sigue, sin autor', async () => {
    const [f] = await ex.consultar<{ id: string; subido_por: string }>(
      `INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado, subido_por)
       VALUES ('con-autor.jpg', 'image/jpeg', 1, 1, 1, true, $1) RETURNING id::text, subido_por::text`,
      [vecina],
    );
    expect(f!.subido_por).toBe(vecina);

    await expect(
      ex.consultar(
        `INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, subido_por)
         VALUES ('autor-fantasma.jpg', 'image/jpeg', 1, 1, 1, '00000000-0000-4000-8000-000000000000')`,
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await ex.consultar('DELETE FROM usuario WHERE id = $1', [vecina]);
    const [despues] = await ex.consultar<{ subido_por: string | null }>(
      'SELECT subido_por::text FROM reporte_foto WHERE id = $1',
      [f!.id],
    );
    expect(despues).toEqual({ subido_por: null });
  });

  it('el esquema Drizzle declara subido_por en reporteFoto', () => {
    const nombres = Object.values(getTableColumns(esquema.reporteFoto)).map((c) => c.name);
    expect(nombres).toContain('subido_por');
  });
});
