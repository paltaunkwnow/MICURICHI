import type { Severidad } from '../../dominio/enums.js';
import { severidadMaxima } from '../../dominio/severidad.js';
import {
  type DetalleBache,
  DetalleBacheSchema,
  GRAVEDADES_BACHE,
  TAMANOS_BACHE,
} from './esquema.js';

export const SEVERIDAD_BACHE_VERSION = 1;
const BANDAS_DECLARADAS = ['baja', 'media', 'alta', 'critica'] as const;

/** Índice auxiliar 2–8 y piso de gravedad declarada (ADR 0024); no comparable con Inundaciones. */
export function calcularSeveridadBache(entrada: DetalleBache) {
  const detalle = DetalleBacheSchema.parse(entrada);
  const g = GRAVEDADES_BACHE.indexOf(detalle.gravedad_declarada);
  const t = TAMANOS_BACHE.indexOf(detalle.tamano);
  const puntaje = g + t + 2;
  const combinada: Severidad =
    puntaje >= 7 ? 'critica' : puntaje >= 5 ? 'alta' : puntaje >= 4 ? 'media' : 'baja';
  return {
    puntaje,
    banda: severidadMaxima(combinada, BANDAS_DECLARADAS[g]!),
    version: SEVERIDAD_BACHE_VERSION,
  };
}
