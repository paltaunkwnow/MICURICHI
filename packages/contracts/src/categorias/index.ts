/**
 * Registro de categorías (ADR 0009). Hoy una sola definición (Inundaciones); las demás se activan
 * por el roadmap M6–M8. La fábrica `crearRegistroCategorias` arma un registro a partir de una lista
 * de definiciones, para que una categoría nueva se sume con solo su archivo y una línea de registro,
 * sin tocar el núcleo (lo prueba la categoría sintética de contrato-0-19).
 */

import { DEFINICION_INUNDACION } from './inundacion/definicion.js';
import type { DefinicionCategoria } from './tipos.js';

export { DEFINICION_INUNDACION } from './inundacion/definicion.js';
export { type DetalleInundacion, DetalleInundacionSchema } from './inundacion/esquema.js';
export {
  type EntradaResolverCategoria,
  type GuardadaCategoria,
  type OrigenCategoria,
  type ResultadoCategoriaInicial,
  resolverCategoriaInicial,
} from './resolver.js';
export { normalizarSlugCategoria, SLUGS_CATEGORIA, slugParaUrl } from './slugs.js';
export {
  type TextosCategoria,
  type TextosCategoriaResueltos,
  textosDeCategoria,
} from './textos.js';
// Re-exportaciones públicas del paquete (salen por `src/index.ts`).
export type {
  AlcanceFiltro,
  AmbitoCupo,
  CampoExportacion,
  ColoresCategoria,
  DefinicionCategoria,
  FiltroDef,
  GeometriaCategoria,
  OpcionPregunta,
  Pregunta,
  ReglaCupo,
  SeveridadCategoria,
  SlugCategoria,
  TipoPregunta,
  VentanaCupo,
} from './tipos.js';

/**
 * Definición con el detalle type-borrado, para una colección heterogénea. El `any` del detalle es
 * inevitable: un registro mezcla categorías con detalles distintos y `unknown` no sirve porque `D`
 * aparece en posiciones de entrada (`esquemaDetalle`, `severidad.calcular`). El slug se afloja a
 * `string` para admitir una categoría nueva o sintética.
 */
// biome-ignore lint/suspicious/noExplicitAny: registro heterogéneo de categorías (tipo existencial)
export type DefinicionCategoriaCualquiera = DefinicionCategoria<any, string>;

export interface RegistroCategorias {
  readonly definiciones: readonly DefinicionCategoriaCualquiera[];
  /** Slugs registrados, en el orden en que se pasaron a la fábrica. */
  readonly slugs: readonly string[];
  /** La definición de un slug, o `undefined` si no está registrado. */
  obtener(slug: string): DefinicionCategoriaCualquiera | undefined;
  tiene(slug: string): boolean;
}

/** Arma un registro inmutable a partir de una lista de definiciones. Exige slugs únicos. */
export function crearRegistroCategorias(
  definiciones: readonly DefinicionCategoriaCualquiera[],
): RegistroCategorias {
  const porSlug = new Map<string, DefinicionCategoriaCualquiera>();
  for (const def of definiciones) {
    if (porSlug.has(def.slug)) throw new Error(`Categoría duplicada en el registro: ${def.slug}`);
    porSlug.set(def.slug, def);
  }
  return {
    definiciones,
    slugs: definiciones.map((d) => d.slug),
    obtener: (slug) => porSlug.get(slug),
    tiene: (slug) => porSlug.has(slug),
  };
}

/** Registro de la instalación: hoy solo Inundaciones (ADR 0009). */
export const REGISTRO_CATEGORIAS = crearRegistroCategorias([DEFINICION_INUNDACION]);

/**
 * Código de error de una categoría que no está disponible para la operación (0.20.0, ADR 0012): no
 * está en el registro o el catálogo la marca inactiva (regla 3: falta cualquiera de las dos → cuenta
 * como inactiva). Es decisión del SERVIDOR, no del contrato; el contrato no valida la actividad. El
 * estado HTTP depende de la ruta: `400` en las lecturas públicas (slug desconocido o inactivo) y en
 * las del panel con slug desconocido; `422` en `POST /api/v1/reportes` (sin gastar cupo). Vive junto
 * al registro, como `CODIGO_CAPA_CAMBIO` vive junto a las capas.
 */
export const CODIGO_CATEGORIA_NO_DISPONIBLE = 'CATEGORIA_NO_DISPONIBLE';
