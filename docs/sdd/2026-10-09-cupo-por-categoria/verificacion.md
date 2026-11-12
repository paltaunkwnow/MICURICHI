# Verificación — Escrituras y cupo por categoría (M3b)

- **Banderas:** `base`, `contrato` (consume 0.20.0 + cambio aditivo `reglas`), `datos`, `privacidad`, `seguridad`, `concurrencia`, `api`, `geo` · **Alcance:** `--filter=...contracts` (apps incluidas), `--concurrency=1` (también en `typecheck`)
- **Ejecutado el:** 2026-10-10 -0400 · **Por:** `sdd-verificador` (modo verificación, F4a) · **continuación tras corte de sesión**: filas 1–11 medidas el 2026-10-10 (1.ª pasada); filas 2, 3, 4 y 11 **reejecutadas (vuelta 1)** porque la vuelta 1 tocó `services/api-core/` (`src/rutas/reportes.ts` tope `detalle`→400, `test/cupo-diario.test.ts` +6, `README.md`; `src/categorias.ts` declarado en `archivos.txt`); filas 13+ y ventana E2E medidas ahora
- **Condiciones (continuación):** RAM libre al reanudar **7924 MB** · procesos pesados ajenos **0** (`Get-CimInstance` filtrando por `node`/`vitest`: 0 reales; las coincidencias del contador crudo son autorreferencia = 3 `bash.exe` de esta sesión + el `powershell` de la consulta) · pila Docker **sí** (`postgis` y `minio` healthy; perfil `servicios` abajo) · `next dev` local **no** (3000-3002/3100 libres) · túneles `cloudflared` **0** · hay un Chrome del usuario abierto (no se toca)
- **Foto:** `refs/sdd/cupo-por-categoria` = `d68fe6a` · **HEAD:** `3121a0f` · **Rama:** `feat/api-core/cupo-por-categoria`
- **Condiciones:** RAM libre al inicio **8773 MB** · procesos pesados ajenos **0** (el contador de la matriz dio 4 por autorreferencia = el `powershell` de la consulta más `bash.exe` de esta sesión cuya línea de comando contiene el patrón; `Get-CimInstance` confirmó 0 `vitest`/`playwright`/`next`/`tsc` reales ajenos; solo hay `msedgewebview2.exe` de la app de Claude) · pila Docker **sí** (`postgis` y `minio` healthy; perfil `servicios` abajo: `api-core`/`geo-service` exited, sin proxy ni apps) · `next dev` local **no** (puertos 3000-3002/3100 libres) · túneles `cloudflared` **0** · `--concurrency=1`
- **Diff de la corrida:** 23 archivos trackeados vs la foto (`git diff --stat refs/sdd/cupo-por-categoria`: +844/-222) — `CLAUDE.md`, `packages/contracts/CHANGELOG.md`, `packages/db/src/mantenimiento.ts` (solo comentarios), `services/api-core/README.md` y 19 de `services/api-core/{src,test}` — más **4 archivos sin seguimiento de `contracts`** cambiados por el ajuste aditivo `reglas` (sha256 en disco = «actual» del diff): `src/categorias/tipos.ts`, `src/categorias/inundacion/definicion.ts`, `test/contrato-0-19.test.ts`, `test/contrato-0-20.test.ts`. Todo dentro del alcance autorizado (CLAUDE.md §2/§7/§13 autorizadas; cambio aditivo de `contracts` autorizado el 2026-10-09).
- **Diff de la corrida (archivo):** `C:/Users/HP/AppData/Local/Temp/claude/C--Users-HP-Desktop-MICURICHI/463cd1be-c3fc-4b7b-9f27-ae232024503b/scratchpad/corrida-m3b.diff`
- **Alcance y opciones iguales a la línea base:** **no — explicado.** `linea-base.md` midió con `--filter=...db` porque asumía que el código de M3b era byte-idéntico a M3a y reutilizaba sus filas (M3a había corrido `--filter=...contracts`). Pero la corrida M3b **sí tocó `packages/contracts`** (el ajuste aditivo `reglas`), así que el alcance correcto es `--filter=...contracts` (superconjunto de `...db`: todo lo que depende de `db` también depende de `contracts`, y además entran las apps). Es el mismo alcance que la verificación de M3a; las filas base/contrato/geo/apps/seguridad/auditoría se comparan contra los valores que la línea base reutilizó de M3a (medidos a `...contracts`). Las filas de cupo/moderación (api-core, db, PostgreSQL real, privilegios) se comparan contra lo que la línea base midió «ahora» con `--filter db`/`--filter api-core`.

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `pnpm lint` (`biome check .`) | base | 1 | **rojo** (preexistente; ajenos) |
| 2 | `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` | base | 0 | verde (9/9) |
| 3 | `pnpm exec turbo run test --filter=...contracts --concurrency=1` | base | 0 | verde (9/9) |
| 4 | `pnpm exec turbo run build --filter=...contracts --concurrency=1` | base | 0 | verde (7/7) |
| 5 | `pnpm secretos` | base | 0 | verde |
| 6 | grep secretos en archivos sin seguimiento | base | 0 | verde (revisa el auditor) |
| 8 | `pnpm --filter contracts --filter db build` | contrato | 0 | verde |
| 9 | `cp openapi antes; --filter contracts build; cmp` | contrato | 0 | verde (cmp idéntico) |
| 10 | `git diff --name-only refs/sdd/… -- CHANGELOG.md` | contrato | 0 | verde (sale, como debe) |
| 11 | `pnpm exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | 0 | verde (16/16 FULL TURBO) |
| 13 | `pnpm --filter db exec vitest run` | datos | 0 | verde (28/294) |
| 14 | git diff migraciones existentes | datos | 0 | verde (vacío) |
| 15 | migración nueva (nº mayor + prueba) | datos | 0 | verde (0021; M3b no agregó) |
| 16 | PostgreSQL real `*-concurrencia-pg` | datos/concurrencia | 0 | verde (2/10) |
| 17 | base efímera `curichi_sdd_cupo_m3b_v` | datos | 0 | verde (privilegios OK; dropdb OK) |
| 19 | `pnpm exec turbo run test --filter=...geo-service --concurrency=1` | geo | 0 | verde (6/71 FULL TURBO) |
| 20 | `pnpm --filter geodata-etl test` | geo | 0 | verde (3/21) |
| 21 | `pnpm --filter db exec vitest run puntos-criticos-{entorno,volumen,metrica}` | geo | 0 | verde (3/20) |
| 24 | privacidad, 6 archivos | privacidad | 0 | verde (6/94) |
| 25 | `pnpm --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 | verde (1/4) |
| 27 | seguridad, 9 archivos | seguridad | 0 | verde (9/163) |
| 28 | `test/almacen-s3.test.ts` (MinIO) | seguridad | 0 | verde (1/11) |
| 29 | `pnpm audit --audit-level high` | seguridad | 1 | **rojo** (preexistente; 3 high ajenos) |
| 31 | concurrencia idempotencia/pool/cupo-diario | concurrencia | 0 | verde (3/38) |
| 34 | `pnpm exec turbo run test --filter=...api-core --concurrency=1` | api | 0 | verde (FULL TURBO; 436+12) |
| D1 | suite completa api-core + detalle | api/detalle | 0 | verde (33+2 / 436+12; 8 archivos test por test) |
| E2E | G1 + `ubicacion-*` + `csp` + `camara-foto` + `datos-reales` | contrato/privacidad/seguridad/geo/api | 0 | verde (87/87; api-contratos 14/14 y separacion 7/7 = M3a) |

