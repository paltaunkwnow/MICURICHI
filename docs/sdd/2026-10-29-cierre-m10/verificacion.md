# Cierre M10 — verificación independiente

**En curso, sin dictamen global todavía.** Carver ejecuta controles propios en serie;
los resultados de los implementadores se conservan en [implementación](implementacion.md)
y no se cuentan como ejecuciones independientes.

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
| Escáner, suite independiente nueva |154/154PASS,0FAIL,0SKIP; exit0 |`adenda-20261103/unit-scanner-01/` |
| Secretos |Las9alertas originales resueltas; propio877versionados/1038candidatos,0alertas; falta cierre independiente del escaneo |[Ampliación del escaneo](ampliacion-escaneo.md) |
| Conservación por nombre/estado/multiplicidad |1306casos anteriores conservados,0issues; aserciones/semántica revisadas en las adendas de cada parte |`comparacion-casos-final-01.json` y [revisión](revision.md) |
| Dictamen final |Pendiente de SCAN01 y cierre de sus controles |Las pruebas aprobadas no sustituyen un contraejemplo faltante |

Las rutas de evidencia de esta tabla parten de
`.turbo/m10-cierre-2026-10-29/verificacion-independiente/continuacion-20261101/turno-final-20261102/`.
DB terminó a03Nov00:23:26.009Z, que corresponde al02/11 local; duración572,43s. No se
repite esa suite al recuperar un corte si las fuentes siguen coincidiendo con su freeze.
API terminó a03Nov00:28:23.961Z (02/11 local),280,48s; tampoco se repite por un corte.
Las diez suites completas suman1477PASS/0FAIL/12SKIP; no se suman los dirigidos solapados.
Conservar ese resultado no sustituye el cotejo por caso/aserciones ni el dictamen final.
La suite independiente del escáner añade154casos disjuntos:1631PASS/0FAIL/12SKIP en total.
SCAN01P2 posterior permanece bloqueante: un fallback/concatenación con literal tras la
llamada calculada eludía la regla. No estaba cubierto en esos154casos. Se reproducirá y
corregirá dentro del mismo alcance aprobado antes de publicar; no se reinterpretan los
PASS previos como una prueba del caso nuevo ni como conformidad final del escáner.
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
falta la adenda independiente final sobre esos SHA y la corrección del escáner.

Los tres intentos iniciales de buildAPI no alcanzaron el compilador por restricciones de
estado/enlaces/ruta larga de pnpm en el espejo. Se conservaron íntegros. El control del
cuerpo original confirmó mismo compilador/versiones/SHA y aprobó; no se desactivó la
guarda de pnpm ni se atribuyó el fallo de herramienta al producto.

Los12SKIP históricos PG/S3 no se convierten en PASS. Tampoco se certifica CI remoto,
restauración/migración real22, actualización de demo ni apertura de producción. El operador
privado del ensayo conserva tres hallazgos P2 en corrección; requiere su propia revisión
y aprobación operacional antes de usarse. [Protocolo propuesto](protocolo-operacional-propuesto.md).
