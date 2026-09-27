import { describe, expect, it } from 'vitest';
import { CONFIG_DOMINIO } from '../src/dominio/config.js';
import { SesionActualSchema } from '../src/esquemas/auth.js';
import { construirOpenApi } from '../src/openapi.js';

type Operacion = {
  summary?: string;
  responses: Record<string, { description?: string }>;
};
type EsquemaJson = {
  type?: string;
  description?: string;
  required?: string[];
  minimum?: number;
  properties?: Record<string, EsquemaJson>;
};
type DocOpenApi = {
  paths: Record<string, Record<string, Operacion>>;
  components: { schemas: Record<string, EsquemaJson> };
};

function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

const vecina = {
  id: '0b6f9a57-3c1e-4d8a-9b2f-5e7c1a2d3f40',
  email: 'vecina@example.com',
  nombre: 'Vecina',
  rol: 'ciudadano',
  puede_reportar_desde: null,
  reportes_restantes_hoy: 3,
  demora_proximo_s: 60,
};

describe('0.10.0: cupo diario por cuenta y altas por IP', () => {
  it('3 reportes y 12 fotos por cuenta y por día, y 10 altas por IP y por día', () => {
    expect(CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA).toBe(3);
    expect(CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA).toBe(12);
    expect(CONFIG_DOMINIO.ALTAS_POR_DIA_POR_IP).toBe(10);
  });
});

describe('0.10.0: SesionActual con los reportes que quedan hoy', () => {
  it('acepta reportes_restantes_hoy de 0 en adelante, entero', () => {
    for (const reportes_restantes_hoy of [0, 1, 3])
      expect(SesionActualSchema.safeParse({ ...vecina, reportes_restantes_hoy }).success).toBe(
        true,
      );
    for (const reportes_restantes_hoy of [-1, 1.5, '2', null])
      expect(
        rutasDeError(SesionActualSchema.safeParse({ ...vecina, reportes_restantes_hoy })),
      ).toEqual(['reportes_restantes_hoy']);
  });

  it('puede_reportar_desde sigue siendo ISO 8601 o null (ahora, la próxima medianoche local)', () => {
    const medianoche = '2026-09-28T00:00:00-04:00';
    expect(
      SesionActualSchema.safeParse({
        ...vecina,
        reportes_restantes_hoy: 0,
        puede_reportar_desde: medianoche,
      }).success,
    ).toBe(true);
  });

  it('el componente OpenAPI declara el campo y explica la medianoche', () => {
    const doc = construirOpenApi() as DocOpenApi;
    const sesion = doc.components.schemas.SesionActual;
    expect(sesion?.properties?.reportes_restantes_hoy).toMatchObject({
      type: 'integer',
      minimum: 0,
    });
    expect(sesion?.properties?.reportes_restantes_hoy?.description).toContain('hoy');
    expect(sesion?.properties?.puede_reportar_desde?.description).toContain('medianoche');
  });
});

describe('0.10.0: OpenAPI con los 429 diarios', () => {
  const doc = construirOpenApi() as DocOpenApi;

  it('POST /reportes: 3 por día, con Retry-After hasta la medianoche, sin la espera de 60 min', () => {
    const op = doc.paths['/api/v1/reportes']?.post;
    const d429 = op?.responses['429']?.description ?? '';
    expect(d429).toContain('CUOTA_DE_REPORTES');
    expect(d429).toContain('Ya enviaste los 3 reportes de hoy. Vas a poder enviar otro mañana');
    expect(d429).toContain('Retry-After');
    expect(d429).toContain('medianoche');
    expect(`${op?.summary} ${d429}`).not.toContain('60 min');
  });

  it('POST /fotos: 12 por cuenta y por día', () => {
    const d429 = doc.paths['/api/v1/fotos']?.post?.responses['429']?.description ?? '';
    expect(d429).toContain('CUOTA_DE_FOTOS');
    expect(d429).toContain('12 fotos por cuenta y por día');
    expect(d429).not.toContain('fotos por hora');
  });

  it('POST /auth/registro: tope diario de altas por IP', () => {
    const d429 = doc.paths['/api/v1/auth/registro']?.post?.responses['429']?.description ?? '';
    expect(d429).toContain('DEMASIADAS_CUENTAS');
    expect(d429).toContain('10 altas por día');
  });

  it('GET /auth/yo menciona reportes_restantes_hoy', () => {
    expect(doc.paths['/api/v1/auth/yo']?.get?.summary).toContain('reportes_restantes_hoy');
  });
});
