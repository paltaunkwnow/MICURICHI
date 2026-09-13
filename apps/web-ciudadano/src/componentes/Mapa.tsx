'use client';

import type { CapaInfo, Severidad } from 'contracts';
import type { LngLatBoundsLike, Map as MapaGl, MapMouseEvent } from 'maplibre-gl';
// MapLibre 6 es ESM puro: no tiene export por defecto.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { ReporteFeature } from '@/lib/api';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';

/** Santa Cruz de la Sierra (centro provisional; la muestra sintética está alrededor). */
export const CENTRO_INICIAL: [number, number] = [-63.18, -17.78];

// Mapa base para desarrollo local (raster oscuro de CARTO sobre OSM, con atribución). Fase 2: base vectorial propia <a confirmar>.
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
  reportes?: ReporteFeature[];
  capas?: CapaInfo[];
  seleccionado?: string | null;
  onSeleccionar?: (id: string | null) => void;
  onMover?: (bbox: string, zoom: number) => void;
  /** Modo selección de ubicación: marcador arrastrable y clic para mover. */
  seleccionUbicacion?: { lat: number; lon: number } | null;
  onUbicacion?: (lat: number, lon: number) => void;
  centro?: [number, number];
  zoom?: number;
  className?: string;
  ariaLabel?: string;
}

function coloresPorSeveridad(): maplibregl.ExpressionSpecification {
  const pares: (string | Severidad)[] = [];
  for (const s of ['baja', 'media', 'alta', 'critica'] as Severidad[])
    pares.push(s, colorSeveridad(s).relleno);
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
  seleccionado,
  onSeleccionar,
  onMover,
  seleccionUbicacion,
  onUbicacion,
  centro = CENTRO_INICIAL,
  zoom = 13,
  className = '',
  ariaLabel = 'Mapa de puntos de inundación',
}: PropsMapa) {
  const contenedor = useRef<HTMLElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const marcador = useRef<maplibregl.Marker | null>(null);
  const listo = useRef(false);

  // Inicialización
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo se inicializa una vez; los callbacks se leen por ref
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
    m.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'bottom-right',
    );
    m.on('load', () => {
      m.addSource('reportes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 15,
        promoteId: 'id',
      });
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'reportes',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0F2D43',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      m.addLayer({
        id: 'clusters-n',
        type: 'symbol',
        source: 'reportes',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Bold'],
          'text-size': 14,
        },
        paint: { 'text-color': '#fff' },
      });
      m.addLayer({
        id: 'puntos-halo',
        type: 'circle',
        source: 'reportes',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'seleccionado'], false], 16, 12],
          'circle-color': '#fff',
          'circle-opacity': 0.95,
        },
      });
      m.addLayer({
        id: 'puntos',
        type: 'circle',
        source: 'reportes',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'seleccionado'], false], 9, 6],
          'circle-color': coloresPorSeveridad(),
          'circle-stroke-color': '#0F2D43',
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'seleccionado'], false],
            3,
            0,
          ],
        },
      });
      m.addLayer({
        id: 'puntos-etiqueta',
        type: 'symbol',
        source: 'reportes',
        filter: ['!', ['has', 'point_count']],
        minzoom: 13,
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
      m.on('click', 'clusters', (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        if (!f) return;
        const src = m.getSource('reportes') as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(f.properties?.cluster_id as number).then((z: number) =>
          m.easeTo({
            center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom: z,
          }),
        );
      });
      m.on('click', 'puntos', (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['puntos'] })[0];
        if (f) onSeleccionar?.(String(f.id ?? f.properties?.id));
      });
      for (const capa of ['puntos', 'clusters']) {
        m.on('mouseenter', capa, () => {
          m.getCanvas().style.cursor = 'pointer';
        });
        m.on('mouseleave', capa, () => {
          m.getCanvas().style.cursor = '';
        });
      }
      m.on('click', (e: MapMouseEvent) => {
        if (onUbicacion && seleccionUbicacionRef.current !== undefined)
          onUbicacion(e.lngLat.lat, e.lngLat.lng);
        else if (!m.queryRenderedFeatures(e.point, { layers: ['puntos', 'clusters'] }).length)
          onSeleccionar?.(null);
      });
      const avisar = () => {
        const b = m.getBounds();
        onMover?.(
          `${b.getWest().toFixed(5)},${b.getSouth().toFixed(5)},${b.getEast().toFixed(5)},${b.getNorth().toFixed(5)}`,
          m.getZoom(),
        );
      };
      m.on('moveend', avisar);
      listo.current = true;
      avisar();
      aplicarCapas(m, capasRef.current);
      aplicarReportes(m, reportesRef.current);
    });
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      listo.current = false;
    };
  }, []);

  const reportesRef = useRef(reportes);
  const capasRef = useRef(capas);
  const seleccionUbicacionRef = useRef(seleccionUbicacion);
  reportesRef.current = reportes;
  capasRef.current = capas;
  seleccionUbicacionRef.current = seleccionUbicacion;

  useEffect(() => {
    if (mapa.current && listo.current) aplicarReportes(mapa.current, reportes);
  }, [reportes]);

  useEffect(() => {
    if (mapa.current && listo.current) aplicarCapas(mapa.current, capas);
  }, [capas]);

  // Estado de selección
  const seleccionPrevio = useRef<string | null>(null);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;
    if (seleccionPrevio.current)
      m.setFeatureState(
        { source: 'reportes', id: seleccionPrevio.current },
        { seleccionado: false },
      );
    if (seleccionado)
      m.setFeatureState({ source: 'reportes', id: seleccionado }, { seleccionado: true });
    seleccionPrevio.current = seleccionado ?? null;
  }, [seleccionado]);

  // Marcador de selección de ubicación
  // biome-ignore lint/correctness/useExhaustiveDependencies: onUbicacion se lee al arrastrar, no al montar
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!seleccionUbicacion) {
      marcador.current?.remove();
      marcador.current = null;
      return;
    }
    if (!marcador.current) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#28934D;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      marcador.current = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
        .setLngLat([seleccionUbicacion.lon, seleccionUbicacion.lat])
        .addTo(m);
      marcador.current.on('dragend', () => {
        const p = marcador.current!.getLngLat();
        onUbicacion?.(p.lat, p.lng);
      });
    } else marcador.current.setLngLat([seleccionUbicacion.lon, seleccionUbicacion.lat]);
    m.easeTo({
      center: [seleccionUbicacion.lon, seleccionUbicacion.lat],
      zoom: Math.max(m.getZoom(), 16),
    });
  }, [seleccionUbicacion]);

  return <section ref={contenedor} className={className} aria-label={ariaLabel} />;
}

