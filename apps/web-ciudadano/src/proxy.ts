/**
 * Proxy de Next (antes «middleware»): lo que depende del despliegue o cambia en cada petición se
 * decide aquí, y no en `next.config.ts`.
 *
 * Por qué. Mi Curichi se instala una vez por ciudad con la MISMA imagen. `next.config.ts` se
 * evalúa al compilar y Next serializa sus `rewrites` y `headers` en la salida
 * (`routes-manifest.json`): con los reenvíos ahí, la imagen quedaba atada a la dirección de api-core
 * que hubiera al construirla (`http://127.0.0.1:3001` en la de desarrollo), y `HSTS` también.
 * Este archivo corre en el runtime de Node en cada petición (Next 16: el proxy usa Node por
 * defecto y no admite otro), así que lee `process.env` del contenedor que arrancó.
 *
 * Qué hace:
 *
 * 1. **Reenvía `/api/*` a api-core y `/geo/*` a geo-service** (`API_CORE_URL`, `GEO_SERVICE_URL`)
 *    con `NextResponse.rewrite` a un origen externo. Next hace de proxy HTTP con esa petición: el
 *    mismo camino que usaban los `rewrites` externos de `next.config.ts` (`proxyRequest`), con
 *    método, cuerpo, cabeceras y cookies; las respuestas vuelven con sus `Set-Cookie`. El cuerpo no
 *    se toca aquí: si este archivo lo leyera, la subida de fotos llegaría vacía.
 *
 * 2. **Borra las cabeceras con que el navegador declara su propia IP** antes de reenviar.
 *    Comprobado en este repositorio con un servicio de eco detrás del reenvío: Next pasa el
 *    `X-Forwarded-For` del cliente tal cual y no añade ninguno propio. Eso dejaba dos escenarios y
 *    los dos malos:
 *     - Con `TRUST_PROXY` apagado, api-core ve siempre la IP de Next: todos los vecinos comparten
 *       un único cubo de rate limit y un único `ip_hash`, así que el límite de 10 reportes por hora
 *       (§13) es de la ciudad entera, no de cada persona.
 *     - Con `TRUST_PROXY` encendido, api-core se cree la cabecera que escribió el navegador:
 *       cambiándola en cada petición se saltan el rate limit, el freno de fuerza bruta del login y
 *       el antispam por `ip_hash`.
 *    Borrándolas, el peor caso deja de ser "suplantable" y pasa a ser "compartido", que es
 *    degradado pero seguro. Cuando de verdad hay un proxy propio delante (`PROXY_DE_CONFIANZA=1`,
 *    el que termina TLS y reescribe `X-Forwarded-For`), la cabecera se deja pasar y api-core la
 *    interpreta con confianza acotada por número de saltos: `TRUST_PROXY=1` en esa topología,
 *    porque este reenvío NO agrega entrada propia a `X-Forwarded-For`; con 2, el segundo salto
 *    caería en lo que escribió el cliente y volvería a poder elegirse la IP.
 *
 * 3. **Pone la Content-Security-Policy con un nonce nuevo en cada petición.** `script-src` no
 *    lleva 'unsafe-inline': Next pone en la página el payload de hidratación como <script> en
 *    línea, y esos scripts pasan porque llevan el nonce de esta petición. Next lo saca de la CSP
 *    de la PETICIÓN al renderizar (por eso se reescribe también esa cabecera) y el navegador la lee
 *    de la RESPUESTA: las dos son la misma. 'strict-dynamic' deja pasar lo que esos scripts cargan
 *    después (los chunks de cada página, el worker de MapLibre y su `import`); con él, los
 *    navegadores con CSP 3 ignoran 'self' en script-src, que queda para los que no lo entienden.
 *    Requisito: toda página se renderiza por petición, que aquí lo garantiza el layout raíz
 *    (`connection()` en `src/lib/ciudad-servidor.ts`); una página prerenderizada saldría sin
 *    nonce y sus scripts quedarían bloqueados.
 *
 * 4. **`Strict-Transport-Security` si `HSTS=1`**, en las páginas y en lo reenviado. Solo detrás de
 *    HTTPS: anunciarlo sobre http deja el navegador sin poder volver atrás.
 *
 * Las cabeceras que no cambian entre peticiones ni entre instalaciones siguen en `next.config.ts`.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { destinoDelReenvio } from './lib/servicios';

/** Cabeceras con las que un cliente puede intentar declarar su propia IP. */
const CABECERAS_DE_REENVIO = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-client-ip'];

/** Un año, subdominios incluidos. Solo con `HSTS=1`, es decir, detrás de HTTPS. */
const VALOR_HSTS = 'max-age=31536000; includeSubDomains';

/**
 * CSP de lo que responden api-core y geo-service a través de la app: JSON, capas, teselas y
 * fotos, que nunca se ejecutan como página. Es la misma que pone api-core, que la reemplaza con
 * la suya al responder; geo-service no pone ninguna.
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
  if (entorno.HSTS === '1') respuesta.headers.set('Strict-Transport-Security', VALOR_HSTS);
  return respuesta;
}

function reenviar(req: NextRequest, destino: URL, hayProxyDeConfianza: boolean): NextResponse {
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

/** Lo que atiende la propia app: páginas, sus datos de navegación y los archivos de `public/`. */
function pagina(req: NextRequest, nodeEnv: string | undefined): NextResponse {
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
 * Cada origen externo está porque algo concreto lo necesita:
 *  - `tile.openstreetmap.org` en img-src y connect-src: las teselas raster del mapa base
 *    (CLAUDE.md §14.3). MapLibre 6 las pide con `fetch`, no con <img>: con solo img-src la CSP
 *    bloqueaba el mapa base entero y quedaba en negro.
 *  - Los glifos de las etiquetas del mapa no salen a internet: se sirven desde `public/glifos/`.
 *  - `worker-src 'self' blob:`: el worker de MapLibre sale de `public/maplibre/`
 *    (`src/lib/worker-maplibre.ts`); `blob:` queda porque otras rutas de MapLibre lo crean así.
 *  - `data:`/`blob:` en img-src: la miniatura de la foto recién sacada con la cámara
 *    (`URL.createObjectURL`) y el canvas del mapa. El acceso a la cámara no pasa por la CSP: lo
 *    habilita `Permissions-Policy: camera=(self)` en `next.config.ts`.
 *  - `style-src` conserva 'unsafe-inline' y NO lleva el nonce: con un nonce el navegador ignora
 *    'unsafe-inline', y los atributos `style` de React y de MapLibre (a los que un nonce no
 *    alcanza) quedarían bloqueados.
 *  - `manifest-src 'self'`: la app es una PWA instalable.
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
    "manifest-src 'self'",
    ...(nodeEnv === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * Todo menos los estáticos del build (`/_next/…`): las páginas por la CSP y HSTS, y `/api` y
 * `/geo` por el reenvío. Las teselas de geo-service terminan en `.mvt`, así que no se puede
 * excluir por extensión. Los archivos de `public/` también pasan: el worker de MapLibre y el
 * service worker toman la CSP de su propia respuesta, y con 'strict-dynamic' el `import` del
 * módulo compartido del worker sigue permitido porque no lo insertó el analizador del HTML.
 * Tiene que ser un literal: Next lo analiza al compilar.
 */
export const config = {
  matcher: ['/((?!_next/).*)'],
};
