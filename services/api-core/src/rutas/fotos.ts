/** Fotos: validación por magic bytes, reprocesado con sharp a WebP sin metadatos, almacenamiento y servido. */
import { randomUUID } from 'node:crypto';
import { CONFIG_DOMINIO, type Rol } from 'contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { devolverTurnoDeFoto, type EsperaCupo, reservarTurnoDeFoto } from '../cuota.js';
import { revisarEspacio } from '../guarda-disco.js';
import { registrarProcesadoDeFoto, registrarSubidaDeFoto } from '../observabilidad.js';
import { condicionPublicado, condicionPublico } from '../visibilidad.js';
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
 * —las de 50 MP rondan los 8160 × 6120— y la foto se reescala a 1600 px por lado igualmente.
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

const MIME_SALIDA = CONFIG_DOMINIO.FOTO_FORMATO_SALIDA;

/**
 * Qué se sirve según la extensión de la clave: .webp para las fotos nuevas y .jpg para las
 * anteriores al contrato 0.8.0, que no se reconvierten. El Content-Type sale de aquí y no del
 * almacén: la clave ya pasó por la expresión regular y es lo único que controla el servidor.
 */
const MIME_POR_EXTENSION: Record<string, string> = { webp: MIME_SALIDA, jpg: 'image/jpeg' };
const CLAVE_FOTO = /^[a-f0-9-]{36}\.(webp|jpg)$/;

/** Trozos de un WebP que llevan metadatos. Ninguno puede quedar en lo que se guarda. */
const TROZOS_DE_METADATOS = new Set(['EXIF', 'XMP ', 'ICCP']);

/**
 * Comprueba el WebP de salida recorriendo su contenedor RIFF. Es la segunda mirada, después de
 * `sharp.metadata()`: esa informa lo que libvips reconoce, y esta ve todos los trozos que viajan
 * en el archivo, lo reconozca libvips o no. También exige un solo cuadro (sin ANIM ni ANMF).
 */
export function comprobarWebpLimpio(datos: Buffer): void {
  if (detectarMime(datos) !== 'image/webp' || datos.readUInt32LE(4) !== datos.length - 8)
    throw new Error('la salida no es un WebP bien formado');
  let o = 12;
  while (o + 8 <= datos.length) {
    const id = datos.toString('ascii', o, o + 4);
    if (TROZOS_DE_METADATOS.has(id)) throw new Error(`el WebP de salida conserva el trozo ${id}`);
    if (id === 'ANIM' || id === 'ANMF') throw new Error('el WebP de salida quedó animado');
    const n = datos.readUInt32LE(o + 4);
    o += 8 + n + (n % 2);
  }
  if (o !== datos.length) throw new Error('el WebP de salida está cortado');
}

/**
 * Reprocesa la imagen: orienta según EXIF, la deja en 1600 px por lado como máximo, la vuelve a
 * codificar en WebP y DESCARTA todos los metadatos. De una entrada animada toma solo el primer
 * cuadro: una foto de un charco no se mueve, y un WebP o PNG animado solo multiplica el trabajo.
 */
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
  const datos = await sharp(entrada, {
    failOn: 'error',
    limitInputPixels: MAX_PIXELES_ENTRADA,
    pages: 1,
    page: 0,
  })
    // Plazo duro del procesado. El tope de píxeles acota la memoria, pero no el TIEMPO: una
    // imagen válida y perfectamente normal de tamaño puede estar construida para que el
    // decodificador tarde muchísimo, y sin plazo eso deja una petición y un hilo de libvips
    // ocupados indefinidamente. Diez segundos es un orden de magnitud más de lo que tarda una
    // foto de teléfono de 50 MP.
    .timeout({ seconds: SEGUNDOS_MAX_PROCESADO })
    .rotate()
    .resize({
      width: CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX,
      height: CONFIG_DOMINIO.FOTO_ALTO_MAX_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: CONFIG_DOMINIO.FOTO_CALIDAD_WEBP })
    .toBuffer(); // sin .withMetadata(): sharp elimina EXIF, ICC, XMP e IPTC
  const meta = await sharp(datos).metadata();
  if (meta.format !== 'webp' || meta.exif || meta.xmp || meta.iptc || meta.icc)
    throw new Error('la imagen conserva metadatos tras el reprocesado');
  comprobarWebpLimpio(datos);
  return { datos, ancho: meta.width ?? 0, alto: meta.height ?? 0 };
}

interface VisibilidadFoto extends Record<string, unknown> {
  sin_reporte: boolean;
  subido_por: string | null;
  /** Autor del reporte al que está pegada (null sin reporte, o si se borró la cuenta). */
  autor_id: string | null;
  /** El reporte está en la vista pública (`condicionPublico`). */
  publica: boolean;
  /** El reporte ya pasó su demora, en cualquier estado (`condicionPublicado`). */
  publicado: boolean;
}

