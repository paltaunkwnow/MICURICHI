-- Migración 0001 — esquema inicial de Mi Curichi (CLAUDE.md §7). Parte 4.
-- Se aplica sobre PostGIS (Docker) o PGlite + postgis (modo local). Idempotente por el runner (_migraciones).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

-- Enums del dominio (espejo de packages/contracts)
CREATE TYPE tirante_estimado AS ENUM ('tobillo', 'rodilla', 'muslo', 'mas_70');
CREATE TYPE duracion_estimada AS ENUM ('menos_30min', '30min_2h', '2h_12h', 'mas_12h');
CREATE TYPE frecuencia AS ENUM ('primera_vez', 'ocasional', 'cada_lluvia_fuerte', 'permanente');
CREATE TYPE afectacion AS ENUM ('peatonal', 'vehicular', 'ingreso_viviendas', 'corte_total_via');
CREATE TYPE causa_presunta AS ENUM ('sumidero_tapado', 'falta_sumidero', 'hundimiento_pavimento', 'contrapendiente', 'colector_saturado', 'desborde_cauce', 'desconocida');
CREATE TYPE severidad AS ENUM ('baja', 'media', 'alta', 'critica');
CREATE TYPE estado_reporte AS ENUM ('nuevo', 'validado', 'duplicado', 'rechazado', 'resuelto');
CREATE TYPE rol AS ENUM ('ciudadano', 'tecnico', 'admin');
CREATE TYPE ubicacion_metodo AS ENUM ('gps', 'manual');
CREATE TYPE ubicacion_tipo AS ENUM ('via_publica', 'vivienda_o_predio', 'otro');
CREATE TYPE sumidero_cercano AS ENUM ('si', 'no', 'no_sabe');
CREATE TYPE sumidero_estado AS ENUM ('libre', 'obstruido', 'danado', 'no_sabe');

-- ---------- Capas administrativas (escribe el ETL, Parte 5; define Parte 4)
CREATE TABLE geo.capa_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa text NOT NULL CHECK (capa IN ('distrito_municipal', 'unidad_vecinal', 'manzana')),
  version text NOT NULL,
  fuente text,
  fecha_vigencia date,
  crs_origen text,
  sha256_manifiesto text,
  n_features integer NOT NULL DEFAULT 0,
  cargado_en timestamptz NOT NULL DEFAULT now(),
  vigente boolean NOT NULL DEFAULT false,
  activado_por uuid,
  activado_en timestamptz,
  UNIQUE (capa, version)
);
CREATE UNIQUE INDEX capa_version_una_vigente ON geo.capa_version (capa) WHERE vigente;

CREATE TABLE geo.distrito_municipal (
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  version_capa text NOT NULL,
  fuente text,
  fecha_vigencia date,
  PRIMARY KEY (id, version_capa)
);
CREATE INDEX distrito_municipal_geom_gist ON geo.distrito_municipal USING GIST (geom);
CREATE INDEX distrito_municipal_version ON geo.distrito_municipal (version_capa);

CREATE TABLE geo.unidad_vecinal (
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  version_capa text NOT NULL,
  fuente text,
  fecha_vigencia date,
  distrito_id text NOT NULL,
  distrito_inferido boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id, version_capa)
);
CREATE INDEX unidad_vecinal_geom_gist ON geo.unidad_vecinal USING GIST (geom);
CREATE INDEX unidad_vecinal_version ON geo.unidad_vecinal (version_capa);
CREATE INDEX unidad_vecinal_distrito ON geo.unidad_vecinal (distrito_id);

CREATE TABLE geo.manzana (
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  geom geometry(MultiPolygon, 4326) NOT NULL,
  version_capa text NOT NULL,
  fuente text,
  fecha_vigencia date,
  distrito_id text,
  unidad_vecinal_id text,
  PRIMARY KEY (id, version_capa)
);
CREATE INDEX manzana_geom_gist ON geo.manzana USING GIST (geom);
CREATE INDEX manzana_version ON geo.manzana (version_capa);

CREATE VIEW geo.distrito_municipal_vigente AS
  SELECT d.* FROM geo.distrito_municipal d
  JOIN geo.capa_version v ON v.capa = 'distrito_municipal' AND v.version = d.version_capa AND v.vigente;
CREATE VIEW geo.unidad_vecinal_vigente AS
  SELECT u.* FROM geo.unidad_vecinal u
  JOIN geo.capa_version v ON v.capa = 'unidad_vecinal' AND v.version = u.version_capa AND v.vigente;
