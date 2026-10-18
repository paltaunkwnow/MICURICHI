import type { AgregadoUv, CapaInfo } from 'contracts';
import type { Map as MapaGl } from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anotarUrlDeFuente } from '@/lib/capas-con-huella';
import { aplicarCapas, reiniciarConteos } from './Mapa';

vi.mock('maplibre-gl', () => ({ getVersion: () => '6.9.0' }));
const capa = {
  capa: 'unidad_vecinal',
  modo: 'geojson',
  url: '/geo/v1/capas/unidad_vecinal/v/0123456789abcdef',
  bytes_web: 100,
} as CapaInfo;
const agregado = (n: number) =>
  ({
    unidad_vecinal_id: 'uv:1',
    distrito_id: 'dm:1',
    n_reportes: n,
    n_verificados: n,
    severidad_max_verificada: 'media',
  }) as AgregadoUv;
const datos = () => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: null, properties: { id: 'uv:1', nombre: 'Barrio' } }],
});
afterEach(() => vi.unstubAllGlobals());

describe('integración de etiquetas con geometría municipal conservada', () => {
  it.each([true, false])('termina con conteos de B, agregados en caché: %s', async (enCache) => {
    const fuente = { type: 'geojson', setData: vi.fn() };
    anotarUrlDeFuente(fuente, capa.url);
    const mapa = {
      getSource: () => fuente,
      setFeatureState: vi.fn(),
      removeFeatureState: vi.fn(),
    } as unknown as MapaGl;
    let resolverVieja!: (v: Response) => void;
    const vieja = new Promise<Response>((r) => {
      resolverVieja = r;
    });
    const respuesta = () => ({ ok: true, json: async () => datos() }) as Response;
    const fetchFalso = vi.fn().mockResolvedValueOnce(respuesta());
    if (!enCache) fetchFalso.mockReturnValueOnce(vieja);
    fetchFalso.mockResolvedValue(respuesta());
    vi.stubGlobal('fetch', fetchFalso);
    aplicarCapas(mapa, [capa], [agregado(9)]);
    await vi.waitFor(() => expect(fuente.setData).toHaveBeenCalled());
    reiniciarConteos(mapa, [capa], !enCache);
    aplicarCapas(mapa, [capa], [agregado(2)]);
    await vi.waitFor(() =>
      expect(fuente.setData.mock.lastCall?.[0].features[0].properties.n).toBe(2),
    );
    if (!enCache) {
      resolverVieja(respuesta());
      await vieja;
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fuente.setData.mock.lastCall?.[0].features[0].properties.etiqueta).toContain('2');
    expect(fuente.setData.mock.lastCall?.[0].features[0].properties.n).toBe(2);
  });
});
