# M6 — seguimiento de verificación

**Estado: implementación en curso, M6 no cerrada.** Los resultados de FB son la referencia
anterior a la implementación. No equivalen a una verificación posterior del producto modificado.

## Referencia confirmada

La [línea base independiente](linea-base.md) terminó antes de ceder la escritura M6.1.
2381 pruebas aprobadas (1093 nuevas y 1288 recuperadas de caché), con doce omisiones PG/S3.
G1–G5 dieron 197 aprobadas y una omisión intencional, sin fallos ni reintentos.
Tipos, builds y OpenAPI correctos; los rojos globales y la cobertura del escáner constan allí.
Intentos interrumpidos, salidas originales y nombres se conservan en
`.turbo/m6-2026-10-18/fb/`; no se sustituyen por resúmenes sin evidencia.

## Puntos de aceptación que deben verificarse después

| Criterio del plan | Evidencia que falta para el cierre |
|---|---|
| CA1–CA3, definición y contratos | Registro real, matriz 16 casos, esquema estricto, nulos condicionales, payloads anteriores, OpenAPI y consumidores |
| CA4–CA5, API y cupos | Creación/idempotencia/demora, validación antes de cupo, fotos globales, roles, auditoría y fusión entre categorías |
| CA6–CA7, datos/geo | Aislamiento de categorías y vista; radios reales, aviso por diámetro y equivalencia de agrupaciones/motores |
| CA8–CA9, web | Formulario declarativo real, etiquetas, cámara/envío y cambio de mapa con URL/preferencia/borrador/cupo |
| CA10, panel | Bandeja/detalle/ficha, notas y exportación con Baches/Inundaciones/Todas; límites del ejecutivo |
| CA11, operación | Guardas anteriores a cualquier conexión, diario durable, exclusión, CAS y recuperación/restauración del catálogo |
| CA12, regresión y UI | Comparación por caso contra FB y piloto real escritorio/móvil, CSP y accesibilidad DOM/teclado |

Cada entrega del escritor debe incluir suite/tipos antes y después, cambios exactos y evidencia.
La F4 independiente contrastará el árbol final con esos criterios y con los nombres de FB.
Una regresión es bloqueante; una omisión no es PASS. El lector de pantalla real y el despliegue
habitual seguirán sin verificarse si no se ejecutan en una ventana autorizada específica.

## Estado de ejecución

M6.1 entregada por Avicenna: 419 pruebas aprobadas, tipos/build/Biome propios correctos y
dos generaciones de OpenAPI/dominio iguales. Comparación conserva los 363 casos anteriores
(tres renombres justificados) y agrega 56. Entrega y salidas en el scratch M6.1.
El grafo completo tiene once errores P1 previstos para M6.4; el resto pasó 8/8 tareas.
No hay resultado global verde. Banach concluyó la revisión independiente de contratos en lectura
sin hallazgos bloqueantes; alcance y atribución en `revision.md`. La F4 final del conjunto
aún no comenzó. Preflight M6.2/API: 436 PASS/doce omitidas, tipos exit0 y mismos nombres/resultados
de FB. Preflight P4: DB 292 PASS + dos FAIL previstos por el registro nuevo; Geo 71 PASS,
tipos ambos correctos. Los dos negativos deben restaurarse con el registro explícito del plan.
M6.2 entregada por Raman y fuente/pesado liberados, revisión independiente API conforme.
P1 preflight: 643 PASS/dos FAIL previstos y once errores de tipos; P2: 551 PASS/tipos correctos.
P1/P2 tienen sus fuentes preparadas. M6.3 terminó su verificación propia y cedió el pesado a
Planck para post y build web. No se declara cierre global.

API dirigido: 93 casos, diez fallos nuevos reproducidos antes de producción (subtipo y notas),
seguidos de **93/93 PASS** tras la corrección. Evidencia `m6-2/red-intento1-*` y
`focal-intento1-*`. Suite API completa: **495 PASS = 436 previas + 59 nuevas**, doce omisiones
conservadas, cero regresiones ni nombres perdidos. Tipos/build/Biome propios y diff exit0;
integridad `ok=true`. Ver `m6-2/entrega.md` y `integridad-y-casos.json`. El intervalo largo
del corte no se interpreta como medición de rendimiento normal y no se repitió la suite válida.
El catálogo habitual no se ha consultado ni activado; todavía no se ha ejecutado el piloto M6.

