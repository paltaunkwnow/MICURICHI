# Propuesta de cierre de M10 — almacenamiento único con compatibilidad

**APROBADO por el usuario el29/10/2026:** «Aprobar plan, decisiones e inventario», respuesta
a `call_f5f56593962e47059c6c9e9d984ac262`. Incluye ajustes acotados de AGENTS.md/CLAUDE.md.
Ampliación posterior aprobada: [cuatro entradas de guardas/permisos](../2026-10-29-cierre-m10/ampliacion-guardas.md),
respuesta «Autorizar los cuatro ajustes» a `call_f8747937ff1644a885382715293bcd8d`.
El inventario base92más ese anexo suma96rutas; no modifica las garantías u operaciones admitidas.
Ampliación del03/11 aprobada: [precisión del escáner y sus negativos](../2026-10-29-cierre-m10/ampliacion-escaneo.md),
respuesta «Sí, corregir y verificar (Recomendado)» a `call_30337537331d4cdea56061d9a224ca34`.
Sus tres rutas añaden dos al alcance (CI ya estaba incluida):98rutas únicas, sin ampliar
operaciones reales ni retirar hooks/reglas de seguridad. Preimágenes adicionales separadas.
M10.5 quedó cerrado antes de ejecutar este plan; el nuevo trabajo tendrá F0 propio.
Este documento reúne las decisiones y el inventario para evitar
encadenar cambios parciales sin un destino común. No modifica una ADR aceptada por sí solo.
Dirección del usuario el29/10: dejar listo para subir después, sin despliegue ahora;
dominio previsto de la web `micurichi.lat`. No se ha comprobado DNS/propiedad/certificado
ni elegido un dominio de panel o una VPS. No se compran ni aprovisionan recursos.

## Resultado propuesto y decisiones incluidas

Las cuatro categorías ya tienen entrega funcional local. Falta cerrar la transición de
almacenamiento: hoy el trigger todavía reconstruye JSON desde seis columnas de Inundaciones;
la API, los productores internos y algunos operadores todavía escriben esas columnas.
La cuota antigua conserva mantenimiento y privilegios. El respaldo compara columnas que
una contracción retiraría. Evidencia de lectura, no pruebas de un esquema nuevo:
`.turbo/m10-5-2026-10-29/planificacion-restante/inventario-m10-restante.md`.

La aprobación de esta propuesta deberá aceptar expresamente estas decisiones:

1. **Separar contracción física de retiro HTTP.** Cerrar M10 local con JSON como única
   fuente de dominio, conservando ambas formas de POST, alias planos de respuestas y CSV,
   default Inundaciones, filtros y errores actuales. La retirada HTTP queda diferida,
   sin fecha ni adopción supuestas. Esta separación modifica el criterio de ADR0011 y
   13.3§3.4: la ventana medida sigue siendo obligatoria antes de retirar compatibilidad
   externa, pero el almacenamiento puede contraerse tras los ensayos de este plan.
   Mantener la decisión actual sin esta modificación impediría ejecutar el DROP ahora.
2. **Conservar la cuota histórica sin uso operativo.** Antes de retirar la tabla pública,
   copiar su contenido íntegro a `resguardo_m10.cuota_reporte_diaria`, con acceso exclusivo
   del dueño, sin acceso de PUBLIC/API/geo y sin limpieza automática. No sumar sus cifras
   a `cupo_contador`. El archivo conserva UUID y datos de cuota, por lo que sigue siendo
   información restringida. No se fija caducidad ni se autoriza borrarlo. La reversa debe
   reconstruirlo exactamente; si faltan usuarios requeridos, aborta sin inventarlos.
   Si el archivo ya existe, solo se reutiliza con igualdad exacta frente a la cuota
   pública de ese intento; cualquier diferencia aborta sin modificar/sobrescribir/mezclar
   copias. Tras una reversa con cambios legítimos de cuota/usuarios, una nueva contracción
   puede quedar bloqueada: se conserva todo y se necesitará decidir otro resguardo.
