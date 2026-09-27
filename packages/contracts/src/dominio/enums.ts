/**
 * Enums del dominio de Mi Curichi (CLAUDE.md §7.1). Única fuente de verdad para
 * base de datos, API, frontends y ETL (exportados a dist/dominio.json).
 */

export const PROFUNDIDADES = ['tobillo', 'rodilla', 'muslo', 'mas_70'] as const;
export type Profundidad = (typeof PROFUNDIDADES)[number];

export const FRECUENCIAS = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const CAUSAS_PRESUNTAS = [
  'sumidero_tapado',
  'falta_sumidero',
  'hundimiento_pavimento',
  'contrapendiente',
  'colector_saturado',
  'desborde_cauce',
  'desconocida',
] as const;
export type CausaPresunta = (typeof CAUSAS_PRESUNTAS)[number];

export const SEVERIDADES = ['baja', 'media', 'alta', 'critica'] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export const ESTADOS_REPORTE = ['nuevo', 'validado', 'duplicado', 'rechazado', 'resuelto'] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

/**
 * Estados de la vista pública (CLAUDE.md §7.3), siempre con `publicar_en <= now()`. Desde 0.11.0 no
 * hay moderación previa: `nuevo` se publica con la etiqueta «NO SE HA VERIFICADO». Es la única
 * lista de visibilidad: api-core y geo-service arman con ella el literal SQL de sus consultas.
 */
export const ESTADOS_PUBLICOS = [
  'nuevo',
  'validado',
  'resuelto',
] as const satisfies readonly EstadoReporte[];
export type EstadoPublico = (typeof ESTADOS_PUBLICOS)[number];

/**
 * Estados que revisó un técnico (`verificado = true`). Solo estos arman los puntos críticos y
 * el color público de gravedad por UV (§9.2): un reporte sin revisar no fabrica recurrencia.
 */
export const ESTADOS_VERIFICADOS = [
  'validado',
  'resuelto',
] as const satisfies readonly EstadoPublico[];
export type EstadoVerificado = (typeof ESTADOS_VERIFICADOS)[number];

/** Estados que sacan un reporte del mapa: rechazar o fusionar lo retira (`retirado = true`). */
export const ESTADOS_RETIRADOS = [
  'rechazado',
  'duplicado',
] as const satisfies readonly EstadoReporte[];
export type EstadoRetirado = (typeof ESTADOS_RETIRADOS)[number];

export const ROLES = ['ciudadano', 'tecnico', 'admin', 'ejecutivo'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Roles que trabajan en el panel (`apps/panel-admin`): los únicos a los que `/auth/yo` les manda
 * `panel_url`. Es una lista de permitidos a propósito: un rol nuevo no recibe la dirección del
 * panel hasta que alguien lo agregue aquí.
 */
export const ROLES_DEL_PANEL = ['tecnico', 'admin', 'ejecutivo'] as const satisfies readonly Rol[];
export type RolDelPanel = (typeof ROLES_DEL_PANEL)[number];

export const UBICACION_METODOS = ['gps', 'manual'] as const;
export type UbicacionMetodo = (typeof UBICACION_METODOS)[number];

export const UBICACION_TIPOS = ['via_publica', 'vivienda_o_predio', 'otro'] as const;
export type UbicacionTipo = (typeof UBICACION_TIPOS)[number];

/** «No contestó» es null: no hay valor «no sé» (contracts 0.5.0). */
export const SUMIDERO_CERCANO = ['si', 'no'] as const;
export type SumideroCercano = (typeof SUMIDERO_CERCANO)[number];

export const SUMIDERO_ESTADOS = ['tapado', 'no_tapado'] as const;
export type SumideroEstado = (typeof SUMIDERO_ESTADOS)[number];

export const TIPOS_CAPA = ['distrito_municipal', 'unidad_vecinal', 'manzana'] as const;
export type TipoCapa = (typeof TIPOS_CAPA)[number];

/** Etiquetas en español para la interfaz. La severidad nunca se muestra solo con color. */
export const ETIQUETAS = {
  /** Rótulos de campo. `profundidad` es la forma corta (encabezado de columna, ficha). */
  campos: {
    profundidad_estimada: 'Profundidad estimada',
    profundidad: 'Profundidad',
    sumidero_cercano: '¿Hay sumidero cercano?',
    sumidero_estado: '¿Está tapado?',
  },
  profundidad: {
    tobillo: { corta: 'Al tobillo', rango: '<10 cm' },
    rodilla: { corta: 'A la rodilla', rango: '10–40 cm' },
    muslo: { corta: 'Al muslo', rango: '40–70 cm' },
    mas_70: { corta: 'Más arriba de la cintura', rango: '>70 cm' },
  },
  frecuencia: {
    primera_vez: 'Primera vez',
    ocasional: 'Ocasional',
    cada_lluvia_fuerte: 'Cada lluvia fuerte',
    permanente: 'Permanente',
  },
  causa_presunta: {
    sumidero_tapado: 'Sumidero tapado',
    falta_sumidero: 'Falta de sumidero',
    hundimiento_pavimento: 'Hundimiento del pavimento',
    contrapendiente: 'Contrapendiente',
    colector_saturado: 'Colector saturado',
    desborde_cauce: 'Desborde de cauce o canal',
    desconocida: 'No sé',
  },
  severidad: {
    baja: 'Baja',
    media: 'Media',
    alta: 'Alta',
    critica: 'Crítica',
  },
  estado: {
    nuevo: 'Nuevo',
    validado: 'Validado',
    duplicado: 'Duplicado',
    rechazado: 'Rechazado',
    resuelto: 'Resuelto',
  },
  /**
   * Cómo ve el público el estado (mapa, tarjetas, detalle y leyenda). `nuevo` lleva el texto
   * EXACTO «NO SE HA VERIFICADO», decisión del usuario: no se traduce ni se abrevia. `estado`, de
   * arriba, es el rótulo del panel.
   */
  estado_publico: {
    nuevo: 'NO SE HA VERIFICADO',
    validado: 'Verificado',
    resuelto: 'Resuelto',
  } satisfies Record<EstadoPublico, string>,
  ubicacion_tipo: {
    via_publica: 'Vía pública',
    vivienda_o_predio: 'Vivienda o predio',
    otro: 'Otro',
  },
  sumidero_cercano: { si: 'Sí', no: 'No' },
  sumidero_estado: { tapado: 'Tapado', no_tapado: 'No tapado' },
  tipo_capa: {
    distrito_municipal: 'Distrito municipal',
    unidad_vecinal: 'Unidad vecinal',
    manzana: 'Manzana',
  },
  rol: {
    ciudadano: 'Ciudadano',
    tecnico: 'Técnico',
    admin: 'Administrador',
    ejecutivo: 'Ejecutivo',
  },
} as const;

/** Colores de severidad del sistema de diseño (CLAUDE.md §14.4). Relleno y texto. */
export const COLORES_SEVERIDAD = {
  baja: { relleno: '#28934D', texto: '#1B6B38', barras: 1 },
  media: { relleno: '#C98A0E', texto: '#8A5A00', barras: 2 },
  alta: { relleno: '#E4601B', texto: '#B84A0E', barras: 3 },
  critica: { relleno: '#B3200A', texto: '#FFFFFF', barras: 4 },
} as const satisfies Record<Severidad, { relleno: string; texto: string; barras: number }>;
