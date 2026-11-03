# Verificación — cuatro categorías

Checkpoint documental, **2026-10-25**. La fase sigue abierta. Los bloques del 22–24/10
conservan la secuencia histórica; el checkpoint final prevalece sobre sus pendientes y
afirmaciones de servicios iniciados. Esta recuperación no ejecutó suites, servicios ni DB.

## Contracts: pruebas del implementador

Salida conservada en `.turbo/cuatro-categorias-2026-10-22/contracts/`:

```text
Antes:   23 archivos / 419 PASS; typecheck exit=0
Después: 26 archivos / 512 PASS; typecheck exit=0; build exit=0
Comparación: 419 preservados, 93 nuevos, 0 regresiones
Biome: 13 archivos, sin hallazgos
Secretos: sin hallazgos en la selección
git diff --check -- packages/contracts: exit=0
```

Dos nombres de pruebas del registro se actualizaron según inventario aprobado. El primer
intento de Vitest falló por EPERM antes de ejecutar casos; el posterior con TEMP/TMP
privados pasó. Se conservaron ambos intentos; no se borraron cachés.

OpenAPI generado dos veces y coincidente con F0:
`5a089fbb8cb75a509b446c8f6a3725c94a7aa7e0cb6b83d537f029a3ddd4623a`.
Entrega, comandos, logs y comparación por caso: `entrega.md`, `post-test.log`,
`test-comparison.json`, `freeze-0.24.0.json` de esa carpeta. Revisión independiente de
contracts CONFORME, sin hallazgos P0–P3: `revision/contracts.md` del scratch de la corrida.
El revisor cotejó los casos, diffs y hashes sin repetir suites; el principal comprobó las
184 entradas del freeze con cero diferencias. Consumidores siguen en verificación.

## Baseline web con contracts 0.24.0

723 PASS y un fallo de expectativa histórica del registro de dos categorías en
`src/lib/m6-bache-real.test.ts:407`; tipos exit0. No es un fallo del modelo de Baches.
Se conservó el resultado rojo y se propuso una ampliación puntual en `plan.md` para
actualizar esa expectativa manteniendo el fallo cerrado con registro inyectado.

## Web: correcciones y controles del implementador

Evidencia en `web/reanudacion-p1/` del scratch de la corrida:

```text
suite-1: 53 archivos / 739 PASS
comparación: 724 casos de base conservados (723 verdes + expectativa corregida)
15 casos nuevos, 0 ausentes, 0 regresiones
types-2: exit0; biome-1: exit0
build-node-3: exit0; .next-multitematica; un trabajador
Inventario de 1.973 archivos .next sin cambios de ruta, tamaño ni mtime
```

Las ampliaciones de expectativas M6 de registro y adaptadores quedaron aprobadas por el
usuario y documentadas en el plan. Se corrigieron los cuatro fallos del post parcial:
montaje SSR de los tests de subtipo, texto exacto de severidad y lista de adaptadores.
No se aflojó la validación del formulario para hacerlos pasar.

El primer typecheck detectó inferencia demasiado amplia en una tupla de prueba; se anotó
con los mismos cuatro valores. Next añadió referencias a los tipos de su salida nueva,
según el inventario autorizado. No cambiaron aserciones ni fuente funcional después de
la suite; tipos/Biome/build posteriores pasaron. No se repitió la suite por esos cambios.

Dos intentos de build mediante el script del paquete fallaron con TurbopackInternalError.
El tercero usó el CLI instalado mediante Node y terminó correctamente; intentos y salidas
conservados. No se atribuyen esos fallos a un defecto funcional ni se borran evidencias.
Faltan entrega final de huellas, revisión independiente y navegador.

Revisión independiente posterior de Kepler: funciones y conservación de casos conformes;
un hallazgo de formato en `tsconfig.json`, regenerado por Next después de Biome. Corrección
puntual asignada a P1; el JSON debe pasar Biome antes del cierre. El cotejo de la salida
habitual compara ruta/tamaño/mtime, sin certificar igualdad binaria de sus 1.973 archivos.

