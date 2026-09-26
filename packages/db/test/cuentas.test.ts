/**
 * Alta y baja de cuentas (revisión de producción, 2026-09-26): sin esto, una instalación nueva no
 * tenía forma de crear su primer admin. Cubre lo que pide la tarea: crear admin, rechazar
 * ciudadano, rechazar contraseña corta, email duplicado, --actualizar, desactivar (con cierre de
 * sesiones) y reactivar. El registro en `auditoria` (actor nulo) se comprueba en cada caso
 * relevante.
 *
 * Decisión del coordinador: `--actualizar` NO reactiva una cuenta (un cambio de contraseña no debe
 * devolver el acceso por accidente). Reactivar es un subcomando aparte y explícito, que además no
 * es idempotente a propósito: llamarlo sobre una cuenta ya activa suele significar que el email es
 * el equivocado, así que falla en vez de callarlo.
 */
import { CONFIG_DOMINIO } from 'contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  crearOActualizarCuenta,
  desactivarCuenta,
  normalizarEmail,
  normalizarNombre,
  normalizarRol,
  reactivarCuenta,
  validarPassword,
} from '../src/cuentas.js';
import type { Ejecutor } from '../src/ejecutor.js';
import { type BaseEfimera, levantarBaseEfimera } from '../src/test-utils.js';

let base: BaseEfimera;
let ex: Ejecutor;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  ex = base.ejecutor;
}, 120_000);

afterAll(async () => {
  await base?.cerrar();
});

beforeEach(async () => {
  await ex.consultar('DELETE FROM auditoria');
  await ex.consultar('DELETE FROM sesion');
  await ex.consultar('DELETE FROM usuario');
});

const PASSWORD_VALIDA = 'una-contraseña-larga-de-prueba';

describe('validaciones puras', () => {
  it('normaliza el email (recorta y baja a minúsculas) y rechaza lo que no tiene forma de correo', () => {
    expect(normalizarEmail('  Admin@Municipio.Gob.Bo ')).toBe('admin@municipio.gob.bo');
    for (const malo of ['', 'no-es-un-correo', 'a@', '@b.com', 'a@b']) {
      expect(() => normalizarEmail(malo)).toThrow(/inválido/);
    }
  });

  it('exige al menos 2 caracteres de nombre y como máximo 80', () => {
    expect(normalizarNombre('  Ana  ')).toBe('Ana');
    expect(() => normalizarNombre('A')).toThrow(/al menos 2/);
    expect(() => normalizarNombre('x'.repeat(81))).toThrow(/máximo 80/);
  });

  it('acepta admin, tecnico y ejecutivo; rechaza ciudadano y cualquier otro valor', () => {
    expect(normalizarRol('admin')).toBe('admin');
    expect(normalizarRol('tecnico')).toBe('tecnico');
    expect(normalizarRol('ejecutivo')).toBe('ejecutivo');
    expect(() => normalizarRol('ciudadano')).toThrow(/se registran solas/);
    expect(() => normalizarRol('superadmin')).toThrow(/rol inválido/);
  });

  it('valida la longitud de la contraseña contra CONFIG_DOMINIO', () => {
    expect(() => validarPassword('corta')).toThrow(
      new RegExp(String(CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD)),
    );
    expect(() => validarPassword('x'.repeat(201))).toThrow(/máximo/);
    expect(() => validarPassword(PASSWORD_VALIDA)).not.toThrow();
  });
});

