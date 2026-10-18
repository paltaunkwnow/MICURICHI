# Verificación — Núcleo consciente de la categoría (M3a, lecturas por categoría)

- **Banderas:** `base`, `contrato`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia`, `api` · **Alcance:** `--filter=...contracts` (apps incluidas), `--concurrency=1` (también en `typecheck`)
- **Ejecutado el:** 2026-10-09 -0400 · **Por:** `sdd-verificador` (modo verificación, F4a)
- **Foto:** `refs/sdd/nucleo-por-categoria` = `31eb538` · **HEAD:** `3121a0f` · **Rama:** `feat/api-core/nucleo-por-categoria`
- **Condiciones:** RAM libre al inicio **6138 MB** (el usuario cerró programas; ~6,3 GB) · procesos pesados ajenos **0** (el contador dio 4: 3 `bash.exe` de esta sesión + el `powershell.exe` de la consulta; `Get-CimInstance` confirmó 0 `vitest`/`playwright`/`next`/`tsc` reales ajenos) · pila Docker **sí** (`postgis` y `minio` healthy; perfil `servicios` abajo; puertos 3000-3002/3100 libres) · `next dev` local **no** · túneles `cloudflared` **0** · `--concurrency=1`
- **Diff de la corrida:** 39 archivos trackeados modificados (`git diff --stat refs/sdd/nucleo-por-categoria`: +1708/-186) más los nuevos sin seguimiento de `archivos.txt` (`contrato-0-20.test.ts`, `0021_*.sql` + reversa, `migracion-0021-*.test.ts`, `puntos-criticos-categoria.test.ts`, `categorias.ts` en api-core y geo-service, `no-contaminacion-categoria.test.ts` ×2). CHANGELOG (+80) y `openapi/openapi.yaml` (+465) presentes en el diff. · **Alcance y opciones iguales a la línea base:** **sí**
- **Diff de la corrida (archivo):** `C:/Users/HP/AppData/Local/Temp/claude/C--Users-HP-Desktop-MICURICHI/af832a62-dcd5-4e3f-a51c-ad3a2116e307/scratchpad/corrida-m3a.diff`

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `pnpm lint` (`biome check .`) | base | 1 | **rojo** (preexistente; ajenos) |
| 2 | `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` | base | 0 | verde |
| 3 | `pnpm exec turbo run test --filter=...contracts --concurrency=1` | base | 0 | verde |
| 4 | `pnpm exec turbo run build --filter=...contracts --concurrency=1` | base | 0 | verde |
| 5 | `pnpm secretos` | base | 0 | verde |
| 6 | grep secretos en archivos sin seguimiento | base | 0 | verde (revisa el auditor) |
| 8 | `pnpm --filter contracts --filter db build` | contrato | 0 | verde |
| 9 | `cp openapi antes; --filter contracts build; cmp` | contrato | 0 | verde |
| 10 | `git diff --name-only refs/sdd/… -- CHANGELOG.md` | contrato | 0 | verde (sale, como debe) |
| 11 | `pnpm exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | 0 | verde |
| 13 | `pnpm --filter db test` | datos | 0 | verde |
| 14 | `git diff migraciones existentes` | datos | 0 | verde (vacío) |
| 15 | migración nueva de la corrida | datos | 0 | verde (0021 con su prueba) |
| 16 | PostgreSQL real (`cuota`/`fotos-cuota`-concurrencia-pg) | datos/concurrencia | 0 | verde |
| 17 | base efímera `curichi_sdd_nucleo_m3a_v` (createdb·migrate×2·privilegios·dropdb) | datos | 0 | verde |
| 19 | `pnpm exec turbo run test --filter=...geo-service --concurrency=1` | geo | 0 | verde |
| 20 | `pnpm --filter geodata-etl test` | geo | 0 | verde |
| 21 | `pnpm --filter db exec vitest run puntos-criticos-{entorno,volumen,metrica}` | geo | 0 | verde |
| 24 | `pnpm --filter api-core exec vitest run` (privacidad, 6 archivos) | privacidad | 0 | verde |
| 25 | `pnpm --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 | verde |
| 27 | `pnpm --filter api-core exec vitest run` (seguridad, 9 archivos) | seguridad | 0 | verde |
| 28 | `pnpm --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | 0 | verde |
| 29 | `pnpm audit --audit-level high` | seguridad | 1 | **rojo** (preexistente; 3 high de apps/services) |
| 31 | `pnpm --filter api-core exec vitest run idempotencia/pool/cupo-diario` | concurrencia | 0 | verde |
| 34 | `pnpm exec turbo run test --filter=...api-core --concurrency=1` | api | 0 | verde |

