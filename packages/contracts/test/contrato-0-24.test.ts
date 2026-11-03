import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  CONFIG_DOMINIO,
  construirOpenApi,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  type DetalleAreaVerde,
  DetalleAreaVerdeSchema,
  type DetalleBasura,
  DetalleBasuraSchema,
  GRAVEDADES_AREA_VERDE,
  GRAVEDADES_BASURA,
  normalizarReporteCrear,
  REGISTRO_CATEGORIAS,
  SLUGS_CATEGORIA,
  SUBTIPOS_AREA_VERDE,
  SUBTIPOS_BASURA,
  SubtipoAreaVerdeSchema,
  SubtipoBasuraSchema,
  TAMANOS_AREA_VERDE,
  TAMANOS_BASURA,
} from '../src/index.js';

const BASURA = {
  definicion: DEFINICION_BASURA,
  esquema: DetalleBasuraSchema,
  esquemaSubtipo: SubtipoBasuraSchema,
  subtipos: SUBTIPOS_BASURA,
  gravedades: GRAVEDADES_BASURA,
  tamanos: TAMANOS_BASURA,
  etiquetasSubtipo: [
    'Microbasural',
    'Contenedor desbordado',
    'Quema de basura',
    'Escombros en la vía',
    'Basura en un canal',
  ],
  etiquetasGravedad: [
    'Unas bolsas sueltas',
    'Se acumula hace días',
    'Ocupa la vereda o la calle',
    'Hay quema o tapa un desagüe',
  ],
  etiquetasTamano: ['Unas bolsas', 'Una carretilla', 'Una camioneta', 'Un camión o más'],
};
const AREA_VERDE = {
  definicion: DEFINICION_AREA_VERDE,
  esquema: DetalleAreaVerdeSchema,
  esquemaSubtipo: SubtipoAreaVerdeSchema,
  subtipos: SUBTIPOS_AREA_VERDE,
  gravedades: GRAVEDADES_AREA_VERDE,
  tamanos: TAMANOS_AREA_VERDE,
  etiquetasSubtipo: [
    'Parque o plaza descuidada',
    'Juegos infantiles rotos',
    'Árbol caído o rama peligrosa',
    'Pasto seco o sin riego',
    'Persona en situación de calle',
  ],
  etiquetasGravedad: [
    'Se ve descuidado',
    'Ya no se puede usar bien',
    'Es un riesgo para quien va',
    'Peligro inmediato',
  ],
  etiquetasTamano: ['Un rincón', 'Media plaza', 'Casi toda la plaza', 'Toda el área verde'],
};

