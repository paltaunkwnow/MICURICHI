import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import PaginaReportes from '@/app/(panel)/reportes/page';
import { reporteSintetico } from './categorias.fixture';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import { consultaReportes } from './consultas';
import { FILTROS_VACIOS, parametrosConsulta, parametrosExportacion } from './filtros';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/reportes',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/componentes/Mapa', () => ({
  Mapa: ({ reportes }: { reportes: unknown[] }) =>
    createElement('p', null, `PUNTOS_SINTETICOS:${reportes.length}`),
}));
it('transición Inundación→cero con caché real retira tabla/mapa/KPI sin borrar la caché', () => {
  const qc = new QueryClient();
  const f = reporteSintetico();
  f.properties.descripcion = 'FILA_CACHE_NO_DEBE_QUEDAR';
  const filtros = { ...FILTROS_VACIOS, categoria: 'inundacion' };
  const opciones = [
    consultaReportes(parametrosConsulta(filtros)),
    consultaReportes({ ...parametrosExportacion(filtros), limite: '500' }),
    consultaReportes({ estado: 'nuevo', limite: '1', categoria: 'inundacion' }),
    consultaReportes({
      estado: 'nuevo',
      severidad: 'critica',
      limite: '1',
      categoria: 'inundacion',
    }),
  ];
  for (const q of opciones)
    qc.setQueryData(q.queryKey, {
      type: 'FeatureCollection',
      features: [f],
      total: 7791,
      pagina: 1,
      limite: 50,
    });
  const render = (activas: 'inundacion'[]) =>
    renderToStaticMarkup(
      createElement(
        ProveedorCiudad,
        { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO },
        createElement(
          ProveedorCategoriasPanel,
          {
            inicial: {
              configuracion: {
                ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
                categorias_activas: activas,
              },
              aviso: null,
            },
          },
          createElement(QueryClientProvider, { client: qc }, createElement(PaginaReportes)),
        ),
      ),
    );
  try {
    expect(render(['inundacion'])).toContain(`data-id="${f.properties.id}"`);
    const cero = render([]);
    expect(cero).toContain('No hay categorías disponibles');
    expect(cero).not.toContain(`data-id="${f.properties.id}"`);
    expect(cero).toContain('PUNTOS_SINTETICOS:0');
    expect(cero).not.toMatch(/7[. ,]?791/);
    expect(cero).not.toContain('0 reportes con los filtros actuales');
    expect(cero).not.toContain('No hay reportes con estos filtros');
    expect(cero).not.toContain('Cargando reportes');
    expect(cero).not.toContain('Paginación de la tabla');
    expect(cero).toContain('Sin categoría seleccionada');
    expect(cero).toMatch(/data-testid="exportar-geojson"[^>]*disabled/);
    expect(qc.getQueryData(opciones[0]!.queryKey)).toMatchObject({ total: 7791 });
  } finally {
    qc.clear();
  }
});