Resolución: normalización del fin de línea exclusivamente, JSON parseado idéntico y freeze
actualizado. Check real del principal: `biome check apps/web-ciudadano/tsconfig.json`, exit0,
`Checked 1 file in 8ms. No fixes applied.` No se repiten pruebas funcionales por ese formato.

## Panel: baseline actual

`panel/baseline-suite-ejecutable.log`: 53 archivos / 586 PASS; tipos exit0. Primer intento
interrumpido antes de casos por EPERM al renombrar caché del sandbox; se conservó y se
repitió con entorno temporal privado. No se cuenta como 586 fallos ni como ejecución verde.

## Panel: post del implementador

```text
post-suite-3: 55 archivos / 709 PASS
586 casos de base conservados, 123 nuevos, 0 regresiones
post-types-2: exit0; Biome P2 incluido JSON posterior a Next: exit0
post-build-1: exit0; .next-multitematica, CPU1
8 archivos del freeze cotejados por principal: 0 diferencias
```

En el post anterior fallaron tres casos nuevos por expectativas incorrectas: plural del
nombre en tabla, slug interno en lugar del público `area-verde`, y exigir un rechazo más
estricto que el esquema vigente de respuestas generales. Se corrigieron los tests nuevos
sin modificar ese contrato ni los 586 casos de base. El negativo ahora usa un valor inválido
para el esquema; se conservan los controles de bytes y nulos recibidos del servidor.
Evidencia y comparación: `panel/post-*.log`, `post-hashes-tocados.json` y `post-cesion.json`.
La salida habitual se cotejó por metadatos; no se certifica su identidad binaria ni arranque.
Revisión independiente y navegador siguen pendientes.

## API: límite del primer intento actual

`api/baseline-turno/baseline-1-finished.json` registra 104 PASS, 399 casos no ejecutados y
4 fallos, más suites con setup bloqueado por `connect EACCES` a sockets efímeros PGlite.
No se presentan esas omisiones como las 12 conocidas ni se atribuyen al producto.
Tipos exit0. Fuentes de API sin modificar durante el intento. Falta repetir con acceso
local al motor efímero antes de emitir conclusión sobre regresiones.

## Arranque P5: post y auditoría final

`operacion/cesion-post.json`: 38/38 PASS, 29 casos anteriores conservados y 9 nuevos,
cero regresiones/omisiones. Dos comprobaciones de sintaxis exit0; Biome final exit0,
sin errores ni avisos. La advertencia de optional chaining pertenecía al borrador nuevo,
no era ajena: se corrigió manualmente y los 38 casos volvieron a pasar.

Auditoría independiente `revision/operacion-auditoria.md`, incluido anexo final:
CONFORME por lectura, cinco huellas coincidentes y reparaciones de cierre presentes.
Esto no acredita la preparación ni el arranque reales; la base sigue sin crearse.

## Geoespacial: baseline y estrategia del post

Focal PGlite: engine `memory://`, socket efímero propio con marca coincidente, cero
conexiones reales. DB: 319 PASS y tres casos no ejecutados por timeout de preparación
del archivo de migración0021; geo: 82 PASS. Tipos DB/geo exit0. Se conservó el intento
DB largo, sin aumentar el timeout ni tocar esa migración o su test.

Como no cambió fuente ni esquema de DB, el post ejecutará el nuevo test y el archivo0021
en procesos frescos, con supervisión acotada. La comparación consolidará por nombre
los319 casos anteriores y los tres pendientes sin duplicar el cuarto del focal. No se
presentará como una segunda suite completa. Geo sí repetirá su suite completa porque
se modificó un test existente. Las omisiones no se convierten en PASS por consolidar.

## API: post recuperado el 23 de octubre

