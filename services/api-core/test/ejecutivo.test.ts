import { ResumenEjecutivoSchema } from 'contracts';
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
  liberarCuota,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';
import { espiarPool } from './espia-pool.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let espia: ReturnType<typeof espiarPool>;
let cookieEjecutivo: string;
let cookieTecnico: string;
let cookieVecina: string;
let idCualquiera: string;

const HORA = 3_600_000;
const DIA = 24 * HORA;
const ahora = Date.now();
// Siempre con segundos y milisegundos (…:12.345): el resumen tiene que devolverlo truncado.
const hace = (ms: number) =>
  new Date(Math.floor((ahora - ms) / 60_000) * 60_000 + 12_345).toISOString();
const alMinuto = (iso: string) =>
  new Date(Math.floor(Date.parse(iso) / 60_000) * 60_000).toISOString();

/** Reporte sembrado directamente en la base, con fecha de creación controlada. */
async function sembrar(o: {
  distrito: string;
  estado: string;
  severidad: string;
  manual?: string;
  creado: string;
}) {
  const [r] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada, severidad_puntaje,
       severidad_version, severidad_manual, severidad_motivo, estado, estado_motivo, creado_en, publicar_en)
     VALUES (ST_SetSRID(ST_MakePoint(-63.195, -17.79), 4326), ST_SetSRID(ST_MakePoint(-63.195, -17.79), 4326),
       $1, 'unidad_vecinal:A', 'manual', 'via_publica', 'Reporte sembrado para el resumen ejecutivo',
       'rodilla', 'ocasional', $2::severidad, 5, 2, $3::severidad, $4, $5::estado_reporte,
       CASE WHEN $5 IN ('rechazado', 'duplicado') THEN 'Motivo de prueba' ELSE NULL END, $6::timestamptz, $6::timestamptz)
     RETURNING id::text`,
    [
      o.distrito,
      o.severidad,
      o.manual ?? null,
      o.manual ? 'Reclasificado en prueba' : null,
      o.estado,
      o.creado,
    ],
  );
  return r!.id;
}

const CREADO_NUEVO = hace(DIA);

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  espia = espiarPool(pool);
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  const cuadrado = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [-63.1, -17.7],
        [-63.09, -17.7],
        [-63.09, -17.69],
        [-63.1, -17.69],
        [-63.1, -17.7],
      ],
    ],
  });
  // Distrito 02 en la capa vigente y sin reportes: tiene que salir con ceros.
  await ex.consultar(
    `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa)
     VALUES ('distrito_municipal:02', '02', 'Distrito Dos (test)', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 'test')`,
    [cuadrado],
  );
  // Distrito 99 solo en una versión de capa que ya no es vigente, con un reporte resuelto con ella.
  await ex.consultar(
    `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa)
     VALUES ('distrito_municipal:99', '99', 'Distrito Viejo (test)', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 'vieja')`,
    [cuadrado],
  );

  const d1 = 'distrito_municipal:01';
  idCualquiera = await sembrar({
    distrito: d1,
    estado: 'nuevo',
    severidad: 'baja',
    creado: CREADO_NUEVO,
  });
  await sembrar({ distrito: d1, estado: 'validado', severidad: 'media', creado: hace(2 * DIA) });
  // Severidad efectiva = la manual.
  await sembrar({
    distrito: d1,
    estado: 'validado',
    severidad: 'media',
    manual: 'critica',
    creado: hace(3 * DIA),
  });
  await sembrar({ distrito: d1, estado: 'resuelto', severidad: 'alta', creado: hace(40 * DIA) });
  // Rechazados y duplicados no cuentan, ni siquiera para el último reporte.
  await sembrar({ distrito: d1, estado: 'rechazado', severidad: 'alta', creado: hace(HORA) });
  await sembrar({ distrito: d1, estado: 'duplicado', severidad: 'baja', creado: hace(HORA) });
  await sembrar({
    distrito: 'distrito_municipal:99',
    estado: 'validado',
    severidad: 'alta',
    creado: hace(10 * DIA),
  });

  app = await crearApp({
    pool,
    cfg: {
      ...configDePrueba({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieEjecutivo = await iniciarSesion(app, CUENTAS.ejecutivo);
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

const resumen = (cookie?: string, ventana?: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/ejecutivo/resumen${ventana ? `?ventana=${ventana}` : ''}`,
    cookies: cookie ? sesion(cookie) : {},
  });

