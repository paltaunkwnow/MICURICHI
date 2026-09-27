/**
 * S30 (contrato 0.12.0): capas y teselas con la huella del contenido servido, y cifras públicas
 * con 120 s de antigüedad como máximo. Base propia: estas pruebas cambian una capa y mueven el
 * reloj, y no tienen que arrastrar a las demás.
 */
import { createHash } from 'node:crypto';
import {
  CapaInfoSchema,
  CODIGO_CAPA_CAMBIO,
  HuellaCapaSchema,
  rutaCapaConHuella,
  rutaTeselasConHuella,
} from 'contracts';
import { ejecutorPg, recalcularPuntosCriticos } from 'db';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  await cargarCapasDePrueba(ejecutorPg(pool));
  app = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

afterEach(() => {
  vi.useRealTimers();
});

const INMUTABLE = 'public, max-age=31536000, immutable';
const SIN_CACHE_VIEJA = 'public, no-cache';

function huellaDe(texto: string): string {
  return createHash('sha256').update(texto).digest('hex').slice(0, 16);
}

/** Tesela z/x/y que contiene el punto (misma cuenta que usa MapLibre). */
function teselaDe(lon: number, lat: number, z: number) {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
  );
  return { z, x, y };
}

async function infoCapas(a: FastifyInstance = app) {
  const r = await a.inject({ method: 'GET', url: '/geo/v1/capas' });
  expect(r.statusCode).toBe(200);
  return { respuesta: r, capas: z.array(CapaInfoSchema).parse(r.json()) };
}

async function urlDe(capa: string, a: FastifyInstance = app): Promise<string> {
  const { capas } = await infoCapas(a);
  const c = capas.find((x) => x.capa === capa);
  expect(c, `falta ${capa} en /geo/v1/capas`).toBeDefined();
  return c!.url;
}

/**
 * Mueve el reloj de Date (solo Date: los temporizadores y la base siguen con la hora real). El
 * desfase se acumula entre pruebas: las cachés de la app compartida guardan marcas de tiempo
 * simuladas, y volver atrás las dejaría «frescas» de más.
 */
let desfaseMs = 0;
function adelantar(ms: number) {
  desfaseMs += ms;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(vi.getRealSystemTime() + desfaseMs);
}

