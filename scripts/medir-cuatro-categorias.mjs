/** M9: banco SQL sintético conservado. Importar este archivo no hace I/O ni conecta. */
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { freemem, platform, release, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseEnv, promisify } from 'node:util';
import { redact } from './multitematica-local.mjs';

export const DATABASE = 'curichi_sdd_m9_20261025';
export const BOOTSTRAP = 'curichi_e2e';
export const TOTAL = 1_000_000;
export const BATCH = 10_000;
export const SEED = 'm9-2026-10-25-v1';
export const CATEGORIES = Object.freeze(['inundacion', 'bache', 'area_verde', 'basura']);
const OWNER = 'curichi';
const VERSION = 'DM_UV_MZ_2025';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = path.join(ROOT, '.turbo/m9-2026-10-25/relevo-implementador/operacion');
const LAYERS = ['distrito_municipal', 'unidad_vecinal'];
const BBOX_CASE = 'publico:area_verde:barrio';
const BBOX_CASE_FILE = 'consulta-publico-area_verde-barrio.json';
const BBOX_RECOVERY_FILE = 'recuperacion-consulta-bbox-verificada.json';
const BBOX_INCIDENT = {
  id: BBOX_CASE,
  file: BBOX_CASE_FILE,
  evidence: BBOX_RECOVERY_FILE,
  code: 'BBOX',
  completed: 137,
  queries: 31,
  statements: 2,
  folder: 'ejecucion-36d2f81d-df91-4856-94ee-2eae04ea5d30',
  runnerHash: 'b2be5543860d86d3b8e9e22d2af21a9657413b8d402509de2239d2f92152f4fb',
  testsHash: 'fb562ad73635549a418af8f1796aea7911abef90e044e3c8b9fb888ee75daaf5',
};
const TOP50_INCIDENT = {
  id: 'indicadores:basura',
  file: 'consulta-indicadores-basura.json',
  evidence: 'recuperacion-consulta-top50-verificada.json',
  code: 'TOP50',
  completed: 160,
  queries: 54,
  statements: 5,
  folder: 'ejecucion-ee025c03-d5f7-4dcf-b4f4-103531d17dcb',
  runnerHash: 'f4124cdccfcd9680a2c17cb8e5eb4734446578574537979e7a305b48d5052c86',
  testsHash: 'f5fc0e9829a5dbb1051c6cfb37795bd549fac718036956090713c5604430ed72',
};
const USAGE =
  'node scripts/medir-cuatro-categorias.mjs preparar|medir|estado|recuperar-equivalencia|recuperar-consulta-bbox|recuperar-consulta-top50|--ayuda';
class GuardError extends Error {}
const fail = (code) => {
  throw new GuardError(code);
};
export function failureDiagnostic(error, stage) {
  let code = 'ERROR_NO_CLASIFICADO';
  if (error instanceof GuardError) code = error.message.split(':')[0];
  else if (
    [
      'ENOENT',
      'EACCES',
      'EPERM',
      'ENOSPC',
      'EEXIST',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
    ].includes(error?.code)
  )
    code = error.code;
  else if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code))
    code = `SQLSTATE_${error.code}`;
  return {
    event: 'fallo',
    stage: [
      'inicio',
      'entorno',
      'recursos',
      'manifiesto',
      'modulos',
      'preparar',
      'medir',
      'estado',
      'recuperar-equivalencia',
      'recuperar-consulta-bbox',
      'recuperar-consulta-top50',
    ].includes(stage)
      ? stage
      : 'inicio',
    code,
    exit: 1,
    ...(error instanceof GuardError && error.resources ? { resources: error.resources } : {}),
  };
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
const marker = (state) => `medir-cuatro-categorias/v1/${state.run}`;
const META = `SELECT oid::text, pg_get_userbyid(datdba) AS owner,
 shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = $1`;
const QUERY_IDS = [];
for (const category of [...CATEGORIES, 'todas']) {
  for (const view of category === 'todas' ? ['tecnico'] : ['publico', 'tecnico'])
    for (const box of ['chico', 'barrio', 'ciudad', 'primera'])
      QUERY_IDS.push(`${view}:${category}:${box}`);
  QUERY_IDS.push(`exportar:${category}`, `indicadores:${category}`);
  for (const window of ['todo', '7d', '30d']) QUERY_IDS.push(`ejecutivo:${category}:${window}`);
  if (category !== 'todas') QUERY_IDS.push(`uv:${category}`, `dbscan:${category}`);
}
QUERY_IDS.push('pip:interior', 'pip:fuera');
const JOBS = [
  'migrate',
  'layers',
  'activate',
  ...Array.from({ length: TOTAL / BATCH }, (_, i) => `load:${i}`),
  'analyze',
  'validate',
  'equivalence',
  ...QUERY_IDS.map((id) => `query:${id}`),
  'sizes',
];

export function parseAction(args) {
  if (
    args.length !== 1 ||
    ![
      'preparar',
      'medir',
      'estado',
      'recuperar-equivalencia',
      'recuperar-consulta-bbox',
      'recuperar-consulta-top50',
      '--ayuda',
    ].includes(args[0])
  )
    fail(`USO: ${USAGE}`);
  return args[0];
}

function credential(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('URL_INVALIDA');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5432' ||
    url.search ||
    url.hash ||
    url.username !== OWNER ||
    !url.password ||
    ![...['curichi', BOOTSTRAP, 'curichi_multitematica'], DATABASE].some(
      (name) => url.pathname === `/${name}`,
    )
  )
    fail('URL_NO_PERMITIDA');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

export function validateUrl(value, database = DATABASE) {
  if (![DATABASE, BOOTSTRAP].includes(database)) fail('DESTINO_NO_PERMITIDO');
  const url = credential(value);
  if (url.pathname !== `/${database}`) fail('BASE_NO_PERMITIDA');
  return url.toString();
}

export function deriveUrls(source) {
  // El original nunca se entrega a pg ni se escribe en evidencia.
  const original = credential(source.DATABASE_URL);
  const owner = new URL(original);
  owner.pathname = `/${DATABASE}`;
  const bootstrap = new URL(original);
  bootstrap.pathname = `/${BOOTSTRAP}`;
  return Object.freeze({
    owner: validateUrl(owner.href),
    bootstrap: validateUrl(bootstrap.href, BOOTSTRAP),
  });
}

function validateConnections(urls) {
  validateUrl(urls?.owner);
  validateUrl(urls?.bootstrap, BOOTSTRAP);
  if (
    new URL(urls.owner).hostname !== new URL(urls.bootstrap).hostname ||
    new URL(urls.owner).username !== new URL(urls.bootstrap).username ||
    new URL(urls.owner).password !== new URL(urls.bootstrap).password
  )
    fail('SERVIDORES_NO_PERMITIDOS');
}

function knownJob(job) {
  return JOBS.includes(job);
}

export function validateState(state, allowPending = false) {
  if (
    state?.version !== 1 ||
    state.database !== DATABASE ||
    state.owner !== OWNER ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(state.run) ||
    !/^[1-9]\d*$/.test(String(state.oid)) ||
    state.seed !== SEED ||
    !/^[a-f0-9]{64}$/.test(state.fingerprint) ||
    !Array.isArray(state.completed) ||
    state.completed.some((job, i) => job !== JOBS[i]) ||
    new Set(state.completed).size !== state.completed.length ||
    !(state.pending === null || knownJob(state.pending))
  )
    fail('ESTADO_NO_RECONOCIDO');
  if (state.pending && !allowPending) fail('ETAPA_INCIERTA_INSPECCION_REQUERIDA');
  return state;
}

export function assertResources(resources, minimumGiB = 5, location = 'general') {
  if (
    !(resources?.freeMiB >= 1500) ||
    !(resources.diskFreeGiB >= minimumGiB) ||
    !(resources.databaseFreeGiB >= minimumGiB)
  )
    throw Object.assign(new GuardError('RECURSOS_INSUFICIENTES_CONSERVAR_EVIDENCIA'), {
      resources: {
        ...Object.fromEntries(
          ['freeMiB', 'diskFreeGiB', 'databaseFreeGiB'].map((key) => [
            key,
            typeof resources?.[key] === 'number' && Number.isFinite(resources[key])
              ? resources[key]
              : null,
          ]),
        ),
        minimumMiB: 1500,
        minimumGiB: Number.isFinite(minimumGiB) ? minimumGiB : null,
        location: [
          'general',
          'equivalence:antes-completo',
          'equivalence:antes-snapshot',
          'equivalence:antes-acotado',
          'recuperacion:antes-validacion',
          'recuperacion:particiones',
        ].includes(location)
          ? location
          : 'general',
      },
    });
}

export async function assertIdentity(client, state) {
  const {
    rows: [identity],
  } = await client.query(
    'SELECT current_database() AS database, current_user AS role, session_user AS session',
  );
  const {
    rows: [meta],
  } = await client.query(META, [DATABASE]);
  if (
    identity?.database !== DATABASE ||
    identity.role !== OWNER ||
    identity.session !== OWNER ||
    meta?.oid !== String(state.oid) ||
    meta.owner !== OWNER ||
    meta.marker !== marker(state)
  )
    fail('PROCEDENCIA_O_IDENTIDAD_NO_RECONOCIDA');
  return { database: DATABASE, owner: OWNER, oid: meta.oid, marker: meta.marker };
}

export async function withDatabase(urls, state, deps, action, allowPending = false) {
  validateConnections(urls);
  validateState(state, allowPending);
  const client = deps.client(urls.owner);
  try {
    await client.connect();
    await assertIdentity(client, state);
    return await action(client);
  } finally {
    await client.end();
  }
}

export async function durableJob(client, state, deps, job, action) {
  validateState(state);
  if (!knownJob(job)) fail('JOB_NO_PERMITIDO');
  if (state.completed.includes(job)) return;
  if (job !== JOBS[state.completed.length]) fail('ORDEN_DE_ETAPAS_NO_RECONOCIDO');
  const resources = await deps.resources();
  assertResources(resources);
  const before = await assertIdentity(client, state);
  state.pending = job;
  await deps.save(state);
  await deps.record({ event: 'antes_job', job, ...before, resources });
  const start = performance.now();
  // Si falla action, identidad, evidencia o save, pending queda durable. Nada se repite solo.
  const result = await action();
  const after = await assertIdentity(client, state);
  await deps.record({ event: 'despues_job', job, ...after, durationMs: performance.now() - start });
  const next = { ...state, completed: [...state.completed, job], pending: null };
  await deps.save(next);
  Object.assign(state, next);
  return result;
}

export function statistics(samples) {
  if (!samples.length || samples.some((n) => !Number.isFinite(n) || n < 0))
    fail('MUESTRAS_INVALIDAS');
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: [...samples],
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    max: sorted.at(-1),
    n: samples.length,
  };
}

function unit(index, axis, seed) {
  return createHash('sha256').update(`${seed}:${axis}:${index}`).digest().readUInt32BE(0) / 2 ** 32;
}

export function sampleAxes(index, seed = SEED) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= TOTAL) fail('INDICE_FIXTURE_INVALIDO');
  const state = unit(index, 'estado', seed);
  return {
    category: CATEGORIES[index % 4],
    state:
      state < 0.25
        ? 'nuevo'
        : state < 0.8
          ? 'validado'
          : state < 0.9
            ? 'resuelto'
            : state < 0.95
              ? 'rechazado'
              : 'duplicado',
    space: Math.floor(unit(index, 'espacio', seed) * 576),
    minute: Math.floor(unit(index, 'tiempo', seed) * 525600),
    private: unit(index, 'privacidad', seed) < 0.2,
    fixture: Math.floor(unit(index, 'detalle', seed) * 2 ** 30),
    manual: unit(index, 'reclasificacion', seed) < 0.03,
    publicMissing: unit(index, 'publico-ausente', seed) < 0.02,
  };
}

export function witnessFor(index) {
  const position = Math.floor(index / 4);
  const count = [2, 3, 4, 5][index % 4];
  return position < count ? { offsetM: position === 0 ? 0 : 20 } : null;
}

