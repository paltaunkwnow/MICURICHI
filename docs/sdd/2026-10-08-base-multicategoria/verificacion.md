# Verificación (F4a) — Base multicategoría (expansión M2)

- **Corrida:** `docs/sdd/2026-10-08-base-multicategoria/` · **Ejecutado el:** 2026-10-08 ~16:20–16:43 -0400 · **Por:** `sdd-verificador` (modo verificación)
- **Banderas:** `base`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia` · **Alcance:** `--filter=...db` (scope de turbo: `db`, `api-core`, `geo-service`, `geodata-etl`; `contracts` como dependencia de build/typecheck; sin apps, sin `next build`) · **Foto:** `refs/sdd/base-multicategoria` = `338e571` · **HEAD:** `3121a0f` · **Rama:** `feat/db/base-multicategoria`
- **Condiciones:** RAM libre al inicio **7546 MB** (osciló entre 7370 y 9513 MB; nunca < 1500; **8196 MB** al final) · procesos pesados ajenos: **0** (el contador dio 4, pero eran 3 `bash.exe` de esta sesión + el `powershell.exe` de la consulta; ningún `vitest`/`playwright`/`next`/`tsc` ajeno) · pila Docker: **`postgis` y `minio` healthy** (perfil `servicios` abajo) · `next dev` local: **no** (3000/3100 libres) · túneles `cloudflared`: **0** · `--concurrency=1` en `typecheck`, `test` y `build`
- **Alcance y opciones iguales a la línea base:** **sí**. Misma lista, mismo alcance (`--filter=...db`), mismas opciones. Única diferencia esperada: los turbo `typecheck`/`test`/`build` que en FB fueron *cache hit* ahora re-ejecutan `db` (y sus dependientes directos) por el cambio en `packages/db`; el veredicto no cambia.
- **Diff de la corrida:** `C:/Users/HP/AppData/Local/Temp/.../scratchpad/corrida-m2.diff` (13 archivos modificados + nuevos de `archivos.txt`). Árbol fuera de `archivos.txt` y de la carpeta de corrida: **igual a `arbol-inicial.txt`** (ver «Integridad del árbol»).
- **Ruta del repo:** `C:\Users\HP\Desktop\MICURICHI` (la ruta `/a/MICURICHI/MICURICHI` del rol no existe en esta máquina; se usó la real en todas las llamadas, igual que en FB).

## Regresiones

**Ninguna.** Ningún test que estuviera verde en la línea base quedó rojo. Ningún verde se perdió (ningún archivo/test omitido o borrado del conjunto preexistente). Los dos rojos (`lint`, `auditoria`) son los mismos preexistentes y ajenos de la línea base, idénticos diagnóstico a diagnóstico.

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` | base | 1 | **rojo** (preexistente; archivos ajenos) |
| 2 | `npx -y pnpm@12.4.1 exec turbo run typecheck --filter=...db --concurrency=1` | base | 0 | verde (6/6; re-ejecutado) |
| 3 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...db --concurrency=1` | base | 0 | verde (6/6) |
| 4 | `npx -y pnpm@12.4.1 exec turbo run build --filter=...db --concurrency=1` | base | 0 | verde (5/5; solo tsc) |
| 5 | `npx -y pnpm@12.4.1 secretos` | base | 0 | verde |
| 6 | `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN [A-Z ]*PRIVATE KEY)" --` | base | 0 | verde (revisa el auditor) |
| 8 | `npx -y pnpm@12.4.1 --filter db test` | datos | 0 | verde (**26 archivos / 280**) |
| 9 | `git diff --name-only --diff-filter=MDR refs/sdd/base-multicategoria -- packages/db/migraciones` | datos | 0 | verde (vacío) |
| 10 | migración nueva (`git ls-files -o … packages/db/migraciones`) | datos | 0 | verde (0020, con test de 20) |
| 11 | `… DATABASE_URL_PG_REAL=…/postgres … --filter api-core exec vitest run test/cuota-concurrencia-pg … fotos-cuota-concurrencia-pg` | datos / concurrencia | 0 | verde (2/9) |
| 12 | base efímera `curichi_sdd_base_multicategoria`: createdb · db:migrate ×2 · privilegios · **vista** · **reversa** · db:migrate · dropdb | datos | 0 | verde |
| 14 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...geo-service --concurrency=1` | geo | 0 | verde (cache hit; 5/61) |
| 15 | `npx -y pnpm@12.4.1 --filter geodata-etl test` | geo | 0 | verde (3/21) |
| 16 | `npx -y pnpm@12.4.1 --filter db exec vitest run test/puntos-criticos-{entorno,volumen,metrica}.test.ts` | geo | 0 | verde (3/20) |
| 19 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/privacidad-ubicacion … vista-publica-vs-tecnica … publicacion-diferida … exportacion … ubicacion-dispositivo … ubicacion-aproximada` | privacidad | 0 | verde (6/90; `exportacion` sin timeout) |
| 20 | `npx -y pnpm@12.4.1 --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 | verde (1/4) |
| 22 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/seguridad … autenticacion … fotos … fotos-abuso … cuentas-y-cuota … cupo-diario … fotos-cuota … fotos-webp … guarda-disco` | seguridad | 0 | verde (9/152) |
| 23 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — | **no verificado: `S3_SECRET_KEY` no está en el entorno** |
| 24 | `npx -y pnpm@12.4.1 audit --audit-level high` | seguridad | 1 | **rojo** (preexistente; deps de apps/services) |
| 26 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/idempotencia.test.ts test/pool-conexiones.test.ts test/cupo-diario.test.ts` | concurrencia | 0 | verde (3/27) |
| 27 | PostgreSQL real (= #11) | concurrencia | 0 | verde (reusa #11) |

Filas «no aplica/no se corre» de FB mantenidas: #7 (e2e no se toca), #13 (observación), #17/#21/#25 (ventanas E2E no autorizadas), #18 (banco-consultas), #28 (banco-concurrencia).

## Comparación con la línea base (`linea-base.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 1 | `lint` | rojo: 1 error + 6 warnings (ajenos) | rojo: 1 error + 6 warnings (mismos archivos y reglas) | — | — | **igual** (preexistente) |
| 2 | turbo typecheck `...db` | verde (cache hit) | verde 6/6 (db/api-core/geo/etl re-ejecutados, contracts cache hit) | — | — | **igual** |
| 3 | turbo test `...db` | verde (cache hit; api-core 405+11skip) | verde 6/6 (api-core **405 passed + 11 skipped**) | — | — | **igual** |
| 4 | turbo build `...db` | verde (cache hit) | verde 5/5 (solo tsc) | — | — | **igual** |
| 5 | secretos | verde | verde | — | — | **igual** |
| 6 | grep secretos untracked | verde (142 coincidencias) | verde (148 coincidencias) | — | — | **igual** (+6 por archivos nuevos de la corrida; sin valores reales) |
| 8 | `--filter db test` | verde **25 / 260** | verde **26 / 280** | — | — | **260 igual + 20 nuevos de F2 (verde)** |
| 9 | git diff MDR migraciones | vacío | vacío | — | — | **igual** |
| 10 | migración nueva | ninguna | 0020 (nº mayor, test de 20) | — | — | **nuevo de F2** (correcto) |
| 11 | PG real cuota/fotos-concurrencia | verde 2/9 | verde 2/9 | — | — | **igual** |
| 12 | base efímera + vista + reversa | verde | verde (+ chequeos F4) | — | — | **igual** |
| 14 | turbo test `...geo-service` | verde 5/61 | verde 5/61 (cache hit) | — | — | **igual** |
| 15 | geodata-etl test | verde 3/21 | verde 3/21 | — | — | **igual** |
| 16 | puntos-criticos | verde 3/20 | verde 3/20 | — | — | **igual** |
| 19 | api-core privacidad | verde 6/90 | verde 6/90 | — | — | **igual** |
| 20 | contracts jitter | verde 1/4 | verde 1/4 | — | — | **igual** |
| 22 | api-core seguridad | verde 9/152 | verde 9/152 | — | — | **igual** |
| 23 | almacen-s3 | no verificado (S3_SECRET_KEY) | no verificado (S3_SECRET_KEY) | — | — | **igual** |
| 24 | audit | rojo 14 (1 low · 10 moderate · 3 high) | rojo 14 (1 low · 10 moderate · 3 high) | — | — | **igual** (mismas 3 high) |
| 26 | api-core concurrencia | verde 3/27 | verde 3/27 | — | — | **igual** |