describe('capas con la huella del contenido servido (S30)', () => {
  it('CapaInfo.url lleva la huella del GeoJSON que se sirve, y /capas y /capas/vigentes van con public, no-cache', async () => {
    const { respuesta, capas } = await infoCapas();
    expect(respuesta.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
    const alias = await app.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' });
    const huella = HuellaCapaSchema.parse(huellaDe(alias.body));
    const uv = capas.find((c) => c.capa === 'unidad_vecinal');
    expect(uv?.modo).toBe('geojson');
    expect(uv?.url).toBe(rutaCapaConHuella('unidad_vecinal', huella));
    for (const c of capas) expect(c.url).toMatch(/\/v\/[0-9a-f]{16}$/);

    const vigentes = await app.inject({ method: 'GET', url: '/geo/v1/capas/vigentes' });
    expect(vigentes.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
    expect(vigentes.json().unidad_vecinal).toBe('test');
  });

  it('con la huella vigente: immutable por un año, con ETag, y 304 si no cambió', async () => {
    const url = await urlDe('unidad_vecinal');
    const r = await app.inject({ method: 'GET', url });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe(INMUTABLE);
    expect(r.headers['content-type']).toMatch(/^application\/geo\+json/);
    expect(r.json().features).toHaveLength(3);
    const etag = r.headers.etag as string;
    expect(etag).toBeTruthy();

    const otra = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(otra.statusCode).toBe(304);
    expect(otra.body).toBe('');
    expect(otra.headers.etag).toBe(etag);
    expect(otra.headers['cache-control']).toBe(INMUTABLE);
  });

  it('con una huella que no es la vigente: 410 CAPA_CAMBIO con no-store', async () => {
    const r = await app.inject({
      method: 'GET',
      url: rutaCapaConHuella('unidad_vecinal', '0123456789abcdef'),
    });
    expect(r.statusCode).toBe(410);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json().codigo).toBe(CODIGO_CAPA_CAMBIO);
    // Aunque el navegador mande un ETag viejo, una huella vieja nunca da 304.
    const conEtag = await app.inject({
      method: 'GET',
      url: rutaCapaConHuella('unidad_vecinal', '0123456789abcdef'),
      headers: { 'if-none-match': '*' },
    });
    expect(conEtag.statusCode).toBe(410);
  });

  it('una huella malformada o una capa desconocida dan 404', async () => {
    const mala = await app.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal/v/XYZ' });
    expect(mala.statusCode).toBe(404);
    const capa = await app.inject({ method: 'GET', url: '/geo/v1/capas/otra/v/0123456789abcdef' });
    expect(capa.statusCode).toBe(404);
  });

  it('el alias sin huella sirve lo mismo con public, no-cache y el mismo ETag', async () => {
    const url = await urlDe('unidad_vecinal');
    const conHuella = await app.inject({ method: 'GET', url });
    const alias = await app.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' });
    expect(alias.statusCode).toBe(200);
    expect(alias.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
    expect(alias.body).toBe(conHuella.body);
    expect(alias.headers.etag).toBe(conHuella.headers.etag);
  });

  it('teselas con huella: immutable; con una huella vieja, 410; el alias, public, no-cache', async () => {
    const url = await urlDe('unidad_vecinal');
    const huella = url.split('/').pop()!;
    const { z: tz, x, y } = teselaDe(-63.19, -17.79, 14);
    const conHuella = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${huella}/${tz}/${x}/${y}.mvt`,
    });
    expect(conHuella.statusCode).toBe(200);
    expect(conHuella.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
    expect(conHuella.headers['cache-control']).toBe(INMUTABLE);
    const etag = conHuella.headers.etag as string;
    const repetida = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${huella}/${tz}/${x}/${y}.mvt`,
      headers: { 'if-none-match': etag },
    });
    expect(repetida.statusCode).toBe(304);

    const vieja = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/0123456789abcdef/${tz}/${x}/${y}.mvt`,
    });
    expect(vieja.statusCode).toBe(410);
    expect(vieja.headers['cache-control']).toBe('no-store');
    expect(vieja.json().codigo).toBe(CODIGO_CAPA_CAMBIO);

    const alias = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${tz}/${x}/${y}.mvt`,
    });
    expect(alias.statusCode).toBe(200);
    expect(alias.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
    expect(alias.rawPayload.equals(conHuella.rawPayload)).toBe(true);

    const malformada = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/NOHEX/${tz}/${x}/${y}.mvt`,
    });
    expect(malformada.statusCode).toBe(400);
  });

  it('en modo teselas, CapaInfo.url y el 413 dan la plantilla de teselas con huella', async () => {
    const chica = await crearApp({
      pool,
      cfg: { ...leerConfig({ DATABASE_URL: base.url }), umbralTeselasBytes: 10 },
    });
    try {
      const alias = await chica.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' });
      expect(alias.statusCode).toBe(413);
      const { capas } = await infoCapas(chica);
      const uv = capas.find((c) => c.capa === 'unidad_vecinal')!;
      expect(uv.modo).toBe('teselas');
      const huella = uv.url.split('/')[5]!;
      expect(uv.url).toBe(rutaTeselasConHuella('unidad_vecinal', HuellaCapaSchema.parse(huella)));
      expect(alias.json().url).toBe(uv.url);
      const conHuella = await chica.inject({
        method: 'GET',
        url: rutaCapaConHuella('unidad_vecinal', huella),
      });
      expect(conHuella.statusCode).toBe(413);
      expect(conHuella.json().url).toBe(uv.url);
    } finally {
      await chica.close();
    }
  });

  it('recargar la misma versión con el mismo contenido no cambia la huella', async () => {
    const antes = await urlDe('unidad_vecinal');
    await pool.query(
      "UPDATE geo.capa_version SET cargado_en = now() WHERE capa = 'unidad_vecinal' AND vigente",
    );
    adelantar(11_000);
    expect(await urlDe('unidad_vecinal')).toBe(antes);
    expect((await app.inject({ method: 'GET', url: antes })).statusCode).toBe(200);
  });

  it('recargar la misma versión con otro contenido cambia la huella, y la vieja da 410', async () => {
    const vieja = await urlDe('unidad_vecinal');
    // Lo que hace el ETL al recargar una versión: reemplaza las filas y actualiza cargado_en.
    await pool.query(
      "UPDATE geo.unidad_vecinal SET nombre = 'UV A (recargada)' WHERE id = 'unidad_vecinal:A' AND version_capa = 'test'",
    );
    await pool.query(
      "UPDATE geo.capa_version SET cargado_en = now() WHERE capa = 'unidad_vecinal' AND vigente",
    );
    try {
      adelantar(11_000);
      const nueva = await urlDe('unidad_vecinal');
      expect(nueva).not.toBe(vieja);
      const r = await app.inject({ method: 'GET', url: nueva });
      expect(r.statusCode).toBe(200);
      expect(r.body).toContain('UV A (recargada)');
      expect(nueva).toBe(rutaCapaConHuella('unidad_vecinal', huellaDe(r.body)));
      const v = await app.inject({ method: 'GET', url: vieja });
      expect(v.statusCode).toBe(410);
      expect(v.headers['cache-control']).toBe('no-store');
    } finally {
      await pool.query(
        "UPDATE geo.unidad_vecinal SET nombre = 'UV A (test)' WHERE id = 'unidad_vecinal:A' AND version_capa = 'test'",
      );
    }
  });
});

describe('cifras públicas con 120 s como máximo (S30)', () => {
  function nA(lista: Array<{ unidad_vecinal_id: string; n_reportes: number }>) {
    return lista.find((u) => u.unidad_vecinal_id === 'unidad_vecinal:A')!.n_reportes;
  }

  it('agregados: public, no-cache; la copia dura 100 s y a los 121 s simulados se recalcula', async () => {
    const propia = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
    try {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
      const primera = await propia.inject({
        method: 'GET',
        url: '/geo/v1/agregados/unidades-vecinales',
      });
      expect(primera.statusCode).toBe(200);
      expect(primera.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
      expect(primera.headers['x-cache']).toBe('miss');
      const antes = nA(primera.json());

      await insertarReporte(ejecutorPg(pool), -63.195, -17.79, 'validado', 'media');

      vi.setSystemTime(Date.now() + 99_000);
      const a99 = await propia.inject({
        method: 'GET',
        url: '/geo/v1/agregados/unidades-vecinales',
      });
      expect(a99.headers['x-cache']).toBe('hit');
      expect(nA(a99.json())).toBe(antes);

      vi.setSystemTime(Date.now() + 22_000); // 121 s desde la primera
      const a121 = await propia.inject({
        method: 'GET',
        url: '/geo/v1/agregados/unidades-vecinales',
      });
      expect(a121.headers['x-cache']).toBe('miss');
      expect(a121.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
      expect(nA(a121.json())).toBe(antes + 1);
    } finally {
      await propia.close();
    }
  });

  it('agregados: entre 100 y 120 s sirve la copia y recalcula por detrás', async () => {
    const propia = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
    try {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
      const primera = await propia.inject({
        method: 'GET',
        url: '/geo/v1/agregados/unidades-vecinales',
      });
      const antes = nA(primera.json());
      await insertarReporte(ejecutorPg(pool), -63.195, -17.79, 'validado', 'media');

      vi.setSystemTime(Date.now() + 101_000);
      const vieja = await propia.inject({
        method: 'GET',
        url: '/geo/v1/agregados/unidades-vecinales',
      });
      expect(vieja.headers['x-cache']).toBe('stale');
      expect(nA(vieja.json())).toBe(antes);

      await vi.waitFor(async () => {
        const r = await propia.inject({
          method: 'GET',
          url: '/geo/v1/agregados/unidades-vecinales',
        });
        expect(r.headers['x-cache']).toBe('hit');
        expect(nA(r.json())).toBe(antes + 1);
      });
    } finally {
      await propia.close();
    }
  });

  it('puntos críticos: public, no-cache, la misma regla de 100 y 120 s, y el bbox se sigue respetando', async () => {
    const propia = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
    const bboxB = '-63.19,-17.8,-63.18,-17.78';
    try {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
      const primera = await propia.inject({
        method: 'GET',
        url: `/geo/v1/puntos-criticos?bbox=${bboxB}`,
      });
      expect(primera.statusCode).toBe(200);
      expect(primera.headers['cache-control']).toBe(SIN_CACHE_VIEJA);
      expect(primera.json()).toEqual([]);

      const ex = ejecutorPg(pool);
      for (const [lon, lat] of [
        [-63.185, -17.79],
        [-63.18501, -17.79001],
      ] as const) {
        const id = await insertarReporte(ex, lon, lat, 'validado', 'alta');
        await pool.query(
          "UPDATE reporte_inundacion SET unidad_vecinal_id = 'unidad_vecinal:B' WHERE id = $1",
          [id],
        );
      }
      await recalcularPuntosCriticos(ex);

      vi.setSystemTime(Date.now() + 99_000);
      const a99 = await propia.inject({
        method: 'GET',
        url: `/geo/v1/puntos-criticos?bbox=${bboxB}`,
      });
      expect(a99.headers['x-cache']).toBe('hit');
      expect(a99.json()).toEqual([]);

      vi.setSystemTime(Date.now() + 22_000);
      const a121 = await propia.inject({
        method: 'GET',
        url: `/geo/v1/puntos-criticos?bbox=${bboxB}`,
      });
      expect(a121.headers['x-cache']).toBe('miss');
      const enB = a121.json() as Array<{ lon: number; lat: number; n_reportes: number }>;
      expect(enB).toHaveLength(1);
      expect(enB[0]!.n_reportes).toBe(2);
      for (const p of enB) {
        expect(p.lon).toBeGreaterThanOrEqual(-63.19);
        expect(p.lon).toBeLessThanOrEqual(-63.18);
      }

      // Sin bbox salen todos (los de la UV A de las pruebas anteriores también), del mismo cálculo.
      const todos = await propia.inject({ method: 'GET', url: '/geo/v1/puntos-criticos' });
      expect(todos.headers['x-cache']).toBe('hit');
      expect((todos.json() as unknown[]).length).toBeGreaterThan(enB.length);
    } finally {
      await propia.close();
    }
  });
});
