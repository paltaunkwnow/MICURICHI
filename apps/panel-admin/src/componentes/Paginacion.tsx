import { ChevronLeft, ChevronRight } from 'lucide-react';
import { numero } from '@/lib/formato';

export function Paginacion({
  pagina,
  limite,
  total,
  onCambiar,
}: {
  pagina: number;
  limite: number;
  total: number;
  onCambiar: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / limite));
  const desde = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const hasta = Math.min(total, pagina * limite);
  return (
    <nav
      aria-label="Paginación de la tabla"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-tinta-600">
        {total === 0
          ? 'Sin resultados'
          : `Mostrando ${numero(desde)}–${numero(hasta)} de ${numero(total)} reportes`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secundario"
          onClick={() => onCambiar(pagina - 1)}
          disabled={pagina <= 1}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          Anterior
        </button>
        <span className="px-2 text-tinta-600" aria-current="page">
          Página {numero(pagina)} de {numero(paginas)}
        </span>
        <button
          type="button"
          className="btn btn-secundario"
          onClick={() => onCambiar(pagina + 1)}
          disabled={pagina >= paginas}
        >
          Siguiente
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
