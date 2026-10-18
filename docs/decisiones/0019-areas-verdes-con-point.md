# ADR 0019 — Áreas verdes con `Point`

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- `Point`, igual que las demás categorías.
- Sin `Polygon`, `LineString`, dibujo libre, delimitación ni detección de parques.
- La extensión se responde con un atributo («¿Cuánto ocupa?»).
- Una geometría no puntual futura requiere su propio ADR.

**Consecuencias.** Reutiliza PIP, jitter, radio de 60 m, DBSCAN y clusters sin cambios.
