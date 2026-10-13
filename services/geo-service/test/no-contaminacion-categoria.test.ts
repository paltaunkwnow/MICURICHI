/**
 * No contaminación entre categorías en las cifras públicas de geo-service (M3.4, ADR 0012, 0013).
 *
 * Reportes verificados de DOS categorías (inundación y una sintética `bache`) en la MISMA UV y en
 * las MISMAS coordenadas. Sin parámetro `categoria`, los agregados y los puntos críticos devuelven
 * SOLO inundación. Con la categoría sintética ACTIVA (catálogo + registro inyectado), devuelven
 * solo las suyas. Una categoría inactiva, desconocida o `todas` da 400 CATEGORIA_NO_DISPONIBLE. Y
 * las cachés de cifras no mezclan valores entre categorías.
 *
 * El registro se INYECTA con `bache` (una definición propia) para ejercitar el camino multicategoría
 * sin tocar `contracts`, que hoy solo define Inundaciones.
 */
import {
  type AgregadoUv,
  CODIGO_CATEGORIA_NO_DISPONIBLE,
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
  type PuntoCritico,
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';

// Categoría sintética: la definición de inundación con otro slug. Solo importa su slug para estas
// cifras (no hay `detalle` público en agregados ni en puntos críticos).
const DEF_BACHE = {
  ...DEFINICION_INUNDACION,
  slug: 'bache',
  nombre: 'Baches (sintético)',
  nombreCorto: 'Bache',
} as DefinicionCategoriaCualquiera;

const REGISTRO_SINTETICO = crearRegistroCategorias([DEFINICION_INUNDACION, DEF_BACHE]);

const P = { lon: -63.195, lat: -17.79 }; // dentro de la UV A de las capas de prueba
const UV_A = 'unidad_vecinal:A';
const N_INUNDACION = 2;
const N_BACHE = 3;
const RADIO_M = 25;

let base: BaseEfimera;
let pool: pg.Pool;
let ex: ReturnType<typeof ejecutorPg>;
let app: FastifyInstance;

/** `n_reportes` de la UV A en una respuesta de agregados. */
function nA(filas: AgregadoUv[]): number {
  return filas.find((u) => u.unidad_vecinal_id === UV_A)!.n_reportes;
}

/** La fila de la UV A (para mirar su `categoria`). */
function filaA(filas: AgregadoUv[]): AgregadoUv {
  return filas.find((u) => u.unidad_vecinal_id === UV_A)!;
}

const getAgregados = (a: FastifyInstance, categoria?: string) =>
  a.inject({
    method: 'GET',
    url: `/geo/v1/agregados/unidades-vecinales${categoria ? `?categoria=${categoria}` : ''}`,
  });

const getPuntos = (a: FastifyInstance, categoria?: string) =>
  a.inject({
    method: 'GET',
    url: `/geo/v1/puntos-criticos${categoria ? `?categoria=${categoria}` : ''}`,
  });

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  // Verificados (validado) de dos categorías en el MISMO punto de la UV A. Distinta cantidad por
  // categoría para que una contaminación se note: inundación 2, bache 3.
  for (let k = 0; k < N_INUNDACION; k++)
    await insertarReporte(ex, P.lon, P.lat, 'validado', 'media', 'inundacion');
  for (let k = 0; k < N_BACHE; k++)
    await insertarReporte(ex, P.lon, P.lat, 'validado', 'media', 'bache');
  // DBSCAN con radio explícito para TODAS las categorías (no hace falta la definición de `bache` en
  // el registro de recálculo): cada categoría forma su propio punto crítico, nunca uno mezclado.
  await recalcularPuntosCriticos(ex, RADIO_M);
  app = await crearApp({
    pool,
    cfg: leerConfig({ DATABASE_URL: base.url }),
    registro: REGISTRO_SINTETICO,
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

describe('sin parámetro, las cifras son SOLO de inundación', () => {
  it('agregados: la UV A cuenta solo las inundaciones, con categoria = inundacion', async () => {
    const r = await getAgregados(app);
    expect(r.statusCode).toBe(200);
    const filas = r.json() as AgregadoUv[];
    expect(nA(filas)).toBe(N_INUNDACION);
    expect(filaA(filas).categoria).toBe('inundacion');
  });

  it('puntos críticos: solo el de inundación (n_reportes = 2), ninguno de bache', async () => {
    const r = await getPuntos(app);
    expect(r.statusCode).toBe(200);
    const puntos = r.json() as PuntoCritico[];
    expect(puntos.length).toBeGreaterThan(0);
    for (const p of puntos) expect(p.categoria).toBe('inundacion');
    expect(puntos.some((p) => p.n_reportes === N_INUNDACION)).toBe(true);
    expect(puntos.some((p) => p.n_reportes === N_BACHE)).toBe(false);
  });
});

describe('una categoría inactiva, desconocida o `todas` da 400 CATEGORIA_NO_DISPONIBLE', () => {
  it('agregados: bache (conocida pero inactiva en el catálogo)', async () => {
    const r = await getAgregados(app, 'bache');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
  });

  it('agregados: una categoría desconocida', async () => {
    const r = await getAgregados(app, 'noexiste');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
  });

  it('agregados y puntos: `todas` no se admite en una ruta pública', async () => {
    expect((await getAgregados(app, 'todas')).statusCode).toBe(400);
    expect((await getPuntos(app, 'todas')).statusCode).toBe(400);
  });

  it('puntos críticos: bache inactiva', async () => {
    const r = await getPuntos(app, 'bache');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
  });
});

describe('con la categoría sintética ACTIVA (catálogo + registro), las cifras son solo las suyas', () => {
  beforeAll(async () => {
    await ex.consultar(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
    app.categorias.invalidar(); // el catálogo cambió: que la caché corta del proveedor lo vea ya.
  });
  afterAll(async () => {
    await ex.consultar(`UPDATE categoria SET activa = false WHERE slug = 'bache'`);
    app.categorias.invalidar();
  });

  it('agregados ?categoria=bache: la UV A cuenta solo los baches, con categoria = bache', async () => {
    const r = await getAgregados(app, 'bache');
    expect(r.statusCode).toBe(200);
    const filas = r.json() as AgregadoUv[];
    expect(nA(filas)).toBe(N_BACHE);
    expect(filaA(filas).categoria).toBe('bache');
  });

  it('puntos críticos ?categoria=bache: solo el de bache (n_reportes = 3)', async () => {
    const r = await getPuntos(app, 'bache');
    expect(r.statusCode).toBe(200);
    const puntos = r.json() as PuntoCritico[];
    expect(puntos.length).toBeGreaterThan(0);
    for (const p of puntos) expect(p.categoria).toBe('bache');
    expect(puntos.some((p) => p.n_reportes === N_BACHE)).toBe(true);
    expect(puntos.some((p) => p.n_reportes === N_INUNDACION)).toBe(false);
  });

  it('las cachés de agregados no se mezclan entre categorías', async () => {
    // App propia para aislar el estado de caché de las demás pruebas del archivo.
    const propia = await crearApp({
      pool,
      cfg: leerConfig({ DATABASE_URL: base.url }),
      registro: REGISTRO_SINTETICO,
    });
    try {
      const i1 = await getAgregados(propia, 'inundacion');
      expect(i1.headers['x-cache']).toBe('miss');
      expect(nA(i1.json())).toBe(N_INUNDACION);
      const i2 = await getAgregados(propia, 'inundacion');
      expect(i2.headers['x-cache']).toBe('hit');
      expect(nA(i2.json())).toBe(N_INUNDACION);

      // Con inundación ya cacheada, bache es un MISS (celda propia) y trae SU cifra, no la de inundación.
      const b1 = await getAgregados(propia, 'bache');
      expect(b1.headers['x-cache']).toBe('miss');
      expect(nA(b1.json())).toBe(N_BACHE);
      const b2 = await getAgregados(propia, 'bache');
      expect(b2.headers['x-cache']).toBe('hit');
      expect(nA(b2.json())).toBe(N_BACHE);

      // Y la de inundación sigue valiendo lo suyo: ninguna celda pisó a la otra.
      const i3 = await getAgregados(propia, 'inundacion');
      expect(i3.headers['x-cache']).toBe('hit');
      expect(nA(i3.json())).toBe(N_INUNDACION);
    } finally {
      await propia.close();
    }
  });

  it('las cachés de puntos críticos no se mezclan entre categorías', async () => {
    const propia = await crearApp({
      pool,
      cfg: leerConfig({ DATABASE_URL: base.url }),
      registro: REGISTRO_SINTETICO,
    });
    try {
      const i1 = await getPuntos(propia, 'inundacion');
      expect(i1.headers['x-cache']).toBe('miss');
      const puntosI = i1.json() as PuntoCritico[];
      for (const p of puntosI) expect(p.categoria).toBe('inundacion');

      const b1 = await getPuntos(propia, 'bache');
      // Celda propia: MISS aunque inundación ya esté cacheada, y solo baches.
      expect(b1.headers['x-cache']).toBe('miss');
      const puntosB = b1.json() as PuntoCritico[];
      expect(puntosB.length).toBeGreaterThan(0);
      for (const p of puntosB) expect(p.categoria).toBe('bache');

      const i2 = await getPuntos(propia, 'inundacion');
      expect(i2.headers['x-cache']).toBe('hit');
      for (const p of i2.json() as PuntoCritico[]) expect(p.categoria).toBe('inundacion');
    } finally {
      await propia.close();
    }
  });
});
