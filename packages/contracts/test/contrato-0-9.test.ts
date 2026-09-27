import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from '../src/dominio/config.js';
import {
  CODIGOS_UBICACION_DISPOSITIVO,
  dentroDelRadio,
  distanciaMetros,
  RADIO_TIERRA_M,
} from '../src/dominio/geo.js';
import {
  DispositivoSchema,
  ReporteCrearSchema,
  ReportePublicoSchema,
  ReporteTecnicoSchema,
} from '../src/esquemas/reporte.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

/** Rutas (`a.b.c`) de los errores de un safeParse fallido; vacío si pasó. */
function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

/** Centro de Santa Cruz de la Sierra: la latitud a la que se mide el radio en esta instalación. */
const ANCLA = { lat: -17.78, lon: -63.18 };
const RAD = Math.PI / 180;

/** Punto a `metros` del ancla hacia el norte (lat) o el este (lon), sobre la esfera de distanciaMetros. */
function aMetros(metros: number, hacia: 'norte' | 'este') {
  const angulo = metros / RADIO_TIERRA_M / RAD;
  return hacia === 'norte'
    ? { lat: ANCLA.lat + angulo, lon: ANCLA.lon }
    : { lat: ANCLA.lat, lon: ANCLA.lon + angulo / Math.cos(ANCLA.lat * RAD) };
}

const dispositivo = { lat: -17.78, lon: -63.18, precision_m: 12, antiguedad_s: 3 };

const crear = {
  lat: -17.7802,
  lon: -63.1801,
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
  dispositivo,
};

