/**
 * Migración 0015 (T4): publicación sin moderación previa.
 *
 * Desde el contrato 0.11.0 un reporte `nuevo` se ve en el mapa público con «NO SE HA VERIFICADO»,
 * pero recién cuando pasa su demora: `publicar_en` lo fija api-core al crearlo (1 o 4 minutos
 * después) y la regla de visibilidad es un filtro, `publicar_en <= now()`, sin ningún proceso que
 * publique.
 *
 * Lo que se fija aquí:
 *  - el FRENO: los `nuevo` que ya existen se enviaron con la promesa de que un técnico los revisaba
 *    antes de publicarlos. La migración se niega a publicarlos de golpe salvo que se corra con
 *    `--publicar-nuevos-existentes` (SET LOCAL curichi.publicar_nuevos_existentes = 'si');
 *  - el relleno `publicar_en = creado_en` ANTES del NOT NULL y del CHECK, que con DEFAULT now()
 *    fallaba en toda fila de más de una hora;
 *  - los índices públicos, recreados con los tres estados públicos y `publicar_en` en el INCLUDE,
 *    y que la consulta real de api-core (parámetros y plan genérico) los sigue pudiendo usar;
 *  - los seeds sintéticos, que insertan reportes con fecha pasada.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';
import { sembrarSamples } from '../src/seeds/samples.js';
import { cargarCapasDePrueba } from '../src/test-utils.js';

const ARCHIVO_0015 = '0015_publicacion_sin_moderacion.sql';
const numero = (f: string) => f.slice(0, 4);
/** Estados públicos desde el contrato 0.11.0 (ESTADOS_PUBLICOS), como literal SQL. */
const LITERAL_PUBLICOS = `('nuevo', 'validado', 'resuelto')`;

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Un reporte con el esquema de 0014 (sin publicar_en), creado hace `hace`. */
async function insertarReporteViejo(ex: Ejecutor, estado: string, hace = '2 days') {
  const [r] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, geom_publico, creado_en, distrito_id, unidad_vecinal_id,
       ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
       severidad_calculada, severidad_puntaje, estado)
     VALUES (ST_SetSRID(ST_MakePoint(-63.1821, -17.7833), 4326),
       ST_SetSRID(ST_MakePoint(-63.1821, -17.7833), 4326), now() - $2::interval,
       'distrito_municipal:01', 'unidad_vecinal:A', 'gps', 'via_publica',
       'Reporte enviado antes de la migración 0015', 'rodilla', 'ocasional', 'media', 6,
       $1::estado_reporte)
     RETURNING id::text`,
    [estado, hace],
  );
  return r!.id;
}

const columnaPublicarEn = (ex: Ejecutor) =>
  ex.consultar<{ data_type: string; is_nullable: string; column_default: string | null }>(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'
        AND column_name = 'publicar_en'`,
  );

const registrada = async (ex: Ejecutor) =>
  (
    await ex.consultar<{ nombre: string }>('SELECT nombre FROM _migraciones WHERE nombre = $1', [
      ARCHIVO_0015,
    ])
  ).length === 1;

