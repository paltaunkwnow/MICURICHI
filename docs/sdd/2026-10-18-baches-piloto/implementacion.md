# M6 — registro de ejecución

## Inicio: aprobación y F0 (2026-10-18)

El usuario aprobó el plan completo, inventario y ajustes acotados de AGENTS/CLAUDE.
Se creó `codex/baches-piloto` desde `interfaz-prueba`, HEAD
`59b80781030707b8c3334bfbfd40f80000c60a57`, y la referencia `refs/sdd/baches-piloto`
al mismo commit. No se creó commit, stash, reset, push ni PR.

`arbol-inicial.txt` registra el estado; `.turbo/m6-2026-10-18/arbol-inicial.json`
guarda SHA256 de los 877 archivos seguidos al partir. Se preserva el plan tal como fue
aprobado en `plan-aprobado.md` de ese scratch. Los cambios iniciales son cuatro documentos
propios de la preparación, sin modificaciones ajenas funcionales detectadas.

## Documentación de decisiones

Se registró ADR 0024, aceptada para piloto local, y `docs/dominio/baches.md` con campos,
reglas y límites de interpretación. Se enlazaron desde índices y se actualizó el roadmap 14
y `VentanaContexto.md`. Aceptar la decisión no certifica implementación ni pruebas.
AGENTS/CLAUDE no se anuncian en 0.23.0 antes de que el contrato exista y se verifique.

## Línea base

Verificador independiente: Helmholtz `01a150f7-5e7c-7e71-9f31-186c5baeeec2`.
Escribe `linea-base.md`, con salidas en `.turbo/m6-2026-10-18/fb/`. Tiene el único turno
pesado hasta entregar. No se inicia otro ejecutor mientras mide tipos/suites/builds/E2E.
Una primera consulta CIM del principal falló por acceso de sandbox; no produjo una cifra
de RAM. El verificador debe medir con permisos, manteniendo las guardas aprobadas.

La ejecución funcional M6.1–M6.6 todavía no ha empezado en este punto del registro.
Se añadirán entradas y archivos cuando se entregue cada tarea, sin adelantar resultados.

### Recuperación de la interrupción

Se verificaron tipos 9/9 cache hit, contracts 363/21 y DB 294/28 PASS con salidas/JSON.
API intento1 no dejó resultado final: es interrumpido, no un fallo ni aprobación. Consulta CIM
escalada: 2931 MiB y cero procesos de prueba del proyecto activos; no se cerró ninguno.
Se reanudó Helmholtz con API intento2 y continuación de FB, conservando todos los archivos.
El futuro escritor de contracts solo prepara su diseño en lectura; sigue bloqueada la escritura
hasta el cierre de FB y la cesión expresa del turno pesado. No se solicita otra aprobación humana.

### Preparación técnica de M6.1 sin editar

Avicenna `01a150ec-e973-7d13-927e-923b0dcf0ca8` preparó la conservación de ZodObject y
su API `.shape`/`.strict`, con fragmento condicional compartido runtime/OpenAPI y metadata
generada en modo input. Las bases se derivan antes de aplicar checks/metadatos. La lectura
de Zod local confirmó viabilidad; todavía no se ha probado ni escrito. Se retiró la necesidad
de editar dos tests adicionales fuera del inventario (migración 0013 y contrato 0.18).
El principal aceptó esta estrategia sujeta a demostrar equivalencia, conservación de checks
y ausencia de referencias JSON Schema colgantes durante M6.1. No es una excepción de carpeta.

API intento2 terminó con 436 PASS y 12 omitidas conocidas. FB estática/control y navegador G1
continúan a cargo exclusivo de Helmholtz; resultados definitivos en `linea-base.md`.

### FB terminada y cesión a M6.1

Helmholtz entregó la FB completa y liberó el turno pesado. Resultado estático: **2381
aprobadas**, de las cuales 1093 se ejecutaron de nuevo y 1288 proceden de caché válida;
12 omisiones conocidas PG/S3. Navegador: **197 aprobadas + una omisión intencional**, G1–G5
en serie, sin fallos, flaky ni reintentos. Tipos/builds y regeneración OpenAPI correctos;
secretos sin hallazgos dentro de la cobertura documentada. Lint conserva un error/seis
avisos y auditoría tres high/diez moderate/una low, cero críticas. No son regresiones M6.

