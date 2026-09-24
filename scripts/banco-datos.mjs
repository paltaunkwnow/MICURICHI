#!/usr/bin/env node
/**
 * Generador de volumen para medir el comportamiento de la base cuando el proyecto crezca.
 *
 * Por qué existe. Las cifras de las fases anteriores se tomaron con 25 reportes sobre PGlite, y
 * eso no dice nada: con 25 filas Postgres hace un escaneo secuencial y gana, así que una consulta
 * sin índice parece rápida. Lo que importa es qué pasa a 10 000, 100 000 y 1 000 000, y eso hay
 * que provocarlo.
 *
 * Los puntos se generan DENTRO de las unidades vecinales cargadas (ST_GeneratePoints), no en un
 * rectángulo: si se reparten sobre el bbox, la mitad cae fuera de la cobertura, los índices GIST
 * quedan con una selectividad que no se parece a la real y las medidas no valen.
 *
 * Los datos son SINTÉTICOS y así se marcan: `descripcion` lleva el prefijo `[sintético]`, y
 * `limpiar` borra exactamente esos. No toca los reportes de los seeds ni ningún dato real.
 *
 *   node scripts/banco-datos.mjs generar 100000
 *   node scripts/banco-datos.mjs estado
 *   node scripts/banco-datos.mjs limpiar
 *
 * DATABASE_URL manda. Se niega a correr si NODE_ENV=production.
 */
import { createRequire } from 'node:module';

// `pg` no es dependencia de la raíz del monorepo y Node resuelve los imports desde el directorio
// del script, no desde el cwd: un `import pg from 'pg'` aquí falla con ERR_MODULE_NOT_FOUND por
// mucho que se lance con `pnpm --filter db`. Se resuelve desde `packages/db`, que es quien lo
// declara, en vez de añadir una dependencia a la raíz solo para una herramienta de medición.
const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
const pg = require('pg');

const MARCA = '[sintético banco-datos]';
const LOTE = 20_000;

