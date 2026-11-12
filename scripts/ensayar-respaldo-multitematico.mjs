#!/usr/bin/env node
// M10.3. Importar y consultar estado no abre conexiones ni ejecuta procesos.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { freemem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { respaldarNode, restaurarNode, snapshot, verificar } from './respaldo.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = resolve(RAIZ, '.turbo/m10-3-2026-10-27/implementador');
const ENSAYO = resolve(SCRATCH, 'ensayo');
const CORRECCION = resolve(SCRATCH, 'correccion-gpg');
const HIJO = resolve(CORRECCION, 'continuacion-02');
const CIERRE = resolve(SCRATCH, '../cierre');
const FREEZE_ANTERIOR = '31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f';
const DIARIO_ANTERIOR = '365a8a89aedb963c88ad7a119eac15589bdfe12d0c76fded16fcd62efcaa6d57';
const DUMP_ANTERIOR = '3794a55bc944c3bd47c2b8cfe54232ad3e8da288658ca93437395f70b2c80562';
const PREFIJO = 'curichi_sdd_m10_20261027_';
export const BASES = Object.freeze(
  ['actual', 'copia_actual', 'pre0020', 'copia_pre0020'].map((s) => PREFIJO + s),
);
export const FUENTES = Object.freeze([
  'scripts/respaldo.mjs',
  'scripts/respaldo.test.mjs',
  'infra/respaldo/respaldo.sh',
  'infra/respaldo/respaldo.test.sh',
  'scripts/ensayar-respaldo-multitematico.mjs',
  'scripts/ensayar-respaldo-multitematico.test.mjs',
  '.github/workflows/ci.yml',
  'docs/operaciones/respaldo-y-restauracion.md',
]);
export const ETAPAS = Object.freeze([
  'preflight',
  ...['actual', 'pre0020'].flatMap((c) =>
    ['crear', 'sembrar', 'respaldar', 'cifrar', 'restaurar', 'verificar', 'negativos'].map(
      (a) => `${a}_${c}`,
    ),
  ),
]);
const ARCHIVOS = new Set([
  'diario.json',
  'diario.lock',
  ...['actual', 'pre0020'].flatMap((c) => [
    `${c}.dump`,
    `${c}.dump.migracion`,
    `${c}.dump.gpg`,
    `${c}.descifrado.dump`,
  ]),
]);
const sha = (dato) => createHash('sha256').update(dato).digest('hex');
const exigir = (valor, mensaje) => {
  if (!valor) throw new Error(mensaje);
};

export function validarNombre(nombre) {
  exigir(BASES.includes(nombre), 'base fuera de los cuatro nombres autorizados');
  return nombre;
}
export function validarConexion(texto) {
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new Error('conexión inválida');
  }
  exigir(
    url.protocol === 'postgresql:' &&
      url.hostname === '127.0.0.1' &&
      url.port === '5432' &&
      url.username === 'curichi' &&
      url.pathname === '/template1' &&
      !url.search &&
      !url.hash,
    'conexión fuera de loopback/template1/rol dueño autorizados',
  );
  return url;
}
export function rutaArtefacto(nombre) {
  exigir(ARCHIVOS.has(nombre), 'ruta de artefacto no permitida');
  return resolve(ENSAYO, nombre);
}
export function rutaContinuacion(nombre) {
  exigir(ARCHIVOS.has(nombre), 'artefacto de continuación no permitido');
  return ['actual.dump', 'actual.dump.migracion'].includes(nombre)
    ? rutaArtefacto(nombre)
    : resolve(HIJO, nombre);
}
const serializar = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** Conversión exclusiva de argumentos para el runtime MSYS de Git GPG. No toca filesystem. */
export function rutaGitGpg(ruta) {
  exigir(
    typeof ruta === 'string' &&
      !Array.from(ruta).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
    'ruta GPG inválida',
  );
  const n = ruta.replaceAll('\\', '/');
  const windows = /^([a-zA-Z]):\/(.+)$/.exec(n);
  const posix = windows ? `/${windows[1].toLowerCase()}/${windows[2]}` : n;
  exigir(
    /^\/[a-z]\/.+/.test(posix) &&
      !posix.includes(':') &&
      posix
        .split('/')
        .slice(1)
        .every((p) => p && p !== '.' && p !== '..'),
    'ruta GPG ambigua',
  );
  return posix;
}
export function redactarDiagnostico(texto, secretos = []) {
  let salida = String(texto ?? '');
  for (const secreto of secretos) if (secreto) salida = salida.replaceAll(secreto, '<privado>');
  return Array.from(salida.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '<URL privada>'))
    .filter((c) => (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) || c === '\n' || c === '\t')
    .join('')
    .slice(0, 2048);
}
export async function probarHomeGpg(home, { ejecutar } = {}) {
  exigir(typeof ejecutar === 'function', 'probe GPG requiere operador inyectado');
  const esperado = rutaGitGpg(home);
  const hogar = await ejecutar(GPGCONF, ['--homedir', esperado, '--list-dirs', 'homedir']);
  exigir(hogar.recibo?.exit === 0, 'probe home GPG falló');
  exigir(hogar.salida === esperado, 'home GPG mal interpretado');
  const socket = await ejecutar(GPGCONF, ['--homedir', esperado, '--list-dirs', 'agent-socket']);
  exigir(socket.recibo?.exit === 0, 'probe socket GPG falló');
  exigir(socket.salida === `${esperado}/S.gpg-agent`, 'socket GPG fuera del home propio');
  return { home: esperado, socket: socket.salida };
}
/** Misma operación de cifrado para ambos casos; todos sus efectos se inyectan en pruebas. */
export async function cifrarConGpg({
  home,
  entrada,
  cifrado,
  descifrado,
  ejecutar,
  archivos,
  checkpoint,
  nuevaClave,
} = {}) {
  exigir(
    [ejecutar, checkpoint, nuevaClave, archivos?.existe, archivos?.crearHome, archivos?.leer].every(
      (f) => typeof f === 'function',
    ),
    'cifrado requiere operadores inyectados',
  );
  exigir(
    !archivos.existe(home) && !archivos.existe(cifrado) && !archivos.existe(descifrado),
    'artefacto/home GPG existente; no reutilizar',
  );
  const h = rutaGitGpg(home),
    i = rutaGitGpg(entrada),
    c = rutaGitGpg(cifrado),
    d = rutaGitGpg(descifrado);
  const lanzar = async (...args) => {
    const r = await ejecutar(...args);
    exigir(r.recibo?.exit === 0, 'operador GPG falló');
    return r;
  };
  archivos.crearHome(home);
  let comprobado = false;
  try {
    const probe = await probarHomeGpg(home, { ejecutar: lanzar });
    comprobado = true;
    await checkpoint({ probe });
    const clave = nuevaClave();
    exigir(
      typeof clave === 'string' && clave.length >= 20 && !/[\r\n]/.test(clave),
      'clave de ensayo inválida',
    );
    const comun = [
      '--no-options',
      '--homedir',
      h,
      '--batch',
      '--no-tty',
      '--no-symkey-cache',
      '--pinentry-mode',
      'loopback',
      '--passphrase-fd',
      '0',
    ];
    const opciones = { input: `${clave}\n`, secretos: [clave] };
    const recibos = [];
    recibos.push(
      (
        await lanzar(
          GPG,
          [
            ...comun,
            '--symmetric',
            '--cipher-algo',
            'AES256',
            '--s2k-mode',
            '3',
            '--s2k-digest-algo',
            'SHA512',
            '--s2k-count',
            '65011712',
            '--compress-algo',
            'none',
            '--output',
            c,
            i,
          ],
          opciones,
        )
      ).recibo,
    );
    const encriptado = archivos.leer(cifrado);
    await checkpoint({ archivo: 'cifrado', bytes: encriptado.length, sha256: sha(encriptado) });
    recibos.push((await lanzar(GPG, [...comun, '--decrypt', '--output', d, c], opciones)).recibo);
    const a = archivos.leer(entrada),
      b = archivos.leer(descifrado);
    await checkpoint({
      archivo: 'descifrado',
      bytes: b.length,
      sha256: sha(b),
      byteequal: a.equals(b),
    });
    exigir(a.equals(b) && sha(a) === sha(b), 'cifrado no conserva bytes');
    return {
      recibos,
      probe,
      bytes: a.length,
      sha256: sha(a),
      sha256Cifrado: sha(encriptado),
      sha256Descifrado: sha(b),
      byteequal: true,
    };
  } finally {
    try {
      for (const [nombre, ruta] of [
        ['cifrado', cifrado],
        ['descifrado', descifrado],
      ])
        if (archivos.existe(ruta)) {
          const contenido = archivos.leer(ruta);
          await checkpoint({ archivo: nombre, bytes: contenido.length, sha256: sha(contenido) });
        }
    } finally {
      if (comprobado) await lanzar(GPGCONF, ['--homedir', h, '--kill', 'gpg-agent']);
    }
  }
}