P4 entregada: **DB 322/322 y Geo 82/82 PASS**, cero omisiones. Cotejo: los 294/71 casos
anteriores conservados, cuatro renombres Geo mapeados y 39 casos nuevos. Tipos DB/Geo,
build DB, Biome y diff exit0. Biome intento1 detectó formato en dos tests; se conservó el
fallo, se corrigió y se comprobó identidad AST antes/después. Focales posteriores: DB34/34
y Geo21/21; tipos y Biome finales correctos. Evidencia y hashes en `m6-3/entrega.md`.
Tesla congeló las seis rutas y liberó fuente/pesado. Revisión independiente P4 en lectura;
F4 global y piloto aún pendientes.

M6.4 entregada: **web724/724 PASS**, 645 anteriores conservadas (dos renombres explicados)
y 79 nuevas, cero omisiones/regresiones. Focal final139/139; tipos, Biome y build producción
exit0. Los once diagnósticos P1 quedan resueltos. Tras la suite se corrigió formato y el helper
de render del test nuevo; AST de las demás sentencias conservado, focal y tipos finales verdes.
No se atribuye una segunda suite completa a esos ajustes. Detalle/casos/hashes en
`m6-4/entrega.md`; fuente congelada, pesado liberado y sin procesos propios restantes.
P2 completó post completo y build; el piloto y la verificación independiente global no han comenzado.

M6.5: focal35/35 y **panel586/586 PASS**, cero omisiones, tipos finales/Biome/build exit0.
Formato del test corregido conservando el intento previo; fuente de tres rutas congelada.
`m6-5/cesion-explicita.json` confirma ejecución de producto terminada, cero procesos y
liberación del pesado. Sagan completó después su entrega documental y quedó cerrado:
551 nombres anteriores conservados, 35 nuevos, cero pérdidas/renombres/regresiones,
tres rutas finales e integridad `ok=true` en `m6-5/entrega.md` y JSON asociados.
Banach revisa P1/P2 en lectura. Euclid recibió M6.6: preflight propio y arnés/pruebas con
dobles antes de cualquier activación; el catálogo todavía no se ha modificado en M6.

Preflight propio M6.6: **G1 47/47 PASS** sobre artefactos actuales, antes de escribir el arnés,
con Baches inactiva. Salidas `m6-6/e2e-G1-intentopre-*` y `pre-G1-intento1-run.json`.
La revisión UI terminó conforme acotada (13/13 hashes); no sustituye los pasos restantes.

## Cotejo consolidado al 2026-10-20

Estos resultados proceden de las entregas propias de los escritores; no son todavía la
ejecución independiente final de todo el grafo. Las correcciones posteriores de formato/helper,
los focales finales y su relación con la suite completa están declarados arriba y en cada entrega.

| Paquete | FB aprobadas | Post del escritor | Comparación de casos |
|---|---|---|---|
| contracts | 363 | 419 | 363 conservadas + 56 nuevas; tres renombres justificados |
| api-core | 436 + 12 omitidas | 495 + 12 omitidas | 436 conservadas + 59 nuevas; omisiones iguales |
| db | 294 | 322 | 294 conservadas + 28 nuevas; negativos de registro restaurados |
| geo-service | 71 | 82 | 71 conservadas + 11 nuevas; cuatro renombres mapeados |
| web-ciudadano | 645 | 724 | 645 conservadas + 79 nuevas; dos renombres mapeados |
| panel-admin | 551 | 586 | 551 conservadas + 35 nuevas; sin renombres |
| geodata-etl | 21, caché válida | No se repitió en las entregas M6.1–5 | Consumidor pendiente de F4 global |

Tipos/Biome/builds propios aprobados; no hay regresiones abiertas en estos cotejos.
Las doce omisiones API PG/S3 siguen siendo no verificadas. G1 previo del escritor del arnés
pasó47/47; no se reutiliza como si demostrara el arnés aún sin implementar ni el piloto real.
Faltan unitarias operativas del coordinador, revisión de guardas, G1–G5 posteriores, piloto
de dos categorías con restauración y F4/auditoría independientes sobre la fuente final.

## M6.6, lote 1 preliminar

