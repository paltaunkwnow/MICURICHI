import { z } from 'zod';

/** Valores aprobados para la entrega local; sin capa de parques ni datos de personas. */
export const SUBTIPOS_AREA_VERDE = [
  'parque_plaza_descuidada',
  'juegos_infantiles_rotos',
  'arbol_rama_peligrosa',
  'pasto_sin_riego',
  'persona_situacion_calle',
] as const;
export const GRAVEDADES_AREA_VERDE = [
  'descuidado',
  'uso_limitado',
  'riesgo',
  'peligro_inmediato',
] as const;
export const TAMANOS_AREA_VERDE = [
  'rincon',
  'media_plaza',
  'casi_toda_plaza',
  'toda_area_verde',
] as const;

export const SubtipoAreaVerdeSchema = z.enum(SUBTIPOS_AREA_VERDE);
export type SubtipoAreaVerde = z.infer<typeof SubtipoAreaVerdeSchema>;

/** Subtipo obligatorio en el núcleo, nunca duplicado en el detalle. Sin defaults. */
export const DetalleAreaVerdeSchema = z.strictObject({
  gravedad_declarada: z.enum(GRAVEDADES_AREA_VERDE),
  tamano: z.enum(TAMANOS_AREA_VERDE),
});
export type DetalleAreaVerde = z.infer<typeof DetalleAreaVerdeSchema>;
