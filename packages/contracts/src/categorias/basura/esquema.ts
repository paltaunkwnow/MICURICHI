import { z } from 'zod';

/** Valores aprobados para la entrega local; referencias ciudadanas, no mediciones. */
export const SUBTIPOS_BASURA = [
  'microbasural',
  'contenedor_desbordado',
  'quema_basura',
  'escombros_via',
  'basura_canal',
] as const;
export const GRAVEDADES_BASURA = [
  'bolsas_sueltas',
  'acumulada_dias',
  'ocupa_via',
  'quema_o_desague',
] as const;
export const TAMANOS_BASURA = ['bolsas', 'carretilla', 'camioneta', 'camion_o_mas'] as const;

export const SubtipoBasuraSchema = z.enum(SUBTIPOS_BASURA);
export type SubtipoBasura = z.infer<typeof SubtipoBasuraSchema>;

/** Subtipo obligatorio en el núcleo, nunca duplicado en el detalle. Sin defaults. */
export const DetalleBasuraSchema = z.strictObject({
  gravedad_declarada: z.enum(GRAVEDADES_BASURA),
  tamano: z.enum(TAMANOS_BASURA),
});
export type DetalleBasura = z.infer<typeof DetalleBasuraSchema>;