`api/post-turno/post-finished-1.json` acredita suite completa con **510 PASS y 12 SKIP**
(522 casos, 35 archivos aprobados y dos omitidos), tipos y Biome exit0. El intento anterior
con EACCES se conserva; el post con acceso al socket efímero propio pasó sin modificar
fuentes productivas. Los 12 SKIP de PostgreSQL/S3 siguen siendo no verificados.

Comparación física por archivo/fullName: 506/507 identidades históricas exactas, sin cambios
de estado; el caso restante es el título del registro M6 cuyo ajuste aprobó el usuario.
Su reemplazo pasó, al igual que los 15 casos adicionales. Evidencia de comparación:
`api/post-turno/comparacion-historica-final.json`. No son 16 casos nuevos: uno es ese renombre.
Revisión independiente de los tests en curso; no se atribuye ejecución de PG real a PGlite.

## Pendientes de integración

### Control del 24/10: preparación real y demo

El destino nuevo se preparó correctamente:21migraciones,16distritos/576UV/27527manzanas
municipales vigentes,4usuarios y37reportes sintéticos,22puntos críticos. ACL correcta para
curichi_api/curichi_geo; tres activaciones auditadas y catálogo final de cuatro activas.
Journal y log en `operacion/`; identidad/OID/comentario conservados. No se conectó ninguna
base habitual. Las conexiones a curichi_e2e fueron únicamente bootstrap.

Dos defectos del runner se repararon dentro del inventario: comentario compartido de base
y herencia del modo ESM hacia workers CommonJS de contraseñas. Pruebas38→39→40PASS,
con rojos de regresión conservados y Biome final0. Dictamen independiente conforme en
`revision/procedencia-compartida.md`. La recuperación tras el seed fallido inspeccionó
0cuentas/reportes/fotos/cupos y0procesos anteriores, preservó el journal original y registró
la recuperación antes de completar el seed; ver `operacion/recuperacion-seed-inspeccion.json`.

DBconsolidada:350PASS únicos (319baseline+3pendientes ahora aprobados+28nuevos), NO segunda
suite completa. Geo110PASS,82historicos sin cambios de estado;63fuentes productivas intactas.
`geo-db/post-consolidado.json` conserva origen por caso y el timeout anterior.

Estáticos E2E: tipos0, Biome0, listado dedicado14 y G1–G5 con47/31/59/43/18. NodeList pasó
a Array.from tras el error de tipos; configuración/helpers/specs habituales intactos.

Los cuatro servicios iniciaron y web4000/panel4100 respondieron200 en127.0.0.2;
`/configuracion` anunció inundacion,bache,area_verde,basura. Se conservaron los avisos de
Next sobre output standalone con next start. No se atribuye certificación visual a HTTP200.
La prueba de navegador aún espera memoria2500MiB con servicios vivos. El control integrado
de navegador no pudo inicializar sus assets locales (os error3); no es un fallo de producto.

El cierre requiere todavía navegador y comprobaciones finales. La base nueva quedó
creada y activa; web, panel, API y geo estuvieron iniciados durante esa demo histórica.
La demo quedó detenida antes del checkpoint del 25/10. El fallo histórico M6 de marcador
ausente sigue abierto: su último diagnóstico anterior se detuvo por memoria antes de
Playwright, con cero casos ejecutados. No es una prueba aprobada ni una nueva reproducción.

Los rojos ajenos y omisiones de la línea base se conservan en `linea-base.md`.

### Reinicio: intentos del 24/10 y bloqueo conservado

El cierre controlado acreditó0PIDs propios y lock ausente. Snapshot anterior al reinicio:
7usuarios/40reportes/2fotos/4contadores/16auditorías/4categorías, con huellas agregadas de
las seis tablas en `operacion/antes-reinicio.json`. No se conservaron credenciales en él.

