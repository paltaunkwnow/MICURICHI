import type { ResolverRespuesta } from 'contracts';
import type { Ejecutor } from 'db';
import { hashPassword } from 'db';
import type { FastifyInstance } from 'fastify';
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

/** Cuentas de prueba. `vecina` y `vecino` son ciudadanas: reportar exige sesión desde la 0009. */
export const CUENTAS = {
  tecnico: 'tecnico@test.local',
  admin: 'admin@test.local',
  vecina: 'vecina@test.local',
  vecino: 'vecino@test.local',
} as const;

export async function crearUsuarios(ex: Ejecutor) {
  await ex.consultar(
    `INSERT INTO usuario (email, nombre, rol, password_hash) VALUES
       ('tecnico@test.local', 'Técnico', 'tecnico', $1),
       ('admin@test.local', 'Admin', 'admin', $1),
       ('vecina@test.local', 'Vecina', 'ciudadano', $1),
       ('vecino@test.local', 'Vecino', 'ciudadano', $1)`,
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
 * Devuelve el turno de reporte a una cuenta.
 *
 * NO desactiva la cuota: la cuota sigue aplicándose en cada creación, y hay pruebas dedicadas a
 * comprobar que rechaza el segundo envío y que resiste la concurrencia. Esto es para las pruebas
 * que necesitan VARIOS reportes para montar el escenario que sí están probando (fotos, filtros,
 * moderación, privacidad), y que si no tendrían que esperar una hora o inventar una cuenta por
 * reporte. Adelantar el reloj de la cuota es lo mismo que haría el paso del tiempo.
 */
export async function liberarCuota(ex: Ejecutor, email: string = CUENTAS.vecina) {
  await ex.consultar('UPDATE usuario SET ultimo_reporte_en = NULL WHERE email = $1', [email]);
}

export const reporteValido = {
  lat: -17.79,
  lon: -63.195,
  ubicacion_metodo: 'manual',
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte y tarda horas en irse.',
  tirante_estimado: 'rodilla',
  duracion_estimada: '2h_12h',
  frecuencia: 'cada_lluvia_fuerte',
  afectacion: 'ingreso_viviendas',
  causa_presunta: 'sumidero_tapado',
};

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
