/**
 * Hash de contraseñas: **Argon2id** (recomendación primera de OWASP) con compatibilidad hacia
 * atrás con los hashes `scrypt` que ya existían.
 *
 * Por qué se cambió (medido en esta máquina, Node 24):
 *  - scrypt tal como estaba, N=2^14: 40 ms y 16 MiB. Está por DEBAJO del mínimo que OWASP pide
 *    para scrypt (N=2^17), y subirlo hasta ahí cuesta 307 ms y 128 MiB por login; con varios
 *    logins a la vez, esa memoria es en sí misma un vector de agotamiento.
 *  - Argon2id con los parámetros de OWASP (m=19 MiB, t=2, p=1): 62 ms al crear y 47 ms al
 *    verificar. Más barato y con el algoritmo recomendado.
 *
 * Se usa `hash-wasm` (Argon2 compilado a WebAssembly) y no un binding nativo para no romper el
 * ADR 0002: el entorno de desarrollo no puede compilar módulos nativos.
 *
 * El formato de Argon2id es el estándar PHC y **lleva sus propios parámetros dentro**
 * (`$argon2id$v=19$m=19456,t=2,p=1$sal$hash`), así que subirlos en el futuro no invalida los
 * hashes viejos. El formato anterior (`scrypt$sal$hash`) no guardaba ninguno: era imposible
 * cambiar el coste sin dejar a todo el mundo fuera.
 */
import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { argon2id, argon2Verify } from 'hash-wasm';

/** `promisify` pierde la sobrecarga con opciones, así que se envuelve a mano. */
function scryptAsync(
  clave: string,
  sal: string,
  largo: number,
  opciones: ScryptOptions,
): Promise<Buffer> {
  return new Promise((res, rej) => {
    scrypt(clave, sal, largo, opciones, (e, k) => (e ? rej(e) : res(k as Buffer)));
  });
}

/** Parámetros actuales (OWASP, 2024: m ≥ 19 MiB, t ≥ 2, p = 1). */
export const PARAMS_ARGON2 = { memoriaKiB: 19_456, iteraciones: 2, paralelismo: 1 } as const;

/* ------------------------------------------------------------------------------------------- *
 * Argon2 fuera del hilo principal (Fase 4)
 *
 * El problema, medido en esta máquina con un medidor calibrado contra un bloqueo conocido de
 * 300 ms:
 *
 *   argon2id (hash-wasm), 20 verificaciones a la vez  → 614 ms de bucle de eventos BLOQUEADO
 *   argon2id (hash-wasm), 10 verificaciones a la vez  → 291 ms
 *   scryptSync legado,    10 verificaciones a la vez  → 505 ms
 *
 * Durante ese tiempo el proceso no atiende NADA: ni el mapa público, ni /health, ni /ready. Y
 * `POST /auth/login` es público. El límite de peticiones de login es por IP, así que veinte IP
 * distintas bastan para dejar la API muda sin necesidad de ancho de banda: una denegación de
 * servicio por CPU, barata y difícil de distinguir de tráfico normal.
 *
 * Lo que NO lo arregla, y se comprobó:
 *
 *  - `crypto.argon2` de Node 24 pese a ser asíncrono: bloquea igual (269 ms con 10 a la vez,
 *    incluso con UV_THREADPOOL_SIZE=12). Es un envoltorio asíncrono sobre una implementación que
 *    corre en el hilo principal. `crypto.scrypt`, en cambio, sí descarga bien (17 ms), lo que
 *    confirma que la diferencia está en argon2 y no en la medición.
 *  - Un semáforo que limite cuántos hashes corren a la vez: como cada uno es síncrono, el tiempo
 *    total de bloqueo es idéntico, solo repartido en trozos.
 *  - Bajar los parámetros de Argon2 o volver a scrypt: eso es debilitar la seguridad para tapar
 *    un problema de arquitectura.
 *
 * Lo que sí lo arregla: hacerlo en workers. `node:worker_threads` es parte de Node, así que no
 * añade ninguna dependencia. El worker usa SOLO `node:crypto`, y se comprobó que su salida es
 * idéntica bit a bit a la de hash-wasm y que hash-wasm verifica los PHC que produce, así que los
 * hashes ya guardados siguen valiendo y los nuevos son intercambiables.
 * ------------------------------------------------------------------------------------------- */

/**
 * Código del worker, en línea y como CommonJS. Va incrustado a propósito en vez de en su propio
 * archivo: así funciona igual ejecutando desde `src/` con tsx (tests) que desde `dist/` compilado,
 * sin depender de que el build copie un archivo suelto ni de resolver rutas en tiempo de ejecución.
 */