## Comparación con la línea base (`linea-base.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 1 | lint | rojo: 1 err + 6 warn (ajenos) | rojo: 1 err + 6 warn (ajenos, idénticos) | — | — | **igual** (rojo preexistente ajeno) |
| 2 | typecheck `...contracts` | verde (9/9) | verde (9/9; contracts:typecheck cache hit, resto real incl. apps, sin errores TS) | — | — | **igual** |
| 3 | test `...contracts` | verde (contracts 289, db 294, api-core 422+11, web 486, panel 458, geo 71, geodata 21) | **vuelta 1**: verde (contracts **292**, db 294, api-core **436+12**, web 486, panel 458, geo 71, geodata 21) | — | — | **igual** + nuevos de F2/vuelta 1 (contracts +3 `reglas`; api-core +14 passed/+1 skipped: +8 de F2 y +6 de la vuelta 1 en `cupo-diario`) |
| 4 | build `...contracts` | verde (7/7) | verde (7/7; apps `next build` «Compiled successfully») | — | — | **igual** |
| 5 | secretos | verde | verde (sin hallazgos) | — | — | **igual** |
| 6 | grep secretos sin seguimiento | verde (único de código = `password_hash` col., ajeno M2) | verde (182 coincid.; único de código = `password_hash` en `migracion-0020`, ajeno M2; resto prosa) | — | — | **igual** |
| 8 | `--filter contracts --filter db build` | verde | verde | — | — | **igual** |
| 9 | cmp determinismo OpenAPI | idéntico (sha256 `aaa8b711…6bac`) | idéntico (cmp exit 0; sha256 `aaa8b711…6bac`) | — | — | **igual** (el `reglas` es aditivo: OpenAPI sin cambios vs M3a) |
| 10 | git diff CHANGELOG | sale `CHANGELOG.md` | sale `CHANGELOG.md` | — | — | **igual** (debe salir: la corrida tocó contracts) |
| 11 | typecheck+test `...contracts` | verde (16/16 FULL TURBO) | verde (16/16 FULL TURBO) | — | — | **igual** |