El cierre físico confirmó puertos de prueba libres, cero procesos propios residuales,
PostGIS/MinIO saludables y catálogo sin modificaciones. Las filas/fotos sintéticas de las E2E
se conservan; no se afirma restauración completa de la base. Salidas, intentos y límites en
`linea-base.md` y `.turbo/m6-2026-10-18/fb/`.

Se cedió **solo a Avicenna** el turno pesado y la escritura de M6.1 en los archivos de
`packages/contracts/` autorizados por §9 del plan. Debe ejecutar su propio preflight antes
de editar y entregar resultados antes/después, rutas exactas, OpenAPI regenerado dos veces
y diagnóstico de consumidores. Su evidencia va en `.turbo/m6-2026-10-18/m6-1/`.
No se ejecuta otra suite/build mientras conserve ese turno. La implementación aún no se
declara terminada ni se anuncia una activación habitual de Baches.

Raman `01a15245-1e4f-7bc3-bca1-7631872bc8ff` preparó M6.2 en lectura, sin editar API ni
ejecutar controles. Su nota `.turbo/m6-2026-10-18/m6-2/preparacion.md` concreta subtipo,
tipos nullable y notas por selección. Identifica que los helpers de publicación existentes
solo actualizan la vista de Inundaciones: los nuevos casos de Baches usarán los caminos de
API/configuración de test, sin modificar ese helper ni escribir reportes SQL fuera de DB.
Espera la entrega M6.1 y la cesión expresa del turno, que sigue en Avicenna.

### Retoma del 2026-10-19

Los agentes de contratos y P4 se detuvieron por límite de uso, sin perder las fuentes ni
salidas. El usuario indicó continuar y se reanudaron ambos. El resultado final guardado de
contracts contiene 419 PASS/cero omisiones; tipos propios PASS y regeneración idéntica.
El grafo excluyendo web completó 8/8 tareas (tres de caché). El grafo entero conserva once
errores en los dos archivos P1 previstos en el inventario: siguen pendientes de M6.4.
Avicenna debe finalizar comparación de integridad/casos y entrega, sin repetir suites íntegras
si los hashes permanecen iguales. El turno pesado continúa reservado a su cierre.

Tesla `01a1524b-1d2b-7652-884b-891d990c0fff` terminó la preparación P4 solo en lectura:
`.turbo/m6-2026-10-18/m6-3/preparacion.md`. Sus cinco archivos existentes conservan sus
huellas y el test nuevo todavía no existe. No se ejecutaron controles P4 de esta tarea.

### Entrega M6.1 y siguiente turno

Avicenna entregó y congeló las quince rutas de contracts incluidas en `archivos.txt`.
Entrega: `.turbo/m6-2026-10-18/m6-1/entrega.md`; integridad/casos y comprobación final `ok: true`.
La entrada plana/normalizador y los dos tests protegidos fuera del inventario conservaron
sus huellas. Las 363 pruebas anteriores siguen aprobadas, con tres nombres adaptados en
dos archivos por los cambios aprobados, más 56 casos nuevos: total 419/23 archivos.
Biome: 51 archivos sin diagnósticos. OpenAPI compilado coincide con el generado, 91 referencias
resueltas y nueve condiciones inline; dos generaciones byte iguales, incluido dominio.json.
Tipos propios aprobados; los once errores P1 permanecen pendientes de M6.4, sin verde global.

Se cedieron expresamente fuente y turno pesado; Avicenna se cerró para liberar concurrencia.
Banach `01a153da-f962-7f92-bbb9-031b6206486c` revisa contratos en lectura independiente.
Se sincronizaron AGENTS/CLAUDE únicamente en las tres secciones autorizadas, marcando 0.23.0
implementada en el paquete e integración/piloto pendientes. No se actualizó su cabecera ni reglas.