Filas por diseño sin ejecutar: #7 (e2e no se toca), #18 (informativo), #23 (`banco-consultas`, opcional), #32 (= #16), #33 (`banco-concurrencia`, no pasa con el contrato actual), #36 (en vivo, no aplica). Ventana E2E: ver su sección.

## Regresiones (lo primero)

**1 verde→rojo**, en la **suite E2E** (fuera de las carpetas de la corrida):

- `e2e/tests/api-contratos.spec.ts:252` › «GET /api/v1/configuracion publica la ciudad del despliegue, válida y cacheable» (test **sin navegador**). En la línea base pasó (api-contratos 14/14); ahora **falla** con:
  ```
  expect(Object.keys(cuerpo)).toEqual(['ciudad']);   // recibido: ['ciudad', 'categorias_activas']
  ```
  **Causa:** el cambio **intencional** de M3a — `/configuracion` suma la clave de primer nivel `categorias_activas` (plan CA3; `ConfiguracionPublicaSchema`). El test de `e2e/` hace un `toEqual(['ciudad'])` estricto y está **desactualizado**; `e2e/` **no** es carpeta de M3a (es M4/M5, «Fuera de M3» del plan), por eso la corrida no lo actualizó. Las apps toleran la clave nueva (sus pruebas pasan: web 34/486, panel 40/458). **No es un defecto del código de M3a**, pero es un verde→rojo: lo paso al revisor/principal para decidir si se actualiza el test de e2e ahora o se confirma la forma del contrato. No es `spawn UNKNOWN`.

Las demás diferencias E2E son `browserType.launch: spawn UNKNOWN` (Chromium no arranca en esta máquina), **no** regresiones de código: ver la sección «Ventana E2E».

