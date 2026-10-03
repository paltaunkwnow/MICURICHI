'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { CapaInfo, ReporteTecnicoFeature, Severidad } from 'contracts';
import type { LngLatBoundsLike, Map as MapaGl } from 'maplibre-gl';
// MapLibre 6 es ESM puro: no tiene export por defecto.
import * as maplibregl from 'maplibre-gl';
import { etiquetarControlesDelMapa } from '@/lib/accesibilidad-mapa';
import { configurarWorkerDeMapLibre } from '@/lib/worker-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import {
  ajustarVisibilidadCapas,
  aplicarCapas,
  type CapaVisible,
  detectorDeCapaCambiada,
  recargarCapasMapa,
} from '@/lib/capas-mapa';
import { useCiudad } from '@/lib/ciudad-contexto';
import { vistaInicialDelPanel } from '@/lib/encuadre';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';

// Base clara y desaturada, como en el prototipo: el técnico necesita leer las calles debajo de
// los puntos. Fase 2: base vectorial propia <a confirmar> (CLAUDE.md §14.3).
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: '/glifos/{fontstack}/{range}.pbf',
  sources: {
    base: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#EEF2EF' } },
    {
      id: 'base',
      type: 'raster',
      source: 'base',
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

export type FeaturePuntoReporte = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id?: string; severidad: Severidad; [k: string]: unknown };
};

export interface PropsMapa {
  reportes?: (ReporteTecnicoFeature | FeaturePuntoReporte)[];
  capas?: CapaInfo[];
  onSeleccionar?: (id: string) => void;
  onSeleccionarDistrito?: (d: { id: string; codigo: string; nombre: string }) => void;
  onSeleccionarUv?: (u: { id: string; codigo: string; nombre: string }) => void;
  /** Reporte resaltado desde la tabla: su pastilla se pinta en tinta, como en el prototipo. */
  seleccionado?: string | null;
  /** Encuadra los reportes cada vez que cambian (tabla) o el punto único (detalle). */
  ajustarAPuntos?: boolean;
  /**
   * Vista inicial. Sin ellos, el centro de la ciudad del despliegue y su zoom inicial un nivel
   * más lejos (`vistaInicialDelPanel`); después mandan los filtros y los puntos.
   */
  centro?: [number, number];
  zoom?: number;
  className?: string;
  ariaLabel?: string;
  capaVisible?: CapaVisible;
  onCambiarCapaVisible?: (c: CapaVisible) => void;
  mostrarControlesCapas?: boolean;
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

function calcularBboxFeature(geometry: unknown): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const geom = geometry as { type: string; coordinates: unknown };
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const procesarCoord = (coord: unknown) => {
    if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
      const [lon, lat] = coord;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  };

  const recorrer = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (coords.length > 0 && typeof coords[0] === 'number') {
      procesarCoord(coords);
    } else {
      for (const item of coords) recorrer(item);
    }
  };

  recorrer(geom.coordinates);
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

const OPCIONES_CAPAS: Array<{ valor: CapaVisible; texto: string }> = [
  { valor: 'ambas', texto: 'Distritos y UV' },
  { valor: 'distritos', texto: 'Solo Distritos' },
  { valor: 'uv', texto: 'Solo UV' },
];

