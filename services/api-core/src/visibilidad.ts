/**
 * Quién ve un reporte, en un solo lugar (contracts 0.11.0, ADR 0006).
 *
 * - Público: `estado IN (ESTADOS_PUBLICOS) AND publicar_en <= now()`. `nuevo` se publica sin
 *   moderación previa, con «NO SE HA VERIFICADO», cuando pasa su demora.
 * - Publicado: `publicar_en <= now()`, en cualquier estado. Es lo que ven técnicos, exportación,
 *   indicadores y resumen ejecutivo, y lo único que se puede moderar: mientras un reporte espera
 *   no lo ve nadie más que su autor, técnicos incluidos.
 *
 * El estado va como LITERAL SQL armado desde `ESTADOS_PUBLICOS` y no como `ANY($n)`: con un plan
 * genérico PostgreSQL no puede demostrar que `estado = ANY($1)` implica el predicado de los índices
 * parciales de la 0015 (`reporte_geom_publico_gist`, `reporte_agregado_uv`) y deja de usarlos.
 * `now()` no puede ir en el predicado de un índice: `publicar_en` va en su INCLUDE.
 */
import { ESTADOS_PUBLICOS, ESTADOS_RETIRADOS, ESTADOS_VERIFICADOS } from 'contracts';

/** Los valores van pegados al SQL: se exige que sean identificadores simples antes de usarlos. */
function literal(valores: readonly string[]): string {
  for (const v of valores)
    if (!/^[a-z_]+$/.test(v)) throw new Error(`estado con caracteres no esperados: «${v}»`);
  return valores.map((v) => `'${v}'`).join(', ');
}

/** `'nuevo', 'validado', 'resuelto'`, en el orden del contrato. */
export const LITERAL_ESTADOS_PUBLICOS = literal(ESTADOS_PUBLICOS);
export const LITERAL_ESTADOS_VERIFICADOS = literal(ESTADOS_VERIFICADOS);

const columna = (alias: string, nombre: string) => (alias ? `${alias}.${nombre}` : nombre);

/** El reporte está en la vista pública. `alias` es el de `reporte_inundacion` en la consulta. */
export function condicionPublico(alias = 'r'): string {
  return `${columna(alias, 'estado')} IN (${LITERAL_ESTADOS_PUBLICOS}) AND ${condicionPublicado(alias)}`;
}

/** Ya pasó su demora, en cualquier estado. */
export function condicionPublicado(alias = 'r'): string {
  return `${columna(alias, 'publicar_en')} <= now()`;
}

export const esVerificado = (estado: string) =>
  (ESTADOS_VERIFICADOS as readonly string[]).includes(estado);

export const esRetirado = (estado: string) =>
  (ESTADOS_RETIRADOS as readonly string[]).includes(estado);

export const esEstadoPublico = (estado: string): estado is (typeof ESTADOS_PUBLICOS)[number] =>
  (ESTADOS_PUBLICOS as readonly string[]).includes(estado);
