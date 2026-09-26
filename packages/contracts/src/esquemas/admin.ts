import { z } from 'zod';
import { CONFIG_DOMINIO } from '../dominio/config.js';
import { SEVERIDADES, TIPOS_CAPA } from '../dominio/enums.js';
import { ReporteFiltrosSchema, ReporteTecnicoFeatureSchema } from './reporte.js';

export const CapaVersionSchema = z.object({
  id: z.uuid(),
  capa: z.enum(TIPOS_CAPA),
  version: z.string(),
  fuente: z.string().nullable(),
  fecha_vigencia: z.iso.date().nullable(),
  crs_origen: z.string().nullable(),
  n_features: z.number().int(),
  cargado_en: z.iso.datetime({ offset: true }),
  vigente: z.boolean(),
  activado_por: z.uuid().nullable(),
  activado_en: z.iso.datetime({ offset: true }).nullable(),
});
export type CapaVersion = z.infer<typeof CapaVersionSchema>;

export const FORMATOS_EXPORTACION = ['csv', 'geojson'] as const;
export const ExportarQuerySchema = ReporteFiltrosSchema.extend({
  formato: z.enum(FORMATOS_EXPORTACION).default('geojson'),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(CONFIG_DOMINIO.EXPORTAR_MAX_FILAS)
    .default(CONFIG_DOMINIO.EXPORTAR_MAX_FILAS),
});
export type ExportarQuery = z.infer<typeof ExportarQuerySchema>;

const Conteo = z.number().int().nonnegative();

/**
 * Respuesta de `GET /api/v1/exportar?formato=geojson`. `total` cuenta la selección entera sin
 * tope; si no cabe en `limite`, el archivo trae `exportados` features y `truncado = true`, para
 * que nadie tome un recorte por el inventario completo.
 */
export const ExportacionGeoJsonSchema = z.object({
  type: z.literal('FeatureCollection'),
  nota_metodologica: z
    .string()
    .meta({ description: 'Limitaciones del dato (CLAUDE.md §9.5); va en toda exportación' }),
  generado_en: z.iso.datetime({ offset: true }),
  total: Conteo.meta({ description: 'Reportes que casan con los filtros, contados sin tope' }),
  exportados: Conteo.meta({ description: 'Features incluidas en este archivo' }),
  truncado: z
    .boolean()
    .meta({ description: 'true si total > exportados: el archivo no trae toda la selección' }),
  features: z.array(ReporteTecnicoFeatureSchema),
});
export type ExportacionGeoJson = z.infer<typeof ExportacionGeoJsonSchema>;

export const IndicadoresSchema = z.object({
  total: z.number().int(),
  por_estado: z.record(z.string(), z.number().int()),
  por_severidad: z.record(z.enum(SEVERIDADES), z.number().int()),
  por_distrito: z.array(
    z.object({ distrito_id: z.string(), nombre: z.string().nullable(), n: z.number().int() }),
  ),
  por_unidad_vecinal: z.array(
    z.object({
      unidad_vecinal_id: z.string(),
      nombre: z.string().nullable(),
      distrito_id: z.string().nullable(),
      n: z.number().int(),
    }),
  ),
  puntos_criticos_recurrentes: z
    .number()
    .int()
    .meta({ description: 'Puntos críticos con n_reportes ≥ 2' }),
  capas_vigentes: z.record(z.string(), z.string().nullable()),
});
export type Indicadores = z.infer<typeof IndicadoresSchema>;
