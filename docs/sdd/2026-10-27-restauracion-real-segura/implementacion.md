# Entrega M10.3 — implementación/pruebas aisladas

Meta de esta etapa: ALCANZADA. Ocho archivos implementados, pruebas terminadas, 0 regresiones, sin hijos ni ejecuciones pendientes. Revisión/freeze independientes y ensayo real PENDIENTES del principal. Ningún operador real ejecutado.

## Resultado verificable

- Baseline: Node 23/23; Bash 23/23. Green: Node 29/29; runner 15/15; Bash 33/33. Total 77 PASS, 0 FAIL, 0 SKIP; 46 anteriores conservados y 31 adicionales.
- Sintaxis: Node 4/4 y Bash 2/2 exit 0; Biome 4 archivos exit 0; YAML exit 0; diff --check exit 0. ShellCheck NO_VERIFICADO porque no está instalado; CI remoto NO_EJECUTADO.
- Typecheck/build de apps y servicios NO_APLICA al alcance JS/Bash/YAML; no se ejecutaron ni se presentan como PASS. El usuario excluyó TS/build intactos.
- RAM libre medida antes de cada comando en sus JSON; todas >=1500 MiB. CIM fue inaccesible en el sandbox; se usó node:os.freemem sin cambios de permisos.
- MSYS en sandbox falló 0xC0000022; solo arneses y bash -n se reintentaron fuera mediante aprobación de herramienta. No fue una regresión de producto.
- Secuencia inicial roja antes de producto: Node 23 PASS /16 FAIL; Bash 23 PASS /7 FAIL. Faltaban helpers y runner. No equivale por sí sola a demostrar detección de pérdida. La fase verde añade aserciones sobre contenido, SQL literal Node/Shell en PGlite y rollback; ningún fallback real.

## Ocho archivos exactos de producto

- scripts/respaldo.mjs
- scripts/respaldo.test.mjs
- infra/respaldo/respaldo.sh
- infra/respaldo/respaldo.test.sh
- scripts/ensayar-respaldo-multitematico.mjs
- scripts/ensayar-respaldo-multitematico.test.mjs
- .github/workflows/ci.yml
- docs/operaciones/respaldo-y-restauracion.md

Los seis existentes tenían cambios previos M10.2: se trabajó sobre F0, no sobre HEAD limpio. Dos archivos nuevos estaban ausentes. Otros cambios del árbol se conservaron. Evidencia/scratch propios fuera de producto: exclusivamente esta carpeta implementador/. No edité documentos de corrida/índices/roadmap/contexto/AGENTS/CLAUDE.

## Comportamiento

RestaurarNode consulta la ausencia antes de CREATE/migración/carga; no hay DROP DATABASE en el producto Node. Administración explícita por inyección; CLI --base-administrativa. Una sola sentencia DO verifica versión, bloquea tablas y exige cero datos fuera de migraciones/PostGIS y las cuatro semillas categoria exactas, incluidos actor/fecha nulos. Solo borra esas semillas; errores y cualquier cambio abortan íntegros, sin CASCADE. SQL literal de Bash y Node probado sobre el mismo motor aislado. El Shell operativo y cargar-local comparten cargar_datos_local, versión exacta, guarda y pg_restore transaccional.

Runner: cuatro nombres fijos, template1 solo metadatos/CREATE, loopback:5432 y rol curichi, comparación system_identifier TCP/contenedor, OID/dueño/servidor propios, freeze8 validado, modo estado sin efectos, etapas explícitas ordenadas, checkpoint de operadores/OID antes de recursos siguientes, etapas inciertas y archivos/nombres preexistentes ajenos bloqueados. No autolimpieza/retry/reset/DROP.

Caso actual: respaldarNode/restaurarNode compartidos con CLI. Histórico: restaurarNode prepara0019; cargar-local llama al helper Shell operativo y luego migra0021. Ambos reutilizan snapshot/verificar M10.2 de verdad, no una comparación alternativa. Auxiliares completos con huellas, PK/FK/UNIQUE/CHECK conservadas y restricciones validadas; campos nuevos legítimos del histórico se distinguen. Fuente debe seguir quieta.

Negativos: destino ocupado comparado antes/después; BEGIN/UPDATE o DELETE/verificar/ROLLBACK utilizan el mismo sql persistente de la copia (un pg.Client por base). Cada resultado registra huellas antes/después del rollback. Se prueba también que un verificador que lanza error no evita ROLLBACK.

GPG futuro: ejecutables existentes de Git; no-options, homedir propio por caso, clave aleatoria solo en memoria y descriptor stdin, nunca argv/archivo/log. Se conservan hash/tamaño del cifrado antes de descifrar, hash descifrado y byteequal; finally cierra únicamente agente del homedir propio. No versiones ni cifrado GPG ejecutados en esta etapa.

