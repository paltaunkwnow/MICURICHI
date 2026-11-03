# Línea base M6 — Baches (FB independiente)

**FB COMPLETADA. Estáticos: 2381 PASS (1093 nuevos / 1288 caché) + 12 omisiones conocidas.
E2E G1–G5: 197 PASS + 1 omisión intencional; 0 fallos, 0 flaky, 0 retries. Turno pesado liberado.**
Verificador independiente asignado por el usuario, único ejecutor pesado hasta entrega explícita.
Principal limitado a documentación. No se ha iniciado programación M6. G1–G5 se ejecutaron
en serie después del checkpoint estático completo; sus cinco resultados ya están guardados.

## Identidad, alcance y restricciones

- Rama `codex/baches-piloto`; HEAD y `refs/sdd/baches-piloto`:
  `59b80781030707b8c3334bfbfd40f80000c60a57`, comprobados al comenzar.
- Plan aprobado por el usuario este turno. Leídos AGENTS completo, VentanaContexto,
  plan, arbol-inicial y skill/matriz SDD de `.agents/skills/sdd/`.
- Banderas: base, contrato, api, ui, geo, datos, concurrencia, privacidad, seguridad;
  controles del arnés E2E adaptados a las restricciones expresas del usuario.
- Grafo `--filter=...contracts`: contracts, db, api-core, geo-service, geodata-etl,
  web-ciudadano y panel-admin; E2E tipos/listado y G1–G5 por separado.
- Escritura propia: este documento y `.turbo/m6-2026-10-18/fb/`.
  Sin edición de fuentes/config/tests seguidos, Git mutaciones, instalaciones, descargas,
  variables persistentes, borrados de cachés/logs ni operaciones Docker destructivas.
- PostgreSQL real solo `curichi_e2e` existente o `curichi_sdd_*`; nunca conectar las bases
  habituales. Cero clientes PG reales durante estáticos; preflight G1 validado después:
  tres identidades `curichi`/`curichi_api`/`curichi_geo`, todas en `curichi_e2e`.
  PGlite de las suites es efímero en memoria, con socket local de puerto aleatorio;
  su nombre lógico `curichi` no es la base real de Docker.
- Guardas: 1500 MiB estáticos / 2500 MiB navegador, un worker, concurrency 1.
  CIM falló dentro del sandbox; se escaló la lectura segura solicitada. No se mataron procesos ajenos.

## Cambios documentales concurrentes declarados

F0 contiene 877 SHA256 en `.turbo/m6-2026-10-18/arbol-inicial.json`.
El cotejo propio inicial conserva fuentes funcionales. Deltas documentales observados:
`VentanaContexto.md`, `docs/README.md`, `docs/arquitectura/14-decisiones-m0-y-plan-m1.md`,
`docs/decisiones/README.md`, `docs/sdd/README.md`.
El principal confirmó además ADR0024/dominio y modificaciones autorizadas de AGENTS/CLAUDE
solo §1, §4.8 y fila 7 de §16; versión actual 0.22 y objetivo 0.23 pendiente.
Esos cambios no son trabajo de este verificador y no se sobrescriben.

## Comandos y resultados confirmados hasta el checkpoint

Los envoltorios propios están en el scratch. Eliminan variables heredadas de destinos PG/S3
para las suites estáticas y guardan comando, tiempos, salida y nombres por prueba.
No usan npx ni sincronización automática de dependencias.

