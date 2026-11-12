/**
 * Categoría inicial del mapa público (ADR 0014 y 0015). Función pura: la usa la web en M4, pero la
 * lógica (prioridad, validación contra las activas, forma de la preferencia guardada) vive acá para
 * probarse sin navegador.
 */

import { normalizarSlugCategoria, SLUGS_CATEGORIA, type SlugCategoria } from './slugs.js';

/** Inundaciones es la categoría por defecto si está activa (ADR 0014). */
const SLUG_POR_DEFECTO: SlugCategoria = 'inundacion';

/** Preferencia guardada en `localStorage` (ADR 0014): el JSON `{v:1, slug}`, ya parseado. */
export interface GuardadaCategoria {
  v?: number;
  slug?: unknown;
}

export interface EntradaResolverCategoria {
  /** Valor crudo de `?categoria` (puede ser un alias o algo inválido). */
  url?: string | null;
  /**
   * Preferencia del dispositivo. Se acepta como el objeto `{v, slug}` ya parseado o como el slug
   * suelto, para no atar esta función a cómo lo serializa cada app.
   */
  guardada?: string | GuardadaCategoria | null;
  /** Slugs activos en la instalación (los fija el catálogo de la base, ADR 0009). */
  activas: readonly string[];
}

/** De dónde salió la categoría efectiva. `ninguna` solo si no hay ninguna activa. */
export type OrigenCategoria = 'url' | 'guardada' | 'defecto' | 'primera_activa' | 'ninguna';

export interface ResultadoCategoriaInicial {
  /** Slug efectivo, siempre activo; `null` solo si no hay ninguna categoría activa. */
  slug: SlugCategoria | null;
  origen: OrigenCategoria;
  /** La URL traía un valor que no es una categoría conocida. */
  urlInvalida: boolean;
  /** La URL traía una categoría conocida pero no activa en esta instalación. */
  urlInactiva: boolean;
}

/** Extrae el slug de la preferencia guardada, venga como objeto `{v, slug}` o como cadena. */
function slugDeGuardada(
  guardada: string | GuardadaCategoria | null | undefined,
): SlugCategoria | null {
  if (guardada == null) return null;
  const crudo = typeof guardada === 'string' ? guardada : guardada.slug;
  return normalizarSlugCategoria(crudo);
}

/**
 * Resuelve la categoría inicial (ADR 0015). Prioridad: URL válida y activa → guardada válida y
 * activa → `inundacion` si está activa → la primera activa en el orden canónico. Nunca devuelve una
 * categoría inactiva; con `activas` vacía devuelve `slug: null`, `origen: 'ninguna'`.
 */
export function resolverCategoriaInicial({
  url,
  guardada,
  activas,
}: EntradaResolverCategoria): ResultadoCategoriaInicial {
  const activasSet = new Set<string>(activas);
  const esActiva = (slug: SlugCategoria): boolean => activasSet.has(slug);

  const traiaUrl = typeof url === 'string' && url.trim() !== '';
  const slugUrl = normalizarSlugCategoria(url);
  const urlInvalida = traiaUrl && slugUrl === null;
  const urlInactiva = slugUrl !== null && !esActiva(slugUrl);
  const banderas = { urlInvalida, urlInactiva };

  if (activasSet.size === 0) return { slug: null, origen: 'ninguna', ...banderas };

  if (slugUrl !== null && esActiva(slugUrl)) {
    return { slug: slugUrl, origen: 'url', ...banderas };
  }

  const slugGuardada = slugDeGuardada(guardada);
  if (slugGuardada !== null && esActiva(slugGuardada)) {
    return { slug: slugGuardada, origen: 'guardada', ...banderas };
  }

  if (esActiva(SLUG_POR_DEFECTO)) {
    return { slug: SLUG_POR_DEFECTO, origen: 'defecto', ...banderas };
  }

  const primera = SLUGS_CATEGORIA.find(esActiva);
  if (primera !== undefined) return { slug: primera, origen: 'primera_activa', ...banderas };

  // activas no está vacía pero no contiene ningún slug canónico conocido.
  return { slug: null, origen: 'ninguna', ...banderas };
}