/** Cómo se sirve una foto: a cualquiera y cacheable, solo a quien pregunta, o a nadie (404). */
export type ModoFoto = 'publica' | 'privada' | null;

/**
 * Quién ve una foto (contracts 0.11.0, ADR 0006):
 *  - sin reporte, solo quien la subió, técnicos incluidos afuera: todavía no hay nada que moderar
 *    y servirla a cualquiera la volvía un alojamiento público de imágenes;
 *  - la de un reporte público (nuevo, validado o resuelto ya publicado), cualquiera;
 *  - el AUTOR del reporte ve las suyas en cualquier estado: mientras espera su publicación y si lo
 *    rechazaron o fusionaron (sin esto vería su propia foto rota en «Mis reportes»);
 *  - técnico y admin, las de un reporte ya publicado en cualquier estado, porque lo moderan; nunca
 *    las de uno que todavía espera su publicar_en.
 */
export function modoDeFoto(
  foto: VisibilidadFoto,
  usuarioId: string | undefined,
  rol: Rol | undefined,
): ModoFoto {
  if (foto.sin_reporte)
    return usuarioId !== undefined && foto.subido_por === usuarioId ? 'privada' : null;
  if (foto.publica) return 'publica';
  if (usuarioId !== undefined && foto.autor_id === usuarioId) return 'privada';
  if (esTecnico(rol) && foto.publicado) return 'privada';
  return null;
}

/** ETag de una foto publicada. La clave es un uuid y el contenido de una clave nunca cambia. */
const etagDeFoto = (key: string) => `"${key}"`;

