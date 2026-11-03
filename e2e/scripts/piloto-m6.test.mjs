import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as filesystem from 'node:fs/promises';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  coordinate,
  createControlChannel,
  createControlServer,
  createLauncher,
  createPgFactory,
  createPhotoStorage,
  createRuntime,
  deriveUrls,
  diskStore,
  normalizeRecoveryPath,
  parseArgs,
  prepareCli,
  runCli,
  sanitizeEnvironment,
  verifyRuntimeReview,
  windowsHost,
} from './piloto-m6.mjs';

const inertPassword = randomUUID();
const syntheticUrl = (role, database = 'curichi_e2e') => {
  const url = new URL('postgresql://127.0.0.1:5432');
  url.username = role;
  url.password = inertPassword;
  url.pathname = `/${database}`;
  return url.toString();
};
const urls = ['curichi', 'curichi_api', 'curichi_geo'].map((role) => syntheticUrl(role));
const original = {
  slug: 'bache',
  activa: false,
  orden: 2,
  activada_en: '2026-10-18T12:13:14.123456Z',
  activada_por: null,
};
const identity = {
  pid: 123,
  parent: 1,
  created: '2026-10-20T00:00:00Z',
  kind: 'api',
  fingerprint: 'a'.repeat(64),
};
const clone = (value) => structuredClone(value);

function fixture(initial = {}) {
  const state = {
    row: clone(original),
    journal: null,
    calls: [],
    clients: 0,
    stopped: [],
    clientObjects: [],
    pgHeld: false,
    fileHeld: false,
    catalog: [{ ...original }, { slug: 'inundacion', activa: true }],
    ...initial,
  };
  const deps = {
    store: {
      async load() {
        if (!state.journal) throw Error('DIARIO_AUSENTE');
        return clone(state.journal);
      },
      async pending() {
        return state.pending ?? [];
      },
      async acquire() {
        state.calls.push('file-lock');
        if (state.fileLocked) throw Error('LOCK_OCUPADO');
        state.fileHeld = true;
        return 'own';
      },
      async release() {
        state.calls.push('file-release');
        assert.equal(state.pgHeld, false);
        state.fileHeld = false;
      },
      async save(journal) {
        state.calls.push(`sync-${journal.state}`);
        if (state.failSync === journal.state) throw Error('FSYNC_FALLO');
        state.journal = clone(journal);
      },
    },
    async clientFactory(_url, role, env) {
      state.clients++;
      assert.equal(env.PGOPTIONS, undefined);
      assert.equal(env.AWS_ACCESS_KEY_ID, undefined);
      const client = Object.assign(new EventEmitter(), {
        async connect() {
          state.calls.push(`connect-${role}`);
          if (state.failConnect === role) throw Error('CONNECT_FALLO');
        },
        async end() {
          state.calls.push(`end-${role}`);
          if (role === 'curichi') state.pgHeld = false;
          client.emit('end');
        },
        async inspect() {
          state.calls.push(`readonly-${role}`);
          if (state.failInspect) throw Error('PREFLIGHT_FALLO');
        },
        async lock() {
          state.calls.push('session-lock');
          if (state.pgLocked) throw Error('PG_LOCK_OCUPADO');
          state.pgHeld = true;
        },
        async unlock() {
          state.calls.push('session-unlock');
          state.pgHeld = false;
        },
        async catalog() {
          return state.catalog.map((row) => (row.slug === 'bache' ? clone(state.row) : clone(row)));
        },
        async timestamp() {
          return '2026-10-20T01:02:03.654321Z';
        },
        async cas(before, after) {
          state.calls.push('cas');
          assert.equal(state.pgHeld, true, 'CAS exige advisory de sesión retenido');
          if (state.casConflict || JSON.stringify(before) !== JSON.stringify(state.row))
            throw Error('CATALOGO_CONFLICTO');
          state.row = clone(after);
        },
      });
      let usable = true;
      const emit = client.emit.bind(client);
      client.emit = (event, ...args) => {
        if (event === 'error' || event === 'end') {
          usable = false;
          if (role === 'curichi') state.pgHeld = false;
        }
        return emit(event, ...args);
      };
      for (const method of ['catalog', 'cas', 'timestamp']) {
        const originalMethod = client[method];
        client[method] = async (...args) => {
          if (!usable) throw Error('PG_SESSION_LOST');
          return originalMethod(...args);
        };
      }
      state.clientObjects.push(client);
      return client;
    },
    async storage() {
      state.calls.push('storage-readonly');
      if (state.failStorage) throw Error('ALMACEN_AUSENTE');
    },
    async start({ record, envs }) {
      assert.equal(envs.api.NODE_ENV, 'test');
      assert.equal(envs.web.NODE_ENV, 'production');
      assert.equal(envs.api.DATABASE_URL, urls[1]);
      assert.equal(envs.geo.DATABASE_URL, urls[2]);
      await record(identity);
      state.calls.push('spawn-api');
      if (state.failSpawn) throw Error('SPAWN_PARCIAL');
    },
    async run() {
      state.calls.push('browser');
      if (state.failRun) throw Error(state.failRun);
    },
    async stop(identities) {
      state.stopped.push(...identities);
      state.calls.push('stop');
      if (state.failStop) throw Error('IDENTIDAD_PROCESO_CAMBIO');
    },
    async ports() {
      state.calls.push('ports-free');
    },
    async checkpoint(phase, journal) {
      state.calls.push(phase);
      await state.hook?.(phase, journal, state);
    },
  };
  const options = {
    mode: 'piloto',
    urls,
    runId: 'unit-m6',
    inheritedEnv: {
      PGOPTIONS: '-c role=postgres',
      AWS_ACCESS_KEY_ID: 'hostile',
      NODE_OPTIONS: '--require=unsafe',
    },
    sourceEnv: {},
  };
  return { state, deps, options };
}

function optionsFor(f, mode, extra = {}) {
  return {
    ...f.options,
    mode,
    ...(mode === 'grupo' ? { group: 'G1' } : {}),
    ...(mode === 'restaurar' ? { journalPath: 'unit-m6/catalogo.json' } : {}),
    ...extra,
  };
}

for (const mode of ['piloto', 'preflight', 'grupo', 'restaurar']) {
  for (const index of [0, 1, 2]) {
    for (const [variant, change] of [
      (u) => u.replace('/curichi_e2e', '/curichi'),
      (u) => u.replace('/curichi_e2e', '/curichi_revision'),
      (u) => u.replace('/curichi_e2e', '/postgres'),
      (u) => u.replace('127.0.0.1', 'example.invalid'),
      (u) => u.replace(':5432', ':5433'),
      (u) => `${u}?host=external`,
      (u) => `${u}#`,
      (u) => u.replace('/curichi_e2e', '/%63urichi_e2e'),
      (u) => u.replace('/curichi_e2e', '/x/../curichi_e2e'),
      (u) => u.replace('postgresql:', 'http:'),
      (u) => u.replace('@127', '@127.0.0.1,127'),
      (u) => u.replace(/\/\/[^:]+:/, '//wrong:'),
    ].entries()) {
      test(`coordinador ${mode} rechaza URL ${index}, variante ${variant}, antes de factory`, async () => {
        const f = fixture();
        const invalid = [...urls];
        invalid[index] = change(invalid[index]);
        await assert.rejects(coordinate(optionsFor(f, mode, { urls: invalid }), f.deps), (e) =>
          ['DESTINO_NO_PERMITIDO', 'ENDPOINT_DIVERGENTE'].includes(e.message),
        );
        assert.equal(f.state.clients, 0);
        assert.deepEqual(f.state.calls, []);
      });
    }
  }
}

test('origen solo se deriva; entorno hijo no hereda destinos, credenciales ni overrides', () => {
  assert.deepEqual(
    deriveUrls({
      DATABASE_URL: syntheticUrl('curichi', 'curichi'),
      API_DB_PASSWORD: inertPassword,
      GEO_DB_PASSWORD: inertPassword,
    }),
    urls,
  );
  const env = sanitizeEnvironment({
    PATH: 'ok',
    PGDATABASE: 'curichi',
    POSTGRES_USER: 'root',
    API_DATABASE_URL: 'bad',
    NODE_OPTIONS: 'unsafe',
    S3_ENDPOINT: 'remote',
    AWS_PROFILE: 'prod',
    COOKIE_SEGURA: '1',
  });
  assert.deepEqual(env, { PATH: 'ok' });
});

test('preflight completo solo lectura no arranca ni actualiza', async () => {
  const f = fixture();
  await coordinate({ ...f.options, mode: 'preflight' }, f.deps);
  assert.equal(f.state.clients, 3);
  assert.ok(f.state.calls.includes('storage-readonly'));
  assert.ok(!f.state.calls.includes('cas'));
  assert.ok(!f.state.calls.includes('browser'));
});
test('éxito sincroniza prepared antes de CAS y restaura microsegundos exactos', async () => {
  const f = fixture();
  await coordinate(f.options, f.deps);
  assert.deepEqual(f.state.row, original);
  assert.equal(f.state.journal.state, 'restored');
  assert.ok(f.state.calls.indexOf('sync-prepared') < f.state.calls.indexOf('cas'));
  assert.ok(f.state.calls.lastIndexOf('cas') < f.state.calls.indexOf('sync-restored'));
  assert.deepEqual(f.state.stopped, [identity]);
});
for (const failure of ['TIMEOUT', 'SIGINT', 'SIGTERM', 'PG_SESSION_LOST', 'BROWSER_FAILED']) {
  test(`simulación de error retornado ${failure}: cierra propios y restaura`, async () => {
    const f = fixture({ failRun: failure });
    await assert.rejects(coordinate(f.options, f.deps));
    assert.deepEqual(f.state.row, original);
    assert.equal(f.state.journal.state, 'restored');
    assert.equal(f.state.stopped.length, 1);
  });
}
for (const flags of [
  { failInspect: true },
  { failStorage: true },
  { fileLocked: true },
  { pgLocked: true },
  { failConnect: 'curichi_api' },
  { failSync: 'prepared' },
]) {
  test(`falla cerrado antes de UPDATE ${JSON.stringify(flags)}`, async () => {
    const f = fixture(flags);
    await assert.rejects(coordinate(f.options, f.deps));
    assert.deepEqual(f.state.row, original);
    assert.ok(!f.state.calls.includes('cas'));
  });
}
test('spawn parcial registrado se cierra y se restaura', async () => {
  const f = fixture({ failSpawn: true });
  await assert.rejects(coordinate(f.options, f.deps));
  assert.deepEqual(f.state.stopped, [identity]);
  assert.deepEqual(f.state.row, original);
});
test('CAS externo no se sobreescribe y diario queda pendiente', async () => {
  const f = fixture();
  f.state.hook = async (phase) => {
    if (phase === 'applied') f.state.row.activada_por = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  };
  await assert.rejects(coordinate(f.options, f.deps), /CATALOGO_CONFLICTO/);
  assert.equal(f.state.row.activa, true);
  assert.equal(f.state.journal.state, 'applied');
});
test('identidad propia cambiada impide restauración con procesos no cerrados', async () => {
  const f = fixture({ failStop: true });
  await assert.rejects(coordinate(f.options, f.deps));
  assert.equal(f.state.journal.state, 'applied');
  assert.equal(f.state.row.activa, true);
});
for (const phase of [
  'prepared',
  'activation-committed',
  'applied',
  'restore-committed',
  'restored',
]) {
  test(`snapshot simulado de interrupción en ${phase}, recuperación doble`, async () => {
    const f = fixture();
    let snapshot;
    f.state.hook = async (at) => {
      if (at === phase) snapshot = { journal: clone(f.state.journal), row: clone(f.state.row) };
    };
    await coordinate(f.options, f.deps);
    assert.ok(snapshot);
    const recovery = fixture(snapshot);
    await coordinate(
      { ...recovery.options, mode: 'restaurar', journalPath: 'unit-m6/catalogo.json' },
      recovery.deps,
    );
    await coordinate(
      { ...recovery.options, mode: 'restaurar', journalPath: 'unit-m6/catalogo.json' },
      recovery.deps,
    );
    assert.deepEqual(recovery.state.row, original);
    assert.equal(recovery.state.journal.state, 'restored');
  });
}
test('pendiente o corrupto bloquea otra corrida antes de clientes', async () => {
  for (const pending of [['pending'], ['corrupt']]) {
    const f = fixture({ pending });
    await assert.rejects(coordinate(f.options, f.deps));
    assert.equal(f.state.clients, 0);
  }
});
test('recuperación inválida/env hostil no llega a clientes ni filtra errores', async () => {
  for (const journal of [{}, { state: 'applied', password: 'unit-secret' }]) {
    const f = fixture({ journal });
    await assert.rejects(
      coordinate({ ...f.options, mode: 'restaurar', journalPath: 'unit-m6/catalogo.json' }, f.deps),
      (e) => !e.message.includes('unit-secret'),
    );
    assert.equal(f.state.clients, 0);
  }
});
test('storage durable conserva diario y rechaza rutas fuera de su raíz', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-journal-unit-'));
  const store = diskStore(dir, { alive: async () => false });
  const f = fixture();
  await coordinate(f.options, f.deps);
  await store.save(f.state.journal);
  const file = path.join(dir, 'unit-m6', 'catalogo.json');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), f.state.journal);
  await assert.rejects(store.load('../escape/catalogo.json'));
  await writeFile(path.join(dir, 'unit-m6', 'catalogo.json'), '{partial');
  assert.ok((await store.pending()).length > 0);
});

for (const mode of ['preflight', 'grupo', 'piloto', 'restaurar']) {
  test(`control positivo: opciones y URL válidas atraviesan coordinador ${mode}`, async () => {
    const seed = fixture();
    await coordinate(seed.options, seed.deps);
    const f = fixture({ journal: seed.state.journal });
    const result = await coordinate(optionsFor(f, mode), f.deps);
    assert.equal(f.state.clients, 3);
    assert.equal(
      result.status,
      mode === 'preflight' ? 'READ_ONLY' : mode === 'restaurar' ? 'RESTORED' : 'PASS',
    );
  });
  for (const index of [1, 2]) {
    test(`endpoint divergente ${mode}/${index} falla antes de factory`, async () => {
      const f = fixture();
      const divergent = [...urls];
      divergent[index] = divergent[index].replace('127.0.0.1', 'localhost');
      await assert.rejects(
        coordinate(optionsFor(f, mode, { urls: divergent }), f.deps),
        /ENDPOINT_DIVERGENTE/,
      );
      assert.equal(f.state.clients, 0);
      assert.deepEqual(f.state.calls, []);
    });
  }
}
for (const args of [
  [],
  ['--grupo'],
  ['--grupo', 'todos'],
  ['--grupo', 'G0'],
  ['--grupo', 'G6'],
  ['--piloto', '--preflight'],
  ['--restaurar'],
  ['--restaurar', ''],
  ['--database', 'curichi'],
  ['--piloto', '--seed'],
  ['--preflight', 'extra'],
]) {
  test(`CLI rechaza forma inválida ${JSON.stringify(args)}`, () =>
    assert.throws(() => parseArgs(args), /OPCIONES_INVALIDAS/));
}
test('CLI admite solo las cuatro interfaces cerradas', () => {
  assert.deepEqual(parseArgs(['--preflight']), { mode: 'preflight' });
  assert.deepEqual(parseArgs(['--piloto']), { mode: 'piloto' });
  for (const group of ['G1', 'G2', 'G3', 'G4', 'G5'])
    assert.deepEqual(parseArgs(['--grupo', group]), { mode: 'grupo', group });
  assert.deepEqual(parseArgs(['--restaurar', 'unit-m6/catalogo.json']), {
    mode: 'restaurar',
    journalPath: 'unit-m6/catalogo.json',
  });
});
for (const invalid of [
  { mode: 'unknown' },
  { mode: 'grupo', group: 'todos' },
  { group: 'G1' },
  { journalPath: 'unexpected' },
  { database: 'curichi' },
  { runId: '../escape' },
]) {
  test(`opciones inválidas del coordinador sin fábrica ${JSON.stringify(invalid)}`, async () => {
    const f = fixture();
    await assert.rejects(coordinate({ ...f.options, ...invalid }, f.deps));
    assert.equal(f.state.clients, 0);
    assert.deepEqual(f.state.calls, []);
  });
}

