# Línea base — Escrituras y cupo por categoría (M3b)

- **Corrida:** `docs/sdd/2026-10-09-cupo-por-categoria/` · **Medida el:** 2026-10-09 -0400 · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/cupo-por-categoria` = `d68fe6a` · **HEAD:** `3121a0f` · **Rama:** `feat/api-core/cupo-por-categoria`
- **Banderas:** `base`, `contrato` (consume 0.20.0), `datos`, `privacidad`, `seguridad`, `concurrencia`, `api` · **Alcance:** `--filter=...db` (paquetes que entran: `db`, `api-core`, `geo-service`).
- **Nota de alcance (reuso de M3a):** el código es **byte-idéntico** al de la verificación de M3a (vuelta 1); ver «Demostración». Por eso las filas base/contrato/geo/apps/seguridad/auditoría/E2E se **reutilizan** de `docs/sdd/2026-10-08-nucleo-por-categoria/verificacion.md` (F4a + vuelta 1, 2026-10-09), que corrió con alcance `--filter=...contracts` (**superconjunto** de `...db`: todo lo que depende de `db` también depende de `contracts`). El detalle prueba-por-prueba de la zona de cupo y moderación (api-core, db, PostgreSQL real, privilegios) **se corrió ahora** con `--filter api-core`/`--filter db`. Opciones: `--concurrency=1` en las filas de turbo; las suites aisladas de api-core/db corren en su paquete.
- **Condiciones:** RAM libre al inicio **4112 MB** (bajó a 3962 MB antes de la 1.ª suite; subió a **8482 MB** cuando la otra sesión liberó memoria) · procesos pesados de otras sesiones **0** (el contador de la matriz dio 4 = 3 `bash.exe` de esta sesión + el `powershell.exe` de la propia consulta; `Get-CimInstance` confirmó 0 `vitest`/`playwright`/`next`/`tsc` reales ajenos) · pila Docker **sí** (`postgis` y `minio` **healthy**; perfil `servicios` **abajo**: `api-core`/`geo-service` `exited`, sin proxy ni apps) · `next dev` local **no** (puertos 3000-3002/3100 libres) · túneles `cloudflared` **0** · `--concurrency=1`

## Demostración: el código no cambió desde la verificación de M3a

- `git diff --stat refs/sdd/cupo-por-categoria` (foto M3b `d68fe6a`) → **vacío**: el árbol **trackeado** es idéntico al foto de M3b (0 archivos). `git diff --name-only refs/sdd/cupo-por-categoria -- packages/ services/ apps/ e2e/` → **vacío**.
- `git diff --stat refs/sdd/nucleo-por-categoria` (foto M3a `31eb538`) → **40 archivos, +1723/-187**: coincide con los 40 trackeados que M3a registró en su vuelta 1 (M3a 1.ª pasada +1708/-186 en 39 archivos, +1 archivo y +15 líneas por la corrección autorizada de `e2e/tests/api-contratos.spec.ts` en la vuelta 1).
- **Archivos sin seguimiento de código** (`git ls-files --others --exclude-standard -- packages/ services/ apps/ e2e/`): 19, **todos explicados por M3a**, ninguno nuevo de M3b. `sha256` comparado contra `docs/sdd/2026-10-08-nucleo-por-categoria/arbol-inicial.txt` (pre-M3a) y la lista `archivos.txt` de M3a:
  - **7 idénticos** al `arbol-inicial.txt` (sin cambios desde antes de M3a): `categorias/{inundacion/definicion.ts,resolver.ts,slugs.ts,tipos.ts}`, `contracts/test/contrato-0-19.test.ts`, `db/migraciones/0020_base_multicategoria.sql`, `db/migraciones/reversas/0020_base_multicategoria_reversa.sql`.
  - **3 distintos del `arbol-inicial.txt` pero listados en `archivos.txt` de M3a** (los tocó M3a): `categorias/index.ts`, `categorias/inundacion/esquema.ts`, `db/test/migracion-0020-base-multicategoria.test.ts`.
  - **9 nuevos tras el `arbol-inicial.txt` y listados en `archivos.txt` de M3a** (los creó M3a): `contracts/test/contrato-0-20.test.ts`, `db/migraciones/0021_indice_categoria_creado.sql` (+ reversa), `db/test/migracion-0021-indice-categoria-creado.test.ts`, `db/test/puntos-criticos-categoria.test.ts`, `api-core/src/categorias.ts`, `api-core/test/no-contaminacion-categoria.test.ts`, `geo-service/src/categorias.ts`, `geo-service/test/no-contaminacion-categoria.test.ts`.
- El foto M3b `d68fe6a` **no** incluye los archivos sin seguimiento (son `??` en `git status`); la prueba de que no cambiaron es la clasificación por `sha256` de arriba más el enunciado de la corrida (desde M3a solo se escribió documentación).

**Conclusión:** árbol de código = verificación de M3a (vuelta 1). Reuso válido.

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0 (del plan): **declararlos y dejarlos** — todo el trabajo M0–M3a sin commitear es el estado de partida y lo captura el foto `d68fe6a` (`git diff` trackeado contra el foto = 0).

| Archivo | Estado | Nota |
|---|---|---|
| 40 archivos trackeados (`git diff --name-only refs/sdd/cupo-por-categoria` = **0** contra el foto; vs foto M3a = 40) | `M` | trabajo M0–M3a; idéntico al foto M3b |
| 19 sin seguimiento de código (`packages/`, `services/`) + reversas | `??` | salidas de M0–M3a (ver «Demostración»); ninguno nuevo de M3b |

M3b **sí** editará sus carpetas designadas (`services/api-core/`, `packages/db/` si CA6 lo pide, y la documentación `CLAUDE.md`/READMEs/doc 14). **No** puede tocar `packages/contracts/`, `services/geo-service/`, `apps/*`, `e2e/`, `scripts/`, `infra/` ni la raíz; si necesita alguno, para y pregunta.

## Resultado por comando

Origen: **M3a** = reutilizado de `docs/sdd/2026-10-08-nucleo-por-categoria/verificacion.md` (F4a + vuelta 1, 2026-10-09; código idéntico). **ahora** = corrido en esta línea base.

| # | Comando exacto | Bandera | Origen | Salida | Dur. | Veredicto |
|---|---|---|---|---|---|---|
| 1 | `pnpm lint` (`biome check .`) | base | M3a #1 | exit 1 | 5 s | **rojo** (preexistente; ajenos) |
| 2 | `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` | base | M3a #2 | exit 0 (9/9) | 11 s | verde |
| 3 | `pnpm exec turbo run test --filter=...contracts --concurrency=1` | base | M3a #3 | exit 0 (9 tareas; apps web 486, panel 458) | 262 s | verde |
| 4 | `pnpm exec turbo run build --filter=...contracts --concurrency=1` | base | M3a #4 | exit 0 (7/7) | 57 s | verde |
| 5 | `pnpm secretos` | base | M3a #5 | exit 0 «sin hallazgos» | 5 s | verde |
| 6 | grep secretos en archivos sin seguimiento | base | M3a #6 | exit 0 (168 coincid.; única ajena = col `password_hash` en test 0020) | — | verde (revisa el auditor) |
| 8 | `pnpm --filter contracts --filter db build` | contrato | M3a #8 | exit 0 | 9 s | verde |
| 9 | `cp openapi antes; --filter contracts build; cmp` | contrato | M3a #9 | exit 0 (cmp idéntico; determinista) | 7 s | verde |
| 10 | `git diff --name-only refs/sdd/… -- CHANGELOG.md` | contrato | M3a #10 | sale `CHANGELOG.md` | — | verde (sale, como debe) |
| 11 | `pnpm exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | M3a #11 | exit 0 (16/16 FULL TURBO) | 5 s | verde |
| 13 | `pnpm --filter db exec vitest run` | datos | **ahora** | exit 0 · **28 passed (28) · 294 passed (294)** | 112 s | verde |
| 14 | `git diff migraciones existentes` | datos | M3a #14 | vacío | — | verde |
| 15 | migración nueva de la corrida | datos | M3a #15 | 0021 (+ reversa) con su prueba; es la de mayor número | — | verde |
| 16 | PostgreSQL real (`cuota`/`fotos-cuota`-concurrencia-pg) | datos/concurrencia | **ahora** | exit 0 · **2 passed (2) · 9 passed (9)** | 8 s | verde |
| 17 | base efímera `curichi_sdd_cupo_m3b` (createdb·migrate×2·privilegios·dropdb) | datos | **ahora** | exit 0; privilegios correctos; dropdb OK | — | verde |
| 19 | `pnpm exec turbo run test --filter=...geo-service --concurrency=1` | geo | M3a #19 | exit 0 (6/71 FULL TURBO) | 3 s | verde |
| 20 | `pnpm --filter geodata-etl test` | geo | M3a #20 | exit 0 (3/21) | 24 s | verde |
| 21 | `pnpm --filter db exec vitest run puntos-criticos-{entorno,volumen,metrica}` | geo | M3a #21 | exit 0 (3/20) | 17 s | verde |
| 24 | `pnpm --filter api-core exec vitest run` (privacidad, 6 archivos) | privacidad | M3a #24 | exit 0 (6/94) | 23 s | verde |
| 25 | `pnpm --filter contracts exec vitest run test/jitter.test.ts` | privacidad | M3a #25 | exit 0 (1/4) | 3 s | verde |
| 27 | `pnpm --filter api-core exec vitest run` (seguridad, 9 archivos) | seguridad | M3a #27 | exit 0 (9/152) | 24 s | verde |
| 28 | `pnpm --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | M3a #28 | exit 0 (1/11; con `curichi-minio` healthy) | 3 s | verde |
| 29 | `pnpm audit --audit-level high` | seguridad | M3a #29 | exit 1 (3 high) | 6 s | **rojo** (preexistente; ajenos) |
| 31 | `pnpm --filter api-core exec vitest run idempotencia/pool/cupo-diario` | concurrencia | M3a #31 | exit 0 (3/27) | 19 s | verde |
| 34 | `pnpm exec turbo run test --filter=...api-core --concurrency=1` | api | M3a #34 | exit 0 (FULL TURBO) | 3 s | verde |
| D1 | `pnpm --filter api-core exec vitest run` (suite completa) | api/detalle | **ahora** | exit 0 (en el **reintento**) · **33 passed \| 2 skipped (35) · 422 passed \| 11 skipped (433)** | 77 s | verde (1 `intermitente`: ver nota) |

### Detalle prueba-por-prueba de la zona de cupo y moderación (corrido ahora, aislado, `--reporter=verbose`)

Todos `--filter api-core exec vitest run test/<archivo> --reporter=verbose`, cada uno en su propio proceso:

| Archivo | Tests | Veredicto |
|---|---|---|
| `test/cupo-diario.test.ts` | **13 passed (13)** | verde |
| `test/cuentas-y-cuota.test.ts` | **26 passed (26)** | verde |
| `test/fotos-cuota.test.ts` | **10 passed (10)** | verde |
| `test/publicacion-diferida.test.ts` | **22 passed (22)** | verde |
| `test/moderacion.test.ts` | **11 passed (11)** | verde |
| `test/reportes.test.ts` | **20 passed (20)** | verde |
| `test/idempotencia.test.ts` | **11 passed (11)** | verde |
| `test/autenticacion.test.ts` | **16 passed (16)** | verde |

**129 tests, todos verdes.** Nombres por archivo (para que F4 compare test por test):

- **cupo-diario** (13): `3 reportes por cuenta y por día > los tres primeros entran y el 4.º da 429 hasta la medianoche local` · `… el cupo es de la cuenta: la de al lado sigue pudiendo` · `… una fila de ayer no bloquea hoy` · `… un replay idempotente no gasta turno` · `… FOTOS_INVALIDAS devuelve el turno` · `… cambiar de IP no da más turnos` · `el día es el de la ciudad… > 23:59 y 00:01 locales caen en días distintos` · `… cupoDelDia cuenta solo el día local` · `idempotencia ligada a la cuenta > la misma clave en dos cuentas crea dos reportes` · `… una clave vieja sin prefijo no rompe nada` · `/auth/yo: cuántos quedan hoy > reportes_restantes_hoy baja… y puede_reportar_desde es la medianoche al agotarse` · `tope diario de altas por IP > la 11.ª alta del día desde una IP da 429` · `… las altas de ayer no cuentan para hoy`.
- **cuentas-y-cuota** (26): `crear un reporte exige sesión; ver el mapa no` (5: 401 sin sesión · mapa abierto · se crea y autor de la sesión · logout corta · login invalida la cookie) · `el autor lo decide el servidor…` (3: ningún alias de autor · campos del servidor no fijables · prototipo contaminado) · `cupo diario por cuenta` (2: 4.º da 429 con Retry-After · simultáneos con claves distintas dejan un solo reporte) · `alta de cuenta ciudadana` (12: crea y permite entrar · siempre ciudadano · no abre puerta técnica · no dice si el correo existía · tampoco delata técnicas · normaliza el correo · rechaza contraseñas cortas/correos/nombres · acepta tildes/ñ/emoji · frena la creación en masa por IP · probar correos existentes consume cupo · tope de ráfaga antes del cuerpo · arranca con todo el cupo · /auth/yo no devuelve lo ajeno) · `tener cuenta de ciudadano no acerca a la vista técnica (A-01)` (3: listado idéntico con/sin cookie · ni los propios con coordenada exacta · no revela quién reportó).
- **fotos-cuota** (10): `autoría de la foto` (3: guarda qué cuenta subió · un reporte no reclama foto ajena · foto sin autor no se adjunta) · `cupo de 12 fotos por día y por cuenta` (7: 13.ª es 429 con Retry-After · 13.ª aun borrando huérfanas · las de ayer no cuentan · es de la cuenta · sin cupo no lee ni procesa · devuelve el turno si no se guarda · simultáneas no pasan del tope).
- **publicacion-diferida** (22): `la demora la decide el servidor` (5) · `mientras espera no lo ve nadie más que su autor (tabla)` (4) · `la dimensión categoría en la tabla de visibilidad (M3)` (4: bache por defecto fuera de público · inactiva/`todas` dan 400 CATEGORIA_NO_DISPONIBLE · panel `todas`/slug inactivo traen el bache · slug desconocido 400 FILTROS_INVALIDOS) · `duplicado y retiro de verificados` (3) · `GET /mis-reportes` (3) · `métrica de la bandeja sin verificar` (1) · `REPORTE_DEMORA_*` (2).
- **moderacion** (11): `fusión: un reporte nunca queda duplicado de sí mismo` (3) · `fusión: el canónico se bloquea y tiene que seguir validado` (3) · `fusión en cadena: X→B y después B→C` (2: reapunta a C con auditoría · **fusionar con ID corto de 8 caracteres resuelve el UUID canónico**) · `si el recálculo de puntos críticos falla, la moderación no` (3).
- **reportes** (20): `camino crítico: crear → resolver UV → severidad → nuevo` (7) · `validación, cobertura, privacidad y exportación` (7: payloads inválidos/honeypot · fuera de cobertura 422 · degrada precisión en vivienda · exporta GeoJSON/CSV con nota solo técnicos · indicadores/capas técnicos, activar admin · rate limit · login inválido y logout) · `fotos asociadas al reporte` (4) · `login: no delata qué cuentas existen` (1) · `exportación CSV: contenido del vecino` (1: neutraliza `=` de Excel).
- **idempotencia** (11): sin clave dos reportes · reintento devuelve el mismo · 2 simultáneos un solo reporte · 50 simultáneos un solo reporte · misma clave otro contenido se rechaza · claves distintas distintos · caducada vuelve a crear · formato inaceptable rechazado · rechazado no deja la clave ocupada · huella no depende del orden · huella cambia con cualquier valor.
- **autenticacion** (16): `freno de fuerza bruta por cuenta` (5) · `migración de hashes scrypt a Argon2id` (1) · `caducidad de sesión` (6, incl. sondeo valida sin renovar) · `privacidad de la IP` (2) · `el login no tiene atajos de contraseña` (2: admin entra con su contraseña real · los atajos ya no entran: 401).

Veredictos: `verde` · `verde (cache hit)` · `verde (imagen Docker al día)` · `rojo` · `no verificado: <motivo>` (los que exigen permiso, hasta la puerta 1: `pendiente de permiso`).

### Nota del intermitente (D1)

La **primera** ejecución de la suite completa de api-core terminó con exit ≠ 0 por un **`Worker exited unexpectedly` / `Worker forks emitted error`** (un solo fork cayó): reportó `32 passed | 2 skipped (35) · 416 passed | 11 skipped (433)` (6 tests del archivo del worker caído sin contar). Es la **caída de workers** anotada como intermitente conocido. Reintento de la suite completa (rule 4, con RAM 8482 MB): **limpio**, `33 passed | 2 skipped (35) · 422 passed | 11 skipped (433)`, idéntico a M3a. Clasificado **`intermitente`** (entorno, no código). Las 8 suites aisladas de arriba —que cubren la zona de cupo y moderación— pasaron todas a la primera.

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

### 1. `pnpm lint` (`biome check .`) — exit 1

«Found 1 error. Found 6 warnings.» Todos en archivos **ajenos** a la corrida (nada en `api-core`, `db`, `contracts`, `geo-service`):

```
ContextosySkills\hooks\contexto.mjs                     format            (= el 1 error)
ContextosySkills\hooks\contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3  lint/style/noDescendingSpecificity
```

### 29. `pnpm audit --audit-level high` — exit 1

3 **high** (de deps de apps/services; `pnpm audit` escanea todo el lockfile):

```
high  source-map-js  — event-loop DoS
high  sharp          — librsvg CVE-2026-96889
high  next           — SSRF en Image Optimization
```

Recuento: **23 verdes** (incluye D1 tras reintento) · **2 rojos preexistentes ajenos** (lint, auditoría) · **no verificados:** specs E2E de navegador (Chromium no arranca) y la foto en vivo de la pila (ver abajo).

## Pila en vivo (foto sin tocar nada; bandera `api`)

Perfil `servicios` **abajo** en esta máquina (igual que en M3a). No se reconstruye ni se levanta nada (el plan y la puerta 1 dejan el «en vivo» **fuera**: reconstruir correría el job de migraciones sobre `curichi`).

| Servicio | Estado | Imagen `mi-curichi-<svc>:local` |
|---|---|---|
| `postgis` | running **healthy** (`127.0.0.1:5432`) | — |
| `minio` | running **healthy** (`127.0.0.1:9000-9001`) | — |
| `api-core` | **exited** | **no existe** `mi-curichi-api-core:local` |
| `geo-service` | **exited** | — |
| `proxy` (Caddy) | **no está** | — |

| Comprobación | Resultado |
|---|---|
| `curl -sk https://localhost/` | `000` — sin respuesta (Caddy/apps no arriba) → **no aplica en línea base** |
| Reconstrucción / en vivo | **pendiente de permiso** (y el plan lo deja fuera: migraría `curichi`) |

## E2E sobre el árbol sin tocar (ventana autorizada; reutilizada de M3a)

No se levanta la ventana en esta línea base (indicación de la corrida). Reutilizada de M3a (vuelta 1, 2026-10-09, misma base `curichi_e2e` en 0021, código idéntico):

| Grupo | Specs | Pasaron | Fallaron (lista exacta) | Veredicto |
|---|---|---|---|---|
| G1 | `api-contratos.spec.ts` | 14/14 | — | verde (reutilizado M3a vuelta 1) |
| G1 | `separacion-publica-tecnica.spec.ts` | 7/7 | — | verde (reutilizado M3a vuelta 1) |
| G1 resto + `ubicacion-obligatoria`, `ubicacion-aproximada`, `csp`, `camara-foto`, `datos-reales` | de navegador | — | `browserType.launch: spawn UNKNOWN` | **no verificado: Chromium no arranca** (entorno; diagnóstico aparte, no tocado) |

## Decisiones de la puerta 1 (las copia el agente principal)

- Rojos que ya estaban: **lint** (ajenos) y **auditoría** (3 high) → seguir como conocidos.
- Ventana E2E: autorizada, pero las de navegador quedan **no verificado: Chromium no arranca**; las dos sin navegador (`api-contratos` 14/14, `separacion-publica-tecnica` 7/7) se reutilizan de M3a.
- En vivo (reconstruir y reemplazar su pila): **no aplica** (migraría `curichi`).
- Migrar `curichi` tras `pg_dump`: **no**. Túnel temporal: **no aplica**.
