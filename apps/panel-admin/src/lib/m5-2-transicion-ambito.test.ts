import { environmentManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useCategoriaPanel } from './categoria-panel';
import { registroSintetico } from './categorias.fixture';
import { consultaReportes } from './consultas';
import { filtrosDelAmbitoPanel, parametrosConsulta } from './filtros';

const ciclo = vi.hoisted(() => ({
  cursor: 0,
  valores: [] as unknown[],
  efectos: [] as (() => void)[],
  slugs: ['inundacion', 'bache'],
  url: 'severidad=critica&pagina=4&desde=2026-10-01&estado=nuevo&distrito_id=DM1',
  reemplazos: [] as string[],
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (inicial: unknown) => {
    const i = ciclo.cursor++;
    if (!(i in ciclo.valores)) ciclo.valores[i] = { current: inicial };
    return ciclo.valores[i];
  },
  useState: (inicial: unknown) => {
    const i = ciclo.cursor++;
    if (!(i in ciclo.valores)) ciclo.valores[i] = inicial;
    return [
      ciclo.valores[i],
      (v: unknown) => {
        ciclo.valores[i] = v;
      },
    ];
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => ciclo.efectos.push(fn),
}));
vi.mock('./categorias-contexto', () => ({
  useCategoriasPanel: () => ({
    estado: { configuracion: {}, aviso: null },
    registro: registroSintetico,
    disponibles: registroSintetico.definiciones.filter((d) => ciclo.slugs.includes(d.slug)),
  }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(ciclo.url),
  usePathname: () => '/reportes',
  useRouter: () => ({ replace: (ruta: string) => ciclo.reemplazos.push(ruta) }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  environmentManager.setIsServer(() => typeof window === 'undefined');
  ciclo.valores = [];
  ciclo.cursor = 0;
  ciclo.slugs = ['inundacion', 'bache'];
});
function renderHook() {
  ciclo.cursor = 0;
  ciclo.efectos = [];
  // biome-ignore lint/correctness/useHookAtTopLevel: arnés del ciclo de hooks; las refs persisten entre renders y las consultas sí usan QueryObserver real.
  return useCategoriaPanel();
}
it('cambio implícito por configuración limpia la primera consulta observada y la URL, conservando zona/estado/fecha', async () => {
  environmentManager.setIsServer(() => false);
  vi.stubGlobal('document', { visibilityState: 'visible' });
  const pedidos: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: string) => {
      pedidos.push(new URL(entrada, 'http://panel'));
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [], total: 0 }));
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const anterior = renderHook();
  const q1 = consultaReportes(
    parametrosConsulta(filtrosDelAmbitoPanel(new URLSearchParams(ciclo.url), anterior)),
  );
  const observer = new QueryObserver(qc, q1);
  const baja = observer.subscribe(() => {});
  try {
    await qc.fetchQuery(q1);
    ciclo.slugs = ['bache'];
    const siguiente = renderHook();
    const q2 = consultaReportes(
      parametrosConsulta(filtrosDelAmbitoPanel(new URLSearchParams(ciclo.url), siguiente)),
    );
    observer.setOptions(q2);
    await qc.fetchQuery(q2);
    const primeraBache = pedidos.find((p) => p.searchParams.get('categoria') === 'bache')!;
    expect(primeraBache).toBeDefined();
    expect(primeraBache.searchParams.get('severidad')).toBeNull();
    expect(primeraBache.searchParams.get('pagina')).toBe('1');
    expect(primeraBache.searchParams.get('desde')).toBe('2026-10-01');
    expect(primeraBache.searchParams.get('estado')).toBe('nuevo');
    expect(primeraBache.searchParams.get('distrito_id')).toBe('DM1');
    for (const efecto of ciclo.efectos) efecto();
    expect(ciclo.reemplazos.at(-1)).not.toContain('severidad=');
    expect(ciclo.reemplazos.at(-1)).not.toContain('pagina=4');
  } finally {
    baja();
    qc.clear();
  }
});
