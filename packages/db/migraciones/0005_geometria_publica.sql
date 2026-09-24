-- Migración 0005 — geometría publicable separada de la exacta (CLAUDE.md §0.8 y §13). Parte 4.
--
-- Problema que resuelve. La ubicación de un reporte es dato sensible y la vista pública desplaza
-- los de vivienda o predio con un jitter determinista. Eso solo protege si TODO lo observable
-- desde fuera depende únicamente del punto ya desplazado, y no era el caso:
--
--   1. `GET /api/v1/reportes?bbox=` filtraba por `geom` (exacta) y devolvía la desplazada.
--      Encogiendo el bbox y mirando si el reporte sigue apareciendo, unas cuarenta peticiones
--      bastan para recuperar la coordenada real con precisión de centímetros.
--   2. `punto_critico.geom` es el centroide del grupo y se publica sin degradar. Como DBSCAN
--      corre con minpoints = 1, un reporte sin vecinos forma su propio grupo y ese centroide ES
--      su coordenada exacta.
--
-- Solución: el punto publicable se calcula una sola vez y se guarda. Filtro y respuesta salen
-- del mismo sitio, así que ya no hay nada que comparar.
--
-- El relleno va en dos tiempos a propósito. El jitter necesita `JITTER_SAL`, que es un secreto
-- del servidor y no puede estar en la base, así que aquí solo se rellena lo que no lo necesita
-- (vía pública y otros: basta el redondeo). Los de vivienda quedan en NULL y los completa
-- api-core al arrancar. Quedar en NULL es la opción segura: un reporte sin `geom_publico` no
-- aparece en las consultas públicas por bbox en lugar de aparecer con su coordenada real.

ALTER TABLE reporte_inundacion ADD COLUMN IF NOT EXISTS geom_publico geometry(Point, 4326);
ALTER TABLE punto_critico ADD COLUMN IF NOT EXISTS geom_publico geometry(Point, 4326);

-- Vía pública y "otro" no llevan jitter: el punto publicable es la coordenada redondeada.
UPDATE reporte_inundacion
   SET geom_publico = ST_SetSRID(
         ST_MakePoint(round(ST_X(geom)::numeric, 5)::float8, round(ST_Y(geom)::numeric, 5)::float8),
         4326)
 WHERE geom_publico IS NULL AND ubicacion_tipo <> 'vivienda_o_predio';

-- El listado público filtra por bbox sobre la geometría publicable y solo ve dos estados.
CREATE INDEX IF NOT EXISTS reporte_geom_publico_gist
  ON reporte_inundacion USING GIST (geom_publico)
  WHERE estado IN ('validado', 'resuelto');

CREATE INDEX IF NOT EXISTS punto_critico_geom_publico_gist
  ON punto_critico USING GIST (geom_publico);

-- Para que el relleno pendiente se encuentre sin recorrer la tabla entera en cada arranque.
CREATE INDEX IF NOT EXISTS reporte_sin_geom_publico
  ON reporte_inundacion (creado_en) WHERE geom_publico IS NULL;
