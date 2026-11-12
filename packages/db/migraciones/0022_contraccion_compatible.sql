-- 0022 / ADR0026. Solo contracción física; HTTP v1 permanece compatible.
-- El runner proporciona ambos valores LOCAL a ESTA transacción, con consentimiento explícito.
DO $$
BEGIN
  IF current_setting('curichi.autorizar_contraccion_compatible', true) IS DISTINCT FROM 'si'
     OR current_setting('curichi.autorizar_contraccion_compatible_tx', true) IS DISTINCT FROM txid_current()::text THEN
    RAISE EXCEPTION '0022: falta consentimiento explícito local de esta transacción (--autorizar-contraccion-compatible)';
  END IF;
  IF (SELECT max(nombre) FROM public._migraciones) IS DISTINCT FROM '0021_indice_categoria_creado.sql'
     OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.reporte')) IS DISTINCT FROM 'r'
     OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.reporte_inundacion')) IS DISTINCT FROM 'v'
     OR to_regclass('public.cuota_reporte_diaria') IS NULL
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.reporte'::regclass AND NOT attisdropped
          AND attname IN ('profundidad_estimada','frecuencia','causa_presunta','sumidero_cercano','sumidero_estado','agua_brota_sumidero')) <> 6 THEN
    RAISE EXCEPTION '0022: esquema/version de origen incompatible; se requiere 0021 completo';
  END IF;
END $$;

LOCK TABLE public.reporte, public.cuota_reporte_diaria IN ACCESS EXCLUSIVE MODE;

-- Antes de copiar o retirar nada: todos los datos tienen una representación reversible exacta.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reporte WHERE detalle_version <> 1) THEN
    RAISE EXCEPTION '0022: version de detalle no soportada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reporte WHERE categoria='inundacion' AND
       detalle IS DISTINCT FROM public.detalle_inundacion(profundidad_estimada,frecuencia,causa_presunta,
         sumidero_cercano,sumidero_estado,agua_brota_sumidero)) THEN
    RAISE EXCEPTION '0022: falla equivalencia exacta de planos y JSON';
  END IF;
  -- Comparar con el deparser del mismo motor, sin fijar su formato entre PostgreSQL/PGlite.
  CREATE TEMP TABLE m10_0022_referencia_detalle (
    detalle jsonb,
    CONSTRAINT detalle_es_objeto CHECK (jsonb_typeof(detalle) = 'object'),
    CONSTRAINT detalle_tope CHECK (octet_length(detalle::text) <= 8192)
  ) ON COMMIT DROP;
  IF EXISTS (SELECT 1 FROM pg_constraint esperado
    WHERE esperado.conrelid='pg_temp.m10_0022_referencia_detalle'::regclass AND NOT EXISTS (
      SELECT 1 FROM pg_constraint actual WHERE actual.conrelid='public.reporte'::regclass
      AND actual.conname=esperado.conname AND actual.contype='c' AND actual.convalidated
      AND pg_get_constraintdef(actual.oid,false)=pg_get_constraintdef(esperado.oid,false))) THEN
    RAISE EXCEPTION '0022: garantías JSON de objeto/tamaño incompatibles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='resguardo_m10' AND
       (n.nspowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user)
        OR EXISTS (SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner))) THEN
    RAISE EXCEPTION '0022: archivo con propietario o permisos incompatibles';
  END IF;
  IF to_regclass('resguardo_m10.cuota_reporte_diaria') IS NOT NULL THEN
    IF (SELECT relkind FROM pg_class WHERE oid=to_regclass('resguardo_m10.cuota_reporte_diaria')) <> 'r'
       OR EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('resguardo_m10.cuota_reporte_diaria') AND
         (c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
          OR EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)))
       OR EXISTS (SELECT 1 FROM pg_attribute columna
         CROSS JOIN LATERAL aclexplode(columna.attacl) permiso
         JOIN pg_class c ON c.oid=columna.attrelid
         WHERE c.oid=to_regclass('resguardo_m10.cuota_reporte_diaria') AND columna.attnum>0
         AND NOT columna.attisdropped AND permiso.grantee<>c.relowner)
       OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND contype='f') THEN
      RAISE EXCEPTION '0022: archivo con estructura, propietario o permisos incompatibles';
    END IF;
    LOCK TABLE resguardo_m10.cuota_reporte_diaria IN ACCESS EXCLUSIVE MODE;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint k
      WHERE k.conrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND k.contype='p'
      AND k.convalidated AND NOT k.condeferrable AND k.conkey=ARRAY[
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=k.conrelid AND a.attname='usuario_id' AND NOT a.attisdropped),
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=k.conrelid AND a.attname='dia' AND NOT a.attisdropped)]::smallint[]) THEN
      RAISE EXCEPTION '0022: archivo con estructura incompatible (PK)';
    END IF;
    IF EXISTS (
      (SELECT attname,atttypid,atttypmod,attnotnull FROM pg_attribute WHERE attrelid='public.cuota_reporte_diaria'::regclass AND attnum>0 AND NOT attisdropped
       EXCEPT SELECT attname,atttypid,atttypmod,attnotnull FROM pg_attribute WHERE attrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND attnum>0 AND NOT attisdropped)
      UNION ALL
      (SELECT attname,atttypid,atttypmod,attnotnull FROM pg_attribute WHERE attrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND attnum>0 AND NOT attisdropped
       EXCEPT SELECT attname,atttypid,atttypmod,attnotnull FROM pg_attribute WHERE attrelid='public.cuota_reporte_diaria'::regclass AND attnum>0 AND NOT attisdropped)
    ) THEN
      RAISE EXCEPTION '0022: archivo con estructura incompatible';
    END IF;
    IF EXISTS (
      (SELECT usuario_id,dia,reportes_n,fotos_n,actualizado_en FROM public.cuota_reporte_diaria
       EXCEPT ALL SELECT usuario_id,dia,reportes_n,fotos_n,actualizado_en FROM resguardo_m10.cuota_reporte_diaria)
      UNION ALL
      (SELECT usuario_id,dia,reportes_n,fotos_n,actualizado_en FROM resguardo_m10.cuota_reporte_diaria
       EXCEPT ALL SELECT usuario_id,dia,reportes_n,fotos_n,actualizado_en FROM public.cuota_reporte_diaria)
    ) THEN
      RAISE EXCEPTION '0022: archivo de cuota divergente; se conserva sin sobrescribir';
    END IF;
  END IF;
