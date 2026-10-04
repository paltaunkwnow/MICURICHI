import {
  BANDAS,
  calcularSeveridad,
  FRECUENCIAS,
  PESOS,
  PROFUNDIDADES,
  type Profundidad,
  PUNTOS,
  type Severidad,
} from 'contracts';

/**
 * Lo que el panel cuenta de la matriz de severidad (CLAUDE.md §9.1), siempre sacado de
 * `contracts`. Los pesos, los puntos y las bandas son parámetros a validar con el técnico
 * municipal y pueden cambiar de versión: escribir sus cifras a mano en una pantalla es lo que dejó
 * a la ficha con dos puntajes máximos distintos, uno en el .txt y otro en la vista imprimible.
 */

/** Puntos de la respuesta más alta de cada variable. */
export const MAX_PROFUNDIDAD = Math.max(...Object.values(PUNTOS.profundidad));
export const MAX_FRECUENCIA = Math.max(...Object.values(PUNTOS.frecuencia));

/** Puntaje máximo de la fórmula: la respuesta más extrema de las dos variables, con sus pesos. */
export const PUNTAJE_MAXIMO =
  PESOS.profundidad * MAX_PROFUNDIDAD + PESOS.frecuencia * MAX_FRECUENCIA;

/** «6 de <máximo> puntos». */
export function textoPuntaje(puntaje: number): string {
  return `${puntaje} de ${PUNTAJE_MAXIMO} puntos`;
}

/** «puntaje = 2 × profundidad + frecuencia»: el peso 1 no se escribe. */
export function formulaPuntaje(): string {
  const termino = (peso: number, nombre: string) => (peso === 1 ? nombre : `${peso} × ${nombre}`);
  return `puntaje = ${termino(PESOS.profundidad, 'profundidad')} + ${termino(PESOS.frecuencia, 'frecuencia')}`;
}

export interface BandaConRango {
  banda: Severidad;
  min: number;
  max: number;
}

export interface RangoPuntaje {
  min: number;
  max: number;
  /** Las bandas de contracts que junta el grupo, de menor a mayor puntaje. */
  bandas: BandaConRango[];
}

/**
 * Puntajes que caen en un grupo de severidades, según `BANDAS`. Un grupo puede juntar varias
 * bandas (la pestaña «Crítica» del ejecutivo suma alta y crítica): el rango va de la más baja a la
 * más alta y `bandas` dice cómo se reparte.
 */
export function rangoPuntaje(severidades: readonly Severidad[]): RangoPuntaje {
  const bandas = BANDAS.filter((b) => severidades.includes(b.banda)).map(({ banda, min, max }) => ({
    banda,
    min,
    max,
  }));
  if (bandas.length === 0) {
    throw new Error(`Ninguna banda de contracts para: ${severidades.join(', ') || '(vacío)'}`);
  }
  return {
    min: Math.min(...bandas.map((b) => b.min)),
    max: Math.max(...bandas.map((b) => b.max)),
    bandas,
  };
}

/** «8 a 13», como en la tabla de bandas de la app pública. */
export function textoRango(r: Pick<RangoPuntaje, 'min' | 'max'>): string {
  return `${r.min} a ${r.max}`;
}

/**
 * Profundidades que dan severidad crítica con cualquier frecuencia: la regla de escalamiento E1
 * de `calcularSeveridad`, vista desde afuera. Se pregunta a la función en vez de repetir su
 * condición, para que el texto de la pantalla no pueda contradecirla.
 */
export function profundidadesSiempreCriticas(): Profundidad[] {
  return PROFUNDIDADES.filter((profundidad_estimada) =>
    FRECUENCIAS.every(
      (frecuencia) => calcularSeveridad({ profundidad_estimada, frecuencia }).banda === 'critica',
    ),
  );
}
