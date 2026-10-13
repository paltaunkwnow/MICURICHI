# Ventana de Contexto — Sesión 4

> Esqueleto creado **automáticamente** por `ContextosySkills/hooks/contexto.mjs` (PostToolUse) el
> 2026-10-10T00:23:43.456Z, con el contexto estimado en **70.2 %** (701.566 de ~1.000.000 tokens;
> umbral: > 70 %). Completado por Claude a continuación.
> Snapshot anterior: VentanaContextoSesion3.md. Transcript completo:
> `C:\Users\HP\.claude\projects\C--Users-HP-Desktop-MICURICHI\af832a62-dcd5-4e3f-a51c-ad3a2116e307.jsonl`.

## 1. Objetivo actual de la sesión

Construir la **plataforma multitemática**, con Inundaciones, Baches, Áreas verdes y Basura sobre un mismo núcleo, siguiendo el roadmap M0–M10 de `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` §5:

- **Proceso:** el de CLAUDE.md §12.4. Plan aprobado, reparto a subagentes por nivel y verificación SDD por subagentes en cada corrida.
- **Sin commits:** el usuario decidió el 2026-10-08 «primero tengamos todo terminado en local», y está guardado en la memoria `commits-al-final-en-local`.
- **En curso:** **M3b**, escrituras y cupo por categoría.

## 2. Estado actual del proyecto

| Fase | Estado | Carpeta de corrida |
|---|---|---|
| M0 | Hecha: ADR 0008–0022 y `CLAUDE.md` | — |
| M1 · registro de categorías (`contracts` 0.19.0) | Verificada, sin commit | `docs/sdd/2026-10-07-registro-de-categorias/` |
| M2 · base multicategoría (migración 0020, vista `reporte_inundacion`, `cupo_contador`, medición 1 M × 4) | Verificada, 1 vuelta, sin commit | `docs/sdd/2026-10-08-base-multicategoria/` |
| M3a · lecturas por categoría (`contracts` 0.20.0, 0021, DBSCAN por categoría, api-core y geo-service) | Verificada, 1 vuelta (prueba E2E de `/configuracion`), sin commit | `docs/sdd/2026-10-08-nucleo-por-categoria/` (también tiene el plan completo de M3) |
| **M3b · escrituras y cupo** | **En curso**: línea base hecha; M3.6 retomado tras un corte; no había escrito nada | `docs/sdd/2026-10-09-cupo-por-categoria/` |
| M4–M10 | Pendientes | — |

## 3. Repositorio Git analizado

`https://github.com/paltaunkwnow/MICURICHI.git`. Todo el trabajo de M0 a M3 está **sin commitear** en el árbol de trabajo.

## 4. Branch actual

`feat/api-core/cupo-por-categoria`, creada encima de `feat/api-core/nucleo-por-categoria`, que a su vez salió de `feat/db/base-multicategoria`, de `feat/contracts/registro-de-categorias` y, al final, de `main`. Todas las ramas apuntan a `3121a0f`, porque no hay commits nuevos.

## 5. Commit exacto

`3121a0ff9d496fde84a888f4f9131080966bde63` — 2026-10-04 feat(repo): reportar con ubicación aproximada (ADR 0007).

Fotos SDD (`refs/sdd/*`, creadas con `git stash create`):

| Corrida | Foto |
|---|---|
| `registro-de-categorias` | `4f84ab5` |
| `base-multicategoria` | `338e571` |
| `nucleo-por-categoria` | `31eb538` |
| `cupo-por-categoria` | `d68fe6a` |

No se borran hasta el commit.

## 6. Branches investigadas

Las del punto 4. No se investigaron otras.

## 7. PRs investigadas

Ninguna.

## 8. Cambios recientes relevantes

- **M3a:** el contrato 0.20.0 es aditivo:
  - filtro `categoria` (`todas` solo en el panel);
  - respuestas con `categoria`, `subtipo` y `detalle`, opcionales hasta M4/M5;
  - `ReporteCrearCategoriaSchema` y `normalizarReporteCrear`;
  - `fusionado_en_id` con ID corto;
  - `SesionActual.cupos` y `fotos_restantes_hoy`, y `categorias_activas`;
  - códigos `CATEGORIA_NO_DISPONIBLE` y `FUSION_ENTRE_CATEGORIAS`.
- **M3a:** migración 0021, índice `reporte_categoria_creado`.
- **M3a:** DBSCAN completo e incremental por categoría, sobre la tabla `reporte`.
- **M3a:** api-core y geo-service leen la tabla `reporte` con filtro de categoría.
  - El proveedor `src/categorias.ts` considera activa una categoría solo si figura en el catálogo y en el registro inyectado; caché de 30 s; falla cerrado.
  - geo-service tiene `CachePorCategoria`.
- **Corrección autorizada:** `e2e/tests/api-contratos.spec.ts:252` acepta `categorias_activas`.

## 9. Estado de sincronización

