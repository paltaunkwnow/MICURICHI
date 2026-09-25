import type { SesionActual } from 'contracts';

/**
 * Botón «Panel técnico» de la app pública.
 *
 * El panel es otra aplicación (`apps/panel-admin`), con su propio origen: desde aquí solo se puede
 * mandar a quien corresponde. Antes, un técnico o un administrador que entraba en la app pública no
 * tenía ninguna pista de dónde estaba su herramienta.
 *
 * Esto es navegación, no permiso. Esconderle el botón a un ciudadano no protege nada: lo que
 * protege el panel es el propio panel, que comprueba el rol al cargar, y api-core, que responde
 * 403 a cualquier acción técnica sin rol técnico.
 */
const ROLES_DEL_PANEL: ReadonlySet<SesionActual['rol']> = new Set(['tecnico', 'admin']);

/**
 * Solo `http(s)` y sin usuario ni contraseña en la URL. Con cualquier otra cosa no hay botón: un
 * enlace roto o a un esquema raro es peor que ninguno, y el valor configurado se ve en el README.
 */
export function normalizarUrlDelPanel(valor: string | undefined): string | null {
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

/** Adónde lleva el botón para este rol, o null si este rol no lo ve. */
export function destinoDelPanel(
  rol: SesionActual['rol'] | undefined,
  url: string | null,
): string | null {
  if (!rol || !ROLES_DEL_PANEL.has(rol)) return null;
  return url;
}

/** Fijada al compilar desde `PANEL_ADMIN_URL` (ver `next.config.ts`): viaja en el JavaScript. */
export const URL_DEL_PANEL = normalizarUrlDelPanel(process.env.PANEL_ADMIN_URL);
