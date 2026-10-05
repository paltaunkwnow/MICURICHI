import { z } from 'zod';
import { CONFIG_DOMINIO } from './dominio/config.js';
import { ETIQUETAS, TIPOS_CAPA } from './dominio/enums.js';
import { SEVERIDAD_VERSION } from './dominio/severidad.js';
import {
  CapaVersionSchema,
  ExportacionGeoJsonSchema,
  ExportarQuerySchema,
  IndicadoresFiltrosSchema,
  IndicadoresSchema,
  ReadyApiCoreSchema,
} from './esquemas/admin.js';
import { LoginSchema, RegistroSchema, SesionActualSchema, UsuarioSchema } from './esquemas/auth.js';
import { ErrorApiSchema } from './esquemas/comunes.js';
import { ConfiguracionPublicaSchema } from './esquemas/configuracion.js';
import { ResumenEjecutivoQuerySchema, ResumenEjecutivoSchema } from './esquemas/ejecutivo.js';
import {
  AgregadoUvSchema,
  CapaInfoSchema,
  CapasVigentesSchema,
  CODIGO_CAPA_CAMBIO,
  HuellaCapaSchema,
  PuntoCriticoSchema,
  ResolverEntradaSchema,
  ResolverRespuestaSchema,
} from './esquemas/geo.js';
import {
  FotoSubidaSchema,
  MiReporteFeatureSchema,
  MiReporteSchema,
  MisReportesSchema,
  ReporteCambiarEstadoSchema,
  ReporteCrearSchema,
  ReporteFeatureCollectionSchema,
  ReporteFeatureSchema,
  ReporteFiltrosSchema,
  ReporteFusionarSchema,
  ReporteReclasificarSchema,
  ReporteTecnicoFeatureCollectionSchema,
  ReporteTecnicoFeatureSchema,
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
  ReporteTecnicoFeature: ReporteTecnicoFeatureSchema,
  ReporteTecnicoFeatureCollection: ReporteTecnicoFeatureCollectionSchema,
  MiReporte: MiReporteSchema,
  MiReporteFeature: MiReporteFeatureSchema,
  MisReportes: MisReportesSchema,
  ReporteCambiarEstado: ReporteCambiarEstadoSchema,
  ReporteReclasificar: ReporteReclasificarSchema,
  ReporteFusionar: ReporteFusionarSchema,
  FotoSubida: FotoSubidaSchema,
  Login: LoginSchema,
  Registro: RegistroSchema,
  Usuario: UsuarioSchema,
  SesionActual: SesionActualSchema,
  ConfiguracionPublica: ConfiguracionPublicaSchema,
  CapaVersion: CapaVersionSchema,
  ExportarQuery: ExportarQuerySchema,
  ExportacionGeoJson: ExportacionGeoJsonSchema,
  Indicadores: IndicadoresSchema,
  ResumenEjecutivo: ResumenEjecutivoSchema,
  ResolverEntrada: ResolverEntradaSchema,
  ResolverRespuesta: ResolverRespuestaSchema,
  CapasVigentes: CapasVigentesSchema,
  CapaInfo: CapaInfoSchema,
  PuntoCritico: PuntoCriticoSchema,
  AgregadoUv: AgregadoUvSchema,
  ReadyApiCore: ReadyApiCoreSchema,
} as const;

type Ref = { $ref: string };
const ref = (nombre: keyof typeof COMPONENTES): Ref => ({ $ref: `#/components/schemas/${nombre}` });
const json = (schema: Ref | Record<string, unknown>) => ({ 'application/json': { schema } });
const error = (descripcion: string) => ({
  description: descripcion,
  content: json(ref('ErrorApi')),
});

/** Metros con coma decimal, como se escriben en los textos del contrato. */
const metros = (m: number) => String(m).replace('.', ',');