/** Índices públicos y restricción de publicar_en, para comparar bases entre sí. */
const estructura = async (ex: Ejecutor) => ({
  indices: await ex.consultar<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN ('reporte_geom_publico_gist', 'reporte_agregado_uv')
      ORDER BY indexname`,
  ),
  restricciones: await ex.consultar<{ conname: string; definicion: string; validada: boolean }>(
    `SELECT c.conname, pg_get_constraintdef(c.oid) AS definicion, c.convalidated AS validada
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = 'public.reporte_inundacion'::regclass AND c.contype = 'c'
        AND a.attname = 'publicar_en'`,
  ),
  columna: await columnaPublicarEn(ex),
});

let estructuraDesde0014: Awaited<ReturnType<typeof estructura>>;

describe('migración 0015 desde 0014, sin reportes en «nuevo»', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let hasta0014: ResultadoMigracion;
  let con0015: ResultadoMigracion;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    hasta0014 = await aplicarMigraciones(ex, { hasta: '0014' });
    for (const estado of ['validado', 'duplicado', 'rechazado', 'resuelto'])
      ids[estado] = await insertarReporteViejo(ex, estado);
    con0015 = await aplicarMigraciones(ex, { hasta: '0015' });
    estructuraDesde0014 = await estructura(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0015_*.sql y se llama 0015_publicacion_sin_moderacion.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0015')).toEqual([ARCHIVO_0015]);
  });

  it('hasta 0014 la dejó pendiente y sin «nuevo» se aplica sin bandera', () => {
    expect(hasta0014.pendientes).toContain(ARCHIVO_0015);
    expect(con0015.aplicadas).toEqual([ARCHIVO_0015]);
  });

  it('cada reporte anterior queda con publicar_en = creado_en, en todos los estados', async () => {
    const filas = await ex.consultar<{ estado: string; igual: boolean }>(
      // Orden del enum (el de la tabla), no el alfabético del texto.
      `SELECT r.estado::text AS estado, r.publicar_en = r.creado_en AS igual
         FROM reporte_inundacion r ORDER BY r.estado`,
    );
    expect(filas).toEqual([
      { estado: 'validado', igual: true },
      { estado: 'duplicado', igual: true },
      { estado: 'rechazado', igual: true },
      { estado: 'resuelto', igual: true },
    ]);
  });

  it('publicar_en es timestamptz NOT NULL con DEFAULT now()', () => {
    expect(estructuraDesde0014.columna).toEqual([
      { data_type: 'timestamp with time zone', is_nullable: 'NO', column_default: 'now()' },
    ]);
  });

  it('una sola restricción, validada: publicar_en entre creado_en y creado_en + 1 hora', () => {
    expect(estructuraDesde0014.restricciones).toHaveLength(1);
    const [c] = estructuraDesde0014.restricciones;
    expect(c!.conname).toBe('publicar_en_rango');
    expect(c!.validada).toBe(true);
    expect(c!.definicion).toMatch(/publicar_en >= creado_en/);
    expect(c!.definicion).toMatch(/publicar_en <= \(creado_en \+ '01:00:00'::interval\)/);
  });

  it('un INSERT que no nombra publicar_en (api-core anterior, durante el despliegue) sigue funcionando', async () => {
    const [r] = await ex.consultar<{ igual: boolean }>(
      `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
         ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
         severidad_puntaje)
       VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
         'unidad_vecinal:A', 'gps', 'via_publica', 'Insert del api-core anterior', 'rodilla',
         'ocasional', 'media', 6)
       RETURNING publicar_en = creado_en AS igual`,
    );
    // Los dos DEFAULT son now(), que dentro de una transacción es el mismo instante.
    expect(r).toEqual({ igual: true });
  });

  it('el CHECK acepta la demora de 60 y 240 s y 1 hora, y rechaza antes de creado_en o después de 1 hora (23514)', async () => {
    const insertar = (desplazamiento: string) =>
      ex.consultar(
        `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
           ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
           severidad_puntaje, creado_en, publicar_en)
         VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
           'unidad_vecinal:A', 'gps', 'via_publica', 'Demora de publicación', 'rodilla',
           'ocasional', 'media', 6, now(), now() + $1::interval)`,
        [desplazamiento],
      );
    for (const ok of ['0 seconds', '60 seconds', '240 seconds', '1 hour'])
      await expect(insertar(ok)).resolves.toBeDefined();
    for (const mal of ['-1 second', '1 hour 1 second'])
      await expect(insertar(mal)).rejects.toMatchObject({ code: '23514' });
  });

  it('recrea los dos índices públicos con nuevo, validado y resuelto y publicar_en en el INCLUDE', () => {
    const def = Object.fromEntries(
      estructuraDesde0014.indices.map((i) => [i.indexname, i.indexdef]),
    );
    expect(def.reporte_geom_publico_gist).toMatch(
      /USING gist \(geom_publico\) INCLUDE \(publicar_en\)/,
    );
    expect(def.reporte_agregado_uv).toMatch(
      /\(unidad_vecinal_id\) INCLUDE \(id, punto_critico_id, severidad_manual, severidad_calculada, estado, publicar_en\)/,
    );
    for (const d of Object.values(def)) {
      expect(d).toMatch(/'nuevo'::estado_reporte/);
      expect(d).toMatch(/'validado'::estado_reporte/);
      expect(d).toMatch(/'resuelto'::estado_reporte/);
      expect(d).not.toMatch(/rechazado|duplicado/);
    }
  });

  it('volver a migrar no aplica nada', async () => {
    const otra = await aplicarMigraciones(ex, { hasta: '0015' });
    expect(otra.aplicadas).toEqual([]);
  });
});

describe('migración 0015 con reportes en «nuevo»: el freno', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let nuevos: string[];
  let error: unknown;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex, { hasta: '0014' });
    nuevos = [await insertarReporteViejo(ex, 'nuevo'), await insertarReporteViejo(ex, 'nuevo')];
    await insertarReporteViejo(ex, 'validado');
    error = await aplicarMigraciones(ex, { hasta: '0015' }).then(
      () => null,
      (e: unknown) => e,
    );
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('sin la bandera aborta, dice cuántos son y cómo seguir', () => {
    expect(error).toBeInstanceOf(Error);
    const texto = (error as Error).message;
    expect(texto).toMatch(/0015_publicacion_sin_moderacion\.sql/);
    expect(texto).toMatch(/2 reportes? en estado «nuevo»/);
    expect(texto).toMatch(/--publicar-nuevos-existentes/);
    expect(texto).toMatch(/moder/i);
  });

  it('abortar no deja nada a medias: ni la columna ni el registro de la migración', async () => {
    expect(await columnaPublicarEn(ex)).toEqual([]);
    expect(await registrada(ex)).toBe(false);
    const [n] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM reporte_inundacion WHERE estado = 'nuevo'`,
    );
    expect(n!.n).toBe(2);
  });

  it('con la bandera pasa y los «nuevo» quedan publicados desde su creado_en', async () => {
    const r = await aplicarMigraciones(ex, { hasta: '0015', publicarNuevosExistentes: true });
    expect(r.aplicadas).toEqual([ARCHIVO_0015]);
    const filas = await ex.consultar<{ id: string; igual: boolean }>(
      `SELECT id::text, publicar_en = creado_en AS igual FROM reporte_inundacion
        WHERE estado = 'nuevo' ORDER BY id::text`,
    );
    expect(filas).toEqual([...nuevos].sort().map((id) => ({ id, igual: true })));
  });

  it('la bandera es SET LOCAL: no queda puesta en la sesión después de migrar', async () => {
    const [s] = await ex.consultar<{ v: string | null }>(
      `SELECT current_setting('curichi.publicar_nuevos_existentes', true) AS v`,
    );
    expect(s!.v ?? '').not.toBe('si');
  });

  it('volver a ejecutar el archivo a mano, ya con «nuevo» bajo la regla nueva, no frena ni cambia nada', async () => {
    const leer = () =>
      ex.consultar('SELECT id::text, publicar_en FROM reporte_inundacion ORDER BY id::text');
    const antes = await leer();
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0015), 'utf8')),
    );
    expect(await leer()).toStrictEqual(antes);
    expect(await estructura(ex)).toStrictEqual(estructuraDesde0014);
  });
});

