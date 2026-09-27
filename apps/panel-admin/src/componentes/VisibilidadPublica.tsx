import type { EstadoReporte } from 'contracts';
import { Eye, EyeOff } from 'lucide-react';
import { visibilidadPublica } from '@/lib/publicacion';

/** Línea del detalle técnico que dice si el reporte se ve en el mapa público y cómo. */
export function VisibilidadPublica({ estado }: { estado: EstadoReporte }) {
  const v = visibilidadPublica(estado);
  const Icono = v.publico ? Eye : EyeOff;
  return (
    <p
      className="inline-flex items-center gap-2 font-semibold text-tinta-800"
      data-testid="visibilidad-publica"
    >
      <Icono size={18} aria-hidden="true" />
      {v.texto}
    </p>
  );
}
