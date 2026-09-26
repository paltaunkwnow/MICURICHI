import { CONFIG_DOMINIO } from 'contracts';
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

/**
 * La sesión venció a mitad del formulario (401). Vale para el envío y para la subida de una foto:
 * las dos llevan la cookie, y las dos tienen que acabar en «Se cerró tu sesión» con el borrador
 * guardado, no en un error suelto que no dice qué hacer.
 */
export function esSesionCaducada(e: unknown): boolean {
  return e instanceof ErrorApi && e.estado === 401;
}

/**
 * La cuenta ya envió un reporte hace poco (429 de cuota). No es el 429 por IP: ese no cambia el
 * turno de la cuenta, y este sí obliga a volver a preguntar cuándo puede reportar.
 */
export function esCuotaAgotada(e: unknown): e is ErrorApi {
  return e instanceof ErrorApi && e.estado === 429 && e.codigo === 'CUOTA_DE_REPORTES';
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
 * Mensaje para la SUBIDA de una foto, que se muestra junto a las fotos y no toca el resto del
 * formulario.
 *
 * El 429 `CUOTA_DE_FOTOS` (tope de fotos por hora de la cuenta) trae su propio texto con el tiempo
 * que falta, y es ese el que hay que mostrar. Si el cuerpo no lo trajera, `pedir` deja «Error 429»
 * como mensaje, que no le dice nada a nadie: en ese caso se explica el tope con palabras.
 */
export function mensajeDeFoto(e: unknown): string {
  if (e instanceof ErrorApi && e.estado === 429 && e.codigo === 'CUOTA_DE_FOTOS') {
    const delServidor = e.message.trim();
    return delServidor && delServidor !== `Error ${e.estado}`
      ? delServidor
      : `Llegaste al máximo de ${CONFIG_DOMINIO.FOTOS_POR_HORA_POR_CUENTA} fotos por hora. Probá de nuevo en un rato; lo demás del reporte sigue guardado.`;
  }
  return mensajeDeError(e);
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
