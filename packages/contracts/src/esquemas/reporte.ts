import { z } from 'zod';
import { CONFIG_DOMINIO } from '../dominio/config.js';
import {
  CAUSAS_PRESUNTAS,
  ESTADOS_PUBLICOS,
  ESTADOS_REPORTE,
  type EstadoReporte,
  FRECUENCIAS,
  PROFUNDIDADES,
  type Rol,
  SEVERIDADES,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
  UBICACION_METODOS,
  UBICACION_TIPOS,
} from '../dominio/enums.js';
import {
  BboxSchema,
  LatSchema,
  LonSchema,
  listaDesdeQuery,
  PaginacionSchema,
  UnidadAdministrativaSchema,
} from './comunes.js';

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 86_400_000;

/** Instante en ms de una fecha ISO 8601, o null si no se puede leer (el formato lo informa zod). */
function instante(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Los límites se miden contra el reloj del momento de validar, no contra una fecha fija: el mismo
 * payload puede valer hoy y no dentro de un año. En el formulario el reloj es el del celular, y
 * por eso la tolerancia hacia el futuro; el que decide es el de api-core.
 */
const EventoEnSchema = z.iso
  .datetime({ offset: true })
  .refine((v) => {
    const t = instante(v);
    return (
      t === null || t <= Date.now() + CONFIG_DOMINIO.EVENTO_TOLERANCIA_FUTURO_MIN * MS_POR_MINUTO
    );
  }, 'La fecha del evento no puede ser futura. Elegí hoy o un día anterior.')
  .refine((v) => {
    const t = instante(v);
    return t === null || t >= Date.now() - CONFIG_DOMINIO.EVENTO_MAX_DIAS_ATRAS * MS_POR_DIA;
  }, `La fecha del evento no puede tener más de ${CONFIG_DOMINIO.EVENTO_MAX_DIAS_ATRAS} días. Elegí una fecha más reciente.`);

/**
 * Posición del teléfono al tocar Enviar. Zod solo acota los rangos físicos: los topes de negocio
 * (radio, precisión y antigüedad de `CONFIG_DOMINIO`) los aplica api-core con sus propios 422.
 * No se guarda, no se registra en logs ni en auditoría y no entra en la huella de idempotencia.
 */
export const DispositivoSchema = z
  .object({
    lat: LatSchema,
    lon: LonSchema,
    precision_m: z
      .number()
      .min(0)
      .max(10_000)
      .meta({
        description: `Precisión que declara el dispositivo (Geolocation coords.accuracy), en metros. Se aceptan ${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m o menos (422 PRECISION_INSUFICIENTE)`,
      }),
    antiguedad_s: z
      .number()
      .min(0)
      .meta({
        description: `Segundos entre la lectura de la posición y el envío; 0 si el reloj la da en el futuro. Se aceptan ${CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S} s o menos (422 POSICION_VENCIDA)`,
      }),
  })
  .meta({
    description: `Posición del dispositivo al enviar. El punto del reporte tiene que estar a ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m o menos (422 UBICACION_FUERA_DE_RADIO). No se guarda`,
  });
export type Dispositivo = z.infer<typeof DispositivoSchema>;

/** Payload de creación de reporte (ciudadano). Validado en servidor por api-core. */
export const ReporteCrearSchema = z
  .object({
    lat: LatSchema,
    lon: LonSchema,
    /**
     * Obligatorio desde 0.9.0. `ubicacion_metodo` y `precision_gps_m` ya no vienen del cliente:
     * los deriva api-core de esta posición.
     */
    dispositivo: DispositivoSchema,
    ubicacion_tipo: z.enum(UBICACION_TIPOS),
    descripcion: z
      .string()
      .trim()
      .min(
        CONFIG_DOMINIO.DESCRIPCION_MIN,
        `Escribí al menos ${CONFIG_DOMINIO.DESCRIPCION_MIN} caracteres para poder enviar.`,
      )
      .max(CONFIG_DOMINIO.DESCRIPCION_MAX, `Máximo ${CONFIG_DOMINIO.DESCRIPCION_MAX} caracteres.`),
    profundidad_estimada: z.enum(PROFUNDIDADES),
    frecuencia: z.enum(FRECUENCIAS),
    causa_presunta: z.enum(CAUSAS_PRESUNTAS).default('desconocida'),
    sumidero_cercano: z.enum(SUMIDERO_CERCANO).nullable().optional(),
    sumidero_estado: z.enum(SUMIDERO_ESTADOS).nullable().optional(),
    agua_brota_sumidero: z.boolean().nullable().optional(),
    evento_en: EventoEnSchema.nullable()
      .optional()
      .meta({
        description:
          `Cuándo ocurrió el anegamiento; null = se asume creado_en. Entre ${CONFIG_DOMINIO.EVENTO_MAX_DIAS_ATRAS} días atrás ` +
          `y ${CONFIG_DOMINIO.EVENTO_TOLERANCIA_FUTURO_MIN} minutos adelante del reloj del servidor.`,
      }),
    /** Claves de objeto devueltas por POST /fotos, máximo 3. */
    fotos: z
      .array(z.string().min(1).max(200))
      .max(CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE)
      .default([]),
    /** Honeypot antispam: los humanos no lo ven; si viene con contenido se rechaza. */
    sitio_web: z.string().max(0, 'Solicitud rechazada.').optional(),
  })
  .superRefine((v, ctx) => {
    // Sin sumidero cercano no hay nada que esté tapado ni de dónde brote el agua.
    if (v.sumidero_cercano !== 'no') return;
    if (v.sumidero_estado != null)
      ctx.addIssue({
        code: 'custom',
        path: ['sumidero_estado'],
        message: 'Indicaste que no hay sumidero cercano: no se puede decir si está tapado.',
      });
    if (v.agua_brota_sumidero === true)
      ctx.addIssue({
        code: 'custom',
        path: ['agua_brota_sumidero'],
        message: 'Indicaste que no hay sumidero cercano: el agua no puede brotar de él.',
      });
  });
export type ReporteCrear = z.infer<typeof ReporteCrearSchema>;
export type ReporteCrearEntrada = z.input<typeof ReporteCrearSchema>;

export const ReporteFiltrosSchema = PaginacionSchema.extend({
  bbox: BboxSchema.optional(),
  estado: listaDesdeQuery(ESTADOS_REPORTE),
  severidad: listaDesdeQuery(SEVERIDADES),
  distrito_id: z.string().optional(),
  unidad_vecinal_id: z.string().optional(),
  punto_critico_id: z.uuid().optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
});
export type ReporteFiltros = z.infer<typeof ReporteFiltrosSchema>;

/** Propiedades de un reporte tal como las ve el público (sin autor, con precisión degradada si aplica). */
export const ReportePublicoSchema = z.object({
  id: z.uuid(),
  creado_en: z.iso.datetime({ offset: true }),
  evento_en: z.iso.datetime({ offset: true }).nullable(),
  distrito: UnidadAdministrativaSchema.nullable(),
  unidad_vecinal: UnidadAdministrativaSchema.nullable(),
  descripcion: z.string(),
  fotos: z.array(z.string()).meta({ description: 'URLs servidas por api-core, ya sin EXIF' }),
  profundidad_estimada: z.enum(PROFUNDIDADES),
  frecuencia: z.enum(FRECUENCIAS),
  causa_presunta: z.enum(CAUSAS_PRESUNTAS),
  severidad: z
    .enum(SEVERIDADES)
    .meta({ description: 'Severidad efectiva = manual si existe, si no la calculada' }),
  severidad_calculada: z.enum(SEVERIDADES),
  estado: z.enum(ESTADOS_PUBLICOS).meta({
    description:
      'Solo estados públicos: nuevo se muestra como «NO SE HA VERIFICADO», validado como «Verificado» y resuelto como «Resuelto» (ETIQUETAS.estado_publico). rechazado y duplicado no se publican',
  }),
  verificado: z.boolean().meta({
    description:
      'true si un técnico lo revisó (validado o resuelto); false en nuevo, que se publica sin moderación previa como «NO SE HA VERIFICADO»',
  }),
  punto_critico_id: z.uuid().nullable(),
  n_reportes_punto: z.number().int().nullable(),
  precision_degradada: z
    .boolean()
    .meta({ description: 'true si la coordenada tiene jitter (vivienda o predio)' }),
});
export type ReportePublico = z.infer<typeof ReportePublicoSchema>;

/** Vista del técnico: todo lo público más campos de moderación y coordenada exacta. */
export const ReporteTecnicoSchema = ReportePublicoSchema.extend({
  estado: z.enum(ESTADOS_REPORTE),
  ubicacion_metodo: z.enum(UBICACION_METODOS).meta({
    description:
      'Lo deriva el servidor desde 0.9.0: gps si el punto quedó dentro del margen de error del dispositivo (a dispositivo.precision_m o menos de su posición al enviar, y con 2 m como margen mínimo), manual si quedó más lejos, siempre dentro del radio. El margen existe porque dos lecturas del GPS difieren varios metros aunque nadie mueva el punto',
  }),
  precision_gps_m: z.number().nullable().meta({
    description: 'Precisión que declaró el dispositivo al enviar, en metros',
  }),
  distancia_dispositivo_m: z.number().int().min(0).max(1000).nullable().meta({
    description:
      'Distancia redondeada, en metros, entre el punto y la posición del dispositivo al enviar; null en los reportes anteriores a 0.9.0. La posición del dispositivo no se guarda',
  }),
  ubicacion_tipo: z.enum(UBICACION_TIPOS),
  sumidero_cercano: z.enum(SUMIDERO_CERCANO).nullable(),
  sumidero_estado: z.enum(SUMIDERO_ESTADOS).nullable(),
  agua_brota_sumidero: z.boolean().nullable(),
  severidad_manual: z.enum(SEVERIDADES).nullable(),
  severidad_motivo: z.string().nullable(),
  severidad_puntaje: z.number().int(),
  estado_motivo: z.string().nullable(),
  fusionado_en_id: z.uuid().nullable(),
  validado_por: z.uuid().nullable(),
  validado_en: z.iso.datetime({ offset: true }).nullable(),
  actualizado_en: z.iso.datetime({ offset: true }),
  version_capa: z.string().nullable(),
  resolucion_flags: z.record(z.string(), z.unknown()),
  autor_id: z.uuid().nullable(),
});
export type ReporteTecnico = z.infer<typeof ReporteTecnicoSchema>;

export const PuntoGeoJsonSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([LonSchema, LatSchema]),
});

