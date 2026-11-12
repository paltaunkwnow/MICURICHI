import { z } from 'zod';
import { normalizarSlugCategoria, type SlugCategoria } from '../categorias/slugs.js';

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

/** Valor del filtro `categoria` cuando se piden TODAS las categorías (solo en las rutas del panel). */
export const CATEGORIA_TODAS = 'todas';

/** Lo que devuelve el filtro `categoria` ya normalizado: un slug canónico o el centinela `todas`. */
export type FiltroCategoria = SlugCategoria | typeof CATEGORIA_TODAS;

/**
 * Campo de query `categoria` de los filtros de lectura (ADR 0012, 0013). Lo comparten
 * `ReporteFiltrosSchema`, `IndicadoresFiltrosSchema`, `ResumenEjecutivoQuerySchema` (y por extensión
 * `ExportarQuerySchema`) y las consultas de geo-service.
 *
 * - **Ausente o vacío → `inundacion`**: la pieza de compatibilidad clave (ADR 0012). Sin el
 *   parámetro, todo se comporta como hoy.
 * - **Alias conocido** (plural, guion o guion bajo, mayúsculas, tildes) → su slug canónico, vía
 *   `normalizarSlugCategoria`.
 * - **`todas`** → `CATEGORIA_TODAS`. El contrato lo reconoce SIEMPRE; que una ruta lo admita o no lo
 *   decide el SERVIDOR (opción «un campo que el servidor valida» del plan M3): las rutas públicas lo
 *   rechazan y las del panel (`/tecnico/reportes`, `/exportar`, `/indicadores`, `/ejecutivo/resumen`)
 *   lo aceptan. Por eso el mismo esquema sirve a `GET /reportes` (público) y a `GET /tecnico/reportes`
 *   (panel), que comparten `ReporteFiltrosSchema`.
 * - **Cualquier otro valor → `null`**: el servidor lo trata como `CATEGORIA_NO_DISPONIBLE`. El
 *   contrato NO valida si la categoría está ACTIVA (regla 3): eso lo resuelve el servidor con el
 *   catálogo, y responde igual (`null` = desconocida, o un slug conocido pero inactivo).
 *
 * El tipo de salida es `FiltroCategoria | null`.
 */
export const CategoriaFiltroSchema = z
  .string()
  .trim()
  .optional()
  .transform((v): FiltroCategoria | null => {
    if (v === undefined || v === '') return 'inundacion';
    if (v.toLowerCase() === CATEGORIA_TODAS) return CATEGORIA_TODAS;
    return normalizarSlugCategoria(v);
  })
  .meta({
    description:
      'Filtra por categoría. Sin el parámetro = inundacion (compatibilidad, ADR 0012). Acepta alias ' +
      '(plural, guion, mayúsculas, tildes). «todas» solo en las rutas del panel; en las públicas la ' +
      'rechaza el servidor. Un slug desconocido o inactivo da 400/422 CATEGORIA_NO_DISPONIBLE (lo ' +
      'decide el servidor con el catálogo, no el contrato).',
  });

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
