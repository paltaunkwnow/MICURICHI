# Cierre M10 — verificación independiente

**Adenda del 09/11.** Plato cotejó el ensayo R4 completo, con 24 checkpoints y
siete altas conservadas durante reversa y reaplicación. Cargó independientemente
ambos releases y registró 119/121 al correr los mocks en la carpeta ya ejecutada;
los dos fallos dependían del fixture de estado previo. La copia diagnóstica pasó
121/121 de baseline y 143/143 tras las mejoras de robustez. Plato verificó los
22 casos nuevos y sus fuentes, con censo de cero procesos propios. Los hashes y
límites de custodia están en el [informe](informe.md). La demo y sus 14 E2E de
esquema 22 siguen pendientes.

**Código: CIERRE_CODIGO_APTOCONLIMITES, 03/11/2026.** Carver terminó los controles
independientes y Peirce cerró los hallazgos de código. El ensayo real y la actualización
de demo estaban pendientes en ese corte; este dictamen no declara M10 completo. Los resultados de los
implementadores se conservan en [implementación](implementacion.md) sin duplicar conteos.

**Actualización04/11:** el delta posterior de respaldo y las dos pruebas DB nuevas están
en reverificación. Los conteos del03/11 conservan su alcance; no se reasignan a otros SHA.
La [continuación](continuacion-20261104.md) registra los controles actuales y el operador
nuevo, cuya carga aislada/revisión permanecen pendientes.

## Fuentes y entorno

Freeze1087fuentes/artefactos, SHA256
`902d0bd17c9a13cd707ac53b981dfb1e1bd64faee04739f70d194e987bc74401`,
en `.turbo/m10-cierre-2026-10-29/publicacion/freeze-verificacion-20261102.json`.
Lease exclusivo de verificación; pruebas PGlite y loopback efímero propio con transporte
original, entorno OS permitido más test/CI, sin dotenv ni credenciales heredadas. Las
denegaciones TCP conocidas se evitan solicitando el mismo control escalado desde el inicio.
No se conectan instalaciones reales, Docker, S3 o demo ni se ejecutan E2E operacionales.

## Controles ejecutados

| Control independiente | Resultado | Evidencia |
|---|---|---|
| DB completo |429PASS,0FAIL,0SKIP; exit0;0diferencias del freeze |`ejecuciones/db-full-01/control.json` |
| API completo |612PASS,0FAIL,12SKIP históricos de624; exit0;0diferencias del freeze |`ejecuciones/api-full-01/control.json` |
| Geoespacial completo |110PASS,0FAIL,0SKIP; exit0;0diferencias del freeze |`ejecuciones/geo-full-01/control.json` |
| Node, seis suites completas |279PASS,0FAIL,0SKIP; exit0 en cada control |`node-bancos`, `node-respaldo`, `node-ensayo-legacy`, `node-local`, `node-medicion`, `node-contraccion`, intentos `full-01` |
| Bash completo |47PASS,0FAIL,0SKIP; exit0;0diferencias del freeze |`ejecuciones/bash-full-01/control.json` |
| Grafo de tipos |6/6tareas aprobadas,0cache; incluye build contracts/DB |`ejecuciones/typegraph-final-01/control.json` |
| Build API/DB |exit0 mediante cuerpo original `tsc`, mismo compilador5.9.3/SHA, solo espejo |`build-api-body-01`, `build-db-body-01` |
| Sintaxis/YAML |8Node,2Bash y YAML exit0 |Controles `sintaxis-…-final-01`, `yaml-final-01` |
| ROOTBiome delta/global |Delta exit0; global conserva1error6warnings de contexto ajeno |`biome-delta-final-01`, `biome-global-final-01` |
| Escáner, suite independiente final |157/157PASS,0FAIL,0SKIP; exit0;154casos anteriores conservados |`adenda-20261103/unit-scanner-02/` |
| Secretos |Independiente:877versionados,281del delta y1038candidatos;0alertas, exit0 en los tres controles |`adenda-20261103/{scanner-todos-02,scanner-delta-02,scanner-publicacion-02}/` |
| Conservación por nombre/estado/multiplicidad |1306casos anteriores conservados,0issues; aserciones/semántica revisadas en las adendas de cada parte |`comparacion-casos-final-01.json` y [revisión](revision.md) |
| Dictamen de código |CIERRE_CODIGO_APTOCONLIMITES; SCAN01 resuelto y revisión0P1/0P2 |`adenda-20261103/resultado-scan01-02.json` y `handoff-scan01-02.md` |

