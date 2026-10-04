import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type Ciudad, CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { conteoPestana, type PestanaEjecutiva, rangoPuntajePestana } from '@/lib/ejecutivo';
import { resumenDeEjemplo } from '@/lib/ejecutivo.fixture';
import { formulaPuntaje } from '@/lib/severidad';
import { coincideUv, PanelEjecutivo, type PropsPanelEjecutivo } from './PanelEjecutivo';

/** Render estático, sin navegador. La ciudad llega como en la app, por el proveedor. */
function render(
  extra: Partial<PropsPanelEjecutivo> = {},
  ciudad: Ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
) {
  const cliente = new QueryClient();
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
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(ProveedorCiudad, { ciudad }, createElement(PanelEjecutivo, props)),
    ),
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

  it('los criterios de severidad del panel salen de contracts: fórmula, rangos y sin respuesta operativa', () => {
    expect(html).toContain('data-testid="ejecutivo-criterios"');
    expect(html).toContain(formulaPuntaje());
    const critica = bloque(html, 'data-testid="ejecutivo-criterio-critica"', '</button>');
    const { min, max } = rangoPuntajePestana('critica');
    expect(critica).toContain(`${min} a ${max} puntos`);
    // Lo que decían las tarjetas de antes, sin fuente: ni impacto, ni acciones, ni prioridades.
    const minusculas = html.toLowerCase();
    for (const inventado of ['motobomba', 'cuadrilla', 'prioridad', 'impacto en el entorno']) {
      expect(minusculas, inventado).not.toContain(inventado);
    }
    expect(html).not.toContain('Respuesta operativa');
    expect(html).not.toContain('Nivel de agua estimado');
  });

  it('la tarjeta de la pestaña elegida es la que está presionada', () => {
    const media = render({ pestana: 'media' });
    expect(etiqueta(media, 'ejecutivo-criterio-media')).toContain('aria-pressed="true"');
    expect(etiqueta(media, 'ejecutivo-criterio-critica')).toContain('aria-pressed="false"');
    expect(etiqueta(media, 'ejecutivo-criterio-baja')).toContain('aria-pressed="false"');
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

  it('el ejecutivo no exporta: el panel no tiene botones de exportación', () => {
    expect(html).not.toContain('data-testid="ejecutivo-exportar-geojson"');
    expect(html).not.toContain('data-testid="ejecutivo-exportar-csv"');
    expect(html).not.toContain('Exportar GeoJSON');
    expect(html).not.toContain('Exportar CSV');
  });

  it('con UV seleccionada muestra el banner de filtro activo, sin botones de exportación', () => {
    const conUv = render({
      uvSeleccionada: { id: 'unidad_vecinal:UV-05', codigo: '05', nombre: 'Barrio Central' },
      reportes: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
          properties: {
            id: 'rep-1',
            severidad: 'alta',
            unidad_vecinal: { id: 'unidad_vecinal:UV-05', codigo: '05', nombre: 'Barrio Central' },
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-63.19, -17.79] },
          properties: {
            id: 'rep-2',
            severidad: 'baja',
            unidad_vecinal: { id: 'unidad_vecinal:UV-09', codigo: '09', nombre: 'Otra UV' },
          },
        },
      ],
    });
    expect(conUv).toContain('data-testid="ejecutivo-banner-filtro-uv"');
    expect(conUv).toContain('Filtro activo: Unidad Vecinal 05');
    expect(conUv).toContain('Barrio Central');
    expect(conUv).toContain('data-testid="ejecutivo-quitar-filtro-uv"');
    expect(conUv).not.toContain('Exportar GeoJSON');
    expect(conUv).not.toContain('Exportar CSV');
  });

  it('coincideUv compara correctamente IDs con o sin prefijo y códigos con o sin UV', () => {
    expect(
      coincideUv(
        { id: 'unidad_vecinal:UV-01', codigo: '01' },
        { id: 'unidad_vecinal:UV-01', codigo: '01' },
      ),
    ).toBe(true);
    expect(
      coincideUv({ id: 'UV-01', codigo: 'UV-01' }, { id: 'unidad_vecinal:UV-01', codigo: '01' }),
    ).toBe(true);
    expect(coincideUv({ id: '12', codigo: '12' }, { id: '12', codigo: '12' })).toBe(true);
    expect(coincideUv(null, { id: '12', codigo: '12' })).toBe(false);
    expect(
      coincideUv(
        { id: 'unidad_vecinal:01', codigo: '01' },
        { id: 'unidad_vecinal:02', codigo: '02' },
      ),
    ).toBe(false);
  });
});
