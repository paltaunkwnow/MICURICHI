import { describe, expect, it } from 'vitest';
import { esModoAproximado, ofreceUbicacionAproximada } from './ubicacion-aproximada';
import type { LecturaDispositivo } from './ubicacion-dispositivo';

const lectura = (precisionM: number): LecturaDispositivo => ({
  lat: -17.78,
  lon: -63.18,
  precisionM,
  tomadaEn: 0,
});

describe('cuándo ofrecer el camino de ubicación aproximada (ADR 0007)', () => {
  it('con una lectura imprecisa (más de 50 m) ya en «buscando», sin esperar el plazo', () => {
    expect(ofreceUbicacionAproximada({ fase: 'buscando', ultima: lectura(178) })).toBe(true);
  });

  it('también cuando venció el plazo («imprecisa»)', () => {
    expect(ofreceUbicacionAproximada({ fase: 'imprecisa', ultima: lectura(300) })).toBe(true);
  });

  it('con 50 m o menos no se ofrece: ese dispositivo va por el camino normal', () => {
    expect(ofreceUbicacionAproximada({ fase: 'buscando', ultima: lectura(50) })).toBe(false);
    expect(ofreceUbicacionAproximada({ fase: 'buscando', ultima: lectura(20) })).toBe(false);
  });

  it('sin ninguna lectura todavía no se ofrece: no habría dónde centrar el mapa', () => {
    expect(ofreceUbicacionAproximada({ fase: 'buscando', ultima: null })).toBe(false);
    expect(ofreceUbicacionAproximada({ fase: 'imprecisa', ultima: null })).toBe(false);
  });

  it('fuera de «buscando»/«imprecisa» nunca se ofrece', () => {
    expect(ofreceUbicacionAproximada({ fase: 'inactiva' })).toBe(false);
    expect(ofreceUbicacionAproximada({ fase: 'denegada' })).toBe(false);
    expect(ofreceUbicacionAproximada({ fase: 'error', problema: 'inseguro' })).toBe(false);
    expect(
      ofreceUbicacionAproximada({ fase: 'lista', ancla: lectura(200), vez: 1, aproximada: true }),
    ).toBe(false);
  });
});

describe('el modo aproximado activo sale del estado del controlador', () => {
  it('es «lista» con la marca «aproximada»', () => {
    expect(esModoAproximado({ fase: 'lista', ancla: lectura(200), vez: 1, aproximada: true })).toBe(
      true,
    );
    expect(esModoAproximado({ fase: 'lista', ancla: lectura(10), vez: 1 })).toBe(false);
    expect(esModoAproximado({ fase: 'buscando', ultima: lectura(200) })).toBe(false);
    expect(esModoAproximado({ fase: 'inactiva' })).toBe(false);
  });
});
