/**
 * Banco de medición del recálculo de puntos críticos. No es un test: se ejecuta a mano
 *   pnpm --filter db exec tsx banco-puntos-criticos.ts [n1,n2,...]
 * y compara el coste de reconstruir la tabla entera contra recalcular solo la vecindad,
 * que es lo que hace api-core en cada moderación.
 */
import pg from 'pg';
import { ejecutorPg } from './src/ejecutor.js';
import { recalcularPuntosCriticos } from './src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from './src/puntos-criticos-entorno.js';
import { cargarCapasDePrueba, levantarBaseEfimera } from './src/test-utils.js';

const volumenes = (process.argv[2] ?? '100,1000,5000').split(',').map(Number);

async function sembrar(pool: pg.Pool, n: number, desde: number) {
  const filas: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const foco = Math.floor((desde + i) / 3);
    // Focos en rejilla de ~55 m: no se encadenan, cada foco es un punto crítico de 3 reportes.
    const lon = -63.1995 + (foco % 60) * 0.0005 + ((desde + i) % 3) * 0.00002;
    const lat = -17.7995 + Math.floor(foco / 60) * 0.0005 + ((desde + i) % 3) * 0.00002;
    const b = params.length;
    filas.push(
      `(ST_SetSRID(ST_MakePoint($${b + 1}, $${b + 2}), 4326), 'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica', 'Reporte de banco de pruebas automatizado', 'rodilla', '2h_12h', 'ocasional', 'vehicular', 'media', 10, 'validado')`,
    );
    params.push(lon, lat);
  }
  await pool.query(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
      tirante_estimado, duracion_estimada, frecuencia, afectacion, severidad_calculada, severidad_puntaje, estado)
     VALUES ${filas.join(',')}`,
    params,
  );
}

const base = await levantarBaseEfimera();
const pool = new pg.Pool({ connectionString: base.url, max: 4 });
const ex = ejecutorPg(pool);
await cargarCapasDePrueba(ex);

let acumulado = 0;
console.log('n\tpuntos\tcompleto_ms\tincremental_ms\tfactor');
for (const n of volumenes) {
  await sembrar(pool, n - acumulado, acumulado);
  acumulado = n;

  const t0 = performance.now();
  const r = await recalcularPuntosCriticos(ex);
  const msCompleto = performance.now() - t0;

  // Lo que realmente ocurre al moderar: un reporte cualquiera cambia y se recalcula su entorno.
  const [uno] = (
    await pool.query<{ id: string }>(
      `SELECT id::text FROM reporte_inundacion ORDER BY creado_en DESC LIMIT 1`,
    )
  ).rows;
  const muestras: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t1 = performance.now();
    await recalcularEntornoDeReporte(ex, uno!.id);
    muestras.push(performance.now() - t1);
  }
  const msIncremental = muestras.reduce((a, b) => a + b, 0) / muestras.length;

  console.log(
    `${n}\t${r.puntos}\t${Math.round(msCompleto)}\t${msIncremental.toFixed(1)}\t${(msCompleto / msIncremental).toFixed(0)}x`,
  );
}

await pool.end();
await base.cerrar();
process.exit(0);
