-- Migración 0013 — cada reporte guarda a cuántos metros quedó el punto del teléfono que lo envió
-- (`reporte_inundacion.distancia_dispositivo_m`). Parte 4. Contrato: packages/contracts 0.9.0.
--
-- EL CAMBIO (T2 del plan de producción, 2026-09-26)
--
-- Desde el contrato 0.9.0, reportar exige la posición del dispositivo y api-core rechaza el reporte
-- si el punto marcado queda a más de 60 m (`REPORTE_RADIO_DISPOSITIVO_M`). De esa comprobación se
-- guarda SOLO la distancia, redondeada a metros, para que el técnico sepa cuánto se ajustó el
-- punto a mano. La posición del dispositivo no se guarda en ningún lado: es la ubicación de una
-- persona, no la del charco (§13).
--
-- DECISIONES
--
-- · smallint: la distancia es un entero de pocos metros y el CHECK la acota a 0–1000.
-- · CHECK de 0 a 1000, igual que `ReporteTecnicoSchema.distancia_dispositivo_m` en contracts: hoy
--   api-core no acepta más de 60,5 m, y el margen permite subir el radio por configuración sin otra
--   migración. Una distancia negativa o de kilómetros es un error del servidor y se corta aquí.
-- · NULL admitido y sin DEFAULT: los reportes anteriores no tienen el dato y no se inventa. El
--   api-core anterior, que sigue atendiendo mientras corre el job de migraciones, inserta sin
--   nombrar la columna y le queda NULL (ampliar primero, contraer después).
-- · Privilegios: `curichi_api` tiene SELECT, INSERT y UPDATE sobre `reporte_inundacion` a nivel de
--   TABLA (0008), que cubre la columna nueva; `curichi_geo` la puede leer pero no la expone. No
--   hace falta ningún GRANT ni cambia la matriz de `src/cli/verificar-privilegios.mjs`.
--
-- IDEMPOTENCIA
--
-- La columna y la restricción se agregan por separado y cada una comprueba el catálogo antes, así
-- que aplicar el archivo dos veces a mano, o sobre una base que ya tenía la columna sin el CHECK,
-- deja exactamente una restricción.
--
-- BLOQUEO
--
-- Agregar una columna NULL sin DEFAULT no reescribe la tabla. El CHECK sí la recorre una vez para
-- validarse, bajo el mismo bloqueo del ALTER; con todas las filas en NULL es una lectura
-- secuencial sin escrituras, y el runner le pone `lock_timeout` para no quedar en cola detrás del
-- tráfico.

ALTER TABLE reporte_inundacion
  ADD COLUMN IF NOT EXISTS distancia_dispositivo_m smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.reporte_inundacion'::regclass
       AND conname = 'distancia_dispositivo_rango'
  ) THEN
    ALTER TABLE reporte_inundacion
      ADD CONSTRAINT distancia_dispositivo_rango
      CHECK (distancia_dispositivo_m BETWEEN 0 AND 1000);
  END IF;
END
$$;

COMMENT ON COLUMN reporte_inundacion.distancia_dispositivo_m IS
  'Metros, redondeados, entre el punto reportado y la posición del dispositivo al enviar (contrato 0.9.0). La posición del dispositivo no se guarda. NULL en los reportes anteriores a la migración 0013.';
