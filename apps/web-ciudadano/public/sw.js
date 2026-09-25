/**
 * Service worker mínimo (PWA). Hace cuatro cosas y ninguna más:
 *
 * 1. **Navegación: red primero, caché como red de emergencia.** Al revés (caché primero) se sirve
 *    un HTML viejo que pide fragmentos de JS que ya no existen tras un despliegue, y la app queda
 *    en blanco hasta que el usuario borra los datos del sitio.
 * 2. **Capas y teselas de geo-service: caché que respeta las cabeceras del servicio.** geo-service
 *    publica `Cache-Control: max-age=300` y un `ETag` que lleva dentro la `version_capa`. Guardar
 *    sin mirar eso deja al vecino con los límites viejos **para siempre** en cuanto el
 *    administrador activa una versión nueva de capa (CLAUDE.md §14.5).
 * 3. **Estáticos con huella (`/_next/static/…`): caché primero y se guardan.** Llevan el hash del
 *    contenido en el nombre, así que nunca cambian: pedirlos a la red en cada visita es tiempo
 *    tirado, y —lo importante— sin guardarlos el shell que devolvía el modo sin red era una
 *    página que pedía un JS inexistente, es decir, una pantalla en blanco disfrazada de éxito.
 * 4. **Resto de estáticos del propio origen: red, y si no hay red, lo que haya en caché.**
 *
 * La API (`/api/`) no se cachea nunca: son reportes, y uno viejo es peor que ninguno. Tampoco se
 * toca nada que no sea del propio origen ni ninguna petición con credenciales.
 *
 * **Las dos cachés tienen tope.** Sin él crecían sin fin: basta pasear por el mapa para pedir
 * miles de teselas distintas, y los estáticos con huella se acumulan uno por cada despliegue.
 * Una caché sin tope acaba llenando la cuota del sitio, y cuando eso pasa el navegador puede
 * tirar TODO el almacenamiento del origen de golpe.
 */
const VERSION = 'v5';
const CACHE_SHELL = `curichi-shell-${VERSION}`;
const CACHE_CAPAS = `curichi-capas-${VERSION}`;
const VIGENTES = [CACHE_SHELL, CACHE_CAPAS];

const SHELL = ['/', '/manifest.webmanifest', '/icono.svg', '/logo.png'];

/**
 * Topes de entradas. El de capas es el que importa: a 16 teselas por pantalla y varios niveles de
 * zoom, un paseo por la ciudad pasa del millar. 400 cubre de sobra la zona que alguien mira de
 * verdad. El de estáticos cubre unos cuantos despliegues de la app.
 */
const MAX_CAPAS = 400;
const MAX_SHELL = 120;

/** El mismo `max-age` que declara geo-service en `/geo/v1/capas/*` y `/geo/v1/teselas/*`. */
const FRESCURA_MS = 300_000;
/** Marca propia con el momento de guardado: `date` puede venir del proxy y no del origen. */
const CABECERA_GUARDADO = 'x-curichi-guardado-en';

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
      .then(() => self.clients.claim()),
  );
});

function esCapa(url) {
  return url.pathname.startsWith('/geo/v1/capas/') || url.pathname.startsWith('/geo/v1/teselas/');
}

/** Estáticos con el hash del contenido en el nombre: inmutables por construcción. */
function esConHuella(url) {
  return url.pathname.startsWith('/_next/static/');
}

/** ¿La copia guardada sigue dentro de la ventana de frescura del servicio? */
function esFresca(res) {
  const t = Number(res.headers.get(CABECERA_GUARDADO));
  return Number.isFinite(t) && Date.now() - t < FRESCURA_MS;
}

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

/** Guarda la respuesta anotando cuándo se guardó, para poder caducarla después. */
async function guardar(c, req, res, cuerpo, maximo) {
  const cabeceras = new Headers(res.headers);
  cabeceras.set(CABECERA_GUARDADO, String(Date.now()));
  await c.put(req, new Response(cuerpo, { status: 200, headers: cabeceras }));
  await recortar(c, maximo);
}

/** Capas y teselas: copia fresca → revalidación por `ETag` → copia vieja si no hay red. */
async function capa(req) {
  const c = await caches.open(CACHE_CAPAS);
  const guardada = await c.match(req);
  if (guardada && esFresca(guardada)) return guardada;

  const etag = guardada?.headers.get('etag');
  try {
    const res = await fetch(etag ? new Request(req, { headers: { 'If-None-Match': etag } }) : req);
    // 304: el ETag no cambió, así que tampoco la version_capa. Se renueva solo la marca.
    if (res.status === 304 && guardada) {
      const cuerpo = await guardada.clone().blob();
      await guardar(c, req, guardada, cuerpo, MAX_CAPAS);
      return guardada;
    }
    if (res.ok) await guardar(c, req, res, await res.clone().blob(), MAX_CAPAS);
    return res;
  } catch (e) {
    // Sin red: una capa vieja se puede dibujar; una pantalla vacía, no.
    if (guardada) return guardada;
    throw e;
  }
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

/** Estático con huella: caché primero, y se guarda al traerlo. El nombre garantiza el contenido. */
async function conHuella(req) {
  const c = await caches.open(CACHE_SHELL);
  const guardada = await c.match(req);
  if (guardada) return guardada;
  const res = await fetch(req);
  if (res.ok) await guardar(c, req, res, await res.clone().blob(), MAX_SHELL);
  return res;
}

/** Resto de estáticos del propio origen: red, y si no hay red, lo que haya en caché. */
async function estatico(req) {
  const c = await caches.open(CACHE_SHELL);
  try {
    const res = await fetch(req);
    // Se guarda al pasar: si no, la caché solo tendría lo del `install` y el modo sin red daría
    // una página a medias. Solo respuestas completas del propio origen.
    if (res.ok && res.type !== 'opaque')
      await guardar(c, req, res, await res.clone().blob(), MAX_SHELL);
    return res;
  } catch (e) {
    const guardada = await c.match(req);
    if (guardada) return guardada;
    throw e;
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(navegacion(e.request));
  } else if (esCapa(url)) {
    e.respondWith(capa(e.request));
  } else if (url.origin === self.location.origin) {
    e.respondWith(esConHuella(url) ? conHuella(e.request) : estatico(e.request));
  }
});
