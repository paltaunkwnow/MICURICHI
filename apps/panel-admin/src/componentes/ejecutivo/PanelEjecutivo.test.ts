import { type Ciudad, CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { resumenDeEjemplo } from '@/lib/ejecutivo.fixture';
import { PanelEjecutivo, type PropsPanelEjecutivo } from './PanelEjecutivo';

/** `generado_en` del resumen de ejemplo más 20 segundos. */
const AHORA = Date.parse('2026-09-25T10:00:20-04:00');

/**
 * Render estático, sin navegador ni MapLibre: el mapa entra por una función que acá no dibuja.
 * La ciudad llega como en la app, por el proveedor; por defecto, la de la instalación actual.
 */
function render(
  extra: Partial<PropsPanelEjecutivo> = {},
  ciudad: Ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
) {
  const props: PropsPanelEjecutivo = {
    resumen: resumenDeEjemplo(),
    cargando: false,
    cargandoPeriodo: false,
    error: null,
    onReintentar: () => {},
    pestana: 'todas',
    onCambiarPestana: () => {},
    ventana: 'todo',
    onCambiarVentana: () => {},
    ahora: AHORA,
    actualizando: false,
    mapa: () => createElement('div', { 'data-testid': 'ejecutivo-mapa' }),
    ...extra,
  };
  return renderToStaticMarkup(
    createElement(ProveedorCiudad, { ciudad }, createElement(PanelEjecutivo, props)),
  );
}

function bloque(html: string, testId: string, cierre = '</svg>'): string {
  const inicio = html.indexOf(`data-testid="${testId}"`);
  expect(inicio).toBeGreaterThan(-1);
  const fin = html.indexOf(cierre, inicio);
  return html.slice(inicio, fin);
}

/** Etiqueta de apertura del elemento con ese `data-testid`. */
function etiqueta(html: string, testId: string): string {
  return html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? '';
}

describe('PanelEjecutivo (render estático)', () => {
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

  it('«actualizado hace…» se calcula con `generado_en` y no es una región viva', () => {
    expect(html).toMatch(/data-testid="ejecutivo-actualizado"[^>]*>actualizado hace 20 s</);
    const tres = render({ ahora: Date.parse('2026-09-25T10:03:05-04:00') });
    expect(tres).toMatch(/data-testid="ejecutivo-actualizado"[^>]*>actualizado hace 3 min</);
    // Antes era aria-live y el lector de pantalla lo repetía cada 10 s.
    expect(etiqueta(html, 'ejecutivo-actualizado')).not.toContain('aria-live');
    expect(html).not.toMatch(/aria-live="[a-z]+"[^>]*>actualizado hace/);
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
    expect(bloque(conError, 'ejecutivo-sin-actualizar', '</output>')).toContain(
      'No se pudo actualizar',
    );
  });

  it('al cambiar de período, mientras llegan las cifras nuevas, atenúa las viejas y lo dice', () => {
    expect(html).not.toContain('Cargando el período…');
    expect(etiqueta(html, 'ejecutivo-contenido')).not.toContain('aria-busy');
    const cargando = render({ cargandoPeriodo: true, actualizando: true });
    expect(cargando).toMatch(/data-testid="ejecutivo-cargando-periodo"[^>]*>Cargando el período…</);
    const contenido = etiqueta(cargando, 'ejecutivo-contenido');
    expect(contenido).toContain('aria-busy="true"');
    expect(contenido).toContain('opacity-');
    // La hora de las cifras viejas no se muestra como si fuera la del período nuevo.
    expect(cargando).not.toContain('data-testid="ejecutivo-actualizado"');
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

  it('dibuja una barra por distrito vigente en cada gráfica, con título accesible y tabla oculta', () => {
    for (const id of ['ejecutivo-grafica-inundaciones', 'ejecutivo-grafica-trabajo']) {
      const svg = bloque(html, id);
      expect(svg.match(/data-barra="/g)).toHaveLength(16);
      expect(svg).not.toContain('data-barra="DM-01"');
      expect(svg).toContain('<title');
      expect(svg).toContain('<desc');
    }
    expect(html).toContain('Inundaciones activas por distrito');
    expect(html.match(/<table class="sr-only"/g)).toHaveLength(2);
    expect(html).toContain('En revisión');
    expect(html).toContain('Validados');
    expect(html).toContain('Resueltos');
  });

  it('los distritos de una capa anterior van aparte, con su código completo', () => {
    const anterior = bloque(html, 'ejecutivo-capa-anterior', '</section>');
    expect(anterior).toContain('De una capa anterior');
    expect(anterior).toContain('DM-01 · Distrito 1 (capa 2024)');
    const sinAnteriores = render({
      resumen: { ...r, por_distrito: r.por_distrito.filter((d) => d.en_capa_vigente) },
    });
    expect(sinAnteriores).not.toContain('data-testid="ejecutivo-capa-anterior"');
  });

  it('incluye el mapa, la leyenda y el selector de período', () => {
    expect(html).toContain('data-testid="ejecutivo-mapa"');
    expect(html).toContain('data-testid="ejecutivo-leyenda"');
    expect(html).toContain('Sin inundaciones activas');
    expect(html).toMatch(/<select[^>]*data-testid="ejecutivo-ventana"/);
    expect(html).toContain('Últimos 7 días');
    expect(html).toContain('Histórico');
  });

  it('el último reporte se lee en la hora de la ciudad del despliegue', () => {
    // 18:30 en La Paz (UTC-4) son las 17:30 en Bogotá (UTC-5).
    expect(html).toMatch(/Último reporte: 24 sept?\.? 2026, 18:30/);
    const bogota = render(
      {},
      {
        ...CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
        nombre: 'Bogotá',
        pais: 'CO',
        zona_horaria: 'America/Bogota',
        locale: 'es-CO',
      },
    );
    expect(bogota).toMatch(/Último reporte: 24 de sept?\.? de 2026, 17:30/);
  });

  it('si la primera carga falla no inventa ceros: dice que no se pudo cargar', () => {
    const conError = render({ resumen: undefined, error: 'El servidor tuvo un problema.' });
    expect(conError).toContain('No se pudo cargar el resumen.');
    expect(conError).not.toContain('data-testid="ejecutivo-total"');
  });
});
