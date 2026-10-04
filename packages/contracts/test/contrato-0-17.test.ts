import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ResolverRespuestaSchema } from '../src/esquemas/geo.js';
import { construirOpenApi } from '../src/openapi.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Propiedad = { deprecated?: boolean; description?: string; anyOf?: unknown[] };
type DocOpenApi = {
  paths: Record<string, Record<string, { summary?: string }>>;
  components: { schemas: Record<string, { properties?: Record<string, Propiedad> }> };
};

/**
 * 0.17.0 — El PIP de manzana se deja de calcular en geo-service (corría en cada resolución y
 * ningún consumidor lo lee; el reporte dejó de guardar manzana en la migración 0010). El campo
 * `ResolverRespuesta.manzana` queda OBSOLETO: siempre `null` desde 0.17.0, sin ruptura de tipos
 * (se quita en una contracción posterior, para no romper un cliente con la app vieja en caché).
 */
describe('0.17.0: ResolverRespuesta.manzana queda obsoleto, sin ruptura de tipos', () => {
  it('el esquema sigue aceptando manzana null (lo que devuelve geo-service desde 0.17.0)', () => {
    const base = {
      dentro_cobertura: true,
      distrito: null,
      unidad_vecinal: null,
      version_capa: null,
      en_limite: false,
      asignado_por_proximidad: false,
      distancia_m: null,
      distrito_discrepante: false,
    };
    expect(ResolverRespuestaSchema.safeParse({ ...base, manzana: null }).success).toBe(true);
  });

  it('el esquema sigue aceptando un objeto manzana (compatibilidad con un geo-service anterior)', () => {
    const base = {
      dentro_cobertura: true,
      distrito: null,
      unidad_vecinal: null,
      version_capa: null,
      en_limite: false,
      asignado_por_proximidad: false,
      distancia_m: null,
      distrito_discrepante: false,
    };
    const r = ResolverRespuestaSchema.safeParse({
      ...base,
      manzana: { id: 'manzana:A-1', codigo: 'A-1' },
    });
    expect(r.success).toBe(true);
  });
});

describe('0.17.0: OpenAPI', () => {
  const doc = construirOpenApi() as unknown as DocOpenApi;

  it('ResolverRespuesta.manzana está marcado deprecated, con la nota de que es siempre null', () => {
    const manzana = doc.components.schemas.ResolverRespuesta?.properties?.manzana;
    expect(manzana?.deprecated).toBe(true);
    expect(manzana?.description?.toLowerCase()).toContain('obsoleto');
    expect(manzana?.description?.toLowerCase()).toContain('null');
    // Sigue siendo el mismo campo nullable: no cambia la forma.
    expect(Array.isArray(manzana?.anyOf)).toBe(true);
  });

  it('el resumen de POST /geo/v1/resolver ya no menciona manzana', () => {
    const resumen = doc.paths['/geo/v1/resolver']?.post?.summary ?? '';
    expect(resumen.toLowerCase()).not.toContain('manzana');
  });

  it('openapi.yaml se regeneró con el build: marca el campo deprecated y el resumen sin manzana', () => {
    const yaml = readFileSync(resolve(raiz, 'openapi/openapi.yaml'), 'utf8');
    // openapi.yaml se versiona: esto comprueba que el build corrió tras el cambio.
    expect(yaml).toMatch(/deprecated: true/);
    expect(yaml).not.toContain('UV y manzana');
  });
});