/** Exclusiva del intento real identificado: no es un reset ni una política general de retry. */
export function planificarContinuacion(p) {
  exigir(
    p?.freezeAnterior === FREEZE_ANTERIOR &&
      p.diarioSha256 === DIARIO_ANTERIOR &&
      /^[a-f0-9]{64}$/.test(p.freezeNuevo) &&
      p.freezeNuevo !== FREEZE_ANTERIOR,
    'enlace de freezes/diario inválido',
  );
  const original = p.diarioOriginal;
  validarDiario(original);
  exigir(
    original.freeze === FREEZE_ANTERIOR &&
      JSON.stringify(Object.keys(original.etapas)) === JSON.stringify(ETAPAS.slice(0, 5)),
    'continuación solo del prefijo de cifrar_actual',
  );
  const identidad = {
    nombre: BASES[0],
    oid: '205892',
    dueno: 'curichi',
    servidor: '7688456033622585387',
  };
  exigir(Object.keys(original.identidades).length === 1, 'identidades originales inesperadas');
  comprobarIdentidad(original.identidades[BASES[0]], identidad);
  exigir(
    ETAPAS.slice(0, 4).every((e) => original.etapas[e].estado === 'completa') &&
      original.etapas.cifrar_actual.estado === 'incierta',
    'solo falla incierta de cifrado; no cargas/restores',
  );
  exigir(
    original.etapas.crear_actual.evidencia.identidad?.oid === identidad.oid &&
      original.etapas.preflight.evidencia.rol?.servidor === identidad.servidor &&
      original.etapas.respaldar_actual.evidencia.sha256 === DUMP_ANTERIOR,
    'prefijo original inconsistente',
  );
  exigir(
    original.etapas.cifrar_actual.operadores.some(
      (o) =>
        o.exit === 2 &&
        o.stderrSha256 === 'a2aa5e9363fbf88f2e242492636f53d2a60d7135b33e37c1110c022e42251739',
    ),
    'intento GPG distinto',
  );
  const esperados = {
    dump: [79005, DUMP_ANTERIOR],
    sidecar: [32, 'aee3709b328658f141dba6ca688f84257abb650544f068402903c1cffb3ccbb5'],
    cifradoFallido: [79164, 'ebd6eb5929321d5ba0fa00240380542782d7e9c47991c304cc9762d2cb458a1d'],
    lock: [73, 'abfc7631a13e905838d749e697c8c6d86f4226e48291e85876f3631cda34807c'],
  };
  for (const [nombre, [bytes, hash]] of Object.entries(esperados))
    exigir(
      p.artefactos?.[nombre]?.bytes === bytes && p.artefactos[nombre].sha256 === hash,
      'artefacto original alterado',
    );
  exigir(
    Array.isArray(p.artefactos.homeOriginal) && p.artefactos.homeOriginal.length === 0,
    'home original alterado',
  );
  exigir(
    p.diagnosticos?.length === 2 && p.diagnosticos.every((h) => /^[a-f0-9]{64}$/.test(h)),
    'diagnósticos no sellados',
  );
  const heredadas = Object.fromEntries(
    ETAPAS.slice(0, 4).map((e) => [e, structuredClone(original.etapas[e])]),
  );
  const sello = {
    version: 1,
    intento: 2,
    etapa: 'cifrar_actual',
    freezeAnterior: p.freezeAnterior,
    freezeNuevo: p.freezeNuevo,
    diarioSha256: p.diarioSha256,
    identidad,
    heredadasSha256: sha(JSON.stringify(heredadas)),
    intentoOriginalSha256: sha(JSON.stringify(original.etapas.cifrar_actual)),
    artefactos: structuredClone(p.artefactos),
    diagnosticos: [...p.diagnosticos],
  };
  const diarioHijo = nuevoDiario(p.freezeNuevo);
  diarioHijo.etapas = heredadas;
  diarioHijo.identidades = structuredClone(original.identidades);
  diarioHijo.continuacion = {
    intento: 2,
    selloSha256: sha(serializar(sello)),
    diarioOriginalSha256: p.diarioSha256,
    freezeAnterior: p.freezeAnterior,
  };
  return { sello, diarioHijo };
}
export function validarContinuacion(paquete, sello, hijo) {
  const esperado = planificarContinuacion(paquete);
  exigir(
    JSON.stringify(sello) === JSON.stringify(esperado.sello),
    'sello de continuación distinto',
  );
  validarDiario(hijo);
  exigir(
    hijo.freeze === paquete.freezeNuevo &&
      JSON.stringify(hijo.continuacion) === JSON.stringify(esperado.diarioHijo.continuacion),
    'enlace de hijo alterado',
  );
  for (const etapa of ETAPAS.slice(0, 4))
    exigir(
      JSON.stringify(hijo.etapas[etapa]) === JSON.stringify(esperado.diarioHijo.etapas[etapa]),
      'etapa heredada alterada',
    );
  comprobarIdentidad(hijo.identidades[BASES[0]], esperado.sello.identidad);
}
export async function ejecutarEtapaHija(
  etapa,
  { paquete, sello, diario, guardar, operar, recursos } = {},
) {
  validarContinuacion(paquete, sello, diario);
  exigir(ETAPAS.slice(4).includes(etapa), 'no repetir etapa heredada');
  return ejecutarEtapa(etapa, { diario, guardar, operar, recursos });
}
function directorioSeguro() {
  exigir(existsSync(SCRATCH), 'falta scratch del implementador');
  const esperado = resolve(realpathSync(RAIZ), '.turbo/m10-3-2026-10-27/implementador');
  exigir(realpathSync(SCRATCH) === esperado, 'scratch redirigido');
  if (!existsSync(ENSAYO)) mkdirSync(ENSAYO);
  exigir(
    !lstatSync(ENSAYO).isSymbolicLink() && realpathSync(ENSAYO) === resolve(esperado, 'ensayo'),
    'ensayo redirigido',
  );
  for (const nombre of ARCHIVOS) {
    const ruta = rutaArtefacto(nombre);
    if (existsSync(ruta))
      exigir(lstatSync(ruta).isFile() && !lstatSync(ruta).isSymbolicLink(), 'artefacto redirigido');
  }
}
export function nuevoDiario(freeze) {
  exigir(/^[a-f0-9]{64}$/.test(freeze), 'freeze inválido');
  return { version: 1, corrida: 'm10-3-2026-10-27', freeze, etapas: {}, identidades: {} };
}
function validarDiario(d) {
  exigir(
    d?.version === 1 &&
      d.corrida === 'm10-3-2026-10-27' &&
      /^[a-f0-9]{64}$/.test(d.freeze) &&
      d.etapas &&
      d.identidades,
    'diario inválido',
  );
  let pendiente = false;
  for (const etapa of Object.keys(d.etapas))
    exigir(ETAPAS.includes(etapa), 'etapa desconocida en diario');
  for (const nombre of Object.keys(d.identidades)) validarNombre(nombre);
  for (const etapa of ETAPAS) {
    const entrada = d.etapas[etapa];
    if (!entrada) {
      pendiente = true;
      continue;
    }
    exigir(
      !pendiente && ['iniciada', 'incierta', 'completa'].includes(entrada.estado),
      'diario fuera de orden',
    );
    if (entrada.estado === 'completa')
      exigir(
        entrada.evidencia && entrada.sha256 === sha(JSON.stringify(entrada.evidencia)),
        'checkpoint alterado',
      );
    if (entrada.estado !== 'completa') pendiente = true;
  }
}
export function estado(diario) {
  if (!diario) return { estado: 'sin_iniciar', etapas: ETAPAS };
  validarDiario(diario);
  return {
    estado: Object.values(diario.etapas).some((e) => e.estado !== 'completa')
      ? 'revision_manual'
      : 'quieto',
    siguiente: ETAPAS.find((e) => !diario.etapas[e]) ?? null,
    diario,
  };
}
export function comprobarIdentidad(actual, propia) {
  validarNombre(actual?.nombre);
  exigir(
    propia &&
      ['nombre', 'oid', 'dueno', 'servidor'].every((k) => actual[k] === propia[k]) &&
      /^\d+$/.test(actual.oid) &&
      actual.dueno === 'curichi' &&
      /^\d+$/.test(actual.servidor),
    'base existente sin identidad propia verificada',
  );
}
/** Cada llamada ejecuta UNA etapa. No adopta, reinicia ni recupera cargas inciertas. */
export async function ejecutarEtapa(etapa, { diario, guardar, operar, recursos } = {}) {
  exigir(ETAPAS.includes(etapa), 'etapa desconocida');
  validarDiario(diario);
  exigir(
    [guardar, operar, recursos].every((f) => typeof f === 'function'),
    'operadores inyectados requeridos',
  );
  exigir(!diario.etapas[etapa], 'etapa iniciada/completa/incierta: no se repite automáticamente');
  const indice = ETAPAS.indexOf(etapa);
  exigir(
    ETAPAS.slice(0, indice).every((e) => diario.etapas[e]?.estado === 'completa'),
    'etapa fuera de orden',
  );
  const entrada = { estado: 'iniciada', inicio: new Date().toISOString() };
  diario.etapas[etapa] = entrada;
  await guardar(diario);
  try {
    await recursos();
    const evidencia = await operar(etapa);
    exigir(evidencia && typeof evidencia === 'object', 'falta evidencia de etapa');
    entrada.evidencia = evidencia;
    entrada.sha256 = sha(JSON.stringify(evidencia));
    entrada.estado = 'completa';
    entrada.fin = new Date().toISOString();
    await guardar(diario); // siempre antes de la guarda de recursos de la próxima etapa
  } catch {
    entrada.estado = 'incierta';
    entrada.fin = new Date().toISOString();
    await guardar(diario);
    throw new Error(`etapa ${etapa} incierta: conservar evidencia y solicitar revisión manual`);
  }
  return entrada;
}

