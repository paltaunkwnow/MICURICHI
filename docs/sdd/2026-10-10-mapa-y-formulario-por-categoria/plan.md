# Plan de la corrida M4 — Mapa y formulario por categoría (web pública)

## Continuación autorizada en Codex — 2026-10-13

**Ampliaciones autorizadas por el usuario el 2026-10-14:** ante otro fallo de los subagentes
por límite de uso, el principal puede implementar y probar directamente; la revisión independiente
se mantiene pendiente hasta completarla. Se autorizaron `e2e/scripts/correr-local.mjs` (solo la
consulta de existencia desde `postgres`), los dos mensajes UI de `e2e/tests/ayudas.ts` y la
separación de la expectativa HTTP en `e2e/tests/cuenta-ciudadana.spec.ts`. No cambia el cupo
de tres envíos de la instalación E2E ni el rechazo del cuarto. Se corrige deliberadamente el
texto UI para no afirmar un límite que `/auth/yo` no entrega. El nodo invisible estable de
anuncio es una excepción documentada al DOM idéntico, conservando la presentación visual.

El usuario pidió: «continua y haz los pendientes de M4 y esas cosas necesarias para poder
cerrarlo y avanzar en el proyecto». Se retoma esta corrida y sus CA, sin reiniciar el desarrollo.

- Rama de continuación: `codex/cierre-m4`, desde el respaldo `09930a3`. La foto original
  `refs/sdd/mapa-y-formulario-por-categoria` y `linea-base.md` se conservan como comparación.
- Cambios de documentación de la auditoría anterior declarados y preservados: README raíz,
  `docs/README.md`, `ContextosySkills/README.md`, `VentanaContexto.md` y auditoría recuperada.
- Trabajo: revisión independiente de los CA y de la equivalencia de pruebas; correcciones
  necesarias dentro de `apps/web-ciudadano/`; actualización del README de esa app y documentos
  de corrida; verificación estática, suites, build/OpenAPI y E2E sobre `curichi_e2e`.
- Primera corrección a evaluar: registro por `componenteEspecialPaso2`, subtipos y ubicación
  por defecto del adaptador genérico, texto de cupo y anuncio accesible. No activar categorías.
- No se amplía el contrato HTTP ni se editan servicios/DB/infra sin identificar primero esa
  necesidad. Las dos E2E ya autorizadas mantienen su alcance; no se crea la spec diferida a M6.
- El principal coordina y documenta. Un implementador escribe web, un revisor lee y un
  verificador prepara el entorno. Implementador y verificador ejecutan pruebas en turnos;
  nunca en paralelo. Auditoría/revisión finales independientes de quien implementa.
- Adaptación operativa: las rutas reales son `.agents/skills/sdd/` y `.codex/agents/`; se usan
  subagentes de Codex con el modelo heredado disponible, sin fingir que están disponibles
  los alias de modelos/herramientas de Claude. No se modifica su configuración.
- Se conserva la autorización de ventana E2E; no se toca `curichi` ni `curichi_revision`,
  no se reconstruye la pila habitual y no se realizan commits, push ni instalaciones.
- Cierre: `verificacion.md` e `informe.md`, CA por CA, con evidencia y pendientes explícitos.
  Una regresión bloquea el cierre. M5 no empieza dentro de esta corrida.

---

- **Estado:** **APROBADO** por el usuario el 2026-10-10.
  - **D1:** `?categoria=` en la URL solo con dos o más categorías activas.
  - **D2:** la forma nueva del cuerpo para todas las categorías.
  - **D3:** el E2E de cambio de categoría pasa a M6.
  - **D4, autorizado:** solo el cambio aditivo de **`contracts` 0.21.0**.
  - **D4, sin autorizar:** tocar `e2e/` y editar `CLAUDE.md`. El usuario los dejó sin marcar al preguntárselo dos veces. En consecuencia:
    - **M4.5** (la spec nueva y los ajustes de D2) queda **pendiente de autorización**. Con D2, `quitar-campos-web:189-190` y `formulario-sumidero-y-fotos:250` van a fallar, porque leen campos de inundación en el primer nivel del cuerpo. Antes de F4a se le vuelve a preguntar al usuario, con el resultado a la vista; si no autoriza, se replantea D2.
    - **Actualización del 2026-10-10, después de M4.4.** El usuario autorizó **solo** ajustar las dos E2E de D2:
      - `quitar-campos-web:189-190` pasa a leer `cuerpo.detalle.*`;
      - `formulario-sumidero-y-fotos:250` pasa a `expect(cuerpo.detalle).toHaveProperty(campo, null)`.

      La spec nueva `categoria-mapa.spec.ts` **no** está autorizada.
    - Lo que iba a cubrir la spec nueva se prueba con Vitest.
    - **`CLAUDE.md` §4.3 y §4.8 quedan sin actualizar.** §4.8 va a quedar diciendo 0.20.0, y se anota como pendiente en el informe.