export function makeFixtures(contracts) {
  const result = [];
  for (const category of CATEGORIES) {
    const def = contracts.REGISTRO_CATEGORIAS.obtener(category);
    if (!def?.detalleVersion || !def.severidad.version) fail('DEFINICION_NO_RECONOCIDA');
    let details;
    if (category === 'inundacion') {
      details = contracts.PROFUNDIDADES.flatMap((depth) =>
        contracts.FRECUENCIAS.map((frequency) => ({
          profundidad_estimada: depth,
          frecuencia: frequency,
          causa_presunta: 'desconocida',
        })),
      );
    } else {
      const options = (key) =>
        def.preguntas.find((q) => q.id === key)?.opciones?.map((o) => o.valor);
      details = options('gravedad_declarada').flatMap((gravity) =>
        options('tamano').map((size) => ({ gravedad_declarada: gravity, tamano: size })),
      );
    }
    for (const subtype of def.subtipos?.map((s) => s.valor) ?? [null]) {
      for (const detail of details) {
        const parsed = def.esquemaDetalle.parse(detail);
        result.push({
          category,
          subtype,
          detail: parsed,
          detailVersion: def.detalleVersion,
          severity: def.severidad.calcular(parsed, subtype ?? undefined),
          severityVersion: def.severidad.version,
        });
      }
    }
  }
  return result;
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function readLayers() {
  const result = [];
  for (const capa of LAYERS) {
    const dir = path.join(ROOT, 'data/processed', VERSION, capa);
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'metadata.json'), 'utf8'));
    if (
      meta.capa !== capa ||
      meta.version !== VERSION ||
      meta.crs_origen !== 'EPSG:32720' ||
      meta.crs_salida !== 'EPSG:4326' ||
      meta.n_features_salida !== (capa === LAYERS[0] ? 16 : 576) ||
      !/^[a-f0-9]{64}$/.test(meta.sha256_manifiesto)
    )
      fail('METADATA_MUNICIPAL_NO_RECONOCIDA');
    for (const kind of ['full', 'web'])
      if (
        (await hashFile(path.join(dir, `${capa}.${kind}.geojson`))) !== meta.sha256_salida?.[kind]
      )
        fail('HUELLA_PROCESADA_NO_COINCIDE');
    result.push(meta);
  }
  return result;
}

export async function verifyLayers(client, expected) {
  const { rows } =
    await client.query(`SELECT capa, version, n_features, crs_origen, sha256_manifiesto
    FROM geo.capa_version WHERE vigente ORDER BY capa`);
  if (
    rows.length !== 2 ||
    rows.some(
      (r, i) =>
        r.capa !== expected[i].capa ||
        r.version !== VERSION ||
        r.n_features !== expected[i].n_features_salida ||
        r.crs_origen !== expected[i].crs_origen ||
        r.sha256_manifiesto !== expected[i].sha256_manifiesto,
    )
  )
    fail('CAPAS_NO_RECONOCIDAS');
  for (const layer of LAYERS) {
    const {
      rows: [r],
    } = await client.query(`SELECT count(*)::int AS n FROM geo.${layer} WHERE version_capa = $1`, [
      VERSION,
    ]);
    if (r.n !== expected.find((e) => e.capa === layer).n_features_salida)
      fail('CONTEO_CAPAS_NO_COINCIDE');
  }
}

export async function createBank(urls, deps, fingerprint) {
  validateConnections(urls);
  let state = await deps.load();
  if (state !== null) {
    validateState(state);
    return state;
  }
  const resources = await deps.resources();
  assertResources(resources);
  const client = deps.client(urls.bootstrap);
  try {
    await client.connect();
    const {
      rows: [id],
    } = await client.query(
      'SELECT current_database() AS database, current_user AS role, session_user AS session',
    );
    if (id?.database !== BOOTSTRAP || id.role !== OWNER || id.session !== OWNER)
      fail('BOOTSTRAP_NO_RECONOCIDO');
    const { rows } = await client.query(META, [DATABASE]);
    if (rows.length) fail('BANCO_EXISTENTE_SIN_PROCEDENCIA_CONSERVADO');
    const {
      rows: [role],
    } = await client.query(
      'SELECT rolname, rolcanlogin, rolcreatedb, rolsuper FROM pg_roles WHERE rolname = $1',
      [OWNER],
    );
    if (!role?.rolcanlogin || !(role.rolcreatedb || role.rolsuper)) fail('DUENO_NO_PUEDE_CREAR');
    state = {
      version: 1,
      database: DATABASE,
      owner: OWNER,
      run: randomUUID(),
      oid: null,
      seed: SEED,
      completed: [],
      pending: 'create',
      fingerprint,
    };
    // Escribir intención ANTES del CREATE: caída aquí exige inspección, nunca adopción.
    await deps.save(state);
    await deps.record({ event: 'antes_create', database: DATABASE, run: state.run, resources });
    await client.query(`CREATE DATABASE ${DATABASE} OWNER ${OWNER} TEMPLATE template0`);
    await client.query(`COMMENT ON DATABASE ${DATABASE} IS '${marker(state)}'`);
    const {
      rows: [meta],
    } = await client.query(META, [DATABASE]);
    if (!meta?.oid || meta.owner !== OWNER || meta.marker !== marker(state))
      fail('PROCEDENCIA_CREATE_INCIERTA');
    state.oid = meta.oid;
    state.pending = null;
    await deps.record({ event: 'despues_create', database: DATABASE, ...meta });
    await deps.save(state);
    return state;
  } finally {
    await client.end();
  }
}