if (process.env.NODE_ENV === 'production') {
  console.error('banco-datos: no se ejecuta contra producción. Inserta cientos de miles de filas.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('banco-datos: falta DATABASE_URL');
  process.exit(1);
}

const argv = process.argv.slice(2);
/**
 * Distribución temporal de los reportes generados. Importa MUCHO más de lo que parece.
 *
 * `ST_GeneratePoints` produce los puntos unidad vecinal por unidad vecinal, así que si `creado_en`
 * se deriva del número de fila, todos los reportes de una UV acaban con fechas contiguas: espacio
 * y tiempo quedan perfectamente correlacionados. Con esos datos, el listado público por bbox se
 * mide un orden de magnitud peor de lo que le corresponde, porque el recorrido por `creado_en`
 * tiene que descartar barrios enteros antes de llegar a la ventana pedida. Es un artefacto del
 * generador, no una propiedad de la aplicación.
 *
 *   (por defecto)     tiempo repartido con un salto coprimo: espacio y tiempo independientes.
 *   --correlacionado  el caso feo a propósito, que TAMBIÉN es realista en parte: un barrio entero
 *                     reporta durante la misma tormenta. Sirve de cota superior.
 */
const CORRELACIONADO = argv.includes('--correlacionado');
const [accion = 'estado', argumento] = argv.filter((a) => !a.startsWith('--'));
const pool = new pg.Pool({ connectionString: url, max: 2 });

/** El servidor corta a los 30 s; una carga masiva tarda más y no es una consulta patológica. */
async function sinLimiteDeTiempo(cliente) {
  await cliente.query('SET statement_timeout = 0');
  await cliente.query('SET idle_in_transaction_session_timeout = 0');
}

async function estado() {
  const r = await pool.query(
    `
    SELECT
      (SELECT count(*) FROM reporte_inundacion) AS reportes,
      (SELECT count(*) FROM reporte_inundacion WHERE descripcion LIKE $1) AS sinteticos,
      (SELECT count(*) FROM reporte_inundacion WHERE estado IN ('validado','resuelto')) AS publicables,
      (SELECT count(*) FROM reporte_inundacion WHERE geom_publico IS NULL) AS sin_geom_publico,
      (SELECT count(*) FROM punto_critico) AS puntos_criticos,
      (SELECT count(*) FROM geo.unidad_vecinal) AS unidades_vecinales,
      pg_size_pretty(pg_total_relation_size('reporte_inundacion')) AS tamano_reportes,
      pg_size_pretty(pg_database_size(current_database())) AS tamano_base
  `,
    [`${MARCA}%`],
  );
  console.table(r.rows);
}

async function generar(cuantos) {
  const cliente = await pool.connect();
  try {
    await sinLimiteDeTiempo(cliente);
    const uv = await cliente.query(
      `SELECT u.id, u.distrito_id, u.version_capa
         FROM geo.unidad_vecinal u
         JOIN geo.capa_version v ON v.capa = 'unidad_vecinal' AND v.version = u.version_capa AND v.vigente`,
    );
    if (!uv.rowCount)
      throw new Error('no hay unidades vecinales vigentes; corré antes db:seed:samples');
    console.log(
      `banco-datos: ${cuantos} reportes repartidos entre ${uv.rowCount} unidades vecinales ` +
        `(tiempo ${CORRELACIONADO ? 'CORRELACIONADO con el espacio: peor caso' : 'independiente del espacio'})`,
    );

    let hechos = 0;
    const t0 = Date.now();
    while (hechos < cuantos) {
      const lote = Math.min(LOTE, cuantos - hechos);
      // Una sola sentencia por lote. Hacerlo fila a fila desde Node son `lote` idas y vueltas y
      // tarda dos órdenes de magnitud más; aquí lo que se quiere medir es la base con datos, no
      // la velocidad del generador.
      //
      // `geom_publico` se rellena aquí con el redondeo a 5 decimales porque estos reportes son
      // de vía pública: no llevan jitter (que necesitaría JITTER_SAL, un secreto del servidor).
      // Los de vivienda se dejan a propósito con geom_publico NULL en una fracción, para que el
      // camino "fail-closed" también tenga datos con los que medirse.
      await cliente.query(
        `
        WITH uvs AS (
          SELECT u.id, u.distrito_id, u.version_capa, u.geom,
                 row_number() OVER (ORDER BY u.id) AS n,
                 count(*) OVER () AS total
            FROM geo.unidad_vecinal u
            JOIN geo.capa_version v
              ON v.capa = 'unidad_vecinal' AND v.version = u.version_capa AND v.vigente
        ),
        reparto AS (
          SELECT uvs.*, ($1::int / uvs.total) + CASE WHEN uvs.n <= ($1::int % uvs.total) THEN 1 ELSE 0 END AS cuantos
            FROM uvs
        ),
        puntos AS (
          SELECT r.id AS uv_id, r.distrito_id, r.version_capa,
                 (ST_Dump(ST_GeneratePoints(r.geom, r.cuantos::int))).geom AS pt
            FROM reparto r WHERE r.cuantos > 0
        ),
        numerados AS (
          SELECT p.*, row_number() OVER () AS i FROM puntos p
        )
        INSERT INTO reporte_inundacion (
          geom, geom_publico, distrito_id, unidad_vecinal_id, version_capa, resolucion_flags,
          ubicacion_metodo, ubicacion_tipo, descripcion,
          tirante_estimado, duracion_estimada, frecuencia, afectacion, causa_presunta,
          severidad_calculada, severidad_puntaje, severidad_version, estado, creado_en)
        SELECT
          ST_SetSRID(pt, 4326),
          -- 1 de cada 5 es de vivienda; de esos, 1 de cada 10 queda sin punto publicable para
          -- ejercitar el camino fail-closed del listado público.
          CASE WHEN i % 5 = 0 AND i % 50 = 0 THEN NULL
               ELSE ST_SetSRID(ST_MakePoint(round(ST_X(pt)::numeric, 5)::float8,
                                            round(ST_Y(pt)::numeric, 5)::float8), 4326) END,
          distrito_id, uv_id, version_capa, '{}'::jsonb,
          (ARRAY['gps','manual'])[1 + (i % 2)]::ubicacion_metodo,
          CASE WHEN i % 5 = 0 THEN 'vivienda_o_predio' ELSE 'via_publica' END::ubicacion_tipo,
          $2 || ' anegamiento de prueba nº ' || i,
          (ARRAY['tobillo','rodilla','muslo','mas_70'])[1 + (i % 4)]::tirante_estimado,
          (ARRAY['menos_30min','30min_2h','2h_12h','mas_12h'])[1 + (i % 4)]::duracion_estimada,
          (ARRAY['primera_vez','ocasional','cada_lluvia_fuerte','permanente'])[1 + (i % 4)]::frecuencia,
          (ARRAY['peatonal','vehicular','ingreso_viviendas','corte_total_via'])[1 + (i % 4)]::afectacion,
          'desconocida'::causa_presunta,
          (ARRAY['baja','media','alta','critica'])[1 + (i % 4)]::severidad,
          5 + (i % 16), 1,
          -- Tres de cada cuatro publicables: es la proporción que hace que el índice parcial
          -- del listado público tenga una selectividad parecida a la de un sistema en marcha.
          CASE WHEN i % 4 = 0 THEN 'nuevo' ELSE (ARRAY['validado','resuelto'])[1 + (i % 2)] END::estado_reporte,
          -- 525 600 minutos = un año. El salto de 7919 (primo, coprimo con el año en minutos)
          -- reparte las fechas de forma determinista y sin relación con el orden espacial.
          now() - ((CASE WHEN $3::bool THEN i ELSE (i * 7919) % 525600 END) || ' minutes')::interval
        FROM numerados`,
        [lote, MARCA, CORRELACIONADO],
      );
      hechos += lote;
      process.stdout.write(
        `\r  ${hechos}/${cuantos} (${Math.round((Date.now() - t0) / 1000)} s)   `,
      );
    }
    console.log('');
    console.log('banco-datos: ANALYZE para que el planificador tenga estadísticas al día…');
    await cliente.query('ANALYZE reporte_inundacion');
    await cliente.query('ANALYZE punto_critico');
    console.log(`banco-datos: listo en ${Math.round((Date.now() - t0) / 1000)} s`);
  } finally {
    cliente.release();
  }
  await estado();
}

async function limpiar() {
  const cliente = await pool.connect();
  try {
    await sinLimiteDeTiempo(cliente);
    // Un solo DELETE, no por lotes. La primera versión iba de 20 000 en 20 000 y resultó ser
    // cuadrática: `descripcion LIKE '…%'` no tiene índice, así que CADA lote volvía a recorrer
    // la tabla entera. Con un millón de filas eran cincuenta escaneos de 500 MB y no terminaba.
    // Una sola pasada la recorre una vez. Es una herramienta de banco sobre una base de
    // desarrollo: no hay concurrencia a la que proteger de un lock largo.
    const t0 = Date.now();
    const r = await cliente.query('DELETE FROM reporte_inundacion WHERE descripcion LIKE $1', [
      `${MARCA}%`,
    ]);
    // Los puntos críticos que se quedaron sin miembros no tienen sentido: el FK es SET NULL, así
    // que borrar reportes no los borra a ellos.
    const pc = await cliente.query(
      `DELETE FROM punto_critico p
        WHERE NOT EXISTS (SELECT 1 FROM reporte_inundacion r WHERE r.punto_critico_id = p.id)`,
    );
    // VACUUM recupera el espacio: sin él la tabla sigue ocupando las páginas muertas y la
    // siguiente medición parte de un estado que no se parece al de una base recién cargada.
    await cliente.query('VACUUM ANALYZE reporte_inundacion');
    console.log(
      `banco-datos: ${r.rowCount} reportes sintéticos y ${pc.rowCount} puntos críticos huérfanos ` +
        `borrados en ${Math.round((Date.now() - t0) / 1000)} s`,
    );
  } finally {
    cliente.release();
  }
  await estado();
}

try {
  if (accion === 'generar') await generar(Number(argumento ?? 10_000));
  else if (accion === 'limpiar') await limpiar();
  else await estado();
} catch (e) {
  console.error('banco-datos:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
