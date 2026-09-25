import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ejecutor } from './ejecutor.js';

const aqui = dirname(fileURLToPath(import.meta.url));
/** Funciona desde src/ (tsx) y desde dist/ (compilado): ambos están un nivel bajo packages/db. */
export const DIRECTORIO_MIGRACIONES = resolve(aqui, '..', 'migraciones');

export interface ResultadoMigracion {
  aplicadas: string[];
  omitidas: string[];
}

export function listarMigraciones(directorio = DIRECTORIO_MIGRACIONES): string[] {
  return readdirSync(directorio)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

/** Aplica las migraciones pendientes en orden. Registra cada una en _migraciones. */
/**
 * Clave del advisory lock que serializa las migraciones. Arbitraria pero estable: lo único que
 * importa es que todos los procesos usen la misma.
 */
const CLAVE_LOCK_MIGRACIONES = 4022;

export async function aplicarMigraciones(
  ex: Ejecutor,
  directorio = DIRECTORIO_MIGRACIONES,
): Promise<ResultadoMigracion> {
  // La tabla de control se crea DENTRO del mismo lock que las migraciones. `CREATE TABLE IF NOT
  // EXISTS` no es atómico: la comprobación y la creación son dos pasos, así que dos sesiones
  // simultáneas pueden pasar ambas la comprobación y la segunda muere con
  // `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`, que es el tipo
  // compuesto de la tabla chocando en el catálogo. Reproducido en la Fase 4 contra PostgreSQL 18
  // real con seis réplicas arrancando a la vez sobre una base vacía: una de las seis se caía.
  // Con `restart: unless-stopped` el siguiente intento funciona, pero en un despliegue eso es un
  // contenedor en CrashLoopBackOff sin ninguna causa real detrás.
  await ex.transaccion(async (tx) => {
    await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CLAVE_LOCK_MIGRACIONES]);
    await tx.ejecutar(`CREATE TABLE IF NOT EXISTS _migraciones (
      nombre text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);
  });
  const aplicadas: string[] = [];
  const omitidas: string[] = [];
  const archivos = listarMigraciones(directorio);
  for (const archivo of archivos) {
    // Cada migración va en su propia transacción CON un advisory lock de transacción. Sin el
    // lock, dos instancias que arrancan a la vez (un despliegue con varias réplicas, que es lo
    // normal) intentan aplicar la misma migración: una gana y la otra muere con un error de
    // "el tipo ya existe" y entra en bucle de reinicio. Con el lock, la segunda espera, vuelve
    // a leer _migraciones DENTRO de la transacción y ve que ya está hecha.
    const resultado = await ex.transaccion(async (tx) => {
      await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CLAVE_LOCK_MIGRACIONES]);
      const yaEsta = await tx.consultar<{ nombre: string }>(
        'SELECT nombre FROM _migraciones WHERE nombre = $1',
        [archivo],
      );
      if (yaEsta.length) return 'omitida' as const;
      const sql = readFileSync(join(directorio, archivo), 'utf8');
      try {
        await tx.ejecutar(sql);
      } catch (e) {
        throw new Error(`Migración ${archivo} falló: ${(e as Error).message}`);
      }
      await tx.consultar('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
      return 'aplicada' as const;
    });
    if (resultado === 'aplicada') aplicadas.push(archivo);
    else omitidas.push(archivo);
  }
  return { aplicadas, omitidas };
}
