---
name: sdd
description: Proceso Spec-Driven Development de Mi Curichi para cualquier cambio nuevo. Clasifica el cambio por parte y riesgo, mide la línea base de lo existente antes de tocar nada, produce una spec que el usuario aprueba, escribe pruebas que fallan, implementa dentro de la carpeta designada probando antes y después de cada edición, y verifica contra la línea base, en la pila Docker del usuario y, si corresponde, por el túnel con el que la comparte. Usar cuando el usuario pida /sdd o un cambio "por SDD".
argument-hint: "<descripción del cambio>"
disable-model-invocation: true
---

# /sdd — verificación de cambios por especificación

Diseño: `docs/superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md` (con la
enmienda §13 del 2026-10-03, «probar antes de tocar»). Manual corto: `docs/proceso/sdd.md`.
Matriz de riesgo: [matriz-de-riesgo.md](matriz-de-riesgo.md). Plantillas: [plantillas/](plantillas/).

Cambio pedido: **$ARGUMENTS**

Sos el **agente principal**. Coordinás; los subagentes `sdd-*` de `.claude/agents/` hacen el
trabajo de cada fase. Todos corren en **Opus 4.8** (`claude-opus-4-8`, en el frontmatter de cada
`sdd-*.md`). Si el usuario fijó `CLAUDE_CODE_SUBAGENT_MODEL` en `~/.claude/settings.json`, manda
ese. Cada fase termina con un mensaje corto al usuario (qué se hizo, qué sigue). El usuario quiere
mensajes resumidos: nada de narrar el proceso.

## Reglas duras (no se negocian, ni «solo esta vez»)

1. Sin spec aprobada **y línea base medida** no hay pruebas. Sin pruebas en rojo no hay
   implementación.
2. **Un escritor por carpeta a la vez.** Dentro de una carpeta, F2 → F3 en serie. Con varias
   carpetas: primero `packages/contracts` sola (con su build), después `packages/db` y después el
   resto en paralelo (cada app, cada servicio, `e2e/`). Nunca dos subagentes en la misma carpeta.
3. Un test que pasa antes de implementar es un error de spec o de test, no un éxito.
4. «Verde» sin la salida pegada no cuenta. «No verificado» con motivo vale más que un PASS
   inventado.
5. Ningún subagente commitea, hace push ni abre PR. Lo hacés vos, tras la puerta 2.
6. Nada fuera de la carpeta designada sin autorización explícita del usuario con archivo, motivo
   y riesgo (CLAUDE.md §5.2). `CLAUDE.md` y `data/raw/` nunca sin autorización.
7. Máximo dos vueltas implementador ↔ verificación; a la tercera, parás y consultás.
8. **Primero se mide, después se toca.** Antes de F2 hay una línea base (FB) con **los mismos
   comandos, el mismo alcance y las mismas opciones** que va a correr F4. Sus rojos se registran y
   decide el usuario en la puerta 1. Nadie los arregla de pasada: arreglarlos es otro cambio.
9. **Regresión = BLOQUEANTE.** Lo que estaba verde en `linea-base.md` y queda rojo después
   (comparado por nombre de test, archivo de Biome o error de tsc, no solo por código de salida)
   frena el cierre, aunque la spec no lo mencione. Un comando rojo en F4 que no tiene línea base
   también es BLOQUEANTE hasta que se mida cómo estaba antes.
10. **Nadie edita sin probar antes.** El redactor de pruebas y el implementador hacen su
    *preflight* (estado del árbol y suite del paquete, con la salida pegada) antes de su primera
    edición, y vuelven a correr la suite después de cada criterio. No se edita con la suite del
    paquete en un rojo que no esté en la línea base.
11. **Lo que la corrida no escribió no es de la corrida.** Los cambios ajenos que ya estaban en el
    árbol no se revisan como propios, no se arreglan y no entran en el commit.
