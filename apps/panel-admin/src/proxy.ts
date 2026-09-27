/**
 * Proxy de Next (antes «middleware»): reenvía `/api/*` a api-core y `/geo/*` a geo-service, pone
 * la Content-Security-Policy con un nonce nuevo en cada petición y anuncia HSTS. Todo en tiempo
 * de ejecución, leyendo el entorno en cada petición.
 *
 * Por qué aquí y no en next.config.ts. `rewrites()` y `headers()` se evalúan en `next build` y
 * quedan congelados en la salida: `API_CORE_URL`, `GEO_SERVICE_URL` y `HSTS` se fijaban al
 * compilar y la imagen servía a una sola instalación. Mi Curichi se despliega una vez por ciudad
 * con la misma imagen, así que esas tres variables se leen al atender cada petición.
 *
 * Saneamiento de las cabeceras de reenvío. Comprobado en este repositorio con un servicio de eco
 * detrás del reenvío: **Next pasa el `X-Forwarded-For` del cliente tal cual y no añade ninguno
 * propio**. Eso dejaba dos escenarios y los dos malos:
 *
 *  - Con `TRUST_PROXY` apagado, api-core ve siempre la IP de Next: todos los vecinos comparten un
 *    único cubo de rate limit y un único `ip_hash`, así que el límite de 10 reportes por hora
 *    (§13) es de la ciudad entera, no de cada persona.
 *  - Con `TRUST_PROXY` encendido, api-core se cree la cabecera que escribió el navegador:
 *    cambiándola en cada petición se saltan el rate limit, el freno de fuerza bruta del login y
 *    el antispam por `ip_hash`.
 *
 * Por eso se borran del reenvío las cabeceras de reenvío que venga escribiendo el cliente: el
 * peor caso deja de ser "suplantable" y pasa a ser "compartido", que es degradado pero seguro.
 * Cuando de verdad hay un proxy propio delante (`PROXY_DE_CONFIANZA=1`, el que termina TLS y
 * reescribe `X-Forwarded-For`), la cabecera se deja pasar y api-core la interpreta con confianza
 * acotada por número de saltos: `TRUST_PROXY=1` en esa topología, porque este reenvío NO agrega
 * entrada propia a `X-Forwarded-For`; con 2, el segundo salto caería en lo que escribió el cliente.
 *
 * El resto de la petición viaja intacto (método, cuerpo, `Cookie`) y la respuesta del servicio
 * llega tal cual (`Set-Cookie`, `Content-Disposition` de la exportación).
 *
 * CSP con nonce. `script-src` no lleva 'unsafe-inline': Next pone en la página el payload de
 * hidratación como <script> en línea, y esos scripts pasan porque llevan el nonce de esta
 * petición. Next lo saca de la CSP de la PETICIÓN al renderizar (por eso se reescribe también
 * esa cabecera) y el navegador la lee de la RESPUESTA: las dos son la misma. 'strict-dynamic'
 * deja pasar lo que esos scripts cargan después (los chunks de cada página, los imports del
 * worker de MapLibre); con él, los navegadores con CSP 3 ignoran 'self' en script-src, que queda
 * para los que no lo entienden. Requisito: toda página se renderiza por petición, que en el
 * panel lo garantiza el layout raíz (`connection()` en `src/lib/ciudad-servidor.ts`); una página
 * prerenderizada saldría sin nonce y sus scripts quedarían bloqueados.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { destinoDelReenvio } from '@/lib/servicios';

/** Cabeceras con las que un cliente puede intentar declarar su propia IP. */
const CABECERAS_DE_REENVIO = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-client-ip'];

/** Un año, subdominios incluidos. Solo con `HSTS=1`, es decir, detrás de HTTPS. */
const VALOR_HSTS = 'max-age=31536000; includeSubDomains';

/**
 * CSP de lo que responden api-core y geo-service a través del panel: JSON, teselas, fotos y
 * exportaciones, que nunca se ejecutan como página. Es la misma que pone api-core, que la
 * reemplaza con la suya al responder; geo-service no pone ninguna.
 */
