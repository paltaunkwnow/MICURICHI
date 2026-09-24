import { ErrorApi } from './api';

export interface DetalleCampo {
  campo: string;
  mensaje: string;
}

/**
 * ¿El fallo es "se acabó el tiempo" y no "el servidor dijo que no"?
 *
 * `AbortSignal.timeout` no lanza un `Error` corriente: lanza un `DOMException` con
 * `name === 'TimeoutError'`. Como no es ni `ErrorApi` ni `TypeError`, caía en el cajón de sastre
 * y el vecino leía «Ocurrió un error inesperado» justo en el caso en el que MÁS falta le hace
 * saber qué pasó: la petición salió, pero no volvió a tiempo.
 */
export function esPlazoAgotado(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'TimeoutError';
}

/** Cancelación deliberada (cambió la vista, se desmontó el componente): no es un fallo. */
export function esCancelado(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** El navegador se declara sin conexión. Es una pista, no una certeza: `false` no garantiza red. */
function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Mensaje en español y en tono cercano para cualquier error de red o de la API. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) {
    if (e.codigo === 'FUERA_DE_COBERTURA') {
      return 'Ese punto queda fuera del municipio. Revisá la ubicación e intentá de nuevo.';
    }
    if (e.estado === 429) {
      return e.message || 'Demasiadas solicitudes. Esperá un momento y volvé a intentar.';
    }
    if (e.codigo === 'PAYLOAD_INVALIDO') {
      return 'Revisá los datos marcados: hay campos que faltan o no son válidos.';
    }
    // 503 con Retry-After: el servicio está saturado, no roto. Se distingue del 500 porque lo
    // que hay que hacer es distinto: acá sí vale la pena reintentar en unos segundos.
    if (e.estado === 503) {
      return 'El servicio está saturado ahora mismo. Probá de nuevo en unos segundos.';
    }
    if (e.estado >= 500) return 'El servidor tuvo un problema. Intentá de nuevo en un momento.';
    return e.message;
  }
  if (esPlazoAgotado(e)) {
    return 'El servidor tardó demasiado en responder. Revisá tu conexión y volvé a intentar.';
  }
  if (e instanceof TypeError) {
    return sinConexion()
      ? 'Parece que te quedaste sin conexión. Volvé a intentar cuando tengas señal.'
      : 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';
  }
  return 'Ocurrió un error inesperado. Intentá de nuevo en un momento.';
}

/**
 * Mensaje para el ENVÍO de un reporte, donde la pregunta del vecino no es «qué falló» sino
 * «¿se mandó o no?».
 *
 * Si la petición salió y no volvió —plazo agotado, red cortada, 503— la respuesta honesta es que
 * no se sabe, y por eso hay que decir también que reintentar es seguro: el envío lleva clave de
 * idempotencia, así que el servidor devuelve el reporte ya creado en vez de duplicarlo.
 * Un 4xx, en cambio, sí es certeza de que no se guardó nada.
 */
export function mensajeDeEnvio(e: unknown): string {
  const dudoso =
    esPlazoAgotado(e) ||
    e instanceof TypeError ||
    (e instanceof ErrorApi && (e.estado >= 500 || e.estado === 0));
  if (!dudoso) return mensajeDeError(e);
  return `${mensajeDeError(e)} Si volvés a darle a «Enviar reporte» no se va a duplicar: el envío ya lleva su propio código.`;
}

function esDetalle(d: unknown): d is DetalleCampo {
  return (
    typeof d === 'object' &&
    d !== null &&
    typeof (d as { campo?: unknown }).campo === 'string' &&
    typeof (d as { mensaje?: unknown }).mensaje === 'string'
  );
}

/** Detalles por campo de un 400 PAYLOAD_INVALIDO (vacío para cualquier otro error). */
export function detallesDeError(e: unknown): DetalleCampo[] {
  if (e instanceof ErrorApi && Array.isArray(e.detalles)) return e.detalles.filter(esDetalle);
  return [];
}
