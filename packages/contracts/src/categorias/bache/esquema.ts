import { z } from 'zod';

/** ADR 0024: orden y referencias visuales del piloto; no son medidas de pavimento. */
export const SUBTIPOS_BACHE = [
  'bache',
  'hundimiento_calzada',
  'tapa_alcantarilla_faltante',
  'asfalto_levantado',
  'calle_tierra_intransitable',
] as const;
export const GRAVEDADES_BACHE = [
  'se_puede_pasar',
  'hay_que_esquivar',
  'peligroso',
  'causo_accidente',
] as const;
export const TAMANOS_BACHE = ['plato', 'rueda', 'medio_carril', 'todo_el_carril'] as const;

export const SubtipoBacheSchema = z.enum(SUBTIPOS_BACHE);
export type SubtipoBache = z.infer<typeof SubtipoBacheSchema>;

/** El subtipo pertenece al núcleo, nunca se duplica en el detalle. Sin defaults silenciosos. */
export const DetalleBacheSchema = z.strictObject({
  gravedad_declarada: z.enum(GRAVEDADES_BACHE),
  tamano: z.enum(TAMANOS_BACHE),
});
export type DetalleBache = z.infer<typeof DetalleBacheSchema>;
