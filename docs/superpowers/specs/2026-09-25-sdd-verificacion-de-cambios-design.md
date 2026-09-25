# SDD — verificación de cambios por especificación, con subagentes

- **Fecha:** 2026-09-25
- **Parte:** 5 (calidad). Carpetas que toca: `docs/`, `.claude/` (raíz de configuración, declarada).
- **Estado:** diseño aprobado por el usuario en conversación; pendiente el plan de implementación.

## 1. Problema

El repositorio ya tiene suites (221 tests unitarios e integración, 23 E2E, CI con secretos, audit,
OpenAPI regenerado y migraciones contra PostgreSQL real) y un `PR_CHECKLIST.md` completo. Lo que
no tiene es un **proceso repetible** que convierta «quiero hacer el cambio X» en: especificación
con criterios de aceptación → pruebas que fallan → implementación acotada → verificación cruzada
con evidencia. Hoy eso depende de la disciplina de quien ejecuta, y `docs/TRASPASO.md` muestra
que los defectos graves (fugas de ubicación por el `bbox`, dos conexiones del pool por petición,
el worker de MapLibre que nunca arrancó, la CSP que dejó el mapa en negro) aparecieron
**ejecutando**, no leyendo.

## 2. Objetivo

Un comando `/sdd <descripción del cambio>` que:

1. clasifica el cambio por parte, carpeta designada y banderas de riesgo;
2. produce una especificación que el usuario aprueba antes de escribir código;
3. escribe pruebas que **fallan** por cada criterio de aceptación, en la capa correcta;
4. implementa dentro de la carpeta designada hasta ponerlas en verde;
5. verifica en paralelo con agentes de solo lectura y ejecuta las suites que la matriz de riesgo
   exige, capturando la salida literal;
6. cierra con un informe que sirve de cuerpo del PR y con una segunda aprobación del usuario.

Cada fase la ejecuta un subagente con rol fijo, prompt propio y contexto separado, definido en
`.claude/agents/`.

## 3. Fuera de alcance

- No modifica ninguna suite existente ni código de las partes 1 a 4.
- No sustituye el CI ni el `PR_CHECKLIST.md`: los usa.
- No implementa un pipeline determinista con el Workflow tool (queda como evolución posible).
- No cubre despliegue ni Fase 2.

## 4. Entregables

| Pieza | Ruta | Contenido |
|---|---|---|
| Este diseño | `docs/superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md` | Fases, roles, matriz, puertas, artefactos |
| Manual corto | `docs/proceso/sdd.md` | Cómo se usa, qué produce, qué no hace. Enlazado desde `docs/README.md` y desde `CONTRIBUTING.md` §3 (raíz: requiere autorización, ya concedida en este diseño) |
| Skill | `.claude/skills/sdd/SKILL.md` | El comando. Contiene las fases, las puertas y los prompts de lanzamiento de cada agente |
| Matriz de riesgo | `.claude/skills/sdd/matriz-de-riesgo.md` | Bandera → cuándo se activa → agentes y comandos obligatorios. Es la única fuente de esa tabla; el manual la enlaza |
| Plantillas | `.claude/skills/sdd/plantillas/{spec,pruebas,verificacion,informe}.md` | Esqueletos de los cuatro artefactos por cambio |
| Agentes | `.claude/agents/sdd-especificador.md`, `sdd-redactor-de-pruebas.md`, `sdd-implementador.md`, `sdd-revisor.md`, `sdd-auditor.md`, `sdd-verificador.md` | Frontmatter (`name`, `description`, `model`, `tools`) + prompt de sistema |
| Carpeta de corridas | `docs/sdd/README.md` | Explica qué hay ahí y cómo se nombra cada carpeta |

## 5. Fases

```
/sdd "descripción"
  F0 Clasificar ───────── agente principal ──▶ parte, carpeta designada, banderas
  F1 Especificar ──────── sdd-especificador ──▶ spec.md         ══ PUERTA 1: el usuario aprueba
  F2 Pruebas en rojo ──── sdd-redactor-de-pruebas ──▶ pruebas.md (salida en rojo, literal)
  F3 Implementar ──────── sdd-implementador ──▶ código en verde, hallazgos fuera de carpeta
  F4 Verificar (paralelo, solo lectura):
        sdd-revisor       cumplimiento de la spec y convenciones
        sdd-auditor       seguridad y privacidad (solo con bandera)
        sdd-verificador   comandos de la matriz + salida literal ──▶ verificacion.md
  F5 Cerrar ───────────── agente principal ──▶ informe.md, PR    ══ PUERTA 2: el usuario aprueba
```

