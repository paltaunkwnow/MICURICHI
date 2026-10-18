# ADR 0021 — Formularios por categoría

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- **4 pasos fijos**:
  1. ubicación (núcleo);
  2. **«Qué pasa»** (categoría);
  3. foto y descripción (núcleo);
  4. revisión (núcleo, con filas de la categoría).
- El paso 2 es **declarativo** (preguntas de la definición, dibujadas por un renderizador común).
- **Componentes especiales registrados** solo donde haga falta: el paso 2 actual de inundación.
- El borrador guarda `categoria` y `detalle`.
- «Categoría: X · Cambiar» en el paso 1, sin perder la ubicación.

**Alternativas descartadas.** Un formulario a mano por categoría; un constructor de formularios
genérico guardado en la base.
