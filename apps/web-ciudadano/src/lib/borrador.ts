import type { ReporteCrearEntrada } from 'contracts';

/**
 * Borrador del formulario de reporte, para que recargar la página no cueste empezar de cero.
 *
 * El caso que lo justifica no es el descuido: es el teléfono. Al tocar «Agregar» foto, el
 * navegador cede el control a la cámara o al selector de archivos, y en un móvil con poca memoria
 * eso puede descartar la pestaña; al volver, la página se recarga. Sin esto, el vecino que ya
 * había contestado cinco pantallas se encontraba con el paso 1 en blanco. El mismo caso se da al
 * tocar «atrás» sin querer, o al girar el teléfono en algunos navegadores.
 *
 * Va en `sessionStorage` y no en `localStorage` a propósito: el borrador pertenece a ESTA sesión
 * de la pestaña. Sobrevive a la recarga, que es lo que hace falta, y desaparece al cerrar, que es
 * lo que corresponde a un formulario que nadie llegó a enviar. En un teléfono prestado o
 * compartido, un borrador que quedara meses guardado sería un dato de más sobre quién estuvo ahí.
 *
 * No guarda las fotos, solo sus `objeto_key`: los bytes ya están en el servidor y el vale dura
 * 24 h (`HORAS_VALIDEZ_FOTO` en api-core). Por eso el borrador caduca antes que ellos.
 */

const CLAVE = 'curichi.borrador-reporte.v1';

/** Caduca antes que el vale de las fotos (24 h), para no restaurar un reporte con fotos muertas. */
export const VALIDEZ_MS = 12 * 60 * 60 * 1000;

export interface Borrador {
  /** Momento del último guardado, en milisegundos desde época. */
  guardado_en: number;
  paso: number;
  ubicacion: {
    lat: number;
    lon: number;
    metodo: 'gps' | 'manual';
    precisionM: number | null;
  } | null;
  /** Lo que respondió `POST /geo/v1/resolver` para esa ubicación, para no repetir la llamada. */
  resuelto: unknown;
  fotos: Array<{ objeto_key: string; url: string }>;
  valores: Partial<ReporteCrearEntrada>;
  /**
   * La clave de idempotencia se guarda con el resto: si la página se recarga justo después de
   * enviar, el reintento tiene que llevar la MISMA clave o el servidor crearía un segundo reporte.
   */
  clave: string;
}

function almacen(): Storage | null {
  try {
    // Safari en navegación privada y los navegadores con almacenamiento bloqueado lanzan aquí.
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(b: Omit<Borrador, 'guardado_en'>): void {
  const s = almacen();
  if (!s) return;
  try {
    s.setItem(CLAVE, JSON.stringify({ ...b, guardado_en: Date.now() }));
  } catch {
    // Cuota llena: el formulario sigue funcionando en memoria, que es lo que importa.
  }
}

/** Devuelve el borrador si existe, es legible y no caducó. Cualquier otra cosa es `null`. */
export function leerBorrador(): Borrador | null {
  const s = almacen();
  if (!s) return null;
  try {
    const crudo = s.getItem(CLAVE);
    if (!crudo) return null;
    const b: unknown = JSON.parse(crudo);
    if (typeof b !== 'object' || b === null) return null;
    const d = b as Partial<Borrador>;
    if (typeof d.guardado_en !== 'number' || typeof d.clave !== 'string') return null;
    if (Date.now() - d.guardado_en > VALIDEZ_MS) {
      olvidarBorrador();
      return null;
    }
    return {
      guardado_en: d.guardado_en,
      paso: typeof d.paso === 'number' && d.paso >= 1 && d.paso <= 5 ? d.paso : 1,
      ubicacion: d.ubicacion ?? null,
      resuelto: d.resuelto ?? null,
      fotos: Array.isArray(d.fotos) ? d.fotos.filter((f) => typeof f?.objeto_key === 'string') : [],
      valores: typeof d.valores === 'object' && d.valores !== null ? d.valores : {},
      clave: d.clave,
    };
  } catch {
    // Basura de una versión anterior o JSON roto: se descarta en silencio.
    return null;
  }
}

export function olvidarBorrador(): void {
  const s = almacen();
  if (!s) return;
  try {
    s.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}

/** ¿Hay algo que valga la pena restaurar, o el borrador está prácticamente vacío? */
export function borradorTieneContenido(b: Borrador): boolean {
  return (
    b.paso > 1 ||
    b.fotos.length > 0 ||
    !!b.ubicacion ||
    Object.entries(b.valores).some(
      ([clave, v]) =>
        !['ubicacion_tipo', 'causa_presunta', 'fotos', 'sitio_web'].includes(clave) &&
        v !== undefined &&
        v !== null &&
        v !== '',
    )
  );
}
