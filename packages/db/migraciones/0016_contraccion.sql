-- Migración 0016 — contracción: se quitan `usuario.ultimo_reporte_en` y el DEFAULT de
-- `reporte_inundacion.publicar_en`. Parte 4. Sin cambio de contrato (packages/contracts 0.14.0).
--
-- EL CAMBIO (T8 del plan de producción, paso S38)
--
-- La 0014 y la 0015 solo agregaron («ampliar»), para que el api-core anterior siguiera atendiendo
-- mientras corría el job de migraciones. Esta es la «contracción», y va en un despliegue POSTERIOR
-- al de T3 y T4, cuando ya no queda ningún api-core anterior en pie:
--
-- 1) `usuario.ultimo_reporte_en` (0009) era la espera de 60 min entre reportes. Desde la 0014 el
--    cupo es diario y vive en `cuota_reporte_diaria`: el api-core actual no la lee ni la escribe.
--    Se revoca el UPDATE por columna que le dio la 0009 a `curichi_api` y se borra la columna.
-- 2) El DEFAULT now() de `publicar_en` (0015) existía solo para el INSERT del api-core anterior,
--    que no nombra la columna. El actual la fija siempre (now() + 60 o 240 s). Sin DEFAULT, un
--    INSERT que se olvide de la demora falla con NOT NULL (23502) en lugar de publicar el reporte
--    al instante. Quien inserte a mano (pruebas, seeds, restauraciones) tiene que fijarla.
--
-- ANTES DE APLICARLA
--
-- · Ningún api-core anterior a T3 y T4 atendiendo: el de antes de T3 escribe `ultimo_reporte_en`
--   al crear un reporte (fallaría con 42703) y el de antes de T4 inserta sin `publicar_en`
--   (fallaría con 23502).
-- · Los valores de `ultimo_reporte_en` se pierden. Eran la hora del último reporte de cada cuenta
--   y ya no se usan; para volver atrás hay que restaurar un respaldo anterior.
--
-- PRIVILEGIOS
--
-- `curichi_api` se queda con UPDATE (password_hash) e INSERT (email, nombre, password_hash) en
-- `usuario`. `src/cli/matriz-privilegios.mjs` lo refleja y `pnpm privilegios` lo comprueba contra
-- la base. El REVOKE va antes del DROP a propósito: el DROP también se llevaría el privilegio, pero
-- así la migración dice qué quita aunque la columna se hubiera borrado antes a mano.
--
-- IDEMPOTENCIA Y BLOQUEO
--
-- REVOKE solo si existen el rol y la columna, DROP COLUMN IF EXISTS y DROP DEFAULT (que no falla
-- si no hay DEFAULT): aplicar el archivo dos veces a mano no cambia nada. Ninguna de las tres
-- reescribe la tabla, solo el catálogo, pero toman ACCESS EXCLUSIVE sobre `usuario` y
-- `reporte_inundacion` y esperan a que terminen las transacciones en curso (el runner pone
-- `lock_timeout`).

-- 1) usuario.ultimo_reporte_en: revocar y borrar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api')
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usuario'
          AND column_name = 'ultimo_reporte_en'
     ) THEN
    EXECUTE 'REVOKE UPDATE (ultimo_reporte_en) ON usuario FROM curichi_api';
  END IF;
END
$$;

ALTER TABLE usuario DROP COLUMN IF EXISTS ultimo_reporte_en;

-- 2) publicar_en: sin DEFAULT. Sigue NOT NULL y con el CHECK `publicar_en_rango` de la 0015.
ALTER TABLE reporte_inundacion ALTER COLUMN publicar_en DROP DEFAULT;
