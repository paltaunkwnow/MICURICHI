-- Migración 0020 — expandir la base al modelo multicategoría (ADR 0008–0011, 0017). Parte 4.
-- Sin cambio de contrato HTTP: el OpenAPI no cambia. Roadmap M2 de docs/arquitectura/14 §5.
--
-- QUÉ CAMBIA (patrón «expandir → convivir → contraer», como las 0014–0016)
--
-- Hasta aquí la única tabla de reportes era `reporte_inundacion`, con el dominio de inundación
-- tipado en columnas. Esta migración deja la base lista para varias categorías sobre UN MISMO núcleo
-- (ADR 0009), SIN cambiar el comportamiento de hoy: api-core, geo-service, los scripts y los seeds
-- siguen escribiendo y leyendo `reporte_inundacion` SIN TOCARLOS, ahora a través de una VISTA de
-- compatibilidad filtrada a inundación. Mientras solo esté activa la categoría `inundacion`, nada
-- cambia hacia afuera.
--
-- Pasos (conceptual de 13.3 §3.2), todo en la transacción del runner:
--   1. catálogo `categoria` con las cuatro categorías iniciales (solo `inundacion` activa);
--   2. función `detalle_inundacion(...)`: arma el `detalle` jsonb desde las seis columnas de dominio;
--   3. RENAME `reporte_inundacion` → `reporte` (conserva id, FK, índices, CHECK y GRANT por OID);
--   4. columnas nuevas `categoria`, `subtipo`, `detalle`, `detalle_version` con sus CHECK;
--   5. relleno del `detalle` de cada reporte existente desde sus columnas (misma función del paso 2);
--   6. las columnas de dominio de inundación pasan a NULL-ables + dos CHECK de no contaminación;
--   7. disparador que mantiene el `detalle` al día en cada INSERT/UPDATE de un reporte de inundación;
--   8. VISTA `reporte_inundacion` (security_invoker, WITH CASCADED CHECK OPTION) con los MISMOS GRANT;
--   9. `punto_critico.categoria`;
--  10. tabla genérica `cupo_contador` (ADR 0017), que nadie usa hasta M3.
--
-- DECISIONES
--
-- · D3 (versión de severidad): se documenta como «v2 extendida», SIN tocar `severidad_version` ni los
--   datos (decisión del usuario del 2026-10-08). Por eso esta migración NO recalcula severidad.
-- · `detalle` omite las claves NULL (`jsonb_strip_nulls`): las tres preguntas del sumidero son
--   opcionales (`.nullable().optional()` en el contrato), así que su ausencia y su NULL dicen lo
--   mismo. `profundidad_estimada`, `frecuencia` y `causa_presunta` están siempre (las dos primeras son
--   obligatorias; la tercera tiene DEFAULT 'desconocida'). La prueba comprueba la reconstrucción exacta.
-- · `detalle_version = 1` para inundación: coincide con DEFINICION_INUNDACION.detalleVersion de
--   contracts 0.19.0. No es la versión de severidad; son cosas distintas.
-- · UNA sola función (`detalle_inundacion`) arma el `detalle` y la usan el relleno (paso 5) y el
--   disparador (paso 7): así no pueden divergir.
-- · La VISTA expone `SELECT *` de `reporte`: la lista de columnas de una vista se FIJA al crearla, así
--   que una columna nueva en `reporte` (M3 en adelante) EXIGE recrear la vista. El `WITH CASCADED CHECK
--   OPTION` impide que un INSERT/UPDATE por la vista escriba una fila que no sea de inundación.
-- · `security_invoker = true` (PostgreSQL 15+): la vista comprueba los privilegios con el ROL QUE
--   CONSULTA, no con el dueño, así se mantiene el mínimo privilegio de la 0008. curichi_api y
--   curichi_geo ya tienen sobre `reporte` (heredado del RENAME) lo que tenían sobre la tabla vieja.
-- · Sin índices nuevos en M2: la medición (M2.3) decide los índices por categoría con evidencia y van
--   a la migración de M3 (decisión técnica 4 del plan).
--
-- IDEMPOTENCIA Y BLOQUEO
--
-- Cada paso comprueba el catálogo antes de actuar (IF NOT EXISTS / pg_class / pg_constraint /
-- pg_trigger), así que volver a ejecutar el archivo a mano no falla ni cambia nada; el runner, además,
-- no lo reaplica (_migraciones). El RENAME y los ALTER toman ACCESS EXCLUSIVE sobre la tabla un
-- instante; el relleno reescribe cada fila una vez (con volumen grande se mide antes, M2.3). El runner
-- pone statement_timeout = 0 y lock_timeout para no quedar en cola detrás del tráfico.

