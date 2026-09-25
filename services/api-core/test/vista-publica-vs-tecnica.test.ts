/**
 * Separación entre la representación PÚBLICA y la TÉCNICA (CLAUDE.md §13, §7.5).
 *
 * El defecto que estas pruebas fijan: `GET /api/v1/reportes` devolvía coordenadas exactas y
 * reportes sin moderar cuando la petición llevaba cookie de sesión de técnico. La representación
 * dependía de una señal **ambiental** —una cookie que nadie había pedido enviar— en vez de una
 * intención explícita. Dos consecuencias comprobadas:
 *
 *  1. Las cookies no distinguen puertos ni rutas. Con el panel y el mapa público en el mismo host,
 *     el navegador mandaba la misma cookie a los dos y el mapa público le enseñaba al técnico 47
 *     reportes con la ubicación exacta en lugar de los 35 publicados.
 *  2. La URL era la misma en los dos casos y no salía ninguna cabecera de caché. Una caché
 *     compartida podía guardar la respuesta del técnico y servírsela después a un anónimo.
 *
 * La corrección no es poner `Cache-Control` y seguir: es que la ruta pública sea **incapaz** de
 * construir una vista técnica, y que la técnica viva en otra URL con el rol exigido. Por eso aquí
 * se comprueban las dos cosas: que la representación no se mueva, y que las cabeceras acompañen.
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
let cookieTecnico: string;
let cookieAdmin: string;
let cookieVecina: string;
let ex: ReturnType<typeof ejecutorPg>;
let idPublicado: string;
let idSinPublicar: string;

const LAT = -17.7912345;
const LON = -63.1934567;

/** Reporte de vivienda como vecina, con el turno de la cuota devuelto: aquí se prueban vistas. */
async function crearVivienda() {
  await liberarCuota(ex);
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: { ...reporteValido, lat: LAT, lon: LON, ubicacion_tipo: 'vivienda_o_predio' },
    cookies: sesion(cookieVecina),
  });
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
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
  cookieAdmin = await iniciarSesion(app, CUENTAS.admin);
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);

  // Uno publicado (vivienda: es el caso con ubicación degradada) y otro que sigue en `nuevo`.
  const a = await crearVivienda();
  idPublicado = a.json().id as string;
  await app.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${idPublicado}/estado`,
    cookies: { curichi_sesion: cookieTecnico },
    payload: { estado: 'validado' },
  });
  const b = await crearVivienda();
  idSinPublicar = b.json().id as string;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

/** Señas inequívocas de que una respuesta es la vista técnica y no la pública. */
function esVistaTecnica(props: Record<string, unknown>): boolean {
  return 'autor_id' in props || 'ubicacion_metodo' in props || 'estado_motivo' in props;
}

function coordenadas(cuerpo: { geometry: { coordinates: [number, number] } }) {
  return cuerpo.geometry.coordinates;
}

describe('la ruta pública devuelve la vista pública pase lo que pase', () => {
  it('sin cookie: solo lo publicado y con la ubicación degradada', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=500' });
    expect(r.statusCode).toBe(200);
    const fs = r.json().features as Array<{ id: string; properties: Record<string, unknown> }>;
    expect(fs.map((f) => f.id)).toContain(idPublicado);
    expect(fs.map((f) => f.id)).not.toContain(idSinPublicar);
    for (const f of fs) expect(esVistaTecnica(f.properties)).toBe(false);
  });

  /**
   * ESTA es la regresión. Antes esta misma petición devolvía la vista técnica solo por llevar la
   * cookie: el reporte sin publicar aparecía y las coordenadas eran las exactas.
   */
  it('CON cookie de técnico: exactamente la misma respuesta que sin cookie', async () => {
    const sin = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=500' });
    const con = await app.inject({
      method: 'GET',
      url: '/api/v1/reportes?limite=500',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(con.statusCode).toBe(200);
    expect(con.json()).toEqual(sin.json());
    const fs = con.json().features as Array<{ id: string; properties: Record<string, unknown> }>;
    expect(fs.map((f) => f.id)).not.toContain(idSinPublicar);
    for (const f of fs) expect(esVistaTecnica(f.properties)).toBe(false);
  });

  it('CON cookie de admin tampoco cambia', async () => {
    const sin = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=500' });
    const con = await app.inject({
      method: 'GET',
      url: '/api/v1/reportes?limite=500',
      cookies: { curichi_sesion: cookieAdmin },
    });
    expect(con.json()).toEqual(sin.json());
  });

  it('el detalle público de una vivienda nunca trae la coordenada exacta, ni con cookie', async () => {
    for (const cookies of [undefined, { curichi_sesion: cookieTecnico }]) {
      const r = await app.inject({
        method: 'GET',
        url: `/api/v1/reportes/${idPublicado}`,
        ...(cookies ? { cookies } : {}),
      });
      expect(r.statusCode).toBe(200);
      expect(coordenadas(r.json())).not.toEqual([LON, LAT]);
      expect(r.json().properties.precision_degradada).toBe(true);
      expect(esVistaTecnica(r.json().properties)).toBe(false);
    }
  });

  it('el detalle público de un reporte sin moderar es 404 incluso para el técnico', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/reportes/${idSinPublicar}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode).toBe(404);
  });

  it('el filtro por estado no saca nada sin publicar en la ruta pública', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/reportes?estado=nuevo&limite=500',
      cookies: { curichi_sesion: cookieTecnico },
    });
    const fs = r.json().features as Array<{ id: string }>;
    expect(fs.map((f) => f.id)).not.toContain(idSinPublicar);
  });
});

describe('cookies raras no activan nada', () => {
  const raras: Array<[string, string]> = [
    ['inexistente', 'a'.repeat(64)],
    ['con formato inválido', 'no-es-un-id'],
    ['vacía', ''],
    ['manipulada (un carácter cambiado)', ''],
    ['con caracteres de control', 'abc\r\nSet-Cookie: x=1'],
    ['larguísima', 'f'.repeat(5000)],
  ];

  it('ninguna variante de cookie produce la vista técnica', async () => {
    const publico = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=500' });
    for (const [nombre, valorBase] of raras) {
      const valor =
        nombre === 'manipulada (un carácter cambiado)'
          ? `${cookieTecnico.slice(0, -1)}${cookieTecnico.endsWith('a') ? 'b' : 'a'}`
          : valorBase;
      const r = await app.inject({
        method: 'GET',
        url: '/api/v1/reportes?limite=500',
        cookies: { curichi_sesion: valor },
      });
      expect(r.statusCode, nombre).toBe(200);
      expect(r.json(), nombre).toEqual(publico.json());
    }
  });

  it('una sesión caducada no vale para la ruta técnica', async () => {
    const cookie = await iniciarSesion(app, CUENTAS.tecnico);
    await pool.query(`UPDATE sesion SET expira_en = now() - interval '1 hour' WHERE id = $1`, [
      cookie,
    ]);
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/tecnico/reportes',
      cookies: { curichi_sesion: cookie },
    });
    expect(r.statusCode).toBe(401);
  });

  it('una sesión inactiva demasiado tiempo tampoco', async () => {
    const cookie = await iniciarSesion(app, CUENTAS.tecnico);
    await pool.query(
      `UPDATE sesion SET ultimo_uso_en = now() - interval '400 days' WHERE id = $1`,
      [cookie],
    );
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/tecnico/reportes',
      cookies: { curichi_sesion: cookie },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('la ruta técnica exige intención explícita Y autorización', () => {
  it('sin sesión responde 401 y NO cae a la vista pública', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/tecnico/reportes' });
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('SIN_SESION');
    const d = await app.inject({ method: 'GET', url: `/api/v1/tecnico/reportes/${idPublicado}` });
    expect(d.statusCode).toBe(401);
  });

  it('con sesión de rol ciudadano responde 403', async () => {
    // `vecino@test.local` ya existe con rol ciudadano: lo crea `crearUsuarios`.
    const cookie = await iniciarSesion(app, CUENTAS.vecino);
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/tecnico/reportes',
      cookies: { curichi_sesion: cookie },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe('SIN_PERMISO');
  });

  it('con rol técnico devuelve la coordenada exacta y los reportes sin moderar', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/tecnico/reportes?limite=500',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode).toBe(200);
    const fs = r.json().features as Array<{
      id: string;
      geometry: { coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>;
    expect(fs.map((f) => f.id)).toContain(idSinPublicar);
    const pub = fs.find((f) => f.id === idPublicado)!;
    expect(pub.geometry.coordinates).toEqual([LON, LAT]);
    expect(esVistaTecnica(pub.properties)).toBe(true);

    const d = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes/${idSinPublicar}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(d.statusCode).toBe(200);
    expect(coordenadas(d.json())).toEqual([LON, LAT]);
  });
});

describe('cabeceras de caché', () => {
  it('la ruta pública se declara pública y revalidable', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=10' });
    expect(r.headers['cache-control']).toBe('public, no-cache');
  });

  it('la ruta técnica prohíbe el almacenamiento y varía por cookie', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/tecnico/reportes?limite=10',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(String(r.headers.vary)).toMatch(/Cookie/i);
  });

  it('por defecto, cualquier otra ruta es privada: se falla hacia el lado seguro', async () => {
    for (const url of ['/api/v1/auth/yo', '/api/v1/indicadores', '/api/v1/admin/capas']) {
      const r = await app.inject({
        method: 'GET',
        url,
        cookies: { curichi_sesion: cookieAdmin },
      });
      expect(r.headers['cache-control'], url).toBe('private, no-store');
      expect(String(r.headers.vary), url).toMatch(/Cookie/i);
    }
  });

  it('no se pisa el Vary: Origin que pone CORS', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      headers: { origin: 'http://localhost:3100' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    const vary = String(r.headers.vary);
    expect(vary).toMatch(/Origin/i);
    expect(vary).toMatch(/Cookie/i);
  });
});

/**
 * Caché compartida de juguete, con la MISMA regla que usaría un proxy ingenuo: clave = método +
 * URL, y se guarda todo lo que no diga `no-store`. Es deliberadamente tonta, porque el ataque que
 * se quiere descartar es justo el que funciona contra una caché tonta.
 */
class CacheCompartida {
  private entradas = new Map<string, { cuerpo: string; deQuien: string }>();

  guardar(url: string, cuerpo: string, cacheControl: string, deQuien: string): boolean {
    if (/no-store/.test(cacheControl) || /private/.test(cacheControl)) return false;
    this.entradas.set(`GET ${url}`, { cuerpo, deQuien });
    return true;
  }

  leer(url: string) {
    return this.entradas.get(`GET ${url}`);
  }
}

describe('una caché compartida delante del servicio no puede mezclar representaciones', () => {
  it('lo que guarda de un técnico jamás llega a un anónimo', async () => {
    const cache = new CacheCompartida();

    // 1. El técnico pide la vista técnica y la caché intenta guardarla.
    const urlTecnica = '/api/v1/tecnico/reportes?limite=500';
    const tec = await app.inject({
      method: 'GET',
      url: urlTecnica,
      cookies: { curichi_sesion: cookieTecnico },
    });
    const guardada = cache.guardar(
      urlTecnica,
      tec.body,
      String(tec.headers['cache-control']),
      'tecnico',
    );
    // Ni siquiera llega a guardarse: `private, no-store`.
    expect(guardada).toBe(false);
    expect(cache.leer(urlTecnica)).toBeUndefined();

    // 2. Aunque una caché rota la hubiera guardado, el anónimo pide OTRA URL: la pública.
    const urlPublica = '/api/v1/reportes?limite=500';
    expect(cache.leer(urlPublica)).toBeUndefined();
    const pub = await app.inject({ method: 'GET', url: urlPublica });
    expect(pub.body).not.toBe(tec.body);
    for (const f of pub.json().features as Array<{ properties: Record<string, unknown> }>)
      expect(esVistaTecnica(f.properties)).toBe(false);

    // 3. Y si la caché guarda la pública, servírsela a cualquiera es correcto por definición.
    expect(
      cache.guardar(urlPublica, pub.body, String(pub.headers['cache-control']), 'anonimo'),
    ).toBe(true);
    expect(cache.leer(urlPublica)!.cuerpo).toBe(pub.body);
  });

  it('en orden inverso: lo cacheado del público no degrada al técnico', async () => {
    const cache = new CacheCompartida();
    const urlPublica = '/api/v1/reportes?limite=500';
    const pub = await app.inject({ method: 'GET', url: urlPublica });
    cache.guardar(urlPublica, pub.body, String(pub.headers['cache-control']), 'anonimo');

    // El técnico pide SU ruta: la caché no tiene nada con esa clave y la petición llega al origen.
    const urlTecnica = '/api/v1/tecnico/reportes?limite=500';
    expect(cache.leer(urlTecnica)).toBeUndefined();
    const tec = await app.inject({
      method: 'GET',
      url: urlTecnica,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(tec.statusCode).toBe(200);
    const ids = (tec.json().features as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(idSinPublicar);
  });

  it('peticiones concurrentes mezcladas mantienen cada una su representación', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        i % 2 === 0
          ? app
              .inject({ method: 'GET', url: '/api/v1/reportes?limite=500' })
              .then((r) => ({ tipo: 'publica' as const, r }))
          : app
              .inject({
                method: 'GET',
                url: '/api/v1/tecnico/reportes?limite=500',
                cookies: { curichi_sesion: cookieTecnico },
              })
              .then((r) => ({ tipo: 'tecnica' as const, r })),
      ),
    );
    for (const { tipo, r } of respuestas) {
      expect(r.statusCode).toBe(200);
      const fs = r.json().features as Array<{ properties: Record<string, unknown> }>;
      const hayTecnica = fs.some((f) => esVistaTecnica(f.properties));
      expect(hayTecnica, tipo).toBe(tipo === 'tecnica');
    }
  });
});