END $$;

-- LIKE incluye tipos, CHECK, DEFAULT, PK e índices; no copia FK. No se limpia nunca el archivo.
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('resguardo_m10.cuota_reporte_diaria') IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS resguardo_m10;
    REVOKE ALL ON SCHEMA resguardo_m10 FROM PUBLIC;
    FOR r IN SELECT DISTINCT p.rolname FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a JOIN pg_roles p ON p.oid=a.grantee
      WHERE n.nspname='resguardo_m10' AND a.grantee<>n.nspowner
    LOOP EXECUTE format('REVOKE ALL ON SCHEMA resguardo_m10 FROM %I',r.rolname); END LOOP;
    CREATE TABLE resguardo_m10.cuota_reporte_diaria (LIKE public.cuota_reporte_diaria INCLUDING ALL);
    -- Las ACL por defecto del dueño podrían conceder privilegios: se revocan antes de publicar el archivo.
    REVOKE ALL ON SCHEMA resguardo_m10 FROM PUBLIC;
    REVOKE ALL ON TABLE resguardo_m10.cuota_reporte_diaria FROM PUBLIC;
    INSERT INTO resguardo_m10.cuota_reporte_diaria (usuario_id,dia,reportes_n,fotos_n,actualizado_en)
      SELECT usuario_id,dia,reportes_n,fotos_n,actualizado_en FROM public.cuota_reporte_diaria;
  END IF;
END $$;
-- Quitar cualquier grant de tabla por default privileges, sin alterar roles ni defaults globales.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT p.rolname FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a JOIN pg_roles p ON p.oid=a.grantee
    WHERE c.oid='resguardo_m10.cuota_reporte_diaria'::regclass AND a.grantee<>c.relowner
  LOOP EXECUTE format('REVOKE ALL ON TABLE resguardo_m10.cuota_reporte_diaria FROM %I',r.rolname); END LOOP;
END $$;

ALTER TABLE public.reporte ADD CONSTRAINT m10_0022_detalle_version_v1 CHECK (detalle_version=1);
COMMENT ON CONSTRAINT m10_0022_detalle_version_v1 ON public.reporte IS
  'mi_curichi:esquema=0022;almacenamiento=json;detalle_version=1';
