/**
 * Lógica del CLI de migraciones, separada del punto de entrada (`migrar.ts`) para poder probarla
 * sin abrir un proceso: devuelve el código de salida en vez de llamar a `process.exit`.
 *
 * Escribe UNA línea JSON por evento con la forma de pino (`level`, `time`, `pid`, `hostname`,
 * `name`, `msg`), la misma que los logs de api-core y geo-service, para que el colector de logs
 * del despliegue no necesite un formato aparte para el job de migraciones.
 */
import { hostname } from 'node:os';
import { parseArgs } from 'node:util';
import type pg from 'pg';
import { crearPool, DATABASE_URL_LOCAL, esperarBaseDeDatos } from '../cliente.js';
import { lockTimeoutMigracionMs } from '../configuracion.js';
import { ejecutorPg } from '../ejecutor.js';
import { aplicarMigraciones, resolverHasta } from '../migrar.js';

type Canal = 'stdout' | 'stderr';

export interface DependenciasComando {
  /** Recibe cada línea de log ya serializada. Por defecto, stdout (info) y stderr (error). */
  escribir?: (linea: string, canal: Canal) => void;
  /** Fábrica del pool. Las pruebas la sustituyen para comprobar que un error de uso no conecta. */
  crearPool?: (url: string) => pg.Pool;
}

const NIVEL = { info: 30, error: 50 } as const;

function escribirPorDefecto(linea: string, canal: Canal) {
  (canal === 'stdout' ? process.stdout : process.stderr).write(`${linea}\n`);
}

/** SQLSTATE de un error propio o de su causa (el runner envuelve el de PostgreSQL). */
function codigoDe(e: unknown): string | undefined {
  const propio = (e as { code?: unknown })?.code;
  if (typeof propio === 'string') return propio;
  const causa = (e as { cause?: { code?: unknown } })?.cause?.code;
  return typeof causa === 'string' ? causa : undefined;
}

/**
 * `node dist/cli/migrar.js [--hasta NNNN]`. Lee `DATABASE_URL` (obligatoria con
 * `NODE_ENV=production`; fuera de producción cae a la base local) y `MIGRAR_LOCK_TIMEOUT_MS`.
 * Devuelve 0 si todo quedó aplicado y 1 ante cualquier fallo, incluido un uso incorrecto.
 */
export async function ejecutarComandoMigrar(
  argumentos: readonly string[],
  entorno: NodeJS.ProcessEnv,
  dependencias: DependenciasComando = {},
): Promise<number> {
  const escribir = dependencias.escribir ?? escribirPorDefecto;
  const nuevoPool = dependencias.crearPool ?? ((url: string) => crearPool(url, { max: 1 }));
  const registrar = (nivel: keyof typeof NIVEL, msg: string, datos: Record<string, unknown> = {}) =>
    escribir(
      JSON.stringify({
        level: NIVEL[nivel],
        time: Date.now(),
        pid: process.pid,
        hostname: hostname(),
        name: 'db-migraciones',
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
      // 55P03 = lock_not_available: no es un fallo del SQL, es tráfico. Es reintentable.
      ...(code === '55P03'
        ? {
            pista:
              'otra sesión retenía la tabla más de MIGRAR_LOCK_TIMEOUT_MS; nada quedó a medias (la migración se deshizo). Reintentá con menos tráfico o subí MIGRAR_LOCK_TIMEOUT_MS.',
          }
        : {}),
    });
    return 1;
  };

  // 1) Uso y configuración: todo lo que puede estar mal escrito, antes de conectarse.
  let hasta: string | undefined;
  let lockTimeoutMs: number;
  let url: string;
  try {
    const { values } = parseArgs({
      args: [...argumentos],
      options: { hasta: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    hasta = values.hasta === undefined ? undefined : resolverHasta(values.hasta);
    lockTimeoutMs = lockTimeoutMigracionMs(entorno.MIGRAR_LOCK_TIMEOUT_MS);
    const deEntorno = entorno.DATABASE_URL?.trim();
    // En producción no hay «base por defecto»: caer a la local sería migrar otra base, o ninguna,
    // y en los dos casos el job diría que falló sin decir por qué.
    if (!deEntorno && entorno.NODE_ENV === 'production')
      throw new Error('DATABASE_URL es obligatoria con NODE_ENV=production.');
    url = deEntorno || DATABASE_URL_LOCAL;
  } catch (e) {
    return fallar('uso incorrecto del CLI de migraciones', e);
  }

  // 2) Migrar.
  const inicio = Date.now();
  let pool: pg.Pool | null = null;
  try {
    pool = nuevoPool(url);
    await esperarBaseDeDatos(pool, 10, 500);
    const r = await aplicarMigraciones(ejecutorPg(pool), {
      ...(hasta !== undefined ? { hasta } : {}),
      lockTimeoutMs,
    });
    // El texto «migraciones aplicadas: ninguna» lo busca el CI para afirmar la idempotencia.
    registrar(
      'info',
      `migraciones aplicadas: ${r.aplicadas.length ? r.aplicadas.join(', ') : 'ninguna (al día)'}`,
      {
        aplicadas: r.aplicadas,
        omitidas: r.omitidas.length,
        pendientes: r.pendientes,
        hasta: hasta ?? null,
        duracionMs: Date.now() - inicio,
      },
    );
    return 0;
  } catch (e) {
    return fallar('las migraciones fallaron', e);
  } finally {
    await pool?.end().catch(() => {});
  }
}
