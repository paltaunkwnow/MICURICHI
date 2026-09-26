/**
 * Cliente de geo-service (`ResolverHttp`) contra un servidor HTTP de verdad en un puerto libre.
 *
 * geo-service exime del cupo por IP del resolver a quien trae `x-token-interno` válido: api-core
 * llama una vez por cada `POST /reportes`, siempre desde el mismo origen, y con el cupo
 * compartido una tormenta bastaba para que geo-service respondiera 429 a todas las creaciones de
 * la ciudad (que el vecino ve como 503). Pero `resolver()` no mandaba el token: solo
 * `invalidarCapas()` lo hacía, y esta además se tragaba los fallos sin dejar rastro.
 */
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { Metricas } from '../src/observabilidad.js';
import { type ObservabilidadResolver, type ResolverGeo, ResolverHttp } from '../src/resolver.js';
import { resolverDePrueba } from './ayudas.js';

const TOKEN = 'token-interno-de-ejemplo-con-32-caracteres-o-mas';

interface ServidorDePrueba {
  url: string;
  cabeceras: IncomingHttpHeaders[];
  cerrar(): Promise<void>;
}

const abiertos: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cerrar of abiertos.splice(0)) await cerrar();
});

/** geo-service de mentira: anota las cabeceras de cada petición y responde lo que se le diga. */
async function geoDePrueba(responder: (res: ServerResponse) => void): Promise<ServidorDePrueba> {
  const cabeceras: IncomingHttpHeaders[] = [];
  const servidor = createServer((req, res) => {
    cabeceras.push(req.headers);
    req.resume();
    req.on('end', () => responder(res));
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  const cerrar = () => new Promise<void>((ok) => servidor.close(() => ok()));
  abiertos.push(cerrar);
  return { url: `http://127.0.0.1:${port}`, cabeceras, cerrar };
}

const respuestaValida = async (res: ServerResponse) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(await resolverDePrueba.resolver(-17.79, -63.195)));
};

/** Observabilidad espía: el log de verdad es pino, aquí basta con saber qué se avisó. */
function observabilidadEspia() {
  const metricas = new Metricas();
  const warn = vi.fn();
  const obs: ObservabilidadResolver = { log: { warn } as never, metricas };
  return { obs, metricas, warn };
}

describe('el resolver se identifica ante geo-service', () => {
  it('resolver() manda el token interno (y el id de la petición)', async () => {
    const geo = await geoDePrueba((res) => void respuestaValida(res));
    const r = await new ResolverHttp(geo.url, TOKEN).resolver(-17.79, -63.195, 'pet-123');
    expect(r.dentro_cobertura).toBe(true);
    expect(geo.cabeceras[0]?.['x-token-interno']).toBe(TOKEN);
    expect(geo.cabeceras[0]?.['x-request-id']).toBe('pet-123');
  });

  it('sin token configurado (modo local sin Docker) no manda la cabecera', async () => {
    const geo = await geoDePrueba((res) => void respuestaValida(res));
    await new ResolverHttp(geo.url, '').resolver(-17.79, -63.195);
    expect(geo.cabeceras[0]).not.toHaveProperty('x-token-interno');
  });

  it('invalidarCapas() también lo manda', async () => {
    const geo = await geoDePrueba((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new ResolverHttp(geo.url, TOKEN).invalidarCapas();
    expect(geo.cabeceras[0]?.['x-token-interno']).toBe(TOKEN);
  });
});

describe('invalidarCapas() no falla en silencio', () => {
  it('un rechazo de geo-service (p. ej. 403 por token mal configurado) deja aviso y métrica', async () => {
    const geo = await geoDePrueba((res) => {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end('{"message":"Ruta interna."}');
    });
    const { obs, metricas, warn } = observabilidadEspia();
    const resolver = new ResolverHttp(geo.url, 'token-que-no-es-el-bueno');
    resolver.observar(obs);
    // Sigue siendo de mejor esfuerzo: la activación ya está confirmada y esto no la deshace.
    await expect(resolver.invalidarCapas()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(metricas.exponer()).toContain('curichi_geo_invalidacion_fallida_total{} 1');
  });

  it('geo-service caído también deja aviso y métrica', async () => {
    const geo = await geoDePrueba(() => {});
    await geo.cerrar(); // nadie escucha ya en ese puerto
    const { obs, metricas, warn } = observabilidadEspia();
    const resolver = new ResolverHttp(geo.url, TOKEN);
    resolver.observar(obs);
    await expect(resolver.invalidarCapas()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(metricas.exponer()).toContain('curichi_geo_invalidacion_fallida_total{} 1');
  });

  it('una invalidación correcta no avisa de nada', async () => {
    const geo = await geoDePrueba((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    const { obs, metricas, warn } = observabilidadEspia();
    const resolver = new ResolverHttp(geo.url, TOKEN);
    resolver.observar(obs);
    await resolver.invalidarCapas();
    expect(warn).not.toHaveBeenCalled();
    expect(metricas.exponer()).not.toContain('curichi_geo_invalidacion_fallida_total');
  });
});

describe('crearApp conecta la observabilidad del resolver', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('le pasa su logger y su registro de métricas, el mismo que expone /metrics', async () => {
    const observar = vi.fn();
    const resolver: ResolverGeo = { ...resolverDePrueba, observar };
    app = await crearApp({
      // Pool de mentira: crearApp solo lo instrumenta, y sin cookie de sesión nadie consulta.
      pool: {
        query: async () => ({ rows: [] }),
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
      } as unknown as pg.Pool,
      // Sin /docs: registrar Swagger con el OpenAPI entero es lo más lento de crearApp y aquí no
      // pinta nada.
      cfg: {
        ...leerConfig({ NODE_ENV: 'test', METRICAS_RUTA: '' }),
        rutaOpenApi: '/no-existe.yaml',
      },
      resolver,
      almacen: new AlmacenMemoria(),
    });
    expect(observar).toHaveBeenCalledTimes(1);
    const recibido = observar.mock.calls[0]![0] as ObservabilidadResolver;
    expect(recibido.metricas).toBe(app.metricas);
    expect(recibido.log).toBe(app.log);
  }, 60_000);
});