type Operacion = {
  summary?: string;
  description?: string;
  responses: Record<string, { description?: string }>;
};
type EsquemaJson = {
  type?: string;
  description?: string;
  required?: string[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, EsquemaJson>;
  anyOf?: EsquemaJson[];
};
type DocOpenApi = {
  paths: Record<string, Record<string, Operacion>>;
  components: { schemas: Record<string, EsquemaJson> };
};

describe('0.9.0: parámetros de la ubicación del dispositivo', () => {
  it('radio de 60 m, precisión de 50 m como máximo y posición de 600 s como máximo', () => {
    expect(CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M).toBe(60);
    expect(CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M).toBe(50);
    expect(CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S).toBe(600);
  });

  it('la tolerancia de 0,5 m que suma api-core al radio es del contrato, como el radio', () => {
    expect(CONFIG_DOMINIO.REPORTE_RADIO_TOLERANCIA_M).toBe(0.5);
  });

  it('los tres 422 de la posición del dispositivo, en el orden en que se comprueban', () => {
    expect([...CODIGOS_UBICACION_DISPOSITIVO]).toStrictEqual([
      'PRECISION_INSUFICIENTE',
      'POSICION_VENCIDA',
      'UBICACION_FUERA_DE_RADIO',
    ]);
  });

  it('se exportan desde el índice del paquete', () => {
    const exportados = Object.keys(contratos);
    for (const nombre of [
      'distanciaMetros',
      'dentroDelRadio',
      'CODIGOS_UBICACION_DISPOSITIVO',
      'DispositivoSchema',
    ])
      expect(exportados).toContain(nombre);
  });
});

describe('0.9.0: la nota metodológica dice que el radio no prueba la presencia', () => {
  it('contiene la frase del radio de 60 m (§9.5), que así llega a toda exportación', () => {
    expect(NOTA_METODOLOGICA).toContain(
      'El radio de 60 m no prueba que el vecino estuviera en el lugar: el GPS del teléfono se puede falsear.',
    );
  });

  it('sigue siendo una sola línea: va entera en el encabezado del CSV', () => {
    expect(NOTA_METODOLOGICA).not.toMatch(/[\r\n]/);
  });
});

describe('0.9.0: distanciaMetros (haversine)', () => {
  it('usa el radio medio de la Tierra', () => {
    expect(RADIO_TIERRA_M).toBe(6_371_008.8);
  });

  it('un grado de latitud mide 111 195,08 m, a cualquier longitud', () => {
    expect(distanciaMetros(ANCLA, { lat: -16.78, lon: -63.18 })).toBeCloseTo(111_195.08, 2);
    expect(distanciaMetros({ lat: 10, lon: 20 }, { lat: 11, lon: 20 })).toBeCloseTo(111_195.08, 2);
  });

  it('a la latitud de Santa Cruz, 0,001° de longitud son 105,88 m y en diagonal 153,54 m', () => {
    expect(distanciaMetros(ANCLA, { lat: -17.78, lon: -63.179 })).toBeCloseTo(105.884, 3);
    expect(distanciaMetros(ANCLA, { lat: -17.779, lon: -63.179 })).toBeCloseTo(153.544, 3);
  });

  it('es cero en el mismo punto y simétrica', () => {
    const otro = { lat: -17.7631, lon: -63.1956 };
    expect(distanciaMetros(ANCLA, ANCLA)).toBe(0);
    expect(distanciaMetros(ANCLA, otro)).toBe(distanciaMetros(otro, ANCLA));
    expect(distanciaMetros(ANCLA, otro)).toBeCloseTo(2_502.01, 2);
  });

  it('a 60 m, la esfera difiere del elipsoide WGS 84 en menos de 0,5 m', () => {
    // Radios de curvatura del elipsoide a la latitud del ancla: meridiano (M) y primer vertical (N).
    const a = 6_378_137;
    const e2 = 0.006_694_379_990_14;
    const s2 = Math.sin(ANCLA.lat * RAD) ** 2;
    const M = (a * (1 - e2)) / (1 - e2 * s2) ** 1.5;
    const N = a / Math.sqrt(1 - e2 * s2);
    const norte = { lat: ANCLA.lat + 60 / M / RAD, lon: ANCLA.lon };
    const este = { lat: ANCLA.lat, lon: ANCLA.lon + 60 / (N * Math.cos(ANCLA.lat * RAD)) / RAD };
    expect(Math.abs(distanciaMetros(ANCLA, norte) - 60)).toBeLessThan(0.5);
    expect(Math.abs(distanciaMetros(ANCLA, este) - 60)).toBeLessThan(0.5);
  });
});

describe('0.9.0: dentroDelRadio', () => {
  it('acepta 59 y 60 m y rechaza 61 m, hacia el norte y hacia el este', () => {
    for (const hacia of ['norte', 'este'] as const) {
      expect(dentroDelRadio(aMetros(59, hacia), ANCLA)).toBe(true);
      expect(dentroDelRadio(aMetros(60, hacia), ANCLA)).toBe(true);
      expect(dentroDelRadio(aMetros(61, hacia), ANCLA)).toBe(false);
    }
  });

  it('el radio por defecto es REPORTE_RADIO_DISPOSITIVO_M y se puede pasar otro', () => {
    expect(dentroDelRadio(aMetros(80, 'norte'), ANCLA)).toBe(false);
    expect(dentroDelRadio(aMetros(80, 'norte'), ANCLA, { radioM: 100 })).toBe(true);
    expect(dentroDelRadio(aMetros(30, 'este'), ANCLA, { radioM: 25 })).toBe(false);
  });

  it('la tolerancia se suma al radio: 60,4 m entra con 0,5 m y 61 m no', () => {
    expect(dentroDelRadio(aMetros(60.4, 'norte'), ANCLA)).toBe(false);
    expect(dentroDelRadio(aMetros(60.4, 'norte'), ANCLA, { toleranciaM: 0.5 })).toBe(true);
    expect(dentroDelRadio(aMetros(61, 'norte'), ANCLA, { toleranciaM: 0.5 })).toBe(false);
  });

  it('una coordenada que no es un número queda afuera', () => {
    expect(dentroDelRadio({ lat: Number.NaN, lon: ANCLA.lon }, ANCLA)).toBe(false);
  });
});

describe('0.9.0: ReporteCrearSchema exige la posición del dispositivo', () => {
  it('un reporte con dispositivo es válido', () => {
    const r = ReporteCrearSchema.safeParse(crear);
    expect(r.success).toBe(true);
    expect(r.data?.dispositivo).toStrictEqual(dispositivo);
  });

  it('sin dispositivo, o con null, falla señalando el campo', () => {
    const { dispositivo: _sin, ...sinDispositivo } = crear;
    expect(rutasDeError(ReporteCrearSchema.safeParse(sinDispositivo))).toEqual(['dispositivo']);
    expect(rutasDeError(ReporteCrearSchema.safeParse({ ...crear, dispositivo: null }))).toEqual([
      'dispositivo',
    ]);
  });

  it('Zod solo acota rangos físicos: 80 m de precisión y 900 s de antigüedad pasan (los topes son 422 de api-core)', () => {
    const con = (extra: Record<string, unknown>) =>
      ReporteCrearSchema.safeParse({ ...crear, dispositivo: { ...dispositivo, ...extra } });
    expect(con({ precision_m: 80 }).success).toBe(true);
    expect(con({ precision_m: 0 }).success).toBe(true);
    expect(con({ precision_m: 10_000 }).success).toBe(true);
    expect(con({ antiguedad_s: 0 }).success).toBe(true);
    expect(con({ antiguedad_s: 900 }).success).toBe(true);
    expect(con({ antiguedad_s: 2.5 }).success).toBe(true);
  });

  it('fuera de los rangos físicos falla en el campo del dispositivo', () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ precision_m: 10_001 }, 'dispositivo.precision_m'],
      [{ precision_m: -1 }, 'dispositivo.precision_m'],
      [{ precision_m: '12' }, 'dispositivo.precision_m'],
      [{ precision_m: null }, 'dispositivo.precision_m'],
      [{ antiguedad_s: -1 }, 'dispositivo.antiguedad_s'],
      [{ antiguedad_s: Number.POSITIVE_INFINITY }, 'dispositivo.antiguedad_s'],
      [{ lat: 91 }, 'dispositivo.lat'],
      [{ lon: -181 }, 'dispositivo.lon'],
    ];
    for (const [extra, ruta] of casos) {
      const r = ReporteCrearSchema.safeParse({
        ...crear,
        dispositivo: { ...dispositivo, ...extra },
      });
      expect(rutasDeError(r)).toEqual([ruta]);
    }
    const { antiguedad_s: _a, ...sinAntiguedad } = dispositivo;
    expect(rutasDeError(DispositivoSchema.safeParse(sinAntiguedad))).toEqual(['antiguedad_s']);
  });

  it('ya no recibe ubicacion_metodo ni precision_gps_m: los deriva el servidor', () => {
    const claves = Object.keys(ReporteCrearSchema.shape);
    expect(claves).toContain('dispositivo');
    expect(claves).not.toContain('ubicacion_metodo');
    expect(claves).not.toContain('precision_gps_m');
    const r = ReporteCrearSchema.parse({
      ...crear,
      ubicacion_metodo: 'manual',
      precision_gps_m: 8,
    });
    expect('ubicacion_metodo' in r).toBe(false);
    expect('precision_gps_m' in r).toBe(false);
  });
});

