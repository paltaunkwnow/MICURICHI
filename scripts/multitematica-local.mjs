import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import { freemem } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv, promisify } from 'node:util';
import { huellaCanonica } from './respaldo.mjs';

export const DATABASE = 'curichi_multitematica';
export const BOOTSTRAP = 'curichi_e2e';
export const HOST = '127.0.0.2';
export const PORTS = Object.freeze({ web: 4000, api: 4001, geo: 4002, panel: 4100 });
const ROLES = Object.freeze({ owner: 'curichi', api: 'curichi_api', geo: 'curichi_geo' });
const CATEGORIES = ['area_verde', 'bache', 'basura', 'inundacion'];
const LAYERS = ['distrito_municipal', 'manzana', 'unidad_vecinal'];
const VERSION = 'DM_UV_MZ_2025';
const STAGES = ['created', 'migrated', 'loaded', 'seeded', 'privileges', 'active'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = path.join(ROOT, '.turbo/cuatro-categorias-2026-10-22/operacion');
const fail = (code) => {
  throw new Error(code);
};

export function parseAction(args) {
  if (
    args.length === 2 &&
    ['preparar', 'actualizar'].includes(args[0]) &&
    args[1] === '--autorizar-contraccion-compatible'
  )
    return args[0];
  if (args.length !== 1 || !['preparar', 'iniciar', '--ayuda', 'actualizar'].includes(args[0])) {
    fail('USO: node scripts/multitematica-local.mjs preparar|iniciar|--ayuda');
  }
  return args[0];
}

// No parámetros de libpq: host/options/service en la query pueden sustituir el destino visible.
function parseCredential(value, role) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('URL_INVALIDA');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== '5432' ||
    url.search ||
    url.hash ||
    decodeURIComponent(url.username) !== ROLES[role] ||
    !url.password ||
    !/^\/(curichi|curichi_e2e|curichi_multitematica)$/.test(url.pathname)
  )
    fail('URL_NO_PERMITIDA');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

export function validateUrl(value, role, database = DATABASE) {
  if (
    !Object.hasOwn(ROLES, role) ||
    (database !== DATABASE && !(database === BOOTSTRAP && role === 'owner'))
  )
    fail('DESTINO_NO_PERMITIDO');
  const url = parseCredential(value, role);
  if (url.pathname !== `/${database}`) fail('BASE_NO_PERMITIDA');
  return url.toString();
}

export function deriveUrls(source) {
  const owner = parseCredential(source.DATABASE_URL, 'owner');
  const result = {};
  for (const role of Object.keys(ROLES)) {
    let url;
    const key = `${role.toUpperCase()}_DATABASE_URL`;
    if (role === 'owner') url = new URL(owner);
    else if (source[key]?.trim()) url = parseCredential(source[key], role);
    else {
      url = new URL(owner);
      url.username = ROLES[role];
      const password = source[`${role.toUpperCase()}_DB_PASSWORD`];
      if (!password) fail('CREDENCIAL_DE_ROL_AUSENTE');
      url.password = password;
    }
    if (url.hostname !== owner.hostname) fail('SERVIDOR_DE_ROL_DISTINTO');
    url.pathname = `/${DATABASE}`;
    result[role] = validateUrl(url.toString(), role);
  }
  owner.pathname = `/${BOOTSTRAP}`;
  result.bootstrap = validateUrl(owner.toString(), 'owner', BOOTSTRAP);
  return Object.freeze(result);
}

function validateConnections(urls) {
  for (const role of Object.keys(ROLES)) validateUrl(urls[role], role);
  validateUrl(urls.bootstrap, 'owner', BOOTSTRAP);
  if (new Set(Object.values(urls).map((url) => new URL(url).hostname)).size !== 1)
    fail('SERVIDORES_DISTINTOS');
}

