import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_DOMINIO } from 'contracts';
import {
  LIMITES_LOGIN_POR_DEFECTO,
  type LimitesLogin,
  POOL_MAX_POR_DEFECTO,
  REGISTRO_VENTANA_MINUTOS,
  REGISTROS_POR_IP_POR_DEFECTO,
} from 'db';
import { type ConfianzaProxy, leerConfianzaProxy } from './proxy.js';

const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Valores por defecto que NO pueden salir a producción: son públicos, están en el repositorio. */
const SAL_IP_POR_DEFECTO = 'sal-local-cambiar-en-produccion';
const SAL_JITTER_POR_DEFECTO = 'jitter-local-cambiar-en-produccion';

export interface ConfigApi {
  puerto: number;
  host: string;
  databaseUrl: string;
  /** Conexiones máximas del pool de este proceso. El techo real es réplicas × poolMax. */
  poolMax: number;
  geoServiceUrl: string;
  /** Token compartido con geo-service para sus rutas internas (invalidar capas). */
  geoTokenInterno: string;
  corsOrigenes: string[];
  dirAlmacen: string;
  urlPublica: string;
  cookieSegura: boolean;
  sesionDias: number;
  /** Horas de inactividad tras las que la sesión deja de valer. */
  sesionIdleHoras: number;
  /** Freno de fuerza bruta del login, por cuenta y por IP. */
  limitesLogin: LimitesLogin;
  /**
   * Tope bruto de peticiones a /auth/login por IP y ventana, antes de mirar credenciales.
   * Es la primera barrera; el freno fino por cuenta vive en `limitesLogin`. Configurable
   * porque estaba fijo en el código y no había forma de subirlo para una prueba de carga ni
   * de bajarlo si el municipio lo necesitaba.
   */
  loginPeticionesPorVentana: number;
  /**
   * Tope bruto de peticiones a /auth/registro por IP y ventana (la misma ventana que el login).
   * Es la barrera de ráfaga, en memoria del proceso; el freno duradero está en `registroPorIp`.
   */
  registroPeticionesPorVentana: number;
  /** Altas de cuenta por IP y hora, contadas en la base (sobreviven a reinicios y réplicas). */
  registroPorIp: number;
  registroVentanaMinutos: number;
  /**
   * Minutos que una CUENTA espera entre dos reportes aceptados. Es el límite antiabuso principal
   * desde que reportar exige cuenta: el de IP no resiste a una IP dinámica, este sí. Configurable
   * para poder bajarlo en una prueba de carga; el valor de producción es el del contrato.
   */
  minutosEntreReportes: number;
  rateLimitMax: number;
  rateLimitVentanaMs: number;
  /**
   * Lecturas públicas por minuto y por IP (listado, detalle y fotos). Estas rutas no tenían
   * ningún límite: `@fastify/rate-limit` se registra con `global: false`, así que solo se
   * aplicaba a las que lo declaran, y el listado —la consulta pública más cara, con conteo y
   * jitter— quedaba abierta. Medido en la Fase 3: 500 peticiones concurrentes daban 500
   * respuestas 200 con p95 de 1,9 s. Generoso porque el mapa pide al mover la vista.
   */
  rateLimitLecturasPorMinuto: number;
  salIp: string;
  /** Sal secreta del jitter público: sin ella el desplazamiento se puede revertir (§13). */
  salJitter: string;
  /**
   * Confianza acotada en X-Forwarded-For: false, número de saltos, o lista de IP/CIDR.
   * Ver proxy.ts; con la topología documentada (proxy TLS → Next → servicio) el valor es 2.
   */
  confiarEnProxy: ConfianzaProxy;
  rutaOpenApi: string;
  /** Exponer /docs (Swagger UI). Por defecto solo fuera de producción. */
  exponerDocs: boolean;
  /** Días de retención de ip_hash antes del borrado automático (§13). */
  retencionIpHashDias: number;
  /** Ruta de /metrics; vacía = no se expone. */
  rutaMetricas: string;
  /** Token para /metrics cuando el endpoint es alcanzable desde fuera. */
  tokenMetricas: string;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  const produccion = env.NODE_ENV === 'production';
  const cfg: ConfigApi = {
    puerto: Number(env.API_CORE_PORT ?? 3001),
    host: env.API_CORE_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL ?? 'postgresql://curichi:curichi@127.0.0.1:5433/curichi',
    poolMax: Number(env.DB_POOL_MAX ?? POOL_MAX_POR_DEFECTO),
    geoServiceUrl: env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002',
    geoTokenInterno: env.GEO_TOKEN_INTERNO ?? '',
    corsOrigenes: (env.CORS_ORIGENES ?? 'http://localhost:3000,http://localhost:3100')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    dirAlmacen: env.STORAGE_DIR ?? resolve(raizRepo, 'infra/.storage/fotos'),
    urlPublica: env.PUBLIC_BASE_URL ?? '',
    cookieSegura: env.COOKIE_SEGURA === '1',
    sesionDias: Number(env.SESION_DIAS ?? 7),
    sesionIdleHoras: Number(env.SESION_IDLE_HORAS ?? 12),
    loginPeticionesPorVentana: Number(env.LOGIN_PETICIONES_POR_VENTANA ?? 20),
    registroPeticionesPorVentana: Number(env.REGISTRO_PETICIONES_POR_VENTANA ?? 10),
    registroPorIp: Number(env.REGISTRO_MAX_POR_IP ?? REGISTROS_POR_IP_POR_DEFECTO),
    registroVentanaMinutos: Number(env.REGISTRO_VENTANA_MINUTOS ?? REGISTRO_VENTANA_MINUTOS),
    minutosEntreReportes: Number(
      env.REPORTE_MINUTOS_ENTRE_ENVIOS ?? CONFIG_DOMINIO.MINUTOS_ENTRE_REPORTES_POR_CUENTA,
    ),
    limitesLogin: {
      maxPorEmail: Number(env.LOGIN_MAX_FALLOS_EMAIL ?? LIMITES_LOGIN_POR_DEFECTO.maxPorEmail),
      maxPorIp: Number(env.LOGIN_MAX_FALLOS_IP ?? LIMITES_LOGIN_POR_DEFECTO.maxPorIp),
      ventanaMinutos: Number(env.LOGIN_VENTANA_MINUTOS ?? LIMITES_LOGIN_POR_DEFECTO.ventanaMinutos),
    },
    rateLimitMax: Number(env.RATE_LIMIT_REPORTES_POR_HORA ?? 10),
    rateLimitVentanaMs: 60 * 60 * 1000,
    rateLimitLecturasPorMinuto: Number(env.RATE_LIMIT_LECTURAS_POR_MINUTO ?? 240),
    salIp: env.IP_HASH_SAL || SAL_IP_POR_DEFECTO,
    salJitter: env.JITTER_SAL || SAL_JITTER_POR_DEFECTO,
    confiarEnProxy: leerConfianzaProxy(env.TRUST_PROXY),
    rutaOpenApi: env.OPENAPI_PATH ?? resolve(raizRepo, 'packages/contracts/openapi/openapi.yaml'),
    exponerDocs: env.EXPONER_DOCS ? env.EXPONER_DOCS === '1' : !produccion,
    retencionIpHashDias: Number(env.IP_HASH_RETENCION_DIAS ?? 30),
    rutaMetricas: env.METRICAS_RUTA ?? '/metrics',
    tokenMetricas: env.METRICAS_TOKEN ?? '',
  };
  if (produccion) verificarProduccion(cfg);
  return cfg;
}

