# Verificación — quitar campos del reporte (duración, afectación, manzana_id, dirección aproximada)

- **Banderas:** `base`, `contrato`, `privacidad`, `datos`, `geo`, `ui`
- **Ejecutado el:** 2026-09-25 · **Máquina:** Windows, Docker no disponible (PGlite local en 127.0.0.1:5433, `pnpm dev` corriendo en 3000/3001/3002/3100)
- **Rango del diff:** `git diff 3db01e1` (todo sin commitear en `feat/repo/quitar-campos-del-reporte`; `HEAD` = `3db01e1`)

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `npx pnpm@12.4.1 lint` | base | 1 | **rojo** |
| 2 | `npx pnpm@12.4.1 typecheck` | base | 2 (repite) | **rojo** |
| 3 | `npx pnpm@12.4.1 test` | base | 0 tras reintentar el subconjunto que falló por contención de recursos | verde |
| 4 | `npx pnpm@12.4.1 build` | base | 1 (repite) | **rojo** |
| 5 | `npx pnpm@12.4.1 secretos` | base | 0 | verde |
| 6 | `npx pnpm@12.4.1 contracts:build` + diff openapi | contrato | 0 | verde |
| 7 | `grep -c "duracion_estimada\|afectacion\|direccion_aprox\|manzana_id" openapi.yaml` | contrato | 0 (coincidencias) | verde |
| 8 | `git status --short packages/contracts/CHANGELOG.md` | contrato | — | verde |
| 9 | vitest `privacidad-ubicacion` + `vista-publica-vs-tecnica` (api-core) | privacidad | 0 | verde |
| 10 | vitest `jitter` (contracts) | privacidad | 0 | verde |
| 11 | `curl /api/v1/reportes?limite=2` (en vivo) | privacidad | — | verde |
| 12 | `npx pnpm@12.4.1 --filter db test` | datos | 0 | verde |
| 13 | `git diff --name-only 3db01e1 -- packages/db/migraciones` | datos | — | verde |
| 14 | datos con PostgreSQL real (`pnpm privilegios`) | datos | — | **no verificado: sin PostgreSQL real (Docker no disponible)** |
| 15 | `npx pnpm@12.4.1 --filter geo-service test` | geo | 0 | verde |
| 16 | `npx pnpm@12.4.1 etl:test` | geo | 0 | verde |
| 17 | `git diff --stat 3db01e1 -- services/geo-service pipelines/geodata-etl` | geo | — (vacío) | verde |
| 18 | `curl /geo/v1/capas/vigentes` | geo | — | verde |
| 19 | geo con PostgreSQL real (`node scripts/banco-consultas.mjs`) | geo | — | **no verificado: sin PostgreSQL real (Docker no disponible)** |
| 20 | `npx pnpm@12.4.1 exec playwright test` (e2e completo) | ui/contrato/privacidad/geo | 0 (proceso), 21 tests failed | **rojo** |
| 21 | UI navegador: `http://localhost:3000` (mapa público) | ui | — | verde |
| 22 | UI navegador: `http://localhost:3000/reportar` (formulario) | ui | — | **rojo** (404, ver nota) |
| 23 | UI navegador: `http://localhost:3100/login` → detalle de reporte | ui | — | verde |
| 24 | `build && start` de producción (CSP) | ui | — | **no verificado: los puertos 3000/3100 los ocupa la pila de desarrollo que el usuario va a usar** |

## Salida por comando

### 1. `npx pnpm@12.4.1 lint`

```
$ biome check .
e2e\tests\api-contratos.spec.ts:2:1 assist/source/organizeImports  FIXABLE
  × Sort the imported names.
   1 │ import { expect, test } from '@playwright/test';
 > 2 │ import {
 > 3 │   API,
 > 4 │   esperarPila,
    ...
> 13 │   tesela,
> 14 │ } from './ayudas';
  i Safe fix: Organize imports and exports (Biome)
Checked 265 files in 2s. No fixes applied.
Found 1 error.
[ELIFECYCLE] Command failed with exit code 1.
```

