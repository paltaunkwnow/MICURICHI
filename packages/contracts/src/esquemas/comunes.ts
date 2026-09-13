import { z } from 'zod';

export const LatSchema = z
  .number()
  .min(-90)
  .max(90)
  .meta({ description: 'Latitud WGS84 (EPSG:4326)' });
export const LonSchema = z
  .number()
  .min(-180)
  .max(180)
  .meta({ description: 'Longitud WGS84 (EPSG:4326)' });

export const CoordenadaSchema = z.object({ lat: LatSchema, lon: LonSchema });
export type Coordenada = z.infer<typeof CoordenadaSchema>;

/** bbox como "minLon,minLat,maxLon,maxLat" (orden GeoJSON). */
export const BboxSchema = z
  .string()
  .regex(
    /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
    'bbox debe ser minLon,minLat,maxLon,maxLat',
  )
  .transform((s) => s.split(',').map(Number) as [number, number, number, number])
  .refine(([a, b, c, d]) => a < c && b < d, 'bbox inválido: min debe ser menor que max')
  .meta({ description: 'minLon,minLat,maxLon,maxLat' });

export const ErrorApiSchema = z.object({
  codigo: z.string().meta({ description: 'Código estable, p. ej. FUERA_DE_COBERTURA' }),
  mensaje: z.string(),
  detalles: z.unknown().optional(),
});
export type ErrorApi = z.infer<typeof ErrorApiSchema>;

export const PaginacionSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});

export const UnidadAdministrativaSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
});
export type UnidadAdministrativa = z.infer<typeof UnidadAdministrativaSchema>;

/** Convierte "a,b,c" o ["a","b"] en lista; útil para filtros por query string. */
export function listaDesdeQuery<T extends readonly string[]>(valores: T) {
  return z
    .union([z.enum(valores), z.array(z.enum(valores)), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return undefined;
      const lista = Array.isArray(v) ? v : String(v).split(',');
      return lista.map((x) => x.trim()).filter(Boolean) as T[number][];
    })
    .refine((lista) => !lista || lista.every((x) => (valores as readonly string[]).includes(x)), {
      message: `Valores permitidos: ${valores.join(', ')}`,
    });
}
