# Verificación — Registro de categorías y políticas en `contracts`

- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad` · **Alcance:** `--filter=...contracts` (paquetes que entran: `contracts`, `api-core`, `db`, `geo-service`, `geodata-etl`, `panel-admin`, `web-ciudadano`)
- **Ejecutado el:** 2026-10-08 06:38–06:58 -0400 · **Por:** `sdd-verificador` (modo verificación, F4a)
- **Foto:** `refs/sdd/registro-de-categorias` = `4f84ab5` · **HEAD:** `3121a0f` · **Rama:** `feat/contracts/registro-de-categorias`
- **Condiciones:** RAM libre al inicio **4209 MB** (3675 en FB; ≥ 4200 antes de cada suite, subió a ~9600) · procesos pesados ajenos **0** (el comando contó 4: 3 envoltorios `bash.exe` + el propio `powershell.exe` de la consulta, sin `vitest`/`playwright`/`next`/`tsc` ajeno real, igual que en FB) · **pila Docker: apagada** (Docker Desktop abajo; en FB `postgis` y `minio` estaban `healthy`) · `next dev` local: **no** (3000/3100 libres) · túneles `cloudflared`: **0** · `--concurrency=1`
- **Diff de la corrida:** `C:/Users/HP/AppData/Local/Temp/.../scratchpad/corrida-m1.diff` (archivos de `archivos.txt`) · **Alcance y opciones iguales a la línea base:** **sí** (misma lista, mismo `--filter=...contracts`, `--concurrency=1` también en `typecheck`, como en FB).
- **Nota de condición (única diferencia con FB):** Docker Desktop quedó apagado. No afecta la verificación: la suite de `api-core` y `geo-service` usa **PGlite efímero**, no la `postgis` de Docker, y pasó entera (no la arranqué ni la recreé). `almacen-s3.test.ts` sigue **no verificado** de todos modos (falta `S3_SECRET_KEY`; además `minio` abajo).
- **Árbol:** fuera de `archivos.txt` y de la carpeta de corrida, idéntico a `arbol-inicial.txt` (mismos ajenos `M`/`??`; `ContextosySkills/hooks/contexto.mjs` con sha256 `3e864ffe…` sin cambios). Los dos `apps/*/next-env.d.ts` quedaron **limpios** tras los `next build` (sin artefacto esta corrida). Tras todas las corridas `git status` no muestra cambios inesperados; `openapi.yaml` y `dist/dominio.json` se regeneraron **sin modificar** el archivo.

## Regresiones

**Ninguna.** Ningún test verde en la línea base quedó rojo. Los dos rojos (`lint`, `auditoria`) y el intermitente (`api-core > exportacion`) salen **igual** que en FB. La suite de `contracts` creció de 237 a 265 pruebas (17 → 18 archivos), lo esperado por el cambio aditivo.

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` | base | 1 | **rojo** (preexistente; archivo ajeno) |
| 2 | `npx -y pnpm@12.4.1 exec turbo run typecheck --filter=...contracts --concurrency=1` | base | 0 | verde |
| 3 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...contracts --concurrency=1` | base | 1 | **rojo** (exit por el intermitente; sin rojo real) |
| 3r | `… --filter api-core exec vitest run test/exportacion.test.ts` (reintento aislado) | base | 0 | verde → **intermitente** |
| 3g | `… --filter geodata-etl test` (turbo lo abortó en #3) | base | 0 | verde |
| 4 | `npx -y pnpm@12.4.1 exec turbo run build --filter=...contracts --concurrency=1` | base | 0 | verde |
| 5 | `npx -y pnpm@12.4.1 secretos` | base | 0 | verde |
| 6 | `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN [A-Z ]*PRIVATE KEY)" --` | base | 0 | verde (todo ajeno; revisa el auditor) |
| 8 | `npx -y pnpm@12.4.1 --filter contracts --filter db build` | contrato | 0 | verde |
| 9 | `cp openapi.yaml "$SCRATCH/openapi.antes.yaml" && … build && cmp -s …` (+ `cmp` vs la foto) | contrato | BUILD=0 CMP_SELF=0 CMP_FOTO=0 | verde (byte-idéntico) |
| 10 | `git diff --name-only refs/sdd/registro-de-categorias -- packages/contracts/CHANGELOG.md` | contrato | 0 | verde (**sale** en F4, como exige) |
| 11 | `npx -y pnpm@12.4.1 exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | 0 | verde (re-ejecuta api-core y geo-service) |
| 12 | ventana E2E: G1 | contrato | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 13 | `… --filter api-core exec vitest run test/privacidad-ubicacion … vista-publica-vs-tecnica … publicacion-diferida … exportacion … ubicacion-dispositivo … ubicacion-aproximada` | privacidad | 0 | verde |
| 14 | `… --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 | verde |
| 15 | ventana E2E: G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts` | privacidad | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 16 | `… --filter api-core exec vitest run test/seguridad … autenticacion … fotos … fotos-abuso … cuentas-y-cuota … cupo-diario … fotos-cuota … fotos-webp … guarda-disco` | seguridad | 0 | verde |
| 17 | `… --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — | **no verificado: `S3_SECRET_KEY` no está en el entorno** (y Docker/minio abajo) |
| 18 | `npx -y pnpm@12.4.1 audit --audit-level high` | seguridad | 1 | **rojo** (preexistente; deps de apps/services) |
| 19 | ventana E2E: G1 + `csp.spec.ts` + `camara-foto.spec.ts` | seguridad | — | **no verificado: el usuario no autorizó la ventana E2E** |

## Comparación con la línea base (`linea-base.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 1 | `lint` | rojo: 1 error + 6 avisos, todo en `ContextosySkills/hooks/contexto.mjs` y `docs/dominio/…html` (ajenos); 486 archivos | rojo: 1 error + 6 avisos, **mismos** archivos ajenos; 493 archivos (486 + 7 nuevos de contracts); **0** diagnósticos en `packages/contracts` | — | — | **igual** |
| 2 | `typecheck` turbo | verde; 9 tareas; 46 s | verde; 9 tareas; 36 s | — | — | **igual** |
| 3 | `test` turbo | rojo (exit 1) por el intermitente; resto verde | rojo (exit 1) por el **mismo** test; resto verde | — | — | **igual (intermitente)** |
| 3r | `exportacion` aislado | verde 10/10 (33 s) | verde 10/10 (32 s) | — | — | **intermitente confirmado** (pasa sin contención) |
| 3g | `geodata-etl test` | verde 3 files / 21 tests | verde 3 files / 21 tests | — | — | **igual** |
| 4 | `build` turbo | verde; 7 tareas | verde; 7 tareas (incluidos los `next build` de las dos apps) | — | — | **igual** |
| 5 | `secretos` | verde «sin hallazgos» | verde «sin hallazgos» | — | — | **igual** |
| 6 | grep sin seguimiento | verde; 128 coincidencias, todas ajenas | verde; 132 coincidencias, todas ajenas (+4: docs de la carpeta de corrida); **0** en fuentes de contracts | — | — | **igual** |
| 8 | `build contracts+db` | verde | verde | — | — | **igual** |
| 9 | OpenAPI `cmp` | verde; byte-idéntico al regenerar; 179 349 bytes | verde; byte-idéntico al regenerar **y** a la foto (`CMP_SELF=0`, `CMP_FOTO=0`); 179 349 bytes | — | — | **igual** |
| 10 | diff `CHANGELOG` | vacío (en FB contracts no se había tocado) | **sale** `packages/contracts/CHANGELOG.md` | — | — | **esperado** (la matriz exige que salga en F4) |
| 11 | `typecheck test` contrato | verde; 16 tareas | verde; 16 tareas (13 cache); `api-core:test` 405 ok, `geo-service:test` 61 ok, `geodata-etl:test` 21 ok | — | — | **igual** |
| 13 | privacidad (api-core) | verde 6 files / 90 tests | verde 6 files / 90 tests | — | — | **igual** |
| 14 | `jitter` (contracts) | verde 1 file / 4 tests | verde 1 file / 4 tests | — | — | **igual** |
| 16 | seguridad (api-core) | verde 9 files / 152 tests | verde 9 files / 152 tests | — | — | **igual** |
| 18 | `audit` | rojo; 14 vulns (3 high: `source-map-js`, `sharp`, `next`) | rojo; 14 vulns (1 low · 10 moderate · 3 **high** idénticas) | — | — | **igual** |
| — | suite `contracts` | 17 files / 237 tests | **18 files / 265 tests** (nuevo `test/contrato-0-19.test.ts`, +28) | — | — | **nuevo de F2 (verde)** |

Recuentos de consumidores en #3/#11 (todos verdes, sin rojo oculto): `web-ciudadano` 34/486 · `db` 25/260 · `panel-admin` 40/458 · `api-core` 32 files (405 passed + 11 skipped; el único fallo en #3 fue el intermitente, verde en #11) · `geo-service` 5/61 · `geodata-etl` 3/21.

## Salida por comando

### 1. `npx -y pnpm@12.4.1 lint` — exit 1, 4 s

```
ContextosySkills\hooks\contexto.mjs:42:17 lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13 lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14 lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55 lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24 lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3 lint/style/noDescendingSpecificity
ContextosySkills\hooks\contexto.mjs format  (Formatter would have printed…)  → el 1 error
Checked 493 files in 456ms. No fixes applied.
Found 1 error. Found 6 warnings.
```
Idéntico a FB salvo el total de archivos (486 → 493 por los 7 nuevos de contracts). Ningún diagnóstico en `packages/contracts`.

### 2. `… turbo run typecheck --filter=...contracts --concurrency=1` — exit 0, 36 s

```
 Tasks:    9 successful, 9 total
 Cached:    0 cached, 9 total
```

### 3. `… turbo run test --filter=...contracts --concurrency=1` — exit 1, 463 s

```
api-core:test:  FAIL test/exportacion.test.ts > exportación: cuenta sin tope y avisa cuando el
  archivo no trae todo > el límite por defecto es EXPORTAR_MAX_FILAS, no el de una página del listado
  Error: Test timed out in 5000ms.  (test/exportacion.test.ts:217:3)
api-core:test:  Test Files  1 failed | 31 passed | 2 skipped (34)
api-core:test:       Tests  1 failed | 404 passed | 11 skipped (416)
contracts:test:  Test Files 18 passed (18) · Tests 265 passed (265)
web-ciudadano:test: 34 passed (34) · 486 passed
db:test: 25 passed (25) · 260 passed
panel-admin:test: 40 passed (40) · 458 passed
 Tasks: 6 successful, 9 total  (turbo abortó geodata-etl y geo-service)
 Failed: api-core#test
```
Único fallo = el intermitente conocido (mismo test, mismo timeout en la línea 217). Sin otro FAIL.

### 3r. `… --filter api-core exec vitest run test/exportacion.test.ts` — exit 0, 32 s

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
Sin contención pasa 10/10 → **intermitente**, no regresión (igual que FB #3r).

### 3g. `… --filter geodata-etl test` — exit 0, 33 s

```
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

### 4. `… turbo run build --filter=...contracts --concurrency=1` — exit 0, 52 s

```
 Tasks:    7 successful, 7 total  (contracts/db cache; geo-service, geodata-etl, api-core, panel-admin, web-ciudadano ejecutaron)
panel-admin:build: ▲ Next.js 16.3.6 … ✓ ;  web-ciudadano:build: next build ✓
```
`apps/*/next-env.d.ts` quedaron limpios tras el build.

### 5. `… secretos` — exit 0, 3 s

```
[secretos] sin hallazgos
```

### 6. grep en archivos sin seguimiento — exit 0

```
132 coincidencias, todas en archivos ajenos (ContextosySkills, PROJECT_STRUCTURE_AND_FUNCTIONALITY.md,
docs/arquitectura/*, docs/sdd/2026-10-07-registro-de-categorias/{linea-base,plan}.md).
0 en fuentes de packages/contracts (la única línea con el texto «packages/contracts» es la ruta
packages/contracts/openapi/openapi.yaml citada dentro de docs/arquitectura/14-…md, archivo ajeno).
```

### 8. `… --filter contracts --filter db build` — exit 0, 10 s

```
contracts: openapi/openapi.yaml y dist/dominio.json generados
```

### 9. OpenAPI `cmp` — BUILD_EXIT=0, CMP_SELF=0, CMP_FOTO=0

```
bytes: actual=179349  antes=179349  foto=179349
git status openapi/dist: (vacío → árbol limpio)
```
Regenerar no cambia el archivo **y** coincide byte a byte con `refs/sdd/registro-de-categorias:…/openapi.yaml`.

### 10. `git diff --name-only … CHANGELOG.md` — exit 0

```
packages/contracts/CHANGELOG.md
```
package.json → `"version": "0.19.0"`; entrada `## 0.19.0 — 2026-10-07` «Sin ruptura: registro de categorías… no hay cambios de API ni de OpenAPI».

### 11. `… turbo run typecheck test --filter=...contracts --concurrency=1` — exit 0, 231 s

```
 Tasks: 16 successful, 16 total  (13 cached)
 0 FAIL
contracts 18/265 · panel-admin 40/458 · db 25/260 · web-ciudadano 34/486 ·
api-core 32 passed + 2 skipped (405 passed + 11 skipped) · geo-service 5/61 · geodata-etl 3/21
```

### 13. privacidad (6 archivos api-core) — exit 0, 56 s

```
 Test Files  6 passed (6)
      Tests  90 passed (90)
```

### 14. `… --filter contracts exec vitest run test/jitter.test.ts` — exit 0, 4 s

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### 16. seguridad (9 archivos api-core) — exit 0, 55 s

```
 Test Files  9 passed (9)
      Tests  152 passed (152)
```

### 18. `… audit --audit-level high` — exit 1, 4 s

```
14 vulnerabilities found — Severity: 1 low | 10 moderate | 3 high
high  source-map-js   (GHSA-68fv-2mgg-jv7q)
high  sharp : librsvg CVE-2026-96889   (apps/web-ciudadano>next>sharp, services/api-core>sharp)
high  next : SSRF in Image Optimization
```
Ninguna en `packages/contracts`. Mismas 3 high que FB.

## No verificado

| Comando | Motivo |
|---|---|
| #12 ventana E2E G1 (contrato) | el usuario no autorizó la ventana E2E |
| #15 ventana E2E G1 + `ubicacion-obligatoria` + `ubicacion-aproximada` (privacidad) | el usuario no autorizó la ventana E2E |
| #17 `test/almacen-s3.test.ts` (seguridad) | `S3_SECRET_KEY` no está en el entorno (además Docker Desktop apagado, `minio` abajo) |
| #19 ventana E2E G1 + `csp` + `camara-foto` (seguridad) | el usuario no autorizó la ventana E2E |

## Ventana E2E (si se autorizó)

No autorizada. Grupos/specs que quedarían pendientes por bandera: `contrato` → G1; `privacidad` → G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts`; `seguridad` → G1 + `csp.spec.ts` + `camara-foto.spec.ts`.

## En vivo

No aplica: la corrida no tiene bandera `ui`, `api` ni `infra`.

## Túnel

No aplica.
