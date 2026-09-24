-- Migración 0004 — claves de idempotencia para la creación de reportes (Parte 4).
--
-- Problema que resuelve: si el vecino envía el reporte y la respuesta se pierde (timeout, túnel,
-- 4G que se cae), al reintentar se creaba un reporte duplicado. El técnico luego tenía que
-- fusionarlos a mano. Con una clave por envío, el reintento devuelve el reporte ya creado.
--
-- `huella` es el sha256 del payload: si alguien reutiliza la misma clave con otro contenido,
-- se rechaza en vez de devolver silenciosamente un reporte que no corresponde.

CREATE TABLE IF NOT EXISTS idempotencia (
  clave text PRIMARY KEY,
  huella text NOT NULL,
  -- NULL mientras la transacción que la reclamó sigue en curso.
  reporte_id uuid REFERENCES reporte_inundacion (id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Lo usa el mantenimiento para borrar las claves ya caducadas.
CREATE INDEX IF NOT EXISTS idempotencia_creado ON idempotencia (creado_en);