describe('crearOActualizarCuenta', () => {
  it('crea un admin: fila en usuario con Argon2id (nunca en claro) y auditoria con actor nulo', async () => {
    const r = await crearOActualizarCuenta(ex, {
      email: 'Admin@Curichi.Local',
      nombre: 'Admin municipal',
      rol: 'admin',
      password: PASSWORD_VALIDA,
    });
    expect(r).toMatchObject({
      email: 'admin@curichi.local',
      nombre: 'Admin municipal',
      rol: 'admin',
      accion: 'creada',
    });

    const [fila] = await ex.consultar<{
      email: string;
      nombre: string;
      rol: string;
      activo: boolean;
      password_hash: string;
    }>('SELECT email, nombre, rol, activo, password_hash FROM usuario WHERE id = $1', [r.id]);
    expect(fila).toMatchObject({
      email: 'admin@curichi.local',
      nombre: 'Admin municipal',
      rol: 'admin',
      activo: true,
    });
    expect(fila!.password_hash).toMatch(/^\$argon2id\$/);
    expect(fila!.password_hash).not.toContain(PASSWORD_VALIDA);

    const [auditoria] = await ex.consultar<{
      entidad: string;
      entidad_id: string;
      accion: string;
      actor_id: string | null;
      despues: { email: string; nombre: string; rol: string };
    }>(
      'SELECT entidad, entidad_id, accion, actor_id, despues FROM auditoria WHERE entidad_id = $1',
      [r.id],
    );
    expect(auditoria).toMatchObject({
      entidad: 'usuario',
      entidad_id: r.id,
      accion: 'crear_cuenta',
      actor_id: null,
    });
    expect(auditoria!.despues).toMatchObject({
      email: 'admin@curichi.local',
      nombre: 'Admin municipal',
      rol: 'admin',
    });
    // La contraseña (ni su hash) no viaja en el registro de auditoría.
    expect(JSON.stringify(auditoria)).not.toContain(PASSWORD_VALIDA);
    expect(JSON.stringify(auditoria)).not.toMatch(/argon2/);
  });

  it('crea tecnico y ejecutivo igual que admin', async () => {
    const tecnico = await crearOActualizarCuenta(ex, {
      email: 'tecnico@curichi.local',
      nombre: 'Técnico',
      rol: 'tecnico',
      password: PASSWORD_VALIDA,
    });
    expect(tecnico.rol).toBe('tecnico');
    const ejecutivo = await crearOActualizarCuenta(ex, {
      email: 'ejecutivo@curichi.local',
      nombre: 'Ejecutivo',
      rol: 'ejecutivo',
      password: PASSWORD_VALIDA,
    });
    expect(ejecutivo.rol).toBe('ejecutivo');
  });

  it('rechaza crear una cuenta ciudadana: esas se registran solas', async () => {
    await expect(
      crearOActualizarCuenta(ex, {
        email: 'vecino@curichi.local',
        nombre: 'Vecino',
        rol: 'ciudadano',
        password: PASSWORD_VALIDA,
      }),
    ).rejects.toThrow(/se registran solas/);
    const [conteo] = await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM usuario');
    expect(conteo!.n).toBe('0');
  });

  it('rechaza una contraseña más corta que PASSWORD_MIN_LONGITUD y no crea la fila', async () => {
    await expect(
      crearOActualizarCuenta(ex, {
        email: 'admin2@curichi.local',
        nombre: 'Admin corto',
        rol: 'admin',
        password: 'corta',
      }),
    ).rejects.toThrow(new RegExp(String(CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD)));
    const [conteo] = await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM usuario');
    expect(conteo!.n).toBe('0');
  });

  it('rechaza un email ya existente sin --actualizar, sin tocar la fila original', async () => {
    const primero = await crearOActualizarCuenta(ex, {
      email: 'admin@curichi.local',
      nombre: 'Primer admin',
      rol: 'admin',
      password: PASSWORD_VALIDA,
    });
    await expect(
      crearOActualizarCuenta(ex, {
        email: 'ADMIN@curichi.local', // mismo correo salvo mayúsculas: el índice único es case-insensitive
        nombre: 'Otro nombre',
        rol: 'tecnico',
        password: PASSWORD_VALIDA,
      }),
    ).rejects.toThrow(/ya existe una cuenta/);

    const [fila] = await ex.consultar<{ nombre: string; rol: string }>(
      'SELECT nombre, rol FROM usuario WHERE id = $1',
      [primero.id],
    );
    expect(fila).toMatchObject({ nombre: 'Primer admin', rol: 'admin' });
    const [conteo] = await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM usuario');
    expect(conteo!.n).toBe('1');
  });

  it('--actualizar cambia nombre, rol y contraseña de una cuenta existente, y audita antes/después', async () => {
    const primero = await crearOActualizarCuenta(ex, {
      email: 'tecnico@curichi.local',
      nombre: 'Técnico viejo',
      rol: 'tecnico',
      password: PASSWORD_VALIDA,
    });
    const [filaVieja] = await ex.consultar<{ password_hash: string }>(
      'SELECT password_hash FROM usuario WHERE id = $1',
      [primero.id],
    );
    const hashViejo = filaVieja!.password_hash;

    const actualizado = await crearOActualizarCuenta(ex, {
      email: 'tecnico@curichi.local',
      nombre: 'Ahora admin',
      rol: 'admin',
      password: 'otra-contraseña-larga-distinta',
      actualizar: true,
    });
    expect(actualizado).toMatchObject({
      id: primero.id,
      nombre: 'Ahora admin',
      rol: 'admin',
      accion: 'actualizada',
    });

    const [fila] = await ex.consultar<{
      email: string;
      nombre: string;
      rol: string;
      password_hash: string;
    }>('SELECT email, nombre, rol, password_hash FROM usuario WHERE id = $1', [primero.id]);
    // El email NO cambia: --actualizar solo toca rol, nombre y contraseña.
    expect(fila).toMatchObject({
      email: 'tecnico@curichi.local',
      nombre: 'Ahora admin',
      rol: 'admin',
    });
    expect(fila!.password_hash).not.toBe(hashViejo);

    const [conteo] = await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM usuario');
    expect(conteo!.n).toBe('1'); // actualizar, no duplicar

    const [auditoria] = await ex.consultar<{
      accion: string;
      actor_id: string | null;
      antes: { nombre: string; rol: string };
      despues: { nombre: string; rol: string };
    }>(
      "SELECT accion, actor_id, antes, despues FROM auditoria WHERE entidad_id = $1 AND accion = 'actualizar_cuenta'",
      [primero.id],
    );
    expect(auditoria).toMatchObject({ accion: 'actualizar_cuenta', actor_id: null });
    expect(auditoria!.antes).toMatchObject({ nombre: 'Técnico viejo', rol: 'tecnico' });
    expect(auditoria!.despues).toMatchObject({ nombre: 'Ahora admin', rol: 'admin' });
  });
});

