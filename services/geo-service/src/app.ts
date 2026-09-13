import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import {
  type AgregadoUv,
  BboxSchema,
  type PuntoCritico,
  ResolverEntradaSchema,
  TIPOS_CAPA,
  type TipoCapa,
} from 'contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { CacheCapas } from './capas.js';
import type { ConfigGeo } from './config.js';
import { resolverPunto } from './resolver.js';

export interface DependenciasGeo {
  pool: pg.Pool;
  cfg: ConfigGeo;
  logger?: boolean | object;
}

const CapaParam = z.object({ capa: z.enum(TIPOS_CAPA) });
const TeselaParams = z.object({
  capa: z.enum(TIPOS_CAPA),
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.string().regex(/^\d+(\.mvt)?$/),
});

export async function crearApp(dep: DependenciasGeo): Promise<FastifyInstance> {
  const app = Fastify({ logger: dep.logger ?? false, requestIdHeader: 'x-request-id' });
  await app.register(sensible);
  await app.register(cors, { origin: dep.cfg.corsOrigenes, credentials: true });
  const capas = new CacheCapas(dep.pool, dep.cfg);
  app.decorate('capas', capas);

  app.get('/health', async () => ({ ok: true, servicio: 'geo-service' }));
  app.get('/ready', async (_req, res) => {
    try {
      await dep.pool.query('SELECT postgis_version()');
      return { ok: true, capas: await capas.versionesVigentes() };
    } catch (e) {
      res.status(503);
      return { ok: false, error: (e as Error).message };
    }
  });

  app.post('/geo/v1/resolver', async (req, res) => {
    const p = ResolverEntradaSchema.safeParse(req.body);
    if (!p.success) return res.badRequest(p.error.issues.map((i) => i.message).join('; '));
    return resolverPunto(dep.pool, p.data.lat, p.data.lon);
  });

  app.get('/geo/v1/capas/vigentes', async () => capas.versionesVigentes());
  app.get('/geo/v1/capas', async () => capas.info());
  app.post('/geo/v1/capas/invalidar', async () => {
    capas.invalidar();
    return { ok: true };
  });

  app.get('/geo/v1/capas/:capa', async (req, res) => {
    const p = CapaParam.safeParse(req.params);
    if (!p.success) return res.notFound('Capa desconocida');
    const c = await capas.obtener(p.data.capa);
    if (!c) return res.notFound(`No hay versión vigente de ${p.data.capa}`);
    if (c.bytes > dep.cfg.umbralTeselasBytes) {
      res.status(413);
      return {
        codigo: 'USAR_TESELAS',
        mensaje: `La capa pesa ${c.bytes} bytes; consumila por teselas`,
        url: `/geo/v1/teselas/${p.data.capa}/{z}/{x}/{y}.mvt`,
      };
    }
    res.header('Content-Type', 'application/geo+json; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=300');
    res.header('ETag', `"${p.data.capa}-${c.version}"`);
    return c.texto;
  });

  app.get('/geo/v1/teselas/:capa/:z/:x/:y', async (req, res) => {
    const p = TeselaParams.safeParse(req.params);
    if (!p.success) return res.badRequest('Tesela inválida');
    const c = await capas.obtener(p.data.capa);
    if (!c) return res.notFound(`No hay versión vigente de ${p.data.capa}`);
    const y = Number(p.data.y.replace(/\.mvt$/, ''));
    const buf = capas.tesela(c, p.data.capa, p.data.z, p.data.x, y);
    res.header('Cache-Control', 'public, max-age=300');
    res.header('ETag', `"${p.data.capa}-${c.version}-${p.data.z}-${p.data.x}-${y}"`);
    if (!buf) return res.status(204).send();
    res.header('Content-Type', 'application/vnd.mapbox-vector-tile');
    return res.send(Buffer.from(buf));
  });

  app.get('/geo/v1/agregados/unidades-vecinales', async (): Promise<AgregadoUv[]> => {
    const r = await dep.pool.query<AgregadoUv>(
      `SELECT u.id AS unidad_vecinal_id, u.codigo, u.nombre, u.distrito_id,
              count(r.id)::int AS n_reportes,
              count(DISTINCT r.punto_critico_id)::int AS n_puntos_criticos,
              (SELECT COALESCE(severidad_manual, severidad_calculada)::text FROM reporte_inundacion x
                 WHERE x.unidad_vecinal_id = u.id AND x.estado IN ('validado','resuelto')
                 ORDER BY CASE COALESCE(severidad_manual, severidad_calculada) WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC LIMIT 1) AS severidad_max
       FROM geo.unidad_vecinal_vigente u
       LEFT JOIN reporte_inundacion r ON r.unidad_vecinal_id = u.id AND r.estado IN ('validado', 'resuelto')
       GROUP BY u.id, u.codigo, u.nombre, u.distrito_id ORDER BY n_reportes DESC, u.id`,
    );
    return r.rows;
  });

  app.get('/geo/v1/puntos-criticos', async (req, res): Promise<PuntoCritico[] | undefined> => {
    const q = z.object({ bbox: BboxSchema.optional() }).safeParse(req.query);
    if (!q.success) return res.badRequest(q.error.issues.map((i) => i.message).join('; '));
    const filtro = q.data.bbox ? 'WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)' : '';
    const params: unknown[] = q.data.bbox ? [...q.data.bbox] : [];
    type FilaPc = Omit<PuntoCritico, 'primer_reporte_en' | 'ultimo_reporte_en' | 'calculado_en'> & {
      primer_reporte_en: Date;
      ultimo_reporte_en: Date;
      calculado_en: Date;
    };
    const r = await dep.pool.query<FilaPc>(
      `SELECT id, ST_Y(geom) AS lat, ST_X(geom) AS lon, n_reportes, primer_reporte_en, ultimo_reporte_en, severidad_max, distrito_id, unidad_vecinal_id,
              radio_m::float AS radio_m, diametro_m::float AS diametro_m, advertencia_diametro, calculado_en
       FROM punto_critico ${filtro} ORDER BY n_reportes DESC, ultimo_reporte_en DESC`,
      params,
    );
    return r.rows.map((f) => ({
      ...f,
      primer_reporte_en: new Date(f.primer_reporte_en).toISOString(),
      ultimo_reporte_en: new Date(f.ultimo_reporte_en).toISOString(),
      calculado_en: new Date(f.calculado_en).toISOString(),
    }));
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    capas: CacheCapas;
  }
}

export type { TipoCapa };
