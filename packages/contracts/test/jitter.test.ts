import { describe, expect, it } from 'vitest';
import { aplicarJitter, distanciaAproximadaM, redondearCoordenada } from '../src/geo/jitter.js';

describe('jitter público', () => {
  it('es determinista por semilla y queda dentro del radio', () => {
    const a = aplicarJitter(-17.78, -63.18, 'reporte-1', 30);
    const b = aplicarJitter(-17.78, -63.18, 'reporte-1', 30);
    expect(a).toEqual(b);
    expect(distanciaAproximadaM(-17.78, -63.18, a.lat, a.lon)).toBeLessThanOrEqual(30.01);
  });
  it('semillas distintas dan desplazamientos distintos', () => {
    const a = aplicarJitter(-17.78, -63.18, 'r1', 30);
    const b = aplicarJitter(-17.78, -63.18, 'r2', 30);
    expect(a).not.toEqual(b);
  });
  it('radio 0 no mueve el punto', () => {
    expect(aplicarJitter(-17.78, -63.18, 'r', 0)).toEqual({ lat: -17.78, lon: -63.18 });
  });
  it('redondea coordenadas', () => {
    expect(redondearCoordenada(-63.1812345678, 5)).toBe(-63.18123);
  });
});
