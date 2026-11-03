import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Importar el arnés nunca importa pg ni abre conexiones. En rojo, falta la implementación.
const m = await import('./medir-cuatro-categorias.mjs').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const db = 'curichi_sdd_m9_20261025';
const url = (database = db) => `postgresql://curichi:solo-prueba@127.0.0.1:5432/${database}`;
const urls = () => ({ owner: url(), bootstrap: url('curichi_e2e') });
const state = () => ({
  version: 1,
  database: db,
  owner: 'curichi',
  run: '88d04552-60a9-4c6b-a914-8eb73ba64565',
  oid: '1234',
  seed: 'm9-2026-10-25-v1',
  completed: [],
  pending: null,
  fingerprint: 'a'.repeat(64),
});
function fake() {
  const events = [];
  const s = state();
  const deps = {
    events,
    load: async () => s,
    save: async (value) => events.push(['save', structuredClone(value)]),
    record: async (value) => events.push(['record', value]),
    resources: async () => ({ freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 }),
    client: (value) => {
      events.push(['client', value]);
      return {
        connect: async () => events.push(['connect']),
        end: async () => events.push(['end']),
        query: async (sql) => {
          events.push(['query', sql]);
          if (sql.includes('current_database()'))
            return { rows: [{ database: db, role: 'curichi', session: 'curichi' }] };
          if (sql.includes('pg_database'))
            return {
              rows: [
                {
                  oid: '1234',
                  owner: 'curichi',
                  marker: 'medir-cuatro-categorias/v1/88d04552-60a9-4c6b-a914-8eb73ba64565',
                },
              ],
            };
          return { rows: [] };
        },
      };
    },
  };
  return { deps, s, events };
}

