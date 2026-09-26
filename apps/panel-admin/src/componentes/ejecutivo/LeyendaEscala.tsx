import { COLOR_SIN_REPORTES, type PasoEscala, textoRango } from '@/lib/ejecutivo';

/** Rangos de la coropleta. El cero va siempre aparte: «sin reportes» no es «pocos». */
export function LeyendaEscala({ escala, titulo }: { escala: PasoEscala[]; titulo: string }) {
  return (
    <div className="mt-3">
      <p className="text-[13.5px] font-semibold text-tinta-600">{titulo}</p>
      <ul
        className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2 text-[15px]"
        data-testid="ejecutivo-leyenda"
      >
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-6 rounded border border-filete"
            style={{ background: COLOR_SIN_REPORTES }}
            aria-hidden="true"
          />
          Sin reportes
        </li>
        {escala.map((p) => (
          <li key={p.desde} className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-6 rounded border border-tinta-300"
              style={{ background: p.color }}
              aria-hidden="true"
            />
            {textoRango(p)}
          </li>
        ))}
      </ul>
    </div>
  );
}
