/**
 * El correo con el que se acaba de crear la cuenta, de «Ya podés entrar» a «Iniciar sesión».
 *
 * Antes viajaba en la URL de `/ingresar`, como un parámetro más, y por eso quedaba en el historial
 * del navegador, en los registros del servidor y en el `Referer`: un dato personal en un lugar donde
 * no hace falta. Ahora el alta lo guarda acá y `/ingresar` lo toma al montar.
 *
 * Va en `sessionStorage` (la pestaña, no el navegador) y se **lee una sola vez**: tomarlo lo borra.
 * Igual que el borrador del reporte (`borrador.ts`), no sobrevive al cierre de la pestaña, y en un
 * teléfono prestado no queda guardado quién se registró.
 *
 * Sin almacenamiento (servidor, Safari en privado, datos del sitio bloqueados) todo se calla y el
 * campo queda vacío: la persona escribe su correo, que es lo que haría sin esta ayuda.
 */

/** Clave propia de este dato; ninguna otra pantalla la lee ni la escribe. */
export const CLAVE_CORREO_PARA_ENTRAR = 'curichi:correo-para-entrar';

/** Lo único que se usa de `Storage`: permite probar con un almacén falso. */
type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** El `sessionStorage` de la pestaña, o `null` si no hay (servidor) o el navegador lo bloquea. */
function almacenDeLaPestana(): Almacen | null {
  try {
    // Safari en navegación privada y los navegadores con almacenamiento bloqueado lanzan aquí.
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Deja el correo para que «Iniciar sesión» lo muestre. No hace nada si no hay dónde guardarlo. */
export function guardarCorreoParaEntrar(
  correo: string,
  almacen: Almacen | null = almacenDeLaPestana(),
): void {
  if (!almacen || !correo) return;
  try {
    almacen.setItem(CLAVE_CORREO_PARA_ENTRAR, correo);
  } catch {
    // Cuota llena o almacenamiento bloqueado: el campo quedará vacío, que es lo que pasaría sin esto.
  }
}

/**
 * El correo guardado, o '' si no hay (o no se puede leer). Lo borra al leerlo: una segunda llamada,
 * una recarga o volver a `/ingresar` más tarde no lo traen de nuevo.
 */
export function tomarCorreoParaEntrar(almacen: Almacen | null = almacenDeLaPestana()): string {
  if (!almacen) return '';
  try {
    const correo = almacen.getItem(CLAVE_CORREO_PARA_ENTRAR);
    almacen.removeItem(CLAVE_CORREO_PARA_ENTRAR);
    return correo ?? '';
  } catch {
    return '';
  }
}