`m6-6/checkpoint-lote1.md`:169/169 unitarias, exit0, con coordinador inyectable y diario.
Sin adaptadores reales ni CLI operativa, sin activación de catálogo. La auditoría posterior
identificó N1–N6 y cobertura insuficiente, incluidos negativos URL que fallaban antes por opciones
inválidas. Correcciones devueltas al escritor: no se contabiliza este resultado como CA11 cumplido.
Pruebas reales de filesystem limitadas a write/sync/rename/lectura; no prueban pérdida de energía.

Fortalecimiento posterior: `bloque2-cobertura-intento1.log` ejecutó214 casos,212 PASS/dos
FAIL al representar eventos `error/end` del owner PG. Reprodujo el marcado falso de restored;
no es el rojo inicial de carga. Tras corregir y ampliar cobertura N1–N6,
`bloque2-correcciones-intento2.log` terminó **240/240 PASS**, cero omisiones, exit0.
Incluye fallos filesystem por fase, recuperación doble y contención de rutas/enlaces.
Formato/cierre y revisión independiente de esos cambios siguen pendientes; no acredita piloto.

Cierre del bloque2:241/241 PASS después del último formato; Biome, sintaxis MJS y tipos E2E
TS exit0. El tsconfig no certifica tipado estático MJS. Auditoría N1–N6 conforme en el núcleo
congelado; adaptadores reales y piloto siguen pendientes.

## F4 estática independiente, en ejecución

Helmholtz comenzó la comprobación de los paquetes estables, excluyendo E2E en escritura.
Contracts intento1:22 suites no cargadas,0 casos,EPERM de renombrado en temporales del sandbox
y timeout de arranque de worker. Se conserva como fallo de ejecutor, sin afirmar regresión.
Intento2 fresco con ejecución escalada: **419/419 PASS**, cero omisiones,
exit0. Evidencia `f4/estaticos/contracts-suite-intento{1,2}-*`. El resto de F4 sigue pendiente.

Contracts independiente completó tipos/build exit0 y dos generaciones aisladas de OpenAPI/
dominio idénticas entre sí y a0.23.0 (`f4/estaticos/openapi-comparacion.json`,ok=true), sin
reescribir el YAML seguido. Las42 fuentes congeladas coinciden en los controles de integridad.
DB independiente en ejecución; aún no hay conformidad global.

DB independiente terminó322/322, tipos/build exit0,294 anteriores+28 nuevos sin renombres,
pérdidas o cambios de resultado; entrega y F4 coinciden por caso. API continúa. Aclaración del
ejecutor: la carpeta temporal alternativa se creó pero no se usó en contracts intento2; la
repetición fue escalada. No hubo rechazo de auto-review ni cambio persistente de configuración.

API independiente:495 PASS/doce omisiones, tipos/build0 y comparación por caso idéntica a la
entrega (436 anteriores+59 nuevos, mismos skips). Geo independiente:82/82,tipos/build0;
cotejo de casos en cierre. Fuentes42 conformes. F4 continúa con interfaces/ETL/controles globales.

Geo cerró además su cotejo:71 anteriores+11 nuevos, cuatro renombres mapeados, sin pérdidas
ni cambios de estado. Web independiente terminó **724/724 PASS**, tipos/prebuild/build exit0,
645 anteriores+79 nuevos y dos renombres conservados. Las42 fuentes siguen coincidiendo.
Panel, ETL y controles globales pendientes al corte; no se declara F4 global aprobada.
El adaptador PG añadido después de los241 casos tiene pruebas escritas todavía sin ejecutar;
esos241 PASS no certifican el código nuevo ni el futuro launcher.

Panel independiente: **586/586 PASS**, tipos/prebuild/build exit0;551 anteriores+35 nuevos,
sin renombres/pérdidas/cambios de estado. ETL completo intento1 terminó exit1:19 PASS y
dos casos sin ejecutar por timeout120s en `beforeAll` de PGlite (`carga.test.ts:144`).
No hubo aserciones fallidas. La repetición aislada del archivo, con mismos límites/fuentes,
pasó **6/6**,exit0. Consolidación por archivo:15 de los otros dos+6 focales=21 casos de FB
aprobados, sin omisiones actuales. No se atribuye una segunda suite completa ni una causa raíz
probada del timeout; el intento inicial se conserva íntegro. Tipos/build ETL y globales pendientes.

