/**
 * La consulta EXACTA de los agregados usa el índice parcial `reporte_agregado_uv` (migración
 * 0015). El índice solo sirve si la condición es un literal que implica su predicado: con
 * `estado = ANY($n)` PostgreSQL no lo puede demostrar y recorre la tabla entera. Base propia:
 * necesita miles de filas para que el planificador elija el índice.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { SQL_AGREGADOS_UV } from '../src/visibilidad.js';

let base: BaseEfimera;
let pool: pg.Pool;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 1 });
  await cargarCapasDePrueba(ejecutorPg(pool));
  await pool.query(`
    INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id,
      ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
      severidad_calculada, severidad_puntaje, estado, publicar_en)
    SELECT g.p, g.p, 'distrito_municipal:01',
           (ARRAY['unidad_vecinal:A', 'unidad_vecinal:B', 'unidad_vecinal:C'])[1 + i % 3],
           'gps', 'via_publica', 'Reporte sintético para el plan', 'rodilla', 'ocasional',
           'media', 6,
           (ARRAY['nuevo', 'validado', 'duplicado', 'rechazado', 'resuelto']::estado_reporte[])[1 + i % 5],
           now()
      FROM generate_series(1, 4000) AS i,
           LATERAL (SELECT ST_SetSRID(ST_MakePoint(-63.2 + (i % 100) * 0.0003,
                                                   -17.8 + (i / 100) * 0.0005), 4326) AS p) AS g`);
  // Deja el mapa de visibilidad al día para el Index Only Scan.
  await pool.query('VACUUM ANALYZE reporte_inundacion');
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

it('los agregados por UV son un Index Only Scan sobre reporte_agregado_uv', async () => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Sin recorrido secuencial ni por mapa de bits: queda ver cuál de los índices elige.
    await cliente.query('SET LOCAL enable_seqscan = off');
    await cliente.query('SET LOCAL enable_bitmapscan = off');
    const r = await cliente.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${SQL_AGREGADOS_UV}`);
    const plan = r.rows.map((f) => f['QUERY PLAN']).join('\n');
    expect(plan, plan).toMatch(/Index Only Scan using reporte_agregado_uv/);
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});
