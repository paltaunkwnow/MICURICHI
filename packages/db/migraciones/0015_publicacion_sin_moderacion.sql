-- Migración 0015 — publicación sin moderación previa: `reporte_inundacion.publicar_en`, índices
-- públicos con los tres estados visibles y freno a publicar de golpe lo recibido antes. Parte 4.
-- Contrato: packages/contracts 0.11.0.
--
-- EL CAMBIO (T4 del plan de producción, 2026-09-26; ADR 0006)
--
-- Hasta aquí un reporte `nuevo` no se publicaba: un técnico lo revisaba antes. Desde el contrato
-- 0.11.0 son públicos `nuevo` (con «NO SE HA VERIFICADO»), `validado` y `resuelto`, pero cada
-- reporte recién se ve cuando pasa su demora: api-core fija `publicar_en` al crearlo (1 minuto el
-- primero del día y 4 los siguientes, según el `n` del cupo de la 0014). No hay ningún proceso que
-- publique: la regla es un filtro, `estado IN ('nuevo','validado','resuelto') AND
-- publicar_en <= now()`.
--
-- 1) EL FRENO
--
-- Los `nuevo` que ya existen se enviaron bajo el texto «un técnico lo revisa antes de publicarlo».
-- Con esta migración quedarían públicos al instante, sin que nadie los mirara. Por eso, si hay
-- alguno, la migración aborta y no cambia nada, salvo que se ejecute a sabiendas con
--
--   node dist/cli/migrar.js --publicar-nuevos-existentes
--
-- que hace `SET LOCAL curichi.publicar_nuevos_existentes = 'si'` en la transacción de la migración
-- (y solo en ella). Lo normal en producción es moderar la bandeja antes de desplegar T4. El freno
-- solo mira mientras la columna no existe: volver a correr el archivo sobre una base ya migrada no
-- frena por los `nuevo` que ya viven bajo la regla nueva.
--
-- 2) publicar_en
--
-- Se agrega NULL, se rellena con `creado_en` (los anteriores quedan publicados desde siempre, como
-- ya lo estaban los validados y resueltos) y recién después se le pone DEFAULT now(), NOT NULL y el
-- CHECK. En otro orden el CHECK fallaba en toda fila de más de una hora.
--
-- · DEFAULT now(): el api-core anterior, que sigue atendiendo mientras corre el job de
--   migraciones, inserta sin nombrar la columna; con `creado_en` también en now() (el mismo
--   instante dentro de la transacción) el reporte queda publicable enseguida, como el `validado`
--   de antes. El DEFAULT se quita en la 0016 (contracción, despliegue posterior).
-- · CHECK `publicar_en_rango`: entre `creado_en` y `creado_en + 1 hora`. La demora de negocio es
--   de 60 o 240 s; la variable de pruebas admite hasta 3600 s. Una demora negativa o mayor es un
--   error del servidor y se corta aquí. Quien inserte o mueva `creado_en` a mano (pruebas, seeds,
--   restauraciones) tiene que mover también `publicar_en`.
--
-- 3) ÍNDICES PÚBLICOS
--
-- `reporte_geom_publico_gist` (0005, listado público por bbox) y `reporte_agregado_uv` (0007,
-- coropletas) eran parciales con `estado IN ('validado','resuelto')`. Con ese predicado, la
-- consulta pública nueva (que incluye `nuevo`) ya no podría usarlos. Se recrean con los tres
-- estados públicos y con `publicar_en` en el INCLUDE: `now()` no puede ir en el predicado de un
-- índice, así que el filtro de la demora se resuelve con la columna incluida.
--
-- · El predicado es un LITERAL y la consulta también tiene que serlo (api-core y geo-service lo
--   arman desde ESTADOS_PUBLICOS). Con `estado = ANY($n)` y plan genérico PostgreSQL no puede
--   demostrar que la condición implica el predicado y no usa el índice.
-- · `reporte_agregado_uv` suma `estado` al INCLUDE: el agregado cuenta aparte los verificados
--   (`FILTER (WHERE estado IN ('validado','resuelto'))`) y, sin la columna en el índice, dejaría
--   de ser un Index Only Scan.
-- · Solo se recrean si su definición todavía no tiene el predicado nuevo: una segunda ejecución
--   no los reconstruye.
--
-- Los puntos críticos (DBSCAN, §9.2) no cambian: siguen agrupando solo validados y resueltos.
--
-- PRIVILEGIOS
--
-- `curichi_api` tiene SELECT, INSERT y UPDATE sobre `reporte_inundacion` a nivel de TABLA (0008)
-- y `curichi_geo`, SELECT: los dos cubren la columna nueva. No cambia la matriz de
-- `src/cli/matriz-privilegios.mjs`.
--
-- BLOQUEO
--
-- Toda la migración va en una transacción que toma ACCESS EXCLUSIVE sobre `reporte_inundacion`
-- desde el ADD COLUMN hasta el final: lecturas y escrituras de reportes esperan. El UPDATE escribe
-- una versión nueva de cada fila, SET NOT NULL y el CHECK recorren la tabla una vez cada uno y los
-- dos índices se reconstruyen. Con pocas decenas de miles de reportes son segundos; con un millón
-- hay que medirlo antes en una copia <a medir>. El runner pone `statement_timeout = 0` y
-- `lock_timeout` para no quedar en cola detrás del tráfico. Después conviene un
-- `VACUUM (ANALYZE) reporte_inundacion` (el autovacuum lo hace solo, más tarde).

