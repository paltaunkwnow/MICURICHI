/**
 * Cupo diario por cuenta sobre `cupo_contador` (M3, ADR 0017): reportes por categoría
 * (`reportes:<slug>`) y fotos global (`fotos:cuenta`), más el tope diario de altas por IP. El
 * número y la demora salen del contador de la categoría.
 *
 * Las fotos y la concurrencia real tienen sus archivos: `fotos-cuota.test.ts` y los `*-pg.test.ts`.
 */
import {
  CODIGO_CATEGORIA_NO_DISPONIBLE,
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
} from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { validarReglasDeCupo, verificarReglasDeCupoActivas } from '../src/categorias.js';
import type { ConfigApi } from '../src/config.js';
import { CLAVE_FOTOS, claveReportes, leerCupos, reservarTurnoDeReporte } from '../src/cuota.js';
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
const PRIMERO = CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S;
const SIGUIENTES = CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S;

/** Una definición sintética (bache) para ejercitar el cupo por categoría sin tocar `contracts`. */
const DEF_BACHE = {
  ...DEFINICION_INUNDACION,
  slug: 'bache',
  nombre: 'Baches (sintético)',
  nombreCorto: 'Bache',
} as DefinicionCategoriaCualquiera;

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
  await pool.query('DELETE FROM cupo_contador');
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

