/**
 * Lógica del CLI de cuentas, separada del punto de entrada (`cuentas.ts`) para poder probarla sin
 * abrir un proceso: devuelve el código de salida en vez de llamar a `process.exit` (mismo patrón
 * que `migrar-comando.ts`).
 *
 * Escribe UNA línea JSON por evento con la forma de pino (`level`, `time`, `pid`, `hostname`,
 * `name`, `msg`), igual que el CLI de migraciones y que los logs de api-core y geo-service. La
 * ayuda (`--help`) es la excepción a propósito: es para que la lea una persona en la terminal, no
 * un colector de logs.
 */
import { hostname } from 'node:os';
import { parseArgs } from 'node:util';
import type pg from 'pg';
import { crearPool, DATABASE_URL_LOCAL, esperarBaseDeDatos } from '../cliente.js';
import {
  crearOActualizarCuenta,
  desactivarCuenta,
  normalizarEmail,
  normalizarNombre,
  normalizarRol,
  reactivarCuenta,
  validarPassword,
} from '../cuentas.js';
import { ejecutorPg } from '../ejecutor.js';

type Canal = 'stdout' | 'stderr';

export interface DependenciasComandoCuentas {
  /** Recibe cada línea ya formada (JSON para eventos, texto plano para --help). */
  escribir?: (linea: string, canal: Canal) => void;
  /** Fábrica del pool. Las pruebas la sustituyen para comprobar que un error de uso no conecta. */
  crearPool?: (url: string) => pg.Pool;
  /**
   * De dónde sale la contraseña cuando no está en CUENTA_PASSWORD. Por defecto, stdin. Las pruebas
   * la sustituyen para no depender de un pipe real.
   */
  leerPasswordDeStdin?: () => Promise<string>;
}

const NIVEL = { info: 30, error: 50 } as const;

function escribirPorDefecto(linea: string, canal: Canal) {
  (canal === 'stdout' ? process.stdout : process.stderr).write(`${linea}\n`);
}

async function leerPasswordDeStdinPorDefecto(): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of process.stdin as AsyncIterable<Buffer>) trozos.push(Buffer.from(trozo));
  return Buffer.concat(trozos)
    .toString('utf8')
    .replace(/\r?\n+$/, '');
}

const AYUDA_GENERAL = [
  'Uso: cuentas <crear|desactivar|reactivar> [opciones]',
  '',
  'Alta y baja de cuentas técnicas, ejecutivas y de administrador (packages/db, Parte 4).',
  'Las cuentas ciudadanas se registran solas (POST /api/v1/auth/registro); este CLI no las crea.',
  '',
  'Subcomandos:',
  '  crear        Crea una cuenta, o la actualiza si ya existe y se pasa --actualizar.',
  '  desactivar   Pone activo = false y cierra (borra) todas sus sesiones.',
  '  reactivar    Pone activo = true. No toca contraseña ni rol (no es --actualizar).',
  '',
  'Usá «cuentas <subcomando> --help» para ver sus opciones. Requiere DATABASE_URL del rol DUEÑO',
  'de la base: el rol de aplicación (curichi_api) no tiene permiso para escribir usuario.rol',
  '(migración 0009, a propósito).',
];

const AYUDA_CREAR = [
  'Uso: cuentas crear --email <correo> --nombre <nombre> --rol <admin|tecnico|ejecutivo> [--actualizar]',
  '',
  'Crea una cuenta nueva. Si el email ya existe, falla salvo que se pase --actualizar, en cuyo',
  'caso cambia nombre, rol y contraseña (no cambia el email ni el estado activo/inactivo: para',
  'reactivar una cuenta desactivada usá «cuentas reactivar», nunca esto).',
  '',
  'La contraseña NUNCA se pasa por argumento: quedaría en el historial de la shell y visible con',
  '`ps`. Se lee, en este orden:',
  '  1. de la variable de entorno CUENTA_PASSWORD, o',
  '  2. de la entrada estándar (stdin), por ejemplo:',
  "       echo 'una-contraseña-larga' | node dist/cli/cuentas.js crear --email a@b.org --nombre 'A' --rol admin",
  '',
  'Opciones:',
  '  --email <correo>   Obligatorio.',
  '  --nombre <nombre>  Obligatorio.',
  '  --rol <rol>        Obligatorio: admin, tecnico o ejecutivo (ciudadano no: se registra solo).',
  '  --actualizar       Si el email ya existe, actualizarlo en vez de fallar.',
  '  --help             Muestra esta ayuda.',
];

