/**
 * Migración 0019: añadir 'aproximada' al enum `ubicacion_metodo`.
 *
 * El contrato suma un tercer método de ubicación: un dispositivo sin GPS preciso (p. ej. una laptop)
 * reporta con la ubicación aproximada, puesta a mano. El reporte se guarda con
 * `ubicacion_metodo = 'aproximada'`, la precisión declarada y `distancia_dispositivo_m = NULL` (con
 * esa imprecisión la distancia no dice nada; la posición del dispositivo sigue sin guardarse, §13).
 *
 * La migración es un solo `ALTER TYPE ubicacion_metodo ADD VALUE IF NOT EXISTS 'aproximada'`, así que
 * lo que hay que comprobar es:
 *  - que tras migrar el enum trae los tres valores, con 'aproximada' al final (ADD VALUE sin
 *    BEFORE/AFTER lo agrega al final del orden del enum);
 *  - que es idempotente: volver a ejecutar el archivo a mano no falla (IF NOT EXISTS) ni duplica el
 *    valor;
 *  - que con el valor ya añadido se puede insertar un reporte con `ubicacion_metodo = 'aproximada'`,
 *    `precision_gps_m = 178` (mayor a 50: el límite de los 50 m lo hace cumplir api-core, no la base)
 *    y `distancia_dispositivo_m = NULL` (el CHECK `distancia_dispositivo_rango` de la 0013 admite
 *    NULL). El valor nuevo solo es usable una vez que la transacción que lo agregó hizo COMMIT, y
 *    `aplicarMigraciones` commitea cada migración por separado.
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

const ARCHIVO_0019 = '0019_ubicacion_aproximada.sql';
const numero = (f: string) => f.slice(0, 4);
const METODOS_ESPERADOS = ['gps', 'manual', 'aproximada'];

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Valores del enum `ubicacion_metodo`, en el orden del propio enum (no el alfabético). */
const valoresUbicacionMetodo = async (ex: Ejecutor) =>
  (
    await ex.consultar<{ v: string }>(
      `SELECT e.enumlabel AS v FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'ubicacion_metodo' ORDER BY e.enumsortorder`,
    )
  ).map((f) => f.v);

interface FilaReporte {
  id: string;
  ubicacion_metodo: string;
  precision_gps_m: string | null;
  distancia_dispositivo_m: number | null;
}

/**
 * Un reporte con el método y la precisión/distancia indicados; `publicar_en` es NOT NULL sin DEFAULT
 * desde la 0016. Las columnas son las de la base migrada hasta el final (mismo juego que la 0017).
 */
function insertarReporte(
  ex: Ejecutor,
  metodo: string,
  precisionGps: number | null,
  distancia: number | null,
) {
  return ex.consultar<FilaReporte>(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       precision_gps_m, distancia_dispositivo_m, ubicacion_tipo, descripcion, profundidad_estimada,
       frecuencia, severidad_calculada, severidad_puntaje, publicar_en)
     VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
       'unidad_vecinal:A', $1::ubicacion_metodo, $2, $3, 'via_publica',
       'Reporte para la migración 0019', 'rodilla', 'ocasional', 'media', 6,
       now() + interval '60 seconds')
     RETURNING id::text, ubicacion_metodo::text, precision_gps_m::text, distancia_dispositivo_m`,
    [metodo, precisionGps, distancia],
  );
}

describe('migración 0019 sobre una base en uso (desde 0018)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let hasta0018: ResultadoMigracion;
  let con0019: ResultadoMigracion;
  let valoresAntes: string[];

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    hasta0018 = await aplicarMigraciones(ex, { hasta: '0018' });
    valoresAntes = await valoresUbicacionMetodo(ex);
    con0019 = await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0019_*.sql y se llama 0019_ubicacion_aproximada.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0019')).toEqual([ARCHIVO_0019]);
  });

  it('hasta 0018 la dejó pendiente y la pasada siguiente la aplicó', () => {
    expect(hasta0018.pendientes).toContain(ARCHIVO_0019);
    expect(con0019.aplicadas).toContain(ARCHIVO_0019);
  });

  it('antes de la 0019 el enum no tenía aproximada', () => {
    expect(valoresAntes).toEqual(['gps', 'manual']);
  });

  it('tras migrar el enum ubicacion_metodo incluye aproximada, al final del orden', async () => {
    expect(await valoresUbicacionMetodo(ex)).toEqual(METODOS_ESPERADOS);
  });

  it('acepta un reporte aproximada con precision_gps_m 178 y distancia_dispositivo_m NULL', async () => {
    const [r] = await insertarReporte(ex, 'aproximada', 178, null);
    expect(r?.ubicacion_metodo).toBe('aproximada');
    expect(Number(r?.precision_gps_m)).toBe(178);
    expect(r?.distancia_dispositivo_m).toBeNull();
  });

  it('los métodos anteriores siguen aceptándose', async () => {
    const [gps] = await insertarReporte(ex, 'gps', 12, 8);
    expect(gps?.ubicacion_metodo).toBe('gps');
    const [manual] = await insertarReporte(ex, 'manual', null, 45);
    expect(manual?.ubicacion_metodo).toBe('manual');
  });

  it('volver a migrar no aplica nada y ejecutar el archivo a mano no falla ni duplica el valor', async () => {
    const otra = await aplicarMigraciones(ex);
    expect(otra.aplicadas).toEqual([]);
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0019), 'utf8')),
    );
    expect(await valoresUbicacionMetodo(ex)).toEqual(METODOS_ESPERADOS);
  });
});

describe('migración 0019 desde cero', () => {
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

  it('deja el mismo enum ubicacion_metodo que la base migrada desde 0018', async () => {
    expect(await valoresUbicacionMetodo(ex)).toEqual(METODOS_ESPERADOS);
  });

  it('acepta un reporte aproximada con precision_gps_m 178 y distancia_dispositivo_m NULL', async () => {
    const [r] = await insertarReporte(ex, 'aproximada', 178, null);
    expect(r?.ubicacion_metodo).toBe('aproximada');
    expect(Number(r?.precision_gps_m)).toBe(178);
    expect(r?.distancia_dispositivo_m).toBeNull();
  });
});
