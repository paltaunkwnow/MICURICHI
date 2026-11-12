# ADR 0014 — Categoría inicial persistida en el dispositivo

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- Al entrar se muestra la **última categoría usada en ese dispositivo**.
- Si no hay ninguna guardada, o la guardada ya no está activa: Inundaciones. Si Inundaciones estuviera
  inactiva, la primera activa.
- **Nunca** se abre una categoría inactiva.
- **Mecanismo:**
  - `localStorage`, clave `micurichi.mapa.categoria`, valor `{v:1, slug}`;
  - lectura síncrona dentro de `try/catch`;
  - validada contra `categorias_activas`;
  - no viaja al servidor ni se guarda en la cuenta;
  - solo el mapa público la usa.

**Alternativas descartadas** (14 §2.1):

- IndexedDB: asíncrona, excesiva;
- `sessionStorage`: no sobrevive al cerrar;
- cookie: viaja al servidor;
- la cuenta: decisión del usuario.