## Comparación con la línea base (`linea-base.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 1 | lint | rojo: 1 err + 6 warn (ajenos) | rojo: 1 err + 6 warn (ajenos, idénticos) | — | — | **igual** (rojo preexistente ajeno) |
| 2 | typecheck `...contracts` | verde (cache hit, 9/9) | verde (9/9; api-core y geo-service reales, pasan) | — | — | **igual** |
| 3 | test `...contracts` | verde (cache hit; pre-M3: api-core 32/405, contracts 18/265, db 26/284, geo 5/61) | verde (real; contracts 19/289, web 34/486, panel 40/458, db 28/294, geodata 3/21, api-core 33+2om/422+11om, geo 6/71) | — | — | **igual** + nuevos de F2 (verdes) |
| 4 | build `...contracts` | verde (apps `next build` cache hit) | verde (apps `next build` reales, compilan; 7/7) | — | — | **igual** |
| 5 | secretos | verde | verde (sin hallazgos) | — | — | **igual** |
| 6 | grep secretos sin seguimiento | verde (164; 1 ajena = col `password_hash` en M2) | verde (168; misma ajena M2; +4 en prosa de la corrida) | — | — | **igual** |
| 8 | `--filter contracts --filter db build` | verde | verde | — | — | **igual** |
| 9 | cmp determinismo OpenAPI | idéntico | idéntico (cmp exit 0) | — | — | **igual** (determinista; el cambio de contrato va en el diff vs foto, +465) |
| 10 | git diff CHANGELOG | vacío (en FB la corrida no lo había tocado) | sale `CHANGELOG.md` | — | — | **cambio esperado de contrato** (en F4 **debe** salir) |
| 11 | typecheck+test `...contracts` | verde (cache hit 16/16) | verde (cache hit 16/16, FULL TURBO) | — | — | **igual** |
| 13 | `--filter db test` | verde (26/284) | verde (28/294) | — | — | **igual** + nuevos de F2 (verdes) |
| 14 | git diff migraciones existentes | vacío | vacío | — | — | **igual** (ninguna cambió) |
| 15 | migración nueva | ninguna propia de M3a (no había 0021) | **0021** + reversa, con prueba | — | — | nuevo de F2 (correcto) |
| 16 | PostgreSQL real (cuota/fotos-cuota) | verde (2/9) | verde (2/9) | — | — | **igual** |
| 17 | base efímera (createdb·migrate×2·privilegios·dropdb) | verde (0001-0020) | verde (0001-**0021**) | — | — | **igual** (ahora llega a 0021) |
| 19 | test `...geo-service` | verde (cache hit) | verde (cache hit) | — | — | **igual** |
| 20 | `--filter geodata-etl test` | verde (3/21) | verde (3/21) | — | — | **igual** |
| 21 | `--filter db` puntos-criticos {entorno,volumen,metrica} | verde (3/20) | verde (3/20) | — | — | **igual** |
| 24 | `--filter api-core` privacidad (6 archivos) | verde (6/90) | verde (6/94) | — | — | **igual** + nuevos de F2 |
| 25 | `--filter contracts` jitter | verde (1/4) | verde (1/4) | — | — | **igual** |
| 27 | `--filter api-core` seguridad (9 archivos) | verde (9/152) | verde (9/152) | — | — | **igual** |
| 28 | `--filter api-core` almacen-s3 | verde (1/11) | verde (1/11) | — | — | **igual** |
| 29 | `pnpm audit --audit-level high` | rojo (3 high) | rojo (3 high, mismas) | — | — | **igual** (rojo preexistente ajeno) |
| 31 | `--filter api-core` idempotencia/pool/cupo-diario | verde (3/27) | verde (3/27) | — | — | **igual** |
| 34 | test `...api-core` | verde (cache hit) | verde (cache hit) | — | — | **igual** |
| E2E | `api-contratos.spec.ts:252` (configuracion) | verde (14/14) | rojo | `api-contratos.spec.ts:252 › …configuracion…` | — | **REGRESIÓN** (E2E; cambio de contrato intencional `categorias_activas`, test de e2e desactualizado — fuera del alcance de M3a) |
| E2E | `separacion-publica-tecnica` | verde (7/7) | verde (7/7) | — | — | **igual** |
| E2E | specs de navegador (G1 resto, ubicacion-*, csp, camara-foto, datos-reales) | no verif: memoria | no verif: entorno (`spawn UNKNOWN`) | — | — | no verificado (entorno, no memoria) |

## Salida por comando

### 1. `pnpm lint` (`biome check .`) — exit 1, 5 s

Idéntico a la línea base. 501 archivos (494 en FB; +7 por los nuevos de la corrida, sin diagnósticos nuevos). «Found 1 error. Found 6 warnings.» Todos en archivos **ajenos** a la corrida:

```
ContextosySkills\hooks\contexto.mjs                     format            → el 1 error
ContextosySkills\hooks\contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3  lint/style/noDescendingSpecificity
```

Ningún diagnóstico en `packages/contracts`, `packages/db`, `services/api-core`, `services/geo-service`.

### 2. `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` — exit 0, 11 s

9/9 tareas. Cache hit: web-ciudadano, panel-admin, db, geodata-etl. Cache miss real (código cambiado, pasan): `geo-service`, `api-core`. `contracts:build` regeneró openapi/dominio.json. Apps typecheck en verde (campos nuevos opcionales, regla 5).