- **Roadmap:** `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` §5, fila M4.
- **ADR que rigen:**
  - 0013: mapa único con datos por categoría;
  - 0014: categoría inicial en el dispositivo;
  - 0015: prioridad de la URL y forma pública;
  - 0016: reinicio de filtros por alcance;
  - 0021: formularios por categoría;
  - 0022: paleta e iconos.
- **Diseño:** doc 14 §2.1–§2.5 y 13.3 §4.6–§4.7.
- **Viene de:** M3b, verificada el 2026-10-10 (`docs/sdd/2026-10-09-cupo-por-categoria/informe.md`). El backend ya:
  - lee por categoría;
  - acepta las dos formas en `POST /reportes`;
  - devuelve `categorias_activas` y `cupos`.
- **Inventario de partida** (Explore, 2026-10-10):
  - la web **no sabe nada de categorías**: descarta `categorias_activas` y no usa `src/categorias/` de `contracts`;
  - ninguna lectura manda `categoria`;
  - el mapa no guarda estado en la URL;
  - el formulario, de 1859 líneas, arma a mano los campos de inundación y envía la forma plana.

## Objetivo

Que la web pública trabaje **por categoría** sobre el registro de `contracts`, **sin que cambie nada visible** mientras haya una sola categoría activa. El roadmap dice «para el usuario final: nada». Así, cuando M6 active Baches, solo haga falta la definición.

## Clasificación (F0)

| Campo | Valor |
|---|---|
| Partes | **P1** (`apps/web-ciudadano/`), **P3** custodia de `packages/contracts/` (cambio aditivo, ver M4.1) y **P5** (`e2e/`, ajustes y una prueba nueva, con autorización) |
| No puede tocar | `services/*`, `apps/panel-admin/` (es M5), `packages/db/`, `infra/`, `scripts/`, la raíz, y `CLAUDE.md` salvo la sección autorizada |
| Banderas | `ui`, `contrato` (0.21.0 aditivo), `privacidad` (preferencia en `localStorage` y parámetro en la URL), `api` (consumidor) |
| Rama | `feat/web-ciudadano/categoria-en-mapa-y-formulario`, desde el árbol de M3b sin commitear |
| Foto | `refs/sdd/mapa-y-formulario-por-categoria` = `48b1e40` (F0, 2026-10-10) |
| Cambios ajenos | M0–M3b sin commitear (`arbol-inicial.txt`, con los `sha256` de **todos** los archivos sin seguimiento, también los de `docs/`) |
| En vivo | No aplica: migraría `curichi` |

## Reglas de esta corrida

1. **Con una sola categoría activa, nada cambia en pantalla.**
   - Sin selector.
   - Los mismos textos, el mismo DOM de mapa y formulario, los mismos pasos, `name` y `value` de los campos, y los mismos `data-testid`.
   - Ver la decisión D1 para la URL.
   - Las pruebas de texto sobre el código fuente que se rompan por mover código se ajustan **sin debilitarlas**, una por una y con su motivo.
2. **La categoría efectiva se resuelve antes de la primera petición de datos.** Nunca se piden ni se muestran datos de otra categoría (13.1 §7). El selector puede pintar un estado neutro durante la hidratación.
3. **Toda lectura del mapa lleva la categoría efectiva:**
   - `GET /api/v1/reportes?categoria=…`;
   - `GET /geo/v1/agregados/unidades-vecinales?categoria=…`.

   Las claves de React Query incluyen la categoría. Sigue sin haber tráfico automático (`trafico-publico`).
