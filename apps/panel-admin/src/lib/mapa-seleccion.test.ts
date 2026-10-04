import { describe, expect, it } from 'vitest';
import { bboxDeLimites, redondearBbox, textoZonaCentro, zonaDeFeature } from './mapa-seleccion';

describe('zonaDeFeature', () => {
  it('toma id, código y nombre de properties e ignora el feature.id numérico', () => {
    const feature = {
      id: 0, // índice que inventa MapLibre al no haber promoteId: NO debe usarse
      properties: { id: 'unidad_vecinal:CI', codigo: 'CI', nombre: 'Unidad Vecinal CI' },
    };
    expect(zonaDeFeature(feature, 'uv')).toEqual({
      id: 'unidad_vecinal:CI',
      codigo: 'CI',
      nombre: 'Unidad Vecinal CI',
    });
  });

  it('genera el nombre cuando la capa no lo trae', () => {
    const feature = { id: 3, properties: { id: 'distrito_municipal:11', codigo: '11' } };
    expect(zonaDeFeature(feature, 'distrito')).toEqual({
      id: 'distrito_municipal:11',
      codigo: '11',
      nombre: 'Distrito 11',
    });
  });

  it('reconstruye el id desde el código si falta, con el prefijo del tipo', () => {
    const feature = { id: 5, properties: { codigo: '7' } };
    expect(zonaDeFeature(feature, 'distrito')).toEqual({
      id: 'distrito_municipal:7',
      codigo: '7',
      nombre: 'Distrito 7',
    });
  });

  it('devuelve null sin properties usables', () => {
    expect(zonaDeFeature(undefined, 'uv')).toBeNull();
    expect(zonaDeFeature({ id: 9, properties: null }, 'uv')).toBeNull();
    expect(zonaDeFeature({ id: 9, properties: {} }, 'uv')).toBeNull();
  });
});

describe('redondearBbox y bboxDeLimites', () => {
  it('redondea cada coordenada a 5 decimales', () => {
    expect(redondearBbox('-63.123456,-17.987654,-63.1,-17.9')).toBe(
      '-63.12346,-17.98765,-63.10000,-17.90000',
    );
  });

  it('arma el bbox desde los límites del mapa', () => {
    const limites = {
      getWest: () => -63.212344,
      getSouth: () => -17.812341,
      getEast: () => -63.151,
      getNorth: () => -17.751,
    };
    expect(bboxDeLimites(limites)).toBe('-63.21234,-17.81234,-63.15100,-17.75100');
  });
});

describe('textoZonaCentro', () => {
  const dist = { id: 'distrito_municipal:11', codigo: '11', nombre: 'Distrito 11' };
  const uv = { id: 'unidad_vecinal:CI', codigo: 'CI', nombre: 'Unidad Vecinal CI' };

  it('nombra el distrito y la UV del centro', () => {
    expect(textoZonaCentro(dist, uv)).toBe('Mirando: Distrito 11 · UV CI');
  });

  it('muestra solo lo que hay', () => {
    expect(textoZonaCentro(dist, null)).toBe('Mirando: Distrito 11');
    expect(textoZonaCentro(null, null)).toBeNull();
  });

  it('no duplica el prefijo cuando el código ya lo trae', () => {
    const uv2 = { id: 'unidad_vecinal:UV-105', codigo: 'UV-105', nombre: '' };
    expect(textoZonaCentro(null, uv2)).toBe('Mirando: UV-105');
  });
});
