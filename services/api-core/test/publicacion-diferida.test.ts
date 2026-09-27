/**
 * Publicación sin moderación previa, con demora (contracts 0.11.0, ADR 0006, plan S20).
 *
 * Un reporte queda en `nuevo` y se publica solo cuando llega su `publicar_en`: 60 s después de
 * crearlo si es el 1.º del día de la cuenta y 240 s si es el 2.º o el 3.º. Hasta entonces no lo
 * ve NADIE más que su autor, técnicos incluidos. La regla es un filtro (`publicar_en <= now()`) y
 * tiene que estar en todas las vistas: la prueba de tabla de abajo las recorre.
 *
 * Esta suite usa las demoras REALES (`leerConfig` sin `configDePrueba`) y `publicarYa` para no
 * esperar minutos.
 */
import {
  CONFIG_DOMINIO,
  ETIQUETAS,
  MiReporteFeatureSchema,
  MisReportesSchema,
  ReporteFeatureSchema,
  SesionActualSchema,
} from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { avisosDeConfiguracion, leerConfig } from '../src/config.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  multipart,
  publicarYa,
  reporteEn,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const PRIMERO = CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S;
const SIGUIENTES = CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S;

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
const cookies: Record<keyof typeof CUENTAS, string> = {
  tecnico: '',
  admin: '',
  vecina: '',
  vecino: '',
  ejecutivo: '',
};
let JPEG: Buffer;

async function nuevaApp(): Promise<FastifyInstance> {
  return crearApp({
    pool,
    cfg: {
      // Las demoras de verdad: 60 y 240 s.
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 10_000,
      tokenMetricas: '',
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
}

beforeAll(async () => {
  JPEG = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#28934D' } })
    .jpeg()
    .toBuffer();
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await nuevaApp();
  for (const k of Object.keys(CUENTAS) as (keyof typeof CUENTAS)[])
    cookies[k] = await iniciarSesion(app, CUENTAS[k]);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM cuota_reporte_diaria');
});

function crear(cookie: string, payload: Record<string, unknown> = reporteValido, headers = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
    cookies: sesion(cookie),
    headers,
  });
}

function get(url: string, cookie?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'GET',
    url,
    headers,
    ...(cookie ? { cookies: sesion(cookie) } : {}),
  });
}

async function subirFoto(cookie: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/fotos',
    cookies: sesion(cookie),
    ...multipart('archivo', 'f.jpg', 'image/jpeg', JPEG),
  });
  expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
  return r.json().objeto_key as string;
}

const demoraDe = (p: { creado_en: string; publicar_en: string }) =>
  Math.round((Date.parse(p.publicar_en) - Date.parse(p.creado_en)) / 1000);

const ids = (r: { json(): { features: Array<{ id: string }> } }) =>
  r.json().features.map((f) => f.id);

