# M5 — Línea base anterior a implementación

Medición del **2026-10-15**, rol **sdd-verificador / LÍNEA BASE**, sin implementación. Parte funcional P2; ampliación P3 de exportación autorizada por el usuario en [ampliacion-exportacion.md](ampliacion-exportacion.md). Banderas: **base, ui, api, geo, privacidad, seguridad y contrato**. Esta evidencia mide lo existente: no declara cumplidos los CA nuevos ni cierra M5.

## Decisiones y punto de partida

- Aprobación comunicada por el principal: «aprueba el plan M5 y continua». Q1 **Inundaciones**; Q2 **detalle/ficha completos**; Q3 **historial completo en Todas**, diferenciando el universo público disponible.
- Rama informada por el principal: `codex/panel-por-categoria`, desde `09930a3`. F0 ya guardado en `arbol-inicial.txt` y `.turbo/m5-2026-10-15/arbol-antes.json` (842 hashes), con copias ignoradas. No se creó stash, ref ni otra escritura en `.git`.
- Los cambios previos de M4 y Zod/CSP se conservan. El principal mantuvo al implementador en lectura durante esta FB. Lecturas obligatorias: AGENTS completo, VentanaContexto, matriz local SDD, plan M5 y ampliación. Los estados antiguos «pendiente» quedan sustituidos por las aprobaciones expresas de esta sesión.
- Escrituras de evidencia: este documento y archivos ignorados de `.turbo/m5-2026-10-15/`. El principal dispuso reutilizar el almacén sintético ignorado M4 para las fotos E2E de la misma base aparte, bajo la autorización E2E vigente; se detalla abajo. Builds autorizados producen sus artefactos; no se editó código, configuración versionada, lockfile, secretos ni `.env`. Sin instalaciones, commits, push, migraciones, semillas, activación de categorías ni cambios de Docker/túneles.

## Entorno y reproducción

`PNPM` en las tablas significa exactamente `node C:/Users/HP/AppData/Local/npm-cache/_npx/90fd45f2ce56cc10/node_modules/pnpm/bin/pnpm.mjs`; versión comprobada **12.4.1**, Node **24.15.0**. Cwd de los comandos PNPM: raíz del repositorio. Opciones efectivas de Turbo: `--concurrency=1`; Vitest: `--maxWorkers=1`. Secuencial, un único turno pesado.

El harness [estaticos-linea-base.mjs](../../../.turbo/m5-2026-10-15/estaticos-linea-base.mjs) registra cada comando, inicio/fin UTC, segundos, exit y salida real en [estaticos-resultados.jsonl](../../../.turbo/m5-2026-10-15/estaticos-resultados.jsonl). Cada tarea tiene `<nombre>.preflight.json`: RAM, procesos y puertos. Umbral estático **1500 MiB**; E2E **2500 MiB**. Ningún ejecutor pesado ajeno fue autorizado ni detenido. Se comprobó la ascendencia de los propios cuando las lecturas ligeras coincidieron con una suite.

Incidencias de preparación, sin tests ejecutados en esos intentos: [incidencias-preparacion.log](../../../.turbo/m5-2026-10-15/incidencias-preparacion.log). Incluye CIM inaccesible en sandbox (misma lectura repetida con require_escalated), espera por RAM y corrección de Path solo en el harness ignorado; no se atribuyen a regresiones del producto.

En estáticos se eliminaron **solo del entorno hijo** DATABASE_URL, API_DATABASE_URL, GEO_DATABASE_URL, DATABASE_URL_PG_REAL, S3 y contraseñas heredadas de pruebas/seeds, además de NODE_OPTIONS. No se leyó `.env` para esas suites. Las bases de Vitest son PGlite en memoria con socket efímero: su URL sintética puede llamarse `curichi` dentro del servidor efímero, sin conectar a la base habitual del puerto 5432.

### Adaptaciones explícitas de alcance/caché

