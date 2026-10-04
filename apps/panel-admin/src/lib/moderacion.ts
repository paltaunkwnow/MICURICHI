import {
  ESTADOS_VERIFICADOS,
  type EstadoReporte,
  type ReporteCambiarEstado,
  ReporteCambiarEstadoSchema,
  type Rol,
  transicionPermitida,
} from 'contracts';

/**
 * Acciones del formulario de moderación que llevan motivo (fusionar va por su propia ruta).
 * `retirar` es el rechazo de un reporte ya verificado: solo admin (contracts 0.11.0).
 */
export type AccionConMotivo = 'rechazar' | 'retirar' | 'resolver' | 'reabrir';

/** Acciones del panel de moderación, incluida la fusión. */
export type AccionModeracion = AccionConMotivo | 'fusionar';

const DESTINO: Record<AccionConMotivo, ReporteCambiarEstado['estado']> = {
  rechazar: 'rechazado',
  retirar: 'rechazado',
  resolver: 'resuelto',
  reabrir: 'nuevo',
};

/**
 * Textos del formulario de cada acción. Sin moderación previa, un reporte nuevo ya es público:
 * rechazar, retirar y fusionar lo sacan del mapa, y el técnico tiene que saberlo antes de confirmar.
 */
export const TEXTOS_ACCION: Record<
  AccionModeracion,
  { titulo: string; ayuda: string; confirmar: string }
> = {
  rechazar: {
    titulo: 'Rechazar el reporte',
    ayuda:
      'Lo retira del mapa público. Explicá por qué no corresponde: el motivo queda en la auditoría.',
    confirmar: 'Confirmar rechazo',
  },
  retirar: {
    titulo: 'Retirar del mapa público',
    ayuda:
      'El reporte ya está verificado. Retirarlo lo pasa a «Rechazado» y deja de verse en el mapa público (solo administradores). Explicá por qué: el motivo es obligatorio y queda en la auditoría.',
    confirmar: 'Confirmar retiro',
  },
  resolver: {
    titulo: 'Marcar como resuelto',
    ayuda: 'Indicá qué se hizo en el punto.',
    confirmar: 'Confirmar resolución',
  },
  fusionar: {
    titulo: 'Fusionar como duplicado',
    ayuda:
      'Lo retira del mapa público y lo suma a un reporte validado cercano, que es el que se conserva.',
    confirmar: 'Confirmar fusión',
  },
  reabrir: {
    titulo: 'Reabrir el reporte',
    ayuda:
      'Vuelve a "Nuevo" para revisarlo otra vez (solo administradores) y se ve de nuevo en el mapa público como «NO SE HA VERIFICADO». Explicá por qué se reabre: el motivo es obligatorio y queda en la auditoría.',
    confirmar: 'Confirmar reapertura',
  },
};

export type AccionesDisponibles = Record<'validar' | AccionModeracion, boolean>;

/**
 * Qué acciones ve cada rol según el estado, con la máquina de estados del contrato. Rechazar un
 * reporte verificado se muestra como «Retirar del mapa»: es la misma transición, pero solo de
 * admin y con otro peso (lo saca del mapa después de haberlo dado por bueno).
 */
export function accionesModeracion(estado: EstadoReporte, rol: Rol): AccionesDisponibles {
  const verificado = (ESTADOS_VERIFICADOS as readonly string[]).includes(estado);
  const puedeRechazar = transicionPermitida(estado, 'rechazado', rol);
  return {
    validar: transicionPermitida(estado, 'validado', rol),
    rechazar: puedeRechazar && !verificado,
    retirar: puedeRechazar && verificado,
    resolver: transicionPermitida(estado, 'resuelto', rol),
    fusionar: transicionPermitida(estado, 'duplicado', rol),
    reabrir: transicionPermitida(estado, 'nuevo', rol),
  };
}

export type ResultadoCambioEstado =
  | { ok: true; cuerpo: ReporteCambiarEstado }
  | { ok: false; error: string };

const ERROR_MOTIVO: Record<AccionConMotivo, string> = {
  rechazar: 'Escribí un motivo de al menos 3 caracteres.',
  resolver: 'Escribí un motivo de al menos 3 caracteres.',
  reabrir:
    'Para reabrir el reporte escribí el motivo (al menos 3 caracteres): queda en la auditoría.',
  retirar:
    'Para retirar el reporte del mapa escribí el motivo (al menos 3 caracteres): queda en la auditoría.',
};

/**
 * Cuerpo de `PATCH /reportes/:id/estado` validado con el mismo esquema que aplica api-core.
 * Rechazar, retirar, resolver y —desde contracts 0.6.0— reabrir un rechazado exigen motivo: la
 * auditoría guarda el porqué de cada transición (§7.3).
 */
export function cuerpoCambioEstado(accion: AccionConMotivo, motivo: string): ResultadoCambioEstado {
  const v = ReporteCambiarEstadoSchema.safeParse({
    estado: DESTINO[accion],
    estado_motivo: motivo.trim() || undefined,
  });
  if (v.success) return { ok: true, cuerpo: v.data };
  return { ok: false, error: ERROR_MOTIVO[accion] };
}
