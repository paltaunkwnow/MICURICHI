# Ventana de Contexto — Sesión 1

> Snapshot escrito el **2026-10-07**, al cerrar la **FASE 2** (evaluación arquitectónica y de
> escalabilidad).
>
> Es el primero del sistema `ContextosySkills`. Antes de que existiera hubo **una compactación
> automática**, con `preTokens = 977 626`. Su resumen está copiado en
> `ContextosySkills/.estado/resumen-compactacion-2026-10-07T23-00-27-252Z.md`.
>
> Conclusiones permanentes en
> [`docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md`](../docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md):
> este snapshot **no las repite**, las enlaza.

## 1. Objetivo actual de la sesión

La sesión tuvo tres pedidos del usuario:

| Fase | Pedido | Estado |
|---|---|---|
| 1 (10-06) | Analizar y crear `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | Hecho |
| 2 (10-06) | Levantar el proyecto y crear los informes `docs/arquitectura/00–11` | Hecho |
| FASE 2 (10-07) | Ver abajo | Hecho |

Lo que pidió la FASE 2:

- investigar Git y GitHub (cambios del ~2026-10-04);
- reanalizar todo contra el código;
- evaluar reutilización, preparación multi-categoría (baches, basura, áreas verdes) y escalabilidad
  con mediciones;
- comparar las estrategias A–D;
- escribir el informe 12;
- montar este sistema de continuidad.

**Regla absoluta de la FASE 2:** NO IMPLEMENTAR. Nada de:

- código, funcionalidades, bugs, refactors;
- dependencias, migraciones;
- commits, push o PR.

Solo documentación (y este sistema, que el usuario aprobó con «Sí, todo (Recomendado)»).

## 2. Estado actual del proyecto

- Mi Curichi está en la **Fase 1 — Local**. Falta la tarea 9: E2E, seguridad y resumen.
- Funciona en local con los datos reales del municipio.
- No hay despliegue.
- El usuario quiere usarlo como **base de un ecosistema** (inundaciones, baches, basura, áreas
  verdes) y escalarlo, **sin implementarlo todavía**. Espera instrucciones nuevas.

## 3. Repositorio Git analizado

`github.com/paltaunkwnow/MICURICHI` (`origin`). Carpeta local: `C:\Users\HP\Desktop\MICURICHI`.

## 4. Branch actual

`main` (local = `origin/main`).

## 5. Commit exacto

`3121a0ff9d496fde84a888f4f9131080966bde63`, del 2026-10-04 22:16 -0400: «reportar con ubicación
aproximada (ADR 0007)».

- contracts 0.18.0;
- migración 0019;
- 87 commits en `main`.

## 6. Branches investigadas

| Rama | Relación con `main` |
|---|---|
| `feat/repo/produccion-vps` (`888bce8`) | Ancestro de `main` |
| `feat/repo/cuentas-ciudadanas-y-auditoria` (`a06d281`) | Ancestro de `main` (PR #1) |
| `claude/disaster-alert-platforms-research-c6sjk5` (`8a8c843`) | No es ancestro, pero `git cherry` da 0 pendientes: su parche es `e2cd83f` |
| 5 ramas `dependabot/*` (10-05) | Sin fusionar |

## 7. PRs investigadas

| PR | Qué es | Estado |
|---|---|---|
| **#1** | Cuentas ciudadanas, cupo y auditoría | **Fusionado el 2026-10-03**, por rebase (no hay merge commit) |
| #2–#12 | Dependabot | Cerrados sin fusionar (incluye majors de TypeScript 7 y Vitest 5) |
| #13–#17 | Dependabot (10-05) | Abiertos, **no usados**: son de un bot y los majors exigen ADR |

## 8. Cambios recientes relevantes

**10-03** — 10 commits:

- frecuencia `agua_estancada` (migración 0017);
- login con usuario;
- fusión con ID corto;
- Next 16.3.6;
- runner E2E;
- `Mi-Curichi.exe`.

**10-04** — 13 commits:

- `/indicadores` con filtros (contracts 0.16.0);
- tortas;
- «Capas» solo admin;
- pestañas de severidad;
- fusión con cercanos (0.17.0);
- §12.4 del manual;
- **ubicación aproximada** (0.18.0, migración 0019).

Tabla completa en el [informe 12 §3](../docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md#3-historial-de-cambios-de-los-últimos-días).

## 9. Estado de sincronización

Todo lo versionado coincide con `3121a0f`. `git fetch --prune` del 07-10 no trae nada nuevo en
`main`.

En el árbol de trabajo:

| Ruta | Estado | Origen |
|---|---|---|
| `apps/{web-ciudadano,panel-admin}/next-env.d.ts` | Modificados | Los reescribió `next dev` el 10-06 (`.next/types` → `.next/dev/types`); se dejaron así |
| `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | Sin seguimiento | Creado por mí |
| `docs/arquitectura/` (00–12 + README) | Sin seguimiento | Creado por mí |
| `ContextosySkills/` | Sin seguimiento | Creado por mí |
| `.claude/settings.local.json` | Sin seguimiento | Creado por mí |

## 10. Arquitectura comprendida

Monolito modular en dos servicios:

- `api-core` (Fastify) es la única escritura del dominio;
- `geo-service` es de solo lectura;
- `web-ciudadano` y `panel-admin` son Next 16;
- `packages/contracts` (Zod, enums, severidad, OpenAPI) manda sobre todos;
- PostgreSQL 18 + PostGIS 3.6 es la autoridad: sesiones, cupos, idempotencia, freno de login y
  `publicar_en`.

Detalle en el informe 12 §6 y en `docs/arquitectura/README.md`.

## 11. Estructura comprendida

| Parte | Carpeta |
|---|---|
| 1 | `apps/web-ciudadano` |
| 2 | `apps/panel-admin` |
| 3 | `services/api-core`, custodia de `packages/contracts` |
| 4 | `packages/db`, `services/geo-service` |
| 5 | `pipelines/geodata-etl`, `infra`, `e2e`, `.github`, `scripts`, `docs` |

La regla de carpetas designadas está en CLAUDE.md §5.

## 12. Componentes importantes

- **Visibilidad**: `api-core/src/visibilidad.ts` (`condicionPublico`).
- **Listado**: `api-core/src/consultas.ts` (`armarWhere`, conteo con `TOPE_CONTEO = 10 000`).
- **Agregados por UV**: `geo-service/src/visibilidad.ts` (`SQL_AGREGADOS_UV`).
- **Argon2id**: `packages/db/src/password.ts` (`PASSWORD_WORKERS`, por defecto 2).
- **Mantenimiento**: `api-core/src/mantenimiento.ts`. Primera pasada a 30 s
  (`MANTENIMIENTO_ESPERA_MS`), después cada 6 h.
- **DBSCAN**: `packages/db/src/puntos-criticos*.ts`.
- **Benchmarks**: `scripts/banco-*.mjs`.

## 13. Flujos importantes

Ver `docs/arquitectura/10-flujos-de-punta-a-punta.md`. Los críticos para escalar son el mapa
público, el login y la moderación con sondeo de 10 s.

## 14. Hallazgos

**Versión.** `3121a0f` es la correcta y completa.

**Acoplamiento.**

- No existe ningún concepto de «categoría».
- El dominio de inundación vive en cuatro lugares:
  - la tabla `reporte_inundacion` (75 lugares en 14 migraciones) y 7 `ENUM`;
  - `contracts`;
  - `FormularioReporte`;
  - el panel (`severidad`: 673 apariciones en 42 archivos).
- ETL y núcleo geo: 0 o casi 0 términos del dominio.

**Mediciones del 10-07.** Condiciones: base de 4 CPU y 1,5 GiB; servicios en modo dev en Windows.

| Medición | Resultado |
|---|---|
| Listado del mapa a 100 000 reportes | 71–80 rps con 1 `api-core` al 115 % de CPU; 224 KB por respuesta (14,5 KB comprimida) |
| Mismo listado con 3 instancias | ~100–112 rps |
| `pgbench` del mapa dentro del contenedor | 303–361 tps |
| Mismas consultas desde Windows | ~110/s: **artefacto de Docker Desktop** |
| SQL del mapa | 1–4 ms |
| Agregado por UV a 100 000 | **184 ms**, *sort* en disco (F4: 47 ms) |
| DBSCAN `SELECT` con 75 000 | 678 ms, el grupo mayor de 216 |
| Login con Argon2 | **12–17/s por instancia** |

Conclusión: el cuello **no es fijo**.

- Con la base holgada manda Node.
- Con la base escasa, PostgreSQL (F4).
- En las ráfagas de login, Argon2.

## 15. Problemas encontrados

Lista en el informe 12 §30. Los principales:

- **D2**: `alSimular` siempre activo (`FormularioReporte.tsx:1027`).
- **`fusionado_en_id`**: el contrato solo acepta UUID en el PATCH, y el manual y el commit
  `2f9b2c1` dicen que también el ID corto.
- **`TRUST_PROXY`**: los comentarios de `geo-service` dicen «2».
- **D3**: severidad sin versión nueva.
- **Agregado** cuatro veces más lento que en la F4.
- **Rate limit** en memoria.
- **Benchmarks obsoletos.**

## 16. Problemas que NO deben corregirse todavía

Ninguno se corrige en esta fase: el usuario lo prohibió. Además, el informe 12 §32 lista lo que no
conviene tocar hasta tener los ADR:

- tabla y `ENUM`;
- microservicios;
- majors de Dependabot;
- pool;
- severidad y radio;
- visibilidad.

## 17. Decisiones tomadas

1. Usar `3121a0f`. No hacer `git pull` ni `checkout` de archivos.
2. Medir solo en `curichi_revision`, nunca en `curichi`.
   - Los 100 000 sintéticos se generaron y **se borraron** (`banco-datos limpiar`) y se vació
     `intento_login`.
   - Quedó con 37 reportes y 22 puntos críticos.
3. No modificar ningún benchmark. Las mediciones extra van con scripts en el directorio temporal
   de la sesión.
4. Recomendar la **estrategia D** (monolito modular primero, separación con métricas),
   implementada como núcleo + módulos por categoría.
5. Orden del roadmap: baches → basura → áreas verdes. Áreas verdes queda al final por la geometría
   no puntual.
6. Hooks en `.claude/settings.local.json` (local, no versionado), no en `.claude/settings.json`
   (del equipo).
7. Los `next-env.d.ts` se dejan modificados y se documentan.

## 18. Suposiciones

- **Tráfico**: ≈ 0,1 rps dinámicas por usuario concurrente. No hay telemetría.
- **Docker Desktop**: el techo de ~110/s desde Windows no existiría igual en una VPS Linux.
- **Modo producción**: daría más rps por instancia que el modo dev.
- **Ventana de contexto** de 1 M tokens, inferida del `preTokens` de la compactación.

## 19. Información pendiente de confirmar

- Mediciones en modo producción sobre Linux.
- `POST /reportes` y `POST /fotos` bajo concurrencia.
- CPU de `sharp`.
- Caddy bajo carga.
- DBSCAN con datos reales densos.
- 1 M de reportes con el SQL actual.

## 20. Skills / técnicas aprendidas

### Skill: Reconstrucción de cambios Git entre ramas, PRs y cherry-picks

- **Qué aprendimos.** Un PR fusionado por rebase no deja merge commit. Para saber si una rama ya
  está integrada:
  - `git merge-base --is-ancestor <rama> origin/main` dice si es ancestro;
  - `git cherry origin/main <rama>` dice si su parche ya está aunque haya otro hash (cherry-pick).
- **Cómo se aplicó.**
  - `git fetch --prune`;
  - `git for-each-ref --sort=-committerdate refs/remotes`;
  - `gh pr list --state all --json …`;
  - `git log --since`;
  - `git fetch origin main:main` para adelantar la referencia sin tocar el árbol.
- **Archivos relacionados.** Informe 12 §2–§5.
- **Precauciones.** No usar `git pull` ni `checkout` sobre archivos modificados. Los PRs de
  Dependabot no son trabajo del equipo.

### Skill: Evaluación de escalabilidad PostgreSQL + PostGIS por capas

- **Qué aprendimos.** Para encontrar el cuello hay que medir capa por capa:
  1. HTTP con el CPU de cada PID;
  2. SQL con `EXPLAIN ANALYZE`;
  3. `pgbench` **dentro** del contenedor;
  4. las mismas consultas desde el host.

  Así apareció que el techo local era el puerto de Docker Desktop, no la base. También que el
  bbox del benchmark devuelve vacío con pocos datos.
- **Cómo se aplicó.**
  - `medir.mjs` y `medir-rr.mjs`: carga con CPU por PID y round-robin.
  - `explicar.mts` y `explicar2.mts`: `EXPLAIN` con el SQL real, en `BEGIN READ ONLY`.
  - `sql-literal.mts` + `pgbench -n -f`.
  - `pg-desde-windows.mjs`.

  Todos están en el directorio temporal de la sesión (scratchpad), fuera del repo.
- **Archivos relacionados.**
  - `api-core/src/consultas.ts` y `vistas.ts`;
  - `geo-service/src/visibilidad.ts`;
  - `scripts/banco-*.mjs`;
  - informe 12 §17–§22.
- **Precauciones.**
  - `docker stats` da el % por núcleo, y la base está limitada a 4 CPU.
  - Con `tsx`, el *top-level await* exige `.mts`, y en Windows las importaciones absolutas exigen
    `file:///C:/…`.
  - Los comentarios `--` del SQL rompen al pasarlo a una línea: hay que quitarlos.
  - Los servicios en modo dev llevan `pino-pretty` y el rol SUPERUSER.

### Skill: Base de revisión aislada y datos sintéticos reversibles

- **Qué aprendimos.** Una base aparte en el mismo contenedor (`curichi_revision`) permite medir
  sin tocar la del usuario.
  - `banco-datos.mjs generar N` inserta con marca; `limpiar` borra por marca y hace `VACUUM`.
  - El login fallido de `banco-carga` llena `intento_login`.
- **Cómo se aplicó.**
  - `DATABASE_URL` tomada de `.env`, cambiando `/curichi` por `/curichi_revision`, sin imprimirla;
  - generar 100 000 → medir → `limpiar` → `DELETE FROM intento_login`.
- **Precauciones.**
  - Nunca contra `curichi`.
  - Nunca `docker compose down -v`.
  - El mantenimiento de `api-core` (30 s después de arrancar) podría hacer un recálculo completo
    de DBSCAN con los sintéticos. Para las instancias extra se usó
    `MANTENIMIENTO_ESPERA_MS=86400000`.

### Skill: Levantar servicios sin terminal integrada

- **Qué aprendimos.** `run_in_terminal` falló y la regla dice no correr servidores con Bash. Lo que
  funcionó:
  - un script `.ps1` en el scratchpad, con las variables de entorno;
  - una entrada **temporal** en `.claude/launch.json`;
  - `preview_start` para arrancarlo;
  - revertir `launch.json` enseguida (copia en `scratchpad/launch.json.original`).
- **Cómo se aplicó.** `bench-api-core.ps1`, `bench-geo-service.ps1` y `bench-api-core-{2,3}.ps1`.
  - Las instancias extra usan `API_CORE_PORT=3012/3013`.
  - Los límites por IP se subieron solo por variable de entorno.
- **Precauciones.** En `.ps1` generados desde bash usar rutas con `/`: los `\` se pierden al
  escaparlos. Detener con `preview_stop` al terminar.

### Skill: Medir el contexto de Claude Code y hooks de continuidad

- **Qué aprendimos.**
  - El transcript JSONL (`~/.claude/projects/<proyecto>/<sesión>.jsonl`) trae `message.usage` en
    cada mensaje del asistente, y `system/compact_boundary` con `compactMetadata.preTokens`.
  - El resumen de compactación es un mensaje `user` con `isCompactSummary: true`.
  - `PostToolUse` puede inyectar `additionalContext`.
  - El watcher cargó `settings.local.json` en vivo.
- **Cómo se aplicó.** `ContextosySkills/hooks/contexto.mjs` y su README.
- **Precauciones.** No existe un evento al 70 %: es una **estimación**. Ver README §6.

## 21. Herramientas utilizadas

- **git y `gh`.**
- **Docker:** `docker exec` para `psql` y `pgbench`, `docker stats`, `docker start`/`stop` de
  `curichi-minio`.
- **Node 24 / `tsx`.**
- **Scripts del repo:** `scripts/banco-carga.mjs`, `banco-datos.mjs`, `banco-sostenido.mjs`.
- **Browser pane:** `preview_start`, `preview_stop`, `preview_logs`.
- **Skill `update-config`**, para los hooks.

## 22. Archivos importantes

- **Manual:** `CLAUDE.md`, sobre todo §0 reglas de oro, §5 carpetas, §7 modelo y API, §12.4
  proceso.
- **Estado del proyecto:** `docs/TRASPASO.md`.
- **Conclusiones de la FASE 2:** `docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md`.
- **Código citado:**
  - `packages/contracts/src/esquemas/reporte.ts:331`;
  - `services/geo-service/src/proxy.ts:17`;
  - `apps/web-ciudadano/src/componentes/FormularioReporte.tsx:948,1027`;
  - `apps/panel-admin/src/lib/api.ts:224`.
- **Infra:**
  - `docker-compose.yml` (límites: postgis 4 CPU / 1,5 GiB; `work_mem` 8 MB);
  - `infra/proxy/Caddyfile` (sin `encode`).

## 23. Documentación generada

| Archivo | Sesión | Qué es |
|---|---|---|
| `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | 10-06 | Vista general. El 10-07 se le sumó un enlace al 12 |
| `docs/arquitectura/README.md`, `00`–`11` | 10-06 | Informes por parte |
| `docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md` | 10-07 | **Nuevo; principal de la FASE 2** |
| `ContextosySkills/README.md`, `VentanaContextoSesion1.md`, `hooks/contexto.mjs` | 10-07 | Sistema de continuidad |
| `.claude/settings.local.json` | 10-07 | Configuración de los hooks |

El 10-07 se agregaron **notas fechadas, sin borrar nada**, en:

- el README de `docs/arquitectura/` (fila 12);
- el `00` (estado de la pila al 10-07);
- el `11`, en §A.2 (corolario de réplicas) y §A.3 (agregado más lento).

## 24. Trabajo completado

FASE 2 completa:

- Git investigado.
- Reanálisis del código.
- Acoplamiento medido.
- Mediciones a 37 y a 100 000 reportes.
- 1 contra 3 instancias.
- `pgbench`.
- `EXPLAIN`.
- Benchmarks clasificados.
- Informe 12 con 33 secciones.
- Docs anteriores con notas.
- `ContextosySkills` con hooks probados.

Estado final del entorno:

- **Servicios:** los de medición detenidos y `launch.json` revertido.
- **Docker Desktop:** quedó **encendido**. Al empezar estaba apagado y lo encendí.
- **Contenedores:** `curichi-postgis` y `curichi-minio` corriendo; `curichi-api-core` y
  `curichi-geo-service` siguen detenidos, como estaban.

## 25. Trabajo pendiente

Nada pendiente de la FASE 2. El usuario dará las siguientes instrucciones.

Pendientes del proyecto (no de esta fase):

- tarea 9 de la Fase 1 (`docs/TRASPASO.md`);
- D2–D7;
- informe 12 §30.

## 26. Próximo paso exacto

**Esperar las instrucciones del usuario.** No empezar ninguna fase del roadmap (informe 12 §31) sin
aprobación.

Si el usuario pide seguir con la escala o el ecosistema:

1. Proponer primero la **FASE 1 del roadmap**: medir en modo producción en Linux.
2. Seguir con la **FASE 2 del roadmap**: los ADR del modelo de reporte genérico.
3. En ambos casos, con un plan aprobado según CLAUDE.md §12.4.

## 27. Instrucciones importantes para continuar después de /compact

1. Leer este archivo y `ContextosySkills/README.md`.
2. Verificar git:
   - `git status`;
   - `git log -1`, que debería ser `3121a0f` salvo que el usuario haya commiteado;
   - `git fetch --prune` si importa el remoto.
3. Releer `CLAUDE.md` §0. Reglas que siguen en pie:
   - no commitear ni subir sin pedido;
   - no tocar `data/raw/`;
   - no hacer `docker compose down -v`;
   - no imprimir valores del `.env`.
4. Si se mide de nuevo:
   - usar **solo `curichi_revision`**;
   - lanzar con el patrón `.ps1` + `launch.json` temporal + `preview_start`;
   - revertir y limpiar al terminar.
5. Para conclusiones, citar el informe 12, no este snapshot.
6. El próximo snapshot es **`VentanaContextoSesion2.md`**. Si algo de aquí cambia, anotarlo como
   «Estado anterior / Estado actual».

## 28. Resumen ejecutivo de continuidad

La FASE 2 terminó el 2026-10-07 sobre `main` = **`3121a0f`**, la versión correcta y completa:

- PR #1 fusionado;
- ramas contenidas;
- solo Dependabot pendiente.

No se implementó nada.

**Arquitectura.** Mi Curichi es un monolito modular (`api-core` escribe, `geo-service` lee) con
contratos fuertes y la base como autoridad. La mitad es plataforma reutilizable. La otra mitad
(tabla y `ENUM`, severidad, formulario, panel) está cableada a inundación, y **no existe** la
categoría.

**Medición.** El cuello depende del escenario:

- Node (~75 rps de mapa por instancia en dev) con la base holgada;
- PostgreSQL al crecer el volumen o con poca CPU;
- Argon2 en los logins (12–17/s por instancia).

**Capacidad.** ~1 000 usuarios concurrentes entran **ESTIMADO**; 10 000 exigen cambios; 100 000 es
**DESCONOCIDO**.

**Recomendación.** Estrategia **D** (núcleo + módulos, separar solo con métricas). Roadmap:

1. medir en producción;
2. ADR del modelo;
3. núcleo;
4. baches;
5. basura;
6. escala del camino de lectura;
7. áreas verdes;
8. producción.

Todo está en `docs/arquitectura/12-…`. El sistema de continuidad tiene hooks reales:

- aviso estimado al 70 % y al 85 % por `PostToolUse`;
- registro en `PreCompact`;
- reanudación en `SessionStart` con `compact`.

**Próximo paso:** esperar al usuario.
