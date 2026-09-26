import { z } from 'zod';

/**
 * Resumen del panel ejecutivo: `GET /api/v1/ejecutivo/resumen` (roles ejecutivo, tecnico, admin).
 * Cuenta solo reportes en estado nuevo, validado o resuelto; los duplicados y rechazados no son
 * anegamientos distintos y no entran. La severidad es la efectiva (manual si existe).
 */

export const VENTANAS_RESUMEN = ['7d', '30d', 'todo'] as const;
export type VentanaResumen = (typeof VENTANAS_RESUMEN)[number];

export const ResumenEjecutivoQuerySchema = z.object({
  ventana: z.enum(VENTANAS_RESUMEN).default('todo'),
});
export type ResumenEjecutivoQuery = z.infer<typeof ResumenEjecutivoQuerySchema>;

const Conteo = z.number().int().nonnegative();
const FechaHora = z.iso.datetime({ offset: true });

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

export const ResumenDistritoSchema = z.object({
  distrito_id: z.string().min(1),
  codigo: z.string(),
  nombre: z.string(),
  total: Conteo,
  por_severidad: ConteoPorSeveridadSchema,
  por_estado: ConteoPorEstadoResumenSchema,
  ultimo_reporte_en: FechaHora.nullable(),
});
export type ResumenDistrito = z.infer<typeof ResumenDistritoSchema>;

export const ResumenEjecutivoSchema = z.object({
  generado_en: FechaHora,
  ventana: z
    .object({ desde: FechaHora.nullable(), hasta: FechaHora.nullable() })
    .meta({ description: 'null en desde y hasta = histórico completo (ventana=todo)' }),
  total: Conteo.meta({ description: 'Reportes en estado nuevo, validado o resuelto' }),
  por_severidad: ConteoPorSeveridadSchema.meta({ description: 'Por severidad efectiva' }),
  por_estado: ConteoPorEstadoResumenSchema,
  por_distrito: z.array(ResumenDistritoSchema),
  ultimo_reporte_en: FechaHora.nullable(),
});
export type ResumenEjecutivo = z.infer<typeof ResumenEjecutivoSchema>;
