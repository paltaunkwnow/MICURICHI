import { z } from 'zod';
import { CONFIG_DOMINIO } from '../dominio/config.js';
import {
  AFECTACIONES,
  CAUSAS_PRESUNTAS,
  DURACIONES,
  ESTADOS_REPORTE,
  FRECUENCIAS,
  SEVERIDADES,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
  TIRANTES,
  UBICACION_METODOS,
  UBICACION_TIPOS,
} from '../dominio/enums.js';
import {
  BboxSchema,
  LatSchema,
  LonSchema,
  listaDesdeQuery,
  PaginacionSchema,
  UnidadAdministrativaSchema,
} from './comunes.js';

/** Payload de creación de reporte (ciudadano). Validado en servidor por api-core. */
export const ReporteCrearSchema = z.object({
  lat: LatSchema,
  lon: LonSchema,
  ubicacion_metodo: z.enum(UBICACION_METODOS),
  precision_gps_m: z.number().nonnegative().max(10_000).nullable().optional(),
  ubicacion_tipo: z.enum(UBICACION_TIPOS),
  descripcion: z
    .string()
    .trim()
    .min(
      CONFIG_DOMINIO.DESCRIPCION_MIN,
      `Escribí al menos ${CONFIG_DOMINIO.DESCRIPCION_MIN} caracteres para poder enviar.`,
    )
    .max(CONFIG_DOMINIO.DESCRIPCION_MAX, `Máximo ${CONFIG_DOMINIO.DESCRIPCION_MAX} caracteres.`),
  tirante_estimado: z.enum(TIRANTES),
  duracion_estimada: z.enum(DURACIONES),
  frecuencia: z.enum(FRECUENCIAS),
  afectacion: z.enum(AFECTACIONES),
  causa_presunta: z.enum(CAUSAS_PRESUNTAS).default('desconocida'),
  sumidero_cercano: z.enum(SUMIDERO_CERCANO).nullable().optional(),
  sumidero_estado: z.enum(SUMIDERO_ESTADOS).nullable().optional(),
  agua_brota_sumidero: z.boolean().nullable().optional(),
  evento_en: z.iso.datetime({ offset: true }).nullable().optional(),
  /** Claves de objeto devueltas por POST /fotos, máximo 3. */
  fotos: z.array(z.string().min(1).max(200)).max(CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE).default([]),
  /** Honeypot antispam: los humanos no lo ven; si viene con contenido se rechaza. */
  sitio_web: z.string().max(0, 'Solicitud rechazada.').optional(),
});
export type ReporteCrear = z.infer<typeof ReporteCrearSchema>;
export type ReporteCrearEntrada = z.input<typeof ReporteCrearSchema>;

export const ReporteFiltrosSchema = PaginacionSchema.extend({
  bbox: BboxSchema.optional(),
  estado: listaDesdeQuery(ESTADOS_REPORTE),
  severidad: listaDesdeQuery(SEVERIDADES),
  distrito_id: z.string().optional(),
  unidad_vecinal_id: z.string().optional(),
  punto_critico_id: z.uuid().optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
});
export type ReporteFiltros = z.infer<typeof ReporteFiltrosSchema>;

/** Propiedades de un reporte tal como las ve el público (sin autor, con precisión degradada si aplica). */
export const ReportePublicoSchema = z.object({
  id: z.uuid(),
  creado_en: z.iso.datetime({ offset: true }),
  evento_en: z.iso.datetime({ offset: true }).nullable(),
  distrito: UnidadAdministrativaSchema.nullable(),
  unidad_vecinal: UnidadAdministrativaSchema.nullable(),
  manzana_id: z.string().nullable(),
  direccion_aprox: z.string().nullable(),
  descripcion: z.string(),
  fotos: z.array(z.string()).meta({ description: 'URLs servidas por api-core, ya sin EXIF' }),
  tirante_estimado: z.enum(TIRANTES),
  duracion_estimada: z.enum(DURACIONES),
  frecuencia: z.enum(FRECUENCIAS),
  afectacion: z.enum(AFECTACIONES),
  causa_presunta: z.enum(CAUSAS_PRESUNTAS),
  severidad: z
    .enum(SEVERIDADES)
    .meta({ description: 'Severidad efectiva = manual si existe, si no la calculada' }),
  severidad_calculada: z.enum(SEVERIDADES),
  estado: z.enum(ESTADOS_REPORTE),
  punto_critico_id: z.uuid().nullable(),
  n_reportes_punto: z.number().int().nullable(),
  precision_degradada: z
    .boolean()
    .meta({ description: 'true si la coordenada tiene jitter (vivienda o predio)' }),
});
export type ReportePublico = z.infer<typeof ReportePublicoSchema>;