Único hallazgo: import sin ordenar en `e2e/tests/api-contratos.spec.ts` (fixable automáticamente por Biome, no se aplicó porque no corresponde arreglar).

### 2. `npx pnpm@12.4.1 typecheck`

Ejecutado dos veces (la primera falla tenía pinta de entorno: conflicto de `pnpm dev` escribiendo `.next` a la vez). Repitió igual las dos veces:

```
web-ciudadano:typecheck: $ tsc --noEmit
web-ciudadano:typecheck: .next/dev/types/routes.d.ts(61,1): error TS1435: Unknown keyword or identifier. Did you mean 'default'?
web-ciudadano:typecheck: .next/dev/types/routes.d.ts(62,4): error TS1109: Expression expected.
web-ciudadano:typecheck: .next/dev/types/routes.d.ts(62,37): error TS1161: Unterminated regular expression literal.
web-ciudadano:typecheck: .next/dev/types/validator.ts(73,8): error TS1005: ';' expected.
web-ciudadano:typecheck: .next/dev/types/validator.ts(74,1): error TS1128: Declaration or statement expected.
web-ciudadano:typecheck: [ELIFECYCLE] Command failed with exit code 2.
 Tasks:    5 successful, 9 total
Failed:    web-ciudadano#typecheck
```

Todos los demás paquetes (`contracts`, `db`, `panel-admin`, `geo-service`, `api-core`, `geodata-etl`) tipan verde. Los errores están en archivos **generados** por el propio `next dev` (`.next/dev/types/*`), no en código fuente de la tarea; coincide con el hallazgo de UI §8 (ver más abajo): el `.next` de `web-ciudadano` de esta corrida de `pnpm dev` parece corrupto/inconsistente.

### 3. `npx pnpm@12.4.1 test`

Corrida completa: 2 archivos de `api-core` (`autenticacion.test.ts`, `fotos.test.ts`) fallaron por timeout de 5000 ms con la pinta clásica de contención de recursos (la corrida completa tenía 198 tests de api-core corriendo a la vez que build/lint/dev). Se reintentó **solo esos dos archivos** y pasaron limpio:

```
 Test Files  2 passed (2)
      Tests  23 passed (23)
   Duration  18.95s
```

El resto de paquetes (`geo-service` 15/15, `db` 53/53, `geodata-etl` 10/10, resto de `api-core` 175/175) pasó a la primera. Veredicto final: **verde**.

### 4. `npx pnpm@12.4.1 build`

Reintentado una vez (misma sospecha de conflicto con `.next` de `pnpm dev`). Repitió:

```
web-ciudadano:build: ✓ Compiled successfully in 3.3s
web-ciudadano:build:   Running TypeScript ...
web-ciudadano:build: .next/dev/types/routes.d.ts(61,1): error TS1435: Unknown keyword or identifier.
web-ciudadano:build: .next/dev/types/validator.ts(74,1): error TS1128: Declaration or statement expected.
web-ciudadano:build: Failed to type check.
[ELIFECYCLE] Command failed with exit code 1.
```

`panel-admin` compiló y tipó bien (`Finished TypeScript in 16.8s`). Mismo defecto que en `typecheck`: Turbopack **compila** el código de la tarea sin problema, pero el paso de chequeo de tipos de `next build` lee `.next/dev/types/*` (generado por la instancia de `pnpm dev` corriendo en paralelo en el mismo `.next`) y ese archivo está corrupto/truncado. No es un error del código de la tarea.

### 5. `npx pnpm@12.4.1 secretos`

```
$ node scripts/buscar-secretos.mjs --todos
[secretos] sin hallazgos
```

### 6–8. Bandera `contrato`

```
$ pnpm --filter contracts build
contracts: openapi/openapi.yaml y dist/dominio.json generados
```

`git diff --stat -- packages/contracts/openapi` dio **el mismo resultado antes y después** de `contracts:build` (`1 file changed, 94 deletions(-)`, contra el commit base `3db01e1`): regenerar no introduce cambios nuevos, el YAML ya estaba al día.

