import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  construirOpenApi,
  DEFINICION_BACHE,
  DetalleBacheSchema,
  DetalleInundacionSchema,
  ExportacionGeoJsonSchema,
  MiReporteFeatureSchema,
  MiReporteSchema,
  MisReportesSchema,
  normalizarReporteCrear,
  ReporteCrearSchema,
  ReporteFeatureCollectionSchema,
  ReporteFeatureSchema,
  ReportePublicoSchema,
  ReporteTecnicoFeatureCollectionSchema,
  ReporteTecnicoFeatureSchema,
  ReporteTecnicoSchema,
} from '../src/index.js';

const ID = '11111111-1111-4111-8111-111111111111';
const FECHA = '2026-10-18T12:00:00Z';
const PLANAS = ['profundidad_estimada', 'frecuencia', 'causa_presunta'] as const;
const PUBLICO = {
  id: ID,
  creado_en: FECHA,
  evento_en: null,
  distrito: null,
  unidad_vecinal: null,
  descripcion: 'Reporte sintético para comprobar contratos.',
  fotos: [],
  profundidad_estimada: 'rodilla',
  frecuencia: 'ocasional',
  causa_presunta: 'desconocida',
  severidad: 'media',
  severidad_calculada: 'media',
  estado: 'validado',
  verificado: true,
  punto_critico_id: null,
  n_reportes_punto: null,
  precision_degradada: false,
};
const TECNICO = {
  ...PUBLICO,
  ubicacion_metodo: 'manual',
  precision_gps_m: null,
  distancia_dispositivo_m: null,
  ubicacion_tipo: 'via_publica',
  sumidero_cercano: null,
  sumidero_estado: null,
  agua_brota_sumidero: null,
  severidad_manual: null,
  severidad_motivo: null,
  severidad_puntaje: 6,
  estado_motivo: null,
  fusionado_en_id: null,
  validado_por: null,
  validado_en: null,
  actualizado_en: FECHA,
  version_capa: null,
  resolucion_flags: {},
  autor_id: null,
};
const PROPIO = { ...PUBLICO, publicar_en: FECHA, segundos_para_publicar: 0, retirado: false };
const DETALLE = { gravedad_declarada: 'peligroso', tamano: 'medio_carril' };
const BACHE = {
  categoria: 'bache',
  subtipo: 'bache',
  detalle: DETALLE,
  profundidad_estimada: null,
  frecuencia: null,
  causa_presunta: null,
};
const VISTAS: Array<{ nombre: string; esquema: z.ZodObject; props: Record<string, unknown> }> = [
  { nombre: 'pública', esquema: ReportePublicoSchema, props: PUBLICO },
  { nombre: 'técnica', esquema: ReporteTecnicoSchema, props: TECNICO },
  { nombre: 'propia', esquema: MiReporteSchema, props: PROPIO },
];
const feature = (properties: Record<string, unknown>) => ({
  type: 'Feature',
  id: ID,
  geometry: { type: 'Point', coordinates: [-63.195, -17.79] },
  properties,
});
const coleccion = (properties: Record<string, unknown>) => ({
  type: 'FeatureCollection',
  features: [feature(properties)],
  total: 1,
  pagina: 1,
  limite: 50,
});

function sinReferencias(valor: unknown): void {
  if (valor === null || typeof valor !== 'object') return;
  expect(Object.hasOwn(valor, '$ref')).toBe(false);
  for (const hijo of Object.values(valor)) sinReferencias(hijo);
}

