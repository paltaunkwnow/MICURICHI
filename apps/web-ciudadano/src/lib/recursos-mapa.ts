/**
 * Glifos de las etiquetas del mapa, servidos por la propia app desde `public/glifos/` y no por un
 * servidor ajeno.
 *
 * Se sirven `immutable` por un año (`next.config.ts`), así que la URL lleva `?v=` con la huella
 * del contenido: los primeros 12 caracteres del SHA-256 de las rutas y los archivos de
 * `public/glifos/`. Si cambian los glifos, `src/lib/recursos-mapa.test.ts` falla y dice la huella
 * nueva que hay que escribir aquí.
 */
export const VERSION_GLIFOS = '81cda3120b68';

export const URL_GLIFOS = `/glifos/{fontstack}/{range}.pbf?v=${VERSION_GLIFOS}`;
