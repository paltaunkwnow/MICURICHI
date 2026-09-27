import { describe, expect, it } from 'vitest';
import { ESTADOS_FOTOS_READY, ReadyApiCoreSchema } from '../src/esquemas/admin.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

type Respuesta = {
  description?: string;
  content?: Record<string, { schema?: { $ref?: string } }>;
};
type Operacion = { summary?: string; responses: Record<string, Respuesta> };
type DocOpenApi = {
  paths: Record<string, Record<string, Operacion>>;
  components: {
    schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
  };
};

const listo = { ok: true, db: 'ok', geo: 'ok', fotos: 'ok', degradado: false };

describe('0.13.0: guarda de espacio en disco', () => {
  it('fotos en /ready: ok, error o poco_espacio', () => {
    expect([...ESTADOS_FOTOS_READY]).toStrictEqual(['ok', 'error', 'poco_espacio']);
    expect(ReadyApiCoreSchema.safeParse(listo).success).toBe(true);
    expect(
      ReadyApiCoreSchema.safeParse({ ...listo, fotos: 'poco_espacio', degradado: true }).success,
    ).toBe(true);
    expect(ReadyApiCoreSchema.safeParse({ ...listo, fotos: 'lleno' }).success).toBe(false);
    // geo lleva el código HTTP cuando geo-service responde algo distinto de 200.
    expect(ReadyApiCoreSchema.safeParse({ ...listo, geo: 'HTTP 503' }).success).toBe(true);
    expect(contratos.ReadyApiCoreSchema).toBe(ReadyApiCoreSchema);
  });
});

describe('0.13.0: OpenAPI', () => {
  const doc = construirOpenApi() as DocOpenApi;

  it('POST /fotos lista el 507 SIN_ESPACIO, antes de procesar y sin gastar cupo', () => {
    const r507 = doc.paths['/api/v1/fotos']?.post?.responses['507'];
    expect(r507?.description).toContain('SIN_ESPACIO');
    expect(r507?.description).toContain('FOTOS_MIN_LIBRE_BYTES');
    expect(r507?.description).toContain('antes de procesar');
    expect(r507?.description).toContain('sin gastar cupo');
    expect(r507?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ErrorApi');
  });

  it("/ready: fotos puede ser 'poco_espacio' y deja la réplica degradada, no fuera", () => {
    const op = doc.paths['/ready']?.get;
    for (const codigo of ['200', '503'])
      expect(op?.responses[codigo]?.content?.['application/json']?.schema?.$ref, codigo).toBe(
        '#/components/schemas/ReadyApiCore',
      );
    expect(doc.components.schemas.ReadyApiCore?.properties?.fotos?.enum).toContain('poco_espacio');
    expect(op?.responses['200']?.description).toContain('degradado');
  });
});
