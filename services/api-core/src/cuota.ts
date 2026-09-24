/**
 * Cuota de creación de reportes: **un reporte aceptado por cuenta cada N minutos** (§13).
 *
 * POR QUÉ NO BASTA EL LÍMITE POR IP
 *
 * El límite por IP que ya existía (`rateLimitMax`) frena a una conexión, no a una persona. En una
 * ciudad donde la mayoría reporta desde datos móviles, la IP cambia sola: basta poner el teléfono
 * en modo avión y quitarlo para empezar de cero. Y al revés, un barrio entero detrás de un mismo
 * NAT comparte cubo, así que subir ese límite para no castigar al barrio es justamente lo que le
 * da margen al abuso. Los dos límites conviven porque miden cosas distintas y ninguno sustituye
 * al otro: la cuenta acota a la persona, la IP acota a la máquina.
 *
 * POR QUÉ ESTE UPDATE Y NO UN SELECT SEGUIDO DE UN INSERT
 *
 * La forma intuitiva —leer el último reporte, comparar la hora, insertar— tiene una ventana de
 * carrera que se abre justo cuando importa: con dos peticiones simultáneas, las dos leen el mismo
 * estado anterior, las dos concluyen que ha pasado una hora y las dos insertan. No es teórico; es
 * exactamente lo que hace un script que envía en paralelo.
 *
 * Este UPDATE condicional no tiene esa ventana. En READ COMMITTED, cuando dos transacciones
 * intentan actualizar la misma fila, la segunda espera a que la primera confirme y entonces
 * **vuelve a evaluar el WHERE contra la versión nueva de la fila** (EvalPlanQual). Como la
 * primera acaba de poner `ultimo_reporte_en = now()`, la condición ya no se cumple: se actualizan
 * 0 filas y esa petición se rechaza. La serialización la hace el bloqueo de fila de PostgreSQL,
 * que es precisamente para lo que está.
 *
 * Va DENTRO de la transacción que inserta el reporte, así que si el reporte no llega a guardarse
 * —fotos inválidas, error posterior— el ROLLBACK devuelve también la cuota. Nadie pierde su turno
 * por un envío que no se guardó.
 */

interface ClienteSql {
  query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export type ResultadoCuota =
  | { permitido: true }
  /** Rechazada: `reintentarEnS` va en `Retry-After` y `disponibleEn` se le muestra al vecino. */
  | { permitido: false; reintentarEnS: number; disponibleEn: Date };

/**
 * Intenta consumir el turno de esta cuenta. Devuelve `permitido: false` sin tocar nada si la
 * cuenta envió un reporte hace menos de `minutos`.
 */
export async function consumirCuotaDeReporte(
  cliente: ClienteSql,
  usuarioId: string,
  minutos: number,
): Promise<ResultadoCuota> {
  const consumido = await cliente.query<{ ok: boolean }>(
    `UPDATE usuario SET ultimo_reporte_en = now()
      WHERE id = $1
        AND (ultimo_reporte_en IS NULL OR ultimo_reporte_en <= now() - ($2 || ' minutes')::interval)
      RETURNING true AS ok`,
    [usuarioId, String(minutos)],
  );
  if (consumido.rowCount) return { permitido: true };

  // Sin turno. Se relee para decirle a la persona CUÁNDO puede volver, en lugar de un «no» seco.
  // La fila ya no está bloqueada (quien la tenía confirmó), así que esto ve el valor definitivo.
  const fila = await cliente.query<{ disponible_en: string | null }>(
    `SELECT (ultimo_reporte_en + ($2 || ' minutes')::interval)::text AS disponible_en
       FROM usuario WHERE id = $1`,
    [usuarioId, String(minutos)],
  );
  const texto = fila.rows[0]?.disponible_en;
  // Si la fila desapareció entre medias (cuenta borrada), se responde con la ventana completa:
  // nunca con 0, que invitaría a reintentar en bucle.
  const disponibleEn = texto ? new Date(texto) : new Date(Date.now() + minutos * 60_000);
  const restanteMs = disponibleEn.getTime() - Date.now();
  return {
    permitido: false,
    // Al menos 1 s: un Retry-After de 0 es una invitación a reintentar sin pausa.
    reintentarEnS: Math.max(1, Math.ceil(restanteMs / 1000)),
    disponibleEn,
  };
}

/** Momento a partir del cual esta cuenta puede volver a reportar; null si puede ahora mismo. */
export async function proximoEnvioPermitido(
  cliente: ClienteSql,
  usuarioId: string,
  minutos: number,
): Promise<Date | null> {
  const r = await cliente.query<{ disponible_en: string | null }>(
    `SELECT (ultimo_reporte_en + ($2 || ' minutes')::interval)::text AS disponible_en
       FROM usuario
      WHERE id = $1 AND ultimo_reporte_en > now() - ($2 || ' minutes')::interval`,
    [usuarioId, String(minutos)],
  );
  const texto = r.rows[0]?.disponible_en;
  return texto ? new Date(texto) : null;
}