/** Reportes de inundación gastados hoy por la cuenta, en la ventana local actual. */
async function reportesHoy(usuarioId: string = idVecina): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COALESCE(sum(n), 0)::int AS n FROM cupo_contador
      WHERE usuario_id = $1 AND clave = 'reportes:inundacion'
        AND ventana_inicio = ((now() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2)`,
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
    // El cupo es por categoría: la respuesta dice de cuál se agotó (CA6).
    expect(cuarto.json().detalles.categoria).toBe('inundacion');
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
      `INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n) VALUES
         ($1, 'reportes:inundacion', (((now() AT TIME ZONE $2)::date - 1)::timestamp AT TIME ZONE $2), $3),
         ($1, 'fotos:cuenta',        (((now() AT TIME ZONE $2)::date - 1)::timestamp AT TIME ZONE $2), 12)`,
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
      let ventana19 = '';
      for (let i = 0; i < POR_DIA; i++) {
        const r = await reservarTurnoDeReporte(cliente, idVecina, 'inundacion', {
          ...opciones,
          ahora: '2026-09-20T03:59:00Z',
        });
        expect(r).toMatchObject({ permitido: true, n: i + 1 });
        if (r.permitido) ventana19 = r.ventanaInicio;
      }
      const agotado = await reservarTurnoDeReporte(cliente, idVecina, 'inundacion', {
        ...opciones,
        ahora: '2026-09-20T03:59:30Z',
      });
      expect(agotado.permitido).toBe(false);
      if (!agotado.permitido) {
        expect(agotado.espera.disponibleEn).toBe('2026-09-20T00:00:00-04:00');
        expect(agotado.espera.reintentarEnS).toBe(30);
      }
      const despues = await reservarTurnoDeReporte(cliente, idVecina, 'inundacion', {
        ...opciones,
        ahora: '2026-09-20T04:01:00Z',
      });
      expect(despues).toMatchObject({ permitido: true, n: 1 });
      // La ventana del día siguiente es otra fila: el contador arrancó de cero.
      if (despues.permitido) expect(despues.ventanaInicio).not.toBe(ventana19);
    } finally {
      cliente.release();
    }
  });

  it('leerCupos cuenta solo la ventana del día local', async () => {
    await pool.query(
      `INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n) VALUES
         ($1, 'reportes:inundacion', ('2026-09-19'::date::timestamp AT TIME ZONE $2), 2),
         ($1, 'fotos:cuenta',        ('2026-09-19'::date::timestamp AT TIME ZONE $2), 5),
         ($1, 'reportes:inundacion', ('2026-09-20'::date::timestamp AT TIME ZONE $2), 1)`,
      [idVecina, ZONA],
    );
    const claves = [claveReportes('inundacion'), CLAVE_FOTOS];
    const antes = await leerCupos(pool, idVecina, claves, {
      zona: ZONA,
      ahora: '2026-09-20T03:59:00Z',
    });
    expect(antes.dia).toBe('2026-09-19');
    expect(antes.conteos[claveReportes('inundacion')]).toBe(2);
    expect(antes.conteos[CLAVE_FOTOS]).toBe(5);
    const despues = await leerCupos(pool, idVecina, claves, {
      zona: ZONA,
      ahora: '2026-09-20T04:01:00Z',
    });
    expect(despues.dia).toBe('2026-09-20');
    expect(despues.conteos[claveReportes('inundacion')]).toBe(1);
    expect(despues.conteos[CLAVE_FOTOS] ?? 0).toBe(0);
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

describe('cupo por categoría con una categoría sintética activa', () => {
  let appCat: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    appCat = await crearApp({
      pool,
      cfg: {
        ...configDePrueba({ DATABASE_URL: base.url }),
        rutaOpenApi: '/no-existe.yaml',
        rateLimitMax: 10_000,
        // Demoras reales para comprobar que el 1.º de una categoría se publica a 60 s.
        demoraPrimeroS: PRIMERO,
        demoraSiguientesS: SIGUIENTES,
      },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
      registro: crearRegistroCategorias([DEFINICION_INUNDACION, DEF_BACHE]),
    });
    await pool.query(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
    appCat.categorias.invalidar();
    cookie = await iniciarSesion(appCat, CUENTAS.vecina);
  }, 60_000);

  afterAll(async () => {
    await pool.query(`UPDATE categoria SET activa = false WHERE slug = 'bache'`);
    await appCat.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM cupo_contador');
  });

  const enviarCat = (payload: unknown) =>
    appCat.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: payload as Record<string, unknown>,
      cookies: sesion(cookie),
    });

  const reporteBache = {
    lat: reporteValido.lat,
    lon: reporteValido.lon,
    dispositivo: reporteValido.dispositivo,
    ubicacion_tipo: 'via_publica',
    descripcion: reporteValido.descripcion,
    categoria: 'bache',
    detalle: { profundidad_estimada: 'rodilla', frecuencia: 'ocasional' },
  };

  it('el 4.º de inundación da 429 con detalles.categoria; el 1.º de la sintética entra con 60 s', async () => {
    for (let i = 0; i < POR_DIA; i++)
      expect((await enviarCat(reporteValido)).statusCode, `inundación ${i}`).toBe(201);
    const cuarto = await enviarCat(reporteValido);
    expect(cuarto.statusCode).toBe(429);
    expect(cuarto.json().codigo).toBe('CUOTA_DE_REPORTES');
    expect(cuarto.json().detalles.categoria).toBe('inundacion');

    // El bache cuenta en su propia fila (`reportes:bache`): el 1.º entra, con 60 s de demora.
    const bache = await enviarCat(reporteBache);
    expect(bache.statusCode, bache.body.slice(0, 200)).toBe(201);
    const p = bache.json().properties as {
      creado_en: string;
      publicar_en: string;
      categoria: string;
    };
    expect(p.categoria).toBe('bache');
    expect(Math.round((Date.parse(p.publicar_en) - Date.parse(p.creado_en)) / 1000)).toBe(PRIMERO);
  });

  it('cada categoría lleva su propio contador: el 4.º de bache también da 429', async () => {
    for (let i = 0; i < POR_DIA; i++)
      expect((await enviarCat(reporteBache)).statusCode, `bache ${i}`).toBe(201);
    const cuarto = await enviarCat(reporteBache);
    expect(cuarto.statusCode).toBe(429);
    expect(cuarto.json().detalles.categoria).toBe('bache');
    // Inundación, en cambio, sigue con todo su cupo.
    expect((await enviarCat(reporteValido)).statusCode).toBe(201);
  });

  it('/auth/yo trae un cupo por cada categoría activa y las fotos restantes', async () => {
    await enviarCat(reporteValido);
    const yo = (
      await appCat.inject({ method: 'GET', url: '/api/v1/auth/yo', cookies: sesion(cookie) })
    ).json() as {
      cupos: Record<string, { restantes: number; demora_proximo_s: number }>;
      fotos_restantes_hoy: number;
      reportes_restantes_hoy: number;
    };
    expect(Object.keys(yo.cupos).sort()).toEqual(['bache', 'inundacion']);
    expect(yo.cupos.inundacion?.restantes).toBe(POR_DIA - 1);
    expect(yo.cupos.bache?.restantes).toBe(POR_DIA);
    expect(yo.cupos.bache?.demora_proximo_s).toBe(PRIMERO);
    // Los campos sueltos siguen siendo los de inundación.
    expect(yo.reportes_restantes_hoy).toBe(POR_DIA - 1);
    expect(yo.fotos_restantes_hoy).toBe(CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA);
  });
});

describe('una regla de cupo desconocida impide arrancar', () => {
  it('validarReglasDeCupo acepta la de inundación y lanza con un ámbito o ventana desconocidos', () => {
    expect(() => validarReglasDeCupo([DEFINICION_INUNDACION])).not.toThrow();
    const malAmbito = {
      ...DEFINICION_INUNDACION,
      slug: 'bache',
      cupo: { id: 'x', ambito: 'cuenta+region', ventana: 'dia_local', limite: 3 },
    } as DefinicionCategoriaCualquiera;
    expect(() => validarReglasDeCupo([malAmbito])).toThrow(/no sabe aplicar/);
    const malaVentana = {
      ...DEFINICION_INUNDACION,
      slug: 'basura',
      cupo: { id: 'y', ambito: 'cuenta+categoria', ventana: 'hora', limite: 3 },
    } as DefinicionCategoriaCualquiera;
    expect(() => validarReglasDeCupo([malaVentana])).toThrow(/no sabe aplicar/);
  });

  it('verificarReglasDeCupoActivas falla cerrado si una categoría ACTIVA trae una regla desconocida', async () => {
    const DEF_MALA = {
      ...DEFINICION_INUNDACION,
      slug: 'bache',
      cupo: { id: 'x', ambito: 'cuenta+region', ventana: 'dia_local', limite: 3 },
    } as DefinicionCategoriaCualquiera;
    const registro = crearRegistroCategorias([DEFINICION_INUNDACION, DEF_MALA]);
    await pool.query(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
    try {
      await expect(verificarReglasDeCupoActivas(pool, registro)).rejects.toThrow(/bache/);
      // Con el registro por defecto (bache sin definición) no hay nada que validar: no lanza.
      await expect(verificarReglasDeCupoActivas(pool)).resolves.toBeUndefined();
    } finally {
      await pool.query(`UPDATE categoria SET activa = false WHERE slug = 'bache'`);
    }
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

/**
 * CA5 del plan M3b: `POST /reportes` con la forma por categoría tiene que cortar ANTES de resolver
 * la ubicación y ANTES de gastar cupo cuando la categoría no está disponible o el detalle es
 * inválido. Las tres cosas que prueba este bloque:
 *   a) una categoría inactiva en el catálogo o un slug desconocido → 422 CATEGORIA_NO_DISPONIBLE;
 *   b) un `detalle` con una clave de más → 400 PAYLOAD_INVALIDO (lo rechaza el Zod estricto de la
 *      definición; con `__proto__` como clave propia lo corta antes la guarda antiproto de Fastify);
 *   c) un `detalle` por encima del tope de 8192 bytes (el CHECK `detalle_tope` de la 0020) → 400, no
 *      500.
 * En los tres casos no puede quedar una fila ni un `n` mayor en `cupo_contador`, ni crearse reporte.
 */
describe('CA5: categoría indisponible o detalle inválido → 4xx sin gastar cupo', () => {
  let appNota: FastifyInstance;
  let cookieNota: string;

  /**
   * Categoría sintética ACTIVA con un detalle de TEXTO LIBRE largo, para empujar el `detalle` por
   * encima del tope de 8192 bytes. `DEF_BACHE` no sirve para (c): reusa `DetalleInundacionSchema`,
   * que es un enum acotado y no admite texto libre. Toma el slug `basura` del catálogo (la columna
   * `categoria` es FK a `categoria.slug`) y se activa en el catálogo en el beforeAll.
   */
  const DEF_NOTA = {
    ...DEFINICION_INUNDACION,
    slug: 'basura',
    nombre: 'Basura (sintético)',
    nombreCorto: 'Basura',
    esquemaDetalle: z.strictObject({ nota: z.string().max(20_000) }),
    severidad: { version: 1, calcular: () => ({ puntaje: 3, banda: 'baja' as const }) },
    camposPublicos: [],
    camposExportacion: [],
  } as unknown as DefinicionCategoriaCualquiera;

  /**
   * Otra categoría sintética con un detalle de VARIAS claves de texto libre (`z.record`), para el
   * borde del tope (c3): varias claves hacen que los espacios que el jsonb agrega tras `:` y `,`
   * sumen lo suficiente para que `octet_length(detalle::text)` supere 8192 aunque `JSON.stringify`
   * no lo haga. Toma el slug `area_verde` del catálogo.
   */
  const DEF_BORDE = {
    ...DEFINICION_INUNDACION,
    slug: 'area_verde',
    nombre: 'Área verde (sintético)',
    nombreCorto: 'Área verde',
    esquemaDetalle: z.record(z.string(), z.string()),
    severidad: { version: 1, calcular: () => ({ puntaje: 3, banda: 'baja' as const }) },
    camposPublicos: [],
    camposExportacion: [],
  } as unknown as DefinicionCategoriaCualquiera;

  /** Núcleo común de un reporte por categoría, en el punto válido de las capas de prueba. */
  const nucleo = {
    lat: reporteValido.lat,
    lon: reporteValido.lon,
    dispositivo: reporteValido.dispositivo,
    ubicacion_tipo: 'via_publica',
    descripcion: reporteValido.descripcion,
  };

  beforeAll(async () => {
    appNota = await crearApp({
      pool,
      cfg: {
        ...configDePrueba({ DATABASE_URL: base.url }),
        rutaOpenApi: '/no-existe.yaml',
        rateLimitMax: 10_000,
      },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
      registro: crearRegistroCategorias([DEFINICION_INUNDACION, DEF_NOTA, DEF_BORDE]),
    });
    await pool.query(`UPDATE categoria SET activa = true WHERE slug IN ('basura', 'area_verde')`);
    appNota.categorias.invalidar();
    cookieNota = await iniciarSesion(appNota, CUENTAS.vecina);
  }, 60_000);

  afterAll(async () => {
    await pool.query(`UPDATE categoria SET activa = false WHERE slug IN ('basura', 'area_verde')`);
    await appNota.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM cupo_contador');
    await pool.query('DELETE FROM idempotencia');
  });

  /** Filas de cupo de la cuenta (ninguna debe aparecer tras un 4xx previo a la transacción). */
  async function filasCupo(): Promise<number> {
    const r = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM cupo_contador WHERE usuario_id = $1',
      [idVecina],
    );
    return r.rows[0]!.n;
  }

  /** Total de reportes en la base; se compara el antes y el después (otros bloques dejan filas). */
  async function contarReportes(): Promise<number> {
    const r = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM reporte');
    return r.rows[0]!.n;
  }

  /** `reportes_restantes_hoy` de inundación según `/auth/yo` en la app indicada. */
  async function restantesHoy(target: FastifyInstance, cookie: string): Promise<number> {
    const yo = (
      await target.inject({ method: 'GET', url: '/api/v1/auth/yo', cookies: sesion(cookie) })
    ).json() as { reportes_restantes_hoy: number };
    return yo.reportes_restantes_hoy;
  }

  it('(a) categoría inactiva o desconocida → 422 CATEGORIA_NO_DISPONIBLE, sin cupo ni reporte', async () => {
    // `bache` está en el catálogo pero INACTIVA; `no_existe` no es un slug conocido (normaliza a
    // null). En la app por defecto ninguna de las dos está activa (regla 3: catálogo ∩ registro).
    for (const categoria of ['bache', 'no_existe']) {
      const reportesAntes = await contarReportes();
      const restantesAntes = await restantesHoy(app, cookieVecina);
      const r = await enviar(cookieVecina, { ...nucleo, categoria, detalle: {} });
      expect(r.statusCode, `${categoria}: ${r.body.slice(0, 200)}`).toBe(422);
      expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
      // No se tocó el cupo (el corte es antes de la transacción) ni se creó reporte.
      expect(await filasCupo(), `${categoria}: cupo`).toBe(0);
      expect(await contarReportes(), `${categoria}: reportes`).toBe(reportesAntes);
      expect(await restantesHoy(app, cookieVecina), `${categoria}: /auth/yo`).toBe(restantesAntes);
    }
  });

  it('(b) detalle de inundación con una clave de más → 400 PAYLOAD_INVALIDO, sin cupo ni reporte', async () => {
    const reportesAntes = await contarReportes();
    const r = await enviar(cookieVecina, {
      ...nucleo,
      categoria: 'inundacion',
      // Núcleo de detalle válido (profundidad y frecuencia bastan) MÁS una clave de más: la rechaza
      // el `strictObject` de `DetalleInundacionSchema`.
      detalle: { profundidad_estimada: 'rodilla', frecuencia: 'cada_lluvia_fuerte', extra: 'x' },
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(r.json().detalles.some((d: { campo: string }) => d.campo.startsWith('detalle.'))).toBe(
      true,
    );
    expect(await filasCupo()).toBe(0);
    expect(await contarReportes()).toBe(reportesAntes);
  });

  it('(b2) un detalle con __proto__ como clave propia del JSON → 400, sin cupo ni reporte', async () => {
    // `__proto__` como clave PROPIA del JSON no llega al safeParse del detalle: la guarda antiproto
    // de Fastify (onProtoPoisoning: 'error' por defecto) corta el cuerpo en el parser y
    // `errorDeFramework` lo mapea a 400 PAYLOAD_INVALIDO. El resultado que exige CA5 (400, sin cupo
    // ni reporte) se cumple igual. Se manda como texto crudo porque `{ __proto__: … }` en un literal
    // fija el prototipo en vez de crear una clave propia.
    const reportesAntes = await contarReportes();
    const cuerpo = {
      ...nucleo,
      categoria: 'inundacion',
      detalle: { profundidad_estimada: 'rodilla', frecuencia: 'ocasional' },
    };
    const raw = JSON.stringify(cuerpo).replace('"detalle":{', '"detalle":{"__proto__":{"x":1},');
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      headers: { 'content-type': 'application/json' },
      cookies: sesion(cookieVecina),
      payload: raw,
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(await filasCupo()).toBe(0);
    expect(await contarReportes()).toBe(reportesAntes);
  });

  it('(c) un detalle por encima del tope de 8192 bytes → 400 (no 500), sin cupo ni reporte', async () => {
    const reportesAntes = await contarReportes();
    // 9000 bytes de texto: muy por encima del tope octet_length(detalle::text) <= 8192 del CHECK
    // `detalle_tope` de la 0020, lo mida como lo mida (jsonb suma a lo sumo un espacio por separador).
    const r = await appNota.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      cookies: sesion(cookieNota),
      payload: { ...nucleo, categoria: 'basura', detalle: { nota: 'A'.repeat(9000) } },
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(await filasCupo()).toBe(0);
    expect(await contarReportes()).toBe(reportesAntes);
  });

  it('(c2) un detalle de la misma categoría dentro del tope entra con 201', async () => {
    // Control: el tope no rechaza un detalle normal; la categoría sintética crea su reporte.
    const r = await appNota.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      cookies: sesion(cookieNota),
      payload: { ...nucleo, categoria: 'basura', detalle: { nota: 'una nota corta' } },
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    expect(r.json().properties.categoria).toBe('basura');
  });

  it('(c3) JSON.stringify ≤ 8192 pero jsonb > 8192 → 400 (lo traduce el CHECK), sin cupo ni reporte', async () => {
    // El borde entre las dos medidas: 20 claves de 400 bytes dan un `JSON.stringify` ≈ 8171 (pasa la
    // comprobación previa), pero el jsonb que guarda la base agrega un espacio tras cada `:` y cada
    // `,` (2·20 − 1 = 39 bytes) y supera el tope. Acá el CHECK `detalle_tope` salta dentro de la
    // transacción y el catch del INSERT lo traduce al mismo 400.
    const detalle: Record<string, string> = {};
    for (let i = 0; i < 20; i++) detalle[`k${i}`] = 'A'.repeat(400);
    // Se cumplen las DOS medidas: la del cliente (`JSON.stringify`) y la del CHECK (`detalle::text`).
    expect(Buffer.byteLength(JSON.stringify(detalle), 'utf8')).toBeLessThanOrEqual(8192);
    const medida = await pool.query<{ n: number }>('SELECT octet_length($1::jsonb::text) AS n', [
      JSON.stringify(detalle),
    ]);
    expect(medida.rows[0]!.n).toBeGreaterThan(8192);

    const reportesAntes = await contarReportes();
    const r = await appNota.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      cookies: sesion(cookieNota),
      payload: { ...nucleo, categoria: 'area_verde', detalle },
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    // El turno quedó devuelto por el ROLLBACK y no se creó reporte.
    expect(await filasCupo()).toBe(0);
    expect(await contarReportes()).toBe(reportesAntes);
  });
});
