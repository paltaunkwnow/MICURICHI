import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TablaReportes } from '@/componentes/TablaReportes';
import { registroSintetico, reporteSintetico } from './categorias.fixture';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reportes',
}));
vi.mock('@/componentes/Mapa', () => ({ Mapa: () => null }));
afterEach(() => vi.unstubAllGlobals());
const render = (nodo: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(ProveedorCiudad, { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO }, nodo),
  );
describe('M5.2 selector y conteos por ambito', () => {
  const props = {
    disponibles: registroSintetico.definiciones,
    categoria: 'inundacion',
    conteos: {},
    onCambiar: vi.fn(),
    universo: 'Publicados, todos los estados',
  };
  it('oculta el selector con una y no genera consultas extra', async () => {
    const { SelectorCategoria } = await import('@/componentes/SelectorCategoria');
    const { consultasConteosCategorias } = await import('./seleccion-panel');
    expect(
      render(
        createElement(SelectorCategoria, { ...props, disponibles: props.disponibles.slice(0, 1) }),
      ),
    ).not.toContain('Todas');
    expect(consultasConteosCategorias('reportes', ['inundacion'])).toEqual([]);
  });
  it('cero se comunica sin habilitar consultas', async () => {
    const { SelectorCategoria } = await import('@/componentes/SelectorCategoria');
    const { consultasConteosCategorias } = await import('./seleccion-panel');
    expect(
      render(createElement(SelectorCategoria, { ...props, disponibles: [], categoria: null })),
    ).toContain('No hay categorías disponibles');
    expect(consultasConteosCategorias('reportes', [])).toEqual([]);
  });
  it('dos muestran Todas y metadatos en orden con controles de 48px y region inicialmente vacia', async () => {
    const { SelectorCategoria } = await import('@/componentes/SelectorCategoria');
    const html = render(createElement(SelectorCategoria, props));
    expect(html.indexOf('Todas')).toBeLessThan(html.indexOf('Inundaciones'));
    expect(html).toContain('Baches de prueba');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('min-h-12');
    expect(html).toMatch(/data-testid="anuncio-categoria-panel"[^>]*><\/p>/);
    expect(html).toContain('lucide-traffic-cone');
  });
  it('conteo no exacto es cota inferior; error o carga nunca es cero', async () => {
    const { textoConteo } = await import('./seleccion-panel');
    expect(textoConteo(undefined, (n) => String(n))).toBe('—');
    expect(textoConteo({ valor: 800, exacto: false }, String)).toBe('≥ 800');
    expect(textoConteo({ valor: 0, exacto: true }, String)).toBe('0');
  });
  it('anuncia solo cambio real; el montaje y el mismo ambito quedan vacios', async () => {
    const { anuncioCategoria } = await import('./seleccion-panel');
    expect(anuncioCategoria(null, 'bache', props.disponibles)).toBe('');
    expect(anuncioCategoria('bache', 'bache', props.disponibles)).toBe('');
    expect(anuncioCategoria('inundacion', 'bache', props.disponibles)).toContain(
      'Baches de prueba',
    );
  });
  it('conteos de bandeja piden total tecnico limite1 sin filtros de trabajo', async () => {
    const { consultasConteosCategorias } = await import('./seleccion-panel');
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(new URL(url, 'http://panel'));
        return new Response(
          JSON.stringify({
            type: 'FeatureCollection',
            features: [],
            total: 901,
            total_exacto: false,
          }),
        );
      }),
    );
    const cliente = new QueryClient();
    try {
      const opciones = consultasConteosCategorias('reportes', ['bache', 'inundacion']);
      expect(opciones.map((q) => q.queryKey)).toHaveLength(3);
      const resultado = await cliente.fetchQuery(opciones[1]!);
      expect(resultado).toMatchObject({ total: 901, total_exacto: false });
      expect(urls[0]?.pathname).toBe('/api/v1/tecnico/reportes');
      expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
        categoria: 'bache',
        limite: '1',
      });
    } finally {
      cliente.clear();
    }
  });
});
describe('M5.2 tabla y navegacion', () => {
  it.each([
    'https://ajeno.test/reportes',
    '//ajeno.test/reportes',
    'javascript:alert(1)',
    '/usuarios',
    '/reportes/abc',
    '/reportes?categoria=todas#fuera',
    '/reportes\\otra',
    '/%72eportes',
  ])('rechaza retorno no confiable %s', async (volver) => {
    const { retornoBandeja, urlDetallePanel } = await import('./seleccion-panel');
    expect(retornoBandeja(new URLSearchParams({ volver }))).toBe('/reportes');
    expect(
      new URL(urlDetallePanel('abc', 'todas', volver), 'http://panel').searchParams.has('volver'),
    ).toBe(false);
  });
  it('enlace directo vuelve a bandeja segura y retorno valido conserva filtros', async () => {
    const { retornoBandeja } = await import('./seleccion-panel');
    expect(retornoBandeja(new URLSearchParams())).toBe('/reportes');
    const volver = '/reportes?categoria=todas&estado=nuevo&desde=2026-10-01';
    expect(retornoBandeja(new URLSearchParams({ volver }))).toBe(volver);
  });
  it('sin categoria efectiva deshabilita GeoJSON y quita href de CSV', async () => {
    const Pagina = (await import('@/app/(panel)/reportes/page')).default;
    const cliente = new QueryClient();
    try {
      const html = render(
        createElement(
          ProveedorCategoriasPanel,
          {
            inicial: {
              configuracion: { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO, categorias_activas: [] },
              aviso: null,
            },
          },
          createElement(QueryClientProvider, { client: cliente }, createElement(Pagina)),
        ),
      );
      expect(html).toMatch(/<button[^>]*data-testid="exportar-geojson"[^>]*disabled=""/);
      const csv = html.match(/<a[^>]*data-testid="exportar-csv"[^>]*>/)?.[0] ?? '';
      expect(csv).toContain('aria-disabled="true"');
      expect(csv).not.toContain('href=');
    } finally {
      cliente.clear();
    }
  });
  it('Todas usa columnas comunes y categorias del reporte', () => {
    const html = render(
      createElement(TablaReportes, {
        reportes: [reporteSintetico('bache')],
        categoria: 'todas',
        registro: registroSintetico,
      }),
    );
    expect(html).toContain('Baches de prueba');
    expect(html).not.toContain('<th scope="col">Frecuencia</th>');
    expect(html).not.toContain('Profundidad');
  });
  it('inundacion sola conserva las columnas de agua', () => {
    expect(render(createElement(TablaReportes, { reportes: [reporteSintetico()] }))).toContain(
      '<th scope="col">Frecuencia</th>',
    );
  });
  it('URL publica alias y retorno con categoria sin preferencias locales', async () => {
    const { urlPanel, urlDetallePanel } = await import('./seleccion-panel');
    expect(urlPanel('/indicadores', 'area_verde')).toBe('/indicadores?categoria=area-verde');
    const url = new URL(
      urlDetallePanel('abc', 'todas', '/reportes?categoria=todas&estado=nuevo'),
      'http://panel',
    );
    expect(url.searchParams.get('categoria')).toBe('todas');
    expect(url.searchParams.get('volver')).toBe('/reportes?categoria=todas&estado=nuevo');
  });
});
