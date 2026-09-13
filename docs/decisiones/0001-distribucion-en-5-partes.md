# ADR 0001 — Distribución del trabajo en 5 partes

- **Estado:** aceptada
- **Fecha:** 2026-09-13
- **Decide:** el usuario, dueño del proyecto

## Contexto

La primera versión del manual dividía el proyecto por servicio: dos frontends y tres backends (`web-ciudadano`, `panel-admin`, `api-core`, `geo-service`, `geodata-etl`). Con esa división, el esquema de base de datos quedaba dentro de `api-core`, y la infraestructura, la seguridad y la calidad no tenían dueño explícito.

## Decisión

El trabajo se organiza en **cinco partes por responsabilidad**, cada una con carpetas designadas:

1. Frontend público / experiencia ciudadana → `apps/web-ciudadano/`
2. Frontend administrativo / plataforma técnica → `apps/panel-admin/`
3. Backend / API y lógica de negocio → `services/api-core/`, custodia de `packages/contracts/`
4. Datos / base de datos y arquitectura geoespacial → `packages/db/`, `services/geo-service/`
5. GIS / DevOps / seguridad / infraestructura / calidad → `pipelines/geodata-etl/`, `infra/`, `e2e/`, `.github/`, `data/`, configuración raíz

`packages/contracts/` es transversal: cualquier parte propone cambios anunciándolos; la Parte 3 los revisa.

## Consecuencias

- Se crea `packages/db` (Parte 4) como único lugar del esquema Drizzle y las migraciones; `api-core` y `geo-service` consumen su cliente y no crean tablas.
- `infra/sql/` queda limitado a extensiones y roles del contenedor; todo lo demás entra por migración.
- Se crea `e2e/` (Parte 5) para las pruebas que cruzan partes.
- La Parte 5 define y audita la política de seguridad; cada parte la implementa en su código.
- Toda tarea, rama y PR se etiqueta con su parte (`[P3 api-core] ...`).
