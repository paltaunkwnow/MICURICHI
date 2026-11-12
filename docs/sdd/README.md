# Corridas del proceso /sdd

Continuidad al 2026-10-29:

- [M4: mapa y formulario](2026-10-10-mapa-y-formulario-por-categoria/informe.md): cerrada en local, con intermitencia y rojos ajenos registrados.
- [Zod y CSP](2026-10-15-csp-zod/verificacion.md): corrección aprobada y verificada en producción local.
- [M5: panel por categoría](2026-10-15-panel-por-categoria/informe.md): cerrada en local, contracts 0.22.0, panel 551/52 y E2E 132/132. Ajuste de expectativa de enlace aprobado y verificado; rojos ajenos declarados.
- [M6: Baches y piloto local](2026-10-18-baches-piloto/plan.md): plan aprobado el18/10 y resultados históricos preservados. La comprobación funcional posterior de Baches y el marcador exacto pendiente de M6 aprobaron en la instalación conjunta de cuatro categorías; no se presenta como otra ejecución completa del G1 histórico ni activa la base habitual.
- [Entrega de cuatro categorías](2026-10-22-cuatro-categorias/informe.md): plan aprobado el22/10, contracts0.24, Basura/Áreas verdes y base separada `curichi_multitematica` preparada y activa. E2E14/14, siete desktop/siete móvil, sin omisiones ni reintentos; reinicio conserva datos. Demo funcionando; informe documenta revisiones y límites. M9/M10 y producción siguen como hitos propios, sin publicación Git nueva.
- [M9: medición con un millón de reportes](2026-10-25-medicion-cuatro-categorias/informe.md): cerrada en local el27/10;71casos/136sentencias/1200muestras,95pruebas de herramienta y revisión conforme. Tiempo full perdido NO_MEDIDO;HTTP/concurrencia no medidos. Demo conservada y reabierta, sin seed/migración ni Git.
- [M10.1 y RF-01](2026-10-26-contraccion-compatible/informe.md): cerrados en local el27/10;562PASS/12SKIP,75/75independientes del delta,tipos/build/Biome0 y revisión conforme. Compatibilidad conservada y claves previas reconocidas;demo reabierta con el compilado verificado,sinseed/migración. M10 completo mantiene sus puertas.
- [M10.2, respaldos multitemáticos](2026-10-27-respaldos-multitematicos/informe.md): cerrado en local el27/10; Node23/23 y Bash23/23, controles estáticos y verificación/revisión independientes conformes. Solo mocks; ShellCheck local y restauración real no verificados. Demo sigue abierta.
- [M10.3, restauración real segura](2026-10-27-restauracion-real-segura/informe.md): cerrado en local el28/10. Corrección93casos verificados y dos ensayos reales21→21/19→21, byteigualdad, negativos/rollback y139SELECT independientes conformes. Cuatro bancos y todos los intentos conservados; sin DROP ni cierre de producción.
- [M10.4, consumidores internos](2026-10-28-consumidores-internos/informe.md): cerrado en local el29/10; DB361/361, API562PASS/12SKIP, Node19/19, tipos y controles aprobados. Formato corregido y confirmado independientemente por AST/SHA; originales preservados,0regresiones. Mantiene cuota/ACL, estructuras y HTTP.
- [M10.5 cerrado en local](2026-10-29-pruebas-historicas-vigentes/informe.md):361casos conservados+14nuevos,375/375 propios e independientes; tipos/Biome y revisión0hallazgos. Seis tests y README DB, sin funcionalidad/DDL. [Plan final M10](2026-10-29-pruebas-historicas-vigentes/plan-cierre-m10.md) aprobado el29/10: API compatible, almacenamiento único y cuota archivada; código/pruebas aisladas primero, operaciones reales con protocolo propio. Preparación para subir después; sin despliegue ahora.
- [Cierre M10 en ejecución](2026-10-29-cierre-m10/plan.md): F0 propio1017archivos, inventario92rutas y ADR0026 aceptada; baseline antes de código, sin operaciones reales autorizadas.

Cada cambio que pasa por `/sdd` deja aquí una carpeta `<aaaa-mm-dd>-<slug>/` (el slug es el de
la rama) con seis archivos, más los auxiliares de la corrida:

| Archivo | Quién lo escribe | Qué contiene |
|---|---|---|
| `linea-base.md` | `sdd-verificador` | Cómo estaba todo antes de tocar nada: comandos, rojos que ya estaban, cambios ajenos, foto de la pila y decisiones de la puerta 1 |
| `spec.md` | `sdd-especificador` | Objetivo, alcance, contrato, criterios Dado/Cuando/Entonces, invariantes, preguntas |
| `pruebas.md` | `sdd-redactor-de-pruebas` | Preflight, criterio → test → comando → salida en rojo antes de implementar, suite después |
| `implementacion.md` | `sdd-implementador` | Preflight, un ciclo por criterio y cierre, con la salida pegada |
| `verificacion.md` | `sdd-verificador` | Comando → salida literal → veredicto, comparación con la línea base, en vivo y túnel; no verificados con motivo |
| `informe.md` | agente principal | Resumen, regresión, hallazgos, cómo volver atrás, plantilla de PR rellenada |

Auxiliares: `archivos.txt` (lo que escribió la corrida; es lo único que entra en el commit),
`arbol-inicial.txt` (cambios ajenos, si los había), `pruebas-f2.patch`, `pila-antes.txt` y
`pila-despues.txt` (ventana E2E). Los dumps de base, logs de túnel y copias temporales van al
scratchpad de la sesión, nunca acá.

Se versionan a propósito: es la evidencia de cada cambio, como `docs/TRASPASO.md` lo es de cada
fase. El proceso está descrito en [`docs/proceso/sdd.md`](../proceso/sdd.md).
