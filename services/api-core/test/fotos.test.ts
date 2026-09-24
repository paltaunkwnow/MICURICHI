import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
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
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
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

  it('sí sirve la de un reporte validado, y con caché pública', async () => {
    const key = await fotoDeReporteEn('validado');
    const r = await app.inject({ method: 'GET', url: `/api/v1/fotos/${key}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toContain('public');
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
  });
});
