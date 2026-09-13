import { LoginSchema } from 'contracts';
import type { FastifyInstance } from 'fastify';
import type { Dependencias } from '../app.js';
import { COOKIE_SESION, crearSesion, verificarPassword } from '../auth.js';

export async function rutasAuth(app: FastifyInstance, dep: Dependencias) {
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (req, res) => {
      const p = LoginSchema.safeParse(req.body);
      if (!p.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Email o contraseña con formato inválido.',
        });
      const r = await dep.pool.query<{
        id: string;
        email: string;
        nombre: string;
        rol: 'ciudadano' | 'tecnico' | 'admin';
        password_hash: string;
      }>(
        'SELECT id, email, nombre, rol, password_hash FROM usuario WHERE lower(email) = lower($1) AND activo',
        [p.data.email],
      );
      const u = r.rows[0];
      if (!u || !verificarPassword(p.data.password, u.password_hash)) {
        return res
          .status(401)
          .send({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Email o contraseña incorrectos.' });
      }
      const s = await crearSesion(dep.pool, u.id, dep.cfg.sesionDias);
      res.setCookie(COOKIE_SESION, s.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: dep.cfg.cookieSegura,
        path: '/',
        expires: s.expira,
      });
      await dep.pool.query(
        'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id) VALUES ($1, $2, $3, $4)',
        ['usuario', u.id, 'login', u.id],
      );
      return { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol };
    },
  );

  app.post('/api/v1/auth/logout', async (req, res) => {
    const id = req.cookies[COOKIE_SESION];
    if (id) await dep.pool.query('DELETE FROM sesion WHERE id = $1', [id]);
    res.clearCookie(COOKIE_SESION, { path: '/' });
    return res.status(204).send();
  });

  app.get('/api/v1/auth/yo', async (req, res) => {
    if (!req.usuario) return res.status(401).send({ codigo: 'SIN_SESION', mensaje: 'Sin sesión.' });
    return req.usuario;
  });
}