### F0 — Clasificar (agente principal, sin subagente)

Entrada: la descripción del usuario. Salida: un bloque corto en chat con parte, carpeta designada,
banderas activas y, si hay cambio de contrato, el aviso explícito que exige `CLAUDE.md` §5.2.

Reglas:
- La parte se deduce de la carpeta que hay que tocar. Si la descripción exige tocar dos carpetas
  de partes distintas, el agente lo dice y propone dividir en dos corridas. No sigue.
- Las banderas se activan por **rutas** (qué archivos se van a tocar) y por **palabras clave** de la
  descripción, según `matriz-de-riesgo.md`. En la duda, la bandera se activa: el costo de una
  verificación de más es tokens; el de una de menos ya está documentado en `TRASPASO.md`.
- Crea la rama `feat/<scope>/<slug>` o `fix/<scope>/<slug>` (§12.2) si no existe, y la carpeta
  `docs/sdd/<aaaa-mm-dd>-<slug>/`.

### F1 — Especificar (`sdd-especificador`)

Entrada: descripción, clasificación, `CLAUDE.md`, `docs/TRASPASO.md`, el código afectado.
Salida: `docs/sdd/<corrida>/spec.md` con estas secciones, todas obligatorias:

1. Objetivo en una frase.
2. Alcance y fuera de alcance.
3. Parte, carpeta designada, cambios de contrato (sí/no y cuáles).
4. Criterios de aceptación numerados, cada uno en Dado / Cuando / Entonces, observables y
   verificables por una prueba automática. Sin adjetivos («rápido», «robusto») sin número.
5. Invariantes que el cambio no puede romper (por ejemplo: «la vista pública sigue filtrando por
   `geom_publico`», «`severidad_calculada` sigue siendo función pura»). El especificador las toma
   de `CLAUDE.md` §0, §7, §9 y §13 según las banderas.
6. Riesgos por bandera y qué prueba los cubre.
7. Lo que no se va a poder verificar en esta máquina y por qué (se rellena en F4, pero la spec
   deja el hueco).
8. Preguntas abiertas para el usuario. Si hay alguna que bloquee, la spec no se da por lista.

El especificador **no propone diseño de código** más allá de nombrar archivos y funciones
existentes que se van a tocar. Diseño de implementación es trabajo de F3.

**Puerta 1.** El agente principal muestra la spec al usuario y espera un «aprobado» explícito. Sin
él no hay F2. Si el usuario pide cambios, vuelve a F1 con el mismo agente (SendMessage) para no
perder contexto.

### F2 — Pruebas en rojo (`sdd-redactor-de-pruebas`)

Entrada: **solo** `spec.md` y la clasificación. No recibe la descripción original del usuario.
Salida: archivos de test nuevos o ampliados y `docs/sdd/<corrida>/pruebas.md`.

Reglas:
- Un criterio de aceptación ⇒ al menos una prueba. La capa se elige con esta tabla:

| Qué afirma el criterio | Capa | Dónde |
|---|---|---|
| Un enum, esquema Zod, severidad, jitter | contracts | `packages/contracts/test/` |
| Una función pura o un módulo sin red ni base | unitaria | `test/` o `src/**/*.test.ts` del paquete |
| Un endpoint, una transición de estado, una consulta | integración con PGlite | `services/*/test/` |
| Concurrencia real, locks, privilegios | PostgreSQL real | `*-pg.test.ts` con `DATABASE_URL_PG_REAL` |
| Una pantalla, un recorrido, accesibilidad | E2E | `e2e/tests/` |

- Cada prueba nueva se ejecuta y **debe fallar por la razón que describe el criterio**, no por un
  import roto ni un tipo que no existe. Si falla por otra causa, el redactor lo corrige antes de
  seguir. Si pasa sin implementación, el criterio está mal (ya se cumple, o no es observable) y
  vuelve a F1.
- `pruebas.md` lleva la tabla criterio → archivo:línea del test → comando → salida literal del
  fallo (recortada a lo relevante).
- Prohibido tocar código de producción. Prohibido `.only`, `.skip` nuevos, y `any` sin comentario.
- Los tests siguen las convenciones de los que ya existen en el paquete (mismos helpers, misma
  forma de levantar PGlite, mismos `data-testid`).

