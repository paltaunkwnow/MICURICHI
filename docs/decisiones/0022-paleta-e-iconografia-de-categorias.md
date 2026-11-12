# ADR 0022 — Paleta e iconografía de categorías

- **Estado:** aceptada. Los colores son punto de partida: se validan con diseño antes de M6.
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión** (13.1 §6):

- **Identidad = icono + nombre**, siempre.
- **El color solo como acento**: pastilla activa, botón «Reportar…», leyenda, chip.
- **No** se re-tiñe la app: foco, botones genéricos y severidad, constantes.
- Los **puntos se pintan por severidad**.
- Iconos `Waves`, `TrafficCone`, `Trees`, `Trash2` (`lucide-react` 1.45.0).
- Colores de partida:

| Categoría | `c7` | `c5` | `c1` |
|---|---|---|---|
| Inundaciones | `#0A4A69` | `#0D6189` | `#E3EEF5` |
| Baches | `#7A4E1E` | `#9C6A35` | `#F6EDE3` |
| Áreas verdes | `#0F6E5C` | `#2E8B76` | `#E1F2EE` |
| Basura | `#6B3FA0` | `#8462B8` | `#F1EBF8` |

- El contraste se verifica **con pruebas** (M1.3).
- Futuras categorías: familias de color + icono propio.

**Alternativa descartada.** La paleta del prototipo: Baches ≈ «alta» (ΔE 9,2); Áreas verdes y Baches
indistinguibles con protanopía (ΔE 2) [MEDIDO].
