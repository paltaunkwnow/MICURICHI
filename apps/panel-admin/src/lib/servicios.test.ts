import { describe, expect, it } from 'vitest';
import { DESTINOS_POR_DEFECTO, destinoDelReenvio, urlDeApiCore } from './servicios';

const PANEL = 'https://panel.ciudad.example';

function destino(ruta: string, entorno: Parameters<typeof destinoDelReenvio>[1] = {}) {
  return destinoDelReenvio(new URL(ruta, PANEL), entorno)?.toString() ?? null;
}

describe('destino del reenvío de /api y /geo', () => {
  it('manda /api a api-core y /geo a geo-service, con la ruta y la consulta intactas', () => {
    const entorno = {
      API_CORE_URL: 'http://api-core:3001',
      GEO_SERVICE_URL: 'http://geo-service:3002',
    };
    expect(destino('/api/v1/exportar?formato=csv&estado=validado', entorno)).toBe(
      'http://api-core:3001/api/v1/exportar?formato=csv&estado=validado',
    );
    expect(destino('/geo/v1/capas/distrito_municipal', entorno)).toBe(
      'http://geo-service:3002/geo/v1/capas/distrito_municipal',
    );
  });

  it('usa el valor que tenga el entorno en cada llamada, no uno fijado al compilar', () => {
    expect(destino('/api/v1/auth/yo', { API_CORE_URL: 'http://api-a:3001' })).toBe(
      'http://api-a:3001/api/v1/auth/yo',
    );
    expect(destino('/api/v1/auth/yo', { API_CORE_URL: 'http://api-b:4001' })).toBe(
      'http://api-b:4001/api/v1/auth/yo',
    );
  });

  it('sin variable (o vacía) usa los puertos de desarrollo local', () => {
    expect(DESTINOS_POR_DEFECTO).toEqual({
      API_CORE_URL: 'http://127.0.0.1:3001',
      GEO_SERVICE_URL: 'http://127.0.0.1:3002',
    });
    expect(destino('/api/v1/auth/yo')).toBe('http://127.0.0.1:3001/api/v1/auth/yo');
    expect(destino('/geo/v1/capas', { GEO_SERVICE_URL: '' })).toBe(
      'http://127.0.0.1:3002/geo/v1/capas',
    );
  });

  it('respeta un prefijo en la URL del servicio y no duplica la barra final', () => {
    expect(destino('/api/v1/auth/yo', { API_CORE_URL: 'https://interno.example/curichi/' })).toBe(
      'https://interno.example/curichi/api/v1/auth/yo',
    );
  });

  it('las rutas de la propia app no se reenvían', () => {
    for (const ruta of ['/', '/reportes', '/apiario', '/geografia', '/login?siguiente=/api']) {
      expect(destino(ruta)).toBeNull();
    }
  });

  it('la base de api-core para el servidor del panel, sin barra final', () => {
    expect(urlDeApiCore({ API_CORE_URL: 'http://api-core:3001/' })).toBe('http://api-core:3001');
    expect(urlDeApiCore({ API_CORE_URL: 'https://interno.example/curichi/' })).toBe(
      'https://interno.example/curichi',
    );
    expect(urlDeApiCore({})).toBe('http://127.0.0.1:3001');
    expect(() => urlDeApiCore({ API_CORE_URL: 'api-core' })).toThrow(/API_CORE_URL/);
  });

  it('una URL de servicio mal escrita falla con un mensaje que nombra la variable', () => {
    expect(() => destino('/api/v1/auth/yo', { API_CORE_URL: 'api-core:3001' })).toThrow(
      /API_CORE_URL/,
    );
    expect(() => destino('/geo/v1/capas', { GEO_SERVICE_URL: 'ftp://geo:21' })).toThrow(
      /GEO_SERVICE_URL/,
    );
    // Credenciales en la URL: el reenvío las mandaría en cada petición a un servicio interno.
    expect(() => destino('/api/v1/auth/yo', { API_CORE_URL: 'http://u:p@api-core:3001' })).toThrow(
      /API_CORE_URL/,
    );
  });
});
