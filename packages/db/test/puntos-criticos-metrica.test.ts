/**
 * Recurrencia espacial (CLAUDE.md §9.2): UNA sola métrica, en metros, en los tres caminos que
 * agrupan reportes: el recálculo completo con `ST_ClusterDBSCAN`, su equivalente en Node (cuando la
 * build de PostGIS no trae DBSCAN) y el recálculo incremental de la vecindad de un reporte.
 *
 * El defecto que fija esta prueba (revisión de producción, 2026-09-26): el completo agrupaba con
 * `eps` en GRADOS (25 / 111 320) y el incremental con `ST_DWithin` en geography (25 m). En Santa
 * Cruz un grado de longitud mide ~106 km, así que el completo solo unía de este a oeste hasta
 * ~23,8 m y de norte a sur hasta ~24,86 m, mientras el incremental unía hasta 25 m: dos reportes a
 * 24,4 m daban 2 puntos críticos con uno y 1 con el otro, según qué camino hubiera corrido último.
 * Y el prefiltro del incremental (`ST_Expand` en grados × 1,05) razonaba al revés: fuera del
 * ecuador un grado de longitud mide MENOS metros, así que a −18° ya no cubría los 25 m y en una
 * ciudad a −34° (una instalación por ciudad) se quedaba en ~21,6 m.
 *
 * Los pares se construyen desplazando el punto en el CRS métrico (UTM), que es la métrica que
 * pide §9.2 (`ST_Transform(geom, <CRS métrico>)`); además se comprueba que esa distancia es de
 * verdad la geodésica en metros, con el margen del factor de escala de UTM.
 */
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ejecutor, ejecutorPg } from '../src/ejecutor.js';
import { listarMigraciones } from '../src/migrar.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from '../src/puntos-criticos-entorno.js';
import { type BaseEfimera, insertarReporte, levantarBaseEfimera } from '../src/test-utils.js';

let base: BaseEfimera;
let pool: pg.Pool;
let ex: Ejecutor;
const crsOriginal = process.env.CRS_METRICO_EPSG;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 2 });
  ex = ejecutorPg(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await limpiarInundaciones();
});

async function limpiarInundaciones() {
  await pool.query("DELETE FROM reporte WHERE categoria = 'inundacion'");
  await pool.query("DELETE FROM punto_critico WHERE categoria = 'inundacion'");
}

afterEach(() => {
  if (crsOriginal === undefined) delete process.env.CRS_METRICO_EPSG;
  else process.env.CRS_METRICO_EPSG = crsOriginal;
});

/** Santa Cruz de la Sierra, dentro de la UV A de las capas de prueba. */
const SANTA_CRUZ = { lon: -63.195, lat: -17.79, crs: 32720 };
/** Otra ciudad, mucho más lejos del ecuador (Buenos Aires, UTM 21S): una instalación por ciudad. */
const OTRA_CIUDAD = { lon: -58.4, lat: -34.6, crs: 32721 };

type Eje = 'este-oeste' | 'norte-sur';

/** Inserta un reporte validado desplazado (dx, dy) metros en el CRS métrico `crs`. */
async function crearDesplazado(
  origen: { lon: number; lat: number },
  crs: number,
  dx: number,
  dy: number,
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO reporte (categoria, geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
       descripcion, detalle, detalle_version, severidad_calculada, severidad_puntaje,
       severidad_version, estado, publicar_en)
     VALUES ('inundacion', ST_Transform(ST_Translate(ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::int), $4, $5), 4326),
       'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica',
       'Reporte de prueba de la metrica de recurrencia', '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb, 1, 'media', 6, 2, 'validado', now())
     RETURNING id::text`,
    [origen.lon, origen.lat, crs, dx, dy],
  );
  return r.rows[0]!.id;
}

/** Par de reportes a `d` metros (en el CRS métrico `crs`) sobre el eje pedido. */
async function crearPar(origen: { lon: number; lat: number }, crs: number, d: number, eje: Eje) {
  const a = await crearDesplazado(origen, crs, 0, 0);
  const b = await crearDesplazado(
    origen,
    crs,
    eje === 'este-oeste' ? d : 0,
    eje === 'norte-sur' ? d : 0,
  );
  const [m] = await medirPar(a, b, crs);
  // El par está donde dice la prueba, y «metros» son metros de verdad (UTM escala ≤ 0,04 %).
  expect(Number(m!.metrica)).toBeCloseTo(d, 6);
  expect(Math.abs(Number(m!.geodesica) - d)).toBeLessThan(0.05);
  return { a, b };
}

async function medirPar(a: string, b: string, crs: number) {
  return (
    await pool.query<{ metrica: number; geodesica: number }>(
      `SELECT ST_Distance(ST_Transform(a.geom, $3::int), ST_Transform(b.geom, $3::int)) AS metrica,
              ST_Distance(a.geom::geography, b.geom::geography) AS geodesica
         FROM reporte a, reporte b WHERE a.categoria = 'inundacion' AND b.categoria = 'inundacion'
           AND a.id = $1 AND b.id = $2`,
      [a, b, crs],
    )
  ).rows;
}

/** Partición actual de los reportes activos, en forma comparable. */
async function particion(): Promise<string[][]> {
  const r = await pool.query<{ pc: string | null; id: string }>(
    `SELECT punto_critico_id::text AS pc, id::text FROM reporte
     WHERE categoria = 'inundacion' AND estado IN ('validado','resuelto') ORDER BY id`,
  );
  const grupos = new Map<string, string[]>();
  for (const f of r.rows) {
    const clave = f.pc ?? `SIN_PUNTO:${f.id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f.id]);
  }
  return [...grupos.values()].map((g) => g.sort()).sort((x, y) => x[0]!.localeCompare(y[0]!));
}

