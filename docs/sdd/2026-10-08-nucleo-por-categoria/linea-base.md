# Línea base — Núcleo consciente de la categoría (M3a, lecturas por categoría)

- **Corrida:** `docs/sdd/2026-10-08-nucleo-por-categoria/` · **Medida el:** 2026-10-08 ~21:30 a 2026-10-09 ~02:00 -0400 · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/nucleo-por-categoria` = `31eb538` (commit WIP `WIP on feat/api-core/nucleo-por-categoria: 3121a0f …`, captura el árbol de trabajo tal cual) · **HEAD:** `3121a0f` · **Rama:** `feat/api-core/nucleo-por-categoria`
- **Banderas:** `base`, `contrato`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia`, `api` · **Alcance:** `--filter=...contracts` · **paquetes que entran (7):** `contracts`, `db`, `api-core`, `geo-service`, `geodata-etl`, **`panel-admin`** y **`web-ciudadano`** (las apps SÍ entran esta vez, a diferencia de la corrida M2 `base-multicategoria` que usó `...db`); `e2e` **no** entra. El `build` de las apps (`next build`) resultó **cache HIT** (no se re-ejecutó ningún `next build`); los `tsc` de `api-core`/`geo-service`/`geodata-etl` fueron MISS y se ejecutaron reales.
- **Condiciones:** RAM libre al inicio **7921 MB** (osciló 7921–9689; ≥ 1500 en todo momento durante #1–#34). **Hubo un corte por límite de sesión de la API al terminar #34**; Docker se reinició y la pila volvió sola a `healthy`; al retomar la RAM estaba en **~2527 MB** (se vuelve a medir antes de cada grupo E2E, exigiendo 2500). · procesos pesados de otras sesiones: **0** (el comando contó 4, pero eran 3 envoltorios `bash.exe` de esta sesión + el propio `powershell.exe` de la consulta, cuya línea de comandos contiene el patrón `vitest|playwright|next|tsc`; verificado con `Get-CimInstance`: ningún `vitest`/`playwright`/`next`/`tsc` ajeno real) · pila Docker: **`postgis` y `minio` healthy** (perfil `servicios` **abajo**: sin api-core/geo/web/panel/Caddy; puertos 3000–3002 y 3100 libres) · `next dev` local: **no** · túneles `cloudflared`: **0** · `--concurrency=1` en `typecheck`, `test` y `build`
- **Nota de opciones:** la lista es la de la matriz para `base`+banderas activas, con el alcance recibido y `--concurrency=1`; los alias raíz se corren por su paquete (`db:migrate` → `--filter db migrate`, `privilegios` → `--filter db privilegios`, `secretos`, `auditoria`). F4 repite exactamente esta lista, este alcance y estas opciones.
- **Ruta del repo:** la instrucción del rol decía `cd /a/MICURICHI/MICURICHI`, que **no existe**; el repo está en `C:\Users\HP\Desktop\MICURICHI` (`/c/Users/HP/Desktop/MICURICHI`). Se usó esa ruta en todas las llamadas.
- **En vivo (bandera `api`):** **no aplica.** Reconstruir la pila corre el job de migraciones sobre `curichi` (hoy en la 0009), que no se toca → queda **no verificado: requeriría migrar la base del usuario**.
- **Ventana E2E:** **AUTORIZADA por el usuario** para esta corrida (base aparte `curichi_e2e`). Resultados en su sección al pie.

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0: **declararlos y dejarlos**. Todo lo que figura en `git status`/`arbol-inicial.txt` es ajeno a M3a: **M1** (registro de categorías en `packages/contracts/src/categorias/` y `contrato-0-19.test.ts`), **M2** (`0020_base_multicategoria.sql` + su reversa + `migracion-0020-base-multicategoria.test.ts`, y los `M` de `packages/db`, `packages/contracts`, `geo-service`, `scripts/respaldo.mjs`) y la **documentación de M0** (`docs/arquitectura/`, `docs/decisiones/0008…0023`). El árbol de trabajo coincide **byte a byte** con la foto `refs/sdd/nucleo-por-categoria` (`git diff refs/sdd/nucleo-por-categoria` vacío). `sha256` completos de los `??` en `arbol-inicial.txt`.

| Archivo | Estado | sha256 (solo `??`) |
|---|---|---|
| `CLAUDE.md` | `M` | — |
| `docs/decisiones/README.md` | `M` | — |
| `docs/seguridad/modelo-de-seguridad.md` | `M` | — |
| `packages/contracts/{CHANGELOG.md,README.md,package.json,src/index.ts,test/contrato-0-16.test.ts}` | `M` | — |
| `packages/db/{README.md,src/cli/matriz-privilegios.mjs,src/cli/verificar-privilegios.mjs,src/esquema/index.ts,src/geometria-publica.ts,src/mantenimiento.ts}` | `M` | — |
| `packages/db/test/{esquema-drizzle,migracion-0013-distancia-dispositivo,migracion-0016-contraccion,migracion-0018-integridad-moderacion}.test.ts` | `M` | — |
| `scripts/respaldo.mjs` · `services/geo-service/src/servidor.ts` · `services/geo-service/test/plan-agregados.test.ts` | `M` | — |
| `.claude/settings.local.json` · `ContextosySkills/` (6) · `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | `??` | ver `arbol-inicial.txt` |
| `docs/arquitectura/` (24) · `docs/decisiones/0008…0023` (16) · `docs/sdd/2026-10-07…`, `2026-10-08-base-multicategoria/`, `2026-10-08-nucleo-por-categoria/` | `??` | ver `arbol-inicial.txt` |
| `packages/contracts/src/categorias/` (6, M1) · `packages/contracts/test/contrato-0-19.test.ts` (M1) | `??` | ver `arbol-inicial.txt` |
| `packages/db/migraciones/0020_base_multicategoria.sql` · `migraciones/reversas/` · `test/migracion-0020-base-multicategoria.test.ts` (M2) | `??` | ver `arbol-inicial.txt` |

La corrida no edita estos archivos. Si necesita alguno, para y pregunta. Las bases efímeras se crean y se borran; `curichi` y `curichi_revision` no se tocan.

## Resultado por comando

| # | Comando exacto | Bandera | Salida | Duración | Veredicto |
|---|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` (`biome check .`) | base | exit 1; «Found 1 error. Found 6 warnings.» (494 archivos) | 2 s | **rojo** (preexistente; archivos ajenos) |
| 2 | `… exec turbo run typecheck --filter=...contracts --concurrency=1` | base | exit 0; 9/9 tareas, FULL TURBO (incl. `panel-admin`/`web-ciudadano` typecheck) | 3 s | verde (cache hit) |
| 3 | `… exec turbo run test --filter=...contracts --concurrency=1` | base | exit 0; 9/9 FULL TURBO (api-core replayed 32 passed/2 skipped files · 405/11 tests) | 3 s | verde (cache hit) |
| 4 | `… exec turbo run build --filter=...contracts --concurrency=1` | base | exit 0; 7/7 (4 cached incl. apps `next build` replayed; `tsc` MISS reales: api-core, geo-service, geodata-etl) | 11 s | verde |
| 5 | `npx -y pnpm@12.4.1 secretos` | base | exit 0; «[secretos] sin hallazgos» | 2 s | verde |
| 6 | `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN … PRIVATE KEY)" --` | base | exit 0; 164 coincidencias, todas ajenas salvo 1 en carpeta de corrida: `packages/db/test/migracion-0020-…test.ts:83` = `password_hash` (nombre de columna en un INSERT; archivo ajeno M2), ningún valor real | <1 s | verde (revisa el auditor) |
| 7 | sub-comandos de `e2e/` (tsc + playwright --list) | base | — | — | no aplica (la corrida no toca `e2e/`) |
| 8 | `npx -y pnpm@12.4.1 --filter contracts --filter db build` | contrato | exit 0; «contracts: openapi/openapi.yaml y dist/dominio.json generados» + tsc db | 7 s | verde |
| 9 | `cp openapi.yaml antes; --filter contracts build; cmp` | contrato | **idéntico** (regenerar no cambia el OpenAPI); árbol intacto | — | verde |
| 10 | `git diff --name-only refs/sdd/nucleo-por-categoria -- packages/contracts/CHANGELOG.md` | contrato | **vacío** (en FB la corrida aún no tocó el CHANGELOG; en F4 **debe** salir) | <1 s | verde |
| 11 | `… exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | exit 0; 16/16 FULL TURBO (cubre consumidores, apps incluidas) | 4 s | verde (cache hit) |
| 12 | ventana E2E: G1 | contrato | ver sección E2E | — | ver E2E |
| 13 | `npx -y pnpm@12.4.1 --filter db test` | datos | exit 0; **26 files / 284 tests** (ejecución real; sin caída de workers) | 89 s | verde |
| 14 | `git diff --name-only --diff-filter=MDR refs/sdd/nucleo-por-categoria -- packages/db/migraciones` | datos | **vacío** (ninguna migración existente cambió) | <1 s | verde |
| 15 | migración nueva de la corrida (`git ls-files -o --exclude-standard -- packages/db/migraciones`) | datos | **ninguna propia de M3a**; en disco 0001–**0020**; las `??` (`0020_base_multicategoria.sql` + `reversas/0020_…`) son **ajenas (M2)** y traen su `migracion-0020-…test.ts` | <1 s | verde |
| 16 | `export DATABASE_URL=…(.env); DATABASE_URL_PG_REAL="${…%/*}/postgres" --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts test/fotos-cuota-concurrencia-pg.test.ts` | datos/concurrencia | exit 0; 2 files / 9 tests (crean y borran su base; `curichi` **no** se toca) | 9 s | verde |
| 17 | base efímera `curichi_sdd_nucleo_m3a`: `createdb` · `db:migrate` ×2 · `privilegios` · `dropdb` | datos | createdb OK; migrate#1 aplicó 0001–0020; migrate#2 **aplicadas 0 / omitidas 20**; «privilegios correctos: curichi_api y curichi_geo … 0008, 0009, 0014, 0016 **y 0020**»; dropdb OK | ~15 s | verde |
| 18 | observación: nada escribe reportes por SQL fuera de `api-core`/seeds | datos | informativo (en FB no hay edición) | — | verde (informativo) |
| 19 | `… exec turbo run test --filter=...geo-service --concurrency=1` | geo | exit 0; 3/3 FULL TURBO (geo-service 5f/61 replayed) | 2 s | verde (cache hit) |
| 20 | `npx -y pnpm@12.4.1 --filter geodata-etl test` | geo | exit 0; 3 files / 21 tests | 18 s | verde |
| 21 | `… --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts test/puntos-criticos-metrica.test.ts` | geo | exit 0; 3 files / 20 tests | 14 s | verde |
| 22 | ventana E2E: `datos-reales.spec.ts` | geo | ver sección E2E | — | ver E2E |
| 23 | `node scripts/banco-consultas.mjs` | geo | — | — | no se corre (opcional; hoy mide un filtro público viejo, no vale como evidencia) |
| 24 | `… --filter api-core exec vitest run test/privacidad-ubicacion … vista-publica-vs-tecnica … publicacion-diferida … exportacion … ubicacion-dispositivo … ubicacion-aproximada` | privacidad | exit 0; 6 files / 90 tests (`exportacion` pasó, **sin** intermitencia; `DeprecationWarning` de `pg` no es fallo) | 19 s | verde |
| 25 | `npx -y pnpm@12.4.1 --filter contracts exec vitest run test/jitter.test.ts` | privacidad | exit 0; 1 file / 4 tests | 3 s | verde |
| 26 | ventana E2E: G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts` | privacidad | ver sección E2E | — | ver E2E |
| 27 | `… --filter api-core exec vitest run test/seguridad … autenticacion … fotos … fotos-abuso … cuentas-y-cuota … cupo-diario … fotos-cuota … fotos-webp … guarda-disco` | seguridad | exit 0; 9 files / 152 tests | 20 s | verde |
| 28 | `… --filter api-core exec vitest run test/almacen-s3.test.ts` (con credenciales S3 de `.env` exportadas y `S3_ENDPOINT=http://127.0.0.1:9000`) | seguridad | exit 0; 1 file / **11 tests** (incluye la **ida y vuelta real** contra `curichi-minio` healthy; las credenciales de `.env` coinciden con MinIO root) | 3 s | verde |
| 29 | `npx -y pnpm@12.4.1 audit --audit-level high` | seguridad | exit 1; **14 vulnerabilidades** (1 low · 10 moderate · 3 high) | 4 s | **rojo** (preexistente; deps de apps/services) |
| 30 | ventana E2E: G1 + `csp.spec.ts` + `camara-foto.spec.ts` | seguridad | ver sección E2E | — | ver E2E |
| 31 | `… --filter api-core exec vitest run test/idempotencia.test.ts test/pool-conexiones.test.ts test/cupo-diario.test.ts` | concurrencia | exit 0; 3 files / 27 tests | 15 s | verde |
| 32 | PostgreSQL real (= #16, mismo comando) | concurrencia | exit 0; 2 files / 9 tests | (en #16) | verde |
| 33 | `node scripts/banco-concurrencia.mjs` | concurrencia | — | — | no se corre (manda reportes sin sesión ni `dispositivo`; no pasa con el contrato actual) |
| 34 | `… exec turbo run test --filter=...api-core --concurrency=1` | api | exit 0; 3/3 FULL TURBO (api-core 32 passed/2 skipped files · 405/11 tests replayed) | 2 s | verde (cache hit) |
| 35 | ventana E2E: G1 | api | ver sección E2E | — | ver E2E |
| 36 | en vivo: `curl -sk -i https://localhost/api/v1/<ruta>` antes/después | api | — | — | **no verificado: requeriría migrar la base del usuario (`curichi`); el usuario no lo autorizó** |

Veredictos: `verde` · `verde (cache hit)` · `rojo` · `no verificado: <motivo>`.

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

### 1. `npx -y pnpm@12.4.1 lint` (`biome check .`)

1 error + 6 warnings, **todos en archivos ajenos** (fuera de `packages/contracts`, `packages/db`, `services/api-core`, `services/geo-service`):

```
ContextosySkills\hooks\contexto.mjs  format                                → el 1 error
ContextosySkills\hooks\contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3  lint/style/noDescendingSpecificity
```

«Found 1 error. Found 6 warnings.» (494 archivos). Ningún diagnóstico en las carpetas de la corrida. Mismos que la corrida anterior.

### 29. `npx -y pnpm@12.4.1 audit --audit-level high`

14 vulnerabilidades (1 low · 10 moderate · 3 high). Las 3 **high** que hacen fallar el umbral (deps de apps/services; `pnpm audit` escanea todo el lockfile, no respeta `--filter`):

```
high  source-map-js  — event-loop DoS (GHSA-68fv-2mgg-jv7q)  parcheado >=1.2.2   paths incl. apps/web-ciudadano>vitest>vite>postcss>source-map-js
high  sharp          — librsvg CVE-2026-96889 (GHSA-wq5f-xc86-pv6w)  parcheado >=0.35.5   paths: apps/*>next>sharp, services/api-core>sharp
high  next           — SSRF en Image Optimization (GHSA-cjq9-62q9-8jv4)  parcheado >=16.3.8   paths: apps/*>next
```

Son las **mismas 3 high** de las corridas anteriores (`2026-10-07-registro-de-categorias`, `2026-10-08-base-multicategoria`).

### Intermitentes conocidos (NO ocurrieron en esta medición)

- `api-core > test/exportacion.test.ts`: dio timeout por contención en M1; aquí **pasó verde** (en #24, dentro de un set de 6 archivos; y en el replay de #3/#34). En F4, si falla sin contención, es REGRESIÓN.
- Caída de *workers* de la suite de `db` bajo contención: no ocurrió (#13 verde, 26 files/284 tests).

Recuento (sin contar E2E ni en vivo): **26 verdes** (de ellos 6 cache hit: #2, #3, #11, #19, #34 y el build con apps replayed en #4; 2 reales de PostgreSQL #16/#32) · **2 rojos** (`lint` #1, `auditoria` #29; ambos preexistentes y ajenos) · **1 no verificado** (#36 en vivo) · 3 filas «no se corren»/«no aplica» por diseño (#7 e2e no toca, #23 banco-consultas, #33 banco-concurrencia). Las 5 filas de ventana E2E (#12, #22, #26, #30, #35) en su sección.

## Pila en vivo (solo con `ui`, `api` o `infra`; foto sin tocar nada)

No se tomó foto de imágenes/humo/navegador: la bandera `api` no habilita reconstruir la pila (eso corre el job de migraciones sobre `curichi`, que no se toca) y no hay `ui` ni `infra`. Solo se registró que `postgis` y `minio` están `healthy` y el perfil `servicios` está abajo (puertos 3000–3002/3100 libres). El en vivo queda **no verificado: requeriría migrar la base del usuario**.

## E2E sobre el árbol sin tocar (ventana autorizada)

**Preparación (una vez, OK):** `createdb curichi_e2e` · `db:migrate` (0001–0020) · `etl:load -- --version DM_UV_MZ_2025` (capas **reales**: 16 distritos, 576 UV, 27527 manzanas) · `db:seed:samples` con `SEED_*_PASSWORD` = credenciales de `e2e/tests/ayudas.ts` (admin/admin, tecnico/tecnico, vecina/vecina, ejecutivo/ejecutivo → 4 usuarios, 37 reportes, 22 puntos críticos) · `privilegios` en `curichi_e2e`: **correctos** (`curichi_api` y `curichi_geo` tienen los permisos; confirma el `<a confirmar>` de la matriz). `curichi_e2e` **queda** para las verificaciones siguientes. `pila-antes.txt` = `minio running healthy` / `postgis running healthy`. El perfil `servicios` estaba **abajo**, así que el paso de **detener `web-ciudadano`/`panel-admin` NO aplica** (nunca estuvieron arriba por Docker).

**Servicios (`next dev`/`dev` contra `curichi_e2e`, con el entorno de `playwright.config.ts`, en segundo plano):** api-core 3001, geo-service 3002, web-ciudadano 3000 (`next dev --webpack`), panel-admin 3100 (`next dev --webpack`). Arrancaron OK: `curl 127.0.0.1:3001/ready` → `200 {"ok":true,"db":"ok","geo":"ok","fotos":"ok","degradado":false}`; geo `/health` 200; web `/` 200; panel `/login` 200; **login técnico 200** (confirma el seed de `curichi_e2e`).

**Bloqueo de memoria.** Con los 4 servicios residentes, la memoria **disponible** (= `AvailableMBytes` ≈ `FreePhysicalMemory`; sin standby reclamable) se estabilizó en **~800–2150 MB**, por debajo de los **2500 MB** que la matriz exige antes de cada grupo (y por debajo del piso general de 1500 durante las corridas). Esperé/monitoreé varios minutos; no sube (el techo lo fija la propia pila E2E en esta máquina de 16 GB, sin procesos pesados ajenos: 0). Al intentar G1 con ~2050 MB, **cada prueba que lanza navegador falló con `browserType.launch: spawn UNKNOWN`** (fallo inmediato de `CreateProcess` de `chrome.exe`), incluido el reintento automático de Playwright (`retries:1`). Un **canario de una sola prueba de navegador** (`acceso-panel.spec.ts:147`) a **2074 MB** repitió el mismo `spawn UNKNOWN` (4 s). En cambio, las specs **sin navegador** pasan limpio. Conclusión: las specs dependientes de navegador quedan **no verificado: sin memoria para lanzar Chromium**; no son un rojo del código (son fallo de entorno). Al cerrar la pila, la RAM libre volvió a **5189 MB** (los dev servers eran los consumidores).

| Grupo / bandera | Spec | Pasaron | Fallaron / motivo | Veredicto |
|---|---|---|---|---|
| G1 (contrato/api) | `api-contratos.spec.ts` | 14 (sin navegador) | — | **verde** |
| G1 (contrato/api) | `separacion-publica-tecnica.spec.ts` | 7 (sin navegador) | — | **verde** |
| G1 (contrato/api) | `cuenta-ciudadana.spec.ts` | 0 | `browserType.launch: spawn UNKNOWN` (no lanza Chromium) | **no verificado: sin memoria** |
| G1 (contrato/api) | `acceso-panel.spec.ts` | 0 | `browserType.launch: spawn UNKNOWN` (9 tests; reintento incluido; canario `:147` a 2074 MB repitió) | **no verificado: sin memoria** |
| G1 (contrato/api) | `publicacion-diferida.spec.ts` | 0 | `browserType.launch: spawn UNKNOWN` | **no verificado: sin memoria** |
| privacidad | `ubicacion-obligatoria.spec.ts` | — | navegador no lanza (mismo entorno; no se corrió para no golpear la máquina sin memoria) | **no verificado: sin memoria** |
| privacidad | `ubicacion-aproximada.spec.ts` | — | ídem | **no verificado: sin memoria** |
| seguridad | `csp.spec.ts` | — | ídem | **no verificado: sin memoria** |
| seguridad | `camara-foto.spec.ts` | — | ídem | **no verificado: sin memoria** |
| geo/datos | `datos-reales.spec.ts` | — | ídem (capas reales cargadas en `curichi_e2e`) | **no verificado: sin memoria** |

Nota: las dos specs «sin navegador» corridas aisladas dieron **21 passed, exit 0** (10 s), a ~1991 MB. Son la evidencia E2E utilizable de esta línea base para `contrato`/`api`. **En F4, repetir con la pila liberada** (cerrar otras apps / reiniciar para dejar ≥ 2500 MB disponibles con los 4 servicios arriba, o usar el runner `e2e/scripts/correr-local.mjs`) para obtener los grupos de navegador; si siguen sin lanzar Chromium con memoria holgada, sería un hallazgo de entorno, no del código.

**Cierre de la ventana (hecho, siempre):** PID de los 4 servicios terminados (`taskkill //T //F`) y padres `tsx watch` huérfanos también; **puertos 3000–3002/3100 libres**; 0 procesos `node/tsx/next` ni `chrome` de la corrida; `pila-despues.txt` **idéntica** a `pila-antes.txt` (`minio`/`postgis` running healthy); `curichi_e2e` **queda**, `curichi` y `curichi_revision` intactas, sin `curichi_sdd_*`; `cloudflared` 0. Los `next-env.d.ts` que `next dev` tocó se **restauraron** a HEAD y los artefactos `e2e/test-results` y `e2e/playwright-report` se **borraron**: `git diff refs/sdd/nucleo-por-categoria` vacío (árbol trackeado idéntico a la foto). La pila quedó **sana e igual**. (El paso de `curl https://localhost/` del cierre **no aplica**: Caddy/perfil `servicios` estaba abajo desde el inicio.)

## Decisiones de la puerta 1 (las copia el agente principal)

- Rojos que ya estaban: `lint` (#1) y `auditoria` (#29), ambos preexistentes y ajenos → **seguir como conocidos** (F4 compara contra esta lista exacta).
- Ventana E2E: **autorizada y ejecutada**, pero las specs de **navegador** quedaron **no verificado: sin memoria** (`spawn UNKNOWN` de Chromium con ~2050 MB disponibles; techo de la máquina con la pila residente < 2500 exigidos). Las specs **sin navegador** de G1 (`api-contratos`, `separacion-publica-tecnica`) pasaron (21/21). `curichi_e2e` quedó lista para F4. **Pendiente para el agente principal:** decidir si F4 corre los grupos de navegador con la máquina liberada (≥ 2500 MB disponibles con los 4 servicios arriba) o vía `e2e/scripts/correr-local.mjs`.
- En vivo (reconstruir y reemplazar su pila): **no aplica** (requeriría migrar `curichi`) · Migrar `curichi` tras `pg_dump`: **no** · Túnel temporal: no aplica


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