-- 0) GUARDA (patrón de la 0015): abortar si algún reporte tiene NULL donde hoy hay NOT NULL de dominio.
--    Antes de relajar esas columnas y de mover sus valores al `detalle`, un NULL inesperado dejaría un
--    `detalle` incompleto. Con las columnas en NOT NULL esto no puede pasar; es una red de seguridad.
DO $$
DECLARE
  n_malos bigint;
BEGIN
  IF to_regclass('public.reporte_inundacion') IS NULL THEN
    RAISE EXCEPTION 'no existe reporte_inundacion: la base no está en el estado esperado para la 0020';
  END IF;
  SELECT count(*) INTO n_malos FROM reporte_inundacion
   WHERE profundidad_estimada IS NULL OR frecuencia IS NULL OR causa_presunta IS NULL;
  IF n_malos > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      '%s reporte(s) de inundación tienen profundidad_estimada, frecuencia o causa_presunta en NULL; '
      'la 0020 los movería a un detalle incompleto. Corregí esas filas antes de migrar.', n_malos);
  END IF;
END
$$;

-- 1) Catálogo de categorías (ADR 0009). Solo `inundacion` nace activa; las otras se activan por
--    instalación cuando completan su fase (roadmap M6–M8). El orden es el de SLUGS_CATEGORIA de
--    contracts (inundacion, bache, area_verde, basura).
CREATE TABLE IF NOT EXISTS categoria (
  slug text PRIMARY KEY CONSTRAINT categoria_slug_snake_case CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  activa boolean NOT NULL DEFAULT false,
  orden smallint NOT NULL CONSTRAINT categoria_orden_unico UNIQUE,
  activada_en timestamptz,
  activada_por uuid REFERENCES usuario (id) ON DELETE SET NULL
);
COMMENT ON TABLE categoria IS
  'Categorías de la plataforma (ADR 0009). `activa` la enciende el admin con auditoría; mientras haya una sola activa, el selector no se muestra. El orden es el de SLUGS_CATEGORIA de contracts.';

INSERT INTO categoria (slug, activa, orden) VALUES
  ('inundacion', true, 1),
  ('bache', false, 2),
  ('area_verde', false, 3),
  ('basura', false, 4)
ON CONFLICT (slug) DO NOTHING;

-- 2) Función que arma el `detalle` de inundación desde sus seis columnas de dominio. La usan el
--    relleno (paso 5) y el disparador (paso 7): es la ÚNICA fuente de la forma del detalle, así no
--    pueden divergir. `jsonb_strip_nulls` omite las claves opcionales en NULL (ver DECISIONES).
CREATE OR REPLACE FUNCTION detalle_inundacion(
  profundidad_estimada profundidad_estimada,
  frecuencia frecuencia,
  causa_presunta causa_presunta,
  sumidero_cercano sumidero_cercano,
  sumidero_estado sumidero_estado,
  agua_brota_sumidero boolean
) RETURNS jsonb
LANGUAGE sql IMMUTABLE
-- search_path fijo (seguridad, §5 del modelo de seguridad): la función no resuelve nombres contra el
-- search_path de quien la llama, así nadie puede anteponer un objeto propio.
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'profundidad_estimada', profundidad_estimada,
    'frecuencia', frecuencia,
    'causa_presunta', causa_presunta,
    'sumidero_cercano', sumidero_cercano,
    'sumidero_estado', sumidero_estado,
    'agua_brota_sumidero', agua_brota_sumidero
  ));
