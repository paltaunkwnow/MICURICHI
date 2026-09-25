#!/usr/bin/env node
/**
 * Banco de consultas: mide con EXPLAIN (ANALYZE, BUFFERS) las consultas que de verdad pueden
 * doler cuando crezca el volumen, y dice si cada una usa índice o hace un escaneo secuencial.
 *
 * Es la herramienta que faltaba para responder a "¿qué se rompe primero al crecer 10×?" con un
 * número en vez de con una intuición. Se corre después de `banco-datos.mjs generar N`:
 *
 *   node scripts/banco-datos.mjs generar 100000
 *   node scripts/banco-consultas.mjs
 *
 * Lo que mide no es la latencia HTTP (eso es `banco-carga.mjs`), sino el coste en la base: el
 * plan elegido, el tiempo de ejecución y cuántos bloques hubo que leer.
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
const pg = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('banco-consultas: falta DATABASE_URL');
  process.exit(1);
}
const REPETICIONES = Number(process.env.REPETICIONES ?? 5);
const pool = new pg.Pool({ connectionString: url, max: 2 });

/** Igual que services/api-core/src/vistas.ts (SELECT_REPORTE), para medir lo que corre de verdad. */
const SELECT_REPORTE = `
  SELECT r.id, ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,
         ST_X(r.geom_publico) AS lon_publico, ST_Y(r.geom_publico) AS lat_publico,
         r.creado_en, r.actualizado_en, r.evento_en, r.autor_id,
         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,
         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre, r.manzana_id,
         r.version_capa, r.resolucion_flags, r.ubicacion_metodo, r.precision_gps_m,
         r.ubicacion_tipo, r.direccion_aprox, r.descripcion, r.tirante_estimado,
         r.duracion_estimada, r.frecuencia, r.afectacion, r.causa_presunta,
         r.sumidero_cercano, r.sumidero_estado, r.agua_brota_sumidero,
         r.severidad_calculada, r.severidad_puntaje, r.severidad_manual, r.severidad_motivo,
         r.estado, r.estado_motivo, r.fusionado_en_id, r.punto_critico_id,
         pc.n_reportes AS n_reportes_punto, r.validado_por, r.validado_en,
         (SELECT array_agg(f.objeto_key ORDER BY f.creado_en) FROM reporte_foto f
           WHERE f.reporte_id = r.id AND f.exif_sanitizado) AS fotos
  FROM reporte_inundacion r
  LEFT JOIN geo.unidad_vecinal_vigente u ON u.id = r.unidad_vecinal_id
  LEFT JOIN geo.distrito_municipal_vigente d ON d.id = r.distrito_id
  LEFT JOIN punto_critico pc ON pc.id = r.punto_critico_id`;

const PUBLICO = `WHERE r.estado IN ('validado', 'resuelto') AND r.geom_publico IS NOT NULL`;

/** Un bbox pequeño centrado en el centroide de las UV vigentes: lo que pide el mapa al abrirse. */
async function bboxDelMapa(lado = 0.01) {
  const r = await pool.query(
    `SELECT ST_X(c) AS lon, ST_Y(c) AS lat
       FROM (SELECT ST_Centroid(ST_Collect(geom)) AS c FROM geo.unidad_vecinal_vigente) t`,
  );
  const { lon, lat } = r.rows[0];
  return [lon - lado, lat - lado, lon + lado, lat + lado];
}

