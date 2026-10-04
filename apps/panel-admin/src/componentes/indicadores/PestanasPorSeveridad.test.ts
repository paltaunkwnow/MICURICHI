import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Severidad } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { disparar, elementosDelArbol } from '@/lib/arbol-elementos.fixture';
import { PESTANAS_SEVERIDAD, type PestanaSeveridad } from '@/lib/indicadores-pestanas';
import { PestanasPorSeveridad } from './PestanasPorSeveridad';

/**
 * «Por severidad» de /indicadores como grupo de botones (T7). El panel no tiene tests con DOM: se
 * renderiza a HTML estático y se leen sus atributos y textos, como las demás pruebas de
 * componentes. El estado y la transición están probados aparte (`lib/indicadores-pestanas.test.ts`).
 */

const CONTEOS = { total: 120, por_severidad: { baja: 40, media: 50, alta: 20, critica: 10 } };

function render(
  props: Partial<{
    seleccionadas: Severidad[];
    conteos: typeof CONTEOS | null;
    onElegir: (p: PestanaSeveridad) => void;
  }> = {},
) {
  return renderToStaticMarkup(
    createElement(PestanasPorSeveridad, {
      seleccionadas: [],
      conteos: CONTEOS,
      onElegir: () => {},
      ...props,
    }),
  );
}

/** El texto que ve la persona: sin etiquetas ni los `<!-- -->` que React pone entre textos. */
function visible(html: string): string {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todo el HTML del botón de una pestaña, de su `<button` al `</button>`. */
function boton(html: string, id: PestanaSeveridad): string {
  const marca = `data-testid="indicadores-pestana-${id}"`;
  const dentro = html.indexOf(marca);
  expect(dentro, marca).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<button', dentro), html.indexOf('</button>', dentro) + 9);
}

/** Etiqueta de apertura del botón (sus atributos). */
const apertura = (html: string, id: PestanaSeveridad) =>
  boton(html, id).match(/^<button[^>]*>/)?.[0] ?? '';

const presionado = (html: string, id: PestanaSeveridad) =>
  /aria-pressed="(true|false)"/.exec(apertura(html, id))?.[1];

describe('PestanasPorSeveridad: el grupo', () => {
  const html = render();

  it('es un grupo con nombre «Ver por severidad», con su testid propio y descrito por la ayuda', () => {
    // Un <fieldset> ya es un grupo (rol `group` implícito) y su <legend> es el nombre: Biome pide
    // este elemento en vez de un <div role="group">. La leyenda no se ve: el título «Por severidad»
    // ya está arriba, y la fila «Filtrar por severidad» tiene la suya, con otro nombre.
    const grupo = html.match(
      /<fieldset[^>]*data-testid="indicadores-pestanas-severidad"[^>]*>/,
    )?.[0];
    expect(grupo).toBeDefined();
    const nombre = html.match(/<legend[^>]*>([^<]*)<\/legend>/);
    expect(nombre?.[1]).toBe('Ver por severidad');
    expect(nombre?.[0]).toContain('class="sr-only"');
    // El nombre es lo primero del grupo y va antes de los botones.
    expect(html.indexOf('<fieldset')).toBeLessThan(html.indexOf('<legend'));
    expect(html.indexOf('<legend')).toBeLessThan(html.indexOf('<button'));
    const ayuda = /aria-describedby="([^"]+)"/.exec(grupo ?? '')?.[1];
    expect(ayuda, 'el grupo apunta a su línea de ayuda').toBeTruthy();
    expect(html).toContain(`id="${ayuda}"`);
  });

  it('mantiene el título «Por severidad» y una línea de ayuda corta', () => {
    expect(html).toMatch(/<h2[^>]*>Por severidad<\/h2>/);
    expect(visible(html)).toContain(
      'Tocá una severidad para ver los gráficos solo de esa; «Todo» vuelve a todas.',
    );
  });

  it('no usa el testid del filtro de arriba: la E2E de las tortas sigue acotada a ese filtro', () => {
    expect(html).not.toContain('indicadores-filtro-severidad');
  });
});