1. Inicialmente no había permiso para regenerar contracts: se añadió `--only` a Turbo para consumir dist existentes sin ejecutar `^build`. Tras aprobar la ampliación se guardó YAML/hash y se ejecutaron **20 contracts build y 21 db build**, sin cambios de fuente.
2. Por coordinación del principal dentro del plan aprobado, **08 completa API** sustituye 12/14, los comandos por archivos de privacidad y seguridad. **24 consumidores excluyendo DB** cubre geo, ETL, jitter y contracts; **11** mide solo los tres archivos DB pedidos por geo. Tipos completos en **22**. No se ejecutaron 09/10/12/13/14/18/19 por separado. API/panel/ETL ya verdes se reaprovechan por caché, sin repetir las suites directamente. Estas adaptaciones de ejecución no se atribuyen a instrucciones directas del usuario.
3. **Alcance acordado de F4: 24 (seis paquetes de pruebas, excluyendo DB) + 11 (tres archivos DB) y tipos 22 (siete paquetes)**. Para F4 después del cambio de contracts, quitar `--only` del comando de consumidores: `PNPM exec turbo run test --filter=...contracts --filter=!db --concurrency=1 -- --maxWorkers=1`; tipos análogo. La inspección sin ejecución [cache-grafo.json](../../../.turbo/m5-2026-10-15/cache-grafo.json) demuestra que `--only` elimina las dependencias de la clave de API: `d81b2bb2cb0ddc86`, sin dependencias; el grafo normal incluye `contracts#build` y `db#build` (builds, no suite de migraciones). No aceptar como prueba del contrato nuevo un replay cuyo hash solo cubra el consumidor. Esta diferencia de opción está justificada; se conserva el alcance de pruebas acotado y las mismas opciones de Vitest. La FB ya mide por separado los dos builds adicionales del grafo normal. Aprovechar la caché válida, sin borrar caches ni usar force. No volver a ejecutar todas las migraciones DB para M5.

## Comandos estáticos ejecutados

| ID | Comando efectivo | Exit | Segundos | Salida real |
|---|---|---:|---:|---|
| versiones | `PNPM --version` | 0 | 1.052 | [versiones.log](../../../.turbo/m5-2026-10-15/versiones.log) |
| 01-lint-global | `PNPM lint` | 1 | 1.215 | [01-lint-global.log](../../../.turbo/m5-2026-10-15/01-lint-global.log) |
| 02-biome-panel | `PNPM exec biome check apps/panel-admin --reporter=summary` | 0 | 1.367 | [02-biome-panel.log](../../../.turbo/m5-2026-10-15/02-biome-panel.log) |
| 03-tipos-panel | `PNPM exec turbo run typecheck --filter=...panel-admin --concurrency=1 --only` | 0 | 4.064 | [03-tipos-panel.log](../../../.turbo/m5-2026-10-15/03-tipos-panel.log) |
| 04-test-panel | `PNPM exec turbo run test --filter=...panel-admin --concurrency=1 --only -- --maxWorkers=1` | 0 | 23.609 | [04-test-panel.log](../../../.turbo/m5-2026-10-15/04-test-panel.log) |
| 05-build-panel | `PNPM exec turbo run build --filter=...panel-admin --concurrency=1 --only` | 0 | 19.889 | [05-build-panel.log](../../../.turbo/m5-2026-10-15/05-build-panel.log) |
| 06-secretos-seguidos | `node scanner del repositorio adaptado SOLO EN MEMORIA seguidos --todos valores redactados` | 0 | 0.426 | [06-secretos-seguidos.log](../../../.turbo/m5-2026-10-15/06-secretos-seguidos.log) |
| 07-secretos-todos | `node scanner del repositorio adaptado SOLO EN MEMORIA seguidos+nuevos --todos valores redactados` | 0 | 0.347 | [07-secretos-todos.log](../../../.turbo/m5-2026-10-15/07-secretos-todos.log) |
| 08-test-api-consumidores | `PNPM exec turbo run test --filter=...api-core --concurrency=1 --only -- --maxWorkers=1` | 0 | 454.943 | [08-test-api-consumidores.log](../../../.turbo/m5-2026-10-15/08-test-api-consumidores.log) |
| 20-build-contracts | `PNPM --filter contracts build` | 0 | 3.704 | [20-build-contracts.log](../../../.turbo/m5-2026-10-15/20-build-contracts.log) |
| 21-build-db | `PNPM --filter db build` | 0 | 3.713 | [21-build-db.log](../../../.turbo/m5-2026-10-15/21-build-db.log) |
| 22-tipos-consumidores-contracts | `PNPM exec turbo run typecheck --filter=...contracts --concurrency=1 --only` | 0 | 33.079 | [22-tipos-consumidores-contracts.log](../../../.turbo/m5-2026-10-15/22-tipos-consumidores-contracts.log) |
| 23-test-consumidores-contracts | `PNPM exec turbo run test --filter=...contracts --concurrency=1 --only -- --maxWorkers=1` | 1 | 475.815 | [23-test-consumidores-contracts.log](../../../.turbo/m5-2026-10-15/23-test-consumidores-contracts.log) |
| 15-auditoria | `PNPM audit --audit-level high` | 1 | 2.988 | [15-auditoria.log](../../../.turbo/m5-2026-10-15/15-auditoria.log) |
| 16-candidatos-nuevos | `C:\Program Files\nodejs\node.exe --input-type=module -e [código memoria; ver harness]` | 0 | 0.304 | [16-candidatos-nuevos.log](../../../.turbo/m5-2026-10-15/16-candidatos-nuevos.log) |
| 17-diff-check | `git diff --check` | 0 | 0.309 | [17-diff-check.log](../../../.turbo/m5-2026-10-15/17-diff-check.log) |
| 24-test-consumidores-sin-db | `PNPM exec turbo run test --filter=...contracts --filter=!db --concurrency=1 --only -- --maxWorkers=1` | 0 | 141.394 | [24-test-consumidores-sin-db.log](../../../.turbo/m5-2026-10-15/24-test-consumidores-sin-db.log) |
| 11-test-puntos-criticos | `PNPM --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts test/puntos-criticos-metrica.test.ts --maxWorkers=1` | 0 | 33.056 | [11-test-puntos-criticos.log](../../../.turbo/m5-2026-10-15/11-test-puntos-criticos.log) |
| 25-secretos-todos-final | `C:\Program Files\nodejs\node.exe --input-type=module -e [código memoria; ver harness] -- --todos` | 0 | 0.563 | [25-secretos-todos-final.log](../../../.turbo/m5-2026-10-15/25-secretos-todos-final.log) |
| 27-candidatos-nuevos-final | `C:\Program Files\nodejs\node.exe --input-type=module -e [código memoria; ver harness]` | 0 | 0.167 | [27-candidatos-nuevos-final.log](../../../.turbo/m5-2026-10-15/27-candidatos-nuevos-final.log) |
| 26-diff-check-final | `git diff --check` | 0 | 0.128 | [26-diff-check-final.log](../../../.turbo/m5-2026-10-15/26-diff-check-final.log) |

