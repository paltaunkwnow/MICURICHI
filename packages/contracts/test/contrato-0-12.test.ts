import { describe, expect, it } from 'vitest';
import {
  CapaInfoSchema,
  CODIGO_CAPA_CAMBIO,
  HuellaCapaSchema,
  rutaCapaConHuella,
  rutaTeselasConHuella,
} from '../src/esquemas/geo.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

type Parametro = { name: string; in: string; required?: boolean; schema?: { pattern?: string } };
type Respuesta = {
  description?: string;
  headers?: Record<string, { description?: string }>;
  content?: Record<string, { schema?: { $ref?: string } }>;
};
type Operacion = {
  summary?: string;
  parameters?: Parametro[];
  responses: Record<string, Respuesta>;
};
type DocOpenApi = {
  paths: Record<string, Record<string, Operacion>>;
  components: {
    schemas: Record<string, { properties?: Record<string, { description?: string }> }>;
  };
};

const HUELLA = '3fa9c1d2e4b5a6f7';

describe('0.12.0: huella de las capas', () => {
  it('HuellaCapaSchema: 16 caracteres hexadecimales en minúscula', () => {
    expect(HuellaCapaSchema.safeParse(HUELLA).success).toBe(true);
    for (const mala of [
      HUELLA.toUpperCase(),
      HUELLA.slice(1),
      `${HUELLA}0`,
      'zzzzzzzzzzzzzzzz',
      '../3fa9c1d2e4b5a',
      '',
    ])
      expect(HuellaCapaSchema.safeParse(mala).success, mala).toBe(false);
  });

  it('las rutas con huella que arma geo-service para CapaInfo.url', () => {
    expect(rutaCapaConHuella('unidad_vecinal', HUELLA)).toBe(
      `/geo/v1/capas/unidad_vecinal/v/${HUELLA}`,
    );
    expect(rutaTeselasConHuella('manzana', HUELLA)).toBe(
      `/geo/v1/teselas/manzana/${HUELLA}/{z}/{x}/{y}.mvt`,
    );
  });

  it('el código del 410 es CAPA_CAMBIO', () => {
    expect(CODIGO_CAPA_CAMBIO).toBe('CAPA_CAMBIO');
  });

  it('CapaInfo no cambia de forma: la huella viaja en url', () => {
    const info = {
      capa: 'unidad_vecinal',
      version: 'DM_UV_MZ_2025',
      n_features: 576,
      bytes_web: 1_000_000,
      modo: 'geojson',
      url: rutaCapaConHuella('unidad_vecinal', HUELLA),
      bbox: [-63.3, -17.9, -63.0, -17.6],
    };
    expect(CapaInfoSchema.safeParse(info).success).toBe(true);
  });

  it('el índice del paquete exporta lo nuevo', () => {
    expect(contratos.HuellaCapaSchema).toBe(HuellaCapaSchema);
    expect(contratos.rutaCapaConHuella).toBe(rutaCapaConHuella);
    expect(contratos.rutaTeselasConHuella).toBe(rutaTeselasConHuella);
  });
});

describe('0.12.0: OpenAPI de capas y teselas con huella', () => {
  const doc = construirOpenApi() as DocOpenApi;

  const cacheDe = (r?: Respuesta) => r?.headers?.['Cache-Control']?.description ?? '';

  it('GET /geo/v1/capas/{capa}/v/{huella}: immutable con la vigente, 410 con una vieja', () => {
    const op = doc.paths['/geo/v1/capas/{capa}/v/{huella}']?.get;
    expect(op).toBeDefined();
    const huella = op?.parameters?.find((p) => p.name === 'huella');
    expect(huella?.in).toBe('path');
    expect(new RegExp(huella?.schema?.pattern ?? '^$').test(HUELLA)).toBe(true);
    expect(cacheDe(op?.responses['200'])).toContain('public, max-age=31536000, immutable');
    expect(op?.responses['200']?.headers?.ETag).toBeDefined();
    expect(op?.responses['304']).toBeDefined();
    expect(op?.responses['410']?.description).toContain('CAPA_CAMBIO');
    expect(op?.responses['410']?.description).toContain('no-store');
    expect(op?.responses['410']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/ErrorApi',
    );
    expect(op?.responses['413']?.description).toContain('USAR_TESELAS');
  });

  it('GET /geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt: immutable, 204 y 410', () => {
    const op = doc.paths['/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt']?.get;
    expect(op).toBeDefined();
    expect(op?.parameters?.map((p) => p.name)).toStrictEqual(['capa', 'huella', 'z', 'x', 'y']);
    expect(cacheDe(op?.responses['200'])).toContain('immutable');
    expect(op?.responses['204']).toBeDefined();
    expect(op?.responses['410']?.description).toContain('CAPA_CAMBIO');
  });

  it('las rutas sin huella quedan como alias con public, no-cache', () => {
    for (const ruta of ['/geo/v1/capas/{capa}', '/geo/v1/teselas/{capa}/{z}/{x}/{y}.mvt']) {
      const op = doc.paths[ruta]?.get;
      expect(op?.summary, ruta).toContain('Alias');
      expect(cacheDe(op?.responses['200']), ruta).toContain('public, no-cache');
    }
  });

  it('GET /geo/v1/capas y /capas/vigentes: public, no-cache; CapaInfo.url lleva la huella', () => {
    for (const ruta of ['/geo/v1/capas', '/geo/v1/capas/vigentes'])
      expect(cacheDe(doc.paths[ruta]?.get?.responses['200']), ruta).toContain('public, no-cache');
    expect(doc.components.schemas.CapaInfo?.properties?.url?.description).toContain('huella');
  });

  it('agregados y puntos críticos: public, no-cache y 2 min como máximo', () => {
    for (const ruta of ['/geo/v1/agregados/unidades-vecinales', '/geo/v1/puntos-criticos']) {
      const cache = cacheDe(doc.paths[ruta]?.get?.responses['200']);
      expect(cache, ruta).toContain('public, no-cache');
      expect(cache, ruta).toContain('120 s');
    }
  });
});
