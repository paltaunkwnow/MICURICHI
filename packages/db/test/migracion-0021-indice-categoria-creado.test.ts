/**
 * Migración 0021: índice parcial `(categoria, creado_en DESC) WHERE estado IN (públicos)`, junto al
 * GIST, para que el listado por categoría ordenado por `creado_en DESC` no recorra el heap por fecha
 * (medición M2.3, docs/sdd/2026-10-08-base-multicategoria/medicion.md §4–§6, opción (d)).
 *
 * Qué se comprueba (plan M3, CA2):
 *  - desde cero: el índice existe con la forma esperada (columnas, orden DESC y predicado parcial
 *    con los MISMOS literales de la 0015);
 *  - idempotencia: reejecutar el archivo a mano no falla y el migrador no la reaplica;
 *  - con datos sintéticos de varias categorías, el EXPLAIN del listado por categoría ordenado por
 *    `creado_en DESC` puede usar el índice (con `enable_seqscan = off`, como resolucion-id-corto).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import { aplicarMigraciones, DIRECTORIO_MIGRACIONES, listarMigraciones } from '../src/migrar.js';

const ARCHIVO_0021 = '0021_indice_categoria_creado.sql';
const numero = (f: string) => f.slice(0, 4);

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

const CATEGORIAS = ['inundacion', 'bache', 'area_verde', 'basura'] as const;
const PUBLICOS = ['nuevo', 'validado', 'resuelto'] as const;
const TODOS = ['nuevo', 'validado', 'resuelto', 'rechazado', 'duplicado'] as const;

/** Inserta reportes de las cuatro categorías, con estados y fechas repartidos, directo en `reporte`. */
async function sembrarVariasCategorias(ex: Ejecutor, porCategoria = 25) {
  for (const categoria of CATEGORIAS) {
    for (let i = 0; i < porCategoria; i++) {
      const estado = TODOS[i % TODOS.length]!;
      const motivo =
        estado === 'rechazado' || estado === 'duplicado' ? "'Motivo sintético'" : 'NULL';
      const dias = i % 30;
      if (categoria === 'inundacion') {
        await ex.consultar(
          `INSERT INTO reporte (geom, geom_publico, creado_en, publicar_en, distrito_id, unidad_vecinal_id,
             ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, causa_presunta,
             severidad_calculada, severidad_puntaje, severidad_version, estado, estado_motivo)
           VALUES (ST_SetSRID(ST_MakePoint($1,$2),4326), ST_SetSRID(ST_MakePoint(round($1::numeric,5)::float8, round($2::numeric,5)::float8),4326),
             now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval, 'd', 'u', 'gps', 'via_publica',
             'Sintético inundación', 'rodilla', 'ocasional', 'desconocida', 'media', 6, 2, $4::estado_reporte, ${motivo})`,
          [-63.2 + i * 0.0003, -17.8 + (i % 4) * 0.0003, String(dias), estado],
        );
      } else {
        await ex.consultar(
          `INSERT INTO reporte (geom, geom_publico, creado_en, publicar_en, categoria, detalle, detalle_version,
             causa_presunta, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
             severidad_calculada, severidad_puntaje, severidad_version, estado, estado_motivo)
           VALUES (ST_SetSRID(ST_MakePoint($1,$2),4326), ST_SetSRID(ST_MakePoint(round($1::numeric,5)::float8, round($2::numeric,5)::float8),4326),
             now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval, $5, '{"sintetico": true}'::jsonb, 1,
             NULL, 'd', 'u', 'gps', 'via_publica', 'Sintético otra categoría', 'media', 6, 1, $4::estado_reporte, ${motivo})`,
          [-63.2 + i * 0.0003, -17.8 + (i % 4) * 0.0003, String(dias), estado, categoria],
        );
      }
    }
  }
}

describe('migración 0021 desde cero', () => {
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

  it('existe un único 0021_*.sql y se llama 0021_indice_categoria_creado.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0021')).toEqual([ARCHIVO_0021]);
  });

  it('crea el índice parcial reporte_categoria_creado con la forma esperada', async () => {
    const [idx] = await ex.consultar<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='reporte_categoria_creado'`,
    );
    expect(idx, 'el índice reporte_categoria_creado debe existir').toBeDefined();
    const def = idx!.indexdef;
    // Sobre `reporte`, por (categoria, creado_en DESC), parcial con los tres estados públicos.
    expect(def).toMatch(/ON public\.reporte /);
    expect(def).toMatch(/\(categoria, creado_en DESC\)/);
    expect(def).toMatch(/WHERE \(estado = ANY/); // el predicado parcial quedó registrado
    for (const estado of PUBLICOS) expect(def).toContain(`'${estado}'`);
  });

  it('es idempotente: reejecutar el archivo a mano no falla y el migrador no la reaplica', async () => {
    const sql = readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0021), 'utf8');
    await expect(ex.transaccion((tx) => tx.ejecutar(sql))).resolves.toBeUndefined();
    const [idx] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='reporte_categoria_creado'`,
    );
    expect(idx!.n).toBe(1);
    const reaplicar = await aplicarMigraciones(ex);
    expect(reaplicar.aplicadas).not.toContain(ARCHIVO_0021);
    expect(reaplicar.omitidas).toContain(ARCHIVO_0021);
  });
});

describe('migración 0021: el EXPLAIN del listado por categoría puede usar el índice', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
    await sembrarVariasCategorias(ex);
    await ex.ejecutar('ANALYZE reporte');
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  async function planDe(sql: string): Promise<string> {
    const filas = await ex.consultar<Record<string, string>>(`EXPLAIN ${sql}`);
    return filas.map((f) => f['QUERY PLAN']).join('\n');
  }

  it('el listado por categoría ordenado por creado_en DESC usa reporte_categoria_creado', async () => {
    // Igual que resolucion-id-corto-indice: con enable_seqscan apagado el planificador tiene que
    // elegir un índice; si el listado por categoría puede resolverse por reporte_categoria_creado,
    // lo usa. El predicado y el ORDER BY son los de api-core (`visibilidad.ts` + listado público).
    await ex.ejecutar('SET enable_seqscan = off');
    const plan = await planDe(
      `SELECT id FROM reporte
       WHERE categoria = 'inundacion' AND estado IN ('nuevo', 'validado', 'resuelto') AND publicar_en <= now()
       ORDER BY creado_en DESC LIMIT 50`,
    );
    await ex.ejecutar('RESET enable_seqscan');
    expect(plan, plan).toContain('reporte_categoria_creado');
  });
});
