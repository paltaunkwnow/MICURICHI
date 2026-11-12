/**
 * Núcleo de categoría del mapa público (ADR 0014, 0015, 0016). Funciones PURAS, sin React ni DOM, que
 * la web usa en tres momentos:
 *
 *  - la PREFERENCIA del dispositivo (`micurichi.mapa.categoria`): leerla y guardarla sin romperse con
 *    el almacenamiento ausente, bloqueado, lleno o con un valor corrupto o de otra versión;
 *  - la RESOLUCIÓN de la categoría inicial a partir de la URL, la preferencia y las activas, con la
 *    corrección de la URL (D1 del plan M4) y el anuncio para `aria-live`;
 *  - el REINICIO de los filtros del mapa al cambiar de categoría, mirando el alcance de cada
 *    `FiltroDef` de la definición nueva (ADR 0016), no una lista suelta;
 *  - lo que el MAPA necesita para trabajar por categoría (M4.3): los textos de pantalla desde la
 *    definición, el `placeholderData` que no mezcla categorías, la URL y los enlaces a `/reportar`
 *    con la categoría (D1) y el texto del anuncio para `aria-live`.
 *
 * La prioridad, la normalización de alias y la forma pública del slug viven en `contracts`
 * (`resolverCategoriaInicial`, `slugParaUrl`): acá solo se componen. Nada de esto viaja al servidor ni
 * guarda datos personales: en la URL y en el almacenamiento va únicamente el slug (regla 8 del plan).
 */

import type { QueryKey } from '@tanstack/react-query';
import type {
  AlcanceFiltro,
  DefinicionCategoriaCualquiera,
  GuardadaCategoria,
  RegistroCategorias,
  SlugCategoria,
  TextosCategoriaResueltos,
} from 'contracts';
import {
  DEFINICION_INUNDACION,
  normalizarSlugCategoria,
  resolverCategoriaInicial,
  slugParaUrl,
  textosDeCategoria,
} from 'contracts';
import { numeroConMiles } from './formato';

/** Parámetro de la categoría en la URL del mapa público (forma pública, con guion). */
export const PARAMETRO_CATEGORIA = 'categoria';

// ───────────────────────── Preferencia del dispositivo (ADR 0014) ─────────────────────────

/** Clave de la preferencia en `localStorage`. La fija la ADR 0014; ninguna otra pantalla la usa. */
export const CLAVE_PREFERENCIA_CATEGORIA = 'micurichi.mapa.categoria';

/** Versión del formato guardado. Un valor de otra versión se descarta como si no hubiera preferencia. */
export const VERSION_PREFERENCIA = 1;

/**
 * Lo único que se usa de `Storage`, para poder probar con un almacén falso. Se toma como parámetro
 * (ver `AvisoPuntoResuelto` y `correo-para-entrar`): así la función es pura y la escritura va por el
 * alias del almacén, nunca por la propiedad global encadenada que prohíbe `misReportes.test.ts`.
 */
export type AlmacenCategoria = Pick<Storage, 'getItem' | 'setItem'>;

/** El `localStorage` del navegador, o `null` si no hay (servidor) o el navegador lo bloquea. */
export function almacenDeCategoria(): AlmacenCategoria | null {
  try {
    // Safari en privado y los navegadores con almacenamiento bloqueado lanzan al tocar la propiedad.
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Lee la preferencia guardada, ya validada por versión: devuelve `{ v, slug }` solo si el JSON es un
 * objeto de la versión vigente con un `slug` de texto. Un almacén ausente o que lanza, un JSON
 * corrupto, otra versión o un `slug` que no es texto dan `null` (sin preferencia). NO comprueba si el
 * slug corresponde a una categoría conocida o activa: eso lo decide `resolverCategoriaInicial`.
 */
export function leerPreferenciaCategoria(
  almacen: AlmacenCategoria | null = almacenDeCategoria(),
): GuardadaCategoria | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(CLAVE_PREFERENCIA_CATEGORIA);
    if (!crudo) return null;
    const dato: unknown = JSON.parse(crudo);
    if (typeof dato !== 'object' || dato === null) return null;
    const { v, slug } = dato as { v?: unknown; slug?: unknown };
    if (v !== VERSION_PREFERENCIA) return null;
    if (typeof slug !== 'string') return null;
    return { v: VERSION_PREFERENCIA, slug };
  } catch {
    return null;
  }
}

/**
 * Guarda el slug como «última usada». No hace nada si no hay dónde guardar o si el almacén lanza
 * (cuota llena, navegación privada): se sigue sin preferencia, igual que antes de guardarla.
 */
