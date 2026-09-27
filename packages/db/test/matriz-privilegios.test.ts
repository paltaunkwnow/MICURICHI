/**
 * La matriz de privilegios de `pnpm privilegios` (src/cli/verificar-privilegios.mjs) tiene que
 * nombrar TODAS las tablas del esquema, para los dos roles de aplicación.
 *
 * El script corre contra PostgreSQL real, porque PGlite no tiene roles, así que una tabla nueva
 * que nadie agregó a la matriz solo se notaba al ejecutarlo contra Docker. Esta prueba lo adelanta:
 * cada tabla de una base migrada desde cero tiene que tener una decisión escrita (aunque sea «nada»)
 * para curichi_api y para curichi_geo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLUMNAS_ESPERADAS, ESPERADO } from '../src/cli/matriz-privilegios.mjs';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import { aplicarMigraciones } from '../src/migrar.js';

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

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

describe('matriz de privilegios', () => {
  it('cada tabla de public y geo tiene una decisión para curichi_api y para curichi_geo', async () => {
    const tablas = (
      await ex.consultar<{ t: string }>(
        `SELECT schemaname || '.' || tablename AS t FROM pg_tables
          WHERE schemaname IN ('public', 'geo') ORDER BY 1`,
      )
    ).map((f) => f.t);
    for (const rol of ['curichi_api', 'curichi_geo'] as const) {
      const faltan = tablas.filter((t) => ESPERADO[rol][t] === undefined);
      expect(faltan, `tablas sin decisión para ${rol}`).toEqual([]);
    }
  });

  it('cuota_reporte_diaria (0014): api-core cuenta, reserva, libera y limpia; geo-service nada', () => {
    expect(ESPERADO.curichi_api['public.cuota_reporte_diaria']).toEqual([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
    ]);
    expect(ESPERADO.curichi_geo['public.cuota_reporte_diaria']).toEqual([]);
  });

  it('los privilegios por columna de usuario: api-core no escribe rol, y desde la 0016 tampoco ultimo_reporte_en', () => {
    expect(COLUMNAS_ESPERADAS.curichi_api['public.usuario']).toEqual({
      INSERT: ['email', 'nombre', 'password_hash'],
      UPDATE: ['password_hash'],
    });
  });

  it('cada columna de la matriz existe en la base migrada desde cero', async () => {
    // Una columna borrada por una migración que siguiera en la matriz haría fallar `pnpm privilegios`
    // con un FALTA que no se puede arreglar concediendo nada.
    for (const [rol, tablas] of Object.entries(COLUMNAS_ESPERADAS))
      for (const [tabla, ops] of Object.entries(
        tablas as Record<string, Record<string, string[]>>,
      )) {
        const existentes = (
          await ex.consultar<{ c: string }>(
            `SELECT column_name AS c FROM information_schema.columns
              WHERE table_schema = split_part($1, '.', 1) AND table_name = split_part($1, '.', 2)`,
            [tabla],
          )
        ).map((f) => f.c);
        for (const [op, columnas] of Object.entries(ops))
          expect(
            columnas.filter((c) => !existentes.includes(c)),
            `${rol} · ${tabla} · ${op}`,
          ).toEqual([]);
      }
  });
});
