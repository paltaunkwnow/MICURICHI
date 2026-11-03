import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as moduloLocal from './multitematica-local.mjs';
import {
  activate,
  BOOTSTRAP,
  closeRun,
  createHost,
  DATABASE,
  deriveUrls,
  HOST,
  jobSpec,
  PORTS,
  parseAction,
  prepare,
  privateEnvironment,
  protectSignals,
  readProcessedLayers,
  redact,
  runJob,
  startInstallation,
  validateState,
  validateUrl,
  verifyNextBuild,
  withDatabase,
} from './multitematica-local.mjs';

const password = randomUUID();
const credential = (role, database = 'curichi') => {
  const url = new URL(`postgresql://127.0.0.1:5432/${database}`);
  url.username = role;
  url.password = password;
  return url.toString();
};
const source = {
  DATABASE_URL: credential('curichi'),
  API_DATABASE_URL: credential('curichi_api'),
  GEO_DATABASE_URL: credential('curichi_geo'),
  IP_HASH_SAL: randomUUID(),
  JITTER_SAL: randomUUID(),
};
const urls = deriveUrls(source);
const tokens = { geo: randomUUID(), metrics: randomUUID() };
const initialState = () => ({
  version: 1,
  database: DATABASE,
  installation: randomUUID(),
  oid: '8001',
  stage: 'created',
});
const categories = (active = false) =>
  ['area_verde', 'bache', 'basura', 'inundacion'].map((slug) => ({
    slug,
    activa: active || slug === 'inundacion',
    activada_en: null,
    activada_por: null,
    orden: 1,
  }));
const layers = ['distrito_municipal', 'manzana', 'unidad_vecinal'].map((capa) => ({
  capa,
  version: 'DM_UV_MZ_2025',
  n_features: 1,
  crs_origen: 'EPSG:32720',
  sha256_manifiesto: 'a'.repeat(64),
}));