### 3. `pnpm exec turbo run test --filter=...contracts --concurrency=1` — exit 0, 262 s

Todas las suites reejecutadas (cache miss por el cambio de `contracts`). Todo verde:

```
contracts:test        Test Files  19 passed (19)   Tests  289 passed (289)
web-ciudadano:test    Test Files  34 passed (34)   Tests  486 passed (486)
panel-admin:test      Test Files  40 passed (40)   Tests  458 passed (458)
db:test               Test Files  28 passed (28)   Tests  294 passed (294)
geodata-etl:test      Test Files   3 passed  (3)   Tests   21 passed  (21)
api-core:test         Test Files  33 passed | 2 skipped (35)   Tests 422 passed | 11 skipped (433)
geo-service:test      Test Files   6 passed  (6)   Tests   71 passed  (71)
Tasks: 9 successful, 9 total
```

Conteos exactos a lo esperado por los implementadores. Apps iguales a la línea base. `DeprecationWarning` de `pg` (api-core) no es fallo.

### 4. `pnpm exec turbo run build --filter=...contracts --concurrency=1` — exit 0, 57 s

7/7. `contracts:build` y `db:build` cache hit; `panel-admin` y `web-ciudadano` `next build` reales → «✓ Compiled successfully» + static pages OK; `api-core`, `geo-service`, `geodata-etl` `tsc` reales. Sin warnings nuevos. (En FB los `next build` fueron cache hit; aquí reales por el cambio de `contracts`, mismo resultado.)

### 5. `pnpm secretos` — exit 0, 5 s

`node scripts/buscar-secretos.mjs --todos` → «[secretos] sin hallazgos».

### 6. grep secretos en archivos sin seguimiento — exit 0

168 coincidencias (164 en FB). Única en carpeta designada: `packages/db/test/migracion-0020-base-multicategoria.test.ts` (**ajeno M2**, `password_hash` = nombre de columna, ya en FB). Los nuevos de código/test de la corrida: **ninguna** coincidencia. Los +4 vs FB son prosa de la carpeta de la corrida (`SEED_*_PASSWORD`). Ningún valor real.

### 8. `pnpm --filter contracts --filter db build` — exit 0, 9 s

`contracts: openapi/openapi.yaml y dist/dominio.json generados` + `tsc -p tsconfig.build.json` (db). Verde.

### 9. cmp determinismo OpenAPI — exit 0 (cmp), 7 s

`cp openapi.yaml antes → --filter contracts build → cmp antes vs ahora` → **cmp exit 0 (idéntico)**. Regenerar el OpenAPI dos veces da el mismo archivo: **determinista**, sin deriva del árbol. El cambio del OpenAPI (a propósito, 0.20.0) está en el `git diff` contra la foto (+465 líneas), no en la regeneración.

### 10. `git diff --name-only refs/sdd/nucleo-por-categoria -- packages/contracts/CHANGELOG.md` — exit 0

Salida: `packages/contracts/CHANGELOG.md`. En F4 **debe** salir (la corrida tocó `contracts`): verde.

### 11. `pnpm exec turbo run typecheck test --filter=...contracts --concurrency=1` — exit 0, 5 s

16/16, **FULL TURBO** (16 cached). Cubre todos los consumidores (apps incluidas). `openapi.yaml` figura «M» vs HEAD = el cambio intencional de la corrida (0.20.0); el cmp #9 confirmó que no introduje deriva.

### 13. `pnpm --filter db test` — exit 0, 116 s

`Test Files 28 passed (28) · Tests 294 passed (294)`. Sin caída de workers (RAM 8751 MB). +2 files/+10 tests vs FB (`migracion-0021-indice-categoria-creado`, `puntos-criticos-categoria`).

### 14. `git diff --name-only --diff-filter=MDR refs/sdd/… -- packages/db/migraciones` — exit 0

Vacío: ninguna migración existente cambió.

### 15. Migración nueva de la corrida — exit 0

