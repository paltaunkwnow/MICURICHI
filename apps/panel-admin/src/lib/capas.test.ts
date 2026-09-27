import type { CapaInfo } from 'contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, obtenerDistritos } from './api';

const HUELLA_VIEJA = 'a'.repeat(16);
const HUELLA_NUEVA = 'b'.repeat(16);

function capaDistritos(huella: string, modo: CapaInfo['modo'] = 'geojson'): CapaInfo {
  return {
    capa: 'distrito_municipal',
    version: 'DM_UV_MZ_2025',
    n_features: 2,
    bytes_web: 1000,
    modo,
    url:
      modo === 'geojson'
        ? `/geo/v1/capas/distrito_municipal/v/${huella}`
        : `/geo/v1/teselas/distrito_municipal/${huella}/{z}/{x}/{y}.mvt`,
    bbox: [-63.3, -17.9, -63.0, -17.6],
  };
}

const UV: CapaInfo = {
  capa: 'unidad_vecinal',
  version: 'DM_UV_MZ_2025',
  n_features: 1,
  bytes_web: 500,
  modo: 'geojson',
  url: `/geo/v1/capas/unidad_vecinal/v/${HUELLA_NUEVA}`,
  bbox: null,
};

const DISTRITOS = {
  type: 'FeatureCollection',
  features: [
    { properties: { id: 'distrito_municipal:10', codigo: '10', nombre: 'Distrito 10' } },
    { properties: { id: 'distrito_municipal:2', codigo: '2', nombre: 'Distrito 2' } },
  ],
};

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** `fetch` falso que contesta por URL; guarda las URL pedidas en orden. */
function fetchPorUrl(rutas: Record<string, () => Response>) {
  const pedidas: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidas.push(url);
      const r = rutas[url];
      return r ? r() : json({ codigo: 'NO_ENCONTRADO', mensaje: 'no' }, 404);
    }),
  );
  return pedidas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('capas por CapaInfo.url (contracts 0.12.0)', () => {
  it('los distritos se piden por la url con huella que publica /geo/v1/capas', async () => {
    const pedidas = fetchPorUrl({
      '/geo/v1/capas': () => json([UV, capaDistritos(HUELLA_NUEVA)]),
      [`/geo/v1/capas/distrito_municipal/v/${HUELLA_NUEVA}`]: () => json(DISTRITOS),
    });
    const distritos = await obtenerDistritos();
    expect(distritos.map((d) => d.codigo)).toEqual(['2', '10']);
    expect(pedidas).toEqual([
      '/geo/v1/capas',
      `/geo/v1/capas/distrito_municipal/v/${HUELLA_NUEVA}`,
    ]);
    // La ruta sin huella (alias) ya no se arma a mano.
    expect(pedidas).not.toContain('/geo/v1/capas/distrito_municipal');
  });

  it('con la lista de capas ya pedida no la vuelve a pedir', async () => {
    const pedidas = fetchPorUrl({
      [`/geo/v1/capas/distrito_municipal/v/${HUELLA_NUEVA}`]: () => json(DISTRITOS),
    });
    await obtenerDistritos(undefined, [capaDistritos(HUELLA_NUEVA)]);
    expect(pedidas).toEqual([`/geo/v1/capas/distrito_municipal/v/${HUELLA_NUEVA}`]);
  });

  it('si la capa cambió (410 CAPA_CAMBIO), vuelve a pedir /geo/v1/capas una vez y usa la url nueva', async () => {
    const pedidas = fetchPorUrl({
      '/geo/v1/capas': () => json([capaDistritos(HUELLA_NUEVA)]),
      [`/geo/v1/capas/distrito_municipal/v/${HUELLA_VIEJA}`]: () =>
        json({ codigo: 'CAPA_CAMBIO', mensaje: 'La capa cambió' }, 410),
      [`/geo/v1/capas/distrito_municipal/v/${HUELLA_NUEVA}`]: () => json(DISTRITOS),
    });
    const distritos = await obtenerDistritos(undefined, [capaDistritos(HUELLA_VIEJA)]);
    expect(distritos).toHaveLength(2);
    expect(pedidas).toEqual([
      `/geo/v1/capas/distrito_municipal/v/${HUELLA_VIEJA}`,
      '/geo/v1/capas',
      `/geo/v1/capas/distrito_municipal/v/${HUELLA_NUEVA}`,
    ]);
  });

  it('un segundo 410 seguido no entra en bucle: se informa el error', async () => {
    const pedidas = fetchPorUrl({
      '/geo/v1/capas': () => json([capaDistritos(HUELLA_VIEJA)]),
      [`/geo/v1/capas/distrito_municipal/v/${HUELLA_VIEJA}`]: () =>
        json({ codigo: 'CAPA_CAMBIO', mensaje: 'La capa cambió' }, 410),
    });
    await expect(obtenerDistritos()).rejects.toMatchObject({ estado: 410 });
    expect(pedidas.filter((u) => u === '/geo/v1/capas')).toHaveLength(2);
  });

  it('sin capa de distritos vigente, o servida por teselas, lo dice con un error claro', async () => {
    fetchPorUrl({ '/geo/v1/capas': () => json([UV]) });
    const sinCapa = await obtenerDistritos().catch((e: unknown) => e);
    expect(sinCapa).toBeInstanceOf(ErrorApi);
    expect((sinCapa as ErrorApi).codigo).toBe('CAPA_NO_DISPONIBLE');

    fetchPorUrl({ '/geo/v1/capas': () => json([capaDistritos(HUELLA_NUEVA, 'teselas')]) });
    const teselas = await obtenerDistritos().catch((e: unknown) => e);
    expect(teselas).toBeInstanceOf(ErrorApi);
    expect((teselas as ErrorApi).codigo).toBe('USAR_TESELAS');
  });
});
