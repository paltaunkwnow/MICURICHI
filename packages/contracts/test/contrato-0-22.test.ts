import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { type ExportacionGeoJson, ExportacionGeoJsonSchema } from '../src/esquemas/admin.js';
import {
  ReporteFeatureSchema,
  type ReporteTecnicoFeature,
  ReporteTecnicoFeatureSchema,
} from '../src/esquemas/reporte.js';
import { construirOpenApi } from '../src/openapi.js';

const FECHA = '2026-10-15T12:00:00.000Z';
const ID = '11111111-1111-4111-8111-111111111111';
const CAMPOS_PLANOS = ['profundidad_estimada', 'frecuencia', 'causa_presunta'] as const;
const PLANOS_NULOS = { profundidad_estimada: null, frecuencia: null, causa_presunta: null };

/** Fixture sintético de la representación técnica legada, sin campos aditivos obligatorios. */
const LEGADO: ReporteTecnicoFeature = {
  type: 'Feature',
  id: ID,
  geometry: { type: 'Point', coordinates: [-63.195, -17.79] },
  properties: {
    id: ID,
    creado_en: FECHA,
    evento_en: null,
    distrito: null,
    unidad_vecinal: null,
    descripcion: 'Reporte sintético sin datos de personas.',
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
  },
};

function feature(cambios: Record<string, unknown> = {}, omitir: string[] = []) {
  const propiedades: Record<string, unknown> = {
    ...structuredClone(LEGADO.properties),
    ...cambios,
  };
  for (const campo of omitir) delete propiedades[campo];
  return { ...structuredClone(LEGADO), properties: propiedades };
}

function coleccion(features: unknown[]) {
  return {
    type: 'FeatureCollection',
    nota_metodologica: 'Datos sintéticos de percepción ciudadana.',
    generado_en: FECHA,
    total: features.length,
    exportados: features.length,
    truncado: false,
    features,
  };
}

