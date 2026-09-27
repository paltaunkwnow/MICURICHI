import {
  type AgregadoUv,
  type CapaInfo,
  type CapaVersion,
  CODIGO_CAPA_CAMBIO,
  type ExportacionGeoJson,
  ExportacionGeoJsonSchema,
  type Indicadores,
  type Login,
  type ReporteCambiarEstado,
  type ReporteFusionar,
  type ReporteReclasificar,
  type ReporteTecnicoFeature,
  type ReporteTecnicoFeatureCollection,
  type ResumenEjecutivo,
  type TipoCapa,
  type Usuario,
  type VentanaResumen,
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

/**
 * La respuesta de `/exportar` no cumple `ExportacionGeoJsonSchema`. No se entrega el archivo: sin
 * `total`, `exportados` y `truncado` no hay forma de saber si trae toda la selección.
 */
export class ErrorExportacionInvalida extends Error {
  constructor() {
    super(
      'La exportación llegó con un formato inesperado y no se descargó. Avisá a quien opera el servicio.',
    );
    this.name = 'ErrorExportacionInvalida';
  }
}

/**
 * Cabecera con la que el panel marca sus consultas automáticas: el refresco cada 10 s de la
 * bandeja, el detalle, los indicadores y el panel ejecutivo (`lib/consultas.ts`). api-core no
 * renueva con ellas la inactividad de la sesión: un panel abierto en una pantalla no la mantiene
 * viva para siempre. Lo que pide la persona no la lleva.
 */
export const CABECERA_SONDEO = 'x-curichi-sondeo';

/** Opciones de las lecturas que el panel refresca solo. */
export interface OpcionesLectura {
  /** Refresco automático: sale con `CABECERA_SONDEO`. */
  sondeo?: boolean;
}

function cabecerasLectura(o: OpcionesLectura): Record<string, string> | undefined {
  return o.sondeo ? { [CABECERA_SONDEO]: '1' } : undefined;
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

/** Cabeceras propias de una petición: siempre un objeto plano, para poder mezclarlas. */
type PeticionInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

/** Hace la petición y convierte cualquier respuesta no 2xx en `ErrorApi`. */
async function pedirRespuesta(
  url: string,
  init?: PeticionInit,
  plazoMs: number = PLAZOS_MS.normal,
): Promise<Response> {
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
  return r;
}

async function pedir<T>(
  url: string,
  init?: PeticionInit,
  plazoMs: number = PLAZOS_MS.normal,
): Promise<T> {
  const r = await pedirRespuesta(url, init, plazoMs);
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
export function obtenerReportes(
  params: ParametrosConsulta,
  signal?: AbortSignal,
  opciones: OpcionesLectura = {},
) {
  return pedir<ReporteTecnicoFeatureCollection>(`/api/v1/tecnico/reportes?${aQuery(params)}`, {
    signal,
    headers: cabecerasLectura(opciones),
  });
}

export function obtenerReporte(id: string, signal?: AbortSignal, opciones: OpcionesLectura = {}) {
  return pedir<ReporteTecnicoFeature>(`/api/v1/tecnico/reportes/${encodeURIComponent(id)}`, {
    signal,
    headers: cabecerasLectura(opciones),
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

/** Enlace de descarga con los filtros actuales; el CSV se baja con un <a download>. */
export function urlExportar(formato: 'csv' | 'geojson', params: ParametrosConsulta) {
  return `/api/v1/exportar?${aQuery({ ...params, formato })}`;
}

/** `filename="…"` de Content-Disposition, o el nombre de respaldo. */
export function nombreDeArchivo(contentDisposition: string | null, porDefecto: string): string {
  const m = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return m?.[1]?.trim() || porDefecto;
}

export interface ExportacionDescargada {
  /** El archivo tal como lo mandó api-core, para guardarlo sin reescribirlo. */
  texto: string;
  nombreArchivo: string;
  resumen: Pick<ExportacionGeoJson, 'total' | 'exportados' | 'truncado'>;
}

/**
 * Exportación GeoJSON validada con `ExportacionGeoJsonSchema` antes de entregarla. Va por
 * `fetch` y no por un <a download> para poder leer `truncado`: si la selección no cupo en el
 * tope de api-core, el panel lo avisa en vez de dejar que el recorte pase por el total.
 */
export async function exportarGeoJson(params: ParametrosConsulta): Promise<ExportacionDescargada> {
  const r = await pedirRespuesta(
    urlExportar('geojson', params),
    { headers: { accept: 'application/geo+json, application/json' } },
    PLAZOS_MS.exportacion,
  );
  const texto = await r.text();
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErrorExportacionInvalida();
  }
  const v = ExportacionGeoJsonSchema.safeParse(json);
  if (!v.success) throw new ErrorExportacionInvalida();
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    texto,
    nombreArchivo: nombreDeArchivo(
      r.headers.get('content-disposition'),
      `mi-curichi-reportes-${hoy}.geojson`,
    ),
    resumen: { total: v.data.total, exportados: v.data.exportados, truncado: v.data.truncado },
  };
}

// --- Panel ejecutivo ------------------------------------------------------

/**
 * Resumen por distrito para secretarios, concejales y alcalde (roles ejecutivo, tecnico, admin).
 * `sondeo` marca el refresco automático (ver `CABECERA_SONDEO`).
 */
export function obtenerResumenEjecutivo(
  ventana: VentanaResumen,
  signal?: AbortSignal,
  opciones: OpcionesLectura = {},
) {
  return pedir<ResumenEjecutivo>(`/api/v1/ejecutivo/resumen?${aQuery({ ventana })}`, {
    signal,
    headers: cabecerasLectura(opciones),
  });
}

// --- Indicadores y capas -------------------------------------------------

export function obtenerIndicadores(signal?: AbortSignal, opciones: OpcionesLectura = {}) {
  return pedir<Indicadores>('/api/v1/indicadores', {
    signal,
    headers: cabecerasLectura(opciones),
  });
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

/**
 * GeoJSON web de una capa por la `url` con huella de `/geo/v1/capas` (contracts 0.12.0), nunca
 * por una ruta armada a mano: esa URL se cachea un año y cambia cuando cambia la capa. Si la capa
 * se activó entre las dos peticiones, la URL vieja responde 410 CAPA_CAMBIO: se vuelve a pedir la
 * lista una sola vez, para no entrar en bucle si geo-service no se estabiliza.
 */
async function obtenerCapaGeoJson<T>(
  capa: TipoCapa,
  signal?: AbortSignal,
  capas?: CapaInfo[],
): Promise<T> {
  let lista = capas ?? (await obtenerCapasMapa(signal));
  for (let intento = 0; ; intento++) {
    const info = lista.find((c) => c.capa === capa);
    if (!info) {
      throw new ErrorApi(
        'CAPA_NO_DISPONIBLE',
        `La capa ${capa} no tiene una versión vigente.`,
        404,
      );
    }
    if (info.modo !== 'geojson') {
      throw new ErrorApi(
        'USAR_TESELAS',
        `La capa ${capa} se sirve por teselas y no se puede leer como GeoJSON.`,
        413,
      );
    }
    try {
      return await pedir<T>(info.url, { signal });
    } catch (e) {
      const cambio = e instanceof ErrorApi && e.estado === 410 && e.codigo === CODIGO_CAPA_CAMBIO;
      if (!cambio || intento > 0) throw e;
      lista = await obtenerCapasMapa(signal);
    }
  }
}

/** Distritos para los selectores. `capas` evita volver a pedir `/geo/v1/capas` si ya se tiene. */
export async function obtenerDistritos(
  signal?: AbortSignal,
  capas?: CapaInfo[],
): Promise<UnidadGeo[]> {
  return aUnidades(
    await obtenerCapaGeoJson<FeatureCollectionUnidades>('distrito_municipal', signal, capas),
  );
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
