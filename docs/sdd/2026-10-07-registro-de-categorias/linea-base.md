# Línea base — Registro de categorías y políticas en `contracts`

- **Corrida:** `docs/sdd/2026-10-07-registro-de-categorias/` · **Medida el:** 2026-10-07 21:00–21:12 -0400 · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/registro-de-categorias` = `4f84ab5` · **HEAD:** `3121a0f` · **Rama:** `feat/contracts/registro-de-categorias`
- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad` · **Alcance:** `--filter=...contracts` (paquetes que entran: `contracts`, `api-core`, `db`, `geo-service`, `geodata-etl`, `panel-admin`, `web-ciudadano`)
- **Condiciones:** RAM libre al inicio **3675 MB** (subió a 7943 MB al final; ≥ 1500 en todo momento) · procesos pesados de otras sesiones: **0** (el conteo de 4 que dio el comando eran 3 envoltorios `bash.exe` + el propio `powershell.exe` de la consulta, que contienen el patrón `vitest|playwright|next…` en su propia línea de comandos; ningún `vitest`/`playwright`/`next`/`tsc` ajeno real) · pila Docker: **solo `postgis` y `minio` healthy** (perfil `servicios` abajo: sin api-core/geo/web/panel/Caddy) · `next dev` local: **no** (puertos 3000/3100 libres) · túneles `cloudflared`: **0** · `--concurrency=1`
- **Nota de opciones:** `typecheck` se corrió **con `--concurrency=1`** además de `test` y `build`, por la regla «Orden y memoria» de la matriz (en esta máquina los cuatro van con `--concurrency=1`) y la indicación del agente principal. Es la única diferencia respecto del texto literal de la fila `base`; F4 debe usar la misma opción.
- **Sin modo en vivo ni foto de pila:** no hay bandera `ui`, `api` ni `infra`. Ventana E2E **no autorizada** por el usuario.

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0: **declararlos y dejarlos**. Ninguno en `packages/contracts`. Detalle y `sha256` completos en `arbol-inicial.txt`.