$$;
COMMENT ON FUNCTION detalle_inundacion(profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, sumidero_estado, boolean) IS
  'Arma el detalle jsonb de un reporte de inundación desde sus columnas de dominio (detalle_version = 1, contracts 0.19.0). Fuente única del relleno y del disparador de sincronización.';
-- Grants uno a uno (§5 del modelo de seguridad): por defecto una función queda EXECUTE para PUBLIC.
-- Se revoca; el EXECUTE para curichi_api (que la llama desde el disparador) se concede abajo, guardado
-- por la existencia del rol. REVOKE es idempotente y CREATE OR REPLACE conserva el ACL en re-corridas.
REVOKE EXECUTE ON FUNCTION detalle_inundacion(profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, sumidero_estado, boolean) FROM PUBLIC;

-- 3) RENAME. ALTER TABLE ... RENAME y ADD COLUMN no reescriben las claves: id, las FK por OID
--    (reporte_foto.reporte_id, idempotencia.reporte_id, fusionado_en_id a sí misma), los índices, los
--    CHECK y los GRANT quedan tal cual, ahora colgando de `reporte`. Solo si todavía es la tabla vieja.
DO $$
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.reporte_inundacion')) = 'r'
     AND to_regclass('public.reporte') IS NULL THEN
    ALTER TABLE reporte_inundacion RENAME TO reporte;
  END IF;
END
$$;

-- 4) Columnas comunes del modelo híbrido (ADR 0010). `categoria` apunta al catálogo y nace en
--    'inundacion' para que todo reporte existente y todo INSERT que no la nombre (api-core de hoy, por
--    la vista) sea de inundación. `detalle` es el jsonb con lo propio de cada categoría.
ALTER TABLE reporte
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'inundacion' REFERENCES categoria (slug),
  ADD COLUMN IF NOT EXISTS subtipo text,
  ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS detalle_version smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.reporte'::regclass AND conname = 'detalle_es_objeto') THEN
    ALTER TABLE reporte ADD CONSTRAINT detalle_es_objeto CHECK (jsonb_typeof(detalle) = 'object');
  END IF;
  -- Tope de tamaño del detalle (seguridad, 13.3 §4.9): un objeto de categoría no debería acercarse.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.reporte'::regclass AND conname = 'detalle_tope') THEN
    ALTER TABLE reporte ADD CONSTRAINT detalle_tope CHECK (octet_length(detalle::text) <= 8192);
  END IF;
END
$$;

-- 5) Relleno del detalle de los reportes existentes (todos de inundación). Solo las filas que todavía
--    tienen el DEFAULT '{}': así una segunda pasada a mano no reescribe nada (`detalle_inundacion`
--    nunca devuelve '{}' para inundación, porque profundidad y frecuencia están siempre).
UPDATE reporte
   SET detalle = detalle_inundacion(profundidad_estimada, frecuencia, causa_presunta,
                                    sumidero_cercano, sumidero_estado, agua_brota_sumidero)
 WHERE categoria = 'inundacion' AND detalle = '{}'::jsonb;

