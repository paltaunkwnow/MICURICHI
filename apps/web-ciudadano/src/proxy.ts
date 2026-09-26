/**
 * Proxy de Next (antes «middleware»): lo que depende del despliegue se decide aquí, en cada
 * petición, y no en `next.config.ts`.
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
 * 3. **`Strict-Transport-Security` si `HSTS=1`**, en las páginas y en lo reenviado. Solo detrás de
 *    HTTPS: anunciarlo sobre http deja el navegador sin poder volver atrás.
 *
 * La CSP y el resto de cabeceras fijas siguen en `next.config.ts`: no dependen del despliegue.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { destinoDelReenvio } from './lib/servicios';

/** Cabeceras con las que un cliente puede intentar declarar su propia IP. */
const CABECERAS_DE_REENVIO = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-client-ip'];

const HSTS = 'max-age=31536000; includeSubDomains';

function reenviar(req: NextRequest, destino: URL): NextResponse {
  if (process.env.PROXY_DE_CONFIANZA === '1') return NextResponse.rewrite(destino);
  const cabeceras = new Headers(req.headers);
  for (const c of CABECERAS_DE_REENVIO) cabeceras.delete(c);
  return NextResponse.rewrite(destino, { request: { headers: cabeceras } });
}

export default function proxy(req: NextRequest) {
  const destino = destinoDelReenvio(req.nextUrl, process.env);
  const respuesta = destino ? reenviar(req, destino) : NextResponse.next();
  if (process.env.HSTS === '1') respuesta.headers.set('Strict-Transport-Security', HSTS);
  return respuesta;
}

/**
 * Todo menos los estáticos del build (`/_next/…`): las páginas por HSTS, y `/api` y `/geo` por el
 * reenvío. Tiene que ser un literal: Next lo analiza al compilar.
 */
export const config = {
  matcher: ['/((?!_next/).*)'],
};
