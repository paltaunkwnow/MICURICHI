/**
 * Dónde están api-core y geo-service para el servidor de esta app.
 *
 * Son variables de TIEMPO DE EJECUCIÓN: se leen en cada petición, nunca al compilar. Antes eran
 * los `rewrites` de `next.config.ts`, que Next serializa en `routes-manifest.json` durante
 * `next build`: la imagen quedaba atada a la dirección que tuvieran al construirla (en la de
 * desarrollo, `http://127.0.0.1:3001`) y no servía para otro despliegue.
 *
 * El navegador nunca ve estas direcciones: habla con `/api/*` y `/geo/*` en el propio origen y el
 * `proxy.ts` de la app reenvía.
 */

/** Lo que se lee del entorno: `process.env` en la app, un objeto cualquiera en las pruebas. */
export type EntornoServicios = Readonly<Record<string, string | undefined>>;

/** Valores de la máquina de desarrollo (`pnpm dev`). En un despliegue se definen siempre. */
const POR_DEFECTO = {
  API_CORE_URL: 'http://127.0.0.1:3001',
  GEO_SERVICE_URL: 'http://127.0.0.1:3002',
} as const;

/**
 * Base sin barra final: `https://api/` y `https://api` tienen que dar la misma ruta.
 *
 * Tiene que ser una URL absoluta http(s). Sin esquema, `new URL('api-core:3001/…')` lee `api-core:`
 * como protocolo y el reenvío iría a ninguna parte con un error que no nombra la variable; así el
 * fallo dice cuál está mal y cómo se escribe.
 */
function base(entorno: EntornoServicios, variable: keyof typeof POR_DEFECTO): string {
  // `||` y no `??`: una variable definida pero vacía no puede convertir el reenvío en relativo.
  const valor = entorno[variable]?.trim() || POR_DEFECTO[variable];
  let url: URL | null = null;
  try {
    url = new URL(valor);
  } catch {
    /* se informa abajo */
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:'))
    throw new Error(
      `${variable} inválida: «${valor}». Tiene que ser una URL absoluta http o https, p. ej. ${POR_DEFECTO[variable]}.`,
    );
  return valor.replace(/\/+$/, '');
}

export function urlDeApiCore(entorno: EntornoServicios): string {
  return base(entorno, 'API_CORE_URL');
}

export function urlDeGeoService(entorno: EntornoServicios): string {
  return base(entorno, 'GEO_SERVICE_URL');
}

const esRutaDe = (ruta: string, prefijo: string) =>
  ruta === prefijo || ruta.startsWith(`${prefijo}/`);

/**
 * A qué URL del servicio se reenvía una petición a `/api/*` o `/geo/*`, con la ruta y la consulta
 * intactas; `null` si la ruta es de la propia app (`/apis` o `/geografia` también lo son).
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
