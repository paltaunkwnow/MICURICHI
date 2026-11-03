# M10.5 — Corrida de pruebas históricas y vigentes

**APROBADA por el usuario el29/10/2026:** «Aprobar y ejecutar M10.5 (Recomendado)»,
respuesta a call_e8c59cf3d0a342b4934d725e5c452d7f. M10.4 quedó cerrado y congelado antes de F0.

[Plan e inventario canónicos aprobados](../2026-10-28-consumidores-internos/plan-m10-5.md).
Se mantienen allí los siete archivos, criterios, riesgos y límites; este enlace evita duplicarlos.

Parte4, packages/db/, trabajador raíz sin override. Banderas base/datos/geo y revisión
de seguridad por conservar los negativos de ACL históricos; sin cambio de privilegios.
F0 propio: .turbo/m10-5-2026-10-29/f0/manifest.json, 1006archivos y siete copias de producto.
Solo fixtures/PGlite, sin DDL de producto ni operadores reales. Baseline/test por caso,
antes/después, revisión/verificación independientes y docs de corrida/contexto.

Sin src/, migraciones/reversas, contratos/apps/API/geo/scripts/CI/AGENTS/CLAUDE.
Sin instalaciones, Git/publicación, limpieza de cachés/logs, env o sistema persistentes.
