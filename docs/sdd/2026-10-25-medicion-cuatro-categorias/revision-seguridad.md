# M9 F4 — Revisión independiente de seguridad y operación

**Dictamen del 2026-10-26: NO CONFORME para el primer PostgreSQL. Dos hallazgos P2 bloqueantes en las guardas del adaptador.** Las pruebas locales existentes pasan; no cubren los dos casos reproducidos abajo. La operación real de M9 no ha ocurrido y no se certifica como realizada.

Parte 5. Mandato específico del usuario, plan aprobado el 25/10 y fuente congelada por el implementador el 26/10. Leídos AGENTS.md completo, el plan y la auditoría inicial. Escritura de esta revisión limitada a este documento y `.turbo/m9-2026-10-25/revision-final-26/seguridad/`. Sin modificaciones del producto, contratos, migraciones ni documentos ajenos. La conformidad estática SQL comunicada por P4 corresponde a su revisión; aquí se examinan guardas y adaptador, sin duplicar esa revisión.

## Identidad de la fuente

| Archivo original ejecutado/revisado | Bytes | SHA-256 |
|---|---:|---|
| `scripts/medir-cuatro-categorias.mjs` | 72850 | `d79b033c073dfe6065693603686ddeaf50c0f6859676515c50391fba10051c1b` |
| `scripts/medir-cuatro-categorias.test.mjs` | 41374 | `781eb6b06857191333c98b9fb24c9dad444c8d2c8bbc9f478be25749e2ff4847` |

Coinciden con `relevo-26-implementador/freeze.json`, `revision-final-26/freeze-candidato.json` y las dos copias de revisión. Las copias se leyeron para comprobar identidad; **no se ejecutaron**. Hashes y tamaños originales iguales antes/después. Las líneas siguientes corresponden a esos bytes congelados.

## Hallazgos bloqueantes

### S1 — P2: un diario JSON con valor falsy se confunde con ausencia de diario

**Archivo:** `scripts/medir-cuatro-categorias.mjs:384–387`, origen en `1633–1638`; también se refleja en `1701`.

`load()` devuelve directamente el resultado de JSON.parse y usa `null` para ENOENT. `createBank()` solo valida el estado si `if (state)` es verdadero. Por tanto, un archivo existente con `null`, `false`, `0` o `""` sigue el camino de banco nuevo y alcanza `deps.client(urls.bootstrap)`, en la línea 391, sin rechazar el estado malformado. Si el banco fijo ya existe, la comprobación posterior lo conserva; si no existe, ese camino permite continuar hacia CREATE y sustituir el diario inválido. No se afirma que el diario operativo actual contenga esos valores: no existe en el estado local observado.

**Reproducción independiente sin PG:** para cada valor se escribió un diario de prueba exclusivamente en esta carpeta de evidencia; se usó `createDependencies` real con `Client` falso y recursos falsos suficientes. El constructor falso lanza una sentinela, sin conectar ni ejecutar SQL.

| Contenido/clase del diario de prueba | Constructores falsos alcanzados | Resultado |
|---|---:|---|
| `null` | 1 | `FAKE_CLIENT_ALCANZADO` |
| `false` | 1 | `FAKE_CLIENT_ALCANZADO` |
| `0` | 1 | `FAKE_CLIENT_ALCANZADO` |
| Cadena vacía JSON | 1 | `FAKE_CLIENT_ALCANZADO` |
| Objeto vacío | 0 | `ESTADO_NO_RECONOCIDO` |
| JSON truncado | 0 | `SYNTAX_ERROR` |

Los seis archivos de prueba conservaron su contenido. Los dos últimos casos son controles de sensibilidad. Evidencia: `seguridad/negativos-adicionales.json` y `lectura-y-negativos.mjs`.

**Condición de cierre:** distinguir explícitamente ENOENT de cualquier archivo existente; rechazar valores JSON que no sean un estado reconocido antes de construir Client. Negativos sobre archivo existente con cada valor anterior deben acreditar cero Client, cero efectos y conservación del diario. No se modifica el runner desde esta revisión.

