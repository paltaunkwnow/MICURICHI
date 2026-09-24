'use client';

import type { CapaInfo, Severidad } from 'contracts';
import type { LngLatBoundsLike, Map as MapaGl } from 'maplibre-gl';
// MapLibre 6 es ESM puro: no tiene export por defecto.
import * as maplibregl from 'maplibre-gl';
import { etiquetarControlesDelMapa } from '@/lib/accesibilidad-mapa';
import { configurarWorkerDeMapLibre } from '@/lib/worker-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { ReporteTecnicoFeature } from '@/lib/api';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';

/**
 * Santa Cruz de la Sierra, centro histórico. El panel abre acá y el técnico se mueve con los
 * filtros; el mapa público, en cambio, encuadra sobre el bbox de la capa vigente porque ahí la
 * primera vista es lo único que se ve.
 */
export const CENTRO_INICIAL: [number, number] = [-63.18, -17.78];

/**
 * Tope de pastillas HTML a la vez. La tabla pagina de a 50, así que en la práctica siempre se
 * dibujan; el tope está para que una vista sin paginar no llene el DOM de nodos.
 */
const MAX_PASTILLAS = 60;

// Base clara y desaturada, como en el prototipo: el técnico necesita leer las calles debajo de
// los puntos. Fase 2: base vectorial propia <a confirmar> (CLAUDE.md §14.3).
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  /**
   * Glifos servidos por la propia app (`public/glifos/`), no por un servidor ajeno.
   *
   * Antes esto apuntaba a `demotiles.maplibre.org`, que es el servidor de DEMOSTRACIÓN de
   * MapLibre —sin compromiso de servicio y sin permiso para producción—, y encima pedía una
   * tipografía que ahí no existe: cada etiqueta del mapa provocaba un 404 contra un tercero y
   * las letras acababan dibujadas por el navegador como último recurso. Se comprobó pidiendo
   * el archivo a mano: `Open Sans Bold` devuelve 404 y `Noto Sans Bold`, 200.
   *
   * Está guardado el rango 0-255, que cubre el castellano entero (tildes, ñ, ¿, ¡, ·) y los
   * números. Si algún nombre trajera un carácter de fuera de ese rango, MapLibre lo dibuja
   * localmente, que es exactamente lo que hacía antes con TODO el texto.
   */
  glyphs: '/glifos/{fontstack}/{range}.pbf',
  sources: {
    base: {
      type: 'raster',
      // OpenStreetMap estándar: sin clave ni cuota, SOLO para desarrollo local (CLAUDE.md §14.3).
      // Su política de uso no permite producción: en Fase 2 se reemplaza por una base propia.
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    // El fondo mantiene la identidad del mapa aunque las teselas tarden o fallen.
    { id: 'fondo', type: 'background', paint: { 'background-color': '#EEF2EF' } },
    {
      id: 'base',
      type: 'raster',
      source: 'base',
      // La base se desatura para que lo único con color sea la severidad de los puntos.
      paint: {
        'raster-opacity': 0.95,
        'raster-saturation': -0.97,
        'raster-contrast': -0.12,
        'raster-brightness-min': 0.16,
        'raster-brightness-max': 1,
      },
    },
  ],
};

export interface PropsMapa {
  reportes?: ReporteTecnicoFeature[];
  capas?: CapaInfo[];
  onSeleccionar?: (id: string) => void;
  /** Reporte resaltado desde la tabla: su pastilla se pinta en tinta, como en el prototipo. */
  seleccionado?: string | null;
  /** Encuadra los reportes cada vez que cambian (tabla) o el punto único (detalle). */
  ajustarAPuntos?: boolean;
  centro?: [number, number];
  zoom?: number;
  className?: string;
  ariaLabel?: string;
}

function coloresPorSeveridad(): maplibregl.ExpressionSpecification {
  const pares: string[] = [];
  for (const s of ['baja', 'media', 'alta', 'critica'] as Severidad[]) {
    pares.push(s, colorSeveridad(s).relleno);
  }
  return [
    'match',
    ['get', 'severidad'],
    ...pares,
    '#8a98a6',
  ] as unknown as maplibregl.ExpressionSpecification;
}

