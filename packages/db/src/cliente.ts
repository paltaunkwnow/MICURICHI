import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as esquema from './esquema/index.js';

export const DATABASE_URL_LOCAL = 'postgresql://curichi:curichi@127.0.0.1:5433/curichi';

export function urlBaseDeDatos(): string {
  return process.env.DATABASE_URL ?? DATABASE_URL_LOCAL;
}

export function crearPool(url = urlBaseDeDatos(), max = 4): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 10_000 });
  pool.on('error', (e) => console.error('[db] error en el pool:', e.message));
  return pool;
}

export type BaseDeDatos = ReturnType<typeof crearDrizzle>;

export function crearDrizzle(pool: pg.Pool) {
  return drizzle(pool, { schema: esquema });
}

/** Espera a que la base responda (útil mientras arranca el modo local o Docker). */
export async function esperarBaseDeDatos(
  pool: pg.Pool,
  intentos = 40,
  esperaMs = 750,
): Promise<void> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      ultimo = e;
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
  throw new Error(
    `Base de datos no disponible tras ${intentos} intentos: ${(ultimo as Error)?.message}`,
  );
}

export { esquema };