### F3 — Implementar (`sdd-implementador`)

Entrada: `spec.md`, `pruebas.md`, la lista de tests en rojo. Tampoco recibe la descripción original.
Salida: código en la carpeta designada; lista de hallazgos fuera de carpeta (archivo, línea,
síntoma, riesgo) en el chat de vuelta.

Reglas:
- Mínimo código que pone en verde las pruebas de F2 sin romper el resto (`pnpm --filter <paquete> test`).
- Solo escribe en la carpeta designada, más `packages/contracts/` si F0 anunció cambio de contrato
  (y entonces también `CHANGELOG.md` y `pnpm contracts:build`), más `docs/decisiones/` para un ADR
  si la decisión fue discutible.
- Si necesita tocar algo fuera de eso, se detiene y lo reporta; el agente principal pide la
  autorización al usuario con archivo, motivo y riesgo (§5.2). No sigue por su cuenta.
- Si una prueba de F2 resulta imposible de satisfacer sin cambiar la spec, no la «arregla»: lo
  reporta y el proceso vuelve a F1.
- Variables de entorno nuevas: `.env.example` con etiqueta y `turbo.json` `globalEnv` (esto último
  es raíz; el implementador lo señala y el agente principal lo aplica con autorización).

### F4 — Verificar (tres agentes en paralelo, todos de solo lectura sobre el código)

Se lanzan en una sola llamada. Ninguno edita archivos de las partes; solo el verificador escribe
`verificacion.md`. Cada uno recibe la spec, el diff (`git diff main...HEAD`) y las banderas.

`sdd-revisor`: revisa el diff contra la spec, no contra su gusto. Comprueba, con archivo:línea:
cada criterio cubierto por código y por test; nada implementado que la spec no pida; convenciones
de `CLAUDE.md` §12 (español en dominio, `snake_case` en API, funciones de dominio puras); sin
`any` sin justificar, sin `@ts-ignore`, sin `console.log`; los hallazgos fuera de carpeta están
documentados y no tocados. Devuelve una lista ordenada por severidad; vacía si no hay nada.

`sdd-auditor` (solo si hay bandera `seguridad` o `privacidad`, o si el diff toca `services/api-core`,
fotos o autenticación): recorre `docs/seguridad/checklist-pr.md` y `CLAUDE.md` §13 punto por punto
sobre el diff. Cada punto termina en una de tres: **verificado ejecutando** (con el comando y la
salida), **verificado leyendo** (con archivo:línea) o **no aplica**. Puede correr tests dirigidos y
`curl` contra la pila levantada, nunca modificar código.

`sdd-verificador`: ejecuta exactamente los comandos que `matriz-de-riesgo.md` dicta para las
banderas activas, en el orden de la matriz, y pega en `verificacion.md` la salida literal
recortada. Reglas: nunca escribe «verde» sin la salida que lo demuestra; lo que no puede ejecutar
(Docker apagado, shapefiles ausentes) lo marca **no verificado** con el motivo; para la bandera
`ui`, abre la pantalla en el navegador integrado con `next start` (CSP de producción), lee la
consola y adjunta una captura. Reintenta una vez un fallo que parezca de entorno (puerto ocupado,
PGlite degradada, ver `e2e/README.md`) y si repite, lo reporta como fallo.

Si el revisor o el auditor devuelven hallazgos bloqueantes, el agente principal los pasa al
implementador (SendMessage, mismo contexto) y repite F4 solo para lo afectado. Máximo dos vueltas;
a la tercera se detiene y consulta al usuario.

### F5 — Cerrar (agente principal)

Produce `docs/sdd/<corrida>/informe.md` con: resumen del cambio, tabla criterio → test → estado,
hallazgos del revisor y del auditor con su resolución, lo no verificado y por qué, hallazgos fuera
de carpeta, y la plantilla de `.github/PULL_REQUEST_TEMPLATE.md` rellenada. Muestra el informe al
usuario.

**Puerta 2.** Con el «aprobado», el agente principal commitea (Conventional Commits en español con
scope; los cuatro artefactos van en el mismo commit o en uno `docs(docs): ...` aparte) y, si el
usuario lo pide, abre el PR con el informe como cuerpo. Ningún subagente commitea nunca.

## 6. Los agentes