export function Mapa({
  reportes = [],
  capas = [],
  onSeleccionar,
  seleccionado = null,
  ajustarAPuntos = false,
  centro = CENTRO_INICIAL,
  zoom = 12,
  className = '',
  ariaLabel = 'Mapa de reportes de inundación',
}: PropsMapa) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const listo = useRef(false);
  const pines = useRef(new Map<string, maplibregl.Marker>());

  // Los datos y callbacks se leen por ref para que el mapa se inicialice una sola vez.
  const reportesRef = useRef(reportes);
  const capasRef = useRef(capas);
  const seleccionarRef = useRef(onSeleccionar);
  const ajustarRef = useRef(ajustarAPuntos);
  const seleccionRef = useRef(seleccionado);
  reportesRef.current = reportes;
  capasRef.current = capas;
  seleccionarRef.current = onSeleccionar;
  ajustarRef.current = ajustarAPuntos;
  seleccionRef.current = seleccionado;

  /**
   * Marcadores en pastilla, iguales a los del mapa público: punto de color y nombre de la
   * severidad escrito. Se dibujan mientras la vista traiga pocos puntos (la tabla pagina de a 50);
   * por encima manda el círculo, que no cuesta nodos.
   */
  const sincronizarPines = useRef<() => void>(() => {});

  // biome-ignore lint/correctness/useExhaustiveDependencies: el mapa se crea una sola vez; `centro` y `zoom` son solo la vista inicial
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    configurarWorkerDeMapLibre();
    const m = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: centro,
      zoom,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // Los botones de MapLibre vienen en inglés y alguno sin nombre accesible (WCAG 4.1.2).
    etiquetarControlesDelMapa(m);

    const vivos = new Map<string, maplibregl.Marker>();
    pines.current = vivos;
    sincronizarPines.current = () => {
      if (!m.getLayer('puntos')) return;
      const lista = reportesRef.current;
      const conPastillas = lista.length > 0 && lista.length <= MAX_PASTILLAS;
      for (const capa of ['puntos', 'puntos-halo', 'puntos-etiqueta']) {
        if (m.getLayer(capa))
          m.setLayoutProperty(capa, 'visibility', conPastillas ? 'none' : 'visible');
      }
      const vistos = new Set<string>();
      if (conPastillas)
        for (const f of lista) {
          const id = f.properties.id;
          if (!id || vistos.has(id)) continue;
          vistos.add(id);
          const sev = f.properties.severidad;
          let marca = vivos.get(id);
          if (!marca) {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'pin';
            el.addEventListener('click', (ev) => {
              ev.stopPropagation();
              seleccionarRef.current?.(id);
            });
            marca = new maplibregl.Marker({ element: el, anchor: 'left' })
              .setLngLat(f.geometry.coordinates)
              .addTo(m);
            vivos.set(id, marca);
          } else marca.setLngLat(f.geometry.coordinates);
          const el = marca.getElement();
          const activo = seleccionRef.current === id;
          el.className = `pin${activo ? ' on' : ''}`;
          el.setAttribute('aria-pressed', String(activo));
          const etiqueta = etiquetaSeveridad(sev);
          el.setAttribute('aria-label', `Abrir el reporte de severidad ${etiqueta.toLowerCase()}`);
          el.innerHTML = '';
          const dot = document.createElement('span');
          dot.className = 'd';
          dot.style.background = colorSeveridad(sev).relleno;
          el.append(dot, document.createTextNode(etiqueta));
        }
      for (const [id, marca] of vivos) {
        if (!vistos.has(id)) {
          marca.remove();
          vivos.delete(id);
        }
      }
    };

    m.on('load', () => {
      m.addSource('reportes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });
      m.addLayer({
        id: 'puntos-halo',
        type: 'circle',
        source: 'reportes',
        paint: { 'circle-radius': 11, 'circle-color': '#fff', 'circle-opacity': 0.95 },
      });
      m.addLayer({
        id: 'puntos',
        type: 'circle',
        source: 'reportes',
        paint: {
          'circle-radius': 7,
          'circle-color': coloresPorSeveridad(),
          'circle-stroke-color': '#0F2D43',
          'circle-stroke-width': 1,
        },
      });
      m.addLayer({
        id: 'puntos-etiqueta',
        type: 'symbol',
        source: 'reportes',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'etiqueta'],
          'text-font': ['NotoSans-Bold'],
          'text-size': 13,
          'text-offset': [1.1, 0],
          'text-anchor': 'left',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#0F2D43', 'text-halo-color': '#fff', 'text-halo-width': 2.5 },
      });
      m.on('click', 'puntos', (e) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['puntos'] })[0];
        if (!f) return;
        const id = f.id ?? (f.properties as { id?: string } | null)?.id;
        if (id !== undefined && id !== null) seleccionarRef.current?.(String(id));
      });
      m.on('mouseenter', 'puntos', () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'puntos', () => {
        m.getCanvas().style.cursor = '';
      });
      listo.current = true;
      aplicarCapas(m, capasRef.current);
      aplicarReportes(m, reportesRef.current, ajustarRef.current);
      sincronizarPines.current();
    });
    mapa.current = m;
    return () => {
      for (const marca of vivos.values()) marca.remove();
      vivos.clear();
      m.remove();
      mapa.current = null;
      listo.current = false;
    };
  }, []);

  useEffect(() => {
    if (mapa.current && listo.current) {
      aplicarReportes(mapa.current, reportes, ajustarAPuntos);
      sincronizarPines.current();
    }
  }, [reportes, ajustarAPuntos]);

  // `seleccionado` se lee por ref dentro de `sincronizarPines`, así que Biome no ve la lectura;
  // es justo el cambio que tiene que repintar la pastilla elegida desde la tabla.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se lee por ref, ver arriba
  useEffect(() => {
    if (mapa.current && listo.current) sincronizarPines.current();
  }, [seleccionado]);

  useEffect(() => {
    if (mapa.current && listo.current) aplicarCapas(mapa.current, capas);
  }, [capas]);

  return <section ref={contenedor} className={className} aria-label={ariaLabel} />;
}