4. **La preferencia es del dispositivo** (ADR 0014):
   - clave `micurichi.mapa.categoria` (la fija la ADR), valor `{ "v": 1, "slug": … }`;
   - lectura y escritura dentro de `try/catch`; si falla, se sigue sin preferencia;
   - solo el mapa público la lee y la escribe;
   - no viaja al servidor;
   - se valida contra `categorias_activas`.
5. **Prioridad:** `?categoria` válida y activa → la guardada válida y activa → Inundaciones (o la primera activa). La decide `resolverCategoriaInicial` de `contracts`. Los alias se normalizan y la URL se corrige con `history.replaceState`. Una URL inválida o inactiva se ignora y se anuncia en `aria-live`.
6. **Reinicio por alcance** (ADR 0016), con una función pura que mira `FiltroDef.alcance`, no listas sueltas:
   - **se conservan:** centro, zoom, `bbox`, distrito, UV y capa de fondo;
   - **se reinician:** severidad y punto crítico;
   - **se limpian:** selección, hoja de detalle, búsqueda de texto y panel de filtros.
7. **El núcleo pregunta a la definición**, sin `if (categoria === 'inundacion')` en el código común (ADR 0009 §6.3):
   - el paso 2 sale del registro (ADR 0021);
   - el paso 2 de inundación es un **componente especial registrado** (`componenteEspecialPaso2: 'inundacion/paso2'`) con el comportamiento exacto de hoy, incluida la lógica condicional del sumidero, que `Pregunta` no puede expresar;
   - el renderizador declarativo común queda para las categorías sin componente especial.
8. **Sin datos personales en la URL ni en el almacenamiento:** solo el slug de la categoría.

## Decisiones que necesito del usuario

| # | Pregunta | Recomendación | Por qué |
|---|---|---|---|
| **D1** | La ADR 0015 dice que, sin parámetro, se **agrega** `?categoria=` a la URL. Con una sola categoría activa eso cambia la barra de direcciones y rompe E2E que esperan `/` o `/reportar` exactos: `navegacion:52`, `cuenta-ciudadana:92,105`, `formulario-reporte:85` y `ubicacion-obligatoria:129`. | **Agregarlo solo cuando haya más de una activa.** Con una sola, un `?categoria=` que llegue se normaliza y se quita, y se anuncia si era inválido o inactivo. Precisa la ADR 0015 (nota fechada) | Cumple «con una sola activa no cambia nada visible» (doc 14 §2.4) y no obliga a tocar esas E2E. Desde M6, con dos activas, rige la ADR tal cual |
| **D2** | Forma del cuerpo de `POST /reportes` que manda la web | **La forma nueva para toda categoría:** `{ …núcleo, categoria, detalle }`. Se ajustan dos E2E que leen campos de inundación en el primer nivel del cuerpo: `quitar-campos-web:189-190` y `formulario-sumidero-y-fotos:250`, que pasan a leer `detalle.*` | Un solo camino de envío, probado de punta a punta antes de M6. La forma plana sigue aceptada en la API hasta M10, para clientes viejos y la PWA en caché. **Alternativa:** mandar la plana para inundación hasta M10; no toca E2E, pero deja el camino nuevo sin uso real hasta M6 |
| **D3** | E2E de **cambio** de categoría sin contaminación (13.3 §4.6) | **Pasa a M6.** Necesita una segunda categoría real en el registro, y meter una de prueba en el bundle del navegador sería código de prueba en producción | En M4 el cambio se prueba con Vitest, con un registro inyectado y dos activas. En E2E se prueba lo que sí existe: selector oculto, alias, URL inválida o inactiva, preferencia guardada, lecturas con `categoria` y el cuerpo nuevo |
| **D4** | Autorizaciones | Editar `CLAUDE.md` §4.3 (Parte 1: selector, preferencia, URL y paso 2 por categoría) y §4.8 (versión de `contracts`). Tocar `e2e/` con la prueba nueva y los ajustes de D2 | Las pide el proceso (§5.2) |

