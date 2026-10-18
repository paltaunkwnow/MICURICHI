import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type ReporteFeatureCollection,
} from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { obtenerReportesPublicos } from './api';
import { ProveedorCategoriasPanel, useCategoriasPanel } from './categorias-contexto';
import { crearLectorDeConfiguracion, REVALIDAR_MS } from './configuracion';
import {
  consultaAgregadosCompuestos,
  consultaIndicadores,
  consultaMapaEjecutivo,
  consultaReportes,
  consultaResumenEjecutivo,
} from './consultas';
import {
  cambiarCategoriaFiltros,
  disponiblesPanel,
  FILTROS_VACIOS,
  filtrosDelAmbitoPanel,
  leerFiltros,
  parametrosConsulta,
  parametrosExportacion,
  resolverCategoriaPanel,
  serializarFiltros,
} from './filtros';

const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
const registro = crearRegistroCategorias([
  DEFINICION_INUNDACION,
  { ...DEFINICION_INUNDACION, slug: 'bache', nombre: 'Baches' },
]);
const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('M5.1: configuración completa y disponibilidad cerrada', () => {
  it('conserva ciudad, categorías y orden; lecturas simultáneas comparten consulta', async () => {
    const pedir = vi.fn(async () =>
      respuesta({ ciudad, categorias_activas: ['bache', 'inundacion'] }),
    );
    const leer = crearLectorDeConfiguracion({ urlBase: () => 'http://api', pedir });
    const [a, b] = await Promise.all([leer(), leer()]);
    expect(a).toEqual({
      configuracion: { ciudad, categorias_activas: ['bache', 'inundacion'] },
      aviso: null,
    });
    expect(b).toEqual(a);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('una renovación fallida conserva la última configuración válida y avisa', async () => {
    let ahora = 0;
    const pedir = vi
      .fn()
      .mockResolvedValueOnce(respuesta({ ciudad, categorias_activas: ['bache'] }))
      .mockRejectedValue(new Error('sin conexión'));
    const leer = crearLectorDeConfiguracion({
      urlBase: () => 'http://api',
      pedir,
      ahora: () => ahora,
      registrar: vi.fn(),
    });
    await leer();
    ahora = REVALIDAR_MS;
    await leer();
    await new Promise((r) => setTimeout(r, 0));
    const estado = await leer();
    expect(estado.configuracion?.categorias_activas).toEqual(['bache']);
    expect(estado.aviso).toMatch(/última/i);
  });

  it.each([undefined, null, { ciudad }, { ciudad, categorias_activas: 'inundacion' }])(
    'sin respuesta completa válida (%j) no inventa categorías y vuelve a intentar',
    async (cuerpo) => {
      const pedir = vi.fn(async () => respuesta(cuerpo ?? {}));
      const leer = crearLectorDeConfiguracion({
        urlBase: () => 'http://api',
        pedir,
        registrar: vi.fn(),
      });
      expect((await leer()).configuracion).toBeNull();
      expect((await leer()).aviso).toBeTruthy();
      expect(pedir).toHaveBeenCalledTimes(2);
    },
  );

  it('cero explícito es configuración válida sin respaldo activo', async () => {
    const leer = crearLectorDeConfiguracion({
      urlBase: () => 'http://api',
      pedir: async () => respuesta({ ciudad, categorias_activas: [] }),
    });
    expect((await leer()).configuracion?.categorias_activas).toEqual([]);
  });
  it('SSR espera la renovación fallida y el cliente recibe el aviso sin cinco minutos adicionales', async () => {
    let ahora = 0;
    const pedir = vi
      .fn()
      .mockResolvedValueOnce(respuesta({ ciudad, categorias_activas: ['bache'] }))
      .mockRejectedValue(new Error('caído'));
    const servidor = crearLectorDeConfiguracion({
      urlBase: () => 'http://api',
      pedir,
      ahora: () => ahora,
      esperarRenovacion: true,
      registrar: vi.fn(),
    });
    await servidor();
    ahora = REVALIDAR_MS;
    const ssr = await servidor();
    expect(ssr.aviso).toMatch(/última/i);
    const cliente = crearLectorDeConfiguracion({
      urlBase: () => '',
      inicial: ssr,
      pedir: vi.fn(),
      esperarRenovacion: true,
    });
    expect(await cliente()).toEqual(ssr);
  });

  it('intersecta activo y registro inyectado en orden recibido, sin duplicados', () => {
    expect(
      disponiblesPanel(
        { ciudad, categorias_activas: ['bache', 'basura', 'inundacion', 'bache'] },
        registro,
      ).map((d) => d.slug),
    ).toEqual(['bache', 'inundacion']);
    expect(disponiblesPanel({ ciudad, categorias_activas: [] }, registro)).toEqual([]);
    expect(disponiblesPanel(null, registro)).toEqual([]);
    expect(disponiblesPanel({ ciudad }, registro)).toEqual([]);
  });
  it.each([{ activas: [] }, { activas: ['bache', 'inundacion'] }])(
    'el proveedor real respeta categorías $activas y el registro inyectado',
    ({ activas }) => {
      function Sonda() {
        return createElement(
          'span',
          null,
          useCategoriasPanel()
            .disponibles.map((d) => d.slug)
            .join(','),
        );
      }
      const html = renderToStaticMarkup(
        createElement(
          ProveedorCategoriasPanel,
          {
            inicial: { configuracion: { ciudad, categorias_activas: activas }, aviso: null },
            registro,
          },
          createElement(Sonda),
        ),
      );
      expect(html).toBe(`<span>${activas.join(',')}</span>`);
    },
  );
});

describe('M5.1: URL del panel, sin preferencia del mapa', () => {
  it('inicia en Inundaciones disponible aunque el orden recibido sea otro', () => {
    expect(resolverCategoriaPanel(null, ['bache', 'inundacion']).categoria).toBe('inundacion');
    expect(resolverCategoriaPanel(null, ['bache']).categoria).toBe('bache');
  });
  it('todas solo opera con dos o más; con una canonicaliza y avisa', () => {
    expect(resolverCategoriaPanel('todas', ['bache', 'inundacion']).categoria).toBe('todas');
    const unica = resolverCategoriaPanel('todas', ['inundacion']);
    expect(unica.categoria).toBe('inundacion');
    expect(unica.aviso).toBeTruthy();
    expect(unica.canonicalizar).toBe(true);
    expect(resolverCategoriaPanel('todas', []).categoria).toBeNull();
  });
  it.each(['BACHES', 'baches'])('normaliza el alias %s y restaura el slug en URL', (alias) => {
    expect(resolverCategoriaPanel(alias, ['inundacion', 'bache'])).toMatchObject({
      categoria: 'bache',
      canonicalizar: true,
    });
  });
  it('una URL inválida avisa y cero disponible no habilita ninguna petición', () => {
    expect(resolverCategoriaPanel('inventada', ['inundacion'])).toMatchObject({
      categoria: 'inundacion',
      canonicalizar: true,
    });
    expect(resolverCategoriaPanel('inventada', ['inundacion']).aviso).toBeTruthy();
    expect(resolverCategoriaPanel(null, []).categoria).toBeNull();
  });
  it('configuración desconocida conserva la solicitud URL hasta recuperar configuración completa', () => {
    const url = new URLSearchParams('categoria=bache&severidad=alta&pagina=3');
    expect(resolverCategoriaPanel(url.get('categoria'), [], false)).toMatchObject({
      categoria: null,
      canonicalizar: false,
    });
    expect(url.get('categoria')).toBe('bache');
    expect(
      resolverCategoriaPanel(url.get('categoria'), ['inundacion', 'bache'], true),
    ).toMatchObject({ categoria: 'bache', canonicalizar: false, cambioAmbito: false });
    expect(resolverCategoriaPanel('bache', ['inundacion'], true).cambioAmbito).toBe(true);
    expect(resolverCategoriaPanel('BACHES', ['inundacion', 'bache'], true).cambioAmbito).toBe(
      false,
    );
  });
  it('area_verde interna usa area-verde en URL y no canonicaliza en bucle', () => {
    const filtros = cambiarCategoriaFiltros(FILTROS_VACIOS, 'area_verde');
    const url = serializarFiltros(filtros);
    expect(url.get('categoria')).toBe('area-verde');
    expect(
      resolverCategoriaPanel(url.get('categoria'), ['inundacion', 'area_verde']),
    ).toMatchObject({ categoria: 'area_verde', canonicalizar: false });
    expect(resolverCategoriaPanel('area_verde', ['inundacion', 'area_verde']).canonicalizar).toBe(
      true,
    );
    expect(parametrosExportacion(filtros).categoria).toBe('area_verde');
  });
  it('cambiar conserva zona/estado/fechas y reinicia severidad y página', () => {
    const anterior = {
      ...FILTROS_VACIOS,
      estado: ['validado'] as const,
      severidad: ['alta'] as const,
      distrito_id: 'dm:1',
      bbox: '-64,-18,-63,-17',
      desde: '2026-10-01',
      pagina: 4,
    };
    const siguiente = cambiarCategoriaFiltros(
      { ...anterior, estado: [...anterior.estado], severidad: [...anterior.severidad] },
      'bache',
    );
    expect(siguiente).toMatchObject({
      categoria: 'bache',
      estado: ['validado'],
      distrito_id: 'dm:1',
      bbox: anterior.bbox,
      desde: anterior.desde,
      pagina: 1,
      severidad: [],
    });
    const ida = leerFiltros(serializarFiltros(siguiente));
    expect(ida).toEqual(siguiente);
    expect(parametrosExportacion(ida).categoria).toBe('bache');
  });
  it('la primera clave autocorregida usa categoría nueva sin severidad/página heredadas; un alias conserva ambos filtros', () => {
    const url = new URLSearchParams('categoria=bache&severidad=critica&pagina=4&desde=2026-10-01');
    const ambito = resolverCategoriaPanel(url.get('categoria'), ['inundacion']);
    const params = parametrosConsulta(filtrosDelAmbitoPanel(url, ambito));
    expect(params).toMatchObject({ categoria: 'inundacion', pagina: '1', desde: '2026-10-01' });
    expect(params.severidad).toBeUndefined();
    expect(consultaReportes(params).queryKey[1]).toMatchObject({
      categoria: 'inundacion',
      pagina: '1',
    });
    url.set('categoria', 'BACHES');
    const alias = resolverCategoriaPanel(url.get('categoria'), ['inundacion', 'bache']);
    expect(parametrosConsulta(filtrosDelAmbitoPanel(url, alias))).toMatchObject({
      categoria: 'bache',
      severidad: 'critica',
      pagina: '4',
    });
  });
});

describe('M5.1: ámbitos, composiciones y datos públicos', () => {
  it('el observador conserva placeholder solo dentro de la categoría y descarta una respuesta tardía ajena', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const base = consultaReportes({ categoria: 'inundacion', pagina: '1' });
    const datos = {
      type: 'FeatureCollection' as const,
      features: [],
      total: 7,
      pagina: 1,
      limite: 50,
    };
    qc.setQueryData(base.queryKey, datos);
    let terminar: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            terminar = () => resolve(respuesta({ ...datos, total: 99 }));
          }),
      ),
    );
    const observador = new QueryObserver(qc, { ...base, staleTime: Infinity });
    const baja = observador.subscribe(() => {});
    try {
      observador.setOptions(consultaReportes({ categoria: 'inundacion', pagina: '2' }));
      expect(observador.getCurrentResult().data).toEqual(datos);
      const anterior = terminar;
      observador.setOptions(consultaReportes({ categoria: 'bache', pagina: '1' }));
      expect(observador.getCurrentResult().data).toBeUndefined();
      anterior?.();
      await new Promise((r) => setTimeout(r, 0));
      expect(observador.getCurrentResult().data).toBeUndefined();
    } finally {
      baja();
      qc.clear();
    }
  });
  it('cada clave lleva categoría efectiva; cambiar categoría cambia la clave', () => {
    expect(consultaReportes({}).queryKey).not.toEqual(
      consultaReportes({ categoria: 'bache' }).queryKey,
    );
    expect(JSON.stringify(consultaReportes({}).queryKey)).toContain('inundacion');
    expect(JSON.stringify(consultaIndicadores({ categoria: 'bache' }).queryKey)).toContain('bache');
    expect(consultaResumenEjecutivo('bache').queryKey).not.toEqual(
      consultaResumenEjecutivo('inundacion').queryKey,
    );
  });
  it('el transporte público usa exclusivamente el tipo de contrato público', () => {
    expectTypeOf<ReturnType<typeof obtenerReportesPublicos>>().toEqualTypeOf<
      Promise<ReporteFeatureCollection>
    >();
  });
  it('la composición conserva participantes ordenados, no envía todas ni rutas técnicas y limita cada categoría a 300', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return respuesta({
          type: 'FeatureCollection',
          features: [],
          total: 2,
          pagina: 1,
          limite: 300,
        });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const consulta = consultaMapaEjecutivo(['bache', 'inundacion']);
      const resultado = await qc.fetchQuery(consulta);
      expect(consulta.queryKey).not.toEqual(
        consultaMapaEjecutivo(['inundacion', 'bache']).queryKey,
      );
      expect(resultado.completa).toBe(true);
      expect(resultado.total).toBe(4);
      expect(urls).toHaveLength(2);
      for (const url of urls) {
        const u = new URL(url, 'http://panel');
        expect(u.pathname).toBe('/api/v1/reportes');
        expect(u.searchParams.get('categoria')).not.toBe('todas');
        expect(u.searchParams.get('limite')).toBe('300');
      }
    } finally {
      qc.clear();
    }
  });
  it('cero participantes no consulta y un fallo parcial conserva el límite explícito', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('bache') ? respuesta({}, 500) : respuesta({ features: [], total: 3 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const vacia = await qc.fetchQuery(consultaMapaEjecutivo([]));
      expect(vacia.completa).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      const parcial = await qc.fetchQuery(consultaMapaEjecutivo(['bache', 'inundacion']));
      expect(parcial.completa).toBe(false);
      expect(parcial.faltantes).toEqual(['bache']);
      expect(parcial.total).toBeNull();
    } finally {
      qc.clear();
    }
  });
  it('agregados completos suman conteos compatibles, nunca severidades; parciales no aparentan una suma completa', async () => {
    let falla = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        falla && url.includes('bache')
          ? respuesta({}, 500)
          : respuesta([
              {
                unidad_vecinal_id: 'uv:1',
                codigo: '1',
                nombre: 'UV 1',
                distrito_id: 'dm:1',
                n_reportes: 2,
                n_verificados: 1,
                n_puntos_criticos: 1,
                severidad_max: 'critica',
                severidad_max_verificada: 'alta',
              },
            ]),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const completa = await qc.fetchQuery(consultaAgregadosCompuestos(['bache', 'inundacion']));
      expect(completa.completa).toBe(true);
      expect(completa.agregados[0]).toMatchObject({ n_reportes: 4, n_verificados: 2 });
      expect(completa.agregados[0]).not.toHaveProperty('severidad_max');
      falla = true;
      const parcial = await qc.fetchQuery(consultaAgregadosCompuestos(['bache', 'inundacion']));
      expect(parcial.completa).toBe(false);
      expect(parcial.agregados).toEqual([]);
    } finally {
      qc.clear();
    }
  });
});
