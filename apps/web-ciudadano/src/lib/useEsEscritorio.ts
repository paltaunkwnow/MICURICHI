'use client';

import { useSyncExternalStore } from 'react';

/** El mismo corte que usa el kit (`md` de Tailwind). */
const CONSULTA = '(min-width: 768px)';

function suscribir(avisar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener('change', avisar);
  return () => mq.removeEventListener('change', avisar);
}

/**
 * Tamaño de pantalla para decidir qué se MONTA, no qué se ve: lo que se ve lo resuelve el CSS.
 *
 * Sirve para lo caro. La portada trae las dos variantes en el marcado —la de escritorio y las
 * láminas del celular— y el CSS oculta una; si la oculta fuera la de escritorio, su mapa se
 * inicializaría igual en un contenedor de tamaño cero: MapLibre descargado, peticiones hechas y
 * nada dibujado. Con esto el mapa solo se monta donde de verdad se ve.
 *
 * En el servidor devuelve `false`: si acierta, el celular no monta nada de más; si no, el mapa
 * aparece al hidratar, que es exactamente lo que hace un componente diferido.
 */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
