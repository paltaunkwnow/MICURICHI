# docs

- **Continuidad actual (2026-10-27):** [VentanaContexto.md](../VentanaContexto.md), en la raíz.
  Contiene diagnóstico contrastado con código, pruebas actuales, decisiones y próximo paso:
  M4 y [M5 cerradas en local](sdd/2026-10-15-panel-por-categoria/informe.md);
  [plan M6 Baches](sdd/2026-10-18-baches-piloto/plan.md) e inventario aprobados el 18/10;
  FB completa y M6.1–5 entregadas: contracts 0.23.0, API, geoespacial, web y panel con controles
  propios y revisiones conformes acotadas. El recorrido funcional y el marcador pendiente de M6
  se verificaron después en la entrega conjunta de cuatro categorías, 14/14 E2E el25/10.
  Leerlo antes de retomar un estado histórico.
- [Entrega de cuatro categorías](sdd/2026-10-22-cuatro-categorias/plan.md): plan aprobado el22/10,
  Basura y Áreas verdes sobre el mismo núcleo y una instalación local separada con base nueva.
  Instalación separada activa y demo funcionando; 14/14 E2E desktop/móvil, incluidos mapa M6,
  formularios, fotos, moderación y exportaciones. [Informe y límites](sdd/2026-10-22-cuatro-categorias/informe.md).
  M9/M10 y producción conservan sus hitos propios; no se migraron las bases habituales.
- [M9 de medición](sdd/2026-10-25-medicion-cuatro-categorias/informe.md): cerrada el27/10,1M/250kcada categoría,71casos/1200muestras y revisión conforme con límites. Datos de demo conservados y servicios reabiertos. No certifica HTTP/concurrencia ni duración full perdida.
- [M10.1 y RF-01](sdd/2026-10-26-contraccion-compatible/informe.md): cerrados en local;562PASS/12SKIP,75/75independientes del delta y controles estáticos aprobados. Demo reabierta,sin resembrar ni migrar;M10 completo conserva sus puertas.
- [M10.2 de respaldos](sdd/2026-10-27-respaldos-multitematicos/informe.md): cerrado en local; Node23/23 y Bash23/23, controles estáticos y revisión/verificación independientes conformes. Solo mocks, sin restauración real; ShellCheck local no verificado. Demo sigue abierta.
- [M10.3 cerrado en local](sdd/2026-10-27-restauracion-real-segura/informe.md): dos ensayos reales conformes, cuatro bancos conservados y comprobación independiente139SELECT. Corrección GPG verificada93casos, intento inicial preservado sin reset; no certifica producción/custodia durable/S3.
- [M10.4 cerrado en local](sdd/2026-10-28-consumidores-internos/informe.md): consumidores compatibles y limpieza acotada; DB361, API562/12SKIP, Node19 y confirmación independiente conformes. Conserva cuota/ACL/estructuras/HTTP; sin operadores reales.
- [M10.5 cerrado en local](sdd/2026-10-29-pruebas-historicas-vigentes/informe.md):375/375 propios e independientes,361anteriores conservados, tipos/formato y revisión conformes, sin DDL/funcionalidad. [Cierre M10 aprobado](sdd/2026-10-29-pruebas-historicas-vigentes/plan-cierre-m10.md) el29/10 con API compatible y código/pruebas aisladas; protocolo posterior antes de operar bases. Web prevista `micurichi.lat`; dejar listo para subir después, sin despliegue ahora.
- [Corrida final M10](sdd/2026-10-29-cierre-m10/plan.md): F0 propio1017archivos/92rutas, baseline y diseño inicial en curso; ADR0026 aceptada. No se ha ejecutado la0022 ni actualizado una instalación.
- [Arranque rápido de demo y versión habitual](../ARRANCAR.md): guía solicitada por el usuario, con direcciones y separación de la base protegida; no acredita un nuevo arranque ejecutado.
- [Corrida final M10](sdd/2026-10-29-cierre-m10/plan.md): F0 propio1017archivos/92rutas, baseline y diseño inicial en curso; ADR0026 aceptada. No se ha ejecutado la0022 ni actualizado una instalación.
- `decisiones/`: registros de decisiones de arquitectura (ADR). Cada parte escribe los suyos en su tarea; el índice lo mantiene la Parte 5.
- `revision/`: revisiones completas del repositorio con sus hallazgos y cómo se resolvieron. La última: [revisión para producción del 2026-09-26](revision/2026-09-26-revision-produccion.md).
- `dominio/`: notas técnicas de drenaje urbano y pavimento que respaldan los criterios de `CLAUDE.md` §9.
- `seguridad/`: política y checklist de revisión de PR (Parte 5).
- `operaciones/`: cómo se instala, se corre y se arregla esto. Empezar por el **[manual de operación](operaciones/manual.md)**, que enlaza el resto: [respaldo y restauración](operaciones/respaldo-y-restauracion.md) · [observabilidad](operaciones/observabilidad.md) · [lista de comprobación para producción](operaciones/produccion.md).
- `proceso/`: cómo entra un cambio nuevo. [`proceso/sdd.md`](proceso/sdd.md): especificación aprobada → pruebas en rojo → código → verificación con subagentes (`/sdd`); las corridas quedan en [`sdd/`](sdd/README.md).
- `TRASPASO.md`: traspaso histórico de la fase local. Para el estado posterior de la ampliación
  multitemática, consultar `VentanaContexto.md`, el roadmap de `arquitectura/14` y las corridas `sdd/`.
