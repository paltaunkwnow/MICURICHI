-- Migración 0009 — cuentas ciudadanas, cuota de reporte por cuenta y privilegios por columna.
--
-- QUÉ CAMBIA EN EL PRODUCTO
--
-- Hasta aquí el reporte era anónimo: `autor_id` podía quedar en NULL y cualquiera podía hacer
-- POST /api/v1/reportes. El límite era por IP, y una IP dinámica lo vuelve papel mojado: basta
-- renovar la conexión para volver a empezar. A partir de esta migración, crear un reporte exige
-- una cuenta, y la cuenta es lo que se limita.
--
-- Ver el mapa NO cambia: sigue sin necesitar cuenta ni cookie (auditoría A-01).
--
-- 1. `usuario.ultimo_reporte_en`
--
-- Marca del último reporte ACEPTADO de esa cuenta. Es el estado de la cuota de una hora, y vive
-- en la propia fila del usuario para que consumirla sea un solo UPDATE condicional:
--
--   UPDATE usuario SET ultimo_reporte_en = now()
--    WHERE id = $1 AND (ultimo_reporte_en IS NULL OR ultimo_reporte_en <= now() - interval)
--
-- Esa forma es atómica sin locks explícitos. En READ COMMITTED, si dos transacciones intentan el
-- mismo UPDATE a la vez, la segunda espera al commit de la primera y entonces **vuelve a evaluar
-- el WHERE contra la fila nueva**: ya no lo cumple, actualiza 0 filas y su reporte se rechaza.
-- La alternativa ingenua (SELECT, mirar la hora, INSERT) no da esa garantía: las dos leerían el
-- mismo estado anterior y las dos insertarían.
--
-- No se usa una tabla aparte de cuotas porque la fila del usuario ya existe siempre y es la
-- unidad natural de serialización; una tabla nueva solo añadiría una fila que crear y mantener.
--
-- 2. Privilegios POR COLUMNA sobre `usuario`
--
-- Ahora api-core escribe en `usuario` desde una ruta pública (el registro). Con el GRANT de tabla
-- entera que tenía, cualquier ejecución de SQL no prevista en ese camino podía cambiar el `rol`
-- de una cuenta: una escalada a admin a un INSERT de distancia. Con privilegios por columna, la
-- base de datos rechaza la escritura aunque el código la intente:
--
--   INSERT → solo (email, nombre, password_hash); `rol` toma su DEFAULT 'ciudadano'
--   UPDATE → solo (password_hash, ultimo_reporte_en)
--
-- Es decir: el registro NO PUEDE crear un técnico ni un administrador, y no porque el código sea
-- cuidadoso, sino porque no tiene permiso. Crear o promover cuentas técnicas es administración y
-- se hace con el rol dueño, fuera del proceso que atiende peticiones.

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS ultimo_reporte_en timestamptz;

COMMENT ON COLUMN usuario.ultimo_reporte_en IS
  'Último reporte aceptado de esta cuenta. Estado de la cuota de 1 reporte por hora (§13).';

-- Igual que la 0008: si no hay roles de aplicación (PGlite, base de un solo usuario), no hay nada
-- que conceder. Los servicios comprueban sus privilegios al arrancar y no arrancan en producción
-- si les sobra algo, así que saltarse esto aquí no puede pasar inadvertido allí.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api') THEN
    RAISE NOTICE 'Sin rol curichi_api: no se ajustan privilegios de usuario.';
    RETURN;
  END IF;

  -- Se retira el UPDATE de tabla entera que concedía la 0008 y se devuelve acotado a columnas.
  EXECUTE 'REVOKE UPDATE ON usuario FROM curichi_api';
  EXECUTE 'GRANT UPDATE (password_hash, ultimo_reporte_en) ON usuario TO curichi_api';

  -- Alta de cuenta ciudadana. Sin `rol` y sin `activo` en la lista: los dos se quedan con su
  -- DEFAULT y ninguna petición puede moverlos.
  EXECUTE 'GRANT INSERT (email, nombre, password_hash) ON usuario TO curichi_api';
END
$$;
