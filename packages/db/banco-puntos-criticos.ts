/**
 * Banco de medición del recálculo de puntos críticos. No es un test: se ejecuta a mano
 *   pnpm --filter db exec tsx banco-puntos-criticos.ts [n1,n2,...]
 * y compara el coste de reconstruir la tabla entera contra recalcular solo la vecindad,
 * que es lo que hace api-core en cada moderación.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ejecutorPg } from './src/ejecutor.js';
import { recalcularPuntosCriticos } from './src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from './src/puntos-criticos-entorno.js';
import { cargarCapasDePrueba, levantarBaseEfimera } from './src/test-utils.js';

export const SQL_SEMILLA_BANCO = `SELECT id::text FROM reporte WHERE categoria = 'inundacion' ORDER BY creado_en DESC LIMIT 1`;

/** Construye el lote sintético sin abrir conexiones ni operar el banco al importar. */
export function construirInsercionBanco(n: number, desde: number) {
  const filas: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const foco = Math.floor((desde + i) / 3);
    // Focos en rejilla de ~55 m: no se encadenan, cada foco es un punto crítico de 3 reportes.
    const lon = -63.1995 + (foco % 60) * 0.0005 + ((desde + i) % 3) * 0.00002;
    const lat = -17.7995 + Math.floor(foco / 60) * 0.0005 + ((desde + i) % 3) * 0.00002;
    const b = params.length;
    filas.push(
      `('inundacion', ST_SetSRID(ST_MakePoint($${b + 1}, $${b + 2}), 4326), 'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica', 'Reporte de banco de pruebas automatizado', '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb, 1, 'media', 6, 2, 'validado', now())`,
    );
    params.push(lon, lat);
  }
  return {
    sql: `INSERT INTO reporte (categoria, geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
      detalle, detalle_version, severidad_calculada, severidad_puntaje, severidad_version, estado, publicar_en)
     VALUES ${filas.join(',')}`,
    params,
  };
}

async function ejecutarBanco() {
  const volumenes = (process.argv[2] ?? '100,1000,5000').split(',').map(Number);
  const base = await levantarBaseEfimera();
  const pool = new pg.Pool({ connectionString: base.url, max: 4 });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);

  let acumulado = 0;
  console.log('n\tpuntos\tcompleto_ms\tincremental_ms\tfactor');
  for (const n of volumenes) {
    const lote = construirInsercionBanco(n - acumulado, acumulado);
    await pool.query(lote.sql, lote.params);
    acumulado = n;

    const t0 = performance.now();
    const r = await recalcularPuntosCriticos(ex);
    const msCompleto = performance.now() - t0;

    // Lo que realmente ocurre al moderar: un reporte de inundación cambia y se recalcula su entorno.
    const [uno] = (await pool.query<{ id: string }>(SQL_SEMILLA_BANCO)).rows;
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ejecutarBanco();
  process.exit(0);
}
