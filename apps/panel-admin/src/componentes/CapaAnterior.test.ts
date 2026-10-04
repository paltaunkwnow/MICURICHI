import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO, type Indicadores, type ResumenEjecutivo } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaginaIndicadores from '@/app/(panel)/indicadores/page';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { consultaIndicadores, consultaResumenEjecutivo } from '@/lib/consultas';
import { resumenDeEjemplo } from '@/lib/ejecutivo.fixture';

// La página de indicadores lee los filtros de las tortas desde la URL (useSearchParams) y navega
// con el router; acá se renderiza suelta con renderToStaticMarkup, sin el router de Next, así que
// se simula next/navigation con una URL vacía (ningún filtro) y un router inerte. vitest sube este
// `vi.mock` por encima de los imports, así que alcanza a la página y a la torta antes de montarlas.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => '/indicadores',
}));

/** Indicadores SINTÉTICOS, solo para que la página tenga qué dibujar. */
const INDICADORES: Indicadores = {
  total: 12,
  por_estado: { nuevo: 3, validado: 7, resuelto: 2, rechazado: 4, duplicado: 1 },
  por_severidad: { baja: 5, media: 4, alta: 2, critica: 1 },
  por_distrito: [],
  por_unidad_vecinal: [],
  puntos_criticos_recurrentes: 2,
  capas_vigentes: {},
};

let cliente: QueryClient | null = null;
afterEach(() => {
  cliente?.clear();
  cliente = null;
});

/** La página tal como la monta la app, con las respuestas ya en la caché de TanStack. */
function renderIndicadores(resumen: ResumenEjecutivo | undefined): string {
  cliente = new QueryClient();
  cliente.setQueryData(consultaIndicadores().queryKey, INDICADORES);
  if (resumen) cliente.setQueryData(consultaResumenEjecutivo().queryKey, resumen);
  return renderToStaticMarkup(
    createElement(
      ProveedorCiudad,
      { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO },
      createElement(QueryClientProvider, { client: cliente }, createElement(PaginaIndicadores)),
    ),
  );
}

describe('«De una capa anterior» en Indicadores', () => {
  it('la tabla se mudó del panel ejecutivo a Indicadores, con el código completo y sus conteos', () => {
    const html = renderIndicadores(resumenDeEjemplo());
    const inicio = html.indexOf('data-testid="indicadores-capa-anterior"');
    expect(inicio).toBeGreaterThan(-1);
    const seccion = html.slice(inicio, html.indexOf('</section>', inicio));
    expect(seccion).toContain('De una capa anterior');
    expect(seccion).toContain('DM-01 · Distrito 1 (capa 2024)');
    // Activas, en revisión, validados y resueltos del distrito de la capa 2024 (fixture).
    const celdas = [...seccion.matchAll(/<td class="numero">(\d+)<\/td>/g)].map((m) => m[1]);
    expect(celdas).toEqual(['40', '15', '25', '5']);
    // Los distritos vigentes no se repiten acá.
    expect(seccion).not.toContain('>D01 ·');
  });

  it('sin distritos de una capa anterior la sección no aparece', () => {
    const r = resumenDeEjemplo();
    const html = renderIndicadores({
      ...r,
      por_distrito: r.por_distrito.filter((d) => d.en_capa_vigente),
    });
    expect(html).toContain('data-testid="indicador-vigentes"');
    expect(html).not.toContain('indicadores-capa-anterior');
    expect(html).not.toContain('De una capa anterior');
  });
});
