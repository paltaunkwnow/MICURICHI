/** M6.2: recorrido API con la definición real de Baches de contracts, sobre PGlite propio. */
import { Writable } from 'node:stream';
import {
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  ExportacionGeoJsonSchema,
  MiReporteFeatureSchema,
  MisReportesSchema,
  REGISTRO_CATEGORIAS,
  type RegistroCategorias,
  ReporteFeatureCollectionSchema,
  ReporteFeatureSchema,
  ReportePublicoSchema,
  ReporteTecnicoFeatureCollectionSchema,
  ReporteTecnicoFeatureSchema,
  ReporteTecnicoSchema,
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
const DETALLE = { gravedad_declarada: 'se_puede_pasar', tamano: 'plato' };
const PLANOS_PUBLICOS = ['profundidad_estimada', 'frecuencia', 'causa_presunta'] as const;
const PLANOS_AGUA = [
  ...PLANOS_PUBLICOS,
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
] as const;
const TELEFONO = { lat: -17.7903217, lon: -63.1951234 };
const RASTROS = ['7903217', '1951234'];
const SIN_BACHE = crearRegistroCategorias([DEFINICION_INUNDACION]);

let base: BaseEfimera;
let pool: pg.Pool;
let ex: ReturnType<typeof ejecutorPg>;
let espia: ReturnType<typeof espiarPool>;
let app: FastifyInstance;
let almacen: AlmacenMemoria;
let imagen: Buffer;
let llamadasPip = 0;
const log: string[] = [];
const cookies = { tecnico: '', admin: '', vecina: '', vecino: '', ejecutivo: '' };

function cuerpoBache(extra: Record<string, unknown> = {}) {
  return {
    ...PUNTO,
    dispositivo: { ...PUNTO, precision_m: 8, antiguedad_s: 3 },
    ubicacion_tipo: 'via_publica',
    descripcion: 'Bache de prueba M6 en la calzada, declarado por una vecina.',
    categoria: 'bache',
    subtipo: 'bache',
    detalle: { ...DETALLE },
    ...extra,
  };
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

async function crear(extra: Record<string, unknown> = {}, target = app, cookie = cookies.vecina) {
  const r = await enviar(cuerpoBache(extra), target, cookie);
  expect(r.statusCode, r.body).toBe(201);
  return MiReporteFeatureSchema.parse(r.json());
}

const estado = (id: string, nuevo: string, cookie = cookies.tecnico, target = app) =>
  target.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${id}/estado`,
    cookies: sesion(cookie),
    payload: { estado: nuevo, estado_motivo: 'Motivo técnico de prueba M6.' },
  });

async function contadores() {
  const r = await pool.query<{
    reportes: number;
    cupos: number;
    auditorias: number;
    idempotencias: number;
  }>(`SELECT
    (SELECT count(*)::int FROM reporte) AS reportes,
    (SELECT COALESCE(sum(n), 0)::int FROM cupo_contador) AS cupos,
    (SELECT count(*)::int FROM auditoria) AS auditorias,
    (SELECT count(*)::int FROM idempotencia) AS idempotencias`);
  return r.rows[0]!;
}

async function auditoria(id: string) {
  const r = await pool.query<{
    accion: string;
    actor_id: string;
    antes: Record<string, unknown> | null;
    despues: Record<string, unknown>;
  }>(
    'SELECT accion, actor_id::text, antes, despues FROM auditoria WHERE entidad_id = $1 ORDER BY id',
    [id],
  );
  return r.rows;
}

async function subir(cookie = cookies.vecina, target = app) {
  const r = await target.inject({
    method: 'POST',
    url: '/api/v1/fotos',
    cookies: sesion(cookie),
    ...multipart('archivo', 'm6.jpg', 'image/jpeg', imagen),
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().objeto_key as string;
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  await pool.query("UPDATE categoria SET activa = true WHERE slug = 'bache'");
  almacen = new AlmacenMemoria();
  imagen = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#9C6A35' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '17/1 47/1 0/1' } })
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
  // Aislamiento de cada caso; nunca se libera cupo dentro de una secuencia de agotamiento.
  await pool.query('DELETE FROM cupo_contador');
  await pool.query('DELETE FROM idempotencia');
  await pool.query("UPDATE categoria SET activa = true WHERE slug = 'bache'");
  app.categorias.invalidar();
  llamadasPip = 0;
  log.length = 0;
});

describe('M6 real: validación anterior a PIP y cupo', () => {
  it('usa las definiciones reales de Bache, Basura y Áreas verdes en el registro de producción', () => {
    expect(REGISTRO_CATEGORIAS.obtener('bache')).toBe(DEFINICION_BACHE);
    expect(REGISTRO_CATEGORIAS.obtener('area_verde')).toBe(DEFINICION_AREA_VERDE);
    expect(REGISTRO_CATEGORIAS.obtener('basura')).toBe(DEFINICION_BASURA);
  });

  it.each([
    'bache',
    'hundimiento_calzada',
    'tapa_alcantarilla_faltante',
    'asfalto_levantado',
    'calle_tierra_intransitable',
  ])('acepta el subtipo real %s y conserva el detalle sin duplicarlo', async (subtipo) => {
    const f = await crear({ subtipo });
    expect(f.properties.subtipo).toBe(subtipo);
    expect(f.properties.detalle).toEqual(DETALLE);
    expect(f.properties.detalle).not.toHaveProperty('subtipo');
  });

  it.each([
    { nombre: 'ausente', cambio: { subtipo: undefined } },
    { nombre: 'null', cambio: { subtipo: null } },
    { nombre: 'ajeno a la definición', cambio: { subtipo: 'sumidero_tapado' } },
  ])('rechaza subtipo $nombre antes de PIP, reserva e idempotencia', async ({ cambio }) => {
    const antes = await contadores();
    espia.reiniciar();
    const r = await enviar(cuerpoBache(cambio), app, cookies.vecina, {
      'idempotency-key': 'm6-subtipo-invalido',
    });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(r.json().detalles).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'subtipo' })]),
    );
    expect(llamadasPip).toBe(0);
    expect(
      espia.contar(/INSERT INTO (reporte\b|cupo_contador\b|idempotencia\b|auditoria\b)/i),
    ).toBe(0);
    expect(await contadores()).toEqual(antes);
  });

  it.each([
    { nombre: 'incompleto', detalle: { gravedad_declarada: 'peligroso' } },
    { nombre: 'gravedad desconocida', detalle: { ...DETALLE, gravedad_declarada: 'critica' } },
    { nombre: 'tamaño desconocido', detalle: { ...DETALLE, tamano: 'gigante' } },
    { nombre: 'agua', detalle: { ...DETALLE, profundidad_estimada: 'rodilla' } },
    { nombre: 'subtipo dentro del detalle', detalle: { ...DETALLE, subtipo: 'bache' } },
  ])('rechaza detalle $nombre sin llamar al PIP ni gastar cupo', async ({ detalle }) => {
    const antes = await contadores();
    const r = await enviar(cuerpoBache({ detalle }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(llamadasPip).toBe(0);
    expect(await contadores()).toEqual(antes);
  });

  it('requiere cuenta también para el Bache real', async () => {
    const antes = await contadores();
    const r = await app.inject({ method: 'POST', url: '/api/v1/reportes', payload: cuerpoBache() });
    expect(r.statusCode).toBe(401);
    expect(await contadores()).toEqual(antes);
  });
});

describe('M6 real: contratos, persistencia y vistas', () => {
  it.each([
    { gravedad: 'se_puede_pasar', tamano: 'plato', puntaje: 2, banda: 'baja' },
    { gravedad: 'causo_accidente', tamano: 'plato', puntaje: 5, banda: 'critica' },
    { gravedad: 'peligroso', tamano: 'todo_el_carril', puntaje: 7, banda: 'critica' },
  ])('guarda $gravedad/$tamano con puntaje $puntaje, banda $banda y modelos v1', async (caso) => {
    const detalle = { gravedad_declarada: caso.gravedad, tamano: caso.tamano };
    const f = await crear({ detalle });
    expect(f.properties).toMatchObject({ categoria: 'bache', detalle, severidad: caso.banda });
    const r = await pool.query<Record<string, unknown>>(
      `SELECT r.*, row_to_json(r) AS almacenamiento,
              detalle->>'profundidad_estimada' AS profundidad_estimada,
              detalle->>'frecuencia' AS frecuencia, detalle->>'causa_presunta' AS causa_presunta,
              detalle->>'sumidero_cercano' AS sumidero_cercano,
              detalle->>'sumidero_estado' AS sumidero_estado,
              (detalle->>'agua_brota_sumidero')::boolean AS agua_brota_sumidero
         FROM reporte r WHERE id = $1`,
      [f.id],
    );
    const fila = r.rows[0]!;
    expect(fila).toMatchObject({
      detalle_version: 1,
      severidad_version: 1,
      severidad_puntaje: caso.puntaje,
      severidad_calculada: caso.banda,
    });
    expect(fila.detalle).toEqual(detalle);
    for (const campo of PLANOS_AGUA) {
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
    const a = (await auditoria(f.id!)).filter((filaAuditada) => filaAuditada.accion === 'crear');
    expect(a).toHaveLength(1);
    expect(a[0]!.despues).toMatchObject({
      categoria: 'bache',
      puntaje: caso.puntaje,
      severidad: caso.banda,
    });
    expect(a[0]!.despues.reglas ?? []).not.toContain('E1');
  });

  it('POST, propio, público, técnico y colecciones aceptan los nulos reales con esquemas canónicos', async () => {
    const f = await crear();
    const id = f.id!;
    const propios = await get('/api/v1/mis-reportes', cookies.vecina);
    expect(propios.statusCode).toBe(200);
    expect(propios.headers['cache-control']).toBe('private, no-store');
    expect(MisReportesSchema.parse(propios.json()).features.map((v) => v.id)).toContain(id);
    expect(
      MisReportesSchema.parse(
        (await get('/api/v1/mis-reportes', cookies.vecino)).json(),
      ).features.map((v) => v.id),
    ).not.toContain(id);
    const pub = await get(`/api/v1/reportes/${id.slice(0, 8)}`);
    expect(pub.statusCode).toBe(200);
    const publico = ReporteFeatureSchema.parse(pub.json());
    expect(ReportePublicoSchema.strict().safeParse(pub.json().properties).success).toBe(true);
    expect(publico.properties.detalle).toEqual(DETALLE);
    for (const campo of PLANOS_PUBLICOS) expect(publico.properties[campo]).toBeNull();
    const tecnico = await get(`/api/v1/tecnico/reportes/${id}`, cookies.tecnico);
    expect(tecnico.statusCode).toBe(200);
    expect(ReporteTecnicoSchema.strict().safeParse(tecnico.json().properties).success).toBe(true);
    for (const campo of PLANOS_AGUA)
      expect(ReporteTecnicoFeatureSchema.parse(tecnico.json()).properties[campo]).toBeNull();
    const lista = ReporteFeatureCollectionSchema.parse(
      (await get('/api/v1/reportes?categoria=bache&limite=500')).json(),
    );
    expect(lista.features.map((v) => v.id)).toContain(id);
    expect(lista.features.every((v) => v.properties.categoria === 'bache')).toBe(true);
    const tecnica = ReporteTecnicoFeatureCollectionSchema.parse(
      (await get('/api/v1/tecnico/reportes?categoria=bache&limite=500', cookies.tecnico)).json(),
    );
    expect(tecnica.features.map((v) => v.id)).toContain(id);
    const exportada = ExportacionGeoJsonSchema.parse(
      (await get('/api/v1/exportar?categoria=bache&formato=geojson', cookies.tecnico)).json(),
    );
    expect(exportada.features.map((v) => v.id)).toContain(id);
  });

  it('no mezcla dos categorías reales en el mismo punto; Todas conserva ambas', async () => {
    const b = await crear();
    const r = await enviar({ ...reporteValido, ...PUNTO });
    expect(r.statusCode, r.body).toBe(201);
    const inundacion = MiReporteFeatureSchema.parse(r.json());
    const agua = ReporteFeatureCollectionSchema.parse(
      (await get('/api/v1/reportes?limite=500')).json(),
    );
    expect(agua.features.map((f) => f.id)).toContain(inundacion.id);
    expect(agua.features.map((f) => f.id)).not.toContain(b.id);
    const baches = ReporteFeatureCollectionSchema.parse(
      (await get('/api/v1/reportes?categoria=bache&limite=500')).json(),
    );
    expect(baches.features.map((f) => f.id)).toContain(b.id);
    expect(baches.features.map((f) => f.id)).not.toContain(inundacion.id);
    const todas = ReporteTecnicoFeatureCollectionSchema.parse(
      (await get('/api/v1/tecnico/reportes?categoria=todas&limite=500', cookies.tecnico)).json(),
    );
    expect(todas.features.map((f) => f.id)).toEqual(expect.arrayContaining([b.id, inundacion.id]));
    const indicadores = (await get('/api/v1/indicadores?categoria=bache', cookies.tecnico)).json();
    const flood = (await get('/api/v1/indicadores?categoria=inundacion', cookies.tecnico)).json();
    const combinado = (await get('/api/v1/indicadores?categoria=todas', cookies.tecnico)).json();
    expect(combinado.total).toBe(indicadores.total + flood.total);
    const resumenBache = (
      await get('/api/v1/ejecutivo/resumen?categoria=bache&ventana=todo', cookies.ejecutivo)
    ).json();
    const resumenFlood = (
      await get('/api/v1/ejecutivo/resumen?categoria=inundacion&ventana=todo', cookies.ejecutivo)
    ).json();
    const resumenTodas = (
      await get('/api/v1/ejecutivo/resumen?categoria=todas&ventana=todo', cookies.ejecutivo)
    ).json();
    expect(resumenTodas.activas.total).toBe(
      resumenBache.activas.total + resumenFlood.activas.total,
    );
  });

  it('el Bache aproximado conserva el método y no inventa una distancia al dispositivo', async () => {
    const f = await crear({
      ubicacion_aproximada: true,
      dispositivo: { lat: -17.5, lon: -63.5, precision_m: 500, antiguedad_s: 3 },
    });
    const tecnico = await get(`/api/v1/tecnico/reportes/${f.id}`, cookies.tecnico);
    expect(tecnico.statusCode).toBe(200);
    expect(ReporteTecnicoFeatureSchema.parse(tecnico.json()).properties).toMatchObject({
      ubicacion_metodo: 'aproximada',
      precision_gps_m: 500,
      distancia_dispositivo_m: null,
    });
    const antes = await contadores();
    const precisa = await enviar(cuerpoBache({ ubicacion_aproximada: true }));
    expect(precisa.statusCode).toBe(422);
    expect(precisa.json().codigo).toBe('UBICACION_PRECISA_DISPONIBLE');
    expect(await contadores()).toEqual(antes);
  });

  it('Inundación plana y explícita siguen sin exigir subtipo y conservan versión2 y E1', async () => {
    const plano = await enviar({ ...reporteValido, profundidad_estimada: 'mas_70' });
    expect(plano.statusCode, plano.body).toBe(201);
    const explicito = await enviar({
      ...PUNTO,
      dispositivo: { ...PUNTO, precision_m: 8, antiguedad_s: 3 },
      ubicacion_tipo: 'via_publica',
      descripcion: 'Inundación explícita de control M6.',
      categoria: 'inundacion',
      subtipo: null,
      detalle: {
        profundidad_estimada: 'rodilla',
        frecuencia: 'ocasional',
        causa_presunta: 'desconocida',
      },
    });
    expect(explicito.statusCode, explicito.body).toBe(201);
    for (const respuesta of [plano, explicito]) {
      const f = MiReporteFeatureSchema.parse(respuesta.json());
      expect(f.properties.subtipo).toBeNull();
      expect(f.properties.profundidad_estimada).not.toBeNull();
      expect(
        (await pool.query('SELECT severidad_version FROM reporte WHERE id = $1', [f.id])).rows[0]
          .severidad_version,
      ).toBe(2);
    }
    expect((await auditoria(plano.json().id))[0]!.despues.reglas).toContain('E1');
  });

  it.each([
    { forma: 'plana', campo: 'profundidad_estimada' },
    { forma: 'plana', campo: 'frecuencia' },
    { forma: 'plana', campo: 'causa_presunta' },
    { forma: 'explícita', campo: 'profundidad_estimada' },
    { forma: 'explícita', campo: 'frecuencia' },
    { forma: 'explícita', campo: 'causa_presunta' },
  ])('Inundación $forma sigue rechazando $campo=null sin PIP ni cupo', async ({ forma, campo }) => {
    const detalle = {
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'desconocida',
      [campo]: null,
    };
    const payload =
      forma === 'plana'
        ? { ...reporteValido, [campo]: null }
        : {
            ...PUNTO,
            dispositivo: { ...PUNTO, precision_m: 8, antiguedad_s: 3 },
            ubicacion_tipo: 'via_publica',
            descripcion: 'Control de nulos de Inundaciones M6.',
            categoria: 'inundacion',
            detalle,
          };
    const antes = await contadores();
    const r = await enviar(payload);
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(llamadasPip).toBe(0);
    expect(await contadores()).toEqual(antes);
  });
});

describe('M6 real: demora, idempotencia y cupos', () => {
  it('fija demora por categoría; en espera solo autor y foto propia, sin moderación prematura', async () => {
    const demorada = await montar({
      demoraPrimeroS: CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S,
      demoraSiguientesS: CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S,
    });
    try {
      const key = await subir(cookies.vecina, demorada);
      const primero = await crear({ fotos: [key] }, demorada);
      const segundo = await crear({}, demorada);
      const agua = await enviar({ ...reporteValido }, demorada);
      expect(agua.statusCode).toBe(201);
      for (const [f, demora] of [
        [primero, CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S],
        [segundo, CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S],
        [MiReporteFeatureSchema.parse(agua.json()), CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S],
      ] as const) {
        expect(
          (Date.parse(f.properties.publicar_en) - Date.parse(f.properties.creado_en)) / 1000,
        ).toBe(demora);
        expect(f.properties.segundos_para_publicar).toBeGreaterThan(0);
      }
      const id = primero.id!;
      expect((await get(`/api/v1/reportes/${id}`, undefined, demorada)).statusCode).toBe(404);
      expect(
        (await get(`/api/v1/tecnico/reportes/${id}`, cookies.tecnico, demorada)).statusCode,
      ).toBe(404);
      expect((await estado(id, 'validado', cookies.tecnico, demorada)).statusCode).toBe(404);
      const propias = MisReportesSchema.parse(
        (await get('/api/v1/mis-reportes', cookies.vecina, demorada)).json(),
      );
      expect(propias.features.map((f) => f.id)).toContain(id);
      const exportacion = ExportacionGeoJsonSchema.parse(
        (
          await get('/api/v1/exportar?categoria=bache&formato=geojson', cookies.tecnico, demorada)
        ).json(),
      );
      expect(exportacion.features.map((f) => f.id)).not.toContain(id);
      expect((await get(`/api/v1/fotos/${key}`, undefined, demorada)).statusCode).toBe(404);
      const fotoPropia = await get(`/api/v1/fotos/${key}`, cookies.vecina, demorada);
      expect(fotoPropia.statusCode).toBe(200);
      expect(fotoPropia.headers['cache-control']).toBe('private, no-store');
      expect((await auditoria(id))[0]!.despues.publicar_en).toBe(primero.properties.publicar_en);
    } finally {
      await demorada.close();
    }
  });

  it('replay con GPS releído conserva id/publicar_en y no duplica filas, auditoría ni cupo', async () => {
    const headers = { 'idempotency-key': 'm6-bache-replay-0001' };
    const primero = await enviar(cuerpoBache(), app, cookies.vecina, headers);
    expect(primero.statusCode).toBe(201);
    const antes = await contadores();
    const replay = await enviar(
      cuerpoBache({ dispositivo: { ...TELEFONO, precision_m: 20, antiguedad_s: 12 } }),
      app,
      cookies.vecina,
      headers,
    );
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    const p = MiReporteFeatureSchema.parse(primero.json());
    const r = MiReporteFeatureSchema.parse(replay.json());
    expect(r.id).toBe(p.id);
    expect(r.properties.publicar_en).toBe(p.properties.publicar_en);
    expect(await contadores()).toEqual(antes);
  });

  it.each([
    { nombre: 'subtipo', extra: { subtipo: 'asfalto_levantado' } },
    { nombre: 'detalle', extra: { detalle: { ...DETALLE, tamano: 'rueda' } } },
    {
      nombre: 'categoría',
      extra: {
        categoria: 'inundacion',
        subtipo: null,
        detalle: { profundidad_estimada: 'rodilla', frecuencia: 'ocasional' },
      },
    },
  ])('la misma clave con otra $nombre da 409 sin otro gasto', async ({ extra }) => {
    const headers = { 'idempotency-key': 'm6-bache-conflicto-0001' };
    expect((await enviar(cuerpoBache(), app, cookies.vecina, headers)).statusCode).toBe(201);
    const antes = await contadores();
    const r = await enviar(cuerpoBache(extra), app, cookies.vecina, headers);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
    expect(await contadores()).toEqual(antes);
  });

  it('el límite real de Bache es independiente del de Flood y /auth/yo conserva legado', async () => {
    for (let n = 0; n < DEFINICION_BACHE.cupo.limite; n++) await crear();
    const exceso = await enviar(cuerpoBache());
    expect(exceso.statusCode).toBe(429);
    expect(exceso.json()).toMatchObject({
      codigo: 'CUOTA_DE_REPORTES',
      detalles: { categoria: 'bache' },
    });
    expect(Number(exceso.headers['retry-after'])).toBeGreaterThan(0);
    expect((await enviar({ ...reporteValido })).statusCode).toBe(201);
    const yo = (await get('/api/v1/auth/yo', cookies.vecina)).json();
    expect(yo.cupos.bache.restantes).toBe(0);
    expect(yo.cupos.inundacion.restantes).toBe(DEFINICION_INUNDACION.cupo.limite - 1);
    expect(yo.reportes_restantes_hoy).toBe(yo.cupos.inundacion.restantes);
    expect(yo.fotos_restantes_hoy).toBe(CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA);
  });

  it('el override de instalación se aplica a cada categoría real sin compartir contador', async () => {
    const limitada = await montar({ reportesPorDiaOverride: 1, reportesPorDia: 1 });
    try {
      for (const cuerpo of [cuerpoBache(), { ...reporteValido }]) {
        expect((await enviar(cuerpo, limitada)).statusCode).toBe(201);
        const exceso = await enviar(cuerpo, limitada);
        expect(exceso.statusCode).toBe(429);
      }
      const yo = (await get('/api/v1/auth/yo', cookies.vecina, limitada)).json();
      expect(yo.cupos.bache.restantes).toBe(0);
      expect(yo.cupos.inundacion.restantes).toBe(0);
      expect(yo.reportes_restantes_hoy).toBe(0);
    } finally {
      await limitada.close();
    }
  });
});

describe('M6 real: moderación, fotos y privacidad', () => {
  it('valida, reclasifica y resuelve sin cambiar el modelo calculado', async () => {
    const f = await crear();
    const id = f.id!;
    const validado = await estado(id, 'validado');
    expect(validado.statusCode, validado.body).toBe(200);
    expect(
      ReporteTecnicoFeatureSchema.parse(validado.json()).properties.punto_critico_id,
    ).not.toBeNull();
    const sinMotivo = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/severidad`,
      cookies: sesion(cookies.tecnico),
      payload: { severidad_manual: 'alta' },
    });
    expect(sinMotivo.statusCode).toBe(400);
    const manual = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/severidad`,
      cookies: sesion(cookies.tecnico),
      payload: { severidad_manual: 'alta', severidad_motivo: 'Revisión técnica del bache.' },
    });
    expect(manual.statusCode, manual.body).toBe(200);
    expect(ReporteTecnicoFeatureSchema.parse(manual.json()).properties).toMatchObject({
      severidad: 'alta',
      severidad_calculada: 'baja',
      severidad_puntaje: 2,
    });
    const resuelto = await estado(id, 'resuelto');
    expect(resuelto.statusCode, resuelto.body).toBe(200);
    expect((await get(`/api/v1/reportes/${id}`)).json().properties.estado).toBe('resuelto');
    expect((await estado(id, 'validado')).statusCode).toBe(409);
    const acciones = await auditoria(id);
    expect(acciones.map((a) => a.accion)).toEqual(
      expect.arrayContaining(['crear', 'estado:nuevo->validado', 'estado:validado->resuelto']),
    );
    expect(acciones.every((a) => Boolean(a.actor_id))).toBe(true);
    expect(acciones.find((a) => a.accion === 'estado:nuevo->validado')!.antes).toMatchObject({
      estado: 'nuevo',
    });
  });

  it('rechaza, reabre y retira un verificado solo como admin, conservando historial del autor', async () => {
    const id = (await crear()).id!;
    expect((await estado(id, 'rechazado')).statusCode).toBe(200);
    expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
    expect((await estado(id, 'nuevo', cookies.tecnico)).statusCode).toBe(403);
    expect((await estado(id, 'nuevo', cookies.admin)).statusCode).toBe(200);
    expect((await estado(id, 'validado')).statusCode).toBe(200);
    expect((await estado(id, 'rechazado')).statusCode).toBe(403);
    expect((await estado(id, 'rechazado', cookies.admin)).statusCode).toBe(200);
    const propios = MisReportesSchema.parse(
      (await get('/api/v1/mis-reportes', cookies.vecina)).json(),
    );
    expect(propios.features.find((f) => f.id === id)!.properties).toMatchObject({
      estado: 'rechazado',
      retirado: true,
    });
  });

  it('fusiona Baches entre sí y rechaza ambos caminos de fusión con Flood sin efectos', async () => {
    const b = await crear();
    const canonico = await crear({}, app, cookies.vecino);
    expect((await estado(canonico.id!, 'validado')).statusCode).toBe(200);
    const flood = await enviar({ ...reporteValido });
    expect(flood.statusCode).toBe(201);
    const idFlood = flood.json().id as string;
    expect((await estado(idFlood, 'validado')).statusCode).toBe(200);
    const antes = await auditoria(b.id!);
    for (const method of ['PATCH', 'POST'] as const) {
      const r = await app.inject({
        method,
        url: `/api/v1/reportes/${b.id}/${method === 'PATCH' ? 'estado' : 'fusionar'}`,
        cookies: sesion(cookies.tecnico),
        payload:
          method === 'PATCH'
            ? {
                estado: 'duplicado',
                fusionado_en_id: idFlood,
                estado_motivo: 'Fusión cruzada prohibida.',
              }
            : { canonico_id: idFlood, motivo: 'Fusión cruzada prohibida.' },
      });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().codigo).toBe('FUSION_ENTRE_CATEGORIAS');
    }
    expect(await auditoria(b.id!)).toEqual(antes);
    expect(
      (await get(`/api/v1/tecnico/reportes/${b.id}`, cookies.tecnico)).json().properties,
    ).toMatchObject({ estado: 'nuevo', fusionado_en_id: null });
    const fusion = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${b.id}/fusionar`,
      cookies: sesion(cookies.tecnico),
      payload: { canonico_id: canonico.id!.slice(0, 8), motivo: 'Es el mismo bache de prueba.' },
    });
    expect(fusion.statusCode, fusion.body).toBe(200);
    expect(ReporteTecnicoFeatureSchema.parse(fusion.json()).properties).toMatchObject({
      estado: 'duplicado',
      fusionado_en_id: canonico.id,
    });
    expect((await get(`/api/v1/reportes/${b.id}`)).statusCode).toBe(404);
  });

  it.each(['vecina', 'ejecutivo'] as const)(
    '%s sigue sin poder moderar ni exportar',
    async (rol) => {
      const id = (await crear()).id!;
      const antes = await auditoria(id);
      expect((await estado(id, 'validado', cookies[rol])).statusCode).toBe(403);
      expect(
        (await get('/api/v1/exportar?categoria=bache&formato=geojson', cookies[rol])).statusCode,
      ).toBe(403);
      expect(await auditoria(id)).toEqual(antes);
    },
  );

  it('foto ajena revierte creación/cupo/clave; la dueña la asocia y sale WebP sin metadatos', async () => {
    const key = await subir();
    const antes = await contadores();
    const ajena = await enviar(cuerpoBache({ fotos: [key] }), app, cookies.vecino, {
      'idempotency-key': 'm6-foto-ajena-0001',
    });
    expect(ajena.statusCode).toBe(400);
    expect(ajena.json().codigo).toBe('FOTOS_INVALIDAS');
    expect(await contadores()).toEqual(antes);
    const libre = await pool.query('SELECT reporte_id FROM reporte_foto WHERE objeto_key = $1', [
      key,
    ]);
    expect(libre.rows[0].reporte_id).toBeNull();
    const id = (await crear({ fotos: [key] })).id!;
    const foto = await get(`/api/v1/fotos/${key}`);
    expect(foto.statusCode).toBe(200);
    expect(foto.headers['cache-control']).toBe('public, no-cache');
    expect(foto.headers.etag).toBeTruthy();
    expect(trozosRiff(foto.rawPayload)).toEqual(
      expect.not.arrayContaining(['EXIF', 'XMP ', 'ICCP']),
    );
    expect((await estado(id, 'rechazado')).statusCode).toBe(200);
    expect((await get(`/api/v1/fotos/${key}`)).statusCode).toBe(404);
    expect((await get(`/api/v1/fotos/${key}`, cookies.vecina)).headers['cache-control']).toBe(
      'private, no-store',
    );
  }, 30_000);

  it('las fotos mantienen un único cupo configurado aunque se asocien a categorías distintas', async () => {
    const fotosLimitadas = await montar({ fotosPorDia: 2 });
    try {
      const uno = await subir(cookies.vecina, fotosLimitadas);
      await crear({ fotos: [uno] }, fotosLimitadas);
      const dos = await subir(cookies.vecina, fotosLimitadas);
      expect((await enviar({ ...reporteValido, fotos: [dos] }, fotosLimitadas)).statusCode).toBe(
        201,
      );
      const exceso = await fotosLimitadas.inject({
        method: 'POST',
        url: '/api/v1/fotos',
        cookies: sesion(cookies.vecina),
        ...multipart('archivo', 'm6.jpg', 'image/jpeg', imagen),
      });
      expect(exceso.statusCode).toBe(429);
      expect(exceso.json().codigo).toBe('CUOTA_DE_FOTOS');
      const yo = (await get('/api/v1/auth/yo', cookies.vecina, fotosLimitadas)).json();
      expect(yo.fotos_restantes_hoy).toBe(0);
      const filas = await pool.query(
        "SELECT clave, n FROM cupo_contador WHERE clave LIKE 'fotos:%'",
      );
      expect(filas.rows).toEqual([{ clave: 'fotos:cuenta', n: 2 }]);
    } finally {
      await fotosLimitadas.close();
    }
  }, 30_000);

  it('no guarda ni publica la posición del dispositivo y conserva jitter/recorte del Bache real', async () => {
    const r = await enviar(
      cuerpoBache({
        ubicacion_tipo: 'vivienda_o_predio',
        dispositivo: { ...TELEFONO, precision_m: 8, antiguedad_s: 3 },
      }),
      app,
      cookies.vecina,
      { 'idempotency-key': 'm6-privacidad-0001' },
    );
    expect(r.statusCode, r.body).toBe(201);
    const propio = MiReporteFeatureSchema.parse(r.json());
    const id = propio.id!;
    const publico = await get(`/api/v1/reportes/${id}`);
    const publicoConCookie = await get(`/api/v1/reportes/${id}`, cookies.tecnico);
    expect(publico.statusCode).toBe(200);
    expect(publico.json().geometry).toEqual(publicoConCookie.json().geometry);
    expect(publico.json().geometry.coordinates).not.toEqual([PUNTO.lon, PUNTO.lat]);
    expect(publico.json().properties.precision_degradada).toBe(true);
    expect(publico.json().properties.detalle).toEqual(DETALLE);
    for (const campo of ['autor_id', 'precision_gps_m', 'distancia_dispositivo_m', 'dispositivo'])
      expect(publico.json().properties).not.toHaveProperty(campo);
    const tecnica = await get(`/api/v1/tecnico/reportes/${id}`, cookies.tecnico);
    expect(tecnica.json().geometry.coordinates).toEqual([PUNTO.lon, PUNTO.lat]);
    expect(propio.geometry.coordinates).toEqual([PUNTO.lon, PUNTO.lat]);
    expect(tecnica.json().properties.distancia_dispositivo_m).toBeGreaterThan(30);
    const fila = await pool.query<{ t: string }>(
      'SELECT row_to_json(r)::text AS t FROM reporte r WHERE id = $1',
      [id],
    );
    const huellas = await pool.query<{ t: string }>(
      "SELECT coalesce(json_agg(i), '[]')::text AS t FROM idempotencia i",
    );
    const csv = await get('/api/v1/exportar?categoria=bache&formato=csv', cookies.tecnico);
    const geo = await get('/api/v1/exportar?categoria=bache&formato=geojson', cookies.tecnico);
    const antesDelRechazo = await contadores();
    const rechazo = await enviar(
      cuerpoBache({ dispositivo: { ...TELEFONO, precision_m: 80, antiguedad_s: 3 } }),
    );
    expect(rechazo.statusCode).toBe(422);
    expect(await contadores()).toEqual(antesDelRechazo);
    expect(log.join('')).toContain('reporte rechazado por la ubicación del dispositivo');
    for (const texto of [
      fila.rows[0]!.t,
      JSON.stringify(await auditoria(id)),
      huellas.rows[0]!.t,
      r.body,
      publico.body,
      tecnica.body,
      csv.body,
      geo.body,
      rechazo.body,
      log.join(''),
    ])
      for (const rastro of RASTROS) expect(texto).not.toContain(rastro);
  });
});

