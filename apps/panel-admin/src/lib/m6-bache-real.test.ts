import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CONFIG_DOMINIO,
  DEFINICION_BACHE,
  DetalleBacheSchema,
  type ExportacionGeoJson,
  ExportacionGeoJsonSchema,
  NOTA_METODOLOGICA,
  REGISTRO_CATEGORIAS,
  type ReporteTecnico,
  type ReporteTecnicoFeature,
  type ReporteTecnicoFeatureCollection,
  ReporteTecnicoFeatureCollectionSchema,
  ReporteTecnicoFeatureSchema,
  ReporteTecnicoSchema,
  type SubtipoBache,
} from 'contracts';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import EjecutivoPagina from '@/app/(panel)/ejecutivo/page';
import IndicadoresPagina from '@/app/(panel)/indicadores/page';
import DetallePagina from '@/app/(panel)/reportes/[id]/page';
import { FactoresSeveridad } from '@/componentes/FactoresSeveridad';
import { PanelAcciones } from '@/componentes/PanelAcciones';
import {
  generarJsonReporteUnitario,
  generarTextoReporteUnitario,
  ReporteUnitarioModal,
} from '@/componentes/ReporteUnitarioModal';
import { TablaReportes } from '@/componentes/TablaReportes';
import {
  cambiarEstado,
  ErrorExportacionInvalida,
  exportarGeoJson,
  reclasificarSeveridad,
  urlExportar,
} from './api';
import { reporteSintetico } from './categorias.fixture';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import {
  consultaCandidatosFusion,
  consultaIndicadores,
  consultaReporte,
  consultaResumenEjecutivo,
} from './consultas';
import { resumenDeEjemplo } from './ejecutivo.fixture';
import { avisoExportacion } from './exportacion';
import { disponiblesPanel, leerFiltros, parametrosExportacion } from './filtros';
import { candidatosCercanos, parametrosCandidatosFusion } from './fusion-cercana';
import { accionesModeracion } from './moderacion';
import { presentarReporte } from './presentacion-reporte';
import type {
  ColeccionReportesPanel,
  PropiedadesReportePanel,
  ReportePanel,
} from './reportes-panel';
import { puedeVerRuta } from './roles';

