import { type KeyboardEvent, type RefObject, useEffect, useRef } from 'react';

/**
 * Foco y teclado de un diálogo modal (WAI-ARIA, patrón «Dialog (Modal)»; CLAUDE.md §14.1): al
 * abrir, el foco entra al diálogo; Tab y Mayús+Tab no lo dejan salir; Escape lo cierra; al
 * cerrar, el foco vuelve a quien lo abrió. Lo que decide el teclado es lógica pura (probada sin
 * navegador); el hook solo la conecta con el DOM.
 */

/** Lo que recibe el foco con Tab dentro del diálogo. */
const SELECTOR_ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export type AccionDeTeclado =
  /** Escape: cerrar el diálogo. */
  | { tipo: 'cerrar' }
  /** Tab desde un borde: llevar el foco al control `indice`, en vez de dejarlo salir. */
  | { tipo: 'enfocar'; indice: number }
  /** Tab sin ningún control adentro: el foco se queda donde está. */
  | { tipo: 'retener' }
  /** Todo lo demás es del control que tiene el foco (o lo mueve el navegador, hacia adentro). */
  | { tipo: 'ninguna' };

/**
 * Qué hace el teclado dentro del diálogo. `actual` es la posición del elemento con foco entre los
 * `total` controles enfocables del diálogo, o `-1` si el foco está en el propio diálogo o afuera.
 */
export function accionDeTeclado(
  e: { key: string; shiftKey: boolean },
  actual: number,
  total: number,
): AccionDeTeclado {
  if (e.key === 'Escape') return { tipo: 'cerrar' };
  if (e.key !== 'Tab') return { tipo: 'ninguna' };
  if (total === 0) return { tipo: 'retener' };
  const ultimo = total - 1;
  if (actual === -1) return { tipo: 'enfocar', indice: e.shiftKey ? ultimo : 0 };
  if (e.shiftKey && actual === 0) return { tipo: 'enfocar', indice: ultimo };
  if (!e.shiftKey && actual === ultimo) return { tipo: 'enfocar', indice: 0 };
  return { tipo: 'ninguna' };
}

/** Lo único que se le pide a un elemento para dar y recibir el foco. */
export interface ConFoco {
  focus(): void;
}

/**
 * Mete el foco en el diálogo y devuelve la función que lo devuelve al cerrar. A quién se mira al
 * cerrar, no al abrir: si el botón se volvió a dibujar mientras tanto, el foco va al nuevo.
 */
export function entrarAlDialogo(
  dialogo: ConFoco | null,
  aQuienDevolver: () => ConFoco | null,
): () => void {
  dialogo?.focus();
  return () => aQuienDevolver()?.focus();
}

/**
 * Conecta un diálogo modal con el DOM: `dialogo` va en el elemento con `role="dialog"` (que tiene
 * que llevar `tabIndex={-1}`: ahí cae el foco al abrir, y desde ahí Tab llega al primer control) y
 * `alTeclear` en su `onKeyDown`.
 *
 * `retorno` es el botón que lo abre. Sin él, el foco vuelve a lo que lo tenía al abrir; pero
 * Safari no enfoca los botones al tocarlos, y entonces no habría adónde volver.
 */
export function useDialogoModal({
  onCerrar,
  retorno,
}: {
  onCerrar: () => void;
  retorno?: RefObject<HTMLElement | null>;
}) {
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const teniaElFoco =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return entrarAlDialogo(dialogo.current, () => retorno?.current ?? teniaElFoco);
  }, [retorno]);

  function alTeclear(e: KeyboardEvent<HTMLElement>) {
    const raiz = dialogo.current;
    if (!raiz) return;
    const enfocables = [...raiz.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES)];
    const activo = document.activeElement;
    const actual = activo instanceof HTMLElement ? enfocables.indexOf(activo) : -1;
    const accion = accionDeTeclado(e, actual, enfocables.length);
    switch (accion.tipo) {
      case 'cerrar':
        e.preventDefault();
        e.stopPropagation();
        onCerrar();
        return;
      case 'enfocar':
        e.preventDefault();
        enfocables[accion.indice]?.focus();
        return;
      case 'retener':
        e.preventDefault();
        return;
      case 'ninguna':
        return;
    }
  }

  return { dialogo, alTeclear };
}