describe('la demora la decide el servidor', () => {
  it(`${PRIMERO} s el 1.º reporte del día y ${SIGUIENTES} s el 2.º y el 3.º`, async () => {
    const demoras: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await crear(cookies.vecina);
      expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
      const f = MiReporteFeatureSchema.parse(r.json());
      demoras.push(demoraDe(f.properties));
      expect(f.properties.estado).toBe('nuevo');
      expect(f.properties.verificado).toBe(false);
      expect(f.properties.retirado).toBe(false);
      // Calculados en la base al responder: casi toda la demora.
      expect(f.properties.segundos_para_publicar).toBeLessThanOrEqual(demoraDe(f.properties));
      expect(f.properties.segundos_para_publicar).toBeGreaterThan(demoraDe(f.properties) - 10);
    }
    expect(demoras).toEqual([PRIMERO, SIGUIENTES, SIGUIENTES]);
  });

  it('el 201 es la vista del autor: coordenada exacta y sin autor ni campos de moderación', async () => {
    const r = await crear(
      cookies.vecina,
      reporteEn(-17.7912345, -63.1934567, {
        ubicacion_tipo: 'vivienda_o_predio',
      }),
    );
    expect(r.statusCode).toBe(201);
    expect(r.json().geometry.coordinates).toEqual([-63.1934567, -17.7912345]);
    for (const campo of ['autor_id', 'estado_motivo', 'ubicacion_metodo', 'ip_hash'])
      expect(r.json().properties, campo).not.toHaveProperty(campo);
    expect(r.headers['cache-control']).toBe('private, no-store');
  });

  it('un replay devuelve el mismo publicar_en y no gasta turno', async () => {
    const clave = 'publicacion-replay-0001';
    const primera = await crear(cookies.vecino, reporteValido, { 'idempotency-key': clave });
    expect(primera.statusCode).toBe(201);
    const otra = await crear(cookies.vecino, reporteValido, { 'idempotency-key': clave });
    expect(otra.statusCode).toBe(200);
    const a = MiReporteFeatureSchema.parse(primera.json()).properties;
    const b = MiReporteFeatureSchema.parse(otra.json()).properties;
    expect(b.id).toBe(a.id);
    expect(b.publicar_en).toBe(a.publicar_en);
    expect(b.segundos_para_publicar).toBeLessThanOrEqual(a.segundos_para_publicar);
    // El siguiente reporte de verdad es el 2.º del día: 240 s, no 60 (el replay no contó).
    const segundo = await crear(cookies.vecino);
    expect(demoraDe(segundo.json().properties)).toBe(SIGUIENTES);
  });

  it('la auditoría de crear registra publicar_en', async () => {
    const r = await crear(cookies.vecina);
    const a = await pool.query<{ despues: { publicar_en?: string } }>(
      `SELECT despues FROM auditoria WHERE entidad = 'reporte' AND entidad_id = $1 AND accion = 'crear'`,
      [r.json().id],
    );
    expect(a.rows[0]?.despues.publicar_en).toBe(r.json().properties.publicar_en);
  });

  it('/auth/yo avisa la demora del próximo: 60 s si no envió ninguno hoy, 240 s si ya envió', async () => {
    const yo = async () =>
      SesionActualSchema.parse((await get('/api/v1/auth/yo', cookies.vecina)).json());
    expect((await yo()).demora_proximo_s).toBe(PRIMERO);
    expect((await crear(cookies.vecina)).statusCode).toBe(201);
    expect((await yo()).demora_proximo_s).toBe(SIGUIENTES);
  });
});

