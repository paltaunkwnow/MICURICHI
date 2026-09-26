import type { CapaInfo, Ciudad } from 'contracts';

/** Esquinas suroeste y noreste, en el orden que espera `fitBounds` de MapLibre. */
export type Limites = [[number, number], [number, number]];

/**
 * Niveles de zoom que el mapa del panel se aleja respecto del mapa público. La bandeja comparte
 * la pantalla con la tabla: con el zoom del mapa público se veía menos ciudad que la que el
 * técnico necesita para ubicarse (Santa Cruz abría en 12, uno menos que el 13 público).
 */
const NIVELES_MAS_LEJOS_QUE_EL_MAPA_PUBLICO = 1;

/**
 * Dónde abre el mapa del panel antes de tener datos: el centro de la ciudad del despliegue
 * (`GET /api/v1/configuracion`) y su zoom inicial, un nivel más lejos. Luego mandan los filtros,
 * los puntos o el bbox de la capa vigente.
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

/**
 * Límites para encuadrar el mapa sobre la capa oficial vigente. Los distritos primero: son la
 * capa que cubre todo el municipio; si no estuviera, sirve cualquiera de las otras, que están
 * dentro. El bbox lo publica geo-service en `/geo/v1/capas`, así que el encuadre sale del dato y
 * no de un centro y un zoom fijos (con zoom 11 quedaban fuera los distritos 14 y 15).
 */
export function limitesDeCapas(capas: readonly CapaInfo[]): Limites | null {
  const conBbox =
    capas.find((c) => c.capa === 'distrito_municipal' && c.bbox) ?? capas.find((c) => c.bbox);
  const b = conBbox?.bbox;
  if (!b) return null;
  return [
    [b[0], b[1]],
    [b[2], b[3]],
  ];
}
