/**
 * `desde` y `hasta` del LISTADO (público y técnico) son días del calendario de la ciudad
 * configurada (`ZONA_HORARIA`), igual que en la exportación.
 *
 * `consultas.ts` ya sabía comparar en la zona que se le pasara, pero las dos rutas de listado no
 * se la pasaban: caían siempre en la del contrato (La Paz) aunque la instalación fuera de otra
 * ciudad, y el mismo filtro daba un resultado en el listado y otro en la exportación.
 *
 * La sesión de la base se pone en UTC, como en el contenedor de Docker; y la instalación, en una
 * zona lejos de La Paz (Tokio), para que la diferencia se vea en el día y no en unos minutos.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let tokio: FastifyInstance;
let cookieTecnico: string;
// 21:00 del 20 en La Paz = 01:00 UTC del 21 = 10:00 del 21 en Tokio.
let delVeinte: string;
// 12:00 del 21 en La Paz = 16:00 UTC del 21 = 01:00 del 22 en Tokio.
let delVeintiuno: string;

async function sembrar(creado: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id, version_capa,
       ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
       severidad_calculada, severidad_puntaje, severidad_version, estado, creado_en, publicar_en)
     VALUES (ST_SetSRID(ST_MakePoint(-63.185, -17.79), 4326), ST_SetSRID(ST_MakePoint(-63.185, -17.79), 4326),
       'distrito_municipal:01', 'unidad_vecinal:B', 'test', 'manual', 'via_publica',
       'Reporte sembrado para el filtro por día', 'rodilla', 'ocasional', 'media', 6, 2,
       'validado', $1::timestamptz, $1::timestamptz)
     RETURNING id::text`,
    [creado],
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  pool.on('connect', (c) => {
    void c.query("SET TIME ZONE 'UTC'");
  });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  delVeinte = await sembrar('2026-09-20T21:00:00-04:00');
  delVeintiuno = await sembrar('2026-09-21T12:00:00-04:00');
  tokio = await crearApp({
    pool,
    cfg: {
      ...configDePrueba({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      zonaHoraria: 'Asia/Tokyo',
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieTecnico = await iniciarSesion(tokio, CUENTAS.tecnico);
}, 120_000);

afterAll(async () => {
  await tokio?.close();
  await pool?.end();
  await base?.cerrar();
});

/** Ids que devuelve el listado para un rango de días de la UV B. */
async function idsEntre(ruta: string, desde: string, hasta: string, cookie?: string) {
  const r = await tokio.inject({
    method: 'GET',
    url: `${ruta}?unidad_vecinal_id=unidad_vecinal:B&desde=${desde}&hasta=${hasta}`,
    ...(cookie ? { cookies: sesion(cookie) } : {}),
  });
  expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
  return (r.json().features as { id: string }[]).map((f) => f.id).sort();
}

describe('listado con ZONA_HORARIA de otra ciudad (sesión de la base en UTC)', () => {
  it('la sesión de la base está en UTC, como en Docker', async () => {
    const r = await pool.query<{ TimeZone: string }>('SHOW TimeZone');
    expect(r.rows[0]?.TimeZone).toBe('UTC');
  });

  it('el listado público cuenta los días en la zona de la instalación', async () => {
    expect(await idsEntre('/api/v1/reportes', '2026-09-20', '2026-09-20')).toEqual([]);
    expect(await idsEntre('/api/v1/reportes', '2026-09-21', '2026-09-21')).toEqual([delVeinte]);
    expect(await idsEntre('/api/v1/reportes', '2026-09-22', '2026-09-22')).toEqual([delVeintiuno]);
  });

  it('el listado técnico también', async () => {
    const ruta = '/api/v1/tecnico/reportes';
    expect(await idsEntre(ruta, '2026-09-20', '2026-09-20', cookieTecnico)).toEqual([]);
    expect(await idsEntre(ruta, '2026-09-21', '2026-09-21', cookieTecnico)).toEqual([delVeinte]);
    expect(await idsEntre(ruta, '2026-09-22', '2026-09-22', cookieTecnico)).toEqual([delVeintiuno]);
  });
});
