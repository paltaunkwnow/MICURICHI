/**
 * Idempotencia de la creación de reportes.
 *
 * El cliente manda una cabecera `Idempotency-Key` por envío. Si el mismo envío llega dos veces
 * (doble toque, reintento tras un timeout, red intermitente), el segundo devuelve el reporte que
 * creó el primero en vez de crear otro.
 *
 * La reclamación de la clave va DENTRO de la misma transacción que inserta el reporte. Eso da el
 * comportamiento correcto también con dos peticiones simultáneas: `INSERT ... ON CONFLICT DO
 * NOTHING` se queda esperando a la transacción que ya reclamó esa clave y, cuando aquella
 * confirma, la segunda ve la fila y devuelve su resultado; si aquella falla, la segunda gana la
 * clave y sigue adelante. No hace falta ningún lock aparte.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Formato aceptado para la cabecera: algo suficientemente aleatorio y acotado. */
export const ClaveIdempotenciaSchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9_:.-]+$/, 'La clave de idempotencia usa caracteres no permitidos.');

/** Horas que se recuerda una clave. Pasadas, el mismo envío volvería a crear un reporte. */
export const HORAS_VALIDEZ_CLAVE = 24;

/** Serialización estable (claves ordenadas) para que el mismo payload dé siempre la misma huella. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(',')}}`;
}

export function huellaDePayload(payload: unknown): string {
  return createHash('sha256').update(canonico(payload)).digest('hex');
}

export type ResultadoClave =
  | { tipo: 'reclamada' }
  | { tipo: 'repetida'; reporteId: string | null }
  | { tipo: 'conflicto' };

interface ClienteSql {
  query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

/**
 * Intenta reclamar la clave dentro de la transacción en curso.
 *  - `reclamada`: es la primera vez; hay que crear el reporte y luego llamar a `anotarResultado`.
 *  - `repetida`: ya existe con la MISMA huella; hay que devolver `reporteId` sin crear nada.
 *  - `conflicto`: existe con otra huella; se responde 409 y no se crea nada.
 */
export async function reclamarClave(
  cliente: ClienteSql,
  clave: string,
  huella: string,
): Promise<ResultadoClave> {
  const ins = await cliente.query<{ clave: string }>(
    `INSERT INTO idempotencia (clave, huella) VALUES ($1, $2)
     ON CONFLICT (clave) DO NOTHING RETURNING clave`,
    [clave, huella],
  );
  if (ins.rowCount) return { tipo: 'reclamada' };

  // `FOR UPDATE` y no un SELECT normal: si dos peticiones simultáneas encuentran la misma clave
  // CADUCADA, sin el bloqueo ambas la dan por vencida, ambas la pisan y ambas crean un reporte,
  // que es justo el duplicado que esta tabla existe para evitar. Con el bloqueo, la segunda
  // espera a que la primera confirme y ya la ve vigente.
  const previa = await cliente.query<{ huella: string; reporte_id: string | null; viva: boolean }>(
    `SELECT huella, reporte_id::text,
            (creado_en > now() - ($2 || ' hours')::interval) AS viva
     FROM idempotencia WHERE clave = $1 FOR UPDATE`,
    [clave, String(HORAS_VALIDEZ_CLAVE)],
  );
  const fila = previa.rows[0];
  // Se borró entre el INSERT y el SELECT (el mantenimiento limpia las caducadas): es un envío nuevo.
  if (!fila) {
    const reinsertada = await cliente.query<{ clave: string }>(
      `INSERT INTO idempotencia (clave, huella) VALUES ($1, $2)
       ON CONFLICT (clave) DO NOTHING RETURNING clave`,
      [clave, huella],
    );
    return reinsertada.rowCount ? { tipo: 'reclamada' } : { tipo: 'conflicto' };
  }
  // Caducada: se pisa la fila vieja y se trata como envío nuevo.
  if (!fila.viva) {
    await cliente.query(
      `UPDATE idempotencia SET huella = $2, reporte_id = NULL, creado_en = now() WHERE clave = $1`,
      [clave, huella],
    );
    return { tipo: 'reclamada' };
  }
  if (fila.huella !== huella) return { tipo: 'conflicto' };
  return { tipo: 'repetida', reporteId: fila.reporte_id };
}

/** Deja anotado a qué reporte corresponde la clave. Va en la misma transacción que el INSERT. */
export async function anotarResultado(
  cliente: ClienteSql,
  clave: string,
  reporteId: string,
): Promise<void> {
  await cliente.query('UPDATE idempotencia SET reporte_id = $2 WHERE clave = $1', [
    clave,
    reporteId,
  ]);
}