/** El mismo ejecutor, pero como una build de PostGIS sin `ST_ClusterDBSCAN` (SQLSTATE 42883). */
function sinDbscan(e: Ejecutor): Ejecutor {
  return {
    ejecutar: (sql) => e.ejecutar(sql),
    async consultar<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (/ST_ClusterDBSCAN/i.test(sql))
        throw Object.assign(new Error('function st_clusterdbscan does not exist'), {
          code: '42883',
        });
      return e.consultar<T>(sql, params);
    },
    transaccion: (fn) => e.transaccion((tx) => fn(sinDbscan(tx))),
  };
}

/**
 * Agrupa el par por los tres caminos y devuelve sus particiones. El incremental va primero: el
 * completo rehace la tabla y taparía lo que dejó el otro.
 */
async function losTresCaminos(a: string, b: string) {
  await recalcularEntornoDeReporte(ex, a);
  await recalcularEntornoDeReporte(ex, b);
  const incremental = await particion();

  const postgis = await recalcularPuntosCriticos(ex);
  expect(postgis.motor).toBe('postgis');
  const completo = await particion();

  const node = await recalcularPuntosCriticos(sinDbscan(ex));
  expect(node.motor).toBe('node');
  const enNode = await particion();

  return { incremental, completo, enNode };
}

describe('misma métrica en los tres caminos de la recurrencia (§9.2, radio 25 m)', () => {
  const casos: Array<{ d: number; eje: Eje; grupos: number }> = [
    { d: 24.0, eje: 'este-oeste', grupos: 1 },
    { d: 24.9, eje: 'este-oeste', grupos: 1 },
    { d: 25.1, eje: 'este-oeste', grupos: 2 },
    { d: 24.0, eje: 'norte-sur', grupos: 1 },
    { d: 24.9, eje: 'norte-sur', grupos: 1 },
    { d: 25.1, eje: 'norte-sur', grupos: 2 },
  ];

  it.each(casos)(
    'par a $d m en $eje: completo, incremental y DBSCAN en Node dan $grupos grupo(s)',
    async ({ d, eje, grupos }) => {
      const { a, b } = await crearPar(SANTA_CRUZ, SANTA_CRUZ.crs, d, eje);
      const { incremental, completo, enNode } = await losTresCaminos(a, b);
      expect(incremental, 'incremental').toHaveLength(grupos);
      expect(completo, 'completo (ST_ClusterDBSCAN)').toEqual(incremental);
      expect(enNode, 'completo (DBSCAN en Node)').toEqual(incremental);
    },
    60_000,
  );
});

describe('el CRS métrico sale de configuración (una instalación por ciudad)', () => {
  it('lejos del ecuador el prefiltro del incremental cubre el radio entero (UTM 21S, lat −34,6°)', async () => {
    process.env.CRS_METRICO_EPSG = String(OTRA_CIUDAD.crs);
    const cerca = await crearPar(OTRA_CIUDAD, OTRA_CIUDAD.crs, 24.0, 'este-oeste');
    const unido = await losTresCaminos(cerca.a, cerca.b);
    expect(unido.incremental).toHaveLength(1);
    expect(unido.completo).toEqual(unido.incremental);
    expect(unido.enNode).toEqual(unido.incremental);

    await limpiarInundaciones();
    const lejos = await crearPar(OTRA_CIUDAD, OTRA_CIUDAD.crs, 25.1, 'este-oeste');
    const separado = await losTresCaminos(lejos.a, lejos.b);
    expect(separado.incremental).toHaveLength(2);
    expect(separado.completo).toEqual(separado.incremental);
    expect(separado.enNode).toEqual(separado.incremental);
  }, 60_000);

  it('CRS_METRICO_EPSG cambia la métrica de los tres caminos a la vez', async () => {
    // EPSG:3857 (Web Mercator) estira las distancias ~5 % a −17,8°: 24,0 m reales miden ~25,2 m.
    // Con él configurado, el mismo par que en UTM 20S forma un grupo tiene que quedar en dos, y
    // en los tres caminos: si alguno siguiera con otra métrica, las particiones no coincidirían.
    process.env.CRS_METRICO_EPSG = '3857';
    const { a, b } = await crearPar(SANTA_CRUZ, SANTA_CRUZ.crs, 24.0, 'este-oeste');
    const { incremental, completo, enNode } = await losTresCaminos(a, b);
    expect(incremental).toHaveLength(2);
    expect(completo).toEqual(incremental);
    expect(enNode).toEqual(incremental);
  }, 60_000);
});