export const ReporteFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.uuid(),
  geometry: PuntoGeoJsonSchema,
  properties: ReportePublicoSchema,
});
export const ReporteFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(ReporteFeatureSchema),
  total: z.number().int(),
  /**
   * false cuando el listado tiene más resultados de los que se cuentan (el conteo está acotado
   * para no escanear la tabla entera en cada carga). En ese caso `total` es el tope.
   */
  total_exacto: z.boolean().optional(),
  pagina: z.number().int(),
  limite: z.number().int(),
});
export type ReporteFeatureCollection = z.infer<typeof ReporteFeatureCollectionSchema>;

/**
 * Feature de la vista técnica: `/api/v1/tecnico/reportes/{id}` y las respuestas de moderación.
 * Coordenada exacta y todas las propiedades de moderación; nunca sale por una ruta pública (§13).
 */
export const ReporteTecnicoFeatureSchema = ReporteFeatureSchema.extend({
  geometry: PuntoGeoJsonSchema.meta({ description: 'Coordenada exacta: sin jitter ni redondeo' }),
  properties: ReporteTecnicoSchema,
});
export type ReporteTecnicoFeature = z.infer<typeof ReporteTecnicoFeatureSchema>;

/** Listado técnico (`/api/v1/tecnico/reportes`): la misma paginación que el público. */
export const ReporteTecnicoFeatureCollectionSchema = ReporteFeatureCollectionSchema.extend({
  features: z.array(ReporteTecnicoFeatureSchema),
});
export type ReporteTecnicoFeatureCollection = z.infer<typeof ReporteTecnicoFeatureCollectionSchema>;

