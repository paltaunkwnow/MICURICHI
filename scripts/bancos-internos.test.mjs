import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

// Todo el SQL se ejecuta exclusivamente en memoria. Incluso un operador añadido por error falla.
net.Socket.prototype.connect = () => {
  throw new Error('OPERADOR_REAL_BLOQUEADO');
};
syncBuiltinESMExports();
const root = resolve(import.meta.dirname, '..');
const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const { postgis } = require('@electric-sql/pglite-postgis');
const fuente = (p) => readFileSync(resolve(root, p), 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const categorias = ['inundacion', 'bache', 'basura', 'area_verde'];
const marca = '[sintético banco-datos]';
const osEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(SystemRoot|WINDIR|COMSPEC|PATH|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(
        k,
      ),
    ),
  );

async function banco(nombre) {
  assert.match(
    fuente(`scripts/banco-${nombre}.mjs`),
    /export (?:async )?function/,
    'el banco debe ofrecer builders importables sin operar',
  );
  return import(`./banco-${nombre}.mjs`);
}

function doble(responder = () => ({ rows: [], rowCount: 0 })) {
  const llamadas = [];
  let cerrado = 0;
  const pool = {
    async query(sql, params = []) {
      llamadas.push({ sql, params });
      return responder(sql, params);
    },
    async connect() {
      return {
        query: pool.query,
        release() {
          llamadas.push({ release: true });
        },
      };
    },
    async end() {
      cerrado++;
    },
  };
  return { pool, llamadas, cerrado: () => cerrado };
}

async function capturarDatos(accion, argumento = '12', correlacionado = false) {
  const m = await banco('datos');
  const d = doble((sql) => ({
    rows: [{}],
    rowCount: /FROM geo.unidad_vecinal u/.test(sql) ? 1 : 0,
  }));
  const api = m.crearBancoDatos(d.pool, correlacionado);
  await api[accion](Number(argumento));
  return d.llamadas.filter((c) => c.sql);
}

async function consultas() {
  const m = await banco('consultas');
  const d = doble((sql) => ({
    rows: [sql.includes('array_agg(id)') ? { ids: [] } : { lon: -63.17, lat: -17.78 }],
  }));
  return m.crearConsultas(d.pool);
}

const normal = (sql) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const comparables = (rows) => rows.map((r) => JSON.stringify(r)).sort();
function equivalente(actual, anterior) {
  assert.ok(!actual.some((r) => r['mediana ms'] === 'ERROR'), 'ERROR nunca demuestra equivalencia');
  assert.deepEqual(comparables(actual), comparables(anterior));
}

for (const nombre of ['datos', 'consultas']) {
  test(`${nombre}: importar sin URL o en producción no opera ni termina el proceso`, () => {
    const codigo = `
      import { createRequire, syncBuiltinESMExports } from 'node:module';
      import net from 'node:net';
      const require = createRequire(${JSON.stringify(pathToFileURL(resolve(root, 'packages/db/package.json')).href)});
      const pg = require('pg');
      pg.Pool = class { constructor() { throw Error('POOL_BLOQUEADO'); } };
      net.Socket.prototype.connect = () => { throw Error('RED_BLOQUEADA'); };
      syncBuiltinESMExports();
      process.exit = () => { throw Error('EXIT_INESPERADO'); };
      await import(${JSON.stringify(pathToFileURL(resolve(root, `scripts/banco-${nombre}.mjs`)).href)});
      console.log('IMPORT_SEGURO');`;
    for (const NODE_ENV of ['test', 'production']) {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
        cwd: root,
        env: {
          ...osEnv(),
          NODE_ENV,
          ...(NODE_ENV === 'production' ? { DATABASE_URL: 'ficticia' } : {}),
        },
        encoding: 'utf8',
        timeout: 15000,
      });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), 'IMPORT_SEGURO');
    }
  });

  test(`${nombre}: guardas CLI con fábrica bloqueada, sin ejecutar CLI real`, async () => {
    const m = await banco(nombre);
    let n = 0;
    const crearPool = () => {
      n++;
      throw Error('POOL_BLOQUEADO');
    };
    for (const env of [
      { NODE_ENV: 'production', DATABASE_URL: 'ficticia' },
      { NODE_ENV: 'test' },
    ]) {
      assert.equal(await m.ejecutarCli({ env, argv: [], crearPool }), 1);
    }
    assert.equal(n, 0);
  });
}

