/** Fotos: validación por magic bytes, reprocesado con sharp (sin metadatos EXIF), almacenamiento y servido. */
import { randomUUID } from 'node:crypto';
import { CONFIG_DOMINIO } from 'contracts';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { esTecnico } from './reportes.js';

/**
 * Cargadores de libvips que Mi Curichi NO usa, apagados a nivel de biblioteca.
 *
 * La comprobación de *magic bytes* de `detectarMime` ya limita la entrada a JPEG, PNG y WebP, pero
 * es una barrera nuestra: depende de que esté bien escrita y de que nadie la relaje. Por debajo,
 * el proceso llevaba habilitados todos los cargadores que trae libvips 8.18.6 —heif, tiff, gif,
 * svg, pdf, jxl, dcraw, fits, openslide…— y cada uno es un parser en C sobre datos de un
 * desconocido. No es teórico: el RCE crítico de agosto de 2026 en Next.js
 * (GHSA-g89c-p67h-r497 / GHSA-2xp9-vwfh-vxw4) estaba en **libheif**, uno de estos, y los cuatro
 * CVE de libvips de este año (CVE-2026-33327, -33328, -35590, -35591) estaban en los cargadores
 * de GIF, TIFF y VIPS. Ninguno de esos formatos se acepta aquí.
 *
 * Con `sharp.block` esos cargadores no se pueden invocar aunque un archivo llegue a libvips: la
 * defensa deja de depender solo de nuestra comprobación previa. Los nombres son los de las clases
 * de libvips; los que no existan en esta build se ignoran sin error.
 */
export const CARGADORES_BLOQUEADOS = [
  'VipsForeignLoadHeif', // AVIF/HEIC: libheif, el del RCE de agosto de 2026
  'VipsForeignLoadNsgif', // GIF: CVE-2026-33327
  'VipsForeignLoadTiff', // TIFF: CVE-2026-33328
  'VipsForeignLoadVips', // .vips: CVE-2026-35591
  'VipsForeignLoadSvg', // SVG: XML, entidades externas y scripting
  'VipsForeignLoadPdf', // PDF: poppler
  'VipsForeignLoadJxl', // JPEG XL
  'VipsForeignLoadMagick', // ImageMagick: decenas de formatos de golpe
  'VipsForeignLoadOpenslide',
  'VipsForeignLoadFits',
  'VipsForeignLoadAnalyze',
  'VipsForeignLoadRad',
  'VipsForeignLoadPpm',
  'VipsForeignLoadMat',
  'VipsForeignLoadNifti',
  'VipsForeignLoadOpenexr',
];

/**
 * Se ejecuta al importar el módulo, antes de atender ninguna petición: si se hiciera dentro del
 * manejador, la primera imagen del arranque pasaría por los cargadores sin bloquear.
 */
export function bloquearCargadoresNoUsados(): void {
  for (const cargador of CARGADORES_BLOQUEADOS) {
    try {
      sharp.block({ operation: [cargador] });
    } catch {
      // Esta build de libvips no trae ese cargador. Mejor: no hay nada que bloquear.
    }
  }
}
bloquearCargadoresNoUsados();

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

/**
 * Tope de píxeles de ENTRADA. sharp permite por defecto 268 megapíxeles, y decodificar tantos
 * cuesta del orden de 1 GB de memoria: un PNG de pocos kilobytes puede declarar 16000 × 16000 y
 * tumbar el servicio (bomba de descompresión). 60 MP cubre de sobra cualquier cámara de teléfono
 * —las de 50 MP rondan los 8160 × 6120— y la foto se reescala a 1600 px de ancho igualmente.
 */
export const MAX_PIXELES_ENTRADA = 60_000_000;

/** Plazo de cada procesado. Ver el comentario en `sanitizarImagen`. */
export const SEGUNDOS_MAX_PROCESADO = 10;

/**
 * Hilos que libvips puede usar por imagen. Por defecto usa tantos como núcleos, así que unas
 * pocas subidas simultáneas bastan para quedarse con toda la CPU del contenedor y dejar sin
 * atender al resto de la API —incluido el mapa público, que no tiene nada que ver con las fotos—.
 * Con dos, el reprocesado sigue siendo rápido y deja sitio al tráfico normal.
 */
export const HILOS_LIBVIPS = 2;
sharp.concurrency(HILOS_LIBVIPS);
// La caché de libvips guarda operaciones y archivos abiertos entre llamadas. Aquí cada imagen se
// procesa una vez y no se repite, así que solo es memoria retenida en un servicio de larga vida.
sharp.cache(false);

/** Se lanza cuando la imagen es válida pero demasiado grande: el mensaje SÍ sirve al vecino. */
export class ImagenDemasiadoGrande extends Error {}

/**
 * Traduce el fallo del procesado a algo que se pueda enseñar.
 *
 * sharp habla por boca de libvips, y sus mensajes son del tipo «Input buffer has corrupt header:
 * VipsJpeg: Corrupt JPEG data: 85 extraneous bytes before marker 0x14». Eso viajaba tal cual
 * hasta el aviso rojo del formulario: ni el vecino entiende una palabra, ni conviene publicar
 * qué biblioteca de imágenes corre por dentro ni con qué versión (CLAUDE.md §13). El detalle
 * queda en el log del servicio, que es donde hace falta.
 */