/**
 * Un reporte visto por su AUTOR: la respuesta de `POST /api/v1/reportes` (201 y replay) y cada
 * elemento de `GET /api/v1/mis-reportes`. Es la vista pública más lo que solo le importa a quien lo
 * envió, en cualquier estado: también mientras espera su `publicar_en` y si lo rechazaron o
 * fusionaron. Nunca lleva el autor ni campos de moderación, y solo sale con `private, no-store`.
 */
export const MiReporteSchema = ReportePublicoSchema.extend({
  estado: z.enum(ESTADOS_REPORTE),
  verificado: z.boolean().meta({ description: 'true si está validado o resuelto' }),
  publicar_en: z.iso.datetime({ offset: true }).meta({
    description: `Desde cuándo lo ve el público: ${CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S} s después de crearlo si fue el 1.º reporte del día de la cuenta, ${CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S} s si fue el 2.º o el 3.º. Lo fija el servidor al crear y un replay devuelve el mismo`,
  }),
  segundos_para_publicar: z.number().int().min(0).meta({
    description:
      'Segundos que faltan para publicar_en, calculados en la base al responder (0 si ya pasó). La cuenta regresiva parte de acá y no del reloj del teléfono',
  }),
  retirado: z.boolean().meta({
    description: 'true si lo rechazaron o lo fusionaron con otro: ya no está en el mapa público',
  }),
});
export type MiReporte = z.infer<typeof MiReporteSchema>;

export const MiReporteFeatureSchema = ReporteFeatureSchema.extend({
  geometry: PuntoGeoJsonSchema.meta({
    description:
      'Coordenada exacta, sin jitter: la respuesta es solo para su autor, que la eligió (private, no-store)',
  }),
  properties: MiReporteSchema,
});
export type MiReporteFeature = z.infer<typeof MiReporteFeatureSchema>;