Un exit 0 de una suite con omisiones no convierte las omitidas en PASS. Las duraciones corresponden al proceso PNPM/comando registrado; los logs conservan además las duraciones internas de Turbo/Vitest.

### Suite consolidada 24, sin doble contabilizar replays

| Paquete | Pruebas aprobadas | Omitidas | Archivos | Caché |
|---|---:|---:|---|---|
| geo-service | 71 | 0 | Test Files  6 passed (6) | cache miss, executing 7829b7b5c5336ab6 |
| web-ciudadano | 645 | 0 | Test Files  49 passed (49) | cache miss, executing 1e7ac7662d50e7b2 |
| panel-admin | 458 | 0 | Test Files  40 passed (40) | cache hit, replaying logs 108441a3ebe787b4 |
| geodata-etl | 21 | 0 | Test Files  3 passed (3) | cache hit, replaying logs cc2a5058b0b96118 |
| api-core | 436 | 12 | Test Files  33 passed \| 2 skipped (35) | cache hit, replaying logs d81b2bb2cb0ddc86 |
| contracts | 303 | 0 | Test Files  20 passed (20) | cache miss, executing 098306c3405eea3d |

DB se verificó únicamente para el alcance requerido en 11:

```text
 Test Files  3 passed (3)
      Tests  20 passed (20)
   Duration  32.15s (transform 908ms, setup 0ms, import 1.58s, tests 29.67s, environment 0ms)
```

### Interrupción controlada del alcance demasiado amplio 23

