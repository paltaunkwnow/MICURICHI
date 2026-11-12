# Ventana de Contexto — Sesión 3

> Creado **automáticamente** por `ContextosySkills/hooks/contexto.mjs` (PostToolUse) el
> 2026-10-08T00:40:23Z (UTC; 2026-10-07 20:40 local), con el contexto estimado en **70,6 %**
> (706 098 de ~1 000 000 tokens; umbral > 70 %). **Es el primer snapshot bajo la política nueva.**
> Lo completó Claude a continuación.
>
> - Snapshot anterior: [VentanaContextoSesion2.md](VentanaContextoSesion2.md).
> - Transcript completo: `C:\Users\HP\.claude\projects\C--Users-HP-Desktop-MICURICHI\af832a62-dcd5-4e3f-a51c-ad3a2116e307.jsonl`.

## 1. Objetivo actual de la sesión

**Ejecutar M0 y después M1** de la plataforma multitemática.

**El usuario aprobó** (último mensaje: «Apruebo las ADR y el plan M0 junto al plan M1, autorizo
editar CLAUDE.md»):

- **todas** las ADR propuestas 0008–0022 (`docs/arquitectura/14.1`);
- el **plan M0**;
- el **plan M1** (`docs/arquitectura/14` §6–§7);
- **editar `CLAUDE.md`**.

**Antes**, en esta misma ventana, se hizo lo siguiente:

- se incorporaron las 6 decisiones del usuario (`docs/arquitectura/14`);
- se escribieron las ADR propuestas (`14.1`);
- se corrigió `ContextosySkills` a la política «snapshot solo > 70 %, uno por ciclo».

## 2. Estado actual del proyecto

- Fase 1 local; la Misión 1 quedó **ampliada** a plataforma multitemática (ADR 0008).
- **Todavía no hay código de la plataforma.**
- M0 está en curso:
  - **ADR materializadas**: `docs/decisiones/0008…0022` creadas;
  - **falta** el índice `docs/decisiones/README.md`;
  - **falta** editar `CLAUDE.md` §1, §3, §15 y §16;
  - **falta** la nota de aprobación en 14.1.
- M1 no empezó.

## 3. Repositorio Git analizado

`https://github.com/paltaunkwnow/MICURICHI.git` (`origin`). Local: `C:\Users\HP\Desktop\MICURICHI`.

## 4. Branch actual

`main`. La corrida de M1 va a crear `feat/contracts/registro-de-categorias` (F0 de `/sdd`, paso 4).

## 5. Commit exacto

`3121a0ff9d496fde84a888f4f9131080966bde63` (2026-10-04 22:16 -0400, ADR 0007). Sin commits nuevos;
el agente no commitea sin pedido.

## 6. Branches investigadas

Sin cambios respecto de la Sesión 1 §6.

## 7. PRs investigadas