## Salida por comando

### 1. `pnpm lint` (`biome check .`) — exit 1, 3 s

501 archivos. «Found 1 error. Found 6 warnings.» Todos en archivos **ajenos** a la corrida (nada en `api-core`, `db`, `contracts`, `geo-service`):

```
ContextosySkills\hooks\contexto.mjs                     format            (= el 1 error)
ContextosySkills\hooks\contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3  lint/style/noDescendingSpecificity
```

### 5. `pnpm secretos` — exit 0, 3 s

`node scripts/buscar-secretos.mjs --todos` → «[secretos] sin hallazgos».

### 6. grep secretos en archivos sin seguimiento — exit 0

182 coincidencias. Única en archivo de código de carpeta de la corrida: `packages/db/test/migracion-0020-base-multicategoria.test.ts:92` = `password_hash` (nombre de columna en un INSERT; ajeno M2, ya en FB). Ninguna en archivos cambiados por M3b (`cuota.ts`, `reportes.ts`, `auth.ts`, `fotos.ts`, `moderacion.ts`, `config.ts`, `servidor.ts`, `mantenimiento.ts`, `categorias/*`). El resto son prosa de docs. Ningún valor real.

### 2. `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` — exit 0, 25 s (1.ª pasada) · **vuelta 1: exit 0, 4 s**

9/9 tareas. 1.ª pasada: `contracts:typecheck` cache hit; el resto cache miss ejecutado. **Sin errores TS.** Apps en verde (campos nuevos opcionales, regla 5). **Vuelta 1** (tras el cambio de `api-core` en `reportes.ts`): exit 0, 9/9, `api-core:typecheck` **cache miss ejecutado sin errores TS**, los otros 8 cache hit.

### 3. `pnpm exec turbo run test --filter=...contracts --concurrency=1` — exit 0, 512 s (1.ª pasada) · **vuelta 1: exit 0, 92 s**

9/9. 1.ª pasada: todas las suites reejecutadas (cache miss por el cambio de `contracts`). **Vuelta 1** (tras el cambio de `api-core`): solo `api-core:test` cache miss, el resto cache hit. Todo verde en una sola corrida (sin caída de workers, RAM ~7,7 GB):

```
contracts:test        Test Files  19 passed (19)              Tests  292 passed (292)   [cache hit]
panel-admin:test      Test Files  40 passed (40)              Tests  458 passed (458)   [cache hit]
web-ciudadano:test    Test Files  34 passed (34)              Tests  486 passed (486)   [cache hit]
db:test               Test Files  28 passed (28)              Tests  294 passed (294)   [cache hit]
geo-service:test      Test Files   6 passed  (6)              Tests   71 passed  (71)   [cache hit]
geodata-etl:test      Test Files   3 passed  (3)              Tests   21 passed  (21)   [cache hit]
api-core:test         Test Files  33 passed | 2 skipped (35)  Tests 436 passed | 12 skipped (448)  [cache miss, ejecutado]
Tasks: 9 successful, 9 total
```

Conteos exactos a lo esperado (contracts 292 = 289 base + 3 `reglas`; **api-core 436+12 = 422+11 base + 8 de F2 + 6 de la vuelta 1 en `cupo-diario`, menos 1 que la 7.ª nueva es la omitida `pg` de dos categorías**). Apps, db, geo-service, geodata iguales a la línea base. Esta corrida cubre también la suite completa de api-core de la fila D1 (`api-core:test` cache miss, real, **436+12**, en una sola pasada sin caída de workers).