Raman recibió el turno **M6.2 preflight API**: suite/tipos antes de editar. Entregará checkpoint
y liberará el pesado para coordinar P4, conservando un escritor por carpeta. Las fuentes API
todavía no se han modificado. La primera cesión no llegó por agente no encontrado tras el corte;
se recuperó con `resume_agent` y la segunda quedó enviada correctamente, sin duplicar ejecutores.

### Preparación de consumidores, en lectura

Planck `01a153e1-0df1-7bd2-b9a1-9f4573d8c82a` prepara M6.4/P1 y Sagan
`01a153e1-0f36-7b23-84c7-1bc0d11e2fcf` prepara M6.5/P2. Solo lectura y nota scratch
propia, sin ejecutar producto ni editar fuentes hasta recibir sus turnos. Sus carpetas de
evidencia serán `m6-4/` y `m6-5/` bajo el scratch M6. La dependencia M6.2/API y el turno
pesado de Raman se mantienen. La revisión contractual de Banach terminó conforme acotada,
se consolidó en `revision.md` y su agente quedó cerrado.

### Preflight API completo y reparto de escritura/ejecución

Raman entregó `m6-2/checkpoint-preflight.md`: 436 aprobadas, doce omitidas conocidas,
tipos exit0 y mismos 448 nombres/resultados de FB. Fuentes API intactas, cero fallos nuevos
tras M6.1. Intento1 EPERM del sandbox sin ejecutar casos; intento2 pasó, ambos preservados.
RAM previa: 3852 MiB suite y 3798 MiB tipos. Liberó expresamente el pesado.

Raman escribe ahora los tests autorizados sin ejecutar producto ni cambiar lógica API todavía.
Tesla tiene el único pesado para preflight DB/geo y tipos antes de editar P4. Al entregar
ambos checkpoints se reasignará la ejecución, sin pruebas concurrentes. P1 y P2 terminaron
su preparación y esperan API. Euclid `01a153e3-32eb-70d2-b04a-9998aa40276e` prepara el arnés
M6.6 solo en lectura; aún no se modifica E2E ni se activa el catálogo.

### Tests API preparados

Checkpoint `m6-2/checkpoint-tests-preparados.md`: nuevo recorrido real Bache y ampliación
de exportación/cupo, tres rutas incorporadas al manifiesto. Las 29 fuentes API siguen
idénticas al preflight. No se ejecutaron los nuevos casos ni se modificó producción todavía.
El negativo de definición ausente conserva intención mediante registro explícito; los datos
de reportes se crean/moderan por API, sin SQL nuevo de escritura de reportes fuera de DB.

Planck, Sagan y Euclid terminaron preparación sin fuentes ni controles ejecutados y se cerraron
para liberar concurrencia. Sus IDs se conservan para retomarlos al entregar las dependencias.
Euclid confirmó las precisiones operativas: backends compilados modo test/Next producción,
CAS con timestamps SQL sin pérdida y pruebas de orquestador anterior a cualquier cliente.

### Preflight P4 y cesión de ejecución API

Tesla entregó `m6-3/checkpoint-preflight.md`: 292/294 DB aprobadas, dos fallos en los negativos
de definición ausente previstos; Geo 71/71 y tipos ambos exit0. Mismos nombres, 108 fuentes P4
y 221 artefactos dist intactos; ningún cliente PG externo. Las importaciones EPERM de sandbox
se conservaron como intentos sin casos ejecutados; los resultados válidos son intento2.
Liberó pesado. Las dos pruebas de DB deben volver a PASS usando el registro explícito aprobado.

Raman recibió el único pesado para focal rojo, lógica de producción y post completo API.
Tesla escribe únicamente tests/README P4, sin ejecutar producto ni construir dist, preparando
la siguiente cesión. Ningún otro agente tiene permiso de ejecución en paralelo.

### API: rojo reproducido y focal posterior aprobado

`m6-2/red-intento1-result.json`: 93 casos, 83 PASS y diez FAIL, todos en objetivos nuevos:
tres subtipos ausentes/null/ajenos aceptados y siete notas de exportación incorrectas.
No hubo importaciones fallidas en esos tres archivos. Se conservó el rojo antes de producción.