### S2 — P2: el disco de PostgreSQL acreditado no queda ligado a todos los endpoints admitidos

**Archivo:** `scripts/medir-cuatro-categorias.mjs:106`, `141–149`, `1543–1578` y `1618`.

El validador permite que owner y bootstrap usen ambos `[::1]:5432`; el adaptador entrega ese host como `::1` al cliente. La sonda de recursos no recibe las URL: acredita exclusivamente el contenedor `curichi-postgis`, su publicación en **127.0.0.1:5432** y su volumen. Una pareja IPv6 admitida puede, por tanto, usar otro PostgreSQL local mientras la guarda de 5 GiB mide el volumen del contenedor IPv4. La igualdad entre owner y bootstrap arregla A1, pero no vincula esos destinos al disco medido.

**Reproducción independiente sin PG ni Docker real:** `createDependencies` acepta la pareja IPv6 con Client inyectado. `readResources` acepta un inspect falso con publicación únicamente IPv4 y un df falso del volumen con 19,073 GiB libres. Se registraron dos llamadas a la función falsa, cero procesos de sonda reales y cero Client reales. No se afirma que exista otro servidor en IPv6 ni que la configuración real lo utilice; no se leyó `.env`.

**Condición de cierre:** limitar los destinos aceptados al endpoint acreditado por esta instalación, o vincular la medición del disco al endpoint efectivo antes del primer Client/CREATE. El negativo IPv6 con una sonda acreditada solamente para IPv4 debe abortar antes de operar el banco. Evidencia: `seguridad/negativos-adicionales.json`.

## Dos coincidencias del escáner: clasificación AST y flujo

El escaneo principal `revision-final-26/secretos.json`, de las 12:20:01 UTC, registra **11 archivos del inventario, dos coincidencias y reglas canónicas sin cambios**. Esta revisión no alteró reglas ni suprimió hallazgos; no vuelve a presentar el escaneo como cero coincidencias. Se analizó el AST con TypeScript 5.9.3 ya instalado y se contrastó el flujo del código congelado. No se imprimieron ni guardaron valores coincidentes en la clasificación.

| Coincidencia | AST y flujo comprobados | Clasificación |
|---|---|---|
| Runner, línea 1622, «secreto asignado en línea» | `PropertyAssignment → CallExpression → PropertyAccessExpression`: `password` recibe `decodeURIComponent(url.password)`. `url` deriva de `checked`, validado antes del constructor; es un valor dinámico de la credencial, no un secreto literal incrustado en esa línea. El flujo de la CLI deriva destinos fijos en memoria; no se ejecutó esa lectura de configuración. | Falso positivo de la regla; cero secretos reales encontrados en esta coincidencia. |
| Tests, línea 14, «cadena de conexión con contraseña» | `VariableDeclaration → ArrowFunction → TemplateExpression`: helper local de URL sintética. Se entrega a dependencias falsas o Client inyectado; los subprocesos de importación/ayuda no ejecutan preparar/medir. | Falso positivo por fixture sintético; cero credenciales reales encontradas en esta coincidencia. |

Resultado del escaneo y clasificación: **2 coincidencias, 2 falsos positivos justificados, 0 secretos reales detectados en esas coincidencias**. El alcance es el inventario de ese escaneo, no una certificación global del repositorio. Evidencia sin valores: `seguridad/clasificacion-secretos.json`.

## Verificación local ejecutada

Node v24.15.0; RAM antes de las suites: **3366,29 MiB**, superior a 1500 MiB. Turno exclusivo pequeño, comandos en serie, sin instalar dependencias. Las pruebas son los originales bajo `scripts/`; el CWD de pruebas se situó en `seguridad/` para que sus directorios temporales relativos permanezcan dentro del ownership. El entorno de lanzamiento utiliza allowlist, sin PG*, NODE_OPTIONS ni NODE_PATH heredados. Temporales propios conservados.

