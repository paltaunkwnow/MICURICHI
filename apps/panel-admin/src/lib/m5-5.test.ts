import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO, textosDeCategoria } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Detalle from '@/app/(panel)/reportes/[id]/page';
import { PanelAcciones } from '@/componentes/PanelAcciones';
import {
  generarTextoReporteUnitario,
  ReporteUnitarioModal,
} from '@/componentes/ReporteUnitarioModal';
import { ErrorApi, fusionarReporte } from './api';
import { categoriaSintetica, registroSintetico, reporteSintetico } from './categorias.fixture';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import { crearLectorDeConfiguracion, REVALIDAR_MS } from './configuracion';
import {
  consultaAgregadosCompuestos,
  consultaCandidatosFusion,
  consultaReporte,
} from './consultas';
import { presentarReporte } from './presentacion-reporte';

const id = 'aaaaaaaa-0000-4000-8000-000000000001';
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
  useSearchParams: () =>
    new URLSearchParams('categoria=todas&volver=%2Freportes%3Fcategoria%3Dtodas%26estado%3Dnuevo'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/reportes',
}));
vi.mock('./sesion', () => ({ useUsuarioActual: () => ({ rol: 'tecnico' }) }));
vi.mock('@/componentes/Mapa', () => ({ Mapa: () => null }));
afterEach(() => vi.unstubAllGlobals());
const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
function render(nodo: ReturnType<typeof createElement>, qc = new QueryClient()) {
  return renderToStaticMarkup(
    createElement(
      ProveedorCiudad,
      { ciudad },
      createElement(
        ProveedorCategoriasPanel,
        {
          registro: registroSintetico,
          inicial: {
            configuracion: { ciudad, categorias_activas: ['inundacion', 'bache'] },
            aviso: null,
          },
        },
        createElement(QueryClientProvider, { client: qc }, nodo),
      ),
    ),
  );
}
describe('M5.5 cierre de integración de ficha y ámbitos', () => {
  it('renovación automática de configuración pública omite credenciales y conserva consulta manual de datos autenticada', async () => {
    let ahora = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (entrada) =>
        new Response(
          JSON.stringify(
            String(entrada).includes('/configuracion')
              ? { ciudad, categorias_activas: ['inundacion'] }
              : reporteSintetico(),
          ),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const leer = crearLectorDeConfiguracion({
      urlBase: () => '',
      ahora: () => ahora,
      inicial: { configuracion: { ciudad, categorias_activas: ['inundacion'] }, aviso: null },
      esperarRenovacion: true,
    });
    ahora = REVALIDAR_MS;
    await leer();
    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('omit');
    const qc = new QueryClient();
    try {
      await qc.fetchQuery(consultaReporte(id));
      expect(fetch.mock.calls[1]?.[1]?.credentials).toBe('same-origin');
      expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).has('x-curichi-sondeo')).toBe(false);
    } finally {
      qc.clear();
    }
  });
  it('fixture sintética no hereda textos de agua por defecto', () => {
    expect(JSON.stringify(textosDeCategoria(categoriaSintetica))).not.toMatch(/agua|inundaci/i);
    expect(categoriaSintetica.preguntaUbicacion).not.toMatch(/agua/i);
  });
  it('detalle real por ID llegado desde Todas usa la definición de origen y retorno', () => {
    const qc = new QueryClient();
    qc.setQueryData(consultaReporte(id).queryKey, reporteSintetico('bache'));
    try {
      const html = render(createElement(Detalle), qc);
      expect(html).toContain('Hueco en la vía');
      expect(html).toContain('Calzada de prueba');
      expect(html).toContain('mantenimiento vial');
      expect(html).toContain('href="/reportes?categoria=todas&amp;estado=nuevo"');
      expect(html).not.toMatch(/profundidad|sumidero|puntaje =/i);
    } finally {
      qc.clear();
    }
  });
  it('fusión integrada en PanelAcciones consulta origen aunque navegación sea Todas', () => {
    const qc = new QueryClient();
    const propio = reporteSintetico('bache');
    const bache = reporteSintetico('bache');
    bache.properties.estado = 'validado';
    bache.properties.id = 'bbbbbbbb-0000-4000-8000-000000000002';
    const agua = reporteSintetico();
    agua.properties.estado = 'validado';
    agua.properties.id = 'cccccccc-0000-4000-8000-000000000003';
    qc.setQueryData(
      consultaCandidatosFusion({ lon: -63.18, lat: -17.78 }, 100, true, 'bache').queryKey,
      { type: 'FeatureCollection', features: [bache, agua], total: 2, pagina: 1, limite: 100 },
    );
    try {
      const html = render(
        createElement(PanelAcciones, {
          reporte: propio,
          rol: 'tecnico',
          accionInicial: 'fusionar',
        }),
        qc,
      );
      expect(html).toContain(`data-id="${bache.properties.id}"`);
      expect(html).not.toContain(`data-id="${agua.properties.id}"`);
    } finally {
      qc.clear();
    }
  });
  it('409 del servidor se conserva sin otra fusión alternativa ni reintentos', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            codigo: 'FUSION_ENTRE_CATEGORIAS',
            mensaje: 'Las categorías no coinciden.',
          }),
          { status: 409 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const error = await fusionarReporte(id, {
      canonico_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      motivo: 'Prueba sintética',
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ estado: 409, codigo: 'FUSION_ENTRE_CATEGORIAS' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('incompatible no rescata nota ni fórmula de agua aunque el slug sea inundación', () => {
    const f = reporteSintetico();
    f.properties.detalle = {};
    const vista = presentarReporte(f.properties, registroSintetico);
    expect(vista.aviso).toBeTruthy();
    expect(vista.nota).not.toMatch(/agua|profundidad|anegamiento/i);
  });
  it('TXT y ficha imprimible completos conservan trazabilidad, ubicación y reclasificación de otra categoría', () => {
    const f = reporteSintetico('bache');
    f.properties.autor_id = 'dddddddd-0000-4000-8000-000000000004';
    f.properties.fusionado_en_id = 'bbbbbbbb-0000-4000-8000-000000000002';
    f.properties.severidad_manual = 'alta';
    f.properties.severidad_motivo = 'Reclasificación sintética';
    const txt = generarTextoReporteUnitario(
      f,
      { fechaHora: (s) => s ?? '—', numero: String },
      ciudad,
      registroSintetico,
    );
    const html = render(
      createElement(ReporteUnitarioModal, {
        reporte: f,
        registro: registroSintetico,
        onCerrar: vi.fn(),
      }),
    );
    for (const contenido of [txt, html]) {
      expect(contenido).toContain('SINTETICA');
      expect(contenido).toContain(f.properties.autor_id);
      expect(contenido).toContain(f.properties.fusionado_en_id);
      expect(contenido).toContain('Reclasificación sintética');
      expect(contenido).toContain('Hueco en la vía');
    }
  });
  it('ranking UV compuesto ordena los totales combinados, no la primera categoría', async () => {
    const fila = (id: string, n: number) => ({
      unidad_vecinal_id: id,
      codigo: id,
      nombre: id,
      distrito_id: 'dm1',
      n_reportes: n,
      n_verificados: 1,
      n_puntos_criticos: 0,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes('bache') ? [fila('uv1', 10)] : [fila('uv2', 3), fila('uv1', 1)],
            ),
          ),
      ),
    );
    const qc = new QueryClient();
    try {
      const r = await qc.fetchQuery(consultaAgregadosCompuestos(['inundacion', 'bache']));
      expect(r.agregados.map((u) => u.unidad_vecinal_id)).toEqual(['uv1', 'uv2']);
    } finally {
      qc.clear();
    }
  });
});
