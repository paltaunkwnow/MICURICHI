import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as esquema from './esquema/index.js';

export const DATABASE_URL_LOCAL = 'postgresql://curichi:curichi@127.0.0.1:5433/curichi';

export function urlBaseDeDatos(): string {
  return process.env.DATABASE_URL ?? DATABASE_URL_LOCAL;
}

/**
 * Tamaño del pool por proceso. Estaba fijo en 4 y no había forma de tocarlo sin recompilar,
 * que es justo lo que hay que ajustar al añadir réplicas: el techo real es
 * `réplicas × DB_POOL_MAX` contra el `max_connections` de PostgreSQL (100 en el Compose).
 */
export const POOL_MAX_POR_DEFECTO = 8;

export interface OpcionesPool {
  max?: number;
  /** Corta consultas que se van de madre; 0 = sin límite (lo deja al servidor). */
  statementTimeoutMs?: number;
  /** Mata transacciones abiertas y olvidadas, que bloquean el VACUUM de sus tablas. */
  idleEnTransaccionMs?: number;
  /** Plazo para conseguir una conexión del pool antes de fallar, en vez de esperar sin fin. */
  esperaConexionMs?: number;
}

/**
 * Los timeouts se aplican en el propio pool y no solo en el servidor porque el modo local sin
 * Docker (PGlite) no los tiene configurados: así una consulta patológica se corta igual venga
 * de donde venga. Los valores por defecto coinciden con los del Compose a propósito.
 */
export function crearPool(url = urlBaseDeDatos(), opciones: number | OpcionesPool = {}): pg.Pool {
  const o: OpcionesPool = typeof opciones === 'number' ? { max: opciones } : opciones;
  const max = o.max ?? Number(process.env.DB_POOL_MAX ?? POOL_MAX_POR_DEFECTO);
  const statement = o.statementTimeoutMs ?? Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000);
  const idleTx = o.idleEnTransaccionMs ?? Number(process.env.DB_IDLE_TX_TIMEOUT_MS ?? 60_000);
  const pool = new pg.Pool({
    connectionString: url,
    max: max > 0 ? max : POOL_MAX_POR_DEFECTO,
    idleTimeoutMillis: 10_000,
    // Sin esto, cuando el pool está agotado la petición espera indefinidamente y el cliente ve
    // un cuelgue en vez de un error: con 10 s falla rápido y el balanceador puede reaccionar.
    connectionTimeoutMillis:
      o.esperaConexionMs ?? Number(process.env.DB_ESPERA_CONEXION_MS ?? 10_000),
    ...(statement > 0 ? { statement_timeout: statement } : {}),
    ...(idleTx > 0 ? { idle_in_transaction_session_timeout: idleTx } : {}),
  });
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
