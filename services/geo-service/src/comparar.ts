import { timingSafeEqual } from 'node:crypto';

/**
 * Comparación de secretos sin filtrar por tiempo. Con `===` el bucle sale en el primer byte
 * distinto, así que el tiempo de respuesta dice cuántos caracteres del token se acertaron y el
 * secreto se puede reconstruir carácter a carácter.
 */
export function igualEnTiempoConstante(recibido: unknown, esperado: string): boolean {
  if (typeof recibido !== 'string') return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige la misma longitud; comparar b consigo mismo mantiene el coste
  // constante cuando no coincide y la longitud se descarta aparte.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