-- 1) Freno.
DO $$
DECLARE
  n_nuevos bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'
       AND column_name = 'publicar_en'
  ) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO n_nuevos FROM reporte_inundacion WHERE estado = 'nuevo';
  IF n_nuevos > 0
     AND coalesce(current_setting('curichi.publicar_nuevos_existentes', true), '') <> 'si' THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Hay %s %s en estado «nuevo» que se %s con la promesa de revisión previa, y esta migración '
        'los publicaría al instante. Moderalos antes de migrar (validar, rechazar o fusionar) o, '
        'si publicarlos es a sabiendas, migrá con --publicar-nuevos-existentes.',
        n_nuevos,
        CASE WHEN n_nuevos = 1 THEN 'reporte' ELSE 'reportes' END,
        CASE WHEN n_nuevos = 1 THEN 'envió' ELSE 'enviaron' END),
      HINT = 'node dist/cli/migrar.js --publicar-nuevos-existentes (o pnpm db:migrate -- --publicar-nuevos-existentes)';
  END IF;
END
$$;

-- 2) publicar_en: agregar, rellenar y recién después exigir.
ALTER TABLE reporte_inundacion ADD COLUMN IF NOT EXISTS publicar_en timestamptz;

UPDATE reporte_inundacion SET publicar_en = creado_en WHERE publicar_en IS NULL;

ALTER TABLE reporte_inundacion ALTER COLUMN publicar_en SET DEFAULT now();
ALTER TABLE reporte_inundacion ALTER COLUMN publicar_en SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.reporte_inundacion'::regclass AND conname = 'publicar_en_rango'
  ) THEN
    ALTER TABLE reporte_inundacion
      ADD CONSTRAINT publicar_en_rango
      CHECK (publicar_en >= creado_en AND publicar_en <= creado_en + interval '1 hour');
  END IF;
END
$$;

COMMENT ON COLUMN reporte_inundacion.publicar_en IS
  'Desde cuándo el reporte es visible (contrato 0.11.0): lo fija api-core al crearlo, 60 s el primero del día y 240 s los siguientes. Visible si estado IN (nuevo, validado, resuelto) y publicar_en <= now(). Los anteriores a la migración 0015 tienen publicar_en = creado_en.';

-- 3) Índices públicos con los tres estados y publicar_en en el INCLUDE.
DO $$
BEGIN
  IF coalesce((SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i
                WHERE i.indexrelid = to_regclass('public.reporte_geom_publico_gist')), '')
     !~ 'publicar_en' THEN
    DROP INDEX IF EXISTS reporte_geom_publico_gist;
    CREATE INDEX reporte_geom_publico_gist
      ON reporte_inundacion USING GIST (geom_publico)
      INCLUDE (publicar_en)
      WHERE estado IN ('nuevo', 'validado', 'resuelto');
  END IF;

  IF coalesce((SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i
                WHERE i.indexrelid = to_regclass('public.reporte_agregado_uv')), '')
     !~ 'publicar_en' THEN
    DROP INDEX IF EXISTS reporte_agregado_uv;
    CREATE INDEX reporte_agregado_uv
      ON reporte_inundacion (unidad_vecinal_id)
      INCLUDE (id, punto_critico_id, severidad_manual, severidad_calculada, estado, publicar_en)
      WHERE estado IN ('nuevo', 'validado', 'resuelto');
  END IF;
END
$$;
