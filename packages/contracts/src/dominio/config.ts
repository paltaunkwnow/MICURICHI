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
  RATE_LIMIT_REPORTES_POR_HORA: 10,
  DESCRIPCION_MIN: 10,
  DESCRIPCION_MAX: 1000,
  /** Días que se conserva ip_hash para antispam (§13) <a confirmar>. */
  IP_HASH_RETENCION_DIAS: 30,
} as const;

export const NOTA_METODOLOGICA =
  'Mi Curichi es un inventario de reportes ciudadanos. Los datos son de percepción, no medidos: ' +
  'el tirante se estima por referencia corporal, la duración es recordada y la ubicación tiene el error ' +
  'del GPS del celular o de la mano del usuario. No es un modelo hidráulico ni un estudio de drenaje. ' +
  'Cualquier decisión de inversión requiere estudio técnico formal. La ausencia de reportes en una zona ' +
  'no significa ausencia de anegamiento.';
