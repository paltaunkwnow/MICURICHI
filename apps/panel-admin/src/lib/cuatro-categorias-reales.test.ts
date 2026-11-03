import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  type ExportacionGeoJson,
  ExportacionGeoJsonSchema,
  GRAVEDADES_AREA_VERDE,
  GRAVEDADES_BASURA,
  NOTA_METODOLOGICA,
  REGISTRO_CATEGORIAS,
  ReporteTecnicoFeatureSchema,
  TAMANOS_AREA_VERDE,
  TAMANOS_BASURA,
} from 'contracts';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EjecutivoPagina from '@/app/(panel)/ejecutivo/page';
import IndicadoresPagina from '@/app/(panel)/indicadores/page';
import DetallePagina from '@/app/(panel)/reportes/[id]/page';
import { DatosCategoriaReporte } from '@/componentes/DatosCategoriaReporte';
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
import { AVISO_PERSONA, AVISO_QUEMA, SIN_DERIVACION_AUTOMATICA } from './avisos-categoria';
import { reporteSintetico } from './categorias.fixture';
import { ProveedorCategoriasPanel } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import { consultaIndicadores, consultaReporte, consultaResumenEjecutivo } from './consultas';
import { resumenDeEjemplo } from './ejecutivo.fixture';
import { disponiblesPanel, leerFiltros, parametrosExportacion } from './filtros';
import { candidatosCercanos, parametrosCandidatosFusion } from './fusion-cercana';
import { accionesModeracion } from './moderacion';
import { presentarReporte } from './presentacion-reporte';
import type { PropiedadesReportePanel, ReportePanel } from './reportes-panel';
import { puedeEntrarAlPanel, puedeVerRuta } from './roles';

const navegacion = vi.hoisted(() => ({ url: 'categoria=todas', ruta: '/reportes' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
  useSearchParams: () => new URLSearchParams(navegacion.url),
  usePathname: () => navegacion.ruta,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('./sesion', () => ({ useUsuarioActual: () => ({ rol: 'tecnico' }) }));
vi.mock('@/componentes/Mapa', () => ({ Mapa: () => null }));

const categorias = ['inundacion', 'bache', 'area_verde', 'basura'] as const;
const ambitos = [...categorias, 'todas'];
const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
const formato = { fechaHora: (s: string | null | undefined) => s ?? '—', numero: String };
const clientes: QueryClient[] = [];
const camposAgua = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
] as const;
const nuevas = [
  {
    categoria: 'area_verde',
    definicion: DEFINICION_AREA_VERDE,
    subtipo: 'persona_situacion_calle',
    detalle: { gravedad_declarada: 'riesgo', tamano: 'casi_toda_plaza' },
    respuestas: ['Es un riesgo para quien va', 'Casi toda la plaza'],
  },
  {
    categoria: 'basura',
    definicion: DEFINICION_BASURA,
    subtipo: 'quema_basura',
    detalle: { gravedad_declarada: 'ocupa_via', tamano: 'camioneta' },
    respuestas: ['Ocupa la vereda o la calle', 'Una camioneta'],
  },
] as const;

/** Reportes SINTÉTICOS; las cuatro definiciones y sus esquemas son los reales. */
function reporteReal(categoria: (typeof categorias)[number], subtipo?: string): ReportePanel {
  const f = reporteSintetico(categoria);
  if (categoria === 'inundacion') return f;
  const nueva = nuevas.find((c) => c.categoria === categoria);
  return {
    ...f,
    properties: {
      ...f.properties,
      subtipo: subtipo ?? nueva?.subtipo ?? 'bache',
      detalle: nueva?.detalle ?? { gravedad_declarada: 'peligroso', tamano: 'rueda' },
      // Valores recibidos, elegidos distintos de la fórmula actual para detectar recálculos.
      severidad: 'critica',
      severidad_calculada: 'baja',
      severidad_manual: 'critica',
      severidad_motivo: 'Revisión técnica sintética',
      severidad_puntaje: 9,
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
          inicial: { configuracion: { ciudad, categorias_activas: [...categorias] }, aviso: null },
        },
        createElement(QueryClientProvider, { client: qc }, nodo),
      ),
    ),
  );
}