function executor(client) {
  const ex = {
    consultar: async (sql, params = []) => (await client.query(sql, params)).rows,
    ejecutar: async (sql) => {
      await client.query(sql);
    },
    transaccion: async (action) => {
      await client.query('BEGIN');
      try {
        const value = await action(ex);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };
  return ex;
}

async function activate(client, modules) {
  const password = randomBytes(32).toString('base64url');
  // Cuenta sintética, hash real del módulo actual; ni clave ni hash en evidencia.
  const hash = await modules.db.hashPassword(password);
  await executor(client).transaccion(async (tx) => {
    const [actor] = await tx.consultar(
      `INSERT INTO usuario(email,nombre,rol,password_hash)
      VALUES ('m9-sintetico@curichi.local','Banco M9 sintético','admin',$1) RETURNING id`,
      [hash],
    );
    for (const category of CATEGORIES) {
      const [before] = await tx.consultar(
        'SELECT slug, activa FROM categoria WHERE slug=$1 FOR UPDATE',
        [category],
      );
      if (!before) fail('CATALOGO_INCOMPLETO');
      await tx.consultar(
        'UPDATE categoria SET activa=true, activada_por=$2, activada_en=now() WHERE slug=$1',
        [category, actor.id],
      );
      await tx.consultar(
        `INSERT INTO auditoria(entidad,entidad_id,accion,actor_id,antes,despues)
        VALUES ('categoria',$1,'categoria:activar',$2,$3::jsonb,$4::jsonb)`,
        [
          category,
          actor.id,
          JSON.stringify(before),
          JSON.stringify({ slug: category, activa: true, banco: DATABASE, sintetico: true }),
        ],
      );
    }
  });
}

export async function prepare(urls, deps, modules, manifest) {
  const state = await createBank(urls, deps, manifest.fingerprint);
  if (state.fingerprint !== manifest.fingerprint) fail('FUENTES_CAMBIARON_INSPECCION_REQUERIDA');
  return withDatabase(urls, state, deps, async (client) => {
    await durableJob(client, state, deps, 'migrate', async () => {
      await modules.db.aplicarMigraciones(executor(client), {
        hasta: '0021',
        lockTimeoutMs: 10000,
      });
    });
    const { rows: migrations } = await client.query(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    if (JSON.stringify(migrations.map((r) => r.nombre)) !== JSON.stringify(manifest.migrations))
      fail('MIGRACIONES_NO_RECONOCIDAS');
    await durableJob(client, state, deps, 'layers', () =>
      modules.load(executor(client), VERSION, LAYERS, {
        log: () => {},
        dirProcesado: path.join(ROOT, 'data/processed', VERSION),
      }),
    );
    await verifyLayers(client, manifest.layers);
    await durableJob(client, state, deps, 'activate', () => activate(client, modules));
    const fixtures = makeFixtures(modules.contracts);
    await deps.artifact('fixtures.json', fixtures);
    for (let batch = 0; batch < TOTAL / BATCH; batch++) {
      await durableJob(client, state, deps, `load:${batch}`, async () => {
        const {
          rows: [count],
        } = await client.query('SELECT count(*)::int AS n FROM reporte');
        if (count.n !== batch * BATCH) fail('CONTEO_PRELOTE_NO_COINCIDE');
        await insertBatch(client, batch, fixtures, modules.contracts);
      });
    }
    await durableJob(client, state, deps, 'analyze', () => client.query('ANALYZE reporte'));
    await durableJob(client, state, deps, 'validate', () =>
      validateDataset(client, fixtures, deps),
    );
    return state;
  });
}

async function insertBatch(client, batch, fixtures, contracts) {
  const input = Array.from({ length: BATCH }, (_, n) => {
    const index = batch * BATCH + n;
    const axes = sampleAxes(index);
    const candidates = fixtures.filter((f) => f.category === axes.category);
    const fixture = candidates[axes.fixture % candidates.length];
    const hash = digest(`${SEED}:id:${index}`);
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return { index, id, ...axes, ...fixture, witness: witnessFor(index) };
  });
  const {
    rows: [anchor],
  } = await client.query(`WITH uv AS (
      SELECT id,distrito_id,geom,ST_Transform(ST_PointOnSurface(geom),32720) AS p
      FROM geo.unidad_vecinal_vigente)
    SELECT id AS uv,distrito_id AS district,ST_X(ST_Transform(p,4326)) AS lon,
      ST_Y(ST_Transform(p,4326)) AS lat FROM uv
    WHERE ST_Contains(ST_Transform(geom,32720),ST_Buffer(p,110)) ORDER BY id LIMIT 1`);
  if (!anchor) fail('ANCLA_TESTIGOS_NO_DISPONIBLE');
  // Espacio, tiempo, estado y privacidad provienen de hashes con dominios distintos.
  // ST_GeneratePoints recibe semilla explícita positiva por UV/lote. Nunca random() ni setseed().
  const { rows: points } = await client.query(
    `WITH input AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(index int, space int)
    ), uv AS (SELECT *, row_number() OVER (ORDER BY id)-1 AS pos FROM geo.unidad_vecinal_vigente),
    assigned AS (SELECT i.index, u.id, u.geom, u.distrito_id,
      row_number() OVER (PARTITION BY u.id ORDER BY i.index) AS pos FROM input i JOIN uv u ON u.pos=i.space),
    counts AS (SELECT id, count(*)::int AS n FROM assigned GROUP BY id),
    points AS (SELECT u.id, (p).path[1] AS pos, (p).geom AS geom FROM uv u JOIN counts c USING(id)
      CROSS JOIN LATERAL ST_Dump(ST_GeneratePoints(
        ST_Difference(u.geom,ST_Transform(ST_Buffer(ST_Transform(ST_SetSRID(ST_MakePoint($3,$4),4326),32720),100),4326)),c.n,
        (('x'||substr(md5($2||u.id),1,7))::bit(28)::int)+1)) p)
    SELECT a.index, ST_X(p.geom) AS lon, ST_Y(p.geom) AS lat, a.id AS uv, a.distrito_id AS district
    FROM assigned a JOIN points p ON p.id=a.id AND p.pos=a.pos ORDER BY a.index`,
    [
      JSON.stringify(input.map(({ index, space }) => ({ index, space }))),
      `${SEED}:${batch}:`,
      anchor.lon,
      anchor.lat,
    ],
  );
  if (points.length !== BATCH) fail('GENERACION_ESPACIAL_INCOMPLETA');
  const { rows: witnessPoints } = await client.query(
    `SELECT offset_m,
    ST_X(p) AS lon,ST_Y(p) AS lat FROM (SELECT offset_m,
      ST_Transform(ST_Translate(ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),32720),offset_m,0),4326) AS p
      FROM (VALUES (0),(20)) v(offset_m)) t`,
    [anchor.lon, anchor.lat],
  );
  const rows = input.map((row, i) => {
    let point = points[i];
    if (point.index !== row.index) fail('ORDEN_ESPACIAL_NO_COINCIDE');
    if (row.witness)
      point = { ...anchor, ...witnessPoints.find((p) => p.offset_m === row.witness.offsetM) };
    const location = row.private ? 'vivienda_o_predio' : 'via_publica';
    const pub = contracts.coordenadaPublica(
      point.lat,
      point.lon,
      row.id,
      `${SEED}:sal-exclusivamente-sintetica`,
      location,
      contracts.CONFIG_DOMINIO.JITTER_PUBLICO_M,
      contracts.CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
    );
    const date = new Date(Date.UTC(2025, 9, 24) + row.minute * 60_000).toISOString();
    return {
      id: row.id,
      category: row.category,
      subtype: row.subtype,
      detail: row.detail,
      detail_version: row.detailVersion,
      severity: row.severity.banda,
      score: row.severity.puntaje,
      severity_version: row.severityVersion,
      state: row.witness ? 'validado' : row.state,
      date,
      location,
      manual: row.witness ? 'alta' : row.manual ? 'critica' : null,
      lon: point.lon,
      lat: point.lat,
      public_lon: row.publicMissing && !row.witness ? null : pub.lon,
      public_lat: row.publicMissing && !row.witness ? null : pub.lat,
      uv: point.uv,
      district: point.district,
    };
  });
  await executor(client).transaccion(async (tx) => {
    await tx.consultar(
      `INSERT INTO reporte (id,categoria,subtipo,detalle,detalle_version,
      geom,geom_publico,distrito_id,unidad_vecinal_id,version_capa,resolucion_flags,creado_en,actualizado_en,publicar_en,
      descripcion,ubicacion_tipo,ubicacion_metodo,precision_gps_m,distancia_dispositivo_m,
      profundidad_estimada,frecuencia,causa_presunta,sumidero_cercano,sumidero_estado,agua_brota_sumidero,
      severidad_calculada,severidad_puntaje,severidad_version,severidad_manual,severidad_motivo,estado,estado_motivo)
      SELECT x.id,category,subtype,detail,detail_version,
        ST_SetSRID(ST_MakePoint(lon,lat),4326),ST_SetSRID(ST_MakePoint(public_lon,public_lat),4326),
        territorial.distrito_id,territorial.id,territorial.version_capa,
        jsonb_build_object('en_limite',territorial.coincidencias>1,'asignado_por_proximidad',false,
          'distancia_m',NULL,'distrito_discrepante',pip.id IS NOT NULL AND pip.id<>territorial.distrito_id),
        date,date,date+interval '60 seconds',
        'Fixture sintético de medición M9; no es un reporte ciudadano.',location::ubicacion_tipo,
        'aproximada',1000,NULL,
        (detail->>'profundidad_estimada')::profundidad_estimada,(detail->>'frecuencia')::frecuencia,
        (detail->>'causa_presunta')::causa_presunta,(detail->>'sumidero_cercano')::sumidero_cercano,
        (detail->>'sumidero_estado')::sumidero_estado,(detail->>'agua_brota_sumidero')::boolean,
        severity::severidad,score,severity_version,manual::severidad,
        CASE WHEN manual IS NOT NULL THEN 'Reclasificación sintética M9' END,state::estado_reporte,
        CASE WHEN state IN ('rechazado','duplicado','resuelto') THEN 'Estado sintético del banco M9' END
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,category text,subtype text,detail jsonb,
        detail_version smallint,lon float8,lat float8,public_lon float8,public_lat float8,district text,uv text,
        date timestamptz,location text,severity text,score smallint,severity_version smallint,manual text,state text)
      CROSS JOIN LATERAL (SELECT u.id,u.distrito_id,u.version_capa,count(*) OVER () AS coincidencias
        FROM geo.unidad_vecinal_vigente u WHERE ST_Intersects(u.geom,ST_SetSRID(ST_MakePoint(x.lon,x.lat),4326))
        ORDER BY u.id LIMIT 1) territorial
      LEFT JOIN LATERAL (SELECT d.id FROM geo.distrito_municipal_vigente d
        WHERE ST_Intersects(d.geom,ST_SetSRID(ST_MakePoint(x.lon,x.lat),4326)) ORDER BY d.id LIMIT 1) pip ON true`,
      [JSON.stringify(rows)],
    );
  });
}

export async function validateDataset(client, fixtures, deps) {
  const { rows: totals } = await client.query(
    'SELECT categoria,count(*)::int AS n FROM reporte GROUP BY categoria ORDER BY categoria',
  );
  if (
    totals.length !== 4 ||
    totals.some((r) => !CATEGORIES.includes(r.categoria) || r.n !== TOTAL / 4)
  )
    fail('VOLUMEN_NO_COINCIDE');
  const {
    rows: [invalid],
  } = await client.query(
    `SELECT count(*)::int AS n FROM reporte r
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($1::jsonb)
      AS f(category text,subtype text,detail jsonb,"detailVersion" int,severity jsonb,"severityVersion" int)
      WHERE r.categoria=f.category AND r.subtipo IS NOT DISTINCT FROM f.subtype AND r.detalle=f.detail
      AND r.detalle_version=f."detailVersion" AND r.severidad_version=f."severityVersion"
      AND r.severidad_puntaje=(f.severity->>'puntaje')::int AND r.severidad_calculada::text=f.severity->>'banda')`,
    [JSON.stringify(fixtures)],
  );
  if (invalid.n) fail('DETALLES_O_SEVERIDADES_INVALIDOS');
  const { rows: territory } = await client.query(
    `/* m9:territorio */ SELECT count(*)::int AS total,
    count(*) FILTER (WHERE u.id IS NULL OR r.unidad_vecinal_id IS DISTINCT FROM u.id
      OR r.distrito_id IS DISTINCT FROM u.distrito_id OR r.version_capa IS DISTINCT FROM u.version_capa
      OR r.version_capa<>$1 OR r.resolucion_flags IS DISTINCT FROM
        jsonb_build_object('en_limite',u.coincidencias>1,'asignado_por_proximidad',false,
          'distancia_m',NULL,'distrito_discrepante',d.id IS NOT NULL AND d.id<>u.distrito_id))::int AS invalidos,
    count(*) FILTER (WHERE u.coincidencias>1)::int AS en_limite,
    count(*) FILTER (WHERE d.id IS NOT NULL AND d.id<>u.distrito_id)::int AS distrito_discrepante
    FROM reporte r LEFT JOIN LATERAL (SELECT id,distrito_id,version_capa,count(*) OVER () AS coincidencias
      FROM geo.unidad_vecinal_vigente WHERE ST_Intersects(geom,r.geom) ORDER BY id LIMIT 1) u ON true
    LEFT JOIN LATERAL (SELECT id FROM geo.distrito_municipal_vigente
      WHERE ST_Intersects(geom,r.geom) ORDER BY id LIMIT 1) d ON true`,
    [VERSION],
  );
  if (territory.length !== 1 || territory[0].total !== TOTAL || territory[0].invalidos !== 0)
    fail('ORACULO_TERRITORIAL');
  await deps.artifact('control-territorial.json', {
    version: VERSION,
    territory,
    selection: 'primera UV por id; distrito de UV; flags cruzados con PIP de distrito',
  });
  const { rows: triggers } = await client.query(`SELECT tgname,tgenabled FROM pg_trigger
    WHERE tgrelid='reporte'::regclass AND NOT tgisinternal ORDER BY tgname`);
  if (
    !triggers.some((r) => r.tgname === 'reporte_sincronizar_detalle') ||
    triggers.some((r) => r.tgenabled !== 'O')
  )
    fail('TRIGGERS_NO_ACTIVOS');
  const { rows: distribution } = await client.query(`SELECT categoria,estado,unidad_vecinal_id,
      extract(month FROM creado_en)::int AS mes,ubicacion_tipo,count(*)::int AS n
    FROM reporte GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5`);
  await deps.artifact('distribucion.json', { seed: SEED, totals, distribution, triggers });
}

// CA8 queda NO_MEDIDO: solo SQL, sin HTTP, front ni concurrencia. Manzanas omitidas: ninguna
// consulta del banco las utiliza. El banco y todas las evidencias se conservan para revisión.

export async function loadModules() {
  const load = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
  const contracts = await load('packages/contracts/dist/index.js');
  const db = await load('packages/db/dist/index.js');
  const etl = await load('pipelines/geodata-etl/dist/pasos/cargar.js');
  return {
    contracts,
    db,
    load: etl.cargarVersion,
    queries: await load('services/api-core/dist/consultas.js'),
    admin: await load('services/api-core/dist/rutas/admin.js'),
    executive: await load('services/api-core/dist/rutas/ejecutivo.js'),
    geo: await load('services/geo-service/dist/visibilidad.js'),
    resolver: await load('services/geo-service/dist/resolver.js'),
  };
}

function recorder() {
  const statements = [];
  const pool = {
    query: async (sql, params = []) => {
      if (/^\s*(SELECT|WITH)/i.test(sql)) statements.push({ sql, params });
      return { rows: /^\s*SELECT count\(\*\)/i.test(sql) ? [{ n: '0' }] : [] };
    },
    connect: async () => ({ ...pool, release() {} }),
  };
  return { pool, statements };
}

async function captureHandler(register, route, query) {
  const { pool, statements } = recorder();
  const handlers = new Map();
  const app = {
    get: (name, options, handler) => handlers.set(name, handler ?? options),
    post() {},
    patch() {},
  };
  await register(app, {
    pool,
    cfg: { zonaHoraria: 'America/La_Paz', urlPublica: 'http://127.0.0.1' },
  });
  const reply = {
    status() {
      return this;
    },
    header() {
      return this;
    },
    send(value) {
      return value;
    },
  };
  await handlers.get(route)({ query, log: { info() {} } }, reply);
  if (!statements.length) fail('CAPTURA_SIN_SQL');
  return statements;
}

export async function buildCases(modules, context) {
  const cases = [];
  const { lon, lat } = context.point;
  const boxes = {
    chico: [lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001],
    barrio: [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01],
    ciudad: context.bbox,
    primera: undefined,
  };
  const c = modules.contracts;
  for (const category of [...CATEGORIES, 'todas']) {
    for (const soloPublicos of category === 'todas' ? [false] : [true, false]) {
      for (const [name, bbox] of Object.entries(boxes)) {
        const filtros = c.ReporteFiltrosSchema.parse({
          categoria: category,
          bbox: bbox?.join(','),
          pagina: 1,
          limite: 50,
        });
        const { pool, statements } = recorder();
        await modules.queries.listarReportes(pool, {
          filtros,
          soloPublicos,
          zonaHoraria: 'America/La_Paz',
        });
        cases.push({
          id: `${soloPublicos ? 'publico' : 'tecnico'}:${category}:${name}`,
          kind: 'listado',
          category,
          soloPublicos,
          filtros,
          statements,
        });
      }
    }
    const exportFilters = c.ExportarQuerySchema.parse({ categoria: category, formato: 'geojson' });
    const recorded = recorder();
    await modules.queries.seleccionarParaExportar(recorded.pool, {
      filtros: exportFilters,
      soloPublicos: false,
      zonaHoraria: 'America/La_Paz',
    });
    cases.push({
      id: `exportar:${category}`,
      kind: 'exportar',
      category,
      filtros: exportFilters,
      statements: recorded.statements,
    });
    cases.push({
      id: `indicadores:${category}`,
      kind: 'indicadores',
      category,
      statements: await captureHandler(modules.admin.rutasAdmin, '/api/v1/indicadores', {
        categoria: category,
      }),
    });
    for (const window of ['todo', '7d', '30d']) {
      cases.push({
        id: `ejecutivo:${category}:${window}`,
        kind: 'ejecutivo',
        category,
        statements: await captureHandler(
          modules.executive.rutasEjecutivo,
          '/api/v1/ejecutivo/resumen',
          { categoria: category, ventana: window },
        ),
      });
    }
    if (category !== 'todas') {
      cases.push({
        id: `uv:${category}`,
        kind: 'uv',
        category,
        statements: [{ sql: modules.geo.SQL_AGREGADOS_UV, params: [category] }],
      });
      const clusterQueries = [];
      const ex = {
        consultar: async (sql, params = []) => {
          if (sql.includes('ST_ClusterDBSCAN')) clusterQueries.push({ sql, params });
          return sql.includes('SELECT DISTINCT categoria') ? [{ categoria: category }] : [];
        },
        ejecutar: async () => {},
        transaccion: async (fn) => fn(ex),
      };
      await modules.db.recalcularPuntosCriticos(ex, undefined, 32720, c.REGISTRO_CATEGORIAS);
      if (clusterQueries.length !== 1) fail('CAPTURA_DBSCAN_NO_RECONOCIDA');
      cases.push({
        id: `dbscan:${category}`,
        kind: 'dbscan',
        category,
        statements: clusterQueries,
      });
    }
  }
  for (const outside of [false, true]) {
    const recorded = recorder();
    const pt = outside ? { lon: context.bbox[0] - 1, lat: context.bbox[1] - 1 } : context.point;
    const pool = {
      query: async (sql, params) => {
        await recorded.pool.query(sql, params);
        if (outside) return { rows: [] };
        if (sql.includes('FROM geo.unidad_vecinal_vigente'))
          return {
            rows: [
              {
                id: pt.uv,
                codigo: 'sintetico',
                nombre: 'sintetico',
                distrito_id: pt.district,
                version_capa: VERSION,
              },
            ],
          };
        return { rows: [{ id: pt.district, codigo: 'sintetico', nombre: 'sintetico' }] };
      },
    };
    await modules.resolver.resolverPunto(pool, pt.lat, pt.lon);
    cases.push({
      id: `pip:${outside ? 'fuera' : 'interior'}`,
      kind: 'pip',
      outside,
      point: pt,
      statements: recorded.statements,
    });
  }
  return cases;
}

function publicStates(contracts) {
  return contracts.ESTADOS_PUBLICOS;
}

async function controlTotals(client, category, contracts, since = null, bbox, publicView = false) {
  // Oráculo de conteo SIN los topes ni joins del listado. Los universos S/L/D se conservan.
  const {
    rows: [row],
  } = await client.query(
    `SELECT count(*)::int AS t,
    count(*) FILTER(WHERE publicar_en<=now())::int AS p,
    count(*) FILTER(WHERE publicar_en<=now() AND estado::text=ANY($2))::int AS s,
    count(*) FILTER(WHERE publicar_en<=now() AND estado::text=ANY($2) AND geom_publico IS NOT NULL)::int AS l,
    count(*) FILTER(WHERE estado IN ('validado','resuelto'))::int AS d,
    count(*) FILTER(WHERE publicar_en<=now() AND estado IN ('validado','resuelto'))::int AS v,
    count(*) FILTER(WHERE publicar_en<=now() AND estado IN ('nuevo','validado'))::int AS activas
    FROM reporte WHERE ($1::text IS NULL OR categoria=$1) AND ($3::timestamptz IS NULL OR creado_en >= $3)
    AND ($4::float8 IS NULL OR ${publicView ? 'geom_publico' : 'geom'} && ST_MakeEnvelope($4,$5,$6,$7,4326))`,
    [
      category === 'todas' ? null : category,
      publicStates(contracts),
      since,
      ...(bbox ?? [null, null, null, null]),
    ],
  );
  return row;
}

const BANDS = ['baja', 'media', 'alta', 'critica'];
const verified = (row) => row.estado === 'validado' || row.estado === 'resuelto';
const active = (row) => row.estado === 'nuevo' || row.estado === 'validado';
const keyOf = (row, fields) => JSON.stringify(fields.map((key) => row[key] ?? null));
function countMap(rows, fields) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row, fields);
    map.set(key, (map.get(key) ?? 0) + Number(row.n));
  }
  return map;
}
const sameCounts = (rows, expected, fields, code) => {
  const actual = new Map(rows.map((r) => [keyOf(r, fields), Number(r.n)]));
  if (actual.size !== rows.length || !isDeepStrictEqual(actual, countMap(expected, fields)))
    fail(code);
};
const sameRows = (actual, expected, code) => {
  const keys = expected.map((r) => JSON.stringify(r));
  if (
    !isDeepStrictEqual(
      actual.map((r) => JSON.stringify(r)),
      keys,
    )
  )
    fail(code);
};

