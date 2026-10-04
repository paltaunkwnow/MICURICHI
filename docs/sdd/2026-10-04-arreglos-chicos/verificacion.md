# Verificación — arreglos chicos (F4a)

- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `geo`, `api`, `ui`, `infra` · **Alcance:** `--filter=...contracts --filter=...db --filter=...api-core --filter=...geo-service --filter=...panel-admin --filter=...web-ciudadano` (7 paquetes en turbo con `geodata-etl` como dependiente de `contracts`)
- **Ejecutado el:** 2026-10-04 ~16:30–17:05 (America/La_Paz) · **Por:** `sdd-verificador` (modo verificación) · **HEAD:** `888bce812cce98c0342d6f56bddddd14de58aefc` · **Foto:** `refs/sdd/arreglos-chicos` = `c9683ad620366535d7fe90d191cfb03f31f9ea0d`
- **Condiciones:** RAM libre **5434 MB al empezar** (3471 MB en el momento más bajo), umbral 1500 MB · procesos pesados ajenos **0** (el conteo crudo dio 4 por autocoincidencia del propio `powershell … -match 'vitest|…'` y sus shells, igual que en la línea base; excluyendo `Get-CimInstance|snapshot|turno.sh` → 0) · `next dev` local **no** (3000/3100/3001/3002 libres) · túneles `cloudflared` **0** · `--concurrency=1`
- **Pila Docker:** daemon **encendido** (docker 29.8.0), pero **todos los contenedores `exited`** (`postgis`, `minio`, `minio-init`, `api-core`, `geo-service`, `migraciones`, `panel-admin`, `proxy`, `web-ciudadano`); `docker ps` vacío; nada escuchando en 5432. **La pila NO está levantada.** Ver «No verificado» y el aviso al final.
- **Convención de ejecución:** cada comando pesado envuelto en `bash "$SCRATCH/turno.sh" <comando>`, `timeout: 600000`. `docker compose config` solo aporta su código de salida (su salida imprime el `.env` con secretos). `PNPM` = `npx -y pnpm@12.4.1`.
- **Diff de la corrida:** `git diff refs/sdd/arreglos-chicos -- $(cat archivos.txt)` + archivos nuevos de `archivos.txt` · **Alcance y opciones iguales a la línea base:** **sí** (misma lista de 38, mismo alcance, mismas opciones).
- **Árbol intacto:** mis builds no dejaron cambios rastreados nuevos; `openapi.yaml` sha antes=después de regenerar (`310c493f37b6083d`). Los únicos rastreados modificados son los de `archivos.txt` más `CLAUDE.md` (ajeno declarado).

## Resumen