export function mensajePublicoDeImagen(e: unknown): string {
  if (e instanceof ImagenDemasiadoGrande) return e.message;
  return 'No pudimos leer esa imagen. Puede estar dañada o a medio descargar: probá con otra foto.';
}

/** Reprocesa la imagen: orienta según EXIF, limita el ancho, re-codifica a JPEG y DESCARTA todos los metadatos. */
export async function sanitizarImagen(
  entrada: Buffer,
): Promise<{ datos: Buffer; ancho: number; alto: number }> {
  // Las dimensiones se miran en la CABECERA, antes de decodificar nada: si se comprueba después
  // el daño ya está hecho, porque la memoria se reserva al decodificar.
  const cabecera = await sharp(entrada, { limitInputPixels: false }).metadata();
  const pixeles = (cabecera.width ?? 0) * (cabecera.height ?? 0);
  if (!pixeles) throw new Error('no se pudieron leer las dimensiones de la imagen');
  if (pixeles > MAX_PIXELES_ENTRADA)
    throw new ImagenDemasiadoGrande(
      `Esa imagen tiene ${Math.round(pixeles / 1e6)} megapíxeles y el máximo es ${MAX_PIXELES_ENTRADA / 1e6}. Probá con una foto normal de la cámara.`,
    );
  const datos = await sharp(entrada, { failOn: 'error', limitInputPixels: MAX_PIXELES_ENTRADA })
    // Plazo duro del procesado. El tope de píxeles acota la memoria, pero no el TIEMPO: una
    // imagen válida y perfectamente normal de tamaño puede estar construida para que el
    // decodificador tarde muchísimo, y sin plazo eso deja una petición y un hilo de libvips
    // ocupados indefinidamente. Diez segundos es un orden de magnitud más de lo que tarda una
    // foto de teléfono de 50 MP.
    .timeout({ seconds: SEGUNDOS_MAX_PROCESADO })
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
  /*
   * Subir una foto EXIGE SESIÓN, igual que crear el reporte al que va a ir pegada.
   *
   * Era el último camino de escritura abierto a cualquiera: un desconocido podía hacer que el
   * servicio decodificara y reescribiera imágenes de hasta 8 MB —el trabajo más caro que hace
   * este proceso— y dejara los bytes en el almacén, sin ninguna cuenta detrás y sin que ese
   * consumo se pudiera atribuir a nadie. Pedir sesión aquí no añade fricción al vecino (ya la
   * necesita para enviar el reporte) y sí le pone nombre a cada byte que entra.
   */
  app.post(
    '/api/v1/fotos',
    {
      config: {
        rateLimit: { max: dep.cfg.rateLimitMax * 3, timeWindow: dep.cfg.rateLimitVentanaMs },
      },
      preHandler: requerirRol('ciudadano', 'tecnico', 'admin'),
    },
    async (req, res) => {
      // `req.file()` lanza si la petición no es multipart, y el manejador general publicaba el
      // código interno del plugin (`FST_INVALID_MULTIPART_CONTENT_TYPE`) como si fuera un código
      // del dominio. Lo que hay que decir es qué se esperaba.
      const archivo = await req
        .file({ limits: { fileSize: CONFIG_DOMINIO.FOTO_MAX_BYTES, files: 1 } })
        .catch(() => null);
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
        req.log.warn({ err: e }, 'no se pudo procesar la imagen subida');
        return res
          .status(415)
          .send({ codigo: 'IMAGEN_INVALIDA', mensaje: mensajePublicoDeImagen(e) });
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

  // Mismo motivo que el listado: era una ruta pública sin límite, y cada petición lee un
  // objeto del almacén.
  app.get(
    '/api/v1/fotos/:key',
    { config: { rateLimit: { max: dep.cfg.rateLimitLecturasPorMinuto, timeWindow: 60_000 } } },
    async (req, res) => {
      const { key } = req.params as { key: string };
      if (!/^[a-f0-9-]{36}\.jpg$/.test(key))
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
      // Moderación previa (§13): la foto de un reporte que aún no se publicó —o que se rechazó—
      // no se sirve al público aunque alguien tenga su clave. Se permiten las que todavía no
      // tienen reporte porque el formulario muestra la miniatura antes de enviar, y esas las
      // borra el mantenimiento a las 24 h. El técnico las ve todas: es quien modera.
      const tecnico = esTecnico(req.usuario?.rol);
      const fila = await dep.pool.query<{ publica: boolean }>(
        `SELECT (f.reporte_id IS NULL OR r.estado IN ('validado', 'resuelto')) AS publica
         FROM reporte_foto f
         LEFT JOIN reporte_inundacion r ON r.id = f.reporte_id
        WHERE f.objeto_key = $1 AND f.exif_sanitizado`,
        [key],
      );
      const meta = fila.rows[0];
      if (!meta || (!meta.publica && !tecnico))
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
      const obj = await dep.almacen.leer(key);
      if (!obj)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
      res.header('Content-Type', obj.mime);
      // La foto de un reporte sin publicar solo la ve el técnico, así que NO puede guardarse en una
      // caché compartida: si no, la primera visita de un técnico la dejaría servible para cualquiera.
      res.header(
        'Cache-Control',
        meta.publica ? 'public, max-age=86400, immutable' : 'private, no-store',
      );
      res.header('X-Content-Type-Options', 'nosniff');
      return res.send(obj.datos);
    },
  );
}
