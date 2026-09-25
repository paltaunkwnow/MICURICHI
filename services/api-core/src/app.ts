import { existsSync, readFileSync } from 'node:fs';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { CONFIG_DOMINIO } from 'contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import { parse as parseYaml } from 'yaml';
import type { Almacen } from './almacen.js';
import { instalarAuth } from './auth.js';
import { aplicarCachePorDefecto } from './cache.js';
import type { ConfigApi } from './config.js';
import { instalarObservabilidad, instrumentarPool, Metricas } from './observabilidad.js';
import { opcionFastify } from './proxy.js';
import { GeoNoDisponible, type ResolverGeo } from './resolver.js';
import { rutasAdmin } from './rutas/admin.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasFotos } from './rutas/fotos.js';
import { rutasModeracion } from './rutas/moderacion.js';
import { rutasReportes } from './rutas/reportes.js';

export interface Dependencias {
  pool: pg.Pool;
  cfg: ConfigApi;
  resolver: ResolverGeo;
  almacen: Almacen;
  logger?: boolean | object;
  /** Registro de métricas; si no se pasa, se crea uno propio. */
  metricas?: Metricas;
}

export async function crearApp(dep: Dependencias): Promise<FastifyInstance> {
  const app = Fastify({
    logger: dep.logger ?? false,
    requestIdHeader: 'x-request-id',
    // Solo se confía en X-Forwarded-For si hay un proxy propio delante (TRUST_PROXY=1).
    // Con `true` sin proxy, req.ip es lo que diga el cliente: el rate limit y el ip_hash
    // del antispam dejan de servir para nada.
    trustProxy: opcionFastify(dep.cfg.confiarEnProxy),
    bodyLimit: 1024 * 1024,
  });
  await app.register(sensible);
  /**
   * Compresión de las respuestas. Medido en la Fase 4 sobre una página real del listado público
   * (300 reportes en GeoJSON): **265 KB sin comprimir → 14 KB con gzip, 18,9× menos, por 1,3 ms
   * de CPU**. El GeoJSON comprime tan bien porque repite las mismas claves en cada feature.
   *
   * Para una app que se usa desde el celular con datos móviles, esa diferencia es la que hay
   * entre un mapa que carga y uno que no. Lo natural sería comprimir en el proxy de entrada,
   * pero la topología documentada mete un rewrite de Next por el medio y no hay garantía de que
   * el proxy del municipio lo haga: comprimir en el origen es lo único que no depende de eso.
   *
   * gzip y deflate, NO brotli: brotli da 24,9× pero cuesta 78 ms por respuesta, y pagar 78 ms de
   * CPU en cada petición para ahorrar 3 KB es un mal negocio en contenido dinámico.
   *
   * El umbral evita comprimir respuestas chicas, donde la cabecera y el trabajo no se amortizan.
   */
  await app.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate'],
    threshold: 1024,
    zlibOptions: { level: 6 },
  });
  await app.register(cors, { origin: dep.cfg.corsOrigenes, credentials: true });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: CONFIG_DOMINIO.FOTO_MAX_BYTES, files: 1, fields: 5 },
  });
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });
  app.decorateRequest('requestId', '');
  const metricas = dep.metricas ?? new Metricas();
  app.decorate('metricas', metricas);
  // Duración de consultas y estado del pool. Sin esto, «la API va lenta» no se puede separar en
  // «la base tarda» y «no quedan conexiones», que se arreglan de formas opuestas.
  instrumentarPool(dep.pool as unknown as Parameters<typeof instrumentarPool>[0], metricas);
  instalarObservabilidad(app, {
    metricas,
    exponerEn: dep.cfg.rutaMetricas,
    token: dep.cfg.tokenMetricas,
  });
  instalarAuth(app, { pool: dep.pool, idleHoras: dep.cfg.sesionIdleHoras });

  app.addHook('onSend', async (req, res) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.header('X-Frame-Options', 'DENY');
    // Cerrado por defecto: si el manejador no declaró que su contenido es público, no se guarda
    // en ninguna caché. Ver cache.ts para por qué la decisión vive en un solo sitio.
    aplicarCachePorDefecto(res);
    // La API solo devuelve datos; nada debe ejecutarse ni embeberse desde este origen.
    // /docs queda fuera: Swagger UI es una página real que necesita sus scripts y estilos.
    if (!req.url.startsWith('/docs'))
      res.header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
  });

  /**
   * ¿El error es "la base no está disponible ahora mismo" y no "el servicio está roto"?
   *
   * Los tres casos que importan, y los tres se vieron en la prueba de carga de la Fase 4:
   *  - el pool agotado (`timeout exceeded when trying to connect`, que es lo que lanza `pg-pool`
   *    cuando se cumple `connectionTimeoutMillis`): con 500 peticiones simultáneas contra un pool
   *    de 8, 106 de ellas acababan así;
   *  - la base rechazando conexiones (`ECONNREFUSED`) o arrancando todavía (`57P03`);
   *  - el servidor sin cupo de conexiones (`53300`).
   *
   * Los tres son transitorios y se arreglan solos esperando, así que la respuesta honesta es un
   * 503 con `Retry-After` y no un 500. La diferencia no es cosmética: un 500 le dice al cliente
   * (y al balanceador, y a quien mira el panel de errores) que hay un fallo que investigar,
   * mientras que un 503 dice "estoy saturado, volvé enseguida", que es exactamente lo que pasa.
   */
  /**
   * Códigos de red que solo pueden venir de no poder hablar con la base: en este servicio la
   * única salida a otro host por socket es PostgreSQL (a geo-service se va con `fetch`, que
   * falla con TypeError o DOMException, no con estos códigos).
   *
   * `ENOTFOUND` no es hipotético: al parar el contenedor de la base en la prueba de resiliencia
   * de la Fase 4, el DNS interno de Docker dejó de resolver el nombre `postgis` y el listado
   * devolvía 500. En un despliegue con descubrimiento por DNS pasa lo mismo cada vez que el
   * servicio de base se reprograma.
   */
  const CODIGOS_RED = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ]);
  const esBaseNoDisponible = (e: Error & { code?: string }): boolean =>
    e.message === 'timeout exceeded when trying to connect' ||
    e.message === 'Connection terminated unexpectedly' ||
    e.message === 'Client has encountered a connection error and is not queryable' ||
    (e.code !== undefined && CODIGOS_RED.has(e.code)) ||
    // SQLSTATE: 57P03 cannot_connect_now (arrancando), 53300 too_many_connections,
    // 08006 connection_failure, 08001 no se pudo establecer, 57P01 admin_shutdown.
    e.code === '57P03' ||
    e.code === '53300' ||
    e.code === '08006' ||
    e.code === '08001' ||
    e.code === '57P01';

  app.setErrorHandler((err, req, res) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode === 429)
      return res.status(429).send({
        codigo: 'RATE_LIMIT',
        mensaje: 'Demasiadas solicitudes. Esperá un momento y volvé a intentar.',
      });
    if (e.statusCode && e.statusCode < 500)
      return res.status(e.statusCode).send({ codigo: e.code ?? 'ERROR', mensaje: e.message });
    if (esBaseNoDisponible(e)) {
      req.log.warn({ err: e }, 'base de datos saturada o no disponible');
      metricas.contar('curichi_db_no_disponible_total', { ruta: req.routeOptions?.url ?? 'otra' });
      res.header('Retry-After', '2');
      return res.status(503).send({
        codigo: 'NO_DISPONIBLE',
        mensaje: 'El servicio está saturado. Probá de nuevo en unos segundos.',
      });
    }
    // Mismo criterio para geo-service: sin él no se puede resolver la unidad vecinal y por tanto
    // no se puede crear el reporte, pero eso es transitorio. Comprobado parando el contenedor:
    // antes el vecino recibía 500 ERROR_INTERNO al pulsar «Enviar reporte».
    if (e instanceof GeoNoDisponible) {
      req.log.warn({ err: e }, 'geo-service no disponible');
      metricas.contar('curichi_geo_no_disponible_total', { ruta: req.routeOptions?.url ?? 'otra' });
      res.header('Retry-After', '5');
      return res.status(503).send({
        codigo: 'NO_DISPONIBLE',
        mensaje:
          'No pudimos ubicar el punto ahora mismo. Probá de nuevo en unos segundos; el reporte no se duplica.',
      });
    }
    req.log.error(e);
    return res
      .status(500)
      .send({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno. Ya quedó registrado.' });
  });

  app.get('/health', async () => ({ ok: true, servicio: 'api-core' }));
  // /ready consulta la base y geo-service: es público, así que se limita para que no sirva
  // de amplificador. El detalle del fallo va al log, no a la respuesta: el mensaje de `pg`
  // incluye host, usuario y base de datos.
  app.get(
    '/ready',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, res) => {
      const estado: Record<string, unknown> = {};
      try {
        await dep.pool.query('SELECT 1');
        estado.db = 'ok';
      } catch (e) {
        req.log.error({ err: e }, 'readiness: base de datos no disponible');
        estado.db = 'error';
      }
      try {
        const r = await fetch(`${dep.cfg.geoServiceUrl}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        estado.geo = r.ok ? 'ok' : `HTTP ${r.status}`;
      } catch (e) {
        req.log.error({ err: e }, 'readiness: geo-service no disponible');
        estado.geo = 'error';
      }
      if (dep.almacen.comprobar) {
        try {
          await dep.almacen.comprobar();
          estado.fotos = 'ok';
        } catch (e) {
          // Con el almacén caído se siguen sirviendo el mapa y los reportes, pero ni se suben ni
          // se ven fotos. Sin esta línea la readiness decía "ok" y nadie se enteraba hasta que un
          // vecino intentaba adjuntar una foto y recibía un 500.
          req.log.error({ err: e }, 'readiness: almacén de fotos no disponible');
          estado.fotos = 'error';
        }
      } else estado.fotos = 'ok';
      // La readiness decide si el balanceador manda tráfico a ESTA réplica, así que solo puede
      // mirar lo que impide a esta réplica atender. Antes bastaba con que geo-service estuviera
      // caído para devolver 503, y como todas las réplicas hablan con el mismo geo-service,
      // TODAS salían de rotación a la vez: un fallo que solo debería impedir crear reportes
      // (POST /reportes resuelve la UV) convertía el sitio entero en inaccesible, mapa incluido.
      // Sin base de datos no se puede hacer nada, y eso sí es 503. El almacén de fotos va por el
      // mismo camino: es compartido, así que tumbar todas las réplicas no arregla nada.
      const ok = estado.db === 'ok';
      estado.degradado = estado.geo !== 'ok' || estado.fotos !== 'ok';
      res.status(ok ? 200 : 503);
      return { ok, ...estado };
    },
  );

  if (dep.cfg.exponerDocs && existsSync(dep.cfg.rutaOpenApi)) {
    const doc = parseYaml(readFileSync(dep.cfg.rutaOpenApi, 'utf8'));
    await app.register(swagger, { mode: 'static', specification: { document: doc } });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await rutasAuth(app, dep);
  await rutasReportes(app, dep);
  await rutasModeracion(app, dep);
  await rutasFotos(app, dep);
  await rutasAdmin(app, dep);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    metricas: Metricas;
  }
}
