/**
 * Cupo diario por cuenta (contracts 0.10.0, migración 0014): 3 reportes y 12 fotos por día
 * calendario en ZONA_HORARIA, contados en `cuota_reporte_diaria`, más el tope diario de altas por
 * IP. Reemplaza a la espera de 60 min entre reportes (`usuario.ultimo_reporte_en`), que ya no se usa.
 *
 * Las fotos y la concurrencia real tienen sus archivos: `fotos-cuota.test.ts` y los `*-pg.test.ts`.
 */
import { CONFIG_DOMINIO } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import type { ConfigApi } from '../src/config.js';
import { cupoDelDia, reservarTurnoDeReporte } from '../src/cuota.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  reporteEn,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const POR_DIA = CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA;
const ZONA = CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO;

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let cookieVecina: string;
let cookieVecino: string;
let idVecina: string;

async function levantar(extra: Partial<ConfigApi> = {}): Promise<FastifyInstance> {
  return crearApp({
    pool,
    cfg: {
      ...configDePrueba({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      // Alto: acá se prueba el cupo de la CUENTA, no el límite por IP.
      rateLimitMax: 10_000,
      registroPeticionesPorVentana: 1000,
      registroPorIp: 1000,
      ...extra,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await levantar();
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
  const r = await pool.query<{ id: string }>('SELECT id::text FROM usuario WHERE email = $1', [
    CUENTAS.vecina,
  ]);
  idVecina = r.rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM cuota_reporte_diaria');
  await pool.query('DELETE FROM idempotencia');
});

function enviar(cookie: string, payload: unknown = reporteValido, extra = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: payload as Record<string, unknown>,
    cookies: sesion(cookie),
    ...extra,
  });
}

async function reportesHoy(usuarioId: string = idVecina): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COALESCE(sum(reportes_n), 0)::int AS n FROM cuota_reporte_diaria
      WHERE usuario_id = $1 AND dia = (now() AT TIME ZONE $2)::date`,
    [usuarioId, ZONA],
  );
  return r.rows[0]!.n;
}

/** La próxima medianoche de la ciudad, como instante. */
async function proximaMedianoche(): Promise<number> {
  const r = await pool.query<{ m: Date }>(
    `SELECT (((now() AT TIME ZONE $1)::date + 1)::timestamp AT TIME ZONE $1) AS m`,
    [ZONA],
  );
  return new Date(r.rows[0]!.m).getTime();
}

describe(`${POR_DIA} reportes por cuenta y por día`, () => {
  it('los tres primeros entran y el 4.º da 429 hasta la medianoche local', async () => {
    for (let i = 0; i < POR_DIA; i++) {
      const r = await enviar(cookieVecina);
      expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    }
    const cuarto = await enviar(cookieVecina);
    expect(cuarto.statusCode).toBe(429);
    expect(cuarto.json().codigo).toBe('CUOTA_DE_REPORTES');
    expect(cuarto.json().mensaje).toBe(
      `Ya enviaste los ${POR_DIA} reportes de hoy. Vas a poder enviar otro mañana.`,
    );
    const medianoche = await proximaMedianoche();
    const retry = Number(cuarto.headers['retry-after']);
    const esperado = Math.ceil((medianoche - Date.now()) / 1000);
    expect(Math.abs(retry - esperado)).toBeLessThanOrEqual(5);
    // Con el desfase de la ciudad (La Paz, -04:00), no en UTC.
    const disponible = cuarto.json().detalles.disponible_en as string;
    expect(disponible).toMatch(/T00:00:00-04:00$/);
    expect(new Date(disponible).getTime()).toBe(medianoche);
    expect(await reportesHoy()).toBe(POR_DIA);
  });

  it('el cupo es de la cuenta: la de al lado sigue pudiendo', async () => {
    for (let i = 0; i < POR_DIA; i++) expect((await enviar(cookieVecina)).statusCode).toBe(201);
    expect((await enviar(cookieVecina)).statusCode).toBe(429);
    expect((await enviar(cookieVecino)).statusCode).toBe(201);
  });

  it('una fila de ayer no bloquea hoy', async () => {
    await pool.query(
      `INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n, fotos_n)
       VALUES ($1, (now() AT TIME ZONE $2)::date - 1, $3, 12)`,
      [idVecina, ZONA, POR_DIA],
    );
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
    expect(await reportesHoy()).toBe(1);
  });

  it('un replay idempotente no gasta turno', async () => {
    const clave = 'cupo-replay-0001';
    const primera = await enviar(cookieVecina, reporteValido, {
      headers: { 'idempotency-key': clave },
    });
    expect(primera.statusCode).toBe(201);
    const otra = await enviar(cookieVecina, reporteValido, {
      headers: { 'idempotency-key': clave },
    });
    expect(otra.statusCode).toBe(200);
    expect(otra.headers['idempotent-replay']).toBe('true');
    expect(await reportesHoy()).toBe(1);
  });

  it('FOTOS_INVALIDAS devuelve el turno', async () => {
    const fallido = await enviar(cookieVecina, {
      ...reporteValido,
      fotos: ['00000000-0000-0000-0000-000000000000.webp'],
    });
    expect(fallido.statusCode).toBe(400);
    expect(fallido.json().codigo).toBe('FOTOS_INVALIDAS');
    expect(await reportesHoy()).toBe(0);
  });

  it('cambiar de IP no da más turnos', async () => {
    const conProxy = await levantar({ confiarEnProxy: 1, rateLimitMax: 2 });
    try {
      const cookie = await iniciarSesion(conProxy, CUENTAS.vecina);
      const codigos: number[] = [];
      for (let i = 0; i < POR_DIA + 3; i++) {
        const r = await conProxy.inject({
          method: 'POST',
          url: '/api/v1/reportes',
          payload: reporteValido,
          cookies: sesion(cookie),
          headers: { 'x-forwarded-for': `203.0.113.${i + 10}` },
        });
        codigos.push(r.statusCode);
        if (r.statusCode === 429) expect(r.json().codigo).toBe('CUOTA_DE_REPORTES');
      }
      expect(codigos.filter((c) => c === 201)).toHaveLength(POR_DIA);
      expect(codigos.filter((c) => c === 429)).toHaveLength(3);
    } finally {
      await conProxy.close();
    }
  });
});

describe('el día es el de la ciudad, no el de UTC', () => {
  it('23:59 y 00:01 locales caen en días distintos', async () => {
    // 23:59 del 19 en La Paz (UTC-4) = 03:59 UTC del 20; 00:01 del 20 = 04:01 UTC del 20.
    const cliente = await pool.connect();
    try {
      const opciones = { maximo: POR_DIA, zona: ZONA };
      for (let i = 0; i < POR_DIA; i++) {
        const r = await reservarTurnoDeReporte(cliente, idVecina, {
          ...opciones,
          ahora: '2026-09-20T03:59:00Z',
        });
        expect(r).toMatchObject({ permitido: true, n: i + 1, dia: '2026-09-19' });
      }
      const agotado = await reservarTurnoDeReporte(cliente, idVecina, {
        ...opciones,
        ahora: '2026-09-20T03:59:30Z',
      });
      expect(agotado.permitido).toBe(false);
      if (!agotado.permitido) {
        expect(agotado.espera.disponibleEn).toBe('2026-09-20T00:00:00-04:00');
        expect(agotado.espera.reintentarEnS).toBe(30);
      }
      const despues = await reservarTurnoDeReporte(cliente, idVecina, {
        ...opciones,
        ahora: '2026-09-20T04:01:00Z',
      });
      expect(despues).toMatchObject({ permitido: true, n: 1, dia: '2026-09-20' });
    } finally {
      cliente.release();
    }
  });

  it('cupoDelDia cuenta solo el día local', async () => {
    await pool.query(
      `INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n, fotos_n)
       VALUES ($1, '2026-09-19', 2, 5), ($1, '2026-09-20', 1, 0)`,
      [idVecina],
    );
    const antes = await cupoDelDia(pool, idVecina, { zona: ZONA, ahora: '2026-09-20T03:59:00Z' });
    expect(antes).toMatchObject({ dia: '2026-09-19', reportesN: 2, fotosN: 5 });
    const despues = await cupoDelDia(pool, idVecina, {
      zona: ZONA,
      ahora: '2026-09-20T04:01:00Z',
    });
    expect(despues).toMatchObject({ dia: '2026-09-20', reportesN: 1, fotosN: 0 });
    expect(despues.espera.disponibleEn).toBe('2026-09-21T00:00:00-04:00');
  });
});

describe('idempotencia ligada a la cuenta', () => {
  it('la misma clave en dos cuentas crea dos reportes', async () => {
    const clave = 'clave-compartida-0001';
    const a = await enviar(cookieVecina, reporteValido, { headers: { 'idempotency-key': clave } });
    const b = await enviar(cookieVecino, reporteValido, { headers: { 'idempotency-key': clave } });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(b.json().id).not.toBe(a.json().id);
    const filas = await pool.query<{ clave: string }>(
      'SELECT clave FROM idempotencia ORDER BY clave',
    );
    // Guardada con el prefijo de la cuenta, en la misma columna de texto (sin migración).
    for (const f of filas.rows) expect(f.clave).toMatch(/^[0-9a-f-]{36}:clave-compartida-0001$/);
    expect(filas.rows).toHaveLength(2);
  });

  it('una clave vieja sin prefijo no rompe nada: el envío crea su reporte', async () => {
    const clave = 'clave-vieja-sin-prefijo';
    const otro = await enviar(cookieVecino, reporteEn(-17.785, -63.185));
    expect(otro.statusCode).toBe(201);
    await pool.query('INSERT INTO idempotencia (clave, huella, reporte_id) VALUES ($1, $2, $3)', [
      clave,
      'huella-de-otro-contenido',
      otro.json().id,
    ]);
    const r = await enviar(cookieVecina, reporteValido, { headers: { 'idempotency-key': clave } });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    expect(r.json().id).not.toBe(otro.json().id);
  });
});

describe('/auth/yo: cuántos quedan hoy', () => {
  it('reportes_restantes_hoy baja con cada envío y puede_reportar_desde es la medianoche al agotarse', async () => {
    const yo = async () =>
      (
        await app.inject({ method: 'GET', url: '/api/v1/auth/yo', cookies: sesion(cookieVecina) })
      ).json() as Record<string, unknown>;
    expect(await yo()).toMatchObject({
      reportes_restantes_hoy: POR_DIA,
      puede_reportar_desde: null,
    });
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
    expect(await yo()).toMatchObject({
      reportes_restantes_hoy: POR_DIA - 1,
      puede_reportar_desde: null,
    });
    for (let i = 1; i < POR_DIA; i++) expect((await enviar(cookieVecina)).statusCode).toBe(201);
    const agotado = await yo();
    expect(agotado.reportes_restantes_hoy).toBe(0);
    expect(agotado.puede_reportar_desde).toMatch(/T00:00:00-04:00$/);
    expect(new Date(agotado.puede_reportar_desde as string).getTime()).toBe(
      await proximaMedianoche(),
    );
  });
});

describe('tope diario de altas por IP', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM intento_login WHERE clave LIKE 'registro:%'");
  });

  const nueva = () => ({
    email: `alta-${Math.random().toString(36).slice(2, 10)}@test.local`,
    nombre: 'Vecina Nueva',
    password: 'contrasena-larga-de-prueba',
  });

  it(`la ${CONFIG_DOMINIO.ALTAS_POR_DIA_POR_IP + 1}.ª alta del día desde una IP da 429`, async () => {
    const tope = CONFIG_DOMINIO.ALTAS_POR_DIA_POR_IP;
    const codigos: number[] = [];
    for (let i = 0; i <= tope; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/registro',
        payload: nueva(),
      });
      codigos.push(r.statusCode);
      if (i === tope) {
        expect(r.json().codigo).toBe('DEMASIADAS_CUENTAS');
        const retry = Number(r.headers['retry-after']);
        const esperado = Math.ceil(((await proximaMedianoche()) - Date.now()) / 1000);
        expect(Math.abs(retry - esperado)).toBeLessThanOrEqual(5);
      }
    }
    expect(codigos.slice(0, tope).every((c) => c === 201)).toBe(true);
    expect(codigos[tope]).toBe(429);
  }, 60_000);

  it('las altas de ayer no cuentan para hoy', async () => {
    const tope = CONFIG_DOMINIO.ALTAS_POR_DIA_POR_IP;
    for (let i = 0; i < tope; i++)
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/auth/registro', payload: nueva() }))
          .statusCode,
      ).toBe(201);
    // Antes de la medianoche local de hoy: un día calendario de la ciudad anterior.
    await pool.query(
      `UPDATE intento_login SET creado_en = ((now() AT TIME ZONE $1)::date::timestamp AT TIME ZONE $1) - interval '1 minute'
        WHERE clave LIKE 'registro:%'`,
      [ZONA],
    );
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/registro', payload: nueva() });
    expect(r.statusCode).toBe(201);
  }, 60_000);
});
