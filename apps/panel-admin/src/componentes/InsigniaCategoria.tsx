import { REGISTRO_CATEGORIAS, type RegistroCategorias } from 'contracts';
import { type LucideIcon, MapPin, TrafficCone, Trash2, Trees, Waves } from 'lucide-react';

const ICONOS: Record<string, LucideIcon> = { Waves, TrafficCone, Trash2, Trees };
export function IconoCategoria({ nombre }: { nombre: string }) {
  const Icono = ICONOS[nombre] ?? MapPin;
  return <Icono size={18} aria-hidden="true" />;
}
export function InsigniaCategoria({
  categoria,
  registro = REGISTRO_CATEGORIAS,
}: {
  categoria: string;
  registro?: RegistroCategorias;
}) {
  const def = registro.obtener(categoria);
  return (
    <span
      className="inline-flex items-center gap-2 font-semibold"
      style={def ? { color: def.colores.c7 } : undefined}
    >
      <IconoCategoria nombre={def?.icono ?? ''} />
      {def?.nombre ?? `Categoría: ${categoria}`}
    </span>
  );
}