const AYUDA_DESACTIVAR = [
  'Uso: cuentas desactivar --email <correo>',
  '',
  'Pone activo = false y cierra (borra) todas las sesiones abiertas de esa cuenta.',
  '',
  'Opciones:',
  '  --email <correo>   Obligatorio.',
  '  --help             Muestra esta ayuda.',
];

const AYUDA_REACTIVAR = [
  'Uso: cuentas reactivar --email <correo>',
  '',
  'Pone activo = true. No toca la contraseña ni el rol: no es un atajo de --actualizar, es una',
  'acción aparte y deliberada.',
  '',
  'Falla (código distinto de 0) si la cuenta no existe, o si ya está activa: a diferencia de',
  '«desactivar», reactivar NO es idempotente a propósito, porque hacerlo sobre una cuenta que ya',
  'estaba activa suele significar que el email es el equivocado.',
  '',
  'Opciones:',
  '  --email <correo>   Obligatorio.',
  '  --help             Muestra esta ayuda.',
];

/** SQLSTATE de un error propio o de su causa (el runner envuelve el de PostgreSQL). */
function codigoDe(e: unknown): string | undefined {
  const propio = (e as { code?: unknown })?.code;
  if (typeof propio === 'string') return propio;
  const causa = (e as { cause?: { code?: unknown } })?.cause?.code;
  return typeof causa === 'string' ? causa : undefined;
}

/** DATABASE_URL: obligatoria en producción (sin base «por defecto» a la que caer); local si no. */
function resolverUrl(entorno: NodeJS.ProcessEnv): string {
  const deEntorno = entorno.DATABASE_URL?.trim();
  if (!deEntorno && entorno.NODE_ENV === 'production')
    throw new Error('DATABASE_URL es obligatoria con NODE_ENV=production.');
  return deEntorno || DATABASE_URL_LOCAL;
}

/**
 * `node dist/cli/cuentas.js crear|desactivar ...`. Devuelve 0 si la operación se completó y 1 ante
 * cualquier fallo, incluido un uso incorrecto (que nunca llega a conectarse ni a leer stdin).
 */
