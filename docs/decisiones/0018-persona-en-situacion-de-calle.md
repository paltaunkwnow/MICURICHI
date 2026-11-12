# ADR 0018 — «Persona en situación de calle» se mantiene

- **Estado:** aceptada. Aprobada la puerta antes de producción; la política de privacidad del subtipo se decide antes de activar Áreas verdes en producción.
- **Fecha:** 2026-10-07
- **Decide:** el usuario (decisión de producto del 2026-10-07, respuestas de M0) y la aprobación de la propuesta el mismo día.
- **Origen:** [`docs/arquitectura/14`](../arquitectura/14-decisiones-m0-y-plan-m1.md) y [`14.1`](../arquitectura/14.1-adr-propuestos.md) (detalle y alternativas).

**Decisión.**

- Se mantiene como **subtipo de Áreas verdes**, con el comportamiento del prototipo:
  - nota «Esto no es una denuncia… No subas fotos donde se vea la cara»;
  - derivado a Desarrollo Social.
- No se elimina, no es una categoría propia y no cambia sin autorización.

**Riesgo documentado.**

- Con la publicación automática (ADR 0006), su ubicación sería pública en minutos.
- El jitter solo aplica a `vivienda_o_predio`.
- Tensiona la regla de oro 8 y §13.

**Puerta propuesta.** Antes de **activar Áreas verdes en producción**, decidir:

1. visibilidad del subtipo;
2. fotos;
3. moderación prioritaria;
4. retención;
5. marco legal `<a confirmar>`.

En local, pruebas y piloto interno, funciona como el resto.

**Alternativa descartada por el usuario.** Excluirla (recomendación anterior).
