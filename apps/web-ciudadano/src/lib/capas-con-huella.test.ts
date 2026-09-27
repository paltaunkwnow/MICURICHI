/**
 * Capas y teselas con la huella del contenido en la URL (contracts 0.12.0). geo-service las sirve
 * `immutable` por un año; cuando la capa cambia, la huella vieja responde `410 CAPA_CAMBIO` y el
 * mapa tiene que volver a pedir `/geo/v1/capas` y apuntar su fuente a la URL nueva.
 */
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  type CapaInfo,
  CODIGO_CAPA_CAMBIO,
  rutaCapaConHuella,
  rutaTeselasConHuella,
} from 'contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anotarUrlDeFuente,
  apuntarFuenteA,
  CLAVE_CAPAS,
  capaCambiadaEnError,
  huellaDeUrl,
  recargarCapas,
  urlDeFuente,
} from './capas-con-huella';

const VIEJA = '0123456789abcdef';
const NUEVA = 'fedcba9876543210';

function capa(c: CapaInfo['capa'], modo: CapaInfo['modo'], huella: string): CapaInfo {
  return {
    capa: c,
    version: 'DM_UV_MZ_2025',
    n_features: 10,
    bytes_web: 1000,
    modo,
    url: modo === 'geojson' ? rutaCapaConHuella(c, huella) : rutaTeselasConHuella(c, huella),
    bbox: null,
  };
}

/** Lo que MapLibre pone en `error` cuando una petición falla: su `AJAXError`. */
function errorAjax(status: number, url: string) {
  return Object.assign(new Error(`AJAXError: ${status}`), { status, url, statusText: '' });
}

describe('huella en la URL', () => {
  it('la saca de la capa GeoJSON y de las teselas, relativas o absolutas', () => {
    expect(huellaDeUrl(rutaCapaConHuella('unidad_vecinal', VIEJA))).toEqual({
      capa: 'unidad_vecinal',
      huella: VIEJA,
    });
    expect(huellaDeUrl(rutaTeselasConHuella('distrito_municipal', VIEJA))).toEqual({
      capa: 'distrito_municipal',
      huella: VIEJA,
    });
    expect(
      huellaDeUrl(`https://curichi.example/geo/v1/teselas/unidad_vecinal/${VIEJA}/13/2/3.mvt`),
    ).toEqual({ capa: 'unidad_vecinal', huella: VIEJA });
  });

  it('las rutas sin huella (alias) y las demás no tienen', () => {
    for (const url of [
      '/geo/v1/capas/unidad_vecinal',
      '/geo/v1/teselas/unidad_vecinal/13/2/3.mvt',
      '/geo/v1/capas',
      '/geo/v1/capas/vigentes',
      '/api/v1/reportes',
    ])
      expect(huellaDeUrl(url), url).toBeNull();
  });
});

