-- Init del contenedor PostGIS. Se ejecuta UNA sola vez, al crear el volumen (docker-entrypoint-initdb.d).
-- Aquí van SOLO extensiones y roles (CLAUDE.md §5.1).
-- Esquemas, tablas, índices y vistas van SIEMPRE por migración en packages/db (Parte 4).
CREATE EXTENSION IF NOT EXISTS postgis;