23 terminó con exit **1** a los **475,815 s**, por interrupción dispuesta por el principal dentro del plan aprobado, antes del timeout de 600 s. No fue una instrucción directa del usuario. La suite DB completa estaba descacheada y su ejecución excedía el alcance necesario para M5, que no cambia DB. Quedaron seis archivos DB con salida individual aprobada; **la suite DB completa y 23 completo NO están verificados y no son PASS**. No se observó un test fallido antes de interrumpir; esto no es una regresión anterior a código.

Se verificó el token del padre propio **14500**, hijo directo **5948** y todos sus descendientes; `taskkill /PID 5948 /T /F` exit 0, **cero residuos**. Evidencia [23-interrupcion.meta.json](../../../.turbo/m5-2026-10-15/23-interrupcion.meta.json) y [23-interrupcion.log](../../../.turbo/m5-2026-10-15/23-interrupcion.log). El resultado ETL 21/21 ya concluido se conserva y 24 lo reaprovecha. Se sustituyó por 24 + 11; no se repitió 23 entero ni se tocaron ejecutores ajenos.

La suite inicial del panel **04** pasó **458 pruebas / 40 archivos**, con ejecución nueva; tipos **03** y build **05** también fueron ejecuciones nuevas. Tipos de consumidores **22**:

```text
geo-service:typecheck: cache miss, executing ff8def5aafa81227
contracts:typecheck: cache hit, replaying logs ebc65b4002a759db
api-core:typecheck: cache miss, executing f87c9fada915e85c
db:typecheck: cache miss, executing 4ef55e228ccbb2d1
panel-admin:typecheck: cache hit, replaying logs 913c8b7657766cf6
web-ciudadano:typecheck: cache miss, executing 202cb137888489c6
geodata-etl:typecheck: cache miss, executing d163b66b809f5454
 Tasks:    7 successful, 7 total
Cached:    2 cached, 7 total
```

### Evidencia por archivo para las banderas de frontera

| Bandera | Ejecución | Archivo | Salida observada |
|---|---|---|---|
| privacidad | 08 | test/privacidad-ubicacion.test.ts | api-core:test:  ✓ test/privacidad-ubicacion.test.ts (8 tests) 9731ms |
| privacidad | 08 | test/vista-publica-vs-tecnica.test.ts | api-core:test:  ✓ test/vista-publica-vs-tecnica.test.ts (19 tests) 18975ms |
| privacidad | 08 | test/publicacion-diferida.test.ts | api-core:test:  ✓ test/publicacion-diferida.test.ts (22 tests) 23668ms |
| privacidad | 08 | test/exportacion.test.ts | api-core:test:  ✓ test/exportacion.test.ts (10 tests) 13291ms |
| privacidad | 08 | test/ubicacion-dispositivo.test.ts | api-core:test:  ✓ test/ubicacion-dispositivo.test.ts (21 tests) 14754ms |
| privacidad | 08 | test/ubicacion-aproximada.test.ts | api-core:test:  ✓ test/ubicacion-aproximada.test.ts (14 tests) 8286ms |
| seguridad | 08 | test/seguridad.test.ts | api-core:test:  ✓ test/seguridad.test.ts (41 tests) 217ms |
| seguridad | 08 | test/autenticacion.test.ts | api-core:test:  ✓ test/autenticacion.test.ts (16 tests) 9141ms |
| seguridad | 08 | test/fotos.test.ts | api-core:test:  ✓ test/fotos.test.ts (21 tests) 21181ms |
| seguridad | 08 | test/fotos-abuso.test.ts | api-core:test:  ✓ test/fotos-abuso.test.ts (10 tests) 250ms |
| seguridad | 08 | test/cuentas-y-cuota.test.ts | api-core:test:  ✓ test/cuentas-y-cuota.test.ts (26 tests) 10588ms |
| seguridad | 08 | test/cupo-diario.test.ts | api-core:test:  ✓ test/cupo-diario.test.ts (24 tests) 9490ms |
| seguridad | 08 | test/fotos-cuota.test.ts | api-core:test:  ✓ test/fotos-cuota.test.ts (10 tests) 18342ms |
| seguridad | 08 | test/fotos-webp.test.ts | api-core:test:  ✓ test/fotos-webp.test.ts (6 tests) 446ms |
| seguridad | 08 | test/guarda-disco.test.ts | api-core:test:  ✓ test/guarda-disco.test.ts (9 tests) 9420ms |
| geo | 11 | test/puntos-criticos-entorno.test.ts | Seleccionado explícitamente en 11: los 3 archivos pasan, 20 pruebas en total; sin desglose individual en stdout. |
| geo | 11 | test/puntos-criticos-volumen.test.ts | Seleccionado explícitamente en 11: los 3 archivos pasan, 20 pruebas en total; sin desglose individual en stdout. |
| geo | 11 | test/puntos-criticos-metrica.test.ts | Seleccionado explícitamente en 11: los 3 archivos pasan, 20 pruebas en total; sin desglose individual en stdout. |
| privacidad | 24 | test/jitter.test.ts | contracts:test:  ✓ test/jitter.test.ts (4 tests) 7ms |