3. **Actualizar con parada coordinada, sin mezcla de versiones.** No soportar un escritor
   antiguo contra columnas retiradas ni un escritor JSON contra el trigger antiguo.
   Primero preparar y probar todos los artefactos; después una actualización controlada
   de la instalación autorizada, con respaldo verificado y comprobación de versión.
   El arranque normal no migrará por sorpresa ni resembrará una instalación existente.

Se conserva `contracts`0.24.0, su registro y validadores, versiones de detalle1 actuales,
severidad, cupos nuevos, fotos, identidad, ubicación, visibilidad y estados. No se retiran
enums TypeScript ni se implementa una API nueva. No se modifica ninguna migración histórica.

## Inventario concreto propuesto

Los archivos existentes solo cambian donde dependan de vista, planos, cuota o versión
retirada. Un archivo sin dependencia real se registra no-op; no se edita por llenar una
lista. Fuera de este inventario se informa archivo/motivo/riesgo antes de tocar código.

### Parte4 — packages/db; trabajador raíz, único escritor

| Archivo | Cambio y garantía |
|---|---|
| `packages/db/migraciones/0022_contraccion_compatible.sql` (nuevo, número propuesto libre hoy) | Precondiciones/igualdad100%, archivo de cuota verificado, restricciones JSON equivalentes y retiro ordenado de vista/trigger/funciones/seis columnas/cinco ENUM SQL, sin CASCADE. Transacción completa; ninguna pérdida silenciosa. |
| `packages/db/migraciones/reversas/0022_contraccion_compatible_reversa.sql` (nuevo) | Reexpandir a0021 conservando cuatro categorías, IDs, FK, índices, ACL, detalle y contador; restaurar cuota archivada exactamente. Abortar antes de alterar ante versiones/valores no reversibles. Retirar solo el registro propio de migración. |
| `packages/db/test/migracion-0022-contraccion-compatible.test.ts` (nuevo) | Desde cero,21→22, idempotencia, precondiciones, rollback, permisos, datos/estados de cuatro categorías, NULL/ausente/false y versiones inválidas;22→21→22 sin pérdida. |
| `packages/db/src/esquema/index.ts` | Mirror actual sin objetos retirados; fotos siguen referenciando tabla real; archivo restringido representado si corresponde al contrato interno del mirror. |
| `packages/db/src/mantenimiento.ts` | Quitar acceso a cuota pública retirada; conservar `cuotasDiariasBorradas` como obsoleto con0, sin mezclarlo con el contador nuevo. Mantener todas las demás limpiezas. |
| `packages/db/src/cli/matriz-privilegios.mjs` | Matriz coherente con esquema22, denegación explícita sobre archivo, mismos mínimos de las demás tablas/columnas. |
| `packages/db/src/migrar.ts` | La0022 pendiente requiere consentimiento explícito, también en llamadas generales sin `hasta`; comprobar antes de mutar. Opción interna y SET LOCAL de transacción, sin permiso persistente/heredado. Si0022 ya está aplicada, el no-op no exige volver a autorizarla. |
| `packages/db/src/cli/migrar-comando.ts` | Opción explícita propuesta `--autorizar-contraccion-compatible`, validada y pasada al runner; omitirla rechaza la0022 pendiente. No presume que los servicios estén pausados: el protocolo debe comprobarlo. |
| `packages/db/src/cli/migrar.ts` | Documentar esa opción del punto de entrada; mantener delegación/exit y variables existentes, sin autorización por defecto. |
| `packages/db/test/migrar.test.ts` | Guardas del runner, bloqueo antes de DDL, no-op aplicado, consentimiento limitado a transacción y misma serialización/timeouts. |
| `packages/db/test/cli-migrar.test.ts` | Rechazo de invocación general sin consentimiento, ruta explícita y errores sin secretos; conservar transición0015 y su bandera distinta. |
| `packages/db/src/seeds/samples.ts` | Insertar detalle/versiones; mismas cuentas, RNG, categorías, fechas, cantidades y rechazo en producción. |
| `packages/db/src/test-utils.ts` | Helper actual JSON, misma firma, fixtures y semántica. |
| `packages/db/banco-puntos-criticos.ts` | Productor JSON actual; mismas distribuciones/semilla; no ejecutarlo como operación real en esta tarea. |
| `packages/db/test/db.test.ts` | Conservar comportamiento actual latest y negativos sobre dominio/retención; adaptar almacenamiento, sin borrar cobertura. |
| `packages/db/test/esquema-drizzle.test.ts` | Igualdad del mirror actual, FK y ausencia de vista/columnas retiradas; ningún modo relajado para ocultar diferencias. |
| `packages/db/test/matriz-privilegios.test.ts` | Permisos actuales y rechazo a archivo/API/geo/PUBLIC, sin elevación global de roles. |
| `packages/db/test/m10-consumidores-internos.test.ts` | Mantener cobertura actual seed/helper/FK/limpieza de M10.4; adaptar expectativas de almacenamiento justificadamente. |
| `packages/db/test/migracion-0010-quitar-campos.test.ts` | Solo bloques de integración latest y lecturas de dominio actuales; transición histórica intacta. |
| `packages/db/test/migracion-0013-distancia-dispositivo.test.ts` | Solo consumidor actual si depende de columna/vista retirada; mantener distancias y negativos. |
| `packages/db/test/migracion-0014-cuota-diaria.test.ts` | Transición histórica intacta; separar su garantía antigua de la ausencia/archivo actuales, manteniendo casos de día local, idempotencia y contador nuevo. |
| `packages/db/test/migracion-0015-publicacion.test.ts` | Solo bloques actuales; preservar demora, rangos, visibilidad y consultas de plan. |
| `packages/db/test/migracion-0016-contraccion.test.ts` | Solo integración actual cuando corresponda; conservar transición0016/seguridad sin DEFAULT. |
| `packages/db/test/servidor-local.test.ts` | Fixtures JSON para esquema actual; mismo transporte HTTP original y negativas. |
| `packages/db/test/puntos-criticos-entorno.test.ts` | Tras M10.5 cerrado, adaptar solo inserts/lecturas planas restantes a JSON; conservar latest,2000filas, concurrencia y negativos multicategoría. |
| `packages/db/test/puntos-criticos-metrica.test.ts` | Tras M10.5, misma adaptación JSON sin alterar coordenadas/radios/CRS/métrica ni negativos. |
| `packages/db/test/puntos-criticos-categoria.test.ts` | Productores JSON de fixtures actuales; mantener registro sintético, aislamiento/radios y rechazo de categoría sin definición. |
| `packages/db/test/puntos-criticos-bache.test.ts` | Solo productor SQL si depende de planos, sin cambiar detalle real de Baches ni expectativas de agrupamiento. |
| `packages/db/test/puntos-criticos-cuatro-categorias.test.ts` | Quitar planos de productores de fixture manteniendo geometrías, radio propio, estados, categorías y asignaciones actuales. |
| `packages/db/README.md` | Esquema actual, mantenimiento/archivo, reversa y clasificación de pruebas con límites. |