describe('mientras espera no lo ve nadie más que su autor (prueba de tabla)', () => {
  let id: string;
  let foto: string;
  /** Publicado y validado: un canónico válido, para que la fusión solo pueda fallar por la espera. */
  let canonico: string;

  beforeAll(async () => {
    const c = await crear(cookies.admin, reporteEn(-17.7955, -63.1985));
    expect(c.statusCode, c.body.slice(0, 200)).toBe(201);
    canonico = c.json().id;
    await publicarYa(ex, canonico);
    const v = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${canonico}/estado`,
      payload: { estado: 'validado' },
      cookies: sesion(cookies.tecnico),
    });
    expect(v.statusCode, v.body.slice(0, 200)).toBe(200);

    foto = await subirFoto(cookies.vecina);
    const r = await crear(cookies.vecina, reporteEn(-17.795, -63.198, { fotos: [foto] }));
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    id = r.json().id;
    expect(r.json().properties.segundos_para_publicar).toBeGreaterThan(0);
  });

  /** Una app nueva por consulta de cifras: sin caché que pueda esconder el cambio. */
  async function cifras() {
    const a = await nuevaApp();
    try {
      const ind = await a.inject({
        method: 'GET',
        url: '/api/v1/indicadores',
        cookies: sesion(cookies.tecnico),
      });
      const eje = await a.inject({
        method: 'GET',
        url: '/api/v1/ejecutivo/resumen?ventana=todo',
        cookies: sesion(cookies.ejecutivo),
      });
      return {
        nuevos: (ind.json().por_estado.nuevo ?? 0) as number,
        total: ind.json().total as number,
        enRevision: eje.json().activas.en_revision as number,
      };
    } finally {
      await a.close();
    }
  }

  const rutas = () => ({
    publico: '/api/v1/reportes?limite=500',
    detallePublico: `/api/v1/reportes/${id}`,
    tecnico: '/api/v1/tecnico/reportes?limite=500',
    detalleTecnico: `/api/v1/tecnico/reportes/${id}`,
    csv: '/api/v1/exportar?formato=csv',
    geojson: '/api/v1/exportar?formato=geojson',
  });

  it('en espera: fuera de todas las vistas; la foto solo para el autor; moderarlo o fusionarlo da 404', async () => {
    const r = rutas();
    expect(ids(await get(r.publico))).not.toContain(id);
    expect((await get(r.detallePublico)).statusCode).toBe(404);
    expect(ids(await get(r.tecnico, cookies.tecnico))).not.toContain(id);
    expect((await get(r.detalleTecnico, cookies.tecnico)).statusCode).toBe(404);
    expect((await get(r.csv, cookies.tecnico)).body).not.toContain(id);
    expect(ids(await get(r.geojson, cookies.tecnico))).not.toContain(id);

    const antes = await cifras();
    const n = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM reporte_inundacion WHERE estado = 'nuevo' AND publicar_en <= now()",
    );
    expect(antes.nuevos).toBe(n.rows[0]!.n);
    expect(antes.enRevision).toBe(n.rows[0]!.n);

    const urlFoto = `/api/v1/fotos/${foto}`;
    expect((await get(urlFoto)).statusCode).toBe(404);
    expect((await get(urlFoto, cookies.vecino)).statusCode).toBe(404);
    const alTecnico = await get(urlFoto, cookies.tecnico);
    expect(alTecnico.statusCode).toBe(404);
    expect(alTecnico.headers['cache-control']).toBe('private, no-store');
    const alAutor = await get(urlFoto, cookies.vecina);
    expect(alAutor.statusCode).toBe(200);
    expect(alAutor.headers['cache-control']).toBe('private, no-store');
    expect(alAutor.headers.etag).toBeUndefined();

    for (const [metodo, url, payload] of [
      ['PATCH', `/api/v1/reportes/${id}/estado`, { estado: 'validado' }],
      [
        'PATCH',
        `/api/v1/reportes/${id}/severidad`,
        { severidad_manual: 'alta', severidad_motivo: 'Prueba de moderación en espera' },
      ],
      ['POST', `/api/v1/reportes/${id}/fusionar`, { canonico_id: canonico }],
    ] as const) {
      const m = await app.inject({
        method: metodo,
        url,
        payload,
        cookies: sesion(cookies.tecnico),
      });
      expect(m.statusCode, url).toBe(404);
    }
    const estado = await pool.query<{
      estado: string;
      severidad_manual: string | null;
      fusionado_en_id: string | null;
    }>(
      'SELECT estado::text, severidad_manual::text, fusionado_en_id::text FROM reporte_inundacion WHERE id = $1',
      [id],
    );
    expect(estado.rows[0]).toEqual({
      estado: 'nuevo',
      severidad_manual: null,
      fusionado_en_id: null,
    });
  });

  it('con publicarYa aparece en todas, como «NO SE HA VERIFICADO» y sin autor', async () => {
    const antes = await cifras();
    await publicarYa(ex, id);
    const r = rutas();
    expect(ids(await get(r.publico))).toContain(id);
    const detalle = await get(r.detallePublico);
    expect(detalle.statusCode).toBe(200);
    const f = ReporteFeatureSchema.parse(detalle.json());
    expect(f.properties.estado).toBe('nuevo');
    expect(f.properties.verificado).toBe(false);
    expect(ETIQUETAS.estado_publico[f.properties.estado]).toBe('NO SE HA VERIFICADO');
    expect(detalle.json().properties).not.toHaveProperty('autor_id');
    expect(ids(await get(r.tecnico, cookies.tecnico))).toContain(id);
    expect((await get(r.detalleTecnico, cookies.tecnico)).statusCode).toBe(200);
    expect((await get(r.csv, cookies.tecnico)).body).toContain(id);
    expect(ids(await get(r.geojson, cookies.tecnico))).toContain(id);
    const despues = await cifras();
    expect(despues.nuevos).toBe(antes.nuevos + 1);
    expect(despues.total).toBe(antes.total + 1);
    expect(despues.enRevision).toBe(antes.enRevision + 1);

    // La foto ya es pública: se guarda en cachés, pero revalidando con ETag.
    const publica = await get(`/api/v1/fotos/${foto}`);
    expect(publica.statusCode).toBe(200);
    expect(publica.headers['cache-control']).toBe('public, no-cache');
    const etag = publica.headers.etag as string;
    expect(etag).toMatch(/^"/);
    const revalidada = await get(`/api/v1/fotos/${foto}`, undefined, { 'if-none-match': etag });
    expect(revalidada.statusCode).toBe(304);
    expect(revalidada.body).toBe('');
    expect(revalidada.headers['cache-control']).toBe('public, no-cache');
  });

  it('rechazado: 404 al público (también la foto con If-None-Match), el autor sigue viendo la suya', async () => {
    const etag = (await get(`/api/v1/fotos/${foto}`)).headers.etag as string;
    const m = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload: { estado: 'rechazado', estado_motivo: 'No es un anegamiento' },
      cookies: sesion(cookies.tecnico),
    });
    expect(m.statusCode, m.body.slice(0, 200)).toBe(200);
    expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
    expect(ids(await get('/api/v1/reportes?limite=500'))).not.toContain(id);
    const conEtag = await get(`/api/v1/fotos/${foto}`, undefined, { 'if-none-match': etag });
    expect(conEtag.statusCode).toBe(404);
    expect(conEtag.headers['cache-control']).toBe('private, no-store');
    expect((await get(`/api/v1/fotos/${foto}`, cookies.vecino)).statusCode).toBe(404);
    const alAutor = await get(`/api/v1/fotos/${foto}`, cookies.vecina);
    expect(alAutor.statusCode).toBe(200);
    expect(alAutor.headers['cache-control']).toBe('private, no-store');
    // El técnico lo sigue moderando: ve la foto de un rechazado ya publicado, pero en privado.
    const alTecnico = await get(`/api/v1/fotos/${foto}`, cookies.tecnico);
    expect(alTecnico.statusCode).toBe(200);
    expect(alTecnico.headers['cache-control']).toBe('private, no-store');
  });

  it('duplicado: 404 al público (también la foto con If-None-Match), el autor sigue viendo la suya', async () => {
    const fotoDup = await subirFoto(cookies.vecino);
    const c = await crear(cookies.vecino, reporteEn(-17.7956, -63.1986, { fotos: [fotoDup] }));
    expect(c.statusCode, c.body.slice(0, 200)).toBe(201);
    const dup = c.json().id as string;
    await publicarYa(ex, dup);
    const urlFoto = `/api/v1/fotos/${fotoDup}`;
    const publica = await get(urlFoto);
    expect(publica.statusCode).toBe(200);
    const etag = publica.headers.etag as string;

    const f = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${dup}/fusionar`,
      payload: { canonico_id: canonico, motivo: 'Es el mismo charco' },
      cookies: sesion(cookies.tecnico),
    });
    expect(f.statusCode, f.body.slice(0, 200)).toBe(200);
    expect(f.json().properties).toMatchObject({ estado: 'duplicado', fusionado_en_id: canonico });

    expect((await get(`/api/v1/reportes/${dup}`)).statusCode).toBe(404);
    expect(ids(await get('/api/v1/reportes?limite=500'))).not.toContain(dup);
    const conEtag = await get(urlFoto, undefined, { 'if-none-match': etag });
    expect(conEtag.statusCode).toBe(404);
    expect(conEtag.headers['cache-control']).toBe('private, no-store');
    expect((await get(urlFoto, cookies.vecina)).statusCode).toBe(404);
    const alAutor = await get(urlFoto, cookies.vecino);
    expect(alAutor.statusCode).toBe(200);
    expect(alAutor.headers['cache-control']).toBe('private, no-store');
    expect(alAutor.headers.etag).toBeUndefined();
    // Como el rechazado: el técnico la ve en privado para seguir moderando.
    const alTecnico = await get(urlFoto, cookies.tecnico);
    expect(alTecnico.statusCode).toBe(200);
    expect(alTecnico.headers['cache-control']).toBe('private, no-store');
  });
});

