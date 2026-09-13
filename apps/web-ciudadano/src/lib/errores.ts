import { ErrorApi } from './api';

export interface DetalleCampo {
  campo: string;
  mensaje: string;
}

/** Mensaje en español y en tono cercano para cualquier error de red o de la API. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) {
    if (e.codigo === 'FUERA_DE_COBERTURA') {
      return 'Ese punto queda fuera del municipio. Revisá la ubicación e intentá de nuevo.';
    }
    if (e.estado === 429) {
      return e.message || 'Demasiadas solicitudes. Esperá un momento y volvé a intentar.';
    }
    if (e.codigo === 'PAYLOAD_INVALIDO') {
      return 'Revisá los datos marcados: hay campos que faltan o no son válidos.';
    }
    if (e.estado >= 500) return 'El servidor tuvo un problema. Intentá de nuevo en un momento.';
    return e.message;
  }
  if (e instanceof TypeError) {
    return 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';
  }
  return 'Ocurrió un error inesperado. Intentá de nuevo en un momento.';
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
