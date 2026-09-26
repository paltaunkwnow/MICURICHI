import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resumenDeEjemplo } from '@/lib/ejecutivo.fixture';
import { PanelEjecutivo, type PropsPanelEjecutivo } from './PanelEjecutivo';

/** Render estático, sin navegador ni MapLibre: el mapa entra por una función que acá no dibuja. */
function render(extra: Partial<PropsPanelEjecutivo> = {}) {
  const props: PropsPanelEjecutivo = {
    resumen: resumenDeEjemplo(),
    cargando: false,
    error: null,
    onReintentar: () => {},
    pestana: 'todas',
    onCambiarPestana: () => {},
    ventana: 'todo',
    onCambiarVentana: () => {},
    textoActualizado: 'actualizado hace 20 s',
    actualizando: false,
    mapa: () => createElement('div', { 'data-testid': 'ejecutivo-mapa' }),
    ...extra,
  };
  return renderToStaticMarkup(createElement(PanelEjecutivo, props));
}

function bloque(html: string, testId: string): string {
  const inicio = html.indexOf(`data-testid="${testId}"`);
  expect(inicio).toBeGreaterThan(-1);
  const fin = html.indexOf('</svg>', inicio);
  return html.slice(inicio, fin);
}

describe('PanelEjecutivo (render estático)', () => {
  const r = resumenDeEjemplo();
  const html = render();

  it('muestra el total en grande, «reportes de inundación» y la hora de actualización en vivo', () => {
    expect(html).toMatch(new RegExp(`data-testid="ejecutivo-total"[^>]*>${r.total}<`));
    expect(html).toContain('reportes de inundación');
    expect(html).toMatch(/aria-live="polite"[^>]*>actualizado hace 20 s</);
  });

  it('tiene las tres pestañas de severidad más «Todas», en un tablist, con su conteo', () => {
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    for (const id of ['critica', 'media', 'baja', 'todas']) {
      expect(html).toContain(`data-testid="ejecutivo-pestana-${id}"`);
    }
    const critica = r.por_severidad.critica + r.por_severidad.alta;
    expect(html).toMatch(
      new RegExp(`data-testid="ejecutivo-pestana-critica".*?class="n tabular-nums">${critica}<`),
    );
    const tagTodas = html.match(/<button[^>]*data-testid="ejecutivo-pestana-todas"[^>]*>/)?.[0];
    expect(tagTodas).toContain('aria-selected="true"');
  });

  it('dibuja 16 barras en cada gráfica, con título accesible y tabla oculta de datos', () => {
    for (const id of ['ejecutivo-grafica-inundaciones', 'ejecutivo-grafica-trabajo']) {
      const svg = bloque(html, id);
      expect(svg.match(/data-barra="/g)).toHaveLength(16);
      expect(svg).toContain('<title');
      expect(svg).toContain('<desc');
    }
    expect(html.match(/<table class="sr-only"/g)).toHaveLength(2);
    expect(html).toContain('En revisión');
    expect(html).toContain('Validados');
    expect(html).toContain('Resueltos');
  });

  it('incluye el mapa, la leyenda y el selector de período', () => {
    expect(html).toContain('data-testid="ejecutivo-mapa"');
    expect(html).toContain('data-testid="ejecutivo-leyenda"');
    expect(html).toContain('Sin reportes');
    expect(html).toMatch(/<select[^>]*data-testid="ejecutivo-ventana"/);
    expect(html).toContain('Últimos 7 días');
    expect(html).toContain('Histórico');
  });

  it('si la primera carga falla no inventa ceros: dice que no se pudo cargar', () => {
    const conError = render({ resumen: undefined, error: 'El servidor tuvo un problema.' });
    expect(conError).toContain('No se pudo cargar el resumen.');
    expect(conError).not.toContain('data-testid="ejecutivo-total"');
  });
});