ETL tipos/build exit0. F4 paquetes estables consolida **2649 PASS y doce omisiones API**,
tipos7/7 y builds7/7 aprobados, con la composición por archivo ETL declarada arriba.
Biome de las fuentes estables exit0. Los primeros controles globales observaron E2E aún en
escritura: seis errores de formato/imports y dos cadenas de conexión de fixtures señaladas
por el escáner. Se devolvieron al escritor, sin exenciones nuevas ni modificación de reglas.
Ese corte temporal no certifica los bytes finales E2E; se requiere control tras congelarlos.
El global conserva además el error/seis avisos ajenos de FB. Auditoría de dependencias y
entrega final del verificador aún en consolidación al registrar este punto.

Entrega F4 estática recibida: `f4/estaticos/informe.md` y `casos-conformidad.json` confirman
2381 casos FB conservados+268 nuevos, nueve renombres explícitos y doce omisiones API iguales.
No se usó caché Turbo para acreditar los resultados actuales. Integridad:42 fuentes entregadas,
569 inputs estables y seis inputs raíz conformes. Guardas mínimas2339MiB, umbral1500;
cesión explícita02:38UTC con cero procesos. Euclid recibió después el pesado para M6.6.

Audit:4high/12moderate/1low/cero críticas. Conserva los tres high de FB y añade
`vite@8.3.0 / GHSA-587h-7wmj-h5pm`(dev, por Vitest/mocker; bypass de existsSync en Windows).
Lockfile y seis inputs raíz intactos: atribuirlo a actualización del registro es una inferencia,
no una modificación de dependencias demostrada en M6. Los JSON high no permiten cotejar por
identidad las dos moderate adicionales; se conserva ese límite. Sin actualización de dependencias.

Retoma21/10: `storage-unit-intento1`329/329 y `launcher-unit-intento1`336/336, después
`runtime-unit-intento1` **342/342 PASS**, cero omisiones, exit0. Incluye N9 con controlador
fallido/owner vivo restaurado y owner perdido pendiente, y guardas CLI/review previas a fábrica.
Son unitarias con dobles y una comprobación gated de proceso propio, sin importar producto;
no equivalen a servicios reales, PostgreSQL ni E2E. README/corte final/auditoría del conjunto
y ejecución de navegador siguen pendientes. Se conservan los logs de todos los lotes.

F4 independiente del arnés: `f4/piloto/unit-intento1` **342/342 PASS**, cero omisiones,
exit0; sintaxis de ambos MJS, tipos y listado12 exit0. Biome de los nuevos archivos/diff exit0.
Secretos final exit0, sin hallazgos en874 archivos leídos/900 seleccionados y81 líneas largas
incluidas. El texto scope del log conserva la etiqueta heredada de un corte concurrente;
los controles actuales comprueban47 hashes(42 estables+5 E2E congelados) antes/después.
Se conserva el original y se aclara esa procedencia, sin cambiar reglas ni repetir el verde.
Biome global sigue exit1 por los problemas ajenos de FB; cotejo por regla en entrega final.
Auditoría del conjunto real en curso, todavía sin receipt, PostgreSQL ni navegador.

Auditoría completa posterior: R1/R2 bloqueantes en cierre de descendientes y cancelación
durante start, sin otros bloqueantes en la integración leída (`revision.md`). Euclid añadió
diez casos dirigidos y `r1-r2-red-intento1` terminó **1 PASS/9 FAIL**, cero omisiones, exit1
contra el módulo exacto freeze342 todavía sin corregir. Reproduce los dos hallazgos; PID
reutilizado ya pasó y debe conservar esa protección. No es una nueva falla de las342 previas
ni se afirma una ejecución de producto. Corrección/post y relectura del diff pendientes.

`r1-r2-post-dirigido-intento1` terminó **10/10 PASS**, cero omisiones, exit0, tras corregir
R1/R2. `checkpoint-r1-r2-correccion.md` documenta seguimiento del árbol, señal runtime→launcher
y marca startAttempted para exigir cierre aun sin primera identidad registrada. Se añadieron
después comprobaciones de esa última frontera; completa/sintaxis/Biome/nuevo freeze siguen
pendientes al corte. Config/spec TS intactas; no se repiten tipos/listado sin cambio de bytes.

