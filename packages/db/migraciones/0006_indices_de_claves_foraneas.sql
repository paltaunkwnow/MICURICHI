-- Migración 0006 — índices en las columnas que referencian con clave foránea (Parte 4).
--
-- Problema que resuelve. PostgreSQL crea un índice automáticamente en el lado REFERENCIADO de una
-- clave foránea (es la clave primaria), pero NO en el lado que referencia. Cuando se borra o se
-- cambia la clave de una fila padre, el motor tiene que comprobar que ninguna hija la apunta, y
-- sin índice esa comprobación es un escaneo secuencial COMPLETO de la tabla hija por cada fila
-- padre afectada.
--
-- Medido en la Fase 4 contra PostgreSQL 18 con un millón de reportes: un `DELETE` de reportes
-- llevaba **más de catorce minutos sin terminar** y hubo que cancelarlo. La culpable principal es
-- la clave foránea de `fusionado_en_id` sobre la propia tabla: borrar un reporte obligaba a
-- recorrer entera `reporte_inundacion` para ver si alguien lo tenía como canónico.
--
-- Dónde duele en la práctica, no en teoría:
--   · retención y borrado de reportes (CLAUDE.md §13);
--   · dar de baja a un técnico: `autor_id` y `validado_por` apuntan a `usuario`, así que borrar
--     un usuario recorría dos veces la tabla de reportes;
--   · limpieza de claves de idempotencia caducadas, que referencian al reporte creado.
--
-- Todos son PARCIALES (`WHERE ... IS NOT NULL`). La inmensa mayoría de las filas tienen estas
-- columnas en NULL —los reportes son anónimos, no están fusionados y no están validados— y un
-- índice parcial solo guarda las que no lo están: ocupa una fracción y se mantiene más barato en
-- cada INSERT. Para la comprobación de la clave foránea sirve igual, porque una fila con NULL
-- nunca referencia a nadie.

-- Autoreferencia: el reporte canónico de un duplicado (§7.1, `fusionado_en_id`).
CREATE INDEX IF NOT EXISTS reporte_fusionado_en
  ON reporte_inundacion (fusionado_en_id) WHERE fusionado_en_id IS NOT NULL;

-- Autoría: null en los reportes anónimos, que son la mayoría.
CREATE INDEX IF NOT EXISTS reporte_autor
  ON reporte_inundacion (autor_id) WHERE autor_id IS NOT NULL;

-- Quién validó: null mientras el reporte sigue en `nuevo`.
CREATE INDEX IF NOT EXISTS reporte_validado_por
  ON reporte_inundacion (validado_por) WHERE validado_por IS NOT NULL;

-- Clave de idempotencia → reporte creado. Null mientras el envío está en curso.
CREATE INDEX IF NOT EXISTS idempotencia_reporte
  ON idempotencia (reporte_id) WHERE reporte_id IS NOT NULL;
