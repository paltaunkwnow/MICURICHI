/**
 * Migración 0016 (T8): contracción de lo que 0014 y 0015 dejaron para el api-core anterior.
 *
 * Las 0014 y 0015 solo agregaron, para que el api-core anterior siguiera atendiendo mientras corría
 * el job de migraciones. La 0016 va en un despliegue posterior y quita lo que ya nadie usa:
 *  - `usuario.ultimo_reporte_en` (0009), la espera de 60 min entre reportes: se revoca el UPDATE por
 *    columna de `curichi_api` y se borra la columna;
 *  - el DEFAULT now() de `reporte_inundacion.publicar_en` (0015): un INSERT que no fije la demora
 *    tiene que fallar, no publicar el reporte al instante.
 *
 * PGlite no trae los roles de aplicación, pero se pueden crear: con ellos las 0008 y 0009 conceden
 * lo mismo que en producción y se puede comprobar la revocación columna por columna.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';
import { sembrarSamples } from '../src/seeds/samples.js';

const ARCHIVO_0016 = '0016_contraccion.sql';
const numero = (f: string) => f.slice(0, 4);

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Los roles de aplicación de infra/sql/01-roles.sh, sin login: solo para que haya a quién conceder. */
async function crearRoles(ex: Ejecutor) {
  await ex.ejecutar('CREATE ROLE curichi_api NOLOGIN; CREATE ROLE curichi_geo NOLOGIN;');
}

/** Columnas de `usuario` que `curichi_api` puede escribir con `op`, en orden. */
async function columnasConPrivilegio(ex: Ejecutor, op: 'INSERT' | 'UPDATE') {
  const filas = await ex.consultar<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuario'
        AND has_column_privilege('curichi_api', 'public.usuario', column_name, $1)
      ORDER BY column_name`,
    [op],
  );
  return filas.map((f) => f.c);
}

const columnasDeUsuario = async (ex: Ejecutor) =>
  (
    await ex.consultar<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usuario' ORDER BY ordinal_position`,
    )
  ).map((f) => f.c);

const columnaPublicarEn = (ex: Ejecutor) =>
  ex.consultar<{ data_type: string; is_nullable: string; column_default: string | null }>(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'
        AND column_name = 'publicar_en'`,
  );

const restriccionRango = (ex: Ejecutor) =>
  ex.consultar<{ definicion: string; validada: boolean }>(
    `SELECT pg_get_constraintdef(oid) AS definicion, convalidated AS validada FROM pg_constraint
      WHERE conrelid = 'public.reporte_inundacion'::regclass AND conname = 'publicar_en_rango'`,
  );

/** El INSERT mínimo de un reporte, con o sin `publicar_en`. */
function insertarReporte(ex: Ejecutor, publicarEn: string | null) {
  const columnas = publicarEn === null ? '' : ', publicar_en';
  const valores = publicarEn === null ? '' : `, ${publicarEn}`;
  return ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
       severidad_puntaje${columnas})
     VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
       'unidad_vecinal:A', 'gps', 'via_publica', 'Reporte para la migración 0016', 'rodilla',
       'ocasional', 'media', 6${valores})
     RETURNING id::text`,
  );
}

const leerReportes = (ex: Ejecutor) =>
  ex.consultar(
    `SELECT id::text, estado::text, creado_en, publicar_en FROM reporte_inundacion ORDER BY id::text`,
  );

const leerUsuarios = (ex: Ejecutor) =>
  ex.consultar(`SELECT id::text, email, nombre, rol::text FROM usuario ORDER BY email`);

let columnasDesde0015: string[];
let publicarEnDesde0015: Awaited<ReturnType<typeof columnaPublicarEn>>;

