/** M6.6: núcleo, adaptadores y canal interno aislados; CLI sujeta al corte revisado. */

import { execFile, fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv, promisify } from 'node:util';

const ROLES = ['curichi', 'curichi_api', 'curichi_geo'];
const CAMPOS = ['slug', 'activa', 'orden', 'activada_en', 'activada_por'];
const MODOS = ['preflight', 'grupo', 'piloto', 'restaurar'];
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// Los mensajes externos nunca se publican por su aspecto; solo códigos cerrados propios.
const CODIGOS = new Set([
  'DESTINO_NO_PERMITIDO',
  'URL_COUNT',
  'ENDPOINT_DIVERGENTE',
  'CREDENCIAL_AUSENTE',
  'IDENTIDAD_INVALIDA',
  'FILA_INVALIDA',
  'DIARIO_INVALIDO',
  'DIARIO_DESTINO_INVALIDO',
  'OPCIONES_INVALIDAS',
  'DIARIO_RUTA_INVALIDA',
  'CORRIDA_INVALIDA',
  'DIARIO_PENDIENTE',
  'CATALOGO_NO_BASELINE',
  'CATALOGO_CONFLICTO',
  'OTRA_CATEGORIA_CAMBIO',
  'M6_FALLO',
  'SIGINT',
  'SIGTERM',
  'INTERRUMPIDO',
  'PG_SESSION_LOST',
  'TIMEOUT',
  'BROWSER_FAILED',
  'LOCK_OCUPADO',
  'LOCK_CORRUPTO',
  'LOCK_CAMBIO',
  'DIARIO_AUSENTE',
  'PREFLIGHT_FALLO',
  'CONNECT_FALLO',
  'PG_LOCK_OCUPADO',
  'FSYNC_FALLO',
  'ALMACEN_AUSENTE',
  'SPAWN_PARCIAL',
  'IDENTIDAD_PROCESO_CAMBIO',
  'DIARIO_INCOMPLETO',
  'DIARIO_EVIDENCIA_CAMBIO',
  'RECUPERACION_REQUERIDA',
  'PG_IDENTIDAD_INVALIDA',
  'PG_PRIVILEGIOS_INVALIDOS',
  'PG_MIGRACIONES_INVALIDAS',
  'PG_CAPAS_AUSENTES',
  'PG_CUENTAS_AUSENTES',
  'PG_CONEXION_FALLO',
  'PG_LECTURA_FALLO',
  'PG_LOCK_FALLO',
  'PG_COMMIT_INCIERTO',
  'PG_CAS_FALLO',
  'PG_CIERRE_FALLO',
  'CONTROL_INVALIDO',
  'CONTROL_CANCELADO',
  'CONTROL_TIMEOUT',
  'CONTROL_DUPLICADO',
  'CONTROL_RUTA_INVALIDA',
  'CONTROL_RECHAZADO',
  'ESCENARIO_AUSENTE',
  'FIXTURE_INVALIDO',
  'AISLAMIENTO_FALLO',
  'PLATAFORMA_NO_SOPORTADA',
  'MEMORIA_INSUFICIENTE',
  'PESADO_AJENO',
  'PUERTO_OCUPADO',
  'SERVICIO_NO_LISTO',
  'SERVICIO_TERMINO',
  'ARTEFACTO_AUSENTE',
  'CHROMIUM_EXISTENTE_AUSENTE',
  'ADAPTADORES_NO_REVISADOS',
  'CONTROLADOR_TERMINO',
]);
const fail = (code) => {
  throw new Error(code);
};
const copia = (value) => structuredClone(value);
const iguales = (a, b) => CAMPOS.every((key) => a?.[key] === b?.[key]);
const estable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

function urlLocal(raw, role, destino = true) {
  if (typeof raw !== 'string' || /[\s\\?#]/.test(raw)) fail('DESTINO_NO_PERMITIDO');
  // Comprobar el texto antes de URL: su normalizador oculta segmentos /x/../ y hosts alternos.
  const m =
    /^(postgres|postgresql):\/\/([^/@]+)@(127\.0\.0\.1|localhost|\[::1\]):5432\/(curichi_e2e|[a-z_][a-z_0-9]*)$/.exec(
      raw,
    );
  if (!m || (destino && m[4] !== 'curichi_e2e')) fail('DESTINO_NO_PERMITIDO');
  let u;
  try {
    u = new URL(raw);
  } catch {
    fail('DESTINO_NO_PERMITIDO');
  }
  if (u.username !== role || !u.password || u.pathname !== `/${m[4]}`) fail('DESTINO_NO_PERMITIDO');
  return u;
}

export function validateUrls(urls) {
  if (!Array.isArray(urls) || urls.length !== 3) fail('URL_COUNT');
  const parsed = urls.map((url, i) => urlLocal(url, ROLES[i]));
  if (parsed.some((u) => u.hostname !== parsed[0].hostname || u.port !== parsed[0].port))
    fail('ENDPOINT_DIVERGENTE');
  return parsed;
}

export function deriveUrls(source) {
  const origin = urlLocal(source.DATABASE_URL, ROLES[0], false);
  origin.pathname = '/curichi_e2e';
  const urls = ROLES.map((role, i) => {
    const u = new URL(origin);
    u.username = role;
    if (i) {
      const password = source[i === 1 ? 'API_DB_PASSWORD' : 'GEO_DB_PASSWORD'];
      if (typeof password !== 'string' || !password) fail('CREDENCIAL_AUSENTE');
      u.password = password;
    }
    return u.toString();
  });
  validateUrls(urls);
  return urls;
}

/** Lista positiva: descarta también NODE_OPTIONS, PG*, AWS/S3 y overrides de aplicación. */
export function sanitizeEnvironment(env = {}) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|USERPROFILE|LOCALAPPDATA|APPDATA|HOME)$/i.test(
        key,
      ),
    ),
  );
}

function identity(value) {
  const keys = ['pid', 'parent', 'created', 'kind', 'fingerprint'];
  if (
    !value ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    !Number.isSafeInteger(value.parent) ||
    typeof value.created !== 'string' ||
    !Number.isFinite(Date.parse(value.created)) ||
    !['api', 'geo', 'web', 'panel', 'playwright', 'coordinator'].includes(value.kind) ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint)
  )
    fail('IDENTIDAD_INVALIDA');
}
function fila(value) {
  if (
    !value ||
    Object.keys(value).length !== CAMPOS.length ||
    Object.keys(value).some((key) => !CAMPOS.includes(key)) ||
    value.slug !== 'bache' ||
    typeof value.activa !== 'boolean' ||
    !Number.isSafeInteger(value.orden) ||
    !(
      value.activada_en === null ||
      (typeof value.activada_en === 'string' && FECHA.test(value.activada_en))
    ) ||
    !(
      value.activada_por === null ||
      (typeof value.activada_por === 'string' && UUID.test(value.activada_por))
    )
  )
    fail('FILA_INVALIDA');
}
function journalValido(value, target) {
  const keys = ['schema', 'runId', 'target', 'before', 'temporary', 'state', 'processes'];
  if (
    !value ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.schema !== 1 ||
    !ID.test(value.runId) ||
    !['prepared', 'applied', 'restored'].includes(value.state) ||
    !Array.isArray(value.processes) ||
    value.processes.length > 8
  )
    fail('DIARIO_INVALIDO');
  if (
    !target ||
    Object.keys(target).sort().join(',') !== 'database,host,port,roles' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.host) ||
    target.port !== 5432 ||
    target.database !== 'curichi_e2e' ||
    JSON.stringify(target.roles) !== JSON.stringify(ROLES) ||
    estable(value.target) !== estable(target)
  )
    fail('DIARIO_DESTINO_INVALIDO');
  fila(value.before);
  fila(value.temporary);
  value.processes.forEach(identity);
  if (
    value.before.activa ||
    !value.temporary.activa ||
    value.before.orden !== value.temporary.orden ||
    value.before.activada_por !== value.temporary.activada_por ||
    !FECHA.test(value.temporary.activada_en) ||
    value.before.activada_en === value.temporary.activada_en
  )
    fail('DIARIO_INVALIDO');
  return value;
}

export function parseArgs(args) {
  if (
    args.length === 3 &&
    args[0] === '--grupo' &&
    args[1] === 'G1' &&
    args[2] === '--diagnostico-mapa'
  )
    return { mode: 'grupo', group: 'G1', diagnosticMap: true };
  if (args.length === 1 && args[0] === '--preflight') return { mode: 'preflight' };
  if (args.length === 1 && args[0] === '--piloto') return { mode: 'piloto' };
  if (args.length === 2 && args[0] === '--grupo' && /^G[1-5]$/.test(args[1]))
    return { mode: 'grupo', group: args[1] };
  if (args.length === 2 && args[0] === '--restaurar' && typeof args[1] === 'string' && args[1])
    return { mode: 'restaurar', journalPath: args[1] };
  fail('OPCIONES_INVALIDAS');
}