0022 es un nombre de planificación, no una migración ya existente. Si otra tarea ocupa
ese número antes del F0, detener y presentar la corrección del inventario, sin renumerar
historia ni editarla. Los cuatro tests históricos fijados por M10.5 no se vuelven a latest.

### Parte3 — services/api-core; trabajador raíz, único escritor

| Archivo | Cambio y garantía |
|---|---|
| `services/api-core/src/rutas/reportes.ts` | INSERT solo JSON/detalle_version, conservar transacción, autor, idempotencia/RF-01, huellas históricas, contador, demora y auditoría. Conservar representación persistida de Inundaciones (la0020 omite claves opcionales NULL y mantiene false), sin reescribir datos ni normalizar detalles ajenos. No tocar contratos HTTP. |
| `services/api-core/src/mantenimiento.ts` | Solo anotación/consumo del resumen obsoleto0, si depende de ello; no modificar limpieza de fotos ni su almacén. |
| `services/api-core/src/servidor.ts` | Comprobar versión de esquema admitida antes de habilitar escritores/mantenimiento del release JSON; rechazar21 o estados a medias. No migrar desde el servidor ni llamar a la base durante importación de un módulo de pruebas. |
| `services/api-core/test/m10-arranque-esquema.test.ts` (nuevo) | Prueba aislada/inyección del arranque: versiones admitidas y rechazo anterior/incompleto antes de escribir o iniciar mantenimiento, sin arrancar una instalación real. |
| `services/api-core/test/ayudas.ts` | SQL físico/JSON conservando filtro de categoría donde la vista lo imponía. Cuerpos HTTP planos siguen probándose. |
| `services/api-core/test/m10-compatibilidad.test.ts` | Ambos POST/replay/default omitido, alias idénticos/CSV, precisión y negativos sobre esquema nuevo. |
| `services/api-core/test/moderacion.test.ts` | Solo SQL de fixture/inspección: mismos estados, fusionado, aislamiento y aserciones. |
| `services/api-core/test/exportacion.test.ts` | Fixture JSON, mismas columnas HTTP/CSV, notas y negativos; evitar cambios de expectativas externas. |
| `services/api-core/test/cuentas-y-cuota.test.ts` | SQL de inspección físico+categoría; conservar conteos, identidad desde sesión, cupos y rechazos. |
| `services/api-core/test/cuota-concurrencia-pg.test.ts` | Inspección SQL física con mismo alcance; no autoriza su conexión real ni convertir su SKIP histórico en PASS. |
| `services/api-core/test/ejecutivo.test.ts` | INSERT de fixture JSON, mismas cifras/roles/visibilidad. |
| `services/api-core/test/fotos.test.ts` | UPDATE de fixture físico con categoría; misma retirada/visibilidad/privacidad y almacén simulado. |
| `services/api-core/test/idempotencia.test.ts` | Lecturas/borrados físicos con categoría y mismo aislamiento; conservar reintentos y negativos. |
| `services/api-core/test/indicadores.test.ts` | SQL de fixture JSON y operaciones físicas con mismo alcance; preservar filtros/cifras y comprobación del SQL real sin falsear coincidencias por renombre. |
| `services/api-core/test/listado-zona-horaria.test.ts` | Fixture JSON, mismos días/fechas/zona y resultados. |
| `services/api-core/test/m6-bache-real.test.ts` | Inspección de Inundaciones por predicado explícito tras retirar vista; mantener identidad Baches, separación y todas las pruebas HTTP. |
| `services/api-core/test/m7-m8-categorias-reales.test.ts` | Misma adaptación acotada de inspección, conservando detalles/subtipos/severidad y negativas de Basura/Áreas verdes. |
| `services/api-core/test/no-contaminacion-categoria.test.ts` | Productor JSON actual y filtro flood; mismo aislamiento público/panel/Todas y fail-closed. |
| `services/api-core/test/privacidad-ubicacion.test.ts` | Productor/joins/inspección físicos+JSON sin alterar coordenadas/jitter ni datos que pueden exponerse. |
| `services/api-core/test/publicacion-diferida.test.ts` | SQL físico con filtro donde lo aportaba vista; mismas demoras/estados/exclusión de futuros y API. |
| `services/api-core/test/quitar-campos-del-reporte.test.ts` | Inspección de detalle JSON que reconstruye los mismos valores; conservar rechazo de campos retirados y contrato actual. |
| `services/api-core/test/reportes.test.ts` | Solo conteos físicos equivalentes de fixtures, conservar validaciones/severidad/E1/auditoría y payloads HTTP. |
| `services/api-core/test/resolucion-id-corto-indice.test.ts` | Consulta de plan actual con categoría equivalente, mismo prefijo/selectividad/índice y negativo. |
| `services/api-core/test/resolucion-id-corto.test.ts` | Productor JSON de fixtures, misma ambigüedad/prefijos y resultados HTTP. |
| `services/api-core/test/ubicacion-aproximada.test.ts` | SQL físico equivalente; mantener todos los controles de precisión/ausencia de radio, identidad/retención y no persistencia del dispositivo. |
| `services/api-core/test/ubicacion-dispositivo.test.ts` | Misma adaptación acotada, conservando precisión/antigüedad/radio y no persistencia/logs del dispositivo. |
| `services/api-core/README.md` | Escritura única, compatibilidad conservada y requisito de versión coordinada. |