for (const event of ['SIGINT', 'SIGTERM']) {
  test(`handler ${event} del coordinador activado con EventEmitter`, async () => {
    const f = fixture();
    const events = new EventEmitter();
    f.deps.signals = events;
    let cancelled = 0;
    f.deps.run = () =>
      new Promise((resolve) => {
        f.deps.cancel = (reason) => {
          assert.equal(reason, event);
          cancelled++;
          resolve();
        };
        queueMicrotask(() => events.emit(event));
      });
    await assert.rejects(coordinate(f.options, f.deps), new RegExp(event));
    assert.equal(cancelled, 1);
    assert.deepEqual(f.state.row, original);
    assert.equal(f.state.journal.state, 'restored');
    assert.equal(f.state.stopped.length, 1);
    assert.equal(events.listenerCount('SIGINT'), 0);
    assert.equal(events.listenerCount('SIGTERM'), 0);
    for (const client of f.state.clientObjects) assert.equal(client.listenerCount('end'), 0);
  });
  test(`${event} tras prepared impide CAS de activación`, async () => {
    const f = fixture();
    f.deps.signals = new EventEmitter();
    f.state.hook = async (phase) => {
      if (phase === 'prepared') f.deps.signals.emit(event);
    };
    await assert.rejects(coordinate(f.options, f.deps), new RegExp(event));
    assert.ok(!f.state.calls.includes('cas'));
    assert.deepEqual(f.state.row, original);
  });
}
test('AbortSignal real aborta ejecución inyectada y restaura', async () => {
  const f = fixture();
  const controller = new AbortController();
  let cancelled = false;
  f.deps.run = () =>
    new Promise((resolve) => {
      f.deps.cancel = () => {
        cancelled = true;
        resolve();
      };
      queueMicrotask(() => controller.abort(new Error('no publicar motivo externo')));
    });
  await assert.rejects(
    coordinate({ ...f.options, signal: controller.signal }, f.deps),
    /INTERRUMPIDO/,
  );
  assert.ok(cancelled);
  assert.deepEqual(f.state.row, original);
  assert.equal(f.state.journal.state, 'restored');
});
test('AbortSignal preabortada produce cero clientes', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    coordinate({ ...f.options, signal: controller.signal }, f.deps),
    /INTERRUMPIDO/,
  );
  assert.equal(f.state.clients, 0);
});
for (const event of ['error', 'end']) {
  test(`evento PG ${event} invalida exclusión y deja diario recuperable sin CAS posterior`, async () => {
    const f = fixture();
    let cancelled = false;
    let casAtLoss;
    f.deps.run = async () => {
      f.deps.cancel = () => {
        cancelled = true;
      };
      casAtLoss = f.state.calls.filter((x) => x === 'cas').length;
      f.state.clientObjects[0].emit(event, new Error('pg error con dato privado'));
    };
    await assert.rejects(coordinate(f.options, f.deps), /RECUPERACION_REQUERIDA/);
    assert.ok(cancelled);
    assert.equal(f.state.journal.state, 'applied');
    assert.equal(f.state.row.activa, true);
    assert.equal(f.state.calls.filter((x) => x === 'cas').length, casAtLoss);
    await coordinate(optionsFor(f, 'restaurar'), f.deps);
    assert.equal(f.state.journal.state, 'restored');
    assert.deepEqual(f.state.row, original);
  });
}
for (const state of ['applied', 'restored']) {
  test(`fallo sync ${state} preserva estado durable y permite recuperar`, async () => {
    const f = fixture({ failSync: state });
    await assert.rejects(coordinate(f.options, f.deps), /FSYNC_FALLO/);
    assert.deepEqual(f.state.row, original);
    assert.equal(f.state.journal.state, state === 'applied' ? 'restored' : 'applied');
    f.state.failSync = null;
    await coordinate(optionsFor(f, 'restaurar'), f.deps);
    assert.equal(f.state.journal.state, 'restored');
    assert.deepEqual(f.state.row, original);
  });
}
test('otra fila modificada se denuncia y jamás se sobrescribe', async () => {
  const f = fixture();
  f.state.hook = async (phase) => {
    if (phase === 'applied') f.state.catalog[1].activa = false;
  };
  await assert.rejects(coordinate(f.options, f.deps), /OTRA_CATEGORIA_CAMBIO/);
  assert.equal(f.state.catalog[1].activa, false);
  assert.deepEqual(f.state.row, original);
});
test('advisory de sesión se retiene hasta terminar restauración y cierre propios', async () => {
  const f = fixture();
  const stop = f.deps.stop;
  f.deps.stop = async (ids) => {
    assert.equal(f.state.pgHeld, true);
    assert.equal(f.state.fileHeld, true);
    await stop(ids);
  };
  await coordinate(f.options, f.deps);
  const calls = f.state.calls;
  assert.ok(calls.indexOf('session-lock') < calls.indexOf('sync-prepared'));
  assert.ok(calls.indexOf('stop') < calls.indexOf('sync-restored'));
  assert.ok(calls.indexOf('sync-restored') < calls.indexOf('session-unlock'));
  assert.ok(calls.indexOf('session-unlock') < calls.indexOf('end-curichi'));
  assert.ok(calls.indexOf('end-curichi') < calls.indexOf('file-release'));
});

for (const operation of ['sync', 'rename']) {
  test(`filesystem Windows real, fallo inyectado ${operation} antes de publicación`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-fs-fault-'));
    const f = fixture();
    await coordinate(f.options, f.deps);
    const plain = diskStore(dir);
    await plain.save(f.state.journal);
    const previous = await readFile(path.join(dir, 'unit-m6', 'catalogo.json'), 'utf8');
    const ops = { ...filesystem };
    if (operation === 'sync')
      ops.open = async (...args) => {
        const handle = await filesystem.open(...args);
        return {
          writeFile: (...values) => handle.writeFile(...values),
          sync: async () => {
            throw Error('FSYNC_INYECTADO');
          },
          close: () => handle.close(),
        };
      };
    else
      ops.rename = async () => {
        throw Error('RENAME_INYECTADO');
      };
    const failed = diskStore(dir, { operations: ops });
    await assert.rejects(failed.save({ ...f.state.journal, state: 'applied' }), /INYECTADO/);
    assert.equal(await readFile(path.join(dir, 'unit-m6', 'catalogo.json'), 'utf8'), previous);
    assert.deepEqual(await plain.pending(), ['unit-m6']);
  });
}
test('lock wx real excluye otro y recuperación exige advisory y dueño muerto', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-lock-unit-'));
  const store = diskStore(dir, {
    owner: { ...identity, kind: 'coordinator' },
    alive: async () => false,
  });
  const token = await store.acquire({ recovery: false, runId: 'unit-m6' });
  await assert.rejects(store.acquire({ recovery: false, runId: 'other' }), /LOCK_OCUPADO/);
  await assert.rejects(
    store.acquire({ recovery: true, runId: 'unit-m6', advisoryHeld: false }),
    /LOCK_OCUPADO/,
  );
  await assert.rejects(store.release('not-owner'), /LOCK_CAMBIO/);
  const recovered = await store.acquire({ recovery: true, runId: 'unit-m6', advisoryHeld: true });
  await assert.rejects(store.release(token), /LOCK_CAMBIO/);
  await store.release(recovered);
});

for (const event of ['error', 'end']) {
  for (const phase of ['stop', 'cas']) {
    test(`N1/N4: evento PG ${event} durante cleanup ${phase} mantiene handler y deja recuperación`, async () => {
      const f = fixture();
      if (phase === 'stop') {
        const stop = f.deps.stop;
        f.deps.stop = async (ids) => {
          await stop(ids);
          f.state.clientObjects[0].emit(event, new Error('dato externo'));
        };
      } else {
        const factory = f.deps.clientFactory;
        f.deps.clientFactory = async (...args) => {
          const client = await factory(...args);
          const cas = client.cas;
          if (args[1] === 'curichi')
            client.cas = async (before, after) => {
              if (!after.activa) {
                client.emit(event, new Error('dato externo'));
                throw Error('PG_SESSION_LOST');
              }
              await cas(before, after);
            };
          return client;
        };
      }
      await assert.rejects(coordinate(f.options, f.deps), /RECUPERACION_REQUERIDA/);
      assert.equal(f.state.journal.state, 'applied');
      assert.equal(f.state.row.activa, true);
      for (const client of f.state.clientObjects) assert.equal(client.listenerCount('error'), 0);
    });
  }
}
for (const event of ['SIGINT', 'SIGTERM']) {
  test(`N1: segunda señal ${event} durante finally; cancel que lanza queda contenido`, async () => {
    const f = fixture();
    const events = new EventEmitter();
    f.deps.signals = events;
    f.deps.cancel = () => {
      throw Error('TOKEN_PRIVADO_EN_MAYUSCULAS');
    };
    const stop = f.deps.stop;
    f.deps.stop = async (ids) => {
      events.emit(event);
      events.emit(event);
      await stop(ids);
    };
    await assert.rejects(coordinate(f.options, f.deps), new RegExp(event));
    assert.deepEqual(f.state.row, original);
    assert.equal(f.state.journal.state, 'restored');
    assert.equal(events.listenerCount(event), 0);
  });
}
test('N6: mensaje externo sensible solo mayúsculas se reduce a código propio', async () => {
  const f = fixture({ failRun: 'TOKEN_PRIVADO_EN_MAYUSCULAS' });
  await assert.rejects(
    coordinate(f.options, f.deps),
    (e) => e.message === 'M6_FALLO' && !e.stack.includes('TOKEN_PRIVADO'),
  );
});
test('recuperación con conflicto externo mantiene fila y diario, sin CAS', async () => {
  const seed = fixture();
  let snapshot;
  seed.state.hook = async (phase) => {
    if (phase === 'applied')
      snapshot = { journal: clone(seed.state.journal), row: clone(seed.state.row) };
  };
  await coordinate(seed.options, seed.deps);
  snapshot.row.activada_en = '2026-10-20T05:06:07.111111Z';
  const f = fixture(snapshot);
  await assert.rejects(coordinate(optionsFor(f, 'restaurar'), f.deps), /CATALOGO_CONFLICTO/);
  assert.deepEqual(f.state.row, snapshot.row);
  assert.equal(f.state.journal.state, 'applied');
  assert.ok(!f.state.calls.includes('cas'));
});

test('N4: pérdida de owner durante recuperación exige nueva recuperación explícita', async () => {
  const seed = fixture();
  let snapshot;
  seed.state.hook = async (phase) => {
    if (phase === 'applied')
      snapshot = { journal: clone(seed.state.journal), row: clone(seed.state.row) };
  };
  await coordinate(seed.options, seed.deps);
  const f = fixture(snapshot);
  f.deps.stop = async () => {
    f.state.clientObjects[0].emit('end');
  };
  await assert.rejects(coordinate(optionsFor(f, 'restaurar'), f.deps), /RECUPERACION_REQUERIDA/);
  assert.equal(f.state.journal.state, 'applied');
  assert.equal(f.state.row.activa, true);
  assert.ok(!f.state.calls.includes('cas'));
});

function failingOperations(targetState, operation, { partial = false } = {}) {
  let injected = false;
  const ops = { ...filesystem };
  const matches = (text) => !injected && JSON.parse(text).state === targetState;
  ops.open = async (...args) => {
    const handle = await filesystem.open(...args);
    let selected = false;
    return {
      async writeFile(text) {
        selected = String(args[0]).endsWith('.pending') && matches(text);
        if (selected && operation === 'write') {
          injected = true;
          await handle.writeFile(partial ? text.slice(0, 12) : text);
          throw Error('WRITE_INYECTADO');
        }
        await handle.writeFile(text);
      },
      async sync() {
        if (selected && operation === 'sync') {
          injected = true;
          throw Error('SYNC_INYECTADO');
        }
        await handle.sync();
      },
      async close() {
        await handle.close();
        if (selected && operation === 'close') {
          injected = true;
          throw Error('CLOSE_INYECTADO');
        }
      },
    };
  };
  ops.rename = async (from, to) => {
    if (
      String(from).endsWith('.pending') &&
      operation === 'rename' &&
      matches(await readFile(from, 'utf8'))
    ) {
      injected = true;
      throw Error('RENAME_INYECTADO');
    }
    await filesystem.rename(from, to);
  };
  return { ops, injected: () => injected };
}
for (const phase of ['prepared', 'applied', 'restored']) {
  for (const operation of ['write', 'sync', 'close', 'rename']) {
    test(`N2: disco real ${phase}/${operation}, recuperación doble conserva evidencia y habilita corrida`, async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-reconcile-'));
      const fault = failingOperations(phase, operation);
      const f = fixture();
      const store = diskStore(dir, {
        owner: { ...identity, kind: 'coordinator' },
        alive: async () => false,
        operations: fault.ops,
      });
      f.deps.store = store;
      await assert.rejects(coordinate(f.options, f.deps));
      assert.ok(fault.injected());
      assert.deepEqual(f.state.row, original);
      assert.deepEqual(await store.pending(), ['unit-m6']);
      await coordinate(optionsFor(f, 'restaurar'), f.deps);
      await coordinate(optionsFor(f, 'restaurar'), f.deps);
      assert.deepEqual(await store.pending(), []);
      assert.deepEqual(f.state.row, original);
      const names = await filesystem.readdir(path.join(dir, 'unit-m6'));
      assert.ok(names.some((name) => name.endsWith('.interrupted')));
      assert.ok(!names.some((name) => name.endsWith('.pending')));
      await coordinate({ ...optionsFor(f, 'grupo'), runId: 'next-run' }, f.deps);
      assert.deepEqual(await store.pending(), []);
    });
  }
}
test('N2: prepared parcial sin original íntegro falla antes de clientes y conserva evidencia', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-incomplete-'));
  const fault = failingOperations('prepared', 'write', { partial: true });
  const f = fixture();
  const store = diskStore(dir, {
    owner: { ...identity, kind: 'coordinator' },
    alive: async () => false,
    operations: fault.ops,
  });
  f.deps.store = store;
  await assert.rejects(coordinate(f.options, f.deps));
  assert.deepEqual(f.state.row, original);
  const clientsBefore = f.state.clients;
  await assert.rejects(coordinate(optionsFor(f, 'restaurar'), f.deps), /DIARIO_INCOMPLETO/);
  assert.equal(f.state.clients, clientsBefore);
  assert.deepEqual(await store.pending(), ['unit-m6']);
  assert.ok(
    (await filesystem.readdir(path.join(dir, 'unit-m6'))).some((name) => name.endsWith('.pending')),
  );
});
test('N5: diario con runId diferente a carpeta se rechaza antes de fábrica', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-run-path-'));
  const seed = fixture();
  await coordinate(seed.options, seed.deps);
  const store = diskStore(dir);
  await store.save(seed.state.journal);
  const file = path.join(dir, 'unit-m6', 'catalogo.json');
  await writeFile(file, JSON.stringify({ ...seed.state.journal, runId: 'other-run' }));
  const f = fixture();
  f.deps.store = store;
  await assert.rejects(coordinate(optionsFor(f, 'restaurar'), f.deps), /DIARIO_RUTA_INVALIDA/);
  assert.equal(f.state.clients, 0);
});
for (const position of ['parent', 'root', 'file', 'lock']) {
  test(`N5: junction/enlace ${position} no permite operaciones fuera de la raíz física`, async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'm6-links-'));
    const physical = path.join(dir, 'physical');
    await filesystem.mkdir(physical);
    const link = path.join(dir, 'linked');
    try {
      await filesystem.symlink(physical, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (e) {
      if (['EPERM', 'EACCES'].includes(e.code)) {
        t.skip('Plataforma no permite crear junction sintética; sin cambiar permisos');
        return;
      }
      throw e;
    }
    const owner = { ...identity, kind: 'coordinator' };
    if (position === 'parent' || position === 'root') {
      const root = position === 'parent' ? path.join(link, 'child') : link;
      const store = diskStore(root, { owner });
      await assert.rejects(store.acquire({ runId: 'unit-m6' }), /DIARIO_RUTA_INVALIDA/);
      await assert.rejects(store.pending(), /DIARIO_RUTA_INVALIDA/);
    } else {
      const root = path.join(dir, 'root');
      await filesystem.mkdir(root);
      const location =
        position === 'lock' ? path.join(root, 'piloto.lock') : path.join(root, 'unit-m6');
      await filesystem.symlink(
        physical,
        location,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const store = diskStore(root, { owner });
      if (position === 'lock') {
        await assert.rejects(store.acquire({ runId: 'unit-m6' }), /DIARIO_RUTA_INVALIDA/);
        await assert.rejects(store.release('any'), /DIARIO_RUTA_INVALIDA/);
      } else await assert.rejects(store.load('unit-m6/catalogo.json'), /DIARIO_RUTA_INVALIDA/);
    }
    assert.deepEqual(await filesystem.readdir(physical), []);
  });
}

