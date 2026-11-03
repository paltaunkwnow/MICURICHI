# M10.1 — Verificación y reserva RF-01

## Estado antes de la corrección RF-01

El verificador nativo independiente Laplace ejecutó los controles sobre el freezeM10.1
del implementador, sin modificar producto. La interrupción posterior dejó al actor
`not_found` antes de consolidar su dictamen, pero sus salidas y resultados permanecen
en `.turbo/m10-2026-10-26/verificador/`. Este documento recupera esa evidencia; no afirma
que se recibiera un handback final ni que se ejecutara el códigoF0 original.

| Control independiente | Resultado observado |
|---|---|
| API completa,1worker y sin paralelismo entre archivos | 535PASS/12SKIP,36archivosPASS/2omitidos,exit0;260.87s |
| Comparación con baseline511PASS/12SKIP | 523casos existentes conservados y24nuevos aprobados;sin regresiones en suite |
| Tipos del grafo de consumidores | Exit0; resultados con caché conservados en el log |
| TiposAPI ejecutados de nuevo sin depender de cachéTurbo | Exit0 |
| BuildAPI | Exit0 |
| BiomeAPI | Exit0 |
| Jitter decontracts | 4PASS,exit0 |

Los comandos completos están en `*.inicio.json`; la salida literal en`*.log` y exit/fechas
en`*.resultado.json`. Se conservan todos los intentos. Ninguna pruebaPG/S3 omitida se
presenta como aprobada. El entorno hijo no cargó.env y no habilitó servicios externos.
Los sockets loopback usados corresponden a fixtures efímeras, no a la instalación de demo.

## Hallazgo heredado confirmado

RF-01 fue detectado estáticamente por el revisor Mencius y confirmado mediante dos fixtures
PGlite independientes: plana→categoría y categoría→plana, con causa omitida en ambos cuerpos.
Resultado de cada par:201seguido de409`CLAVE_IDEMPOTENCIA_REUSADA`;un reporte,un contador,
una auditoría y una clave. App,pool yPGlite cerrados al terminar.

Artefacto `verificador/rf01.json`,27/10 18:16UTC:

```text
RF01_REPRODUCIDO
EXIT=0 SIGNAL=null
```

El primer intento del arnés había fallado al guardar la salida por unCWD distinto; se
conservó y corrigió únicamente esa ruta en scratch antes del resultado válido. No se
arregló producto desde el verificador. La atribución aF0 procede de comparar la misma
línea de huella anterior, no de una segunda ejecución deF0.

La suite verde acredita ausencia de regresiones cubiertas, **no** la equivalencia general
del replay con defaults: CA2 queda con reserva RF-01. Auditoría estática conforme de Dirac;
revisión funcional conforme para el delta con esa observación heredada. Informes íntegros
en[revision.md](revision.md), sin atribuirles ejecución dinámica que no realizaron.

## Corrección posterior autorizada

El usuario aprobó el27/10 **«Aprobar ambos bloques, en orden»**: corregirRF-01 y ejecutar
M10.2 después. Inventario acotado en[inventario.md](inventario.md). F0RF-01 confirma8/8
fuentes iguales al freeze anterior y preserva los tres archivos que puede editar el fix.
El nuevo trabajador raíz mide baseline antes de tocar, guarda rojo/verde y debe someter
su delta a revisión/verificación independientes. No declarar cerrada la reserva hasta entonces.

## Límites

No PGreal,S3,Docker,HTTPde servicios reales,navegador,restauración o nueva medición de rendimiento.
Los resultadosM9 corresponden a sus consultas capturadas anteriores; no miden la nueva
proyecciónJSON. No se certifican producción, ventana de convivencia o contracción física/HTTP.
La demo está detenida tras la interrupción y espera reapertura normal con el build final
verificado; nunca repetirpreparar,seed,carga o migraciones para reanudarla.

## Cierre RF-01 y ajuste de fixtureM10.1

La corrección autorizada y el aislamiento porUV de los tres casos nuevos de exportación
terminaron con **562PASS/12SKIP**,exit0. Los547casos previos del verificadorM10.1 se
conservaron y27nuevos pasaron; los dos timeouts del baseline de reanudación mejoraron aPASS.
No se cambiaron timeouts/skips ni se quitaron aserciones históricas.

Heisenberg revisó el delta funcional y de privacidad en sololectura: conforme, ocho huellas
estables. El verificador nativo independiente Ptolemy ejecutó el delta y comprobó el full
del escritor por huellas, sin presentarlo como una segunda ejecución propia completa:

```text
Test Files  3 passed (3)
     Tests  75 passed (75)
  Duration  61.63s
EXIT=0 SIGNAL=null
```

Alcance:40casos decompatibilidad,11deidempotencia,24deexportación. TiposAPI frescos,
buildAPI normal en`services/api-core/dist` yBiome también terminaronexit0. El compilado
`dist/rutas/reportes.js` quedó actualizado a21:14:39UTC. Comprobación final del actor:
`exact8=true`,`allPredateFull=true`,ningún cambio en las ocho fuentes/evidencia;solo cambió
VentanaContexto por la documentación concurrente del principal.

El límite de uso interrumpió nuevamente la redacción final del actor. No existe su informe
enprosa; el principal consolidó las salidas literales y losJSON completos, sin atribuirle
un handback no recibido. Revisión estática y ejecución independiente sí se realizaron.
Al reanudar se comprobaron8/8huellas y4/4exits iguales a la evidencia guardada, sin repetir
la suite ni inventar otro resultado. Artefactos: `rf01/verificador/{focal,tipos-api,build-api,
biome-api}.{log,resultado.json}`, `comparacion.log` y`fuentes-final.log` dentro del scratchM10.

**RF-01 queda cerrado en local y la reservaCA2 correspondiente, resuelta.** Esta conclusión
no convierte las omisionesPG/S3 enPASS ni acredita una ventana de adopción o restauración real.
