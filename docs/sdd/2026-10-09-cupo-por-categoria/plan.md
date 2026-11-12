# Plan de la corrida M3b — Escrituras y cupo por categoría

- **Estado:** **APROBADO**. Es la segunda corrida del plan de M3, aprobado el 2026-10-08:
  `docs/sdd/2026-10-08-nucleo-por-categoria/plan.md`, sección «Corrida M3b», criterios **CA5–CA9**.
  Este archivo resume la parte de M3b y **no** cambia nada del plan aprobado: si difieren, manda el plan de M3.
- **Ventana E2E:** autorizada (base aparte `curichi_e2e`, en la 0021). **Pruebas de navegador:** Chromium no arrancaba por la
  virtualización de `%LOCALAPPDATA%` de la app de Claude (error SxS 14001, diagnóstico del 2026-10-09). Por decisión
  del usuario, el verificador fija `PLAYWRIGHT_BROWSERS_PATH=C:\Users\HP\AppData\Local\Packages\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`
  **solo en sus comandos E2E**, sin ningún cambio persistente. Con eso corren G1 completo, `ubicacion-*`, `csp`, `camara-foto` y `datos-reales`.
- **Edición de `CLAUDE.md`:** autorizada en §2, §7.2, §7.5, §7.6 y §13.
- **Viene de:** M3a, cerrada sin regresiones (`docs/sdd/2026-10-08-nucleo-por-categoria/informe.md`, sección «Para M3b»).

## Clasificación (F0)

| Campo | Valor |
|---|---|
| Partes | **P3** (`services/api-core/`). Si hace falta, P4 (`packages/db/`, por ejemplo una función o un índice del cupo) |
| Carpeta designada | `services/api-core/` · `packages/db/` solo si lo pide CA6 · documentación: `CLAUDE.md` y los README (CA9) |
| No puede tocar | `packages/contracts/` (0.20.0 ya trae todo el contrato de M3; si falta algo, se para y se pregunta), `services/geo-service/`, `apps/*`, `e2e/` (salvo un ajuste autorizado), `scripts/`, `infra/` y la raíz |
| Banderas | `base`, `contrato` (consume 0.20.0), `datos`, `privacidad`, `seguridad`, `concurrencia`, `api` |
| Rama | `feat/api-core/cupo-por-categoria`, desde el árbol de M3a sin commitear |
| Foto | `refs/sdd/cupo-por-categoria` = `d68fe6a` |
| Cambios ajenos | M0 a M3a sin commitear (`arbol-inicial.txt`) |
| En vivo | no aplica (migraría `curichi`) |

## Criterios (del plan de M3)

- **CA5 · Creación:** `POST /reportes` con las dos formas, la plana de hoy y la nueva con `categoria`, `subtipo` y `detalle`.
  - La forma plana crea una inundación **idéntica** a la de hoy.
  - La forma nueva con inundación crea lo mismo.
  - Una categoría sintética activa crea con su `detalle` estricto: columnas planas en `NULL`, `causa_presunta = NULL` explícito, severidad y versión de su definición.
  - Una categoría inactiva o desconocida da `422 CATEGORIA_NO_DISPONIBLE` **sin gastar cupo**.
  - Un `detalle` con claves de más o de más de 8 KB da `400`.
  - La idempotencia y la publicación diferida siguen igual.
  - La creación escribe en la tabla `reporte`.
- **CA6 · Cupo:**
  - **`cupo_contador`** con las claves `reportes:<slug>` (3 por día y por categoría; `REPORTES_POR_DIA_POR_CUENTA` lo reemplaza para toda la instalación) y `fotos:cuenta` (12 por día, global).
  - La demora sale del contador de la categoría.
  - El 4.º reporte de inundación da `429` con `detalles.categoria`; el 1.º de la categoría sintética entra con 60 s de demora.
  - El turno de foto se devuelve si falla el procesamiento.
  - Un replay idempotente no gasta turno.
  - El día es el de la ciudad.
  - **Concurrencia con PostgreSQL real:** `cuota-concurrencia-pg` y `fotos-cuota-concurrencia-pg` reescritas sobre `cupo_contador`, más un caso de dos categorías a la vez.
  - Una regla con `ambito` o `ventana` desconocidos impide el arranque (falla cerrado).
  - `cuota_reporte_diaria` queda sin uso hasta M10.
- **CA7 · `/auth/yo`:**
  - `cupos` por categoría activa: `restantes`, `demora_proximo_s` y `puede_reportar_desde`;
  - `fotos_restantes_hoy`;
  - los campos de hoy, iguales a los de inundación.
- **CA8 · Moderación:**
  - `PATCH /estado`, `/severidad` y `/fusionar` operan sobre `reporte`;
  - `409 FUSION_ENTRE_CATEGORIAS` si el canónico es de otra categoría;
  - `PATCH /estado` con ID corto funciona igual que `POST /fusionar`;
  - las pruebas de `moderacion.test.ts` siguen en verde.
- **CA9 · Documentación:**
  - README de api-core;
  - `CLAUDE.md` §2 (demora y cupo), §7.2, §7.5, §7.6 y §13 al día con el cupo por categoría y los parámetros nuevos;
  - nota fechada en `docs/arquitectura/14`.

## Reglas que siguen valiendo
Las reglas de compatibilidad 1–6 del plan de M3. En especial: sin `categoria`, todo se comporta como hoy, y las apps no se tocan y quedan iguales a la línea base.

## Reparto
| Tarea | Agente |
|---|---|
| M3.6 · api-core, escrituras (CA5–CA8) | `trabajador-raiz` (Opus 4.8). Único escritor en `services/api-core` y, si hace falta, en `packages/db` |
| M3.7 · README de api-core | `general-purpose`, `sonnet` |
| M3.7 · `CLAUDE.md` y la nota en el doc 14 | agente principal |
| Verificación | `sdd-verificador` (línea base y verificación, con la ventana E2E), `sdd-revisor` y `sdd-auditor` |
