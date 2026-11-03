# M6 — revisión independiente por entregas

## M6.1 — contratos, 2026-10-19

**Conforme en el alcance de contratos, sin hallazgos bloqueantes.** Banach
`01a153da-f962-7f92-bbb9-031b6206486c` revisó en lectura el diff contra F0/HEAD,
CA1–CA3 y el inventario autorizado. Su entrega íntegra con referencias de código y
57 huellas está en `.turbo/m6-2026-10-18/revision-contratos/entrega.md`.

Confirmó preservación de la entrada plana/normalizador, los payloads anteriormente válidos
y los negativos de Inundación/legado. La nulabilidad exige otra categoría explícita no vacía;
la misma condición Zod genera la representación de OpenAPI. No se añaden campos privados
a las respuestas públicas/propias. Dominio, versiones, radio/cupo y las adaptaciones de
pruebas coinciden con las decisiones aprobadas. No hubo cambios entre las huellas de apertura
y cierre de su revisión.

La revisión analizó el YAML ya generado: nueve condiciones iguales, 91 referencias locales,
ninguna colgante. **No ejecutó suites, tipos ni builds**: los 419 casos aprobados y demás
resultados de ejecución corresponden al escritor Avicenna, identificados en `verificacion.md`.
Las derivaciones Zod conservan checks con `strict/safeExtend`, pero deben aplicar metadata
al final antes de serializar; los finales canónicos actuales la incluyen y esto está documentado.

La conformidad contractual no certifica la validación efectiva del subtipo antes del cupo,
las respuestas HTTP, recorte público, jitter/logs ni el piloto. Esos controles corresponden
a API y F4. Los once errores de nulabilidad de P1 siguen pendientes hasta M6.4; el conjunto
M6 todavía no tiene conformidad final, ni aprobación de producción o activación habitual.

## M6.2 — API, 2026-10-19

**Conforme final en el alcance API, sin hallazgos bloqueantes.** Banach revisó las ocho rutas
entregadas y las pruebas/helpers necesarios en lectura. Entrega íntegra con referencias de
código y huellas en `.turbo/m6-2026-10-18/revision-api/entrega.md`. Tras existir la entrega
final de Raman confirmó que los ocho hashes seguían iguales al corte revisado.

El control de subtipo precede a PIP/cupo y ambas formas de petición pasan por el normalizador
vigente. La nota por selección usa el registro efectivo y las filas exportadas, conserva
Inundaciones exacta y declara límites de historial/truncamiento; el CSV mantiene escapado,
columnas y comentarios multilínea. No se identificó ampliación de permisos, datos privados
ni cambios en E1, idempotencia o demora. Los negativos anteriores siguen presentes y las
pruebas nuevas crean/moderan reportes por API sobre su PGlite propio.

Comparó por lectura los JSON guardados: 448 nombres anteriores presentes con los mismos
436 PASS/doce omisiones, más 59 aprobados nuevos. **No ejecutó producto ni pruebas**;
495 PASS, tipos/build/Biome y demás resultados siguen atribuidos a Raman. La conformidad
API no sustituye la F4 global, geoespacial/UI ni el piloto real y su restauración.

## M6.3 — geoespacial, 2026-10-19

**Conforme acotado P4, sin hallazgos bloqueantes.** Banach revisó las seis rutas congeladas
contra CA6–CA7, inventario y aislamiento. Evidencia con referencias y hashes en
`.turbo/m6-2026-10-18/revision-p4/entrega.md`; las seis huellas se conservaron.
La comparación estricta 4×radio mantiene Inundaciones en 100 m y Baches en 40 m, sin alterar
la agrupación. Pruebas de pertenencia entre motores, propagación de errores, geometría pública,
privacidad y cachés coherentes con el plan. Los fixtures SQL son PGlite unitarios aislados,
sin conexiones al PostgreSQL real del piloto.

No ejecutó producto ni controles pesados; DB322/Geo82 y 39 casos nuevos siguen atribuidos
a Tesla. La revisión no sustituye F4 global ni el piloto, sus guardas y restauración.

## M6.4–5 — web y panel, 2026-10-19

**Conforme acotado P1/P2, sin hallazgos bloqueantes.** Banach revisó las 13 rutas congeladas
contra CA8–CA10 y el inventario: diez web y tres panel. Entrega íntegra con referencias y
huellas en `.turbo/m6-2026-10-18/revision-ui/entrega.md`; 13/13 iniciales/finales y entregas
coincidentes, incluida la entrega P2 publicada durante su lectura.

