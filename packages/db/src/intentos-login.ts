/**
 * Freno de fuerza bruta en el login (CLAUDE.md §13).
 *
 * Se cuenta por DOS claves a la vez:
 *  - la cuenta, para que un ataque distribuido (una IP distinta por intento) no tenga barra libre;
 *  - la IP, para que una sola máquina no pueda probar contra muchas cuentas.
 *
 * No es un bloqueo de cuenta: es una ventana deslizante que caduca sola y que un inicio de sesión
 * correcto limpia. Un bloqueo duro permitiría a un atacante dejar fuera a un técnico a propósito
 * simplemente fallando contraseñas contra su correo.
 *
 * Las claves se guardan hasheadas con sal: la tabla no debe servir para saber qué correos existen.
 */
import { createHash } from 'node:crypto';
import type { Ejecutor } from './ejecutor.js';

export interface LimitesLogin {
  /** Fallos permitidos por cuenta dentro de la ventana. */
  maxPorEmail: number;
  /** Fallos permitidos por IP dentro de la ventana. */
  maxPorIp: number;
  /** Duración de la ventana deslizante, en minutos. */
  ventanaMinutos: number;
}

export const LIMITES_LOGIN_POR_DEFECTO: LimitesLogin = {
  maxPorEmail: 10,
  maxPorIp: 30,
  ventanaMinutos: 15,
};

export interface EstadoLogin {
  /** true si hay que rechazar sin siquiera comprobar la contraseña. */
  bloqueado: boolean;
  /** Segundos que conviene esperar; se envía en Retry-After. */
  reintentarEnS: number;
}

function clave(prefijo: 'email' | 'ip' | 'registro', valor: string, sal: string): string {
  return `${prefijo}:${createHash('sha256').update(`${valor}|${sal}`).digest('hex')}`;
}

export function clavesDeIntento(email: string, ip: string, sal: string): string[] {
  return [clave('email', email.trim().toLowerCase(), sal), clave('ip', ip, sal)];
}

/**
 * ¿Hay que frenar este intento? Se consulta ANTES de verificar la contraseña, así el ataque
 * tampoco consume el scrypt (que es caro a propósito y sería un vector de agotamiento de CPU).
 */
export async function estadoDeLogin(
  ex: Ejecutor,
  email: string,
  ip: string,
  sal: string,
  limites: LimitesLogin = LIMITES_LOGIN_POR_DEFECTO,
): Promise<EstadoLogin> {
  const [claveEmail, claveIp] = clavesDeIntento(email, ip, sal);
  const filas = await ex.consultar<{ clave: string; n: string; primero: string }>(
    `SELECT clave, count(*)::text AS n, min(creado_en)::text AS primero
     FROM intento_login
     WHERE clave = ANY($1::text[]) AND NOT exito AND creado_en > now() - ($2 || ' minutes')::interval
     GROUP BY clave`,
    [[claveEmail, claveIp], String(limites.ventanaMinutos)],
  );
  let bloqueado = false;
  let reintentarEnS = 0;
  for (const f of filas) {
    const max = f.clave === claveEmail ? limites.maxPorEmail : limites.maxPorIp;
    if (Number(f.n) < max) continue;
    bloqueado = true;
    // El freno se levanta cuando el fallo más antiguo sale de la ventana.
    const liberaEn = new Date(f.primero).getTime() + limites.ventanaMinutos * 60_000 - Date.now();
    reintentarEnS = Math.max(reintentarEnS, Math.ceil(Math.max(liberaEn, 1000) / 1000));
  }
  return { bloqueado, reintentarEnS };
}

/**
 * Anota el resultado. Si el intento fue correcto, limpia los fallos de esa cuenta y esa IP para
 * que quien recuerda su contraseña al quinto intento no quede penalizado.
 */
export async function registrarIntento(
  ex: Ejecutor,
  email: string,
  ip: string,
  sal: string,
  exito: boolean,
): Promise<void> {
  const claves = clavesDeIntento(email, ip, sal);
  if (exito) {
    await ex.consultar('DELETE FROM intento_login WHERE clave = ANY($1::text[]) AND NOT exito', [
      claves,
    ]);
    return;
  }
  await ex.consultar(`INSERT INTO intento_login (clave, exito) SELECT unnest($1::text[]), false`, [
    claves,
  ]);
}

/* ------------------------------------------------------------------------------------------- *
 * Altas de cuenta por IP
 *
 * Obligar a tener cuenta para reportar no elimina el abuso por sí solo: lo mueve un paso atrás.
 * Quien antes mandaba mil reportes con mil IPs ahora intentaría mil CUENTAS con mil IPs. Esto
 * acota el primer escalón; el segundo es la cuota de un reporte por hora y por cuenta, que hace
 * que cada cuenta conseguida valga muy poco.
 *
 * Se apoya en la misma tabla `intento_login` a propósito. Es el mismo tipo de dato (un evento con
 * marca de tiempo, con la clave hasheada para no guardar la IP en claro), tiene ya los índices
 * que hacen falta y el mantenimiento periódico ya la purga. Una tabla nueva habría significado
 * migración, privilegios y limpieza duplicados para guardar exactamente lo mismo.
 *
 * Es ADEMÁS del límite en memoria del plugin de rate limit, no en su lugar: aquel se reinicia con
 * el proceso y no se comparte entre réplicas, este sobrevive a los dos.
 * ------------------------------------------------------------------------------------------- */

/** Altas de cuenta permitidas desde una misma IP dentro de la ventana. */
export const REGISTROS_POR_IP_POR_DEFECTO = 5;
/** Ventana de esa cuenta, en minutos. */
export const REGISTRO_VENTANA_MINUTOS = 60;

export interface EstadoRegistro {
  bloqueado: boolean;
  reintentarEnS: number;
}

export async function estadoDeRegistro(
  ex: Ejecutor,
  ip: string,
  sal: string,
  maximo: number = REGISTROS_POR_IP_POR_DEFECTO,
  ventanaMinutos: number = REGISTRO_VENTANA_MINUTOS,
): Promise<EstadoRegistro> {
  const filas = await ex.consultar<{ n: string; primero: string }>(
    `SELECT count(*)::text AS n, min(creado_en)::text AS primero
       FROM intento_login
      WHERE clave = $1 AND creado_en > now() - ($2 || ' minutes')::interval`,
    [clave('registro', ip, sal), String(ventanaMinutos)],
  );
  const f = filas[0];
  if (!f || Number(f.n) < maximo) return { bloqueado: false, reintentarEnS: 0 };
  const liberaEn = new Date(f.primero).getTime() + ventanaMinutos * 60_000 - Date.now();
  return { bloqueado: true, reintentarEnS: Math.ceil(Math.max(liberaEn, 1000) / 1000) };
}

/**
 * Anota un alta. Se llama siempre que la petición llega a crear (o a intentar crear) una cuenta,
 * exista ya el correo o no: si solo contara las altas nuevas, probar correos hasta dar con uno
 * libre saldría gratis.
 */
export async function anotarRegistro(ex: Ejecutor, ip: string, sal: string): Promise<void> {
  await ex.consultar('INSERT INTO intento_login (clave, exito) VALUES ($1, true)', [
    clave('registro', ip, sal),
  ]);
}