```
$ grep -c "duracion_estimada\|afectacion\|direccion_aprox\|manzana_id" openapi.yaml
0
$ git status --short packages/contracts/CHANGELOG.md
 M packages/contracts/CHANGELOG.md
```

### 9–11. Bandera `privacidad`

```
$ pnpm --filter api-core exec vitest run test/privacidad-ubicacion.test.ts test/vista-publica-vs-tecnica.test.ts
 Test Files  2 passed (2)
      Tests  27 passed (27)

$ pnpm --filter contracts exec vitest run test/jitter.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

En vivo, `curl -s "http://127.0.0.1:3001/api/v1/reportes?limite=2"` devolvió dos features con `distrito`, `unidad_vecinal`, `descripcion`, `tirante_estimado`, `frecuencia`, `causa_presunta`, `severidad*`, `estado`, `punto_critico_id`, `n_reportes_punto`, `precision_degradada`. **No** aparece `duracion_estimada`, `afectacion`, `direccion_aprox`, `manzana_id`, `autor_id` ni `ip_hash`.

### 12–14. Bandera `datos`

```
$ pnpm --filter db test
 Test Files  8 passed (8)
      Tests  53 passed (53)

$ git diff --name-only 3db01e1 -- packages/db/migraciones
(sin salida — el archivo es nuevo, no aparece en git diff sobre HEAD)
$ git status --short packages/db/migraciones
?? packages/db/migraciones/0010_quitar_campos_del_reporte.sql
```

Confirmado: la única migración tocada/agregada es `0010_quitar_campos_del_reporte.sql`; ninguna migración anterior (`0001`–`0009`) fue modificada.

Con PostgreSQL real (`pnpm privilegios`, `scripts/banco-*.mjs`): **no verificado — sin PostgreSQL real** (Docker no disponible en esta máquina; no se intentó contra PGlite para no invalidar el resultado).

### 15–19. Bandera `geo`

```
$ pnpm --filter geo-service test
 Test Files  1 passed (1)
      Tests  15 passed (15)

$ pnpm etl:test
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ git diff --stat 3db01e1 -- services/geo-service pipelines/geodata-etl
(sin salida — diff vacío, CA-G1 y CA-E1 cumplidos)

$ curl -s http://127.0.0.1:3002/geo/v1/capas/vigentes
{"distrito_municipal":"DM_UV_MZ_2025","unidad_vecinal":"DM_UV_MZ_2025","manzana":"DM_UV_MZ_2025"}
```

Con PostgreSQL real (`node scripts/banco-consultas.mjs`): **no verificado — sin PostgreSQL real**.

### 20. E2E completo (`cd e2e && npx pnpm@12.4.1 exec playwright test`)

Primera corrida: **57 failed**, motivo uniforme y de entorno — `Executable doesn't exist at .../chromium_headless_shell-1243/...` (Playwright recién instalado, sin navegadores descargados). Se instaló el navegador (`playwright install chromium`, tarea de entorno, no de código) y se reintentó **una vez** la suite completa:

```
21 failed
  tests\acceso-panel.spec.ts (2)
  tests\cuenta-ciudadana.spec.ts (1)
  tests\navegacion.spec.ts (3)
  tests\quitar-campos-web.spec.ts (5): CA-W1, CA-W2, CA-W3, CA-W6, CA-W8
  tests\recorrido-completo.spec.ts (5): CA-X1 y todo el resto del recorrido
  tests\resiliencia-interfaz.spec.ts (3)
9 did not run
59 passed (23.6m)
[exited with code 0]
```

Ejemplo de error representativo (se repite con variaciones en casi todos los fallos):

```
Error: expect(locator).toHaveValue(expected) failed
Locator: locator('#email')
Expected: "e2e-ui-...@curichi.test"
Call log:
  - waiting for "http://localhost:3000/ingresar?volver=%2Freportar&email=...' navigation to finish...
    - navigated to "http://localhost:3000/ingresar?volver=%2Freportar&email=..."
  at ayudas.ts:155 (crearCuentaYEntrarPorUi)
```