Confirmó presentación nullable sin estimaciones inventadas, tipo legible desde la definición,
formulario genérico conservado y alias técnicos canónicos. Ficha, notas/exportación recibida,
roles/fusión y fallbacks tienen cobertura unitaria real sin reemplazar los sintéticos.
No ejecutó producto ni recalculó resultados/AST:724 web y586 panel son de los escritores.

Los unitarios no prueban cámara/getUserMedia, cuatro pasos interactivos, foco/teclado,
encuadre MapLibre ni persistencia real; P2 usa sesión/fetch/mapa simulados y su prueba CSV
valida URL/filtros, no la composición del archivo del servidor. Esas comprobaciones quedan
para piloto/F4. No se certifica navegador, PostgreSQL real ni despliegue por esta revisión.

## Auditoría parcial de seguridad — 2026-10-20

Averroes entregó `.turbo/m6-2026-10-18/auditoria/entrega-parcial.md`: sin hallazgos
bloqueantes en las barreras estáticas efectivamente leídas. Revisó condicional nullable,
validación antes de cupo/PIP, replay/dispositivo, vistas y roles, notas/escapado CSV y partes
de privacidad/caché geo/UI. Capturó 42 hashes, sin segunda captura ni cotejo completo de
todos los manifiestos. No ejecutó producto, pruebas ni escáneres y no certifica todo M6.1–5.

La orden de cerrar ese bloque fue del coordinador, no una nueva instrucción humana de
reducir la auditoría. Se conserva esa distinción frente al texto de la entrega scratch.
Faltan lectura complementaria indicada, controles dinámicos de F4 y revisión crítica del
arnés/recuperación antes de la primera activación. Auditor cerrado, recuperable para ese bloque.

## Núcleo del arnés, lote 1 — 2026-10-20

Averroes revisó íntegramente las dos fuentes preliminares, sin ejecutarlas, y entregó
`auditoria/nucleo-lote1.md` con hashes estables de apertura/cierre. **Sin conformidad CA11**:

- N1: listeners retirados antes de stop/CAS dejan desprotegido el cleanup.
- N2: temporales `.pending` no tienen todavía reconciliación operativa segura.
- N3: opciones inválidas enmascaran los 144 negativos de URL; exigir opciones base válidas
  y razón exacta con cero clientes, además de controles positivos por modo.
- N4: pérdida real del owner PG no está representada por lanzar una cadena desde `run`;
  no usar una sesión muerta/sin lock para CAS ni prometer restauración automática.
- N5: contención física de raíz/ancestros/lock y correspondencia de ruta/runId incompletas.
- N6: sanitización de errores necesita códigos propios conocidos, no solo formato de texto.

Devueltos a Euclid dentro de sus dos rutas aprobadas, junto con las pruebas de fallos/eventos
pendientes. Sin activación hasta resolver y revisar estos hallazgos. La ausencia declarada de
adaptadores reales/config/spec no se interpreta como una regresión de producto.

## Núcleo, correcciones del bloque 2 — 2026-10-20

Averroes entregó `auditoria/nucleo-bloque2.md`: **N1–N6 resueltos en el alcance estático**,
con límites documentados y hashes iniciales/finales iguales a la cesión. Leyó íntegramente
núcleo/test y sus salidas, sin ejecutarlas. Los241 PASS, Biome/sintaxis/tipos declarados
siguen atribuidos al escritor.

La recuperación preserva temporales como evidencia y falla cerrada si no existe original
íntegro verificable; no fabrica `before`. La pérdida PG exige recuperación explícita en una
sesión nueva, sin CAS en la sesión muerta. No se certifican kill real, caída real de PG,
pérdida de energía ni sustitución hostil concurrente de directorios locales.

Se liberó el núcleo para escribir adaptadores reales en el mismo archivo; estos cambios,
entorno/roles/CAS SQL, procesos y configuración/spec requieren nueva revisión antes de PG.
No equivale a CA11–CA12 ni autoriza activación. Euclid escribe sin pesado; Helmholtz ejecuta F4.

## Integración de configuración y diarios — N7, coordinador

Hallazgo por lectura del principal, sin ejecución: la configuración nueva sitúa resultados
de grupo/listado bajo `.turbo/piloto-m6/<id>/`, mientras `diskStore.pending` trata los directorios
sin diario válido de esa raíz como pendientes/corruptos. Un grupo no crea diario de activación;
sus artefactos podrían impedir la corrida siguiente. Devuelto a Euclid para separar explícitamente
resultados y diarios conservando la ruta de recuperación, con prueba grupo→siguiente corrida.
No relajar la detección de diarios incompletos ni borrar evidencia. Pendiente de implementación
y comprobación; no se afirma un fallo observado en ejecución.