-- 6) Las columnas de dominio de inundación pasan a NULL-ables (otras categorías no las usan) y dos
--    CHECK de no contaminación reemplazan a la vieja garantía NOT NULL:
--    · inundacion_campos_presentes: un reporte de inundación SIEMPRE trae profundidad, frecuencia y causa;
--    · no_inundacion_sin_campos:    un reporte de OTRA categoría NO trae ninguno de los seis campos.
--    causa_presunta conserva su DEFAULT 'desconocida': un INSERT de inundación por la vista que la
--    omita la toma igual que hoy; una categoría distinta tiene que ponerla en NULL explícitamente (M3).
ALTER TABLE reporte ALTER COLUMN profundidad_estimada DROP NOT NULL;
ALTER TABLE reporte ALTER COLUMN frecuencia DROP NOT NULL;
ALTER TABLE reporte ALTER COLUMN causa_presunta DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.reporte'::regclass AND conname = 'inundacion_campos_presentes') THEN
    ALTER TABLE reporte ADD CONSTRAINT inundacion_campos_presentes CHECK (
      categoria <> 'inundacion'
      OR (profundidad_estimada IS NOT NULL AND frecuencia IS NOT NULL AND causa_presunta IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.reporte'::regclass AND conname = 'no_inundacion_sin_campos') THEN
    ALTER TABLE reporte ADD CONSTRAINT no_inundacion_sin_campos CHECK (
      categoria = 'inundacion'
      OR (profundidad_estimada IS NULL AND frecuencia IS NULL AND causa_presunta IS NULL
          AND sumidero_cercano IS NULL AND sumidero_estado IS NULL AND agua_brota_sumidero IS NULL));
  END IF;
END
$$;

-- 6b) El índice parcial `reporte_agregado_uv` (0015) mantiene el agregado por UV de geo-service como
--     Index Only Scan. A través de la vista de compatibilidad, la consulta suma el filtro
--     `categoria = 'inundacion'`; si `categoria` no está en el índice, el planificador va al heap y se
--     pierde el Index Only Scan. Se recrea sumando `categoria` al INCLUDE. NO es un índice nuevo por
--     categoría (esos los decide M2.3 con medición): es conservar el comportamiento de hoy con la vista.
--     Solo se recrea si todavía no incluye `categoria` (una segunda pasada no lo reconstruye).
DO $$
BEGIN
  IF coalesce((SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i
                WHERE i.indexrelid = to_regclass('public.reporte_agregado_uv')), '') !~ 'categoria' THEN
    DROP INDEX IF EXISTS reporte_agregado_uv;
    CREATE INDEX reporte_agregado_uv
      ON reporte (unidad_vecinal_id)
      INCLUDE (id, punto_critico_id, severidad_manual, severidad_calculada, estado, publicar_en, categoria)
      WHERE estado IN ('nuevo', 'validado', 'resuelto');
  END IF;
END
$$;

-- 7) Disparador de sincronización del detalle. Mientras api-core (sin tocar hasta M3) siga escribiendo
--    solo las columnas planas, este BEFORE INSERT OR UPDATE arma el `detalle` desde ellas en cada
--    escritura de un reporte de inundación, con la MISMA función del relleno. Sin él, un INSERT por la
--    vista dejaría `detalle = '{}'` y se rompería la invariante «el detalle reconstruye las columnas».
--    M10 lo retira junto con las columnas planas.
CREATE OR REPLACE FUNCTION reporte_sincronizar_detalle() RETURNS trigger
LANGUAGE plpgsql
-- search_path fijo (seguridad, §5): el cuerpo resuelve `detalle_inundacion` y los tipos contra public.
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.categoria = 'inundacion' THEN
    NEW.detalle := detalle_inundacion(NEW.profundidad_estimada, NEW.frecuencia, NEW.causa_presunta,
                                      NEW.sumidero_cercano, NEW.sumidero_estado, NEW.agua_brota_sumidero);
    NEW.detalle_version := 1;
  END IF;
  RETURN NEW;
END;
$$;
-- Igual que arriba: nadie salvo quien la necesite la ejecuta. Disparar un trigger NO comprueba EXECUTE
-- sobre su función, así que no hace falta concederla a ningún rol; solo se quita el EXECUTE de PUBLIC.
REVOKE EXECUTE ON FUNCTION reporte_sincronizar_detalle() FROM PUBLIC;