test('generador: misma sentencia, parámetros, distribución y publicación que F0; categoría explícita', async () => {
  for (const flag of [false, true]) {
    const calls = await capturarDatos('generar', '12', flag);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO'));
    assert.match(insert.sql, /INSERT INTO reporte\s*\(\s*categoria,/);
    assert.match(insert.sql, /SELECT\s*'inundacion',/);
    const previo = F0.datos.generar.find((c) => c.sql.includes('INSERT INTO')).sql;
    assert.equal(
      normal(insert.sql.slice(0, insert.sql.indexOf('INSERT INTO'))),
      normal(previo.slice(0, previo.indexOf('INSERT INTO'))),
    );
    assert.equal(
      normal(insert.sql.slice(insert.sql.indexOf('-- Severidad v2'))),
      normal(previo.slice(previo.indexOf('-- Severidad v2'))),
    );
    assert.match(insert.sql, /detalle, detalle_version/);
    assert.match(insert.sql, /jsonb_build_object/);
    assert.doesNotMatch(insert.sql, /::(?:profundidad_estimada|frecuencia|causa_presunta)\b/);
    assert.deepEqual(insert.params, [12, marca, flag]);
    assert.ok(calls.some((c) => c.sql === 'ANALYZE reporte'));
    assert.ok(calls.some((c) => c.sql === 'ANALYZE punto_critico'));
    assert.ok(!calls.some((c) => /(?:ANALYZE|VACUUM).*reporte_inundacion/.test(c.sql)));
  }
});

test('generador: lotes de 20000 y resto, defaults CLI y cierre de pool', async () => {
  const calls = await capturarDatos('generar', '20003');
  assert.deepEqual(
    calls.filter((c) => c.sql.includes('INSERT INTO')).map((c) => c.params[0]),
    [20000, 3],
  );
  const { ejecutarCli } = await banco('datos');
  const d = doble((sql) => ({
    rows: [{}],
    rowCount: sql.includes('FROM geo.unidad_vecinal u') ? 1 : 0,
  }));
  assert.equal(
    await ejecutarCli({
      env: { DATABASE_URL: 'ficticia' },
      argv: ['generar'],
      crearPool: () => d.pool,
    }),
    0,
  );
  assert.equal(d.llamadas.find((c) => c.sql?.includes('INSERT INTO')).params[0], 10000);
  assert.equal(d.cerrado(), 1);
});

test('consultas: mantiene diez nombres, parámetros, joins vigentes, estados y límites históricos', async () => {
  const actual = await consultas();
  assert.equal(actual.length, 10);
  assert.deepEqual(
    actual.map((c) => c.params),
    F0.consultas.map((c) => c.params),
  );
  assert.deepEqual(
    actual.map((c) => c.nombre),
    F0.consultas.map((c) => c.nombre),
  );
  const { PUBLICO, SELECT_REPORTE } = await banco('consultas');
  assert.match(PUBLICO, /validado.*resuelto/);
  assert.doesNotMatch(PUBLICO, /publicar_en|'nuevo'/);
  assert.match(SELECT_REPORTE, /LEFT JOIN geo.unidad_vecinal_vigente/);
  assert.match(SELECT_REPORTE, /LEFT JOIN geo.distrito_municipal_vigente/);
  for (const [i, a] of actual.entries()) {
    assert.deepEqual(
      [...a.sql.matchAll(/\b(?:LIMIT|OFFSET) \d+/g)].map((m) => m[0]),
      [...F0.consultas[i].sql.matchAll(/\b(?:LIMIT|OFFSET) \d+/g)].map((m) => m[0]),
    );
  }
  assert.equal(normal(actual[6].sql), normal(F0.consultas[6].sql), 'PC por bbox sigue global');
  assert.match(fuente('scripts/banco-consultas.mjs'), /históric/i);
  assert.match(fuente('scripts/banco-datos.mjs'), /todas las categorías/);
});

test('errores: ERROR no es equivalencia; el manejo histórico por consulta y cierre se conserva', async () => {
  assert.throws(
    () => equivalente([{ 'mediana ms': 'ERROR' }], [{ 'mediana ms': 'ERROR' }]),
    /ERROR/,
  );
  const m = await banco('consultas');
  const d = doble((sql) => {
    if (sql.startsWith('EXPLAIN')) throw Error('fallo sintético por consulta');
    return {
      rows: [sql.includes('array_agg(id)') ? { ids: [] } : { lon: -63.17, lat: -17.78, n: 0 }],
    };
  });
  const filas = await m.ejecutarBancoConsultas(d.pool, 1);
  assert.equal(filas.length, 10);
  assert.ok(filas.every((r) => r['mediana ms'] === 'ERROR'));
  assert.throws(() => equivalente(filas, filas), /ERROR/);
  // El CLI de este banco históricamente imprime ERROR y termina sin cambiar exit.
  assert.equal(
    await m.ejecutarCli({
      env: { DATABASE_URL: 'ficticia', REPETICIONES: '1' },
      crearPool: () => d.pool,
    }),
    0,
  );
  assert.equal(d.cerrado(), 1);
});

test('simuladores: métricas EXPLAIN exitosas, total filtrado y error del generador con release/cierre', async () => {
  const m = await banco('consultas');
  const d = doble((sql) => {
    if (sql.startsWith('EXPLAIN'))
      return {
        rows: [
          {
            'QUERY PLAN': [
              {
                'Execution Time': 2.345,
                Plan: {
                  'Node Type': 'Seq Scan',
                  'Relation Name': 'reporte',
                  'Actual Rows': 2,
                  'Shared Hit Blocks': 3,
                  'Shared Read Blocks': 4,
                  Plans: [{ 'Node Type': 'Index Scan', 'Index Name': 'indice_ficticio' }],
                },
              },
            ],
          },
        ],
      };
    return {
      rows: [sql.includes('array_agg(id)') ? { ids: [] } : { lon: -63.17, lat: -17.78, n: 2 }],
    };
  });
  const filas = await m.ejecutarBancoConsultas(d.pool, 3);
  assert.equal(filas.length, 10);
  assert.ok(
    filas.every(
      (r) =>
        r['mediana ms'] === 2.35 &&
        r['peor ms'] === 2.35 &&
        r['bloques leídos'] === 7 &&
        r['escaneo secuencial'] === 'reporte (2 filas)' &&
        r.índices === 'indice_ficticio',
    ),
  );
  assert.equal(d.llamadas.filter((c) => c.sql?.startsWith('EXPLAIN')).length, 30);
  const total = d.llamadas.find((c) => c.sql?.startsWith('SELECT count(*)::int AS n FROM reporte'));
  assert.match(total.sql, /categoria = 'inundacion'/);
  const datos = await banco('datos');
  const fallo = doble(() => ({ rows: [], rowCount: 0 }));
  assert.equal(
    await datos.ejecutarCli({
      env: { DATABASE_URL: 'ficticia' },
      argv: ['generar', '5'],
      crearPool: () => fallo.pool,
    }),
    1,
  );
  assert.equal(fallo.cerrado(), 1);
  assert.equal(fallo.llamadas.filter((c) => c.release).length, 1);
});

let db;
async function crearFixture(hasta = '9999') {
  const db = await PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
  try {
    // CI aislado no construye db. Cargar todos los SQL vigentes en memoria, sin dist ni tsx.
    await db.exec(
      'CREATE TABLE _migraciones(nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())',
    );
    const migraciones = readdirSync(resolve(root, 'packages/db/migraciones'))
      .filter((nombre) => /^\d{4}_.+\.sql$/.test(nombre) && nombre.slice(0, 4) <= hasta)
      .sort();
    for (const nombre of migraciones) {
      await db.exec('BEGIN');
      if (nombre === '0022_contraccion_compatible.sql') {
        await db.exec("SET LOCAL curichi.autorizar_contraccion_compatible='si'");
        await db.query(
          "SELECT set_config('curichi.autorizar_contraccion_compatible_tx', txid_current()::text, true)",
        );
      }
      await db.exec(fuente(`packages/db/migraciones/${nombre}`));
      await db.query('INSERT INTO _migraciones(nombre) VALUES ($1)', [nombre]);
      await db.exec('COMMIT');
    }
    // Solo capas ficticias; IDs de las tuplas manuales, polígonos sintéticos y sin raw municipal.
    await db.exec(`INSERT INTO usuario (id,email,nombre,rol,password_hash) VALUES
    ('12f435be-5854-41bd-876c-a3ab833247b3','fixture@invalid.test','Validador ficticio','tecnico','inutil');`);
    const distritos = [...new Set(F0.manual.match(/distrito_municipal:[^']+/g))];
    const uvs = [
      ...new Set(F0.manual.match(/unidad_vecinal:[^']+/g)),
      'unidad_vecinal:vacia',
      'unidad_vecinal:otras',
    ];
    for (const capa of ['distrito_municipal', 'unidad_vecinal']) {
      await db.query('INSERT INTO geo.capa_version (capa,version,vigente) VALUES ($1,$2,true)', [
        capa,
        'DM_UV_MZ_2025',
      ]);
    }
    for (const id of distritos) {
      await db.query(
        `INSERT INTO geo.distrito_municipal (id,codigo,nombre,geom,version_capa)
      VALUES ($1,$1,$1,ST_Multi(ST_MakeEnvelope(-63.22,-17.90,-63.10,-17.71,4326)),'DM_UV_MZ_2025')`,
        [id],
      );
    }
    for (const id of uvs) {
      await db.query(
        `INSERT INTO geo.unidad_vecinal (id,codigo,nombre,geom,version_capa,distrito_id)
      VALUES ($1,$1,$1,ST_Multi(ST_MakeEnvelope(-63.18,-17.79,-63.16,-17.77,4326)),
      'DM_UV_MZ_2025','distrito_municipal:1')`,
        [id],
      );
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
before(
  async () => {
    db = await crearFixture();
  },
  { timeout: 120000 },
);
after(async () => {
  await db?.close();
});

async function transaccion(fn) {
  await db.exec('BEGIN');
  try {
    return await fn();
  } finally {
    await db.exec('ROLLBACK');
  }
}
const poolMemoria = { query: (sql, params = []) => db.query(sql, params) };
async function conEspejo21(accion) {
  const previo = await crearFixture('0021');
  try {
    // El literal F0 conserva su tabla/vista y planos reales21. Copiar valores, IDs y fechas
    // de la fixture22 permite comparar sin reescribir la consulta histórica ni sus límites.
    for (const tabla of ['punto_critico', 'reporte', 'reporte_foto']) {
      const tieneGeom = tabla !== 'reporte_foto';
      const filas = (
        await db.query(
          `SELECT to_jsonb(r)${tieneGeom ? " || jsonb_build_object('geom',ST_AsEWKT(geom),'geom_publico',ST_AsEWKT(geom_publico))" : ''} AS fila FROM ${tabla} r`,
        )
      ).rows.map((r) => r.fila);
      if (tabla === 'reporte')
        for (const fila of filas)
          for (const campo of planosHistoricos)
            fila[campo] = fila.categoria === 'inundacion' ? (fila.detalle[campo] ?? null) : null;
      if (!filas.length) continue;
      const columnas = (
        await previo.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
          [tabla],
        )
      ).rows.map((r) => r.column_name);
      await previo.query(
        `INSERT INTO ${tabla} (${columnas.join(',')}) SELECT ${columnas.map((c) => `x.${c}`).join(',')} FROM jsonb_populate_recordset(NULL::${tabla},$1::jsonb) x`,
        [JSON.stringify(filas)],
      );
      assert.equal(
        (await previo.query(`SELECT count(*)::int AS n FROM ${tabla}`)).rows[0].n,
        filas.length,
      );
    }
    return await accion(previo);
  } finally {
    await previo.close();
  }
}
async function insertar(categoria = 'inundacion', extras = {}) {
  const detalle =
    categoria === 'inundacion'
      ? Object.fromEntries(
          Object.entries({
            profundidad_estimada: 'rodilla',
            frecuencia: 'ocasional',
            causa_presunta: 'desconocida',
            sumidero_cercano: extras.cercano,
            sumidero_estado: extras.estadoSumidero,
            agua_brota_sumidero: extras.brota,
          }).filter(([, valor]) => valor !== null && valor !== undefined),
        )
      : (extras.detalle ?? {});
  const r = await db.query(
    `INSERT INTO reporte (categoria, geom, geom_publico, descripcion,
    distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
    detalle, detalle_version, severidad_calculada,severidad_puntaje,severidad_version,estado,estado_motivo,creado_en,publicar_en)
    VALUES ($1, ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),
    CASE WHEN $2 THEN ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326) END, $3,
    'distrito_municipal:1',$4,'manual','via_publica',
    $5::jsonb,1,'media',6,2,$6::estado_reporte,
    CASE WHEN $6 IN ('rechazado','duplicado') THEN 'motivo ficticio' END,
    now(),now()+($7||' minutes')::interval) RETURNING id::text`,
    [
      categoria,
      extras.publico ?? true,
      extras.descripcion ?? `${marca} ficticio`,
      extras.uv ?? 'unidad_vecinal:30',
      JSON.stringify(detalle),
      extras.estado ?? 'validado',
      extras.demora ?? 0,
    ],
  );
  return r.rows[0].id;
}
async function punto(categoria) {
  const r = await db.query(
    `INSERT INTO punto_critico (categoria,geom,geom_publico,n_reportes,
    primer_reporte_en,ultimo_reporte_en,severidad_max,radio_m)
    VALUES ($1,ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),
    2,now(),now(),'media',25) RETURNING id::text`,
    [categoria],
  );
  return r.rows[0].id;
}

const planosHistoricos = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
];
const sinPlanosHistoricos = (rows) =>
  rows.map(({ fila }) => ({
    fila: Object.fromEntries(
      Object.entries(fila).filter(([key]) => !planosHistoricos.includes(key)),
    ),
  }));
function fechasRelativas(rows) {
  const ancla = new Date(rows[0].fila.creado_en).getTime();
  for (const { fila } of rows)
    for (const key of ['creado_en', 'actualizado_en', 'publicar_en', 'evento_en', 'validado_en'])
      if (fila[key]) fila[key] = new Date(fila[key]).getTime() - ancla;
  return rows;
}
test('SQL literal manual: mismas 30 tuplas de F0, transacción, fechas, geometrías y JSON del trigger vigente', async () => {
  const sql = fuente('scripts/sembrar-30-puntos.sql');
  assert.equal(hash(F0.manual), F0.shaManual);
  assert.match(sql, /INSERT INTO reporte\s*\(\s*categoria,/);
  const valores = sql.match(/\) AS \(VALUES\n([\s\S]*?)\n\)\nINSERT INTO/)[1];
  const valoresF0 = F0.manual.match(/\) VALUES\n([\s\S]*?);\s*COMMIT;/)[1];
  const reverted = valores.replace(/\(\s*'inundacion',\s*(ST_SetSRID)/g, '(\n    $1');
  assert.equal(normal(reverted), normal(valoresF0));
  const previo = await crearFixture('0021');
  try {
    const snapshot = `SELECT to_jsonb(r)-'id' AS fila FROM reporte r ORDER BY descripcion`;
    // Ejecutar ambos literales completos (BEGIN/COMMIT incluidos), solo en esta memoria propia.
    const ejecutar = async (literal, motor = db) => {
      assert.match(literal, /^BEGIN;/);
      assert.match(literal, /COMMIT;\s*$/);
      await motor.exec(literal);
      const rows = (await motor.query(snapshot)).rows;
      // Cada literal tiene su propio now(): comparar todos los desplazamientos temporales exactos.
      await motor.exec('DELETE FROM reporte');
      return fechasRelativas(rows);
    };
    const anterior = await ejecutar(F0.manual, previo);
    const actual = await ejecutar(sql);
    assert.equal(actual.length, 30);
    equivalente(actual, sinPlanosHistoricos(anterior));
    for (const { fila } of actual) {
      assert.equal(fila.categoria, 'inundacion');
      assert.equal(fila.detalle_version, 1);
      for (const key of [
        'profundidad_estimada',
        'frecuencia',
        'causa_presunta',
        'sumidero_cercano',
        'sumidero_estado',
        'agua_brota_sumidero',
      ]) {
        const original = anterior.find((r) => r.fila.descripcion === fila.descripcion).fila;
        assert.equal(fila.detalle[key] ?? null, original[key]);
        assert.ok(!Object.hasOwn(fila, key));
      }
    }
  } finally {
    await previo.close();
  }
});

test('SQL generador literal: volumen ficticio, JSON coherente, geometría, proporciones y tiempo F0', async () => {
  const insert = (await capturarDatos('generar', '100')).find((c) => c.sql.includes('INSERT INTO'));
  const previo = await crearFixture('0021');
  try {
    await previo.exec('BEGIN');
    await transaccion(async () => {
      // PostGIS tiene RNG propio. El wrapper solo de fixture llama su implementación REAL con semilla.
      // El SQL del banco y el SQL F0 se ejecutan literalmente, sin modificar sus algoritmos.
      const puntosDeterministas = `CREATE SCHEMA fixture_p5;
      CREATE FUNCTION fixture_p5.st_generatepoints(g geometry,n integer) RETURNS geometry
      LANGUAGE sql AS 'SELECT public.ST_GeneratePoints(g,n,12345)';
      SET LOCAL search_path = fixture_p5, public;`;
      await db.exec(puntosDeterministas);
      await previo.exec(puntosDeterministas);
      for (const flag of [false, true]) {
        const ejecutar = async (sql, motor = db) => {
          await motor.exec('SAVEPOINT generador');
          await motor.query(sql, [100, marca, flag]);
          const r = await motor.query(
            `SELECT to_jsonb(r)-'id' AS fila FROM reporte r ORDER BY descripcion`,
          );
          await motor.exec('ROLLBACK TO SAVEPOINT generador');
          return fechasRelativas(r.rows);
        };
        const anterior = await ejecutar(
          F0.datos.generar.find((c) => c.sql.includes('INSERT INTO')).sql,
          previo,
        );
        const actual = await ejecutar(insert.sql);
        assert.equal(actual.length, 100);
        equivalente(actual, sinPlanosHistoricos(anterior));
        assert.equal(
          actual.filter(({ fila }) => fila.estado === 'nuevo').length,
          actual.filter(({ fila }) => fila.severidad_calculada === 'baja').length,
        );
        assert.ok(
          actual.every(
            ({ fila }) =>
              fila.creado_en === fila.publicar_en &&
              fila.categoria === 'inundacion' &&
              fila.detalle_version === 1,
          ),
        );
        for (const { fila } of actual) {
          for (const key of ['profundidad_estimada', 'frecuencia', 'causa_presunta']) {
            const original = anterior.find((r) => r.fila.descripcion === fila.descripcion).fila;
            assert.equal(fila.detalle[key], original[key]);
            assert.ok(!Object.hasOwn(fila, key));
          }
          assert.deepEqual(
            fila.geom_publico?.coordinates ?? null,
            fila.geom_publico === null
              ? null
              : fila.geom.coordinates.map((n) => Number(n.toFixed(5))),
          );
          assert.ok(fila.geom.coordinates[0] >= -63.18 && fila.geom.coordinates[0] <= -63.16);
          assert.ok(fila.geom.coordinates[1] >= -17.79 && fila.geom.coordinates[1] <= -17.77);
        }
      }
    });
  } finally {
    await previo.close();
  }
});

test('SQL limpieza: marca/IDs/fotos/PC de otras tres categorías e inundación sin marca sobreviven', async () => {
  const calls = await capturarDatos('limpiar');
  const deletes = calls.filter((c) => /DELETE FROM/.test(c.sql));
  assert.equal(deletes.length, 2);
  assert.match(deletes[0].sql, /categoria\s*=\s*'inundacion'/);
  assert.match(deletes[1].sql, /p\.categoria\s*=\s*'inundacion'/);
  assert.match(deletes[1].sql, /FROM reporte r/);
  assert.ok(calls.some((c) => c.sql === 'VACUUM ANALYZE reporte'));
  await transaccion(async () => {
    const protegidos = [];
    for (const cat of categorias) {
      const id = await insertar(
        cat,
        cat === 'inundacion' ? { descripcion: 'Inundación sin marca de banco' } : {},
      );
      const pc = await punto(cat);
      await db.query('UPDATE reporte SET punto_critico_id=$1 WHERE id=$2', [pc, id]);
      await db.query(
        `INSERT INTO reporte_foto (reporte_id,objeto_key,mime,bytes,ancho,alto,exif_sanitizado)
        VALUES ($1,$2,'image/webp',100,10,10,true)`,
        [id, `${id}.webp`],
      );
      protegidos.push(id);
    }
    const borrar = await insertar();
    const pcBorrar = await punto('inundacion');
    await db.query('UPDATE reporte SET punto_critico_id=$1 WHERE id=$2', [pcBorrar, borrar]);
    const vacioAjeno = await punto('bache');
    // Miembro de otra categoría: el NOT EXISTS debe consultar la tabla completa.
    const pcConMiembroAjeno = await punto('inundacion');
    const miembroAjeno = await insertar('area_verde');
    await db.query('UPDATE reporte SET punto_critico_id=$1 WHERE id=$2', [
      pcConMiembroAjeno,
      miembroAjeno,
    ]);
    const antes = (
      await db.query(
        'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id=ANY($1::uuid[]) ORDER BY id',
        [protegidos],
      )
    ).rows;
    const fotosAntes = (await db.query('SELECT * FROM reporte_foto ORDER BY id')).rows;
    for (const c of deletes) await db.query(c.sql, c.params);
    equivalente(
      (
        await db.query(
          'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id=ANY($1::uuid[]) ORDER BY id',
          [protegidos],
        )
      ).rows,
      antes,
    );
    equivalente((await db.query('SELECT * FROM reporte_foto ORDER BY id')).rows, fotosAntes);
    assert.equal((await db.query('SELECT id FROM reporte WHERE id=$1', [borrar])).rows.length, 0);
    assert.equal(
      (await db.query('SELECT id FROM punto_critico WHERE id=$1', [pcBorrar])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('SELECT id FROM punto_critico WHERE id=$1', [vacioAjeno])).rows.length,
      1,
    );
    assert.equal(
      (await db.query('SELECT id FROM punto_critico WHERE id=$1', [pcConMiembroAjeno])).rows.length,
      1,
    );
    assert.equal(
      (await db.query('SELECT punto_critico_id FROM reporte WHERE id=$1', [miembroAjeno])).rows[0]
        .punto_critico_id,
      pcConMiembroAjeno,
    );
  });
});

test('SQL consultas: equivalencia F0 de las diez consultas con otras categorías presentes', async () => {
  await transaccion(async () => {
    for (const cat of categorias) {
      for (const estado of ['nuevo', 'validado', 'resuelto', 'rechazado', 'duplicado'])
        await insertar(cat, { estado, publico: estado !== 'rechazado', uv: 'unidad_vecinal:0' });
      const pc = await punto(cat);
      await db.query('UPDATE reporte SET punto_critico_id=$1 WHERE categoria=$2', [pc, cat]);
    }
    const actual = await (await banco('consultas')).crearConsultas(poolMemoria);
    await conEspejo21(async (previo) => {
      for (let i = 0; i < actual.length; i++) {
        const a = actual[i],
          b = F0.consultas[i];
        // Las semillas de los dos listados se consultan sobre la misma fixture (UUID variable).
        const params = i === 8 ? a.params : b.params;
        equivalente((await db.query(a.sql, params)).rows, (await previo.query(b.sql, params)).rows);
      }
    });
    assert.equal((await db.query(actual[4].sql)).rows.length, 5, 'técnico positivo, solo flood');
  });
});

test('SQL alias JSON: strings, NULL/ausencia y false booleano; JSON es fuente de los seis alias', async () => {
  const { SELECT_REPORTE } = await banco('consultas');
  await transaccion(async () => {
    for (const brota of [null, false, true]) {
      const id = await insertar('inundacion', {
        brota,
        cercano: brota === null ? null : 'si',
        estadoSumidero: brota === null ? null : 'tapado',
      });
      const [r] = (await db.query(`${SELECT_REPORTE} WHERE r.id=$1`, [id])).rows;
      assert.equal(r.profundidad_estimada, 'rodilla');
      assert.equal(r.frecuencia, 'ocasional');
      assert.equal(r.causa_presunta, 'desconocida');
      assert.equal(r.sumidero_cercano, brota === null ? null : 'si');
      assert.equal(r.sumidero_estado, brota === null ? null : 'tapado');
      assert.equal(r.agua_brota_sumidero, brota);
    }
    const alias = [
      'profundidad_estimada',
      'frecuencia',
      'causa_presunta',
      'sumidero_cercano',
      'sumidero_estado',
      'agua_brota_sumidero',
    ];
    for (const key of alias) assert.match(SELECT_REPORTE, new RegExp(`detalle->>'${key}'`));
    const id = await insertar('inundacion');
    // Esquema22 real: sin trigger/planos. La lectura conserva los mismos seis alias.
    await db.query('UPDATE reporte SET detalle=$1 WHERE id=$2', [
      JSON.stringify({
        profundidad_estimada: 'muslo',
        frecuencia: 'permanente',
        causa_presunta: 'falta_sumidero',
        sumidero_cercano: 'no',
        agua_brota_sumidero: false,
      }),
      id,
    ]);
    const [r] = (await db.query(`${SELECT_REPORTE} WHERE r.id=$1`, [id])).rows;
    assert.deepEqual(
      alias.map((k) => r[k]),
      ['muslo', 'permanente', 'falta_sumidero', 'no', null, false],
    );
    for (const cat of categorias.slice(1)) {
      const otro = await insertar(cat, {
        detalle: {
          profundidad_estimada: 'muslo',
          frecuencia: 'ocasional',
          causa_presunta: 'desconocida',
          sumidero_cercano: 'si',
          sumidero_estado: 'tapado',
          agua_brota_sumidero: false,
        },
      });
      const [otra] = (await db.query(`${SELECT_REPORTE} WHERE r.id=$1`, [otro])).rows;
      assert.deepEqual(
        alias.map((k) => otra[k]),
        [null, null, null, null, null, null],
      );
    }
    await db.exec('SAVEPOINT opcionales_nulos');
    await assert.rejects(
      () =>
        db.query('UPDATE reporte SET detalle=$1 WHERE id=$2', [
          JSON.stringify({
            profundidad_estimada: 'rodilla',
            frecuencia: 'ocasional',
            causa_presunta: 'desconocida',
            sumidero_cercano: null,
            sumidero_estado: null,
            agua_brota_sumidero: null,
          }),
          id,
        ]),
      /m10_0022_inundacion_detalle_v1/,
    );
    await db.exec('ROLLBACK TO SAVEPOINT opcionales_nulos');
    await db.query('UPDATE reporte SET detalle=$1 WHERE id=$2', [
      JSON.stringify({
        profundidad_estimada: 'rodilla',
        frecuencia: 'ocasional',
        causa_presunta: 'desconocida',
      }),
      id,
    ]);
    const [nulos] = (await db.query(`${SELECT_REPORTE} WHERE r.id=$1`, [id])).rows;
    assert.deepEqual(
      [nulos.sumidero_cercano, nulos.sumidero_estado, nulos.agua_brota_sumidero],
      [null, null, null],
    );
  });
});

test('SQL LEFT JOIN conserva UV vacías/solo otras; vecinos filtra ambos lados y semilla; PC bbox global', async () => {
  await transaccion(async () => {
    const otro = await insertar('bache', { uv: 'unidad_vecinal:otras' });
    const flood = await insertar();
    for (const cat of ['basura', 'area_verde']) await insertar(cat, { uv: 'unidad_vecinal:otras' });
    for (const cat of categorias) await punto(cat);
    const cs = await (await banco('consultas')).crearConsultas(poolMemoria);
    const agregado = (await db.query(cs[5].sql)).rows;
    for (const id of ['unidad_vecinal:vacia', 'unidad_vecinal:otras'])
      assert.equal(agregado.find((r) => r.id === id).n_reportes, 0);
    const vecinos = cs[8];
    assert.deepEqual(vecinos.params[0], [flood]);
    assert.deepEqual((await db.query(vecinos.sql, [[otro], ...vecinos.params.slice(1)])).rows, []);
    assert.deepEqual((await db.query(vecinos.sql, [[flood], ...vecinos.params.slice(1)])).rows, []);
    const segundo = await insertar();
    const rows = (await db.query(vecinos.sql, [[flood, otro], ...vecinos.params.slice(1)])).rows;
    assert.deepEqual(rows, [{ origen: flood, vecino: segundo }]);
    assert.equal((await db.query(cs[6].sql, cs[6].params)).rows.length, 4);
  });
});

test('SQL estado: conteos flood y mantenimiento; tamaño físico todas categorías, PC/capas globales', async () => {
  const estado = (await capturarDatos('estado'))[0];
  await transaccion(async () => {
    for (const cat of categorias) {
      await insertar(cat, { publico: false });
      await punto(cat);
    }
    const [r] = (await db.query(estado.sql, estado.params)).rows;
    assert.equal(Number(r.reportes), 1);
    assert.equal(Number(r.sinteticos), 1);
    assert.equal(Number(r.publicables), 1);
    assert.equal(Number(r.sin_geom_publico), 1);
    assert.equal(Number(r.puntos_criticos), 4);
    assert.ok(Number(r.unidades_vecinales) > 1);
    assert.match(estado.sql, /pg_total_relation_size\('reporte'\)/);
    assert.match(estado.sql, /tamano_reporte_todas_categorias/);
  });
});

test('SQL público histórico: excluye nuevo y sin punto, incluye futuro validado; página profunda no vacía', async () => {
  await transaccion(async () => {
    const m = await banco('consultas');
    const futuro = await insertar('inundacion', { demora: 30 });
    const nuevo = await insertar('inundacion', { estado: 'nuevo' });
    const sinPunto = await insertar('inundacion', { publico: false });
    const base = (await db.query(`${m.SELECT_REPORTE} ${m.PUBLICO}`)).rows;
    assert.ok(base.some((r) => r.id === futuro));
    assert.ok(!base.some((r) => r.id === nuevo || r.id === sinPunto));
    await db.exec(`INSERT INTO reporte (categoria,geom,geom_publico,distrito_id,unidad_vecinal_id,ubicacion_metodo,ubicacion_tipo,descripcion,
      detalle,detalle_version,severidad_calculada,severidad_puntaje,severidad_version,estado,publicar_en)
      SELECT 'inundacion',ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),
      'distrito_municipal:1','unidad_vecinal:30','manual','via_publica','Volumen ficticio de página profunda',
      '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb,1,'media',6,2,'validado',now()
      FROM generate_series(1,5001)`);
    const cs = await m.crearConsultas(poolMemoria);
    const actual = (await db.query(cs[2].sql, cs[2].params)).rows;
    assert.equal(actual.length, 2);
    await conEspejo21(async (previo) => {
      equivalente(actual, (await previo.query(F0.consultas[2].sql, F0.consultas[2].params)).rows);
    });
  });
});

function humo() {
  const yaml = fuente('.github/workflows/ci.yml');
  const bloque = yaml.split('- name: Humo sobre los datos')[1].split('\n          FIN')[0];
  return bloque
    .slice(bloque.indexOf('DO $$'))
    .split('\n')
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n')
    .trim();
}
test('CI humo SQL exacto: flood positivo; sin flood, otras tres presentes, falla; UV obligatoria', async () => {
  const sql = humo();
  assert.equal((sql.match(/FROM reporte\b/g) || []).length, 3);
  assert.equal((sql.match(/categoria = 'inundacion'/g) || []).length, 3);
  await transaccion(async () => {
    for (const cat of categorias.slice(1)) await insertar(cat, { publico: false });
    await db.exec('SAVEPOINT humo');
    await assert.rejects(db.exec(sql), /no se sembró ningún reporte/);
    await db.exec('ROLLBACK TO SAVEPOINT humo');
    await insertar();
    await db.exec(sql);
    await db.exec(
      "UPDATE reporte SET geom=ST_GeomFromText('POINT(NaN NaN)',4326) WHERE categoria<>'inundacion'",
    );
    await db.exec(sql);
    await db.exec('UPDATE geo.capa_version SET vigente=false');
    await db.exec('SAVEPOINT sin_uv');
    await assert.rejects(db.exec(sql), /no hay unidades vecinales/);
    await db.exec('ROLLBACK TO SAVEPOINT sin_uv');
  });
});
test('CI humo SQL exacto: conserva fail-closed e invalidez, sin contaminación de otras categorías', async () => {
  const sql = humo();
  await transaccion(async () => {
    await insertar();
    const id = await insertar('inundacion', { publico: false });
    await db.exec('SAVEPOINT malo');
    await assert.rejects(db.exec(sql), /sin geom_publico/);
    await db.exec('ROLLBACK TO SAVEPOINT malo');
    await db.query("UPDATE reporte SET ubicacion_tipo='vivienda_o_predio' WHERE id=$1", [id]);
    await db.exec(sql);
    assert.match(sql, /NOT ST_IsValid\(geom\)/);
    assert.match(sql, /hay % geometrías inválidas/);
    // Una geometría Point NaN sigue siendo del tipo exigido y PostGIS la declara inválida.
    await db.query("UPDATE reporte SET geom=ST_GeomFromText('POINT(NaN NaN)',4326) WHERE id=$1", [
      id,
    ]);
    await db.exec('SAVEPOINT invalido');
    await assert.rejects(db.exec(sql), /geometrías inválidas/);
    await db.exec('ROLLBACK TO SAVEPOINT invalido');
  });
});

// Referencias SQL F0, capturadas con pool ficticio, no con operadores/CLI reales.
// Se insertan abajo junto con SHA de la fuente manual original; son fixtures, no módulos de producto.

const F0 = {
  datos: {
    estado: [
      {
        sql: "\n    SELECT\n      (SELECT count(*) FROM reporte_inundacion) AS reportes,\n      (SELECT count(*) FROM reporte_inundacion WHERE descripcion LIKE $1) AS sinteticos,\n      (SELECT count(*) FROM reporte_inundacion WHERE estado IN ('validado','resuelto')) AS publicables,\n      (SELECT count(*) FROM reporte_inundacion WHERE geom_publico IS NULL) AS sin_geom_publico,\n      (SELECT count(*) FROM punto_critico) AS puntos_criticos,\n      (SELECT count(*) FROM geo.unidad_vecinal) AS unidades_vecinales,\n      pg_size_pretty(pg_total_relation_size('reporte_inundacion')) AS tamano_reportes,\n      pg_size_pretty(pg_database_size(current_database())) AS tamano_base\n  ",
        params: ['[sintético banco-datos]%'],
      },
    ],
    generar: [
      {
        sql: 'SET statement_timeout = 0',
        params: [],
      },
      {
        sql: 'SET idle_in_transaction_session_timeout = 0',
        params: [],
      },
      {
        sql: "SELECT u.id, u.distrito_id, u.version_capa\n         FROM geo.unidad_vecinal u\n         JOIN geo.capa_version v ON v.capa = 'unidad_vecinal' AND v.version = u.version_capa AND v.vigente",
        params: [],
      },
      {
        sql: "\n        WITH uvs AS (\n          SELECT u.id, u.distrito_id, u.version_capa, u.geom,\n                 row_number() OVER (ORDER BY u.id) AS n,\n                 count(*) OVER () AS total\n            FROM geo.unidad_vecinal u\n            JOIN geo.capa_version v\n              ON v.capa = 'unidad_vecinal' AND v.version = u.version_capa AND v.vigente\n        ),\n        reparto AS (\n          SELECT uvs.*, ($1::int / uvs.total) + CASE WHEN uvs.n <= ($1::int % uvs.total) THEN 1 ELSE 0 END AS cuantos\n            FROM uvs\n        ),\n        puntos AS (\n          SELECT r.id AS uv_id, r.distrito_id, r.version_capa,\n                 (ST_Dump(ST_GeneratePoints(r.geom, r.cuantos::int))).geom AS pt\n            FROM reparto r WHERE r.cuantos > 0\n        ),\n        numerados AS (\n          SELECT p.*, row_number() OVER () AS i FROM puntos p\n        ),\n        fechados AS (\n          -- 525 600 minutos = un año. El salto de 7919 (primo, coprimo con el año en minutos)\n          -- reparte las fechas de forma determinista y sin relación con el orden espacial.\n          SELECT n.*,\n                 now() - ((CASE WHEN $3::bool THEN n.i ELSE (n.i * 7919) % 525600 END) || ' minutes')::interval AS creado\n            FROM numerados n\n        )\n        INSERT INTO reporte_inundacion (\n          geom, geom_publico, distrito_id, unidad_vecinal_id, version_capa, resolucion_flags,\n          ubicacion_metodo, ubicacion_tipo, descripcion,\n          profundidad_estimada, frecuencia, causa_presunta,\n          severidad_calculada, severidad_puntaje, severidad_version, estado, creado_en, publicar_en)\n        SELECT\n          ST_SetSRID(pt, 4326),\n          -- 1 de cada 5 es de vivienda; de esos, 1 de cada 10 queda sin punto publicable para\n          -- ejercitar el camino fail-closed del listado público.\n          CASE WHEN i % 5 = 0 AND i % 50 = 0 THEN NULL\n               ELSE ST_SetSRID(ST_MakePoint(round(ST_X(pt)::numeric, 5)::float8,\n                                            round(ST_Y(pt)::numeric, 5)::float8), 4326) END,\n          distrito_id, uv_id, version_capa, '{}'::jsonb,\n          (ARRAY['gps','manual'])[1 + (i % 2)]::ubicacion_metodo,\n          CASE WHEN i % 5 = 0 THEN 'vivienda_o_predio' ELSE 'via_publica' END::ubicacion_tipo,\n          $2 || ' anegamiento de prueba nº ' || i,\n          (ARRAY['tobillo','rodilla','muslo','mas_70'])[1 + (i % 4)]::profundidad_estimada,\n          (ARRAY['primera_vez','ocasional','cada_lluvia_fuerte','permanente'])[1 + (i % 4)]::frecuencia,\n          'desconocida'::causa_presunta,\n          -- Severidad v2 (CLAUDE.md §9.1): T = F = 1 + (i % 4), así que puntaje = 2·T + F = 3·T\n          -- (3, 6, 9, 12) y la banda sale baja, media, alta, critica en ese mismo orden.\n          (ARRAY['baja','media','alta','critica'])[1 + (i % 4)]::severidad,\n          3 * (1 + (i % 4)), 2,\n          -- Tres de cada cuatro publicables: es la proporción que hace que el índice parcial\n          -- del listado público tenga una selectividad parecida a la de un sistema en marcha.\n          CASE WHEN i % 4 = 0 THEN 'nuevo' ELSE (ARRAY['validado','resuelto'])[1 + (i % 2)] END::estado_reporte,\n          -- Sin DEFAULT desde la 0016: se publica al crearse, como los anteriores a la 0015.\n          creado, creado\n        FROM fechados",
        params: [12, '[sintético banco-datos]', false],
      },
      {
        sql: 'ANALYZE reporte_inundacion',
        params: [],
      },
      {
        sql: 'ANALYZE punto_critico',
        params: [],
      },
      {
        sql: "\n    SELECT\n      (SELECT count(*) FROM reporte_inundacion) AS reportes,\n      (SELECT count(*) FROM reporte_inundacion WHERE descripcion LIKE $1) AS sinteticos,\n      (SELECT count(*) FROM reporte_inundacion WHERE estado IN ('validado','resuelto')) AS publicables,\n      (SELECT count(*) FROM reporte_inundacion WHERE geom_publico IS NULL) AS sin_geom_publico,\n      (SELECT count(*) FROM punto_critico) AS puntos_criticos,\n      (SELECT count(*) FROM geo.unidad_vecinal) AS unidades_vecinales,\n      pg_size_pretty(pg_total_relation_size('reporte_inundacion')) AS tamano_reportes,\n      pg_size_pretty(pg_database_size(current_database())) AS tamano_base\n  ",
        params: ['[sintético banco-datos]%'],
      },
    ],
    limpiar: [
      {
        sql: 'SET statement_timeout = 0',
        params: [],
      },
      {
        sql: 'SET idle_in_transaction_session_timeout = 0',
        params: [],
      },
      {
        sql: 'DELETE FROM reporte_inundacion WHERE descripcion LIKE $1',
        params: ['[sintético banco-datos]%'],
      },
      {
        sql: 'DELETE FROM punto_critico p\n        WHERE NOT EXISTS (SELECT 1 FROM reporte_inundacion r WHERE r.punto_critico_id = p.id)',
        params: [],
      },
      {
        sql: 'VACUUM ANALYZE reporte_inundacion',
        params: [],
      },
      {
        sql: "\n    SELECT\n      (SELECT count(*) FROM reporte_inundacion) AS reportes,\n      (SELECT count(*) FROM reporte_inundacion WHERE descripcion LIKE $1) AS sinteticos,\n      (SELECT count(*) FROM reporte_inundacion WHERE estado IN ('validado','resuelto')) AS publicables,\n      (SELECT count(*) FROM reporte_inundacion WHERE geom_publico IS NULL) AS sin_geom_publico,\n      (SELECT count(*) FROM punto_critico) AS puntos_criticos,\n      (SELECT count(*) FROM geo.unidad_vecinal) AS unidades_vecinales,\n      pg_size_pretty(pg_total_relation_size('reporte_inundacion')) AS tamano_reportes,\n      pg_size_pretty(pg_database_size(current_database())) AS tamano_base\n  ",
        params: ['[sintético banco-datos]%'],
      },
    ],
  },
  consultas: [
    {
      nombre: 'listado público · conteo acotado',
      sql: "SELECT count(*)::text AS n FROM (SELECT 1 FROM reporte_inundacion r WHERE r.estado IN ('validado', 'resuelto') AND r.geom_publico IS NOT NULL LIMIT 10001) t",
      params: [],
    },
    {
      nombre: 'listado público · primera página',
      sql: "\n  SELECT r.id, ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,\n         ST_X(r.geom_publico) AS lon_publico, ST_Y(r.geom_publico) AS lat_publico,\n         r.creado_en, r.actualizado_en, r.evento_en, r.autor_id,\n         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,\n         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre,\n         r.version_capa, r.resolucion_flags, r.ubicacion_metodo, r.precision_gps_m,\n         r.ubicacion_tipo, r.descripcion, r.profundidad_estimada,\n         r.frecuencia, r.causa_presunta,\n         r.sumidero_cercano, r.sumidero_estado, r.agua_brota_sumidero,\n         r.severidad_calculada, r.severidad_puntaje, r.severidad_manual, r.severidad_motivo,\n         r.estado, r.estado_motivo, r.fusionado_en_id, r.punto_critico_id,\n         pc.n_reportes AS n_reportes_punto, r.validado_por, r.validado_en,\n         (SELECT array_agg(f.objeto_key ORDER BY f.creado_en) FROM reporte_foto f\n           WHERE f.reporte_id = r.id AND f.exif_sanitizado) AS fotos\n  FROM reporte_inundacion r\n  LEFT JOIN geo.unidad_vecinal_vigente u ON u.id = r.unidad_vecinal_id\n  LEFT JOIN geo.distrito_municipal_vigente d ON d.id = r.distrito_id\n  LEFT JOIN punto_critico pc ON pc.id = r.punto_critico_id WHERE r.estado IN ('validado', 'resuelto') AND r.geom_publico IS NOT NULL ORDER BY r.creado_en DESC, r.id DESC LIMIT 50 OFFSET 0",
      params: [],
    },
    {
      nombre: 'listado público · página 100 (OFFSET 5000)',
      sql: "\n  SELECT r.id, ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,\n         ST_X(r.geom_publico) AS lon_publico, ST_Y(r.geom_publico) AS lat_publico,\n         r.creado_en, r.actualizado_en, r.evento_en, r.autor_id,\n         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,\n         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre,\n         r.version_capa, r.resolucion_flags, r.ubicacion_metodo, r.precision_gps_m,\n         r.ubicacion_tipo, r.descripcion, r.profundidad_estimada,\n         r.frecuencia, r.causa_presunta,\n         r.sumidero_cercano, r.sumidero_estado, r.agua_brota_sumidero,\n         r.severidad_calculada, r.severidad_puntaje, r.severidad_manual, r.severidad_motivo,\n         r.estado, r.estado_motivo, r.fusionado_en_id, r.punto_critico_id,\n         pc.n_reportes AS n_reportes_punto, r.validado_por, r.validado_en,\n         (SELECT array_agg(f.objeto_key ORDER BY f.creado_en) FROM reporte_foto f\n           WHERE f.reporte_id = r.id AND f.exif_sanitizado) AS fotos\n  FROM reporte_inundacion r\n  LEFT JOIN geo.unidad_vecinal_vigente u ON u.id = r.unidad_vecinal_id\n  LEFT JOIN geo.distrito_municipal_vigente d ON d.id = r.distrito_id\n  LEFT JOIN punto_critico pc ON pc.id = r.punto_critico_id WHERE r.estado IN ('validado', 'resuelto') AND r.geom_publico IS NOT NULL ORDER BY r.creado_en DESC, r.id DESC LIMIT 50 OFFSET 5000",
      params: [],
    },
    {
      nombre: 'listado público · bbox del mapa',
      sql: "\n  SELECT r.id, ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,\n         ST_X(r.geom_publico) AS lon_publico, ST_Y(r.geom_publico) AS lat_publico,\n         r.creado_en, r.actualizado_en, r.evento_en, r.autor_id,\n         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,\n         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre,\n         r.version_capa, r.resolucion_flags, r.ubicacion_metodo, r.precision_gps_m,\n         r.ubicacion_tipo, r.descripcion, r.profundidad_estimada,\n         r.frecuencia, r.causa_presunta,\n         r.sumidero_cercano, r.sumidero_estado, r.agua_brota_sumidero,\n         r.severidad_calculada, r.severidad_puntaje, r.severidad_manual, r.severidad_motivo,\n         r.estado, r.estado_motivo, r.fusionado_en_id, r.punto_critico_id,\n         pc.n_reportes AS n_reportes_punto, r.validado_por, r.validado_en,\n         (SELECT array_agg(f.objeto_key ORDER BY f.creado_en) FROM reporte_foto f\n           WHERE f.reporte_id = r.id AND f.exif_sanitizado) AS fotos\n  FROM reporte_inundacion r\n  LEFT JOIN geo.unidad_vecinal_vigente u ON u.id = r.unidad_vecinal_id\n  LEFT JOIN geo.distrito_municipal_vigente d ON d.id = r.distrito_id\n  LEFT JOIN punto_critico pc ON pc.id = r.punto_critico_id WHERE r.estado IN ('validado', 'resuelto') AND r.geom_publico IS NOT NULL\n              AND r.geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326)\n            ORDER BY r.creado_en DESC, r.id DESC LIMIT 50",
      params: [-63.18, -17.790000000000003, -63.160000000000004, -17.77],
    },
    {
      nombre: 'listado técnico · filtro por unidad vecinal',
      sql: '\n  SELECT r.id, ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,\n         ST_X(r.geom_publico) AS lon_publico, ST_Y(r.geom_publico) AS lat_publico,\n         r.creado_en, r.actualizado_en, r.evento_en, r.autor_id,\n         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,\n         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre,\n         r.version_capa, r.resolucion_flags, r.ubicacion_metodo, r.precision_gps_m,\n         r.ubicacion_tipo, r.descripcion, r.profundidad_estimada,\n         r.frecuencia, r.causa_presunta,\n         r.sumidero_cercano, r.sumidero_estado, r.agua_brota_sumidero,\n         r.severidad_calculada, r.severidad_puntaje, r.severidad_manual, r.severidad_motivo,\n         r.estado, r.estado_motivo, r.fusionado_en_id, r.punto_critico_id,\n         pc.n_reportes AS n_reportes_punto, r.validado_por, r.validado_en,\n         (SELECT array_agg(f.objeto_key ORDER BY f.creado_en) FROM reporte_foto f\n           WHERE f.reporte_id = r.id AND f.exif_sanitizado) AS fotos\n  FROM reporte_inundacion r\n  LEFT JOIN geo.unidad_vecinal_vigente u ON u.id = r.unidad_vecinal_id\n  LEFT JOIN geo.distrito_municipal_vigente d ON d.id = r.distrito_id\n  LEFT JOIN punto_critico pc ON pc.id = r.punto_critico_id\n            WHERE r.unidad_vecinal_id = (SELECT id FROM geo.unidad_vecinal_vigente ORDER BY id LIMIT 1)\n            ORDER BY r.creado_en DESC, r.id DESC LIMIT 50',
      params: [],
    },
    {
      nombre: 'agregados por unidad vecinal (coropletas)',
      sql: "SELECT u.id, count(r.id)::int AS n_reportes,\n                   count(DISTINCT r.punto_critico_id)::int AS n_puntos_criticos,\n                   max(CASE COALESCE(r.severidad_manual, r.severidad_calculada)\n                         WHEN 'critica' THEN 4 WHEN 'alta' THEN 3\n                         WHEN 'media' THEN 2 WHEN 'baja' THEN 1 END) AS sev\n              FROM geo.unidad_vecinal_vigente u\n              LEFT JOIN reporte_inundacion r\n                ON r.unidad_vecinal_id = u.id AND r.estado IN ('validado','resuelto')\n             GROUP BY u.id",
      params: [],
    },
    {
      nombre: 'puntos críticos por bbox',
      sql: 'SELECT id, ST_Y(geom_publico) AS lat, ST_X(geom_publico) AS lon, n_reportes\n              FROM punto_critico\n             WHERE geom_publico IS NOT NULL\n               AND geom_publico && ST_MakeEnvelope($1, $2, $3, $4, 4326)\n             ORDER BY n_reportes DESC, ultimo_reporte_en DESC LIMIT 5000',
      params: [-63.370000000000005, -17.98, -62.97, -17.580000000000002],
    },
    {
      nombre: 'point-in-polygon (resolver UV)',
      sql: 'SELECT uv.id FROM geo.unidad_vecinal_vigente uv\n             WHERE ST_Contains(uv.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1',
      params: [-63.17, -17.78],
    },
    {
      nombre: 'vecinos a 25 m (recálculo de puntos críticos)',
      sql: "SELECT a.id::text AS origen, b.id::text AS vecino\n              FROM reporte_inundacion a\n              JOIN reporte_inundacion b\n                ON b.id <> a.id AND b.estado IN ('validado','resuelto')\n               AND b.geom && ST_Expand(a.geom, $2)\n               AND ST_DWithin(b.geom::geography, a.geom::geography, $3)\n             WHERE a.id = ANY($1::uuid[])",
      params: [[], 0.00023580668343514192, 25],
    },
    {
      nombre: 'mantenimiento · reportes sin geom_publico',
      sql: 'SELECT id FROM reporte_inundacion WHERE geom_publico IS NULL ORDER BY creado_en LIMIT 500',
      params: [],
    },
  ],
  manual:
    "BEGIN;\n\n-- Insertar 30 reportes esparcidos por toda la ciudad, con Distrito 1 teniendo 5 puntos críticos.\nINSERT INTO reporte_inundacion (\n  geom,\n  geom_publico,\n  creado_en,\n  actualizado_en,\n  publicar_en,\n  evento_en,\n  distrito_id,\n  unidad_vecinal_id,\n  version_capa,\n  resolucion_flags,\n  ubicacion_metodo,\n  precision_gps_m,\n  ubicacion_tipo,\n  descripcion,\n  profundidad_estimada,\n  frecuencia,\n  causa_presunta,\n  sumidero_cercano,\n  sumidero_estado,\n  agua_brota_sumidero,\n  severidad_calculada,\n  severidad_puntaje,\n  severidad_version,\n  estado,\n  validado_por,\n  validado_en\n) VALUES\n  -- =========================================================================\n  -- DISTRITO 1: 5 PUNTOS CRÍTICOS (Severidad Crítica)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.199742, -17.789610), 4326),\n    ST_SetSRID(ST_MakePoint(-63.199742, -17.789610), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:1',\n    'unidad_vecinal:30',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps',\n    6,\n    'via_publica',\n    'Punto crítico 1: desborde de canal pluvial en avenida principal, agua sobrepasa los 75 cm impidiendo el paso vehicular.',\n    'mas_70',\n    'permanente',\n    'colector_saturado',\n    'si',\n    'tapado',\n    true,\n    'critica',\n    12,\n    2,\n    'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3',\n    now() - interval '2 days' + interval '15 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.189383, -17.766424), 4326),\n    ST_SetSRID(ST_MakePoint(-63.189383, -17.766424), 4326),\n    now() - interval '2 days' + interval '3 hours',\n    now() - interval '2 days' + interval '3 hours',\n    now() - interval '2 days' + interval '3 hours',\n    now() - interval '2 days' + interval '1 hour',\n    'distrito_municipal:1',\n    'unidad_vecinal:35',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps',\n    8,\n    'via_publica',\n    'Punto crítico 2: anegamiento severo en intersección crítica, acumulación profunda de agua que ingresa a inmuebles.',\n    'mas_70',\n    'cada_lluvia_fuerte',\n    'falta_sumidero',\n    'no',\n    NULL,\n    false,\n    'critica',\n    11,\n    2,\n    'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3',\n    now() - interval '2 days' + interval '3 hours' + interval '10 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.211217, -17.793948), 4326),\n    ST_SetSRID(ST_MakePoint(-63.211217, -17.793948), 4326),\n    now() - interval '1 day' + interval '5 hours',\n    now() - interval '1 day' + interval '5 hours',\n    now() - interval '1 day' + interval '5 hours',\n    now() - interval '1 day' + interval '3 hours',\n    'distrito_municipal:1',\n    'unidad_vecinal:53',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps',\n    5,\n    'via_publica',\n    'Punto crítico 3: colapso de sumidero pluvial y retorno de aguas con nivel crítico superior a los 70 cm.',\n    'mas_70',\n    'permanente',\n    'sumidero_tapado',\n    'si',\n    'tapado',\n    true,\n    'critica',\n    12,\n    2,\n    'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3',\n    now() - interval '1 day' + interval '5 hours' + interval '20 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.205842, -17.768803), 4326),\n    ST_SetSRID(ST_MakePoint(-63.205842, -17.768803), 4326),\n    now() - interval '1 day' + interval '8 hours',\n    now() - interval '1 day' + interval '8 hours',\n    now() - interval '1 day' + interval '8 hours',\n    now() - interval '1 day' + interval '6 hours',\n    'distrito_municipal:1',\n    'unidad_vecinal:57',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps',\n    7,\n    'via_publica',\n    'Punto crítico 4: estancamiento crítico de agua profunda frente a posta médica vecinal y zona escolar.',\n    'mas_70',\n    'agua_estancada',\n    'colector_saturado',\n    'si',\n    'tapado',\n    false,\n    'critica',\n    13,\n    2,\n    'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3',\n    now() - interval '1 day' + interval '8 hours' + interval '12 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.189099, -17.755434), 4326),\n    ST_SetSRID(ST_MakePoint(-63.189099, -17.755434), 4326),\n    now() - interval '18 hours',\n    now() - interval '18 hours',\n    now() - interval '18 hours',\n    now() - interval '20 hours',\n    'distrito_municipal:1',\n    'unidad_vecinal:60',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps',\n    6,\n    'via_publica',\n    'Punto crítico 5: socavación de calzada bajo agua profunda recurrente en cruce barrial estratégico.',\n    'mas_70',\n    'cada_lluvia_fuerte',\n    'falta_sumidero',\n    'no',\n    NULL,\n    false,\n    'critica',\n    11,\n    2,\n    'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3',\n    now() - interval '18 hours' + interval '25 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 2 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.178860, -17.765000), 4326),\n    ST_SetSRID(ST_MakePoint(-63.178860, -17.765000), 4326),\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days' - interval '1 hour',\n    'distrito_municipal:2',\n    'unidad_vecinal:15',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 10, 'via_publica',\n    'Acumulación de agua moderada a nivel de rodilla sobre la calzada tras lluvia intensa.',\n    'rodilla', 'ocasional', 'sumidero_tapado', 'si', 'tapado', false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '3 days' + interval '20 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.165878, -17.766173), 4326),\n    ST_SetSRID(ST_MakePoint(-63.165878, -17.766173), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:2',\n    'unidad_vecinal:17',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 12, 'via_publica',\n    'Charco superficial en cuneta que drena lentamente sin obstaculizar el paso vehicular.',\n    'tobillo', 'primera_vez', 'desconocida', 'no', NULL, false, 'baja', 3, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '10 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 3 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.164114, -17.791008), 4326),\n    ST_SetSRID(ST_MakePoint(-63.164114, -17.791008), 4326),\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days' - interval '3 hours',\n    'distrito_municipal:3',\n    'unidad_vecinal:23',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 8, 'via_publica',\n    'Nivel de agua elevado a la altura del muslo en bajada de calle asfaltada hacia el canal.',\n    'muslo', 'cada_lluvia_fuerte', 'falta_sumidero', 'no', NULL, false, 'alta', 9, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '3 days' + interval '15 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.170485, -17.802315), 4326),\n    ST_SetSRID(ST_MakePoint(-63.170485, -17.802315), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '1 hour',\n    'distrito_municipal:3',\n    'unidad_vecinal:25',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 9, 'via_publica',\n    'Retención de agua en esquina de plaza de barrio por desnivel en la calzada.',\n    'rodilla', 'ocasional', 'contrapendiente', 'si', 'no_tapado', false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '30 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 4 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.185164, -17.806231), 4326),\n    ST_SetSRID(ST_MakePoint(-63.185164, -17.806231), 4326),\n    now() - interval '4 days',\n    now() - interval '4 days',\n    now() - interval '4 days',\n    now() - interval '4 days' - interval '2 hours',\n    'distrito_municipal:4',\n    'unidad_vecinal:27',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 11, 'via_publica',\n    'Anegamiento leve en boca de tormenta secundaria; peatones cruzan con precaución.',\n    'tobillo', 'ocasional', 'desconocida', 'si', 'no_tapado', false, 'baja', 4, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '4 days' + interval '12 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.198294, -17.797106), 4326),\n    ST_SetSRID(ST_MakePoint(-63.198294, -17.797106), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '1 hour',\n    'distrito_municipal:4',\n    'unidad_vecinal:29',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 7, 'via_publica',\n    'Corte temporal de paso peatonal por acumulación de agua hasta la rodilla en bocacalle.',\n    'rodilla', 'cada_lluvia_fuerte', 'falta_sumidero', 'no', NULL, false, 'media', 7, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '20 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 5 (3 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.170986, -17.747246), 4326),\n    ST_SetSRID(ST_MakePoint(-63.170986, -17.747246), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:5',\n    'unidad_vecinal:65',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 6, 'via_publica',\n    'Agua a nivel del muslo sobre carril derecho de avenida con tráfico denso.',\n    'muslo', 'cada_lluvia_fuerte', 'colector_saturado', 'si', 'tapado', false, 'alta', 9, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '18 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.155465, -17.750504), 4326),\n    ST_SetSRID(ST_MakePoint(-63.155465, -17.750504), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '3 hours',\n    'distrito_municipal:5',\n    'unidad_vecinal:67',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 8, 'via_publica',\n    'Sumidero colmatado con sedimento y residuos que retiene agua a nivel de rodilla.',\n    'rodilla', 'ocasional', 'sumidero_tapado', 'si', 'tapado', false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '22 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.156267, -17.715417), 4326),\n    ST_SetSRID(ST_MakePoint(-63.156267, -17.715417), 4326),\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days' - interval '4 hours',\n    'distrito_municipal:5',\n    'unidad_vecinal:193',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 14, 'via_publica',\n    'Charco aislado en carril lateral de vía urbana sin afectación mayor.',\n    'tobillo', 'primera_vez', 'desconocida', 'no', NULL, false, 'baja', 3, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '3 days' + interval '40 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 6 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.134292, -17.785469), 4326),\n    ST_SetSRID(ST_MakePoint(-63.134292, -17.785469), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:6',\n    'unidad_vecinal:140',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 9, 'via_publica',\n    'Retención hídrica prolongada a nivel de muslo en calle barrial de alto flujo.',\n    'muslo', 'ocasional', 'falta_sumidero', 'no', NULL, false, 'alta', 8, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '14 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.124134, -17.775973), 4326),\n    ST_SetSRID(ST_MakePoint(-63.124134, -17.775973), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '1 hour',\n    'distrito_municipal:6',\n    'unidad_vecinal:141',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 10, 'via_publica',\n    'Acumulación en bocacalle vecinal tras chubasco; vehículos reducen velocidad.',\n    'rodilla', 'ocasional', 'desconocida', 'si', 'no_tapado', false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '19 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 7 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.114281, -17.810830), 4326),\n    ST_SetSRID(ST_MakePoint(-63.114281, -17.810830), 4326),\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days' - interval '2 hours',\n    'distrito_municipal:7',\n    'unidad_vecinal:100',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 8, 'via_publica',\n    'Anegamiento en calzada de avenida periférica que cubre la vereda.',\n    'rodilla', 'cada_lluvia_fuerte', 'falta_sumidero', 'no', NULL, false, 'media', 7, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '3 days' + interval '25 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.103477, -17.815244), 4326),\n    ST_SetSRID(ST_MakePoint(-63.103477, -17.815244), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '3 hours',\n    'distrito_municipal:7',\n    'unidad_vecinal:156',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 12, 'via_publica',\n    'Acumulación superficial al borde de la calzada sin daño a inmuebles.',\n    'tobillo', 'ocasional', 'desconocida', 'no', NULL, false, 'baja', 4, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '15 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 8 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.116658, -17.816381), 4326),\n    ST_SetSRID(ST_MakePoint(-63.116658, -17.816381), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:8',\n    'unidad_vecinal:102',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 7, 'via_publica',\n    'Cuneta desbordada hacia el pavimento en zona comercial, agua a nivel del muslo.',\n    'muslo', 'cada_lluvia_fuerte', 'colector_saturado', 'si', 'tapado', false, 'alta', 9, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '35 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.114041, -17.819241), 4326),\n    ST_SetSRID(ST_MakePoint(-63.114041, -17.819241), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '2 hours',\n    'distrito_municipal:8',\n    'unidad_vecinal:143',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 9, 'via_publica',\n    'Charco persistente frente a parada de transporte público barrial.',\n    'rodilla', 'ocasional', 'falta_sumidero', 'no', NULL, false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '14 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 9 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.180762, -17.827597), 4326),\n    ST_SetSRID(ST_MakePoint(-63.180762, -17.827597), 4326),\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days' - interval '1 hour',\n    'distrito_municipal:9',\n    'unidad_vecinal:107',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 8, 'via_publica',\n    'Acumulación en sector bajo de la calzada que cubre de acera a acera.',\n    'rodilla', 'cada_lluvia_fuerte', 'contrapendiente', 'si', 'no_tapado', false, 'media', 7, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '3 days' + interval '20 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.177531, -17.838528), 4326),\n    ST_SetSRID(ST_MakePoint(-63.177531, -17.838528), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:9',\n    'unidad_vecinal:115',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 10, 'via_publica',\n    'Pequeño encharcamiento en esquina residencial sin corte de tránsito.',\n    'tobillo', 'primera_vez', 'desconocida', 'no', NULL, false, 'baja', 3, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '11 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 10 (2 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.203881, -17.822535), 4326),\n    ST_SetSRID(ST_MakePoint(-63.203881, -17.822535), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '3 hours',\n    'distrito_municipal:10',\n    'unidad_vecinal:108',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 7, 'via_publica',\n    'Nivel de agua a media rueda de vehículos livianos tras tormenta.',\n    'muslo', 'ocasional', 'falta_sumidero', 'no', NULL, false, 'alta', 8, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '16 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.209043, -17.818232), 4326),\n    ST_SetSRID(ST_MakePoint(-63.209043, -17.818232), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '2 hours',\n    'distrito_municipal:10',\n    'unidad_vecinal:109',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 9, 'via_publica',\n    'Falta de rejilla pluvial provoca acumulación de agua hasta la rodilla en cuneta.',\n    'rodilla', 'ocasional', 'sumidero_tapado', 'si', 'tapado', false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '24 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 11 - CENTRO HISTÓRICO (3 puntos)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.177585, -17.771902), 4326),\n    ST_SetSRID(ST_MakePoint(-63.177585, -17.771902), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '1 hour',\n    'distrito_municipal:11',\n    'unidad_vecinal:1',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 6, 'via_publica',\n    'Acumulación importante en esquina de calle céntrica histórica con agua al muslo.',\n    'muslo', 'cada_lluvia_fuerte', 'colector_saturado', 'si', 'no_tapado', true, 'alta', 9, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '20 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.170434, -17.774021), 4326),\n    ST_SetSRID(ST_MakePoint(-63.170434, -17.774021), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '2 hours',\n    'distrito_municipal:11',\n    'unidad_vecinal:2',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 8, 'via_publica',\n    'Agua acumulada sobre vereda en zona comercial que tarda horas en bajar.',\n    'rodilla', 'ocasional', 'falta_sumidero', 'no', NULL, false, 'media', 6, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '15 minutes'\n  ),\n  (\n    ST_SetSRID(ST_MakePoint(-63.168942, -17.778532), 4326),\n    ST_SetSRID(ST_MakePoint(-63.168942, -17.778532), 4326),\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days',\n    now() - interval '3 days' - interval '3 hours',\n    'distrito_municipal:11',\n    'unidad_vecinal:3',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 10, 'via_publica',\n    'Charco en cuneta de calle adoquinada con agua al tobillo.',\n    'tobillo', 'ocasional', 'desconocida', 'si', 'no_tapado', false, 'baja', 4, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '3 days' + interval '30 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 12 (1 punto)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.158894, -17.830043), 4326),\n    ST_SetSRID(ST_MakePoint(-63.158894, -17.830043), 4326),\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days',\n    now() - interval '2 days' - interval '2 hours',\n    'distrito_municipal:12',\n    'unidad_vecinal:166',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 9, 'via_publica',\n    'Anegamiento en vía de conexión distrital; vehículos pesados levantan olas.',\n    'rodilla', 'cada_lluvia_fuerte', 'falta_sumidero', 'no', NULL, false, 'media', 7, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '2 days' + interval '22 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO 13 (1 punto)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.101074, -17.896190), 4326),\n    ST_SetSRID(ST_MakePoint(-63.101074, -17.896190), 4326),\n    now() - interval '4 days',\n    now() - interval '4 days',\n    now() - interval '4 days',\n    now() - interval '4 days' - interval '2 hours',\n    'distrito_municipal:13',\n    'unidad_vecinal:0',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 12, 'via_publica',\n    'Escurrimiento lento en zanja pluvial de barrio sin ingreso a viviendas.',\n    'tobillo', 'primera_vez', 'desconocida', 'no', NULL, false, 'baja', 3, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '4 days' + interval '10 minutes'\n  ),\n\n  -- =========================================================================\n  -- DISTRITO PARQUE INDUSTRIAL (1 punto)\n  -- =========================================================================\n  (\n    ST_SetSRID(ST_MakePoint(-63.142701, -17.755296), 4326),\n    ST_SetSRID(ST_MakePoint(-63.142701, -17.755296), 4326),\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day',\n    now() - interval '1 day' - interval '2 hours',\n    'distrito_municipal:PI',\n    'unidad_vecinal:Parque Industrial',\n    'DM_UV_MZ_2025',\n    '{\"en_limite\": false, \"distrito_discrepante\": false}'::jsonb,\n    'gps', 7, 'via_publica',\n    'Retención de agua en acceso a manzana industrial por sumidero bloqueado.',\n    'rodilla', 'cada_lluvia_fuerte', 'sumidero_tapado', 'si', 'tapado', false, 'media', 7, 2, 'validado',\n    '12f435be-5854-41bd-876c-a3ab833247b3', now() - interval '1 day' + interval '18 minutes'\n  );\n\nCOMMIT;\n",
  shaManual: '241f000cf89424d88a2bd8e6ff5b40f8f25c80f84ed33e5b7227972e60e75274',
};