12. **Un solo ejecutor pesado a la vez.** Lo que lee va en paralelo; las suites, los builds, la
    E2E y `docker compose build` van en fila, y antes de cada uno se mira la memoria libre
    (matriz, «Orden y memoria»).
13. **La pila del usuario no se toca sin su sí.** Reconstruir o reemplazar contenedores, migrar su
    base `curichi`, parar servicios o abrir túneles: solo con el permiso de la puerta 1. Nunca
    `docker compose down`, nunca recrear `postgis`, nunca borrar volúmenes.

## Entorno de esta máquina (pasáselo a cada subagente)

- `$SCRATCH` es el scratchpad de la sesión: pasale la ruta a cada subagente. Ahí van los dumps,
  logs de túnel y copias temporales; nada de eso se versiona.
- `pnpm` del sistema puede estar roto: los comandos van como `npx -y pnpm@12.4.1 …`, también los
  de la matriz. Preferí `--filter <paquete> <script>` a los alias raíz que relanzan `pnpm` por
  dentro (`etl:test`, `privilegios`, `auditoria`). Nunca `--no-verify`.
- `docker` puede no estar en el PATH de bash:
  `export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"`.
- La base local es PostgreSQL 18 + PostGIS en Docker (`curichi-postgis`, 127.0.0.1:5432, ADR 0005).
  **No** se levanta `pnpm db:local`: PGlite queda solo para las bases efímeras de los tests.
- La pila que usa el usuario es la de Docker, levantada con `Mi-Curichi.exe` (fuente en
  `scripts/lanzador/`): solo Caddy publica puertos (80/443: `https://localhost`,
  `https://panel.localhost`); web y panel no publican nada, así que 3000 y 3100 quedan libres para
  la ventana E2E; api-core y geo-service en puertos efímeros (`docker compose port api-core 3001`). Los contenedores corren imágenes construidas
  desde el árbol: un cambio que no se reconstruye no le llega al usuario.
- El usuario la comparte con amigos por túneles de Cloudflare (opción «Compartir con amigos» de
  `Mi-Curichi.exe`, que los cierra al salir). Un
  contenedor reemplazado se ve en el acto por el túnel.
- `.env` tiene valores con espacios: `set -a; . ./.env` falla. Exportá solo lo necesario:
  `export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"`. Los comandos de pnpm no leen `.env`.
- Poca RAM: las apps en local van con `next dev --webpack`; nunca `next build` con un `next dev`
  en marcha; la E2E nunca entera. El clasificador bloquea borrar `.next` y `DROP DATABASE`: eso lo
  decide el usuario.

## F0 — Clasificar (lo hacés vos)

0. **Árbol de trabajo, antes de todo.** `git status --porcelain`. Si no está vacío:
   - guardá `docs/sdd/<corrida>/arbol-inicial.txt` (`git status --porcelain` + `git diff --stat`
     + `sha256sum` de cada archivo sin seguimiento);
   - resumilo en 5 líneas por carpeta, marcando si toca la carpeta designada,
     `packages/contracts`, `packages/db/migraciones` o `e2e/`;
   - preguntá con AskUserQuestion: (a) **commitearlos antes**, fuera de /sdd, en un commit propio
     cuyo mensaje diga que no pasaron por verificación; (b) **declararlos y dejarlos**: la línea
     base se mide con ellos y la corrida no los toca (no vale si alguno cae en la carpeta
     designada: sin `git add -p` no se pueden separar después); (c) **apartarlos** con
     `git stash push -u -m "ajenos antes de sdd/<slug>"`, avisando que la pila Docker puede tenerlos
     dentro de sus imágenes.
   - Sin respuesta no seguís. Nunca `git checkout -- .`, `git reset`, `git clean` ni un stash sin
     el sí del usuario.
   - Compará también las migraciones aplicadas con las del repo
     (`docker compose exec -T postgis sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select nombre from _migraciones"' </dev/null`
     contra `ls packages/db/migraciones`). Si la base tiene una que el repo no versiona, avisá.