| Comprobación | Salida real resumida | Exit |
|---|---|---:|
| `node --test --test-concurrency=1 --test-reporter=tap <original M9>` | 57 tests; 57 pass; 0 fail; 0 skipped/cancelled; 2039,8822 ms | 0 |
| Mismo comando, `scripts/multitematica-local.test.mjs` | 40 tests; 40 pass; 0 fail; 0 skipped/cancelled; 1149,4953 ms | 0 |
| `node --check` del runner original | Sin diagnóstico | 0 |
| `node --check` de los tests originales | Sin diagnóstico | 0 |
| Biome 2.5.13 local, `check`, solo los dos archivos M9 | `Checked 2 files in 40ms. No fixes applied.` | 0 |
| AST y negativos adicionales propios | Dos falsos positivos clasificados y reproducción de S1/S2; sin Client/PG reales | 0 |

El exit 0 del último comando indica que reprodujo y registró los resultados; **no** significa conformidad de S1/S2. Los 57 nombres y su orden coinciden con la salida final del implementador, incluidos los casos repetidos. No hay regresiones de esas suites frente a su estado congelado. S1/S2 son huecos de cobertura adicionales, no tests existentes convertidos a rojo. Salidas completas, errores separados, argumentos, PID y exit originales están en `seguridad/controles.json`, `*.stdout.txt`, `*.stderr.txt`, `comparacion-pruebas.json` y `lectura-y-negativos.exit.json`.

## Guardas y adaptador revisados

| Bloque | Resultado acotado a esta revisión |
|---|---|
| A1, endpoint nominal | Cerrado: hostname explícito y credenciales comparados; puerto 5432 y protocolo PostgreSQL validados individualmente. Ya no usa URL.origin. El negativo IPv4/IPv6 y credenciales diferentes aborta en withDatabase y createBank antes de Client. S2 es otro vínculo, el del disco. |
| A2, importación/ayuda | Cerrado: tests 558–596 sabotean fs, pg por CJS/ESM, procesos y red; prueban sensibilidad antes de resetear contadores. Tras importación/ayuda: contadores cero. Hooks heredados excluidos. La prueba anterior de ayuda se mantiene, pero no se usa por sí sola como acreditación. |
| Destinos y cliente | Configuración validada conjuntamente antes de resolver/construir pg; destino fijo `curichi_sdd_m9_20261025`, bootstrap `curichi_e2e`, usuario/owner `curichi`, loopback:5432. Host/puerto/base/usuario/clave/SSL/options y timeouts explícitos. Ninguna conexión a curichi, curichi_revision, postgres o multitematica. Excepciones bloqueantes S1/S2. |
| Bootstrap | Solo identidad de sesión y catálogos pg_database/pg_roles; CREATE/COMMENT exclusivamente del banco fijo. No se accede a tablas de curichi_e2e. Si el banco existe sin procedencia reconocida, aborta y lo conserva. |
| Identidad por job | current_database/current_user/session_user, OID, comentario UUID y owner se comprueban antes/después de durableJob. No basta el nombre. |
| Estado y replay | Orden y lista de jobs cerrados, huellas y seed comprobados; pending ordinario aborta sin replay. Estado de inspección puede verificar identidad de un pending reconocido y declara resumable=false, sin ejecutar jobs. S1 impide dar conformidad completa al cargador de diario. |
| Diario y lock | Lock propio exclusivo `wx`, token UUID/PID/fecha, sin robar ni recuperar locks previos. Liberación solo si el contenido sigue siendo propio. Intención antes de CREATE/job; temporal `wx`, write/sync/close/rename; un temporal previo se conserva y aborta. Confirmación de job solo después de evidencia y save; un fallo conserva pending y bloquea sucesores. No se certifica pérdida de energía. |
| Fallos y evidencia | failureDiagnostic permite códigos controlados/SQLSTATE y etapa de allowlist; no publica message, stack, cause, configuración ni credenciales. Artefactos `wx`, nombres sin escape de carpeta; redacción de URL/clave codificada/decodificada en evidencia. |
| Hijos, CLI, migración y ETL | M9 no lanza CLI de migración ni ETL: ambos reciben el ejecutor de la conexión acreditada. No existe segunda lectura de `.env` que reemplace la URL. Sondas Docker por execFile directo, entorno allowlist, host local fijo, ventana oculta y timeout de 10 s. Workers de contraseña cerrados en finally. No crea servicios HTTP. |
| Cierre de runner previo | 40 pruebas con fakes, incluidos PID reutilizado/identidad incompleta, descendientes sobrevivientes y timeout; no se usó taskkill real. Es cobertura del componente previo; no una certificación de operación M9 ya realizada. |
| Recursos y trazabilidad | Guarda 1500 MiB y 5 GiB en ambos discos; negativos rechazan ausentes/insuficientes. Chequeo inicial antes de módulos/banco y por job/muestra. Manifiesto enlaza fuente/dist, migraciones hasta0021, contracts0.24, lockfile y capas procesadas verificadas por hash. Relación endpoint/disco pendiente por S2. |
| Conservación | Sin DROP DATABASE, cambios de roles globales, Git, descarga ni limpieza en las rutas revisadas. DDL histórico de objetos dentro del banco NUEVO hasta0021 pertenece a crear/migrar aprobado; no se reporta como borrado de bases ni defecto. ETL/recálculo operan únicamente mediante el ejecutor del banco acreditado. |

