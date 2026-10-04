# Línea base — arreglos chicos

- **Corrida:** `docs/sdd/2026-10-04-arreglos-chicos/` · **Medida el:** 2026-10-04 ~14:07–14:28 (America/La_Paz) · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/arreglos-chicos` = `c9683ad620366535d7fe90d191cfb03f31f9ea0d` · **HEAD:** `888bce812cce98c0342d6f56bddddd14de58aefc` · **Rama:** `fix/repo/arreglos-chicos`
- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `geo`, `api`, `ui`, `infra`
- **Alcance:** `--filter=...contracts --filter=...db --filter=...api-core --filter=...geo-service --filter=...panel-admin --filter=...web-ciudadano` (paquetes que entran: `contracts`, `db`, `api-core`, `geo-service`, `panel-admin`, `web-ciudadano` y, como dependiente de `contracts`, `geodata-etl` — 7 en el alcance de turbo)
- **Condiciones:** RAM libre **6061 MB al empezar** (4368 MB al terminar), umbral 1500 MB · procesos pesados de otras sesiones: **0** · pila Docker: **no** (daemon apagado) · `next dev` local: **no** · túneles `cloudflared`: **0** · `--concurrency=1`
- **Nota de medición:** el conteo inicial de procesos pesados dio «4», pero era **autocoincidencia**: el propio comando `powershell … -match 'vitest|playwright|next …'` y sus shells `bash` padres llevan ese literal en su línea de comandos. Repetido excluyendo `Get-CimInstance|snapshot-bash` → **0**. No hay suites ajenas corriendo.
- **Toolchain:** Node v24.15.0 · `pnpm` = `npx -y pnpm@12.4.1` (12.4.1) · turbo 2.10.12 · vitest 4.1.11
- **Convención de ejecución:** cada comando pesado se lanzó envuelto en `bash "$SCRATCH/turno.sh" <comando>` (turno exclusivo + ≥1500 MB libres), `timeout: 600000` por llamada. La columna «Comando exacto» es el `<comando>` interno; en F4a se repite idéntica con el mismo envoltorio, alcance y opciones.
- **Abreviaturas (para la tabla):** `PNPM` = `npx -y pnpm@12.4.1` · `SCOPE` = el alcance de arriba · `$SCRATCH` = `…/5d20bc09-1ef2-4cf3-8f53-2a4b6d0e5a08/scratchpad`.

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0: **declararlos y dejarlos**. La corrida no edita estos archivos; si necesita alguno, para y pregunta. Builds de la línea base no dejaron ediciones rastreadas nuevas (openapi.yaml idéntico tras regenerar; `dist/` está en `.gitignore`).

| Archivo | Estado | sha256 (solo `??`) |
|---|---|---|
| `CLAUDE.md` | `M` | — (41 inserciones / 2 borrados sobre la foto) |
| `.claude/agents/trabajador-raiz.md` | `??` | `ebc06a8b53ff04530066ee39f4fee1716c3839b666d70a8a8a7e44084910362b` |
| `docs/sdd/2026-10-04-arreglos-chicos/` (carpeta de la corrida) | `??` | `arbol-inicial.txt`: `ae24724af6d350d65a02317111b00b455c88a0d549fa28610a5e6866f43b0e75` |

## Resultado por comando

Lista numerada = orden de ejecución (banderas en orden: `base` → `contrato` → `privacidad` → `seguridad` → `datos` → `geo` → `api` → `ui` → `infra`). En F4a se repite idéntica.

| # | Comando exacto | Bandera | Salida | Duración | Veredicto |
|---|---|---|---|---|---|
| 1 | `PNPM lint` (= `biome check .`) | base | 0 · 452 archivos · 1 warning preexistente | 9 s | verde |
| 2 | `PNPM exec turbo run typecheck SCOPE` | base | 0 · 9/9 tareas FULL TURBO | 7 s | verde (cache hit) |
| 3 | `PNPM exec turbo run test SCOPE --concurrency=1` | base | 0 · 9/9 tareas (8 cache, api-core corrió) · 1200 pasan, 11 skip | 156 s | verde |
| 4 | `PNPM exec turbo run build SCOPE --concurrency=1` | base | 0 · 7/7 FULL TURBO | 17 s | verde (cache hit) |
| 5 | `PNPM secretos` (= `node scripts/buscar-secretos.mjs --todos`) | base | 0 · «sin hallazgos» | 9 s | verde |
| 6 | `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN [A-Z ]*PRIVATE KEY)" --` | base | 123 (grep corrió, sin coincidencias) | <1 s | verde (sin secretos en no-rastreados) |
| 7 | `PNPM --filter contracts --filter db build` | contrato | 0 · openapi.yaml y dominio.json generados | 18 s | verde |
| 8 | `cp …/openapi.yaml "$SCRATCH/openapi.antes.yaml" && PNPM --filter contracts build && cmp -s "$SCRATCH/openapi.antes.yaml" packages/contracts/openapi/openapi.yaml` | contrato | build 0 · cmp 0 (idéntico tras regenerar) | 7 s | verde |
| 9 | `git diff --name-only refs/sdd/arreglos-chicos -- packages/contracts/CHANGELOG.md` | contrato | vacío | <1 s | verde (FB vacío, esperado; en F4 **debe** salir) |
| 10 | `PNPM exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | 0 · 16/16 FULL TURBO (cubre consumidores) | 6 s | verde (cache hit) |
| 11 | ventana E2E: **G1** | contrato | — | — | no verificado: Docker apagado; ventana E2E no autorizada |
| 12 | `PNPM --filter api-core exec vitest run test/privacidad-ubicacion.test.ts test/vista-publica-vs-tecnica.test.ts test/publicacion-diferida.test.ts test/exportacion.test.ts test/ubicacion-dispositivo.test.ts` | privacidad | 0 · 5 archivos · 76 tests | 41 s | verde |
| 13 | `PNPM --filter contracts exec vitest run test/jitter.test.ts` | privacidad | 0 · 1 archivo · 4 tests | 8 s | verde |
| 14 | ventana E2E: **G1** + `ubicacion-obligatoria.spec.ts` | privacidad | — | — | no verificado: Docker apagado; ventana E2E no autorizada |
| 15 | `PNPM --filter api-core exec vitest run test/seguridad.test.ts test/autenticacion.test.ts test/fotos.test.ts test/fotos-abuso.test.ts test/cuentas-y-cuota.test.ts test/cupo-diario.test.ts test/fotos-cuota.test.ts test/fotos-webp.test.ts test/guarda-disco.test.ts` | seguridad | 0 · 9 archivos · 152 tests | 41 s | verde |
| 16 | `PNPM --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — (exige `curichi-minio` healthy + `S3_SECRET_KEY`) | — | no verificado: Docker apagado (MinIO no disponible) |
| 17 | `PNPM audit --audit-level high` | seguridad | 0 · 6 vulnerabilidades, todas moderate (bajo el umbral `high`) | 9 s | verde |
| 18 | ventana E2E: **G1** + `csp.spec.ts` + `camara-foto.spec.ts` | seguridad | — | — | no verificado: Docker apagado; ventana E2E no autorizada |
| 19 | `PNPM --filter db test` | datos | 0 · 23 archivos · 236 tests · 0 skip | 145 s | verde |
| 20 | `git diff --name-only --diff-filter=MDR refs/sdd/arreglos-chicos -- packages/db/migraciones` | datos | vacío (ninguna migración existente cambia) | <1 s | verde |
| 21 | `git ls-files -o --exclude-standard -- packages/db/migraciones` (migración nueva: número mayor + su `test/migracion-<NNNN>-*.test.ts`) | datos | vacío (sin migraciones nuevas en FB) | <1 s | verde (inspección; F4 exigirá la 0018 con su prueba) |
| 22 | `export DATABASE_URL=…; DATABASE_URL_PG_REAL=…/postgres PNPM --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts test/fotos-cuota-concurrencia-pg.test.ts` | datos | — (requiere PostgreSQL real; en #3 esos 2 archivos quedaron `skipped`) | — | no verificado: Docker apagado (PostgreSQL real) |
| 23 | privilegios en base efímera: `createdb curichi_sdd_arreglos-chicos`, `db:migrate` ×2, `PNPM --filter db privilegios`, `dropdb` | datos | — | — | no verificado: Docker apagado (PostgreSQL real) |
| 24 | inspección: nada escribe reportes por SQL fuera de `api-core` y seeds (`grep` INSERT/UPDATE `reporte_inundacion`) | datos | solo `packages/db` (recálculo de puntos críticos, `geometria-publica`, `mantenimiento`, bench, test-utils, tests); nada en `apps/`, `pipelines/` ni `geo-service` | <1 s | verde (observación para el auditor) |
| 25 | `PNPM exec turbo run test --filter=...geo-service --concurrency=1` | geo | 0 · 3/3 FULL TURBO (57 tests) | 14 s | verde (cache hit) |
| 26 | `PNPM --filter geodata-etl test` | geo | 0 · 3 archivos · 21 tests | 37 s | verde |
| 27 | `PNPM --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts test/puntos-criticos-metrica.test.ts` | geo | 0 · 3 archivos · 20 tests | 23 s | verde |
| 28 | ventana E2E: `datos-reales.spec.ts` | geo | — (corre sobre capas sintéticas si faltan los shapefiles reales) | — | no verificado: Docker apagado; ventana E2E no autorizada |
| 29 | `PNPM exec turbo run test --filter=...api-core --concurrency=1` | api | 0 · 3/3 FULL TURBO | 5 s | verde (cache hit) |
| 30 | ventana E2E: **G1** | api | — | — | no verificado: Docker apagado; ventana E2E no autorizada |
| 31 | en vivo: `curl -sk -i https://localhost/api/v1/<ruta tocada>` antes y después | api | — | — | no verificado: Docker apagado; en vivo pendiente |
| 32 | `PNPM exec turbo run test --filter=web-ciudadano --concurrency=1` | ui | 0 · 2/2 FULL TURBO | 6 s | verde (cache hit) |
| 33 | `PNPM exec turbo run test --filter=panel-admin --concurrency=1` | ui | 0 · 2/2 FULL TURBO | 5 s | verde (cache hit) |
| 34 | ventana E2E: grupos de pantallas tocadas (panel `/reportes[/[id]]`, `/ejecutivo`; web `/reportar`, `/crear-cuenta`, `/ingresar`) + **G5** | ui | — | — | no verificado: Docker apagado; ventana E2E no autorizada |
| 35 | en vivo: imagen reconstruida + humo `https://localhost` + navegador (escritorio y móvil) | ui | — | — | no verificado: Docker apagado; en vivo pendiente |
| 36 | `docker compose --profile servicios --profile minio config --quiet` | infra | **0** (solo código de salida; `config` lee archivos, no el daemon) | <1 s | verde |
| 37 | `docker compose --profile servicios config --format json \| node -e "<ningún servicio salvo proxy publica fuera de 127.0.0.1>"` | infra | **0**, sin salida (ningún servicio salvo `proxy` publica fuera de loopback) | <1 s | verde |
| 38 | inspección: variable de app/servicio → `turbo.json` `globalEnv` y `.env.example`; variable solo del Compose → `.env.example` con etiqueta | infra | `POSTGRES_SHM_SIZE` ausente de `.env.example` y `turbo.json` (exit 1) | <1 s | verde (FB: sin variables nuevas; F4 exigirá `POSTGRES_SHM_SIZE` etiquetada por M-4.2) |

Veredictos usados: `verde` · `verde (cache hit)` · `no verificado: <motivo>`.

### Avisos no bloqueantes (no son rojos; para que F4 compare)

- **#1 lint:** 1 warning `lint/style/noDescendingSpecificity` en `docs/dominio/infografia-plataformas-riesgo.html:128` (archivo de docs, fuera de las carpetas designadas; Biome sale 0). Que pase a error sería regresión.
- **#3 test:** turbo imprime `WARNING no output files found for task db#test` (clave `outputs` de `turbo.json`); no afecta el resultado (exit 0).
- **#17 auditoría:** 6 vulnerabilidades **moderate** (ninguna `high`/`critical`; por eso exit 0 con `--audit-level high`).
- **#3 test:** 11 tests `skipped` = los 2 archivos `*-cuota-concurrencia-pg` (exigen PostgreSQL real; ver #22).

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

**Ninguno.** Todos los comandos ejecutables en esta máquina (sin Docker) salieron verdes.

Recuento: **27 verdes** · **0 rojos** · **11 no verificados** (todos por Docker Desktop apagado) · 0 omitidos.

## Pila en vivo (foto sin tocar nada — `ui`, `api`, `infra` activas)

Docker Desktop apagado: `docker compose ps` falla con `failed to connect to the docker API at npipe:…dockerDesktopLinuxEngine … the daemon is running`. No se encendió (condición de la corrida). Toda la foto de la pila queda **no verificado: Docker Desktop apagado**.

| Servicio | Imagen | Creada (UTC) | Archivo más nuevo de su contexto (UTC) | ¿Al día? |
|---|---|---|---|---|
| web-ciudadano / panel-admin / api-core / geo-service / proxy | — | — | — | no verificado: Docker apagado |

| Comprobación | Resultado |
|---|---|
| `curl -sk -o /dev/null -w "%{http_code}" https://localhost/` | no verificado: Docker apagado |
| `curl -sk --resolve panel.localhost:443:127.0.0.1 … https://panel.localhost/login` | no verificado: Docker apagado |
| `curl -skI https://localhost/<ruta de la spec>` (cabeceras) | no verificado: Docker apagado |
| Navegador `http://localhost:3000\|3100/<pantalla>`: errores de consola | no verificado: Docker apagado |
| Captura (descripción) | no verificado: Docker apagado |

## E2E sobre el árbol sin tocar (después de la puerta 1, solo con la ventana autorizada)

No se corrió: Docker Desktop apagado y ventana E2E no autorizada en la puerta de esta corrida.

| Grupo | Specs | Pasaron | Fallaron (lista exacta) | Veredicto |
|---|---|---|---|---|
| — | — | — | — | no verificado: Docker apagado; ventana E2E no autorizada |

## Decisiones de la puerta 1 (las copia el agente principal)

**Actualización 2026-10-04 (puerta 1, para F4b «en vivo»):** el usuario autorizó **actualizar su pila
Docker y probarla en vivo, con respaldo de la base**, y **migrar `curichi` después del `pg_dump`**.
Túnel y ventana E2E siguen **no** autorizados.

- **Rojos que ya estaban:** no hay rojos → no aplica «seguir como conocidos».
- **Ventana E2E:** **no** (no autorizada).
- **En vivo** (reconstruir y reemplazar su pila): **sí** (autorizado), con respaldo de la base.
  Reglas de esta máquina: **no** recrear `postgis`, `proxy` ni `minio`; se arrancan los existentes sin
  recrear (`docker compose … start postgis minio proxy`). El nuevo `shm_size` de `postgis`
  (`docker-compose.yml`) queda **sin aplicar** hasta que el usuario recree `postgis` con
  `Mi-Curichi.exe` → «no verificado: requiere recrear postgis». Nunca `down`, `-v` ni
  `--force-recreate` de lo que no se reconstruye.
- **Migrar `curichi` tras `pg_dump`:** **sí** (autorizado; la 0018 se aplica con el job `migraciones`
  tras el `pg_dump`).
- **Túnel temporal:** **no** (no autorizado; `compartir` tampoco está entre las banderas de esta corrida).