describe('PestanasPorSeveridad: los botones', () => {
  const html = render();

  it('son cinco botones nativos: «Todo» primero y después las cuatro severidades', () => {
    const ids = [...html.matchAll(/<button[^>]*data-testid="indicadores-pestana-([a-z]+)"/g)].map(
      (m) => m[1],
    );
    expect(ids).toEqual([...PESTANAS_SEVERIDAD]);
    expect(ids).toEqual(['todas', 'baja', 'media', 'alta', 'critica']);
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(visible(boton(html, 'todas'))).toMatch(/^Todo\b/);
  });

  it('cada uno es type="button", con aria-pressed, y ninguno sale del orden del teclado', () => {
    for (const id of PESTANAS_SEVERIDAD) {
      const a = apertura(html, id);
      expect(a, id).toContain('type="button"');
      expect(a, id).toMatch(/aria-pressed="(true|false)"/);
      expect(a, id).not.toMatch(/tabindex|disabled|role=/);
    }
    // Botones sueltos con aria-pressed, no pestañas WAI-ARIA: no hay tablist ni panel asociado.
    expect(html).not.toContain('role="tab');
  });

  it('cada severidad lleva color + texto + barras (ChipSeveridad); «Todo» no es una severidad', () => {
    for (const id of ['baja', 'media', 'alta', 'critica'] as const) {
      const b = boton(html, id);
      expect(b, id).toContain('class="sev ');
      expect(b, id).toContain('class="barras"');
    }
    expect(boton(html, 'todas')).not.toContain('barras');
    expect(visible(boton(html, 'critica'))).toMatch(/^Crítica\b/);
    expect(visible(boton(html, 'baja'))).toMatch(/^Baja\b/);
  });

  it('cada botón dice su número: «Todo» el total, cada severidad el suyo', () => {
    const numero = (id: PestanaSeveridad) =>
      new RegExp(`data-testid="indicadores-pestana-${id}-n"[^>]*>([^<]*)<`).exec(html)?.[1];
    expect(numero('todas')).toBe('120');
    expect(numero('baja')).toBe('40');
    expect(numero('media')).toBe('50');
    expect(numero('alta')).toBe('20');
    expect(numero('critica')).toBe('10');
  });

  it('el nombre accesible cierra con «reportes» (en singular con 1) sin tocar lo visible', () => {
    const uno = render({
      conteos: { total: 1, por_severidad: { baja: 1, media: 0, alta: 0, critica: 0 } },
    });
    expect(visible(boton(uno, 'todas'))).toBe('Todo 1 reporte');
    expect(visible(boton(uno, 'baja'))).toBe('Baja 1 reporte');
    expect(visible(boton(uno, 'media'))).toBe('Media 0 reportes');
    expect(visible(boton(html, 'critica'))).toBe('Crítica 10 reportes');
    // Lo que se agrega para el lector de pantalla no se ve.
    expect(boton(html, 'critica')).toMatch(/<span class="sr-only">[^<]*reportes<\/span>/);
  });

  it('los números no dependen de lo elegido: elegir una severidad no los cambia', () => {
    const numeros = (h: string) =>
      PESTANAS_SEVERIDAD.map(
        (id) => new RegExp(`data-testid="indicadores-pestana-${id}-n"[^>]*>([^<]*)<`).exec(h)?.[1],
      );
    const sinFiltro = numeros(render({ seleccionadas: [] }));
    expect(numeros(render({ seleccionadas: ['critica'] }))).toEqual(sinFiltro);
    expect(numeros(render({ seleccionadas: ['critica', 'alta'] }))).toEqual(sinFiltro);
  });

  it('mientras los conteos no llegan muestra «—», no un 0 inventado, y lo dice al lector', () => {
    const cargando = render({ conteos: null });
    for (const id of PESTANAS_SEVERIDAD) {
      expect(visible(boton(cargando, id)), id).toContain('—');
      expect(visible(boton(cargando, id)), id).toContain('cargando');
      expect(boton(cargando, id), id).not.toMatch(/>0</);
    }
  });
});

describe('PestanasPorSeveridad: qué botones están presionados (una sola fuente, la URL)', () => {
  const estados = (html: string) => PESTANAS_SEVERIDAD.map((id) => presionado(html, id));

  it('sin severidades elegidas, solo «Todo»', () => {
    expect(estados(render({ seleccionadas: [] }))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('con una severidad elegida, solo esa', () => {
    expect(estados(render({ seleccionadas: ['alta'] }))).toEqual([
      'false',
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('con dos elegidas en la fila de arriba, las dos pestañas presionadas y «Todo» no', () => {
    const html = render({ seleccionadas: ['critica', 'alta'] });
    expect(presionado(html, 'critica')).toBe('true');
    expect(presionado(html, 'alta')).toBe('true');
    expect(presionado(html, 'media')).toBe('false');
    expect(presionado(html, 'baja')).toBe('false');
    expect(presionado(html, 'todas')).toBe('false');
  });
});

describe('PestanasPorSeveridad: el clic', () => {
  it('cada botón avisa con su pestaña: «todas» o la severidad', () => {
    const onElegir = vi.fn();
    // Sin DOM no se puede hacer clic: se llama el `onClick` de cada botón, como lo haría el navegador.
    const arbol = PestanasPorSeveridad({ seleccionadas: [], conteos: CONTEOS, onElegir });
    const botones = elementosDelArbol(
      arbol,
      (e) => e.type === 'button' && typeof e.props.onClick === 'function',
    );
    expect(botones.map((b) => b.props['data-testid'])).toEqual([
      'indicadores-pestana-todas',
      'indicadores-pestana-baja',
      'indicadores-pestana-media',
      'indicadores-pestana-alta',
      'indicadores-pestana-critica',
    ]);
    for (const b of botones) disparar(b, 'onClick');
    expect(onElegir.mock.calls.map((c) => c[0])).toEqual([
      'todas',
      'baja',
      'media',
      'alta',
      'critica',
    ]);
  });
});

describe('estilos de .pestana-sev (objetivo táctil y estado)', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
    'utf8',
  );
  const regla = (selector: string) =>
    new RegExp(`${selector.replace(/[.[\]"=]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('mide al menos 24 px de alto (WCAG 2.5.8); el kit pide 48', () => {
    const alto = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(regla('.pestana-sev'))?.[1];
    expect(alto, '.pestana-sev necesita min-height en px').toBeDefined();
    expect(Number(alto)).toBeGreaterThanOrEqual(24);
    expect(Number(alto)).toBeGreaterThanOrEqual(48);
  });

  it('el botón presionado se distingue por aria-pressed, no por una clase aparte', () => {
    expect(regla('.pestana-sev[aria-pressed="true"]')).toMatch(/background/);
  });
});
