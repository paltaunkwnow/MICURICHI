# ADR 0016 — Reinicio de filtros al cambiar de categoría

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- **Se conservan** (globales): centro, zoom y `bbox`; zona elegida (distrito o UV); capa de fondo.
- **Se reinician** (de categoría): severidad, subtipo, filtros propios de la definición, punto crítico
  elegido.
- **Se limpian:** selección, hoja de detalle y panel de filtros.
- Cada `FiltroDef` declara `alcance: 'global' | 'categoria'`.
- La URL pierde los filtros de categoría.

Detalle en 14 §2.3.
