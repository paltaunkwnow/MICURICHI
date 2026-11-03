/**
 * Esquema Drizzle: espejo tipado del esquema0022 para consultas en api-core y geo-service.
 * La fuente de verdad del DDL son las migraciones SQL; este archivo no genera DDL.
 *
 * Una migración que añade o cambia columnas tiene que actualizar este archivo en el mismo cambio:
 * `test/esquema-drizzle.test.ts` compara columnas, tipos, nulabilidad, DEFAULT y enums con una
 * base migrada desde cero. Se había desalineado (faltaban `geom_publico` y `ultimo_uso_en`, y
 * `severidad_version` seguía con DEFAULT 1) sin que nada lo notara.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Geometría PostGIS. Se lee como GeoJSON (ST_AsGeoJSON) y se escribe desde GeoJSON o WKT en SQL crudo. */
export const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry';
  },
});

export const severidadEnum = pgEnum('severidad', ['baja', 'media', 'alta', 'critica']);
export const estadoEnum = pgEnum('estado_reporte', [
  'nuevo',
  'validado',
  'duplicado',
  'rechazado',
  'resuelto',
]);
export const rolEnum = pgEnum('rol', ['ciudadano', 'tecnico', 'ejecutivo', 'admin']);
export const ubicacionMetodoEnum = pgEnum('ubicacion_metodo', ['gps', 'manual', 'aproximada']);
export const ubicacionTipoEnum = pgEnum('ubicacion_tipo', [
  'via_publica',
  'vivienda_o_predio',
  'otro',
]);

export const geo = pgSchema('geo');

export const capaVersion = geo.table('capa_version', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  capa: text('capa').notNull(),
  version: text('version').notNull(),
  fuente: text('fuente'),
  fechaVigencia: date('fecha_vigencia'),
  crsOrigen: text('crs_origen'),
  sha256Manifiesto: text('sha256_manifiesto'),
  nFeatures: integer('n_features').notNull().default(0),
  cargadoEn: timestamp('cargado_en', { withTimezone: true }).notNull().defaultNow(),
  vigente: boolean('vigente').notNull().default(false),
  activadoPor: uuid('activado_por'),
  activadoEn: timestamp('activado_en', { withTimezone: true }),
});

const columnasCapa = {
  id: text('id').notNull(),
  codigo: text('codigo').notNull(),
  nombre: text('nombre').notNull(),
  geom: geometry('geom').notNull(),
  versionCapa: text('version_capa').notNull(),
  fuente: text('fuente'),
  fechaVigencia: date('fecha_vigencia'),
};

export const distritoMunicipal = geo.table('distrito_municipal', { ...columnasCapa }, (t) => [
  primaryKey({ columns: [t.id, t.versionCapa] }),
]);

export const unidadVecinal = geo.table(
  'unidad_vecinal',
  {
    ...columnasCapa,
    distritoId: text('distrito_id').notNull(),
    distritoInferido: boolean('distrito_inferido').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.id, t.versionCapa] })],
);

export const manzana = geo.table(
  'manzana',
  {
    ...columnasCapa,
    /** La capa de manzanas no siempre trae nombre: DEFAULT '' desde la 0001. */
    nombre: text('nombre').notNull().default(''),
    distritoId: text('distrito_id'),
    unidadVecinalId: text('unidad_vecinal_id'),
  },
  (t) => [primaryKey({ columns: [t.id, t.versionCapa] })],
);

export const usuario = pgTable('usuario', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull(),
  nombre: text('nombre').notNull(),
  rol: rolEnum('rol').notNull().default('ciudadano'),
  passwordHash: text('password_hash').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Archivo histórico0022 exclusivo del dueño: mantiene valores y PK, sin FK ni limpieza.
 * Los servicios no lo consultan. El contador vigente continúa en `cupo_contador`.
 */
export const resguardoM10 = pgSchema('resguardo_m10');
export const cuotaReporteDiariaArchivada = resguardoM10.table(
  'cuota_reporte_diaria',
  {
    usuarioId: uuid('usuario_id').notNull(),
    dia: date('dia').notNull(),
    reportesN: smallint('reportes_n').notNull().default(0),
    fotosN: smallint('fotos_n').notNull().default(0),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.dia] }),
    index('cuota_reporte_diaria_dia').on(t.dia),
  ],
);

export const sesion = pgTable('sesion', {
  id: text('id').primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuario.id, { onDelete: 'cascade' }),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  /** Caducidad por inactividad (migración 0003): `expira_en` es el tope absoluto. */
  ultimoUsoEn: timestamp('ultimo_uso_en', { withTimezone: true }).notNull().defaultNow(),
});

export const puntoCritico = pgTable('punto_critico', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  geom: geometry('geom').notNull(),
  /** Centroide publicable (migración 0005): media de los puntos ya degradados; NULL no se publica. */
  geomPublico: geometry('geom_publico'),
  nReportes: integer('n_reportes').notNull(),
  primerReporteEn: timestamp('primer_reporte_en', { withTimezone: true }).notNull(),
  ultimoReporteEn: timestamp('ultimo_reporte_en', { withTimezone: true }).notNull(),
  severidadMax: severidadEnum('severidad_max').notNull(),
  distritoId: text('distrito_id'),
  unidadVecinalId: text('unidad_vecinal_id'),
  radioM: numeric('radio_m').notNull(),
  diametroM: numeric('diametro_m').notNull().default('0'),
  advertenciaDiametro: boolean('advertencia_diametro').notNull().default(false),
  calculadoEn: timestamp('calculado_en', { withTimezone: true }).notNull().defaultNow(),
  /** Categoría del punto crítico (migración 0020): los existentes son de inundación. */
  categoria: text('categoria').notNull().default('inundacion'),
});

