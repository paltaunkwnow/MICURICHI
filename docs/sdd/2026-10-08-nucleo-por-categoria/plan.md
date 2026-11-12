# Plan de M3 — Núcleo consciente de la categoría

- **Estado:** **APROBADO** por el usuario el 2026-10-08, con la **ventana E2E autorizada** (base aparte
  `curichi_e2e`) en M3a y M3b y la edición de `CLAUDE.md` §2, §7.5, §7.6 y §13 autorizada.
- **Fecha:** 2026-10-08.
- **Roadmap:** `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` §5, fila M3: «unión discriminada, filtro por
  categoría, cupo por categoría, `/auth/yo` con `cupos`, fusión dentro de la categoría, DBSCAN particionado».
  Para el usuario final: **nada cambia** (Inundaciones sigue siendo la única categoría activa y su cupo es idéntico).
- **ADR que aplican:** 0009, 0010, 0012 (compatibilidad de API), 0013 (datos por categoría), 0014–0017,
  0021, 0023. Decisiones del 2026-10-08: cupo de fotos **global**; `fusionado_en_id` en `PATCH /estado`
  acepta **UUID o ID corto**.
- **Entrada medida:** `docs/sdd/2026-10-08-base-multicategoria/medicion.md` (índice parcial
  `(categoria, creado_en DESC)` junto al GIST).
- **Proceso:** CLAUDE.md §12.4, con **dos corridas SDD** (M3a y M3b), cada una con línea base, verificación,
  revisión y auditoría. Sin commit hasta que el usuario lo pida.

## Objetivo

Que api-core, geo-service y `packages/db` trabajen **por categoría** sobre la tabla `reporte`:

- filtrar, crear, contar el cupo, fusionar y agrupar puntos críticos dentro de cada categoría;
- dejar el camino listo para que M6 (Baches) solo agregue una definición en `contracts` y la active en el
  catálogo;
- respetar la compatibilidad de la ADR 0012: **sin `categoria`, todo se comporta como hoy (inundación)**.

## Reglas de compatibilidad (valen para todas las tareas)

1. **Sin parámetro `categoria` = `inundacion`** en todas las lecturas y en `POST /reportes` (cuerpo plano de hoy).
2. `categoria=todas` solo en las rutas del panel (`/tecnico/reportes`, `/exportar`, `/indicadores`,
   `/ejecutivo/resumen`). Las rutas públicas exigen **una** categoría activa.
3. **Categoría activa** = fila `activa` del catálogo `categoria` **y** definición en `REGISTRO_CATEGORIAS`.
   Si falta cualquiera de las dos, cuenta como inactiva (falla cerrado) y se registra en el log.
4. Respuestas **aditivas**: suman `categoria`, `subtipo` y `detalle`. Para inundación siguen los campos planos
   (`profundidad_estimada`…) hasta la contracción (M10). La vista pública devuelve en `detalle` **solo** los
   `camposPublicos` de la definición (hoy, los mismos tres campos que ya son públicos).
5. Las apps (`apps/*`) **no se tocan** en M3 (son M4 y M5) y su `typecheck` y sus pruebas tienen que quedar
   **iguales a la línea base**. Si un campo nuevo obligatorio en una respuesta rompe tipos o *fixtures* de las
   apps, ese campo va como **opcional** en el contrato, con un comentario, hasta M4/M5.
6. La vista `reporte_inundacion` sigue existiendo (scripts y seeds la usan); api-core y geo-service pasan a
   leer y escribir **`reporte`** con un filtro explícito de categoría.

## Diseño propuesto [RECOMENDACIÓN, entra con la aprobación]