/** Si `If-None-Match` trae esa etiqueta (o `*`), con o sin `W/`. */
export function coincideEtag(cabecera: string | string[] | undefined, etag: string): boolean {
  if (!cabecera) return false;
  const valores = (Array.isArray(cabecera) ? cabecera.join(',') : cabecera)
    .split(',')
    .map((v) => v.trim().replace(/^W\//, ''));
  return valores.includes('*') || valores.includes(etag);
}

export async function rutasFotos(app: FastifyInstance, dep: Dependencias) {
  function rechazarPorCuota(res: FastifyReply, espera: EsperaCupo) {
    // Nombre exigido por la alerta CuotaDeFotosRechazando (infra/observabilidad/alertas.yml): no
    // se toca. curichi_fotos_subidas_total{resultado="rechazada_cuota"} es el contador nuevo, que
    // agrupa este motivo junto a los otros cuatro en el mismo panel.
    app.metricas.contar('curichi_cuota_fotos_rechazos_total');
    registrarSubidaDeFoto(app.metricas, 'rechazada_cuota');
    res.header('Retry-After', String(espera.reintentarEnS));
    return res.status(429).send({
      codigo: 'CUOTA_DE_FOTOS',
      mensaje: `Ya subiste las ${dep.cfg.fotosPorDia} fotos de hoy. Vas a poder subir otra mañana.`,
      detalles: { disponible_en: espera.disponibleEn },
    });
  }

  /*
   * Subir una foto EXIGE SESIÓN, igual que crear el reporte al que va a ir pegada.
   *
   * Era el último camino de escritura abierto a cualquiera: un desconocido podía hacer que el
   * servicio decodificara y reescribiera imágenes de hasta 8 MB —el trabajo más caro que hace
   * este proceso— y dejara los bytes en el almacén, sin ninguna cuenta detrás. Pedir sesión aquí
   * no añade fricción al vecino (ya la necesita para enviar el reporte) y le pone nombre a cada
   * byte que entra.
   *
   * Y con nombre, tope: `FOTOS_POR_DIA_POR_CUENTA` por cuenta y por día de la ciudad, además del
   * límite por IP, que una IP dinámica reinicia con poner el teléfono en modo avión. El turno se
   * reserva en la base ANTES de leer el archivo (una cuenta sin cupo no hace trabajar a sharp) y
   * se devuelve si la foto no llega a guardarse. Cada foto guarda quién la subió (`subido_por`,
   * migración 0012) y el reporte solo acepta las de su autor.
   */
  app.post(
    '/api/v1/fotos',
    {
      config: {
        rateLimit: { max: dep.cfg.rateLimitMax * 3, timeWindow: dep.cfg.rateLimitVentanaMs },
      },
      preHandler: requerirRol('ciudadano', 'tecnico', 'admin', 'ejecutivo'),
    },
    async (req, res) => {
      // `requerirRol` ya cortó si no hay sesión; esto es para el compilador.
      const autor = req.usuario;
      if (!autor)
        return res
          .status(401)
          .send({ codigo: 'SIN_SESION', mensaje: 'Iniciá sesión para subir una foto.' });
      // Antes que nada el disco: sin espacio no se lee la imagen, no trabaja sharp y no se gasta
      // cupo. El reporte sin foto sigue entrando.
      if ((await revisarEspacio(dep.almacen, dep.cfg.fotosMinLibreBytes, req.log)) !== 'ok') {
        registrarSubidaDeFoto(app.metricas, 'rechazada_espacio');
        req.log.warn('foto rechazada: el disco de fotos está bajo FOTOS_MIN_LIBRE_BYTES');
        return res.status(507).send({
          codigo: 'SIN_ESPACIO',
          mensaje:
            'Ahora no podemos guardar fotos. Podés enviar el reporte sin foto o probar más tarde.',
        });
      }
      // Atómica y en su propia sentencia: dos subidas simultáneas se serializan sobre la fila del
      // día y no pueden gastar las dos el último turno. No se retiene ninguna transacción mientras
      // trabaja sharp.
      const reserva = await reservarTurnoDeFoto(dep.pool, autor.id, {
        maximo: dep.cfg.fotosPorDia,
        zona: dep.cfg.zonaHoraria,
      });
      if (!reserva.permitido) return rechazarPorCuota(res, reserva.espera);
      let resultado: ResultadoSubida | null = null;
      try {
        resultado = await recibirYGuardar(req, autor.id);
      } finally {
        // Una foto que no se guardó no gasta cupo: tipo o tamaño equivocados, imagen ilegible o
        // un fallo del almacén. Se devuelve ANTES de responder, así un reintento inmediato ya lo
        // encuentra, y del día en que se reservó aunque la medianoche haya pasado en el medio.
        if (!resultado?.guardada)
          await devolverTurnoDeFoto(dep.pool, autor.id, reserva.dia).catch((err) =>
            req.log.warn({ err }, 'no se pudo devolver el turno de foto'),
          );
      }
      return res.status(resultado.estado).send(resultado.cuerpo);
    },
  );

  interface ResultadoSubida {
    /** Si la foto quedó en la base y en el almacén: si no, se devuelve el turno. */
    guardada: boolean;
    estado: number;
    cuerpo: unknown;
  }

  /** Lee, valida, reprocesa y guarda la foto. No responde: eso lo hace la ruta, ya con el cupo en orden. */
  async function recibirYGuardar(req: FastifyRequest, autorId: string): Promise<ResultadoSubida> {
    const no = (estado: number, cuerpo: { codigo: string; mensaje: string }) => ({
      guardada: false,
      estado,
      cuerpo,
    });
    // `req.file()` lanza si la petición no es multipart, y el manejador general publicaba el
    // código interno del plugin (`FST_INVALID_MULTIPART_CONTENT_TYPE`) como si fuera un código
    // del dominio. Lo que hay que decir es qué se esperaba.
    const archivo = await req
      .file({ limits: { fileSize: CONFIG_DOMINIO.FOTO_MAX_BYTES, files: 1 } })
      .catch(() => null);
    if (!archivo) {
      registrarSubidaDeFoto(app.metricas, 'error');
      return no(400, {
        codigo: 'SIN_ARCHIVO',
        mensaje: 'Adjuntá una imagen en el campo "archivo".',
      });
    }
    const buf = await archivo.toBuffer().catch(() => null);
    if (!buf || archivo.file.truncated) {
      registrarSubidaDeFoto(app.metricas, 'rechazada_tamano');
      return no(413, {
        codigo: 'ARCHIVO_GRANDE',
        mensaje: `La foto supera ${CONFIG_DOMINIO.FOTO_MAX_BYTES / 1024 / 1024} MB.`,
      });
    }
    const mime = detectarMime(buf);
    if (!mime || !(CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS as readonly string[]).includes(mime)) {
      registrarSubidaDeFoto(app.metricas, 'rechazada_tipo');
      return no(415, { codigo: 'TIPO_NO_PERMITIDO', mensaje: 'Solo se aceptan JPEG, PNG o WebP.' });
    }
    let procesada: Awaited<ReturnType<typeof sanitizarImagen>>;
    const inicioProcesado = process.hrtime.bigint();
    const segundosProcesado = () => Number(process.hrtime.bigint() - inicioProcesado) / 1e9;
    try {
      procesada = await sanitizarImagen(buf);
    } catch (e) {
      registrarProcesadoDeFoto(app.metricas, segundosProcesado());
      registrarSubidaDeFoto(app.metricas, 'error');
      req.log.warn({ err: e }, 'no se pudo procesar la imagen subida');
      return no(415, { codigo: 'IMAGEN_INVALIDA', mensaje: mensajePublicoDeImagen(e) });
    }
    registrarProcesadoDeFoto(app.metricas, segundosProcesado());
    const key = `${randomUUID()}.webp`;
    try {
      await dep.pool.query(
        'INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado, subido_por) VALUES ($1, $2, $3, $4, $5, true, $6)',
        [key, MIME_SALIDA, procesada.datos.length, procesada.ancho, procesada.alto, autorId],
      );
    } catch (e) {
      registrarSubidaDeFoto(app.metricas, 'error');
      throw e;
    }
    // El objeto se guarda con la fila ya confirmada: la subida al almacén puede tardar y no debe
    // retener una conexión. Si falla, se quita la fila: una foto sin objeto no sirve. Al revés
    // (objeto primero) un corte entre los dos pasos dejaba un objeto sin fila, que ninguna
    // limpieza encuentra; una fila sin objeto la retira el mantenimiento a las 24 h.
    try {
      await dep.almacen.guardar(key, procesada.datos, MIME_SALIDA);
    } catch (e) {
      await dep.pool
        .query('DELETE FROM reporte_foto WHERE objeto_key = $1', [key])
        .catch((err) => req.log.warn({ err, key }, 'no se pudo quitar la fila de la foto'));
      registrarSubidaDeFoto(app.metricas, 'error');
      throw e;
    }
    registrarSubidaDeFoto(app.metricas, 'aceptada');
    return {
      guardada: true,
      estado: 201,
      cuerpo: {
        objeto_key: key,
        url: `${dep.cfg.urlPublica}/api/v1/fotos/${key}`,
        ancho: procesada.ancho,
        alto: procesada.alto,
        bytes: procesada.datos.length,
        mime: MIME_SALIDA,
        exif_sanitizado: true,
      },
    };
  }

  // Mismo motivo que el listado: era una ruta pública sin límite, y cada petición lee un
  // objeto del almacén.
  app.get(
    '/api/v1/fotos/:key',
    { config: { rateLimit: { max: dep.cfg.rateLimitLecturasPorMinuto, timeWindow: 60_000 } } },
    async (req, res) => {
      const { key } = req.params as { key: string };
      // Sin Cache-Control propio: el 404 se lleva el `private, no-store` por defecto (cache.ts),
      // así ninguna caché compartida lo guarda y tapa la foto para quien sí puede verla.
      const noEncontrada = () =>
        res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Foto no encontrada.' });
      const extension = CLAVE_FOTO.exec(key)?.[1];
      if (!extension) return noEncontrada();
      const fila = await dep.pool.query<VisibilidadFoto>(
        `SELECT f.reporte_id IS NULL AS sin_reporte,
                f.subido_por::text AS subido_por,
                r.autor_id::text AS autor_id,
                coalesce(${condicionPublico('r')}, false) AS publica,
                coalesce(${condicionPublicado('r')}, false) AS publicado
         FROM reporte_foto f
         LEFT JOIN reporte_inundacion r ON r.id = f.reporte_id
        WHERE f.objeto_key = $1 AND f.exif_sanitizado`,
        [key],
      );
      const meta = fila.rows[0];
      // La visibilidad se decide ANTES de mirar If-None-Match: una foto de un reporte retirado da
      // 404 aunque la caché del navegador todavía tenga su ETag, nunca 304.
      const modo = meta ? modoDeFoto(meta, req.usuario?.id, req.usuario?.rol) : null;
      if (!modo) return noEncontrada();
      res.header('X-Content-Type-Options', 'nosniff');
      if (modo === 'publica') {
        // `public, no-cache`: cualquier caché la guarda, pero la revalida en cada uso. Retirar el
        // reporte (rechazar o fusionar) es el único control que queda sin moderación previa, y con
        // `max-age` una caché compartida seguiría sirviendo la foto retirada. El 304 es barato:
        // no lee el objeto del almacén.
        const etag = etagDeFoto(key);
        res.header('Cache-Control', 'public, no-cache');
        res.header('ETag', etag);
        if (coincideEtag(req.headers['if-none-match'], etag)) return res.status(304).send();
      } else {
        // Del autor, de quien la subió o de un técnico: nunca en una caché compartida.
        res.header('Cache-Control', 'private, no-store');
      }
      const obj = await dep.almacen.leer(key);
      if (!obj) {
        res.removeHeader('ETag');
        res.header('Cache-Control', 'private, no-store');
        return noEncontrada();
      }
      res.header('Content-Type', MIME_POR_EXTENSION[extension]);
      return res.send(obj.datos);
    },
  );
}
