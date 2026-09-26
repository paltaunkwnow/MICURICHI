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
  FOTO_MAX_BYTES: 8 * 1024 * 1024,
  FOTOS_MAX_POR_REPORTE: 3,
  FOTO_MIME_PERMITIDOS: ['image/jpeg', 'image/png', 'image/webp'] as const,
  FOTO_ANCHO_MAX_PX: 1600,
  /**
   * Fotos que una CUENTA puede subir por hora (§13), además del límite por IP. Con un reporte por
   * hora y hasta 3 fotos cada uno, 12 deja margen para reintentos y reemplazos sin que la subida
   * sirva de almacenamiento gratuito.
   */
  FOTOS_POR_HORA_POR_CUENTA: 12,
  RATE_LIMIT_REPORTES_POR_HORA: 10,
  /**
   * Minutos que una CUENTA debe esperar entre dos reportes aceptados (§13, antiabuso).
   *
   * Es una ventana deslizante desde el último reporte aceptado, no una ventana horaria de reloj:
   * con ventanas de reloj, quien envía a las 10:59 puede volver a enviar a las 11:00 y sacar dos
   * reportes en un minuto. El límite por IP de arriba sigue existiendo y es independiente: uno
   * acota a la persona y el otro a la conexión, y ninguno sustituye al otro.
   */
  MINUTOS_ENTRE_REPORTES_POR_CUENTA: 60,
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
  'no significa ausencia de anegamiento.';