describe.each(VISTAS)(
  '0.23: vista $nombre conserva objeto y compatibilidad',
  ({ esquema, props }) => {
    it('acepta Bache sin inventar agua y conserva shape/strip/strict', () => {
      const bache = { ...props, ...BACHE };
      expect(esquema).toBeInstanceOf(z.ZodObject);
      expect(esquema.parse(bache)).toEqual(bache);
      expect(esquema.parse({ ...bache, extra: true })).toEqual(bache);
      expect(esquema.strict().safeParse({ ...bache, extra: true }).success).toBe(false);
      expect(esquema.strict().parse(bache)).toEqual(bache);
      expect(Object.keys(esquema.shape)).toContain('profundidad_estimada');
    });

    it.each(PLANAS)(
      'rechaza %s nulo con Inundación explícita, sin categoría o categoría vacía',
      (campo) => {
        for (const cambio of [{}, { categoria: 'inundacion' }, { categoria: '' }]) {
          const entrada = { ...props, ...cambio, [campo]: null };
          const resultado = esquema.safeParse(entrada);
          expect(resultado.success).toBe(false);
          if (!resultado.success)
            expect(resultado.error.issues.map((i) => i.path.join('.'))).toEqual([campo]);
          expect(esquema.strict().safeParse(entrada).success).toBe(false);
          const derivado = esquema.safeExtend({ marca: z.string().optional() });
          expect(derivado.safeParse(entrada).success).toBe(false);
          expect(derivado.parse({ ...props, ...BACHE, marca: 'derivado' })).toHaveProperty(
            'marca',
            'derivado',
          );
        }
      },
    );

    it('no exige campos aditivos ni normaliza o consulta registro en las respuestas', () => {
      expect(esquema.parse(props)).toEqual(props);
      for (const categoria of ['inundacion', '', 'bache', 'area_verde', 'basura', 'futura'])
        expect(esquema.parse({ ...props, categoria })).toEqual({ ...props, categoria });
      for (const categoria of [
        'bache',
        'area_verde',
        'basura',
        'futura',
        'Inundacion',
        'inundacion_extra',
      ])
        expect(esquema.parse({ ...props, ...BACHE, categoria })).toEqual({
          ...props,
          ...BACHE,
          categoria,
        });
      // La respuesta describe datos históricos: no exige detalle/subtipo actuales de Baches.
      expect(
        esquema.safeParse({ ...props, categoria: 'bache', detalle: { historico: true } }).success,
      ).toBe(true);
      for (const categoria of [undefined, null, '', 4])
        expect(esquema.safeParse({ ...props, ...BACHE, categoria }).success).toBe(false);
    });

    it('mantiene errores por campo de datos comunes y obligatoriedad de los tres planos', () => {
      const completa: Record<string, unknown> = { ...props, ...BACHE };
      const { id: _id, ...sinId } = completa;
      const resultado = esquema.safeParse(sinId);
      expect(resultado.success).toBe(false);
      if (!resultado.success)
        expect(resultado.error.issues.map((i) => i.path.join('.'))).toEqual(['id']);
      for (const campo of PLANAS) {
        const entrada: Record<string, unknown> = { ...props, ...BACHE };
        delete entrada[campo];
        expect(esquema.safeParse(entrada).success).toBe(false);
        expect(esquema.safeParse({ ...entrada, [campo]: 'inventado' }).success).toBe(false);
      }
      for (const cambios of [{ estado: 'inventado' }, { severidad: 'urgente' }, { detalle: [] }])
        expect(esquema.safeParse({ ...props, ...BACHE, ...cambios }).success).toBe(false);
    });

    it('cada final serializa la condición; strict/safeExtend conservan check y documentan al finalizar', () => {
      const json = z.toJSONSchema(esquema, { io: 'input' });
      const condicion = esquema.meta()?.allOf;
      expect(condicion).toBeDefined();
      expect(json.allOf).toEqual(condicion);
      sinReferencias(condicion);
      expect(JSON.stringify(condicion)).toContain('^(?!inundacion$)');
      for (const derivado of [
        esquema.strict(),
        esquema.safeExtend({ marca: z.string().optional() }),
      ]) {
        // Zod conserva checks, pero no hereda metadata al cambiar la definición: aplicarla al final.
        const final = derivado.meta(esquema.meta()!);
        expect(z.toJSONSchema(final, { io: 'input' }).allOf).toEqual(condicion);
        expect(final.safeParse({ ...props, profundidad_estimada: null }).success).toBe(false);
        expect(final.safeParse({ ...props, ...BACHE }).success).toBe(true);
      }
      // Otro intérprete de JSON Schema comprueba la condición emitida, no una regla escrita a mano.
      const desdeJson = z.fromJSONSchema(json);
      for (const entrada of [
        props,
        { ...props, ...BACHE },
        { ...props, categoria: '' },
        { ...props, profundidad_estimada: null },
        { ...props, ...BACHE, categoria: 'inundacion' },
        { ...props, ...BACHE, categoria: '' },
        { ...props, ...BACHE, categoria: 'futura' },
        { ...props, ...BACHE, id: 'inválido' },
      ])
        expect(desdeJson.safeParse(entrada).success).toBe(esquema.safeParse(entrada).success);
      // Las ocho combinaciones de los tres planos contra categorías históricas y malformadas.
      for (const caso of [
        { categoria: undefined, enums: true, nulos: false },
        { categoria: 'inundacion', enums: true, nulos: false },
        { categoria: '', enums: true, nulos: false },
        { categoria: 'bache', enums: true, nulos: true },
        { categoria: 'futura', enums: true, nulos: true },
        { categoria: 'Inundacion', enums: true, nulos: true },
        { categoria: null, enums: false, nulos: false },
        { categoria: 12, enums: false, nulos: false },
      ]) {
        for (let mascara = 0; mascara < 8; mascara++) {
          const entrada: Record<string, unknown> = { ...props };
          if (caso.categoria !== undefined) entrada.categoria = caso.categoria;
          PLANAS.forEach((campo, i) => {
            if (mascara & (1 << i)) entrada[campo] = null;
          });
          const esperado = mascara === 0 ? caso.enums : caso.nulos;
          expect(esquema.safeParse(entrada).success, JSON.stringify(entrada)).toBe(esperado);
          expect(desdeJson.safeParse(entrada).success, JSON.stringify(entrada)).toBe(esperado);
        }
      }
    });
  },
);

