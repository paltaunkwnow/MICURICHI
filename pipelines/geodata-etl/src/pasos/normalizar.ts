/** Normalización de atributos (CLAUDE.md §6.5): snake_case sin tildes, campos mínimos, ids estables. */

import { createHash } from 'node:crypto';
import type { TipoCapa } from 'contracts';
import type { Feature, FeatureCollection } from 'geojson';

export function snakeCase(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/** Heurística para elegir el campo de código/nombre cuando la config no lo fija. */
export function autodetectarCampo(
  campos: string[],
  rol: 'codigo' | 'nombre' | 'distrito' | 'unidad_vecinal',
  capa: TipoCapa,
): string | null {
  const c = campos.map((k) => ({ k, s: snakeCase(k) }));
  const sufijo =
    capa === 'distrito_municipal'
      ? ['dm', 'dist', 'distrito']
      : capa === 'unidad_vecinal'
        ? ['uv', 'unidad', 'vecinal']
        : ['mz', 'manzana', 'manz'];
  const buscar = (prefijos: string[], claves: string[]) =>
    c.find(({ s }) => prefijos.some((p) => s.startsWith(p)) && claves.some((q) => s.includes(q)))
      ?.k ??
    c.find(({ s }) => prefijos.some((p) => s.startsWith(p)))?.k ??
    null;
  if (rol === 'codigo')
    return (
      buscar(['cod', 'id', 'codigo', 'num'], sufijo) ??
      c.find(({ s }) => s === 'codigo' || s === 'id')?.k ??
      null
    );
  if (rol === 'nombre')
    return (
      buscar(['nom', 'nombre', 'name', 'desc'], sufijo) ??
      c.find(({ s }) => s.startsWith('nom'))?.k ??
      null
    );
  if (rol === 'distrito')
    return (
      c.find(
        ({ s }) =>
          (s.startsWith('cod') || s.startsWith('id') || s.startsWith('num')) &&
          (s.includes('dm') || s.includes('dist')),
      )?.k ?? null
    );
  return (
    c.find(
      ({ s }) =>
        (s.startsWith('cod') || s.startsWith('id') || s.startsWith('num')) &&
        (s.includes('uv') || s.includes('vecinal')),
    )?.k ?? null
  );
}

export interface OpcionesNormalizacion {
  capa: TipoCapa;
  version: string;
  fuente: string;
  fecha_vigencia: string | null;
  campoCodigo: string;
  campoNombre: string | null;
  /** Campo único de respaldo (p. ej. OBJECTID) cuando el código viene vacío. */
  campoRespaldo?: string | null;
  /** Plantilla para construir el nombre cuando la capa no trae campo de nombre, p. ej. "Unidad Vecinal {codigo}". */
  plantillaNombre?: string | null;
  /** Se llama por cada id repetido o código vacío que hubo que resolver. */
  alResolverId?: (aviso: {
    tipo: 'codigo_vacio' | 'id_repetido';
    id: string;
    detalle: string;
  }) => void;
  campoDistrito?: string | null;
  campoUv?: string | null;
  /**
   * Padre ya resuelto por `asignarPadre` (índice → id del padre): el declarado si existe en la
   * capa padre, y si no el que contiene al hijo. Cuando viene, manda sobre el campo declarado.
   * Hace falta porque la entrega real trae hijos que declaran un padre que no está en su capa:
   * copiarlo tal cual dejaría una clave foránea que no resuelve.
   */
  padreResuelto?: Map<number, string>;
  uvResuelta?: Map<number, string>;
  /** Índices cuyo padre se dedujo por contención, para marcar `distrito_inferido`. */
  distritoInferido?: Set<number>;
}

export function idCapa(capa: TipoCapa, codigo: string): string {
  return `${capa}:${codigo}`;
}

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Orden estable entre features que comparten código: huella de la geometría redondeada a la
 * precisión de salida (7 decimales) y, si la geometría coincide, de los atributos. No depende de
 * la posición en el archivo.
 */
function huella(f: Feature): string {
  const r = (c: unknown): unknown =>
    typeof c === 'number' ? Math.round(c * 1e7) / 1e7 : Array.isArray(c) ? c.map(r) : c;
  const g = f.geometry as { type?: string; coordinates?: unknown } | null;
  const atributos = Object.entries(f.properties ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  return `${hash([g?.type ?? null, r(g?.coordinates ?? null)])}${hash(atributos)}`;
}

interface CodigoAsignado {
  codigo: string;
  /** Código de origen si hubo que desambiguarlo (repetido). */
  repetido?: { original: string; veces: number };
  /** Campo del que salió el código cuando el configurado venía vacío (null = correlativo). */
  sinCodigo?: { respaldo: string | null };
}

/**
 * Código final de cada feature. El código vacío toma el respaldo (OBJECTID); los repetidos se
 * desambiguan con -2, -3… y los que no tienen nada reciben sin_codigo_1, _2…
 *
 * Los sufijos se asignaban por orden de aparición: si el municipio reentregaba la misma capa con
 * las filas en otro orden, cambiaban los ids (y con ellos a qué polígono apunta un reporte). Ahora
 * se asignan por la huella de cada feature, y ningún sufijo pisa un código que ya existe en la capa
 * (un «12-2» real conserva su id aunque «12» esté repetido).
 */
function asignarCodigos(fc: FeatureCollection, o: OpcionesNormalizacion): CodigoAsignado[] {
  const asignados: CodigoAsignado[] = fc.features.map((f) => {
    const p = f.properties ?? {};
    const codigo = texto(p[o.campoCodigo]);
    if (codigo) return { codigo };
    // sin código: el campo de respaldo (OBJECTID) para no perder la geometría ni colisionar
    const respaldo = o.campoRespaldo ? texto(p[o.campoRespaldo]) : '';
    return { codigo: respaldo, sinCodigo: { respaldo: respaldo ? o.campoRespaldo! : null } };
  });
  const existentes = new Set(asignados.map((a) => a.codigo).filter(Boolean));
  const grupos = new Map<string, number[]>();
  asignados.forEach((a, i) => {
    const g = grupos.get(a.codigo);
    if (g) g.push(i);
    else grupos.set(a.codigo, [i]);
  });
  for (const [codigo, indices] of grupos) {
    if (codigo && indices.length === 1) continue;
    const huellas = new Map(indices.map((i) => [i, huella(fc.features[i]!)]));
    // a igual huella las features son indistinguibles: cualquier orden da la misma salida
    const orden = [...indices].sort((a, b) => {
      const ha = huellas.get(a)!;
      const hb = huellas.get(b)!;
      return ha < hb ? -1 : ha > hb ? 1 : a - b;
    });
    let n = codigo ? 2 : 1;
    orden.forEach((i, k) => {
      if (codigo && k === 0) return; // la primera conserva el código tal cual
      let candidato: string;
      do {
        candidato = codigo ? `${codigo}-${n}` : `sin_codigo_${n}`;
        n++;
      } while (existentes.has(candidato));
      const a = asignados[i]!;
      if (codigo) a.repetido = { original: codigo, veces: indices.length };
      a.codigo = candidato;
    });
  }
  return asignados;
}

export function normalizar(fc: FeatureCollection, o: OpcionesNormalizacion): FeatureCollection {
  const codigos = asignarCodigos(fc, o);
  const features: Feature[] = fc.features.map((f, i) => {
    const p = f.properties ?? {};
    const { codigo, repetido, sinCodigo } = codigos[i]!;
    if (sinCodigo)
      o.alResolverId?.({
        tipo: 'codigo_vacio',
        id: idCapa(o.capa, codigo),
        detalle: `feature ${i + 1} sin ${o.campoCodigo}; se usó ${sinCodigo.respaldo ?? 'un correlativo estable (por geometría)'}`,
      });
    if (repetido)
      o.alResolverId?.({
        tipo: 'id_repetido',
        id: idCapa(o.capa, codigo),
        detalle: `el código ${repetido.original} aparece ${repetido.veces} veces; esta geometría quedó como ${codigo}`,
      });
    const nombreOriginal = o.campoNombre ? p[o.campoNombre] : null;
    const nombre = String(
      nombreOriginal ??
        (o.plantillaNombre ? o.plantillaNombre.replace('{codigo}', codigo) : codigo),
    ).trim();
    const props: Record<string, unknown> = {
      id: idCapa(o.capa, codigo),
      codigo,
      nombre,
      tipo: o.capa,
      version_capa: o.version,
      fuente: o.fuente,
      fecha_vigencia: o.fecha_vigencia,
    };
    const idPadre = (tipo: TipoCapa, valor: string | null): string | null =>
      valor ? (valor.startsWith(`${tipo}:`) ? valor : idCapa(tipo, valor)) : null;
    const declaradoDe = (campo: string | null | undefined): string | null => {
      const v = campo ? p[campo] : null;
      return v !== null && v !== undefined && v !== '' ? String(v).trim() : null;
    };
    if (o.capa !== 'distrito_municipal') {
      const codigoDistrito = o.padreResuelto
        ? (o.padreResuelto.get(i) ?? null)
        : declaradoDe(o.campoDistrito);
      props.distrito_id = idPadre('distrito_municipal', codigoDistrito);
      if (o.capa === 'unidad_vecinal') props.distrito_inferido = !!o.distritoInferido?.has(i);
    }
    if (o.capa === 'manzana') {
      const codigoUv = o.uvResuelta ? (o.uvResuelta.get(i) ?? null) : declaradoDe(o.campoUv);
      props.unidad_vecinal_id = idPadre('unidad_vecinal', codigoUv);
    }
    // Atributos originales conservados en snake_case bajo `orig_` para trazabilidad (sin tildes)
    for (const [k, v] of Object.entries(p)) props[`orig_${snakeCase(k)}`] = v;
    return { type: 'Feature', id: props.id as string, geometry: f.geometry, properties: props };
  });
  return { type: 'FeatureCollection', features };
}

/** Redondea coordenadas a N decimales (7 ≈ 1 cm) para salida estable y byte a byte reproducible. */
export function redondearCoordenadas(fc: FeatureCollection, decimales: number): FeatureCollection {
  const factor = 10 ** decimales;
  const r = (n: number) => Math.round(n * factor) / factor;
  const rec = (c: unknown): unknown =>
    Array.isArray(c) ? (typeof c[0] === 'number' ? (c as number[]).map(r) : c.map(rec)) : c;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry
        ? ({
            ...f.geometry,
            coordinates: rec((f.geometry as { coordinates: unknown }).coordinates),
          } as Feature['geometry'])
        : f.geometry,
    })),
  };
}

