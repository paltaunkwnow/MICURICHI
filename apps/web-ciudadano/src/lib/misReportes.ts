/**
 * Seguimiento local de los reportes enviados desde ESTE dispositivo.
 *
 * Desde la Fase 5 hace falta una cuenta para reportar, pero el servidor **sigue sin publicar**
 * quién envió cada punto: `autor_id` no sale en ninguna vista pública. Esta lista no la da la
 * API: la recuerda el navegador a partir de los identificadores que le devolvió al enviar. Con
 * eso «Mis reportes» consulta el estado real de cada uno contra `GET /api/v1/reportes/:id`:
 *
 *   200 → ya está publicado (validado o resuelto) y se muestra con sus datos reales
 *   404 → sigue en revisión, o fue rechazado; la vista pública no lo expone (moderación previa)
 *
 * Si el vecino borra los datos del navegador o cambia de teléfono, pierde la lista, y así se le
 * dice en la pantalla. Ahora que existen cuentas se podría servir esta lista desde el servidor
 * —el dato está—, pero eso es una vista nueva sobre reportes sin moderar y no se ha diseñado: se
 * deja anotado como trabajo pendiente en vez de improvisarlo.
 */

const CLAVE = 'curichi.mis-reportes.v1';
/** Tope de la lista: es una ayuda de seguimiento, no un archivo histórico. */
const MAXIMO = 50;

export interface ReporteLocal {
  id: string;
  /** ISO 8601 del momento del envío, según el reloj del dispositivo. */
  enviado_en: string;
  /** Lo que se mostraba al enviar, para poder pintar la tarjeta aunque la API responda 404. */
  titulo: string;
  unidad_vecinal: string | null;
  distrito: string | null;
  severidad: string;
  tiene_foto: boolean;
}

function disponible(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Safari en navegación privada y los navegadores con almacenamiento bloqueado lanzan aquí.
    return false;
  }
}

export function leerMisReportes(): ReporteLocal[] {
  if (!disponible()) return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (r): r is ReporteLocal =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as ReporteLocal).id === 'string' &&
        typeof (r as ReporteLocal).enviado_en === 'string',
    );
  } catch {
    return [];
  }
}

export function recordarReporte(r: ReporteLocal): void {
  if (!disponible()) return;
  try {
    const lista = [r, ...leerMisReportes().filter((x) => x.id !== r.id)].slice(0, MAXIMO);
    window.localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    // Cuota llena o almacenamiento bloqueado: el reporte ya se envió, que es lo que importa.
  }
}

export function olvidarReportes(): void {
  if (!disponible()) return;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}
