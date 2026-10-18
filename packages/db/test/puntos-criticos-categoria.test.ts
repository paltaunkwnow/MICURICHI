/**
 * Recurrencia espacial POR CATEGORÍA (CLAUDE.md §9.2, ADR 0009/0013). El agrupamiento —completo e
 * incremental— nunca cruza categorías y usa el radio de recurrencia de CADA definición. Un registro
 * sintético (inundación radio 25, bache radio 30) permite probar una segunda categoría sin tocar
 * `contracts`. Una categoría presente en los datos pero sin definición en el registro no se agrupa.
 */
import { crearRegistroCategorias, DEFINICION_INUNDACION } from 'contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPg } from '../src/ejecutor.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from '../src/puntos-criticos-entorno.js';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from '../src/test-utils.js';

let base: BaseEfimera;
let pool: pg.Pool;
let ex: Ejecutor;

/** Registro sintético: inundación con su radio real (25 m) y un «bache» con radio 30 m. */
const DEF_BACHE = { ...DEFINICION_INUNDACION, slug: 'bache', recurrenciaRadioM: 30 };
const REGISTRO_SINTETICO = crearRegistroCategorias([DEFINICION_INUNDACION, DEF_BACHE]);

/** Punto base dentro de la UV A de las capas de prueba, y su CRS métrico (UTM 20S). */
const BASE = { lon: -63.195, lat: -17.79 };
const CRS = 32720;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 2 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM reporte');
  await pool.query('DELETE FROM punto_critico');
});

/** Inserta un reporte de `categoria` desplazado (dx, dy) metros en el CRS métrico desde BASE. */
async function crear(
  categoria: 'inundacion' | 'bache',
  dx: number,
  dy: number,
  estado = 'validado',
): Promise<string> {
  const geom = `ST_Transform(ST_Translate(ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),${CRS}),$3,$4),4326)`;
  const publico = `ST_SetSRID(ST_MakePoint(round(ST_X(g)::numeric,5)::float8, round(ST_Y(g)::numeric,5)::float8),4326)`;
  const sql =
    categoria === 'inundacion'
      ? `WITH p AS (SELECT ${geom} AS g)
         INSERT INTO reporte (geom, geom_publico, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
           descripcion, profundidad_estimada, frecuencia, causa_presunta, severidad_calculada, severidad_puntaje,
           severidad_version, estado, publicar_en)
         SELECT g, ${publico}, 'distrito_municipal:01','unidad_vecinal:A','manual','via_publica',
           'Sintético inundación','rodilla','ocasional','desconocida','media',6,2,$5::estado_reporte, now()
         FROM p RETURNING id::text`
      : `WITH p AS (SELECT ${geom} AS g)
         INSERT INTO reporte (geom, geom_publico, categoria, detalle, detalle_version, causa_presunta, distrito_id,
           unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion, severidad_calculada, severidad_puntaje,
           severidad_version, estado, publicar_en)
         SELECT g, ${publico}, 'bache', '{"sintetico": true}'::jsonb, 1, NULL, 'distrito_municipal:01',
           'unidad_vecinal:A','manual','via_publica','Sintético bache','media',6,1,$5::estado_reporte, now()
         FROM p RETURNING id::text`;
  const r = await pool.query<{ id: string }>(sql, [BASE.lon, BASE.lat, dx, dy, estado]);
  return r.rows[0]!.id;
}