**Causa raíz identificada de forma independiente** (ver §22 más abajo): la instancia de `pnpm dev` de `web-ciudadano` en esta corrida devuelve **404 en toda ruta que no sea `/`** (`/reportar`, `/como-funciona`, etc.), tanto para Playwright como para el navegador integrado que usé a mano. Coincide con la corrupción de `.next/dev/types/*` vista en `typecheck`/`build` (§2 y §4): todo apunta a un `.next` de `web-ciudadano` corrupto en esta instancia de `pnpm dev`, no a un defecto del código de la tarea. No se reintentó una segunda vez (la instrucción es reintentar una sola vez ante fallo con pinta de entorno; el segundo fallo, además, tiene causa distinta y reproducible, no es un problema transitorio).

**No se puede recomendar un arreglo de entorno (reinicio de `pnpm dev`) porque la consigna explícita para esta verificación es no tocar la pila.** Se transcribe como hallazgo bloqueante para que el proceso principal decida si reinicia `web-ciudadano`.

### 21–23. Bandera `ui` (navegador integrado)

- **`http://localhost:3000` (mapa público):** cargó bien, 30 puntos, filtros por severidad, capas de distritos/UV visibles y coropletas. Clic en una tarjeta abrió la hoja de detalle: muestra **Tirante, Frecuencia, Causa presunta, Reportes, Reportado** y el aviso *"Ubicación aproximada: el punto está sobre una vivienda o predio, así que en el mapa público se muestra desplazado para cuidar la privacidad del vecino."* **No** aparecen Manzana, Dirección, Duración ni Afectación. Consola: solo un `401` esperado de `/api/v1/auth/yo` (sin sesión). Captura guardada por el harness.
- **`http://localhost:3000/reportar` (formulario):** **404 "No encontramos esta página"**, confirmado también navegando a `/como-funciano` (sic, debía decir `/como-funciona`) y a otras rutas: **todas** las rutas de `web-ciudadano` distintas de `/` devuelven 404 en esta instancia de `pnpm dev`. No se pudo verificar el formulario sin duración/afectación por este bloqueo de entorno. Reintenté navegando dos veces, mismo resultado ambas veces → se transcribe como **rojo**, no como "no verificado", porque la pila sí responde (solo esa ruta/ese servidor específico está roto).
- **`http://localhost:3100/login` → `tecnico@curichi.local` / `curichi-tecnico-local` → detalle de reporte:** login exitoso, redirige a `/reportes` (45 reportes, tabla sin columnas de Manzana/Dirección/Duración/Afectación, solo Tirante y Frecuencia). Abrí el reporte `db45beed`: el detalle muestra Distrito, Unidad vecinal, Coordenadas, Método de ubicación, Tipo de lugar, Versión de capa y **"En el mapa público se ve: Desplazado hasta 30 m para no señalar la vivienda"**; en "Evento reportado" solo Tirante, Frecuencia, Causa presunta, Sumidero cercano — **sin** Manzana, Dirección, Duración ni Afectación. El desglose de severidad muestra **"CÓMO SE LLEGÓ A 10 DE 12 PUNTOS"** con dos filas (Tirante×2: 4/4, Frecuencia: 2/4) y la fórmula `puntaje = 2 × tirante + frecuencia`. Consola: dos `401` de `auth/yo` heredados de navegaciones previas en la misma pestaña (esperados, sin sesión en ese momento). Captura guardada por el harness.

### 24. CSP de producción

No verificado: los puertos 3000/3100 los ocupa la pila de desarrollo que el usuario va a usar. Los `build` de ambas apps ya se intentaron en el paso 4/1 (`panel-admin` compiló y tipó bien; `web-ciudadano` solo falló por la corrupción de `.next/dev/types` descrita arriba, no por CSP ni por el código de la tarea).

## No verificado

