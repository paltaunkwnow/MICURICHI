import { SEVERIDADES, type Severidad } from 'contracts';
import type { ParametrosConsulta } from './api';
import { FILTROS_VACIOS, serializarFiltros } from './filtros';
import { SEVERIDADES_ORDEN } from './formato';

/**
 * Lógica pura de las tortas (donas) de /indicadores: agrupación «top N + Otros», porcentajes que
 * suman 100, ángulos de cada porción y las URL que comparten los filtros con la bandeja. Sin React
 * ni red, para probarla sin navegador.
 *
 * Las tortas reemplazan a las barras de «proporción» viejas, que medían cada distrito contra el
 * mayor (el mayor daba 100 %) y nadie entendía. Acá el porcentaje es la parte del total dibujado y
 * la suma de todas las porciones da 100 %.
 */

/**
 * Paleta categórica validada (skill dataviz, orden fijo: azul, naranja, aqua, amarillo, magenta,
 * verde, violeta, rojo). Pasa las separaciones para daltonismo en el orden adyacente; como el color
 * no alcanza para 3:1 de contraste en aqua, amarillo y magenta sobre blanco, la identidad va SIEMPRE
 * en la leyenda (nombre + número + porcentaje) y en el nombre accesible, nunca solo en el color.
 */
export const PALETA_TORTA = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
] as const;

/** «Otros/Otras» no es una categoría: gris neutro (4,4:1 sobre blanco), nunca una ranura de color. */
export const COLOR_OTROS = '#6b7b8a';

/** Como mucho 8 porciones de color; con más categorías, la cola se junta en «Otros». */
export const MAX_PORCIONES = 8;

/** Identificador reservado de la porción «Otros»: no choca con ningún id de capa (`tipo:codigo`). */
export const ID_OTROS = '__otros__';

export interface ItemConteo {
  id: string;
  nombre: string;
  n: number;
}

export interface Porcion {
  id: string;
  nombre: string;
  n: number;
  /** Entero; la suma de todas las porciones da 100 (método del resto mayor). */
  porcentaje: number;
  /** Grados: 0 = arriba (12 h), en sentido horario. El arco usa la proporción exacta, no el entero. */
  gradoInicio: number;
  gradoFin: number;
  color: string;
  /** La porción «Otros»: agrupa la cola y no se puede seleccionar ni abrir. */
  esOtros: boolean;
}

/** Severidades en el orden canónico (crítica → baja), para URLs estables sin importar el orden de clic. */
export function ordenarSeveridades(severidades: readonly Severidad[]): Severidad[] {
  const elegidas = new Set(severidades);
  return SEVERIDADES_ORDEN.filter((s) => elegidas.has(s));
}

