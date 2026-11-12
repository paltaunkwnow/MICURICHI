# ADR 0009 — Arquitectura núcleo + categorías y registro de categorías

- **Estado:** aceptada. Las categorías activas se fijan en el catálogo de la base (se descarta la variable de entorno).
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Contexto.**

- La mitad del código ya es genérica.
- El dominio de inundación está en 44 archivos fuente (13.2 §2).

**Decisión.**

- Núcleo **en los paquetes actuales**: `contracts`, `db`, `api-core`, `geo-service`, apps. No se crea
  `packages/core`.
- Cada categoría es una **`DefinicionCategoria`** en `packages/contracts/src/categorias/<slug>/`:
  - textos, icono (nombre) y colores;
  - esquema Zod del detalle;
  - subtipos y preguntas;
  - severidad versionada;
  - filtros con alcance;
  - radio de recurrencia;
  - regla de cupo;
  - campos públicos y de exportación;
  - avisos;
  - tipo de geometría.
- Las categorías **activas** por instalación las fija el catálogo `categoria` en la base, activado por
  el admin con auditoría [alternativa: variable de entorno, M0.4].
- **Sin `if (categoria === …)`** en el núcleo, salvo los componentes especiales registrados.

**Consecuencias.**

- Una 5.ª categoría = 5–8 archivos nuevos, 2–3 líneas de registro y 0 cambios en el núcleo.
- Lo prueba la categoría sintética de M1.3.

**Alternativas descartadas.** `packages/core` nuevo; una definición solo en la base; `if` dispersos.
