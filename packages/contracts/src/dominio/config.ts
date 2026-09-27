import { ETIQUETAS } from './enums.js';

/** Se declara aparte porque la usan dos entradas: la zona suelta y la de la ciudad por defecto. */
const ZONA_HORARIA_POR_DEFECTO = 'America/La_Paz';

/**
 * Parámetros de dominio (CLAUDE.md §9 y §13). Valores iniciales propuestos; se validan
 * con el técnico municipal en Fase 1 (<a confirmar>). Cambiarlos es cambio de contrato.
 */
export const CONFIG_DOMINIO = {
  /** Radio para agrupar reportes validados en un punto crítico (§9.2). */
  RECURRENCIA_RADIO_M: 25,
  /** Un grupo cuyo diámetro supere 4 × radio se marca como advertencia (§9.2). */
  RECURRENCIA_DIAMETRO_ADVERTENCIA_M: 100,
  /** Jitter determinista en la vista pública cuando la ubicación es vivienda o predio (§13). */
  JITTER_PUBLICO_M: 30,
  /** Decimales de coordenadas en la vista pública (5 ≈ 1 m). */
  PRECISION_PUBLICA_DECIMALES: 5,
  /** Tolerancia para asignar la UV más cercana cuando el punto cae en un hueco (§7.4). */
  TOLERANCIA_HUECO_M: 20,
  /** CRS métrico para distancias y DBSCAN: WGS 84 / UTM 20S (Santa Cruz) <a confirmar>. */
  CRS_METRICO_EPSG: 32720,
  /**
   * Distancia máxima entre el punto reportado y la posición que informa el teléfono al enviar
   * (§13, «Ubicación del dispositivo»). Es una comprobación de coherencia, no una prueba de
   * presencia: el GPS se puede falsear.
   */
  REPORTE_RADIO_DISPOSITIVO_M: 60,
  /**
   * Metros que api-core suma al radio al comprobarlo: absorben el redondeo de las coordenadas que
   * manda el cliente. La interfaz recorta el marcador al radio sin tolerancia.
   */
  REPORTE_RADIO_TOLERANCIA_M: 0.5,
  /**
   * Precisión que tiene que declarar el teléfono (`coords.accuracy`) para aceptar el reporte
   * (decisión del usuario, configurable). Va aparte del esquema a propósito: si Zod la acotara,
   * la respuesta sería 400 PAYLOAD_INVALIDO y no el 422 PRECISION_INSUFICIENTE que la interfaz
   * necesita para explicar qué pasa.
   */
  PRECISION_DISPOSITIVO_MAX_M: 50,
  /** Antigüedad máxima de la posición del teléfono al enviar <a confirmar con el municipio>. */
  POSICION_ANTIGUEDAD_MAX_S: 600,
  FOTO_MAX_BYTES: 8 * 1024 * 1024,
  FOTOS_MAX_POR_REPORTE: 3,
  /**
   * Formatos que se aceptan al SUBIR, reconocidos por su contenido y no por la extensión. Lo que
   * se guarda es otra cosa: siempre `FOTO_FORMATO_SALIDA`.
   */
  FOTO_MIME_PERMITIDOS: ['image/jpeg', 'image/png', 'image/webp'] as const,
  /**
   * Formato en que se guarda y se sirve toda foto nueva, sea cual sea el de entrada. Volver a
   * codificarla es además lo que le quita los metadatos. Las .jpg anteriores a 0.8.0 no se
   * reconvierten.
   */
  FOTO_FORMATO_SALIDA: 'image/webp',
  /** Calidad WebP de la foto guardada (0–100) <a confirmar con el municipio>. */
  FOTO_CALIDAD_WEBP: 80,
  /**
   * Tope POR LADO: la foto guardada entra en un cuadrado de 1600 × 1600 sin deformarse. Solo con
   * el ancho, una foto vertical de 1200 × 4000 se guardaba entera.
   */
  FOTO_ANCHO_MAX_PX: 1600,
  FOTO_ALTO_MAX_PX: 1600,
  RATE_LIMIT_REPORTES_POR_HORA: 10,
  /**
   * Reportes que una CUENTA puede crear por día calendario en `ZONA_HORARIA` (§13), además del
   * límite por IP: uno acota a la persona y el otro a la conexión. El día se cuenta en la zona de
   * la ciudad y no en UTC, para que «hoy» sea el mismo para el vecino y para el servidor, y el
   * cupo vuelve entero a la medianoche local. Lo cuenta la base, así que vale igual con varias
   * réplicas <a confirmar con el municipio>.
   */
  REPORTES_POR_DIA_POR_CUENTA: 3,
  /**
   * Fotos que una CUENTA puede subir por día calendario en `ZONA_HORARIA`. Con 3 reportes de hasta
   * 3 fotos, 12 deja margen para repetir alguna sin que la subida sirva de almacenamiento gratuito
   * <a confirmar con el municipio>.
   */
  FOTOS_POR_DIA_POR_CUENTA: 12,
  /**
   * Cuentas nuevas que se pueden crear desde una misma IP por día calendario, además del límite por
   * hora. El cupo es por cuenta, así que crear cuentas lo multiplicaría; este tope lo encarece, a
   * costa de poder frenar a un barrio que sale por la misma IP <a confirmar con el municipio>.
   */
  ALTAS_POR_DIA_POR_IP: 10,
  /**
   * Segundos entre que el reporte llega al servidor y que se hace visible, para el 1.º reporte del
   * día de la cuenta y para el 2.º y el 3.º (§7.3). Los fija api-core en `publicar_en` al crear, con
   * el número que devuelve el contador del cupo diario: ningún cliente los puede adelantar. Las
   * variables `REPORTE_DEMORA_PRIMERO_S` y `REPORTE_DEMORA_SIGUIENTES_S` de api-core existen solo
   * para las pruebas <a confirmar con el municipio>.
   */
  DEMORA_PUBLICACION_PRIMERO_S: 60,
  DEMORA_PUBLICACION_SIGUIENTES_S: 240,
  /** Reportes que devuelve `GET /api/v1/mis-reportes`, los más recientes primero. */
  MIS_REPORTES_MAX: 50,
  /**
   * Longitud mínima de una contraseña nueva. OWASP pide 8 como mínimo absoluto; se piden 10
   * porque el coste para quien se registra es nulo y el espacio de búsqueda crece mucho.
   * El login acepta desde 8 para no dejar fuera a las cuentas creadas antes de esta regla.
   */
  PASSWORD_MIN_LONGITUD: 10,
  PASSWORD_MAX_LONGITUD: 200,
  DESCRIPCION_MIN: 10,
  DESCRIPCION_MAX: 1000,
  /**
   * Minutos que `evento_en` puede adelantarse al reloj del servidor: absorbe la deriva del reloj
   * del celular. Más allá la fecha es futura y se rechaza (antes `2099-01-01` se guardaba).
   */
  EVENTO_TOLERANCIA_FUTURO_MIN: 10,
  /** Antigüedad máxima de `evento_en`. Se compara con el instante de la validación. */
  EVENTO_MAX_DIAS_ATRAS: 365,
  /**
   * Filas máximas de una exportación, y valor por defecto de su `limite`. Si la selección tiene
   * más, la respuesta lo declara (`total`, `exportados`, `truncado`): nunca se recorta en
   * silencio, que es lo que pasaba con el defecto anterior de 10 000.
   */
  EXPORTAR_MAX_FILAS: 50_000,
  /** Días que se conserva ip_hash para antispam (§13) <a confirmar>. */
  IP_HASH_RETENCION_DIAS: 30,
  /**
   * Zona horaria del despliegue. Es el valor POR DEFECTO de un despliegue por ciudad, no una
   * constante del dominio: api-core lo sobrescribe con la variable de entorno `ZONA_HORARIA`, así
   * que otra ciudad se configura sin tocar el contrato.
   */
  ZONA_HORARIA_POR_DEFECTO,
  /**
   * Ciudad del despliegue cuando no se configura otra: la instalación actual, que así no necesita
   * ninguna variable nueva. Es lo que devuelve `GET /api/v1/configuracion` (`CiudadSchema`); cada
   * despliegue la sobrescribe en api-core, no en el contrato. Centro y zoom son los que usaba el
   * mapa público cuando estaban escritos en su código (`CENTRO_INICIAL`, zoom 13).
   */
  CIUDAD_POR_DEFECTO: {
    nombre: 'Santa Cruz de la Sierra',
    pais: 'BO',
    zona_horaria: ZONA_HORARIA_POR_DEFECTO,
    locale: 'es-BO',
    centro: { lon: -63.18, lat: -17.78 },
    zoom_inicial: 13,
  },
} as const;

export const NOTA_METODOLOGICA =
  'Mi Curichi es un inventario de reportes ciudadanos. Los datos son de percepción, no medidos: ' +
  'la profundidad se estima por referencia corporal y la ubicación tiene el error ' +
  'del GPS del celular o de la mano del usuario. No es un modelo hidráulico ni un estudio de drenaje. ' +
  'Cualquier decisión de inversión requiere estudio técnico formal. La ausencia de reportes en una zona ' +
  'no significa ausencia de anegamiento. ' +
  `Los reportes marcados «${ETIQUETAS.estado_publico.nuevo}» no fueron revisados por un técnico y pueden ser erróneos. ` +
  `El radio de ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m no prueba que el vecino estuviera en el lugar: ` +
  'el GPS del teléfono se puede falsear.';
