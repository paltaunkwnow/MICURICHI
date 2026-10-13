# Línea base — Base multicategoría (expansión M2)

- **Corrida:** `docs/sdd/2026-10-08-base-multicategoria/` · **Medida el:** 2026-10-08 ~06:45–07:27 -0400 · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/base-multicategoria` = `338e571` · **HEAD:** `3121a0f` · **Rama:** `feat/db/base-multicategoria`
- **Banderas:** `base`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia` · **Alcance:** `--filter=...db` (dependientes reales de `db`: `db`, `api-core`, `geo-service`, `geodata-etl`; `contracts` entra en el grafo de turbo solo como dependencia de build/typecheck de `db`; las apps `web-ciudadano`/`panel-admin` **no** entran, así que no hay `next build`)
- **Condiciones:** RAM libre al inicio **4403 MB** (osciló entre 3872 y 8947 MB; ≥ 1500 en todo momento; **8659 MB** al final) · procesos pesados de otras sesiones: **0** (el comando contó 4, pero eran 3 envoltorios `bash.exe` de esta sesión + el propio `powershell.exe` de la consulta, que contienen el patrón `vitest|playwright|next…` en su línea de comandos; ningún `vitest`/`playwright`/`next`/`tsc` ajeno real) · pila Docker: **`postgis` y `minio` healthy** (perfil `servicios` abajo: sin api-core/geo/web/panel/Caddy) · `next dev` local: **no** (puertos 3000/3100 libres) · túneles `cloudflared`: **0** · `--concurrency=1` en `typecheck`, `test` y `build`
- **Nota de opciones:** `typecheck`, `test` y `build` van con `--concurrency=1` (regla «Orden y memoria» de la matriz; indicación del agente principal). F4 repite exactamente esta lista, este alcance y estas opciones. Los alias raíz se corren por su paquete (`db:migrate` → `--filter db migrate`, `privilegios` → `--filter db privilegios`, `secretos`, `auditoria`), como permite la matriz.
- **Ruta del repo:** la instrucción del rol decía `cd /a/MICURICHI/MICURICHI`, que **no existe** en esta máquina; el repo está en `C:\Users\HP\Desktop\MICURICHI` (`/c/Users/HP/Desktop/MICURICHI`), que es el único que corre. Se usó esa ruta en todas las llamadas.
- **Sin modo en vivo ni foto de pila:** no hay bandera `ui`, `api` ni `infra`. Ventana E2E **no autorizada** por el usuario.

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0: **declararlos y dejarlos**. Todo lo que figura en `git status` es ajeno a M2 (incluye el **M1 sin commitear** en `packages/contracts/`, que el usuario aprobó dejar sin commit, y la **documentación de M0** en `docs/arquitectura/` y `docs/decisiones/`). La única carpeta propia de la corrida es `docs/sdd/2026-10-08-base-multicategoria/` (`plan.md`, `arbol-inicial.txt` y este `linea-base.md`). Detalle y `sha256` completos de los `??` en `arbol-inicial.txt`.