### OpenAPI antes de regenerar

Copia previa [openapi-base.antes.yaml](../../../.turbo/m5-2026-10-15/openapi-base.antes.yaml) y [openapi-base.antes.sha256](../../../.turbo/m5-2026-10-15/openapi-base.antes.sha256). Build 20 exit **0**; comparación por bytes: **IDÉNTICO**.

- SHA-256 antes: `aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac`.
- SHA-256 generado: `aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac`.

## Rojos, omisiones y hallazgo conocido

- **Lint global exit 1**: un error de formato en `ContextosySkills/hooks/contexto.mjs`; cinco avisos `noUndeclaredEnvVars` en líneas 42, 43, 45 (dos) y 49; un aviso `noDescendingSpecificity` en `docs/dominio/infografia-plataformas-riesgo.html:128`. Coinciden con lo preexistente documentado. Biome del panel exit 0, 119 archivos, sin correcciones aplicadas. No se arreglaron rojos ajenos.
- **API: 12 omitidas conocidas**: 8 en `cuota-concurrencia-pg.test.ts`, 2 en `fotos-cuota-concurrencia-pg.test.ts` por ausencia de DATABASE_URL_PG_REAL; 2 contra S3 real en `almacen-s3.test.ts` por ausencia de credenciales. No se adquirieron credenciales ni se levantaron servicios para ellas; **PostgreSQL real de concurrencia y S3 real NO VERIFICADOS**. El resto de ese archivo S3 sí se ejecutó y figura en 08.
- **Auditoría exit 1**: 14 vulnerabilidades, **3 high, 10 moderate, 1 low y cero críticas**. Las high corresponden a source-map-js, sharp y next, las ya documentadas en continuidad; detalle exacto y rutas en **15**. Rojo de FB, sin actualizar dependencias fuera de alcance.
- Advertencias no fatales observadas: Node avisa sintaxis de módulo en configuraciones Vitest de frontend; pg avisa de consultas concurrentes sobre un mismo cliente; Turbo avisa que no hay archivos de coverage de salida para ciertas tareas. No son fallos de test ni se ocultaron.
- **CA5, exportación de otra categoría con planos nulos**: defecto comunicado por lectura/auditoría externa y documentado en la ampliación aprobada. Las suites existentes verdes **no lo cubren ni lo descartan**. No se añadió una prueba nueva ni se activó otra categoría durante esta FB. Lo debe reproducir M5.0 antes de corregirlo.

## E2E de línea base autorizada

Docker se consultó **solo mediante ps y metadatos**: [docker-antes.log](../../../.turbo/m5-2026-10-15/docker-antes.log) y [docker-antes.meta.json](../../../.turbo/m5-2026-10-15/docker-antes.meta.json). PostGIS y MinIO saludables al preflight; no compose up/stop/build, migración, seed ni cambios de imágenes. El coordinador del principal se leyó completo antes de ejecutar: [ejecutar-e2e.mjs](../../../.turbo/m5-2026-10-15/ejecutar-e2e.mjs) y [playwright-aislado.config.ts](../../../.turbo/m5-2026-10-15/playwright-aislado.config.ts). El envoltorio [linea-base-e2e.mjs](../../../.turbo/m5-2026-10-15/linea-base-e2e.mjs) pasa argumentos y entorno como objetos, sin interpolar secretos en shell.

