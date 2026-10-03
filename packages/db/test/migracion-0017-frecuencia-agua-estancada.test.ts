/**
 * Migración 0017: añadir 'agua_estancada' al enum `frecuencia`.
 *
 * El contrato suma una quinta frecuencia (agua que queda retenida/estancada), con peso 5 en la
 * severidad. La migración es un solo `ALTER TYPE frecuencia ADD VALUE IF NOT EXISTS 'agua_estancada'`,
 * así que lo que hay que comprobar es:
 *  - que tras migrar el enum trae los cinco valores, con 'agua_estancada' al final (ADD VALUE sin
 *    BEFORE/AFTER lo agrega al final del orden del enum);
 *  - que es idempotente: volver a ejecutar el archivo a mano no falla (IF NOT EXISTS) ni duplica el
 *    valor;
 *  - que con el valor ya añadido se puede insertar un reporte con frecuencia = 'agua_estancada'
 *    (el valor nuevo solo es usable una vez que la transacción que lo agregó hizo COMMIT, y
 *    `aplicarMigraciones` commitea cada migración por separado).
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

const ARCHIVO_0017 = '0017_frecuencia_agua_estancada.sql';
const numero = (f: string) => f.slice(0, 4);
const FRECUENCIAS_ESPERADAS = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
  'agua_estancada',
];

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Valores del enum `frecuencia`, en el orden del propio enum (no el alfabético). */
const valoresFrecuencia = async (ex: Ejecutor) =>
  (
    await ex.consultar<{ v: string }>(
      `SELECT e.enumlabel AS v FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'frecuencia' ORDER BY e.enumsortorder`,
    )
  ).map((f) => f.v);

/** Un reporte con la frecuencia indicada; `publicar_en` es NOT NULL sin DEFAULT desde la 0016. */
function insertarReporte(ex: Ejecutor, frecuencia: string) {
  return ex.consultar<{ id: string; frecuencia: string }>(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
       severidad_puntaje, publicar_en)
     VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
       'unidad_vecinal:A', 'gps', 'via_publica', 'Reporte para la migración 0017', 'rodilla',
       $1::frecuencia, 'alta', 9, now() + interval '60 seconds')
     RETURNING id::text, frecuencia::text`,
    [frecuencia],
  );
}

describe('migración 0017 sobre una base en uso (desde 0016)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let hasta0016: ResultadoMigracion;
  let con0017: ResultadoMigracion;
  let valoresAntes: string[];

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    hasta0016 = await aplicarMigraciones(ex, { hasta: '0016' });
    valoresAntes = await valoresFrecuencia(ex);
    con0017 = await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0017_*.sql y se llama 0017_frecuencia_agua_estancada.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0017')).toEqual([ARCHIVO_0017]);
  });

  it('hasta 0016 la dejó pendiente y la pasada siguiente la aplicó', () => {
    expect(hasta0016.pendientes).toContain(ARCHIVO_0017);
    expect(con0017.aplicadas).toContain(ARCHIVO_0017);
  });

  it('antes de la 0017 el enum no tenía agua_estancada', () => {
    expect(valoresAntes).toEqual(['primera_vez', 'ocasional', 'cada_lluvia_fuerte', 'permanente']);
  });

  it('tras migrar el enum frecuencia incluye agua_estancada, al final del orden', async () => {
    expect(await valoresFrecuencia(ex)).toEqual(FRECUENCIAS_ESPERADAS);
  });

  it('se puede insertar un reporte con frecuencia = agua_estancada', async () => {
    const [r] = await insertarReporte(ex, 'agua_estancada');
    expect(r?.frecuencia).toBe('agua_estancada');
  });

  it('las frecuencias anteriores siguen aceptándose', async () => {
    for (const f of ['primera_vez', 'ocasional', 'cada_lluvia_fuerte', 'permanente'])
      await expect(insertarReporte(ex, f)).resolves.toHaveLength(1);
  });

  it('volver a migrar no aplica nada y ejecutar el archivo a mano no falla ni duplica el valor', async () => {
    const otra = await aplicarMigraciones(ex);
    expect(otra.aplicadas).toEqual([]);
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0017), 'utf8')),
    );
    expect(await valoresFrecuencia(ex)).toEqual(FRECUENCIAS_ESPERADAS);
  });
});

describe('migración 0017 desde cero', () => {
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

  it('deja el mismo enum frecuencia que la base migrada desde 0016', async () => {
    expect(await valoresFrecuencia(ex)).toEqual(FRECUENCIAS_ESPERADAS);
  });

  it('acepta un reporte con frecuencia = agua_estancada', async () => {
    const [r] = await insertarReporte(ex, 'agua_estancada');
    expect(r?.frecuencia).toBe('agua_estancada');
  });
});
