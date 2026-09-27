import { describe, expect, it } from 'vitest';
import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from '../src/dominio/config.js';
import {
  ESTADOS_PUBLICOS,
  ESTADOS_REPORTE,
  ESTADOS_RETIRADOS,
  ESTADOS_VERIFICADOS,
  ETIQUETAS,
} from '../src/dominio/enums.js';
import { SesionActualSchema } from '../src/esquemas/auth.js';
import { AgregadoUvSchema } from '../src/esquemas/geo.js';
import {
  MiReporteFeatureSchema,
  MiReporteSchema,
  MisReportesSchema,
  ReporteCambiarEstadoSchema,
  ReporteFeatureSchema,
  ReportePublicoSchema,
  ReporteTecnicoSchema,
  TRANSICIONES,
  transicionExiste,
  transicionPermitida,
} from '../src/esquemas/reporte.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

type Operacion = {
  summary?: string;
  security?: unknown[];
  responses: Record<
    string,
    {
      description?: string;
      headers?: Record<string, { description?: string }>;
      content?: Record<string, { schema?: { $ref?: string } }>;
    }
  >;
};
type EsquemaJson = {
  type?: string;
  description?: string;
  required?: string[];
  maxItems?: number;
  properties?: Record<string, EsquemaJson>;
};
type DocOpenApi = {
  paths: Record<string, Record<string, Operacion>>;
  components: { schemas: Record<string, EsquemaJson> };
};

const publico = {
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
  verificado: false,
  punto_critico_id: null,
  n_reportes_punto: null,
  precision_degradada: false,
};