-- IS TRUE impide que NULL lógico burle un CHECK. Ausencia opcional sí; JSON null no es la forma0020.
ALTER TABLE public.reporte ADD CONSTRAINT m10_0022_inundacion_detalle_v1 CHECK (
  categoria<>'inundacion' OR ((
    detalle ?& ARRAY['profundidad_estimada','frecuencia','causa_presunta']
    AND jsonb_typeof(detalle->'profundidad_estimada')='string'
    AND detalle->>'profundidad_estimada' IN ('tobillo','rodilla','muslo','mas_70')
    AND jsonb_typeof(detalle->'frecuencia')='string'
    AND detalle->>'frecuencia' IN ('primera_vez','ocasional','cada_lluvia_fuerte','permanente','agua_estancada')
    AND jsonb_typeof(detalle->'causa_presunta')='string'
    AND detalle->>'causa_presunta' IN ('sumidero_tapado','falta_sumidero','hundimiento_pavimento','contrapendiente','colector_saturado','desborde_cauce','desconocida')
    AND (NOT detalle ? 'sumidero_cercano' OR (jsonb_typeof(detalle->'sumidero_cercano')='string' AND detalle->>'sumidero_cercano' IN ('si','no')))
    AND (NOT detalle ? 'sumidero_estado' OR (jsonb_typeof(detalle->'sumidero_estado')='string' AND detalle->>'sumidero_estado' IN ('tapado','no_tapado')))
    AND (NOT detalle ? 'agua_brota_sumidero' OR jsonb_typeof(detalle->'agua_brota_sumidero')='boolean')
    AND detalle - ARRAY['profundidad_estimada','frecuencia','causa_presunta','sumidero_cercano','sumidero_estado','agua_brota_sumidero']='{}'::jsonb
  ) IS TRUE)
);

DROP VIEW public.reporte_inundacion;
DROP TRIGGER reporte_sincronizar_detalle ON public.reporte;
DROP FUNCTION public.reporte_sincronizar_detalle();
DROP FUNCTION public.detalle_inundacion(profundidad_estimada,frecuencia,causa_presunta,sumidero_cercano,sumidero_estado,boolean);
ALTER TABLE public.reporte DROP CONSTRAINT inundacion_campos_presentes;
ALTER TABLE public.reporte DROP CONSTRAINT no_inundacion_sin_campos;
ALTER TABLE public.reporte DROP COLUMN profundidad_estimada, DROP COLUMN frecuencia, DROP COLUMN causa_presunta,
  DROP COLUMN sumidero_cercano, DROP COLUMN sumidero_estado, DROP COLUMN agua_brota_sumidero;
DROP TYPE public.profundidad_estimada;
DROP TYPE public.frecuencia;
DROP TYPE public.causa_presunta;
DROP TYPE public.sumidero_cercano;
DROP TYPE public.sumidero_estado;
DROP TABLE public.cuota_reporte_diaria;

