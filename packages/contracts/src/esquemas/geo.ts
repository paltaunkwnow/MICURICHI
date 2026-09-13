import { z } from 'zod';
import { SEVERIDADES, TIPOS_CAPA } from '../dominio/enums.js';
import { CoordenadaSchema, LatSchema, LonSchema, UnidadAdministrativaSchema } from './comunes.js';

export const ResolverEntradaSchema = CoordenadaSchema;
export type ResolverEntrada = z.infer<typeof ResolverEntradaSchema>;

/** Respuesta de POST /geo/v1/resolver (CLAUDE.md §7.4). */
export const ResolverRespuestaSchema = z.object({
  dentro_cobertura: z.boolean(),
  distrito: UnidadAdministrativaSchema.nullable(),
  unidad_vecinal: UnidadAdministrativaSchema.nullable(),
  manzana: z.object({ id: z.string(), codigo: z.string() }).nullable(),
  version_capa: z.string().nullable(),
  en_limite: z.boolean(),
  asignado_por_proximidad: z.boolean(),
  distancia_m: z.number().nullable(),
  distrito_discrepante: z.boolean(),
});
export type ResolverRespuesta = z.infer<typeof ResolverRespuestaSchema>;

export const CapasVigentesSchema = z.record(z.enum(TIPOS_CAPA), z.string().nullable());
export type CapasVigentes = z.infer<typeof CapasVigentesSchema>;

export const PuntoCriticoSchema = z.object({
  id: z.uuid(),
  lat: LatSchema,
  lon: LonSchema,
  n_reportes: z.number().int(),
  primer_reporte_en: z.iso.datetime({ offset: true }),
  ultimo_reporte_en: z.iso.datetime({ offset: true }),
  severidad_max: z.enum(SEVERIDADES),
  distrito_id: z.string().nullable(),
  unidad_vecinal_id: z.string().nullable(),
  radio_m: z.number(),
  diametro_m: z.number(),
  advertencia_diametro: z.boolean(),
  calculado_en: z.iso.datetime({ offset: true }),
});
export type PuntoCritico = z.infer<typeof PuntoCriticoSchema>;

export const AgregadoUvSchema = z.object({
  unidad_vecinal_id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  distrito_id: z.string(),
  n_reportes: z.number().int(),
  n_puntos_criticos: z.number().int(),
  severidad_max: z.enum(SEVERIDADES).nullable(),
});
export type AgregadoUv = z.infer<typeof AgregadoUvSchema>;

export const CapaInfoSchema = z.object({
  capa: z.enum(TIPOS_CAPA),
  version: z.string(),
  n_features: z.number().int(),
  bytes_web: z.number().int().nullable(),
  modo: z.enum(['geojson', 'teselas']),
  url: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
});
export type CapaInfo = z.infer<typeof CapaInfoSchema>;