El reinicio no inició servicios: faltan las dos entradas compiladas servidor.js y tsc no
puede crearlas(EPERM), tanto dentro como fuera del sandbox. .NETCreateNew recibió
AccessDenied; no creó archivos vacíos. ACL normales y RestartManager sin propietarios;
el usuario no observó alertas Bitdefender. No atribuir la causa a antivirus sin evidencia.
Se pidió una comprobación de compilación desde PowerShell externo. No se alteró seguridad.
Conservar el estado: no repetir seed/load ni adoptarotra base. Comparación después del
reinicio y E2E restantes todavía no verificadas.

El usuario reprodujo TS5033/EPERM en las dos compilaciones desde su propio PowerShell.
Se preservaron ambas carpetas dist, sin borrar archivos, en
`operacion/compilados-respaldo-20261024-090520/`. Se validaron las rutas absolutas antes
del movimiento dentro del workspace. La reconstrucción de las mismas rutas habituales
volvió a dar exit2 en API y geo, exclusivamente en servidor.js. No se ejecutaron copias
alternativas ni se cambió la seguridad. La causa Windows aún no está identificada.

### H1/H2 de API cerradas

`api/revision-h1h2/resultado.md`: baseline focal13PASS, post14PASS, tipos/Biome0; los13
anteriores preservados, un caso nuevo con perfiles2/3/4/5 para diferenciar indicadores y
ejecutivo por categoría y comprobar la suma de todas.378entradas contemporáneas antes/
después, incluido el test nuevo. Hash final16e0c275226f87d41802ead5a69d102e7cb10cb1ac464098b6c3b468a121c5e6.
Revisión independiente `revision/h1h2-e2e-delta.md`: ambas observaciones subsanadas;
delta de E2E conforme por lectura, sin certificar14casos de navegador aprobados.
No se repitió la suite API completa; la ejecución anterior510PASS+12SKIP se conserva.

## Checkpoint del 25/10: recuperación de calidad final y reinicio pendiente

Evidencia física recuperada de `.turbo/cuatro-categorias-2026-10-22/calidad-final/`,
ejecutada el 24/10 por Tesla. El actor quedó `errored` por agotamiento de uso, según el
relevo del principal; no se reintentó ni se atribuye actividad actual a ese actor.
Se leyeron `comparison.json`, los diez `*.status.json`, logs y JSON de casos.

| Control recuperado | Resultado exacto y límite |
|---|---|
| ETL inicial | `etl-suite.tests.json`: 21 casos únicos, 16 PASS y 5 FAIL por EACCES a sockets efímeros propios de PGlite; `etl-suite.status.json` conserva exit1. |
| ETL focal externo | `etl-carga-outside.tests.json`: los mismos cinco casos fallidos, identificados por archivo y `fullName`, pasan; exit0. El caso CLI omitido por el filtro ya había pasado en la inicial. |
| ETL consolidado | **21 PASS únicos = 16 iniciales + 5 focales**, sin duplicar casos. No es una segunda suite completa ni una ejecución única con exit0; el intento rojo se conserva. `etl-casos-comparacion.json` conserva la comparación histórica inicial. |
| Tipos y build ETL | `etl-types.status.json` y `etl-build.status.json`: exit0. Build dirigido a `calidad-final/build/geodata-etl`, sin acreditar reconstrucción de API/geo ni de Docker. |
| Runner | `runner-unit.stdout.log`: literalmente `tests 40`, `pass 40`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; `runner-unit.status.json`: exit0. Ambas comprobaciones de sintaxis exit0. |
| Biome | `biome-three.status.json`: exit0; log: `Checked 3 files in 34ms. No fixes applied.` Alcance: runner, su test y `turbo.json`; no equivale a lint global verde. |
| Diff | `diff-check.status.json` y `diff-check-index.status.json`: exit0 sobre la selección registrada en cada comando. No certifican contenido de archivos sin seguimiento. |
| Secretos | `secretos.json` conserva **1 hallazgo**, explicado por `secretos-revision.json` mediante AST; reglas canónicas sin modificar. No se presenta como un escaneo con cero coincidencias. |

