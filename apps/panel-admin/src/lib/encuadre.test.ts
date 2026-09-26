import { type CapaInfo, CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import { limitesDeCapas, vistaInicialDelPanel } from './encuadre';

function capa(tipo: CapaInfo['capa'], bbox: CapaInfo['bbox']): CapaInfo {
  return {
    capa: tipo,
    version: 'DM_UV_MZ_2025',
    n_features: 1,
    bytes_web: null,
    modo: 'geojson',
    url: `/geo/v1/capas/${tipo}`,
    bbox,
  };
}

describe('encuadre del mapa sobre la capa vigente', () => {
  it('toma el bbox de los distritos, que cubre todo el municipio', () => {
    // Con zoom 11 fijo sobre el centro, los distritos 14 y 15 de la capa real quedaban fuera.
    const capas = [
      capa('unidad_vecinal', [-63.25, -17.92, -62.81, -17.63]),
      capa('distrito_municipal', [-63.256651, -17.958736, -62.806871, -17.631857]),
    ];
    expect(limitesDeCapas(capas)).toEqual([
      [-63.256651, -17.958736],
      [-62.806871, -17.631857],
    ]);
  });

  it('sin distritos usa cualquier otra capa con bbox; sin ninguna, no encuadra', () => {
    expect(limitesDeCapas([capa('unidad_vecinal', [-63.2, -17.9, -62.8, -17.6])])).toEqual([
      [-63.2, -17.9],
      [-62.8, -17.6],
    ]);
    expect(limitesDeCapas([capa('distrito_municipal', null)])).toBeNull();
    expect(limitesDeCapas([])).toBeNull();
  });
});

describe('vista inicial del mapa del panel', () => {
  it('abre en el centro de la ciudad del despliegue, un nivel más lejos que el mapa público', () => {
    // La bandeja comparte la pantalla con la tabla: con el zoom del mapa público (13) se veía
    // menos ciudad. Con la ciudad por defecto queda como antes: centro de Santa Cruz y zoom 12.
    expect(vistaInicialDelPanel(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO)).toEqual({
      centro: [-63.18, -17.78],
      zoom: 12,
    });
    expect(
      vistaInicialDelPanel({ centro: { lon: -68.1193, lat: -16.4897 }, zoom_inicial: 12.5 }),
    ).toEqual({ centro: [-68.1193, -16.4897], zoom: 11.5 });
  });

  it('nunca pide un zoom negativo', () => {
    expect(vistaInicialDelPanel({ centro: { lon: 0, lat: 0 }, zoom_inicial: 0.5 }).zoom).toBe(0);
  });
});
