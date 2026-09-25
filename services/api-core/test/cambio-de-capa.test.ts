/**
 * Qué pasa con los reportes ya creados cuando el municipio activa una entrega de capas NUEVA.
 *
 * Es el caso real de la Fase 6: la base traía las capas sintéticas, se cargó y activó
 * DM_UV_MZ_2025, y los reportes anteriores —cuya geometría no cambió— pasaron a mostrar
 * «unidad_vecinal:UV-105» en lugar del nombre de su barrio, porque la consulta unía contra la
 * vista vigente y la vista vigente ya no los conocía.
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
let cookieVecina: string;
let idReporte: string;
let ex: ReturnType<typeof ejecutorPg>;

/** Crea un reporte como vecina devolviéndole antes el turno: aquí se prueba otra cosa. */
async function crear(payload: Record<string, unknown> = reporteValido) {
  await liberarCuota(ex);
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
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
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);

  const creado = await crear();
  expect(creado.statusCode).toBe(201);
  idReporte = creado.json().id;
  await app.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${idReporte}/estado`,
    payload: { estado: 'validado' },
    cookies: { curichi_sesion: cookieTecnico },
  });

  // Entrega nueva: mismas geometrías, otros códigos, y pasa a ser la vigente.
  const cuadrado = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [-63.3, -17.9],
        [-63.0, -17.9],
        [-63.0, -17.7],
        [-63.3, -17.7],
        [-63.3, -17.9],
      ],
    ],
  });
  await ex.consultar(
    `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa)
     VALUES ('distrito_municipal:99', '99', 'Distrito Noventa y Nueve', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), '2027-01')`,
    [cuadrado],
  );
  await ex.consultar(
    `INSERT INTO geo.unidad_vecinal (id, codigo, nombre, geom, version_capa, distrito_id)
     VALUES ('unidad_vecinal:Z', 'Z', 'UV Zeta (entrega nueva)', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), '2027-01', 'distrito_municipal:99')`,
    [cuadrado],
  );
  for (const capa of ['distrito_municipal', 'unidad_vecinal']) {
    await ex.consultar('UPDATE geo.capa_version SET vigente = false WHERE capa = $1', [capa]);
    await ex.consultar(
      `INSERT INTO geo.capa_version (capa, version, n_features, vigente) VALUES ($1, '2027-01', 1, true)`,
      [capa],
    );
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

describe('activar una versión de capa nueva no deja sin nombre a los reportes viejos', () => {
  it('la vista pública sigue mostrando el nombre de la capa con la que se resolvió', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/v1/reportes/${idReporte}` });
    expect(r.statusCode).toBe(200);
    const p = r.json().properties;
    expect(p.unidad_vecinal.id).toBe('unidad_vecinal:A');
    expect(p.unidad_vecinal.nombre).toBe('UV A (test)');
    // Lo que se veía antes del arreglo: el id repetido como nombre.
    expect(p.unidad_vecinal.nombre).not.toContain('unidad_vecinal:');
    expect(p.distrito.nombre).toBe('Distrito Uno (test)');
  });

  it('los indicadores del panel tampoco pierden el nombre', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/indicadores',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode).toBe(200);
    const uv = r
      .json()
      .por_unidad_vecinal.find(
        (x: { unidad_vecinal_id: string }) => x.unidad_vecinal_id === 'unidad_vecinal:A',
      );
    expect(uv?.nombre).toBe('UV A (test)');
  });

  it('un reporte nuevo se resuelve contra la versión vigente', async () => {
    const r = await crear();
    expect(r.statusCode).toBe(201);
    // El resolver de prueba devuelve siempre la UV A: lo que importa acá es que la respuesta
    // sale con nombre y no con el id, sea cual sea la versión.
    expect(r.json().properties.unidad_vecinal.nombre).not.toContain('unidad_vecinal:');
  });
});