function comprobarFreeze(ruta = resolve(SCRATCH, 'freeze8.json')) {
  const freeze = JSON.parse(readFileSync(ruta, 'utf8'));
  exigir(Array.isArray(freeze.archivos) && freeze.archivos.length === 8, 'freeze8 incompleto');
  for (const archivo of FUENTES) {
    const registro = freeze.archivos.find((a) => a.archivo === archivo);
    exigir(
      registro?.sha256 === sha(readFileSync(resolve(RAIZ, archivo))),
      'fuente cambió después del freeze',
    );
  }
  return sha(readFileSync(ruta));
}
function escribirDiario(diario, ruta = rutaArtefacto('diario.json')) {
  const temporal = `${ruta}.siguiente`;
  exigir(!existsSync(temporal), 'checkpoint anterior incierto; no sobrescribir');
  const fd = openSync(temporal, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(diario, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporal, ruta);
}

// Solo rutas internas fijas; ninguna ruta de usuario entra por argumentos del CLI.
function verificarRutaFisica(ruta) {
  const absoluto = resolve(ruta);
  exigir(
    absoluto.startsWith(`${RAIZ}/`) || absoluto.startsWith(`${RAIZ}\\`),
    'ruta fuera del workspace',
  );
  for (let actual = absoluto; actual !== RAIZ; actual = dirname(actual)) {
    if (existsSync(actual))
      exigir(
        !lstatSync(actual).isSymbolicLink() && realpathSync(actual) === actual,
        'ruta redirigida o symlink',
      );
  }
}
function leerSeguro(ruta) {
  verificarRutaFisica(ruta);
  exigir(lstatSync(ruta).isFile(), 'se requiere archivo regular propio');
  return readFileSync(ruta);
}
function crearDirectorioNuevo(ruta) {
  exigir(
    [HIJO, resolve(SCRATCH, '../g2-a'), resolve(SCRATCH, '../g2-h')].includes(ruta),
    'directorio nuevo fuera de allowlist',
  );
  verificarRutaFisica(ruta);
  exigir(!existsSync(ruta), 'directorio propio ya existe; no adoptar');
  mkdirSync(ruta, { mode: 0o700 });
}
function leerPaqueteContinuacion() {
  const original = leerSeguro(rutaArtefacto('diario.json'));
  const archivado = leerSeguro(resolve(CIERRE, 'diario-antes-diagnostico-cifrar-actual.json'));
  exigir(
    sha(original) === DIARIO_ANTERIOR && original.equals(archivado),
    'diario original/archivado distinto',
  );
  const freeze = leerSeguro(resolve(SCRATCH, 'freeze8.json'));
  exigir(
    sha(freeze) === FREEZE_ANTERIOR &&
      freeze.equals(leerSeguro(resolve(CIERRE, 'freeze8-antes-correccion-gpg.json'))),
    'freeze original/archivado distinto',
  );
  const freezeNuevo = comprobarFreeze(resolve(CORRECCION, 'freeze8.json'));
  const nuevo = JSON.parse(leerSeguro(resolve(CORRECCION, 'freeze8.json')));
  const delta = [
    'scripts/ensayar-respaldo-multitematico.mjs',
    'scripts/ensayar-respaldo-multitematico.test.mjs',
    'docs/operaciones/respaldo-y-restauracion.md',
  ];
  for (const a of JSON.parse(freeze).archivos)
    if (!delta.includes(a.archivo))
      exigir(
        nuevo.archivos.find((n) => n.archivo === a.archivo)?.sha256 === a.sha256,
        'cambio fuera de las tres fuentes',
      );
  const archivo = (nombre) => {
    const b = leerSeguro(rutaArtefacto(nombre));
    return { bytes: b.length, sha256: sha(b) };
  };
  const home = resolve(ENSAYO, 'gpg-actual');
  verificarRutaFisica(home);
  const lock = leerSeguro(resolve(ENSAYO, 'cifrar_actual.lock-conservado.json'));
  exigir(
    !existsSync(rutaArtefacto('actual.descifrado.dump')) &&
      !existsSync(rutaArtefacto('diario.lock')),
    'artefacto/lock original inesperado',
  );
  return {
    freezeAnterior: sha(freeze),
    freezeNuevo,
    diarioSha256: sha(original),
    diarioOriginal: JSON.parse(original),
    artefactos: {
      dump: archivo('actual.dump'),
      sidecar: archivo('actual.dump.migracion'),
      cifradoFallido: archivo('actual.dump.gpg'),
      homeOriginal: readdirSync(home),
      lock: { bytes: lock.length, sha256: sha(lock) },
    },
    diagnosticos: ['gpg-list-dirs-diagnostico.json', 'gpg-list-dirs-ruta-posix.json'].map((n) =>
      sha(leerSeguro(resolve(CIERRE, n))),
    ),
  };
}
async function mainContinuacion(args) {
  const [modo, etapa, permiso] = args;
  if (modo === 'estado-continuacion') {
    exigir(args.length === 1, 'estado-continuacion no admite opciones');
    const ruta = rutaContinuacion('diario.json');
    process.stdout.write(
      `${JSON.stringify(estado(existsSync(ruta) ? JSON.parse(leerSeguro(ruta)) : null), null, 2)}\n`,
    );
    return;
  }
  exigir(
    (modo === 'sellar-continuacion' && etapa === '--operar' && args.length === 2) ||
      (modo === 'ejecutar-continuacion' &&
        ETAPAS.slice(4).includes(etapa) &&
        permiso === '--operar' &&
        args.length === 3),
    'continuación manual explícita requerida',
  );
  verificarRutaFisica(CORRECCION);
  const paquete = leerPaqueteContinuacion();
  const plan = planificarContinuacion(paquete);
  const selloRuta = resolve(HIJO, 'sello.json');
  const ruta = rutaContinuacion('diario.json');
  const guardar = (d) => escribirDiario(d, ruta);
  if (modo === 'sellar-continuacion') {
    for (const home of [resolve(SCRATCH, '../g2-a'), resolve(SCRATCH, '../g2-h')]) {
      verificarRutaFisica(home);
      exigir(!existsSync(home), 'home del nuevo intento ya existe');
    }
    crearDirectorioNuevo(HIJO);
    // Una interrupción entre estos dos archivos se conserva; nunca se vuelve a sellar encima.
    writeFileSync(selloRuta, serializar(plan.sello), { flag: 'wx', mode: 0o600 });
    guardar(plan.diarioHijo);
    return;
  }
  const selloBytes = leerSeguro(selloRuta),
    sello = JSON.parse(selloBytes);
  const diario = JSON.parse(leerSeguro(ruta));
  exigir(sha(selloBytes) === diario.continuacion?.selloSha256, 'bytes del sello alterados');
  validarContinuacion(paquete, sello, diario);
  exigir(
    !diario.etapas[etapa] &&
      ETAPAS.slice(0, ETAPAS.indexOf(etapa)).every((e) => diario.etapas[e]?.estado === 'completa'),
    'etapa completa/incierta/fuera de orden: no repetir',
  );
  const lock = rutaContinuacion('diario.lock');
  verificarRutaFisica(lock);
  const fd = openSync(lock, 'wx', 0o600);
  try {
    writeFileSync(fd, serializar({ pid: process.pid, etapa, intento: 2 }));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  let operadores;
  try {
    const privado = parseEnv(readFileSync(resolve(RAIZ, '.env'), 'utf8'));
    const url = new URL(privado.DATABASE_URL);
    url.pathname = '/template1';
    operadores = crearOperadores({
      url: url.toString(),
      diario,
      guardar,
      real: true,
      continuacion: true,
    });
    await ejecutarEtapaHija(etapa, {
      paquete,
      sello,
      diario,
      guardar,
      operar: operadores.ejecutar,
      recursos: async () => exigir(freemem() >= 1500 * 1048576, 'RAM libre insuficiente'),
    });
  } finally {
    try {
      if (operadores) await operadores.cerrar();
    } finally {
      const destino = resolve(HIJO, `${etapa}.lock-conservado.json`);
      verificarRutaFisica(destino);
      exigir(!existsSync(destino), 'lock archivado existente; conservar ambos');
      renameSync(lock, destino);
    }
  }
}

const CONTENEDOR = 'curichi-postgis';
const DOCKER = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const GPG = 'C:/Program Files/Git/usr/bin/gpg.exe';
const GPGCONF = 'C:/Program Files/Git/usr/bin/gpgconf.exe';
const GPGAGENT = 'C:/Program Files/Git/usr/bin/gpg-agent.exe';
const CLI = resolve(RAIZ, 'packages/db/dist/cli/migrar.js');
const envPrivado = () =>
  Object.fromEntries(
    ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'SystemDrive', 'COMSPEC']
      .filter((k) => process.env[k] !== undefined)
      .map((k) => [k, process.env[k]]),
  );

// Ninguna orden o SQL viene del CLI: cada operador se construye estructuralmente aquí.
function proceso(orden, args, { input, env = {}, binario = false } = {}) {
  exigir([DOCKER, GPG, GPGCONF, process.execPath].includes(orden), 'ejecutable no permitido');
  return new Promise((res, rej) => {
    const inicio = Date.now();
    const hijo = spawn(orden, args, {
      cwd: RAIZ,
      windowsHide: true,
      shell: false,
      timeout: 120000,
      env: { ...envPrivado(), ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    const hashStderr = createHash('sha256');
    let bytesStderr = 0;
    let bytes = 0;
    hijo.stdout.on('data', (b) => {
      bytes += b.length;
      if (bytes > 32 * 1024 * 1024) hijo.kill();
      else stdout.push(b);
    });
    hijo.stderr.on('data', (b) => {
      hashStderr.update(b);
      bytesStderr += b.length;
      if (bytesStderr <= 32768) stderr.push(b);
    });
    hijo.on('error', () => rej(new Error('no se pudo iniciar operador instalado')));
    hijo.stdin.on('error', () => {});
    hijo.on('close', (exit) => {
      const salida = Buffer.concat(stdout);
      const recibo = {
        exit,
        bytes: salida.length,
        stdoutSha256: sha(salida),
        stderrSha256: hashStderr.digest('hex'),
        bytesStderr,
        duracionMs: Date.now() - inicio,
      };
      if (exit !== 0) {
        const error = new Error('operador falló; revisar checkpoint');
        error.recibo = recibo;
        error.diagnostico =
          bytesStderr <= 32768
            ? Buffer.concat(stderr).toString('utf8')
            : '<stderr excede límite; ver hash completo>';
        return rej(error);
      }
      res({ salida: binario ? salida : salida.toString('utf8').trim(), recibo });
    });
    hijo.stdin.end(input);
  });
}

function crearAdaptadorReal(url, checkpoint, continuacion = false) {
  const require = createRequire(resolve(RAIZ, 'packages/db/package.json'));
  const { Client } = require('pg'); // instalado; nunca descarga
  const clientes = new Map();
  const password = decodeURIComponent(url.password);
  const ruta = continuacion ? rutaContinuacion : rutaArtefacto;
  const ejecutar = async (orden, args, opciones) => {
    try {
      const r = await proceso(orden, args, opciones);
      const stdout = opciones?.binario
        ? '<binario conservado como dump>'
        : redactarDiagnostico(r.salida, [password, ...(opciones?.secretos ?? [])]);
      await checkpoint({
        operador:
          orden === DOCKER ? `docker:${args[0]}` : orden === process.execPath ? 'migrar' : 'GPG',
        ...r.recibo,
        stdout: stdout.slice(0, 65536),
      });
      return r;
    } catch (error) {
      if (error.recibo)
        await checkpoint({
          ...error.recibo,
          error: 'operador fallido',
          operador:
            orden === DOCKER ? `docker:${args[0]}` : orden === process.execPath ? 'migrar' : 'GPG',
          diagnostico: redactarDiagnostico(error.diagnostico, [
            password,
            ...(opciones?.secretos ?? []),
          ]),
        });
      throw error;
    }
  };
  const conexion = async (nombre) => {
    exigir(nombre === 'template1' || BASES.includes(nombre), 'conexión no permitida');
    if (!clientes.has(nombre)) {
      const destino = new URL(url);
      destino.pathname = `/${nombre}`;
      const cliente = new Client({
        connectionString: destino.toString(),
        connectionTimeoutMillis: 5000,
        statement_timeout: 120000,
        application_name: 'curichi_sdd_m10_20261027',
      });
      clientes.set(nombre, cliente);
      await cliente.connect();
    }
    return clientes.get(nombre);
  };
  return {
    async consulta(nombre, texto, valores = []) {
      return (await conexion(nombre)).query(texto, valores);
    },
    async cerrar() {
      for (const cliente of clientes.values()) await cliente.end();
    },
    async comando(tipo, datos = {}) {
      if (tipo === 'herramientas') {
        for (const ruta of [DOCKER, GPG, GPGCONF, GPGAGENT, CLI])
          exigir(existsSync(ruta), 'falta herramienta instalada; no descargar ni construir');
        const recibos = [];
        for (const [orden, args] of [
          [
            DOCKER,
            ['inspect', '--format', '{{.Id}} {{.State.Running}} {{.Config.Image}}', CONTENEDOR],
          ],
          [DOCKER, ['exec', CONTENEDOR, 'pg_dump', '--version']],
          [DOCKER, ['exec', CONTENEDOR, 'pg_restore', '--version']],
          [GPG, ['--no-options', '--version']],
        ]) {
          const r = await ejecutar(orden, args);
          recibos.push({ ...r.recibo, version: r.salida.split('\n')[0] });
          if (orden === DOCKER && args[0] === 'inspect')
            exigir(
              /^[a-f0-9]{64} true postgis\//.test(r.salida),
              'contenedor no identificado como PostGIS instalado',
            );
        }
        return recibos;
      }
      if (tipo === 'identidad_contenedor') {
        return (
          await ejecutar(
            DOCKER,
            [
              'exec',
              '-e',
              'PGPASSWORD',
              CONTENEDOR,
              'psql',
              '-h',
              '127.0.0.1',
              '-U',
              'curichi',
              '-d',
              'template1',
              '-X',
              '-v',
              'ON_ERROR_STOP=1',
              '-tAc',
              'SELECT system_identifier::text FROM pg_control_system()',
            ],
            { env: { PGPASSWORD: password } },
          )
        ).salida;
      }
      if (tipo === 'migrar') {
        validarNombre(datos.base);
        exigir(
          datos.hasta === undefined || ['0019', '0021'].includes(datos.hasta),
          'versión no permitida',
        );
        const destino = new URL(url);
        destino.pathname = `/${datos.base}`;
        return (
          await ejecutar(process.execPath, [CLI, '--hasta', datos.hasta ?? '0021'], {
            env: { DATABASE_URL: destino.toString(), NODE_ENV: 'production' },
          })
        ).recibo;
      }
      if (tipo === 'volcar') {
        validarNombre(datos.base);
        const r = await ejecutar(
          DOCKER,
          [
            'exec',
            '-e',
            'PGPASSWORD',
            CONTENEDOR,
            'pg_dump',
            '-h',
            '127.0.0.1',
            '-U',
            'curichi',
            '-d',
            datos.base,
            '-Fc',
            '-Z',
            '6',
            '--exclude-table=public._migraciones',
          ],
          { env: { PGPASSWORD: password }, binario: true },
        );
        writeFileSync(ruta(datos.archivo), r.salida, { flag: 'wx', mode: 0o600 });
        return r.recibo;
      }
      if (tipo === 'cargar') {
        validarNombre(datos.base);
        const r = await ejecutar(
          DOCKER,
          [
            'exec',
            '-i',
            '-e',
            'PGPASSWORD',
            CONTENEDOR,
            'pg_restore',
            '-h',
            '127.0.0.1',
            '-U',
            'curichi',
            '-d',
            datos.base,
            '--data-only',
            '--schema=public',
            '--schema=geo',
            '--disable-triggers',
            '--exit-on-error',
            '--single-transaction',
          ],
          { input: readFileSync(ruta(datos.archivo)), env: { PGPASSWORD: password } },
        );
        return r.recibo;
      }
      if (tipo === 'cargar_shell') {
        exigir(
          datos.base === BASES[3] && datos.archivo === 'pre0020.descifrado.dump',
          'carga Shell fuera del caso histórico',
        );
        const remoto = '/tmp/curichi_sdd_m10_20261027';
        await ejecutar(DOCKER, ['exec', CONTENEDOR, 'mkdir', remoto]); // sin -p: existente = incertidumbre
        await ejecutar(DOCKER, [
          'cp',
          resolve(RAIZ, 'infra/respaldo/respaldo.sh'),
          `${CONTENEDOR}:${remoto}/respaldo.sh`,
        ]);
        await ejecutar(DOCKER, ['cp', ruta(datos.archivo), `${CONTENEDOR}:${remoto}/pre0020.dump`]);
        return (
          await ejecutar(
            DOCKER,
            [
              'exec',
              '-e',
              'PGPASSWORD',
              '-e',
              'RESPALDO_DATABASE_URL',
              CONTENEDOR,
              'bash',
              `${remoto}/respaldo.sh`,
              'cargar-local',
              `${remoto}/pre0020.dump`,
              datos.migracion,
              '--destino-nuevo',
            ],
            {
              env: {
                PGPASSWORD: password,
                RESPALDO_DATABASE_URL: `postgresql://curichi@127.0.0.1:5432/${datos.base}`,
              },
            },
          )
        ).recibo;
      }
      if (tipo === 'cifrar') {
        exigir(['actual', 'pre0020'].includes(datos.caso), 'caso no permitido');
        const hogar = continuacion
          ? resolve(SCRATCH, '..', datos.caso === 'actual' ? 'g2-a' : 'g2-h')
          : resolve(ENSAYO, `gpg-${datos.caso}`);
        return cifrarConGpg({
          home: hogar,
          entrada: ruta(`${datos.caso}.dump`),
          cifrado: ruta(`${datos.caso}.dump.gpg`),
          descifrado: ruta(`${datos.caso}.descifrado.dump`),
          ejecutar,
          checkpoint,
          nuevaClave: () => randomBytes(48).toString('base64'),
          archivos: { existe: existsSync, leer: leerSeguro, crearHome: crearDirectorioNuevo },
        });
      }
      throw new Error('operador desconocido');
    },
  };
}

const SQL_IDENTIDADES = `SELECT d.datname AS nombre, d.oid::text, r.rolname AS dueno,
  (SELECT system_identifier::text FROM pg_control_system()) AS servidor
  FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname = ANY($1::text[]) ORDER BY d.datname`;
function nombreCaso(caso, copia = false) {
  return validarNombre(PREFIJO + (copia ? 'copia_' : '') + caso);
}

/** El SQL inyectado DEBE conservar su conexión por base durante toda esta función. */
export async function negativosEnTransaccion(
  caso,
  { sql, comparar, verificar: comprobar = verificar } = {},
) {
  exigir(
    ['actual', 'pre0020'].includes(caso) &&
      [sql, comparar, comprobar].every((f) => typeof f === 'function'),
    'negativo requiere operadores explícitos',
  );
  const fuente = nombreCaso(caso);
  const copia = nombreCaso(caso, true);
  const antes = await comparar(caso);
  const resultados = [];
  for (const tipo of ['igual_conteo', 'perdida_categoria']) {
    await sql(copia, 'BEGIN');
    let detectado;
    try {
      if (tipo === 'igual_conteo')
        await sql(
          copia,
          "UPDATE public.reporte SET descripcion='Cambio sintetico M10.3 de igual conteo' WHERE id=(SELECT id FROM public.reporte ORDER BY id LIMIT 1)",
        );
      else
        await sql(
          copia,
          `DELETE FROM public.reporte WHERE categoria='${caso === 'actual' ? 'basura' : 'inundacion'}'`,
        );
      detectado = !(await comprobar(fuente, copia, { sql }));
    } finally {
      await sql(copia, 'ROLLBACK');
    }
    exigir(detectado, 'mutante no detectado dentro de su transacción');
    const despues = await comparar(caso);
    exigir(JSON.stringify(antes) === JSON.stringify(despues), 'ROLLBACK no conservó la copia');
    resultados.push({
      tipo,
      detectado,
      antesSha256: sha(JSON.stringify(antes)),
      despuesSha256: sha(JSON.stringify(despues)),
      rollback: true,
    });
  }
  return { resultados, antes, despues: await comparar(caso) };
}

/** Inyección completa para pruebas herméticas; real:true solo se usa desde el CLI explícito. */
export function crearOperadores({
  url: texto,
  diario,
  guardar,
  adaptador,
  real = false,
  continuacion = false,
} = {}) {
  const url = validarConexion(texto);
  validarDiario(diario);
  exigir(typeof guardar === 'function', 'checkpoint inyectado requerido');
  exigir(adaptador || real === true, 'adaptador explícito requerido; sin fallback real');
  exigir(!continuacion || diario.continuacion?.intento === 2, 'contexto hijo sellado requerido');
  const ruta = continuacion ? rutaContinuacion : rutaArtefacto;
  const pg =
    adaptador ??
    crearAdaptadorReal(
      url,
      async (recibo) => {
        const etapa = ETAPAS.find((e) => diario.etapas[e]?.estado === 'iniciada');
        exigir(etapa, 'operador fuera de una etapa con checkpoint');
        diario.etapas[etapa].operadores ??= [];
        diario.etapas[etapa].operadores.push(recibo);
        await guardar(diario);
      },
      continuacion,
    );
  const consulta = (base, textoSql, valores) => {
    validarNombre(base);
    return pg.consulta(base, textoSql, valores);
  };
  const sql = async (base, textoSql) => {
    if (base === 'template1') {
      const existencia =
        /^SELECT count\(\*\) FROM pg_database WHERE datname = '([a-z0-9_]+)'$/.exec(textoSql);
      const creacion = /^CREATE DATABASE ([a-z0-9_]+) TEMPLATE template0$/.exec(textoSql);
      exigir(existencia || creacion, 'SQL administrativo fuera de allowlist');
      validarNombre((existencia ?? creacion)[1]);
      const r = await pg.consulta('template1', textoSql);
      return r.rows.map((fila) => Object.values(fila).join('|')).join('\n');
    }
    const r = await consulta(base, textoSql);
    return r.rows.map((fila) => Object.values(fila).join('|')).join('\n');
  };
  const identidades = async () => (await pg.consulta('template1', SQL_IDENTIDADES, [BASES])).rows;
  const reconocer = async (base) => {
    const actual = (await identidades()).find((i) => i.nombre === base);
    comprobarIdentidad(actual, diario.identidades[base]);
    return actual;
  };
  const registrar = async (base) => {
    const propia = (await identidades()).find((i) => i.nombre === base);
    comprobarIdentidad(propia, propia);
    exigir(!diario.identidades[base], 'identidad ya registrada');
    diario.identidades[base] = propia;
    await guardar(diario); // OID durable inmediatamente después de CREATE
  };
  const auxiliares = async (base) => {
    const r = await consulta(
      base,
      `SELECT n.nspname AS esquema,c.relname AS tabla FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','geo') AND c.relkind='r' AND c.relname NOT IN ('reporte','reporte_inundacion','categoria','_migraciones','spatial_ref_sys') ORDER BY 1,2`,
    );
    const salida = {};
    for (const { esquema, tabla } of r.rows) {
      exigir(
        ['public', 'geo'].includes(esquema) && /^[a-z_][a-z0-9_]*$/.test(tabla),
        'tabla inesperada',
      );
      salida[`${esquema}.${tabla}`] = (
        await consulta(
          base,
          `SELECT count(*)::text AS filas,
        encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), ''),'UTF8')),'hex') AS sha256 FROM ${esquema}.${tabla} t`,
        )
      ).rows[0];
    }
    return salida;
  };
  const claves = async (base) => {
    const filas = (
      await consulta(
        base,
        `SELECT n.nspname AS esquema,t.relname AS tabla,c.contype AS tipo,
      pg_get_constraintdef(c.oid,true) AS definicion FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname IN ('public','geo') AND c.contype IN ('p','u','f','c')
      AND t.relname NOT IN ('_migraciones','spatial_ref_sys') ORDER BY 1,2,3,4`,
      )
    ).rows;
    return filas.map((f) => JSON.stringify(f).replaceAll('reporte_inundacion', 'reporte')).sort();
  };
  const comparar = async (caso) => {
    const fuente = nombreCaso(caso);
    const copia = nombreCaso(caso, true);
    await reconocer(fuente);
    await reconocer(copia);
    const antes = diario.etapas[`respaldar_${caso}`].evidencia;
    exigir(
      JSON.stringify(await snapshot(fuente, { sql })) === JSON.stringify(antes.snapshot),
      'fuente cambió después del respaldo',
    );
    const a = await auxiliares(fuente);
    const b = await auxiliares(copia);
    const clavesOrigen = await claves(fuente);
    const clavesCopia = await claves(copia);
    exigir(
      JSON.stringify(clavesOrigen) === JSON.stringify(antes.claves),
      'claves del origen cambiaron',
    );
    exigir(
      clavesOrigen.every((c) => clavesCopia.includes(c)),
      'clave o restricción del origen ausente en copia',
    );
    exigir(
      JSON.stringify(a) === JSON.stringify(antes.auxiliares),
      'auxiliares del origen cambiaron',
    );
    for (const [tabla, valor] of Object.entries(a))
      exigir(
        JSON.stringify(b[tabla]) === JSON.stringify(valor),
        'auxiliares restaurados distintos',
      );
    for (const [tabla, valor] of Object.entries(b))
      if (!(tabla in a)) exigir(valor.filas === '0', 'tabla posterior no vacía');
    exigir(await verificar(fuente, copia, { sql }), 'verificador M10.2 detectó diferencias');
    const restricciones = (
      await consulta(
        copia,
        `SELECT count(*)::text AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','geo') AND NOT convalidated`,
      )
    ).rows[0];
    exigir(restricciones.n === '0', 'restricciones no validadas');
    return {
      snapshot: await snapshot(copia, { sql }),
      auxiliares: b,
      restricciones,
      claves: clavesCopia,
      verificadorM102: true,
    };
  };
  return {
    cerrar: () => pg.cerrar(),
    async ejecutar(etapa) {
      exigir(ETAPAS.includes(etapa), 'etapa desconocida');
      exigir(!continuacion || ETAPAS.slice(4).includes(etapa), 'no repetir etapa heredada');
      if (etapa === 'preflight') {
        const herramientas = await pg.comando('herramientas');
        exigir(
          (await identidades()).length === 0,
          'nombre existente sin diario propio; no adoptar',
        );
        const rol = (
          await pg.consulta(
            'template1',
            `SELECT current_user AS rol, rolsuper, rolcreatedb,
          (SELECT system_identifier::text FROM pg_control_system()) AS servidor,
          current_setting('server_version_num') AS version FROM pg_roles WHERE rolname=current_user`,
          )
        ).rows[0];
        exigir(
          rol?.rol === 'curichi' &&
            rol.rolsuper === true &&
            rol.rolcreatedb === true &&
            Number(rol.version) >= 180000,
          'rol/versión/privilegios insuficientes',
        );
        exigir(
          rol.servidor === (await pg.comando('identidad_contenedor')),
          'TCP y contenedor son servidores distintos',
        );
        return { herramientas, rol };
      }
      const [accion, caso] = etapa.split('_');
      const fuente = nombreCaso(caso);
      const copia = nombreCaso(caso, true);
      const hasta = caso === 'actual' ? '0021' : '0019';
      exigir(
        (await pg.comando('identidad_contenedor')) ===
          diario.etapas.preflight.evidencia.rol.servidor,
        'identidad del contenedor cambió después del preflight',
      );
      // Verificar cada identidad conocida ANTES de cualquier operador de la próxima etapa.
      const existentes = await identidades();
      for (const identidad of existentes)
        comprobarIdentidad(identidad, diario.identidades[identidad.nombre]);
      for (const base of Object.keys(diario.identidades)) await reconocer(base);
      if (accion === 'crear') {
        exigir(
          !(await identidades()).some((i) => i.nombre === fuente),
          'fuente existente; no reutilizar',
        );
        await sql('template1', `CREATE DATABASE ${fuente} TEMPLATE template0`);
        await registrar(fuente);
        const migracion = await pg.comando('migrar', { base: fuente, hasta });
        return { identidad: diario.identidades[fuente], migracion };
      }
      await reconocer(fuente);
      if (accion === 'sembrar') {
        await consulta(fuente, sqlSembrar(caso));
        const s = await snapshot(fuente, { sql });
        exigir(s.categorias.length === (caso === 'actual' ? 4 : 1), 'fixture incompleta');
        return { snapshot: s, auxiliares: await auxiliares(fuente) };
      }
      if (accion === 'respaldar') {
        const previo = await snapshot(fuente, { sql });
        const auxiliar = await auxiliares(fuente);
        const clavesOrigen = await claves(fuente);
        const recibos = [];
        const r = await respaldarNode(fuente, `${caso}.dump`, {
          sql,
          volcar: async (base, archivo) =>
            recibos.push(await pg.comando('volcar', { base, archivo })),
          anotar: async (archivo, version) =>
            writeFileSync(ruta(`${archivo}.migracion`), version, {
              flag: 'wx',
              mode: 0o600,
            }),
        });
        exigir(
          JSON.stringify(previo) === JSON.stringify(await snapshot(fuente, { sql })),
          'origen cambió durante dump',
        );
        return {
          ...r,
          recibos,
          snapshot: previo,
          auxiliares: auxiliar,
          claves: clavesOrigen,
          sha256: sha(readFileSync(ruta(`${caso}.dump`))),
        };
      }
      if (accion === 'cifrar') {
        exigir(
          sha(leerSeguro(ruta(`${caso}.dump`))) ===
            diario.etapas[`respaldar_${caso}`].evidencia.sha256,
          'dump alterado antes del cifrado',
        );
        return pg.comando('cifrar', { caso });
      }
      if (accion === 'restaurar') {
        const archivo = `${caso}.descifrado.dump`;
        exigir(
          sha(readFileSync(ruta(archivo))) === diario.etapas[`respaldar_${caso}`].evidencia.sha256,
          'dump descifrado alterado',
        );
        const recibos = [];
        await restaurarNode(archivo, copia, {
          hasta,
          baseAdministrativa: 'template1',
          sql,
          creada: registrar,
          migrar: async (base, version) =>
            recibos.push(await pg.comando('migrar', { base, hasta: version })),
          cargar: async (dump, base) =>
            recibos.push(
              await pg.comando(caso === 'actual' ? 'cargar' : 'cargar_shell', {
                archivo: dump,
                base,
                migracion: diario.etapas[`respaldar_${caso}`].evidencia.migracion,
              }),
            ),
        });
        return {
          identidad: diario.identidades[copia],
          recibos,
          ruta: caso === 'actual' ? 'Node' : 'Node + Shell cargar_datos_local',
        };
      }
      if (accion === 'verificar') return comparar(caso);
      if (accion === 'negativos') {
        const antesOcupado = await comparar(caso);
        let ocupado = false;
        try {
          await restaurarNode(`${caso}.descifrado.dump`, copia, {
            hasta,
            baseAdministrativa: 'template1',
            sql,
            migrar: () => {
              throw new Error('no debe migrar');
            },
            cargar: () => {
              throw new Error('no debe cargar');
            },
          });
        } catch (e) {
          ocupado = e.message.includes('destino existe');
        }
        exigir(ocupado, 'destino ocupado no rechazado');
        const despuesOcupado = await comparar(caso);
        exigir(
          JSON.stringify(antesOcupado) === JSON.stringify(despuesOcupado),
          'rechazo de ocupado alteró copia',
        );
        // pg mantiene UN Client por base: incluido el sql que recibe el verificador M10.2.
        return {
          ocupado,
          antesOcupado,
          despuesOcupado,
          ...(await negativosEnTransaccion(caso, { sql, comparar })),
        };
      }
      throw new Error('etapa sin operador');
    },
  };
}

function sqlSembrar(caso) {
  exigir(['actual', 'pre0020'].includes(caso), 'caso desconocido');
  const tabla = caso === 'actual' ? 'reporte' : 'reporte_inundacion';
  const categorias =
    caso === 'actual' ? ['inundacion', 'bache', 'basura', 'area_verde'] : ['inundacion'];
  const usuario = '00000000-0000-4000-8000-000000000001';
  return `BEGIN;
    INSERT INTO public.usuario(id,email,nombre,rol,password_hash) VALUES ('${usuario}','sintetico-m10@example.invalid','Cuenta sintética M10.3','ciudadano','NO_ES_UN_HASH_UTILIZABLE');
    ${caso === 'actual' ? 'UPDATE public.categoria SET activa=true;' : ''}
    ${categorias
      .map((categoria, i) => {
        const id = `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
        const flood = categoria === 'inundacion';
        return `INSERT INTO public.${tabla}(id,autor_id,geom,geom_publico,distrito_id,unidad_vecinal_id,version_capa,ubicacion_metodo,precision_gps_m,distancia_dispositivo_m,ubicacion_tipo,descripcion,profundidad_estimada,frecuencia,causa_presunta,severidad_calculada,severidad_puntaje,severidad_version,publicar_en${caso === 'actual' ? ',categoria,detalle,detalle_version' : ''})
        VALUES ('${id}','${usuario}',ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'sintetico:dm','sintetico:uv','sintetica-m10','gps',5,0,'via_publica','Reporte sintético M10.3 ${categoria}',${flood ? "'tobillo','primera_vez','desconocida'" : 'NULL,NULL,NULL'},'baja',3,${flood ? 2 : 1},now()${caso === 'actual' ? `,'${categoria}','${flood ? '{}' : '{"sintetico":true}'}'::jsonb,1` : ''});
        INSERT INTO public.reporte_foto(reporte_id,objeto_key,mime,bytes,ancho,alto,exif_sanitizado,subido_por) VALUES ('${id}','${id}.webp','image/webp',10,1,1,true,'${usuario}');
        INSERT INTO public.auditoria(entidad,entidad_id,accion,actor_id,despues) VALUES ('reporte','${id}','ensayo:sintetico','${usuario}','{"sintetico":true}');
        INSERT INTO public.idempotencia(clave,huella,reporte_id) VALUES ('${usuario}:m10-${i}','${sha(`sintetico-${i}`)}','${id}');
        ${caso === 'actual' ? `INSERT INTO public.cupo_contador(usuario_id,clave,ventana_inicio,n) VALUES ('${usuario}','reportes:${categoria}','2026-10-27T04:00:00Z',1);` : ''}`;
      })
      .join('\n')}
    INSERT INTO public.cuota_reporte_diaria(usuario_id,dia,reportes_n,fotos_n) VALUES ('${usuario}','2026-10-27',1,1);
    COMMIT;`;
}

async function main(args) {
  if (['estado-continuacion', 'sellar-continuacion', 'ejecutar-continuacion'].includes(args[0]))
    return mainContinuacion(args);
  const [modo, etapa, permiso] = args;
  exigir(
    ['estado', 'iniciar', 'ejecutar'].includes(modo),
    'uso: estado | iniciar --operar | ejecutar ETAPA --operar',
  );
  const ruta = rutaArtefacto('diario.json');
  if (modo === 'estado') {
    exigir(args.length === 1, 'estado no admite opciones');
    const diario = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
    process.stdout.write(`${JSON.stringify(estado(diario), null, 2)}\n`);
    return;
  }
  exigir(
    (modo === 'iniciar' && etapa === '--operar' && args.length === 2) ||
      (modo === 'ejecutar' &&
        ETAPAS.includes(etapa) &&
        permiso === '--operar' &&
        args.length === 3),
    'modo operativo explícito requerido',
  );
  directorioSeguro();
  const freeze = comprobarFreeze();
  if (modo === 'iniciar') {
    exigir(!existsSync(ruta), 'diario existente; no reiniciar');
    for (const archivo of ARCHIVOS)
      exigir(!existsSync(rutaArtefacto(archivo)), 'artefacto sin diario propio; no adoptar');
    escribirDiario(nuevoDiario(freeze));
    return;
  }
  const diario = JSON.parse(readFileSync(ruta, 'utf8'));
  exigir(diario.freeze === freeze, 'freeze distinto al diario');
  exigir(!existsSync(rutaArtefacto('diario.lock')), 'lock conservado: requiere revisión manual');
  const fd = openSync(rutaArtefacto('diario.lock'), 'wx');
  writeFileSync(fd, JSON.stringify({ pid: process.pid, etapa, inicio: new Date().toISOString() }));
  closeSync(fd);
  // El lock se conserva, incluso al éxito: cada reanudación requiere validar el checkpoint.
  // Es un token por invocación que se archiva, nunca se elimina automáticamente.
  let operadores;
  try {
    const privado = parseEnv(readFileSync(resolve(RAIZ, '.env'), 'utf8'));
    const url = new URL(privado.DATABASE_URL);
    url.pathname = '/template1'; // jamás se conecta a la base de origen de .env
    operadores = crearOperadores({
      url: url.toString(),
      diario,
      guardar: escribirDiario,
      real: true,
    });
    await ejecutarEtapa(etapa, {
      diario,
      guardar: escribirDiario,
      operar: operadores.ejecutar,
      recursos: async () => exigir(freemem() >= 1500 * 1048576, 'RAM libre insuficiente'),
    });
  } finally {
    if (operadores) await operadores.cerrar();
    const archivoLock = resolve(ENSAYO, `${etapa}.lock-conservado.json`);
    exigir(!existsSync(archivoLock), 'archivo de lock ya existe; conservar ambos para revisión');
    renameSync(rutaArtefacto('diario.lock'), archivoLock);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch {
    process.stderr.write(
      'M10.3 detenido: revisar diario/checkpoints; no repetir etapas inciertas.\n',
    );
    process.exitCode = 1;
  }
}
