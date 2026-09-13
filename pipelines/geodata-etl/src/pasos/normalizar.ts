/** Normalización de atributos (CLAUDE.md §6.5): snake_case sin tildes, campos mínimos, ids estables. */

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
  /** Padre inferido espacialmente cuando el campo no existe (índice → id del padre). */
  distritoInferido?: Map<number, string>;
  uvInferida?: Map<number, string>;
}

export function idCapa(capa: TipoCapa, codigo: string): string {
  return `${capa}:${codigo}`;
}

export function normalizar(fc: FeatureCollection, o: OpcionesNormalizacion): FeatureCollection {
  const vistos = new Map<string, number>();
  const features: Feature[] = fc.features.map((f, i) => {
    const p = f.properties ?? {};
    let codigo = String(p[o.campoCodigo] ?? '').trim();
    if (!codigo) {
      // sin código: se usa el campo de respaldo (OBJECTID) para no perder la geometría ni colisionar
      const respaldo = o.campoRespaldo ? String(p[o.campoRespaldo] ?? '').trim() : '';
      codigo = respaldo || `sin_codigo_${i + 1}`;
      o.alResolverId?.({
        tipo: 'codigo_vacio',
        id: idCapa(o.capa, codigo),
        detalle: `feature ${i + 1} sin ${o.campoCodigo}; se usó ${o.campoRespaldo ?? 'un correlativo'}`,
      });
    }
    const repeticiones = vistos.get(codigo) ?? 0;
    vistos.set(codigo, repeticiones + 1);
    if (repeticiones > 0) {
      const original = codigo;
      codigo = `${codigo}-${repeticiones + 1}`;
      o.alResolverId?.({
        tipo: 'id_repetido',
        id: idCapa(o.capa, codigo),
        detalle: `el código ${original} aparece ${repeticiones + 1} veces; esta geometría quedó como ${codigo}`,
      });
    }
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
    if (o.capa !== 'distrito_municipal') {
      const declarado = o.campoDistrito ? p[o.campoDistrito] : null;
      const inferido = o.distritoInferido?.get(i);
      const codigoDistrito =
        declarado !== null && declarado !== undefined && declarado !== ''
          ? String(declarado).trim()
          : (inferido ?? null);
      props.distrito_id = codigoDistrito
        ? codigoDistrito.startsWith('distrito_municipal:')
          ? codigoDistrito
          : idCapa('distrito_municipal', codigoDistrito)
        : null;
      if (o.capa === 'unidad_vecinal') props.distrito_inferido = !!inferido && !declarado;
    }
    if (o.capa === 'manzana') {
      const declarada = o.campoUv ? p[o.campoUv] : null;
      const inferida = o.uvInferida?.get(i);
      const codigoUv =
        declarada !== null && declarada !== undefined && declarada !== ''
          ? String(declarada).trim()
          : (inferida ?? null);
      props.unidad_vecinal_id = codigoUv
        ? codigoUv.startsWith('unidad_vecinal:')
          ? codigoUv
          : idCapa('unidad_vecinal', codigoUv)
        : null;
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
