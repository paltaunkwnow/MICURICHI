# Implementación — M3b, escrituras y cupo por categoría

Transcripción de los informes de los implementadores, hecha por el agente principal. Las salidas son
las que pegaron ellos; la verificación independiente va en `verificacion.md`.

| Tarea | Agente | Criterio | Carpeta |
|---|---|---|---|
| M3.6 · api-core, escrituras y cupo | `trabajador-raiz` | CA5–CA8 | `services/api-core/` |
| M3.6b · `reglas` en la auditoría de creación | `trabajador-raiz` (dos agentes: el primero escribió el cambio y se cortó por el límite de sesión antes de verificar; el segundo lo verificó y lo terminó) | CA5 (sin regresión de §9.1 y §13) | `packages/contracts/` (cambio aditivo autorizado por el usuario el 2026-10-09) y `services/api-core/` |
| M3.7 · README de api-core | `general-purpose` (Sonnet) | CA9 (parte) | `services/api-core/README.md` |
| M3.7 · `CLAUDE.md` y la nota del doc 14 | agente principal | CA9 (parte) | `CLAUDE.md` §2, §4.8, §7.1, §7.2, §7.5, §7.6, §9.2 y §13; `docs/arquitectura/14` §5 |
| M3.7b · dos comentarios desactualizados (los encontró M3.7) | `general-purpose` (Sonnet) | CA6 y CA9 | `services/api-core/src/config.ts` (JSDoc de `reportesPorDia`) y `packages/db/src/mantenimiento.ts` (comentarios de los `DELETE` de `cuota_reporte_diaria` y `cupo_contador`). Solo cambian comentarios. Contra la foto, el diff de `mantenimiento.ts` tiene solo líneas `//` |

La lista completa está en `archivos.txt`. Hubo varios cortes por límite de sesión. En todos se comprobó con
`git diff refs/sdd/cupo-por-categoria` y los hashes de `arbol-inicial.txt` que no quedara nada a medias
antes de retomar.

## Por tarea (según los implementadores)

### M3.6 · api-core, escrituras y cupo (CA5–CA8)

Todo quedó dentro de `services/api-core/`. Son 18 archivos con seguimiento (7 de `src/` y 11 de `test/`) y uno **sin seguimiento**: `src/categorias.ts`, que creó M3a. M3.6 le sumó `limiteReportesDe`, `validarReglasDeCupo` y `verificarReglasDeCupoActivas`. `git diff` contra la foto no lo muestra.

El revisor lo encontró en F4a: faltaba en `archivos.txt`, y se agregó. El agente principal comparó contra `arbol-inicial.txt` los hashes de todos los archivos de código sin seguimiento. Cambiaron solo ese y los cuatro de `contracts` de M3.6b; los de geo-service no cambiaron.

`packages/db` no se tocó, porque CA6 no lo exigía:
- `cupo_contador` ya tiene su PK y su CHECK;
- `curichi_api` ya tiene los privilegios sobre `cupo_contador` y `reporte`;
- el mantenimiento ya borra las ventanas viejas.

No hay migración 0022 y `contracts` 0.20.0 no cambió en esta tarea.

- **CA5 · `POST /reportes`**:
  - `normalizarReporteCrear` acepta las dos formas; la plana se convierte en inundación.
  - Orden de las comprobaciones:
    1. Categoría desconocida o inactiva: `422 CATEGORIA_NO_DISPONIBLE`, antes de resolver y sin gastar cupo.
    2. `detalle` validado con `def.esquemaDetalle` estricto: claves de más o valores fuera de rango dan `400 PAYLOAD_INVALIDO`.
    3. Dispositivo.
    4. PIP.
    5. Idempotencia.
    6. Cupo.
    7. `INSERT` en **`reporte`**.
  - El `INSERT` guarda `categoria`, `subtipo`, `detalle` y `detalle_version`. La severidad es la de la definición: banda, puntaje y `def.severidad.version`.
  - Las seis columnas planas salen del `detalle` en inundación. En otra categoría van en `NULL`, con `causa_presunta = NULL` explícito.
