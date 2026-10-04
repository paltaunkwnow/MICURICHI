import {
  dentroDelRadio,
  distanciaMetros,
  type PuntoLatLon,
  type ReporteTecnicoFeature,
} from 'contracts';
import type { ParametrosConsulta } from './api';
import { etiquetaUnidadVecinal, idCorto } from './formato';

/**
 * Fusionar solo con reportes cercanos: la lógica pura de la lista de candidatos a reporte canónico.
 * Sin React ni red, para probarla sin navegador.
 *
 * La restricción es de la interfaz. api-core sigue aceptando como canónico cualquier reporte
 * `validado` (CLAUDE.md §7.3); lo que cambia es qué ofrece el panel: solo los validados a 100 m o
 * menos de la coordenada EXACTA del reporte, sin el propio, del más cercano al más lejano. La
 * búsqueda usa el filtro `bbox` de `GET /api/v1/tecnico/reportes` y la distancia exacta se mide acá
 * con `distanciaMetros` de contracts, la misma cuenta del radio de 60 m del dispositivo.
 */

/** Radios de búsqueda: se empieza por el primero y, si no hay nadie, se ofrece ampliar a los otros. */
export const RADIOS_FUSION_M = [100, 300, 1000] as const;
export type RadioFusionM = (typeof RADIOS_FUSION_M)[number];
export const RADIO_FUSION_INICIAL_M: RadioFusionM = RADIOS_FUSION_M[0];

/**
 * Cuántos validados se piden por búsqueda. api-core los entrega del más reciente al más antiguo y
 * admite hasta 500 por página (`PaginacionSchema`); 100 sobran para 100 m y mantienen liviana la
 * respuesta de 1 km. Si en la caja hay más, la lista lo avisa (`avisoRecorte`).
 */
export const LIMITE_CANDIDATOS_FUSION = 100;

/**
 * Metros por grado que usa la caja: el del ecuador. La esfera de `distanciaMetros` mide 111 195 m
 * por grado, así que sin margen la caja quedaría 0,1 % más chica que el círculo. El grado de
 * longitud se achica con el coseno de la latitud.
 */
const METROS_POR_GRADO = 111_320;

/**
 * La caja sale 5 % más grande que el círculo: cubre esa diferencia con holgura, y el borde del
 * círculo queda adentro a cualquier rumbo.
 */
const MARGEN_CAJA = 1.05;

/**
 * Las aristas de la caja se alinean hacia afuera a una cuadrícula de 0,0005° (~56 m). api-core
 * registra la URL de cada petición con su cadena de consulta (`registro.ts` da por hecho que el
 * `bbox` son filtros del mapa que no identifican a nadie): una caja centrada en el punto exacto
 * dejaría en el log la coordenada de un reporte, quizá una vivienda. Alineada, el log solo dice en
 * qué celda de la cuadrícula estaba, tan poco como la vista pública, que desplaza hasta 30 m.
 */
const PASO_CUADRICULA_GRADOS = 0.0005;

/**
 * Caja "minLon,minLat,maxLon,maxLat" (el `bbox` de la API) que contiene el círculo de `radioM`
 * metros alrededor de `centro`: Δlat = r / 111 320 y Δlon = r / (111 320 · cos lat), con margen y
 * alineada hacia afuera a la cuadrícula de `PASO_CUADRICULA_GRADOS`, así que no lleva la
 * coordenada exacta. Seis decimales y sin notación científica, que `BboxSchema` no acepta. Trae
 * reportes de más en las esquinas y los bordes; `candidatosCercanos` los descarta por distancia.
 */
export function cajaDeBusqueda(centro: PuntoLatLon, radioM: number): string {
  const dLat = (radioM / METROS_POR_GRADO) * MARGEN_CAJA;
  const dLon = (radioM / (METROS_POR_GRADO * Math.cos((centro.lat * Math.PI) / 180))) * MARGEN_CAJA;
  const abajo = (n: number) => Math.floor(n / PASO_CUADRICULA_GRADOS) * PASO_CUADRICULA_GRADOS;
  const arriba = (n: number) => Math.ceil(n / PASO_CUADRICULA_GRADOS) * PASO_CUADRICULA_GRADOS;
  return [
    abajo(centro.lon - dLon),
    abajo(centro.lat - dLat),
    arriba(centro.lon + dLon),
    arriba(centro.lat + dLat),
  ]
    .map((n) => n.toFixed(6))
    .join(',');
}

