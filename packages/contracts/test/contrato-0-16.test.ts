import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IndicadoresFiltrosSchema, IndicadoresSchema } from '../src/esquemas/admin.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Parametro = { name: string; in: string; required?: boolean };
type Operacion = {
  summary?: string;
  parameters?: Parametro[];
  responses: Record<string, { description?: string; content?: Record<string, unknown> }>;
};
type DocOpenApi = { paths: Record<string, Record<string, Operacion>> };

describe('0.16.0: filtros de GET /api/v1/indicadores', () => {
  it('se exporta desde el índice', () => {
    expect(contratos.IndicadoresFiltrosSchema).toBe(IndicadoresFiltrosSchema);
  });

  it('sin parámetros vale: los dos filtros son opcionales', () => {
    const r = IndicadoresFiltrosSchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data?.severidad).toBeUndefined();
    expect(r.data?.distrito_id).toBeUndefined();
  });

  it('severidad es una lista separada por comas, igual que en /reportes', () => {
    expect(
      IndicadoresFiltrosSchema.safeParse({ severidad: 'critica,alta' }).data?.severidad,
    ).toEqual(['critica', 'alta']);
    // Una sola severidad.
    expect(IndicadoresFiltrosSchema.safeParse({ severidad: 'media' }).data?.severidad).toEqual([
      'media',
    ]);
  });

  it('una severidad fuera de baja/media/alta/critica no valida (→ 400 FILTROS_INVALIDOS)', () => {
    expect(IndicadoresFiltrosSchema.safeParse({ severidad: 'urgente' }).success).toBe(false);
    expect(IndicadoresFiltrosSchema.safeParse({ severidad: 'critica,urgente' }).success).toBe(
      false,
    );
  });

  it('distrito_id es un string no vacío', () => {
    expect(
      IndicadoresFiltrosSchema.safeParse({ distrito_id: 'distrito_municipal:07' }).success,
    ).toBe(true);
    expect(IndicadoresFiltrosSchema.safeParse({ distrito_id: '' }).success).toBe(false);
  });

  it('por_unidad_vecinal trae distrito_id y nombre para agrupar y para el clic en el distrito', () => {
    const indicadores = {
      total: 1,
      por_estado: { nuevo: 1 },
      por_severidad: { baja: 1, media: 0, alta: 0, critica: 0 },
      por_distrito: [{ distrito_id: 'distrito_municipal:07', nombre: 'Distrito 7', n: 1 }],
      por_unidad_vecinal: [
        {
          unidad_vecinal_id: 'unidad_vecinal:123',
          nombre: 'Los Lotes',
          distrito_id: 'distrito_municipal:07',
          n: 1,
        },
      ],
      puntos_criticos_recurrentes: 0,
      capas_vigentes: { unidad_vecinal: '2026-09' },
    };
    const r = IndicadoresSchema.safeParse(indicadores);
    expect(r.success).toBe(true);
    // Sin distrito_id en una UV el esquema falla: el panel lo necesita.
    const sinDistrito = {
      ...indicadores,
      por_unidad_vecinal: [{ unidad_vecinal_id: 'unidad_vecinal:123', nombre: 'Los Lotes', n: 1 }],
    };
    expect(IndicadoresSchema.safeParse(sinDistrito).success).toBe(false);
  });
});

describe('0.16.0: OpenAPI', () => {
  const doc = construirOpenApi() as DocOpenApi;
  const op = doc.paths['/api/v1/indicadores']?.get;

  it('/api/v1/indicadores declara los dos filtros como query opcionales', () => {
    const query = (op?.parameters ?? []).filter((p) => p.in === 'query');
    const nombres = query.map((p) => p.name);
    expect(nombres).toEqual(expect.arrayContaining(['severidad', 'distrito_id']));
    for (const p of query) expect(p.required ?? false).toBe(false);
  });

  it('lista el 400 FILTROS_INVALIDOS', () => {
    expect(op?.responses['400']?.description).toContain('FILTROS_INVALIDOS');
    expect(op?.responses['400']?.content?.['application/json']).toBeDefined();
  });
});

describe('versión del paquete', () => {
  it('package.json y la última entrada del CHANGELOG dicen la misma versión, 0.17.0', () => {
    const { version } = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8')) as {
      version: string;
    };
    const ultima = readFileSync(resolve(raiz, 'CHANGELOG.md'), 'utf8').match(/^## (\S+)/m)?.[1];
    expect(version).toBe('0.17.0');
    expect(ultima).toBe(version);
  });
});
