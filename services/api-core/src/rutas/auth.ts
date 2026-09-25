import { LoginSchema, RegistroSchema } from 'contracts';
import {
  anotarRegistro,
  ejecutorPg,
  estadoDeLogin,
  estadoDeRegistro,
  hashPassword,
  hashSeñuelo,
  necesitaRehash,
  registrarIntento,
  verificarPassword,
} from 'db';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Dependencias } from '../app.js';
import { COOKIE_SESION, crearSesion } from '../auth.js';
import { proximoEnvioPermitido } from '../cuota.js';
import { hashIp } from '../privacidad.js';

/**
 * Abre sesión en la respuesta. Antes de crear la nueva se **borra la que trajera la petición**:
 * sin eso, quien consigue plantar una cookie de sesión en el navegador de otra persona (una
 * subdominio comprometido, un kiosco compartido) se queda con un identificador que sigue siendo
 * válido después de que la víctima inicie sesión. Es la fijación de sesión clásica, y la defensa
 * es no reutilizar nunca el identificador anterior.
 */
async function abrirSesion(
  dep: Dependencias,
  res: FastifyReply,
  usuarioId: string,
  sesionPrevia: string | undefined,
) {
  if (sesionPrevia) await dep.pool.query('DELETE FROM sesion WHERE id = $1', [sesionPrevia]);
  const s = await crearSesion(dep.pool, usuarioId, dep.cfg.sesionDias);
  res.setCookie(COOKIE_SESION, s.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: dep.cfg.cookieSegura,
    path: '/',
    expires: s.expira,
  });
}

