/**
 * Limpieza de los conteos que el mapa pinta por unidad vecinal y distrito cuando cambia la serie de
 * datos (la categoría, ADR 0013 y 0016, regla 2 del plan M4).
 *
 * Los conteos y la gravedad por UV viajan por `feature-state` (`componentes/Mapa.tsx`,
 * `actualizarConteos`), que solo escribe cuando llegan agregados con filas. Al cambiar de categoría la
 * consulta nueva todavía no tiene datos, el mapa recibe una lista vacía, y sin esta limpieza el relleno
 * de la categoría ANTERIOR seguiría pintado hasta que llegue la respuesta. Va aparte de `Mapa.tsx` para
 * poder probarla con un mapa falso, sin MapLibre.
 */
import type { CapaInfo } from 'contracts';

/** Lo mínimo del mapa de MapLibre que usa la limpieza. */
export interface MapaConConteos {
  getSource(id: string): unknown;
  removeFeatureState(target: { source: string; sourceLayer?: string }): void;
}

/**
 * Borra el `feature-state` de cada capa del mapa que ya tiene su fuente (`capa-<capa>`) y devuelve esas
 * capas, para que el llamador olvide también lo que tenga memorizado de ellas. Una capa que todavía no
 * cargó rechaza el borrado: se ignora, no hay nada pintado que quitar.
 */
export function limpiarConteosDeCapas(m: MapaConConteos, capas: readonly CapaInfo[]): CapaInfo[] {
  const limpiadas: CapaInfo[] = [];
  for (const c of capas) {
    const id = `capa-${c.capa}`;
    if (!m.getSource(id)) continue;
    try {
      // Las teselas vectoriales piden la capa de origen; sin ella MapLibre lanza.
      m.removeFeatureState(
        c.modo === 'teselas' ? { source: id, sourceLayer: c.capa } : { source: id },
      );
    } catch {
      // Fuente sin cargar: nada que limpiar.
    }
    limpiadas.push(c);
  }
  return limpiadas;
}
