import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SlugCategoria } from 'contracts';
import { DEFINICION_INUNDACION } from 'contracts';
import { Children, createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  conCategorias,
  DEFINICION_BACHE_DE_PRUEBA,
  REGISTRO_DOS_CATEGORIAS,
} from '@/lib/categoria-de-prueba';
import { SRC } from '@/lib/fuente-para-pruebas';
import { iconoDeCategoria } from './categorias/iconos';
import { LeyendaMapa } from './LeyendaMapa';
import { type ItemPestana, PestanasCategoria, SelectorCategoria } from './SelectorCategoria';

/**
 * CA4 del plan M4, punto 2 (ADR 0022, doc 14 §2.4): el selector de categoría. Oculto con menos de dos
 * activas; con dos o más, un `tablist` accesible con *roving tabindex*, flechas, Inicio y Fin.
 * Se prueba con el registro inyectado de dos categorías (la segunda es sintética).
 */

const html = (nodo: ReactElement) => renderToStaticMarkup(nodo);

const sinAccion = () => {};

function selector(activas: SlugCategoria[], categoria: SlugCategoria | null) {
  return conCategorias(
    activas,
    createElement(SelectorCategoria, { categoria, onCambiar: sinAccion }),
    REGISTRO_DOS_CATEGORIAS,
  );
}

describe('SelectorCategoria: visibilidad', () => {
  it('con una sola categoría activa no dibuja nada', () => {
    expect(html(selector(['inundacion'], 'inundacion'))).toBe('');
    // Una activa en el catálogo pero sin definición en el registro cuenta como inactiva (falla cerrado).
    expect(html(selector(['inundacion', 'basura'], 'inundacion'))).toBe('');
  });

  it('con dos activas dibuja un tablist con una pestaña por categoría', () => {
    const marcado = html(selector(['inundacion', 'bache'], 'inundacion'));
    expect(marcado).toContain('role="tablist"');
    expect(marcado).toContain('aria-label="Categorías"');
    expect(marcado.match(/role="tab"/g)).toHaveLength(2);
    expect(marcado).toContain('Inundaciones');
    expect(marcado).toContain('Baches');
  });

  it('solo las activas y en el orden canónico del registro, vengan como vengan', () => {
    const marcado = html(selector(['bache', 'inundacion'], 'inundacion'));
    expect(marcado.indexOf('Inundaciones')).toBeLessThan(marcado.indexOf('Baches'));
    expect(marcado.match(/role="tab"/g)).toHaveLength(2);
  });
});

