/**
 * Camino de ubicación aproximada (ADR 0007, contracts 0.18.0): desde un dispositivo sin GPS
 * preciso —una computadora ubicada por Wi-Fi o IP— se reporta con `ubicacion_aproximada: true`.
 *
 * El servidor entonces:
 *  - sigue exigiendo `dispositivo` y una antigüedad de 600 s o menos (POSICION_VENCIDA);
 *  - exige una precisión de MÁS de 50 m (si alcanza, 422 UBICACION_PRECISA_DISPONIBLE, sin cupo);
 *  - NO comprueba el radio de 60 m;
 *  - guarda `ubicacion_metodo = 'aproximada'`, la precisión declarada y la distancia en NULL.
 *
 * El point-in-polygon sigue exigiéndose (FUERA_DE_COBERTURA). Cupo, demora, idempotencia y
 * antispam quedan iguales. La posición del dispositivo sigue sin guardarse ni registrarse (§0.8).
 */
import { CONFIG_DOMINIO, ReporteTecnicoSchema } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { revisarDispositivo } from '../src/ubicacion-dispositivo.js';
import {
  alNorte,
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const PUNTO = { lat: reporteValido.lat, lon: reporteValido.lon };

/** Precisión típica de una laptop ubicada por Wi-Fi: muy por encima de los 50 m del camino normal. */
const PRECISION_APROX = 178;

/**
 * Posición del dispositivo con dígitos que no aparecen en ningún otro punto de la prueba: si
 * '7707777' o '1808888' salen en la fila o en la auditoría, la posición se filtró.
 */
const TELEFONO = { lat: -17.7707777, lon: -63.1808888 };
const RASTROS = ['7707777', '1808888'];

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let cookieVecina: string;
let cookieTecnico: string;

function dispositivo(extra: Partial<typeof reporteValido.dispositivo> = {}) {
  return { ...reporteValido.dispositivo, ...extra };
}

/** `dispositivo` con una precisión que no alcanza los 50 m, apto para el camino aproximado. */
function dispositivoAprox(extra: Partial<typeof reporteValido.dispositivo> = {}) {
  return dispositivo({ precision_m: PRECISION_APROX, ...extra });
}

function enviar(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
    cookies: sesion(cookieVecina),
    headers,
  });
}

async function crear(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  await liberarCuota(ex);
  return enviar(payload, headers);
}

async function cuantosReportes(): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM reporte_inundacion');
  return Number(r.rows[0]!.n);
}