Sin seguimiento en `packages/db/migraciones`: `0020_*` + reversa (**ajeno M2**) y `0021_indice_categoria_creado.sql` + reversa (**corrida M3a**). En disco: 0001-**0021**; la 0021 es la de mayor número. Su prueba existe: `packages/db/test/migracion-0021-indice-categoria-creado.test.ts`.

### 16. PostgreSQL real — exit 0, 13 s

`cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg`: `Test Files 2 passed (2) · Tests 9 passed (9)`. Crean y borran su base efímera; `curichi` **no** se toca.

### 17. Base efímera `curichi_sdd_nucleo_m3a_v` — exit 0

`createdb` OK → `db:migrate` #1 aplicó **0001-0021** (21, omitidas 0) → #2 «ninguna (al día)», omitidas 21 → `privilegios`: «privilegios correctos: curichi_api y curichi_geo tienen exactamente lo documentado en las migraciones 0008, 0009, 0014, 0016 y 0020» → `dropdb` OK. Al cierre quedan `curichi`, `curichi_e2e`, `curichi_revision`; sin `curichi_sdd_*`.

### 19. `pnpm exec turbo run test --filter=...geo-service --concurrency=1` — exit 0, 3 s

3/3 **FULL TURBO** (cache hit). `geo-service 6 passed (6) · Tests 71 passed (71)` (FB replayaba 5/61; ahora 6/71 por la nueva `no-contaminacion-categoria`).

### 20. `pnpm --filter geodata-etl test` — exit 0, 24 s

`Test Files 3 passed (3) · Tests 21 passed (21)`.

### 21. `pnpm --filter db exec vitest run puntos-criticos-{entorno,volumen,metrica}` — exit 0, 17 s

`Test Files 3 passed (3) · Tests 20 passed (20)`.

### 24. `pnpm --filter api-core exec vitest run` (privacidad, 6 archivos) — exit 0, 23 s

`privacidad-ubicacion · vista-publica-vs-tecnica · publicacion-diferida · exportacion · ubicacion-dispositivo · ubicacion-aproximada` → `Test Files 6 passed (6) · Tests 94 passed (94)`. **`exportacion` pasó sin timeout** (intermitente conocido no ocurrió). +4 vs FB (dimensión categoría en `publicacion-diferida`).

### 25. `pnpm --filter contracts exec vitest run test/jitter.test.ts` — exit 0, 3 s

`Test Files 1 passed (1) · Tests 4 passed (4)`.

### 27. `pnpm --filter api-core exec vitest run` (seguridad, 9 archivos) — exit 0, 24 s

`seguridad · autenticacion · fotos · fotos-abuso · cuentas-y-cuota · cupo-diario · fotos-cuota · fotos-webp · guarda-disco` → `Test Files 9 passed (9) · Tests 152 passed (152)`.

### 28. `pnpm --filter api-core exec vitest run test/almacen-s3.test.ts` — exit 0, 3 s

Con 7 variables `S3_*` del `.env` exportadas (valores no impresos) y `S3_ENDPOINT=http://127.0.0.1:9000`: `Test Files 1 passed (1) · Tests 11 passed (11)`. Incluye la ida y vuelta real contra `curichi-minio` healthy.

### 29. `pnpm audit --audit-level high` — exit 1, 6 s

`14 vulnerabilities found` (**1 low · 10 moderate · 3 high**). Las 3 **high** que hacen fallar el umbral, idénticas a FB (deps de apps/services; `pnpm audit` escanea todo el lockfile):

```
high  source-map-js  — event-loop DoS
high  sharp          — librsvg CVE-2026-96889
high  next           — SSRF en Image Optimization
```

### 31. `pnpm --filter api-core exec vitest run idempotencia/pool-conexiones/cupo-diario` — exit 0, 19 s

`Test Files 3 passed (3) · Tests 27 passed (27)`.

### 34. `pnpm exec turbo run test --filter=...api-core --concurrency=1` — exit 0, 3 s

