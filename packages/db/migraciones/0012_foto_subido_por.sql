-- Migración 0012 — cada foto guarda la cuenta que la subió (`reporte_foto.subido_por`). Parte 4.
--
-- EL PROBLEMA (revisión de producción, 2026-09-26)
--
-- `POST /api/v1/fotos` exige sesión desde la 0009, pero la fila de la foto no anotaba de quién era.
-- La foto se sube ANTES de que exista el reporte y queda como un vale (`objeto_key`) que el reporte
-- reclama después, así que:
--   · cualquiera que conociera un `objeto_key` recién subido por otra cuenta podía reclamarlo para
--     su propio reporte;
--   · no había forma de acotar cuántas fotos sube una cuenta, solo cuántas sube una IP.
--
-- `subido_por` es la cuenta que subió la foto, para que api-core la escriba al subirla, exija que
-- coincida con la sesión al asociarla y pueda contar por cuenta en una ventana de tiempo.
--
-- DECISIONES
--
-- · NULL admitido: las fotos anteriores a esta migración no tienen autor conocido y no se inventa.
-- · ON DELETE SET NULL, igual que `reporte_inundacion.autor_id`: borrar una cuenta no puede quedar
--   bloqueado por sus fotos ni llevárselas por delante si ya ilustran un reporte. Una foto sin
--   reporte y sin autor la retira el mantenimiento a las 24 h, como cualquier huérfana.
-- · Índice (subido_por, creado_en): sirve a la vez para la cuota por cuenta («cuántas fotos subió
--   en la última hora») y para la comprobación de la clave foránea al borrar una cuenta, que sin
--   índice recorre la tabla entera (ver 0006).
-- · Privilegios: `curichi_api` tiene SELECT, INSERT, UPDATE y DELETE sobre `reporte_foto` a nivel
--   de TABLA (0008), que cubre también las columnas nuevas, y `curichi_geo` no tiene nada sobre
--   esta tabla. No hace falta ningún GRANT por columna ni cambia la matriz de
--   `src/cli/verificar-privilegios.mjs`. La comprobación de la clave foránea la hace PostgreSQL con
--   los permisos del dueño de `usuario`, no con los de quien inserta.
--
-- `reporte_foto` es pequeña (a lo sumo tres fotos por reporte) y la columna nueva nace en NULL, así
-- que ni el ALTER ni el índice reescriben nada grande; el runner les pone `lock_timeout`.

ALTER TABLE reporte_foto
  ADD COLUMN IF NOT EXISTS subido_por uuid REFERENCES usuario (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reporte_foto_subido_por
  ON reporte_foto (subido_por, creado_en);

COMMENT ON COLUMN reporte_foto.subido_por IS
  'Cuenta que subió la foto. NULL en las fotos anteriores a la migración 0012 o si la cuenta se borró.';
