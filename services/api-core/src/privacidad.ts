/**
 * Utilidades de privacidad para logs y antispam (CLAUDE.md §13).
 *
 * Regla: una IP es un dato personal. Ni en los logs ni en la base se guarda en claro; se guarda
 * un hash con sal secreta. La sal rota por día en `ipHashDiario`, de modo que un mismo visitante
 * no sea correlacionable entre jornadas.
 */
import { createHash } from 'node:crypto';

/** Hash estable de una IP para etiquetar logs sin identificar a la persona. */
export function hashIp(ip: string, sal: string): string {
  // 16 caracteres bastan para agrupar eventos del mismo origen en una investigación.
  return createHash('sha256').update(`${ip}|${sal}`).digest('hex').slice(0, 16);
}

/** Hash del antispam de reportes: además de la sal, cambia cada día. */
export function ipHashDiario(ip: string, sal: string, hoy = new Date()): string {
  return createHash('sha256')
    .update(`${ip}|${sal}|${hoy.toISOString().slice(0, 10)}`)
    .digest('hex');
}