Sin cambios respecto de la Sesión 1 §7 (Dependabot #13–#17 abiertos, sin usar).

## 8. Cambios recientes relevantes

Ninguno en el remoto. **Locales** (sin commitear, todos documentación o automatización de
contexto):

- `docs/arquitectura/13*`, `14*`;
- `docs/decisiones/0008-…0022-*.md` (nuevos);
- `ContextosySkills/hooks/contexto.mjs` (reescrito) y `README.md`;
- `apps/*/next-env.d.ts` (de `next dev`, Sesión 1).

## 9. Estado de sincronización

`main` local = `origin/main` = `3121a0f`.

| Ruta | Estado |
|---|---|
| `apps/panel-admin/next-env.d.ts`, `apps/web-ciudadano/next-env.d.ts` | Modificados |
| `.claude/settings.local.json`, `ContextosySkills/`, `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md`, `docs/arquitectura/` | Sin seguimiento |
| `docs/decisiones/0008…0022` | Sin seguimiento (nuevos) |

Pronto se sumará `CLAUDE.md` modificado. Para la corrida de M1, todo esto es **«ajeno»**: hay que
declararlo en F0 (opción «declarar y dejar»), y **ninguno** está en `packages/contracts`.

## 10. Arquitectura comprendida

**Plataforma** = núcleo en los paquetes actuales (`contracts`, `db`, `api-core`, `geo-service`, apps,
ETL, infra) + categorías como `DefinicionCategoria` en `packages/contracts/src/categorias/<slug>/`
(ADR 0009).

**Modelo híbrido** (ADR 0010):

- `reporte` con `categoria`, `subtipo`, `detalle jsonb` + `detalle_version`;
- migración por renombre + vista filtrada `reporte_inundacion` (ADR 0011);
- API aditiva en v1, sin `categoria` = `inundacion` (ADR 0012);
- un mapa con datos por categoría (ADR 0013).

**Decisiones del usuario:**

| Tema | Decisión | ADR |
|---|---|---|
| Categoría inicial | Última del dispositivo, en `localStorage` `micurichi.mapa.categoria` `{v:1, slug}` | 0014 |
| Prioridad | URL → guardada → Inundaciones; alias en la URL; forma pública `inundacion/bache/area-verde/basura`; la efectiva se guarda | 0015 |
| Filtros | Reinicio por alcance (`FiltroDef.alcance`) | 0016 |
| Cupo | 3 por día **por categoría**, como política `ReglaCupo` + contador genérico; demora por el contador de la categoría | 0017 |
| «Persona en situación de calle» | Se mantiene como subtipo de Áreas verdes, con puerta de privacidad antes de producción | 0018 |
| Áreas verdes | `Point`, sin capa municipal | 0019 y 0020 |
| Formularios | 4 pasos, el 2 declarativo | 0021 |
| Paleta | Solo acentos, icono obligatorio | 0022 |

## 11. Estructura comprendida

Sin cambios. Para M1:

- **carpeta designada:** `packages/contracts/` (Parte 3);
- **archivos nuevos:** `src/categorias/{tipos,slugs,index}.ts`, `src/categorias/inundacion/definicion.ts`
  y pruebas.

## 12. Componentes importantes

**Para M1:**

- `packages/contracts/src/esquemas/reporte.ts` (`ReporteCrearSchema`: líneas 87–157);
- `src/dominio/severidad.ts` (v2);
- `src/dominio/config.ts` (`CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA = 3`);
- `src/index.ts`;
- `openapi/openapi.yaml` (generado: **no debe cambiar**);
- `CHANGELOG.md`.

**Proceso:**

- `.claude/skills/sdd/SKILL.md`;
- `.claude/skills/sdd/matriz-de-riesgo.md`;
- `.claude/agents/{trabajador-raiz,sdd-verificador,sdd-revisor,sdd-auditor}.md`.

**Contexto:** `ContextosySkills/hooks/contexto.mjs`, con los modos `uso`, `precompact`,
`sesion-compact` y `estado`.

## 13. Flujos importantes

### Proceso de M1 (CLAUDE.md §12.4 + `/sdd`, F0 y verificación)

1. **F0:**
   - `git status` → `docs/sdd/2026-10-07-registro-de-categorias/arbol-inicial.txt`;
   - **preguntar al usuario** cómo tratar lo ajeno (recomendado: declarar y dejar) y si autoriza la
     ventana E2E G1 (recomendado: no; M1 no cambia el comportamiento);
   - banderas: `base`, `contrato`, `privacidad`, `seguridad` (por las palabras «público» y «cupo»;
     en la duda se activa);
   - rama `feat/contracts/registro-de-categorias`;
   - foto: `R=$(git stash create); git update-ref refs/sdd/registro-de-categorias "${R:-$(git rev-parse HEAD)}"`;
   - `plan.md` (las metas de 14 §7 hacen de criterios);
   - `archivos.txt` vacío.
2. **FB:** `sdd-verificador`, modo **línea base**, con los comandos de las 4 banderas, alcance
   `--filter=...contracts`.
3. **Implementar:**
   - `trabajador-raiz` (Opus 4.8, **sin** pasar `model`) para M1.1–M1.3, un solo escritor en
     `packages/contracts`;
   - después M1.4 con un agente `general-purpose` y `model: 'sonnet'` (CHANGELOG 0.19.0, README,
     `dist/dominio.json`).
4. **F4a en paralelo:** `sdd-verificador` (verificación), `sdd-revisor` (contra `plan.md`) y
   `sdd-auditor` (por las banderas `privacidad` y `seguridad`).
5. **F5:** informe; puerta 2 (el commit solo con «aprobado»).

**Entorno:**

- `pnpm` = `npx -y pnpm@12.4.1`;
- `--concurrency=1`;
- mirar la RAM libre antes de lo pesado (≥ 1500 MB).

## 14. Hallazgos

- **El hook nuevo funcionó en vivo:** se disparó una sola vez al cruzar el 70 % (70,6 %).
- **Hay hallazgos que corrigen documentos:**
  - el informe 12 decía «privilegios por columna»; ya está corregido;
  - el índice `docs/arquitectura/README.md` tenía la tabla partida; ya está corregido.
- **El `3` del cupo** está centralizado en `CONFIG_DOMINIO` + la variable de entorno de `api-core`;
  la tabla `cuota_reporte_diaria` tiene PK `(usuario_id, dia)`.

## 15. Problemas encontrados

- **Pendientes del producto:**
  - el **cupo de fotos** (12 global o por categoría), antes de M2;
  - **D3** (versión de severidad) y **`fusionado_en_id`** (contrato o manual), antes de M2 y M3;
  - el resto de 14 §8.
- La **privacidad** de «persona en situación de calle» es una puerta antes de producción.

## 16. Problemas que NO deben corregirse todavía

- Nada fuera de M1.
- No tocar `api-core`, `db`, apps, `geo-service`, E2E, `infra` ni la raíz durante M1.
- No mover la severidad v2 (se **reexporta**).
- No cambiar `ReporteCrearSchema` ni el OpenAPI.
- D2–D7 y la deuda del informe 12 §30 siguen fuera.

## 17. Decisiones tomadas

1. **ADR 0008–0022 aprobadas** y materializadas en `docs/decisiones/`.
2. **Interpretación de la aprobación** (anotada en cada ADR):
   - forma pública de la URL `inundacion/bache/area-verde/basura`;
   - la categoría efectiva (también la de un enlace) cuenta como «usada»;
   - la demora de publicación usa el contador de la categoría;
   - la activación es por catálogo en la base;
   - el cupo de fotos **sigue abierto**.
3. **`CLAUDE.md`**: autorizado editar §1, §3 y §15, más §16 (fila de decisiones abiertas). §2, §7 y
   §13 se editan cuando aterricen M2 y M3.
4. **Snapshots:** solo > 70 %, uno por ciclo (este es el 3; el 1 y el 2 se hicieron con la política
   anterior).

## 18. Suposiciones

- Aprobar el «plan M1» autoriza **implementar M1**, que solo toca `packages/contracts` y no cambia el
  comportamiento.
- El commit **no** está autorizado: se pide en la puerta 2.
- La ventana E2E y el «en vivo» no se usan salvo que el usuario los autorice.

## 19. Información pendiente de confirmar

- Respuesta del usuario en F0: qué hacer con lo ajeno y si autoriza la ventana E2E.
- Cupo de fotos.
- D3.
- `fusionado_en_id`.
- Las preguntas de 14 §8.

## 20. Skills / técnicas aprendidas

### Skill: Hook de contexto con un snapshot por ciclo, idempotente

- **Qué aprendimos.**
  - La marca por ciclo con `openSync(…, 'wx')` evita duplicados cuando varias herramientas
    disparan el hook a la vez.
  - El esqueleto se crea con `wx` y nunca se sobrescribe uno existente.
  - Solo cuenta el transcript principal (`basename == <session_id>.jsonl`).
  - El ciclo se rearma en `SessionStart compact` o cuando el uso baja del 50 %.
- **Cómo se aplicó.**
  - `ContextosySkills/hooks/contexto.mjs`;
  - 10 pruebas sobre una carpeta temporal (`CONTEXTO_CARPETA`), todas en verde;
  - disparo real en esta sesión al 70,6 %.
- **Precauciones.**
  - Es una estimación: ventana inferida de 1 M; cambiar `CONTEXTO_VENTANA_TOKENS` con otro modelo.
  - Solo mide en `PostToolUse`.

### Skill: Materializar ADR desde un documento de propuestas

- **Qué aprendimos.** Partir 14.1 por los encabezados `## ADR NNNN — …`, reescribir Estado, Fecha,
  Decide y Origen, y resolver en el texto los «pendientes» que aprobó el usuario. Se hace con un
  script que no sobrescribe archivos que ya existen.
- **Cómo se aplicó.** `scratchpad/materializar-adr.cjs` → `docs/decisiones/0008–0022`.

Las skills de las Sesiones 1 y 2 siguen vigentes.

## 21. Herramientas utilizadas

- Bash y Node (scripts en el scratchpad).
- Read, Write y Edit.
- `mark_chapter`.
- Pronto: el Agent tool con `trabajador-raiz` y los `sdd-*`.

## 22. Archivos importantes

- `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` (decisiones vigentes, M0 §6, M1 §7);
- `docs/arquitectura/14.1-adr-propuestos.md`;
- `docs/decisiones/0008…0022-*.md`;
- `CLAUDE.md`;
- `ContextosySkills/README.md` (política nueva) y `hooks/contexto.mjs`.

## 23. Documentación generada

**En esta ventana:**

- `docs/arquitectura/14*.md`;
- notas fechadas en 13, 13.1, 13.2 y 13.3;
- índice de `docs/arquitectura/README.md`;
- `ContextosySkills/README.md` reescrito (política nueva + historial);
- `docs/decisiones/0008–0022`;
- este snapshot.

## 24. Trabajo completado

- Decisiones de M0 documentadas.
- ADR propuestas y aprobadas.
- Las 15 ADR materializadas.
- Automatización de contexto corregida y probada.

## 25. Trabajo pendiente

**Para cerrar M0:**

1. `docs/decisiones/README.md`: filas 0008–0022 (`scratchpad/indice-adr.txt`).
2. Nota de aprobación en 14.1 §0.
3. Editar `CLAUDE.md`:
   - §1 y §3, con el texto de 14 §4;
   - §15: capa de áreas verdes y geometrías no puntuales; «Me pasa a mí»;
   - §16: fila de decisiones abiertas de la plataforma;
   - regla 11 y fecha de la cabecera.

**M1 completo:** F0 → FB → M1.1–M1.4 → F4a → F5.

## 26. Próximo paso exacto

1. Agregar las filas 0008–0022 a `docs/decisiones/README.md`.
2. Editar `CLAUDE.md`.
3. Preparar F0 de M1 y preguntar al usuario por lo ajeno y la ventana E2E (AskUserQuestion).

## 27. Instrucciones importantes para continuar después de /compact

1. Leer este snapshot y `ContextosySkills/README.md`.
2. Leer `docs/arquitectura/14` §6–§7 (los planes) y `.claude/skills/sdd/SKILL.md` (F0, FB, F4a, F5)
   antes de lanzar agentes.
3. **Un solo escritor en `packages/contracts`.**
4. Ningún subagente commitea.
5. Regresión = bloqueante.
6. «Verde» sin la salida pegada no cuenta.
7. No crear otro snapshot en este ciclo: el próximo será el 4, solo si un ciclo nuevo supera el 70 %.

## 28. Resumen ejecutivo de continuidad

El usuario aprobó las ADR 0008–0022, los planes M0 y M1, y autorizó editar `CLAUDE.md`.

**Ya está hecho:**

- las decisiones de M0 (14);
- las ADR (14.1, materializadas en `docs/decisiones/`);
- la automatización de contexto corregida (snapshot solo > 70 %, uno por ciclo).

**Falta para cerrar M0:** el índice de ADR, la nota en 14.1 y la edición de `CLAUDE.md` §1, §3, §15
y §16.

**Después, M1:** registro de categorías y políticas en `packages/contracts`, sin cambio de
comportamiento ni de OpenAPI.

- Rama `feat/contracts/registro-de-categorias`.
- `trabajador-raiz` para M1.1–M1.3; Sonnet para M1.4.
- Verificación SDD: línea base, verificador, revisor y auditor.
- Commit solo con el «aprobado» de la puerta 2.
