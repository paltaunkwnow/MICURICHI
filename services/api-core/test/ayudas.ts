import { RADIO_TIERRA_M, type ResolverRespuesta } from 'contracts';
import type { Ejecutor } from 'db';
import { hashPassword } from 'db';
import type { FastifyInstance } from 'fastify';
import { type ConfigApi, leerConfig } from '../src/config.js';
import type { ResolverGeo } from '../src/resolver.js';

/** Resolver falso coherente con las capas de prueba de db/test-utils: UV A es lon −63.20..−63.19, lat −17.80..−17.78. */
export const resolverDePrueba: ResolverGeo = {
  async resolver(lat, lon): Promise<ResolverRespuesta> {
    const dentro = lat >= -17.8 && lat <= -17.78 && lon >= -63.2 && lon <= -63.17;
    return {
      dentro_cobertura: dentro,
      distrito: dentro
        ? { id: 'distrito_municipal:01', codigo: '01', nombre: 'Distrito Uno (test)' }
        : null,
      unidad_vecinal: dentro
        ? {
            id: lon < -63.19 ? 'unidad_vecinal:A' : 'unidad_vecinal:B',
            codigo: lon < -63.19 ? 'A' : 'B',
            nombre: 'UV (test)',
          }
        : null,
      manzana: null,
      version_capa: dentro ? 'test' : null,
      en_limite: false,
      asignado_por_proximidad: false,
      distancia_m: null,
      distrito_discrepante: false,
    };
  },
  async invalidarCapas() {},
};

export const PASSWORD_PRUEBA = 'contrasena-test-123';

/**
 * Configuración de las pruebas: la de `leerConfig` con la demora de publicación en 0 y 0, así un
 * reporte recién creado se ve enseguida y las pruebas de filtros, moderación, fotos o privacidad no
 * tienen que esperar 60 o 240 s. La demora real la prueba `publicacion-diferida.test.ts`, que usa
 * `leerConfig` a secas (o `publicarYa` / `enEspera` para mover un reporte a mano).
 */
export function configDePrueba(env: NodeJS.ProcessEnv = {}): ConfigApi {
  return leerConfig({ REPORTE_DEMORA_PRIMERO_S: '0', REPORTE_DEMORA_SIGUIENTES_S: '0', ...env });
}

/** Termina la espera de un reporte: lo publica ya (el CHECK exige `publicar_en >= creado_en`). */
export async function publicarYa(ex: Ejecutor, id: string) {
  await ex.consultar('UPDATE reporte_inundacion SET publicar_en = creado_en WHERE id = $1', [id]);
}

/**
 * Pone un reporte en espera (media hora después de creado; el CHECK admite hasta una): para las
 * pruebas que corren con la demora en 0 y necesitan un reporte que todavía no se publicó.
 */
export async function enEspera(ex: Ejecutor, id: string) {
  const filas = await ex.consultar(
    `UPDATE reporte_inundacion SET publicar_en = GREATEST(creado_en, now()) + interval '30 minutes'
      WHERE id = $1 AND creado_en > now() - interval '25 minutes' RETURNING id`,
    [id],
  );
  if (filas.length !== 1) throw new Error(`enEspera: el reporte ${id} no existe o es viejo`);
}

/**
 * Cuentas de prueba. `vecina` y `vecino` son ciudadanas: reportar exige sesión desde la 0009.
 * `ejecutivo` (rol de la 0011) solo ve el resumen del panel ejecutivo; no modera ni exporta.
 */
export const CUENTAS = {
  tecnico: 'tecnico@test.local',
  admin: 'admin@test.local',
  vecina: 'vecina@test.local',
  vecino: 'vecino@test.local',
  ejecutivo: 'ejecutivo@test.local',
} as const;

export async function crearUsuarios(ex: Ejecutor) {
  await ex.consultar(
    `INSERT INTO usuario (email, nombre, rol, password_hash) VALUES
       ('tecnico@test.local', 'Técnico', 'tecnico', $1),
       ('admin@test.local', 'Admin', 'admin', $1),
       ('vecina@test.local', 'Vecina', 'ciudadano', $1),
       ('vecino@test.local', 'Vecino', 'ciudadano', $1),
       ('ejecutivo@test.local', 'Ejecutiva', 'ejecutivo', $1)`,
    [await hashPassword(PASSWORD_PRUEBA)],
  );
}