3/3 **FULL TURBO** (cache hit). `api-core Test Files 33 passed | 2 skipped (35) · Tests 422 passed | 11 skipped (433)` (FB replayaba 32/405; ahora 33/422 por la nueva `no-contaminacion-categoria`).

## No verificado

| Comando | Motivo |
|---|---|
| E2E: tests **de navegador** de G1 (`acceso-panel`, `cuenta-ciudadana` y las partes de `publicacion-diferida` que abren página), `ubicacion-obligatoria`, `ubicacion-aproximada`, `csp`, `camara-foto`, `datos-reales` | **`browserType.launch: spawn UNKNOWN`**: Chromium no arranca en esta máquina. **No es memoria** (persiste con 5950-7027 MB libres y los 4 servicios arriba, muy por encima de los 2500 exigidos): es un fallo de entorno de Windows al lanzar `chrome.exe` (CreateProcess). En la línea base se atribuyó a falta de memoria; con memoria holgada se confirma que es **entorno**, no código. |
| #36 en vivo (`curl` antes/después por `https://localhost`) | **no aplica**: reconstruir la pila corre el job de migraciones sobre `curichi` (hoy 0009), que no se toca. El plan y la puerta 1 lo dejan fuera. |
| #23 `banco-consultas.mjs` · #33 `banco-concurrencia.mjs` | por diseño de la matriz/línea base (opcional / no pasa con el contrato actual). |

## Ventana E2E (autorizada)

- **Preparación:** `curichi_e2e` ya existía (línea base). La **migré de 0020 a 0021** con el migrador del repo (aplicó `0021_indice_categoria_creado.sql`, omitió 20) y corrí `privilegios` contra ella: **correctos**. Capas reales y seed (4 usuarios) ya cargados en la línea base.
- **Servicios:** levantados en segundo plano contra `curichi_e2e` con el entorno de `playwright.config.ts` (demoras 2/4 s, cupo 3, límites altos, `COOKIE_SEGURA=0`): api-core 3001, geo-service 3002, web 3000 (`next dev --webpack`), panel 3100 (`next dev --webpack`). `curl 127.0.0.1:3001/ready` → `{"ok":true,"db":"ok","geo":"ok","fotos":"ok","degradado":false}`; web/panel/geo 200. **RAM con los 4 servicios arriba: 5950-7027 MB** (el usuario liberó memoria; ≥ 2500 en todo momento).
- `pila-antes.txt` / `pila-despues.txt`: **iguales** (`minio running healthy` · `postgis running healthy`).
- **Grupos corridos** (`--project=chromium`, de a uno):

| Grupo / bandera | Spec | Línea base | Ahora | Veredicto |
|---|---|---|---|---|
| G1 (contrato/api) | `api-contratos` | 14 passed | 13 passed (request) · **1 REGRESIÓN** (`:252` configuracion) | **REGRESIÓN** (ver arriba) |
| G1 | `separacion-publica-tecnica` | 7 passed | 7 passed (request) | **verde** (igual) |
| G1 | `cuenta-ciudadana` | no verif: memoria | 1 `spawn UNKNOWN`, resto sin correr | **no verificado: entorno (Chromium)** |
| G1 | `acceso-panel` | no verif: memoria | 7 `spawn UNKNOWN` | **no verificado: entorno (Chromium)** |
| G1 | `publicacion-diferida` | no verif: memoria | 1 passed (request, `:193`) · 1 `spawn UNKNOWN` · 4 sin correr | **parcial:** request verde; navegador **no verificado: entorno** |
| privacidad | `ubicacion-obligatoria` | no verif: memoria | 1 passed (request) · 9 `spawn UNKNOWN` | **parcial:** request verde; navegador **no verificado: entorno** |
| privacidad | `ubicacion-aproximada` | no verif: memoria | 1 passed (request) · 2 `spawn UNKNOWN` | **parcial:** request verde; navegador **no verificado: entorno** |
| seguridad | `csp` | no verif: memoria | 0 passed · 5 `spawn UNKNOWN` | **no verificado: entorno (Chromium)** |
| seguridad | `camara-foto` | no verif: memoria | 0 passed · 2 `spawn UNKNOWN` | **no verificado: entorno (Chromium)** |
| geo/datos | `datos-reales` | no verif: memoria | 0 passed · 2 `spawn UNKNOWN` | **no verificado: entorno (Chromium)** |

