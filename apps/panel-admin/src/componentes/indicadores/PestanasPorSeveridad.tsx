'use client';

import type { Severidad } from 'contracts';
import { ChipSeveridad } from '@/componentes/ChipSeveridad';
import {
  type ConteosPestanas,
  conteoDePestana,
  PESTANAS_SEVERIDAD,
  type PestanaSeveridad,
  pestanaPresionada,
} from '@/lib/indicadores-pestanas';

/**
 * «Por severidad» de /indicadores: «Todo» y las cuatro severidades, cada una con su número. Son
 * botones nativos con `aria-pressed` dentro de un grupo con nombre (Tab y Enter/Espacio); la
 * severidad lleva color + texto + barras (`ChipSeveridad`), nunca solo color (CLAUDE.md §14.1).
 *
 * No son pestañas WAI-ARIA: no hay un panel distinto por pestaña, cambia el filtro de toda la
 * pantalla. Reflejan la misma URL que la fila «Filtrar por severidad» (selección múltiple): con dos
 * severidades elegidas arriba, las dos quedan presionadas y «Todo» no. Los números son los de los
 * indicadores sin filtro de severidad, así que no cambian al tocar un botón.
 */

const ID_AYUDA = 'ayuda-por-severidad';

/** «Todo» no es una severidad: pastilla neutra del mismo tamaño que las otras, para que alineen. */
function EtiquetaTodo() {
  return (
    <span
      className="sev"
      style={{ background: 'var(--color-tinta-100)', color: 'var(--color-tinta-900)' }}
    >
      Todo
    </span>
  );
}

export function PestanasPorSeveridad({
  seleccionadas,
  conteos,
  onElegir,
}: {
  /** Severidades elegidas en la URL; vacío = «Todo». */
  seleccionadas: readonly Severidad[];
  /** Indicadores SIN filtro de severidad; `null` mientras no llegan. */
  conteos: ConteosPestanas | null;
  onElegir: (pestana: PestanaSeveridad) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="titular text-2xl">Por severidad</h2>
      <p id={ID_AYUDA} className="text-[15px] text-tinta-600">
        Tocá una severidad para ver los gráficos solo de esa; «Todo» vuelve a todas.
      </p>
      {/* <fieldset> es el grupo (rol implícito) y su <legend> el nombre; el título visible ya está arriba. */}
      <fieldset
        aria-describedby={ID_AYUDA}
        className="m-0 min-w-0 border-0 p-0"
        data-testid="indicadores-pestanas-severidad"
      >
        <legend className="sr-only">Ver por severidad</legend>
        <div className="flex flex-wrap gap-3">
          {PESTANAS_SEVERIDAD.map((pestana) => {
            const n = conteoDePestana(conteos, pestana);
            return (
              <button
                key={pestana}
                type="button"
                className="pestana-sev"
                aria-pressed={pestanaPresionada(seleccionadas, pestana)}
                data-testid={`indicadores-pestana-${pestana}`}
                onClick={() => onElegir(pestana)}
              >
                {pestana === 'todas' ? <EtiquetaTodo /> : <ChipSeveridad severidad={pestana} />}
                <span className="titular text-2xl" data-testid={`indicadores-pestana-${pestana}-n`}>
                  {n ?? '—'}
                </span>
                {/* Para el lector de pantalla el número no es suelto: «Crítica 10 reportes». */}
                <span className="sr-only">
                  {n === null ? ' (cargando)' : ` ${n === 1 ? 'reporte' : 'reportes'}`}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