describe('0.9.0: la vista técnica muestra la distancia al dispositivo', () => {
  const tecnico = {
    id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
    creado_en: '2026-09-26T12:00:00.000Z',
    evento_en: null,
    distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 7' },
    unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Los Lotes' },
    descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
    fotos: [],
    profundidad_estimada: 'rodilla',
    frecuencia: 'cada_lluvia_fuerte',
    causa_presunta: 'desconocida',
    severidad: 'media',
    severidad_calculada: 'media',
    estado: 'nuevo',
    punto_critico_id: null,
    n_reportes_punto: null,
    precision_degradada: false,
    ubicacion_metodo: 'manual',
    precision_gps_m: 12,
    distancia_dispositivo_m: 12,
    ubicacion_tipo: 'via_publica',
    sumidero_cercano: null,
    sumidero_estado: null,
    agua_brota_sumidero: null,
    severidad_manual: null,
    severidad_motivo: null,
    severidad_puntaje: 5,
    estado_motivo: null,
    fusionado_en_id: null,
    validado_por: null,
    validado_en: null,
    actualizado_en: '2026-09-26T12:00:00.000Z',
    version_capa: 'DM_UV_MZ_2025',
    resolucion_flags: {},
    autor_id: null,
  };

  it('acepta la distancia en metros enteros, y null en los reportes anteriores', () => {
    expect(ReporteTecnicoSchema.parse(tecnico).distancia_dispositivo_m).toBe(12);
    expect(
      ReporteTecnicoSchema.parse({ ...tecnico, distancia_dispositivo_m: null })
        .distancia_dispositivo_m,
    ).toBeNull();
  });

  it('el campo es obligatorio en la vista técnica y va de 0 a 1000 m enteros', () => {
    const { distancia_dispositivo_m: _d, ...sinDistancia } = tecnico;
    expect(rutasDeError(ReporteTecnicoSchema.safeParse(sinDistancia))).toEqual([
      'distancia_dispositivo_m',
    ]);
    for (const distancia_dispositivo_m of [-1, 1001, 12.5])
      expect(
        rutasDeError(ReporteTecnicoSchema.safeParse({ ...tecnico, distancia_dispositivo_m })),
      ).toEqual(['distancia_dispositivo_m']);
  });

  it('la vista pública no la declara', () => {
    expect(Object.keys(ReportePublicoSchema.shape)).not.toContain('distancia_dispositivo_m');
  });
});