/** Parámetros de `GET /api/v1/tecnico/reportes`: los validados dentro de la caja del radio. */
export function parametrosCandidatosFusion(
  centro: PuntoLatLon,
  radioM: number,
): ParametrosConsulta {
  return {
    estado: 'validado',
    bbox: cajaDeBusqueda(centro, radioM),
    limite: String(LIMITE_CANDIDATOS_FUSION),
  };
}

export interface CandidatoFusion {
  id: string;
  /** Los 8 primeros caracteres del id, como en la bandeja. */
  idCorto: string;
  /** «UV 105», o «Sin UV» si el reporte no cayó en ninguna. */
  unidadVecinal: string;
  /** Distancia a la coordenada exacta del reporte, en metros y sin redondear: de acá salen el filtro y el orden. */
  distanciaM: number;
  /** Comienzo de la descripción, en una línea. */
  descripcion: string;
}

const LARGO_DESCRIPCION = 60;

/** La descripción en una sola línea y con un largo razonable; «…» si se cortó. */
export function descripcionCorta(texto: string): string {
  const linea = texto.replace(/\s+/g, ' ').trim();
  return linea.length > LARGO_DESCRIPCION
    ? `${linea.slice(0, LARGO_DESCRIPCION).trimEnd()}…`
    : linea;
}

/**
 * Los candidatos a canónico: solo `validado`, a `radioM` metros o menos del reporte (el borde
 * cuenta como adentro, con la misma cuenta que el radio del dispositivo), sin el propio reporte,
 * del más cercano al más lejano. El estado se vuelve a mirar acá aunque la consulta lo pida: la
 * regla es de la interfaz y no depende de que la API filtre bien. Con la misma distancia manda
 * el id, para que el orden no cambie entre una consulta y la siguiente.
 */
export function candidatosCercanos(
  features: readonly ReporteTecnicoFeature[],
  propio: { id: string; centro: PuntoLatLon },
  radioM: number,
): CandidatoFusion[] {
  const idPropio = propio.id.toLowerCase();
  const candidatos: CandidatoFusion[] = [];
  for (const f of features) {
    const p = f.properties;
    if (p.estado !== 'validado' || p.id.toLowerCase() === idPropio) continue;
    const punto: PuntoLatLon = { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    if (!dentroDelRadio(punto, propio.centro, { radioM })) continue;
    candidatos.push({
      id: p.id,
      idCorto: idCorto(p.id),
      unidadVecinal: p.unidad_vecinal?.codigo
        ? etiquetaUnidadVecinal(p.unidad_vecinal.codigo)
        : 'Sin UV',
      distanciaM: distanciaMetros(punto, propio.centro),
      descripcion: descripcionCorta(p.descripcion),
    });
  }
  return candidatos.sort((a, b) => a.distanciaM - b.distanciaM || a.id.localeCompare(b.id));
}

/** «a 35 m», o «en el mismo punto» si la distancia redondea a cero. */
export function etiquetaDistancia(metros: number): string {
  const redondeada = Math.round(metros);
  return redondeada < 1 ? 'en el mismo punto' : `a ${redondeada} m`;
}

/** «100 m», «300 m», «1 km». */
export function etiquetaRadio(radioM: number): string {
  return radioM >= 1000 ? `${radioM / 1000} km` : `${radioM} m`;
}

/** Los radios que se pueden ofrecer para ampliar: solo los mayores al vigente. */
export function radiosMayores(radioM: number): RadioFusionM[] {
  return RADIOS_FUSION_M.filter((r) => r > radioM);
}

/**
 * Aviso para cuando la API recortó la respuesta: hay más validados en la caja (`total`) que los
 * recibidos, y vienen del más reciente al más antiguo, así que uno más cercano pero más viejo puede
 * haber quedado afuera. `null` si llegó todo.
 */
export function avisoRecorte(recibidos: number, total: number): string | null {
  if (total <= recibidos) return null;
  return `Se muestran los ${recibidos} más recientes de ${total}; puede haber más cerca.`;
}

/**
 * «Confirmar fusión» solo se habilita con un reporte elegido de la lista y sin otra petición en
 * curso. El campo para pegar un ID ya no existe: no hay otra forma de elegir canónico.
 */
export function puedeConfirmarFusion(elegido: CandidatoFusion | null, ocupado: boolean): boolean {
  return elegido !== null && !ocupado;
}