## Interfaz futura y reanudación

Único comando permitido ahora, solo lectura local:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs estado
```

Resultado real actual: sin_iniciar. No existe diario operativo ni bancos creados por esta etapa.

Después del mensaje posterior del principal tras revisión/freeze independiente, y solo entonces:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs iniciar --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar preflight --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar crear_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar sembrar_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar respaldar_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar cifrar_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar restaurar_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar verificar_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar negativos_actual --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar crear_pre0020 --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar sembrar_pre0020 --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar respaldar_pre0020 --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar cifrar_pre0020 --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar restaurar_pre0020 --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar verificar_pre0020 --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar negativos_pre0020 --operar
```

Invocar cada línea por separado y revisar checkpoint antes de la siguiente: no ejecutar como bucle. El modo iniciar solo escribe el diario; preflight es la primera etapa con operadores reales. Credenciales se leen privadamente en memoria desde .env solo al ejecutar; se deriva /template1 antes de construir conexiones. No aceptar query options/rol/host/puerto alternativos ni instalar herramientas que falten. El CLI no recibe URLs, nombres o SQL arbitrarios.

Scratch fijo operativo implementador/ensayo; dump, sidecar, cifrado, descifrado y homedir por caso. El Shell histórico conserva copias en /tmp/curichi_sdd_m10_20261027 del contenedor; mkdir sin -p rechaza preexistencia. Todas las bases y artefactos se conservan. No S3, fotos reales/objetos, raw municipal, roles globales, otras instalaciones o puertos nuevos.

Para retomar: estado, hashes del freeze, diario, OID/dueño/system_identifier y siguiente etapa AUSENTE con todas anteriores completas. Una etapa iniciada/incierta o lock sin archivar requiere revisión manual; no editar el diario para forzar avance ni repetir cargas. Al terminar una invocación su lock se archiva por etapa, sin borrarlo; un lock residual de caída se conserva. No hay reset ni limpieza. Clave efímera perdida tras la etapa: los descifrados sintéticos se conservan; un cifrado incompleto no se reintenta.

## Congelación y límites

freeze8.json contiene SHA-256/bytes de las ocho fuentes; se verificó igualdad contra antes-green8.json, capturado antes del green. Todas las fuentes permanecieron quietas durante pruebas finales. Huella del freeze: 31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f. Ningún archivo de producto se vuelve a editar después de congelar. Revisor/verificador independientes aún deben verificar estos mismos hashes.

No certifica restauración/cifrado/PostGIS/Docker reales, apagado, concurrencia, S3, producción, cierre de M10/Fase1 ni CI remoto. Datos aislados: PGlite sin PostGIS y fixtures de texto/mocks; no confundirlos con la operación futura.

## Hallazgos fuera de inventario

Ningún bloqueante nuevo detectado fuera de los ocho archivos; ningún archivo fuera del inventario editado por mí. Los pendientes heredados del contexto no se alteraron. Los otros seis jobs CI, incluido postgres-real, son estructuralmente idénticos a F0; solo cambió infra para instalar dependencias del lock y ejecutar pruebas aisladas/sintaxis nuevas. Las suites de apps/API no se repitieron.

## Comparación test por test

Los cuerpos de los 23 casos Node anteriores y todo el arnés Bash anterior a su resumen se comprobaron íntegramente contra F0 (normalizando solo CRLF). No se retiraron aserciones ni se cambiaron nombres.

