/**
 * Migración 0014 (T3): cupo diario por cuenta en `cuota_reporte_diaria`.
 *
 * Desde el contrato 0.10.0 cada cuenta puede enviar 3 reportes y subir 12 fotos por día calendario
 * de la ciudad. El contador vive en la base (una fila por cuenta y por día) para que valga igual
 * con varias réplicas de api-core y para que dos envíos simultáneos no se cuelen los dos por el
 * último turno: api-core hace INSERT … ON CONFLICT DO UPDATE … WHERE reportes_n < máximo.
 *
 * Tres frentes:
 *  - la migración, desde 0013 con filas (el camino de producción) y desde cero;
 *  - el esquema Drizzle, que tiene que reflejar la tabla;
 *  - el mantenimiento, que borra las filas de días anteriores según la zona horaria de la ciudad y
 *    no según la de la sesión de PostgreSQL (UTC en Docker).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import { ejecutarMantenimiento } from '../src/mantenimiento.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';

const ARCHIVO_0014 = '0014_cuota_diaria.sql';
const numero = (f: string) => f.slice(0, 4);

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

async function crearCuenta(ex: Ejecutor, email: string): Promise<string> {
  const [u] = await ex.consultar<{ id: string }>(
    `INSERT INTO usuario (email, nombre, password_hash) VALUES ($1, 'Cuenta de prueba', 'scrypt$x$y')
     RETURNING id::text`,
    [email],
  );
  return u!.id;
}

interface Columna {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

const columnas = (ex: Ejecutor) =>
  ex.consultar<Columna>(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cuota_reporte_diaria' ORDER BY ordinal_position`,
  );

/** Restricciones e índices, para comparar la base migrada desde 0013 con la de cero. */
const estructura = async (ex: Ejecutor) => ({
  restricciones: await ex.consultar<{ conname: string; definicion: string }>(
    `SELECT conname, pg_get_constraintdef(oid) AS definicion FROM pg_constraint
      WHERE conrelid = 'public.cuota_reporte_diaria'::regclass ORDER BY conname`,
  ),
  indices: await ex.consultar<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'cuota_reporte_diaria' ORDER BY indexname`,
  ),
  columnas: await columnas(ex),
});

let estructuraDesde0013: Awaited<ReturnType<typeof estructura>>;

describe('migración 0014 sobre una base en uso (desde 0013, con filas)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let hasta0013: ResultadoMigracion;
  let con0014: ResultadoMigracion;
  let vecina: string;
  let ultimoReporteAntes: string | null;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    hasta0013 = await aplicarMigraciones(ex, { hasta: '0013' });
    // Una cuenta que ya usó la cuota por hora de la 0009: la 0014 no la toca.
    vecina = await crearCuenta(ex, 'vecina-0014@test.local');
    await ex.consultar(
      `UPDATE usuario SET ultimo_reporte_en = '2026-09-26T12:00:00Z' WHERE id = $1`,
      [vecina],
    );
    await ex.consultar(
      `INSERT INTO idempotencia (clave, huella) VALUES ('clave-anterior-a-0014', 'h')`,
    );
    const [u] = await ex.consultar<{ t: string | null }>(
      'SELECT ultimo_reporte_en::text AS t FROM usuario WHERE id = $1',
      [vecina],
    );
    ultimoReporteAntes = u!.t;
    con0014 = await aplicarMigraciones(ex, { hasta: '0014' });
    estructuraDesde0013 = await estructura(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0014_*.sql y se llama 0014_cuota_diaria.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0014')).toEqual([ARCHIVO_0014]);
  });

  it('hasta 0013 dejó la 0014 pendiente y la siguiente pasada la aplicó', () => {
    expect(hasta0013.pendientes).toContain(ARCHIVO_0014);
    expect(con0014.aplicadas).toEqual([ARCHIVO_0014]);
  });

  it('crea la tabla con sus columnas, tipos, nulabilidad y DEFAULT', async () => {
    const c = await columnas(ex);
    expect(c.map((x) => [x.column_name, x.data_type, x.is_nullable])).toEqual([
      ['usuario_id', 'uuid', 'NO'],
      ['dia', 'date', 'NO'],
      ['reportes_n', 'smallint', 'NO'],
      ['fotos_n', 'smallint', 'NO'],
      ['actualizado_en', 'timestamp with time zone', 'NO'],
    ]);
    const def = Object.fromEntries(c.map((x) => [x.column_name, x.column_default]));
    // Un INSERT de fotos no nombra reportes_n (y al revés): los contadores empiezan en 0.
    expect(def.reportes_n).toBe('0');
    expect(def.fotos_n).toBe('0');
    expect(def.actualizado_en).toBe('now()');
  });

  it('la clave primaria es (usuario_id, dia): una fila por cuenta y por día', async () => {
    const [pk] = await ex.consultar<{ definicion: string }>(
      `SELECT pg_get_constraintdef(oid) AS definicion FROM pg_constraint
        WHERE conrelid = 'public.cuota_reporte_diaria'::regclass AND contype = 'p'`,
    );
    expect(pk!.definicion).toBe('PRIMARY KEY (usuario_id, dia)');
  });

  it('el contador atómico de api-core suma de a uno y se detiene en el máximo', async () => {
    const contar = () =>
      ex.consultar<{ reportes_n: number }>(
        `INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n) VALUES ($1, '2026-09-27', 1)
         ON CONFLICT (usuario_id, dia) DO UPDATE
           SET reportes_n = cuota_reporte_diaria.reportes_n + 1, actualizado_en = now()
           WHERE cuota_reporte_diaria.reportes_n < 3
         RETURNING reportes_n`,
        [vecina],
      );
    const n: Array<number | null> = [];
    for (let i = 0; i < 4; i++) n.push((await contar())[0]?.reportes_n ?? null);
    // El 4.º no devuelve fila: es el 429.
    expect(n).toEqual([1, 2, 3, null]);
    const [f] = await ex.consultar<{ reportes_n: number; fotos_n: number }>(
      `SELECT reportes_n, fotos_n FROM cuota_reporte_diaria WHERE usuario_id = $1 AND dia = '2026-09-27'`,
      [vecina],
    );
    expect(f).toEqual({ reportes_n: 3, fotos_n: 0 });
  });

  it('rechaza contadores negativos (23514)', async () => {
    for (const columna of ['reportes_n', 'fotos_n'])
      await expect(
        ex.consultar(
          `INSERT INTO cuota_reporte_diaria (usuario_id, dia, ${columna}) VALUES ($1, '2026-01-01', -1)`,
          [vecina],
        ),
      ).rejects.toMatchObject({ code: '23514' });
  });

  it('no toca usuario.ultimo_reporte_en ni la tabla de idempotencia', async () => {
    const [u] = await ex.consultar<{ t: string | null }>(
      'SELECT ultimo_reporte_en::text AS t FROM usuario WHERE id = $1',
      [vecina],
    );
    expect(u!.t).toBe(ultimoReporteAntes);
    const claves = await ex.consultar<{ clave: string }>('SELECT clave FROM idempotencia');
    expect(claves.map((c) => c.clave)).toEqual(['clave-anterior-a-0014']);
  });

  it('borrar la cuenta borra sus cuotas (ON DELETE CASCADE)', async () => {
    const otra = await crearCuenta(ex, 'se-va-0014@test.local');
    await ex.consultar(
      `INSERT INTO cuota_reporte_diaria (usuario_id, dia, fotos_n) VALUES ($1, '2026-09-27', 2)`,
      [otra],
    );
    await ex.consultar('DELETE FROM usuario WHERE id = $1', [otra]);
    const quedan = await ex.consultar('SELECT 1 FROM cuota_reporte_diaria WHERE usuario_id = $1', [
      otra,
    ]);
    expect(quedan).toEqual([]);
  });

  it('tiene un índice por día, para que el mantenimiento no recorra la tabla', () => {
    expect(estructuraDesde0013.indices.map((i) => i.indexdef).join('\n')).toMatch(
      /cuota_reporte_diaria USING btree \(dia\)/,
    );
  });

  it('volver a ejecutar el archivo a mano no falla ni cambia nada (idempotente)', async () => {
    const leer = () =>
      ex.consultar('SELECT * FROM cuota_reporte_diaria ORDER BY usuario_id::text, dia');
    const antes = await leer();
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0014), 'utf8')),
    );
    expect(await leer()).toStrictEqual(antes);
    expect(await estructura(ex)).toStrictEqual(estructuraDesde0013);
  });
});

describe('migración 0014 desde cero', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('deja la misma tabla, restricciones e índices que la base migrada desde 0013', async () => {
    expect(await estructura(ex)).toStrictEqual(estructuraDesde0013);
  });
});

describe('mantenimiento: cuotas de días anteriores según la zona horaria de la ciudad', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let vecina: string;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
    vecina = await crearCuenta(ex, 'cuota-mantenimiento@test.local');
    // La base en UTC, como el contenedor de PostgreSQL: su `current_date` no es el día de la ciudad.
    await ex.ejecutar(`SET TIME ZONE 'UTC'`);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const sembrar = async () => {
    await ex.consultar('DELETE FROM cuota_reporte_diaria');
    await ex.consultar(
      `INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n, fotos_n) VALUES
         ($1, '2026-09-25', 3, 12), ($1, '2026-09-26', 1, 2), ($1, '2026-09-27', 1, 0)`,
      [vecina],
    );
  };
  const dias = async () =>
    (
      await ex.consultar<{ dia: string }>(
        'SELECT dia::text AS dia FROM cuota_reporte_diaria ORDER BY dia',
      )
    ).map((f) => f.dia);

  // 21:00 del 26 en La Paz (UTC-4) son las 01:00 del 27 en UTC.
  const A_LAS_21_DE_LA_PAZ = new Date('2026-09-27T01:00:00Z');

  it('a las 21:00 de La Paz, con la base en UTC, borra la fila de ayer y conserva la de hoy', async () => {
    await sembrar();
    const r = await ejecutarMantenimiento(ex, {
      zonaHoraria: 'America/La_Paz',
      ahora: A_LAS_21_DE_LA_PAZ,
    });
    expect(r.cuotasDiariasBorradas).toBe(1);
    // Con `current_date` (UTC) se habría ido también la del 26, que es la de HOY en la ciudad, y
    // la vecina habría recuperado sus turnos a las 20:00.
    expect(await dias()).toEqual(['2026-09-26', '2026-09-27']);
  });

  it('sin zona explícita usa ZONA_HORARIA, igual que api-core', async () => {
    await sembrar();
    vi.stubEnv('ZONA_HORARIA', 'UTC');
    await ejecutarMantenimiento(ex, { ahora: A_LAS_21_DE_LA_PAZ });
    expect(await dias()).toEqual(['2026-09-27']);
  });

  it('sin zona ni ZONA_HORARIA usa la del contrato (America/La_Paz)', async () => {
    await sembrar();
    vi.stubEnv('ZONA_HORARIA', '');
    await ejecutarMantenimiento(ex, { ahora: A_LAS_21_DE_LA_PAZ });
    expect(await dias()).toEqual(['2026-09-26', '2026-09-27']);
  });

  it('es idempotente: la segunda pasada no borra nada', async () => {
    await sembrar();
    const opciones = { zonaHoraria: 'America/La_Paz', ahora: A_LAS_21_DE_LA_PAZ };
    await ejecutarMantenimiento(ex, opciones);
    const segunda = await ejecutarMantenimiento(ex, opciones);
    expect(segunda.cuotasDiariasBorradas).toBe(0);
    expect(await dias()).toEqual(['2026-09-26', '2026-09-27']);
  });

  it('sin `ahora` decide con el reloj de la base: la fila de hoy en la ciudad se queda', async () => {
    await ex.consultar('DELETE FROM cuota_reporte_diaria');
    await ex.consultar(
      `INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n)
       VALUES ($1, (now() AT TIME ZONE 'America/La_Paz')::date, 1),
              ($1, (now() AT TIME ZONE 'America/La_Paz')::date - 1, 3)`,
      [vecina],
    );
    const r = await ejecutarMantenimiento(ex, { zonaHoraria: 'America/La_Paz' });
    expect(r.cuotasDiariasBorradas).toBe(1);
    const [hoy] = await ex.consultar<{ ok: boolean }>(
      `SELECT dia = (now() AT TIME ZONE 'America/La_Paz')::date AS ok FROM cuota_reporte_diaria`,
    );
    expect(hoy?.ok).toBe(true);
  });
});

describe('esquema Drizzle de la cuota diaria', () => {
  it('declara cuota_reporte_diaria con PK (usuario_id, dia) y la FK en cascada a usuario', () => {
    const tabla = esquema.cuotaReporteDiaria;
    expect(getTableName(tabla)).toBe('cuota_reporte_diaria');
    const cfg = getTableConfig(tabla);
    expect(cfg.primaryKeys.map((pk) => pk.columns.map((c) => c.name))).toEqual([
      ['usuario_id', 'dia'],
    ]);
    const fk = cfg.foreignKeys.map((f) => f.reference());
    expect(fk.map((r) => [r.columns.map((c) => c.name), getTableName(r.foreignTable)])).toEqual([
      [['usuario_id'], 'usuario'],
    ]);
    expect(cfg.foreignKeys[0]!.onDelete).toBe('cascade');
    const c = getTableColumns(tabla) as Record<string, { name: string; getSQLType(): string }>;
    expect(Object.fromEntries(Object.values(c).map((x) => [x.name, x.getSQLType()]))).toStrictEqual(
      {
        usuario_id: 'uuid',
        dia: 'date',
        reportes_n: 'smallint',
        fotos_n: 'smallint',
        actualizado_en: 'timestamp with time zone',
      },
    );
  });
});
