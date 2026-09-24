import type {
  AgregadoUv,
  CapaInfo,
  FotoSubida,
  PuntoCritico,
  ReporteCrearEntrada,
  ReporteFeatureCollection,
  ResolverRespuesta,
  SesionActual,
  Usuario,
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

/**
 * Plazos por tipo de petición. Sin plazo, una red que se queda a medias —el caso normal en un
 * celular que pierde cobertura— deja la promesa colgada para siempre: el mapa gira sin fin y el
 * usuario no tiene forma de saber que no va a llegar nada.
 *
 * No puede ser un único valor. Una lectura que tarde 15 s ya no le sirve a nadie, pero subir una
 * foto de 8 MB por datos móviles pasa de 15 s con facilidad y cortarla sería romper el envío
 * justo a quien peor conexión tiene, que es precisamente el vecino que más necesita reportar.
 */
export const PLAZOS_MS = {
  /** Lecturas del mapa y del listado. */
  lectura: 15_000,
  /** Envío del reporte: va con idempotencia, así que reintentar es seguro. */
  escritura: 30_000,
  /** Subida de foto: hasta 8 MB por una red lenta. */
  subida: 180_000,
} as const;

/** Combina la señal del llamador con el plazo, sin romper en navegadores sin `AbortSignal.any`. */
function señalConPlazo(propia: AbortSignal | null | undefined, plazoMs: number): AbortSignal {
  const plazo = AbortSignal.timeout(plazoMs);
  if (!propia) return plazo;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([propia, plazo]);
  return propia;
}

/**
 * Las lecturas públicas siguen yendo SIN cookies, aunque ahora la app tenga cuentas.
 *
 * El motivo original se corrigió en el servidor: antes `GET /api/v1/reportes` devolvía la vista
 * TÉCNICA —coordenada exacta y reportes sin moderar— si la petición traía sesión de técnico, y
 * como las cookies no distinguen puertos, el panel en `localhost:3100` y el mapa en
 * `localhost:3000` compartían la suya. Comprobado en vivo entonces: el mapa público le mostraba
 * al técnico 44 reportes sin degradar en lugar de los 32 publicados. Hoy eso es imposible porque
 * la vista técnica vive en otra ruta y el manejador público ni mira la sesión (hallazgo A-01).
 *
 * Aun así se mantiene el `omit` en las lecturas: es gratis, y significa que la respuesta del mapa
 * no puede depender de quién la pida ni acabar en una caché con la clave equivocada, por mucho
 * que alguien cambie el servidor en el futuro. Las peticiones que SÍ necesitan saber quién está
 * detrás —entrar, salir, reportar, subir una foto— piden la cookie explícitamente.
 */
type Credenciales = 'omit' | 'same-origin';

async function pedir<T>(
  url: string,
  init?: RequestInit,
  plazoMs: number = PLAZOS_MS.lectura,
  credenciales: Credenciales = 'omit',
): Promise<T> {
  const r = await fetch(url, {
    ...init,
    credentials: credenciales,
    // TanStack Query pasa su `signal` en cada `queryFn`: al cambiar la vista del mapa, la
    // consulta anterior se marca obsoleta y esta señal la aborta. Sin esto, arrastrar el mapa
    // deja en vuelo una petición por cada movimiento, todas compitiendo por el mismo límite de
    // lecturas, y la respuesta de una vista vieja puede llegar después y pisar a la nueva.
    signal: señalConPlazo(init?.signal, plazoMs),
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

export function obtenerReportes(
  params: Record<string, string | undefined> = {},
  signal?: AbortSignal,
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return pedir<ReporteFeatureCollection>(`/api/v1/reportes?${q.toString()}`, { signal });
}

export function obtenerReporte(id: string, signal?: AbortSignal) {
  return pedir<ReporteFeature>(`/api/v1/reportes/${id}`, { signal });
}

/**
 * `signal` importa aquí más que en una lectura normal: en el paso 1 del reporte el punto se
 * resuelve cada vez que el mapa se queda quieto, y sin abortar la anterior la respuesta de una
 * posición vieja puede llegar la última y decirle al vecino una unidad vecinal que ya no es.
 */
export function resolverPunto(lat: number, lon: number, signal?: AbortSignal) {
  return pedir<ResolverRespuesta>(
    '/geo/v1/resolver',
    { method: 'POST', body: JSON.stringify({ lat, lon }), signal },
    PLAZOS_MS.escritura,
  );
}

/**
 * `claveIdempotencia` hace que reintentar el mismo envío (timeout, red que se corta, doble toque)
 * devuelva el reporte ya creado en vez de crear otro. Debe ser la MISMA en todos los reintentos
 * de un mismo formulario.
 */
export function crearReporte(payload: ReporteCrearEntrada, claveIdempotencia?: string) {
  return pedir<ReporteFeature>(
    '/api/v1/reportes',
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: claveIdempotencia ? { 'idempotency-key': claveIdempotencia } : {},
    },
    PLAZOS_MS.escritura,
    'same-origin',
  );
}

/** UUID v4; `crypto.randomUUID` no existe en contextos no seguros (http en una LAN). */
export function nuevaClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function subirFoto(archivo: File) {
  const fd = new FormData();
  fd.append('archivo', archivo);
  return pedir<FotoSubida>(
    '/api/v1/fotos',
    { method: 'POST', body: fd },
    PLAZOS_MS.subida,
    'same-origin',
  );
}

/* ─────────────────────────────── Cuenta ciudadana ───────────────────────────────
 *
 * Ver el mapa no necesita cuenta. Reportar sí, desde la Fase 5: el límite por IP no resiste a
 * una IP dinámica y sin una identidad estable no hay nada a lo que aplicar un límite.
 *
 * La sesión viaja en una cookie `HttpOnly`, así que este código no la ve ni la puede guardar en
 * ningún sitio: solo pide que el navegador la mande (`same-origin`, y el origen es el mismo
 * porque Next reenvía `/api/*` al servicio). No hay ningún token en `localStorage` ni en la URL.
 */

/** Sesión actual, o `ErrorApi` con estado 401 si no hay ninguna. */
export function obtenerYo(signal?: AbortSignal) {
  return pedir<SesionActual>('/api/v1/auth/yo', { signal }, PLAZOS_MS.lectura, 'same-origin');
}

export function iniciarSesion(datos: { email: string; password: string }) {
  return pedir<Usuario>(
    '/api/v1/auth/login',
    { method: 'POST', body: JSON.stringify(datos) },
    PLAZOS_MS.escritura,
    'same-origin',
  );
}

/**
 * Alta de cuenta. NO devuelve sesión a propósito: el servidor responde lo mismo tanto si el
 * correo estaba libre como si ya existía, y devolver una cookie solo en el primer caso delataría
 * qué cuentas hay. Después de esto hay que iniciar sesión.
 */
export function crearCuenta(datos: { email: string; nombre: string; password: string }) {
  return pedir<{ codigo: string; mensaje: string }>(
    '/api/v1/auth/registro',
    { method: 'POST', body: JSON.stringify(datos) },
    PLAZOS_MS.escritura,
    'same-origin',
  );
}

export async function cerrarSesion(): Promise<void> {
  const r = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(PLAZOS_MS.escritura),
  });
  // 204 sin cuerpo: `pedir` intentaría parsear JSON y fallaría, así que va aparte.
  if (!r.ok && r.status !== 401)
    throw new ErrorApi('ERROR', 'No se pudo cerrar la sesión.', r.status);
}

export function obtenerCapas(signal?: AbortSignal) {
  return pedir<CapaInfo[]>('/geo/v1/capas', { signal });
}

export function obtenerPuntosCriticos(bbox?: string, signal?: AbortSignal) {
  return pedir<PuntoCritico[]>(`/geo/v1/puntos-criticos${bbox ? `?bbox=${bbox}` : ''}`, {
    signal,
  });
}

export function obtenerAgregados(signal?: AbortSignal) {
  return pedir<AgregadoUv[]>('/geo/v1/agregados/unidades-vecinales', { signal });
}
