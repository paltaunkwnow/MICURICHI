-- Migración 0010 — quitar cuatro campos del reporte y pasar la severidad a la v2. Parte 4.
--
-- QUÉ CAMBIA EN EL PRODUCTO (corrida SDD 2026-09-25 «quitar campos del reporte»)
--
-- El reporte deja de pedir y guardar la manzana, la dirección aproximada, la duración y la
-- afectación. La severidad pasa a depender solo del tirante (T) y la frecuencia (F):
--
--   puntaje = 2·T + F  (rango 3 … 12)
--   bandas  3–4 baja · 5–7 media · 8–10 alta · 11–12 crítica
--   E1: T = 4 (más de 70 cm)  → crítica
--   E3: F = 4 (permanente)    → mínimo media
--   (E2 desaparece: dependía de la afectación)
--
-- 1. Recálculo de la severidad de los reportes que ya existen (decisión P-1, opción A).
--
-- Se hace ANTES de quitar las columnas y en SQL, en esta misma transacción. La fórmula es la de
-- `calcularSeveridad` de packages/contracts (SEVERIDAD_VERSION = 2); si allí cambia, aquí NO se
-- sigue sola: una v3 es otra migración. `severidad_manual` y su motivo NO se tocan: son decisión
-- de un técnico y la severidad efectiva sigue siendo COALESCE(manual, calculada).
--
-- Solo se recalculan las filas con versión < 2, así que volver a ejecutar este archivo (el runner
-- ya lo impide con _migraciones) no reescribe filas creadas después por api-core con la v2.
--
-- 2. `punto_critico.severidad_max` se deriva de la severidad efectiva de sus reportes. Si no se
-- actualiza aquí, quedaría con la v1 hasta el próximo recálculo y el mapa mostraría una
-- severidad que ya no corresponde a ninguno de sus reportes.
--
-- 3. Columnas y tipos. `geo.manzana`, `geo.manzana_vigente` y sus privilegios (0008) SE
-- CONSERVAN: la manzana sigue siendo capa de render; solo deja de anotarse en el reporte.
-- Ninguna vista ni función depende de las cuatro columnas; los privilegios por columna que
-- hubiera sobre ellas se van con la columna.

UPDATE reporte_inundacion r
   SET severidad_puntaje = c.puntaje,
       severidad_calculada = (
         CASE
           WHEN r.tirante_estimado = 'mas_70' THEN 'critica'
           WHEN c.puntaje >= 11 THEN 'critica'
           WHEN c.puntaje >= 8 THEN 'alta'
           WHEN c.puntaje >= 5 THEN 'media'
           WHEN r.frecuencia = 'permanente' THEN 'media'
           ELSE 'baja'
         END
       )::severidad,
       severidad_version = 2
  FROM (
    SELECT id,
           2 * (CASE tirante_estimado
                  WHEN 'tobillo' THEN 1 WHEN 'rodilla' THEN 2 WHEN 'muslo' THEN 3 ELSE 4 END)
           + (CASE frecuencia
                WHEN 'primera_vez' THEN 1 WHEN 'ocasional' THEN 2
                WHEN 'cada_lluvia_fuerte' THEN 3 ELSE 4 END) AS puntaje
      FROM reporte_inundacion
  ) c
 WHERE c.id = r.id
   AND r.severidad_version < 2;

UPDATE punto_critico pc
   SET severidad_max = m.severidad_max
  FROM (
    SELECT punto_critico_id, max(COALESCE(severidad_manual, severidad_calculada)) AS severidad_max
      FROM reporte_inundacion
     WHERE punto_critico_id IS NOT NULL AND estado IN ('validado', 'resuelto')
     GROUP BY punto_critico_id
  ) m
 WHERE m.punto_critico_id = pc.id;

-- Todo reporte nuevo desde acá nace con severidad v2; sin este DEFAULT, un INSERT que no
-- mencione la columna (como hacían los seeds y bancos de prueba escritos para v1) quedaría en
-- NULL o en el default anterior y el recálculo de arriba no lo volvería a tocar.
ALTER TABLE reporte_inundacion ALTER COLUMN severidad_version SET DEFAULT 2;

ALTER TABLE reporte_inundacion DROP COLUMN IF EXISTS manzana_id;
ALTER TABLE reporte_inundacion DROP COLUMN IF EXISTS direccion_aprox;
ALTER TABLE reporte_inundacion DROP COLUMN IF EXISTS duracion_estimada;
ALTER TABLE reporte_inundacion DROP COLUMN IF EXISTS afectacion;

-- Sin CASCADE a propósito: si algo fuera de reporte_inundacion todavía usara estos tipos, la
-- migración debe fallar y avisarlo, no borrar esa columna en silencio.
DROP TYPE IF EXISTS duracion_estimada;
DROP TYPE IF EXISTS afectacion;
