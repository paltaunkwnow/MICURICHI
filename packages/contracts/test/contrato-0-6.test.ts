import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from '../src/dominio/config.js';
import { ExportacionGeoJsonSchema, ExportarQuerySchema } from '../src/esquemas/admin.js';
import { ErrorApiSchema } from '../src/esquemas/comunes.js';
import { ResumenDistritoSchema, ResumenEjecutivoSchema } from '../src/esquemas/ejecutivo.js';
import {
  ReporteCambiarEstadoSchema,
  ReporteCrearSchema,
  ReporteFeatureSchema,
  ReporteTecnicoFeatureCollectionSchema,
  ReporteTecnicoFeatureSchema,
} from '../src/esquemas/reporte.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

const crear = {
  lat: -17.78,
  lon: -63.18,
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
  dispositivo: { lat: -17.78, lon: -63.18, precision_m: 10, antiguedad_s: 2 },
};

/** Rutas (`a.b.0.c`) de los errores de un safeParse fallido; vacío si pasó. */
function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

type DocOpenApi = {
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};

/** `$ref` del cuerpo 200 de una operación, para el tipo de contenido indicado. */
function refDe(doc: DocOpenApi, ruta: string, metodo: string, tipo = 'application/json') {
  const respuestas = doc.paths[ruta]?.[metodo]?.responses as
    | Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>
    | undefined;
  return respuestas?.['200']?.content?.[tipo]?.schema?.$ref;
}

describe('0.6.0: la reapertura exige motivo (CLAUDE.md §7.3)', () => {
  it('pasar a nuevo sin estado_motivo se rechaza y el error apunta a estado_motivo', () => {
    const r = ReporteCambiarEstadoSchema.safeParse({ estado: 'nuevo' });
    expect(r.success).toBe(false);
    expect(rutasDeError(r)).toContain('estado_motivo');
  });

  it('pasar a nuevo con motivo se acepta; validar sigue sin exigirlo', () => {
    expect(
      ReporteCambiarEstadoSchema.safeParse({
        estado: 'nuevo',
        estado_motivo: 'Se rechazó por error: el punto sí está en el municipio',
      }).success,
    ).toBe(true);
    expect(ReporteCambiarEstadoSchema.safeParse({ estado: 'validado' }).success).toBe(true);
  });
});