export function privateEnvironment(source, inherited, scratch, urls, kind, tokens, guardedUrl) {
  if (!['migrate', 'load', 'seed', 'privileges', ...Object.keys(PORTS)].includes(kind))
    fail('JOB_DESCONOCIDO');
  const env = {};
  // Allowlist: tampoco heredar NODE_OPTIONS, PG*, S3*, E2E*, URLs de servicios ni flags de pnpm.
  const system =
    /^(path|systemroot|windir|comspec|pathext|userprofile|homedrive|homepath|home|lang|lc_all)$/i;
  for (const [key, value] of Object.entries(inherited)) if (system.test(key)) env[key] = value;
  for (const key of [
    'CIUDAD_NOMBRE',
    'CIUDAD_PAIS',
    'CIUDAD_LOCALE',
    'CIUDAD_CENTRO_LON',
    'CIUDAD_CENTRO_LAT',
    'CIUDAD_ZOOM_INICIAL',
    'ZONA_HORARIA',
    'CRS_METRICO_EPSG',
  ]) {
    if (source[key]) env[key] = source[key];
  }
  Object.assign(env, {
    TEMP: path.join(scratch, 'tmp'),
    TMP: path.join(scratch, 'tmp'),
    NODE_ENV: kind === 'web' || kind === 'panel' ? 'production' : 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    CURICHI_INSTALACION_LOCAL: '1',
    TRUST_PROXY: '0',
    PROXY_DE_CONFIANZA: '0',
    HSTS: '0',
    COOKIE_SEGURA: '0',
    API_CORE_HOST: HOST,
    API_CORE_PORT: String(PORTS.api),
    API_CORE_URL: `http://${HOST}:${PORTS.api}`,
    GEO_SERVICE_HOST: HOST,
    GEO_SERVICE_PORT: String(PORTS.geo),
    GEO_SERVICE_URL: `http://${HOST}:${PORTS.geo}`,
    PANEL_ADMIN_URL: `http://${HOST}:${PORTS.panel}`,
    PUBLIC_BASE_URL: `http://${HOST}:${PORTS.web}`,
    CORS_ORIGENES: `http://${HOST}:${PORTS.web},http://${HOST}:${PORTS.panel}`,
    DIR_PROCESSED: path.join(ROOT, 'data/processed'),
    STORAGE_DIR: path.join(ROOT, 'infra/.storage/multitematica/fotos'),
    REPORTE_DEMORA_PRIMERO_S: '60',
    REPORTE_DEMORA_SIGUIENTES_S: '240',
  });
  const role = kind === 'api' || kind === 'geo' ? kind : 'owner';
  if (kind !== 'web' && kind !== 'panel') env.DATABASE_URL = validateUrl(urls[role], role);
  if (!Object.hasOwn(PORTS, kind)) {
    validateUrl(guardedUrl, 'owner');
    if (env.DATABASE_URL !== guardedUrl) fail('ENTORNO_DE_JOB_NO_COINCIDE');
  }
  if (kind === 'api' || kind === 'geo') {
    env[`${kind.toUpperCase()}_DATABASE_URL`] = env.DATABASE_URL;
    env.GEO_TOKEN_INTERNO = tokens.geo;
    env.METRICAS_TOKEN = tokens.metrics;
  }
  if (kind === 'seed' || kind === 'api') {
    for (const key of ['IP_HASH_SAL', 'JITTER_SAL']) {
      if (!source[key] || source[key].length < 32) fail('SAL_LOCAL_AUSENTE_O_CORTA');
      env[key] = source[key];
    }
  }
  if (kind === 'seed') {
    for (const role of ['ADMIN', 'TECNICO', 'VECINA', 'EJECUTIVO']) {
      const key = `SEED_${role}_PASSWORD`;
      if (source[key]) env[key] = source[key];
    }
  }
  return env;
}

export function redact(text, secrets) {
  let result = String(text).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[URL redactada]');
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join('[redactado]');
  }
  return result;
}

export function validateState(state) {
  if (
    state?.version !== 1 ||
    state.database !== DATABASE ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(state.installation) ||
    !STAGES.includes(state.stage) ||
    !/^\d+$/.test(String(state.oid))
  )
    fail('ESTADO_NO_REANUDABLE');
  return state;
}

const marker = (state) => `multitematica-local/v1/${state.installation}`;
const metadataSql = `SELECT oid::text, pg_get_userbyid(datdba) AS owner,
  shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = $1`;

async function checkIdentity(client, database, role) {
  const {
    rows: [identity],
  } = await client.query(
    'SELECT current_database() AS database, current_user AS role, session_user AS session',
  );
  if (
    identity?.database !== database ||
    identity.role !== ROLES[role] ||
    identity.session !== ROLES[role]
  )
    fail('IDENTIDAD_NO_PERMITIDA');
  return identity;
}

// La guarda es EXTERNA al CLI. Se verifica cada conexión antes de invocar el job con la misma URL.
export async function withDatabase(urls, role, state, deps, action, bootstrap = false) {
  deps.check?.();
  const database = bootstrap ? BOOTSTRAP : DATABASE;
  const url = validateUrl(bootstrap ? urls.bootstrap : urls[role], role, database);
  const client = deps.client(url);
  try {
    await client.connect();
    const identity = await checkIdentity(client, database, role);
    deps.record?.({ event: 'conexion_verificada', database, role: identity.role });
    if (!bootstrap) {
      validateState(state);
      const {
        rows: [meta],
      } = await client.query(metadataSql, [DATABASE]);
      if (
        meta?.oid !== String(state.oid) ||
        meta.owner !== ROLES.owner ||
        meta.marker !== marker(state)
      )
        fail('PROCEDENCIA_NO_RECONOCIDA');
    }
    deps.check?.();
    return await action(client, url);
  } finally {
    await client.end();
  }
}