| Archivo | Estado | sha256 (solo `??`) |
|---|---|---|
| `CLAUDE.md` | `M` | — |
| `apps/panel-admin/next-env.d.ts` | `M` (†) | — |
| `apps/web-ciudadano/next-env.d.ts` | `M` (†) | — |
| `docs/decisiones/README.md` | `M` | — |
| `.claude/settings.local.json` | `??` | `08b92f96…` (ver `arbol-inicial.txt`) |
| `ContextosySkills/` (6 archivos) | `??` | ver `arbol-inicial.txt` |
| `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | `??` | `437a68dc…` |
| `docs/arquitectura/` (23 archivos) | `??` | ver `arbol-inicial.txt` |
| `docs/decisiones/0008…0022` (15 ADR) | `??` | ver `arbol-inicial.txt` |
| `docs/sdd/2026-10-07-registro-de-categorias/` | `??` | carpeta de corrida |

(†) `next build` regeneró `apps/*/next-env.d.ts` a su forma canónica y quedaron **limpios** (iguales a HEAD); es un artefacto autogenerado por Next, fuera de la carpeta designada, sin efecto en la corrida.

La corrida no edita estos archivos. Si necesita alguno, para y pregunta. `packages/contracts/` quedó **sin cambios** tras toda la medición (incluidos los builds que regeneran `openapi.yaml` y `dist/dominio.json`): `git status` de la carpeta, limpio.

## Resultado por comando

| # | Comando exacto | Bandera | Salida | Duración | Veredicto |
|---|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` (`biome check .`) | base | exit 1; «Found 1 error. Found 6 warnings.» | 4 s | **rojo** (preexistente; archivo ajeno) |
| 2 | `npx -y pnpm@12.4.1 exec turbo run typecheck --filter=...contracts --concurrency=1` | base | exit 0; 9 tareas OK | 46 s | verde |
| 3 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...contracts --concurrency=1` | base | exit 1; único fallo intermitente (ver abajo); resto verde | 510 s | **rojo** (exit por intermitente; sin rojo real) |
| 3r | reintento aislado: `… --filter api-core exec vitest run test/exportacion.test.ts` | base | exit 0; 10/10 | 33 s | verde → **intermitente** |
| 3g | `… --filter geodata-etl test` (turbo lo abortó en #3) | base | exit 0; 3 files / 21 tests | 44 s | verde |
| 4 | `npx -y pnpm@12.4.1 exec turbo run build --filter=...contracts --concurrency=1` | base | exit 0; 7 tareas OK | 112 s | verde |
| 5 | `npx -y pnpm@12.4.1 secretos` (`node scripts/buscar-secretos.mjs --todos`) | base | exit 0; «sin hallazgos» | 4 s | verde |
| 6 | `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN [A-Z ]*PRIVATE KEY)" --` | base | exit 0; 128 coincidencias, todas en archivos ajenos (sin claves ni valores asignados) | 1 s | verde (revisa el auditor) |
| 7 | sub-comandos de `e2e/` (tsc + playwright --list) | base | — | — | no aplica (la corrida no toca `e2e/`) |
| 8 | `npx -y pnpm@12.4.1 --filter contracts --filter db build` | contrato | exit 0 | 9 s | verde |
| 9 | `cp openapi.yaml "$SCRATCH/openapi.antes.yaml" && … --filter contracts build && cmp -s …` | contrato | BUILD_EXIT=0 CMP_EXIT=0; byte-idéntico; árbol limpio | 7 s | verde |
| 10 | `git diff --name-only refs/sdd/registro-de-categorias -- packages/contracts/CHANGELOG.md` | contrato | vacío | <1 s | verde (esperado en FB: contracts no se tocó; en F4 **debe** salir) |
| 11 | `npx -y pnpm@12.4.1 exec turbo run typecheck test --filter=...contracts --concurrency=1` | contrato | exit 0; 16 tareas (10 cache); `api-core:test` re-ejecutó y pasó | 203 s | verde (confirma la intermitencia de #3) |
| 12 | ventana E2E: G1 | contrato | — | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 13 | `… --filter api-core exec vitest run test/privacidad-ubicacion … vista-publica-vs-tecnica … publicacion-diferida … exportacion … ubicacion-dispositivo … ubicacion-aproximada` | privacidad | exit 0; 6 files / 90 tests | 26 s | verde |
| 14 | `… --filter contracts exec vitest run test/jitter.test.ts` | privacidad | exit 0; 1 file / 4 tests | 4 s | verde |
| 15 | ventana E2E: G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts` | privacidad | — | — | **no verificado: el usuario no autorizó la ventana E2E** |
| 16 | `… --filter api-core exec vitest run test/seguridad … autenticacion … fotos … fotos-abuso … cuentas-y-cuota … cupo-diario … fotos-cuota … fotos-webp … guarda-disco` | seguridad | exit 0; 9 files / 152 tests | 23 s | verde |
| 17 | `… --filter api-core exec vitest run test/almacen-s3.test.ts` | seguridad | — | — | **no verificado: `S3_SECRET_KEY` no está en el entorno** (`curichi-minio` healthy, pero falta la variable) |
| 18 | `npx -y pnpm@12.4.1 audit --audit-level high` | seguridad | exit 1; 14 vulnerabilidades (3 high · 10 moderate · 1 low) | 4 s | **rojo** (preexistente; deps de apps/services) |
| 19 | ventana E2E: G1 + `csp.spec.ts` + `camara-foto.spec.ts` | seguridad | — | — | **no verificado: el usuario no autorizó la ventana E2E** |

Veredictos: `verde` · `rojo` · `intermitente` · `no verificado: <motivo>`.

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

### 1. `npx -y pnpm@12.4.1 lint` (`biome check .`)

Todo en un archivo ajeno (`ContextosySkills/hooks/contexto.mjs`), fuera de `packages/contracts`:

```
ContextosySkills/hooks/contexto.mjs  format (lint/style — «Formatter would have printed the following content») → el 1 error
ContextosySkills/hooks/contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills/hooks/contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills/hooks/contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills/hooks/contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills/hooks/contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
```

«Found 1 error. Found 6 warnings.» (486 archivos revisados). Ningún diagnóstico en `packages/contracts`.

### 2. `npx -y pnpm@12.4.1 audit --audit-level high`

14 vulnerabilidades (deps de apps/services; ninguna en `packages/contracts`). Las 3 **high** que hacen fallar el umbral:

```
high  source-map-js  — event-loop DoS through indexed source-map section offsets   (GHSA-68fv-2mgg-jv7q)
high  sharp          — Vulnerability in librsvg dependency CVE-2026-96889           (GHSA-wq5f-xc86-pv6w)   paths: services/api-core>sharp, apps/web-ciudadano>next>sharp, apps/panel-admin>next>sharp
high  next           — Server-Side Request Forgery in Image Optimization (>=16.0.0 <16.3.8, parcheado en 16.3.8)  (GHSA-cjq9-62q9-8jv4)   paths: apps/web-ciudadano>next, apps/panel-admin>next
```

Además 10 moderate + 1 low por debajo del umbral.

### Intermitente (NO es rojo preexistente)

```
api-core > test/exportacion.test.ts > exportación: cuenta sin tope y avisa cuando el archivo no trae todo > el límite por defecto es EXPORTAR_MAX_FILAS, no el de una página del listado
  → «Test timed out in 5000ms» (test/exportacion.test.ts:217). Bajo contención el archivo tardó 99 s / la suite api-core 231 s.
  → Reintento aislado (#3r): verde, 10/10 en 33 s. Re-ejecución completa en #11 (contrato): api-core:test verde.
  → Clasificación: intermitente por contención. En F4, si este test falla sin contención, es REGRESIÓN.
```

Recuento: **11 verdes** · **2 rojos** (`lint`, `auditoria`) + **1 intermitente** (base `test`, exit 1 por el timeout) · **4 no verificados** (`almacen-s3` por falta de `S3_SECRET_KEY`; 3 ventanas E2E no autorizadas) · `e2e`-base: no aplica.

## Pila en vivo (solo con `ui`, `api` o `infra`; foto sin tocar nada)

No aplica: la corrida no tiene bandera `ui`, `api` ni `infra`. Solo se registró que `postgis` y `minio` están `healthy` y el perfil `servicios` está abajo. Sin foto de imágenes, humo ni navegador.

## E2E sobre el árbol sin tocar (después de la puerta 1, solo con la ventana autorizada)

**No verificado: el usuario no autorizó la ventana E2E.** Grupos/specs que quedarían pendientes por bandera: `contrato` → G1; `privacidad` → G1 + `ubicacion-obligatoria.spec.ts` + `ubicacion-aproximada.spec.ts`; `seguridad` → G1 + `csp.spec.ts` + `camara-foto.spec.ts`.

## Decisiones de la puerta 1 (las copia el agente principal)

- Rojos que ya estaban: seguir como conocidos | ampliar la spec | parar
- Ventana E2E: sí/no/no aplica · En vivo (reconstruir y reemplazar su pila): no aplica (sin `ui`/`api`/`infra`)
- Migrar `curichi` tras `pg_dump`: no aplica · Túnel temporal: no aplica
