import { CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import { vistaInicialDelPanel } from './encuadre';

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
