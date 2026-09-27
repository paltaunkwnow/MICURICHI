/**
 * El service worker (`public/sw.js`) no se puede importar: corre en un ámbito propio con `self`,
 * `caches` y `fetch` globales. Aquí se carga su código en una función con esos nombres inyectados
 * y se conduce el manejador `fetch` a mano.
 *
 * Lo que se prueba es la decisión, que es donde estaban los fallos: una capa guardada se servía
 * para siempre, así que al activar una versión nueva de capa el vecino seguía viendo los límites
 * viejos hasta que borrara los datos del sitio. Desde la v6 (contracts 0.12.0) la URL de cada
 * capa y tesela lleva la huella del contenido: lo guardado con una huella nunca queda viejo, y lo
 * que hay que cuidar es borrar las huellas que dejaron de ser vigentes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type CapaInfo, rutaCapaConHuella, rutaTeselasConHuella } from 'contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGEN = 'http://localhost:3000';

function clave(pedido: Request | string): string {
  return typeof pedido === 'string' ? new URL(pedido, ORIGEN).toString() : pedido.url;
}

class CacheFalsa {
  readonly mapa = new Map<string, Response>();
  /**
   * La red que usa `addAll`. La Cache API de verdad PIDE cada URL antes de guardarla, y eso
   * importa desde que el `install` lee el HTML del shell para encontrar su hoja de estilos: con
   * un cuerpo inventado no habría nada que leer. Cuando no hay red (o falla) se cae en el cuerpo
   * de relleno, que es lo que esperan los tests más viejos.
   */
  constructor(private red?: typeof fetch) {}
  async match(pedido: Request | string): Promise<Response | undefined> {
    return this.mapa.get(clave(pedido))?.clone();
  }
  async put(pedido: Request | string, res: Response): Promise<void> {
    // Igual que la Cache API del navegador: volver a guardar la misma clave NO la mueve al final.
    this.mapa.set(clave(pedido), res);
  }
  /** La Cache API devuelve las peticiones en orden de inserción; el recorte depende de eso. */
  async keys(): Promise<Request[]> {
    return [...this.mapa.keys()].map((u) => new Request(u));
  }
  async delete(pedido: Request | string): Promise<boolean> {
    return this.mapa.delete(clave(pedido));
  }
  async addAll(urls: string[]): Promise<void> {
    for (const u of urls) {
      let res: Response | null = null;
      try {
        res = this.red ? await this.red(new Request(clave(u))) : null;
      } catch {
        res = null;
      }
      this.mapa.set(clave(u), res ?? new Response(`shell ${u}`));
    }
  }
}

/**
 * El navegador es el único que puede crear una petición con `mode: 'navigate'`; el constructor
 * `Request` lo rechaza. Por eso el manejador recibe lo mínimo que mira: url, método y modo.
 */
interface Peticion {
  url: string;
  method: string;
  mode?: string;
  headers?: Headers;
}

interface Evento {
  request: Peticion;
  respondWith(p: Promise<Response>): void;
  waitUntil(p: Promise<unknown>): void;
}
type Oyente = (e: Evento) => void;

function navegar(url: string): Peticion {
  return { url, method: 'GET', mode: 'navigate' };
}

function cargarSw(red: typeof fetch) {
  const almacen = new Map<string, CacheFalsa>();
  const oyentes = new Map<string, Oyente>();
  const yo = {
    addEventListener: (tipo: string, f: Oyente) => oyentes.set(tipo, f),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: { origin: ORIGEN },
  };
  const cachesFalso = {
    open: async (n: string) => {
      if (!almacen.has(n)) almacen.set(n, new CacheFalsa(red));
      return almacen.get(n) as CacheFalsa;
    },
    keys: async () => [...almacen.keys()],
    delete: async (n: string) => almacen.delete(n),
  };
  const codigo = readFileSync(resolve(import.meta.dirname, '../../public/sw.js'), 'utf8');
  // `new Function` con los globales del service worker como parámetros: es la única forma de
  // ejecutar ese archivo fuera de un navegador sin duplicar su lógica en el test.
  const ejecutar = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    'Headers',
    'Request',
    'URL',
    codigo,
  );
  ejecutar(yo, cachesFalso, red, Response, Headers, Request, URL);
  return { oyentes, almacen, cachesFalso };
}

/**
 * Dispara un manejador y devuelve lo que pasó a `respondWith`, o `null` si no interceptó. Espera
 * también lo que el service worker dejó pendiente con `waitUntil` (el borrado de huellas viejas).
 */