## Criterios (metas verificables)

- **CA1 · Contrato 0.21.0 (aditivo).** `DefinicionCategoria` suma `textos?` opcional, con los textos de pantalla que hoy están fijos en la web:
  - el título y el `aria-label` del mapa;
  - el h1 del detalle;
  - el vacío de la lista;
  - el título del paso 2;
  - lo que haga falta según el inventario.

  `DEFINICION_INUNDACION` los trae **idénticos** a los de hoy. Cumplimiento:
  - prueba `contrato-0-21`;
  - OpenAPI sin cambios (`cmp`);
  - api-core y geo-service con sus definiciones sintéticas siguen compilando, porque el campo es opcional;
  - CHANGELOG y README.
- **CA2 · Categorías activas en la app.**
  - `configuracion.ts` deja de descartar `categorias_activas` y la pasa a un contexto (`useCategorias`): activas, efectiva y registro.
  - El respaldo, sin servidor, es `['inundacion']`.
  - Prueba: `configuracion.test.ts` ampliada.
- **CA3 · Preferencia y URL** (`lib/categoria.ts`, funciones puras con pruebas Vitest):
  - leer y guardar con almacenamiento roto o lleno, en navegación privada y con valores corruptos o de otra versión;
  - la prioridad de `resolverCategoriaInicial`;
  - alias → forma pública;
  - URL inválida o inactiva → corrección y anuncio;
  - D1;
  - la categoría efectiva queda guardada como «última usada», también si llegó por un enlace (ADR 0015);
  - la prueba `misReportes.test.ts:64-68`, que prohíbe el texto `localStorage.setItem`, se respeta con un almacén con alias, como en `AvisoPuntoResuelto`.
- **CA4 · Mapa por categoría:**
  - las lecturas llevan `categoria` y sus claves la incluyen;
  - `Portada` también;
  - selector `SelectorCategoria`:
    - oculto con una sola activa;
    - con dos o más, `role="tablist"`, flechas, Inicio y Fin, objetivos de 48 px, foco de la marca, icono más nombre, acento con el color de la categoría;
    - `aria-live` «Mostrando X: N puntos»;
  - el cambio aplica la regla 6 sin mostrar puntos de la categoría anterior;
  - la hoja de detalle, las tarjetas y la leyenda leen de la definición (etiquetas de `camposPublicos` desde `preguntas`), con respaldo en los campos planos cuando la respuesta no trae `detalle`;
  - los enlaces a `/reportar` llevan la categoría solo cuando hay más de una activa (D1).
  - Prueba: Vitest con un registro inyectado de dos categorías: reinicio, selector y textos.
- **CA5 · Formulario por categoría:**
  - la categoría del reporte sale de la URL de `/reportar`, de la efectiva del mapa o de la de por defecto;
  - con más de una activa, «Categoría: X · Cambiar» en el paso 1, sin perder la ubicación;
  - paso 2: el componente especial de inundación, que es el de hoy, extraído; si no hay componente especial, el renderizador declarativo;
  - la previsualización de severidad con `definicion.severidad.calcular`;
  - el cuerpo según D2;
  - el borrador pasa al formato 3, con `categoria` y `detalle`, y traduce el formato 2;
  - el cupo y la demora salen de `cupos[categoria]`, con respaldo en los campos sueltos;
  - texto para `CATEGORIA_NO_DISPONIBLE` en `errores.ts`.
  - Pruebas: Vitest de `formulario-reporte`, `borrador` y el renderizador declarativo con una definición sintética. Las pruebas de texto sobre el código fuente se ajustan sin debilitarse.
- **CA6 · E2E** (Parte 5):
  - **spec nueva** `categoria-mapa.spec.ts`:
    - selector oculto;
    - `/?categoria=Inundaciones` → normalizado según D1;
    - `/?categoria=bache` (inactiva) → ignorada y anunciada;
    - preferencia guardada `{v:1, slug:'inundacion'}`;
    - las lecturas llevan `categoria=inundacion`;
    - el cuerpo de `POST /reportes` según D2;
  - los ajustes de D2;
  - G1, G2, G3, G5 y `recorrido-completo` sin regresiones.
