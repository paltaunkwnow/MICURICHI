import type { Rol } from 'contracts';

/**
 * Qué puede ver cada rol dentro del panel. Es solo la puerta de la interfaz: el permiso real lo
 * aplica api-core en cada ruta (el ejecutivo recibe 403 en moderación, exportación e indicadores).
 */

export const RUTA_EJECUTIVO = '/ejecutivo';

/** Roles que entran al panel. Un `ciudadano` con sesión no tiene nada que hacer acá. */
export function puedeEntrarAlPanel(rol: Rol): boolean {
  return rol === 'tecnico' || rol === 'admin' || rol === 'ejecutivo';
}

/** Adónde va cada rol después del login (y desde la raíz). */
export function rutaInicial(rol: Rol): string {
  return rol === 'ejecutivo' ? RUTA_EJECUTIVO : '/reportes';
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
  { href: '/plano', texto: 'Plano oficial' },
];

/** Enlaces de la barra lateral que corresponden al rol. */
export function enlacesPara(rol: Rol): EnlacePanel[] {
  return ENLACES_PANEL.filter((e) => puedeVerRuta(rol, e.href));
}