// Lote PG: driver y catálogos inyectados. No importa pg ni abre sockets reales.
// Matriz sintética representativa del plumbing, NO sustituto del inventario canónico.
const pgMatrix = {
  migrations: ['0021_indice.sql'],
  ESPERADO: {
    curichi_api: {
      'public.categoria': ['SELECT'],
      'public.usuario': ['SELECT'],
      'geo.unidad_vecinal': [],
    },
    curichi_geo: {
      'public.categoria': ['SELECT'],
      'public.usuario': [],
      'geo.unidad_vecinal': ['SELECT'],
    },
  },
  COLUMNAS_ESPERADAS: {
    curichi_api: { 'public.usuario': { UPDATE: ['nombre'] } },
    curichi_geo: { 'public.usuario': { SELECT: [] } },
  },
};
function pgDouble(flags = {}) {
  const state = {
    loads: 0,
    constructed: 0,
    queries: [],
    raw: [],
    row: clone(original),
    lockHeld: false,
    closes: 0,
    destroyed: 0,
  };
  const parentEnv = {
    PATH: 'synthetic',
    PGOPTIONS: 'hostile',
    PGDATABASE: 'curichi',
    API_DATABASE_URL: 'unsafe',
    S3_ENDPOINT: 'remote',
    AWS_PROFILE: 'private',
    NODE_OPTIONS: 'unsafe',
  };
  class Client extends EventEmitter {
    constructor(config) {
      super();
      state.constructed++;
      this.role = new URL(config.connectionString).username;
      this.config = config;
      state.raw.push(this);
      this.connection = {
        stream: {
          destroy: () => {
            state.destroyed++;
            state.lockHeld = false;
            this.emit('end');
          },
        },
      };
      assert.deepEqual(Object.keys(parentEnv), ['PATH'], 'sanear antes de construir Client');
    }
    async connect() {
      if (flags.connect) throw Error('CONNECTION_PRIVATE_TOKEN');
    }
    async end() {
      state.closes++;
      if (flags.endHang) return new Promise(() => {});
      state.lockHeld = false;
      this.emit('end');
    }
    async query(sql, values) {
      state.queries.push({ role: this.role, sql, values });
      if (flags.intercept) {
        const result = flags.intercept(sql, values, this, state);
        if (result !== undefined) return result;
      }
      if (flags.readError && sql.includes('current_database'))
        throw Object.assign(Error('READ_PRIVATE_TOKEN'), { code: '42501' });
      if (sql === 'BEGIN' || sql === 'BEGIN READ ONLY') {
        this.pending = clone(state.row);
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        this.pending = null;
        return { rows: [] };
      }
      if (sql === 'COMMIT') {
        if (flags.commit === true || flags.commit === 'reject-before')
          throw Error('COMMIT_PRIVATE_TOKEN');
        if (flags.commit !== 'rollback') state.row = this.pending;
        this.pending = null;
        if (flags.commit === 'reject-after') throw Error('COMMIT_PRIVATE_TOKEN');
        if (flags.commit === 'no-tag') return { rows: [] };
        return { rows: [], command: flags.commit === 'rollback' ? 'ROLLBACK' : 'COMMIT' };
      }
      if (sql.includes('current_database'))
        return {
          rows: [{ database: flags.database ?? 'curichi_e2e', role: flags.role ?? this.role }],
        };
      if (sql.includes('FROM pg_roles'))
        return {
          rows: [
            {
              rolsuper: !!flags.superuser,
              rolcreaterole: false,
              rolcreatedb: false,
              rolbypassrls: false,
            },
          ],
        };
      if (sql.includes('tableowner=current_user')) return { rows: [{ n: flags.owner ? 1 : 0 }] };
      if (sql.includes('has_schema_privilege')) return { rows: [{ p: !!flags.createSchema }] };
      if (sql.includes('FROM public._migraciones'))
        return { rows: [{ nombre: flags.migration ?? '0021_indice.sql' }] };
      if (sql.includes('FROM geo.capa_version'))
        return {
          rows: (flags.layers ? [] : ['distrito_municipal', 'unidad_vecinal', 'manzana']).map(
            (capa) => ({ capa, version: 'v1', n_features: 1 }),
          ),
        };
      if (sql.includes('count(*)::integer AS n FROM geo.'))
        return { rows: [{ n: flags.layerCount ? 0 : 1 }] };
      if (sql.includes('FROM public.usuario'))
        return {
          rows: (flags.accounts
            ? ['ciudadano']
            : ['ciudadano', 'tecnico', 'admin', 'ejecutivo']
          ).map((rol) => ({ rol, n: 1 })),
        };
      if (sql.includes("schemaname || '.' || tablename"))
        return {
          rows: [
            'public.categoria',
            'public.usuario',
            'geo.unidad_vecinal',
            ...(flags.extraTable ? ['public.extra'] : []),
          ]
            .filter((t) => t !== flags.missingTable)
            .map((t) => ({ t })),
        };
      if (sql.includes('has_table_privilege')) {
        const [role, table, operation] = values;
        const p = pgMatrix.ESPERADO[role][table]?.includes(operation) ?? false;
        const change = flags.tableGrant;
        return {
          rows: [
            {
              p:
                change &&
                role === change.role &&
                table === change.table &&
                operation === change.operation
                  ? change.value
                  : p,
            },
          ],
        };
      }
      if (sql.includes('information_schema.columns')) {
        assert.deepEqual(values, ['public.usuario']);
        assert.match(
          sql,
          /table_schema=split_part\(\$1,'\.',1\).*table_name=split_part\(\$1,'\.',2\)/,
        );
        return {
          rows: ['id', 'nombre', 'email', ...(flags.extraColumn ? ['extra'] : [])]
            .filter((c) => c !== flags.missingColumn)
            .map((column_name) => ({ column_name })),
        };
      }
      if (sql.includes('has_column_privilege')) {
        const [role, table, column, operation] = values;
        const p =
          operation === 'SELECT'
            ? (pgMatrix.ESPERADO[role][table]?.includes('SELECT') ?? false)
            : (pgMatrix.COLUMNAS_ESPERADAS[role][table]?.[operation]?.includes(column) ?? false);
        const change = flags.columnGrant;
        return {
          rows: [
            {
              p:
                change &&
                role === change.role &&
                table === change.table &&
                column === change.column &&
                operation === change.operation
                  ? change.value
                  : p,
            },
          ],
        };
      }
      if (sql.includes('pg_try_advisory_lock')) {
        state.lockHeld = !flags.locked;
        return { rows: [{ ok: !flags.locked }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        state.lockHeld = false;
        return { rows: [{ ok: true }] };
      }
      if (sql.startsWith('SELECT slug,'))
        return { rows: [clone(state.row), { slug: 'inundacion', activa: true }] };
      if (sql.includes('clock_timestamp()'))
        return { rows: [{ value: '2026-10-20T11:12:13.987654Z' }] };
      if (sql.startsWith('UPDATE public.categoria')) {
        if (flags.conflict) return { rowCount: 0, rows: [] };
        this.pending = {
          slug: values[0],
          activa: values[5],
          orden: values[2],
          activada_en: values[6],
          activada_por: values[7],
        };
        return { rowCount: 1, rows: [clone(this.pending)] };
      }
      throw Error('UNEXPECTED_SQL_IN_DOUBLE');
    }
  }
  const factory = createPgFactory({
    urls,
    parentEnv,
    loadPg: async () => {
      state.loads++;
      assert.deepEqual(Object.keys(parentEnv), ['PATH']);
      return { Client };
    },
    loadInventory: async () => clone(pgMatrix),
    ...(flags.timers ? { timers: flags.timers } : {}),
  });
  return { factory, state, parentEnv };
}

test('PG lazy: tres URLs deben validar antes incluso de cargar el driver', () => {
  let loaded = 0;
  const invalid = [...urls];
  invalid[2] = invalid[2].replace('/curichi_e2e', '/curichi');
  assert.throws(
    () =>
      createPgFactory({
        urls: invalid,
        loadPg: async () => {
          loaded++;
        },
      }),
    /DESTINO_NO_PERMITIDO/,
  );
  assert.equal(loaded, 0);
});
test('PG factory rechaza una URL no aprobada sin cargar driver ni construir clientes', async () => {
  const d = pgDouble();
  assert.equal(d.state.loads, 0);
  await assert.rejects(
    d.factory(urls[0].replace('/curichi_e2e', '/curichi'), 'curichi'),
    /DESTINO_NO_PERMITIDO/,
  );
  assert.equal(d.state.loads, 0);
  assert.equal(d.state.constructed, 0);
});
for (const mode of ['piloto', 'preflight', 'grupo', 'restaurar']) {
  test(`PG factory real inyectada, coordinador ${mode} destino inválido: cero driver/Client`, async () => {
    const f = fixture();
    const d = pgDouble();
    f.deps.clientFactory = d.factory;
    const invalid = [...urls];
    invalid[2] = `${invalid[2]}?host=remote`;
    await assert.rejects(
      coordinate(optionsFor(f, mode, { urls: invalid }), f.deps),
      /DESTINO_NO_PERMITIDO/,
    );
    assert.equal(d.state.loads, 0);
    assert.equal(d.state.constructed, 0);
  });
}
test('PG inspect de los tres roles usa transacciones READ ONLY y no UPDATE', async () => {
  const d = pgDouble();
  for (const [index, role] of ['curichi', 'curichi_api', 'curichi_geo'].entries()) {
    const client = await d.factory(urls[index], role);
    await client.connect();
    await client.inspect();
    await client.end();
  }
  assert.equal(d.state.loads, 1);
  assert.equal(d.state.constructed, 3);
  assert.equal(d.state.queries.filter((q) => q.sql === 'BEGIN READ ONLY').length, 3);
  assert.equal(d.state.queries.filter((q) => q.sql === 'ROLLBACK').length, 3);
  assert.ok(d.state.queries.every((q) => /^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(q.sql)));
  for (const role of ['curichi_api', 'curichi_geo']) {
    assert.ok(
      d.state.queries.some((q) => q.sql.includes('has_table_privilege') && q.values[0] === role),
    );
    assert.ok(
      d.state.queries.some((q) => q.sql.includes('has_column_privilege') && q.values[0] === role),
    );
  }
  assert.ok(d.state.queries.some((q) => q.sql.includes('information_schema.columns')));
});
for (const [flags, role, expected] of [
  [{ database: 'curichi' }, 'curichi', 'PG_IDENTIDAD_INVALIDA'],
  [{ role: 'postgres' }, 'curichi_api', 'PG_IDENTIDAD_INVALIDA'],
  [{ superuser: true }, 'curichi_api', 'PG_PRIVILEGIOS_INVALIDOS'],
  [{ owner: true }, 'curichi_geo', 'PG_PRIVILEGIOS_INVALIDOS'],
  [{ createSchema: true }, 'curichi_geo', 'PG_PRIVILEGIOS_INVALIDOS'],
  [{ migration: '0020_anterior.sql' }, 'curichi', 'PG_MIGRACIONES_INVALIDAS'],
  [{ layers: true }, 'curichi', 'PG_CAPAS_AUSENTES'],
  [{ layerCount: true }, 'curichi', 'PG_CAPAS_AUSENTES'],
  [{ accounts: true }, 'curichi', 'PG_CUENTAS_AUSENTES'],
]) {
  test(`PG inspect rechaza precondición ${expected}/${JSON.stringify(flags)}`, async () => {
    const d = pgDouble(flags);
    const client = await d.factory(
      urls[['curichi', 'curichi_api', 'curichi_geo'].indexOf(role)],
      role,
    );
    await client.connect();
    await assert.rejects(client.inspect(), new RegExp(expected));
    await client.end();
    assert.ok(d.state.queries.some((q) => q.sql === 'ROLLBACK'));
    assert.ok(!d.state.queries.some((q) => q.sql.startsWith('UPDATE')));
  });
}
test('PG CAS compara cinco campos, conserva seis decimales y confirma COMMIT antes de resolver', async () => {
  const d = pgDouble();
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  await client.inspect();
  await client.lock();
  const after = { ...original, activa: true, activada_en: '2026-10-20T11:12:13.987654Z' };
  await client.cas(original, after);
  const update = d.state.queries.find((q) => q.sql.startsWith('UPDATE'));
  assert.deepEqual(update.values, [
    original.slug,
    original.activa,
    original.orden,
    original.activada_en,
    original.activada_por,
    true,
    after.activada_en,
    null,
  ]);
  assert.match(update.sql, /WHERE slug=\$1 AND activa=\$2 AND orden=\$3/);
  assert.match(update.sql, /activada_en IS NOT DISTINCT FROM \$4::timestamptz/);
  assert.match(update.sql, /activada_por IS NOT DISTINCT FROM \$5::uuid/);
  assert.match(update.sql, /HH24:MI:SS.US/);
  assert.deepEqual(d.state.row, after);
  assert.equal(d.state.queries.at(-1).sql, 'COMMIT');
  await client.unlock();
  await client.end();
});
for (const flags of [{}, { locked: true }]) {
  test(`PG CAS sin advisory no emite UPDATE ${JSON.stringify(flags)}`, async () => {
    const d = pgDouble(flags);
    const client = await d.factory(urls[0], 'curichi');
    await client.connect();
    if (flags.locked) await assert.rejects(client.lock(), /PG_LOCK_FALLO/);
    await assert.rejects(client.cas(original, { ...original, activa: true }), /PG_SESSION_LOST/);
    assert.ok(!d.state.queries.some((q) => q.sql.startsWith('UPDATE')));
    await client.end();
  });
}
test('PG CAS rowCount cero hace ROLLBACK sin COMMIT', async () => {
  const d = pgDouble({ conflict: true });
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  await client.lock();
  await assert.rejects(client.cas(original, { ...original, activa: true }), /CATALOGO_CONFLICTO/);
  assert.equal(d.state.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!d.state.queries.some((q) => q.sql === 'COMMIT'));
  await client.unlock();
  await client.end();
});
test('PG COMMIT incierto emite pérdida saneada y no permite otro CAS por sesión muerta', async () => {
  const d = pgDouble({ commit: true });
  const client = await d.factory(urls[0], 'curichi');
  let loss;
  client.on('error', (e) => {
    loss = e.message;
  });
  await client.connect();
  await client.lock();
  await assert.rejects(client.cas(original, { ...original, activa: true }), /PG_COMMIT_INCIERTO/);
  assert.equal(loss, 'PG_SESSION_LOST');
  const count = d.state.queries.length;
  await assert.rejects(client.cas(original, { ...original, activa: true }), /PG_SESSION_LOST/);
  assert.equal(d.state.queries.length, count);
  await client.end();
});
test('PG catálogo y reloj entregan texto SQL, nunca Date truncada', async () => {
  const d = pgDouble();
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  assert.equal((await client.catalog())[0].activada_en, original.activada_en);
  assert.equal(await client.timestamp(), '2026-10-20T11:12:13.987654Z');
  assert.ok(d.state.queries.every((q) => q.sql.includes('to_char')));
  await client.end();
});
test('PG inspect no propaga mensaje privado del driver', async () => {
  const d = pgDouble({ readError: true });
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  await assert.rejects(
    client.inspect(),
    (e) => e.message === 'PG_LECTURA_FALLO' && !e.stack.includes('READ_PRIVATE_TOKEN'),
  );
  await client.end();
});

for (const flags of [
  { missingTable: 'public.categoria' },
  { missingColumn: 'nombre' },
  ...['curichi_api', 'curichi_geo'].flatMap((role) => [
    { tableGrant: { role, table: 'public.categoria', operation: 'SELECT', value: false } },
    { tableGrant: { role, table: 'public.categoria', operation: 'DELETE', value: true } },
    {
      extraTable: true,
      tableGrant: { role, table: 'public.extra', operation: 'SELECT', value: true },
    },
    {
      columnGrant: {
        role,
        table: 'public.usuario',
        column: 'email',
        operation: role === 'curichi_api' ? 'UPDATE' : 'SELECT',
        value: true,
      },
    },
    {
      extraColumn: true,
      columnGrant: {
        role,
        table: 'public.usuario',
        column: 'extra',
        operation: role === 'curichi_api' ? 'UPDATE' : 'SELECT',
        value: true,
      },
    },
  ]),
  {
    columnGrant: {
      role: 'curichi_api',
      table: 'public.usuario',
      column: 'nombre',
      operation: 'UPDATE',
      value: false,
    },
  },
]) {
  test(`PG matriz no vacía: coordinador aborta READ ONLY sin segundo Client ni UPDATE ${JSON.stringify(flags)}`, async () => {
    const f = fixture();
    const d = pgDouble(flags);
    f.deps.clientFactory = d.factory;
    await assert.rejects(coordinate(f.options, f.deps), /PG_PRIVILEGIOS_INVALIDOS/);
    assert.equal(d.state.constructed, 1);
    assert.equal(d.state.queries[0].sql, 'BEGIN READ ONLY');
    assert.equal(d.state.queries.at(-1).sql, 'ROLLBACK');
    assert.ok(d.state.queries.every((q) => /^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(q.sql)));
    assert.equal(f.state.journal, null);
  });
}
test('PG tabla/columna adicionales sin grants no se confunden con privilegios ampliados', async () => {
  const d = pgDouble({ extraTable: true, extraColumn: true });
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  await client.inspect();
  await client.end();
});
for (const commit of ['rollback', 'no-tag', 'reject-before', 'reject-after']) {
  test(`PG COMMIT ${commit}: coordinador conserva prepared y exige recovery explícita`, async () => {
    const flags = { commit };
    const f = fixture();
    const d = pgDouble(flags);
    f.deps.clientFactory = d.factory;
    await assert.rejects(coordinate(f.options, f.deps), /RECUPERACION_REQUERIDA/);
    assert.equal(f.state.journal.state, 'prepared');
    assert.ok(!f.state.calls.includes('browser'));
    const queries = d.state.queries;
    const index = queries.findIndex((q) => q.sql === 'COMMIT');
    assert.ok(index > 0);
    assert.equal(index, queries.length - 1, 'no catalog/unlock/CAS tras COMMIT incierto');
    assert.equal(d.state.lockHeld, false, 'la conexión propia termina');
    flags.commit = undefined;
    await coordinate(optionsFor(f, 'restaurar'), f.deps);
    await coordinate(optionsFor(f, 'restaurar'), f.deps);
    assert.equal(f.state.journal.state, 'restored');
    assert.deepEqual(d.state.row, original);
  });
}

function manualPgTimers() {
  let sequence = 0;
  const pending = new Map();
  return {
    setTimeout(callback, duration) {
      const id = ++sequence;
      pending.set(id, { callback, duration });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    expire(duration) {
      const item = [...pending].find(([, entry]) => entry.duration === duration);
      assert.ok(item, `deadline ${duration} armado`);
      pending.delete(item[0]);
      item[1].callback();
    },
    get size() {
      return pending.size;
    },
  };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
for (const phase of ['UPDATE', 'COMMIT', 'restore']) {
  for (const interruption of ['deadline', 'cancel', 'driver-timeout', 'server-cancel', 'EPIPE']) {
    test(`PG ${phase}/${interruption}: handler real del adaptador invalida sesión; resultado tardío no reabre CAS`, async () => {
      const timers = manualPgTimers();
      const gate = deferred();
      const entered = deferred();
      let intercepted = false;
      const f = fixture();
      const flags = {
        timers,
        endHang: true,
        intercept(sql, values) {
          const selected =
            phase === 'COMMIT'
              ? sql === 'COMMIT'
              : sql.startsWith('UPDATE') && (phase !== 'restore' || values[5] === false);
          if (!selected || intercepted) return undefined;
          intercepted = true;
          entered.resolve();
          return gate.promise;
        },
      };
      const d = pgDouble(flags);
      let owner;
      f.deps.clientFactory = async (...args) => {
        const c = await d.factory(...args);
        if (args[1] === 'curichi') owner = c;
        return c;
      };
      const running = coordinate(f.options, f.deps);
      // Instalar observador inmediatamente: no rechazo sin manejar durante el cierre simulado.
      const rejected = assert.rejects(running, /RECUPERACION_REQUERIDA/);
      await entered.promise;
      assert.equal(d.state.lockHeld, true);
      if (interruption === 'deadline') timers.expire(15_000);
      else if (interruption === 'cancel') owner.cancel();
      else
        gate.reject(
          Object.assign(
            Error('PRIVATE_QUERY_TEXT'),
            interruption === 'server-cancel'
              ? { code: '57014' }
              : interruption === 'EPIPE'
                ? { code: 'EPIPE' }
                : {},
          ),
        );
      // Procesar solo microtareas de dobles; ningún reloj real, proceso ni PG.
      for (let turn = 0; turn < 30; turn++) await Promise.resolve();
      const count = d.state.queries.length;
      await assert.rejects(owner.cas(original, { ...original, activa: true }), /PG_SESSION_LOST/);
      assert.equal(d.state.queries.length, count);
      assert.equal(
        d.state.lockHeld,
        true,
        'invalidar flags no demuestra liberación del lock físico',
      );
      for (let turn = 0; turn < 4; turn++) {
        if (!timers.size) break;
        timers.expire(5_000);
        for (let tick = 0; tick < 30; tick++) await Promise.resolve();
      }
      await rejected;
      assert.ok(d.state.destroyed > 0);
      assert.equal(d.state.lockHeld, false);
      assert.equal(f.state.journal.state, phase === 'restore' ? 'applied' : 'prepared');
      gate.resolve({ command: 'COMMIT', rowCount: 1, rows: [{ ...original, activa: true }] });
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      assert.equal(
        d.state.queries.length,
        count,
        'ni resultado tardío ni cleanup reutilizan sesión',
      );
      flags.endHang = false;
      flags.intercept = undefined;
      await coordinate(optionsFor(f, 'restaurar'), f.deps);
      assert.equal(f.state.journal.state, 'restored');
      assert.deepEqual(d.state.row, original);
    });
  }
}

test('artefactos de listado/grupo en raíz hermana permiten siguiente corrida; diario incompleto bloquea', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-artifact-separation-'));
  const journals = path.join(root, 'piloto-m6');
  const artifacts = path.join(root, 'piloto-m6-artefactos');
  const f = fixture();
  const store = diskStore(journals, {
    owner: { ...identity, kind: 'coordinator' },
    alive: async () => false,
  });
  f.deps.store = store;
  for (const label of ['listado', 'G1', 'G2']) {
    const dir = path.join(artifacts, label);
    await filesystem.mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'playwright.json'), JSON.stringify({ synthetic: true, label }));
    assert.deepEqual(await store.pending(), []);
    if (label !== 'listado')
      await coordinate({ ...optionsFor(f, 'grupo'), group: label, runId: `unit-${label}` }, f.deps);
  }
  await coordinate({ ...optionsFor(f, 'grupo'), group: 'G3', runId: 'next-run' }, f.deps);
  assert.deepEqual(await store.pending(), []);
  await filesystem.mkdir(path.join(journals, 'incomplete-run'));
  assert.deepEqual(await store.pending(), ['incomplete-run']);
  const before = f.state.clients;
  await assert.rejects(
    coordinate({ ...f.options, runId: 'blocked-next' }, f.deps),
    /DIARIO_PENDIENTE/,
  );
  assert.equal(f.state.clients, before);
});

// N8: el lector y el escritor son los mismos helpers que empleará el runtime/spec.
async function mailboxFixture(extra = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-control-'));
  const runId = 'unit-mailbox';
  const directory = path.join(root, runId, 'control');
  await filesystem.mkdir(directory, { recursive: true });
  const nonce = randomUUID();
  const request = { schema: 1, runId, nonce, project: 'chromium', action: 'estado' };
  const response = { schema: 1, runId, nonce, ok: true, phase: 'applied', database: 'curichi_e2e' };
  return {
    root,
    directory,
    runId,
    nonce,
    request,
    response,
    channel: createControlChannel({ directory, runId, ...extra }),
  };
}
for (const kind of ['request', 'response']) {
  test(`N8 publicación ${kind}: lector jamás observa escritura parcial, sync y close preceden rename`, async () => {
    const f = await mailboxFixture();
    const calls = [];
    const absent = async () => {
      assert.equal(await f.channel.read(kind, f.nonce), null);
      assert.deepEqual(await f.channel.requests(), []);
    };
    const operations = {
      ...filesystem,
      async open(file, flags) {
        assert.match(file, /\.pending$/);
        assert.equal(flags, 'wx');
        const handle = await filesystem.open(file, flags);
        return {
          async writeFile(text) {
            const middle = Math.floor(text.length / 2);
            await handle.writeFile(text.slice(0, middle));
            await absent();
            await handle.writeFile(text.slice(middle));
            calls.push('write');
            await absent();
          },
          async sync() {
            await handle.sync();
            calls.push('sync');
            await absent();
          },
          async close() {
            await handle.close();
            calls.push('close');
            await absent();
          },
        };
      },
      async rename(from, to) {
        assert.deepEqual(calls, ['write', 'sync', 'close']);
        await absent();
        await filesystem.rename(from, to);
        calls.push('rename');
      },
    };
    const writer = createControlChannel({ directory: f.directory, runId: f.runId, operations });
    const value = kind === 'request' ? f.request : f.response;
    await writer.publish(kind, value);
    assert.deepEqual(calls, ['write', 'sync', 'close', 'rename']);
    assert.deepEqual(await f.channel.read(kind, f.nonce), value);
    assert.deepEqual(await f.channel.requests(), kind === 'request' ? [f.nonce] : []);
  });
  for (const operation of ['write', 'sync', 'close', 'rename']) {
    test(`N8 ${kind}/${operation} fallido: ningún nombre final; pending preservado sin procesar`, async () => {
      const f = await mailboxFixture();
      const operations = {
        ...filesystem,
        async open(...args) {
          const handle = await filesystem.open(...args);
          return {
            async writeFile(text) {
              await handle.writeFile(operation === 'write' ? text.slice(0, 12) : text);
              if (operation === 'write') throw Error('INJECTED_WRITE');
            },
            async sync() {
              await handle.sync();
              if (operation === 'sync') throw Error('INJECTED_SYNC');
            },
            async close() {
              await handle.close();
              if (operation === 'close') throw Error('INJECTED_CLOSE');
            },
          };
        },
        async rename(...args) {
          if (operation === 'rename') throw Error('INJECTED_RENAME');
          await filesystem.rename(...args);
        },
      };
      const writer = createControlChannel({ directory: f.directory, runId: f.runId, operations });
      await assert.rejects(writer.publish(kind, kind === 'request' ? f.request : f.response));
      assert.equal(await f.channel.read(kind, f.nonce), null);
      assert.deepEqual(await f.channel.requests(), []);
      assert.ok((await filesystem.readdir(f.directory)).some((name) => name.endsWith('.pending')));
    });
  }
  for (const field of ['nonce', 'runId']) {
    test(`N8 ${kind}: rechaza identidad ${field} divergente sin procesar mensaje`, async () => {
      const f = await mailboxFixture();
      const value = {
        ...(kind === 'request' ? f.request : f.response),
        [field]: field === 'nonce' ? randomUUID() : 'other-run',
      };
      // Canonical adulterado deliberadamente por el doble de un tercero.
      await writeFile(path.join(f.directory, `${f.nonce}.${kind}.json`), JSON.stringify(value));
      await assert.rejects(f.channel.read(kind, f.nonce), /CONTROL_INVALIDO/);
    });
  }
  test(`N8 ${kind}: aborto entre sync/publicación impide rename y preserva temporal`, async () => {
    const f = await mailboxFixture();
    const controller = new AbortController();
    const operations = {
      ...filesystem,
      async open(...args) {
        const handle = await filesystem.open(...args);
        return {
          writeFile: (...values) => handle.writeFile(...values),
          close: () => handle.close(),
          async sync() {
            await handle.sync();
            controller.abort();
          },
        };
      },
    };
    const writer = createControlChannel({ directory: f.directory, runId: f.runId, operations });
    await assert.rejects(
      writer.publish(kind, kind === 'request' ? f.request : f.response, {
        signal: controller.signal,
      }),
      /CONTROL_CANCELADO/,
    );
    assert.equal(await f.channel.read(kind, f.nonce), null);
    assert.ok((await filesystem.readdir(f.directory)).some((name) => name.endsWith('.pending')));
  });
}
test('N8 request espera respuesta correcta y aborto real cancela espera sin aceptar respuesta posterior', async () => {
  const waiting = deferred();
  let scheduled;
  const controller = new AbortController();
  const timers = {
    setTimeout(callback) {
      scheduled = callback;
      waiting.resolve();
      return 1;
    },
    clearTimeout() {
      scheduled = null;
    },
  };
  const f = await mailboxFixture({ timers });
  const rejected = assert.rejects(
    f.channel.request(f.request, { signal: controller.signal }),
    /CONTROL_CANCELADO/,
  );
  await waiting.promise;
  controller.abort();
  await rejected;
  await f.channel.publish('response', f.response);
  await assert.rejects(
    f.channel.read('response', f.nonce, { signal: controller.signal }),
    /CONTROL_CANCELADO/,
  );
  assert.equal(scheduled, null);
});
test('N8 request correcto usa publicación compartida; timeout no extiende el plazo', async () => {
  let clock = 0;
  const timers = {
    setTimeout(callback, delay) {
      clock += delay;
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
  };
  const f = await mailboxFixture({ timers, now: () => clock });
  await f.channel.publish('response', f.response);
  assert.deepEqual(await f.channel.request(f.request), f.response);
  const next = { ...f.request, nonce: randomUUID() };
  await assert.rejects(f.channel.request(next, { timeoutMs: 150 }), /CONTROL_TIMEOUT/);
  assert.equal(clock, 150);
});
test('CLI --restaurar proyecto-relativo normaliza hacia raíz y coordinate carga exactamente esa ruta', async () => {
  const f = fixture();
  await coordinate(f.options, f.deps);
  const projectRoot = path.resolve('synthetic-project');
  const options = prepareCli(
    ['--restaurar', '.turbo/piloto-m6/unit-m6/catalogo.json'],
    {
      DATABASE_URL: syntheticUrl('curichi', 'curichi'),
      API_DB_PASSWORD: inertPassword,
      GEO_DB_PASSWORD: inertPassword,
    },
    projectRoot,
  );
  const expected = path.join(projectRoot, '.turbo/piloto-m6/unit-m6/catalogo.json');
  assert.equal(options.journalPath, expected);
  const load = f.deps.store.load;
  f.deps.store.load = async (input) => {
    assert.equal(input, expected);
    return load(input);
  };
  assert.equal((await coordinate(options, f.deps)).status, 'RESTORED');
});
for (const input of [
  '../outside/catalogo.json',
  '.turbo/piloto-m6/../outside/catalogo.json',
  '.turbo/piloto-m6/unit-m6/../../catalogo.json',
  '.turbo/piloto-m6/unit-m6/catalogo.json?x',
  '.turbo/otra/unit-m6/catalogo.json',
]) {
  test(`CLI recuperación rechaza escape antes de load/Client: ${input}`, () => {
    let reached = false;
    assert.throws(() => {
      normalizeRecoveryPath(input, path.resolve('synthetic-project'));
      reached = true;
    }, /DIARIO_RUTA_INVALIDA/);
    assert.equal(reached, false);
  });
}

test('PG consultas auxiliares son READ ONLY, parametrizadas y requieren sesión/lock propio', async () => {
  const id = randomUUID();
  const points = { lat1: -17.7, lon1: -63.2, lat2: -17.8, lon2: -63.1 };
  const d = pgDouble({
    intercept(sql, values) {
      if (sql.includes('FROM public.reporte_foto'))
        return { rows: [{ objeto_key: `${id}.webp`, bytes: 7 }] };
      if (sql.includes('WITH candidates AS')) {
        assert.match(sql, /ST_Transform\(r.geom,32720\)/);
        return { rows: [points] };
      }
      if (sql.includes('left(descripcion,length($3))')) {
        assert.equal(values[0], id);
        return { rows: [{ id }] };
      }
      if (sql.includes('FROM public.reporte own')) {
        assert.deepEqual(values, [id, [id]]);
        return { rows: [{ ok: true }] };
      }
      return undefined;
    },
  });
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  await assert.rejects(client.scenario(), /PG_SESSION_LOST/);
  await client.lock();
  const start = d.state.queries.length;
  await client.photoRefs();
  assert.deepEqual(await client.scenario(), {
    chromium: { lat: points.lat1, lon: points.lon1 },
    movil: { lat: points.lat2, lon: points.lon2 },
  });
  await client.fixture(id, 'bache', 'M6 unit chromium', { lat: points.lat1, lon: points.lon1 });
  await client.isolated(id, [id]);
  const queries = d.state.queries.slice(start);
  assert.equal(queries.filter((q) => q.sql === 'BEGIN READ ONLY').length, 4);
  assert.equal(queries.filter((q) => q.sql === 'ROLLBACK').length, 4);
  assert.ok(queries.every((q) => /^(SELECT|WITH candidates|BEGIN READ ONLY|ROLLBACK)/.test(q.sql)));
  await client.unlock();
  await client.end();
});
test('PG aislamiento no concede permiso ante otro reporte cercano ni escenario vacío', async () => {
  const d = pgDouble({
    intercept(sql) {
      if (sql.includes('WITH candidates AS')) return { rows: [] };
      if (sql.includes('FROM public.reporte own')) return { rows: [{ ok: false }] };
      return undefined;
    },
  });
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  await client.lock();
  await assert.rejects(client.scenario(), /ESCENARIO_AUSENTE/);
  const id = randomUUID();
  await assert.rejects(client.isolated(id, [id]), /AISLAMIENTO_FALLO/);
  assert.ok(!d.state.queries.some((q) => q.sql.startsWith('UPDATE')));
  await client.unlock();
  await client.end();
});
async function photoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-photo-'));
  const source = path.join(root, '.turbo/m6-2026-10-18/fb/fotos');
  await filesystem.mkdir(source, { recursive: true });
  const key = `${randomUUID()}.webp`;
  const data = Buffer.from('inert-photo');
  await writeFile(path.join(source, key), data);
  return {
    root,
    source,
    key,
    data,
    client: { photoRefs: async () => [{ objeto_key: key, bytes: data.length }] },
  };
}
test('storage inspect no escribe, preparar copia con exclusión y conserva originales', async () => {
  const f = await photoFixture();
  let copied = 0;
  let made = 0;
  const operations = {
    ...filesystem,
    async mkdir(...args) {
      made++;
      return filesystem.mkdir(...args);
    },
    async copyFile(...args) {
      copied++;
      assert.equal(args[2], 1);
      return filesystem.copyFile(...args);
    },
  };
  const storage = createPhotoStorage({
    projectRoot: f.root,
    runId: 'own-run',
    operations,
    minFreeBytes: 0,
  });
  const inspected = await storage.inspect(f.client);
  assert.equal(inspected.readOnly, true);
  assert.equal(copied, 0);
  assert.equal(made, 0);
  await storage.prepare();
  assert.equal(copied, 1);
  assert.deepEqual(await readFile(path.join(storage.destination, f.key)), f.data);
  assert.deepEqual(await readFile(path.join(f.source, f.key)), f.data);
  await assert.rejects(storage.prepare(), (e) => e.code === 'EEXIST');
});
for (const variant of ['missing', 'size', 'disk', 'path']) {
  test(`storage ${variant}: aborta preflight sin copia ni reparación`, async () => {
    const f = await photoFixture();
    const client = {
      photoRefs: async () => [
        {
          objeto_key:
            variant === 'missing'
              ? `${randomUUID()}.webp`
              : variant === 'path'
                ? '../outside.webp'
                : f.key,
          bytes: f.data.length + (variant === 'size' ? 1 : 0),
        },
      ],
    };
    const operations = {
      ...filesystem,
      async mkdir() {
        assert.fail('preflight no crea directorios');
      },
      async copyFile() {
        assert.fail('preflight no copia fotos');
      },
      ...(variant === 'disk' ? { statfs: async () => ({ bavail: 0, bsize: 1 }) } : {}),
    };
    const storage = createPhotoStorage({
      projectRoot: f.root,
      runId: 'own-run',
      operations,
      minFreeBytes: 0,
    });
    await assert.rejects(storage.inspect(client), /ALMACEN_AUSENTE/);
    assert.deepEqual(await readFile(path.join(f.source, f.key)), f.data);
  });
}

function launcherDouble({ failedRecord, failedSpawn } = {}) {
  const calls = [];
  const children = [];
  let pid = 200;
  const host = {
    async identify(value, kind) {
      return { ...identity, pid: value, kind };
    },
    async stop(id) {
      calls.push(`stop-${id.kind}`);
      const child = children.find((c) => c.pid === id.pid);
      if (child) {
        child.exitCode = 0;
        child.emit('exit', 0);
      }
    },
    async guard(minimum, own) {
      assert.equal(minimum, 2500);
      assert.deepEqual(
        own,
        children.slice(0, 4).map((c) => c.pid),
      );
      calls.push('guard');
    },
  };
  const launcher = createLauncher({
    projectRoot: path.resolve('synthetic-project'),
    runId: 'unit-launch',
    host,
    spawn(_module, args, options) {
      const kind = args[1];
      const child = Object.assign(new EventEmitter(), {
        pid: ++pid,
        connected: true,
        exitCode: null,
        signalCode: null,
        disconnect() {
          this.connected = false;
          this.exitCode = 2;
          calls.push(`disconnect-${kind}`);
        },
        send() {
          calls.push(`go-${kind}`);
          if (kind === 'playwright')
            queueMicrotask(() => {
              child.exitCode = 0;
              child.emit('exit', 0);
            });
        },
      });
      assert.equal(options.shell, undefined);
      assert.equal(options.windowsHide, true);
      assert.deepEqual(options.execArgv, []);
      children.push(child);
      calls.push(`spawn-${kind}`);
      queueMicrotask(() =>
        child.emit(
          failedSpawn === kind ? 'error' : 'message',
          failedSpawn === kind ? Error('PRIVATE_SPAWN') : { ready: true },
        ),
      );
      return child;
    },
    fetcher: async (url) => {
      calls.push(url.endsWith('/ready') ? 'ready-probe-writes-own-storage' : 'health');
      return { ok: true, json: async () => ({ db: 'ok', geo: 'ok', fotos: 'ok' }) };
    },
    operations: {
      access: async () => {},
      readdir: async () => ['chromium-123'],
      mkdir: async () => {},
    },
    ports: async () => {
      calls.push('ports-final');
    },
  });
  const record = async (id) => {
    calls.push(`record-${id.kind}`);
    if (failedRecord === id.kind) throw Error('FSYNC_FALLO');
  };
  return { launcher, calls, children, record };
}
test('launcher: registro antecede go por cada proceso, readiness posterior y Chromium solo hijo', async () => {
  const d = launcherDouble();
  await d.launcher.services({ api: {}, geo: {}, web: {}, panel: {} }, d.record);
  await d.launcher.browser(
    { PLAYWRIGHT_BROWSERS_PATH: path.resolve('synthetic-browser') },
    d.record,
  );
  for (const kind of ['geo', 'api', 'web', 'panel', 'playwright'])
    assert.ok(d.calls.indexOf(`record-${kind}`) < d.calls.indexOf(`go-${kind}`));
  assert.ok(d.calls.indexOf('go-api') < d.calls.indexOf('ready-probe-writes-own-storage'));
  await d.launcher.stop(d.launcher.owned);
  assert.equal(d.calls.at(-1), 'ports-final');
});
for (const failedRecord of ['geo', 'api', 'web', 'panel']) {
  test(`launcher fallo registro ${failedRecord}: sin go y cierre solo identidades propias`, async () => {
    const d = launcherDouble({ failedRecord });
    await assert.rejects(
      d.launcher.services({ api: {}, geo: {}, web: {}, panel: {} }, d.record),
      /SPAWN_PARCIAL/,
    );
    assert.ok(!d.calls.includes(`go-${failedRecord}`));
    assert.ok(d.calls.includes(`disconnect-${failedRecord}`));
    await d.launcher.stop(d.launcher.owned);
    assert.ok(d.calls.includes(`stop-${failedRecord}`));
  });
}
test('worker real gated: disconnect antes de go termina sin importar producto/abrir PG', async () => {
  const runId = `unit-gate-${randomUUID()}`;
  const child = fork(new URL('./piloto-m6.mjs', import.meta.url), ['--worker', 'api', runId], {
    execArgv: [],
    env: { ...sanitizeEnvironment(process.env), M6_PILOTO_RUN_ID: runId },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const exit = new Promise((resolve) => child.once('exit', resolve));
  try {
    await new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', () => reject(Error('WORKER_EARLY_EXIT')));
    });
    child.disconnect();
    assert.equal(await exit, 2);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
test('Windows host: identidad divergente impide kill; guardas RAM/pesado siguen cerradas', async () => {
  const row = {
    pid: 123,
    parent: 1,
    created: identity.created,
    exe: 'C:\\runtime\\node.exe',
    command: 'node worker unit',
  };
  let snapshot = { freeMiB: 3000, processes: [row] };
  const killed = [];
  const host = windowsHost({
    platform: 'win32',
    execute: async () => ({ stdout: JSON.stringify(snapshot) }),
    kill: (pid) => {
      killed.push(pid);
      snapshot = { ...snapshot, processes: snapshot.processes.filter((p) => p.pid !== pid) };
    },
  });
  const own = await host.identify(123, 'api');
  await host.guard(2500);
  snapshot.processes[0] = { ...row, command: 'foreign' };
  await assert.rejects(host.stop(own), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.deepEqual(killed, []);
  snapshot = { freeMiB: 1000, processes: [row] };
  await assert.rejects(host.guard(1500), /MEMORIA_INSUFICIENTE/);
  snapshot = { freeMiB: 3000, processes: [{ ...row, command: 'node vitest' }] };
  await assert.rejects(host.guard(1500), /PESADO_AJENO/);
  snapshot = { freeMiB: 3000, processes: [row] };
  await host.stop(own);
  assert.deepEqual(killed, [123]);
});

for (const ownerLost of [false, true]) {
  test(`N9 runtime/control real con dobles PG/launcher: ownerLost=${ownerLost} cierra y ${ownerLost ? 'preserva pending' : 'restaura'}`, async () => {
    const f = fixture();
    const root = await mkdtemp(path.join(os.tmpdir(), 'm6-runtime-'));
    const browserPath = path.join(root, 'browser-double');
    const browserAbort = new AbortController();
    const point = { lat: -17.7, lon: -63.2 };
    const id = randomUUID();
    let stopped = 0;
    const factory = f.deps.clientFactory;
    const runtime = await createRuntime({
      projectRoot: root,
      options: f.options,
      sourceEnv: {},
      inheritedEnv: { PGOPTIONS: 'hostile', AWS_PROFILE: 'hostile' },
      browserPath,
      host: { identify: async () => ({ ...identity, kind: 'coordinator' }) },
      store: f.deps.store,
      pgFactory: async (...args) => {
        const client = await factory(...args);
        client.scenario = async () => ({ chromium: point, movil: { lat: -17.8, lon: -63.1 } });
        client.fixture = async () => {};
        client.isolated = async () => {
          if (ownerLost) client.emit('error', Error('PRIVATE_SESSION'));
          throw Error('AISLAMIENTO_FALLO');
        };
        return client;
      },
      photoStorage: {
        destination: path.join(root, 'own-photos'),
        inspect: async () => {},
        prepare: async () => {},
      },
      ports: async () => {},
      operations: {
        ...filesystem,
        access: async () => {},
        readdir: async (file) =>
          file === browserPath ? ['chromium-123'] : filesystem.readdir(file),
      },
      launcher: {
        async services(envs, record) {
          assert.equal(envs.api.NODE_ENV, 'test');
          assert.equal(envs.web.NODE_ENV, 'production');
          assert.equal(envs.api.DATABASE_URL, urls[1]);
          assert.equal(envs.geo.DATABASE_URL, urls[2]);
          assert.equal(envs.api.AWS_PROFILE, undefined);
          assert.equal(envs.api.S3_ENDPOINT, '');
          for (const [index, kind] of ['geo', 'api', 'web', 'panel'].entries())
            await record({ ...identity, pid: 300 + index, kind });
        },
        async browser(env, record) {
          assert.equal(env.PGOPTIONS, undefined);
          assert.equal(env.AWS_PROFILE, undefined);
          assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, browserPath);
          await record({ ...identity, pid: 304, kind: 'playwright' });
          const channel = createControlChannel({
            directory: path.join(root, '.turbo/piloto-m6-artefactos/unit-m6/control'),
            runId: 'unit-m6',
          });
          await channel.request(
            {
              schema: 1,
              runId: 'unit-m6',
              nonce: randomUUID(),
              project: 'chromium',
              action: 'registrar',
              id,
              categoria: 'bache',
            },
            { signal: browserAbort.signal },
          );
          await channel.request(
            {
              schema: 1,
              runId: 'unit-m6',
              nonce: randomUUID(),
              project: 'chromium',
              action: 'aislamiento',
              id,
              categoria: 'bache',
            },
            { signal: browserAbort.signal },
          );
        },
        async stop(ids) {
          stopped++;
          assert.ok(ids.every((entry) => entry.pid >= 300 && entry.pid <= 304));
          browserAbort.abort();
        },
      },
    });
    await assert.rejects(
      coordinate(f.options, runtime.deps),
      ownerLost ? /RECUPERACION_REQUERIDA/ : /AISLAMIENTO_FALLO/,
    );
    assert.ok(stopped >= 1);
    assert.equal(f.state.journal.state, ownerLost ? 'applied' : 'restored');
    assert.equal(f.state.row.activa, ownerLost);
    assert.equal(f.state.calls.filter((call) => call === 'cas').length, ownerLost ? 1 : 2);
  });
}
test('controlador valida fixture/registro antes de prueba métrica; respuesta final lleva nonce y corrida', async () => {
  const f = await mailboxFixture();
  const id = randomUUID();
  const calls = [];
  const server = createControlServer({
    channel: f.channel,
    runId: f.runId,
    points: { chromium: { lat: -17.7, lon: -63.2 } },
    phase: () => 'applied',
    client: {
      fixture: async (...args) => {
        calls.push(['fixture', ...args]);
      },
      isolated: async (...args) => {
        calls.push(['isolated', ...args]);
      },
    },
  });
  await f.channel.publish('request', { ...f.request, action: 'registrar', id, categoria: 'bache' });
  await server.poll();
  assert.equal((await f.channel.read('response', f.nonce)).id, id);
  const next = randomUUID();
  await f.channel.publish('request', {
    ...f.request,
    nonce: next,
    action: 'aislamiento',
    id,
    categoria: 'bache',
  });
  await server.poll();
  assert.deepEqual(calls.at(-1), ['isolated', id, [id]]);
  assert.deepEqual(await f.channel.read('response', next), {
    schema: 1,
    runId: f.runId,
    nonce: next,
    ok: true,
    aislado: true,
    metodo: 'postgis_crs_metrico',
    id,
    categoria: 'bache',
  });
});
test('CLI guardas y revisión anterior a runtime: cero fábrica ante destino inválido o corte no auditado', async () => {
  const sourceEnv = {
    DATABASE_URL: syntheticUrl('curichi', 'curichi'),
    API_DB_PASSWORD: inertPassword,
    GEO_DB_PASSWORD: inertPassword,
  };
  let factories = 0;
  let reviews = 0;
  const runtimeFactory = async () => {
    factories++;
    assert.fail('no crear runtime');
  };
  await assert.rejects(
    runCli(['--preflight'], {
      sourceEnv: {
        ...sourceEnv,
        DATABASE_URL: syntheticUrl('curichi', 'curichi').replace('127.0.0.1', 'remote.invalid'),
      },
      runtimeFactory,
      review: async () => {
        reviews++;
      },
    }),
    /DESTINO_NO_PERMITIDO/,
  );
  assert.equal(reviews, 0);
  assert.equal(factories, 0);
  await assert.rejects(
    runCli(['--preflight'], {
      sourceEnv,
      runtimeFactory,
      review: async () => {
        reviews++;
        throw Error('ADAPTADORES_NO_REVISADOS');
      },
    }),
    /ADAPTADORES_NO_REVISADOS/,
  );
  assert.equal(reviews, 1);
  assert.equal(factories, 0);
});
test('CLI positivo preflight atraviesa coordinate con dobles; sin launcher ni reparación', async () => {
  const f = fixture();
  let guard;
  const result = await runCli(['--preflight'], {
    sourceEnv: {
      DATABASE_URL: syntheticUrl('curichi', 'curichi'),
      API_DB_PASSWORD: inertPassword,
      GEO_DB_PASSWORD: inertPassword,
    },
    inheritedEnv: { PATH: 'synthetic', PGOPTIONS: 'hostile', S3_ENDPOINT: 'hostile' },
    host: {
      guard: async (minimum) => {
        guard = minimum;
      },
    },
    review: async () => {},
    runtimeFactory: async ({ options }) => {
      assert.equal(options.inheritedEnv.PGOPTIONS, undefined);
      return { deps: f.deps, finish: async () => {} };
    },
  });
  assert.equal(result.status, 'READ_ONLY');
  assert.equal(guard, 1500);
  assert.equal(f.state.clients, 3);
  assert.ok(!f.state.calls.some((call) => call === 'cas' || call.startsWith('spawn')));
});
test('receipt ausente o hash de cinco fuentes diferente mantiene CLI cerrada', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-review-'));
  await assert.rejects(verifyRuntimeReview(root), /ADAPTADORES_NO_REVISADOS/);
  await filesystem.mkdir(path.join(root, '.turbo/m6-2026-10-18/m6-6'), { recursive: true });
  await writeFile(
    path.join(root, '.turbo/m6-2026-10-18/m6-6/revision-runtime.json'),
    JSON.stringify({ schema: 1, accepted: true, hashes: {} }),
  );
  await assert.rejects(verifyRuntimeReview(root), /ADAPTADORES_NO_REVISADOS/);
});

// R1/R2: contra el módulo del freeze342; snapshots/IPC dobles, sin PG/producto.
for (const variant of ['root-ausente', 'descendiente-tardio', 'pid-reutilizado']) {
  test(`R1 ${variant}: cierre incierto conserva applied y nunca mata identidad ajena`, async () => {
    const root = {
      pid: 123,
      parent: 1,
      created: identity.created,
      exe: 'C:\\runtime\\node.exe',
      command: 'node own-worker',
    };
    const child = {
      ...root,
      pid: 124,
      parent: 123,
      exe: 'C:\\runtime\\chrome.exe',
      command: 'chrome own-child',
    };
    const late = { ...child, pid: 125, parent: 124, command: 'chrome late-child' };
    let rows = [root];
    const killed = [];
    const host = windowsHost({
      platform: 'win32',
      execute: async () => ({ stdout: JSON.stringify({ freeMiB: 3000, processes: rows }) }),
      kill: (pid) => {
        killed.push(pid);
        rows = rows.filter((row) => row.pid !== pid);
        if (variant === 'descendiente-tardio' && pid === root.pid) rows.push(late);
      },
    });
    const expected = await host.identify(root.pid, 'api');
    const f = fixture();
    f.deps.start = async ({ record }) => {
      await record(expected);
    };
    f.deps.run = async () => {
      rows =
        variant === 'root-ausente'
          ? [child, late]
          : variant === 'pid-reutilizado'
            ? [{ ...root, command: 'foreign-reused' }, child]
            : [root, child];
    };
    f.deps.stop = async () => {
      await host.stop(expected);
    };
    await assert.rejects(coordinate(f.options, f.deps), /IDENTIDAD_PROCESO_CAMBIO/);
    assert.equal(f.state.journal.state, 'applied');
    assert.equal(f.state.row.activa, true);
    assert.equal(f.state.calls.filter((call) => call === 'cas').length, 1);
    assert.ok(!killed.includes(late.pid));
    if (variant !== 'descendiente-tardio') assert.deepEqual(killed, []);
  });
}

function abortLauncherFixture(stage) {
  const controller = new AbortController();
  const calls = [];
  const children = [];
  let access = 0;
  const host = {
    async identify(pid, kind) {
      calls.push(`identify-${kind}`);
      if (stage === 'identify') controller.abort();
      return { ...identity, pid, kind };
    },
    async stop(id) {
      calls.push(`stop-${id.kind}`);
      const child = children.find((p) => p.pid === id.pid);
      if (child) {
        child.exitCode = 0;
        child.emit('exit', 0);
      }
    },
  };
  const launcher = createLauncher({
    projectRoot: path.resolve('synthetic-project'),
    runId: 'unit-abort',
    host,
    spawn(_file, args) {
      const kind = args[1];
      calls.push(`spawn-${kind}`);
      const child = Object.assign(new EventEmitter(), {
        pid: 700 + children.length,
        connected: true,
        exitCode: null,
        signalCode: null,
        disconnect() {
          calls.push(`disconnect-${kind}`);
          this.connected = false;
          this.exitCode = 2;
          this.emit('exit', 2);
        },
        kill() {
          calls.push(`handle-kill-${kind}`);
          this.exitCode = 2;
          this.emit('exit', 2);
          return true;
        },
        send() {
          calls.push(`go-${kind}`);
        },
      });
      children.push(child);
      queueMicrotask(() => {
        if (stage === 'ready') controller.abort();
        child.emit('message', { ready: true });
      });
      return child;
    },
    fetcher: async (_url, { signal }) => {
      calls.push('fetch');
      if (stage === 'readiness') {
        controller.abort();
        await Promise.resolve();
        calls.push(`fetch-aborted-${signal.aborted}`);
      }
      return { ok: true, json: async () => ({ db: 'ok', geo: 'ok', fotos: 'ok' }) };
    },
    operations: {
      access: async () => {
        access++;
        if (stage === 'between' && access === 2) controller.abort();
      },
    },
    ports: async () => {},
  });
  const record = async (id) => {
    calls.push(`record-${id.kind}`);
    if (stage === 'record') controller.abort();
  };
  if (stage === 'before') controller.abort();
  return { launcher, controller, calls, children, record };
}
for (const stage of ['before', 'ready', 'identify', 'record', 'between', 'readiness']) {
  test(`R2 abort ${stage}: no go posterior ni próximo servicio; gated/cierre acreditado`, async () => {
    const f = abortLauncherFixture(stage);
    await assert.rejects(
      f.launcher.services({ api: {}, geo: {}, web: {}, panel: {} }, f.record, {
        signal: f.controller.signal,
      }),
      /INTERRUMPIDO/,
    );
    await f.launcher.stop(f.launcher.owned);
    assert.ok(!f.calls.includes('spawn-api'));
    assert.ok(!f.calls.includes('spawn-web'));
    if (['before', 'ready', 'identify', 'record'].includes(stage))
      assert.ok(!f.calls.some((call) => call.startsWith('go-')));
    assert.ok(f.children.every((child) => child.exitCode !== null));
    if (stage === 'readiness') assert.ok(f.calls.includes('fetch-aborted-true'));
  });
}
test('R2 runtime propaga su AbortSignal al launcher y restaura solo tras cierre', async () => {
  const f = fixture();
  let received;
  let closed = false;
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'm6-r2-runtime-'));
  await filesystem.mkdir(path.join(projectRoot, '.turbo/piloto-m6-artefactos/unit-m6'), {
    recursive: true,
  });
  const runtime = await createRuntime({
    options: f.options,
    projectRoot,
    sourceEnv: {},
    inheritedEnv: {},
    host: { identify: async () => ({ ...identity, kind: 'coordinator' }) },
    store: f.deps.store,
    pgFactory: async (...args) => {
      const client = await f.deps.clientFactory(...args);
      const cas = client.cas;
      client.cas = async (before, after) => {
        if (!after.activa)
          assert.equal(closed, true, 'cierre acreditado ANTES de CAS restauración');
        return cas(before, after);
      };
      return client;
    },
    photoStorage: {},
    launcher: {
      async services(_envs, record, options) {
        received = options?.signal;
        await record(identity);
        runtime.deps.cancel();
        if (received?.aborted) throw Error('INTERRUMPIDO');
      },
      async stop() {
        closed = true;
      },
      async browser() {
        assert.fail('no navegador tras aborto');
      },
    },
  });
  // Omite únicamente precondiciones de artefactos/fotos en este doble de start.
  runtime.deps.storage = async () => {};
  runtime.deps.ports = async () => {};
  await assert.rejects(coordinate(f.options, runtime.deps), /INTERRUMPIDO/);
  assert.ok(received?.aborted);
  assert.equal(closed, true);
  assert.equal(f.state.journal.state, 'restored');
  assert.equal(f.state.row.activa, false);
});
test('R2 start abortado sin identidad registrada: cierre no acreditado bloquea restauración', async () => {
  const f = fixture();
  let stopped = false;
  f.deps.start = async () => {
    throw Error('INTERRUMPIDO');
  };
  f.deps.stop = async (ids) => {
    stopped = true;
    assert.deepEqual(ids, []);
    throw Error('IDENTIDAD_PROCESO_CAMBIO');
  };
  await assert.rejects(coordinate(f.options, f.deps), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.equal(stopped, true);
  assert.equal(f.state.journal.state, 'applied');
  assert.equal(f.state.row.activa, true);
  assert.equal(f.state.calls.filter((call) => call === 'cas').length, 1);
});

// Segundo pase R1: misma evidencia de disco, hosts distintos; no PG ni producto.
async function durableClosureFixture({ operations = filesystem, lateChild = true } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'm6-r1-durable-'));
  const journals = path.join(directory, '.turbo/piloto-m6');
  const closureDirectory = path.join(directory, '.turbo/piloto-m6-artefactos/unit-m6/cierres');
  const root = {
    pid: 123,
    parent: 1,
    created: identity.created,
    exe: 'C:\\runtime\\node.exe',
    command: 'node own-worker',
  };
  const child = {
    ...root,
    pid: 124,
    parent: 123,
    exe: 'C:\\runtime\\chrome.exe',
    command: 'chrome own-child',
  };
  const late = { ...child, pid: 125, parent: 124, command: 'chrome late-child' };
  const state = { rows: [root], killed: [] };
  const makeHost = (ops = operations) =>
    windowsHost({
      platform: 'win32',
      closureDirectory,
      runId: 'unit-m6',
      operations: ops,
      execute: async () => ({
        stdout: JSON.stringify({
          freeMiB: 3000,
          processes: [
            ...state.rows,
            { ...root, pid: process.pid, parent: 0, command: 'node own-coordinator' },
          ],
        }),
      }),
      kill: (pid) => {
        state.killed.push(pid);
        state.rows = state.rows.filter((row) => row.pid !== pid);
        if (lateChild && pid === root.pid) state.rows.push(late);
      },
    });
  const first = makeHost();
  const expected = await first.identify(123, 'api');
  const f = fixture();
  const store = diskStore(journals, {
    owner: { ...identity, kind: 'coordinator' },
    alive: async () => false,
  });
  f.deps.store = store;
  f.deps.start = async ({ record }) => {
    await record(expected);
  };
  f.deps.run = async () => {
    state.rows = [root, child];
  };
  f.deps.stop = async (ids) => {
    for (const id of ids) await first.stop(id);
  };
  const journalFile = path.join(journals, 'unit-m6/catalogo.json');
  return {
    f,
    state,
    store,
    makeHost,
    expected,
    late,
    child,
    closureDirectory,
    journalFile,
    projectRoot: directory,
  };
}
test('R1durable tardío: nuevo windowsHost/mismo diario bloquea CAS hasta acreditar cierre', async () => {
  const d = await durableClosureFixture();
  await assert.rejects(coordinate(d.f.options, d.f.deps), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.deepEqual(
    d.state.rows.map((row) => [row.pid, row.parent]),
    [[125, 124]],
  );
  const cas = d.f.state.calls.filter((call) => call === 'cas').length;
  const fresh = d.makeHost(filesystem);
  d.f.deps.stop = async (ids) => {
    for (const id of ids) await fresh.stop(id);
  };
  await assert.rejects(
    coordinate(optionsFor(d.f, 'restaurar'), d.f.deps),
    /IDENTIDAD_PROCESO_CAMBIO/,
  );
  assert.equal(d.f.state.calls.filter((call) => call === 'cas').length, cas);
  assert.equal(JSON.parse(await readFile(d.journalFile, 'utf8')).state, 'applied');
  assert.ok(!d.state.killed.includes(125));
  d.state.rows = [];
  const afterClosure = d.makeHost(filesystem);
  d.f.deps.stop = async (ids) => {
    for (const id of ids) await afterClosure.stop(id);
  };
  assert.equal((await coordinate(optionsFor(d.f, 'restaurar'), d.f.deps)).status, 'RESTORED');
  assert.equal((await coordinate(optionsFor(d.f, 'restaurar'), d.f.deps)).status, 'RESTORED');
  assert.deepEqual(await d.store.pending(), []);
});
for (const phase of ['prepared', 'closed']) {
  for (const operation of ['write', 'sync', 'close', 'rename']) {
    test(`R1durable evidencia ${phase}/${operation}: fallo FS nunca acredita cierre ni RESTORED`, async () => {
      const fault = failingOperations(phase, operation);
      const d = await durableClosureFixture({ operations: fault.ops, lateChild: false });
      await assert.rejects(coordinate(d.f.options, d.f.deps));
      assert.equal(fault.injected(), true);
      assert.equal(JSON.parse(await readFile(d.journalFile, 'utf8')).state, 'applied');
      assert.equal(d.f.state.row.activa, true);
      assert.equal(d.f.state.calls.filter((call) => call === 'cas').length, 1);
      if (phase === 'prepared') assert.deepEqual(d.state.killed, []);
      const fresh = d.makeHost(filesystem);
      const cas = d.f.state.calls.filter((call) => call === 'cas').length;
      d.f.deps.stop = async (ids) => {
        for (const id of ids) await fresh.stop(id);
      };
      d.state.rows = [];
      await assert.rejects(coordinate(optionsFor(d.f, 'restaurar'), d.f.deps), /DIARIO_INCOMPLETO/);
      assert.equal(d.f.state.calls.filter((call) => call === 'cas').length, cas);
      assert.equal(JSON.parse(await readFile(d.journalFile, 'utf8')).state, 'applied');
    });
  }
}
test('R1durable runtime recovery enlaza evidencia antes de stop/CAS en host nuevo', async () => {
  const d = await durableClosureFixture();
  await assert.rejects(coordinate(d.f.options, d.f.deps), /IDENTIDAD_PROCESO_CAMBIO/);
  async function recovery() {
    const fresh = windowsHost({
      platform: 'win32',
      execute: async () => ({
        stdout: JSON.stringify({
          freeMiB: 3000,
          processes: [
            ...d.state.rows,
            {
              pid: process.pid,
              parent: 0,
              created: identity.created,
              exe: 'C:\\runtime\\node.exe',
              command: 'node own-coordinator',
            },
          ],
        }),
      }),
      kill: () => assert.fail('recuperación no mata huérfano/reutilizado'),
    });
    const options = optionsFor(d.f, 'restaurar');
    const runtime = await createRuntime({
      projectRoot: d.projectRoot,
      options,
      sourceEnv: {},
      inheritedEnv: {},
      host: fresh,
      store: d.store,
      pgFactory: d.f.deps.clientFactory,
      photoStorage: {},
      launcher: {
        async stop(ids) {
          for (const id of ids) await fresh.stop(id);
        },
      },
    });
    return coordinate(options, runtime.deps);
  }
  const cas = d.f.state.calls.filter((call) => call === 'cas').length;
  await assert.rejects(recovery(), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.equal(d.f.state.calls.filter((call) => call === 'cas').length, cas);
  d.state.rows = [];
  assert.equal((await recovery()).status, 'RESTORED');
});

// Procedencia consultada en PG; estos booleanos no proceden del nombre del archivo.
const photoProvenance = {
  linked_report: true,
  author_present: true,
  uploader_present: true,
  uploader_is_author: true,
  author_e2e_generated: true,
  uploader_e2e_generated: true,
  author_fixture_name: true,
  uploader_fixture_name: true,
  author_citizen: true,
  uploader_citizen: true,
  description_fixture_prefix: true,
};
async function fallbackPhotoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-fallback-'));
  const source = path.join(root, 'infra/.storage/fotos');
  await filesystem.mkdir(source, { recursive: true });
  await filesystem.mkdir(path.join(root, '.turbo'), { recursive: true });
  const key = `${randomUUID()}.webp`;
  const data = Buffer.from('synthetic-fallback-photo');
  const file = path.join(source, key);
  const foreign = path.join(source, `${randomUUID()}.webp`);
  await writeFile(file, data);
  await writeFile(foreign, 'foreign-not-referenced');
  const row = {
    objeto_key: key,
    bytes: data.length,
    ...photoProvenance,
    description_e2e_marker: false, // marca:string libre, no requisito del helper.
  };
  return { root, source, key, data, file, foreign, row };
}
function fallbackStorage(f, extra = {}) {
  return createPhotoStorage({
    projectRoot: f.root,
    runId: 'own-fallback',
    minFreeBytes: 0,
    ...extra,
  });
}
function assertPhotoProvenanceSql(sql, values) {
  assert.match(sql, /^SELECT f\.objeto_key,f\.bytes,/);
  assert.match(sql, /r\.id IS NOT NULL AS linked_report/);
  assert.match(sql, /au\.id IS NOT NULL AS author_present/);
  assert.match(sql, /up\.id IS NOT NULL AS uploader_present/);
  assert.match(sql, /COALESCE\(f\.subido_por=r\.autor_id,false\) AS uploader_is_author/);
  for (const [alias, label] of [
    ['au', 'author'],
    ['up', 'uploader'],
  ]) {
    assert.ok(sql.includes(`COALESCE(${alias}.email ~ $1,false) AS ${label}_e2e_generated`));
    assert.ok(sql.includes(`COALESCE(${alias}.nombre=$2,false) AS ${label}_fixture_name`));
    assert.ok(sql.includes(`COALESCE(${alias}.rol='ciudadano',false) AS ${label}_citizen`));
  }
  assert.ok(
    sql.includes('COALESCE(left(r.descripcion,length($3))=$3,false) AS description_fixture_prefix'),
  );
  assert.match(sql, /LEFT JOIN public\.reporte r ON r\.id=f\.reporte_id/);
  assert.match(sql, /LEFT JOIN public\.usuario au ON au\.id=r\.autor_id/);
  assert.match(sql, /LEFT JOIN public\.usuario up ON up\.id=f\.subido_por/);
  assert.match(sql, /WHERE f\.reporte_id IS NOT NULL ORDER BY f\.objeto_key$/);
  assert.deepEqual(values, [
    '^e2e-.*[0-9]{13}-[a-z0-9]{1,6}@curichi[.]test$',
    'Vecina de prueba',
    'Se junta agua hasta la rodilla cada vez que llueve fuerte. ',
  ]);
  // No proyectar correos/nombres/descripciones ni exigir E2E- en la descripción.
  const projection = sql.split('FROM public.reporte_foto')[0];
  assert.doesNotMatch(
    projection,
    /(?:^|,)\s*(?:au\.email|up\.email|au\.nombre|up\.nombre|r\.descripcion)\s*(?:,|$)/,
  );
  assert.doesNotMatch(sql, /description_e2e_marker|\$3\|\|'E2E-'/);
}
test('fotos fallback: PG READ ONLY acredita procedencia antes de leer referencia exacta; copia exclusiva/original intacto', async () => {
  const f = await fallbackPhotoFixture();
  const d = pgDouble({
    intercept(sql, values) {
      if (!sql.includes('FROM public.reporte_foto')) return undefined;
      assertPhotoProvenanceSql(sql, values);
      return { rows: [f.row] };
    },
  });
  const client = await d.factory(urls[0], 'curichi');
  await client.connect();
  const reads = [];
  let copies = 0;
  const operations = {
    ...filesystem,
    async readdir(dir) {
      assert.notEqual(dir, f.source, 'nunca enumerar almacén habitual');
      return filesystem.readdir(dir);
    },
    async readFile(file) {
      if (file.startsWith(f.source + path.sep)) {
        assert.equal(file, f.file, 'solo objeto_key devuelto por DB de pruebas');
        assert.equal(d.state.queries.at(-1).sql, 'ROLLBACK', 'consulta acabada antes de contenido');
      }
      reads.push(file);
      return filesystem.readFile(file);
    },
    async copyFile(from, to, flags) {
      copies++;
      assert.equal(from, f.file);
      assert.equal(flags, 1);
      assert.ok(
        to.startsWith(
          path.join(f.root, '.turbo/piloto-m6-artefactos/own-fallback/fotos') + path.sep,
        ),
      );
      return filesystem.copyFile(from, to, flags);
    },
  };
  const storage = fallbackStorage(f, { operations });
  try {
    assert.deepEqual(await storage.inspect(client), {
      readOnly: true,
      photos: 1,
      bytes: f.data.length,
    });
    assert.equal(copies, 0);
    await storage.prepare();
    assert.equal(copies, 1);
    assert.ok(!reads.includes(f.foreign));
    assert.deepEqual(await readFile(f.file), f.data);
    assert.equal(await readFile(f.foreign, 'utf8'), 'foreign-not-referenced');
    assert.deepEqual(await readFile(path.join(storage.destination, f.key)), f.data);
    await assert.rejects(storage.prepare(), (e) => e.code === 'EEXIST');
    assert.deepEqual(
      d.state.queries.map((q) => q.sql).filter((sql) => !sql.startsWith('SELECT')),
      ['BEGIN READ ONLY', 'ROLLBACK'],
    );
  } finally {
    await client.end();
  }
});
for (const field of Object.keys(photoProvenance)) {
  for (const invalid of [false, null, undefined]) {
    test(`fotos fallback: procedencia incompleta ${field}/${invalid} impide toda lectura infra`, async () => {
      const f = await fallbackPhotoFixture();
      f.row[field] = invalid;
      const d = pgDouble({
        intercept: (sql) =>
          sql.includes('FROM public.reporte_foto') ? { rows: [f.row] } : undefined,
      });
      const client = await d.factory(urls[0], 'curichi');
      await client.connect();
      const operations = { ...filesystem };
      for (const name of ['lstat', 'readdir', 'readFile', 'copyFile']) {
        const operation = operations[name];
        operations[name] = async (file, ...args) => {
          assert.ok(
            !path.resolve(file).startsWith(path.join(f.root, 'infra')),
            'origen no acreditado: ni metadatos de infra',
          );
          return operation(file, ...args);
        };
      }
      try {
        await assert.rejects(fallbackStorage(f, { operations }).inspect(client), /ALMACEN_AUSENTE/);
        assert.ok(d.state.queries.every((q) => /^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(q.sql)));
      } finally {
        await client.end();
      }
    });
  }
}
test('fotos fallback: fuente conocida disponible no consulta infra aunque procedencia sea válida', async () => {
  const f = await photoFixture();
  f.client.photoRefs = async () => [
    { objeto_key: f.key, bytes: f.data.length, ...photoProvenance },
  ];
  const operations = { ...filesystem };
  for (const name of ['lstat', 'readdir', 'readFile', 'copyFile']) {
    const operation = operations[name];
    operations[name] = async (file, ...args) => {
      assert.ok(!path.resolve(file).startsWith(path.join(f.root, 'infra')));
      return operation(file, ...args);
    };
  }
  const storage = fallbackStorage(f, { operations });
  await storage.inspect(f.client);
  await storage.prepare();
  assert.deepEqual(await readFile(path.join(storage.destination, f.key)), f.data);
});
for (const variant of [
  'unreferenced',
  'size',
  'read-size',
  'directory',
  'link-file',
  'link-parent',
  'changed-size',
  'changed-hash',
  'changed-link',
  'copy-hash',
]) {
  test(`fotos fallback: rechaza ${variant} sin fuente alternativa ajena ni éxito falso`, async () => {
    const f = await fallbackPhotoFixture();
    const missingKey = `${randomUUID()}.webp`;
    if (variant === 'unreferenced') f.row.objeto_key = missingKey;
    if (variant === 'size') f.row.bytes++;
    const operations = {
      ...filesystem,
      async lstat(file) {
        if (file === f.file && variant === 'directory')
          return { isSymbolicLink: () => false, isFile: () => false, size: f.data.length };
        if (
          (file === f.file && variant === 'link-file') ||
          (file === f.source && variant === 'link-parent')
        )
          return { isSymbolicLink: () => true };
        return filesystem.lstat(file);
      },
      async readdir(dir) {
        assert.notEqual(dir, f.source);
        return filesystem.readdir(dir);
      },
      async readFile(file) {
        assert.notEqual(file, f.foreign);
        if (file === f.file && variant === 'read-size')
          return Buffer.concat([f.data, Buffer.from('x')]);
        return filesystem.readFile(file);
      },
    };
    const storage = fallbackStorage(f, { operations });
    const client = { photoRefs: async () => [f.row] };
    if (['changed-size', 'changed-hash', 'changed-link', 'copy-hash'].includes(variant)) {
      await storage.inspect(client);
      let copied = 0;
      operations.copyFile = async (...args) => {
        copied++;
        await filesystem.copyFile(...args);
        if (variant === 'copy-hash') await writeFile(args[1], Buffer.alloc(f.data.length, 0));
      };
      if (variant === 'changed-size')
        await writeFile(f.file, Buffer.concat([f.data, Buffer.from('x')]));
      if (variant === 'changed-hash') await writeFile(f.file, Buffer.alloc(f.data.length, 0));
      if (variant === 'changed-link')
        operations.lstat = async (file) =>
          file === f.file ? { isSymbolicLink: () => true } : filesystem.lstat(file);
      await assert.rejects(storage.prepare(), /ALMACEN_AUSENTE|DIARIO_RUTA_INVALIDA/);
      assert.equal(copied, variant === 'copy-hash' ? 1 : 0);
    } else {
      await assert.rejects(storage.inspect(client), /ALMACEN_AUSENTE|DIARIO_RUTA_INVALIDA/);
      await assert.rejects(
        readFile(path.join(storage.destination, f.key)),
        (e) => e.code === 'ENOENT',
      );
    }
    assert.equal(await readFile(f.foreign, 'utf8'), 'foreign-not-referenced');
  });
}
test('fotos fallback: junction física del directorio habitual se rechaza en scratch', async () => {
  const f = await fallbackPhotoFixture();
  const linkedRoot = await mkdtemp(path.join(os.tmpdir(), 'm6-fallback-link-'));
  await filesystem.mkdir(path.join(linkedRoot, 'infra/.storage'), { recursive: true });
  await filesystem.mkdir(path.join(linkedRoot, '.turbo'), { recursive: true });
  await filesystem.symlink(
    f.source,
    path.join(linkedRoot, 'infra/.storage/fotos'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    fallbackStorage({ root: linkedRoot }).inspect({ photoRefs: async () => [f.row] }),
    /DIARIO_RUTA_INVALIDA/,
  );
  assert.deepEqual(await readFile(f.file), f.data);
});

function observerFixture({ invalid, closureDirectory, runId } = {}) {
  const state = {
    rows: [
      {
        pid: process.pid,
        parent: 1,
        created: identity.created,
        exe: 'C:\\runtime\\node.exe',
        command: `own-node-${randomUUID()}`,
      },
    ],
    killed: [],
  };
  const execute = (file, args) => {
    const probe = {
      pid: 59001,
      parent: process.pid,
      created: new Date().toISOString(),
      exe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      command: 'own-cim-observer',
    };
    if (invalid === 'parent') probe.parent++;
    if (invalid === 'created') probe.created = '2000-01-01T00:00:00.000Z';
    if (invalid === 'exe') probe.exe = 'C:\\runtime\\node.exe';
    if (invalid === 'command') probe.command = '';
    const task = Promise.resolve({
      stdout: JSON.stringify({
        freeMiB: 3000,
        observerPid: probe.pid + (invalid === 'pid' ? 1 : 0),
        processes: [...state.rows, probe, ...(invalid === 'duplicate' ? [probe] : [])],
      }),
    });
    task.child = {
      pid: probe.pid,
      spawnfile: file,
      spawnargs: [file, ...args],
      exitCode: 0,
      signalCode: null,
    };
    if (invalid === 'handle') delete task.child;
    if (invalid === 'args') task.child.spawnargs = [file, 'different-script'];
    if (invalid === 'exit') task.child.exitCode = null;
    return task;
  };
  const host = windowsHost({
    platform: 'win32',
    execute,
    closureDirectory,
    runId,
    kill: (pid) => {
      state.killed.push(pid);
      state.rows = state.rows.filter((row) => row.pid !== pid);
    },
  });
  return { host, state };
}
test('observer propio acreditado: stopself con snapshots dobles excluye solo su execute sin kill real', async () => {
  const f = observerFixture();
  const own = await f.host.identify(process.pid, 'panel');
  await f.host.stop(own);
  assert.deepEqual(f.state.killed, [process.pid], 'solo kill doble, no syscall');
});
for (const invalid of [
  'pid',
  'parent',
  'created',
  'exe',
  'command',
  'handle',
  'args',
  'exit',
  'duplicate',
]) {
  test(`observer inválido ${invalid}: no se excluye fila ni se permite kill`, async () => {
    const f = observerFixture({ invalid });
    await assert.rejects(f.host.identify(process.pid, 'panel'), /IDENTIDAD_INVALIDA/);
    assert.deepEqual(f.state.killed, []);
  });
}
test('observer acreditado no permite otro PowerShell descendiente aunque tenga la misma imagen/comando', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-observer-'));
  const runId = 'observer-unit';
  const closureDirectory = path.join(root, runId, 'cierres');
  const f = observerFixture({ closureDirectory, runId });
  const own = await f.host.identify(process.pid, 'panel');
  f.state.rows.push({
    pid: 59002,
    parent: process.pid,
    created: new Date().toISOString(),
    exe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    command: 'own-cim-observer',
  });
  await assert.rejects(f.host.stop(own), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.deepEqual(f.state.killed, []);
  const names = await filesystem.readdir(path.join(root, runId, 'identidad'));
  assert.equal(names.length, 1);
  const diagnostic = JSON.parse(
    await readFile(path.join(root, runId, 'identidad', names[0]), 'utf8'),
  );
  assert.equal(diagnostic.stage, 'descendant');
  assert.deepEqual(diagnostic.fields, ['executable']);
  assert.equal(diagnostic.actual.pid, 59002);
});
for (const field of ['parent', 'created', 'command', 'exe']) {
  test(`identidad diagnóstico root/${field}: evidencia saneada antes de prepared y cero kill`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'm6-reject-'));
    const runId = 'reject-unit';
    const closureDirectory = path.join(root, runId, 'cierres');
    const f = observerFixture({ closureDirectory, runId });
    const own = await f.host.identify(process.pid, 'panel');
    if (field === 'parent') f.state.rows[0].parent++;
    else if (field === 'created') f.state.rows[0].created = '2026-10-20T00:00:01Z';
    else f.state.rows[0][field] += `-private-${randomUUID()}`;
    await assert.rejects(f.host.stop(own), /IDENTIDAD_PROCESO_CAMBIO/);
    assert.deepEqual(f.state.killed, []);
    const names = await filesystem.readdir(path.join(root, runId, 'identidad'));
    const raw = await readFile(path.join(root, runId, 'identidad', names[0]), 'utf8');
    const diagnostic = JSON.parse(raw);
    assert.equal(diagnostic.runId, runId);
    assert.equal(diagnostic.stage, 'root');
    assert.deepEqual(diagnostic.fields, [
      field === 'command' || field === 'exe' ? 'fingerprint' : field,
    ]);
    assert.deepEqual(diagnostic.expected, own);
    assert.match(diagnostic.actual.fingerprint, /^[a-f0-9]{64}$/);
    assert.ok(!raw.includes(f.state.rows[0].command));
    assert.ok(!raw.includes(f.state.rows[0].exe));
    await assert.rejects(filesystem.readdir(closureDirectory), (e) => e.code === 'ENOENT');
  });
}
test('identidad evidencia fallida conserva rechazo y nunca habilita kill', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-reject-sync-'));
  const runId = 'reject-unit';
  const f = observerFixture({ closureDirectory: path.join(root, runId, 'cierres'), runId });
  const own = await f.host.identify(process.pid, 'panel');
  f.state.rows[0].parent++;
  const blocked = windowsHost({
    platform: 'win32',
    closureDirectory: path.join(root, runId, 'cierres'),
    runId,
    execute: async () => ({ stdout: JSON.stringify({ freeMiB: 3000, processes: f.state.rows }) }),
    kill: () => assert.fail('nunca matar tras fallo FS'),
    operations: {
      ...filesystem,
      open: async () => {
        throw Error('PRIVATE_FS_DETAIL');
      },
    },
  });
  await assert.rejects(blocked.stop(own), /FSYNC_FALLO/);
});

