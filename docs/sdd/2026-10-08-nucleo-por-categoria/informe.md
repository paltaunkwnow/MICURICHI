# Informe — M3a, lecturas por categoría

- **Corrida:** `docs/sdd/2026-10-08-nucleo-por-categoria/` · **Rama:** `feat/api-core/nucleo-por-categoria` · **Partes:** P3 (`packages/contracts/`, `services/api-core/`) y P4 (`packages/db/`, `services/geo-service/`), más una corrección autorizada en `e2e/`
- **Banderas:** `base`, `contrato`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia`, `api` · **Cambio de contrato:** sí, **aditivo** (`contracts` 0.19.0 → 0.20.0)
- **Proceso:** CLAUDE.md §12.4; `plan.md` (M3, aprobado el 2026-10-08) hace de spec; esta es la primera de sus dos corridas
- **Vueltas implementador ↔ verificación:** 1 (una regresión en una prueba E2E por el cambio aditivo de `/configuracion`, corregida con autorización)
- **Foto:** `refs/sdd/nucleo-por-categoria` = `31eb538` · **Cambios ajenos:** los de `arbol-inicial.txt` (M0, M1 y M2 sin commitear), que no van en el commit de esta corrida · **Línea base:** `linea-base.md` (rojos que ya estaban: `lint` y `auditoria`)

## Qué cambia

api-core, geo-service y `packages/db` leen **por categoría** sobre la tabla `reporte`:

- **Parámetro `categoria`:** sin él, todo responde igual que hoy, con inundación. `todas` solo se acepta en las rutas del panel. En las rutas públicas, una categoría inactiva responde `400 CATEGORIA_NO_DISPONIBLE`.
- **Categoría activa:** debe estar activa en el catálogo **y** tener definición en el registro. Si falta algo, se trata como inactiva.
- **Datos públicos:** el `detalle` de la vista pública solo trae los campos marcados como públicos.
- **Puntos críticos:** se agrupan por categoría, con el radio de cada una.
- **Índice nuevo:** la migración **0021** agrega el índice que salió de la medición de M2.
- **`/configuracion`:** informa las categorías activas.
- **Contrato `contracts` 0.20.0:** trae todo lo de M3, también lo que usará M3b (forma nueva de crear, cupos en `/auth/yo`, ID corto en la fusión, códigos de error), con los campos nuevos de respuesta opcionales hasta M4/M5.
- **Escrituras:** crear, cupo, `/auth/yo` y moderación siguen sobre la vista `reporte_inundacion` hasta **M3b**.

## Regresión contra la línea base

**Ninguna.** Detalle test por test en `verificacion.md`, primera pasada y vuelta 1.

| Comando | Línea base | Después | Clasificación |
|---|---|---|---|
| `lint` | rojo, ajenos (`ContextosySkills/…`, un `.html` de `docs/dominio/`) | igual | igual |
| `typecheck --filter=...contracts` | verde 9/9 | verde 9/9 | igual |
| `test` (real) | contracts 18/265 · db 26/284 · api-core 32+2/405+11 · geo 5/61 · etl 3/21 · web 34/486 · panel 40/458 | contracts **19/289** · db **28/294** · api-core **33+2/422+11** · geo **6/71** · etl 3/21 · web 34/486 · panel 40/458 | igual + pruebas nuevas |
| `build` | verde | verde (las apps compilan) | igual |
| OpenAPI | regenera idéntico | **cambia a propósito**, regenera determinista; el CHANGELOG sale | cambio de contrato esperado |
| PostgreSQL real (cupo, concurrencia) | 2/9 | 2/9 | igual |
| Base efímera: `migrate` ×2 y `privilegios` | verde, hasta la 0020 | verde, hasta la **0021** | igual |
| privacidad · seguridad · `almacen-s3` · concurrencia · puntos críticos | 90 · 152 · 11 · 27 · 20 | **94** · 152 · 11 · 27 · 20 | igual + 4 nuevas |
| `auditoria` | rojo, 3 high ajenas | igual | igual |
| E2E sin navegador (`api-contratos`, `separacion-publica-tecnica`) | 21/21 | primera pasada 13/14 + 7/7 (**regresión**: `/configuracion` con `categorias_activas`) → vuelta 1 **14/14 + 7/7** | resuelta |

**Intermitentes:** *timeout* de `migracion-0015` en `db` y de `exportacion` en api-core, ambos por contención. En aislado y en las corridas completas posteriores dieron verde.

## Criterios

| CA | Prueba | Después |
|---|---|---|
| CA1 · contrato 0.20.0 | `packages/contracts/test/contrato-0-20.test.ts` (24) | verde |
| CA2 · base de datos | `packages/db/test/migracion-0021-*.test.ts`, `puntos-criticos-categoria.test.ts` | verde |
| CA3 · api-core, lecturas | `services/api-core/test/no-contaminacion-categoria.test.ts` (13), la dimensión categoría de `publicacion-diferida.test.ts` (+4) | verde |
| CA4 · geo-service | `services/geo-service/test/no-contaminacion-categoria.test.ts` (10), `plan-agregados` con Index Only Scan | verde |
| CA9 (parte) · README | api-core y geo-service | hecho |

## Hallazgos del revisor y del auditor

Ni BLOQUEANTE ni IMPORTANTE de código. Se cumplen CA1–CA4 y la parte de README de CA9, se respetan las reglas de compatibilidad 1–6 y no hay nada de M3b a medias.

| Severidad | Hallazgo | Resolución |
|---|---|---|
| REGRESIÓN (verificador) | `e2e/tests/api-contratos.spec.ts:252` exigía que `/configuracion` trajera solo `ciudad` | **Resuelto** con autorización del usuario: la prueba espera `ciudad` y `categorias_activas`, y valida la lista. 14/14 |
| IMPORTANTE (revisor, documental) | Tres archivos sin seguimiento que `linea-base.md` declaró ajenos cambiaron durante la corrida: `packages/contracts/src/categorias/index.ts`, `packages/contracts/src/categorias/inundacion/esquema.ts` y `packages/db/test/migracion-0020-base-multicategoria.test.ts` | **Aceptado**: son de M1 y M2 (sin commitear), los exige el plan de M3 (`index.ts` reexporta, el detalle de inundación pasa a estricto y la reversa de la 0021 va antes que la de la 0020) y están en `archivos.txt` desde que se tocaron. La tabla de ajenos de la línea base se dibujó de más. Los ajenos que no están en `archivos.txt` conservan su `sha256` |
| NOTA (auditor) | `subtipo` sale en la vista pública sin pasar por `camposPublicos` | Para M6–M8: `subtipo` tiene que ser una etiqueta pública gruesa y lo sensible ir en `detalle` (ADR 0018, «persona en situación de calle») |
| NOTA (auditor y revisor) | El ID corto se resuelve ahora sobre `reporte`, con todas las categorías | Una colisión de prefijo entre categorías da `404` (ambiguo). Probabilidad despreciable, sin fuga de datos |
| NOTA (auditor) | `/configuracion` con `max-age=300` | Activar una categoría puede tardar hasta 5 min en verse. Es coherente con el diseño |

## Para M3b

- **Siguen sobre la vista `reporte_inundacion`:**
  - `POST /reportes`;
  - el cupo (`cuota_reporte_diaria`);
  - `/auth/yo`;
  - la moderación (`PATCH /estado`, `/severidad`, `/fusionar`) y el `DELETE` de punto crítico en `moderacion.ts`.
- **Ya disponibles:**
  - en api-core, `app.categorias` (`estaActiva`, `activas`, `invalidar`) y `registroDe(dep)`;
  - en `contracts`, `normalizarReporteCrear`, `DetalleInundacionSchema` estricto, `ID_REPORTE_CORTO_O_UUID` y `CODIGO_FUSION_ENTRE_CATEGORIAS`.
- **`recalcular*`:** ya aceptan el registro inyectado.

## En vivo y túnel

No aplica: reconstruir la pila corre las migraciones sobre `curichi`, que está en la 0009 y no se toca. El auditor dejó la lista de `curl` para cuando se haga (`verificacion.md`, comprobaciones en vivo).

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|
| E2E de navegador (`cuenta-ciudadana`, `acceso-panel`, `publicacion-diferida`, `ubicacion-*`, `csp`, `camara-foto`, `datos-reales`) | **Chromium no arranca en esta máquina** (`spawn UNKNOWN`), también con 6–7 GB libres. Es un problema del entorno, no del código | Diagnóstico aparte (tarea sugerida al usuario); después, correr esos grupos |
| En vivo (`curl` contra la pila reconstruida) | Migraría la base del usuario | Autorización para migrar `curichi` (con `pg_dump`) |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `ContextosySkills/hooks/contexto.mjs`; `docs/dominio/infografia-plataformas-riesgo.html:128` | Biome: 1 error de formato y 6 avisos | `pnpm lint` en rojo |
| Dependencias de apps y api-core | `pnpm audit`: 3 high (`next`, `sharp`, `source-map-js`) | Preexistente; tarea propia |
| Entorno de pruebas | Chromium de Playwright no arranca | Sin E2E de navegador hasta resolverlo |

## Cómo volver atrás (si no se aprueba)

- **Código:** `git checkout refs/sdd/nucleo-por-categoria -- <archivo>` para cada archivo modificado de `archivos.txt`, y borrar los nuevos de la corrida.
  - La foto incluye los cambios previos (M0–M2), así que esos se conservan.
  - Los archivos de M1 y M2 sin seguimiento que esta corrida tocó (`categorias/index.ts`, `inundacion/esquema.ts` y `migracion-0020-*.test.ts`) **no están en la foto**: su versión anterior está en sus `sha256` de `arbol-inicial.txt` y en el diff de la corrida.
- **Base `curichi_e2e`:** quedó en la 0021. Vuelve a la 0020 con `migraciones/reversas/0021_indice_categoria_creado_reversa.sql`.

## Puerta 2

**Sin commit**, por decisión del usuario del 2026-10-08. La corrida queda verificada y se conserva `refs/sdd/nucleo-por-categoria`. Cuando el usuario lo pida, el commit lleva solo `archivos.txt` y esta carpeta, después de los de M1 y M2. Por ejemplo: `feat(api-core): lecturas por categoría, contracts 0.20.0 y migración 0021 (M3a)`.

---

## Plantilla de PR

### Parte y carpeta designada
P3 (`packages/contracts/`, `services/api-core/`) y P4 (`packages/db/`, `services/geo-service/`); `e2e/tests/api-contratos.spec.ts` con autorización.

### Qué cambia
Lecturas por categoría con compatibilidad total sin parámetro, `contracts` 0.20.0, migración 0021 y DBSCAN por categoría.

### Cómo verificarlo

```bash
npx -y pnpm@12.4.1 exec turbo run typecheck test --filter=...contracts --concurrency=1
```

### Cambios de contrato
- [x] Sí: 0.20.0 aditivo (filtro `categoria`, respuestas con `categoria`, `subtipo` y `detalle`, forma nueva de `POST`, `cupos`, `categorias_activas`, ID corto en `fusionado_en_id`, códigos de error, parámetros de geo). Detalle en el CHANGELOG.

### Definition of Done
- [x] Sin regresiones contra la línea base (`lint` rojo solo por archivos ajenos)
- [x] Pruebas del camino crítico: no contaminación, tabla de visibilidad por categoría y DBSCAN por categoría
- [x] README de contracts, api-core y geo-service al día
- [x] Sin cambios fuera de las carpetas salvo el autorizado en `e2e/`
- [x] Auditoría de seguridad y privacidad sin hallazgos bloqueantes


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