describe('un 410 CAPA_CAMBIO recarga CapaInfo', () => {
  const vigentes = [
    capa('distrito_municipal', 'geojson', VIEJA),
    capa('unidad_vecinal', 'teselas', VIEJA),
  ];

  it('una tesela o una capa con la huella que el mapa cree vigente y 410: hay que recargar', () => {
    expect(CODIGO_CAPA_CAMBIO).toBe('CAPA_CAMBIO');
    expect(
      capaCambiadaEnError(
        errorAjax(410, `http://localhost:3000/geo/v1/teselas/unidad_vecinal/${VIEJA}/13/2/3.mvt`),
        vigentes,
      ),
    ).toBe(true);
    expect(
      capaCambiadaEnError(
        errorAjax(410, `http://localhost:3000/geo/v1/capas/distrito_municipal/v/${VIEJA}`),
        vigentes,
      ),
    ).toBe(true);
  });

  it('una vez que el mapa ya tiene la huella nueva, los 410 rezagados de la vieja no recargan otra vez', () => {
    const nuevas = [capa('unidad_vecinal', 'teselas', NUEVA)];
    expect(
      capaCambiadaEnError(
        errorAjax(410, `http://localhost:3000/geo/v1/teselas/unidad_vecinal/${VIEJA}/13/2/3.mvt`),
        nuevas,
      ),
    ).toBe(false);
  });

  it('otros errores no recargan: ni otro estado, ni otra ruta, ni un error sin estado', () => {
    const tesela = `http://localhost:3000/geo/v1/teselas/unidad_vecinal/${VIEJA}/13/2/3.mvt`;
    expect(capaCambiadaEnError(errorAjax(404, tesela), vigentes)).toBe(false);
    expect(capaCambiadaEnError(errorAjax(500, tesela), vigentes)).toBe(false);
    expect(
      capaCambiadaEnError(errorAjax(410, 'http://localhost:3000/api/v1/reportes'), vigentes),
    ).toBe(false);
    expect(capaCambiadaEnError(new Error('WebGL'), vigentes)).toBe(false);
    expect(capaCambiadaEnError(undefined, vigentes)).toBe(false);
  });

  it('recargar vuelve a pedir /geo/v1/capas una sola vez aunque fallen muchas teselas a la vez', async () => {
    const cliente = new QueryClient();
    const pedirCapas = vi.fn(async () => vigentes);
    const desmontar = new QueryObserver(cliente, {
      queryKey: CLAVE_CAPAS,
      queryFn: pedirCapas,
      staleTime: Number.POSITIVE_INFINITY,
    }).subscribe(() => {});
    await vi.waitFor(() => expect(cliente.getQueryState(CLAVE_CAPAS)?.fetchStatus).toBe('idle'));
    expect(pedirCapas).toHaveBeenCalledTimes(1);

    // Una pantalla de teselas viejas da una ráfaga de 410 en el mismo instante.
    await Promise.all(Array.from({ length: 16 }, () => recargarCapas(cliente)));
    expect(pedirCapas).toHaveBeenCalledTimes(2);
    desmontar();
    cliente.clear();
  });
});

describe('cambiar la fuente del mapa a la URL nueva', () => {
  const origen = 'http://localhost:3000';

  afterEach(() => vi.restoreAllMocks());

  it('una fuente GeoJSON pasa a la URL nueva con setData, una sola vez', () => {
    const fuente = { type: 'geojson', setData: vi.fn() };
    anotarUrlDeFuente(fuente, rutaCapaConHuella('distrito_municipal', VIEJA));
    const nueva = capa('distrito_municipal', 'geojson', NUEVA);
    expect(apuntarFuenteA(fuente, nueva, origen)).toBe('cambiada');
    expect(fuente.setData).toHaveBeenCalledWith(`${origen}${nueva.url}`);
    expect(urlDeFuente(fuente)).toBe(nueva.url);
    expect(apuntarFuenteA(fuente, nueva, origen)).toBe('igual');
    expect(fuente.setData).toHaveBeenCalledTimes(1);
  });

  it('una fuente de teselas pasa a la plantilla nueva con setTiles', () => {
    const fuente = { type: 'vector', setTiles: vi.fn() };
    anotarUrlDeFuente(fuente, rutaTeselasConHuella('unidad_vecinal', VIEJA));
    const nueva = capa('unidad_vecinal', 'teselas', NUEVA);
    expect(apuntarFuenteA(fuente, nueva, origen)).toBe('cambiada');
    expect(fuente.setTiles).toHaveBeenCalledWith([`${origen}${nueva.url}`]);
  });

  it('si la capa cambió de modo (GeoJSON ↔ teselas) hay que rehacer la fuente', () => {
    const fuente = { type: 'geojson', setData: vi.fn() };
    anotarUrlDeFuente(fuente, rutaCapaConHuella('unidad_vecinal', VIEJA));
    expect(apuntarFuenteA(fuente, capa('unidad_vecinal', 'teselas', NUEVA), origen)).toBe(
      'otro-modo',
    );
    expect(fuente.setData).not.toHaveBeenCalled();
  });
});