- `git status`:
  - versionados: unos 56 archivos `M` en `packages/contracts`, `packages/db`, `services/api-core`, `services/geo-service`, `e2e`, `scripts/respaldo.mjs`, `CLAUDE.md` y `docs/*`;
  - sin seguimiento: los `??` de `docs/arquitectura/`, las ADR 0008–0023, `docs/sdd/*`, `src/categorias/` de `contracts`, las migraciones 0020 y 0021 con sus reversas, pruebas nuevas, `ContextosySkills/` y `.claude/settings.local.json`.
- Nada empujado.
- Remoto: `github.com/paltaunkwnow/MICURICHI`.

## 10. Arquitectura comprendida

- **Cinco partes** (CLAUDE.md §4). `contracts` es la única fuente de tipos.
- **Modelo híbrido D** (ADR 0010): la tabla `reporte` lleva `categoria`, `subtipo`, `detalle` (jsonb) y `detalle_version`, más las columnas planas de inundación hasta M10.
- **Vista de compatibilidad** `reporte_inundacion`: `security_invoker` y `CASCADED CHECK OPTION`. Hoy la usan solo las escrituras de api-core, los seeds y los scripts.
- **Categoría activa** = fila `activa` del catálogo `categoria` y definición en `REGISTRO_CATEGORIAS`.
- **Sin `categoria`** = inundación (ADR 0012).
- **El cupo pasa a `cupo_contador`** en M3b: claves `reportes:<slug>` y `fotos:cuenta`; fotos global, 12 por día (ADR 0017).

## 11. Estructura comprendida

Monorepo pnpm 12.4.1 con Turborepo (`npx -y pnpm@12.4.1`).

| Carpeta | Qué hay |
|---|---|
| `packages/contracts/src/categorias/` | `tipos`, `slugs`, `resolver`, `index`, `inundacion/{esquema,definicion}` |
| `packages/db/migraciones/` | 0001–0021 y `reversas/` (0020, 0021) |
| `services/api-core/src/categorias.ts` | proveedor de categorías activas |
| `services/geo-service/src/categorias.ts` | proveedor de categorías activas |
| `docs/sdd/<fecha>-<slug>/` | `plan`, `arbol-inicial`, `archivos.txt`, `linea-base`, `implementacion`, `verificacion`, `informe` |

## 12. Componentes importantes

- **api-core:** `vistas.ts` (`SELECT_REPORTE` y `detallePublico`), `consultas.ts` (`armarWhere` con categoría), `cuota.ts` (cupo, todavía sobre `cuota_reporte_diaria`), `rutas/reportes.ts` (`POST`), `rutas/moderacion.ts` (todavía sobre la vista), `rutas/auth.ts` (`/auth/yo`).
- **db:** `puntos-criticos.ts` y `puntos-criticos-entorno.ts`, con el registro inyectable.

## 13. Flujos importantes

- **Corrida SDD:** F0 (rama, foto, `arbol-inicial`, `archivos.txt`) → FB `sdd-verificador` → implementadores (`trabajador-raiz` para raíz, Sonnet para lo estándar) → F4a en paralelo (verificador, revisor y auditor) → vueltas si hay hallazgos → `informe.md` → puerta 2 **sin commit**.
- **Ventana E2E:** base `curichi_e2e`, que ya existe y está en la 0021; servicios en `next dev`/`dev` contra ella.

## 14. Hallazgos