Cierre propio R1/R2: `r1-r2-unit-completa-intento1` **353/353 PASS**, cero omisiones,
exit0; sintaxis/Biome exit0. Nuevo freeze cinco rutas12:42UTC, anterior preservado y cero
procesos propios. Helmholtz recibió el pesado para verificación solo del delta; Averroes
relee únicamente diff R1/R2 e integración. Todavía sin receipt,PG ni navegador.

F4 del delta: `f4/piloto/r1-r2/checkpoint.md` registra **353/353 PASS independientes**,
cero omisiones, sintaxis2MJS/Biome cambiado/diff exit0 y secretos global exit0,47 hashes
conformes. Biome global conserva exit1; comparación y cotejo342+11 en cierre del verificador.
Tipos/listado TS y siete paquetes anteriores no se repiten. Relectura R1/R2 pendiente de dictamen.

Residual R1 durable: relectura aceptó R2 pero detectó pérdida de relaciones en host nuevo.
`checkpoint-r1-durable-tests.md` añadió nuevo host/mismo diario real de disco y matriz FS
prepared/closed(write/sync/close/rename), sin PG. El rojo conserva los fallos nuevos contra
freeze353; `r1-durable-post-dirigido-intento1` pasó **20/20**, cero omisiones, exit0, después
de la corrección. Completa/nuevo freeze y relectura exclusiva de este delta aún pendientes.

`r1-durable-unit-completa-intento1` terminó **363/363 PASS**, cero omisiones, exit0,
4847.9961ms Node; sintaxis del módulo y Biome de las cuatro fuentes exit0. Incluye prueba
de wiring runtime/recovery hacia evidencia antes de stop/CAS. Resultado propio del escritor;
falta freeze/cesión y verificación/relectura independientes del delta, sin PG ni navegador.

### Reanudación y controles independientes del corte363 —21/10

`f4/piloto/r1-durable/checkpoint.md` registra ejecución fresca independiente de Helmholtz:
**363 PASS, cero fallos/omisiones**, las353 anteriores exactas y diez nuevas, sin pérdidas,
renombres ni cambios de estado. Sintaxis de ambos MJS, Biome cambiado, secretos y diff exit0;
47 hashes conformes antes/después. El intento1 no se ejecutó por límite al revisar la aprobación;
se conserva separado del intento2 real. No se repitieron tipos/listado TS ni siete paquetes
estables sin cambios. Informe consolidado y disponibilidad para la fase real en preparación.

Averroes entregó `auditoria/runtime-r1-durable-correcciones.md`: **CONFORME** por lectura
del diff durable y sus enlaces runtime/worker, cinco hashes iniciales/finales idénticos al
freeze13:06UTC. R1 residual resuelto; permite emitir el recibo general, sin atribuirle al auditor
las ejecuciones del escritor/verificador. No acredita pérdida de energía, PG ni piloto real.
El recibo y la fase conectada se documentan solo después de ejecutarlos.

Recibo emitido tras cotejo físico de los cinco hashes y resultados independientes, sin cambios
de fuente. Primer preflight real dedicado: `f4/piloto/r1-durable/preflight-intento1-run.json`,
**exit2, `ALMACEN_AUSENTE`**,3,70s, guarda3330MiB. Por el orden del código alcanza la
comprobación de fotos después de conectar/inspeccionar los tres roles y leer catálogo;
esto no se presenta como preflight completo aprobado. No arrancó servicios/navegador ni
activó catálogo; cero procesos propios/candidatos al terminar. Sin reparación, migración o seed.
Diagnóstico solo de lectura en curso para distinguir referencia/archivo ausente, discrepancia
de bytes/hash o lista de fuentes. El primer sondeo de filesystem confirma rutas y espacio,
pero no identifica por sí solo la condición exacta que falló; no se atribuye aún causa raíz.

Diagnóstico conectado READ ONLY concluido en `diagnostico-almacen-pg-intento{1,2}.json`:
tres URLs validadas antes de cargar PG; una conexión solo a `curichi_e2e`, rolcurichi,
transacción read_only=on,ROLLBACK y cliente cerrado. **34 referencias de fotos asociadas;
12 sin archivo en las fuentes admitidas**, condición `!selectedFile`, módulo línea1901.
Los archivos encontrados coinciden en tamaño; sin discrepancias observadas. Referencias
bytes integer(OID23), no error de conversión; espacio12,9GB suficiente frente al mínimo2GiB.
La búsqueda adicional en evidencias M4/M5/M6 y F4 no localiza copias de las faltantes.
No se repararon referencias ni archivos, ni se usó el almacén habitual como fuente.
La inspección inicial FS había sumado cantidades como bytes; sus originales se conservan
y este diagnóstico posterior acredita las sumas reales, sin reutilizar el dato erróneo.

