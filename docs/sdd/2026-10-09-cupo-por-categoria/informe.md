# Informe — M3b, escrituras y cupo por categoría

- **Corrida:** `docs/sdd/2026-10-09-cupo-por-categoria/` · **Rama:** `feat/api-core/cupo-por-categoria`.
- **Partes:** P3 (`services/api-core/`).
- **Cambios fuera de P3:**
  - `packages/contracts/`: un cambio aditivo autorizado por el usuario, `reglas` en la severidad de la categoría;
  - `packages/db/src/mantenimiento.ts`: solo comentarios;
  - documentación de `CLAUDE.md` (secciones autorizadas) y del doc 14.
- **Banderas:** `base`, `contrato`, `datos`, `privacidad`, `seguridad`, `concurrencia`, `api`.
- **Cambio de contrato:** aditivo dentro de **0.20.0**, sin subir la versión. El OpenAPI no cambia.
- **Proceso:** CLAUDE.md §12.4. Es la segunda corrida del plan de M3, aprobado el 2026-10-08 (`docs/sdd/2026-10-08-nucleo-por-categoria/plan.md`, CA5–CA9).
- **Vueltas implementador ↔ verificación:** 1. El revisor pidió pruebas de integración de CA5, y esas pruebas destaparon un `500` que se corrigió.
- **Foto:** `refs/sdd/cupo-por-categoria` = `d68fe6a`.
- **Cambios ajenos:** M0–M3a sin commitear (`arbol-inicial.txt`). No van en el commit de esta corrida.
- **Línea base:** `linea-base.md`. Rojos que ya estaban: `lint` y `auditoria`.

## Qué cambia

Las **escrituras** de api-core pasan a ser por categoría, sobre la tabla `reporte`.

**`POST /reportes`:**
- Acepta dos formas:
  - la plana de hoy, que crea una inundación idéntica a la de antes;
  - `{ …núcleo, categoria, subtipo?, detalle }`, con el `detalle` validado estricto por la definición de la categoría.
- Una categoría inactiva o desconocida da `422 CATEGORIA_NO_DISPONIBLE` sin gastar cupo.
- Un `detalle` con claves de más o de más de 8192 bytes da `400`, sin gastar cupo.
- La severidad y su versión salen de la definición.
- La auditoría `crear` suma `categoria` y conserva `reglas` (E1, §9.1).

**Cupo:**
- Usa `cupo_contador`:
  - `reportes:<categoria>`: 3 por cuenta y por día, por categoría, con el override de instalación `REPORTES_POR_DIA_POR_CUENTA`;
  - `fotos:cuenta`: 12 por día, global.
- La demora sale del contador de la categoría.
- El `429` suma `detalles.categoria`.
- api-core no arranca si una categoría activa trae una regla de cupo desconocida: falla cerrado.
- `cuota_reporte_diaria` queda sin uso hasta M10.

**`/auth/yo`:** suma `cupos` por categoría activa y `fotos_restantes_hoy`. Los campos de antes son los de inundación.

**Moderación:**
- `PATCH /estado`, `/severidad` y `/fusionar` operan sobre `reporte`.
- Fusionar con un canónico de otra categoría da `409 FUSION_ENTRE_CATEGORIAS`.
- `PATCH /estado` acepta el ID corto.

**Documentación:** README de api-core; `CLAUDE.md` §2, §4.8, §7.1, §7.2, §7.5, §7.6, §9.2 y §13; nota en el doc 14.

## Regresión contra la línea base

**Ninguna.** Todas las pruebas de la línea base siguen existiendo y en verde. La única excepción es un renombre previsto: en `cupo-diario`, `cupoDelDia…` pasa a `leerCupos…`. El detalle prueba por prueba está en `verificacion.md`.

| Qué | Base | Después |
|---|---|---|
| `contracts` | 289 | **292** |
| `db` | 294 | 294 |
| `api-core` | 422 + 11 omitidas | **436 + 12** |
| `geo-service` | 71 | 71 |
| apps (web y panel) | 486 y 458 | 486 y 458 |
| PostgreSQL real | 9 | **10** |
| Seguridad (9 archivos) | 152 | **163** |
| Privacidad (6 archivos) | 94 | 94 |
| typecheck, build y secretos | verdes | verdes |
| OpenAPI | — | sin cambios frente a M3a (`aaa8b711…6bac`) |
| `lint` y `auditoria` | rojos ajenos | iguales |

