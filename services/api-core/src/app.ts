import { existsSync, readFileSync } from 'node:fs';
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
import type { ConfigApi } from './config.js';
import type { ResolverGeo } from './resolver.js';
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
}

export async function crearApp(dep: Dependencias): Promise<FastifyInstance> {
  const app = Fastify({
    logger: dep.logger ?? false,
    requestIdHeader: 'x-request-id',
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });
  await app.register(sensible);
  await app.register(cors, { origin: dep.cfg.corsOrigenes, credentials: true });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: CONFIG_DOMINIO.FOTO_MAX_BYTES, files: 1, fields: 5 },
  });
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });
  instalarAuth(app, { pool: dep.pool });

  app.addHook('onSend', async (_req, res) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  app.setErrorHandler((err, req, res) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode === 429)
      return res.status(429).send({
        codigo: 'RATE_LIMIT',
        mensaje: 'Demasiadas solicitudes. Esperá un momento y volvé a intentar.',
      });
    if (e.statusCode && e.statusCode < 500)
      return res.status(e.statusCode).send({ codigo: e.code ?? 'ERROR', mensaje: e.message });
    req.log.error(e);
    return res
      .status(500)
      .send({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno. Ya quedó registrado.' });
  });

  app.get('/health', async () => ({ ok: true, servicio: 'api-core' }));
  app.get('/ready', async (_req, res) => {
    const estado: Record<string, unknown> = {};
    try {
      await dep.pool.query('SELECT 1');
      estado.db = 'ok';
    } catch (e) {
      estado.db = (e as Error).message;
    }
    try {
      const r = await fetch(`${dep.cfg.geoServiceUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      estado.geo = r.ok ? 'ok' : `HTTP ${r.status}`;
    } catch (e) {
      estado.geo = (e as Error).message;
    }
    const ok = estado.db === 'ok' && estado.geo === 'ok';
    res.status(ok ? 200 : 503);
    return { ok, ...estado };
  });

  if (existsSync(dep.cfg.rutaOpenApi)) {
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