### Parte4 — services/geo-service; trabajador raíz, escritor posterior a DB

| Archivo | Cambio y garantía |
|---|---|
| `services/geo-service/test/plan-agregados.test.ts` | Productor de fixture JSON, mismos predicados/plan; no atribuir tiempos M9 al esquema nuevo. |
| `services/geo-service/test/geo-service.test.ts` | Inspección/UPDATE de fixture en tabla física con categoría equivalente. |
| `services/geo-service/test/huella-y-cifras.test.ts` | Igual adaptación acotada, mantener huellas/caché/agregados y negativos. |
| `services/geo-service/test/no-contaminacion-categoria.test.ts` | Productores actuales sin planos (incluido causaNULL innecesario), mismos detalles y negativos de todas las categorías. |
| `services/geo-service/README.md` | Estado compatible del esquema actual, sin cambio de endpoints. |

### Parte5 — operadores, integración y documentación; raíz para operación/seguridad

| Archivo | Cambio y garantía |
|---|---|
| `scripts/banco-datos.mjs` | Escritura JSON actual, mismos RNG/estados/fechas/tuplas/filtros y parámetros; sin ejecutar carga real. |
| `scripts/sembrar-30-puntos.sql` | Mismas30tuplas y semántica, con JSON; no operarlo. |
| `scripts/bancos-internos.test.mjs` | Comparación semántica SQL actual y negativos de alcance; conservar casos anteriores significativos. |
| `scripts/respaldo.mjs` | Comparar versiones21/19→22 por columnas comunes más equivalencia explícita de seis campos reconstruidos, JSON/versiones completos por categoría y archivo de cuota. Nunca solo intersección de columnas. Conservar guardas de destino. |
| `scripts/respaldo.test.mjs` | Rechazos de pérdida en cualquiera de las categorías/auxiliares/cuota y versiones no soportadas; mismos negativos existentes. |
| `infra/respaldo/respaldo.sh` | Mantener carga exacta a versión del dump y verificación antes de migrar; incorporar contraste semántico posterior de la contracción sin debilitar manifiesto/cifrado. |
| `infra/respaldo/respaldo.test.sh` | Mocks de versiones, pérdida/archivo/cifrado/destino ocupado; sin red real. |
| `scripts/multitematica-local.mjs` | Preparaciones nuevas coherentes con22 y arranque que exige esquema compatible; nueva acción explícita de actualización con copia/guardas, nunca migración implícita en `iniciar`. No ejecutar esa actualización todavía. |
| `scripts/multitematica-local.test.mjs` | No resembrado, versión incorrecta/ocupación rechazada, fases reanudables verificadas y rollback; conservar negativas anteriores. |
| `scripts/ensayar-contraccion-compatible.mjs` (nuevo) | Herramienta aislada/probable por inyección para un ensayo nuevo, nombres reservados y rechazo de cualquier origen protegido/ocupado. Ningún DROP automático, secreto en salida ni operación al importarla. |
| `scripts/ensayar-contraccion-compatible.test.mjs` (nuevo) | Pruebas de guardas, pérdidas, errores intermedios y reanudación; primero mocks/PGlite. |
| `.github/workflows/ci.yml` | Incorporar las pruebas nuevas al job existente, mismo aislamiento, sin disparar CI ni cambiar despliegue. |
| `docker-compose.yml` | Documentar en el job de migraciones la parada/actualización explícita; comando ordinario sin consentimiento0022 y dependencia de éxito conservados. Sin nuevos puertos/privilegios/secretos ni ejecutar Compose. La guarda efectiva la impone el runner/CLI, no el comentario. |
| `e2e/playwright.cuatro-categorias.config.ts` | Solo parámetros del nuevo banco aislado si hacen falta; no relajar aserciones, timeouts ni cámara/seguridad. |
| `e2e/tests/cuatro-categorias.local.ts` | Solo parametrización/afirmaciones adicionales para mismo recorrido contra banco nuevo; conservar14casos desktop/móvil y sus controles. |
| `docs/decisiones/0026-contraccion-fisica-con-api-compatible.md` (nuevo propuesto) | Registrar la decisión humana de separación, archivo de cuota y parada coordinada, únicamente si se aprueba. |
| `docs/decisiones/0011-migracion-de-inundaciones.md` | Adenda fechada limitada al nuevo alcance; conservar decisión histórica. |
| `docs/decisiones/0012-compatibilidad-de-api.md` | Adenda: v1 conservada sin caducidad declarada, retiro externo diferido. |
| `docs/decisiones/README.md` | Índice de ADR nueva, estado real. |
| `docs/arquitectura/13.3-plan-migracion.md` | Adenda a§3.4 sobre alcance de ventana, sin borrar historia ni atribuir ensayo nuevo al pasado. |
| `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` | Criterio explícito de cierre local M10 y retiro HTTP diferido. |
| `docs/operaciones/respaldo-y-restauracion.md` | Versiones, comparación semántica, archivo restringido y procedimientos probados. |
| `docs/operaciones/multitematica-local.md` | Instalaciones admitidas, actualización explícita/pausa/reversa; `iniciar` normal sigue sin preparar. |
| `docs/operaciones/produccion.md` | Preparación para dominio previsto `micurichi.lat`, actualización código/esquema coordinada y requisitos externos aún sin verificar; no presentar suite destructiva contra la base pública como preflight. Las pruebas se ejecutan en bancos/copias aislados autorizados. |
| `AGENTS.md`, `CLAUDE.md` | Ajustes acotados de estado/fecha,§4.8,§7.1–7.2 y§16.7 para esquema22 y compatibilidad; sin reescribir reglas/modelos/proceso. |
| `docs/TRASPASO.md`, `docs/README.md`, `docs/sdd/README.md`, `VentanaContexto.md` | Continuidad y hechos verificables; separar cierre técnico local de apertura humana/producción. |