async function disparar(oyente: Oyente, pedido: Peticion): Promise<Response | null> {
  let devuelta: Promise<Response> | null = null;
  const pendientes: Promise<unknown>[] = [];
  oyente({
    request: pedido,
    respondWith: (p) => {
      devuelta = p;
    },
    waitUntil: (p) => pendientes.push(p),
  });
  const res = devuelta === null ? null : await (devuelta as Promise<Response>);
  await Promise.all(pendientes);
  return res;
}

/** Corre un manejador de ciclo de vida (`install`, `activate`) hasta el final. */
async function ciclo(oyente: Oyente | undefined): Promise<void> {
  if (!oyente) throw new Error('sin manejador');
  const pendientes: Promise<unknown>[] = [];
  oyente({
    request: { url: ORIGEN, method: 'GET' },
    respondWith: () => {},
    waitUntil: (p) => pendientes.push(p),
  });
  await Promise.all(pendientes);
}

/** Deben coincidir con los de public/sw.js; si cambian ahí, estos tests lo dicen. */
const CACHE_SHELL = 'curichi-shell-v6';
const CACHE_CAPAS = 'curichi-capas-v6';
const MAX_CAPAS = 400;

const VIEJA = '0123456789abcdef';
const NUEVA = 'fedcba9876543210';
const DISTRITOS = 'aaaaaaaaaaaaaaaa';

const capaGeojson = (h: string) => `${ORIGEN}${rutaCapaConHuella('distrito_municipal', h)}`;
const tesela = (h: string, x = 1) => `${ORIGEN}/geo/v1/teselas/unidad_vecinal/${h}/13/${x}/2.mvt`;
const LISTA = `${ORIGEN}/geo/v1/capas`;

/** La lista de `/geo/v1/capas` con la huella vigente de cada capa. */
function listaVigente(uv: string): CapaInfo[] {
  const base = { version: 'DM_UV_MZ_2025', n_features: 10, bytes_web: 1000, bbox: null };
  return [
    {
      ...base,
      capa: 'distrito_municipal',
      modo: 'geojson',
      url: rutaCapaConHuella('distrito_municipal', DISTRITOS),
    },
    {
      ...base,
      capa: 'unidad_vecinal',
      modo: 'teselas',
      url: rutaTeselasConHuella('unidad_vecinal', uv),
    },
  ];
}

/** Red falsa: la lista dice que la UV vigente es `uv`; las huellas viejas dan 410. */
function redDeGeo(uv: string) {
  return vi.fn(async (pedido: Request | string) => {
    const url = clave(pedido);
    if (url === LISTA)
      return Response.json(listaVigente(uv), { headers: { 'cache-control': 'public, no-cache' } });
    if (url.includes('/geo/v1/teselas/unidad_vecinal/') && !url.includes(`/${uv}/`))
      return Response.json(
        { codigo: 'CAPA_CAMBIO', mensaje: 'La capa cambió.' },
        { status: 410, headers: { 'cache-control': 'no-store' } },
      );
    return new Response(`cuerpo de ${url}`, {
      status: 200,
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    });
  });
}

const pedidos = (red: ReturnType<typeof vi.fn>, url: string) =>
  red.mock.calls.filter(([p]) => clave(p as Request | string) === url).length;

describe('service worker de la app pública', () => {
  let red: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    red = vi.fn();
  });

  it('no toca la API: un reporte viejo es peor que ninguno', async () => {
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const r = await disparar(
      oyentes.get('fetch') as Oyente,
      new Request(`${ORIGEN}/api/v1/reportes`),
    );
    expect(r, 'la petición debe pasar de largo, sin respondWith').toBeNull();
    expect(red).not.toHaveBeenCalled();
  });

  it('la navegación va a la red primero, para no servir el HTML de un despliegue viejo', async () => {
    red.mockResolvedValue(new Response('<html>nuevo</html>', { status: 200 }));
    const { oyentes, cachesFalso } = cargarSw(red as unknown as typeof fetch);
    await (await cachesFalso.open(CACHE_SHELL)).addAll(['/']);

    const r = await disparar(oyentes.get('fetch') as Oyente, navegar(`${ORIGEN}/reportar`));
    expect(await (r as Response).text()).toBe('<html>nuevo</html>');
  });

  it('sin red, la navegación cae en el shell guardado', async () => {
    red.mockRejectedValue(new Error('sin red'));
    const { oyentes, cachesFalso } = cargarSw(red as unknown as typeof fetch);
    await (await cachesFalso.open(CACHE_SHELL)).addAll(['/']);

    const r = await disparar(oyentes.get('fetch') as Oyente, navegar(`${ORIGEN}/reportar`));
    expect(await (r as Response).text()).toBe('shell /');
  });
});

