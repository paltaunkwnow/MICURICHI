import {
  ExportarQuerySchema,
  type Indicadores,
  type IndicadoresFiltros,
  IndicadoresFiltrosSchema,
  NOTA_METODOLOGICA,
  SEVERIDADES,
} from 'contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { seleccionarParaExportar } from '../consultas.js';
import { condicionPublicado } from '../visibilidad.js';
import { aFeature, vistaTecnica } from '../vistas.js';
import { invalidarResumenEjecutivo } from './ejecutivo.js';

/** Invalidador de los cálculos en vuelo, uno por instancia de la app (los tests montan varias). */
const invalidadoresIndicadores = new WeakMap<FastifyInstance, () => void>();

/**
 * Olvida los cálculos de agregados que estén en vuelo en ESTE proceso (indicadores y resumen
 * ejecutivo): una petición que llega después de moderar no puede recibir la cifra de un cálculo
 * que leyó la base antes. Lo llaman cada transición de estado y cada reclasificación
 * (moderacion.ts) y la activación de una versión de capa. Ya no hay caché que vaciar (plan S25):
 * cada petición calcula, y lo que se comparte es solo el cálculo que está en curso.
 */
export function invalidarAgregadosEnVuelo(app: FastifyInstance): void {
  invalidadoresIndicadores.get(app)?.();
  invalidarResumenEjecutivo(app);
}

/**
 * Caracteres con los que Excel, LibreOffice y Sheets interpretan la celda como fórmula, más los
 * saltos de línea. La descripción la escribe cualquier vecino: sin neutralizarlos, un reporte que
 * empiece por `=HYPERLINK(...)` o `@SUM(...)` se ejecuta al abrir la exportación en el municipio.
 */
const INICIO_FORMULA = /^[=+\-@\t\r\n]/;

/**
 * Celdas que van entre comillas. El CR suelto también: las hojas de cálculo cortan el registro en
 * él aunque no lo siga un LF, y sin comillas un `…\r=cmd|…` en la descripción abría una fila
 * nueva que empezaba por la fórmula, saltándose la neutralización de arriba.
 */