| Suite | Caso | Antes | Después |
|---|---|---|---|
| Node | importar no imprime, cambia exitCode ni inicia CLI/procesos | PASS | PASS |
| Node | sin SQL inyectado falla cerrado | PASS | PASS |
| Node | actual compara tabla física y las cuatro categorías con contenido | PASS | PASS |
| Node | rechaza pérdida de bache aunque Inundaciones siga intacta | PASS | PASS |
| Node | rechaza pérdida de basura aunque Inundaciones siga intacta | PASS | PASS |
| Node | rechaza pérdida de area_verde aunque Inundaciones siga intacta | PASS | PASS |
| Node | rechaza cambio en categoria con igual cantidad total | PASS | PASS |
| Node | rechaza cambio en detalle con igual cantidad total | PASS | PASS |
| Node | rechaza cambio en detalle_version con igual cantidad total | PASS | PASS |
| Node | rechaza cambio en geom con igual cantidad total | PASS | PASS |
| Node | rechaza cambio en descripcion con igual cantidad total | PASS | PASS |
| Node | NULL no se confunde con cadena vacía | PASS | PASS |
| Node | orden de filas no afecta evidencia | PASS | PASS |
| Node | previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas | PASS | PASS |
| Node | columna actual perdida no se oculta como compatibilidad | PASS | PASS |
| Node | rechaza vista usada como tabla física | PASS | PASS |
| Node | rechaza migración ausente o inconsistente y error SQL | PASS | PASS |
| Node | mock no previsto y operadores reales permanecen bloqueados | PASS | PASS |
| Node | pérdida o cambio de catálogo de categorías falla | PASS | PASS |
| Node | evidencia parcial de categorías no puede pasar por completa | PASS | PASS |
| Node | conteos inválidos, geometría inválida e índices perdidos fallan | PASS | PASS |
| Node | mismas columnas actuales en versión posterior admite columna nueva | PASS | PASS |
| Node | oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL | PASS | PASS |
| Bash | actual exige reporte físico | PASS | PASS |
| Bash | previo0020 acepta tabla antigua | PASS | PASS |
| Bash | actual rechaza vista como TABLE DATA | PASS | PASS |
| Bash | previo rechaza versión inconsistente | PASS | PASS |
| Bash | migración inválida | PASS | PASS |
| Bash | destino vacío actual | PASS | PASS |
| Bash | destino ocupado solo otras categorías | PASS | PASS |
| Bash | sin ejecutor SQL no hay fallback | PASS | PASS |
| Bash | error SQL no es vacío | PASS | PASS |
| Bash | manifiesto completo coincide con archivo leído | PASS | PASS |
| Bash | manifiesto omite tabla física | PASS | PASS |
| Bash | versión de manifiesto inconsistente | PASS | PASS |
| Bash | manifiesto omite otra tabla | PASS | PASS |
| Bash | formato desconocido | PASS | PASS |
| Bash | manifiesto sin integridad | PASS | PASS |
| Bash | manifiesto sin tamaño | PASS | PASS |
| Bash | manifiesto con tamaño inválido | PASS | PASS |
| Bash | objeto y migración deben coincidir | PASS | PASS |
| Bash | conteo distinto del archivo | PASS | PASS |
| Bash | tabla duplicada en manifiesto | PASS | PASS |
| Bash | manifiesto previo0020 compatible | PASS | PASS |
| Bash | parser COPY cuenta filas reales incluidas NULL/vacío | PASS | PASS |
| Bash | error al leer archivo propaga fallo | PASS | PASS |

## Línea base literal

### baseline-node

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--test",
    "scripts/respaldo.test.mjs"
  ],
  "ramMiB": 5273,
  "exit": 0,
  "signal": null,
  "duracionMs": 254
}
```

Salida literal:

```text
✔ importar no imprime, cambia exitCode ni inicia CLI/procesos (1.7358ms)
✔ sin SQL inyectado falla cerrado (0.4874ms)
✔ actual compara tabla física y las cuatro categorías con contenido (8.8475ms)
✔ rechaza pérdida de bache aunque Inundaciones siga intacta (0.4965ms)
✔ rechaza pérdida de basura aunque Inundaciones siga intacta (0.6036ms)
✔ rechaza pérdida de area_verde aunque Inundaciones siga intacta (0.9419ms)
✔ rechaza cambio en categoria con igual cantidad total (0.7551ms)
✔ rechaza cambio en detalle con igual cantidad total (0.2959ms)
✔ rechaza cambio en detalle_version con igual cantidad total (0.3216ms)
✔ rechaza cambio en geom con igual cantidad total (0.4178ms)
✔ rechaza cambio en descripcion con igual cantidad total (0.3071ms)
✔ NULL no se confunde con cadena vacía (0.4346ms)
✔ orden de filas no afecta evidencia (0.3093ms)
✔ previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas (0.5192ms)
✔ columna actual perdida no se oculta como compatibilidad (0.2795ms)
✔ rechaza vista usada como tabla física (0.1067ms)
✔ rechaza migración ausente o inconsistente y error SQL (0.82ms)
✔ mock no previsto y operadores reales permanecen bloqueados (0.5427ms)
✔ pérdida o cambio de catálogo de categorías falla (0.7064ms)
✔ evidencia parcial de categorías no puede pasar por completa (0.7932ms)
✔ conteos inválidos, geometría inválida e índices perdidos fallan (1.3565ms)
✔ mismas columnas actuales en versión posterior admite columna nueva (0.4708ms)
✔ oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL (0.3492ms)
ℹ tests 23
ℹ suites 0
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 147.2829

```

### baseline-bash-sin-sandbox

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "infra/respaldo/respaldo.test.sh"
  ],
  "ramMiB": 5264,
  "exit": 0,
  "signal": null,
  "duracionMs": 15225
}
```

Salida literal:

```text
PASS actual exige reporte físico
PASS previo0020 acepta tabla antigua
PASS actual rechaza vista como TABLE DATA
PASS previo rechaza versión inconsistente
PASS migración inválida
PASS destino vacío actual
PASS destino ocupado solo otras categorías
PASS sin ejecutor SQL no hay fallback
PASS error SQL no es vacío
PASS manifiesto completo coincide con archivo leído
PASS manifiesto omite tabla física
PASS versión de manifiesto inconsistente
PASS manifiesto omite otra tabla
PASS formato desconocido
PASS manifiesto sin integridad
PASS manifiesto sin tamaño
PASS manifiesto con tamaño inválido
PASS objeto y migración deben coincidir
PASS conteo distinto del archivo
PASS tabla duplicada en manifiesto
PASS manifiesto previo0020 compatible
PASS parser COPY cuenta filas reales incluidas NULL/vacío
PASS error al leer archivo propaga fallo
TOTAL=23 PASS=23 FAIL=0

```

### baseline-node-syntax

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--check",
    "scripts/respaldo.mjs"
  ],
  "ramMiB": 5194,
  "exit": 0,
  "signal": null,
  "duracionMs": 89
}
```

Salida literal:

```text

```

### baseline-test-syntax

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--check",
    "scripts/respaldo.test.mjs"
  ],
  "ramMiB": 5197,
  "exit": 0,
  "signal": null,
  "duracionMs": 98
}
```

Salida literal:

```text

```

### baseline-bash-syntax

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "-n",
    "infra/respaldo/respaldo.sh"
  ],
  "ramMiB": 5262,
  "exit": 0,
  "signal": null,
  "duracionMs": 64
}
```

Salida literal:

```text

```

### baseline-bash-test-syntax

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "-n",
    "infra/respaldo/respaldo.test.sh"
  ],
  "ramMiB": 5247,
  "exit": 0,
  "signal": null,
  "duracionMs": 101
}
```

Salida literal:

```text

```

### baseline-biome

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "node_modules/@biomejs/biome/bin/biome",
    "check",
    "scripts/respaldo.mjs",
    "scripts/respaldo.test.mjs"
  ],
  "ramMiB": 5187,
  "exit": 0,
  "signal": null,
  "duracionMs": 181
}
```

Salida literal:

```text
Checked 2 files in 16ms. No fixes applied.

```

### baseline-yaml

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--input-type=module",
    "-e",
    "import {readFileSync} from \"node:fs\";import {parseDocument} from \"./node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js\";const d=parseDocument(readFileSync(\".github/workflows/ci.yml\",\"utf8\"),{uniqueKeys:true});if(d.errors.length)throw d.errors[0];console.log(\"YAML OK; jobs=\"+Object.keys(d.toJS().jobs).join(\",\"))"
  ],
  "ramMiB": 5184,
  "exit": 0,
  "signal": null,
  "duracionMs": 200
}
```

Salida literal:

```text
YAML OK; jobs=secretos-historial,verificar,e2e,postgres-real,imagenes-docker,infra,publicar-imagenes

```

## Rojos literales anteriores a implementación