describe('desactivarCuenta', () => {
  async function abrirSesion(usuarioId: string, id: string) {
    await ex.consultar(
      `INSERT INTO sesion (id, usuario_id, expira_en) VALUES ($1, $2, now() + interval '1 day')`,
      [id, usuarioId],
    );
  }

  it('pone activo = false, cierra todas sus sesiones y audita antes/después con actor nulo', async () => {
    const cuenta = await crearOActualizarCuenta(ex, {
      email: 'tecnico@curichi.local',
      nombre: 'Técnico',
      rol: 'tecnico',
      password: PASSWORD_VALIDA,
    });
    await abrirSesion(cuenta.id, 'sesion-1');
    await abrirSesion(cuenta.id, 'sesion-2');

    const r = await desactivarCuenta(ex, 'TECNICO@curichi.local');
    expect(r).toMatchObject({ id: cuenta.id, email: 'tecnico@curichi.local', sesionesCerradas: 2 });

    const [fila] = await ex.consultar<{ activo: boolean }>(
      'SELECT activo FROM usuario WHERE id = $1',
      [cuenta.id],
    );
    expect(fila).toEqual({ activo: false });

    const [conteo] = await ex.consultar<{ n: string }>(
      'SELECT count(*)::text AS n FROM sesion WHERE usuario_id = $1',
      [cuenta.id],
    );
    expect(conteo!.n).toBe('0');

    const [auditoria] = await ex.consultar<{
      accion: string;
      actor_id: string | null;
      antes: { activo: boolean };
      despues: { activo: boolean };
    }>(
      "SELECT accion, actor_id, antes, despues FROM auditoria WHERE entidad_id = $1 AND accion = 'desactivar_cuenta'",
      [cuenta.id],
    );
    expect(auditoria).toMatchObject({ accion: 'desactivar_cuenta', actor_id: null });
    expect(auditoria!.antes).toEqual({ activo: true });
    expect(auditoria!.despues).toEqual({ activo: false });
  });

  it('es idempotente: una segunda desactivación no falla y cierra 0 sesiones', async () => {
    await crearOActualizarCuenta(ex, {
      email: 'admin@curichi.local',
      nombre: 'Admin',
      rol: 'admin',
      password: PASSWORD_VALIDA,
    });
    await desactivarCuenta(ex, 'admin@curichi.local');
    const segunda = await desactivarCuenta(ex, 'admin@curichi.local');
    expect(segunda.sesionesCerradas).toBe(0);
  });

  it('rechaza un email que no existe', async () => {
    await expect(desactivarCuenta(ex, 'nadie@curichi.local')).rejects.toThrow(/no existe/);
  });
});

