import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

export const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DIR_ETL = resolve(RAIZ_REPO, 'pipelines/geodata-etl');

const CamposSchema = z.object({
  codigo: z.string().nullable().default(null),
  nombre: z.string().nullable().default(null),
  distrito: z.string().nullable().optional().default(null),
  unidad_vecinal: z.string().nullable().optional().default(null),
  /** Campo único de respaldo (p. ej. OBJECTID) para features sin código. */
  respaldo: z.string().nullable().optional().default(null),
  /** Plantilla del nombre cuando la capa no trae uno, p. ej. "Unidad Vecinal {codigo}". */
  plantilla_nombre: z.string().nullable().optional().default(null),
});

const CapaConfigSchema = z.object({
  archivo: z.string().nullable().default(null),
  campos: CamposSchema.prefault({}),
});

export const VersionConfigSchema = z.object({
  version: z.string().min(1),
  carpeta: z.string().min(1),
  fuente: z.string().default('<a confirmar>'),
  fecha_vigencia: z.string().nullable().default(null),
  crs_origen: z.string().nullable().default(null),
  encoding: z.string().nullable().default(null),
  capas: z.object({
    distrito_municipal: CapaConfigSchema,
    unidad_vecinal: CapaConfigSchema,
    manzana: CapaConfigSchema.optional(),
  }),
});
export type VersionConfig = z.infer<typeof VersionConfigSchema>;

export const ConfigSchema = z.object({
  versiones: z.array(VersionConfigSchema).min(1),
  simplificacion: z.object({
    distrito_municipal: z.number(),
    unidad_vecinal: z.number(),
    manzana: z.number(),
  }),
  umbral_teselas_bytes: z.number().int().positive(),
  /** Cambio máximo aceptable del área TOTAL de la capa tras la reparación. */
  tolerancia_cambio_area: z.number().positive(),
  /**
   * Cambio máximo aceptable del área de UNA feature. Es necesariamente mayor que el de la capa:
   * resolver un solape mueve área de un polígono a su vecino, así que el total apenas varía
   * mientras los dos implicados cambian bastante. Usar el mismo número para ambos convertía
   * cualquier solape real en un falso "reparación no segura" que abortaba el ETL.
   */
  tolerancia_cambio_area_feature: z.number().positive().default(0.01),
});
export type Config = z.infer<typeof ConfigSchema>;

export function cargarConfig(ruta = resolve(DIR_ETL, 'config/capas.yaml')): Config {
  return ConfigSchema.parse(parse(readFileSync(ruta, 'utf8')));
}

export function rutaAbsoluta(p: string): string {
  return isAbsolute(p) ? p : resolve(RAIZ_REPO, p);
}

export function dirProcessed(version: string): string {
  return resolve(RAIZ_REPO, 'data/processed', version);
}
