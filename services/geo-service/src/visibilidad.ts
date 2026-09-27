/**
 * Qué reportes cuentan en las cifras públicas (contrato 0.11.0, ADR 0006). Las listas salen de
 * `contracts`, que es la única fuente de la visibilidad; aquí solo se arma el SQL.
 */
import { ESTADOS_PUBLICOS, ESTADOS_VERIFICADOS } from 'contracts';

/** `'nuevo', 'validado', 'resuelto'`. Los estados son constantes del contrato, no entrada. */
function literalEstados(estados: readonly string[]): string {
  for (const e of estados)
    if (!/^[a-z_]+$/.test(e)) throw new Error(`Estado inválido para un literal SQL: ${e}`);
  return estados.map((e) => `'${e}'`).join(', ');
}

/**
 * Reporte publicado: estado público y ya pasada su demora. Es un literal y no `= ANY($n)` a
 * propósito: con un plan genérico PostgreSQL no puede demostrar que la condición implica el
 * predicado de los índices parciales de la migración 0015, y deja de usarlos.
 */
export function condicionPublico(alias: string): string {
  return `${alias}.estado IN (${literalEstados(ESTADOS_PUBLICOS)}) AND ${alias}.publicar_en <= now()`;
}

/** Reporte revisado por un técnico: solo estos arman el color público y los puntos críticos. */
export function condicionVerificado(alias: string): string {
  return `${alias}.estado IN (${literalEstados(ESTADOS_VERIFICADOS)})`;
}

/** Orden de la severidad efectiva, para sacar el máximo en SQL y traducirlo de vuelta a texto. */
const SEVERIDAD_EFECTIVA_NUM = `CASE COALESCE(r.severidad_manual, r.severidad_calculada)
  WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 WHEN 'baja' THEN 1 END`;
function severidadDesdeNum(expr: string): string {
  return `CASE ${expr} WHEN 4 THEN 'critica' WHEN 3 THEN 'alta' WHEN 2 THEN 'media' WHEN 1 THEN 'baja' END`;
}

const VERIFICADO = condicionVerificado('r');

/**
 * Agregados por UV (`GET /geo/v1/agregados/unidades-vecinales`). Cuenta lo publicado: nuevo (sin
 * verificar), validado y resuelto con su demora ya cumplida. El color público y los puntos
 * críticos salen solo de lo verificado, para que un reporte falso de más de 70 cm no pinte de
 * crítica una UV entera (contrato 0.11.0).
 *
 * Una sola pasada: antes había una subconsulta correlacionada por CADA unidad vecinal (576 con las
 * capas reales) solo para sacar la severidad máxima. Todas las columnas de `r` están en el índice
 * parcial `reporte_agregado_uv` (migración 0015), así que con datos reales es un Index Only Scan.
 */
export const SQL_AGREGADOS_UV = `SELECT u.id AS unidad_vecinal_id, u.codigo, u.nombre, u.distrito_id,
    count(r.id)::int AS n_reportes,
    (count(r.id) FILTER (WHERE ${VERIFICADO}))::int AS n_verificados,
    (count(DISTINCT r.punto_critico_id) FILTER (WHERE ${VERIFICADO}))::int AS n_puntos_criticos,
    ${severidadDesdeNum(`max(${SEVERIDAD_EFECTIVA_NUM})`)} AS severidad_max,
    ${severidadDesdeNum(`max(${SEVERIDAD_EFECTIVA_NUM}) FILTER (WHERE ${VERIFICADO})`)}
      AS severidad_max_verificada
  FROM geo.unidad_vecinal_vigente u
  LEFT JOIN reporte_inundacion r ON r.unidad_vecinal_id = u.id AND ${condicionPublico('r')}
  GROUP BY u.id, u.codigo, u.nombre, u.distrito_id
  ORDER BY n_reportes DESC, u.id`;