Todos en `.claude/agents/`. Frontmatter común: `name`, `description` (cuándo usarlo), `model`,
`tools`. El prompt de cada uno empieza por leer `CLAUDE.md` §0 y §5 completos.

| Agente | Modelo | Herramientas | Escribe en |
|---|---|---|---|
| `sdd-especificador` | opus | Read, Grep, Glob, Bash (solo lectura: `git log`, `git diff`), Write | `docs/sdd/<corrida>/spec.md` |
| `sdd-redactor-de-pruebas` | opus | Read, Grep, Glob, Bash, Write, Edit | archivos de test del paquete, `e2e/tests/`, `pruebas.md` |
| `sdd-implementador` | inherit | todas | carpeta designada (+ contracts si anunciado) |
| `sdd-revisor` | opus | Read, Grep, Glob, Bash (solo lectura) | nada |
| `sdd-auditor` | opus | Read, Grep, Glob, Bash | nada (devuelve la tabla en su respuesta) |
| `sdd-verificador` | sonnet | Bash, Read, Write, navegador integrado | `docs/sdd/<corrida>/verificacion.md` |

Separación de contexto deliberada: el redactor de pruebas y el implementador son agentes distintos
y ninguno recibe la descripción original, solo la spec. Así ninguno «interpreta» al usuario por su
cuenta y ninguno acomoda las pruebas al código.

## 7. Matriz de riesgo

Vive en `.claude/skills/sdd/matriz-de-riesgo.md`. Contenido inicial:

