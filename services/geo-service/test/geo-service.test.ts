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

async function resolver(lat: number, lon: number) {
  const r = await app.inject({ method: 'POST', url: '/geo/v1/resolver', payload: { lat, lon } });
  expect(r.statusCode).toBe(200);
  return r.json();
}

describe('POST /geo/v1/resolver (§7.4)', () => {
  it('punto interior → UV y distrito correctos, sin banderas', async () => {
    const r = await resolver(-17.79, -63.195);
    expect(r.dentro_cobertura).toBe(true);
    expect(r.unidad_vecinal.id).toBe('unidad_vecinal:A');
    expect(r.distrito.id).toBe('distrito_municipal:01');
    expect(r.en_limite).toBe(false);
    expect(r.asignado_por_proximidad).toBe(false);
    expect(r.version_capa).toBe('test');
  });
  it('punto dentro de la manzana la informa', async () => {
    const r = await resolver(-17.797, -63.197);
    expect(r.manzana?.id).toBe('manzana:A-1');
  });
  it('punto sobre el borde A|B → determinista (menor id) y en_limite', async () => {
    const r = await resolver(-17.79, -63.19);
    expect(r.unidad_vecinal.id).toBe('unidad_vecinal:A');
    expect(r.en_limite).toBe(true);
  });
  it('punto en el hueco entre B y C → UV más cercana por proximidad con distancia', async () => {
    const r = await resolver(-17.79, -63.17985); // ~16 m de B (que termina en −63.18)
    expect(r.dentro_cobertura).toBe(true);
    expect(r.asignado_por_proximidad).toBe(true);
    expect(r.distancia_m).toBeGreaterThan(0);
    expect(r.distancia_m).toBeLessThanOrEqual(20);
  });
  it('punto lejos → fuera de cobertura', async () => {
    const r = await resolver(-17.5, -63.0);
    expect(r.dentro_cobertura).toBe(false);
    expect(r.unidad_vecinal).toBeNull();
  });
  it('rechaza coordenadas inválidas', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/geo/v1/resolver',
      payload: { lat: 95, lon: 0 },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('capas, teselas y agregados', () => {
  it('informa versiones vigentes y sirve GeoJSON con ETag', async () => {
    const v = await app.inject({ method: 'GET', url: '/geo/v1/capas/vigentes' });
    expect(v.json().unidad_vecinal).toBe('test');
    const c = await app.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' });
    expect(c.statusCode).toBe(200);
    expect(c.headers.etag).toBe('"unidad_vecinal-test"');
    expect(c.json().features).toHaveLength(3);
    const info = await app.inject({ method: 'GET', url: '/geo/v1/capas' });
    expect(info.json().map((x: { capa: string }) => x.capa)).toEqual([
      'distrito_municipal',
      'unidad_vecinal',
      'manzana',
    ]);
  });
  it('genera teselas MVT al vuelo y 204 en vacías', async () => {
    // tesela z=14 que contiene −63.19,−17.79
    const z = 14;
    const x = Math.floor(((-63.19 + 180) / 360) * 2 ** z);
    const latRad = (-17.79 * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
    );
    const t = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${z}/${x}/${y}.mvt`,
    });
    expect(t.statusCode).toBe(200);
    expect(t.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
    expect(t.rawPayload.length).toBeGreaterThan(20);
    const vacia = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${z}/0/0.mvt`,
    });
    expect(vacia.statusCode).toBe(204);
  });
  it('agrega reportes validados por UV y lista puntos críticos', async () => {
    const ex = ejecutorPg(pool);
    await insertarReporte(ex, -63.195, -17.79, 'validado', 'alta');
    await insertarReporte(ex, -63.19502, -17.79001, 'validado', 'baja');
    await insertarReporte(ex, -63.195, -17.795, 'nuevo', 'critica');
    await recalcularPuntosCriticos(ex);
    const a = await app.inject({ method: 'GET', url: '/geo/v1/agregados/unidades-vecinales' });
    const uvA = a
      .json()
      .find((u: { unidad_vecinal_id: string }) => u.unidad_vecinal_id === 'unidad_vecinal:A');
    expect(uvA.n_reportes).toBe(2);
    expect(uvA.severidad_max).toBe('alta');
    const pc = await app.inject({
      method: 'GET',
      url: '/geo/v1/puntos-criticos?bbox=-63.3,-17.9,-63.1,-17.7',
    });
    expect(pc.statusCode).toBe(200);
    expect(pc.json()[0].n_reportes).toBe(2);
    const malo = await app.inject({ method: 'GET', url: '/geo/v1/puntos-criticos?bbox=1,2,3' });
    expect(malo.statusCode).toBe(400);
  });
});
