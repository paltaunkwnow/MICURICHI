# Plan de la corrida M2 — Base multicategoría (expansión)

- **Estado:** **APROBADO** por el usuario el 2026-10-08 («Aprobado»), con estas respuestas: **D3** =
  documentar como «v2 extendida» (sin tocar datos; el punto 11 de CA1 no aplica); **cupo de fotos** =
  **12 por cuenta y por día, global**; **Docker** lo enciende el usuario.
- **Fecha:** 2026-10-08.
- **Roadmap:** `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` §5, fila M2: «Expandir la base:
  catálogo, renombre + vista, `categoria`/`subtipo`/`detalle`, contador de cupo genérico».
- **ADR que aplican:** 0009 (catálogo para activar), 0010 (modelo híbrido D), 0011 (renombre + vista
  filtrada + expandir/convivir/contraer), 0017 (`cupo_contador`). Pasos conceptuales en
  `docs/arquitectura/13.3-plan-migracion.md` §3.2–§3.4.
- **Proceso:** CLAUDE.md §12.4 con verificación SDD. **Sin commit** hasta que el usuario lo pida
  (decisión del 2026-10-08).

## Objetivo

Que la base tenga el **modelo multicategoría** (catálogo, `reporte` con `categoria`, `subtipo`,
`detalle` y `detalle_version`, contador de cupo genérico) **sin cambiar ningún comportamiento**: el
código de hoy (api-core, geo-service, scripts) sigue funcionando **sin tocarlo**, a través de la vista
de compatibilidad `reporte_inundacion`, y sus suites quedan iguales a la línea base.

## Clasificación (F0, se completa al aprobar)

| Campo | Valor |
|---|---|
| Parte | **4** (`packages/db/`), más una tarea chica de la **Parte 5** (M2.4, `scripts/respaldo.mjs`) |
| Carpeta designada | `packages/db/` (M2.1–M2.3) · `scripts/respaldo.mjs` (M2.4, solo ese archivo) |
| No puede tocar | `services/*`, `apps/*`, `packages/contracts/` (sin cambio de contrato en M2), `pipelines/*`, `infra/*`, `e2e/*`, el resto de `scripts/`, `data/raw/`, la base **`curichi`** |
| Banderas | `base`, **`datos`** (migración, tabla, columna, privilegio), **`geo`** (`punto_critico`), **`privacidad`** (`geom_publico`, vista), **`seguridad`** y **`concurrencia`** (cupo, *upsert*). En la duda se activan |
| Cambio de contrato | **No**. El OpenAPI no cambia |
| Rama | `feat/db/base-multicategoria`, creada desde el árbol actual (M1 sin commitear viaja con ella y se declara como ajeno) |
| Necesita Docker | **Sí**, para las pruebas con PostgreSQL real de la bandera `datos` (bases efímeras `curichi_sdd_*`, nunca `curichi`) y para la medición M2.3. Docker Desktop hoy está apagado: lo enciende el usuario (`Mi-Curichi.exe` o Docker Desktop) |
| Ventana E2E | A decidir en la puerta 1 (recomendado: no, como en M1; las suites de api-core y geo-service cubren la compatibilidad) |

## Decisiones que entran en el plan

Del usuario, **pendientes** (ver «Preguntas»):

- **D3** (versión de severidad de inundación): si se sube a v3, la migración lleva un `UPDATE`.
- **Cupo de fotos** (global o por categoría): no cambia el esquema de M2 (el contador es genérico), pero
  fija las claves que usará M3.

Técnicas, propuestas aquí [RECOMENDACIÓN]:

1. **Vista con `security_invoker = true`** (PostgreSQL 15+): los privilegios se comprueban con el rol
   que consulta, no con el dueño de la vista. Mantiene el mínimo privilegio de la 0008.
2. **Disparador de sincronización** del `detalle` de inundación: mientras api-core (sin tocar hasta
   M3) siga escribiendo solo las columnas planas, un disparador `BEFORE INSERT OR UPDATE` arma el
   `detalle` desde esas columnas cuando `categoria = 'inundacion'`. Sin él, los reportes nuevos
   tendrían `detalle = '{}'` y la invariante «el detalle reconstruye las columnas» se rompería.
   M3 decide si la fuente pasa al `detalle`; M10 retira el disparador junto con las columnas.
3. **CHECK de no contaminación**: inundación exige sus campos (`profundidad_estimada`, `frecuencia`…);
   las otras categorías los tienen en `NULL`.
4. **Sin índices nuevos en M2**: la medición M2.3 los decide con evidencia y van a la migración de M3.
5. **Migración inversa probada** (ADR 0011): un SQL de reversa (`packages/db/migraciones/reversas/0020_….sql`
   o donde encaje con el migrador) que deja el esquema como en la 0019 mientras solo haya inundaciones.

## Criterios de aceptación (metas verificables)

### CA1 · Migración 0020 (expansión)

`packages/db/migraciones/0020_<nombre>.sql`, en una transacción, idempotente con el migrador actual:

