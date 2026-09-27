import { getVersion, setWorkerUrl } from 'maplibre-gl';

/**
 * Ruta del worker de MapLibre, servido desde `public/` por `scripts/copiar-worker-maplibre.mjs`.
 *
 * Sin esto MapLibre busca su worker junto al chunk de Next y recibe la página 404 en HTML. El
 * worker no arranca, y como ahí se procesa todo lo vectorial, el mapa se queda en las teselas
 * raster: ni puntos, ni agrupaciones, ni polígonos de distrito o unidad vecinal. No se ve ningún
 * error en la consola del mapa; solo un `Failed to load module script` suelto.
 *
 * `?v=` con la versión de MapLibre: el worker se sirve `immutable` por un año (`next.config.ts`),
 * así que al actualizar el paquete tiene que cambiar la URL. El script de copia pone la misma
 * versión en el `import` del módulo compartido, que también es immutable.
 */
export const RUTA_WORKER = `/maplibre/maplibre-gl-worker.mjs?v=${getVersion()}`;

let puesto = false;

export function configurarWorkerDeMapLibre(): void {
  if (puesto || typeof window === 'undefined') return;
  puesto = true;
  setWorkerUrl(new URL(RUTA_WORKER, window.location.origin).href);
}
