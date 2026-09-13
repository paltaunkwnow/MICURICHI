/** Construcción de la consulta de listado con filtros (§7.5). */
import type { ReporteFiltros } from 'contracts';
import type pg from 'pg';
import { type FilaReporte, SELECT_REPORTE } from './vistas.js';

export interface OpcionesListado {
  filtros: ReporteFiltros;
  soloPublicos: boolean;
}

export function armarWhere(o: OpcionesListado): { where: string; params: unknown[] } {
  const cond: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const f = o.filtros;
  if (o.soloPublicos) cond.push(`r.estado IN ('validado', 'resuelto')`);
  else if (f.estado?.length) cond.push(`r.estado = ANY(${p(f.estado)}::estado_reporte[])`);
  if (f.severidad?.length)
    cond.push(
      `COALESCE(r.severidad_manual, r.severidad_calculada) = ANY(${p(f.severidad)}::severidad[])`,
    );
  if (f.distrito_id) cond.push(`r.distrito_id = ${p(f.distrito_id)}`);
  if (f.unidad_vecinal_id) cond.push(`r.unidad_vecinal_id = ${p(f.unidad_vecinal_id)}`);
  if (f.punto_critico_id) cond.push(`r.punto_critico_id = ${p(f.punto_critico_id)}`);
  if (f.desde) cond.push(`r.creado_en >= ${p(f.desde)}::date`);
  if (f.hasta) cond.push(`r.creado_en < (${p(f.hasta)}::date + interval '1 day')`);
  if (f.bbox)
    cond.push(
      `r.geom && ST_MakeEnvelope(${p(f.bbox[0])}, ${p(f.bbox[1])}, ${p(f.bbox[2])}, ${p(f.bbox[3])}, 4326)`,
    );
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

export async function listarReportes(
  pool: pg.Pool,
  o: OpcionesListado,
): Promise<{ filas: FilaReporte[]; total: number }> {
  const { where, params } = armarWhere(o);
  const total = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM reporte_inundacion r ${where}`,
    params,
  );
  const offset = (o.filtros.pagina - 1) * o.filtros.limite;
  const filas = await pool.query<FilaReporte>(
    `${SELECT_REPORTE} ${where} ORDER BY r.creado_en DESC LIMIT ${o.filtros.limite} OFFSET ${offset}`,
    params,
  );
  return { filas: filas.rows, total: Number(total.rows[0]?.n ?? 0) };
}

export async function obtenerReporte(pool: pg.Pool, id: string): Promise<FilaReporte | null> {
  const r = await pool.query<FilaReporte>(`${SELECT_REPORTE} WHERE r.id = $1`, [id]);
  return r.rows[0] ?? null;
}