describe('SelectorCategoria: estado de cada pestaña', () => {
  const marcado = html(selector(['inundacion', 'bache'], 'bache'));
  const pestanas = marcado.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
  const deLa = (nombre: string) => pestanas.find((p) => p.includes(`-${nombre}"`)) ?? '';

  it('solo la activa está seleccionada y entra en el orden de tabulación (roving tabindex)', () => {
    expect(deLa('bache')).toContain('aria-selected="true"');
    expect(deLa('bache')).toContain('tabindex="0"');
    expect(deLa('inundacion')).toContain('aria-selected="false"');
    expect(deLa('inundacion')).toContain('tabindex="-1"');
  });

  it('el acento con los colores de la categoría va solo en la activa', () => {
    expect(deLa('bache')).toContain('background:#F6EDE3');
    expect(deLa('bache')).toContain('color:#7A4E1E');
    expect(deLa('bache')).toContain('border-color:#9C6A35');
    expect(deLa('inundacion')).not.toContain('style=');
    expect(deLa('inundacion')).not.toContain(DEFINICION_INUNDACION.colores.c1);
  });

  it('cada pestaña lleva su icono (decorativo) y su nombre', () => {
    expect(marcado.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(2);
    expect(iconoDeCategoria(DEFINICION_INUNDACION.icono)).not.toBe(
      iconoDeCategoria(DEFINICION_BACHE_DE_PRUEBA.icono),
    );
    // Un icono que la app no conoce tiene respaldo: nunca una pestaña sin icono.
    expect(iconoDeCategoria('IconoQueNoExiste')).toBeTypeOf('object');
  });

  it('mientras la categoría no se resolvió (hidratación) ninguna está seleccionada y la primera es alcanzable', () => {
    const neutro = html(selector(['inundacion', 'bache'], null));
    const botones = neutro.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(botones).toHaveLength(2);
    expect(neutro).not.toContain('aria-selected="true"');
    expect(botones[0]).toContain('tabindex="0"');
    expect(botones[1]).toContain('tabindex="-1"');
  });
});

describe('PestanasCategoria: teclado y clic (sin DOM, leyendo los manejadores)', () => {
  const items: ItemPestana[] = (['inundacion', 'bache'] as const).map((slug) => {
    const def = REGISTRO_DOS_CATEGORIAS.obtener(slug);
    if (!def) throw new Error(slug);
    return { slug, nombre: def.nombre, Icono: iconoDeCategoria(def.icono), colores: def.colores };
  });

  function montar(categoria: SlugCategoria | null) {
    const onCambiar = vi.fn();
    const enfocar = vi.fn();
    const arbol = PestanasCategoria({
      items,
      categoria,
      onCambiar,
      enfocar,
      registrar: sinAccion,
      testId: 'selector-categoria',
    }) as ReactElement<{ children: ReactElement[] }>;
    const botones = Children.toArray(arbol.props.children) as ReactElement<{
      onKeyDown: (e: unknown) => void;
      onClick: () => void;
      tabIndex: number;
    }>[];
    const tecla = (indice: number, key: string, extra: Record<string, boolean> = {}) => {
      const preventDefault = vi.fn();
      botones[indice]?.props.onKeyDown({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault,
        ...extra,
      });
      return preventDefault;
    };
    return { botones, tecla, onCambiar, enfocar };
  }

  it('la flecha derecha mueve el foco a la siguiente y la activa', () => {
    const { tecla, onCambiar, enfocar } = montar('inundacion');
    const impedirDefecto = tecla(0, 'ArrowRight');
    expect(enfocar).toHaveBeenCalledWith(1);
    expect(onCambiar).toHaveBeenCalledWith('bache');
    expect(impedirDefecto).toHaveBeenCalled();
  });

  it('la izquierda da la vuelta; Fin e Inicio van a los extremos', () => {
    const a = montar('inundacion');
    a.tecla(0, 'ArrowLeft');
    expect(a.onCambiar).toHaveBeenCalledWith('bache');
    const b = montar('inundacion');
    b.tecla(0, 'End');
    expect(b.onCambiar).toHaveBeenCalledWith('bache');
    expect(b.enfocar).toHaveBeenCalledWith(1);
    const c = montar('bache');
    c.tecla(1, 'Home');
    expect(c.onCambiar).toHaveBeenCalledWith('inundacion');
    expect(c.enfocar).toHaveBeenCalledWith(0);
  });

  it('otras teclas, o con Ctrl, Alt o Meta, no cambian nada ni le quitan su efecto al navegador', () => {
    const { tecla, onCambiar, enfocar } = montar('inundacion');
    const arriba = tecla(0, 'ArrowDown');
    const conCtrl = tecla(0, 'ArrowRight', { ctrlKey: true });
    const conAlt = tecla(0, 'ArrowRight', { altKey: true });
    const conMeta = tecla(0, 'End', { metaKey: true });
    expect(onCambiar).not.toHaveBeenCalled();
    expect(enfocar).not.toHaveBeenCalled();
    for (const impedir of [arriba, conCtrl, conAlt, conMeta])
      expect(impedir).not.toHaveBeenCalled();
  });

  it('el clic elige la categoría de esa pestaña', () => {
    const { botones, onCambiar } = montar('inundacion');
    botones[1]?.props.onClick();
    expect(onCambiar).toHaveBeenCalledWith('bache');
  });

  it('el tabindex sigue a la activa, y a la primera mientras no hay ninguna', () => {
    expect(montar('bache').botones.map((b) => b.props.tabIndex)).toEqual([-1, 0]);
    expect(montar('inundacion').botones.map((b) => b.props.tabIndex)).toEqual([0, -1]);
    expect(montar(null).botones.map((b) => b.props.tabIndex)).toEqual([0, -1]);
  });
});

describe('SelectorCategoria: objetivos de 48 px, foco de la marca y pestaña activa a la vista', () => {
  const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
  const bloque = (selectorCss: string) =>
    new RegExp(`${selectorCss.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('cada pestaña mide al menos 48 px de alto', () => {
    expect(bloque('.pestana-categoria')).toMatch(/min-height:\s*48px/);
  });

  it('el foco no se redefine para la categoría: queda el anillo verde de la marca', () => {
    expect(css).not.toMatch(/\.pestana-categoria[^{]*:focus(-visible)?[^{]*\{[^}]*outline/);
    expect(bloque('.pestana-categoria')).not.toMatch(/outline/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-verde-500\)/);
  });

  it('al elegirse, la pestaña activa se acerca a la vista sin animación', () => {
    const fuente = readFileSync(join(SRC, 'componentes/SelectorCategoria.tsx'), 'utf8');
    expect(fuente).toMatch(/scrollIntoView\(\{[^}]*block:\s*'nearest'[^}]*\}/s);
    expect(fuente).toMatch(/inline:\s*'nearest'/);
    expect(fuente).toMatch(/behavior:\s*'instant'/);
  });
});

describe('LeyendaMapa con dos categorías activas', () => {
  it('abre con el icono y el nombre de la categoría efectiva', () => {
    const marcado = html(createElement(LeyendaMapa, { categoria: DEFINICION_BACHE_DE_PRUEBA }));
    expect(marcado).toMatch(
      /data-testid="leyenda-categoria"[^>]*>.*?<svg[^>]*aria-hidden="true".*?<\/svg>Baches/,
    );
    expect(marcado).toContain('color:#7A4E1E');
    // Lo de siempre sigue debajo.
    expect(marcado).toContain('NO SE HA VERIFICADO');
  });

  it('sin categoría (una sola activa) es la leyenda de siempre, sin la línea nueva', () => {
    const marcado = html(createElement(LeyendaMapa));
    expect(marcado).not.toContain('leyenda-categoria');
    expect(html(createElement(LeyendaMapa, { categoria: null }))).toBe(marcado);
    expect(html(createElement(LeyendaMapa, { categoria: undefined }))).toBe(marcado);
  });
});
