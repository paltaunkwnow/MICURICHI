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

/**
 * Punto crítico tal como se PUBLICA (`GET /geo/v1/puntos-criticos`, ruta pública sin sesión).
 *
 * `radio_m`, `diametro_m` y `advertencia_diametro` estaban aquí y se han quitado. Los tres son
 * medidas derivadas de las coordenadas EXACTAS de los reportes del grupo —`diametro_m` es
 * literalmente la distancia entre los dos miembros más separados, redondeada a 0,1 m— mientras que
 * `lat`/`lon` salen de `geom_publico`, que va desplazado. Publicar juntas una posición degradada y
 * una medida exacta sobre las posiciones reales es regalar una ecuación que acota dónde pueden
 * estar de verdad esas viviendas.
 *
 * Se midió antes de decidir, con el jitter real y 110 casos simulados: el radio de la región donde
 * puede estar la vivienda baja de 29,2 m a 28,9 m de mediana (24,8 m en el caso más favorable al
 * atacante). Es decir, la fuga es **real pero débil**: no compromete una dirección por sí sola.
 * Se quita igualmente porque no cuesta nada y ningún cliente los usaba: es dato mínimo (§13), no
 * una emergencia.
 *
 * Siguen en la tabla `punto_critico` para el análisis del técnico (§9.2, advertencia de
 * encadenamiento de DBSCAN); lo que cambia es que no salen por una ruta pública.
 */
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
  calculado_en: z.iso.datetime({ offset: true }),
});
export type PuntoCritico = z.infer<typeof PuntoCriticoSchema>;

/** Campos de `punto_critico` derivados de la geometría exacta: nunca salen por una ruta pública. */
export const CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES = [
  'radio_m',
  'diametro_m',
  'advertencia_diametro',
] as const;

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