- **CA6 · Cupo** (`src/cuota.ts`, reescrito sobre `cupo_contador`):
  - **Claves:**
    - `reportes:<slug>`: ventana del día local, límite `limiteReportesDe(def, cfg.reportesPorDiaOverride)`.
    - `fotos:cuenta`: global, `cfg.fotosPorDia`.
  - **Contador:** el mismo *upsert* atómico (`… ON CONFLICT … DO UPDATE SET n = n + 1 WHERE n < $limite RETURNING n`), dentro de la transacción del reporte. La demora sale de `cupo.n`.
  - **`429 CUOTA_DE_REPORTES`:** suma `detalles.categoria` y `Retry-After` hasta la medianoche.
  - **Validación al arrancar:** `verificarReglasDeCupoActivas` en `servidor.ts`, antes de `listen`. Falla cerrado.
  - **Sin uso:** `cuota_reporte_diaria` queda sin uso y no se borra.
  - **API:** se retiró `cupoDelDia`, que reemplaza `leerCupos`.
- **CA7 · `/auth/yo`:**
  - suma `cupos` por categoría activa y `fotos_restantes_hoy`;
  - los campos sueltos son los de inundación;
  - todo sale de una sola consulta, `leerCupos`.
- **CA8 · Moderación:**
  - Sobre `reporte`: `PATCH /estado`, `/severidad` y `/fusionar`, más el `FOR UPDATE`, el reapuntado y el `DELETE` de `punto_critico`.
  - **`409 FUSION_ENTRE_CATEGORIAS`:** se comprueba con las dos filas bloqueadas y antes del chequeo de estado del canónico.
  - **ID corto en `PATCH /estado`:** `resolverIdReporte` ya lo resolvía; ahora una prueba lo comprueba.

**Pruebas nuevas:**
- `cupo-diario`, 5 casos:
  - con una categoría sintética activa, el 4.º reporte de inundación da `429` con `detalles.categoria` y el 1.º de la sintética entra con 60 s;
  - cada categoría lleva su propio contador;
  - `/auth/yo` trae un cupo por categoría activa;
  - una regla desconocida impide arrancar.
- `moderacion`, 2 casos:
  - `PATCH /estado` con ID corto;
  - `409 FUSION_ENTRE_CATEGORIAS` por `PATCH` y por `POST`.
- `cuota-concurrencia-pg`: «dos categorías a la vez», con PostgreSQL real.

**Pruebas ajustadas:** según el implementador, ninguna quedó más débil; el revisor lo comprueba.

| Prueba | Ajuste | Motivo |
|---|---|---|
| `ayudas.liberarCuota` | Borra `reportes:%` de `cupo_contador` | Pasa a `cupo_contador` |
| `cuentas-y-cuota` | El conjunto exacto de claves de `/auth/yo` suma `cupos` y `fotos_restantes_hoy` | Lo exige CA7 |
| `cupo-diario` | El caso de `cupoDelDia` pasa a `leerCupos` | Misma invariante, con la API nueva |
| `publicacion-diferida`, `fotos-cuota`, `guarda-disco`, `ubicacion-dispositivo`, `*-concurrencia-pg` | Leen y limpian `cupo_contador` | Pasan a `cupo_contador` |
| `resiliencia` | El pool de mentira responde el catálogo de categorías | La validación de la categoría corre antes del resolver; sin esto daría `422` en vez del `503`/`500` que la prueba comprueba |

**Salidas** (todo en serie, con 7,3–9,7 GB de RAM libre):

| Comando | Resultado | Comparación con la línea base |
|---|---|---|
| `api-core` typecheck, antes | exit 0 | — |
| `api-core` vitest | **429 pasadas y 12 omitidas** | Base: 422 y 11. Siete pruebas nuevas; la omitida de más es el caso `pg` de dos categorías |
| `cupo-diario` | 18 | Base: 13 |
| `moderacion` | 13 | Base: 11 |
| `fotos-cuota` | 10 | Igual que la base |
| `idempotencia` | 11 | Igual que la base |
| Privacidad, 6 archivos | 94 | Igual que la base |
| Seguridad, 9 archivos | 157 | Base: 152, más las 5 de `cupo-diario` |
| PostgreSQL real, bases efímeras creadas y borradas | 10 | Incluye «dos categorías a la vez» |
| `typecheck --filter=...contracts` | 9/9 | — |
| Biome | Limpio | — |

### M3.6b · `reglas` en la auditoría de creación

**Origen.** M3.6 había quitado `reglas` de la auditoría `crear`, porque el resultado genérico de
`def.severidad.calcular` no lo traía. Se perdía la anotación de E1 que pide §9.1 («se anota siempre que
P = 4»). El usuario autorizó restaurarla con un cambio aditivo en `contracts`, sin subir la versión 0.20.0.

**Cambio del primer agente:**

