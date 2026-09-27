/**
 * Los errores 4xx que produce el propio Fastify (o sus plugins) no llegan tal cual al cliente.
 *
 * El manejador general publicaba `{ codigo: e.code, mensaje: e.message }` para cualquier 4xx, así
 * que un JSON mal formado en `POST /api/v1/reportes` respondía
 * `{"codigo":"FST_ERR_CTP_INVALID_JSON_BODY","mensaje":"Body is not valid JSON but content-type is
 * set to 'application/json'"}`: un código interno del framework en lugar de uno del dominio
 * (CLAUDE.md §13: no publicar qué corre por dentro) y un mensaje en inglés para el vecino. El
 * estado HTTP sí era el correcto y se conserva.
 *
 * Todo ocurre antes de tocar la base, así que basta un pool de mentira.
 */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { configDePrueba, resolverDePrueba } from './ayudas.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await crearApp({
    // Pool de mentira: estas peticiones se rechazan antes de llegar a la base.
    pool: {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      options: { max: 8 },
    } as unknown as pg.Pool,
    cfg: {
      ...configDePrueba({
        NODE_ENV: 'test',
        METRICAS_RUTA: '',
        RATE_LIMIT_REPORTES_POR_HORA: '1000',
      }),
      rutaOpenApi: '/no-existe.yaml',
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
});

function enviar(cuerpo: string | Buffer, contentType: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: cuerpo,
    headers: { 'content-type': contentType },
  });
}

/**
 * Nada del framework en la respuesta: ni su código ni sus mensajes («Body is not valid JSON but
 * content-type is set to…», «Request body is too large», «Unsupported Media Type: …»).
 */
function sinDetallesInternos(cuerpo: string) {
  expect(cuerpo).not.toMatch(/FST_|content-type|body|unsupported/i);
}

describe('errores del framework con códigos propios', () => {
  it('JSON roto → 400 PAYLOAD_INVALIDO, sin el código ni el mensaje de Fastify', async () => {
    const r = await enviar('{"lat": -17.79, "lon":', 'application/json');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    sinDetallesInternos(r.body);
  });

  it('cuerpo vacío declarado como JSON → 400 PAYLOAD_INVALIDO', async () => {
    const r = await enviar('', 'application/json');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    sinDetallesInternos(r.body);
  });

  it('cuerpo por encima del límite → 413 PAYLOAD_DEMASIADO_GRANDE', async () => {
    const grande = JSON.stringify({ descripcion: 'x'.repeat(1024 * 1024 + 10) });
    const r = await enviar(grande, 'application/json');
    expect(r.statusCode).toBe(413);
    expect(r.json().codigo).toBe('PAYLOAD_DEMASIADO_GRANDE');
    sinDetallesInternos(r.body);
  });

  it('tipo de contenido que la ruta no admite → 415 TIPO_DE_CONTENIDO_NO_ADMITIDO', async () => {
    const r = await enviar('<reporte/>', 'application/xml');
    expect(r.statusCode).toBe(415);
    expect(r.json().codigo).toBe('TIPO_DE_CONTENIDO_NO_ADMITIDO');
    sinDetallesInternos(r.body);
  });

  it('los códigos propios del dominio no se tocan', async () => {
    // Sin sesión el cuerpo válido llega al manejador de la ruta, que responde con su código.
    const r = await enviar('{"lat": -17.79}', 'application/json');
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('SIN_SESION');
  });
});
