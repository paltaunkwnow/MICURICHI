/**
 * La cuota de un reporte por hora, bajo concurrencia REAL, contra PostgreSQL de verdad.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE APARTE
 *
 * El resto de la suite corre sobre PGlite (PostgreSQL compilado a WebAssembly), que es de una
 * sola conexión y multiplexa las sesiones sobre ella (ADR 0003). Eso lo hace perfecto para
 * probar lógica y pésimo para probar **bloqueos**: cuando una transacción se queda esperando el
 * bloqueo de fila que tiene otra, el motor entero se queda esperando con ella, porque no hay una
 * segunda conexión que pueda avanzar y liberarlo. Comprobado: con 50 envíos simultáneos la
 * prueba se cuelga hasta el plazo de vitest.
 *
 * Y resulta que el bloqueo de fila es exactamente el mecanismo que hace atómica la cuota. Darla
 * por buena con un motor que no puede ejercitarlo sería declarar un PASS que no se ha medido.
 *
 * Así que la prueba de concurrencia vive aquí y se ejecuta contra PostgreSQL real:
 *
 *   docker compose up -d postgis
 *   set -a && . ./.env && set +a
 *   export DATABASE_URL_PG_REAL="${DATABASE_URL%/*}/postgres"   # misma URL, base `postgres`
 *   pnpm --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts
 *
 * Crea su propia base temporal, la migra, trabaja dentro y la borra al terminar: no toca ninguna
 * base existente. Sin esa variable se omite, con lo que el resto del monorepo sigue corriendo en
 * cualquier máquina sin Docker.
 */
import { aplicarMigraciones, ejecutorPg } from 'db';
import { cargarCapasDePrueba } from 'db/test-utils';
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

const URL_ADMIN = process.env.DATABASE_URL_PG_REAL;
const NOMBRE_BASE = `curichi_cuota_${Date.now()}`;

let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let cookie: string;
let urlBase = '';

/** Cambia el nombre de la base en la URL de administración sin tocar credenciales ni host. */
function conBase(url: string, base: string): string {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
}

describe.skipIf(!URL_ADMIN)('cuota por cuenta bajo concurrencia real (PostgreSQL)', () => {
  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: URL_ADMIN, max: 1 });
    try {
      await admin.query(`CREATE DATABASE ${NOMBRE_BASE}`);
    } finally {
      await admin.end();
    }
    urlBase = conBase(URL_ADMIN!, NOMBRE_BASE);
    // Un pool holgado: con 50 peticiones a la vez y transacciones que se esperan entre sí, un
    // pool pequeño convertiría la prueba en una cola y no ejercitaría el bloqueo de fila.
    pool = new pg.Pool({ connectionString: urlBase, max: 20 });
    ex = ejecutorPg(pool);
    await ex.consultar('CREATE EXTENSION IF NOT EXISTS postgis');
    await aplicarMigraciones(ex);
    await cargarCapasDePrueba(ex);
    await crearUsuarios(ex);
    app = await crearApp({
      pool,
      cfg: {
        ...leerConfig({ DATABASE_URL: urlBase }),
        rutaOpenApi: '/no-existe.yaml',
        rateLimitMax: 10_000,
      },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    cookie = await iniciarSesion(app, CUENTAS.vecina);
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

  function enviar(clave?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: reporteValido,
      cookies: sesion(cookie),
      ...(clave ? { headers: { 'idempotency-key': clave } } : {}),
    });
  }

  async function reportesDeVecina(): Promise<number> {
    const r = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM reporte_inundacion
        WHERE autor_id = (SELECT id FROM usuario WHERE email = $1)`,
      [CUENTAS.vecina],
    );
    return Number(r.rows[0]!.n);
  }

  /** Reparto de códigos, para poder afirmar el resultado exacto y no solo la invariante. */
  function contar(codigos: number[]): Record<string, number> {
    return codigos.reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
  }

  it('50 envíos simultáneos con claves DISTINTAS dejan exactamente uno aceptado', async () => {
    await liberarCuota(ex);
    const antes = await reportesDeVecina();
    const rs = await Promise.all(
      Array.from({ length: 50 }, (_, i) => enviar(`real-distintas-${i}`)),
    );
    const reparto = contar(rs.map((r) => r.statusCode));
    // Ni un 5xx: esperar un bloqueo de fila no es un error, es el comportamiento correcto.
    expect(
      Object.keys(reparto).every((c) => Number(c) < 500),
      JSON.stringify(reparto),
    ).toBe(true);
    expect(reparto['201'], JSON.stringify(reparto)).toBe(1);
    expect(reparto['429'], JSON.stringify(reparto)).toBe(49);
    expect((await reportesDeVecina()) - antes).toBe(1);
  }, 180_000);

  it('50 envíos simultáneos con la MISMA clave dejan uno, por idempotencia y no por cuota', async () => {
    await liberarCuota(ex);
    const antes = await reportesDeVecina();
    const rs = await Promise.all(Array.from({ length: 50 }, () => enviar('real-misma-clave')));
    const reparto = contar(rs.map((r) => r.statusCode));
    // Ni un 401. Importa decirlo aparte: sobre PGlite, el primer estallido de peticiones
    // concurrentes del proceso devuelve un 401 espurio —la consulta de sesión vuelve vacía por
    // el multiplexado sobre una sola conexión— y había que descartar que fuera un fallo de la
    // resolución de sesión bajo carga. Con PostgreSQL real no ocurre ni una vez.
    expect(reparto['401'] ?? 0, JSON.stringify(reparto)).toBe(0);
    expect(reparto['201'], JSON.stringify(reparto)).toBe(1);
    // El resto ve el reporte ya creado (200): es un reenvío del mismo formulario, no un intento
    // de colarse una segunda vez, y tiene que responder lo que respondería el primero.
    expect(reparto['429'] ?? 0, JSON.stringify(reparto)).toBe(0);
    expect((await reportesDeVecina()) - antes).toBe(1);
    const ids = new Set(rs.filter((r) => r.statusCode < 300).map((r) => r.json().id as string));
    expect(ids.size).toBe(1);
  }, 180_000);

  it('50 envíos simultáneos SIN clave tampoco se cuelan', async () => {
    await liberarCuota(ex);
    const antes = await reportesDeVecina();
    const rs = await Promise.all(Array.from({ length: 50 }, () => enviar()));
    const reparto = contar(rs.map((r) => r.statusCode));
    expect(reparto['201'], JSON.stringify(reparto)).toBe(1);
    expect((await reportesDeVecina()) - antes).toBe(1);
  }, 180_000);

  it('dos cuentas a la vez consiguen un reporte cada una, no una sola', async () => {
    await liberarCuota(ex, CUENTAS.vecina);
    await liberarCuota(ex, CUENTAS.vecino);
    const otra = await iniciarSesion(app, CUENTAS.vecino);
    const mezcla = await Promise.all([
      ...Array.from({ length: 10 }, () => enviar()),
      ...Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/reportes',
          payload: reporteValido,
          cookies: sesion(otra),
        }),
      ),
    ]);
    // Uno por cuenta: el bloqueo es por fila de usuario, así que dos cuentas no se estorban.
    expect(mezcla.filter((r) => r.statusCode === 201)).toHaveLength(2);
  }, 180_000);
});
