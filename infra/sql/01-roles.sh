#!/bin/bash
# Roles de aplicación de Mi Curichi (CLAUDE.md §5.1: en infra/sql van SOLO extensiones y roles;
# los permisos concretos los concede una migración de packages/db, que es quien conoce el esquema).
#
# POR QUÉ EXISTE ESTE ARCHIVO
#
# Hasta la auditoría de seguridad los dos servicios se conectaban con el MISMO rol `curichi`, que
# además era SUPERUSER con CREATEROLE, CREATEDB y BYPASSRLS. Eso significa que cualquier fallo que
# llegara a ejecutar SQL —una inyección futura, una dependencia comprometida, una credencial
# filtrada— no se quedaba en "leer una tabla": era control del servidor de base de datos, con
# COPY ... PROGRAM para ejecutar órdenes del sistema operativo incluido. Y geo-service, que por
# contrato (§4.6) es de SOLO LECTURA, podía borrar reportes.
#
# Ahora hay tres roles con tres trabajos distintos:
#
#   curichi       dueño del esquema. Crea tablas, índices y vistas. Lo usan las migraciones, los
#                 seeds y el ETL. NO lo usa ningún servicio para atender peticiones.
#   curichi_api   runtime de api-core. Solo DML, y solo sobre las tablas que necesita.
#   curichi_geo   runtime de geo-service. SELECT y nada más, sobre las tablas que lee.
#
# Se ejecuta UNA vez, al crear el volumen de datos (docker-entrypoint-initdb.d), como superusuario.
# Es un .sh y no un .sql porque las contraseñas llegan por variable de entorno: escribirlas en un
# archivo del repositorio sería exactamente lo que prohíbe CLAUDE.md §13.
#
# Para una base YA creada (el volumen no se vuelve a inicializar), el procedimiento manual
# equivalente está en docs/operaciones/manual.md.
set -euo pipefail

: "${POSTGRES_USER:=curichi}"
: "${POSTGRES_DB:=curichi}"

if [ -z "${API_DB_PASSWORD:-}" ] || [ -z "${GEO_DB_PASSWORD:-}" ]; then
  echo "ERROR: definí API_DB_PASSWORD y GEO_DB_PASSWORD en el .env antes de crear el volumen." >&2
  echo "       Son las contraseñas de los roles de aplicación con privilegios mínimos." >&2
  exit 1
fi

# `psql -v ON_ERROR_STOP=1`: si algo falla, el contenedor no debe quedarse a medio inicializar
# fingiendo que está listo.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v api_pass="$API_DB_PASSWORD" -v geo_pass="$GEO_DB_PASSWORD" <<-'EOSQL'
	-- NOLOGIN/NOSUPERUSER es lo que da CREATE ROLE por defecto, pero se escribe explícito: este
	-- archivo es el sitio donde alguien va a mirar para responder "¿qué puede hacer este rol?".
	DO $$
	BEGIN
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
	    CREATE ROLE curichi_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
	  END IF;
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_geo') THEN
	    CREATE ROLE curichi_geo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
	  END IF;
	END
	$$;

	ALTER ROLE curichi_api WITH PASSWORD :'api_pass';
	ALTER ROLE curichi_geo WITH PASSWORD :'geo_pass';

	-- search_path fijo. Sin esto, un objeto creado en un esquema que estuviera antes en la ruta de
	-- búsqueda podría suplantar a una tabla o a una función del sistema. Los dos roles solo
	-- necesitan ver `public` y `geo`.
	ALTER ROLE curichi_api SET search_path = public, geo;
	ALTER ROLE curichi_geo SET search_path = public, geo;

	-- Poder entrar al esquema no es poder leer nada: los permisos por tabla los da la migración
	-- 0008 de packages/db, que es la que sabe qué tablas hay y para qué sirve cada una. Aquí solo
	-- `public`, que ya existe; el esquema `geo` lo crea la migración 0001 y por tanto su USAGE se
	-- concede allí, no aquí.
	GRANT USAGE ON SCHEMA public TO curichi_api, curichi_geo;

	-- Nadie más que el dueño crea objetos. En PostgreSQL 15+ ya es el valor por defecto para
	-- `public`; se repite por si la base viene de una versión anterior o de un restore.
	REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EOSQL

echo "roles de aplicación listos: curichi_api (DML acotado), curichi_geo (solo lectura)"