| Archivo | Estado | sha256 (solo `??`) |
|---|---|---|
| `CLAUDE.md` | `M` | — |
| `docs/decisiones/README.md` | `M` | — |
| `packages/contracts/CHANGELOG.md` | `M` | — |
| `packages/contracts/README.md` | `M` | — |
| `packages/contracts/package.json` | `M` | — |
| `packages/contracts/src/index.ts` | `M` | — |
| `packages/contracts/test/contrato-0-16.test.ts` | `M` | — |
| `.claude/settings.local.json` | `??` | ver `arbol-inicial.txt` |
| `ContextosySkills/` (6 archivos) | `??` | ver `arbol-inicial.txt` |
| `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | `??` | `437a68dc…` |
| `docs/arquitectura/` (23 archivos, M0) | `??` | ver `arbol-inicial.txt` |
| `docs/decisiones/0008…0022` (15 ADR) | `??` | ver `arbol-inicial.txt` |
| `docs/sdd/2026-10-07-registro-de-categorias/` (6 archivos) | `??` | ver `arbol-inicial.txt` |
| `packages/contracts/src/categorias/` (6 archivos, M1) | `??` | ver `arbol-inicial.txt` |
| `packages/contracts/test/contrato-0-19.test.ts` (M1) | `??` | `5912ac27…` |

La corrida no edita estos archivos. Si necesita alguno, para y pregunta. **El árbol quedó igual al final:** `git status --porcelain` tras toda la medición coincide byte a byte con `arbol-inicial.txt`; ningún `apps/*/next-env.d.ts` cambió (las apps no entran en `...db` y el `build` fue solo `tsc`, además cache hit). Las bases efímeras creadas y borradas no dejan rastro; `curichi` y `curichi_revision` intactas.

## Resultado por comando

| # | Comando exacto | Bandera | Salida | Duración | Veredicto |
|---|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` (`biome check .`) | base | exit 1; «Found 1 error. Found 6 warnings.» (493 archivos) | 3 s | **rojo** (preexistente; archivos ajenos) |
| 2 | `npx -y pnpm@12.4.1 exec turbo run typecheck --filter=...db --concurrency=1` | base | exit 0; 6/6 tareas, FULL TURBO; scope api-core/db/geo-service/geodata-etl | 2 s | verde (cache hit) |
| 3 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...db --concurrency=1` | base | exit 0; 6/6 tareas, FULL TURBO (logs replayed: db 25f/260, geodata-etl 3f/21, geo-service 5f/61, api-core 32+2skip/405+11skip) | 3 s | verde (cache hit) |
| 4 | `npx -y pnpm@12.4.1 exec turbo run build --filter=...db --concurrency=1` | base | exit 0; 5/5 tareas, FULL TURBO (solo `tsc`; sin apps) | 3 s | verde (cache hit) |
| 5 | `npx -y pnpm@12.4.1 secretos` (`node scripts/buscar-secretos.mjs --todos`) | base | exit 0; «[secretos] sin hallazgos» | 3 s | verde |
| 6 | `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN [A-Z ]*PRIVATE KEY)" --` | base | exit 0; 142 coincidencias, todas en archivos ajenos (ContextosySkills/, docs/arquitectura/, docs/sdd/2026-10-07/); ninguna asignación de valor real | <1 s | verde (revisa el auditor) |
| 7 | sub-comandos de `e2e/` (tsc + playwright --list) | base | — | — | no aplica (la corrida no toca `e2e/`) |
| 8 | `npx -y pnpm@12.4.1 --filter db test` | datos | exit 0; 25 files / 260 tests (ejecución real) | 266 s | verde |
| 9 | `git diff --name-only --diff-filter=MDR refs/sdd/base-multicategoria -- packages/db/migraciones` | datos | vacío (ninguna migración existente cambió) | <1 s | verde |
| 10 | migración nueva de la corrida (`git ls-files -o --exclude-standard -- packages/db/migraciones`) | datos | **ninguna** migración nueva; 19 preexistentes (0001–0019, última `0019_ubicacion_aproximada.sql`); pruebas `migracion-0010…0019-*.test.ts` presentes | <1 s | verde |
| 11 | `export DATABASE_URL="$(sed … .env)"; DATABASE_URL_PG_REAL="${DATABASE_URL%/*}/postgres" … --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts test/fotos-cuota-concurrencia-pg.test.ts` | datos / concurrencia | exit 0; 2 files / 9 tests (crean y borran su base; `DATABASE_URL`→`***/curichi`, no se toca) | 14 s | verde |
| 12 | base efímera `curichi_sdd_base_multicategoria`: `createdb` · `db:migrate` ×2 · `privilegios` · `dropdb` | datos | createdb OK; migrate#1 aplicó 0001–0019; migrate#2 aplicadas 0 / omitidas 19; «privilegios correctos: curichi_api y curichi_geo … 0008, 0009, 0014 y 0016»; dropdb OK | ~12 s | verde |
| 13 | observación: nada escribe reportes por SQL fuera de `api-core`/seeds | datos | informativo (en FB no hay edición) | — | verde (informativo) |
| 14 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...geo-service --concurrency=1` | geo | exit 0; 3/3 tareas, FULL TURBO; geo-service 5f/61 (nadie depende de geo-service como paquete) | 2 s | verde (cache hit) |
| 15 | `npx -y pnpm@12.4.1 --filter geodata-etl test` | geo | exit 0; 3 files / 21 tests | 35 s | verde |
| 16 | `npx -y pnpm@12.4.1 --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts test/puntos-criticos-metrica.test.ts` | geo | exit 0; 3 files / 20 tests | 28 s | verde |
| 17 | ventana E2E: `datos-reales.spec.ts` | geo | — | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 18 | `node scripts/banco-consultas.mjs` | geo | — | — | no se corre (opcional; hoy mide un filtro público viejo, no vale como evidencia) |
| 19 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/privacidad-ubicacion … vista-publica-vs-tecnica … publicacion-diferida … exportacion … ubicacion-dispositivo … ubicacion-aproximada` | privacidad | exit 0; 6 files / 90 tests (`exportacion` pasó, sin intermitencia) | 62 s | verde |
| 20 | `npx -y pnpm@12.4.1 --filter contracts exec vitest run test/jitter.test.ts` | privacidad | exit 0; 1 file / 4 tests | 3 s | verde |
| 21 | ventana E2E: G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts` | privacidad | — | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 22 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/seguridad … autenticacion … fotos … fotos-abuso … cuentas-y-cuota … cupo-diario … fotos-cuota … fotos-webp … guarda-disco` | seguridad | exit 0; 9 files / 152 tests | 66 s | verde |
| 23 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — | — | **no verificado: `S3_SECRET_KEY` no está en el entorno** (`curichi-minio` healthy, pero falta la variable) |
| 24 | `npx -y pnpm@12.4.1 audit --audit-level high` | seguridad | exit 1; 14 vulnerabilidades (1 low · 10 moderate · 3 high) | 4 s | **rojo** (preexistente; deps de apps/services; `audit` escanea todo el workspace) |
| 25 | ventana E2E: G1 + `csp.spec.ts` + `camara-foto.spec.ts` | seguridad | — | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 26 | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/idempotencia.test.ts test/pool-conexiones.test.ts test/cupo-diario.test.ts` | concurrencia | exit 0; 3 files / 27 tests | 35 s | verde |
| 27 | PostgreSQL real (= #11, mismo comando) | concurrencia | exit 0; 2 files / 9 tests | (en #11) | verde |
| 28 | `node scripts/banco-concurrencia.mjs` | concurrencia | — | — | no se corre (manda reportes sin sesión ni `dispositivo`; no pasa con el contrato actual) |

Veredictos: `verde` · `verde (cache hit)` · `rojo` · `no verificado: <motivo>`.

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

### 1. `npx -y pnpm@12.4.1 lint` (`biome check .`)

1 error + 6 warnings, todos en **archivos ajenos** (fuera de `packages/db` y `scripts`):

```
ContextosySkills\hooks\contexto.mjs  format  → el 1 error
ContextosySkills\hooks\contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3  lint/style/noDescendingSpecificity
```

«Found 1 error. Found 6 warnings.» (493 archivos revisados). Ningún diagnóstico en `packages/db` ni en `scripts/`.

### 24. `npx -y pnpm@12.4.1 audit --audit-level high`

14 vulnerabilidades (1 low · 10 moderate · 3 high). Las 3 **high** que hacen fallar el umbral (deps de apps/services y de las toolchains de prueba; `pnpm audit` escanea todo el lockfile, no respeta el `--filter`):

```
high  source-map-js  — event-loop DoS through indexed source-map section offsets  (GHSA-68fv-2mgg-jv7q)  parcheado >=1.2.2   paths incl. packages/db>vitest>vite>postcss>source-map-js, packages/contracts>vitest>…
high  sharp          — Vulnerability in librsvg dependency CVE-2026-96889          (GHSA-wq5f-xc86-pv6w)  parcheado >=0.35.5
high  next           — Server-Side Request Forgery in Image Optimization            (GHSA-cjq9-62q9-8jv4)  parcheado >=16.3.8
```

Son las **mismas 3 high** de la corrida anterior (`2026-10-07-registro-de-categorias`). Además 10 moderate + 1 low por debajo del umbral.

### Intermitente de la corrida anterior (NO ocurrió aquí)

El `api-core > test/exportacion.test.ts > … el límite por defecto es EXPORTAR_MAX_FILAS` que en M1 dio timeout por contención **pasó verde** en esta medición (en #19 dentro de un set de 6 archivos, 1313 ms, y en el log replayed de #3). En F4, si falla sin contención, es REGRESIÓN.

Recuento: **17 verdes** (de los cuales 2 reales de PostgreSQL y 3 cache hit; #27 reusa #11) · **2 rojos** (`lint`, `auditoria`, ambos preexistentes y ajenos) · **4 no verificados** (`almacen-s3` por falta de `S3_SECRET_KEY`; 3 ventanas E2E no autorizadas) · 3 filas «no se corren» por diseño de la matriz (#7 e2e no aplica, #18 banco-consultas, #28 banco-concurrencia).

## Pila en vivo (solo con `ui`, `api` o `infra`; foto sin tocar nada)

No aplica: la corrida no tiene bandera `ui`, `api` ni `infra`. Solo se registró que `postgis` y `minio` están `healthy` y el perfil `servicios` está abajo. Sin foto de imágenes, humo ni navegador.

## E2E sobre el árbol sin tocar (después de la puerta 1, solo con la ventana autorizada)

**No verificado: el usuario no autorizó la ventana E2E.** Grupos/specs que quedarían pendientes por bandera: `geo` → `datos-reales.spec.ts`; `privacidad` → G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts`; `seguridad` → G1 + `csp.spec.ts` + `camara-foto.spec.ts`.

## Decisiones de la puerta 1 (las copia el agente principal)

- Rojos que ya estaban: seguir como conocidos | ampliar la spec | parar
- Ventana E2E: sí/no/no aplica · En vivo (reconstruir y reemplazar su pila): no aplica (sin `ui`/`api`/`infra`)
- Migrar `curichi` tras `pg_dump`: no aplica · Túnel temporal: no aplica
