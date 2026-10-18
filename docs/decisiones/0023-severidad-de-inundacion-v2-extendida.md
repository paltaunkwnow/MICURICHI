# ADR 0023 — Severidad de inundación: «v2 extendida» (D3)

- **Estado:** aceptada.
- **Fecha:** 2026-10-08
- **Decide:** el usuario, al aprobar el plan de M2 (`docs/sdd/2026-10-08-base-multicategoria/plan.md`), eligiendo la opción recomendada.
- **Origen:** pendiente D3 de `docs/revision/2026-10-03-mapeo-y-pruebas.md`; CLAUDE.md §9.1 y §16.

**Contexto.**

- La migración 0017 sumó la frecuencia `agua_estancada` (F = 5) y el puntaje pasó de 3–12 a 3–13.
- No se subió `severidad_version` (sigue en 2) ni se anotó en el CHANGELOG de `contracts`.
- Las etiquetas de `permanente` y `cada_lluvia_fuerte` cambiaron sin migrar datos.

**Decisión.**

- Se documenta como **«v2 extendida»**: `severidad_version` sigue en **2** y no se tocan datos.
- Razón: para toda combinación anterior a la 0017, el puntaje y la banda no cambiaron
  (`puntaje = 2·P + F`, mismos cortes y mismo escalamiento). La v2 extendida solo suma entradas nuevas.
- Los reportes cargados antes del cambio de etiquetas guardan el mismo valor de enum; el texto que vio
  quien reportó era el de entonces. Se acepta como limitación del dato.
- Con la plataforma multitemática (ADR 0010), `severidad_version` es la versión del modelo **de su
  categoría**: inundación v2; cada categoría nueva arranca en su propia v1.

**Consecuencias.**

- La migración 0020 no recalcula severidad.
- La próxima versión de `contracts` que toque la severidad (o la de M3, lo que llegue antes) anota esta
  decisión en el `CHANGELOG.md`.
- Un cambio real de pesos, cortes o reglas sigue siendo un cambio de contrato con versión nueva.

**Alternativa descartada.** Subir inundación a v3 con un `UPDATE` en la 0020: cambia el contrato y
los datos sin que cambie ningún resultado de severidad.