El falso positivo corresponde a `scripts/multitematica-local.mjs:894`:
`password: decodeURIComponent(url.password)`. El AST identifica un `Identifier` en una
`CallExpression`, codificador URI global y argumento `PropertyAccessExpression`, sin literal.
La lectura del código confirma un valor dinámico; no es una credencial escrita en el archivo.

Las tres entradas actuales del runner se cotejaron el 25/10 contra `source-after.json`;
**3/3 SHA-256 coinciden** con la evidencia recuperada:

| Archivo | SHA-256 actual y registrado |
|---|---|
| `scripts/multitematica-local.mjs` | `00d4a6c630960b8880aa3e38276591789f557f9926b3080f65d3c21bc2b13c5e` |
| `scripts/multitematica-local.test.mjs` | `bfc8301460c5d9f7b38304e999f441705dad86511c60fe4bf1e03597452f3e74` |
| `turbo.json` | `936cf17e0d2f07406631c395e4aea428924580b5bfe7c1a3d9de376587cdcca3` |

Los diez statuses registran `ownChildClosed: true`; `comparison.json` declara
`ownLiveChildren: 0`. Consulta puntual por los diez PIDs guardados
3744/6704/13504/20768/22264/22968/24284/25508/29032/29396: ninguno presente.
No se usó CIM amplio ni se terminaron procesos; este alcance no certifica todos los
procesos de Windows. La comparación registra solo cambios concurrentes en estos dos
documentos, metadatos de datos conservados y cero ediciones productivas propias,
instalaciones, conexiones PG reales, arranques de servicios o commits de Tesla.

**Estado operativo del 25/10 comunicado por el principal, sin repetir diagnóstico:**
una compilación ordinaria elevada por servicio mantiene TS5033/EPERM exclusivamente en
`dist/servidor.js`; API y geo terminan exit2 con `entryExists: false`.
Evidencia: `.turbo/cuatro-categorias-2026-10-22/operacion/revision-20261025/compilacion.json`
y los dos `build.log` de esa revisión. No hay listeners4000/4001/4002/4100 y falta
`runner.lock`; último arranque de Windows23/10. No hay causa antivirus confirmada.
El usuario respondió **«Reiniciaré Windows y avisaré»**: la pregunta quedó respondida;
el reinicio de Windows y su aviso siguen pendientes del usuario.

Después del aviso y de recuperar las entradas compiladas, corresponde iniciar la demo por
el procedimiento ordinario y obtener `snapshot-demo.mjs despues-reinicio`, comparándolo con
`operacion/antes-reinicio.json`, sin repetir seed/load. Luego faltan los **14 E2E reales**
y resolver/verificar el marcador M6. Los14focales de H1/H2 y los dictámenes CONFORME ya
recuperados no son14E2E aprobados. **No se marca fase cerrada ni demo disponible ahora.**

### Recuperación confirmada después del reinicio de Windows, 25/10

El usuario reinició y avisó. Último arranque acreditado: 25/10 00:15 Bolivia.
Las dos compilaciones ordinarias concluyeron con exit 0 y entradas presentes:
`operacion/post-reinicio-windows-20261025/compilacion.json` y logs respectivos.
No se cambiaron permisos/protecciones ni se ejecutaron entradas alternativas.
El resultado resuelve el bloqueo operativo; no identifica su causa original.

El runner normal `iniciar` volvió a comprobar destino, roles y ACL de la base nueva.
Los cuatro servicios respondieron HTTP 200 y configuración anunció las cuatro categorías.
La sesión de demo es 33713, PID principal26852. No se repitió preparar, seed ni carga ETL.

`snapshot-demo.mjs despues-reinicio` terminó0 y emitió literalmente
`REINICIO_CONSERVA_TABLAS_Y_HUELLAS`. Comparó las seis tablas contra el snapshot anterior:
7usuarios/40reportes/2fotos/4contadores/16auditorías/4categorías, con todas las huellas iguales.
Evidencia: `operacion/antes-reinicio.json` y `operacion/despues-reinicio.json`.
Esto verifica la conservación observada en este reinicio, no una pérdida de energía arbitraria.

