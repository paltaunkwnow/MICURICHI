'use client';

import dynamic from 'next/dynamic';
import type { PropsMapa } from './Mapa';

/**
 * MapLibre se carga diferido y solo en el navegador (CLAUDE.md §14.2): el contenido crítico
 * llega primero y el mapa después. Todo consumidor del mapa debe importar este componente.
 */
export const MapaDiferido = dynamic<PropsMapa>(() => import('./Mapa').then((m) => m.Mapa), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 flex items-center justify-center bg-tinta-900 text-white"
      aria-busy="true"
    >
      Cargando el mapa…
    </div>
  ),
});