function fixture(overrides = {}) {
  const f = {
    state: null,
    meta: null,
    calls: [],
    clients: [],
    jobs: [],
    catalog: categories(),
    audit: [],
    roles: ['curichi', 'curichi_api', 'curichi_geo'].map((rolname) => ({
      rolname,
      rolcanlogin: true,
      rolsuper: rolname === 'curichi',
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
    })),
    ...overrides,
  };
  let snapshot;
  f.deps = {
    layers,
    migrations: [
      '0001_inicial.sql',
      '0021_indice_categoria_creado.sql',
      '0022_contraccion_compatible.sql',
    ],
    inspectSchema: async () => ({ version: 22, integro: true }),
    async preflight() {
      f.calls.push('preflight');
      if (f.noDataset) throw Error('CAPAS_AUSENTES');
      if (f.noBuild) throw Error('BUILD_AUSENTE');
    },
    async load() {
      return structuredClone(f.state);
    },
    async save(state) {
      if (f.failSaveAt === state.stage) throw Error('SAVE_FALLO');
      f.state = structuredClone(state);
      f.calls.push(`save:${state.stage}`);
    },
    async job(kind, guardedUrl, migrationOptions) {
      await runJob(kind, guardedUrl, {
        source,
        inherited: {},
        scratch: '.',
        urls,
        tokens,
        migrationOptions,
        host: {
          async start(args, { cwd, env }, job) {
            assert.equal(job, true);
            assert.equal(
              env.DATABASE_URL,
              guardedUrl,
              'el CLI consume exactamente la URL acreditada',
            );
            f.jobs.push({ kind, url: guardedUrl, env, spec: { args, cwd } });
            f.calls.push(`job:${kind}`);
            return { done: Promise.resolve({ code: f.failJob === kind ? 1 : 0 }) };
          },
        },
      });
    },
    async ports() {
      f.calls.push('ports');
      if (f.busy) throw Error('PUERTO_OCUPADO');
    },
    async start(kind) {
      f.calls.push(`start:${kind}`);
    },
    async ready(kind) {
      f.calls.push(`ready:${kind}`);
      if (f.failReady === kind) throw Error('NO_LISTO');
    },
    async wait() {
      f.calls.push('wait');
    },
    client(value) {
      const url = new URL(value);
      const database = url.pathname.slice(1);
      assert.ok(
        [BOOTSTRAP, DATABASE].includes(database),
        'ningún Client apunta a una base habitual',
      );
      f.clients.push(database);
      let gated = false;
      return {
        async connect() {
          f.calls.push(`connect:${database}`);
        },
        async end() {
          f.calls.push(`end:${database}`);
        },
        async query(sql, values = []) {
          const query = sql.replace(/\s+/g, ' ').trim();
          f.calls.push(query);
          if (query.startsWith('SELECT current_database()')) {
            gated = true;
            const role = decodeURIComponent(url.username);
            if (database === DATABASE && f.breakIdentityAt === f.state?.stage)
              return { rows: [f.badIdentity] };
            return {
              rows: [
                {
                  database:
                    (database === DATABASE ? f.wrongNewDatabase : null) ??
                    f.wrongDatabase ??
                    database,
                  role: f.wrongRole ?? role,
                  session: f.wrongSession ?? role,
                },
              ],
            };
          }
          assert.ok(gated, 'la identidad es la primera consulta de cada conexión');
          if (query.includes('FROM pg_database')) {
            const meta = f.meta ? structuredClone(f.meta) : null;
            // COMMENT ON DATABASE vive en pg_shdescription, compartido entre bases.
            if (meta && f.sharedCommentOnly && !/\bshobj_description\(/.test(query))
              meta.marker = null;
            return { rows: meta ? [meta] : [] };
          }
          if (query.includes('FROM pg_roles')) return { rows: f.roles };
          if (query.startsWith('CREATE DATABASE')) {
            assert.equal(database, BOOTSTRAP);
            assert.equal(
              query,
              'CREATE DATABASE curichi_multitematica OWNER curichi TEMPLATE template0',
            );
            f.meta = { oid: '8001', owner: 'curichi', marker: null };
          } else if (query.startsWith('COMMENT ON DATABASE')) {
            f.meta.marker = `multitematica-local/v1/${f.state.installation}`;
          } else if (query === 'SELECT nombre FROM _migraciones ORDER BY nombre') {
            return { rows: (f.migrations ?? f.deps.migrations).map((nombre) => ({ nombre })) };
          } else if (query.includes('FROM geo.capa_version')) return { rows: f.layers ?? layers };
          else if (query.startsWith('SELECT count(*)::int AS n FROM geo.'))
            return { rows: [{ n: f.layerCount ?? 1 }] };
          else if (query === 'BEGIN')
            snapshot = { catalog: structuredClone(f.catalog), audit: [...f.audit] };
          else if (query.includes('FROM usuario'))
            return { rows: f.noAdmin ? [] : [{ id: randomUUID() }] };
          else if (query.startsWith('SELECT * FROM categoria'))
            return { rows: structuredClone(f.catalog) };
          else if (query.startsWith('UPDATE categoria')) {
            f.catalog = f.catalog.map((row) =>
              row.slug === 'inundacion'
                ? row
                : {
                    ...row,
                    activa: true,
                    activada_en: '2026-10-22T00:00:00.000Z',
                    activada_por: values[0],
                  },
            );
            return { rows: structuredClone(f.catalog.filter((row) => row.slug !== 'inundacion')) };
          } else if (query.startsWith('INSERT INTO auditoria')) {
            if (f.auditFails) throw Error('AUDITORIA_FALLO');
            f.audit.push(values);
          } else if (query === 'ROLLBACK') {
            f.catalog = snapshot.catalog;
            f.audit = snapshot.audit;
          } else if (query.startsWith('SELECT slug, activa')) return { rows: f.catalog };
          else if (query !== 'COMMIT') throw Error(`SQL_NO_SIMULADO: ${query}`);
          return { rows: [] };
        },
      };
    },
  };
  return f;
}

function existing(stage = 'created', overrides = {}) {
  const state = { ...initialState(), stage };
  return fixture({
    state,
    meta: {
      oid: state.oid,
      owner: 'curichi',
      marker: `multitematica-local/v1/${state.installation}`,
    },
    ...overrides,
  });
}

test('solo dos acciones fijas y ayuda; rechaza args extra antes de cualquier dependencia', () => {
  for (const action of ['preparar', 'iniciar', '--ayuda'])
    assert.equal(parseAction([action]), action);
  for (const args of [[], ['preparar', '--db', DATABASE], ['drop'], ['--help']]) {
    assert.throws(() => parseAction(args), /USO/);
  }
});

test('credenciales de .env se derivan sin conectar su base original; roles y contraseñas se conservan', () => {
  assert.equal(new URL(urls.bootstrap).pathname, `/${BOOTSTRAP}`);
  for (const role of ['owner', 'api', 'geo']) {
    assert.equal(new URL(urls[role]).pathname, `/${DATABASE}`);
    assert.equal(new URL(urls[role]).password, password);
  }
  const fallback = deriveUrls({
    DATABASE_URL: source.DATABASE_URL,
    API_DB_PASSWORD: password,
    GEO_DB_PASSWORD: password,
  });
  assert.equal(fallback.api, urls.api);
  assert.equal(fallback.geo, urls.geo);
  assert.throws(() => deriveUrls({ DATABASE_URL: source.DATABASE_URL }), /CREDENCIAL/);
});

for (const [label, value] of [
  ['habitual', credential('curichi', 'curichi')],
  ['revision', credential('curichi', 'curichi_revision')],
  ['postgres', credential('curichi', 'postgres')],
  ['remota', urls.owner.replace('127.0.0.1', 'example.invalid')],
  ['puerto', urls.owner.replace(':5432', ':5433')],
  ['options', `${urls.owner}?options=-c%20role%3Dcurichi`],
  ['host en query', `${urls.owner}?host=example.invalid`],
  ['fragmento', `${urls.owner}#otra`],
  ['rol', urls.owner.replace('curichi:', 'postgres:')],
  ['path codificado', urls.owner.replace(DATABASE, 'curichi%5fmultitematica')],
  ['vacía', ''],
]) {
  test(`rechaza URL ${label} antes de construir Client o ejecutar job`, async () => {
    const f = fixture();
    await assert.rejects(
      prepare({ ...urls, owner: value }, f.deps, { autorizarContraccionCompatible: true }),
    );
    assert.equal(f.clients.length, 0);
    assert.deepEqual(f.calls, []);
  });
}

test('valida TODOS los roles y bootstrap antes del primer Client', async () => {
  for (const invalid of [
    { api: urls.owner },
    { geo: urls.api },
    { bootstrap: urls.owner },
    { api: urls.api.replace('127.0.0.1', '[::1]') },
  ]) {
    const f = fixture();
    await assert.rejects(
      prepare({ ...urls, ...invalid }, f.deps, { autorizarContraccionCompatible: true }),
    );
    assert.equal(f.clients.length, 0);
  }
  assert.throws(() => validateUrl(urls.owner, 'inventado'), /DESTINO/);
  assert.throws(() => validateUrl(urls.owner, 'owner', 'curichi'), /DESTINO/);
});

test('identidad de base/rol/sesión incorrecta cierra Client sin writes ni jobs', async () => {
  for (const override of [
    { wrongDatabase: 'curichi' },
    { wrongRole: 'postgres' },
    { wrongSession: 'postgres' },
  ]) {
    const f = fixture(override);
    await assert.rejects(
      prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
      /IDENTIDAD/,
    );
    assert.equal(f.calls.filter((line) => line.startsWith('SELECT ')).length, 1);
    assert.equal(f.calls.at(-1), `end:${BOOTSTRAP}`);
    assert.ok(!f.calls.some((line) => /^(job:|CREATE |COMMENT )/.test(line)));
  }
});

test('dataset faltante y roles ausentes/privilegiados abortan antes de CREATE', async () => {
  const missing = fixture({ noDataset: true });
  await assert.rejects(
    prepare(urls, missing.deps, { autorizarContraccionCompatible: true }),
    /CAPAS_AUSENTES/,
  );
  assert.equal(missing.clients.length, 0);
  for (const modify of [
    (f) => {
      f.roles.pop();
    },
    (f) => {
      f.roles[0].rolsuper = false;
    },
    (f) => {
      f.roles[1].rolsuper = true;
    },
    (f) => {
      f.roles[2].rolcanlogin = false;
    },
  ]) {
    const f = fixture();
    modify(f);
    await assert.rejects(prepare(urls, f.deps, { autorizarContraccionCompatible: true }));
    assert.ok(!f.calls.some((line) => line.startsWith('CREATE')));
  }
});

test('base existente desconocida jamás se adopta, borra ni recrea', async () => {
  const f = fixture({ meta: { oid: '8001', owner: 'curichi', marker: null } });
  await assert.rejects(
    prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
    /BASE_EXISTENTE_DESCONOCIDA/,
  );
  assert.deepEqual(f.clients, [BOOTSTRAP]);
  assert.ok(!f.calls.some((line) => /CREATE|DROP|job:/.test(line)));
  const other = existing();
  other.meta.marker = 'otra instalación';
  await assert.rejects(
    prepare(urls, other.deps, { autorizarContraccionCompatible: true }),
    /BASE_EXISTENTE_DESCONOCIDA/,
  );
});

test('preparación nueva respeta orden, guarda cada conexión y audita las tres activaciones', async () => {
  const f = fixture();
  const state = await prepare(urls, f.deps, { autorizarContraccionCompatible: true });
  assert.equal(state.stage, 'active');
  assert.deepEqual(
    f.calls.filter((line) => line.startsWith('job:')),
    ['job:migrate', 'job:load', 'job:seed', 'job:privileges'],
  );
  assert.equal(f.calls.filter((line) => line.startsWith('CREATE DATABASE')).length, 1);
  for (const job of f.jobs) assert.equal(job.url, urls.owner);
  assert.ok(f.clients.every((database) => database === DATABASE || database === BOOTSTRAP));
  assert.equal(f.audit.length, 3);
  for (const [slug, actor, before, after] of f.audit) {
    assert.equal(JSON.parse(before).activa, false);
    assert.equal(JSON.parse(after).activa, true);
    assert.equal(JSON.parse(after).activada_por, actor);
    assert.notEqual(slug, 'inundacion');
  }
  assert.equal(f.calls.filter((line) => line === 'COMMIT').length, 1);
  assert.equal(state.activation.before.length, 4);
});

test('reanuda la base creada usando su comentario compartido, sin recrearla', async () => {
  const f = existing('created', { sharedCommentOnly: true });
  const state = await prepare(urls, f.deps, { autorizarContraccionCompatible: true });
  assert.equal(state.stage, 'active');
  assert.equal(state.oid, '8001');
  assert.ok(!f.calls.some((line) => /^(CREATE|COMMENT ON|DROP) DATABASE/.test(line)));
  assert.deepEqual(
    f.calls.filter((line) => line.startsWith('job:')),
    ['job:migrate', 'job:load', 'job:seed', 'job:privileges'],
  );
});

test('cada job requiere guarda del destino y procedencia, aunque la URL parezca correcta', async () => {
  const f = existing();
  f.meta.oid = '9999';
  await assert.rejects(
    withDatabase(urls, 'owner', f.state, f.deps, () => f.deps.job('seed')),
    /PROCEDENCIA/,
  );
  assert.ok(!f.calls.includes('job:seed'));
  assert.equal(f.calls.at(-1), `end:${DATABASE}`);
});

test('migraciones posteriores/inesperadas o capas municipales ausentes detienen las etapas siguientes', async () => {
  const m = existing('created', { migrations: ['0022_fuera.sql'] });
  await assert.rejects(
    prepare(urls, m.deps, { autorizarContraccionCompatible: true }),
    /MIGRACIONES_INESPERADAS/,
  );
  assert.ok(!m.calls.includes('job:load'));
  const g = existing('migrated', { layers: [] });
  await assert.rejects(
    prepare(urls, g.deps, { autorizarContraccionCompatible: true }),
    /CAPAS_MUNICIPALES/,
  );
  assert.ok(!g.calls.includes('job:seed'));
});

test('seed fallido conserva evidencia y no se repite al reintentar', async () => {
  const f = existing('loaded', { failJob: 'seed' });
  await assert.rejects(
    prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
    /JOB_FALLO/,
  );
  assert.equal(f.state.stage, 'seed:running');
  const before = f.clients.length;
  await assert.rejects(
    prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
    /ESTADO_NO_REANUDABLE/,
  );
  assert.equal(f.clients.length, before);
  assert.equal(f.calls.filter((line) => line === 'job:seed').length, 1);
});

test('etapas reconocidas omiten seed; estado completo no repite ningún job', async () => {
  const f = existing('seeded');
  await prepare(urls, f.deps, { autorizarContraccionCompatible: true });
  assert.deepEqual(
    f.calls.filter((line) => line.startsWith('job:')),
    ['job:privileges'],
  );
  f.calls.length = 0;
  await prepare(urls, f.deps, { autorizarContraccionCompatible: true });
  assert.ok(!f.calls.some((line) => line.startsWith('job:')));
  assert.ok(!f.calls.some((line) => /CREATE|DROP|INSERT|UPDATE|COMMENT/.test(line)));
  for (const stage of ['creating', 'migrate:running', 'seed:running', 'activate:running', 'otro']) {
    assert.throws(() => validateState({ ...f.state, stage }), /ESTADO_NO_REANUDABLE/);
  }
});

test('activación sin admin o con fallo de auditoría hace ROLLBACK de catálogo y auditoría', async () => {
  for (const override of [{ noAdmin: true }, { auditFails: true }]) {
    const f = existing('privileges', override);
    await assert.rejects(withDatabase(urls, 'owner', f.state, f.deps, activate));
    assert.deepEqual(f.catalog, categories());
    assert.deepEqual(f.audit, []);
    assert.ok(f.calls.includes('ROLLBACK'));
    assert.ok(!f.calls.includes('COMMIT'));
  }
});

test('entorno por hijo elimina credenciales y destinos heredados contradictorios sin mutar el padre', () => {
  const inherited = {
    PATH: 'herramientas-instaladas',
    TEMP: 'cache-original',
    TMP: 'cache-original',
    NODE_OPTIONS: '--require inyeccion',
    PGHOST: 'remoto',
    PGOPTIONS: '-c role=postgres',
    DATABASE_URL: credential('curichi', 'curichi_revision'),
    S3_ENDPOINT: 'https://example.invalid',
    S3_SECRET_KEY: randomUUID(),
    E2E_PUBLICA_URL: 'https://example.invalid',
    API_CORE_HOST: '0.0.0.0',
    CURICHI_INSTALACION_LOCAL: '0',
  };
  const original = structuredClone(inherited);
  for (const kind of ['migrate', 'load', 'seed', 'privileges', 'api', 'geo', 'web', 'panel']) {
    const env = privateEnvironment(source, inherited, 'scratch', urls, kind, tokens, urls.owner);
    assert.equal(env.NODE_ENV, kind === 'web' || kind === 'panel' ? 'production' : 'development');
    assert.equal(env.CURICHI_INSTALACION_LOCAL, '1');
    assert.equal(env.API_CORE_HOST, HOST);
    assert.equal(env.GEO_SERVICE_HOST, HOST);
    assert.ok(env.TEMP.includes('scratch'));
    for (const key of [
      'NODE_OPTIONS',
      'PGHOST',
      'PGOPTIONS',
      'S3_ENDPOINT',
      'S3_SECRET_KEY',
      'E2E_PUBLICA_URL',
    ]) {
      assert.equal(env[key], undefined);
    }
    if (kind === 'web' || kind === 'panel') assert.equal(env.DATABASE_URL, undefined);
    else assert.equal(env.DATABASE_URL, urls[kind === 'api' || kind === 'geo' ? kind : 'owner']);
    assert.equal(env.REPORTE_DEMORA_PRIMERO_S, '60');
    assert.equal(env.REPORTE_DEMORA_SIGUIENTES_S, '240');
    assert.equal(env.COOKIE_SEGURA, '0');
    assert.ok(
      env.STORAGE_DIR.replaceAll('\\', '/').endsWith('/infra/.storage/multitematica/fotos'),
    );
  }
  assert.deepEqual(inherited, original);
  assert.throws(
    () => privateEnvironment(source, {}, '.', urls, 'arbitrario', tokens),
    /JOB_DESCONOCIDO/,
  );
});

test('logs redactan URL, secretos y valores codificados', () => {
  const secret = randomUUID();
  const line = redact(`error ${urls.api} ${secret} ${encodeURIComponent(secret)}`, [secret]);
  assert.ok(!line.includes(password));
  assert.ok(!line.includes(secret));
});

test('arranque exige estado completo y puertos libres antes de crear servicios', async () => {
  const incomplete = existing('seeded');
  await assert.rejects(startInstallation(urls, incomplete.deps), /PREPARACION_INCOMPLETA/);
  assert.deepEqual(incomplete.calls, []);
  const busy = existing('active', { catalog: categories(true), busy: true });
  await assert.rejects(startInstallation(urls, busy.deps), /PUERTO_OCUPADO/);
  assert.ok(!busy.calls.some((line) => line.startsWith('start:')));
  const f = existing('active', { catalog: categories(true) });
  await startInstallation(urls, f.deps);
  assert.deepEqual(
    f.calls.filter((line) => /^(start:|ready:|wait$)/.test(line)),
    [
      'start:geo',
      'ready:geo',
      'start:api',
      'ready:api',
      'start:web',
      'ready:web',
      'start:panel',
      'ready:panel',
      'wait',
    ],
  );
  assert.deepEqual(PORTS, { web: 4000, api: 4001, geo: 4002, panel: 4100 });
  assert.ok(!f.calls.some((line) => /job:(seed|migrate|load)/.test(line)));
});

function processFixture() {
  const f = { killed: [], launched: [], identities: new Map() };
  f.host = createHost({
    platform: 'win32',
    launch(command, args, options) {
      const child = Object.assign(new EventEmitter(), {
        pid: 8000 + f.launched.length,
        exitCode: null,
        signalCode: null,
      });
      f.launched.push({ command, args, options, child });
      f.identities.set(child.pid, {
        pid: child.pid,
        parent: process.pid,
        created: '2026-10-22T12:00:00.000Z',
        exe: process.execPath,
        command: args.join(' '),
      });
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
    async identity(pid) {
      const value = structuredClone(f.identities.get(pid));
      return f.identityOverride ? f.identityOverride(value, pid) : value;
    },
    async descendants() {
      return f.descendantList ?? [];
    },
    async killTree(pid) {
      f.killed.push(pid);
      if (f.killFails) throw Error('KILL_TIMEOUT');
      const { child } = f.launched.find((entry) => entry.child.pid === pid);
      f.identities.delete(pid);
      for (const p of f.descendantList ?? []) if (!f.survivor) f.identities.delete(p.pid);
      child.exitCode = 0;
      child.emit('close', 0, null);
    },
  });
  return f;
}

test('cierre idempotente mata solo hijos acreditados; spawn directo y consola propia oculta', async () => {
  const f = processFixture();
  const { done } = await f.host.start(['servidor'], { cwd: '.', env: {} });
  f.identities.set(1234, { pid: 1234, command: 'consola ajena' });
  await f.host.stop();
  await f.host.stop();
  assert.deepEqual(f.killed, [8000]);
  assert.equal((await done).code, 0);
  const { options } = f.launched[0];
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.detached, true);
  await assert.rejects(f.host.start(['servidor'], {}), /CIERRE_EN_CURSO/);
});

test('PID reutilizado o identidad cambiada nunca recibe taskkill', async () => {
  const f = processFixture();
  await f.host.start(['servidor'], {});
  f.identities.get(8000).created = randomUUID();
  await assert.rejects(f.host.stop(), /CIERRE_NO_CONFIRMADO_PID:8000/);
  assert.deepEqual(f.killed, []);
});

test('un job ya terminado no dispara el wait de servicios vivos', async () => {
  const f = processFixture();
  await f.host.start(['job'], {}, true);
  f.launched[0].child.exitCode = 0;
  f.launched[0].child.emit('close', 0, null);
  await f.host.start(['servicio'], {});
  const waiting = f.host.wait();
  await f.host.stop();
  assert.equal((await waiting).code, 0);
  assert.deepEqual(f.killed, [8001]);
});

test('cada etapa rechaza identidad incompleta o destino/rol/sesión alterados antes del job', async () => {
  for (const stage of ['created', 'migrated', 'loaded', 'seeded', 'privileges']) {
    for (const badIdentity of [
      undefined,
      { database: DATABASE },
      { database: 'curichi_revision', role: 'curichi', session: 'curichi' },
      { database: DATABASE, role: 'postgres', session: 'curichi' },
      { database: DATABASE, role: 'curichi', session: 'postgres' },
    ]) {
      const f = existing(stage, { breakIdentityAt: stage, badIdentity });
      await assert.rejects(
        prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
        /IDENTIDAD/,
      );
      assert.deepEqual(f.jobs, []);
      assert.deepEqual(f.audit, []);
    }
  }
  for (const key of ['oid', 'owner', 'marker']) {
    const f = existing('loaded');
    f.meta[key] = 'otra';
    await assert.rejects(
      withDatabase(urls, 'owner', f.state, f.deps, () => f.deps.job('seed')),
      /PROCEDENCIA/,
    );
    assert.deepEqual(f.jobs, []);
  }
});

test('interrupción o save fallido conserva etapa incierta y nunca repite seed exitoso', async () => {
  const f = existing('loaded', { failSaveAt: 'seeded' });
  await assert.rejects(
    prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
    /SAVE_FALLO/,
  );
  assert.equal(f.state.stage, 'seed:running');
  assert.equal(f.jobs.filter((job) => job.kind === 'seed').length, 1);
  await assert.rejects(
    prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
    /ESTADO_NO_REANUDABLE/,
  );
  assert.equal(f.jobs.length, 1);
  for (const stage of ['migrate', 'load', 'seed', 'privileges', 'activate']) {
    const stopped = existing(
      {
        migrate: 'created',
        load: 'migrated',
        seed: 'loaded',
        privileges: 'seeded',
        activate: 'privileges',
      }[stage],
    );
    stopped.deps.check = () => {
      if (stopped.state.stage === `${stage}:running`) throw Error('INTERRUMPIDO');
    };
    await assert.rejects(
      prepare(urls, stopped.deps, { autorizarContraccionCompatible: true }),
      /INTERRUMPIDO/,
    );
    assert.equal(stopped.state.stage, `${stage}:running`);
    assert.deepEqual(stopped.jobs, []);
    assert.deepEqual(stopped.audit, []);
  }
});

test('runJob entrega exactamente la URL acreditada al hijo y rechaza sustituciones antes de spawn', async () => {
  let launched = 0;
  const context = {
    source,
    inherited: { PGDATABASE: 'postgres', NODE_OPTIONS: '--inspect' },
    scratch: '.',
    urls,
    tokens,
    host: {
      async start(args, { env }, job) {
        launched++;
        assert.equal(env.DATABASE_URL, urls.owner);
        assert.equal(env.PGDATABASE, undefined);
        assert.equal(env.NODE_OPTIONS, undefined);
        assert.equal(job, true);
        assert.ok(args.length);
        return { done: Promise.resolve({ code: 0 }) };
      },
    },
  };
  for (const kind of ['migrate', 'load', 'seed', 'privileges'])
    await runJob(kind, urls.owner, context);
  assert.equal(launched, 4);
  for (const url of [
    urls.bootstrap,
    urls.api,
    urls.owner.replace('127.0.0.1', 'localhost'),
    urls.owner.replace(password, randomUUID()),
  ]) {
    await assert.rejects(runJob('seed', url, context));
  }
  await assert.rejects(runJob('web', urls.owner, context), /JOB_DESCONOCIDO/);
  assert.equal(launched, 4);
});

test('capas cotejan conteos, CRS, manifiesto y versión vigente antes de seed o activación', async () => {
  for (const stage of ['loaded', 'privileges']) {
    for (const changed of [
      { n_features: 2 },
      { crs_origen: 'EPSG:4326' },
      { sha256_manifiesto: 'b'.repeat(64) },
      { version: 'otra' },
    ]) {
      const f = existing(stage, {
        layers: layers.map((row, i) => (i ? row : { ...row, ...changed })),
      });
      await assert.rejects(
        prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
        /CAPAS_MUNICIPALES/,
      );
      assert.deepEqual(f.jobs, []);
      assert.deepEqual(f.audit, []);
    }
    const f = existing(stage, { layerCount: 2 });
    await assert.rejects(
      prepare(urls, f.deps, { autorizarContraccionCompatible: true }),
      /CONTEO_MUNICIPAL/,
    );
    assert.deepEqual(f.jobs, []);
    assert.deepEqual(f.audit, []);
  }
});

test('procesados requieren metadata municipal y hashes full/web correctos sin regenerar archivos', async () => {
  let change = {};
  let digest = 'b'.repeat(64);
  const io = {
    async readFile(file) {
      const capa = path.basename(path.dirname(file));
      return JSON.stringify({
        ...layers.find((row) => row.capa === capa),
        crs_salida: 'EPSG:4326',
        n_features_salida: 1,
        sha256_salida: { full: 'b'.repeat(64), web: 'b'.repeat(64) },
        ...change,
      });
    },
  };
  const result = await readProcessedLayers(io, async () => digest);
  assert.deepEqual(
    result.map((row) => row.capa),
    layers.map((row) => row.capa),
  );
  for (const invalid of [
    { capa: 'otra' },
    { version: 'otra' },
    { n_features_salida: 0 },
    { crs_salida: 'EPSG:32720' },
    { sha256_manifiesto: null },
  ]) {
    change = invalid;
    await assert.rejects(
      readProcessedLayers(io, async () => digest),
      /METADATA_MUNICIPAL/,
    );
  }
  change = {};
  digest = 'c'.repeat(64);
  await assert.rejects(
    readProcessedLayers(io, async () => digest),
    /HUELLA_PROCESADA/,
  );
  change = { sha256_salida: {} };
  await assert.rejects(
    readProcessedLayers(io, async () => digest),
    /HUELLA_PROCESADA/,
  );
});

test('Next usa start con salida propia; API/geo/migrador/ETL/seed usan JS existente', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const kind of ['web', 'panel']) {
    const spec = jobSpec(kind, () => '/next/dist/bin/next');
    assert.ok(spec.args.includes('start'));
    assert.ok(!spec.args.includes('dev'));
    const app = path.join(root, kind === 'web' ? 'apps/web-ciudadano' : 'apps/panel-admin');
    let changed = {};
    let real = path.join(app, '.next-multitematica');
    const io = {
      async realpath() {
        return real;
      },
      async readFile(file) {
        if (path.basename(file) === 'BUILD_ID') return 'build-local';
        return JSON.stringify({
          version: 1,
          config: { distDir: '.next-multitematica' },
          appDir: app,
          ...changed,
        });
      },
      async access() {},
      async stat() {
        return { mtimeMs: 1 };
      },
    };
    await verifyNextBuild(kind, io);
    for (const invalid of [{ config: { distDir: '.next' } }, { appDir: root }, { version: 2 }]) {
      changed = invalid;
      await assert.rejects(verifyNextBuild(kind, io), /BUILD_NEXT_NO_RECONOCIDO/);
    }
    real = path.join(app, '.next');
    await assert.rejects(verifyNextBuild(kind, io), /SALIDA_NEXT_NO_AISLADA/);
  }
  for (const kind of ['api', 'geo', 'migrate', 'load']) {
    assert.ok(jobSpec(kind).args[0].startsWith('dist/'));
    assert.ok(!jobSpec(kind).args.includes('tsx'));
  }
  assert.deepEqual(jobSpec('migrate').args.slice(1), ['--hasta', '0022']);
  const seed = jobSpec('seed').args.at(-1);
  assert.ok(seed.includes('sembrarSamples(ejecutorPg(pool))'));
  assert.ok(seed.includes('cerrarWorkersDePassword()'));
  assert.ok(seed.includes('/db/dist/index.js'));
});

