import { afterEach, describe, expect, it, vi } from 'vitest';
import { obtenerAgregados, obtenerReportes } from './api';

/** CA4: las lecturas públicas del mapa llevan `categoria` (regla 3 del plan M4). */

function fingirRespuesta(cuerpo: unknown) {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) } as Response);
  });
  return llamadas;
}

afterEach(() => vi.unstubAllGlobals());

describe('lecturas del mapa por categoría', () => {
  it('GET /api/v1/reportes manda la categoría junto con los demás filtros', async () => {
    const llamadas = fingirRespuesta({ features: [] });
    await obtenerReportes({ categoria: 'bache', limite: '300', severidad: undefined });
    const url = new URL(llamadas[0]?.url ?? '', 'http://x');
    expect(url.pathname).toBe('/api/v1/reportes');
    expect(url.searchParams.get('categoria')).toBe('bache');
    expect(url.searchParams.get('limite')).toBe('300');
    expect(url.searchParams.has('severidad')).toBe(false);
  });

  it('GET /geo/v1/agregados/unidades-vecinales manda la categoría, sin cookies', async () => {
    const llamadas = fingirRespuesta([]);
    await obtenerAgregados('area_verde');
    expect(llamadas[0]?.url).toBe('/geo/v1/agregados/unidades-vecinales?categoria=area_verde');
    expect(llamadas[0]?.init.credentials).toBe('omit');
  });

  it('cada categoría es otra petición: ninguna comparte la de la otra', async () => {
    const llamadas = fingirRespuesta([]);
    await obtenerAgregados('inundacion');
    await obtenerAgregados('bache');
    expect(llamadas.map((l) => l.url)).toEqual([
      '/geo/v1/agregados/unidades-vecinales?categoria=inundacion',
      '/geo/v1/agregados/unidades-vecinales?categoria=bache',
    ]);
  });
});