Comando: `node .turbo/m5-2026-10-15/ejecutar-e2e.mjs G1 G4 G5 fronteras`, entorno de proceso `M5_SUFIJO=base`, `M5_NEXT_DEV` ausente. **Next start de producción**, artefacto web existente de M4 y build actual del panel. Chromium físico ya cacheado; un trabajador y **retries=1** heredado de la configuración. Exit del coordinador **1**; 295.186 s. [e2e-base-coordinador.log](../../../.turbo/m5-2026-10-15/e2e-base-coordinador.log) / [e2e-base.meta.json](../../../.turbo/m5-2026-10-15/e2e-base.meta.json).

La primera invocación **abortó tras G4 rojo**, limpió sus cuatro árboles de servicios y comprobó los cuatro puertos libres. G5/fronteras todavía no se habían ejecutado. Se completan en una invocación aparte, sin repetir G1/G4: `node .turbo/m5-2026-10-15/ejecutar-e2e.mjs G5 fronteras`, mismo entorno, configuración y almacén. Continuación exit **0**; 287.515 s. [e2e-base-continuacion.log](../../../.turbo/m5-2026-10-15/e2e-base-continuacion.log) / [e2e-base-continuacion.meta.json](../../../.turbo/m5-2026-10-15/e2e-base-continuacion.meta.json).

El coordinador deriva credenciales solo en memoria; permite exclusivamente `curichi_e2e`, comprueba current_database/current_user de los roles API/geo y privilegios, y entrega a Next un entorno sin DB. Únicamente servicios/API/tests de la ventana usan esa base aparte y fotos sintéticas ignoradas. No conecta a las bases habituales `curichi`/`curichi_revision`. Se verifica RAM antes de cada grupo. Proyectos ejecutados: **chromium**; no hubo proyecto movil adicional en esta FB. G5 sí contiene sus escenarios de responsive existentes.

**Almacén sintético dispuesto por el principal para baseline y F4, bajo la autorización E2E vigente:** `C:/Users/HP/Desktop/MICURICHI/.turbo/cierre-m4-2026-10-14/fotos-e2e`, conocido por el principal y usado por la misma `curichi_e2e`. No se atribuye su elección a un mensaje específico del usuario. Metadatos previos: **13 WebP / 39.924 bytes**, [almacen-sintetico.meta.json](../../../.turbo/m5-2026-10-15/almacen-sintetico.meta.json). Se ajustó únicamente STORAGE_DIR del coordinador ignorado para evitar 404 de objetos históricos sintéticos; no se copió base, secretos ni almacén habitual. Los nuevos objetos de la E2E siguen siendo sintéticos en esa ruta. Docker se revalidó justo antes: [docker-previo-e2e.log](../../../.turbo/m5-2026-10-15/docker-previo-e2e.log).

| Grupo | Aprobadas estables | Flaky | Fallidas inesperadas | Omitidas | Segundos Playwright | JSON | Log |
|---|---:|---:|---:|---:|---:|---|---|
| G1 | 47 | 0 | 0 | 0 | 85.890 | [G1-base-resultado.json](../../../.turbo/m5-2026-10-15/G1-base-resultado.json) | [e2e-G1-base.log](../../../.turbo/m5-2026-10-15/e2e-G1-base.log) |
| G4 | 42 | 0 | 1 | 0 | 190.831 | [G4-base-resultado.json](../../../.turbo/m5-2026-10-15/G4-base-resultado.json) | [e2e-G4-base.log](../../../.turbo/m5-2026-10-15/e2e-G4-base.log) |
| G5 | 18 | 0 | 0 | 0 | 127.848 | [G5-base-resultado.json](../../../.turbo/m5-2026-10-15/G5-base-resultado.json) | [e2e-G5-base.log](../../../.turbo/m5-2026-10-15/e2e-G5-base.log) |
| fronteras | 24 | 0 | 0 | 0 | 141.972 | [fronteras-base-resultado.json](../../../.turbo/m5-2026-10-15/fronteras-base-resultado.json) | [e2e-fronteras-base.log](../../../.turbo/m5-2026-10-15/e2e-fronteras-base.log) |

- `G4` / `panel-al-dia.spec.ts → panel al día sin recargar → la bandeja: con la pestaña oculta no pide nada y al volver refresca, como sondeo` / proyecto `chromium`: **unexpected**; intentos: failed (retry 0), failed (retry 1).

