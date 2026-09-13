export interface ConfigGeo {
  puerto: number;
  host: string;
  databaseUrl: string;
  corsOrigenes: string[];
  /** Por encima de este tamaño, la capa se sirve por teselas en lugar de GeoJSON. */
  umbralTeselasBytes: number;
  /** Tolerancia de simplificación (grados) cuando no hay web.geojson del ETL: 0.00003 ≈ 3 m. */
  toleranciaSimplificacion: number;
  dirProcessed: string;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigGeo {
  return {
    puerto: Number(env.GEO_SERVICE_PORT ?? 3002),
    host: env.GEO_SERVICE_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL ?? 'postgresql://curichi:curichi@127.0.0.1:5433/curichi',
    corsOrigenes: (env.CORS_ORIGENES ?? 'http://localhost:3000,http://localhost:3100')
      .split(',')
      .map((s) => s.trim()),
    umbralTeselasBytes: Number(env.UMBRAL_TESELAS_BYTES ?? 5 * 1024 * 1024),
    toleranciaSimplificacion: Number(env.TOLERANCIA_SIMPLIFICACION ?? 0.00003),
    dirProcessed: env.DIR_PROCESSED ?? '',
  };
}