describe('0.23: features, colecciones, exportación y OpenAPI canónicos', () => {
  it('valida los planos nulos en todas las vistas y colecciones sin schema paralelo de admin', () => {
    const publico = { ...PUBLICO, ...BACHE };
    const tecnico = { ...TECNICO, ...BACHE };
    const propio = { ...PROPIO, ...BACHE };
    expect(ReporteFeatureSchema.safeParse(feature(publico)).success).toBe(true);
    expect(ReporteTecnicoFeatureSchema.safeParse(feature(tecnico)).success).toBe(true);
    expect(MiReporteFeatureSchema.safeParse(feature(propio)).success).toBe(true);
    expect(ReporteFeatureCollectionSchema.safeParse(coleccion(publico)).success).toBe(true);
    expect(ReporteTecnicoFeatureCollectionSchema.safeParse(coleccion(tecnico)).success).toBe(true);
    expect(MisReportesSchema.safeParse(coleccion(propio)).success).toBe(true);
    expect(ExportacionGeoJsonSchema.shape.features.element).toBe(ReporteTecnicoFeatureSchema);
    const exportacion = {
      ...coleccion(tecnico),
      features: [feature(TECNICO), feature(tecnico)],
      total: 5,
      exportados: 2,
      truncado: true,
      generado_en: FECHA,
      nota_metodologica: 'Percepción ciudadana.',
    };
    const salida = ExportacionGeoJsonSchema.parse(exportacion);
    expect(salida.total).toBe(5);
    expect(salida.truncado).toBe(true);
    expect(salida.features[1]!.properties).toEqual(tecnico);
    for (const categoria of [undefined, 'inundacion', '']) {
      const invalido = { ...tecnico, categoria };
      for (const esquema of [
        ReporteFeatureSchema,
        ReporteTecnicoFeatureSchema,
        MiReporteFeatureSchema,
      ])
        expect(esquema.safeParse(feature({ ...propio, ...invalido })).success).toBe(false);
    }
  });

  it('mantiene propiedades OpenAPI en su lugar y condición idéntica en todos los finales anidados', () => {
    const doc = construirOpenApi() as { components: { schemas: Record<string, unknown> } };
    const finales = { ReporteTecnico: ReporteTecnicoSchema, MiReporte: MiReporteSchema };
    for (const [nombre, esquema] of Object.entries(finales)) {
      expect(doc.components.schemas[nombre]).toEqual(
        Object.fromEntries(
          Object.entries(z.toJSONSchema(esquema, { io: 'input' })).filter(([k]) => k !== '$schema'),
        ),
      );
    }
    for (const esquema of [
      ReportePublicoSchema,
      ReporteTecnicoSchema,
      MiReporteSchema,
      ReporteFeatureSchema,
      ReporteTecnicoFeatureSchema,
      MiReporteFeatureSchema,
      ReporteFeatureCollectionSchema,
      ReporteTecnicoFeatureCollectionSchema,
      MisReportesSchema,
      ExportacionGeoJsonSchema,
    ]) {
      const json = z.toJSONSchema(esquema, { io: 'input', reused: 'inline' });
      sinReferencias(json);
      expect(JSON.stringify(json)).toContain('^(?!inundacion$)');
      expect(z.fromJSONSchema(json)).toBeDefined();
    }
    expect(ReporteTecnicoSchema.shape.distancia_dispositivo_m.safeParse(1000).success).toBe(true);
    expect(ReporteTecnicoSchema.shape.distancia_dispositivo_m.safeParse(1001).success).toBe(false);
    expectTypeOf<z.infer<typeof ReporteTecnicoSchema>['profundidad_estimada']>().toEqualTypeOf<
      'tobillo' | 'rodilla' | 'muslo' | 'mas_70' | null
    >();
  });
});

