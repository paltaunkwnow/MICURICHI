/**
 * La cuota de fotos por cuenta bajo concurrencia REAL, contra PostgreSQL de verdad.
 *
 * Mismo motivo que `cuota-concurrencia-pg.test.ts`: el resto de la suite corre sobre PGlite, que
 * serializa las transacciones de todas las conexiones, así que ahí dos subidas simultáneas nunca
 * llegan a solaparse y la prueba pasaría aunque faltara el bloqueo. Lo que hace atómica la cuota
 * es el `SELECT … FOR UPDATE` sobre la fila del usuario: sin él, en READ COMMITTED cada
 * transacción cuenta las fotos ya confirmadas, varias ven hueco a la vez y entran todas.
 *
 *   export DATABASE_URL_PG_REAL=postgresql://<usuario>:<clave>@127.0.0.1:5432/postgres
 *   pnpm --filter api-core exec vitest run test/fotos-cuota-concurrencia-pg.test.ts
 *
 * Crea su propia base temporal, la migra, trabaja dentro y la borra al terminar. Sin la variable
 * se omite.
 */
import { CONFIG_DOMINIO } from 'contracts';
import { aplicarMigraciones, ejecutorPg } from 'db';
import { cargarCapasDePrueba } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  multipart,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const URL_ADMIN = process.env.DATABASE_URL_PG_REAL;
const NOMBRE_BASE = `curichi_fotos_${Date.now()}`;
const LIMITE = CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA;

let pool: pg.Pool;
let app: FastifyInstance;
let cookieVecina: string;
let cookieVecino: string;
let urlBase = '';
let jpeg: Buffer;

function conBase(url: string, base: string): string {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
}

describe.skipIf(!URL_ADMIN)('cuota de fotos por cuenta bajo concurrencia real (PostgreSQL)', () => {
  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: URL_ADMIN, max: 1 });
    try {
      await admin.query(`CREATE DATABASE ${NOMBRE_BASE}`);
    } finally {
      await admin.end();
    }
    urlBase = conBase(URL_ADMIN!, NOMBRE_BASE);
    // Pool holgado: con uno chico las subidas harían cola por conexión y no llegarían a
    // disputarse el bloqueo de fila, que es justo lo que se quiere ejercitar.
    pool = new pg.Pool({ connectionString: urlBase, max: 30 });
    const ex = ejecutorPg(pool);
    await ex.consultar('CREATE EXTENSION IF NOT EXISTS postgis');
    await aplicarMigraciones(ex);
    await cargarCapasDePrueba(ex);
    await crearUsuarios(ex);
    app = await crearApp({
      pool,
      cfg: {
        ...configDePrueba({ DATABASE_URL: urlBase }),
        rutaOpenApi: '/no-existe.yaml',
        rateLimitMax: 10_000,
      },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
    cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
    jpeg = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#28934D' } })
      .jpeg()
      .toBuffer();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (!urlBase) return;
    const admin = new pg.Pool({ connectionString: URL_ADMIN, max: 1 });
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${NOMBRE_BASE} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }, 120_000);

  function subir(cookie: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      cookies: sesion(cookie),
      ...multipart('archivo', 'f.jpg', 'image/jpeg', jpeg),
    });
  }

  async function fotosDe(email: string): Promise<number> {
    const r = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reporte_foto
        WHERE subido_por = (SELECT id FROM usuario WHERE email = $1)`,
      [email],
    );
    return r.rows[0]!.n;
  }

  function contar(codigos: number[]): Record<string, number> {
    return codigos.reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
  }

  it(`${LIMITE + 8} subidas simultáneas de una cuenta dejan exactamente ${LIMITE}`, async () => {
    await pool.query('DELETE FROM reporte_foto');
    await pool.query('DELETE FROM cuota_reporte_diaria');
    const rs = await Promise.all(Array.from({ length: LIMITE + 8 }, () => subir(cookieVecina)));
    const reparto = contar(rs.map((r) => r.statusCode));
    // Ni un 5xx: esperar el bloqueo de la fila del cupo del día no es un error.
    expect(
      Object.keys(reparto).every((c) => Number(c) < 500),
      JSON.stringify(reparto),
    ).toBe(true);
    expect(reparto['201'], JSON.stringify(reparto)).toBe(LIMITE);
    expect(reparto['429'], JSON.stringify(reparto)).toBe(8);
    expect(await fotosDe(CUENTAS.vecina)).toBe(LIMITE);
  }, 180_000);

  it('dos cuentas a la vez no se estorban: el bloqueo es por fila de cuenta y día', async () => {
    await pool.query('DELETE FROM reporte_foto');
    await pool.query('DELETE FROM cuota_reporte_diaria');
    const rs = await Promise.all([
      ...Array.from({ length: 8 }, () => subir(cookieVecina)),
      ...Array.from({ length: 8 }, () => subir(cookieVecino)),
    ]);
    expect(rs.filter((r) => r.statusCode === 201)).toHaveLength(16);
    expect(await fotosDe(CUENTAS.vecina)).toBe(8);
    expect(await fotosDe(CUENTAS.vecino)).toBe(8);
  }, 180_000);
});