DROP TRIGGER IF EXISTS reporte_sincronizar_detalle ON reporte;
CREATE TRIGGER reporte_sincronizar_detalle
  BEFORE INSERT OR UPDATE ON reporte
  FOR EACH ROW EXECUTE FUNCTION reporte_sincronizar_detalle();

-- 8) VISTA de compatibilidad. api-core, geo-service, los scripts y los seeds siguen diciendo
--    `reporte_inundacion` y solo ven inundación: una consulta olvidada no se contamina con otras
--    categorías, y un INSERT/UPDATE viejo sigue funcionando (vista actualizable, categoria por DEFAULT).
--    Los mismos GRANT que tenía la tabla (0008): api escribe, geo solo lee. Con security_invoker, lo que
--    de verdad decide es el GRANT sobre `reporte`, heredado del RENAME.
CREATE OR REPLACE VIEW reporte_inundacion WITH (security_invoker = true) AS
  SELECT * FROM reporte WHERE categoria = 'inundacion'
  WITH CASCADED CHECK OPTION;
COMMENT ON VIEW reporte_inundacion IS
  'Vista de compatibilidad (ADR 0011): los reportes de inundación de `reporte`. security_invoker + WITH CASCADED CHECK OPTION. Su lista de columnas se fijó al crearla: una columna nueva en `reporte` exige recrearla (M3).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON reporte_inundacion TO curichi_api';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_geo') THEN
    EXECUTE 'GRANT SELECT ON reporte_inundacion TO curichi_geo';
  END IF;
  -- Catálogo de categorías: lectura para los dos servicios (api lo listará en M3; geo filtra por él).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
    EXECUTE 'GRANT SELECT ON categoria TO curichi_api';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_geo') THEN
    EXECUTE 'GRANT SELECT ON categoria TO curichi_geo';
  END IF;
  -- EXECUTE de detalle_inundacion para curichi_api: el disparador la invoca con el rol que escribe
  -- (security_invoker), y curichi_api es quien crea/modera reportes. geo-service no escribe: no recibe.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION detalle_inundacion(profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, sumidero_estado, boolean) TO curichi_api';
  END IF;
END
$$;

-- 9) `punto_critico.categoria`: los puntos críticos existentes son de inundación. El recálculo con
--    PARTITION BY categoria es de M3; aquí solo se agrega la columna.
ALTER TABLE punto_critico
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'inundacion' REFERENCES categoria (slug);

-- 10) Contador genérico de cupo (ADR 0017). Reemplaza a cuota_reporte_diaria en M10. Upsert atómico por
--     (usuario_id, clave, ventana_inicio), igual que cuota_reporte_diaria lo hace por (usuario_id, dia).
--     NADIE lo usa hasta M3. La FK queda cubierta por el prefijo de la PK (ver 0006/0014).
CREATE TABLE IF NOT EXISTS cupo_contador (
  usuario_id uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  clave text NOT NULL CONSTRAINT cupo_contador_clave_largo CHECK (char_length(clave) BETWEEN 1 AND 120),
  ventana_inicio timestamptz NOT NULL,
  n integer NOT NULL CONSTRAINT cupo_contador_n_no_negativo CHECK (n >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, clave, ventana_inicio)
);
COMMENT ON TABLE cupo_contador IS
  'Contador genérico de cupo por regla (ADR 0017); reemplaza a cuota_reporte_diaria en M10. Upsert atómico INSERT ... ON CONFLICT (usuario_id, clave, ventana_inicio) DO UPDATE SET n = n + 1 WHERE n < limite RETURNING n. Claves previstas en M3, p. ej. «reportes:inundacion» (por categoría) y «fotos:cuenta» (global). El mantenimiento borra las ventanas de días anteriores.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON cupo_contador TO curichi_api';
  END IF;
END
$$;
