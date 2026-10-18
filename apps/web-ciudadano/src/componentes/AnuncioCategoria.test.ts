import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnuncioCategoria } from './AnuncioCategoria';

describe('región viva de categoría', () => {
  it.each([null, 'Categoría no disponible'])(
    'monta vacía incluso si el aviso %s ya llegó',
    (mensaje) => {
      expect(renderToStaticMarkup(createElement(AnuncioCategoria, { mensaje }))).toBe(
        '<p class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="anuncio-categoria"></p>',
      );
    },
  );
});
