# ContextosySkills — continuidad de contexto de Claude Code

Carpeta **exclusiva** para snapshots de continuidad de las sesiones de Claude Code en este repo.

- **No** es documentación del proyecto.
- **No** forma parte de la aplicación.
- **No** se mezcla con `docs/`.

Creada el 2026-10-07, en la FASE 2. La política vigente es la del 2026-10-07 (FASE 3, §3).

## 1. Para qué sirve

Para poder compactar (`/compact` o la compactación automática) **sin perder** lo que no está en el
código:

- qué se estaba haciendo;
- qué se descubrió y qué se decidió;
- qué versión de git se usa;
- qué no hay que hacer;
- qué técnicas sirvieron;
- cuál es el próximo paso exacto.

## 2. Contexto temporal vs. documentación permanente

| | Documentación permanente | Contexto temporal (esta carpeta) |
|---|---|---|
| Dónde | `CLAUDE.md`, `docs/`, `PROJECT_STRUCTURE_AND_FUNCTIONALITY.md` | `ContextosySkills/VentanaContextoSesionN.md` |
| Qué guarda | Conocimiento estable del proyecto | Estado de trabajo de una sesión: progreso, decisiones, hallazgos recientes, skills, próximo paso |
| Cuándo cambia | Con el proyecto | Un archivo nuevo por ciclo de contexto; los anteriores **no se tocan** |

Un snapshot **no copia** la documentación permanente: la **enlaza** y guarda solo lo necesario para
retomar.

## 3. Política de snapshots (vigente desde el 2026-10-07)

### Cuándo se crea uno

**Solo cuando el contexto estimado de la sesión supera el 70 %**, y **uno por ciclo**:

```text
contexto ≤ 70 %  →  NO se crea snapshot
contexto > 70 %  →  se crea VentanaContextoSesionN.md (una sola vez en el ciclo) y Claude lo completa
compactación     →  termina el ciclo; el siguiente snapshot solo si el contexto vuelve a superar el 70 %
```

**No** se crea un snapshot:

- al cerrar una fase o una tarea;
- por debajo del 70 % (ni al 50 % ni al 58 %);
- por un `/compact` manual hecho por debajo del 70 %: en ese caso se usa el último snapshot que
  exista;
- por cada herramienta usada mientras el contexto sigue por encima del 70 %.

### Numeración

- `N` = el mayor existente + 1, sin ceros a la izquierda.
- **Nunca** se sobrescribe ni se borra un snapshot anterior: el script crea con `wx`, que falla si el
  archivo existe.
- Lo único que se edita es el **esqueleto del ciclo actual**, para completarlo.
- Si algo cambió respecto de un snapshot anterior, el nuevo lo dice así: «**Estado anterior**
  (Sesión K): … / **Estado actual**: …».

### Ciclo de vida

1. **Esqueleto.** El hook lo crea con:
   - la primera línea `<!-- ContextosySkills:esqueleto … -->`;
   - los datos mecánicos ya cargados: fecha, % estimado, transcript, remoto, rama, commit, archivos
     con cambios;
   - las 28 secciones vacías.
2. **Snapshot completo.** Claude completa las 28 secciones y **borra la primera línea**.

## 4. Qué contiene cada snapshot (plantilla obligatoria)

```markdown
# Ventana de Contexto — Sesión N
## 1. Objetivo actual de la sesión
## 2. Estado actual del proyecto
## 3. Repositorio Git analizado
## 4. Branch actual
## 5. Commit exacto
## 6. Branches investigadas
## 7. PRs investigadas
## 8. Cambios recientes relevantes
## 9. Estado de sincronización
## 10. Arquitectura comprendida
## 11. Estructura comprendida
## 12. Componentes importantes
## 13. Flujos importantes
## 14. Hallazgos
## 15. Problemas encontrados
## 16. Problemas que NO deben corregirse todavía
## 17. Decisiones tomadas
## 18. Suposiciones
## 19. Información pendiente de confirmar
## 20. Skills / técnicas aprendidas
## 21. Herramientas utilizadas
## 22. Archivos importantes
## 23. Documentación generada
## 24. Trabajo completado
## 25. Trabajo pendiente
## 26. Próximo paso exacto
## 27. Instrucciones importantes para continuar después de /compact
## 28. Resumen ejecutivo de continuidad
```

