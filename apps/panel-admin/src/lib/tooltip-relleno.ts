import type { Map as MapaGl, MapLayerMouseEvent, MapMouseEvent, Popup } from 'maplibre-gl';

/**
 * Tooltip de la coropleta: nombre del polígono y su conteo al pasar el puntero o al tocarlo.
 *
 * En pantallas táctiles no hay «pasar por encima» ni `mouseleave`: el toque abría el tooltip y
 * nada lo cerraba, así que seguía mostrando el conteo de cuando se tocó aunque cambiaran la
 * pestaña o los datos. Ahora lo cierra tocar fuera de todo polígono, y `Mapa` lo cierra cada vez
 * que cambia el relleno.
 */
export function conectarTooltipRelleno(
  m: MapaGl,
  idRelleno: string,
  tooltip: Popup,
  descripcion: (codigo: string) => string | undefined,
): void {
  const mostrar = (e: MapLayerMouseEvent) => {
    const codigo = e.features?.[0]?.properties?.codigo;
    const texto = codigo === undefined || codigo === null ? undefined : descripcion(String(codigo));
    if (!texto) {
      tooltip.remove();
      return;
    }
    tooltip.setLngLat(e.lngLat).setText(texto).addTo(m);
  };
  m.on('mousemove', idRelleno, (e) => {
    m.getCanvas().style.cursor = 'pointer';
    mostrar(e);
  });
  m.on('click', idRelleno, mostrar);
  m.on('mouseleave', idRelleno, () => {
    m.getCanvas().style.cursor = '';
    tooltip.remove();
  });
  m.on('click', (e: MapMouseEvent) => {
    if (m.queryRenderedFeatures(e.point, { layers: [idRelleno] }).length === 0) tooltip.remove();
  });
}
