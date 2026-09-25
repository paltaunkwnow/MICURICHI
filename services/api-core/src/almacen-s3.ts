/**
 * Almacén de fotos sobre un servicio compatible con S3 (MinIO en local, S3 o cualquier otro
 * equivalente en producción).
 *
 * **Por qué existe.** `AlmacenDisco` escribe en el disco del proceso. Con una sola réplica eso
 * funciona; con dos, la foto que sube el vecino queda en el disco de la réplica que atendió esa
 * petición, y la petición que la pide después puede caer en la otra y recibir un 404. No es un
 * fallo que se vea en desarrollo: aparece el día que alguien escala, y lo hace de forma
 * intermitente, que es la peor manera de aparecer.
 *
 * **Por qué sin SDK.** Se hablan tres operaciones —PUT, GET y DELETE de un objeto— y la parte
 * difícil es la firma. `@aws-sdk/client-s3` trae decenas de megabytes y cientos de dependencias
 * transitivas para eso. Aquí la firma se calcula con `node:crypto`, que ya está: son unas setenta
 * líneas. Quien dice si están bien no es un test propio sino el servidor: `test/almacen-s3.test.ts`
 * guarda, lee y borra contra MinIO de verdad, y comprueba además que una credencial equivocada sea
 * rechazada. Una firma consistente puede ser consistentemente incorrecta.
 *
 * Lo que este adaptador NO hace, a propósito: listar, copiar, multipart, URLs prefirmadas ni
 * ciclo de vida. Las fotos las sirve `api-core` (que es quien sabe si el reporte está publicado,
 * CLAUDE.md §13), así que el bucket puede y debe ser privado.
 */
import { createHash, createHmac } from 'node:crypto';
import type { Almacen } from './almacen.js';

export interface ConfigS3 {
  /** Origen del servicio, p. ej. `http://minio:9000` o `https://s3.eu-south-2.amazonaws.com`. */
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  /**
   * `true` → `endpoint/bucket/clave` (lo que necesita MinIO y cualquier servicio con IP o
   * nombre de contenedor). `false` → `bucket.endpoint/clave`, el estilo de AWS.
   */
  rutaEnCamino: boolean;
  /** Plazo de cada operación. Sin él, un almacén que no contesta cuelga la petición del vecino. */
  plazoMs: number;
}

const VACIO_SHA256 = createHash('sha256').update('').digest('hex');

function hmac(clave: Buffer | string, dato: string): Buffer {
  return createHmac('sha256', clave).update(dato, 'utf8').digest();
}

function sha256(dato: Buffer | string): string {
  return createHash('sha256').update(dato).digest('hex');
}

/**
 * Codificación de un segmento de ruta según S3: como `encodeURIComponent`, pero dejando también
 * `!`, `'`, `(`, `)` y `*` sin escapar. Las claves de este proyecto son UUID + extensión, así que
 * en la práctica no cambia nada; se hace bien igualmente porque una firma que no coincide con la
 * ruta produce un 403 imposible de diagnosticar.
 */