describe('GET /api/v1/ejecutivo/resumen: autorización', () => {
  it('sin sesión → 401 SIN_SESION', async () => {
    const r = await resumen();
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('SIN_SESION');
  });

  it('ciudadano → 403 SIN_PERMISO', async () => {
    const r = await resumen(cookieVecina);
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe('SIN_PERMISO');
  });

  it('ejecutivo → 200, privado y conforme al contrato', async () => {
    const r = await resumen(cookieEjecutivo);
    expect(r.statusCode, r.body.slice(0, 400)).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(() => ResumenEjecutivoSchema.parse(r.json())).not.toThrow();
  });

  it('técnico → 200 conforme al contrato', async () => {
    const r = await resumen(cookieTecnico);
    expect(r.statusCode).toBe(200);
    expect(() => ResumenEjecutivoSchema.parse(r.json())).not.toThrow();
  });

  it('ventana inválida → 400', async () => {
    const r = await resumen(cookieEjecutivo, '90d');
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /api/v1/ejecutivo/resumen: conteos', () => {
  it('ventana=todo: activas (nuevo + validado) por severidad efectiva; resueltas aparte', async () => {
    const r = await resumen(cookieEjecutivo, 'todo');
    expect(r.statusCode, r.body.slice(0, 400)).toBe(200);
    const c = ResumenEjecutivoSchema.parse(r.json());
    expect(c.ventana).toEqual({ desde: null, hasta: null });
    // El resuelto de hace 40 días ya no suma a la inundación activa: es trabajo hecho.
    expect(c.activas).toEqual({
      total: 4,
      verificadas: 3,
      en_revision: 1,
      por_severidad: { critica: 1, alta: 1, media: 1, baja: 1 },
    });
    expect(c.resueltas).toBe(1);
    expect(c.por_estado).toEqual({ nuevo: 1, validado: 3, resuelto: 1 });
    expect(c.ultimo_reporte_en).toBe(alMinuto(CREADO_NUEVO));

    expect(c.por_distrito.map((d) => d.codigo)).toEqual(['01', '02', '99']);
    const [d1, d2, d99] = c.por_distrito;
    expect(d1).toEqual({
      distrito_id: 'distrito_municipal:01',
      codigo: '01',
      nombre: 'Distrito Uno (test)',
      en_capa_vigente: true,
      activas: {
        total: 3,
        verificadas: 2,
        en_revision: 1,
        por_severidad: { critica: 1, alta: 0, media: 1, baja: 1 },
      },
      por_estado: { nuevo: 1, validado: 2, resuelto: 1 },
      ultimo_reporte_en: alMinuto(CREADO_NUEVO),
    });
    expect(d2).toEqual({
      distrito_id: 'distrito_municipal:02',
      codigo: '02',
      nombre: 'Distrito Dos (test)',
      en_capa_vigente: true,
      activas: {
        total: 0,
        verificadas: 0,
        en_revision: 0,
        por_severidad: { critica: 0, alta: 0, media: 0, baja: 0 },
      },
      por_estado: { nuevo: 0, validado: 0, resuelto: 0 },
      ultimo_reporte_en: null,
    });
    // Solo existe en una versión de capa anterior: sale, con su nombre, marcado fuera de la vigente.
    expect(d99).toMatchObject({
      nombre: 'Distrito Viejo (test)',
      en_capa_vigente: false,
      activas: { total: 1, verificadas: 1, en_revision: 0 },
    });
    expect(c.por_distrito.reduce((s, d) => s + d.activas.total, 0)).toBe(c.activas.total);
  });

  it('ultimo_reporte_en va truncado al minuto, en la raíz y en cada distrito', async () => {
    const c = ResumenEjecutivoSchema.parse((await resumen(cookieEjecutivo, 'todo')).json());
    // CREADO_NUEVO lleva segundos y milisegundos; lo que sale no.
    expect(CREADO_NUEVO).not.toBe(alMinuto(CREADO_NUEVO));
    for (const v of [c.ultimo_reporte_en, ...c.por_distrito.map((d) => d.ultimo_reporte_en)])
      if (v) expect(Date.parse(v) % 60_000, v).toBe(0);
  });

  it('ventana=7d excluye los reportes viejos', async () => {
    const r = await resumen(cookieEjecutivo, '7d');
    const c = ResumenEjecutivoSchema.parse(r.json());
    expect(c.ventana.desde).not.toBeNull();
    expect(c.ventana.hasta).not.toBeNull();
    expect(c.activas).toEqual({
      total: 3,
      verificadas: 2,
      en_revision: 1,
      por_severidad: { critica: 1, alta: 0, media: 1, baja: 1 },
    });
    expect(c.resueltas).toBe(0);
    expect(c.por_estado).toEqual({ nuevo: 1, validado: 2, resuelto: 0 });
    const d2 = c.por_distrito.find((d) => d.codigo === '02');
    expect(d2?.activas.total).toBe(0);
  });

  it('ventana=30d deja fuera el resuelto de hace 40 días pero no el de hace 10', async () => {
    const r = await resumen(cookieTecnico, '30d');
    const c = ResumenEjecutivoSchema.parse(r.json());
    expect(c.activas.total).toBe(4);
    expect(c.resueltas).toBe(0);
    expect(c.por_estado.resuelto).toBe(0);
  });
});

describe('GET /api/v1/ejecutivo/resumen: sin caché, con deduplicación en vuelo (plan S25)', () => {
  /** La pasada sobre la tabla de reportes que hace el resumen. */
  const pasadas = (espia: ReturnType<typeof espiarPool>) => espia.contar(/FULL JOIN agg/);

  const pedir = (ventana: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/ejecutivo/resumen?ventana=${ventana}`,
      cookies: sesion(cookieEjecutivo),
    });

  it('cada petición vuelve a la base: sin X-Cache y con la cifra del momento', async () => {
    espia.reiniciar();
    const primera = await pedir('7d');
    const segunda = await pedir('7d');
    expect(primera.headers['x-cache']).toBeUndefined();
    expect(segunda.headers['x-cache']).toBeUndefined();
    expect(segunda.json().activas).toEqual(primera.json().activas);
    expect(pasadas(espia)).toBe(2);
  });

  it('diez peticiones a la vez hacen una sola consulta', async () => {
    espia.reiniciar();
    const rs = await Promise.all(Array.from({ length: 10 }, () => pedir('30d')));
    expect(rs.map((r) => r.statusCode)).toEqual(Array(10).fill(200));
    for (const r of rs) expect(r.json()).toEqual(rs[0]!.json());
    expect(pasadas(espia)).toBe(1);
  });
});

describe('el ejecutivo no modera, no exporta, no ve la vista técnica', () => {
  const casos: [string, string, Record<string, unknown>?][] = [
    ['GET', '/api/v1/tecnico/reportes'],
    ['GET', '/api/v1/exportar?formato=csv'],
    ['GET', '/api/v1/indicadores'],
    ['GET', '/api/v1/admin/capas'],
  ];
  for (const [metodo, url] of casos)
    it(`${metodo} ${url} → 403`, async () => {
      const r = await app.inject({
        method: metodo as 'GET',
        url,
        cookies: sesion(cookieEjecutivo),
      });
      expect(r.statusCode).toBe(403);
      expect(r.json().codigo).toBe('SIN_PERMISO');
    });

  it('PATCH estado, PATCH severidad y POST fusionar → 403', async () => {
    const pedidos = [
      {
        method: 'PATCH' as const,
        url: `/api/v1/reportes/${idCualquiera}/estado`,
        payload: { estado: 'validado' },
      },
      {
        method: 'PATCH' as const,
        url: `/api/v1/reportes/${idCualquiera}/severidad`,
        payload: { severidad_manual: 'alta', severidad_motivo: 'Intento del ejecutivo' },
      },
      {
        method: 'POST' as const,
        url: `/api/v1/reportes/${idCualquiera}/fusionar`,
        payload: { canonico_id: idCualquiera },
      },
    ];
    for (const p of pedidos) {
      const r = await app.inject({ ...p, cookies: sesion(cookieEjecutivo) });
      expect(r.statusCode, `${p.method} ${p.url}`).toBe(403);
    }
  });

  it('puede crear un reporte como cualquier sesión', async () => {
    await liberarCuota(ex, CUENTAS.ejecutivo);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: reporteValido,
      cookies: sesion(cookieEjecutivo),
    });
    expect(r.statusCode, r.body.slice(0, 400)).toBe(201);
    expect(r.json().properties.estado).toBe('nuevo');
  });
});