/** Vista del técnico: todo lo público más campos de moderación y coordenada exacta. */
export const ReporteTecnicoSchema = ReportePublicoSchema.extend({
  ubicacion_metodo: z.enum(UBICACION_METODOS),
  precision_gps_m: z.number().nullable(),
  ubicacion_tipo: z.enum(UBICACION_TIPOS),
  sumidero_cercano: z.enum(SUMIDERO_CERCANO).nullable(),
  sumidero_estado: z.enum(SUMIDERO_ESTADOS).nullable(),
  agua_brota_sumidero: z.boolean().nullable(),
  severidad_manual: z.enum(SEVERIDADES).nullable(),
  severidad_motivo: z.string().nullable(),
  severidad_puntaje: z.number().int(),
  estado_motivo: z.string().nullable(),
  fusionado_en_id: z.uuid().nullable(),
  validado_por: z.uuid().nullable(),
  validado_en: z.iso.datetime({ offset: true }).nullable(),
  actualizado_en: z.iso.datetime({ offset: true }),
  version_capa: z.string().nullable(),
  resolucion_flags: z.record(z.string(), z.unknown()),
  autor_id: z.uuid().nullable(),
});
export type ReporteTecnico = z.infer<typeof ReporteTecnicoSchema>;

export const PuntoGeoJsonSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([LonSchema, LatSchema]),
});

export const ReporteFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.uuid(),
  geometry: PuntoGeoJsonSchema,
  properties: ReportePublicoSchema,
});
export const ReporteFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(ReporteFeatureSchema),
  total: z.number().int(),
  pagina: z.number().int(),
  limite: z.number().int(),
});
export type ReporteFeatureCollection = z.infer<typeof ReporteFeatureCollectionSchema>;

/** Transiciones de la máquina de estados (CLAUDE.md §7.3). */
export const ReporteCambiarEstadoSchema = z
  .object({
    estado: z.enum(ESTADOS_REPORTE),
    estado_motivo: z.string().trim().min(3).max(1000).optional(),
    fusionado_en_id: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (['rechazado', 'resuelto', 'duplicado'].includes(v.estado) && !v.estado_motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['estado_motivo'],
        message: `El estado ${v.estado} requiere un motivo.`,
      });
    }
    if (v.estado === 'duplicado' && !v.fusionado_en_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['fusionado_en_id'],
        message: 'Indicá el reporte canónico.',
      });
    }
  });
export type ReporteCambiarEstado = z.infer<typeof ReporteCambiarEstadoSchema>;

export const TRANSICIONES: Record<string, { a: readonly string[]; rol: readonly string[] }> = {
  nuevo: { a: ['validado', 'rechazado', 'duplicado'], rol: ['tecnico', 'admin'] },
  validado: { a: ['resuelto', 'duplicado'], rol: ['tecnico', 'admin'] },
  rechazado: { a: ['nuevo'], rol: ['admin'] },
  duplicado: { a: [], rol: [] },
  resuelto: { a: [], rol: [] },
};

export function transicionPermitida(desde: string, hacia: string, rol: string): boolean {
  const t = TRANSICIONES[desde];
  if (!t) return false;
  return t.a.includes(hacia) && t.rol.includes(rol);
}

export const ReporteReclasificarSchema = z
  .object({
    severidad_manual: z.enum(SEVERIDADES).nullable(),
    severidad_motivo: z.string().trim().min(3).max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.severidad_manual !== null && !v.severidad_motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['severidad_motivo'],
        message: 'La reclasificación requiere un motivo.',
      });
    }
  });
export type ReporteReclasificar = z.infer<typeof ReporteReclasificarSchema>;

export const ReporteFusionarSchema = z.object({
  canonico_id: z.uuid(),
  motivo: z.string().trim().min(3).max(1000).default('Duplicado del mismo punto'),
});
export type ReporteFusionar = z.infer<typeof ReporteFusionarSchema>;

export const FotoSubidaSchema = z.object({
  objeto_key: z.string(),
  url: z.string(),
  ancho: z.number().int(),
  alto: z.number().int(),
  bytes: z.number().int(),
  mime: z.string(),
  exif_sanitizado: z.literal(true),
});
export type FotoSubida = z.infer<typeof FotoSubidaSchema>;