/**
 * Campos que necesita el render y nada más. `geo-service` construye exactamente estos mismos
 * cuando tiene que leer la capa de PostGIS en vez del archivo, así que las dos rutas coinciden.
 */
const CAMPOS_WEB = [
  'id',
  'codigo',
  'nombre',
  'tipo',
  'version_capa',
  'distrito_id',
  'unidad_vecinal_id',
] as const;

/**
 * Deja en el GeoJSON de render solo los campos que el mapa usa.
 *
 * Medido sobre la entrega real: de los 25 MB del `web.geojson` de manzanas, 16 MB eran
 * propiedades y solo 9 MB geometría. El grueso no lo usa nadie para dibujar —la cadena de
 * `fuente` repetida 27 000 veces, las fechas de edición del origen, `SHAPE_STAr`…— pero sí lo
 * paga el navegador: esas propiedades viajan dentro de cada feature de cada tesela MVT, y
 * geo-service las mantiene en memoria junto con el índice de teselas.
 *
 * Los atributos originales no se pierden: siguen enteros en `<capa>.full.geojson`, que es lo que
 * se carga a PostGIS, y de ahí salen las consultas y las exportaciones.
 */
export function soloCamposDeRender(fc: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const p = f.properties ?? {};
      const props: Record<string, unknown> = {};
      for (const k of CAMPOS_WEB) if (k in p) props[k] = p[k];
      return { ...f, properties: props };
    }),
  };
}
