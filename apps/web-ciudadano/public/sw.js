/**
 * Service worker mínimo (PWA). Hace cinco cosas y ninguna más:
 *
 * 1. **Navegación: red primero, caché como red de emergencia.** Al revés (caché primero) se sirve
 *    un HTML viejo que pide fragmentos de JS que ya no existen tras un despliegue, y la app queda
 *    en blanco hasta que el usuario borra los datos del sitio.
 * 2. **Capas y teselas con huella: caché primero.** Desde contracts 0.12.0 la URL que geo-service
 *    pone en `CapaInfo.url` lleva la huella del contenido (`/geo/v1/capas/{capa}/v/{huella}` y
 *    `/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt`) y se sirve `immutable`: lo guardado con
 *    una huella no puede quedar viejo. Lo que sí hay que hacer es borrar las huellas que dejaron
 *    de ser vigentes, y eso se hace cada vez que se conoce la lista de vigentes: al activarse,
 *    cuando la página pide `/geo/v1/capas` y cuando una huella responde `410 CAPA_CAMBIO`. El 410
 *    no se guarda y llega a la página, que con él vuelve a pedir la lista y cambia la fuente.
 * 3. **Estáticos con huella: caché primero y se guardan.** `/_next/static/…` lleva el hash del
 *    contenido en el nombre, y el worker de MapLibre y los glifos llevan `?v=`: nunca cambian.
 *    Pedirlos a la red en cada visita es tiempo tirado y, sin guardarlos, el shell que devolvía el
 *    modo sin red era una página que pedía un JS inexistente: una pantalla en blanco disfrazada
 *    de éxito.
 * 4. **Resto de lo del propio origen (y las capas sin huella): red, y si no hay red, lo que haya
 *    en caché.** La lista de capas, los agregados y los alias sin huella son `no-cache`: la
 *    revalidación con `ETag` la hace la caché HTTP del navegador por debajo de este `fetch`.
 * 5. **Borra las cachés de versiones anteriores al activarse.**
 *
 * La API (`/api/`) no se cachea nunca: son reportes, y uno viejo es peor que ninguno. Tampoco se
 * toca nada que no sea del propio origen ni ninguna petición que no sea GET.
 *
 * **Las dos cachés tienen tope.** Sin él crecían sin fin: basta pasear por el mapa para pedir
 * miles de teselas distintas, y los estáticos con huella se acumulan uno por cada despliegue.
 * Una caché sin tope acaba llenando la cuota del sitio, y cuando eso pasa el navegador puede
 * tirar TODO el almacenamiento del origen de golpe.
 */
const VERSION = 'v6';
const CACHE_SHELL = `curichi-shell-${VERSION}`;
const CACHE_CAPAS = `curichi-capas-${VERSION}`;
const VIGENTES = [CACHE_SHELL, CACHE_CAPAS];

const SHELL = ['/', '/manifest.webmanifest', '/icono.svg', '/logo.webp'];

/** La lista de capas vigentes, con la huella de cada una en su `url`. */
const RUTA_LISTA_DE_CAPAS = '/geo/v1/capas';

/**
 * Topes de entradas. El de capas es el que importa: a 16 teselas por pantalla y varios niveles de
 * zoom, un paseo por la ciudad pasa del millar. 400 cubre de sobra la zona que alguien mira de
 * verdad. El de estáticos cubre unos cuantos despliegues de la app.
 */
const MAX_CAPAS = 400;
const MAX_SHELL = 120;

/** Cuánto se espera la lista de capas al activarse: la activación retiene las peticiones. */
const ESPERA_LISTA_MS = 5000;

/**
 * Las hojas de estilo que pide la portada, leídas del propio HTML que se acaba de guardar.
 *
 * Hacen falta en el `install` y no basta con guardarlas «al pasar»: comprobado en el navegador
 * con `next start` y el servidor apagado después, el modo sin red devolvía el shell correcto
 * **pero sin estilos**, en Times New Roman. El motivo es que el CSS es un recurso que bloquea el
 * render: el navegador lo pide en la fase de preescaneo y, con una respuesta `immutable` ya en su
 * propia caché HTTP, esa petición no siempre vuelve a pasar por aquí, así que nunca se guardaba.
 * El JS sí, porque llega más tarde y por el camino normal.
 *
 * El nombre del archivo lleva el hash del contenido y cambia en cada despliegue, así que no se
 * puede escribir en `SHELL`: hay que sacarlo del HTML. Si algo falla —el HTML cambió de forma, la
 * red se cortó a medias— se sigue adelante: es una mejora del modo sin red, no un requisito para
 * instalar el service worker.
 */
