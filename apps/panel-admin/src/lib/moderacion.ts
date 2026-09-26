import { type ReporteCambiarEstado, ReporteCambiarEstadoSchema } from 'contracts';

/** Acciones del formulario de moderación que llevan motivo (fusionar va por su propia ruta). */
export type AccionConMotivo = 'rechazar' | 'resolver' | 'reabrir';

const DESTINO: Record<AccionConMotivo, ReporteCambiarEstado['estado']> = {
  rechazar: 'rechazado',
  resolver: 'resuelto',
  reabrir: 'nuevo',
};

export type ResultadoCambioEstado =
  | { ok: true; cuerpo: ReporteCambiarEstado }
  | { ok: false; error: string };

/**
 * Cuerpo de `PATCH /reportes/:id/estado` validado con el mismo esquema que aplica api-core.
 * Rechazar, resolver y —desde contracts 0.6.0— reabrir un rechazado exigen motivo: la auditoría
 * guarda el porqué de cada transición (§7.3).
 */
export function cuerpoCambioEstado(accion: AccionConMotivo, motivo: string): ResultadoCambioEstado {
  const v = ReporteCambiarEstadoSchema.safeParse({
    estado: DESTINO[accion],
    estado_motivo: motivo.trim() || undefined,
  });
  if (v.success) return { ok: true, cuerpo: v.data };
  return {
    ok: false,
    error:
      accion === 'reabrir'
        ? 'Para reabrir el reporte escribí el motivo (al menos 3 caracteres): queda en la auditoría.'
        : 'Escribí un motivo de al menos 3 caracteres.',
  };
}