Raman incorporó el control por `def.subtipos` antes de PIP/cupo, explicitó nulabilidad de fila
y añadió la función de nota por selección/registro, reutilizada en CSV y GeoJSON. Inundación
retorna la nota anterior exacta; Todas describe categorías incluidas, no filas truncadas.
Los metadatos multilínea del CSV conservan prefijo de comentario en cada línea.
Sus cinco rutas de fuente/README ya están en `archivos.txt`.

`m6-2/focal-intento1-result.json`: **93/93 PASS**, cero omisiones. La suite completa y el
cierre de tipos/build/Biome están en curso; no se da por entregada API hasta sus resultados.
Banach fue recuperado para revisión API en lectura (`revision-api/entrega.md`), sin otro pesado.

### Entrega M6.2 y preflight de consumidores

Raman recuperó la suite completa válida sin repetirla: **495 PASS = 436 anteriores + 59
nuevas**, doce omisiones conocidas y cero regresiones/pérdidas/cambios de resultado.
Tipos/build/Biome propios y diff exit0; ocho rutas exactas, ya en el manifiesto.
`m6-2/entrega.md`, `integridad-y-casos.json` y `cierre.json` documentan fuente congelada,
cesión expresa y cero pesados residuales. La duración de la suite incluye el gran intervalo
del corte: no es un benchmark de rendimiento. No se repitieron contratos ni controles válidos.

Raman quedó cerrado. Banach retoma revisión API en lectura después del límite de uso.
Planck fue recuperado con turno pesado exclusivo para preflight web/tipos ANTES de editar,
ya cumplida la dependencia API. Entregará checkpoint y liberará pesado. Tesla solo escribe
tests/README P4, pendiente de su cesión. Sagan/Euclid siguen cerrados con sus preparaciones.

### Revisión API conforme y preflight P1 terminado

Banach confirmó revisión API conforme en su alcance y ocho huellas finales iguales; consolidado
en `revision.md`. Se cerró su agente sin ejecutar producto. F4 global sigue pendiente.
Planck entregó `m6-4/checkpoint-preflight.md`: 643 PASS/dos FAIL de expectativas del registro,
645 nombres conservados y once errores de tipos previstos. Fuentes intactas al preflight;
ahora escribe las diez rutas P1, sin controles hasta recibir su siguiente turno.

Tesla entregó `m6-3/checkpoint-tests-listos.md`: cinco rutas tests/README incorporadas al
manifiesto, sin tocar producción/dist ni ejecutar los casos nuevos. Cuatro títulos completos
de geo cambian por pasar de definición sintética a real; el cotejo debe mapearlos sin perder casos.
Los dos negativos de DB quedan escritos con registro explícito, aún sin reejecutar.

Sagan tiene el único pesado para preflight P2 antes de editar; después se cederá a Tesla
focal/producción/post P4 y a Sagan escritura. P1/P4 no ejecutan mientras Sagan verifica.

### Preflight P2 terminado y turnos actuales

Sagan entregó `m6-5/checkpoint-preflight.md`: 551/551 casos aprobados en 52 archivos, tipos
exit0, cero casos perdidos o nuevos y 144 entradas P2 intactas. Entornos saneados y guardas
4311/4207 MiB; ningún proceso residual. Liberó pesado y ahora escribe sus tres rutas P2.

Tesla recibió el único pesado para focal rojo de diámetro, una expresión de producción y
post DB/geo/tipos/build DB/Biome. Planck y Sagan escriben sin ejecutar producto. Las tareas
P4 y P1/P2 siguen en curso, no se atribuyen los verdes de preflight a los archivos editados.

### Diámetro P4: rojo reproducido y expresión aplicada

`m6-3/rojo-diametro-intento1-result.json`: cuatro casos seleccionados, tres PASS y uno FAIL
antes del cambio; 24 casos fuera del filtro, sin atribuirles aprobación. La advertencia de
Baches aún usaba 100 m y debía activarse al superar 40 m. Se conserva el intento rojo.

Tesla modificó únicamente la comparación de diámetro en `packages/db/src/puntos-criticos.ts`:
factor de configuración 100/25 multiplicado por `radioGrupo`. La agrupación y los estados
no cambian. Ruta añadida al manifiesto; focal/post completos siguen a cargo de Tesla.