export async function ejecutarComandoCuentas(
  argumentos: readonly string[],
  entorno: NodeJS.ProcessEnv,
  dependencias: DependenciasComandoCuentas = {},
): Promise<number> {
  const escribir = dependencias.escribir ?? escribirPorDefecto;
  const nuevoPool = dependencias.crearPool ?? ((url: string) => crearPool(url, { max: 1 }));
  const leerPasswordDeStdin = dependencias.leerPasswordDeStdin ?? leerPasswordDeStdinPorDefecto;
  const registrar = (nivel: keyof typeof NIVEL, msg: string, datos: Record<string, unknown> = {}) =>
    escribir(
      JSON.stringify({
        level: NIVEL[nivel],
        time: Date.now(),
        pid: process.pid,
        hostname: hostname(),
        name: 'db-cuentas',
        msg,
        ...datos,
      }),
      nivel === 'error' ? 'stderr' : 'stdout',
    );
  const fallar = (msg: string, e: unknown) => {
    const code = codigoDe(e);
    registrar('error', msg, {
      err: {
        type: (e as Error)?.name ?? 'Error',
        message: (e as Error)?.message ?? String(e),
        ...(code ? { code } : {}),
      },
    });
    return 1;
  };
  const mostrarAyuda = (lineas: readonly string[]) => {
    for (const linea of lineas) escribir(linea, 'stdout');
  };

  const [subcomando, ...resto] = argumentos;

  if (subcomando === undefined || subcomando === '--help' || subcomando === '-h') {
    mostrarAyuda(AYUDA_GENERAL);
    return 0;
  }
  if (subcomando !== 'crear' && subcomando !== 'desactivar' && subcomando !== 'reactivar')
    return fallar(
      'uso incorrecto del CLI de cuentas',
      new Error(
        `subcomando desconocido «${subcomando}»: usá «crear», «desactivar» o «reactivar» (--help).`,
      ),
    );

  if (subcomando === 'crear') {
    let email: string;
    let nombre: string;
    let rol: string;
    let actualizar: boolean;
    try {
      const { values } = parseArgs({
        args: [...resto],
        options: {
          email: { type: 'string' },
          nombre: { type: 'string' },
          rol: { type: 'string' },
          actualizar: { type: 'boolean', default: false },
          help: { type: 'boolean', default: false },
        },
        strict: true,
        allowPositionals: false,
      });
      if (values.help) {
        mostrarAyuda(AYUDA_CREAR);
        return 0;
      }
      if (!values.email || !values.nombre || !values.rol)
        throw new Error('crear necesita --email, --nombre y --rol (admin|tecnico|ejecutivo).');
      email = values.email;
      nombre = values.nombre;
      rol = values.rol;
      actualizar = Boolean(values.actualizar);
    } catch (e) {
      return fallar('uso incorrecto del CLI de cuentas', e);
    }

    let url: string;
    try {
      url = resolverUrl(entorno);
      // Forma de email/nombre/rol ANTES de tocar stdin: un --rol mal escrito no puede dejar el
      // CLI esperando una contraseña que nadie va a escribir (bloqueado sin ninguna pista).
      normalizarEmail(email);
      normalizarNombre(nombre);
      normalizarRol(rol);
    } catch (e) {
      return fallar('uso incorrecto del CLI de cuentas', e);
    }

    let password: string;
    try {
      const deVariable = entorno.CUENTA_PASSWORD;
      password =
        deVariable !== undefined && deVariable !== '' ? deVariable : await leerPasswordDeStdin();
      if (!password)
        throw new Error(
          'falta la contraseña: pasala en CUENTA_PASSWORD o por stdin (nunca por argumento).',
        );
    } catch (e) {
      return fallar('no se pudo leer la contraseña', e);
    }

    try {
      validarPassword(password);
    } catch (e) {
      return fallar('uso incorrecto del CLI de cuentas', e);
    }

    let pool: pg.Pool | null = null;
    try {
      pool = nuevoPool(url);
      await esperarBaseDeDatos(pool, 10, 500);
      const r = await crearOActualizarCuenta(ejecutorPg(pool), {
        email,
        nombre,
        rol,
        password,
        actualizar,
      });
      registrar('info', `cuenta ${r.accion}: ${r.email} (${r.rol})`, {
        id: r.id,
        email: r.email,
        rol: r.rol,
        accion: r.accion,
      });
      return 0;
    } catch (e) {
      return fallar('no se pudo crear ni actualizar la cuenta', e);
    } finally {
      await pool?.end().catch(() => {});
    }
  }

  if (subcomando === 'desactivar') {
    let email: string;
    try {
      const { values } = parseArgs({
        args: [...resto],
        options: { email: { type: 'string' }, help: { type: 'boolean', default: false } },
        strict: true,
        allowPositionals: false,
      });
      if (values.help) {
        mostrarAyuda(AYUDA_DESACTIVAR);
        return 0;
      }
      if (!values.email) throw new Error('desactivar necesita --email.');
      email = values.email;
    } catch (e) {
      return fallar('uso incorrecto del CLI de cuentas', e);
    }

    let url: string;
    try {
      url = resolverUrl(entorno);
    } catch (e) {
      return fallar('uso incorrecto del CLI de cuentas', e);
    }

    let pool: pg.Pool | null = null;
    try {
      pool = nuevoPool(url);
      await esperarBaseDeDatos(pool, 10, 500);
      const r = await desactivarCuenta(ejecutorPg(pool), email);
      registrar('info', `cuenta desactivada: ${r.email}`, {
        id: r.id,
        email: r.email,
        sesionesCerradas: r.sesionesCerradas,
      });
      return 0;
    } catch (e) {
      return fallar('no se pudo desactivar la cuenta', e);
    } finally {
      await pool?.end().catch(() => {});
    }
  }

  // subcomando === 'reactivar'
  let email: string;
  try {
    const { values } = parseArgs({
      args: [...resto],
      options: { email: { type: 'string' }, help: { type: 'boolean', default: false } },
      strict: true,
      allowPositionals: false,
    });
    if (values.help) {
      mostrarAyuda(AYUDA_REACTIVAR);
      return 0;
    }
    if (!values.email) throw new Error('reactivar necesita --email.');
    email = values.email;
  } catch (e) {
    return fallar('uso incorrecto del CLI de cuentas', e);
  }

  let url: string;
  try {
    url = resolverUrl(entorno);
  } catch (e) {
    return fallar('uso incorrecto del CLI de cuentas', e);
  }

  let pool: pg.Pool | null = null;
  try {
    pool = nuevoPool(url);
    await esperarBaseDeDatos(pool, 10, 500);
    const r = await reactivarCuenta(ejecutorPg(pool), email);
    registrar('info', `cuenta reactivada: ${r.email}`, { id: r.id, email: r.email });
    return 0;
  } catch (e) {
    return fallar('no se pudo reactivar la cuenta', e);
  } finally {
    await pool?.end().catch(() => {});
  }
}