### 4. `pnpm exec turbo run build --filter=...contracts --concurrency=1` — exit 0, 62 s (1.ª pasada) · **vuelta 1: exit 0, 10 s**

7/7. 1.ª pasada: apps `next build` reales → «✓ Compiled successfully»; servicios `tsc` reales. Sin warnings ni errores nuevos. **Vuelta 1**: exit 0, 7/7, `api-core:build` **cache miss ejecutado (tsc, sin errores)**, los otros 6 cache hit (apps «✓ Compiled successfully»). (Puertos 3000/3100 libres: ningún `next dev` en marcha.)

### 8. `pnpm --filter contracts --filter db build` — exit 0, 7 s

`contracts: openapi/openapi.yaml y dist/dominio.json generados` + `tsc -p tsconfig.build.json` (db). Verde.

### 9. cmp determinismo OpenAPI — exit 0 (cmp), 7 s

`cp openapi.yaml antes → --filter contracts build → cmp` → **cmp exit 0 (idéntico)**. `sha256(openapi.yaml) = aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac`, **igual al de M3a**: el ajuste aditivo `reglas` en la definición de categoría **no cambia el OpenAPI**. Regenerar es determinista, sin deriva del árbol.

### 10. `git diff --name-only refs/sdd/cupo-por-categoria -- packages/contracts/CHANGELOG.md` — exit 0

Salida: `packages/contracts/CHANGELOG.md`. En F4 **debe** salir (la corrida tocó `contracts`): verde.

### 11. `pnpm exec turbo run typecheck test --filter=...contracts --concurrency=1` — exit 0, 4 s (1.ª pasada) · **vuelta 1: exit 0, 3 s**

16/16, **FULL TURBO** (16 cached) en ambas pasadas. Cubre todos los consumidores (apps incluidas). **Vuelta 1**: tras rehacer typecheck/test/build, queda todo cacheado → FULL TURBO otra vez.

## Salida por comando — continuación (filas 13+)

Alcance como la línea base: las suites de `db`/`api-core` se corren **directo con vitest** en su paquete (no por turbo), en limpio y sin otro comando pesado en paralelo. Condiciones al reanudar en la cabecera.

