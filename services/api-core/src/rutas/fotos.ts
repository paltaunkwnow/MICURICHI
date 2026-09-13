/** Fotos: validación por magic bytes, reprocesado con sharp (sin metadatos EXIF), almacenamiento y servido. */
import { randomUUID } from 'node:crypto';
import { CONFIG_DOMINIO } from 'contracts';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { Dependencias } from '../app.js';

export function detectarMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/** Reprocesa la imagen: orienta según EXIF, limita el ancho, re-codifica a JPEG y DESCARTA todos los metadatos. */
export async function sanitizarImagen(
  entrada: Buffer,
): Promise<{ datos: Buffer; ancho: number; alto: number }> {
  const datos = await sharp(entrada, { failOn: 'error' })
    .rotate()
    .resize({ width: CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer(); // sin .withMetadata(): sharp elimina EXIF, ICC, XMP e IPTC
  const meta = await sharp(datos).metadata();
  if (meta.exif || meta.xmp || meta.iptc)
    throw new Error('la imagen conserva metadatos tras el reprocesado');
  return { datos, ancho: meta.width ?? 0, alto: meta.height ?? 0 };
}

export async function rutasFotos(app: FastifyInstance, dep: Dependencias) {
  app.post(
    '/api/v1/fotos',
    {
      config: {
        rateLimit: { max: dep.cfg.rateLimitMax * 3, timeWindow: dep.cfg.rateLimitVentanaMs },
      },
    },
    async (req, res) => {
      const archivo = await req.file({
        limits: { fileSize: CONFIG_DOMINIO.FOTO_MAX_BYTES, files: 1 },
      });
      if (!archivo)
        return res
          .status(400)
          .send({ codigo: 'SIN_ARCHIVO', mensaje: 'Adjuntá una imagen en el campo "archivo".' });
      const buf = await archivo.toBuffer().catch(() => null);
      if (!buf || archivo.file.truncated)
        return res.status(413).send({
          codigo: 'ARCHIVO_GRANDE',
          mensaje: `La foto supera ${CONFIG_DOMINIO.FOTO_MAX_BYTES / 1024 / 1024} MB.`,
        });
      const mime = detectarMime(buf);
      if (!mime || !(CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS as readonly string[]).includes(mime)) {
        return res
          .status(415)
          .send({ codigo: 'TIPO_NO_PERMITIDO', mensaje: 'Solo se aceptan JPEG, PNG o WebP.' });
      }
      let procesada: Awaited<ReturnType<typeof sanitizarImagen>>;
      try {
        procesada = await sanitizarImagen(buf);
      } catch (e) {
        return res.status(415).send({
          codigo: 'IMAGEN_INVALIDA',
          mensaje: `No se pudo procesar la imagen: ${(e as Error).message}`,
        });
      }
      const key = `${randomUUID()}.jpg`;
      await dep.almacen.guardar(key, procesada.datos, 'image/jpeg');
      await dep.pool.query(
        'INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado) VALUES ($1, $2, $3, $4, $5, true)',
        [key, 'image/jpeg', procesada.datos.length, procesada.ancho, procesada.alto],
      );
      return res.status(201).send({
        objeto_key: key,
        url: `${dep.cfg.urlPublica}/api/v1/fotos/${key}`,
        ancho: procesada.ancho,
        alto: procesada.alto,
        bytes: procesada.datos.length,
        mime: 'image/jpeg',
        exif_sanitizado: true,
      });
    },
  );

  app.get('/api/v1/fotos/:key', async (req, res) => {
    const { key } = req.params as { key: string };
    if (!/^[a-f0-9-]{36}\.jpg$/.test(key))
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
    const fila = await dep.pool.query(
      'SELECT 1 FROM reporte_foto WHERE objeto_key = $1 AND exif_sanitizado',
      [key],
    );
    if (!fila.rowCount)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
    const obj = await dep.almacen.leer(key);
    if (!obj) return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
    res.header('Content-Type', obj.mime);
    res.header('Cache-Control', 'public, max-age=86400, immutable');
    res.header('X-Content-Type-Options', 'nosniff');
    return res.send(obj.datos);
  });
}