/** Items con reportes, de mayor a menor; desempata por nombre y después por id, para un orden estable. */
export function ordenarDesc(items: readonly ItemConteo[]): ItemConteo[] {
  return items
    .filter((x) => x.n > 0)
    .sort(
      (a, b) =>
        b.n - a.n ||
        a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * «Top `max` + Otros»: si hay más de `max` categorías con reportes, las de más allá del tope se
 * suman en una sola porción «Otros». Con `max` o menos, se muestran todas y no aparece «Otros».
 */
export function agruparConOtros(
  items: readonly ItemConteo[],
  max: number,
  etiquetaOtros: string,
): Array<ItemConteo & { esOtros: boolean }> {
  const orden = ordenarDesc(items);
  if (orden.length <= max) return orden.map((x) => ({ ...x, esOtros: false }));
  const cabeza = orden.slice(0, max).map((x) => ({ ...x, esOtros: false }));
  const colaN = orden.slice(max).reduce((s, x) => s + x.n, 0);
  if (colaN > 0) {
    cabeza.push({ id: ID_OTROS, nombre: etiquetaOtros, n: colaN, esOtros: true });
  }
  return cabeza;
}

/**
 * Porcentajes enteros que suman exactamente 100 (método del resto mayor / Hamilton): se reparte
 * cada unidad sobrante entre las categorías de mayor parte fraccional. Con total 0, todos 0.
 */
export function porcentajesEnteros(valores: readonly number[]): number[] {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return valores.map(() => 0);
  const exactos = valores.map((v) => (v / total) * 100);
  const pisos = exactos.map((v) => Math.floor(v));
  let sobrante = 100 - pisos.reduce((s, v) => s + v, 0);
  const porFraccion = exactos
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const res = [...pisos];
  for (let k = 0; sobrante > 0 && k < porFraccion.length; k++, sobrante--) {
    const idx = porFraccion[k]?.i;
    if (idx !== undefined) res[idx] = (res[idx] ?? 0) + 1;
  }
  return res;
}

/**
 * Porciones de una torta: agrupa en «top N + Otros», calcula los porcentajes que suman 100 y los
 * ángulos (con la proporción exacta, para que los arcos cierren el círculo aunque los enteros
 * redondeen). El color sale del orden; «Otros» siempre va en gris.
 */
export function calcularPorciones(
  items: readonly ItemConteo[],
  opciones: { max?: number; etiquetaOtros: string },
): Porcion[] {
  const max = opciones.max ?? MAX_PORCIONES;
  const agrupados = agruparConOtros(items, max, opciones.etiquetaOtros);
  const total = agrupados.reduce((s, x) => s + x.n, 0);
  const porcentajes = porcentajesEnteros(agrupados.map((x) => x.n));
  let grado = 0;
  return agrupados.map((x, i) => {
    const gradoInicio = grado;
    const gradoFin = total > 0 ? gradoInicio + (x.n / total) * 360 : gradoInicio;
    grado = gradoFin;
    return {
      id: x.id,
      nombre: x.nombre,
      n: x.n,
      porcentaje: porcentajes[i] ?? 0,
      gradoInicio,
      gradoFin,
      color: x.esOtros ? COLOR_OTROS : (PALETA_TORTA[i] ?? COLOR_OTROS),
      esOtros: x.esOtros,
    };
  });
}

/** Suma de reportes de una lista de porciones: el número grande del centro de la dona. */
export function totalPorciones(porciones: readonly Porcion[]): number {
  return porciones.reduce((s, p) => s + p.n, 0);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function punto(cx: number, cy: number, r: number, grado: number): { x: number; y: number } {
  const rad = ((grado - 90) * Math.PI) / 180;
  return { x: r2(cx + r * Math.cos(rad)), y: r2(cy + r * Math.sin(rad)) };
}

/**
 * Camino SVG de una porción de dona (sector anular) entre dos ángulos. El caso de una sola porción
 * que cubre todo el círculo (un único distrito con reportes) se dibuja como anillo completo, porque
 * un arco cuyo inicio y fin coinciden no pinta nada.
 */
export function caminoDona(
  cx: number,
  cy: number,
  rExterno: number,
  rInterno: number,
  gradoInicio: number,
  gradoFin: number,
): string {
  const barrido = gradoFin - gradoInicio;
  if (barrido >= 360 - 0.001) {
    return [
      `M ${r2(cx)} ${r2(cy - rExterno)}`,
      `A ${rExterno} ${rExterno} 0 1 1 ${r2(cx)} ${r2(cy + rExterno)}`,
      `A ${rExterno} ${rExterno} 0 1 1 ${r2(cx)} ${r2(cy - rExterno)}`,
      'Z',
      `M ${r2(cx)} ${r2(cy - rInterno)}`,
      `A ${rInterno} ${rInterno} 0 1 0 ${r2(cx)} ${r2(cy + rInterno)}`,
      `A ${rInterno} ${rInterno} 0 1 0 ${r2(cx)} ${r2(cy - rInterno)}`,
      'Z',
    ].join(' ');
  }
  const arcoGrande = barrido > 180 ? 1 : 0;
  const ei = punto(cx, cy, rExterno, gradoInicio);
  const ef = punto(cx, cy, rExterno, gradoFin);
  const ii = punto(cx, cy, rInterno, gradoInicio);
  const iff = punto(cx, cy, rInterno, gradoFin);
  return [
    `M ${ei.x} ${ei.y}`,
    `A ${rExterno} ${rExterno} 0 ${arcoGrande} 1 ${ef.x} ${ef.y}`,
    `L ${iff.x} ${iff.y}`,
    `A ${rInterno} ${rInterno} 0 ${arcoGrande} 0 ${ii.x} ${ii.y}`,
    'Z',
  ].join(' ');
}

/** Parámetros para `GET /api/v1/indicadores` (0.16.0): severidad (lista) y, opcional, distrito. */
export function paramsIndicadores(
  severidades: readonly Severidad[],
  distrito?: string,
): ParametrosConsulta {
  const ordenadas = ordenarSeveridades(severidades);
  return {
    severidad: ordenadas.length ? ordenadas.join(',') : undefined,
    distrito_id: distrito || undefined,
  };
}

/**
 * URL de la bandeja filtrada por una unidad vecinal y las severidades elegidas. Usa los nombres de
 * parámetro de `lib/filtros.ts` (`unidad_vecinal_id`, `severidad`) para que la bandeja los lea tal
 * cual, y `serializarFiltros` para no repetir el orden de los parámetros.
 */
export function urlBandejaUv(unidadVecinalId: string, severidades: readonly Severidad[]): string {
  const q = serializarFiltros({
    ...FILTROS_VACIOS,
    unidad_vecinal_id: unidadVecinalId,
    severidad: ordenarSeveridades(severidades),
  }).toString();
  return q ? `/reportes?${q}` : '/reportes';
}

export interface EstadoTorta {
  severidades: Severidad[];
  /** Distrito elegido para acotar la torta de UV; '' = toda la ciudad. */
  distrito: string;
}

const SEVERIDADES_VALIDAS = new Set<string>(SEVERIDADES);

/** Lee el estado de /indicadores desde la URL (`?severidad=…&distrito=…`), descartando lo inválido. */
export function leerEstadoTorta(sp: URLSearchParams): EstadoTorta {
  const crudo = sp.get('severidad');
  const vistas = new Set<Severidad>();
  if (crudo) {
    for (const parte of crudo.split(',')) {
      const v = parte.trim();
      if (SEVERIDADES_VALIDAS.has(v)) vistas.add(v as Severidad);
    }
  }
  return {
    severidades: ordenarSeveridades([...vistas]),
    distrito: sp.get('distrito')?.trim() ?? '',
  };
}

/** Serializa el estado a la URL; solo lo que tiene valor, y la severidad en orden canónico. */
export function serializarEstadoTorta(estado: EstadoTorta): URLSearchParams {
  const sp = new URLSearchParams();
  const ordenadas = ordenarSeveridades(estado.severidades);
  if (ordenadas.length) sp.set('severidad', ordenadas.join(','));
  if (estado.distrito) sp.set('distrito', estado.distrito);
  return sp;
}