1. **Guarda** (patrón de la 0015): aborta con un mensaje claro si algún reporte tiene nulos donde hoy
   hay `NOT NULL` de dominio.
2. **`categoria`** (catálogo): `slug text PRIMARY KEY` (CHECK `snake_case`), `activa boolean NOT NULL
   DEFAULT false`, `orden smallint NOT NULL UNIQUE`, `activada_en`, `activada_por` (FK `usuario`,
   `ON DELETE SET NULL`). Filas: `inundacion` (activa), `bache`, `area_verde`, `basura` (inactivas),
   en el orden de `SLUGS_CATEGORIA`.
3. `ALTER TABLE reporte_inundacion RENAME TO reporte` (conserva ID, FK de fotos, idempotencia y
   `fusionado_en_id`, índices, CHECK y *grants*).
4. Columnas: `categoria text NOT NULL DEFAULT 'inundacion' REFERENCES categoria`, `subtipo text`,
   `detalle jsonb NOT NULL DEFAULT '{}'`, `detalle_version smallint NOT NULL DEFAULT 1`; CHECK
   `jsonb_typeof(detalle) = 'object'` y un **tope de tamaño** del `detalle` (p. ej. 8 KB).
5. Relleno: `detalle` de cada reporte existente desde sus 6 columnas de inundación.
6. Columnas de dominio de inundación a `NULL`-ables + CHECK de no contaminación (decisión técnica 3).
7. Disparador de sincronización (decisión técnica 2).
8. **Vista** `reporte_inundacion` (`security_invoker = true`): todas las columnas de `reporte`,
   `WHERE categoria = 'inundacion'`, `WITH CASCADED CHECK OPTION`; los mismos *grants* que tenía la
   tabla para `curichi_api` y `curichi_geo`. Comentario: la lista de columnas de una vista se fija al
   crearla, así que una columna nueva en `reporte` exige recrearla.
9. `punto_critico.categoria text NOT NULL DEFAULT 'inundacion' REFERENCES categoria`.
10. **`cupo_contador`** `(usuario_id uuid FK usuario ON DELETE CASCADE, clave text, ventana_inicio
    timestamptz, n integer CHECK (n >= 0), actualizado_en)`, PK `(usuario_id, clave, ventana_inicio)`,
    CHECK de largo de `clave`; *grants* de `curichi_api` como los de `cuota_reporte_diaria`. Nadie lo
    usa hasta M3.
11. Si el usuario elige **D3 = v3**: `UPDATE` de `severidad_version` con la regla que se decida.

### CA2 · Prueba de la migración

`packages/db/test/migracion-0020-*.test.ts`, con el patrón de las pruebas 0013–0019 (base migrada
`hasta: '0019'` con filas de todas las combinaciones de enums, fotos, auditoría, idempotencia, puntos
críticos y un `duplicado` con `fusionado_en_id`; después, la 0020):

- conteos por `estado`, fotos, auditoría, idempotencia y puntos críticos **iguales**;
- `md5` de las columnas no tocadas, **igual** antes y después;
- el `detalle` reconstruye las 6 columnas en el **100 %** de las filas;
- `SELECT` por la vista = `SELECT … FROM reporte WHERE categoria = 'inundacion'`;
- `INSERT` por la vista (como hace api-core hoy): toma `categoria = 'inundacion'`, el `id` por
  defecto y un `detalle` armado por el disparador; `INSERT … RETURNING`, `UPDATE`, `SELECT … FOR
  UPDATE` y `UPDATE … FROM` por la vista funcionan;
- un `INSERT` por la vista con `categoria = 'bache'` **falla** (CHECK OPTION); un bache con
  `profundidad_estimada` falla; una inundación sin ella falla; un `detalle` que no es objeto o supera
  el tope falla;
- `cupo_contador`: el *upsert* condicional (`… ON CONFLICT DO UPDATE … WHERE n < limite RETURNING`)
  no pasa el límite;
- desde cero (todas las migraciones) y aplicada dos veces: la segunda no aplica nada;
- **migración inversa**: con solo inundaciones, deja el catálogo de la 0019 (tablas, columnas, CHECK,
  índices y *grants* comparados).

### CA3 · Drizzle, privilegios y código de `packages/db`

- `src/esquema/index.ts`: suma `categoria`, `reporte` (con las columnas nuevas) y `cupoContador`.
  **`reporteInundacion` sigue apuntando a `'reporte_inundacion'`** (ahora la vista), para que api-core
  no cambie. `test/esquema-drizzle.test.ts` al día.
- Privilegios (`src/privilegios.ts`, `src/cli/verificar-privilegios.mjs`, `test/matriz-privilegios.test.ts`):
  `categoria` (lectura para api y geo), `reporte` y la vista (como la tabla de antes), `cupo_contador`
  (api). `pnpm --filter db privilegios` en verde en una base efímera.
- `src/mantenimiento.ts` (borrado de `ip_hash` y, nuevo, ventanas viejas de `cupo_contador`) y
  `src/geometria-publica.ts` pasan a `reporte` (aplican a todas las categorías).
- DBSCAN y seeds **no cambian** en M2 (el particionado por categoría es de M3).

