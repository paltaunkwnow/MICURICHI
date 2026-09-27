#!/usr/bin/env node
/**
 * Copia el worker de MapLibre a `public/maplibre/` antes de `dev` y de `build`.
 *
 * MapLibre 6 calcula la URL de su worker con `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
 * Dentro de Next eso apunta al chunk empaquetado, así que la URL resultante es
 * `/_next/static/chunks/maplibre-gl-worker.mjs`, que no existe: el servidor responde la página 404
 * en HTML y el navegador rechaza el módulo por MIME. El worker nunca arranca y, como TODO lo
 * vectorial se procesa ahí, el mapa se queda solo con las teselas raster: sin puntos, sin
 * agrupaciones y sin los polígonos de distritos y unidades vecinales, y sin un solo error visible.
 *
 * La solución es servir el worker desde `public/` y decírselo a MapLibre con `setWorkerUrl`
 * (ver `src/lib/worker-maplibre.ts`). Se copia en cada arranque en vez de versionarlo para que no
 * pueda quedar desincronizado de la versión instalada del paquete.
 *
 * Los dos archivos se sirven `immutable` cuando la URL lleva `?v=` (`next.config.ts`). El worker
 * se pide con `?v=<versión>`, pero su `import` relativo del módulo compartido no la hereda: por eso
 * se le escribe aquí la misma versión. Sin ella, al actualizar MapLibre el worker nuevo cargaría
 * el módulo compartido viejo que el navegador guardó por un año.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'maplibre');

// `maplibre-gl` exporta solo su entrada; se resuelve el package.json para llegar a `dist/`.
const paquete = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(paquete, 'utf8'));
const dist = join(dirname(paquete), 'dist');

const COMPARTIDO = 'maplibre-gl-shared.mjs';
const WORKER = 'maplibre-gl-worker.mjs';

/** El worker importa `./maplibre-gl-shared.mjs`; se le agrega la versión a ese `import`. */
function versionarImport(codigo) {
  const original = `"./${COMPARTIDO}"`;
  const partes = codigo.split(original);
  if (partes.length !== 2) {
    console.error(
      `[maplibre] esperaba un solo import de ${original} en el worker y hay ${partes.length - 1}. ¿Cambió el empaquetado de maplibre-gl?`,
    );
    process.exit(1);
  }
  return partes.join(`"./${COMPARTIDO}?v=${version}"`);
}

mkdirSync(destino, { recursive: true });
for (const nombre of [WORKER, COMPARTIDO]) {
  const origen = join(dist, nombre);
  if (!existsSync(origen)) {
    console.error(`[maplibre] no encontré ${origen}. ¿Cambió el empaquetado de maplibre-gl?`);
    process.exit(1);
  }
  const leido = readFileSync(origen, 'utf8');
  const contenido = nombre === WORKER ? versionarImport(leido) : leido;
  const salida = join(destino, nombre);
  // Escribir solo si cambió: en `dev` esto corre en cada arranque.
  if (existsSync(salida) && readFileSync(salida, 'utf8') === contenido) continue;
  writeFileSync(salida, contenido);
  console.log(`[maplibre] copiado ${nombre} (${version})`);
}
