/** M7/M8: definiciones reales, cuentas y fotos sintéticas, solo PGlite propio. */
import { Writable } from 'node:stream';
import {
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  ExportacionGeoJsonSchema,
  IndicadoresSchema,
  MiReporteFeatureSchema,
  MisReportesSchema,
  REGISTRO_CATEGORIAS,
  type RegistroCategorias,
  ReporteFeatureSchema,
  ReporteTecnicoFeatureSchema,
  ResumenEjecutivoSchema,
} from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import type { ConfigApi } from '../src/config.js';
import { opcionesLogger } from '../src/registro.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  multipart,
  reporteValido,
  resolverDePrueba,
  sesion,
  trozosRiff,
} from './ayudas.js';
import { espiarPool } from './espia-pool.js';

const PUNTO = { lat: -17.79, lon: -63.195 };
const TELEFONO = { lat: -17.7903217, lon: -63.1951234, precision_m: 8, antiguedad_s: 3 };
const AGUA = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
] as const;
const NUEVAS = [
  {
    categoria: 'basura',
    def: DEFINICION_BASURA,
    subtipos: [
      'microbasural',
      'contenedor_desbordado',
      'quema_basura',
      'escombros_via',
      'basura_canal',
    ],
    detalle: { gravedad_declarada: 'bolsas_sueltas', tamano: 'bolsas' },
    critica: { gravedad_declarada: 'quema_o_desague', tamano: 'bolsas' },
  },
  {
    categoria: 'area_verde',
    def: DEFINICION_AREA_VERDE,
    subtipos: [
      'parque_plaza_descuidada',
      'juegos_infantiles_rotos',
      'arbol_rama_peligrosa',
      'pasto_sin_riego',
      'persona_situacion_calle',
    ],
    detalle: { gravedad_declarada: 'descuidado', tamano: 'rincon' },
    critica: { gravedad_declarada: 'peligro_inmediato', tamano: 'rincon' },
  },
] as const;
type Nueva = (typeof NUEVAS)[number];
const DEFINICIONES = [
  DEFINICION_INUNDACION,
  DEFINICION_BACHE,
  DEFINICION_AREA_VERDE,
  DEFINICION_BASURA,
];

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let almacen: AlmacenMemoria;
let imagen: Buffer;
let espia: ReturnType<typeof espiarPool>;
let llamadasPip = 0;
const log: string[] = [];
const cookies = { tecnico: '', admin: '', vecina: '', vecino: '', ejecutivo: '' };

function cuerpo(caso: Nueva, extra: Record<string, unknown> = {}) {
  return {
    ...PUNTO,
    dispositivo: { ...PUNTO, precision_m: 8, antiguedad_s: 3 },
    ubicacion_tipo: 'via_publica',
    descripcion: 'Escenario completamente sintético M7/M8.',
    categoria: caso.categoria,
    subtipo: caso.subtipos[0],
    detalle: { ...caso.detalle },
    ...extra,
  };
}

function cuerposCuatro(): Record<string, unknown>[] {
  return [
    { ...reporteValido },
    {
      ...cuerpo(NUEVAS[0]),
      categoria: 'bache',
      subtipo: 'bache',
      detalle: { gravedad_declarada: 'se_puede_pasar', tamano: 'plato' },
    },
    cuerpo(NUEVAS[1]),
    cuerpo(NUEVAS[0]),
  ];
}

async function montar(extra: Partial<ConfigApi> = {}, registro?: RegistroCategorias) {
  const cfg = {
    ...configDePrueba({ DATABASE_URL: base.url }),
    rutaOpenApi: '/no-existe.yaml',
    rateLimitMax: 10_000,
    ...extra,
  };
  return crearApp({
    pool,
    cfg,
    almacen,
    ...(registro ? { registro } : {}),
    resolver: {
      ...resolverDePrueba,
      async resolver(lat, lon, requestId) {
        llamadasPip++;
        return resolverDePrueba.resolver(lat, lon, requestId);
      },
    },
    logger: {
      ...opcionesLogger({ salIp: cfg.salIp, produccion: true }),
      stream: new Writable({
        write(chunk, _encoding, done) {
          log.push(String(chunk));
          done();
        },
      }),
    },
  });
}

const get = (url: string, cookie?: string, target = app) =>
  target.inject({ method: 'GET', url, ...(cookie ? { cookies: sesion(cookie) } : {}) });
const enviar = (
  payload: Record<string, unknown>,
  target = app,
  cookie = cookies.vecina,
  headers: Record<string, string> = {},
) =>
  target.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
    cookies: sesion(cookie),
    headers,
  });
