'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { CapaInfo, EstadoReporte, ReporteTecnicoFeature, Severidad } from 'contracts';
import { X } from 'lucide-react';
import type { LngLatBoundsLike, Map as MapaGl } from 'maplibre-gl';
// MapLibre 6 es ESM puro: no tiene export por defecto.
import * as maplibregl from 'maplibre-gl';
import Link from 'next/link';
import { etiquetarControlesDelMapa } from '@/lib/accesibilidad-mapa';
import { configurarWorkerDeMapLibre } from '@/lib/worker-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChipEstado, ChipSeveridad } from '@/componentes/ChipSeveridad';
import {
  ajustarVisibilidadCapas,
  aplicarCapas,
  type CapaVisible,
  detectorDeCapaCambiada,
  recargarCapasMapa,
} from '@/lib/capas-mapa';
import { useCiudad } from '@/lib/ciudad-contexto';
import { vistaInicialDelPanel } from '@/lib/encuadre';
import {
  colorSeveridad,
  etiquetaDistrito,
  etiquetaSeveridad,
  etiquetaUnidadVecinal,
} from '@/lib/formato';
import { bboxDeLimites, textoZonaCentro, zonaDeFeature } from '@/lib/mapa-seleccion';

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
  /**
   * El mapa quedó quieto (fin de arrastre o zoom): devuelve el bbox visible
   * "minLon,minLat,maxLon,maxLat" ya redondeado. La bandeja lo usa para seguir al mapa; el que
   * decide si filtra o no, y con qué demora, es quien pasa esta prop.
   */
  onMover?: (bbox: string) => void;
  /** Muestra el chip «Mirando: Distrito … · UV …» con la zona del centro del mapa. */
  mostrarZonaCentro?: boolean;
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
  onMover,
  mostrarZonaCentro = false,
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

  // Tarjeta de un punto tocado en el mapa y texto del chip «Mirando» (zona del centro).
  const [popup, setPopup] = useState<{ id: string; lngLat: [number, number] } | null>(null);
  const [zonaCentroTexto, setZonaCentroTexto] = useState<string | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupNodo = useRef<HTMLDivElement | null>(null);
  if (typeof document !== 'undefined' && !popupNodo.current) {
    popupNodo.current = document.createElement('div');
  }

  // Los datos y callbacks se leen por ref para que el mapa se inicialice una sola vez.
  const reportesRef = useRef(reportes);
  const capasRef = useRef(capas);
  const seleccionarRef = useRef(onSeleccionar);
  const seleccionarDistritoRef = useRef(onSeleccionarDistrito);
  const seleccionarUvRef = useRef(onSeleccionarUv);
  const onMoverRef = useRef(onMover);
  const mostrarZonaCentroRef = useRef(mostrarZonaCentro);
  const ajustarRef = useRef(ajustarAPuntos);
  const seleccionRef = useRef(seleccionado);
  const clienteRef = useRef(cliente);

  reportesRef.current = reportes;
  capasRef.current = capas;
  seleccionarRef.current = onSeleccionar;
  seleccionarDistritoRef.current = onSeleccionarDistrito;
  seleccionarUvRef.current = onSeleccionarUv;
  onMoverRef.current = onMover;
  mostrarZonaCentroRef.current = mostrarZonaCentro;
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
      const capasZona = ['capa-distrito_municipal-relleno', 'capa-unidad_vecinal-relleno'];
      // El puntero de mano se mantiene por capa; lo que se unifica es el clic.
      for (const capaId of [...capasPuntos, ...capasZona]) {
        m.on('mouseenter', capaId, () => {
          m.getCanvas().style.cursor = 'pointer';
        });
        m.on('mouseleave', capaId, () => {
          m.getCanvas().style.cursor = '';
        });
      }

      /** Encuadra el mapa sobre el polígono de una zona recién elegida. */
      const encuadrarAZona = (
        geometry: unknown,
        opciones: { padding: number; maxZoom: number },
      ) => {
        const bbox = calcularBboxFeature(geometry);
        if (!bbox) return;
        m.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { ...opciones, duration: 600 },
        );
      };

      /**
       * Un solo manejador de clic, con prioridad: primero el punto bajo el cursor, después la zona
       * que tiene debajo. Antes había un `click` por cada capa de puntos (se disparaba hasta tres
       * veces) y otro por cada capa de zona, así que tocar un punto también cambiaba el filtro de la
       * zona de abajo y ganaba ese filtro —que además salía roto porque usaba `feature.id`, el
       * índice que inventa MapLibre, en vez de `properties.id`—. Ahora el punto se queda con el clic
       * y, sin punto, se resuelve la zona por `properties.id` (`lib/mapa-seleccion`).
       */
      m.on('click', (e) => {
        const capasVisibles = capasPuntos.filter((c) => m.getLayer(c));
        const punto = capasVisibles.length
          ? m.queryRenderedFeatures(e.point, { layers: capasVisibles })[0]
          : undefined;
        if (punto && seleccionarRef.current) {
          const bruto = punto.id ?? (punto.properties as { id?: string } | null)?.id;
          if (bruto === undefined || bruto === null) return;
          const id = String(bruto);
          seleccionarRef.current(id);
          const coords = (punto.geometry as { coordinates?: [number, number] }).coordinates;
          if (coords) setPopup({ id, lngLat: [coords[0], coords[1]] });
          return;
        }
        // Clic fuera de un punto: se cierra la tarjeta y se resuelve la zona (UV primero salvo que
        // se vean solo distritos).
        setPopup(null);
        if (modoCapaRef.current !== 'distritos' && m.getLayer('capa-unidad_vecinal-relleno')) {
          const f = m.queryRenderedFeatures(e.point, {
            layers: ['capa-unidad_vecinal-relleno'],
          })[0];
          const z = zonaDeFeature(f, 'uv');
          if (z) {
            encuadrarAZona(f?.geometry, { padding: 36, maxZoom: 16 });
            seleccionarUvRef.current?.(z);
            return;
          }
        }
        if (m.getLayer('capa-distrito_municipal-relleno')) {
          const f = m.queryRenderedFeatures(e.point, {
            layers: ['capa-distrito_municipal-relleno'],
          })[0];
          const z = zonaDeFeature(f, 'distrito');
          if (z) {
            encuadrarAZona(f?.geometry, { padding: 48, maxZoom: 15 });
            seleccionarDistritoRef.current?.(z);
          }
        }
      });

      /** Chip «Mirando»: la zona que cae en el centro del mapa. */
      const actualizarZonaCentro = () => {
        if (!mostrarZonaCentroRef.current) return;
        const centro = m.project(m.getCenter());
        const dF = m.getLayer('capa-distrito_municipal-relleno')
          ? m.queryRenderedFeatures(centro, { layers: ['capa-distrito_municipal-relleno'] })[0]
          : undefined;
        const uF = m.getLayer('capa-unidad_vecinal-relleno')
          ? m.queryRenderedFeatures(centro, { layers: ['capa-unidad_vecinal-relleno'] })[0]
          : undefined;
        const texto = textoZonaCentro(zonaDeFeature(dF, 'distrito'), zonaDeFeature(uF, 'uv'));
        setZonaCentroTexto((previo) => (previo === texto ? previo : texto));
      };

      const alQuedarQuieto = () => {
        onMoverRef.current?.(bboxDeLimites(m.getBounds()));
        actualizarZonaCentro();
      };
      m.on('moveend', alQuedarQuieto);
      // `idle` recalcula el chip cuando las capas terminan de pintarse (al moverse `moveend` solo no
      // alcanza: la primera carga de la capa llega después). No toca el bbox para no encadenar.
      m.on('idle', actualizarZonaCentro);

      listo.current = true;
      aplicarCapas(m, capasRef.current, origenDeLaPagina());
      ajustarVisibilidadCapas(m, modoCapaRef.current);
      aplicarReportes(m, reportesRef.current, ajustarRef.current);
      if (m.getLayer('puntos-seleccionado')) {
        m.setFilter('puntos-seleccionado', ['==', ['get', 'id'], seleccionRef.current ?? '']);
      }
      // Primer aviso sin esperar a que el técnico mueva: la bandeja ya puede seguir a la vista de
      // arranque y el chip aparece en cuanto pintan las capas.
      alQuedarQuieto();
    });

    mapa.current = m;
    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      m.remove();
      mapa.current = null;
      listo.current = false;
    };
  }, []);

  // Tarjeta del punto tocado: se dibuja en un popup de MapLibre que sigue al punto, con el contenido
  // puesto por React (portal) para que el enlace y el botón sean accesibles y navegables.
  const repPopup = popup ? (reportes.find((f) => f.properties.id === popup.id) ?? null) : null;
  const hayRep = repPopup !== null;
  // Si el reporte dejó de estar (un refresco lo retiró), se cierra la tarjeta.
  useEffect(() => {
    if (popup && !hayRep) setPopup(null);
  }, [popup, hayRep]);

  useEffect(() => {
    const m = mapa.current;
    const nodo = popupNodo.current;
    if (!m || !nodo) return;
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        maxWidth: '260px',
      });
    }
    if (popup && hayRep) {
      popupRef.current.setLngLat(popup.lngLat).setDOMContent(nodo).addTo(m);
    } else {
      popupRef.current.remove();
    }
  }, [popup, hayRep]);

  // Escape cierra la tarjeta, como pide la accesibilidad del plan.
  useEffect(() => {
    if (!popup) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopup(null);
    };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [popup]);

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
      {mostrarZonaCentro && zonaCentroTexto && (
        <p
          className="absolute top-3 left-3 z-10 max-w-[70%] truncate rounded-md border border-slate-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-tinta-700 shadow-sm"
          data-testid="chip-mirando"
          aria-live="polite"
        >
          {zonaCentroTexto}
        </p>
      )}
      {popup && repPopup && popupNodo.current
        ? createPortal(
            <TarjetaPunto reporte={repPopup} onCerrar={() => setPopup(null)} />,
            popupNodo.current,
          )
        : null}
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