describe('0.22.0: compatibilidad y exportación multitemática', () => {
  it('acepta el legado sin agregar categoria, subtipo ni detalle', () => {
    const entrada = coleccion([feature()]);
    const salida = ExportacionGeoJsonSchema.parse(entrada);
    expect(salida).toEqual(entrada);
    for (const campo of ['categoria', 'subtipo', 'detalle'])
      expect(Object.hasOwn(salida.features[0]?.properties ?? {}, campo)).toBe(false);
  });

  it.each(['inundacion', 'bache', 'area_verde', 'basura', 'categoria_futura', ''])(
    'preserva la representación antes válida con enums no nulos y categoria=%j',
    (categoria) => {
      const entrada = coleccion([feature({ categoria })]);
      expect(ReporteTecnicoFeatureSchema.safeParse(entrada.features[0]).success).toBe(true);
      expect(ExportacionGeoJsonSchema.parse(entrada)).toEqual(entrada);
    },
  );

  it.each(['bache', 'area_verde', 'basura', 'categoria_futura'])(
    'acepta %s con los seis campos planos nulos sin consultar actividad ni registro',
    (categoria) => {
      const entrada = coleccion([
        feature({ categoria, ...PLANOS_NULOS, subtipo: null, detalle: { ejemplo: true } }),
      ]);
      expect(ExportacionGeoJsonSchema.parse(entrada)).toEqual(entrada);
    },
  );

  it.each(CAMPOS_PLANOS)(
    'admite solo %s nulo en otra categoría sin endurecer los demás',
    (campo) => {
      const entrada = coleccion([feature({ categoria: 'bache', [campo]: null })]);
      expect(ExportacionGeoJsonSchema.parse(entrada)).toEqual(entrada);
    },
  );

  it.each(CAMPOS_PLANOS)(
    'rechaza %s nulo en Inundaciones explícita y en legado sin categoría',
    (campo) => {
      for (const cambios of [{ categoria: 'inundacion', [campo]: null }, { [campo]: null }])
        expect(ExportacionGeoJsonSchema.safeParse(coleccion([feature(cambios)])).success).toBe(
          false,
        );
    },
  );

  it.each([undefined, null, '', 12])('no admite planos nulos con categoria=%j', (categoria) => {
    expect(
      ExportacionGeoJsonSchema.safeParse(coleccion([feature({ categoria, ...PLANOS_NULOS })]))
        .success,
    ).toBe(false);
  });

  it.each(['Inundacion', 'inundacion_extra'])(
    'el contrato de respuesta no normaliza %s ni lo confunde con el literal inundacion',
    (categoria) => {
      expect(
        ExportacionGeoJsonSchema.safeParse(coleccion([feature({ categoria, ...PLANOS_NULOS })]))
          .success,
      ).toBe(true);
    },
  );

  it('acepta una colección mixta y conserva detalle, nulos, totales y truncamiento', () => {
    const entrada = {
      ...coleccion([
        feature(),
        feature({ categoria: 'inundacion' }),
        feature({ categoria: 'bache', ...PLANOS_NULOS, detalle: { pregunta_sintetica: 'sí' } }),
      ]),
      total: 8,
      truncado: true,
    };
    expect(ExportacionGeoJsonSchema.parse(entrada)).toEqual(entrada);
  });

  it('el tipo inferido de exportación incluye los nulos y conserva los campos técnicos', () => {
    type Propiedades = ExportacionGeoJson['features'][number]['properties'];
    expectTypeOf<Propiedades['profundidad_estimada']>().toEqualTypeOf<
      ReporteTecnicoFeature['properties']['profundidad_estimada'] | null
    >();
    expectTypeOf<Propiedades['frecuencia']>().toEqualTypeOf<
      ReporteTecnicoFeature['properties']['frecuencia'] | null
    >();
    expectTypeOf<Propiedades['causa_presunta']>().toEqualTypeOf<
      ReporteTecnicoFeature['properties']['causa_presunta'] | null
    >();
    expectTypeOf<Propiedades['autor_id']>().toEqualTypeOf<
      ReporteTecnicoFeature['properties']['autor_id']
    >();
  });
});