// Consola dependiente: solo snapshots dobles; el ensayo real vive fuera de la suite.
async function conhostFixture({ variant, self = false, disappear = true, operations } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'm6-conhost-'));
  const runId = 'conhost-unit';
  const closureDirectory = path.join(directory, runId, 'cierres');
  const root = {
    pid: self ? process.pid : 51001,
    parent: 1,
    created: '2026-10-20T00:00:00.000Z',
    exe: 'C:\\runtime\\node.exe',
    command: 'node own-ipc-worker',
  };
  const aux = {
    pid: 51002,
    parent: root.pid,
    created: '2026-10-20T00:00:00.026Z',
    exe: 'C:\\WINDOWS\\system32\\conhost.exe',
    command: 'system-console-command',
  };
  let systemDirectory = 'C:\\WINDOWS\\system32';
  if (variant === 'route') aux.exe = 'C:\\other\\conhost.exe';
  if (variant === 'prefix') aux.exe = 'C:\\WINDOWS\\system32\\other\\conhost.exe';
  if (variant === 'directory') systemDirectory = undefined;
  if (variant === 'command') aux.command = '';
  if (variant === 'created') aux.created = 'invalid-date';
  if (variant === 'before') aux.created = '2026-10-19T23:59:59Z';
  if (variant === 'subject') root.exe = 'C:\\runtime\\chrome.exe';
  const state = { rows: [root], killed: [], captures: 0, capturesAfterKill: 0, published: [] };
  const ops = operations ?? {
    ...filesystem,
    async rename(from, to) {
      await filesystem.rename(from, to);
      state.published.push(JSON.parse(await readFile(to, 'utf8')));
    },
  };
  const makeHost = () =>
    windowsHost({
      platform: 'win32',
      closureDirectory,
      runId,
      operations: ops,
      execute: async () => {
        state.captures++;
        state.onCapture?.();
        if (state.killed.length) {
          state.capturesAfterKill++;
          if (disappear && state.capturesAfterKill >= 3)
            state.rows = state.rows.filter((row) => row.pid !== aux.pid);
          if (variant === 'reuse')
            state.rows = state.rows.map((row) =>
              row.pid === aux.pid ? { ...row, created: '2026-10-20T01:00:00Z' } : row,
            );
          if (variant === 'changed-command')
            state.rows = state.rows.map((row) =>
              row.pid === aux.pid ? { ...row, command: 'other-command' } : row,
            );
          if (variant === 'changed-exe')
            state.rows = state.rows.map((row) =>
              row.pid === aux.pid ? { ...row, exe: 'C:\\other\\conhost.exe' } : row,
            );
          if (variant === 'late')
            state.rows.push({ ...aux, pid: 51003, parent: aux.pid, exe: 'C:\\runtime\\node.exe' });
        }
        return {
          stdout: JSON.stringify({ freeMiB: 3000, systemDirectory, processes: state.rows }),
        };
      },
      kill: (pid) => {
        assert.notEqual(pid, aux.pid, 'la consola nunca se mata directamente');
        assert.ok(
          state.published.some(
            (record) => record.state === 'prepared' && record.natural?.length === 1,
          ),
          'política durable antes del kill',
        );
        if (self)
          assert.ok(
            state.published.some((record) => record.state === 'observed'),
            'autocierre deja observación pendiente antes de morir',
          );
        state.killed.push(pid);
        if (!state.skipKill) state.rows = state.rows.filter((row) => row.pid !== pid);
      },
    });
  const host = makeHost();
  const expected = await host.identify(root.pid, 'panel');
  state.rows = [root, aux];
  if (variant === 'duplicate') state.rows.push({ ...root });
  if (variant === 'unrelated')
    state.rows.push({ ...aux, pid: 51003, parent: root.pid, exe: 'C:\\runtime\\powershell.exe' });
  const records = async () =>
    Promise.all(
      (await filesystem.readdir(closureDirectory))
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => JSON.parse(await readFile(path.join(closureDirectory, name), 'utf8'))),
    );
  return { state, host, makeHost, expected, aux, root, records, closureDirectory };
}

