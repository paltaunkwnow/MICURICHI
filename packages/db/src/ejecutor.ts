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
}

export function ejecutorPg(cliente: Pool | PoolClient): Ejecutor {
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

/** PGlite expone exec (multi-statement) y query (parametrizada). */
export interface ClientePglite {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function ejecutorPglite(db: ClientePglite): Ejecutor {
  return {
    async ejecutar(sql) {
      await db.exec(sql);
    },
    async consultar<T>(sql: string, params: unknown[] = []) {
      const r = await db.query<T>(sql, params);
      return r.rows;
    },
  };
}
