# Corridas del proceso /sdd

Continuidad al 2026-10-17:

- [M4: mapa y formulario](2026-10-10-mapa-y-formulario-por-categoria/informe.md): cerrada en local, con intermitencia y rojos ajenos registrados.
- [Zod y CSP](2026-10-15-csp-zod/verificacion.md): corrección aprobada y verificada en producción local.
- [M5: panel por categoría](2026-10-15-panel-por-categoria/informe.md): cerrada en local, contracts 0.22.0, panel 551/52 y E2E 132/132. Ajuste de expectativa de enlace aprobado y verificado; rojos ajenos declarados.

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
