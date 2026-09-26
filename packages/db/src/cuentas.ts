/**
 * Alta y baja de cuentas técnicas, ejecutivas y de administrador (revisión de producción,
 * 2026-09-26).
 *
 * El defecto que esto cierra: los seeds se niegan con NODE_ENV=production (correcto, CLAUDE.md
 * §0.3) y el alta pública (`POST /auth/registro`) solo puede crear `ciudadano` — los privilegios
 * por columna de la migración 0009 ni siquiera dejan que ese camino escriba `rol`. Resultado: una
 * instalación nueva no tenía forma de conseguir su primer admin. Este módulo es la lógica pura
 * (sin CLI) que usa `cli/cuentas-comando.ts`; vive aparte para poder probarla con una base efímera
 * sin pasar por `process.argv` ni por un proceso hijo.
 *
 * Por qué el rol se valida contra `ROLES_DEL_PANEL` (tecnico, admin, ejecutivo) y no contra
 * `ROLES` completo: `ciudadano` se registra solo, y dejar que este CLI también lo cree
 * duplicaría ese camino con reglas distintas (aquí no hay límite de IP ni de cuota).
 */
import { CONFIG_DOMINIO, ROLES_DEL_PANEL, type RolDelPanel } from 'contracts';
import type { Ejecutor } from './ejecutor.js';
import { hashPassword } from './password.js';

const EMAIL_FORMA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Recorta y baja a minúsculas, igual que `EmailSchema` de contracts (mismo índice único en SQL). */
export function normalizarEmail(email: string): string {
  const limpio = email.trim().toLowerCase();
  if (limpio.length === 0 || !EMAIL_FORMA.test(limpio))
    throw new Error(`email inválido («${email}»): tiene que tener forma de correo electrónico.`);
  if (limpio.length > 200) throw new Error('email: máximo 200 caracteres.');
  return limpio;
}

/** Mismos límites que `RegistroSchema.nombre` (contracts). */
export function normalizarNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length < 2) throw new Error('nombre: escribí al menos 2 caracteres.');
  if (limpio.length > 80) throw new Error('nombre: máximo 80 caracteres.');
  return limpio;
}

/** Rechaza `ciudadano` (se registra solo) y cualquier valor que no sea un rol del panel. */
export function normalizarRol(rol: string): RolDelPanel {
  if (rol === 'ciudadano')
    throw new Error(
      'rol «ciudadano»: esas cuentas se registran solas (POST /api/v1/auth/registro); este CLI no las crea.',
    );
  if (!(ROLES_DEL_PANEL as readonly string[]).includes(rol))
    throw new Error(`rol inválido («${rol}»): tiene que ser uno de ${ROLES_DEL_PANEL.join(', ')}.`);
  return rol as RolDelPanel;
}

/** Mismo rango que exige el login/registro (CONFIG_DOMINIO, contracts). */
export function validarPassword(password: string): void {
  if (password.length < CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD)
    throw new Error(
      `password: necesita al menos ${CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD} caracteres.`,
    );
  if (password.length > CONFIG_DOMINIO.PASSWORD_MAX_LONGITUD)
    throw new Error(`password: máximo ${CONFIG_DOMINIO.PASSWORD_MAX_LONGITUD} caracteres.`);
}

export interface OpcionesCrearCuenta {
  email: string;
  nombre: string;
  /** Se valida contra ROLES_DEL_PANEL; una cadena cualquiera para poder dar un mensaje claro. */
  rol: string;
  password: string;
  /** Si el email ya existe: false (por defecto) rechaza, true actualiza nombre/rol/contraseña. */
  actualizar?: boolean;
}

export interface CuentaResultado {
  id: string;
  email: string;
  nombre: string;
  rol: RolDelPanel;
  accion: 'creada' | 'actualizada';
}

/**
 * Crea una cuenta con rol técnico, ejecutivo o admin, o la actualiza si ya existe y se pidió
 * `actualizar`. Corre con el rol DUEÑO de la base (no `curichi_api`): la migración 0009 le retira a
 * propósito el permiso de escribir `usuario.rol` al rol de aplicación, así que esta operación es
 * deliberadamente de administración, no de runtime.
 *
 * Nunca guarda la contraseña en claro en ningún lado (ni en `auditoria`): solo su hash Argon2id.
 */
