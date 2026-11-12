import {
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_BACHE,
  DEFINICION_INUNDACION,
  type DetalleBache,
  type MiReporte,
  MiReporteFeatureSchema,
  REGISTRO_CATEGORIAS,
  ReporteCrearCategoriaSchema,
  ReporteFeatureSchema,
  SesionActualSchema,
  type Severidad,
  type SlugCategoria,
  type SubtipoBache,
} from 'contracts';
import { type ComponentProps, createElement, type ReactElement, type ReactNode } from 'react';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESENTADOR_GENERICO } from '@/componentes/categorias/generico';
import { presentadorDe } from '@/componentes/categorias/registro';
import {
  ADAPTADORES_FORMULARIO,
  adaptadorFormularioDe,
} from '@/componentes/formulario-categorias/registro';
import { HojaDetalle } from '@/componentes/HojaDetalle';
import { EstadoDelAutor } from '@/componentes/MisReportes';
import { TarjetaReporte } from '@/componentes/TarjetaReporte';
import { guardarBorrador, leerBorrador } from './borrador';
import {
  activasDelRegistro,
  conservarSoloDeLaMismaCategoria,
  type EstadoMapaCategoria,
  guardarPreferenciaCategoria,
  hrefReportar,
  leerPreferenciaCategoria,
  reiniciarAlCambiarCategoria,
  resolverCategoriaDeUrl,
  urlTrasElegirCategoria,
} from './categoria';
import { ProveedorCategorias } from './categorias-contexto';
import { ProveedorCiudad } from './ciudad-contexto';
import { restantesDeCategoria, textoCupo } from './cupo';
import {
  armarEnvio,
  crearResolverFormulario,
  PASOS_REPORTE,
  pasoDelError,
  type ValoresFormulario,
  valoresIniciales,
  valoresTrasCambiarCategoria,
} from './formulario-reporte';
import { demoraDeCategoria } from './publicacion';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '' }),
}));

// CA8–9: definición y registro productivos; las pruebas sintéticas siguen en sus archivos.
const adaptador = adaptadorFormularioDe(DEFINICION_BACHE);
const ahora = new Date('2026-10-19T12:00:00-04:00');
const punto = { lat: -17.78, lon: -63.18 };
const dispositivo = { ...punto, precision_m: 10, antiguedad_s: 1 };
const foto = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp';
const detalle: DetalleBache = { gravedad_declarada: 'peligroso', tamano: 'rueda' };
const opcionesResolver = {
  criteriaMode: 'firstError' as const,
  fields: {},
  shouldUseNativeValidation: false,
};
const camposAgua = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
];

const tipos = [
  { valor: 'bache', etiqueta: 'Bache' },
  { valor: 'hundimiento_calzada', etiqueta: 'Hundimiento de calzada' },
  { valor: 'tapa_alcantarilla_faltante', etiqueta: 'Tapa de alcantarilla faltante' },
  { valor: 'asfalto_levantado', etiqueta: 'Asfalto levantado' },
  { valor: 'calle_tierra_intransitable', etiqueta: 'Calle de tierra intransitable' },
] satisfies ReadonlyArray<{ valor: SubtipoBache; etiqueta: string }>;

const bandas = [
  ['se_puede_pasar', 'plato', 'baja'],
  ['se_puede_pasar', 'rueda', 'baja'],
  ['se_puede_pasar', 'medio_carril', 'media'],
  ['se_puede_pasar', 'todo_el_carril', 'alta'],
  ['hay_que_esquivar', 'plato', 'media'],
  ['hay_que_esquivar', 'rueda', 'media'],
  ['hay_que_esquivar', 'medio_carril', 'alta'],
  ['hay_que_esquivar', 'todo_el_carril', 'alta'],
  ['peligroso', 'plato', 'alta'],
  ['peligroso', 'rueda', 'alta'],
  ['peligroso', 'medio_carril', 'alta'],
  ['peligroso', 'todo_el_carril', 'critica'],
  ['causo_accidente', 'plato', 'critica'],
  ['causo_accidente', 'rueda', 'critica'],
  ['causo_accidente', 'medio_carril', 'critica'],
  ['causo_accidente', 'todo_el_carril', 'critica'],
] satisfies ReadonlyArray<
  readonly [DetalleBache['gravedad_declarada'], DetalleBache['tamano'], Severidad]
