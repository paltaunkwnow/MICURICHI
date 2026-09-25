/**
 * Nombres accesibles de los controles del mapa (WCAG 2.2 AA, criterio 4.1.2).
 *
 * MapLibre pone `aria-label`/`title` a sus botones en inglés, y en un caso concreto **no los pone
 * en absoluto**: cuando el navegador no ofrece geolocalización, el control se pinta deshabilitado
 * y sin nombre, así que un lector de pantalla anuncia solo «botón». Lo detectó la prueba de
 * accesibilidad de `e2e/`, que aparecía como intermitente porque los controles se añaden después
 * de que el mapa carga.
 *
 * De paso quedan en español, como pide `CLAUDE.md` §14.1 (todo el texto visible en español).
 * Esto NO cambia el diseño: solo añade atributos que los lectores de pantalla leen.
 */
const ETIQUETAS: Array<{ selector: string; etiqueta: string }> = [
  { selector: '.maplibregl-ctrl-zoom-in', etiqueta: 'Acercar el mapa' },
  { selector: '.maplibregl-ctrl-zoom-out', etiqueta: 'Alejar el mapa' },
  { selector: '.maplibregl-ctrl-compass', etiqueta: 'Reorientar el mapa al norte' },
  { selector: '.maplibregl-ctrl-geolocate', etiqueta: 'Centrar el mapa en mi ubicación' },
  { selector: '.maplibregl-ctrl-attrib-button', etiqueta: 'Ver atribución del mapa' },
  { selector: '.maplibregl-ctrl-fullscreen', etiqueta: 'Pantalla completa' },
];

interface MapaConContenedor {
  getContainer(): HTMLElement;
}

export function etiquetarControlesDelMapa(mapa: MapaConContenedor): void {
  const aplicar = () => {
    const raiz = mapa.getContainer();
    for (const { selector, etiqueta } of ETIQUETAS) {
      for (const el of raiz.querySelectorAll<HTMLElement>(`button${selector}`)) {
        el.setAttribute('aria-label', etiqueta);
        if (!el.getAttribute('title')) el.setAttribute('title', etiqueta);
      }
    }
  };
  aplicar();
  // Los controles se montan de forma asíncrona; se repasa al terminar el ciclo actual por si
  // alguno todavía no estaba en el DOM.
  queueMicrotask(aplicar);
  setTimeout(aplicar, 0);
}