export function guardarPreferenciaCategoria(
  slug: SlugCategoria,
  almacen: AlmacenCategoria | null = almacenDeCategoria(),
): void {
  if (!almacen) return;
  try {
    almacen.setItem(CLAVE_PREFERENCIA_CATEGORIA, JSON.stringify({ v: VERSION_PREFERENCIA, slug }));
  } catch {
    // Cuota llena o almacenamiento bloqueado: la próxima carga resolverá por URL o por defecto.
  }
}

// ──────────────────────── Resolución de la categoría inicial y la URL (D1) ────────────────────────

export interface EntradaResolucionUrl {
  /** La URL actual completa (`window.location.href`), absoluta. */
  href: string;
  /** Slugs activos en la instalación, en orden canónico (los filtra el contexto contra el registro). */
  activas: readonly SlugCategoria[];
  /** Preferencia del dispositivo, como la devuelve `leerPreferenciaCategoria` (o el slug suelto). */
  guardada?: string | GuardadaCategoria | null;
  /** El registro, para nombrar la categoría en el anuncio de `aria-live`. */
  registro: RegistroCategorias;
}

export interface ResultadoResolucionUrl {
  /** Categoría efectiva, siempre activa; `null` solo si no hay ninguna activa. */
  efectiva: SlugCategoria | null;
  /** La URL corregida (href absoluto) para `history.replaceState`, o `null` si no hay que tocarla. */
  urlNueva: string | null;
  /** Mensaje para `aria-live` cuando la URL traía una categoría inválida o inactiva; si no, `null`. */
  anuncio: string | null;
}

/**
 * Resuelve la categoría efectiva (prioridad de `resolverCategoriaInicial`: URL → guardada → defecto) y
 * decide qué hacer con el parámetro `categoria` de la URL, según D1 del plan M4:
 *
 *  - con UNA sola categoría activa, el parámetro no existe: si llegó, se quita (conservando el resto
 *    de la query y el `hash`);
 *  - con DOS o más activas, se normaliza a la forma pública de la efectiva y se agrega si faltaba;
 *  - una URL inválida o inactiva se ignora (la prioridad cae a la guardada o al defecto), se corrige y
 *    produce un anuncio para `aria-live` con el nombre de la categoría que sí se muestra.
 *
 * Es pura: no lee ni escribe la preferencia ni toca `history`. El efecto de cliente
 * (`useCategoriaEfectiva`) aplica `urlNueva`, guarda la efectiva y expone el anuncio.
 */
export function resolverCategoriaDeUrl({
  href,
  activas,
  guardada,
  registro,
}: EntradaResolucionUrl): ResultadoResolucionUrl {
  const url = new URL(href);
  const crudoUrl = url.searchParams.get(PARAMETRO_CATEGORIA);

  const resuelto = resolverCategoriaInicial({ url: crudoUrl, guardada, activas });
  const efectiva = resuelto.slug;

  // Anuncio: solo si la URL traía algo que no se pudo usar y hay una categoría que mostrar en su lugar.
  let anuncio: string | null = null;
  if ((resuelto.urlInvalida || resuelto.urlInactiva) && efectiva !== null) {
    const nombre = registro.obtener(efectiva)?.nombre ?? efectiva;
    anuncio = `Esa categoría no está disponible: mostrando ${nombre}`;
  }

  // Corrección del parámetro (D1). `href` ya incluye query y hash; `url.toString()` los conserva.
  let urlNueva: string | null = null;
  if (efectiva !== null && activas.length >= 2) {
    const publica = slugParaUrl(efectiva);
    if (crudoUrl !== publica) {
      url.searchParams.set(PARAMETRO_CATEGORIA, publica);
      urlNueva = url.toString();
    }
  } else if (crudoUrl !== null) {
    // Una sola activa (o ninguna): el parámetro no corresponde, se quita sin tocar nada más.
    url.searchParams.delete(PARAMETRO_CATEGORIA);
    urlNueva = url.toString();
  }

  return { efectiva, urlNueva, anuncio };
}

// ──────────────────────── Categorías activas contra el registro (CA2) ────────────────────────

/**
 * Activas que además están DEFINIDAS en el registro, en el orden canónico del registro. Es el «falla
 * cerrado» de la web: una categoría activa en el catálogo pero sin definición en `contracts` no existe
 * para la web (igual que para el servidor). El orden lo da `registro.slugs` (en producción, el orden
 * canónico de la plataforma; en las pruebas, el orden en que se inyectaron las definiciones).
 */
export function activasDelRegistro(
  activas: readonly SlugCategoria[],
  registro: RegistroCategorias,
): readonly SlugCategoria[] {
  const activasSet = new Set<string>(activas);
  return registro.slugs.filter((s): s is SlugCategoria => activasSet.has(s));
}

// ──────────────────────── Reinicio de filtros al cambiar de categoría (ADR 0016) ────────────────────────