const RADIO_M = CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M;
const TOLERANCIA_M = CONFIG_DOMINIO.REPORTE_RADIO_TOLERANCIA_M;
const POR_DIA = CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA;
const DEMORA_1 = CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S;
const DEMORA_N = CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S;
/** Qué se ve en público: el texto se repite en varias rutas y tiene que decir lo mismo. */
const VISTA_PUBLICA = `nuevo como «${ETIQUETAS.estado_publico.nuevo}», validado como «${ETIQUETAS.estado_publico.validado}» y resuelto como «${ETIQUETAS.estado_publico.resuelto}», solo con publicar_en <= now(); rechazado y duplicado no se publican`;

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
        `Severidad versión ${SEVERIDAD_VERSION}; radio de recurrencia ${CONFIG_DOMINIO.RECURRENCIA_RADIO_M} m.`,
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
      { name: 'ejecutivo', description: 'api-core (Parte 3)' },
      { name: 'configuracion', description: 'api-core (Parte 3)' },
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
          `Crear un reporte. EXIGE SESIÓN (cualquier rol). El autor se toma de la sesión: el cuerpo no tiene ni puede tener un campo de autor. El cuerpo lleva la posición del teléfono al enviar (dispositivo), y el punto tiene que estar a ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m o menos de ella. La posición del dispositivo no se guarda, no se registra en logs ni en auditoría y no entra en la huella de idempotencia: queda solo la distancia redondeada. ubicacion_metodo y precision_gps_m los deriva el servidor. Además del rate limit por IP, cada cuenta puede crear ${POR_DIA} reportes por día calendario en la zona horaria de la ciudad, contados en la base. El reporte queda en nuevo y se publica sin moderación previa, como «NO SE HA VERIFICADO», cuando llega su publicar_en: ${DEMORA_1} s después de crearlo si es el 1.º del día de la cuenta, ${DEMORA_N} s si es el 2.º o el 3.º. Lo fija el servidor al crear y ningún cliente lo puede adelantar; mientras espera no lo ve nadie más que su autor, técnicos incluidos.`,
          'reportes',
          {
            security: seguridadSesion,
            requestBody: { required: true, content: json(ref('ReporteCrear')) },
            responses: {
              '201': {
                description:
                  'Reporte creado en estado nuevo, en la vista del autor: publicar_en y segundos_para_publicar, calculados en la base (la cuenta regresiva de la interfaz parte de acá)',
                content: json(ref('MiReporteFeature')),
              },
              '200': {
                description:
                  'Replay de un envío con la misma Idempotency-Key de la misma cuenta (cabecera Idempotent-Replay: true): el reporte ya creado, con el mismo publicar_en y los segundos que le quedan ahora. No gasta cupo',
                content: json(ref('MiReporteFeature')),
              },
              '400': error(
                `PAYLOAD_INVALIDO. Además del formato: dispositivo ausente o fuera de sus rangos físicos (precision_m de 0 a 100 000, antiguedad_s ≥ 0), evento_en con más de ${CONFIG_DOMINIO.EVENTO_TOLERANCIA_FUTURO_MIN} min de adelanto o más de ${CONFIG_DOMINIO.EVENTO_MAX_DIAS_ATRAS} días de antigüedad, y respuestas del sumidero incoherentes (con sumidero_cercano = no, sin sumidero_estado ni agua_brota_sumidero = true)`,
              ),
              '401': error('SIN_SESION: hay que iniciar sesión para reportar'),
              '422': error(
                `PRECISION_INSUFICIENTE: dispositivo.precision_m mayor a ${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m sin ubicacion_aproximada. ` +
                  `UBICACION_PRECISA_DISPONIBLE: se pidió ubicacion_aproximada pero la precisión es de ${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m o menos (hay ubicación precisa disponible; usá el camino normal). ` +
                  `POSICION_VENCIDA: dispositivo.antiguedad_s mayor a ${CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S} s. ` +
                  `UBICACION_FUERA_DE_RADIO: el punto está a más de ${metros(RADIO_M + TOLERANCIA_M)} m de dispositivo (el radio de ${RADIO_M} m más ${metros(TOLERANCIA_M)} m de tolerancia por el redondeo de las coordenadas; la interfaz recorta el punto al radio sin tolerancia); con ubicacion_aproximada no se comprueba. ` +
                  'Se comprueban en ese orden, después de validar el cuerpo y antes de resolver la ubicación, y no gastan cupo. ' +
                  'FUERA_DE_COBERTURA: el punto no cae en el municipio',
              ),
              '429': error(
                `CUOTA_DE_REPORTES: la cuenta ya creó sus ${POR_DIA} reportes de hoy (día calendario en la zona horaria de la ciudad), con el mensaje «Ya enviaste los ${POR_DIA} reportes de hoy. Vas a poder enviar otro mañana.» y Retry-After con los segundos que faltan hasta la próxima medianoche local. O rate limit por IP, también con Retry-After`,
              ),
            },
          },
        ),
        get: op(
          `Listar reportes publicados (SIEMPRE vista pública: ${VISTA_PUBLICA}; con la ubicación degradada que corresponda y sin autor). La representación no cambia aunque la petición traiga cookie de sesión; para la vista técnica está /api/v1/tecnico/reportes, y para los propios, /api/v1/mis-reportes.`,
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
          `Detalle público de un reporte (${VISTA_PUBLICA}). Devuelve 404 si no está publicado, también para técnicos: la vista técnica vive en /api/v1/tecnico/reportes/{id}.`,
          'reportes',
          {
            parameters: [idParam()],
            responses: {
              '200': {
                description: 'Feature pública (Cache-Control: public, no-cache)',
                content: json(ref('ReporteFeature')),
              },
              '404': error(
                'NO_EXISTE: no existe, todavía espera su publicar_en, o está rechazado o duplicado (retirado del mapa o sumado a otro punto)',
              ),
            },
          },
        ),
      },
      '/api/v1/mis-reportes': {
        get: op(
          `Los reportes de la cuenta de la sesión, ${CONFIG_DOMINIO.MIS_REPORTES_MAX} como máximo y los más recientes primero, en cualquier estado: también mientras esperan su publicar_en y si los rechazaron o fusionaron (retirado). Es la vista pública más estado, verificado, publicar_en, segundos_para_publicar y retirado, sin autor ni campos de moderación. Filtra por el autor de la sesión: nunca devuelve reportes de otra cuenta.`,
          'reportes',
          {
            security: seguridadSesion,
            responses: {
              '200': {
                description: 'Reportes de la cuenta',
                headers: {
                  'Cache-Control': {
                    description: 'private, no-store: es de una sola cuenta',
                    schema: { type: 'string' },
                  },
                  Vary: { description: 'Cookie', schema: { type: 'string' } },
                },
                content: json(ref('MisReportes')),
              },
              '401': error('SIN_SESION'),
            },
          },
        ),
      },
      '/api/v1/tecnico/reportes': {
        get: op(
          'Listar reportes con la vista técnica: coordenada exacta, todos los estados y las propiedades de moderación, solo de los reportes ya publicados (publicar_en <= now(); los que esperan no aparecen). Exige rol tecnico o admin; la intención va en la ruta para que ninguna caché ni ninguna cookie residual pueda producir esta representación desde una URL pública.',
          'reportes',
          {
            security: seguridadSesion,
            parameters: parametrosDesde(ReporteFiltrosSchema),
            responses: {
              '200': {
                description: 'FeatureCollection técnica (Cache-Control: private, no-store)',
                content: json(ref('ReporteTecnicoFeatureCollection')),
              },
              '401': error('SIN_SESION'),
              '403': error('SIN_PERMISO: el rol no permite la vista técnica'),
            },
          },
        ),
      },
      '/api/v1/tecnico/reportes/{id}': {
        get: op('Detalle técnico de un reporte publicado, en cualquier estado', 'reportes', {
          security: seguridadSesion,
          parameters: [idParam()],
          responses: {
            '200': {
              description: 'Feature técnica (Cache-Control: private, no-store)',
              content: json(ref('ReporteTecnicoFeature')),
            },
            '401': error('SIN_SESION'),
            '403': error('SIN_PERMISO'),
            '404': error('NO_EXISTE: no existe o todavía espera su publicar_en'),
          },
        }),
      },
      '/api/v1/reportes/{id}/estado': {
        patch: op(
          'Cambiar estado (máquina de estados §7.3). Rechazar, fusionar, resolver y reabrir (volver a nuevo) exigen estado_motivo. Rechazar o fusionar retira el reporte del mapa público. validado → rechazado (retirar un verificado) es solo de admin. Nadie modera un reporte antes de su publicar_en.',
          'reportes',
          {
            security: seguridadSesion,
            parameters: [idParam()],
            requestBody: { required: true, content: json(ref('ReporteCambiarEstado')) },
            responses: {
              '200': {
                description: 'Reporte actualizado, en la vista técnica',
                content: json(ref('ReporteTecnicoFeature')),
              },
              '400': error('PAYLOAD_INVALIDO: p. ej. falta estado_motivo'),
              '401': error('SIN_SESION'),
              '403': error(
                'SIN_PERMISO: el rol no puede moderar, o la transición existe pero no para su rol (transicionExiste y no transicionPermitida): validado → rechazado y rechazado → nuevo son solo de admin',
              ),
              '404': error('NO_EXISTE: no existe o todavía espera su publicar_en'),
              '409': error(
                'TRANSICION_NO_PERMITIDA: la transición no existe desde el estado actual',
              ),
            },
          },
        ),
      },
      '/api/v1/reportes/{id}/severidad': {
        patch: op('Reclasificar severidad (manual) o volver a la calculada', 'reportes', {
          security: seguridadSesion,
          parameters: [idParam()],
          requestBody: { required: true, content: json(ref('ReporteReclasificar')) },
          responses: {
            '200': {
              description: 'Reporte actualizado, en la vista técnica',
              content: json(ref('ReporteTecnicoFeature')),
            },
            '400': error('PAYLOAD_INVALIDO: p. ej. reclasificación sin severidad_motivo'),
            '401': error('SIN_SESION'),
            '403': error('SIN_PERMISO'),
            '404': error('NO_EXISTE'),
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
              description: 'Reporte marcado como duplicado, en la vista técnica',
              content: json(ref('ReporteTecnicoFeature')),
            },
            '400': error('PAYLOAD_INVALIDO'),
            '401': error('SIN_SESION'),
            '403': error('SIN_PERMISO'),
            '404': error('NO_EXISTE'),
            '409': error(
              'TRANSICION_NO_PERMITIDA: el canónico debe existir, ser otro y estar validado',
            ),
          },
        }),
      },
      '/api/v1/fotos': {
        post: op(
          `Subir una foto (multipart). EXIGE SESIÓN, igual que crear el reporte al que va pegada. Entra JPEG, PNG o WebP, reconocidos por su contenido y no por la extensión, y se guarda siempre en WebP (calidad ${CONFIG_DOMINIO.FOTO_CALIDAD_WEBP}), con ${CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX} px por lado como máximo y sin metadatos: el servidor la vuelve a codificar y descarta EXIF (incluida la posición GPS), XMP y el perfil ICC. De una imagen animada queda solo el primer cuadro. Hasta que su autor la asocia a un reporte, una foto sin reporte solo la ve quien la subió.`,
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
              '201': {
                description: 'Foto guardada en image/webp',
                content: json(ref('FotoSubida')),
              },
              '400': error('SIN_ARCHIVO: falta la imagen en el campo archivo'),
              '401': error('SIN_SESION'),
              '413': error('ARCHIVO_GRANDE: archivo demasiado grande'),
              '415': error(
                'TIPO_NO_PERMITIDO (solo JPEG, PNG o WebP) o IMAGEN_INVALIDA (no se pudo leer)',
              ),
              '429': error(
                `CUOTA_DE_FOTOS: ${CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA} fotos por cuenta y por día calendario en la zona horaria de la ciudad, reservadas antes de procesar y devueltas si el procesamiento falla; Retry-After hasta la próxima medianoche local. O límite por IP`,
              ),
              '507': error(
                'SIN_ESPACIO: con las fotos en disco, queda menos que FOTOS_MIN_LIBRE_BYTES libre. Se responde antes de procesar la imagen y sin gastar cupo; /ready queda degradado (fotos: poco_espacio). Las fotos comparten disco con PostgreSQL en la VPS',
              ),
            },
          },
        ),
      },
      '/api/v1/fotos/{key}': {
        get: op(
          `Servir una foto ya sanitizada. Quién la ve: la de un reporte publicado (${VISTA_PUBLICA}), cualquiera, con public, no-cache y ETag, y la visibilidad se comprueba antes de responder 304; las fotos de reportes sin verificar se ven en público junto con el reporte. El autor del reporte ve las suyas en cualquier estado (esperando su publicar_en, rechazado o duplicado), con private, no-store. Técnico y admin ven, con private, no-store, las fotos de un reporte ya publicado que después se rechazó o se fusionó (rechazado o duplicado), para moderarlo; una foto sin reporte solo la ve quien la subió, técnicos incluidos afuera, y la de un reporte que todavía espera su publicar_en no la ve nadie más que el autor, tampoco técnicos ni admin. A cualquier otro se le responde 404 con no-store, igual que si no existiera.`,
          'fotos',
          {
            // Sesión opcional: el público no la necesita, pero el dueño de una foto sin reporte sí.
            // Objeto propio y no el de seguridadSesion: si se comparte, el YAML generado usa alias.
            security: [{}, { cookieSesion: [] }],
            parameters: [
              {
                name: 'key',
                in: 'path',
                required: true,
                description:
                  'Clave devuelta por POST /fotos: un uuid con .webp, o con .jpg para las fotos anteriores',
                schema: { type: 'string', pattern: '^[a-f0-9-]{36}\\.(webp|jpg)$' },
              },
            ],
            responses: {
              '200': {
                description:
                  'La imagen: image/webp para las fotos nuevas, image/jpeg solo para las fotos anteriores a 0.8.0, que no se reconvierten',
                headers: {
                  'Cache-Control': {
                    description:
                      'public, no-cache si el reporte está publicado: cualquier caché la guarda pero la revalida con ETag en cada uso, así que retirar el reporte la retira también de las cachés compartidas (con max-age la seguirían sirviendo). private, no-store en los tres casos privados: el autor, con sus fotos en cualquier estado; técnico y admin, con la foto de un reporte publicado que después quedó rechazado o duplicado; y el dueño de una foto sin reporte.',
                    schema: { type: 'string' },
                  },
                  ETag: {
                    description:
                      'Solo en las fotos de reportes publicados; If-None-Match con el mismo valor da 304 si la foto sigue visible',
                    schema: { type: 'string' },
                  },
                  'X-Content-Type-Options': {
                    description: 'nosniff',
                    schema: { type: 'string' },
                  },
                },
                content: {
                  'image/webp': { schema: { type: 'string', format: 'binary' } },
                  'image/jpeg': { schema: { type: 'string', format: 'binary' } },
                },
              },
              '304': {
                description:
                  'La foto no cambió (If-None-Match) y sigue visible. Una foto de un reporte retirado da 404, no 304',
              },
              '404': error(
                'NO_EXISTE: la foto no existe o quien pregunta no puede verla (Cache-Control: no-store)',
              ),
              '429': error('Demasiadas lecturas desde la misma IP'),
            },
          },
        ),
      },
      '/api/v1/exportar': {
        get: op(
          `Exportar CSV o GeoJSON con nota metodológica, en la vista técnica, solo con reportes ya publicados (publicar_en <= now()). Hasta ${CONFIG_DOMINIO.EXPORTAR_MAX_FILAS} filas por archivo (limite); si la selección tiene más, la respuesta lo declara con total, exportados y truncado en vez de recortar en silencio.`,
          'admin',
          {
            security: seguridadSesion,
            parameters: parametrosDesde(ExportarQuerySchema),
            responses: {
              '200': {
                description: 'Archivo (Content-Disposition: attachment)',
                content: {
                  'application/geo+json': { schema: ref('ExportacionGeoJson') },
                  'text/csv': { schema: { type: 'string' } },
                },
              },
              '400': error('FILTROS_INVALIDOS: p. ej. limite fuera de rango'),
              '401': error('SIN_SESION'),
              '403': error('SIN_PERMISO'),
            },
          },
        ),
      },
      '/api/v1/indicadores': {
        get: op(
          'Indicadores básicos, solo con reportes ya publicados (publicar_en <= now()). Los filtros opcionales severidad (lista, sobre la severidad efectiva) y distrito_id acotan las tortas del panel: total, por_distrito, por_unidad_vecinal, por_severidad y por_estado cuentan el subconjunto filtrado; puntos_criticos_recurrentes solo se filtra por distrito_id.',
          'admin',
          {
            security: seguridadSesion,
            parameters: parametrosDesde(IndicadoresFiltrosSchema),
            responses: {
              '200': { description: 'Indicadores', content: json(ref('Indicadores')) },
              '400': error('FILTROS_INVALIDOS: severidad fuera de baja/media/alta/critica'),
            },
          },
        ),
      },
      '/api/v1/ejecutivo/resumen': {
        get: op(
          'Resumen del panel ejecutivo. Exige rol ejecutivo, tecnico o admin. Inundación activa = reportes en nuevo (en revisión) o validado (verificadas), con su severidad efectiva; los resueltos cuentan aparte (resueltas, por_estado) como trabajo hecho. Por distrito, en_capa_vigente separa los que solo existen en una capa anterior. ultimo_reporte_en va truncado al minuto. Solo cuenta reportes ya publicados (publicar_en <= now()).',
          'ejecutivo',
          {
            security: seguridadSesion,
            parameters: parametrosDesde(ResumenEjecutivoQuerySchema),
            responses: {
              '200': { description: 'Resumen ejecutivo', content: json(ref('ResumenEjecutivo')) },
              '401': error('SIN_SESION'),
              '403': error('SIN_PERMISO: el rol no permite el panel ejecutivo'),
            },
          },
        ),
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
              '429': error(
                `DEMASIADAS_CUENTAS: demasiadas altas desde la misma IP, por hora o por el tope de ${CONFIG_DOMINIO.ALTAS_POR_DIA_POR_IP} altas por día calendario (ALTAS_POR_DIA_POR_IP), contado en la base`,
              ),
            },
          },
        ),
      },
      '/api/v1/auth/login': {
        post: op('Iniciar sesión (ciudadano, técnico, admin o ejecutivo)', 'auth', {
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
      '/api/v1/configuracion': {
        get: op(
          'Configuración pública del despliegue: la ciudad (nombre, país, zona horaria, locale, centro y zoom inicial del mapa). Mi Curichi se despliega una vez por ciudad con la misma imagen, y los clientes leen esto en tiempo de ejecución en vez de fijarlo al compilar. Pública y sin sesión.',
          'configuracion',
          {
            responses: {
              '200': {
                description: 'Configuración de la ciudad',
                headers: {
                  'Cache-Control': {
                    description:
                      'public: la respuesta es la misma para cualquiera que pregunte y solo cambia al reconfigurar el despliegue, así que la puede guardar cualquier caché.',
                    schema: { type: 'string' },
                  },
                },
                content: json(ref('ConfiguracionPublica')),
              },
            },
          },
        ),
      },
      '/api/v1/auth/yo': {
        get: op(
          `Usuario de la sesión, más reportes_restantes_hoy (de ${POR_DIA} por día calendario en la zona horaria de la ciudad) y puede_reportar_desde: null si puede reportar ahora, o la próxima medianoche local si ya no le quedan reportes hoy. Además demora_proximo_s: cuánto tardaría en publicarse el próximo reporte (${DEMORA_1} s si es el 1.º del día, ${DEMORA_N} s si no), para avisarlo antes de enviar. Es información para la interfaz; el cupo lo aplica el servidor al crear. Para tecnico, admin y ejecutivo lleva además panel_url: la URL base del panel, o null si el despliegue no la configuró. Al ciudadano no se le manda nunca.`,
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
        post: op('Point-in-polygon: distrito y UV de un punto (§7.4)', 'geo', {
          requestBody: { required: true, content: json(ref('ResolverEntrada')) },
          responses: {
            '200': { description: 'Resolución', content: json(ref('ResolverRespuesta')) },
          },
        }),
      },
      '/geo/v1/capas/vigentes': {
        get: op('Versión vigente por capa', 'geo', {
          responses: {
            '200': {
              description: 'Mapa capa → versión',
              headers: cacheControl(SIN_CACHE_VIEJA),
              content: json(ref('CapasVigentes')),
            },
          },
        }),
      },
      '/geo/v1/capas': {
        get: op(
          'Información de las capas vigentes (modo GeoJSON o teselas), con la url que tienen que usar los clientes: lleva la huella del contenido servido',
          'geo',
          {
            responses: {
              '200': {
                description: 'Lista',
                headers: cacheControl(
                  `${SIN_CACHE_VIEJA}. Es la que dice cuál es la huella vigente: el cliente la vuelve a pedir ante un 410 ${CODIGO_CAPA_CAMBIO}`,
                ),
                content: json({ type: 'array', items: ref('CapaInfo') }),
              },
            },
          },
        ),
      },
      '/geo/v1/capas/{capa}/v/{huella}': {
        get: op(
          'GeoJSON web de la capa vigente, en la URL con huella que da CapaInfo.url (desde 0.12.0). Si la huella no es la vigente responde 410 y el cliente vuelve a pedir /geo/v1/capas',
          'geo',
          {
            parameters: [capaParam(), huellaParam()],
            responses: {
              '200': {
                description: 'FeatureCollection (application/geo+json)',
                headers: { ...cacheControl(INMUTABLE), ETag: etag() },
              },
              '304': { description: 'No cambió (If-None-Match)' },
              '404': error('Capa desconocida o sin versión vigente'),
              '410': error(CAPA_VIEJA),
              '413': error(
                'USAR_TESELAS: la capa supera UMBRAL_TESELAS_BYTES y se consume por teselas',
              ),
            },
          },
        ),
      },
      '/geo/v1/capas/{capa}': {
        get: op(
          'Alias sin huella de /geo/v1/capas/{capa}/v/{huella}: la capa vigente, sin cachear de más. Los clientes usan CapaInfo.url',
          'geo',
          {
            parameters: [capaParam()],
            responses: {
              '200': {
                description: 'FeatureCollection (application/geo+json)',
                headers: { ...cacheControl(SIN_CACHE_VIEJA), ETag: etag() },
              },
              '304': { description: 'No cambió (If-None-Match)' },
              '404': error('Capa desconocida o sin versión vigente'),
              '413': error('USAR_TESELAS'),
            },
          },
        ),
      },
      '/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt': {
        get: op(
          'Teselas vectoriales generadas al vuelo desde la capa vigente, en la plantilla con huella que da CapaInfo.url en modo teselas (desde 0.12.0). La huella es la de la capa: la del GeoJSON del que salen las teselas',
          'geo',
          {
            parameters: [capaParam(), huellaParam(), ...parametrosZxy()],
            responses: {
              '200': {
                description: 'application/vnd.mapbox-vector-tile',
                headers: { ...cacheControl(INMUTABLE), ETag: etag() },
              },
              '204': { description: 'Tesela vacía' },
              '304': { description: 'No cambió (If-None-Match)' },
              '400': error('Tesela inválida'),
              '404': error('Capa desconocida o sin versión vigente'),
              '410': error(CAPA_VIEJA),
            },
          },
        ),
      },
      '/geo/v1/teselas/{capa}/{z}/{x}/{y}.mvt': {
        get: op(
          'Alias sin huella de /geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt: teselas de la capa vigente, sin cachear de más. Los clientes usan CapaInfo.url',
          'geo',
          {
            parameters: [capaParam(), ...parametrosZxy()],
            responses: {
              '200': {
                description: 'application/vnd.mapbox-vector-tile',
                headers: { ...cacheControl(SIN_CACHE_VIEJA), ETag: etag() },
              },
              '204': { description: 'Tesela vacía' },
              '304': { description: 'No cambió (If-None-Match)' },
              '400': error('Tesela inválida'),
              '404': error('Capa desconocida o sin versión vigente'),
            },
          },
        ),
      },
      '/geo/v1/agregados/unidades-vecinales': {
        get: op(
          `Reportes publicados por UV (${VISTA_PUBLICA}), con n_verificados y severidad_max_verificada, que solo cuentan validado y resuelto: la coropleta pública usa severidad_max_verificada y pinta neutra la UV que solo tiene reportes sin verificar. Los puntos críticos se arman solo con verificados.`,
          'geo',
          {
            responses: {
              '200': {
                description: 'Lista',
                headers: cacheControl(CIFRAS_PUBLICAS),
                content: json({ type: 'array', items: ref('AgregadoUv') }),
              },
            },
          },
        ),
      },
      '/geo/v1/puntos-criticos': {
        get: op('Puntos críticos (§9.2), armados solo con reportes verificados', 'geo', {
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
              headers: cacheControl(CIFRAS_PUBLICAS),
              content: json({ type: 'array', items: ref('PuntoCritico') }),
            },
          },
        }),
      },
      '/health': { get: op('Liveness', 'admin', { responses: { '200': { description: 'ok' } } }) },
      '/ready': {
        get: op(
          'Readiness de api-core: la base, el /health de geo-service y el almacén de fotos (con S3, que responda; en disco, que se pueda escribir y que quede espacio por encima de FOTOS_MIN_LIBRE_BYTES). geo-service tiene su propio /ready, que solo mira PostGIS.',
          'admin',
          {
            responses: {
              '200': {
                description:
                  "Lista para atender. Con geo-service caído o las fotos en 'error' o 'poco_espacio', degradado: true, pero sigue en rotación",
                content: json(ref('ReadyApiCore')),
              },
              '503': {
                description: 'Sin base de datos: la réplica sale de rotación',
                content: json(ref('ReadyApiCore')),
              },
            },
          },
        ),
      },
    },
  };
}