function aplicarReportes(m: MapaGl, reportes: ReporteFeature[]) {
  const src = m.getSource('reportes') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: reportes.map((f) => ({
      ...f,
      properties: { ...f.properties, etiqueta: etiquetaSeveridad(f.properties.severidad) },
    })),
  });
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
  for (const c of capas) {
    const id = `capa-${c.capa}`;
    if (m.getSource(id)) continue;
    const e = estilos[c.capa] ?? estilos.manzana!;
    const origen = typeof window !== 'undefined' ? window.location.origin : '';
    if (c.modo === 'teselas')
      m.addSource(id, { type: 'vector', tiles: [`${origen}${c.url}`], minzoom: 0, maxzoom: 16 });
    else m.addSource(id, { type: 'geojson', data: `${origen}${c.url}` });
    const base = c.modo === 'teselas' ? { source: id, 'source-layer': c.capa } : { source: id };
    if (c.capa === 'manzana')
      m.addLayer(
        {
          id: `${id}-relleno`,
          type: 'fill',
          ...base,
          minzoom: e.minzoom,
          paint: { 'fill-color': '#1b3a52', 'fill-opacity': 0.35 },
        } as maplibregl.LayerSpecification,
        'clusters',
      );
    m.addLayer(
      {
        id: `${id}-linea`,
        type: 'line',
        ...base,
        minzoom: e.minzoom,
        paint: { 'line-color': e.color, 'line-width': e.ancho, 'line-opacity': e.opacidad },
      } as maplibregl.LayerSpecification,
      'clusters',
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
        'clusters',
      );
    }
  }
}

export function ajustarA(m: MapaGl | null, bounds: LngLatBoundsLike) {
  m?.fitBounds(bounds, { padding: 40 });
}
