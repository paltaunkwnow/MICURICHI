import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Ciudad, CiudadSchema, CONFIG_DOMINIO } from 'contracts';
import {
  LIMITES_LOGIN_POR_DEFECTO,
  type LimitesLogin,
  POOL_MAX_POR_DEFECTO,
  REGISTRO_VENTANA_MINUTOS,
  REGISTROS_POR_IP_POR_DEFECTO,
} from 'db';
import { type ConfianzaProxy, leerConfianzaProxy } from './proxy.js';

const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * 2 GiB <a confirmar al dimensionar el disco>. El valor efectivo sale en la métrica
 * `curichi_fotos_disco_min_libre_bytes` y las alertas `DiscoDeFotos*`
 * (infra/observabilidad/alertas.yml) comparan contra ella: cambiar `FOTOS_MIN_LIBRE_BYTES` no
 * exige tocar las alertas.
 */
export const FOTOS_MIN_LIBRE_BYTES_POR_DEFECTO = 2 * 1024 ** 3;

/** Tope de las demoras de publicación: el CHECK `publicar_en_rango` de la migración 0015 es de 1 h. */
const DEMORA_MAX_S = 3600;

/** Variables que solo existen para las pruebas y no deberían estar definidas en producción. */
const VARIABLES_DE_PRUEBA = ['REPORTE_DEMORA_PRIMERO_S', 'REPORTE_DEMORA_SIGUIENTES_S'] as const;

/**
 * Avisos para el log del arranque: configuración válida pero sospechosa. No detienen el servicio
 * (una prueba de carga en un entorno con NODE_ENV=production puede querer la demora en 0), pero
 * con la demora cambiada un reporte se publica antes o después de lo que aprobó el usuario.
 */
export function avisosDeConfiguracion(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const definidas = VARIABLES_DE_PRUEBA.filter((v) => env[v]?.trim());
  if (!definidas.length) return [];
  return [
    `${definidas.join(' y ')} ${definidas.length > 1 ? 'están definidas' : 'está definida'} en producción: son solo para pruebas y cambian cuánto tarda en publicarse un reporte (${CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S} y ${CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S} s según el contrato). Quitalas del entorno.`,
  ];
}

/** Valores por defecto que NO pueden salir a producción: son públicos, están en el repositorio. */
const SAL_IP_POR_DEFECTO = 'sal-local-cambiar-en-produccion';
const SAL_JITTER_POR_DEFECTO = 'jitter-local-cambiar-en-produccion';