test('el launcher del seed permite los workers CommonJS de contraseñas sin conectar una base', () => {
  const spec = jobSpec('seed');
  const entry = new URL('../packages/db/dist/index.js', import.meta.url).href;
  const probe = `import(${JSON.stringify(entry)}).then(async ({hashPassword,verificarPassword,cerrarWorkersDePassword})=>{try{const h=await hashPassword('prueba-sintetica-worker');if(!await verificarPassword('prueba-sintetica-worker',h))throw Error('HASH_INVALIDO');}finally{await cerrarWorkersDePassword();}}).catch(()=>{process.exitCode=1;});`;
  const result = spawnSync(process.execPath, [...spec.args.slice(0, -1), probe], {
    cwd: spec.cwd,
    env: { ...process.env, PASSWORD_SIN_WORKERS: '0' },
    windowsHide: true,
    timeout: 10000,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('identidad inicial incompleta nunca autoriza matar; timeout conserva cierre incierto', async () => {
  for (const invalid of [
    { pid: 9999 },
    { created: '' },
    { parent: 0 },
    { exe: '' },
    { command: '' },
  ]) {
    const f = processFixture();
    f.identityOverride = (value) => ({ ...value, ...invalid });
    await assert.rejects(f.host.start(['servicio'], {}), /HIJO_SIN_IDENTIDAD/);
    await assert.rejects(f.host.stop(), /CIERRE_NO_CONFIRMADO/);
    assert.deepEqual(f.killed, []);
  }
  const f = processFixture();
  await f.host.start(['servicio'], {});
  f.killFails = true;
  await assert.rejects(f.host.stop(), /CIERRE_NO_CONFIRMADO/);
});

test('padre caído, descendiente sobreviviente o identidad final incompleta conserva el lock', async () => {
  for (const mode of ['parent', 'survivor', 'incomplete']) {
    const f = processFixture();
    await f.host.start(['servicio'], {});
    if (mode === 'parent') {
      f.launched[0].child.exitCode = 1;
      f.launched[0].child.emit('close', 1, null);
      assert.equal((await f.host.wait()).code, 1);
    } else if (mode === 'survivor') {
      f.descendantList = [{ ...f.identities.get(8000), pid: 8001, parent: 8000 }];
      f.identities.set(8001, f.descendantList[0]);
      f.survivor = true;
    } else f.identityOverride = (value, pid) => (f.killed.length ? { pid } : value);
    let removed = 0;
    let closed = 0;
    await assert.rejects(
      closeRun(
        f.host,
        {
          async close() {
            closed++;
          },
        },
        async () => {
          removed++;
        },
        () => {},
      ),
      /CIERRE_NO_CONFIRMADO/,
    );
    assert.equal(removed, 0);
    assert.equal(closed, 1);
    if (mode === 'parent') assert.deepEqual(f.killed, []);
  }
});

test('señales repetidas siguen protegidas durante cleanup y lock sale solo al confirmarlo', async () => {
  const events = new EventEmitter();
  let finish;
  const stopping = new Promise((resolve) => {
    finish = resolve;
  });
  const host = { stop: () => stopping };
  const signals = protectSignals(host, () => {}, events);
  let removed = 0;
  let closed = 0;
  const cleanup = closeRun(
    host,
    {
      async close() {
        closed++;
      },
    },
    async () => {
      removed++;
    },
    () => {},
  );
  for (const name of ['SIGINT', 'SIGTERM', 'SIGINT']) events.emit(name);
  assert.equal(signals.cancelled, true);
  assert.throws(signals.check, /INTERRUMPIDO/);
  assert.equal(events.listenerCount('SIGINT'), 1);
  assert.equal(removed, 0);
  finish();
  await cleanup;
  signals.dispose();
  assert.equal(closed, 1);
  assert.equal(removed, 1);
  assert.equal(events.listenerCount('SIGINT'), 0);
  assert.equal(events.listenerCount('SIGTERM'), 0);
});

// F2P5: criterios escritos, todavía sin corrida roja ni implementación del actualizador.
test('M10 final: arranque21 con release JSON se rechaza antes de jobs y servicios', async () => {
  const f = existing('active', { catalog: categories(true) });
  f.deps.inspectSchema = async () => ({ version: 21, integro: true });
  await assert.rejects(startInstallation(urls, f.deps), /ESQUEMA|0022|22/);
  assert.ok(!f.calls.some((c) => /^(start:|job:)/.test(c)));
});
test('M10 final:22 parcial y versión futura no habilitan writer ni mantenimiento', async () => {
  for (const schema of [
    { version: 22, integro: false },
    { version: 23, integro: true },
  ]) {
    const f = existing('active', { catalog: categories(true) });
    f.deps.inspectSchema = async () => schema;
    await assert.rejects(startInstallation(urls, f.deps), /ESQUEMA|0022|22/);
    assert.ok(!f.calls.some((c) => /^(start:|job:)/.test(c)));
  }
});
test('M10 final: estado de actualización incierto no habilita arranque normal', async () => {
  const f = existing('active', { catalog: categories(true) });
  f.state.m10 = { stage: 'incierta', schema: 22, release: 21 };
  f.deps.inspectSchema = async () => ({ version: 22, integro: true });
  await assert.rejects(startInstallation(urls, f.deps), /ESTADO|INCIERT|RECONCIL|VERSION/);
  assert.ok(!f.calls.some((c) => /^(start:|job:)/.test(c)));
});
test('M10 final: job ordinario no opta por0022, autorización requiere opción explícita', () => {
  const bandera = '--autorizar-contraccion-compatible';
  assert.ok(!jobSpec('migrate').args.includes(bandera));
  const autorizado = jobSpec('migrate', undefined, { autorizarContraccionCompatible: true });
  assert.ok(autorizado.args.includes(bandera));
  assert.ok(autorizado.args.includes('0022'));
});
test('M10 final: actualizar sin consentimiento no conecta, migra, siembra ni cambia estado', async () => {
  assert.equal(typeof moduloLocal.updateInstallation, 'function');
  const f = existing('active', { catalog: categories(true) });
  const antes = structuredClone(f.state);
  await assert.rejects(() => moduloLocal.updateInstallation(urls, f.deps), /CONSENT|AUTORIZAR/);
  assert.deepEqual(f.state, antes);
  assert.deepEqual(f.calls, []);
});
test('M10 final: actualizar sin adaptadores de resguardo/pausa no opera por fallback', async () => {
  assert.equal(typeof moduloLocal.updateInstallation, 'function');
  const f = existing('active', { catalog: categories(true) });
  await assert.rejects(
    () =>
      moduloLocal.updateInstallation(urls, f.deps, {
        autorizarContraccionCompatible: true,
      }),
    /INYECT|ADAPTADOR|PROTOCOLO/,
  );
  assert.deepEqual(f.calls, []);
});
test('M10 final: recuperación21 requiere pruebas del grafo de dependencias antes de reversa', async () => {
  assert.equal(typeof moduloLocal.recoverInstallation, 'function');
  const f = existing('active', { catalog: categories(true) });
  const llamadas = [];
  f.deps.recovery = {
    verificarRelease: async () => ({ version: 21, dependenciasVerificadas: false }),
    ejecutar: async (paso) => {
      llamadas.push(paso);
    },
  };
  await assert.rejects(
    () => moduloLocal.recoverInstallation(urls, f.deps),
    /DEPENDENC|RELEASE|NO_VERIFICADO_REAL/,
  );
  assert.deepEqual(llamadas, []);
  assert.ok(!f.calls.some((c) => /seed|migrate|start:/.test(c)));
});
test('M10 final: recuperación rechaza mezcla release21 que resuelve DB22', async () => {
  assert.equal(typeof moduloLocal.recoverInstallation, 'function');
  const f = existing('active', { catalog: categories(true) });
  const llamadas = [];
  f.deps.recovery = {
    verificarRelease: async () => ({
      version: 21,
      dependenciasVerificadas: true,
      dbResueltoVersion: 22,
    }),
    ejecutar: async (paso) => {
      llamadas.push(paso);
    },
  };
  await assert.rejects(
    () => moduloLocal.recoverInstallation(urls, f.deps),
    /DEPENDENC|RELEASE|VERSION/,
  );
  assert.deepEqual(llamadas, []);
});

function recoveryFixture(fallaEn) {
  const f = existing('active', { catalog: categories(true) });
  f.state.m10 = {
    stage: 'actualizada',
    schema: 22,
    release: 22,
    datos22Sha256: 'b'.repeat(64),
    release21Sha256: 'a'.repeat(64),
  };
  const pasos = [];
  f.deps.recovery = {
    verificarRelease: async () => ({
      version: 21,
      dependenciasVerificadas: true,
      dbResueltoVersion: 21,
      sha256: 'a'.repeat(64),
    }),
    ejecutar: async (paso, evidencia) => {
      pasos.push(paso);
      assert.equal(evidencia.datos22Sha256, 'b'.repeat(64));
      if (paso === fallaEn) throw Error(`FALLO_${paso}`);
      return { verificado: true, sha256: 'c'.repeat(64) };
    },
  };
  return { f, pasos };
}
test('M10 final: recuperación mock conserva datos22 y coordina pausa, DB, código y estado', async () => {
  assert.equal(typeof moduloLocal.recoverInstallation, 'function');
  const { f, pasos } = recoveryFixture();
  await moduloLocal.recoverInstallation(urls, f.deps);
  assert.deepEqual(pasos, [
    'pausar22',
    'reversa21',
    'verificar21',
    'seleccionarRelease21',
    'reconciliarEstado21',
  ]);
  assert.equal(f.state.m10.schema, 21);
  assert.equal(f.state.m10.release, 21);
  assert.equal(f.state.m10.stage, 'recuperada');
  assert.equal(f.state.m10.datos22Sha256, 'b'.repeat(64));
  assert.ok(!f.calls.some((c) => /job:(seed|load)|start:/.test(c)));
});
for (const paso of [
  'pausar22',
  'reversa21',
  'verificar21',
  'seleccionarRelease21',
  'reconciliarEstado21',
]) {
  test(`M10 final: fallo en ${paso} conserva estado incierto y no arranca una mezcla`, async () => {
    assert.equal(typeof moduloLocal.recoverInstallation, 'function');
    const { f, pasos } = recoveryFixture(paso);
    await assert.rejects(() => moduloLocal.recoverInstallation(urls, f.deps), /FALLO_/);
    assert.equal(pasos.at(-1), paso);
    assert.equal(f.state.m10.stage, 'incierta');
    assert.equal(f.state.m10.datos22Sha256, 'b'.repeat(64));
    assert.ok(!f.calls.some((c) => /job:(seed|load)|start:/.test(c)));
  });
}
