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
export async function aplicarMigraciones(
  ex: Ejecutor,
  directorio = DIRECTORIO_MIGRACIONES,
): Promise<ResultadoMigracion> {
  await ex.ejecutar(`CREATE TABLE IF NOT EXISTS _migraciones (
    nombre text PRIMARY KEY,
    aplicada_en timestamptz NOT NULL DEFAULT now()
  )`);
  const hechas = new Set(
    (await ex.consultar<{ nombre: string }>('SELECT nombre FROM _migraciones')).map(
      (r) => r.nombre,
    ),
  );
  const aplicadas: string[] = [];
  const omitidas: string[] = [];
  for (const archivo of listarMigraciones(directorio)) {
    if (hechas.has(archivo)) {
      omitidas.push(archivo);
      continue;
    }
    const sql = readFileSync(join(directorio, archivo), 'utf8');
    await ex.ejecutar('BEGIN');
    try {
      await ex.ejecutar(sql);
      await ex.consultar('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
      await ex.ejecutar('COMMIT');
    } catch (e) {
      await ex.ejecutar('ROLLBACK');
      throw new Error(`Migración ${archivo} falló: ${(e as Error).message}`);
    }
    aplicadas.push(archivo);
  }
  return { aplicadas, omitidas };
}