- **Chromium de Playwright no arranca** en esta máquina (`browserType.launch: spawn UNKNOWN`), aunque haya 6–7 GB libres.
  - El usuario lanzó una sesión aparte para diagnosticarlo: [Diagnosticar por qué Chromium…](#local_f5c0dbc6-96f3-4042-832e-16267223c981). Según el usuario, ya lo diagnosticó.
  - **Falta leer su conclusión**: la búsqueda en transcripts solo devolvió fragmentos (estado de Smart App Control y Defender, carpetas `ms-playwright`). Lo mejor es pedírsela al usuario.
- **Notas del auditor para M6–M8:**
  - `subtipo` es público sin pasar por `camposPublicos`; importa para la ADR 0018, «persona en situación de calle»;
  - el ID corto ahora se busca entre todas las categorías;
  - `/configuracion` tiene `max-age=300`.

## 15. Problemas encontrados

Todos son ajenos a las corridas y están documentados:

- `lint` en rojo por `ContextosySkills/hooks/contexto.mjs` (formato y `noUndeclaredEnvVars`) y por `docs/dominio/infografia-plataformas-riesgo.html:128`;
- `pnpm audit`: 3 high (`next` < 16.3.8, `sharp`, `source-map-js`);
- intermitentes por contención: `exportacion.test.ts` (*timeout*) y la caída de *workers* en las suites de `db` y api-core.

## 16. Problemas que NO deben corregirse todavía

- La base del usuario `curichi` está en la migración 0009 y **no se migra ni se toca**. Por eso el «en vivo» no aplica.
- `lint` de `ContextosySkills` y `audit`: son tareas aparte.
- Las apps (`apps/*`) no se tocan en M3; son de M4 y M5.

## 17. Decisiones tomadas

| Fecha | Decisión |
|---|---|
| 2026-10-07 | ADR 0008–0022 aprobadas |
| 2026-10-08 | Commits al final, en local |
| 2026-10-08 | D3 = «v2 extendida» (ADR 0023) |
| 2026-10-08 | Cupo de fotos **global**, 12 por día (ADR 0017) |
| 2026-10-08 | `fusionado_en_id` acepta el ID corto |
| 2026-10-08 | Plan de M3 aprobado (dos corridas), con ventana E2E autorizada y edición de `CLAUDE.md` §2, §7.5, §7.6 y §13 autorizada |
| 2026-10-09 | Ajuste autorizado de `e2e/tests/api-contratos.spec.ts` |
| 2026-10-09 | Chromium: investigarlo aparte |

## 18. Suposiciones

- La caché de 30 s de categorías activas y el `max-age=300` de `/configuracion` son aceptables.
- Reiniciar los contadores el día del despliegue (de `cuota_reporte_diaria` a `cupo_contador`) no importa en local.

## 19. Información pendiente de confirmar

- La conclusión del diagnóstico de Chromium, de la otra sesión.
- Decisiones de M6–M8 (CLAUDE.md §16 fila 7): nombre de la plataforma, campos y severidad por categoría, etcétera.

## 20. Skills / técnicas aprendidas

- **Cortes por límite de sesión:** son frecuentes. Antes de retomar, comprobar con `git diff refs/sdd/<slug>` y con los `sha256` de los archivos sin seguimiento (la salida de `sha256sum` en Windows trae `*` antes de la ruta).
- **Agentes que no se pueden retomar:** si uno figura «stopped by user», no se retoma con SendMessage; hay que preguntarle al usuario antes de lanzar uno nuevo.
- **Medición inicial:** se pueden reutilizar los resultados de la verificación anterior si se demuestra que el código no cambió.

## 21. Herramientas utilizadas

- Agent: `trabajador-raiz`, `sdd-*`, Sonnet `general-purpose` y Explore.
- SendMessage, AskUserQuestion y `spawn_task`.
- `search_session_transcripts`.
- Docker: `curichi-postgis` y `curichi-minio`.

## 22. Archivos importantes

- `docs/sdd/2026-10-08-nucleo-por-categoria/plan.md`: plan de M3, criterios CA1–CA9.
- `docs/sdd/2026-10-09-cupo-por-categoria/{plan,linea-base}.md`.
- `docs/sdd/2026-10-08-nucleo-por-categoria/informe.md`, sección «Para M3b».
- `CLAUDE.md`.
- La memoria `commits-al-final-en-local`.

## 23. Documentación generada

- Informes de M1, M2 y M3a.
- ADR 0023.
- `CLAUDE.md` §4.8, §7.1, §7.2, §9.1 y §16.
- `docs/seguridad/modelo-de-seguridad.md`.
- README de `contracts`, `db`, api-core y geo-service.
- `medicion.md` de M2.

## 24. Trabajo completado

- M0, M1, M2 y M3a, verificadas y sin commit.
- Línea base de M3b (`linea-base.md`): todo verde salvo `lint` y `audit`, que son ajenos; pruebas de cupo y moderación por nombre (129).

## 25. Trabajo pendiente

1. **M3.6** (`trabajador-raiz`), retomado: escrituras y cupo (CA5–CA8).
2. **M3.7:**
   - README de api-core (Sonnet);
   - `CLAUDE.md` §2, §7.2, §7.5, §7.6 y §13 y una nota en el doc 14 (agente principal).
3. **F4a de M3b:** verificador con E2E sin navegador, revisor y auditor; después `informe.md` sin commit.
4. Leer el diagnóstico de Chromium y, si se resuelve, correr las E2E de navegador de M3a y M3b.
5. Después: **plan de M4** (web: selector, preferencia y URL), M5 (panel), M6–M8 (categorías) y M9–M10.

## 26. Próximo paso exacto

- **Esperar el informe de M3.6** (agente `adbd804726d06a5ef`, retomado por SendMessage).
- **Al llegar:**
  - registrar sus archivos en `docs/sdd/2026-10-09-cupo-por-categoria/archivos.txt`;
  - lanzar el README (Sonnet);
  - editar `CLAUDE.md`;
  - preparar `implementacion.md` y el diff;
  - lanzar F4a.
- **Chromium:** pedirle al usuario la conclusión de la otra sesión.

## 27. Instrucciones importantes para continuar después de /compact

- No commitear.
- Nunca tocar `curichi`, `curichi_revision` ni `curichi_e2e`, salvo migrar `curichi_e2e` en la verificación.
- `.env` sin imprimir valores.
- `--concurrency=1`; mirar la RAM antes de cada suite.
- El agente principal no programa: reparte y verifica.
- Ante un corte de un subagente, comprobar el estado antes de retomar.
- Respuestas al usuario en español con voseo.

## 28. Resumen ejecutivo de continuidad

- **Hecho:** M0 a M3a, verificadas y sin commit.
- **En curso:** M3b. Línea base hecha; M3.6 retomado en `feat/api-core/cupo-por-categoria` (foto `d68fe6a`).
- **Después:** documentación, verificación con E2E sin navegador, informe, y luego el plan de M4.
- **Chromium:** no arranca; diagnóstico en otra sesión, falta leer su conclusión.
