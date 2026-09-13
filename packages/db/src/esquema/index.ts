/**
 * Esquema Drizzle: espejo tipado de migraciones/0001_inicial.sql para consultas en api-core y geo-service.
 * La fuente de verdad del DDL son las migraciones SQL; este archivo no genera DDL.
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

export const tiranteEnum = pgEnum('tirante_estimado', ['tobillo', 'rodilla', 'muslo', 'mas_70']);
export const duracionEnum = pgEnum('duracion_estimada', [
  'menos_30min',
  '30min_2h',
  '2h_12h',
  'mas_12h',
]);
export const frecuenciaEnum = pgEnum('frecuencia', [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
]);
export const afectacionEnum = pgEnum('afectacion', [
  'peatonal',
  'vehicular',
  'ingreso_viviendas',
  'corte_total_via',
]);
export const causaEnum = pgEnum('causa_presunta', [
  'sumidero_tapado',
  'falta_sumidero',
  'hundimiento_pavimento',
  'contrapendiente',
  'colector_saturado',
  'desborde_cauce',
  'desconocida',
]);
export const severidadEnum = pgEnum('severidad', ['baja', 'media', 'alta', 'critica']);
export const estadoEnum = pgEnum('estado_reporte', [
  'nuevo',
  'validado',
  'duplicado',
  'rechazado',
  'resuelto',
]);
export const rolEnum = pgEnum('rol', ['ciudadano', 'tecnico', 'admin']);
export const ubicacionMetodoEnum = pgEnum('ubicacion_metodo', ['gps', 'manual']);
export const ubicacionTipoEnum = pgEnum('ubicacion_tipo', [
  'via_publica',
  'vivienda_o_predio',
  'otro',
]);
export const sumideroCercanoEnum = pgEnum('sumidero_cercano', ['si', 'no', 'no_sabe']);
export const sumideroEstadoEnum = pgEnum('sumidero_estado', [
  'libre',
  'obstruido',
  'danado',
  'no_sabe',
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

export const sesion = pgTable('sesion', {
  id: text('id').primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuario.id, { onDelete: 'cascade' }),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
});

export const puntoCritico = pgTable('punto_critico', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  geom: geometry('geom').notNull(),
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
});

export const reporteInundacion = pgTable(
  'reporte_inundacion',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    geom: geometry('geom').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
    eventoEn: timestamp('evento_en', { withTimezone: true }),
    autorId: uuid('autor_id').references(() => usuario.id, { onDelete: 'set null' }),
    distritoId: text('distrito_id').notNull(),
    unidadVecinalId: text('unidad_vecinal_id').notNull(),
    manzanaId: text('manzana_id'),
    versionCapa: text('version_capa'),
    resolucionFlags: jsonb('resolucion_flags').notNull().default({}),
    ubicacionMetodo: ubicacionMetodoEnum('ubicacion_metodo').notNull(),
    precisionGpsM: numeric('precision_gps_m'),
    ubicacionTipo: ubicacionTipoEnum('ubicacion_tipo').notNull(),
    direccionAprox: text('direccion_aprox'),
    descripcion: text('descripcion').notNull(),
    tiranteEstimado: tiranteEnum('tirante_estimado').notNull(),
    duracionEstimada: duracionEnum('duracion_estimada').notNull(),
    frecuencia: frecuenciaEnum('frecuencia').notNull(),
    afectacion: afectacionEnum('afectacion').notNull(),
    causaPresunta: causaEnum('causa_presunta').notNull().default('desconocida'),
    sumideroCercano: sumideroCercanoEnum('sumidero_cercano'),
    sumideroEstado: sumideroEstadoEnum('sumidero_estado'),
    aguaBrotaSumidero: boolean('agua_brota_sumidero'),
    severidadCalculada: severidadEnum('severidad_calculada').notNull(),
    severidadPuntaje: integer('severidad_puntaje').notNull(),
    severidadVersion: integer('severidad_version').notNull().default(1),
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
  },
  (t) => [index('reporte_estado_idx').on(t.estado), index('reporte_uv_idx').on(t.unidadVecinalId)],
);

export const reporteFoto = pgTable('reporte_foto', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reporteId: uuid('reporte_id').references(() => reporteInundacion.id, { onDelete: 'cascade' }),
  objetoKey: text('objeto_key').notNull().unique(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  ancho: integer('ancho').notNull(),
  alto: integer('alto').notNull(),
  exifSanitizado: boolean('exif_sanitizado').notNull().default(false),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
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
