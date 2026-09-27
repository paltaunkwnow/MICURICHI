import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import proxy, { config } from './proxy';

const PANEL = 'https://panel.ciudad.example';

function peticion(ruta: string, cabeceras: Record<string, string> = {}) {
  return new NextRequest(new URL(ruta, PANEL), { headers: cabeceras });
}

/** Cabeceras con las que Next reenvía la petición (las que el proxy reescribió). */
function reescritas(res: Response): string[] | null {
  return res.headers.get('x-middleware-override-headers')?.split(',') ?? null;
}

afterEach(() => {
  vi.unstubAllEnvs();
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

const cspDe = (res: Response) => res.headers.get('content-security-policy');
/** La CSP con la que Next renderiza la página: de ahí saca el nonce de sus <script>. */
const cspQueVeNext = (res: Response) =>
  res.headers.get('x-middleware-request-content-security-policy');

describe('CSP con nonce por petición', () => {
  it('script-src con nonce y strict-dynamic, sin unsafe-inline ni unsafe-eval en producción', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const ruta of ['/', '/reportes', '/reportes/abc', '/ejecutivo', '/login']) {
      const script = directivas(cspDe(proxy(peticion(ruta)))).get('script-src') ?? [];
      expect(script).toContain("'strict-dynamic'");
      expect(script.filter((f) => /^'nonce-.+'$/.test(f))).toHaveLength(1);
      expect(script).not.toContain("'unsafe-inline'");
      expect(script).not.toContain("'unsafe-eval'");
    }
  });

  it('el nonce es distinto en cada petición y tiene al menos 128 bits', () => {
    const nonces = Array.from({ length: 20 }, () => {
      const nonce = getScriptNonceFromHeader(cspDe(proxy(peticion('/reportes'))) ?? '');
      expect(nonce).toBeTruthy();
      // Base64 de 16 bytes: 24 caracteres con el relleno.
      expect(Buffer.from(nonce ?? '', 'base64').length).toBeGreaterThanOrEqual(16);
      return nonce;
    });
    expect(new Set(nonces).size).toBe(nonces.length);
  });

  it('Next renderiza con la misma CSP que recibe el navegador, así sus <script> llevan ese nonce', () => {
    const res = proxy(peticion('/ejecutivo'));
    expect(reescritas(res)).toContain('content-security-policy');
    expect(cspQueVeNext(res)).toBe(cspDe(res));
    expect(getScriptNonceFromHeader(cspQueVeNext(res) ?? '')).toBeTruthy();
  });

  it('deja el mismo nonce en x-nonce, para un componente de servidor que lo necesite', () => {
    const res = proxy(peticion('/ejecutivo'));
    expect(reescritas(res)).toContain('x-nonce');
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(
      getScriptNonceFromHeader(cspDe(res) ?? ''),
    );
  });

  it('no se queda con la CSP ni el nonce que mande el cliente', () => {
    const elegido = 'QUVJT1VBRUlPVUFFSU9VQQ==';
    const res = proxy(
      peticion('/reportes', {
        'content-security-policy': `script-src 'nonce-${elegido}'`,
        'x-nonce': elegido,
      }),
    );
    const nonce = getScriptNonceFromHeader(cspQueVeNext(res) ?? '');
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe(elegido);
    expect(cspQueVeNext(res)).toBe(cspDe(res));
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it("en desarrollo suma solo 'unsafe-eval' (React lo usa para las pilas de error)", () => {
    vi.stubEnv('NODE_ENV', 'development');
    const csp = directivas(cspDe(proxy(peticion('/reportes'))));
    const script = csp.get('script-src') ?? [];
    expect(script).toContain("'unsafe-eval'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
  });

  it('conserva el resto de la política: mapa, worker, estilos y sin comodines', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const csp = directivas(cspDe(proxy(peticion('/reportes'))));
    // El único origen externo son las teselas de OpenStreetMap.
    const origenes = [...csp.values()].flat().filter((v) => /^(https?:|wss?:)/.test(v));
    expect(new Set(origenes)).toEqual(new Set(['https://tile.openstreetmap.org']));
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org']),
    );
    expect(csp.get('connect-src')).toEqual(["'self'", 'https://tile.openstreetmap.org']);
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:']);
    // Con un nonce en style-src el navegador ignoraría 'unsafe-inline', y los atributos style de
    // React y de MapLibre quedarían bloqueados: los nonces no cubren atributos.
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
    for (const fuentes of csp.values()) expect(fuentes.join(' ')).not.toMatch(/\*/);
  });

  it('lo reenviado no lleva el nonce a los servicios y responde con una política cerrada', () => {
    vi.stubEnv('PROXY_DE_CONFIANZA', '0');
    const api = proxy(peticion('/api/v1/auth/yo', { cookie: 'curichi_sesion=abc' }));
    expect(reescritas(api)).not.toContain('content-security-policy');
    expect(reescritas(api)).not.toContain('x-nonce');
    expect(cspDe(api)).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );

    vi.stubEnv('PROXY_DE_CONFIANZA', '1');
    const geo = proxy(peticion('/geo/v1/capas'));
    expect(reescritas(geo)).toBeNull();
    expect(getScriptNonceFromHeader(cspDe(geo) ?? '')).toBeUndefined();
  });
});

