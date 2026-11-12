import { type LucideIcon, MapPin, TrafficCone, Trash2, Trees, Waves } from 'lucide-react';

/**
 * El icono de cada categoría (ADR 0022). La definición de `contracts` guarda solo el NOMBRE del icono
 * (una cadena: el paquete no importa React), así que la app lo resuelve a su componente de
 * `lucide-react`. Una categoría nueva suma su línea acá; mientras no esté, usa el respaldo.
 */
const ICONOS: Record<string, LucideIcon> = { Waves, TrafficCone, Trees, Trash2 };

/** El componente del icono por su nombre; un nombre desconocido cae al pin de mapa, nunca a nada. */
export function iconoDeCategoria(nombre: string): LucideIcon {
  return ICONOS[nombre] ?? MapPin;
}