| Tema | Propuesta |
|---|---|
| Versión | `contracts` **0.20.0** (aditiva). La contracción de campos planos, en una versión posterior (13.2 §8.3 decía 0.20; la 0.19 la usó el registro de M1) |
| Errores nuevos | `400 CATEGORIA_NO_DISPONIBLE` en lecturas públicas con categoría desconocida o inactiva; `422 CATEGORIA_NO_DISPONIBLE` en `POST /reportes`; `409 FUSION_ENTRE_CATEGORIAS`. En rutas del panel, un slug desconocido es `400` con el código de validación que ya usa cada ruta |
| `POST /reportes` | Dos formas: **plana** (hoy, = inundación) y **nueva** `{ …núcleo, categoria, subtipo?, detalle }`. El núcleo (ubicación, dispositivo, `ubicacion_tipo`, descripción, fecha, fotos, honeypot) se valida igual que hoy; el `detalle`, con el Zod **estricto** de la definición. Severidad, versión, radio y cupo salen de la definición. Para inundación se siguen escribiendo las columnas planas (el disparador de la 0020 arma el `detalle`); para otra categoría, columnas planas en `NULL` y `causa_presunta = NULL` explícito |
| Cupo | Pasa de `cuota_reporte_diaria` a **`cupo_contador`**: `reportes:<slug>` (día local, límite de la `ReglaCupo` de la categoría; `REPORTES_POR_DIA_POR_CUENTA` lo reemplaza para toda la instalación) y `fotos:cuenta` (12 por día, global). La **demora** sale del contador de la categoría (ADR 0017). Al arrancar, api-core valida que toda categoría activa tenga una regla con `ambito` y `ventana` conocidos; si no, **no arranca** (falla cerrado). `cuota_reporte_diaria` queda sin uso hasta M10. El cambio reinicia los contadores del día en que se despliega (sin efecto en local; se anota para producción) |
| `/auth/yo` | Suma `cupos: { <slug>: { restantes, demora_proximo_s, puede_reportar_desde } }` de las categorías activas y `fotos_restantes_hoy`. Los campos de hoy siguen y valen para inundación |
| `429 CUOTA_DE_REPORTES` | Suma `detalles.categoria`; `Retry-After` igual que hoy |
| Fusión | `409 FUSION_ENTRE_CATEGORIAS` si el canónico es de otra categoría; `PATCH /estado` acepta `fusionado_en_id` como UUID o ID corto (misma expresión que `POST /fusionar`) |
| Puntos críticos | DBSCAN completo con `PARTITION BY categoria` y radio de **cada** definición; el incremental solo mira vecinos de la misma categoría; `punto_critico.categoria` se escribe |
| Índices | Migración **0021**: índice parcial `(categoria, creado_en DESC) WHERE estado IN (públicos)` (medición de M2) |
| geo-service | `GET /agregados/unidades-vecinales?categoria=` y `GET /puntos-criticos?categoria=` (sin parámetro = inundación; inactiva = 400), con caché **por categoría** |
| `/configuracion` | Suma `categorias_activas: [slug…]` en el orden canónico |
| Exportación | El CSV y el GeoJSON suman `categoria`, `subtipo` y `detalle` (JSON) al final; las columnas de inundación quedan vacías en otras categorías |
| Mis reportes | Devuelve los de todas las categorías del autor, con `categoria` |
| Métrica de bandeja | Cuenta los `nuevo` publicados de **todas** las categorías (la alerta vale para todas) |
| Inyección del registro | api-core y geo-service reciben el registro de categorías como dependencia (por defecto `REGISTRO_CATEGORIAS`), para que las pruebas usen una categoría sintética activa sin tocar `contracts` |

## Corrida M3a — Lecturas por categoría