Detalle por archivo de `db` (los 260 preexistentes se conservan; los 3 archivos modificados por la corrida pasan): `migracion-0013` 14, `migracion-0016` 12, `migracion-0018` 15, `esquema-drizzle` 3, y el nuevo `migracion-0020-base-multicategoria` **20**; resto sin cambios. Total 26 archivos / 280 tests, todos verdes.

## Salida por comando

### 1. `npx -y pnpm@12.4.1 lint` — exit 1, 4 s

```
Checked 494 files in 572ms. No fixes applied.
Found 1 error.
Found 6 warnings.
```
Diagnósticos (idénticos a FB; ninguno en `packages/db` ni `scripts`):
```
ContextosySkills\hooks\contexto.mjs                      format (el 1 error)
ContextosySkills\hooks\contexto.mjs:42:17 / :43:13 / :45:14 / :45:55 / :49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3    lint/style/noDescendingSpecificity
```
(494 archivos vs 493 en FB: +1 por el nuevo `migracion-0020-base-multicategoria.test.ts`.)

### 2. `turbo run typecheck --filter=...db --concurrency=1` — exit 0, 22 s

```
Packages in scope: api-core, db, geo-service, geodata-etl
contracts:build: cache hit
db:build / db:typecheck / api-core:typecheck / geodata-etl:typecheck / geo-service:typecheck: cache miss, executing
Tasks: 6 successful, 6 total · Cached: 1 cached
```

