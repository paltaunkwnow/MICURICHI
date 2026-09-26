import { type Ciudad, CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import { centroDeCiudad, descripcionDeInicio, fotoDeCiudad, tituloDelMapa } from './ciudad';

/** Otra instalación: la misma imagen, otra ciudad (decisión del 2026-09-26). */
const COCHABAMBA: Ciudad = {
  nombre: 'Cochabamba',
  pais: 'BO',
  zona_horaria: 'America/La_Paz',
  locale: 'es-BO',
  centro: { lon: -66.157, lat: -17.3895 },
  zoom_inicial: 13,
};

describe('la ciudad de la instalación', () => {
  it('el centro sale de la configuración, en el orden de MapLibre (lon, lat)', () => {
    expect(centroDeCiudad(COCHABAMBA)).toEqual([-66.157, -17.3895]);
    expect(centroDeCiudad(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO)).toEqual([-63.18, -17.78]);
  });

  it('los textos nombran la ciudad configurada y no otra', () => {
    expect(tituloDelMapa(COCHABAMBA)).toBe('Mapa de puntos de inundación de Cochabamba');
    expect(descripcionDeInicio(COCHABAMBA)).toContain('Cochabamba');
    expect(descripcionDeInicio(COCHABAMBA)).not.toContain('Santa Cruz');
  });

  it('la foto de la catedral de Santa Cruz solo se usa en Santa Cruz', () => {
    expect(fotoDeCiudad(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO)).toBe('/santa-cruz-catedral.jpg');
    // Mismo nombre escrito de otra forma: sigue siendo la misma ciudad.
    expect(fotoDeCiudad({ nombre: '  santa cruz de la SIERRA ', pais: 'BO' })).toBe(
      '/santa-cruz-catedral.jpg',
    );
    expect(fotoDeCiudad(COCHABAMBA)).toBeNull();
    expect(fotoDeCiudad({ nombre: 'Santa Cruz de la Sierra', pais: 'AR' })).toBeNull();
  });
});
