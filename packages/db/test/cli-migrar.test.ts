/**
 * Migrar al desplegar (revisión de producción, 2026-09-26).
 *
 * El defecto: la imagen de producción no podía aplicar migraciones. `tsconfig.build.json` dejaba
 * fuera `src/cli/**`, así que no había CLI compilado, y el script `migrate` corre con `tsx`, que es
 * dependencia de desarrollo y `pnpm deploy --prod` no copia. La única forma de migrar una base de
 * producción era desde una máquina con el repositorio entero.
 *
 * Lo que se fija aquí:
 *  - la build compila el CLI a `dist/cli/migrar.js` y el paquete publica `dist` y `migraciones`;
 *  - el CLI lee `DATABASE_URL`, admite `--hasta NNNN`, escribe una línea JSON por evento (como
 *    pino en los servicios) y sale con código distinto de 0 si algo falla, que es lo único que
 *    mira un job de despliegue para decidir si arranca los servicios.
 *
 * Seguridad de la prueba: todo caso que debe fallar ANTES de conectarse recibe una fábrica de pool
 * que revienta si se la llama, así que un error en el CLI no puede terminar migrando la base de
 * desarrollo por la URL por defecto. Los casos que sí migran usan una PGlite efímera.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ejecutarComandoMigrar } from '../src/cli/migrar-comando.js';
import { listarMigraciones } from '../src/migrar.js';

const RAIZ_DB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface BaseVacia {
  url: string;
  cerrar(): Promise<void>;
}

/** PostGIS efímero SIN migraciones, accesible por protocolo PostgreSQL (lo que usa el CLI). */
async function levantarBaseVacia(): Promise<BaseVacia> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const db = await PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  const puerto = (server as unknown as { port?: number }).port ?? 0;
  return {
    url: `postgresql://curichi:curichi@127.0.0.1:${puerto}/curichi`,
    async cerrar() {
      await server.stop();
      await db.close();
    },
  };
}

type Canal = 'stdout' | 'stderr';
interface Linea {
  canal: Canal;
  json: Record<string, unknown>;
}

/** Recoge lo que escribe el CLI. `JSON.parse` falla si alguna línea no es JSON: es parte de la prueba. */
function capturar() {
  const lineas: Linea[] = [];
  return {
    lineas,
    escribir: (linea: string, canal: Canal) => {
      lineas.push({ canal, json: JSON.parse(linea) as Record<string, unknown> });
    },
  };
}

const NO_CONECTAR = () => {
  throw new Error('el CLI no debía conectarse a ninguna base en este caso');
};

const hastaNumero = (f: string) => f.slice(0, 4);

let base: BaseVacia;

beforeAll(async () => {
  base = await levantarBaseVacia();
}, 120_000);

afterAll(async () => {
  await base?.cerrar();
});

describe('la build y el paquete llevan el CLI de migraciones a producción', () => {
  it('compila src/cli/migrar.ts a dist/cli/migrar.js: se ejecuta con node, sin tsx', () => {
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
    const entrada = resolve(RAIZ_DB, 'src/cli/migrar.ts');
    const incluidos = leida!.fileNames.map((f) => resolve(f));
    expect(incluidos).toContain(entrada);
    const salidas = ts.getOutputFileNames(leida!, entrada, false).map((f) => resolve(f));
    expect(salidas).toContain(resolve(RAIZ_DB, 'dist/cli/migrar.js'));
    // Lo que es solo de desarrollo sigue fuera: PGlite no va a producción (ADR 0003).
    expect(incluidos).not.toContain(resolve(RAIZ_DB, 'src/local/servidor.ts'));
    expect(incluidos).not.toContain(resolve(RAIZ_DB, 'src/cli/nueva-migracion.ts'));
  });

  it('el paquete publica dist y migraciones (lo que copia pnpm deploy) y tiene migrate:prod', () => {
    const pkg = JSON.parse(readFileSync(resolve(RAIZ_DB, 'package.json'), 'utf8')) as {
      files?: string[];
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.files ?? []).toEqual(expect.arrayContaining(['dist', 'migraciones']));
    expect(pkg.scripts['migrate:prod']).toBe('node dist/cli/migrar.js');
    // Lo que el CLI necesita en tiempo de ejecución está en dependencias, no en devDependencies.
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['pg', 'contracts']));
  });
});

