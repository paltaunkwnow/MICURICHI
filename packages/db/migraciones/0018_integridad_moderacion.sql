-- Migración 0018 — integridad de moderación en la base (CLAUDE.md §7.1 y §7.3). Parte 4.
-- Sin cambio de contrato: solo graba en el esquema reglas que api-core ya imponía.
--
-- EL CAMBIO
--
-- Hasta aquí la única regla de moderación que la base garantizaba era `severidad_manual_con_motivo`
-- (0001). El motivo obligatorio de un rechazo o una fusión, y que `fusionado_en_id` solo aparezca
-- en un duplicado, los imponía api-core (ReporteCambiarEstadoSchema y ReporteFusionarSchema exigen
-- motivo; `cambiarEstado` solo pasa `fusionado_en_id` cuando el nuevo estado es `duplicado`). Un
-- error de código o una escritura a mano podían dejar un `rechazado`/`duplicado` sin porqué o un
-- canónico colgando de un reporte que no es duplicado. Se agregan dos CHECK que lo cierran:
--
--   1) motivo_en_rechazo_y_duplicado: `rechazado` y `duplicado` exigen `estado_motivo` no vacío.
--   2) fusion_solo_en_duplicado:      `fusionado_en_id` solo puede estar puesto en un `duplicado`.
--
-- NO se agrega «duplicado ⇒ `fusionado_en_id` no nulo». La FK `fusionado_en_id` es
-- `ON DELETE SET NULL` (0001): al borrar un reporte canónico, sus duplicados quedan con
-- `fusionado_en_id = NULL` pero siguen en estado `duplicado`. Esa regla haría que borrar un
-- canónico violara el CHECK y la base rechazara el DELETE. Un duplicado con el canónico ya borrado
-- es un estado legítimo, así que la regla se queda fuera a propósito.
--
-- NOT VALID Y VALIDACIÓN CONDICIONAL
--
-- Los dos CHECK se crean `NOT VALID`: así no recorren la tabla al agregarse (toman un lock breve en
-- vez de ACCESS EXCLUSIVE largo) pero YA frenan toda escritura nueva. Después, en esta misma
-- migración, se cuentan las filas que cada uno violaría:
--   · si ninguna, se corre `VALIDATE CONSTRAINT` y la restricción queda validada (convalidated);
--   · si hay alguna, se emite un `RAISE NOTICE` con el conteo y la restricción queda SIN validar,
--     sin tocar ningún dato. Un despliegue nunca se traba por filas viejas: las nuevas ya están
--     protegidas y un operador puede limpiar las viejas y validar más tarde con
--     `ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT <nombre>;`.
--
-- ÍNDICE REDUNDANTE
--
-- `reporte_estado` (0001) es un índice de una sola columna sobre `estado`. El compuesto
-- `reporte_estado_creado (estado, creado_en DESC)` (0002) lo cubre: cualquier consulta que usara
-- el primero puede usar el prefijo del segundo. Se quita el redundante. Nadie lo nombra en el
-- código (solo la tabla de índices de docs/operaciones/produccion.md, que se actualiza aparte).
--
-- IDEMPOTENCIA Y BLOQUEO
--
-- El bloque `DO` mira `pg_constraint` antes de cada `ADD CONSTRAINT`, así que correr el archivo dos
-- veces no vuelve a agregar ni re-valida nada (una segunda pasada no hace nada). `DROP INDEX IF
-- EXISTS` tampoco falla si el índice ya no está. El `ADD ... NOT VALID` toma ACCESS EXCLUSIVE sobre
-- `reporte_inundacion` un instante y el `VALIDATE` toma SHARE UPDATE EXCLUSIVE; el runner pone
-- `lock_timeout` para no quedar en cola detrás del tráfico.

-- 1) Los dos CHECK: crear NOT VALID y validar solo si ninguna fila los viola.
DO $$
DECLARE
  n_motivo bigint;
  n_fusion bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.reporte_inundacion'::regclass
       AND conname = 'motivo_en_rechazo_y_duplicado'
  ) THEN
    ALTER TABLE reporte_inundacion
      ADD CONSTRAINT motivo_en_rechazo_y_duplicado
      CHECK (estado NOT IN ('rechazado', 'duplicado')
             OR (estado_motivo IS NOT NULL AND btrim(estado_motivo) <> ''))
      NOT VALID;
    SELECT count(*) INTO n_motivo FROM reporte_inundacion
      WHERE estado IN ('rechazado', 'duplicado')
        AND (estado_motivo IS NULL OR btrim(estado_motivo) = '');
    IF n_motivo = 0 THEN
      ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT motivo_en_rechazo_y_duplicado;
    ELSE
      RAISE NOTICE 'motivo_en_rechazo_y_duplicado: % fila(s) en «rechazado»/«duplicado» sin motivo; la restricción queda SIN VALIDAR. Corregí esas filas y validala con ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT motivo_en_rechazo_y_duplicado;', n_motivo;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.reporte_inundacion'::regclass
       AND conname = 'fusion_solo_en_duplicado'
  ) THEN
    ALTER TABLE reporte_inundacion
      ADD CONSTRAINT fusion_solo_en_duplicado
      CHECK (fusionado_en_id IS NULL OR estado = 'duplicado')
      NOT VALID;
    SELECT count(*) INTO n_fusion FROM reporte_inundacion
      WHERE fusionado_en_id IS NOT NULL AND estado <> 'duplicado';
    IF n_fusion = 0 THEN
      ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT fusion_solo_en_duplicado;
    ELSE
      RAISE NOTICE 'fusion_solo_en_duplicado: % fila(s) con fusionado_en_id en un estado que no es «duplicado»; la restricción queda SIN VALIDAR. Corregí esas filas y validala con ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT fusion_solo_en_duplicado;', n_fusion;
    END IF;
  END IF;
END
$$;

-- 2) Índice redundante: lo cubre reporte_estado_creado (estado, creado_en DESC) de la 0002.
DROP INDEX IF EXISTS reporte_estado;