describe('duplicado y retiro de verificados', () => {
  async function publicado(cookie: string, lat: number, lon: number): Promise<string> {
    const r = await crear(cookie, reporteEn(lat, lon));
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    await publicarYa(ex, r.json().id);
    return r.json().id;
  }

  function moderar(cookie: string, id: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload,
      cookies: sesion(cookie),
    });
  }

  it('un duplicado deja de verse en público', async () => {
    const canonico = await publicado(cookies.vecina, -17.792, -63.192);
    const dup = await publicado(cookies.vecino, -17.7921, -63.1921);
    expect((await moderar(cookies.tecnico, canonico, { estado: 'validado' })).statusCode).toBe(200);
    expect((await get(`/api/v1/reportes/${dup}`)).statusCode).toBe(200);
    const f = await moderar(cookies.tecnico, dup, {
      estado: 'duplicado',
      fusionado_en_id: canonico,
      estado_motivo: 'Es el mismo charco',
    });
    expect(f.statusCode, f.body.slice(0, 200)).toBe(200);
    expect((await get(`/api/v1/reportes/${dup}`)).statusCode).toBe(404);
    const verificado = await get(`/api/v1/reportes/${canonico}`);
    expect(verificado.json().properties).toMatchObject({ estado: 'validado', verificado: true });
  });

  it('validado → rechazado: solo admin (403 al técnico, con motivo), y lo saca del mapa', async () => {
    const id = await publicado(cookies.vecina, -17.793, -63.193);
    expect((await moderar(cookies.tecnico, id, { estado: 'validado' })).statusCode).toBe(200);
    const tecnico = await moderar(cookies.tecnico, id, {
      estado: 'rechazado',
      estado_motivo: 'Contenido inapropiado',
    });
    expect(tecnico.statusCode).toBe(403);
    expect(tecnico.json().codigo).toBe('SIN_PERMISO');
    expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(200);
    const sinMotivo = await moderar(cookies.admin, id, { estado: 'rechazado' });
    expect(sinMotivo.statusCode).toBe(400);
    const admin = await moderar(cookies.admin, id, {
      estado: 'rechazado',
      estado_motivo: 'Contenido inapropiado',
    });
    expect(admin.statusCode, admin.body.slice(0, 200)).toBe(200);
    expect(admin.json().properties.estado).toBe('rechazado');
    expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
    const a = await pool.query<{ accion: string }>(
      `SELECT accion FROM auditoria WHERE entidad_id = $1 ORDER BY creado_en DESC LIMIT 1`,
      [id],
    );
    expect(a.rows[0]?.accion).toBe('estado:validado->rechazado');
  });

  it('una transición que no existe sigue siendo 409 (resuelto → validado)', async () => {
    const id = await publicado(cookies.vecino, -17.794, -63.194);
    expect((await moderar(cookies.tecnico, id, { estado: 'validado' })).statusCode).toBe(200);
    expect(
      (await moderar(cookies.tecnico, id, { estado: 'resuelto', estado_motivo: 'Se limpió' }))
        .statusCode,
    ).toBe(200);
    const r = await moderar(cookies.admin, id, { estado: 'validado' });
    expect(r.statusCode).toBe(409);
    expect(r.json().codigo).toBe('TRANSICION_NO_PERMITIDA');
  });
});

