/**
 * Configuración pública del despliegue (`GET /api/v1/configuracion`, contracts 0.7.0) y
 * `panel_url` en `/api/v1/auth/yo`.
 *
 * Decisión del usuario: una instalación por ciudad; la ciudad (centro, locale, nombre, zona
 * horaria) y la URL del panel llegan a los clientes por configuración de api-core en tiempo de
 * ejecución, no fijadas en el JavaScript de cada frontend al compilar.
 */
import { CONFIG_DOMINIO } from 'contracts';
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
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

describe('config.ts: ciudad del despliegue (CIUDAD_*)', () => {
  it('sin variables, la ciudad es la por defecto (Santa Cruz)', () => {
    expect(leerConfig({}).ciudad).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
  });

  it('otra ciudad se configura solo con variables de entorno (Asunción)', () => {
    const cfg = leerConfig({
      CIUDAD_NOMBRE: 'Asunción',
      CIUDAD_PAIS: 'PY',
      CIUDAD_LOCALE: 'es-PY',
      CIUDAD_CENTRO_LON: '-57.5759',
      CIUDAD_CENTRO_LAT: '-25.2637',
      CIUDAD_ZOOM_INICIAL: '12',
      ZONA_HORARIA: 'America/Asuncion',
    });
    expect(cfg.ciudad).toEqual({
      nombre: 'Asunción',
      pais: 'PY',
      zona_horaria: 'America/Asuncion',
      locale: 'es-PY',
      centro: { lon: -57.5759, lat: -25.2637 },
      zoom_inicial: 12,
    });
    // La ciudad usa la MISMA zona que el resto de api-core, no una copia que pueda desincronizarse.
    expect(cfg.ciudad.zona_horaria).toBe(cfg.zonaHoraria);
  });

  it('cada variable vacía cae por su cuenta en el valor por defecto', () => {
    expect(leerConfig({ CIUDAD_NOMBRE: '  ' }).ciudad.nombre).toBe(
      CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.nombre,
    );
    expect(leerConfig({ CIUDAD_PAIS: '' }).ciudad.pais).toBe(
      CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.pais,
    );
    expect(leerConfig({ CIUDAD_CENTRO_LON: '' }).ciudad.centro.lon).toBe(
      CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.centro.lon,
    );
  });

  it('una variable inválida impide arrancar, con el motivo', () => {
    expect(() => leerConfig({ CIUDAD_LOCALE: 'es_BO' })).toThrow(/locale/i);
    expect(() => leerConfig({ CIUDAD_PAIS: 'bol' })).toThrow(/pais/i);
    expect(() => leerConfig({ CIUDAD_CENTRO_LAT: '200' })).toThrow(/centro/i);
    expect(() => leerConfig({ CIUDAD_CENTRO_LON: 'no-es-un-numero' })).toThrow(/centro/i);
    expect(() => leerConfig({ CIUDAD_ZOOM_INICIAL: '30' })).toThrow(/zoom/i);
  });
});

describe('config.ts: PANEL_ADMIN_URL', () => {
  it('sin configurar, no hay panel', () => {
    expect(leerConfig({}).panelAdminUrl).toBeNull();
  });

  it('se normaliza a URL absoluta', () => {
    expect(leerConfig({ PANEL_ADMIN_URL: 'https://panel.curichi.gob.bo' }).panelAdminUrl).toBe(
      'https://panel.curichi.gob.bo/',
    );
  });

  it('rechaza usuario/contraseña, protocolos que no son http/https, y lo que no es una URL', () => {
    expect(() =>
      leerConfig({ PANEL_ADMIN_URL: 'https://tecnico:secreto@panel.curichi.gob.bo' }),
    ).toThrow(/PANEL_ADMIN_URL/);
    expect(() => leerConfig({ PANEL_ADMIN_URL: 'ftp://panel.curichi.gob.bo' })).toThrow(
      /PANEL_ADMIN_URL/,
    );
    expect(() => leerConfig({ PANEL_ADMIN_URL: 'no-es-una-url' })).toThrow(/PANEL_ADMIN_URL/);
  });

  const PRODUCCION_BASE = {
    NODE_ENV: 'production',
    IP_HASH_SAL: 'sal-real-de-produccion-con-largo-suficiente',
    JITTER_SAL: 'jitter-real-de-produccion-con-largo-suficiente',
    COOKIE_SEGURA: '1',
    CORS_ORIGENES: 'https://curichi.gob.bo',
    GEO_TOKEN_INTERNO: 'token-interno-de-produccion-con-largo-suficiente',
    METRICAS_RUTA: '',
  } satisfies NodeJS.ProcessEnv;

  it('en producción es obligatoria', () => {
    expect(() => leerConfig(PRODUCCION_BASE)).toThrow(/PANEL_ADMIN_URL/);
  });

  it('en producción tiene que ser https', () => {
    expect(() =>
      leerConfig({ ...PRODUCCION_BASE, PANEL_ADMIN_URL: 'http://panel.curichi.gob.bo' }),
    ).toThrow(/PANEL_ADMIN_URL[^\n]*https/);
    expect(() =>
      leerConfig({ ...PRODUCCION_BASE, PANEL_ADMIN_URL: 'https://panel.curichi.gob.bo' }),
    ).not.toThrow();
  });
});

