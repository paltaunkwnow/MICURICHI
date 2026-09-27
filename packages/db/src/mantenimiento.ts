/**
 * Retención y limpieza (CLAUDE.md §13). Hasta ahora nada borraba nunca:
 *  - las sesiones caducadas se acumulaban en la tabla,
 *  - `ip_hash` se guardaba indefinidamente pese a la política de 30 días,
 *  - las fotos subidas y nunca asociadas a un reporte quedaban en base y en disco.
 *
 * Es idempotente y barato: se apoya en los índices parciales de la migración 0002.
 */
import { CONFIG_DOMINIO } from 'contracts';
import type { Ejecutor } from './ejecutor.js';

export interface ResumenMantenimiento {
  sesionesCaducadas: number;
  ipHashBorrados: number;
  fotosHuerfanas: string[];
  intentosLoginBorrados: number;
  clavesIdempotenciaBorradas: number;
  /** Filas de `cuota_reporte_diaria` de días anteriores al de hoy en la ciudad (migración 0014). */
  cuotasDiariasBorradas: number;
}

export interface OpcionesMantenimiento {
  /** Días que se conserva `ip_hash` desde la creación del reporte. */
  retencionIpHashDias?: number;
  /** Horas que una foto puede quedar sin reporte antes de considerarse abandonada. */
  horasFotoHuerfana?: number;
  /** Horas que se conservan los intentos de login (solo sirven para la ventana antifuerza bruta). */
  horasIntentosLogin?: number;
  /** Horas que se recuerda una clave de idempotencia. */
  horasIdempotencia?: number;
  /**
   * Zona horaria (IANA) en la que se decide qué día es hoy para el cupo diario. Por defecto
   * `ZONA_HORARIA`, la misma variable con la que api-core fecha los turnos, o la del contrato.
   */
  zonaHoraria?: string;
  /** Instante con el que se decide qué día es hoy para el cupo diario. Por defecto, `now()`. */
  ahora?: Date;
}

export async function ejecutarMantenimiento(
  ex: Ejecutor,
  o: OpcionesMantenimiento = {},
): Promise<ResumenMantenimiento> {
  const dias = o.retencionIpHashDias ?? 30;
  const horas = o.horasFotoHuerfana ?? 24;
  const horasIntentos = o.horasIntentosLogin ?? 24;
  const horasIdem = o.horasIdempotencia ?? 24;
  const zona =
    o.zonaHoraria?.trim() ||
    process.env.ZONA_HORARIA?.trim() ||
    CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO;

  const sesiones = await ex.consultar<{ id: string }>(
    'DELETE FROM sesion WHERE expira_en < now() RETURNING id',
  );
  const ips = await ex.consultar<{ id: string }>(
    `UPDATE reporte_inundacion SET ip_hash = NULL
     WHERE ip_hash IS NOT NULL AND creado_en < now() - ($1 || ' days')::interval
     RETURNING id::text`,
    [String(dias)],
  );
  // Las claves se devuelven para que quien tenga el almacén (api-core) borre también el objeto.
  const fotos = await ex.consultar<{ objeto_key: string }>(
    `DELETE FROM reporte_foto
     WHERE reporte_id IS NULL AND creado_en < now() - ($1 || ' hours')::interval
     RETURNING objeto_key`,
    [String(horas)],
  );
  // Los intentos solo sirven dentro de su ventana; pasada, son solo datos que retener.
  const intentos = await ex.consultar<{ id: string }>(
    `DELETE FROM intento_login WHERE creado_en < now() - ($1 || ' hours')::interval
     RETURNING id::text`,
    [String(horasIntentos)],
  );
  // Las claves de idempotencia caducadas: pasada su ventana ya no evitan ningún duplicado.
  const claves = await ex.consultar<{ clave: string }>(
    `DELETE FROM idempotencia WHERE creado_en < now() - ($1 || ' hours')::interval
     RETURNING clave`,
    [String(horasIdem)],
  );
  // El cupo de un día que ya pasó no frena a nadie. «Hoy» es el día de la ciudad y no el de la
  // sesión de PostgreSQL: con `current_date` en UTC, a las 20:00 de La Paz se borraría la fila de
  // hoy y la cuenta recuperaría sus turnos.
  const cuotas = await ex.consultar<{ usuario_id: string }>(
    `DELETE FROM cuota_reporte_diaria
     WHERE dia < (COALESCE($1::timestamptz, now()) AT TIME ZONE $2)::date
     RETURNING usuario_id::text`,
    [o.ahora?.toISOString() ?? null, zona],
  );
  return {
    sesionesCaducadas: sesiones.length,
    ipHashBorrados: ips.length,
    fotosHuerfanas: fotos.map((f) => f.objeto_key),
    intentosLoginBorrados: intentos.length,
    clavesIdempotenciaBorradas: claves.length,
    cuotasDiariasBorradas: cuotas.length,
  };
}