| Archivo | Cambio |
|---|---|
| `packages/contracts/src/categorias/tipos.ts:90-94` | `calcular` devuelve `reglas?: readonly string[]` |
| `packages/contracts/src/categorias/inundacion/definicion.ts:85-86` | La definición de inundación devuelve las `reglas` |
| `packages/contracts/CHANGELOG.md` | Viñeta en 0.20.0 |
| `packages/contracts/test/contrato-0-20.test.ts` | Tres casos: E1 con `mas_70`, sin reglas con poca profundidad y una categoría que omite `reglas` |
| `services/api-core/src/rutas/reportes.ts:386` | `reglas: sev.reglas` en la auditoría `crear` |
| `services/api-core/test/reportes.test.ts:88` | La auditoría guarda E1 y la categoría |

**Lo que el segundo agente terminó al verificar** (todo en archivos de la corrección):
- **`reportes.test.ts`:** la prueba «sin sesión no se puede moderar…» tomaba `features[0]`. Con la demora en 0 del entorno de prueba, el reporte `mas_70` del caso nuevo quedaba primero, así que ahora la prueba busca su reporte por `id`.
- **`contrato-0-20.test.ts`:** a los dos objetos de la prueba nueva les faltaba `causa_presunta`, obligatorio en el tipo (`tsc` daba TS2345). Se agregó `causa_presunta: 'desconocida'`; el cálculo ignora ese campo.
- **`contrato-0-19.test.ts`:** comparaba `def.severidad.calcular` con `toEqual` exacto y fallaba con la clave nueva. Era una regresión de la corrección. El arreglo amplía el alcance a este archivo, que es parte del mismo cambio autorizado de `contracts`: sigue con `toEqual` exacto y suma `reglas: []` y `reglas: ['E1']`.
  Los esperados salen de `dominio/severidad.ts`, sin editarlo: `reglas: []` en `tobillo/primera_vez`, `reglas: ['E1']` en `mas_70/primera_vez` y `reglas: []` en `muslo/agua_estancada`.

**Salidas del segundo agente** (en serie, con 2,7–9,7 GB de RAM libre):

| Comando | Resultado |
|---|---|
| `contracts` vitest, antes de arreglar `contrato-0-19` | 291 pasadas y 1 fallida (`contrato-0-19.test.ts:164`). Las 3 pruebas nuevas, en verde |
| `contracts` vitest, después | **292 de 292** (19 archivos) |
| `contracts` typecheck y Biome, después | Verdes |
| OpenAPI | `sha256` `aaa8b711…6bac`, igual antes y después del build. La corrección no lo toca |
| `api-core` vitest | **430 pasadas y 12 omitidas**: las 429 de M3.6 más la de E1 |
| `reportes.test.ts` aislado | 21 de 21 |
| Seguridad, 9 archivos | 157 de 157 |
| `typecheck --filter=...contracts` | 9 de 9 |
| `biome check packages/contracts services/api-core` | Limpio, 112 archivos |

En la primera corrida completa de api-core, `exportacion.test.ts:217` falló por el *timeout* de 5000 ms, con la
máquina muy cargada. Aislado da 10 de 10 y la corrida completa siguiente quedó limpia. El verificador
lo vuelve a mirar.

### M3.7 · README de api-core

Según el implementador, cada dato se contrastó con el código. Lo que cambió:
- La tabla de rutas: `POST /reportes`, `POST /fotos`, `PATCH /estado`, `/severidad`, `/fusionar` y `/auth/yo`.
- «Cupo diario», reescrito sobre `cupo_contador`, con la subsección nueva «Reglas de cupo al arrancar (falla cerrado)».
- «Publicación»: la demora la fija el número del reporte del día en la categoría.
- La descripción de las pruebas `*-pg`.
- La apertura de «Categorías».
- «Qué falta para la corrida M3b» pasó a «Escrituras por categoría (corrida M3b)», con un ejemplo de cada cuerpo.

No encontró contradicciones entre el código y `CLAUDE.md` en lo de M3b. Biome no procesa `.md`: la configuración lo ignora.

Encontró dos comentarios de código desactualizados, que corrigió M3.7b.

## Vuelta 1 (después de la F4a)

**Qué dejó cada agente de la F4a:**
- **Auditor:** sin hallazgos que corregir. Dejó una nota para M6: la validación de las reglas de cupo corre solo al arrancar.
- **Revisor:**
  - un IMPORTANTE de trazabilidad: `src/categorias.ts` faltaba en `archivos.txt`. Resuelto arriba;
  - dos MENOR: faltaban pruebas de integración de CA5.