async function controlMatrix(client, category, since) {
  // Sin topes: primero las cuatro categorías completas, después su reducción para Todas.
  const { rows } = await client.query(
    `/* m9:matriz */ SELECT categoria,estado::text AS estado,
    COALESCE(severidad_manual,severidad_calculada)::text AS severidad,distrito_id,unidad_vecinal_id,
    count(*)::int AS n,max(creado_en) AS ultimo FROM reporte
    WHERE publicar_en<=now() AND ($1::timestamptz IS NULL OR creado_en >= $1)
    GROUP BY categoria,estado,COALESCE(severidad_manual,severidad_calculada),distrito_id,unidad_vecinal_id`,
    [since ?? null],
  );
  if (rows.some((r) => !CATEGORIES.includes(r.categoria) || !BANDS.includes(r.severidad)))
    fail('ORACULO_MATRIZ');
  return category === 'todas' ? rows : rows.filter((r) => r.categoria === category);
}

async function controlPage(client, info) {
  // Selección independiente de SELECT_REPORTE/armarWhere: sin joins ni fotos ni conteo truncado.
  const params = [info.category === 'todas' ? null : info.category];
  const where = ['publicar_en<=now()', '($1::text IS NULL OR categoria=$1)'];
  const p = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const f = info.filtros;
  if (info.soloPublicos)
    where.push("estado IN ('nuevo','validado','resuelto')", 'geom_publico IS NOT NULL');
  if (f.estado?.length) where.push(`estado::text=ANY(${p(f.estado)}::text[])`);
  if (f.severidad?.length)
    where.push(
      `COALESCE(severidad_manual,severidad_calculada)::text=ANY(${p(f.severidad)}::text[])`,
    );
  for (const field of ['distrito_id', 'unidad_vecinal_id', 'punto_critico_id'])
    if (f[field]) where.push(`${field}=${p(f[field])}`);
  if (f.desde)
    where.push(`creado_en>=(${p(f.desde)}::date::timestamp AT TIME ZONE 'America/La_Paz')`);
  if (f.hasta)
    where.push(`creado_en<((${p(f.hasta)}::date+1)::timestamp AT TIME ZONE 'America/La_Paz')`);
  if (f.bbox)
    where.push(
      `${info.soloPublicos ? 'geom_publico' : 'geom'} && ST_MakeEnvelope(${f.bbox.map(p).join(',')},4326)`,
    );
  return (
    await client.query(
      `/* m9:pagina */ SELECT id,categoria,estado::text AS estado,creado_en,subtipo,detalle
    FROM reporte WHERE ${where.join(' AND ')} ORDER BY creado_en DESC,id DESC
    LIMIT ${p(f.limite)} OFFSET ${p((f.pagina - 1) * f.limite)}`,
      params,
    )
  ).rows;
}

async function assertMatrixResults(client, info, results, modules) {
  const matrix = await controlMatrix(
    client,
    info.category,
    info.kind === 'ejecutivo' ? info.statements[0].params[0] : null,
  );
  const visible = matrix.filter((r) => publicStates(modules.contracts).includes(r.estado));
  if (info.kind === 'ejecutivo') {
    const { rows: districts } = await client.query(
      '/* m9:distritos */ SELECT id AS distrito_id FROM geo.distrito_municipal_vigente ORDER BY id',
    );
    const ids = new Set([
      ...districts.map((r) => r.distrito_id),
      ...visible.map((r) => r.distrito_id),
    ]);
    const fields = ['nuevo', 'validado', 'resuelto', ...BANDS];
    const expected = new Map(
      [...ids].map((id) => [
        id,
        { ...Object.fromEntries(fields.map((f) => [f, 0])), ultimo: null },
      ]),
    );
    for (const row of visible) {
      const target = expected.get(row.distrito_id);
      target[row.estado] += row.n;
      if (active(row)) target[row.severidad] += row.n;
      const time = new Date(row.ultimo).getTime();
      target.ultimo = Math.max(target.ultimo ?? 0, time);
    }
    const seen = new Set();
    for (const row of results[0]) {
      const target = expected.get(row.distrito_id);
      if (
        !target ||
        seen.has(row.distrito_id) ||
        fields.some((f) => row[f] !== target[f]) ||
        (row.ultimo === null ? null : new Date(row.ultimo).getTime()) !== target.ultimo
      )
        fail('ORACULO_EJECUTIVO');
      seen.add(row.distrito_id);
    }
    if (seen.size !== expected.size) fail('ORACULO_EJECUTIVO');
  } else if (info.kind === 'uv') {
    const { rows: uvs } = await client.query(
      '/* m9:uvs */ SELECT id AS unidad_vecinal_id,distrito_id FROM geo.unidad_vecinal_vigente ORDER BY id',
    );
    const { rows: critical } =
      await client.query(`/* m9:criticos-uv */ SELECT categoria,unidad_vecinal_id,
      count(DISTINCT punto_critico_id)::int AS n FROM reporte
      WHERE publicar_en<=now() AND estado IN ('validado','resuelto') GROUP BY categoria,unidad_vecinal_id`);
    const seen = new Set();
    for (const row of results[0]) {
      const uv = uvs.find((u) => u.unidad_vecinal_id === row.unidad_vecinal_id);
      const members = visible.filter((r) => r.unidad_vecinal_id === row.unidad_vecinal_id);
      const maxBand = (rows) =>
        BANDS.filter((band) => rows.some((r) => r.severidad === band)).at(-1) ?? null;
      const sum = (rows) => rows.reduce((n, r) => n + r.n, 0);
      const nCritical =
        critical.find(
          (r) => r.categoria === info.category && r.unidad_vecinal_id === row.unidad_vecinal_id,
        )?.n ?? 0;
      if (
        !uv ||
        seen.has(row.unidad_vecinal_id) ||
        row.categoria !== info.category ||
        row.distrito_id !== uv.distrito_id ||
        row.n_reportes !== sum(members) ||
        row.n_verificados !== sum(members.filter(verified)) ||
        row.n_puntos_criticos !== nCritical ||
        row.severidad_max !== maxBand(members) ||
        row.severidad_max_verificada !== maxBand(members.filter(verified))
      )
        fail('ORACULO_AGREGADOS_UV');
      seen.add(row.unidad_vecinal_id);
    }
    if (seen.size !== uvs.length) fail('ORACULO_AGREGADOS_UV');
  } else {
    const { rows: critical } =
      await client.query(`/* m9:recurrentes */ SELECT categoria,distrito_id,count(*)::int AS n
      FROM punto_critico WHERE n_reportes>=2 GROUP BY categoria,distrito_id`);
    const recurrent = critical
      .filter((r) => info.category === 'todas' || r.categoria === info.category)
      .reduce((n, r) => n + r.n, 0);
    for (let i = 0; i < results.length; i++) {
      const sql = info.statements[i].sql;
      if (sql.includes('GROUP BY 1, 2'))
        sameCounts(results[i], matrix, ['estado', 'severidad'], 'ORACULO_INDICADORES_ESTADO_BANDA');
      else if (sql.includes('n_reportes >= 2'))
        sameRows(results[i], [{ n: recurrent }], 'ORACULO_INDICADORES_RECURRENCIA');
      else if (sql.includes('GROUP BY distrito_id'))
        sameCounts(results[i], visible, ['distrito_id'], 'ORACULO_INDICADORES_DISTRITO');
      else if (sql.includes('LIMIT 50')) {
        const { rows: uvs } = await client.query(
          '/* m9:uvs */ SELECT id AS unidad_vecinal_id,distrito_id FROM geo.unidad_vecinal_vigente',
        );
        const complete = [...countMap(visible, ['unidad_vecinal_id'])].map(([key, n]) => ({
          unidad_vecinal_id: JSON.parse(key)[0],
          n,
        }));
        // Los conteos siguen siendo independientes; el desempate usa la collation de la base.
        const { rows: ranked } = await client.query(
          `/* m9:top50-uv */ SELECT unidad_vecinal_id,n
          FROM jsonb_to_recordset($1::jsonb) AS t(unidad_vecinal_id text,n int)
          ORDER BY n DESC,unidad_vecinal_id LIMIT 50`,
          [JSON.stringify(complete)],
        );
        sameRows(
          results[i].map((r) => ({ unidad_vecinal_id: r.unidad_vecinal_id, n: r.n })),
          ranked,
          'ORACULO_TOP50_UV',
        );
        if (
          results[i].some(
            (r) =>
              (r.distrito_id ?? null) !==
              (uvs.find((u) => u.unidad_vecinal_id === r.unidad_vecinal_id)?.distrito_id ?? null),
          )
        )
          fail('ORACULO_TOP50_UV_DISTRITO');
      }
    }
  }
  return { matrix, allCategoriesBeforeLimits: info.category === 'todas' };
}