### P1 lista para post

Planck entregó `m6-4/checkpoint-escritura.md` con diez rutas exactas, ya en el manifiesto.
Preparó 57 casos reales y 22 adicionales en tests existentes, conservando negativos y
sintéticos inyectados. Los nulos se presentan sin datos inventados y el tipo usa la etiqueta
de la definición. Su cotejo de lectura confirmó fuente API/contracts intacta y ningún delta
web fuera del inventario. **Todavía no ejecutó post, tipos, Biome ni build**.

Tesla continúa como único pesado P4; sus controles posteriores se orquestan en serie,
guardando fases separadas y deteniéndose ante fallos. Sagan sigue con la escritura de sus
tres rutas P2. Se le aclaró que las ediciones disjuntas no esperan al pesado; una recuperación
de turno con `interrupt` no cambió su scope ni autorizó ejecutar producto.

### Entrega M6.3 y cesión del post web

Tesla entregó `m6-3/entrega.md` y congeló las seis rutas P4: DB322/322 y Geo82/82 PASS,
39 casos nuevos, 294/71 anteriores conservados con cuatro renombres Geo mapeados. Tipos
ambos, build DB, Biome final y diff exit0. El primer Biome falló por formato; se preservó,
se corrigieron dos tests y se verificó identidad AST, focales y tipos posteriores.
No cambió agrupación ni otro código productivo fuera de la comparación 4×radio.

El pesado quedó liberado y Tesla se cerró. Planck recibió post completo P1 y build web
en serie; Sagan tiene sus tres fuentes P2 preparadas y espera el siguiente turno. Banach
revisa P4 en lectura, sin ejecución de producto. El piloto y F4 final siguen pendientes.

### Entrega M6.4 y cesión al panel

Planck entregó `m6-4/entrega.md`: web724/724, 645 casos anteriores conservados y 79 nuevos,
dos renombres explícitos y cero pérdidas/regresiones/omisiones. Tipos finales, Biome y build
producción exit0; once errores P1 resueltos. El formato/helper de render ajustados tras la suite
se comprobaron con AST, focal139/139 y tipos. No se atribuye otra suite completa a esa fase.
Diez rutas congeladas y sin procesos restantes; cedió expresamente fuente y pesado.

Planck quedó cerrado. Sagan recibió el único pesado para focal/suite panel, tipos, Biome y build
de producción, con fixes dentro de sus tres rutas. M6.6 sigue esperando esa dependencia;
no se ha ejecutado todavía un piloto ni la F4 global.

### Panel verificado y comienzo del arnés M6.6

Sagan terminó focal35/35, suite586/586, tipos/Biome/build producción exit0 y liberó
fuente/pesado con cero procesos en `m6-5/cesion-explicita.json`. Después terminó cotejo
documental:551 anteriores+35 nuevos, cero pérdidas/renombres/regresiones, tres rutas y
AST idéntico tras formato; `m6-5/entrega.md`. Agente cerrado, sin más producto.
Banach revisa ambas interfaces en lectura.

Euclid recuperado y único pesado/escritor E2E de las cinco rutas aprobadas: preflight propio,
guardas del coordinador con dobles y arnés/spec dedicados. Se le indicó entregar checkpoint
revisable antes de activar Baches en PostgreSQL real; la revisión crítica debe preceder ese
primer cambio. Las dependencias funcionales M6.2–5 están entregadas/congeladas.

### Checkpoint del 2026-10-20 — primeras pruebas del coordinador

G1 previo terminó47/47; arnés de preflight seguro adaptado de FB, sin migración/seed/activación,
evidencia `m6-6/pre-G1-intento1-run.json` (exit0) y salidas detalladas de G1.
Euclid escribió el test nuevo `e2e/scripts/piloto-m6.test.mjs`, añadido al manifiesto.
`unit-red-intento1.log` registra fallo de carga por módulo coordinador ausente: no demuestra
todavía ejecución de sus aserciones. Implementación y guardas siguen en curso; no hay piloto.

Averroes `01a15717-1e1d-7652-887b-872a20325dd5` audita en lectura los bloques congelados
M6.1–5 y después revisará las guardas antes de activación. No ejecuta producto ni tiene pesado.

