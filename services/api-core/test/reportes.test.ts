import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { crearUsuarios, reporteValido, resolverDePrueba } from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieTecnico: string;
let cookieAdmin: string;

async function login(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'contrasena-test-123' },
  });
  expect(r.statusCode).toBe(200);
  return r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  const ex = ejecutorPg(pool);
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
  cookieTecnico = await login('tecnico@test.local');
  cookieAdmin = await login('admin@test.local');
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

describe('camino crítico: crear → resolver UV → severidad → nuevo', () => {
  let id: string;
  it('crea el reporte con UV resuelta y severidad calculada', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/reportes', payload: reporteValido });
    expect(r.statusCode).toBe(201);
    const f = r.json();
    id = f.id;
    expect(f.properties.unidad_vecinal.id).toBe('unidad_vecinal:A');
    expect(f.properties.distrito.id).toBe('distrito_municipal:01');
    expect(f.properties.estado).toBe('nuevo');
    // rodilla(2)*2 + 2h_12h(3) + cada_lluvia_fuerte(3) + ingreso_viviendas(3) = 13 → alta; E2 aplica pero ya es alta
    expect(f.properties.severidad_calculada).toBe('alta');
    expect(f.geometry.coordinates).toEqual([-63.195, -17.79]);
  });
  it('no publica reportes nuevos en el listado público ni en el detalle', async () => {
    const lista = await app.inject({ method: 'GET', url: '/api/v1/reportes' });
    expect(lista.json().features.map((x: { id: string }) => x.id)).not.toContain(id);
    const det = await app.inject({ method: 'GET', url: `/api/v1/reportes/${id}` });
    expect(det.statusCode).toBe(404);
  });
  it('el técnico sí lo ve, con coordenada exacta y campos de moderación', async () => {
    const det = await app.inject({
      method: 'GET',
      url: `/api/v1/reportes/${id}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(det.statusCode).toBe(200);
    expect(det.json().properties.severidad_puntaje).toBe(13);
    expect(det.json().properties.resolucion_flags).toEqual({
      en_limite: false,
      asignado_por_proximidad: false,
      distancia_m: null,
      distrito_discrepante: false,
    });
  });
  it('sin sesión no se puede moderar; con sesión se valida y aparece en público', async () => {
    const sin = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload: { estado: 'validado' },
    });
    expect(sin.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload: { estado: 'validado' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().properties.estado).toBe('validado');
    expect(ok.json().properties.validado_por).toBeTruthy();
    const pub = await app.inject({ method: 'GET', url: '/api/v1/reportes' });
    expect(pub.json().features.map((x: { id: string }) => x.id)).toContain(id);
    expect(pub.json().features[0].properties.punto_critico_id).toBeTruthy();
  });
  it('respeta la máquina de estados (validado → nuevo no existe; rechazado requiere motivo; reabrir es de admin)', async () => {
    const mal = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload: { estado: 'nuevo' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(mal.statusCode).toBe(409);
    const otro = (
      await app.inject({ method: 'POST', url: '/api/v1/reportes', payload: reporteValido })
    ).json().id as string;
    const sinMotivo = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${otro}/estado`,
      payload: { estado: 'rechazado' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(sinMotivo.statusCode).toBe(400);
    const rechazo = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${otro}/estado`,
      payload: { estado: 'rechazado', estado_motivo: 'Fuera del municipio' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(rechazo.statusCode).toBe(200);
    const reabrirTecnico = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${otro}/estado`,
      payload: { estado: 'nuevo', estado_motivo: 'Reapertura' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(reabrirTecnico.statusCode).toBe(409);
    const reabrirAdmin = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${otro}/estado`,
      payload: { estado: 'nuevo', estado_motivo: 'Reapertura' },
      cookies: { curichi_sesion: cookieAdmin },
    });
    expect(reabrirAdmin.statusCode).toBe(200);
  });
  it('fusiona duplicados y reclasifica severidad con motivo', async () => {
    const dup = (
      await app.inject({ method: 'POST', url: '/api/v1/reportes', payload: reporteValido })
    ).json().id as string;
    const f = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${dup}/fusionar`,
      payload: { canonico_id: id, motivo: 'Mismo charco' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(f.statusCode).toBe(200);
    expect(f.json().properties.estado).toBe('duplicado');
    expect(f.json().properties.fusionado_en_id).toBe(id);
    const sinMotivo = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/severidad`,
      payload: { severidad_manual: 'critica' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(sinMotivo.statusCode).toBe(400);
    const re = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/severidad`,
      payload: { severidad_manual: 'critica', severidad_motivo: 'Inspección en campo' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(re.statusCode).toBe(200);
    expect(re.json().properties.severidad).toBe('critica');
    expect(re.json().properties.severidad_calculada).toBe('alta');
  });
});

describe('validación, cobertura, privacidad y exportación', () => {
  it('rechaza payloads inválidos y el honeypot', async () => {
    const corto = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: { ...reporteValido, descripcion: 'agua' },
    });
    expect(corto.statusCode).toBe(400);
    expect(corto.json().detalles[0].campo).toBe('descripcion');
    const bot = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: { ...reporteValido, sitio_web: 'http://spam' },
    });
    expect(bot.statusCode).toBe(400);
  });
  it('rechaza puntos fuera de cobertura con 422', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: { ...reporteValido, lat: -17.5, lon: -63.0 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().codigo).toBe('FUERA_DE_COBERTURA');
  });
  it('degrada la precisión en público cuando la ubicación es una vivienda, pero no para el técnico', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: {
        ...reporteValido,
        ubicacion_tipo: 'vivienda_o_predio',
        lat: -17.791,
        lon: -63.196,
      },
    });
    const idCasa = c.json().id;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${idCasa}/estado`,
      payload: { estado: 'validado' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    const pub = (await app.inject({ method: 'GET', url: `/api/v1/reportes/${idCasa}` })).json();
    expect(pub.properties.precision_degradada).toBe(true);
    expect(pub.geometry.coordinates).not.toEqual([-63.196, -17.791]);
    const tec = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/reportes/${idCasa}`,
        cookies: { curichi_sesion: cookieTecnico },
      })
    ).json();
    expect(tec.properties.precision_degradada).toBe(false);
    expect(tec.geometry.coordinates).toEqual([-63.196, -17.791]);
    expect(pub.properties).not.toHaveProperty('autor_id');
  });
  it('exporta GeoJSON y CSV con nota metodológica solo para técnicos', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/exportar?formato=csv' });
    expect(anon.statusCode).toBe(401);
    const geo = await app.inject({
      method: 'GET',
      url: '/api/v1/exportar?formato=geojson',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(geo.statusCode).toBe(200);
    expect(geo.json().nota_metodologica).toContain('percepción');
    expect(geo.json().features.length).toBeGreaterThan(0);
    const csv = await app.inject({
      method: 'GET',
      url: '/api/v1/exportar?formato=csv&estado=validado',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.split('\n')[0]).toContain('inventario de reportes ciudadanos');
    expect(csv.body).toContain('id,estado,severidad');
  });
  it('indicadores y capas para técnicos; activar capa solo admin', async () => {
    const ind = await app.inject({
      method: 'GET',
      url: '/api/v1/indicadores',
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(ind.statusCode).toBe(200);
    expect(ind.json().total).toBeGreaterThan(0);
    expect(ind.json().capas_vigentes.unidad_vecinal).toBe('test');
    const capas = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/capas',
      cookies: { curichi_sesion: cookieTecnico },
    });
    const uv = capas.json().find((c: { capa: string }) => c.capa === 'unidad_vecinal');
    const noAdmin = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/capas/${uv.id}/activar`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(noAdmin.statusCode).toBe(403);
    const admin = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/capas/${uv.id}/activar`,
      cookies: { curichi_sesion: cookieAdmin },
    });
    expect(admin.statusCode).toBe(200);
    expect(admin.json().vigente).toBe(true);
  });
  it('aplica rate limit a la creación de reportes', async () => {
    const limitada = await crearApp({
      pool,
      cfg: {
        ...leerConfig({ DATABASE_URL: base.url }),
        rutaOpenApi: '/no-existe.yaml',
        rateLimitMax: 2,
      },
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    const codigos: number[] = [];
    for (let i = 0; i < 3; i++)
      codigos.push(
        (await limitada.inject({ method: 'POST', url: '/api/v1/reportes', payload: reporteValido }))
          .statusCode,
      );
    expect(codigos).toEqual([201, 201, 429]);
    await limitada.close();
  });
  it('login inválido y logout', async () => {
    const mal = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'tecnico@test.local', password: 'incorrecta-123' },
    });
    expect(mal.statusCode).toBe(401);
    const c = await login('tecnico@test.local');
    const yo = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: { curichi_sesion: c },
    });
    expect(yo.json().rol).toBe('tecnico');
    const out = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { curichi_sesion: c },
    });
    expect(out.statusCode).toBe(204);
    const yo2 = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: { curichi_sesion: c },
    });
    expect(yo2.statusCode).toBe(401);
  });
});
