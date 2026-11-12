# ADR 0015 — Prioridad entre URL y categoría guardada

- **Estado:** aceptada. Con esta ADR se aprobaron la forma pública de la URL y que la categoría efectiva (también la de un enlace) cuenta como «última usada».
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- **Prioridad:** `?categoria` válida y activa → guardada válida y activa → Inundaciones.
- **Slug interno:** `inundacion`, `bache`, `area_verde`, `basura`.
- **La URL acepta alias:** `baches`, `areas-verdes`, `area-verde`, mayúsculas, sin tildes. Se
  normaliza y se reescribe con `replaceState` a la forma pública.
- **Forma pública:** `inundacion`, `bache`, `area-verde`, `basura` (aprobada con esta ADR).
- **URL inválida o inactiva:** se ignora, se corrige y se anuncia.
- **La categoría efectiva se guarda como «última usada»**, también la que llega por un enlace (aprobado con esta ADR; se descarta guardar solo lo elegido en el selector).
- Sin parámetro, se agrega la efectiva a la URL.
- La lógica es una función pura `resolverCategoriaInicial` en `contracts`, probada en M1.3.

**Precisión del 2026-10-10** (decisión D1 del usuario al aprobar el plan de M4,
`docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/plan.md`):

- `?categoria=` se escribe en la URL **solo si hay dos o más categorías activas**. En ese caso rige
  todo lo de arriba: se agrega la efectiva si falta y se normalizan los alias.
- Con **una sola** activa, la URL queda como antes (`/`, `/reportar`).
  - Un `?categoria=` que llegue se normaliza y se **quita** con `replaceState`.
  - Si era inválido o inactivo, se anuncia.
- Así, mientras haya una sola categoría, nada cambia a la vista (14 §2.4).
