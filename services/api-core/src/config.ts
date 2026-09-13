import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ConfigApi {
  puerto: number;
  host: string;
  databaseUrl: string;
  geoServiceUrl: string;
  corsOrigenes: string[];
  dirAlmacen: string;
  urlPublica: string;
  cookieSegura: boolean;
  sesionDias: number;
  rateLimitMax: number;
  rateLimitVentanaMs: number;
  salIp: string;
  rutaOpenApi: string;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  return {
    puerto: Number(env.API_CORE_PORT ?? 3001),
    host: env.API_CORE_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL ?? 'postgresql://curichi:curichi@127.0.0.1:5433/curichi',
    geoServiceUrl: env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002',
    corsOrigenes: (env.CORS_ORIGENES ?? 'http://localhost:3000,http://localhost:3100')
      .split(',')
      .map((s) => s.trim()),
    dirAlmacen: env.STORAGE_DIR ?? resolve(raizRepo, 'infra/.storage/fotos'),
    urlPublica: env.PUBLIC_BASE_URL ?? '',
    cookieSegura: env.COOKIE_SEGURA === '1',
    sesionDias: Number(env.SESION_DIAS ?? 7),
    rateLimitMax: Number(env.RATE_LIMIT_REPORTES_POR_HORA ?? 10),
    rateLimitVentanaMs: 60 * 60 * 1000,
    salIp: env.IP_HASH_SAL ?? 'sal-local-cambiar-en-produccion',
    rutaOpenApi: env.OPENAPI_PATH ?? resolve(raizRepo, 'packages/contracts/openapi/openapi.yaml'),
  };
}
