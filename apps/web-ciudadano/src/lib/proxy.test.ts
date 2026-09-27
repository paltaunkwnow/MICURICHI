import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';
import { getRewrittenUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import proxy, { config } from '../proxy';

/**
 * `next/server` espera el AsyncLocalStorage que Next instala al arrancar. Tiene que existir antes
 * de que se evalúen los módulos importados: por eso `vi.hoisted`, que corre antes que los imports.
 */
vi.hoisted(() => {
  const { AsyncLocalStorage } = process.getBuiltinModule('node:async_hooks');
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
});

/**
 * Lo que la misma imagen tiene que leer en cada despliegue. Antes `API_CORE_URL`,
 * `GEO_SERVICE_URL` y `HSTS` quedaban escritos en `routes-manifest.json` al compilar.
 */
const VARIABLES = ['API_CORE_URL', 'GEO_SERVICE_URL', 'PROXY_DE_CONFIANZA', 'HSTS'] as const;
let previas: Record<string, string | undefined> = {};

beforeEach(() => {
  previas = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  for (const v of VARIABLES) delete process.env[v];
});
afterEach(() => {
  for (const v of VARIABLES) {
    const valor = previas[v];
    if (valor === undefined) delete process.env[v];
    else process.env[v] = valor;
  }
  vi.unstubAllEnvs();
});

const pedido = (
  ruta: string,
  cabeceras: Record<string, string> = {},
  init: { method?: string; body?: BodyInit } = {},
) => new NextRequest(`http://localhost:3000${ruta}`, { ...init, headers: cabeceras });

/**
 * Cabeceras con las que Next hará la petición reenviada (`x-middleware-request-*`), o `null` si
 * el proxy no las tocó y pasan las del navegador tal cual.
 */
function cabecerasReenviadas(r: Response): Record<string, string> | null {
  const lista = r.headers.get('x-middleware-override-headers');
  if (lista === null) return null;
  return Object.fromEntries(
    lista
      .split(',')
      .filter(Boolean)
      .map((c) => [c, r.headers.get(`x-middleware-request-${c}`) ?? '']),
  );
}

describe('reenvío de /api y /geo en tiempo de ejecución', () => {
  it('lleva /api/* a API_CORE_URL, leída en cada petición, con la ruta y la consulta', () => {
    process.env.API_CORE_URL = 'http://api-core:3001';
    expect(getRewrittenUrl(proxy(pedido('/api/v1/reportes?bbox=1,2,3,4&limite=300')))).toBe(
      'http://api-core:3001/api/v1/reportes?bbox=1,2,3,4&limite=300',
    );

    // Otra instalación, misma imagen: basta con cambiar la variable (sin barra doble).
    process.env.API_CORE_URL = 'https://api.interno.ejemplo.bo/';
    expect(getRewrittenUrl(proxy(pedido('/api/v1/configuracion')))).toBe(
      'https://api.interno.ejemplo.bo/api/v1/configuracion',
    );
  });

  it('lleva /geo/* a GEO_SERVICE_URL', () => {
    process.env.GEO_SERVICE_URL = 'http://geo-service:3002';
    expect(getRewrittenUrl(proxy(pedido('/geo/v1/resolver', {}, { method: 'POST' })))).toBe(
      'http://geo-service:3002/geo/v1/resolver',
    );
  });

  it('sin variables usa los servicios locales de desarrollo', () => {
    expect(getRewrittenUrl(proxy(pedido('/api/v1/auth/yo')))).toBe(
      'http://127.0.0.1:3001/api/v1/auth/yo',
    );
    expect(getRewrittenUrl(proxy(pedido('/geo/v1/capas')))).toBe(
      'http://127.0.0.1:3002/geo/v1/capas',
    );
  });

  it('no lee el cuerpo: Next reenvía la subida de la foto entera', () => {
    const fd = new FormData();
    fd.append('archivo', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
    const req = pedido('/api/v1/fotos', {}, { method: 'POST', body: fd });
    const r = proxy(req);
    expect(getRewrittenUrl(r)).toBe('http://127.0.0.1:3001/api/v1/fotos');
    expect(req.bodyUsed).toBe(false);
  });

  it('las páginas de la app y las rutas que solo empiezan igual no se reenvían', () => {
    for (const ruta of ['/', '/reportar', '/apis', '/geografia', '/mis-reportes/abc'])
      expect(getRewrittenUrl(proxy(pedido(ruta))), ruta).toBeNull();
  });

  it('el matcher cubre las páginas y los servicios, no los estáticos del build', () => {
    // El worker de MapLibre y el service worker toman la CSP de su propia respuesta.
    const conCsp = ['/maplibre/maplibre-gl-worker.mjs?v=6.9.0', '/sw.js'];
    for (const url of ['/api/v1/reportes', '/geo/v1/capas', '/', '/reportar', ...conCsp])
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    for (const url of ['/_next/static/chunks/app.js', '/_next/image?url=%2Flogo.png&w=64'])
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
  });
});

describe('cabeceras de reenvío (X-Forwarded-For)', () => {
  const DEL_NAVEGADOR = {
    'x-forwarded-for': '203.0.113.9',
    'x-real-ip': '203.0.113.9',
    forwarded: 'for=203.0.113.9',
    'x-client-ip': '203.0.113.9',
    cookie: 'curichi_sesion=abc',
    'content-type': 'application/json',
  };

  it('borra las que el navegador usa para declararse otra IP y conserva el resto', () => {
    const reenviadas = cabecerasReenviadas(proxy(pedido('/api/v1/reportes', DEL_NAVEGADOR)));
    expect(reenviadas).toEqual({
      cookie: 'curichi_sesion=abc',
      'content-type': 'application/json',
    });
  });

  it('con PROXY_DE_CONFIANZA=1 las deja pasar tal cual', () => {
    process.env.PROXY_DE_CONFIANZA = '1';
    const r = proxy(pedido('/api/v1/reportes', DEL_NAVEGADOR));
    expect(getRewrittenUrl(r)).toBe('http://127.0.0.1:3001/api/v1/reportes');
    expect(cabecerasReenviadas(r)).toBeNull();
  });
});

describe('Strict-Transport-Security en tiempo de ejecución', () => {
  it('sin HSTS=1 no se anuncia', () => {
    expect(proxy(pedido('/')).headers.get('strict-transport-security')).toBeNull();
    expect(proxy(pedido('/api/v1/reportes')).headers.get('strict-transport-security')).toBeNull();
  });

  it('con HSTS=1 va en las páginas y en lo reenviado, sin volver a compilar', () => {
    process.env.HSTS = '1';
    for (const ruta of ['/', '/reportar', '/api/v1/reportes', '/geo/v1/capas'])
      expect(proxy(pedido(ruta)).headers.get('strict-transport-security'), ruta).toBe(
        'max-age=31536000; includeSubDomains',
      );
  });
});

/** Directivas de una CSP: nombre → fuentes. */
function directivas(csp: string | null): Map<string, string[]> {
  expect(csp).toBeTruthy();
  return new Map(
    (csp ?? '')
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((partes) => partes[0])
      .map(([nombre, ...fuentes]) => [nombre as string, fuentes]),
  );
}

const cspDe = (r: Response) => r.headers.get('content-security-policy');
/** La CSP con la que Next renderiza la página: de ahí saca el nonce de sus <script>. */
const cspQueVeNext = (r: Response) => r.headers.get('x-middleware-request-content-security-policy');
const reescritas = (r: Response) =>
  r.headers.get('x-middleware-override-headers')?.split(',') ?? null;

const PAGINAS = [
  '/',
  '/inicio',
  '/reportar',
  '/reporte/abc',
  '/mis-reportes',
  '/mis-reportes/abc',
  '/ingresar',
  '/crear-cuenta',
  '/cuenta',
  '/como-funciona',
];

describe('CSP con nonce por petición', () => {
  it("script-src con nonce y 'strict-dynamic', sin 'unsafe-inline' ni 'unsafe-eval' en producción", () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const ruta of PAGINAS) {
      const script = directivas(cspDe(proxy(pedido(ruta)))).get('script-src') ?? [];
      expect(script, ruta).toContain("'strict-dynamic'");
      expect(
        script.filter((f) => /^'nonce-.+'$/.test(f)),
        ruta,
      ).toHaveLength(1);
      expect(script, ruta).not.toContain("'unsafe-inline'");
      expect(script, ruta).not.toContain("'unsafe-eval'");
    }
  });

  it('el nonce cambia en cada petición y tiene al menos 128 bits', () => {
    const nonces = Array.from({ length: 20 }, () => {
      const nonce = getScriptNonceFromHeader(cspDe(proxy(pedido('/reportar'))) ?? '');
      expect(nonce).toBeTruthy();
      // Base64 de 16 bytes: 24 caracteres con el relleno.
      expect(Buffer.from(nonce ?? '', 'base64').length).toBeGreaterThanOrEqual(16);
      return nonce;
    });
    expect(new Set(nonces).size).toBe(nonces.length);
  });

  it('Next renderiza con la misma CSP que recibe el navegador, así sus <script> llevan ese nonce', () => {
    const r = proxy(pedido('/'));
    expect(reescritas(r)).toContain('content-security-policy');
    expect(cspQueVeNext(r)).toBe(cspDe(r));
    expect(getScriptNonceFromHeader(cspQueVeNext(r) ?? '')).toBeTruthy();
  });

  it('deja el mismo nonce en x-nonce, para un componente de servidor que lo necesite', () => {
    const r = proxy(pedido('/reportar'));
    expect(reescritas(r)).toContain('x-nonce');
    expect(r.headers.get('x-middleware-request-x-nonce')).toBe(
      getScriptNonceFromHeader(cspDe(r) ?? ''),
    );
  });

  it('no se queda con la CSP ni el nonce que mande el cliente', () => {
    const elegido = 'QUVJT1VBRUlPVUFFSU9VQQ==';
    const r = proxy(
      pedido('/reportar', {
        'content-security-policy': `script-src 'nonce-${elegido}'`,
        'x-nonce': elegido,
      }),
    );
    const nonce = getScriptNonceFromHeader(cspQueVeNext(r) ?? '');
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe(elegido);
    expect(cspQueVeNext(r)).toBe(cspDe(r));
    expect(r.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it("en desarrollo suma solo 'unsafe-eval' (React lo usa para las pilas de error)", () => {
    vi.stubEnv('NODE_ENV', 'development');
    const csp = directivas(cspDe(proxy(pedido('/'))));
    const script = csp.get('script-src') ?? [];
    expect(script).toContain("'unsafe-eval'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
  });

  it('conserva el resto de la política: mapa, cámara, worker, estilos, PWA y sin comodines', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const csp = directivas(cspDe(proxy(pedido('/reportar'))));
    // El único origen externo son las teselas de OpenStreetMap.
    const origenes = [...csp.values()].flat().filter((v) => /^(https?:|wss?:)/.test(v));
    expect(new Set(origenes)).toEqual(new Set(['https://tile.openstreetmap.org']));
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    // blob: es la miniatura de la foto recién sacada con la cámara (URL.createObjectURL).
    expect(csp.get('img-src')).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org']),
    );
    expect(csp.get('connect-src')).toEqual(["'self'", 'https://tile.openstreetmap.org']);
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:']);
    expect(csp.get('manifest-src')).toEqual(["'self'"]);
    // Con un nonce en style-src el navegador ignoraría 'unsafe-inline', y los atributos style de
    // React y de MapLibre quedarían bloqueados: los nonces no cubren atributos.
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
    for (const fuentes of csp.values()) expect(fuentes.join(' ')).not.toMatch(/\*/);
  });

  it('lo reenviado no lleva el nonce a los servicios y responde con una política cerrada', () => {
    const api = proxy(pedido('/api/v1/auth/yo', { cookie: 'curichi_sesion=abc' }));
    expect(reescritas(api)).not.toContain('content-security-policy');
    expect(reescritas(api)).not.toContain('x-nonce');
    expect(cspDe(api)).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );

    process.env.PROXY_DE_CONFIANZA = '1';
    const geo = proxy(pedido('/geo/v1/capas'));
    expect(reescritas(geo)).toBeNull();
    expect(getScriptNonceFromHeader(cspDe(geo) ?? '')).toBeUndefined();
    expect(cspDe(geo)).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  });
});
