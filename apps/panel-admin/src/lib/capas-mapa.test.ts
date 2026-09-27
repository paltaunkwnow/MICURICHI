/**
 * El mapa del panel ante el cambio de capa (contracts 0.12.0). geo-service sirve cada capa en una
 * URL con la huella de su contenido, `immutable` por un año; cuando un administrador activa otra
 * versión, la huella vieja responde `410 CAPA_CAMBIO`. El mapa tiene que volver a pedir
 * `/geo/v1/capas` y apuntar sus fuentes a la URL nueva, sin recargar la página.
 */
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  type CapaInfo,
  CODIGO_CAPA_CAMBIO,
  rutaCapaConHuella,
  rutaTeselasConHuella,
} from 'contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  anotarUrlDeFuente,
  aplicarCapas,
  apuntarFuenteA,
  detectorDeCapaCambiada,
  huellaDeUrl,
  type MapaConCapas,
  recargarCapasMapa,
  urlDeFuente,
} from './capas-mapa';
import { consultaCapasMapa } from './consultas';

const VIEJA = '0123456789abcdef';
const NUEVA = 'fedcba9876543210';
const ORIGEN = 'http://localhost:3100';

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

const tesela = (c: string, h: string) => `${ORIGEN}/geo/v1/teselas/${c}/${h}/13/2/3.mvt`;

describe('huella en la URL', () => {
  it('la saca de la capa GeoJSON y de las teselas, relativas o absolutas', () => {
    expect(huellaDeUrl(rutaCapaConHuella('distrito_municipal', VIEJA))).toEqual({
      capa: 'distrito_municipal',
      huella: VIEJA,
    });
    expect(huellaDeUrl(tesela('unidad_vecinal', VIEJA))).toEqual({
      capa: 'unidad_vecinal',
      huella: VIEJA,
    });
  });

  it('las rutas sin huella no tienen', () => {
    for (const url of ['/geo/v1/capas', '/geo/v1/capas/unidad_vecinal', '/api/v1/reportes'])
      expect(huellaDeUrl(url), url).toBeNull();
  });
});

describe('un 410 CAPA_CAMBIO recarga la lista de capas, una sola vez por ráfaga', () => {
  const vigentes = [
    capa('distrito_municipal', 'geojson', VIEJA),
    capa('unidad_vecinal', 'teselas', VIEJA),
  ];

  it('la primera tesela vieja pide recargar; las demás de la misma ráfaga, no', () => {
    expect(CODIGO_CAPA_CAMBIO).toBe('CAPA_CAMBIO');
    const cambio = detectorDeCapaCambiada();
    expect(cambio(errorAjax(410, tesela('unidad_vecinal', VIEJA)), vigentes)).toBe(true);
    for (let i = 0; i < 15; i++)
      expect(cambio(errorAjax(410, tesela('unidad_vecinal', VIEJA)), vigentes)).toBe(false);
    // Otra capa con su propia huella vieja es otro cambio.
    expect(
      cambio(
        errorAjax(410, `${ORIGEN}${rutaCapaConHuella('distrito_municipal', VIEJA)}`),
        vigentes,
      ),
    ).toBe(true);
  });

  it('con la lista ya nueva, los 410 rezagados de la huella vieja no recargan', () => {
    const cambio = detectorDeCapaCambiada();
    const nuevas = [capa('unidad_vecinal', 'teselas', NUEVA)];
    expect(cambio(errorAjax(410, tesela('unidad_vecinal', VIEJA)), nuevas)).toBe(false);
  });

  it('otros errores no recargan: ni otro estado, ni otra ruta, ni un error sin estado', () => {
    const cambio = detectorDeCapaCambiada();
    expect(cambio(errorAjax(404, tesela('unidad_vecinal', VIEJA)), vigentes)).toBe(false);
    expect(cambio(errorAjax(500, tesela('unidad_vecinal', VIEJA)), vigentes)).toBe(false);
    expect(cambio(errorAjax(410, `${ORIGEN}/api/v1/reportes`), vigentes)).toBe(false);
    expect(cambio(new Error('WebGL'), vigentes)).toBe(false);
    expect(cambio(undefined, vigentes)).toBe(false);
  });

  it('recargar pide /geo/v1/capas una sola vez aunque lleguen muchos avisos juntos', async () => {
    const cliente = new QueryClient();
    const pedirCapas = vi.fn(async () => vigentes);
    const { queryKey } = consultaCapasMapa();
    const baja = new QueryObserver(cliente, {
      queryKey,
      queryFn: pedirCapas,
      staleTime: Number.POSITIVE_INFINITY,
    }).subscribe(() => {});
    await vi.waitFor(() => expect(cliente.getQueryState(queryKey)?.fetchStatus).toBe('idle'));
    expect(pedirCapas).toHaveBeenCalledTimes(1);

    await Promise.all(Array.from({ length: 16 }, () => recargarCapasMapa(cliente)));
    expect(pedirCapas).toHaveBeenCalledTimes(2);
    baja();
    cliente.clear();
  });
});

