import type { Ciudad } from 'contracts';

/**
 * Niveles de zoom que el mapa del panel se aleja respecto del mapa público. La bandeja comparte
 * la pantalla con la tabla: con el zoom del mapa público se veía menos ciudad que la que el
 * técnico necesita para ubicarse (Santa Cruz abría en 12, uno menos que el 13 público).
 */
const NIVELES_MAS_LEJOS_QUE_EL_MAPA_PUBLICO = 1;

/**
 * Dónde abre el mapa del panel antes de tener datos: el centro de la ciudad del despliegue
 * (`GET /api/v1/configuracion`) y su zoom inicial, un nivel más lejos. Luego mandan los filtros
 * y los puntos.
 */
export function vistaInicialDelPanel(ciudad: Pick<Ciudad, 'centro' | 'zoom_inicial'>): {
  centro: [number, number];
  zoom: number;
} {
  return {
    centro: [ciudad.centro.lon, ciudad.centro.lat],
    zoom: Math.max(0, ciudad.zoom_inicial - NIVELES_MAS_LEJOS_QUE_EL_MAPA_PUBLICO),
  };
}