**Rojo G4 anterior a M5:** `e2e/tests/panel-al-dia.spec.ts:202`, aserción de línea 216, «la bandeja: con la pestaña oculta no pide nada y al volver refresca, como sondeo». **42/43 pasan; el caso falla en los dos intentos**. Esperaba cero solicitudes durante la ocultación; recibió dos consultas de bandeja (lista límite 50 y mapa límite 500) con bbox. El caso equivalente de ejecutivo oculto pasó.

**Diagnóstico READONLY independiente de Copernicus, comunicado por el principal en esta sesión:** JSON y trazas muestran que después de ocultar la pestaña hay navegación RSC por bbox y dos claves nuevas de tabla/mapa **sin marca de sondeo**; los KPI estables no se solicitan. El debounce de **400 ms de alMover no comprueba visibilidad**. La causa está en ese cambio de bbox, **no en el intervalo global**. El principal confirmó defecto **P2 preexistente incluido en CA10 ya aprobado** y lo entregó a Galileo para **M5.1/2 conservando el test**; no requiere ampliar fuera de P2. Este verificador leyó la salida/test, no volvió a ejecutar el caso ni implementó. Fuentes de ejecución: [G4-base-resultado.json](../../../.turbo/m5-2026-10-15/G4-base-resultado.json), [e2e-G4-base.log](../../../.turbo/m5-2026-10-15/e2e-G4-base.log) y trazas/capturas bajo `.turbo/m5-2026-10-15/G4-base-artefactos/`. Se atribuye la conclusión causal a Copernicus, no a una reproducción adicional de este verificador. Este rojo es **conocido de FB, no una regresión causada por M5**; F4 debe demostrar su corrección sin retirar/debilitar la aserción.

Los JSON conservan casos, intentos, estado y artefactos para comparar F4. No se creó ni editó spec E2E. Con una sola definición real, estos grupos no prueban el cambio real entre dos categorías ni la futura exportación multitemática corregida. No hay evidencia nueva de lector de pantalla real, imagen habitual por Caddy o túnel; **NO VERIFICADO**. Los CA nuevos se contrastarán después de implementar.

## Secretos, integridad y entrega

06 y 07 usan las reglas originales de `scripts/buscar-secretos.mjs`, adaptadas **solo en memoria**: valores de hallazgos redactados; 07 incluye seguidos y nuevos con `git ls-files --cached --others --exclude-standard`. No se modificó el escáner. El barrido adicional 16 muestra únicamente ruta/línea de candidatos de texto en nuevos del panel y esta corrida; no son secretos confirmados ni certificado de ausencia. No se imprimieron valores reales.

Los controles finales y la liberación se consignan al pie, después de verificar que no quedan árboles propios/puertos de la ventana. Evidencia de ejecución cerrada con los rojos y límites expresos; ver registro final del token al pie.

## Control final y turno liberado

- Cierre: **2026-10-15T16:58:18.1572520-04:00**; **TOKEN DE EJECUTOR LIBERADO**. [Registro de cierre](../../../.turbo/m5-2026-10-15/cierre-ejecutor.json).
- Cero ejecutores pesados propios/ajenos al control final; 3000/3001/3002/3100 libres. Los dos coordinadores cerraron solo sus cuatro árboles de servicios; Docker final [healthy](../../../.turbo/m5-2026-10-15/docker-despues.log).
- E2E: **131 aprobadas estables, 1 fallida basal (G4, ambos intentos), 0 flaky, 0 omitidas**, sobre 132 casos. No hubo repetición de G1/G4 para completar G5/fronteras.
- Consumidores acotados: **1934 aprobadas + 12 omitidas**; DB tres archivos: **20 aprobadas**. Se distingue ejecución/replay por paquete en la tabla; 23 completo quedó interrumpido, nunca verde.
- Controles tras escribir la evidencia: 25 secretos seguidos+nuevos, exit 0, sin hallazgos; 27 barrido sin valores, 14 coincidencias de vocabulario/referencias en documentos, no secretos confirmados; 26 diff --check, exit 0. La última actualización agrega solo esas filas y este cierre, sin datos personales ni credenciales.
- Se conservan los rojos de lint y auditoría, las 12 omisiones y los límites en vivo/multicategoría. G4 queda entregado a la corrección P2 ya aprobada, preservando la aserción. No hubo implementación ni reversión de M4.