export async function assertResults(client, caseInfo, results, modules) {
  const bbox = caseInfo.filtros?.bbox;
  if (
    bbox !== undefined &&
    (!Array.isArray(bbox) ||
      bbox.length !== 4 ||
      bbox.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      bbox[0] > bbox[2] ||
      bbox[1] > bbox[3])
  )
    fail('ORACULO_BBOX_VALORES');
  const category = caseInfo.category;
  const totals = category
    ? await controlTotals(
        client,
        category,
        modules.contracts,
        caseInfo.kind === 'ejecutivo' ? caseInfo.statements[0].params[0] : null,
        caseInfo.filtros?.bbox,
        caseInfo.soloPublicos,
      )
    : null;
  const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);
  if (caseInfo.kind === 'listado' || caseInfo.kind === 'exportar') {
    const count = caseInfo.soloPublicos ? totals.l : totals.p;
    const reported = Number(results[0][0].n);
    const cap =
      caseInfo.kind === 'listado' ? modules.queries.TOPE_CONTEO + 1 : Number.MAX_SAFE_INTEGER;
    const offset = (caseInfo.filtros.pagina - 1) * caseInfo.filtros.limite;
    if (
      reported !== Math.min(count, cap) ||
      results[1].length !== Math.min(Math.max(0, count - offset), caseInfo.filtros.limite)
    )
      fail('ORACULO_LISTADO_CONTEO');
    const expected = await controlPage(client, caseInfo);
    const project = (row) => ({
      id: row.id,
      categoria: row.categoria,
      estado: row.estado,
      creado_en: new Date(row.creado_en).toISOString(),
      subtipo: row.subtipo,
      detalle: row.detalle,
    });
    if (
      new Set(results[1].map((r) => r.id)).size !== results[1].length ||
      !isDeepStrictEqual(results[1].map(project), expected.map(project))
    )
      fail('ORACULO_PAGINA');
    const lons = [],
      lats = [];
    for (const row of results[1]) {
      if (category !== 'todas' && row.categoria !== category) fail('CONTAMINACION_CATEGORIA');
      if (caseInfo.soloPublicos && !publicStates(modules.contracts).includes(row.estado))
        fail('ORACULO_ESTADO_PUBLICO');
      if (bbox !== undefined) {
        const x = caseInfo.soloPublicos ? row.lon_publico : row.lon;
        const y = caseInfo.soloPublicos ? row.lat_publico : row.lat;
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        )
          fail('ORACULO_BBOX_COORDENADAS');
        lons.push(x);
        lats.push(y);
      }
    }
    if (bbox !== undefined) {
      // Validar los valores devueltos con el mismo operador espacial que el filtro productivo.
      const {
        rows: [check],
      } = await client.query(
        `/* m9:bbox-devuelto */ SELECT count(*)::int AS n,
        bool_and(ST_SetSRID(ST_MakePoint(p.lon,p.lat),4326) && ST_MakeEnvelope($3,$4,$5,$6,4326)) AS dentro
        FROM unnest($1::float8[],$2::float8[]) AS p(lon,lat)`,
        [lons, lats, ...bbox],
      );
      if (check?.n !== results[1].length || check.dentro !== (results[1].length ? true : null))
        fail('ORACULO_BBOX');
    }
    return {
      totals,
      returned: results[1].length,
      totalExact: caseInfo.kind === 'exportar' || count <= modules.queries.TOPE_CONTEO,
      truncated: caseInfo.kind === 'exportar' && count > results[1].length,
    };
  }
  if (caseInfo.kind === 'uv') {
    if (
      sum(results[0], 'n_reportes') !== totals.s ||
      sum(results[0], 'n_verificados') !== totals.v ||
      results[0].some((r) => r.categoria !== category)
    )
      fail('ORACULO_AGREGADOS_UV');
  }
  if (caseInfo.kind === 'dbscan') {
    if (results[0].length !== totals.d || results[0].some((r) => r.categoria !== category))
      fail('ORACULO_DBSCAN');
    const witnesses = results[0].filter((r) => witnessIds().includes(r.id));
    const expected = [2, 3, 4, 5][CATEGORIES.indexOf(category)];
    if (
      witnesses.length !== expected ||
      new Set(witnesses.map((r) => r.cid)).size !== (category === 'inundacion' ? 1 : 2)
    )
      fail('ORACULO_RADIOS_TESTIGOS');
  }
  if (['uv', 'ejecutivo', 'indicadores'].includes(caseInfo.kind))
    return { totals, ...(await assertMatrixResults(client, caseInfo, results, modules)) };
  if (caseInfo.kind === 'pip') {
    if (caseInfo.outside && results.some((r) => r.length)) fail('ORACULO_PIP_FUERA');
    if (results[0].some((r, i) => i > 0 && results[0][i - 1].id >= r.id)) fail('ORACULO_PIP_ORDEN');
    let cursor = 0;
    const resolution = await modules.resolver.resolverPunto(
      {
        query: async (sql, params) => {
          const statement = caseInfo.statements[cursor];
          if (!statement || statement.sql !== sql || !isDeepStrictEqual(statement.params, params))
            fail('ORACULO_PIP_RAMA');
          return { rows: results[cursor++] };
        },
      },
      caseInfo.point.lat,
      caseInfo.point.lon,
    );
    const expected = {
      dentro_cobertura: !caseInfo.outside,
      uv: caseInfo.outside ? null : caseInfo.point.uv,
      distrito: caseInfo.outside ? null : caseInfo.point.district,
      version: caseInfo.outside ? null : (caseInfo.point.version ?? VERSION),
      flags: caseInfo.outside
        ? {
            en_limite: false,
            asignado_por_proximidad: false,
            distancia_m: null,
            distrito_discrepante: false,
          }
        : (caseInfo.point.flags ?? {
            en_limite: false,
            asignado_por_proximidad: false,
            distancia_m: null,
            distrito_discrepante: false,
          }),
    };
    const actual = {
      dentro_cobertura: resolution.dentro_cobertura,
      uv: resolution.unidad_vecinal?.id ?? null,
      distrito: resolution.distrito?.id ?? null,
      version: resolution.version_capa,
      flags: {
        en_limite: resolution.en_limite,
        asignado_por_proximidad: resolution.asignado_por_proximidad,
        distancia_m: resolution.distancia_m,
        distrito_discrepante: resolution.distrito_discrepante,
      },
    };
    if (cursor !== results.length || !isDeepStrictEqual(actual, expected)) fail('ORACULO_PIP');
    return { resolution, expected };
  }
  return { totals, rows: results.map((r) => r.length) };
}

