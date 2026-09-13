import { describe, expect, it } from 'vitest';
import type { ReporteFeature } from './api';
import {
  contadorDescripcion,
  distanciaDesde,
  etiquetaTirante,
  subtituloReporte,
  textoCapaOficial,
  tituloPuntos,
  tituloReporte,
  urlFotoRelativa,
} from './formato';

const props = {
  id: '00000000-0000-0000-0000-000000000001',
  distrito: { id: 'distrito_municipal:7', codigo: '7', nombre: 'Distrito 7' },
  unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Unidad Vecinal 123' },
  direccion_aprox: null,
  tirante_estimado: 'rodilla',
} as unknown as ReporteFeature['properties'];

const reporte = {
  type: 'Feature',
  id: props.id,
  geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
  properties: props,
} as ReporteFeature;

describe('formato', () => {
  it('usa el nombre de la UV cuando no hay dirección', () => {
    expect(tituloReporte(props)).toBe('Unidad Vecinal 123');
    expect(tituloReporte({ ...props, direccion_aprox: 'Av. Piraí esq. Los Tajibos' })).toBe(
      'Av. Piraí esq. Los Tajibos',
    );
  });

  it('arma el subtítulo con UV, distrito y distancia', () => {
    expect(subtituloReporte(props)).toBe('UV 123 · Distrito 7');
    expect(subtituloReporte(props, 320)).toBe('UV 123 · Distrito 7 · a 320 m de vos');
    expect(subtituloReporte(props, 2400)).toBe('UV 123 · Distrito 7 · a 2.4 km de vos');
  });

  it('pluraliza el título del panel', () => {
    expect(tituloPuntos(undefined)).toContain('Buscando');
    expect(tituloPuntos(1)).toBe('1 punto cerca de vos');
    expect(tituloPuntos(9)).toBe('9 puntos cerca de vos');
  });

  it('describe el tirante con su rango en centímetros', () => {
    expect(etiquetaTirante('rodilla')).toBe('A la rodilla · 10–40 cm');
  });

  it('calcula la distancia solo si hay ubicación del vecino', () => {
    expect(distanciaDesde(null, reporte)).toBeNull();
    const d = distanciaDesde({ lat: -17.781, lon: -63.18 }, reporte);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });

  it('arma el chip de capa oficial', () => {
    expect(textoCapaOficial(props.distrito, props.unidad_vecinal)).toBe(
      'Distrito 7 · UV-123 · capa oficial vigente',
    );
    expect(textoCapaOficial(null, null)).toBe('Fuera de la cobertura municipal');
  });

  it('cuenta los caracteres de la descripción', () => {
    expect(contadorDescripcion(0)).toBe('Mínimo 10 caracteres · 0/1000');
  });

  it('pasa las URLs de fotos a relativas para el rewrite de Next', () => {
    expect(urlFotoRelativa('http://127.0.0.1:3001/api/v1/fotos/abc.jpg')).toBe(
      '/api/v1/fotos/abc.jpg',
    );
    expect(urlFotoRelativa('/api/v1/fotos/abc.jpg')).toBe('/api/v1/fotos/abc.jpg');
  });
});
