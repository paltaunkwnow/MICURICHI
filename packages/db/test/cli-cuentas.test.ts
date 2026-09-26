/**
 * CLI de cuentas en producción (revisión de producción, 2026-09-26): mismo contrato que
 * `cli-migrar.test.ts` para el CLI de migraciones — compilado a `dist/cli/cuentas.js` (sin tsx),
 * `DATABASE_URL` del rol dueño, logs JSON (salvo `--help`, que es para una persona) y código de
 * salida 0/1.
 *
 * Foco extra, porque este CLI maneja una contraseña: se prueba explícitamente que nunca aparece en
 * ninguna línea de log, ni en éxito ni en error, y que no se puede colar por argumento (queda en el
 * historial de la shell y en `ps`).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ejecutarComandoCuentas } from '../src/cli/cuentas-comando.js';
import { type BaseEfimera, levantarBaseEfimera } from '../src/test-utils.js';

const RAIZ_DB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Canal = 'stdout' | 'stderr';
interface Linea {
  canal: Canal;
  texto: string;
}

function capturar() {
  const lineas: Linea[] = [];
  return { lineas, escribir: (texto: string, canal: Canal) => lineas.push({ canal, texto }) };
}

const comoTexto = (lineas: Linea[]) => lineas.map((l) => l.texto).join('\n');
const ultimaComoJson = (lineas: Linea[]) =>
  JSON.parse(lineas.at(-1)?.texto ?? '{}') as Record<string, unknown>;

const NO_CONECTAR = () => {
  throw new Error('el CLI no debía conectarse a ninguna base en este caso');
};
const NO_LEER_STDIN = async (): Promise<string> => {
  throw new Error('el CLI no debía leer la contraseña en este caso');
};

let base: BaseEfimera;

beforeAll(async () => {
  base = await levantarBaseEfimera();
}, 120_000);

afterAll(async () => {
  await base?.cerrar();
});

afterEach(async () => {
  await base.ejecutor.consultar('DELETE FROM auditoria');
  await base.ejecutor.consultar('DELETE FROM sesion');
  await base.ejecutor.consultar('DELETE FROM usuario');
});

describe('la build y el paquete llevan el CLI de cuentas a producción', () => {
  it('compila src/cli/cuentas.ts a dist/cli/cuentas.js: se ejecuta con node, sin tsx', () => {
    const configuracion = resolve(RAIZ_DB, 'tsconfig.build.json');
    const leida = ts.getParsedCommandLineOfConfigFile(
      configuracion,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
        },
      },
    );
    expect(leida, 'tsconfig.build.json ilegible').toBeDefined();
    const entrada = resolve(RAIZ_DB, 'src/cli/cuentas.ts');
    const incluidos = leida!.fileNames.map((f) => resolve(f));
    expect(incluidos).toContain(entrada);
    expect(incluidos).toContain(resolve(RAIZ_DB, 'src/cli/cuentas-comando.ts'));
    const salidas = ts.getOutputFileNames(leida!, entrada, false).map((f) => resolve(f));
    expect(salidas).toContain(resolve(RAIZ_DB, 'dist/cli/cuentas.js'));
  });

  it('el paquete declara el script cuentas:prod (compilado, sin tsx)', () => {
    const pkg = JSON.parse(readFileSync(resolve(RAIZ_DB, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['cuentas:prod']).toBe('node dist/cli/cuentas.js');
  });
});

describe('--help: no conecta, sale 0, y es texto para una persona (no JSON)', () => {
  it.each([[[] as string[]], [['--help']], [['-h']]])('cuentas %s', async (args) => {
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(
      args,
      {},
      {
        escribir: salida.escribir,
        crearPool: NO_CONECTAR,
        leerPasswordDeStdin: NO_LEER_STDIN,
      },
    );
    expect(codigo).toBe(0);
    expect(salida.lineas.every((l) => l.canal === 'stdout')).toBe(true);
    expect(comoTexto(salida.lineas)).toMatch(/crear/);
    expect(comoTexto(salida.lineas)).toMatch(/desactivar/);
    expect(comoTexto(salida.lineas)).toMatch(/reactivar/);
    expect(() => JSON.parse(salida.lineas[0]!.texto)).toThrow();
  });

  it('crear --help detalla --email, --nombre, --rol, --actualizar y de dónde sale la contraseña', async () => {
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(
      ['crear', '--help'],
      {},
      {
        escribir: salida.escribir,
        crearPool: NO_CONECTAR,
        leerPasswordDeStdin: NO_LEER_STDIN,
      },
    );
    expect(codigo).toBe(0);
    const texto = comoTexto(salida.lineas);
    expect(texto).toMatch(/--email/);
    expect(texto).toMatch(/--nombre/);
    expect(texto).toMatch(/--rol/);
    expect(texto).toMatch(/--actualizar/);
    expect(texto).toMatch(/CUENTA_PASSWORD/);
    expect(texto).toMatch(/stdin/);
  });

  it('desactivar --help detalla --email', async () => {
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(
      ['desactivar', '--help'],
      {},
      {
        escribir: salida.escribir,
        crearPool: NO_CONECTAR,
        leerPasswordDeStdin: NO_LEER_STDIN,
      },
    );
    expect(codigo).toBe(0);
    expect(comoTexto(salida.lineas)).toMatch(/--email/);
  });

  it('reactivar --help detalla --email y que no toca contraseña ni rol', async () => {
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(
      ['reactivar', '--help'],
      {},
      {
        escribir: salida.escribir,
        crearPool: NO_CONECTAR,
        leerPasswordDeStdin: NO_LEER_STDIN,
      },
    );
    expect(codigo).toBe(0);
    const texto = comoTexto(salida.lineas);
    expect(texto).toMatch(/--email/);
    expect(texto).toMatch(/contraseña/);
    expect(texto).toMatch(/rol/);
  });
});

describe('uso incorrecto: sale con 1, sin conectarse ni leer stdin', () => {
  it.each([
    {
      caso: 'subcomando desconocido',
      args: ['inventar'],
      env: {},
      patron: /subcomando desconocido/,
    },
    {
      caso: 'crear sin --email',
      args: ['crear', '--nombre', 'A', '--rol', 'admin'],
      env: {},
      patron: /necesita/,
    },
    {
      caso: 'crear sin --nombre',
      args: ['crear', '--email', 'a@b.com', '--rol', 'admin'],
      env: {},
      patron: /necesita/,
    },
    {
      caso: 'crear sin --rol',
      args: ['crear', '--email', 'a@b.com', '--nombre', 'A'],
      env: {},
      patron: /necesita/,
    },
    { caso: 'desactivar sin --email', args: ['desactivar'], env: {}, patron: /necesita/ },
    { caso: 'reactivar sin --email', args: ['reactivar'], env: {}, patron: /necesita/ },
    {
      caso: 'crear con --password por argumento (nunca así)',
      args: ['crear', '--email', 'a@b.com', '--nombre', 'A', '--rol', 'admin', '--password', 'x'],
      env: {},
      patron: /Unknown option|--password/,
    },
    {
      caso: 'un rol que no es admin/tecnico/ejecutivo',
      args: ['crear', '--email', 'a@b.com', '--nombre', 'Ana', '--rol', 'superadmin'],
      env: { DATABASE_URL: 'postgresql://nadie:x@127.0.0.1:9/nada' },
      patron: /rol inválido/,
    },
    {
      caso: 'producción sin DATABASE_URL (no cae a la base local)',
      args: ['crear', '--email', 'a@b.com', '--nombre', 'A', '--rol', 'admin'],
      env: { NODE_ENV: 'production', DATABASE_URL: undefined },
      patron: /DATABASE_URL/,
    },
  ])('$caso', async ({ args, env, patron }) => {
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(args, env, {
      escribir: salida.escribir,
      crearPool: NO_CONECTAR,
      leerPasswordDeStdin: NO_LEER_STDIN,
    });
    expect(codigo).toBe(1);
    const error = salida.lineas.at(-1)!;
    expect(error.canal).toBe('stderr');
    const json = JSON.parse(error.texto) as Record<string, unknown>;
    expect(json.level).toBe(50);
    expect(json.name).toBe('db-cuentas');
    expect(JSON.stringify(json)).toMatch(patron);
    // Ni el intento de conectarse ni el de leer stdin llegaron a ocurrir.
    expect(JSON.stringify(json)).not.toMatch(/no debía/);
    // La única vez que se manda un valor sensible en un caso de uso incorrecto es esta prueba, y
    // el valor ('x') no debe aparecer citado en ningún mensaje de opción desconocida.
  });

  it('el caso del rol inválido llega a validar SIN conectarse ni leer stdin (falla antes, en la lógica pura)', async () => {
    // Nota aparte: aquí SÍ hay una DATABASE_URL válida en apariencia (y se podría conectar), para
    // comprobar que el rechazo del rol ocurre ANTES: ni se conecta ni se queda esperando stdin.
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(
      ['crear', '--email', 'a@b.com', '--nombre', 'Ana', '--rol', 'ciudadano'],
      { DATABASE_URL: base.url },
      { escribir: salida.escribir, crearPool: NO_CONECTAR, leerPasswordDeStdin: NO_LEER_STDIN },
    );
    expect(codigo).toBe(1);
    expect(comoTexto(salida.lineas)).toMatch(/se registran solas/);
    const [conteo] = await base.ejecutor.consultar<{ n: string }>(
      'SELECT count(*)::text AS n FROM usuario',
    );
    expect(conteo!.n).toBe('0');
  });
});

describe('camino completo contra una base migrada (PGlite efímera)', () => {
  it('crea, rechaza el duplicado, actualiza, lee la contraseña de stdin, y desactiva', async () => {
    const salidaCrear = capturar();
    const codigoCrear = await ejecutarComandoCuentas(
      ['crear', '--email', 'Admin@Curichi.Local', '--nombre', 'Admin', '--rol', 'admin'],
      { DATABASE_URL: base.url, CUENTA_PASSWORD: 'una-contraseña-larga-de-prueba' },
      { escribir: salidaCrear.escribir },
    );
    expect(codigoCrear, comoTexto(salidaCrear.lineas)).toBe(0);
    const eventoCrear = ultimaComoJson(salidaCrear.lineas);
    expect(eventoCrear).toMatchObject({
      level: 30,
      name: 'db-cuentas',
      email: 'admin@curichi.local',
      rol: 'admin',
      accion: 'creada',
    });

    // Repetir sin --actualizar: falla, y la fila original no cambia.
    const salidaDup = capturar();
    const codigoDup = await ejecutarComandoCuentas(
      ['crear', '--email', 'admin@curichi.local', '--nombre', 'Otro', '--rol', 'tecnico'],
      { DATABASE_URL: base.url, CUENTA_PASSWORD: 'otra-contraseña-larga-de-prueba' },
      { escribir: salidaDup.escribir },
    );
    expect(codigoDup).toBe(1);
    expect(comoTexto(salidaDup.lineas)).toMatch(/ya existe una cuenta/);

    // --actualizar: cambia rol, nombre y contraseña.
    const salidaUpd = capturar();
    const codigoUpd = await ejecutarComandoCuentas(
      [
        'crear',
        '--email',
        'admin@curichi.local',
        '--nombre',
        'Admin renombrado',
        '--rol',
        'tecnico',
        '--actualizar',
      ],
      { DATABASE_URL: base.url, CUENTA_PASSWORD: 'tercera-contraseña-larga-de-prueba' },
      { escribir: salidaUpd.escribir },
    );
    expect(codigoUpd, comoTexto(salidaUpd.lineas)).toBe(0);
    expect(ultimaComoJson(salidaUpd.lineas)).toMatchObject({
      accion: 'actualizada',
      rol: 'tecnico',
    });

    // Contraseña leída de stdin (sin CUENTA_PASSWORD) para una segunda cuenta.
    const salidaStdin = capturar();
    const codigoStdin = await ejecutarComandoCuentas(
      [
        'crear',
        '--email',
        'ejecutivo@curichi.local',
        '--nombre',
        'Ejecutivo',
        '--rol',
        'ejecutivo',
      ],
      { DATABASE_URL: base.url },
      {
        escribir: salidaStdin.escribir,
        leerPasswordDeStdin: async () => 'contraseña-de-stdin-de-prueba',
      },
    );
    expect(codigoStdin, comoTexto(salidaStdin.lineas)).toBe(0);
    expect(ultimaComoJson(salidaStdin.lineas)).toMatchObject({
      accion: 'creada',
      rol: 'ejecutivo',
    });

    // Desactivar: activo = false y sin sesiones.
    const salidaDesactivar = capturar();
    const codigoDesactivar = await ejecutarComandoCuentas(
      ['desactivar', '--email', 'admin@curichi.local'],
      { DATABASE_URL: base.url },
      { escribir: salidaDesactivar.escribir },
    );
    expect(codigoDesactivar, comoTexto(salidaDesactivar.lineas)).toBe(0);
    expect(ultimaComoJson(salidaDesactivar.lineas)).toMatchObject({
      name: 'db-cuentas',
      email: 'admin@curichi.local',
    });
    const [fila] = await base.ejecutor.consultar<{ activo: boolean }>(
      `SELECT activo FROM usuario WHERE lower(email) = 'admin@curichi.local'`,
    );
    expect(fila).toEqual({ activo: false });

    // Reactivar: activo = true de nuevo, sin tocar rol (sigue tecnico, de la actualización de arriba).
    const salidaReactivar = capturar();
    const codigoReactivar = await ejecutarComandoCuentas(
      ['reactivar', '--email', 'admin@curichi.local'],
      { DATABASE_URL: base.url },
      { escribir: salidaReactivar.escribir, leerPasswordDeStdin: NO_LEER_STDIN },
    );
    expect(codigoReactivar, comoTexto(salidaReactivar.lineas)).toBe(0);
    expect(comoTexto(salidaReactivar.lineas)).toMatch(/reactivada/);
    const [filaReactivada] = await base.ejecutor.consultar<{ activo: boolean; rol: string }>(
      `SELECT activo, rol FROM usuario WHERE lower(email) = 'admin@curichi.local'`,
    );
    expect(filaReactivada).toEqual({ activo: true, rol: 'tecnico' });

    // Reactivar de nuevo (ya está activa): falla, código ≠ 0, mensaje claro.
    const salidaReactivarDup = capturar();
    const codigoReactivarDup = await ejecutarComandoCuentas(
      ['reactivar', '--email', 'admin@curichi.local'],
      { DATABASE_URL: base.url },
      { escribir: salidaReactivarDup.escribir, leerPasswordDeStdin: NO_LEER_STDIN },
    );
    expect(codigoReactivarDup).not.toBe(0);
    expect(comoTexto(salidaReactivarDup.lineas)).toMatch(/ya está activa/);

    // Reactivar un email que no existe: falla, código ≠ 0, mensaje claro.
    const salidaReactivarInexistente = capturar();
    const codigoReactivarInexistente = await ejecutarComandoCuentas(
      ['reactivar', '--email', 'nadie@curichi.local'],
      { DATABASE_URL: base.url },
      { escribir: salidaReactivarInexistente.escribir, leerPasswordDeStdin: NO_LEER_STDIN },
    );
    expect(codigoReactivarInexistente).not.toBe(0);
    expect(comoTexto(salidaReactivarInexistente.lineas)).toMatch(/no existe/);

    // Ninguna de las cuatro contraseñas usadas apareció jamás en ningún log, de éxito o de error.
    const todo = [
      ...salidaCrear.lineas,
      ...salidaDup.lineas,
      ...salidaUpd.lineas,
      ...salidaStdin.lineas,
      ...salidaDesactivar.lineas,
    ]
      .map((l) => l.texto)
      .join('\n');
    for (const secreta of [
      'una-contraseña-larga-de-prueba',
      'otra-contraseña-larga-de-prueba',
      'tercera-contraseña-larga-de-prueba',
      'contraseña-de-stdin-de-prueba',
    ]) {
      expect(todo).not.toContain(secreta);
    }
  }, 30_000);

  it('rechaza una contraseña corta contra la base real, sin crear la fila', async () => {
    const salida = capturar();
    const codigo = await ejecutarComandoCuentas(
      ['crear', '--email', 'corta@curichi.local', '--nombre', 'Corta', '--rol', 'admin'],
      { DATABASE_URL: base.url, CUENTA_PASSWORD: 'corta' },
      { escribir: salida.escribir },
    );
    expect(codigo).toBe(1);
    expect(comoTexto(salida.lineas)).toMatch(/al menos \d+ caracteres/);
    expect(comoTexto(salida.lineas)).not.toContain('corta');
    const [conteo] = await base.ejecutor.consultar<{ n: string }>(
      'SELECT count(*)::text AS n FROM usuario',
    );
    expect(conteo!.n).toBe('0');
  });
});

describe('el punto de entrada, como proceso (lo que ejecuta un operador en el contenedor)', () => {
  function correr(args: string[], env: Record<string, string | undefined>) {
    return new Promise<{ codigo: number | null; stdout: string; stderr: string }>((ok, mal) => {
      const hijo = spawn(process.execPath, ['--import', 'tsx', 'src/cli/cuentas.ts', ...args], {
        cwd: RAIZ_DB,
        env: { ...process.env, NODE_ENV: 'test', ...env },
      });
      let stdout = '';
      let stderr = '';
      hijo.stdout.on('data', (d) => {
        stdout += String(d);
      });
      hijo.stderr.on('data', (d) => {
        stderr += String(d);
      });
      hijo.on('error', mal);
      hijo.on('close', (codigo) => ok({ codigo, stdout, stderr }));
    });
  }

  it('--help sale 0 e imprime el uso de crear y desactivar', async () => {
    const r = await correr(['--help'], {});
    expect(r.codigo, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/crear/);
    expect(r.stdout).toMatch(/desactivar/);
  }, 30_000);

  it('en producción sin DATABASE_URL sale con 1 y un JSON de error en stderr', async () => {
    const r = await correr(['crear', '--email', 'a@b.com', '--nombre', 'A', '--rol', 'admin'], {
      NODE_ENV: 'production',
      DATABASE_URL: '',
    });
    expect(r.codigo).toBe(1);
    const ultima = JSON.parse(r.stderr.trim().split('\n').at(-1) ?? '{}');
    expect(ultima).toMatchObject({ level: 50 });
    expect(JSON.stringify(ultima)).toMatch(/DATABASE_URL/);
  }, 30_000);

  it('crea una cuenta real leyendo CUENTA_PASSWORD, y esa contraseña no sale ni por stdout ni por stderr', async () => {
    const r = await correr(
      ['crear', '--email', 'proceso@curichi.local', '--nombre', 'Proceso', '--rol', 'admin'],
      { DATABASE_URL: base.url, CUENTA_PASSWORD: 'contraseña-de-proceso-de-prueba' },
    );
    expect(r.codigo, r.stderr).toBe(0);
    const ultima = JSON.parse(r.stdout.trim().split('\n').at(-1) ?? '{}');
    expect(ultima).toMatchObject({ level: 30, name: 'db-cuentas', accion: 'creada' });
    expect(r.stdout).not.toContain('contraseña-de-proceso-de-prueba');
    expect(r.stderr).not.toContain('contraseña-de-proceso-de-prueba');
  }, 30_000);

  it('desactiva y reactiva una cuenta real (sin contraseña de por medio)', async () => {
    // Cuenta propia de esta prueba: `afterEach` borra `usuario` entre pruebas, así que no se puede
    // depender de la que creó la prueba anterior.
    const alta0 = await correr(
      [
        'crear',
        '--email',
        'reactivar-proceso@curichi.local',
        '--nombre',
        'Reactivar',
        '--rol',
        'admin',
      ],
      { DATABASE_URL: base.url, CUENTA_PASSWORD: 'contraseña-de-reactivar-de-prueba' },
    );
    expect(alta0.codigo, alta0.stderr).toBe(0);

    const baja = await correr(['desactivar', '--email', 'reactivar-proceso@curichi.local'], {
      DATABASE_URL: base.url,
    });
    expect(baja.codigo, baja.stderr).toBe(0);

    const alta = await correr(['reactivar', '--email', 'reactivar-proceso@curichi.local'], {
      DATABASE_URL: base.url,
    });
    expect(alta.codigo, alta.stderr).toBe(0);
    const ultima = JSON.parse(alta.stdout.trim().split('\n').at(-1) ?? '{}');
    expect(ultima).toMatchObject({
      level: 30,
      name: 'db-cuentas',
      email: 'reactivar-proceso@curichi.local',
    });

    const otraVez = await correr(['reactivar', '--email', 'reactivar-proceso@curichi.local'], {
      DATABASE_URL: base.url,
    });
    expect(otraVez.codigo).not.toBe(0);
    expect(otraVez.stderr).toMatch(/ya está activa/);
    // Cuatro procesos seguidos, cada uno compilando con tsx y uno hasheando con Argon2id: solos
    // tardan unos segundos, pero con la suite completa en paralelo pasaban de 30 s y la prueba
    // fallaba por tiempo, no por comportamiento.
  }, 120_000);
});