describe('migración 0015 desde cero: índices públicos usables por las consultas reales', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;

  const plan = async (sql: string) =>
    (await ex.consultar<{ 'QUERY PLAN': string }>(sql)).map((f) => f['QUERY PLAN']).join('\n');

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    // Hasta la 0015: se compara con su estructura (la 0016 le quita el DEFAULT a publicar_en).
    await aplicarMigraciones(ex, { hasta: '0015' });
    await cargarCapasDePrueba(ex);
    // 4000 reportes repartidos en una grilla, en los cinco estados y en las tres UV de prueba.
    await ex.ejecutar(`
      INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id,
        ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
        severidad_calculada, severidad_puntaje, estado)
      SELECT g.p, g.p, 'distrito_municipal:01',
             (ARRAY['unidad_vecinal:A', 'unidad_vecinal:B', 'unidad_vecinal:C'])[1 + i % 3],
             'gps', 'via_publica', 'Reporte sintético para el plan', 'rodilla', 'ocasional',
             'media', 6,
             (ARRAY['nuevo', 'validado', 'duplicado', 'rechazado', 'resuelto']::estado_reporte[])[1 + i % 5]
        FROM generate_series(1, 4000) AS i,
             LATERAL (SELECT ST_SetSRID(ST_MakePoint(-63.2 + (i % 100) * 0.0003,
                                                     -17.8 + (i / 100) * 0.0005), 4326) AS p) AS g;
    `);
    // Aparte: VACUUM no puede ir en el bloque de varias sentencias, que PGlite corre en una
    // transacción implícita. Deja el mapa de visibilidad al día para el Index Only Scan.
    await ex.ejecutar('VACUUM ANALYZE reporte_inundacion');
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('deja los mismos índices, columna y restricción que la base migrada desde 0014', async () => {
    expect(await estructura(ex)).toStrictEqual(estructuraDesde0014);
  });

  it('la página del listado público por bbox usa reporte_geom_publico_gist con plan genérico', async () => {
    // La forma exacta de api-core (consultas.ts, condicionPublico): literal de estados, no ANY($n).
    await ex.ejecutar(`
      DEALLOCATE ALL;
      SET plan_cache_mode = force_generic_plan;
      PREPARE pagina_publica(float8, float8, float8, float8, int, int) AS
        SELECT r.id FROM reporte_inundacion r
         WHERE r.estado IN ${LITERAL_PUBLICOS} AND r.publicar_en <= now()
           AND r.geom_publico IS NOT NULL
           AND r.geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         ORDER BY r.creado_en DESC, r.id DESC LIMIT $5 OFFSET $6;
      PREPARE conteo_publico(float8, float8, float8, float8, int) AS
        SELECT count(*)::text AS n FROM (SELECT 1 FROM reporte_inundacion r
         WHERE r.estado IN ${LITERAL_PUBLICOS} AND r.publicar_en <= now()
           AND r.geom_publico IS NOT NULL
           AND r.geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326) LIMIT $5) t;
    `);
    try {
      const pagina = await plan(
        'EXPLAIN EXECUTE pagina_publica(-63.199, -17.799, -63.198, -17.798, 50, 0)',
      );
      expect(pagina, pagina).toMatch(/\$1/); // es el plan genérico, con los parámetros sin valor
      expect(pagina, pagina).toMatch(/reporte_geom_publico_gist/);
      const conteo = await plan(
        'EXPLAIN EXECUTE conteo_publico(-63.199, -17.799, -63.198, -17.798, 10001)',
      );
      expect(conteo, conteo).toMatch(/reporte_geom_publico_gist/);
    } finally {
      await ex.ejecutar('DEALLOCATE ALL; RESET plan_cache_mode;');
    }
  });

  it('con ANY($n) en lugar del literal, el plan genérico ya no puede usar el índice parcial', async () => {
    // Por esto api-core arma el literal desde ESTADOS_PUBLICOS: con un parámetro, PostgreSQL no
    // puede demostrar que la condición implica el predicado del índice.
    await ex.ejecutar(`
      DEALLOCATE ALL;
      SET plan_cache_mode = force_generic_plan;
      PREPARE con_any(float8, float8, float8, float8, estado_reporte[]) AS
        SELECT r.id FROM reporte_inundacion r
         WHERE r.estado = ANY($5) AND r.publicar_en <= now() AND r.geom_publico IS NOT NULL
           AND r.geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326);
    `);
    try {
      const p = await plan(
        `EXPLAIN EXECUTE con_any(-63.199, -17.799, -63.198, -17.798, '{nuevo,validado,resuelto}')`,
      );
      expect(p, p).not.toMatch(/reporte_geom_publico_gist/);
    } finally {
      await ex.ejecutar('DEALLOCATE ALL; RESET plan_cache_mode;');
    }
  });

  it('el agregado por UV, con verificados aparte, sigue siendo Index Only Scan sobre reporte_agregado_uv', async () => {
    await ex.ejecutar('SET enable_seqscan = off; SET enable_bitmapscan = off;');
    try {
      const p = await plan(`EXPLAIN
        SELECT u.id AS unidad_vecinal_id,
               count(r.id)::int AS n_reportes,
               count(r.id) FILTER (WHERE r.estado IN ('validado', 'resuelto'))::int AS n_verificados,
               count(DISTINCT r.punto_critico_id)::int AS n_puntos_criticos,
               max(CASE COALESCE(r.severidad_manual, r.severidad_calculada)
                     WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 WHEN 'baja' THEN 1 END)
                 AS severidad_max,
               max(CASE COALESCE(r.severidad_manual, r.severidad_calculada)
                     WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 WHEN 'baja' THEN 1 END)
                 FILTER (WHERE r.estado IN ('validado', 'resuelto')) AS severidad_max_verificada
          FROM geo.unidad_vecinal_vigente u
          LEFT JOIN reporte_inundacion r
            ON r.unidad_vecinal_id = u.id AND r.estado IN ${LITERAL_PUBLICOS} AND r.publicar_en <= now()
         GROUP BY u.id`);
      expect(p, p).toMatch(/Index Only Scan using reporte_agregado_uv/);
    } finally {
      await ex.ejecutar('RESET enable_seqscan; RESET enable_bitmapscan;');
    }
  });
});

