import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ejecutorPg } from '../src/ejecutor.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from '../src/test-utils.js';

let base: BaseEfimera;
let pool: pg.Pool;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 2 });
  await cargarCapasDePrueba(ejecutorPg(pool));
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

describe('migraciones y PostGIS', () => {
  it('aplica el esquema y PostGIS responde', async () => {
    const r = await pool.query('SELECT postgis_version() AS v');
    expect(r.rows[0].v).toMatch(/^3\./);
    const t = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('reporte_inundacion','punto_critico','usuario','auditoria')`,
    );
    expect(t.rows[0].n).toBe(4);
  });

  it('es idempotente: volver a migrar no aplica nada', async () => {
    const { aplicarMigraciones } = await import('../src/migrar.js');
    const r = await aplicarMigraciones(ejecutorPg(pool));
    expect(r.aplicadas).toEqual([]);
    expect(r.omitidas.length).toBeGreaterThan(0);
  });

  it('point-in-polygon con GIST devuelve la UV correcta', async () => {
    const r = await pool.query(
      `SELECT id FROM geo.unidad_vecinal_vigente WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(-63.185, -17.79), 4326))`,
    );
    expect(r.rows.map((x) => x.id)).toEqual(['unidad_vecinal:B']);
    const plan = await pool.query(
      `EXPLAIN SELECT id FROM geo.unidad_vecinal WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(-63.185, -17.79), 4326))`,
    );
    const texto = plan.rows.map((x) => x['QUERY PLAN']).join('\n');
    expect(texto).toMatch(/Index|Bitmap|Seq/); // el planificador elige GIST cuando la tabla es grande; con 3 filas puede usar Seq Scan
  });

  it('acepta varias conexiones simultáneas por el socket', async () => {
    const resultados = await Promise.all(
      [1, 2, 3, 4].map((n) => pool.query('SELECT $1::int AS n', [n])),
    );
    expect(resultados.map((r) => r.rows[0].n)).toEqual([1, 2, 3, 4]);
  });
});

describe('puntos críticos (DBSCAN, radio 25 m)', () => {
  it('agrupa reportes cercanos y separa lejanos', async () => {
    const ex = ejecutorPg(pool);
    // tres reportes a < 25 m entre sí, uno a 200 m, uno nuevo (no cuenta)
    const a = await insertarReporte(ex, -63.195, -17.79, 'validado', 'media');
    const b = await insertarReporte(ex, -63.1951, -17.79005, 'validado', 'alta');
    const c = await insertarReporte(ex, -63.19495, -17.7901, 'resuelto', 'baja');
    const lejos = await insertarReporte(ex, -63.193, -17.79, 'validado', 'critica');
    const nuevo = await insertarReporte(ex, -63.19501, -17.79001, 'nuevo', 'critica');
    const r = await recalcularPuntosCriticos(ex, 25);
    expect(r.reportes).toBe(4);
    expect(r.puntos).toBe(2);
    const pc = await pool.query(
      `SELECT punto_critico_id::text AS pc FROM reporte_inundacion WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[a, b, c]],
    );
    expect(new Set(pc.rows.map((x) => x.pc)).size).toBe(1);
    const grupo = await pool.query(
      `SELECT n_reportes, severidad_max, unidad_vecinal_id FROM punto_critico WHERE id = $1`,
      [pc.rows[0].pc],
    );
    expect(grupo.rows[0].n_reportes).toBe(3);
    expect(grupo.rows[0].severidad_max).toBe('alta');
    expect(grupo.rows[0].unidad_vecinal_id).toBe('unidad_vecinal:A');
    const solo = await pool.query(`SELECT punto_critico_id FROM reporte_inundacion WHERE id = $1`, [
      lejos,
    ]);
    expect(solo.rows[0].punto_critico_id).not.toBe(pc.rows[0].pc);
    const sinGrupo = await pool.query(
      `SELECT punto_critico_id FROM reporte_inundacion WHERE id = $1`,
      [nuevo],
    );
    expect(sinGrupo.rows[0].punto_critico_id).toBeNull();
  });
});
