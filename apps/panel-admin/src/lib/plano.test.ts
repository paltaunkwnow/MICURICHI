import { CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import { CIUDAD_DEL_PLANO, hayPlanoDeReferencia } from './plano';

describe('plano oficial de referencia (contenido de la instalación de Santa Cruz)', () => {
  it('el plano que trae la app es el de Santa Cruz de la Sierra', () => {
    expect(CIUDAD_DEL_PLANO).toEqual({ nombre: 'Santa Cruz de la Sierra', pais: 'BO' });
  });

  it('se muestra en la instalación de Santa Cruz, que es la ciudad por defecto', () => {
    expect(hayPlanoDeReferencia(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO)).toBe(true);
    // Mayúsculas y tildes no cambian la ciudad.
    expect(hayPlanoDeReferencia({ nombre: 'SANTA CRUZ DE LA SIERRA', pais: 'BO' })).toBe(true);
  });

  it('en otra ciudad no se muestra: sería el plano de otro municipio', () => {
    expect(hayPlanoDeReferencia({ nombre: 'La Paz', pais: 'BO' })).toBe(false);
    expect(hayPlanoDeReferencia({ nombre: 'Santa Cruz de la Sierra', pais: 'ES' })).toBe(false);
  });
});
