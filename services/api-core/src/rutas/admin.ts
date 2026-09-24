import { ExportarQuerySchema, type Indicadores, NOTA_METODOLOGICA, SEVERIDADES } from 'contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { listarReportes } from '../consultas.js';
import { aFeature, vistaTecnica } from '../vistas.js';

/**
 * Caracteres con los que Excel, LibreOffice y Sheets interpretan la celda como fórmula.
 * La descripción la escribe cualquier vecino: sin neutralizarlos, un reporte que empiece por
 * `=HYPERLINK(...)` o `@SUM(...)` se ejecuta al abrir la exportación en el municipio.
 */
const INICIO_FORMULA = /^[=+\-@\t\r]/;

export function csvCelda(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Los números se dejan tal cual: las latitudes y longitudes empiezan por `-` y deben
  // seguir siendo numéricas en la hoja.
  const esNumero = typeof v === 'number' || (s !== '' && Number.isFinite(Number(s)));
  const seguro = !esNumero && INICIO_FORMULA.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export async function rutasAdmin(app: FastifyInstance, dep: Dependencias) {
  app.get('/api/v1/exportar', { preHandler: requerirRol('tecnico', 'admin') }, async (req, res) => {
    const q = ExportarQuerySchema.safeParse(req.query);
    if (!q.success)
      return res.status(400).send({
        codigo: 'FILTROS_INVALIDOS',
        mensaje: q.error.issues.map((i) => i.message).join('; '),
      });
    const { filas, total } = await listarReportes(dep.pool, {
      filtros: q.data,
      soloPublicos: false,
    });
    const vistas = filas.map((f) => vistaTecnica(f, dep.cfg.urlPublica));
    const fecha = new Date().toISOString().slice(0, 10);
    if (q.data.formato === 'geojson') {
      res.header('Content-Type', 'application/geo+json; charset=utf-8');
      res.header(
        'Content-Disposition',
        `attachment; filename="mi-curichi-reportes-${fecha}.geojson"`,
      );
      return {
        type: 'FeatureCollection',
        nota_metodologica: NOTA_METODOLOGICA,
        generado_en: new Date().toISOString(),
        total,
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
      'ubicacion_metodo',
      'ubicacion_tipo',
      'distrito_id',
      'distrito',
      'unidad_vecinal_id',
      'unidad_vecinal',
      'manzana_id',
      'creado_en',
      'evento_en',
      'validado_en',
      'tirante_estimado',
      'duracion_estimada',
      'frecuencia',
      'afectacion',
      'causa_presunta',
      'sumidero_cercano',
      'sumidero_estado',
      'agua_brota_sumidero',
      'descripcion',
      'direccion_aprox',
      'punto_critico_id',
      'n_reportes_punto',
      'estado_motivo',
      'fusionado_en_id',
      'fotos',
    ];
    const lineas = [
      `# ${NOTA_METODOLOGICA}`,
      `# Generado ${new Date().toISOString()} · ${total} reportes · CRS EPSG:4326`,
      columnas.join(','),
    ];
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

  app.get(
    '/api/v1/indicadores',
    { preHandler: requerirRol('tecnico', 'admin') },
    async (): Promise<Indicadores> => {
      // Los nombres de distrito y unidad vecinal salen de la versión de capa con la que se
      // resolvió CADA reporte, no de la vigente: si no, al activar una entrega nueva los
      // reportes anteriores aparecen sin nombre en el panel (ver el comentario de SELECT_REPORTE).
      const [total, porEstado, porSev, porDistrito, porUv, pc, capas] = await Promise.all([
        dep.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM reporte_inundacion'),
        dep.pool.query<{ estado: string; n: string }>(
          'SELECT estado::text, count(*)::text AS n FROM reporte_inundacion GROUP BY estado',
        ),
        dep.pool.query<{ severidad: string; n: string }>(
          'SELECT COALESCE(severidad_manual, severidad_calculada)::text AS severidad, count(*)::text AS n FROM reporte_inundacion GROUP BY 1',
        ),
        dep.pool.query<{ distrito_id: string; nombre: string | null; n: string }>(
          `SELECT r.distrito_id, d.nombre, count(*)::text AS n FROM reporte_inundacion r LEFT JOIN geo.distrito_municipal d ON d.id = r.distrito_id AND d.version_capa = r.version_capa GROUP BY r.distrito_id, d.nombre ORDER BY count(*) DESC`,
        ),
        dep.pool.query<{
          unidad_vecinal_id: string;
          nombre: string | null;
          distrito_id: string | null;
          n: string;
        }>(
          `SELECT r.unidad_vecinal_id, u.nombre, u.distrito_id, count(*)::text AS n FROM reporte_inundacion r LEFT JOIN geo.unidad_vecinal u ON u.id = r.unidad_vecinal_id AND u.version_capa = r.version_capa GROUP BY r.unidad_vecinal_id, u.nombre, u.distrito_id ORDER BY count(*) DESC LIMIT 50`,
        ),
        dep.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM punto_critico WHERE n_reportes >= 2',
        ),
        dep.pool.query<{ capa: string; version: string }>(
          'SELECT capa, version FROM geo.capa_version WHERE vigente',
        ),
      ]);
      const sev = Object.fromEntries(SEVERIDADES.map((s) => [s, 0])) as Record<
        (typeof SEVERIDADES)[number],
        number
      >;
      for (const f of porSev.rows) sev[f.severidad as keyof typeof sev] = Number(f.n);
      return {
        total: Number(total.rows[0]?.n ?? 0),
        por_estado: Object.fromEntries(porEstado.rows.map((f) => [f.estado, Number(f.n)])),
        por_severidad: sev,
        por_distrito: porDistrito.rows.map((f) => ({
          distrito_id: f.distrito_id,
          nombre: f.nombre,
          n: Number(f.n),
        })),
        por_unidad_vecinal: porUv.rows.map((f) => ({
          unidad_vecinal_id: f.unidad_vecinal_id,
          nombre: f.nombre,
          distrito_id: f.distrito_id,
          n: Number(f.n),
        })),
        puntos_criticos_recurrentes: Number(pc.rows[0]?.n ?? 0),
        capas_vigentes: Object.fromEntries(capas.rows.map((f) => [f.capa, f.version])),
      };
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
