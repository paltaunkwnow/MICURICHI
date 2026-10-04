/**
 * M-2.2: la resolución del ID corto usa el índice de la clave primaria.
 *
 * El rango `id BETWEEN prefijo-0… AND prefijo-f…` sobre la PK (uuid) se resuelve por índice; el
 * `id::text LIKE prefijo || '%'` de antes no puede (el cast tapa el índice) y recorre la tabla.
 * Se compara el EXPLAIN de ambas consultas en una conexión dedicada, con `enable_seqscan` apagado
 * por transacción para que el planificador no elija un recorrido secuencial por ser la tabla chica,
 * y sin dejar el `SET` pegado en la conexión del pool.
 */
import { ejecutorPg } from 'db';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from 'db/test-utils';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rangoDeIdCorto, sqlResolverIdCorto } from '../src/id-reporte.js';
import { condicionPublicado } from '../src/visibilidad.js';

let base: BaseEfimera;
let pool: pg.Pool;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  // Unas cuantas filas para que el EXPLAIN sea sobre una tabla con contenido.
  for (let i = 0; i < 5; i++) await insertarReporte(ex, -63.195 + i * 0.0001, -17.79);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

async function planDe(cliente: pg.PoolClient, sql: string, params: unknown[]): Promise<string> {
  const r = await cliente.query<Record<string, string>>(`EXPLAIN ${sql}`, params);
  return r.rows.map((f) => f['QUERY PLAN']).join('\n');
}

describe('M-2.2: EXPLAIN de la consulta de resolución', () => {
  it('el rango sobre la PK usa el índice; el LIKE de antes, no', async () => {
    const [desde, hasta] = rangoDeIdCorto('abababab');
    const cliente = await pool.connect();
    let planRango: string;
    let planLike: string;
    try {
      // SET LOCAL: vive solo en esta transacción, así no queda pegado en la conexión del pool.
      await cliente.query('BEGIN');
      await cliente.query('SET LOCAL enable_seqscan = off');
      planRango = await planDe(cliente, sqlResolverIdCorto(condicionPublicado('')), [desde, hasta]);
      planLike = await planDe(
        cliente,
        `SELECT id::text FROM reporte_inundacion WHERE id::text LIKE $1 || '%' AND ${condicionPublicado('')} LIMIT 2`,
        ['abababab'],
      );
      await cliente.query('ROLLBACK');
    } finally {
      cliente.release();
    }

    // El rango acota por el índice (Index Cond sobre `id`) y no recorre la tabla.
    expect(planRango, planRango).toContain('Index Cond');
    expect(planRango, planRango).not.toContain('Seq Scan');
    // El LIKE no puede acotar por el índice: no hay ninguna Index Cond; lee toda la relación.
    expect(planLike, planLike).not.toContain('Index Cond');
  });

  it('el SET LOCAL no quedó pegado en el pool', async () => {
    const r = await pool.query<{ enable_seqscan: string }>('SHOW enable_seqscan');
    expect(r.rows[0]!.enable_seqscan).toBe('on');
  });
});
