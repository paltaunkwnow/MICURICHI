-- Reversa0022 / ADR0026:22→21 sin perder categorías, archivo ni datos creados en22.
-- Requiere recuperación coordinada del release21; este SQL no arranca ni detiene servicios.
BEGIN;
SET LOCAL statement_timeout=0;
SELECT pg_advisory_xact_lock(4022);
SET LOCAL lock_timeout=10000;
DO $$
BEGIN
  IF (SELECT max(nombre) FROM public._migraciones) IS DISTINCT FROM '0022_contraccion_compatible.sql'
     OR to_regclass('public.reporte_inundacion') IS NOT NULL OR to_regclass('public.cuota_reporte_diaria') IS NOT NULL
     OR to_regclass('resguardo_m10.cuota_reporte_diaria') IS NULL
     OR to_regprocedure('public.estado_esquema_m10()') IS NULL THEN
    RAISE EXCEPTION 'reversa0022: esquema/version incompatible';
  END IF;
END $$;
LOCK TABLE public.reporte, public.usuario, resguardo_m10.cuota_reporte_diaria IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.estado_esquema_m10() WHERE version=22 AND integro IS TRUE) THEN
    RAISE EXCEPTION 'reversa0022: integridad de esquema incompatible';
  END IF;
  IF EXISTS (SELECT 1 FROM resguardo_m10.cuota_reporte_diaria c LEFT JOIN public.usuario u ON u.id=c.usuario_id WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'reversa0022: faltan usuarios requeridos por la cuota archivada; no se inventan ni se pierden filas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reporte WHERE detalle_version<>1)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reporte'::regclass AND conname='m10_0022_inundacion_detalle_v1' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reporte'::regclass AND conname='m10_0022_detalle_version_v1' AND convalidated) THEN
    RAISE EXCEPTION 'reversa0022: version o garantías JSON no reversibles';
  END IF;
  -- Antes de crear ENUM/planos: reconstruir exactamente el JSON que preserva el release21.
  IF EXISTS (SELECT 1 FROM public.reporte WHERE categoria='inundacion' AND detalle IS DISTINCT FROM
    jsonb_strip_nulls(jsonb_build_object('profundidad_estimada',detalle->'profundidad_estimada',
      'frecuencia',detalle->'frecuencia','causa_presunta',detalle->'causa_presunta',
      'sumidero_cercano',detalle->'sumidero_cercano','sumidero_estado',detalle->'sumidero_estado',
      'agua_brota_sumidero',detalle->'agua_brota_sumidero'))) THEN
    RAISE EXCEPTION 'reversa0022: detalle JSON no reversible exactamente';
  END IF;
END $$;

DROP FUNCTION public.estado_esquema_m10();
CREATE TYPE public.profundidad_estimada AS ENUM ('tobillo','rodilla','muslo','mas_70');
CREATE TYPE public.frecuencia AS ENUM ('primera_vez','ocasional','cada_lluvia_fuerte','permanente','agua_estancada');
CREATE TYPE public.causa_presunta AS ENUM ('sumidero_tapado','falta_sumidero','hundimiento_pavimento','contrapendiente','colector_saturado','desborde_cauce','desconocida');
CREATE TYPE public.sumidero_cercano AS ENUM ('si','no');
CREATE TYPE public.sumidero_estado AS ENUM ('tapado','no_tapado');
ALTER TABLE public.reporte ADD COLUMN profundidad_estimada public.profundidad_estimada,
  ADD COLUMN frecuencia public.frecuencia, ADD COLUMN causa_presunta public.causa_presunta,
  ADD COLUMN sumidero_cercano public.sumidero_cercano, ADD COLUMN sumidero_estado public.sumidero_estado,
  ADD COLUMN agua_brota_sumidero boolean;
UPDATE public.reporte SET profundidad_estimada=(detalle->>'profundidad_estimada')::public.profundidad_estimada,
  frecuencia=(detalle->>'frecuencia')::public.frecuencia, causa_presunta=(detalle->>'causa_presunta')::public.causa_presunta,
  sumidero_cercano=(detalle->>'sumidero_cercano')::public.sumidero_cercano,
  sumidero_estado=(detalle->>'sumidero_estado')::public.sumidero_estado,
  agua_brota_sumidero=(detalle->>'agua_brota_sumidero')::boolean WHERE categoria='inundacion';
ALTER TABLE public.reporte ALTER COLUMN causa_presunta SET DEFAULT 'desconocida';
ALTER TABLE public.reporte ADD CONSTRAINT inundacion_campos_presentes CHECK (
  categoria<>'inundacion' OR (profundidad_estimada IS NOT NULL AND frecuencia IS NOT NULL AND causa_presunta IS NOT NULL));
ALTER TABLE public.reporte ADD CONSTRAINT no_inundacion_sin_campos CHECK (
  categoria='inundacion' OR (profundidad_estimada IS NULL AND frecuencia IS NULL AND causa_presunta IS NULL
    AND sumidero_cercano IS NULL AND sumidero_estado IS NULL AND agua_brota_sumidero IS NULL));
ALTER TABLE public.reporte DROP CONSTRAINT m10_0022_inundacion_detalle_v1;
ALTER TABLE public.reporte DROP CONSTRAINT m10_0022_detalle_version_v1;

CREATE FUNCTION public.detalle_inundacion(profundidad_estimada public.profundidad_estimada,
  frecuencia public.frecuencia,causa_presunta public.causa_presunta,sumidero_cercano public.sumidero_cercano,
  sumidero_estado public.sumidero_estado,agua_brota_sumidero boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('profundidad_estimada',profundidad_estimada,'frecuencia',frecuencia,
    'causa_presunta',causa_presunta,'sumidero_cercano',sumidero_cercano,'sumidero_estado',sumidero_estado,
    'agua_brota_sumidero',agua_brota_sumidero));
$$;
REVOKE EXECUTE ON FUNCTION public.detalle_inundacion(profundidad_estimada,frecuencia,causa_presunta,sumidero_cercano,sumidero_estado,boolean) FROM PUBLIC;
CREATE FUNCTION public.reporte_sincronizar_detalle() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.categoria='inundacion' THEN
    NEW.detalle:=detalle_inundacion(NEW.profundidad_estimada,NEW.frecuencia,NEW.causa_presunta,NEW.sumidero_cercano,NEW.sumidero_estado,NEW.agua_brota_sumidero);
    NEW.detalle_version:=1;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.reporte_sincronizar_detalle() FROM PUBLIC;
CREATE TRIGGER reporte_sincronizar_detalle BEFORE INSERT OR UPDATE ON public.reporte
  FOR EACH ROW EXECUTE FUNCTION public.reporte_sincronizar_detalle();
CREATE VIEW public.reporte_inundacion WITH (security_invoker=true) AS
  SELECT * FROM public.reporte WHERE categoria='inundacion' WITH CASCADED CHECK OPTION;
REVOKE ALL ON TABLE public.reporte_inundacion FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT p.oid::regprocedure AS funcion,g.rolname FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE p.oid IN ('public.detalle_inundacion(profundidad_estimada,frecuencia,causa_presunta,sumidero_cercano,sumidero_estado,boolean)'::regprocedure,
      'public.reporte_sincronizar_detalle()'::regprocedure) AND a.grantee<>p.proowner
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',r.funcion,r.rolname); END LOOP;
END $$;

CREATE TABLE public.cuota_reporte_diaria (
  usuario_id uuid NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,
  dia date NOT NULL,
  reportes_n smallint NOT NULL DEFAULT 0 CONSTRAINT cuota_reportes_no_negativo CHECK(reportes_n>=0),
  fotos_n smallint NOT NULL DEFAULT 0 CONSTRAINT cuota_fotos_no_negativo CHECK(fotos_n>=0),
  actualizado_en timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(usuario_id,dia)
);
-- CREATE hereda defaults ajenos a0021: acotar solo los objetos recreados y conceder mínimos.
REVOKE ALL ON TABLE public.cuota_reporte_diaria FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT c.oid::regclass AS objeto,p.rolname FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a JOIN pg_roles p ON p.oid=a.grantee
    WHERE c.oid IN ('public.cuota_reporte_diaria'::regclass,'public.reporte_inundacion'::regclass) AND a.grantee<>c.relowner
  LOOP EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',r.objeto,r.rolname); END LOOP;
END $$;
CREATE INDEX cuota_reporte_diaria_dia ON public.cuota_reporte_diaria(dia);
INSERT INTO public.cuota_reporte_diaria (usuario_id,dia,reportes_n,fotos_n,actualizado_en)
  SELECT usuario_id,dia,reportes_n,fotos_n,actualizado_en FROM resguardo_m10.cuota_reporte_diaria;
COMMENT ON TABLE public.cuota_reporte_diaria IS
  'Cupo diario por cuenta (contrato 0.10.0): reportes y fotos del día calendario de la ciudad (ZONA_HORARIA). El mantenimiento borra los días anteriores.';
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='curichi_api') THEN
    GRANT SELECT,INSERT,UPDATE ON public.reporte_inundacion TO curichi_api;
    GRANT EXECUTE ON FUNCTION public.detalle_inundacion(profundidad_estimada,frecuencia,causa_presunta,sumidero_cercano,sumidero_estado,boolean) TO curichi_api;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.cuota_reporte_diaria TO curichi_api;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='curichi_geo') THEN
    GRANT SELECT ON public.reporte_inundacion TO curichi_geo;
  END IF;
END $$;
DELETE FROM public._migraciones WHERE nombre='0022_contraccion_compatible.sql';
COMMIT;
