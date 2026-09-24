/**
 * Abstracción mínima sobre `pg` y PGlite para que migraciones y seeds corran igual
 * contra PostGIS en Docker o contra el modo local sin Docker.
 */
import type { Pool, PoolClient } from 'pg';

export interface Ejecutor {
  /** Ejecuta uno o varios statements sin parámetros. */
  ejecutar(sql: string): Promise<void>;
  /** Consulta con parámetros posicionales ($1, $2...). */
  consultar<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Ejecuta `fn` dentro de una transacción sobre UNA conexión dedicada.
   * Es la única forma correcta de agrupar statements: emitir `BEGIN` sobre un `Pool`
   * no abre ninguna transacción, porque cada `query` puede salir por otra conexión.
   */
  transaccion<T>(fn: (ex: Ejecutor) => Promise<T>): Promise<T>;
}

function esPool(c: Pool | PoolClient): c is Pool {
  return typeof (c as Pool).connect === 'function';
}

function ejecutorDeCliente(cliente: PoolClient | Pool): Omit<Ejecutor, 'transaccion'> {
  return {
    async ejecutar(sql) {
      await cliente.query(sql);
    },
    async consultar<T>(sql: string, params: unknown[] = []) {
      const r = await cliente.query(sql, params);
      return r.rows as T[];
    },
  };
}

async function enTransaccion<T>(cliente: PoolClient | Pool, fn: (ex: Ejecutor) => Promise<T>) {
  const base = ejecutorDeCliente(cliente);
  const ex: Ejecutor = { ...base, transaccion: (f) => f(ex) }; // anidar reutiliza la misma conexión
  await base.ejecutar('BEGIN');
  try {
    const r = await fn(ex);
    await base.ejecutar('COMMIT');
    return r;
  } catch (e) {
    await base.ejecutar('ROLLBACK').catch(() => {});
    throw e;
  }
}

export function ejecutorPg(cliente: Pool | PoolClient): Ejecutor {
  return {
    ...ejecutorDeCliente(cliente),
    async transaccion<T>(fn: (ex: Ejecutor) => Promise<T>): Promise<T> {
      if (!esPool(cliente)) return enTransaccion(cliente, fn);
      const dedicado = await cliente.connect();
      try {
        return await enTransaccion(dedicado, fn);
      } finally {
        dedicado.release();
      }
    },
  };
}

/** PGlite expone exec (multi-statement) y query (parametrizada). */
export interface ClientePglite {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function ejecutorPglite(db: ClientePglite): Ejecutor {
  const base = {
    async ejecutar(sql: string) {
      await db.exec(sql);
    },
    async consultar<T>(sql: string, params: unknown[] = []) {
      const r = await db.query<T>(sql, params);
      return r.rows;
    },
  };
  // PGlite es de conexión única: BEGIN/COMMIT sobre `db` sí forman una transacción real.
  const ex: Ejecutor = {
    ...base,
    async transaccion<T>(fn: (e: Ejecutor) => Promise<T>): Promise<T> {
      await base.ejecutar('BEGIN');
      try {
        const r = await fn(ex);
        await base.ejecutar('COMMIT');
        return r;
      } catch (e) {
        await base.ejecutar('ROLLBACK').catch(() => {});
        throw e;
      }
    },
  };
  return ex;
}
