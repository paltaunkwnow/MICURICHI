import { QueryClient } from '@tanstack/react-query';
import { isValidElement, type ReactElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import PaginaEjecutivo from '@/app/(panel)/ejecutivo/page';
import { PanelEjecutivo, type PropsPanelEjecutivo } from '@/componentes/ejecutivo/PanelEjecutivo';
import { consultaResumenEjecutivo } from './consultas';
import { resumenDeEjemplo } from './ejecutivo.fixture';

const ciclo = vi.hoisted(() => ({
  cursor: 0,
  valores: [] as unknown[],
  categoria: 'inundacion',
  cache: null as QueryClient | null,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
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
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: (q: { queryKey: readonly unknown[] }) => ({
    data: ciclo.cache?.getQueryData(q.queryKey),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('./categoria-panel', () => ({
  useCategoriaPanel: () => ({
    categoria: ciclo.categoria,
    disponibles: [],
    aviso: null,
    registro: { obtener: () => undefined },
  }),
}));
afterEach(() => {
  ciclo.cache?.clear();
  ciclo.cache = null;
  ciclo.valores = [];
  ciclo.cursor = 0;
});
function renderContenido(): PropsPanelEjecutivo {
  ciclo.cursor = 0;
  const pagina = PaginaEjecutivo();
  const contenido = (pagina.props as { children: ReactElement }).children;
  const arbol = (contenido.type as () => ReactElement)();
  const panel = (arbol.props as { children: ReactElement[] }).children.find(
    (n) => isValidElement(n) && n.type === PanelEjecutivo,
  );
  if (!panel) throw Error('Panel ausente');
  return panel.props as PropsPanelEjecutivo;
}
it.each([
  ['inundacion', 'bache'],
  ['todas', 'inundacion'],
])('estado persistente %s→%s→origen reinicia severidad aun con respuesta cacheada', (a, b) => {
  ciclo.cache = new QueryClient();
  for (const categoria of [a, b])
    ciclo.cache.setQueryData(consultaResumenEjecutivo(categoria).queryKey, resumenDeEjemplo());
  ciclo.categoria = a;
  renderContenido().onCambiarPestana('critica');
  expect(renderContenido().pestana).toBe('critica');
  ciclo.categoria = b;
  expect(renderContenido().pestana).toBe('todas');
  // No se elige ninguna severidad en B; volver usa el mismo estado y caché de A.
  ciclo.categoria = a;
  const vuelta = renderContenido();
  expect(vuelta.resumen).toEqual(resumenDeEjemplo());
  expect(vuelta.pestana).toBe('todas');
});