function idParam() {
  return { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
}

const INMUTABLE =
  'public, max-age=31536000, immutable: la URL lleva la huella del contenido, así que no cambia mientras exista';
const SIN_CACHE_VIEJA = 'public, no-cache: se guarda, pero se revalida en cada uso';
const CIFRAS_PUBLICAS =
  'public, no-cache. geo-service las calcula como mucho cada 100 s (GEO_CACHE_AGREGADOS_MS) y nunca sirve cifras de más de 120 s (GEO_CACHE_AGREGADOS_EDAD_MAX_MS)';
const CAPA_VIEJA = `${CODIGO_CAPA_CAMBIO}: la huella ya no es la vigente (la capa se activó o se recargó). Va con Cache-Control: no-store; el cliente vuelve a pedir /geo/v1/capas y usa la url nueva`;

function cacheControl(descripcion: string) {
  return { 'Cache-Control': { description: descripcion, schema: { type: 'string' } } };
}

function etag() {
  return { description: 'Del contenido servido', schema: { type: 'string' } };
}

function capaParam() {
  return {
    name: 'capa',
    in: 'path',
    required: true,
    schema: { type: 'string', enum: [...TIPOS_CAPA] },
  };
}

function huellaParam() {
  const { $schema: _s, ...schema } = z.toJSONSchema(HuellaCapaSchema) as Record<string, unknown>;
  return {
    name: 'huella',
    in: 'path',
    required: true,
    description:
      'Primeros 16 caracteres hexadecimales del SHA-256 del GeoJSON web servido (HuellaCapaSchema)',
    schema,
  };
}

function parametrosZxy() {
  return ['z', 'x', 'y'].map((n) => ({
    name: n,
    in: 'path',
    required: true,
    schema: { type: 'integer' },
  }));
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
