# Corridas del proceso /sdd

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
