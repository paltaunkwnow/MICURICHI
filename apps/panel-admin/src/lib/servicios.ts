/**
 * Dónde están api-core y geo-service para el servidor del panel.
 *
 * Son variables de TIEMPO DE EJECUCIÓN: se leen en cada petición, nunca al compilar. Antes eran
 * los `rewrites` de `next.config.ts`, que Next serializa en `routes-manifest.json` durante
 * `next build`: la imagen quedaba atada a la dirección que tuvieran al construirla y no servía
 * para otro despliegue. Mi Curichi se instala una vez por ciudad con la misma imagen.
 *
 * El navegador habla con `/api/*` y `/geo/*` en el propio origen (la cookie de sesión viaja sola
 * y no hace falta CORS) y `src/proxy.ts` reenvía. Mismo módulo que `apps/web-ciudadano`, más la
 * validación de las URL.
 */

/** Variables de entorno que nombran a cada servicio. */
export type VariableDeServicio = 'API_CORE_URL' | 'GEO_SERVICE_URL';

/** Lo que se lee del entorno: `process.env` en la app, un objeto cualquiera en las pruebas. */
export type EntornoServicios = Readonly<Record<string, string | undefined>>;

/** Valores de la máquina de desarrollo (`pnpm dev`). En un despliegue se definen siempre. */
export const DESTINOS_POR_DEFECTO: Record<VariableDeServicio, string> = {
  API_CORE_URL: 'http://127.0.0.1:3001',
  GEO_SERVICE_URL: 'http://127.0.0.1:3002',
};

/**
 * Base del servicio, validada y sin barra final (`https://api/` y `https://api` dan la misma
 * ruta). Una URL mal escrita falla con un mensaje que nombra la variable: antes terminaba en un
 * «Failed to proxy» de Next sin pista de qué configurar.
 */
function baseDelServicio(variable: VariableDeServicio, entorno: EntornoServicios): string {
  // `||` y no `??`: una variable definida pero vacía no puede convertir el reenvío en relativo.
  const valor = entorno[variable]?.trim() || DESTINOS_POR_DEFECTO[variable];
  const ejemplo = `p. ej. ${DESTINOS_POR_DEFECTO[variable]}`;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${variable} no es una URL absoluta (${ejemplo}); vale «${valor}».`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`${variable} tiene que ser http o https (${ejemplo}); vale «${valor}».`);
  // El reenvío mandaría las credenciales en cada petición, y quedarían en cualquier log de URLs.
  if (url.username || url.password)
    throw new Error(`${variable} no puede llevar usuario ni contraseña en la URL.`);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function urlDeApiCore(entorno: EntornoServicios): string {
  return baseDelServicio('API_CORE_URL', entorno);
}

export function urlDeGeoService(entorno: EntornoServicios): string {
  return baseDelServicio('GEO_SERVICE_URL', entorno);
}

const esRutaDe = (ruta: string, prefijo: string) =>
  ruta === prefijo || ruta.startsWith(`${prefijo}/`);

/**
 * A qué URL del servicio se reenvía una petición a `/api/*` o `/geo/*`, con la ruta y la consulta
 * intactas; `null` si la ruta es de la propia app (`/apiario` o `/geografia` también lo son).
 */
export function destinoDelReenvio(
  url: { pathname: string; search: string },
  entorno: EntornoServicios,
): URL | null {
  const servicio = esRutaDe(url.pathname, '/api')
    ? urlDeApiCore(entorno)
    : esRutaDe(url.pathname, '/geo')
      ? urlDeGeoService(entorno)
      : null;
  return servicio ? new URL(`${servicio}${url.pathname}${url.search}`) : null;
}
