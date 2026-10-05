import {
  CODIGOS_UBICACION_DISPOSITIVO,
  CONFIG_DOMINIO,
  type CodigoUbicacionDispositivo,
} from 'contracts';
import { ErrorApi } from './api';
import { FOTOS_POR_DIA, TEXTO_CUPO_AGOTADO } from './cupo';

const MINUTOS_POSICION = Math.round(CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S / 60);

/**
 * Los 422 de la posición del teléfono (contracts 0.9.0). Cada uno dice qué hacer, porque lo que
 * hay que hacer es distinto: salir afuera, volver a compartir o acercar el punto.
 */
const MENSAJES_UBICACION: Record<CodigoUbicacionDispositivo, string> = {
  PRECISION_INSUFICIENTE: `Tu teléfono no te ubicó con la precisión necesaria (${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m o menos). Salí a un lugar abierto y volvé a compartir tu ubicación.`,
  // ADR 0007: se pidió el camino aproximado pero el dispositivo sí llega a la precisión exigida,
  // así que corresponde el camino normal (con el punto comprobado dentro del radio).
  UBICACION_PRECISA_DISPONIBLE: `Tu dispositivo ahora te ubica con precisión (${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m o menos): volvé a compartir tu ubicación y marcá el punto a ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m o menos de donde estás.`,
  POSICION_VENCIDA: `Tu ubicación era de hace más de ${MINUTOS_POSICION} minutos. Volvé a compartirla para enviar el reporte.`,
  UBICACION_FUERA_DE_RADIO: `El punto quedó a más de ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m de donde estás. Volvé a compartir tu ubicación y ajustá el punto.`,
};

/** El servidor rechazó la posición del teléfono: hay que volver al paso 1 a compartirla de nuevo. */
export function esUbicacionRechazada(e: unknown): boolean {
  return (
    e instanceof ErrorApi && (CODIGOS_UBICACION_DISPOSITIVO as readonly string[]).includes(e.codigo)
  );
}

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
 * La cuenta ya usó los reportes de hoy (429 de cuota). No es el 429 por IP: ese no cambia el cupo
 * de la cuenta, y este sí obliga a volver a preguntar cuántos le quedan.
 */
export function esCuotaAgotada(e: unknown): e is ErrorApi {
  return e instanceof ErrorApi && e.estado === 429 && e.codigo === 'CUOTA_DE_REPORTES';
}

/** El texto de un 429 que el servidor mandó, o `null` si el cuerpo no traía `mensaje`. */
function textoDelServidor(e: ErrorApi): string | null {
  const t = e.message.trim();
  // `pedir` escribe «Error 429» cuando el cuerpo no trae `mensaje`: eso no le dice nada a nadie.
  return t && t !== `Error ${e.estado}` ? t : null;
}

/**
 * Mensaje del 429 `CUOTA_DE_REPORTES`: el del servidor, que dice cuándo vuelve a poder, o el
 * mismo texto dicho desde acá.
 */
export function mensajeDeCuota(e: ErrorApi): string {
  return textoDelServidor(e) ?? TEXTO_CUPO_AGOTADO;
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
    if (esUbicacionRechazada(e)) return MENSAJES_UBICACION[e.codigo as CodigoUbicacionDispositivo];
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
 * El 429 `CUOTA_DE_FOTOS` (tope diario de fotos de la cuenta) trae su propio texto, y es ese el
 * que hay que mostrar. Si el cuerpo no lo trajera, se explica el tope con palabras.
 */
export function mensajeDeFoto(e: unknown): string {
  if (e instanceof ErrorApi && e.estado === 429 && e.codigo === 'CUOTA_DE_FOTOS')
    return (
      textoDelServidor(e) ??
      `Llegaste al máximo de ${FOTOS_POR_DIA} fotos por día. Mañana vas a poder sacar más; lo demás del reporte sigue guardado y lo podés enviar sin foto.`
    );
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