const consultas = async () => {
  const bbox = await bboxDelMapa();
  const grande = await bboxDelMapa(0.2);
  return [
    {
      nombre: 'listado público · conteo acotado',
      sql: `SELECT count(*)::text AS n FROM (SELECT 1 FROM reporte_inundacion r ${PUBLICO} LIMIT 10001) t`,
      params: [],
      nota: 'el LIMIT interior es lo que impide que el conteo crezca con la tabla',
    },
    {
      nombre: 'listado público · primera página',
      sql: `${SELECT_REPORTE} ${PUBLICO} ORDER BY r.creado_en DESC, r.id DESC LIMIT 50 OFFSET 0`,
      params: [],
    },
    {
      nombre: 'listado público · página 100 (OFFSET 5000)',
      sql: `${SELECT_REPORTE} ${PUBLICO} ORDER BY r.creado_en DESC, r.id DESC LIMIT 50 OFFSET 5000`,
      params: [],
      nota: 'el OFFSET obliga a recorrer y descartar; es el coste que crece con la profundidad',
    },
    {
      nombre: 'listado público · bbox del mapa',
      sql: `${SELECT_REPORTE} ${PUBLICO}
              AND r.geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            ORDER BY r.creado_en DESC, r.id DESC LIMIT 50`,
      params: bbox,
      nota: 'debe entrar por el GIST parcial reporte_geom_publico_gist',
    },
    {
      nombre: 'listado técnico · filtro por unidad vecinal',
      sql: `${SELECT_REPORTE}
            WHERE r.unidad_vecinal_id = (SELECT id FROM geo.unidad_vecinal_vigente ORDER BY id LIMIT 1)
            ORDER BY r.creado_en DESC, r.id DESC LIMIT 50`,
      params: [],
    },
    {
      nombre: 'agregados por unidad vecinal (coropletas)',
      sql: `SELECT u.id, count(r.id)::int AS n_reportes,
                   count(DISTINCT r.punto_critico_id)::int AS n_puntos_criticos,
                   max(CASE COALESCE(r.severidad_manual, r.severidad_calculada)
                         WHEN 'critica' THEN 4 WHEN 'alta' THEN 3
                         WHEN 'media' THEN 2 WHEN 'baja' THEN 1 END) AS sev
              FROM geo.unidad_vecinal_vigente u
              LEFT JOIN reporte_inundacion r
                ON r.unidad_vecinal_id = u.id AND r.estado IN ('validado','resuelto')
             GROUP BY u.id`,
      params: [],
      nota: 'recorre TODOS los reportes publicables; es la consulta que más crece con el volumen',
    },
    {
      nombre: 'puntos críticos por bbox',
      sql: `SELECT id, ST_Y(geom_publico) AS lat, ST_X(geom_publico) AS lon, n_reportes
              FROM punto_critico
             WHERE geom_publico IS NOT NULL
               AND geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326)
             ORDER BY n_reportes DESC, ultimo_reporte_en DESC LIMIT 5000`,
      params: grande,
    },
    {
      nombre: 'point-in-polygon (resolver UV)',
      sql: `SELECT uv.id FROM geo.unidad_vecinal_vigente uv
             WHERE ST_Contains(uv.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1`,
      params: [(await bboxDelMapa(0)).slice(0, 2)[0], (await bboxDelMapa(0)).slice(0, 2)[1]],
      nota: 'debe usar unidad_vecinal_geom_gist; es el camino crítico de POST /reportes',
    },
    {
      nombre: 'vecinos a 25 m (recálculo de puntos críticos)',
      sql: `SELECT a.id::text AS origen, b.id::text AS vecino
              FROM reporte_inundacion a
              JOIN reporte_inundacion b
                ON b.id <> a.id AND b.estado IN ('validado','resuelto')
               AND b.geom && ST_Expand(a.geom, $2)
               AND ST_DWithin(b.geom::geography, a.geom::geography, $3)
             WHERE a.id = ANY($1::uuid[])`,
      params: [
        (
          await pool.query(
            `SELECT array_agg(id) AS ids FROM (
               SELECT id FROM reporte_inundacion WHERE estado IN ('validado','resuelto') LIMIT 1) t`,
          )
        ).rows[0].ids ?? [],
        (25 / 111_320) * 1.05,
        25,
      ],
      nota: 'una sola semilla; el coste real se multiplica por el tamaño de la componente conexa',
    },
    {
      nombre: 'mantenimiento · reportes sin geom_publico',
      sql: `SELECT id FROM reporte_inundacion WHERE geom_publico IS NULL ORDER BY creado_en LIMIT 500`,
      params: [],
      nota: 'debe entrar por el índice parcial reporte_sin_geom_publico',
    },
  ];
};

/** ¿El plan recorre una tabla entera? Es la señal que interesa: aparece al crecer, no antes. */
function escaneosSecuenciales(plan) {
  const encontrados = [];
  const recorrer = (n) => {
    if (n['Node Type'] === 'Seq Scan')
      encontrados.push(`${n['Relation Name']} (${n['Actual Rows']} filas)`);
    for (const h of n.Plans ?? []) recorrer(h);
  };
  recorrer(plan);
  return encontrados;
}

function indices(plan) {
  const nombres = new Set();
  const recorrer = (n) => {
    if (n['Index Name']) nombres.add(n['Index Name']);
    for (const h of n.Plans ?? []) recorrer(h);
  };
  recorrer(plan);
  return [...nombres];
}

const filas = [];
for (const c of await consultas()) {
  try {
    const tiempos = [];
    let explicacion = null;
    for (let i = 0; i < REPETICIONES; i++) {
      const r = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${c.sql}`, c.params);
      explicacion = r.rows[0]['QUERY PLAN'][0];
      tiempos.push(explicacion['Execution Time']);
    }
    tiempos.sort((a, b) => a - b);
    const seq = escaneosSecuenciales(explicacion.Plan);
    filas.push({
      consulta: c.nombre,
      'mediana ms': +tiempos[Math.floor(tiempos.length / 2)].toFixed(2),
      'peor ms': +tiempos[tiempos.length - 1].toFixed(2),
      'bloques leídos':
        explicacion.Plan['Shared Hit Blocks'] + explicacion.Plan['Shared Read Blocks'],
      'escaneo secuencial': seq.length ? seq.join(', ') : '—',
      índices: indices(explicacion.Plan).join(', ') || '—',
    });
  } catch (e) {
    filas.push({ consulta: c.nombre, 'mediana ms': 'ERROR', 'peor ms': e.message.slice(0, 60) });
  }
}

const total = await pool.query('SELECT count(*)::int AS n FROM reporte_inundacion');
console.log(
  `\nbanco-consultas · ${total.rows[0].n} reportes · mediana de ${REPETICIONES} corridas\n`,
);
console.table(filas);
for (const c of await consultas()) if (c.nota) console.log(`  · ${c.nombre}: ${c.nota}`);
await pool.end();