describe('seeds sintéticos con la 0015', () => {
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

  it('siembran reportes con fecha pasada y publicar_en = creado_en, en todos sus estados', async () => {
    const r = await sembrarSamples(ex, {
      passwordAdmin: 'admin-de-prueba-0015',
      passwordTecnico: 'tecnico-de-prueba-0015',
      passwordVecina: 'vecina-de-prueba-0015',
      passwordEjecutivo: 'ejecutivo-de-prueba-0015',
    });
    expect(r.reportes).toBeGreaterThan(0);
    const filas = await ex.consultar<{ estado: string; n: number; distintos: number }>(
      `SELECT estado::text, count(*)::int AS n,
              count(*) FILTER (WHERE publicar_en <> creado_en)::int AS distintos
         FROM reporte_inundacion WHERE descripcion LIKE '%[muestra sintética]%'
        GROUP BY estado ORDER BY estado`,
    );
    expect(filas.map((f) => f.estado)).toContain('nuevo');
    for (const f of filas) expect(f.distintos, f.estado).toBe(0);
  });
});

describe('esquema Drizzle de publicar_en', () => {
  it('declara publicar_en como timestamptz NOT NULL y, desde la 0016, sin DEFAULT', () => {
    const c = getTableColumns(esquema.reporteInundacion) as Record<
      string,
      { name: string; notNull: boolean; hasDefault: boolean; getSQLType(): string }
    >;
    const columna = Object.values(c).find((x) => x.name === 'publicar_en');
    expect(columna?.getSQLType()).toBe('timestamp with time zone');
    expect(columna?.notNull).toBe(true);
    expect(columna?.hasDefault).toBe(false);
  });
});
