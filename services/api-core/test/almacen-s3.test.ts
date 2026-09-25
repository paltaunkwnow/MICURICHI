/**
 * Almacén de fotos sobre S3 (CLAUDE.md §8.2 y §13).
 *
 * Dos capas de comprobación, y hacen falta las dos:
 *
 *  - las de firma y configuración, que corren siempre y son las que fallan cuando alguien
 *    toca el orden de las cabeceras canónicas o el estilo de URL;
 *  - la de ida y vuelta contra MinIO, que es la única que demuestra que la firma es CORRECTA.
 *    Una firma se puede calcular de forma consistente y estar mal: quien dice la verdad sobre
 *    eso es el servidor, devolviendo 403 en vez de 200. Si MinIO no está levantado, esa parte
 *    se omite y se dice por qué, en vez de dar por buena una prueba que no se hizo.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { AlmacenS3, type ConfigS3, firmarSigV4, leerConfigS3 } from '../src/almacen-s3.js';

const CFG_EJEMPLO: ConfigS3 = {
  endpoint: 'http://minio:9000',
  bucket: 'fotos',
  region: 'us-east-1',
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  rutaEnCamino: true,
  plazoMs: 5000,
};

const AHORA = new Date('2026-09-16T14:30:00.000Z');

describe('firma SigV4', () => {
  it('pone el bucket en el camino y firma host, fecha y huella del cuerpo', () => {
    const f = firmarSigV4(CFG_EJEMPLO, 'GET', 'abc.jpg', null, AHORA);
    expect(f.url).toBe('http://minio:9000/fotos/abc.jpg');
    expect(f.cabeceras['x-amz-date']).toBe('20260916T143000Z');
    expect(f.cabeceras.host).toBe('minio:9000');
    expect(f.cabeceras.authorization).toContain(
      'Credential=AKIAIOSFODNN7EXAMPLE/20260916/us-east-1/s3/aws4_request',
    );
    expect(f.cabeceras.authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date',
    );
  });

  it('usa el subdominio del bucket cuando no es estilo ruta', () => {
    const f = firmarSigV4({ ...CFG_EJEMPLO, rutaEnCamino: false }, 'GET', 'abc.jpg', null, AHORA);
    expect(f.url).toBe('http://fotos.minio:9000/abc.jpg');
    expect(f.cabeceras.host).toBe('fotos.minio:9000');
  });

  it('el cuerpo entra en la firma: dos contenidos distintos dan firmas distintas', () => {
    const a = firmarSigV4(CFG_EJEMPLO, 'PUT', 'x.jpg', Buffer.from('uno'), AHORA);
    const b = firmarSigV4(CFG_EJEMPLO, 'PUT', 'x.jpg', Buffer.from('dos'), AHORA);
    expect(a.cabeceras['x-amz-content-sha256']).not.toBe(b.cabeceras['x-amz-content-sha256']);
    expect(a.cabeceras.authorization).not.toBe(b.cabeceras.authorization);
  });

  it('la huella de un cuerpo vacío es la de la cadena vacía', () => {
    const f = firmarSigV4(CFG_EJEMPLO, 'GET', 'x.jpg', null, AHORA);
    expect(f.cabeceras['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('las cabeceras extra entran ordenadas en SignedHeaders', () => {
    const f = firmarSigV4(CFG_EJEMPLO, 'PUT', 'x.jpg', Buffer.from('a'), AHORA, {
      'content-type': 'image/jpeg',
    });
    expect(f.cabeceras.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
  });
});

describe('leerConfigS3', () => {
  it('sin S3_ENDPOINT devuelve null: el disco sigue siendo la opción por defecto', () => {
    expect(leerConfigS3({})).toBeNull();
  });

  it('con endpoint pero sin credenciales falla al arrancar y dice qué falta', () => {
    expect(() => leerConfigS3({ S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'fotos' })).toThrow(
      /S3_ACCESS_KEY, S3_SECRET_KEY/,
    );
  });

  it('completa región y estilo de ruta por defecto', () => {
    const c = leerConfigS3({
      S3_ENDPOINT: 'http://minio:9000',
      S3_BUCKET: 'fotos',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 'b',
    });
    expect(c).toMatchObject({ region: 'us-east-1', rutaEnCamino: true });
  });

  it('S3_ESTILO_RUTA=0 cambia al estilo de subdominio de AWS', () => {
    const c = leerConfigS3({
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_BUCKET: 'fotos',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 'b',
      S3_ESTILO_RUTA: '0',
    });
    expect(c?.rutaEnCamino).toBe(false);
  });
});

/**
 * Ida y vuelta real. Se apunta al MinIO del Compose; si no responde, se omite. `S3_ENDPOINT` del
 * entorno manda, para poder correr esto contra otro servicio compatible.
 */
const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const cfgReal: ConfigS3 = {
  endpoint: ENDPOINT,
  bucket: process.env.S3_BUCKET ?? 'fotos',
  region: process.env.S3_REGION ?? 'us-east-1',
  accessKey: process.env.S3_ACCESS_KEY ?? 'curichi',
  secretKey: process.env.S3_SECRET_KEY ?? '',
  rutaEnCamino: true,
  plazoMs: 10_000,
};

let hayMinio = false;
beforeAll(async () => {
  if (!cfgReal.secretKey) return;
  try {
    const r = await fetch(`${ENDPOINT}/minio/health/live`, { signal: AbortSignal.timeout(2000) });
    hayMinio = r.ok;
  } catch {
    hayMinio = false;
  }
});

describe('ida y vuelta contra un S3 real', () => {
  it('guarda, lee y borra un objeto', async ({ skip }) => {
    skip(
      !hayMinio,
      'sin MinIO alcanzable (o sin S3_SECRET_KEY): esta comprobación necesita el servicio levantado',
    );
    const almacen = new AlmacenS3(cfgReal);
    const clave = `${randomUUID()}.jpg`;
    const datos = Buffer.from('bytes de una foto de prueba', 'utf8');

    await almacen.guardar(clave, datos, 'image/jpeg');
    const leido = await almacen.leer(clave);
    expect(leido?.datos.equals(datos)).toBe(true);
    expect(leido?.mime).toBe('image/jpeg');

    await almacen.borrar(clave);
    expect(await almacen.leer(clave)).toBeNull();
    // Borrar dos veces no puede fallar: el mantenimiento lo hace sin saber si ya se borró.
    await expect(almacen.borrar(clave)).resolves.toBeUndefined();
  });

  it('la comprobación de arranque pasa con credenciales buenas y falla con malas', async ({
    skip,
  }) => {
    skip(!hayMinio, 'sin MinIO alcanzable');
    await expect(new AlmacenS3(cfgReal).comprobar()).resolves.toBeUndefined();
    await expect(
      new AlmacenS3({ ...cfgReal, secretKey: 'clave-que-no-es' }).comprobar(),
    ).rejects.toThrow(/almacén S3/);
  });
});
