#!/usr/bin/env node
/**
 * Runner local de la E2E transversal (Parte 5, calidad).
 *
 * POR QUÉ EXISTE
 * El `webServer` de `playwright.config.ts` levanta la pila con `pnpm dev`. En esta máquina eso no
 * sirve por dos motivos: `pnpm dev` arranca Next con Turbopack, que se cae aquí, y escribiría en la
 * base "curichi" del usuario (sus datos). Este runner levanta la pila a mano, con `next dev
 * --webpack`, contra una base APARTE —"curichi_e2e", en el mismo PostgreSQL de Docker— y con el
 * mismo entorno de prueba que `playwright.config.ts` pasaría a `webServer`. Playwright, al ver
 * api-core ya escuchando en 3001, reutiliza la pila (`reuseExistingServer`) y no arranca nada.
 *
 * SEGURIDAD DE LOS DATOS
 * NUNCA toca "curichi". Deriva las URLs de base cambiando solo el nombre de base a "curichi_e2e" y
 * las pasa a los procesos por el entorno; como el entorno del proceso gana sobre el `--env-file` de
 * cada servicio (comprobado: Node no pisa una variable ya definida), api-core y geo-service se
 * conectan a "curichi_e2e" aunque el `.env` apunte a "curichi". No corre `down`, ni recrea PostGIS,
 * ni borra volúmenes, ni hace DROP de "curichi".
 *
 * USO
 *   node e2e/scripts/correr-local.mjs [--grupo G1|G2|G3|G4|G5|todos] [--solo-preparar]
 *                                     [--resembrar] [--forzar] [--ayuda]
 *
 * Ver `e2e/README.md` para los grupos, la base "curichi_e2e" y las trampas de esta máquina. Es la
 * forma recomendada de correr la E2E (y lo que hace la opción 8 del lanzador Mi-Curichi.exe).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --------------------------------------------------------------------------- rutas y constantes

const DIR_SCRIPT = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(DIR_SCRIPT, '..', '..');
const DIR_LOGS = join(os.tmpdir(), 'curichi-e2e');
const VERSION_CAPAS = 'DM_UV_MZ_2025';
const DIR_RAW = join(RAIZ, 'data', 'raw', VERSION_CAPAS);
const DIR_PROCESADO = join(RAIZ, 'data', 'processed', VERSION_CAPAS);

/** Puertos que la pila local ocupa; los cuatro tienen que estar libres antes de levantar. */
const PUERTOS = {
  'web-ciudadano': 3000,
  'api-core': 3001,
  'geo-service': 3002,
  'panel-admin': 3100,
};

/** En Windows hay que invocar los `.cmd` (npx, docker) por el shell, y así PATHEXT los resuelve. */
const EN_WINDOWS = process.platform === 'win32';
/** Carpeta de binarios de Docker Desktop, por si no está en el PATH de esta terminal. */
const DOCKER_BIN = 'C:\\Program Files\\Docker\\Docker\\resources\\bin';

/** pnpm del sistema puede estar roto en esta máquina: se usa una versión fijada vía npx. */
const PNPM = ['-y', 'pnpm@12.4.1'];

/**
 * Specs de cada grupo (sin `tests/` ni `.spec.ts`). Reparten los 24 archivos para correr de a
 * tandas y no quedarse sin RAM (ver e2e/README.md). El proyecto `chromium` corre todos; el proyecto
 * `movil` solo los de CON_MOVIL (su `testMatch` en playwright.config.ts filtra el resto).
 */
const GRUPOS = {
  G1: [
    'api-contratos',
    'separacion-publica-tecnica',
    'cuenta-ciudadana',
    'acceso-panel',
    'publicacion-diferida',
  ],
  G2: ['mapa-publico', 'mapa-seleccion', 'trafico-publico', 'datos-reales', 'navegacion'],
  G3: [
    'formulario-reporte',
    'formulario-sumidero-y-fotos',
    'ubicacion-obligatoria',
    'camara-foto',
    'resiliencia-interfaz',
    'quitar-campos-web',
  ],
  G4: [
    'recorrido-completo',
    'panel-tecnico',
    'panel-al-dia',
    'panel-ejecutivo',
    'quitar-campos-panel',
  ],
  G5: ['accesibilidad', 'responsive', 'csp'],
};

/** Specs que además corren en el proyecto `movil` (Pixel 7): el mapa, la cámara y la ubicación. */
const CON_MOVIL = new Set([
  'mapa-publico',
  'mapa-seleccion',
  'camara-foto',
  'ubicacion-obligatoria',
]);