describe('apuntar una fuente a la URL nueva', () => {
  it('GeoJSON: setData con la URL nueva, una sola vez', () => {
    const fuente = { type: 'geojson', setData: vi.fn() };
    anotarUrlDeFuente(fuente, rutaCapaConHuella('distrito_municipal', VIEJA));
    const nueva = capa('distrito_municipal', 'geojson', NUEVA);
    expect(apuntarFuenteA(fuente, nueva, ORIGEN)).toBe('cambiada');
    expect(fuente.setData).toHaveBeenCalledWith(`${ORIGEN}${nueva.url}`);
    expect(urlDeFuente(fuente)).toBe(nueva.url);
    expect(apuntarFuenteA(fuente, nueva, ORIGEN)).toBe('igual');
    expect(fuente.setData).toHaveBeenCalledTimes(1);
  });

  it('teselas: setTiles con la plantilla nueva', () => {
    const fuente = { type: 'vector', setTiles: vi.fn() };
    anotarUrlDeFuente(fuente, rutaTeselasConHuella('unidad_vecinal', VIEJA));
    const nueva = capa('unidad_vecinal', 'teselas', NUEVA);
    expect(apuntarFuenteA(fuente, nueva, ORIGEN)).toBe('cambiada');
    expect(fuente.setTiles).toHaveBeenCalledWith([`${ORIGEN}${nueva.url}`]);
  });

  it('si cambió de GeoJSON a teselas (o al revés) hay que rehacerla', () => {
    const fuente = { type: 'geojson', setData: vi.fn() };
    anotarUrlDeFuente(fuente, rutaCapaConHuella('unidad_vecinal', VIEJA));
    expect(apuntarFuenteA(fuente, capa('unidad_vecinal', 'teselas', NUEVA), ORIGEN)).toBe(
      'otro-modo',
    );
    expect(fuente.setData).not.toHaveBeenCalled();
  });
});

/** Lo mínimo de un mapa de MapLibre para agregar, cambiar y quitar fuentes y capas. */
function mapaFalso() {
  const fuentes = new Map<string, { type: string; setData: unknown; setTiles: unknown }>();
  const capas = new Map<string, { id: string }>();
  const m = {
    getSource: (id: string) => fuentes.get(id),
    addSource: vi.fn((id: string, spec: { type: string }) => {
      fuentes.set(id, { type: spec.type, setData: vi.fn(), setTiles: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => {
      fuentes.delete(id);
    }),
    getLayer: (id: string) => capas.get(id),
    addLayer: vi.fn((spec: { id: string }) => {
      capas.set(spec.id, spec);
    }),
    removeLayer: vi.fn((id: string) => {
      capas.delete(id);
    }),
  };
  return { m, mapa: m as unknown as MapaConCapas, fuentes, capas };
}

describe('aplicarCapas: el mapa del panel sigue a la capa vigente', () => {
  it('la primera vez agrega distritos y UV, no la de manzanas', () => {
    const { m, mapa, capas } = mapaFalso();
    aplicarCapas(
      mapa,
      [
        capa('distrito_municipal', 'geojson', VIEJA),
        capa('unidad_vecinal', 'teselas', VIEJA),
        capa('manzana', 'teselas', VIEJA),
      ],
      ORIGEN,
    );
    expect(m.addSource.mock.calls.map((c) => c[0])).toEqual([
      'capa-distrito_municipal',
      'capa-unidad_vecinal',
    ]);
    expect([...capas.keys()]).toEqual([
      'capa-distrito_municipal-linea',
      'capa-distrito_municipal-nombre',
      'capa-unidad_vecinal-linea',
      'capa-unidad_vecinal-nombre',
    ]);
  });

  it('con otra huella en el mismo modo, cambia la URL de la fuente sin rehacerla', () => {
    const { m, mapa, fuentes } = mapaFalso();
    aplicarCapas(
      mapa,
      [capa('distrito_municipal', 'geojson', VIEJA), capa('unidad_vecinal', 'teselas', VIEJA)],
      ORIGEN,
    );
    const distritos = capa('distrito_municipal', 'geojson', NUEVA);
    const uv = capa('unidad_vecinal', 'teselas', NUEVA);
    aplicarCapas(mapa, [distritos, uv], ORIGEN);

    expect(m.addSource).toHaveBeenCalledTimes(2);
    expect(m.removeSource).not.toHaveBeenCalled();
    expect(fuentes.get('capa-distrito_municipal')?.setData).toHaveBeenCalledWith(
      `${ORIGEN}${distritos.url}`,
    );
    expect(fuentes.get('capa-unidad_vecinal')?.setTiles).toHaveBeenCalledWith([
      `${ORIGEN}${uv.url}`,
    ]);

    // La misma lista otra vez no toca nada.
    aplicarCapas(mapa, [distritos, uv], ORIGEN);
    expect(fuentes.get('capa-distrito_municipal')?.setData).toHaveBeenCalledTimes(1);
    expect(fuentes.get('capa-unidad_vecinal')?.setTiles).toHaveBeenCalledTimes(1);
  });

  it('si la capa pasó de GeoJSON a teselas, quita sus capas y su fuente y las vuelve a agregar', () => {
    const { m, mapa, fuentes, capas } = mapaFalso();
    aplicarCapas(mapa, [capa('unidad_vecinal', 'geojson', VIEJA)], ORIGEN);
    aplicarCapas(mapa, [capa('unidad_vecinal', 'teselas', NUEVA)], ORIGEN);

    expect(m.removeLayer.mock.calls.map((c) => c[0])).toEqual([
      'capa-unidad_vecinal-linea',
      'capa-unidad_vecinal-nombre',
    ]);
    expect(m.removeSource).toHaveBeenCalledWith('capa-unidad_vecinal');
    expect(fuentes.get('capa-unidad_vecinal')?.type).toBe('vector');
    expect([...capas.keys()]).toEqual(['capa-unidad_vecinal-linea', 'capa-unidad_vecinal-nombre']);
  });
});