describe('reactivarCuenta', () => {
  it('pone activo = true, no toca nombre/rol/contraseña, y audita antes/después con actor nulo', async () => {
    const cuenta = await crearOActualizarCuenta(ex, {
      email: 'tecnico@curichi.local',
      nombre: 'Técnico',
      rol: 'tecnico',
      password: PASSWORD_VALIDA,
    });
    const [antes] = await ex.consultar<{ nombre: string; rol: string; password_hash: string }>(
      'SELECT nombre, rol, password_hash FROM usuario WHERE id = $1',
      [cuenta.id],
    );
    await desactivarCuenta(ex, 'tecnico@curichi.local');

    const r = await reactivarCuenta(ex, 'TECNICO@curichi.local');
    expect(r).toEqual({ id: cuenta.id, email: 'tecnico@curichi.local' });

    const [despues] = await ex.consultar<{
      activo: boolean;
      nombre: string;
      rol: string;
      password_hash: string;
    }>('SELECT activo, nombre, rol, password_hash FROM usuario WHERE id = $1', [cuenta.id]);
    expect(despues).toEqual({
      activo: true,
      nombre: antes!.nombre,
      rol: antes!.rol,
      password_hash: antes!.password_hash,
    });

    const [auditoria] = await ex.consultar<{
      accion: string;
      actor_id: string | null;
      antes: { activo: boolean };
      despues: { activo: boolean };
    }>(
      "SELECT accion, actor_id, antes, despues FROM auditoria WHERE entidad_id = $1 AND accion = 'reactivar_cuenta'",
      [cuenta.id],
    );
    expect(auditoria).toMatchObject({ accion: 'reactivar_cuenta', actor_id: null });
    expect(auditoria!.antes).toEqual({ activo: false });
    expect(auditoria!.despues).toEqual({ activo: true });
  });

  it('rechaza reactivar un email que no existe', async () => {
    await expect(reactivarCuenta(ex, 'nadie@curichi.local')).rejects.toThrow(/no existe/);
  });

  it('rechaza reactivar una cuenta que ya está activa, y no escribe auditoria', async () => {
    const cuenta = await crearOActualizarCuenta(ex, {
      email: 'admin@curichi.local',
      nombre: 'Admin',
      rol: 'admin',
      password: PASSWORD_VALIDA,
    });
    await expect(reactivarCuenta(ex, 'admin@curichi.local')).rejects.toThrow(/ya está activa/);

    const [fila] = await ex.consultar<{ activo: boolean }>(
      'SELECT activo FROM usuario WHERE id = $1',
      [cuenta.id],
    );
    expect(fila).toEqual({ activo: true });
    const [conteo] = await ex.consultar<{ n: string }>(
      "SELECT count(*)::text AS n FROM auditoria WHERE entidad_id = $1 AND accion = 'reactivar_cuenta'",
      [cuenta.id],
    );
    expect(conteo!.n).toBe('0');
  });
});