/**
 * Entorno de prueba que `playwright.config.ts` le pasa a `webServer`. Acá lo pasamos nosotros a
 * api-core y geo-service, porque los levantamos a mano. TIENE QUE SEGUIR A playwright.config.ts: si
 * cambia allá, se cambia acá. La demora de 2/4 s y el cupo de 3 son los que comprueba
 * `global-setup.ts` y varias pruebas; no se suben.
 */
const ENTORNO_PRUEBA = {
  RATE_LIMIT_REPORTES_POR_HORA: '1000',
  RATE_LIMIT_LECTURAS_POR_MINUTO: '100000',
  GEO_RATE_LIMIT_POR_MINUTO: '100000',
  GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO: '100000',
  PANEL_ADMIN_URL: 'http://localhost:3100',
  LOGIN_PETICIONES_POR_VENTANA: '1000',
  REGISTRO_PETICIONES_POR_VENTANA: '1000',
  REGISTRO_MAX_POR_IP: '1000',
  ALTAS_POR_DIA_POR_IP: '10000',
  REPORTES_POR_DIA_POR_CUENTA: '3',
  REPORTE_DEMORA_PRIMERO_S: '2',
  REPORTE_DEMORA_SIGUIENTES_S: '4',
  LOGIN_MAX_FALLOS_IP: '100000',
  LOGIN_MAX_FALLOS_EMAIL: '100000',
  COOKIE_SEGURA: '0',
};

/**
 * Contraseñas de los usuarios sintéticos que la suite espera (las mismas por defecto de
 * e2e/tests/ayudas.ts: `curichi-<rol>-local`). No son secretos: son credenciales de desarrollo que
 * ya viven versionadas en ayudas.ts y en packages/db/README.md, y solo valen en la base de prueba.
 */
const SEED_PASSWORDS = {
  SEED_ADMIN_PASSWORD: 'admin',
  SEED_TECNICO_PASSWORD: 'tecnico',
  SEED_VECINA_PASSWORD: 'vecina',
  SEED_EJECUTIVO_PASSWORD: 'ejecutivo',
};

const RAM_MINIMA_MB = 2500;
const RAM_CORTE_TODOS_MB = 1500;
const PLAZO_SERVICIO_MS = 120_000;
const PLAZO_APP_MS = 300_000;

const AYUDA = `
Runner local de la E2E transversal de Mi Curichi.

Levanta api-core, geo-service, web-ciudadano (3000) y panel-admin (3100) a mano, contra una base
APARTE "curichi_e2e" (nunca toca "curichi"), con el entorno de prueba de playwright.config.ts, y
corre la suite de a grupos. Playwright reutiliza la pila ya levantada, no arranca "pnpm dev".

Uso:
  node e2e/scripts/correr-local.mjs [opciones]

Opciones:
  --grupo <G1|G2|G3|G4|G5|todos>  Grupo de specs a correr (por defecto G1).
  --solo-preparar                 Prepara la base (crear/migrar/capas/sembrar) y sale, sin levantar
                                  la pila ni correr pruebas.
  --resembrar                     Vuelve a cargar capas y a sembrar aunque la base ya exista.
  --forzar                        Saltea el chequeo de RAM libre.
  --ayuda                         Muestra esta ayuda.

Grupos (specs de tests/, sin .spec.ts):
  G1  api-contratos · separacion-publica-tecnica · cuenta-ciudadana · acceso-panel · publicacion-diferida
  G2  mapa-publico · mapa-seleccion · trafico-publico · datos-reales · navegacion
  G3  formulario-reporte · formulario-sumidero-y-fotos · ubicacion-obligatoria · camara-foto · resiliencia-interfaz · quitar-campos-web
  G4  recorrido-completo · panel-tecnico · panel-al-dia · panel-ejecutivo · quitar-campos-panel
  G5  accesibilidad · responsive · csp
El proyecto chromium corre todos; el proyecto movil además mapa-publico, mapa-seleccion,
camara-foto y ubicacion-obligatoria.

Antes de levantar comprueba: puertos 3000/3001/3002/3100 libres, RAM libre >= ${RAM_MINIMA_MB} MB
(salvo --forzar) y que Docker y el contenedor curichi-postgis estén saludables.

Requisito previo (una vez): el navegador de Playwright.
  npx -y pnpm@12.4.1 --filter e2e exec playwright install chromium
`;

// --------------------------------------------------------------------------- utilidades de consola