/** `GET /api/v1/mis-reportes`: los reportes de la cuenta, los más recientes primero. */
export const MisReportesSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(MiReporteFeatureSchema).max(CONFIG_DOMINIO.MIS_REPORTES_MAX),
});
export type MisReportes = z.infer<typeof MisReportesSchema>;

/**
 * Estados a los que solo se llega diciendo por qué. `nuevo` está porque la única transición que
 * lo alcanza es reabrir un rechazado (§7.3): sin motivo, la auditoría registraba la reapertura
 * pero no su porqué.
 */
const ESTADOS_CON_MOTIVO: readonly EstadoReporte[] = [
  'nuevo',
  'rechazado',
  'resuelto',
  'duplicado',
];

/** Transiciones de la máquina de estados (CLAUDE.md §7.3). */
export const ReporteCambiarEstadoSchema = z
  .object({
    estado: z.enum(ESTADOS_REPORTE),
    estado_motivo: z.string().trim().min(3).max(1000).optional(),
    fusionado_en_id: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (ESTADOS_CON_MOTIVO.includes(v.estado) && !v.estado_motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['estado_motivo'],
        message:
          v.estado === 'nuevo'
            ? 'Reabrir un reporte requiere un motivo.'
            : `El estado ${v.estado} requiere un motivo.`,
      });
    }
    if (v.estado === 'duplicado' && !v.fusionado_en_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['fusionado_en_id'],
        message: 'Indicá el reporte canónico.',
      });
    }
  });
export type ReporteCambiarEstado = z.infer<typeof ReporteCambiarEstadoSchema>;

const MODERACION = ['tecnico', 'admin'] as const satisfies readonly Rol[];

/**
 * Transiciones de la máquina de estados (CLAUDE.md §7.3): para cada estado, a cuáles se puede
 * pasar y con qué roles. Desde 0.11.0 los roles van por transición y no por estado de origen,
 * porque `validado → rechazado` (retirar del mapa un verificado) es solo de admin y el resto de
 * las salidas de `validado` no.
 */
export const TRANSICIONES = {
  nuevo: { validado: MODERACION, rechazado: MODERACION, duplicado: MODERACION },
  validado: { resuelto: MODERACION, duplicado: MODERACION, rechazado: ['admin'] },
  rechazado: { nuevo: ['admin'] },
  duplicado: {},
  resuelto: {},
} as const satisfies Record<EstadoReporte, Partial<Record<EstadoReporte, readonly Rol[]>>>;

function esEstado(v: string): v is EstadoReporte {
  return (ESTADOS_REPORTE as readonly string[]).includes(v);
}

function rolesDeTransicion(desde: string, hacia: string): readonly string[] | undefined {
  // Se comprueba contra la lista y no con `in`: `'toString' in {}` es true.
  if (!esEstado(desde) || !esEstado(hacia)) return undefined;
  const destinos: Partial<Record<EstadoReporte, readonly string[]>> = TRANSICIONES[desde];
  return destinos[hacia];
}

/** Si la transición existe para algún rol. Sirve para responder 403 (rol) y no 409 (no existe). */
export function transicionExiste(desde: string, hacia: string): boolean {
  return rolesDeTransicion(desde, hacia) !== undefined;
}

export function transicionPermitida(desde: string, hacia: string, rol: string): boolean {
  return rolesDeTransicion(desde, hacia)?.includes(rol) ?? false;
}

export const ReporteReclasificarSchema = z
  .object({
    severidad_manual: z.enum(SEVERIDADES).nullable(),
    severidad_motivo: z.string().trim().min(3).max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.severidad_manual !== null && !v.severidad_motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['severidad_motivo'],
        message: 'La reclasificación requiere un motivo.',
      });
    }
  });
export type ReporteReclasificar = z.infer<typeof ReporteReclasificarSchema>;

export const ReporteFusionarSchema = z.object({
  canonico_id: z.uuid(),
  motivo: z.string().trim().min(3).max(1000).default('Duplicado del mismo punto'),
});
export type ReporteFusionar = z.infer<typeof ReporteFusionarSchema>;

export const FotoSubidaSchema = z.object({
  objeto_key: z.string(),
  url: z.string(),
  ancho: z.number().int(),
  alto: z.number().int(),
  bytes: z.number().int(),
  mime: z.literal(CONFIG_DOMINIO.FOTO_FORMATO_SALIDA).meta({
    description:
      'Formato guardado: siempre WebP, sea cual sea el de entrada (JPEG, PNG o WebP), con ' +
      `${CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX} px por lado como máximo`,
  }),
  exif_sanitizado: z.literal(true),
});
export type FotoSubida = z.infer<typeof FotoSubidaSchema>;