Resta cotejar solo metadatos de las referencias faltantes con el almacén habitual y buscar
procedencia histórica de pruebas, sin asumirla por coincidencia. Si no existe una fuente
sintética verificable, el piloto debe seguir detenido por precondición de datos; no se debilita
el preflight ni se reconstruye la base para sortearla. No es una regresión de producto demostrada.

El cotejo posterior localizó12/12 por basename+tamaño en `infra/.storage/fotos`. Su relación
con cuentas/reportes de E2E se acreditó por el criterio compuesto del diagnóstico; el requisito
adicional de marcaE2E- del primer clasificador no pertenece al helper. Criterio y evidencias
revisados también por Averroes en `auditoria/fotos-fallback-criterio-previo.md`, sin leer código
en escritura ni declarar CONFORME. Helmholtz entregó informe363/diagnóstico y cedió18:12UTC,
0procesos/0PG abiertos. Recibo363 archivado y cinco preimágenes preservadas antes de editar.

Euclid ejecutó baseline363 PASS y añadió casos dirigidos; `fotos-fallback-post-intento1.log`
registra **409 PASS, cero fallos/omisiones**,5,55s Node, después de la corrección selectiva.
Resultado propio aún sin freeze/revisión/F4 independiente del nuevo delta. Biome posterior
exit0; controles restantes y corte final en curso. No hubo nuevo preflight, copia real de las
fotos candidatas ni activación/navegador. El rojo y todos los intentos se conservan.

### F4 y preflight del ajuste409

Freeze18:21:46UTC, `cesion-fotos-fallback.json`:409 PASS finales,0procesos/PG propios,
3881MiB. Averroes dio **CONFORME** al diff contra preimágenes363 en
`auditoria/fotos-fallback-correcciones.md`, cinco hashes iniciales/finales iguales.
Helmholtz ejecutó **409 PASS independientes**,363 previas+46 nuevas,sin pérdidas/cambios
de estado,syntax2MJS/Biome/secretos/diff0 y47hashes conformes. El primer cotejo de nombres
no fue conforme por entidades del reporter; se conserva y el segundo aplica HtmlDecode como
en363, sin repetir la suite ni modificar nombres/pruebas. TS/listado y siete paquetes intactos
no se repitieron. Recibo409 emitido después del cotejo físico por el principal,363 archivado.

`f4/piloto/fotos-fallback/preflight-intento1-run.json`: **exit0, READ_ONLY**,3,87s,
4187MiB y cero procesos/candidatos al salir. Resolvió las34 referencias con las nuevas guardas;
leyó solo el contenido referenciado correspondiente, sin copiar aún al ser preflight ni
activar catálogo, arrancar servicios/browser, reparar, migrar o sembrar. GruposG1–G5/piloto
autorizados y pendientes de resultado. Este éxito no sustituye su ejecución ni restauración.

### G1 intento1: fallo recuperado al reanudar21/10,20:23local

Artefactos bajo `.turbo/piloto-m6-artefactos/m6-ff13caf7-8b50-483f-9687-0294b96a4e09/`:
Playwright **42 PASS,1 FAIL,4 SKIP posteriores por suite serial fallida**,58,66s. El fallo
de chromium/publicacion-diferida.spec.ts:284 espera un marcador de severidadmedia que no aparece
en30s. Hoja/foto/avisos sí cargan; screenshot mapa gris con atribución. No causa raíz probada.
No se debilita esa expectativa ni se convierten esos4 casos no ejecutados en omisiones de FB.

Runtime18:34:23UTC: **FAILED/IDENTIDAD_PROCESO_CAMBIO** durante cierre, separado del fallo
Playwright. Wrapper no tiene resultado final observado; la sesión84608 no es recuperable.
`f4/piloto/fotos-fallback/G1-intento1-recuperado-run.json` conserva esta limitación. CIM nuevo
00:23UTC22/10(20:23local21/10) acredita los5PIDs antiguos ausentes y puertos libres; no se mató
ningún PID ni se abrióPG en esa comprobación. RAM2112MiB. No repetirCLI ni avanzar aG2 hasta
diagnosticar ambos problemas y renovar guardas. Corrección de fuente o expectativa solo en
inventario aprobado; una necesidad fuera se presenta con archivo/motivo/riesgo.

