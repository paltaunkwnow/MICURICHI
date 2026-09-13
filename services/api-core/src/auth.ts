/** Sesiones con cookie httpOnly y contraseñas con scrypt (Node, sin dependencias nativas). */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Rol, Usuario } from 'contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';

export const COOKIE_SESION = 'curichi_sesion';

export function verificarPassword(password: string, almacenado: string): boolean {
  const [alg, sal, hash] = almacenado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const calculado = scryptSync(password, sal, 64, { N: 16384, r: 8, p: 1 });
  const esperado = Buffer.from(hash, 'hex');
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

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

export async function usuarioDeSesion(
  pool: pg.Pool,
  sesionId: string | undefined,
): Promise<Usuario | null> {
  if (!sesionId || !/^[a-f0-9]{64}$/.test(sesionId)) return null;
  const r = await pool.query<Usuario>(
    `SELECT u.id, u.email, u.nombre, u.rol FROM sesion s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.id = $1 AND s.expira_en > now() AND u.activo`,
    [sesionId],
  );
  return r.rows[0] ?? null;
}

export interface OpcionesAuth {
  pool: pg.Pool;
}

/** Se registra sobre la instancia raíz (sin encapsular) para que el hook aplique a todas las rutas. */
export function instalarAuth(app: FastifyInstance, o: OpcionesAuth) {
  app.decorateRequest('usuario', null);
  app.addHook('onRequest', async (req) => {
    req.usuario = await usuarioDeSesion(o.pool, req.cookies[COOKIE_SESION]);
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