1. Deducí la **parte** y la **carpeta designada** por dónde hay que tocar (CLAUDE.md §5.3). Si
   hacen falta varias carpetas: autorización por carpeta (§5.2) e `inventario.md` con los símbolos
   afectados, separado por carpeta; cada redactor e implementador recibe solo su sección.
2. Activá **banderas** con [matriz-de-riesgo.md](matriz-de-riesgo.md): por rutas que se van a
   tocar y por palabras de la descripción. En la duda, se activa.
3. Si toca `packages/contracts`, anunciá «cambio de contrato» explícitamente. Una migración nueva
   lleva el número siguiente al mayor que haya **en disco**, versionado o no.
4. Creá la rama `feat/<scope>/<slug>` o `fix/<scope>/<slug>` desde la rama actual (scope de
   §12.2) y la carpeta `docs/sdd/<aaaa-mm-dd>-<slug>/`. Tomá la **foto** del árbol, que no lo
   modifica: `R=$(git stash create); git update-ref refs/sdd/<slug> "${R:-$(git rev-parse HEAD)}"`.
   Empezá `docs/sdd/<corrida>/archivos.txt` vacío: cada subagente que escribe te devuelve la lista
   de archivos que tocó y vos la acumulás ahí.
5. Mostrá al usuario, en 6 líneas: parte, carpeta, banderas, contrato sí/no, rama, cambios ajenos y
   su decisión.

**Diff de la corrida** (lo que reciben revisor, auditor y verificador; nunca `git diff
<rama>...HEAD`, porque hasta F5 no hay commits): `git diff refs/sdd/<slug> -- $(cat archivos.txt)`
más el contenido de los archivos nuevos de `archivos.txt`.

## FB — Línea base (en paralelo con F1)

En **una sola llamada** lanzá `sdd-especificador` (F1, solo lee) y `sdd-verificador` en **modo
línea base**. Al verificador pasale: banderas, carpeta designada, alcance
(`--filter=...<paquete>` por cada paquete de la carpeta), `refs/sdd/<slug>`, la carpeta de corrida
y las rutas de `matriz-de-riesgo.md` y `plantillas/linea-base.md`.

El verificador corre los comandos de `base` y de cada bandera activa sobre el código tal como
está, salvo lo que exige permiso (E2E, en vivo, túnel). Con `ui`, `api` o `infra` saca además la
foto de la pila Docker sin tocarla (imágenes al día o no, humo por `https://localhost`, consola y
captura de las pantallas que se van a tocar). Escribe `docs/sdd/<corrida>/linea-base.md` y no
arregla nada.

Si F1 agrega banderas, antes de la puerta 1 relanzá al verificador (SendMessage) solo con los
comandos de esas banderas.

## F1 — Especificar

`sdd-especificador` recibe: la descripción literal, la clasificación de F0 (con los cambios
ajenos declarados), la ruta de la corrida y la plantilla `.claude/skills/sdd/plantillas/spec.md`.
Al volver, completá vos la columna «Estado en la línea base» de la tabla de invariantes: un
invariante cubierto por un test rojo no está cubierto.

**Puerta 1.** Mostrá el resumen de la spec (objetivo, criterios en una línea cada uno, preguntas
abiertas) y, en 3 líneas, la línea base: verdes, rojos que ya estaban y no verificados. En la
**misma** AskUserQuestion pedí:
1. el «aprobado» de la spec y la respuesta a sus preguntas BLOQUEANTES;
2. si hay rojos que ya estaban: seguir con ellos como conocidos, ampliar la spec para arreglarlos
   (vuelve a F1) o parar;
3. los permisos que la matriz pida para estas banderas (multiSelect): **ventana E2E** (deja web y
   panel de su pila sin servicio unos minutos); **en vivo** (reconstruir y reemplazar en su pila
   Docker solo los servicios tocados, guardando la imagen anterior para volver atrás; si hay
   `cloudflared` corriendo, sus amigos verían el cambio sin aprobar); **migrar `curichi`** después
   de un `pg_dump`; **túnel temporal** propio para probar el modo compartir.

