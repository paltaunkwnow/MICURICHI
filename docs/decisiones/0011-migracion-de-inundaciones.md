# ADR 0011 — Migración de inundaciones

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- **Expandir → convivir → contraer** (13.3 §3).
- `RENAME reporte_inundacion → reporte`, que conserva ID, FK de fotos e idempotencia, índices y
  *grants*.
- Columnas nuevas y copia de los campos de inundación al `detalle`.
- **Vista `reporte_inundacion` filtrada a inundación** (`WITH CHECK OPTION`), para que el código viejo
  no se contamine.
- Ensayo en una copia con conteos y sumas, respaldo restaurado y vuelta atrás probada mientras no haya
  otras categorías.
- Contracción (M10) tras una ventana medida.

**Alternativas descartadas.** Tabla nueva y copia; renombrar sin vista; *big bang*.