| Control | Comando efectivo y opciones | Estado | Duración / evidencia |
|---|---|---|---|
| Tipos y dependencias | `node node_modules/turbo/bin/turbo run typecheck --filter=...contracts --concurrency=1 --output-logs=full --log-order=stream` | **9/9 tareas exitosas; 9/9 cache hit**, ninguna compilación nueva atribuida | 1,354 s; `fb/types-intento1.log` y `types-intento1-run.json` |
| Contracts | En `packages/contracts`: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=verbose --reporter=json --outputFile=<scratch>/test-contracts-intento1-result.json` | **EJECUTADO: 21 archivos / 363 pruebas PASS; 0 fallos, 0 omitidas** | 13,330 s; log completo + JSON con nombres |
| DB | Mismo Vitest/opciones, cwd `packages/db`, resultado `test-db-intento1-result.json` | **EJECUTADO: 28 archivos / 294 pruebas PASS; 0 fallos, 0 omitidas** | 407,957 s; guarda 3202 MiB, 0 pesados ajenos; log completo + JSON con nombres |
| API intento 1 | Mismo Vitest/opciones, cwd `services/api-core` | **INTERRUMPIDO por corte del turno**, sin log/run/result final; ni FAIL ni PASS | Conservada guarda 17:53:08: 4675 MiB, 0 pesados ajenos |
| API intento 2 | Mismo Vitest/opciones desde cero; resultado `test-api-core-intento2-result.json` | **EJECUTADO: 436 PASS + 12 omitidas, 0 fallos; 33 archivos PASS + 2 omitidos (35)** | 245,079 s; guarda propia 2862 MiB, cero pesados ajenos |
| Geo / ETL / panel / web | Turbo `run test --filter=...contracts --filter=!contracts --filter=!db --filter=!api-core --concurrency=1 --output-logs=full --log-order=stream -- --maxWorkers=1` | **6/6 tareas cache hit** (cuatro suites y dos builds dependientes), exit 0 | 1,712 s; `test-grafo-cache-intento1.log` |
| Builds | Turbo `run build --filter=...contracts --concurrency=1 --output-logs=full --log-order=stream` | **7/7 exitosas: 4 cache hit, 3 compilaciones nuevas** (API, geo y ETL) | 20,193 s; guarda 3406 MiB, cero pesados ajenos |
| Guardas del scratch E2E | `node .turbo/m6-2026-10-18/fb/aislamiento.mjs guard-tests` | **27/27 destinos inválidos rechazados antes de clientes**, conjunto válido aceptado | Prueba pura del arnés, **no** prueba de producto ni conexión a base |
| Integridad F0 | `node .turbo/m6-2026-10-18/fb/verificar.mjs integrity inicial` | 877 comparados; solo cinco deltas documentales arriba | `fb/integridad-inicial.json` |

Salida pegada de tipos:

```text
Tasks:    9 successful, 9 total
Cached:   9 cached, 9 total
Time:     923ms >>> FULL TURBO
```

Identidades de caché: contracts:typecheck `53dc9cdd75eaa83a`, contracts:build
`75a4f07b797aed30`, db:build `e7d0f0437b989e70`, db:typecheck `9b1fd74e24c50144`,
api-core:typecheck `d3af8a8521f8acf1`, geo-service:typecheck `67ebd22545e16d15`,
geodata-etl:typecheck `1da35070e88b0cbd`, web-ciudadano:typecheck `deed7839aad0e9f6`,
panel-admin:typecheck `227d5e827e03774f`.

Salida pegada de contracts:

```text
Test Files  21 passed (21)
Tests       363 passed (363)
Start at    17:45:23
Duration    10.58s (transform 1.07s, import 5.02s, tests 435ms)
JSON report written to .../fb/test-contracts-intento1-result.json
```

## Checkpoint estático completo — resultado vigente

**2381 pruebas aprobadas en el alcance medido: 1093 ejecutadas ahora + 1288 de caché
válida; 12 omisiones conocidas no verificadas. Cero fallos funcionales en estas suites.**
La interrupción de API intento 1 y el ENOENT de Biome intento 1 son incidentes del arnés/turno,
no un resultado FAIL de producto. No se declara una regresión por ellos.

| Paquete | PASS | Archivos | Procedencia |
|---|---:|---:|---|
| contracts | 363 | 21 | ejecución nueva intento 1, 13,330 s |
| db | 294 | 28 | ejecución nueva intento 1, 407,957 s |
| api-core | 436 + 12 omitidas | 35 (33 PASS / 2 omitidos) | ejecución nueva intento 2, 245,079 s |
| geo-service | 71 | 6 | cache hit `0acb711473314a33` |
| geodata-etl | 21 | 3 | cache hit `c7df45c6be20547d` |
| panel-admin | 551 | 52 | cache hit `a4b64fb6148166af` |
| web-ciudadano | 645 | 49 | cache hit `af25e928c524c8a1` |

Las cuatro suites cacheadas se descubrieron de nuevo **sin ejecutar sus tests** mediante
`vitest list --maxWorkers=1 --json=<scratch>`; sus 71/21/551/645 nombres coinciden con
los recuentos del replay. Se conservan `casos-cache-<paquete>-intento1.json` y el log completo
`test-grafo-cache-intento1.log`. No son resultados nuevos de ejecución.
Manifest consolidado con nombres y resultados: `.turbo/m6-2026-10-18/fb/resumen-estatico.json`.

| Control adicional | Resultado ejecutado | Evidencia en `fb/` |
|---|---|---|
| OpenAPI | Dos generaciones aisladas, ambas idénticas a 0.22.0 seguido, sin escribirlo | `openapi-igual-1.json`, `openapi-igual-2.json`; SHA256 `7b50c9251903450377c29197e4797d9bd97f4d3f3b924659e7b142510da2fa94` |
| E2E tipos | Exit 0, 1,620 s; `tsc --noEmit --incremental false -p .` en e2e | `e2e-types-intento1.log` |
| E2E descubrimiento | Exit 0, 2,754 s; 198 casos descubiertos, **ninguno ejecutado** | `e2e-list-intento1.log`; su reporter marca 198 skipped por ser `--list`, no son 198 omisiones reales |
| Biome intento 1 | NO EJECUTADO: binario indicado inexistente, `spawnError: ENOENT`, -4058 | `lint-intento1-run.json`, preservado |
| Biome intento 2 | Exit 1: **1 error de formato / 6 warnings**, iguales a M5; 565 archivos, sin fixes | `lint-intento2.log`; ejecutable instalado `node node_modules/@biomejs/biome/bin/biome check . --reporter=summary` |
| Audit | Exit 1: **3 high / 10 moderate / 1 low / 0 critical**, mismas tres high M5 | `audit-intento1.log`; pnpm instalado, `--config.verify-deps-before-run=false audit --audit-level high --json` |
| Secretos | Exit 0: **sin hallazgos**, 858 archivos elegibles tracked+nuevos | `secretos-intento1.log`, `secretos-inventario.json` |
| Nuevos candidatos | 7 archivos nuevos, 5 coincidencias redactadas; revisadas como texto documental de controles/variables | `nuevos-candidatos-redactados.json`; ningún valor secreto expuesto |
| Compose | `config --quiet` exit 0; puertos de API/geo/PostGIS en loopback, solo proxy público | `compose-config-quiet-intento1.log`, `compose-puertos.json` |
| Docker metadata | MinIO y PostGIS running/healthy; ninguna app habitual levantada en esta foto | `docker-pila-antes.log`; solo lectura, sin conexión PG |
| Diff / migraciones | `git diff --check` exit 0; migraciones existentes sin M/D/R | `diff-check-intento1.log` |
| Integridad | 877 cotejados: solo 7 documentos/manuales autorizados distintos, ninguna fuente funcional | `integridad-checkpoint-estatico.json` |

Salida pegada de controles globales:

```text
Checked 565 files in 549ms. No fixes applied.
Found 1 error.
Found 6 warnings.
audit: low 1, moderate 10, high 3, critical 0
[secretos] sin hallazgos
Tasks builds: 7 successful, 7 total; Cached: 4 cached, 7 total
```

Rojos exactos conservados: formato de `ContextosySkills/hooks/contexto.mjs`; cinco
`noUndeclaredEnvVars` en el mismo archivo (CONTEXTO_CARPETA, CLAUDE_PROJECT_DIR,
CONTEXTO_VENTANA_TOKENS); `noDescendingSpecificity` en
`docs/dominio/infografia-plataformas-riesgo.html:128:3`.
High de auditoría: `source-map-js` GHSA-68fv-2mgg-jv7q,
`sharp` GHSA-wq5f-xc86-pv6w, `next` GHSA-cjq9-62q9-8jv4.
No se arreglaron ni se instalaron dependencias.

## Límites de verificación

G1–G5 y sus preflights reales ya están ejecutados exclusivamente contra `curichi_e2e` existente.
No se certifican imágenes habituales, Caddy/túnel ni lectura auditiva con lector real.
El escáner local conserva las exclusiones y límites del script original (archivos >2 MiB,
ciertos binarios/rutas y líneas >500 caracteres); no sustituye el escaneo histórico de CI.

Antecedentes M5 a comparar, **no ejecución actual**: Biome 1 error / 6 warnings;
audit 3 high / 10 moderate / 1 low, 0 critical. Las 12 omisiones PG/S3 de API no son PASS.
Los tests PG reales actuales crean nombres `curichi_cuota_*`/similares y conectan una base de
administración: no se ejecutarán sin una adaptación aislada compatible con las restricciones.

## E2E — G1–G5 ejecutados, Baches inactiva

Arnés temporal propio preparado tras leer el antecedente M5 y revisar sus riesgos.
Revisión técnica del principal incorporada antes de conectar (no fue una respuesta adicional del humano): también se limpian del proceso padre
`PG*` (incluido PGOPTIONS/PGSERVICE), `*DATABASE*`, `*POSTGRES*` y claves de roles antes
de cargar `pg`, no solo del entorno hijo de servicios. Las pruebas de validateAll son puras;
no son un spy de preflight. Por inspección, el gate de las tres URLs precede a require/Client.
No se ejecutó `correr-local.mjs` porque migra/siembra. Tres URLs se validan en conjunto
antes de construir cualquier cliente; config `webServer: []`, setup general conservado,
workers 1, retries 0, Chromium físico LocalCache solo en child env.
Se ejecutó producción local aislada, copia de fotos sintéticas dentro del scratch y mantenimiento
aplazado solo en el child env para evitar borrados incidentales. Sin cambiar catálogo,
migraciones, seeds, imágenes habituales, proxy ni túneles.

| Grupo | Estado a este checkpoint |
|---|---|
| G1 | **47/47 PASS**, intento 1, 0 omitidas/fallos/flaky/retries; navegador 52,434 s, arnés 71,875 s. RAM 3695/3685 MiB. Catálogo final intacto, puertos libres y next-env sin cambios |
| G2 | **31/31 PASS**, intento 1, escritorio/móvil; 0 omitidas/fallos/flaky/retries. Navegador 277,399 s / arnés 291,905 s; RAM 4028/3258 MiB. Catálogo intacto, puertos libres y next-env sin cambios |
| G3 | **58 PASS + 1 omitida**, intento 1, 0 fallos/flaky/retries. Navegador 329,277 s / arnés 344,052 s; RAM 4106/3354 MiB. Catálogo intacto, puertos libres y next-env sin cambios |
| G4 | **43/43 PASS**, intento 1; 0 omitidas/fallos/flaky/retries. Navegador 133,403 s / arnés 147,909 s; RAM 4280/3546 MiB. Catálogo intacto, puertos libres y next-env sin cambios |
| G5 | **18/18 PASS**, intento 1; 0 omitidas/fallos/flaky/retries. Navegador 88,619 s / arnés 102,794 s; RAM 4246/3691 MiB. Catálogo intacto, puertos libres y next-env sin cambios |

## Intentos y coordinación

G5 incluye accesibilidad, responsive y csp en chromium. Salida final:

```text
expected:18 skipped:0 unexpected:0 flaky:0
AISLAMIENTO e2e-G5-intento1-despues: ok=true; identidades=3
EJECUTADO_PASS; 102.794s; puertos libres=true; next-env intactos=true
```

Log/JSON/run propios `fb/e2e-G5-intento1-*` conservados íntegros. La configuración mantiene
producción local, `channel: chromium`, cámara simulada, setup general, un worker y retry 0.
Cada grupo cierra sus procesos antes de comenzar el siguiente y vuelve a leer el catálogo.
Estos tests no certifican lectura auditiva real ni las imágenes habituales Docker/Caddy.

Comparación de casos por archivo + nombre completo + proyecto con el `--list` inicial:
**198 descubiertos, 198 casos únicos conservados, ninguno perdido ni agregado**;
**197 PASS / 1 skipped / 0 unexpected / 0 flaky**, sin reintentos E2E.
Nombres y resultados consolidados: `fb/resumen-e2e.json`. Los datos sintéticos creados por
la API (cuentas/reportes/fotos) permanecen; no se afirma restauración idéntica de toda la base.

G4 incluye recorrido-completo, panel-tecnico, panel-al-dia, panel-ejecutivo,
panel-indicadores-tortas, panel-mapa-reactivo y quitar-campos-panel en chromium. Salida final:

```text
expected:43 skipped:0 unexpected:0 flaky:0
43 passed (2.2m)
AISLAMIENTO e2e-G4-intento1-despues: ok=true; identidades=3
EJECUTADO_PASS; 147.909s; puertos libres=true; next-env intactos=true
```

Log/JSON/run propios `fb/e2e-G4-intento1-*` conservados íntegros; ninguna expectativa modificada.

G3 incluye formulario-reporte, formulario-sumidero-y-fotos, ubicacion-obligatoria,
ubicacion-aproximada, camara-foto, resiliencia-interfaz y quitar-campos-web; móvil limitado
por la config original. Salida final:

```text
expected:58 skipped:1 unexpected:0 flaky:0
1 skipped
58 passed (5.5m)
AISLAMIENTO e2e-G3-intento1-despues: ok=true; identidades=3
EJECUTADO_PASS; 344.052s; puertos libres=true; next-env intactos=true
```

Omitida: `[movil] ubicacion-obligatoria.spec.ts:422:7 > api-core vuelve a comprobar la
ubicación > un POST directo con el punto a 80 m da 422 y no gasta el cupo; a 60 m entra`.
Anotación original: «Sin navegador: basta con correrlo una vez.» No se cuenta como PASS.
Log/JSON/run propios `fb/e2e-G3-intento1-*` conservados íntegros.

G2 incluye mapa-publico, mapa-seleccion, trafico-publico, datos-reales y navegacion;
chromium y el proyecto móvil limitado por la config original. Salida final:

```text
expected:31 skipped:0 unexpected:0 flaky:0
AISLAMIENTO e2e-G2-intento1-despues: ok=true; identidades=3
EJECUTADO_PASS; 291.905s; puertos libres=true; next-env intactos=true
```

Log y nombres/resultados: `fb/e2e-G2-intento1-playwright.log`, `e2e-G2-intento1-result.json`
y `e2e-G2-intento1-run.json`. Ninguna expectativa modificada.

G1 salida final pegada (`e2e-G1-intento1-playwright.log`, resultado JSON y run.json):

```text
expected:47 skipped:0 unexpected:0 flaky:0
AISLAMIENTO e2e-G1-intento1-despues: ok=true; identidades=3
EJECUTADO_PASS; 71.875s; puertos libres=true; next-env intactos=true
```

G1 incluye api-contratos, separacion-publica-tecnica, cuenta-ciudadana, acceso-panel y
publicacion-diferida en chromium. Se conservaron todos los nombres y resultados en
`fb/e2e-G1-intento1-result.json`; setup general ejecutado, ningún retry ni expectativa modificada.

- Lectura CIM dentro del sandbox: falló por acceso al recurso; lectura segura escalada:
  3260 MiB, procesos inventariados, sin intervención sobre ellos.
- Preparación inicial del envoltorio de controles: falló antes de ejecutar pruebas por
  selección de argumento del propio arnés; corregida solo en scratch y repetida con éxito.
- Tipos intento 1 y contracts/DB intento 1 completos. DB finalizó normalmente, sin interrupción:

```text
Test Files  28 passed (28)
Tests       294 passed (294)
Start at    17:45:46
Duration    407.28s (tests 389.25s)
```

- Consulta **solo lectura** del plan de caché de tests: 2 builds HIT y 7 suites MISS para
  las opciones consultadas. No se lanzó ese grafo para evitar workers no acotados;
  las suites se ejecutan individualmente con `--maxWorkers=1`. No se atribuye un PASS a un MISS.
- API intento 1 quedó interrumpido por el corte de turno. El usuario ordenó continuar y
  el principal autorizó explícitamente API intento 2 desde cero. No se repiten contracts,
  DB ni tipos ya completos. Todo el intento 1 se conserva, sin atribuirle resultado.
- API intento 2 terminó normalmente:

```text
Test Files  33 passed | 2 skipped (35)
Tests       436 passed | 12 skipped (448)
Start at    23:13:20
Duration    244.29s (tests 199.48s)
```

Las doce omisiones (diez PostgreSQL real y dos S3) se conservan como **no verificadas**;
sus nombres completos están en el log y JSON del intento 2. No se construyó una conexión PG
real desde esas pruebas: las variables de destino/S3 se retiraron del entorno hijo.

Nombres exactos de las doce omisiones; todos con estado `skipped`, no PASS:

```text
almacen-s3.test.ts > ida y vuelta contra un S3 real > guarda, lee y borra un objeto
almacen-s3.test.ts > ida y vuelta contra un S3 real > la comprobación de arranque pasa con credenciales buenas y falla con malas
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > 50 envíos simultáneos con claves DISTINTAS dejan exactamente 3
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > 50 envíos simultáneos con la MISMA clave dejan uno, por idempotencia y no por cuota
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > 50 envíos simultáneos SIN clave tampoco se cuelan
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > dos cuentas a la vez consiguen su cupo cada una, no una sola
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > dos categorías a la vez: cada una tiene su cupo y no se roban turnos
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > dos envíos simultáneos de una cuenta se publican a 60 y a 240 s
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > altas simultáneas desde una misma IP > 30 altas a la vez dejan exactamente 10 (tope diario)
cuota-concurrencia-pg.test.ts > cuota por cuenta bajo concurrencia real (PostgreSQL) > altas simultáneas desde una misma IP > 20 altas a la vez dejan exactamente las del tope por hora
fotos-cuota-concurrencia-pg.test.ts > cuota de fotos por cuenta bajo concurrencia real (PostgreSQL) > 20 subidas simultáneas de una cuenta dejan exactamente 12
fotos-cuota-concurrencia-pg.test.ts > cuota de fotos por cuenta bajo concurrencia real (PostgreSQL) > dos cuentas a la vez no se estorban: el bloqueo es por fila de cuenta y día
```

- Un timeout/intermitencia no se calificará como regresión sin repetición limpia autorizada,
  serial y con ambos intentos conservados, conforme al checkpoint del usuario.
- No hubo timeouts ni intermitencias E2E en los cinco grupos. API intento 1 fue interrumpido
  por el corte; su repetición autorizada desde cero terminó bien. Biome intento 1 no arrancó
  por ENOENT del envoltorio; intento 2 reprodujo el rojo conocido. Ambos incidentes se conservan.

## Cierre independiente y entrega

Control final `fb/cierre.json`, medido **2026-10-19 03:39:51 UTC**
(2026-10-18 23:39:51 America/La_Paz):

```text
RAM libre: 4436 MiB; pesados ajenos: 0
Secretos final: exit 0, sin hallazgos
git diff --check final: exit 0
SHA256: 877 comparados; 7 documentos/manuales autorizados distintos; 0 deltas inesperados
Procesos del proyecto/ms-playwright restantes: []
Docker antes/después: iguales, MinIO y PostGIS running healthy
Puertos 3000/3001/3002/3100 libres al cerrar cada grupo
```

Pasada suplementaria del escáner, sin editar el script seguido: incluye también las
**325 líneas >500 caracteres** que el control habitual omite. `secretos-ampliados-intento1`
terminó **exit 0, sin hallazgos**, 0,455 s; guarda 4482 MiB y cero pesados ajenos.
Cobertura: 858 archivos seleccionados y leídos, 0 >2 MiB, 0 ilegibles; permanecen las
exenciones por tipo/ruta del escáner original. El resultado no certifica todo el historial Git.
Inventarios, hallazgos redactados vacíos y cobertura: `secretos-inventario-final.json`,
`secretos-hallazgos-final.json`, `secretos-cobertura-final.json`,
`secretos-inventario-ampliado.json`, `secretos-hallazgos-ampliados.json`.
Revisión final de nuevos: 7 archivos / 8 coincidencias de texto documental sobre controles,
sin valores secretos (`nuevos-candidatos-finales-redactados.json`).

Conservados todos los intentos, cachés, logs, resultados y datos sintéticos. Sin cambios de
fuentes/config/tests seguidos; solo este documento como escritura seguida autorizada del
verificador, más su scratch y las salidas ignoradas normales de los comandos de build/test.
No hubo commit/push, instalaciones/descargas de binarios, variables persistentes, conexión
a las bases habituales, migración/seed de curichi_e2e, recreación Docker ni borrado de cachés/logs.

Esta FB habilita la comparación posterior contra el plan aprobado; no implementa Baches,
no verifica dos definiciones reales, no activa categorías ni autoriza producción o publicaciones.
Se mantienen explícitas las 12 omisiones API PG/S3, la omisión E2E móvil y los rojos globales
conocidos, además de lector auditivo e imágenes habituales no comprobados.

**Entregado al principal: FB completa y turno pesado LIBERADO explícitamente.**
El verificador no inicia programación ni delega otro ejecutor pesado.