describe('GET /mis-reportes', () => {
  it('401 sin sesión', async () => {
    const r = await get('/api/v1/mis-reportes');
    expect(r.statusCode).toBe(401);
  });

  it('solo lo propio, en cualquier estado, privado y conforme al contrato', async () => {
    const propio = await crear(cookies.ejecutivo, reporteEn(-17.796, -63.196));
    expect(propio.statusCode).toBe(201);
    const ajeno = await crear(cookies.vecino, reporteEn(-17.797, -63.197));
    expect(ajeno.statusCode).toBe(201);
    const r = await get('/api/v1/mis-reportes', cookies.ejecutivo);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(String(r.headers.vary)).toMatch(/Cookie/);
    const cuerpo = MisReportesSchema.parse(r.json());
    const lista = cuerpo.features.map((f) => f.id);
    expect(lista).toContain(propio.json().id);
    expect(lista).not.toContain(ajeno.json().id);
    const mio = cuerpo.features.find((f) => f.id === propio.json().id)!;
    // En espera: el autor lo ve, con los segundos que faltan.
    expect(mio.properties.segundos_para_publicar).toBeGreaterThan(0);
    expect(mio.properties).toMatchObject({ estado: 'nuevo', verificado: false, retirado: false });
    const autores = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reporte_inundacion
        WHERE id = ANY($1::uuid[]) AND autor_id <> (SELECT id FROM usuario WHERE email = $2)`,
      [lista, CUENTAS.ejecutivo],
    );
    expect(autores.rows[0]!.n).toBe(0);
  });

  it(`como mucho ${CONFIG_DOMINIO.MIS_REPORTES_MAX}, los más recientes primero, y marca los retirados`, async () => {
    const r = await get('/api/v1/mis-reportes', cookies.vecina);
    const f = MisReportesSchema.parse(r.json()).features;
    expect(f.length).toBeLessThanOrEqual(CONFIG_DOMINIO.MIS_REPORTES_MAX);
    const fechas = f.map((x) => Date.parse(x.properties.creado_en));
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
    const retirados = f.filter((x) => x.properties.estado === 'rechazado');
    expect(retirados.length).toBeGreaterThan(0);
    for (const x of retirados) expect(x.properties.retirado).toBe(true);
  });
});

describe('métrica de la bandeja sin verificar', () => {
  const valor = async () => {
    const r = await get('/metrics');
    const linea = r.body
      .split('\n')
      .find((l) => l.startsWith('curichi_reportes_sin_verificar_antiguedad_segundos{'));
    return linea === undefined ? undefined : Number(linea.split(' ').pop());
  };

  it('0 sin pendientes publicados; la antigüedad del más viejo si hay', async () => {
    await pool.query(
      "UPDATE reporte_inundacion SET estado = 'rechazado', estado_motivo = 'x' WHERE estado = 'nuevo'",
    );
    expect(await valor()).toBe(0);
    const r = await crear(cookies.vecino, reporteEn(-17.798, -63.198));
    // En espera no cuenta: todavía no está en la bandeja pública.
    expect(await valor()).toBe(0);
    await pool.query(
      `UPDATE reporte_inundacion SET creado_en = now() - interval '2 hours',
              publicar_en = now() - interval '2 hours' + interval '1 minute' WHERE id = $1`,
      [r.json().id],
    );
    const s = await valor();
    expect(s).toBeGreaterThan(2 * 3600 - 120);
    expect(s).toBeLessThan(2 * 3600);
  });
});

describe('REPORTE_DEMORA_PRIMERO_S y REPORTE_DEMORA_SIGUIENTES_S', () => {
  it('por defecto las del contrato; de 0 a 3600; fuera de rango no arranca', () => {
    expect(leerConfig({})).toMatchObject({
      demoraPrimeroS: PRIMERO,
      demoraSiguientesS: SIGUIENTES,
    });
    expect(
      leerConfig({ REPORTE_DEMORA_PRIMERO_S: '0', REPORTE_DEMORA_SIGUIENTES_S: '3600' }),
    ).toMatchObject({ demoraPrimeroS: 0, demoraSiguientesS: 3600 });
    expect(() => leerConfig({ REPORTE_DEMORA_PRIMERO_S: '3601' })).toThrow(
      /REPORTE_DEMORA_PRIMERO_S/,
    );
    expect(() => leerConfig({ REPORTE_DEMORA_SIGUIENTES_S: '-1' })).toThrow(
      /REPORTE_DEMORA_SIGUIENTES_S/,
    );
    expect(() => leerConfig({ REPORTE_DEMORA_SIGUIENTES_S: 'un rato' })).toThrow(
      /REPORTE_DEMORA_SIGUIENTES_S/,
    );
  });

  it('en producción, definirlas deja un aviso para el log del arranque', () => {
    expect(avisosDeConfiguracion({ NODE_ENV: 'production' })).toEqual([]);
    expect(avisosDeConfiguracion({ REPORTE_DEMORA_PRIMERO_S: '0' })).toEqual([]);
    const avisos = avisosDeConfiguracion({
      NODE_ENV: 'production',
      REPORTE_DEMORA_PRIMERO_S: '0',
      REPORTE_DEMORA_SIGUIENTES_S: '240',
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/REPORTE_DEMORA_PRIMERO_S/);
    expect(avisos[0]).toMatch(/REPORTE_DEMORA_SIGUIENTES_S/);
  });
});
