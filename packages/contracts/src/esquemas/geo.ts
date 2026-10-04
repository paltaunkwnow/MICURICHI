import { z } from 'zod';
import { SEVERIDADES, TIPOS_CAPA, type TipoCapa } from '../dominio/enums.js';
import { CoordenadaSchema, LatSchema, LonSchema, UnidadAdministrativaSchema } from './comunes.js';

export const ResolverEntradaSchema = CoordenadaSchema;
export type ResolverEntrada = z.infer<typeof ResolverEntradaSchema>;

/** Respuesta de POST /geo/v1/resolver (CLAUDE.md §7.4). */
export const ResolverRespuestaSchema = z.object({
  dentro_cobertura: z.boolean(),
  distrito: UnidadAdministrativaSchema.nullable(),
  unidad_vecinal: UnidadAdministrativaSchema.nullable(),
  // Obsoleto desde 0.17.0: geo-service dejó de calcular el PIP de manzana (corría en cada
  // resolución y nadie lo lee; el reporte dejó de guardar manzana en la migración 0010). El campo
  // queda en el esquema, siempre null, para no romper un cliente con la app vieja en caché; se
  // quita en una contracción posterior.
  manzana: z.object({ id: z.string(), codigo: z.string() }).nullable().meta({
    deprecated: true,
    description:
      'Obsoleto desde 0.17.0: geo-service ya no calcula el PIP de manzana y este campo es siempre null. Ningún consumidor lo lee (el reporte dejó de guardar manzana en la migración 0010); se quita en una contracción posterior.',
  }),
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

/**
 * Reportes publicados por UV (`GET /geo/v1/agregados/unidades-vecinales`): los de
 * `ESTADOS_PUBLICOS` con `publicar_en <= now()`, sin verificar incluidos. Desde 0.11.0 la coropleta
 * pública se pinta con `severidad_max_verificada` y no con `severidad_max`: un solo reporte falso
 * de más de 70 cm pintaría de crítica una UV entera.
 */
export const AgregadoUvSchema = z.object({
  unidad_vecinal_id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  distrito_id: z.string(),
  n_reportes: z.number().int().meta({
    description: 'Reportes publicados en la UV: nuevo (sin verificar), validado y resuelto',
  }),
  n_verificados: z.number().int().min(0).meta({
    description: 'De n_reportes, los verificados (validado y resuelto)',
  }),
  n_puntos_criticos: z.number().int().meta({
    description: 'Puntos críticos de la UV; se arman solo con reportes verificados',
  }),
  severidad_max: z.enum(SEVERIDADES).nullable().meta({
    description: 'Severidad efectiva máxima de los reportes publicados, sin verificar incluidos',
  }),
  severidad_max_verificada: z.enum(SEVERIDADES).nullable().meta({
    description:
      'Severidad efectiva máxima de los verificados; null si la UV no tiene ninguno (la coropleta pública la pinta neutra)',
  }),
});
export type AgregadoUv = z.infer<typeof AgregadoUvSchema>;

/**
 * Huella del contenido que sirve geo-service para una capa: los primeros 16 caracteres
 * hexadecimales (64 bits) del SHA-256 del GeoJSON web en memoria, del que salen también las
 * teselas. Va en la URL para poder cachearla un año como `immutable`: si el contenido cambia,
 * cambia la URL. Es del contenido servido y no del nombre de la versión, así que recargar la misma
 * versión con otra geometría también la cambia (desde 0.12.0).
 */
export const HuellaCapaSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, 'Huella de capa: 16 caracteres hexadecimales en minúscula.');
export type HuellaCapa = z.infer<typeof HuellaCapaSchema>;

/** Código del 410 de una capa o tesela pedida con una huella que ya no es la vigente. */
export const CODIGO_CAPA_CAMBIO = 'CAPA_CAMBIO';

/** GeoJSON web de la capa con huella: la `url` de `CapaInfo` en modo `geojson`. */
export function rutaCapaConHuella(capa: TipoCapa, huella: HuellaCapa): string {
  return `/geo/v1/capas/${capa}/v/${huella}`;
}

/** Plantilla de teselas con huella, con `{z}/{x}/{y}` literales: la `url` en modo `teselas`. */
export function rutaTeselasConHuella(capa: TipoCapa, huella: HuellaCapa): string {
  return `/geo/v1/teselas/${capa}/${huella}/{z}/{x}/{y}.mvt`;
}

export const CapaInfoSchema = z.object({
  capa: z.enum(TIPOS_CAPA),
  version: z.string(),
  n_features: z.number().int(),
  bytes_web: z.number().int().nullable(),
  modo: z.enum(['geojson', 'teselas']),
  url: z.string().meta({
    description:
      'Ruta relativa con la huella del contenido servido (desde 0.12.0): /geo/v1/capas/{capa}/v/{huella} en modo geojson, o la plantilla /geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt en modo teselas. Es la que tienen que usar los clientes: se cachea un año y, cuando la capa cambia, responde 410 CAPA_CAMBIO y hay que volver a pedir /geo/v1/capas',
  }),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
});
export type CapaInfo = z.infer<typeof CapaInfoSchema>;