CREATE VIEW geo.manzana_vigente AS
  SELECT m.* FROM geo.manzana m
  JOIN geo.capa_version v ON v.capa = 'manzana' AND v.version = m.version_capa AND v.vigente;

-- ---------- Usuarios y sesiones (api-core, Parte 3)
CREATE TABLE usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nombre text NOT NULL,
  rol rol NOT NULL DEFAULT 'ciudadano',
  password_hash text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_email_unico ON usuario (lower(email));

CREATE TABLE sesion (
  id text PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL
);
CREATE INDEX sesion_usuario ON sesion (usuario_id);

-- ---------- Puntos críticos (§9.2). Se recalculan; nunca se editan a mano.
CREATE TABLE punto_critico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geom geometry(Point, 4326) NOT NULL,
  n_reportes integer NOT NULL,
  primer_reporte_en timestamptz NOT NULL,
  ultimo_reporte_en timestamptz NOT NULL,
  severidad_max severidad NOT NULL,
  distrito_id text,
  unidad_vecinal_id text,
  radio_m numeric NOT NULL,
  diametro_m numeric NOT NULL DEFAULT 0,
  advertencia_diametro boolean NOT NULL DEFAULT false,
  calculado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX punto_critico_geom_gist ON punto_critico USING GIST (geom);

-- ---------- Reportes (§7.1)
CREATE TABLE reporte_inundacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geom geometry(Point, 4326) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  evento_en timestamptz,
  autor_id uuid REFERENCES usuario (id) ON DELETE SET NULL,
  distrito_id text NOT NULL,
  unidad_vecinal_id text NOT NULL,
  manzana_id text,
  version_capa text,
  resolucion_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ubicacion_metodo ubicacion_metodo NOT NULL,
  precision_gps_m numeric,
  ubicacion_tipo ubicacion_tipo NOT NULL,
  direccion_aprox text,
  descripcion text NOT NULL,
  tirante_estimado tirante_estimado NOT NULL,
  duracion_estimada duracion_estimada NOT NULL,
  frecuencia frecuencia NOT NULL,
  afectacion afectacion NOT NULL,
  causa_presunta causa_presunta NOT NULL DEFAULT 'desconocida',
  sumidero_cercano sumidero_cercano,
  sumidero_estado sumidero_estado,
  agua_brota_sumidero boolean,
  severidad_calculada severidad NOT NULL,
  severidad_puntaje integer NOT NULL,
  severidad_version integer NOT NULL DEFAULT 1,
  severidad_manual severidad,
  severidad_motivo text,
  estado estado_reporte NOT NULL DEFAULT 'nuevo',
  estado_motivo text,
  fusionado_en_id uuid REFERENCES reporte_inundacion (id) ON DELETE SET NULL,
  punto_critico_id uuid REFERENCES punto_critico (id) ON DELETE SET NULL,
  validado_por uuid REFERENCES usuario (id) ON DELETE SET NULL,
  validado_en timestamptz,
  ip_hash text,
  CONSTRAINT descripcion_longitud CHECK (char_length(descripcion) BETWEEN 10 AND 1000),
  CONSTRAINT severidad_manual_con_motivo CHECK (severidad_manual IS NULL OR severidad_motivo IS NOT NULL)
);
CREATE INDEX reporte_geom_gist ON reporte_inundacion USING GIST (geom);
CREATE INDEX reporte_estado ON reporte_inundacion (estado);
CREATE INDEX reporte_uv ON reporte_inundacion (unidad_vecinal_id);
CREATE INDEX reporte_distrito ON reporte_inundacion (distrito_id);
CREATE INDEX reporte_creado ON reporte_inundacion (creado_en DESC);
CREATE INDEX reporte_punto_critico ON reporte_inundacion (punto_critico_id);

CREATE TABLE reporte_foto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid REFERENCES reporte_inundacion (id) ON DELETE CASCADE,
  objeto_key text NOT NULL UNIQUE,
  mime text NOT NULL,
  bytes integer NOT NULL,
  ancho integer NOT NULL,
  alto integer NOT NULL,
  exif_sanitizado boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reporte_foto_reporte ON reporte_foto (reporte_id);

-- ---------- Auditoría (§13)
CREATE TABLE auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad text NOT NULL,
  entidad_id text NOT NULL,
  accion text NOT NULL,
  actor_id uuid,
  antes jsonb,
  despues jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_entidad ON auditoria (entidad, entidad_id);
