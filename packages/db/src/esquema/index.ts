/**
 * Esquema Drizzle: espejo tipado de las migraciones SQL (0001 … 0015) para consultas en api-core y geo-service.
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

export const profundidadEnum = pgEnum('profundidad_estimada', [
  'tobillo',
  'rodilla',
  'muslo',
  'mas_70',
]);
export const frecuenciaEnum = pgEnum('frecuencia', [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
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
export const rolEnum = pgEnum('rol', ['ciudadano', 'tecnico', 'ejecutivo', 'admin']);
export const ubicacionMetodoEnum = pgEnum('ubicacion_metodo', ['gps', 'manual']);
export const ubicacionTipoEnum = pgEnum('ubicacion_tipo', [
  'via_publica',
  'vivienda_o_predio',
  'otro',
]);
export const sumideroCercanoEnum = pgEnum('sumidero_cercano', ['si', 'no']);
export const sumideroEstadoEnum = pgEnum('sumidero_estado', ['tapado', 'no_tapado']);

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
 * Cupo diario por cuenta (migración 0014, contrato 0.10.0): una fila por cuenta y por día calendario
 * de la ciudad. api-core la incrementa con INSERT … ON CONFLICT DO UPDATE … WHERE n < máximo y el
 * mantenimiento borra los días anteriores. `dia` lo calcula quien escribe, en `ZONA_HORARIA`.
 */
export const cuotaReporteDiaria = pgTable(
  'cuota_reporte_diaria',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
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
});

export const reporteInundacion = pgTable(
  'reporte_inundacion',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    geom: geometry('geom').notNull(),
    /** Punto publicable (migración 0005): redondeado y, en vivienda o predio, con jitter (§13). */
    geomPublico: geometry('geom_publico'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Desde cuándo es visible (migración 0015, contrato 0.11.0): api-core la fija al crear el
     * reporte (60 o 240 s). CHECK entre `creado_en` y `creado_en + 1 hora`. Sin DEFAULT desde la
     * 0016: un INSERT que no la fije falla en lugar de publicar el reporte al instante.
     */
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
    /**
     * Metros entre el punto y el dispositivo al enviar (migración 0013, CHECK de 0 a 1000). NULL en
     * los reportes anteriores. La posición del dispositivo no se guarda.
     */
    distanciaDispositivoM: smallint('distancia_dispositivo_m'),
    ubicacionTipo: ubicacionTipoEnum('ubicacion_tipo').notNull(),
    descripcion: text('descripcion').notNull(),
    profundidadEstimada: profundidadEnum('profundidad_estimada').notNull(),
    frecuencia: frecuenciaEnum('frecuencia').notNull(),
    causaPresunta: causaEnum('causa_presunta').notNull().default('desconocida'),
    sumideroCercano: sumideroCercanoEnum('sumidero_cercano'),
    sumideroEstado: sumideroEstadoEnum('sumidero_estado'),
    aguaBrotaSumidero: boolean('agua_brota_sumidero'),
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
