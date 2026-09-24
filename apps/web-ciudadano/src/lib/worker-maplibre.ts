import { setWorkerUrl } from 'maplibre-gl';

/**
 * Ruta del worker de MapLibre, servido desde `public/` por `scripts/copiar-worker-maplibre.mjs`.
 *
 * Sin esto MapLibre busca su worker junto al chunk de Next y recibe la página 404 en HTML. El
 * worker no arranca, y como ahí se procesa todo lo vectorial, el mapa se queda en las teselas
 * raster: ni puntos, ni agrupaciones, ni polígonos de distrito o unidad vecinal. No se ve ningún
 * error en la consola del mapa; solo un `Failed to load module script` suelto.
 */
const RUTA_WORKER = '/maplibre/maplibre-gl-worker.mjs';

let puesto = false;

export function configurarWorkerDeMapLibre(): void {
  if (puesto || typeof window === 'undefined') return;
  puesto = true;
  setWorkerUrl(new URL(RUTA_WORKER, window.location.origin).href);
}