-- Interfaz mínima autorizada: versión/integridad, sin acceso al historial para la aplicación.
-- Fijar las cuatro definiciones verificadas de este DDL dentro de la función: no se confía
-- en nombres/comentarios ni se exige un string deparser común a motores distintos.
DO $instalar_estado$
DECLARE definiciones text;
BEGIN
  SELECT jsonb_object_agg(conname,pg_get_constraintdef(oid,false))::text INTO definiciones
    FROM pg_constraint WHERE conrelid='public.reporte'::regclass AND contype='c' AND convalidated
    AND conname IN ('detalle_es_objeto','detalle_tope','m10_0022_detalle_version_v1','m10_0022_inundacion_detalle_v1');
  EXECUTE format($funcion$
CREATE FUNCTION public.estado_esquema_m10() RETURNS TABLE(version integer,integro boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $estado$
  WITH historial AS (
    SELECT max(CASE WHEN nombre ~ '^[0-9]{4}_.+[.]sql$' THEN left(nombre,4)::integer END) AS version,
      min(CASE WHEN nombre ~ '^[0-9]{4}_.+[.]sql$' THEN left(nombre,4)::integer END) AS primera,
      count(*) AS n,count(DISTINCT left(nombre,4)) AS versiones,
      bool_and(nombre ~ '^[0-9]{4}_.+[.]sql$') AS nombres FROM public._migraciones
  )
  SELECT coalesce(h.version,0),coalesce(h.version=22 AND h.primera=1 AND h.n=22 AND h.versiones=22 AND h.nombres
    AND EXISTS(SELECT 1 FROM public._migraciones WHERE nombre='0022_contraccion_compatible.sql')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='reporte' AND c.relkind='r')
    AND NOT EXISTS(SELECT 1 FROM (VALUES
      ('id','pg_catalog.uuid',true),('geom','public.geometry',true),('geom_publico','public.geometry',false),
      ('creado_en','pg_catalog.timestamptz',true),('publicar_en','pg_catalog.timestamptz',true),
      ('actualizado_en','pg_catalog.timestamptz',true),('evento_en','pg_catalog.timestamptz',false),
      ('autor_id','pg_catalog.uuid',false),('distrito_id','pg_catalog.text',true),('unidad_vecinal_id','pg_catalog.text',true),
      ('version_capa','pg_catalog.text',false),('resolucion_flags','pg_catalog.jsonb',true),
      ('ubicacion_metodo','public.ubicacion_metodo',true),('precision_gps_m','pg_catalog.numeric',false),
      ('distancia_dispositivo_m','pg_catalog.int2',false),('ubicacion_tipo','public.ubicacion_tipo',true),
      ('descripcion','pg_catalog.text',true),('severidad_calculada','public.severidad',true),
      ('severidad_puntaje','pg_catalog.int4',true),('severidad_version','pg_catalog.int4',true),
      ('severidad_manual','public.severidad',false),('severidad_motivo','pg_catalog.text',false),
      ('estado','public.estado_reporte',true),('estado_motivo','pg_catalog.text',false),
      ('fusionado_en_id','pg_catalog.uuid',false),('punto_critico_id','pg_catalog.uuid',false),
      ('validado_por','pg_catalog.uuid',false),('validado_en','pg_catalog.timestamptz',false),('ip_hash','pg_catalog.text',false),
      ('categoria','pg_catalog.text',true),('subtipo','pg_catalog.text',false),
      ('detalle','pg_catalog.jsonb',true),('detalle_version','pg_catalog.int2',true)
    ) esperado(columna,tipo,obligatoria) WHERE NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass('public.reporte')
      AND a.attname=esperado.columna AND NOT a.attisdropped AND a.attnum>0
      AND a.atttypid=pg_catalog.to_regtype(esperado.tipo) AND a.attnotnull=esperado.obligatoria))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.reporte'::regclass AND NOT attisdropped
      AND attname IN ('profundidad_estimada','frecuencia','causa_presunta','sumidero_cercano','sumidero_estado','agua_brota_sumidero'))
    AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='public.reporte'::regclass AND convalidated AND contype='c'
      AND conname IN ('detalle_es_objeto','detalle_tope','m10_0022_detalle_version_v1','m10_0022_inundacion_detalle_v1'))=4
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(%L::jsonb) esperado(nombre,definicion)
      WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint actual
        WHERE actual.conrelid='public.reporte'::regclass AND actual.conname=esperado.nombre
        AND actual.contype='c' AND actual.convalidated
        AND pg_catalog.pg_get_constraintdef(actual.oid,false)=esperado.definicion))
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.reporte'::regclass
      AND conname='m10_0022_detalle_version_v1'
      AND pg_catalog.obj_description(oid,'pg_constraint')='mi_curichi:esquema=0022;almacenamiento=json;detalle_version=1')
    AND pg_catalog.to_regclass('public.reporte_inundacion') IS NULL
    AND pg_catalog.to_regclass('public.cuota_reporte_diaria') IS NULL
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.reporte'::regclass AND tgname='reporte_sincronizar_detalle')
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('detalle_inundacion','reporte_sincronizar_detalle'))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname IN ('profundidad_estimada','frecuencia','causa_presunta','sumidero_cercano','sumidero_estado'))
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='resguardo_m10' AND c.relname='cuota_reporte_diaria' AND c.relkind='r' AND c.relowner=n.nspowner
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('usuario_id','pg_catalog.uuid'),('dia','pg_catalog.date'),('reportes_n','pg_catalog.int2'),
        ('fotos_n','pg_catalog.int2'),('actualizado_en','pg_catalog.timestamptz')
      ) esperado(columna,tipo) WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname=esperado.columna AND NOT a.attisdropped AND a.attnum>0
        AND a.atttypid=pg_catalog.to_regtype(esperado.tipo) AND a.attnotnull))
      AND (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND NOT a.attisdropped AND a.attnum>0)=5
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p' AND k.conkey=ARRAY[
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='usuario_id' AND NOT a.attisdropped),
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='dia' AND NOT a.attisdropped)]::smallint[])
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f')
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute columna
        CROSS JOIN LATERAL pg_catalog.aclexplode(columna.attacl) permiso
        WHERE columna.attrelid=c.oid AND columna.attnum>0 AND NOT columna.attisdropped AND permiso.grantee<>c.relowner)
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner)),false)
  FROM historial h;
$estado$;
$funcion$,definiciones);
END $instalar_estado$;
REVOKE ALL ON FUNCTION public.estado_esquema_m10() FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT g.rolname FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    JOIN pg_catalog.pg_roles g ON g.oid=a.grantee
    WHERE p.oid='public.estado_esquema_m10()'::regprocedure AND a.grantee<>p.proowner
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.estado_esquema_m10() FROM %I',r.rolname); END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='curichi_api') THEN
    GRANT EXECUTE ON FUNCTION public.estado_esquema_m10() TO curichi_api;
  END IF;
END $$;
