/**
 * El service worker (`public/sw.js`) no se puede importar: corre en un ámbito propio con `self`,
 * `caches` y `fetch` globales. Aquí se carga su código en una función con esos nombres inyectados
 * y se conduce el manejador `fetch` a mano.
 *
 * Lo que se prueba es la decisión, que es donde estaba el fallo: una capa guardada se servía para
 * siempre, así que al activar una versión nueva de capa el vecino seguía viendo los límites
 * viejos hasta que borrara los datos del sitio.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/** Dispara un manejador y devuelve lo que pasó a `respondWith`, o `null` si no interceptó. */
async function disparar(oyente: Oyente, pedido: Peticion): Promise<Response | null> {
  let devuelta: Promise<Response> | null = null;
  oyente({
    request: pedido,
    respondWith: (p) => {
      devuelta = p;
    },
    waitUntil: () => {},
  });
  return devuelta === null ? null : await (devuelta as Promise<Response>);
}

/** Envejece la copia guardada como si hubieran pasado los 5 minutos de `max-age`. */
async function caducar(cache: CacheFalsa, url: string): Promise<void> {
  const guardada = cache.mapa.get(url) as Response;
  const cabeceras = new Headers(guardada.headers);
  cabeceras.set('x-curichi-guardado-en', String(Date.now() - 600_000));
  cache.mapa.set(url, new Response(await guardada.clone().blob(), { headers: cabeceras }));
}

const CAPA = `${ORIGEN}/geo/v1/capas/unidades-vecinales`;
/** Deben coincidir con los de public/sw.js; si cambian ahí, estos tests lo dicen. */
const CACHE_SHELL = 'curichi-shell-v5';
const CACHE_CAPAS = 'curichi-capas-v5';
const MAX_CAPAS = 400;

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

  it('sirve una capa guardada y todavía fresca sin pedir nada a la red', async () => {
    red.mockResolvedValue(new Response('de la red', { status: 200 }));
    const { oyentes } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;

    const primera = await disparar(manejador, new Request(CAPA));
    expect(await (primera as Response).text()).toBe('de la red');
    expect(red).toHaveBeenCalledTimes(1);

    const segunda = await disparar(manejador, new Request(CAPA));
    expect(await (segunda as Response).text()).toBe('de la red');
    expect(red, 'la segunda debe salir de la caché').toHaveBeenCalledTimes(1);
  });

  it('revalida con If-None-Match cuando la copia caducó y conserva el cuerpo si da 304', async () => {
    red.mockResolvedValueOnce(
      new Response('capa v1', { status: 200, headers: { etag: '"unidad_vecinal-2026-09"' } }),
    );
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    await disparar(manejador, new Request(CAPA));
    await caducar(almacen.get(CACHE_CAPAS) as CacheFalsa, CAPA);

    red.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const segunda = await disparar(manejador, new Request(CAPA));
    expect(red).toHaveBeenCalledTimes(2);
    const enviada = red.mock.calls[1]?.[0] as Request;
    expect(enviada.headers.get('If-None-Match')).toBe('"unidad_vecinal-2026-09"');
    expect(await (segunda as Response).text(), 'el 304 no trae cuerpo: se reusa el guardado').toBe(
      'capa v1',
    );
  });

  it('cambia de versión de capa cuando el servicio devuelve un ETag nuevo', async () => {
    red.mockResolvedValueOnce(
      new Response('capa v1', { status: 200, headers: { etag: '"unidad_vecinal-2026-09"' } }),
    );
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    await disparar(manejador, new Request(CAPA));
    const cache = almacen.get(CACHE_CAPAS) as CacheFalsa;
    await caducar(cache, CAPA);

    red.mockResolvedValueOnce(
      new Response('capa v2', { status: 200, headers: { etag: '"unidad_vecinal-2027-01"' } }),
    );
    const segunda = await disparar(manejador, new Request(CAPA));
    expect(await (segunda as Response).text()).toBe('capa v2');
    expect(await (cache.mapa.get(CAPA) as Response).clone().text()).toBe('capa v2');
  });

  it('sin red devuelve la capa vieja: dibujar algo es mejor que una pantalla vacía', async () => {
    red.mockResolvedValueOnce(new Response('capa v1', { status: 200 }));
    const { oyentes, almacen } = cargarSw(red as unknown as typeof fetch);
    const manejador = oyentes.get('fetch') as Oyente;
    await disparar(manejador, new Request(CAPA));
    await caducar(almacen.get(CACHE_CAPAS) as CacheFalsa, CAPA);

    red.mockRejectedValueOnce(new Error('sin red'));
    const segunda = await disparar(manejador, new Request(CAPA));
    expect(await (segunda as Response).text()).toBe('capa v1');
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
    for (let i = 0; i < cuantas; i++)
      await disparar(fetchSw, {
        url: `${ORIGEN}/geo/v1/teselas/manzana/15/${i}/1.mvt`,
        method: 'GET',
      });

    const cache = almacen.get(CACHE_CAPAS) as CacheFalsa;
    expect(cache.mapa.size).toBeLessThanOrEqual(MAX_CAPAS);
    // Y lo que se conserva son las últimas, no unas cualesquiera.
    expect(cache.mapa.has(`${ORIGEN}/geo/v1/teselas/manzana/15/${cuantas - 1}/1.mvt`)).toBe(true);
    expect(cache.mapa.has(`${ORIGEN}/geo/v1/teselas/manzana/15/0/1.mvt`)).toBe(false);
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
    const instalar = oyentes.get('install');
    if (!instalar) throw new Error('sin manejador install');
    const pendientes: Promise<unknown>[] = [];
    instalar({
      request: { url: ORIGEN, method: 'GET' },
      respondWith: () => {},
      waitUntil: (p) => pendientes.push(p),
    });
    await Promise.all(pendientes);
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
    const activar = oyentes.get('activate');
    if (!activar) throw new Error('sin manejador activate');
    const pendientes: Promise<unknown>[] = [];
    activar({
      request: { url: ORIGEN, method: 'GET' },
      respondWith: () => {},
      waitUntil: (p) => pendientes.push(p),
    });
    await Promise.all(pendientes);
    expect(almacen.has('curichi-v2')).toBe(false);
    expect(almacen.has(CACHE_SHELL)).toBe(true);
    expect(almacen.has(CACHE_CAPAS)).toBe(true);
  });
});