export function Mapa({
  reportes = [],
  capas = [],
  onSeleccionar,
  onSeleccionarDistrito,
  onSeleccionarUv,
  seleccionado = null,
  ajustarAPuntos = false,
  centro,
  zoom,
  className = '',
  ariaLabel = 'Mapa de reportes de inundación',
  capaVisible: capaVisibleProp,
  onCambiarCapaVisible,
  mostrarControlesCapas = true,
}: PropsMapa) {
  const cliente = useQueryClient();
  const vistaCiudad = vistaInicialDelPanel(useCiudad());
  const centroInicial = centro ?? vistaCiudad.centro;
  const zoomInicial = zoom ?? vistaCiudad.zoom;
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const listo = useRef(false);

  const [modoCapaInterno, setModoCapaInterno] = useState<CapaVisible>(capaVisibleProp ?? 'ambas');
  const modoCapa = capaVisibleProp ?? modoCapaInterno;
  const modoCapaRef = useRef<CapaVisible>(modoCapa);
  modoCapaRef.current = modoCapa;

  // Los datos y callbacks se leen por ref para que el mapa se inicialice una sola vez.
  const reportesRef = useRef(reportes);
  const capasRef = useRef(capas);
  const seleccionarRef = useRef(onSeleccionar);
  const seleccionarDistritoRef = useRef(onSeleccionarDistrito);
  const seleccionarUvRef = useRef(onSeleccionarUv);
  const ajustarRef = useRef(ajustarAPuntos);
  const seleccionRef = useRef(seleccionado);
  const clienteRef = useRef(cliente);

  reportesRef.current = reportes;
  capasRef.current = capas;
  seleccionarRef.current = onSeleccionar;
  seleccionarDistritoRef.current = onSeleccionarDistrito;
  seleccionarUvRef.current = onSeleccionarUv;
  ajustarRef.current = ajustarAPuntos;
  seleccionRef.current = seleccionado;
  clienteRef.current = cliente;

  // biome-ignore lint/correctness/useExhaustiveDependencies: el mapa se crea una sola vez; centro y zoom son solo la vista inicial
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    configurarWorkerDeMapLibre();
    const m = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: centroInicial,
      zoom: zoomInicial,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    etiquetarControlesDelMapa(m);

    const capaCambiada = detectorDeCapaCambiada();
    m.on('error', (e) => {
      if (clienteRef.current && capaCambiada(e.error, capasRef.current)) {
        void recargarCapasMapa(clienteRef.current);
      } else {
        console.error(e.error);
      }
    });

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
        id: 'puntos-seleccionado',
        type: 'circle',
        source: 'reportes',
        filter: ['==', ['get', 'id'], seleccionRef.current ?? ''],
        paint: {
          'circle-radius': 12,
          'circle-color': 'rgba(15, 45, 67, 0.2)',
          'circle-stroke-color': '#0F2D43',
          'circle-stroke-width': 2.5,
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

      const capasPuntos = ['puntos', 'puntos-halo', 'puntos-etiqueta'];
      for (const capaId of capasPuntos) {
        m.on('click', capaId, (e) => {
          const f = m.queryRenderedFeatures(e.point, { layers: capasPuntos })[0];
          if (!f) return;
          const id = f.id ?? (f.properties as { id?: string } | null)?.id;
          if (id !== undefined && id !== null) seleccionarRef.current?.(String(id));
        });
        m.on('mouseenter', capaId, () => {
          m.getCanvas().style.cursor = 'pointer';
        });
        m.on('mouseleave', capaId, () => {
          m.getCanvas().style.cursor = '';
        });
      }

      // Clics y puntero en distritos y UV
      m.on('click', 'capa-unidad_vecinal-relleno', (e) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['capa-unidad_vecinal-relleno'] })[0];
        if (!f) return;
        const p = f.properties as { id?: string; codigo?: string; nombre?: string } | null;
        const id = String(f.id ?? p?.id ?? '');
        const codigo = String(p?.codigo ?? id.split(':').pop() ?? id);
        const nombre = String(p?.nombre ?? `UV ${codigo}`);
        const bbox = calcularBboxFeature(f.geometry);
        if (bbox) {
          m.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 36, maxZoom: 16, duration: 600 },
          );
        }
        seleccionarUvRef.current?.({ id, codigo, nombre });
      });

      m.on('click', 'capa-distrito_municipal-relleno', (e) => {
        const uvFeature = m.queryRenderedFeatures(e.point, {
          layers: ['capa-unidad_vecinal-relleno'],
        })[0];
        if (uvFeature && modoCapaRef.current !== 'distritos') {
          return;
        }
        const f = m.queryRenderedFeatures(e.point, {
          layers: ['capa-distrito_municipal-relleno'],
        })[0];
        if (!f) return;
        const p = f.properties as { id?: string; codigo?: string; nombre?: string } | null;
        const id = String(f.id ?? p?.id ?? '');
        const codigo = String(p?.codigo ?? id.split(':').pop() ?? id);
        const nombre = String(p?.nombre ?? `Distrito ${codigo}`);
        const bbox = calcularBboxFeature(f.geometry);
        if (bbox) {
          m.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 48, maxZoom: 15, duration: 600 },
          );
        }
        seleccionarDistritoRef.current?.({ id, codigo, nombre });
      });

      for (const capa of ['capa-distrito_municipal-relleno', 'capa-unidad_vecinal-relleno']) {
        m.on('mouseenter', capa, () => {
          m.getCanvas().style.cursor = 'pointer';
        });
        m.on('mouseleave', capa, () => {
          m.getCanvas().style.cursor = '';
        });
      }

      listo.current = true;
      aplicarCapas(m, capasRef.current, origenDeLaPagina());
      ajustarVisibilidadCapas(m, modoCapaRef.current);
      aplicarReportes(m, reportesRef.current, ajustarRef.current);
      if (m.getLayer('puntos-seleccionado')) {
        m.setFilter('puntos-seleccionado', ['==', ['get', 'id'], seleccionRef.current ?? '']);
      }
    });

    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      listo.current = false;
    };
  }, []);

  useEffect(() => {
    if (mapa.current && listo.current) {
      aplicarReportes(mapa.current, reportes, ajustarAPuntos);
    }
  }, [reportes, ajustarAPuntos]);

  useEffect(() => {
    if (mapa.current && listo.current && mapa.current.getLayer('puntos-seleccionado')) {
      mapa.current.setFilter('puntos-seleccionado', ['==', ['get', 'id'], seleccionado ?? '']);
    }
  }, [seleccionado]);

  useEffect(() => {
    if (mapa.current && listo.current) {
      aplicarCapas(mapa.current, capas, origenDeLaPagina());
      ajustarVisibilidadCapas(mapa.current, modoCapa);
    }
  }, [capas, modoCapa]);

  useEffect(() => {
    if (mapa.current && listo.current) {
      ajustarVisibilidadCapas(mapa.current, modoCapa);
    }
  }, [modoCapa]);

  return (
    <div className={`relative ${className}`}>
      <section ref={contenedor} className="h-full w-full" aria-label={ariaLabel} />
      {mostrarControlesCapas && (
        <fieldset className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1 rounded-md bg-white/95 p-1 shadow-sm border border-slate-200 text-xs">
          <legend className="sr-only">Capas del mapa</legend>
          {OPCIONES_CAPAS.map((op) => (
            <button
              key={op.valor}
              type="button"
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                modoCapa === op.valor
                  ? 'bg-tinta-900 text-white'
                  : 'text-tinta-700 hover:bg-slate-100'
              }`}
              aria-pressed={modoCapa === op.valor}
              onClick={() => {
                setModoCapaInterno(op.valor);
                onCambiarCapaVisible?.(op.valor);
              }}
            >
              {op.texto}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function aplicarReportes(
  m: MapaGl,
  reportes: (ReporteTecnicoFeature | FeaturePuntoReporte)[],
  ajustar: boolean,
) {
  const src = m.getSource('reportes') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: reportes.map((f) => ({
      type: 'Feature',
      id: f.properties.id,
      geometry: f.geometry,
      properties: { ...f.properties, etiqueta: etiquetaSeveridad(f.properties.severidad) },
    })),
  });
  if (ajustar && reportes.length) {
    const b = new maplibregl.LngLatBounds();
    for (const f of reportes) b.extend(f.geometry.coordinates);
    m.fitBounds(b as LngLatBoundsLike, { padding: 48, maxZoom: 16, duration: 400 });
  }
}

function origenDeLaPagina(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}
