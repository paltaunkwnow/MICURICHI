import { z } from 'zod';
import { normalizarSlugCategoria } from '../categorias/slugs.js';
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
  CategoriaFiltroSchema,
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
      // El tope físico que acota Zod es 100 km, no un valor de negocio: una computadora ubicada por
      // Wi-Fi o IP declara cientos de metros o varios km. Con un tope más bajo, una precisión así
      // daría 400 PAYLOAD_INVALIDO en vez del 422 (PRECISION_INSUFICIENTE o UBICACION_PRECISA_
      // DISPONIBLE) que la interfaz necesita para explicar qué pasa. Los topes de negocio son de
      // api-core, no del esquema.
      .number()
      .min(0)
      .max(100_000)
      .meta({
        description: `Precisión que declara el dispositivo (Geolocation coords.accuracy), en metros. Se aceptan ${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m o menos (422 PRECISION_INSUFICIENTE); con ubicacion_aproximada se pide MÁS de ${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m (si no, 422 UBICACION_PRECISA_DISPONIBLE). Zod solo acota el rango físico (hasta 100 km, por las computadoras ubicadas por Wi-Fi o IP), así que el tope de negocio es 422 y no 400`,
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
    /**
     * Camino de ubicación aproximada (0.18.0, ADR 0007): lo pide el cliente cuando el dispositivo no
     * llega a `PRECISION_DISPOSITIVO_MAX_M` m de precisión (una computadora ubicada por Wi-Fi o IP).
     * El punto lo pone la persona a mano en cualquier lugar de la cobertura y NO se comprueba el
     * radio; api-core guarda `ubicacion_metodo = 'aproximada'`, exige MÁS de
     * `PRECISION_DISPOSITIVO_MAX_M` m (si no, 422 UBICACION_PRECISA_DISPONIBLE) y deja la distancia
     * al dispositivo en null. Opcional: por defecto el reporte va por el camino normal (GPS preciso).
     */
    ubicacion_aproximada: z
      .boolean()
      .default(false)
      .meta({
        description: `true para reportar con ubicación aproximada desde un dispositivo sin GPS preciso (p. ej. una computadora): el punto lo pone la persona a mano, se guarda ubicacion_metodo = aproximada y no se comprueba el radio de ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m. Exige una precisión mayor a ${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m (si no, 422 UBICACION_PRECISA_DISPONIBLE). Por defecto false (camino normal con GPS)`,
      }),
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

/**
 * Forma NUEVA de `POST /api/v1/reportes` (0.20.0, ADR 0010, 0012): el núcleo común más `categoria`,
 * `subtipo` y el `detalle` propio de cada categoría. Convive con `ReporteCrearSchema` (la forma
 * plana de hoy, = inundación), que NO cambia. El núcleo REUTILIZA las definiciones de
 * `ReporteCrearSchema.shape` (mismos rangos, defaults, nulabilidad y honeypot), sin duplicar ninguna
 * lista; solo se dejan afuera los seis campos de dominio de inundación, que pasan a vivir en
 * `detalle`.
 *
 * `detalle` es un objeto genérico en el contrato: api-core lo valida con el Zod ESTRICTO de la
 * definición de la categoría (p. ej. `DetalleInundacionSchema`), que rechaza claves de más, y la
 * base suma el CHECK de objeto y el tope de 8192 bytes. `categoria` se normaliza (alias → slug
 * canónico); un valor desconocido queda en `null` y el servidor responde 422 CATEGORIA_NO_DISPONIBLE
 * sin gastar cupo. El contrato NO valida si la categoría está activa (regla 3): eso lo decide el
 * servidor con el catálogo.
 */
const nucleoReporte = ReporteCrearSchema.shape;
export const ReporteCrearCategoriaSchema = z.object({
  lat: nucleoReporte.lat,
  lon: nucleoReporte.lon,
  dispositivo: nucleoReporte.dispositivo,
  ubicacion_aproximada: nucleoReporte.ubicacion_aproximada,
  ubicacion_tipo: nucleoReporte.ubicacion_tipo,
  descripcion: nucleoReporte.descripcion,
  evento_en: nucleoReporte.evento_en,
  fotos: nucleoReporte.fotos,
  sitio_web: nucleoReporte.sitio_web,
  categoria: z
    .string()
    .trim()
    .transform((v) => normalizarSlugCategoria(v))
    .meta({
      description:
        'Slug de la categoría del reporte. Se aceptan alias (plural, guion, mayúsculas, tildes); un ' +
        'valor desconocido o una categoría inactiva da 422 CATEGORIA_NO_DISPONIBLE en el servidor, ' +
        'sin gastar cupo.',
    }),
  subtipo: z.string().trim().min(1).max(100).nullable().optional().meta({
    description:
      'Subtipo propio de la categoría (p. ej. baches), validado por su definición; null o ausente si no aplica.',
  }),
  detalle: z.record(z.string(), z.unknown()).meta({
    description:
      'Respuestas propias de la categoría. api-core lo valida con el Zod estricto de la definición ' +
      '(DetalleInundacionSchema para inundación); CHECK de objeto y tope de 8192 bytes en la base.',
  }),
});
export type ReporteCrearCategoria = z.infer<typeof ReporteCrearCategoriaSchema>;

/**
 * ¿El cuerpo de `POST /api/v1/reportes` viene en la forma NUEVA (por categoría)? Lo es si trae
 * `categoria` o `detalle`; si no, es la forma plana de hoy (= inundación). Función pura.
 */
export function esReporteCrearPorCategoria(cuerpo: unknown): boolean {
  return (
    typeof cuerpo === 'object' && cuerpo !== null && ('categoria' in cuerpo || 'detalle' in cuerpo)
  );
}

/**
 * Convierte un reporte en la forma PLANA (ya validada con `ReporteCrearSchema`) a la forma nueva por
 * categoría: `categoria: 'inundacion'` y los seis campos de dominio movidos a `detalle`. Pura. El
 * `detalle` resultante pasa `DetalleInundacionSchema` (lo comprueba contrato-0-20).
 */
export function reportePlanoACategoria(r: ReporteCrear): ReporteCrearCategoria {
  const {
    profundidad_estimada,
    frecuencia,
    causa_presunta,
    sumidero_cercano,
    sumidero_estado,
    agua_brota_sumidero,
    ...nucleo
  } = r;
  return {
    ...nucleo,
    categoria: 'inundacion',
    detalle: {
      profundidad_estimada,
      frecuencia,
      causa_presunta,
      sumidero_cercano,
      sumidero_estado,
      agua_brota_sumidero,
    },
  };
}

/**
 * Distingue la forma del cuerpo de `POST /api/v1/reportes` y lo deja SIEMPRE en la forma por
 * categoría: la plana se valida con `ReporteCrearSchema` y se convierte (`categoria: 'inundacion'`);
 * la nueva, con `ReporteCrearCategoriaSchema`. Pura: no decide códigos HTTP ni consulta el catálogo;
 * devuelve el `ZodError` para que el servidor responda 400. api-core valida después el `detalle` con
 * el Zod estricto de la categoría y su actividad con el catálogo (422 CATEGORIA_NO_DISPONIBLE).
 */
export function normalizarReporteCrear(cuerpo: unknown): {
  forma: 'plana' | 'categoria';
  resultado: { exito: true; datos: ReporteCrearCategoria } | { exito: false; error: z.ZodError };
} {
  if (esReporteCrearPorCategoria(cuerpo)) {
    const r = ReporteCrearCategoriaSchema.safeParse(cuerpo);
    return {
      forma: 'categoria',
      resultado: r.success ? { exito: true, datos: r.data } : { exito: false, error: r.error },
    };
  }
  const r = ReporteCrearSchema.safeParse(cuerpo);
  return {
    forma: 'plana',
    resultado: r.success
      ? { exito: true, datos: reportePlanoACategoria(r.data) }
      : { exito: false, error: r.error },
  };
}

export const ReporteFiltrosSchema = PaginacionSchema.extend({
  // Sin el parámetro = inundacion (ADR 0012). `todas` lo reconoce el esquema pero solo lo admiten
  // las rutas del panel; en las públicas lo rechaza el servidor (CategoriaFiltroSchema).
  categoria: CategoriaFiltroSchema,
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
  // Campos de la plataforma multitemática (0.20.0, ADR 0010, 0012). OPCIONALES hasta M4/M5 (regla 5
  // del plan M3): api-core (M3.3) los manda siempre, pero volverlos obligatorios rompería el
  // typecheck de las vistas de api-core y de los fixtures de las apps, que todavía no los construyen.
  // Se heredan en ReporteTecnicoSchema y MiReporteSchema por .extend.
  categoria: z.string().optional().meta({
    description: 'Slug de la categoría del reporte (p. ej. inundacion). Obligatorio desde M4/M5.',
  }),
  subtipo: z.string().nullable().optional().meta({
    description: 'Subtipo propio de la categoría; null si no aplica. Obligatorio desde M4/M5.',
  }),
  // En la vista PÚBLICA, api-core incluye en `detalle` SOLO los `camposPublicos` de la definición de
  // la categoría (regla 4; para inundación, los mismos profundidad/frecuencia/causa que ya son
  // públicos). La vista técnica (ReporteTecnico) trae el detalle completo. El contrato describe la
  // forma (objeto); el recorte público lo hace api-core al construir la respuesta.
  detalle: z
    .record(z.string(), z.unknown())
    .optional()
    .meta({
      description:
        'Respuestas propias de la categoría. En la vista pública, solo los camposPublicos de la ' +
        'definición; completo en la vista técnica. Obligatorio desde M4/M5.',
    }),
});
export type ReportePublico = z.infer<typeof ReportePublicoSchema>;

/** Vista del técnico: todo lo público más campos de moderación y coordenada exacta. */
export const ReporteTecnicoSchema = ReportePublicoSchema.extend({
  estado: z.enum(ESTADOS_REPORTE),
  ubicacion_metodo: z.enum(UBICACION_METODOS).meta({
    description:
      'Lo deriva el servidor desde 0.9.0: gps si el punto quedó dentro del margen de error del dispositivo (a dispositivo.precision_m o menos de su posición al enviar, y con 2 m como margen mínimo), manual si quedó más lejos, siempre dentro del radio. El margen existe porque dos lecturas del GPS difieren varios metros aunque nadie mueva el punto. aproximada (desde 0.18.0, ADR 0007): el reporte entró por el camino de ubicación aproximada (dispositivo sin GPS preciso); el punto lo puso la persona a mano y no se comprobó contra la posición del dispositivo (los técnicos lo ven «sin comprobar»)',
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

/**
 * Un UUID completo o un ID corto de 8 hex (el prefijo del UUID). Es la MISMA expresión del canónico
 * de `POST /reportes/:id/fusionar` y de `fusionado_en_id` de `PATCH /reportes/:id/estado` (decisión
 * del usuario del 2026-10-08): el panel no deja pegar un ID a mano, pero la API acepta las dos formas
 * en las dos rutas.
 */
export const ID_REPORTE_CORTO_O_UUID =
  /^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i;

const MENSAJE_ID_CANONICO =
  'El identificador del reporte canónico debe ser un UUID o un ID corto de 8 caracteres.';

/** Transiciones de la máquina de estados (CLAUDE.md §7.3). */
export const ReporteCambiarEstadoSchema = z
  .object({
    estado: z.enum(ESTADOS_REPORTE),
    estado_motivo: z.string().trim().min(3).max(1000).optional(),
    // Desde 0.20.0 acepta UUID o ID corto, igual que ReporteFusionarSchema.canonico_id: solo AMPLÍA
    // lo que admitía (antes únicamente UUID).
    fusionado_en_id: z
      .string()
      .trim()
      .regex(ID_REPORTE_CORTO_O_UUID, MENSAJE_ID_CANONICO)
      .optional(),
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
  canonico_id: z.string().trim().regex(ID_REPORTE_CORTO_O_UUID, MENSAJE_ID_CANONICO),
  motivo: z.string().trim().min(3).max(1000).default('Duplicado del mismo punto'),
});
export type ReporteFusionar = z.infer<typeof ReporteFusionarSchema>;

/**
 * Código de error (409) de fusionar un reporte con un canónico de OTRA categoría (0.20.0, ADR 0012,
 * 0013): no se mezclan inventarios de categorías distintas. Lo comprueba el servidor (tiene la
 * categoría de ambos reportes); el contrato solo nombra el código, como `CODIGO_CAPA_CAMBIO`. Vale
 * para `POST /reportes/:id/fusionar` y para `PATCH /reportes/:id/estado` con destino `duplicado`.
 */
export const CODIGO_FUSION_ENTRE_CATEGORIAS = 'FUSION_ENTRE_CATEGORIAS';

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