async function crear(payload: Record<string, unknown>, target = app, cookie = cookies.vecina) {
  const r = await enviar(payload, target, cookie);
  expect(r.statusCode, r.body).toBe(201);
  return MiReporteFeatureSchema.parse(r.json());
}
const estado = (id: string, nuevo: string, cookie = cookies.tecnico, target = app) =>
  target.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${id}/estado`,
    cookies: sesion(cookie),
    payload: { estado: nuevo, estado_motivo: 'Intervención sintética de prueba M7/M8.' },
  });
async function subir(target = app) {
  const r = await target.inject({
    method: 'POST',
    url: '/api/v1/fotos',
    cookies: sesion(cookies.vecina),
    ...multipart('archivo', 'sintetica.jpg', 'image/jpeg', imagen),
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().objeto_key as string;
}
async function huella() {
  const r = await pool.query(`SELECT
    (SELECT count(*)::int FROM reporte) AS reportes,
    (SELECT coalesce(sum(n), 0)::int FROM cupo_contador) AS cupos,
    (SELECT count(*)::int FROM auditoria) AS auditorias,
    (SELECT count(*)::int FROM idempotencia) AS idempotencias`);
  return r.rows[0];
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  await pool.query('UPDATE categoria SET activa = true');
  almacen = new AlmacenMemoria();
  imagen = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#28934D' } })
    .jpeg()
    .toBuffer();
  espia = espiarPool(pool);
  app = await montar();
  for (const rol of Object.keys(CUENTAS) as Array<keyof typeof CUENTAS>)
    cookies[rol] = await iniciarSesion(app, CUENTAS[rol]);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});
beforeEach(async () => {
  // Solo nuestra base efímera; no se libera cupo dentro de los casos de agotamiento.
  for (const tabla of [
    'reporte_foto',
    'reporte',
    'punto_critico',
    'auditoria',
    'idempotencia',
    'cupo_contador',
  ])
    await pool.query(`DELETE FROM ${tabla}`);
  await pool.query('UPDATE categoria SET activa = true');
  app.categorias.invalidar();
  llamadasPip = 0;
  log.length = 0;
});

describe('M7/M8: creación real y validación antes de efectos', () => {
  it.each(NUEVAS)(
    '$categoria acepta sus cinco subtipos y persiste modelos v1 sin agua',
    async (caso) => {
      expect(REGISTRO_CATEGORIAS.obtener(caso.categoria)).toBe(caso.def);
      for (const [i, subtipo] of caso.subtipos.entries()) {
        const f = await crear(
          cuerpo(caso, { subtipo }),
          app,
          i < 3 ? cookies.vecina : cookies.vecino,
        );
        expect(f.properties).toMatchObject({
          categoria: caso.categoria,
          subtipo,
          detalle: caso.detalle,
          severidad: 'baja',
        });
        const fila = (
          await pool.query(
            `SELECT r.*, row_to_json(r) AS almacenamiento,
                  detalle->>'profundidad_estimada' AS profundidad_estimada,
                  detalle->>'frecuencia' AS frecuencia, detalle->>'causa_presunta' AS causa_presunta,
                  detalle->>'sumidero_cercano' AS sumidero_cercano,
                  detalle->>'sumidero_estado' AS sumidero_estado,
                  (detalle->>'agua_brota_sumidero')::boolean AS agua_brota_sumidero
             FROM reporte r WHERE id = $1`,
            [f.id],
          )
        ).rows[0];
        expect(fila).toMatchObject({
          detalle_version: 1,
          severidad_version: 1,
          severidad_puntaje: 2,
          severidad_calculada: 'baja',
          distrito_id: 'distrito_municipal:01',
          unidad_vecinal_id: 'unidad_vecinal:A',
        });
        expect(fila.detalle).toEqual(caso.detalle);
        for (const campo of AGUA) {
          expect(fila[campo], campo).toBeNull();
          expect(fila.almacenamiento, campo).not.toHaveProperty(campo);
          expect(fila.detalle, campo).not.toHaveProperty(campo);
        }
        expect(
          (
            await pool.query("SELECT id FROM reporte WHERE categoria = 'inundacion' AND id = $1", [
              f.id,
            ])
          ).rowCount,
        ).toBe(0);
      }
      const critica = await crear(cuerpo(caso, { detalle: caso.critica }), app, cookies.vecino);
      expect(critica.properties.severidad).toBe('critica');
      expect(
        (await pool.query('SELECT severidad_puntaje FROM reporte WHERE id = $1', [critica.id]))
          .rows[0],
      ).toEqual({ severidad_puntaje: 5 });
    },
  );

  it.each(NUEVAS)(
    '$categoria rechaza subtipo y detalle inválidos antes de PIP/cuota/idempotencia',
    async (caso) => {
      const antes = await huella();
      const cambios = [
        { subtipo: undefined },
        { subtipo: null },
        { subtipo: 'inexistente' },
        { subtipo: caso.categoria === 'basura' ? 'persona_situacion_calle' : 'quema_basura' },
        { detalle: { gravedad_declarada: caso.detalle.gravedad_declarada } },
        { detalle: { ...caso.detalle, gravedad_declarada: 'critica' } },
        { detalle: { ...caso.detalle, tamano: 1 } },
        { detalle: { ...caso.detalle, tamano: 'gigante' } },
        { detalle: { ...caso.detalle, tamano: caso.categoria === 'basura' ? 'rincon' : 'bolsas' } },
        { detalle: { ...caso.detalle, profundidad_estimada: 'rodilla' } },
        { detalle: { ...caso.detalle, subtipo: caso.subtipos[0] } },
      ];
      espia.reiniciar();
      for (const cambio of cambios) {
        const r = await enviar(cuerpo(caso, cambio), app, cookies.vecina, {
          'idempotency-key': 'm7-m8-invalido-0001',
        });
        expect(r.statusCode, JSON.stringify(cambio)).toBe(400);
        expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
        expect(r.json().detalles).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              campo: expect.stringMatching('subtipo' in cambio ? /^subtipo$/ : /^detalle(?:\.|$)/),
            }),
          ]),
        );
      }
      expect(llamadasPip).toBe(0);
      expect(
        espia.contar(/INSERT INTO (reporte\b|cupo_contador\b|idempotencia\b|auditoria\b)/i),
      ).toBe(0);
      expect(await huella()).toEqual(antes);
      const anonimo = await app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        payload: cuerpo(caso),
      });
      expect(anonimo.statusCode).toBe(401);
      expect(await huella()).toEqual(antes);
    },
  );

  it.each(NUEVAS)(
    '$categoria activa sin definición no crea, gasta ni anuncia cupo',
    async (caso) => {
      const incompleta = await montar(
        {},
        crearRegistroCategorias([DEFINICION_INUNDACION, DEFINICION_BACHE]),
      );
      try {
        const antes = await huella();
        const r = await enviar(cuerpo(caso), incompleta);
        expect(r.statusCode, r.body).toBe(422);
        expect(r.json().codigo).toBe('CATEGORIA_NO_DISPONIBLE');
        expect(llamadasPip).toBe(0);
        expect(await huella()).toEqual(antes);
        const yo = await get('/api/v1/auth/yo', cookies.vecina, incompleta);
        expect(yo.statusCode).toBe(200);
        expect(Object.keys(yo.json().cupos).sort()).toEqual(['bache', 'inundacion']);
      } finally {
        await incompleta.close();
      }
    },
  );
});

describe('M7/M8: cuatro contadores, fotos globales y publicación', () => {
  it('cada categoría admite tres reportes y las doce fotos comparten un único cupo real', async () => {
    const config = await get('/api/v1/configuracion');
    expect(config.json().categorias_activas).toEqual([
      'inundacion',
      'bache',
      'area_verde',
      'basura',
    ]);
    for (const payload of cuerposCuatro()) {
      for (let i = 0; i < 3; i++) await crear({ ...payload, fotos: [await subir()] });
      const antes = await huella();
      const exceso = await enviar(payload);
      expect(exceso.statusCode).toBe(429);
      expect(exceso.json()).toMatchObject({
        codigo: 'CUOTA_DE_REPORTES',
        detalles: { categoria: payload.categoria ?? 'inundacion' },
      });
      expect(await huella()).toEqual(antes);
    }
    const excesoFoto = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      cookies: sesion(cookies.vecina),
      ...multipart('archivo', 'sintetica.jpg', 'image/jpeg', imagen),
    });
    expect(excesoFoto.statusCode).toBe(429);
    expect(excesoFoto.json().codigo).toBe('CUOTA_DE_FOTOS');
    const yo = (await get('/api/v1/auth/yo', cookies.vecina)).json();
    expect(yo.fotos_restantes_hoy).toBe(0);
    expect(yo.reportes_restantes_hoy).toBe(0);
    for (const def of DEFINICIONES) expect(yo.cupos[def.slug].restantes).toBe(0);
    expect((await pool.query('SELECT clave, n FROM cupo_contador ORDER BY clave')).rows).toEqual([
      { clave: 'fotos:cuenta', n: 12 },
      { clave: 'reportes:area_verde', n: 3 },
      { clave: 'reportes:bache', n: 3 },
      { clave: 'reportes:basura', n: 3 },
      { clave: 'reportes:inundacion', n: 3 },
    ]);
  }, 60_000);

  it('el override limita por separado las cuatro categorías', async () => {
    const limitada = await montar({ reportesPorDiaOverride: 1, reportesPorDia: 1 });
    try {
      for (const payload of cuerposCuatro()) {
        await crear(payload, limitada);
        expect((await enviar(payload, limitada)).statusCode).toBe(429);
      }
      const yo = (await get('/api/v1/auth/yo', cookies.vecina, limitada)).json();
      for (const def of DEFINICIONES) expect(yo.cupos[def.slug].restantes).toBe(0);
    } finally {
      await limitada.close();
    }
  });

  it('60/240/240 por categoría, replay sin gasto y espera visible solo al autor', async () => {
    const demorada = await montar({
      demoraPrimeroS: CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S,
      demoraSiguientesS: CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S,
    });
    try {
      for (const caso of NUEVAS) {
        const foto = await subir(demorada);
        const payload = cuerpo(caso, { fotos: [foto] });
        const headers = { 'idempotency-key': `m7-m8-${caso.categoria}-replay` };
        const primero = await enviar(payload, demorada, cookies.vecina, headers);
        expect(primero.statusCode).toBe(201);
        const antes = await huella();
        const replay = await enviar(
          { ...payload, dispositivo: TELEFONO },
          demorada,
          cookies.vecina,
          headers,
        );
        expect(replay.statusCode).toBe(200);
        expect(replay.headers['idempotent-replay']).toBe('true');
        expect(replay.json().id).toBe(primero.json().id);
        expect(replay.json().properties.publicar_en).toBe(primero.json().properties.publicar_en);
        expect(await huella()).toEqual(antes);
        const conflicto = await enviar(
          cuerpo(caso, { detalle: caso.critica }),
          demorada,
          cookies.vecina,
          headers,
        );
        expect(conflicto.statusCode).toBe(409);
        expect(conflicto.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
        expect(await huella()).toEqual(antes);
        const filas = [
          MiReporteFeatureSchema.parse(primero.json()),
          await crear(cuerpo(caso), demorada),
          await crear(cuerpo(caso), demorada),
        ];
        for (const [i, f] of filas.entries()) {
          expect(
            (Date.parse(f.properties.publicar_en) - Date.parse(f.properties.creado_en)) / 1000,
          ).toBe(i === 0 ? 60 : 240);
          expect(f.properties.segundos_para_publicar).toBeGreaterThan(0);
          expect((await get(`/api/v1/reportes/${f.id}`, undefined, demorada)).statusCode).toBe(404);
          expect(
            (await get(`/api/v1/tecnico/reportes/${f.id}`, cookies.tecnico, demorada)).statusCode,
          ).toBe(404);
          expect((await estado(f.id!, 'validado', cookies.tecnico, demorada)).statusCode).toBe(404);
        }
        const id = filas[0]!.id!;
        const propios = await get('/api/v1/mis-reportes', cookies.vecina, demorada);
        expect(propios.headers['cache-control']).toBe('private, no-store');
        expect(MisReportesSchema.parse(propios.json()).features.map((f) => f.id)).toContain(id);
        expect(
          MisReportesSchema.parse(
            (await get('/api/v1/mis-reportes', cookies.vecino, demorada)).json(),
          ).features.map((f) => f.id),
        ).not.toContain(id);
        const exportada = ExportacionGeoJsonSchema.parse(
          (
            await get(
              `/api/v1/exportar?categoria=${caso.categoria}&formato=geojson`,
              cookies.tecnico,
              demorada,
            )
          ).json(),
        );
        expect(exportada.features).toEqual([]);
        expect((await get(`/api/v1/fotos/${foto}`, undefined, demorada)).statusCode).toBe(404);
        const propia = await get(`/api/v1/fotos/${foto}`, cookies.vecina, demorada);
        expect(propia.statusCode).toBe(200);
        expect(propia.headers['cache-control']).toBe('private, no-store');
        // La espera se vence solo en nuestra fixture, sin reloj falso ni esperar minutos.
        await pool.query('UPDATE reporte SET publicar_en = creado_en WHERE id = $1', [id]);
        expect((await get(`/api/v1/reportes/${id}`, undefined, demorada)).statusCode).toBe(200);
        expect((await get(`/api/v1/fotos/${foto}`, undefined, demorada)).statusCode).toBe(200);
      }
    } finally {
      await demorada.close();
    }
  }, 30_000);
});

describe('M7/M8: privacidad, roles y moderación comunes', () => {
  it.each(NUEVAS)(
    '$categoria conserva jitter, privacidad del dispositivo y retirada por roles',
    async (caso) => {
      const foto = await subir();
      const alta = await enviar(
        cuerpo(caso, {
          subtipo: caso.subtipos[4],
          ubicacion_tipo: 'vivienda_o_predio',
          dispositivo: TELEFONO,
          fotos: [foto],
        }),
        app,
        cookies.vecina,
        { 'idempotency-key': `m7-m8-privacidad-${caso.categoria}` },
      );
      expect(alta.statusCode, alta.body).toBe(201);
      const f = MiReporteFeatureSchema.parse(alta.json());
      const id = f.id!;
      const publica = await get(`/api/v1/reportes/${id.slice(0, 8)}`);
      expect(publica.statusCode).toBe(200);
      const vista = ReporteFeatureSchema.parse(publica.json());
      expect(vista.geometry.coordinates).not.toEqual([PUNTO.lon, PUNTO.lat]);
      expect(vista.properties.precision_degradada).toBe(true);
      expect(vista.properties.detalle).toEqual(caso.detalle);
      for (const campo of ['autor_id', 'dispositivo', 'precision_gps_m', 'distancia_dispositivo_m'])
        expect(publica.json().properties).not.toHaveProperty(campo);
      expect((await get(`/api/v1/reportes/${id}`, cookies.tecnico)).json()).toEqual(publica.json());
      const tecnica = await get(`/api/v1/tecnico/reportes/${id}`, cookies.tecnico);
      expect(tecnica.statusCode).toBe(200);
      const exacta = ReporteTecnicoFeatureSchema.parse(tecnica.json());
      expect(exacta.geometry.coordinates).toEqual([PUNTO.lon, PUNTO.lat]);
      expect(exacta.properties.distancia_dispositivo_m).toBeGreaterThan(30);
      for (const campo of AGUA) expect(exacta.properties[campo]).toBeNull();
      const fotoPublica = await get(`/api/v1/fotos/${foto}`);
      expect(fotoPublica.statusCode).toBe(200);
      expect(trozosRiff(fotoPublica.rawPayload)).toEqual(
        expect.not.arrayContaining(['EXIF', 'XMP ', 'ICCP']),
      );
      await pool.query('UPDATE categoria SET activa = false WHERE slug = $1', [caso.categoria]);
      app.categorias.invalidar();
      expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
      expect((await get(`/api/v1/fotos/${foto}`)).statusCode).toBe(404);
      expect((await get(`/api/v1/tecnico/reportes/${id}`, cookies.tecnico)).statusCode).toBe(200);
      expect(
        MisReportesSchema.parse(
          (await get('/api/v1/mis-reportes', cookies.vecina)).json(),
        ).features.map((v) => v.id),
      ).toContain(id);
      await pool.query('UPDATE categoria SET activa = true WHERE slug = $1', [caso.categoria]);
      app.categorias.invalidar();
      for (const cookie of [cookies.vecina, cookies.ejecutivo]) {
        expect((await get(`/api/v1/tecnico/reportes/${id}`, cookie)).statusCode).toBe(403);
        expect(
          (await get(`/api/v1/exportar?categoria=${caso.categoria}&formato=geojson`, cookie))
            .statusCode,
        ).toBe(403);
        expect((await estado(id, 'validado', cookie)).statusCode).toBe(403);
      }
      expect(
        (
          await get(
            `/api/v1/ejecutivo/resumen?categoria=${caso.categoria}&ventana=todo`,
            cookies.ejecutivo,
          )
        ).statusCode,
      ).toBe(200);
      const csv = await get(
        `/api/v1/exportar?categoria=${caso.categoria}&formato=csv`,
        cookies.tecnico,
      );
      const geo = await get(
        `/api/v1/exportar?categoria=${caso.categoria}&formato=geojson`,
        cookies.tecnico,
      );
      expect(csv.statusCode).toBe(200);
      expect(geo.statusCode).toBe(200);
      const antes = await huella();
      const rechazo = await enviar(cuerpo(caso, { dispositivo: { ...TELEFONO, precision_m: 80 } }));
      expect(rechazo.statusCode).toBe(422);
      expect(await huella()).toEqual(antes);
      expect(log.join('')).toContain('reporte rechazado por la ubicación del dispositivo');
      expect((await estado(id, 'validado')).statusCode).toBe(200);
      expect((await estado(id, 'rechazado')).statusCode).toBe(403);
      expect((await estado(id, 'rechazado', cookies.admin)).statusCode).toBe(200);
      expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
      expect((await get(`/api/v1/fotos/${foto}`)).statusCode).toBe(404);
      expect((await get(`/api/v1/fotos/${foto}`, cookies.vecina)).headers['cache-control']).toBe(
        'private, no-store',
      );
      const resuelto = await crear(cuerpo(caso));
      expect((await estado(resuelto.id!, 'validado')).statusCode).toBe(200);
      expect((await estado(resuelto.id!, 'resuelto')).statusCode).toBe(200);
      expect(
        ReporteFeatureSchema.parse((await get(`/api/v1/reportes/${resuelto.id}`)).json()).properties
          .estado,
      ).toBe('resuelto');
      const fila = (
        await pool.query('SELECT row_to_json(r)::text AS t FROM reporte r WHERE id = $1', [id])
      ).rows[0].t;
      const audit = (
        await pool.query("SELECT coalesce(json_agg(a), '[]')::text AS t FROM auditoria a")
      ).rows[0].t;
      const idempotencia = (
        await pool.query("SELECT coalesce(json_agg(i), '[]')::text AS t FROM idempotencia i")
      ).rows[0].t;
      const textos = [
        fila,
        audit,
        idempotencia,
        alta.body,
        publica.body,
        tecnica.body,
        csv.body,
        geo.body,
        rechazo.body,
        log.join(''),
      ];
      for (const texto of textos)
        for (const rastro of ['7903217', '1951234']) expect(texto).not.toContain(rastro);
    },
    30_000,
  );

  it('la fusión entre categorías no muta estados/auditoría; dentro de Basura funciona', async () => {
    const basura = await crear(cuerpo(NUEVAS[0]));
    const verde = await crear(cuerpo(NUEVAS[1]));
    const otro = await crear(cuerpo(NUEVAS[0]));
    expect((await estado(verde.id!, 'validado')).statusCode).toBe(200);
    const antes = await huella();
    for (const [method, url, payload] of [
      [
        'POST',
        `/api/v1/reportes/${basura.id}/fusionar`,
        { canonico_id: verde.id, motivo: 'Prueba sintética entre categorías.' },
      ],
      [
        'PATCH',
        `/api/v1/reportes/${basura.id}/estado`,
        {
          estado: 'duplicado',
          fusionado_en_id: verde.id,
          estado_motivo: 'Prueba sintética entre categorías.',
        },
      ],
    ] as const) {
      const r = await app.inject({ method, url, payload, cookies: sesion(cookies.tecnico) });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().codigo).toBe('FUSION_ENTRE_CATEGORIAS');
      expect(await huella()).toEqual(antes);
      expect(
        (await pool.query('SELECT estado, fusionado_en_id FROM reporte WHERE id = $1', [basura.id]))
          .rows[0],
      ).toEqual({ estado: 'nuevo', fusionado_en_id: null });
    }
    expect((await estado(basura.id!, 'validado')).statusCode).toBe(200);
    const fusion = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${otro.id}/fusionar`,
      cookies: sesion(cookies.tecnico),
      payload: { canonico_id: basura.id, motivo: 'Duplicado sintético de la misma categoría.' },
    });
    expect(fusion.statusCode, fusion.body).toBe(200);
    expect(
      (await pool.query('SELECT estado, fusionado_en_id FROM reporte WHERE id = $1', [otro.id]))
        .rows[0],
    ).toEqual({ estado: 'duplicado', fusionado_en_id: basura.id });
  });
});