## Adaptador PG escrito — revisión previa a ejecución

Averroes entregó `auditoria/adaptador-pg-lectura.md`, con fuentes estables al corte y sin
ejecutarlas. URLs, carga perezosa, saneado padre, roles, esquema/migraciones canónicos,
lecturas y CAS acotado están bien encaminados; quedan **PG1–PG3** antes de PG real:

- Confirmar explícitamente la etiqueta `COMMIT`; cualquier confirmación incierta debe dejar
  recuperación requerida, sin interpretar una respuesta resuelta cualquiera como éxito.
- Ejercitar la matriz de privilegios no vacía y permisos por columna; los nuevos dobles
  iniciales la dejaban vacía y no ejecutaban esas ramas.
- Definir resultado desconocido/timeout y cierre acotado: `query_timeout` no demuestra que
  el servidor haya cancelado ni autoriza reutilizar la sesión como si el lock siguiera asegurado.

Devueltos al escritor dentro de módulo/test. Las241 aprobadas corresponden al núcleo previo,
no a estos adaptadores todavía sin ejecutar. Launcher/storage/CLI/spec quedan para revisión
del conjunto. No se autoriza PG ni activación por este dictamen.

## Protocolo de control — N8, coordinador

Lectura de integración, sin ejecutar: publicar un request en su nombre definitivo antes de
terminar write/sync permite que el consumidor lea JSON parcial. El mismo límite afecta la
respuesta si el runtime la publica de esa forma. Devuelto al escritor para publicar ambos
mediante temporal único, write/sync/close y rename; validar nonce/runId y cancelación, con
pruebas de escritura parcial. No se atribuye una carrera observada en navegador.

N7 ya está corregido en fuente: artefactos en `.turbo/piloto-m6-artefactos/<id>/` y diarios
en `.turbo/piloto-m6/<id>/catalogo.json`. La prueba de tránsito entre grupos está escrita,
pendiente de ejecución. No se relajó la detección de diarios corruptos ni se borró evidencia.

Relectura PG1–PG3: `auditoria/pg1-3-correcciones-lectura.md` acepta PG1/PG2 por lectura
de tramos idénticos antes/después. PG3 mejora deadline/cierre/cancelación, pero `EPIPE`
coincide con el patrón de cinco caracteres usado para SQLSTATE: sin evento adicional podría
conservar live/held. Devuelto al escritor para clasificar ese transporte y cubrirlo con doble.
No se observó una caída real ni se ejecutaron las pruebas nuevas en esta relectura.

## Lectura de configuración/spec — I1–I5

Banach entregó `revision-piloto/lectura-spec.md`, solo lectura de config/spec y componentes
reales; recapturó y releyó la spec después de un cambio concurrente. Cinco observaciones
devueltas al escritor, sin cambios de producto ni ampliación de inventario:

- I1: esperar el encabezado real «Reportar un punto» y comprobar Baches en su control.
- I2: no mezclar el payload Flood plano con `categoria` sin el `detalle` de la forma nueva.
- I3: pasar el predicado obligatorio a `esperarRedQuieta`.
- I4: comprobar cambio de categoría en el mapa raíz, no en la ficha individual sin selector.
- I5: activar severidad por UI y demostrarla antes de comprobar su limpieza.

Son incompatibilidades/cobertura inferidas por lectura de pruebas nuevas aún sin ejecutar;
no se atribuyen como regresiones observadas del producto. Corrección y ejecución pendientes.

Relectura posterior: `revision-piloto/i1-5-correcciones.md` acepta I1–I5 en config/spec
corregidas,13 hashes iniciales/finales iguales y sin nuevos bloqueos concretos en ese alcance.
Sin ejecuciones propias ni conformidad completa CA11/12. El runtime MJS en construcción
queda fuera de esa lectura y aún requiere revisión antes del piloto.

## Integración del runtime — N9, coordinador

Lectura del runtime recién añadido: `deps.stop` podía cerrar los procesos correctamente y
luego lanzar `controlError`. El núcleo interpreta un error de stop como cierre sin comprobar
y omite CAS/restauración; un rechazo del controlador con owner sano podía dejar el catálogo
pendiente aunque el cierre sí se hubiera probado. Devuelto al escritor para separar el error
del recorrido del resultado de cierre, manteniendo recuperación ante pérdida de sesión.
Prueba requerida con controlador fallido/owner vivo y contraparte de owner perdido. Es una
trayectoria inferida por lectura, sin caída ni activación observadas en PostgreSQL real.

