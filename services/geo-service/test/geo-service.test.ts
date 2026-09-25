import { CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES } from 'contracts';
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
  it('punto en el hueco pero MÁS ALLÁ de la tolerancia → fuera de cobertura', async () => {
    // El hueco entre B (termina en −63,18) y C (empieza en −63,1795) mide unos 53 m. Este punto
    // está a ~25 m de B: dentro del prefiltro por índice que usa el resolver (que trabaja en
    // grados y es a propósito más ancho, ~40 m) pero fuera de los 20 m de tolerancia real.
    // Si alguien quitara la comprobación exacta en metros por «simplificar», este caso pasaría a
    // asignarse a B y el reporte quedaría en una unidad vecinal que no le toca.
    const r = await resolver(-17.79, -63.179764);
    expect(r.asignado_por_proximidad).toBe(false);
    expect(r.dentro_cobertura).toBe(false);
    expect(r.unidad_vecinal).toBeNull();
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

  /**
   * `radio_m`, `diametro_m` y `advertencia_diametro` se calculan sobre las coordenadas EXACTAS de
   * los miembros del grupo: `diametro_m` es la distancia entre los dos más separados, redondeada a
   * 0,1 m. Esta ruta es pública y publica el centroide ya degradado, así que soltar además una
   * medida exacta sobre las posiciones reales es dar una ecuación que acota dónde están de verdad
   * (CLAUDE.md §13, dato mínimo). Siguen en la tabla para el análisis del técnico (§9.2).
   */
  it('no publica ninguna medida derivada de la geometría exacta', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/geo/v1/puntos-criticos?bbox=-63.3,-17.9,-63.1,-17.7',
    });
    expect(r.statusCode).toBe(200);
    const puntos = r.json() as Array<Record<string, unknown>>;
    expect(puntos.length).toBeGreaterThan(0);
    for (const p of puntos)
      for (const campo of CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES)
        expect(p, `«${campo}» no puede salir por una ruta pública`).not.toHaveProperty(campo);
    // Y el cuerpo entero, por si algún día vuelven con otro nombre en un objeto anidado.
    for (const campo of CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES) expect(r.body).not.toContain(campo);
  });

  it('sigue publicando lo que el mapa necesita', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/geo/v1/puntos-criticos?bbox=-63.3,-17.9,-63.1,-17.7',
    });
    const [p] = r.json() as Array<Record<string, unknown>>;
    for (const campo of [
      'id',
      'lat',
      'lon',
      'n_reportes',
      'severidad_max',
      'unidad_vecinal_id',
      'calculado_en',
    ])
      expect(p).toHaveProperty(campo);
  });
});

describe('ruta interna /geo/v1/capas/invalidar', () => {
  it('sin token configurado solo la acepta desde loopback', async () => {
    const r = await app.inject({ method: 'POST', url: '/geo/v1/capas/invalidar' });
    expect(r.statusCode).toBe(200);
    // remoteAddress falsificado: una petición que no venga de la propia máquina se rechaza.
    const fuera = await app.inject({
      method: 'POST',
      url: '/geo/v1/capas/invalidar',
      remoteAddress: '203.0.113.7',
    });
    expect(fuera.statusCode).toBe(403);
  });

  it('con token configurado exige la cabecera correcta', async () => {
    const conToken = await crearApp({
      pool,
      cfg: { ...leerConfig({ DATABASE_URL: base.url }), tokenInterno: 'secreto-compartido' },
    });
    const sin = await conToken.inject({ method: 'POST', url: '/geo/v1/capas/invalidar' });
    expect(sin.statusCode).toBe(403);
    const malo = await conToken.inject({
      method: 'POST',
      url: '/geo/v1/capas/invalidar',
      headers: { 'x-token-interno': 'otro' },
    });
    expect(malo.statusCode).toBe(403);
    const bueno = await conToken.inject({
      method: 'POST',
      url: '/geo/v1/capas/invalidar',
      headers: { 'x-token-interno': 'secreto-compartido' },
    });
    expect(bueno.statusCode).toBe(200);
    await conToken.close();
  });
});

describe('caché de capas', () => {
  it('varias peticiones simultáneas de una capa fría hacen UNA sola carga', async () => {
    app.capas.invalidar();
    const antes = (await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM geo.manzana'))
      .rows[0]!.n;
    expect(Number(antes)).toBeGreaterThan(0);
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () => app.capas.obtener('unidad_vecinal')),
    );
    // Todas comparten exactamente el mismo objeto: una única construcción del índice.
    for (const r of respuestas) expect(r).toBe(respuestas[0]);
  });
});