/** `reportes_restantes_hoy` de la vecina, por el mismo `/auth/yo` que ve la interfaz. */
async function restantesHoy(): Promise<number> {
  const r = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/yo',
    cookies: sesion(cookieVecina),
  });
  return r.json().reportes_restantes_hoy;
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    cfg: {
      ...configDePrueba({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM auditoria');
  await pool.query('DELETE FROM idempotencia');
  await pool.query('DELETE FROM reporte_inundacion');
  await liberarCuota(ex);
});

// ───────────────────────────── C-3.1 · función pura ─────────────────────────────
describe('revisarDispositivo con ubicación aproximada', () => {
  it('precisión > 50 m: ok, método aproximada, distancia null y la precisión declarada', () => {
    expect(revisarDispositivo(PUNTO, dispositivoAprox(), { aproximada: true })).toEqual({
      ok: true,
      metodo: 'aproximada',
      distanciaM: null,
      precisionM: PRECISION_APROX,
    });
  });

  it('con 50 m o menos: 422 UBICACION_PRECISA_DISPONIBLE; con 50,1 m ya entra', () => {
    expect(
      revisarDispositivo(PUNTO, dispositivo({ precision_m: 50 }), { aproximada: true }),
    ).toMatchObject({
      ok: false,
      codigo: 'UBICACION_PRECISA_DISPONIBLE',
    });
    expect(
      revisarDispositivo(PUNTO, dispositivo({ precision_m: 50.1 }), { aproximada: true }).ok,
    ).toBe(true);
  });

  it('no comprueba el radio: el punto a 5 km del dispositivo sigue siendo ok', () => {
    expect(
      revisarDispositivo(alNorte(PUNTO, 5000), dispositivoAprox(), { aproximada: true }),
    ).toMatchObject({ ok: true, metodo: 'aproximada', distanciaM: null });
  });

  it('sigue exigiendo una antigüedad de 600 s o menos', () => {
    expect(
      revisarDispositivo(PUNTO, dispositivoAprox({ antiguedad_s: 601 }), { aproximada: true }),
    ).toMatchObject({ ok: false, codigo: 'POSICION_VENCIDA' });
  });

  it('sin el flag, la misma precisión sigue siendo PRECISION_INSUFICIENTE', () => {
    expect(revisarDispositivo(PUNTO, dispositivoAprox())).toMatchObject({
      ok: false,
      codigo: 'PRECISION_INSUFICIENTE',
    });
    // La precisión máxima del camino normal es la del contrato, no un número suelto.
    expect(CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M).toBe(50);
  });
});

// ───────────────────────────── C-3.1 / C-3.2 · POST /reportes ─────────────────────────────
describe('POST /reportes con ubicacion_aproximada', () => {
  it('178 m con el flag: 201, guarda método aproximada, la precisión y la distancia en NULL', async () => {
    const r = await crear({
      ...reporteValido,
      dispositivo: dispositivoAprox(),
      ubicacion_aproximada: true,
    });
    expect(r.statusCode, r.body).toBe(201);
    const fila = await pool.query(
      `SELECT ubicacion_metodo::text, precision_gps_m::float8 AS precision, distancia_dispositivo_m
         FROM reporte_inundacion WHERE id = $1`,
      [r.json().id],
    );
    expect(fila.rows[0]).toEqual({
      ubicacion_metodo: 'aproximada',
      precision: PRECISION_APROX,
      distancia_dispositivo_m: null,
    });
  });

  it('30 m con el flag: 422 UBICACION_PRECISA_DISPONIBLE, sin reporte ni cupo gastado', async () => {
    await liberarCuota(ex);
    const antes = await restantesHoy();
    const r = await enviar({
      ...reporteValido,
      dispositivo: dispositivo({ precision_m: 30 }),
      ubicacion_aproximada: true,
    });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('UBICACION_PRECISA_DISPONIBLE');
    expect(r.json().mensaje).toMatch(/precisi/i);
    expect(await cuantosReportes()).toBe(0);
    expect(await restantesHoy()).toBe(antes);
  });

  it('178 m SIN el flag sigue dando 422 PRECISION_INSUFICIENTE (camino normal intacto)', async () => {
    const r = await enviar({ ...reporteValido, dispositivo: dispositivoAprox() });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('PRECISION_INSUFICIENTE');
  });

  it('el flag quita la comprobación de radio: el punto puede estar a 5 km del dispositivo', async () => {
    const lejos = alNorte(PUNTO, 5000);
    // Un dispositivo PRECISO a 5 km del punto, sin el flag, es el caso normal y se corta por radio.
    const sinFlag = await crear({
      ...reporteValido,
      dispositivo: { ...dispositivo({ precision_m: 8 }), ...lejos },
    });
    expect(sinFlag.statusCode, sinFlag.body).toBe(422);
    expect(sinFlag.json().codigo).toBe('UBICACION_FUERA_DE_RADIO');
    // Con el flag y una precisión que no alcanza, ese mismo alejamiento entra: el punto (en
    // cobertura) se guarda tal cual, método aproximada y distancia null.
    const r = await crear({
      ...reporteValido,
      dispositivo: { ...dispositivoAprox(), ...lejos },
      ubicacion_aproximada: true,
    });
    expect(r.statusCode, r.body).toBe(201);
    const fila = await pool.query<{ metodo: string; distancia: number | null }>(
      `SELECT ubicacion_metodo::text AS metodo, distancia_dispositivo_m AS distancia
         FROM reporte_inundacion WHERE id = $1`,
      [r.json().id],
    );
    expect(fila.rows[0]).toEqual({ metodo: 'aproximada', distancia: null });
  });

  it('con el flag, una lectura de hace más de 600 s sigue dando 422 POSICION_VENCIDA', async () => {
    const r = await enviar({
      ...reporteValido,
      dispositivo: dispositivoAprox({ antiguedad_s: 660 }),
      ubicacion_aproximada: true,
    });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('POSICION_VENCIDA');
  });

  it('con el flag, un punto fuera de cobertura sigue dando 422 FUERA_DE_COBERTURA', async () => {
    const r = await enviar({
      ...reporteValido,
      lat: -10,
      lon: -60,
      dispositivo: dispositivoAprox({ lat: -10, lon: -60 }),
      ubicacion_aproximada: true,
    });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('FUERA_DE_COBERTURA');
  });
});

// ───────────────────────────── C-3.3 · auditoría, vistas y exportación ─────────────────────────────
describe('reporte aproximado: auditoría, vista técnica y exportación', () => {
  it('la auditoría de la creación lleva el método y nunca la posición del dispositivo', async () => {
    const r = await crear({
      ...reporteValido,
      dispositivo: dispositivoAprox(TELEFONO),
      ubicacion_aproximada: true,
    });
    expect(r.statusCode, r.body).toBe(201);
    const id = r.json().id as string;

    const aud = await pool.query<{ metodo: string | null; t: string }>(
      `SELECT despues->>'ubicacion_metodo' AS metodo,
              coalesce(json_agg(a), '[]')::text AS t
         FROM auditoria a WHERE entidad_id = $1 AND accion = 'crear' GROUP BY despues`,
      [id],
    );
    expect(aud.rows[0]!.metodo).toBe('aproximada');

    const fila = await pool.query<{ t: string }>(
      'SELECT row_to_json(r)::text AS t FROM reporte_inundacion r WHERE id = $1',
      [id],
    );
    const lugares: Record<string, string> = {
      auditoria: aud.rows[0]!.t,
      fila: fila.rows[0]!.t,
      'respuesta del POST': r.body,
    };
    for (const [donde, texto] of Object.entries(lugares))
      for (const rastro of RASTROS)
        expect(texto, `${donde} contiene ${rastro}`).not.toContain(rastro);
  });

  it('la vista técnica muestra el método aproximada; el autor/público no estrena campos', async () => {
    const r = await crear({
      ...reporteValido,
      dispositivo: dispositivoAprox(),
      ubicacion_aproximada: true,
    });
    const id = r.json().id as string;
    // La respuesta del autor (MiReporte) no suma ni el método ni la distancia.
    expect(r.json().properties).not.toHaveProperty('ubicacion_metodo');
    expect(r.json().properties).not.toHaveProperty('distancia_dispositivo_m');

    const tec = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes/${id}`,
      cookies: sesion(cookieTecnico),
    });
    expect(tec.statusCode).toBe(200);
    const props = tec.json().properties;
    expect(props.ubicacion_metodo).toBe('aproximada');
    expect(props.precision_gps_m).toBe(PRECISION_APROX);
    expect(props.distancia_dispositivo_m).toBeNull();
    const estricto = ReporteTecnicoSchema.strict().safeParse(props);
    expect(estricto.success, JSON.stringify(estricto.error?.issues)).toBe(true);
  });

  it('la exportación CSV y GeoJSON traen ubicacion_metodo=aproximada', async () => {
    const r = await crear({
      ...reporteValido,
      dispositivo: dispositivoAprox(),
      ubicacion_aproximada: true,
    });
    const id = r.json().id as string;

    const csv = await app.inject({
      method: 'GET',
      url: '/api/v1/exportar?formato=csv',
      cookies: sesion(cookieTecnico),
    });
    expect(csv.statusCode).toBe(200);
    const linea = csv.body.split('\n').find((l) => l.includes(id));
    expect(linea, 'la fila del CSV del reporte').toBeDefined();
    expect(linea).toContain('aproximada');

    const geo = await app.inject({
      method: 'GET',
      url: '/api/v1/exportar?formato=geojson',
      cookies: sesion(cookieTecnico),
    });
    expect(geo.statusCode).toBe(200);
    const feat = geo
      .json()
      .features.find((f: { properties: { id: string } }) => f.properties.id === id);
    expect(feat, 'el feature del reporte').toBeDefined();
    expect(feat.properties.ubicacion_metodo).toBe('aproximada');
    expect(feat.properties.distancia_dispositivo_m).toBeNull();
  });
});
