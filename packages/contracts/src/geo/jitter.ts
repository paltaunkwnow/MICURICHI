/**
 * Jitter determinista para la vista pública (CLAUDE.md §13): desplaza un punto hasta
 * `radioM` metros con una semilla derivada del id, de modo que el mismo reporte siempre
 * se muestre en el mismo lugar desplazado y no se pueda "promediar" para recuperar el original.
 */

function hashFnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Devuelve un número pseudoaleatorio determinista en [0, 1) a partir de una semilla y un índice. */
function aleatorioDeterminista(semilla: string, indice: number): number {
  return hashFnv1a(`${semilla}:${indice}`) / 0x100000000;
}

const METROS_POR_GRADO_LAT = 111_320;

export function aplicarJitter(
  lat: number,
  lon: number,
  semilla: string,
  radioM: number,
): { lat: number; lon: number } {
  if (radioM <= 0) return { lat, lon };
  // Distribución uniforme en el disco: r = R·sqrt(u), ángulo = 2π·v.
  const u = aleatorioDeterminista(semilla, 1);
  const v = aleatorioDeterminista(semilla, 2);
  const r = radioM * Math.sqrt(u);
  const angulo = 2 * Math.PI * v;
  const dNorte = r * Math.cos(angulo);
  const dEste = r * Math.sin(angulo);
  const dLat = dNorte / METROS_POR_GRADO_LAT;
  const dLon = dEste / (METROS_POR_GRADO_LAT * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

export function redondearCoordenada(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/** Distancia aproximada en metros entre dos puntos (equirectangular, suficiente para < 1 km). */
export function distanciaAproximadaM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const latMedia = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dLat = (lat2 - lat1) * METROS_POR_GRADO_LAT;
  const dLon = (lon2 - lon1) * METROS_POR_GRADO_LAT * Math.cos(latMedia);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}
