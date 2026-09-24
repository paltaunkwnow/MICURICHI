-- Migración 0002 — retención de datos (CLAUDE.md §13) e índices que faltaban (Parte 4).
--
-- 1) Índices de soporte del trabajo de mantenimiento: sin ellos cada pasada recorre la tabla
--    entera. Son parciales/selectivos, así que ocupan poco.
-- 2) Índice compuesto del listado público: la consulta filtra por estado y ordena por
--    creado_en DESC; con índices separados Postgres elige uno y ordena el resto en memoria.

CREATE INDEX IF NOT EXISTS sesion_expira ON sesion (expira_en);

-- Fotos subidas que nunca llegaron a asociarse a un reporte (el usuario abandonó el formulario).
CREATE INDEX IF NOT EXISTS reporte_foto_huerfanas
  ON reporte_foto (creado_en) WHERE reporte_id IS NULL;

-- Reportes que todavía conservan ip_hash: se borra a los N días (§13, propuesto 30).
CREATE INDEX IF NOT EXISTS reporte_con_ip_hash
  ON reporte_inundacion (creado_en) WHERE ip_hash IS NOT NULL;

-- Listado público: WHERE estado IN ('validado','resuelto') ORDER BY creado_en DESC.
CREATE INDEX IF NOT EXISTS reporte_estado_creado
  ON reporte_inundacion (estado, creado_en DESC);