## Estado al salir y límites

Se conservó la foto de demo tomada por el principal antes de M9; su archivo y la identidad local de instalación mantienen su hash. No se consultó la base de demo para volver a calcularla. Diario y lock operativos M9 permanecen ausentes; el lock anterior de demo sigue archivado por el principal, con su proof intacto. No se movió ni retiró ningún lock operativo desde esta revisión.

Los **14 archivos monitorizados** conservaron hash, tamaño y mtime; los estados de existencia de los tres diarios/locks monitorizados no cambiaron. Evidencia: `antes.json` y `despues.json`. Boot del host: 26/10 11:29:15,5 UTC; cero PIDs antiguos de demo y cero listeners en los ocho puertos de app comprobados antes/después. Las tres identidades Node preexistentes se conservaron; aparecieron otras dos del runtime CUA de Codex, con padres ajenos a los procesos de las comprobaciones. No se detuvieron ni atribuyeron a esta revisión. **Cero procesos Node propios persistentes de la auditoría al cierre**; comprobaciones síncronas terminadas y sin servicios iniciados. La comparación normalizada se conserva en `comparacion-host.json`.

Las lecturas CIM/puertos requirieron salir del sandbox de lectura restringida; las llamadas autorizadas solo leyeron estado del host y guardaron metadatos propios. Ninguna escalación operó procesos o bases. No se abrió `.env`, Client real ni conexión PG; tampoco servidores, benchmark, navegador, instalación, limpieza o Git. Los subprocesos finitos de las pruebas no se presentan como cero procesos ejecutados.

**Cierre:** revisión asignada terminada; slot pequeño Node liberado. PG continúa sin habilitar por S1/S2. Se requieren correcciones del implementador en los archivos/líneas señalados, nuevos negativos y un nuevo freeze revisado antes del primer PG. CI global, producción y M10 permanecen fuera de este dictamen.

---

## Vuelta 1 — Delta final independiente del 2026-10-26, 14:30 UTC

**Dictamen actual: CONFORME para operar el medidor congelado sobre el banco NUEVO FIJO `curichi_sdd_m9_20261025`. S1 y S2 cerrados; no encuentro P1/P2 nuevos en este delta.** Este dictamen corresponde al freeze corregido de las 14:18:27 UTC y sustituye exclusivamente el bloqueo S1/S2 del corte anterior. El NO CONFORME anterior, sus reproducciones y sus salidas se conservan íntegros. **68 pruebas verdes acreditan código local, no un benchmark medido: PostgreSQL no se ejecutó.** La conformidad estática P4 de `revision-p4.md` se reutiliza con identidad de bloque comprobada, sin repetir la revisión SQL.