/** Partición de los reportes activos de `categoria`, en forma comparable. */
async function particionDe(categoria: string): Promise<string[][]> {
  const r = await pool.query<{ pc: string | null; id: string }>(
    `SELECT punto_critico_id::text AS pc, id::text FROM reporte
     WHERE categoria = $1 AND estado IN ('validado','resuelto') ORDER BY id`,
    [categoria],
  );
  const grupos = new Map<string, string[]>();
  for (const f of r.rows) {
    const clave = f.pc ?? `SIN_PUNTO:${f.id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f.id]);
  }
  return [...grupos.values()].map((g) => g.sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
}

/** Puntos críticos actuales con su categoría y cantidad de reportes. */
async function puntos(): Promise<Array<{ categoria: string; n: number }>> {
  const r = await pool.query<{ categoria: string; n: string }>(
    'SELECT categoria, n_reportes::text AS n FROM punto_critico ORDER BY categoria',
  );
  return r.rows.map((f) => ({ categoria: f.categoria, n: Number(f.n) }));
}

describe('el agrupamiento no cruza categorías (recálculo completo)', () => {
  it('un bache y una inundación a 5 m NO forman grupo, y cada punto lleva su categoría', async () => {
    const inund = await crear('inundacion', 0, 0);
    const bache = await crear('bache', 5, 0); // 5 m al este: dentro de cualquier radio, pero otra categoría
    const r = await recalcularPuntosCriticos(ex, undefined, undefined, REGISTRO_SINTETICO);
    expect(r.categoriasSinDefinicion).toBeUndefined();

    // Dos puntos críticos distintos, uno por categoría, cada uno con su único reporte.
    expect(await particionDe('inundacion')).toEqual([[inund]]);
    expect(await particionDe('bache')).toEqual([[bache]]);
    expect(await puntos()).toEqual([
      { categoria: 'bache', n: 1 },
      { categoria: 'inundacion', n: 1 },
    ]);
  });

  it('usa el radio de CADA definición: a 28 m, los baches (r=30) se unen y las inundaciones (r=25) no', async () => {
    // Par de inundaciones a 28 m en BASE; par de baches a 28 m, desplazado 500 m para no interferir.
    await crear('inundacion', 0, 0);
    await crear('inundacion', 28, 0);
    await crear('bache', 500, 0);
    await crear('bache', 528, 0);
    await recalcularPuntosCriticos(ex, undefined, undefined, REGISTRO_SINTETICO);

    expect(await particionDe('inundacion')).toHaveLength(2); // 28 m > 25 m: separados
    expect(await particionDe('bache')).toHaveLength(1); // 28 m < 30 m: unidos
    expect(await puntos()).toEqual([
      { categoria: 'bache', n: 2 },
      { categoria: 'inundacion', n: 1 },
      { categoria: 'inundacion', n: 1 },
    ]);
  });

  it('el recálculo de inundación da los mismos grupos que antes (radio 25, datos fijos)', async () => {
    // Comportamiento previo al cambio: inundación a radio 25. a–b a ~11 m (juntos); c a ~210 m (aparte).
    const a = await crear('inundacion', 0, 0);
    const b = await crear('inundacion', 0, 11);
    const c = await crear('inundacion', 210, 0);
    await recalcularPuntosCriticos(ex); // registro real: solo inundación, radio 25
    expect(await particionDe('inundacion')).toEqual(
      [[a, b].sort(), [c]].sort((x, y) => x[0]!.localeCompare(y[0]!)),
    );
  });
});

describe('el recálculo incremental no cruza categorías', () => {
  it('recalcular el entorno de un bache no toca la inundación vecina, y viceversa', async () => {
    const inund = await crear('inundacion', 0, 0);
    const bache = await crear('bache', 5, 0);

    // Solo el entorno del bache: crea el punto del bache; la inundación sigue sin agrupar.
    const rb = await recalcularEntornoDeReporte(
      ex,
      bache,
      undefined,
      undefined,
      REGISTRO_SINTETICO,
    );
    expect(rb.puntos).toBe(1);
    expect(await particionDe('bache')).toEqual([[bache]]);
    const tras1 = await pool.query<{ pc: string | null }>(
      'SELECT punto_critico_id::text AS pc FROM reporte WHERE id = $1',
      [inund],
    );
    expect(tras1.rows[0]?.pc, 'la inundación no debe agruparse al recalcular el bache').toBeNull();

    // Ahora el entorno de la inundación: su propio punto, sin absorber el bache a 5 m.
    const ri = await recalcularEntornoDeReporte(
      ex,
      inund,
      undefined,
      undefined,
      REGISTRO_SINTETICO,
    );
    expect(ri.puntos).toBe(1);
    expect(await particionDe('inundacion')).toEqual([[inund]]);
    expect(await puntos()).toEqual([
      { categoria: 'bache', n: 1 },
      { categoria: 'inundacion', n: 1 },
    ]);
  });
});

describe('una categoría sin definición en el registro no se agrupa (fail-closed, §9.2)', () => {
  it('el recálculo completo agrupa la inundación y deja el bache sin punto crítico', async () => {
    // Registro REAL (REGISTRO_CATEGORIAS): solo inundación tiene definición; «bache» no.
    const bache = await crear('bache', 0, 0);
    const inund = await crear('inundacion', 10, 0);
    const r = await recalcularPuntosCriticos(ex);

    expect(r.categoriasSinDefinicion).toEqual(['bache']);
    expect(await particionDe('inundacion')).toEqual([[inund]]);
    // El bache queda sin agrupar: su punto_critico_id es NULL y no hay ningún punto de categoría bache.
    const b = await pool.query<{ pc: string | null }>(
      'SELECT punto_critico_id::text AS pc FROM reporte WHERE id = $1',
      [bache],
    );
    expect(b.rows[0]?.pc).toBeNull();
    expect(await puntos()).toEqual([{ categoria: 'inundacion', n: 1 }]);
  });

  it('el recálculo incremental de un bache sin definición no lo agrupa', async () => {
    const bache = await crear('bache', 0, 0);
    const r = await recalcularEntornoDeReporte(ex, bache); // registro real: bache sin definición
    expect(r.puntos).toBe(0);
    expect(await puntos()).toEqual([]);
    const b = await pool.query<{ pc: string | null }>(
      'SELECT punto_critico_id::text AS pc FROM reporte WHERE id = $1',
      [bache],
    );
    expect(b.rows[0]?.pc).toBeNull();
  });
});