describe('0.9.0: OpenAPI', () => {
  const doc = construirOpenApi() as DocOpenApi;
  const crearOp = doc.paths['/api/v1/reportes']?.post;

  it('POST /reportes documenta los tres 422 nuevos junto a FUERA_DE_COBERTURA', () => {
    const d422 = crearOp?.responses['422']?.description ?? '';
    for (const codigo of ['FUERA_DE_COBERTURA', ...CODIGOS_UBICACION_DISPOSITIVO])
      expect(d422).toContain(codigo);
    for (const tope of ['60 m', '50 m', '600 s']) expect(d422).toContain(tope);
    expect(d422).toContain('no gastan cupo');
  });

  it('el 422 del radio dice con qué tolerancia lo rechaza api-core', () => {
    const d422 = crearOp?.responses['422']?.description ?? '';
    expect(d422).toContain(
      'UBICACION_FUERA_DE_RADIO: el punto está a más de 60,5 m de dispositivo',
    );
    expect(d422).toContain('0,5 m de tolerancia');
  });

  it('ubicacion_metodo se describe con el margen de error del dispositivo, no con 2 m fijos', () => {
    const descripcion =
      doc.components.schemas.ReporteTecnico?.properties?.ubicacion_metodo?.description ?? '';
    expect(descripcion).toContain('precision_m');
    expect(descripcion).toContain('2 m');
    expect(descripcion).not.toContain('se ajustó dentro del radio');
  });

  it('POST /reportes dice que la posición del dispositivo no se guarda', () => {
    expect(`${crearOp?.summary ?? ''} ${crearOp?.description ?? ''}`).toContain(
      'La posición del dispositivo no se guarda',
    );
  });

  it('el componente ReporteCrear exige dispositivo con sus rangos físicos', () => {
    const crearJs = doc.components.schemas.ReporteCrear;
    expect(crearJs?.required).toContain('dispositivo');
    expect(crearJs?.properties).not.toHaveProperty('ubicacion_metodo');
    expect(crearJs?.properties).not.toHaveProperty('precision_gps_m');
    const disp = crearJs?.properties?.dispositivo;
    expect(disp?.required).toEqual(['lat', 'lon', 'precision_m', 'antiguedad_s']);
    expect(disp?.properties?.precision_m).toMatchObject({ minimum: 0, maximum: 10_000 });
    expect(disp?.properties?.antiguedad_s).toMatchObject({ minimum: 0 });
    expect(disp?.properties?.antiguedad_s).not.toHaveProperty('maximum');
  });

  it('el componente ReporteTecnico declara distancia_dispositivo_m', () => {
    const tec = doc.components.schemas.ReporteTecnico;
    expect(tec?.required).toContain('distancia_dispositivo_m');
    expect(tec?.properties).toHaveProperty('distancia_dispositivo_m');
  });
});

describe('versión del paquete', () => {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  it('package.json y la última entrada del CHANGELOG dicen la misma versión, 0.9.0', () => {
    const { version } = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8')) as {
      version: string;
    };
    const ultima = readFileSync(resolve(raiz, 'CHANGELOG.md'), 'utf8').match(/^## (\S+)/m)?.[1];
    expect(version).toBe('0.9.0');
    expect(ultima).toBe(version);
  });
});
