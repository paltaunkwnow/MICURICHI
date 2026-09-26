import { describe, expect, it } from 'vitest';
import { destinoDelReenvio, urlDeApiCore, urlDeGeoService } from './servicios';

describe('dónde están los servicios (variables de tiempo de ejecución)', () => {
  it('usa la variable definida, sin barra final, y la de desarrollo si falta o está vacía', () => {
    expect(urlDeApiCore({ API_CORE_URL: 'https://api.interno/' })).toBe('https://api.interno');
    expect(urlDeApiCore({})).toBe('http://127.0.0.1:3001');
    // Vacía no puede volver relativo el reenvío (`/api/…` hacia sí mismo).
    expect(urlDeApiCore({ API_CORE_URL: '  ' })).toBe('http://127.0.0.1:3001');
    expect(urlDeGeoService({ GEO_SERVICE_URL: 'http://geo-service:3002' })).toBe(
      'http://geo-service:3002',
    );
  });

  it('una dirección sin http(s) falla diciendo qué variable está mal', () => {
    // Sin esquema, `new URL` lee `api-core:` como si fuera el protocolo: se reenviaría a la nada.
    expect(() => urlDeApiCore({ API_CORE_URL: 'api-core:3001' })).toThrow(/API_CORE_URL/);
    expect(() => urlDeGeoService({ GEO_SERVICE_URL: 'ftp://geo' })).toThrow(/GEO_SERVICE_URL/);
  });

  it('reenvía /api y /geo con la ruta y la consulta, y nada más', () => {
    const entorno = { API_CORE_URL: 'http://api:1', GEO_SERVICE_URL: 'http://geo:2' };
    expect(destinoDelReenvio({ pathname: '/api', search: '' }, entorno)?.href).toBe(
      'http://api:1/api',
    );
    expect(
      destinoDelReenvio({ pathname: '/geo/v1/capas/distritos', search: '?v=1' }, entorno)?.href,
    ).toBe('http://geo:2/geo/v1/capas/distritos?v=1');
    expect(destinoDelReenvio({ pathname: '/apis', search: '' }, entorno)).toBeNull();
    expect(destinoDelReenvio({ pathname: '/', search: '' }, entorno)).toBeNull();
  });
});