Copiá las respuestas en `linea-base.md`, § Decisiones. Si pide cambios en la spec, reenviáselos al
mismo especificador con SendMessage y volvé a presentar. **Sin aprobado no seguís.**

Si autorizó la ventana E2E, antes de F2 el verificador completa la línea base con los grupos E2E
de las banderas, sobre el árbol todavía sin tocar (SendMessage, mismo modo).

## F2 — Pruebas en rojo

Lanzá `sdd-redactor-de-pruebas` con: `spec.md`, la clasificación, `linea-base.md`,
`refs/sdd/<slug>` y la plantilla `pruebas.md`. **No le pases la descripción original.**

Al volver, leé `pruebas.md` y comprobá:
- al menos una fila por criterio, cada una con su salida en rojo;
- el **Preflight**, de antes de su primera edición, igual a la línea base;
- la **Suite después**: exactamente los rojos de la línea base más las pruebas nuevas.

Si falta algo, se lo devolvés. Si alguna prueba pasó sin implementación o un criterio no resultó
probable, volvé a F1 con ese hallazgo (SendMessage al especificador) y repetí la puerta 1 solo
para lo cambiado. Sumá sus archivos a `archivos.txt` y guardá `pruebas-f2.patch` (el diff de los
tests contra la foto, más los tests nuevos) para que el revisor compare después.

## F3 — Implementar

Lanzá `sdd-implementador` con: `spec.md`, `pruebas.md`, `linea-base.md`, la plantilla
`implementacion.md`, la carpeta designada, si hay cambio de contrato anunciado y la lista de
archivos de test nuevos. **No le pases la descripción original.**

Al volver:
- Si pide autorización para tocar algo fuera de la carpeta, preguntale al usuario con archivo,
  motivo y riesgo (AskUserQuestion). Con el sí, aplicá vos el cambio o reenviáselo al
  implementador con SendMessage.
- Si dice que una prueba contradice la spec, volvé a F1.
- Comprobá que `implementacion.md` tenga el preflight y una fila por CA con su salida pegada. Si
  no, no hay F4.
- Sumá sus archivos a `archivos.txt` y registrá sus hallazgos fuera de carpeta para el informe.

## F4a — Verificar (paralelo)

En **una sola llamada** lanzá:
- `sdd-revisor` siempre;
- `sdd-auditor` si hay bandera `seguridad`, `privacidad`, `compartir` o `lanzadores`, o si el diff
  toca `services/api-core`, fotos o autenticación;
- `sdd-verificador` en **modo verificación**.

A los tres pasales: `spec.md`, `pruebas.md`, `linea-base.md`, `implementacion.md`, la carpeta
designada, las banderas, `archivos.txt` y el diff de la corrida. **Solo el verificador ejecuta
comandos pesados**: el revisor lee y el auditor lee y corre como mucho tests de un archivo.

Cada fila `REGRESIÓN` de `verificacion.md` y cada hallazgo BLOQUEANTE o IMPORTANTE del revisor o
del auditor vuelve al implementador (SendMessage) y cuenta como una vuelta. Los `intermitente` no
se esconden: van al informe y a la puerta 2.

## F4b — En vivo (en serie, después de F4a sin bloqueantes)

Con bandera `ui`, `api` o `infra` y el permiso de la puerta 1, relanzá al verificador (SendMessage)
en **modo en vivo**: sección «En vivo» de la matriz y las «comprobaciones en vivo pendientes» del
auditor. Con bandera `compartir` y su permiso, también «Modo túnel». Sin permiso se anota
**no verificado: el usuario no autorizó …** y se destaca en el informe y en la puerta 2.

Un rojo en vivo vuelve al implementador como BLOQUEANTE (cuenta como vuelta), y el verificador deja
la pila como estaba antes de responder.

## F5 — Cerrar