Tras cerrar aplicaciones el usuario, la guarda registró3016MiB libres e inició la corrida
`demo-20261025-ae8811b2`,14casos,1worker,0reintentos. Los siete casos desktop aprobaron,
incluido el oráculo exacto de marcador M6 para las cuatro categorías, raster recibido y
cero eventos de pérdida de contexto WebGL/CSP. Selector y cuatro formularios móvil ya
aprobaron; el resultado completo aún está pendiente. Ver el directorio
`e2e/salidas/demo-20261025-ae8811b2/` del scratch, con logs y capturas de mapa.

### Resultado integrado final de navegador, 25/10

La corrida anterior terminó con exit0: **`14 passed (3.0m)`**. `playwright.json` registra
14expected/0unexpected/0skipped/0flaky y un único resultado passed con retry0 por caso:
siete desktop y siete móvil. `resultado.json` conserva `inputChanges: []`.
Comando ejecutado: `node .turbo/cuatro-categorias-2026-10-22/e2e/ejecutar-demo.cjs`;
su wrapper lanzó el CLI local con `--config=e2e/playwright.cuatro-categorias.config.ts`.
No se instalaron navegadores ni se relajaron límites/CSP para pasar los casos.

Pasaron selector/URL/preferencia; cuatro formularios por dispositivo con cámara/GPS;
publicación con demora real; detalle/fotos/privacidad; marcador exacto M6 y raster;
validación técnica y descargas CSV/GeoJSON por categoría/«Todas»; prohibiciones de la
cuenta ciudadana y permisos de ejecutivo/admin. No se utilizaron secretos ausentes como
motivo de omisión: ningún rol quedó skipped. Cámara/GPS fueron dispositivos sintéticos,
con APIs reales de navegador; no se certifica hardware físico.

El mapa pendiente de M6 pasó en los ocho detalles creados, conservando la aserción ARIA
exacta, raster recibido y cero eventos de pérdida WebGL/CSP. El fallo previo de G1 se
conserva: esto acredita ese comportamiento en la instalación nueva y no otra ejecución
del G1 completo. Capturas originales extraídas de attachments sin edición en `capturas/`.
Se inspeccionaron visualmente Áreas verdes desktop y Baches móvil, con mapa real y avisos.

La guarda inicial fue3016MiB; las muestras durante ejecución bajaron hasta1209MiB.
No se afirma un mínimo constante de2500. Los controles de origen y parámetros no cambiaron.
La lectura final con guardas de destino/OID registró9usuarios/48reportes/6fotos,
cuatro categorías activas y ocho reportes del run validados, dos por categoría.
Evidencia en `operacion/resumen-entrega-20261025.json`. Los ejemplos previos se conservan.
El proceso de E2E terminó; el runner de demo sigue abierto (sesión33713/PID26852).
La revisión independiente de cierre usa estos resultados, sin volver a ejecutar suites verdes.

### Dictamen y documentación de cierre

`revision.md` entregó CONFORME para cierre funcional local M6–M8: CA1–9 acreditados y
revisión/auditoría de CA10 conforme, con la actualización editorial pendiente del principal.
Esa observación se atendió: informe, checkpoint, índices, guía y apartados autorizados de
los manuales sincronizados; inventario actualizado sin duplicados. No hubo cambios de
producto ni reejecución de suites verdes para esta corrección documental.

El revisor distinguió12mensajes de consola clasificadosCSP en panel/admin de una violación
confirmada. Un diagnóstico focal posterior inició con2995MiB, visitó bandeja y detalle con
admin local, guardó0mensajesCSP/0eventos de violación y canvas1 en ambas rutas; exit0 y
navegador cerrado. No modificó políticas ni reportes. Evidencia `e2e/csp-panel-20261025.json`.
No explica los mensajes anteriores ni certifica «cero CSP» en toda la instalación; se
mantiene esa limitación antes de producción. El verde14E2E conserva su alcance original.
