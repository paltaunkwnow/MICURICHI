import { etiquetaDistrito, etiquetaUnidadVecinal } from './formato';

/** Zona (distrito o unidad vecinal) elegida en el mapa. */
export interface ZonaSeleccionada {
  id: string;
  codigo: string;
  nombre: string;
}

/** Lo mínimo de una feature de MapLibre que mira este módulo. */
interface FeatureZona {
  id?: string | number;
  properties?: Record<string, unknown> | null;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Identidad de una zona a partir de su feature del mapa. Se toma SIEMPRE de `properties` y nunca de
 * `feature.id`: las capas administrativas se cargan sin `promoteId`, así que MapLibre numera las
 * features (0, 1, 2…) y `feature.id` sería ese índice —no el id estable «unidad_vecinal:0-2»—. Con
 * ese número la bandeja filtraba por `unidad_vecinal_id=0`, no traía nada y los selectores no
 * mostraban la zona (defecto reproducido en Mapa.tsx). Devuelve `null` si la feature no trae un id
 * usable.
 */
export function zonaDeFeature(
  feature: FeatureZona | null | undefined,
  tipo: 'distrito' | 'uv',
): ZonaSeleccionada | null {
  const p = feature?.properties;
  if (!p) return null;
  const prefijo = tipo === 'uv' ? 'unidad_vecinal' : 'distrito_municipal';
  const idProp = texto(p.id);
  const codigo = texto(p.codigo) || (idProp ? (idProp.split(':').pop() ?? '') : '');
  // Sin id ni código no hay forma de identificar la zona: mejor no filtrar que filtrar mal.
  if (!idProp && !codigo) return null;
  const id = idProp || `${prefijo}:${codigo}`;
  const nombre = texto(p.nombre) || (tipo === 'uv' ? `UV ${codigo}` : `Distrito ${codigo}`);
  return { id, codigo, nombre };
}

/** Redondea un bbox "minLon,minLat,maxLon,maxLat" a 5 decimales (~1 m), como pide la API. */
export function redondearBbox(bbox: string): string {
  return bbox
    .split(',')
    .map((n) => Number.parseFloat(n).toFixed(5))
    .join(',');
}

/** Límites de MapLibre (`map.getBounds()`) convertidos al bbox string que acepta la API. */
export interface LimitesMapa {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

export function bboxDeLimites(b: LimitesMapa): string {
  return redondearBbox(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
}

/**
 * Texto del chip «Mirando»: el distrito y la UV que quedan en el centro del mapa, p. ej.
 * «Mirando: Distrito 11 · UV CI». `null` cuando el centro no cae en ninguna zona (fuera de la
 * ciudad o con las capas apagadas), para no mostrar un chip vacío.
 */
export function textoZonaCentro(
  distrito: ZonaSeleccionada | null,
  uv: ZonaSeleccionada | null,
): string | null {
  const partes: string[] = [];
  if (distrito) partes.push(etiquetaDistrito(distrito.codigo));
  if (uv) partes.push(etiquetaUnidadVecinal(uv.codigo));
  return partes.length ? `Mirando: ${partes.join(' · ')}` : null;
}
