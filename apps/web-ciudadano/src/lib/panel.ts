import { ROLES_DEL_PANEL, type SesionActual } from 'contracts';

/**
 * Botón «Panel técnico» de la app pública.
 *
 * El panel es otra aplicación (`apps/panel-admin`), con su propio origen: desde aquí solo se puede
 * mandar a quien corresponde. Antes, un técnico o un administrador que entraba en la app pública no
 * tenía ninguna pista de dónde estaba su herramienta.
 *
 * La dirección llega en la sesión (`panel_url` de `GET /api/v1/auth/yo`, contracts 0.7.0), que
 * api-core solo manda a los roles del panel. Antes se fijaba al compilar desde `PANEL_ADMIN_URL` y
 * viajaba en el JavaScript público, a la vista de cualquiera y atada a la imagen construida.
 *
 * Esto es navegación, no permiso. Esconderle el botón a un ciudadano no protege nada: lo que
 * protege el panel es el propio panel, que comprueba el rol al cargar, y api-core, que responde
 * 403 a cualquier acción técnica sin rol técnico.
 */
const ROLES_CON_BOTON: ReadonlySet<SesionActual['rol']> = new Set<SesionActual['rol']>(
  ROLES_DEL_PANEL,
);

/** El ejecutivo no modera (contracts 0.5.0): su herramienta es el resumen, no la bandeja. */
const RUTA_EJECUTIVO = 'ejecutivo';

/**
 * Solo `http(s)` y sin usuario ni contraseña en la URL. Con cualquier otra cosa no hay botón: un
 * enlace roto o a un esquema raro es peor que ninguno. El esquema de contracts ya lo exige; esto
 * lo vuelve a comprobar porque la respuesta de `/auth/yo` no se valida en el cliente.
 */
export function normalizarUrlDelPanel(valor: string | null | undefined): string | null {
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
  if (!rol || !ROLES_CON_BOTON.has(rol) || !url) return null;
  if (rol !== 'ejecutivo') return url;
  // La ruta relativa se resuelve contra el «directorio» de la base: sin barra final, `new URL`
  // descarta el último tramo y un panel servido en /admin llevaría a /ejecutivo en vez de /admin/ejecutivo.
  const base = url.endsWith('/') ? url : `${url}/`;
  return new URL(RUTA_EJECUTIVO, base).href;
}

/**
 * Adónde lleva el botón con la sesión actual, o null si no hay botón: sin sesión, rol sin panel,
 * despliegue sin panel (`panel_url: null`) o api-core anterior a 0.7.0 (sin el campo).
 */
export function destinoDelPanelDeSesion(
  sesion: Pick<SesionActual, 'rol' | 'panel_url'> | null | undefined,
): string | null {
  if (!sesion) return null;
  return destinoDelPanel(sesion.rol, normalizarUrlDelPanel(sesion.panel_url));
}

/** Texto del botón: al ejecutivo no se le ofrece un «panel técnico» que no es el suyo. */
export function textoDelPanel(rol: SesionActual['rol'] | undefined): string {
  return rol === 'ejecutivo' ? 'Panel ejecutivo' : 'Panel técnico';
}