export async function rutasAuth(app: FastifyInstance, dep: Dependencias) {
  /*
   * ───────────────────────────── Alta de cuenta ciudadana ─────────────────────────────
   *
   * Ver el mapa no necesita cuenta y nunca la va a necesitar. Reportar sí, desde la Fase 5: el
   * límite por IP no resiste a una IP dinámica, y sin identidad no hay nada estable que limitar.
   *
   * Tres cosas que esta ruta NO hace, y las tres a propósito:
   *
   *  1. No acepta `rol`. El rol lo pone el DEFAULT de la columna, y el rol de la base de datos
   *     con el que corre api-core ni siquiera tiene permiso para escribir esa columna
   *     (migración 0009). Aunque alguien lograra colar el campo, PostgreSQL lo rechazaría.
   *  2. No dice si el correo ya existía. Un «ese correo ya está registrado» convierte esta ruta
   *     en un oráculo para saber quién tiene cuenta en el sistema de reportes de inundación del
   *     municipio, que es justamente el tipo de dato que no queremos repartir.
   *  3. No inicia sesión sola. Iniciar sesión implicaría devolver una cookie, y devolver cookie
   *     solo cuando la cuenta es nueva delataría exactamente lo que el punto 2 oculta. Se paga
   *     con un paso más en la interfaz y se gana que la respuesta sea indistinguible.
   */
  app.post(
    '/api/v1/auth/registro',
    {
      config: {
        rateLimit: {
          max: dep.cfg.registroPeticionesPorVentana,
          timeWindow: dep.cfg.limitesLogin.ventanaMinutos * 60_000,
        },
      },
    },
    async (req, res) => {
      const p = RegistroSchema.safeParse(req.body);
      if (!p.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Revisá los datos de la cuenta.',
          detalles: p.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
        });

      const ex = ejecutorPg(dep.pool);
      const freno = await estadoDeRegistro(
        ex,
        req.ip,
        dep.cfg.salIp,
        dep.cfg.registroPorIp,
        dep.cfg.registroVentanaMinutos,
      );
      if (freno.bloqueado) {
        req.log.warn(
          { ipHash: hashIp(req.ip, dep.cfg.salIp) },
          'alta de cuenta frenada: demasiadas desde la misma IP',
        );
        res.header('Retry-After', String(freno.reintentarEnS));
        return res.status(429).send({
          codigo: 'DEMASIADAS_CUENTAS',
          mensaje:
            'Se crearon demasiadas cuentas desde esta conexión. Probá de nuevo dentro de un rato.',
        });
      }
      // Se anota ANTES de saber si el correo estaba libre: probar correos hasta encontrar uno
      // disponible tiene que consumir cuota igual que crear la cuenta.
      await anotarRegistro(ex, req.ip, dep.cfg.salIp);

      // El hash se calcula siempre, exista o no el correo. Es el coste dominante de la petición
      // (~60 ms de Argon2id) y calcularlo solo en una de las dos ramas dejaría una diferencia de
      // tiempo medible que respondería la pregunta que la respuesta se niega a responder.
      const hash = await hashPassword(p.data.password);

      // `ON CONFLICT DO NOTHING` contra el índice único de `lower(email)`. Resuelve también dos
      // altas simultáneas del mismo correo: una crea, la otra no, sin error y sin carrera.
      // La lista de columnas es exactamente la que el rol tiene permitida; `rol` y `activo`
      // quedan en su DEFAULT porque no hay manera de escribirlos desde aquí.
      const ins = await dep.pool.query<{ id: string }>(
        `INSERT INTO usuario (email, nombre, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING id`,
        [p.data.email, p.data.nombre, hash],
      );
      const creado = ins.rows[0];
      if (creado) {
        await dep.pool.query(
          'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id) VALUES ($1, $2, $3, $4)',
          ['usuario', creado.id, 'registro', creado.id],
        );
        app.metricas.contar('curichi_cuentas_creadas_total');
      } else {
        // Al log sí, porque el log no es la respuesta: saber que alguien reintenta con correos
        // existentes es señal de sondeo. Sin el correo y sin la IP en claro (§13).
        req.log.info(
          { ipHash: hashIp(req.ip, dep.cfg.salIp) },
          'alta de cuenta sobre un correo que ya existía',
        );
      }

      // La misma respuesta en los dos casos. Quien tenga cuenta y llegue aquí por error entra
      // con su contraseña de siempre; quien la acaba de crear, con la que acaba de elegir.
      return res.status(201).send({
        codigo: 'CUENTA_LISTA',
        mensaje: 'Ya podés iniciar sesión con ese correo y esa contraseña.',
      });
    },
  );

  app.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: dep.cfg.loginPeticionesPorVentana,
          timeWindow: dep.cfg.limitesLogin.ventanaMinutos * 60_000,
        },
      },
    },
    async (req, res) => {
      const p = LoginSchema.safeParse(req.body);
      if (!p.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Email o contraseña con formato inválido.',
        });
      const ex = ejecutorPg(dep.pool);
      const email = p.data.email;

      // Se consulta ANTES de verificar la contraseña: así un ataque tampoco consume el scrypt,
      // que es caro a propósito y sería un vector de agotamiento de CPU.
      const freno = await estadoDeLogin(ex, email, req.ip, dep.cfg.salIp, dep.cfg.limitesLogin);
      if (freno.bloqueado) {
        req.log.warn(
          { ipHash: hashIp(req.ip, dep.cfg.salIp) },
          'login frenado por demasiados intentos fallidos',
        );
        res.header('Retry-After', String(freno.reintentarEnS));
        return res.status(429).send({
          codigo: 'DEMASIADOS_INTENTOS',
          mensaje: 'Demasiados intentos fallidos. Probá de nuevo en unos minutos.',
        });
      }

      const r = await dep.pool.query<{
        id: string;
        email: string;
        nombre: string;
        rol: 'ciudadano' | 'tecnico' | 'admin';
        password_hash: string;
      }>(
        'SELECT id, email, nombre, rol, password_hash FROM usuario WHERE lower(email) = lower($1) AND activo',
        [email],
      );
      const u = r.rows[0];
      // Se verifica siempre, incluso sin usuario: con un hash señuelo el tiempo de respuesta
      // no delata si el email existe (Argon2id tarda ~50 ms; la diferencia era medible).
      const valida = await verificarPassword(
        p.data.password,
        u?.password_hash ?? (await hashSeñuelo()),
      );
      if (!u || !valida) {
        await registrarIntento(ex, email, req.ip, dep.cfg.salIp, false);
        // Nunca la IP en claro: el log es un dato personal más (§13).
        req.log.warn({ ipHash: hashIp(req.ip, dep.cfg.salIp) }, 'login fallido');
        return res
          .status(401)
          .send({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Email o contraseña incorrectos.' });
      }
      await registrarIntento(ex, email, req.ip, dep.cfg.salIp, true);

      // Migración transparente: el hash viejo (scrypt) se reemplaza por Argon2id en cuanto la
      // persona entra bien. Nadie se queda fuera y nadie tiene que cambiar su contraseña.
      if (necesitaRehash(u.password_hash)) {
        try {
          const nuevo = await hashPassword(p.data.password);
          await dep.pool.query('UPDATE usuario SET password_hash = $2 WHERE id = $1', [
            u.id,
            nuevo,
          ]);
        } catch (e) {
          // Que falle la migración no puede impedir el inicio de sesión: se reintenta al próximo.
          req.log.error({ err: e }, 'no se pudo migrar el hash de contraseña');
        }
      }

      await abrirSesion(dep, res, u.id, req.cookies[COOKIE_SESION]);
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

  /**
   * Estado de la sesión. Devuelve además `puede_reportar_desde`: el momento en que esta cuenta
   * vuelve a tener turno para reportar, o null si lo tiene ahora. Es dato propio de quien
   * pregunta —solo llega con su cookie— y sirve para que la interfaz avise antes de que el vecino
   * rellene cinco pantallas para encontrarse un 429 al final.
   *
   * No sustituye a la comprobación del servidor: la autoridad sigue siendo el UPDATE atómico de
   * `cuota.ts`. Esto es cortesía, no control.
   */
  app.get('/api/v1/auth/yo', async (req, res) => {
    if (!req.usuario) return res.status(401).send({ codigo: 'SIN_SESION', mensaje: 'Sin sesión.' });
    const desde = await proximoEnvioPermitido(
      dep.pool,
      req.usuario.id,
      dep.cfg.minutosEntreReportes,
    );
    return { ...req.usuario, puede_reportar_desde: desde ? desde.toISOString() : null };
  });
}
