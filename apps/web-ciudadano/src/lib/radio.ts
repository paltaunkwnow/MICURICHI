import {
  CONFIG_DOMINIO,
  dentroDelRadio,
  distanciaMetros,
  type PuntoLatLon,
  RADIO_TIERRA_M,
} from 'contracts';
import { leerCoordenadas } from './geo';

/**
 * El círculo del paso 1 (plan 2026-09-26, pedido E): el punto del reporte se mueve solo a 60 m o
 * menos de la posición del teléfono. La distancia es la de `contracts` (`distanciaMetros` y
 * `dentroDelRadio`, sin tolerancia), la misma con la que api-core lo vuelve a comprobar: un punto
 * que la interfaz dejó en el borde no puede volver rechazado.
 *
 * Sin React ni MapLibre, para poder probarlo; el mapa y el formulario solo lo aplican.
 */

export const RADIO_M = CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M;
/** Lo que mueve cada botón «mover 5 m» y cada flecha del teclado. */
export const PASO_BOTON_M = 5;
/** Con Mayúsculas, las flechas mueven de a 1 m: para el último ajuste. */
export const PASO_FINO_M = 1;

export type Direccion = 'norte' | 'sur' | 'este' | 'oeste';

/** Dónde quedó el punto del reporte. */
export interface Ubicacion extends PuntoLatLon {
  /**
   * Lo puso la app (la posición del teléfono o el enlace «Me pasa a mí»), no la persona. Sirve de
   * punto de partida, pero no cuenta como algo empezado: abrir y salir no deja borrador.
   */
  precargada?: boolean;
}

const METROS_POR_GRADO = (RADIO_TIERRA_M * Math.PI) / 180;

function metrosPorGradoDeLongitud(lat: number): number {
  return METROS_POR_GRADO * Math.cos((lat * Math.PI) / 180);
}

/** El punto `metros` hacia `direccion`. A esta escala, el plano tangente alcanza. */
export function desplazar<P extends PuntoLatLon>(
  punto: P,
  direccion: Direccion,
  metros: number,
): P {
  switch (direccion) {
    case 'norte':
      return { ...punto, lat: punto.lat + metros / METROS_POR_GRADO };
    case 'sur':
      return { ...punto, lat: punto.lat - metros / METROS_POR_GRADO };
    case 'este':
      return { ...punto, lon: punto.lon + metros / metrosPorGradoDeLongitud(punto.lat) };
    case 'oeste':
      return { ...punto, lon: punto.lon - metros / metrosPorGradoDeLongitud(punto.lat) };
  }
}

/**
 * El punto, o su proyección sobre el borde del círculo si quedó afuera, en la misma dirección
 * desde el centro. Se apunta un centímetro adentro del borde: medido con haversine y redondeado
 * al milímetro, como hace `dentroDelRadio`, el borde exacto a veces sale 60,001 m.
 */
export function recortarAlCirculo<P extends PuntoLatLon>(
  punto: P,
  centro: PuntoLatLon,
  radioM: number = RADIO_M,
): P {
  if (dentroDelRadio(punto, centro, { radioM })) return punto;
  const mLon = metrosPorGradoDeLongitud(centro.lat);
  const dx = (punto.lon - centro.lon) * mLon;
  const dy = (punto.lat - centro.lat) * METROS_POR_GRADO;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d === 0) return { ...punto, lat: centro.lat, lon: centro.lon };
  let objetivo = radioM - 0.01;
  let recortado = punto;
  for (let intento = 0; intento < 5; intento++) {
    const k = objetivo / d;
    recortado = {
      ...punto,
      lat: centro.lat + (dy * k) / METROS_POR_GRADO,
      lon: centro.lon + (dx * k) / mLon,
    };
    if (dentroDelRadio(recortado, centro, { radioM })) return recortado;
    objetivo -= 0.1;
  }
  return recortado;
}

/** Un «mover 5 m» o una flecha: se desplaza y, si se pasa del borde, se queda en él. */
export function moverDentroDelRadio<P extends PuntoLatLon>(
  punto: P,
  direccion: Direccion,
  metros: number,
  centro: PuntoLatLon,
): P {
  return recortarAlCirculo(desplazar(punto, direccion, metros), centro);
}

/** Anillo cerrado de `lados` + 1 vértices `[lon, lat]`, para dibujar el círculo en el mapa. */
export function poligonoDelCirculo(
  centro: PuntoLatLon,
  radioM: number = RADIO_M,
  lados = 64,
): [number, number][] {
  const anillo: [number, number][] = [];
  const mLon = metrosPorGradoDeLongitud(centro.lat);
  for (let i = 0; i < lados; i++) {
    const angulo = (2 * Math.PI * i) / lados;
    anillo.push([
      centro.lon + (radioM * Math.sin(angulo)) / mLon,
      centro.lat + (radioM * Math.cos(angulo)) / METROS_POR_GRADO,
    ]);
  }
  anillo.push(anillo[0] as [number, number]);
  return anillo;
}

/** `[[oeste, sur], [este, norte]]` del círculo, para encuadrarlo entero en el mapa. */
export function limitesDelCirculo(
  centro: PuntoLatLon,
  radioM: number = RADIO_M,
): [[number, number], [number, number]] {
  const dLat = radioM / METROS_POR_GRADO;
  const dLon = radioM / metrosPorGradoDeLongitud(centro.lat);
  return [
    [centro.lon - dLon, centro.lat - dLat],
    [centro.lon + dLon, centro.lat + dLat],
  ];
}

