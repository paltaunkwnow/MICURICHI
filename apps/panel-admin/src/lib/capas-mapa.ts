/**
 * Capas administrativas del mapa del panel, con la huella del contenido en la URL (contracts
 * 0.12.0). Mismo enfoque que `apps/web-ciudadano/src/lib/capas-con-huella.ts`, sin importar entre
 * apps.
 *
 * geo-service pone en `CapaInfo.url` una ruta con la huella de lo que sirve y la responde
 * `immutable` por un año. Cuando un administrador activa otra versión, la huella vieja responde
 * `410 CAPA_CAMBIO`: el mapa vuelve a pedir `/geo/v1/capas` y apunta cada fuente a su URL nueva,
 * sin recargar la página.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { CapaInfo } from 'contracts';
import type { LayerSpecification, Map as MapaGl } from 'maplibre-gl';
import { consultaCapasMapa } from './consultas';

const CAPA_CON_HUELLA = /\/geo\/v1\/capas\/([a-z_]+)\/v\/([0-9a-f]{16})$/;
const TESELA_CON_HUELLA =
  /\/geo\/v1\/teselas\/([a-z_]+)\/([0-9a-f]{16})\/[^/]+\/[^/]+\/[^/]+\.mvt$/;

/** Capa y huella de una URL de capa o de tesela (o de su plantilla); `null` si no lleva huella. */
export function huellaDeUrl(url: string): { capa: string; huella: string } | null {
  const ruta = url.split(/[?#]/)[0] ?? '';
  const m = CAPA_CON_HUELLA.exec(ruta) ?? TESELA_CON_HUELLA.exec(ruta);
  return m?.[1] && m[2] ? { capa: m[1], huella: m[2] } : null;
}

/**
 * Detector del 410 de una capa cuya huella el mapa todavía cree vigente, para el evento `error`
 * del mapa (MapLibre pasa un `AJAXError` con `status` y `url`). Una pantalla de teselas viejas da
 * una ráfaga de 410: solo el primero de cada huella pide recargar. Los rezagados, y los que siguen
 * llegando si geo-service tarda en publicar la lista nueva, no vuelven a pedirla.
 */
export function detectorDeCapaCambiada(): (error: unknown, capas: readonly CapaInfo[]) => boolean {
  const avisadas = new Set<string>();
  return (error, capas) => {
    if (typeof error !== 'object' || error === null) return false;
    const { status, url } = error as { status?: unknown; url?: unknown };
    if (status !== 410 || typeof url !== 'string') return false;
    const fallida = huellaDeUrl(url);
    if (!fallida) return false;
    const vigente = capas.find((c) => c.capa === fallida.capa);
    if (!vigente || huellaDeUrl(vigente.url)?.huella !== fallida.huella) return false;
    const clave = `${fallida.capa}:${fallida.huella}`;
    if (avisadas.has(clave)) return false;
    avisadas.add(clave);
    return true;
  };
}

/**
 * Vuelve a pedir `/geo/v1/capas`. `cancelRefetch: false`: si ya hay una petición en vuelo se
 * espera esa, en vez de cortarla y empezar otra.
 */
export function recargarCapasMapa(cliente: QueryClient): Promise<void> {
  return cliente.invalidateQueries(
    { queryKey: consultaCapasMapa().queryKey },
    { cancelRefetch: false },
  );
}

/** Lo que hace falta de una fuente de MapLibre para cambiarle la URL. */
type Fuente = {
  type: string;
  setData?: (datos: string) => unknown;
  setTiles?: (t: string[]) => unknown;
};

/** URL de `CapaInfo` (relativa, con huella) con la que se creó o se apuntó cada fuente. */
const urlPorFuente = new WeakMap<object, string>();

export function anotarUrlDeFuente(fuente: object | undefined, url: string): void {
  if (fuente) urlPorFuente.set(fuente, url);
}

export function urlDeFuente(fuente: object | undefined): string | undefined {
  return fuente ? urlPorFuente.get(fuente) : undefined;
}

/**
 * Apunta la fuente de una capa a la URL de `CapaInfo`. `'otro-modo'` si la capa pasó de GeoJSON a
 * teselas o al revés: MapLibre no cambia el tipo de una fuente, hay que rehacerla.
 */
export function apuntarFuenteA(
  fuente: Fuente,
  c: CapaInfo,
  origen: string,
): 'igual' | 'cambiada' | 'otro-modo' {
  const tipo = c.modo === 'teselas' ? 'vector' : 'geojson';
  if (fuente.type !== tipo) return 'otro-modo';
  if (urlPorFuente.get(fuente) === c.url) return 'igual';
  if (tipo === 'vector') fuente.setTiles?.([`${origen}${c.url}`]);
  else fuente.setData?.(`${origen}${c.url}`);
  urlPorFuente.set(fuente, c.url);
  return 'cambiada';
}

export type MapaConCapas = Pick<
  MapaGl,
  'getSource' | 'addSource' | 'removeSource' | 'getLayer' | 'addLayer' | 'removeLayer'
>;

/**
 * Solo se dibujan las capas con estilo. La de manzanas se sigue sirviendo y listando, pero el
 * panel dejó de pintarla (corrida 2026-09-25-quitar-campos-del-reporte): no volver a darle un
 * estilo por defecto, porque eso la haría pedir sus teselas otra vez.
 */
const ESTILOS: Record<string, { color: string; ancho: number; minzoom: number; opacidad: number }> =
  {
    distrito_municipal: { color: '#0A4A69', ancho: 2.5, minzoom: 9, opacidad: 0.85 },
    unidad_vecinal: { color: '#0D6189', ancho: 1.2, minzoom: 11, opacidad: 0.75 },
  };

/** Capa de puntos por debajo de la cual van los contornos y nombres de las capas. */
const CAPA_DE_PUNTOS = 'puntos-halo';

/**
 * Agrega las capas administrativas al mapa o, si ya están, las apunta a la URL vigente: tras un
 * 410 CAPA_CAMBIO la lista trae otra huella. Si una capa cambió de GeoJSON a teselas (o al revés),
 * se quitan su fuente y sus capas y se vuelven a agregar.
 */
export function aplicarCapas(m: MapaConCapas, capas: readonly CapaInfo[], origen: string): void {
  for (const c of capas) {
    const e = ESTILOS[c.capa];
    if (!e) continue;
    const id = `capa-${c.capa}`;
    const existente = m.getSource(id);
    if (existente) {
      if (apuntarFuenteA(existente as Fuente, c, origen) !== 'otro-modo') continue;
      for (const sufijo of ['-linea', '-nombre'])
        if (m.getLayer(`${id}${sufijo}`)) m.removeLayer(`${id}${sufijo}`);
      m.removeSource(id);
    }
    if (c.modo === 'teselas') {
      // `minzoom` del ORIGEN, no solo de la capa: sin él MapLibre puede pedir teselas de zooms
      // en los que la capa no se pinta.
      m.addSource(id, {
        type: 'vector',
        tiles: [`${origen}${c.url}`],
        minzoom: e.minzoom,
        maxzoom: 16,
      });
    } else {
      m.addSource(id, { type: 'geojson', data: `${origen}${c.url}` });
    }
    anotarUrlDeFuente(m.getSource(id), c.url);
    const base = c.modo === 'teselas' ? { source: id, 'source-layer': c.capa } : { source: id };
    m.addLayer(
      {
        id: `${id}-linea`,
        type: 'line',
        ...base,
        minzoom: e.minzoom,
        paint: { 'line-color': e.color, 'line-width': e.ancho, 'line-opacity': e.opacidad },
      } as LayerSpecification,
      CAPA_DE_PUNTOS,
    );
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
      } as LayerSpecification,
      CAPA_DE_PUNTOS,
    );
  }
}
