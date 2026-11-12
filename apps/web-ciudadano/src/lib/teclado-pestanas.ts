/**
 * Navegación con el teclado de un `role="tablist"` (patrón de pestañas de WAI-ARIA, doc 14 §2.4):
 * flechas izquierda y derecha mueven a la pestaña de al lado —dando la vuelta en los extremos—, Inicio
 * va a la primera y Fin a la última. Es pura para probarla sin DOM; el selector de categoría solo la
 * llama y mueve el foco.
 */

/** Índice al que lleva `tecla` desde `indice` en una lista de `total` pestañas; `null` si no es de las nuestras. */
export function indiceTrasTecla(tecla: string, indice: number, total: number): number | null {
  if (total <= 0) return null;
  switch (tecla) {
    case 'ArrowRight':
      return (indice + 1) % total;
    case 'ArrowLeft':
      return (indice - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

/** Lo mismo, pero devolviendo la pestaña de destino y su posición; `null` si la tecla no mueve nada. */
export function destinoTrasTecla<T>(
  tecla: string,
  indice: number,
  pestanas: readonly T[],
): { indice: number; pestana: T } | null {
  const destino = indiceTrasTecla(tecla, indice, pestanas.length);
  if (destino === null) return null;
  const pestana = pestanas[destino];
  return pestana === undefined ? null : { indice: destino, pestana };
}
