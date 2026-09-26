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
/** Ajuste de plazos de la propia transacción: no toca el esquema ni lee nada. */
const ES_PLAZO = (sql: string) =>
  /^SET LOCAL (statement_timeout|lock_timeout) = \d+$/.test(sql.trim());

describe('arranque de las migraciones con varias réplicas (§7)', () => {
  it('no toca el esquema antes de tomar el advisory lock', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
    const { ex, pasos } = ejecutorEspia();
    await aplicarMigraciones(ex, dir);

    const primerLock = pasos.findIndex((p) => ES_LOCK(p.sql));
    expect(primerLock, 'nunca se tomó el advisory lock').toBeGreaterThanOrEqual(0);
    // Antes del primer lock solo puede haber un BEGIN y los SET LOCAL de los plazos, que no tocan
    // el esquema (y tienen que ir antes: ver «plazos de las migraciones»). Cualquier DDL o SELECT
    // anterior es justamente la carrera que este test existe para impedir.
    const antes = pasos.slice(0, primerLock).filter((p) => p.tipo !== 'begin' && !ES_PLAZO(p.sql));
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

/** Sentencias de cada transacción, en orden (sin los BEGIN/COMMIT que la delimitan). */
function porTransaccion(pasos: Paso[]): Paso[][] {
  const grupos: Paso[][] = [];
  let actual: Paso[] | null = null;
  for (const p of pasos) {
    if (p.tipo === 'begin' && p.enTransaccion === 0) actual = [];
    else if (p.tipo === 'commit' && p.enTransaccion === 0) {
      if (actual) grupos.push(actual);
      actual = null;
    } else actual?.push(p);
  }
  return grupos;
}

const indice = (tx: Paso[], cumple: (sql: string) => boolean) => tx.findIndex((p) => cumple(p.sql));
const SIN_STATEMENT_TIMEOUT = (sql: string) => /^SET LOCAL statement_timeout = 0$/.test(sql.trim());
const LOCK_TIMEOUT = (ms: number) => (sql: string) =>
  new RegExp(`^SET LOCAL lock_timeout = ${ms}$`).test(sql.trim());
const ES_SQL_DE_MIGRACION = (sql: string) => /^-- \d{4}_/.test(sql);

/**
 * Revisión de producción (2026-09-26): 0010 y 0011 reescriben `reporte_inundacion`. Medido en la
 * Fase 4 con un millón de filas, tardarían ~56 s y ~34 s, y el pool corta toda sentencia a los
 * 30 s (`DB_STATEMENT_TIMEOUT_MS`): la migración se cancelaba, hacía ROLLBACK y el despliegue la
 * reintentaba en bucle sin avanzar nunca. Y sin `lock_timeout`, un ALTER TABLE que espera su lock
 * exclusivo detrás de una lectura larga deja en cola, detrás de él, a TODO el tráfico de la tabla.
 *
 * PGlite no aplica `statement_timeout` (no tiene temporizadores) ni puede tener dos sesiones que
 * compitan por un lock, así que, como el resto de este archivo, se comprueba la invariante que lo
 * evita: el orden de las sentencias en cada transacción.
 */
describe('plazos de las migraciones (statement_timeout y lock_timeout)', () => {
  it('cada transacción desactiva statement_timeout ANTES de esperar el advisory lock', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
    const { ex, pasos } = ejecutorEspia();
    await aplicarMigraciones(ex, dir);
    const transacciones = porTransaccion(pasos);
    expect(transacciones).toHaveLength(3);
    for (const tx of transacciones) {
      const sinPlazo = indice(tx, SIN_STATEMENT_TIMEOUT);
      // Antes del lock y no después: una réplica que espera a otra que está reescribiendo una
      // tabla grande también estaría «ejecutando una sentencia» de más de 30 s.
      expect(sinPlazo, 'falta SET LOCAL statement_timeout = 0').toBeGreaterThanOrEqual(0);
      expect(sinPlazo).toBeLessThan(indice(tx, ES_LOCK));
    }
  });

  it('espera el lock sin plazo y fija lock_timeout después, antes del SQL de la migración', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
    const { ex, pasos } = ejecutorEspia();
    await aplicarMigraciones(ex, dir);
    for (const tx of porTransaccion(pasos)) {
      const lock = indice(tx, ES_LOCK);
      const esperaSinPlazo = indice(tx, LOCK_TIMEOUT(0));
      const plazo = indice(tx, LOCK_TIMEOUT(10_000));
      expect(esperaSinPlazo, 'lock_timeout = 0 antes del advisory lock').toBeGreaterThanOrEqual(0);
      expect(esperaSinPlazo).toBeLessThan(lock);
      expect(plazo, 'lock_timeout = 10000 tras el advisory lock').toBeGreaterThan(lock);
      const migracion = indice(tx, ES_SQL_DE_MIGRACION);
      if (migracion >= 0) expect(plazo).toBeLessThan(migracion);
    }
  });

  it('el plazo sale de lockTimeoutMs o de MIGRAR_LOCK_TIMEOUT_MS', async () => {
    const dir = directorioConMigraciones(['0001_a.sql']);
    const conOpcion = ejecutorEspia();
    await aplicarMigraciones(conOpcion.ex, { directorio: dir, lockTimeoutMs: 2500 });
    expect(conOpcion.pasos.some((p) => LOCK_TIMEOUT(2500)(p.sql))).toBe(true);

    const previo = process.env.MIGRAR_LOCK_TIMEOUT_MS;
    try {
      process.env.MIGRAR_LOCK_TIMEOUT_MS = '4000';
      const conVariable = ejecutorEspia();
      await aplicarMigraciones(conVariable.ex, dir);
      expect(conVariable.pasos.some((p) => LOCK_TIMEOUT(4000)(p.sql))).toBe(true);

      // Un valor ilegible no cae en silencio al defecto: falla antes de tocar la base.
      process.env.MIGRAR_LOCK_TIMEOUT_MS = 'diez segundos';
      const malConfigurado = ejecutorEspia();
      await expect(aplicarMigraciones(malConfigurado.ex, dir)).rejects.toThrow(
        /MIGRAR_LOCK_TIMEOUT_MS/,
      );
      expect(malConfigurado.pasos).toEqual([]);
    } finally {
      if (previo === undefined) delete process.env.MIGRAR_LOCK_TIMEOUT_MS;
      else process.env.MIGRAR_LOCK_TIMEOUT_MS = previo;
    }
  });
});

/**
 * Revisión de producción (2026-09-26): `respaldo-y-restauracion.md` restauraba migrando a la ÚLTIMA
 * versión y cargando después los datos con `pg_restore --data-only`. Un respaldo anterior a 0010
 * trae columnas y valores de enum que ya no existen, y la carga falla. Con `hasta` se crea el
 * esquema del respaldo, se cargan los datos y después se migra el resto, que es lo que convierte
 * los datos viejos (0010 recalcula la severidad, 0011 mapea el sumidero).
 */
describe('hasta: migrar solo hasta una versión (restaurar respaldos viejos)', () => {
  it('aplica hasta esa migración inclusive y deja las posteriores en pendientes', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql', '0003_c.sql', '0004_d.sql']);
    const { ex } = ejecutorEspia();
    const r = await aplicarMigraciones(ex, { directorio: dir, hasta: '0002' });
    expect(r.aplicadas).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(r.pendientes).toEqual(['0003_c.sql', '0004_d.sql']);
  });

  it('admite el nombre completo del archivo', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql', '0003_c.sql']);
    const { ex } = ejecutorEspia();
    const r = await aplicarMigraciones(ex, { directorio: dir, hasta: '0002_b.sql' });
    expect(r.aplicadas).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('sin hasta no queda nada pendiente', async () => {
    const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
    const { ex } = ejecutorEspia();
    const r = await aplicarMigraciones(ex, dir);
    expect(r.pendientes).toEqual([]);
  });

  it.each(['0009', '9', 'abc', '0002_otra.sql'])(
    'un hasta inexistente o mal escrito («%s») falla antes de tocar la base',
    async (hasta) => {
      const dir = directorioConMigraciones(['0001_a.sql', '0002_b.sql']);
      const { ex, pasos } = ejecutorEspia();
      await expect(aplicarMigraciones(ex, { directorio: dir, hasta })).rejects.toThrow(/hasta/i);
      expect(pasos).toEqual([]);
    },
  );
});
