-- Migración 0021 — índice parcial `(categoria, creado_en DESC)` para el listado por categoría. Parte 4.
-- Sin cambio de contrato HTTP: el OpenAPI no cambia. Roadmap M3 de docs/arquitectura/14 §5.
--
-- POR QUÉ (medición M2.3, docs/sdd/2026-10-08-base-multicategoria/medicion.md §4–§6)
--
-- El listado público ordena por `creado_en DESC LIMIT 50` y ahora filtra además por `categoria`.
-- Con un bbox de «barrio» (unos miles de coincidencias repartidas en el tiempo) el planificador
-- abandona el GIST y recorre `reporte_creado` (btree por fecha) filtrando bbox+categoría en el heap:
-- 16 978 bloques, ~18,8 ms. El único índice que arregla ese caso es el btree PARCIAL
-- `(categoria, creado_en DESC) WHERE estado IN (públicos)`: restringe el recorrido por fecha a UNA
-- categoría (Index Cond: categoria = …), bajando el barrio a ~2,9 ms / 3 818 bloques y volviendo
-- trivial la primera página por categoría (0,09 ms). Se crea JUNTO al GIST, no en su lugar: la
-- combinación medida confirma que el planificador sigue usando el GIST en los bbox selectivos
-- (chico, 0,12 ms) y este btree en barrio, ciudad y primera página.
--
-- · El predicado es un LITERAL con la MISMA forma que los índices parciales de la 0015
--   (`estado IN ('nuevo', 'validado', 'resuelto')`), que es la que arman `visibilidad.ts` de api-core
--   y `SQL_AGREGADOS_UV` de geo-service con ESTADOS_PUBLICOS. Con `estado = ANY($n)` y plan genérico
--   PostgreSQL no puede demostrar que la condición implica el predicado y no usa el índice.
-- · `now()` no puede ir en el predicado de un índice: la demora de publicación (`publicar_en <= now()`)
--   se resuelve con un filtro sobre el heap, igual que en la 0015.
--
-- IDEMPOTENCIA Y BLOQUEO
--
-- `CREATE INDEX IF NOT EXISTS` no reconstruye el índice si ya existe, así que volver a ejecutar el
-- archivo a mano no falla ni cambia nada; el runner, además, no lo reaplica (_migraciones). El
-- CREATE INDEX toma un SHARE lock sobre `reporte` mientras construye (no concurrente, dentro de la
-- transacción del runner): lecturas sí, escrituras esperan. Con pocas decenas de miles de reportes
-- son milisegundos; a 1 M, ~1,1 s (medido en M2.3). El runner pone `statement_timeout = 0` y
-- `lock_timeout` para no quedar en cola detrás del tráfico.

CREATE INDEX IF NOT EXISTS reporte_categoria_creado
  ON reporte (categoria, creado_en DESC)
  WHERE estado IN ('nuevo', 'validado', 'resuelto');

COMMENT ON INDEX reporte_categoria_creado IS
  'Listado público/técnico por categoría ordenado por creado_en DESC (medición M2.3, opción (d)). Parcial sobre los tres estados públicos, junto al GIST reporte_geom_publico_gist. El predicado es un literal, como los de la 0015.';