Se añadirán los documentos propios de corrida en `docs/sdd/2026-10-29-cierre-m10/`
(plan aprobado, baseline, implementación, verificación, revisión/auditoría, informe,
arbol-inicial/archivos y protocolo operativo). Artefactos bajo `.turbo/m10-cierre-2026-10-29/`.
No se editan las cápsulas ni se repiten los operadores de M9/M10.3.

## Orden de ejecución y criterios bloqueantes

1. **F0 nuevo y baseline.** Capturar antes real de cada archivo, fuentes ajenas, migraciones,
   contratos/OpenAPI, casos/expectativas y entorno de pruebas. Un solo heavy y escritor
   por carpeta; subagentes raíz sin override. Principal coordina/docs. M10.5 cerrado es
   dependencia; no repetirlo antes de cerrar ni alterar sus artefactos.
2. **Reversibilidad y autoridad JSON en fixtures.** Especificar/demostrar precondiciones antes
   del DROP: detalle_version1 soportado, correspondencia100% entre planos y JSON de cada
   inundación, NULL/ausente y false conservados, detalles completos de las otras categorías,
   archivo de cuota byte/valor igual. Ante inconsistencia, rollback total y mensaje sin datos
   sensibles. No corregir filas por aproximación, coerción o descarte. Mantener restricciones
   de objeto/tope8192, garantías de tipos/enums/obligatorios de Inundaciones que hoy aporta
   SQL y validación de categoría/versiones, sin convertir el archivo en acceso de aplicación.
   Rechazar0022 pendiente sin consentimiento tanto por CLI/runner ordinarios como por
   ejecución SQL directa: la migración exige la señal SET LOCAL del runner autorizado.
   Probar archivo previo idéntico, divergente/alterado y divergente tras mantenimiento
   legítimo después de rollback; ninguno permite perder ni sobrescribir la copia anterior.
