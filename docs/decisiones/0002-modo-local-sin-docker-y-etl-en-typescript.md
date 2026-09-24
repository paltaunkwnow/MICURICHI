# ADR 0002 — Modo local sin Docker y ETL en TypeScript

- **Estado:** aceptada
- **Fecha:** 2026-09-13 (registro formal escrito el 2026-09-14)
- **Decide:** Parte 5, con el visto bueno del usuario

## Contexto

`CLAUDE.md` §8 y §11 asumen Docker Desktop para PostGIS y MinIO, y GDAL + Python 3.12 +
GeoPandas + tippecanoe para el ETL (§6). La máquina de desarrollo **no tiene ninguna de esas
herramientas** y no hay permisos de administrador para instalarlas. Sin una alternativa, la
Fase 1 no se podía escribir ni probar.

Restricciones que había que respetar:

- El SQL debía ser el mismo que contra PostgreSQL real: `ST_Contains`, índices GIST,
  `ST_ClusterDBSCAN`, `geography` para distancias en metros.
- Migrar a Docker en la Fase 2 no podía exigir reescribir código de los servicios.
- `data/raw/` es inmutable y el pipeline debe seguir siendo reproducible con un comando (§6.10).

## Decisión

1. **PostGIS dentro de Node.** PGlite (PostgreSQL 18 compilado a WebAssembly) con la extensión
   oficial `@electric-sql/pglite-postgis`, expuesta por el protocolo de PostgreSQL con
   `@electric-sql/pglite-socket` en `127.0.0.1:5433`. `api-core` y `geo-service` se conectan con
   el driver `pg` normal y la misma `DATABASE_URL` que usarían contra Docker. Comando:
   `pnpm db:local`.
2. **ETL en TypeScript** con `mapshaper` (lectura de shapefile con su `.prj`, reproyección,
   limpieza topológica preservando bordes compartidos y simplificación) y `@turf/turf` para el
   reporte de calidad. Pruebas con Vitest en lugar de pytest.
3. **Teselas al vuelo** con `geojson-vt` + `vt-pbf` dentro de `geo-service`, en vez de PMTiles
   precompiladas con tippecanoe. Una capa pasa a teselas cuando su GeoJSON web supera 5 MB.
4. **Fotos en disco** (`infra/.storage/fotos`) tras un adaptador con interfaz de tipo S3.
5. **Contraseñas con `scrypt`** de Node, sin binarios nativos (Argon2id queda para la Fase 2).

## Consecuencias

**A favor**

- La Fase 1 corre completa en la máquina disponible: migraciones, seeds, servicios, apps y E2E.
- No hay cambio de código para pasar a Docker: basta apuntar `DATABASE_URL` al 5432 y usar el
  `docker-compose.yml` que ya está en el repositorio.
- Los comandos equivalentes de GDAL y tippecanoe quedan documentados en `CLAUDE.md` §6 como
  referencia para cuando existan.

**En contra / riesgos asumidos**

- `@electric-sql/pglite-postgis` está marcada como **experimental** por sus autores.
- PGlite multiplexa todas las conexiones sobre **un único backend**: no reproduce el
  comportamiento de varias conexiones concurrentes. Por eso los tests que dependen de eso
  (por ejemplo, que una transacción tome una conexión dedicada) se hacen con dobles y no
  contra la base local.
- `ST_ClusterDBSCAN` puede no estar en la build de PGlite; `recalcularPuntosCriticos` detecta
  el fallo y cae a un DBSCAN equivalente en Node (minpoints = 1 ⇒ componentes conexas).
- mapshaper no es GDAL: la reproyección y la reparación no son byte a byte idénticas. Las
  diferencias se miden en el `reporte_calidad.md` de cada capa.

## Revisión

Se revisa al empezar la Fase 2, cuando haya hosting y Docker disponibles.
