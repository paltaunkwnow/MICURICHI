-- Reversa de la migración 0020 — volver al esquema de la 0019 (ADR 0011). Parte 4.
--
-- NO la aplica el runner: vive en `migraciones/reversas/`, y `listarMigraciones()` solo mira los
-- `NNNN_*.sql` de `migraciones/` (no entra en subcarpetas). Es una herramienta de operación para dar
-- marcha atrás a la expansión multicategoría MIENTRAS solo haya reportes de inundación (expandir →
-- convivir → contraer, 13.3 §3.4). Se corre a mano, en una transacción:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/migraciones/reversas/0020_base_multicategoria_reversa.sql
--
-- Deshacer la 0020 deja de ser posible en cuanto exista un reporte de otra categoría (habría que
-- archivarlos primero): por eso ABORTA si encuentra alguno. La prueba migracion-0020 compara el
-- catálogo resultante (tablas, columnas, tipos, NOT NULL, CHECK, índices y grants) con una base
-- migrada hasta la 0019 y exige que coincidan.
--
-- Nota: las columnas que agregó la 0020 se quitan, pero su «hueco» queda marcado como columna
-- eliminada en el catálogo interno (pg_attribute.attisdropped). Eso no se ve en information_schema ni
-- cambia ninguna consulta; la comparación de la prueba se hace sobre information_schema y pg_constraint.

BEGIN;

-- 0) No dar marcha atrás si ya hay otra categoría: se perderían esos reportes.
DO $$
DECLARE
  n_otras bigint;
BEGIN
  IF to_regclass('public.reporte') IS NULL THEN
    RAISE EXCEPTION 'no existe la tabla `reporte`: la 0020 no está aplicada, no hay nada que revertir';
  END IF;
  SELECT count(*) INTO n_otras FROM reporte WHERE categoria <> 'inundacion';
  IF n_otras > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'hay %s reporte(s) de una categoría distinta de inundación: la reversa los perdería. '
      'Archivalos antes de revertir la 0020 (ADR 0011).', n_otras);
  END IF;
END
$$;

-- 1) La vista de compatibilidad (depende de `reporte.categoria`): se va primero y libera el nombre.
DROP VIEW IF EXISTS reporte_inundacion;

-- 2) Disparador y funciones de la 0020.
DROP TRIGGER IF EXISTS reporte_sincronizar_detalle ON reporte;
DROP FUNCTION IF EXISTS reporte_sincronizar_detalle();
DROP FUNCTION IF EXISTS detalle_inundacion(profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, sumidero_estado, boolean);

-- 3) El índice `reporte_agregado_uv` de la 0020 incluye `categoria`: se quita (y se recrea más abajo
--    con la forma de la 0015, sin `categoria`) para poder dropear la columna.
DROP INDEX IF EXISTS reporte_agregado_uv;

-- 4) CHECK de la 0020 y columnas nuevas de `reporte`. Al dropear `categoria` se va también su FK al
--    catálogo. Después se restablece el NOT NULL de las tres columnas de dominio que la 0020 relajó
--    (todas las filas son de inundación y las traen, así que el SET NOT NULL no falla).
ALTER TABLE reporte DROP CONSTRAINT IF EXISTS inundacion_campos_presentes;
ALTER TABLE reporte DROP CONSTRAINT IF EXISTS no_inundacion_sin_campos;
ALTER TABLE reporte DROP CONSTRAINT IF EXISTS detalle_es_objeto;
ALTER TABLE reporte DROP CONSTRAINT IF EXISTS detalle_tope;
ALTER TABLE reporte DROP COLUMN IF EXISTS detalle_version;
ALTER TABLE reporte DROP COLUMN IF EXISTS detalle;
ALTER TABLE reporte DROP COLUMN IF EXISTS subtipo;
ALTER TABLE reporte DROP COLUMN IF EXISTS categoria;
ALTER TABLE reporte ALTER COLUMN profundidad_estimada SET NOT NULL;
ALTER TABLE reporte ALTER COLUMN frecuencia SET NOT NULL;
ALTER TABLE reporte ALTER COLUMN causa_presunta SET NOT NULL;

-- Recrear el índice del agregado por UV con la forma exacta de la 0015 (sin `categoria`). Se crea
-- sobre `reporte`; el renombre de abajo lo deja colgando de `reporte_inundacion`, como en la 0019.
CREATE INDEX reporte_agregado_uv
  ON reporte (unidad_vecinal_id)
  INCLUDE (id, punto_critico_id, severidad_manual, severidad_calculada, estado, publicar_en)
  WHERE estado IN ('nuevo', 'validado', 'resuelto');

-- 5) `punto_critico.categoria` y su FK.
ALTER TABLE punto_critico DROP COLUMN IF EXISTS categoria;

-- 6) Tablas nuevas de la 0020.
DROP TABLE IF EXISTS cupo_contador;
DROP TABLE IF EXISTS categoria;

-- 7) El nombre vuelve: `reporte` pasa a ser otra vez `reporte_inundacion` (como la 0019).
DO $$
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.reporte')) = 'r'
     AND to_regclass('public.reporte_inundacion') IS NULL THEN
    ALTER TABLE reporte RENAME TO reporte_inundacion;
  END IF;
END
$$;

-- 8) Borrar el registro de la 0020 en el control de migraciones. `src/migrar.ts` guarda una fila por
--    archivo aplicado en `_migraciones (nombre text PRIMARY KEY)`; sin esto, el migrador seguiría
--    dando la 0020 por aplicada y no la reaplicaría tras la reversa. Al quitarla, la base queda
--    «como en la 0019» también para el migrador, y una nueva corrida vuelve a aplicar la 0020.
DELETE FROM _migraciones WHERE nombre = '0020_base_multicategoria.sql';

COMMIT;
