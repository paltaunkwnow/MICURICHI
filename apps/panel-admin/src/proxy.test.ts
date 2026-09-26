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