/** Inicia sesión y devuelve el valor de la cookie de sesión. */
export async function iniciarSesion(app: FastifyInstance, email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_PRUEBA },
  });
  if (r.statusCode !== 200)
    throw new Error(
      `login de ${email} devolvió ${r.statusCode}. Si es 429, la suite gastó el presupuesto de ` +
        'intentos: reutilizá una sesión en beforeAll en vez de entrar en cada prueba.',
    );
  return r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
}

/** Para `app.inject({ ..., cookies: sesion(cookieVecina) })`. */
export const sesion = (cookie: string) => ({ curichi_sesion: cookie });

/**
 * Devuelve los turnos de reporte del día a una cuenta (contracts 0.10.0: `cuota_reporte_diaria`).
 *
 * NO desactiva el cupo: sigue aplicándose en cada creación, y hay pruebas dedicadas a comprobar
 * que rechaza el 4.º envío y que resiste la concurrencia (`cupo-diario.test.ts` y los `*-pg`).
 * Esto es para las pruebas que necesitan VARIOS reportes para montar el escenario que sí están
 * probando (fotos, filtros, moderación, privacidad), y que si no tendrían que esperar al día
 * siguiente o inventar una cuenta cada tres reportes. Las fotos del día no se tocan.
 */
export async function liberarCuota(ex: Ejecutor, email: string = CUENTAS.vecina) {
  await ex.consultar(
    `UPDATE cuota_reporte_diaria SET reportes_n = 0
      WHERE usuario_id = (SELECT id FROM usuario WHERE email = $1)`,
    [email],
  );
}

/**
 * Payload de contracts 0.9.0: el teléfono está en el mismo punto que reporta, con una precisión y
 * una antigüedad que pasan los topes. `ubicacion_metodo` y `precision_gps_m` ya no los manda el
 * cliente: los deriva api-core de `dispositivo`.
 */
export const reporteValido = {
  lat: -17.79,
  lon: -63.195,
  dispositivo: { lat: -17.79, lon: -63.195, precision_m: 8, antiguedad_s: 3 },
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte y tarda horas en irse.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
  causa_presunta: 'sumidero_tapado',
};

/**
 * `reporteValido` en otro punto, con el teléfono parado en ese mismo punto. Sin mover también
 * `dispositivo`, el punto quedaría lejos del teléfono y el envío se cortaría con
 * UBICACION_FUERA_DE_RADIO antes de llegar a lo que la prueba quiere ejercitar.
 */
export function reporteEn(lat: number, lon: number, extra: Record<string, unknown> = {}) {
  return {
    ...reporteValido,
    lat,
    lon,
    dispositivo: { ...reporteValido.dispositivo, lat, lon },
    ...extra,
  };
}

/** Metros por grado de latitud en la esfera de `distanciaMetros` (contracts). */
const METROS_POR_GRADO = (RADIO_TIERRA_M * Math.PI) / 180;

/** El punto a `metros` al norte de `p` (al sur si es negativo), sobre el mismo meridiano. */
export function alNorte(p: { lat: number; lon: number }, metros: number) {
  return { lat: p.lat + metros / METROS_POR_GRADO, lon: p.lon };
}

/**
 * Ids de los trozos de un WebP, recorriendo el contenedor RIFF a mano. Es independiente de sharp
 * a propósito: `sharp.metadata()` informa lo que libvips entiende, y un trozo EXIF, XMP o ICCP que
 * viaje en el archivo sin que libvips lo reconozca pasaría esa comprobación.
 */
export function trozosRiff(b: Buffer): string[] {
  if (
    b.length < 12 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WEBP'
  )
    throw new Error('no es un RIFF…WEBP');
  if (b.readUInt32LE(4) !== b.length - 8) throw new Error('el tamaño del RIFF no coincide');
  const trozos: string[] = [];
  let o = 12;
  while (o + 8 <= b.length) {
    const n = b.readUInt32LE(o + 4);
    trozos.push(b.toString('ascii', o, o + 4));
    o += 8 + n + (n % 2);
  }
  if (o !== b.length) throw new Error('el último trozo del RIFF está cortado');
  return trozos;
}

export function multipart(campo: string, nombre: string, mime: string, datos: Buffer) {
  const boundary = `----curichi${Date.now()}`;
  const cabecera = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nombre}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const cierre = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([cabecera, datos, cierre]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