**E2E** (base `curichi_e2e`, en la 0021): **87/87**, sin reintentos.
- Por primera vez corrieron las pruebas de navegador. Chromium arrancó con `PLAYWRIGHT_BROWSERS_PATH`, que se fijó solo en los comandos, por decisión del usuario.
- Las dos pruebas que ya tenían línea base dieron lo mismo: `api-contratos` 14/14 y `separacion-publica-tecnica` 7/7.
- Las demás no tenían línea base y dieron todo verde:

  | Prueba | Resultado |
  |---|---|
  | `cuenta-ciudadana` | 12 |
  | `acceso-panel` | 8 |
  | `publicacion-diferida` | 6 |
  | `ubicacion-obligatoria` | 19 |
  | `ubicacion-aproximada` | 3 |
  | `csp` | 5 |
  | `camara-foto` | 4 |
  | `datos-reales` | 9 |

La pila Docker quedó igual a `pila-antes.txt`, y `curichi` no se tocó.

## Criterios

| CA | Pruebas | Resultado |
|---|---|---|
| CA5 · creación | `cupo-diario.test.ts`: el `describe` «CA5…» (6 casos) y la categoría sintética; `reportes.test.ts` (E1 en la auditoría); `contrato-0-20` (`reglas`) | verde |
| CA6 · cupo | `cupo-diario.test.ts` (24); `cuota-concurrencia-pg` y `fotos-cuota-concurrencia-pg` con PostgreSQL real, incluido «dos categorías a la vez»; `fotos-cuota` | verde |
| CA7 · `/auth/yo` | `cupo-diario` («un cupo por categoría activa»); `cuentas-y-cuota` (claves exactas) | verde |
| CA8 · moderación | `moderacion.test.ts` (13): ID corto en `PATCH`, `409` por `PATCH` y por `POST` | verde |
| CA9 · documentación | README de api-core, `CLAUDE.md` y doc 14 | hecho; el revisor no encontró contradicciones con el código |

## Hallazgos del revisor y del auditor

En la vuelta 1 no quedó ningún BLOQUEANTE, IMPORTANTE ni MENOR. Se cumplen CA5–CA9 y las reglas de compatibilidad 1–6, y ninguna prueba ajustada quedó más débil.

| Severidad | Hallazgo | Resolución |
|---|---|---|
| IMPORTANTE (revisor) | `services/api-core/src/categorias.ts` es un archivo sin seguimiento que creó M3a. M3b le sumó `limiteReportesDe`, `validarReglasDeCupo` y `verificarReglasDeCupoActivas`, pero no estaba en `archivos.txt`, y `git diff` no lo mostraba | **Resuelto.** Se declaró y se agregó al diff. Un recálculo de los `sha256` de todos los archivos de código sin seguimiento lo hicieron por separado el agente principal y el revisor. Solo cambiaron ese y los 4 de `contracts` de la corrección de `reglas`; geo-service no cambió |
| MENOR (revisor) | Faltaba la prueba de integración del `422 CATEGORIA_NO_DISPONIBLE` sin gastar cupo | **Resuelto** con el caso (a) |
| MENOR (revisor) | Faltaban pruebas de integración del `detalle` con claves de más y del tope de 8 KB | **Resuelto** con los casos (b), (b2), (c), (c2) y (c3). **Destapó un bug:** un `detalle` de más de 8192 bytes daba **`500`**, porque saltaba el CHECK de la 0020. Ahora hay una comprobación previa, antes del PIP y del cupo, y la violación de `detalle_tope` se traduce a `400`. Las dos responden lo mismo y ninguna gasta cupo |
| REGRESIÓN (corrección de `reglas`) | `contrato-0-19.test.ts` comparaba la severidad con `toEqual` exacto | **Resuelto** dentro del cambio autorizado: sigue exacto y suma `reglas` |
| NOTA (auditor F4a) | Las reglas de cupo (ámbito y ventana) solo se validan al arrancar | **Para M6:** la activación de categorías desde el panel tiene que revalidarlas, o `reservar` tiene que leer la regla |
| NOTA (auditor, vuelta 1) | El `catch` solo traduce `detalle_tope`. En una categoría futura con texto libre en el `detalle`, un `\u0000` (`22P05`) o un *surrogate* suelto (`22P02`) darían `500` | **Para M6–M8.** Hoy no se puede alcanzar, porque inundación solo tiene enums. No filtra datos y no gasta cupo |
| NOTA (auditor, vuelta 1) | **Ya existía antes de esta corrida:** `descripcion` y `subtipo` con `\u0000` dan `500` | **Propuesto para el plan de M4.** No se arregló de pasada (regla 10) |
| NOTA (auditor, vuelta 1) | La guarda contra `__proto__` y `constructor` depende del valor por defecto de Fastify 5.12 (`"error"`) | Conviene fijarla en `app.ts` y sumar una prueba con `constructor` |
| NOTA (revisor) | La huella de idempotencia de la forma plana cambió de forma | Solo afecta a una clave en vuelo que cruce el despliegue. La tabla es efímera |
| NOTA (revisor, vuelta 1) | El `sha256` de `informe.md`, `linea-base.md` y `verificacion.md` de M3a no coincide con `arbol-inicial.txt` | Es la nota de la causa de Chromium. La agregó el agente principal con autorización del usuario, al arrancar M3b |