3. **Código y operadores coordinados.** Escritores JSON y mirror/tests actuales en el esquema
   nuevo; históricos fijados a su versión. Pruebas de seed/helper/limpieza/ACL, conjuntos
   de usuarios/fotos/auditoría/idempotencia/puntoscríticos/cupos y ambos POST. Comparar
   casos y resultados, no solo conteos. Un caso verde perdido/omitido es bloqueante.
4. **Restauración y reversa verificadas en aislamiento.** Primero PGlite y comandos simulados:
   19→22,21→22,22→22;22→21→22, cuatro categorías y auxiliares, hashes no tocados, reporte de
   objetos eliminados/copia histórica. Pruebas de corrupción/pérdida/versión/desconexión
   y rechazo de destino ocupado. Las columnas retiradas se reconstruyen para la igualdad;
   los índices se comparan por intención/definición y no por el antiguo conteo expansivo.
5. **Verificación independiente.** Suites DB/API/geo, Node/Bash afectados, tipos del grafo,
   build necesario y OpenAPI idéntico, Biome raíz/secrets; revisión funcional y auditoría
   con SHA/casos/alcance. Registrar baselines rojos históricos sin arreglarlos de pasada.
   Repetir solo lo invalidado por correcciones. No presentar mocks como restores reales.

## Ensayo real y actualización: autorización operacional separada