function recibir(texto: string) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(texto, { headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function exportacion(features: ReportePanel[]): ExportacionGeoJson {
  return {
    type: 'FeatureCollection',
    generado_en: '2026-10-22T12:00:00Z',
    nota_metodologica: `Nota recibida. ${features.map((f) => presentarReporte(f.properties).nota).join(' ')}`,
    features,
    total: features.length,
    exportados: features.length,
    truncado: false,
  };
}

afterEach(() => {
  for (const qc of clientes.splice(0)) qc.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  navegacion.url = 'categoria=todas';
  navegacion.ruta = '/reportes';
});

describe('cuatro definiciones reales en el panel', () => {
  it('el catálogo y el registro son necesarios, también para las dos categorías nuevas', () => {
    expect(REGISTRO_CATEGORIAS.slugs).toEqual(categorias);
    expect(
      disponiblesPanel({ ciudad, categorias_activas: [...categorias] }).map((d) => d.slug),
    ).toEqual(categorias);
    expect(
      disponiblesPanel({ ciudad, categorias_activas: ['inundacion'] }).map((d) => d.slug),
    ).toEqual(['inundacion']);
    const anterior = crearRegistroCategorias([DEFINICION_INUNDACION, DEFINICION_BACHE]);
    expect(
      disponiblesPanel({ ciudad, categorias_activas: [...categorias] }, anterior).map(
        (d) => d.slug,
      ),
    ).toEqual(['inundacion', 'bache']);
  });

  for (const { categoria, definicion } of nuevas) {
    it.each(definicion.subtipos ?? [])(
      `${categoria}/$valor conserva etiquetas y destino propio`,
      ({ valor, etiqueta }) => {
        const f = reporteReal(categoria, valor);
        expect(ReporteTecnicoFeatureSchema.safeParse(f).success).toBe(true);
        const vista = presentarReporte(f.properties);
        expect(vista.nombre).toBe(definicion.nombre);
        expect(vista.subtipo).toBe(etiqueta);
        expect(vista.inundacion).toBe(false);
        expect(vista.campos.slice(0, 2)).toEqual(
          definicion.preguntas.map((p, i) => ({
            etiqueta: p.etiqueta,
            valor: nuevas.find((c) => c.categoria === categoria)?.respuestas[i],
          })),
        );
        expect(vista.nota).toContain(definicion.notaMetodologica);
        for (const campo of camposAgua) expect(f.properties[campo]).toBeNull();
        if (categoria === 'area_verde') {
          const destino =
            valor === 'persona_situacion_calle' ? 'Desarrollo Social' : 'Parques y jardines';
          expect(vista.campos).toContainEqual({
            etiqueta: 'Destino previsto',
            valor: `${destino}. ${SIN_DERIVACION_AUTOMATICA}`,
          });
          expect(vista.aviso).toBe(valor === 'persona_situacion_calle' ? AVISO_PERSONA : null);
        } else expect(vista.aviso).toBe(valor === 'quema_basura' ? AVISO_QUEMA : null);
      },
    );
  }

  for (const [categoria, gravedades, tamanos] of [
    ['area_verde', GRAVEDADES_AREA_VERDE, TAMANOS_AREA_VERDE],
    ['basura', GRAVEDADES_BASURA, TAMANOS_BASURA],
  ] as const) {
    it.each(
      gravedades.flatMap((gravedad_declarada) =>
        tamanos.map((tamano) => ({ gravedad_declarada, tamano })),
      ),
    )(
      `${categoria}/$gravedad_declarada/$tamano conserva respuestas y severidad recibida`,
      (detalle) => {
        const def = REGISTRO_CATEGORIAS.obtener(categoria);
        if (!def) throw new Error('Falta la definición real');
        const calcular = vi.spyOn(def.severidad, 'calcular').mockImplementation(() => {
          throw new Error('El panel no calcula severidad');
        });
        const f = reporteReal(categoria);
        f.properties.detalle = detalle;
        const vista = presentarReporte(f.properties);
        expect(vista.campos.slice(0, 2).map((c) => c.valor)).toEqual(
          def.preguntas.map(
            (p) =>
              p.opciones?.find((o) => o.valor === detalle[p.id as keyof typeof detalle])?.etiqueta,
          ),
        );
        const json = JSON.parse(generarJsonReporteUnitario(f));
        expect(json.properties).toEqual(f.properties);
        expect(json.properties.severidad).toBe('critica');
        expect(json.properties.severidad_calculada).toBe('baja');
        expect(json.properties.severidad_puntaje).toBe(9);
        expect(calcular).not.toHaveBeenCalled();
      },
    );
  }
});

describe('detalle, ficha y archivos unitarios de las categorías nuevas', () => {
  it.each(nuevas)(
    '$categoria conserva aviso, respuestas, nota y versiones sin atribuir modelo histórico',
    ({ categoria, definicion, respuestas }) => {
      const calcular = vi.spyOn(definicion.severidad, 'calcular').mockImplementation(() => {
        throw new Error('No recalcular');
      });
      const f = reporteReal(categoria);
      const html = render(createElement(ReporteUnitarioModal, { reporte: f, onCerrar: vi.fn() }));
      const txt = generarTextoReporteUnitario(f, formato, ciudad);
      const aviso = categoria === 'area_verde' ? AVISO_PERSONA : AVISO_QUEMA;
      for (const salida of [html, txt]) {
        expect(salida).toContain(aviso);
        for (const respuesta of respuestas) expect(salida).toContain(respuesta);
        expect(salida.replace(/\s+/g, ' ')).toContain(definicion.notaMetodologica);
        expect(salida).toContain('no informa las versiones históricas');
        expect(salida).toContain('Revisión técnica sintética');
        expect(salida).not.toMatch(/Profundidad|Sumidero|de 13 puntos|puntaje =/i);
        if (categoria === 'area_verde') {
          expect(salida).toContain('Desarrollo Social');
          expect(salida).toContain(SIN_DERIVACION_AUTOMATICA);
        }
      }
      expect(txt).toContain('9 puntos');
      const json = JSON.parse(generarJsonReporteUnitario(f));
      expect(json.properties).toEqual(f.properties);
      expect(json.aviso).toBe(aviso);
      expect(json.definicion_disponible).toEqual({ detalle: 1, severidad: 1 });
      expect(json.properties).not.toHaveProperty('severidad_version');
      expect(json.properties).not.toHaveProperty('detalle_version');
      expect(json.nota_metodologica).toContain(SIN_DERIVACION_AUTOMATICA);
      const factores = render(createElement(FactoresSeveridad, { reporte: f.properties }));
      expect(factores).not.toMatch(/profundidad|de 13|puntaje =/i);
      expect(calcular).not.toHaveBeenCalled();
    },
  );

  it.each(nuevas)(
    'detalle de $categoria desde Todas conserva el retorno y el aviso',
    ({ categoria }) => {
      navegacion.url = 'categoria=todas&volver=%2Freportes%3Fcategoria%3Dtodas%26estado%3Dnuevo';
      const f = reporteReal(categoria);
      const qc = cliente();
      qc.setQueryData(consultaReporte(f.properties.id).queryKey, f);
      const html = render(createElement(DetallePagina), qc);
      expect(html).toContain(categoria === 'area_verde' ? AVISO_PERSONA : AVISO_QUEMA);
      expect(html).toContain('href="/reportes?categoria=todas&amp;estado=nuevo"');
      expect(html).not.toMatch(/Profundidad|Sumidero|puntaje =/i);
    },
  );

  it('Persona → parque → Quema → microbasural no deja avisos en el detalle', () => {
    const salidas = [
      reporteReal('area_verde'),
      reporteReal('area_verde', 'parque_plaza_descuidada'),
      reporteReal('basura'),
      reporteReal('basura', 'microbasural'),
    ].map((f) => render(createElement(DatosCategoriaReporte, { reporte: f.properties })));
    expect(salidas[0]).toContain(AVISO_PERSONA);
    expect(salidas[1]).not.toContain(AVISO_PERSONA);
    expect(salidas[1]).toContain('Parques y jardines');
    expect(salidas[2]).toContain(AVISO_QUEMA);
    expect(salidas[3]).not.toContain(AVISO_QUEMA);
    expect(salidas[3]).not.toContain('Destino previsto');
  });

  for (const { categoria, detalle: detalleValido } of nuevas) {
    it.each([
      undefined,
      null,
      {},
      { ...detalleValido, tamano: 'desconocido' },
      { ...detalleValido, secreto: 'NO_MOSTRAR' },
    ])(`${categoria} con detalle incompatible %j conserva solo comunes`, (detalle) => {
      const p = {
        ...reporteReal(categoria).properties,
        detalle,
      } as unknown as PropiedadesReportePanel;
      const vista = presentarReporte(p);
      expect(vista.campos).toEqual([]);
      expect(vista.subtipo).toBe('');
      expect(vista.aviso).toContain('incompatible');
      expect(vista.aviso).not.toBe(AVISO_PERSONA);
      expect(vista.aviso).not.toBe(AVISO_QUEMA);
      expect(JSON.stringify(vista)).not.toContain('NO_MOSTRAR');
    });
    it.each([null, '', 'subtipo_historico'])(
      `${categoria} sin subtipo vigente %s no atribuye destino`,
      (subtipo) => {
        const f = reporteReal(categoria);
        f.properties.subtipo = subtipo;
        expect(presentarReporte(f.properties)).toMatchObject({
          campos: [],
          subtipo: '',
          inundacion: false,
        });
        expect(presentarReporte(f.properties).aviso).toContain('subtipo es incompatible');
      },
    );
  }

  it('historial sin definición no inventa modelo ni pierde los datos del GeoJSON', () => {
    const f = reporteReal('area_verde');
    f.properties.categoria = 'categoria_historica';
    f.properties.detalle = { dato_historico: 'NO_MOSTRAR' };
    const vista = presentarReporte(f.properties);
    expect(vista.campos).toEqual([]);
    expect(vista.aviso).toContain('No hay definición disponible');
    expect(vista.versiones).toContain('no informa las versiones históricas');
    expect(render(createElement(DatosCategoriaReporte, { reporte: f.properties }))).not.toContain(
      'NO_MOSTRAR',
    );
    const json = JSON.parse(generarJsonReporteUnitario(f));
    expect(json.properties).toEqual(f.properties);
    expect(json.definicion_disponible).toBeNull();
  });

  it('Inundaciones plana antigua conserva sus campos y nota', () => {
    const f = reporteSintetico();
    delete f.properties.categoria;
    delete f.properties.detalle;
    expect(presentarReporte(f.properties)).toMatchObject({
      inundacion: true,
      aviso: null,
      nota: NOTA_METODOLOGICA,
    });
    expect(generarTextoReporteUnitario(f, formato, ciudad)).toContain('Profundidad Estimada');
  });
});

describe('bandeja, indicadores, ejecutivo y exportación por categoría', () => {
  it.each(ambitos)('tabla e indicadores conservan %s y sus enlaces', (categoria) => {
    const features = categorias
      .filter((c) => categoria === 'todas' || c === categoria)
      .map((c) => reporteReal(c));
    const html = render(createElement(TablaReportes, { reportes: features, categoria }));
    if (categoria === 'inundacion') {
      expect(html).toContain('Reportes de inundación filtrados');
      expect(html).toContain('<th scope="col">Frecuencia</th>');
      expect(html).not.toContain('<th scope="col">Categoría</th>');
    } else {
      for (const f of features)
        expect(html).toContain(
          REGISTRO_CATEGORIAS.obtener(f.properties.categoria ?? 'inundacion')?.nombre,
        );
    }
    if (categoria !== 'inundacion') expect(html).not.toContain('<th scope="col">Frecuencia</th>');
    navegacion.url = `categoria=${categoria}`;
    navegacion.ruta = '/indicadores';
    const qc = cliente();
    qc.setQueryData(consultaIndicadores({ categoria }).queryKey, {
      total: 1,
      por_estado: { nuevo: 1, validado: 0, resuelto: 0, rechazado: 0, duplicado: 0 },
      por_severidad: { baja: 0, media: 0, alta: 1, critica: 0 },
      por_distrito: [],
      por_unidad_vecinal: [
        { unidad_vecinal_id: 'uv:1', nombre: 'UV sintética', distrito_id: 'dm:1', n: 1 },
      ],
      puntos_criticos_recurrentes: 0,
      capas_vigentes: {},
    });
    const indicadores = render(createElement(IndicadoresPagina), qc);
    expect(indicadores).toContain('UV sintética');
    const categoriaUrl = categoria === 'area_verde' ? 'area-verde' : categoria;
    expect(indicadores).toMatch(new RegExp(`href="[^"]*categoria=${categoriaUrl}(?:&amp;|")`));
  });

  it.each(ambitos)('ejecutivo %s conserva bandas y no ofrece exportar ni moderar', (categoria) => {
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
    if (categoria === 'area_verde' || categoria === 'basura')
      expect(html).toContain(REGISTRO_CATEGORIAS.obtener(categoria)?.notaMetodologica);
  });

  it.each(ambitos)('CSV %s mantiene filtros y formato, sin paginación', (categoria) => {
    const params = parametrosExportacion(
      leerFiltros(
        new URLSearchParams({
          categoria,
          estado: 'validado',
          severidad: 'alta',
          distrito_id: 'dm:1',
          unidad_vecinal_id: 'uv:1',
          desde: '2026-10-01',
          hasta: '2026-10-22',
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
      hasta: '2026-10-22',
      formato: 'csv',
    });
  });

  it.each(ambitos)(
    'GeoJSON recibido %s conserva bytes, notas, subtipo, detalle y nulos',
    async (categoria) => {
      const features = categorias
        .filter((c) => categoria === 'todas' || c === categoria)
        .map((c) => reporteReal(c));
      const recibido = exportacion(features);
      recibido.total += 1;
      recibido.truncado = true;
      const texto = JSON.stringify(recibido, null, 2);
      expect(ExportacionGeoJsonSchema.safeParse(recibido).success).toBe(true);
      const fetch = recibir(texto);
      const resultado = await exportarGeoJson({ categoria, estado: 'validado' });
      expect(resultado.texto).toBe(texto);
      expect(resultado.resumen).toEqual({
        total: features.length + 1,
        exportados: features.length,
        truncado: true,
      });
      expect(
        new URL(String(fetch.mock.calls[0]?.[0]), 'https://panel.invalid').searchParams.get(
          'categoria',
        ),
      ).toBe(categoria);
      for (const f of JSON.parse(resultado.texto).features) {
        if (f.properties.categoria !== 'inundacion')
          for (const campo of camposAgua) expect(f.properties[campo]).toBeNull();
      }
    },
  );

  it('rechaza una exportación con tipo inválido para el esquema de lectura vigente', async () => {
    const f = reporteReal('basura');
    // La lectura genérica permite valores planos por compatibilidad; un número sí es inválido.
    const recibido = {
      ...exportacion([f]),
      features: [{ ...f, properties: { ...f.properties, profundidad_estimada: 123 } }],
    };
    expect(ExportacionGeoJsonSchema.safeParse(recibido).success).toBe(false);
    recibir(JSON.stringify(recibido));
    await expect(exportarGeoJson({ categoria: 'basura' })).rejects.toBeInstanceOf(
      ErrorExportacionInvalida,
    );
  });
});

describe('moderación, roles y fusión mantienen el núcleo común', () => {
  it.each(nuevas)(
    '$categoria consume validar y reclasificar con motivo y seis nulos',
    async ({ categoria }) => {
      const f = reporteReal(categoria);
      f.properties.estado = 'validado';
      f.properties.verificado = true;
      recibir(JSON.stringify(f));
      expect(await cambiarEstado(f.properties.id, { estado: 'validado' })).toEqual(f);
      const cuerpo = {
        severidad_manual: 'critica',
        severidad_motivo: 'Revisión técnica sintética',
      } as const;
      const fetch = recibir(JSON.stringify(f));
      expect(await reclasificarSeveridad(f.properties.id, cuerpo)).toEqual(f);
      expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(cuerpo);
      for (const campo of camposAgua) expect(f.properties[campo]).toBeNull();
    },
  );

  it.each(categorias)('%s conserva acceso y acciones por rol', (categoria) => {
    const f = reporteReal(categoria);
    for (const rol of ['tecnico', 'admin'] as const) {
      expect(accionesModeracion('nuevo', rol).validar).toBe(true);
      expect(puedeVerRuta(rol, '/reportes')).toBe(true);
    }
    expect(accionesModeracion('validado', 'tecnico').retirar).toBe(false);
    expect(accionesModeracion('validado', 'admin').retirar).toBe(true);
    for (const rol of ['ciudadano', 'ejecutivo'] as const) {
      expect(Object.values(accionesModeracion('nuevo', rol))).not.toContain(true);
      expect(puedeVerRuta(rol, '/reportes')).toBe(false);
      expect(render(createElement(PanelAcciones, { reporte: f, rol }))).not.toMatch(
        /boton-validar|boton-rechazar|boton-fusionar/,
      );
    }
    expect(puedeEntrarAlPanel('ciudadano')).toBe(false);
    expect(puedeVerRuta('ejecutivo', '/ejecutivo')).toBe(true);
  });

  it.each(categorias)('desde Todas la fusión %s conserva solo su categoría', (categoria) => {
    const origen = reporteReal(categoria);
    const candidatos = categorias.map((c, i) => {
      const f = reporteReal(c);
      f.id = f.properties.id = `bbbbbbbb-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
      f.properties.estado = 'validado';
      return f;
    });
    const centro = { lon: origen.geometry.coordinates[0], lat: origen.geometry.coordinates[1] };
    expect(parametrosCandidatosFusion(centro, 100, categoria).categoria).toBe(categoria);
    expect(
      candidatosCercanos(candidatos, { id: origen.properties.id, centro, categoria }, 100).map(
        (c) => c.id,
      ),
    ).toEqual(
      candidatos.filter((f) => f.properties.categoria === categoria).map((f) => f.properties.id),
    );
  });
});

describe('salida Next independiente optativa del panel', () => {
  it.each([undefined, '0', 'true', 'otro'])(
    'flag %s conserva salida habitual y cabeceras',
    async (valor) => {
      vi.stubEnv('CURICHI_INSTALACION_LOCAL', valor);
      vi.resetModules();
      const { default: config } = await import('../../next.config');
      expect(config).not.toHaveProperty('distDir');
      expect(config.output).toBe('standalone');
      expect(config.experimental?.proxyTimeout).toBe(180_000);
      expect(await config.headers?.()).toContainEqual({
        source: '/(.*)',
        headers: expect.arrayContaining([
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
          },
        ]),
      });
    },
  );

  it('solo flag 1 selecciona .next-multitematica y conserva la configuración habitual', async () => {
    vi.stubEnv('CURICHI_INSTALACION_LOCAL', undefined);
    vi.resetModules();
    const habitual = (await import('../../next.config')).default;
    vi.stubEnv('CURICHI_INSTALACION_LOCAL', '1');
    vi.resetModules();
    const local = (await import('../../next.config')).default;
    const { distDir, ...resto } = local;
    expect(distDir).toBe('.next-multitematica');
    expect({ ...resto, headers: undefined }).toEqual({ ...habitual, headers: undefined });
    expect(await local.headers?.()).toEqual(await habitual.headers?.());
  });
});
