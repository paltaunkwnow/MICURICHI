import { POOL_MAX_POR_DEFECTO } from 'db';
import { type ConfianzaProxy, leerConfianzaProxy } from './proxy.js';

/**
 * `??` solo cae al siguiente valor con `null`/`undefined`, no con `""`. `.env.example` deja
 * `GEO_DATABASE_URL`, `GEO_TOKEN_INTERNO` y `METRICAS_TOKEN` vacías a propósito (Docker Compose
 * las arma o quedan opcionales); quien copia el ejemplo tal cual terminaría con `""` ganándole al
 * siguiente fallback en vez de comportarse como si la variable no estuviera puesta.
 */
function noVacia(v: string | undefined): string | undefined {
  return v === '' ? undefined : v;
}

export interface ConfigGeo {
  puerto: number;
  host: string;
  /** Cadena de conexión de este servicio: rol `curichi_geo` (solo lectura), no el rol dueño. */
  databaseUrl: string;
  /** Conexiones máximas del pool de este proceso. El techo real es réplicas × poolMax. */
  poolMax: number;
  corsOrigenes: string[];
  /** Por encima de este tamaño, la capa se sirve por teselas en lugar de GeoJSON. */
  umbralTeselasBytes: number;
  /** Tolerancia de simplificación (grados) cuando no hay web.geojson del ETL: 0.00003 ≈ 3 m. */
  toleranciaSimplificacion: number;
  dirProcessed: string;
  /**
   * Token compartido con api-core para las rutas internas (invalidar la caché de capas).
   * Vacío = solo se aceptan desde loopback, que es lo que hace falta en local.
   */
  tokenInterno: string;
  /**
   * Confianza acotada en X-Forwarded-For (ver proxy.ts): false, número de saltos o lista de
   * IP/CIDR. Con la topología documentada (proxy TLS → Next → servicio) el valor es 2.
   */
  confiarEnProxy: ConfianzaProxy;
  /**
   * Peticiones por minuto y por IP. Generoso a propósito: el mapa pide decenas de teselas al
   * mover la vista y un límite estrecho rompería la navegación de un usuario legítimo.
   */
  rateLimitPorMinuto: number;
  /**
   * Límite aparte para las rutas caras (resolver, agregados y puntos críticos): cada una hace
   * trabajo real en PostGIS, a diferencia de una tesela, que sale de la caché en memoria.
   */
  rateLimitConsultasPorMinuto: number;
  /** Vida de la caché de agregados por UV, en ms. */
  cacheAgregadosMs: number;
  /**
   * `statement_timeout` propio de este servicio, en ms. El pool de `packages/db` por defecto usa
   * 30 s (pensado para escrituras largas de api-core); api-core en cambio abandona la resolución
   * a los 5 s (`services/api-core/src/resolver.ts`). Sin este tope corto, una consulta lenta seguía
   * ocupando una conexión del pool hasta 25 s después de que quien la pidió ya se hubiera ido,
   * agravando justo la saturación que la volvió lenta.
   */
  dbStatementTimeoutMs: number;
  /** Ruta de /metrics; vacía = no se expone. */
  rutaMetricas: string;
  /** Token para /metrics cuando el endpoint es alcanzable desde fuera. */
  tokenMetricas: string;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigGeo {
  const cfg: ConfigGeo = {
    puerto: Number(env.GEO_SERVICE_PORT ?? 3002),
    host: env.GEO_SERVICE_HOST ?? '127.0.0.1',
    // GEO_DATABASE_URL es el rol propio de este servicio (curichi_geo, solo lectura). DATABASE_URL
    // en el .env raíz trae el rol dueño (curichi): sigue aceptándose para no romper el arranque de
    // quien todavía no separó variables por servicio, pero GEO_DATABASE_URL manda si está.
    databaseUrl:
      noVacia(env.GEO_DATABASE_URL) ??
      noVacia(env.DATABASE_URL) ??
      'postgresql://curichi:curichi@127.0.0.1:5433/curichi',
    poolMax: Number(env.DB_POOL_MAX ?? POOL_MAX_POR_DEFECTO),
    corsOrigenes: (env.CORS_ORIGENES ?? 'http://localhost:3000,http://localhost:3100')
      .split(',')
      .map((s) => s.trim()),
    umbralTeselasBytes: Number(env.UMBRAL_TESELAS_BYTES ?? 5 * 1024 * 1024),
    toleranciaSimplificacion: Number(env.TOLERANCIA_SIMPLIFICACION ?? 0.00003),
    dirProcessed: env.DIR_PROCESSED ?? '',
    tokenInterno: noVacia(env.GEO_TOKEN_INTERNO) ?? '',
    confiarEnProxy: leerConfianzaProxy(env.TRUST_PROXY),
    rateLimitPorMinuto: Number(env.GEO_RATE_LIMIT_POR_MINUTO ?? 600),
    rateLimitConsultasPorMinuto: Number(env.GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO ?? 120),
    cacheAgregadosMs: Number(env.GEO_CACHE_AGREGADOS_MS ?? 30_000),
    rutaMetricas: env.METRICAS_RUTA ?? '/metrics',
    tokenMetricas: noVacia(env.METRICAS_TOKEN) ?? '',
    dbStatementTimeoutMs: Number(env.GEO_DB_STATEMENT_TIMEOUT_MS ?? 5000),
  };
  if (env.NODE_ENV === 'production') verificarProduccion(cfg);
  return cfg;
}

/**
 * Opciones de `crearPool` (`packages/db`) derivadas de la config de este servicio. Aparte de
 * `leerConfig` para poder probar el mapeo sin abrir un pool real contra PostGIS.
 */
export function opcionesPool(cfg: ConfigGeo): { max: number; statementTimeoutMs: number } {
  return { max: cfg.poolMax, statementTimeoutMs: cfg.dbStatementTimeoutMs };
}

/**
 * geo-service no comprobaba nada al arrancar en producción, y tiene dos cosas que comprobar.
 *
 * 1. `GEO_TOKEN_INTERNO` vacío hace que `/geo/v1/capas/invalidar` caiga al criterio de loopback.
 *    Dentro de una red de contenedores, "viene de loopback" deja de significar "viene de este
 *    servicio", y cada invalidación obliga a releer la capa entera de PostGIS y a reconstruir su
 *    índice de teselas: basta repetirla para tumbar el servicio.
 * 2. `/metrics` enumera rutas, latencias y errores. O lleva token o no se publica.
 */
export function verificarProduccion(cfg: ConfigGeo): void {
  const fallos: string[] = [];
  if (!cfg.tokenInterno)
    fallos.push('GEO_TOKEN_INTERNO es obligatorio: sin él la invalidación de capas queda abierta');
  if (cfg.rutaMetricas && !cfg.tokenMetricas)
    fallos.push(
      'METRICAS_TOKEN es obligatorio si se expone METRICAS_RUTA (o dejá METRICAS_RUTA vacío)',
    );
  if (cfg.corsOrigenes.includes('*')) fallos.push('CORS_ORIGENES no puede ser *');
  if (!cfg.corsOrigenes.filter(Boolean).length) fallos.push('CORS_ORIGENES está vacío');
  if (fallos.length)
    throw new Error(`Configuración inválida para producción:\n - ${fallos.join('\n - ')}`);
}
