import type { Severidad } from '../../dominio/enums.js';
import { severidadMaxima } from '../../dominio/severidad.js';
import {
  type DetalleBasura,
  DetalleBasuraSchema,
  GRAVEDADES_BASURA,
  TAMANOS_BASURA,
} from './esquema.js';

export const SEVERIDAD_BASURA_VERSION = 1;
const BANDAS_DECLARADAS = ['baja', 'media', 'alta', 'critica'] as const;

/** Índice auxiliar 2–8 con piso declarado; no comparable entre categorías. */
export function calcularSeveridadBasura(entrada: DetalleBasura) {
  const detalle = DetalleBasuraSchema.parse(entrada);
  const g = GRAVEDADES_BASURA.indexOf(detalle.gravedad_declarada);
  const t = TAMANOS_BASURA.indexOf(detalle.tamano);
  const puntaje = g + t + 2;
  const combinada: Severidad =
    puntaje >= 7 ? 'critica' : puntaje >= 5 ? 'alta' : puntaje >= 4 ? 'media' : 'baja';
  return {
    puntaje,
    banda: severidadMaxima(combinada, BANDAS_DECLARADAS[g]!),
    version: SEVERIDAD_BASURA_VERSION,
  };
}