const CSP_DE_SERVICIO =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export default function proxy(req: NextRequest) {
  // Se lee aquí, en cada petición. Next solo congela al compilar las `NEXT_PUBLIC_*`.
  const entorno = process.env;
  const destino = destinoDelReenvio(req.nextUrl, entorno);
  const respuesta = destino
    ? reenviar(req, destino, entorno.PROXY_DE_CONFIANZA === '1')
    : pagina(req, entorno.NODE_ENV);
  // Anunciar HSTS sobre http deja al navegador sin poder volver atrás: solo si el despliegue
  // declara que está detrás de HTTPS.
  if (entorno.HSTS === '1') respuesta.headers.set('Strict-Transport-Security', VALOR_HSTS);
  return respuesta;
}

function reenviar(req: NextRequest, destino: URL, hayProxyDeConfianza: boolean) {
  const respuesta = hayProxyDeConfianza
    ? NextResponse.rewrite(destino)
    : NextResponse.rewrite(destino, { request: { headers: sinCabecerasDeReenvio(req) } });
  respuesta.headers.set('Content-Security-Policy', CSP_DE_SERVICIO);
  return respuesta;
}

function sinCabecerasDeReenvio(req: NextRequest): Headers {
  const cabeceras = new Headers(req.headers);
  for (const c of CABECERAS_DE_REENVIO) cabeceras.delete(c);
  return cabeceras;
}

/** Lo que atiende el propio panel: páginas, sus datos de navegación y los archivos de `public/`. */
function pagina(req: NextRequest, nodeEnv: string | undefined) {
  const nonce = nuevoNonce();
  const csp = politicaDeContenido(nonce, nodeEnv);
  const cabeceras = new Headers(req.headers);
  // `set` pisa lo que haya mandado el cliente: el nonce lo elige solo el servidor. `x-nonce` es
  // la vía documentada por Next para que un componente de servidor lo lea con `headers()`.
  cabeceras.set('Content-Security-Policy', csp);
  cabeceras.set('x-nonce', nonce);
  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set('Content-Security-Policy', csp);
  return respuesta;
}

/** 128 bits aleatorios en base64, el mínimo que pide CSP 3 para que no se pueda adivinar. */
function nuevoNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Cada origen externo está porque algo concreto lo necesita (mismo razonamiento que en
 * `apps/web-ciudadano`):
 *  - `tile.openstreetmap.org` en img-src y connect-src: MapLibre 6 pide las teselas raster con
 *    `fetch`, no con <img>.
 *  - `worker-src 'self' blob:`: el worker de MapLibre sale de `public/maplibre/`
 *    (`src/lib/worker-maplibre.ts`); `blob:` queda porque otras rutas de MapLibre lo crean así.
 *  - `style-src` conserva 'unsafe-inline' y NO lleva el nonce: con un nonce el navegador ignora
 *    'unsafe-inline', y los atributos `style` de React y de MapLibre (a los que un nonce no
 *    alcanza) quedarían bloqueados.
 * api-core y geo-service no aparecen: el navegador les habla por `/api` y `/geo` en el propio
 * origen. En desarrollo React necesita 'unsafe-eval' para reconstruir en el navegador las pilas
 * de los errores del servidor; ni React ni Next lo usan en producción.
 */
function politicaDeContenido(nonce: string, nodeEnv: string | undefined): string {
  const desarrollo = nodeEnv === 'development';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ''}`,
    "worker-src 'self' blob:",
    "connect-src 'self' https://tile.openstreetmap.org",
    ...(nodeEnv === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * Todo menos los recursos internos de Next (`/_next/…`): las páginas, para la CSP y HSTS, y las
 * rutas de servicio, para el reenvío. Las teselas de geo-service terminan en `.pbf`, así que no se
 * puede excluir por extensión. Los archivos de `public/` también pasan: el worker de MapLibre toma
 * la CSP de su propia respuesta, y con 'strict-dynamic' su `import` del módulo compartido sigue
 * permitido porque no lo insertó el analizador del HTML.
 */
export const config = {
  matcher: ['/((?!_next/).*)'],
};