describe('0.22.0: la ampliación no relaja los campos comunes ni las otras respuestas', () => {
  it.each(CAMPOS_PLANOS)(
    '%s sigue siendo obligatorio y rechaza valores ajenos al enum',
    (campo) => {
      expect(
        ExportacionGeoJsonSchema.safeParse(
          coleccion([feature({ categoria: 'bache', ...PLANOS_NULOS }, [campo])]),
        ).success,
      ).toBe(false);
      expect(
        ExportacionGeoJsonSchema.safeParse(
          coleccion([feature({ categoria: 'bache', ...PLANOS_NULOS, [campo]: 'inventado' })]),
        ).success,
      ).toBe(false);
    },
  );

  it.each([
    { estado: 'inventado' },
    { severidad: 'urgente' },
    { id: 'no-es-uuid' },
    { creado_en: 'ayer' },
    { autor_id: 'no-es-uuid' },
    { distancia_dispositivo_m: -1 },
    { detalle: [] },
    { sumidero_cercano: 'inventado' },
    { agua_brota_sumidero: 'sí' },
  ])('rechaza propiedades comunes o técnicas inválidas: %j', (cambios) => {
    expect(
      ExportacionGeoJsonSchema.safeParse(
        coleccion([feature({ categoria: 'bache', ...PLANOS_NULOS, ...cambios })]),
      ).success,
    ).toBe(false);
  });

  it('mantiene obligatorias las propiedades técnicas', () => {
    expect(
      ExportacionGeoJsonSchema.safeParse(
        coleccion([feature({ categoria: 'bache', ...PLANOS_NULOS }, ['autor_id'])]),
      ).success,
    ).toBe(false);
  });

  it.each([
    { type: 'LineString', coordinates: [-63.195, -17.79] },
    { type: 'Point', coordinates: [181, -17.79] },
    { type: 'Point', coordinates: [-63.195, -91] },
    { type: 'Point', coordinates: ['-63.195', -17.79] },
    { type: 'Point', coordinates: [-63.195] },
  ])('rechaza geometría inválida: %j', (geometry) => {
    expect(
      ExportacionGeoJsonSchema.safeParse(
        coleccion([{ ...feature({ categoria: 'bache', ...PLANOS_NULOS }), geometry }]),
      ).success,
    ).toBe(false);
  });

  it.each(['nota_metodologica', 'generado_en', 'total', 'exportados', 'truncado', 'features'])(
    'mantiene obligatorio el metadato %s',
    (campo) => {
      const entrada: Record<string, unknown> = coleccion([
        feature({ categoria: 'bache', ...PLANOS_NULOS }),
      ]);
      delete entrada[campo];
      expect(ExportacionGeoJsonSchema.safeParse(entrada).success).toBe(false);
    },
  );

  it.each([
    { type: 'Feature' },
    { nota_metodologica: null },
    { generado_en: 'ayer' },
    { total: -1 },
    { total: 1.5 },
    { exportados: '1' },
    { exportados: -1 },
    { truncado: 'false' },
  ])('rechaza metadatos inválidos: %j', (cambios) => {
    expect(
      ExportacionGeoJsonSchema.safeParse({
        ...coleccion([feature({ categoria: 'bache', ...PLANOS_NULOS })]),
        ...cambios,
      }).success,
    ).toBe(false);
  });

  it('no amplía el esquema público ni el técnico general', () => {
    const entrada = feature({ categoria: 'bache', ...PLANOS_NULOS });
    expect(ReporteFeatureSchema.safeParse(entrada).success).toBe(false);
    expect(ReporteTecnicoFeatureSchema.safeParse(entrada).success).toBe(false);
    expect(ExportacionGeoJsonSchema.safeParse(coleccion([entrada])).success).toBe(true);
  });
});

describe('0.22.0: OpenAPI representa la misma condición que la validación', () => {
  it('conserva la primera rama técnica intacta y documenta la rama nullable con categoría requerida', () => {
    const doc = construirOpenApi() as {
      components: {
        schemas: {
          ReporteTecnicoFeature: unknown;
          ExportacionGeoJson: {
            properties: { features: { items: { anyOf: unknown[] } } };
          };
        };
      };
    };
    const ramas = doc.components.schemas.ExportacionGeoJson.properties.features.items.anyOf;
    expect(ramas).toHaveLength(2);
    expect(ramas[0]).toEqual(doc.components.schemas.ReporteTecnicoFeature);
    const segunda = ramas[1] as {
      properties: {
        properties: {
          required: string[];
          properties: Record<string, { pattern?: string; minLength?: number; anyOf?: unknown[] }>;
        };
      };
    };
    const propiedades = segunda.properties.properties;
    expect(propiedades.required).toContain('categoria');
    const categoria = propiedades.properties.categoria;
    expect(categoria?.minLength).toBe(1);
    expect(categoria?.pattern).toBeDefined();
    const patron = new RegExp(categoria?.pattern ?? '');
    expect(patron.test('inundacion')).toBe(false);
    for (const slug of ['bache', 'area_verde', 'basura', 'categoria_futura', 'inundacion_extra'])
      expect(patron.test(slug)).toBe(true);
    for (const campo of CAMPOS_PLANOS)
      expect(propiedades.properties[campo]?.anyOf).toContainEqual({ type: 'null' });
  });

  it('la serialización directa del esquema conserva la condición, sin depender de superRefine', () => {
    const json = z.toJSONSchema(ExportacionGeoJsonSchema, { io: 'input' });
    expect(JSON.stringify(json)).toContain('^(?!inundacion$)');
  });
});