/** CLI proyecto-relativa; diskStore vuelve a comprobar ancestros físicos antes de leer. */
export function normalizeRecoveryPath(
  input,
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
) {
  if (
    typeof input !== 'string' ||
    !input ||
    /[\0?#]/.test(input) ||
    input.split(/[\\/]/).includes('..')
  )
    fail('DIARIO_RUTA_INVALIDA');
  const root = path.resolve(projectRoot, '.turbo/piloto-m6');
  const absolute = path.resolve(projectRoot, input);
  if (
    path.dirname(path.dirname(absolute)) !== root ||
    path.basename(absolute) !== 'catalogo.json' ||
    !ID.test(path.basename(path.dirname(absolute)))
  )
    fail('DIARIO_RUTA_INVALIDA');
  return absolute;
}

export function prepareCli(args, sourceEnv, projectRoot) {
  const options = parseArgs(args);
  const urls = deriveUrls(sourceEnv); // Las tres URLs antes de cualquier adapter/store.load.
  return {
    ...options,
    urls,
    inheritedEnv: sanitizeEnvironment(sourceEnv),
    ...(options.mode === 'restaurar'
      ? { journalPath: normalizeRecoveryPath(options.journalPath, projectRoot) }
      : { runId: `m6-${randomUUID()}` }),
  };
}

/** Ninguna fábrica se invoca hasta validar opciones, las tres URLs y, al recuperar, el diario. */
export async function coordinate(options, deps) {
  const clients = [];
  const processes = [];
  let fileLock;
  let sessionLocked = false;
  let journal;
  let previousCatalog;
  let error;
  let result;
  let interrupted;
  let sessionLost = false;
  let preparedDurable = false;
  let startAttempted = false;
  const closingClients = new Set();
  const handlers = [];
  const check = () => {
    if (interrupted || options.signal?.aborted) fail(interrupted ?? 'INTERRUMPIDO');
  };
  const point = async (name) => {
    await deps.checkpoint?.(name, copia(journal));
    check();
  };
  const observe = (emitter, event, code) => {
    if (!emitter?.on) return;
    const handler = () => {
      if (event === 'end' && closingClients.has(emitter)) return;
      interrupted = code;
      if (code === 'PG_SESSION_LOST') sessionLost = true;
      try {
        deps.cancel?.(code);
      } catch {
        /* El handler nunca lanza al emisor. */
      }
    };
    emitter.on(event, handler);
    handlers.push(() => emitter.off(event, handler));
  };
  const safe = (e) => new Error(CODIGOS.has(e?.message) ? e.message : 'M6_FALLO');
  let target;
  let env;
  let urls;
  const requireSession = () => {
    if (sessionLost) fail('PG_SESSION_LOST');
  };
  async function restore(recovery = false) {
    requireSession();
    const current = (await clients[0].catalog()).find((row) => row.slug === 'bache');
    requireSession();
    if (!iguales(current, journal.before)) {
      if (journal.state === 'restored' || !iguales(current, journal.temporary))
        fail('CATALOGO_CONFLICTO');
      await clients[0].cas(journal.temporary, journal.before);
      requireSession();
    }
    // Punto de observación de COMMIT; aún no se ha persistido restored.
    await deps.checkpoint?.('restore-committed', copia(journal));
    requireSession();
    if (journal.state !== 'restored') {
      journal.state = 'restored';
      await deps.store.save(copia(journal));
    }
    await deps.checkpoint?.('restored', copia(journal));
    if (recovery) await deps.store.reconcile?.(copia(journal));
  }
  try {
    if (
      !options ||
      Object.keys(options).some(
        (k) =>
          ![
            'mode',
            'group',
            'diagnosticMap',
            'urls',
            'runId',
            'journalPath',
            'inheritedEnv',
            'sourceEnv',
            'signal',
          ].includes(k),
      ) ||
      !MODOS.includes(options.mode) ||
      (options.mode === 'grupo' && !/^G[1-5]$/.test(options.group)) ||
      (options.mode !== 'grupo' && options.group !== undefined) ||
      (options.diagnosticMap !== undefined &&
        (options.diagnosticMap !== true || options.mode !== 'grupo' || options.group !== 'G1')) ||
      (options.mode !== 'restaurar' && options.journalPath !== undefined)
    )
      fail('OPCIONES_INVALIDAS');
    urls = [...(options.urls ?? deriveUrls(options.sourceEnv ?? {}))];
    const parsed = validateUrls(urls);
    target = { host: parsed[0].hostname, port: 5432, database: 'curichi_e2e', roles: ROLES };
    env = sanitizeEnvironment(options.inheritedEnv);
    if (options.mode === 'restaurar') {
      if (typeof options.journalPath !== 'string' || !options.journalPath)
        fail('DIARIO_RUTA_INVALIDA');
      journal = journalValido(await deps.store.load(options.journalPath), target);
    } else if (!ID.test(options.runId ?? '')) fail('CORRIDA_INVALIDA');
    const pending = await deps.store.pending();
    if (
      pending.length &&
      (options.mode !== 'restaurar' || pending.some((id) => id !== journal.runId))
    )
      fail('DIARIO_PENDIENTE');
    check();
    if (options.mode !== 'preflight' && options.mode !== 'restaurar')
      fileLock = await deps.store.acquire({ recovery: false, runId: options.runId });
    observe(deps.signals, 'SIGINT', 'SIGINT');
    observe(deps.signals, 'SIGTERM', 'SIGTERM');
    if (options.signal) {
      const handler = () => {
        interrupted = 'INTERRUMPIDO';
        try {
          deps.cancel?.(interrupted);
        } catch {
          /* No propagar errores desde AbortSignal. */
        }
      };
      options.signal.addEventListener('abort', handler, { once: true });
      handlers.push(() => options.signal.removeEventListener('abort', handler));
    }
    for (let i = 0; i < 3; i++) {
      check();
      const client = await deps.clientFactory(urls[i], ROLES[i], { ...env });
      clients.push(client);
      observe(client, 'error', 'PG_SESSION_LOST');
      observe(client, 'end', 'PG_SESSION_LOST');
      await client.connect();
      await client.inspect();
      check();
    }
    if (options.mode !== 'preflight') {
      await clients[0].lock();
      sessionLocked = true;
      if (options.mode === 'restaurar')
        fileLock = await deps.store.acquire({
          recovery: true,
          runId: journal.runId,
          advisoryHeld: true,
        });
    }
    previousCatalog = await clients[0].catalog();
    await deps.storage(clients[0]);
    check();
    if (options.mode === 'preflight') {
      result = { status: 'READ_ONLY' };
    } else if (options.mode === 'restaurar') {
      await deps.stop(journal.processes);
      await restore(true);
      result = { status: 'RESTORED' };
    } else {
      if (
        !previousCatalog.some((row) => row.slug === 'inundacion' && row.activa) ||
        previousCatalog.some((row) => row.slug !== 'inundacion' && row.activa)
      )
        fail('CATALOGO_NO_BASELINE');
      await deps.ports();
      check();
      if (options.mode === 'piloto') {
        const before = copia(previousCatalog.find((row) => row.slug === 'bache'));
        fila(before);
        const timestamp = await clients[0].timestamp();
        journal = {
          schema: 1,
          runId: options.runId,
          target,
          before,
          temporary: { ...before, activa: true, activada_en: timestamp },
          state: 'prepared',
          processes: [],
        };
        journalValido(journal, target);
        await deps.store.save(copia(journal));
        preparedDurable = true;
        await point('prepared');
        await clients[0].cas(journal.before, journal.temporary);
        await point('activation-committed');
        journal.state = 'applied';
        await deps.store.save(copia(journal));
        await point('applied');
      }
      const common = { ...env, MANTENIMIENTO_ESPERA_MS: '2147483647' };
      const envs = {
        api: { ...common, NODE_ENV: 'test', DATABASE_URL: urls[1], API_DATABASE_URL: urls[1] },
        geo: { ...common, NODE_ENV: 'test', DATABASE_URL: urls[2], GEO_DATABASE_URL: urls[2] },
        web: { ...common, NODE_ENV: 'production' },
        panel: { ...common, NODE_ENV: 'production' },
      };
      startAttempted = true;
      await deps.start({
        envs,
        mode: options.mode,
        group: options.group,
        signal: options.signal,
        record: async (id) => {
          identity(id);
          processes.push(copia(id));
          if (journal) {
            journal.processes = copia(processes);
            await deps.store.save(copia(journal));
          }
        },
      });
      check();
      await deps.run({ mode: options.mode, group: options.group });
      check();
      result = { status: 'PASS' };
    }
  } catch (e) {
    error = safe(e);
  } finally {
    // Mantener handlers durante stop/CAS/sync/cierre; un segundo evento no queda sin manejar.
    let stopped = true;
    if (options?.mode !== 'restaurar' && (processes.length || startAttempted)) {
      try {
        await deps.stop(processes);
      } catch (e) {
        stopped = false;
        error = safe(e);
      }
    }
    if (
      journal &&
      preparedDurable &&
      options?.mode !== 'restaurar' &&
      clients[0] &&
      stopped &&
      !sessionLost
    ) {
      try {
        await restore();
      } catch (e) {
        error = safe(e);
      }
    }
    if (previousCatalog && clients[0] && options?.mode !== 'preflight' && !sessionLost) {
      try {
        const after = await clients[0].catalog();
        const others = (rows) =>
          rows
            .filter((row) => row.slug !== 'bache')
            .map(estable)
            .sort();
        if (JSON.stringify(others(after)) !== JSON.stringify(others(previousCatalog)))
          fail('OTRA_CATEGORIA_CAMBIO');
        if (options.mode === 'grupo' && JSON.stringify(after) !== JSON.stringify(previousCatalog))
          fail('CATALOGO_CONFLICTO');
      } catch (e) {
        error = safe(e);
      }
    }
    // La exclusión PG permanece durante cierre de procesos, restauración y verificación.
    if (sessionLocked && !sessionLost) {
      try {
        await clients[0].unlock();
      } catch (e) {
        error = safe(e);
      }
    }
    for (const client of clients.reverse()) {
      closingClients.add(client);
      try {
        await client.end();
      } catch (e) {
        error = safe(e);
      }
    }
    if (fileLock) {
      try {
        await deps.store.release(fileLock);
      } catch (e) {
        error = safe(e);
      }
    }
    for (const remove of handlers.reverse()) remove();
    if (journal && sessionLost) error = safe({ message: 'RECUPERACION_REQUERIDA' });
    if (interrupted && !error) error = safe({ message: interrupted });
  }
  if (error) throw error;
  return result;
}

/** Archivo sincronizado + rename en el mismo directorio. No demuestra resistencia a power loss. */
export function diskStore(root, { alive, owner, operations = fs } = {}) {
  const base = path.resolve(root);
  const lock = path.join(base, 'piloto.lock');
  const recoveryEvidence = new Map();
  async function contained(input) {
    const resolved = path.resolve(base, input);
    if (!resolved.startsWith(`${base}${path.sep}`)) fail('DIARIO_RUTA_INVALIDA');
    // También comprobar padres de base y el lock. Supone scratch local sin sustituciones hostiles
    // concurrentes: lstat/open no es una garantía contra carreras de un tercero sobre directorios.
    let current = resolved;
    for (;;) {
      try {
        if ((await operations.lstat(current)).isSymbolicLink()) fail('DIARIO_RUTA_INVALIDA');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const parent = path.dirname(current);
      if (current === parent) break;
      current = parent;
    }
    return resolved;
  }
  const sameIntent = (a, b) =>
    a.runId === b.runId &&
    estable(a.target) === estable(b.target) &&
    iguales(a.before, b.before) &&
    iguales(a.temporary, b.temporary);
  const store = {
    async load(input) {
      const file = await contained(input);
      if (path.basename(file) !== 'catalogo.json') fail('DIARIO_RUTA_INVALIDA');
      const runId = path.basename(path.dirname(file));
      if (!ID.test(runId) || path.dirname(path.dirname(file)) !== base)
        fail('DIARIO_RUTA_INVALIDA');
      let canonical;
      try {
        canonical = JSON.parse(await operations.readFile(file, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') fail('DIARIO_INVALIDO');
      }
      const entries = [];
      const names = await operations.readdir(path.dirname(file));
      for (const name of names.filter((name) => name.endsWith('.pending'))) {
        if (!/^catalogo\.json\.[a-f0-9-]+\.pending$/.test(name)) fail('DIARIO_INVALIDO');
        const filename = await contained(path.join(runId, name));
        const raw = await operations.readFile(filename, 'utf8');
        let data;
        try {
          data = JSON.parse(raw);
          journalValido(data, data.target);
        } catch {
          data = null;
        }
        entries.push({ filename, raw, data });
      }
      if (!canonical) canonical = entries.find((entry) => entry.data)?.data;
      if (!canonical) fail('DIARIO_INCOMPLETO');
      journalValido(canonical, canonical.target);
      if (canonical.runId !== runId) fail('DIARIO_RUTA_INVALIDA');
      if (entries.some((entry) => entry.data && !sameIntent(entry.data, canonical)))
        fail('DIARIO_EVIDENCIA_CAMBIO');
      const processes = new Map(
        canonical.processes.map((id) => [`${id.pid}:${id.fingerprint}`, id]),
      );
      for (const entry of entries)
        for (const id of entry.data?.processes ?? [])
          processes.set(`${id.pid}:${id.fingerprint}`, id);
      canonical = { ...canonical, processes: [...processes.values()] };
      journalValido(canonical, canonical.target);
      // Un parcial solo se concilia si existe un diario íntegro de la misma corrida.
      recoveryEvidence.set(runId, entries);
      return canonical;
    },
    async save(journal) {
      journalValido(journal, journal.target);
      const file = await contained(path.join(journal.runId, 'catalogo.json'));
      const dir = path.dirname(file);
      await operations.mkdir(dir, { recursive: true });
      const temporary = `${file}.${randomUUID()}.pending`;
      const handle = await operations.open(temporary, 'wx');
      try {
        await handle.writeFile(JSON.stringify(journal, null, 2));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await operations.rename(temporary, file);
      // Persistencia del directorio no se afirma en Windows: Node no proporciona esa garantía.
    },
    async pending() {
      await contained('piloto.lock');
      let dirs;
      try {
        dirs = await operations.readdir(base, { withFileTypes: true });
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
      const pending = [];
      for (const dir of dirs) {
        if (!dir.isDirectory() && !dir.isSymbolicLink()) continue;
        if (!ID.test(dir.name)) {
          pending.push('CORRUPT');
          continue;
        }
        try {
          const files = await operations.readdir(await contained(dir.name));
          const data = JSON.parse(
            await operations.readFile(
              await contained(path.join(dir.name, 'catalogo.json')),
              'utf8',
            ),
          );
          journalValido(data, data.target);
          if (data.runId !== dir.name) fail('DIARIO_RUTA_INVALIDA');
          if (files.some((file) => file.endsWith('.pending')) || data.state !== 'restored')
            pending.push(dir.name);
        } catch {
          pending.push(dir.name);
        }
      }
      return [...new Set(pending)];
    },
    async acquire({ recovery, runId, advisoryHeld } = {}) {
      if (!ID.test(runId ?? '')) fail('CORRIDA_INVALIDA');
      identity(owner);
      await contained('piloto.lock');
      await operations.mkdir(base, { recursive: true });
      const token = randomUUID();
      let handle;
      try {
        handle = await operations.open(lock, 'wx');
      } catch (e) {
        if (e.code !== 'EEXIST' || !recovery || !advisoryHeld || !alive) fail('LOCK_OCUPADO');
        const previous = await operations.readFile(lock, 'utf8');
        let parsed;
        try {
          parsed = JSON.parse(previous);
          identity(parsed.owner);
        } catch {
          fail('LOCK_CORRUPTO');
        }
        if (parsed.runId !== runId || (await alive(parsed.owner))) fail('LOCK_OCUPADO');
        if ((await operations.readFile(lock, 'utf8')) !== previous) fail('LOCK_CAMBIO');
        await operations.unlink(lock);
        handle = await operations.open(lock, 'wx');
      }
      try {
        identity(owner);
        await handle.writeFile(JSON.stringify({ token, runId, owner }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      return token;
    },
    async release(token) {
      await contained('piloto.lock');
      let record;
      try {
        record = JSON.parse(await operations.readFile(lock, 'utf8'));
      } catch {
        fail('LOCK_CAMBIO');
      }
      if (record.token !== token) fail('LOCK_CAMBIO');
      await operations.unlink(lock);
    },
    async reconcile(journal) {
      journalValido(journal, journal.target);
      if (journal.state !== 'restored') fail('DIARIO_PENDIENTE');
      const entries = recoveryEvidence.get(journal.runId);
      if (!entries) fail('DIARIO_PENDIENTE');
      // Solo bajo recuperación explícita y locks ya retenidos por coordinate. Conservar todo.
      for (const entry of entries) {
        await contained(entry.filename);
        if ((await operations.readFile(entry.filename, 'utf8')) !== entry.raw)
          fail('DIARIO_EVIDENCIA_CAMBIO');
      }
      const file = await contained(path.join(journal.runId, 'catalogo.json'));
      try {
        await operations.access(file);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        await store.save(journal);
      }
      for (const entry of entries) {
        await operations.rename(entry.filename, `${entry.filename}.${randomUUID()}.interrupted`);
      }
      recoveryEvidence.delete(journal.runId);
      if ((await store.pending()).includes(journal.runId)) fail('DIARIO_PENDIENTE');
    },
  };
  return store;
}

/** Lote PG: no importa pg ni crea Client hasta validar las tres URLs y sanear el padre. */
export function createPgFactory({
  urls,
  parentEnv = process.env,
  loadPg,
  loadInventory,
  queryDeadlineMs = 15_000,
  closeDeadlineMs = 5_000,
  timers = { setTimeout, clearTimeout },
} = {}) {
  validateUrls(urls);
  if (![queryDeadlineMs, closeDeadlineMs].every((n) => Number.isSafeInteger(n) && n > 0))
    fail('OPCIONES_INVALIDAS');
  const approved = [...urls];
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  let resources;
  async function lazy() {
    const safeEnv = sanitizeEnvironment(parentEnv);
    for (const key of Object.keys(parentEnv))
      if (!Object.hasOwn(safeEnv, key)) delete parentEnv[key];
    if (!resources)
      resources = (async () => {
        const pg = loadPg
          ? await loadPg()
          : createRequire(path.join(repo, 'packages/db/package.json'))('pg');
        const inventory = loadInventory
          ? await loadInventory()
          : {
              migrations: (await fs.readdir(path.join(repo, 'packages/db/migraciones')))
                .filter((name) => /^\d{4}_.+\.sql$/.test(name))
                .sort(),
              ...(await import(
                pathToFileURL(path.join(repo, 'packages/db/src/cli/matriz-privilegios.mjs')).href
              )),
            };
        if (
          !Array.isArray(inventory.migrations) ||
          !inventory.migrations.length ||
          !inventory.migrations.at(-1).startsWith('0021_') ||
          !inventory.ESPERADO ||
          !inventory.COLUMNAS_ESPERADAS
        )
          fail('PG_MIGRACIONES_INVALIDAS');
        return { pg, inventory };
      })();
    return resources;
  }
  return async (url, role) => {
    validateUrls(approved);
    const index = ROLES.indexOf(role);
    if (index < 0 || url !== approved[index]) fail('DESTINO_NO_PERMITIDO');
    const { pg, inventory } = await lazy();
    const raw = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
    });
    const client = new EventEmitter();
    client.on('error', () => {}); // Un error tardío tampoco imprime el mensaje privado del driver.
    let live = false;
    let held = false;
    let dead = false;
    let closing;
    let rejectActive;
    // Deadline local: NO equivale a CancelRequest ni a statement_timeout del servidor.
    // Un resultado desconocido invalida la sesión y cierra únicamente su conexión propia.
    const bounded = async (work, duration, expired, cancelled) => {
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = timers.setTimeout(() => {
          try {
            expired();
          } catch {
            /* El deadline no lanza hacia el emisor. */
          }
          reject(new Error('PG_SESSION_LOST'));
        }, duration);
      });
      try {
        return await Promise.race([
          Promise.resolve().then(work),
          deadline,
          ...(cancelled ? [cancelled] : []),
        ]);
      } finally {
        timers.clearTimeout(timer);
      }
    };
    const close = () => {
      if (!closing) {
        live = false;
        held = false;
        dead = true;
        rejectActive?.();
        closing = bounded(
          () => raw.end(),
          closeDeadlineMs,
          () => {
            // pg posee este stream. No se buscan ni cierran sesiones ajenas por PID.
            raw.connection?.stream?.destroy();
          },
        ).catch(() => {
          fail('PG_CIERRE_FALLO');
        });
      }
      return closing;
    };
    const lost = (event) => {
      const notify = !dead;
      dead = true;
      live = false;
      held = false;
      rejectActive?.();
      if (notify) client.emit(event, ...(event === 'error' ? [new Error('PG_SESSION_LOST')] : []));
      void close().catch(() => {});
    };
    raw.on('error', () => lost('error'));
    raw.on('end', () => lost('end'));
    const ready = (lock = false) => {
      if (!live || (lock && !held)) fail('PG_SESSION_LOST');
    };
    const query = async (sql, values) => {
      ready();
      if (rejectActive) {
        lost('error');
        fail('PG_SESSION_LOST');
      }
      const cancelled = new Promise((_, reject) => {
        rejectActive = () => reject(new Error('PG_SESSION_LOST'));
      });
      try {
        const result = await bounded(
          () => raw.query(sql, values),
          queryDeadlineMs,
          () => lost('error'),
          cancelled,
        );
        ready();
        return result;
      } catch (error) {
        // Solo un SQLSTATE de respuesta conocida permite rollback en esta sesión.
        // Timeout del driver sin código, cancelación 57014 y transporte son inciertos.
        if (
          ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTCONN'].includes(
            error?.code,
          ) ||
          !/^[0-9A-Z]{5}$/.test(error?.code ?? '') ||
          ['57014', '57P01', '57P02', '57P03'].includes(error.code) ||
          /^08/.test(error.code)
        )
          lost('error');
        if (!live) fail('PG_SESSION_LOST');
        fail('PG_LECTURA_FALLO');
      } finally {
        rejectActive = undefined;
      }
    };
    const timestampSql = `to_char(activada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
    const columnsSql = `slug, activa, orden, ${timestampSql} AS activada_en, activada_por::text`;
    const lockKey = 74366006; // Estable por base; separado de migraciones/recurrencia/mantenimiento.
    async function privileges() {
      const tables = (
        await query(
          `SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname IN ('public','geo')`,
        )
      ).rows;
      for (const service of ['curichi_api', 'curichi_geo']) {
        if (
          !inventory.ESPERADO[service] ||
          Object.keys(inventory.ESPERADO[service]).some(
            (table) => !tables.some(({ t }) => t === table),
          )
        )
          fail('PG_PRIVILEGIOS_INVALIDOS');
        for (const { t } of tables) {
          const expected = inventory.ESPERADO[service]?.[t] ?? [];
          for (const operation of [
            'SELECT',
            'INSERT',
            'UPDATE',
            'DELETE',
            'TRUNCATE',
            'REFERENCES',
            'TRIGGER',
          ]) {
            const actual = (
              await query('SELECT has_table_privilege($1, $2, $3) AS p', [service, t, operation])
            ).rows[0]?.p;
            if (actual !== expected.includes(operation)) fail('PG_PRIVILEGIOS_INVALIDOS');
          }
        }
        for (const [table, operations] of Object.entries(
          inventory.COLUMNAS_ESPERADAS[service] ?? {},
        )) {
          const columns = (
            await query(
              `SELECT column_name FROM information_schema.columns WHERE table_schema=split_part($1,'.',1) AND table_name=split_part($1,'.',2)`,
              [table],
            )
          ).rows;
          for (const [operation, permitted] of Object.entries(operations)) {
            if (permitted.some((name) => !columns.some((column) => column.column_name === name)))
              fail('PG_PRIVILEGIOS_INVALIDOS');
            for (const { column_name: name } of columns) {
              const actual = (
                await query('SELECT has_column_privilege($1,$2,$3,$4) AS p', [
                  service,
                  table,
                  name,
                  operation,
                ])
              ).rows[0]?.p;
              if (actual !== permitted.includes(name)) fail('PG_PRIVILEGIOS_INVALIDOS');
            }
          }
        }
      }
    }
    async function readOnly(sql, values, lock = false) {
      ready(lock);
      await query('BEGIN READ ONLY');
      try {
        return (await query(sql, values)).rows;
      } finally {
        if (live) await query('ROLLBACK');
      }
    }
    return Object.assign(client, {
      async connect() {
        try {
          await bounded(
            () => raw.connect(),
            queryDeadlineMs,
            () => lost('error'),
          );
          if (dead) fail('PG_CONEXION_FALLO');
          live = true;
        } catch {
          lost('error');
          fail('PG_CONEXION_FALLO');
        }
      },
      async end() {
        return close();
      },
      cancel() {
        if (rejectActive) lost('error');
      },
      async inspect() {
        ready();
        await query('BEGIN READ ONLY');
        try {
          const who = (await query('SELECT current_database() AS database, current_user AS role'))
            .rows[0];
          if (who?.database !== 'curichi_e2e' || who?.role !== role) fail('PG_IDENTIDAD_INVALIDA');
          if (role !== 'curichi') {
            const attributes = (
              await query(
                'SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname=current_user',
              )
            ).rows[0];
            if (!attributes || Object.values(attributes).some(Boolean))
              fail('PG_PRIVILEGIOS_INVALIDOS');
            const owned = (
              await query(
                `SELECT count(*)::integer AS n FROM pg_tables WHERE schemaname IN ('public','geo') AND tablename <> 'spatial_ref_sys' AND tableowner=current_user`,
              )
            ).rows[0];
            if (owned?.n !== 0) fail('PG_PRIVILEGIOS_INVALIDOS');
            for (const schema of ['public', 'geo']) {
              if (
                (
                  await query("SELECT has_schema_privilege(current_user,$1,'CREATE') AS p", [
                    schema,
                  ])
                ).rows[0]?.p !== false
              )
                fail('PG_PRIVILEGIOS_INVALIDOS');
            }
          } else {
            const migrations = (
              await query('SELECT nombre FROM public._migraciones ORDER BY nombre')
            ).rows.map((row) => row.nombre);
            if (JSON.stringify(migrations) !== JSON.stringify(inventory.migrations))
              fail('PG_MIGRACIONES_INVALIDAS');
            const layers = (
              await query(
                'SELECT capa,version,n_features FROM geo.capa_version WHERE vigente ORDER BY capa',
              )
            ).rows;
            for (const layer of ['distrito_municipal', 'unidad_vecinal', 'manzana']) {
              const found = layers.filter((item) => item.capa === layer);
              if (found.length !== 1 || Number(found[0].n_features) <= 0) fail('PG_CAPAS_AUSENTES');
              const count = (
                await query(
                  `SELECT count(*)::integer AS n FROM geo.${layer} WHERE version_capa=$1`,
                  [found[0].version],
                )
              ).rows[0]?.n;
              if (count !== Number(found[0].n_features)) fail('PG_CAPAS_AUSENTES');
            }
            const accounts = (
              await query(
                'SELECT rol,count(*)::integer AS n FROM public.usuario WHERE activo GROUP BY rol',
              )
            ).rows;
            if (
              !['ciudadano', 'tecnico', 'admin', 'ejecutivo'].every((r) =>
                accounts.some((row) => row.rol === r && row.n > 0),
              )
            )
              fail('PG_CUENTAS_AUSENTES');
            await privileges();
          }
        } finally {
          if (live) await query('ROLLBACK');
        }
      },
      async lock() {
        ready();
        if (
          (await query('SELECT pg_try_advisory_lock($1::bigint) AS ok', [lockKey])).rows[0]?.ok !==
          true
        )
          fail('PG_LOCK_FALLO');
        held = true;
      },
      async unlock() {
        ready(true);
        if (
          (await query('SELECT pg_advisory_unlock($1::bigint) AS ok', [lockKey])).rows[0]?.ok !==
          true
        )
          fail('PG_LOCK_FALLO');
        held = false;
      },
      async catalog() {
        return (await query(`SELECT ${columnsSql} FROM public.categoria ORDER BY slug`)).rows;
      },
      async timestamp() {
        return (
          await query(
            `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS value`,
          )
        ).rows[0]?.value;
      },
      async photoRefs() {
        return readOnly(
          `SELECT f.objeto_key,f.bytes,
            r.id IS NOT NULL AS linked_report,
            au.id IS NOT NULL AS author_present,
            up.id IS NOT NULL AS uploader_present,
            COALESCE(f.subido_por=r.autor_id,false) AS uploader_is_author,
            COALESCE(au.email ~ $1,false) AS author_e2e_generated,
            COALESCE(up.email ~ $1,false) AS uploader_e2e_generated,
            COALESCE(au.nombre=$2,false) AS author_fixture_name,
            COALESCE(up.nombre=$2,false) AS uploader_fixture_name,
            COALESCE(au.rol='ciudadano',false) AS author_citizen,
            COALESCE(up.rol='ciudadano',false) AS uploader_citizen,
            COALESCE(left(r.descripcion,length($3))=$3,false) AS description_fixture_prefix
          FROM public.reporte_foto f
          LEFT JOIN public.reporte r ON r.id=f.reporte_id
          LEFT JOIN public.usuario au ON au.id=r.autor_id
          LEFT JOIN public.usuario up ON up.id=f.subido_por
          WHERE f.reporte_id IS NOT NULL ORDER BY f.objeto_key`,
          [
            '^e2e-.*[0-9]{13}-[a-z0-9]{1,6}@curichi[.]test$',
            'Vecina de prueba',
            'Se junta agua hasta la rodilla cada vez que llueve fuerte. ',
          ],
        );
      },
      async scenario() {
        const rows = await readOnly(
          `WITH candidates AS (
          SELECT u.id, ST_PointOnSurface(u.geom) AS geom FROM geo.unidad_vecinal u
          JOIN geo.capa_version v ON v.capa='unidad_vecinal' AND v.vigente AND v.version=u.version_capa
        ), eligible AS (
          SELECT c.* FROM candidates c WHERE NOT EXISTS (SELECT 1 FROM public.reporte r
            WHERE ST_DWithin(ST_Transform(r.geom,32720),ST_Transform(c.geom,32720),1100))
        ) SELECT round(ST_Y(a.geom)::numeric,7)::double precision AS lat1,
          round(ST_X(a.geom)::numeric,7)::double precision AS lon1,
          round(ST_Y(b.geom)::numeric,7)::double precision AS lat2,
          round(ST_X(b.geom)::numeric,7)::double precision AS lon2
        FROM eligible a JOIN eligible b ON a.id<b.id
        AND ST_Distance(ST_Transform(a.geom,32720),ST_Transform(b.geom,32720))>2200
        ORDER BY a.id,b.id LIMIT 1`,
          [],
          true,
        );
        const row = rows[0];
        if (!row || !['lat1', 'lon1', 'lat2', 'lon2'].every((k) => Number.isFinite(row[k])))
          fail('ESCENARIO_AUSENTE');
        return {
          chromium: { lat: row.lat1, lon: row.lon1 },
          movil: { lat: row.lat2, lon: row.lon2 },
        };
      },
      async fixture(id, categoria, marker, point) {
        if (
          !UUID.test(id ?? '') ||
          !['bache', 'inundacion'].includes(categoria) ||
          !Number.isFinite(point?.lat) ||
          !Number.isFinite(point?.lon) ||
          !/^M6 [a-zA-Z0-9_-]+ (chromium|movil)/.test(marker)
        )
          fail('FIXTURE_INVALIDO');
        const rows = await readOnly(
          `SELECT id::text FROM public.reporte WHERE id=$1::uuid AND categoria=$2
          AND left(descripcion,length($3))=$3 AND ST_Equals(geom,ST_SetSRID(ST_MakePoint($4,$5),4326))`,
          [id, categoria, marker, point.lon, point.lat],
          true,
        );
        if (rows.length !== 1 || rows[0].id !== id) fail('FIXTURE_INVALIDO');
      },
      async isolated(id, ownIds) {
        if (
          !UUID.test(id ?? '') ||
          !Array.isArray(ownIds) ||
          !ownIds.includes(id) ||
          ownIds.some((value) => !UUID.test(value))
        )
          fail('FIXTURE_INVALIDO');
        const rows = await readOnly(
          `SELECT NOT EXISTS (SELECT 1 FROM public.reporte other
          WHERE NOT(other.id=ANY($2::uuid[])) AND ST_DWithin(ST_Transform(other.geom,32720),ST_Transform(own.geom,32720),1000)) AS ok
          FROM public.reporte own WHERE own.id=$1::uuid`,
          [id, ownIds],
          true,
        );
        if (rows[0]?.ok !== true) fail('AISLAMIENTO_FALLO');
      },
      async cas(before, after) {
        ready(true);
        fila(before);
        fila(after);
        if (role !== 'curichi' || before.orden !== after.orden) fail('PG_CAS_FALLO');
        let committing = false;
        await query('BEGIN');
        try {
          const values = [
            before.slug,
            before.activa,
            before.orden,
            before.activada_en,
            before.activada_por,
            after.activa,
            after.activada_en,
            after.activada_por,
          ];
          const updated = await query(
            `UPDATE public.categoria SET activa=$6,activada_en=$7::timestamptz,activada_por=$8::uuid
            WHERE slug=$1 AND activa=$2 AND orden=$3 AND activada_en IS NOT DISTINCT FROM $4::timestamptz
            AND activada_por IS NOT DISTINCT FROM $5::uuid RETURNING ${columnsSql}`,
            values,
          );
          if (updated.rowCount !== 1 || !iguales(updated.rows[0], after))
            fail('CATALOGO_CONFLICTO');
          ready(true);
          committing = true;
          const committed = await query('COMMIT');
          if (committed?.command !== 'COMMIT') {
            lost('error');
            fail('PG_COMMIT_INCIERTO');
          }
          ready(true);
        } catch (error) {
          if (committing) {
            lost('error');
            fail('PG_COMMIT_INCIERTO');
          }
          if (!live) fail('PG_SESSION_LOST');
          try {
            await query('ROLLBACK');
          } catch {
            lost('error');
          }
          if (error?.message === 'CATALOGO_CONFLICTO') fail('CATALOGO_CONFLICTO');
          fail('PG_CAS_FALLO');
        }
      },
    });
  };
}

const execFileAsync = promisify(execFile);

/** CIM solo en runtime Windows; nunca registra líneas de comando ni entornos. */
export function windowsHost({
  execute = execFileAsync,
  kill = process.kill,
  platform = process.platform,
  closureDirectory,
  runId,
  operations = fs,
} = {}) {
  const knownTrees = new Map();
  const naturalTrees = new Map();
  const activeStops = new Map();
  const bindClosure = (directory, id) => {
    if (
      !ID.test(id ?? '') ||
      path.basename(directory) !== 'cierres' ||
      path.basename(path.dirname(directory)) !== id ||
      (closureDirectory && path.resolve(closureDirectory) !== path.resolve(directory)) ||
      (runId && runId !== id)
    )
      fail('DIARIO_RUTA_INVALIDA');
    closureDirectory = path.resolve(directory);
    runId = id;
  };
  if (closureDirectory) bindClosure(closureDirectory, runId);
  const processFields = ['pid', 'parent', 'created', 'kind', 'fingerprint'];
  const closureKey = (expected) =>
    createHash('sha256')
      .update(JSON.stringify(processFields.map((field) => expected[field])))
      .digest('hex');
  async function loadClosure(expected) {
    if (!closureDirectory) return { known: [], natural: [], unfinished: [] };
    await physicalPath(closureDirectory, operations);
    let names;
    try {
      names = await operations.readdir(closureDirectory);
    } catch (e) {
      if (e.code === 'ENOENT') return { known: [], natural: [], unfinished: [] };
      throw e;
    }
    const records = [];
    const key = closureKey(expected);
    for (const name of names.filter((name) => name.startsWith(`${key}.`))) {
      if (name.endsWith('.interrupted')) continue;
      if (name.endsWith('.pending')) fail('DIARIO_INCOMPLETO');
      if (!new RegExp(`^${key}\\.[a-f0-9-]{36}\\.json$`).test(name))
        fail('DIARIO_EVIDENCIA_CAMBIO');
      let value;
      try {
        const raw = await operations.readFile(
          await physicalPath(path.join(closureDirectory, name), operations),
          'utf8',
        );
        if (raw.length > 1024 * 1024) fail('DIARIO_INCOMPLETO');
        value = JSON.parse(raw);
        if (
          ![1, 2].includes(value.schema) ||
          Object.keys(value).sort().join(',') !==
            (value.schema === 2
              ? 'attempt,known,natural,root,runId,schema,state'
              : 'attempt,known,root,runId,schema,state') ||
          value.runId !== runId ||
          !UUID.test(value.attempt ?? '') ||
          !['prepared', 'observed', 'closed'].includes(value.state) ||
          !value.root ||
          processFields.some((field) => value.root[field] !== expected[field]) ||
          !Array.isArray(value.known) ||
          value.known.length > 1024
        )
          fail('DIARIO_INCOMPLETO');
        identity(value.root);
        value.known.forEach(identity);
        if (value.known.some((id) => id.kind !== expected.kind)) fail('DIARIO_INCOMPLETO');
        if (value.schema === 2) {
          if (!Array.isArray(value.natural) || !value.natural.length || value.natural.length > 1024)
            fail('DIARIO_INCOMPLETO');
          const seen = new Set();
          for (const proof of value.natural) {
            if (
              Object.keys(proof).sort().join(',') !== 'identity,policy,subject,systemDirectory' ||
              proof.policy !== 'natural' ||
              !systemDirectory(proof.systemDirectory)
            )
              fail('DIARIO_INCOMPLETO');
            identity(proof.identity);
            identity(proof.subject);
            if (
              seen.has(proof.identity.pid) ||
              proof.identity.pid === expected.pid ||
              proof.identity.parent !== proof.subject.pid ||
              Date.parse(proof.identity.created) < Date.parse(proof.subject.created) ||
              [proof.identity, proof.subject].some(
                (id) =>
                  !value.known.some((known) =>
                    processFields.every((field) => known[field] === id[field]),
                  ),
              )
            )
              fail('DIARIO_INCOMPLETO');
            seen.add(proof.identity.pid);
          }
        }
      } catch {
        fail('DIARIO_INCOMPLETO');
      }
      records.push(value);
    }
    const unfinished = [
      ...new Set(
        records
          .filter(
            (record) =>
              record.state === 'prepared' &&
              !records.some(
                (other) =>
                  other.attempt === record.attempt && ['observed', 'closed'].includes(other.state),
              ),
          )
          .map((record) => record.attempt),
      ),
    ];
    return {
      known: records.flatMap((record) => record.known),
      natural: records.flatMap((record) => record.natural ?? []),
      unfinished,
    };
  }
  async function saveClosure(expected, known, attempt, state, natural = new Map()) {
    if (!closureDirectory) return;
    await physicalPath(closureDirectory, operations);
    await operations.mkdir(closureDirectory, { recursive: true });
    const file = path.join(closureDirectory, `${closureKey(expected)}.${randomUUID()}.json`);
    const temporary = `${file}.pending`;
    try {
      const handle = await operations.open(temporary, 'wx');
      try {
        await handle.writeFile(
          JSON.stringify({
            schema: natural.size ? 2 : 1,
            runId,
            root: expected,
            attempt,
            state,
            known: [...known.values()].map((id) => ({ ...id, kind: expected.kind })),
            ...(natural.size ? { natural: [...natural.values()] } : {}),
          }),
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await operations.rename(temporary, file);
    } catch {
      fail('FSYNC_FALLO');
    }
  }
  async function snapshot() {
    if (platform !== 'win32') fail('PLATAFORMA_NO_SOPORTADA');
    const script = `$ErrorActionPreference='Stop'; $os=Get-CimInstance Win32_OperatingSystem; $ps=@(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;created=$_.CreationDate.ToUniversalTime().ToString('o');command=[string]$_.CommandLine;exe=[string]$_.ExecutablePath} }); [pscustomobject]@{freeMiB=[math]::Floor($os.FreePhysicalMemory/1024);systemDirectory=[string]$os.SystemDirectory;processes=$ps;observerPid=[int]$PID}|ConvertTo-Json -Depth 4 -Compress`;
    try {
      const started = Date.now();
      const args = ['-NoProfile', '-NonInteractive', '-Command', script];
      const capture = execute('powershell.exe', args, {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 8 * 1024 ** 2,
        env: sanitizeEnvironment(process.env),
      });
      const observer = capture.child;
      const { stdout } = await capture;
      const data = JSON.parse(stdout);
      if (!Number.isFinite(data.freeMiB) || !Array.isArray(data.processes))
        fail('IDENTIDAD_INVALIDA');
      if (observer || data.observerPid !== undefined) {
        const matches = data.processes.filter((row) => row.pid === data.observerPid);
        const row = matches[0];
        // El stdout es del handle de ESTE execute. Nunca excluir un PS por su nombre.
        if (
          !observer ||
          !Number.isSafeInteger(observer.pid) ||
          observer.pid <= 0 ||
          observer.pid !== data.observerPid ||
          observer.exitCode !== 0 ||
          observer.signalCode !== null ||
          observer.spawnfile !== 'powershell.exe' ||
          JSON.stringify(observer.spawnargs) !== JSON.stringify(['powershell.exe', ...args]) ||
          matches.length !== 1 ||
          row.parent !== process.pid ||
          typeof row.created !== 'string' ||
          !Number.isFinite(Date.parse(row.created)) ||
          Date.parse(row.created) < started ||
          Date.parse(row.created) > Date.now() ||
          typeof row.exe !== 'string' ||
          path.basename(row.exe).toLowerCase() !== 'powershell.exe' ||
          typeof row.command !== 'string' ||
          !row.command
        )
          fail('IDENTIDAD_INVALIDA');
        // La fila exacta (PID/padre/created/exe/command) corresponde al probe ya terminado.
        data.processes = data.processes.filter((candidate) => candidate !== row);
      }
      return data;
    } catch {
      fail('IDENTIDAD_INVALIDA');
    }
  }
  function fingerprint(row) {
    return createHash('sha256').update(`${row.exe}\n${row.command}`).digest('hex');
  }
  function same(row, expected) {
    return (
      row &&
      row.pid === expected.pid &&
      row.parent === expected.parent &&
      row.created === expected.created &&
      fingerprint(row) === expected.fingerprint
    );
  }
  function systemDirectory(value) {
    return (
      typeof value === 'string' && /^[a-z]:\\/i.test(value) && path.win32.normalize(value) === value
    );
  }
  async function rejectProcess(stage, row, expected, fields) {
    if (closureDirectory) {
      const directory = path.resolve(closureDirectory, '../identidad');
      await physicalPath(directory, operations);
      await operations.mkdir(directory, { recursive: true });
      const file = path.join(directory, `${randomUUID()}.json`);
      const temporary = `${file}.pending`;
      try {
        const handle = await operations.open(temporary, 'wx');
        try {
          await handle.writeFile(
            JSON.stringify({
              schema: 1,
              runId,
              stage,
              fields,
              expected: Object.fromEntries(
                processFields.map((field) => [field, expected[field] ?? null]),
              ),
              actual: {
                pid: row.pid,
                parent: row.parent,
                created: row.created,
                fingerprint: fingerprint(row),
                exeHash: createHash('sha256').update(row.exe).digest('hex'),
                commandHash: createHash('sha256').update(row.command).digest('hex'),
              },
            }),
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        await operations.rename(temporary, file);
      } catch {
        fail('FSYNC_FALLO');
      }
    }
    fail('IDENTIDAD_PROCESO_CAMBIO');
  }
  return {
    bindClosure,
    async identify(pid, kind) {
      const row = (await snapshot()).processes.find((p) => p.pid === pid);
      if (!row) fail('IDENTIDAD_INVALIDA');
      const result = {
        pid,
        parent: row.parent,
        created: row.created,
        kind,
        fingerprint: fingerprint(row),
      };
      identity(result);
      return result;
    },
    async alive(expected) {
      const row = (await snapshot()).processes.find((p) => p.pid === expected.pid);
      if (!row) return false;
      if (!same(row, expected)) fail('IDENTIDAD_PROCESO_CAMBIO');
      return true;
    },
    async guard(minimum, own = []) {
      const data = await snapshot();
      if (data.freeMiB < minimum) fail('MEMORIA_INSUFICIENTE');
      if (
        data.processes.some(
          (row) =>
            !own.includes(row.pid) &&
            /(?:vitest|playwright[\\/].*cli|@playwright[\\/].*cli|next[\\/]dist[\\/]bin|typescript[\\/].*tsc|turbo.*run (?:test|typecheck|build))/.test(
              row.command,
            ),
        )
      )
        fail('PESADO_AJENO');
    },
    async stop(expected) {
      const key = `${expected.pid}:${expected.created}:${expected.fingerprint}`;
      if (activeStops.has(key)) return activeStops.get(key);
      const work = (async () => {
        const evidence = await loadClosure(expected);
        const data = await snapshot();
        const root = data.processes.find((row) => row.pid === expected.pid);
        const known = knownTrees.get(key) ?? new Map([[expected.pid, expected]]);
        const natural = naturalTrees.get(key) ?? new Map();
        for (const id of evidence.known) {
          if (known.has(id.pid) && JSON.stringify(known.get(id.pid)) !== JSON.stringify(id)) {
            const previous = known.get(id.pid);
            if (['parent', 'created', 'fingerprint'].some((field) => previous[field] !== id[field]))
              fail('DIARIO_EVIDENCIA_CAMBIO');
          }
          known.set(id.pid, id);
        }
        for (const proof of evidence.natural) {
          if (
            natural.has(proof.identity.pid) &&
            JSON.stringify(natural.get(proof.identity.pid)) !== JSON.stringify(proof)
          )
            fail('DIARIO_EVIDENCIA_CAMBIO');
          natural.set(proof.identity.pid, proof);
        }
        knownTrees.set(key, known);
        naturalTrees.set(key, natural);
        const attempt = evidence.unfinished[0] ?? randomUUID();
        if (evidence.unfinished.length > 1) fail('DIARIO_INCOMPLETO');
        const related = (rows) => {
          const ids = new Set(known.keys());
          const found = [];
          for (let changed = true; changed; ) {
            changed = false;
            for (const row of rows)
              if (row.pid !== row.parent && ids.has(row.parent) && !ids.has(row.pid)) {
                ids.add(row.pid);
                found.push(row);
                changed = true;
              }
          }
          return found;
        };
        const remember = (row) => ({
          pid: row.pid,
          parent: row.parent,
          created: row.created,
          kind: expected.kind,
          fingerprint: fingerprint(row),
        });
        const naturalValid = (capture) =>
          [...natural.values()].every((proof) => {
            if (
              !systemDirectory(capture.systemDirectory) ||
              capture.systemDirectory.toLowerCase() !== proof.systemDirectory.toLowerCase()
            )
              return false;
            const rows = capture.processes.filter((row) => row.pid === proof.identity.pid);
            const subjects = capture.processes.filter((row) => row.pid === proof.subject.pid);
            return (
              rows.length <= 1 &&
              subjects.length <= 1 &&
              (!rows.length ||
                (same(rows[0], proof.identity) &&
                  rows[0].exe.toLowerCase() ===
                    path.win32.join(capture.systemDirectory, 'conhost.exe').toLowerCase())) &&
              (!subjects.length ||
                (same(subjects[0], proof.subject) &&
                  path.win32.basename(subjects[0].exe).toLowerCase() === 'node.exe'))
            );
          });
        const finish = async (capture) => {
          const deadline = Date.now() + 5000;
          for (let poll = 0; ; poll++) {
            const late = related(capture.processes);
            for (const row of late) known.set(row.pid, remember(row));
            const live = capture.processes.filter((row) => known.has(row.pid));
            if (
              !naturalValid(capture) ||
              live.some((row) => !natural.has(row.pid) || !same(row, known.get(row.pid)))
            ) {
              await saveClosure(expected, known, attempt, 'observed', natural);
              fail('IDENTIDAD_PROCESO_CAMBIO');
            }
            if (!live.length) {
              await saveClosure(expected, known, attempt, 'closed', natural);
              return;
            }
            if (poll >= 4 || Date.now() >= deadline) {
              await saveClosure(expected, known, attempt, 'observed', natural);
              fail('IDENTIDAD_PROCESO_CAMBIO');
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
            capture = await snapshot();
          }
        };
        // Ausencia del root no prueba ausencia de hijos/identidades antes observadas.
        if (!root) {
          const remaining = related(data.processes);
          for (const row of remaining)
            known.set(row.pid, {
              pid: row.pid,
              parent: row.parent,
              created: row.created,
              fingerprint: fingerprint(row),
            });
          if (evidence.unfinished.length) fail('DIARIO_INCOMPLETO');
          return finish(data);
        }
        if (!same(root, expected))
          await rejectProcess(
            'root',
            root,
            expected,
            ['pid', 'parent', 'created', 'fingerprint'].filter(
              (field) =>
                (field === 'fingerprint' ? fingerprint(root) : root[field]) !== expected[field],
            ),
          );
        const tree = [root];
        for (let i = 0; i < tree.length; i++) {
          for (const row of data.processes.filter(
            (p) => p.parent === tree[i].pid && p.pid !== tree[i].pid,
          )) {
            if (
              !Number.isFinite(Date.parse(row.created)) ||
              Date.parse(row.created) < Date.parse(root.created)
            )
              await rejectProcess('descendant', row, expected, ['created']);
            const subject = tree[i];
            const isNatural =
              systemDirectory(data.systemDirectory) &&
              typeof row.exe === 'string' &&
              row.exe.toLowerCase() ===
                path.win32.join(data.systemDirectory, 'conhost.exe').toLowerCase() &&
              path.win32.basename(subject.exe).toLowerCase() === 'node.exe' &&
              typeof row.command === 'string' &&
              row.command.length > 0 &&
              typeof subject.command === 'string' &&
              subject.command.length > 0 &&
              Number.isFinite(Date.parse(subject.created)) &&
              Date.parse(row.created) >= Date.parse(subject.created) &&
              data.processes.filter((p) => p.pid === row.pid).length === 1 &&
              data.processes.filter((p) => p.pid === subject.pid).length === 1;
            if (
              !isNatural &&
              !/^(node|chrome|chromium|crashpad_handler)\.exe$/i.test(path.basename(row.exe))
            )
              await rejectProcess('descendant', row, expected, ['executable']);
            if (known.has(row.pid) && !same(row, known.get(row.pid)))
              await rejectProcess(
                'descendant',
                row,
                known.get(row.pid),
                ['pid', 'parent', 'created', 'fingerprint'].filter(
                  (field) =>
                    (field === 'fingerprint' ? fingerprint(row) : row[field]) !==
                    known.get(row.pid)[field],
                ),
              );
            known.set(row.pid, remember(row));
            if (isNatural) {
              const proof = {
                identity: remember(row),
                subject: remember(subject),
                systemDirectory: data.systemDirectory,
                policy: 'natural',
              };
              if (
                natural.has(row.pid) &&
                JSON.stringify(natural.get(row.pid)) !== JSON.stringify(proof)
              )
                fail('DIARIO_EVIDENCIA_CAMBIO');
              natural.set(row.pid, proof);
            }
            if (!tree.some((p) => p.pid === row.pid)) tree.push(row);
          }
        }
        // Publicar relaciones iniciales ANTES de matar: un fallo FS no autoriza continuar.
        if (!naturalValid(data)) fail('IDENTIDAD_PROCESO_CAMBIO');
        await saveClosure(expected, known, attempt, 'prepared', natural);
        // Un worker que muere no puede observar después su consola. Dejar pendiente durable.
        const selfNatural = expected.pid === process.pid && natural.size > 0;
        if (selfNatural) await saveClosure(expected, known, attempt, 'observed', natural);
        for (const row of tree.reverse()) {
          if (natural.has(row.pid)) continue;
          const capture = await snapshot();
          if (!naturalValid(capture)) fail('IDENTIDAD_PROCESO_CAMBIO');
          const current = capture.processes.find((p) => p.pid === row.pid);
          if (!current) continue;
          if (!same(current, { ...row, fingerprint: fingerprint(row) }))
            fail('IDENTIDAD_PROCESO_CAMBIO');
          try {
            kill(row.pid, 'SIGKILL');
          } catch (e) {
            if (e.code !== 'ESRCH') fail('IDENTIDAD_PROCESO_CAMBIO');
          }
        }
        if (selfNatural) fail('IDENTIDAD_PROCESO_CAMBIO');
        // No se promete atomicidad frente a reemplazo hostil de procesos entre CIM/kill.
        await finish(await snapshot());
      })();
      activeStops.set(key, work);
      try {
        return await work;
      } finally {
        activeStops.delete(key);
      }
    },
  };
}

export async function freePorts() {
  for (const port of [3000, 3001, 3002, 3100]) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', () => reject(new Error('PUERTO_OCUPADO')));
      server.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
        server.close((e) => (e ? reject(new Error('PUERTO_OCUPADO')) : resolve())),
      );
    });
  }
}

/** start queda detrás de record durable + mensaje IPC; parent disconnect aborta antes de importar. */
export function createLauncher({
  projectRoot,
  runId,
  host,
  spawn = fork,
  fetcher = fetch,
  operations = fs,
  ports = freePorts,
}) {
  if (!ID.test(runId ?? '')) fail('CORRIDA_INVALIDA');
  const owned = [];
  const handles = new Map();
  const gated = new Set();
  const module = fileURLToPath(import.meta.url);
  const artifacts = path.resolve(projectRoot, '.turbo/piloto-m6-artefactos', runId);
  const checkAbort = (signal) => {
    if (signal?.aborted) fail('INTERRUMPIDO');
  };
  const abortable = (work, signal) =>
    new Promise((resolve, reject) => {
      const finish = (error, value) => {
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(new Error('INTERRUMPIDO'));
      signal?.addEventListener('abort', abort, { once: true });
      Promise.resolve()
        .then(() => {
          checkAbort(signal);
          return work();
        })
        .then(
          (value) => finish(null, value),
          (error) => finish(error),
        );
      if (signal?.aborted) abort();
    });
  async function closeGated(child) {
    if (child.connected) child.disconnect();
    if (!Number.isSafeInteger(child.pid) || child.exitCode !== null || child.signalCode) return;
    // Antes de go, este handle no ha cargado producto ni puede tener su árbol de servicios.
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        child.off('exit', exit);
        error ? reject(error) : resolve();
      };
      const exit = () => finish();
      const timer = setTimeout(() => finish(new Error('IDENTIDAD_PROCESO_CAMBIO')), 5000);
      child.once('exit', exit);
      if (child.exitCode !== null || child.signalCode) finish();
    });
  }
  async function start(kind, env, record, signal) {
    checkAbort(signal);
    const child = spawn(module, ['--worker', kind, runId], {
      cwd: projectRoot,
      execPath: process.execPath,
      execArgv: [],
      windowsHide: true,
      env: { ...env, M6_PILOTO_RUN_ID: runId },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    child.on('error', () => {});
    const entry = { child };
    gated.add(entry);
    let observed;
    try {
      checkAbort(signal);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('SPAWN_PARCIAL')), 10_000);
        const finish = (error) => {
          clearTimeout(timer);
          child.off('message', message);
          child.off('error', errorEvent);
          child.off('exit', exit);
          signal?.removeEventListener('abort', abort);
          error ? reject(error) : resolve();
        };
        const message = (value) => {
          if (value?.ready === true) finish();
        };
        const errorEvent = () => finish(new Error('SPAWN_PARCIAL'));
        const exit = () => finish(new Error('SPAWN_PARCIAL'));
        const abort = () => finish(new Error('INTERRUMPIDO'));
        child.on('message', message);
        child.once('error', errorEvent);
        child.once('exit', exit);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
      checkAbort(signal);
      observed = await host.identify(child.pid, kind);
      owned.push(observed);
      handles.set(observed.pid, child);
      checkAbort(signal);
      await record(observed); // Si sync falla, jamás se habilita producto.
      checkAbort(signal);
      child.send({ go: randomUUID() });
      gated.delete(entry);
      return child;
    } catch {
      await closeGated(child);
      if (observed) await host.stop(observed);
      gated.delete(entry);
      checkAbort(signal);
      fail('SPAWN_PARCIAL');
    }
  }
  async function wait(url, child, probe = false, signal) {
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
      checkAbort(signal);
      if (child.exitCode !== null || child.signalCode) fail('SERVICIO_TERMINO');
      try {
        const response = await abortable(
          () =>
            fetcher(url, {
              signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
            }),
          signal,
        );
        checkAbort(signal);
        if (response.ok) {
          if (probe) {
            const ready = await abortable(() => response.json(), signal);
            if (ready.degradado || ready.db !== 'ok' || ready.geo !== 'ok' || ready.fotos !== 'ok')
              fail('SERVICIO_NO_LISTO');
          }
          return;
        }
      } catch (e) {
        checkAbort(signal);
        if (e.message === 'SERVICIO_NO_LISTO') throw e;
      }
      await new Promise((resolve, reject) => {
        const finish = (error) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          error ? reject(error) : resolve();
        };
        const abort = () => finish(new Error('INTERRUMPIDO'));
        const timer = setTimeout(() => finish(), 250);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
    fail('SERVICIO_NO_LISTO');
  }
  async function stop(identities) {
    for (const entry of [...gated]) {
      await closeGated(entry.child);
      gated.delete(entry);
    }
    const all = [...new Map([...identities, ...owned].map((id) => [id.pid, id])).values()];
    for (const id of all.reverse()) {
      await host.stop(id);
      const child = handles.get(id.pid);
      if (child?.connected) child.disconnect();
    }
    await ports();
  }
  return {
    owned,
    async services(envs, record, { signal } = {}) {
      try {
        for (const [kind, artifact] of [
          ['geo', 'services/geo-service/dist/servidor.js'],
          ['api', 'services/api-core/dist/servidor.js'],
          ['web', 'apps/web-ciudadano/.next/BUILD_ID'],
          ['panel', 'apps/panel-admin/.next/BUILD_ID'],
        ]) {
          checkAbort(signal);
          await operations.access(path.join(projectRoot, artifact));
          checkAbort(signal);
          const child = await start(kind, envs[kind], record, signal);
          // /ready escribe/borra sonda solo en almacén propio; nunca pertenece a --preflight.
          await wait(
            {
              geo: 'http://127.0.0.1:3002/health',
              api: 'http://127.0.0.1:3001/ready',
              web: 'http://127.0.0.1:3000/',
              panel: 'http://127.0.0.1:3100/login',
            }[kind],
            child,
            kind === 'api',
            signal,
          );
          checkAbort(signal);
        }
      } catch (error) {
        if (signal?.aborted) await stop(owned);
        throw error;
      }
    },
    async browser(env, record, { signal } = {}) {
      try {
        checkAbort(signal);
        const browser = env.PLAYWRIGHT_BROWSERS_PATH;
        if (typeof browser !== 'string' || !path.isAbsolute(browser))
          fail('CHROMIUM_EXISTENTE_AUSENTE');
        const names = await operations.readdir(browser);
        if (!names.some((name) => /^chromium-\d+$/.test(name))) fail('CHROMIUM_EXISTENTE_AUSENTE');
        await operations.mkdir(path.join(artifacts, 'tmp'), { recursive: true });
        await host.guard(
          2500,
          owned.map((p) => p.pid),
        );
        const child = await start(
          'playwright',
          { ...env, TEMP: path.join(artifacts, 'tmp'), TMP: path.join(artifacts, 'tmp') },
          record,
          signal,
        );
        const code = await new Promise((resolve, reject) => {
          const finish = (error, value) => {
            child.off('exit', exit);
            signal?.removeEventListener('abort', abort);
            error ? reject(error) : resolve(value);
          };
          const exit = (value) => finish(null, value);
          const abort = () => finish(new Error('INTERRUMPIDO'));
          if (child.exitCode !== null) finish(null, child.exitCode);
          else {
            child.once('exit', exit);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          }
        });
        checkAbort(signal);
        if (code !== 0) fail('BROWSER_FAILED');
      } catch (error) {
        if (signal?.aborted) await stop(owned);
        throw error;
      }
    },
    stop,
  };
}

async function workerMain(kind, runId) {
  if (
    !process.send ||
    !ID.test(runId ?? '') ||
    !['api', 'geo', 'web', 'panel', 'playwright'].includes(kind) ||
    process.env.M6_PILOTO_RUN_ID !== runId
  )
    fail('OPCIONES_INVALIDAS');
  let enabled = false;
  const timer = setTimeout(() => process.exit(2), 20_000);
  process.once('disconnect', () => {
    if (!enabled) process.exit(2);
    const host = windowsHost();
    host.bindClosure(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../.turbo/piloto-m6-artefactos',
        runId,
        'cierres',
      ),
      runId,
    );
    void host
      .identify(process.pid, kind)
      .then((id) => host.stop(id))
      .catch(() => process.exit(2));
  });
  process.once('message', async (message) => {
    if (!UUID.test(message?.go ?? '')) process.exit(2);
    clearTimeout(timer);
    enabled = true;
    try {
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
      if (kind === 'api' || kind === 'geo') {
        const role = kind === 'api' ? 'curichi_api' : 'curichi_geo';
        urlLocal(process.env.DATABASE_URL, role);
        if (
          process.env[kind === 'api' ? 'API_DATABASE_URL' : 'GEO_DATABASE_URL'] !==
            process.env.DATABASE_URL ||
          process.env.NODE_ENV !== 'test'
        )
          fail('DESTINO_NO_PERMITIDO');
        process.chdir(path.join(root, 'services', kind === 'api' ? 'api-core' : 'geo-service'));
        await import(pathToFileURL(path.join(process.cwd(), 'dist/servidor.js')).href);
      } else {
        const isTest = kind === 'playwright';
        const app = kind === 'web' ? 'web-ciudadano' : 'panel-admin';
        const script = path.join(
          root,
          isTest
            ? 'e2e/node_modules/@playwright/test/cli.js'
            : `apps/${app}/node_modules/next/dist/bin/next`,
        );
        process.chdir(path.join(root, isTest ? 'e2e' : `apps/${app}`));
        process.argv = [
          process.execPath,
          script,
          ...(isTest
            ? ['test', '--config', path.join(root, 'e2e/playwright.piloto-m6.config.ts')]
            : ['start', '-p', kind === 'web' ? '3000' : '3100', '--hostname', '127.0.0.1']),
        ];
        await import(pathToFileURL(script).href);
      }
    } catch {
      process.exitCode = 2;
      if (process.connected) process.disconnect();
    }
  });
  process.send({ ready: true });
}

async function physicalPath(file, operations = fs) {
  let current = path.resolve(file);
  for (;;) {
    try {
      if ((await operations.lstat(current)).isSymbolicLink()) fail('DIARIO_RUTA_INVALIDA');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const parent = path.dirname(current);
    if (parent === current) return file;
    current = parent;
  }
}

/** Solo referencias de pruebas: fallback habitual exige procedencia SQL compuesta por objeto. */
export function createPhotoStorage({
  projectRoot,
  runId,
  operations = fs,
  minFreeBytes = 2 * 1024 ** 3,
}) {
  if (!ID.test(runId ?? '') || !Number.isSafeInteger(minFreeBytes) || minFreeBytes < 0)
    fail('OPCIONES_INVALIDAS');
  const artifacts = path.resolve(projectRoot, '.turbo/piloto-m6-artefactos');
  const destination = path.join(artifacts, runId, 'fotos');
  let selected;
  async function readPhoto(source, ref) {
    const file = await physicalPath(path.join(source, ref.objeto_key), operations);
    let data;
    try {
      const stat = await operations.lstat(file);
      if (!stat.isFile() || stat.size !== ref.bytes) fail('ALMACEN_AUSENTE');
      data = await operations.readFile(file);
    } catch (e) {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    }
    if (data.byteLength !== ref.bytes) fail('ALMACEN_AUSENTE');
    return {
      file,
      key: ref.objeto_key,
      hash: createHash('sha256').update(data).digest('hex'),
      bytes: ref.bytes,
    };
  }
  return {
    destination,
    async inspect(client) {
      selected = undefined;
      const sources = [
        '.turbo/cierre-m4-2026-10-14/fotos-e2e',
        '.turbo/m6-2026-10-18/fb/fotos',
        '.turbo/m6-2026-10-18/m6-6/fotos',
      ].map((name) => path.resolve(projectRoot, name));
      await physicalPath(artifacts, operations);
      try {
        for (const name of await operations.readdir(artifacts))
          if (ID.test(name)) sources.push(path.join(artifacts, name, 'fotos'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const refs = await client.photoRefs();
      if (!Array.isArray(refs) || !refs.length) fail('ALMACEN_AUSENTE');
      const manifest = [];
      let bytes = 0;
      for (const ref of refs) {
        if (
          !/^[a-f0-9-]{36}\.(webp|jpg|png)$/.test(ref.objeto_key ?? '') ||
          !Number.isSafeInteger(ref.bytes) ||
          ref.bytes <= 0 ||
          ref.bytes > 20 * 1024 ** 2
        )
          fail('ALMACEN_AUSENTE');
        let selectedFile;
        for (const source of sources) {
          const photo = await readPhoto(source, ref);
          if (!photo) continue;
          if (selectedFile && selectedFile.hash !== photo.hash) fail('ALMACEN_AUSENTE');
          selectedFile = photo;
        }
        if (!selectedFile) {
          // Solo booleanos calculados por photoRefs READ ONLY, nunca inferidos del basename.
          // marca:string del helper es libre: el sufijo E2E- no forma parte de este criterio.
          if (
            ![
              'linked_report',
              'author_present',
              'uploader_present',
              'uploader_is_author',
              'author_e2e_generated',
              'uploader_e2e_generated',
              'author_fixture_name',
              'uploader_fixture_name',
              'author_citizen',
              'uploader_citizen',
              'description_fixture_prefix',
            ].every((field) => ref[field] === true)
          )
            fail('ALMACEN_AUSENTE');
          // No readdir ni búsqueda por semejanza en el almacén habitual.
          selectedFile = await readPhoto(path.resolve(projectRoot, 'infra/.storage/fotos'), ref);
        }
        if (!selectedFile) fail('ALMACEN_AUSENTE');
        manifest.push(selectedFile);
        bytes += ref.bytes;
      }
      const disk = await operations.statfs(
        await physicalPath(path.resolve(projectRoot, '.turbo'), operations),
      );
      if (disk.bavail * disk.bsize < minFreeBytes + bytes) fail('ALMACEN_AUSENTE');
      selected = manifest;
      return { readOnly: true, photos: manifest.length, bytes };
    },
    async prepare() {
      if (!selected) fail('ALMACEN_AUSENTE');
      await physicalPath(destination, operations);
      await operations.mkdir(destination, { recursive: true });
      for (const photo of selected) {
        const file = await physicalPath(path.join(destination, photo.key), operations);
        const source = await readPhoto(path.dirname(photo.file), {
          objeto_key: photo.key,
          bytes: photo.bytes,
        });
        if (!source || source.hash !== photo.hash) fail('ALMACEN_AUSENTE');
        await operations.copyFile(photo.file, file, fsConstants.COPYFILE_EXCL);
        if (
          createHash('sha256')
            .update(await operations.readFile(file))
            .digest('hex') !== photo.hash
        )
          fail('ALMACEN_AUSENTE');
      }
      return destination;
    },
  };
}

/** Canal local: solo nombres finales se leen. .pending se conserva como evidencia. */
export function createControlChannel({
  directory,
  runId,
  operations = fs,
  now = Date.now,
  timers = { setTimeout, clearTimeout },
}) {
  if (
    !ID.test(runId ?? '') ||
    path.basename(directory) !== 'control' ||
    path.basename(path.dirname(directory)) !== runId
  )
    fail('CONTROL_RUTA_INVALIDA');
  const base = path.resolve(directory);
  const cancelled = (signal) => {
    if (signal?.aborted) fail('CONTROL_CANCELADO');
  };
  async function physical(file) {
    let current = file;
    for (;;) {
      try {
        if ((await operations.lstat(current)).isSymbolicLink()) fail('CONTROL_RUTA_INVALIDA');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const parent = path.dirname(current);
      if (parent === current) return file;
      current = parent;
    }
  }
  function validate(kind, value, nonce) {
    const fields =
      kind === 'request'
        ? ['schema', 'runId', 'nonce', 'project', 'action', 'id', 'categoria']
        : [
            'schema',
            'runId',
            'nonce',
            'ok',
            'phase',
            'database',
            'id',
            'categoria',
            'aislado',
            'metodo',
          ];
    if (
      !['request', 'response'].includes(kind) ||
      !value ||
      Object.keys(value).some((k) => !fields.includes(k)) ||
      value.schema !== 1 ||
      value.runId !== runId ||
      !UUID.test(value.nonce ?? '') ||
      value.nonce !== nonce ||
      (value.id !== undefined && !UUID.test(value.id)) ||
      (value.categoria !== undefined && !['bache', 'inundacion'].includes(value.categoria))
    )
      fail('CONTROL_INVALIDO');
    if (kind === 'request') {
      if (
        !['chromium', 'movil'].includes(value.project) ||
        !['estado', 'registrar', 'aislamiento'].includes(value.action) ||
        (value.action === 'estado'
          ? value.id !== undefined || value.categoria !== undefined
          : !value.id || !value.categoria)
      )
        fail('CONTROL_INVALIDO');
    } else if (
      typeof value.ok !== 'boolean' ||
      (value.phase !== undefined && !['prepared', 'applied', 'restored'].includes(value.phase)) ||
      (value.database !== undefined && value.database !== 'curichi_e2e') ||
      (value.aislado !== undefined && typeof value.aislado !== 'boolean') ||
      (value.metodo !== undefined && value.metodo !== 'postgis_crs_metrico')
    )
      fail('CONTROL_INVALIDO');
    return value;
  }
  const channel = {
    async publish(kind, value, { signal } = {}) {
      cancelled(signal);
      validate(kind, value, value?.nonce);
      const file = await physical(path.join(base, `${value.nonce}.${kind}.json`));
      try {
        await operations.lstat(file);
        fail('CONTROL_DUPLICADO');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const temporary = await physical(`${file}.${randomUUID()}.pending`);
      const handle = await operations.open(temporary, 'wx');
      try {
        cancelled(signal);
        await handle.writeFile(JSON.stringify(value));
        await handle.sync();
      } finally {
        await handle.close();
      }
      cancelled(signal);
      await operations.rename(temporary, file);
      return value.nonce;
    },
    async read(kind, nonce, { signal } = {}) {
      cancelled(signal);
      if (!UUID.test(nonce ?? '') || !['request', 'response'].includes(kind))
        fail('CONTROL_INVALIDO');
      let raw;
      try {
        raw = await operations.readFile(
          await physical(path.join(base, `${nonce}.${kind}.json`)),
          'utf8',
        );
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
      cancelled(signal);
      let value;
      try {
        if (raw.length > 2048) fail('CONTROL_INVALIDO');
        value = JSON.parse(raw);
      } catch {
        fail('CONTROL_INVALIDO');
      }
      return validate(kind, value, nonce);
    },
    async requests() {
      await physical(base);
      return (await operations.readdir(base))
        .filter((name) => /^[a-f0-9-]{36}\.request\.json$/.test(name))
        .map((name) => name.slice(0, 36));
    },
    async request(value, { signal, timeoutMs = 15_000 } = {}) {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000)
        fail('CONTROL_INVALIDO');
      const deadline = now() + timeoutMs;
      await channel.publish('request', value, { signal });
      for (;;) {
        cancelled(signal);
        if (now() >= deadline) fail('CONTROL_TIMEOUT');
        const response = await channel.read('response', value.nonce, { signal });
        if (response) {
          if (!response.ok) fail('CONTROL_RECHAZADO');
          return response;
        }
        await new Promise((resolve, reject) => {
          const abort = () => {
            timers.clearTimeout(timer);
            reject(new Error('CONTROL_CANCELADO'));
          };
          const timer = timers.setTimeout(
            () => {
              signal?.removeEventListener('abort', abort);
              resolve();
            },
            Math.min(100, deadline - now()),
          );
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
        });
      }
    },
  };
  return channel;
}

export async function requestControl({ directory, runId, message, signal, timeoutMs }) {
  return createControlChannel({ directory, runId }).request(message, { signal, timeoutMs });
}

/** Un único consumidor serial; toda decisión espacial la toma PG de solo lectura. */
export function createControlServer({ channel, client, runId, points, phase }) {
  const completed = new Set();
  const reports = new Map();
  return {
    async poll(signal) {
      for (const nonce of await channel.requests()) {
        if (signal?.aborted) return;
        if (completed.has(nonce)) continue;
        const request = await channel.read('request', nonce, { signal });
        if (!request) continue;
        if (phase() !== 'applied') fail('CONTROLADOR_TERMINO');
        const response = { schema: 1, runId, nonce, ok: true };
        if (request.action === 'estado') {
          const catalog = await client.catalog();
          if (
            !['bache', 'inundacion'].every((slug) =>
              catalog.some((row) => row.slug === slug && row.activa),
            )
          )
            fail('CATALOGO_CONFLICTO');
          Object.assign(response, { phase: 'applied', database: 'curichi_e2e' });
        } else {
          await client.fixture(
            request.id,
            request.categoria,
            `M6 ${runId} ${request.project}`,
            points[request.project],
          );
          if (request.action === 'registrar')
            reports.set(request.id, { project: request.project, categoria: request.categoria });
          else {
            const registered = reports.get(request.id);
            if (
              registered?.project !== request.project ||
              registered.categoria !== request.categoria
            )
              fail('FIXTURE_INVALIDO');
            await client.isolated(request.id, [...reports.keys()]);
            Object.assign(response, { aislado: true, metodo: 'postgis_crs_metrico' });
          }
          Object.assign(response, { id: request.id, categoria: request.categoria });
        }
        await channel.publish('response', response, { signal });
        completed.add(nonce);
      }
    },
  };
}

async function writeArtifact(directory, name, value) {
  if (!['escenario.json', 'procesos.json', 'resultado.json'].includes(name))
    fail('DIARIO_RUTA_INVALIDA');
  const file = await physicalPath(path.join(directory, name));
  const temporary = `${file}.${randomUUID()}.pending`;
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, file);
}

export async function createRuntime({
  options,
  sourceEnv,
  inheritedEnv,
  browserPath,
  projectRoot,
  host = windowsHost(),
  pgFactory,
  launcher: suppliedLauncher,
  photoStorage,
  store: suppliedStore,
  operations = fs,
  ports = freePorts,
}) {
  validateUrls(options.urls);
  const runId =
    options.mode === 'restaurar' ? path.basename(path.dirname(options.journalPath)) : options.runId;
  const artifacts = path.resolve(projectRoot, '.turbo/piloto-m6-artefactos', runId);
  host.bindClosure?.(path.join(artifacts, 'cierres'), runId);
  const owner = await host.identify(process.pid, 'coordinator');
  const store =
    suppliedStore ??
    diskStore(path.resolve(projectRoot, '.turbo/piloto-m6'), {
      owner,
      alive: (id) => host.alive(id),
    });
  const factory = pgFactory ?? createPgFactory({ urls: options.urls });
  const photos = photoStorage ?? createPhotoStorage({ projectRoot, runId });
  const launcher = suppliedLauncher ?? createLauncher({ projectRoot, runId, host });
  const clients = [];
  let client;
  let points;
  let currentPhase;
  let record;
  const cancellation = new AbortController();
  const runtimeSignal = options.signal
    ? AbortSignal.any([cancellation.signal, options.signal])
    : cancellation.signal;
  let controlLoop;
  let controlError;
  const own = [];
  let artifactsCreated = false;
  const deps = {
    store,
    signals: process,
    async clientFactory(...args) {
      const result = await factory(...args);
      clients.push(result);
      if (args[1] === 'curichi') client = result;
      return result;
    },
    async storage(connected) {
      if (options.mode === 'restaurar') return; // Recuperación no depende de fotos ni builds.
      await photos.inspect(connected);
      const catalog = await connected.catalog();
      if (
        !catalog.some((row) => row.slug === 'inundacion' && row.activa) ||
        catalog.some((row) => row.slug !== 'inundacion' && row.activa)
      )
        fail('CATALOGO_NO_BASELINE');
      if (options.mode === 'preflight') return;
      for (const file of [
        'services/api-core/dist/servidor.js',
        'services/geo-service/dist/servidor.js',
        'apps/web-ciudadano/.next/BUILD_ID',
        'apps/panel-admin/.next/BUILD_ID',
        'apps/web-ciudadano/public/maplibre/maplibre-gl-worker.mjs',
        'apps/panel-admin/public/maplibre/maplibre-gl-worker.mjs',
      ])
        await operations.access(path.join(projectRoot, file));
      if (typeof browserPath !== 'string' || !path.isAbsolute(browserPath))
        fail('CHROMIUM_EXISTENTE_AUSENTE');
      const browsers = await operations.readdir(browserPath);
      let full = false;
      for (const name of browsers.filter((n) => /^chromium-\d+$/.test(n))) {
        for (const suffix of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
          try {
            await operations.access(path.join(browserPath, name, suffix));
            full = true;
          } catch {
            /* Otro layout existente. */
          }
        }
      }
      if (!full) fail('CHROMIUM_EXISTENTE_AUSENTE');
      if (options.mode === 'piloto') points = await connected.scenario();
      await physicalPath(artifacts);
      await fs.mkdir(path.dirname(artifacts), { recursive: true });
      await fs.mkdir(artifacts);
      artifactsCreated = true;
      await photos.prepare();
      if (options.mode === 'piloto') {
        await fs.mkdir(path.join(artifacts, 'control'));
        await writeArtifact(artifacts, 'escenario.json', { schema: 1, runId, puntos: points });
      }
    },
    ports,
    async checkpoint(_name, journal) {
      if (journal) currentPhase = journal.state;
    },
    async start({ envs, record: durableRecord, signal }) {
      record = async (id) => {
        await durableRecord(id);
        own.push(copia(id));
        await writeArtifact(artifacts, 'procesos.json', { schema: 1, runId, processes: own });
      };
      const fixed = {
        API_CORE_HOST: '127.0.0.1',
        API_CORE_PORT: '3001',
        GEO_SERVICE_HOST: '127.0.0.1',
        GEO_SERVICE_PORT: '3002',
        API_CORE_URL: 'http://127.0.0.1:3001',
        GEO_SERVICE_URL: 'http://127.0.0.1:3002',
        PANEL_ADMIN_URL: 'http://localhost:3100',
        CORS_ORIGENES: 'http://localhost:3000,http://localhost:3100',
        PUBLIC_BASE_URL: '',
        COOKIE_SEGURA: '0',
        TRUST_PROXY: '0',
        HSTS: '0',
        REPORTES_POR_DIA_POR_CUENTA: '3',
        REPORTE_DEMORA_PRIMERO_S: '2',
        REPORTE_DEMORA_SIGUIENTES_S: '4',
        RATE_LIMIT_REPORTES_POR_HORA: '1000',
        RATE_LIMIT_LECTURAS_POR_MINUTO: '100000',
        GEO_RATE_LIMIT_POR_MINUTO: '100000',
        GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO: '100000',
        LOGIN_PETICIONES_POR_VENTANA: '1000',
        REGISTRO_PETICIONES_POR_VENTANA: '1000',
        REGISTRO_MAX_POR_IP: '1000',
        ALTAS_POR_DIA_POR_IP: '10000',
        LOGIN_MAX_FALLOS_IP: '100000',
        LOGIN_MAX_FALLOS_EMAIL: '100000',
        NEXT_TELEMETRY_DISABLED: '1',
      };
      const allowed = Object.fromEntries(
        Object.entries(sourceEnv).filter(([key]) =>
          /^CIUDAD_|^(ZONA_HORARIA|IP_HASH_SAL|JITTER_SAL|GEO_TOKEN_INTERNO)$/.test(key),
        ),
      );
      for (const kind of ['api', 'geo', 'web', 'panel'])
        envs[kind] = {
          ...envs[kind],
          ...fixed,
          ...(['api', 'geo'].includes(kind)
            ? { ...allowed, STORAGE_DIR: photos.destination, S3_ENDPOINT: '' }
            : {}),
        };
      await launcher.services(envs, record, {
        signal: signal ? AbortSignal.any([runtimeSignal, signal]) : runtimeSignal,
      });
    },
    async run() {
      if (options.mode === 'piloto') {
        const server = createControlServer({
          channel: createControlChannel({ directory: path.join(artifacts, 'control'), runId }),
          client,
          runId,
          points,
          phase: () => currentPhase,
        });
        controlLoop = (async () => {
          while (!cancellation.signal.aborted) {
            await server.poll(cancellation.signal);
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        })().catch((error) => {
          if (!cancellation.signal.aborted) {
            controlError = error;
            deps.cancel();
          }
        });
      }
      try {
        await launcher.browser(
          {
            ...sanitizeEnvironment(inheritedEnv),
            M6_PILOTO_MODO: options.mode,
            M6_PILOTO_RUN_ID: runId,
            ...(options.mode === 'grupo' ? { M6_PILOTO_GRUPO: options.group } : {}),
            ...(options.diagnosticMap ? { M6_DIAGNOSTICO_MAPA: '1' } : {}),
            PLAYWRIGHT_BROWSERS_PATH: browserPath,
            PANEL_ADMIN_URL: 'http://localhost:3100',
            NEXT_TELEMETRY_DISABLED: '1',
          },
          record,
          { signal: runtimeSignal },
        );
      } catch (error) {
        throw controlError ?? error;
      }
      if (controlError) throw controlError;
    },
    cancel() {
      cancellation.abort();
      for (const connected of clients) connected.cancel?.();
      void launcher.stop(own).catch(() => {});
    },
    async stop(identities) {
      cancellation.abort();
      await controlLoop;
      await launcher.stop(identities);
    },
  };
  return {
    deps,
    async finish(result) {
      if (artifactsCreated) await writeArtifact(artifacts, 'resultado.json', result);
    },
  };
}

const approvedSources = [
  'e2e/scripts/piloto-m6.mjs',
  'e2e/scripts/piloto-m6.test.mjs',
  'e2e/playwright.piloto-m6.config.ts',
  'e2e/tests/piloto-m6.piloto.ts',
  'e2e/README.md',
];
export async function verifyRuntimeReview(projectRoot) {
  let receipt;
  try {
    receipt = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, '.turbo/m6-2026-10-18/m6-6/revision-runtime.json'),
        'utf8',
      ),
    );
  } catch {
    fail('ADAPTADORES_NO_REVISADOS');
  }
  if (
    receipt?.schema !== 1 ||
    receipt.accepted !== true ||
    Object.keys(receipt.hashes ?? {})
      .sort()
      .join('|') !== [...approvedSources].sort().join('|')
  )
    fail('ADAPTADORES_NO_REVISADOS');
  for (const source of approvedSources) {
    const hash = createHash('sha256')
      .update(await fs.readFile(path.join(projectRoot, source)))
      .digest('hex');
    if (receipt.hashes[source] !== hash) fail('ADAPTADORES_NO_REVISADOS');
  }
}

export async function runCli(
  args,
  {
    projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    inheritedEnv = process.env,
    sourceEnv,
    review = verifyRuntimeReview,
    runtimeFactory = createRuntime,
    host = windowsHost(),
  } = {},
) {
  parseArgs(args);
  const source = sourceEnv ?? parseEnv(await fs.readFile(path.join(projectRoot, '.env'), 'utf8'));
  const options = prepareCli(args, source, projectRoot);
  options.inheritedEnv = sanitizeEnvironment(inheritedEnv);
  const browserPath = inheritedEnv.PLAYWRIGHT_BROWSERS_PATH;
  await review(projectRoot); // Falta receipt del corte auditado: cero clientes, CLI cerrada.
  await host.guard(options.mode === 'preflight' || options.mode === 'restaurar' ? 1500 : 2500);
  const runtime = await runtimeFactory({
    options,
    sourceEnv: source,
    inheritedEnv,
    browserPath,
    projectRoot,
    host,
  });
  let outcome;
  try {
    outcome = await coordinate(options, runtime.deps);
    await runtime.finish({ schema: 1, status: outcome.status });
    return outcome;
  } catch (error) {
    const code = CODIGOS.has(error?.message) ? error.message : 'M6_FALLO';
    await runtime.finish({ schema: 1, status: 'FAILED', code });
    fail(code);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--worker') {
    try {
      await workerMain(process.argv[3], process.argv[4]);
    } catch {
      process.exitCode = 2;
    }
  } else {
    try {
      const result = await runCli(process.argv.slice(2));
      process.stdout.write(`${result.status}\n`);
    } catch (error) {
      process.stderr.write(`${CODIGOS.has(error?.message) ? error.message : 'M6_FALLO'}\n`);
      process.exitCode = 2;
    }
  }
}
