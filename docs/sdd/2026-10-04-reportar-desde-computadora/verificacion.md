# Verificación — reportar desde una computadora (F4a)

- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `api`, `ui` (más `geo` e `infra`, que se corren para que la lista sea idéntica a la línea base) · **Alcance:** `--filter=...contracts --filter=...db --filter=...api-core --filter=...geo-service --filter=...panel-admin --filter=...web-ciudadano` (7 paquetes en turbo, con `geodata-etl` como dependiente de `contracts`)
- **Ejecutado el:** 2026-10-04 ~20:20–20:49 (America/La_Paz) · **Por:** `sdd-verificador` (modo verificación) · **HEAD:** `9ef77296935b50db87c4265bd676f5942ec899a1` · **Foto:** `refs/sdd/reportar-desde-computadora` = `9ef7729` (= HEAD; los cambios de la corrida viven en el árbol de trabajo, sin commitear)
- **Condiciones:** RAM libre **4900 MB al empezar** (turno registró entre ~4049 y ~5845 MB en cada lanzamiento), umbral 1500 MB · procesos pesados ajenos **0** (el conteo crudo dio 4 por autocoincidencia del propio `powershell … -match 'vitest|…'` y sus shells, igual que en la línea base) · `next dev` local **no** (3000/3001/3002/3100 libres) · túneles `cloudflared` **0** · `--concurrency=1`
- **Pila Docker:** daemon **encendido** (docker 29.8.0), pero los **9 contenedores `exited`** (`postgis`, `minio`, `minio-init`, `api-core`, `geo-service`, `migraciones`, `panel-admin`, `proxy`, `web-ciudadano`); nada escuchando en 5432/9000/9001. **La pila está detenida con permiso del usuario; NO se arrancó.** Por eso #16, #22 y #23 quedan «no verificado: pila detenida».
- **Convención de ejecución:** cada comando pesado envuelto en `bash "$SCRATCH/turno.sh" <comando>`, `timeout: 600000`. `docker compose config` solo aporta su código de salida (su salida imprime el `.env` con secretos). `PNPM` = `npx -y pnpm@12.4.1`.
- **Diff de la corrida:** `tr '\n' '\0' < docs/sdd/2026-10-04-reportar-desde-computadora/archivos.txt | xargs -0 git diff refs/sdd/reportar-desde-computadora --` + los 9 archivos nuevos (no rastreados) de la lista · **Alcance y opciones iguales a la línea base:** **sí**, con dos diferencias anotadas:
  1. **#12 (privacidad, api-core)** suma `test/ubicacion-aproximada.test.ts` a los 5 archivos de la línea base (6 en total). Lo pide la matriz, que la corrida actualizó. **Son pruebas nuevas, sin línea base** (van como `nuevo de F2 → tiene que estar verde`).
  2. Se agregan los comandos **#39–#41** (e2e sin pila: `tsc --noEmit`, `playwright test --list`, `biome check e2e`), que la matriz pide ahora al tocar `e2e/` (base + infra). No estaban numerados en la lista heredada de 38; se corren igual y se anotan como `sin línea base`.