/**
 * El encuadre del paso 1: el círculo entero y, si el punto quedó afuera (el teléfono se movió al
 * enviar), también el punto, para que se vea qué hay que ajustar.
 */
export function encuadreDelPaso1(
  ancla: PuntoLatLon,
  punto: PuntoLatLon | null,
): [[number, number], [number, number]] {
  const [[oeste, sur], [este, norte]] = limitesDelCirculo(ancla);
  if (!punto)
    return [
      [oeste, sur],
      [este, norte],
    ];
  return [
    [Math.min(oeste, punto.lon), Math.min(sur, punto.lat)],
    [Math.max(este, punto.lon), Math.max(norte, punto.lat)],
  ];
}

export function distanciaRedondeada(a: PuntoLatLon, b: PuntoLatLon): number {
  return Math.round(distanciaMetros(a, b));
}

/** «Ese punto está a N m de vos.», para después de mover el punto. */
export function textoDistancia(punto: PuntoLatLon, ancla: PuntoLatLon): string {
  const n = distanciaRedondeada(punto, ancla);
  return n < 1 ? 'El punto está justo donde estás.' : `Ese punto está a ${n} m de vos.`;
}

export type CoordenadasEscritas =
  | { tipo: 'ok'; punto: PuntoLatLon; distanciaM: number }
  | { tipo: 'lejos'; distanciaM: number; mensaje: string }
  | { tipo: 'invalida'; mensaje: string };

/** Las coordenadas escritas a mano, que valen solo dentro del círculo. */
export function coordenadasEscritas(
  latTexto: string,
  lonTexto: string,
  ancla: PuntoLatLon,
): CoordenadasEscritas {
  const punto = leerCoordenadas(latTexto, lonTexto);
  if (!punto)
    return {
      tipo: 'invalida',
      mensaje:
        'Revisá las coordenadas: la latitud va entre -90 y 90, y la longitud entre -180 y 180.',
    };
  const distanciaM = distanciaRedondeada(punto, ancla);
  if (!dentroDelRadio(punto, ancla))
    return {
      tipo: 'lejos',
      distanciaM,
      mensaje: `Ese punto está a ${distanciaM} m de vos: tiene que quedar a ${RADIO_M} m o menos de donde estás.`,
    };
  return { tipo: 'ok', punto, distanciaM };
}

/**
 * El punto que la persona aceptó con «Continuar» en el paso 1 deja de ser precargado: desde ahí
 * es el lugar del agua que eligió, aunque lo haya puesto la app, y no se muda solo cuando vuelve a
 * llegar la posición del teléfono (tras un 422 de la posición, un borrador retomado o una posición
 * vencida). Sin la marca devuelve el mismo objeto, para no volver a resolver la unidad vecinal.
 */
export function aceptarPunto(u: Ubicacion): Ubicacion {
  if (!u.precargada) return u;
  return { lat: u.lat, lon: u.lon };
}

/**
 * Lo que cuenta como elegido por la persona cuando vuelve a llegar la posición del teléfono: el
 * punto que movió o aceptó ella, o el que puso la app y que ella aceptó con «Continuar»
 * (`aceptado`: hay un paso pendiente). Ese es el lugar del agua y no se muda a la posición nueva
 * del teléfono. Solo el que puso la app y nadie aceptó todavía se recalcula.
 */
export function puntoYaElegido(
  actual: Ubicacion | null,
  { aceptado }: { aceptado: boolean },
): Ubicacion | null {
  if (!actual || (actual.precargada && !aceptado)) return null;
  return actual;
}

/**
 * Dónde se pone el punto cuando llega la posición del teléfono: lo que la persona ya había
 * elegido (un borrador, o el punto de antes de volver a compartir) si sigue a 60 m o menos; si no,
 * el del enlace «Me pasa a mí» si queda cerca; y si no, la posición del teléfono. Cuando algo
 * elegido se descarta, se dice por qué, y `movido` avisa que el punto que la persona había
 * elegido ya no es el mismo: el formulario no la lleva directo a la revisión.
 */
export function puntoInicial({
  ancla,
  guardado,
  enlace,
}: {
  ancla: PuntoLatLon;
  guardado: Ubicacion | null;
  enlace: PuntoLatLon | null;
}): { punto: Ubicacion; aviso: string | null; movido: boolean } {
  const enElTelefono: Ubicacion = { lat: ancla.lat, lon: ancla.lon, precargada: true };
  if (guardado) {
    if (dentroDelRadio(guardado, ancla)) return { punto: guardado, aviso: null, movido: false };
    return {
      punto: enElTelefono,
      aviso: `Movimos el punto a tu ubicación: el que habías elegido queda a ${distanciaRedondeada(guardado, ancla)} m de donde estás ahora, y solo se puede reportar a ${RADIO_M} m o menos. Revisalo y ajustalo antes de seguir.`,
      movido: true,
    };
  }
  if (enlace) {
    if (dentroDelRadio(enlace, ancla))
      return {
        punto: { lat: enlace.lat, lon: enlace.lon, precargada: true },
        aviso: null,
        movido: false,
      };
    return {
      punto: enElTelefono,
      aviso: `El punto del enlace queda a ${distanciaRedondeada(enlace, ancla)} m de vos, y solo se puede reportar a ${RADIO_M} m o menos de donde estás. Lo pusimos en tu ubicación.`,
      movido: false,
    };
  }
  return { punto: enElTelefono, aviso: null, movido: false };
}
