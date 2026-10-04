'use client';

import type { Severidad } from 'contracts';
import { colorSeveridad, etiquetaSeveridad, SEVERIDADES_ORDEN } from '@/lib/formato';

/**
 * Fichas de filtro por severidad de /indicadores (crítica → baja). Selección múltiple: ninguna
 * marcada = todas (el filtro no se manda y los conteos salen del total). Cada ficha lleva color +
 * texto + forma (las cuatro barritas, CLAUDE.md §14.1), nunca solo color, y el estado va en
 * `aria-pressed`, no en el color. Botones nativos: teclado con Tab y Enter/Espacio.
 */

/** Las cuatro barritas que acompañan al color: cuántas se llenan es la forma de cada severidad. */
function Barras({ severidad }: { severidad: Severidad }) {
  const { relleno, barras } = colorSeveridad(severidad);
  return (
    <span className="barras flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} style={{ background: i <= barras ? relleno : '#d7dfda' }} />
      ))}
    </span>
  );
}

export function FiltroSeveridad({
  seleccionadas,
  onAlternar,
}: {
  seleccionadas: readonly Severidad[];
  onAlternar: (s: Severidad) => void;
}) {
  const elegidas = new Set(seleccionadas);
  return (
    <fieldset className="m-0 border-0 p-0" data-testid="indicadores-filtro-severidad">
      <legend className="mb-2 font-semibold">Filtrar por severidad</legend>
      <p className="mb-2 text-[13.5px] text-tinta-600">
        {elegidas.size === 0
          ? 'Sin filtro: se cuentan todas las severidades.'
          : 'Las tortas y los conteos muestran solo las severidades elegidas.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {SEVERIDADES_ORDEN.map((s) => (
          <button
            key={s}
            type="button"
            name="severidad"
            value={s}
            className="chip"
            aria-pressed={elegidas.has(s)}
            onClick={() => onAlternar(s)}
          >
            <span
              className="punto"
              style={{ background: colorSeveridad(s).relleno }}
              aria-hidden="true"
            />
            {etiquetaSeveridad(s)}
            <Barras severidad={s} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
