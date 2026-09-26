'use client';

import { type KeyboardEvent, useRef } from 'react';
import { useFormato } from '@/lib/ciudad-contexto';
import {
  colorPrincipal,
  type DefinicionPestana,
  PESTANAS,
  type PestanaEjecutiva,
} from '@/lib/ejecutivo';

/** Cuántas de las cuatro barritas se llenan: la forma que acompaña al color (CLAUDE.md §14.4). */
const BARRAS: Record<PestanaEjecutiva, number> = { critica: 4, media: 2, baja: 1, todas: 0 };

function Forma({ pestana }: { pestana: PestanaEjecutiva }) {
  const llenas = BARRAS[pestana];
  if (!llenas) return null;
  const color = colorPrincipal(pestana);
  return (
    <span className="barras flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} style={{ background: i <= llenas ? color : '#d7dfda' }} />
      ))}
    </span>
  );
}

/**
 * Pestañas de severidad del panel ejecutivo: patrón WAI-ARIA de pestañas con activación
 * automática (flechas, Inicio y Fin mueven el foco y seleccionan).
 */
export function PestanasSeveridad({
  conteos,
  activa,
  onCambiar,
  idPanel,
}: {
  conteos: Record<PestanaEjecutiva, number>;
  activa: PestanaEjecutiva;
  onCambiar: (p: PestanaEjecutiva) => void;
  idPanel: string;
}) {
  const { numero } = useFormato();
  const botones = useRef<Array<HTMLButtonElement | null>>([]);

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const actual = PESTANAS.findIndex((p) => p.id === activa);
    let siguiente = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') siguiente = (actual + 1) % PESTANAS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      siguiente = (actual - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === 'Home') siguiente = 0;
    else if (e.key === 'End') siguiente = PESTANAS.length - 1;
    if (siguiente < 0) return;
    e.preventDefault();
    const destino = PESTANAS[siguiente] as DefinicionPestana;
    onCambiar(destino.id);
    botones.current[siguiente]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Filtrar por severidad"
      className="pestanas-ej"
      onKeyDown={alTeclear}
    >
      {PESTANAS.map((p, i) => {
        const seleccionada = p.id === activa;
        return (
          <button
            key={p.id}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`pestana-ej-${p.id}`}
            aria-selected={seleccionada}
            aria-controls={idPanel}
            tabIndex={seleccionada ? 0 : -1}
            title={p.descripcion}
            className="pestana-ej"
            data-testid={`ejecutivo-pestana-${p.id}`}
            onClick={() => onCambiar(p.id)}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Forma pestana={p.id} />
              {p.etiqueta}
              {p.id === 'critica' ? <span className="sr-only"> (crítica y alta)</span> : null}
            </span>
            <span className="n tabular-nums">{numero(conteos[p.id])}</span>
          </button>
        );
      })}
    </div>
  );
}
