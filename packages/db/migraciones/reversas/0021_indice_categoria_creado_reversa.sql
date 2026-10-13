-- Reversa de la migración 0021 — quitar el índice parcial `(categoria, creado_en DESC)`. Parte 4.
--
-- NO la aplica el runner: vive en `migraciones/reversas/`, y `listarMigraciones()` solo mira los
-- `NNNN_*.sql` de `migraciones/` (no entra en subcarpetas). Es una herramienta de operación.
--
-- Se corre ANTES de la reversa de la 0020 cuando se quiere volver al esquema de la 0019, porque el
-- índice depende de la columna `reporte.categoria` que la reversa de la 0020 elimina (si no se quita
-- aquí, `DROP COLUMN categoria` lo arrastra igual por dependencia, pero entonces la fila de la 0021
-- quedaría en `_migraciones` sin su índice y el migrador no lo recrearía). Esta reversa borra el
-- índice y su fila de control, dejando la base «como en la 0020 sin la 0021»; una nueva corrida del
-- migrador vuelve a aplicar la 0021.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/migraciones/reversas/0021_indice_categoria_creado_reversa.sql

BEGIN;

DROP INDEX IF EXISTS reporte_categoria_creado;

-- `src/migrar.ts` guarda una fila por archivo aplicado en `_migraciones (nombre text PRIMARY KEY)`;
-- sin esto, el migrador seguiría dando la 0021 por aplicada y no la reaplicaría tras la reversa.
DELETE FROM _migraciones WHERE nombre = '0021_indice_categoria_creado.sql';

COMMIT;