| # | Comando | Bandera | Código | Veredicto |
|---|---|---|---|---|
| 1 | `PNPM lint` | base | 0 | verde |
| 2 | `PNPM exec turbo run typecheck SCOPE` | base | 0 | verde |
| 3 | `PNPM exec turbo run test SCOPE --concurrency=1` | base | 0 | verde |
| 4 | `PNPM exec turbo run build SCOPE --concurrency=1` | base | 0 | verde |
| 5 | `PNPM secretos` | base | 0 | verde |
| 6 | grep secretos en no-rastreados | base | 0 | verde (solo auto-coincidencias en `linea-base.md`; sin credenciales) |
| 7 | `PNPM --filter contracts --filter db build` | contrato | 0 | verde |
| 8 | OpenAPI idempotente (`cmp`) | contrato | 0 | verde |
| 9 | `git diff --name-only refs/sdd/arreglos-chicos -- …/CHANGELOG.md` | contrato | 0 | verde (CHANGELOG aparece, como exige F4) |
| 10 | `PNPM exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | 0 | verde (cache hit) |
| 11 | ventana E2E: G1 | contrato | — | no verificado: ventana E2E no autorizada |
| 12 | `PNPM --filter api-core exec vitest run` (privacidad, 5 archivos) | privacidad | 0 | verde |
| 13 | `PNPM --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 | verde |
| 14 | ventana E2E: G1 + `ubicacion-obligatoria.spec.ts` | privacidad | — | no verificado: ventana E2E no autorizada |
| 15 | `PNPM --filter api-core exec vitest run` (seguridad, 9 archivos) | seguridad | 0 | verde |
| 16 | `PNPM --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — | no verificado: `curichi-minio` exited (pila detenida) |
| 17 | `PNPM audit --audit-level high` | seguridad | 0 | verde |
| 18 | ventana E2E: G1 + `csp.spec.ts` + `camara-foto.spec.ts` | seguridad | — | no verificado: ventana E2E no autorizada |
| 19 | `PNPM --filter db test` | datos | 1 → 0 (reintento) | **intermitente** (1 archivo: timeout de hook por contención; pasó solo al reintentar) |
| 20 | `git diff --name-only --diff-filter=MDR refs/sdd/arreglos-chicos -- packages/db/migraciones` | datos | 0 | verde (vacío) |
| 21 | migración nueva (`git ls-files -o … migraciones`) | datos | 0 | verde (`0018_integridad_moderacion.sql` + su test; número > 0017) |
| 22 | PG-real: `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg` | datos | — | no verificado: `postgis` exited (base no disponible) |
| 23 | privilegios en base efímera `curichi_sdd_arreglos_chicos` | datos | — | no verificado: `postgis` exited; no se arranca ni recrea la pila |
| 24 | inspección: escrituras SQL a `reporte_inundacion` | datos | 0 | verde (solo `packages/db/src` y `api-core/src/rutas`; en geo-service solo fixtures de `test/`) |
| 25 | `PNPM exec turbo run test --filter=...geo-service --concurrency=1` | geo | 0 | verde (cache hit) |
| 26 | `PNPM --filter geodata-etl test` | geo | 0 | verde |
| 27 | `PNPM --filter db exec vitest run` (puntos-críticos, 3 archivos) | geo | 0 | verde |
| 28 | ventana E2E: `datos-reales.spec.ts` | geo | — | no verificado: ventana E2E no autorizada |
| 29 | `PNPM exec turbo run test --filter=...api-core --concurrency=1` | api | 0 | verde (cache hit) |
| 30 | ventana E2E: G1 | api | — | no verificado: ventana E2E no autorizada |
| 31 | en vivo: `curl -sk -i https://localhost/api/v1/<ruta>` | api | — | no verificado: en vivo pendiente de permiso |
| 32 | `PNPM exec turbo run test --filter=web-ciudadano --concurrency=1` | ui | 0 | verde (cache hit) |
| 33 | `PNPM exec turbo run test --filter=panel-admin --concurrency=1` | ui | 0 | verde (cache hit) |
| 34 | ventana E2E: pantallas tocadas + G5 | ui | — | no verificado: ventana E2E no autorizada |
| 35 | en vivo: imagen reconstruida + humo + navegador | ui | — | no verificado: en vivo pendiente de permiso |
| 36 | `docker compose --profile servicios --profile minio config --quiet` | infra | 0 | verde (solo código de salida) |
| 37 | ningún servicio salvo `proxy` publica fuera de loopback | infra | 0 | verde (sin salida) |
| 38 | variable de entorno → `.env.example` / `turbo.json` | infra | 0 | verde (`POSTGRES_SHM_SIZE` en `.env.example` con etiqueta; ausente de `turbo.json`, correcto) |

