import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registroSintetico } from '@/lib/categorias.fixture';
import { type PropsSelectorCategoria, SelectorCategoria } from './SelectorCategoria';

// Ciclo de hooks del componente sin DOM: refs/estado persisten entre renders y efectos se aplican
// despues. F4 verifica la reconciliacion y el anuncio real en Chromium/lector, no este arnes.
const ciclo = vi.hoisted(() => ({
  cursor: 0,
  valores: [] as unknown[],
  efectos: [] as (() => void)[],
}));
vi.mock('@/lib/ciudad-contexto', () => ({ useFormato: () => ({ numero: String }) }));
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
  useEffect: (efecto: () => void) => {
    ciclo.efectos.push(efecto);
  },
}));
function buscar(nodo: ReactNode, testId: string): Record<string, unknown> | undefined {
  for (const hijo of Children.toArray(nodo)) {
    if (!isValidElement<Record<string, unknown>>(hijo)) continue;
    if (hijo.props['data-testid'] === testId) return hijo.props;
    const dentro = buscar(hijo.props.children as ReactNode, testId);
    if (dentro) return dentro;
  }
}
const base: PropsSelectorCategoria = {
  disponibles: registroSintetico.definiciones,
  categoria: 'inundacion',
  conteos: {},
  onCambiar: vi.fn(),
  universo: 'Sintetico',
};
function render(props: PropsSelectorCategoria) {
  ciclo.cursor = 0;
  ciclo.efectos = [];
  SelectorCategoria(props);
  for (const efecto of ciclo.efectos) efecto();
  ciclo.cursor = 0;
  ciclo.efectos = [];
  return SelectorCategoria(props);
}
beforeEach(() => {
  ciclo.cursor = 0;
  ciclo.valores = [];
  ciclo.efectos = [];
});
describe('SelectorCategoria: transiciones de disponibilidad', () => {
  it('mantiene la region durante 2→1→2 y el conteo no repite ni remonta el anuncio', () => {
    expect(buscar(render(base), 'anuncio-categoria-panel')?.children).toBe('');
    expect(
      buscar(render({ ...base, categoria: 'bache' }), 'anuncio-categoria-panel')?.children,
    ).toContain('Baches de prueba');
    const conUna = render({ ...base, categoria: 'bache', disponibles: base.disponibles.slice(1) });
    expect(buscar(conUna, 'anuncio-categoria-panel')).toBeDefined();
    expect(
      buscar(
        render({ ...base, categoria: 'bache', conteos: { bache: { valor: 10, exacto: false } } }),
        'anuncio-categoria-panel',
      )?.children,
    ).toContain('Baches de prueba');
  });
  it('montar con una y pasar a dos sin cambio mantiene el anuncio vacio', () => {
    expect(
      buscar(
        render({ ...base, disponibles: base.disponibles.slice(0, 1) }),
        'anuncio-categoria-panel',
      )?.children,
    ).toBe('');
    expect(buscar(render(base), 'anuncio-categoria-panel')?.children).toBe('');
  });
});
