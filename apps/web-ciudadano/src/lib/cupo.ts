import { CONFIG_DOMINIO, type SesionActual } from 'contracts';

/**
 * Cupo diario de reportes de la cuenta (contracts 0.10.0): 3 por día calendario en la zona de la
 * ciudad, contados en la base. Lo de acá es aviso, no control: quien decide es api-core al crear,
 * con su 429 `CUOTA_DE_REPORTES`.
 */
export const REPORTES_POR_DIA = CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA;
export const FOTOS_POR_DIA = CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA;

/**
 * Reportes que le quedan hoy a la cuenta, o `null` si no se sabe. Un api-core anterior a 0.10.0
 * no manda `reportes_restantes_hoy`: ahí un `puede_reportar_desde` con fecha es «ahora ninguno».
 */
export function reportesRestantes(
  usuario: Pick<SesionActual, 'reportes_restantes_hoy' | 'puede_reportar_desde'> | null,
): number | null {
  if (!usuario) return null;
  if (typeof usuario.reportes_restantes_hoy === 'number') return usuario.reportes_restantes_hoy;
  return usuario.puede_reportar_desde ? 0 : null;
}

/** «Te quedan N de 3 reportes hoy», igual para cualquier N: es un contador, no una frase. */
export function textoCupo(restantes: number): string {
  return `Te quedan ${restantes} de ${REPORTES_POR_DIA} reportes hoy`;
}

/** El mismo texto que manda api-core en su 429, para cuando el cuerpo no lo trae. */
export const TEXTO_CUPO_AGOTADO = `Ya enviaste los ${REPORTES_POR_DIA} reportes de hoy. Vas a poder enviar otro mañana.`;

export type EstadoCupo = 'comprobando' | 'agotado' | 'disponible';

/**
 * La puerta del formulario. Al abrirlo se vuelve a preguntar a `/auth/yo` (`revisado` pasa a true
 * cuando contesta, bien o mal): el dato en caché puede ser de antes de los envíos de hoy, y con el
 * cupo agotado hay que avisar ANTES de pedir la ubicación o la cámara. Sin dato no se bloquea a
 * nadie: lo decide el servidor al enviar.
 */
export function estadoDelCupo({
  restantes,
  revisado,
}: {
  restantes: number | null;
  revisado: boolean;
}): EstadoCupo {
  if (!revisado) return 'comprobando';
  return restantes === 0 ? 'agotado' : 'disponible';
}