- **Verificador:** se cortó por el límite de sesión después de la fila 11. Hasta ahí, sin regresiones.

**M3.8 · pruebas de CA5** (`trabajador-raiz`, `services/api-core/`):
- **Pruebas nuevas** en `test/cupo-diario.test.ts`, en el `describe` «CA5: categoría indisponible o detalle inválido → 4xx sin gastar cupo». Seis casos:
  - (a) categoría inactiva (`bache`) o desconocida: `422 CATEGORIA_NO_DISPONIBLE`;
  - (b) `detalle` con una clave de más: `400`;
  - (b2) `__proto__` como clave propia del JSON: `400`. Lo corta el *parser* de Fastify (`onProtoPoisoning: 'error'`) antes del `safeParse`;
  - (c) `detalle` de más de 8192 bytes: `400`;
  - (c2) control dentro del tope: `201`;
  - (c3) borde en que el `JSON.stringify` mide ≤ 8192 y el `detalle::text` de jsonb mide > 8192: `400`.

  En todos los casos de error se comprueba que no se gastó cupo y que no se creó el reporte. Para (c), (c2) y (c3) hay dos categorías sintéticas activas sobre los slugs del catálogo `basura` y `area_verde`.
- **Bug encontrado y corregido.** El caso (c) daba **`500`**: el CHECK `detalle_tope` de la 0020 saltaba dentro de la transacción. Se corrigió en `src/rutas/reportes.ts`, en dos partes:
  - **Comprobación previa.** Mide `Buffer.byteLength(JSON.stringify(detalle))` contra `DETALLE_TOPE_BYTES = 8192`, una constante local que cita el CHECK. Corre antes del PIP y del cupo.
  - **Traducción en el `catch` del `INSERT`.** Solo la violación `23514` con `constraint === 'detalle_tope'` pasa a `400`, después del `ROLLBACK`. Cubre el borde (c3).

  Las dos responden el mismo cuerpo (`RESPUESTA_DETALLE_GRANDE`). Cualquier otro error sigue como antes.

  Antes del arreglo, (c) y (c3) daban `500`, como dicen las salidas pegadas del implementador. Para (c3), además, se desactivó a propósito la traducción y la prueba volvió a fallar.
- **README:** la frase del tope dice ahora que api-core rechaza con `400` y que la base queda de respaldo.

**Salidas, en serie:**

| Comando | Resultado |
|---|---|
| `api-core` vitest, antes | 430 pasadas y 12 omitidas |
| `api-core` vitest, después | **436 pasadas y 12 omitidas** |
| `cupo-diario` | 24/24 (en F4a: 18) |
| Seguridad (9 archivos) más `reportes` | 183/183, con el primer arreglo |
| Typecheck | Exit 0 |
| Biome | Limpio |

## Decisiones técnicas para la revisión

1. **Huella de idempotencia.** Incluye `categoria`, `subtipo` y `detalle`, y excluye el dispositivo, como antes. Un reenvío de otra categoría o con otro `detalle` no se confunde con el primero.
2. **Inicio de la ventana.** Es la medianoche local de la ciudad, como `timestamptz` (`VENTANA_DIA_LOCAL`). Es el mismo valor con el que el mantenimiento decide qué ventanas ya pasaron.
3. **Validación al arrancar.** Se hace después de `verificarPrivilegios` y antes de `listen`. Solo se admiten el ámbito `cuenta+categoria` y la ventana `dia_local`. Cualquier otro valor en una categoría activa impide arrancar.
4. **Devolución del turno.**
   - Foto: `devolverTurnoDeFoto(…, ventanaInicio)` en el `finally`, si no se guardó.
   - Reporte: el `ROLLBACK` devuelve el turno, porque el *upsert* vive dentro de la transacción.
   - Replay: no gasta, porque el cupo va después de la idempotencia.
5. **Override del límite.** El límite efectivo es `REPORTES_POR_DIA_POR_CUENTA ?? def.cupo.limite`. `cfg.reportesPorDia` es el efectivo de inundación y sostiene los campos sueltos de `/auth/yo` y el mensaje del `429`.
6. **`reglas` opcional en `contracts`.** Es aditivo y no cambia el OpenAPI. Una categoría que no escala puede omitirlo. Inundación lo devuelve siempre, también vacío.
