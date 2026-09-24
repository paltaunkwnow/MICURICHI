/**
 * Política de almacenamiento en caché de las respuestas de api-core.
 *
 * Regla única y cerrada por defecto: **nada se guarda salvo que la ruta diga explícitamente que
 * su contenido es público**. La decisión no se deja en cada manejador porque el fallo que esto
 * corrige fue exactamente eso: `GET /api/v1/reportes` cambiaba de representación según la cookie
 * y no declaraba ninguna cabecera de caché, así que solo salía `Vary: Origin`. Una caché
 * compartida delante del servicio —un proxy del municipio, una CDN— podía guardar la respuesta de
 * un técnico (coordenadas exactas y reportes sin moderar) y servírsela después a cualquiera.
 *
 * Que el valor por defecto sea `private, no-store` significa que una ruta nueva que se olvide de
 * pensar en la caché falla hacia el lado seguro: se deja de cachear algo que quizá podía
 * cachearse, en vez de publicar algo que no debía salir.
 *
 * `Vary: Cookie` acompaña siempre a las respuestas privadas. Con la separación de rutas ya no
 * hace falta para evitar la confusión —las URL técnicas son otras—, pero es la segunda barrera:
 * si algún día una ruta volviera a mirar la sesión, la caché al menos tendría que indexar por
 * cookie en vez de mezclar usuarios.
 */
import type { FastifyReply } from 'fastify';

/** Lo que se pone cuando el manejador no dijo nada. */
export const CACHE_PRIVADA = 'private, no-store';

/**
 * Contenido idéntico para todo el mundo. `no-cache` no quiere decir "no guardar": permite que
 * una caché compartida lo almacene y la obliga a revalidar antes de reutilizarlo, que es lo
 * correcto para un listado que cambia cuando el técnico modera.
 */
export const CACHE_PUBLICA = 'public, no-cache';

/**
 * Añade un valor a `Vary` sin pisar los que ya estén. Importa: `@fastify/cors` pone `Vary: Origin`
 * y sobrescribirlo haría que una caché sirviera la respuesta de un origen a otro.
 */
export function anadirVary(res: FastifyReply, valor: string): void {
  const actual = res.getHeader('vary');
  const partes = String(actual ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (partes.some((p) => p.toLowerCase() === valor.toLowerCase())) return;
  partes.push(valor);
  res.header('Vary', partes.join(', '));
}

/** Marca la respuesta como pública: misma representación para cualquiera que la pida. */
export function cacheDeListadoPublico(res: FastifyReply): void {
  res.header('Cache-Control', CACHE_PUBLICA);
}

/**
 * Valor por defecto del hook global. Solo actúa si el manejador no puso nada: `/api/v1/fotos/:key`
 * y las rutas públicas deciden por su cuenta y esas decisiones se respetan.
 */
export function aplicarCachePorDefecto(res: FastifyReply): void {
  if (!res.hasHeader('Cache-Control')) res.header('Cache-Control', CACHE_PRIVADA);
  if (String(res.getHeader('Cache-Control') ?? '').includes('private')) anadirVary(res, 'Cookie');
}
