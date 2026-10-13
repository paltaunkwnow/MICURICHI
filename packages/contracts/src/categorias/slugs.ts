/**
 * Slugs de categoría y su forma pública de URL (ADR 0009, 0015, 0022).
 *
 * El slug INTERNO es snake_case y en español (`area_verde`); la forma de URL usa guion
 * (`area-verde`). `normalizarSlugCategoria` acepta las variantes que puede traer un enlace (plural,
 * guion o guion bajo, mayúsculas, con o sin tildes) y devuelve el canónico, o `null` si no es una
 * categoría conocida. Es la única fuente de la lista de slugs: todo lo demás la deriva.
 */

/** Slugs canónicos, en el orden de presentación del selector y del mapa (ADR 0015). */
export const SLUGS_CATEGORIA = ['inundacion', 'bache', 'area_verde', 'basura'] as const;
export type SlugCategoria = (typeof SLUGS_CATEGORIA)[number];

/** Forma pública del slug en la URL: se escribe con guion, no con guion bajo (ADR 0015). */
const URL_POR_SLUG: Record<SlugCategoria, string> = {
  inundacion: 'inundacion',
  bache: 'bache',
  area_verde: 'area-verde',
  basura: 'basura',
};

/**
 * Alias aceptados por categoría (ADR 0015). Se comparan ya compactados (sin tildes, en minúscula y
 * sin separadores), así que basta listar la forma singular y la plural; `area-verde`, `area_verde` y
 * `Área Verde` compactan todos a `areaverde`.
 */
const ALIAS: Record<SlugCategoria, readonly string[]> = {
  inundacion: ['inundacion', 'inundaciones'],
  bache: ['bache', 'baches'],
  area_verde: ['area_verde', 'areas_verdes', 'area verde', 'areas verdes'],
  basura: ['basura', 'basuras'],
};

/** Minúsculas, sin tildes y sin separadores: la clave con la que se buscan los alias. */
function compactar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_-]+/g, '');
}

/** Alias compactado → slug canónico. Incluye la forma de URL de cada slug. */
const SLUG_POR_ALIAS: ReadonlyMap<string, SlugCategoria> = (() => {
  const mapa = new Map<string, SlugCategoria>();
  for (const slug of SLUGS_CATEGORIA) {
    for (const alias of ALIAS[slug]) mapa.set(compactar(alias), slug);
    mapa.set(compactar(URL_POR_SLUG[slug]), slug);
  }
  return mapa;
})();

/**
 * Normaliza un valor cualquiera (parámetro `?categoria`, preferencia guardada) al slug canónico, o
 * `null` si no corresponde a ninguna categoría conocida. No valida si la categoría está ACTIVA: eso
 * lo decide `resolverCategoriaInicial` contra la lista de activas.
 */
export function normalizarSlugCategoria(valor: unknown): SlugCategoria | null {
  if (typeof valor !== 'string') return null;
  const clave = compactar(valor);
  if (clave === '') return null;
  return SLUG_POR_ALIAS.get(clave) ?? null;
}

/** Forma pública del slug para la URL (`area_verde` → `area-verde`). */
export function slugParaUrl(slug: SlugCategoria): string {
  return URL_POR_SLUG[slug];
}