export interface ConfigApi {
  puerto: number;
  host: string;
  /**
   * `API_DATABASE_URL` si está, y si no `DATABASE_URL`. En el `.env` raíz, `DATABASE_URL` es la
   * del rol DUEÑO del esquema (migraciones, seeds, ETL); api-core se conecta con su rol de
   * privilegios mínimos (`curichi_api`), que va en `API_DATABASE_URL`.
   */
  databaseUrl: string;
  /** Conexiones máximas del pool de este proceso. El techo real es réplicas × poolMax. */
  poolMax: number;
  geoServiceUrl: string;
  /**
   * Token compartido con geo-service (`x-token-interno`): lo exige para invalidar capas y, con
   * él, las llamadas al resolver quedan fuera de su cupo por IP. Obligatorio en producción.
   */
  geoTokenInterno: string;
  corsOrigenes: string[];
  dirAlmacen: string;
  /**
   * Guarda de disco de las fotos (`FOTOS_MIN_LIBRE_BYTES`, por defecto 2 GiB). Solo con las fotos
   * en disco: por debajo, `POST /fotos` responde 507 SIN_ESPACIO antes de procesar y sin gastar
   * cupo, y `/ready` sale degradado. En la VPS ese disco es también el de PostgreSQL. 0 la apaga.
   */
  fotosMinLibreBytes: number;
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
   * Reportes por CUENTA y por día calendario en `zonaHoraria` (contracts 0.10.0), contados en la
   * base (`cuota_reporte_diaria`). Es el límite antiabuso principal desde que reportar exige
   * cuenta: el de IP no resiste a una IP dinámica, este sí. `REPORTES_POR_DIA_POR_CUENTA`; sin
   * definir, el del contrato.
   */
  reportesPorDia: number;
  /** Fotos por cuenta y por día calendario (`FOTOS_POR_DIA_POR_CUENTA`, contrato: 12). */
  fotosPorDia: number;
  /**
   * Altas de cuenta por IP y por día calendario, contadas en la base (`ALTAS_POR_DIA_POR_IP`,
   * contrato: 10). Es además del tope por hora (`registroPorIp`): el cupo es por cuenta, y crear
   * cuentas lo multiplicaría.
   */
  altasPorDiaPorIp: number;
  /**
   * Segundos entre que un reporte llega y que se publica: el 1.º del día de la cuenta y los
   * siguientes (contracts 0.11.0, ADR 0006). Por defecto las constantes del contrato (60 y 240).
   * `REPORTE_DEMORA_PRIMERO_S` y `REPORTE_DEMORA_SIGUIENTES_S` existen SOLO para las pruebas (de 0
   * a 3600: el CHECK de la base no deja pasar de una hora); en producción definirlas deja un aviso
   * en el log del arranque (`avisosDeConfiguracion`).
   */
  demoraPrimeroS: number;
  demoraSiguientesS: number;
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
   * Con la topología documentada (proxy TLS → Next → servicio) el valor es 1: el rewrite de Next
   * reenvía la cabecera sin añadir entrada, así que el único salto que escribe es el proxy TLS, y
   * con 2 el segundo «salto» es lo que escribió el navegador (test/seguridad.test.ts).
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
  /**
   * Zona horaria de la ciudad (nombre IANA), `ZONA_HORARIA` o la del contrato. Los filtros
   * `desde`/`hasta` son días de su calendario: comparados en la zona de la sesión de PostgreSQL
   * (UTC en Docker), un reporte de las 21:00 del 20 en La Paz caía en el día 21.
   */
  zonaHoraria: string;
  /**
   * Ciudad del despliegue (contracts 0.7.0, `GET /api/v1/configuracion`). Se arma con las
   * variables `CIUDAD_*` sobre `CONFIG_DOMINIO.CIUDAD_POR_DEFECTO` y comparte `zona_horaria` con
   * `zonaHoraria`: antes el centro del mapa, el locale y el nombre estaban fijados en el
   * JavaScript de cada frontend, así que una instalación en otra ciudad exigía recompilarlos.
   */
  ciudad: Ciudad;
  /**
   * URL base del panel (`apps/panel-admin`), normalizada (sin usuario ni contraseña) para viajar
   * en `panel_url` de `/auth/yo` (contracts 0.7.0). `null` = este despliegue no configuró panel.
   * Antes viajaba fija en el JavaScript público de la app ciudadana (`PANEL_ADMIN_URL` al
   * compilar); obligatoria y `https` en producción (`verificarProduccion`).
   */
  panelAdminUrl: string | null;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  const produccion = env.NODE_ENV === 'production';
  const zonaHoraria = leerZonaHoraria(env.ZONA_HORARIA);
  const cfg: ConfigApi = {
    puerto: Number(env.API_CORE_PORT ?? 3001),
    host: env.API_CORE_HOST ?? '127.0.0.1',
    // `||` y no `??`: el `.env.example` declara API_DATABASE_URL vacía (el Compose la arma), y
    // con `??` la cadena vacía ganaba y el servicio arrancaba sin URL.
    databaseUrl:
      env.API_DATABASE_URL ||
      env.DATABASE_URL ||
      'postgresql://curichi:curichi@127.0.0.1:5433/curichi',
    poolMax: Number(env.DB_POOL_MAX ?? POOL_MAX_POR_DEFECTO),
    geoServiceUrl: env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002',
    geoTokenInterno: env.GEO_TOKEN_INTERNO ?? '',
    corsOrigenes: (env.CORS_ORIGENES ?? 'http://localhost:3000,http://localhost:3100')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    dirAlmacen: env.STORAGE_DIR ?? resolve(raizRepo, 'infra/.storage/fotos'),
    fotosMinLibreBytes: enteroEnRango(
      'FOTOS_MIN_LIBRE_BYTES',
      env.FOTOS_MIN_LIBRE_BYTES,
      FOTOS_MIN_LIBRE_BYTES_POR_DEFECTO,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    urlPublica: env.PUBLIC_BASE_URL ?? '',
    cookieSegura: env.COOKIE_SEGURA === '1',
    sesionDias: Number(env.SESION_DIAS ?? 7),
    sesionIdleHoras: Number(env.SESION_IDLE_HORAS ?? 12),
    loginPeticionesPorVentana: Number(env.LOGIN_PETICIONES_POR_VENTANA ?? 20),
    registroPeticionesPorVentana: Number(env.REGISTRO_PETICIONES_POR_VENTANA ?? 10),
    registroPorIp: Number(env.REGISTRO_MAX_POR_IP ?? REGISTROS_POR_IP_POR_DEFECTO),
    registroVentanaMinutos: Number(env.REGISTRO_VENTANA_MINUTOS ?? REGISTRO_VENTANA_MINUTOS),
    reportesPorDia: enteroPositivo(
      'REPORTES_POR_DIA_POR_CUENTA',
      env.REPORTES_POR_DIA_POR_CUENTA,
      CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
    ),
    fotosPorDia: enteroPositivo(
      'FOTOS_POR_DIA_POR_CUENTA',
      env.FOTOS_POR_DIA_POR_CUENTA,
      CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA,
    ),
    altasPorDiaPorIp: enteroPositivo(
      'ALTAS_POR_DIA_POR_IP',
      env.ALTAS_POR_DIA_POR_IP,
      CONFIG_DOMINIO.ALTAS_POR_DIA_POR_IP,
    ),
    demoraPrimeroS: enteroEnRango(
      'REPORTE_DEMORA_PRIMERO_S',
      env.REPORTE_DEMORA_PRIMERO_S,
      CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S,
      0,
      DEMORA_MAX_S,
    ),
    demoraSiguientesS: enteroEnRango(
      'REPORTE_DEMORA_SIGUIENTES_S',
      env.REPORTE_DEMORA_SIGUIENTES_S,
      CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S,
      0,
      DEMORA_MAX_S,
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
    zonaHoraria,
    ciudad: leerCiudad(env, zonaHoraria),
    panelAdminUrl: leerPanelAdminUrl(env.PANEL_ADMIN_URL),
  };
  if (produccion) verificarProduccion(cfg);
  return cfg;
}

/**
 * Entero de `min` a `max`, o el valor por defecto si la variable falta o está vacía. Un valor
 * presente pero inválido detiene el arranque: con `Number()` a secas, «tres» daba NaN y todas las
 * comparaciones del cupo salían falsas, así que nadie podía reportar y nada lo avisaba.
 */
function enteroEnRango(
  nombre: string,
  valor: string | undefined,
  porDefecto: number,
  min: number,
  max: number,
): number {
  const v = valor?.trim();
  if (!v) return porDefecto;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${nombre} inválida: «${v}». Tiene que ser un entero de ${min} a ${max}.`);
  return n;
}

/** Un cupo: al menos 1 (con 0 nadie podría reportar) y acotado para que quepa en smallint. */
function enteroPositivo(nombre: string, valor: string | undefined, porDefecto: number): number {
  return enteroEnRango(nombre, valor, porDefecto, 1, 10_000);
}

/** `undefined`, vacía o solo espacios cuentan como ausente: cae al valor de la ciudad por defecto. */
function textoOPorDefecto(valor: string | undefined, porDefecto: string): string {
  const v = valor?.trim();
  return v ? v : porDefecto;
}

/** Igual que `textoOPorDefecto`, pero numérico: un valor no vacío que no parsea da NaN a propósito, para que `CiudadSchema` lo rechace con un mensaje y no se pierda en silencio. */
function numeroOPorDefecto(valor: string | undefined, porDefecto: number): number {
  const v = valor?.trim();
  return v ? Number(v) : porDefecto;
}

/**
 * Ciudad del despliegue: `CIUDAD_*` sobre `CONFIG_DOMINIO.CIUDAD_POR_DEFECTO`, con la MISMA zona
 * horaria que ya validó `leerZonaHoraria` (no una copia aparte que pudiera desincronizarse).
 *
 * Se valida al arrancar contra `CiudadSchema`, el mismo esquema que valida `GET
 * /api/v1/configuracion`: una ciudad mal configurada (un locale como `es_BO`, una latitud fuera
 * de rango) tiene que impedir que el servicio arranque, no llegar rota al navegador y romper ahí
 * con un `Intl` `RangeError`.
 */
function leerCiudad(env: NodeJS.ProcessEnv, zonaHoraria: string): Ciudad {
  const porDefecto = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
  const candidata = {
    nombre: textoOPorDefecto(env.CIUDAD_NOMBRE, porDefecto.nombre),
    pais: textoOPorDefecto(env.CIUDAD_PAIS, porDefecto.pais),
    zona_horaria: zonaHoraria,
    locale: textoOPorDefecto(env.CIUDAD_LOCALE, porDefecto.locale),
    centro: {
      lon: numeroOPorDefecto(env.CIUDAD_CENTRO_LON, porDefecto.centro.lon),
      lat: numeroOPorDefecto(env.CIUDAD_CENTRO_LAT, porDefecto.centro.lat),
    },
    zoom_inicial: numeroOPorDefecto(env.CIUDAD_ZOOM_INICIAL, porDefecto.zoom_inicial),
  };
  const r = CiudadSchema.safeParse(candidata);
  if (!r.success) {
    const detalle = r.error.issues
      .map((i) => `${i.path.join('.') || 'ciudad'}: ${i.message}`)
      .join('\n - ');
    throw new Error(
      `Configuración de ciudad inválida (variables CIUDAD_* y ZONA_HORARIA):\n - ${detalle}`,
    );
  }
  return r.data;
}

/**
 * URL base del panel administrativo, normalizada: mismo criterio que exige `SesionActualSchema`
 * para `panel_url` (http/https absoluta, sin usuario ni contraseña) y que ya aplicaba
 * `normalizarUrlDelPanel` en `web-ciudadano` cuando la URL viajaba fija en su JavaScript.
 *
 * Ausente o vacía: `null` (este despliegue no configuró panel; obligatoria en producción, ver
 * `verificarProduccion`). Presente pero mal formada: se detiene el arranque con el motivo, en vez
 * de servir `panel_url` roto a todo el que inicia sesión como técnico.
 */
function leerPanelAdminUrl(valor: string | undefined): string | null {
  const v = valor?.trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new Error(
      `PANEL_ADMIN_URL inválida: «${v}». Tiene que ser una URL absoluta http o https.`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`PANEL_ADMIN_URL inválida: «${v}». Solo se admite http o https.`);
  if (url.username || url.password)
    throw new Error(`PANEL_ADMIN_URL inválida: «${v}». No puede llevar usuario ni contraseña.`);
  return url.href;
}

/**
 * Se valida al arrancar y en cualquier entorno: con un nombre inválido cada filtro por fecha
 * fallaría en la base. Solo nombres IANA: un desfase como «-04:00» PostgreSQL lo lee con el signo
 * POSIX, al revés que ISO 8601, y filtraría con el desfase invertido sin dar ningún error.
 */
function leerZonaHoraria(valor: string | undefined): string {
  const zona = valor?.trim() || CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO;
  let valida = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(zona);
  try {
    if (valida) new Intl.DateTimeFormat('es', { timeZone: zona });
  } catch {
    valida = false;
  }
  if (!valida)
    throw new Error(`ZONA_HORARIA inválida: «${zona}». Usá un nombre IANA, p. ej. America/La_Paz.`);
  return zona;
}

/**
 * Longitud mínima de las sales. El jitter siembra con un hash no criptográfico (FNV-1a), así que
 * lo único que impide recalcular el desplazamiento de una vivienda es que la sal no se pueda
 * adivinar: una sal corta se prueba por fuerza bruta en segundos. 32 caracteres equivalen a los
 * 16 bytes aleatorios que recomienda `docs/operaciones/produccion.md`.
 */
export const SAL_MIN_LONGITUD = 32;

/** Longitud mínima de `GEO_TOKEN_INTERNO`: el mismo criterio que las sales. */
export const TOKEN_INTERNO_MIN_LONGITUD = 32;

/** En producción no se arranca con secretos de ejemplo ni con CORS abierto: se falla temprano. */
export function verificarProduccion(cfg: ConfigApi): void {
  const fallos: string[] = [];
  if (cfg.salIp === SAL_IP_POR_DEFECTO) fallos.push('IP_HASH_SAL usa el valor de ejemplo');
  else if (cfg.salIp.length < SAL_MIN_LONGITUD)
    fallos.push(`IP_HASH_SAL debe tener al menos ${SAL_MIN_LONGITUD} caracteres`);
  if (cfg.salJitter === SAL_JITTER_POR_DEFECTO) fallos.push('JITTER_SAL usa el valor de ejemplo');
  else if (cfg.salJitter.length < SAL_MIN_LONGITUD)
    fallos.push(`JITTER_SAL debe tener al menos ${SAL_MIN_LONGITUD} caracteres`);
  // Sin token, geo-service no distingue a api-core de cualquier otro cliente: cada POST /reportes
  // gasta el cupo por IP del resolver —todas salen del mismo origen, así que en una tormenta se
  // agota y crear reportes da 503— y la invalidación de capas recibe 403. geo-service ya se niega
  // a arrancar sin él; aquí se comprueba el otro extremo.
  if (!cfg.geoTokenInterno)
    fallos.push('GEO_TOKEN_INTERNO es obligatorio (el mismo valor que en geo-service)');
  else if (cfg.geoTokenInterno.length < TOKEN_INTERNO_MIN_LONGITUD)
    fallos.push(`GEO_TOKEN_INTERNO debe tener al menos ${TOKEN_INTERNO_MIN_LONGITUD} caracteres`);
  if (!cfg.cookieSegura) fallos.push('COOKIE_SEGURA debe ser 1 (cookie de sesión solo por HTTPS)');
  // Sin ella, /auth/yo manda panel_url = null a técnico, admin y ejecutivo, y el botón al panel
  // desaparece en producción sin que nada lo avise en el arranque.
  if (!cfg.panelAdminUrl) fallos.push('PANEL_ADMIN_URL es obligatoria en producción');
  else if (!cfg.panelAdminUrl.startsWith('https://'))
    fallos.push('PANEL_ADMIN_URL debe ser https en producción');
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
