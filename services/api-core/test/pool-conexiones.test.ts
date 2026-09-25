/**
 * Regresión de la Fase 4: **ninguna petición puede necesitar dos conexiones del pool a la vez.**
 *
 * El fallo, encontrado probando concurrencia contra PostgreSQL real. `POST /api/v1/reportes`
 * tomaba una conexión para su transacción y, sin soltarla, llamaba a
 * `obtenerReporte(dep.pool, id)`, que pide OTRA al mismo pool. Con un pool de N, N peticiones
 * simultáneas tenían cada una la primera y esperaban todas la segunda: un bloqueo mutuo del que
 * solo se salía al vencer `connectionTimeoutMillis`. Medido con el pool en 8:
 *
 *    6 simultáneas → 6 × 201 en 91 ms
 *    8 simultáneas → 1 × 201 y 7 × 503, todas exactamente a los 10 071 ms
 *   12 simultáneas → 1 × 201 y 11 × 503
 *
 * El corte cae justo en el tamaño del pool, que es la firma de este problema.
 *
 * Con PGlite no se veía: es de conexión única y serializa las consultas, así que el error
 * "necesito dos a la vez" nunca se manifiesta. Por eso este test fuerza **max = 1**: si el
 * manejador vuelve a necesitar dos, se bloquea contra sí mismo y el test falla en vez de esperar
 * a que alguien lo descubra en producción.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieVecina: string;
let ex: ReturnType<typeof ejecutorPg>;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  // max: 1 a propósito. Y un plazo corto: si el manejador se bloquea contra sí mismo, el test
  // tiene que fallar en segundos y no quedarse colgado hasta el timeout de vitest.
  pool = new pg.Pool({ connectionString: base.url, max: 1, connectionTimeoutMillis: 4000 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    cfg: {
      ...leerConfig({ NODE_ENV: 'test', METRICAS_RUTA: '' }),
      // Sin límite de creación: lo que se prueba aquí es el pool, no el rate limit.
      rateLimitMax: 100_000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

/** Crea un reporte con sesión y con el turno de la cuota ya devuelto: aquí se prueba el pool. */
async function crear(extra: Record<string, unknown> = {}) {
  await liberarCuota(ex);
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: reporteValido,
    cookies: sesion(cookieVecina),
    ...extra,
  });
}

describe('una petición no puede retener dos conexiones del pool (§6)', () => {
  it('POST /reportes funciona con un pool de UNA sola conexión', async () => {
    const r = await crear();
    expect(r.statusCode, `respondió ${r.statusCode}: ${r.body.slice(0, 200)}`).toBe(201);
    expect(r.json().properties.id).toBeTruthy();
  }, 30_000);

  it('el camino de reintento con la misma clave tampoco pide una segunda conexión', async () => {
    const clave = `pool-${Date.now()}`;
    const primera = await crear({ headers: { 'idempotency-key': clave } });
    expect(primera.statusCode).toBe(201);
    // El reintento entra por la rama de "repetida", que relee el reporte ya creado. Era el otro
    // sitio donde se pedía una conexión extra.
    const segunda = await crear({ headers: { 'idempotency-key': clave } });
    expect(
      segunda.statusCode,
      `respondió ${segunda.statusCode}: ${segunda.body.slice(0, 200)}`,
    ).toBe(200);
    expect(segunda.headers['idempotent-replay']).toBe('true');
    expect(segunda.json().properties.id).toBe(primera.json().properties.id);
  }, 30_000);

  it('varias creaciones seguidas con un pool de una conexión no agotan nada', async () => {
    // Con `inject` las peticiones no son realmente paralelas en la red, pero sí encadenan sobre
    // el mismo pool: si una conexión se quedara sin soltar, la siguiente moriría por timeout.
    for (let i = 0; i < 5; i++) {
      const r = await crear();
      expect(r.statusCode, `iteración ${i}: ${r.body.slice(0, 160)}`).toBe(201);
    }
    // Y al final el pool tiene que estar libre: ninguna conexión retenida ni nadie esperando.
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  }, 60_000);
});