### red-node

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--test",
    "scripts/respaldo.test.mjs",
    "scripts/ensayar-respaldo-multitematico.test.mjs"
  ],
  "ramMiB": 5192,
  "exit": 1,
  "signal": null,
  "duracionMs": 262
}
```

Salida literal:

```text
✖ M10.3 runner importable sin ejecutar procesos ni SQL (2.3111ms)
✖ M10.3 solo los cuatro nombres fijos; protegidas y nombres parecidos se rechazan (0.1796ms)
✖ M10.3 conexión estrictamente loopback y rol dueño permitido, sin query options (0.1172ms)
✖ M10.3 rutas fijas rechazan traversal, absolutos y artefactos ajenos (0.1245ms)
✖ M10.3 estado puro no requiere SQL/credenciales ni crea diario (0.1092ms)
✖ M10.3 etapas desconocidas, fuera de orden e inciertas nunca operan (0.1834ms)
✖ M10.3 checkpoint completo anterior a nueva guarda RAM; no repetición automática (0.1482ms)
✖ M10.3 fallo deja etapa incierta durable y exige revisión manual (0.1505ms)
✖ M10.3 no hay fallback si faltan operadores/diario/freeze (0.162ms)
✖ M10.3 banco existente exige identidad propia y OID exacto; nunca adopta por nombre (0.2024ms)
✖ M10.3 runner reutiliza respaldar/restaurar y verificador operativo sin shell arbitrario (0.1331ms)
✔ importar no imprime, cambia exitCode ni inicia CLI/procesos (1.4359ms)
✔ sin SQL inyectado falla cerrado (0.5636ms)
✔ actual compara tabla física y las cuatro categorías con contenido (8.8435ms)
✔ rechaza pérdida de bache aunque Inundaciones siga intacta (0.5391ms)
✔ rechaza pérdida de basura aunque Inundaciones siga intacta (0.4449ms)
✔ rechaza pérdida de area_verde aunque Inundaciones siga intacta (0.2736ms)
✔ rechaza cambio en categoria con igual cantidad total (0.4277ms)
✔ rechaza cambio en detalle con igual cantidad total (0.2766ms)
✔ rechaza cambio en detalle_version con igual cantidad total (0.3193ms)
✔ rechaza cambio en geom con igual cantidad total (0.3275ms)
✔ rechaza cambio en descripcion con igual cantidad total (0.3297ms)
✔ NULL no se confunde con cadena vacía (0.3573ms)
✔ orden de filas no afecta evidencia (0.253ms)
✔ previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas (0.3804ms)
✔ columna actual perdida no se oculta como compatibilidad (0.2288ms)
✔ rechaza vista usada como tabla física (0.1643ms)
✔ rechaza migración ausente o inconsistente y error SQL (0.4789ms)
✔ mock no previsto y operadores reales permanecen bloqueados (0.1776ms)
✔ pérdida o cambio de catálogo de categorías falla (0.2338ms)
✔ evidencia parcial de categorías no puede pasar por completa (0.396ms)
✔ conteos inválidos, geometría inválida e índices perdidos fallan (0.6358ms)
✔ mismas columnas actuales en versión posterior admite columna nueva (0.2798ms)
✔ oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL (0.346ms)
✖ M10.3 destino ocupado se rechaza antes de crear/migrar/cargar (0.3051ms)
✖ M10.3 destino nuevo usa administración explícita y orden seguro (0.0976ms)
✖ M10.3 sin inyección o administración no hay fallback real (0.0879ms)
✖ M10.3 error SQL o catálogo inesperado impide la carga (0.1068ms)
✖ M10.3 preparación requiere base recién creada, semillas exactas y cero otros datos (0.0667ms)
ℹ tests 39
ℹ suites 0
ℹ pass 23
ℹ fail 16
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 158.5929

✖ failing tests:

test at scripts\ensayar-respaldo-multitematico.test.mjs:17:1
✖ M10.3 runner importable sin ejecutar procesos ni SQL (2.3111ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:18:23)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.start (node:internal/test_runner/test:1096:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:21:1
✖ M10.3 solo los cuatro nombres fijos; protegidas y nombres parecidos se rechazan (0.1796ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:22:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:27:1
✖ M10.3 conexión estrictamente loopback y rol dueño permitido, sin query options (0.1172ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:28:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:32:1
✖ M10.3 rutas fijas rechazan traversal, absolutos y artefactos ajenos (0.1245ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:33:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:37:1
✖ M10.3 estado puro no requiere SQL/credenciales ni crea diario (0.1092ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:38:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:44:1
✖ M10.3 etapas desconocidas, fuera de orden e inciertas nunca operan (0.1834ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:45:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:54:1
✖ M10.3 checkpoint completo anterior a nueva guarda RAM; no repetición automática (0.1482ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:55:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:64:1
✖ M10.3 fallo deja etapa incierta durable y exige revisión manual (0.1505ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:65:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:72:1
✖ M10.3 no hay fallback si faltan operadores/diario/freeze (0.162ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:73:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:78:1
✖ M10.3 banco existente exige identidad propia y OID exacto; nunca adopta por nombre (0.2024ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:79:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\ensayar-respaldo-multitematico.test.mjs:85:1
✖ M10.3 runner reutiliza respaldar/restaurar y verificador operativo sin shell arbitrario (0.1331ms)
  AssertionError [ERR_ASSERTION]: ifError got unwanted exception: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
      at modulo (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:15:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/ensayar-respaldo-multitematico.test.mjs:86:13)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      at moduleResolve (node:internal/modules/esm/resolve:861:10)
      at defaultResolve (node:internal/modules/esm/resolve:988:11)
      at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
      at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
      at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
      at #resolve (node:internal/modules/esm/loader:679:17)
      at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
      at node:internal/modules/esm/loader:628:32
      at TracingChannel.tracePromise (node:diagnostics_channel:362:14) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.mjs' imported from C:\Users\HP\Desktop\MICURICHI\scripts\ensayar-respaldo-multitematico.test.mjs
        at finalizeResolution (node:internal/modules/esm/resolve:271:11)
        at moduleResolve (node:internal/modules/esm/resolve:861:10)
        at defaultResolve (node:internal/modules/esm/resolve:988:11)
        at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
        at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
        at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
        at #resolve (node:internal/modules/esm/loader:679:17)
        at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
        at node:internal/modules/esm/loader:628:32
        at TracingChannel.tracePromise (node:diagnostics_channel:362:14),
    expected: null,
    operator: 'ifError',
    diff: 'simple'
  }

test at scripts\respaldo.test.mjs:232:1
✖ M10.3 destino ocupado se rechaza antes de crear/migrar/cargar (0.3051ms)
  TypeError: modulo.restaurarNode is not a function
      at file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:234:37
      at waitForActual (node:assert:632:21)
      at strict.rejects (node:assert:769:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:234:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

test at scripts\respaldo.test.mjs:238:1
✖ M10.3 destino nuevo usa administración explícita y orden seguro (0.0976ms)
  TypeError: modulo.restaurarNode is not a function
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:240:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

test at scripts\respaldo.test.mjs:243:1
✖ M10.3 sin inyección o administración no hay fallback real (0.0879ms)
  TypeError: modulo.restaurarNode is not a function
      at file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:244:37
      at waitForActual (node:assert:632:21)
      at strict.rejects (node:assert:769:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:244:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

test at scripts\respaldo.test.mjs:247:1
✖ M10.3 error SQL o catálogo inesperado impide la carga (0.1068ms)
  TypeError: modulo.restaurarNode is not a function
      at file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:255:39
      at waitForActual (node:assert:632:21)
      at strict.rejects (node:assert:769:31)
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:255:18)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

test at scripts\respaldo.test.mjs:259:1
✖ M10.3 preparación requiere base recién creada, semillas exactas y cero otros datos (0.0667ms)
  TypeError: modulo.sqlPrepararDestino is not a function
      at TestContext.<anonymous> (file:///C:/Users/HP/Desktop/MICURICHI/scripts/respaldo.test.mjs:260:22)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

```

### red-bash

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "infra/respaldo/respaldo.test.sh"
  ],
  "ramMiB": 5221,
  "exit": 1,
  "signal": null,
  "duracionMs": 15310
}
```

Salida literal:

```text
PASS actual exige reporte físico
PASS previo0020 acepta tabla antigua
PASS actual rechaza vista como TABLE DATA
PASS previo rechaza versión inconsistente
PASS migración inválida
PASS destino vacío actual
PASS destino ocupado solo otras categorías
PASS sin ejecutor SQL no hay fallback
PASS error SQL no es vacío
PASS manifiesto completo coincide con archivo leído
PASS manifiesto omite tabla física
PASS versión de manifiesto inconsistente
PASS manifiesto omite otra tabla
PASS formato desconocido
PASS manifiesto sin integridad
PASS manifiesto sin tamaño
PASS manifiesto con tamaño inválido
PASS objeto y migración deben coincidir
PASS conteo distinto del archivo
PASS tabla duplicada en manifiesto
PASS manifiesto previo0020 compatible
PASS parser COPY cuenta filas reales incluidas NULL/vacío
PASS error al leer archivo propaga fallo
FAIL M10.3 semillas exactas y vacío antes de borrar solo catálogo inicial (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
FAIL M10.3 histórico vacío no borra catálogo inexistente (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
FAIL M10.3 catálogo inesperado aborta (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
FAIL M10.3 configuración/otros datos existentes aborta (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
FAIL M10.3 error SQL aborta preparación (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
FAIL M10.3 sin declaración de destino nuevo aborta (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
FAIL M10.3 preparación sin SQL no tiene fallback (exit=127)
infra/respaldo/respaldo.test.sh: line 34: preparar_catalogo: command not found
TOTAL=30 PASS=23 FAIL=7

```

## Green literal final

### green-node

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--test",
    "scripts/respaldo.test.mjs"
  ],
  "ramMiB": 5001,
  "exit": 0,
  "signal": null,
  "duracionMs": 1922
}
```

Salida literal:

```text
✔ importar no imprime, cambia exitCode ni inicia CLI/procesos (1.059ms)
✔ sin SQL inyectado falla cerrado (0.394ms)
✔ actual compara tabla física y las cuatro categorías con contenido (8.6599ms)
✔ rechaza pérdida de bache aunque Inundaciones siga intacta (0.5743ms)
✔ rechaza pérdida de basura aunque Inundaciones siga intacta (0.4235ms)
✔ rechaza pérdida de area_verde aunque Inundaciones siga intacta (0.2944ms)
✔ rechaza cambio en categoria con igual cantidad total (0.4279ms)
✔ rechaza cambio en detalle con igual cantidad total (0.3155ms)
✔ rechaza cambio en detalle_version con igual cantidad total (0.3116ms)
✔ rechaza cambio en geom con igual cantidad total (0.3558ms)
✔ rechaza cambio en descripcion con igual cantidad total (0.8849ms)
✔ NULL no se confunde con cadena vacía (0.4475ms)
✔ orden de filas no afecta evidencia (0.2783ms)
✔ previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas (0.3626ms)
✔ columna actual perdida no se oculta como compatibilidad (0.2246ms)
✔ rechaza vista usada como tabla física (0.1159ms)
✔ rechaza migración ausente o inconsistente y error SQL (0.4691ms)
✔ mock no previsto y operadores reales permanecen bloqueados (0.1045ms)
✔ pérdida o cambio de catálogo de categorías falla (0.2441ms)
✔ evidencia parcial de categorías no puede pasar por completa (0.2881ms)
✔ conteos inválidos, geometría inválida e índices perdidos fallan (0.625ms)
✔ mismas columnas actuales en versión posterior admite columna nueva (0.2671ms)
✔ oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL (0.3428ms)
✔ M10.3 destino ocupado se rechaza antes de crear/migrar/cargar (0.3141ms)
✔ M10.3 destino nuevo usa administración explícita y orden seguro (0.2088ms)
✔ M10.3 sin inyección o administración no hay fallback real (0.1399ms)
✔ M10.3 error SQL o catálogo inesperado impide la carga (0.1775ms)
✔ M10.3 preparación requiere base recién creada, semillas exactas y cero otros datos (0.1194ms)
✔ M10.3 motor aislado: catálogo exacto, cambios de configuración y errores revierten íntegros (1640.1274ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1807.0906

```

### green-runner

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--test",
    "scripts/ensayar-respaldo-multitematico.test.mjs"
  ],
  "ramMiB": 5040,
  "exit": 0,
  "signal": null,
  "duracionMs": 208
}
```

Salida literal:

```text
✔ M10.3 runner importable sin ejecutar procesos ni SQL (0.9268ms)
✔ M10.3 solo los cuatro nombres fijos; protegidas y nombres parecidos se rechazan (0.1732ms)
✔ M10.3 conexión estrictamente loopback y rol dueño permitido, sin query options (0.2151ms)
✔ M10.3 rutas fijas rechazan traversal, absolutos y artefactos ajenos (0.18ms)
✔ M10.3 estado puro no requiere SQL/credenciales ni crea diario (0.6477ms)
✔ M10.3 etapas desconocidas, fuera de orden e inciertas nunca operan (0.3835ms)
✔ M10.3 checkpoint completo anterior a nueva guarda RAM; no repetición automática (2.4059ms)
✔ M10.3 fallo deja etapa incierta durable y exige revisión manual (0.2613ms)
✔ M10.3 no hay fallback si faltan operadores/diario/freeze (0.2293ms)
✔ M10.3 banco existente exige identidad propia y OID exacto; nunca adopta por nombre (0.4658ms)
✔ M10.3 runner reutiliza respaldar/restaurar y verificador operativo sin shell arbitrario (1.3836ms)
✔ M10.3 fábrica sin adaptador nunca cae a operadores reales y preflight rechaza nombre ajeno (0.7238ms)
✔ M10.3 checkpoint alterado y diario iniciado rechazan reanudación (0.3314ms)
✔ M10.3 negativos verifican mutaciones dentro de la misma sesión y comparan rollback (0.4911ms)
✔ M10.3 negativos siempre hacen rollback si falla el verificador (0.1827ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 119.3727

```

### green-bash

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "infra/respaldo/respaldo.test.sh"
  ],
  "ramMiB": 5062,
  "exit": 0,
  "signal": null,
  "duracionMs": 16165
}
```

Salida literal:

```text
PASS actual exige reporte físico
PASS previo0020 acepta tabla antigua
PASS actual rechaza vista como TABLE DATA
PASS previo rechaza versión inconsistente
PASS migración inválida
PASS destino vacío actual
PASS destino ocupado solo otras categorías
PASS sin ejecutor SQL no hay fallback
PASS error SQL no es vacío
PASS manifiesto completo coincide con archivo leído
PASS manifiesto omite tabla física
PASS versión de manifiesto inconsistente
PASS manifiesto omite otra tabla
PASS formato desconocido
PASS manifiesto sin integridad
PASS manifiesto sin tamaño
PASS manifiesto con tamaño inválido
PASS objeto y migración deben coincidir
PASS conteo distinto del archivo
PASS tabla duplicada en manifiesto
PASS manifiesto previo0020 compatible
PASS parser COPY cuenta filas reales incluidas NULL/vacío
PASS error al leer archivo propaga fallo
PASS M10.3 semillas exactas y vacío antes de borrar solo catálogo inicial
PASS M10.3 histórico vacío no borra catálogo inexistente
PASS M10.3 catálogo inesperado aborta
PASS M10.3 configuración/otros datos existentes aborta
PASS M10.3 error SQL aborta preparación
PASS M10.3 sin declaración de destino nuevo aborta
PASS M10.3 preparación sin SQL no tiene fallback
PASS M10.3 carga compartida histórica verifica esquema/vacío y usa transacción
PASS M10.3 carga aborta antes del operador si SQL falla
PASS M10.3 carga aborta sin ejecutores explícitos
TOTAL=33 PASS=33 FAIL=0

```

### green-node-syntax

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--check",
    "scripts/respaldo.mjs"
  ],
  "ramMiB": 5038,
  "exit": 0,
  "signal": null,
  "duracionMs": 82
}
```

Salida literal:

```text

```

### green-test-syntax

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--check",
    "scripts/respaldo.test.mjs"
  ],
  "ramMiB": 5035,
  "exit": 0,
  "signal": null,
  "duracionMs": 85
}
```

Salida literal:

```text

```

### green-runner-syntax

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--check",
    "scripts/ensayar-respaldo-multitematico.mjs"
  ],
  "ramMiB": 5039,
  "exit": 0,
  "signal": null,
  "duracionMs": 78
}
```

Salida literal:

```text

```

### green-runner-test-syntax

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--check",
    "scripts/ensayar-respaldo-multitematico.test.mjs"
  ],
  "ramMiB": 5040,
  "exit": 0,
  "signal": null,
  "duracionMs": 85
}
```

Salida literal:

```text

```

### green-bash-syntax

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "-n",
    "infra/respaldo/respaldo.sh"
  ],
  "ramMiB": 5028,
  "exit": 0,
  "signal": null,
  "duracionMs": 74
}
```

Salida literal:

```text

```

### green-bash-test-syntax

Metadatos literales:

```json
{
  "orden": "C:/Program Files/Git/bin/bash.exe",
  "args": [
    "-n",
    "infra/respaldo/respaldo.test.sh"
  ],
  "ramMiB": 5018,
  "exit": 0,
  "signal": null,
  "duracionMs": 65
}
```

Salida literal:

```text

```

### green-biome

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "node_modules/@biomejs/biome/bin/biome",
    "check",
    "scripts/respaldo.mjs",
    "scripts/respaldo.test.mjs",
    "scripts/ensayar-respaldo-multitematico.mjs",
    "scripts/ensayar-respaldo-multitematico.test.mjs"
  ],
  "ramMiB": 5038,
  "exit": 0,
  "signal": null,
  "duracionMs": 166
}
```

Salida literal:

```text
Checked 4 files in 26ms. No fixes applied.

```

### green-yaml

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "--input-type=module",
    "-e",
    "import {readFileSync} from \"node:fs\";import {parseDocument} from \"./node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js\";const d=parseDocument(readFileSync(\".github/workflows/ci.yml\",\"utf8\"),{uniqueKeys:true});if(d.errors.length)throw d.errors[0];console.log(\"YAML OK; jobs=\"+Object.keys(d.toJS().jobs).join(\",\"))"
  ],
  "ramMiB": 5035,
  "exit": 0,
  "signal": null,
  "duracionMs": 175
}
```

Salida literal:

```text
YAML OK; jobs=secretos-historial,verificar,e2e,postgres-real,imagenes-docker,infra,publicar-imagenes

```

### green-diff-check

Metadatos literales:

```json
{
  "orden": "git",
  "args": [
    "diff",
    "--check",
    "--",
    "scripts/respaldo.mjs",
    "scripts/respaldo.test.mjs",
    "infra/respaldo/respaldo.sh",
    "infra/respaldo/respaldo.test.sh",
    "scripts/ensayar-respaldo-multitematico.mjs",
    "scripts/ensayar-respaldo-multitematico.test.mjs",
    ".github/workflows/ci.yml",
    "docs/operaciones/respaldo-y-restauracion.md"
  ],
  "ramMiB": 5019,
  "exit": 0,
  "signal": null,
  "duracionMs": 94
}
```

Salida literal:

```text

```

### green-estado

Metadatos literales:

```json
{
  "orden": "node",
  "args": [
    "scripts/ensayar-respaldo-multitematico.mjs",
    "estado"
  ],
  "ramMiB": 5035,
  "exit": 0,
  "signal": null,
  "duracionMs": 99
}
```

Salida literal:

```text
{
  "estado": "sin_iniciar",
  "etapas": [
    "preflight",
    "crear_actual",
    "sembrar_actual",
    "respaldar_actual",
    "cifrar_actual",
    "restaurar_actual",
    "verificar_actual",
    "negativos_actual",
    "crear_pre0020",
    "sembrar_pre0020",
    "respaldar_pre0020",
    "cifrar_pre0020",
    "restaurar_pre0020",
    "verificar_pre0020",
    "negativos_pre0020"
  ]
}

```
