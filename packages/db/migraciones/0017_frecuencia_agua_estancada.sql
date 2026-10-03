-- Migración 0017 — Añadir 'agua_estancada' al enum frecuencia.
-- Se añade el valor 'agua_estancada' al tipo frecuencia para reportes donde el agua queda retenida/estancada.

ALTER TYPE frecuencia ADD VALUE IF NOT EXISTS 'agua_estancada';