describe('0.6.0: evento_en acotado', () => {
  const AHORA = new Date('2026-09-26T12:00:00.000Z');
  const MIN = 60_000;
  const DIA = 86_400_000;
  const desplazado = (ms: number) => new Date(AHORA.getTime() + ms).toISOString();
  const conEvento = (evento_en: unknown) => ReporteCrearSchema.safeParse({ ...crear, evento_en });

  beforeEach(() => {
    vi.setSystemTime(AHORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('los límites son parámetros de dominio: 10 minutos hacia adelante y 365 días hacia atrás', () => {
    expect(CONFIG_DOMINIO.EVENTO_TOLERANCIA_FUTURO_MIN).toBe(10);
    expect(CONFIG_DOMINIO.EVENTO_MAX_DIAS_ATRAS).toBe(365);
  });

  it('rechaza una fecha futura (2099-01-01 se aceptaba y daba 201) con el error en evento_en', () => {
    const r = conEvento('2099-01-01T00:00:00Z');
    expect(r.success).toBe(false);
    expect(rutasDeError(r)).toEqual(['evento_en']);
    expect(r.error?.issues[0]?.message).toMatch(/futura/);
  });

  it('tolera hasta 10 minutos de adelanto (reloj del celular) y rechaza más', () => {
    expect(conEvento(desplazado(10 * MIN - 1000)).success).toBe(true);
    expect(conEvento(desplazado(10 * MIN + 1000)).success).toBe(false);
  });

  it('compara instantes y no texto: la zona del cliente no cambia el resultado', () => {
    // 08:09 en La Paz (UTC−4) son las 12:09 UTC: dentro de la tolerancia. 09:00 son las 13:00.
    expect(conEvento('2026-09-26T08:09:00-04:00').success).toBe(true);
    expect(conEvento('2026-09-26T09:00:00-04:00').success).toBe(false);
  });

  it('acepta hasta 365 días atrás y rechaza más, diciendo el límite', () => {
    expect(conEvento(desplazado(-365 * DIA + MIN)).success).toBe(true);
    const viejo = conEvento(desplazado(-365 * DIA - MIN));
    expect(viejo.success).toBe(false);
    expect(rutasDeError(viejo)).toEqual(['evento_en']);
    expect(viejo.error?.issues[0]?.message).toContain('365 días');
  });

  it('sin fecha sigue siendo válido: null o ausente (se asume creado_en)', () => {
    expect(conEvento(null).success).toBe(true);
    expect(ReporteCrearSchema.safeParse(crear).success).toBe(true);
  });
});

describe('0.6.0: coherencia de las respuestas del sumidero', () => {
  const con = (extra: Record<string, unknown>) =>
    ReporteCrearSchema.safeParse({ ...crear, ...extra });

  it('sin sumidero cercano no puede venir si está tapado o no', () => {
    for (const estado of ['tapado', 'no_tapado']) {
      const r = con({ sumidero_cercano: 'no', sumidero_estado: estado });
      expect(r.success).toBe(false);
      expect(rutasDeError(r)).toEqual(['sumidero_estado']);
    }
  });

  it('sin sumidero cercano el agua no puede brotar de él', () => {
    const r = con({ sumidero_cercano: 'no', agua_brota_sumidero: true });
    expect(r.success).toBe(false);
    expect(rutasDeError(r)).toEqual(['agua_brota_sumidero']);
  });

  it('las combinaciones coherentes se siguen aceptando', () => {
    expect(con({ sumidero_cercano: 'no' }).success).toBe(true);
    expect(
      con({ sumidero_cercano: 'no', sumidero_estado: null, agua_brota_sumidero: false }).success,
    ).toBe(true);
    expect(con({ sumidero_cercano: 'no', agua_brota_sumidero: null }).success).toBe(true);
    expect(
      con({ sumidero_cercano: 'si', sumidero_estado: 'tapado', agua_brota_sumidero: true }).success,
    ).toBe(true);
    expect(con({ sumidero_cercano: null, agua_brota_sumidero: true }).success).toBe(true);
  });
});

/** Propiedades de la vista técnica tal como las arma api-core (`vistaTecnica`). */
const tecnico = {
  id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
  creado_en: '2026-09-25T12:00:00.000Z',
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
  estado: 'rechazado',
  punto_critico_id: null,
  n_reportes_punto: null,
  precision_degradada: false,
  ubicacion_metodo: 'gps',
  precision_gps_m: 8,
  distancia_dispositivo_m: 3,
  ubicacion_tipo: 'vivienda_o_predio',
  sumidero_cercano: 'si',
  sumidero_estado: 'tapado',
  agua_brota_sumidero: false,
  severidad_manual: null,
  severidad_motivo: null,
  severidad_puntaje: 7,
  estado_motivo: 'Fuera del municipio',
  fusionado_en_id: null,
  validado_por: null,
  validado_en: null,
  actualizado_en: '2026-09-25T12:30:00.000Z',
  version_capa: '2025',
  resolucion_flags: { en_limite: false },
  autor_id: '0b6f9a57-3c1e-4d8a-9b2f-5e7c1a2d3f40',
};

const featureTecnica = {
  type: 'Feature',
  id: tecnico.id,
  // Coordenada exacta: sin jitter ni redondeo a 5 decimales.
  geometry: { type: 'Point', coordinates: [-63.1812345, -17.7812345] },
  properties: tecnico,
};

describe('0.6.0: la Feature técnica es parte del contrato', () => {
  it('ReporteTecnicoFeatureSchema conserva lo que la Feature pública descarta', () => {
    const t = ReporteTecnicoFeatureSchema.parse(featureTecnica);
    expect(t.properties.estado_motivo).toBe('Fuera del municipio');
    expect(t.properties.autor_id).toBe(tecnico.autor_id);
    expect(t.geometry.coordinates).toEqual([-63.1812345, -17.7812345]);
    const publica = ReporteFeatureSchema.parse(featureTecnica);
    expect('estado_motivo' in publica.properties).toBe(false);
    expect('autor_id' in publica.properties).toBe(false);
  });

  it('una Feature con solo las propiedades públicas no pasa por técnica', () => {
    const publica = ReporteFeatureSchema.parse(featureTecnica);
    expect(ReporteTecnicoFeatureSchema.safeParse(publica).success).toBe(false);
  });

  it('la colección técnica lleva la paginación que devuelve /tecnico/reportes', () => {
    const coleccion = {
      type: 'FeatureCollection',
      features: [featureTecnica],
      total: 1,
      total_exacto: true,
      pagina: 1,
      limite: 100,
    };
    const r = ReporteTecnicoFeatureCollectionSchema.parse(coleccion);
    expect(r.features[0]?.properties.estado_motivo).toBe('Fuera del municipio');
    expect(r.total_exacto).toBe(true);
    for (const campo of ['total', 'pagina', 'limite'] as const) {
      const { [campo]: _quitado, ...incompleta } = coleccion;
      expect(ReporteTecnicoFeatureCollectionSchema.safeParse(incompleta).success).toBe(false);
    }
  });

  it('el índice del paquete exporta los dos esquemas', () => {
    expect(ReporteTecnicoFeatureSchema).toBeDefined();
    expect(ReporteTecnicoFeatureCollectionSchema).toBeDefined();
    expect(contratos.ReporteTecnicoFeatureSchema).toBe(ReporteTecnicoFeatureSchema);
    expect(contratos.ReporteTecnicoFeatureCollectionSchema).toBe(
      ReporteTecnicoFeatureCollectionSchema,
    );
  });

  it('OpenAPI: moderación y vista técnica responden con la Feature técnica, no con propiedades sueltas', () => {
    const doc = construirOpenApi() as DocOpenApi;
    const feature = '#/components/schemas/ReporteTecnicoFeature';
    expect(refDe(doc, '/api/v1/reportes/{id}/estado', 'patch')).toBe(feature);
    expect(refDe(doc, '/api/v1/reportes/{id}/severidad', 'patch')).toBe(feature);
    expect(refDe(doc, '/api/v1/reportes/{id}/fusionar', 'post')).toBe(feature);
    expect(refDe(doc, '/api/v1/tecnico/reportes/{id}', 'get')).toBe(feature);
    expect(refDe(doc, '/api/v1/tecnico/reportes', 'get')).toBe(
      '#/components/schemas/ReporteTecnicoFeatureCollection',
    );
    expect(doc.components.schemas.ReporteTecnicoFeature).toBeDefined();
    expect(doc.components.schemas.ReporteTecnicoFeatureCollection).toBeDefined();
  });
});

describe('0.6.0: la exportación no recorta en silencio', () => {
  it('el tope de filas es un parámetro de dominio y también el valor por defecto de limite', () => {
    expect(CONFIG_DOMINIO.EXPORTAR_MAX_FILAS).toBe(50_000);
    expect(ExportarQuerySchema.parse({}).limite).toBe(50_000);
  });

  it('limite admite hasta el tope y rechaza más', () => {
    expect(ExportarQuerySchema.parse({ limite: '50000' }).limite).toBe(50_000);
    expect(ExportarQuerySchema.safeParse({ limite: '50001' }).success).toBe(false);
  });

  it('la respuesta GeoJSON declara total sin tope, exportados y truncado, además de la nota', () => {
    const exportacion = {
      type: 'FeatureCollection',
      nota_metodologica: NOTA_METODOLOGICA,
      generado_en: '2026-09-26T12:00:00.000Z',
      total: 60_000,
      exportados: 1,
      truncado: true,
      features: [featureTecnica],
    };
    const r = ExportacionGeoJsonSchema.parse(exportacion);
    expect(r.truncado).toBe(true);
    expect(r.features[0]?.properties.estado_motivo).toBe('Fuera del municipio');
    for (const campo of ['total', 'exportados', 'truncado', 'nota_metodologica'] as const) {
      const { [campo]: _quitado, ...incompleta } = exportacion;
      expect(ExportacionGeoJsonSchema.safeParse(incompleta).success).toBe(false);
    }
  });

  it('OpenAPI: /exportar documenta la respuesta GeoJSON y el tope de limite', () => {
    const doc = construirOpenApi() as DocOpenApi;
    expect(refDe(doc, '/api/v1/exportar', 'get', 'application/geo+json')).toBe(
      '#/components/schemas/ExportacionGeoJson',
    );
    const parametros = doc.paths['/api/v1/exportar']?.get?.parameters as {
      name: string;
      schema: { default?: number; maximum?: number };
    }[];
    const limite = parametros.find((p) => p.name === 'limite');
    expect(limite?.schema.default).toBe(50_000);
    expect(limite?.schema.maximum).toBe(50_000);
  });
});

describe('0.6.0: parámetros de cuota y de despliegue', () => {
  it('cuota de fotos por cuenta: 12 por hora', () => {
    expect(CONFIG_DOMINIO.FOTOS_POR_HORA_POR_CUENTA).toBe(12);
  });

  it('zona horaria por defecto del despliegue: America/La_Paz, válida para Intl', () => {
    expect(CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO).toBe('America/La_Paz');
    const formato = new Intl.DateTimeFormat('es', {
      timeZone: CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO,
    });
    expect(formato.resolvedOptions().timeZone).toBe('America/La_Paz');
  });

  it('guarda: ErrorApiSchema.codigo es texto libre, PAYLOAD_INVALIDO no necesita alta', () => {
    expect(
      ErrorApiSchema.safeParse({ codigo: 'PAYLOAD_INVALIDO', mensaje: 'JSON mal formado.' })
        .success,
    ).toBe(true);
  });
});

const sev = (critica: number, alta: number, media: number, baja: number) => ({
  critica,
  alta,
  media,
  baja,
});

/** Distrito de la capa vigente: 5 en revisión, 4 verificadas, ninguna resuelta. */
const distritoVigente = {
  distrito_id: 'distrito_municipal:07',
  codigo: '07',
  nombre: 'Distrito 7',
  en_capa_vigente: true,
  activas: { total: 9, verificadas: 4, en_revision: 5, por_severidad: sev(1, 2, 3, 3) },
  por_estado: { nuevo: 5, validado: 4, resuelto: 0 },
  ultimo_reporte_en: '2026-09-24T20:15:00.000Z',
};

/** Distrito que solo existe en una capa anterior: un reporte resuelto y nada activo. */
const distritoDeCapaAnterior = {
  distrito_id: 'distrito_municipal:01',
  codigo: '01',
  nombre: 'Distrito 1',
  en_capa_vigente: false,
  activas: { total: 0, verificadas: 0, en_revision: 0, por_severidad: sev(0, 0, 0, 0) },
  por_estado: { nuevo: 0, validado: 0, resuelto: 1 },
  ultimo_reporte_en: '2026-08-02T09:41:00.000Z',
};

const resumen = {
  generado_en: '2026-09-26T12:00:00.000Z',
  ventana: { desde: null, hasta: null },
  activas: { total: 9, verificadas: 4, en_revision: 5, por_severidad: sev(1, 2, 3, 3) },
  resueltas: 1,
  por_estado: { nuevo: 5, validado: 4, resuelto: 1 },
  por_distrito: [distritoVigente, distritoDeCapaAnterior],
  ultimo_reporte_en: '2026-09-24T20:15:00.000Z',
};

describe('0.6.0: el resumen ejecutivo separa inundación activa de trabajo resuelto', () => {
  it('acepta la forma nueva, también con ventana acotada y sin reportes', () => {
    const r = ResumenEjecutivoSchema.parse(resumen);
    expect(r.activas.total).toBe(9);
    expect(r.resueltas).toBe(1);
    expect(r.por_distrito.map((d) => d.en_capa_vigente)).toEqual([true, false]);
    const vacio = {
      ...resumen,
      ventana: { desde: '2026-09-19T12:00:00.000Z', hasta: '2026-09-26T12:00:00.000Z' },
      activas: { total: 0, verificadas: 0, en_revision: 0, por_severidad: sev(0, 0, 0, 0) },
      resueltas: 0,
      por_estado: { nuevo: 0, validado: 0, resuelto: 0 },
      por_distrito: [],
      ultimo_reporte_en: null,
    };
    expect(ResumenEjecutivoSchema.safeParse(vacio).success).toBe(true);
  });

  it('la raíz y los distritos ya no tienen total ni por_severidad sueltos', () => {
    const raiz = Object.keys(ResumenEjecutivoSchema.shape);
    const distrito = Object.keys(ResumenDistritoSchema.shape);
    for (const quitado of ['total', 'por_severidad']) {
      expect(raiz).not.toContain(quitado);
      expect(distrito).not.toContain(quitado);
    }
    expect(raiz).toEqual(
      expect.arrayContaining(['activas', 'resueltas', 'por_estado', 'por_distrito']),
    );
    expect(distrito).toEqual(expect.arrayContaining(['en_capa_vigente', 'activas', 'por_estado']));
  });

  it('activas.total es verificadas + en_revision y la severidad reparte solo las activas', () => {
    const conResueltasEnSeveridad = {
      ...resumen,
      activas: { ...resumen.activas, por_severidad: sev(1, 2, 3, 4) },
    };
    expect(rutasDeError(ResumenEjecutivoSchema.safeParse(conResueltasEnSeveridad))).toContain(
      'activas.por_severidad',
    );
    const totalQueNoSuma = { ...resumen, activas: { ...resumen.activas, total: 10 } };
    expect(rutasDeError(ResumenEjecutivoSchema.safeParse(totalQueNoSuma))).toContain(
      'activas.total',
    );
  });

  it('por_estado cuadra con activas y resueltas (verificadas = validado, en revisión = nuevo)', () => {
    const cruzadas = {
      ...resumen,
      activas: { ...resumen.activas, verificadas: 5, en_revision: 4 },
    };
    expect(rutasDeError(ResumenEjecutivoSchema.safeParse(cruzadas))).toEqual(
      expect.arrayContaining(['activas.verificadas', 'activas.en_revision']),
    );
    expect(rutasDeError(ResumenEjecutivoSchema.safeParse({ ...resumen, resueltas: 2 }))).toContain(
      'resueltas',
    );
    const distritoCruzado = {
      ...distritoVigente,
      activas: { ...distritoVigente.activas, verificadas: 5, en_revision: 4 },
    };
    expect(
      rutasDeError(
        ResumenEjecutivoSchema.safeParse({ ...resumen, por_distrito: [distritoCruzado] }),
      ),
    ).toContain('por_distrito.0.activas.verificadas');
  });

  it('ultimo_reporte_en va truncado al minuto (privacidad), en la raíz y en cada distrito', () => {
    const conSegundos = '2026-09-24T20:15:37.123Z';
    expect(
      rutasDeError(
        ResumenEjecutivoSchema.safeParse({ ...resumen, ultimo_reporte_en: conSegundos }),
      ),
    ).toContain('ultimo_reporte_en');
    expect(
      rutasDeError(
        ResumenEjecutivoSchema.safeParse({
          ...resumen,
          por_distrito: [{ ...distritoVigente, ultimo_reporte_en: conSegundos }],
        }),
      ),
    ).toContain('por_distrito.0.ultimo_reporte_en');
    expect(
      ResumenEjecutivoSchema.safeParse({
        ...resumen,
        ultimo_reporte_en: '2026-09-24T16:15:00-04:00',
      }).success,
    ).toBe(true);
  });

  it('rechaza distritos mal formados, señalando el campo', () => {
    const activas = distritoVigente.activas;
    const casos: [Record<string, unknown>, string][] = [
      [{ ...distritoVigente, distrito_id: undefined }, 'por_distrito.0.distrito_id'],
      [{ ...distritoVigente, en_capa_vigente: undefined }, 'por_distrito.0.en_capa_vigente'],
      [{ ...distritoVigente, activas: { ...activas, total: -1 } }, 'por_distrito.0.activas.total'],
      [{ ...distritoVigente, activas: { ...activas, total: '9' } }, 'por_distrito.0.activas.total'],
      [
        { ...distritoVigente, activas: { ...activas, por_severidad: { alta: 2 } } },
        'por_distrito.0.activas.por_severidad.critica',
      ],
      [
        { ...distritoVigente, por_estado: { nuevo: 5, validado: 4 } },
        'por_distrito.0.por_estado.resuelto',
      ],
      [{ ...distritoVigente, ultimo_reporte_en: 'ayer' }, 'por_distrito.0.ultimo_reporte_en'],
    ];
    for (const [malo, ruta] of casos)
      expect(
        rutasDeError(ResumenEjecutivoSchema.safeParse({ ...resumen, por_distrito: [malo] })),
      ).toContain(ruta);
  });

  it('OpenAPI publica la forma nueva del componente ResumenEjecutivo', () => {
    const doc = construirOpenApi() as DocOpenApi;
    const esquema = doc.components.schemas.ResumenEjecutivo as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(esquema.properties)).not.toContain('total');
    expect(Object.keys(esquema.properties)).not.toContain('por_severidad');
    expect(esquema.required).toEqual(expect.arrayContaining(['activas', 'resueltas']));
  });
});
