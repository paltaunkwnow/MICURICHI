import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO, type Indicadores, ReporteFeatureSchema } from 'contracts';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EjecutivoPagina from '@/app/(panel)/ejecutivo/page';
import IndicadoresPagina from '@/app/(panel)/indicadores/page';
import { CriteriosSeveridad } from '@/componentes/ejecutivo/CriteriosSeveridad';
import { categoriaSintetica, registroSintetico, reporteSintetico } from './categorias.fixture';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import {
  consultaAgregadosCompuestos,
  consultaIndicadores,
  consultaMapaEjecutivo,
  consultaResumenEjecutivo,
} from './consultas';
import { resumenDeEjemplo } from './ejecutivo.fixture';
import { urlBandejaUv } from './indicadores-torta';

const navegacion = vi.hoisted(() => ({ url: 'categoria=bache', ruta: '/indicadores' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navegacion.url),
  usePathname: () => navegacion.ruta,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/componentes/Mapa', () => ({
  Mapa: ({ reportes }: { reportes: { geometry: { coordinates: number[] } }[] }) =>
    createElement(
      'p',
      { 'data-testid': 'mapa-sintetico' },
      JSON.stringify(reportes.map((f) => f.geometry.coordinates)),
    ),
}));
const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
const clientes: QueryClient[] = [];
function cliente() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientes.push(qc);
  return qc;
}
function render(
  nodo: ReactNode,
  qc: QueryClient,
  activas: ('inundacion' | 'bache')[] = ['inundacion', 'bache'],
) {
  return renderToStaticMarkup(
    createElement(
      ProveedorCiudad,
      { ciudad },
      createElement(
        ProveedorCategoriasPanel,
        {
          registro: registroSintetico,
          inicial: { configuracion: { ciudad, categorias_activas: activas }, aviso: null },
        },
        createElement(QueryClientProvider, { client: qc }, nodo),
      ),
    ),
  );
}
const indicadores: Indicadores = {
  total: 43,
  por_estado: { nuevo: 3, validado: 38, resuelto: 2, rechazado: 4, duplicado: 1 },
  por_severidad: { baja: 3, media: 38, alta: 1, critica: 1 },
  por_distrito: [],
  por_unidad_vecinal: [
    { unidad_vecinal_id: 'uv:1', nombre: 'UV sintética', distrito_id: 'dm:1', n: 43 },
  ],
  puntos_criticos_recurrentes: 2,
  capas_vigentes: {},
};
afterEach(() => {
  for (const qc of clientes.splice(0)) qc.clear();
  vi.unstubAllGlobals();
  navegacion.url = 'categoria=bache';
  navegacion.ruta = '/indicadores';
});
describe('M5.4 integración de indicadores y ejecutivo', () => {
  it('indicadores consumen categoría en cifras y enlace UV, con selector', () => {
    const qc = cliente();
    qc.setQueryData(consultaIndicadores({ categoria: 'bache' }).queryKey, indicadores);
    const html = render(createElement(IndicadoresPagina), qc);
    expect(html).toContain('aria-label="Elegir categoría"');
    expect(html).toContain('data-testid="indicador-vigentes"');
    expect(html).toContain('UV sintética');
    expect(html).toMatch(/href="[^"]*categoria=bache/);
    expect(html).not.toContain('Inundaciones activas');
  });
  it('enlace UV conserva selección Todas y severidad, nunca vuelve por defecto a agua', () => {
    const url = new URL(urlBandejaUv('uv:1', ['media'], 'todas'), 'http://panel');
    expect(url.searchParams.get('categoria')).toBe('todas');
    expect(url.searchParams.get('severidad')).toBe('media');
  });
  it('ejecutivo Todas usa resumen histórico y mapa público compuesto, rotula parcial e inactivas', () => {
    navegacion.url = 'categoria=todas';
    navegacion.ruta = '/ejecutivo';
    const qc = cliente();
    qc.setQueryData(consultaResumenEjecutivo('todas').queryKey, resumenDeEjemplo());
    const f = ReporteFeatureSchema.parse(reporteSintetico());
    f.geometry.coordinates = [-63.12345, -17.12345];
    qc.setQueryData(consultaMapaEjecutivo(['inundacion', 'bache']).queryKey, {
      completa: false,
      faltantes: ['bache'],
      features: [f],
      total: null,
    });
    const html = render(createElement(EjecutivoPagina), qc);
    expect(html).toContain('Reportes activos por distrito');
    expect(html).toContain('categorías inactivas');
    expect(html).toContain('Mapa parcial');
    expect(html).toContain('-63.12345');
    expect(html).not.toContain('ejecutivo-formula');
    expect(html).not.toContain('Exportar');
    expect(html).not.toContain('selector-periodo');
  });
  it('ejecutivo concreto usa su definición sin fórmula/rango de inundación', () => {
    navegacion.ruta = '/ejecutivo';
    const qc = cliente();
    qc.setQueryData(consultaResumenEjecutivo('bache').queryKey, resumenDeEjemplo());
    const html = render(createElement(EjecutivoPagina), qc);
    expect(html).toContain('Baches de prueba');
    expect(html).toContain('Reportes activos por distrito');
    expect(html).toContain(categoriaSintetica.notaMetodologica);
    expect(html).not.toMatch(/inundaciones activas|profundidad|de 13 puntos/i);
  });
  it('criterios genéricos identifican versión disponible, sin recalcular ni atribuir modelo histórico', () => {
    const html = render(
      createElement(CriteriosSeveridad, {
        categoria: 'bache',
        registro: registroSintetico,
        pestana: 'critica',
        onCambiarPestana: vi.fn(),
      }),
      cliente(),
    );
    expect(html).toContain('definición disponible');
    expect(html).toContain('9');
    expect(html).toContain('Crítica');
    expect(html).not.toMatch(/profundidad|puntaje =/i);
  });
  it('cero categorías no presenta resumen cacheado ni ceros de inventario', () => {
    navegacion.url = '';
    navegacion.ruta = '/ejecutivo';
    const qc = cliente();
    qc.setQueryData(consultaResumenEjecutivo().queryKey, resumenDeEjemplo());
    const html = render(createElement(EjecutivoPagina), qc, []);
    expect(html).not.toContain('data-testid="ejecutivo-total"');
    expect(html).toContain('No hay categorías disponibles');
  });
  it('UV incompatibles por identidad territorial no se suman', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify([
              {
                unidad_vecinal_id: 'uv:1',
                codigo: '1',
                nombre: url.includes('bache') ? 'Otra UV' : 'UV 1',
                distrito_id: 'dm:1',
                n_reportes: 2,
                n_verificados: 1,
                n_puntos_criticos: 0,
              },
            ]),
          ),
      ),
    );
    const r = await cliente().fetchQuery(consultaAgregadosCompuestos(['inundacion', 'bache']));
    expect(r.completa).toBe(false);
    expect(r.agregados).toEqual([]);
  });
});