### Sección 20 (skills)

Solo técnicas **realmente usadas** en la sesión. Formato de cada una:

- **Skill**
- **Qué aprendimos**
- **Cómo se aplicó**
- **Archivos relacionados**
- **Precauciones / qué falta**

## 5. Cómo funciona la automatización

Usa mecanismos **reales** de Claude Code, verificados el 2026-10-07 con Claude Code 2.1.288.

- **Configuración:** `.claude/settings.local.json`. Es local de esta máquina, no está versionado y no
  toca la configuración del equipo.
- **Script:** `ContextosySkills/hooks/contexto.mjs`.

| Hook | Evento real | Qué hace |
|---|---|---|
| **Uso de contexto** | `PostToolUse` (todas las herramientas) | Estima el % del hilo principal. Si **supera el 70 %** y el ciclo no tiene snapshot, **crea el esqueleto** `VentanaContextoSesionN.md` y le inyecta a Claude (`additionalContext`) la orden de completarlo antes de seguir. Si pasa del 85 % y el esqueleto sigue sin completar, **un único** recordatorio (no crea otro archivo). Por debajo del 70 % no hace nada |
| **Antes de compactar** | `PreCompact` (`manual` y `auto`) | Lo registra en `.estado/registro.jsonl`. **Solo si el contexto supera el 70 %** y el ciclo no tiene snapshot (por ejemplo, porque no hubo herramientas entre el 70 % y la compactación), crea el esqueleto como respaldo. Por debajo del 70 % no crea nada |
| **Después de compactar** | `SessionStart` con matcher `compact` | Abre un ciclo nuevo y le dice a Claude qué snapshot leer. Si el último quedó como esqueleto, pide **completar ese mismo archivo** con el resumen de compactación; si no, que **no** cree uno nuevo. Guarda una copia del resumen en `.estado/` |

### Cómo se evitan los duplicados

1. El estado de cada sesión (`.estado/uso-<sesión>.json`) guarda la **generación** del ciclo y el
   snapshot que le corresponde.
2. La creación usa una marca `.estado/ciclo-<sesión>-g<generación>.marca` abierta con `wx`. Si varias
   herramientas en paralelo cruzan el 70 % a la vez, **una sola** crea el archivo; las demás leen el
   número de la marca.
3. El ciclo se **rearma** con `SessionStart compact`, o cuando el uso baja del 50 %, que solo ocurre
   después de compactar.

**Solo cuenta el hilo principal.** El script actúa solo si el transcript es
`<session_id>.jsonl`; los transcripts de subagentes se ignoran.

### Qué hay en `.estado/`

Lo ignora git mediante su propio `.gitignore`.

| Archivo | Contenido |
|---|---|
| `registro.jsonl` | Esqueletos, recordatorios, compactaciones, reanudaciones y errores, uno por línea |
| `uso-<sesión>.json` | Último uso estimado y ciclo |
| `ciclo-*.marca` | Una marca por ciclo que ya tiene snapshot |
| `resumen-compactacion-<fecha>.md` | Copia del resumen generado al compactar |

### Comandos útiles

- Ver el estado:

  ```bash
  node ContextosySkills/hooks/contexto.mjs estado <ruta-del-transcript>
  ```

  Muestra el % estimado, el ciclo, el último snapshot y si es un esqueleto.
- Probar sin tocar esta carpeta: definir `CONTEXTO_CARPETA=<carpeta temporal>` y
  `CLAUDE_PROJECT_DIR=<repo>`.

## 6. Limitaciones (importante)

1. **Claude Code no informa el porcentaje exacto de contexto** a los hooks, y ningún evento se dispara
   al 70 %.
   - El 70 % se **estima** con datos reales del transcript: `input_tokens`,
     `cache_read_input_tokens` y `cache_creation_input_tokens` del último mensaje del asistente.
   - Se divide por una **ventana inferida de 1 000 000 tokens**.
