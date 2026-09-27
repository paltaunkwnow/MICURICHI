/**
 * `pnpm db:local` (PGlite, ADR 0002) aplica las migraciones pendientes al arrancar. Con una base
 * persistida en `infra/.pglite` que tenga reportes en «nuevo», la 0015 aborta salvo que se pida
 * publicarlos a sabiendas, y el servidor no tenía forma de pedirlo: no arrancaba nunca más.
 *
 * Se pide igual que en el CLI de migraciones: `PGLITE_PUBLICAR_NUEVOS_EXISTENTES=1 pnpm db:local`
 * o, llamando al script directamente, `--publicar-nuevos-existentes`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import { migrarBaseLocal, publicarNuevosExistentesLocal } from '../src/local/opciones.js';
import { aplicarMigraciones } from '../src/migrar.js';

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Un reporte en «nuevo» con el esquema de 0014, como los de una base local de antes de T4. */
async function insertarNuevoViejo(ex: Ejecutor) {
  await ex.consultar(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
       severidad_puntaje, estado)
     VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
       'unidad_vecinal:A', 'gps', 'via_publica', 'Reporte de una base local anterior', 'rodilla',
       'ocasional', 'media', 6, 'nuevo')`,
  );
}

describe('opción de db:local para publicar los «nuevo» existentes', () => {
  it('por defecto no los publica', () => {
    expect(publicarNuevosExistentesLocal([], {})).toBe(false);
  });

  it('PGLITE_PUBLICAR_NUEVOS_EXISTENTES=1 los publica; otro valor no', () => {
    expect(publicarNuevosExistentesLocal([], { PGLITE_PUBLICAR_NUEVOS_EXISTENTES: '1' })).toBe(
      true,
    );
    for (const valor of ['0', '', 'si', 'true'])
      expect(
        publicarNuevosExistentesLocal([], { PGLITE_PUBLICAR_NUEVOS_EXISTENTES: valor }),
        valor,
      ).toBe(false);
  });

  it('la bandera --publicar-nuevos-existentes también, aunque pnpm le anteponga --', () => {
    expect(publicarNuevosExistentesLocal(['--publicar-nuevos-existentes'], {})).toBe(true);
    expect(publicarNuevosExistentesLocal(['--', '--publicar-nuevos-existentes'], {})).toBe(true);
  });
});

describe('arranque de db:local sobre una base persistida con «nuevo» anteriores a la 0015', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let error: unknown;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex, { hasta: '0014' });
    await insertarNuevoViejo(ex);
    error = await migrarBaseLocal(ex, [], {}).then(
      () => null,
      (e: unknown) => e,
    );
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('sin la opción aborta y dice cómo arrancar con db:local', () => {
    expect(error).toBeInstanceOf(Error);
    const texto = (error as Error).message;
    expect(texto).toMatch(/estado «nuevo»/);
    expect(texto).toMatch(/PGLITE_PUBLICAR_NUEVOS_EXISTENTES=1 pnpm db:local/);
  });

  it('con PGLITE_PUBLICAR_NUEVOS_EXISTENTES=1 migra todo y lo informa', async () => {
    const r = await migrarBaseLocal(ex, [], { PGLITE_PUBLICAR_NUEVOS_EXISTENTES: '1' });
    expect(r.publicarNuevosExistentes).toBe(true);
    expect(r.aplicadas).toContain('0015_publicacion_sin_moderacion.sql');
    const [n] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM reporte_inundacion WHERE estado = 'nuevo' AND publicar_en = creado_en`,
    );
    expect(n?.n).toBe(1);
  });
});
