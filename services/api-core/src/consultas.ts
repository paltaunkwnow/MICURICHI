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
  if (o.soloPublicos) {
    cond.push(`r.estado IN ('validado', 'resuelto')`);
    // Sin punto publicable no se publica. Es la opción segura: un reporte de vivienda sin
    // `geom_publico` calculado aparecería si no con su coordenada real bajo el filtro por bbox.
    cond.push('r.geom_publico IS NOT NULL');
  } else if (f.estado?.length) cond.push(`r.estado = ANY(${p(f.estado)}::estado_reporte[])`);
  if (f.severidad?.length)
    cond.push(
      `COALESCE(r.severidad_manual, r.severidad_calculada) = ANY(${p(f.severidad)}::severidad[])`,
    );
  if (f.distrito_id) cond.push(`r.distrito_id = ${p(f.distrito_id)}`);
  if (f.unidad_vecinal_id) cond.push(`r.unidad_vecinal_id = ${p(f.unidad_vecinal_id)}`);
  if (f.punto_critico_id) cond.push(`r.punto_critico_id = ${p(f.punto_critico_id)}`);
  if (f.desde) cond.push(`r.creado_en >= ${p(f.desde)}::date`);
  if (f.hasta) cond.push(`r.creado_en < (${p(f.hasta)}::date + interval '1 day')`);
  if (f.bbox) {
    // El público filtra por la geometría PUBLICADA, no por la exacta. Filtrar por la exacta y
    // devolver la desplazada convertía el bbox en un oráculo: encogiéndolo por bisección se
    // recupera la coordenada real de una vivienda en unas cuarenta peticiones (§13).
    const columna = o.soloPublicos ? 'r.geom_publico' : 'r.geom';
    cond.push(
      `${columna} && ST_MakeEnvelope(${p(f.bbox[0])}, ${p(f.bbox[1])}, ${p(f.bbox[2])}, ${p(f.bbox[3])}, 4326)`,
    );
  }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

/**
 * Tope del conteo. `count(*)` sin límite recorre TODAS las filas que casan con el filtro en cada
 * petición del listado; con la ciudad entera reportando, eso es un escaneo completo por cada
 * carga del panel. Contar hasta 10 001 y decir "más de 10 000" cuesta lo mismo que traer una
 * página y sigue dando lo único que la interfaz necesita: cuántas páginas ofrecer.
 */
export const TOPE_CONTEO = 10_000;

/**
 * Tope de `OFFSET`. Postgres tiene que recorrer y descartar todas las filas saltadas, así que una
 * página muy profunda es cada vez más cara. A partir de aquí la respuesta pide filtrar en vez de
 * pasar páginas. No se usa paginación por cursor porque el panel navega con números de página
 * (§4.4) y un cursor no permite saltar a la página N.
 */
export const MAX_OFFSET = 50_000;

export interface ResultadoListado {
  filas: FilaReporte[];
  total: number;
  /** false cuando el total real supera `TOPE_CONTEO` y se devuelve el tope. */
  totalExacto: boolean;
}

export async function listarReportes(pool: pg.Pool, o: OpcionesListado): Promise<ResultadoListado> {
  const { where, params } = armarWhere(o);
  const offset = (o.filtros.pagina - 1) * o.filtros.limite;

  const conteo = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM (SELECT 1 FROM reporte_inundacion r ${where} LIMIT $${params.length + 1}) t`,
    [...params, TOPE_CONTEO + 1],
  );
  const bruto = Number(conteo.rows[0]?.n ?? 0);
  const totalExacto = bruto <= TOPE_CONTEO;

  const filas = await pool.query<FilaReporte>(
    `${SELECT_REPORTE} ${where} ORDER BY r.creado_en DESC, r.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, o.filtros.limite, offset],
  );
  return { filas: filas.rows, total: totalExacto ? bruto : TOPE_CONTEO, totalExacto };
}

/**
 * Acepta un pool o una conexión concreta. Lo segundo importa: si quien llama ya tiene una
 * conexión tomada (dentro o justo después de una transacción) y pide OTRA al pool para releer,
 * cada petición necesita dos a la vez y con N peticiones simultáneas contra un pool de N se
 * bloquean todas entre sí. Ver el comentario en rutas/reportes.ts, donde pasaba exactamente eso.
 */
type Consultable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export async function obtenerReporte(
  ejecutor: Consultable,
  id: string,
): Promise<FilaReporte | null> {
  const r = await ejecutor.query<FilaReporte>(`${SELECT_REPORTE} WHERE r.id = $1`, [id]);
  return r.rows[0] ?? null;
}
