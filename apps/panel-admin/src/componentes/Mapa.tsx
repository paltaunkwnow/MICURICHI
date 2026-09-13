'use client';

import type { CapaInfo, Severidad } from 'contracts';
import type { LngLatBoundsLike, Map as MapaGl } from 'maplibre-gl';
// MapLibre 6 es ESM puro: no tiene export por defecto.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { ReporteTecnicoFeature } from '@/lib/api';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';

/** Santa Cruz de la Sierra (centro provisional; la muestra sintética está alrededor). */
export const CENTRO_INICIAL: [number, number] = [-63.18, -17.78];

// Mapa base para desarrollo local (raster oscuro de CARTO sobre OSM, con atribución).
// Fase 2: base vectorial propia <a confirmar> (CLAUDE.md §14.3).
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
    // fondo en tinta: el mapa conserva su identidad aunque las teselas base tarden o fallen
    { id: 'fondo', type: 'background', paint: { 'background-color': '#0F2D43' } },
    {
      id: 'base',
      type: 'raster',
      source: 'base',
      // la base se apaga y dessatura para que los puntos de severidad sean lo único con color
      paint: {
        'raster-opacity': 0.8,
        'raster-saturation': -1,
        'raster-contrast': 0.25,
        'raster-brightness-min': 0.02,
        'raster-brightness-max': 0.34,
      },
    },
  ],
};

export interface PropsMapa {
  reportes?: ReporteTecnicoFeature[];
  capas?: CapaInfo[];
  onSeleccionar?: (id: string) => void;
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
  ajustarAPuntos = false,
  centro = CENTRO_INICIAL,
  zoom = 12,
  className = '',
  ariaLabel = 'Mapa de reportes de inundación',
}: PropsMapa) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const listo = useRef(false);

  // Los datos y callbacks se leen por ref para que el mapa se inicialice una sola vez.
  const reportesRef = useRef(reportes);
  const capasRef = useRef(capas);
  const seleccionarRef = useRef(onSeleccionar);
  const ajustarRef = useRef(ajustarAPuntos);
  reportesRef.current = reportes;
  capasRef.current = capas;
  seleccionarRef.current = onSeleccionar;
  ajustarRef.current = ajustarAPuntos;

  // biome-ignore lint/correctness/useExhaustiveDependencies: el mapa se crea una sola vez; `centro` y `zoom` son solo la vista inicial
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: centro,
      zoom,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
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
          'text-font': ['Open Sans Bold'],
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
    });
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      listo.current = false;
    };
  }, []);

  useEffect(() => {
    if (mapa.current && listo.current) aplicarReportes(mapa.current, reportes, ajustarAPuntos);
  }, [reportes, ajustarAPuntos]);

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
    distrito_municipal: { color: '#8FBCD6', ancho: 2.5, minzoom: 9, opacidad: 0.9 },
    unidad_vecinal: { color: '#5aa0c8', ancho: 1.2, minzoom: 11, opacidad: 0.8 },
    manzana: { color: '#3e5468', ancho: 0.6, minzoom: 14, opacidad: 0.7 },
  };
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  for (const c of capas) {
    const id = `capa-${c.capa}`;
    if (m.getSource(id)) continue;
    const e = estilos[c.capa] ?? estilos.manzana;
    if (!e) continue;
    if (c.modo === 'teselas') {
      m.addSource(id, { type: 'vector', tiles: [`${origen}${c.url}`], minzoom: 0, maxzoom: 16 });
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
          paint: { 'fill-color': '#1b3a52', 'fill-opacity': 0.35 },
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
            'text-font': ['Open Sans Bold'],
            'text-size': c.capa === 'distrito_municipal' ? 13 : 11,
            'symbol-placement': 'point',
          },
          paint: { 'text-color': e.color, 'text-halo-color': '#0F2D43', 'text-halo-width': 1.5 },
        } as maplibregl.LayerSpecification,
        'puntos-halo',
      );
    }
  }
}
