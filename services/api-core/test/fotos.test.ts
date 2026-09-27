import { randomUUID } from 'node:crypto';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { Metricas } from '../src/observabilidad.js';
import { detectarMime } from '../src/rutas/fotos.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  enEspera,
  iniciarSesion,
  liberarCuota,
  multipart,
  reporteValido,
  resolverDePrueba,
  sesion,
  trozosRiff,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieVecina: string;
let cookieVecino: string;
let cookieTecnico: string;
let cookieAdmin: string;
let ex: ReturnType<typeof ejecutorPg>;
const almacen = new AlmacenMemoria();
const metricas = new Metricas();

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
      ...configDePrueba({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen,
    metricas,
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
  cookieAdmin = await iniciarSesion(app, CUENTAS.admin);
  // La primera operación de sharp del proceso inicializa libvips; con la suite en paralelo eso
  // solo ya pasaba de los 5 s del primer `it`, que fallaba por tiempo y no por lo que prueba.
  await jpegConGps();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

async function jpegConGps(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#28934D' } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: 'Vecino de prueba', ImageDescription: 'foto con ubicación' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '17/1 47/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '63/1 10/1 0/1',
      },
    })
    .toBuffer();
}

describe('fotos: EXIF eliminado, límites y tipos', () => {
  it('la foto de prueba realmente trae EXIF con GPS antes de subirla', async () => {
    const meta = await sharp(await jpegConGps()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif!.length).toBeGreaterThan(50);
  });
  it('sube un JPEG con GPS y guarda un RIFF…WEBP sin EXIF, XMP ni ICCP, de 1600 px por lado', async () => {
    const { payload, headers } = multipart(
      'archivo',
      'charco.jpg',
      'image/jpeg',
      await jpegConGps(),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(201);
    const foto = r.json();
    expect(foto.exif_sanitizado).toBe(true);
    expect(foto.mime).toBe('image/webp');
    expect(foto.objeto_key).toMatch(/^[a-f0-9-]{36}\.webp$/);
    expect(foto.url).toMatch(/\/api\/v1\/fotos\/[a-f0-9-]{36}\.webp$/);
    expect([foto.ancho, foto.alto]).toEqual([1600, 1067]);
    const fila = await pool.query(
      'SELECT mime, ancho, alto, bytes FROM reporte_foto WHERE objeto_key = $1',
      [foto.objeto_key],
    );
    expect(fila.rows[0]).toMatchObject({ mime: 'image/webp', ancho: 1600, alto: 1067 });
    const guardado = await almacen.leer(foto.objeto_key);
    expect(guardado).not.toBeNull();
    expect(guardado!.mime).toBe('image/webp');
    expect(fila.rows[0].bytes).toBe(guardado!.datos.length);
    // Recorriendo el RIFF, no solo con sharp.metadata(): ningún trozo de metadatos.
    const trozos = trozosRiff(guardado!.datos);
    for (const t of ['EXIF', 'XMP ', 'ICCP']) expect(trozos).not.toContain(t);
    const meta = await sharp(guardado!.datos).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(1600);
    // Su dueña la ve (todavía no tiene reporte), como WebP y con nosniff.
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/fotos/${foto.objeto_key}`,
      cookies: sesion(cookieVecina),
    });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/webp');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.rawPayload.equals(guardado!.datos)).toBe(true);
    // y se asocia al reporte al crearlo
    const rep = await crear({
      ...reporteValido,
      fotos: [foto.objeto_key],
    });
    expect(rep.statusCode).toBe(201);
    expect(rep.json().properties.fotos[0]).toContain(foto.objeto_key);
  });
  it('un PNG y un WebP de entrada también se guardan en WebP', async () => {
    const entradas = [
      [
        'f.png',
        'image/png',
        await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0D6189' } })
          .png()
          .toBuffer(),
      ],
      [
        'f.webp',
        'image/webp',
        await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0F2D43' } })
          .webp()
          .toBuffer(),
      ],
    ] as const;
    for (const [nombre, mime, datos] of entradas) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/fotos',
        cookies: sesion(cookieVecino),
        ...multipart('archivo', nombre, mime, datos),
      });
      expect(r.statusCode, `${nombre}: ${r.body.slice(0, 200)}`).toBe(201);
      expect(r.json().mime).toBe('image/webp');
      expect(r.json().objeto_key).toMatch(/\.webp$/);
      const guardado = await almacen.leer(r.json().objeto_key);
      expect(trozosRiff(guardado!.datos)[0]).toMatch(/^VP8/);
    }
  });
  it('rechaza tipos no permitidos por magic bytes aunque la extensión diga .jpg', async () => {
    const { payload, headers } = multipart(
      'archivo',
      'malicioso.jpg',
      'image/jpeg',
      Buffer.from('<html><script>alert(1)</script></html>'),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(415);
    expect(detectarMime(Buffer.from('GIF89a......'))).toBeNull();
  });
  it('rechaza archivos por encima del límite', async () => {
    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]);
    const { payload, headers } = multipart('archivo', 'grande.jpg', 'image/jpeg', grande);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(413);
  });
  /**
   * Subir una foto es escribir, y escribir exige cuenta desde la Fase 5. Era el último camino
   * abierto a cualquiera para hacer trabajar al servicio —decodificar y reescribir hasta 8 MB de
   * imagen es lo más caro que hace este proceso— y para dejar bytes en el almacén sin que nadie
   * respondiera por ellos.
   */
  it('sin sesión no se puede subir una foto', async () => {
    const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#123' } })
      .jpeg()
      .toBuffer();
    const { payload, headers } = multipart('archivo', 'f.jpg', 'image/jpeg', jpeg);
    const r = await app.inject({ method: 'POST', url: '/api/v1/fotos', payload, headers });
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('SIN_SESION');
  });

  it('404 para claves inexistentes o inválidas', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/fotos/../../etc/passwd' })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/fotos/00000000-0000-0000-0000-000000000000.jpg',
        })
      ).statusCode,
    ).toBe(404);
  });
});

/**
 * `curichi_fotos_subidas_total{resultado=...}` y `curichi_fotos_procesado_segundos` (revisión de
 * producción, §13): antes de esto no había ninguna métrica de subidas, así que un almacén sin
 * permisos de escritura solo se notaba cuando un vecino avisaba que no podía adjuntar una foto.
 */
describe('métrica de subidas de fotos (revisión de producción, §13)', () => {
  it('una subida aceptada cuenta "aceptada" y observa el procesado', async () => {
    const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#111' } })
      .jpeg()
      .toBuffer();
    const { payload, headers } = multipart('archivo', 'ok.jpg', 'image/jpeg', jpeg);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    const expuesto = metricas.exponer();
    expect(expuesto).toContain('curichi_fotos_subidas_total{resultado="aceptada"}');
    expect(expuesto).toMatch(/curichi_fotos_procesado_segundos_count\{\} [1-9]/);
  });

  it('rechazada por tipo (magic bytes) cuenta "rechazada_tipo"', async () => {
    const { payload, headers } = multipart(
      'archivo',
      'x.jpg',
      'image/jpeg',
      Buffer.from('esto no es una imagen'),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(415);
    expect(metricas.exponer()).toContain('curichi_fotos_subidas_total{resultado="rechazada_tipo"}');
  });

  it('rechazada por tamaño cuenta "rechazada_tamano"', async () => {
    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]);
    const { payload, headers } = multipart('archivo', 'grande.jpg', 'image/jpeg', grande);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(413);
    expect(metricas.exponer()).toContain(
      'curichi_fotos_subidas_total{resultado="rechazada_tamano"}',
    );
  });

  it('una imagen con magic bytes válidos pero corrupta cuenta "error"', async () => {
    // Cabecera JPEG real truncada: pasa detectarMime (mira los primeros bytes) pero no tiene los
    // marcadores para que sharp le saque ancho y alto, así que sanitizarImagen() lanza.
    const jpegValido = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#123' },
    })
      .jpeg()
      .toBuffer();
    const truncado = jpegValido.subarray(0, 40);
    const { payload, headers } = multipart('archivo', 'roto.jpg', 'image/jpeg', truncado);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      payload,
      headers,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(415);
    expect(r.json().codigo).toBe('IMAGEN_INVALIDA');
    expect(metricas.exponer()).toContain('curichi_fotos_subidas_total{resultado="error"}');
  });
});

describe('visibilidad de las fotos de un reporte (§13, contracts 0.11.0)', () => {
  /** Sube una foto y la asocia a un reporte que queda en el estado pedido. */
  async function fotoDeReporteEn(estado: string, espera = false): Promise<string> {
    const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#123' } })
      .jpeg()
      .toBuffer();
    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      cookies: sesion(cookieVecina),
      ...multipart('archivo', 'f.jpg', 'image/jpeg', jpeg),
    });
    expect(sub.statusCode).toBe(201);
    const key = sub.json().objeto_key as string;
    const creado = await crear({
      ...reporteValido,
      fotos: [key],
    });
    expect(creado.statusCode).toBe(201);
    if (estado !== 'nuevo')
      await pool.query('UPDATE reporte_inundacion SET estado = $2::estado_reporte WHERE id = $1', [
        creado.json().id,
        estado,
      ]);
    if (espera) await enEspera(ex, creado.json().id);
    return key;
  }

  it('no sirve la foto de un reporte que todavía espera su publicación', async () => {
    const key = await fotoDeReporteEn('nuevo', true);
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode, 'mientras espera no se publica: su foto tampoco').toBe(404);
  });

  it('sí sirve la de un nuevo ya publicado: sin verificar, pero público', async () => {
    const key = await fotoDeReporteEn('nuevo');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, no-cache');
  });

  it('no sirve la foto de un reporte rechazado', async () => {
    const key = await fotoDeReporteEn('rechazado');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(404);
  });

  /**
   * Caché pública pero SIN plazo: `no-cache` obliga a revalidar con ETag en cada uso. La
   * visibilidad de la foto sigue la del reporte, que el técnico puede rechazar o fusionar después;
   * con `max-age` una caché compartida la seguía sirviendo aunque el reporte dejara de publicarse.
   */
  it('sí sirve la de un reporte validado, con caché pública que revalida y sin immutable', async () => {
    const key = await fotoDeReporteEn('validado');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, no-cache');
    expect(r.headers.etag).toBe(`"${key}"`);
  });

  /**
   * Las fotos anteriores al contrato 0.8.0 se guardaron en JPEG y no se reconvierten: se siguen
   * sirviendo como image/jpeg. Cualquier otra extensión da 404 aunque la fila y el objeto existan.
   */
  it('una .jpg anterior se sirve como image/jpeg y otra extensión da 404', async () => {
    const creado = await crear();
    expect(creado.statusCode).toBe(201);
    const reporteId = creado.json().id as string;
    await pool.query(
      "UPDATE reporte_inundacion SET estado = 'validado'::estado_reporte WHERE id = $1",
      [reporteId],
    );
    const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#789' } })
      .jpeg()
      .toBuffer();
    const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#789' } })
      .png()
      .toBuffer();
    const anterior = `${randomUUID()}.jpg`;
    const otra = `${randomUUID()}.png`;
    for (const [key, mime, datos] of [
      [anterior, 'image/jpeg', jpeg],
      [otra, 'image/png', png],
    ] as const) {
      await pool.query(
        `INSERT INTO reporte_foto (reporte_id, objeto_key, mime, bytes, ancho, alto, exif_sanitizado)
         VALUES ($1, $2, $3, $4, 30, 20, true)`,
        [reporteId, key, mime, datos.length],
      );
      await almacen.guardar(key, datos, mime);
    }
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${anterior}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/jpeg');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('public, no-cache');
    const o = await app.inject({ method: 'GET', url: `/api/v1/fotos/${otra}` });
    expect(o.statusCode).toBe(404);
    expect(o.json().codigo).toBe('NO_EXISTE');
  });
});

/**
 * Una foto que todavía no está pegada a ningún reporte es de quien la subió y de nadie más
 * (plan de producción, T1). Antes se servía a cualquiera durante 24 h: sin moderación previa eso
 * la convertía en un alojamiento público de imágenes. Los técnicos tampoco la ven: no hay nada
 * que moderar hasta que exista el reporte.
 */
describe('foto sin reporte: solo la ve quien la subió', () => {
  let key: string;

  beforeAll(async () => {
    const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#456' } })
      .jpeg()
      .toBuffer();
    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      cookies: sesion(cookieVecina),
      ...multipart('archivo', 'f.jpg', 'image/jpeg', jpeg),
    });
    expect(sub.statusCode).toBe(201);
    key = sub.json().objeto_key;
  });

  it('200 para su dueña, con private, no-store', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/fotos/${key}`,
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/webp');
    expect(r.headers['cache-control']).toBe('private, no-store');
  });

  it('404 sin sesión', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(404);
    expect(r.json().codigo).toBe('NO_EXISTE');
    // Un 404 también se puede guardar en una caché compartida: no debe tapar la foto después.
    expect(r.headers['cache-control']).toBe('private, no-store');
  });

  it('404 para otra cuenta ciudadana', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/fotos/${key}`,
      cookies: sesion(cookieVecino),
    });
    expect(r.statusCode).toBe(404);
  });

  it('404 para un técnico y para un admin', async () => {
    for (const cookie of [cookieTecnico, cookieAdmin]) {
      const r = await app.inject({
        method: 'GET',
        url: `/api/v1/fotos/${key}`,
        cookies: sesion(cookie),
      });
      expect(r.statusCode).toBe(404);
    }
  });

  it('una foto sin reporte y sin subido_por (anterior a la 0012) no la ve nadie', async () => {
    const huerfana = `${randomUUID()}.jpg`;
    await pool.query(
      `INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado)
       VALUES ($1, 'image/jpeg', 1, 1, 1, true)`,
      [huerfana],
    );
    await almacen.guardar(huerfana, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
    for (const cookies of [undefined, sesion(cookieVecina), sesion(cookieTecnico)]) {
      const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${huerfana}`, cookies });
      expect(r.statusCode).toBe(404);
    }
  });
});