Parte 5, auditoría acotada por relevo explícito del usuario. Lecturas: AGENTS.md, plan aprobado M9, esta revisión previa, freeze/comparación/rojos/post de `correccion-seguridad-26/`, dictamen P4, adaptador y once pruebas nuevas, harness y clasificación AST previos. Escritura únicamente en `.turbo/m9-2026-10-25/revision-final-26/seguridad-vuelta1/` y esta adición. No se editó producto ni otros documentos; no se abrió `.env`, Client PG real, SQL real, servidores, banco, instalación, borrado ni Git.

### Identidad revisada y conservada

| Fuente original | Bytes antes = después | SHA-256 antes = después |
|---|---:|---|
| `scripts/medir-cuatro-categorias.mjs` | 73260 | `0cf52d79a85d230aeb91aabeb931226cb23bbcd00be2f932f00c31e44c086673` |
| `scripts/medir-cuatro-categorias.test.mjs` | 46437 | `435e8751290854849d5c8c7c71b70627c266adae89e99a55e3d39a587f05f8d8` |

Comparación independiente contra `correccion-seguridad-26/runner-anterior.mjs`, cuyo SHA-256 es el freeze anterior `d79b033c073dfe6065693603686ddeaf50c0f6859676515c50391fba10051c1b`: desde `function executor(client)` hasta antes de `export function createDependencies(`, los **47620 bytes** del bloque P4/SQL/oráculos/recursos son idénticos, SHA-256 `40883414e4154f66a4979c84863a177af6765850b47190fe6f7a168c3e9fd9e0`. Se comprobaron bytes, no solo una declaración del implementador. Evidencia: `seguridad-vuelta1/comparacion-estatica.json`.

Los 25 archivos monitorizados conservan hash/tamaño/mtime; los tres estados de existencia de diarios/locks operativos tampoco cambian. Copia literal del documento previo conservada para comprobar que esta vuelta solo añade texto. Evidencia: `antes.json`, `despues.json`, `revision-seguridad-anterior.md` y `documento-append.json`, dentro de la carpeta propia.

### Cierre S1: distinguir ausencia y validar antes de Client

Revisados `createBank` (382–391), `createDependencies.load` (1633–1652) e `inspectState` (1710–1720). Solo el ENOENT de `readFile` devuelve ausencia `null`; el parseo y la validación quedan fuera de ese catch. Cualquier JSON existente se valida antes de devolverlo. `createBank` e inspección comprueban ausencia explícita; la creación vuelve a exigir estado reanudable antes de Client.

Las nueve pruebas nuevas S1 (desde 1198) cubren los siete archivos `null`, `false`, `0`, cadena vacía JSON, objeto vacío, array y JSON corrupto: load/createBank/inspectState rechazan, **0 Client y 0 recursos**, bytes y listado del directorio intactos. ENOENT permite alcanzar deliberadamente el bootstrap falso; un error de lectura distinto de ENOENT se propaga. Un estado válido se conserva. La intención `pending=create`, OID null y etapas vacías exige el resto del estado válido: se puede cargar/inspeccionar como incierta y no reanudable, pero createBank la rechaza sin Client, adopción ni replay.

Adversarios independientes basados en el harness anterior, adaptados en la carpeta propia: nueve archivos inválidos, incluyendo `true` y una cadena no vacía además de los anteriores; las tres entradas rechazan antes de recursos/Client y conservan el archivo. **Control de sensibilidad observado: el archivo ausente alcanzó exactamente 1 constructor falso y lanzó `FAKE_CLIENT_ALCANZADO`; no creó diario.** No se confunde ese Client falso con PG real. Evidencia: `adversarios-s1-s2.json` y `auditoria-delta.mjs`.

### Cierre S2: endpoint efectivo limitado al IPv4 acreditado

Revisados `credential` (97–120), validación conjunta y construcción de Client (1596–1632). La allowlist admite 127.0.0.1/localhost y normaliza localhost a 127.0.0.1; IPv6 queda rechazado. El host que recibe Client es el normalizado y el puerto sigue fijo en 5432, coincidente con la publicación que acredita la sonda IPv4 del bloque inalterado.

