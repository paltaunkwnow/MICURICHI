import { z } from 'zod';

/**
 * Resumen del panel ejecutivo: `GET /api/v1/ejecutivo/resumen` (roles ejecutivo, tecnico, admin).
 * Cuenta solo reportes en estado nuevo, validado o resuelto; los duplicados y rechazados no son
 * anegamientos distintos y no entran. La severidad es la efectiva (manual si existe).
 *
 * Desde 0.6.0 separa la inundación ACTIVA (nuevo + validado) del trabajo resuelto: un punto
 * resuelto ya no se suma a la cifra grande del panel, solo a «cómo va el trabajo».
 */

export const VENTANAS_RESUMEN = ['7d', '30d', 'todo'] as const;
export type VentanaResumen = (typeof VENTANAS_RESUMEN)[number];

export const ResumenEjecutivoQuerySchema = z.object({
  ventana: z.enum(VENTANAS_RESUMEN).default('todo'),
});
export type ResumenEjecutivoQuery = z.infer<typeof ResumenEjecutivoQuerySchema>;

const Conteo = z.number().int().nonnegative();
const FechaHora = z.iso.datetime({ offset: true });

/**
 * Hora del último reporte, truncada al minuto. Con pocos reportes en un distrito, los segundos
 * señalan a una persona concreta, y el resumen cuenta reportes en `nuevo`, que todavía no son
 * públicos. api-core valida su propia respuesta con este esquema: lo que no venga truncado no sale.
 */
const FechaHoraAlMinuto = FechaHora.refine((v) => {
  const ms = Date.parse(v);
  return Number.isNaN(ms) || ms % 60_000 === 0;
}, 'Debe venir truncada al minuto: segundos y milisegundos en cero.').meta({
  description: 'Truncada al minuto (privacidad)',
});

export const ConteoPorSeveridadSchema = z.object({
  critica: Conteo,
  alta: Conteo,
  media: Conteo,
  baja: Conteo,
});
export type ConteoPorSeveridad = z.infer<typeof ConteoPorSeveridadSchema>;

export const ConteoPorEstadoResumenSchema = z.object({
  nuevo: Conteo,
  validado: Conteo,
  resuelto: Conteo,
});
export type ConteoPorEstadoResumen = z.infer<typeof ConteoPorEstadoResumenSchema>;

/** Inundación activa: reportes en revisión (`nuevo`) más verificados (`validado`). */
export const ConteoActivasSchema = z
  .object({
    total: Conteo.meta({ description: 'verificadas + en_revision' }),
    verificadas: Conteo.meta({ description: 'Reportes en estado validado' }),
    en_revision: Conteo.meta({ description: 'Reportes en estado nuevo' }),
    por_severidad: ConteoPorSeveridadSchema.meta({
      description: 'Severidad efectiva de las activas; suma total',
    }),
  })
  .superRefine((a, ctx) => {
    if (a.total !== a.verificadas + a.en_revision)
      ctx.addIssue({
        code: 'custom',
        path: ['total'],
        message: 'total debe ser verificadas + en_revision.',
      });
    const s = a.por_severidad;
    // Si no suma, casi seguro se contaron también los resueltos (la semántica anterior a 0.6.0).
    if (s.critica + s.alta + s.media + s.baja !== a.total)
      ctx.addIssue({
        code: 'custom',
        path: ['por_severidad'],
        message: 'por_severidad debe repartir exactamente las activas.',
      });
  });
export type ConteoActivas = z.infer<typeof ConteoActivasSchema>;

/** `activas` y `por_estado` cuentan los mismos reportes desde dos lados: tienen que cuadrar. */
function cuadrarActivasConEstados(
  v: { activas: ConteoActivas; por_estado: ConteoPorEstadoResumen },
  ctx: z.RefinementCtx,
) {
  if (v.activas.verificadas !== v.por_estado.validado)
    ctx.addIssue({
      code: 'custom',
      path: ['activas', 'verificadas'],
      message: 'verificadas debe ser igual a por_estado.validado.',
    });
  if (v.activas.en_revision !== v.por_estado.nuevo)
    ctx.addIssue({
      code: 'custom',
      path: ['activas', 'en_revision'],
      message: 'en_revision debe ser igual a por_estado.nuevo.',
    });
}

export const ResumenDistritoSchema = z
  .object({
    distrito_id: z.string().min(1),
    codigo: z.string(),
    nombre: z.string(),
    en_capa_vigente: z.boolean().meta({
      description:
        'false si el distrito solo existe en una versión de capa anterior (reportes resueltos con ella)',
    }),
    activas: ConteoActivasSchema,
    por_estado: ConteoPorEstadoResumenSchema,
    ultimo_reporte_en: FechaHoraAlMinuto.nullable(),
  })
  .superRefine(cuadrarActivasConEstados);
export type ResumenDistrito = z.infer<typeof ResumenDistritoSchema>;

export const ResumenEjecutivoSchema = z
  .object({
    generado_en: FechaHora,
    ventana: z
      .object({ desde: FechaHora.nullable(), hasta: FechaHora.nullable() })
      .meta({ description: 'null en desde y hasta = histórico completo (ventana=todo)' }),
    activas: ConteoActivasSchema.meta({
      description: 'Inundación activa: nuevo (en revisión) + validado (verificadas)',
    }),
    resueltas: Conteo.meta({
      description: 'Reportes resueltos: trabajo hecho, fuera de la inundación activa',
    }),
    por_estado: ConteoPorEstadoResumenSchema.meta({ description: 'Para la gráfica del trabajo' }),
    por_distrito: z.array(ResumenDistritoSchema),
    ultimo_reporte_en: FechaHoraAlMinuto.nullable(),
  })
  .superRefine((v, ctx) => {
    cuadrarActivasConEstados(v, ctx);
    if (v.resueltas !== v.por_estado.resuelto)
      ctx.addIssue({
        code: 'custom',
        path: ['resueltas'],
        message: 'resueltas debe ser igual a por_estado.resuelto.',
      });
  });
export type ResumenEjecutivo = z.infer<typeof ResumenEjecutivoSchema>;