### Diagnóstico de identidad,21/10,20:39 local

Reproducción propia sin PG/Next/navegador en
`m6-6/repro-identidad-intento2.json`,00:38:57–00:39:10UTC: Node+IPC+CIM,guarda>=3431MiB,
cierre por IPC exit0,cero kill reales. Reasignar argv/título no alteró PID/padre/creación/
fingerprint. El autocierre sí rechazó el auxiliar PowerShell creado por su propio observador
CIM,con root intacto y cero llamadas incluso al kill doble. No demuestra la causa específica
del cierre central de Panel en G1: falta snapshot de aquel instante. No normalizar fechas ni
aflojar fingerprint a partir de la hipótesis descartada.

Corrección acotada autorizada al implementador: acreditar/excluir solo el observador exacto
del propio execute y guardar diagnóstico saneado de rama/campo rechazado, manteniendo las
guardas y evidencia durable. Cinco fuentes409+recibo preservados y cotejados en
`coordinacion/pre-identidad-probe409/hashes.json` antes de editar. La corrección todavía
no está entregada ni verificada; no hay recibo nuevo, repetición G1 ni piloto aprobado.

### Corte440 entregado y relevo acotado —21/10,21:22 local

Euclid entregó `m6-6/cesion-identidad-mapa.json`: **440 PASS (409+31)**, tipos/sintaxis/
Biome exit0 y listados12piloto/1diagnóstico/47G1 habitual. Los listados no ejecutaron E2E.
Negativos de identidad y selector conservan sus intentos rojos. Freeze01:15UTC y cesión
01:21UTC, cinco SHA440 iguales;0procesos propios/0PG abiertos y RAM4418MiB. Principal cotejó
los hashes y ausencia de ejecutores relevantes con4828MiB. Preimágenes440 preservadas en
`coordinacion/pre-conhost440/`; no hay recibo440 ni autorización implícita de ejecución.

La reproducción posterior con mismas opciones de fork/windowsHide/stdio acreditó que el
otro descendiente es conhost.exe de System32, hijo del Node propio. El ensayo inicial solo
registró la salida del Node, no la desaparición de su consola. Se requiere reconocimiento
exacto y conservación de su política de cierre natural, sin kill directo ni whitelist por
nombre. El coordinador vivo debe acreditar su ausencia; un worker que termina por sí mismo
no puede certificar el estado posterior. Sin prueba final, cierre pendiente y cero CAS.

Russell recibió ese fix dentro de módulo/test/README, único escritor/pesado,sinPG/Next/browser;
baseline440 fresca PASS. Scratch `m6-6-conhost/`. Averroes revisó solo copias inmutables
409→440: `auditoria/identidad-mapa440-lectura.md`,sin nuevos hallazgos concretos de observer,
privacidad o selección;cinco hashes estables. No es dictamen global del fix de consola ni
sustituye F4 final. G1 sigue fallido y no se repitió ni activó Baches.

### Resultado propio del ajuste de consola —21/10,21:30 local

Russell registró `m6-6-conhost/post457-intento1.log`: **457 PASS**,cero fallos/omisiones,
después de baseline440 y negativos rojos. Todavía no es ejecución independiente.
`real-stop1.json` y `real-stop-intento1.log`: ensayo mínimo con Node propio+IPC+CIM,
sin PG/Next/navegador. El coordinador vivo detuvo únicamente ese Node acreditado y comprobó
posteriormente la ausencia tanto del Node como de su conhost. Cero kill directo a consola,
cero procesos propios restantes; RAM4680MiB. El exit1 del Node corresponde a su terminación
intencional por SIGKILL en Windows, no se presenta como salida normal del servicio.

Este ensayo acredita ese recorrido de cierre central propio; no reproduce Next ni demuestra
la causa histórica del G1, la salida tras pérdida del coordinador o el éxito del mapa.
Freeze/cesión, revisión del delta y F4 independientes siguen pendientes antes del recibo nuevo.