function codificarSegmento(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `20260916T143000Z` y `20260916`, los dos formatos que pide SigV4. */
export function marcasDeTiempo(ahora: Date): { largo: string; corto: string } {
  const largo = `${ahora.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  return { largo, corto: largo.slice(0, 8) };
}

export interface PeticionFirmada {
  url: string;
  cabeceras: Record<string, string>;
}

/**
 * Firma una petición con AWS Signature Version 4.
 *
 * Se exporta para poder examinarla en los tests sin levantar nada: una firma mal calculada no
 * falla en el desarrollo de quien la escribe, falla en producción con un `SignatureDoesNotMatch`
 * que no dice dónde está el error.
 */
export function firmarSigV4(
  cfg: ConfigS3,
  metodo: string,
  camino: string,
  cuerpo: Buffer | null,
  ahora: Date,
  cabecerasExtra: Record<string, string> = {},
): PeticionFirmada {
  const base = new URL(cfg.endpoint);
  const anfitrion = cfg.rutaEnCamino ? base.host : `${cfg.bucket}.${base.host}`;
  const rutaCanonica = cfg.rutaEnCamino
    ? `/${codificarSegmento(cfg.bucket)}/${codificarSegmento(camino)}`
    : `/${codificarSegmento(camino)}`;
  const { largo, corto } = marcasDeTiempo(ahora);
  const huellaCuerpo = cuerpo ? sha256(cuerpo) : VACIO_SHA256;

  const cabeceras: Record<string, string> = {
    host: anfitrion,
    'x-amz-content-sha256': huellaCuerpo,
    'x-amz-date': largo,
    ...cabecerasExtra,
  };
  // El orden alfabético de las claves en minúscula es parte de la firma, no una preferencia.
  const nombres = Object.keys(cabeceras)
    .map((n) => n.toLowerCase())
    .sort();
  const canonicas = nombres
    .map((n) => {
      const valor = Object.entries(cabeceras).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
      return `${n}:${valor.trim().replace(/\s+/g, ' ')}\n`;
    })
    .join('');
  const firmadas = nombres.join(';');

  const peticionCanonica = [
    metodo,
    rutaCanonica,
    '', // sin parámetros de consulta
    canonicas,
    firmadas,
    huellaCuerpo,
  ].join('\n');

  const ambito = `${corto}/${cfg.region}/s3/aws4_request`;
  const porFirmar = ['AWS4-HMAC-SHA256', largo, ambito, sha256(peticionCanonica)].join('\n');

  const claveFecha = hmac(`AWS4${cfg.secretKey}`, corto);
  const claveRegion = hmac(claveFecha, cfg.region);
  const claveServicio = hmac(claveRegion, 's3');
  const claveFirma = hmac(claveServicio, 'aws4_request');
  const firma = createHmac('sha256', claveFirma).update(porFirmar, 'utf8').digest('hex');

  return {
    // `URL.host` ya trae el puerto si lo hay, y ese mismo valor es el que se firma en `host`:
    // si la cabecera y la URL no coinciden, el servicio responde 403 sin explicar por qué.
    url: `${base.protocol}//${anfitrion}${rutaCanonica}`,
    cabeceras: {
      ...cabeceras,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${ambito}, SignedHeaders=${firmadas}, Signature=${firma}`,
    },
  };
}

export class AlmacenS3 implements Almacen {
  constructor(private cfg: ConfigS3) {}

  private async pedir(
    metodo: string,
    clave: string,
    cuerpo: Buffer | null,
    cabecerasExtra: Record<string, string> = {},
  ): Promise<Response> {
    const { url, cabeceras } = firmarSigV4(
      this.cfg,
      metodo,
      clave,
      cuerpo,
      new Date(),
      cabecerasExtra,
    );
    return fetch(url, {
      method: metodo,
      headers: cabeceras,
      // Buffer es un Uint8Array, que `fetch` acepta como cuerpo tal cual.
      body: cuerpo ?? undefined,
      signal: AbortSignal.timeout(this.cfg.plazoMs),
    });
  }

  async guardar(key: string, datos: Buffer, mime: string): Promise<void> {
    const r = await this.pedir('PUT', key, datos, {
      'content-type': mime,
      'content-length': String(datos.length),
    });
    if (!r.ok) {
      // El cuerpo del error de S3 es XML con el código; se incluye recortado porque sin él
      // «falló el guardado» no distingue una credencial mala de un bucket que no existe.
      const detalle = await r.text().catch(() => '');
      throw new Error(
        `S3 rechazó el guardado de la foto (HTTP ${r.status}): ${detalle.slice(0, 300)}`,
      );
    }
  }

  async leer(key: string): Promise<{ datos: Buffer; mime: string } | null> {
    const r = await this.pedir('GET', key, null);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 rechazó la lectura de la foto (HTTP ${r.status})`);
    const datos = Buffer.from(await r.arrayBuffer());
    return { datos, mime: r.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async borrar(key: string): Promise<void> {
    const r = await this.pedir('DELETE', key, null);
    // 204 es el éxito normal; 404 significa que ya no estaba, que es el estado buscado.
    if (!r.ok && r.status !== 404)
      throw new Error(`S3 rechazó el borrado de la foto (HTTP ${r.status})`);
  }

  /** Comprobación de arranque: credenciales, bucket y red, antes de la primera foto. */
  async comprobar(): Promise<void> {
    // Un GET a una clave que no existe devuelve 404 si todo está bien, y 403 si la credencial
    // o el bucket no lo están. Es la sonda más barata que distingue ambos casos.
    const r = await this.pedir('GET', 'comprobacion-de-arranque', null);
    if (r.status === 404 || r.ok) return;
    const detalle = await r.text().catch(() => '');
    throw new Error(
      `No se pudo hablar con el almacén S3 (HTTP ${r.status}). Revisá S3_ENDPOINT, S3_BUCKET y las credenciales. ${detalle.slice(0, 300)}`,
    );
  }
}

/**
 * Lee la configuración de S3 del entorno. Devuelve `null` si no está configurado, que es la
 * señal para seguir usando el disco: activar S3 es una decisión explícita, no un accidente.
 */
export function leerConfigS3(env: NodeJS.ProcessEnv = process.env): ConfigS3 | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  if (!endpoint) return null;
  const faltan = (['S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const).filter(
    (n) => !env[n]?.trim(),
  );
  if (faltan.length)
    throw new Error(
      `S3_ENDPOINT está definido, así que las fotos van a S3, pero falta: ${faltan.join(', ')}.`,
    );
  return {
    endpoint,
    bucket: (env.S3_BUCKET as string).trim(),
    region: env.S3_REGION?.trim() || 'us-east-1',
    accessKey: (env.S3_ACCESS_KEY as string).trim(),
    secretKey: (env.S3_SECRET_KEY as string).trim(),
    // MinIO y cualquier endpoint con IP o nombre de contenedor necesitan el bucket en el camino;
    // el estilo con subdominio solo funciona con un DNS que lo resuelva.
    rutaEnCamino: env.S3_ESTILO_RUTA !== '0',
    plazoMs: Number(env.S3_PLAZO_MS ?? 15_000),
  };
}