function fixtureId(index) {
  const hash = digest(`${SEED}:id:${index}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function witnessIds() {
  return Array.from({ length: 20 }, (_, i) => i)
    .filter((i) => witnessFor(i))
    .map(fixtureId);
}

const MEMBERSHIP = `/* m9:pertenencia */ SELECT p.id::text AS group_id,p.categoria,p.radio_m::float8 AS radio,p.n_reportes,
  p.severidad_max, p.distrito_id,p.unidad_vecinal_id,
  ST_AsText(ST_SnapToGrid(p.geom,0.00000001)) AS centro,
  ST_AsText(p.geom_publico) AS publico,
  string_agg(r.id::text,',' ORDER BY r.id) AS miembros,
  count(r.id)::int AS n, bool_and(r.categoria=p.categoria AND r.estado IN ('validado','resuelto')) AS coherente
  FROM punto_critico p LEFT JOIN reporte r ON r.punto_critico_id=p.id
  GROUP BY p.id ORDER BY p.categoria,miembros`;

function recoveryState(state) {
  validateState(state, true);
  if (
    state.pending !== 'equivalence' ||
    state.completed.length !== 105 ||
    state.completed.at(-1) !== 'validate' ||
    !isDeepStrictEqual(
      Object.keys(state).sort(),
      [
        'version',
        'database',
        'owner',
        'run',
        'oid',
        'seed',
        'completed',
        'pending',
        'fingerprint',
      ].sort(),
    ) ||
    state.run !== 'c46b85bb-77d9-40de-9dbc-c4b59e4878c0' ||
    String(state.oid) !== '197700'
  )
    fail('RECUPERACION_NO_AUTORIZADA');
}

export function validateRecovery(state, previous, current) {
  recoveryState(state);
  return manifestBridge(state, previous, current, {
    'scripts/medir-cuatro-categorias.mjs':
      '0cf52d79a85d230aeb91aabeb931226cb23bbcd00be2f932f00c31e44c086673',
    'scripts/medir-cuatro-categorias.test.mjs':
      '435e8751290854849d5c8c7c71b70627c266adae89e99a55e3d39a587f05f8d8',
  });
}

function manifestBridge(state, previous, current, allowed) {
  if (!previous || !current) fail('RECUPERACION_SIN_MANIFIESTO');
  const { fingerprint: oldFingerprint, files: oldFiles, ...oldMetadata } = previous;
  const { fingerprint: newFingerprint, files: newFiles, ...newMetadata } = current;
  const validHash = (manifest) => {
    const { fingerprint, ...content } = manifest;
    return /^[a-f0-9]{64}$/.test(fingerprint) && digest(JSON.stringify(content)) === fingerprint;
  };
  if (
    !validHash(previous) ||
    !validHash(current) ||
    state.fingerprint !== oldFingerprint ||
    !isDeepStrictEqual(oldMetadata, newMetadata) ||
    !Array.isArray(oldFiles) ||
    !Array.isArray(newFiles) ||
    oldFiles.length !== newFiles.length
  )
    fail('RECUPERACION_MANIFIESTO_DIFIERE');
  if (
    new Set(oldFiles.map((r) => r.file)).size !== oldFiles.length ||
    new Set(newFiles.map((r) => r.file)).size !== newFiles.length
  )
    fail('RECUPERACION_MANIFIESTO_DIFIERE');
  for (const old of oldFiles) {
    const next = newFiles.find((r) => r.file === old.file);
    if (
      !next ||
      !/^[a-f0-9]{64}$/.test(next.sha256) ||
      (allowed[old.file] ? old.sha256 !== allowed[old.file] : !isDeepStrictEqual(old, next))
    )
      fail('RECUPERACION_CAMBIO_FUERA_DE_ALCANCE');
  }
  if (Object.keys(allowed).some((file) => !oldFiles.some((r) => r.file === file)))
    fail('RECUPERACION_SIN_FUENTE_ORIGINAL');
  return { previousFingerprint: oldFingerprint, fingerprint: newFingerprint };
}

function queryRecoveryState(state, incident) {
  validateState(state, true);
  if (
    state.pending !== `query:${incident.id}` ||
    state.completed.length !== incident.completed ||
    state.completed.filter((job) => job.startsWith('query:')).length !== incident.queries ||
    JOBS[incident.completed] !== state.pending ||
    state.run !== 'c46b85bb-77d9-40de-9dbc-c4b59e4878c0' ||
    String(state.oid) !== '197700' ||
    !isDeepStrictEqual(
      Object.keys(state).sort(),
      [
        'version',
        'database',
        'owner',
        'run',
        'oid',
        'seed',
        'completed',
        'pending',
        'fingerprint',
      ].sort(),
    )
  )
    fail(`RECUPERACION_${incident.code}_NO_AUTORIZADA`);
}

export async function recoverBboxQuery(urls, deps, modules, manifest) {
  return recoverReadonlyQuery(urls, deps, modules, manifest, BBOX_INCIDENT);
}

export async function recoverTop50Query(urls, deps, modules, manifest) {
  return recoverReadonlyQuery(urls, deps, modules, manifest, TOP50_INCIDENT);
}

async function recoverReadonlyQuery(urls, deps, modules, manifest, incident) {
  validateConnections(urls);
  const state = await deps.load();
  queryRecoveryState(state, incident);
  const proof = await (incident === BBOX_INCIDENT
    ? deps.bboxRecoveryProof(state)
    : deps.top50RecoveryProof(state));
  const lineage = manifestBridge(state, proof?.manifest, manifest, {
    'scripts/medir-cuatro-categorias.mjs': incident.runnerHash,
    'scripts/medir-cuatro-categorias.test.mjs': incident.testsHash,
  });
  // Dos incidentes fijos: sin parámetros de consulta ni reintento libre.
  let caseInfo;
  if (incident === BBOX_INCIDENT) {
    const filtros = modules.contracts.ReporteFiltrosSchema.parse({
      categoria: 'area_verde',
      pagina: 1,
      limite: 50,
      bbox: [-63.111073740616696, -17.906190449999997, -63.0910737406167, -17.886190449999994].join(
        ',',
      ),
    });
    const capture = recorder();
    await modules.queries.listarReportes(capture.pool, {
      filtros,
      soloPublicos: true,
      zonaHoraria: 'America/La_Paz',
    });
    caseInfo = {
      id: BBOX_CASE,
      kind: 'listado',
      category: 'area_verde',
      soloPublicos: true,
      filtros,
      statements: capture.statements,
    };
  } else {
    caseInfo = {
      id: TOP50_INCIDENT.id,
      kind: 'indicadores',
      category: 'basura',
      statements: await captureHandler(modules.admin.rutasAdmin, '/api/v1/indicadores', {
        categoria: 'basura',
      }),
    };
  }
  if (
    !isDeepStrictEqual(caseInfo, proof.caseInfo) ||
    caseInfo.statements.length !== incident.statements ||
    caseInfo.statements.some((s) => !/^\s*SELECT\b/i.test(s.sql))
  )
    fail(`RECUPERACION_${incident.code}_SQL_DIFIERE`);
  return withDatabase(
    urls,
    state,
    deps,
    async (client) => {
      const results = [];
      let control;
      assertResources(await deps.resources());
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        for (const statement of caseInfo.statements) {
          assertResources(await deps.resources());
          results.push((await client.query(statement.sql, statement.params)).rows);
        }
        control = await assertResults(client, caseInfo, results, modules);
        await assertIdentity(client, state);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      const next = { ...state, fingerprint: manifest.fingerprint, pending: null };
      validateState(next);
      await deps.artifact(incident.evidence, {
        previous: state,
        next,
        lineage,
        case: incident.id,
        control,
        resultSha256: results.map((rows) => digest(JSON.stringify(rows))),
        measured: false,
        completedUnchanged: true,
      });
      await deps.record({
        event: `recuperacion_${incident.code.toLowerCase()}_verificada`,
        case: incident.id,
        ...lineage,
        oid: state.oid,
        run: state.run,
      });
      await assertIdentity(client, state);
      await deps.save(next);
      return next;
    },
    true,
  );
}

function equivalenceCheckpoint(state, deps) {
  return (name, value) =>
    deps.artifact(name, {
      ...value,
      version: 1,
      database: DATABASE,
      run: state.run,
      oid: String(state.oid),
      fingerprint: state.fingerprint,
    });
}

async function proveFullPartitions(client, modules, deps, snapshot) {
  for (const category of CATEGORIES) {
    const statements = [];
    const ex = {
      consultar: async (sql, params = []) => {
        if (sql.includes('ST_ClusterDBSCAN')) statements.push({ sql, params });
        return sql.includes('SELECT DISTINCT categoria') ? [{ categoria: category }] : [];
      },
      ejecutar: async () => {},
      transaccion: async (fn) => fn(ex),
    };
    // Mismo capturador y SELECT del producto que buildCases; no se ejecutan sus escrituras.
    await modules.db.recalcularPuntosCriticos(
      ex,
      undefined,
      32720,
      modules.contracts.REGISTRO_CATEGORIAS,
    );
    if (statements.length !== 1) fail('CAPTURA_DBSCAN_NO_RECONOCIDA');
    assertResources(await deps.resources(), 5, 'recuperacion:particiones');
    const { rows } = await client.query(statements[0].sql, statements[0].params);
    const groups = new Map();
    const seen = new Set();
    for (const row of rows) {
      if (
        row.categoria !== category ||
        row.cid === null ||
        row.cid === undefined ||
        seen.has(row.id)
      )
        fail('RECUPERACION_PARTICIONES_DIFIEREN');
      seen.add(row.id);
      const ids = groups.get(row.cid) ?? [];
      ids.push(row.id);
      groups.set(row.cid, ids);
    }
    const expected = snapshot
      .filter((r) => r.categoria === category)
      .map((r) => r.miembros)
      .sort();
    const actual = [...groups.values()].map((ids) => ids.sort().join(',')).sort();
    if (!isDeepStrictEqual(actual, expected)) fail('RECUPERACION_PARTICIONES_DIFIEREN');
  }
}

export async function recoverEquivalence(urls, deps, modules, manifest) {
  validateConnections(urls);
  const state = await deps.load();
  recoveryState(state);
  const proof = await deps.recoveryProof(state);
  const lineage = validateRecovery(state, proof?.manifest, manifest);
  const commit = proof.full;
  if (
    commit !== null &&
    (commit?.version !== 1 ||
      commit.database !== DATABASE ||
      commit.run !== state.run ||
      String(commit.oid) !== String(state.oid) ||
      commit.fingerprint !== state.fingerprint ||
      commit.full?.motor !== 'postgis' ||
      !Number.isFinite(commit.fullMs) ||
      commit.fullMs < 0 ||
      commit.full.categoriasSinDefinicion?.length ||
      !Number.isSafeInteger(commit.full.reportes) ||
      !Number.isSafeInteger(commit.full.puntos) ||
      commit.full.puntos < 1 ||
      commit.full.reportes < commit.full.puntos ||
      commit.full.reportes > TOTAL)
  )
    fail('RECUPERACION_CHECKPOINT_NO_RECONOCIDO');
  return withDatabase(
    urls,
    state,
    deps,
    async (client) => {
      assertResources(await deps.resources(), 5, 'recuperacion:antes-validacion');
      await verifyLayers(client, manifest.layers);
      await validateDataset(client, makeFixtures(modules.contracts), deps);
      await deps.artifact('recuperacion-intencion.json', {
        state,
        lineage,
        mode: 'validar particiones existentes; sin repetir completo',
        fullTime: commit ? 'checkpoint' : 'NO_MEDIDO: duración anterior perdida',
      });
      await equivalence(client, modules, deps, {
        existingFull: commit
          ? { motor: 'postgis', reportes: commit.full.reportes, puntos: commit.full.puntos }
          : { motor: 'postgis', origen: 'particiones existentes; duración anterior perdida' },
        fullMs: commit?.fullMs ?? null,
        recovery: true,
        checkpoint: equivalenceCheckpoint(state, deps),
      });
      await assertIdentity(client, state);
      const next = {
        ...state,
        fingerprint: manifest.fingerprint,
        completed: [...state.completed, 'equivalence'],
        pending: null,
      };
      validateState(next);
      await deps.artifact('recuperacion-completada.json', { previous: state, next, lineage });
      await deps.record({
        event: 'recuperacion_equivalence_verificada',
        ...lineage,
        run: state.run,
        oid: state.oid,
      });
      await deps.save(next);
      return next;
    },
    true,
  );
}

export async function equivalence(client, modules, deps, options = {}) {
  const now = deps.now ?? (() => performance.now());
  const checkpoint = options.checkpoint ?? (async () => {});
  let full = options.existingFull;
  let fullMs = options.fullMs ?? null;
  if (!full) {
    const resources = await deps.resources();
    assertResources(resources, 5, 'equivalence:antes-completo');
    const start = now();
    full = await modules.db.recalcularPuntosCriticos(
      executor(client),
      undefined,
      32720,
      modules.contracts.REGISTRO_CATEGORIAS,
    );
    fullMs = now() - start;
    // La función productiva vuelve después del COMMIT. Persistir antes de toda guarda/lectura posterior.
    await checkpoint('equivalencia-full-commit.json', { full, fullMs, resources });
  }
  if (full.motor !== 'postgis' || full.categoriasSinDefinicion?.length)
    fail('MOTOR_DBSCAN_NO_RECONOCIDO');
  assertResources(await deps.resources(), 5, 'equivalence:antes-snapshot');
  const fullVerificationStart = now();
  const { rows: before } = await client.query(MEMBERSHIP);
  const {
    rows: [orphans],
  } = await client.query(`/* m9:huerfanos */ SELECT count(*)::int AS n FROM reporte
    WHERE estado IN ('validado','resuelto') AND punto_critico_id IS NULL`);
  if (
    orphans.n ||
    before.some(
      (r) =>
        !r.coherente ||
        r.n !== r.n_reportes ||
        r.radio !== modules.contracts.REGISTRO_CATEGORIAS.obtener(r.categoria)?.recurrenciaRadioM,
    )
  )
    fail('PERTENENCIA_DBSCAN_INVALIDA');
  const { rows: verifiedTotals } =
    await client.query(`/* m9:verificados */ SELECT categoria,count(*)::int AS n
    FROM reporte WHERE estado IN ('validado','resuelto') GROUP BY categoria`);
  sameCounts(verifiedTotals, before, ['categoria'], 'PERTENENCIA_DBSCAN_INVALIDA');
  if (options.recovery) {
    await proveFullPartitions(client, modules, deps, before);
    if (
      (full.reportes !== undefined && full.reportes !== before.reduce((n, r) => n + r.n, 0)) ||
      (full.puntos !== undefined && full.puntos !== before.length)
    )
      fail('RECUPERACION_CHECKPOINT_DIFIERE');
  }
  const fullVerificationMs = now() - fullVerificationStart;
  await checkpoint('equivalencia-full-verificado.json', {
    full,
    fullMs,
    fullVerificationMs,
    membershipSha256: digest(JSON.stringify(before)),
    groups: before.length,
    fullTime: fullMs === null ? 'NO_MEDIDO: duración anterior perdida' : 'MEDIDO',
  });
  const bounded = [];
  let snapshot = before;
  for (const category of CATEGORIES) {
    // Testigos aislados 100 m del resto. En 10 m se toma la componente de offset20 (>=2 miembros).
    const indices = Array.from({ length: 20 }, (_, i) => i).filter(
      (i) =>
        sampleAxes(i).category === category &&
        witnessFor(i) &&
        (category === 'inundacion' || witnessFor(i).offsetM === 20),
    );
    const memberIds = indices.map(fixtureId).sort();
    const {
      rows: [candidate],
    } = await client.query(
      `/* m9:candidato */ SELECT r.id,p.id::text AS group_id,p.n_reportes
      FROM reporte r JOIN punto_critico p ON p.id=r.punto_critico_id WHERE r.id=$1 AND r.categoria=$2`,
      [memberIds[0], category],
    );
    const group = snapshot.find(
      (r) => r.group_id === candidate?.group_id && r.categoria === category,
    );
    if (
      !group ||
      candidate.n_reportes !== memberIds.length ||
      group.miembros !== memberIds.join(',')
    )
      fail('COMPONENTE_ACOTADA_NO_DISPONIBLE');
    assertResources(await deps.resources(), 5, 'equivalence:antes-acotado');
    const started = now();
    const result = await modules.db.recalcularEntornoDeReporte(
      executor(client),
      candidate.id,
      undefined,
      32720,
      modules.contracts.REGISTRO_CATEGORIAS,
    );
    const durationMs = now() - started;
    await checkpoint(`equivalencia-acotado-${category}-commit.json`, {
      category,
      candidate,
      memberIds,
      result,
      durationMs,
    });
    const verificationStart = now();
    if (
      result.desbordado ||
      result.completo ||
      result.afectados !== memberIds.length ||
      result.puntos !== 1 ||
      result.disueltos !== 1
    )
      fail('RECALCULO_ACOTADO_NO_REALIZADO');
    const { rows: after } = await client.query(MEMBERSHIP);
    const canonical = (rows, own) =>
      rows
        .map(({ group_id, ...rest }) => (own ? rest : { group_id, ...rest }))
        .sort((a, b) =>
          keyOf(a, ['categoria', 'miembros']).localeCompare(keyOf(b, ['categoria', 'miembros'])),
        );
    if (
      !isDeepStrictEqual(
        canonical(
          snapshot.filter((r) => r.categoria !== category),
          false,
        ),
        canonical(
          after.filter((r) => r.categoria !== category),
          false,
        ),
      )
    )
      fail('RECALCULO_ALTERO_AJENOS');
    if (
      !isDeepStrictEqual(
        canonical(
          snapshot.filter((r) => r.categoria === category),
          true,
        ),
        canonical(
          after.filter((r) => r.categoria === category),
          true,
        ),
      )
    )
      fail('RECALCULO_ACOTADO_DIFIERE');
    if (after.some((r) => r.group_id === candidate.group_id))
      fail('RECALCULO_ACOTADO_NO_REALIZADO');
    bounded.push({
      category,
      candidate,
      memberIds,
      result,
      durationMs,
      verificationMs: now() - verificationStart,
    });
    await checkpoint(`equivalencia-acotado-${category}-verificado.json`, bounded.at(-1));
    snapshot = after;
  }
  await deps.artifact('equivalencia.json', {
    full,
    fullMs,
    fullTime: fullMs === null ? 'NO_MEDIDO: duración anterior perdida' : 'MEDIDO',
    fullVerificationMs,
    bounded,
    membershipSha256: digest(JSON.stringify(before)),
    groups: before.length,
  });
}

export async function measure(urls, deps, modules, manifest) {
  const state = await deps.load();
  validateState(state);
  if (state.fingerprint !== manifest.fingerprint || !state.completed.includes('validate'))
    fail('BANCO_NO_PREPARADO');
  return withDatabase(urls, state, deps, async (client) => {
    await verifyLayers(client, manifest.layers);
    await validateDataset(client, makeFixtures(modules.contracts), deps);
    await durableJob(client, state, deps, 'equivalence', () =>
      equivalence(client, modules, deps, { checkpoint: equivalenceCheckpoint(state, deps) }),
    );
    const {
      rows: [point],
    } = await client.query(
      `SELECT ST_X(geom) AS lon,ST_Y(geom) AS lat,unidad_vecinal_id AS uv,distrito_id AS district,
      version_capa AS version,resolucion_flags AS flags
      FROM reporte WHERE id=$1`,
      [fixtureId(0)],
    );
    const {
      rows: [extent],
    } =
      await client.query(`SELECT ST_XMin(e) AS xmin,ST_YMin(e) AS ymin,ST_XMax(e) AS xmax,ST_YMax(e) AS ymax
      FROM (SELECT ST_Extent(geom) AS e FROM geo.unidad_vecinal_vigente) t`);
    const context = { point, bbox: [extent.xmin, extent.ymin, extent.xmax, extent.ymax] };
    const cases = await buildCases(modules, context);
    await deps.artifact('consultas.json', { context, cases });
    for (const caseInfo of cases) {
      await durableJob(client, state, deps, `query:${caseInfo.id}`, async () => {
        const result = [];
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
          // Calentamiento declarado: una ejecución completa por statement; conserva oráculos.
          const results = [];
          for (const statement of caseInfo.statements) {
            assertResources(await deps.resources());
            results.push((await client.query(statement.sql, statement.params)).rows);
          }
          const control = await assertResults(client, caseInfo, results, modules);
          for (let j = 0; j < caseInfo.statements.length; j++) {
            const statement = caseInfo.statements[j];
            const plans = [];
            for (let rep = 0; rep < (caseInfo.kind === 'dbscan' ? 3 : 9); rep++) {
              const resources = await deps.resources();
              assertResources(resources);
              await deps.record({
                event: 'recursos_muestra',
                case: caseInfo.id,
                statement: j,
                rep,
                resources,
              });
              const { rows } = await client.query(
                `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.sql}`,
                statement.params,
              );
              plans.push(rows[0]['QUERY PLAN'][0]);
            }
            result.push({
              statement: j,
              plans,
              executionMs: statistics(plans.map((p) => p['Execution Time'])),
              planningMs: statistics(plans.map((p) => p['Planning Time'])),
              rows: results[j].length,
              resultSha256: digest(JSON.stringify(results[j])),
            });
          }
          await client.query('COMMIT');
          await deps.artifact(`consulta-${caseInfo.id.replaceAll(':', '-')}.json`, {
            id: caseInfo.id,
            control,
            result,
            warmup: 1,
            cache: 'sin vaciar cachés; sin afirmar caché fría',
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    }
    await durableJob(client, state, deps, 'sizes', async () => {
      const { rows } = await client.query(`SELECT pg_relation_size('reporte')::text AS heap,
        pg_indexes_size('reporte')::text AS indices,pg_total_relation_size('reporte')::text AS total,
        pg_database_size(current_database())::text AS database,
        version() AS postgres,postgis_full_version() AS postgis`);
      const { rows: indexes } =
        await client.query(`SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
        WHERE schemaname IN ('public','geo') ORDER BY schemaname,tablename,indexname`);
      await deps.artifact('tamano-y-motor.json', { sizes: rows, indexes });
    });
    await deps.artifact('alcance.json', {
      SQL: 'MEDIDO solo si todas las etapas query están confirmadas en diario',
      HTTP: 'NO_MEDIDO: CA8 condicional, sin instancias de API/geo ni conexiones HTTP',
      front: 'NO_MEDIDO',
      concurrencia: 'NO_MEDIDO: una conexión secuencial',
      manzanas: 'omitidas; ninguna consulta capturada las utiliza',
      pip_borde_hueco_discrepancia:
        'NO_MEDIDO: sin testigo municipal identificado; se miden interior y fuera',
      distrito_geo_todas:
        'NO_APLICA: no existe endpoint geo de distrito ni Todas; distrito se mide en indicadores/ejecutivo',
      exportacion: 'Solo SQL; sin serialización CSV/GeoJSON/nota ni latencia HTTP',
      comparacionM2:
        '0020 frente a 0021; detalles actuales y consultas completas. No trasladar tiempos M2 ni afirmar SLA municipal.',
    });
    return state;
  });
}

// No CLI productiva: migración y ETL reciben el ejecutor de esta conexión acreditada.
// Así ninguna segunda lectura de .env puede reemplazar la URL que pasó las guardas.
export function probeEnvironment(inherited) {
  return Object.fromEntries(
    Object.entries(inherited).filter(([key]) =>
      /^(path|systemroot|windir|comspec|pathext|userprofile|homedrive|homepath|home|lang|lc_all)$/i.test(
        key,
      ),
    ),
  );
}

export async function readResources(inherited = process.env, execute = promisify(execFile)) {
  const env = probeEnvironment(inherited);
  const options = { env, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 };
  // Host local fijo: no heredar DOCKER_HOST/CONTEXT ni resolver un contexto remoto del usuario.
  const host =
    platform() === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
  const docker =
    platform() === 'win32'
      ? path.join(
          inherited.ProgramFiles || 'C:/Program Files',
          'Docker/Docker/resources/bin/docker.exe',
        )
      : '/usr/bin/docker';
  const format =
    '{{json .Id}}|{{json .Name}}|{{json .State.Running}}|{{json .Config.Image}}|{{json .NetworkSettings.Ports}}|{{json .Mounts}}';
  const { stdout: info } = await execute(
    docker,
    ['--host', host, 'inspect', '--format', format, 'curichi-postgis'],
    options,
  );
  const [id, name, running, image, ports, mounts] = info
    .trim()
    .split('|')
    .map((part) => JSON.parse(part));
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    name !== '/curichi-postgis' ||
    running !== true ||
    image !== 'postgis/postgis:18-3.6' ||
    !ports?.['5432/tcp']?.some((p) => p.HostIp === '127.0.0.1' && p.HostPort === '5432') ||
    !mounts?.some((m) => m.Type === 'volume' && m.Destination === '/var/lib/postgresql')
  )
    fail('DISCO_POSTGRES_NO_ACREDITADO');
  const { stdout } = await execute(
    docker,
    ['--host', host, 'exec', id, 'df', '-Pk', '/var/lib/postgresql'],
    options,
  );
  const line = stdout.trim().split(/\r?\n/).at(-1).trim().split(/\s+/);
  if (line.length !== 6 || !/^\d+$/.test(line[3])) fail('DISCO_POSTGRES_DESCONOCIDO');
  const disk = await fs.statfs(ROOT);
  return {
    freeMiB: freemem() / 1024 ** 2,
    totalMiB: totalmem() / 1024 ** 2,
    diskFreeGiB: (disk.bavail * disk.bsize) / 1024 ** 3,
    databaseFreeGiB: Number(line[3]) / 1024 ** 2,
    databaseDisk: 'volumen local del contenedor curichi-postgis; df -Pk',
    platform: platform(),
    release: release(),
    node: process.version,
  };
}

async function queryRecoveryProof(scratch, state, incident) {
  queryRecoveryState(state, incident);
  const blocked = (name) => name.startsWith(incident.file) || name.startsWith(incident.evidence);
  const entries = await fs.readdir(scratch, { withFileTypes: true });
  if (entries.some((entry) => blocked(entry.name)))
    fail(`RECUPERACION_${incident.code}_ARTEFACTO_INCIERTO`);
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      /^ejecucion-[a-f0-9-]{36}$/.test(entry.name) &&
      (await fs.readdir(path.join(scratch, entry.name))).some(blocked)
    )
      fail(`RECUPERACION_${incident.code}_ARTEFACTO_INCIERTO`);
  }
  const folder = path.join(scratch, incident.folder);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifiesto.json'), 'utf8'));
  const captured = JSON.parse(await fs.readFile(path.join(folder, 'consultas.json'), 'utf8'));
  const cases = Array.isArray(captured?.cases)
    ? captured.cases.filter((c) => c?.id === incident.id)
    : [];
  if (cases.length !== 1) fail(`RECUPERACION_${incident.code}_CONSULTAS_NO_RECONOCIDAS`);
  return { manifest, caseInfo: cases[0] };
}

export function createDependencies(
  urls,
  { scratch = SCRATCH, artifacts = scratch, Client, inherited = process.env } = {},
) {
  validateConnections(urls);
  const PgClient =
    Client ?? createRequire(path.join(ROOT, 'packages/db/package.json'))('pg').Client;
  const secrets = Object.values(urls).flatMap((value) => {
    const password = new URL(value).password;
    return [value, password, decodeURIComponent(password)];
  });
  const safe = (value) => redact(JSON.stringify(value), secrets);
  const stateFile = path.join(scratch, 'diario.json');
  return {
    resources: () => readResources(inherited),
    async recoveryProof(state) {
      recoveryState(state);
      let manifest;
      let full = null;
      const read = async (file) => {
        let contents;
        try {
          contents = await fs.readFile(file, 'utf8');
        } catch (error) {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        }
        return JSON.parse(contents);
      };
      const boundedCheckpoint = /^equivalencia-acotado-.+-(?:commit|verificado)\.json$/;
      const entries = await fs.readdir(scratch, { withFileTypes: true });
      if (entries.some((entry) => boundedCheckpoint.test(entry.name)))
        fail('RECUPERACION_ACOTADO_INCIERTO');
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^ejecucion-[a-f0-9-]{36}$/.test(entry.name)) continue;
        const folder = path.join(scratch, entry.name);
        if ((await fs.readdir(folder)).some((name) => boundedCheckpoint.test(name)))
          fail('RECUPERACION_ACOTADO_INCIERTO');
        const prior = await read(path.join(folder, 'manifiesto.json'));
        if (prior?.fingerprint === state.fingerprint) {
          if (manifest && !isDeepStrictEqual(manifest, prior))
            fail('RECUPERACION_MANIFIESTO_AMBIGUO');
          manifest = prior;
        }
        const commit = await read(path.join(folder, 'equivalencia-full-commit.json'));
        if (commit !== undefined) {
          if (!commit || typeof commit !== 'object' || Array.isArray(commit))
            fail('RECUPERACION_CHECKPOINT_NO_RECONOCIDO');
          if (full && !isDeepStrictEqual(full, commit)) fail('RECUPERACION_CHECKPOINT_AMBIGUO');
          full = commit;
        }
      }
      if (!manifest) fail('RECUPERACION_SIN_MANIFIESTO');
      return { manifest, full };
    },
    async bboxRecoveryProof(state) {
      return queryRecoveryProof(scratch, state, BBOX_INCIDENT);
    },
    async top50RecoveryProof(state) {
      return queryRecoveryProof(scratch, state, TOP50_INCIDENT);
    },
    client(value) {
      const database = value === urls.bootstrap ? BOOTSTRAP : DATABASE;
      const checked = validateUrl(value, database);
      if (checked !== urls[database === BOOTSTRAP ? 'bootstrap' : 'owner'])
        fail('URL_NO_ACREDITADA');
      const url = new URL(checked);
      return new PgClient({
        host: url.hostname,
        port: 5432,
        database,
        user: OWNER,
        password: decodeURIComponent(url.password),
        ssl: false,
        options: '-c search_path=public,geo',
        application_name: 'mi-curichi-m9',
        connectionTimeoutMillis: 5000,
        statement_timeout: 900000,
        query_timeout: 910000,
        lock_timeout: 10000,
        idle_in_transaction_session_timeout: 120000,
      });
    },
    async load() {
      let contents;
      try {
        contents = await fs.readFile(stateFile, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      const state = JSON.parse(contents);
      // Una intención CREATE válida se puede inspeccionar, nunca adoptar ni reproducir.
      if (
        state?.pending === 'create' &&
        state.oid === null &&
        Array.isArray(state.completed) &&
        state.completed.length === 0
      )
        validateState({ ...state, oid: '1', pending: null });
      else validateState(state, true);
      return state;
    },
    async save(state) {
      // La intención CREATE sin OID se admite solo para escribir, nunca para reanudar.
      if (state.pending === 'create' && state.oid === null && state.completed.length === 0)
        validateState({ ...state, oid: '1', pending: null });
      else validateState(state, true);
      const temp = await fs.open(`${stateFile}.tmp`, 'wx', 0o600);
      try {
        await temp.writeFile(`${safe(state)}\n`);
        await temp.sync();
      } finally {
        await temp.close();
      }
      await fs.rename(`${stateFile}.tmp`, stateFile);
    },
    async record(event) {
      const file = await fs.open(path.join(scratch, 'eventos.jsonl'), 'a', 0o600);
      try {
        await file.writeFile(`${safe(event)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
    },
    async artifact(name, value) {
      if (!/^[a-z0-9][a-z0-9_-]*\.json$/.test(name)) fail('ARTEFACTO_NO_PERMITIDO');
      const file = await fs.open(path.join(artifacts, name), 'wx', 0o600);
      try {
        await file.writeFile(`${safe(value)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
    },
  };
}

export async function withRunLock(scratch, action) {
  await fs.mkdir(scratch, { recursive: true });
  const file = path.join(scratch, 'runner.lock');
  const token = JSON.stringify({
    pid: process.pid,
    run: randomUUID(),
    started: new Date().toISOString(),
  });
  const lock = await fs.open(file, 'wx', 0o600);
  try {
    await lock.writeFile(token);
    await lock.sync();
    return await action();
  } finally {
    await lock.close();
    // Si otro actor reemplazó el lock no se le borra; un lock previo tampoco se reclama.
    if ((await fs.readFile(file, 'utf8')) !== token) fail('LOCK_PROPIO_NO_ACREDITADO');
    await fs.unlink(file);
  }
}

export async function inspectState(urls, deps) {
  validateConnections(urls);
  const state = await deps.load();
  if (state === null)
    return { database: DATABASE, status: 'SIN_DIARIO_NO_ADOPTAR', resumable: false };
  if (state.pending === 'create')
    return { database: DATABASE, status: 'CREATE_INCIERTO_INSPECCION_REQUERIDA', resumable: false };
  validateState(state, true);
  return withDatabase(
    urls,
    state,
    deps,
    async () => ({
      database: DATABASE,
      owner: OWNER,
      oid: state.oid,
      completed: state.completed,
      pending: state.pending,
      resumable: !state.pending,
      fingerprint: state.fingerprint,
      status: state.pending ? 'ETAPA_INCIERTA_INSPECCION_REQUERIDA' : 'IDENTIDAD_ACREDITADA',
    }),
    true,
  );
}

export async function buildManifest() {
  const files = [];
  const packages = [
    'packages/contracts',
    'packages/db',
    'services/api-core',
    'services/geo-service',
    'pipelines/geodata-etl',
  ];
  const add = async (file) => {
    files.push({
      file: path.relative(ROOT, file).replaceAll('\\', '/'),
      sha256: await hashFile(file),
    });
  };
  for (const pkg of packages) {
    const src = path.join(ROOT, pkg, 'src');
    await add(path.join(ROOT, pkg, 'package.json'));
    async function visit(dir) {
      for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const file = path.join(dir, item.name);
        const relative = path.relative(src, file).replaceAll('\\', '/');
        if (item.isDirectory()) {
          if (pkg !== 'packages/db' || relative !== 'local') await visit(file);
          continue;
        }
        if (!file.endsWith('.ts') || file.endsWith('.d.ts') || file.endsWith('.test.ts')) continue;
        if (
          pkg === 'packages/db' &&
          relative.startsWith('cli/') &&
          !/^cli\/(migrar|migrar-comando|cuentas|cuentas-comando)\.ts$/.test(relative)
        )
          continue;
        const built = path.join(ROOT, pkg, 'dist', relative.replace(/\.ts$/, '.js'));
        if ((await fs.stat(file)).mtimeMs > (await fs.stat(built)).mtimeMs)
          fail(`BUILD_DESACTUALIZADO:${pkg}:${relative}`);
        await add(file);
        await add(built);
      }
    }
    await visit(src);
  }
  const contracts = JSON.parse(
    await fs.readFile(path.join(ROOT, 'packages/contracts/package.json'), 'utf8'),
  );
  if (contracts.version !== '0.24.0') fail('CONTRACTS_VERSION_NO_RECONOCIDA');
  const migrations = (await fs.readdir(path.join(ROOT, 'packages/db/migraciones')))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name.slice(0, 4) <= '0021')
    .sort();
  if (migrations.length !== 21 || !migrations.at(-1).startsWith('0021_'))
    fail('MIGRACIONES_INVENTARIO_NO_RECONOCIDO');
  for (const file of migrations) await add(path.join(ROOT, 'packages/db/migraciones', file));
  for (const file of [
    'scripts/medir-cuatro-categorias.mjs',
    'scripts/medir-cuatro-categorias.test.mjs',
    'pnpm-lock.yaml',
  ])
    await add(path.join(ROOT, file));
  const layers = await readLayers();
  const content = {
    version: 1,
    database: DATABASE,
    seed: SEED,
    total: TOTAL,
    contracts: contracts.version,
    migrations,
    layers,
    files,
    buildCheck: 'mtime fuente <= compilado; SHA256 de ambos conservado; sin recompilar',
    manzanas: 'omitidas: ninguna consulta medida las utiliza',
  };
  return { ...content, fingerprint: digest(JSON.stringify(content)) };
}

export async function runCli(args) {
  const action = parseAction(args);
  if (action === '--ayuda') {
    process.stdout.write(
      `${USAGE}\nBanco fijo: ${DATABASE}; bootstrap de metadatos: ${BOOTSTRAP}.\n` +
        'preparar: crear, migrar hasta 0021 y cargar 1M sintéticos; medir: SQL y planes; estado: solo identidad/diario.\n' +
        'recuperar-equivalencia: solo el pending acreditado del 26/10; verifica particiones y no repite el completo.\n' +
        'recuperar-consulta-bbox: revalida solo el caso público de áreas verdes pendiente; no suma consultas medidas.\n' +
        'recuperar-consulta-top50: revalida solo indicadores de basura pendiente; no suma consultas medidas.\n' +
        'Requiere revisión previa y turno exclusivo para ejecutar preparar/medir. Sin servicios HTTP.\n' +
        `Diario y evidencia conservados en ${path.relative(ROOT, SCRATCH)}. Sin borrado automático ni reintento de etapas inciertas.\n`,
    );
    return;
  }
  if (!/^v24\./.test(process.version)) fail('REQUIERE_NODE_24');
  await withRunLock(SCRATCH, async () => {
    let stage = 'entorno';
    try {
      const source = parseEnv(await fs.readFile(path.join(ROOT, '.env'), 'utf8'));
      const urls = deriveUrls(source);
      const artifacts = path.join(SCRATCH, `ejecucion-${randomUUID()}`);
      await fs.mkdir(artifacts);
      const deps = createDependencies(urls, { artifacts });
      if (action === 'estado') {
        stage = 'estado';
        const value = await inspectState(urls, deps);
        await deps.artifact('estado.json', value);
        process.stdout.write(`${JSON.stringify(value)}\n`);
        return;
      }
      stage = 'recursos';
      const resources = await deps.resources();
      assertResources(resources);
      await deps.artifact('recursos-iniciales.json', resources);
      stage = 'manifiesto';
      const manifest = await buildManifest();
      await deps.artifact('manifiesto.json', manifest);
      let modules;
      try {
        stage = 'modulos';
        modules = await loadModules();
        if (
          JSON.stringify([...modules.contracts.REGISTRO_CATEGORIAS.slugs].sort()) !==
          JSON.stringify([...CATEGORIES].sort())
        )
          fail('REGISTRO_CATEGORIAS_NO_RECONOCIDO');
        stage = action;
        const state = await (action === 'preparar'
          ? prepare
          : action === 'recuperar-equivalencia'
            ? recoverEquivalence
            : action === 'recuperar-consulta-bbox'
              ? recoverBboxQuery
              : action === 'recuperar-consulta-top50'
                ? recoverTop50Query
                : measure)(urls, deps, modules, manifest);
        process.stdout.write(
          `${JSON.stringify({ action, database: DATABASE, completed: state.completed.length, evidence: path.relative(ROOT, artifacts) })}\n`,
        );
      } finally {
        await modules?.db.cerrarWorkersDePassword();
      }
    } catch (error) {
      const diagnostic = failureDiagnostic(error, stage);
      // Solo datos de control; nunca message/stack/cause ni entorno de OS/pg.
      try {
        await fs.writeFile(
          path.join(SCRATCH, `fallo-${randomUUID()}.json`),
          `${JSON.stringify(diagnostic)}\n`,
          { flag: 'wx', mode: 0o600 },
        );
      } catch {
        /* El stderr conserva el diagnóstico si el disco/permiso impide persistirlo. */
      }
      process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
      throw error;
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    // No stack, mensaje ni causa de pg/OS: pueden contener credenciales del proceso.
    process.stderr.write(
      `M9_ABORTADO: ${JSON.stringify(failureDiagnostic(error, 'inicio'))}; conservar banco, diario y evidencia. ${USAGE}\n`,
    );
    process.exitCode = 1;
  });
}
