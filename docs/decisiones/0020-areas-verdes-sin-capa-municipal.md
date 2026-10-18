# ADR 0020 — Áreas verdes sin dependencia de una capa municipal

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- Áreas verdes usa el mapa base y las capas actuales (distritos, UV, manzanas).
- No espera ni consulta una capa de parques.
- `area_ref` por PIP (antes M11) **pasa al backlog**. Cuando haya una capa oficial, el ETL actual
  puede cargarla y un ADR decide su uso.
