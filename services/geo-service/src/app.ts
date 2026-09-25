import compress from '@fastify/compress';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import { CacheCorta } from './cache-corta.js';
import { CacheCapas } from './capas.js';
import { igualEnTiempoConstante } from './comparar.js';
import type { ConfigGeo } from './config.js';
import { instalarObservabilidad, instrumentarPool, MetricasGeo } from './observabilidad.js';
import { opcionFastify } from './proxy.js';
import { resolverPunto } from './resolver.js';

export interface DependenciasGeo {
  pool: pg.Pool;
  cfg: ConfigGeo;
  logger?: boolean | object;
  /** Registro de métricas; si no se pasa, se crea uno propio. */
  metricas?: MetricasGeo;
}

const CapaParam = z.object({ capa: z.enum(TIPOS_CAPA) });
const TeselaParams = z.object({
  capa: z.enum(TIPOS_CAPA),
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.string().regex(/^\d+(\.mvt)?$/),
});

/** Cota dura de la respuesta de /puntos-criticos; el mapa pide por bbox. */
const MAX_PUNTOS_CRITICOS = 5000;

/** Direcciones de la propia máquina: por ahí llega api-core en el modo local sin proxy. */
function esLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  const limpia = ip.replace(/^::ffff:/, '');
  return limpia === '127.0.0.1' || limpia === '::1' || limpia.startsWith('127.');
}

