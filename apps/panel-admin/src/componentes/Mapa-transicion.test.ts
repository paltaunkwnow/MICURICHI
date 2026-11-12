import { CONFIG_DOMINIO } from 'contracts';
import { beforeEach, expect, it, vi } from 'vitest';
import { reporteSintetico } from '@/lib/categorias.fixture';
import { Mapa, type PropsMapa } from './Mapa';

const ciclo = vi.hoisted(() => ({
  cursor: 0,
  valores: [] as unknown[],
  deps: [] as (readonly unknown[] | undefined)[],
  efectos: [] as (() => void)[],
  eventos: {} as Record<string, () => void>,
  setData: vi.fn(),
  fitBounds: vi.fn(),
  centro: [-63.2, -17.7],
  zoom: 12,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (inicial: unknown) => {
    const i = ciclo.cursor++;
    if (!(i in ciclo.valores)) ciclo.valores[i] = { current: i === 0 ? {} : inicial };
    return ciclo.valores[i];
  },
  useState: (inicial: unknown) => {
    const i = ciclo.cursor++;
    if (!(i in ciclo.valores)) ciclo.valores[i] = inicial;
    return [
      ciclo.valores[i],
      (v: unknown) => {
        ciclo.valores[i] = typeof v === 'function' ? v(ciclo.valores[i]) : v;
      },
    ];
  },
  useEffect: (fn: () => void, deps?: readonly unknown[]) => {
    const i = ciclo.cursor++;
    const prev = ciclo.deps[i];
    if (!prev || !deps || deps.some((d, j) => !Object.is(d, prev[j]))) ciclo.efectos.push(fn);
    ciclo.deps[i] = deps;
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/lib/ciudad-contexto', () => ({ useCiudad: () => CONFIG_DOMINIO.CIUDAD_POR_DEFECTO }));
vi.mock('@/lib/worker-maplibre', () => ({ configurarWorkerDeMapLibre: vi.fn() }));
vi.mock('@/lib/accesibilidad-mapa', () => ({ etiquetarControlesDelMapa: vi.fn() }));
vi.mock('@/lib/capas-mapa', () => ({
  aplicarCapas: vi.fn(),
  ajustarVisibilidadCapas: vi.fn(),
  detectorDeCapaCambiada: () => vi.fn(),
  recargarCapasMapa: vi.fn(),
}));
vi.mock('maplibre-gl', () => ({
  Map: class {
    addControl() {}
    addSource() {}
    addLayer() {}
    setFilter() {}
    remove() {}
    on(evento: string, ...args: unknown[]) {
      if (evento === 'load') ciclo.eventos.load = args[0] as () => void;
    }
    getLayer() {
      return true;
    }
    getSource() {
      return { setData: ciclo.setData };
    }
    fitBounds(...args: unknown[]) {
      ciclo.fitBounds(...args);
      ciclo.centro = [-63.9, -17.9];
      ciclo.zoom = 16;
    }
  },
  NavigationControl: class {},
  LngLatBounds: class {
    extend() {
      return this;
    }
  },
}));
function render(props: PropsMapa) {
  ciclo.cursor = 0;
  ciclo.efectos = [];
  Mapa(props);
  for (const fn of ciclo.efectos) fn();
}
beforeEach(() => {
  ciclo.cursor = 0;
  ciclo.valores = [];
  ciclo.deps = [];
  ciclo.efectos = [];
  ciclo.eventos = {};
  ciclo.setData.mockClear();
  ciclo.fitBounds.mockClear();
});
it('A→B cacheada→B fresca actualiza fuente sin fitBounds ni pérdida de centro/zoom; acción explícita permite encuadrar', () => {
  const a = reporteSintetico();
  const b = reporteSintetico('bache');
  const fresca = reporteSintetico('bache');
  fresca.properties.id = 'bbbbbbbb-0000-4000-8000-000000000002';
  fresca.geometry.coordinates = [-63.5, -17.5];
  render({ ambito: 'inundacion', reportes: [a], ajustarAPuntos: true });
  ciclo.eventos.load?.();
  ciclo.centro = [-63.2, -17.7];
  ciclo.zoom = 12;
  ciclo.fitBounds.mockClear();
  render({ ambito: 'bache', reportes: [b], ajustarAPuntos: true });
  render({ ambito: 'bache', reportes: [fresca], ajustarAPuntos: true });
  expect(ciclo.setData.mock.calls.at(-1)?.[0].features[0].properties.id).toBe(fresca.properties.id);
  expect(ciclo.fitBounds).not.toHaveBeenCalled();
  expect(ciclo.centro).toEqual([-63.2, -17.7]);
  expect(ciclo.zoom).toBe(12);
  render({ ambito: 'bache', reportes: [fresca], ajustarAPuntos: false });
  render({ ambito: 'bache', reportes: [fresca], ajustarAPuntos: true });
  expect(ciclo.fitBounds).toHaveBeenCalledTimes(1);
  ciclo.fitBounds.mockClear();
  render({ ambito: 'todas', claveEncuadre: 'uv1', reportes: [fresca], ajustarAPuntos: true });
  render({ ambito: 'todas', claveEncuadre: 'uv1', reportes: [fresca], ajustarAPuntos: true });
  expect(ciclo.fitBounds).not.toHaveBeenCalled();
  render({ ambito: 'todas', claveEncuadre: 'uv2', reportes: [fresca], ajustarAPuntos: true });
  expect(ciclo.fitBounds).toHaveBeenCalledTimes(1);
});