| Comando | Motivo |
|---|---|
| `pnpm privilegios` | sin PostgreSQL real (Docker no disponible) |
| `DATABASE_URL_PG_REAL=… vitest test/cuota-concurrencia-pg.test.ts` | sin PostgreSQL real |
| `node scripts/banco-consultas.mjs` | sin PostgreSQL real |
| `node scripts/banco-concurrencia.mjs` | sin PostgreSQL real (no solicitado por esta matriz pero mencionado en carpetas tocadas de raíz) |
| `pnpm --filter web-ciudadano build && start` (CSP producción) | puertos 3000/3100 ocupados por la pila de desarrollo en uso |

## Hallazgos bloqueantes (rojo)

1. **`lint`**: import sin ordenar en `e2e/tests/api-contratos.spec.ts` (autofixable con Biome, no corregido por el verificador).
2. **`typecheck` y `build` de `web-ciudadano`**: `.next/dev/types/routes.d.ts` y `validator.ts` corruptos/truncados en esta instancia; repite tras reintento. Parece causado por la convivencia de `next build`/`tsc` con la instancia de `pnpm dev` escribiendo el mismo `.next`.
3. **E2E completo**: 21 tests fallidos + 9 sin correr, todos aguas abajo de que `web-ciudadano` (puerto 3000) devuelve 404 en toda ruta que no sea `/` en esta corrida de `pnpm dev` (confirmado también a mano en el navegador integrado: `/reportar`, `/como-funciona`). No pude verificar por este motivo: CA-W1, CA-W2, CA-W3, CA-W6, CA-W8, el recorrido completo (`recorrido-completo.spec.ts`), `acceso-panel`, `cuenta-ciudadana` y parte de `resiliencia-interfaz`.

## Bandera `ui`

- Apps y pantallas: `web-ciudadano` (mapa público en `/`, formulario en `/reportar` — bloqueado por el hallazgo #3), `panel-admin` (`/login` → `/reportes` → `/reportes/[id]`).
- Levantada con: `pnpm dev` (ya corriendo, indicado por la consigna; no se hizo `build && start` de producción por conflicto de puertos, ver §24).
- Errores en consola: ninguno de CSP ni `Failed to load`; solo `401` esperados de `/api/v1/auth/yo` sin sesión, y los `404` de `/reportar` y `/como-funciona` ya reportados como hallazgo bloqueante.
- Capturas: guardadas por el harness durante la sesión (mapa público con hoja de detalle de "Unidad Vecinal ET48"; detalle técnico del reporte `db45beed` con el desglose de severidad).

## Segunda corrida (agente principal, tras corregir el entorno)

Causa del rojo de la primera corrida: `pnpm build` corrió mientras `next dev` estaba en marcha y corrompió `apps/web-ciudadano/.next` (404 en toda ruta salvo `/`). Se paró la pila, se borró `.next` de las dos apps y se repitió todo sin la pila; luego se relevantó la pila y se repitieron los E2E.

| Comando | Código | Veredicto |
|---|---|---|
| `biome check --write e2e/tests/api-contratos.spec.ts` + `pnpm lint` | 0 | verde (266 archivos, 0 avisos) |
| `pnpm typecheck` | 0 | verde (9/9) |
| `pnpm build` | 0 | verde (7/7) |
| `playwright test` (suite completa, 89 tests) | 0 | 88 verdes, 1 rojo: CA-W2 contaba solo inputs y el paso 1 del formulario se contesta con el mapa |
| `playwright test tests/quitar-campos-web.spec.ts` tras corregir el conteo de controles del test (canvas y botones propios del paso) | 0 | 6/6 verdes |
| Navegador integrado: `/` y `/reportar` con la pila reiniciada | — | mapa con capas reales, sin peticiones a `manzana`; formulario «Paso 1 de 4»; sin errores nuevos de consola |
| `ALTER COLUMN severidad_version SET DEFAULT 2` aplicado a mano en la base local (la 0010 ya estaba aplicada cuando se añadió esa línea) | — | 44 reportes, todos con versión 2 |