describe('CLI de migraciones: DATABASE_URL, --hasta, JSON y código de salida', () => {
  it('--hasta NNNN aplica hasta esa versión inclusive, sale con 0 y lo registra en JSON', async () => {
    const salida = capturar();
    const codigo = await ejecutarComandoMigrar(
      ['--hasta', '0009'],
      { DATABASE_URL: base.url },
      { escribir: salida.escribir },
    );
    expect(codigo).toBe(0);
    const fin = salida.lineas.find((l) => String(l.json.msg).startsWith('migraciones aplicadas'));
    expect(fin, 'no se registró el resultado').toBeDefined();
    expect(fin!.canal).toBe('stdout');
    expect(fin!.json).toMatchObject({ level: 30, name: 'db-migraciones', hasta: '0009' });
    expect(typeof fin!.json.time).toBe('number');
    const todas = listarMigraciones();
    expect(fin!.json.aplicadas).toEqual(todas.filter((f) => hastaNumero(f) <= '0009'));
    expect(fin!.json.pendientes).toEqual(todas.filter((f) => hastaNumero(f) > '0009'));
  }, 120_000);

  it('sin --hasta aplica el resto, y una segunda pasada dice «ninguna (al día)»', async () => {
    const primera = capturar();
    expect(
      await ejecutarComandoMigrar([], { DATABASE_URL: base.url }, { escribir: primera.escribir }),
    ).toBe(0);
    const aplicadas = primera.lineas.find((l) => Array.isArray(l.json.aplicadas))?.json.aplicadas;
    expect(aplicadas).toEqual(listarMigraciones().filter((f) => hastaNumero(f) > '0009'));

    const segunda = capturar();
    expect(
      await ejecutarComandoMigrar([], { DATABASE_URL: base.url }, { escribir: segunda.escribir }),
    ).toBe(0);
    // El CI de la raíz busca este texto para afirmar que las migraciones son idempotentes.
    expect(segunda.lineas.map((l) => l.json.msg)).toContain(
      'migraciones aplicadas: ninguna (al día)',
    );
  }, 120_000);

  it.each([
    {
      caso: '--hasta de una migración que no existe',
      args: ['--hasta', '0099'],
      env: {},
      patron: /0099/,
    },
    { caso: '--hasta sin número', args: ['--hasta'], env: {}, patron: /hasta/ },
    { caso: 'un argumento desconocido', args: ['--hasat', '0009'], env: {}, patron: /hasat/ },
    {
      caso: 'MIGRAR_LOCK_TIMEOUT_MS ilegible',
      args: [],
      env: { MIGRAR_LOCK_TIMEOUT_MS: 'diez' },
      patron: /MIGRAR_LOCK_TIMEOUT_MS/,
    },
    {
      caso: 'producción sin DATABASE_URL (no cae a la base local)',
      args: [],
      env: { NODE_ENV: 'production', DATABASE_URL: undefined },
      patron: /DATABASE_URL/,
    },
  ])(
    '$caso: sale con 1, sin conectarse, y un JSON de error en stderr',
    async ({ args, env, patron }) => {
      const salida = capturar();
      const codigo = await ejecutarComandoMigrar(
        args,
        { DATABASE_URL: base.url, ...env },
        { escribir: salida.escribir, crearPool: NO_CONECTAR },
      );
      expect(codigo).toBe(1);
      const error = salida.lineas.at(-1);
      expect(error?.canal).toBe('stderr');
      expect(error?.json.level).toBe(50);
      expect(JSON.stringify(error?.json)).toMatch(patron);
      expect(JSON.stringify(error?.json)).not.toMatch(/no debía conectarse/);
    },
  );

  it('una migración cortada por lock_timeout sale con 1 y el error nombra archivo y SQLSTATE', async () => {
    const salida = capturar();
    // Una base de mentira que deja pasar el protocolo del runner (espera, transacción, plazos,
    // lock, tabla de control) y corta el SQL de la primera migración como lo hace PostgreSQL
    // cuando `lock_timeout` vence esperando el lock de un ALTER TABLE.
    const protocolo =
      /^(SELECT 1|BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory_xact_lock|CREATE TABLE IF NOT EXISTS _migraciones|SELECT nombre FROM _migraciones)/;
    const responder = async (sql: string) => {
      if (protocolo.test(String(sql).trim())) return { rows: [] };
      throw Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
    };
    const codigo = await ejecutarComandoMigrar(
      [],
      { DATABASE_URL: 'postgresql://nadie:x@127.0.0.1:9/nada' },
      {
        escribir: salida.escribir,
        crearPool: () =>
          ({
            query: responder,
            connect: async () => ({ query: responder, release: () => {} }),
            end: async () => {},
          }) as unknown as import('pg').Pool,
      },
    );
    expect(codigo).toBe(1);
    const error = salida.lineas.at(-1)!;
    expect(error.canal).toBe('stderr');
    expect(error.json).toMatchObject({ level: 50, err: { code: '55P03' } });
    expect(JSON.stringify(error.json.err)).toMatch(/0001_inicial\.sql/);
    // Quien lo lea a las tres de la mañana necesita saber que es reintentable y qué perilla hay.
    expect(String(error.json.pista)).toMatch(/MIGRAR_LOCK_TIMEOUT_MS/);
  });
});

describe('el punto de entrada, como proceso (lo que ejecuta el job de despliegue)', () => {
  /** Ejecuta `src/cli/migrar.ts` como lo hace `pnpm db:migrate`, en un proceso aparte. */
  function correr(args: string[], env: Record<string, string>) {
    return new Promise<{ codigo: number | null; stdout: string; stderr: string }>((ok, mal) => {
      const hijo = spawn(process.execPath, ['--import', 'tsx', 'src/cli/migrar.ts', ...args], {
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

  const ultimaLineaJson = (texto: string) =>
    JSON.parse(texto.trim().split('\n').at(-1) ?? '') as Record<string, unknown>;

  it('sale con 1 si falla y con 0 si no, escribiendo JSON', async () => {
    // Puerto 9 (discard): aunque la validación fallara, no hay nada al otro lado.
    const malo = await correr(['--hasta', '0099'], {
      DATABASE_URL: 'postgresql://nadie:x@127.0.0.1:9/nada',
    });
    expect(malo.codigo, malo.stderr).toBe(1);
    expect(ultimaLineaJson(malo.stderr)).toMatchObject({ level: 50 });

    const bueno = await correr([], { DATABASE_URL: base.url });
    expect(bueno.codigo, bueno.stderr).toBe(0);
    expect(ultimaLineaJson(bueno.stdout)).toMatchObject({
      level: 30,
      msg: 'migraciones aplicadas: ninguna (al día)',
    });
  }, 120_000);
});
