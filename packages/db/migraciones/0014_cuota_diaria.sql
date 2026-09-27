-- Migración 0014 — cupo diario por cuenta: 3 reportes y 12 fotos por día calendario de la ciudad
-- (`cuota_reporte_diaria`). Parte 4. Contrato: packages/contracts 0.10.0.
--
-- EL CAMBIO (T3 del plan de producción, 2026-09-26)
--
-- Hasta el contrato 0.9.0 la cuota por cuenta era «un reporte cada 60 minutos» (columna
-- `usuario.ultimo_reporte_en`, migración 0009) y «12 fotos por hora» (contadas sobre
-- `reporte_foto.subido_por`, migración 0012). Desde el 0.10.0 es por DÍA CALENDARIO en la zona
-- horaria de la instalación (`ZONA_HORARIA`): `REPORTES_POR_DIA_POR_CUENTA` y
-- `FOTOS_POR_DIA_POR_CUENTA`. Contar fotos sobre `reporte_foto` ya no alcanza, porque el
-- mantenimiento borra las huérfanas a las 24 h y una cuenta recuperaría turnos borrando lo suyo.
--
-- Una fila por cuenta y por día con dos contadores. api-core reserva el turno en la misma
-- transacción que el reporte:
--
--   INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n) VALUES ($1, $2, 1)
--   ON CONFLICT (usuario_id, dia) DO UPDATE
--     SET reportes_n = cuota_reporte_diaria.reportes_n + 1, actualizado_en = now()
--     WHERE cuota_reporte_diaria.reportes_n < $max
--   RETURNING reportes_n;
--
-- Sin fila devuelta, el cupo del día está agotado (429). Es atómico por la clave primaria: dos
-- envíos simultáneos de la misma cuenta se serializan sobre la fila y no pueden gastar los dos el
-- último turno. El `n` devuelto también decide la demora de publicación de la 0015 (1 min el
-- primero del día, 4 los siguientes).
--
-- DECISIONES
--
-- · `dia` es la fecha LOCAL de la ciudad y la calcula quien escribe (api-core), no un DEFAULT: con
--   `current_date` en un servidor en UTC, en La Paz el día cambiaría a las 20:00.
-- · smallint con CHECK >= 0: los topes son constantes del contrato (3 y 12) y no se fijan aquí,
--   para que otra ciudad los cambie sin migrar. Negativo solo puede salir de un error al liberar
--   un turno (las fotos lo devuelven si el procesamiento falla), y se corta en la base.
-- · DEFAULT 0 en los dos contadores: la primera foto del día inserta solo `fotos_n` y el primer
--   reporte solo `reportes_n`.
-- · ON DELETE CASCADE: la cuota es estado efímero de la cuenta y no tiene valor sin ella. La clave
--   foránea queda cubierta por la clave primaria, que empieza por `usuario_id` (ver 0006).
-- · Índice por `dia`: el mantenimiento borra los días anteriores a hoy (`dia < hoy`) y no debe
--   recorrer la tabla para hacerlo.
-- · No toca `usuario.ultimo_reporte_en` ni la tabla de idempotencia: el api-core anterior sigue
--   usándolos mientras corre el job de migraciones (ampliar primero, contraer después). La
--   columna se quita en la 0016, en un despliegue posterior.
--
-- PRIVILEGIOS
--
-- `curichi_api`: SELECT, INSERT, UPDATE y DELETE (cuenta, reserva, libera y el mantenimiento borra
-- los días viejos). `curichi_geo`: nada. Se concede por tabla, igual que en la 0008, y la matriz de
-- `src/cli/matriz-privilegios.mjs` lo refleja (`pnpm privilegios` lo comprueba contra la base).
--
-- IDEMPOTENCIA Y BLOQUEO
--
-- Tabla e índice con IF NOT EXISTS y GRANT idempotente: aplicar el archivo dos veces a mano no
-- cambia nada. Es una tabla nueva: no bloquea ninguna tabla en uso.

CREATE TABLE IF NOT EXISTS cuota_reporte_diaria (
  usuario_id uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  dia date NOT NULL,
  reportes_n smallint NOT NULL DEFAULT 0 CONSTRAINT cuota_reportes_no_negativo CHECK (reportes_n >= 0),
  fotos_n smallint NOT NULL DEFAULT 0 CONSTRAINT cuota_fotos_no_negativo CHECK (fotos_n >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, dia)
);

CREATE INDEX IF NOT EXISTS cuota_reporte_diaria_dia ON cuota_reporte_diaria (dia);

COMMENT ON TABLE cuota_reporte_diaria IS
  'Cupo diario por cuenta (contrato 0.10.0): reportes y fotos del día calendario de la ciudad (ZONA_HORARIA). El mantenimiento borra los días anteriores.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
    RAISE NOTICE 'Sin rol curichi_api (base de un solo usuario): no se conceden privilegios.';
    RETURN;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON cuota_reporte_diaria TO curichi_api';
END
$$;