**Partes y carpetas:** P3 (`packages/contracts/`, `services/api-core/`), P4 (`packages/db/`, `services/geo-service/`).
**Banderas:** `base`, `contrato`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia`, `api`.

| Tarea | Agente | Criterios |
|---|---|---|
| **M3.1 · `contracts` 0.20.0** (todo el contrato de M3, también lo que usa M3b) | `trabajador-raiz` | CA1 |
| **M3.2 · `packages/db`**: 0021 (índice), DBSCAN particionado, `test-utils.insertarReporte` con categoría | `trabajador-raiz` | CA2 |
| **M3.3 · api-core, lecturas**: listados, detalle, técnico, mis reportes, exportar, indicadores, ejecutivo, fotos, id corto, `/configuracion`, métrica, mantenimiento, sobre `reporte` con categoría | `trabajador-raiz` | CA3 |
| **M3.4 · geo-service**: agregados y puntos críticos por categoría, caché por categoría | `trabajador-raiz` | CA4 |
| **M3.5 · README** de api-core y geo-service | `general-purpose`, `sonnet` | CA9 |

### CA1 · Contrato 0.20.0

- `categoria` en `ReporteFiltrosSchema` (y por extensión exportar), `IndicadoresFiltrosSchema` y
  `ResumenEjecutivoQuerySchema`: slug canónico, alias normalizados con `normalizarSlugCategoria`, `todas` donde
  corresponde, sin parámetro = `inundacion`.
- Respuestas con `categoria`, `subtipo`, `detalle` (regla 4 y 5).
- `ReporteCrearCategoriaSchema` (forma nueva) junto a `ReporteCrearSchema` (plana, sin cambios).
- `ReporteCambiarEstadoSchema.fusionado_en_id`: UUID o ID corto.
- `SesionActualSchema`: `cupos` y `fotos_restantes_hoy`. `ConfiguracionPublicaSchema`: `categorias_activas`.
- Códigos de error nuevos en el lugar donde viven los demás.
- OpenAPI regenerado (**cambia**, a propósito) y CHANGELOG 0.20.0, con la nota de D3 (ADR 0023).
- Pruebas `contrato-0-20.test.ts`: forma vieja y nueva, alias y `todas`, detalle estricto, ID corto, compatibilidad
  de los ejemplos de hoy.
- `typecheck` y pruebas de **todos** los consumidores, incluidas las apps, iguales a la línea base.

### CA2 · Base de datos

- Migración 0021 con su prueba (desde cero, dos veces, el índice existe y el listado por categoría lo usa en
  un `EXPLAIN` con datos sintéticos).
- DBSCAN completo e incremental **por categoría**: un bache y una inundación a 5 m **no** forman grupo; el
  recálculo de inundación da **los mismos grupos** que antes; `punto_critico.categoria` correcto; radio de cada
  definición.
- `insertarReporte` de `test-utils` acepta categoría (por defecto inundación) sin romper a sus usuarios.
- `pnpm --filter db privilegios` en verde en una base efímera.

### CA3 · api-core, lecturas

- Todas las lecturas leen `reporte` con `categoria = $n` (o sin filtro con `todas`).
- **Prueba de no contaminación**: reportes de las cuatro categorías en las **mismas coordenadas** (los que no
  son de inundación, insertados por SQL en la prueba). Sin parámetro, cada ruta devuelve **solo**
  inundaciones (público, detalle, técnico, CSV, GeoJSON, indicadores, ejecutivo, fotos, id corto). Con
  `categoria=todas` en el panel, todas. En lo público, una categoría inactiva da 400; activada en la prueba
  (catálogo + registro sintético), devuelve solo las suyas.
- La **prueba de tabla de visibilidad** (`publicacion-diferida.test.ts`) suma la dimensión categoría.
- La vista pública no expone en `detalle` nada fuera de `camposPublicos`.
- `/configuracion` con `categorias_activas`.
- Suites de api-core **iguales a la línea base** más las nuevas. Si una prueba existente cambia, solo para
  seguir midiendo lo mismo, por ejemplo el espía de `indicadores.test.ts`, que cuenta `FROM reporte_inundacion`.

### CA4 · geo-service

- Agregados y puntos críticos con `?categoria=`, caché separada por categoría y sin mezcla.
- Prueba de no contaminación con la capa sintética.
- `plan-agregados` sigue en Index Only Scan.
- Suites iguales a la línea base más las nuevas.

## Corrida M3b — Escrituras y cupo por categoría

**Partes y carpetas:** P3 (`services/api-core/`), P4 (`packages/db/` si hace falta).
**Banderas:** `base`, `contrato`, `datos`, `privacidad`, `seguridad`, `concurrencia`, `api`.

| Tarea | Agente | Criterios |
|---|---|---|
| **M3.6 · api-core, escrituras**: `POST` con las dos formas; cupo y demora con `cupo_contador`; fotos con `fotos:cuenta`; `/auth/yo` con `cupos`; `429` con categoría; fusión dentro de la categoría y `PATCH /estado` con ID corto; validación de reglas de cupo al arrancar | `trabajador-raiz` | CA5–CA8 |
| **M3.7 · Documentación**: `CLAUDE.md` §2, §7.2, §7.5, §7.6, §13 (cupo por categoría), README de api-core | agente principal + `sonnet` | CA9 |

### CA5 · Creación

- La forma plana crea una inundación **idéntica** a la de hoy: mismas columnas, severidad, demora, auditoría
  y `detalle` armado por el disparador.
- La forma nueva con `categoria: 'inundacion'` y `detalle` crea lo mismo.
- Con una categoría sintética activa (registro inyectado y fila en el catálogo):
  - crea con `detalle` validado estricto;
  - las columnas planas quedan en `NULL`;
  - severidad y versión salen de su definición.
- Una categoría inactiva o desconocida da `422 CATEGORIA_NO_DISPONIBLE` **sin gastar cupo**.
- Con un `detalle` con claves de más, o con más de 8 KB, da `400`.
- La idempotencia y la publicación diferida siguen igual.

### CA6 · Cupo

- 3 por día **por categoría**: el 4.º de inundación es `429` con `detalles.categoria`, y el 1.º de la categoría
  sintética entra con **60 s** de demora.
- Fotos: 12 por día **global**.
- El turno se devuelve si falla el procesamiento.
- Un replay idempotente no gasta turno.
- El día es el de la ciudad.
- **Concurrencia con PostgreSQL real**: `cuota-concurrencia-pg` y `fotos-cuota-concurrencia-pg` reescritas sobre
  `cupo_contador`, más un caso de dos categorías a la vez.
- Una regla con ámbito desconocido impide el arranque.

### CA7 · `/auth/yo`

- `cupos` por categoría activa.
- Los campos de hoy son iguales a los de inundación.
- `fotos_restantes_hoy`.

### CA8 · Fusión

- `409 FUSION_ENTRE_CATEGORIAS`.
- `PATCH /estado` con ID corto funciona igual que `POST /fusionar`.
- Las pruebas de `moderacion.test.ts` siguen verdes.

### CA9 · Documentación

- READMEs de api-core y geo-service.
- `CLAUDE.md` §2 (glosario de cupo y demora), §7.2, §7.5, §7.6 y §13 al día con el cupo por categoría y los
  parámetros nuevos.
- Nota fechada en `docs/arquitectura/14`.

## Fuera de M3

| Qué | Fase |
|---|---|
| Selector, preferencia local, URL y formulario por categoría en la web | M4 |
| Panel por categoría (filtro, columnas, indicadores mixtos) | M5 |
| Definiciones de Baches, Basura y Áreas verdes y su activación | M6–M8 |
| Retirar columnas planas, la vista y `cuota_reporte_diaria` | M10 |

## Verificación (por corrida)

- **Línea base** antes de tocar, con `sdd-verificador`.
- Al terminar, en paralelo: `sdd-verificador` (verificación), `sdd-revisor` y `sdd-auditor` (hay `seguridad`,
  `privacidad` y `api-core`).
- **En vivo** (bandera `api`): **no aplica sin migrar tu base**. Reconstruir la pila corre el job de
  migraciones sobre `curichi`, que está en la 0009, y no se toca. Queda «no verificado», salvo que decidas
  otra cosa.
- **Ventana E2E** (base aparte `curichi_e2e`; nunca `curichi`): **recomendada para M3**, porque cambian las
  lecturas y escrituras de la API. Grupos G1 y los de privacidad y seguridad de la matriz, de a uno, con
  2,5 GB libres.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper a las apps por un campo obligatorio nuevo | Regla 5: opcional hasta M4/M5; `typecheck` y pruebas de las apps en la verificación |
| Contaminar lo público con otra categoría | Pruebas de no contaminación y de tabla por categoría; auditor |
| Perder el plan de consulta al pasar de la vista a `reporte` | Índice 0021 y `EXPLAIN` en las pruebas; `plan-agregados` y `resolucion-id-corto-indice` |
| Cupo que no cuenta bien en paralelo | Pruebas con PostgreSQL real sobre `cupo_contador` |
| Volumen: M3 toca muchas pruebas de api-core (16 archivos usan `liberarCuota`) | Se ajusta el *helper*, no cada prueba; el revisor comprueba que ninguna prueba se debilite |

## Preguntas para el usuario (antes de empezar)

1. ¿Aprobás este plan, con las dos corridas y el diseño de la tabla?
2. ¿Autorizás la **ventana E2E** (base aparte `curichi_e2e`) en la verificación de M3a y M3b?
3. ¿La autorización de editar `CLAUDE.md` cubre §2, §7.5, §7.6 y §13 en M3, como preveía el plan M0?