export async function crearOActualizarCuenta(
  ex: Ejecutor,
  o: OpcionesCrearCuenta,
): Promise<CuentaResultado> {
  const email = normalizarEmail(o.email);
  const nombre = normalizarNombre(o.nombre);
  const rol = normalizarRol(o.rol);
  validarPassword(o.password);

  const [existente] = await ex.consultar<{ id: string; nombre: string; rol: RolDelPanel }>(
    'SELECT id::text, nombre, rol FROM usuario WHERE lower(email) = lower($1)',
    [email],
  );

  if (existente && !o.actualizar)
    throw new Error(
      `ya existe una cuenta con el email «${email}» (rol ${existente.rol}); pasá --actualizar si querés cambiarla.`,
    );

  const hash = await hashPassword(o.password);

  if (existente) {
    await ex.consultar(
      'UPDATE usuario SET nombre = $2, rol = $3::rol, password_hash = $4 WHERE id = $1',
      [existente.id, nombre, rol, hash],
    );
    await ex.consultar(
      'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        'usuario',
        existente.id,
        'actualizar_cuenta',
        null,
        JSON.stringify({ nombre: existente.nombre, rol: existente.rol }),
        JSON.stringify({ nombre, rol }),
      ],
    );
    return { id: existente.id, email, nombre, rol, accion: 'actualizada' };
  }

  const [creado] = await ex.consultar<{ id: string }>(
    'INSERT INTO usuario (email, nombre, rol, password_hash) VALUES ($1, $2, $3::rol, $4) RETURNING id::text',
    [email, nombre, rol, hash],
  );
  // creado no puede faltar: el INSERT de arriba, sin ON CONFLICT, o devuelve una fila o lanza.
  await ex.consultar(
    'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, despues) VALUES ($1, $2, $3, $4, $5)',
    ['usuario', creado!.id, 'crear_cuenta', null, JSON.stringify({ email, nombre, rol })],
  );
  return { id: creado!.id, email, nombre, rol, accion: 'creada' };
}

export interface CuentaDesactivada {
  id: string;
  email: string;
  /** Cuántas filas de `sesion` se borraron (sesiones activas cerradas). */
  sesionesCerradas: number;
}

/**
 * Pone `activo = false` y cierra (borra) todas sus sesiones. Idempotente: desactivar dos veces la
 * misma cuenta no falla, la segunda vez solo cierra cero sesiones.
 */
export async function desactivarCuenta(
  ex: Ejecutor,
  emailBruto: string,
): Promise<CuentaDesactivada> {
  const email = normalizarEmail(emailBruto);
  const [existente] = await ex.consultar<{ id: string; activo: boolean }>(
    'SELECT id::text, activo FROM usuario WHERE lower(email) = lower($1)',
    [email],
  );
  if (!existente) throw new Error(`no existe ninguna cuenta con el email «${email}».`);

  await ex.consultar('UPDATE usuario SET activo = false WHERE id = $1', [existente.id]);
  const cerradas = await ex.consultar<{ id: string }>(
    'DELETE FROM sesion WHERE usuario_id = $1 RETURNING id',
    [existente.id],
  );
  await ex.consultar(
    'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      'usuario',
      existente.id,
      'desactivar_cuenta',
      null,
      JSON.stringify({ activo: existente.activo }),
      JSON.stringify({ activo: false }),
    ],
  );
  return { id: existente.id, email, sesionesCerradas: cerradas.length };
}

export interface CuentaReactivada {
  id: string;
  email: string;
}

/**
 * Pone `activo = true`. No toca `password_hash` ni `rol`: reactivar es una acción aparte y
 * deliberada, nunca un efecto secundario de `--actualizar` (decisión del coordinador, revisión de
 * producción 2026-09-26: un cambio de contraseña no debe devolver el acceso por accidente).
 *
 * A diferencia de `desactivarCuenta`, esto NO es idempotente a propósito: reactivar una cuenta que
 * ya está activa casi siempre significa que el email es el equivocado, así que falla en vez de
 * callarlo con un no-op.
 */
export async function reactivarCuenta(ex: Ejecutor, emailBruto: string): Promise<CuentaReactivada> {
  const email = normalizarEmail(emailBruto);
  const [existente] = await ex.consultar<{ id: string; activo: boolean }>(
    'SELECT id::text, activo FROM usuario WHERE lower(email) = lower($1)',
    [email],
  );
  if (!existente) throw new Error(`no existe ninguna cuenta con el email «${email}».`);
  if (existente.activo) throw new Error(`la cuenta «${email}» ya está activa.`);

  await ex.consultar('UPDATE usuario SET activo = true WHERE id = $1', [existente.id]);
  await ex.consultar(
    'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      'usuario',
      existente.id,
      'reactivar_cuenta',
      null,
      JSON.stringify({ activo: false }),
      JSON.stringify({ activo: true }),
    ],
  );
  return { id: existente.id, email };
}