const log = (msg) => console.log(msg);
const info = (msg) => console.log(`\x1b[34m[info]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m[ ok ]\x1b[0m ${msg}`);
const aviso = (msg) => console.log(`\x1b[33m[aviso]\x1b[0m ${msg}`);
const error = (msg) => console.error(`\x1b[31m[error]\x1b[0m ${msg}`);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Se lanza cuando falla la preparación: el `main` la traduce a código de salida 2. */
class ErrorPreparacion extends Error {}

// --------------------------------------------------------------------------- ejecución de procesos

/** PATH con la carpeta de Docker añadida, para que `docker` se encuentre desde esta terminal. */
function pathConDocker() {
  const actual = process.env.PATH ?? '';
  if (!EN_WINDOWS || actual.includes(DOCKER_BIN)) return actual;
  return `${actual};${DOCKER_BIN}`;
}

/**
 * Ejecutable de Docker. En Windows hay que darle el nombre con `.exe` (o la ruta completa), porque
 * se invoca SIN shell: así los argumentos con espacios y comillas (una consulta SQL, un formato de
 * `inspect`) se pasan tal cual, sin que cmd.exe los parta.
 */
function rutaDocker() {
  if (!EN_WINDOWS) return 'docker';
  const completa = join(DOCKER_BIN, 'docker.exe');
  return existsSync(completa) ? completa : 'docker.exe';
}
const DOCKER = rutaDocker();

/**
 * Corre un comando hasta el final heredando la salida (para ver el progreso de migrar/ETL/sembrar).
 * Devuelve el código de salida. Lanza si el proceso no se pudo arrancar. Por defecto SIN shell: solo
 * los comandos npx (que son `.cmd` en Windows y no se pueden arrancar sin shell) pasan `shell: true`,
 * y sus argumentos no llevan espacios.
 */
function ejecutar(cmd, args, opciones = {}) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(cmd, args, {
      cwd: RAIZ,
      stdio: 'inherit',
      shell: false,
      ...opciones,
    });
    hijo.on('error', rechazar);
    hijo.on('close', (codigo) => resolver(codigo ?? 1));
  });
}

