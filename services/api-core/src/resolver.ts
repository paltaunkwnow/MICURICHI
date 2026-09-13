/** Cliente de geo-service (Parte 4). Interfaz inyectable para tests. */
import { type ResolverRespuesta, ResolverRespuestaSchema } from 'contracts';

export interface ResolverGeo {
  resolver(lat: number, lon: number): Promise<ResolverRespuesta>;
  invalidarCapas(): Promise<void>;
}

export class ResolverHttp implements ResolverGeo {
  constructor(private baseUrl: string) {}
  async resolver(lat: number, lon: number): Promise<ResolverRespuesta> {
    const r = await fetch(`${this.baseUrl}/geo/v1/resolver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat, lon }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`geo-service respondió ${r.status}`);
    return ResolverRespuestaSchema.parse(await r.json());
  }
  async invalidarCapas() {
    try {
      await fetch(`${this.baseUrl}/geo/v1/capas/invalidar`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* mejor esfuerzo */
    }
  }
}
