# ADR 0005 — La base local pasa a PostgreSQL en Docker

- **Estado:** aceptada. Complementa el ADR 0002 y el 0003: PGlite queda como alternativa sin Docker.
- **Fecha:** 2026-09-26
- **Decide:** el usuario, a partir de la revisión para producción

## Contexto

El ADR 0002 eligió PGlite (PostgreSQL en WebAssembly) porque la máquina de desarrollo no tenía
Docker. El ADR 0003 lo dejó solo para desarrollo y pruebas. En la práctica, en Windows la base
PGlite se rompía después de horas de uso o de suspender la máquina («could not seek to end of
file … Invalid argument») y arrastraba a toda la pila local; pasó dos veces durante la revisión.
Además, PGlite es de una sola conexión: no sirve para probar concurrencia, locks ni privilegios de
roles, que es justamente lo que más importa antes de producción.

## Decisión

- Se instaló Docker Desktop en la máquina de desarrollo y la base local es el contenedor
  `curichi-postgis` (`postgis/postgis:18-3.6`, la misma versión que producción), levantado con
  `docker compose up -d postgis`.
- Cada servicio usa su rol de mínimo privilegio también en local: api-core con `API_DATABASE_URL`
  (`curichi_api`) y geo-service con `GEO_DATABASE_URL` (`curichi_geo`). Migraciones, ETL y seeds van
  con el rol dueño (`DATABASE_URL`). Los servicios cargan el `.env` raíz al arrancar en desarrollo.
- PGlite (`pnpm db:local`) se conserva como alternativa sin Docker y para las bases efímeras de
  las pruebas, con su límite documentado.

## Consecuencias

- Lo que se prueba en local es lo mismo que corre en producción: migraciones desde cero,
  privilegios (`pnpm privilegios`), bloqueos y concurrencia.
- La primera verificación ya se hizo: instalación limpia con roles, migraciones 0001–0012, capas
  reales y datos de ejemplo, y `pnpm privilegios` en verde.
- En esta máquina Docker Desktop no puede montar carpetas de la unidad A: en contenedores nuevos:
  las configuraciones de contenedores van horneadas en sus imágenes.
