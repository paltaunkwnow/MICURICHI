import { CONFIG_DOMINIO, type SesionActual } from 'contracts';
import { REPORTES_POR_DIA, reportesRestantes } from './cupo';

/**
 * Demora de publicación (contracts 0.11.0): el reporte llega al servidor al tocar «Enviar» y se
 * hace visible 1 minuto después si es el 1.º del día de la cuenta, o 4 si es el 2.º o el 3.º. La
 * fija api-core en `publicar_en`; acá solo se avisa y se cuenta hacia atrás.
 */

/**
 * Segundos que tardaría en publicarse el próximo reporte, o `null` si no se sabe. Lo dice
 * `/auth/yo` en `demora_proximo_s`; un api-core que todavía no lo manda deja deducirlo del cupo
 * (con los 3 intactos, es el primero del día).
 */
export function demoraDelProximo(
  usuario: Pick<
    SesionActual,
    'demora_proximo_s' | 'reportes_restantes_hoy' | 'puede_reportar_desde'
  > | null,
): number | null {
  if (!usuario) return null;
  if (typeof usuario.demora_proximo_s === 'number') return usuario.demora_proximo_s;
  if (typeof usuario.reportes_restantes_hoy !== 'number') return null;
  const restantes = reportesRestantes(usuario);
  if (restantes === null) return null;
  return restantes >= REPORTES_POR_DIA
    ? CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S
    : CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S;
}

/** «Se publica 1 minuto después de enviarlo» (o 4), para la revisión antes de enviar. */
export function textoDemora(segundos: number | null): string {
  if (segundos === null) return 'Se publica unos minutos después de enviarlo';
  if (segundos <= 0) return 'Se publica apenas lo envíes';
  const minutos = Math.ceil(segundos / 60);
  return `Se publica ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} después de enviarlo`;
}

/**
 * Lo que falta, contado desde que llegó la respuesta con el reloj del teléfono solo como
 * cronómetro. Los segundos iniciales los calcula la base (`segundos_para_publicar`): comparar
 * `publicar_en` con la hora del teléfono daría cualquier cosa en uno con la hora mal puesta.
 */
export function segundosQueFaltan(
  segundosParaPublicar: number,
  recibidoEnMs: number,
  ahoraMs: number,
): number {
  const pasados = Math.max(0, Math.floor((ahoraMs - recibidoEnMs) / 1000));
  return Math.max(0, segundosParaPublicar - pasados);
}

/** `240` → `4:00`. */
export function formatoCuenta(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** El mapa público no se refresca solo: cuando llega la hora, hay que decir que se recargue. */
export const TEXTO_YA_PUBLICADO = 'Ya está publicado · recargá el mapa para verlo';

export function textoCuentaRegresiva(restantes: number): string {
  return restantes > 0 ? `Se publica en ${formatoCuenta(restantes)}` : TEXTO_YA_PUBLICADO;
}