const navegacion = vi.hoisted(() => ({ url: 'categoria=bache', ruta: '/reportes' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
  useSearchParams: () => new URLSearchParams(navegacion.url),
  usePathname: () => navegacion.ruta,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('./sesion', () => ({ useUsuarioActual: () => ({ rol: 'tecnico' }) }));
vi.mock('@/componentes/Mapa', () => ({ Mapa: () => null }));

const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
const formato = { fechaHora: (s: string | null | undefined) => s ?? '—', numero: String };
const clientes: QueryClient[] = [];
const agua = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
] as const;

/** Datos SINTÉTICOS de reporte; esquema y definición Bache son los reales de contracts. */
function reporteBache(subtipo: SubtipoBache = 'bache'): ReportePanel {
  const f = reporteSintetico();
  return {
    ...f,
    properties: {
      ...f.properties,
      categoria: 'bache',
      subtipo,
      detalle: DetalleBacheSchema.parse({ gravedad_declarada: 'peligroso', tamano: 'rueda' }),
      profundidad_estimada: null,
      frecuencia: null,
      causa_presunta: null,
      sumidero_cercano: null,
      sumidero_estado: null,
      agua_brota_sumidero: null,
      severidad: 'alta',
      severidad_calculada: 'alta',
      severidad_puntaje: 5,
    },
  };
}

function cliente() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientes.push(qc);
  return qc;
}

function render(nodo: ReactNode, qc = cliente()) {
  return renderToStaticMarkup(
    createElement(
      ProveedorCiudad,
      { ciudad },
      createElement(
        ProveedorCategoriasPanel,
        {
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

function recibir(texto: string, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(texto, { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function exportacionRecibida(features: ReportePanel[], nota: string): ExportacionGeoJson {
  return {
    type: 'FeatureCollection',
    generado_en: '2026-10-19T12:00:00Z',
    nota_metodologica: nota,
    features,
    total: features.length,
    exportados: features.length,
    truncado: false,
  };
}

afterEach(() => {
  for (const qc of clientes.splice(0)) qc.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navegacion.url = 'categoria=bache';
  navegacion.ruta = '/reportes';
});

describe('M6.5 contrato técnico y definición real', () => {
  it('conserva los tres alias como tipos canónicos, sin derivar un payload de exportación', () => {
    expectTypeOf<ReportePanel>().toEqualTypeOf<ReporteTecnicoFeature>();
    expectTypeOf<PropiedadesReportePanel>().toEqualTypeOf<ReporteTecnico>();
    expectTypeOf<ColeccionReportesPanel>().toEqualTypeOf<ReporteTecnicoFeatureCollection>();
    expect(REGISTRO_CATEGORIAS.obtener('bache')).toBe(DEFINICION_BACHE);
    const f = ReporteTecnicoFeatureSchema.parse(reporteBache());
    for (const campo of agua) expect(f.properties[campo]).toBeNull();
    expect(
      ReporteTecnicoFeatureCollectionSchema.parse({
        type: 'FeatureCollection',
        features: [f, reporteSintetico()],
        total: 2,
        pagina: 1,
        limite: 50,
      }).features,
    ).toHaveLength(2);
  });

  it('el registro real no ofrece Baches si el catálogo no la activa', () => {
    expect(
      disponiblesPanel({ ciudad, categorias_activas: ['inundacion'] }).map((d) => d.slug),
    ).toEqual(['inundacion']);
    expect(
      disponiblesPanel({ ciudad, categorias_activas: ['inundacion', 'bache'] }).map((d) => d.slug),
    ).toEqual(['inundacion', 'bache']);
  });

  it.each(['inundacion', undefined])(
    'inundación/legado %s sigue rechazando agua obligatoria nula',
    (categoria) => {
      const f = reporteSintetico();
      if (categoria === undefined) delete f.properties.categoria;
      else f.properties.categoria = categoria;
      for (const campo of ['profundidad_estimada', 'frecuencia', 'causa_presunta'] as const) {
        const invalido = { ...f, properties: { ...f.properties, [campo]: null } };
        expect(ReporteTecnicoSchema.safeParse(invalido.properties).success).toBe(false);
        expect(
          ExportacionGeoJsonSchema.safeParse(exportacionRecibida([invalido], NOTA_METODOLOGICA))
            .success,
        ).toBe(false);
      }
    },
  );
});

describe('M6.5 Bache real en presentación y ficha', () => {
  it.each([
    ['bache', 'Bache'],
    ['hundimiento_calzada', 'Hundimiento de calzada'],
    ['tapa_alcantarilla_faltante', 'Tapa de alcantarilla faltante'],
    ['asfalto_levantado', 'Asfalto levantado'],
    ['calle_tierra_intransitable', 'Calle de tierra intransitable'],
  ] as const)('presenta el tipo real %s y sus respuestas legibles', (subtipo, etiqueta) => {
    const vista = presentarReporte(reporteBache(subtipo).properties);
    expect(vista).toMatchObject({
      nombre: 'Baches',
      subtipo: etiqueta,
      inundacion: false,
      aviso: null,
    });
    expect(vista.campos).toEqual([
      { etiqueta: '¿Qué tan grave es?', valor: 'Es peligroso, sobre todo de noche' },
      { etiqueta: '¿Qué tamaño tiene?', valor: 'Como una rueda' },
    ]);
    expect(vista.nota).toContain(DEFINICION_BACHE.notaMetodologica);
    expect(vista.nota).toContain('no una comprobación de accidente');
    expect(vista.nota).toContain('no comparable con otras categorías');
  });

  it('ficha, TXT y GeoJSON conservan respuestas, seis nulos y trazabilidad sin calcular severidad', () => {
    const calcular = vi.spyOn(DEFINICION_BACHE.severidad, 'calcular').mockImplementation(() => {
      throw new Error('El panel debe conservar la severidad del servidor');
    });
    const f = reporteBache('tapa_alcantarilla_faltante');
    f.properties.severidad_manual = 'critica';
    f.properties.severidad = 'critica';
    f.properties.severidad_motivo = 'Revisión técnica del piloto';
    f.properties.autor_id = 'dddddddd-0000-4000-8000-000000000004';
    const txt = generarTextoReporteUnitario(f, formato, ciudad);
    const html = render(createElement(ReporteUnitarioModal, { reporte: f, onCerrar: vi.fn() }));
    for (const salida of [txt, html]) {
      expect(salida).toContain('Tapa de alcantarilla faltante');
      expect(salida).toContain('Es peligroso, sobre todo de noche');
      expect(salida).toContain('Como una rueda');
      expect(salida).toContain('Revisión técnica del piloto');
      expect(salida).toContain(f.properties.autor_id);
      expect(salida.replace(/\s+/g, ' ')).toContain(DEFINICION_BACHE.notaMetodologica);
      expect(salida).not.toMatch(/Profundidad|Sumidero|de 13 puntos|puntaje =/i);
    }
    expect(txt).toContain('5 puntos');
    const json = JSON.parse(generarJsonReporteUnitario(f));
    expect(json.properties).toEqual(f.properties);
    expect(json.geometry).toEqual(f.geometry);
    for (const campo of agua) expect(json.properties[campo]).toBeNull();
    expect(json.nota_metodologica).toContain(DEFINICION_BACHE.notaMetodologica);
    expect(json.definicion_disponible).toEqual({ detalle: 1, severidad: 1 });
    expect(json.versiones).toContain('no informa las versiones históricas');
    expect(json.properties).not.toHaveProperty('detalle_version');
    expect(json.properties).not.toHaveProperty('severidad_version');
    const factores = render(createElement(FactoresSeveridad, { reporte: f.properties }));
    expect(factores).toContain('definición disponible');
    expect(factores).not.toMatch(/profundidad|de 13|puntaje =/i);
    expect(calcular).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { gravedad_declarada: 'peligroso', tamano: 'desconocido' },
    { gravedad_declarada: 'peligroso', tamano: 'rueda', secreto: 'NO_MOSTRAR_DETALLE' },
  ])('detalle real incompatible %j queda en comunes y aviso', (detalle) => {
    const p = { ...reporteBache().properties, detalle } as unknown as PropiedadesReportePanel;
    const vista = presentarReporte(p);
    expect(vista.aviso).toContain('incompatible');
    expect(vista.campos).toEqual([]);
    expect(vista.inundacion).toBe(false);
    expect(JSON.stringify(vista)).not.toContain('NO_MOSTRAR_DETALLE');
  });

  it('un subtipo desconocido no se transforma en un tipo de Bache válido', () => {
    const p = { ...reporteBache().properties, subtipo: 'tipo_desconocido' };
    expect(presentarReporte(p)).toMatchObject({ campos: [], subtipo: '', inundacion: false });
    expect(presentarReporte(p).aviso).toContain('subtipo es incompatible');
  });

  it('historial sin definición conserva datos comunes y JSON, sin atribuir modelo histórico', () => {
    const f = reporteBache();
    f.properties.categoria = 'categoria_historica';
    f.properties.detalle = { respuesta_antigua: 'NO_MOSTRAR_DETALLE' };
    const vista = presentarReporte(f.properties);
    expect(vista.campos).toEqual([]);
    expect(vista.aviso).toContain('No hay definición disponible');
    expect(vista.versiones).toContain('no informa las versiones históricas');
    const html = render(createElement(ReporteUnitarioModal, { reporte: f, onCerrar: vi.fn() }));
    expect(html).not.toContain('NO_MOSTRAR_DETALLE');
    const json = JSON.parse(generarJsonReporteUnitario(f));
    expect(json.properties).toEqual(f.properties);
    expect(json.definicion_disponible).toBeNull();
  });

  it('Inundaciones y legado sin detalle conservan campos, nota y modelo de agua', () => {
    const f = reporteSintetico();
    delete f.properties.categoria;
    delete f.properties.detalle;
    const vista = presentarReporte(f.properties);
    expect(vista.inundacion).toBe(true);
    expect(vista.campos.some((c) => c.valor.includes('rodilla'))).toBe(true);
    expect(vista.nota).toBe(NOTA_METODOLOGICA);
    expect(generarTextoReporteUnitario(f, formato, ciudad)).toContain(
      'REPORTE UNITARIO DE INUNDACIÓN',
    );
    expect(render(createElement(FactoresSeveridad, { reporte: f.properties }))).toContain(
      'profundidad',
    );
  });

  it('detalle por ID desde Todas usa Bache real y conserva el retorno de la bandeja', () => {
    navegacion.url = 'categoria=todas&volver=%2Freportes%3Fcategoria%3Dtodas%26estado%3Dnuevo';
    const f = reporteBache();
    const qc = cliente();
    qc.setQueryData(consultaReporte(f.properties.id).queryKey, f);
    const html = render(createElement(DetallePagina), qc);
    expect(html).toContain('Es peligroso, sobre todo de noche');
    expect(html).toContain('Como una rueda');
    expect(html).toContain('href="/reportes?categoria=todas&amp;estado=nuevo"');
    expect(html).not.toMatch(/Profundidad|Sumidero|puntaje =/i);
  });
});

describe('M6.5 Baches, Inundaciones y Todas en el panel', () => {
  it.each(['bache', 'inundacion', 'todas'])(
    'tabla e indicadores mantienen el ámbito %s',
    (categoria) => {
      const reportes = categoria === 'bache' ? [reporteBache()] : [reporteSintetico()];
      if (categoria === 'todas') {
        const bache = reporteBache();
        bache.properties.id = bache.id = 'bbbbbbbb-0000-4000-8000-000000000002';
        reportes.push(bache);
      }
      const html = render(createElement(TablaReportes, { reportes, categoria }));
      if (categoria === 'inundacion') expect(html).toContain('<th scope="col">Frecuencia</th>');
      else {
        expect(html).toContain('Baches');
        expect(html).not.toContain('<th scope="col">Frecuencia</th>');
      }
      if (categoria === 'todas') expect(html).toContain('Inundaciones');
      navegacion.url = `categoria=${categoria}`;
      navegacion.ruta = '/indicadores';
      const qc = cliente();
      qc.setQueryData(consultaIndicadores({ categoria }).queryKey, {
        total: 1,
        por_estado: { nuevo: 1, validado: 0, resuelto: 0, rechazado: 0, duplicado: 0 },
        por_severidad: { baja: 0, media: 0, alta: 1, critica: 0 },
        por_distrito: [],
        por_unidad_vecinal: [
          { unidad_vecinal_id: 'uv:1', nombre: 'UV de prueba', distrito_id: 'dm:1', n: 1 },
        ],
        puntos_criticos_recurrentes: 0,
        capas_vigentes: {},
      });
      const indicadores = render(createElement(IndicadoresPagina), qc);
      expect(indicadores).toContain('UV de prueba');
      expect(indicadores).toMatch(new RegExp(`href="[^"]*categoria=${categoria}`));
    },
  );

  it.each(['bache', 'inundacion', 'todas'])(
    'ejecutivo %s conserva modelo y no ofrece exportar ni moderar',
    (categoria) => {
      navegacion.url = `categoria=${categoria}`;
      navegacion.ruta = '/ejecutivo';
      const qc = cliente();
      qc.setQueryData(consultaResumenEjecutivo(categoria).queryKey, resumenDeEjemplo());
      const html = render(createElement(EjecutivoPagina), qc);
      expect(html).not.toMatch(/Exportar|boton-validar|boton-rechazar|selector-periodo/);
      if (categoria === 'inundacion') expect(html).toContain('ejecutivo-formula');
      else {
        expect(html).not.toContain('ejecutivo-formula');
        expect(html).toContain('Crítica agrupa las bandas alta y crítica');
      }
      if (categoria === 'bache') expect(html).toContain(DEFINICION_BACHE.notaMetodologica);
      if (categoria === 'todas') expect(html).toContain('categorías inactivas');
    },
  );
});

describe('M6.5 exportación recibida y filtros, sin generar CSV en el panel', () => {
  it.each(['bache', 'inundacion', 'todas'])(
    'CSV %s conserva formato y filtros sin paginación de tabla',
    (categoria) => {
      const params = parametrosExportacion(
        leerFiltros(
          new URLSearchParams({
            categoria,
            estado: 'validado',
            severidad: 'alta',
            distrito_id: 'dm:1',
            unidad_vecinal_id: 'uv:1',
            desde: '2026-10-01',
            hasta: '2026-10-19',
            pagina: '4',
          }),
        ),
      );
      const url = new URL(urlExportar('csv', params), 'https://panel.invalid');
      expect(url.pathname).toBe('/api/v1/exportar');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        categoria,
        estado: 'validado',
        severidad: 'alta',
        distrito_id: 'dm:1',
        unidad_vecinal_id: 'uv:1',
        desde: '2026-10-01',
        hasta: '2026-10-19',
        formato: 'csv',
      });
    },
  );

  it.each(['bache', 'inundacion', 'todas'])(
    'GeoJSON recibido %s conserva bytes, respuestas, nota y nulos',
    async (categoria) => {
      const features = categoria === 'bache' ? [reporteBache()] : [reporteSintetico()];
      if (categoria === 'todas') features.push(reporteBache());
      // Respuesta de prueba: la composición de notas/CSV del servidor se verifica en API, no aquí.
      const nota =
        categoria === 'inundacion' ? NOTA_METODOLOGICA : DEFINICION_BACHE.notaMetodologica;
      const recibido = exportacionRecibida(features, nota);
      recibido.total = features.length + 1;
      recibido.truncado = true;
      const texto = JSON.stringify(recibido, null, 2);
      const fetch = recibir(texto);
      const resultado = await exportarGeoJson({ categoria, estado: 'validado', severidad: 'alta' });
      const url = new URL(String(fetch.mock.calls[0]?.[0]), 'https://panel.invalid');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        categoria,
        estado: 'validado',
        severidad: 'alta',
        formato: 'geojson',
      });
      expect(resultado.texto).toBe(texto);
      expect(JSON.parse(resultado.texto)).toEqual(recibido);
      expect(resultado.resumen).toEqual({
        total: features.length + 1,
        exportados: features.length,
        truncado: true,
      });
      expect(avisoExportacion(resultado.resumen, formato)).toContain('afiná los filtros');
      for (const f of JSON.parse(resultado.texto).features) {
        if (f.properties.categoria === 'bache') {
          for (const campo of agua) expect(f.properties[campo]).toBeNull();
          expect(f.properties.detalle).toEqual({
            gravedad_declarada: 'peligroso',
            tamano: 'rueda',
          });
        }
      }
    },
  );

  it('no entrega un GeoJSON recibido que contamina Inundaciones con un nulo obligatorio', async () => {
    const f = reporteSintetico();
    f.properties.profundidad_estimada = null;
    recibir(JSON.stringify(exportacionRecibida([f, reporteBache()], 'Nota recibida')));
    await expect(exportarGeoJson({ categoria: 'todas' })).rejects.toBeInstanceOf(
      ErrorExportacionInvalida,
    );
  });
});

describe('M6.5 edición, roles y fusión conservados', () => {
  it('consume la respuesta técnica de validar Bache, con seis nulos y la ruta autenticada previa', async () => {
    const f = reporteBache();
    f.properties.estado = 'validado';
    f.properties.verificado = true;
    const fetch = recibir(JSON.stringify(f));
    expect(await cambiarEstado(f.properties.id, { estado: 'validado' })).toEqual(f);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1/reportes/${f.properties.id}/estado`);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ estado: 'validado' });
  });

  it('reclasificación conserva motivo y puntaje calculado del servidor sin rellenar agua', async () => {
    const f = reporteBache();
    const cuerpo = {
      severidad_manual: 'critica',
      severidad_motivo: 'Revisión técnica del piloto',
    } as const;
    f.properties = { ...f.properties, ...cuerpo, severidad: 'critica' };
    const fetch = recibir(JSON.stringify(f));
    const respuesta = await reclasificarSeveridad(f.properties.id, cuerpo);
    expect(respuesta).toEqual(f);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(cuerpo);
    expect(respuesta.properties.severidad_puntaje).toBe(5);
    for (const campo of agua) expect(respuesta.properties[campo]).toBeNull();
  });

  it('roles de Bache e Inundación mantienen validación, retiro y cierre de ejecutivo', () => {
    for (const f of [reporteBache(), reporteSintetico()]) {
      for (const rol of ['tecnico', 'admin'] as const) {
        expect(accionesModeracion(f.properties.estado, rol).validar).toBe(true);
        expect(puedeVerRuta(rol, '/reportes')).toBe(true);
      }
      expect(accionesModeracion('validado', 'tecnico').retirar).toBe(false);
      expect(accionesModeracion('validado', 'admin').retirar).toBe(true);
      expect(Object.values(accionesModeracion(f.properties.estado, 'ejecutivo'))).not.toContain(
        true,
      );
      const html = render(createElement(PanelAcciones, { reporte: f, rol: 'ejecutivo' }));
      expect(html).not.toMatch(/boton-validar|boton-rechazar|boton-fusionar/);
    }
    expect(puedeVerRuta('ejecutivo', '/reportes')).toBe(false);
    expect(puedeVerRuta('ejecutivo', '/ejecutivo')).toBe(true);
  });

  it('desde Todas la fusión consulta Baches y descarta Inundaciones coincidente', () => {
    const f = reporteBache();
    const bache = reporteBache();
    bache.properties.id = bache.id = 'bbbbbbbb-0000-4000-8000-000000000002';
    bache.properties.estado = 'validado';
    const inundacion = reporteSintetico();
    inundacion.properties.id = inundacion.id = 'cccccccc-0000-4000-8000-000000000003';
    inundacion.properties.estado = 'validado';
    const centro = { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    expect(parametrosCandidatosFusion(centro, 100, 'bache').categoria).toBe('bache');
    expect(
      candidatosCercanos(
        [bache, inundacion],
        { id: f.properties.id, centro, categoria: 'bache' },
        100,
      ).map((c) => c.id),
    ).toEqual([bache.properties.id]);
    navegacion.url = 'categoria=todas';
    const qc = cliente();
    qc.setQueryData(consultaCandidatosFusion(centro, 100, true, 'bache').queryKey, {
      type: 'FeatureCollection',
      features: [bache, inundacion],
      total: 2,
      pagina: 1,
      limite: 100,
    });
    const html = render(
      createElement(PanelAcciones, { reporte: f, rol: 'tecnico', accionInicial: 'fusionar' }),
      qc,
    );
    expect(html).toContain(`data-id="${bache.properties.id}"`);
    expect(html).not.toContain(`data-id="${inundacion.properties.id}"`);
  });
});
