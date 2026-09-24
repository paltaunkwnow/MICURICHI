-- Privilegios mínimos para los roles de aplicación (CLAUDE.md §13, auditoría de seguridad).
--
-- EL PROBLEMA QUE ESTO CIERRA
--
-- api-core y geo-service se conectaban los dos con `curichi`, que era SUPERUSER con CREATEROLE,
-- CREATEDB y BYPASSRLS. Comprobado en la base local:
--
--   ROL: curichi super=true createrole=true createdb=true bypassrls=true login=true
--
-- Con eso, cualquier ejecución de SQL no prevista dejaba de ser "leer de más" para pasar a ser
-- control del servidor: crear roles, leer y escribir archivos del contenedor con COPY, o ejecutar
-- órdenes del sistema con COPY ... PROGRAM. Y geo-service, que por contrato (§4.6) es de solo
-- lectura, tenía permiso para borrar la tabla de reportes.
--
-- Los privilegios se conceden UNO A UNO y por tabla. No se usa `GRANT ... ON ALL TABLES` ni
-- `ALTER DEFAULT PRIVILEGES` a propósito: los dos hacen que una tabla futura quede accesible sin
-- que nadie lo decida, y aquí se prefiere que una tabla nueva empiece sin permisos y falle a la
-- vista. El test `privilegios.test.ts` comprueba que esta matriz es exactamente la que hay.
--
-- La migración se salta a sí misma si los roles no existen, porque las pruebas y el modo local sin
-- Docker corren sobre PGlite, que es de un solo usuario y no tiene roles. Eso NO es un fallo
-- silencioso en producción: api-core y geo-service comprueban al arrancar que su usuario no es
-- superusuario y se niegan a servir si lo es (`verificarPrivilegios`).

DO $$
DECLARE
  hay_api boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_api');
  hay_geo boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curichi_geo');
BEGIN
  IF NOT hay_api AND NOT hay_geo THEN
    RAISE NOTICE 'Sin roles de aplicación (base de un solo usuario): no se conceden privilegios.';
    RETURN;
  END IF;

  IF hay_api THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public, geo TO curichi_api';

    -- reporte_inundacion: crea el reporte, lo modera, le asigna punto crítico y le rellena
    -- geom_publico. No borra nunca: un reporte se rechaza, no se elimina (§7.3).
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON reporte_inundacion TO curichi_api';

    -- reporte_foto: sube (INSERT), asocia al reporte (UPDATE) y el mantenimiento borra las
    -- huérfanas a las 24 h (DELETE, §13 retención).
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON reporte_foto TO curichi_api';

    -- auditoria: SOLO escribe. Que el runtime no pueda leer ni modificar su propio registro de
    -- auditoría es justamente el punto de tener uno.
    EXECUTE 'GRANT INSERT ON auditoria TO curichi_api';

    -- usuario: lee para autenticar y actualiza el hash al migrarlo de scrypt a Argon2id. No crea
    -- ni borra cuentas: eso es administración, no runtime.
    EXECUTE 'GRANT SELECT, UPDATE ON usuario TO curichi_api';

    -- sesion: ciclo completo (crear, refrescar ultimo_uso_en, cerrar, caducar).
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON sesion TO curichi_api';

    -- intento_login: freno de fuerza bruta; el mantenimiento limpia los vencidos.
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON intento_login TO curichi_api';
    EXECUTE 'GRANT USAGE ON SEQUENCE intento_login_id_seq TO curichi_api';

    -- idempotencia: reclama la clave, anota el resultado y el mantenimiento la caduca.
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON idempotencia TO curichi_api';

    -- punto_critico: el recálculo disuelve los grupos afectados y los vuelve a insertar (§9.2).
    -- No necesita UPDATE: nunca modifica una fila, la rehace.
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON punto_critico TO curichi_api';

    -- Capas: solo lectura. Las escribe el ETL con el rol dueño (§4.7).
    EXECUTE 'GRANT SELECT ON geo.distrito_municipal, geo.unidad_vecinal, geo.manzana TO curichi_api';
    EXECUTE 'GRANT SELECT ON geo.distrito_municipal_vigente, geo.unidad_vecinal_vigente, geo.manzana_vigente TO curichi_api';

    -- capa_version: lee el catálogo y marca cuál está vigente (POST /admin/capas/:id/activar).
    EXECUTE 'GRANT SELECT, UPDATE ON geo.capa_version TO curichi_api';
  END IF;

  IF hay_geo THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public, geo TO curichi_geo';

    -- geo-service es de SOLO LECTURA por contrato (§4.6). Esta es la lista completa de lo que
    -- consulta: capas y vistas vigentes, el agregado por unidad vecinal y los puntos críticos.
    EXECUTE 'GRANT SELECT ON geo.distrito_municipal, geo.unidad_vecinal, geo.manzana TO curichi_geo';
    EXECUTE 'GRANT SELECT ON geo.distrito_municipal_vigente, geo.unidad_vecinal_vigente, geo.manzana_vigente TO curichi_geo';
    EXECUTE 'GRANT SELECT ON geo.capa_version TO curichi_geo';
    EXECUTE 'GRANT SELECT ON reporte_inundacion TO curichi_geo';
    EXECUTE 'GRANT SELECT ON punto_critico TO curichi_geo';
  END IF;

  -- Ni uno ni otro tocan `_migraciones`: el control de esquema es del dueño. Tampoco `usuario`
  -- en el caso de geo-service, ni `sesion`, ni `auditoria`, ni `reporte_foto`.
END
$$;
