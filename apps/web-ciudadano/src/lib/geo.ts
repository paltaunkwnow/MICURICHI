/**
 * Utilidades geográficas puras (sin MapLibre) para poder usarlas en el servidor y en tests.
 */

/**
 * Centro inicial del mapa: Santa Cruz de la Sierra (la muestra sintética está alrededor).
 * Mismo valor que `CENTRO_INICIAL` en `componentes/Mapa.tsx`; se duplica acá para no importar
 * MapLibre fuera del navegador.
 */
export const CENTRO_INICIAL: [number, number] = [-63.18, -17.78];

/** Centro de un bbox "minLon,minLat,maxLon,maxLat" (orden GeoJSON). */
export function centroDeBbox(bbox: string): { lat: number; lon: number } | null {
  const partes = bbox.split(',').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) return null;
  const [oeste, sur, este, norte] = partes as [number, number, number, number];
  return { lat: (sur + norte) / 2, lon: (oeste + este) / 2 };
}

/** Valida un par de coordenadas escrito a mano (acepta coma decimal). */
export function leerCoordenadas(
  latTexto: string,
  lonTexto: string,
): { lat: number; lon: number } | null {
  const lat = Number(latTexto.trim().replace(',', '.'));
  const lon = Number(lonTexto.trim().replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}
