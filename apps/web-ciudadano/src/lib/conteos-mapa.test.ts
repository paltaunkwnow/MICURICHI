import type { CapaInfo } from 'contracts';
import { describe, expect, it, vi } from 'vitest';
import { limpiarConteosDeCapas } from './conteos-mapa';

/**
 * Al cambiar de categoría el relleno por unidad vecinal y distrito de la anterior no puede quedar
 * pintado mientras llegan los agregados nuevos (`feature-state` solo se escribe cuando hay filas).
 */

const capa = (nombre: string, modo: 'geojson' | 'teselas'): CapaInfo =>
  ({
    capa: nombre,
    modo,
    url: `/geo/v1/capas/${nombre}/v/0123456789abcdef`,
  }) as unknown as CapaInfo;

function mapaFalso(fuentes: string[], falla: string[] = []) {
  return {
    getSource: vi.fn((id: string) => (fuentes.includes(id) ? {} : undefined)),
    removeFeatureState: vi.fn((t: { source: string; sourceLayer?: string }) => {
      if (falla.includes(t.source)) throw new Error('fuente sin cargar');
    }),
  };
}

describe('limpiarConteosDeCapas', () => {
  it('borra el estado de cada capa con fuente y devuelve esas capas', () => {
    const m = mapaFalso(['capa-distrito_municipal', 'capa-unidad_vecinal']);
    const capas = [capa('distrito_municipal', 'geojson'), capa('unidad_vecinal', 'geojson')];
    expect(limpiarConteosDeCapas(m, capas)).toEqual(capas);
    expect(m.removeFeatureState).toHaveBeenCalledWith({ source: 'capa-distrito_municipal' });
    expect(m.removeFeatureState).toHaveBeenCalledWith({ source: 'capa-unidad_vecinal' });
  });

  it('las teselas vectoriales piden la capa de origen', () => {
    const m = mapaFalso(['capa-unidad_vecinal']);
    limpiarConteosDeCapas(m, [capa('unidad_vecinal', 'teselas')]);
    expect(m.removeFeatureState).toHaveBeenCalledWith({
      source: 'capa-unidad_vecinal',
      sourceLayer: 'unidad_vecinal',
    });
  });

  it('una capa sin fuente (todavía no se dibujó, o la manzana, que ya no se dibuja) se salta', () => {
    const m = mapaFalso(['capa-unidad_vecinal']);
    const resultado = limpiarConteosDeCapas(m, [
      capa('distrito_municipal', 'geojson'),
      capa('manzana', 'teselas'),
      capa('unidad_vecinal', 'geojson'),
    ]);
    expect(resultado.map((c) => c.capa)).toEqual(['unidad_vecinal']);
    expect(m.removeFeatureState).toHaveBeenCalledTimes(1);
  });

  it('si el mapa rechaza el borrado de una fuente sin cargar, sigue con las demás', () => {
    const m = mapaFalso(
      ['capa-distrito_municipal', 'capa-unidad_vecinal'],
      ['capa-distrito_municipal'],
    );
    const resultado = limpiarConteosDeCapas(m, [
      capa('distrito_municipal', 'geojson'),
      capa('unidad_vecinal', 'geojson'),
    ]);
    expect(resultado).toHaveLength(2);
    expect(m.removeFeatureState).toHaveBeenCalledTimes(2);
  });
});