/**
 * Catálogo de categorías de la plataforma (migración 0020, ADR 0009). El admin activa cada una con
 * auditoría; mientras haya una sola activa, la interfaz no muestra selector. El orden es el de
 * `SLUGS_CATEGORIA` de contracts.
 */
export const categoria = pgTable('categoria', {
  slug: text('slug').primaryKey(),
  activa: boolean('activa').notNull().default(false),
  orden: smallint('orden').notNull(),
  activadaEn: timestamp('activada_en', { withTimezone: true }),
  activadaPor: uuid('activada_por').references(() => usuario.id, { onDelete: 'set null' }),
});

/**
 * Tabla de reportes del modelo multicategoría (migración 0020, ADR 0010): antes `reporte_inundacion`,
 * renombrada. Lo común va tipado; `categoria` (FK al catálogo), `subtipo` y `detalle` jsonb
 * (`detalle_version`) llevan lo propio de cada categoría. Desde0022 no existen planos/vista/trigger:
 * el JSON es la fuente única. Una operación equivalente a la antigua vista incluye
 * explícitamente `categoria = 'inundacion'`.
 */
export const reporte = pgTable('reporte', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  geom: geometry('geom').notNull(),
  geomPublico: geometry('geom_publico'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  publicarEn: timestamp('publicar_en', { withTimezone: true }).notNull(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  eventoEn: timestamp('evento_en', { withTimezone: true }),
  autorId: uuid('autor_id').references(() => usuario.id, { onDelete: 'set null' }),
  distritoId: text('distrito_id').notNull(),
  unidadVecinalId: text('unidad_vecinal_id').notNull(),
  versionCapa: text('version_capa'),
  resolucionFlags: jsonb('resolucion_flags').notNull().default({}),
  ubicacionMetodo: ubicacionMetodoEnum('ubicacion_metodo').notNull(),
  precisionGpsM: numeric('precision_gps_m'),
  distanciaDispositivoM: smallint('distancia_dispositivo_m'),
  ubicacionTipo: ubicacionTipoEnum('ubicacion_tipo').notNull(),
  descripcion: text('descripcion').notNull(),
  severidadCalculada: severidadEnum('severidad_calculada').notNull(),
  severidadPuntaje: integer('severidad_puntaje').notNull(),
  severidadVersion: integer('severidad_version').notNull().default(2),
  severidadManual: severidadEnum('severidad_manual'),
  severidadMotivo: text('severidad_motivo'),
  estado: estadoEnum('estado').notNull().default('nuevo'),
  estadoMotivo: text('estado_motivo'),
  fusionadoEnId: uuid('fusionado_en_id'),
  puntoCriticoId: uuid('punto_critico_id').references(() => puntoCritico.id, {
    onDelete: 'set null',
  }),
  validadoPor: uuid('validado_por').references(() => usuario.id, { onDelete: 'set null' }),
  validadoEn: timestamp('validado_en', { withTimezone: true }),
  ipHash: text('ip_hash'),
  // Columnas del modelo multicategoría (0020).
  categoria: text('categoria').notNull().default('inundacion'),
  subtipo: text('subtipo'),
  detalle: jsonb('detalle').notNull().default({}),
  detalleVersion: smallint('detalle_version').notNull().default(1),
});

/**
 * Contador vigente desde M3b (0020, ADR 0017). Upsert atómico por
 * `(usuario_id, clave, ventana_inicio)`: reportes por categoría y fotos globales por cuenta.
 * El archivo histórico0022 no se mezcla con este contador ni se limpia.
 */
export const cupoContador = pgTable(
  'cupo_contador',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    clave: text('clave').notNull(),
    ventanaInicio: timestamp('ventana_inicio', { withTimezone: true }).notNull(),
    n: integer('n').notNull(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.clave, t.ventanaInicio] })],
);

export const reporteFoto = pgTable('reporte_foto', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reporteId: uuid('reporte_id').references(() => reporte.id, { onDelete: 'cascade' }),
  objetoKey: text('objeto_key').notNull().unique(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  ancho: integer('ancho').notNull(),
  alto: integer('alto').notNull(),
  exifSanitizado: boolean('exif_sanitizado').notNull().default(false),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  /** Cuenta que subió la foto (migración 0012). NULL en las anteriores o si la cuenta se borró. */
  subidoPor: uuid('subido_por').references(() => usuario.id, { onDelete: 'set null' }),
});

export const auditoria = pgTable('auditoria', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  entidad: text('entidad').notNull(),
  entidadId: text('entidad_id').notNull(),
  accion: text('accion').notNull(),
  actorId: uuid('actor_id'),
  antes: jsonb('antes'),
  despues: jsonb('despues'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});