describe('reenvío a los servicios en tiempo de ejecución', () => {
  it('/api va a API_CORE_URL y /geo a GEO_SERVICE_URL, leídas en cada petición', () => {
    vi.stubEnv('API_CORE_URL', 'http://api-core:3001');
    vi.stubEnv('GEO_SERVICE_URL', 'http://geo-service:3002');
    const api = proxy(peticion('/api/v1/exportar?formato=csv'));
    expect(isRewrite(api)).toBe(true);
    expect(getRewrittenUrl(api)).toBe('http://api-core:3001/api/v1/exportar?formato=csv');
    expect(getRewrittenUrl(proxy(peticion('/geo/v1/capas')))).toBe(
      'http://geo-service:3002/geo/v1/capas',
    );

    // Otra instalación con la misma imagen: cambia la variable, no el código compilado.
    vi.stubEnv('API_CORE_URL', 'http://otra-api:4001');
    expect(getRewrittenUrl(proxy(peticion('/api/v1/auth/yo')))).toBe(
      'http://otra-api:4001/api/v1/auth/yo',
    );
  });

  it('las páginas del panel no se reenvían', () => {
    expect(isRewrite(proxy(peticion('/reportes')))).toBe(false);
  });

  it('borra la IP que declare el cliente y conserva la cookie de sesión', () => {
    vi.stubEnv('PROXY_DE_CONFIANZA', '0');
    const res = proxy(
      peticion('/api/v1/auth/login', {
        'x-forwarded-for': '203.0.113.9',
        'x-real-ip': '203.0.113.9',
        forwarded: 'for=203.0.113.9',
        'x-client-ip': '203.0.113.9',
        cookie: 'curichi_sesion=abc',
      }),
    );
    const lista = reescritas(res);
    expect(lista).not.toBeNull();
    for (const c of ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-client-ip']) {
      expect(lista).not.toContain(c);
    }
    expect(lista).toContain('cookie');
    expect(res.headers.get('x-middleware-request-cookie')).toBe('curichi_sesion=abc');
  });

  it('con un proxy de confianza delante deja pasar X-Forwarded-For (leído en cada petición)', () => {
    vi.stubEnv('PROXY_DE_CONFIANZA', '1');
    const res = proxy(peticion('/api/v1/reportes', { 'x-forwarded-for': '198.51.100.7' }));
    expect(isRewrite(res)).toBe(true);
    // Sin reescritura de cabeceras: Next reenvía las que trajo la petición.
    expect(reescritas(res)).toBeNull();
  });
});

describe('HSTS en tiempo de ejecución', () => {
  it('con HSTS=1 la anuncian las páginas y las rutas reenviadas', () => {
    vi.stubEnv('HSTS', '1');
    for (const ruta of ['/reportes', '/login', '/api/v1/auth/yo']) {
      expect(proxy(peticion(ruta)).headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains',
      );
    }
  });

  it('sin HSTS=1 no se anuncia: sobre http dejaría al navegador sin poder volver', () => {
    vi.stubEnv('HSTS', '0');
    expect(proxy(peticion('/reportes')).headers.has('strict-transport-security')).toBe(false);
    vi.stubEnv('HSTS', '');
    expect(proxy(peticion('/api/v1/auth/yo')).headers.has('strict-transport-security')).toBe(false);
  });

  it('corre en páginas y servicios, no en los archivos estáticos de Next', () => {
    const corre = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    expect(corre('/')).toBe(true);
    expect(corre('/reportes/abc')).toBe(true);
    expect(corre('/api/v1/exportar')).toBe(true);
    expect(corre('/geo/v1/teselas/distrito_municipal/12/1/2.pbf')).toBe(true);
    expect(corre('/_next/static/chunks/main.js')).toBe(false);
    expect(corre('/_next/image')).toBe(false);
  });
});
