/** Cliente de geo-service (Parte 4). Interfaz inyectable para tests. */
import { type ResolverRespuesta, ResolverRespuestaSchema } from 'contracts';

/**
 * geo-service no responde ahora mismo: está parado, reiniciándose, saturado o tardó demasiado.
 *
 * Se distingue de cualquier otro fallo porque la respuesta correcta es distinta. Crear un reporte
 * necesita resolver la unidad vecinal, así que sin geo-service no se puede crear; pero eso es
 * transitorio y se arregla esperando, igual que la base saturada. Devolvía 500 ERROR_INTERNO:
 * al vecino le decía «error interno» —que suena a aplicación rota y a reportar el problema— y al
 * panel de errores le decía que hay un fallo que investigar. Ahora es 503 con `Retry-After`.
 *
 * Un 4xx de geo-service NO entra aquí: ese sí sería un defecto nuestro (payload mal armado) y
 * tiene que seguir saliendo como 500 para que alguien lo mire.
 */
export class GeoNoDisponible extends Error {
  constructor(motivo: string) {
    super(`geo-service no disponible: ${motivo}`);
    this.name = 'GeoNoDisponible';
  }
}

export interface ResolverGeo {
  /** `requestId` se propaga a geo-service para poder seguir la misma petición en ambos logs. */
  resolver(lat: number, lon: number, requestId?: string): Promise<ResolverRespuesta>;
  invalidarCapas(): Promise<void>;
}

export class ResolverHttp implements ResolverGeo {
  constructor(
    private baseUrl: string,
    private tokenInterno = '',
  ) {}
  async resolver(lat: number, lon: number, requestId?: string): Promise<ResolverRespuesta> {
    let r: Response;
    try {
      r = await fetch(`${this.baseUrl}/geo/v1/resolver`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        body: JSON.stringify({ lat, lon }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      // `fetch` falla con TypeError si no hay a quién conectarse y con DOMException
      // (`TimeoutError`) si se agota el plazo. Las dos cosas son "ahora no está".
      throw new GeoNoDisponible((e as Error).name ?? 'error de red');
    }
    // 5xx es problema suyo y 429 es saturación: las dos se arreglan esperando.
    if (r.status >= 500 || r.status === 429) throw new GeoNoDisponible(`HTTP ${r.status}`);
    if (!r.ok) throw new Error(`geo-service respondió ${r.status}`);
    return ResolverRespuestaSchema.parse(await r.json());
  }
  async invalidarCapas() {
    try {
      await fetch(`${this.baseUrl}/geo/v1/capas/invalidar`, {
        method: 'POST',
        headers: this.tokenInterno ? { 'x-token-interno': this.tokenInterno } : {},
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* mejor esfuerzo */
    }
  }
}
