# M10.1 — Implementación compatible

Implementación del27/10 por Feynman, trabajador raíz nativo sin override de modelo.
Fuente congelada, actor cerrado tras comprobar8/8huellas. No hubo commits ni cambios de
contrato, esquema, dependencias, apps, geo o infraestructura.

## Cambio

`SELECT_REPORTE` obtiene los seis alias de inundación de`reporte.detalle`, con unCASE por
categoría y conversión explícita del booleano. Mantiene los nombres y tipos de las respuestas
y delCSV. NULL o ausencia delJSON siguen produciendo aliasNULL;false continúa booleano.
Las otras categorías no reciben campos de inundación inventados. El recorte público,
jitter, datos de autor, estados y demora siguen en sus funciones anteriores.

Las rutas registran cada creación aceptada/replay mediante una métrica y un evento de log
con etiquetas finitas: forma`plana|categoria`, resultado`aceptado|replay`,
origen`entorno_prueba|no_clasificado`. SoloNODE_ENV=test fija entorno de prueba; ninguna
cabecera puede declararlo. El evento nuevo no incorpora cuerpo, coordenadas, dispositivo,
identidad, claves ni texto libre. El reqId técnico existente no es etiqueta de la métrica.
Los contadores son por proceso, no una ventana persistente ni prueba de adopción.

Conserva ambas formasPOST, validación, INSERT dual, trigger0020, idempotencia, cupo,
demora y auditoría de reglas. Development, demo y producción no se declaran sintéticos.
La demo ya cargada conserva su build anterior: esta corrida no la reinicia ni conecta DBreal.

## Rojo y verde

Baseline:511PASS/12SKIP, tipos del grafo yBiome0, antes de editar producto.
El primer intento de nuevas pruebas tenía además casos mal construidos de la forma por
categoría; se corrigieron las fixtures antes de implementar. No se presentan esos fallos
de contrato de la propia prueba como defectos de producto.

Rojo válido conservado: `pruebas-rojas-contrato`,12FAIL/26PASS,exit1, contra el código
anterior. Esos fallos comprueban lectura canónica e instrumentación faltantes.
Después del cambio, el mismo alcance dirigido pasó38/38,exit0.

Suite completa posterior:

```text
Test Files  36 passed | 2 skipped (38)
     Tests  535 passed | 12 skipped (547)
  Duration  264.23s
EXIT=0 SIGNAL=null
```

Comparación caso por caso: los523casos existentes conservan resultado;0perdidos,
0cambios de estado y24nuevos aprobados. Las aserciones históricas de los cuatro archivos
de pruebas editados se conservaron, con evidencia de comparación del bloque anterior.
Las12omisionesPGreal/S3 no sonPASS ni una certificación de concurrencia.

## Controles del escritor

| Control | Resultado |
|---|---|
| Suite completa API, un worker y sin paralelismo entre archivos | 535PASS/12SKIP,exit0 |
| Tipos por grafo`...contracts`,concurrency1 | 9/9tareas,8caché;API actualizado,exit0 |
| BuildAPI | tsc exit0 |
| BiomeAPI | 73archivos,0errores,sin correcciones,exit0 |
| Huellas finales | 8/8iguales alfreeze, comprobadas a18:06UTC |

Salidas completas, comandos, fechas y RAM en
`.turbo/m10-2026-10-26/implementador/`: `post-test`, `post-tipos-grafo`, `post-build`,
`post-biome` y sus`.resultado.json`; `comparacion-test-por-test.json`,
`aserciones-historicas.json`, `diff-f0.patch`, `freeze-final.json`, `freeze8-comprobado.json`.

La ejecución independiente y las revisiones todavía deben cerrar sus dictámenes. El límite
de uso interrumpió la entrega de los actores, no borró las pruebas ni el freeze. No se
repitió la implementación al reanudar. M10.2 en inventario es propuesta, no ejecución aprobada.

## Ampliación RF-01 aprobada y aplicada el27/10

El usuario aprobó **«Aprobar ambos bloques, en orden»**: RF-01 y despuésM10.2.
La reserva heredada se corrigió en los tres archivos autorizados. La huella nueva usa el
detalle validado; solo un conflicto de inundación con causa`desconocida` permite intentar
la variante histórica que omite únicamente esa clave, dentro de la misma transacción y
bloqueo. No se reescriben ni renuevan las claves vigentes y no se edita`idempotencia.ts`.

Dewey añadió27casos: formas/defaults, claves históricas capturadas antes del fix, cambios
reales que siguen409, conservación de filas/cupos/auditoría, vencimiento, cuentas y huérfanas.
Rojo válido del delta:41PASS/10FAIL de51casos;17de los27nuevos ya pasaban y10demostraban
el defecto. Las huellas históricas se obtuvieron con dosPOST201 de la API anterior y lectura
de la fila, no recalculando el resultado esperado con el algoritmo nuevo.

El baseline de esta reanudación tuvo533PASS/2timeouts/12SKIP antes del fix y el reintento
aislado22PASS/2timeouts. Los tres casos nuevos de exportaciónM10.1 se acotaron porUV,
manteniendo todos los selectores/aserciones y los casos masivos históricos. El archivo
está en el inventario originalM10.1 aprobado; no se elevaron timeouts ni añadieron skips.
Después ese archivo pasó24/24.

Post completo tras ambos deltas: **562PASS/12SKIP,exit0**,438.35s. Sin regresiones;
27nuevos aprobados y los dos rojos de fixture mejoran aPASS. Los547casos del verificador
M10.1 anterior mantienen su estado final. TiposAPI y grafo9/9, build en scratch yBiome0.
El build normal de`services/api-core/dist` queda al verificador antes de reabrir la demo;
no se confunde el compilado de scratch con el ejecutable que serviría la instalación.

Fuentequieta4deltas/8archivos. Copias finales,logs,diff deexportación yfreeze en
`.turbo/m10-2026-10-26/rf01/implementador/`; Heisenberg emitió revisión estática funcional
y de privacidad conforme, sin ejecutar suites. Verificación ejecutable del delta pendiente.
La aprobaciónM10.2 sigue vigente y su código aún no se ha editado.
