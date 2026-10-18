# ADR 0013 — Un solo mapa con datos por categoría

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- Una instancia de MapLibre.
- Cambiar de categoría **cambia los datos de la fuente** (consulta con `categoria` + `setData`), nunca
  un filtro de capa: los clusters se calculan en la fuente.
- Caché por categoría (TanStack Query).
- **Nunca** se muestran datos de la categoría anterior mientras carga.
- Agregados y puntos críticos, por categoría.
- Sin conteos por categoría en el mapa público (§8.2 del manual).

**Alternativas descartadas.** Cuatro mapas; un mapa con todas mezcladas filtradas por capa.
