import {
  Check,
  CircleQuestionMark,
  type LucideIcon,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type TonoAviso = 'info' | 'ok' | 'alerta' | 'err' | 'tinta';

const ICONO: Record<TonoAviso, LucideIcon | null> = {
  info: CircleQuestionMark,
  ok: Check,
  alerta: TriangleAlert,
  err: TriangleAlert,
  tinta: null,
};

/**
 * Bloque de aviso del prototipo (`.av`). El tono `tinta` es el bloque oscuro de las notas
 * metodológicas, que va sin ícono y ocupa el ancho completo.
 */
export function Aviso({
  tono = 'info',
  children,
  icono,
  className = '',
  ...resto
}: {
  tono?: TonoAviso;
  children: ReactNode;
  icono?: LucideIcon | null;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>) {
  const Icono = icono === undefined ? ICONO[tono] : icono;
  return (
    <div className={`av av-${tono} ${className}`} {...resto}>
      {Icono ? <Icono size={17} aria-hidden="true" /> : null}
      <span>{children}</span>
    </div>
  );
}

export const IconoEscudo = ShieldCheck;
