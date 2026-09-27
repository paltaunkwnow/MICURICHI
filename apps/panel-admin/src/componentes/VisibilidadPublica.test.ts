import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisibilidadPublica } from './VisibilidadPublica';

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('VisibilidadPublica (detalle técnico)', () => {
  it('un nuevo dice que ya es público como NO SE HA VERIFICADO', () => {
    const html = renderToStaticMarkup(createElement(VisibilidadPublica, { estado: 'nuevo' }));
    expect(html).toContain('data-testid="visibilidad-publica"');
    expect(texto(html)).toBe('Visible en el mapa público como NO SE HA VERIFICADO');
  });

  it('un rechazado dice que no se ve en el mapa público', () => {
    const html = renderToStaticMarkup(createElement(VisibilidadPublica, { estado: 'rechazado' }));
    expect(texto(html)).toBe('No se ve en el mapa público: está rechazado');
  });
});