describe('service worker · capas y teselas con huella (v6)', () => {
  it('una capa con huella se pide una vez y después sale siempre de la caché, sin revalidar', async () => {
    const red = redDeGeo(NUEVA);
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;

    const primera = await disparar(manejador, new Request(capaGeojson(DISTRITOS)));
    expect(await primera?.text()).toBe(`cuerpo de ${capaGeojson(DISTRITOS)}`);
    expect((almacen.get(CACHE_CAPAS) as CacheFalsa).mapa.has(capaGeojson(DISTRITOS))).toBe(true);

    // Un año después sigue siendo el mismo contenido: la huella lo garantiza.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 200 * 24 * 3600_000);
    try {
      for (let i = 0; i < 3; i++) {
        const otra = await disparar(manejador, new Request(capaGeojson(DISTRITOS)));
        expect(await otra?.text()).toBe(`cuerpo de ${capaGeojson(DISTRITOS)}`);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(red).toHaveBeenCalledTimes(1);
  });

  it('una tesela con huella vacía (204) se guarda y se sirve como 204', async () => {
    const red = vi.fn(async () => new Response(null, { status: 204 }));
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    expect((await disparar(manejador, new Request(tesela(NUEVA))))?.status).toBe(204);
    expect((await disparar(manejador, new Request(tesela(NUEVA))))?.status).toBe(204);
    expect(red).toHaveBeenCalledTimes(1);
  });

  it('un 410 CAPA_CAMBIO no se guarda, llega a la página y se borran las huellas viejas', async () => {
    const red = redDeGeo(NUEVA);
    const { oyentes, cachesFalso } = cargarSw(red as unknown as typeof fetch);
    const capas = await cachesFalso.open(CACHE_CAPAS);
    // Lo que quedó de antes de que el administrador activara la capa nueva.
    await capas.put(tesela(VIEJA, 1), new Response('uv vieja'));
    await capas.put(capaGeojson(DISTRITOS), new Response('distritos vigentes'));

    const r = await disparar(oyentes.get('fetch') as Oyente, new Request(tesela(VIEJA, 2)));
    // La página necesita ver el 410 para volver a pedir /geo/v1/capas y cambiar la fuente.
    expect(r?.status).toBe(410);
    expect(capas.mapa.has(tesela(VIEJA, 2)), 'un 410 no se guarda').toBe(false);
    expect(pedidos(red, LISTA), 'vuelve a pedir la lista de capas vigentes').toBe(1);
    expect(capas.mapa.has(tesela(VIEJA, 1)), 'la huella vieja se borra').toBe(false);
    expect(capas.mapa.has(capaGeojson(DISTRITOS)), 'la vigente se conserva').toBe(true);
  });

  it('una ráfaga de 410 pide la lista de capas una sola vez', async () => {
    const red = redDeGeo(NUEVA);
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    const respuestas = await Promise.all(
      Array.from({ length: 12 }, (_, x) => disparar(manejador, new Request(tesela(VIEJA, x)))),
    );
    expect(respuestas.every((r) => r?.status === 410)).toBe(true);
    expect(pedidos(red, LISTA)).toBe(1);
  });

  it('cuando la página pide la lista de capas, se borran las huellas que ya no figuran', async () => {
    const red = redDeGeo(NUEVA);
    const { oyentes, cachesFalso } = cargarSw(red as unknown as typeof fetch);
    const capas = await cachesFalso.open(CACHE_CAPAS);
    await capas.put(tesela(VIEJA), new Response('uv vieja'));
    await capas.put(tesela(NUEVA), new Response('uv nueva'));

    const r = await disparar(oyentes.get('fetch') as Oyente, new Request(LISTA));
    expect(await r?.json(), 'la lista llega entera a la página').toEqual(listaVigente(NUEVA));
    expect(capas.mapa.has(tesela(VIEJA))).toBe(false);
    expect(capas.mapa.has(tesela(NUEVA))).toBe(true);
    expect(pedidos(red, LISTA), 'sin pedirla dos veces').toBe(1);
  });

  it('al activarse borra las cachés de versiones anteriores y las huellas que ya no son vigentes', async () => {
    const red = redDeGeo(NUEVA);
    const { oyentes, cachesFalso, almacen } = cargarSw(red as unknown as typeof fetch);
    await cachesFalso.open('curichi-shell-v5');
    await cachesFalso.open('curichi-capas-v5');
    await cachesFalso.open(CACHE_SHELL);
    const capas = await cachesFalso.open(CACHE_CAPAS);
    await capas.put(tesela(VIEJA), new Response('uv vieja'));
    await capas.put(tesela(NUEVA), new Response('uv nueva'));
    await capas.put(capaGeojson(DISTRITOS), new Response('distritos'));

    await ciclo(oyentes.get('activate'));
    expect([...almacen.keys()].sort()).toEqual([CACHE_CAPAS, CACHE_SHELL].sort());
    expect(capas.mapa.has(tesela(VIEJA))).toBe(false);
    expect(capas.mapa.has(tesela(NUEVA))).toBe(true);
    expect(capas.mapa.has(capaGeojson(DISTRITOS))).toBe(true);
  });

  it('al activarse sin red no borra ninguna huella: sin la lista no sabe cuál es vieja', async () => {
    const red = vi.fn(async () => {
      throw new Error('sin red');
    });
    const { oyentes, cachesFalso } = cargarSw(red as unknown as typeof fetch);
    const capas = await cachesFalso.open(CACHE_CAPAS);
    await capas.put(tesela(VIEJA), new Response('uv'));
    await ciclo(oyentes.get('activate'));
    expect(capas.mapa.has(tesela(VIEJA))).toBe(true);
  });

  it('las rutas sin huella (alias) van a la red cada vez y, sin red, devuelven la última copia', async () => {
    const alias = `${ORIGEN}/geo/v1/capas/unidad_vecinal`;
    const red = vi.fn(async () => new Response('capa por alias', { status: 200 }));
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    await disparar(manejador, new Request(alias));
    await disparar(manejador, new Request(alias));
    // `public, no-cache`: la revalidación la hace la caché HTTP del navegador, no el SW.
    expect(red).toHaveBeenCalledTimes(2);

    red.mockRejectedValue(new Error('sin red'));
    expect(await (await disparar(manejador, new Request(alias)))?.text()).toBe('capa por alias');
  });

  it('/geo/v1/capas/vigentes no es una capa: no entra en la caché de capas', async () => {
    const red = vi.fn(async () => Response.json({ unidad_vecinal: 'DM_UV_MZ_2025' }));
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    await disparar(manejador, new Request(`${ORIGEN}/geo/v1/capas/vigentes`));
    await disparar(manejador, new Request(`${ORIGEN}/geo/v1/capas/vigentes`));
    expect(red).toHaveBeenCalledTimes(2);
    expect(almacen.get(CACHE_CAPAS)?.mapa.size ?? 0).toBe(0);
  });
});

/**
 * Añadidos en la Fase 4. Los dos fallos que cubren no se veían mirando el código porque no eran
 * errores de lógica sino de crecimiento: la caché no tenía tope y los estáticos no se guardaban,
 * cosas que solo se notan tras meses de uso o al quedarse sin red.
 */
describe('service worker · crecimiento de la caché y modo sin red', () => {
  let red: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    red = vi.fn(async (pedido: Request | string) => {
      const url = clave(pedido);
      if (url.includes('/_next/static/'))
        return new Response('/* js con huella */', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        });
      return new Response('cuerpo', { status: 200, headers: { etag: '"x"' } });
    });
  });

  it('la caché de capas no crece sin fin: pasear por el mapa no llena la cuota del sitio', async () => {
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const fetchSw = oyentes.get('fetch');
    if (!fetchSw) throw new Error('sin manejador fetch');
    // Más teselas distintas que el tope: es literalmente lo que hace arrastrar el mapa un rato.
    const cuantas = MAX_CAPAS + 50;
    const url = (i: number) => `${ORIGEN}/geo/v1/teselas/unidad_vecinal/${NUEVA}/15/${i}/1.mvt`;
    for (let i = 0; i < cuantas; i++) await disparar(fetchSw, { url: url(i), method: 'GET' });

    const cache = almacen.get(CACHE_CAPAS) as CacheFalsa;
    expect(cache.mapa.size).toBeLessThanOrEqual(MAX_CAPAS);
    // Y lo que se conserva son las últimas, no unas cualesquiera.
    expect(cache.mapa.has(url(cuantas - 1))).toBe(true);
    expect(cache.mapa.has(url(0))).toBe(false);
  });

  it('guarda los estáticos con huella: sin esto el shell sin red pide un JS que no tiene', async () => {
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const fetchSw = oyentes.get('fetch');
    if (!fetchSw) throw new Error('sin manejador fetch');
    const js = `${ORIGEN}/_next/static/chunks/main-abc123.js`;

    await disparar(fetchSw, { url: js, method: 'GET' });
    expect(red).toHaveBeenCalledTimes(1);
    expect((almacen.get(CACHE_SHELL) as CacheFalsa).mapa.has(js)).toBe(true);

    // Segunda visita: el nombre lleva el hash del contenido, así que no hay nada que revalidar.
    const otra = await disparar(fetchSw, { url: js, method: 'GET' });
    expect(red).toHaveBeenCalledTimes(1);
    expect(await otra?.text()).toContain('js con huella');
  });

  it('el worker de MapLibre y los glifos con ?v= también salen de la caché', async () => {
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const fetchSw = oyentes.get('fetch') as Oyente;
    const conVersion = [
      `${ORIGEN}/maplibre/maplibre-gl-worker.mjs?v=6.9.0`,
      `${ORIGEN}/maplibre/maplibre-gl-shared.mjs?v=6.9.0`,
      `${ORIGEN}/glifos/NotoSans-Bold/0-255.pbf?v=81cda3120b68`,
    ];
    for (const url of conVersion) await disparar(fetchSw, { url, method: 'GET' });
    for (const url of conVersion) await disparar(fetchSw, { url, method: 'GET' });
    expect(red).toHaveBeenCalledTimes(conVersion.length);

    // Sin ?v= no hay garantía de que no cambió: va a la red.
    await disparar(fetchSw, { url: `${ORIGEN}/glifos/NotoSans-Bold/0-255.pbf`, method: 'GET' });
    await disparar(fetchSw, { url: `${ORIGEN}/glifos/NotoSans-Bold/0-255.pbf`, method: 'GET' });
    expect(red).toHaveBeenCalledTimes(conVersion.length + 2);
  });

  it('sin red, un estático ya visto se sirve de la caché', async () => {
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const fetchSw = oyentes.get('fetch');
    if (!fetchSw) throw new Error('sin manejador fetch');
    const icono = `${ORIGEN}/icono-grande.svg`;

    await disparar(fetchSw, { url: icono, method: 'GET' });
    red.mockRejectedValue(new Error('sin red'));
    const sinRed = await disparar(fetchSw, { url: icono, method: 'GET' });
    expect(sinRed?.status).toBe(200);
  });

  /**
   * Comprobado en un navegador de verdad (Fase 5): con `next start` y el servidor apagado
   * después, el modo sin red devolvía el shell correcto pero **sin estilos**, en Times New
   * Roman. La hoja de estilo bloquea el render, el navegador la pide en el preescaneo y, al
   * venir marcada `immutable`, esa petición no siempre vuelve a pasar por el service worker: no
   * se guardaba nunca. El nombre lleva el hash del contenido, así que no puede estar en `SHELL`;
   * hay que sacarlo del HTML del propio shell.
   */
  it('al instalarse guarda la hoja de estilos del shell, no solo su HTML', async () => {
    const html =
      '<html><head><link rel="stylesheet" href="/_next/static/chunks/abc123.css"/></head><body></body></html>';
    const redConHtml = vi.fn(async () => new Response(html, { status: 200 }));
    const { oyentes, almacen } = cargarSw(redConHtml as unknown as typeof fetch);
    await ciclo(oyentes.get('install'));
    const cache = almacen.get(CACHE_SHELL) as CacheFalsa;
    expect(cache.mapa.has(`${ORIGEN}/`)).toBe(true);
    expect(
      cache.mapa.has(`${ORIGEN}/_next/static/chunks/abc123.css`),
      'sin la hoja de estilos, el shell sin red se ve en Times New Roman',
    ).toBe(true);
  });

  it('activate borra las cachés de versiones anteriores y conserva las vigentes', async () => {
    const { oyentes, cachesFalso, almacen } = cargarSw(red as unknown as typeof fetch);
    await cachesFalso.open('curichi-v2');
    await cachesFalso.open(CACHE_SHELL);
    await cachesFalso.open(CACHE_CAPAS);
    await ciclo(oyentes.get('activate'));
    expect(almacen.has('curichi-v2')).toBe(false);
    expect(almacen.has(CACHE_SHELL)).toBe(true);
    expect(almacen.has(CACHE_CAPAS)).toBe(true);
  });
});
