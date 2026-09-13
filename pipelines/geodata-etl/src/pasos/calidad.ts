/**
 * Validación topológica y reporte de calidad (CLAUDE.md §6.4) con turf + rbush.
 * Detecta: geometrías inválidas, vacías, duplicadas, solapes entre polígonos (con área), huecos
 * respecto de la capa contenedora (solo distrito/UV), y unidades sin padre o con centroide fuera del padre.
 */
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import RBush from 'rbush';

export interface Hallazgo {
  tipo:
    | 'invalida'
    | 'vacia'
    | 'duplicada'
    | 'solape'
    | 'hueco'
    | 'sin_padre'
    | 'fuera_de_padre'
    | 'reparada'
    | 'reparacion_no_segura';
  ids: string[];
  detalle?: string;
  area_m2?: number;
}

export interface ReporteCalidad {
  capa: string;
  n_entrada: number;
  n_salida: number;
  tipos_geometria: Record<string, number>;
  atributos: Array<{ campo: string; tipo: string; nulos: number }>;
  bbox: [number, number, number, number] | null;
  hallazgos: Hallazgo[];
  resumen: Record<string, number>;
}

type Poli = Feature<Polygon | MultiPolygon>;

export function idDe(f: Feature, i: number): string {
  return String(f.id ?? f.properties?.id ?? f.properties?.codigo ?? `#${i}`);
}

export function estadisticas(
  fc: FeatureCollection,
  capa: string,
): Pick<ReporteCalidad, 'capa' | 'n_entrada' | 'tipos_geometria' | 'atributos' | 'bbox'> {
  const tipos: Record<string, number> = {};
  const campos = new Map<string, { tipo: string; nulos: number }>();
  for (const f of fc.features) {
    const t = f.geometry?.type ?? 'null';
    tipos[t] = (tipos[t] ?? 0) + 1;
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      const c = campos.get(k) ?? { tipo: typeof v, nulos: 0 };
      if (v === null || v === undefined || v === '') c.nulos++;
      else if (c.tipo === 'object') c.tipo = typeof v;
      campos.set(k, c);
    }
  }
  const bbox = fc.features.length ? (turf.bbox(fc) as [number, number, number, number]) : null;
  return {
    capa,
    n_entrada: fc.features.length,
    tipos_geometria: tipos,
    atributos: [...campos.entries()].map(([campo, c]) => ({ campo, ...c })),
    bbox,
  };
}

function esPoligono(f: Feature): f is Poli {
  return f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
}

export function validarGeometrias(fc: FeatureCollection): Hallazgo[] {
  const h: Hallazgo[] = [];
  const vistos = new Map<string, string>();
  fc.features.forEach((f, i) => {
    const id = idDe(f, i);
    if (!f.geometry) {
      h.push({ tipo: 'vacia', ids: [id] });
      return;
    }
    if (!esPoligono(f)) return;
    if (!turf.booleanValid(f) || turf.kinks(f).features.length > 0) {
      // una "pajarita" (auto-intersección) tiene área de fórmula 0: es inválida, no vacía
      h.push({ tipo: 'invalida', ids: [id], detalle: 'auto-intersección o anillo mal formado' });
      return;
    }
    if (turf.area(f) === 0) {
      h.push({ tipo: 'vacia', ids: [id] });
      return;
    }
    const firma = JSON.stringify(f.geometry.coordinates);
    const previo = vistos.get(firma);
    if (previo) h.push({ tipo: 'duplicada', ids: [previo, id] });
    else vistos.set(firma, id);
  });
  return h;
}

interface Caja {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  i: number;
}

function indexar(fc: FeatureCollection): RBush<Caja> {
  const arbol = new RBush<Caja>();
  const cajas: Caja[] = [];
  fc.features.forEach((f, i) => {
    if (!f.geometry) return;
    const [minX, minY, maxX, maxY] = turf.bbox(f);
    cajas.push({ minX: minX!, minY: minY!, maxX: maxX!, maxY: maxY!, i });
  });
  arbol.load(cajas);
  return arbol;
}