### Núcleo preliminar entregado y correcciones operativas

Euclid entregó `m6-6/checkpoint-lote1.md`: coordinador inyectable escrito,169/169 unitarias
preliminares aprobadas y CLI directa cerrada con adaptadores pendientes. Archivo nuevo del
coordinador incorporado al manifiesto. No se conectó PostgreSQL después del G1 previo válido.

Averroes revisó ambas fuentes sin ejecutar y devolvió N1–N6 en `auditoria/nucleo-lote1.md`:
listeners durante cleanup, recuperación de temporales, negativos de URL enmascarados,
sesión owner perdida, contención física de rutas y códigos de error conocidos. Euclid corrige
en el mismo alcance y fortalece los dobles;169 PASS no certifican CA11.

Helmholtz recuperado para preparar solo en lectura la F4 estática de M6.1–5, con E2E inestable
excluida por ahora. Espera cesión expresa del único pesado, que sigue con Euclid. La intención
es verificar fuentes ya congeladas mientras se prepara el resto del arnés, sin dos ejecutores.

### Núcleo241 y cesión de ejecución a F4 estática

`m6-6/cesion-explicita.json` confirmó241/241 unitarias, cero omisiones/procesos y liberación
expresa del pesado. Dos fuentes congeladas para revisión de N1–N6; el escritor sigue siendo
Euclid. No hay adaptadores reales ni activación PG. Averroes revisa `nucleo-bloque2.md`.

Helmholtz recibió el único pesado para ejecutar su preparación `f4/estaticos/preparacion.md`:
paquetes M6.1–5 y ETL, E2E inestable excluida, entornos sin destinos y PGlite/mocks. Puede
leer Git para inventario; no mutarlo. Euclid escribe config/spec/README sin importar/ejecutar
producto mientras espera retorno del turno. La F4 estática no certificará CA11–CA12.

### Correcciones aceptadas y F4 contracts

Averroes aceptó N1–N6 en `auditoria/nucleo-bloque2.md`, sin ejecución propia y con hashes
iguales al corte congelado. Se devolvió a Euclid la escritura del módulo para añadir primero
factory PG/inspect/locks/CAS y pruebas con dobles; no puede ejecutar mientras Helmholtz posee
el pesado. Adaptadores finales deberán auditarse antes de PG; no hay activación.

F4 contracts intento1 no cargó suites por EPERM sandbox, sin casos. Intento2 escalado pasó419/419;
tipos/build exit0, OpenAPI/dominio aislados dos veces idénticos a0.23.0 y42hashes conformes.
DB es el siguiente bloque en ejecución. No se repite FB ni se borran temporales/cachés.
AGENTS/CLAUDE se sincronizaron de nuevo únicamente en §1/4.8/fila7§16 autorizados: M6.1–5
entregadas con controles propios; F4 global y piloto pendientes. Cabeceras/reglas conservadas.

### PG/N8 y configuración del recorrido

Euclid añadió factory PG perezosa, inspect read-only de identidad/esquema/roles/capas/cuentas,
lock de sesión y CAS de cinco campos con timestamp SQL de microsegundos. PG1–PG3 y EPIPE
recibieron correcciones dentro del módulo/test. N7 separó artefactos de diarios; N8 añadió
publicación atómica del canal interno y validación de nonce/corrida. La recuperación CLI
normaliza la ruta aprobada antes de `store.load`. Detalles de los lotes en
`m6-6/checkpoint-pg1-3-escritos.md` y `checkpoint-n8-cli-escritos.md`.

Helmholtz terminó F4 estática y cedió con cero procesos; Euclid retomó el único pesado.
Después del formato, `pg-n8-postformat-unit-intento1.log` confirma **322/322 PASS**;
tipos E2E intento3 exit0 y listado dedicado intento2:12 casos en escritorio/móvil.
Los primeros diagnósticos TS/formato/listado se conservan como intentos previos, sin cambiar
helpers ni specs antiguas. I1–I5 de la revisión nueva se corrigieron en la spec y esperan relectura.
Estos resultados corresponden a ese corte: el storage/runtime añadido después vuelve a
requerir sus controles. La CLI aún falla cerrada, sin PG real ni activación M6.