- **CA7 · Documentación:**
  - README de web-ciudadano;
  - `CLAUDE.md` §4.3 y §4.8 (con autorización);
  - nota fechada en la ADR 0015 si D1 sale como se recomienda;
  - nota de avance en el doc 14.

## Reparto

En `apps/web-ciudadano` trabaja **un solo escritor a la vez**, así que las tareas M4.2, M4.3 y M4.4 van en serie.

| Tarea | Nivel y agente | Carpeta | Meta | Depende de |
|---|---|---|---|---|
| **M4.1** · `contracts` 0.21.0: `textos?` | Raíz: `trabajador-raiz` | `packages/contracts/` | CA1 | Aprobación |
| **M4.2** · núcleo de categoría en la app: configuración, contexto, preferencia, URL y reinicio por alcance | Raíz: `trabajador-raiz` (todo lo demás depende de esto) | `apps/web-ciudadano/src/lib`, `app/` | CA2, CA3 | M4.1 |
| **M4.3** · mapa: lecturas, selector, reinicio, detalle, tarjetas y leyenda | Estándar: Sonnet, con revisión raíz en F4a | `apps/web-ciudadano/` | CA4 | M4.2 |
| **M4.4** · formulario: paso 2 desde el registro, cuerpo, borrador, cupos | Raíz: `trabajador-raiz` (envío de datos, cupo, borrador y pruebas frágiles) | `apps/web-ciudadano/` | CA5 | M4.3 |
| **M4.5** · E2E: spec nueva y ajustes de D2 | Estándar: Sonnet | `e2e/tests/` | CA6 (escritura) | M4.4 |
| **M4.6** · README de web-ciudadano | Estándar: Sonnet | README | CA7 (parte) | M4.4 |
| **M4.6** · `CLAUDE.md`, ADR 0015 y doc 14 | Agente principal | docs | CA7 (parte) | M4.4 |
| **Verificación SDD** | — | — | — | — |
| FB (antes de tocar nada) | `sdd-verificador`, modo línea base: `...contracts` y E2E G1, G2, G3, G5 y `recorrido-completo` con `PLAYWRIGHT_BROWSERS_PATH`, solo en los comandos | — | Línea base | Aprobación |
| F4a (después) | `sdd-verificador`, `sdd-revisor` y `sdd-auditor`, este último por la preferencia, la URL y el envío de datos | — | Sin regresiones | M4.1–M4.6 |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper el formulario de inundación al partirlo (1859 líneas, muchas pruebas de texto sobre el código) | El paso 2 de inundación se **extrae** sin cambiarlo. Las pruebas E2E G3 y `recorrido-completo` son la red. Cada ajuste de una prueba de texto va con su motivo |
| Parpadeo o datos de otra categoría al hidratar | La regla 2 se prueba en Vitest. Se usa estado neutro, no inundación por defecto, mientras no se resolvió la categoría |
| Más tráfico en la página pública | `trafico-publico` cuenta peticiones: la categoría va como parámetro, no como petición nueva |
| `localStorage` bloqueado (navegación privada, Safari) | `try/catch` y una prueba con el almacén roto |
| Una categoría inactiva en un enlace viejo | `resolverCategoriaInicial` nunca devuelve una inactiva. Se anuncia y se corrige |

## Fuera de M4

| Qué | Cuándo |
|---|---|
| El panel por categoría | M5 |
| Las definiciones de Baches, Basura y Áreas verdes, y el E2E de cambio (D3) | M6–M8 |
| Guardar en la URL los demás filtros del mapa (`uv`, severidad…). Hoy viven en memoria y siguen así | Backlog. En M4 la URL solo lleva la categoría |
| Que los campos de respuesta de 0.20.0 pasen a obligatorios (regla 5 de M3) | Al cerrar M5, cuando los dos consumidores los lean |
| Pendientes del informe de M3b: `\u0000` en `descripcion` y `subtipo` da `500`, y fijar `onProtoPoisoning` | Tarea aparte de api-core (P3); no entra en esta corrida de P1 |