## En vivo y túnel

**No aplica.** Reconstruir la pila corre las migraciones sobre `curichi`, que está en la 0009 y no se toca. El auditor dejó una lista de `curl` para cuando se haga: plana, categoría inactiva, el 4.º reporte, `/auth/yo` y la lectura pública con y sin sesión.

## No verificado (y por qué)

| Qué | Motivo |
|---|---|
| En vivo (`curl` contra la pila reconstruida) | Migraría la base del usuario. Hace falta su autorización, con `pg_dump` antes |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `ContextosySkills/hooks/contexto.mjs`; `docs/dominio/infografia-plataformas-riesgo.html:128` | Biome da 1 error de formato y 6 avisos | `pnpm lint` en rojo. Ya estaba |
| Dependencias | `pnpm audit` da 3 high (`next`, `sharp`, `source-map-js`) | Ya estaba; necesita una tarea propia |
| `packages/db/migraciones/0020_base_multicategoria.sql:156` | El CHECK `detalle_tope` mide `detalle::text` de jsonb, con espacios. api-core mide `JSON.stringify` | Cubierto por la traducción a `400` en el `catch`. Si algún día se exporta el tope desde `contracts`, conviene una sola definición |

## Para M4

- **Sobre `reporte`:** las escrituras y lecturas de api-core ya trabajan por categoría.
- **En las apps:**
  - siguen usando la forma plana y los campos sueltos de `/auth/yo`;
  - M4 suma el selector de categoría, la preferencia y la URL;
  - los campos de respuesta opcionales de 0.20.0 pasan a obligatorios en M4/M5 (regla 5).
- **Pendientes que conviene meter en el plan de M4:**
  - `\u0000` en `descripcion` y `subtipo` da `500`;
  - fijar `onProtoPoisoning` y `onConstructorPoisoning`.

## Cómo volver atrás (si no se aprueba)

- **Archivos con seguimiento:** `git checkout refs/sdd/cupo-por-categoria -- <archivo>` para cada archivo de `archivos.txt` que aparezca en `git diff --name-only refs/sdd/cupo-por-categoria`. La foto incluye M0–M3a, así que eso se conserva.
- **Archivos sin seguimiento** (`services/api-core/src/categorias.ts` y los 4 de `contracts`): la foto no los tiene. Su versión anterior está identificada por su `sha256` en `arbol-inicial.txt`, y el contenido actual completo está en el diff de la corrida, para revertir a mano las funciones de M3b.
- **Base:** sin migraciones nuevas; `curichi_e2e` sigue en la 0021.

## Puerta 2

**Sin commit**, por decisión del usuario del 2026-10-08. La corrida queda verificada y se conserva `refs/sdd/cupo-por-categoria`. Cuando el usuario lo pida, el commit lleva `archivos.txt` y esta carpeta, después de los de M1, M2 y M3a.

Mensaje propuesto: `feat(api-core): escrituras y cupo por categoría sobre cupo_contador (M3b)`.

---

## Plantilla de PR

### Parte y carpeta designada
- P3 (`services/api-core/`).
- `packages/contracts/`: cambio aditivo autorizado.
- `packages/db/src/mantenimiento.ts`: solo comentarios.
- `CLAUDE.md`: secciones autorizadas.

### Qué cambia
- `POST /reportes` por categoría, con dos formas de cuerpo.
- Cupo por categoría sobre `cupo_contador`; fotos con cupo global.
- `/auth/yo` con `cupos`.
- Moderación sobre `reporte`, con `409 FUSION_ENTRE_CATEGORIAS`.
- Tope de `detalle`: `400`.

### Cómo verificarlo

```bash
npx -y pnpm@12.4.1 exec turbo run typecheck test --filter=...contracts --concurrency=1
```

### Cambios de contrato
- [x] Sí, aditivo dentro de 0.20.0. `SeveridadCategoria.calcular` devuelve `reglas?`. El OpenAPI no cambia.

### Definition of Done
- [x] Sin regresiones contra la línea base. `lint` y `auditoria` siguen rojos solo por archivos ajenos.
- [x] Camino crítico probado:
  - creación por categoría;
  - cupo con PostgreSQL real, incluidas dos categorías a la vez;
  - `422` y `400` sin gastar cupo;
  - E2E 87/87.
- [x] README de api-core, `CLAUDE.md` y doc 14 al día.
- [x] Sin cambios fuera de las carpetas, salvo los autorizados.
- [x] Auditoría de seguridad y privacidad sin hallazgos bloqueantes.