La aprobación de este plan autoriza el código y las pruebas aisladas anteriores, **no
conecta ni migra automáticamente la demo ni una base real**. Antes de operar se preparará
un protocolo concreto con orígenes/destinos nuevos, puertos, cuentas, claves/custodia y
etapas; el usuario aprobará ese resultado ejecutable y revisado. Ello será la última
puerta antes de las operaciones, no un permiso repetido para programar lo ya aprobado.

Ese protocolo deberá ensayar cifrado/restauración nuevos sobre bases sintéticas nuevas,
no sobre los cuatro bancos M10.3 ni el banco M9, conservando todos los bancos/resultados.
Deberá prohibir DROP y reutilización de un destino ocupado. Solo después propondrá
actualizar `curichi_multitematica`, con pausa limitada, respaldo restaurado comprobado,
conteos/huellas de datos de demo conservados y reversa verificada antes del cambio.
E2E14casos desktop/móvil y reinicio final se harán contra la instalación expresamente
autorizada y esquema nuevo. No implica permiso para actualizar `curichi_e2e`.

La recuperación debe conservar antes del cambio los artefactos de código y sus hashes
compatibles con21, además del respaldo. Con escritores y mantenimiento pausados, una
vuelta22→21 reexpande datos/ACL, repone ese release y reconcilia el estado del actualizador
solo tras comprobar cada etapa; no arranca el escritor JSON contra el trigger antiguo.
El ensayo debe cubrir fallos entre etapas, reanudación idempotente y ambos POST/replay
con el par código/esquema recuperado, incluidos datos aceptados mientras corría22.
Una reversa SQL aislada no demuestra esa recuperación de la instalación. No usar el
flag de consentimiento como prueba automática de pausa ni una captura sin tráfico como
prueba de ausencia de escritores; el protocolo debe identificar y detener los procesos
autorizados por identidad y verificar su cierre antes del DDL.

Nunca conectar/consultar/migrar `curichi`, `curichi_revision` o `postgres`. `template1`
solo podrá usarse para creación/metadatos si lo autoriza ese protocolo. Sin cambios
globales de roles/contraseñas, secretos impresos, limpieza de cachés/logs, instalaciones,
Git/publicación, Dockerdown/rm/-v ni modificación de `data/raw/`. RAM>=1500MiB para
unit/SQL y>=2500MiB con servicios vivos antes del navegador; ejecución pesada en serie.

## Qué cerraría y qué seguirá necesitando al usuario

El informe solo declarará **M10 local completo con HTTP compatible** tras pruebas
independientes y ensayo/actualización autorizados y concluidos. El retiro HTTP queda
expresamente diferido por la decisión1; no se declarará que desaparecieron los clientes
antiguos. Las12pruebasPG/S3 omitidas históricas continúan NO_VERIFICADAS hasta su prueba
real autorizada; no se cuentan como PASS de esta propuesta.

El cierre humano de Fase1 y producción conservan su puerta. Fuente/licencia municipal,
parámetros/plazos/retención, privacidad de Persona, hosting/dominio, custodia de claves y
fotos externas, hardware/lector/apagado y CI remoto necesitan evidencia o decisiones
propias. No se puede certificar ni contratar esos elementos a partir de pruebas locales.