test('conhost central: espera desaparición acreditada antes de closed y CAS; solo mata Node', async () => {
  const d = await conhostFixture();
  const f = fixture();
  f.deps.start = async ({ record }) => record(d.expected);
  f.deps.stop = async () => d.host.stop(d.expected);
  const cas = f.deps.clientFactory;
  f.deps.clientFactory = async (...args) => {
    const client = await cas(...args);
    const update = client.cas;
    client.cas = async (before, after) => {
      if (!after.activa) {
        assert.equal(d.state.rows.length, 0);
        assert.ok((await d.records()).some((record) => record.state === 'closed'));
      }
      return update(before, after);
    };
    return client;
  };
  await coordinate(f.options, f.deps);
  assert.deepEqual(d.state.killed, [d.root.pid]);
  assert.ok(d.state.capturesAfterKill >= 3);
  const prepared = (await d.records()).find((record) => record.state === 'prepared');
  assert.equal(prepared.schema, 2);
  assert.equal(prepared.natural[0].policy, 'natural');
  assert.equal(prepared.natural[0].subject.pid, d.root.pid);
  assert.equal(prepared.natural[0].identity.pid, d.aux.pid);
  assert.ok(!JSON.stringify(prepared).includes(d.aux.command));
});

for (const variant of [
  'route',
  'prefix',
  'directory',
  'command',
  'created',
  'before',
  'subject',
  'duplicate',
  'unrelated',
]) {
  test(`conhost prueba incompleta ${variant}: rechazo cerrado antes de cualquier kill`, async () => {
    const d = await conhostFixture({ variant });
    await assert.rejects(d.host.stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
    assert.deepEqual(d.state.killed, []);
  });
}
for (const variant of ['reuse', 'changed-command', 'changed-exe', 'late']) {
  test(`conhost posterior ${variant}: pendiente sin closed ni kill auxiliar`, async () => {
    const d = await conhostFixture({ variant, disappear: false });
    await assert.rejects(d.host.stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
    assert.deepEqual(d.state.killed, [d.root.pid]);
    assert.ok(!(await d.records()).some((record) => record.state === 'closed'));
  });
}

test('conhost timeout: conserva applied sin CAS; host nuevo conserva política natural hasta desaparición', async () => {
  const d = await conhostFixture({ disappear: false });
  const f = fixture();
  f.deps.start = async ({ record }) => record(d.expected);
  f.deps.stop = async () => d.host.stop(d.expected);
  await assert.rejects(coordinate(f.options, f.deps), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.equal(f.state.journal.state, 'applied');
  assert.equal(f.state.calls.filter((call) => call === 'cas').length, 1);
  assert.ok(!(await d.records()).some((record) => record.state === 'closed'));
  await assert.rejects(d.makeHost().stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.deepEqual(d.state.killed, [d.root.pid]);
  d.state.rows = [];
  f.deps.stop = async () => d.makeHost().stop(d.expected);
  assert.equal((await coordinate(optionsFor(f, 'restaurar'), f.deps)).status, 'RESTORED');
  assert.ok(
    (await d.records()).some((record) => record.state === 'closed' && record.natural.length === 1),
  );
});

test('conhost autocierre: nunca promete closed después de su propio kill; observador nuevo acredita', async () => {
  const d = await conhostFixture({ self: true, disappear: false });
  await assert.rejects(d.host.stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
  assert.equal(d.state.capturesAfterKill, 0);
  assert.ok(!(await d.records()).some((record) => record.state === 'closed'));
  d.state.rows = [];
  await d.makeHost().stop(d.expected);
  assert.ok((await d.records()).some((record) => record.state === 'closed'));
});

test('conhost fallo persistencia: no mata Node ni auxiliar sin prepared durable', async () => {
  const fault = failingOperations('prepared', 'sync');
  const d = await conhostFixture({ operations: fault.ops });
  await assert.rejects(d.host.stop(d.expected), /FSYNC_FALLO/);
  assert.deepEqual(d.state.killed, []);
  assert.equal(fault.injected(), true);
});

for (const field of ['created', 'parent', 'exe', 'command']) {
  test(`conhost cambio antes de kill ${field}: cero kill y ningún closed`, async () => {
    const d = await conhostFixture({ disappear: false });
    d.state.onCapture = () => {
      if (d.state.captures >= 3)
        d.state.rows = d.state.rows.map((row) =>
          row.pid !== d.aux.pid
            ? row
            : {
                ...row,
                [field]:
                  field === 'parent'
                    ? 42
                    : field === 'created'
                      ? '2026-10-20T02:00:00Z'
                      : `${row[field]}-changed`,
              },
        );
    };
    await assert.rejects(d.host.stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
    assert.deepEqual(d.state.killed, []);
    assert.ok(!(await d.records()).some((record) => record.state === 'closed'));
  });
}

test('conhost host nuevo con Node aún vivo: jamás pierde exclusión de kill ni prueba persistida', async () => {
  const d = await conhostFixture({ disappear: false });
  d.state.skipKill = true;
  await assert.rejects(d.host.stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
  d.state.skipKill = false;
  d.state.onCapture = () => {
    if (d.state.killed.length === 2 && !d.state.rows.some((row) => row.pid === d.root.pid))
      d.state.rows = [];
  };
  await d.makeHost().stop(d.expected);
  assert.deepEqual(d.state.killed, [d.root.pid, d.root.pid]);
  assert.ok(
    (await d.records()).some((record) => record.state === 'closed' && record.natural.length === 1),
  );
});

for (const invalid of ['policy', 'missing', 'subject', 'directory', 'created']) {
  test(`conhost host nuevo prueba durable inválida ${invalid}: cerrado sin kill ni closed`, async () => {
    const d = await conhostFixture({ self: true, disappear: false });
    await assert.rejects(d.host.stop(d.expected), /IDENTIDAD_PROCESO_CAMBIO/);
    const record = (await d.records()).find((value) => value.state === 'observed');
    if (invalid === 'policy') record.natural[0].policy = 'kill';
    if (invalid === 'missing') delete record.natural;
    if (invalid === 'subject') record.natural[0].subject.fingerprint = '0'.repeat(64);
    if (invalid === 'directory') record.natural[0].systemDirectory = '';
    if (invalid === 'created') record.natural[0].identity.created = '2026-10-19T00:00:00Z';
    const name = (await filesystem.readdir(d.closureDirectory)).find((value) =>
      value.endsWith('.json'),
    );
    await writeFile(
      path.join(d.closureDirectory, `${name.slice(0, 64)}.${randomUUID()}.json`),
      JSON.stringify(record),
    );
    const killed = [...d.state.killed];
    await assert.rejects(d.makeHost().stop(d.expected), /DIARIO_INCOMPLETO/);
    assert.deepEqual(d.state.killed, killed);
    assert.ok(!(await d.records()).some((value) => value.state === 'closed'));
  });
}

test('diagnóstico mapa CLI: único selector cerrado G1, sin nuevos modos', () => {
  assert.deepEqual(parseArgs(['--grupo', 'G1', '--diagnostico-mapa']), {
    mode: 'grupo',
    group: 'G1',
    diagnosticMap: true,
  });
});
for (const args of [
  ['--diagnostico-mapa'],
  ['--piloto', '--diagnostico-mapa'],
  ['--preflight', '--diagnostico-mapa'],
  ['--grupo', 'G2', '--diagnostico-mapa'],
  ['--grupo', 'G5', '--diagnostico-mapa'],
  ['--diagnostico-mapa', '--grupo', 'G1'],
  ['--grupo', 'G1', '--diagnostico-mapa', '--diagnostico-mapa'],
  ['--restaurar', '.turbo/piloto-m6/unit/catalogo.json', '--diagnostico-mapa'],
]) {
  test(`diagnóstico mapa CLI rechaza combinación ${JSON.stringify(args)}`, () => {
    assert.throws(() => parseArgs(args), /OPCIONES_INVALIDAS/);
  });
}
for (const options of [
  { mode: 'piloto', diagnosticMap: true },
  { mode: 'preflight', diagnosticMap: true },
  { mode: 'grupo', group: 'G2', diagnosticMap: true },
  { mode: 'grupo', group: 'G1', diagnosticMap: false },
  { mode: 'grupo', group: 'G1', diagnosticMap: '1' },
]) {
  test(`diagnóstico mapa coordinador rechaza opciones antes de fábrica ${JSON.stringify(options)}`, async () => {
    const f = fixture();
    await assert.rejects(coordinate({ ...f.options, ...options }, f.deps), /OPCIONES_INVALIDAS/);
    assert.equal(f.state.clients, 0);
  });
}
test('diagnóstico mapa runtime propaga solo al hijo, grupo sin activación y cleanup propio', async () => {
  const f = fixture();
  const root = await mkdtemp(path.join(os.tmpdir(), 'm6-diag-runtime-'));
  const browserPath = path.join(root, 'browser');
  const options = { ...f.options, mode: 'grupo', group: 'G1', diagnosticMap: true };
  let browser = false;
  let stopped = false;
  const runtime = await createRuntime({
    projectRoot: root,
    options,
    sourceEnv: {},
    inheritedEnv: { M6_DIAGNOSTICO_MAPA: 'hostile', PGOPTIONS: 'hostile' },
    browserPath,
    host: { identify: async () => ({ ...identity, kind: 'coordinator' }) },
    store: f.deps.store,
    pgFactory: f.deps.clientFactory,
    ports: async () => {},
    photoStorage: {
      destination: path.join(root, 'photos'),
      inspect: async () => {},
      prepare: async () => {},
    },
    operations: {
      ...filesystem,
      access: async () => {},
      readdir: async (file) => (file === browserPath ? ['chromium-123'] : filesystem.readdir(file)),
    },
    launcher: {
      async services(envs, record) {
        for (const [index, kind] of ['geo', 'api', 'web', 'panel'].entries()) {
          assert.equal(envs[kind].M6_DIAGNOSTICO_MAPA, undefined);
          await record({ ...identity, pid: 300 + index, kind });
        }
        assert.equal(f.state.row.activa, false);
      },
      async browser(env, record) {
        browser = true;
        assert.equal(env.M6_DIAGNOSTICO_MAPA, '1');
        assert.equal(env.M6_PILOTO_MODO, 'grupo');
        assert.equal(env.M6_PILOTO_GRUPO, 'G1');
        assert.equal(env.PGOPTIONS, undefined);
        assert.equal(f.state.row.activa, false);
        await record({ ...identity, pid: 304, kind: 'playwright' });
      },
      async stop(ids) {
        stopped = true;
        assert.equal(ids.length, 5);
      },
    },
  });
  assert.equal((await coordinate(options, runtime.deps)).status, 'PASS');
  assert.equal(browser && stopped, true);
  assert.equal(f.state.row.activa, false);
  assert.equal(f.state.journal, null);
  assert.ok(!f.state.calls.includes('cas'));
});
