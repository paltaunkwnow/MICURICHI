/**
 * El esquema Drizzle (`src/esquema/index.ts`) es un espejo tipado de las migraciones SQL: no
 * genera DDL, pero api-core y geo-service lo usan para tipar sus consultas. Si se desalinea, un
 * servicio compila contra una columna que no existe, no ve una que sí existe, o inserta con un
 * valor por defecto que ya no es el de la base.
 *
 * Revisión de producción (2026-09-26): se había desalineado sin que nada lo notara. Faltaban
 * `geom_publico` (0005) en `reporte_inundacion` y `punto_critico` y `sesion.ultimo_uso_en` (0003),
 * y `severidad_version` seguía con DEFAULT 1 cuando la 0010 lo pasó a 2. Esta prueba compara el
 * espejo con una base migrada desde cero, para que la próxima migración que se olvide del espejo
 * falle aquí y no en un servicio.
 */
import { is, SQL } from 'drizzle-orm';
import { getTableConfig, isPgEnum, type PgColumn, PgDialect, PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import { aplicarMigraciones } from '../src/migrar.js';

/**
 * Tablas que existen en la base y a propósito no tienen espejo: el control de migraciones, la de
 * PostGIS y dos que api-core usa solo con SQL crudo. Una tabla nueva tiene que entrar al esquema
 * Drizzle o a esta lista, pero no puede quedar fuera de las dos sin que nadie lo decida.
 */
const TABLAS_SIN_ESPEJO = new Set([
  'public._migraciones',
  'public.spatial_ref_sys',
  'public.intento_login',
  'public.idempotencia',
]);

interface ColumnaBase {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

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

const dialecto = new PgDialect();

const tablasDrizzle = (): PgTable[] =>
  Object.values(esquema as Record<string, unknown>).filter((v): v is PgTable => is(v, PgTable));

const nombreCompleto = (t: PgTable) => {
  const c = getTableConfig(t);
  return `${c.schema ?? 'public'}.${c.name}`;
};

/** Tipo «básico» de la base: el nombre del tipo, o el del tipo de usuario (enums, geometry). */
const tipoBase = (c: ColumnaBase) => (c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type);

/** DEFAULT de la base sin los casts de tipo ni las comillas: `'nuevo'::estado_reporte` → nuevo. */
function defaultBase(texto: string | null): string | null {
  if (texto === null) return null;
  let t = texto.trim();
  while (/::[a-z_][a-z0-9_ ]*$/i.test(t)) t = t.replace(/::[a-z_][a-z0-9_ ]*$/i, '').trim();
  const literal = /^'(.*)'$/s.exec(t);
  return literal ? literal[1]!.replace(/''/g, "'") : t;
}

/** DEFAULT del espejo en la misma forma: SQL tal cual, objetos como JSON, el resto como texto. */
function defaultDrizzle(c: PgColumn): string | null {
  if (!c.hasDefault) return null;
  const d: unknown = c.default;
  if (is(d, SQL)) return dialecto.sqlToQuery(d).sql;
  if (d !== null && typeof d === 'object') return JSON.stringify(d);
  return String(d);
}

describe('esquema Drizzle ↔ base migrada desde cero', () => {
  it('cada tabla del espejo tiene exactamente las columnas de la base, con su tipo, nulabilidad y DEFAULT', async () => {
    const diferencias: string[] = [];
    for (const tabla of tablasDrizzle()) {
      const cfg = getTableConfig(tabla);
      const esquemaSql = cfg.schema ?? 'public';
      const nombre = `${esquemaSql}.${cfg.name}`;
      const filas = await ex.consultar<ColumnaBase>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
        [esquemaSql, cfg.name],
      );
      if (!filas.length) {
        diferencias.push(`${nombre}: la tabla no existe en la base`);
        continue;
      }
      const enBase = new Map(filas.map((f) => [f.column_name, f]));
      const enEspejo = new Map(cfg.columns.map((c) => [c.name, c]));
      for (const nombreColumna of enBase.keys())
        if (!enEspejo.has(nombreColumna))
          diferencias.push(`${nombre}.${nombreColumna}: está en la base y falta en Drizzle`);
      for (const [nombreColumna, columna] of enEspejo) {
        const b = enBase.get(nombreColumna);
        if (!b) {
          diferencias.push(`${nombre}.${nombreColumna}: está en Drizzle y no en la base`);
          continue;
        }
        if (tipoBase(b) !== columna.getSQLType())
          diferencias.push(
            `${nombre}.${nombreColumna}: tipo ${tipoBase(b)} en la base, ${columna.getSQLType()} en Drizzle`,
          );
        if ((b.is_nullable === 'NO') !== columna.notNull)
          diferencias.push(
            `${nombre}.${nombreColumna}: ${b.is_nullable === 'NO' ? 'NOT NULL' : 'admite NULL'} en la base, al revés en Drizzle`,
          );
        const db1 = defaultBase(b.column_default);
        const dd = defaultDrizzle(columna);
        if (db1 !== dd)
          diferencias.push(
            `${nombre}.${nombreColumna}: DEFAULT ${db1 ?? '(ninguno)'} en la base, ${dd ?? '(ninguno)'} en Drizzle`,
          );
      }
    }
    expect(diferencias, diferencias.join('\n')).toEqual([]);
  });

  it('toda tabla de la base tiene espejo o está en la lista de tablas sin espejo', async () => {
    const tablas = await ex.consultar<{ t: string }>(
      `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
        WHERE table_schema IN ('public', 'geo') AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    const conEspejo = new Set(tablasDrizzle().map(nombreCompleto));
    const huerfanas = tablas
      .map((f) => f.t)
      .filter((t) => !conEspejo.has(t) && !TABLAS_SIN_ESPEJO.has(t));
    expect(huerfanas).toEqual([]);
  });

  it('cada enum del espejo tiene los mismos valores, en el mismo orden, que en la base', async () => {
    const enums = Object.values(esquema).filter((v) => isPgEnum(v)) as unknown as Array<{
      enumName: string;
      enumValues: string[];
    }>;
    expect(enums.length).toBeGreaterThan(0);
    for (const e of enums) {
      const filas = await ex.consultar<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 ORDER BY e.enumsortorder`,
        [e.enumName],
      );
      expect(
        filas.map((f) => f.enumlabel),
        e.enumName,
      ).toEqual([...e.enumValues]);
    }
  });
});
