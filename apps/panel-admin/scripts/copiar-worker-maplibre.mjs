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
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'maplibre');

// `maplibre-gl` exporta solo su entrada; se resuelve el package.json para llegar a `dist/`.
const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');

// El worker importa `./maplibre-gl-shared.mjs` de forma relativa, así que los dos van juntos.
const ARCHIVOS = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

mkdirSync(destino, { recursive: true });
for (const nombre of ARCHIVOS) {
  const origen = join(dist, nombre);
  if (!existsSync(origen)) {
    console.error(`[maplibre] no encontré ${origen}. ¿Cambió el empaquetado de maplibre-gl?`);
    process.exit(1);
  }
  const salida = join(destino, nombre);
  // Copiar solo si cambió: en `dev` esto corre en cada arranque.
  if (existsSync(salida) && statSync(salida).size === statSync(origen).size) continue;
  copyFileSync(origen, salida);
  console.log(`[maplibre] copiado ${nombre}`);
}