El escritor corrigió N9 y `runtime-unit-intento1` pasó342/342 al corte20/10 23:37,
con las dos variantes de sesión. Pendiente relectura del conjunto real antes de PG; no se
convierte esa ejecución con dobles en restauración observada de un catálogo PostgreSQL.

## Auditoría completa del runtime — R1/R2,21/10

Averroes entregó `auditoria/runtime-conjunto.md`, cinco hashes antes/después iguales al
freeze11:53UTC. Integración PG1–PG3/EPIPE y N7–N9 sin otros bloqueantes identificados;
dos correcciones necesarias antes de emitir el receipt general o ejecutar cualquier modo:

- R1: `windowsHost.stop` podía devolver éxito con root ausente y descendiente restante,
  o sin detectar un descendiente creado entre capturas. No acreditar cierre/restored sin
  comprobar descendientes relacionados; si su propiedad/cierre es incierto, fallar cerrado.
  Mantener identidad/huella y prohibición de matar un PID ajeno o reutilizado.
- R2: runtime no propagaba su cancelación al launcher/start/readiness; cancelar mientras
  esperaba ready podía permitir go y servicios siguientes. Propagar señal y comprobarla
  en cada frontera de arranque, cerrar workers propios gated y rechazar la espera.

Devueltos a Euclid dentro de las rutas aprobadas, con negativos dirigidos y nuevo freeze.
Son trayectorias de código, no fugas/activaciones observadas. No se reabren los dictámenes
del núcleo o spec ni se pide otra aprobación humana. Receipt ausente y PG siguen cerrados;
el receipt actual no separa modos, por lo que tampoco se elude para preflight aislado.

### Relectura del diff R1/R2

`auditoria/runtime-r1-r2-correcciones.md` acepta R2 por lectura e integración. R1 mejora
el cierre en el mismo host, pero su Map de relaciones no es durable: en recuperación con
host nuevo puede perder el enlace123→124→125 y aceptar root ausente aunque sobreviva125.
Residual devuelto al escritor: conservar evidencia durable del cierre incierto/relaciones y
consumirla antes de CAS en una nueva instancia, sin matar identidades desconocidas. Prueba
dirigida con mismo diario/host nuevo y recuperación posterior al acreditar cierre.
Cinco hashes estables en la relectura. No receipt general,PG ni navegador; no se reabre R2
ni el resto del dictamen. Copias exactas freeze353 preservadas en `coordinacion/pre-r1-durable/`.

### Residual durable resuelto —21/10

`auditoria/runtime-r1-durable-correcciones.md`: Averroes revisó exclusivamente el diff contra
esas copias353 y su integración. **CONFORME para emitir el recibo general** del freeze363,
sin bloqueante residual concreto. Evidencia prepared durable anterior a kills; relaciones
acumuladas leídas por un host nuevo; observed/closed antes de éxito y stop antes de CAS.
La prueba de125/parent124 conserva applied/cero CAS restaurador hasta acreditar cierre;
write/sync/close/rename fallidos conservan pendientes, sin eliminar evidencia ni inventar cierre.

Cinco hashes iguales antes/después y coincidentes con cesión13:06UTC. Informe solo de lectura;
363 ejecuciones corresponden al escritor y después al verificador independiente. No se reabre
R2 ni el resto de dictámenes. La conformidad habilita los controles conectados del plan,
sin sustituir preflight, regresión, piloto ni restauración real aún pendientes.

### Matriz previa de cierre

Banach entregó `revision-final/matriz-previa.md`:63 rutas esperadas/observadas,42 producto+
5 E2E+16 documentos, sin extras/faltantes;42 hashes producto y5 E2E conformes. Reutiliza
sus lecturas anteriores y F4, sin repetir fuentes ni ejecutar producto. CA1–7 tienen cobertura
estática/unitaria con los límites descritos; CA8–10 necesitan el recorrido vivo. CA11/12
siguen abiertos hasta piloto/regresión/restauración. La matriz no sustituye esos resultados
ni declara M6 cerrada. Posteriormente el primer preflight real se detuvo en fotos; diagnóstico
registrado en verificacion.md y scratch, no convertido en un hallazgo de esta lectura anterior.
