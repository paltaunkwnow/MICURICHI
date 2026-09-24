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
  /** false si hay más resultados de los contados; `total` es entonces el tope del conteo. */
  total_exacto?: boolean;
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

/**
 * Plazos por tipo de petición. Sin plazo, una petición que no termina nunca deja al técnico con
 * la tabla girando y sin forma de saber si el cambio se aplicó. La exportación va aparte porque
 * genera el CSV o el GeoJSON de la selección entera y puede tardar de verdad.
 */
export const PLAZOS_MS = { normal: 20_000, exportacion: 180_000 } as const;

function señalConPlazo(propia: AbortSignal | null | undefined, plazoMs: number): AbortSignal {
  const plazo = AbortSignal.timeout(plazoMs);
  if (!propia) return plazo;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([propia, plazo]);
  return propia;
}

/**
 * Evento que se dispara cuando api-core contesta 401 a una llamada que NO es el propio login.
 *
 * La sesión del técnico caduca sola (`SESION_IDLE_HORAS`, 12 por defecto). Hasta ahora eso se
 * notaba en mitad de una moderación: el botón «Confirmar rechazo» devolvía un escueto
 * «ERROR (401)» dentro del formulario, sin decir que la sesión había caducado y sin forma de
 * volver a entrar que no fuera adivinar la URL de /login. Con esto, el panel lo detecta desde
 * cualquier llamada y reacciona en un solo sitio (`Protegido`).
 */
export const EVENTO_SESION_CADUCADA = 'curichi:sesion-caducada';

function avisarSesionCaducada(url: string): void {
  if (typeof window === 'undefined') return;
  // El 401 del propio login significa «credenciales incorrectas», no «se te cayó la sesión».
  if (url.includes('/auth/login')) return;
  // Y el de `GET /auth/yo` es la pregunta «¿hay sesión?» respondida con «no», que es el estado
  // normal de quien llega al panel sin haber entrado. `Protegido` ya lo resuelve mandando a
  // /login. Avisarlo como caducada hacía que CUALQUIER primera visita dijera «tu sesión caducó
  // por inactividad» a alguien que nunca había iniciado sesión (comprobado en el navegador).
  // Una sesión que vence a mitad de trabajo se sigue detectando: la próxima llamada a cualquier
  // otra ruta devuelve 401 y dispara el aviso.
  if (url.includes('/auth/yo')) return;
  window.dispatchEvent(new Event(EVENTO_SESION_CADUCADA));
}

async function pedir<T>(
  url: string,
  init?: RequestInit,
  plazoMs: number = PLAZOS_MS.normal,
): Promise<T> {
  const conCuerpo = init?.body !== undefined && init.body !== null;
  const r = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    // La señal de TanStack Query aborta la consulta anterior al cambiar de filtro o de página:
    // sin esto, teclear en un filtro deja una petición en vuelo por cada pulsación y la
    // respuesta de un filtro viejo puede llegar la última y pintar resultados equivocados.
    signal: señalConPlazo(init?.signal, plazoMs),
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
    if (r.status === 401) avisarSesionCaducada(url);
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

/*
 * La lectura del panel va por `/api/v1/tecnico/...` y no por la ruta pública.
 *
 * Antes las dos apps pedían la MISMA URL y era la cookie la que decidía si volvían coordenadas
 * exactas o desplazadas. Eso convertía un descuido de despliegue —o una caché por el medio— en
 * una fuga de ubicaciones. Ahora la intención de ver datos técnicos está en la ruta, el servidor
 * exige el rol para atenderla, y ninguna caché puede confundir las dos respuestas porque no
 * comparten clave. Si estas llamadas devuelven 401, la sesión caducó; si devuelven 403, la cuenta
 * no es de técnico: en ningún caso se cae en silencio a la vista pública.
 */
export function obtenerReportes(params: ParametrosConsulta, signal?: AbortSignal) {
  return pedir<ReporteTecnicoColeccion>(`/api/v1/tecnico/reportes?${aQuery(params)}`, { signal });
}

export function obtenerReporte(id: string, signal?: AbortSignal) {
  return pedir<ReporteTecnicoFeature>(`/api/v1/tecnico/reportes/${encodeURIComponent(id)}`, {
    signal,
  });
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

export function obtenerIndicadores(signal?: AbortSignal) {
  return pedir<Indicadores>('/api/v1/indicadores', { signal });
}

export function obtenerVersionesCapas(signal?: AbortSignal) {
  return pedir<CapaVersion[]>('/api/v1/admin/capas', { signal });
}

export function activarCapa(id: string) {
  return pedir<CapaVersion>(`/api/v1/admin/capas/${encodeURIComponent(id)}/activar`, {
    method: 'POST',
  });
}

export function obtenerCapasMapa(signal?: AbortSignal) {
  return pedir<CapaInfo[]>('/geo/v1/capas', { signal });
}

export function obtenerAgregadosUv(signal?: AbortSignal) {
  return pedir<AgregadoUv[]>('/geo/v1/agregados/unidades-vecinales', { signal });
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
