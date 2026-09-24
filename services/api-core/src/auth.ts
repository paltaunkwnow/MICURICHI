/** Sesiones con cookie httpOnly. El hash de contraseñas vive en `db` (packages/db/src/password.ts). */
import { randomBytes } from 'node:crypto';
import type { Rol, Usuario } from 'contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';

export const COOKIE_SESION = 'curichi_sesion';

/**
 * Cada cuánto se refresca `ultimo_uso_en`. Sin este margen habría un UPDATE por petición: con el
 * mapa pidiendo datos constantemente, la tabla de sesiones se convertiría en un punto caliente.
 */
const REFRESCO_USO_MS = 60_000;

export async function crearSesion(
  pool: pg.Pool,
  usuarioId: string,
  dias: number,
): Promise<{ id: string; expira: Date }> {
  const id = randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + dias * 86_400_000);
  await pool.query('INSERT INTO sesion (id, usuario_id, expira_en) VALUES ($1, $2, $3)', [
    id,
    usuarioId,
    expira,
  ]);
  return { id, expira };
}

/**
 * Usuario de la sesión, si sigue viva. Dos caducidades a la vez:
 *  - `expira_en`: tope absoluto desde el inicio de sesión;
 *  - `ultimo_uso_en`: inactividad. Una cookie robada de un equipo compartido servía hasta 7 días;
 *    con el corte por inactividad deja de valer al poco de dejar de usarse.
 */
export async function usuarioDeSesion(
  pool: pg.Pool,
  sesionId: string | undefined,
  idleHoras: number,
): Promise<Usuario | null> {
  if (!sesionId || !/^[a-f0-9]{64}$/.test(sesionId)) return null;
  const r = await pool.query<Usuario & { refrescar: boolean }>(
    `SELECT u.id, u.email, u.nombre, u.rol,
            (s.ultimo_uso_en < now() - ($3 || ' milliseconds')::interval) AS refrescar
     FROM sesion s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.id = $1
       AND s.expira_en > now()
       AND s.ultimo_uso_en > now() - ($2 || ' hours')::interval
       AND u.activo`,
    [sesionId, String(idleHoras), String(REFRESCO_USO_MS)],
  );
  const fila = r.rows[0];
  if (!fila) return null;
  if (fila.refrescar) {
    // Sin await: refrescar la marca no debe añadir latencia a la petición del usuario.
    void pool
      .query('UPDATE sesion SET ultimo_uso_en = now() WHERE id = $1', [sesionId])
      .catch(() => {});
  }
  const { refrescar: _omitido, ...usuario } = fila;
  return usuario;
}

export interface OpcionesAuth {
  pool: pg.Pool;
  idleHoras: number;
}

/** Se registra sobre la instancia raíz (sin encapsular) para que el hook aplique a todas las rutas. */
export function instalarAuth(app: FastifyInstance, o: OpcionesAuth) {
  app.decorateRequest('usuario', null);
  app.addHook('onRequest', async (req) => {
    req.usuario = await usuarioDeSesion(o.pool, req.cookies[COOKIE_SESION], o.idleHoras);
  });
}

export function requerirRol(...roles: Rol[]) {
  return async (req: FastifyRequest, res: FastifyReply) => {
    if (!req.usuario)
      return res
        .status(401)
        .send({ codigo: 'SIN_SESION', mensaje: 'Iniciá sesión para continuar.' });
    if (!roles.includes(req.usuario.rol))
      return res
        .status(403)
        .send({ codigo: 'SIN_PERMISO', mensaje: 'Tu rol no permite esta acción.' });
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
  }
}
