import type { ExportacionGeoJson } from 'contracts';
import { ErrorApi, ErrorExportacionInvalida } from './api';
import type { Formato } from './formato';

export type ResumenExportacion = Pick<ExportacionGeoJson, 'total' | 'exportados' | 'truncado'>;

/**
 * Aviso cuando la selección no cupo en el archivo. Sin él, un recorte de 50 000 filas se podía
 * tomar por el inventario completo. Las cifras, con el formato de la ciudad del despliegue.
 */
export function avisoExportacion(r: ResumenExportacion, f: Pick<Formato, 'numero'>): string | null {
  if (!r.truncado) return null;
  return `Se exportaron ${f.numero(r.exportados)} de ${f.numero(r.total)} reportes; afiná los filtros.`;
}

export function mensajeErrorExportacion(e: unknown): string {
  if (e instanceof ErrorExportacionInvalida) return e.message;
  if (e instanceof ErrorApi) {
    if (e.estado === 403) return 'Tu cuenta no puede exportar (403).';
    return `No se pudo exportar: ${e.message}`;
  }
  // Un fallo de red llega como TypeError o DOMException, con texto de la plataforma en inglés.
  return 'No pudimos conectar con el servidor para exportar.';
}
