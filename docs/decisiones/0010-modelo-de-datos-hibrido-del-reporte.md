# ADR 0010 — Modelo de datos híbrido del reporte

- **Estado:** aceptada. El *spike* medido (1 M × 4 categorías) se hace al empezar M2.
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Contexto.** `reporte_inundacion` y 7 `ENUM` de dominio (dos ya rehechos como `_v2`).

**Decisión.** Opción **D** (13.2 §4–§5):

- tabla `reporte` con lo común **tipado**;
- `categoria` (FK al catálogo) y `subtipo`;
- `detalle jsonb` + `detalle_version`, con `CHECK` de forma;
- validación con el Zod **estricto** de la categoría (api-core es el único escritor);
- `severidad_*` comunes (bandas), con `severidad_version` por categoría;
- `punto_critico.categoria`.

**Consecuencias.**

- Sin migración por categoría nueva.
- Un campo del JSON se «promueve» a columna solo si se mide la necesidad.

**Alternativas descartadas.** Tabla ancha (A), tabla por categoría (B), solo JSONB (C).

**Falta.** `EXPLAIN` con 1 M de filas × 4 categorías; `btree_gist`.
