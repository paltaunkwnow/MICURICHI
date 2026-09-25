/**
 * Saneamiento de las cabeceras de reenvío antes de que Next haga el *rewrite* a los servicios.
 *
 * Por qué existe. La app habla con api-core y geo-service por rutas relativas y Next las reenvía
 * (`rewrites` en next.config.ts). Comprobado en este repositorio con un servicio de eco detrás del
 * reenvío: **Next pasa el `X-Forwarded-For` del cliente tal cual y no añade ninguno propio**. Eso
 * dejaba dos escenarios y los dos malos:
 *
 *  - Con `TRUST_PROXY` apagado, api-core ve siempre la IP de Next: todos los vecinos comparten un
 *    único cubo de rate limit y un único `ip_hash`, así que el límite de 10 reportes por hora
 *    (§13) es de la ciudad entera, no de cada persona.
 *  - Con `TRUST_PROXY` encendido, api-core se cree la cabecera que escribió el navegador:
 *    cambiándola en cada petición se saltan el rate limit, el freno de fuerza bruta del login y
 *    el antispam por `ip_hash`.
 *
 * Qué hace. Borra del reenvío las cabeceras de reenvío que venga escribiendo el cliente. Con eso
 * el peor caso deja de ser "suplantable" y pasa a ser "compartido", que es degradado pero seguro.
 * Cuando de verdad hay un proxy propio delante (`PROXY_DE_CONFIANZA=1`, el que termina TLS y
 * reescribe `X-Forwarded-For`), la cabecera se deja pasar y api-core la interpreta con confianza
 * acotada por número de saltos (`TRUST_PROXY=2` en esa topología).
 *
 * No toca nada más: ni respuestas, ni rutas de la propia app.
 */
import { type NextRequest, NextResponse } from 'next/server';

/** Cabeceras con las que un cliente puede intentar declarar su propia IP. */
const CABECERAS_DE_REENVIO = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-client-ip'];

/** Solo hay un proxy de confianza delante si el despliegue lo declara. */
const HAY_PROXY = process.env.PROXY_DE_CONFIANZA === '1';

export default function proxy(req: NextRequest) {
  if (HAY_PROXY) return NextResponse.next();
  const cabeceras = new Headers(req.headers);
  for (const c of CABECERAS_DE_REENVIO) cabeceras.delete(c);
  return NextResponse.next({ request: { headers: cabeceras } });
}

/** Solo lo que se reenvía a los servicios; el resto de la app no necesita pasar por aquí. */
export const config = {
  matcher: ['/api/:path*', '/geo/:path*'],
};