/** Corre un comando y captura su salida (para las consultas cortas a docker/psql). Sin shell. */
function capturar(cmd, args, opciones = {}) {
  return new Promise((resolver) => {
    const hijo = spawn(cmd, args, {
      cwd: RAIZ,
      shell: false,
      ...opciones,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    let err = '';
    hijo.stdout.on('data', (d) => {
      salida += d;
    });
    hijo.stderr.on('data', (d) => {
      err += d;
    });
    hijo.on('error', (e) => resolver({ codigo: -1, salida, err: e.message }));
    hijo.on('close', (codigo) => resolver({ codigo: codigo ?? 1, salida, err }));
  });
}

/**
 * Corre `npx <args>` heredando la salida. npx es un `.cmd` en Windows: hay que arrancarlo por el
 * shell. Sus argumentos no llevan espacios, así que el shell no parte nada.
 */
const npx = (args, opciones = {}) => ejecutar('npx', args, { shell: true, ...opciones });

/** Como `npx`, pero lanza ErrorPreparacion si el comando no termina en 0. */
async function npxOFallar(descripcion, args, opciones = {}) {
  info(descripcion);
  const codigo = await npx(args, opciones);
  if (codigo !== 0) throw new ErrorPreparacion(`${descripcion}: terminó con código ${codigo}`);
}

// --------------------------------------------------------------------------- .env y URLs de base

/**
 * Lee del `.env` SOLO las claves pedidas, a mano (los valores pueden llevar espacios y no están
 * entrecomillados). No imprime ningún valor: los de base llevan contraseña.
 */
function leerEnv(claves) {
  const ruta = join(RAIZ, '.env');
  if (!existsSync(ruta)) throw new ErrorPreparacion('no existe .env en la raíz del repositorio');
  const texto = readFileSync(ruta, 'utf8');
  const valores = {};
  for (const linea of texto.split(/\r?\n/)) {
    const sinComentario = linea.startsWith('#') ? '' : linea;
    const igual = sinComentario.indexOf('=');
    if (igual <= 0) continue;
    const clave = sinComentario.slice(0, igual).trim();
    if (claves.includes(clave)) valores[clave] = sinComentario.slice(igual + 1).trim();
  }
  return valores;
}

/**
 * Cambia el nombre de base (último segmento de la ruta, antes de ? o #) de una URL de PostgreSQL.
 * Trabaja por texto para no re-codificar la contraseña como haría `new URL`.
 */
function cambiarBase(url, nueva) {
  const m = /^(.*\/)([^/?#]+)([?#].*)?$/.exec(url);
  if (!m) throw new ErrorPreparacion('URL de base de datos con una forma que no entiendo');
  return { url: `${m[1]}${nueva}${m[3] ?? ''}`, baseOriginal: m[2] };
}

/**
 * Deriva las tres URLs de la base de prueba cambiando el nombre de base a "curichi_e2e". Aborta si
 * la base original no es "curichi" o si alguna derivada no quedó en "curichi_e2e": antes de tocar
 * nada hay que estar seguros de no apuntar a la base del usuario.
 */
function urlsDeBasePrueba() {
  const env = leerEnv(['DATABASE_URL', 'API_DATABASE_URL', 'GEO_DATABASE_URL', 'POSTGRES_DB']);
  const baseReal = env.POSTGRES_DB || 'curichi';
  const baseE2e = `${baseReal}_e2e`;
  const derivar = (url, nombre) => {
    if (!url) throw new ErrorPreparacion(`falta ${nombre} en .env`);
    const { url: nueva, baseOriginal } = cambiarBase(url, baseE2e);
    if (baseOriginal !== baseReal)
      throw new ErrorPreparacion(
        `${nombre} no apunta a la base "${baseReal}" sino a "${baseOriginal}": no derivo a ciegas`,
      );
    if (!nueva.endsWith(`/${baseE2e}`) && !nueva.includes(`/${baseE2e}?`))
      throw new ErrorPreparacion(`la URL derivada de ${nombre} no quedó en "${baseE2e}"`);
    return nueva;
  };
  return {
    base: baseE2e,
    baseReal,
    dueno: derivar(env.DATABASE_URL, 'DATABASE_URL'),
    api: derivar(env.API_DATABASE_URL, 'API_DATABASE_URL'),
    geo: derivar(env.GEO_DATABASE_URL, 'GEO_DATABASE_URL'),
  };
}

// --------------------------------------------------------------------------- chequeos previos

/** true si se puede escuchar en el puerto (está libre). */
function puertoLibre(puerto) {
  return new Promise((resolver) => {
    const srv = net.createServer();
    srv.once('error', () => resolver(false));
    srv.once('listening', () => srv.close(() => resolver(true)));
    srv.listen(puerto, '0.0.0.0');
  });
}

/** Quién escucha un puerto en Windows (imagen y PID), para el mensaje cuando está ocupado. */
function quienEscucha(puerto) {
  if (!EN_WINDOWS) return '';
  // Sin shell y con el nombre `.exe`: el filtro `PID eq N` de tasklist lleva espacios y el shell lo
  // partiría; así Node lo entrecomilla solo.
  const net = spawnSync('netstat.exe', ['-ano'], { encoding: 'utf8' });
  const lineas = (net.stdout ?? '')
    .split(/\r?\n/)
    .filter((l) => l.includes('LISTENING') && new RegExp(`:${puerto}\\b`).test(l));
  const pids = new Set(lineas.map((l) => l.trim().split(/\s+/).at(-1)).filter(Boolean));
  const descripciones = [];
  for (const pid of pids) {
    const tl = spawnSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
    });
    const nombre = (tl.stdout ?? '').split(',')[0]?.replaceAll('"', '').trim() || 'proceso';
    descripciones.push(`${nombre} (PID ${pid})`);
  }
  return descripciones.join(', ');
}

/** Comprueba que los cuatro puertos estén libres; si no, dice quién los ocupa y lanza. */
async function comprobarPuertos() {
  const ocupados = [];
  for (const [nombre, puerto] of Object.entries(PUERTOS)) {
    if (!(await puertoLibre(puerto))) {
      const quien = quienEscucha(puerto);
      ocupados.push(`  ${puerto} (${nombre})${quien ? ` → ${quien}` : ''}`);
    }
  }
  if (ocupados.length) {
    throw new ErrorPreparacion(
      `estos puertos tienen que estar libres y no lo están:\n${ocupados.join('\n')}\n` +
        'Suele ser un api-core/next suelto de una corrida anterior. Desde que web y panel de\n' +
        'Docker ya no publican 3000/3100, esos deberían quedar libres. Cerrá lo que los ocupe\n' +
        '(en Windows: taskkill /PID <pid> /T /F) y repetí.',
    );
  }
  ok('puertos 3000/3001/3002/3100 libres');
}

/** RAM física libre, en MB (equivalente a FreePhysicalMemory de Windows). */
const ramLibreMB = () => Math.round(os.freemem() / 1024 / 1024);

function comprobarRam(forzar) {
  const libre = ramLibreMB();
  if (libre >= RAM_MINIMA_MB) {
    ok(`RAM libre: ${libre} MB`);
    return;
  }
  if (forzar) {
    aviso(`RAM libre ${libre} MB (< ${RAM_MINIMA_MB}); seguís por --forzar`);
    return;
  }
  throw new ErrorPreparacion(
    `RAM libre ${libre} MB, por debajo de ${RAM_MINIMA_MB} MB. Cerrá programas y repetí, o pasá ` +
      '--forzar bajo tu responsabilidad (la suite y las apps pueden quedarse sin memoria).',
  );
}

/** Docker respondiendo y el contenedor curichi-postgis saludable. */
async function comprobarDocker() {
  const entorno = { ...process.env, PATH: pathConDocker() };
  const info1 = await capturar(DOCKER, ['version', '--format', '{{.Server.Version}}'], {
    env: entorno,
  });
  if (info1.codigo !== 0)
    throw new ErrorPreparacion(
      'Docker no responde. Abrí Docker Desktop y esperá a que arranque (el PATH puede no incluir ' +
        `"${DOCKER_BIN}").`,
    );
  // Formato sin espacios: curichi-postgis tiene healthcheck, así que `.State.Health.Status` existe.
  const salud = await capturar(
    DOCKER,
    ['inspect', '-f', '{{.State.Health.Status}}', 'curichi-postgis'],
    { env: entorno },
  );
  const estado = salud.salida.trim();
  if (salud.codigo !== 0)
    throw new ErrorPreparacion(
      'no encuentro el contenedor curichi-postgis (o no tiene healthcheck). Levantá la base: la ' +
        'pila Docker del usuario (perfiles servicios + minio) o al menos `docker compose up -d postgis`.',
    );
  if (estado !== 'healthy')
    throw new ErrorPreparacion(
      `curichi-postgis no está "healthy" (está "${estado}"). Esperá y repetí.`,
    );
  ok(`Docker ${info1.salida.trim()} · curichi-postgis healthy`);
}

// --------------------------------------------------------------------------- preparación de la base

/** ¿Existe ya la base "curichi_e2e"? Lee el catálogo desde el contenedor; no toca "curichi". */
async function baseExiste(urls) {
  const entorno = { ...process.env, PATH: pathConDocker() };
  const r = await capturar(
    DOCKER,
    [
      'compose',
      'exec',
      '-T',
      'postgis',
      'psql',
      '-U',
      'curichi',
      '-d',
      urls.baseReal,
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${urls.base}'`,
    ],
    { env: entorno },
  );
  if (r.codigo !== 0)
    throw new ErrorPreparacion(
      `no pude consultar si existe "${urls.base}": ${r.err.trim().slice(0, 300)}`,
    );
  return r.salida.trim() === '1';
}

/** Crea "curichi_e2e" con createdb dentro del contenedor (conexión local por socket, trust). */
async function crearBase(urls) {
  const entorno = { ...process.env, PATH: pathConDocker() };
  info(`creando la base de prueba "${urls.base}"`);
  const r = await capturar(
    DOCKER,
    ['compose', 'exec', '-T', 'postgis', 'createdb', '-U', 'curichi', urls.base],
    { env: entorno },
  );
  if (r.codigo !== 0)
    throw new ErrorPreparacion(`createdb falló para "${urls.base}": ${r.err.trim().slice(0, 300)}`);
}

/** Entorno de los comandos que escriben la base: rol dueño apuntando a "curichi_e2e". */
function entornoDueno(urls) {
  return {
    ...process.env,
    PATH: pathConDocker(),
    DATABASE_URL: urls.dueno,
    NODE_ENV: 'development',
  };
}

/**
 * Prepara "curichi_e2e": build de contracts+db, crear la base si falta, migrar (los GRANT por tabla
 * los da la 0008), cargar capas y sembrar. Capas y seed solo en base nueva o con --resembrar.
 */
async function prepararBase(urls, resembrar) {
  await npxOFallar('build de contracts y db', [
    ...PNPM,
    '--filter',
    'contracts',
    '--filter',
    'db',
    'build',
  ]);

  const existia = await baseExiste(urls);
  if (!existia) await crearBase(urls);
  else info(`la base "${urls.base}" ya existe`);
  const cargarDatos = !existia || resembrar;

  await npxOFallar(`migrando "${urls.base}" (rol dueño)`, [...PNPM, '--filter', 'db', 'migrate'], {
    env: entornoDueno(urls),
  });

  if (cargarDatos) {
    if (existsSync(DIR_RAW)) {
      const comando = existsSync(DIR_PROCESADO) ? 'load' : 'all';
      if (comando === 'all')
        aviso(`no hay data/processed/${VERSION_CAPAS}: corro el ETL completo (run + load)`);
      await npxOFallar(
        `cargando capas ${VERSION_CAPAS} (${comando})`,
        [...PNPM, '--filter', 'geodata-etl', comando, '--', '--version', VERSION_CAPAS],
        { env: entornoDueno(urls) },
      );
    } else {
      aviso(
        `no hay data/raw/${VERSION_CAPAS}: sigo con las capas SINTÉTICAS que carga el seed. ` +
          'datos-reales.spec.ts (G2) necesita las capas reales y fallará sin ellas.',
      );
    }

    await npxOFallar(
      `sembrando usuarios y reportes sintéticos en "${urls.base}"`,
      [...PNPM, '--filter', 'db', 'seed:samples'],
      { env: { ...entornoDueno(urls), ...SEED_PASSWORDS } },
    );
  } else {
    info('la base ya tenía datos: no cargo capas ni siembro (usá --resembrar para rehacerlo)');
  }
}

// --------------------------------------------------------------------------- levantar la pila

const procesos = [];
let limpiando = false;

/** El worker de MapLibre que `predev` copiaría; `exec next dev` no corre `predev`, así que acá sí. */
async function copiarWorkersMaplibre() {
  for (const app of ['web-ciudadano', 'panel-admin']) {
    const script = join(RAIZ, 'apps', app, 'scripts', 'copiar-worker-maplibre.mjs');
    if (!existsSync(script)) continue;
    const codigo = await ejecutar(process.execPath, [script], { cwd: join(RAIZ, 'apps', app) });
    if (codigo !== 0)
      aviso(`no se pudo copiar el worker de MapLibre de ${app} (el mapa podría no cargar)`);
  }
}

/** Levanta un servicio como hijo, con su salida a un log en el temporal. Guarda el handle. */
function levantarServicio(nombre, args, entorno) {
  const logPath = join(DIR_LOGS, `${nombre}.log`);
  const fd = openSync(logPath, 'a');
  const hijo = spawn('npx', args, {
    cwd: RAIZ,
    shell: EN_WINDOWS,
    detached: !EN_WINDOWS,
    stdio: ['ignore', fd, fd],
    env: entorno,
  });
  procesos.push({ nombre, hijo, logPath });
  info(`${nombre}: PID ${hijo.pid} · log ${logPath}`);
  return hijo;
}

/** Levanta los cuatro procesos con el entorno de prueba y las URLs de "curichi_e2e". */
function levantarServicios(urls) {
  const comun = { ...process.env, ...ENTORNO_PRUEBA, NODE_ENV: 'development' };
  // api-core y geo-service leen su propia variable primero, y DATABASE_URL de respaldo: las dos a
  // "curichi_e2e" para que, lea la que lea, nunca caiga en "curichi".
  const entornoApi = { ...comun, API_DATABASE_URL: urls.api, DATABASE_URL: urls.dueno };
  const entornoGeo = { ...comun, GEO_DATABASE_URL: urls.geo, DATABASE_URL: urls.dueno };
  // Las apps no tocan la base: reenvían /api y /geo a los servicios en localhost.
  const entornoApp = {
    ...process.env,
    NODE_ENV: 'development',
    API_CORE_URL: 'http://127.0.0.1:3001',
    GEO_SERVICE_URL: 'http://127.0.0.1:3002',
    PANEL_ADMIN_URL: 'http://localhost:3100',
  };
  levantarServicio('api-core', [...PNPM, '--filter', 'api-core', 'dev'], entornoApi);
  levantarServicio('geo-service', [...PNPM, '--filter', 'geo-service', 'dev'], entornoGeo);
  levantarServicio(
    'web-ciudadano',
    [...PNPM, '--filter', 'web-ciudadano', 'exec', 'next', 'dev', '-p', '3000', '--webpack'],
    entornoApp,
  );
  levantarServicio(
    'panel-admin',
    [...PNPM, '--filter', 'panel-admin', 'exec', 'next', 'dev', '-p', '3100', '--webpack'],
    entornoApp,
  );
}

/** Tail del log de un servicio, para el mensaje cuando no llegó a responder. */
function colaDelLog(nombre, lineas = 20) {
  const p = procesos.find((x) => x.nombre === nombre);
  if (!p || !existsSync(p.logPath)) return '';
  const texto = readFileSync(p.logPath, 'utf8').trimEnd().split(/\r?\n/);
  return texto.slice(-lineas).join('\n');
}

/** Espera a que una URL responda con un estado aceptado, o lanza al agotarse el plazo. */
async function esperarHttp(nombre, url, plazoMs, aceptar = (s) => s === 200) {
  const limite = Date.now() + plazoMs;
  let ultimo = 'sin respuesta';
  while (Date.now() < limite) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (aceptar(r.status)) return;
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
    await dormir(2000);
  }
  const cola = colaDelLog(nombre);
  throw new ErrorPreparacion(
    `${nombre} no respondió en ${url} tras ${Math.round(plazoMs / 1000)} s (último: ${ultimo}).` +
      (cola ? `\nÚltimas líneas de su log:\n${cola}` : ''),
  );
}

/** Espera a los cuatro, en orden: servicios primero, luego las apps (que compilan al primer pedido). */
async function esperarServicios() {
  info('esperando a que respondan los cuatro servicios…');
  await esperarHttp('geo-service', 'http://127.0.0.1:3002/health', PLAZO_SERVICIO_MS);
  ok('geo-service responde /health');
  await esperarHttp('api-core', 'http://127.0.0.1:3001/ready', PLAZO_SERVICIO_MS);
  ok('api-core responde /ready');
  await esperarHttp('web-ciudadano', 'http://localhost:3000/', PLAZO_APP_MS, (s) => s < 500);
  ok('web-ciudadano responde /');
  await esperarHttp('panel-admin', 'http://localhost:3100/login', PLAZO_APP_MS, (s) => s < 500);
  ok('panel-admin responde /login');
}

// --------------------------------------------------------------------------- correr la suite

/** Corre un grupo con Playwright (reutiliza la pila ya levantada) y resume el resultado. */
async function correrGrupo(grupo) {
  const nombres = GRUPOS[grupo];
  const specs = nombres.map((n) => `tests/${n}.spec.ts`);
  const proyectos = ['--project=chromium'];
  if (nombres.some((n) => CON_MOVIL.has(n))) proyectos.push('--project=movil');
  const jsonPath = join(DIR_LOGS, `resultado-${grupo}.json`);

  log('');
  info(`grupo ${grupo}: ${nombres.join(', ')} [${proyectos.join(' ')}]`);
  const entorno = {
    ...process.env,
    PANEL_ADMIN_URL: 'http://localhost:3100',
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath,
  };
  const codigo = await npx(
    [
      ...PNPM,
      '--filter',
      'e2e',
      'exec',
      'playwright',
      'test',
      ...specs,
      ...proyectos,
      '--reporter=list,json',
    ],
    { env: entorno },
  );
  resumir(grupo, jsonPath);
  return codigo;
}

/** Junta cada spec (archivo + proyecto) con su conteo de ok/fallo, recorriendo las suites. */
function recolectar(suite, acumulador) {
  for (const spec of suite.specs ?? []) {
    const archivo = basename(spec.file ?? suite.file ?? 'desconocido');
    for (const t of spec.tests ?? []) {
      const clave = `${archivo} [${t.projectName}]`;
      const e = acumulador.get(clave) ?? { ok: 0, fallo: 0 };
      if (t.status === 'skipped') continue;
      if (t.status === 'expected' || t.status === 'flaky') e.ok += 1;
      else e.fallo += 1;
      acumulador.set(clave, e);
    }
  }
  for (const s of suite.suites ?? []) recolectar(s, acumulador);
}

/** Imprime el resumen por spec a partir del JSON de Playwright (o avisa si no se pudo leer). */
function resumir(grupo, jsonPath) {
  log('');
  log(`──── resumen del grupo ${grupo} ────`);
  if (!existsSync(jsonPath)) {
    aviso('no hay JSON de Playwright: mirá la salida de arriba (reporter list)');
    return;
  }
  let datos;
  try {
    datos = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    aviso('no pude leer el JSON de Playwright: mirá la salida de arriba');
    return;
  }
  const acumulador = new Map();
  for (const s of datos.suites ?? []) recolectar(s, acumulador);
  const claves = [...acumulador.keys()].sort();
  for (const clave of claves) {
    const { ok: pasaron, fallo } = acumulador.get(clave);
    const marca = fallo === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    log(`  ${marca} ${clave}  (${pasaron} ok${fallo ? `, ${fallo} fallo(s)` : ''})`);
  }
  const s = datos.stats ?? {};
  log(
    `  totales: ${s.expected ?? 0} ok · ${s.unexpected ?? 0} fallo(s) · ${s.flaky ?? 0} inestable(s) · ${s.skipped ?? 0} salteado(s)`,
  );
}

// --------------------------------------------------------------------------- limpieza y señales

/** Mata el árbol de un proceso (en Windows por taskkill /T; en POSIX por grupo). */
function matarArbol(hijo) {
  if (!hijo?.pid) return;
  try {
    if (EN_WINDOWS)
      spawnSync('taskkill.exe', ['/PID', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-hijo.pid, 'SIGKILL');
  } catch {
    // Ya pudo haber muerto.
  }
}

function matarTodos() {
  for (const p of procesos) matarArbol(p.hijo);
}

/** Cierra los servicios y confirma que los puertos quedaron libres. Idempotente. */
async function limpiar() {
  if (limpiando) return;
  limpiando = true;
  if (procesos.length) {
    log('');
    info('cerrando los servicios…');
    matarTodos();
    await dormir(1500);
    for (const [nombre, puerto] of Object.entries(PUERTOS)) {
      const libre = await puertoLibre(puerto);
      log(`  puerto ${puerto} (${nombre}): ${libre ? 'libre' : 'TODAVÍA OCUPADO'}`);
    }
  }
}

function registrarSenales() {
  for (const senal of ['SIGINT', 'SIGTERM']) {
    process.on(senal, () => {
      error(`recibí ${senal}: cierro los servicios y salgo`);
      matarTodos();
      process.exit(130);
    });
  }
}

// --------------------------------------------------------------------------- argumentos

function parsearArgumentos(argv) {
  const opciones = {
    grupo: 'G1',
    soloPreparar: false,
    resembrar: false,
    forzar: false,
    ayuda: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ayuda' || a === '-h' || a === '--help') opciones.ayuda = true;
    else if (a === '--solo-preparar') opciones.soloPreparar = true;
    else if (a === '--resembrar') opciones.resembrar = true;
    else if (a === '--forzar') opciones.forzar = true;
    else if (a === '--grupo') opciones.grupo = argv[++i];
    else if (a.startsWith('--grupo=')) opciones.grupo = a.slice('--grupo='.length);
    else throw new ErrorPreparacion(`opción no reconocida: "${a}" (probá --ayuda)`);
  }
  const grupo = (opciones.grupo ?? '').toUpperCase();
  const validos = [...Object.keys(GRUPOS), 'TODOS'];
  if (!validos.includes(grupo))
    throw new ErrorPreparacion(
      `--grupo tiene que ser uno de ${validos.join(', ')} (vino "${opciones.grupo}")`,
    );
  opciones.grupo = grupo;
  return opciones;
}

// --------------------------------------------------------------------------- main

async function main() {
  const opciones = parsearArgumentos(process.argv.slice(2));
  if (opciones.ayuda) {
    log(AYUDA);
    return 0;
  }

  mkdirSync(DIR_LOGS, { recursive: true });
  registrarSenales();

  // 1) Chequeos previos.
  await comprobarDocker();
  comprobarRam(opciones.forzar);
  if (!opciones.soloPreparar) await comprobarPuertos();

  // 2) Base de prueba aparte.
  const urls = urlsDeBasePrueba();
  info(`base de prueba: "${urls.base}" (nunca se toca "${urls.baseReal}")`);
  await prepararBase(urls, opciones.resembrar);

  if (opciones.soloPreparar) {
    ok('preparación lista (--solo-preparar): no levanto la pila ni corro pruebas');
    return 0;
  }

  // 3) Levantar la pila y esperar a que responda.
  await copiarWorkersMaplibre();
  levantarServicios(urls);
  await esperarServicios();

  // 4) Correr el grupo (o todos, cortando si la RAM baja).
  const grupos = opciones.grupo === 'TODOS' ? Object.keys(GRUPOS) : [opciones.grupo];
  let salida = 0;
  for (const grupo of grupos) {
    if (opciones.grupo === 'TODOS') {
      const libre = ramLibreMB();
      if (libre < RAM_CORTE_TODOS_MB) {
        aviso(`RAM libre ${libre} MB (< ${RAM_CORTE_TODOS_MB}): corto antes del grupo ${grupo}`);
        salida = salida || 1;
        break;
      }
    }
    const codigo = await correrGrupo(grupo);
    if (codigo !== 0) salida = codigo;
  }
  return salida;
}

try {
  const codigo = await main();
  await limpiar();
  process.exit(codigo);
} catch (e) {
  if (e instanceof ErrorPreparacion) {
    error(e.message);
    await limpiar();
    process.exit(2);
  }
  error(`inesperado: ${e instanceof Error ? e.stack : String(e)}`);
  await limpiar();
  process.exit(2);
}
