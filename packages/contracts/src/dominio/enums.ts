/**
 * Enums del dominio de Mi Curichi (CLAUDE.md §7.1). Única fuente de verdad para
 * base de datos, API, frontends y ETL (exportados a dist/dominio.json).
 */

export const TIRANTES = ['tobillo', 'rodilla', 'muslo', 'mas_70'] as const;
export type Tirante = (typeof TIRANTES)[number];

export const DURACIONES = ['menos_30min', '30min_2h', '2h_12h', 'mas_12h'] as const;
export type Duracion = (typeof DURACIONES)[number];

export const FRECUENCIAS = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const AFECTACIONES = [
  'peatonal',
  'vehicular',
  'ingreso_viviendas',
  'corte_total_via',
] as const;
export type Afectacion = (typeof AFECTACIONES)[number];

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

/** Estados visibles en el mapa público (moderación previa, CLAUDE.md §7.3). */
export const ESTADOS_PUBLICOS = [
  'validado',
  'resuelto',
] as const satisfies readonly EstadoReporte[];

export const ROLES = ['ciudadano', 'tecnico', 'admin'] as const;
export type Rol = (typeof ROLES)[number];

export const UBICACION_METODOS = ['gps', 'manual'] as const;
export type UbicacionMetodo = (typeof UBICACION_METODOS)[number];

export const UBICACION_TIPOS = ['via_publica', 'vivienda_o_predio', 'otro'] as const;
export type UbicacionTipo = (typeof UBICACION_TIPOS)[number];

export const SUMIDERO_CERCANO = ['si', 'no', 'no_sabe'] as const;
export type SumideroCercano = (typeof SUMIDERO_CERCANO)[number];

export const SUMIDERO_ESTADOS = ['libre', 'obstruido', 'danado', 'no_sabe'] as const;
export type SumideroEstado = (typeof SUMIDERO_ESTADOS)[number];

export const TIPOS_CAPA = ['distrito_municipal', 'unidad_vecinal', 'manzana'] as const;
export type TipoCapa = (typeof TIPOS_CAPA)[number];

/** Etiquetas en español para la interfaz. La severidad nunca se muestra solo con color. */
export const ETIQUETAS = {
  tirante: {
    tobillo: { corta: 'Al tobillo', rango: '<10 cm' },
    rodilla: { corta: 'A la rodilla', rango: '10–40 cm' },
    muslo: { corta: 'Al muslo', rango: '40–70 cm' },
    mas_70: { corta: 'Más arriba de la cintura', rango: '>70 cm' },
  },
  duracion: {
    menos_30min: 'Menos de 30 minutos',
    '30min_2h': '30 minutos a 2 horas',
    '2h_12h': '2 a 12 horas',
    mas_12h: 'Más de 12 horas',
  },
  frecuencia: {
    primera_vez: 'Primera vez',
    ocasional: 'Ocasional',
    cada_lluvia_fuerte: 'Cada lluvia fuerte',
    permanente: 'Permanente',
  },
  afectacion: {
    peatonal: 'Peatonal',
    vehicular: 'Vehicular',
    ingreso_viviendas: 'Ingreso de agua a viviendas',
    corte_total_via: 'Corte total de la vía',
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
  ubicacion_tipo: {
    via_publica: 'Vía pública',
    vivienda_o_predio: 'Vivienda o predio',
    otro: 'Otro',
  },
  sumidero_cercano: { si: 'Sí', no: 'No', no_sabe: 'No sé' },
  sumidero_estado: { libre: 'Libre', obstruido: 'Obstruido', danado: 'Dañado', no_sabe: 'No sé' },
  tipo_capa: {
    distrito_municipal: 'Distrito municipal',
    unidad_vecinal: 'Unidad vecinal',
    manzana: 'Manzana',
  },
} as const;

/** Colores de severidad del sistema de diseño (CLAUDE.md §14.4). Relleno y texto. */
export const COLORES_SEVERIDAD = {
  baja: { relleno: '#28934D', texto: '#1B6B38', barras: 1 },
  media: { relleno: '#C98A0E', texto: '#8A5A00', barras: 2 },
  alta: { relleno: '#E4601B', texto: '#B84A0E', barras: 3 },
  critica: { relleno: '#B3200A', texto: '#FFFFFF', barras: 4 },
} as const satisfies Record<Severidad, { relleno: string; texto: string; barras: number }>;