>;

const html = (nodo: ReactElement) => renderToStaticMarkup(nodo);

function conInstalacion(
  hijo: ReactNode,
  activas: readonly SlugCategoria[] = ['inundacion', 'bache'],
) {
  const categorias = jsx(ProveedorCategorias, {
    activas,
    children: hijo,
  } satisfies ComponentProps<typeof ProveedorCategorias>);
  return jsx(ProveedorCiudad, {
    ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
    children: categorias,
  } satisfies ComponentProps<typeof ProveedorCiudad>);
}

/** Como el armazón real: defaultValues parciales, sin rellenar los campos planos de agua. */
function montarPaso2(cambios: Partial<ValoresFormulario> = {}) {
  const formularios: UseFormReturn<ValoresFormulario>[] = [];
  function Paso2Real() {
    const form = useForm<ValoresFormulario>({
      defaultValues: {
        ...valoresIniciales(),
        ...adaptador.valoresIniciales(),
        descripcion: 'Falta una tapa y el pozo es peligroso para quienes pasan.',
        detalle: { ...detalle },
        subtipo: 'tapa_alcantarilla_faltante',
        ...cambios,
      },
    });
    formularios.push(form);
    return createElement(adaptador.CuerpoPaso2, {
      form,
      valores: form.getValues(),
      errores: {},
      definicion: DEFINICION_BACHE,
      ahora,
    });
  }
  const marcado = html(createElement(Paso2Real));
  const formulario = formularios[0];
  if (formulario === undefined) throw new Error('El formulario real no se montó.');
  return { marcado, valores: formulario.getValues() };
}

function reporteBache(subtipo: string | null = 'tapa_alcantarilla_faltante') {
  return ReporteFeatureSchema.parse({
    type: 'Feature',
    id: '22222222-2222-4222-8222-222222222222',
    geometry: { type: 'Point', coordinates: [punto.lon, punto.lat] },
    properties: {
      id: '22222222-2222-4222-8222-222222222222',
      categoria: 'bache',
      subtipo,
      detalle: { ...detalle },
      creado_en: ahora.toISOString(),
      evento_en: null,
      distrito: { id: 'distrito_municipal:1', codigo: '1', nombre: 'Distrito 1' },
      unidad_vecinal: { id: 'unidad_vecinal:57', codigo: '57', nombre: 'Unidad Vecinal 57' },
      descripcion: 'Falta una tapa y el pozo es peligroso para quienes pasan.',
      fotos: [],
      profundidad_estimada: null,
      frecuencia: null,
      causa_presunta: null,
      severidad: 'alta',
      severidad_calculada: 'alta',
      estado: 'nuevo',
      verificado: false,
      punto_critico_id: null,
      n_reportes_punto: null,
      precision_degradada: false,
    },
  });
}