const tecnico = {
  ...publico,
  ubicacion_metodo: 'gps',
  precision_gps_m: 8,
  distancia_dispositivo_m: 3,
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

const mio = {
  ...publico,
  publicar_en: '2026-09-26T12:01:00.000Z',
  segundos_para_publicar: 60,
  retirado: false,
};

const feature = (properties: Record<string, unknown>) => ({
  type: 'Feature',
  id: publico.id,
  geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
  properties,
});

describe('0.11.0: los estados públicos incluyen nuevo', () => {
  it('ESTADOS_PUBLICOS = nuevo, validado y resuelto; sin rechazado ni duplicado', () => {
    expect([...ESTADOS_PUBLICOS]).toStrictEqual(['nuevo', 'validado', 'resuelto']);
    expect(ESTADOS_PUBLICOS).not.toContain('rechazado');
    expect(ESTADOS_PUBLICOS).not.toContain('duplicado');
  });

  it('verificados: validado y resuelto; retirados: rechazado y duplicado', () => {
    expect([...ESTADOS_VERIFICADOS]).toStrictEqual(['validado', 'resuelto']);
    expect([...ESTADOS_RETIRADOS]).toStrictEqual(['rechazado', 'duplicado']);
    // Entre los tres cubren todos los estados sin repetir: nuevo es público y no verificado.
    const todos = new Set([...ESTADOS_PUBLICOS, ...ESTADOS_RETIRADOS]);
    expect(todos.size).toBe(ESTADOS_REPORTE.length);
  });

  it('ReportePublico acepta nuevo y rechaza rechazado y duplicado', () => {
    expect(ReportePublicoSchema.safeParse(publico).success).toBe(true);
    for (const estado of ['validado', 'resuelto'])
      expect(ReportePublicoSchema.safeParse({ ...publico, estado }).success).toBe(true);
    for (const estado of ['rechazado', 'duplicado'])
      expect(rutasDeError(ReportePublicoSchema.safeParse({ ...publico, estado }))).toEqual([
        'estado',
      ]);
  });

  it('la Feature pública tampoco pasa con un rechazado', () => {
    expect(
      ReporteFeatureSchema.safeParse(feature({ ...publico, estado: 'rechazado' })).success,
    ).toBe(false);
  });

  it('la vista técnica sigue aceptando todos los estados', () => {
    for (const estado of ESTADOS_REPORTE)
      expect(ReporteTecnicoSchema.safeParse({ ...tecnico, estado }).success).toBe(true);
  });

  it('verificado es booleano', () => {
    expect(ReportePublicoSchema.safeParse({ ...publico, verificado: 'no' }).success).toBe(false);
  });
});

describe('0.11.0: etiqueta pública del estado', () => {
  it('la etiqueta de nuevo es exactamente «NO SE HA VERIFICADO»', () => {
    expect(ETIQUETAS.estado_publico.nuevo).toBe('NO SE HA VERIFICADO');
    expect(ETIQUETAS.estado_publico.validado).toBe('Verificado');
    expect(ETIQUETAS.estado_publico.resuelto).toBe('Resuelto');
    expect(Object.keys(ETIQUETAS.estado_publico)).toStrictEqual([...ESTADOS_PUBLICOS]);
  });

  it('las etiquetas del panel no cambian', () => {
    expect(ETIQUETAS.estado.nuevo).toBe('Nuevo');
    expect(ETIQUETAS.estado.validado).toBe('Validado');
  });

  it('la nota metodológica avisa que los no verificados pueden ser erróneos, en una línea', () => {
    expect(NOTA_METODOLOGICA).toContain(
      'Los reportes marcados «NO SE HA VERIFICADO» no fueron revisados por un técnico y pueden ser erróneos.',
    );
    expect(NOTA_METODOLOGICA).not.toMatch(/[\r\n]/);
  });
});

describe('0.11.0: demora de publicación', () => {
  it('60 s el 1.º reporte del día y 240 s el 2.º y el 3.º', () => {
    expect(CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S).toBe(60);
    expect(CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S).toBe(240);
  });

  it('SesionActual suma demora_proximo_s: entero de 0 a 3600', () => {
    const vecina = {
      id: '0b6f9a57-3c1e-4d8a-9b2f-5e7c1a2d3f40',
      email: 'vecina@example.com',
      nombre: 'Vecina',
      rol: 'ciudadano',
      puede_reportar_desde: null,
      reportes_restantes_hoy: 2,
    };
    // 0 porque api-core acepta demoras de 0 a 3600 s por variable (las pruebas corren con 0).
    for (const demora_proximo_s of [0, 60, 240, 3600])
      expect(SesionActualSchema.safeParse({ ...vecina, demora_proximo_s }).success).toBe(true);
    for (const demora_proximo_s of [-1, 3601, 60.5, null])
      expect(rutasDeError(SesionActualSchema.safeParse({ ...vecina, demora_proximo_s }))).toEqual([
        'demora_proximo_s',
      ]);
  });
});

describe('0.11.0: los reportes del autor (GET /mis-reportes y POST /reportes)', () => {
  it('50 como máximo', () => {
    expect(CONFIG_DOMINIO.MIS_REPORTES_MAX).toBe(50);
  });

  it('MiReporte es la vista pública más estado, verificado, publicar_en, segundos y retirado', () => {
    expect(MiReporteSchema.safeParse(mio).success).toBe(true);
    for (const campo of ['verificado', 'publicar_en', 'segundos_para_publicar', 'retirado']) {
      const { [campo as keyof typeof mio]: _q, ...incompleto } = mio;
      expect(rutasDeError(MiReporteSchema.safeParse(incompleto)), campo).toEqual([campo]);
    }
    expect(MiReporteSchema.safeParse({ ...mio, segundos_para_publicar: -1 }).success).toBe(false);
    expect(MiReporteSchema.safeParse({ ...mio, publicar_en: 'mañana' }).success).toBe(false);
  });

  it('el autor ve lo suyo en cualquier estado, retirado incluido', () => {
    for (const estado of ESTADOS_REPORTE)
      expect(MiReporteSchema.safeParse({ ...mio, estado }).success, estado).toBe(true);
    const rechazado = MiReporteSchema.parse({
      ...mio,
      estado: 'rechazado',
      retirado: true,
      segundos_para_publicar: 0,
    });
    expect(rechazado.retirado).toBe(true);
  });

  it('MisReportes es una FeatureCollection de hasta 50', () => {
    const f = feature(mio);
    expect(MiReporteFeatureSchema.safeParse(f).success).toBe(true);
    expect(MisReportesSchema.safeParse({ type: 'FeatureCollection', features: [f] }).success).toBe(
      true,
    );
    expect(
      MisReportesSchema.safeParse({
        type: 'FeatureCollection',
        features: Array.from({ length: 51 }, () => f),
      }).success,
    ).toBe(false);
  });

  it('el índice del paquete exporta los esquemas nuevos', () => {
    expect(contratos.MiReporteSchema).toBe(MiReporteSchema);
    expect(contratos.MiReporteFeatureSchema).toBe(MiReporteFeatureSchema);
    expect(contratos.MisReportesSchema).toBe(MisReportesSchema);
    expect(contratos.ESTADOS_VERIFICADOS).toBe(ESTADOS_VERIFICADOS);
  });
});

describe('0.11.0: agregados por UV con verificados', () => {
  const uv = {
    unidad_vecinal_id: 'unidad_vecinal:123',
    codigo: '123',
    nombre: 'Unidad Vecinal 123',
    distrito_id: 'distrito_municipal:07',
    n_reportes: 3,
    n_puntos_criticos: 1,
    severidad_max: 'critica',
    n_verificados: 1,
    severidad_max_verificada: 'media',
  };

  it('suma n_verificados y severidad_max_verificada, obligatorios', () => {
    expect(AgregadoUvSchema.safeParse(uv).success).toBe(true);
    // Una UV con solo no verificados: la coropleta la pinta neutra.
    expect(
      AgregadoUvSchema.safeParse({ ...uv, n_verificados: 0, severidad_max_verificada: null })
        .success,
    ).toBe(true);
    for (const campo of ['n_verificados', 'severidad_max_verificada']) {
      const { [campo as keyof typeof uv]: _q, ...incompleto } = uv;
      expect(rutasDeError(AgregadoUvSchema.safeParse(incompleto))).toEqual([campo]);
    }
    expect(AgregadoUvSchema.safeParse({ ...uv, n_verificados: -1 }).success).toBe(false);
  });
});

describe('0.11.0: un admin puede retirar un verificado', () => {
  it('validado → rechazado solo para admin', () => {
    expect(transicionPermitida('validado', 'rechazado', 'admin')).toBe(true);
    expect(transicionPermitida('validado', 'rechazado', 'tecnico')).toBe(false);
    expect(transicionPermitida('validado', 'rechazado', 'ejecutivo')).toBe(false);
    expect(transicionPermitida('validado', 'rechazado', 'ciudadano')).toBe(false);
  });

  it('transicionExiste separa el 403 (rol) del 409 (transición inexistente)', () => {
    expect(transicionExiste('validado', 'rechazado')).toBe(true);
    expect(transicionExiste('resuelto', 'rechazado')).toBe(false);
    expect(transicionExiste('duplicado', 'nuevo')).toBe(false);
    expect(transicionExiste('inventado', 'nuevo')).toBe(false);
  });

  it('el resto de la máquina de estados no cambia', () => {
    const permitidas: [string, string, string[]][] = [
      ['nuevo', 'validado', ['tecnico', 'admin']],
      ['nuevo', 'rechazado', ['tecnico', 'admin']],
      ['nuevo', 'duplicado', ['tecnico', 'admin']],
      ['validado', 'resuelto', ['tecnico', 'admin']],
      ['validado', 'duplicado', ['tecnico', 'admin']],
      ['validado', 'rechazado', ['admin']],
      ['rechazado', 'nuevo', ['admin']],
    ];
    for (const desde of ESTADOS_REPORTE)
      for (const hacia of ESTADOS_REPORTE)
        for (const rol of ['ciudadano', 'tecnico', 'admin', 'ejecutivo']) {
          const esperado = permitidas.some(
            ([d, h, roles]) => d === desde && h === hacia && roles.includes(rol),
          );
          expect(transicionPermitida(desde, hacia, rol), `${desde} → ${hacia} (${rol})`).toBe(
            esperado,
          );
        }
    expect(Object.keys(TRANSICIONES).sort()).toStrictEqual([...ESTADOS_REPORTE].sort());
  });

  it('retirar exige motivo', () => {
    expect(ReporteCambiarEstadoSchema.safeParse({ estado: 'rechazado' }).success).toBe(false);
    expect(
      ReporteCambiarEstadoSchema.safeParse({ estado: 'rechazado', estado_motivo: 'Inapropiado' })
        .success,
    ).toBe(true);
  });
});

describe('0.11.0: OpenAPI', () => {
  const doc = construirOpenApi() as DocOpenApi;

  it('GET /api/v1/mis-reportes: con sesión, MisReportes, 401 y sin caché compartida', () => {
    const op = doc.paths['/api/v1/mis-reportes']?.get;
    expect(op?.security).toBeDefined();
    const ok = op?.responses['200'];
    expect(ok?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/MisReportes',
    );
    expect(ok?.headers?.['Cache-Control']?.description).toContain('private, no-store');
    expect(ok?.headers?.Vary?.description).toContain('Cookie');
    expect(op?.responses['401']).toBeDefined();
    expect(doc.components.schemas.MisReportes?.properties?.features?.maxItems).toBe(50);
  });

  it('POST /reportes: el 201 y el replay devuelven publicar_en y segundos_para_publicar', () => {
    const op = doc.paths['/api/v1/reportes']?.post;
    for (const codigo of ['201', '200'])
      expect(op?.responses[codigo]?.content?.['application/json']?.schema?.$ref, codigo).toBe(
        '#/components/schemas/MiReporteFeature',
      );
    expect(op?.summary).toContain(`${CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S} s`);
    expect(op?.summary).toContain(`${CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S} s`);
    const props = doc.components.schemas.MiReporte?.required ?? [];
    for (const campo of [
      'estado',
      'verificado',
      'publicar_en',
      'segundos_para_publicar',
      'retirado',
    ])
      expect(props).toContain(campo);
  });

  it('GET /reportes y /reportes/{id}: nuevo como «NO SE HA VERIFICADO», nunca en espera', () => {
    const lista = doc.paths['/api/v1/reportes']?.get?.summary ?? '';
    expect(lista).toContain('NO SE HA VERIFICADO');
    expect(lista).toContain('publicar_en');
    const detalle = doc.paths['/api/v1/reportes/{id}']?.get?.responses['404']?.description ?? '';
    expect(detalle).toContain('rechazado');
    expect(detalle).toContain('duplicado');
  });

  it('GET /fotos/{key}: publicadas con public, no-cache y ETag; el autor ve las suyas', () => {
    const op = doc.paths['/api/v1/fotos/{key}']?.get;
    const texto = `${op?.summary} ${op?.responses['200']?.headers?.['Cache-Control']?.description}`;
    expect(texto).toContain('public, no-cache');
    expect(texto).toContain('autor');
    expect(texto).not.toContain('max-age=3600');
    expect(op?.responses['200']?.headers?.ETag).toBeDefined();
    expect(op?.responses['304']).toBeDefined();
  });

  it('PATCH estado: el técnico que retira un verificado recibe 403', () => {
    const op = doc.paths['/api/v1/reportes/{id}/estado']?.patch;
    expect(op?.responses['403']?.description).toContain('validado → rechazado');
    expect(op?.responses['404']?.description).toContain('publicar_en');
  });

  it('GET /auth/yo menciona demora_proximo_s', () => {
    expect(doc.paths['/api/v1/auth/yo']?.get?.summary).toContain('demora_proximo_s');
    expect(doc.components.schemas.SesionActual?.properties?.demora_proximo_s).toBeDefined();
  });

  it('agregados: n_verificados y severidad_max_verificada en el componente', () => {
    const req = doc.components.schemas.AgregadoUv?.required ?? [];
    expect(req).toContain('n_verificados');
    expect(req).toContain('severidad_max_verificada');
  });

  it('ningún texto del contrato dice «solo vos»', () => {
    const todo = JSON.stringify({
      openapi: doc,
      etiquetas: ETIQUETAS,
      nota: NOTA_METODOLOGICA,
      config: CONFIG_DOMINIO,
    });
    expect(todo.toLowerCase()).not.toContain('solo vos');
  });
});