function aplicarReportes(m: MapaGl, reportes: ReporteTecnicoFeature[], ajustar: boolean) {
  const src = m.getSource('reportes') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: reportes.map((f) => ({
      ...f,
      properties: { ...f.properties, etiqueta: etiquetaSeveridad(f.properties.severidad) },
    })),
  });
  if (ajustar && reportes.length) {
    const b = new maplibregl.LngLatBounds();
    for (const f of reportes) b.extend(f.geometry.coordinates);
    m.fitBounds(b as LngLatBoundsLike, { padding: 48, maxZoom: 16, duration: 400 });
  }
}

function aplicarCapas(m: MapaGl, capas: CapaInfo[]) {
  const estilos: Record<
    string,
    { color: string; ancho: number; minzoom: number; opacidad: number }
  > = {
    distrito_municipal: { color: '#0A4A69', ancho: 2.5, minzoom: 9, opacidad: 0.85 },
    unidad_vecinal: { color: '#0D6189', ancho: 1.2, minzoom: 11, opacidad: 0.75 },
    manzana: { color: '#3e5468', ancho: 0.6, minzoom: 14, opacidad: 0.6 },
  };
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  for (const c of capas) {
    const id = `capa-${c.capa}`;
    if (m.getSource(id)) continue;
    const e = estilos[c.capa] ?? estilos.manzana;
    if (!e) continue;
    if (c.modo === 'teselas') {
      // `minzoom` del ORIGEN, no solo de la capa: sin él MapLibre puede pedir la tesela z0 de
      // las manzanas, que son 27 434 polígonos metidos en un solo .mvt. Medido contra el
      // servicio con los datos reales: 2,0 MB en z10 y 515 KB en z12, frente a 42 KB en z14,
      // que es donde de verdad se dibujan. Una capa que no se pinta por debajo de cierto zoom
      // tampoco tiene nada que servir por debajo de ese zoom.
      m.addSource(id, {
        type: 'vector',
        tiles: [`${origen}${c.url}`],
        minzoom: e.minzoom,
        maxzoom: 16,
      });
    } else {
      m.addSource(id, { type: 'geojson', data: `${origen}${c.url}` });
    }
    const base = c.modo === 'teselas' ? { source: id, 'source-layer': c.capa } : { source: id };
    if (c.capa === 'manzana') {
      m.addLayer(
        {
          id: `${id}-relleno`,
          type: 'fill',
          ...base,
          minzoom: e.minzoom,
          paint: { 'fill-color': '#C9D6CE', 'fill-opacity': 0.55 },
        } as maplibregl.LayerSpecification,
        'puntos-halo',
      );
    }
    m.addLayer(
      {
        id: `${id}-linea`,
        type: 'line',
        ...base,
        minzoom: e.minzoom,
        paint: { 'line-color': e.color, 'line-width': e.ancho, 'line-opacity': e.opacidad },
      } as maplibregl.LayerSpecification,
      'puntos-halo',
    );
    if (c.capa !== 'manzana') {
      m.addLayer(
        {
          id: `${id}-nombre`,
          type: 'symbol',
          ...base,
          minzoom: c.capa === 'distrito_municipal' ? 10 : 13,
          layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['NotoSans-Bold'],
            'text-size': c.capa === 'distrito_municipal' ? 13 : 11,
            'symbol-placement': 'point',
          },
          paint: {
            'text-color': '#0F2D43',
            'text-halo-color': 'rgba(255,255,255,.92)',
            'text-halo-width': 2,
          },
        } as maplibregl.LayerSpecification,
        'puntos-halo',
      );
    }
  }
}