### 3. `turbo run test --filter=...db --concurrency=1` — exit 0, 353 s

```
api-core:test:  Test Files  32 passed | 2 skipped (34)
api-core:test:        Tests  405 passed | 11 skipped (416)
Tasks: 6 successful, 6 total · Cached: 2 cached
```
(db/geo-service/geodata-etl re-ejecutados; sus conteos se confirman en #8/#14/#15.)

### 4. `turbo run build --filter=...db --concurrency=1` — exit 0, 16 s

```
contracts:build / db:build: cache hit
api-core:build / geodata-etl:build / geo-service:build: cache miss, executing ($ tsc -p tsconfig.build.json)
Tasks: 5 successful, 5 total
```

### 5. `secretos` — exit 0, 4 s
```
[secretos] sin hallazgos
```

### 6. grep secretos en archivos sin seguimiento — exit 0
148 coincidencias (FB 142; +6 por archivos nuevos de la corrida). La única en la carpeta designada está en `packages/db/test/migracion-0020-base-multicategoria.test.ts:83` → `INSERT INTO usuario (email, nombre, rol, password_hash)` (nombre de columna, no un valor). El auditor revisa el resto.

### 8. `--filter db test` — exit 0, 111 s
```
Test Files  26 passed (26)
      Tests  280 passed (280)
```

### 11. PostgreSQL real (cuota/fotos-concurrencia) — exit 0, 15 s
```
Test Files  2 passed (2)
      Tests  9 passed (9)
```
`DATABASE_URL` apunta a `curichi` y **no se toca** (los tests derivan su propia base efímera de `…/postgres`).

### 12. Base efímera `curichi_sdd_base_multicategoria` — exit 0

```
createdb                → EXIT 0
db:migrate #1           → aplicadas 0001..0020 (20), omitidas 0, 1014 ms
db:migrate #2           → "ninguna (al día)", omitidas 20
privilegios             → "privilegios correctos: curichi_api y curichi_geo … migraciones 0008, 0009, 0014, 0016 y 0020"
vista reporte_inundacion→ relkind = v  |  reloptions = security_invoker=true,check_option=cascaded
reversa (psql -v ON_ERROR_STOP=1)  → EXIT 0; luego: reporte_inundacion=r (tabla), reporte=0, categoria=0, cupo_contador=0, fila 0020 en _migraciones=0
db:migrate (tras reversa)→ aplicadas ["0020_base_multicategoria.sql"], omitidas 19 ; reporte_inundacion vuelve a v (vista)
dropdb                  → EXIT 0 ; no queda ninguna curichi_sdd_* (solo curichi y curichi_revision, intactas)
```
(FB registraba la cadena sin la 0020; aquí además se verifican vista y reversa, todo verde.)

### 14. `turbo run test --filter=...geo-service` — exit 0, 4 s (cache hit)
```
geo-service:test:  Test Files  5 passed (5)   Tests  61 passed (61)
  (incluye plan-agregados.test.ts — el del Index Only Scan recreado en la 0020)
Time: 79ms >>> FULL TURBO
```

### 15. `geodata-etl test` — exit 0, 33 s → `Test Files 3 passed / Tests 21 passed`
### 16. puntos-criticos — exit 0, 24 s → `Test Files 3 passed / Tests 20 passed`
### 19. api-core privacidad — exit 0, 29 s → `Test Files 6 passed / Tests 90 passed` (`exportacion` pasó, sin intermitencia)
### 20. contracts jitter — exit 0, 4 s → `Test Files 1 passed / Tests 4 passed`
### 22. api-core seguridad — exit 0, 31 s → `Test Files 9 passed / Tests 152 passed`
### 26. api-core concurrencia — exit 0, 24 s → `Test Files 3 passed / Tests 27 passed`

### 24. `audit --audit-level high` — exit 1, 6 s
```
14 vulnerabilities found
Severity: 1 low | 10 moderate | 3 high
high  source-map-js (…postcss>source-map-js, 22 paths en apps/services)
high  sharp         (CVE-2026-96889 ; apps__*>next>sharp, services__api-core>sharp)
high  next          (SSRF in Image Optimization ; apps__web-ciudadano>next, apps__panel-admin>next)
```
Las mismas 3 high de FB; deps de apps/services (el audit escanea todo el workspace, no respeta `--filter`).

## Integridad del árbol

- `git status --porcelain`: 18 `M` + 27 `??`. Todos los `M`/`??` que **no** son de `archivos.txt` ni de la carpeta de corrida coinciden con los ajenos declarados en `arbol-inicial.txt`.
- sha256 de los 57 archivos sin seguimiento ajenos (fuera de la carpeta de corrida): **idénticos** a `arbol-inicial.txt`. Los 2 únicos que difieren (`docs/arquitectura/14-decisiones-m0-y-plan-m1.md` y `docs/decisiones/0017-cupo-por-categoria-configurable.md`) **están en `archivos.txt`** (documentación M2.6). `docs/decisiones/0023-…md` es archivo nuevo de la corrida (no estaba en FB).
- `git diff --stat` de los 5 archivos `M` de `packages/contracts/` (ajenos de M1): idéntico a `arbol-inicial.txt` (CHANGELOG 66, README 26, package.json 2, src/index.ts 1, contrato-0-16 4). La corrida **no los tocó**.
- Ninguna migración existente cambió (`git diff --diff-filter=MDR` vacío). La reversa vive en `packages/db/migraciones/reversas/` (el migrador no la aplica).

## No verificado

| Comando | Motivo |
|---|---|
| #23 `test/almacen-s3.test.ts` | `S3_SECRET_KEY` no está en el entorno (igual que FB; el matrix condiciona este test a que esté). `.env` la tiene, pero no se exportó para mantener las condiciones de la línea base. |
| #17 E2E `datos-reales.spec.ts` (geo) | El usuario no autorizó la ventana E2E. |
| #21 E2E G1 + `ubicacion-obligatoria` + `ubicacion-aproximada` (privacidad) | El usuario no autorizó la ventana E2E. |
| #25 E2E G1 + `csp` + `camara-foto` (seguridad) | El usuario no autorizó la ventana E2E. |

## Ventana E2E

No autorizada por el usuario (igual que en la línea base). No se levantó ningún servicio ni se tocaron puertos.

## En vivo / Túnel

No aplica: la corrida no tiene bandera `ui`, `api` ni `infra`. No se reconstruyó ninguna imagen; la pila (`postgis` y `minio` healthy) quedó intacta, como se encontró.

---

# Vuelta 1 — reverificación tras las correcciones del auditor y el revisor (2026-10-08)

- **Ejecutado el:** 2026-10-08 ~21:30–21:45 -0400 · **Por:** `sdd-verificador` (modo verificación, F4a vuelta 1) · **Foto:** `refs/sdd/base-multicategoria` = `338e571` · **HEAD:** `3121a0f` · **Rama:** `feat/db/base-multicategoria`
- **Qué cambió respecto de la primera pasada** (diff `scratchpad/vuelta1-m2.diff`): en `0020_base_multicategoria.sql`, `REVOKE EXECUTE … FROM PUBLIC` y `SET search_path = public, pg_temp` en `detalle_inundacion(...)` y `reporte_sincronizar_detalle()`, y `GRANT EXECUTE` de `detalle_inundacion` a `curichi_api`; 4 pruebas nuevas en `migracion-0020-base-multicategoria.test.ts` (db pasa de 280 a **284**); en `geo-service/src/servidor.ts` la comprobación de solo lectura pasa de la vista `reporte_inundacion` a la tabla `reporte` (ampliación autorizada); en `geo-service/test/plan-agregados.test.ts`, `VACUUM ANALYZE reporte` (ampliación autorizada); nombres de tabla al día en `docs/seguridad/modelo-de-seguridad.md`.
- **Condiciones:** RAM libre al inicio **8513 MB** (osciló entre ~7600 y 8513; nunca < 1500; **8506 MB** al final) · procesos pesados ajenos: **0** (el contador dio 4, pero eran 3 `bash.exe` de esta sesión + el propio `powershell.exe` de la consulta, cuya línea de comandos contiene el patrón `vitest|playwright|next…`; ningún `node`/`vitest`/`next`/`tsc` ajeno real) · pila Docker: **`postgis` y `minio` healthy** · `next dev` local: **no** · túneles `cloudflared`: **0** · `--concurrency=1` en `typecheck` y `test`
- **Alcance y opciones iguales a la línea base:** **sí**. Misma lista, mismo alcance (`--filter=...db`), mismas opciones. Esta vuelta corre la lista focalizada que indicó el agente principal (lint, turbo typecheck/test `...db`, bandera `datos` en PostgreSQL real, `secretos` + diff de migraciones, integridad del árbol); las suites de `api-core`/`geo-service`/`geodata-etl`/`db` quedan cubiertas **dentro** de `turbo run test --filter=...db` (ejecución real, no caché).
- **Ruta del repo:** `C:\Users\HP\Desktop\MICURICHI` (la ruta `/a/MICURICHI/MICURICHI` del rol no existe; se usó la real en todo).

## Regresiones

**Ninguna.** Ningún test que estuviera verde en la línea base (ni en la primera pasada) quedó rojo. Ningún verde se perdió: `db` conserva los 260 preexistentes y suma los de la 0020 (24, +4 esta vuelta); `api-core` mantiene 405 passed + 11 skipped; `geo-service` 61; `geodata-etl` 21. Los dos rojos (`lint`, `auditoria`) siguen siendo los mismos preexistentes y ajenos. El `geo-service` se **re-ejecutó** (cache miss), confirmando las dos ampliaciones autorizadas (`reporte` en la comprobación de solo lectura y en el `VACUUM ANALYZE`).

## Resultado por comando (Vuelta 1)

| # | Comando | Bandera | Exit | Dur | Veredicto | vs línea base |
|---|---|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` | base | 1 | 3 s | **rojo** (preexistente; archivos ajenos) | **igual** (494 archivos: +1 por `migracion-0020…test.ts`; 1 error + 6 warnings idénticos, ninguno en `packages/db`/`geo-service`/`scripts`) |
| 2 | `turbo run typecheck --filter=...db --concurrency=1` | base | 0 | 13 s | verde (6/6; db/api-core/geo/etl re-ejecutados, contracts cache hit) | **igual** |
| 3 | `turbo run test --filter=...db --concurrency=1` | base | 0 | 200 s | verde (6/6; **todo re-ejecutado**, solo `contracts:build`/`db:build` cache hit) | ver detalle abajo |
| 4a | PG real: `--filter api-core exec vitest run test/cuota-concurrencia-pg … fotos-cuota-concurrencia-pg` | datos / concurrencia | 0 | 9 s | verde (2 files / 9 tests; `DATABASE_URL`→`/curichi`, no se tocó) | **igual** (2/9) |
| 4b | base efímera `curichi_sdd_m2_v1`: createdb · migrate ×2 · privilegios · ACL de funciones · INSERT por la vista como `curichi_api` · reversa · migrate · dropdb | datos | 0 | ~15 s | verde (detalle abajo) | **igual + chequeos nuevos de F4 (ACL, search_path, INSERT, reversa)** |
| 5a | `npx -y pnpm@12.4.1 secretos` | base | 0 | 2 s | verde (`sin hallazgos`) | **igual** |
| 5b | `git diff --name-only --diff-filter=MDR refs/sdd/base-multicategoria -- packages/db/migraciones` | datos | 0 | <1 s | verde (vacío; ninguna migración existente cambió) | **igual** |
| 6 | `git status --porcelain` vs `arbol-inicial.txt` | — | 0 | <1 s | verde (ver «Integridad del árbol») | **igual** |

Filas sin bandera de arranque (`ui`/`api`/`infra`) y ventanas E2E: **no aplican / no autorizadas**, igual que en la línea base y la primera pasada. `test/almacen-s3.test.ts` sigue **no verificado** (`S3_SECRET_KEY` no se exportó, para mantener las condiciones de la línea base). `auditoria` (`pnpm audit --audit-level high`) no se corrió en esta vuelta focalizada; en la primera pasada quedó **rojo preexistente** (14 vulnerabilidades, mismas 3 high de deps de apps/services), sin cambio posible por este diff (no toca dependencias).

### 3. `turbo run test --filter=...db` — detalle (exit 0, 200 s)

```
contracts:build: cache hit · db:build: cache hit
db:test:          cache miss, executing →  Test Files 26 passed (26) · Tests 284 passed (284)
api-core:test:    cache miss, executing →  Test Files 32 passed | 2 skipped (34) · Tests 405 passed | 11 skipped (416)
geo-service:test: cache miss, executing →  Test Files 5 passed (5)   · Tests 61 passed (61)
geodata-etl:test: cache miss, executing →  Test Files 3 passed (3)   · Tests 21 passed (21)
Tasks: 6 successful, 6 total
```

- `geo-service` salió de **cache miss** (ejecución real, 61/61): no hizo falta el `--filter geo-service exec vitest run` de respaldo.
- Comparación `db`: línea base **25 archivos / 260** → ahora **26 / 284**. Los 260 preexistentes se conservan verdes; el archivo nuevo `migracion-0020-base-multicategoria.test.ts` aporta **24** (eran 20 en la primera pasada; +4 esta vuelta). Sin verdes perdidos, sin rojos nuevos.
- `api-core` 405+11, `geo-service` 61, `geodata-etl` 21: **idénticos** a la línea base y a la primera pasada.

### 4b. Base efímera `curichi_sdd_m2_v1` — detalle (todo exit 0)

```
createdb                → EXIT 0
db:migrate #1           → aplicadas 0001..0020 (20), omitidas 0, 673 ms
db:migrate #2           → "ninguna (al día)", omitidas 20
privilegios             → "privilegios correctos: curichi_api y curichi_geo … 0008, 0009, 0014, 0016 y 0020"
pg_proc (ACL/config)    → detalle_inundacion:          proacl {curichi=X/curichi, curichi_api=X/curichi}  proconfig {search_path=public, pg_temp}
                           reporte_sincronizar_detalle: proacl {curichi=X/curichi}                        proconfig {search_path=public, pg_temp}
                           → sin entrada PUBLIC (=X/) en ninguna; detalle_inundacion con curichi_api=X; ambos search_path fijo. COINCIDE con lo esperado.
INSERT por la vista (SET ROLE curichi_api) → current_user=curichi_api; categoria=inundacion; detalle_version=1;
                           detalle={"frecuencia":"ocasional","causa_presunta":"desconocida","profundidad_estimada":"rodilla"} (armado por el disparador; sumidero NULL omitido)
reversa (psql -v ON_ERROR_STOP=1, como owner) → EXIT 0, COMMIT; luego: reporte_inundacion.relkind=r (tabla), reporte=<nula>, categoria=<nula>, cupo_contador=<nula>, fila 0020 en _migraciones=0
db:migrate (tras reversa)→ aplicadas ["0020_base_multicategoria.sql"], omitidas 19 ; reporte_inundacion vuelve a relkind=v (vista), reporte=tabla
dropdb                  → EXIT 0 ; en el clúster quedan solo `curichi` y `curichi_revision` (intactas); ningún `curichi_sdd_m2_*`
```

Las bases efímeras de los tests de 4a (`curichi_cuota_*`, `curichi_fotos_*`) se crean y se borran solas; `curichi` y `curichi_revision` no se tocaron. No se imprimió ningún valor de `.env`.

## Integridad del árbol (Vuelta 1)

- `git status --porcelain` menos `arbol-inicial.txt`: 18 líneas añadidas (14 `M` + 4 `??`), **todas** declaradas en `archivos.txt` (o dentro de la carpeta nueva `packages/db/migraciones/reversas/`, cuyo único contenido es `0020_base_multicategoria_reversa.sql`, también en `archivos.txt`). Nada en `arbol-inicial.txt` desapareció.
- Ningún archivo suelto: no hay untracked bajo `packages/db/` fuera de `archivos.txt`, ni modificados fuera de `archivos.txt`; **ninguna sonda** quedó en el árbol (todo el trabajo de base se hizo en la base efímera y por `psql`, sin escribir archivos).
- `git diff --diff-filter=MDR` de `packages/db/migraciones` vacío: ninguna migración existente cambió; la reversa vive en `migraciones/reversas/` (el runner no la aplica).

## Ventana E2E / En vivo / Túnel (Vuelta 1)

Sin cambios: ninguna bandera `ui`/`api`/`infra`; ventana E2E no autorizada. No se levantó ningún servicio, no se reconstruyó ninguna imagen, no se abrieron túneles. La pila (`postgis` y `minio` healthy) quedó intacta.