describe('0.23: la entrada plana conserva defaults, strip y refinamientos', () => {
  const entrada = {
    lat: -17.79,
    lon: -63.195,
    dispositivo: { lat: -17.79, lon: -63.195, precision_m: 5, antiguedad_s: 0 },
    ubicacion_tipo: 'via_publica',
    descripcion: 'Reporte sintético del camino antiguo.',
    profundidad_estimada: 'rodilla',
    frecuencia: 'ocasional',
  };
  it('conserva shape, defaults y claves sobrantes descartadas en el camino legacy', () => {
    expect(ReporteCrearSchema.shape.profundidad_estimada.safeParse(null).success).toBe(false);
    const plano = ReporteCrearSchema.parse({ ...entrada, extra: 'se descarta' });
    expect(plano.causa_presunta).toBe('desconocida');
    expect(plano.fotos).toEqual([]);
    expect(plano.ubicacion_aproximada).toBe(false);
    expect(Object.hasOwn(plano, 'extra')).toBe(false);
    const normal = normalizarReporteCrear(entrada);
    expect(normal.forma).toBe('plana');
    expect(normal.resultado.exito).toBe(true);
    if (normal.resultado.exito) {
      expect(normal.resultado.datos.categoria).toBe('inundacion');
      expect(DetalleInundacionSchema.safeParse(normal.resultado.datos.detalle).success).toBe(true);
      expect(DetalleBacheSchema.safeParse(normal.resultado.datos.detalle).success).toBe(false);
    }
  });

  it('la forma por categoría conserva el núcleo y deja la validación del detalle a la definición', () => {
    const normal = normalizarReporteCrear({
      ...entrada,
      categoria: 'BACHES',
      subtipo: 'bache',
      detalle: DETALLE,
    });
    expect(normal.forma).toBe('categoria');
    expect(normal.resultado.exito).toBe(true);
    if (normal.resultado.exito) {
      expect(normal.resultado.datos.categoria).toBe('bache');
      expect(
        DEFINICION_BACHE.esquemaDetalle.safeParse(normal.resultado.datos.detalle).success,
      ).toBe(true);
      expect(DetalleInundacionSchema.safeParse(normal.resultado.datos.detalle).success).toBe(false);
    }
    for (const cambios of [
      { profundidad_estimada: null },
      { frecuencia: null },
      { sumidero_cercano: 'no', sumidero_estado: 'tapado' },
      { sumidero_cercano: 'no', agua_brota_sumidero: true },
    ])
      expect(ReporteCrearSchema.safeParse({ ...entrada, ...cambios }).success).toBe(false);
  });
});
