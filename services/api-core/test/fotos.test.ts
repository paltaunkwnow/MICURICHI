import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { Metricas } from '../src/observabilidad.js';
import { detectarMime } from '../src/rutas/fotos.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  multipart,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieVecina: string;
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
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen,
    metricas,
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
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
  it('sube, reprocesa y el objeto guardado NO conserva EXIF; se redimensiona a 1600 px', async () => {
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
    expect(foto.ancho).toBe(1600);
    const guardado = await almacen.leer(foto.objeto_key);
    expect(guardado).not.toBeNull();
    const meta = await sharp(guardado!.datos).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.width).toBe(1600);
    // se sirve con cabeceras de caché y nosniff
    const get = await app.inject({ method: 'GET', url: `/api/v1/fotos/${foto.objeto_key}` });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    // y se asocia al reporte al crearlo
    const rep = await crear({
      ...reporteValido,
      fotos: [foto.objeto_key],
    });
    expect(rep.statusCode).toBe(201);
    expect(rep.json().properties.fotos[0]).toContain(foto.objeto_key);
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

describe('moderación previa de las fotos (§13)', () => {
  /** Sube una foto y la asocia a un reporte que queda en el estado pedido. */
  async function fotoDeReporteEn(estado: string): Promise<string> {
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
    return key;
  }

  it('no sirve la foto de un reporte que todavía no se publicó', async () => {
    const key = await fotoDeReporteEn('nuevo');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode, 'un reporte en "nuevo" no se publica: su foto tampoco').toBe(404);
  });

  it('no sirve la foto de un reporte rechazado', async () => {
    const key = await fotoDeReporteEn('rechazado');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(404);
  });

  /**
   * Caché pública, pero de una hora y SIN `immutable`: la visibilidad de la foto sigue la del
   * reporte, que el técnico puede rechazar o fusionar después. Con `max-age=86400, immutable`,
   * una caché compartida seguía sirviéndola un día entero aunque el reporte dejara de publicarse.
   */
  it('sí sirve la de un reporte validado, con caché pública de una hora y sin immutable', async () => {
    const key = await fotoDeReporteEn('validado');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('la foto recién subida y aún sin reporte se sirve: el formulario muestra la miniatura', async () => {
    const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#456' } })
      .jpeg()
      .toBuffer();
    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/fotos',
      cookies: sesion(cookieVecina),
      ...multipart('archivo', 'f.jpg', 'image/jpeg', jpeg),
    });
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${sub.json().objeto_key}` });
    expect(r.statusCode).toBe(200);
    // …pero ninguna caché la guarda: todavía no está publicada, y si el reporte al que se adjunte
    // no llega a validarse, no puede quedar servible desde una caché compartida.
    expect(r.headers['cache-control']).toBe('private, no-store');
  });
});
