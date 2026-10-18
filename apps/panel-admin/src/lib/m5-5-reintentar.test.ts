import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import PaginaEjecutivo from '@/app/(panel)/ejecutivo/page';
import type { PropsPanelEjecutivo } from '@/componentes/ejecutivo/PanelEjecutivo';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import { consultaResumenEjecutivo } from './consultas';

const interaccion = vi.hoisted(() => ({ props: null as PropsPanelEjecutivo | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/ejecutivo',
}));
vi.mock('@/componentes/ejecutivo/PanelEjecutivo', async (original) => {
  const real = await original<typeof import('@/componentes/ejecutivo/PanelEjecutivo')>();
  return {
    ...real,
    PanelEjecutivo: (props: PropsPanelEjecutivo) => {
      interaccion.props = props;
      return createElement(real.PanelEjecutivo, props);
    },
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  interaccion.props = null;
});
it('resumen con error precargado → cero categorías → Reintentar no hace fetch ni usa Inundación por defecto', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ codigo: 'SINTETICO', mensaje: 'Fallo sintético' }), {
        status: 500,
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
  const render = (categorias: 'inundacion'[]) =>
    renderToStaticMarkup(
      createElement(
        ProveedorCiudad,
        { ciudad },
        createElement(
          ProveedorCategoriasPanel,
          { inicial: { configuracion: { ciudad, categorias_activas: categorias }, aviso: null } },
          createElement(QueryClientProvider, { client: qc }, createElement(PaginaEjecutivo)),
        ),
      ),
    );
  try {
    await qc.fetchQuery(consultaResumenEjecutivo()).catch(() => undefined);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(render(['inundacion'])).toContain('Reintentar');
    const sinCategorias = render([]);
    expect(sinCategorias).toContain('No hay categorías disponibles');
    interaccion.props?.onReintentar();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sinCategorias).toMatch(/<button[^>]*disabled=""[^>]*>Reintentar<\/button>/);
  } finally {
    qc.clear();
  }
});