const CODIGO_WORKER = `
const { parentPort } = require('node:worker_threads');
const { argon2Sync, randomBytes, timingSafeEqual } = require('node:crypto');

const b64 = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '');

function calcular(clave, sal, m, t, p) {
  return Buffer.from(
    argon2Sync('argon2id', {
      message: Buffer.from(clave, 'utf8'),
      nonce: sal,
      memory: m,
      passes: t,
      parallelism: p,
      tagLength: 32,
    }),
  );
}

parentPort.on('message', (msg) => {
  try {
    if (msg.tipo === 'hash') {
      const sal = randomBytes(16);
      const h = calcular(msg.clave, sal, msg.m, msg.t, msg.p);
      parentPort.postMessage({
        id: msg.id,
        valor: '$argon2id$v=19$m=' + msg.m + ',t=' + msg.t + ',p=' + msg.p + '$' + b64(sal) + '$' + b64(h),
      });
    } else {
      const partes = msg.phc.split('$');
      const cfg = /m=(\\d+),t=(\\d+),p=(\\d+)/.exec(partes[3] || '');
      if (partes[1] !== 'argon2id' || !cfg) return parentPort.postMessage({ id: msg.id, valor: false });
      const sal = Buffer.from(partes[4], 'base64');
      const esperado = Buffer.from(partes[5], 'base64');
      const h = calcular(msg.clave, sal, Number(cfg[1]), Number(cfg[2]), Number(cfg[3]));
      parentPort.postMessage({
        id: msg.id,
        valor: h.length === esperado.length && timingSafeEqual(h, esperado),
      });
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: String((e && e.message) || e) });
  }
});
`;

interface Pendiente {
  resolver: (v: unknown) => void;
  rechazar: (e: Error) => void;
}

/**
 * Cuántos workers. Dos por defecto: el trabajo es puro CPU y cada uno reserva 19 MiB por hash, así
 * que más workers no dan más throughput en una máquina modesta y sí más memoria. Se puede subir
 * con PASSWORD_WORKERS en una máquina con núcleos de sobra.
 */
const N_WORKERS = Math.max(1, Number(process.env.PASSWORD_WORKERS ?? 2));
/**
 * Tope de la cola. Sin él, una avalancha de logins acumula peticiones en memoria sin límite: se
 * cambia un bloqueo del bucle por un consumo de memoria creciente, que es peor. Al llegar al tope
 * se rechaza y la ruta responde un error, que es la respuesta honesta a "no doy abasto".
 */
const MAX_COLA = Math.max(8, Number(process.env.PASSWORD_COLA_MAX ?? 128));

let workers: Worker[] | null = null;
let siguienteWorker = 0;
let siguienteId = 1;
let enCola = 0;
const pendientes = new Map<number, Pendiente>();
/** Si los workers no se pueden crear (entorno restringido), se cae al cálculo en el mismo hilo. */
let sinWorkers = process.env.PASSWORD_SIN_WORKERS === '1';

/** Descuenta un trabajo y, si no queda ninguno, deja de retener el proceso. */
function soltar(): void {
  enCola--;
  if (enCola <= 0) {
    enCola = 0;
    if (workers) for (const w of workers) w.unref();
  }
}

function arrancarWorkers(): Worker[] | null {
  if (sinWorkers) return null;
  if (workers) return workers;
  try {
    workers = Array.from({ length: N_WORKERS }, () => {
      const w = new Worker(CODIGO_WORKER, { eval: true });
      w.on('message', (m: { id: number; valor?: unknown; error?: string }) => {
        const p = pendientes.get(m.id);
        if (!p) return;
        pendientes.delete(m.id);
        soltar();
        if (m.error) p.rechazar(new Error(m.error));
        else p.resolver(m.valor);
      });
      w.on('error', (e) => {
        // Un worker caído no puede dejar colgadas las peticiones que tenía: se rechazan y se
        // fuerza la recreación del grupo en la siguiente llamada.
        for (const [id, p] of pendientes) {
          pendientes.delete(id);
          soltar();
          p.rechazar(e);
        }
        workers = null;
      });
      // Sin trabajo en vuelo, el worker NO debe impedir que el proceso termine; con trabajo en
      // vuelo, sí debe impedirlo. Con un `unref()` permanente Node daba el bucle por vacío y
      // salía dejando el hash a medias ("Detected unsettled top-level await"): el login se
      // quedaba colgado. El conteo de abajo hace ref()/unref() según haya o no pendientes.
      w.unref();
      return w;
    });
    return workers;
  } catch {
    sinWorkers = true;
    workers = null;
    return null;
  }
}

