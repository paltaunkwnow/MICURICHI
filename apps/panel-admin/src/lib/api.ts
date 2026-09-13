import type {
  AgregadoUv,
  CapaInfo,
  CapaVersion,
  Indicadores,
  Login,
  ReporteCambiarEstado,
  ReporteFusionar,
  ReporteReclasificar,
  ReporteTecnico,
  Usuario,
} from 'contracts';

/** Error devuelto por api-core o geo-service ({ codigo, mensaje, detalles }) con el status HTTP. */
export class ErrorApi extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
    public estado: number,
    public detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

/** Feature tal como la ve el técnico: coordenada exacta y todas las propiedades de moderación. */
export interface ReporteTecnicoFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: ReporteTecnico;
}

export interface ReporteTecnicoColeccion {
  type: 'FeatureCollection';
  features: ReporteTecnicoFeature[];
  total: number;
  pagina: number;
  limite: number;
}

/** Unidad administrativa tomada de las capas de geo-service (para poblar los selectores). */
export interface UnidadGeo {
  id: string;
  codigo: string;
  nombre: string;
  distrito_id: string | null;
}

interface FeatureCollectionUnidades {
  type: 'FeatureCollection';
  features: Array<{
    id?: string | number;
    properties: { id?: string; codigo?: string; nombre?: string; distrito_id?: string | null };
  }>;
}

export type ParametrosConsulta = Record<string, string | undefined>;

export function aQuery(params: ParametrosConsulta): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const conCuerpo = init?.body !== undefined && init.body !== null;
  const r = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(conCuerpo ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!r.ok) {
    let cuerpo: { codigo?: string; mensaje?: string; detalles?: unknown } = {};
    try {
      cuerpo = (await r.json()) as typeof cuerpo;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ErrorApi(
      cuerpo.codigo ?? 'ERROR',
      cuerpo.mensaje ?? `Error ${r.status}`,
      r.status,
      cuerpo.detalles,
    );
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

// --- Sesión -------------------------------------------------------------

export function iniciarSesion(credenciales: Login) {
  return pedir<Usuario>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(credenciales),
  });
}

export function cerrarSesion() {
  return pedir<undefined>('/api/v1/auth/logout', { method: 'POST' });
}

export function obtenerYo() {
  return pedir<Usuario>('/api/v1/auth/yo');
}

// --- Reportes -----------------------------------------------------------

export function obtenerReportes(params: ParametrosConsulta) {
  return pedir<ReporteTecnicoColeccion>(`/api/v1/reportes?${aQuery(params)}`);
}

export function obtenerReporte(id: string) {
  return pedir<ReporteTecnicoFeature>(`/api/v1/reportes/${encodeURIComponent(id)}`);
}

export function cambiarEstado(id: string, cuerpo: ReporteCambiarEstado) {
  return pedir<ReporteTecnicoFeature>(`/api/v1/reportes/${encodeURIComponent(id)}/estado`, {
    method: 'PATCH',
    body: JSON.stringify(cuerpo),
  });
}

export function reclasificarSeveridad(id: string, cuerpo: ReporteReclasificar) {
  return pedir<ReporteTecnicoFeature>(`/api/v1/reportes/${encodeURIComponent(id)}/severidad`, {
    method: 'PATCH',
    body: JSON.stringify(cuerpo),
  });
}

export function fusionarReporte(id: string, cuerpo: ReporteFusionar) {
  return pedir<ReporteTecnicoFeature>(`/api/v1/reportes/${encodeURIComponent(id)}/fusionar`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
}

/** Enlace de descarga con los filtros actuales; se usa en un <a download>. */
export function urlExportar(formato: 'csv' | 'geojson', params: ParametrosConsulta) {
  return `/api/v1/exportar?${aQuery({ ...params, formato })}`;
}

// --- Indicadores y capas -------------------------------------------------

export function obtenerIndicadores() {
  return pedir<Indicadores>('/api/v1/indicadores');
}

export function obtenerVersionesCapas() {
  return pedir<CapaVersion[]>('/api/v1/admin/capas');
}

export function activarCapa(id: string) {
  return pedir<CapaVersion>(`/api/v1/admin/capas/${encodeURIComponent(id)}/activar`, {
    method: 'POST',
  });
}

export function obtenerCapasMapa() {
  return pedir<CapaInfo[]>('/geo/v1/capas');
}

export function obtenerAgregadosUv() {
  return pedir<AgregadoUv[]>('/geo/v1/agregados/unidades-vecinales');
}

function aUnidades(fc: FeatureCollectionUnidades): UnidadGeo[] {
  const lista: UnidadGeo[] = [];
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const id = p.id ?? (f.id !== undefined ? String(f.id) : null);
    if (!id) continue;
    lista.push({
      id,
      codigo: p.codigo ?? id.split(':').pop() ?? id,
      nombre: p.nombre ?? id,
      distrito_id: p.distrito_id ?? null,
    });
  }
  return lista.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

export async function obtenerDistritos(): Promise<UnidadGeo[]> {
  return aUnidades(await pedir<FeatureCollectionUnidades>('/geo/v1/capas/distrito_municipal'));
}

/** Las UV se toman del agregado (liviano y siempre JSON); incluye todas las vigentes. */
export async function obtenerUnidadesVecinales(): Promise<UnidadGeo[]> {
  const agregados = await obtenerAgregadosUv();
  return agregados
    .map((a) => ({
      id: a.unidad_vecinal_id,
      codigo: a.codigo,
      nombre: a.nombre,
      distrito_id: a.distrito_id,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}