/** Solapes entre polígonos de la misma capa con área de intersección. `minArea` filtra deslizamientos de vértices. */
export function detectarSolapes(fc: FeatureCollection, minAreaM2 = 1, maxPares = 5000): Hallazgo[] {
  const h: Hallazgo[] = [];
  const arbol = indexar(fc);
  let pares = 0;
  fc.features.forEach((f, i) => {
    if (!esPoligono(f)) return;
    const [minX, minY, maxX, maxY] = turf.bbox(f);
    for (const c of arbol.search({ minX: minX!, minY: minY!, maxX: maxX!, maxY: maxY! })) {
      if (c.i <= i) continue;
      const g = fc.features[c.i]!;
      if (!esPoligono(g)) continue;
      if (++pares > maxPares) return;
      try {
        const inter = turf.intersect(turf.featureCollection([f, g]));
        if (!inter) continue;
        const area = turf.area(inter);
        if (area >= minAreaM2)
          h.push({
            tipo: 'solape',
            ids: [idDe(f, i), idDe(g, c.i)],
            area_m2: Math.round(area * 100) / 100,
          });
      } catch {
        /* geometrías inválidas ya reportadas */
      }
    }
  });
  return h;
}

/** Huecos: área del padre no cubierta por sus hijos (solo para capas que deben teselar al padre, p. ej. UV dentro de distrito). */
export function detectarHuecos(
  padres: FeatureCollection,
  hijos: FeatureCollection,
  campoPadre: string,
  minAreaM2 = 25,
): Hallazgo[] {
  const h: Hallazgo[] = [];
  if (hijos.features.length > 3000)
    return [
      { tipo: 'hueco', ids: [], detalle: 'omitido: demasiadas features para calcular huecos' },
    ];
  padres.features.forEach((p, i) => {
    if (!esPoligono(p)) return;
    const idPadre = idDe(p, i);
    const mios = hijos.features.filter(
      (c) => esPoligono(c) && String(c.properties?.[campoPadre]) === idPadre,
    ) as Poli[];
    if (!mios.length) return;
    try {
      const union = mios.length === 1 ? mios[0]! : turf.union(turf.featureCollection(mios));
      if (!union) return;
      const resto = turf.difference(turf.featureCollection([p, union as Poli]));
      if (!resto) return;
      const area = turf.area(resto);
      if (area >= minAreaM2)
        h.push({
          tipo: 'hueco',
          ids: [idPadre],
          area_m2: Math.round(area),
          detalle: `área del padre no cubierta por sus ${mios.length} hijos`,
        });
    } catch (e) {
      h.push({
        tipo: 'hueco',
        ids: [idPadre],
        detalle: `no se pudo calcular: ${(e as Error).message}`,
      });
    }
  });
  return h;
}

/** Asigna padre por el punto representativo de cada hijo. Devuelve el mapa hijo→padre y hallazgos. */
export function asignarPadre(
  hijos: FeatureCollection,
  padres: FeatureCollection,
  campoDeclarado: string | null,
): { asignacion: Map<number, string>; inferidos: Set<number>; hallazgos: Hallazgo[] } {
  const arbol = indexar(padres);
  const asignacion = new Map<number, string>();
  const inferidos = new Set<number>();
  const hallazgos: Hallazgo[] = [];
  hijos.features.forEach((c, i) => {
    if (!esPoligono(c)) return;
    const punto = turf.pointOnFeature(c);
    const [x, y] = punto.geometry.coordinates as [number, number];
    let contenedor: string | null = null;
    for (const caja of arbol.search({ minX: x, minY: y, maxX: x, maxY: y })) {
      const p = padres.features[caja.i]!;
      if (esPoligono(p) && turf.booleanPointInPolygon(punto, p)) {
        contenedor = idDe(p, caja.i);
        break;
      }
    }
    const declarado = campoDeclarado ? c.properties?.[campoDeclarado] : null;
    const idHijo = idDe(c, i);
    if (declarado !== null && declarado !== undefined && declarado !== '') {
      // el código declarado ("D01") se compara con el id normalizado del padre ("distrito_municipal:D01")
      const tipoPadre = padres.features[0]?.properties?.tipo as string | undefined;
      const declaradoId =
        tipoPadre && !String(declarado).includes(':')
          ? `${tipoPadre}:${String(declarado).trim()}`
          : String(declarado).trim();
      asignacion.set(i, declaradoId);
      if (contenedor && contenedor !== declaradoId)
        hallazgos.push({
          tipo: 'fuera_de_padre',
          ids: [idHijo],
          detalle: `declara ${declarado} pero su punto representativo cae en ${contenedor}`,
        });
    } else if (contenedor) {
      asignacion.set(i, contenedor);
      inferidos.add(i);
    } else {
      hallazgos.push({ tipo: 'sin_padre', ids: [idHijo] });
    }
  });
  return { asignacion, inferidos, hallazgos };
}

export function resumir(hallazgos: Hallazgo[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const h of hallazgos) r[h.tipo] = (r[h.tipo] ?? 0) + 1;
  return r;
}
