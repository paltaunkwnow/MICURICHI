# ADR 0008 — Ampliación de la Misión 1 a plataforma multitemática

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Contexto.**

- CLAUDE.md §3 y la regla de oro 11 cerraban la Misión 1 en reportes de inundación.
- El usuario quiere una sola plataforma para Inundaciones, Baches, Áreas verdes y Basura.

**Decisión.**

- La Misión 1 pasa a ser una **plataforma municipal multitemática de reportes georreferenciados**,
  con esas 4 categorías iniciales sobre un mismo núcleo.
- La arquitectura se prepara para las 4.
- La implementación es incremental (roadmap de 14 §5).
- **No** hay sistemas clonados.

**Consecuencias.**

- Se editan `CLAUDE.md` §1, §3 y §15 en M0, con el texto de 14 §4.
- §2, §7 y §13 se editan cuando aterricen M2 y M3.
- El resto del backlog (§15) sigue fuera de alcance.

**Alternativas descartadas.** Cuatro sistemas independientes, y mantener la misión solo para
inundación.