- **Árbol intacto:** los builds no dejaron cambios rastreados nuevos. `openapi.yaml` sha antes = después de regenerar (`11e07f89c51744b4` en #7 y #8). La única copia a `$SCRATCH` fue `openapi.antes.yaml` (fuera del repo).

## Resumen

| # | Comando | Bandera | Código | Veredicto |
|---|---|---|---|---|
| 1 | `PNPM lint` | base | 0 | verde (484 arch · 1 warning preexistente) |
| 2 | `PNPM exec turbo run typecheck SCOPE` | base | 0 | verde (9/9, 0 cache) |
| 3 | `PNPM exec turbo run test SCOPE --concurrency=1` | base | 0 | verde (9/9 · 1928 pasan · 11 skip) |
| 4 | `PNPM exec turbo run build SCOPE --concurrency=1` | base | 0 | verde (7/7) |
| 5 | `PNPM secretos` | base | 0 | verde (sin hallazgos) |
| 6 | grep secretos en no-rastreados | base | 0 | verde (1 coincidencia benigna en `linea-base.md`) |
| 7 | `PNPM --filter contracts --filter db build` | contrato | 0 | verde |
| 8 | OpenAPI idempotente (`cmp`) | contrato | 0 | verde (sha estable) |
| 9 | `git diff --name-only … CHANGELOG.md` | contrato | 0 | verde (CHANGELOG aparece) |
| 10 | `PNPM exec turbo run typecheck test --filter=...contracts` | contrato | 0 | verde (cache 16/16) |
| 11 | ventana E2E: G1 | contrato | — | no verificado: ventana E2E no autorizada |
| 12 | `PNPM --filter api-core exec vitest run` (privacidad, **6 archivos**) | privacidad | 0 | verde (6/90) |
| 13 | `PNPM --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 | verde (1/4) |
| 14 | ventana E2E: G1 + `ubicacion-obligatoria` + `ubicacion-aproximada` | privacidad | — | no verificado: ventana E2E no autorizada |
| 15 | `PNPM --filter api-core exec vitest run` (seguridad, 9 archivos) | seguridad | 0 | verde (9/152) |
| 16 | `PNPM --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — | no verificado: pila detenida (minio exited) |
| 17 | `PNPM audit --audit-level high` | seguridad | 0 | verde (6 moderate) |
| 18 | ventana E2E: G1 + `csp` + `camara-foto` | seguridad | — | no verificado: ventana E2E no autorizada |
| 19 | `PNPM --filter db test` | datos | 0 | verde (25/260, sin timeout) |
| 20 | `git diff --diff-filter=MDR … migraciones` | datos | 0 | verde (vacío) |
| 21 | migración nueva (`git ls-files -o … migraciones`) | datos | 0 | verde (`0019` + su test; número > 0018) |
| 22 | PG-real: `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg` | datos | — | no verificado: pila detenida (postgis exited) |
| 23 | privilegios en base efímera | datos | — | no verificado: pila detenida (postgis exited) |
| 24 | escrituras SQL a `reporte_inundacion` | datos | 0 | verde (solo `packages/db` + `api-core/src/rutas`) |
| 25 | `PNPM exec turbo run test --filter=...geo-service` | geo | 0 | verde (cache 3/3) |
| 26 | `PNPM --filter geodata-etl test` | geo | 1 → 0 (reintento) | **intermitente** (entorno: `pnpm` no pudo escribir su task-run-state en A:, os error 21; 21/21 pasan en ambas corridas) |
| 27 | `PNPM --filter db exec vitest run` (puntos-críticos, 3 archivos) | geo | 0 | verde (3/20) |
| 28 | ventana E2E: `datos-reales` | geo | — | no verificado: ventana E2E no autorizada |
| 29 | `PNPM exec turbo run test --filter=...api-core` | api | 0 | verde (cache 3/3) |
| 30 | ventana E2E: G1 | api | — | no verificado: ventana E2E no autorizada |
| 31 | en vivo: `curl -sk -i https://localhost/api/v1/<ruta>` | api | — | no verificado: en vivo pendiente de permiso |
| 32 | `PNPM exec turbo run test --filter=web-ciudadano` | ui | 0 | verde (cache 2/2) |
| 33 | `PNPM exec turbo run test --filter=panel-admin` | ui | 0 | verde (cache 2/2) |
| 34 | ventana E2E: pantallas tocadas + G5 | ui | — | no verificado: ventana E2E no autorizada |
| 35 | en vivo: imagen reconstruida + humo + navegador | ui | — | no verificado: en vivo pendiente de permiso |
| 36 | `docker compose … config --quiet` | infra | 0 | verde (solo código de salida) |
| 37 | ningún servicio salvo `proxy` publica fuera de loopback | infra | 0 | verde (sin salida) |
| 38 | variable de entorno → `.env.example` / `turbo.json` | infra | 0 | verde (la corrida no tocó infra/env; nada nuevo que cablear) |
| 39 | `PNPM --filter e2e exec tsc --noEmit -p .` | base (e2e) | 0 | verde (sin errores TS) |
| 40 | `PNPM --filter e2e exec playwright test --list` | base (e2e) | 0 | verde (198 tests/27 files; `ubicacion-aproximada.spec.ts` listada) |
| 41 | `PNPM exec biome check e2e` | infra (e2e) | 0 | verde (33 files; sin rutas de usuario; literales de contraseña = creds dev documentadas preexistentes) |

Recuento: **29 verdes** · **1 intermitente** (#26, IMPORTANTE) · **0 rojos** · **11 no verificados** · **0 regresiones**.

> **Actualizado en F4b (ver § «En vivo (F4b)» al final).** Con la pila levantada y autorizada, de los 11 «no verificados» se resolvieron: **#16, #22, #23 → verde**; **#31/#35 (en vivo)** → humo por el proxy, cabeceras, `/reportes` público sin campos técnicos, los dos rechazos del camino nuevo (`422 UBICACION_PRECISA_DISPONIBLE` y `422 PRECISION_INSUFICIENTE`, sin gastar cupo) y `/ready` sin `degradado` **verde**. Siguen no verificados los de **ventana E2E** (#11,14,18,28,30,34) y la **interfaz en el navegador** (la prueba del usuario desde su laptop; el navegador integrado no acepta la CA interna de Caddy). **La 0019 se aplicó sin recrear `postgis`** (`start` + `run --rm --no-deps`), corrigiendo la desviación de la corrida anterior.

## Comparación con la línea base (`linea-base.md` → `docs/sdd/2026-10-04-arreglos-chicos/verificacion.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 1 | lint | verde · 477 arch · 1 warning | verde · 484 arch · 1 warning | — | — | igual (mismo warning preexistente en `docs/dominio/infografia-plataformas-riesgo.html:128`) |
| 2 | typecheck SCOPE | verde (9/9) | verde (9/9, 0 cache, 24 s) | — | — | igual |
| 3 | test SCOPE | verde · **1841** pasan · 11 skip | verde · **1928** pasan · 11 skip | — | — | **mejora** (+87 tests nuevos, todos verde; 11 skip = los 2 `*-concurrencia-pg`) |
| 4 | build | verde (7/7) | verde (7/7) | — | — | igual |
| 5 | secretos | verde | verde | — | — | igual |
| 6 | grep no-rastreados | exit 0 · 3 coincidencias benignas | exit 0 · 1 coincidencia benigna (`linea-base.md`, palabra «secretos») | — | — | igual (sin credenciales) |
| 7 | contracts+db build | verde | verde | — | — | igual |
| 8 | OpenAPI idempotente | verde (cmp 0) | verde (cmp 0; sha `11e07f89c51744b4` antes=después) | — | — | igual |
| 9 | diff CHANGELOG | CHANGELOG aparece | CHANGELOG aparece | — | — | esperado en F4 (la corrida tocó contracts) |
| 10 | typecheck+test contracts | verde (cache 16/16) | verde (cache 16/16, FULL TURBO) | — | — | igual |
| 12 | api-core privacidad | verde · 5 arch · 76 | verde · **6 arch · 90** | — | — | **mejora** + `nuevo de F2`: `ubicacion-aproximada.test.ts` (sin línea base) suma 14 tests, todos verde; los 5 archivos previos siguen verde |
| 13 | contracts jitter | verde · 4 | verde · 4 | — | — | igual |
| 15 | api-core seguridad | verde · 9 arch · 152 | verde · 9 arch · 152 | — | — | igual |
| 17 | audit | verde · 6 moderate | verde · 6 moderate | — | — | igual |
| 19 | db test | verde · 24 arch · 251 (intermitente en la línea base) | verde · **25 arch · 260**, sin timeout | — | — | **mejora** (+1 archivo `migracion-0019-*`, +9 tests; esta vez sin el timeout de hook) |
| 20 | migraciones MDR | vacío | vacío | — | — | igual (ninguna migración existente cambió) |
| 21 | migración nueva | `0018` | `0019_ubicacion_aproximada.sql` + su test | — | — | esperado en F4 (C-2.1) |
| 24 | escrituras reporte_inundacion | solo `packages/db/src` + `api-core/src/rutas` | ídem (+`api-core/src/rutas/moderacion.ts`, ya existente; `.ignored_db` = copias de db en node_modules) | — | — | igual (invariante «api-core es el único escritor» intacto) |
| 25 | geo-service test | verde · 61 | verde · 61 (cache de #3) | — | — | igual |
| 26 | geodata-etl | verde · 21 | **21/21 pasan; exit 1 por error de escritura de `pnpm` en A: (os error 21); reintento exit 0, 21/21** | — | — | **intermitente** (entorno; no es fallo de test) |
| 27 | db puntos-críticos | verde · 20 | verde · 20 | — | — | igual |
| 29 | api-core turbo test | verde (cache 3/3) | verde (cache 3/3, FULL TURBO) | — | — | igual |
| 32 | web-ciudadano test | verde (cache 2/2) | verde (cache 2/2, FULL TURBO) | — | — | igual |
| 33 | panel-admin test | verde (cache 2/2) | verde (cache 2/2, FULL TURBO) | — | — | igual |
| 36 | compose config | verde (exit 0) | verde (exit 0) | — | — | igual |
| 37 | puertos fuera de loopback | verde (exit 0) | verde (exit 0) | — | — | igual |
| 38 | variable de entorno | verde (`POSTGRES_SHM_SIZE`) | verde (la corrida no agregó var; `.env.example`/`turbo.json`/compose/infra sin cambios vs la foto) | — | — | igual (invariante; nada nuevo que cablear) |
| 11,14,18,28,30,34 | ventana E2E | no verificado | no verificado (E2E no autorizada) | — | — | sin cambio de estado |
| 16 | almacen-s3 | no verificado (minio) / verde en F4b | no verificado (minio exited, pila detenida) | — | — | sin cambio en F4a |
| 22,23 | PG real / privilegios | no verificado / verde en F4b | no verificado (postgis exited, pila detenida) | — | — | sin cambio en F4a |
| 31,35 | en vivo | no verificado / parcial en F4b | no verificado (en vivo pendiente) | — | — | sin cambio en F4a |
| 39,40,41 | e2e sin pila (tsc, list, biome) | — (no estaban en la lista heredada) | verde | — | — | `sin línea base` (comandos nuevos de la matriz; verdes) |

### Totales por paquete (antes → después)

| Paquete | Línea base | Ahora | Δ |
|---|---|---|---|
| contracts | 227 | 237 | +10 |
| panel-admin | 432 | 458 | +26 |
| db | 251 | 260 | +9 |
| web-ciudadano | 458 | 486 | +28 |
| api-core | 391 (+11 skip) | 405 (+11 skip) | +14 |
| geo-service | 61 | 61 | = |
| geodata-etl | 21 | 21 | = |
| **Total** | **1841** (+11 skip) | **1928** (+11 skip) | **+87** |

**REGRESIONES: ninguna.** **Rojos nuevos: ninguno.** **Verdes perdidos: ninguno.** Único no-verde: #26, `intermitente` (IMPORTANTE) — error de entorno de `pnpm` al escribir su archivo de estado en el disco A: (os error 21); los 21 tests de `geodata-etl` pasaron en las dos corridas, el reintento salió exit 0. No hay fallo de aserción ni de código.

## Salida por comando (evidencia)

### 1. `PNPM lint`
```
Checked 484 files in 676ms. No fixes applied.
Found 1 warning.
```
Único warning: `lint/style/noDescendingSpecificity` en `docs\dominio\infografia-plataformas-riesgo.html:128:3` (archivo sin tocar, fuera de las carpetas designadas). 0 errores, exit 0.

### 2. `PNPM exec turbo run typecheck SCOPE`
```
 Tasks:    9 successful, 9 total
Cached:    0 cached, 9 total
  Time:    24.095s
```
Sin `error TS`. Re-ejecutó todo.

### 3. `PNPM exec turbo run test SCOPE --concurrency=1`
```
 Tasks:    9 successful, 9 total
Cached:    2 cached, 9 total
  Time:    6m47.023s
```
Por paquete: contracts 17/237 · panel-admin 40/458 · web-ciudadano 34/486 · db 25/260 · geodata-etl 3/21 · api-core 32+2skip/405+11skip · geo-service 5/61 → **1928 passed / 11 skipped / 0 failed**. (11 skip = `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg`, exigen PG real.)

### 4. `PNPM exec turbo run build SCOPE --concurrency=1`
```
panel-admin:build: ✓ Compiled successfully in 51s
web-ciudadano:build: ✓ Compiled successfully in 23.7s
 Tasks:    7 successful, 7 total
Cached:    2 cached, 7 total
  Time:    3m8.923s
```
Puertos 3000/3100 libres antes del build (sin `next dev`).

### 5, 6. secretos / grep no-rastreados
```
[secretos] sin hallazgos                                   (#5 exit 0)
#6 exit 0 · 1 línea: docs/sdd/2026-10-04-reportar-desde-computadora/linea-base.md:41 (prosa que cita la palabra «secretos»)
```
Sin valores de credenciales. Benigno.

### 7, 8, 9, 10. contrato
```
#7 contracts+db build exit 0 · "openapi/openapi.yaml y dist/dominio.json generados"
#8 cmp exit 0 · sha openapi antes=después=11e07f89c51744b4
#9 git diff CHANGELOG → packages/contracts/CHANGELOG.md (aparece), exit 0
#10 typecheck test ...contracts : 16 successful / 16 cached >>> FULL TURBO (502ms)
```

### 12, 13, 15, 27. vitest directos
```
#12 api-core privacidad (6 arch, +ubicacion-aproximada) : Test Files 6 passed (6) · Tests 90 passed (90)
#13 contracts jitter                                    : Test Files 1 passed (1) · Tests 4 passed (4)
#15 api-core seguridad (9 arch)                         : Test Files 9 passed (9) · Tests 152 passed (152)
#27 db puntos-críticos (3 arch)                         : Test Files 3 passed (3) · Tests 20 passed (20)
```

### 17. `PNPM audit --audit-level high`
```
6 vulnerabilities found
Severity: 6 moderate          (exit 0, bajo umbral high)
```

### 19. `PNPM --filter db test`
```
 Test Files  25 passed (25)
      Tests  260 passed (260)
   Duration  116.51s
```
exit 0, sin timeout de hook (a diferencia de la línea base, donde `migracion-0015` venció un `beforeAll` por contención). +1 archivo `migracion-0019-ubicacion-aproximada.test.ts`.

### 20, 21, 24. inspecciones de datos
```
#20 diff MDR migraciones            : vacío (ninguna migración existente cambiada)
#21 migración nueva                 : packages/db/migraciones/0019_ubicacion_aproximada.sql (+ test/migracion-0019-ubicacion-aproximada.test.ts); nros en disco …0017,0018,0019
#24 escrituras reporte_inundacion   : packages/db/src/* (seeds, puntos-criticos, mantenimiento, geometria-publica, test-utils) + services/api-core/src/rutas/{reportes,moderacion}.ts; los node_modules/.ignored_db son copias del paquete db; geo-service/src NO escribe
```

### 25, 29, 32, 33. turbo subsets (cache hit)
```
#25 test ...geo-service : 3 successful / 3 cached >>> FULL TURBO
#29 test ...api-core    : 3 successful / 3 cached >>> FULL TURBO
#32 test web-ciudadano  : 2 successful / 2 cached >>> FULL TURBO
#33 test panel-admin    : 2 successful / 2 cached >>> FULL TURBO
```

### 26. `PNPM --filter geodata-etl test` — intermitente
Primer intento (exit 1):
```
 Test Files  3 passed (3)
      Tests  21 passed (21)
   Duration  45.48s
Error:   × writing A:\MICURICHI\MICURICHI\node_modules\.pnpm-task-run-state-v1\…jsonl
  ╰─▶ El dispositivo no está listo. (os error 21)
```
Los 21 tests pasaron; el exit 1 proviene de `pnpm` al escribir su archivo de bookkeeping en el disco A: (os error 21), no de un test. Reintento (regla 4, entorno), exit 0:
```
 Test Files  3 passed (3)
      Tests  21 passed (21)
   Duration  56.92s
```
Clasificación: **intermitente** (entorno). No es regresión ni rojo de código.

### 36, 37, 38. infra
```
#36 docker compose --profile servicios --profile minio config --quiet : exit 0 (solo código)
#37 puertos fuera de loopback : exit 0, sin salida (todo en 127.0.0.1 salvo proxy)
#38 .env.example / turbo.json / docker-compose.yml / infra/ sin cambios vs la foto → la corrida no agregó ninguna variable; nada que cablear
```

### 39, 40, 41. e2e sin pila (comandos nuevos de la matriz)
```
#39 e2e tsc --noEmit -p .          : exit 0, sin errores TS
#40 e2e playwright test --list     : exit 0, "Total: 198 tests in 27 files"; ubicacion-aproximada.spec.ts LISTADA (C-6.1)
#41 biome check e2e                : exit 0, "Checked 33 files … No fixes applied"
```
`e2e/scripts/correr-local.mjs`: sin rutas absolutas de usuario. Contiene el bloque `SEED_PASSWORDS` con contraseñas de desarrollo literales (`admin`/`tecnico`/`vecina`/`ejecutivo`), **preexistente** (0 líneas de ese bloque en el diff de la corrida) y declarado no-secreto en el propio archivo (ya versionado en `ayudas.ts` y `packages/db/README.md`, válido solo en la base de prueba); el escaneo de secretos del proyecto (#5) pasa limpio. Se señala al auditor como conducta conocida, no como hallazgo de esta corrida.

## No verificado

| # | Comando | Motivo |
|---|---|---|
| 11, 14, 18, 28, 30, 34 | ventanas E2E (G1, G5, `ubicacion-obligatoria`, `ubicacion-aproximada`, `csp`, `camara-foto`, `datos-reales`, pantallas tocadas) | ventana E2E **no autorizada** en esta puerta. La spec nueva `ubicacion-aproximada.spec.ts` queda listada por #40 y se corre en el CI |
| 16 | `test/almacen-s3.test.ts` | contenedor `minio` **exited**; exige `curichi-minio` healthy + `S3_SECRET_KEY`; la pila está detenida y no se arranca |
| 22 | `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg` | `postgis` **exited**: base no disponible; no se arranca ni recrea |
| 23 | privilegios en base efímera | `postgis` **exited**: `docker compose exec … createdb` imposible sin arrancar el contenedor; la regla prohíbe arrancar/recrear `postgis` |
| 31, 35 | en vivo (`curl` por el proxy; imagen reconstruida; navegador) | «en vivo» **pendiente de permiso** (se pide al final, como en la corrida anterior) |

## Ventana E2E
No autorizada en esta puerta. No se tocó `pila-antes.txt` / `pila-despues.txt`.

## En vivo (F4b)

- **Ejecutado el:** 2026-10-04 ~21:45–22:15 (America/La_Paz) · **Por:** `sdd-verificador` (modo en vivo) · **HEAD:** `9ef7729` · **Foto:** `refs/sdd/reportar-desde-computadora`
- **Permisos de la puerta 1:** actualizar y levantar la pila **con respaldo de la base** → sí; **migrar `curichi` (0019) tras `pg_dump`** → sí; **túnel** → no; **ventana E2E** → no. (Copiados en `linea-base.md` § Decisiones.)
- **Condiciones:** RAM libre entre ~1081 MB (justo tras un `builder prune`) y ~3879 MB; umbral 1500 MB. El guardrail `turno.sh` arrancó cada lanzamiento pesado con ≥1500 MB libres (builds de a uno, `docker builder prune -f` entre cada uno; ningún build se quedó sin memoria). Procesos pesados ajenos: 0 (el crudo da 4 por la autocoincidencia del propio `powershell … -match`). Túneles `cloudflared`: 0.
- **`start` arrastró toda la pila:** `docker compose … start postgis minio proxy` levantó también api-core, geo-service, web-ciudadano y panel-admin (dependencias de `proxy`). Para dar aire a los builds, **detuve las 4 apps** (`docker compose stop api-core geo-service web-ciudadano panel-admin`) y las reconstruí/levanté después; `postgis`, `minio` y `proxy` quedaron arriba todo el tiempo.
- **`postgis` NO se recreó** (corrige la desviación de `arreglos-chicos`): `start` no recrea y la migración se corrió con `run --rm --no-deps`. `postgis` quedó `Up` desde el `start` (01:48Z), con `ShmSize=268435456` (256 MiB) ya aplicado desde la corrida anterior. El `pg_dump` se tomó igual, antes de migrar.
- **Imágenes guardadas antes (rollback):** `mi-curichi-{api-core,geo-service,web-ciudadano,panel-admin}:antes-reportar-desde-computadora` (IDs `59d04a81fcaf`, `019548b262e8`, `d565a8e03c48`, `ac892aa74676`). No se tocó `proxy` (su contexto no cambió).

### Respaldo y migración

- **`pg_dump` (antes de migrar):** `$SCRATCH/curichi-antes-reportar-desde-computadora.dump`, **19 267 716 bytes** (~18,4 MB), cabecera `PGDMP` válida, exit 0. Fuera del repo (tiene datos personales).
- **Migración (`run --rm --no-deps migraciones`, imagen api-core nueva):** exit 0. Aplicó **`0019_ubicacion_aproximada.sql`** (`"aplicadas":["0019_ubicacion_aproximada.sql"],"omitidas":18,"pendientes":[]`).
- **Enum en `curichi` (solo lectura):** `SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) … typname='ubicacion_metodo'` → **`gps,manual,aproximada`**. `_migraciones` encabeza con `0019_ubicacion_aproximada.sql`.

### Reconstrucción y reemplazo

Builds de a uno, `docker compose --profile servicios build <svc>`, todos **verde (rc=0)**; los dos Next con «✓ Compiled successfully» (web 14,4 s, panel 16,2 s). IDs `:local` nuevos (≠ rollback): api-core `6383040fd134`, geo-service `0c7008e88ea2`, web-ciudadano `a2e1a1c24da8`, panel-admin `0ff604b48da1`. Reemplazo con `up -d --no-deps --wait api-core geo-service web-ciudadano panel-admin`: **no tocó** postgis/minio/proxy; los 4 contenedores corren las imágenes nuevas (ID del contenedor = ID de `:local`); los 7 servicios `healthy`.

### Humo por el proxy (como lo usa el usuario)

| Comprobación | Resultado |
|---|---|
| `GET https://localhost/` | **200** |
| `GET https://localhost/api/v1/configuracion` | **200**, `{"ciudad":{"nombre":"Santa Cruz de la Sierra",…}}` |
| `GET https://panel.localhost/login` (`--resolve …:443:127.0.0.1`) | **200** |
| CSP | `script-src 'self' 'nonce-…' 'strict-dynamic'` (con nonce, **sin `unsafe-inline`** en script-src; `style-src` lo conserva, como documenta §13) |
| `X-Content-Type-Options` | `nosniff` presente |
| `x-middleware-*` | **ausentes** |
| `Permissions-Policy` | `geolocation=(self), camera=(self), microphone=(), payment=(), usb=()` |
| `/ready` de api-core (puerto efímero) | `{"ok":true,"db":"ok","geo":"ok","fotos":"ok","degradado":false}` (sin `degradado`); `/health` 200 |

### Comprobaciones del auditor y del camino nuevo (sin crear datos en `curichi`)

- **(a) vista pública sin campos técnicos — VERDE.** `GET https://localhost/api/v1/reportes` → `FeatureCollection` con **35** features; **0 ocurrencias** de `ubicacion_metodo`, `precision_gps_m` y `distancia_dispositivo_m` (ni `autor_id` ni `ip_hash`). Propiedades expuestas: `id, creado_en, evento_en, distrito, unidad_vecinal, descripcion, fotos, profundidad_estimada, frecuencia, causa_presunta, severidad, severidad_calculada, estado, verificado, punto_critico_id, n_reportes_punto, precision_degradada`.
- **(b) rechazos del camino nuevo, sin gastar cupo — VERDE.** Sesión de la cuenta de desarrollo `vecina` por `POST /api/v1/auth/login` (http 200; cookie `curichi_sesion` en el jar de `$SCRATCH`, **nunca en el repo**, borrado al final).
  - `POST /reportes` con `ubicacion_aproximada: true` y `dispositivo.precision_m: 30` → **`422 UBICACION_PRECISA_DISPONIBLE`** (`detalles: {precision_m:30, maximo_m:50}`).
  - el mismo cuerpo sin la marca y con `precision_m: 178` → **`422 PRECISION_INSUFICIENTE`** (`detalles: {precision_m:178, maximo_m:50}`).
  - `GET /auth/yo` **antes = 2** y **después = 2** `reportes_restantes_hoy` (no se gastó cupo). `POST /auth/logout` → 204.
  - `curichi` intacta tras la prueba: **41 reportes, 442 usuarios, 576 uv** (sin altas). Ningún reporte ni cuenta creados.

### Pruebas que en F4a quedaron sin verificar (ahora con la pila arriba)

| # | Comando | F4a | Ahora |
|---|---|---|---|
| 22 | `DATABASE_URL_PG_REAL=…/postgres … vitest cuota-concurrencia-pg + fotos-cuota-concurrencia-pg` | no verificado (postgis detenido) | **verde** · 2 archivos · **9 tests** · 39,8 s · rc0. Crea y borra su base efímera (`curichi_cuota_<ts>`); **no toca `curichi`** |
| 23 | privilegios en base efímera `curichi_sdd_reportar_computadora` | no verificado (postgis detenido) | **verde** · `createdb` → `db:migrate` (**19 aplicadas, incl. 0019**) → `db:migrate` otra vez («ninguna, al día», 19 omitidas) → `privilegios` **«privilegios correctos: curichi_api y curichi_geo…»** → `dropdb`. Base efímera borrada; `curichi` intacta. Confirma **D7**: en base nueva `privilegios` pasa |
| 16 | `vitest test/almacen-s3.test.ts` | no verificado (minio detenido) | **verde** · 1 archivo · **11 tests** · 0 omitidos (MinIO `/health/live` 200; ida y vuelta real contra el bucket) |

### Interfaz en el navegador — NO VERIFICADO (la prueba el usuario)

El navegador integrado no acepta la CA interna de Caddy (`PROXY_TLS=interno`) y confiar en ella exigiría instalarla en Windows, **prohibido** (§13). La prueba de la laptop del usuario —con «Precisión actual: 178 m» aparece «Reportar con ubicación aproximada», el punto a mano, el reporte enviado y la insignia «Aproximada» en el panel— queda para el usuario. Las conductas están cubiertas por pruebas unitarias verdes (F4a) y por la E2E (no autorizada, listada en #40).

### Estado final de la pila (paso 11) — LEVANTADA y SANA

```
minio          running healthy  ghcr.io/coollabsio/minio:RELEASE.2025-10-15…
postgis        running healthy  postgis/postgis:18-3.6        (ShmSize 256 MiB; NO recreado)
api-core       running healthy  mi-curichi-api-core:local      (6383040fd134)
geo-service    running healthy  mi-curichi-geo-service:local   (0c7008e88ea2)
web-ciudadano  running healthy  mi-curichi-web-ciudadano:local (a2e1a1c24da8)
panel-admin    running healthy  mi-curichi-panel-admin:local   (0ff604b48da1)
proxy          running healthy  mi-curichi-proxy:local
```

**No hubo ningún rojo en vivo → no se revirtió ninguna imagen.** La pila quedó levantada con las imágenes nuevas. RAM libre final ~2391 MB; 0 túneles.

## Túnel
No autorizado en la puerta 1 (y `compartir` no está entre las banderas). No se abrió ninguno; `cloudflared` = 0 al empezar y al terminar.
