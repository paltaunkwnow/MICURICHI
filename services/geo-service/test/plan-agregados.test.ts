/**
 * La consulta EXACTA de los agregados usa el índice parcial `reporte_agregado_uv` (migración 0015,
 * ampliado en la 0020 con `categoria` en el INCLUDE). El índice solo sirve si la condición es un
 * literal que implica su predicado: con `estado = ANY($n)` PostgreSQL no lo puede demostrar y
 * recorre la tabla entera. Desde M3.4 la consulta filtra además por `categoria = $1` (la ruta pasa
 * el slug): `categoria` está en el INCLUDE, de modo que sigue siendo un Index Only Scan (el filtro
 * de categoría se resuelve como Filter sobre la columna incluida). Base propia: necesita miles de
 * filas para que el planificador elija el índice.
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
  // Las filas rechazado/duplicado llevan estado_motivo no vacío: la migración 0018 lo exige
  // (CHECK motivo_en_rechazo_y_duplicado). El índice del estado es 1 + i % 5, así que duplicado
  // cae en i % 5 = 2 y rechazado en i % 5 = 3. fusionado_en_id queda null en todas las filas.
  await pool.query(`
    INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id,
      ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
      severidad_calculada, severidad_puntaje, estado, estado_motivo, publicar_en)
    SELECT g.p, g.p, 'distrito_municipal:01',
           (ARRAY['unidad_vecinal:A', 'unidad_vecinal:B', 'unidad_vecinal:C'])[1 + i % 3],
           'gps', 'via_publica', 'Reporte sintético para el plan', 'rodilla', 'ocasional',
           'media', 6,
           (ARRAY['nuevo', 'validado', 'duplicado', 'rechazado', 'resuelto']::estado_reporte[])[1 + i % 5],
           CASE WHEN i % 5 IN (2, 3) THEN 'Dato sintético para el plan' ELSE NULL END,
           now()
      FROM generate_series(1, 4000) AS i,
           LATERAL (SELECT ST_SetSRID(ST_MakePoint(-63.2 + (i % 100) * 0.0003,
                                                   -17.8 + (i / 100) * 0.0005), 4326) AS p) AS g`);
  // Deja el mapa de visibilidad al día para el Index Only Scan. Se hace sobre `reporte` (la tabla
  // real desde la 0020; `reporte_inundacion` es una vista y VACUUM sobre una vista no hace nada).
  await pool.query('VACUUM ANALYZE reporte');
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
    // Con el parámetro ligado a 'inundacion' (todas las filas insertadas son de esa categoría), el
    // EXPLAIN planifica con el valor real: igual que lo ejecuta la ruta.
    const r = await cliente.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${SQL_AGREGADOS_UV}`, [
      'inundacion',
    ]);
    const plan = r.rows.map((f) => f['QUERY PLAN']).join('\n');
    expect(plan, plan).toMatch(/Index Only Scan using reporte_agregado_uv/);
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});