/**
 * Contenido de la tarjeta que aparece al tocar un punto: título, severidad y estado en texto, y un
 * enlace «Ver detalle». No navega sola (el clic en el punto solo abre esto); el enlace sí. Se
 * enfoca al abrirse y se cierra con Escape (en el componente del mapa) o con el botón.
 */
function TarjetaPunto({
  reporte,
  onCerrar,
}: {
  reporte: ReporteTecnicoFeature | FeaturePuntoReporte;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const p = reporte.properties as {
    id?: string;
    severidad: Severidad;
    estado?: EstadoReporte;
    unidad_vecinal?: { codigo?: string } | null;
    distrito?: { codigo?: string } | null;
  };
  const id = p.id ?? '';
  const partes = [
    p.unidad_vecinal?.codigo ? etiquetaUnidadVecinal(p.unidad_vecinal.codigo) : null,
    p.distrito?.codigo ? etiquetaDistrito(p.distrito.codigo) : null,
  ].filter(Boolean);
  const titulo = partes.length ? partes.join(' · ') : 'Reporte';
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={`Reporte en ${titulo}`}
      className="w-[228px] text-tinta-900 outline-none"
      data-testid="popup-punto"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{titulo}</p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la tarjeta del reporte"
          className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center rounded text-tinta-600 hover:bg-slate-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ChipSeveridad severidad={p.severidad} />
        {p.estado ? <ChipEstado estado={p.estado} /> : null}
      </div>
      {id ? (
        <Link
          href={`/reportes/${id}`}
          className="btn btn-sm btn-secundario mt-3 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-normal"
          data-testid="popup-ver-detalle"
        >
          Ver detalle →
        </Link>
      ) : null}
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
