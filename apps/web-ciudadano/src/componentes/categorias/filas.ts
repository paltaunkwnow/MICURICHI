/**
 * Las filas del detalle de una categoría armadas desde su definición (presentador genérico, ADR 0021).
 * Pura: sin React, para probarla con una definición sintética.
 *
 * Por cada campo de `camposPublicos` toma la `etiqueta` de la pregunta que lo declara y, para el valor
 * guardado en el `detalle`, la `etiqueta` de la opción que lo representa. Un campo sin pregunta usa su
 * clave como rótulo y un valor sin opción conocida se muestra tal cual: ninguna fila inventa texto.
 * Los campos ausentes o vacíos en el detalle no producen fila.
 */
import type { DefinicionCategoriaCualquiera, Pregunta } from 'contracts';

export interface FilaDetalle {
  clave: string;
  etiqueta: string;
  valor: string;
}

function textoDelValor(pregunta: Pregunta | undefined, valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const deOpcion = (v: unknown) =>
    pregunta?.opciones?.find((o) => o.valor === v)?.etiqueta ?? String(v);
  if (Array.isArray(valor)) {
    const textos = valor.map(deOpcion);
    return textos.length ? textos.join(', ') : null;
  }
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  return deOpcion(valor);
}

export function filasDeDetalle(
  definicion: DefinicionCategoriaCualquiera | undefined,
  detalle: Record<string, unknown> | undefined,
): FilaDetalle[] {
  if (!definicion || !detalle) return [];
  const filas: FilaDetalle[] = [];
  for (const clave of definicion.camposPublicos) {
    const pregunta = definicion.preguntas.find((p) => p.id === clave);
    const valor = textoDelValor(pregunta, detalle[clave]);
    if (valor !== null) filas.push({ clave, etiqueta: pregunta?.etiqueta ?? clave, valor });
  }
  return filas;
}
