/**
 * Regresión del bug de transacciones: `recalcularPuntosCriticos` y `aplicarMigraciones`
 * emitían BEGIN/COMMIT llamando a `pool.query`. En un Pool cada query puede salir por una
 * conexión distinta, así que no había transacción: un fallo a mitad dejaba `punto_critico`
 * borrada y conexiones colgadas en "idle in transaction".
 *
 * Se prueba con un Pool falso porque la base local (PGlite) multiplexa todas las conexiones
 * sobre un único backend y no puede reproducir el escenario de varias conexiones reales.
 */
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { ejecutorPg } from '../src/ejecutor.js';

interface Registro {
  destino: 'pool' | 'cliente';
  sql: string;
}

function poolFalso() {
  const registro: Registro[] = [];
  let liberado = false;
  const cliente = {
    query: async (sql: string) => {
      registro.push({ destino: 'cliente', sql: String(sql).split(' ')[0] ?? '' });
      if (String(sql).includes('EXPLOTA')) throw new Error('fallo a mitad');
      return { rows: [] };
    },
    release: () => {
      liberado = true;
    },
  } as unknown as PoolClient;
  const pool = {
    query: async (sql: string) => {
      registro.push({ destino: 'pool', sql: String(sql).split(' ')[0] ?? '' });
      return { rows: [] };
    },
    connect: async () => cliente,
  } as unknown as Pool;
  return { pool, registro, liberado: () => liberado };
}

describe('Ejecutor.transaccion', () => {
  it('abre BEGIN/COMMIT sobre una conexión dedicada, no sobre el pool', async () => {
    const { pool, registro, liberado } = poolFalso();
    const r = await ejecutorPg(pool).transaccion(async (tx) => {
      await tx.consultar('INSERT INTO x VALUES (1)');
      return 'listo';
    });
    expect(r).toBe('listo');
    expect(registro.map((x) => x.sql)).toEqual(['BEGIN', 'INSERT', 'COMMIT']);
    // Ninguna sentencia de la transacción puede haber salido por el pool.
    expect(registro.every((x) => x.destino === 'cliente')).toBe(true);
    expect(liberado()).toBe(true);
  });

  it('hace ROLLBACK y devuelve la conexión si la función falla', async () => {
    const { pool, registro, liberado } = poolFalso();
    await expect(
      ejecutorPg(pool).transaccion(async (tx) => {
        await tx.consultar('EXPLOTA');
      }),
    ).rejects.toThrow('fallo a mitad');
    expect(registro.map((x) => x.sql)).toEqual(['BEGIN', 'EXPLOTA', 'ROLLBACK']);
    expect(liberado()).toBe(true);
  });

  it('una transacción anidada reutiliza la conexión sin volver a abrir BEGIN', async () => {
    const { pool, registro } = poolFalso();
    await ejecutorPg(pool).transaccion(async (tx) => {
      await tx.transaccion(async (interna) => {
        await interna.consultar('UPDATE y SET a = 1');
      });
    });
    expect(registro.map((x) => x.sql)).toEqual(['BEGIN', 'UPDATE', 'COMMIT']);
  });

  it('sobre un PoolClient ya dedicado no pide otra conexión', async () => {
    const registro: string[] = [];
    const cliente = {
      query: async (sql: string) => {
        registro.push(String(sql).split(' ')[0] ?? '');
        return { rows: [] };
      },
    } as unknown as PoolClient;
    await ejecutorPg(cliente).transaccion(async (tx) => {
      await tx.consultar('DELETE FROM z');
    });
    expect(registro).toEqual(['BEGIN', 'DELETE', 'COMMIT']);
  });
});
