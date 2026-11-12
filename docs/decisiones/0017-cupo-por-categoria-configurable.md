# ADR 0017 — Cupo de reportes como política configurable

- **Estado:** aceptada. Con esta ADR se aprobó que la demora de publicación use el contador de la categoría. **Cupo de fotos decidido el 2026-10-08:** 12 por cuenta y por día, **global** (al aprobar el plan de M2).
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- `ReglaCupo { id, ambito, ventana, limite }` en `contracts`. La política inicial es
  `cuenta+categoria`, `dia_local`, 3.
- El límite se puede reemplazar por categoría y por instalación.
- **En la base:** contador genérico `cupo_contador (usuario_id, clave, ventana_inicio, n)` con *upsert*
  atómico por regla, dentro de la transacción del reporte. Reemplaza a `cuota_reporte_diaria` en M10.
- `/auth/yo` con `cupos` por categoría.
- `429 CUOTA_DE_REPORTES` con `categoria`.
- El número no se repite en el código: sale de la regla. Hoy ya sale de un solo `CONFIG_DOMINIO`
  [CONFIRMADO POR CÓDIGO].

**Decidido después:**

- **demora de publicación**: por el contador de la categoría (aprobado con esta ADR);
- **cupo de fotos**: **12 por cuenta y por día, global**, sumando todas las categorías (2026-10-08). En `cupo_contador` es la regla `ámbito cuenta`, clave `fotos:cuenta` (M3). Se descartó 12 por categoría: hasta 48 fotos por cuenta y por día, cuatro veces más disco y moderación.

**Consecuencias.**

- Hasta 12 reportes por día por cuenta.
- Hasta 4× más carga de moderación.
- El límite por IP no cambia.

**Alternativas descartadas.** Cupo global (era la recomendación anterior); número fijo en el código.