### Comparación con la línea base (filas 13+)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 13 | `--filter db exec vitest run` | verde (28/294) | verde (28/294) | — | — | **igual** |
| 14 | git diff migraciones existentes | vacío | vacío | — | — | **igual** |
| 15 | migración nueva (nº mayor + prueba) | 0021 (+reversa) + prueba | 0021 (+reversa) + prueba; M3b no agregó migración | — | — | **igual** |
| 16 | PostgreSQL real `*-concurrencia-pg` | verde (2/9) | verde (2/**10**) | — | — | **igual** + nuevo de F2 (+1 «dos categorías a la vez») |
| 17 | base efímera `curichi_sdd_cupo_m3b_v` | verde (privilegios correctos; dropdb OK) | verde (privilegios correctos; dropdb OK) | — | — | **igual** |
| 19 | test `...geo-service` | verde (6/71) | verde (6/71 FULL TURBO) | — | — | **igual** |
| 20 | `--filter geodata-etl test` | verde (3/21) | verde (3/21) | — | — | **igual** |
| 21 | `--filter db` puntos-criticos {entorno,volumen,metrica} | verde (3/20) | verde (3/20) | — | — | **igual** |
| 24 | privacidad (6 archivos) | verde (6/94) | verde (6/94) | — | — | **igual** |
| 25 | contracts jitter | verde (1/4) | verde (1/4) | — | — | **igual** |
| 27 | seguridad (9 archivos) | verde (9/152) | verde (9/**163**) | — | — | **igual** + nuevos F2/vuelta 1 (+11 de `cupo-diario`: 13→24) |
| 28 | almacen-s3 (MinIO) | verde (1/11) | verde (1/11) | — | — | **igual** |
| 29 | `pnpm audit --audit-level high` | rojo (3 high) | rojo (3 high, idénticos) | — | — | **igual** (rojo preexistente ajeno) |
| 31 | concurrencia idempotencia/pool/cupo-diario | verde (3/27) | verde (3/**38**) | — | — | **igual** + nuevos F2/vuelta 1 (+11 en `cupo-diario`) |
| 34 | test `...api-core` | verde (FULL TURBO) | verde (FULL TURBO) | — | — | **igual** |
| D1 | suite completa api-core | verde (33+2/422+11; 1 intermitente al reintentar) | verde (33+2/**436+12** en una sola pasada) | — | — | **igual** + nuevos F2/vuelta 1 |

### 13. `pnpm --filter db exec vitest run` — exit 0, 115 s

**28 passed (28) · 294 passed (294).** En limpio (vitest directo, no turbo). Igual a la línea base (28/294).

### 14. `git diff --name-only --diff-filter=MDR refs/sdd/cupo-por-categoria -- packages/db/migraciones` — exit 0

**Vacío**: ninguna migración existente se modificó, borró ni renombró. Igual a la línea base.

### 15. Migración nueva de la corrida — verde

`git ls-files -o --exclude-standard -- packages/db/migraciones` → `0020_base_multicategoria.sql`, `0021_indice_categoria_creado.sql` (+ sus reversas). Son las de M3a; **M3b no agregó ninguna migración** (no hay 0022). `0021` es el número mayor en disco y tiene su prueba `packages/db/test/migracion-0021-indice-categoria-creado.test.ts`. Igual a la línea base.

### 16. PostgreSQL real (`cuota-concurrencia-pg`, `fotos-cuota-concurrencia-pg`, bases efímeras) — exit 0, 9 s

`DATABASE_URL` tomado de `.env` (no impreso). **2 passed (2) · 10 passed (10).** Base: 9. El +1 es «dos categorías a la vez» de `cuota-concurrencia-pg`. Las bases efímeras se crean y se borran solas. Verde (nuevo de F2).

### 17. Base efímera `curichi_sdd_cupo_m3b_v` (createdb · migrate×2 · privilegios · dropdb) — exit 0

- `createdb -U curichi curichi_sdd_cupo_m3b_v` → OK.
- `db:migrate` (1.ª): aplicó las 21 migraciones hasta `0021`, 0 omitidas, pendientes [].
- `db:migrate` (2.ª): **aplicadas [], omitidas 21, pendientes []** (idempotente).
- `privilegios`: «privilegios correctos: curichi_api y curichi_geo tienen exactamente lo documentado en las migraciones 0008, 0009, 0014, 0016 y 0020».
- `dropdb` → OK; quedan `curichi`, `curichi_e2e`, `curichi_revision` (las protegidas intactas). Igual a la línea base.

### 19. `pnpm exec turbo run test --filter=...geo-service --concurrency=1` — exit 0, 3 s

3/3 **FULL TURBO**. `geo-service:test` **6 passed (6) · 71 passed (71)**. Igual a la línea base.

### 20. `pnpm --filter geodata-etl test` — exit 0, 23 s

**3 passed (3) · 21 passed (21).** Igual a la línea base.

### 21. `pnpm --filter db exec vitest run puntos-criticos-{entorno,volumen,metrica}` — exit 0, 17 s

**3 passed (3) · 20 passed (20).** Igual a la línea base.

### 24. privacidad, 6 archivos (`privacidad-ubicacion`, `vista-publica-vs-tecnica`, `publicacion-diferida`, `exportacion`, `ubicacion-dispositivo`, `ubicacion-aproximada`) — exit 0, 23 s

**6 passed (6) · 94 passed (94).** Igual a la línea base. Sin el *timeout* de `exportacion.test.ts:217` esta vez.

### 25. `pnpm --filter contracts exec vitest run test/jitter.test.ts` — exit 0, 4 s

**1 passed (1) · 4 passed (4).** Igual a la línea base.

### 27. seguridad, 9 archivos (`seguridad`, `autenticacion`, `fotos`, `fotos-abuso`, `cuentas-y-cuota`, `cupo-diario`, `fotos-cuota`, `fotos-webp`, `guarda-disco`) — exit 0, 25 s

**9 passed (9) · 163 passed (163).** Base: 152. El +11 es `cupo-diario` (13→24). Verde (nuevos de F2/vuelta 1).

### 28. `pnpm --filter api-core exec vitest run test/almacen-s3.test.ts` (MinIO) — exit 0, 3 s

**1 passed (1) · 11 passed (11)** con `curichi-minio` healthy (health desde el host `127.0.0.1:9000` = 200) y `S3_SECRET_KEY` exportado desde `.env` (sin imprimirlo). Igual a la línea base.

> Nota de método: el `.env` de esta máquina trae `S3_ENDPOINT=` **vacío** (los servicios usan `S3_ENDPOINT_DOCKER`; el test cae a `http://127.0.0.1:9000`). Un primer intento que exportó también ese `S3_ENDPOINT` vacío rompió el *fallback* (`'' ?? x` = `''`) y omitió los 2 casos de ida y vuelta real (9 passed | 2 skipped). Reintento exportando **solo** las claves con valor (como pide la matriz: «`S3_SECRET_KEY` en el entorno») → **11/11**. No fue regresión de código (el archivo no cambió en M3b): fue mi configuración de entorno.

### 29. `pnpm audit --audit-level high` — exit 1, 3 s

3 **high**, idénticos a la línea base (deps de apps/services): `source-map-js` (event-loop DoS), `sharp` (librsvg CVE-2026-96889), `next` (SSRF en Image Optimization). **Rojo preexistente ajeno** (conocido de la puerta 1).

### 31. concurrencia (`idempotencia`, `pool-conexiones`, `cupo-diario`) — exit 0, 16 s

**3 passed (3) · 38 passed (38).** Base: 27. El +11 es `cupo-diario` (13→24). Verde (nuevos de F2/vuelta 1).

### 34. `pnpm exec turbo run test --filter=...api-core --concurrency=1` — exit 0, 2 s

3/3 **FULL TURBO**. `api-core:test` **436 passed | 12 skipped (448)** (cacheado de la fila 3, cache miss real allí). Igual a la línea base (FULL TURBO).

### D1. Suite completa de api-core + detalle prueba por prueba — exit 0

La suite completa corrió **en la fila 3** (cache miss real, una sola pasada, **sin** caída de workers): `33 passed | 2 skipped (35) · 436 passed | 12 skipped (448)`. Base: 422+11. Sube a 436+12 por las nuevas de F2 y de la vuelta 1. **Sin intermitente esta vez.**

Detalle por archivo (cada uno aislado, `--reporter=verbose`), comparado contra los nombres de la línea base:

| Archivo | Base | Ahora | Baseline presentes | Nuevos | Clasificación |
|---|---|---|---|---|---|
| `cupo-diario` | 13 | **24** | los 13 (el `cupoDelDia cuenta solo el día local` **renombrado** a `leerCupos cuenta solo la ventana del día local`, como preveía la corrida) | +11: `cupo por categoría` (3), `una regla de cupo desconocida impide arrancar` (2), `CA5…4xx sin gastar cupo` a/b/b2/c/c2/c3 (6) | igual + nuevos |
| `moderacion` | 11 | **13** | los 11 | +2: `PATCH /estado también acepta un ID corto`, `409 FUSION_ENTRE_CATEGORIAS` | igual + nuevos |
| `reportes` | 20 | **21** | los 20 | +1: `la auditoría de crear guarda la regla E1 … y la categoría` (M3.6b) | igual + nuevos |
| `cuentas-y-cuota` | 26 | **26** | los 26 | — | igual |
| `fotos-cuota` | 10 | **10** | los 10 | — | igual |
| `publicacion-diferida` | 22 | **22** | los 22 | — | igual |
| `idempotencia` | 11 | **11** | los 11 | — | igual |
| `autenticacion` | 16 | **16** | los 16 | — | igual |

**Toda prueba de la base sigue existiendo y en verde.** Ninguna prueba que la base tuviera en verde quedó omitida o borrada (la única renombrada mantiene la invariante). Ningún rojo nuevo.

## Ventana E2E (autorizada por la puerta 1)

- **Base:** `curichi_e2e`, en la **0021** (último aplicado `0021_indice_categoria_creado.sql`; índice `reporte_categoria_creado` presente; catálogo `categoria`: `inundacion` activa, resto inactivas). `privilegios` contra ella → «privilegios correctos».
- **`PLAYWRIGHT_BROWSERS_PATH`** fijado **solo** en los comandos de Playwright → `…\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright` (contiene `chromium-1243`). Sin cambios persistentes. **Chromium arrancó bien** (el SxS 14001 de la línea base quedó resuelto por esta variable).
- **Pila levantada por mí** (no por el `webServer` de Playwright, que usaría `curichi`): `api-core`, `geo-service`, `web-ciudadano` (`next dev -p 3000 --webpack`) y `panel-admin` (`-p 3100 --webpack`) en segundo plano, con `DATABASE_URL`→`curichi_e2e` exportado (gana sobre `.env` porque el `dev` usa `--env-file-if-exists`, que **no** pisa lo exportado) y el entorno de `playwright.config.ts` (demora 2/4 s, cupo 3, `ALTAS_POR_DIA_POR_IP=10000`, `COOKIE_SEGURA=0`, rate limits altos). Antes de correr: `api-core /ready` → `{db:ok, geo:ok, fotos:ok, degradado:false}`; login técnico → **200**; geo `/ready` → 200.
- **`curichi` NO se tocó:** tras la suite, `curichi_e2e` tiene **94** cuentas `e2e-*@curichi.test` y `curichi` tiene **0** (la pila usó `curichi_e2e`). RAM libre antes de cada grupo: 7356→5546 MB (siempre > 2500).

| Grupo / spec | Proyecto | Pasaron | Fallaron | Línea base | Veredicto |
|---|---|---|---|---|---|
| G1 · `api-contratos` | chromium | **14/14** | — | M3a 14/14 | **igual** |
| G1 · `separacion-publica-tecnica` | chromium | **7/7** | — | M3a 7/7 | **igual** |
| G1 · `cuenta-ciudadana` | chromium | **12/12** | — | sin línea base | sin línea base, **en verde** |
| G1 · `acceso-panel` | chromium | **8/8** | — | sin línea base | sin línea base, **en verde** |
| G1 · `publicacion-diferida` | chromium | **6/6** | — | sin línea base | sin línea base, **en verde** |
| `ubicacion-obligatoria` | chromium + movil | **19/19** (10+9) | — | sin línea base | sin línea base, **en verde** |
| `ubicacion-aproximada` | chromium | **3/3** | — | sin línea base | sin línea base, **en verde** |
| `csp` | chromium | **5/5** | — | sin línea base | sin línea base, **en verde** |
| `camara-foto` | chromium + movil | **4/4** (2+2) | — | sin línea base | sin línea base, **en verde** |
| `datos-reales` | chromium | **9/9** | — | sin línea base | sin línea base, **en verde** |

**Total E2E: 87 passed, 0 failed, 0 flaky.** `api-contratos` (14/14) y `separacion-publica-tecnica` (7/7) **idénticos** a la línea base de M3a. El resto nunca había corrido en ninguna línea base (en la FB quedaban «no verificado: Chromium no arranca»): **ahora corren y pasan** con el `PLAYWRIGHT_BROWSERS_PATH` de la puerta 1. Ninguna necesitó reintento.

### Cierre de la ventana (hecho siempre)

- Matados los PID de los 4 dev servers (y barrido de `node` de `tsx watch`/`next dev`); **puertos 3000-3002/3100 LIBRES**; 0 procesos `node` de dev restantes.
- `pila-despues.txt` **=** `pila-antes.txt` (`minio running healthy` · `postgis running healthy`).
- `next-env.d.ts` de `panel-admin` y `web-ciudadano` **restaurados** (`git checkout`).
- Artefactos borrados: `e2e/playwright-report`, `e2e/test-results`.
- Base efímera `curichi_sdd_cupo_m3b_v` ya borrada (fila 17); quedan `curichi`, `curichi_e2e`, `curichi_revision`. (El `M e2e/tests/api-contratos.spec.ts` que figura en `git status` es la corrección autorizada de M3a, **anterior** a esta corrida, no un artefacto mío.)

## No verificado

| Comando | Motivo |
|---|---|
| — | ninguno: todo lo de las banderas se ejecutó (la ventana E2E de navegador, que en la FB quedaba «no verificado: Chromium no arranca», corrió esta vez) |

## En vivo

No aplica (el plan deja el «en vivo» fuera: reconstruir la pila correría el job de migraciones sobre `curichi`). Puerta 1: en vivo **no autorizado**.

## Veredicto final

**Sin regresiones.** 23 comandos verdes (varios con nuevos tests de F2/vuelta 1, todos verdes) · 2 rojos preexistentes ajenos (lint, `pnpm audit` 3 high), idénticos a la línea base · E2E 87/87 (api-contratos y separacion idénticos a M3a; el resto sin línea base y en verde) · pila devuelta igual que `pila-antes.txt`; `curichi` intacto.