describe('M6 real: doble puerta de disponibilidad', () => {
  it.each([
    { activa: false, definida: false },
    { activa: true, definida: false },
    { activa: false, definida: true },
    { activa: true, definida: true },
  ])(
    'catálogo=$activa y definición=$definida en configuración, lectura y escritura',
    async ({ activa, definida }) => {
      await pool.query("UPDATE categoria SET activa = $1 WHERE slug = 'bache'", [activa]);
      const target = await montar({}, definida ? REGISTRO_CATEGORIAS : SIN_BACHE);
      try {
        const disponible = activa && definida;
        const config = await get('/api/v1/configuracion', undefined, target);
        expect(config.statusCode).toBe(200);
        expect(config.headers['cache-control']).toBe('public, max-age=300');
        expect(config.json().categorias_activas).toEqual(
          disponible ? ['inundacion', 'bache'] : ['inundacion'],
        );
        const yo = (await get('/api/v1/auth/yo', cookies.vecina, target)).json();
        expect(Object.keys(yo.cupos).sort()).toEqual(
          disponible ? ['bache', 'inundacion'] : ['inundacion'],
        );
        const lectura = await get('/api/v1/reportes?categoria=bache', undefined, target);
        expect(lectura.statusCode).toBe(disponible ? 200 : 400);
        const antes = await contadores();
        const pipAntes = llamadasPip;
        const alta = await enviar(cuerpoBache(), target);
        expect(alta.statusCode, alta.body).toBe(disponible ? 201 : 422);
        if (!disponible) {
          expect(alta.json().codigo).toBe('CATEGORIA_NO_DISPONIBLE');
          expect(llamadasPip).toBe(pipAntes);
          expect(await contadores()).toEqual(antes);
        }
      } finally {
        await target.close();
      }
    },
  );

  it('desactivar oculta creación/público/foto y conserva historial técnico y propio', async () => {
    const key = await subir();
    const id = (await crear({ fotos: [key] })).id!;
    await pool.query("UPDATE categoria SET activa = false WHERE slug = 'bache'");
    app.categorias.invalidar();
    const antes = await contadores();
    expect((await enviar(cuerpoBache())).statusCode).toBe(422);
    expect(await contadores()).toEqual(antes);
    expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
    expect((await get(`/api/v1/fotos/${key}`)).statusCode).toBe(404);
    expect((await get(`/api/v1/tecnico/reportes/${id}`, cookies.tecnico)).statusCode).toBe(200);
    expect((await get(`/api/v1/fotos/${key}`, cookies.tecnico)).statusCode).toBe(200);
    expect(
      MisReportesSchema.parse(
        (await get('/api/v1/mis-reportes', cookies.vecina)).json(),
      ).features.map((f) => f.id),
    ).toContain(id);
    expect(
      ExportacionGeoJsonSchema.parse(
        (await get('/api/v1/exportar?categoria=bache&formato=geojson', cookies.tecnico)).json(),
      ).features.map((f) => f.id),
    ).toContain(id);
  }, 30_000);
});