2. **Por qué 1 M.** La compactación automática del 2026-10-07 ocurrió con `preTokens = 977 626`
   (metadato `compact_boundary`, `claude-opus-5-5`). Con otro modelo o ventana hay que cambiar
   `CONTEXTO_VENTANA_TOKENS`; si no, el umbral se cruza tarde o temprano.
3. **Solo se mide cuando se usa una herramienta.** Entre el 70 % y una compactación sin herramientas
   de por medio, el respaldo es `PreCompact` (con esqueleto).
4. **El hook crea el esqueleto, no el contenido.** Un hook de comandos no puede generar el resumen.
   - Las 28 secciones las completa Claude cuando recibe la orden.
   - `PreCompact` no le da un turno a Claude: si el esqueleto se crea ahí, se completa al volver,
     con el resumen de compactación.
5. **Verificación del 2026-10-07**, sobre una carpeta temporal y con el transcript real. Todo dio lo
   esperado, sin errores:
   - por debajo del 70 % no crea nada;
   - por encima crea un solo esqueleto y un solo recordatorio;
   - al rearmar abre un ciclo nuevo;
   - en una carrera de 3 procesos, crea 1 archivo;
   - `PreCompact` manual ≤ 70 % no crea; automático > 70 % crea el respaldo;
   - `SessionStart` pide completar el esqueleto;
   - un transcript de subagente se ignora.

   `PostToolUse` está activo en vivo en la sesión. `PreCompact` y `SessionStart` reales se ejercitan
   en la próxima compactación.
6. El hook corre `node` en **cada** uso de herramienta (unos 100 ms en Windows). Para apagarlo, quitá
   el bloque `hooks` de `.claude/settings.local.json`.

## 7. Qué NO hace este sistema

- No modifica código, configuración de la aplicación, base de datos, migraciones ni ramas.
- No hace commits ni push.
- Git se consulta solo en lectura (`--no-optional-locks`).
- Escribe solo en `ContextosySkills/.estado/` y crea `VentanaContextoSesionN.md` nuevos.

## 8. Antes de un `/compact` manual

| Contexto | Qué hacer |
|---|---|
| **≤ 70 %** | Compactá tranquilo: **no** se crea snapshot y al volver se usa el último existente. |
| **> 70 %** | El esqueleto del ciclo ya existe. Verificá que Claude lo haya **completado** (sin la línea de esqueleto) antes de compactar |

## 9. Después de compactar

`SessionStart` ya se lo indica a Claude. Si no apareciera:

1. Buscar el snapshot más reciente (mayor N) en esta carpeta.
2. Leerlo completo, y este README.
3. Si es un **esqueleto**, completarlo con el resumen de compactación (copia en `.estado/`).
   **No** crear otro.
4. Verificar git de nuevo (`git status`, `git log -1`).
5. Seguir desde **«26. Próximo paso exacto»**. No empezar de cero.

## 10. Índice de snapshots

| N | Fecha | Motivo | Política |
|---|---|---|---|
| 1 | 2026-10-07 | Cierre de la FASE 2 (contexto ≈ 39 %) | **Anterior**: se escribía al cerrar una fase |
| 2 | 2026-10-07 | Cierre de la FASE 3 (contexto 58,7 %) | **Anterior**: se escribía al cerrar una fase |
| 3 | 2026-10-07 | Contexto > 70 % (70,6 %), durante M0 | **Vigente**: esqueleto automático (`PostToolUse`), completado por Claude |

Los snapshots 1 y 2 se conservan por trazabilidad. Desde el 2026-10-07 **no** se crean snapshots por
debajo del 70 %.

## 11. Historial de la política

| Fecha | Política | Motivo del cambio |
|---|---|---|
| 2026-10-07 (FASE 2) | Hook de aviso al 70 % y al 85 % (dos avisos por ciclo); Claude escribía el snapshot. Además se escribía uno al cerrar cada fase | Primera versión |
| 2026-10-07 (FASE 3) | **Solo > 70 %, uno por ciclo**, con el esqueleto creado por el hook, marca anti-duplicado, solo el hilo principal, `PreCompact` como respaldo solo > 70 %, sin snapshots al cerrar fases | Pedido del usuario: evitar snapshots prematuros o duplicados |
