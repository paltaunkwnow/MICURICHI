/**
 * Regresión del arranque de las migraciones con varias réplicas (Fase 4).
 *
 * El fallo real, reproducido contra PostgreSQL 18 con ocho réplicas arrancando a la vez sobre
 * una base vacía: una de ellas moría con
 *   `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`.
 * La causa no era ninguna migración —el error no llevaba el prefijo `Migración XXXX falló:`—
 * sino el `CREATE TABLE IF NOT EXISTS _migraciones` del arranque, que corría fuera del advisory
 * lock. `IF NOT EXISTS` comprueba y crea en dos pasos, así que no es atómico entre sesiones.
 *
 * Esa carrera no se puede provocar con PGlite, que es de conexión única. Lo que sí se puede
 * comprobar de forma determinista es la invariante que la evita: **ninguna sentencia toca el
 * esquema antes de haber tomado el lock**. Eso es exactamente lo que verifica este test, con un
 * `Ejecutor` de mentira que anota el orden de las operaciones.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Ejecutor } from '../src/ejecutor.js';
import { aplicarMigraciones } from '../src/migrar.js';

interface Paso {
  tipo: 'ejecutar' | 'consultar' | 'begin' | 'commit';
  sql: string;
  /** Profundidad de transacción en la que ocurrió (0 = fuera de toda transacción). */
  enTransaccion: number;
}

/** Ejecutor que no habla con ninguna base: solo registra qué se le pide y en qué orden. */
function ejecutorEspia(migracionesYaAplicadas: string[] = []): {
  ex: Ejecutor;
  pasos: Paso[];
} {
  const pasos: Paso[] = [];
  let profundidad = 0;
  const crear = (): Ejecutor => ({
    async ejecutar(sql) {
      pasos.push({ tipo: 'ejecutar', sql, enTransaccion: profundidad });
    },
    async consultar<T>(sql: string, params: unknown[] = []) {
      pasos.push({ tipo: 'consultar', sql, enTransaccion: profundidad });
      if (sql.includes('FROM _migraciones')) {
        const nombre = params[0] as string;
        return (migracionesYaAplicadas.includes(nombre) ? [{ nombre }] : []) as T[];
      }
      return [] as T[];
    },
    async transaccion<T>(fn: (e: Ejecutor) => Promise<T>): Promise<T> {
      pasos.push({ tipo: 'begin', sql: 'BEGIN', enTransaccion: profundidad });
      profundidad++;
      try {
        return await fn(crear());
      } finally {
        profundidad--;
        pasos.push({ tipo: 'commit', sql: 'COMMIT', enTransaccion: profundidad });
      }
    },
  });
  return { ex: crear(), pasos };
}

let directorio: string | null = null;

/** Directorio de migraciones de mentira, para no depender de las reales. */
function directorioConMigraciones(nombres: string[]): string {
  directorio = mkdtempSync(join(tmpdir(), 'curichi-migr-'));
  for (const n of nombres) writeFileSync(join(directorio, n), `-- ${n}\nSELECT 1;\n`, 'utf8');
  return directorio;
}

afterEach(() => {
  if (directorio) rmSync(directorio, { recursive: true, force: true });
  directorio = null;
});

const ES_LOCK = (sql: string) => sql.includes('pg_advisory_xact_lock');
const CREA_TABLA = (sql: string) => /CREATE TABLE IF NOT EXISTS _migraciones/i.test(sql);

describe('arranque de las migraciones con varias réplicas (§7)', () => {
  it('no toca el esquema antes de tomar el advisory lock', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
    const { ex, pasos } = ejecutorEspia();
    await aplicarMigraciones(ex, dir);

    const primerLock = pasos.findIndex((p) => ES_LOCK(p.sql));
    expect(primerLock, 'nunca se tomó el advisory lock').toBeGreaterThanOrEqual(0);
    // Antes del primer lock solo puede haber un BEGIN. Cualquier DDL o SELECT anterior es
    // justamente la carrera que este test existe para impedir.
    const antes = pasos.slice(0, primerLock).filter((p) => p.tipo !== 'begin');
    expect(antes, `se ejecutó algo antes del lock: ${antes.map((p) => p.sql).join(' | ')}`).toEqual(
      [],
    );
  });

  it('crea _migraciones dentro de una transacción y con el lock ya tomado', async () => {
    const dir = directorioConMigraciones(['0001_a.sql']);
    const { ex, pasos } = ejecutorEspia();
    await aplicarMigraciones(ex, dir);

    const iCrear = pasos.findIndex((p) => CREA_TABLA(p.sql));
    expect(iCrear, 'no se creó la tabla de control').toBeGreaterThanOrEqual(0);
    expect(pasos[iCrear]?.enTransaccion, 'CREATE TABLE fuera de transacción').toBeGreaterThan(0);
    const lockPrevio = pasos.slice(0, iCrear).some((p) => ES_LOCK(p.sql));
    expect(lockPrevio, 'CREATE TABLE _migraciones sin el lock tomado').toBe(true);
  });

  it('cada migración se aplica bajo el lock, en su propia transacción', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql', '0003_c.sql']);
    const { ex, pasos } = ejecutorEspia();
    const r = await aplicarMigraciones(ex, dir);
    expect(r.aplicadas).toEqual(['0001_a.sql', '0002_b.sql', '0003_c.sql']);

    // Un lock por transacción: el del arranque más uno por migración.
    expect(pasos.filter((p) => ES_LOCK(p.sql))).toHaveLength(4);
    expect(pasos.filter((p) => p.tipo === 'begin')).toHaveLength(4);
    for (const paso of pasos.filter((p) => p.sql.includes('INSERT INTO _migraciones')))
      expect(paso.enTransaccion).toBeGreaterThan(0);
  });

  it('una réplica que llega tarde no reaplica nada', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
    const { ex, pasos } = ejecutorEspia(['0001_a.sql', '0002_b.sql']);
    const r = await aplicarMigraciones(ex, dir);
    expect(r.aplicadas).toEqual([]);
    expect(r.omitidas).toEqual(['0001_a.sql', '0002_b.sql']);
    // Sigue tomando el lock y mirando dentro de la transacción: es lo que hace que la decisión
    // de omitir sea fiable y no una lectura sucia de antes de que la otra réplica terminara.
    expect(pasos.some((p) => ES_LOCK(p.sql))).toBe(true);
    expect(pasos.some((p) => p.sql.includes('INSERT INTO _migraciones'))).toBe(false);
  });
});
