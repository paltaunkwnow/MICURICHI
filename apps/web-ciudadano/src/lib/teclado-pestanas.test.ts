import { describe, expect, it } from 'vitest';
import { destinoTrasTecla, indiceTrasTecla } from './teclado-pestanas';

describe('navegación con el teclado de un tablist', () => {
  it('derecha e izquierda mueven a la pestaña de al lado', () => {
    expect(indiceTrasTecla('ArrowRight', 0, 4)).toBe(1);
    expect(indiceTrasTecla('ArrowRight', 2, 4)).toBe(3);
    expect(indiceTrasTecla('ArrowLeft', 3, 4)).toBe(2);
    expect(indiceTrasTecla('ArrowLeft', 1, 4)).toBe(0);
  });

  it('dan la vuelta en los extremos', () => {
    expect(indiceTrasTecla('ArrowRight', 3, 4)).toBe(0);
    expect(indiceTrasTecla('ArrowLeft', 0, 4)).toBe(3);
    expect(indiceTrasTecla('ArrowRight', 0, 1)).toBe(0);
  });

  it('Inicio va a la primera y Fin a la última, desde donde se esté', () => {
    expect(indiceTrasTecla('Home', 2, 4)).toBe(0);
    expect(indiceTrasTecla('End', 1, 4)).toBe(3);
    expect(indiceTrasTecla('Home', 0, 4)).toBe(0);
    expect(indiceTrasTecla('End', 3, 4)).toBe(3);
  });

  it('cualquier otra tecla no mueve nada, y sin pestañas tampoco', () => {
    for (const tecla of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'a', 'PageDown'])
      expect(indiceTrasTecla(tecla, 1, 4), tecla).toBeNull();
    expect(indiceTrasTecla('ArrowRight', 0, 0)).toBeNull();
  });

  it('devuelve la pestaña de destino junto con su posición', () => {
    const pestanas = ['inundacion', 'bache', 'basura'] as const;
    expect(destinoTrasTecla('ArrowRight', 0, pestanas)).toEqual({ indice: 1, pestana: 'bache' });
    expect(destinoTrasTecla('End', 0, pestanas)).toEqual({ indice: 2, pestana: 'basura' });
    expect(destinoTrasTecla('ArrowLeft', 0, pestanas)).toEqual({ indice: 2, pestana: 'basura' });
    expect(destinoTrasTecla('x', 0, pestanas)).toBeNull();
    expect(destinoTrasTecla('End', 0, [])).toBeNull();
  });
});