function almacenEnMemoria() {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
    removeItem: (clave: string) => {
      datos.delete(clave);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('M6.4 CA8: formulario Bache real por el adaptador declarativo', () => {
  it('usa cuatro pasos y el renderizador común con tipo, gravedad y tamaño, sin agua', () => {
    expect(PASOS_REPORTE).toBe(4);
    expect(REGISTRO_CATEGORIAS.obtener('bache')).toBe(DEFINICION_BACHE);
    expect(DEFINICION_BACHE.componenteEspecialPaso2).toBeUndefined();
    expect(Object.keys(ADAPTADORES_FORMULARIO)).toEqual([
      'inundacion/paso2',
      'area_verde/paso2',
      'basura/paso2',
    ]);
    const { marcado, valores } = montarPaso2();
    expect(marcado).toContain('<legend class="lbl">Tipo de problema</legend>');
    expect(marcado).toContain('name="subtipo"');
    expect(marcado).toContain('name="detalle.gravedad_declarada"');
    expect(marcado).toContain('name="detalle.tamano"');
    for (const tipo of tipos) expect(marcado).toContain(tipo.etiqueta);
    expect(marcado).not.toMatch(
      /Profundidad|Frecuencia|Causa presunta|Sumidero|<legend[^>]*>Subtipo/,
    );
    for (const campo of camposAgua) expect(valores).not.toHaveProperty(campo);
  });

  it.each(tipos)('resuelve y envía $valor; la revisión usa su etiqueta $etiqueta', async (tipo) => {
    const { valores } = montarPaso2({ subtipo: tipo.valor });
    expect(adaptador.puedeAvanzarPaso2(valores, ahora)).toBe(true);
    const resultado = await crearResolverFormulario(adaptador)(
      valores,
      { ubicacion: punto },
      opcionesResolver,
    );
    expect(resultado.errors).toEqual({});
    expect(resultado.values).toMatchObject({ detalle, subtipo: tipo.valor });
    // El resolver real devuelve el núcleo validado; el adaptador aporta solo su detalle/subtipo.
    const cuerpo = armarEnvio(valores, punto, [{ objeto_key: foto }], dispositivo, adaptador);
    expect(ReporteCrearCategoriaSchema.safeParse(cuerpo).success).toBe(true);
    expect(DEFINICION_BACHE.esquemaDetalle.safeParse(cuerpo.detalle).success).toBe(true);
    expect(cuerpo).toMatchObject({
      categoria: 'bache',
      subtipo: tipo.valor,
      detalle,
      fotos: [foto],
      dispositivo,
    });
    expect(Object.keys(cuerpo.detalle).sort()).toEqual(['gravedad_declarada', 'tamano']);
    for (const campo of camposAgua) {
      expect(cuerpo).not.toHaveProperty(campo);
      expect(resultado.values).not.toHaveProperty(campo);
    }
    expect(adaptador.filasRevision(valores)).toEqual([
      { etiqueta: 'Tipo de problema', valor: tipo.etiqueta, paso: 2 },
      { etiqueta: '¿Qué tan grave es?', valor: 'Es peligroso, sobre todo de noche', paso: 2 },
      { etiqueta: '¿Qué tamaño tiene?', valor: 'Como una rueda', paso: 2 },
    ]);
  });

  it.each([undefined, null, '', 'tipo_desconocido'])(
    'rechaza el tipo ausente/inválido (%j) y lleva al paso 2',
    async (subtipo) => {
      const { valores } = montarPaso2({ subtipo });
      expect(adaptador.puedeAvanzarPaso2(valores, ahora)).toBe(false);
      const resultado = await crearResolverFormulario(adaptador)(
        valores,
        { ubicacion: punto },
        opcionesResolver,
      );
      expect(resultado.errors).toHaveProperty('subtipo');
      expect(pasoDelError(Object.keys(resultado.errors), adaptador.pasoDeCampo)).toBe(2);
      expect(
        adaptador.filasRevision(valores).some((fila) => fila.etiqueta === 'Tipo de problema'),
      ).toBe(false);
    },
  );

  it.each([
    {},
    { gravedad_declarada: 'peligroso' },
    { tamano: 'rueda' },
    { gravedad_declarada: 'inventada', tamano: 'rueda' },
    { gravedad_declarada: 'peligroso', tamano: 'gigante' },
    { ...detalle, profundidad_estimada: 'rodilla' },
    { ...detalle, subtipo: 'bache' },
  ])('rechaza el detalle incompleto, ajeno o cruzado %j sin previsualización', async (entrada) => {
    const { valores } = montarPaso2({ detalle: entrada });
    const resultado = await crearResolverFormulario(adaptador)(
      valores,
      { ubicacion: punto },
      opcionesResolver,
    );
    expect(resultado.errors).toHaveProperty('detalle');
    expect(pasoDelError(Object.keys(resultado.errors), adaptador.pasoDeCampo)).toBe(2);
    expect(adaptador.previsualizarSeveridad(valores)).toBeNull();
  });

  it.each(bandas)(
    'previsualiza %s / %s como %s, sin puntaje de agua',
    (gravedad_declarada, tamano, banda) => {
      const { valores } = montarPaso2({ detalle: { gravedad_declarada, tamano } });
      expect(adaptador.previsualizarSeveridad(valores)).toEqual({ banda });
    },
  );
});

describe('M6.4 CA8: presentación Bache real con planos nulos', () => {
  it.each(tipos)('detalle y tarjeta muestran el tipo legible $etiqueta', (tipo) => {
    const reporte = reporteBache(tipo.valor);
    expect(presentadorDe('bache')).toBe(PRESENTADOR_GENERICO);
    const marcado = html(conInstalacion(createElement(HojaDetalle, { reporte })));
    expect(marcado).toContain(`<dt>Tipo de problema</dt><dd>${tipo.etiqueta}</dd>`);
    expect(marcado).toContain(
      '<dt>¿Qué tan grave es?</dt><dd>Es peligroso, sobre todo de noche</dd>',
    );
    expect(marcado).toContain('<dt>¿Qué tamaño tiene?</dt><dd>Como una rueda</dd>');
    expect(marcado).toContain('NO SE HA VERIFICADO');
    expect(marcado).toContain('categoria=bache');
    expect(marcado).not.toMatch(/Profundidad|Frecuencia|Causa presunta|Sumidero|Rodilla|Tobillo/);
    const tarjeta = html(conInstalacion(createElement(TarjetaReporte, { reporte })));
    expect(tarjeta).toContain(`<span class="mini">${tipo.etiqueta}</span>`);
    expect(tarjeta).not.toContain('Sin datos');
    expect(marcado).not.toMatch(/detalle_version|severidad_version|Versión histórica/);
  });

  it.each([null, 'tipo_historico_desconocido'])(
    'no inventa un tipo actual para un reporte histórico con subtipo %j',
    (subtipo) => {
      const reporte = reporteBache(subtipo);
      const marcado = html(conInstalacion(createElement(HojaDetalle, { reporte })));
      expect(marcado).not.toContain('<dt>Tipo de problema</dt>');
      expect(marcado).toContain('Como una rueda');
      const tarjeta = html(conInstalacion(createElement(TarjetaReporte, { reporte })));
      expect(tarjeta).toContain('<span class="mini">Es peligroso, sobre todo de noche</span>');
      if (subtipo !== null) expect(marcado).not.toContain(subtipo);
    },
  );

  const estadosPropios = [
    {
      estado: 'nuevo',
      segundos: 60,
      retirado: false,
      verificado: false,
      etiqueta: 'Se publica en',
    },
    {
      estado: 'nuevo',
      segundos: 0,
      retirado: false,
      verificado: false,
      etiqueta: 'NO SE HA VERIFICADO',
    },
    { estado: 'validado', segundos: 0, retirado: false, verificado: true, etiqueta: 'Verificado' },
    { estado: 'resuelto', segundos: 0, retirado: false, verificado: true, etiqueta: 'Resuelto' },
    {
      estado: 'rechazado',
      segundos: 0,
      retirado: true,
      verificado: false,
      etiqueta: 'Retirado del mapa',
    },
    {
      estado: 'duplicado',
      segundos: 0,
      retirado: true,
      verificado: false,
      etiqueta: 'Sumado a otro punto',
    },
  ] satisfies ReadonlyArray<{
    estado: MiReporte['estado'];
    segundos: number;
    retirado: boolean;
    verificado: boolean;
    etiqueta: string;
  }>;

  it.each(estadosPropios)(
    'la vista del autor conserva $estado/$segundos y su etiqueta $etiqueta',
    (caso) => {
      const publico = reporteBache();
      const propio = MiReporteFeatureSchema.parse({
        ...publico,
        properties: {
          ...publico.properties,
          estado: caso.estado,
          verificado: caso.verificado,
          publicar_en: ahora.toISOString(),
          segundos_para_publicar: caso.segundos,
          retirado: caso.retirado,
        },
      });
      expect(propio.properties).toMatchObject({
        categoria: 'bache',
        detalle,
        profundidad_estimada: null,
        frecuencia: null,
        causa_presunta: null,
      });
      const marcado = html(
        createElement(EstadoDelAutor, { reporte: propio.properties, recibidoEn: Date.now() }),
      );
      expect(marcado).toContain(caso.etiqueta);
      expect(marcado).not.toMatch(/Rodilla|Tobillo|Frecuencia|Causa presunta/);
    },
  );
});

describe('M6.4 CA9: selección y almacenamiento con dos definiciones reales', () => {
  it('exige catálogo y definición entre las cuatro reales; el registro no activa categorías', () => {
    expect(REGISTRO_CATEGORIAS.slugs).toEqual(['inundacion', 'bache', 'area_verde', 'basura']);
    expect(activasDelRegistro(['inundacion'], REGISTRO_CATEGORIAS)).toEqual(['inundacion']);
    expect(activasDelRegistro(['bache', 'inundacion'], REGISTRO_CATEGORIAS)).toEqual([
      'inundacion',
      'bache',
    ]);
    const sinBache = crearRegistroCategorias([DEFINICION_INUNDACION]);
    expect(activasDelRegistro(['inundacion', 'bache'], sinBache)).toEqual(['inundacion']);
    expect(activasDelRegistro(['area_verde', 'basura'], REGISTRO_CATEGORIAS)).toEqual([
      'area_verde',
      'basura',
    ]);
    expect(activasDelRegistro(['area_verde', 'basura'], sinBache)).toEqual([]);
  });

  it.each([
    { query: '?categoria=Baches', guardada: 'inundacion', efectiva: 'bache' },
    { query: '?categoria=inundacion', guardada: 'bache', efectiva: 'inundacion' },
    { query: '', guardada: 'bache', efectiva: 'bache' },
    { query: '', guardada: null, efectiva: 'inundacion' },
  ])(
    'resuelve $query con preferencia $guardada como $efectiva',
    ({ query, guardada, efectiva }) => {
      const href = `https://ejemplo.test/mapa${query}#zona`;
      const resultado = resolverCategoriaDeUrl({
        href,
        activas: ['inundacion', 'bache'],
        guardada,
        registro: REGISTRO_CATEGORIAS,
      });
      expect(resultado.efectiva).toBe(efectiva);
      const url = new URL(resultado.urlNueva ?? href);
      expect(url.searchParams.get('categoria')).toBe(efectiva);
      expect(url.hash).toBe('#zona');
      expect(resultado.anuncio).toBeNull();
    },
  );

  it('ignora Baches registrada pero inactiva en URL/preferencia y corrige la URL', () => {
    const resultado = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/mapa?categoria=bache&zona=57#detalle',
      activas: ['inundacion'],
      guardada: 'bache',
      registro: REGISTRO_CATEGORIAS,
    });
    expect(resultado.efectiva).toBe('inundacion');
    expect(resultado.anuncio).toBe('Esa categoría no está disponible: mostrando Inundaciones');
    const url = new URL(resultado.urlNueva ?? 'https://ejemplo.test/');
    expect(url.searchParams.has('categoria')).toBe(false);
    expect(url.searchParams.get('zona')).toBe('57');
    expect(url.hash).toBe('#detalle');
  });

  it('la preferencia del mapa guarda solo el slug y los enlaces conservan categoría y punto', () => {
    const almacen = almacenEnMemoria();
    guardarPreferenciaCategoria('bache', almacen);
    expect(leerPreferenciaCategoria(almacen)).toEqual({ v: 1, slug: 'bache' });
    expect([...almacen.datos.values()]).toEqual(['{"v":1,"slug":"bache"}']);
    expect(hrefReportar({ categoria: 'bache', cantidadActivas: 2, ...punto })).toBe(
      '/reportar?lat=-17.78&lon=-63.18&categoria=bache',
    );
    expect(hrefReportar({ categoria: 'inundacion', cantidadActivas: 1 })).toBe('/reportar');
    expect(urlTrasElegirCategoria('https://ejemplo.test/mapa?zona=57#vista', 'bache', 2)).toBe(
      'https://ejemplo.test/mapa?zona=57&categoria=bache#vista',
    );
  });

  it('el cambio a Baches conserva encuadre/zona y limpia filtros, selección y datos de otra categoría', () => {
    const anterior: EstadoMapaCategoria = {
      bbox: '-63.2,-17.8,-63.1,-17.7',
      distrito: { id: 'distrito:1', codigo: '1', nombre: 'Distrito 1' },
      unidadVecinal: { id: 'uv:57', codigo: '57' },
      capaVisible: 'distritos',
      severidad: 'alta',
      puntoCritico: 'grupo-anterior',
      seleccionado: 'reporte-anterior',
      hojaAbierta: true,
      texto: 'anterior',
      busqueda: 'anterior',
      panelFiltrosAbierto: true,
    };
    const copia = structuredClone(anterior);
    const siguiente = reiniciarAlCambiarCategoria(anterior, DEFINICION_BACHE);
    expect(siguiente).toEqual({
      ...anterior,
      severidad: null,
      puntoCritico: null,
      seleccionado: null,
      hojaAbierta: false,
      texto: '',
      busqueda: '',
      panelFiltrosAbierto: false,
    });
    expect(anterior).toEqual(copia);
    const previo = reporteBache();
    expect(
      conservarSoloDeLaMismaCategoria('inundacion', previo, ['reportes', { categoria: 'bache' }]),
    ).toBeUndefined();
    expect(
      conservarSoloDeLaMismaCategoria('bache', previo, ['reportes', { categoria: 'bache' }]),
    ).toBe(previo);
  });

  it('el borrador 3 conserva respuestas/tipo y rechaza restaurarlas en la otra categoría', () => {
    const almacen = almacenEnMemoria();
    vi.stubGlobal('window', { sessionStorage: almacen });
    const { valores } = montarPaso2();
    // Entrada contaminada deliberada: guardarBorrador debe seguir eliminando el dispositivo.
    const contaminados = { ...valores, dispositivo };
    guardarBorrador({
      categoria: 'bache',
      paso: 4,
      ubicacion: punto,
      resuelto: null,
      fotos: [],
      valores: contaminados,
      clave: 'm6-bache-real',
    });
    expect(leerBorrador('bache')).toMatchObject({
      categoria: 'bache',
      paso: 4,
      valores: { subtipo: 'tapa_alcantarilla_faltante', detalle },
      clave: 'm6-bache-real',
    });
    expect(leerBorrador('inundacion')).toBeNull();
    const guardado = [...almacen.datos.values()].join('');
    expect(guardado).toContain('"formato":3');
    expect(guardado).not.toMatch(/dispositivo|precision_m|antiguedad_s/);
  });

  it('cambiar de categoría conserva núcleo y fotos pero reinicia detalle/tipo anteriores', () => {
    const { valores } = montarPaso2({ fotos: [foto] });
    const flood = adaptadorFormularioDe(DEFINICION_INUNDACION);
    const intermedio = valoresTrasCambiarCategoria(valores, flood.valoresIniciales());
    expect(intermedio).not.toHaveProperty('detalle');
    expect(intermedio.subtipo).toBeUndefined();
    const vuelta = valoresTrasCambiarCategoria(intermedio, adaptador.valoresIniciales());
    expect(vuelta.detalle).toEqual({});
    expect(vuelta.subtipo).toBeUndefined();
    expect(vuelta.descripcion).toBe(valores.descripcion);
    expect(vuelta.fotos).toEqual([foto]);
    for (const campo of camposAgua) expect(vuelta).not.toHaveProperty(campo);
  });

  it('lee cupo/demora reales de cada categoría y conserva el cupo de fotos global', () => {
    const sesion = SesionActualSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'vecina@ejemplo.test',
      nombre: 'Vecina',
      rol: 'ciudadano',
      reportes_restantes_hoy: 0,
      puede_reportar_desde: '2026-10-20T00:00:00-04:00',
      demora_proximo_s: 240,
      cupos: {
        inundacion: {
          restantes: 0,
          demora_proximo_s: 240,
          puede_reportar_desde: '2026-10-20T00:00:00-04:00',
        },
        bache: { restantes: 7, demora_proximo_s: 90, puede_reportar_desde: null },
      },
      fotos_restantes_hoy: 5,
    });
    expect(restantesDeCategoria(sesion, 'bache')).toBe(7);
    expect(textoCupo(restantesDeCategoria(sesion, 'bache') ?? 0)).toBe('Te quedan 7 reportes hoy');
    expect(demoraDeCategoria(sesion, 'bache')).toBe(90);
    expect(restantesDeCategoria(sesion, 'inundacion')).toBe(0);
    expect(demoraDeCategoria(sesion, 'inundacion')).toBeNull();
    expect(sesion.fotos_restantes_hoy).toBe(5);
  });
});
