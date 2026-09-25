import { z } from 'zod';
import { CONFIG_DOMINIO } from './dominio/config.js';
import { CapaVersionSchema, ExportarQuerySchema, IndicadoresSchema } from './esquemas/admin.js';
import { LoginSchema, RegistroSchema, SesionActualSchema, UsuarioSchema } from './esquemas/auth.js';
import { ErrorApiSchema } from './esquemas/comunes.js';
import {
  AgregadoUvSchema,
  CapaInfoSchema,
  CapasVigentesSchema,
  PuntoCriticoSchema,
  ResolverEntradaSchema,
  ResolverRespuestaSchema,
} from './esquemas/geo.js';
import {
  FotoSubidaSchema,
  ReporteCambiarEstadoSchema,
  ReporteCrearSchema,
  ReporteFeatureCollectionSchema,
  ReporteFeatureSchema,
  ReporteFiltrosSchema,
  ReporteFusionarSchema,
  ReporteReclasificarSchema,
  ReporteTecnicoSchema,
} from './esquemas/reporte.js';

/** Esquemas publicados como componentes OpenAPI. Se generan desde Zod: no editar openapi.yaml a mano. */
export const COMPONENTES = {
  ErrorApi: ErrorApiSchema,
  ReporteCrear: ReporteCrearSchema,
  ReporteFiltros: ReporteFiltrosSchema,
  ReporteFeature: ReporteFeatureSchema,
  ReporteFeatureCollection: ReporteFeatureCollectionSchema,
  ReporteTecnico: ReporteTecnicoSchema,
  ReporteCambiarEstado: ReporteCambiarEstadoSchema,
  ReporteReclasificar: ReporteReclasificarSchema,
  ReporteFusionar: ReporteFusionarSchema,
  FotoSubida: FotoSubidaSchema,
  Login: LoginSchema,
  Registro: RegistroSchema,
  Usuario: UsuarioSchema,
  SesionActual: SesionActualSchema,
  CapaVersion: CapaVersionSchema,
  ExportarQuery: ExportarQuerySchema,
  Indicadores: IndicadoresSchema,
  ResolverEntrada: ResolverEntradaSchema,
  ResolverRespuesta: ResolverRespuestaSchema,
  CapasVigentes: CapasVigentesSchema,
  CapaInfo: CapaInfoSchema,
  PuntoCritico: PuntoCriticoSchema,
  AgregadoUv: AgregadoUvSchema,
} as const;

type Ref = { $ref: string };
const ref = (nombre: keyof typeof COMPONENTES): Ref => ({ $ref: `#/components/schemas/${nombre}` });
const json = (schema: Ref | Record<string, unknown>) => ({ 'application/json': { schema } });
const error = (descripcion: string) => ({
  description: descripcion,
  content: json(ref('ErrorApi')),
});

function op(
  resumen: string,
  etiqueta: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { summary: resumen, tags: [etiqueta], ...extra };
}

