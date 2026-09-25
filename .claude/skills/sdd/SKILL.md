---
name: sdd
description: Proceso Spec-Driven Development de Mi Curichi para cualquier cambio nuevo. Clasifica el cambio por parte y riesgo, produce una spec que el usuario aprueba, escribe pruebas que fallan, implementa dentro de la carpeta designada y verifica con subagentes en paralelo. Usar cuando el usuario pida /sdd o un cambio "por SDD".
argument-hint: "<descripción del cambio>"
disable-model-invocation: true
---

# /sdd — verificación de cambios por especificación

Diseño completo: `docs/superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md`.
Manual corto: `docs/proceso/sdd.md`. Matriz de riesgo: [matriz-de-riesgo.md](matriz-de-riesgo.md).
Plantillas: [plantillas/](plantillas/).

Cambio pedido: **$ARGUMENTS**

Sos el **agente principal**. Coordinás; los subagentes `sdd-*` de `.claude/agents/` hacen el
trabajo de cada fase. Cada fase termina con un mensaje corto al usuario (qué se hizo, qué sigue).
El usuario quiere mensajes resumidos: nada de narrar el proceso.

## Reglas duras (no se negocian, ni «solo esta vez»)

1. Sin spec aprobada no hay pruebas. Sin pruebas en rojo no hay implementación.
2. Un solo escritor a la vez en código: F1 → F2 → F3 en serie. F4 corre en paralelo porque es de
   solo lectura.
3. Un test que pasa antes de implementar es un error de spec o de test, no un éxito.
4. «Verde» sin salida pegada no cuenta. «No verificado» con motivo vale más que un PASS inventado.
5. Ningún subagente commitea, hace push ni abre PR. Lo hacés vos, tras la puerta 2.
6. Nada fuera de la carpeta designada sin autorización explícita del usuario con archivo, motivo
   y riesgo (CLAUDE.md §5.2). `CLAUDE.md` y `data/raw/` nunca sin autorización.
7. Máximo dos vueltas implementador ↔ verificación; a la tercera, parás y consultás.

## F0 — Clasificar (lo hacés vos)

1. Deducí la **parte** y la **carpeta designada** por dónde hay que tocar (CLAUDE.md §5.3). Si
   hacen falta carpetas de dos partes, decilo y proponé dividir en corridas; seguí solo con la
   primera si el usuario acepta.
2. Activá **banderas** con [matriz-de-riesgo.md](matriz-de-riesgo.md): por rutas que se van a
   tocar y por palabras de la descripción. En la duda, se activa.
3. Si toca `packages/contracts`, anunciá «cambio de contrato» explícitamente.
4. Creá la rama `feat/<scope>/<slug>` o `fix/<scope>/<slug>` desde la rama actual (scope de
   §12.2) y la carpeta `docs/sdd/<aaaa-mm-dd>-<slug>/`.
5. Mostrá al usuario, en 5 líneas: parte, carpeta, banderas, contrato sí/no, rama.

## F1 — Especificar

Lanzá `sdd-especificador` (Agent, `run_in_background: false`) con: la descripción literal, la
clasificación de F0, la ruta de la corrida y la ruta de la plantilla
`.claude/skills/sdd/plantillas/spec.md`.

**Puerta 1.** Mostrá al usuario un resumen de la spec (objetivo, criterios en una línea cada uno,
preguntas abiertas) y la ruta del archivo, y pedí el «aprobado» con AskUserQuestion. Si hay
preguntas BLOQUEANTES, van en esa misma pregunta. Si pide cambios, reenviáselos al mismo
especificador con SendMessage (conserva el contexto) y volvé a presentar. **Sin aprobado no
seguís.**

## F2 — Pruebas en rojo

Lanzá `sdd-redactor-de-pruebas` con: la ruta de `spec.md`, la clasificación, la ruta de la
plantilla `pruebas.md`. **No le pases la descripción original.**

Al volver, leé `pruebas.md`. Comprobá que hay al menos una fila por criterio y que cada fila tiene
salida en rojo. Si alguna prueba pasó sin implementación o un criterio no resultó probable, volvé
a F1 con ese hallazgo (SendMessage al especificador) y repetí la puerta 1 solo para lo cambiado.

## F3 — Implementar

Lanzá `sdd-implementador` con: rutas de `spec.md` y `pruebas.md`, carpeta designada, si hay cambio
de contrato anunciado, y la lista de archivos de test nuevos. **No le pases la descripción
original.**

Al volver:
- Si pide autorización para tocar algo fuera de la carpeta, preguntale al usuario con archivo,
  motivo y riesgo (AskUserQuestion). Con el sí, aplicá vos el cambio o reenviáselo al
  implementador con SendMessage.
- Si dice que una prueba contradice la spec, volvé a F1.
- Registrá sus hallazgos fuera de carpeta para el informe.

## F4 — Verificar (paralelo)

En **una sola llamada** lanzá:
- `sdd-revisor` siempre.
- `sdd-auditor` si hay bandera `seguridad` o `privacidad`, o si el diff toca `services/api-core`,
  fotos o autenticación.
- `sdd-verificador` siempre, con las banderas, la carpeta de corrida y la ruta de
  `matriz-de-riesgo.md` y de la plantilla `verificacion.md`.

A los tres pasales: ruta de `spec.md` y `pruebas.md`, carpeta designada, banderas y el rango del
diff (`git diff <rama-base>...HEAD`, donde la rama base es la de la que salió la corrida).

Si el revisor o el auditor devuelven hallazgos BLOQUEANTES o IMPORTANTES, reenviáselos al
implementador con SendMessage y repetí F4 solo para lo afectado. Cuenta como una vuelta.

## F5 — Cerrar

Escribí `docs/sdd/<corrida>/informe.md` con la plantilla `plantillas/informe.md`: resumen, tabla
CA → test → estado, hallazgos y su resolución, lo no verificado y por qué, hallazgos fuera de
carpeta, y la plantilla de `.github/PULL_REQUEST_TEMPLATE.md` rellenada.

**Puerta 2.** Mostrá al usuario el informe en 10 líneas y pedí el «aprobado» para commitear.
Con el sí: commit con Conventional Commits en español y scope (§12.2); los cuatro artefactos van
en el mismo commit. Si el usuario pide PR, abrilo con el informe como cuerpo. Si no, decí en una
línea cómo levantar la pila para probarlo (`pnpm db:local`, `pnpm dev`) o levantala si lo pide.

## Si algo del entorno falla

- `pnpm` roto en la shell (`.tools\pnpm\12.4.1` no ejecutable): usar `npx -y pnpm@12.4.1 …` o un
  shim en el scratchpad que lo llame; nunca `--no-verify` en el commit.
- PGlite degradada (`ECONNRESET`, PIP que devuelve `dentro_cobertura: false` donde antes `true`):
  reiniciar `pnpm db:local`. Está documentado en `docs/TRASPASO.md` §7.6.
- Rate limit acumulado en E2E: ver `e2e/README.md`; cerrar el `pnpm dev` suelto y dejar que
  Playwright levante el suyo.
