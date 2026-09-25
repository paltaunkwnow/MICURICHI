# Corridas del proceso /sdd

Cada cambio que pasa por `/sdd` deja aquí una carpeta `<aaaa-mm-dd>-<slug>/` (el slug es el de
la rama) con cuatro archivos:

| Archivo | Quién lo escribe | Qué contiene |
|---|---|---|
| `spec.md` | `sdd-especificador` | Objetivo, alcance, contrato, criterios Dado/Cuando/Entonces, invariantes, preguntas |
| `pruebas.md` | `sdd-redactor-de-pruebas` | Criterio → test → comando → salida en rojo antes de implementar |
| `verificacion.md` | `sdd-verificador` | Comando → salida literal → veredicto; no verificados con motivo |
| `informe.md` | agente principal | Resumen, hallazgos, plantilla de PR rellenada |

Se versionan a propósito: es la evidencia de cada cambio, como `docs/TRASPASO.md` lo es de cada
fase. El proceso está descrito en [`docs/proceso/sdd.md`](../proceso/sdd.md).
