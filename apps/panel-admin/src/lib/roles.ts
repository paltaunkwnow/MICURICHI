import type { Rol } from 'contracts';

/**
 * Qué puede ver cada rol dentro del panel. Es solo la puerta de la interfaz: el permiso real lo
 * aplica api-core en cada ruta (el ejecutivo recibe 403 en moderación, exportación e indicadores).
 */

export const RUTA_EJECUTIVO = '/ejecutivo';
export const RUTA_PLANO = '/plano';
export const RUTA_CAPAS = '/capas';

/** Roles que entran al panel. Un `ciudadano` con sesión no tiene nada que hacer acá. */
export function puedeEntrarAlPanel(rol: Rol): boolean {
  return rol === 'tecnico' || rol === 'admin' || rol === 'ejecutivo';
}

/** Adónde va cada rol después del login (y desde la raíz). */
export function rutaInicial(rol: Rol): string {
  return rol === 'ejecutivo' ? RUTA_EJECUTIVO : '/reportes';
}

/**
 * Adónde saca /login a quien ya tiene sesión, o `null` para quedarse en el formulario. Una cuenta
 * ciudadana se queda: antes rebotaba a /reportes, donde solo veía «no tiene acceso», y no podía
 * volver al login para entrar con otra cuenta.
 */
export function destinoDesdeLogin(rol: Rol | undefined): string | null {
  return rol && puedeEntrarAlPanel(rol) ? rutaInicial(rol) : null;
}

/** El ejecutivo solo ve su panel; técnico y administrador, todo el panel. */
export function puedeVerRuta(rol: Rol, ruta: string): boolean {
  if (rol === 'tecnico' || rol === 'admin') return true;
  if (rol === 'ejecutivo') return ruta === RUTA_EJECUTIVO || ruta.startsWith(`${RUTA_EJECUTIVO}/`);
  return false;
}

export interface EnlacePanel {
  href: string;
  texto: string;
}

const ENLACES_PANEL: EnlacePanel[] = [
  { href: RUTA_EJECUTIVO, texto: 'Ejecutivo' },
  { href: '/reportes', texto: 'Reportes' },
  { href: '/indicadores', texto: 'Indicadores' },
  { href: RUTA_CAPAS, texto: 'Capas' },
  { href: RUTA_PLANO, texto: 'Plano oficial' },
];

/** true si alguna versión de capa está cargada pero todavía sin activar (`vigente = false`). */
export function hayVersionCapaPendiente(versiones: ReadonlyArray<{ vigente: boolean }>): boolean {
  return versiones.some((v) => !v.vigente);
}

/**
 * «Capas» es administración: la ve solo el admin, y solo cuando hay una versión cargada sin
 * activar esperando que la active. Técnico y ejecutivo no la ven nunca; por eso la barra lateral
 * ni siquiera pide las versiones para esos roles.
 */
export function debeMostrarEnlaceCapas(rol: Rol, hayVersionPendiente: boolean): boolean {
  return rol === 'admin' && hayVersionPendiente;
}

export interface OpcionesEnlaces {
  /** La instalación tiene plano de referencia (`hayPlanoDeReferencia` en `plano.ts`). */
  planoDeReferencia: boolean;
  /** Hay una versión de capa cargada sin activar (solo se consulta para el admin). */
  capasPendientes: boolean;
}

/**
 * Enlaces de la barra lateral que corresponden al rol y a la instalación: «Plano oficial» es
 * contenido de la ciudad que tiene plano de referencia; «Capas» es administración y solo aparece
 * cuando el admin tiene una versión sin activar (`debeMostrarEnlaceCapas`).
 */
export function enlacesPara(rol: Rol, opciones: OpcionesEnlaces): EnlacePanel[] {
  return ENLACES_PANEL.filter((e) => {
    if (e.href === RUTA_CAPAS) return debeMostrarEnlaceCapas(rol, opciones.capasPendientes);
    if (e.href === RUTA_PLANO) return puedeVerRuta(rol, e.href) && opciones.planoDeReferencia;
    return puedeVerRuta(rol, e.href);
  });
}

/**
 * «Volver al inicio» de las páginas de error: la pantalla de cada rol. Antes iba siempre a
 * /reportes y el ejecutivo rebotaba a su panel con el aviso de acceso. Sin sesión conocida
 * decide la raíz, que hace lo mismo con el rol que obtiene o manda al login.
 */
export function enlaceInicio(rol: Rol | undefined): EnlacePanel {
  if (rol === 'ejecutivo') return { href: rutaInicial(rol), texto: 'Ir al panel ejecutivo' };
  if (rol === 'tecnico' || rol === 'admin')
    return { href: rutaInicial(rol), texto: 'Ir a la bandeja' };
  return { href: '/', texto: 'Ir al inicio' };
}
