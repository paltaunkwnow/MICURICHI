/**
 * Proxy de Next (antes «middleware»): reenvía `/api/*` a api-core y `/geo/*` a geo-service, y
 * anuncia HSTS. Todo en tiempo de ejecución, leyendo el entorno en cada petición.
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
 * llega tal cual (`Set-Cookie`, `Content-Disposition` de la exportación). La CSP no cambia: el
 * navegador sigue hablando solo con su mismo origen.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { destinoDelReenvio } from '@/lib/servicios';

/** Cabeceras con las que un cliente puede intentar declarar su propia IP. */
const CABECERAS_DE_REENVIO = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-client-ip'];

/** Un año, subdominios incluidos. Solo con `HSTS=1`, es decir, detrás de HTTPS. */
const VALOR_HSTS = 'max-age=31536000; includeSubDomains';

export default function proxy(req: NextRequest) {
  // Se lee aquí, en cada petición. Next solo congela al compilar las `NEXT_PUBLIC_*`.
  const entorno = process.env;
  const destino = destinoDelReenvio(req.nextUrl, entorno);
  const respuesta = destino
    ? reenviar(req, destino, entorno.PROXY_DE_CONFIANZA === '1')
    : NextResponse.next();
  // Anunciar HSTS sobre http deja al navegador sin poder volver atrás: solo si el despliegue
  // declara que está detrás de HTTPS.
  if (entorno.HSTS === '1') respuesta.headers.set('Strict-Transport-Security', VALOR_HSTS);
  return respuesta;
}

function reenviar(req: NextRequest, destino: URL, hayProxyDeConfianza: boolean) {
  if (hayProxyDeConfianza) return NextResponse.rewrite(destino);
  const cabeceras = new Headers(req.headers);
  for (const c of CABECERAS_DE_REENVIO) cabeceras.delete(c);
  return NextResponse.rewrite(destino, { request: { headers: cabeceras } });
}

/**
 * Todo menos los recursos internos de Next (`/_next/…`): las páginas, para HSTS, y las rutas de
 * servicio, para el reenvío. Las teselas de geo-service terminan en `.pbf`, así que no se puede
 * excluir por extensión.
 */
export const config = {
  matcher: ['/((?!_next/).*)'],
};
