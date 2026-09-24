/**
 * Cuánto se confía en `X-Forwarded-For` (CLAUDE.md §13: el rate limit y el `ip_hash` del antispam
 * dependen de acertar la IP del cliente).
 *
 * `TRUST_PROXY=1` significaba "confiar en todo": Fastify tomaba entonces el valor **más a la
 * izquierda** de la cabecera, que es justo el que escribe el cliente. Es decir, la opción pensada
 * para poner detrás de un proxy era la que permitía elegir la propia IP y con ella el cubo de
 * rate limit. Comprobado además que el reenvío de Next (`rewrites`) pasa la cabecera del cliente
 * tal cual y no añade ninguna, así que el agujero era alcanzable desde el navegador.
 *
 * Ahora el valor expresa una confianza ACOTADA:
 *   - `0` o vacío  → no se mira la cabecera; la IP es la del socket.
 *   - un número N  → se confía en los N saltos más cercanos al servicio; la IP es la que escribió
 *                    el proxy de confianza, no la que eligió el cliente.
 *   - lista de IP/CIDR → se confía solo en esas direcciones.
 *
 * Con la topología documentada (navegador → proxy TLS → Next → servicio) el valor correcto es 2.
 */
export type ConfianzaProxy = false | number | string[];

/** Nombres que `proxy-addr` acepta como redes con nombre. */
const REDES_CONOCIDAS = new Set(['loopback', 'linklocal', 'uniquelocal']);

export function leerConfianzaProxy(valor: string | undefined): ConfianzaProxy {
  const v = (valor ?? '').trim();
  if (!v || v === '0' || v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  const lista = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // `true` ya no se acepta: era exactamente la configuración que dejaba elegir la IP al cliente.
  if (!lista.length || lista.includes('true') || lista.includes('*')) return false;
  return lista.filter((x) => REDES_CONOCIDAS.has(x) || /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(x));
}

/** Descripción legible para el arranque y para los avisos de configuración. */
export function describirConfianzaProxy(c: ConfianzaProxy): string {
  if (c === false) return 'ninguna (la IP es la del socket)';
  if (typeof c === 'number') return `${c} salto(s) de proxy`;
  return `direcciones de confianza: ${c.join(', ')}`;
}

/**
 * Traduce la confianza a lo que acepta Fastify. El número de saltos no está en su tipo
 * (`boolean | string | string[] | función`), así que se pasa como la función equivalente: se
 * confía en los `n` saltos más cercanos al servicio, que es la semántica de `trust proxy` de
 * Express. Contar desde el servicio y no desde el cliente es lo que impide que valga de nada
 * añadir cabeceras por delante.
 */
export function opcionFastify(
  c: ConfianzaProxy,
): boolean | string[] | ((direccion: string, salto: number) => boolean) {
  if (c === false) return false;
  if (typeof c === 'number') return (_direccion: string, salto: number) => salto < c;
  return c;
}
