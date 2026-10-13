# ADR 0012 — Compatibilidad de API

- **Estado:** aceptada.
- **Fecha:** 2026-10-07
- **Decide:** el usuario, que aprobó la propuesta de `docs/arquitectura/14.1` el 2026-10-07.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- Sin `/api/v2`. Las rutas ya tienen nombres neutros.
- **Sin `categoria` = `inundacion`** en todas las lecturas; `categoria=todas` explícito para el panel.
- `POST` plano = inundación.
- Respuestas aditivas: `categoria`, `subtipo`, `detalle`, con los campos planos de inundación durante
  la ventana.
- `/configuracion` con `categorias_activas`.
- `/auth/yo` con `cupos` por categoría (ADR 0017).
- `contracts` 0.19 (aditivo) → 0.20 (contracción).

**Consecuencias.** Los clientes viejos y la PWA cacheada siguen funcionando.

**Alternativas descartadas.** v2 paralela; romper los clientes.