function pedirAlWorker<T>(mensaje: Record<string, unknown>): Promise<T> | null {
  const grupo = arrancarWorkers();
  if (!grupo?.length) return null;
  if (enCola >= MAX_COLA)
    return Promise.reject(
      new Error('cola de hashing llena: demasiadas verificaciones de contraseña a la vez'),
    );
  const id = siguienteId++;
  const w = grupo[siguienteWorker++ % grupo.length] as Worker;
  enCola++;
  if (enCola === 1) for (const x of grupo) x.ref();
  return new Promise<T>((resolver, rechazar) => {
    pendientes.set(id, { resolver: resolver as (v: unknown) => void, rechazar });
    w.postMessage({ ...mensaje, id });
  });
}

/** Cierra los workers. Para los tests y para un apagado ordenado; no hace falta en producción. */
export async function cerrarWorkersDePassword(): Promise<void> {
  const grupo = workers;
  workers = null;
  if (grupo) await Promise.all(grupo.map((w) => w.terminate()));
}

/** Parámetros con los que se generaron los hashes `scrypt` antiguos. Solo para verificarlos. */
const SCRYPT_LEGADO = { N: 16384, r: 8, p: 1 } as const;
const LARGO_CLAVE_SCRYPT = 64;

export async function hashPassword(password: string): Promise<string> {
  const enWorker = pedirAlWorker<string>({
    tipo: 'hash',
    clave: password,
    m: PARAMS_ARGON2.memoriaKiB,
    t: PARAMS_ARGON2.iteraciones,
    p: PARAMS_ARGON2.paralelismo,
  });
  if (enWorker) return enWorker;
  // Sin workers (entorno restringido): hash-wasm en este mismo hilo. Produce el mismo PHC.
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: PARAMS_ARGON2.paralelismo,
    memorySize: PARAMS_ARGON2.memoriaKiB,
    iterations: PARAMS_ARGON2.iteraciones,
    hashLength: 32,
    outputType: 'encoded',
  });
}

/**
 * Verifica un hash `scrypt$sal$hash` del formato antiguo.
 *
 * Con `scryptSync` esto bloqueaba el bucle de eventos: diez verificaciones seguidas lo dejaban
 * parado medio segundo. La versión asíncrona de `crypto.scrypt` sí corre en el pool de hilos de
 * libuv —comprobado: 10 en paralelo pasan de 505 ms de bloqueo a 17 ms— y da exactamente el
 * mismo resultado.
 */
async function verificarScryptLegado(password: string, almacenado: string): Promise<boolean> {
  const [alg, sal, hash] = almacenado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  let esperado: Buffer;
  try {
    esperado = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (esperado.length !== LARGO_CLAVE_SCRYPT) return false;
  const calculado = await scryptAsync(password, sal, LARGO_CLAVE_SCRYPT, SCRYPT_LEGADO);
  return timingSafeEqual(calculado, esperado);
}

/** Acepta tanto Argon2id como los hashes scrypt anteriores; nunca lanza. */
export async function verificarPassword(password: string, almacenado: string): Promise<boolean> {
  if (almacenado.startsWith('$argon2')) {
    const enWorker = pedirAlWorker<boolean>({
      tipo: 'verificar',
      clave: password,
      phc: almacenado,
    });
    if (enWorker) {
      try {
        return await enWorker;
      } catch {
        // Un worker caído o la cola llena no pueden convertirse en "contraseña correcta".
        return false;
      }
    }
    try {
      return await argon2Verify({ password, hash: almacenado });
    } catch {
      return false;
    }
  }
  return verificarScryptLegado(password, almacenado);
}

/**
 * ¿Conviene regenerar el hash? Es true para los hashes scrypt antiguos y para los Argon2id
 * creados con parámetros más flojos que los de ahora. Quien llama lo usa tras un login correcto
 * para migrar la contraseña sin que el usuario note nada.
 */
export function necesitaRehash(almacenado: string): boolean {
  if (!almacenado.startsWith('$argon2id$')) return true;
  const m = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(almacenado);
  if (!m) return true;
  return (
    Number(m[1]) < PARAMS_ARGON2.memoriaKiB ||
    Number(m[2]) < PARAMS_ARGON2.iteraciones ||
    Number(m[3]) !== PARAMS_ARGON2.paralelismo
  );
}

/**
 * Hash de un valor imposible, para gastar el mismo tiempo cuando el email no existe. Sin esto,
 * el login responde mucho más rápido con un email desconocido que con uno real: basta
 * cronometrar para enumerar las cuentas del municipio.
 *
 * Se calcula una sola vez y de forma perezosa porque Argon2id es asíncrono.
 */
let señuelo: Promise<string> | null = null;
export function hashSeñuelo(): Promise<string> {
  señuelo ??= hashPassword(randomBytes(32).toString('hex'));
  return señuelo;
}
