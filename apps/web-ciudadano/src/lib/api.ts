import type {
  CapaInfo,
  FotoSubida,
  PuntoCritico,
  ReporteCrearEntrada,
  ReporteFeatureCollection,
  ResolverRespuesta,
} from 'contracts';

export class ErrorApi extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
    public estado: number,
    public detalles?: unknown,
  ) {
    super(mensaje);
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });
  if (!r.ok) {
    let cuerpo: { codigo?: string; mensaje?: string; detalles?: unknown } = {};
    try {
      cuerpo = await r.json();
    } catch {
      /* sin cuerpo */
    }
    throw new ErrorApi(
      cuerpo.codigo ?? 'ERROR',
      cuerpo.mensaje ?? `Error ${r.status}`,
      r.status,
      cuerpo.detalles,
    );
  }
  return r.json() as Promise<T>;
}

export type ReporteFeature = ReporteFeatureCollection['features'][number];

export function obtenerReportes(params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return pedir<ReporteFeatureCollection>(`/api/v1/reportes?${q.toString()}`);
}

export function obtenerReporte(id: string) {
  return pedir<ReporteFeature>(`/api/v1/reportes/${id}`);
}

export function resolverPunto(lat: number, lon: number) {
  return pedir<ResolverRespuesta>('/geo/v1/resolver', {
    method: 'POST',
    body: JSON.stringify({ lat, lon }),
  });
}

export function crearReporte(payload: ReporteCrearEntrada) {
  return pedir<ReporteFeature>('/api/v1/reportes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function subirFoto(archivo: File) {
  const fd = new FormData();
  fd.append('archivo', archivo);
  return pedir<FotoSubida>('/api/v1/fotos', { method: 'POST', body: fd });
}

export function obtenerCapas() {
  return pedir<CapaInfo[]>('/geo/v1/capas');
}

export function obtenerPuntosCriticos(bbox?: string) {
  return pedir<PuntoCritico[]>(`/geo/v1/puntos-criticos${bbox ? `?bbox=${bbox}` : ''}`);
}

export function obtenerAgregados() {
  return pedir<Array<{ unidad_vecinal_id: string; n_reportes: number }>>(
    '/geo/v1/agregados/unidades-vecinales',
  );
}