- **G1 total:** 22 passed, 10 failed (= 1 regresión real + 9 `spawn UNKNOWN`). Los tests por `request` (sin navegador) corrieron y pasaron salvo la regresión de `api-contratos`; los que abren página fallan todos con `spawn UNKNOWN`. Ningún otro `toEqual`/aserción real en los demás grupos (solo `spawn UNKNOWN`).
- **Hallazgo de entorno:** con memoria holgada (hasta 7027 MB libres y 4 servicios arriba), Chromium sigue sin lanzar (`spawn UNKNOWN`). La causa que la línea base atribuyó a la memoria **no era la memoria**; es un problema de esta máquina para lanzar el navegador. No es rojo del código.
- **Cierre (hecho):** PID de los 4 servicios terminados (`taskkill //T //F` + `Stop-Process` de huérfanos); **puertos 3000-3002/3100 libres**; 0 procesos `tsx/next/playwright/chrome` de la corrida; `next-env.d.ts` de las dos apps **restaurados** a HEAD; `e2e/test-results` y `e2e/playwright-report` **borrados**; `pila-despues.txt` **igual** a `pila-antes.txt`; `curichi_e2e` queda (en 0021), `curichi` **intacta en 0009**, `curichi_revision` intacta, sin `curichi_sdd_*`; `cloudflared` 0. `git diff refs/sdd/nucleo-por-categoria` = 39 archivos trackeados, **todos** en las carpetas designadas (ninguna deriva fuera).

## En vivo (`api`)

**No aplica.** Reconstruir la pila corre el job de migraciones sobre `curichi` (hoy 0009); el plan y la puerta 1 lo dejan fuera. No se tocó la pila (solo `postgis`/`minio` healthy). Queda **no verificado: requeriría migrar la base del usuario**.

---

## Vuelta 1 (reverificación tras corregir la regresión)

- **Ejecutado el:** 2026-10-09 -0400 · **Condiciones:** RAM libre 8086 MB al inicio; 5903 MB con los 4 servicios arriba (≥ 2500); procesos pesados ajenos 0 (3 `bash.exe` de sesión + el `powershell` de la consulta); pila `postgis`/`minio` healthy; `next dev` local no (fuera de la ventana); túneles 0.
- **Autorizado por el usuario:** corregir el test de E2E `e2e/tests/api-contratos.spec.ts:252` (sumado a `archivos.txt`). Desde la pasada anterior **solo** cambió ese archivo (`git status --short` → `M e2e/tests/api-contratos.spec.ts`; nada más). La corrección: `expect(Object.keys(cuerpo).sort()).toEqual(['categorias_activas', 'ciudad'])` y comprueba que `categorias_activas` es un arreglo de slugs válidos (lista literal `['inundacion','bache','area_verde','basura']`), no vacíos, que incluye `inundacion` y sin duplicados.

### Regresiones

**Ninguna.** La regresión de la pasada anterior (`api-contratos.spec.ts:252`, `/configuracion`) quedó **resuelta**: el test ahora pasa (`ok … GET /api/v1/configuracion … válida y cacheable` 186 ms).

### Recuento

| Comando | Código de salida | Resultado | Veredicto |
|---|---|---|---|
| `pnpm --filter e2e exec tsc --noEmit -p .` | 0 | sin errores | **verde** |
| `pnpm --filter e2e exec playwright test --list` | 0 | `Total: 198 tests in 27 files` | **verde** |
| `pnpm exec biome check e2e` | 0 | `Checked 33 files … No fixes applied.` | **verde** |
| E2E (ventana) `api-contratos.spec.ts` `--project=chromium` | 0 | **14/14 passed** (incluida `/configuracion`) | **verde** (era 13/14 con 1 regresión) |
| E2E (ventana) `separacion-publica-tecnica.spec.ts` `--project=chromium` | 0 | **7/7 passed** | **verde** (igual) |

