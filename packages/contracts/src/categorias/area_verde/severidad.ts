import type { Severidad } from '../../dominio/enums.js';
import { severidadMaxima } from '../../dominio/severidad.js';
import {
  type DetalleAreaVerde,
  DetalleAreaVerdeSchema,
  GRAVEDADES_AREA_VERDE,
  TAMANOS_AREA_VERDE,
} from './esquema.js';

export const SEVERIDAD_AREA_VERDE_VERSION = 1;
const BANDAS_DECLARADAS = ['baja', 'media', 'alta', 'critica'] as const;

/** Índice auxiliar 2–8 con piso declarado; no comparable entre categorías. */
export function calcularSeveridadAreaVerde(entrada: DetalleAreaVerde) {
  const detalle = DetalleAreaVerdeSchema.parse(entrada);
  const g = GRAVEDADES_AREA_VERDE.indexOf(detalle.gravedad_declarada);
  const t = TAMANOS_AREA_VERDE.indexOf(detalle.tamano);
  const puntaje = g + t + 2;
  const combinada: Severidad =
    puntaje >= 7 ? 'critica' : puntaje >= 5 ? 'alta' : puntaje >= 4 ? 'media' : 'baja';
  return {
    puntaje,
    banda: severidadMaxima(combinada, BANDAS_DECLARADAS[g]!),
    version: SEVERIDAD_AREA_VERDE_VERSION,
  };
}