export function construirOpenApi(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const [nombre, schema] of Object.entries(COMPONENTES)) {
    // biome-ignore lint/suspicious/noExplicitAny: z.toJSONSchema acepta cualquier esquema Zod
    const js = z.toJSONSchema(schema as any, {
      target: 'draft-2020-12',
      unrepresentable: 'any',
      io: 'input',
    });
    delete (js as Record<string, unknown>).$schema;
    schemas[nombre] = js;
  }

  const seguridadSesion = [{ cookieSesion: [] }];

  return {
    openapi: '3.1.0',
    info: {
      title: 'Mi Curichi — API',
      version: '1.0.0',
      description:
        'Reporte ciudadano georreferenciado de puntos de inundación. Contrato generado desde packages/contracts (Zod). ' +
        `Severidad versión ${CONFIG_DOMINIO.RECURRENCIA_RADIO_M ? 1 : 1}; radio de recurrencia ${CONFIG_DOMINIO.RECURRENCIA_RADIO_M} m.`,
    },
    servers: [
      { url: 'http://localhost:3001', description: 'api-core local' },
      { url: 'http://localhost:3002', description: 'geo-service local' },
    ],
    tags: [
      { name: 'reportes', description: 'api-core (Parte 3)' },
      { name: 'fotos', description: 'api-core (Parte 3)' },
      { name: 'auth', description: 'api-core (Parte 3)' },
      { name: 'admin', description: 'api-core (Parte 3)' },
      { name: 'geo', description: 'geo-service (Parte 4)' },
    ],
    components: {
      schemas,
      securitySchemes: {
        cookieSesion: { type: 'apiKey', in: 'cookie', name: 'curichi_sesion' },
      },
    },
    paths: {
      '/api/v1/reportes': {
        post: op(
          'Crear un reporte. EXIGE SESIÓN (cualquier rol). El autor se toma de la sesión: el cuerpo no tiene ni puede tener un campo de autor. Además del rate limit por IP, cada cuenta solo puede crear un reporte cada 60 minutos.',
          'reportes',
          {
            security: seguridadSesion,
            requestBody: { required: true, content: json(ref('ReporteCrear')) },
            responses: {
              '201': {
                description: 'Reporte creado en estado nuevo',
                content: json(ref('ReporteFeature')),
              },
              '400': error('Payload inválido'),
              '401': error('SIN_SESION: hay que iniciar sesión para reportar'),
              '422': error('FUERA_DE_COBERTURA: el punto no cae en el municipio'),
              '429': error(
                'CUOTA_DE_REPORTES (un reporte por cuenta cada 60 min, con Retry-After) o rate limit por IP',
              ),
            },
          },
        ),
        get: op(
          'Listar reportes publicados (SIEMPRE vista pública: validados y resueltos, con la ubicación degradada que corresponda). La representación no cambia aunque la petición traiga cookie de sesión; para la vista técnica está /api/v1/tecnico/reportes.',
          'reportes',
          {
            parameters: parametrosDesde(ReporteFiltrosSchema),
            responses: {
              '200': {
                description: 'FeatureCollection pública (Cache-Control: public, no-cache)',
                content: json(ref('ReporteFeatureCollection')),
              },
            },
          },
        ),
      },
      '/api/v1/reportes/{id}': {
        get: op(
          'Detalle público de un reporte. Devuelve 404 si aún no está publicado, también para técnicos: la vista técnica vive en /api/v1/tecnico/reportes/{id}.',
          'reportes',
          {
            parameters: [idParam()],
            responses: {
              '200': {
                description: 'Feature pública (Cache-Control: public, no-cache)',
                content: json(ref('ReporteFeature')),
              },
              '404': error('No existe o no está publicado'),
            },
          },
        ),
      },
      '/api/v1/tecnico/reportes': {
        get: op(
          'Listar reportes con la vista técnica: coordenada exacta, todos los estados y las propiedades de moderación. Exige rol tecnico o admin; la intención va en la ruta para que ninguna caché ni ninguna cookie residual pueda producir esta representación desde una URL pública.',
          'reportes',
          {
            security: seguridadSesion,
            parameters: parametrosDesde(ReporteFiltrosSchema),
            responses: {
              '200': {
                description: 'FeatureCollection técnica (Cache-Control: private, no-store)',
                content: json(ref('ReporteFeatureCollection')),
              },
              '401': error('SIN_SESION'),
              '403': error('SIN_PERMISO: el rol no permite la vista técnica'),
            },
          },
        ),
      },
      '/api/v1/tecnico/reportes/{id}': {
        get: op('Detalle técnico de un reporte, en cualquier estado', 'reportes', {
          security: seguridadSesion,
          parameters: [idParam()],
          responses: {
            '200': {
              description: 'Feature técnica (Cache-Control: private, no-store)',
              content: json(ref('ReporteFeature')),
            },
            '401': error('SIN_SESION'),
            '403': error('SIN_PERMISO'),
            '404': error('No existe'),
          },
        }),
      },
      '/api/v1/reportes/{id}/estado': {
        patch: op('Cambiar estado (máquina de estados §7.3)', 'reportes', {
          security: seguridadSesion,
          parameters: [idParam()],
          requestBody: { required: true, content: json(ref('ReporteCambiarEstado')) },
          responses: {
            '200': { description: 'Reporte actualizado', content: json(ref('ReporteTecnico')) },
            '409': error('Transición no permitida'),
          },
        }),
      },
      '/api/v1/reportes/{id}/severidad': {
        patch: op('Reclasificar severidad (manual) o volver a la calculada', 'reportes', {
          security: seguridadSesion,
          parameters: [idParam()],
          requestBody: { required: true, content: json(ref('ReporteReclasificar')) },
          responses: {
            '200': { description: 'Reporte actualizado', content: json(ref('ReporteTecnico')) },
          },
        }),
      },
      '/api/v1/reportes/{id}/fusionar': {
        post: op('Marcar como duplicado de un reporte canónico', 'reportes', {
          security: seguridadSesion,
          parameters: [idParam()],
          requestBody: { required: true, content: json(ref('ReporteFusionar')) },
          responses: {
            '200': {
              description: 'Reporte marcado como duplicado',
              content: json(ref('ReporteTecnico')),
            },
          },
        }),
      },
      '/api/v1/fotos': {
        post: op(
          'Subir una foto (multipart). EXIGE SESIÓN, igual que crear el reporte al que va pegada. Se reprocesa y se eliminan metadatos EXIF antes de guardarla.',
          'fotos',
          {
            security: seguridadSesion,
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: { archivo: { type: 'string', format: 'binary' } },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Foto guardada', content: json(ref('FotoSubida')) },
              '401': error('SIN_SESION'),
              '413': error('Archivo demasiado grande'),
              '415': error('Tipo no permitido'),
            },
          },
        ),
      },
      '/api/v1/fotos/{key}': {
        get: op('Servir una foto ya sanitizada', 'fotos', {
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Imagen' } },
        }),
      },
      '/api/v1/exportar': {
        get: op('Exportar CSV o GeoJSON con nota metodológica', 'admin', {
          security: seguridadSesion,
          parameters: parametrosDesde(ExportarQuerySchema),
          responses: { '200': { description: 'Archivo' } },
        }),
      },
      '/api/v1/indicadores': {
        get: op('Indicadores básicos', 'admin', {
          security: seguridadSesion,
          responses: { '200': { description: 'Indicadores', content: json(ref('Indicadores')) } },
        }),
      },
      '/api/v1/auth/registro': {
        post: op(
          'Crear una cuenta ciudadana. La respuesta es la MISMA exista o no ese correo: no revela quién tiene cuenta. No inicia sesión (devolver cookie solo en el caso nuevo delataría lo anterior). El rol siempre es «ciudadano» y no se puede pedir otro.',
          'auth',
          {
            requestBody: { required: true, content: json(ref('Registro')) },
            responses: {
              '201': {
                description:
                  'CUENTA_LISTA. Respuesta idéntica para correo nuevo y correo ya existente.',
                content: json(ref('ErrorApi')),
              },
              '400': error('Payload inválido'),
              '429': error('DEMASIADAS_CUENTAS: demasiadas altas desde la misma IP'),
            },
          },
        ),
      },
      '/api/v1/auth/login': {
        post: op('Iniciar sesión (ciudadano, técnico o admin)', 'auth', {
          requestBody: { required: true, content: json(ref('Login')) },
          responses: {
            '200': { description: 'Sesión creada (cookie)', content: json(ref('Usuario')) },
            '401': error('Credenciales inválidas'),
          },
        }),
      },
      '/api/v1/auth/logout': {
        post: op('Cerrar sesión', 'auth', {
          security: seguridadSesion,
          responses: { '204': { description: 'Sesión cerrada' } },
        }),
      },
      '/api/v1/auth/yo': {
        get: op(
          'Usuario de la sesión, más `puede_reportar_desde` (ISO 8601 o null): cuándo vuelve a tener turno de reporte esta cuenta. Es información para la interfaz; la cuota la aplica el servidor al crear.',
          'auth',
          {
            security: seguridadSesion,
            responses: {
              '200': {
                description: 'Usuario y estado de su cuota',
                content: json(ref('SesionActual')),
              },
              '401': error('Sin sesión'),
            },
          },
        ),
      },
      '/api/v1/admin/capas': {
        get: op('Versiones de capas cargadas', 'admin', {
          security: seguridadSesion,
          responses: {
            '200': {
              description: 'Lista',
              content: json({ type: 'array', items: ref('CapaVersion') }),
            },
          },
        }),
      },
      '/api/v1/admin/capas/{id}/activar': {
        post: op('Activar una versión de capa como vigente', 'admin', {
          security: seguridadSesion,
          parameters: [idParam()],
          responses: { '200': { description: 'Activada', content: json(ref('CapaVersion')) } },
        }),
      },
      '/geo/v1/resolver': {
        post: op('Point-in-polygon: distrito, UV y manzana de un punto (§7.4)', 'geo', {
          requestBody: { required: true, content: json(ref('ResolverEntrada')) },
          responses: {
            '200': { description: 'Resolución', content: json(ref('ResolverRespuesta')) },
          },
        }),
      },
      '/geo/v1/capas/vigentes': {
        get: op('Versión vigente por capa', 'geo', {
          responses: {
            '200': { description: 'Mapa capa → versión', content: json(ref('CapasVigentes')) },
          },
        }),
      },
      '/geo/v1/capas': {
        get: op('Información de las capas vigentes (modo GeoJSON o teselas)', 'geo', {
          responses: {
            '200': {
              description: 'Lista',
              content: json({ type: 'array', items: ref('CapaInfo') }),
            },
          },
        }),
      },
      '/geo/v1/capas/{capa}': {
        get: op('GeoJSON web de la capa vigente (413 si debe consumirse por teselas)', 'geo', {
          parameters: [
            {
              name: 'capa',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['distrito_municipal', 'unidad_vecinal', 'manzana'] },
            },
          ],
          responses: { '200': { description: 'FeatureCollection' }, '413': error('Usar teselas') },
        }),
      },
      '/geo/v1/teselas/{capa}/{z}/{x}/{y}.mvt': {
        get: op('Teselas vectoriales generadas al vuelo desde la capa vigente', 'geo', {
          parameters: ['capa', 'z', 'x', 'y'].map((n) => ({
            name: n,
            in: 'path',
            required: true,
            schema: { type: n === 'capa' ? 'string' : 'integer' },
          })),
          responses: {
            '200': { description: 'application/vnd.mapbox-vector-tile' },
            '204': { description: 'Tesela vacía' },
          },
        }),
      },
      '/geo/v1/agregados/unidades-vecinales': {
        get: op('Reportes validados por UV', 'geo', {
          responses: {
            '200': {
              description: 'Lista',
              content: json({ type: 'array', items: ref('AgregadoUv') }),
            },
          },
        }),
      },
      '/geo/v1/puntos-criticos': {
        get: op('Puntos críticos (§9.2)', 'geo', {
          parameters: [
            {
              name: 'bbox',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'minLon,minLat,maxLon,maxLat',
            },
          ],
          responses: {
            '200': {
              description: 'Lista',
              content: json({ type: 'array', items: ref('PuntoCritico') }),
            },
          },
        }),
      },
      '/health': { get: op('Liveness', 'admin', { responses: { '200': { description: 'ok' } } }) },
      '/ready': {
        get: op('Readiness (base de datos y dependencias)', 'admin', {
          responses: { '200': { description: 'listo' }, '503': { description: 'no listo' } },
        }),
      },
    },
  };
}

function idParam() {
  return { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
}

function parametrosDesde(schema: z.ZodObject): unknown[] {
  // biome-ignore lint/suspicious/noExplicitAny: introspección genérica del esquema
  const js = z.toJSONSchema(schema as any, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
    io: 'input',
  }) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return Object.entries(js.properties ?? {}).map(([nombre, s]) => ({
    name: nombre,
    in: 'query',
    required: js.required?.includes(nombre) ?? false,
    schema: s,
  }));
}