| Bandera | Se activa por rutas | Se activa por palabras | Agentes | Comandos obligatorios |
|---|---|---|---|---|
| `base` | siempre | siempre | revisor, verificador | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm secretos` |
| `contrato` | `packages/contracts/` | payload, esquema, enum, endpoint nuevo, campo nuevo | + revisor comprueba consumidores | `pnpm contracts:build` y `git diff --quiet -- packages/contracts/openapi`; `CHANGELOG.md` tocado; typecheck de los 4 consumidores; E2E `api-contratos` |
| `privacidad` | `coordenadaPublica`, `geom_publico`, `jitter`, `exportar`, vista pública | ubicación, coordenada, jitter, público, exportación, autor | + auditor | `privacidad-ubicacion`, `vista-publica-vs-tecnica`; E2E `separacion-publica-tecnica` |
| `seguridad` | `autenticacion`, `sesion`, `fotos`, `rate`, `cuota`, `cabeceras`, `proxy` | login, sesión, rol, foto, EXIF, límite, cuota, CSP, CORS, token | + auditor (checklist completo) | `seguridad`, `autenticacion`, `fotos`, `fotos-abuso`, `cuentas-y-cuota`; `pnpm auditoria` |
| `datos` | `packages/db/migraciones/`, `packages/db/src/esquema`, seeds, privilegios | migración, tabla, columna, índice, seed, privilegio | + auditor si toca privilegios | `migrar`, `privilegios`, `db` (PGlite); con Docker: `pnpm privilegios` y `cuota-concurrencia-pg` contra PostgreSQL real; comprobar que ninguna migración anterior cambió |
| `geo` | `services/geo-service/`, `pipelines/geodata-etl/`, `puntos-criticos*` | PIP, resolver, capa, tesela, ETL, punto crítico, UV, distrito, manzana | verificador | `geo-service`, `pnpm etl:test`, `puntos-criticos-entorno`, `puntos-criticos-volumen`; E2E `datos-reales`; `node scripts/banco-consultas.mjs` sin escaneo secuencial (Docker) |
| `concurrencia` | `idempotencia`, `pool`, transacciones, `advisory` | idempotente, simultáneo, réplica, lock, pool, transacción | verificador | `idempotencia`, `pool-conexiones`; con Docker: `node scripts/banco-concurrencia.mjs` |
| `ui` | `apps/web-ciudadano/`, `apps/panel-admin/` | pantalla, mapa, formulario, botón, panel, accesible, móvil | verificador con navegador | Vitest de la app; E2E de las pantallas tocadas más `accesibilidad`, `responsive`, `resiliencia-interfaz`; captura con `next start` y consola sin errores de CSP |
| `infra` | `docker-compose.yml`, `infra/`, `.github/`, `turbo.json`, `.env.example` | Docker, CI, variable, compose, healthcheck | verificador | `docker compose --profile servicios config`; toda variable nueva en `globalEnv` y `.env.example` con etiqueta |

Las pruebas contra PostgreSQL real requieren Docker; si no está disponible, el verificador lo marca
como no verificado y el informe lo destaca. La matriz se edita cuando aparece un defecto que
ninguna bandera habría atrapado: se añade la ruta o la palabra que lo habría activado.

## 8. Artefactos por corrida

`docs/sdd/<aaaa-mm-dd>-<slug>/` versionado, con cuatro archivos siempre presentes:

| Archivo | Lo escribe | Contiene |
|---|---|---|
| `spec.md` | especificador | §5 F1 |
| `pruebas.md` | redactor de pruebas | criterio → test → comando → salida en rojo |
| `verificacion.md` | verificador | comando → salida literal → veredicto; no verificados con motivo |
| `informe.md` | agente principal | resumen, tablas, hallazgos, plantilla de PR rellenada |

`docs/sdd/README.md` explica la convención. El slug es el mismo de la rama.

## 9. Reglas duras de la skill

1. Sin spec aprobada no hay pruebas. Sin pruebas en rojo no hay implementación. La skill no acepta
   «saltemos la spec, es chico»: un cambio chico tiene una spec chica.
2. Solo un agente escribe a la vez en código (F1 → F2 → F3 en serie). F4 es paralelo porque es de
   solo lectura.
3. Un test que pasa antes de implementar es un error de spec o de test, no un éxito.
4. «Verde» sin salida pegada no cuenta. «No verificado» con motivo vale más que un PASS inventado
   (regla ya vigente en `PR_CHECKLIST.md`).
5. Ningún subagente commitea, hace push ni abre PR. Lo hace el agente principal tras la puerta 2.
6. Nada fuera de la carpeta designada sin autorización explícita con archivo, motivo y riesgo.
7. Máximo dos vueltas implementador ↔ verificación; a la tercera se consulta al usuario.

## 10. Prueba del proceso

Último paso del plan de implementación: una corrida real de `/sdd` sobre un cambio pequeño y ya
pendiente en `TRASPASO.md` §3.3 (encuadrar los reportes al abrir el mapa con `fitBounds`, Parte 1,
bandera `ui`). Sirve para comprobar que las puertas, los agentes y la matriz funcionan de punta a
punta. El cambio en sí pasa por sus propias puertas 1 y 2; si el usuario no lo aprueba, la corrida
se considera igualmente válida como prueba del proceso y se descarta la rama.

## 11. Criterios de aceptación de este diseño

1. Dado el repo limpio, cuando se invoca `/sdd "..."`, entonces F0 produce parte, carpeta y
   banderas y crea rama y carpeta de corrida, sin escribir código.
2. Dada una spec sin aprobar, cuando se intenta F2, entonces la skill se niega y pide la aprobación.
3. Dada una spec aprobada con N criterios, cuando termina F2, entonces `pruebas.md` tiene N filas
   como mínimo y cada una con salida en rojo literal.
4. Dado un implementador que necesita tocar fuera de su carpeta, cuando lo detecta, entonces se
   detiene y el agente principal pide autorización con archivo, motivo y riesgo.
5. Dadas las banderas `privacidad` o `seguridad`, cuando corre F4, entonces el auditor devuelve el
   checklist completo con una de las tres marcas por punto.
6. Dado un comando que no se puede ejecutar en la máquina, cuando corre el verificador, entonces
   `verificacion.md` lo marca «no verificado» con el motivo y el informe lo destaca.
7. Dado el cierre, cuando el usuario aprueba, entonces hay un commit con Conventional Commits en
   español y los cuatro artefactos están en `docs/sdd/<corrida>/`.
8. La corrida de prueba de §10 completa las cinco fases y las dos puertas.

## 12. Decisiones registradas

- Skill + agentes propios en lugar de Workflow: SDD necesita puertas humanas a mitad de camino y el
  Workflow tool corre en segundo plano sin ellas. Reevaluar cuando el proceso esté estable.
- Artefactos versionados en `docs/sdd/`: el proyecto ya guarda la evidencia en el repo
  (`TRASPASO.md`, `revision-fase1.md`); el informe sirve de cuerpo del PR.
- Separación de contexto entre redactor de pruebas e implementador, y ninguno ve la descripción
  original: la spec es la única fuente, que es lo que «spec-driven» significa.
- Modelo `sonnet` para el verificador: su trabajo es ejecutar y transcribir, no razonar.
