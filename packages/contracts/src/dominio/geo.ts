/**
 * La cuenta del radio del dispositivo (CLAUDE.md §13): la misma en la interfaz, que recorta el
 * marcador al círculo, y en api-core, que la vuelve a comprobar. Si cada lado midiera a su manera,
 * un punto que la interfaz dejó en el borde podría volver rechazado.
 */
import { CONFIG_DOMINIO } from './config.js';

/** Radio medio de la Tierra (IUGG), en metros. */
export const RADIO_TIERRA_M = 6_371_008.8;

const RAD = Math.PI / 180;

/** Punto en EPSG:4326. */
export interface PuntoLatLon {
  lat: number;
  lon: number;
}

/**
 * Códigos 422 de `POST /api/v1/reportes` sobre la posición del dispositivo, en el orden en que
 * api-core los comprueba: después de validar el cuerpo y antes de resolver la ubicación.
 * `UBICACION_PRECISA_DISPONIBLE` (desde 0.18.0, ADR 0007) es la otra cara de
 * `PRECISION_INSUFICIENTE`: se pidió el camino de ubicación aproximada (`ubicacion_aproximada:
 * true`) pero el dispositivo sí llega a `PRECISION_DISPOSITIVO_MAX_M` m o menos, así que tiene que
 * usar el camino normal. Con `ubicacion_aproximada` no se comprueba el radio.
 */
export const CODIGOS_UBICACION_DISPOSITIVO = [
  'PRECISION_INSUFICIENTE',
  'UBICACION_PRECISA_DISPONIBLE',
  'POSICION_VENCIDA',
  'UBICACION_FUERA_DE_RADIO',
] as const;
export type CodigoUbicacionDispositivo = (typeof CODIGOS_UBICACION_DISPOSITIVO)[number];

/**
 * Distancia en metros sobre la esfera (haversine). A la escala del radio, la diferencia con el
 * elipsoide WGS 84 es de décimas de metro (unos 0,3 m a 60 m en Santa Cruz).
 */
export function distanciaMetros(a: PuntoLatLon, b: PuntoLatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  // El mínimo evita un NaN cuando el redondeo deja h apenas por encima de 1 (puntos antípodas).
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface OpcionesRadio {
  /** Radio en metros; por defecto `REPORTE_RADIO_DISPOSITIVO_M`. */
  radioM?: number;
  /**
   * Metros que se suman al radio. La interfaz no la usa; api-core suma medio metro para absorber
   * el redondeo de las coordenadas que manda el cliente.
   */
  toleranciaM?: number;
}

/**
 * ¿Está `punto` a `radioM` (+ `toleranciaM`) metros o menos de `centro`? El borde cuenta como
 * adentro. La distancia se mide al milímetro: sin eso, un punto puesto justo a 60 m sale a
 * 60,00000000005 m por la coma flotante y queda afuera. Una coordenada que no es un número da
 * false.
 */
export function dentroDelRadio(
  punto: PuntoLatLon,
  centro: PuntoLatLon,
  { radioM = CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M, toleranciaM = 0 }: OpcionesRadio = {},
): boolean {
  const distancia = Math.round(distanciaMetros(punto, centro) * 1000) / 1000;
  return distancia <= radioM + toleranciaM;
}