describe('0.24: registro disponible de cuatro y compatibilidad', () => {
  it('exporta definiciones reales en orden canónico sin activar ningún catálogo', () => {
    expect(REGISTRO_CATEGORIAS.slugs).toEqual(['inundacion', 'bache', 'area_verde', 'basura']);
    expect(REGISTRO_CATEGORIAS.slugs).toEqual(SLUGS_CATEGORIA);
    expect(REGISTRO_CATEGORIAS.definiciones).toEqual([
      DEFINICION_INUNDACION,
      DEFINICION_BACHE,
      DEFINICION_AREA_VERDE,
      DEFINICION_BASURA,
    ]);
    for (const def of REGISTRO_CATEGORIAS.definiciones) {
      expect(REGISTRO_CATEGORIAS.obtener(def.slug)).toBe(def);
      expect(Object.hasOwn(def, 'activa')).toBe(false);
    }
    expect(REGISTRO_CATEGORIAS.obtener('inventada')).toBeUndefined();
    const aislado = crearRegistroCategorias([DEFINICION_INUNDACION]);
    expect(aislado.tiene('basura')).toBe(false);
    expect(aislado.tiene('area_verde')).toBe(false);
    expect(DEFINICION_INUNDACION.severidad.version).toBe(2);
    expect(DEFINICION_INUNDACION.recurrenciaRadioM).toBe(25);
    expect(DEFINICION_BACHE.severidad.version).toBe(1);
    expect(DEFINICION_BACHE.recurrenciaRadioM).toBe(10);
    expect(CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M).toBe(60);
  });

  it('fija los identificadores exactos aprobados, sin alias dentro del detalle', () => {
    expect(SUBTIPOS_BASURA).toEqual([
      'microbasural',
      'contenedor_desbordado',
      'quema_basura',
      'escombros_via',
      'basura_canal',
    ]);
    expect(GRAVEDADES_BASURA).toEqual([
      'bolsas_sueltas',
      'acumulada_dias',
      'ocupa_via',
      'quema_o_desague',
    ]);
    expect(TAMANOS_BASURA).toEqual(['bolsas', 'carretilla', 'camioneta', 'camion_o_mas']);
    expect(SUBTIPOS_AREA_VERDE).toEqual([
      'parque_plaza_descuidada',
      'juegos_infantiles_rotos',
      'arbol_rama_peligrosa',
      'pasto_sin_riego',
      'persona_situacion_calle',
    ]);
    expect(GRAVEDADES_AREA_VERDE).toEqual([
      'descuidado',
      'uso_limitado',
      'riesgo',
      'peligro_inmediato',
    ]);
    expect(TAMANOS_AREA_VERDE).toEqual([
      'rincon',
      'media_plaza',
      'casi_toda_plaza',
      'toda_area_verde',
    ]);
    expectTypeOf<DetalleBasura>().toEqualTypeOf<{
      gravedad_declarada: 'bolsas_sueltas' | 'acumulada_dias' | 'ocupa_via' | 'quema_o_desague';
      tamano: 'bolsas' | 'carretilla' | 'camioneta' | 'camion_o_mas';
    }>();
    expectTypeOf<DetalleAreaVerde>().toEqualTypeOf<{
      gravedad_declarada: 'descuidado' | 'uso_limitado' | 'riesgo' | 'peligro_inmediato';
      tamano: 'rincon' | 'media_plaza' | 'casi_toda_plaza' | 'toda_area_verde';
    }>();
  });

  it('publica versión 0.24.0 por el mismo entrypoint sin dependencias React', () => {
    const paquete = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(paquete.version).toBe('0.24.0');
    expect(paquete.exports['.']).toEqual({ types: './dist/index.d.ts', import: './dist/index.js' });
    expect(Object.keys(paquete.dependencies)).toEqual(['zod']);
  });
});