describe('M7/M8: lecturas y exportación de cuatro definiciones', () => {
  it('aísla indicadores y ejecutivo con totales, estados y severidades distintos y suma todas', async () => {
    // Oráculos literales: ninguna categoría comparte el perfil completo de otra.
    const escenarios = [
      {
        categoria: 'inundacion',
        reportes: [
          ['nuevo', 'baja'],
          ['validado', 'media'],
        ],
        total: 2,
        estados: { nuevo: 1, validado: 1 },
        severidades: { baja: 1, media: 1, alta: 0, critica: 0 },
        activas: {
          total: 2,
          verificadas: 1,
          en_revision: 1,
          por_severidad: { baja: 1, media: 1, alta: 0, critica: 0 },
        },
        resueltas: 0,
      },
      {
        categoria: 'bache',
        reportes: [
          ['nuevo', 'alta'],
          ['validado', 'baja'],
          ['resuelto', 'critica'],
        ],
        total: 3,
        estados: { nuevo: 1, validado: 1, resuelto: 1 },
        severidades: { baja: 1, media: 0, alta: 1, critica: 1 },
        activas: {
          total: 2,
          verificadas: 1,
          en_revision: 1,
          por_severidad: { baja: 1, media: 0, alta: 1, critica: 0 },
        },
        resueltas: 1,
      },
      {
        categoria: 'area_verde',
        reportes: [
          ['nuevo', 'media'],
          ['nuevo', 'critica'],
          ['validado', 'alta'],
          ['resuelto', 'baja'],
        ],
        total: 4,
        estados: { nuevo: 2, validado: 1, resuelto: 1 },
        severidades: { baja: 1, media: 1, alta: 1, critica: 1 },
        activas: {
          total: 3,
          verificadas: 1,
          en_revision: 2,
          por_severidad: { baja: 0, media: 1, alta: 1, critica: 1 },
        },
        resueltas: 1,
      },
      {
        categoria: 'basura',
        reportes: [
          ['nuevo', 'critica'],
          ['validado', 'critica'],
          ['validado', 'media'],
          ['resuelto', 'alta'],
          ['resuelto', 'baja'],
        ],
        total: 5,
        estados: { nuevo: 1, validado: 2, resuelto: 2 },
        severidades: { baja: 1, media: 1, alta: 1, critica: 2 },
        activas: {
          total: 3,
          verificadas: 2,
          en_revision: 1,
          por_severidad: { baja: 0, media: 1, alta: 0, critica: 2 },
        },
        resueltas: 2,
      },
    ] as const;
    const payloads = cuerposCuatro();
    for (const [categoria, caso] of escenarios.entries()) {
      for (const [i, [destino, severidad]] of caso.reportes.entries()) {
        const f = await crear(payloads[categoria]!, app, i < 3 ? cookies.vecina : cookies.vecino);
        expect(f.properties.categoria).toBe(caso.categoria);
        // Severidad efectiva fijada por la API común; no se duplica el modelo de dominio.
        const reclasificada = await app.inject({
          method: 'PATCH',
          url: `/api/v1/reportes/${f.id}/severidad`,
          cookies: sesion(cookies.tecnico),
          payload: { severidad_manual: severidad, severidad_motivo: 'Perfil sintético H1.' },
        });
        expect(reclasificada.statusCode, reclasificada.body).toBe(200);
        expect(ReporteTecnicoFeatureSchema.parse(reclasificada.json()).properties.severidad).toBe(
          severidad,
        );
        if (destino !== 'nuevo') expect((await estado(f.id!, 'validado')).statusCode).toBe(200);
        if (destino === 'resuelto') expect((await estado(f.id!, 'resuelto')).statusCode).toBe(200);
      }
    }
    const todas = {
      categoria: 'todas',
      total: 14,
      estados: { nuevo: 5, validado: 5, resuelto: 4 },
      severidades: { baja: 4, media: 3, alta: 3, critica: 4 },
      activas: {
        total: 10,
        verificadas: 5,
        en_revision: 5,
        por_severidad: { baja: 2, media: 3, alta: 2, critica: 3 },
      },
      resueltas: 4,
    } as const;
    const lecturas = [];
    for (const caso of [...escenarios, todas]) {
      const respuesta = await get(
        `/api/v1/indicadores?categoria=${caso.categoria}`,
        cookies.tecnico,
      );
      expect(respuesta.statusCode, respuesta.body).toBe(200);
      const indicadores = IndicadoresSchema.parse(respuesta.json());
      expect(indicadores.total, caso.categoria).toBe(caso.total);
      expect(indicadores.por_estado, caso.categoria).toEqual(caso.estados);
      expect(indicadores.por_severidad, caso.categoria).toEqual(caso.severidades);
      const ejecutiva = await get(
        `/api/v1/ejecutivo/resumen?categoria=${caso.categoria}&ventana=todo`,
        cookies.ejecutivo,
      );
      expect(ejecutiva.statusCode, ejecutiva.body).toBe(200);
      const resumen = ResumenEjecutivoSchema.parse(ejecutiva.json());
      expect(resumen.activas, caso.categoria).toEqual(caso.activas);
      expect(resumen.resueltas, caso.categoria).toBe(caso.resueltas);
      expect(resumen.por_estado, caso.categoria).toEqual({ resuelto: 0, ...caso.estados });
      lecturas.push({ indicadores, resumen });
    }
    const suma = lecturas.pop()!;
    expect(suma.indicadores.total).toBe(lecturas.reduce((n, v) => n + v.indicadores.total, 0));
    for (const campo of ['nuevo', 'validado', 'resuelto'] as const) {
      expect(suma.indicadores.por_estado[campo]).toBe(
        lecturas.reduce((n, v) => n + (v.indicadores.por_estado[campo] ?? 0), 0),
      );
      expect(suma.resumen.por_estado[campo]).toBe(
        lecturas.reduce((n, v) => n + v.resumen.por_estado[campo], 0),
      );
    }
    for (const campo of ['baja', 'media', 'alta', 'critica'] as const) {
      expect(suma.indicadores.por_severidad[campo]).toBe(
        lecturas.reduce((n, v) => n + v.indicadores.por_severidad[campo], 0),
      );
      expect(suma.resumen.activas.por_severidad[campo]).toBe(
        lecturas.reduce((n, v) => n + v.resumen.activas.por_severidad[campo], 0),
      );
    }
    for (const campo of ['total', 'verificadas', 'en_revision'] as const)
      expect(suma.resumen.activas[campo]).toBe(
        lecturas.reduce((n, v) => n + v.resumen.activas[campo], 0),
      );
    expect(suma.resumen.resueltas).toBe(lecturas.reduce((n, v) => n + v.resumen.resueltas, 0));
  }, 30_000);

  it('aísla los cuatro reportes coincidentes y exporta notas propias sin agua ficticia', async () => {
    const creados = [];
    for (const payload of cuerposCuatro()) creados.push(await crear(payload));
    for (const def of DEFINICIONES) {
      const id = creados.find((f) => f.properties.categoria === def.slug)!.id;
      for (const [ruta, cookie] of [
        ['reportes', undefined],
        ['tecnico/reportes', cookies.tecnico],
      ] as const) {
        const r = await get(`/api/v1/${ruta}?categoria=${def.slug}&limite=500`, cookie);
        expect(r.statusCode).toBe(200);
        expect(r.json().features.map((f: { id: string }) => f.id)).toEqual([id]);
      }
      const indicadores = await get(`/api/v1/indicadores?categoria=${def.slug}`, cookies.tecnico);
      expect(indicadores.statusCode).toBe(200);
      expect(indicadores.json().total).toBe(1);
      const geo = await get(
        `/api/v1/exportar?categoria=${def.slug}&formato=geojson`,
        cookies.tecnico,
      );
      expect(geo.statusCode).toBe(200);
      const coleccion = ExportacionGeoJsonSchema.parse(geo.json());
      expect(coleccion.features.map((f) => f.id)).toEqual([id]);
      expect(coleccion.nota_metodologica).toContain(def.notaMetodologica);
      const csv = await get(`/api/v1/exportar?categoria=${def.slug}&formato=csv`, cookies.tecnico);
      expect(csv.statusCode).toBe(200);
      const lineas = csv.body.replace(/^\uFEFF/, '').split(/\r?\n/);
      const generado = lineas.findIndex((l) => l.startsWith('# Generado '));
      expect(generado).toBeGreaterThan(0);
      expect(lineas.slice(0, generado).every((l) => l.startsWith('# '))).toBe(true);
      expect(
        lineas
          .slice(0, generado)
          .map((l) => l.slice(2))
          .join('\n'),
      ).toBe(coleccion.nota_metodologica);
      // Fixtures de una línea; las comas del JSON quedan dentro de las comillas CSV.
      const celdas = (linea: string) =>
        linea
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((s) => (s.startsWith('"') ? s.slice(1, -1).replaceAll('""', '"') : s));
      const cabecera = celdas(lineas.find((l) => l.startsWith('id,'))!);
      const fila = celdas(lineas.find((l) => l.startsWith(`${id},`))!);
      expect(fila).toHaveLength(cabecera.length);
      expect(cabecera.slice(-3)).toEqual(['categoria', 'subtipo', 'detalle']);
      const props = coleccion.features[0]!.properties;
      expect(fila[cabecera.indexOf('categoria')]).toBe(def.slug);
      expect(JSON.parse(fila[cabecera.indexOf('detalle')]!)).toEqual(props.detalle);
      expect(fila[cabecera.indexOf('subtipo')]).toBe(props.subtipo ?? '');
      if (def.slug !== 'inundacion')
        for (const campo of AGUA) {
          expect(props[campo]).toBeNull();
          expect(fila[cabecera.indexOf(campo)], campo).toBe('');
        }
      for (const campo of ['autor_id', 'dispositivo']) {
        expect(cabecera).not.toContain(campo);
      }
      // El GeoJSON autenticado usa el contrato técnico; la vista pública excluye al autor.
      const autor = (
        await pool.query<{ autor_id: string }>('SELECT autor_id::text FROM reporte WHERE id = $1', [
          id,
        ])
      ).rows[0]!.autor_id;
      expect(props.autor_id).toBe(autor);
      expect(props).not.toHaveProperty('dispositivo');
      for (const rastro of ['7903217', '1951234']) {
        expect(csv.body).not.toContain(rastro);
        expect(geo.body).not.toContain(rastro);
      }
    }
    const porDefecto = await get('/api/v1/reportes');
    expect(porDefecto.json().features.map((f: { id: string }) => f.id)).toEqual([creados[0]!.id]);
    const todas = ExportacionGeoJsonSchema.parse(
      (await get('/api/v1/exportar?categoria=todas&formato=geojson', cookies.admin)).json(),
    );
    expect(todas.features.map((f) => f.id).sort()).toEqual(creados.map((f) => f.id).sort());
    for (const def of DEFINICIONES)
      expect(todas.nota_metodologica.split(def.notaMetodologica)).toHaveLength(2);
    const indicadores = await get('/api/v1/indicadores?categoria=todas', cookies.tecnico);
    expect(indicadores.json().total).toBe(4);
  });
});
