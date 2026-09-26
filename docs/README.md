# docs

- `decisiones/`: registros de decisiones de arquitectura (ADR). Cada parte escribe los suyos en su tarea; el índice lo mantiene la Parte 5.
- `revision/`: revisiones completas del repositorio con sus hallazgos y cómo se resolvieron. La última: [revisión para producción del 2026-09-26](revision/2026-09-26-revision-produccion.md).
- `dominio/`: notas técnicas de drenaje urbano y pavimento que respaldan los criterios de `CLAUDE.md` §9.
- `seguridad/`: política y checklist de revisión de PR (Parte 5).
- `operaciones/`: cómo se instala, se corre y se arregla esto. Empezar por el **[manual de operación](operaciones/manual.md)**, que enlaza el resto: [respaldo y restauración](operaciones/respaldo-y-restauracion.md) · [observabilidad](operaciones/observabilidad.md) · [lista de comprobación para producción](operaciones/produccion.md).
- `proceso/`: cómo entra un cambio nuevo. [`proceso/sdd.md`](proceso/sdd.md): especificación aprobada → pruebas en rojo → código → verificación con subagentes (`/sdd`); las corridas quedan en [`sdd/`](sdd/README.md).
- `TRASPASO.md`: estado exacto del trabajo, qué funciona verificado y qué falta.