describe.each([BASURA, AREA_VERDE])('0.24: $definicion.slug declarativa', (caso) => {
  const def = caso.definicion;
  it('mantiene cinco subtipos obligatorios en el núcleo, separados del detalle', () => {
    expect(def.subtipos?.map((o) => o.valor)).toEqual([...caso.subtipos]);
    expect(def.subtipos?.map((o) => o.etiqueta)).toEqual(caso.etiquetasSubtipo);
    for (const subtipo of caso.subtipos) {
      expect(caso.esquemaSubtipo.parse(subtipo)).toBe(subtipo);
      for (const gravedad_declarada of caso.gravedades)
        for (const tamano of caso.tamanos) {
          const detalle = { gravedad_declarada, tamano };
          expect(caso.esquema.safeParse(detalle).success).toBe(true);
          expect(caso.esquema.safeParse({ ...detalle, subtipo }).success).toBe(false);
        }
    }
    for (const subtipo of [
      undefined,
      null,
      '',
      'otro',
      1,
      'Bache',
      ...(def.slug === 'basura' ? SUBTIPOS_AREA_VERDE : SUBTIPOS_BASURA),
    ])
      expect(caso.esquemaSubtipo.safeParse(subtipo).success).toBe(false);
  });

  it('deriva las dos preguntas y sus campos públicos/exportables del esquema estricto', () => {
    const claves = Object.keys(caso.esquema.shape);
    expect(claves).toEqual(['gravedad_declarada', 'tamano']);
    expect(def.preguntas.map((p) => p.id)).toEqual(claves);
    expect(def.preguntas.every((p) => p.obligatoria && p.tipo === 'opcion_unica')).toBe(true);
    expect(def.preguntas.map((p) => p.etiqueta)).toEqual([
      '¿Qué tan grave es?',
      '¿Qué tamaño tiene?',
    ]);
    expect(def.preguntas[0]!.opciones!.map((o) => o.valor)).toEqual(
      caso.esquema.shape.gravedad_declarada.options,
    );
    expect(def.preguntas[1]!.opciones!.map((o) => o.valor)).toEqual(
      caso.esquema.shape.tamano.options,
    );
    expect(def.preguntas[0]!.opciones!.map((o) => o.etiqueta)).toEqual(caso.etiquetasGravedad);
    expect(def.preguntas[1]!.opciones!.map((o) => o.etiqueta)).toEqual(caso.etiquetasTamano);
    expect(def.camposPublicos).toEqual(claves);
    expect(def.camposExportacion).toEqual(claves.map((clave) => ({ clave, encabezado: clave })));
    expect(def.preguntas.flatMap((p) => p.opciones ?? []).every((o) => o.ayuda === undefined)).toBe(
      true,
    );
  });

  it('reutiliza el núcleo y normalizador; validación de detalle/subtipo queda en los esquemas de categoría', () => {
    const detalle = { gravedad_declarada: caso.gravedades[0], tamano: caso.tamanos[0] };
    const entrada = {
      categoria: def.slug,
      subtipo: caso.subtipos[0],
      detalle,
      lat: -17.79,
      lon: -63.195,
      dispositivo: { lat: -17.79, lon: -63.195, precision_m: 5, antiguedad_s: 0 },
      ubicacion_tipo: 'via_publica',
      descripcion: 'Reporte sintético de contratos locales.',
    };
    const normal = normalizarReporteCrear(entrada);
    expect(normal.forma).toBe('categoria');
    expect(normal.resultado.exito).toBe(true);
    if (!normal.resultado.exito) throw new Error('Falló el núcleo compartido');
    expect(normal.resultado.datos).toMatchObject({
      categoria: def.slug,
      subtipo: caso.subtipos[0],
      detalle,
      fotos: [],
      ubicacion_aproximada: false,
    });
    expect(caso.esquema.parse(normal.resultado.datos.detalle)).toEqual(detalle);
    expect(caso.esquemaSubtipo.parse(normal.resultado.datos.subtipo)).toBe(caso.subtipos[0]);
    const otra = def.slug === 'basura' ? AREA_VERDE : BASURA;
    expect(otra.esquema.safeParse(detalle).success).toBe(false);
    expect(otra.esquemaSubtipo.safeParse(entrada.subtipo).success).toBe(false);
    for (const cambio of [{ dispositivo: undefined }, { lat: 100 }, { sitio_web: 'spam' }])
      expect(normalizarReporteCrear({ ...entrada, ...cambio }).resultado.exito).toBe(false);
  });

  it('conserva Point, modelo v1, radio 10 m y cupo desde CONFIG por cuenta/categoría/día', () => {
    expect(def).toMatchObject({
      detalleVersion: 1,
      severidad: { version: 1 },
      geometria: 'punto',
      recurrenciaRadioM: 10,
      ubicacionTipoPorDefecto: 'via_publica',
      cupo: {
        id: 'reportes_por_dia',
        ambito: 'cuenta+categoria',
        ventana: 'dia_local',
        limite: CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
      },
    });
    expect(def.filtros).toEqual([
      { id: 'severidad', etiqueta: 'Severidad', campo: 'severidad', alcance: 'categoria' },
    ]);
    expect(def.notaMetodologica).toContain('percepción ciudadana');
    expect(def.notaMetodologica).toContain('no comparable');
    expect(def.notaMetodologica).toContain('NO SE HA VERIFICADO');
    expect(def.notaMetodologica).toContain('No hay derivación municipal automática');
    expect(def.notaMetodologica).toContain('validarse con el municipio');
    expect(def.notaMetodologica).not.toMatch(/[\r\n]/);
    expect(def.textos?.avisoPercepcion).toContain('estimaciones ciudadanas');
  });

  it('serializa el detalle estricto y subtipo desde Zod, compatibles con el OpenAPI HTTP común', () => {
    const json = z.toJSONSchema(caso.esquema, { io: 'input' });
    expect(json.required).toEqual(['gravedad_declarada', 'tamano']);
    expect(json.additionalProperties).toBe(false);
    expect(z.toJSONSchema(caso.esquemaSubtipo, { io: 'input' }).enum).toEqual([...caso.subtipos]);
    const desdeJson = z.fromJSONSchema(json);
    for (const entrada of [
      {},
      { gravedad_declarada: caso.gravedades[0] },
      { gravedad_declarada: caso.gravedades[0], tamano: caso.tamanos[0] },
      { gravedad_declarada: caso.gravedades[0], tamano: caso.tamanos[0], extra: true },
      { gravedad_declarada: 'inventada', tamano: caso.tamanos[0] },
    ])
      expect(desdeJson.safeParse(entrada).success).toBe(caso.esquema.safeParse(entrada).success);
    const doc = construirOpenApi() as {
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    expect(doc.components.schemas.ReporteCrearCategoria!.properties).toHaveProperty('detalle');
    expect(doc.components.schemas.ReporteCrearCategoria!.properties).toHaveProperty('subtipo');
  });
});

describe('0.24: presentación y límites locales', () => {
  function luminancia(hex: string) {
    const rgb = hex
      .slice(1)
      .match(/../g)!
      .map((c) => {
        const valor = Number.parseInt(c, 16) / 255;
        return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  }
  it('respeta iconos y paleta aprobados, con contraste de c7 sobre blanco y c1', () => {
    expect(DEFINICION_BASURA).toMatchObject({
      icono: 'Trash2',
      colores: { c7: '#6B3FA0', c5: '#8462B8', c1: '#F1EBF8' },
      componenteEspecialPaso2: 'basura/paso2',
    });
    expect(DEFINICION_AREA_VERDE).toMatchObject({
      icono: 'Trees',
      colores: { c7: '#0F6E5C', c5: '#2E8B76', c1: '#E1F2EE' },
      componenteEspecialPaso2: 'area_verde/paso2',
    });
    for (const { colores } of [DEFINICION_BASURA, DEFINICION_AREA_VERDE])
      for (const fondo of ['#FFFFFF', colores.c1])
        expect((luminancia(fondo) + 0.05) / (luminancia(colores.c7) + 0.05)).toBeGreaterThanOrEqual(
          4.5,
        );
  });

  it('conserva Persona y el contexto local de privacidad sin prometer ocultación o integración', () => {
    expect(SubtipoAreaVerdeSchema.parse('persona_situacion_calle')).toBe('persona_situacion_calle');
    const nota = DEFINICION_AREA_VERDE.notaMetodologica;
    for (const texto of [
      'esto no es una denuncia',
      'Desarrollo Social para ofrecer ayuda, no seguridad',
      'No subas fotos donde se vea la cara de la persona',
      'Parques y jardines',
      'no hay ocultación ni difuminado garantizados',
      'personas y fotos sintéticas',
      'retención y marco legal',
      'antes de producción',
    ])
      expect(nota).toContain(texto);
    expect(DEFINICION_BASURA.notaMetodologica).toContain(
      'Reportar quema no sustituye la atención de emergencias',
    );
    // Los avisos por subtipo los resuelven los wrappers; no cambian la fórmula por subtipo.
    expect(DEFINICION_BASURA.avisoEmergencia).toBeUndefined();
    expect(DEFINICION_AREA_VERDE.avisoEmergencia).toBeUndefined();
  });
});