export async function crearApp(dep: DependenciasGeo): Promise<FastifyInstance> {
  const app = Fastify({
    logger: dep.logger ?? false,
    requestIdHeader: 'x-request-id',
    trustProxy: opcionFastify(dep.cfg.confiarEnProxy),
  });
  await app.register(sensible);
  // Aquí pesa todavía más que en api-core: una capa web en GeoJSON son megabytes de coordenadas
  // repetitivas. Las teselas (.mvt) ya vienen comprimidas como protobuf, así que se excluyen:
  // volver a comprimir gasta CPU y no baja el tamaño.
  await app.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate'],
    threshold: 1024,
    zlibOptions: { level: 6 },
    // Solo JSON, GeoJSON y texto. Las teselas `.mvt` son protobuf ya compacto: volver a
    // comprimirlas gasta CPU y no baja el tamaño.
    customTypes: /^application\/(geo\+)?json|^text\//,
  });
  await app.register(cors, { origin: dep.cfg.corsOrigenes, credentials: true });
  // Sin límite, un solo cliente satura el servicio. El global es amplio porque el mapa pide
  // muchas teselas; las rutas que consultan PostGIS llevan el suyo, más estrecho.
  await app.register(rateLimit, { max: dep.cfg.rateLimitPorMinuto, timeWindow: '1 minute' });
  const limiteConsulta = {
    config: { rateLimit: { max: dep.cfg.rateLimitConsultasPorMinuto, timeWindow: '1 minute' } },
  };
  const metricas = dep.metricas ?? new MetricasGeo();
  app.decorate('metricas', metricas);
  instrumentarPool(dep.pool as unknown as Parameters<typeof instrumentarPool>[0], metricas);
  instalarObservabilidad(app, {
    metricas,
    exponerEn: dep.cfg.rutaMetricas,
    token: dep.cfg.tokenMetricas,
  });
  // El id llega de api-core y se devuelve: la misma petición se puede seguir en los dos logs.
  app.addHook('onRequest', async (req, res) => {
    const entrante = req.headers['x-request-id'];
    const id =
      typeof entrante === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(entrante)
        ? entrante
        : String(req.id);
    res.header('X-Request-Id', id);
  });
  app.addHook('onSend', async (_req, res) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });
  const capas = new CacheCapas(dep.pool, dep.cfg, metricas);
  app.decorate('capas', capas);
  // Los agregados por UV recorren todos los reportes; los consultan el panel y el mapa público
  // en cada carga. Unos segundos de caché quitan la mayor parte de esas pasadas sin que el dato
  // deje de ser útil: es un conteo para colorear un mapa, no un saldo bancario.
  const agregados = new CacheCorta<AgregadoUv[]>(dep.cfg.cacheAgregadosMs);
  app.decorate('agregados', agregados);

  app.get('/health', async () => ({ ok: true, servicio: 'geo-service' }));
  app.get('/ready', async (req, res) => {
    try {
      await dep.pool.query('SELECT postgis_version()');
      return { ok: true, capas: await capas.versionesVigentes() };
    } catch (e) {
      // El mensaje de pg lleva host, usuario y base de datos: va al log, no a la respuesta.
      req.log.error({ err: e }, 'readiness: PostGIS no disponible');
      res.status(503);
      return { ok: false, error: 'base de datos no disponible' };
    }
  });

  app.post('/geo/v1/resolver', limiteConsulta, async (req, res) => {
    const p = ResolverEntradaSchema.safeParse(req.body);
    if (!p.success) return res.badRequest(p.error.issues.map((i) => i.message).join('; '));
    return resolverPunto(dep.pool, p.data.lat, p.data.lon);
  });

  app.get('/geo/v1/capas/vigentes', async () => capas.versionesVigentes());
  app.get('/geo/v1/capas', async () => capas.info());
  /**
   * Ruta interna: la llama api-core al activar una versión de capa. Era pública, y cada
   * invalidación obliga a releer la capa entera de PostGIS (decenas de MB) y a reconstruir
   * el índice de teselas, así que bastaba repetirla para tumbar el servicio.
   */
  app.post('/geo/v1/capas/invalidar', async (req, res) => {
    const token = req.headers['x-token-interno'];
    const autorizado = dep.cfg.tokenInterno
      ? igualEnTiempoConstante(token, dep.cfg.tokenInterno)
      : esLoopback(req.socket.remoteAddress);
    if (!autorizado) return res.forbidden('Ruta interna.');
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

  app.get(
    '/geo/v1/agregados/unidades-vecinales',
    limiteConsulta,
    async (_req, res): Promise<AgregadoUv[]> => {
      const cacheado = agregados.vigente();
      if (cacheado) {
        res.header('X-Cache', 'hit');
        metricas.contar('curichi_geo_cache_aciertos_total', { cache: 'agregados' });
        return cacheado;
      }
      // Caducado pero servible: se responde con la copia vieja y el recálculo va por detrás.
      // Sin esto, una petición de cada treinta segundos pagaba la consulta entera (264 ms con un
      // millón de reportes) mientras el resto veía 2 ms.
      const viejo = agregados.revalidable();
      res.header('X-Cache', viejo ? 'stale' : 'miss');
      metricas.contar(
        viejo ? 'curichi_geo_cache_revalidaciones_total' : 'curichi_geo_cache_fallos_total',
        { cache: 'agregados' },
      );
      return agregados.obtener(async () => {
        // Una sola pasada: antes había una subconsulta correlacionada por CADA unidad vecinal
        // (576 con las capas reales) solo para sacar la severidad máxima. Ahora sale del mismo
        // GROUP BY con un max() sobre el orden de severidad, y se traduce de vuelta a texto.
        const r = await dep.pool.query<AgregadoUv>(
          `SELECT u.id AS unidad_vecinal_id, u.codigo, u.nombre, u.distrito_id,
                count(r.id)::int AS n_reportes,
                count(DISTINCT r.punto_critico_id)::int AS n_puntos_criticos,
                CASE max(CASE COALESCE(r.severidad_manual, r.severidad_calculada)
                           WHEN 'critica' THEN 4 WHEN 'alta' THEN 3
                           WHEN 'media' THEN 2 WHEN 'baja' THEN 1 END)
                  WHEN 4 THEN 'critica' WHEN 3 THEN 'alta'
                  WHEN 2 THEN 'media' WHEN 1 THEN 'baja' END AS severidad_max
         FROM geo.unidad_vecinal_vigente u
         LEFT JOIN reporte_inundacion r
           ON r.unidad_vecinal_id = u.id AND r.estado IN ('validado', 'resuelto')
         GROUP BY u.id, u.codigo, u.nombre, u.distrito_id
         ORDER BY n_reportes DESC, u.id`,
        );
        return r.rows;
      });
    },
  );

  app.get(
    '/geo/v1/puntos-criticos',
    limiteConsulta,
    async (req, res): Promise<PuntoCritico[] | undefined> => {
      const q = z.object({ bbox: BboxSchema.optional() }).safeParse(req.query);
      if (!q.success) return res.badRequest(q.error.issues.map((i) => i.message).join('; '));
      // Esta ruta es pública (la consume el mapa ciudadano), así que trabaja SIEMPRE sobre
      // `geom_publico`. El centroide exacto no puede salir: con minpoints = 1 un reporte sin
      // vecinos forma su propio punto crítico y su centroide es su coordenada exacta, con lo
      // que el jitter de la vista pública quedaba anulado (§13). Sin punto publicable no se
      // publica: es preferible un punto de menos a revelar una vivienda.
      const filtro = q.data.bbox
        ? 'WHERE geom_publico IS NOT NULL AND geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326)'
        : 'WHERE geom_publico IS NOT NULL';
      const params: unknown[] = q.data.bbox ? [...q.data.bbox] : [];
      type FilaPc = Omit<
        PuntoCritico,
        'primer_reporte_en' | 'ultimo_reporte_en' | 'calculado_en'
      > & {
        primer_reporte_en: Date;
        ultimo_reporte_en: Date;
        calculado_en: Date;
      };
      // Con cota: sin LIMIT la respuesta crece con la ciudad y un solo GET podía traer
      // decenas de miles de puntos. El mapa consume por bbox.
      // Se seleccionan las columnas UNA A UNA y no con `*`. `radio_m`, `diametro_m` y
      // `advertencia_diametro` se calculan sobre las coordenadas EXACTAS de los miembros del
      // grupo (`diametro_m` es la distancia entre los dos más separados, a 0,1 m), mientras que
      // lo que se publica aquí es el centroide ya degradado. Publicar las dos cosas juntas da una
      // medida exacta sobre posiciones que se están ocultando a propósito. Ningún cliente las
      // usaba; quedan en la tabla para el análisis del técnico (§9.2).
      const r = await dep.pool.query<FilaPc>(
        `SELECT id, ST_Y(geom_publico) AS lat, ST_X(geom_publico) AS lon, n_reportes,
              primer_reporte_en, ultimo_reporte_en, severidad_max, distrito_id, unidad_vecinal_id,
              calculado_en
       FROM punto_critico ${filtro} ORDER BY n_reportes DESC, ultimo_reporte_en DESC
       LIMIT ${MAX_PUNTOS_CRITICOS}`,
        params,
      );
      return r.rows.map((f) => ({
        ...f,
        primer_reporte_en: new Date(f.primer_reporte_en).toISOString(),
        ultimo_reporte_en: new Date(f.ultimo_reporte_en).toISOString(),
        calculado_en: new Date(f.calculado_en).toISOString(),
      }));
    },
  );

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    capas: CacheCapas;
    agregados: CacheCorta<AgregadoUv[]>;
    metricas: MetricasGeo;
  }
}

export type { TipoCapa };
