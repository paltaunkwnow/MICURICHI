-- Migración 0011 — «tirante» pasa a «profundidad», el sumidero se reduce a dos respuestas y
-- aparece el rol `ejecutivo`. Parte 4. Contrato: packages/contracts 0.5.0.
--
-- QUÉ CAMBIA EN EL PRODUCTO
--
-- 1. `reporte_inundacion.tirante_estimado` → `profundidad_estimada`, y su tipo enum
--    `tirante_estimado` → `profundidad_estimada`. Mismos valores (tobillo, rodilla, muslo, mas_70)
--    y misma severidad: los puntos son los mismos, así que `severidad_*` NO se recalcula.
--
-- 2. `sumidero_cercano`: de ('si','no','no_sabe') a ('si','no'). «No sé» pasa a ser NULL, que ya
--    era «no contestó»: para el análisis de causas (§9.3) las dos cosas dicen lo mismo, que no
--    hay observación.
--
-- 3. `sumidero_estado`: de ('libre','obstruido','danado','no_sabe') a ('tapado','no_tapado').
--      libre     → no_tapado
--      obstruido → tapado
--      danado    → tapado      (una rejilla rota que no capta agua se comporta como tapada; la
--                               pregunta nueva es «¿está tapado?», no «¿en qué estado está?»)
--      no_sabe   → NULL
--
-- 4. `rol` gana `ejecutivo` (después de `tecnico`): ve el resumen ejecutivo, no modera. El alta
--    pública sigue creando solo `ciudadano`: los privilegios por columna de la 0009 no cambian.
--
-- POR QUÉ SE RECREAN LOS TIPOS DEL SUMIDERO
--
-- PostgreSQL no permite quitar valores de un enum. La única forma es un tipo nuevo, mover la
-- columna con `ALTER COLUMN … TYPE … USING` (el USING hace el mapeo de arriba en la misma
-- reescritura) y borrar el viejo. Ninguna vista, función ni índice nombra estas columnas (revisado
-- en 0001–0010), así que el cambio de tipo no arrastra nada más. Los privilegios por columna, si
-- los hubiera, se conservan con la columna.
--
-- IDEMPOTENCIA
--
-- El runner ya impide reaplicar (tabla _migraciones), pero cada paso comprueba el catálogo antes
-- de actuar: aplicar este archivo dos veces a mano no rompe ni vuelve a mapear nada.
--
-- TRANSACCIÓN
--
-- El runner ejecuta cada migración dentro de BEGIN … COMMIT con un advisory lock. Desde
-- PostgreSQL 12, `ALTER TYPE … ADD VALUE` se admite dentro de una transacción; la única
-- restricción es no USAR el valor nuevo antes del COMMIT, y aquí no se usa.

-- 1. Profundidad ------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'
       AND column_name = 'tirante_estimado'
  ) THEN
    ALTER TABLE reporte_inundacion RENAME COLUMN tirante_estimado TO profundidad_estimada;
  END IF;

  IF to_regtype('public.tirante_estimado') IS NOT NULL
     AND to_regtype('public.profundidad_estimada') IS NULL THEN
    ALTER TYPE tirante_estimado RENAME TO profundidad_estimada;
  END IF;
END
$$;

-- 2. ¿Hay sumidero cercano? -------------------------------------------------------------------

DO $$
BEGIN
  -- Solo si el tipo todavía tiene el valor viejo: si no, ya está migrado.
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'sumidero_cercano' AND e.enumlabel = 'no_sabe'
  ) THEN
    DROP TYPE IF EXISTS sumidero_cercano_v2;
    CREATE TYPE sumidero_cercano_v2 AS ENUM ('si', 'no');
    -- si → si, no → no, no_sabe → NULL.
    ALTER TABLE reporte_inundacion
      ALTER COLUMN sumidero_cercano TYPE sumidero_cercano_v2
      USING (
        CASE sumidero_cercano::text
          WHEN 'si' THEN 'si'
          WHEN 'no' THEN 'no'
          ELSE NULL
        END
      )::sumidero_cercano_v2;
    -- Sin CASCADE: si algo más usara el tipo viejo, la migración debe fallar y avisarlo.
    DROP TYPE sumidero_cercano;
    ALTER TYPE sumidero_cercano_v2 RENAME TO sumidero_cercano;
  END IF;
END
$$;

-- 3. ¿Está tapado el sumidero? ----------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'sumidero_estado' AND e.enumlabel = 'libre'
  ) THEN
    DROP TYPE IF EXISTS sumidero_estado_v2;
    CREATE TYPE sumidero_estado_v2 AS ENUM ('tapado', 'no_tapado');
    -- libre → no_tapado; obstruido y danado → tapado; no_sabe → NULL.
    ALTER TABLE reporte_inundacion
      ALTER COLUMN sumidero_estado TYPE sumidero_estado_v2
      USING (
        CASE sumidero_estado::text
          WHEN 'libre' THEN 'no_tapado'
          WHEN 'obstruido' THEN 'tapado'
          WHEN 'danado' THEN 'tapado'
          ELSE NULL
        END
      )::sumidero_estado_v2;
    DROP TYPE sumidero_estado;
    ALTER TYPE sumidero_estado_v2 RENAME TO sumidero_estado;
  END IF;
END
$$;

-- 4. Rol ejecutivo ----------------------------------------------------------------------------

ALTER TYPE rol ADD VALUE IF NOT EXISTS 'ejecutivo' AFTER 'tecnico';