async function guardarEstilosDelShell(c) {
  try {
    const res = await c.match('/');
    if (!res) return;
    const html = await res.text();
    const hojas = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)]
      .map((m) => m[1])
      .filter((u) => u.startsWith('/'));
    if (hojas.length) await c.addAll([...new Set(hojas)]);
  } catch {
    /* el shell sin estilos sigue siendo mejor que ningún shell */
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then(async (c) => {
        await c.addAll(SHELL);
        await guardarEstilosDelShell(c);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(ks.filter((k) => !VIGENTES.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim())
      .then(() => actualizarVigentes(AbortSignal.timeout?.(ESPERA_LISTA_MS))),
  );
});

// ---------------------------------------------------------------------------------------------
// Huellas de capa

const CAPA_CON_HUELLA = /^\/geo\/v1\/capas\/([a-z_]+)\/v\/([0-9a-f]{16})$/;
/** También reconoce la plantilla de `CapaInfo.url`, con `{z}/{x}/{y}` literales. */
const TESELA_CON_HUELLA =
  /^\/geo\/v1\/teselas\/([a-z_]+)\/([0-9a-f]{16})\/[^/]+\/[^/]+\/[^/]+\.mvt$/;
/** Alias sin huella (`public, no-cache`). `vigentes` es otra ruta, no una capa. */
const CAPA_SIN_HUELLA = /^\/geo\/v1\/capas\/(?!vigentes$)[a-z_]+$/;
const TESELA_SIN_HUELLA = /^\/geo\/v1\/teselas\/[a-z_]+\/\d+\/\d+\/\d+\.mvt$/;

/** `capa/huella` de una ruta de capa o de tesela, o `null` si no lleva huella. */
function huellaDe(ruta) {
  const m = CAPA_CON_HUELLA.exec(ruta) ?? TESELA_CON_HUELLA.exec(ruta);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** `capa/huella` de cada capa vigente, sacadas de `CapaInfo.url` (relativa). */
function huellasDeLaLista(lista) {
  if (!Array.isArray(lista)) return null;
  return new Set(lista.map((c) => huellaDe(String(c?.url ?? '').split(/[?#]/)[0])).filter(Boolean));
}

/**
 * Las huellas vigentes de la última lista vista. Sirve para que una ráfaga de 410 de la misma
 * huella vieja no pida la lista una vez por tesela. Se pierde si el navegador duerme al service
 * worker; entonces el siguiente 410 la vuelve a pedir, que es lo correcto.
 */
let vigentesConocidas = null;
let listaEnVuelo = null;

/** Borra de la caché de capas toda huella que no figure en `vigentes`. */
async function borrarHuellasViejas(vigentes) {
  vigentesConocidas = vigentes;
  const c = await caches.open(CACHE_CAPAS);
  const claves = await c.keys();
  await Promise.all(
    claves
      .filter((req) => {
        const h = huellaDe(new URL(req.url).pathname);
        return h !== null && !vigentes.has(h);
      })
      .map((req) => c.delete(req)),
  );
}

/**
 * Pide la lista de capas vigentes y borra las huellas viejas. Sin red o con una respuesta rara no
 * borra nada: sin la lista no se sabe cuál es vieja, y borrar la vigente dejaría el mapa en
 * blanco sin conexión.
 */
function actualizarVigentes(signal) {
  listaEnVuelo ??= (async () => {
    try {
      const res = await fetch(new URL(RUTA_LISTA_DE_CAPAS, self.location.origin).href, { signal });
      if (!res.ok) return;
      const vigentes = huellasDeLaLista(await res.json());
      if (vigentes) await borrarHuellasViejas(vigentes);
    } catch {
      /* se intentará con la próxima lista */
    } finally {
      listaEnVuelo = null;
    }
  })();
  return listaEnVuelo;
}

// ---------------------------------------------------------------------------------------------
// Estrategias

/**
 * Deja la caché por debajo del tope borrando las entradas más antiguas. `cache.keys()` devuelve
 * las peticiones en orden de inserción, así que el primero de la lista es el que lleva más tiempo
 * sin renovarse. No es un LRU —renovar una entrada no la mueve al final— pero para teselas es
 * suficiente: lo que se quiere evitar es el crecimiento sin fin, no acertar con el desalojo.
 */
async function recortar(c, maximo) {
  const claves = await c.keys();
  if (claves.length <= maximo) return;
  await Promise.all(claves.slice(0, claves.length - maximo).map((k) => c.delete(k)));
}

async function guardar(c, req, res, maximo) {
  await c.put(req, res.clone());
  await recortar(c, maximo);
}

/**
 * Capa o tesela con huella: caché primero. Un 204 (tesela vacía) también se guarda. Ante un 410
 * se actualizan las huellas vigentes y el 410 sigue hasta la página.
 */
async function capaConHuella(e, huella) {
  const c = await caches.open(CACHE_CAPAS);
  const guardada = await c.match(e.request);
  if (guardada) return guardada;
  const res = await fetch(e.request);
  if (res.ok) await guardar(c, e.request, res, MAX_CAPAS);
  else if (res.status === 410 && (vigentesConocidas === null || vigentesConocidas.has(huella)))
    e.waitUntil(actualizarVigentes());
  return res;
}

/** Navegación: red primero; sin red, el shell guardado en `install`. */
async function navegacion(req) {
  try {
    return await fetch(req);
  } catch (e) {
    const guardada = await caches.open(CACHE_SHELL).then((c) => c.match('/'));
    if (guardada) return guardada;
    throw e;
  }
}

/** Estático con huella: caché primero, y se guarda al traerlo. La URL garantiza el contenido. */
async function conHuella(req) {
  const c = await caches.open(CACHE_SHELL);
  const guardada = await c.match(req);
  if (guardada) return guardada;
  const res = await fetch(req);
  if (res.ok) await guardar(c, req, res, MAX_SHELL);
  return res;
}

/**
 * Red, y si no hay red, lo que haya en caché. Se guarda al pasar: si no, la caché solo tendría lo
 * del `install` y el modo sin red daría una página a medias. Solo respuestas completas.
 */
async function redPrimero(req, nombre, maximo) {
  const c = await caches.open(nombre);
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') await guardar(c, req, res, maximo);
    return res;
  } catch (e) {
    const guardada = await c.match(req);
    if (guardada) return guardada;
    throw e;
  }
}

/** La lista de capas que pide la página: además de servirla, se usa para borrar huellas viejas. */
async function listaDeCapas(e) {
  const res = await redPrimero(e.request, CACHE_SHELL, MAX_SHELL);
  e.waitUntil(
    res
      .clone()
      .json()
      .then((lista) => {
        const vigentes = huellasDeLaLista(lista);
        if (vigentes) return borrarHuellasViejas(vigentes);
      })
      .catch(() => {}),
  );
  return res;
}

/** `/_next/static/…` lleva el hash en el nombre; el worker de MapLibre y los glifos, `?v=`. */
function esEstaticoConHuella(url) {
  if (url.pathname.startsWith('/_next/static/')) return true;
  const conVersion = url.pathname.startsWith('/maplibre/') || url.pathname.startsWith('/glifos/');
  return conVersion && url.searchParams.has('v');
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(navegacion(e.request));
    return;
  }
  const huella = huellaDe(url.pathname);
  if (huella) e.respondWith(capaConHuella(e, huella));
  else if (CAPA_SIN_HUELLA.test(url.pathname) || TESELA_SIN_HUELLA.test(url.pathname))
    e.respondWith(redPrimero(e.request, CACHE_CAPAS, MAX_CAPAS));
  else if (url.pathname === RUTA_LISTA_DE_CAPAS) e.respondWith(listaDeCapas(e));
  else if (esEstaticoConHuella(url)) e.respondWith(conHuella(e.request));
  else e.respondWith(redPrimero(e.request, CACHE_SHELL, MAX_SHELL));
});