Las dos pruebas nuevas S2 (1290–1332) rechazan la pareja IPv6 antes de Client y de sondas, y comprueban la normalización efectiva de localhost. El adversario independiente también exige rechazo de IPv6 con **0 Client falsos**; para ambos destinos owner/bootstrap observa únicamente `{host:127.0.0.1, port:5432}` en constructores falsos. No se ejecutó el harness anterior con su expectativa IPv6 obsoleta, ni se ejecutaron Docker/df reales. Evidencia: `adversarios-s1-s2.json`.

### Ejecución local y reutilización

Node v24.15.0, RAM al iniciar la ejecución **4798,23 MiB**, superior a 1500 MiB. Turno pequeño exclusivo, controles en serie y entorno allowlist sin PG*, NODE_OPTIONS ni NODE_PATH. La suite ejecutada es el **original** de `scripts/`, con CWD en la carpeta propia para conservar allí los temporales relativos; las copias del freeze solo se leyeron.

| Control | Salida literal o resultado observado | Exit literal |
|---|---|---|
| `node --test --test-concurrency=1 --test-reporter=tap <original M9>` | `# tests 68`, `# pass 68`, `# fail 0`, `# cancelled 0`, `# skipped 0`; 2015.8663 ms | `0` |
| `node --check <original runner>` | Sin diagnóstico | `0` |
| `node --check <original tests>` | Sin diagnóstico | `0` |
| Biome 2.5.13 local, check de los dos originales | `Checked 2 files in 38ms. No fixes applied.` | `0` |
| Auditoría delta, AST y adversarios propios | `ADVERSARIOS=CONFORMES; Client falso observado=1; PG real=0; HASHES_BEFORE_AFTER=IGUALES` | `0` |

Los 68 nombres/orden coinciden con el post del implementador: **57 conservados + 11 añadidos, cero regresiones**. Se mantienen los primeros rojos en `correccion-seguridad-26/rojos-seguridad.txt`: exit 1, siete fallos y cuatro aciertos entre los once nuevos; no se sobrescribieron ni se presentan como verdes. Evidencia nueva: `pruebas-m9-68.stdout.txt`, stderr separado, `comparacion-pruebas.json`, `controles.json` y archivos `*.exit.json`.

**Las 40 pruebas del runner previo no se repitieron.** Reutilización por identidad con `seguridad/antes.json`: `scripts/multitematica-local.mjs`, 38398 bytes, SHA-256 `00d4a6c630960b8880aa3e38276591789f557f9926b3080f65d3c21bc2b13c5e`; tests, 32880 bytes, SHA-256 `bfc8301460c5d9f7b38304e999f441705dad86511c60fe4bf1e03597452f3e74`. Su salida anterior acredita 40 pass/0 fail, exit 0; no se atribuye como nueva ejecución.

Escaneo previo: se conserva su alcance de **11 archivos, dos coincidencias**, con reglas canónicas intactas. Comparación AST independiente demuestra que el nodo dinámico password del runner (1622) y el helper sintético de tests (14) son idénticos al freeze previo; se mantienen los dos falsos positivos ya justificados. No se reescaneó globalmente ni se imprimieron/guardaron valores. Evidencia: `clasificacion-secretos-delta.json`, enlazado a `seguridad/clasificacion-secretos.json`.

### Salida del turno

Node auditor PID 25004 finalizado con exit 0. Captura CIM final: mismas tres identidades Node preexistentes y **0 hijos propios persistentes**, slot Node **LIBERADO**. Las llamadas CIM solo leyeron RAM/PIDs/padres y guardaron metadatos propios; no operaron procesos. Evidencia: `host-antes.json`, `host-despues.json` y `auditoria-delta.exit.json`.

La auditoría está terminada y las guardas S1/S2 quedan conformes para el turno operativo del banco fijo previsto por el plan. **No se ha medido M9 ni se ha abierto PG en esta vuelta.** No certifica corrida, demo, rendimiento, CI global, producción, M10 ni cierre de Fase 1.