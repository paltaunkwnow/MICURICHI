import type { Map as MapaGl, Popup } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { conectarTooltipRelleno } from './tooltip-relleno';

const CAPA = 'capa-distrito_municipal-relleno';

type Manejador = (e: unknown) => void;

/** Mapa de mentira: guarda los manejadores y deja decidir qué polígonos hay bajo el toque. */
function mapaFalso() {
  const manejadores: Array<{ tipo: string; capa: string | null; fn: Manejador }> = [];
  const estado = { bajoElToque: [] as unknown[] };
  const canvas = { style: { cursor: '' } };
  const m = {
    on(tipo: string, a: string | Manejador, b?: Manejador) {
      if (typeof a === 'string') manejadores.push({ tipo, capa: a, fn: b as Manejador });
      else manejadores.push({ tipo, capa: null, fn: a });
      return m;
    },
    queryRenderedFeatures: () => estado.bajoElToque,
    getCanvas: () => canvas,
  };
  /** Un toque como lo reparte MapLibre: primero a la capa (si hay polígono), después al mapa. */
  function tocar(codigo: string | null) {
    const feature = codigo === null ? null : { properties: { codigo } };
    estado.bajoElToque = feature ? [feature] : [];
    const e = { point: { x: 10, y: 10 }, lngLat: { lng: -63.18, lat: -17.78 } };
    for (const h of manejadores) {
      if (h.tipo !== 'click') continue;
      if (h.capa === CAPA && feature) h.fn({ ...e, features: [feature] });
      if (h.capa === null) h.fn(e);
    }
  }
  return { mapa: m as unknown as MapaGl, tocar };
}

function tooltipFalso() {
  const estado = { abierto: false, texto: '' };
  const t = {
    setLngLat: () => t,
    setText: (texto: string) => {
      estado.texto = texto;
      return t;
    },
    addTo: () => {
      estado.abierto = true;
      return t;
    },
    remove: () => {
      estado.abierto = false;
      return t;
    },
  };
  return { tooltip: t as unknown as Popup, estado };
}

describe('tooltip de la coropleta en pantallas táctiles', () => {
  const descripciones: Record<string, string> = { D07: 'Distrito 7 · 5 inundaciones activas' };

  it('tocar un distrito muestra su texto vigente', () => {
    const { mapa, tocar } = mapaFalso();
    const { tooltip, estado } = tooltipFalso();
    conectarTooltipRelleno(mapa, CAPA, tooltip, (c) => descripciones[c]);
    tocar('D07');
    expect(estado).toEqual({ abierto: true, texto: 'Distrito 7 · 5 inundaciones activas' });
  });

  it('tocar fuera de todo polígono lo cierra (en táctil no hay «mouseleave»)', () => {
    const { mapa, tocar } = mapaFalso();
    const { tooltip, estado } = tooltipFalso();
    conectarTooltipRelleno(mapa, CAPA, tooltip, (c) => descripciones[c]);
    tocar('D07');
    tocar(null);
    expect(estado.abierto).toBe(false);
  });

  it('un polígono sin texto también lo cierra, en vez de dejar el anterior', () => {
    const { mapa, tocar } = mapaFalso();
    const { tooltip, estado } = tooltipFalso();
    conectarTooltipRelleno(mapa, CAPA, tooltip, (c) => descripciones[c]);
    tocar('D07');
    tocar('D99');
    expect(estado.abierto).toBe(false);
  });
});
