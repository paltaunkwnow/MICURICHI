/**
 * Resolución del `id` de las rutas de reporte: acepta un UUID completo o un ID corto de 8
 * caracteres hexadecimales y traduce el corto a su UUID respetando la visibilidad de la ruta.
 *
 * Un único módulo para las resoluciones que estaban sueltas (detalle público, moderación y
 * canónico de la fusión): el mismo esquema de entrada y la misma consulta, con la condición de
 * visibilidad (de visibilidad.ts) como parámetro.
 */
import type pg from 'pg';
import { z } from 'zod';

/**
 * El parámetro `id`: un UUID o un ID corto de 8 hex, con trim y a minúsculas. Los uuid se
 * normalizan a minúsculas al entrar porque en la moderación se comparan como texto (y
 * `auditoria.entidad_id` es texto): sin normalizar, `/reportes/<ID EN MAYÚSCULAS>` con el canónico
 * en minúsculas pasaba la comprobación de «distinto» y el reporte quedaba duplicado de sí mismo, y
 * el historial de un reporte se repartía entre dos claves.
 */
export const IdReporteParam = z.object({
  id: z
    .string()
    .trim()
    .refine(
      (s) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ||
        /^[0-9a-f]{8}$/i.test(s),
      { message: 'El id debe ser un UUID o un ID corto de 8 caracteres hexadecimales' },
    )
    .transform((s) => s.toLowerCase()),
});

/**
 * Los dos extremos del rango de un prefijo de 8 hex: todos los uuid que empiezan con `prefijo` caen
 * entre `prefijo-0000-…-000000000000` y `prefijo-ffff-…-ffffffffffff`.
 */
export function rangoDeIdCorto(prefijo: string): [string, string] {
  return [`${prefijo}-0000-0000-0000-000000000000`, `${prefijo}-ffff-ffff-ffff-ffffffffffff`];
}

/**
 * SQL de la resolución del ID corto. El rango sobre la clave primaria es exacto porque PostgreSQL
 * ordena `uuid` por sus 16 bytes, igual que el orden hexadecimal del texto: así usa el índice de la
 * PK en vez de recorrer la tabla, que es lo que obligaba el `id::text LIKE` anterior. `condicionSql`
 * es la visibilidad de la ruta (visibilidad.ts), ya como literal.
 */
export function sqlResolverIdCorto(condicionSql: string): string {
  return `SELECT id::text FROM reporte_inundacion
    WHERE id BETWEEN $1::uuid AND $2::uuid AND ${condicionSql} LIMIT 2`;
}

/**
 * Traduce `id` a un UUID completo bajo la visibilidad `condicionSql`. Un UUID completo se devuelve
 * tal cual, sin consulta. Un ID corto de 8 hex se busca por rango; una sola fila devuelve su id,
 * cero (inexistente u oculto bajo esa visibilidad) o dos (ambiguo) devuelven null.
 */
export async function resolverIdReporte(
  pool: pg.Pool,
  id: string,
  condicionSql: string,
): Promise<string | null> {
  if (id.length !== 8) return id;
  const [desde, hasta] = rangoDeIdCorto(id);
  const r = await pool.query<{ id: string }>(sqlResolverIdCorto(condicionSql), [desde, hasta]);
  if (r.rows.length === 1 && r.rows[0]) return r.rows[0].id;
  return null;
}