test('CLI tiene preparar/medir/estado/ayuda y rechaza extras', () => {
  for (const action of ['preparar', 'medir', 'estado', '--ayuda'])
    assert.equal(m.parseAction([action]), action);
  for (const args of [[], ['borrar'], ['medir', '--database', 'curichi']])
    assert.throws(() => m.parseAction(args), /USO/);
});
test('original .env se deriva solo en memoria al destino fijo y bootstrap', () => {
  const source = { DATABASE_URL: url('curichi') };
  assert.deepEqual(m.deriveUrls(source), urls());
  assert.equal(source.DATABASE_URL, url('curichi'));
});
for (const forbidden of [
  'curichi',
  'curichi_revision',
  'postgres',
  'curichi_multitematica',
  'curichi_e2e',
]) {
  test(`destino prohibido ${forbidden}: cero Client y cero jobs`, async () => {
    const { deps, s, events } = fake();
    await assert.rejects(
      m.withDatabase({ ...urls(), owner: url(forbidden) }, s, deps, () => assert.fail()),
      /PERMITID/,
    );
    assert.equal(events.length, 0);
  });
}
for (const bad of [
  url().replace('127.0.0.1', 'ejemplo.org'),
  url().replace('5432', '5433'),
  `${url()}?options=-csearch_path=otro`,
  `${url()}?host=otro`,
  `${url()}#otro`,
  url().replace('/curichi_sdd', '/%63urichi_sdd'),
  url().replace('curichi:', 'postgres:'),
  '',
]) {
  test('URL insegura aborta antes de construir Client', async () => {
    const { deps, s, events } = fake();
    await assert.rejects(
      m.withDatabase({ ...urls(), bootstrap: bad }, s, deps, () => assert.fail()),
      /URL|PERMITID/,
    );
    assert.equal(events.length, 0);
  });
}
test('estado desconocido o pendiente nunca conecta ni reanuda una carga', async () => {
  for (const patch of [
    { database: 'curichi' },
    { oid: null },
    { completed: ['seed'] },
    { pending: 'load:0' },
    { fingerprint: '' },
  ]) {
    const { deps, s, events } = fake();
    Object.assign(s, patch);
    await assert.rejects(
      m.withDatabase(urls(), s, deps, () => assert.fail()),
      /ESTADO|INCIERT/,
    );
    assert.equal(events.length, 0);
  }
});
test('identidad owner/OID/comentario se comprueba antes y después del job', async () => {
  const { deps, s, events } = fake();
  await m.withDatabase(urls(), s, deps, (client) =>
    m.durableJob(client, s, deps, 'migrate', async () => events.push(['job'])),
  );
  assert.equal(events.filter(([k]) => k === 'job').length, 1);
  const job = events.findIndex(([k]) => k === 'job');
  assert.ok(events.slice(0, job).some(([k, sql]) => k === 'query' && sql.includes('pg_database')));
  assert.ok(events.slice(job + 1).some(([k, sql]) => k === 'query' && sql.includes('pg_database')));
  assert.deepEqual(s.completed, ['migrate']);
});
test('identidad alterada no ejecuta jobs y conserva el banco', async () => {
  for (const change of [{ oid: '2' }, { owner: 'postgres' }, { marker: 'desconocido' }]) {
    const { deps, s, events } = fake();
    const original = deps.client;
    deps.client = (value) => {
      const client = original(value);
      const query = client.query;
      client.query = async (sql) => {
        const result = await query(sql);
        if (sql.includes('pg_database')) Object.assign(result.rows[0], change);
        return result;
      };
      return client;
    };
    await assert.rejects(
      m.withDatabase(urls(), s, deps, () => assert.fail()),
      /PROCEDENCIA/,
    );
    assert.equal(events.at(-1)[0], 'end');
    assert.ok(!events.some(([k, sql]) => k === 'query' && /CREATE|DROP|ALTER/.test(sql)));
  }
});
test('job fallido o save incierto no se repite al reintentar', async () => {
  const { deps, s } = fake();
  let calls = 0;
  await assert.rejects(
    m.withDatabase(urls(), s, deps, (client) =>
      m.durableJob(client, s, deps, 'migrate', async () => {
        calls++;
        throw Error('fallo');
      }),
    ),
    /fallo/,
  );
  assert.equal(s.pending, 'migrate');
  await assert.rejects(
    m.withDatabase(urls(), s, deps, () => {
      calls++;
    }),
    /INCIERT/,
  );
  assert.equal(calls, 1);
});
test('etapas ya confirmadas no repiten jobs', async () => {
  const { deps, s } = fake();
  s.completed = ['migrate'];
  await m.withDatabase(urls(), s, deps, (client) =>
    m.durableJob(client, s, deps, 'migrate', () => assert.fail()),
  );
});
test('RAM y ambos discos fallan cerrado antes del pesado', () => {
  for (const resources of [
    { freeMiB: 1499, diskFreeGiB: 20, databaseFreeGiB: 20 },
    { freeMiB: 3000, diskFreeGiB: 1, databaseFreeGiB: 20 },
    { freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 1 },
    {},
  ])
    assert.throws(() => m.assertResources(resources), /RECURSOS/);
});
test('estadística conserva muestras, mediana y máximo; jamás llama p95 al máximo de nueve', () => {
  assert.deepEqual(m.statistics([9, 1, 8, 2, 7, 3, 6, 4, 5]), {
    samples: [9, 1, 8, 2, 7, 3, 6, 4, 5],
    median: 5,
    max: 9,
    n: 9,
  });
  assert.equal(m.statistics([4, 2]).median, 3);
  assert.throws(() => m.statistics([]));
  assert.throws(() => m.statistics([NaN]));
});
test('ejes reproducibles independientes y categorías balanceadas sin generar un millón', () => {
  const groups = new Map();
  for (let i = 0; i < 12000; i++) {
    const a = m.sampleAxes(i);
    assert.deepEqual(a, m.sampleAxes(i));
    const g = groups.get(a.category) ?? {
      n: 0,
      states: new Set(),
      spaces: new Set(),
      months: new Set(),
      privacy: new Set(),
    };
    g.n++;
    g.states.add(a.state);
    g.spaces.add(a.space);
    g.months.add(Math.floor(a.minute / 43200));
    g.privacy.add(a.private);
    groups.set(a.category, g);
  }
  assert.equal(groups.size, 4);
  for (const g of groups.values()) {
    assert.equal(g.n, 3000);
    assert.equal(g.states.size, 5);
    assert.ok(g.spaces.size > 500);
    assert.ok(g.months.size >= 12);
    assert.equal(g.privacy.size, 2);
  }
  assert.notDeepEqual(m.sampleAxes(1), m.sampleAxes(1, 'otra-semilla'));
});
test('fixtures pasan los cuatro contratos reales; severidad/versiones salen de cada definición', async () => {
  const c = await import('../packages/contracts/dist/index.js');
  const fixtures = m.makeFixtures(c);
  assert.deepEqual([...new Set(fixtures.map((f) => f.category))].sort(), [
    'area_verde',
    'bache',
    'basura',
    'inundacion',
  ]);
  for (const f of fixtures) {
    const def = c.REGISTRO_CATEGORIAS.obtener(f.category);
    assert.deepEqual(def.esquemaDetalle.parse(f.detail), f.detail);
    assert.deepEqual(f.severity, def.severidad.calcular(f.detail, f.subtype ?? undefined));
    assert.equal(f.severityVersion, def.severidad.version);
    assert.equal(f.detailVersion, def.detalleVersion);
    if (def.subtipos) assert.ok(def.subtipos.some((s) => s.valor === f.subtype));
  }
});
test('carga fija es 1M total, sin seedfull, índices nuevos ni roles alterados', async () => {
  assert.equal(m.TOTAL, 1_000_000);
  assert.equal(m.BATCH, 10_000);
  const source = await readFile(new URL('./medir-cuatro-categorias.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /DROP DATABASE|ALTER ROLE|CREATE INDEX|sembrarSamples\(/i);
  assert.match(source, /manzana.*NO_MEDIDO|manzanas.*omit/i);
});
test('importar y ayuda no leen .env ni conectan bases ni arrancan servicios', () => {
  const script = new URL('./medir-cuatro-categorias.mjs', import.meta.url);
  const imported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(script.href)});process.stdout.write('importado');`,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, 'importado');
  const help = spawnSync(
    process.execPath,
    [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--ayuda'],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /preparar.*medir.*estado/);
});

test('banco existente sin diario nunca se adopta ni se borra', async () => {
  const { deps, events } = fake();
  deps.load = async () => null;
  const original = deps.client;
  deps.client = (value) => {
    const client = original(value);
    const query = client.query;
    client.query = async (sql) => {
      const result = await query(sql);
      if (sql.includes('current_database()')) result.rows[0].database = 'curichi_e2e';
      return result;
    };
    return client;
  };
  await assert.rejects(m.createBank(urls(), deps, 'a'.repeat(64)), /EXISTENTE_SIN_PROCEDENCIA/);
  assert.ok(!events.some(([k, sql]) => k === 'query' && /CREATE|DROP|ALTER/.test(sql)));
});
test('si identidad cambia durante job, no confirma la etapa', async () => {
  const { deps, s, events } = fake();
  await assert.rejects(
    m.withDatabase(urls(), s, deps, (client) =>
      m.durableJob(client, s, deps, 'migrate', () => {
        s.oid = '9';
      }),
    ),
    /PROCEDENCIA/,
  );
  assert.equal(s.pending, 'migrate');
  assert.ok(!events.some(([key, event]) => key === 'record' && event.event === 'despues_job'));
});
test('testigos 2/3/4/5 están DENTRO del millón y distinguen categorías y radios', () => {
  const result = Object.fromEntries(m.CATEGORIES.map((category) => [category, []]));
  for (let i = 0; i < 24; i++) {
    const witness = m.witnessFor(i);
    if (witness) result[m.sampleAxes(i).category].push(witness.offsetM);
  }
  assert.deepEqual(
    Object.values(result).map((items) => items.length),
    [2, 3, 4, 5],
  );
  for (const offsets of Object.values(result))
    assert.deepEqual(
      [...new Set(offsets)].sort((a, b) => a - b),
      [0, 20],
    );
});
test('SQL capturado conserva SELECT completo, topes 10001/50/50000, Todas y radios sin demora', async () => {
  const modules = await m.loadModules();
  const context = {
    point: { lon: -63.18, lat: -17.78, uv: 'unidad_vecinal:1', district: 'distrito_municipal:1' },
    bbox: [-63.3, -18, -63, -17.6],
  };
  const cases = await m.buildCases(modules, context);
  for (const category of m.CATEGORIES) {
    const publicCase = cases.find((c) => c.id === `publico:${category}:barrio`);
    assert.equal(publicCase.statements[0].params.at(-1), 10001);
    assert.equal(publicCase.statements[1].params.at(-2), 50);
    assert.match(publicCase.statements[1].sql, /LEFT JOIN/);
    assert.match(publicCase.statements[1].sql, /geom_publico/);
    const cluster = cases.find((c) => c.id === `dbscan:${category}`);
    assert.deepEqual(cluster.statements[0].params, [
      category === 'inundacion' ? 25 : 10,
      32720,
      category,
    ]);
    assert.doesNotMatch(cluster.statements[0].sql, /publicar_en/);
    const aggregate = cases.find((c) => c.id === `uv:${category}`);
    assert.doesNotMatch(aggregate.statements[0].sql, /geom_publico IS NOT NULL/);
  }
  assert.ok(!cases.some((c) => /^(publico|uv):todas/.test(c.id)));
  const exp = cases.find((c) => c.id === 'exportar:todas');
  assert.equal(exp.statements.at(-1).params.at(-2), 50000);
  const indicators = cases.find((c) => c.id === 'indicadores:todas');
  assert.ok(indicators.statements.some((s) => /LIMIT 50/.test(s.sql)));
  const executive = cases.find((c) => c.id === 'ejecutivo:todas:todo');
  assert.deepEqual(executive.statements[0].params, [null, null]);
});

const evidence = path.resolve('.turbo/m9-2026-10-25/fix-top50-27/pruebas');
async function directory() {
  await mkdir(evidence, { recursive: true });
  return mkdtemp(path.join(evidence, 'caso-'));
}
test('etapas SQL desconocidas y lotes fuera del millón fallan antes de Client', async () => {
  for (const job of ['query:inventada', 'query:publico:todas:chico', 'load:100', 'load:00']) {
    const { deps, s, events } = fake();
    s.completed = [job];
    await assert.rejects(
      m.withDatabase(urls(), s, deps, () => assert.fail()),
      /ESTADO/,
    );
    assert.equal(events.length, 0);
  }
});
test('URLs de servidores distintos no pasan por origin nulo de PostgreSQL', async () => {
  for (const [bootstrap, expected] of [
    [url('curichi_e2e').replace('127.0.0.1', '[::1]'), /URL_NO_PERMITIDA/],
    [url('curichi_e2e').replace('solo-prueba', 'otra-clave'), /SERVIDORES_NO_PERMITIDOS/],
  ]) {
    const { deps, s, events } = fake();
    const pair = { ...urls(), bootstrap };
    await assert.rejects(
      m.withDatabase(pair, s, deps, () => assert.fail()),
      expected,
    );
    await assert.rejects(m.createBank(pair, deps, 'a'.repeat(64)), expected);
    assert.equal(events.length, 0);
  }
});
test('confirmación de diario fallida conserva pending en memoria y no repite', async () => {
  const { deps, s } = fake();
  let calls = 0;
  deps.save = async (next) => {
    if (next.completed.length) throw Error('disco');
  };
  await assert.rejects(
    m.withDatabase(urls(), s, deps, (client) =>
      m.durableJob(client, s, deps, 'migrate', () => {
        calls++;
      }),
    ),
    /disco/,
  );
  assert.equal(s.pending, 'migrate');
  await assert.rejects(
    m.withDatabase(urls(), s, deps, () => {
      calls++;
    }),
    /INCIERT/,
  );
  assert.equal(calls, 1);
});
test('entorno de sondas usa allowlist y nunca hereda credenciales ni hooks', () => {
  const env = m.probeEnvironment({
    PATH: 'bin',
    SystemRoot: 'C:\\Windows',
    PGHOST: 'otro',
    PGPASSWORD: 'secreto',
    NODE_OPTIONS: '--import=otro',
    DOCKER_HOST: 'tcp://otro',
    DATABASE_URL: url(),
    BASH_ENV: 'otro',
  });
  assert.deepEqual(env, { PATH: 'bin', SystemRoot: 'C:\\Windows' });
});
test('adaptador valida antes de construir Client y fija todas sus opciones sin PG*', async () => {
  const scratch = await directory();
  const constructed = [];
  class Client {
    constructor(options) {
      constructed.push(options);
    }
  }
  assert.throws(
    () => m.createDependencies({ ...urls(), owner: url('curichi') }, { scratch, Client }),
    /PERMITID/,
  );
  assert.equal(constructed.length, 0);
  const deps = m.createDependencies(urls(), { scratch, Client });
  assert.throws(() => deps.client(url('curichi')), /PERMITID/);
  deps.client(url());
  const options = constructed[0];
  assert.equal(options.database, db);
  assert.equal(options.host, '127.0.0.1');
  assert.equal(options.user, 'curichi');
  assert.equal(options.password, 'solo-prueba');
  assert.equal(options.ssl, false);
  assert.equal(options.options, '-c search_path=public,geo');
  assert.ok(options.statement_timeout > 30000);
});
test('adaptador conserva evidencia, redacta secretos y rechaza escape de carpeta', async () => {
  const scratch = await directory();
  const deps = m.createDependencies(urls(), { scratch, Client: class {} });
  await deps.record({ event: 'prueba', value: `${url()} solo-prueba` });
  await deps.artifact('seguro.json', { value: url() });
  assert.doesNotMatch(
    await readFile(path.join(scratch, 'eventos.jsonl'), 'utf8'),
    /solo-prueba|postgresql:\/\//,
  );
  assert.doesNotMatch(
    await readFile(path.join(scratch, 'seguro.json'), 'utf8'),
    /solo-prueba|postgresql:\/\//,
  );
  await assert.rejects(deps.artifact('seguro.json', { overwritten: true }), /EEXIST/);
  await assert.rejects(deps.artifact('../fuera.json', {}), /ARTEFACTO/);
});
test('diario corrupto y temporal previo fallan cerrado sin adoptar ni limpiar', async () => {
  const scratch = await directory();
  const deps = m.createDependencies(urls(), { scratch, Client: class {} });
  assert.equal(await deps.load(), null);
  await writeFile(path.join(scratch, 'diario.json'), '{');
  await assert.rejects(deps.load());
  await writeFile(path.join(scratch, 'diario.json.tmp'), 'incierto');
  await assert.rejects(deps.save(state()), /EEXIST/);
  assert.equal(await readFile(path.join(scratch, 'diario.json.tmp'), 'utf8'), 'incierto');
});
test('lock exclusivo no roba uno previo y libera solo el propio', async () => {
  const scratch = await directory();
  await m.withRunLock(scratch, async () => {
    await assert.rejects(
      m.withRunLock(scratch, () => assert.fail()),
      /EEXIST/,
    );
  });
  await m.withRunLock(scratch, async () => {});
  await writeFile(path.join(scratch, 'runner.lock'), 'otro');
  await assert.rejects(
    m.withRunLock(scratch, () => assert.fail()),
    /EEXIST/,
  );
  assert.equal(await readFile(path.join(scratch, 'runner.lock'), 'utf8'), 'otro');
});
test('estado no ejecuta jobs ni valida un diario pendiente como reanudable', async () => {
  const { deps, s, events } = fake();
  s.pending = 'migrate';
  const status = await m.inspectState(urls(), deps);
  assert.equal(status.pending, 'migrate');
  assert.equal(status.resumable, false);
  assert.ok(!events.some(([key]) => key === 'save'));
  assert.ok(
    !events.some(([key, sql]) => key === 'query' && /CREATE|ALTER|UPDATE|INSERT|DELETE/.test(sql)),
  );
});
test('sonda de disco no ejecuta df en un contenedor sin procedencia', async () => {
  let calls = 0;
  const execute = async (_file, _args, options) => {
    calls++;
    assert.equal(options.env.PGPASSWORD, undefined);
    return { stdout: '"otro"|"/curichi-postgis"|true|"postgis/postgis:18-3.6"|{}|[]' };
  };
  await assert.rejects(m.readResources({ PGPASSWORD: 'secreto' }, execute), /DISCO_POSTGRES/);
  assert.equal(calls, 1);
});
test('sonda de disco fija host local, usa ID acreditado y no imprime inspect completo', async () => {
  const calls = [];
  const id = 'a'.repeat(64);
  const execute = async (_file, args, options) => {
    calls.push(args);
    assert.deepEqual(options.env, {});
    assert.equal(options.windowsHide, true);
    if (args.includes('inspect'))
      return {
        stdout: [
          id,
          '/curichi-postgis',
          true,
          'postgis/postgis:18-3.6',
          { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5432' }] },
          [{ Type: 'volume', Destination: '/var/lib/postgresql' }],
        ]
          .map(JSON.stringify)
          .join('|'),
      };
    assert.deepEqual(args.slice(2), ['exec', id, 'df', '-Pk', '/var/lib/postgresql']);
    return {
      stdout:
        'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda 30000000 10000000 20000000 34% /var/lib/postgresql\n',
    };
  };
  const resources = await m.readResources(
    { DOCKER_HOST: 'tcp://otro', NODE_OPTIONS: '--import=otro' },
    execute,
  );
  assert.equal(calls.length, 2);
  assert.match(calls[0][1], /^(npipe:|unix:)/);
  assert.equal(resources.databaseFreeGiB, 20000000 / 1024 ** 2);
});
test('reemplazo del lock no borra el de otro actor', async () => {
  const scratch = await directory();
  await assert.rejects(
    m.withRunLock(scratch, () => writeFile(path.join(scratch, 'runner.lock'), 'otro')),
    /LOCK_PROPIO/,
  );
  assert.equal(await readFile(path.join(scratch, 'runner.lock'), 'utf8'), 'otro');
});
test('ayuda e importación con I/O y pg saboteados siguen sin efectos', () => {
  const script = new URL('./medir-cuatro-categorias.mjs', import.meta.url).href;
  const code = `import assert from 'node:assert/strict';import {createRequire,syncBuiltinESMExports} from 'node:module';
    const require=createRequire(import.meta.url);const f=require('node:fs/promises');
    const counts={io:0,pg:0,child:0,network:0};const stop=(key)=>{counts[key]++;throw Error('SENTINELA_'+key);};
    for(const key of ['readFile','open','mkdir'])f[key]=()=>stop('io');
    const fs=require('node:fs');const readSync=fs.readFileSync;
    fs.readFileSync=(file,...args)=>String(file).endsWith('.env')?stop('io'):readSync(file,...args);
    fs.createReadStream=()=>stop('io');
    const cp=require('node:child_process');for(const key of ['spawn','execFile','exec','fork','spawnSync','execFileSync','execSync'])cp[key]=()=>stop('child');
    const net=require('node:net');net.connect=net.createConnection=net.Socket.prototype.connect=()=>stop('network');
    require('node:tls').connect=()=>stop('network');
    for(const name of ['node:http','node:https']){const h=require(name);h.request=h.get=()=>stop('network');}
    globalThis.fetch=()=>stop('network');
    syncBuiltinESMExports();const M=require('node:module');const load=M._load;
    M._load=function(name,...args){if(name==='pg')return stop('pg');return load.call(this,name,...args);};
    M.registerHooks({resolve(specifier,context,next){if(specifier==='pg')return stop('pg');return next(specifier,context);}});
    assert.throws(()=>f.readFile('.env'),/SENTINELA_io/);
    assert.throws(()=>fs.readFileSync('.env'),/SENTINELA_io/);
    assert.throws(()=>require('pg'),/SENTINELA_pg/);
    await assert.rejects(import('pg'),/SENTINELA_pg/);
    assert.throws(()=>cp.spawn('node'),/SENTINELA_child/);
    assert.throws(()=>new net.Socket().connect(5432),/SENTINELA_network/);
    assert.deepEqual(counts,{io:2,pg:2,child:1,network:1});for(const key in counts)counts[key]=0;
    assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
    const m=await import(${JSON.stringify(script)});await m.runCli(['--ayuda']);
    assert.deepEqual(counts,{io:0,pg:0,child:0,network:0});process.stdout.write('SENTINELAS=0,0,0,0');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    timeout: 5000,
    env: m.probeEnvironment({
      ...process.env,
      NODE_OPTIONS: '--import=no-debe-cargarse',
      NODE_PATH: 'no-debe-cargarse',
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preparar.*medir.*estado/);
  assert.match(result.stdout, /SENTINELAS=0,0,0/);
});
test('CLI rechaza una acción inválida antes de I/O', async () => {
  await assert.rejects(m.runCli(['borrar']), /USO/);
});

const oracleModules = {
  contracts: { ESTADOS_PUBLICOS: ['nuevo', 'validado', 'resuelto'] },
  queries: { TOPE_CONTEO: 10000 },
  resolver: await import('../services/geo-service/dist/resolver.js'),
};
function oracleClient(overrides = {}) {
  return {
    query: async (sql, params) => {
      for (const [tag, rows] of Object.entries(overrides))
        if (sql.includes(tag))
          return { rows: typeof rows === 'function' ? rows(sql, params) : rows };
      if (sql.includes('AS t,'))
        return { rows: [{ t: 2, p: 2, s: 2, l: 2, d: 1, v: 1, activas: 2 }] };
      throw Error(`CONTROL_NO_SIMULADO: ${sql.slice(0, 80)}`);
    },
  };
}
const pageRows = [
  {
    id: 'b',
    categoria: 'bache',
    estado: 'validado',
    creado_en: new Date('2026-10-02'),
    detalle: { tamano: 'rueda' },
    subtipo: 'bache',
  },
  {
    id: 'a',
    categoria: 'bache',
    estado: 'nuevo',
    creado_en: new Date('2026-10-01'),
    detalle: { tamano: 'rueda' },
    subtipo: 'bache',
  },
];
test('P4-2: página repetida, invertida o con detalle cambiado no pasa por conservar el conteo', async () => {
  const client = oracleClient({ 'm9:pagina': pageRows });
  const info = {
    kind: 'listado',
    category: 'bache',
    soloPublicos: true,
    filtros: { limite: 50, pagina: 1 },
    statements: [],
  };
  for (const rows of [
    [pageRows[0], pageRows[0]],
    [...pageRows].reverse(),
    [{ ...pageRows[0], detalle: {} }, pageRows[1]],
  ])
    await assert.rejects(
      m.assertResults(client, info, [[{ n: '2' }], rows], oracleModules),
      /ORACULO_PAGINA/,
    );
});
const matrix = [
  {
    categoria: 'bache',
    estado: 'nuevo',
    severidad: 'baja',
    distrito_id: 'd',
    unidad_vecinal_id: 'u1',
    n: 1,
    ultimo: new Date('2026-10-01'),
  },
  {
    categoria: 'bache',
    estado: 'validado',
    severidad: 'alta',
    distrito_id: 'd',
    unidad_vecinal_id: 'u2',
    n: 1,
    ultimo: new Date('2026-10-02'),
  },
];
test('P4-1: ejecutivo detecta permuta de estados y bandas con totales iguales', async () => {
  const client = oracleClient({ 'm9:matriz': matrix, 'm9:distritos': [{ distrito_id: 'd' }] });
  const info = { kind: 'ejecutivo', category: 'bache', statements: [{ params: [null, 'bache'] }] };
  const good = {
    distrito_id: 'd',
    nuevo: 1,
    validado: 1,
    resuelto: 0,
    baja: 1,
    media: 0,
    alta: 1,
    critica: 0,
    ultimo: new Date('2026-10-02'),
  };
  for (const row of [
    { ...good, nuevo: 2, validado: 0 },
    { ...good, baja: 0, critica: 1 },
  ])
    await assert.rejects(
      m.assertResults(client, info, [[row]], oracleModules),
      /ORACULO_EJECUTIVO/,
    );
});
test('P4-1: agregados detectan permuta entre UV y máximo verificado falso', async () => {
  const client = oracleClient({
    'm9:matriz': matrix,
    'm9:uvs': [
      { unidad_vecinal_id: 'u1', distrito_id: 'd' },
      { unidad_vecinal_id: 'u2', distrito_id: 'd' },
    ],
    'm9:criticos-uv': [],
  });
  const rows = [
    {
      categoria: 'bache',
      unidad_vecinal_id: 'u1',
      distrito_id: 'd',
      n_reportes: 1,
      n_verificados: 0,
      n_puntos_criticos: 0,
      severidad_max: 'baja',
      severidad_max_verificada: null,
    },
    {
      categoria: 'bache',
      unidad_vecinal_id: 'u2',
      distrito_id: 'd',
      n_reportes: 1,
      n_verificados: 1,
      n_puntos_criticos: 0,
      severidad_max: 'alta',
      severidad_max_verificada: 'alta',
    },
  ];
  await assert.rejects(
    m.assertResults(
      client,
      { kind: 'uv', category: 'bache' },
      [
        [
          { ...rows[0], n_verificados: 1 },
          { ...rows[1], n_verificados: 0 },
        ],
      ],
      oracleModules,
    ),
    /ORACULO_AGREGADOS/,
  );
  await assert.rejects(
    m.assertResults(
      client,
      { kind: 'uv', category: 'bache' },
      [[{ ...rows[0], severidad_max_verificada: 'critica' }, rows[1]]],
      oracleModules,
    ),
    /ORACULO_AGREGADOS/,
  );
});
async function pipInfo(rows, outside = false, point = { lon: 0, lat: 0, uv: 'u2', district: 'd' }) {
  const statements = [];
  await oracleModules.resolver.resolverPunto(
    {
      query: async (sql, params) => {
        statements.push({ sql, params });
        return { rows: rows[statements.length - 1] };
      },
    },
    point.lat,
    point.lon,
  );
  return { kind: 'pip', outside, point, statements };
}
test('P4-5: PIP rechaza otra UV anterior al ID esperado y distrito equivocado', async () => {
  const results = [
    [
      { id: 'u1', distrito_id: 'd', version_capa: 'DM_UV_MZ_2025' },
      { id: 'u2', distrito_id: 'd', version_capa: 'DM_UV_MZ_2025' },
    ],
    [{ id: 'd' }],
    [{ id: 'd' }],
  ];
  const info = await pipInfo(results);
  await assert.rejects(
    m.assertResults(oracleClient(), info, results, oracleModules),
    /ORACULO_PIP/,
  );
});
function equivalenceFixture(mutate = () => {}) {
  const id = (i) => {
    const h = createHash('sha256').update(`${m.SEED}:id:${i}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  let membership = m.CATEGORIES.map((categoria, i) => {
    const members = (i === 0 ? [0, 4] : Array.from({ length: i + 1 }, (_, j) => (j + 1) * 4 + i))
      .map(id)
      .sort();
    return {
      group_id: `g${i}`,
      categoria,
      radio: i ? 10 : 25,
      n_reportes: members.length,
      n: members.length,
      coherente: true,
      miembros: members.join(','),
    };
  });
  let time = 0;
  const saved = [];
  const client = {
    query: async (sql, params) => {
      time += 1000;
      if (sql.includes('m9:pertenencia')) return { rows: structuredClone(membership) };
      if (sql.includes('m9:huerfanos')) return { rows: [{ n: 0 }] };
      if (sql.includes('m9:verificados'))
        return { rows: membership.map((r) => ({ categoria: r.categoria, n: r.n })) };
      if (sql.includes('m9:candidato')) {
        const g = membership.find((r) => r.categoria === params[1]);
        return { rows: [{ id: params[0], group_id: g.group_id, n_reportes: g.n_reportes }] };
      }
      throw Error(`CONTROL_NO_SIMULADO: ${sql}`);
    },
  };
  const modules = {
    contracts: {
      REGISTRO_CATEGORIAS: {
        obtener: (c) => ({ recurrenciaRadioM: c === 'inundacion' ? 25 : 10 }),
      },
    },
    db: {
      recalcularPuntosCriticos: async () => {
        time += 10;
        return { motor: 'postgis' };
      },
      recalcularEntornoDeReporte: async (_ex, reportId) => {
        time += 7;
        const g = membership.find((r) => r.miembros.split(',').includes(reportId));
        const result = { afectados: g.n, puntos: 1, disueltos: 1, completo: false };
        g.group_id = `nuevo-${g.group_id}`;
        mutate(membership, g, result);
        membership = structuredClone(membership);
        return result;
      },
    },
  };
  const deps = {
    now: () => time,
    resources: async () => ({ freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 }),
    artifact: async (name, value) => saved.push([name, value]),
  };
  return { client, modules, deps, saved, membership: () => structuredClone(membership) };
}
test('P4-3: equivalencia exige recálculo real de componente múltiple', async () => {
  const { client, modules, deps } = equivalenceFixture((_rows, _group, result) =>
    Object.assign(result, { afectados: 0, puntos: 0, disueltos: 0 }),
  );
  await assert.rejects(m.equivalence(client, modules, deps), /RECALCULO_ACOTADO_NO_REALIZADO/);
});

test('P4-2: controles positivos de listado y exportación, IDs/detalle/subtipo y tope independiente', async () => {
  for (const kind of ['listado', 'exportar']) {
    const info = {
      kind,
      category: 'bache',
      soloPublicos: false,
      filtros: { pagina: 1, limite: 50 },
    };
    const client = oracleClient({ 'm9:pagina': pageRows });
    await m.assertResults(client, info, [[{ n: '2' }], pageRows], oracleModules);
    for (const [name, rows] of Object.entries({
      repetidos: [pageRows[0], pageRows[0]],
      orden: [...pageRows].reverse(),
      detalle: [{ ...pageRows[0], detalle: {} }, pageRows[1]],
      subtipo: [{ ...pageRows[0], subtipo: 'otro' }, pageRows[1]],
      sustituidos: [{ ...pageRows[0], id: 'c' }, pageRows[1]],
    })) {
      await assert.rejects(
        m.assertResults(client, info, [[{ n: '2' }], rows], oracleModules),
        /ORACULO_PAGINA/,
        `${kind}/${name}`,
      );
    }
  }
  const client = oracleClient({
    'AS t,': [{ t: 10002, p: 10002, s: 10002, l: 10002, d: 1, v: 1, activas: 10002 }],
    'm9:pagina': pageRows,
  });
  const control = await m.assertResults(
    client,
    { kind: 'listado', category: 'bache', filtros: { pagina: 1, limite: 2 } },
    [[{ n: '10001' }], pageRows],
    oracleModules,
  );
  assert.equal(control.totalExact, false);
});

test('P4-1: ejecutivo y UV correctos pasan; permutas, recurrencia y máximos falsos fallan', async () => {
  const executive = {
    kind: 'ejecutivo',
    category: 'bache',
    statements: [{ params: [null, 'bache'] }],
  };
  const row = {
    distrito_id: 'd',
    nuevo: 1,
    validado: 1,
    resuelto: 0,
    baja: 1,
    media: 0,
    alta: 1,
    critica: 0,
    ultimo: new Date('2026-10-02'),
  };
  const client = oracleClient({ 'm9:matriz': matrix, 'm9:distritos': [{ distrito_id: 'd' }] });
  await m.assertResults(client, executive, [[row]], oracleModules);
  for (const patch of [
    { nuevo: 2, validado: 0 },
    { baja: 0, critica: 1 },
    { ultimo: new Date('2026-10-01') },
    { distrito_id: 'otro' },
  ])
    await assert.rejects(
      m.assertResults(client, executive, [[{ ...row, ...patch }]], oracleModules),
      /ORACULO_EJECUTIVO/,
    );
  const uvClient = oracleClient({
    'm9:matriz': matrix,
    'm9:uvs': [
      { unidad_vecinal_id: 'u1', distrito_id: 'd' },
      { unidad_vecinal_id: 'u2', distrito_id: 'd' },
    ],
    'm9:criticos-uv': [{ categoria: 'bache', unidad_vecinal_id: 'u2', n: 1 }],
  });
  const uvs = [
    {
      categoria: 'bache',
      unidad_vecinal_id: 'u1',
      distrito_id: 'd',
      n_reportes: 1,
      n_verificados: 0,
      n_puntos_criticos: 0,
      severidad_max: 'baja',
      severidad_max_verificada: null,
    },
    {
      categoria: 'bache',
      unidad_vecinal_id: 'u2',
      distrito_id: 'd',
      n_reportes: 1,
      n_verificados: 1,
      n_puntos_criticos: 1,
      severidad_max: 'alta',
      severidad_max_verificada: 'alta',
    },
  ];
  await m.assertResults(uvClient, { kind: 'uv', category: 'bache' }, [uvs], oracleModules);
  for (const patch of [
    { n_puntos_criticos: 0 },
    { severidad_max: 'media' },
    { severidad_max_verificada: 'critica' },
    { distrito_id: 'otro' },
  ])
    await assert.rejects(
      m.assertResults(
        uvClient,
        { kind: 'uv', category: 'bache' },
        [[uvs[0], { ...uvs[1], ...patch }]],
        oracleModules,
      ),
      /ORACULO_AGREGADOS/,
    );
});

test('P4-1: indicadores compara mapas completos de estado/banda/distrito y recurrencia', async () => {
  const info = {
    kind: 'indicadores',
    category: 'bache',
    statements: [
      { sql: 'GROUP BY 1, 2' },
      { sql: 'n_reportes >= 2' },
      { sql: 'GROUP BY distrito_id' },
      { sql: 'LIMIT 50' },
    ],
  };
  const client = oracleClient({
    'm9:matriz': matrix,
    'm9:recurrentes': [{ categoria: 'bache', distrito_id: 'd', n: 3 }],
    'm9:top50-uv': [
      { unidad_vecinal_id: 'u1', n: 1 },
      { unidad_vecinal_id: 'u2', n: 1 },
    ],
    'm9:uvs': [
      { unidad_vecinal_id: 'u1', distrito_id: 'd' },
      { unidad_vecinal_id: 'u2', distrito_id: 'd' },
    ],
  });
  const good = [
    [
      { estado: 'nuevo', severidad: 'baja', n: 1 },
      { estado: 'validado', severidad: 'alta', n: 1 },
    ],
    [{ n: 3 }],
    [{ distrito_id: 'd', n: 2 }],
    [
      { unidad_vecinal_id: 'u1', distrito_id: 'd', n: 1 },
      { unidad_vecinal_id: 'u2', distrito_id: 'd', n: 1 },
    ],
  ];
  await m.assertResults(client, info, good, oracleModules);
  const attacks = [
    [
      0,
      [
        { estado: 'validado', severidad: 'baja', n: 1 },
        { estado: 'nuevo', severidad: 'alta', n: 1 },
      ],
      /ESTADO_BANDA/,
    ],
    [1, [{ n: 0 }], /RECURRENCIA/],
    [2, [{ distrito_id: 'otro', n: 2 }], /DISTRITO/],
    [
      3,
      [
        { unidad_vecinal_id: 'u2', n: 1 },
        { unidad_vecinal_id: 'u1', n: 1 },
      ],
      /TOP50/,
    ],
  ];
  for (const [i, rows, error] of attacks) {
    const bad = structuredClone(good);
    bad[i] = rows;
    await assert.rejects(m.assertResults(client, info, bad, oracleModules), error);
  }
});

test('P4-1: Todas suma mapas completos antes del top50 y conserva un ganador ausente de cada top50', async () => {
  const complete = [];
  for (const categoria of m.CATEGORIES) {
    for (let i = 0; i < 51; i++)
      complete.push({
        categoria,
        estado: 'validado',
        severidad: 'alta',
        distrito_id: 'd',
        unidad_vecinal_id: `${categoria}-${String(i).padStart(2, '0')}`,
        n: 2,
        ultimo: new Date('2026-10-02'),
      });
    complete.push({
      categoria,
      estado: 'nuevo',
      severidad: 'media',
      distrito_id: 'd',
      unidad_vecinal_id: 'compartida',
      n: 1,
      ultimo: new Date('2026-10-02'),
    });
  }
  const info = {
    kind: 'indicadores',
    category: 'todas',
    statements: [
      { sql: 'GROUP BY 1, 2' },
      { sql: 'n_reportes >= 2' },
      { sql: 'GROUP BY distrito_id' },
      { sql: 'LIMIT 50' },
    ],
  };
  const expected = [
    { unidad_vecinal_id: 'compartida', distrito_id: 'd', n: 4 },
    ...complete
      .filter((r) => r.n === 2)
      .map((r) => ({ unidad_vecinal_id: r.unidad_vecinal_id, distrito_id: 'd', n: 2 }))
      .sort((a, b) => (a.unidad_vecinal_id < b.unidad_vecinal_id ? -1 : 1))
      .slice(0, 49),
  ];
  const good = [
    [
      { estado: 'validado', severidad: 'alta', n: 408 },
      { estado: 'nuevo', severidad: 'media', n: 4 },
    ],
    [{ n: 0 }],
    [{ distrito_id: 'd', n: 412 }],
    expected,
  ];
  const client = oracleClient({
    'm9:matriz': complete,
    'm9:recurrentes': [],
    'm9:uvs': complete.map((r) => ({ unidad_vecinal_id: r.unidad_vecinal_id, distrito_id: 'd' })),
    'm9:top50-uv': (_sql, params) => {
      const counts = JSON.parse(params[0]);
      assert.equal(
        counts.length,
        205,
        'La ordenación recibe todas las UV, sin topes por categoría',
      );
      assert.deepEqual(
        counts.find((r) => r.unidad_vecinal_id === 'compartida'),
        {
          unidad_vecinal_id: 'compartida',
          n: 4,
        },
      );
      return expected.map(({ unidad_vecinal_id, n }) => ({ unidad_vecinal_id, n }));
    },
  });
  const control = await m.assertResults(client, info, good, oracleModules);
  assert.equal(control.matrix.length, 208);
  assert.equal(control.allCategoriesBeforeLimits, true);
  const bad = structuredClone(good);
  bad[3] = expected.slice(1);
  await assert.rejects(m.assertResults(client, info, bad, oracleModules), /TOP50/);
});

test('P4-3/4: positivo permite UUID propio nuevo y separa tiempo acotado de verificación global', async () => {
  const { client, modules, deps, saved } = equivalenceFixture();
  await m.equivalence(client, modules, deps);
  const evidence = saved[0][1];
  assert.equal(evidence.fullMs, 10);
  assert.equal(evidence.fullVerificationMs, 3000);
  assert.equal(evidence.bounded.length, 4);
  for (const row of evidence.bounded) {
    assert.equal(row.durationMs, 7);
    assert.equal(row.verificationMs, 1000);
    assert.ok(row.memberIds.length >= 2);
    assert.equal(row.result.afectados, row.memberIds.length);
  }
});

test('P4-3: reconstruir IDs ajenos o alterar partición propia no equivale', async () => {
  for (const [mutate, error] of [
    [
      (rows, g) => {
        rows.find((r) => r.categoria !== g.categoria).group_id = 'reconstruido';
      },
      /ALTERO_AJENOS/,
    ],
    [
      (_rows, g) => {
        g.miembros = 'otros-reportes';
      },
      /ACOTADO_DIFIERE/,
    ],
    [
      (_rows, g) => {
        g.group_id = g.group_id.replace('nuevo-', '');
      },
      /NO_REALIZADO/,
    ],
    [
      (_rows, _g, r) => {
        r.disueltos = 0;
      },
      /NO_REALIZADO/,
    ],
    [
      (_rows, _g, r) => {
        r.puntos = 2;
      },
      /NO_REALIZADO/,
    ],
    [
      (_rows, _g, r) => {
        r.desbordado = true;
      },
      /NO_REALIZADO/,
    ],
  ]) {
    const { client, modules, deps } = equivalenceFixture(mutate);
    await assert.rejects(m.equivalence(client, modules, deps), error);
  }
});

test('P4-5: positivo de PIP, distrito/versión/flags y exterior con todas las ramas vacías', async () => {
  const rows = [
    [{ id: 'u2', distrito_id: 'd', version_capa: 'DM_UV_MZ_2025' }],
    [{ id: 'd' }],
    [{ id: 'd' }],
  ];
  const info = await pipInfo(rows);
  const control = await m.assertResults(oracleClient(), info, rows, oracleModules);
  assert.equal(control.resolution.unidad_vecinal.id, 'u2');
  for (const bad of [
    [[{ ...rows[0][0], version_capa: 'vieja' }], rows[1], rows[2]],
    [rows[0], [{ id: 'otro' }], rows[2]],
    [rows[0], rows[1], [{ id: 'otro' }]],
    [[...rows[0], { ...rows[0][0], id: 'u3' }], rows[1], rows[2]],
  ])
    await assert.rejects(m.assertResults(oracleClient(), info, bad, oracleModules), /ORACULO_PIP/);
  const empty = [[], [], []];
  const outside = await pipInfo(empty, true);
  assert.equal(outside.statements.length, 3);
  await m.assertResults(oracleClient(), outside, empty, oracleModules);
  for (let i = 0; i < 3; i++) {
    const bad = structuredClone(empty);
    bad[i] = [{ id: 'inesperado' }];
    await assert.rejects(
      m.assertResults(oracleClient(), outside, bad, oracleModules),
      /ORACULO_PIP_FUERA/,
    );
  }
});

test('diagnóstico seguro distingue recursos/SQL/OS y nunca incluye mensajes ni credenciales', () => {
  for (const [error, expected] of [
    [Object.assign(Error(url()), { code: '53200' }), 'SQLSTATE_53200'],
    [Object.assign(Error('solo-prueba'), { code: 'ENOSPC' }), 'ENOSPC'],
    [Error(url()), 'ERROR_NO_CLASIFICADO'],
  ]) {
    const result = m.failureDiagnostic(error, 'medir');
    assert.deepEqual(result, { event: 'fallo', stage: 'medir', code: expected, exit: 1 });
    assert.doesNotMatch(JSON.stringify(result), /solo-prueba|postgresql/);
  }
});

for (const [name, contents] of [
  ['null', 'null'],
  ['false', 'false'],
  ['cero', '0'],
  ['cadena vacía', '""'],
  ['objeto vacío', '{}'],
  ['array', '[]'],
  ['JSON corrupto', '{'],
]) {
  test(`S1: diario existente ${name} se rechaza antes de Client y conserva el archivo`, async () => {
    const scratch = await directory();
    const file = path.join(scratch, 'diario.json');
    await writeFile(file, contents);
    const calls = { client: 0, resources: 0 };
    class Client {
      constructor() {
        calls.client++;
        throw Error('CLIENT_NO_DEBE_ALCANZARSE');
      }
    }
    const deps = m.createDependencies(urls(), { scratch, Client });
    deps.resources = async () => {
      calls.resources++;
      return { freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 };
    };
    const rejected = [];
    for (const action of [
      () => deps.load(),
      () => m.createBank(urls(), deps, 'a'.repeat(64)),
      () => m.inspectState(urls(), deps),
    ]) {
      try {
        await action();
        rejected.push(false);
      } catch (error) {
        rejected.push(error instanceof SyntaxError || /ESTADO_NO_RECONOCIDO/.test(error.message));
      }
    }
    assert.equal(await readFile(file, 'utf8'), contents);
    assert.deepEqual(await readdir(scratch), ['diario.json']);
    assert.deepEqual(
      { calls, rejected },
      {
        calls: { client: 0, resources: 0 },
        rejected: [true, true, true],
      },
    );
  });
}

test('S1: solo ENOENT representa ausencia y permite alcanzar el bootstrap falso', async () => {
  const scratch = await directory();
  let clients = 0;
  class Client {
    constructor() {
      clients++;
      throw Error('BOOTSTRAP_FALSO_PERMITIDO');
    }
  }
  const deps = m.createDependencies(urls(), { scratch, Client });
  deps.resources = async () => ({ freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 });
  assert.equal(await deps.load(), null);
  assert.equal((await m.inspectState(urls(), deps)).status, 'SIN_DIARIO_NO_ADOPTAR');
  assert.equal(clients, 0);
  await assert.rejects(m.createBank(urls(), deps, 'a'.repeat(64)), /BOOTSTRAP_FALSO_PERMITIDO/);
  assert.equal(clients, 1);
  assert.deepEqual(await readdir(scratch), []);
  // Un error de lectura distinto de ENOENT no puede convertirse en ausencia.
  await mkdir(path.join(scratch, 'diario.json'));
  await assert.rejects(deps.load(), (error) => error.code !== 'ENOENT');
  assert.equal(clients, 1);
});

test('S1: estado válido se conserva y pending create sin OID se inspecciona sin adoptar ni replay', async () => {
  const scratch = await directory();
  let clients = 0;
  class Client {
    constructor() {
      clients++;
      throw Error('CLIENT_NO_DEBE_ALCANZARSE');
    }
  }
  const deps = m.createDependencies(urls(), { scratch, Client });
  const valid = state();
  await deps.save(valid);
  assert.deepEqual(await deps.load(), valid);
  assert.deepEqual(await m.createBank(urls(), deps, valid.fingerprint), valid);
  const pending = { ...valid, oid: null, pending: 'create', completed: [] };
  await deps.save(pending);
  const file = path.join(scratch, 'diario.json');
  const bytes = await readFile(file, 'utf8');
  assert.deepEqual(await deps.load(), pending);
  const inspected = await m.inspectState(urls(), deps);
  assert.equal(inspected.status, 'CREATE_INCIERTO_INSPECCION_REQUERIDA');
  assert.equal(inspected.resumable, false);
  await assert.rejects(m.createBank(urls(), deps, valid.fingerprint), /ESTADO|INCIERTA/);
  assert.equal(clients, 0);
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.deepEqual(await readdir(scratch), ['diario.json']);
});

test('S2: pareja IPv6 se rechaza antes de Client y de cualquier sonda de recursos', async () => {
  const pair = Object.fromEntries(
    Object.entries(urls()).map(([key, value]) => [key, value.replace('127.0.0.1', '[::1]')]),
  );
  const calls = { client: 0, probe: 0 };
  class Client {
    constructor() {
      calls.client++;
      throw Error('CLIENT_NO_DEBE_ALCANZARSE');
    }
  }
  await assert.rejects(async () => {
    const deps = m.createDependencies(pair, { scratch: await directory(), Client });
    deps.resources = async () => {
      calls.probe++;
      return { freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 };
    };
    await m.createBank(pair, deps, 'a'.repeat(64));
  }, /URL_NO_PERMITIDA/);
  assert.deepEqual(calls, { client: 0, probe: 0 });
});

test('S2: localhost se normaliza al endpoint IPv4 acreditado antes de construir Client', () => {
  const normalized = m.deriveUrls({
    DATABASE_URL: url('curichi').replace('127.0.0.1', 'localhost'),
  });
  assert.deepEqual(normalized, urls());
  const options = [];
  class Client {
    constructor(value) {
      options.push(value);
    }
  }
  const deps = m.createDependencies(normalized, { Client });
  deps.client(normalized.owner);
  assert.equal(options.length, 1);
  assert.equal(options[0].host, '127.0.0.1');
  assert.equal(options[0].port, 5432);
});

test('R1: falla de recursos identifica RAM/discos sin copiar campos privados', () => {
  let error;
  try {
    m.assertResources(
      { freeMiB: 1400, diskFreeGiB: 8, databaseFreeGiB: 20, password: 'solo-prueba' },
      5,
      'equivalence:antes-acotado',
    );
  } catch (value) {
    error = value;
  }
  assert.ok(error);
  const diagnostic = m.failureDiagnostic(error, 'medir');
  assert.deepEqual(diagnostic.resources, {
    freeMiB: 1400,
    diskFreeGiB: 8,
    databaseFreeGiB: 20,
    minimumMiB: 1500,
    minimumGiB: 5,
    location: 'equivalence:antes-acotado',
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /password|solo-prueba/);
});

test('R2: checkpoint del completo persiste antes de una guarda posterior que falla', async () => {
  const { client, modules, deps } = equivalenceFixture();
  const checkpoints = [];
  let calls = 0;
  deps.resources = async () => ({
    freeMiB: ++calls === 1 ? 3000 : 1400,
    diskFreeGiB: 20,
    databaseFreeGiB: 20,
  });
  await assert.rejects(
    m.equivalence(client, modules, deps, {
      checkpoint: async (name, value) => checkpoints.push([name, value]),
    }),
    /RECURSOS/,
  );
  assert.equal(checkpoints.length, 1, 'El completo ya committed debe tener checkpoint durable');
  assert.equal(checkpoints[0][0], 'equivalencia-full-commit.json');
  assert.equal(checkpoints[0][1].fullMs, 10);
  assert.equal(checkpoints[0][1].full.motor, 'postgis');
});

function recoveryManifests() {
  const seal = (value) => ({
    ...value,
    fingerprint: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  });
  const old = seal({
    version: 1,
    database: db,
    seed: m.SEED,
    total: m.TOTAL,
    contracts: '0.24.0',
    layers: ['distrito_municipal', 'unidad_vecinal'].map((capa) => ({
      capa,
      n_features_salida: 1,
      crs_origen: 'EPSG:32720',
      sha256_manifiesto: 'a'.repeat(64),
    })),
    files: [
      {
        file: 'scripts/medir-cuatro-categorias.mjs',
        sha256: '0cf52d79a85d230aeb91aabeb931226cb23bbcd00be2f932f00c31e44c086673',
      },
      {
        file: 'scripts/medir-cuatro-categorias.test.mjs',
        sha256: '435e8751290854849d5c8c7c71b70627c266adae89e99a55e3d39a587f05f8d8',
      },
      { file: 'packages/db/dist/puntos-criticos.js', sha256: 'b'.repeat(64) },
    ],
  });
  const { fingerprint: _, ...content } = structuredClone(old);
  content.files[0].sha256 = 'c'.repeat(64);
  content.files[1].sha256 = 'd'.repeat(64);
  const current = seal(content);
  const pending = {
    ...state(),
    run: 'c46b85bb-77d9-40de-9dbc-c4b59e4878c0',
    oid: '197700',
    fingerprint: old.fingerprint,
    completed: [
      'migrate',
      'layers',
      'activate',
      ...Array.from({ length: 100 }, (_, i) => `load:${i}`),
      'analyze',
      'validate',
    ],
    pending: 'equivalence',
  };
  return { old, current, pending, seal };
}

test('R3: recuperación solo admite esta etapa, identidad y cambio de los dos scripts', () => {
  const { old, current, pending, seal } = recoveryManifests();
  assert.equal(m.parseAction(['recuperar-equivalencia']), 'recuperar-equivalencia');
  assert.doesNotThrow(() => m.validateRecovery(pending, old, current));
  for (const patch of [
    { pending: null },
    { pending: 'load:99' },
    { run: state().run },
    { oid: '2' },
    { fingerprint: 'a'.repeat(64) },
    { completed: [] },
    { unknown: 'extra' },
  ])
    assert.throws(
      () => m.validateRecovery({ ...pending, ...patch }, old, current),
      /RECUPERACION|ESTADO/,
    );
  const { fingerprint: _, ...changed } = structuredClone(current);
  changed.files[2].sha256 = 'e'.repeat(64);
  assert.throws(() => m.validateRecovery(pending, old, seal(changed)), /RECUPERACION/);
  assert.throws(() => m.validateRecovery(pending, null, current), /RECUPERACION/);
});

test('R4: recuperación inválida conserva pending y no construye Client ni ejecuta sondas', async () => {
  const { old, current, pending } = recoveryManifests();
  let clients = 0,
    probes = 0,
    saves = 0;
  const deps = {
    load: async () => ({ ...pending, pending: 'load:99' }),
    recoveryProof: async () => ({ manifest: old, full: null }),
    client: () => {
      clients++;
      throw Error('CLIENT_PROHIBIDO');
    },
    resources: async () => {
      probes++;
    },
    save: async () => {
      saves++;
    },
  };
  await assert.rejects(m.recoverEquivalence(urls(), deps, {}, current), /RECUPERACION|ESTADO/);
  assert.deepEqual({ clients, probes, saves }, { clients: 0, probes: 0, saves: 0 });
});

async function recoveryFixture({
  failArtifact,
  badPartitions = false,
  failSave = false,
  commit = null,
  identityPatch = {},
} = {}) {
  const f = equivalenceFixture();
  const { old, current, pending } = recoveryManifests();
  const contracts = await import('../packages/contracts/dist/index.js');
  const product = await import('../packages/db/dist/index.js');
  f.modules.contracts = contracts;
  f.modules.db.recalcularPuntosCriticos = product.recalcularPuntosCriticos;
  const original = f.client.query;
  let stored = structuredClone(pending);
  let boundedCalls = 0;
  let clients = 0;
  const bounded = f.modules.db.recalcularEntornoDeReporte;
  f.modules.db.recalcularEntornoDeReporte = async (...args) => {
    boundedCalls++;
    return bounded(...args);
  };
  f.client.connect = async () => {};
  f.client.end = async () => {};
  f.client.query = async (sql, params) => {
    if (sql.includes('current_database()'))
      return { rows: [{ database: db, role: 'curichi', session: 'curichi' }] };
    if (sql.includes('pg_database'))
      return {
        rows: [
          {
            oid: pending.oid,
            owner: 'curichi',
            marker: `medir-cuatro-categorias/v1/${pending.run}`,
            ...identityPatch,
          },
        ],
      };
    if (sql.includes('FROM geo.capa_version'))
      return {
        rows: old.layers.map((r) => ({
          capa: r.capa,
          version: 'DM_UV_MZ_2025',
          n_features: r.n_features_salida,
          crs_origen: r.crs_origen,
          sha256_manifiesto: r.sha256_manifiesto,
        })),
      };
    if (sql.includes('FROM geo.') && sql.includes('WHERE version_capa'))
      return { rows: [{ n: 1 }] };
    if (sql.includes('GROUP BY categoria ORDER BY categoria'))
      return { rows: m.CATEGORIES.map((categoria) => ({ categoria, n: 250000 })) };
    if (sql.includes('jsonb_to_recordset')) return { rows: [{ n: 0 }] };
    if (sql.includes('m9:territorio')) return { rows: [{ total: 1000000, invalidos: 0 }] };
    if (sql.includes('pg_trigger'))
      return { rows: [{ tgname: 'reporte_sincronizar_detalle', tgenabled: 'O' }] };
    if (sql.includes('extract(month')) return { rows: [] };
    if (sql.includes('ST_ClusterDBSCAN')) {
      const category = params[2];
      const rows = f
        .membership()
        .filter((g) => g.categoria === category)
        .flatMap((g, cid) => g.miembros.split(',').map((id) => ({ id, categoria: category, cid })));
      if (badPartitions) rows[0].cid = 999;
      return { rows };
    }
    return original(sql, params);
  };
  f.deps.load = async () => structuredClone(stored);
  f.deps.client = () => {
    clients++;
    return f.client;
  };
  f.deps.recoveryProof = async () => ({ manifest: old, full: commit });
  f.deps.record = async () => {};
  f.deps.save = async (next) => {
    if (failSave) throw Error('SAVE_INCIERTO');
    stored = structuredClone(next);
  };
  f.deps.artifact = async (name, value) => {
    if (name === failArtifact) throw Error('EVIDENCIA_INCIERTA');
    f.saved.push([name, value]);
  };
  return {
    ...f,
    old,
    current,
    pending,
    stored: () => structuredClone(stored),
    counts: () => ({ boundedCalls, clients }),
  };
}

test('R5: recuperación positiva verifica particiones, mide cuatro acotados y conserva duración full desconocida', async () => {
  const f = await recoveryFixture();
  const next = await m.recoverEquivalence(urls(), f.deps, f.modules, f.current);
  assert.equal(next.pending, null);
  assert.equal(next.completed.length, 106);
  assert.equal(next.fingerprint, f.current.fingerprint);
  assert.equal(f.counts().boundedCalls, 4);
  const result = f.saved.find(([name]) => name === 'equivalencia.json')[1];
  assert.equal(result.fullMs, null);
  assert.match(result.fullTime, /NO_MEDIDO/);
  assert.equal(result.bounded.length, 4);
  assert.deepEqual(f.stored(), next);
  assert.ok(f.saved.some(([name]) => name === 'recuperacion-completada.json'));
});

test('R6: particiones distintas no habilitan acotados ni actualizan pending', async () => {
  const f = await recoveryFixture({ badPartitions: true });
  await assert.rejects(
    m.recoverEquivalence(urls(), f.deps, f.modules, f.current),
    /PARTICIONES_DIFIEREN/,
  );
  assert.equal(f.counts().boundedCalls, 0);
  assert.deepEqual(f.stored(), f.pending);
});

test('R7: evidencia o save inciertos conservan el pending y no autorizan medir ordinario', async () => {
  for (const options of [
    { failArtifact: 'equivalencia-full-verificado.json' },
    { failArtifact: 'equivalencia-acotado-inundacion-commit.json' },
    { failArtifact: 'equivalencia.json' },
    { failArtifact: 'recuperacion-completada.json' },
    { failSave: true },
  ]) {
    const f = await recoveryFixture(options);
    await assert.rejects(m.recoverEquivalence(urls(), f.deps, f.modules, f.current), /INCIERT/);
    assert.deepEqual(f.stored(), f.pending);
    const before = f.counts().clients;
    await assert.rejects(m.measure(urls(), f.deps, f.modules, f.current), /INCIERTA/);
    assert.equal(f.counts().clients, before);
  }
});

test('R8: checkpoint acreditado conserva duración exacta; checkpoint falsy/ajeno aborta antes de Client', async () => {
  const { pending } = recoveryManifests();
  const commit = {
    version: 1,
    database: db,
    run: pending.run,
    oid: pending.oid,
    fingerprint: pending.fingerprint,
    full: { motor: 'postgis', reportes: 11, puntos: 4 },
    fullMs: 123456,
  };
  const f = await recoveryFixture({ commit });
  await m.recoverEquivalence(urls(), f.deps, f.modules, f.current);
  assert.equal(f.saved.find(([name]) => name === 'equivalencia.json')[1].fullMs, 123456);
  for (const bad of [false, 0, '', {}, [], { ...commit, oid: 'otro' }, { ...commit, fullMs: -1 }]) {
    const g = await recoveryFixture({ commit: bad });
    await assert.rejects(m.recoverEquivalence(urls(), g.deps, g.modules, g.current), /CHECKPOINT/);
    assert.deepEqual(g.counts(), { boundedCalls: 0, clients: 0 });
    assert.deepEqual(g.stored(), g.pending);
  }
});

test('R9: cambio de identidad tras validar archivos no ejecuta verificaciones ni escribe diario', async () => {
  const f = await recoveryFixture({ identityPatch: { oid: '2' } });
  await assert.rejects(m.recoverEquivalence(urls(), f.deps, f.modules, f.current), /PROCEDENCIA/);
  assert.equal(f.saved.length, 0);
  assert.deepEqual(f.stored(), f.pending);
  assert.equal(f.counts().boundedCalls, 0);
});

test('R10: lector real de pruebas acredita manifiesto/ausencia y rechaza checkpoint falsy sin modificar archivos', async () => {
  const scratch = await directory();
  const { old, pending } = recoveryManifests();
  const folder = path.join(scratch, 'ejecucion-88d04552-60a9-4c6b-a914-8eb73ba64565');
  await mkdir(folder);
  await writeFile(path.join(folder, 'manifiesto.json'), JSON.stringify(old));
  const deps = m.createDependencies(urls(), {
    scratch,
    Client: class {
      constructor() {
        assert.fail('CLIENT_PROHIBIDO');
      }
    },
  });
  assert.deepEqual(await deps.recoveryProof(pending), { manifest: old, full: null });
  for (const content of ['null', 'false', '0', '""', '{']) {
    const file = path.join(folder, 'equivalencia-full-commit.json');
    await writeFile(file, content);
    await assert.rejects(deps.recoveryProof(pending));
    assert.equal(await readFile(file, 'utf8'), content);
  }
});

async function replayRuntime() {
  const f = await recoveryFixture();
  const scratch = await directory();
  const journal = path.join(scratch, 'diario.json');
  await writeFile(journal, JSON.stringify(f.pending));
  const folder = path.join(scratch, 'ejecucion-00000000-0000-4000-a000-000000000001');
  await mkdir(folder);
  await writeFile(path.join(folder, 'manifiesto.json'), JSON.stringify(f.old));
  let clients = 0,
    probes = 0;
  class Client {
    constructor() {
      clients++;
      Object.assign(this, f.client);
    }
  }
  const execution = async (suffix) => {
    const artifacts = path.join(scratch, `ejecucion-00000000-0000-4000-a000-00000000000${suffix}`);
    await mkdir(artifacts);
    const deps = m.createDependencies(urls(), { scratch, artifacts, Client, inherited: {} });
    deps.resources = async () => {
      probes++;
      return { freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 };
    };
    await deps.artifact('manifiesto.json', f.current);
    return { deps, artifacts };
  };
  return { ...f, scratch, journal, execution, io: () => ({ clients, probes }) };
}

test('RR1: segundo recover tras COMMIT y lectura incierta aborta antes de Client sin repetir inundación', async () => {
  const f = await replayRuntime();
  const original = f.client.query;
  let first = true;
  f.client.query = async (sql, params) => {
    if (first && sql.includes('m9:pertenencia') && f.counts().boundedCalls)
      throw Error('LECTURA_INCIERTA_TRAS_COMMIT');
    return original(sql, params);
  };
  const initial = await readFile(f.journal, 'utf8');
  const one = await f.execution('2');
  await assert.rejects(
    m.recoverEquivalence(urls(), one.deps, f.modules, f.current),
    /LECTURA_INCIERTA_TRAS_COMMIT/,
  );
  assert.equal(f.counts().boundedCalls, 1);
  assert.equal(await readFile(f.journal, 'utf8'), initial);
  const checkpoint = path.join(one.artifacts, 'equivalencia-acotado-inundacion-commit.json');
  const committed = await readFile(checkpoint, 'utf8');
  assert.equal(JSON.parse(committed).category, 'inundacion');
  assert.ok(
    !(await readdir(one.artifacts)).includes('equivalencia-acotado-inundacion-verificado.json'),
  );
  first = false;
  const two = await f.execution('3');
  const io = f.io();
  let failure = null;
  try {
    await m.recoverEquivalence(urls(), two.deps, f.modules, f.current);
  } catch (error) {
    failure = error.message;
  }
  assert.deepEqual(
    {
      failure,
      boundedCalls: f.counts().boundedCalls,
      io: f.io(),
      journalUnchanged: (await readFile(f.journal, 'utf8')) === initial,
    },
    { failure: 'RECUPERACION_ACOTADO_INCIERTO', boundedCalls: 1, io, journalUnchanged: true },
  );
  assert.equal(await readFile(checkpoint, 'utf8'), committed);
  assert.deepEqual(await readdir(two.artifacts), ['manifiesto.json']);
});

test('RR1: checkpoint acotado existente bloquea por nombre aun si es falsy/corrupto, en raíz o ejecución', async () => {
  const { old, current, pending } = recoveryManifests();
  for (const root of [false, true])
    for (const kind of ['commit', 'verificado'])
      for (const content of ['{}', 'null', 'false', '0', '""', '{', '']) {
        const scratch = await directory();
        const folder = path.join(scratch, 'ejecucion-00000000-0000-4000-a000-000000000001');
        await mkdir(folder);
        await writeFile(path.join(folder, 'manifiesto.json'), JSON.stringify(old));
        const journal = path.join(scratch, 'diario.json');
        const bytes = JSON.stringify(pending);
        await writeFile(journal, bytes);
        const checkpoint = path.join(
          root ? scratch : folder,
          `equivalencia-acotado-inundacion-${kind}.json`,
        );
        await writeFile(checkpoint, content);
        const calls = { clients: 0, probes: 0 };
        class Client {
          constructor() {
            calls.clients++;
            throw Error('CLIENT_NO_DEBE_ALCANZARSE');
          }
        }
        const deps = m.createDependencies(urls(), { scratch, Client, inherited: {} });
        deps.resources = async () => {
          calls.probes++;
          return { freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 };
        };
        const entries = await readdir(scratch);
        const inner = await readdir(folder);
        await assert.rejects(
          m.recoverEquivalence(urls(), deps, {}, current),
          /RECUPERACION_ACOTADO_INCIERTO/,
        );
        assert.deepEqual(calls, { clients: 0, probes: 0 });
        assert.equal(await readFile(checkpoint, 'utf8'), content);
        assert.equal(await readFile(journal, 'utf8'), bytes);
        assert.deepEqual(await readdir(scratch), entries);
        assert.deepEqual(await readdir(folder), inner);
      }
});

test('RR1: sin checkpoint acotado previo el adaptador real permite una recuperación y cuatro acotados', async () => {
  const f = await replayRuntime();
  const run = await f.execution('2');
  const next = await m.recoverEquivalence(urls(), run.deps, f.modules, f.current);
  assert.equal(next.pending, null);
  assert.equal(next.completed.length, 106);
  assert.equal(f.counts().boundedCalls, 4);
  assert.equal(f.io().clients, 1);
  assert.deepEqual(JSON.parse(await readFile(f.journal, 'utf8')), next);
});

const measuredBbox = [
  -63.111073740616696, -17.906190449999997, -63.0910737406167, -17.886190449999994,
];
function bboxRows() {
  return pageRows.map((row, i) => ({
    ...row,
    categoria: 'area_verde',
    lon: -63.101,
    lat: -17.897,
    lon_publico: i ? -63.101 : -63.09107,
    lat_publico: -17.89758,
  }));
}
function bboxClient(expected, predicate = true) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('m9:bbox-devuelto'))
        return { rows: [{ n: expected.length, dentro: predicate }] };
      if (sql.includes('m9:pagina')) return { rows: expected };
      if (sql.includes('AS t,'))
        return {
          rows: [
            { t: expected.length, p: expected.length, s: expected.length, l: expected.length },
          ],
        };
      throw Error(`CONTROL_NO_SIMULADO: ${sql}`);
    },
  };
  return { client, calls };
}
test('BBOX1: punto real 0.396m fuera numéricamente pasa solo con PostGIS && sobre coordenadas devueltas', async () => {
  const rows = bboxRows();
  const { client, calls } = bboxClient(rows, true);
  assert.ok(rows[0].lon_publico > measuredBbox[2]);
  await m.assertResults(
    client,
    {
      kind: 'listado',
      category: 'area_verde',
      soloPublicos: true,
      filtros: { pagina: 1, limite: 50, bbox: measuredBbox },
    },
    [[{ n: '2' }], rows],
    oracleModules,
  );
  const query = calls.find((r) => r.sql.includes('m9:bbox-devuelto'));
  assert.ok(query, 'El control espacial debe ejecutarse, no omitirse');
  assert.match(query.sql, /ST_SetSRID\(ST_MakePoint\(/);
  assert.match(query.sql, /&& ST_MakeEnvelope/);
  assert.doesNotMatch(query.sql, /ST_Intersects|epsilon/i);
  assert.deepEqual(query.params, [
    rows.map((r) => r.lon_publico),
    rows.map((r) => r.lat_publico),
    ...measuredBbox,
  ]);
});
test('BBOX2: coordenada lejana falla; texto/null/no finito no se coacciona ni llega al control SQL', async () => {
  const rows = bboxRows();
  const info = {
    kind: 'listado',
    category: 'area_verde',
    soloPublicos: true,
    filtros: { pagina: 1, limite: 50, bbox: measuredBbox },
  };
  const far = structuredClone(rows);
  far[0].lon_publico = 100;
  await assert.rejects(
    m.assertResults(bboxClient(rows, false).client, info, [[{ n: '2' }], far], oracleModules),
    /ORACULO_BBOX/,
  );
  for (const value of ['-63.101', null, NaN, Infinity, undefined]) {
    const bad = structuredClone(rows);
    bad[0].lon_publico = value;
    const mock = bboxClient(rows, true);
    await assert.rejects(
      m.assertResults(mock.client, info, [[{ n: '2' }], bad], oracleModules),
      /ORACULO_BBOX/,
    );
    assert.ok(!mock.calls.some((r) => r.sql.includes('m9:bbox-devuelto')));
  }
});
test('BBOX3: listado técnico valida exactas y el público valida públicas; bbox inválido aborta', async () => {
  for (const soloPublicos of [true, false]) {
    const rows = bboxRows();
    for (const row of rows) {
      if (soloPublicos) {
        row.lon = 100;
        row.lat = 50;
      } else {
        row.lon_publico = 100;
        row.lat_publico = 50;
      }
    }
    const mock = bboxClient(rows, true);
    const info = {
      kind: 'listado',
      category: 'area_verde',
      soloPublicos,
      filtros: { pagina: 1, limite: 50, bbox: measuredBbox },
    };
    await m.assertResults(mock.client, info, [[{ n: '2' }], rows], oracleModules);
    assert.deepEqual(mock.calls.find((r) => r.sql.includes('m9:bbox-devuelto')).params, [
      rows.map((r) => (soloPublicos ? r.lon_publico : r.lon)),
      rows.map((r) => (soloPublicos ? r.lat_publico : r.lat)),
      ...measuredBbox,
    ]);
    for (const bbox of [
      [null, 0, 1, 1],
      ['-64', -18, -63, -17],
      [0, 0, Infinity, 1],
      [0, 0, 1],
    ])
      await assert.rejects(
        m.assertResults(
          mock.client,
          { ...info, filtros: { ...info.filtros, bbox } },
          [[{ n: '2' }], rows],
          oracleModules,
        ),
        /ORACULO_BBOX/,
      );
  }
});

async function bboxRecoveryFixture({
  outside = false,
  failSave = false,
  failArtifact = false,
  badIdentity = false,
} = {}) {
  const modules = await m.loadModules();
  const context = {
    point: { lon: -63.1010737406167, lat: -17.896190449999995 },
    bbox: [-63.2566664, -17.9259172, -62.8074418, -17.6324287],
  };
  const cases = await m.buildCases(modules, context);
  const caseInfo = cases.find((r) => r.id === 'publico:area_verde:barrio');
  const { old: original, pending: base, seal } = recoveryManifests();
  const { fingerprint: _, ...content } = structuredClone(original);
  content.files[0].sha256 = 'b2be5543860d86d3b8e9e22d2af21a9657413b8d402509de2239d2f92152f4fb';
  content.files[1].sha256 = 'fb562ad73635549a418af8f1796aea7911abef90e044e3c8b9fb888ee75daaf5';
  const old = seal(content);
  const updated = structuredClone(content);
  updated.files[0].sha256 = 'c'.repeat(64);
  updated.files[1].sha256 = 'd'.repeat(64);
  const current = seal(updated);
  const pending = {
    ...base,
    fingerprint: old.fingerprint,
    completed: [
      ...base.completed,
      'equivalence',
      ...cases.slice(0, 31).map((r) => `query:${r.id}`),
    ],
    pending: 'query:publico:area_verde:barrio',
  };
  const rows = bboxRows();
  if (outside) rows[0].lon_publico = 100;
  const oracle = bboxClient(bboxRows(), !outside);
  const queries = [];
  let clients = 0,
    saves = 0,
    stored = structuredClone(pending);
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async (sql, params) => {
      queries.push({ sql, params });
      assert.match(sql, /^\s*(?:\/\*[\s\S]*?\*\/\s*)?(SELECT|WITH|BEGIN|COMMIT|ROLLBACK)\b/);
      if (sql.startsWith('BEGIN')) {
        assert.match(sql, /READ ONLY/);
        return { rows: [] };
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('current_database()'))
        return { rows: [{ database: db, role: 'curichi', session: 'curichi' }] };
      if (sql.includes('pg_database'))
        return {
          rows: [
            {
              oid: badIdentity ? '2' : pending.oid,
              owner: 'curichi',
              marker: `medir-cuatro-categorias/v1/${pending.run}`,
            },
          ],
        };
      if (sql === caseInfo.statements[0].sql) return { rows: [{ n: '2' }] };
      if (sql === caseInfo.statements[1].sql) return { rows };
      return oracle.client.query(sql, params);
    },
  };
  const artifacts = [];
  const deps = {
    load: async () => structuredClone(stored),
    bboxRecoveryProof: async () => ({ manifest: old, caseInfo }),
    client: () => {
      clients++;
      return client;
    },
    resources: async () => ({ freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 }),
    artifact: async (name, value) => {
      if (failArtifact) throw Error('EVIDENCIA_INCIERTA');
      artifacts.push([name, value]);
    },
    record: async () => {},
    save: async (next) => {
      saves++;
      if (failSave) throw Error('SAVE_INCIERTO');
      stored = structuredClone(next);
    },
  };
  return {
    modules,
    old,
    current,
    pending,
    caseInfo,
    context,
    queries,
    deps,
    artifacts,
    seal,
    counts: () => ({ clients, saves }),
    stored: () => stored,
  };
}

test('BQ1: recuperación explícita solo revalida el caso readonly; conserva los 137 completed', async () => {
  const f = await bboxRecoveryFixture();
  assert.equal(m.parseAction(['recuperar-consulta-bbox']), 'recuperar-consulta-bbox');
  const next = await m.recoverBboxQuery(urls(), f.deps, f.modules, f.current);
  assert.equal(next.pending, null);
  assert.equal(next.fingerprint, f.current.fingerprint);
  assert.deepEqual(next.completed, f.pending.completed);
  assert.equal(next.completed.length, 137);
  assert.deepEqual(f.stored(), next);
  assert.deepEqual(f.counts(), { clients: 1, saves: 1 });
  assert.ok(f.queries.some((r) => r.sql.includes('m9:bbox-devuelto')));
  assert.ok(f.queries.some((r) => r.sql === 'COMMIT'));
  assert.ok(!f.queries.some((r) => r.sql.includes('EXPLAIN')));
  assert.ok(!f.artifacts.some(([name]) => name.startsWith('consulta-')));
});
test('BQ2: otros pending/identidad/manifiestos o SQL capturado distinto abortan antes de Client', async () => {
  const f = await bboxRecoveryFixture();
  for (const patch of [
    { pending: null },
    { pending: 'equivalence' },
    { pending: 'query:publico:area_verde:chico' },
    { oid: '2' },
    { run: state().run },
    { completed: f.pending.completed.slice(0, -1) },
  ]) {
    const deps = { ...f.deps, load: async () => ({ ...f.pending, ...patch }) };
    await assert.rejects(
      m.recoverBboxQuery(urls(), deps, f.modules, f.current),
      /RECUPERACION|ESTADO/,
    );
  }
  const { fingerprint: _, ...changed } = structuredClone(f.current);
  changed.files[2].sha256 = 'e'.repeat(64);
  await assert.rejects(
    m.recoverBboxQuery(urls(), f.deps, f.modules, f.seal(changed)),
    /RECUPERACION/,
  );
  const bad = structuredClone(f.caseInfo);
  bad.statements[1].sql += ' LIMIT 1';
  await assert.rejects(
    m.recoverBboxQuery(
      urls(),
      { ...f.deps, bboxRecoveryProof: async () => ({ manifest: f.old, caseInfo: bad }) },
      f.modules,
      f.current,
    ),
    /RECUPERACION/,
  );
  assert.deepEqual(f.counts(), { clients: 0, saves: 0 });
});
test('BQ3: fallo del oráculo o de evidencia/save conserva pending; identidad incorrecta no ejecuta el caso', async () => {
  for (const options of [
    { outside: true },
    { failSave: true },
    { failArtifact: true },
    { badIdentity: true },
  ]) {
    const f = await bboxRecoveryFixture(options);
    await assert.rejects(
      m.recoverBboxQuery(urls(), f.deps, f.modules, f.current),
      /BBOX|INCIERT|PROCEDENCIA/,
    );
    assert.deepEqual(f.stored(), f.pending);
    if (options.outside) assert.ok(f.queries.some((r) => r.sql === 'ROLLBACK'));
    if (options.badIdentity)
      assert.ok(!f.queries.some((r) => r.sql === f.caseInfo.statements[0].sql));
  }
});
test('BQ4: lector real rechaza resultado del caso ya escrito o incierto antes de Client y conserva todos los archivos', async () => {
  const f = await bboxRecoveryFixture();
  for (const content of ['{}', 'null', 'false', '0', '""', '{', '']) {
    const scratch = await directory();
    const folder = path.join(scratch, 'ejecucion-36d2f81d-df91-4856-94ee-2eae04ea5d30');
    await mkdir(folder);
    await writeFile(path.join(scratch, 'diario.json'), JSON.stringify(f.pending));
    await writeFile(path.join(folder, 'manifiesto.json'), JSON.stringify(f.old));
    await writeFile(
      path.join(folder, 'consultas.json'),
      JSON.stringify({ context: f.context, cases: [f.caseInfo] }),
    );
    const prior = path.join(folder, 'consulta-publico-inundacion-chico.json');
    await writeFile(prior, 'resultado anterior protegido');
    let clients = 0;
    class Client {
      constructor() {
        clients++;
        throw Error('CLIENT_PROHIBIDO');
      }
    }
    const deps = m.createDependencies(urls(), { scratch, Client, inherited: {} });
    const proof = await deps.bboxRecoveryProof(f.pending);
    assert.deepEqual(proof, { manifest: f.old, caseInfo: f.caseInfo });
    const file = path.join(folder, 'consulta-publico-area_verde-barrio.json');
    await writeFile(file, content);
    const entries = await readdir(folder);
    const journal = await readFile(path.join(scratch, 'diario.json'), 'utf8');
    await assert.rejects(
      m.recoverBboxQuery(urls(), deps, f.modules, f.current),
      /RECUPERACION_BBOX_ARTEFACTO_INCIERTO/,
    );
    assert.equal(clients, 0);
    assert.equal(await readFile(file, 'utf8'), content);
    assert.equal(await readFile(prior, 'utf8'), 'resultado anterior protegido');
    assert.equal(await readFile(path.join(scratch, 'diario.json'), 'utf8'), journal);
    assert.deepEqual(await readdir(folder), entries);
  }
});

function top50Fixture() {
  // Orden acreditado por PostgreSQL en_US.utf8: ET3 precede a ET-92 con el mismo conteo.
  const counts = [
    ...Array.from({ length: 31 }, (_, i) => ({
      unidad_vecinal_id: `unidad_vecinal:A${i}`,
      n: 500 - i,
    })),
    { unidad_vecinal_id: 'unidad_vecinal:ET3', n: 420 },
    { unidad_vecinal_id: 'unidad_vecinal:ET-92', n: 420 },
    ...Array.from({ length: 16 }, (_, i) => ({
      unidad_vecinal_id: `unidad_vecinal:M${String(i).padStart(2, '0')}`,
      n: 418,
    })),
    { unidad_vecinal_id: 'unidad_vecinal:ET77', n: 417 },
    ...Array.from({ length: 526 }, (_, i) => ({ unidad_vecinal_id: `unidad_vecinal:Z${i}`, n: 1 })),
  ];
  const matrix = counts.map((r) => ({
    ...r,
    categoria: 'basura',
    estado: 'validado',
    severidad: 'alta',
    distrito_id: 'd',
    ultimo: new Date('2026-10-02'),
  }));
  matrix[31].n = 210;
  matrix.push({ ...matrix[31], estado: 'nuevo', n: 210 });
  const expected = counts.slice(0, 50).map((r) => ({ ...r, distrito_id: 'd' }));
  const calls = [];
  const client = oracleClient({
    'm9:matriz': matrix,
    'm9:recurrentes': [],
    'm9:uvs': counts.map((r) => ({ unidad_vecinal_id: r.unidad_vecinal_id, distrito_id: 'd' })),
    'm9:top50-uv': (sql, params) => {
      calls.push({ sql, params });
      assert.match(sql, /jsonb_to_recordset\(\$1::jsonb\)/);
      assert.match(sql, /ORDER BY n DESC,\s*unidad_vecinal_id\s+LIMIT 50/);
      assert.doesNotMatch(sql, /FROM\s+reporte|COLLATE|GROUP BY/i);
      assert.deepEqual(
        JSON.parse(params[0]),
        counts,
        'El servidor ordena los 576 conteos independientes ya reducidos',
      );
      return counts.slice(0, 50);
    },
  });
  const info = {
    id: 'indicadores:basura',
    kind: 'indicadores',
    category: 'basura',
    statements: [{ sql: 'LIMIT 50' }],
  };
  return { counts, matrix, expected, calls, client, info };
}

test('T50-1: ET3/ET-92 acepta el orden PostgreSQL y rechaza la permuta lexicográfica JS', async () => {
  const f = top50Fixture();
  assert.ok(f.expected[31].unidad_vecinal_id > f.expected[32].unidad_vecinal_id);
  assert.equal(f.expected[49].unidad_vecinal_id, 'unidad_vecinal:ET77');
  await m.assertResults(f.client, f.info, [f.expected], oracleModules);
  assert.equal(f.calls.length, 1, 'El control usa la ordenación del servidor');
  const permuted = structuredClone(f.expected);
  [permuted[31], permuted[32]] = [permuted[32], permuted[31]];
  await assert.rejects(
    m.assertResults(f.client, f.info, [permuted], oracleModules),
    /ORACULO_TOP50_UV/,
  );
});

test('T50-2: conserva conteos, pertenencia, ranking, duplicados y distrito exactos', async () => {
  const f = top50Fixture();
  for (const mutation of [
    (rows) => {
      rows[31].n++;
    },
    (rows) => {
      rows.pop();
    },
    (rows) => {
      [rows[0], rows[1]] = [rows[1], rows[0]];
    },
    (rows) => {
      rows[32] = { ...rows[31] };
    },
    (rows) => {
      rows[49] = { ...f.counts[50], distrito_id: 'd' };
    },
    (rows) => {
      rows[31].distrito_id = 'otro';
    },
  ]) {
    const bad = structuredClone(f.expected);
    mutation(bad);
    await assert.rejects(
      m.assertResults(f.client, f.info, [bad], oracleModules),
      /ORACULO_TOP50_UV/,
    );
  }
  await m.assertResults(f.client, f.info, [f.expected], oracleModules);
  assert.equal(f.calls.length, 7);
});

test('T50-3: la permuta JS de dos UV empatadas debe fallar aunque el corte y los conteos coincidan', async () => {
  const f = top50Fixture();
  const permuted = structuredClone(f.expected);
  [permuted[31], permuted[32]] = [permuted[32], permuted[31]];
  await assert.rejects(
    m.assertResults(f.client, f.info, [permuted], oracleModules),
    /ORACULO_TOP50_UV/,
  );
});

async function top50RecoveryFixture({
  wrongOrder = false,
  wrongCount = false,
  badIdentity = false,
  failArtifact = false,
  failSave = false,
} = {}) {
  const modules = await m.loadModules();
  const f = top50Fixture();
  const cases = await m.buildCases(modules, {
    point: { lon: -63.1, lat: -17.8 },
    bbox: [-64, -18, -63, -17],
  });
  const caseInfo = cases.find((c) => c.id === 'indicadores:basura');
  const { old: base, pending: original, seal } = recoveryManifests();
  const { fingerprint: _, ...content } = structuredClone(base);
  content.files[0].sha256 = 'f4124cdccfcd9680a2c17cb8e5eb4734446578574537979e7a305b48d5052c86';
  content.files[1].sha256 = 'f5fc0e9829a5dbb1051c6cfb37795bd549fac718036956090713c5604430ed72';
  const old = seal(content);
  const changed = structuredClone(content);
  changed.files[0].sha256 = 'c'.repeat(64);
  changed.files[1].sha256 = 'd'.repeat(64);
  const current = seal(changed);
  const pending = {
    ...original,
    fingerprint: old.fingerprint,
    completed: [
      ...original.completed,
      'equivalence',
      ...cases.slice(0, 54).map((c) => `query:${c.id}`),
    ],
    pending: 'query:indicadores:basura',
  };
  const total = f.counts.reduce((n, r) => n + r.n, 0);
  const top = structuredClone(f.expected);
  if (wrongOrder) [top[31], top[32]] = [top[32], top[31]];
  if (wrongCount) top[31].n++;
  const results = [
    [
      { estado: 'validado', severidad: 'alta', n: total - 210 },
      { estado: 'nuevo', severidad: 'alta', n: 210 },
    ],
    [{ distrito_id: 'd', n: total }],
    [{ n: 0 }],
    top,
    [],
  ];
  const queries = [],
    artifacts = [];
  let clients = 0,
    saves = 0,
    stored = structuredClone(pending);
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async (sql, params) => {
      queries.push({ sql, params });
      assert.match(sql, /^\s*(?:\/\*[\s\S]*?\*\/\s*)?(SELECT|WITH|BEGIN|COMMIT|ROLLBACK)\b/);
      if (sql.startsWith('BEGIN')) {
        assert.match(sql, /READ ONLY/);
        return { rows: [] };
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('current_database()'))
        return { rows: [{ database: db, role: 'curichi', session: 'curichi' }] };
      if (sql.includes('pg_database'))
        return {
          rows: [
            {
              oid: badIdentity ? '2' : pending.oid,
              owner: 'curichi',
              marker: `medir-cuatro-categorias/v1/${pending.run}`,
            },
          ],
        };
      const index = caseInfo.statements.findIndex((s) => s.sql === sql);
      if (index >= 0) return { rows: results[index] };
      return f.client.query(sql, params);
    },
  };
  const deps = {
    load: async () => structuredClone(stored),
    top50RecoveryProof: async () => ({ manifest: old, caseInfo }),
    client: () => {
      clients++;
      return client;
    },
    resources: async () => ({ freeMiB: 3000, diskFreeGiB: 20, databaseFreeGiB: 20 }),
    artifact: async (name, value) => {
      if (failArtifact) throw Error('EVIDENCIA_INCIERTA');
      artifacts.push([name, value]);
    },
    record: async () => {},
    save: async (next) => {
      saves++;
      if (failSave) throw Error('SAVE_INCIERTO');
      stored = structuredClone(next);
    },
  };
  return {
    ...f,
    modules,
    old,
    current,
    pending,
    caseInfo,
    queries,
    artifacts,
    deps,
    seal,
    countsObserved: () => ({ clients, saves }),
    stored: () => stored,
  };
}

test('TQ1: recuperación explícita revalida cinco SELECT readonly sin medir ni avanzar los 160 completed', async () => {
  const f = await top50RecoveryFixture();
  assert.equal(m.parseAction(['recuperar-consulta-top50']), 'recuperar-consulta-top50');
  const next = await m.recoverTop50Query(urls(), f.deps, f.modules, f.current);
  assert.equal(next.pending, null);
  assert.equal(next.fingerprint, f.current.fingerprint);
  assert.deepEqual(next.completed, f.pending.completed);
  assert.equal(next.completed.length, 160);
  assert.equal(next.completed.filter((c) => c.startsWith('query:')).length, 54);
  assert.deepEqual(f.stored(), next);
  assert.deepEqual(f.countsObserved(), { clients: 1, saves: 1 });
  assert.ok(f.queries.some((q) => q.sql.includes('m9:top50-uv')));
  assert.ok(f.queries.some((q) => q.sql === 'COMMIT'));
  assert.ok(!f.queries.some((q) => q.sql.includes('EXPLAIN')));
  assert.deepEqual(
    f.artifacts.map(([name]) => name),
    ['recuperacion-consulta-top50-verificada.json'],
  );
  assert.equal(f.artifacts[0][1].measured, false);
  assert.equal(f.artifacts[0][1].completedUnchanged, true);
});

test('TQ2: pending/identidad/manifiestos/captura distintos abortan antes de Client', async () => {
  const f = await top50RecoveryFixture();
  for (const patch of [
    { pending: null },
    { pending: 'equivalence' },
    { pending: 'query:indicadores:bache' },
    { oid: '2' },
    { run: state().run },
    { completed: f.pending.completed.slice(0, -1) },
    { extra: true },
  ])
    await assert.rejects(
      m.recoverTop50Query(
        urls(),
        { ...f.deps, load: async () => ({ ...f.pending, ...patch }) },
        f.modules,
        f.current,
      ),
      /RECUPERACION|ESTADO/,
    );
  for (const index of [0, 1, 2]) {
    const { fingerprint: _, ...changed } = structuredClone(f.old);
    changed.files[index].sha256 = 'e'.repeat(64);
    const old = f.seal(changed);
    await assert.rejects(
      m.recoverTop50Query(
        urls(),
        {
          ...f.deps,
          load: async () => ({ ...f.pending, fingerprint: old.fingerprint }),
          top50RecoveryProof: async () => ({ manifest: old, caseInfo: f.caseInfo }),
        },
        f.modules,
        f.current,
      ),
      /RECUPERACION/,
    );
  }
  const { fingerprint: _, ...changed } = structuredClone(f.current);
  changed.files[2].sha256 = 'e'.repeat(64);
  await assert.rejects(
    m.recoverTop50Query(urls(), f.deps, f.modules, f.seal(changed)),
    /RECUPERACION/,
  );
  for (const mutation of [
    (c) => {
      c.statements[3].sql += ' LIMIT 1';
    },
    (c) => {
      c.statements[0].params = ['bache'];
    },
    (c) => {
      c.statements.pop();
    },
  ]) {
    const bad = structuredClone(f.caseInfo);
    mutation(bad);
    await assert.rejects(
      m.recoverTop50Query(
        urls(),
        { ...f.deps, top50RecoveryProof: async () => ({ manifest: f.old, caseInfo: bad }) },
        f.modules,
        f.current,
      ),
      /RECUPERACION_TOP50_SQL_DIFIERE/,
    );
  }
  assert.deepEqual(f.countsObserved(), { clients: 0, saves: 0 });
});

test('TQ3: permuta/conteo falso o fallo de evidencia/save conserva pending; identidad protege el caso', async () => {
  for (const options of [
    { wrongOrder: true },
    { wrongCount: true },
    { failArtifact: true },
    { failSave: true },
    { badIdentity: true },
  ]) {
    const f = await top50RecoveryFixture(options);
    await assert.rejects(
      m.recoverTop50Query(urls(), f.deps, f.modules, f.current),
      /TOP50|INCIERT|PROCEDENCIA/,
    );
    assert.deepEqual(f.stored(), f.pending);
    if (options.wrongOrder || options.wrongCount)
      assert.ok(f.queries.some((q) => q.sql === 'ROLLBACK'));
    if (options.badIdentity)
      assert.ok(!f.queries.some((q) => q.sql === f.caseInfo.statements[0].sql));
  }
});

test('TQ4: lector real conserva los 54 resultados y bloquea todo archivo de consulta/verificación incierto antes de Client', async () => {
  const f = await top50RecoveryFixture();
  for (const content of ['{}', 'null', 'false', '0', '""', '{', '']) {
    for (const location of ['root', 'original', 'other']) {
      const scratch = await directory();
      const folder = path.join(scratch, 'ejecucion-ee025c03-d5f7-4dcf-b4f4-103531d17dcb');
      const other = path.join(scratch, 'ejecucion-88d04552-60a9-4c6b-a914-8eb73ba64565');
      await mkdir(folder);
      await mkdir(other);
      await writeFile(path.join(scratch, 'diario.json'), JSON.stringify(f.pending));
      await writeFile(path.join(folder, 'manifiesto.json'), JSON.stringify(f.old));
      await writeFile(path.join(folder, 'consultas.json'), JSON.stringify({ cases: [f.caseInfo] }));
      const priors = f.pending.completed
        .filter((c) => c.startsWith('query:'))
        .map((c) => path.join(folder, `consulta-${c.slice(6).replaceAll(':', '-')}.json`));
      for (const file of priors) await writeFile(file, 'resultado anterior protegido');
      let clients = 0;
      class Client {
        constructor() {
          clients++;
          throw Error('CLIENT_PROHIBIDO');
        }
      }
      const deps = m.createDependencies(urls(), { scratch, Client, inherited: {} });
      assert.deepEqual(await deps.top50RecoveryProof(f.pending), {
        manifest: f.old,
        caseInfo: f.caseInfo,
      });
      const file = path.join(
        location === 'root' ? scratch : location === 'original' ? folder : other,
        location === 'other'
          ? 'recuperacion-consulta-top50-verificada.json.tmp'
          : 'consulta-indicadores-basura.json',
      );
      await writeFile(file, content);
      const journal = await readFile(path.join(scratch, 'diario.json'), 'utf8');
      const entries = await readdir(folder);
      await assert.rejects(
        m.recoverTop50Query(urls(), deps, f.modules, f.current),
        /RECUPERACION_TOP50_ARTEFACTO_INCIERTO/,
      );
      assert.equal(clients, 0);
      assert.equal(await readFile(file, 'utf8'), content);
      assert.equal(await readFile(path.join(scratch, 'diario.json'), 'utf8'), journal);
      for (const prior of priors)
        assert.equal(await readFile(prior, 'utf8'), 'resultado anterior protegido');
      assert.deepEqual(await readdir(folder), entries);
    }
  }
});