const NECESITA_COMILLAS = /[",;\r\n]/;

export function csvCelda(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Los números se dejan tal cual: las latitudes y longitudes empiezan por `-` y deben
  // seguir siendo numéricas en la hoja.
  const esNumero = typeof v === 'number' || (s !== '' && Number.isFinite(Number(s)));
  const seguro = !esNumero && INICIO_FORMULA.test(s) ? `'${s}` : s;
  return NECESITA_COMILLAS.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/**
 * Estados que son un anegamiento. Rechazados y duplicados solo cuentan en `por_estado`: contarlos
 * en el resto dejaba que el spam subiera un distrito en el ranking.
 */
const ESTADOS_QUE_CUENTAN: readonly string[] = ['nuevo', 'validado', 'resuelto'];

/**
 * Datos de la capa para un id, sea de la versión que sea: los de la vigente si el id sigue en
 * ella y si no los de la última versión cargada que lo tenga. Agrupar por id y nombre repetía el
 * distrito cuando una entrega nueva le cambiaba el nombre, y mirar solo la vigente dejaba sin
 * nombre a los reportes resueltos con una capa anterior (ver el comentario de SELECT_REPORTE).
 */
const datosDeCapa = (
  capa: 'distrito_municipal' | 'unidad_vecinal',
  id: string,
  columnas: string,
) => `
  LEFT JOIN LATERAL (
    SELECT ${columnas} FROM geo.${capa} x
    LEFT JOIN geo.capa_version cv ON cv.capa = '${capa}' AND cv.version = x.version_capa
    WHERE x.id = ${id}
    ORDER BY cv.vigente DESC NULLS LAST, cv.cargado_en DESC NULLS LAST, x.version_capa DESC
    LIMIT 1
  ) c ON true`;

/**
 * Solo reportes ya publicados, también en `por_estado`: mientras un reporte espera su publicar_en
 * no lo ve nadie más que su autor, y las cifras del técnico no pueden adelantarlo.
 */
const PUBLICADO = condicionPublicado('');

/**
 * Condiciones de los filtros del panel (0.16.0) sobre la tabla `reporte_inundacion`, sin alias:
 * severidad EFECTIVA contra la lista, y distrito. `agregarParam` las ata al array de parámetros de
 * cada consulta (SQL parametrizado, nunca interpolado). Devuelve el SQL ya con el ` AND ` delante,
 * o '' si no hay filtros.
 */
function condicionesFiltro(
  filtros: IndicadoresFiltros,
  agregarParam: (v: unknown) => string,
): string {
  const cond: string[] = [];
  if (filtros.severidad?.length)
    cond.push(
      `COALESCE(severidad_manual, severidad_calculada) = ANY(${agregarParam(filtros.severidad)}::severidad[])`,
    );
  if (filtros.distrito_id) cond.push(`distrito_id = ${agregarParam(filtros.distrito_id)}`);
  return cond.map((c) => ` AND ${c}`).join('');
}

/**
 * Dos tandas en paralelo, cada una en serie: como mucho dos conexiones del pool. Antes eran siete
 * consultas a la vez, siete de las ocho conexiones, y un par de paneles abiertos dejaban sin
 * conexiones al resto de la API.
 *
 * Los filtros (severidad efectiva, distrito) acotan el subconjunto que cuentan `total`,
 * `por_estado`, `por_severidad`, `por_distrito` y `por_unidad_vecinal`. `puntos_criticos_recurrentes`
 * se filtra solo por distrito (ver CHANGELOG 0.16.0): un punto crítico agrupa reportes de varias
 * severidades y su `severidad_max` no casa con la lista del filtro.
 */
async function calcularIndicadores(
  pool: pg.Pool,
  filtros: IndicadoresFiltros,
): Promise<Indicadores> {
  const [conteos, geografia] = await Promise.all([
    (async () => {
      // Una sola pasada por la tabla: estado × severidad efectiva, a lo sumo 20 filas.
      const pe: unknown[] = [];
      const filtroPe = condicionesFiltro(filtros, (v) => {
        pe.push(v);
        return `$${pe.length}`;
      });
      const porEstadoYSeveridad = await pool.query<{
        estado: string;
        severidad: string;
        n: number;
      }>(
        `SELECT estado::text AS estado, COALESCE(severidad_manual, severidad_calculada)::text AS severidad,
                count(*)::int AS n
           FROM reporte_inundacion WHERE ${PUBLICADO}${filtroPe} GROUP BY 1, 2`,
        pe,
      );
      // Recurrentes: solo por distrito (la columna existe en punto_critico), no por severidad.
      const pc: unknown[] = [];
      const filtroPc = filtros.distrito_id
        ? ` AND distrito_id = $${pc.push(filtros.distrito_id)}`
        : '';
      const recurrentes = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM punto_critico WHERE n_reportes >= 2${filtroPc}`,
        pc,
      );
      const capas = await pool.query<{ capa: string; version: string }>(
        'SELECT capa, version FROM geo.capa_version WHERE vigente',
      );
      return { porEstadoYSeveridad, recurrentes, capas };
    })(),
    (async () => {
      const pd: unknown[] = [ESTADOS_QUE_CUENTAN];
      const filtroPd = condicionesFiltro(filtros, (v) => {
        pd.push(v);
        return `$${pd.length}`;
      });
      const porDistrito = await pool.query<{
        distrito_id: string;
        nombre: string | null;
        n: number;
      }>(
        `SELECT a.distrito_id, c.nombre, a.n
           FROM (SELECT distrito_id, count(*)::int AS n FROM reporte_inundacion
                  WHERE estado = ANY($1::estado_reporte[]) AND ${PUBLICADO}${filtroPd} GROUP BY distrito_id) a
           ${datosDeCapa('distrito_municipal', 'a.distrito_id', 'x.nombre')}
          ORDER BY a.n DESC, a.distrito_id`,
        pd,
      );
      const pu: unknown[] = [ESTADOS_QUE_CUENTAN];
      const filtroPu = condicionesFiltro(filtros, (v) => {
        pu.push(v);
        return `$${pu.length}`;
      });
      const porUv = await pool.query<{
        unidad_vecinal_id: string;
        nombre: string | null;
        distrito_id: string | null;
        n: number;
      }>(
        `SELECT a.unidad_vecinal_id, c.nombre, c.distrito_id, a.n
           FROM (SELECT unidad_vecinal_id, count(*)::int AS n FROM reporte_inundacion
                  WHERE estado = ANY($1::estado_reporte[]) AND ${PUBLICADO}${filtroPu} GROUP BY unidad_vecinal_id
                  ORDER BY count(*) DESC, unidad_vecinal_id LIMIT 50) a
           ${datosDeCapa('unidad_vecinal', 'a.unidad_vecinal_id', 'x.nombre, x.distrito_id')}
          ORDER BY a.n DESC, a.unidad_vecinal_id`,
        pu,
      );
      return { porDistrito, porUv };
    })(),
  ]);

  const porEstado: Record<string, number> = {};
  const porSeveridad = Object.fromEntries(SEVERIDADES.map((s) => [s, 0])) as Record<
    (typeof SEVERIDADES)[number],
    number
  >;
  let total = 0;
  for (const f of conteos.porEstadoYSeveridad.rows) {
    porEstado[f.estado] = (porEstado[f.estado] ?? 0) + f.n;
    if (!ESTADOS_QUE_CUENTAN.includes(f.estado)) continue;
    total += f.n;
    porSeveridad[f.severidad as keyof typeof porSeveridad] += f.n;
  }
  return {
    total,
    por_estado: porEstado,
    por_severidad: porSeveridad,
    por_distrito: geografia.porDistrito.rows,
    por_unidad_vecinal: geografia.porUv.rows,
    puntos_criticos_recurrentes: conteos.recurrentes.rows[0]?.n ?? 0,
    capas_vigentes: Object.fromEntries(conteos.capas.rows.map((f) => [f.capa, f.version])),
  };
}

export async function rutasAdmin(app: FastifyInstance, dep: Dependencias) {
  app.get('/api/v1/exportar', { preHandler: requerirRol('tecnico', 'admin') }, async (req, res) => {
    const q = ExportarQuerySchema.safeParse(req.query);
    if (!q.success)
      return res.status(400).send({
        codigo: 'FILTROS_INVALIDOS',
        mensaje: q.error.issues.map((i) => i.message).join('; '),
      });
    const { filas, total } = await seleccionarParaExportar(dep.pool, {
      filtros: q.data,
      soloPublicos: false,
      zonaHoraria: dep.cfg.zonaHoraria,
    });
    const vistas = filas.map((f) => vistaTecnica(f, dep.cfg.urlPublica));
    // Nunca un recorte en silencio: el archivo dice cuántos trae de cuántos, y la cabecera lo
    // avisa a quien descarga por programa sin abrirlo.
    const exportados = vistas.length;
    const truncado = total > exportados;
    if (truncado) res.header('X-Curichi-Truncado', '1');
    const generadoEn = new Date().toISOString();
    const fecha = generadoEn.slice(0, 10);
    if (q.data.formato === 'geojson') {
      res.header('Content-Type', 'application/geo+json; charset=utf-8');
      res.header(
        'Content-Disposition',
        `attachment; filename="mi-curichi-reportes-${fecha}.geojson"`,
      );
      // Forma de ExportacionGeoJsonSchema.
      return {
        type: 'FeatureCollection',
        nota_metodologica: NOTA_METODOLOGICA,
        generado_en: generadoEn,
        total,
        exportados,
        truncado,
        features: vistas.map(aFeature),
      };
    }
    const columnas = [
      'id',
      'estado',
      'severidad',
      'severidad_calculada',
      'severidad_manual',
      'severidad_puntaje',
      'lat',
      'lon',
      'precision_gps_m',
      'distancia_dispositivo_m',
      'ubicacion_metodo',
      'ubicacion_tipo',
      'distrito_id',
      'distrito',
      'unidad_vecinal_id',
      'unidad_vecinal',
      'creado_en',
      'evento_en',
      'validado_en',
      'profundidad_estimada',
      'frecuencia',
      'causa_presunta',
      'sumidero_cercano',
      'sumidero_estado',
      'agua_brota_sumidero',
      'descripcion',
      'punto_critico_id',
      'n_reportes_punto',
      'estado_motivo',
      'fusionado_en_id',
      'fotos',
    ];
    const lineas = [
      `# ${NOTA_METODOLOGICA}`,
      `# Generado ${generadoEn} · ${exportados} de ${total} reportes · CRS EPSG:4326`,
    ];
    if (truncado)
      lineas.push(
        `# INCOMPLETO: este archivo no trae ${total - exportados} de los reportes seleccionados. Acotá los filtros para exportar el resto.`,
      );
    lineas.push(columnas.join(','));
    for (const v of vistas) {
      const p = v.props;
      const fila: Record<string, unknown> = {
        ...p,
        lat: v.lat,
        lon: v.lon,
        distrito: p.distrito?.nombre,
        distrito_id: p.distrito?.id,
        unidad_vecinal: p.unidad_vecinal?.nombre,
        unidad_vecinal_id: p.unidad_vecinal?.id,
        fotos: p.fotos.join(' '),
      };
      lineas.push(columnas.map((c) => csvCelda(fila[c])).join(','));
    }
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="mi-curichi-reportes-${fecha}.csv"`);
    return `﻿${lineas.join('\n')}\n`;
  });

  /*
   * SIN CACHÉ (plan S25): el panel técnico sondea cada 10 s y tiene que ver enseguida lo que se
   * publica solo, al vencer su demora. Queda la deduplicación en vuelo: los paneles que piden a la
   * vez LA MISMA combinación de filtros comparten el mismo cálculo. El contador de generación sube
   * con cada moderación, y una petición posterior no se sube a un cálculo que ya había leído la
   * base antes. La clave distingue por filtros (0.16.0): dos peticiones con filtros distintos no
   * comparten resultado.
   */
  const enVuelo = new Map<string, { generacion: number; promesa: Promise<Indicadores> }>();
  let generacion = 0;
  invalidadoresIndicadores.set(app, () => {
    generacion++;
    enVuelo.clear();
  });

  /** Clave estable de la combinación de filtros (severidad sin importar el orden). */
  const claveFiltros = (f: IndicadoresFiltros): string =>
    JSON.stringify({ s: [...(f.severidad ?? [])].sort(), d: f.distrito_id ?? null });

  app.get(
    '/api/v1/indicadores',
    { preHandler: requerirRol('tecnico', 'admin') },
    async (req, res) => {
      const q = IndicadoresFiltrosSchema.safeParse(req.query);
      if (!q.success)
        return res.status(400).send({
          codigo: 'FILTROS_INVALIDOS',
          mensaje: q.error.issues.map((i) => i.message).join('; '),
        });
      const clave = claveFiltros(q.data);
      const existente = enVuelo.get(clave);
      if (existente && existente.generacion === generacion) return existente.promesa;
      const calculo = calcularIndicadores(dep.pool, q.data).finally(() => {
        if (enVuelo.get(clave)?.promesa === calculo) enVuelo.delete(clave);
      });
      enVuelo.set(clave, { generacion, promesa: calculo });
      return calculo;
    },
  );

  app.get('/api/v1/admin/capas', { preHandler: requerirRol('tecnico', 'admin') }, async () => {
    const r = await dep.pool.query(
      `SELECT id, capa, version, fuente, fecha_vigencia::text, crs_origen, n_features, cargado_en, vigente, activado_por, activado_en FROM geo.capa_version ORDER BY capa, cargado_en DESC`,
    );
    return r.rows.map((f) => ({
      ...f,
      cargado_en: new Date(f.cargado_en).toISOString(),
      activado_en: f.activado_en ? new Date(f.activado_en).toISOString() : null,
    }));
  });

  app.post(
    '/api/v1/admin/capas/:id/activar',
    { preHandler: requerirRol('admin') },
    async (req, res) => {
      const p = z.object({ id: z.uuid() }).safeParse(req.params);
      if (!p.success)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Versión no encontrada.' });
      const cliente = await dep.pool.connect();
      try {
        await cliente.query('BEGIN');
        const v = await cliente.query<{ capa: string; version: string }>(
          'SELECT capa, version FROM geo.capa_version WHERE id = $1 FOR UPDATE',
          [p.data.id],
        );
        if (!v.rows[0]) {
          await cliente.query('ROLLBACK');
          return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Versión no encontrada.' });
        }
        await cliente.query('UPDATE geo.capa_version SET vigente = false WHERE capa = $1', [
          v.rows[0].capa,
        ]);
        await cliente.query(
          'UPDATE geo.capa_version SET vigente = true, activado_por = $2, activado_en = now() WHERE id = $1',
          [p.data.id, req.usuario!.id],
        );
        await cliente.query(
          'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, despues) VALUES ($1, $2, $3, $4, $5)',
          ['capa_version', p.data.id, 'activar', req.usuario!.id, JSON.stringify(v.rows[0])],
        );
        await cliente.query('COMMIT');
      } catch (e) {
        // Con .catch(): si el ROLLBACK también falla (conexión ya caída), el error que sube
        // tiene que seguir siendo el original, no el del rollback, que no explica nada.
        await cliente.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        cliente.release();
      }
      await dep.resolver.invalidarCapas();
      // Cambian los nombres y `capas_vigentes`: el panel de capas refresca los indicadores tras
      // activar y tiene que verlos ya.
      invalidarAgregadosEnVuelo(app);
      const r = await dep.pool.query(
        'SELECT id, capa, version, fuente, fecha_vigencia::text, crs_origen, n_features, cargado_en, vigente, activado_por, activado_en FROM geo.capa_version WHERE id = $1',
        [p.data.id],
      );
      const f = r.rows[0];
      return {
        ...f,
        cargado_en: new Date(f.cargado_en).toISOString(),
        activado_en: f.activado_en ? new Date(f.activado_en).toISOString() : null,
      };
    },
  );
}
