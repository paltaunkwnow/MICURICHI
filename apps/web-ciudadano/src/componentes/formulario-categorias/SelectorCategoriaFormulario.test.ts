import type { SlugCategoria } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { REGISTRO_DOS_CATEGORIAS } from '@/lib/categoria-de-prueba';
import { SelectorCategoriaFormulario } from './SelectorCategoriaFormulario';

/** El selector «Categoría: X · Cambiar» del paso 1 (ADR 0021), con dos categorías activas. */
describe('SelectorCategoriaFormulario', () => {
  const props = {
    activas: ['inundacion', 'bache'] as readonly SlugCategoria[],
    categoria: 'bache' as SlugCategoria,
    registro: REGISTRO_DOS_CATEGORIAS,
    onElegir: () => {},
  };

  it('muestra la categoría actual y un botón «Cambiar»', () => {
    const html = renderToStaticMarkup(createElement(SelectorCategoriaFormulario, props));
    expect(html).toContain('data-testid="categoria-del-reporte"');
    expect(html).toContain('Categoría:');
    expect(html).toContain('Baches');
    expect(html).toContain('data-testid="cambiar-categoria"');
    // Cerrado por defecto: la lista de categorías se abre al tocar «Cambiar» (estado del cliente).
    expect(html).not.toContain('data-testid="elegir-categoria-');
  });
});
