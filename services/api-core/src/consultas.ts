/** Construcción de la consulta de listado con filtros (§7.5). */
import { CONFIG_DOMINIO, type ReporteFiltros } from 'contracts';
import type pg from 'pg';
import { condicionPublicado, condicionPublico } from './visibilidad.js';
import { type FilaReporte, SELECT_REPORTE } from './vistas.js';

export interface OpcionesListado {
  filtros: ReporteFiltros;
  soloPublicos: boolean;
  /**
   * Zona en la que `desde` y `hasta` son días del calendario: la de la instalación
   * (`cfg.zonaHoraria`). Sin ella se usa la del contrato.
   */
  zonaHoraria?: string;
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
    // Estados públicos y demora cumplida, en literal (ver visibilidad.ts: índices parciales).
    cond.push(condicionPublico('r'));
    // Sin punto publicable no se publica. Es la opción segura: un reporte de vivienda sin
    // `geom_publico` calculado aparecería si no con su coordenada real bajo el filtro por bbox.
    cond.push('r.geom_publico IS NOT NULL');
  } else {
    // La vista técnica y la exportación tampoco ven lo que todavía espera su publicar_en: nadie
    // modera ni exporta un reporte antes de que sea público.
    cond.push(condicionPublicado('r'));
  }
  // En la ruta pública el filtro por estado se aplica DENTRO de los públicos (p. ej. solo los
  // verificados); pedir `rechazado` ahí devuelve vacío, nunca lo amplía.
  if (f.estado?.length) cond.push(`r.estado = ANY(${p(f.estado)}::estado_reporte[])`);
  if (f.severidad?.length)
    cond.push(
      `COALESCE(r.severidad_manual, r.severidad_calculada) = ANY(${p(f.severidad)}::severidad[])`,
    );
  if (f.distrito_id) cond.push(`r.distrito_id = ${p(f.distrito_id)}`);
  if (f.unidad_vecinal_id) cond.push(`r.unidad_vecinal_id = ${p(f.unidad_vecinal_id)}`);
  if (f.punto_critico_id) cond.push(`r.punto_critico_id = ${p(f.punto_critico_id)}`);
  // `desde` y `hasta` son días de la ciudad. Con `::date` a secas se medían en la zona de la
  // sesión de PostgreSQL (UTC en Docker) y un reporte de las 21:00 del 20 en La Paz caía en el 21.
  // Se compara contra el instante de la medianoche local, y no `(creado_en AT TIME ZONE …)::date`,
  // para que la condición siga pudiendo usar el índice sobre creado_en.
  const zona = o.zonaHoraria ?? CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO;
  if (f.desde) cond.push(`r.creado_en >= (${p(f.desde)}::date::timestamp AT TIME ZONE ${p(zona)})`);
  if (f.hasta)
    cond.push(`r.creado_en < ((${p(f.hasta)}::date + 1)::timestamp AT TIME ZONE ${p(zona)})`);
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

  const [sql, valores] = consultaDePagina(where, params, o.filtros, offset);
  const filas = await pool.query<FilaReporte>(sql, valores);
  return { filas: filas.rows, total: totalExacto ? bruto : TOPE_CONTEO, totalExacto };
}

function consultaDePagina(
  where: string,
  params: unknown[],
  filtros: ReporteFiltros,
  offset: number,
): [string, unknown[]] {
  return [
    `${SELECT_REPORTE} ${where} ORDER BY r.creado_en DESC, r.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filtros.limite, offset],
  ];
}

/**
 * Selección de la exportación: las filas hasta `limite` y el total SIN `TOPE_CONTEO`, porque la
 * exportación declara cuántos reportes trae de cuántos (`exportados`, `total`); con el tope del
 * listado una selección de 30 000 se anunciaba como de 10 000. Conteo y filas comparten una
 * instantánea (REPEATABLE READ): si no, un reporte que entra entre las dos consultas da
 * «10 001 de 10 000».
 */
export async function seleccionarParaExportar(
  pool: pg.Pool,
  o: OpcionesListado,
): Promise<{ filas: FilaReporte[]; total: number }> {
  const { where, params } = armarWhere(o);
  const offset = (o.filtros.pagina - 1) * o.filtros.limite;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const conteo = await cliente.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM reporte_inundacion r ${where}`,
      params,
    );
    const [sql, valores] = consultaDePagina(where, params, o.filtros, offset);
    const filas = await cliente.query<FilaReporte>(sql, valores);
    await cliente.query('COMMIT');
    return { filas: filas.rows, total: Number(conteo.rows[0]?.n ?? 0) };
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

/**
 * Acepta un pool o una conexión concreta. Lo segundo importa: si quien llama ya tiene una
 * conexión tomada (dentro o justo después de una transacción) y pide OTRA al pool para releer,
 * cada petición necesita dos a la vez y con N peticiones simultáneas contra un pool de N se
 * bloquean todas entre sí. Ver el comentario en rutas/reportes.ts, donde pasaba exactamente eso.
 */
type Consultable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

/**
 * Qué reporte se puede leer: `publico` (vista pública), `publicado` (ya pasó su demora, en
 * cualquier estado: técnica y moderación) o `cualquiera` (el autor y la relectura al crear).
 * Sin valor por defecto a propósito: cada lector tiene que decir cuál es el suyo.
 */
export type Visibilidad = 'publico' | 'publicado' | 'cualquiera';

const CONDICION: Record<Visibilidad, string> = {
  publico: ` AND ${condicionPublico('r')}`,
  publicado: ` AND ${condicionPublicado('r')}`,
  cualquiera: '',
};

export async function obtenerReporte(
  ejecutor: Consultable,
  id: string,
  visibilidad: Visibilidad,
): Promise<FilaReporte | null> {
  const r = await ejecutor.query<FilaReporte>(
    `${SELECT_REPORTE} WHERE r.id = $1${CONDICION[visibilidad]}`,
    [id],
  );
  return r.rows[0] ?? null;
}

/** Los reportes de un autor, los más recientes primero, en cualquier estado (`GET /mis-reportes`). */
export async function reportesDelAutor(
  ejecutor: Consultable,
  autorId: string,
  limite: number,
): Promise<FilaReporte[]> {
  const r = await ejecutor.query<FilaReporte>(
    `${SELECT_REPORTE} WHERE r.autor_id = $1 ORDER BY r.creado_en DESC, r.id DESC LIMIT $2`,
    [autorId, limite],
  );
  return r.rows;
}
