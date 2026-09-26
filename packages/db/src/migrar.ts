import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockTimeoutMigracionMs } from './configuracion.js';
import type { Ejecutor } from './ejecutor.js';

const aqui = dirname(fileURLToPath(import.meta.url));
/** Funciona desde src/ (tsx) y desde dist/ (compilado): ambos están un nivel bajo packages/db. */
export const DIRECTORIO_MIGRACIONES = resolve(aqui, '..', 'migraciones');

export interface ResultadoMigracion {
  aplicadas: string[];
  omitidas: string[];
  /** Posteriores a `hasta`: quedaron sin aplicar a propósito. Vacío si no se pidió `hasta`. */
  pendientes: string[];
}

export interface OpcionesMigracion {
  /** Carpeta de los `NNNN_*.sql`. Por defecto, la del paquete. */
  directorio?: string;
  /**
   * Aplica solo hasta esta migración, inclusive: `'NNNN'` o el nombre del archivo. Sirve para
   * restaurar un respaldo de una versión anterior: se crea su esquema, se cargan los datos y
   * después se migra el resto, que es lo que convierte los datos viejos.
   */
  hasta?: string;
  /** `lock_timeout` del SQL de cada migración, en ms. Por defecto `MIGRAR_LOCK_TIMEOUT_MS` o 10 000. */
  lockTimeoutMs?: number;
}

export function listarMigraciones(directorio = DIRECTORIO_MIGRACIONES): string[] {
  return readdirSync(directorio)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

/**
 * Clave del advisory lock que serializa las migraciones. Arbitraria pero estable: lo único que
 * importa es que todos los procesos usen la misma.
 */
const CLAVE_LOCK_MIGRACIONES = 4022;

const numeroDe = (archivo: string) => archivo.slice(0, 4);

/**
 * Valida `hasta` (`'NNNN'` o el nombre de un archivo) contra las migraciones que hay y devuelve su
 * número. Lanza si no corresponde a ninguna: un `--hasta` mal escrito no puede acabar aplicando
 * todo, ni nada.
 */
export function resolverHasta(hasta: string, archivos: string[] = listarMigraciones()): string {
  const texto = hasta.trim();
  const existe = /^\d{4}$/.test(texto)
    ? archivos.some((f) => numeroDe(f) === texto)
    : /^\d{4}_.+\.sql$/.test(texto) && archivos.includes(texto);
  if (!existe)
    throw new Error(
      `hasta: no hay ninguna migración «${hasta}»; tiene que ser el número de una existente (NNNN, p. ej. ${archivos.at(-1)?.slice(0, 4) ?? '0001'}) o el nombre de su archivo.`,
    );
  return numeroDe(texto);
}

/**
 * Plazos de cada transacción de migración. Van ANTES de esperar el advisory lock porque esa espera
 * también es una sentencia: una réplica que espera a otra que está reescribiendo una tabla grande
 * no puede rendirse a los 30 s del pool ni al `lock_timeout` del servidor.
 *
 * - `statement_timeout = 0`: 0010 y 0011 reescriben `reporte_inundacion`; con un millón de filas
 *   tardarían ~56 s y ~34 s (Fase 4), y con el plazo de 30 s del pool se cancelaban, hacían
 *   ROLLBACK y el despliegue las reintentaba en bucle sin avanzar nunca.
 * - `lock_timeout`: se fija DESPUÉS de tener el advisory lock, así solo afecta a los locks del SQL
 *   de la migración. Un ALTER TABLE que espera su lock exclusivo deja en cola detrás de él a todo
 *   el tráfico de la tabla; mejor fallar (55P03) y reintentar que tumbar la tabla mientras espera.
 *
 * `SET LOCAL` muere con la transacción: el pool recupera sus plazos normales al terminar.
 */
async function tomarLockDeMigraciones(tx: Ejecutor, lockTimeoutMs: number): Promise<void> {
  await tx.ejecutar('SET LOCAL statement_timeout = 0');
  await tx.ejecutar('SET LOCAL lock_timeout = 0');
  await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CLAVE_LOCK_MIGRACIONES]);
  await tx.ejecutar(`SET LOCAL lock_timeout = ${lockTimeoutMs}`);
}

/**
 * Aplica las migraciones pendientes en orden, cada una en su transacción, y registra cada una en
 * `_migraciones`. El segundo argumento puede ser la carpeta (forma histórica) o las opciones.
 */