describe('M10.5: métrica vigente y aislamiento de categoría', () => {
  it('M10.5: SQL propio usa tabla física, acota ambos lados de distancia y conserva latest', async () => {
    const espia = vi.spyOn(pool, 'query');
    try {
      await crearPar(SANTA_CRUZ, SANTA_CRUZ.crs, 24.0, 'este-oeste');
      await particion();
      const sql = espia.mock.calls
        .map((c) => c[0])
        .filter((q): q is string => typeof q === 'string');
      expect(sql).toHaveLength(4);
      expect(sql.every((q) => !q.includes('reporte_inundacion'))).toBe(true);
      expect(sql[0]).toMatch(/INSERT INTO reporte\s*\(categoria,/);
      expect(sql[1]).toMatch(/INSERT INTO reporte\s*\(categoria,/);
      expect(sql[2]).toContain("a.categoria = 'inundacion'");
      expect(sql[2]).toContain("b.categoria = 'inundacion'");
      expect(sql[3]).toContain("categoria = 'inundacion'");
    } finally {
      espia.mockRestore();
    }
    const registradas = await pool.query<{ nombre: string }>(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    expect(registradas.rows.map((r) => r.nombre)).toEqual(listarMigraciones());
  });

  it('M10.5: pares cruzados y limpieza no incluyen ni eliminan las otras tres categorías', async () => {
    const ids: string[] = [];
    let puntos: string[] = [];
    try {
      const { a, b } = await crearPar(SANTA_CRUZ, SANTA_CRUZ.crs, 24.0, 'este-oeste');
      for (const categoria of ['bache', 'basura', 'area_verde']) {
        const id = await insertarReporte(
          ex,
          SANTA_CRUZ.lon,
          SANTA_CRUZ.lat,
          'validado',
          'media',
          categoria,
        );
        ids.push(id);
        expect(await medirPar(a, id, SANTA_CRUZ.crs)).toEqual([]);
        expect(await medirPar(id, a, SANTA_CRUZ.crs)).toEqual([]);
      }
      const { incremental, completo, enNode } = await losTresCaminos(a, b);
      expect(incremental).toEqual([[a, b].sort()]);
      expect(completo).toEqual(incremental);
      expect(enNode).toEqual(incremental);
      const filasAntes = await pool.query(
        'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id = ANY($1::uuid[]) ORDER BY id',
        [ids],
      );
      expect(filasAntes.rows).toHaveLength(3);
      const gruposAntes = await pool.query<{ id: string; categoria: string }>(
        'SELECT p.id::text, p.categoria FROM punto_critico p JOIN reporte r ON r.punto_critico_id = p.id WHERE r.id = ANY($1::uuid[]) ORDER BY p.id',
        [ids],
      );
      puntos = gruposAntes.rows.map((p) => p.id);
      expect(gruposAntes.rows).toHaveLength(3);
      expect(gruposAntes.rows.map((p) => p.categoria).sort()).toEqual([
        'area_verde',
        'bache',
        'basura',
      ]);
      await limpiarInundaciones();
      expect(await particion()).toEqual([]);
      expect(
        (
          await pool.query(
            'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id = ANY($1::uuid[]) ORDER BY id',
            [ids],
          )
        ).rows,
      ).toEqual(filasAntes.rows);
      expect(
        (
          await pool.query(
            'SELECT id::text, categoria FROM punto_critico WHERE id = ANY($1::uuid[]) ORDER BY id',
            [puntos],
          )
        ).rows,
      ).toEqual(gruposAntes.rows);
    } finally {
      await pool.query('DELETE FROM reporte WHERE id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM punto_critico WHERE id = ANY($1::uuid[])', [puntos]);
    }
  });
});