/** Capa de fondo del mapa; misma unión que `VistaMapa`. Se conserva al cambiar de categoría. */
export type CapaVisible = 'auto' | 'distritos' | 'ninguna';

/**
 * Estado de los filtros del mapa que el cambio de categoría reinicia o conserva (ADR 0016). Modela los
 * campos de `VistaMapa` más la hoja de detalle y el panel de filtros que nombra la regla 6 del plan.
 * `VistaMapa.cambiarCategoria` arma uno con su estado, lo pasa por `reiniciarAlCambiarCategoria` y
 * aplica el resultado.
 */
export interface EstadoMapaCategoria {
  /** Alcance global: se conservan (la vista y la zona no dependen de la categoría). */
  bbox: string | null;
  distrito: { id: string; codigo: string; nombre: string } | null;
  unidadVecinal: { id: string; codigo: string } | null;
  capaVisible: CapaVisible;
  /** Filtro de dominio por categoría: se reinicia o se conserva según el `FiltroDef` de la definición. */
  severidad: string | null;
  /** Agrupación por categoría: siempre se reinicia (regla 6). */
  puntoCritico: string | null;
  /** Efímeros de interacción: se limpian (regla 6). */
  seleccionado: string | null;
  hojaAbierta: boolean;
  texto: string;
  busqueda: string;
  panelFiltrosAbierto: boolean;
}

/**
 * Reinicio por alcance (ADR 0016). Devuelve un estado nuevo donde:
 *
 *  - se CONSERVAN el encuadre (`bbox`), el distrito, la UV y la capa de fondo: su alcance es global, no
 *    cambian con la categoría;
 *  - se REINICIAN los filtros de dominio según el alcance que les da la definición NUEVA (mira
 *    `FiltroDef.alcance`, no una lista suelta): hoy el único es `severidad`, que se conserva solo si la
 *    definición lo marca `global` y si no se reinicia. El punto crítico se reinicia siempre (es una
 *    agrupación por categoría, no un `FiltroDef`);
 *  - se LIMPIAN la selección, la hoja de detalle, la búsqueda de texto y el panel de filtros.
 *
 * Una categoría futura con más filtros de dominio sumará sus campos a `EstadoMapaCategoria` y se
 * clasificarán igual por su `FiltroDef` (M6+).
 */
export function reiniciarAlCambiarCategoria(
  estado: EstadoMapaCategoria,
  definicionNueva: DefinicionCategoriaCualquiera,
): EstadoMapaCategoria {
  const alcancePorCampo = new Map<string, AlcanceFiltro>();
  for (const filtro of definicionNueva.filtros) alcancePorCampo.set(filtro.campo, filtro.alcance);
  const conservaSeveridad = alcancePorCampo.get('severidad') === 'global';

  return {
    // Se conservan (alcance global).
    bbox: estado.bbox,
    distrito: estado.distrito,
    unidadVecinal: estado.unidadVecinal,
    capaVisible: estado.capaVisible,
    // Filtro de dominio: según el alcance del FiltroDef de la definición nueva.
    severidad: conservaSeveridad ? estado.severidad : null,
    // Agrupación por categoría: siempre se reinicia.
    puntoCritico: null,
    // Efímeros: se limpian.
    seleccionado: null,
    hojaAbierta: false,
    texto: '',
    busqueda: '',
    panelFiltrosAbierto: false,
  };
}

// ───────────────────────── Textos de pantalla desde la definición (CA4, 0.21.0) ─────────────────────────

/**
 * Categoría de un reporte cuya respuesta no trae el campo `categoria` (una respuesta anterior a
 * 0.20.0, por ejemplo en la caché de la PWA). Es la misma que la API usa sin parámetro (ADR 0012).
 */
export const CATEGORIA_DE_REPORTE_SIN_CAMPO: SlugCategoria = 'inundacion';

/** La categoría de un reporte: la del servidor o, si falta, la de siempre (ADR 0012). */
export function categoriaDeReporte(p: { categoria?: string | undefined }): string {
  return p.categoria ?? CATEGORIA_DE_REPORTE_SIN_CAMPO;
}

/**
 * Textos de la categoría por defecto de la plataforma (ADR 0012). Es lo que se usa mientras la
 * categoría efectiva todavía no se resolvió (servidor e hidratación): con una sola categoría activa
 * es exactamente lo de siempre, así que el primer HTML no cambia.
 */
export const TEXTOS_CATEGORIA_POR_DEFECTO: TextosCategoriaResueltos =
  textosDeCategoria(DEFINICION_INUNDACION);

/**
 * Los textos de pantalla de una categoría, con todos los campos resueltos. Si el slug falta o no está
 * en el registro se usan los de la categoría por defecto: la web no inventa textos para una categoría
 * que no conoce.
 */
