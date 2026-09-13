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
  tolerancia_cambio_area: z.number().positive(),
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
