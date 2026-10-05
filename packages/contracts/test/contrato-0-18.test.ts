import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTA_METODOLOGICA } from '../src/dominio/config.js';
import { UBICACION_METODOS } from '../src/dominio/enums.js';
import { CODIGOS_UBICACION_DISPOSITIVO } from '../src/dominio/geo.js';
import { DispositivoSchema, ReporteCrearSchema } from '../src/esquemas/reporte.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Propiedad = {
  enum?: string[];
  default?: unknown;
  type?: string | string[];
  maximum?: number;
  properties?: Record<string, Propiedad>;
};
type DocOpenApi = {
  paths: Record<
    string,
    Record<string, { summary?: string; responses: Record<string, { description?: string }> }>
  >;
  components: {
    schemas: Record<string, { properties?: Record<string, Propiedad>; required?: string[] }>;
  };
};

/** Base de un reporte válido; `dispositivo` con una precisión de laptop (Wi-Fi), 178 m. */
const crear = {
  lat: -17.78,
  lon: -63.18,
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
  dispositivo: { lat: -17.78, lon: -63.18, precision_m: 178, antiguedad_s: 2 },
};

describe('0.18.0: ubicación aproximada (dispositivo sin GPS preciso, ADR 0007)', () => {
  // C-1.1
  it('UBICACION_METODOS suma «aproximada» y conserva gps y manual', () => {
    expect([...UBICACION_METODOS]).toStrictEqual(['gps', 'manual', 'aproximada']);
    expect(contratos.UBICACION_METODOS).toBe(UBICACION_METODOS);
  });

  // C-1.2 (campo)
  it('ReporteCrearSchema.ubicacion_aproximada vale false por defecto, acepta true y es opcional', () => {
    expect(ReporteCrearSchema.parse(crear).ubicacion_aproximada).toBe(false);
    expect(
      ReporteCrearSchema.parse({ ...crear, ubicacion_aproximada: true }).ubicacion_aproximada,
    ).toBe(true);
    // Opcional en la entrada: no mandarlo es válido.
    expect(ReporteCrearSchema.safeParse(crear).success).toBe(true);
  });

  // C-1.2 (código nuevo)
  it('UBICACION_PRECISA_DISPONIBLE está en CODIGOS_UBICACION_DISPOSITIVO, junto a PRECISION_INSUFICIENTE', () => {
    expect([...CODIGOS_UBICACION_DISPOSITIVO]).toContain('UBICACION_PRECISA_DISPONIBLE');
    const i = CODIGOS_UBICACION_DISPOSITIVO.indexOf('UBICACION_PRECISA_DISPONIBLE');
    const j = CODIGOS_UBICACION_DISPOSITIVO.indexOf('PRECISION_INSUFICIENTE');
    expect(j).toBeGreaterThanOrEqual(0);
    expect(i).toBe(j + 1);
  });

  // C-1.2 (tope físico de precision_m): una laptop por Wi-Fi o IP declara cientos de metros o
  // varios km; Zod tiene que aceptarlos para que el tope de negocio sea 422 y no 400.
  it('DispositivoSchema.precision_m acepta valores de varios km (Wi-Fi/IP): el tope sube a 100 000 m', () => {
    const disp = { lat: -17.78, lon: -63.18, antiguedad_s: 2 };
    for (const precision_m of [178, 5_000, 100_000])
      expect(DispositivoSchema.safeParse({ ...disp, precision_m }).success).toBe(true);
    // Más allá del tope físico sigue siendo un rango inválido (400 de Zod, no 422).
    expect(DispositivoSchema.safeParse({ ...disp, precision_m: 100_001 }).success).toBe(false);
  });

  // C-1.3
  it('NOTA_METODOLOGICA menciona los reportes con ubicación aproximada y sigue en una sola línea', () => {
    expect(NOTA_METODOLOGICA.toLowerCase()).toContain('aproximada');
    expect(NOTA_METODOLOGICA).not.toMatch(/[\r\n]/);
    // No pisa lo anterior.
    expect(NOTA_METODOLOGICA.toLowerCase()).toContain('percepción');
  });
});

describe('0.18.0: OpenAPI', () => {
  const doc = construirOpenApi() as unknown as DocOpenApi;

  it('el componente ReporteCrear declara ubicacion_aproximada como boolean opcional con default false', () => {
    const crearJs = doc.components.schemas.ReporteCrear;
    const prop = crearJs?.properties?.ubicacion_aproximada;
    expect(prop).toBeDefined();
    expect(prop?.default).toBe(false);
    expect(crearJs?.required ?? []).not.toContain('ubicacion_aproximada');
  });

  it('dispositivo.precision_m queda con el tope físico nuevo (100 000)', () => {
    const disp = doc.components.schemas.ReporteCrear?.properties?.dispositivo;
    expect(disp?.properties?.precision_m?.maximum).toBe(100_000);
  });

  it('ubicacion_metodo de la vista técnica lista «aproximada»', () => {
    const prop = doc.components.schemas.ReporteTecnico?.properties?.ubicacion_metodo;
    expect(prop?.enum).toEqual(expect.arrayContaining(['gps', 'manual', 'aproximada']));
  });

  it('el 422 de POST /api/v1/reportes documenta UBICACION_PRECISA_DISPONIBLE', () => {
    const d422 = doc.paths['/api/v1/reportes']?.post?.responses['422']?.description ?? '';
    expect(d422).toContain('UBICACION_PRECISA_DISPONIBLE');
  });

  it('openapi.yaml se regeneró con el build: incluye ubicacion_aproximada y el código nuevo', () => {
    const yaml = readFileSync(resolve(raiz, 'openapi/openapi.yaml'), 'utf8');
    expect(yaml).toContain('ubicacion_aproximada');
    expect(yaml).toContain('UBICACION_PRECISA_DISPONIBLE');
    expect(yaml).toContain('maximum: 100000');
  });
});