async function checkRoles(client) {
  const { rows } = await client.query(
    `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb,
    rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [Object.values(ROLES)],
  );
  if (rows.length !== 3 || rows.some((r) => !r.rolcanlogin)) fail('ROLES_EXISTENTES_INCOMPLETOS');
  const owner = rows.find((r) => r.rolname === ROLES.owner);
  if (!owner || !(owner.rolsuper || owner.rolcreatedb)) fail('DUENO_NO_PUEDE_CREAR_BASE');
  if (
    rows
      .filter((r) => r.rolname !== ROLES.owner)
      .some(
        (r) => r.rolsuper || r.rolcreatedb || r.rolcreaterole || r.rolbypassrls || r.rolreplication,
      )
  ) {
    fail('ROL_DE_SERVICIO_PRIVILEGIADO');
  }
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function readProcessedLayers(io = fs, digest = hashFile) {
  const layers = [];
  for (const capa of LAYERS) {
    const dir = path.join(ROOT, 'data/processed', VERSION, capa);
    const meta = JSON.parse(await io.readFile(path.join(dir, 'metadata.json'), 'utf8'));
    if (
      meta.capa !== capa ||
      meta.version !== VERSION ||
      meta.crs_origen !== 'EPSG:32720' ||
      meta.crs_salida !== 'EPSG:4326' ||
      !Number.isSafeInteger(meta.n_features_salida) ||
      meta.n_features_salida <= 0 ||
      !/^[a-f0-9]{64}$/.test(meta.sha256_manifiesto)
    ) {
      fail('METADATA_MUNICIPAL_NO_RECONOCIDA');
    }
    for (const kind of ['full', 'web']) {
      const expected = meta.sha256_salida?.[kind];
      if (
        !/^[a-f0-9]{64}$/.test(expected) ||
        (await digest(path.join(dir, `${capa}.${kind}.geojson`))) !== expected
      ) {
        fail('HUELLA_PROCESADA_NO_COINCIDE');
      }
    }
    layers.push({
      capa,
      n_features: meta.n_features_salida,
      crs_origen: meta.crs_origen,
      sha256_manifiesto: meta.sha256_manifiesto,
    });
  }
  return layers;
}

async function checkLayers(client, expected) {
  const { rows } =
    await client.query(`SELECT capa, version, n_features, crs_origen, sha256_manifiesto
    FROM geo.capa_version WHERE vigente ORDER BY capa`);
  if (
    expected?.length !== 3 ||
    rows.length !== 3 ||
    rows.some(
      (r, i) =>
        r.capa !== LAYERS[i] ||
        r.version !== VERSION ||
        r.capa !== expected[i].capa ||
        Number(r.n_features) !== expected[i].n_features ||
        r.crs_origen !== expected[i].crs_origen ||
        r.sha256_manifiesto !== expected[i].sha256_manifiesto,
    )
  ) {
    fail('CAPAS_MUNICIPALES_NO_VIGENTES');
  }
  for (const row of rows) {
    const {
      rows: [count],
    } = await client.query(
      `SELECT count(*)::int AS n FROM geo.${row.capa} WHERE version_capa = $1`,
      [VERSION],
    );
    if (count?.n !== Number(row.n_features)) fail('CONTEO_MUNICIPAL_NO_COINCIDE');
  }
  return rows;
}

// La URL que acreditó la guarda es también la que consume el CLI, sin destinos alternativos.
async function guardedJob(client, url, kind, deps, opciones) {
  deps.check?.();
  await checkIdentity(client, DATABASE, 'owner');
  deps.check?.();
  await deps.job(kind, url, opciones);
  await checkIdentity(client, DATABASE, 'owner');
}

export async function activate(client) {
  await client.query('BEGIN');
  try {
    const {
      rows: [admin],
    } = await client.query(`SELECT id::text FROM usuario
      WHERE email = 'admin@curichi.local' AND rol = 'admin' AND activo FOR UPDATE`);
    if (!admin) fail('ADMIN_LOCAL_AUSENTE');
    const { rows: before } = await client.query('SELECT * FROM categoria ORDER BY slug FOR UPDATE');
    if (
      before.length !== 4 ||
      before.some((r, i) => r.slug !== CATEGORIES[i]) ||
      !before.find((r) => r.slug === 'inundacion').activa ||
      before.some((r) => r.slug !== 'inundacion' && r.activa)
    )
      fail('CATALOGO_INICIAL_INESPERADO');
    const { rows: after } = await client.query(
      `UPDATE categoria SET activa = true,
      activada_en = now(), activada_por = $1 WHERE slug = ANY($2::text[]) RETURNING *`,
      [admin.id, ['bache', 'basura', 'area_verde']],
    );
    if (after.length !== 3) fail('ACTIVACION_INCOMPLETA');
    for (const row of after) {
      await client.query(
        `INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues)
        VALUES ('categoria', $1, 'activar', $2, $3::jsonb, $4::jsonb)`,
        [
          row.slug,
          admin.id,
          JSON.stringify(before.find((r) => r.slug === row.slug)),
          JSON.stringify(row),
        ],
      );
    }
    await client.query('COMMIT');
    return { before, after };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function prepare(urls, deps, { autorizarContraccionCompatible = false } = {}) {
  if (autorizarContraccionCompatible !== true) fail('CONSENTIMIENTO_0022_REQUERIDO');
  validateConnections(urls);
  let state = await deps.load();
  if (state) validateState(state);
  await deps.preflight();
  await withDatabase(
    urls,
    'owner',
    null,
    deps,
    async (client) => {
      await checkRoles(client);
      const {
        rows: [existing],
      } = await client.query(metadataSql, [DATABASE]);
      if (existing) {
        if (
          !state ||
          existing.oid !== String(state.oid) ||
          existing.owner !== ROLES.owner ||
          existing.marker !== marker(state)
        )
          fail('BASE_EXISTENTE_DESCONOCIDA');
        return;
      }
      if (state) fail('BASE_RECONOCIDA_AUSENTE');
      deps.check?.();
      state = { version: 1, database: DATABASE, installation: randomUUID(), stage: 'creating' };
      await deps.save(state);
      deps.check?.();
      await client.query('CREATE DATABASE curichi_multitematica OWNER curichi TEMPLATE template0');
      await client.query(`COMMENT ON DATABASE curichi_multitematica IS '${marker(state)}'`);
      const {
        rows: [created],
      } = await client.query(metadataSql, [DATABASE]);
      state = { ...state, oid: created.oid, stage: 'created' };
      await deps.save(state);
    },
    true,
  );
  const steps = [
    [
      'migrate',
      'migrated',
      async (client, url) => {
        await guardedJob(client, url, 'migrate', deps, { autorizarContraccionCompatible: true });
        const { rows } = await client.query('SELECT nombre FROM _migraciones ORDER BY nombre');
        if (JSON.stringify(rows.map((r) => r.nombre)) !== JSON.stringify(deps.migrations))
          fail('MIGRACIONES_INESPERADAS');
      },
    ],
    [
      'load',
      'loaded',
      async (client, url) => {
        await guardedJob(client, url, 'load', deps);
        await checkLayers(client, deps.layers);
      },
    ],
    [
      'seed',
      'seeded',
      async (client, url) => {
        await checkLayers(client, deps.layers);
        await guardedJob(client, url, 'seed', deps);
      },
    ],
    [
      'privileges',
      'privileges',
      async (client, url) => {
        await guardedJob(client, url, 'privileges', deps);
      },
    ],
    [
      'activate',
      'active',
      async (client) => {
        await checkLayers(client, deps.layers);
        state.activation = await activate(client);
      },
    ],
  ];
  for (const [job, complete, action] of steps) {
    if (STAGES.indexOf(state.stage) >= STAGES.indexOf(complete)) continue;
    await withDatabase(urls, 'owner', state, deps, async (client, url) => {
      await deps.save({ ...state, stage: `${job}:running` });
      deps.check?.();
      await action(client, url);
      state = { ...state, stage: complete };
      await deps.save(state);
    });
  }
  await verifyInstallation(urls, state, deps);
  await requireSchema22(urls, state, deps);
  return state;
}

async function verifyInstallation(urls, state, deps) {
  await withDatabase(urls, 'owner', state, deps, async (client) => {
    await checkLayers(client, deps.layers);
    const { rows } = await client.query('SELECT slug, activa FROM categoria ORDER BY slug');
    if (rows.length !== 4 || rows.some((r, i) => r.slug !== CATEGORIES[i] || !r.activa))
      fail('CUATRO_CATEGORIAS_NO_ACTIVAS');
  });
  for (const role of ['api', 'geo']) await withDatabase(urls, role, state, deps, async () => {});
}

export async function startInstallation(urls, deps) {
  validateConnections(urls);
  const state = validateState(await deps.load());
  if (state.stage !== 'active') fail('PREPARACION_INCOMPLETA');
  if (
    state.m10 &&
    (state.m10.stage !== 'actualizada' || state.m10.schema !== 22 || state.m10.release !== 22)
  )
    fail('ESTADO_M10_INCIERTO_O_VERSION_INCOMPATIBLE');
  await deps.preflight();
  await requireSchema22(urls, state, deps);
  await verifyInstallation(urls, state, deps);
  await withDatabase(urls, 'owner', state, deps, (client, url) =>
    guardedJob(client, url, 'privileges', deps),
  );
  await deps.ports();
  for (const kind of ['geo', 'api', 'web', 'panel']) {
    await deps.start(kind);
    await deps.ready(kind);
  }
  return deps.wait();
}

async function requireSchema22(urls, state, deps) {
  const schema =
    typeof deps.inspectSchema === 'function'
      ? await deps.inspectSchema()
      : await withDatabase(urls, 'owner', state, deps, async (client) => {
          const { rows } = await client.query(
            'SELECT version, integro FROM public.estado_esquema_m10()',
          );
          if (rows.length !== 1) fail('ESQUEMA_22_NO_ACREDITADO');
          return rows[0];
        });
  if (schema?.version !== 22 || schema.integro !== true) fail('ESQUEMA_22_NO_ACREDITADO');
}

const shaValido = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
function requireRelease(r, version, expected) {
  if (
    r?.version !== version ||
    r.dependenciasVerificadas !== true ||
    r.dbResueltoVersion !== version ||
    !shaValido(r.sha256) ||
    (expected !== undefined && r.sha256 !== expected)
  )
    fail('NO_VERIFICADO_REAL_RELEASE_DEPENDENCIAS_VERSION');
}

// Solo interfaces inyectadas. La entrada operacional queda cerrada hasta el protocolo real.
export async function updateInstallation(
  urls,
  deps,
  { autorizarContraccionCompatible = false } = {},
) {
  if (autorizarContraccionCompatible !== true) fail('CONSENTIMIENTO_0022_REQUERIDO');
  const a = deps.update;
  if (['verificarRelease', 'ejecutar'].some((k) => typeof a?.[k] !== 'function'))
    fail('ADAPTADOR_PROTOCOLO_INYECTADO_REQUERIDO');
  validateConnections(urls);
  const state = validateState(await deps.load());
  if (state.stage !== 'active' || (state.m10 && state.m10.stage !== 'recuperada'))
    fail('ESTADO_NO_REANUDABLE');
  const release21 = await a.verificarRelease(21);
  const release22 = await a.verificarRelease(22);
  requireRelease(release21, 21);
  requireRelease(release22, 22);
  state.m10 = {
    stage: 'incierta',
    schema: 21,
    release: 21,
    release21Sha256: release21.sha256,
    release22Sha256: release22.sha256,
    checkpoints: [],
  };
  return coordinatedSteps(
    state,
    deps,
    a,
    [
      'preflight21',
      'respaldoRestaurado21',
      'pausar21',
      'migrar22',
      'verificar22',
      'seleccionarRelease22',
      'reconciliarEstado22',
    ],
    { stage: 'actualizada', schema: 22, release: 22 },
    { autorizarContraccionCompatible: true },
  );
}

export async function recoverInstallation(urls, deps) {
  const a = deps.recovery;
  if (['verificarRelease', 'ejecutar'].some((k) => typeof a?.[k] !== 'function'))
    fail('ADAPTADOR_RELEASE_INYECTADO_REQUERIDO');
  validateConnections(urls);
  const state = validateState(await deps.load());
  const release = await a.verificarRelease(21);
  requireRelease(release, 21, state.m10?.release21Sha256);
  if (
    state.m10?.stage !== 'actualizada' ||
    state.m10.schema !== 22 ||
    state.m10.release !== 22 ||
    !shaValido(state.m10.datos22Sha256) ||
    !shaValido(state.m10.release21Sha256)
  )
    fail('ESTADO_M10_NO_REANUDABLE');
  return coordinatedSteps(
    state,
    deps,
    a,
    ['pausar22', 'reversa21', 'verificar21', 'seleccionarRelease21', 'reconciliarEstado21'],
    { stage: 'recuperada', schema: 21, release: 21 },
  );
}

async function coordinatedSteps(state, deps, adapter, steps, final, opciones = {}) {
  state.m10 = { ...state.m10, stage: 'incierta' };
  await deps.save(structuredClone(state));
  for (const paso of steps) {
    const entradaSha256 = huellaCanonica(state);
    state.m10.pendiente = paso;
    await deps.save(structuredClone(state));
    try {
      const resultado = await adapter.ejecutar(paso, {
        ...structuredClone(state.m10),
        entradaSha256,
        ...opciones,
      });
      if (resultado?.verificado !== true || !shaValido(resultado.sha256))
        fail('CHECKPOINT_NO_VERIFICADO');
      if (paso === 'verificar22') state.m10.datos22Sha256 = resultado.sha256;
      state.m10.checkpoints ??= [];
      state.m10.checkpoints.push({ paso, entradaSha256, salidaSha256: resultado.sha256 });
      await deps.save(structuredClone(state));
    } catch (error) {
      state.m10.stage = 'incierta';
      await deps.save(structuredClone(state));
      throw error;
    }
  }
  state.m10 = { ...state.m10, ...final, pendiente: null };
  await deps.save(structuredClone(state));
  return state;
}

export async function assertPortsFree() {
  for (const port of Object.values(PORTS)) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', () => reject(new Error(`PUERTO_OCUPADO_O_NO_DISPONIBLE:${port}`)));
      server.listen({ host: HOST, port, exclusive: true }, () => server.close(resolve));
    });
  }
}

// Solo se mata el árbol de un Node propio, identificado otra vez justo antes del cierre.
async function windowsIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) fail('PID_INVALIDO');
  const script = `$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction Stop; if($p){[pscustomobject]@{pid=$p.ProcessId;parent=$p.ParentProcessId;created=$p.CreationDate.ToUniversalTime().ToString('o');exe=$p.ExecutablePath;command=$p.CommandLine}|ConvertTo-Json -Compress}`;
  const { stdout } = await promisify(execFile)(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 5000 },
  );
  return stdout.trim() ? JSON.parse(stdout) : null;
}

function validIdentity(value, pid) {
  return (
    value?.pid === pid &&
    Number.isInteger(value.parent) &&
    value.parent > 0 &&
    typeof value.created === 'string' &&
    Number.isFinite(Date.parse(value.created)) &&
    typeof value.exe === 'string' &&
    !!value.exe.trim() &&
    typeof value.command === 'string' &&
    !!value.command.trim()
  );
}

const sameProcess = (a, b) =>
  !!a && !!b && ['pid', 'parent', 'created', 'exe', 'command'].every((key) => a[key] === b[key]);

// Una instantánea acotada a descendientes del PID acreditado; nunca cerrar por nombre de proceso.
async function windowsDescendants(pid) {
  const script = `$ErrorActionPreference='Stop';$all=@(Get-CimInstance Win32_Process -ErrorAction Stop);$ids=@(${pid});$out=@();for($i=0;$i -lt $ids.Count;$i++){foreach($p in $all){if($p.ParentProcessId -eq $ids[$i] -and $ids -notcontains $p.ProcessId){$ids+=@($p.ProcessId);$out+=@([pscustomobject]@{pid=$p.ProcessId;parent=$p.ParentProcessId;created=$p.CreationDate.ToUniversalTime().ToString('o');exe=$p.ExecutablePath;command=$p.CommandLine})}}};ConvertTo-Json -InputObject @($out) -Compress`;
  const { stdout } = await promisify(execFile)(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 5000 },
  );
  return JSON.parse(stdout);
}

export function createHost({
  launch = spawn,
  identity = windowsIdentity,
  descendants = windowsDescendants,
  killTree = (pid) =>
    promisify(execFile)('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 10000,
    }),
  platform = process.platform,
  log = () => {},
} = {}) {
  const children = [];
  let stopping;
  return {
    async start(args, options, job = false) {
      if (stopping) fail('CIERRE_EN_CURSO');
      const title = `curichi-multitematica-${randomUUID()}`;
      const child = launch(process.execPath, [`--title=${title}`, ...args], {
        ...options,
        shell: false,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const entry = { child, title, job, birth: null, done: null, accepted: null, result: null };
      children.push(entry);
      entry.done = new Promise((resolve) => {
        child.once('error', () => resolve({ code: 1 }));
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      void entry.done.then((result) => {
        entry.result = result;
      });
      for (const input of [child.stdout, child.stderr]) {
        if (input) createInterface({ input }).on('line', log);
      }
      entry.accepted = (async () => {
        await new Promise((resolve, reject) => {
          child.once('spawn', resolve);
          child.once('error', () => reject(new Error('NO_SE_PUDO_INICIAR_HIJO')));
        });
        log(`hijo propio PID ${child.pid}`);
        if (platform === 'win32' && child.exitCode === null) {
          entry.birth = await identity(child.pid);
          if (child.exitCode !== null || child.signalCode !== null) return;
          if (
            !validIdentity(entry.birth, child.pid) ||
            entry.birth.parent !== process.pid ||
            entry.birth.exe.toLowerCase() !== process.execPath.toLowerCase() ||
            !entry.birth.command.includes(`--title=${title}`)
          )
            fail('HIJO_SIN_IDENTIDAD_ACREDITADA');
        }
      })();
      await entry.accepted;
      if (stopping) fail('CIERRE_EN_CURSO');
      return { done: entry.done };
    },
    wait() {
      const services = children.filter((entry) => !entry.job);
      if (!services.length) fail('SIN_SERVICIOS_VIVOS');
      return Promise.race(services.map((entry) => entry.done));
    },
    stop() {
      stopping ??= (async () => {
        const failures = [];
        for (const entry of [...children].reverse()) {
          const { child } = entry;
          try {
            await entry.accepted;
            if (!child.pid) continue;
            if (child.exitCode !== null || child.signalCode !== null) {
              // Los jobs compilados sin wrappers terminan por sí mismos; un servicio caído
              // no permite deducir retrospectivamente la salida de posibles descendientes.
              if (entry.job && entry.result?.code === 0) continue;
              fail('PADRE_TERMINO_SIN_ACREDITAR_ARBOL');
            }
            let tree = [];
            if (platform === 'win32') {
              const now = await identity(child.pid);
              if (!sameProcess(now, entry.birth)) fail('IDENTIDAD_DE_HIJO_CAMBIO');
              tree = [now, ...(await descendants(child.pid))];
              const lineage = new Map([[now.pid, now]]);
              for (const p of tree.slice(1)) {
                const parent = lineage.get(p.parent);
                if (
                  !validIdentity(p, p.pid) ||
                  !parent ||
                  lineage.has(p.pid) ||
                  Date.parse(p.created) < Date.parse(parent.created)
                )
                  fail('DESCENDENCIA_NO_ACREDITADA');
                lineage.set(p.pid, p);
              }
              for (const p of tree) {
                if (!sameProcess(await identity(p.pid), p)) fail('IDENTIDAD_DE_HIJO_CAMBIO');
              }
              if (!sameProcess(await identity(child.pid), entry.birth))
                fail('IDENTIDAD_DE_HIJO_CAMBIO');
              await killTree(child.pid);
            } else process.kill(-child.pid, 'SIGTERM');
            let timer;
            try {
              await Promise.race([
                entry.done,
                new Promise((_, reject) => {
                  timer = setTimeout(() => reject(new Error('HIJO_NO_TERMINO')), 20000);
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
            if (platform === 'win32') {
              for (const p of tree) {
                const current = await identity(p.pid);
                if (
                  current != null &&
                  (!validIdentity(current, p.pid) || sameProcess(current, p))
                ) {
                  fail('PROCESO_PROPIO_SIGUE_VIVO_O_NO_ACREDITABLE');
                }
              }
            }
          } catch {
            failures.push(child.pid);
          }
        }
        if (failures.length) fail(`CIERRE_NO_CONFIRMADO_PID:${failures.join(',')}`);
      })();
      return stopping;
    },
  };
}

export async function closeRun(host, lock, removeLock, log) {
  let confirmed = false;
  try {
    await host?.stop();
    confirmed = true;
  } finally {
    await lock.close();
    if (confirmed) await removeLock();
    else log('CIERRE_NO_CONFIRMADO: runner.lock conservado; inspeccionar antes de reanudar');
  }
}

export function protectSignals(host, log, events = process) {
  let cancelled = false;
  const onSignal = () => {
    cancelled = true;
    void host.stop().catch((error) => log(error.message));
  };
  for (const name of ['SIGINT', 'SIGTERM']) events.on(name, onSignal);
  return {
    get cancelled() {
      return cancelled;
    },
    check() {
      if (cancelled) fail('INTERRUMPIDO');
    },
    dispose() {
      for (const name of ['SIGINT', 'SIGTERM']) events.off(name, onSignal);
    },
  };
}

export async function runJob(
  kind,
  url,
  { source, inherited, scratch, urls, tokens, host, migrationOptions },
) {
  if (!['migrate', 'load', 'seed', 'privileges'].includes(kind)) fail('JOB_DESCONOCIDO');
  const env = privateEnvironment(source, inherited, scratch, urls, kind, tokens, url);
  const spec = jobSpec(kind, undefined, migrationOptions);
  const { done } = await host.start(spec.args, { cwd: spec.cwd, env }, true);
  const result = await done;
  if (result.code !== 0) fail(`JOB_FALLO:${kind}`);
}

export function jobSpec(kind, resolveApp, { autorizarContraccionCompatible = false } = {}) {
  const jobs = {
    migrate: [
      'packages/db',
      [
        'dist/cli/migrar.js',
        '--hasta',
        '0022',
        ...(autorizarContraccionCompatible === true ? ['--autorizar-contraccion-compatible'] : []),
      ],
    ],
    load: ['pipelines/geodata-etl', ['dist/cli.js', 'load', '--version', VERSION]],
    privileges: ['packages/db', ['src/cli/verificar-privilegios.mjs']],
    api: ['services/api-core', ['dist/servidor.js']],
    geo: ['services/geo-service', ['dist/servidor.js']],
  };
  if (kind === 'seed') {
    // El build DB excluye el CLI seed. Adaptar su función existente, sin duplicar sus reglas.
    const entry = pathToFileURL(path.join(ROOT, 'packages/db/dist/index.js')).href;
    // Los workers eval de password son CommonJS y heredan execArgv del padre.
    const script = `void(async()=>{const {crearPool,ejecutorPg,esperarBaseDeDatos,sembrarSamples,cerrarWorkersDePassword}=await import(${JSON.stringify(entry)});const pool=crearPool(process.env.DATABASE_URL,1);try{await esperarBaseDeDatos(pool,10,500);process.stdout.write('[db] seeds SINTÉTICOS: '+JSON.stringify(await sembrarSamples(ejecutorPg(pool)))+'\\n');}finally{try{await pool.end();}finally{await cerrarWorkersDePassword();}}})().catch(error=>{process.stderr.write("SEED_FALLO: "+error.message);process.exitCode=1;});`;
    return {
      cwd: path.join(ROOT, 'packages/db'),
      args: ['--input-type=commonjs', '--eval', script],
    };
  }
  if (Object.hasOwn(jobs, kind)) {
    const [dir, args] = jobs[kind];
    return { args, cwd: path.join(ROOT, dir) };
  }
  if (kind !== 'web' && kind !== 'panel') fail('JOB_DESCONOCIDO');
  const dir = path.join(ROOT, kind === 'web' ? 'apps/web-ciudadano' : 'apps/panel-admin');
  // Usar el loader de Next, en el entorno del hijo, antes de que su CLI pueda escuchar.
  const check = `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(path.join(dir, 'package.json'))});const c=await require('next/dist/server/config').default('phase-production-server',${JSON.stringify(dir)});if(process.env.CURICHI_INSTALACION_LOCAL!=='1'||c.distDir!=='.next-multitematica')throw Error('SALIDA_NEXT_NO_AISLADA');`;
  return {
    cwd: dir,
    args: [
      '--import',
      `data:text/javascript,${encodeURIComponent(check)}`,
      resolveApp(kind, 'next/dist/bin/next'),
      'start',
      '--hostname',
      HOST,
      '--port',
      String(PORTS[kind]),
    ],
  };
}

export async function verifyNextBuild(kind, io = fs) {
  if (kind !== 'web' && kind !== 'panel') fail('JOB_DESCONOCIDO');
  const dir = path.join(ROOT, kind === 'web' ? 'apps/web-ciudadano' : 'apps/panel-admin');
  const out = path.join(dir, '.next-multitematica');
  if (path.relative(out, await io.realpath(out))) fail('SALIDA_NEXT_NO_AISLADA');
  const id = (await io.readFile(path.join(out, 'BUILD_ID'), 'utf8')).trim();
  const manifest = JSON.parse(
    await io.readFile(path.join(out, 'required-server-files.json'), 'utf8'),
  );
  if (
    !/^[\w-]{1,200}$/.test(id) ||
    manifest.version !== 1 ||
    manifest.config?.distDir !== '.next-multitematica' ||
    typeof manifest.appDir !== 'string' ||
    path.relative(dir, manifest.appDir)
  )
    fail('BUILD_NEXT_NO_RECONOCIDO');
  for (const file of ['routes-manifest.json', 'server/app-paths-manifest.json'])
    await io.access(path.join(out, file));
  // Un cambio de configuración después del build requiere un build nuevo, nunca fallback a .next.
  if (
    (await io.stat(path.join(dir, 'next.config.ts'))).mtimeMs >
    (await io.stat(path.join(out, 'BUILD_ID'))).mtimeMs
  )
    fail('BUILD_NEXT_DESACTUALIZADO');
}

async function verifyCompiled() {
  for (const pkg of [
    'packages/contracts',
    'packages/db',
    'services/api-core',
    'services/geo-service',
    'pipelines/geodata-etl',
  ]) {
    const src = path.join(ROOT, pkg, 'src');
    async function visit(dir) {
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
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
          fail(`BUILD_DESACTUALIZADO:${pkg}`);
      }
    }
    await visit(src);
  }
}

async function run(action, opciones) {
  if (action === 'actualizar') fail('ADAPTADOR_PROTOCOLO_INYECTADO_REQUERIDO');
  if (action === 'preparar' && opciones?.autorizarContraccionCompatible !== true)
    fail('CONSENTIMIENTO_0022_REQUERIDO');
  await fs.mkdir(path.join(SCRATCH, 'tmp'), { recursive: true });
  const lock = await fs.open(path.join(SCRATCH, 'runner.lock'), 'wx');
  let host;
  let signals;
  let log = () => {};
  try {
    await lock.writeFile(String(process.pid));
    const source = parseEnv(await fs.readFile(path.join(ROOT, '.env'), 'utf8'));
    const urls = deriveUrls(source);
    const tokens = {
      geo: randomBytes(32).toString('hex'),
      metrics: randomBytes(32).toString('hex'),
    };
    const secrets = Object.entries(source)
      .filter(([key]) => /PASSWORD|TOKEN|SAL|SECRET|DATABASE_URL/.test(key))
      .flatMap(([, value]) => [value, encodeURIComponent(value)]);
    secrets.push(...Object.values(tokens), ...Object.values(urls));
    for (const value of Object.values(urls)) {
      const password = new URL(value).password;
      secrets.push(password, decodeURIComponent(password));
    }
    log = (line) => {
      const safe = redact(line, secrets);
      appendFileSync(path.join(SCRATCH, 'operacion.log'), `${safe}\n`, { mode: 0o600 });
      process.stdout.write(`${safe}\n`);
    };
    const resolveApp = (kind, name) =>
      createRequire(
        path.join(
          ROOT,
          kind === 'web' ? 'apps/web-ciudadano/package.json' : 'apps/panel-admin/package.json',
        ),
      ).resolve(name);
    const pg = createRequire(path.join(ROOT, 'packages/db/package.json'))('pg');
    host = createHost({ log });
    signals = protectSignals(host, log);
    const services = new Map();
    const start = async (kind) => {
      signals.check();
      const spec = jobSpec(kind, resolveApp);
      const env = privateEnvironment(source, process.env, SCRATCH, urls, kind, tokens);
      log(`iniciando ${kind} en ${DATABASE}`);
      const { done } = await host.start(spec.args, { cwd: spec.cwd, env });
      const service = { done, ended: false };
      services.set(kind, service);
      void done.then(() => {
        service.ended = true;
      });
      return { done };
    };
    const stateFile = path.join(SCRATCH, 'instalacion.json');
    const deps = {
      record: (event) => log(JSON.stringify(event)),
      check: signals.check,
      client: (value) => {
        const url = new URL(value);
        return new pg.Client({
          host: url.hostname === '[::1]' ? '::1' : url.hostname,
          port: 5432,
          database: url.pathname.slice(1),
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          ssl: false,
          options: '-c search_path=public,geo',
          application_name: 'mi-curichi-multitematica',
          connectionTimeoutMillis: 5000,
          statement_timeout: 30000,
        });
      },
      async load() {
        try {
          return JSON.parse(await fs.readFile(stateFile, 'utf8'));
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      },
      async save(state) {
        const temp = await fs.open(`${stateFile}.tmp`, 'w', 0o600);
        try {
          await temp.writeFile(`${JSON.stringify(state, null, 2)}\n`);
          await temp.sync();
        } finally {
          await temp.close();
        }
        await fs.rename(`${stateFile}.tmp`, stateFile);
        log(`etapa ${state.stage}`);
      },
      migrations: (await fs.readdir(path.join(ROOT, 'packages/db/migraciones')))
        .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name.slice(0, 4) <= '0022')
        .sort(),
      async preflight() {
        if (freemem() < 1500 * 1024 * 1024) fail('MEMORIA_LIBRE_MENOR_A_1500_MIB');
        deps.layers = await readProcessedLayers();
        const contracts = await import(
          pathToFileURL(path.join(ROOT, 'packages/contracts/dist/index.js')).href
        );
        if (
          JSON.stringify([...contracts.REGISTRO_CATEGORIAS.slugs].sort()) !==
          JSON.stringify(CATEGORIES)
        )
          fail('CONTRACTS_COMPILADO_SIN_CUATRO_CATEGORIAS');
        await verifyCompiled();
        await fs.access(path.join(ROOT, 'packages/db/src/cli/verificar-privilegios.mjs'));
        for (const kind of ['web', 'panel']) await verifyNextBuild(kind);
        for (const kind of [
          'migrate',
          'load',
          'seed',
          'privileges',
          'geo',
          'api',
          'web',
          'panel',
        ]) {
          jobSpec(kind, resolveApp);
          privateEnvironment(source, process.env, SCRATCH, urls, kind, tokens, urls.owner);
        }
      },
      job: (kind, url, migrationOptions) => {
        signals.check();
        log(`iniciando ${kind} en ${DATABASE}`);
        return runJob(kind, url, {
          source,
          inherited: process.env,
          scratch: SCRATCH,
          urls,
          tokens,
          host,
          migrationOptions,
        });
      },
      async ports() {
        if (freemem() < 2500 * 1024 * 1024) fail('MEMORIA_LIBRE_MENOR_A_2500_MIB');
        await assertPortsFree();
        await fs.mkdir(path.join(ROOT, 'infra/.storage/multitematica/fotos'), { recursive: true });
      },
      start,
      async ready(kind) {
        const url = `http://${HOST}:${PORTS[kind]}${kind === 'api' || kind === 'geo' ? '/ready' : '/'}`;
        for (let attempt = 0; attempt < 120; attempt++) {
          signals.check();
          for (const [name, service] of services)
            if (service.ended) fail(`SERVICIO_TERMINO:${name}`);
          try {
            const response = await fetch(url, {
              signal: AbortSignal.timeout(2000),
              redirect: 'error',
            });
            if (response.ok) {
              if (kind === 'api' || kind === 'geo') {
                const body = await response.json();
                if (body.degradado) fail(`SERVICIO_DEGRADADO:${kind}`);
              }
              return;
            }
          } catch {
            /* Esperar solo el arranque de los hijos propios. */
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        fail(`SERVICIO_NO_LISTO:${kind}`);
      },
      async wait() {
        log(
          `Web http://${HOST}:${PORTS.web} · panel http://${HOST}:${PORTS.panel} · Ctrl+C para cerrar`,
        );
        await host.wait();
        if (!signals.cancelled) fail('SERVICIO_TERMINO');
      },
    };
    if (action === 'preparar') await prepare(urls, deps, opciones);
    else await startInstallation(urls, deps);
  } finally {
    try {
      await closeRun(host, lock, () => fs.unlink(path.join(SCRATCH, 'runner.lock')), log);
    } finally {
      signals?.dispose();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = parseAction(process.argv.slice(2));
    if (action === '--ayuda')
      process.stdout.write(
        'node scripts/multitematica-local.mjs preparar|iniciar\nDestino fijo: curichi_multitematica; PostgreSQL local ya instalado.\n',
      );
    else
      await run(action, {
        autorizarContraccionCompatible: process.argv.includes('--autorizar-contraccion-compatible'),
      });
  } catch (error) {
    // Los detalles de hijos ya pasan por el redactor. No imprimir objetos pg/env ni sus causes.
    const code =
      error.code ||
      (/^[A-Z_]+(?::[A-Za-z0-9_,:. |/-]+)?$/.test(error.message)
        ? error.message
        : 'OPERACION_LOCAL_FALLO');
    process.stderr.write(`${code}; revisar la etapa y operacion.log en el scratch de operación.\n`);
    process.exitCode = 1;
  }
}