/**
 * Longitud mínima de las sales. El jitter siembra con un hash no criptográfico (FNV-1a), así que
 * lo único que impide recalcular el desplazamiento de una vivienda es que la sal no se pueda
 * adivinar: una sal corta se prueba por fuerza bruta en segundos. 32 caracteres equivalen a los
 * 16 bytes aleatorios que recomienda `docs/operaciones/produccion.md`.
 */
export const SAL_MIN_LONGITUD = 32;

/** En producción no se arranca con secretos de ejemplo ni con CORS abierto: se falla temprano. */
export function verificarProduccion(cfg: ConfigApi): void {
  const fallos: string[] = [];
  if (cfg.salIp === SAL_IP_POR_DEFECTO) fallos.push('IP_HASH_SAL usa el valor de ejemplo');
  else if (cfg.salIp.length < SAL_MIN_LONGITUD)
    fallos.push(`IP_HASH_SAL debe tener al menos ${SAL_MIN_LONGITUD} caracteres`);
  if (cfg.salJitter === SAL_JITTER_POR_DEFECTO) fallos.push('JITTER_SAL usa el valor de ejemplo');
  else if (cfg.salJitter.length < SAL_MIN_LONGITUD)
    fallos.push(`JITTER_SAL debe tener al menos ${SAL_MIN_LONGITUD} caracteres`);
  if (!cfg.cookieSegura) fallos.push('COOKIE_SEGURA debe ser 1 (cookie de sesión solo por HTTPS)');
  if (cfg.corsOrigenes.includes('*'))
    fallos.push('CORS_ORIGENES no puede ser * con cookies de sesión');
  if (!cfg.corsOrigenes.length) fallos.push('CORS_ORIGENES está vacío');
  // /metrics enumera rutas, conteos de peticiones y de errores. Estaba expuesto sin token por
  // defecto: quien conociera la URL veía el pulso del servicio. O se protege o no se publica.
  if (cfg.rutaMetricas && !cfg.tokenMetricas)
    fallos.push(
      'METRICAS_TOKEN es obligatorio si se expone METRICAS_RUTA (o dejá METRICAS_RUTA vacío)',
    );
  if (fallos.length)
    throw new Error(`Configuración inválida para producción:\n - ${fallos.join('\n - ')}`);
}
