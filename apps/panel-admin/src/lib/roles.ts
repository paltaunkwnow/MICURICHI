import type { Rol } from 'contracts';

/**
 * Qué puede ver cada rol dentro del panel. Es solo la puerta de la interfaz: el permiso real lo
 * aplica api-core en cada ruta (el ejecutivo recibe 403 en moderación, exportación e indicadores).
 */

export const RUTA_EJECUTIVO = '/ejecutivo';
export const RUTA_PLANO = '/plano';

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
  { href: '/capas', texto: 'Capas' },
  { href: RUTA_PLANO, texto: 'Plano oficial' },
];

/**
 * Enlaces de la barra lateral que corresponden al rol y a la instalación: «Plano oficial» es
 * contenido de la ciudad que tiene plano de referencia (`hayPlanoDeReferencia` en `plano.ts`).
 */
export function enlacesPara(rol: Rol, instalacion: { planoDeReferencia: boolean }): EnlacePanel[] {
  return ENLACES_PANEL.filter(
    (e) => puedeVerRuta(rol, e.href) && (e.href !== RUTA_PLANO || instalacion.planoDeReferencia),
  );
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