describe('migración 0016 desde 0015, con filas anteriores', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let hasta0015: ResultadoMigracion;
  let resto: ResultadoMigracion;
  let updateAntes: string[];
  let insertAntes: string[];
  let reportesAntes: unknown[];
  let usuariosAntes: unknown[];

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await crearRoles(ex);
    hasta0015 = await aplicarMigraciones(ex, { hasta: '0015' });
    updateAntes = await columnasConPrivilegio(ex, 'UPDATE');
    insertAntes = await columnasConPrivilegio(ex, 'INSERT');

    // Una cuenta con la marca de la espera de 60 min que la 0016 borra.
    await ex.consultar(
      `INSERT INTO usuario (email, nombre, password_hash, ultimo_reporte_en)
       VALUES ('vecina-0016@ejemplo.test', 'Vecina', 'x', now() - interval '3 hours')`,
    );
    // Reportes de los dos api-core: el anterior (sin publicar_en, toma el DEFAULT de la 0015), el
    // actual (now() + la demora) y uno viejo publicado desde su creado_en, como los rellenó la 0015.
    await insertarReporte(ex, null);
    await insertarReporte(ex, `now() + interval '240 seconds'`);
    await ex.consultar(
      `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
         ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
         severidad_puntaje, estado, creado_en, publicar_en)
       VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
         'unidad_vecinal:A', 'gps', 'via_publica', 'Reporte validado de hace dos días', 'rodilla',
         'ocasional', 'media', 6, 'validado', now() - interval '2 days', now() - interval '2 days')`,
    );
    reportesAntes = await leerReportes(ex);
    usuariosAntes = await leerUsuarios(ex);

    resto = await aplicarMigraciones(ex);
    columnasDesde0015 = await columnasDeUsuario(ex);
    publicarEnDesde0015 = await columnaPublicarEn(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0016_*.sql y se llama 0016_contraccion.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0016')).toEqual([ARCHIVO_0016]);
  });

  it('hasta 0015 la dejó pendiente y el resto la aplicó', () => {
    expect(hasta0015.pendientes).toContain(ARCHIVO_0016);
    expect(resto.aplicadas).toContain(ARCHIVO_0016);
  });

  it('usuario.ultimo_reporte_en ya no existe, y las cuentas siguen intactas', async () => {
    expect(columnasDesde0015).not.toContain('ultimo_reporte_en');
    expect(columnasDesde0015).toEqual(
      expect.arrayContaining(['id', 'email', 'nombre', 'rol', 'password_hash']),
    );
    expect(await leerUsuarios(ex)).toStrictEqual(usuariosAntes);
  });

  it('curichi_api pierde el UPDATE de ultimo_reporte_en y conserva el resto de sus columnas', async () => {
    // Antes: lo que concedió la 0009.
    expect(updateAntes).toEqual(['password_hash', 'ultimo_reporte_en']);
    expect(await columnasConPrivilegio(ex, 'UPDATE')).toEqual(['password_hash']);
    expect(await columnasConPrivilegio(ex, 'INSERT')).toEqual(insertAntes);
    expect(insertAntes).toEqual(['email', 'nombre', 'password_hash']);
  });

  it('los reportes anteriores quedan igual, publicar_en incluido', async () => {
    expect(await leerReportes(ex)).toStrictEqual(reportesAntes);
  });

  it('publicar_en sigue NOT NULL y con su CHECK, pero sin DEFAULT', async () => {
    expect(publicarEnDesde0015).toEqual([
      { data_type: 'timestamp with time zone', is_nullable: 'NO', column_default: null },
    ]);
    const [c] = await restriccionRango(ex);
    expect(c?.validada).toBe(true);
    expect(c?.definicion).toMatch(/publicar_en >= creado_en/);
  });

  it('un INSERT sin publicar_en falla con NOT NULL (23502) en lugar de publicar al instante', async () => {
    await expect(insertarReporte(ex, null)).rejects.toMatchObject({ code: '23502' });
  });

  it('el INSERT de api-core, con publicar_en = now() + la demora, sigue funcionando', async () => {
    for (const demora of ['60 seconds', '240 seconds'])
      await expect(insertarReporte(ex, `now() + interval '${demora}'`)).resolves.toHaveLength(1);
  });

  it('volver a migrar no aplica nada y ejecutar el archivo a mano no falla ni cambia nada', async () => {
    const otra = await aplicarMigraciones(ex);
    expect(otra.aplicadas).toEqual([]);
    const antes = { reportes: await leerReportes(ex), usuarios: await leerUsuarios(ex) };
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0016), 'utf8')),
    );
    expect({ reportes: await leerReportes(ex), usuarios: await leerUsuarios(ex) }).toStrictEqual(
      antes,
    );
    expect(await columnaPublicarEn(ex)).toStrictEqual(publicarEnDesde0015);
    expect(await columnasConPrivilegio(ex, 'UPDATE')).toEqual(['password_hash']);
  });
});

describe('migración 0016 desde cero', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('deja usuario y publicar_en igual que la base migrada desde 0015', async () => {
    expect(await columnasDeUsuario(ex)).toStrictEqual(columnasDesde0015);
    expect(await columnaPublicarEn(ex)).toStrictEqual(publicarEnDesde0015);
  });

  it('sin roles de aplicación (base de un solo usuario) se aplica igual', async () => {
    const [r] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('curichi_api', 'curichi_geo')`,
    );
    expect(r?.n).toBe(0);
    const [m] = await ex.consultar<{ n: number }>(
      'SELECT count(*)::int AS n FROM _migraciones WHERE nombre = $1',
      [ARCHIVO_0016],
    );
    expect(m?.n).toBe(1);
  });

  it('los seeds sintéticos siguen sembrando: fijan publicar_en ellos mismos', async () => {
    const r = await sembrarSamples(ex, {
      passwordAdmin: 'admin-de-prueba-0016',
      passwordTecnico: 'tecnico-de-prueba-0016',
      passwordVecina: 'vecina-de-prueba-0016',
      passwordEjecutivo: 'ejecutivo-de-prueba-0016',
    });
    expect(r.reportes).toBeGreaterThan(0);
  }, 120_000);
});
