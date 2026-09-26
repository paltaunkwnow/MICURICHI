/** Cliente de geo-service (Parte 4). Interfaz inyectable para tests. */
import { type ResolverRespuesta, ResolverRespuestaSchema } from 'contracts';
import type { FastifyBaseLogger } from 'fastify';
import type { Metricas } from './observabilidad.js';

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

/** Dónde avisa el cliente de lo que no puede devolver como error (ver `invalidarCapas`). */
export interface ObservabilidadResolver {
  log: Pick<FastifyBaseLogger, 'warn'>;
  metricas: Pick<Metricas, 'contar'>;
}

export interface ResolverGeo {
  /** `requestId` se propaga a geo-service para poder seguir la misma petición en ambos logs. */
  resolver(lat: number, lon: number, requestId?: string): Promise<ResolverRespuesta>;
  invalidarCapas(): Promise<void>;
  /**
   * `crearApp` le pasa su logger y su registro de métricas, que no existen todavía cuando se
   * construye el cliente (servidor.ts lo crea antes que la app). Opcional: los falsos de las
   * pruebas no lo necesitan.
   */
  observar?(o: ObservabilidadResolver): void;
}

export class ResolverHttp implements ResolverGeo {
  private obs: ObservabilidadResolver | null = null;

  constructor(
    private baseUrl: string,
    private tokenInterno = '',
  ) {}

  observar(o: ObservabilidadResolver): void {
    this.obs = o;
  }

  /**
   * El token va en TODAS las llamadas, no solo en la de invalidar. geo-service exime de su cupo
   * por IP al resolver cuando la petición trae el token válido: api-core llama una vez por cada
   * `POST /reportes`, siempre desde el mismo origen, y sin token todas las creaciones de la
   * ciudad compartían un solo cupo por IP (120/min por defecto) que una tormenta agota:
   * geo-service responde 429 y el vecino recibe 503 al enviar su reporte.
   */
  private cabecerasInternas(): Record<string, string> {
    return this.tokenInterno ? { 'x-token-interno': this.tokenInterno } : {};
  }

  async resolver(lat: number, lon: number, requestId?: string): Promise<ResolverRespuesta> {
    let r: Response;
    try {
      r = await fetch(`${this.baseUrl}/geo/v1/resolver`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...this.cabecerasInternas(),
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
  /**
   * Mejor esfuerzo: la activación de la capa ya está confirmada en la base y geo-service relee
   * por su cuenta las versiones vigentes al poco tiempo, así que un fallo aquí no se devuelve a
   * quien activó. Pero tampoco se calla: antes se tragaba todo, incluido el 403 de un token mal
   * configurado —que `fetch` ni siquiera trata como error—, y cada activación fallaba sin rastro.
   */
  async invalidarCapas() {
    try {
      const r = await fetch(`${this.baseUrl}/geo/v1/capas/invalidar`, {
        method: 'POST',
        headers: this.cabecerasInternas(),
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) throw new Error(`geo-service respondió ${r.status}`);
    } catch (e) {
      this.obs?.log.warn({ err: e }, 'no se pudo invalidar la caché de capas de geo-service');
      this.obs?.metricas.contar('curichi_geo_invalidacion_fallida_total');
    }
  }
}