### Corte del conjunto real del21/10

`m6-6/checkpoint-freeze-conjunto.md`: cinco rutas congeladas con SHA256 y bytes en
`cesion-explicita.json`11:53UTC; antigua cesión conservada aparte. README terminado,
runtime342/342 PASS sobre módulo/test actuales, N9 cubierto, sintaxis/Biome exit0;
tipos/listado12 vigentes por hashes TS sin cambios. Cero procesos propios al ceder.
Euclid queda cerrado y reservado como escritor. Averroes audita el conjunto real y Helmholtz
recibe el único pesado para F4 acotada/global final, todavía sin PG ni navegador.
La CLI implementada exige el receipt con los cinco hashes; no existe aún ni se crea como atajo.
Inventario63/63 conforme al incluir `e2e/README.md`. Fuente estable M6.1–5 permanece intacta.

## Restricciones que continúan

### Corrección prevista de resolución de fotos —21/10

Primer preflight real se detuvo en ALMACEN_AUSENTE:34 referencias asociadas,12 sin copia
en las tres fuentes admitidas. Diagnóstico READ ONLY encontró las12 por nombre/tamaño en
`infra/.storage/fotos`. Para las12, autor=subidor, ambos ciudadanos con email/nombre generado
por cuentaNuevaConSesion y descripción con el prefijo exacto de reporteValido. El diagnóstico
inicial exigía además sufijoE2E-, que solo cumplen6; ese sufijo no es requisito del helper,
que admite marca:string. Se conserva el resultado original y coordinación acepta el criterio
compuesto de procedencia, sin convertir el sufijo adicional en una restricción del producto.

Euclid prepara dentro de las cinco rutas aprobadas un fallback **solo de lectura**, únicamente
para referencias cuyo origen sintético se acredite también en la consulta de curichi_e2e,
si faltan en fuentes conocidas. Mantener nombre validado,physicalPath,bytes/hash y copia
exclusiva al almacén de corrida; no leer otras fotos ni cambiar originales o filas de DB.
Positivos/negativos dirigidos, baseline363/post completo, controles de fuente y relectura del
delta antes de nuevo recibo/preflight. No se afirma implementado ni probado por esta preparación.

No borrar las cachés/logs rechazadas, instalar, descargar, cambiar variables persistentes,
conectar a `curichi`/`curichi_revision`, migrar/sembrar `curichi_e2e`, modificar datos originales
o publicar. La ventana autorizada usa únicamente destino validado de pruebas y procesos propios.

### Resolución de fotos entregada y diagnóstico posterior —21/10

El ajuste previsto arriba terminó en el corte409: pruebas propias e independientes409 PASS,
auditoría CONFORME, cinco hashes cotejados y preflight real READ_ONLY aprobado. Evidencia en
`m6-6/cesion-fotos-fallback.json` y `f4/piloto/fotos-fallback/`. No equivale a piloto aprobado.
G1 posterior falló42PASS/1FAIL/4no ejecutadas, más fallo separado del cierre del arnés;
ver `verificacion.md`. No se han repetido grupos ni activado Baches después de ese fallo.

Euclid tiene las cinco rutas de E2E aprobadas para corregir el autocierre que incluye su
propio observador CIM y añadir diagnóstico saneado del rechazo de identidad. Reproducción
sin PG acreditada; baseline409 volvió a pasar. Fuente409 y recibo preservados con hashes en
`coordinacion/pre-identidad-probe409/`; no reutilizar su recibo después de cambiar fuentes.

También se preparó un selector cerrado `--grupo G1 --diagnostico-mapa` dentro de esas mismas
cinco rutas: un único escenario equivalente, sin activar categorías y conservando gates,
identidades, cleanup, worker1/retry0 y assertion ARIA. La spec antigua y los grupos normales
se conservan. Debe observar errores/recursos/worker/canvas sin datos privados ni trazas de
credenciales; default piloto sigue12 casos. Su implementación y F4 aún están pendientes.
No se presenta ese diagnóstico focal como G1 completo ni como reproducción de toda su secuencia.
