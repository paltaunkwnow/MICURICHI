-- Migración 0007 — índice de cobertura para el agregado por unidad vecinal (Parte 4).
--
-- Qué consulta acelera. `GET /geo/v1/agregados/unidades-vecinales`, la que colorea las coropletas
-- del panel y alimenta los indicadores del mapa público. Agrupa TODOS los reportes publicables
-- por unidad vecinal, así que su coste crece con la tabla entera y no con lo que se pide.
--
-- Medido en la Fase 4 contra PostgreSQL 18, con caché fría y reportes repartidos por las UV:
--
--     10 000 reportes →   5,3 ms
--    100 000 reportes →  47,3 ms
--  1 000 000 reportes → 721,7 ms   ← 39 000 bloques leídos, yendo al montón fila a fila
--
-- Es decir, lineal: a diez millones serían unos siete segundos. La caché de treinta segundos de
-- geo-service reparte ese coste, pero no lo quita: una petición de cada treinta lo paga entero y
-- mantiene ocupada una conexión del pool todo ese rato.
--
-- Qué hace el índice. Es PARCIAL por el estado (solo se agregan `validado` y `resuelto`) y lleva
-- en `INCLUDE` las cuatro columnas que la consulta necesita además de la clave. Con eso el
-- planificador pasa de recorrer el índice y saltar al montón por cada fila, a un **index only
-- scan**: no toca la tabla.
--
--  1 000 000 reportes → 263,6 ms, 7 024 bloques  (de 721,7 ms y 38 687 bloques)
--
-- Cuesta unos 55 MB con un millón de reportes, y hace algo más lento cada INSERT y cada cambio de
-- estado; a cambio quita cinco sextos de la lectura de una consulta que se hace continuamente.
--
-- Lo que este índice NO arregla, y conviene tener escrito: sigue siendo O(número de reportes).
-- Lo que queda de coste es la ordenación en disco que exige `count(DISTINCT punto_critico_id)`
-- (se sale de `work_mem` y escribe unos 3 MB de temporales por grupo). Cuando la tabla se acerque
-- a los cinco millones, el camino es una vista materializada refrescada en segundo plano, no otro
-- índice. El umbral para replantearlo está en `docs/operaciones/produccion.md`.

CREATE INDEX IF NOT EXISTS reporte_agregado_uv
  ON reporte_inundacion (unidad_vecinal_id)
  INCLUDE (id, punto_critico_id, severidad_manual, severidad_calculada)
  WHERE estado IN ('validado', 'resuelto');