Recuento: **23 verdes** · **1 intermitente** (#19, IMPORTANTE) · **0 rojos** · **14 no verificados** · 0 regresiones.

> **Actualizado en F4b (ver § «En vivo (F4b)» al final).** Con la pila ya levantada y autorizada, de los 14 «no verificados» se resolvieron: **#16, #22, #23 → verde**; **#31/#35 (en vivo)** → humo por el proxy, cabeceras, 404-equivalencia, teselas perezosas y `/ready` **verde**, pero el **navegador integrado quedó no verificado** por el certificado interno de Caddy. Siguen no verificados los de **ventana E2E** (#11,14,18,28,30,34) y la comprobación del auditor **(c)** por el mismo bloqueo de navegador. Desviación: la migración recreó `postgis` (sin daño; ver la sección).

## Comparación con la línea base (`linea-base.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos | Clasificación |
|---|---|---|---|---|---|---|
| 1 | lint | verde · 452 arch · 1 warning | verde · 477 arch · 1 warning | — | — | igual (mismo warning preexistente en docs HTML) |
| 2 | typecheck | verde (cache, 9/9) | verde (9/9, 0 cache, re-ejecutó) | — | — | igual |
| 3 | test SCOPE | verde · 1200 pasan · 11 skip | verde · **1841 pasan · 11 skip** | — | — | mejora (+641 tests nuevos, todos verde; 11 skip = los 2 `*-concurrencia-pg`) |
| 4 | build | verde (cache, 7/7) | verde (7/7, re-ejecutó) | — | — | igual |
| 5 | secretos | verde (sin hallazgos) | verde (sin hallazgos) | — | — | igual |
| 6 | grep no-rastreados | exit 123 (sin coincidencias) | exit 0 (3 líneas) | — | — | igual en lo sustantivo: las 3 coincidencias son el propio `linea-base.md` de la corrida (palabras «secret/token» del texto que documenta el comando y `S3_SECRET_KEY`); **no hay credenciales**. En FB ese archivo aún no existía como no-rastreado |
| 7 | contracts+db build | verde | verde | — | — | igual |
| 8 | OpenAPI idempotente | verde (cmp 0) | verde (cmp 0, sha igual) | — | — | igual |
| 9 | diff CHANGELOG | vacío (FB, esperado) | **CHANGELOG.md aparece** | — | — | esperado en F4 (la corrida tocó contracts) |
| 10 | typecheck+test contracts | verde (cache 16/16) | verde (cache 16/16) | — | — | igual |
| 12 | api-core privacidad | verde · 76 | verde · 76 | — | — | igual |
| 13 | contracts jitter | verde · 4 | verde · 4 | — | — | igual |
| 15 | api-core seguridad | verde · 152 | verde · 152 | — | — | igual |
| 17 | audit | verde · 6 moderate | verde · 6 moderate | — | — | igual |
| 19 | db test | verde · 23 arch · 236 · 0 skip | **1 arch falló en conjunto, resto verde; reintento verde** · 24 arch · 251 | — | — | **intermitente**: `migracion-0015-publicacion.test.ts` → `beforeAll` «seeds sintéticos con la 0015» agotó el hook timeout de 240 s en `crearPglite()` (run 3x más lento, 764 s vs 238 s). El mismo archivo pasó en #3 (db 24/24) y al reintentar aislado (20/20, 54 s). No es regresión |
| 20 | migraciones MDR | vacío | vacío | — | — | igual |
| 21 | migración nueva | vacío (FB) | `0018` + su test | — | — | esperado en F4 (M-3.1/M-3.4) |
| 24 | escrituras reporte_inundacion | solo packages/db | solo `packages/db/src` + `api-core/src/rutas`; geo-service solo `test/` fixtures | — | — | igual (invariante «api-core es el único escritor» intacto) |
| 25 | geo-service test | verde · 57 | verde · 61 (cache de #3) | — | — | mejora (+4 tests) |
| 26 | geodata-etl | verde · 21 | verde · 21 | — | — | igual |
| 27 | db puntos-críticos | verde · 20 | verde · 20 | — | — | igual |
| 29 | api-core turbo test | verde (cache 3/3) | verde (cache 3/3) | — | — | igual |
| 32 | web-ciudadano test | verde (cache 2/2) | verde (cache 2/2) | — | — | igual |
| 33 | panel-admin test | verde (cache 2/2) | verde (cache 2/2) | — | — | igual |
| 36 | compose config | verde (exit 0) | verde (exit 0) | — | — | igual |
| 37 | puertos fuera de loopback | verde (exit 0) | verde (exit 0) | — | — | igual |
| 38 | variable de entorno | exit 1 (`POSTGRES_SHM_SIZE` ausente) | verde (presente + etiqueta en `.env.example`) | — | — | esperado en F4 (M-4.2 cumplida) |
| 11,14,18,28,30,34 | ventana E2E | no verificado (Docker apagado) | no verificado (ventana E2E no autorizada) | — | — | sin cambio de estado |
| 16 | almacen-s3 | no verificado (MinIO) | no verificado (MinIO exited) | — | — | sin cambio |
| 22,23 | PG real / privilegios | no verificado (Docker apagado) | no verificado (postgis exited; no se arranca la pila) | — | — | sin cambio de estado |
| 31,35 | en vivo | no verificado (Docker apagado) | no verificado (en vivo pendiente) | — | — | sin cambio |

**REGRESIONES: ninguna.** **Rojos nuevos: ninguno.** **Verdes perdidos: ninguno.** Único no-verde: #19, clasificado `intermitente` (IMPORTANTE) por timeout de hook atribuible a contención; no hay fallo de aserción y el archivo pasa aislado y dentro de #3.

## Salida por comando (evidencia)

### 1. `PNPM lint`
```
Checked 477 files in 1277ms. No fixes applied.
Found 1 warning.
```
Único warning: `lint/style/noDescendingSpecificity` en `docs/dominio/infografia-plataformas-riesgo.html:128` (archivo sin tocar, fuera de las carpetas designadas). 0 errores, exit 0.

### 2. `PNPM exec turbo run typecheck SCOPE`
```
 Tasks:    9 successful, 9 total
Cached:    0 cached, 9 total
```
Sin `error TS`. Re-ejecutó todo (los paquetes cambiaron).

### 3. `PNPM exec turbo run test SCOPE --concurrency=1`
```
 Tasks:    9 successful, 9 total
Cached:    2 cached, 9 total
  Time:    11m8.017s
```
Por paquete: contracts 16 arch/227 · panel-admin 39/432 · db 24/251 · web-ciudadano 33/458 · api-core 31+2skip/391+11skip · geo-service 5/61 · geodata-etl 3/21 → **1841 passed / 11 skipped / 0 failed**. (11 skip = `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg`, exigen PG real.)

### 4. `PNPM exec turbo run build SCOPE --concurrency=1`
```
 Tasks:    7 successful, 7 total
Cached:    2 cached, 7 total
  Time:    4m18.754s
```
Sin errores. Puertos 3000/3100 libres antes del build (sin `next dev`).

### 5–8, 17. secretos / contracts build / OpenAPI / audit
```
[secretos] sin hallazgos                                  (#5 exit 0)
contracts: openapi/openapi.yaml y dist/dominio.json generados  (#7 exit 0)
#8 cmp exit 0 · sha openapi antes=despues=310c493f37b6083d
6 vulnerabilities found · Severity: 6 moderate             (#17 exit 0, bajo umbral high)
```

### 6. grep secretos en no-rastreados (exit 0)
Las 3 coincidencias son del propio `docs/sdd/2026-10-04-arreglos-chicos/linea-base.md` (texto que cita el comando #6 y menciona `S3_SECRET_KEY`/`secretos`). No hay valores de credenciales. Benigno.

### 10, 25, 29, 32, 33. turbo subsets (cache hit)
```
#10 typecheck test ...contracts : 16 successful / 16 cached
#25 test ...geo-service         : 3 successful / 3 cached
#29 test ...api-core            : 3 successful / 3 cached
#32 test web-ciudadano          : 2 successful / 2 cached
#33 test panel-admin            : 2 successful / 2 cached
```

### 12, 13, 15, 26, 27. vitest directos
```
#12 api-core privacidad : Test Files 5 passed (5)  · Tests 76 passed (76)
#13 contracts jitter    : Test Files 1 passed (1)  · Tests 4 passed (4)
#15 api-core seguridad  : Test Files 9 passed (9)  · Tests 152 passed (152)
#26 geodata-etl         : Test Files 3 passed (3)  · Tests 21 passed (21)
#27 db puntos-críticos  : Test Files 3 passed (3)  · Tests 20 passed (20)
```

### 19. `PNPM --filter db test` — intermitente
Primer intento (exit 1, 776 s):
```
 ❯ test/migracion-0015-publicacion.test.ts (20 tests | 1 skipped) 759621ms
 FAIL  test/migracion-0015-publicacion.test.ts > seeds sintéticos con la 0015
 Error: Hook timed out in 240000ms.
 ❯ test/migracion-0015-publicacion.test.ts:400:3
    400|   beforeAll(async () => {
    401|     db = await crearPglite();
 Test Files  1 failed | 23 passed (24)
      Tests  250 passed | 1 skipped (251)
   Duration  764.88s (…)
```
Reintento aislado del archivo (regla 4, timeout por contención), exit 0, 54 s:
```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```
No es fallo de aserción sino el `beforeAll` que crea PGlite agotando el hook timeout con el equipo saturado (run completo 3x más lento). El mismo archivo pasó dentro de #3 (db 24/24, 251). Clasificación: **intermitente**.

### 20, 21, 24, 36, 37, 38. inspecciones
```
#20 diff MDR migraciones      : vacío
#21 migración nueva           : packages/db/migraciones/0018_integridad_moderacion.sql (y test/migracion-0018-integridad-moderacion.test.ts)
#24 escrituras reporte_inundacion fuera de db/api-core : solo fixtures en services/geo-service/test/*
#36 docker compose config --quiet : exit 0
#37 puertos fuera de loopback     : exit 0, sin salida
#38 POSTGRES_SHM_SIZE en .env.example:63 con comentario; ausente de turbo.json (var solo de Compose)
```

## No verificado

| # | Comando | Motivo |
|---|---|---|
| 11, 14, 18, 28, 30, 34 | ventanas E2E (G1, G5, specs de pantallas, `ubicacion-obligatoria`, `csp`, `camara-foto`, `datos-reales`) | ventana E2E **no autorizada** en esta puerta |
| 16 | `test/almacen-s3.test.ts` | contenedor `minio` **exited**; exige `curichi-minio` healthy + `S3_SECRET_KEY`; no se arranca la pila |
| 22 | `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg` | `postgis` **exited**: base no disponible; no se arranca ni recrea |
| 23 | privilegios en base efímera `curichi_sdd_arreglos_chicos` | `postgis` **exited**: `docker compose exec -T postgis createdb` imposible sin arrancar el contenedor; la regla prohíbe arrancar/recrear `postgis` |
| 31, 35 | en vivo (`curl` por el proxy; imagen reconstruida; navegador) | «en vivo» **pendiente de permiso** |

**Aviso para el agente principal (discrepancia con la consigna):** la tarea indicaba que «Docker Desktop está ENCENDIDO y la pila del usuario está levantada y la está usando». En realidad el daemon está encendido pero **todos los contenedores están `exited`** (la pila no corre). Por eso #16, #22 y #23 —que la consigna esperaba poder verificar ahora con Docker— siguen **no verificados**: no arranco ni recreo `postgis`/`minio` (regla dura). Si se desea cubrirlos, el usuario tendría que levantar la pila (o autorizar arrancarla) y pedir una nueva pasada de esos comandos.

## Ventana E2E
No autorizada en esta puerta. No se tocó `pila-antes.txt` / `pila-despues.txt`.

## En vivo (F4b)

- **Ejecutado el:** 2026-10-04 ~17:30–19:25 (America/La_Paz) · **Por:** `sdd-verificador` (modo en vivo) · **HEAD:** `888bce81…` · **Foto:** `refs/sdd/arreglos-chicos`
- **Permisos de la puerta 1:** actualizar la pila Docker y probarla en vivo **con respaldo de la base** → sí; **migrar `curichi` tras `pg_dump`** → sí; **túnel** → no; **ventana E2E** → no. (Copiados en `linea-base.md` § Decisiones.)
- **Condiciones:** RAM total ~12 GB; libre al empezar ~3555 MB, muy ajustada durante los builds (los contenedores de la pila viva + `vmmemWSL` la dejan a menudo < 1500 MB). Guardrail `turno.sh` (umbral 1500 MB) **sí** frenó dos lanzamientos (geo-service y #23) hasta reclamar memoria. `vmmemWSL` solo libera la caché de build tras `docker builder prune -f`; se prunó entre builds (los layers ya quedaron como imagen). Procesos pesados ajenos: 0. Túneles `cloudflared`: 0.
- **Imágenes guardadas antes:** `mi-curichi-{api-core,geo-service,web-ciudadano,panel-admin}:antes-arreglos-chicos`. No se tocó `proxy` (su contexto no cambió en la corrida).

### DESVIACIÓN IMPORTANTE — `curichi-postgis` se recreó

El paso 5 (`docker compose --profile servicios run --rm migraciones`, comando literal de la consigna) **recreó `curichi-postgis`**: `run` resuelve la dependencia `postgis` y, como el `docker-compose.yml` de la corrida cambió su `shm_size` (deriva entre el contenedor en marcha —64 MiB por defecto— y el archivo —256 MiB—), Compose lo **recreó** para aplicar la config. Esto contradice la regla dura «no recrear postgis». **Sin daño observable:** el volumen `postgis-data` (nombrado) persistió, los datos quedaron intactos (`reportes=41`, `usuarios=442`, `uv=576`, iguales que antes), el bind `./infra/sql → /docker-entrypoint-initdb.d` montó bien (en esta pasada Docker Desktop **sí** montó la carpeta de A:), postgis quedó `healthy` y la 0018 se aplicó. Efecto colateral: el nuevo `shm_size` **quedó aplicado** (`ShmSize=268435456` = 256 MiB), así que lo que la línea base dejaba como «no verificado: requiere recrear postgis» (M-4.1) **ahora está en efecto**. Para evitarlo hubiera hecho falta `run --rm --no-deps migraciones` (postgis ya estaba arrancado); la consigna daba el comando sin `--no-deps`. El `pg_dump` se tomó **antes** de todo esto, así que hay respaldo. Se avisa al agente principal.

### Respaldo y migración

- **`pg_dump` (antes de migrar):** `$SCRATCH/curichi-antes-arreglos-chicos.dump`, **19 268 052 bytes** (~18,4 MB), cabecera `PGDMP` válida, exit 0. Fuera del repo (tiene datos personales).
- **Migración (imagen api-core nueva):** exit 0. Aplicó **`0018_integridad_moderacion.sql`** (`"aplicadas":["0018…"],"omitidas":17`). **NOTICE de filas viejas que violan las CHECK: NO hubo** (las dos CHECK se validaron limpias → `curichi` no tenía filas que las violaran).
- **Verificación en `curichi` (solo lectura):**
  - `motivo_en_rechazo_y_duplicado` → **presente, `convalidated=t`**: `CHECK ((estado <> ALL (ARRAY['rechazado','duplicado'])) OR (estado_motivo IS NOT NULL AND btrim(estado_motivo) <> ''))`.
  - `fusion_solo_en_duplicado` → **presente, `convalidated=t`**: `CHECK ((fusionado_en_id IS NULL) OR (estado = 'duplicado'))`.
  - índice `reporte_estado` → **ausente**; `reporte_estado_creado` → **presente**.
  - `_migraciones` incluye `0018_integridad_moderacion.sql`.

### Reconstrucción y reemplazo

Builds de a uno, `docker compose … build <svc>`, todos **verde (rc=0)**: `api-core` (21:40Z), `geo-service` (21:52Z), `web-ciudadano` (21:58Z, «Compiled successfully»), `panel-admin` (22:00Z, «Compiled successfully»). `migraciones` reusa la imagen de api-core (sin build propio). Reemplazo con `up -d --no-deps api-core geo-service web-ciudadano panel-admin`: **no tocó** postgis/minio/proxy; los 4 contenedores corren las imágenes nuevas; los 7 servicios `healthy`.

### Humo por el proxy (como lo usa el usuario)

| Comprobación | Resultado |
|---|---|
| `GET https://localhost/` | **200** |
| `GET https://localhost/api/v1/configuracion` | **200**, cuerpo `{"ciudad":{"nombre":"Santa Cruz de la Sierra",…}}` |
| `GET https://panel.localhost/login` (`--resolve …:443:127.0.0.1`) | **200** |
| CSP | `script-src 'self' 'nonce-…' 'strict-dynamic'` (con nonce, **sin `unsafe-inline`** en script-src; `style-src` lo conserva, como documenta §13) |
| `X-Content-Type-Options` | `nosniff` presente |
| `x-middleware-*` | **ausentes** (los quita el proxy) |
| `Permissions-Policy` | `geolocation=(self), camera=(self), microphone=(), payment=(), usb=()` |
| `/ready` de api-core (puerto efímero) | `{"ok":true,"db":"ok","geo":"ok","fotos":"ok","degradado":false}` (sin `degradado`) |

### Comprobaciones del auditor

- **(a) oráculo de existencia — VERDE.** Short id de un reporte NO público (`7bbb40cf`, rechazado/duplicado) y uno inexistente (`99999999`) devuelven ambos **404** con cuerpo **byte-idéntico** `{"codigo":"NO_EXISTE","mensaje":"Reporte no encontrado."}`.
- **(b) índice de teselas perezoso — VERDE.** Capas reales cargadas (`distrito_municipal` 16, `unidad_vecinal` 576, `manzana` 27 434, modo teselas, huella `010b7dd8e35cb165`). 1.ª tesela de manzana (fría, arma índice) **0,587 s**; 2.ª/3.ª/4.ª (calientes) **0,078/0,073/0,071 s** (~8×); `GET /geo/v1/capas` **no** arma índice (0,079 s). Teselas 200 con datos (158 KB).
- **(c) bbox de la fusión alineado a la grilla en el log — NO VERIFICADO** (ver «Navegador»): hace falta abrir la fusión en el panel, que el navegador integrado no puede cargar. Cubierto por prueba unitaria (`lib/fusion-cercana.test.ts`, verde en F4a).

### Navegador integrado — NO VERIFICADO (certificado interno)

El proxy local usa **`PROXY_TLS=interno`** (CA propia «Caddy Local Authority»); el navegador integrado **rechaza ese certificado** y la navegación a `https://localhost` y `https://panel.localhost` falla. Las apps Next **no publican puertos** (solo el proxy) y fuerzan HTTPS (`upgrade-insecure-requests` + cookie de sesión `Secure`), así que no hay vía HTTP directa útil (confirmado: el navegador **sí** carga loopback por HTTP plano —`http://127.0.0.1:<efímero>/ready` rindió el JSON—, luego el bloqueo es solo el certificado, no la red). Confiar en esa CA exigiría instalarla en el almacén de confianza del sistema, **prohibido** (reglas de seguridad y CLAUDE.md §13, «ni mkcert ni CA raíz en Windows»). Por eso quedan **no verificadas** por navegador, con sus conductas cubiertas por pruebas unitarias verdes (F4a) y por la E2E (no autorizada):

- panel `tecnico` `/indicadores` (pestañas «Todo»/severidades, filtro «Crítica», números estables) — unit `lib/indicadores-pestanas.test.ts`, `PestanasPorSeveridad.test.ts`.
- panel `/reportes/<nuevo>` (fusión con cercanos y su distancia, sin campo de ID; diálogo «Reporte unitario» con foco/Escape) — unit `CandidatosFusion.test.ts`, `ReporteUnitarioModal.test.ts`, `lib/dialogo.test.ts`.
- panel `ejecutivo` `/ejecutivo` (criterios con fórmula y rangos, sin «motobombas») — unit `CriteriosSeveridad.test.ts`, `PanelEjecutivo.test.ts`.
- web `/crear-cuenta → Ya podés entrar → Iniciar sesión` (correo por `sessionStorage`, URL sin `email`) — unit `lib/correo-para-entrar.test.ts`, `FormularioAcceso.test.ts`.

### Pruebas que en F4a quedaron sin verificar (ahora con pila arriba)

| # | Comando | F4a | Ahora |
|---|---|---|---|
| 22 | `DATABASE_URL_PG_REAL=…/postgres … vitest cuota-concurrencia-pg + fotos-cuota-concurrencia-pg` | no verificado (postgis exited) | **verde** · 2 archivos · **9 tests** · 29,3 s · rc0 (crean y borran su base; no tocan `curichi`) |
| 23 | privilegios en base efímera `curichi_sdd_arreglos_chicos` | no verificado (postgis exited) | **verde** · `createdb` → `db:migrate` (18 aplicadas, incl. 0018) → `db:migrate` otra vez («ninguna, al día», omitidas 18) → `privilegios` **«privilegios correctos: curichi_api y curichi_geo…»** → `dropdb`. Confirma **D7**: en base nueva `privilegios` pasa; el rojo era por la columna `ultimo_reporte_en` vieja de `curichi`. `curichi` intacta tras el `dropdb` (41 reportes) |
| 16 | `vitest test/almacen-s3.test.ts` | no verificado (minio exited) | **verde** · 1 archivo · **11 tests** · 0 omitidos (MinIO `/health/live` 200; ida y vuelta real guarda/lee/borra y `comprobar()` con credenciales buenas/malas) |

### Estado final de la pila (paso 12) — LEVANTADA y SANA

```
minio          running healthy  ghcr.io/coollabsio/minio:RELEASE.2025-10-15…
postgis        running healthy  postgis/postgis:18-3.6   (ShmSize 256 MiB, recreado)
api-core       running healthy  mi-curichi-api-core:local      (2026-10-04T21:40Z)
geo-service    running healthy  mi-curichi-geo-service:local   (2026-10-04T21:52Z)
web-ciudadano  running healthy  mi-curichi-web-ciudadano:local (2026-10-04T21:58Z)
panel-admin    running healthy  mi-curichi-panel-admin:local   (2026-10-04T22:00Z)
proxy          running healthy  mi-curichi-proxy:local
```

No hubo ningún rojo en vivo → **no se revirtió ninguna imagen**; la pila quedó levantada con las imágenes nuevas (no con `:antes-arreglos-chicos`). El `shm_size` quedó aplicado por la recreación no buscada de postgis (ver desviación). Nada se dejó roto.

## Túnel
No aplica (`compartir` no está entre las banderas de esta corrida).