### CA4 · Compatibilidad sin tocar a los consumidores

- `services/api-core` y `services/geo-service` **sin cambios** y con sus suites **iguales a la línea
  base** (sus pruebas migran PGlite hasta la última, así que corren contra la 0020 y la vista).
- Pruebas con PostgreSQL real de `datos` y `concurrencia` (`cuota-concurrencia-pg`,
  `fotos-cuota-concurrencia-pg`) en verde.
- Si algo de api-core no funciona por la vista, **se corrige en la migración**, no en api-core; si no
  se puede, la tarea para y vuelve al plan.

### CA5 · Medición (spike de ADR 0010)

En una base efímera de la pila Docker (`curichi_sdd_banco`, **nunca `curichi`**), migrada a la 0020,
con **1 M de reportes sintéticos repartidos en 4 categorías**:

- `EXPLAIN (ANALYZE, BUFFERS)` del listado público por `bbox` + categoría, de los agregados por UV y
  categoría, y del DBSCAN de una categoría;
- comparación de las tres opciones de índice de 13.2 §5.3 (GIST actual filtrando, GIST compuesto con
  `btree_gist`, GIST parcial por categoría) y del índice parcial del listado con `categoria`;
- resultado en `docs/sdd/<corrida>/medicion.md` con cifras medidas y una **recomendación** para la
  migración de M3. La base efímera se borra al terminar.

### CA6 · Respaldo (Parte 5)

`scripts/respaldo.mjs:256`: la comprobación `indices_reporte` mira `pg_indexes` con
`tablename = 'reporte_inundacion'`, que tras el renombre da 0 en las dos bases y deja de comprobar algo.
Pasa a `'reporte'`. Nada más en ese archivo.

### CA7 · Documentación

- `packages/db/README.md`: el modelo nuevo, la vista de compatibilidad (qué se puede y qué no hacer
  por ella) y la reversa.
- `CLAUDE.md` §7.1 y §7.2 (autorizado para M2 en el plan M0): tabla `reporte` (antes
  `reporte_inundacion`), columnas nuevas, la vista, `categoria` y `cupo_contador`. Lo hace el agente
  principal.
- `docs/arquitectura/13.3` y `14`: nota fechada si algo difiere del plan.

## Tareas y reparto (§12.4)

| Tarea | Agente | Nivel | Criterios | Depende de |
|---|---|---|---|---|
| M2.1 · Migración 0020, reversa y su prueba | `trabajador-raiz` (Opus 4.8, sin `model`). **Único escritor** en `packages/db` | Raíz | CA1, CA2 | Respuestas D3 y fotos; Docker encendido |
| M2.2 · Drizzle, privilegios, mantenimiento y geometría pública | el mismo `trabajador-raiz` (continuación) | Raíz | CA3, CA4 | M2.1 |
| M2.3 · Medición 1 M × 4 | `trabajador-raiz` | Raíz (decide índices) | CA5 | M2.2; en fila, con RAM libre ≥ 2,5 GB |
| M2.4 · `respaldo.mjs` | `general-purpose`, `model: 'sonnet'` | Estándar | CA6 | M2.1 |
| M2.5 · README de `db` | `general-purpose`, `model: 'sonnet'` | Estándar | CA7 (README) | M2.2 |
| M2.6 · CLAUDE.md §7 y notas | agente principal (documentación) | — | CA7 | M2.2 |
| Verificación | `sdd-verificador` (línea base antes de M2.1; verificación después), `sdd-revisor` contra este plan, `sdd-auditor` (privilegios, vista, cupo) | — | Regresión = bloqueante | M2.1–M2.5 |

Ningún subagente commitea.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Alguna sentencia de api-core no funciona por una vista (`ON CONFLICT`, `FOR UPDATE` con *joins*, `TRUNCATE` en pruebas) | CA2 prueba cada forma; las suites de api-core lo confirman; si falla, se corrige en la migración o se vuelve al plan |
| La vista fija su lista de columnas | Comentario en la migración y en el README; M3 la recrea si agrega columnas |
| Defaults por la vista | CA2 prueba `id`, `categoria` y `detalle` en un `INSERT` por la vista |
| `security_invoker` y PGlite | CA2 corre en PGlite y en PostgreSQL real |
| La base del usuario (`curichi`, en la 0009) | No se migra ni se toca. Las pruebas usan PGlite y bases efímeras `curichi_sdd_*` |
| El relleno con muchas filas | En una sola sentencia hoy (volumen local chico); la medición M2.3 mide su duración con 1 M |

## Preguntas para el usuario (antes de empezar)

1. ¿Apruebas este plan?
2. **D3:** ¿se documenta como «v2 extendida» (sin tocar datos; recomendado) o se sube inundación a
   severidad **v3** con un `UPDATE` en la 0020?
3. **Cupo de fotos:** ¿**12 por cuenta y por día, global** (como hoy; recomendado) o 12 por categoría?
4. ¿Puedo dejar Docker encendido para las pruebas con PostgreSQL real y la medición (bases efímeras
   `curichi_sdd_*`, nunca `curichi`)?