export function textosParaCategoria(
  registro: RegistroCategorias,
  slug: string | null | undefined,
): TextosCategoriaResueltos {
  const def = slug ? registro.obtener(slug) : undefined;
  return def ? textosDeCategoria(def) : TEXTOS_CATEGORIA_POR_DEFECTO;
}

// ───────────────────────── Consultas sin contaminación entre categorías (regla 2) ─────────────────────────

/** La categoría que lleva una clave `['reportes', { categoria, … }]`, o `undefined` si no la lleva. */
export function categoriaDeClaveDeReportes(clave: QueryKey | undefined): string | undefined {
  const filtros = clave?.[1];
  if (typeof filtros !== 'object' || filtros === null) return undefined;
  const categoria = (filtros as { categoria?: unknown }).categoria;
  return typeof categoria === 'string' ? categoria : undefined;
}

/**
 * `placeholderData` de la lista del mapa: conserva lo último bueno mientras llega la vista nueva
 * (mover el mapa no vacía la lista) pero SOLO si ese dato era de la misma categoría. Al cambiar de
 * categoría devuelve `undefined`: la lista y el mapa quedan en «buscando» hasta que llegan los datos
 * de la categoría nueva, y nunca se ve un punto de la anterior (13.1 §7, regla 2 del plan M4).
 *
 * Reemplaza a `keepPreviousData`, que conservaba el dato previo sea cual fuere su clave.
 */
export function conservarSoloDeLaMismaCategoria<T>(
  categoriaActual: string | null,
  datosPrevios: T | undefined,
  clavePrevia: QueryKey | undefined,
): T | undefined {
  if (datosPrevios === undefined || categoriaActual === null) return undefined;
  return categoriaDeClaveDeReportes(clavePrevia) === categoriaActual ? datosPrevios : undefined;
}

// ───────────────────────── URL y enlaces con la categoría (D1) ─────────────────────────

/**
 * La URL que corresponde después de que la persona ELIGE una categoría en el selector (D1 del plan M4):
 * con dos o más activas lleva `?categoria=` con la forma pública del slug; con una sola, el parámetro
 * no existe y se quita si estaba. Conserva el resto de la query y el `hash`. Devuelve `null` si la URL
 * ya está como corresponde. Pura: el llamador aplica el resultado con `history.replaceState`.
 */
export function urlTrasElegirCategoria(
  href: string,
  slug: SlugCategoria,
  cantidadActivas: number,
): string | null {
  const url = new URL(href);
  const actual = url.searchParams.get(PARAMETRO_CATEGORIA);
  if (cantidadActivas >= 2) {
    const publica = slugParaUrl(slug);
    if (actual === publica) return null;
    url.searchParams.set(PARAMETRO_CATEGORIA, publica);
    return url.toString();
  }
  if (actual === null) return null;
  url.searchParams.delete(PARAMETRO_CATEGORIA);
  return url.toString();
}

export interface EntradaHrefReportar {
  /** La categoría con la que arranca el reporte (cualquier forma de su slug); `null` si no hay. */
  categoria: string | null | undefined;
  /** Cuántas categorías hay activas. Con menos de dos, el enlace no lleva categoría (D1). */
  cantidadActivas: number;
  /** Punto de partida («Me pasa a mí»): se conserva tal cual. */
  lat?: number;
  lon?: number;
}

/**
 * El `href` de un enlace del mapa a `/reportar`. Con una sola categoría activa es exactamente
 * `/reportar` (o `/reportar?lat=…&lon=…`): nada cambia (D1). Con dos o más suma `categoria=` en su
 * forma pública, así el formulario arranca en la categoría que se estaba mirando.
 */
export function hrefReportar({
  categoria,
  cantidadActivas,
  lat,
  lon,
}: EntradaHrefReportar): string {
  const partes: string[] = [];
  if (lat !== undefined && lon !== undefined) partes.push(`lat=${lat}`, `lon=${lon}`);
  const slug = normalizarSlugCategoria(categoria);
  if (cantidadActivas >= 2 && slug !== null)
    partes.push(`${PARAMETRO_CATEGORIA}=${slugParaUrl(slug)}`);
  return partes.length ? `/reportar?${partes.join('&')}` : '/reportar';
}

// ───────────────────────── Anuncio para lectores de pantalla (doc 14 §2.4) ─────────────────────────

/** «Mostrando Baches: 12 puntos» (o «1 punto»): lo que se anuncia cuando llegan los datos de la categoría. */
export function textoAnuncioCategoria(nombre: string, n: number, locale: string): string {
  return `Mostrando ${nombre}: ${numeroConMiles(n, locale)} ${n === 1 ? 'punto' : 'puntos'}`;
}