Total E2E Vuelta 1: **21 passed, 0 failed** (exit 0). Las dos specs son **sin navegador** (`request`); las de navegador no se corrieron en esta vuelta por indicación del coordinador.

### No verificado (sin cambios respecto de la pasada anterior)

- Specs de **navegador** (G1 resto, `ubicacion-obligatoria`, `ubicacion-aproximada`, `csp`, `camara-foto`, `datos-reales`): **no verificado — Chromium no arranca (`browserType.launch: spawn UNKNOWN`), problema del entorno** (persiste con memoria holgada). El usuario decidió investigarlo aparte; **no se reintentaron**.

### Cierre de la ventana (hecho)

- `curichi_e2e` ya estaba en **0021** (migrada en F4a); no se volvió a migrar.
- 4 servicios terminados (`taskkill //T //F` + `Stop-Process`); **puertos 3000-3002/3100 libres**; 0 procesos `tsx/next/playwright/chrome` de la corrida; `next-env.d.ts` de las dos apps **restaurados**; `e2e/test-results` y `e2e/playwright-report` **borrados**.
- `pila-despues.txt` **igual** a `pila-antes.txt` (`minio`/`postgis` running healthy). `cloudflared` 0.
- Bases: `curichi` **intacta en 0009**, `curichi_revision` intacta, `curichi_e2e` queda en 0021, sin `curichi_sdd_*`.
- `git diff refs/sdd/nucleo-por-categoria` = **40** archivos trackeados; el único fuera de las carpetas de M3a es `e2e/tests/api-contratos.spec.ts` (la corrección autorizada). La pila quedó **sana e igual**.


---

## Nota del 2026-10-09: causa real de que Chromium no arrancara

Este documento atribuyó el `browserType.launch: spawn UNKNOWN` de las E2E de navegador a la falta de memoria, y después a un problema genérico del entorno. **La causa real es otra.** La diagnosticó una sesión aparte, a pedido del usuario:

- **Qué pasa:** la app de escritorio de Claude **virtualiza `%LOCALAPPDATA%`** para los procesos que lanza Claude Code.
- **Dónde quedó Chromium:** el Chromium 1243 de Playwright, instalado el 14/9 desde Claude, está físicamente en `%LOCALAPPDATA%\Packages\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`. Para el resto de Windows no existe en la ruta normal.
- **Por qué falla:** `chrome.exe` necesita su manifiesto lateral (`153.0.8010.12.manifest`). Windows (el resolvedor SxS de csrss) lo busca en la ruta real, no lo encuentra y devuelve el **error 14001**, que Node muestra como `spawn UNKNOWN`.
- **Por qué solo fallan las de navegador:** el *headless shell* no depende de ese manifiesto, pero `playwright.config.ts` usa `channel: 'chromium'`. Por eso las pruebas que solo usan `request` sí pasaban.
- **Qué quedó descartado:** la memoria (falla igual con 8 GB libres), el antivirus, los permisos y que el archivo estuviera corrupto.
- **Cómo se resolvió (decisión del usuario del 2026-10-09):** en las verificaciones, el verificador fija `PLAYWRIGHT_BROWSERS_PATH` a esa ruta física **solo en sus comandos E2E**. No hay ningún cambio persistente. El arreglo permanente, copiar los navegadores fuera de `AppData` y definir la variable del usuario, queda a decisión del usuario.

Las filas E2E de navegador de esta corrida siguen siendo «no verificado» con el motivo corregido: **Chromium no arrancaba por la virtualización de AppData**, no por el código ni por la memoria. Se corren en la verificación de M3b, sobre un árbol que incluye M3a.