Escribí `docs/sdd/<corrida>/informe.md` con la plantilla `plantillas/informe.md`: resumen,
regresión contra la línea base, tabla CA → test → estado, en vivo y túnel, hallazgos y su
resolución, lo no verificado y por qué, hallazgos fuera de carpeta, cómo volver atrás y la
plantilla de `.github/PULL_REQUEST_TEMPLATE.md` rellenada.

**Puerta 2.** Mostrá el informe en 10 líneas, regresiones primero. Si hubo modo túnel, agregá la
lista corta de lo que el usuario tiene que probar con sesión desde su celular. Pedí el «aprobado»
para commitear. Si no aprueba, aplicá «Cómo volver atrás» del informe.

Con el sí: el commit lleva **solo** lo de la corrida, añadido archivo por archivo
(`git add -- <ruta>` por cada línea de `archivos.txt` y los artefactos de `docs/sdd/<corrida>/`).
Nunca `git add -A` ni `git add .`: lo ajeno queda sin commitear, como estaba. Conventional Commits
en español con scope (§12.2). Después, `git update-ref -d refs/sdd/<slug>`. Si el usuario pide PR,
abrilo con el informe como cuerpo. Si F4b no corrió, decí en una línea con qué comando se
reconstruye su pila (`docker compose --profile servicios --profile minio up -d --build --no-deps
<servicios>`) y, si hubo migración, que antes va un `pg_dump` y el job `migraciones`, con su sí.

## Cómo se mantiene liviano (sin dejar de probar antes)

- **Alcance, no el monorepo entero:** `turbo run <tarea> --filter=...<paquete>` (el paquete y los
  que dependen de él). `lint` y `secretos` van completos porque tardan segundos.
- **Caché de turbo:** lo que no cambió responde `cache hit, replaying logs` y vale como evidencia.
  Nada de `--force` ni de borrar `.turbo`: la caché es lo que abarata la segunda pasada.
- **Bucle del implementador:** `vitest related --run <archivos>` y los tests del CA; la suite
  completa del paquete al cerrar cada CA.
- **Lectores en paralelo, ejecutores en fila** (regla 12). En FB corre el verificador mientras el
  especificador lee; en F4a, revisor y auditor leen mientras el verificador ejecuta.
- **`--concurrency=1`** en `test` y `build`, igual en la línea base y en F4: en la corrida del
  2026-09-25, api-core falló por timeout solo por contención.
- **E2E:** solo los grupos que nombra la matriz, de a uno y dentro de la ventana autorizada.
- **Docker:** solo los servicios tocados, de a uno y una vez por vuelta, después de F4a limpio.
- **Medir:** línea base y verificación anotan la duración de cada comando; con dos o tres corridas
  se fijan los plazos y el umbral de memoria (hoy `<a confirmar>`).

## Si algo del entorno falla

- Los agentes de `.claude/agents/` se registran al **arrancar la sesión**. Si el Agent tool dice
  `Agent type 'sdd-…' not found`, lanzá `general-purpose` y empezá el prompt con «Primero leé
  `.claude/agents/sdd-<rol>.md` y actuá exactamente con ese rol».
- Docker Desktop apagado: lo arranca el usuario (`Mi-Curichi.exe`); no lo arrancás vos. Lo que lo
  necesita queda **no verificado** hasta que esté.
- Montaje de la unidad A: roto en Docker Desktop: `Mi-Curichi.exe` reintenta con el arreglo de WSL;
  si no, avisá.
- Turbopack cae con `0xC0000005` o `.next/dev` queda con todas las rutas en 404: usá
  `next dev --webpack`; `.next` no se borra sin el usuario.
- `net::ERR_NETWORK_IO_SUSPENDED` o `ECONNRESET` en masa: la máquina entró en reposo; reintentá
  una vez.
- 429 acumulado en E2E o `ALTAS_POR_DIA_POR_IP` agotado: los contadores viven en la base; la E2E
  va en su base aparte (`curichi_e2e`, matriz, «Ventana E2E»).