Las rutas de evidencia de esta tabla parten de
`.turbo/m10-cierre-2026-10-29/verificacion-independiente/continuacion-20261101/turno-final-20261102/`.
DB terminó a03Nov00:23:26.009Z, que corresponde al02/11 local; duración572,43s. No se
repite esa suite al recuperar un corte si las fuentes siguen coincidiendo con su freeze.
API terminó a03Nov00:28:23.961Z (02/11 local),280,48s; tampoco se repite por un corte.
Las diez suites completas suman1477PASS/0FAIL/12SKIP; no se suman los dirigidos solapados.
Conservar ese resultado no sustituye el cotejo por caso/aserciones ni el dictamen final.
La suite independiente final del escáner añade157casos disjuntos: **1634PASS/0FAIL/12SKIP**
en total. SCAN01 reprodujo tres negativos para fallback/concatenación literal tras la
llamada calculada. Tras el arreglo, los157casos aprobaron con revisión estática conforme.
Los154PASS anteriores se conservan como intento previo, no se suman otra vez.
La corrección tuvo RED150:101PASS/49FAIL y dos pares negativos adicionales antes de sus
arreglos. La entrega final conserva las reglas, los hooks y las siete fuentes históricas;
ROOTBiome/sintaxis/YAML propios aprobaron. Los intentos originales permanecen en escaneo-20261103/.

## Revisión, límites y pendientes

[Revisión independiente](revision.md): API y deltaP5 conformes por lectura; no se afirma
una igualdad AST global donde falta la preimagen exacta. El verificador ejecuta las
fuentes finales y coteja los casos históricos en vez de reutilizar un PASS de otro SHA.

`git diff --check` detectó47espacios finales dentro de SQL de siete fixtures API. Tras
terminar el turno independiente se eliminaron únicamente esos47bytes, conservando tokens
SQL y los demás bytes. La suite dirigida posterior aprobó98/98,0diferencias de casos y
ROOTBiome7exit0; el principal confirmó `git diff --check` exit0. No se suman esos98casos
solapados al total1477. Evidencia en `.turbo/m10-cierre-2026-10-29/formato-api-20261102/`;
La adenda independiente final aceptó esa prueba de bytes y confirmó el escáner final.

Los tres intentos iniciales de buildAPI no alcanzaron el compilador por restricciones de
estado/enlaces/ruta larga de pnpm en el espejo. Se conservaron íntegros. El control del
cuerpo original confirmó mismo compilador/versiones/SHA y aprobó; no se desactivó la
guarda de pnpm ni se atribuyó el fallo de herramienta al producto.

Los12SKIP históricos PG/S3 no se convierten en PASS. Tampoco se certifica CI remoto,
restauración/migración real22, actualización de demo ni apertura de producción. El operador
privado del ensayo corrigió OP01–OP03:21/21mocks originales y32/32casos adicionales,
con12fallos funcionales antes del parche y cero casos perdidos. Son pruebas de Kant,
separadas del total de código anterior. Peirce cerró OP01–OP03 por lectura,0P1/0P2,
con los límites de cobertura registrados en la adenda. Falta acreditar la carga aislada
de ambos releases antes de solicitar permiso operacional.
[Protocolo propuesto](protocolo-operacional-propuesto.md).

## Freeze ejecutable preparado

`publicacion/freeze-scan01-20261103.json` fija1088fuentes/artefactos, SHA
`b1429b1179d88eefbbcbb872a010abb7d2a96ea5f78dd8a1bdbf9ffde73d5aef`.
El03/11 se cotejaron los399archivos necesarios para el release22 de DB/contracts/API/geo,
incluidos391artefactos bajo dist/migraciones/OpenAPI:0faltantes y0SHA cambiados.
`publicacion/freeze22-verificado-20261103.json`, SHA
`3b83d4816ad35869136f80c1f339d6a24a481193f4947c80825dc59fe08c6ad5`,
referencia mediante SHA el dictamen independiente. Permite materializar una copia privada;
no acredita todavía su runtime ni concede permiso para conectar bases o migrar la demo.

## Demo en esquema 22, 11/11

La operación autorizada verificó los siete checkpoints, incluida la
restauración en copia nueva y el cotejo tras la migración. La corrida
`m10-demo-20261111` registró 14 aprobadas, siete por proyecto, sin fallos,
omitidos ni inestables. En el segundo arranque los cuatro servicios
respondieron HTTP 200. Los ocho reportes y las cuatro fotos de prueba
conservaron sus huellas. Ambos cierres quedaron confirmados y los puertos
se liberaron. Resultados y SHA256 en el [informe de cierre](informe.md).