describe('GET /api/v1/configuracion', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await crearApp({
      // Pool de mentira: esta ruta no toca la base.
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
          CIUDAD_NOMBRE: 'Asunción',
          CIUDAD_PAIS: 'PY',
          CIUDAD_LOCALE: 'es-PY',
          ZONA_HORARIA: 'America/Asuncion',
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

  it('es pública (sin sesión) y devuelve la ciudad configurada', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/configuracion' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      ciudad: {
        nombre: 'Asunción',
        pais: 'PY',
        zona_horaria: 'America/Asuncion',
        locale: 'es-PY',
        centro: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.centro,
        zoom_inicial: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.zoom_inicial,
      },
    });
  });

  it('se puede guardar en una caché compartida 5 minutos', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/configuracion' });
    expect(r.headers['cache-control']).toBe('public, max-age=300');
  });
});

describe('GET /api/v1/auth/yo: panel_url según rol', () => {
  let base: BaseEfimera;
  let pool: pg.Pool;
  let conPanel: FastifyInstance;
  let sinPanel: FastifyInstance;

  beforeAll(async () => {
    base = await levantarBaseEfimera();
    pool = new pg.Pool({ connectionString: base.url, max: 3 });
    const ex = ejecutorPg(pool);
    await cargarCapasDePrueba(ex);
    await crearUsuarios(ex);
    conPanel = await crearApp({
      pool,
      cfg: {
        ...configDePrueba({
          DATABASE_URL: base.url,
          PANEL_ADMIN_URL: 'https://panel.curichi.gob.bo',
        }),
        rutaOpenApi: '/no-existe.yaml',
      },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    sinPanel = await crearApp({
      pool,
      cfg: { ...configDePrueba({ DATABASE_URL: base.url }), rutaOpenApi: '/no-existe.yaml' },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
  }, 120_000);

  afterAll(async () => {
    await conPanel?.close();
    await sinPanel?.close();
    await pool?.end();
    await base?.cerrar();
  });

  it('tecnico, admin y ejecutivo reciben panel_url normalizada', async () => {
    for (const email of [CUENTAS.tecnico, CUENTAS.admin, CUENTAS.ejecutivo]) {
      const cookie = await iniciarSesion(conPanel, email);
      const r = await conPanel.inject({
        method: 'GET',
        url: '/api/v1/auth/yo',
        cookies: sesion(cookie),
      });
      expect(r.statusCode, email).toBe(200);
      expect(r.json().panel_url, email).toBe('https://panel.curichi.gob.bo/');
    }
  });

  it('un ciudadano no recibe el campo panel_url, ni siquiera en null', async () => {
    const cookie = await iniciarSesion(conPanel, CUENTAS.vecina);
    const r = await conPanel.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: sesion(cookie),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).not.toHaveProperty('panel_url');
  });

  it('sin PANEL_ADMIN_URL configurada, los roles del panel reciben panel_url: null', async () => {
    const cookie = await iniciarSesion(sinPanel, CUENTAS.admin);
    const r = await sinPanel.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: sesion(cookie),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().panel_url).toBeNull();
  });
});
