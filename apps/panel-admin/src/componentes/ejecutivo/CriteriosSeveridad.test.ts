import { BANDAS, calcularSeveridad, FRECUENCIAS, PROFUNDIDADES, PUNTOS } from 'contracts';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { definicionPestana, type PestanaEjecutiva } from '@/lib/ejecutivo';
import { etiquetaFrecuencia, etiquetaProfundidad, etiquetaSeveridad } from '@/lib/formato';
import { formulaPuntaje } from '@/lib/severidad';
import { CriteriosSeveridad } from './CriteriosSeveridad';

/** Las tres tarjetas: una por pestaña de severidad (la de «Todas» no tiene tarjeta). */
const TARJETAS: PestanaEjecutiva[] = ['critica', 'media', 'baja'];
const TODAS_LAS_PESTANAS: PestanaEjecutiva[] = [...TARJETAS, 'todas'];

function render(
  pestana: PestanaEjecutiva = 'todas',
  onCambiarPestana: (p: PestanaEjecutiva) => void = () => {},
) {
  return renderToStaticMarkup(createElement(CriteriosSeveridad, { pestana, onCambiarPestana }));
}

/** El texto que ve la persona: sin etiquetas, sin los `<!-- -->` de React y con las entidades vueltas a su signo. */
function textoVisible(html: string): string {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Todo el HTML de una tarjeta, de su `<button` al `</button>`. */
function tarjeta(html: string, id: PestanaEjecutiva): string {
  const marca = `data-testid="ejecutivo-criterio-${id}"`;
  const enLaApertura = html.indexOf(marca);
  expect(enLaApertura, marca).toBeGreaterThan(-1);
  return html.slice(
    html.lastIndexOf('<button', enLaApertura),
    html.indexOf('</button>', enLaApertura),
  );
}

/** Etiqueta de apertura del botón de una tarjeta. */
function aperturaDe(html: string, id: PestanaEjecutiva): string {
  return (
    html.match(new RegExp(`<button[^>]*data-testid="ejecutivo-criterio-${id}"[^>]*>`))?.[0] ?? ''
  );
}

/** El rango que le toca a una pestaña, sacado de las bandas de contracts y de lo que suma. */
function esperado(id: PestanaEjecutiva) {
  const bandas = BANDAS.filter((b) => definicionPestana(id).severidades.includes(b.banda));
  return {
    min: Math.min(...bandas.map((b) => b.min)),
    max: Math.max(...bandas.map((b) => b.max)),
    bandas,
  };
}

const plural = (n: number) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;

describe('CriteriosSeveridad: qué significa cada nivel, con lo que dice contracts', () => {
  const html = render();
  const texto = textoVisible(html);

  it('son tres botones, uno por nivel, con los mismos ids de pestaña de siempre', () => {
    expect(html.match(/data-testid="ejecutivo-criterio-/g)).toHaveLength(3);
    for (const id of TARJETAS) {
      expect(aperturaDe(html, id), id).toMatch(/^<button[^>]*type="button"/);
    }
  });

  it('cada tarjeta dice el rango de puntaje que BANDAS da a su grupo de severidades', () => {
    for (const id of TARJETAS) {
      const { min, max } = esperado(id);
      expect(textoVisible(tarjeta(html, id)), id).toContain(`${min} a ${max} puntos`);
    }
  });

  it('«Crítica (y Alta)» reparte su rango entre las dos bandas que junta; las otras no repiten nada', () => {
    const critica = textoVisible(tarjeta(html, 'critica'));
    const { bandas } = esperado('critica');
    expect(bandas).toHaveLength(2);
    for (const b of bandas) {
      expect(critica).toContain(`${etiquetaSeveridad(b.banda)}: ${b.min} a ${b.max}`);
    }
    // El nombre de la tarjeta nombra todo lo que suma.
    for (const s of definicionPestana('critica').severidades) {
      expect(critica).toContain(etiquetaSeveridad(s));
    }
    for (const id of ['media', 'baja'] as const) {
      expect(esperado(id).bandas).toHaveLength(1);
      expect(textoVisible(tarjeta(html, id)), id).not.toContain('Por nivel');
    }
  });

  it('la regla de escalamiento (la más profunda es siempre crítica) está solo donde está la crítica', () => {
    const critica = textoVisible(tarjeta(html, 'critica'));
    expect(critica).toContain(etiquetaProfundidad('mas_70'));
    expect(critica).toContain('siempre crítica');
    for (const id of ['media', 'baja'] as const) {
      const otra = textoVisible(tarjeta(html, id));
      expect(otra, id).not.toContain('siempre crítica');
      expect(otra, id).not.toContain(etiquetaProfundidad('mas_70'));
    }
    // Y es cierto: con esa profundidad, calcularSeveridad da crítica sea cual sea la frecuencia.
    for (const frecuencia of FRECUENCIAS) {
      expect(
        calcularSeveridad({ profundidad_estimada: 'mas_70', frecuencia }).banda,
        frecuencia,
      ).toBe('critica');
    }
  });

  it('muestra la fórmula y los puntos de cada respuesta, con las etiquetas que ya usa el panel', () => {
    expect(texto).toContain(formulaPuntaje());
    for (const p of PROFUNDIDADES) {
      const n = PUNTOS.profundidad[p];
      expect(texto, p).toMatch(new RegExp(`${escapar(etiquetaProfundidad(p))} ${plural(n)}`));
    }
    for (const f of FRECUENCIAS) {
      const n = PUNTOS.frecuencia[f];
      expect(texto, f).toMatch(new RegExp(`${escapar(etiquetaFrecuencia(f))} ${plural(n)}`));
    }
  });

  it('no inventa impacto, respuesta operativa ni prioridad (CLAUDE.md, regla 6)', () => {
    const minusculas = texto.toLowerCase();
    for (const inventado of [
      'motobomba',
      'cuadrilla',
      'prioridad',
      'emergencia',
      'precaución',
      'ordinaria',
      'impacto en el entorno',
      'respuesta operativa',
      'respuesta municipal',
      'nivel de agua estimado',
      'despacho',
      'viviendas',
      'tránsito',
    ]) {
      expect(minusculas, inventado).not.toContain(inventado);
    }
    // El umbral que el texto de antes ponía a la severidad crítica y que la fórmula no respalda.
    expect(texto).not.toContain('Superior a 40 cm');
  });

  it('dice que son parámetros iniciales, a validar con el técnico municipal', () => {
    expect(texto).toContain('Parámetros iniciales, a validar con el técnico municipal');
  });

  it('es una sección con título, y el subtítulo explica el puntaje', () => {
    expect(html).toMatch(/<section[^>]*aria-labelledby="ej-titulo-criterios"/);
    expect(html).toMatch(
      /<h2[^>]*id="ej-titulo-criterios"[^>]*>Significado de los niveles de severidad</,
    );
    expect(texto).toMatch(/puntaje/i);
  });

  describe('la tarjeta del nivel elegido está presionada y las demás no (aria-pressed)', () => {
    it.each(TODAS_LAS_PESTANAS)('pestaña %s', (pestana) => {
      const h = render(pestana);
      for (const id of TARJETAS) {
        expect(aperturaDe(h, id), `${pestana} → ${id}`).toContain(
          `aria-pressed="${pestana === id}"`,
        );
      }
    });
  });

  describe('tocar una tarjeta cambia la pestaña', () => {
    /** Los botones del árbol de elementos, sin dibujarlo: el componente no usa hooks. */
    function botonesDe(nodo: ReactNode, acc: ReactElement<Record<string, unknown>>[] = []) {
      if (Array.isArray(nodo)) {
        for (const hijo of nodo) botonesDe(hijo, acc);
      } else if (isValidElement<Record<string, unknown>>(nodo)) {
        if (nodo.type === 'button') acc.push(nodo);
        botonesDe(nodo.props.children as ReactNode, acc);
      }
      return acc;
    }

    it('cada tarjeta avisa su propio id, y solo uno', () => {
      const avisos: PestanaEjecutiva[] = [];
      const arbol = CriteriosSeveridad({
        pestana: 'todas',
        onCambiarPestana: (p) => avisos.push(p),
      });
      const botones = botonesDe(arbol);
      expect(botones).toHaveLength(3);
      const ids = botones.map((b) => b.props['data-testid']);
      expect(ids).toEqual(TARJETAS.map((id) => `ejecutivo-criterio-${id}`));
      for (const [i, boton] of botones.entries()) {
        const alTocar = boton.props.onClick as () => void;
        alTocar();
        expect(avisos, `tarjeta ${i}`).toEqual([TARJETAS[i]]);
        avisos.length = 0;
      }
    });

    it('no cambia nada por sí sola al dibujarse', () => {
      const alCambiar = vi.fn();
      render('media', alCambiar);
      expect(alCambiar).not.toHaveBeenCalled();
    });
  });
});