export async function aplicarMigraciones(
  ex: Ejecutor,
  opciones: string | OpcionesMigracion = {},
): Promise<ResultadoMigracion> {
  const o: OpcionesMigracion = typeof opciones === 'string' ? { directorio: opciones } : opciones;
  const directorio = o.directorio ?? DIRECTORIO_MIGRACIONES;
  // Todo lo que puede estar mal escrito se valida ANTES de tocar la base.
  const lockTimeoutMs = o.lockTimeoutMs ?? lockTimeoutMigracionMs();
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 0)
    throw new Error(`lockTimeoutMs inválido (${lockTimeoutMs}): entero de milisegundos ≥ 0.`);
  const todas = listarMigraciones(directorio);
  const hasta = o.hasta === undefined ? null : resolverHasta(o.hasta, todas);
  const archivos = hasta === null ? todas : todas.filter((f) => numeroDe(f) <= hasta);
  const pendientes = hasta === null ? [] : todas.filter((f) => numeroDe(f) > hasta);

  // La tabla de control se crea DENTRO del mismo lock que las migraciones. `CREATE TABLE IF NOT
  // EXISTS` no es atómico: la comprobación y la creación son dos pasos, así que dos sesiones
  // simultáneas pueden pasar ambas la comprobación y la segunda muere con
  // `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`, que es el tipo
  // compuesto de la tabla chocando en el catálogo. Reproducido en la Fase 4 contra PostgreSQL 18
  // real con seis réplicas arrancando a la vez sobre una base vacía: una de las seis se caía.
  // Con `restart: unless-stopped` el siguiente intento funciona, pero en un despliegue eso es un
  // contenedor en CrashLoopBackOff sin ninguna causa real detrás.
  await ex.transaccion(async (tx) => {
    await tomarLockDeMigraciones(tx, lockTimeoutMs);
    await tx.ejecutar(`CREATE TABLE IF NOT EXISTS _migraciones (
      nombre text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);
    if (hasta === null) return;
    // `hasta` no deshace nada: sobre una base que ya va por delante, «migrar hasta 0009» no
    // dejaría el esquema de 0009, y la carga posterior de un respaldo viejo fallaría con errores
    // que no dicen por qué. Mejor decirlo aquí.
    const registradas = await tx.consultar<{ nombre: string }>(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    const posteriores = registradas.map((r) => r.nombre).filter((n) => numeroDe(n) > hasta);
    if (posteriores.length)
      throw new Error(
        `hasta ${hasta}: la base ya tiene aplicadas migraciones posteriores a ${hasta} (${posteriores.join(', ')}). ` +
          'hasta no deshace migraciones: para restaurar un respaldo de esa versión, partí de una base vacía.',
      );
  });

  const aplicadas: string[] = [];
  const omitidas: string[] = [];
  for (const archivo of archivos) {
    // Cada migración va en su propia transacción CON un advisory lock de transacción. Sin el
    // lock, dos instancias que arrancan a la vez (un despliegue con varias réplicas, que es lo
    // normal) intentan aplicar la misma migración: una gana y la otra muere con un error de
    // "el tipo ya existe" y entra en bucle de reinicio. Con el lock, la segunda espera, vuelve
    // a leer _migraciones DENTRO de la transacción y ve que ya está hecha.
    const resultado = await ex.transaccion(async (tx) => {
      await tomarLockDeMigraciones(tx, lockTimeoutMs);
      const yaEsta = await tx.consultar<{ nombre: string }>(
        'SELECT nombre FROM _migraciones WHERE nombre = $1',
        [archivo],
      );
      if (yaEsta.length) return 'omitida' as const;
      const sql = readFileSync(join(directorio, archivo), 'utf8');
      try {
        await tx.ejecutar(sql);
      } catch (e) {
        // Se conserva la causa: su SQLSTATE (55P03 = lock_timeout) dice si es reintentable.
        throw new Error(`Migración ${archivo} falló: ${(e as Error).message}`, { cause: e });
      }
      await tx.consultar('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
      return 'aplicada' as const;
    });
    if (resultado === 'aplicada') aplicadas.push(archivo);
    else omitidas.push(archivo);
  }
  return { aplicadas, omitidas, pendientes };
}
