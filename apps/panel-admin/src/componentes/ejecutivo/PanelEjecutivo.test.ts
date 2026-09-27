import { type Ciudad, CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { conteoPestana, type PestanaEjecutiva } from '@/lib/ejecutivo';
import { resumenDeEjemplo } from '@/lib/ejecutivo.fixture';
import { PanelEjecutivo, type PropsPanelEjecutivo } from './PanelEjecutivo';

/** Render estático, sin navegador. La ciudad llega como en la app, por el proveedor. */
function render(
  extra: Partial<PropsPanelEjecutivo> = {},
  ciudad: Ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
) {
  const props: PropsPanelEjecutivo = {
    resumen: resumenDeEjemplo(),
    cargando: false,
    error: null,
    onReintentar: () => {},
    pestana: 'todas',
    onCambiarPestana: () => {},
    ...extra,
  };
  return renderToStaticMarkup(
    createElement(ProveedorCiudad, { ciudad }, createElement(PanelEjecutivo, props)),
  );
}

function bloque(html: string, marca: string, cierre = '</svg>'): string {
  const inicio = html.indexOf(marca);
  expect(inicio, marca).toBeGreaterThan(-1);
  const fin = html.indexOf(cierre, inicio);
  return html.slice(inicio, fin);
}

/** Etiqueta de apertura del elemento con ese `data-testid`. */
function etiqueta(html: string, testId: string): string {
  return html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? '';
}

/** Valores de la tabla accesible de «Inundaciones activas por distrito» (una fila por barra). */
function valoresInundaciones(html: string): number[] {
  const tabla = bloque(html, '<caption>Inundaciones activas por distrito', '</table>');
  return [...tabla.matchAll(/<td>(\d+)<\/td>/g)].map((m) => Number(m[1]));
}

describe('PanelEjecutivo (pantalla limpia)', () => {
  const r = resumenDeEjemplo();
  const html = render();

  it('el número grande es la inundación activa, con verificadas y en revisión debajo', () => {
    expect(html).toMatch(new RegExp(`data-testid="ejecutivo-total"[^>]*>${r.activas.total}<`));
    expect(html).toContain('inundaciones activas');
    expect(html).toMatch(
      /data-testid="ejecutivo-verificadas"[^>]*>55 verificadas · 59 en revisión</,
    );
  });

  it('el número grande no cambia con la pestaña: las pestañas llevan su propio conteo', () => {
    const media = render({ pestana: 'media' });
    expect(media).toMatch(new RegExp(`data-testid="ejecutivo-total"[^>]*>${r.activas.total}<`));
  });

  it('tiene las tres pestañas de severidad más «Todas», en un tablist, con su conteo de activas', () => {
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    for (const id of ['critica', 'media', 'baja', 'todas']) {
      expect(html).toContain(`data-testid="ejecutivo-pestana-${id}"`);
    }
    const critica = r.activas.por_severidad.critica + r.activas.por_severidad.alta;
    expect(html).toMatch(
      new RegExp(`data-testid="ejecutivo-pestana-critica".*?class="n tabular-nums">${critica}<`),
    );
    const tagTodas = html.match(/<button[^>]*data-testid="ejecutivo-pestana-todas"[^>]*>/)?.[0];
    expect(tagTodas).toContain('aria-selected="true"');
  });

  it('las dos gráficas: «Inundaciones activas por distrito» con «Otros» y «Cómo va el trabajo»', () => {
    expect(html).toContain('Inundaciones activas por distrito');
    expect(html).toContain('Cómo va el trabajo');
    const inundaciones = bloque(html, 'data-testid="ejecutivo-grafica-inundaciones"');
    expect(inundaciones.match(/data-barra="/g)).toHaveLength(17);
    expect(inundaciones).toContain('data-barra="otros"');
    expect(inundaciones).toMatch(/>Otros</);
    const trabajo = bloque(html, 'data-testid="ejecutivo-grafica-trabajo"');
    expect(trabajo.match(/data-barra="/g)).toHaveLength(16);
    for (const svg of [inundaciones, trabajo]) {
      expect(svg).not.toContain('data-barra="DM-01"');
      expect(svg).toContain('<title');
      expect(svg).toContain('<desc');
    }
    expect(html.match(/<table class="sr-only"/g)).toHaveLength(2);
  });

  it.each(['todas', 'critica', 'media', 'baja'] as PestanaEjecutiva[])(
    'pestaña %s: las barras de los distritos más «Otros» suman las activas de la pestaña',
    (pestana) => {
      const valores = valoresInundaciones(render({ pestana }));
      const suma = valores.reduce((s, v) => s + v, 0);
      expect(suma).toBe(conteoPestana(r.activas.por_severidad, pestana));
      if (pestana === 'todas') expect(suma).toBe(r.activas.total);
    },
  );

  it('salen el mapa, el selector de período, la hora de actualización y el último reporte', () => {
    for (const fuera of [
      'data-testid="ejecutivo-mapa"',
      'data-testid="ejecutivo-leyenda"',
      '<select',
      'data-testid="ejecutivo-ventana"',
      'Período',
      'Histórico',
      'Últimos 7 días',
      'actualizado hace',
      'actualizando…',
      'Último reporte',
      'Cargando el período',
      'Dónde se inunda',
    ]) {
      expect(html, fuera).not.toContain(fuera);
    }
  });

  it('la tabla «De una capa anterior» ya no está en el panel ejecutivo', () => {
    expect(html).not.toContain('De una capa anterior');
    expect(html).not.toContain('capa-anterior');
    expect(html).not.toContain('Distrito 1 (capa 2024)');
  });

  it('sin textos de ayuda: ni bajo el título ni dentro de las gráficas', () => {
    expect(html).not.toContain('Dónde y cuánto se está inundando');
    expect(html).not.toContain('Pasá o tocá');
    // Los párrafos visibles de antes; la descripción accesible de cada gráfica (<desc>) sigue.
    expect(html).not.toContain('En revisión o verificadas, por distrito (');
    expect(html).not.toContain('Reportes por estado en cada distrito, todas las severidades.');
    for (const id of ['ej-titulo-inundaciones', 'ej-titulo-trabajo']) {
      expect(bloque(html, `aria-labelledby="${id}"`, '</section>')).not.toMatch(/<p[\s>]/);
    }
  });

  it('la nota metodológica queda en una sola línea', () => {
    const nota = html.match(/<p[^>]*data-testid="ejecutivo-nota"[^>]*>([^<]*)<\/p>/);
    expect(nota?.[1]).toContain('no mediciones');
    expect(html.match(/data-testid="ejecutivo-nota"/g)).toHaveLength(1);
    expect(nota?.[1]).not.toMatch(/\.\s+\S/);
    expect(html).not.toContain('class="ayuda"');
  });

  it('la única región viva de las cifras anuncia datos, no la hora', () => {
    expect(etiqueta(html, 'ejecutivo-anuncio')).toContain('role="status"');
    expect(html).toMatch(
      /data-testid="ejecutivo-anuncio"[^>]*>114 inundaciones activas: 55 verificadas y 59 en revisión\.</,
    );
  });

  it('con un error y datos anteriores lo avisa en una región viva que ya estaba montada', () => {
    expect(etiqueta(html, 'ejecutivo-sin-actualizar')).toContain('aria-live="polite"');
    const conError = render({ error: 'El servidor tuvo un problema.' });
    expect(bloque(conError, 'data-testid="ejecutivo-sin-actualizar"', '</output>')).toContain(
      'No se pudo actualizar',
    );
  });

  it('si la primera carga falla no inventa ceros: dice que no se pudo cargar', () => {
    const conError = render({ resumen: undefined, error: 'El servidor tuvo un problema.' });
    expect(conError).toContain('No se pudo cargar el resumen.');
    expect(conError).not.toContain('data-testid="ejecutivo-total"');
  });
});
