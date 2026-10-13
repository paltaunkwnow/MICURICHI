# Medición M2.3 — spike de índices multicategoría (CA5, ADR 0010)

> **Estado: COMPLETA.** La medición decisiva (combinación GIST + btree parcial, §4.1) se corrió y
> **confirma** la recomendación. La base efímera `curichi_sdd_m2_banco` se **borró** al terminar
> (`dropdb`, 2026-10-08); no queda ninguna `curichi_sdd_*`.
>
> Cada número de este documento es **[MEDIDO]** salvo donde diga lo contrario. Las conclusiones son
> **[RECOMENDACIÓN]**. Corrida en dos tramos el 2026-10-08 (la combinación, al reencender Docker).

## 1. Condiciones [MEDIDO]

| Dato | Valor |
|---|---|
| Máquina | Windows 11 Home (este portátil); RAM libre observada durante la corrida: 5 950 – 7 457 MB (umbral de corte 1 500 MB, nunca alcanzado) |
| Motor | PostgreSQL 18.6 (Debian), PostGIS 3.6.4, imagen `postgis/postgis:18-3.6` (la de producción) |
| Base | efímera `curichi_sdd_m2_banco`, creada con `createdb`, migrada con el migrador del repo **hasta la 0020** (20/20 migraciones, 989 ms). Nunca se tocó `curichi` ni `curichi_revision` |
| Capas | **REALES** `DM_UV_MZ_2025` cargadas con el ETL: 16 distritos, 576 UV, ambas vigentes. **`manzana` NO se cargó**: ninguna de las consultas medidas la usa (el listado filtra por `geom_publico`, los agregados y el PIP de puntos críticos usan distrito y UV); se declara la omisión |
| Reportes | **1 000 000**, 250 000 por categoría (`inundacion`, `bache`, `area_verde`, `basura`), insertados directamente en la tabla `reporte` (banco; no pasa por api-core) |
| `btree_gist` | **disponible** en la imagen (versión 1.8); se instaló para medir la opción (b) |
| Repeticiones | 9 por consulta (3 para el DBSCAN), caché caliente; se reporta **mediana** y **peor** (con 9 reps, el «peor» es ≈ p95) |

### 1.1 Distribución de los datos sintéticos [MEDIDO]

- Puntos generados **dentro** de las UV vigentes con `ST_GeneratePoints` (repartidos por UV como
  `scripts/banco-datos.mjs`), para que la selectividad de los GIST se parezca a la real.
- Tiempo **decorrelacionado** del espacio (salto coprimo 7919 sobre 525 600 min = 1 año): espacio y
  tiempo independientes. *Caveat:* con datos tiempo/espacio correlacionados (un barrio entero
  reportando en una tormenta) el recorrido por `creado_en` podría comportarse distinto; ver §6.
- `estado` derivado de un **hash** independiente de la categoría (si se derivaba de `i % algo` con
  factor común con 4, `estado` y `categoría` quedaban correlacionados; se corrigió y recargó). Por
  categoría: ~90 % publicables (`nuevo`/`validado`/`resuelto`), ~65 % verificados
  (`validado`/`resuelto`), ~2 % sin `geom_publico` (camino *fail-closed*).

Conteos por categoría (idénticos entre categorías, como se buscaba):

| categoría | total | publicables | verificados | sin `geom_publico` |
|---|---|---|---|---|
| inundacion | 250 000 | 225 037 | 162 740 | 5 006 |
| bache | 250 000 | 224 844 | 161 853 | 5 033 |
| area_verde | 250 000 | 225 150 | 162 592 | 4 972 |
| basura | 250 000 | 225 026 | 162 369 | 5 114 |

## 2. Tiempos de carga y tamaños [MEDIDO]

| Dato | Valor |
|---|---|
| Inserción de 1 M (20 lotes de 50 000, una conexión, con el disparador `BEFORE INSERT` de la 0020 activo) | **78 s** |
| `ANALYZE reporte` | ~2 s |
| Tamaño total de `reporte` | **691 MB** (heap 391 MB + índices 300 MB) |
| Tamaño de la base | 708 MB |

La inserción escribe cada fila una vez y, en inundación, dispara `detalle_inundacion(...)` por fila
(el disparador de sincronización). 78 s para 1 M es cómodo para una carga única; el relleno de la
0020 sobre un volumen local real (muy inferior a 1 M) no es un riesgo.

## 3. Consultas reales con los índices actuales [MEDIDO]

Consulta = el `WHERE`/`ORDER BY`/`LIMIT` real de api-core (`consultas.ts` + `visibilidad.ts`) y de
geo-service (`SQL_AGREGADOS_UV`), y el DBSCAN de `puntos-criticos.ts`. `categoría` se suma como
`r.categoria = 'inundacion'`. bbox: **chico** ±0,001° (~220 m), **barrio** ±0,01° (~2,2 km),
**ciudad** = extensión completa de las UV (~48 × 32 km). Filas públicas de inundación por bbox:
chico 8, barrio 3 011, ciudad 220 545.

| Consulta | mediana ms | peor ms | filas | bloques | índice usado | plan (nodos) |
|---|---|---|---|---|---|---|
| bbox **chico** + categoría | **0,15** | 0,18 | 8 | 48 | `reporte_geom_publico_gist` | Limit · Sort · Index Scan |
| bbox **barrio** + categoría | **18,83** | 27,79 | 50 | **16 978** | **`reporte_creado`** | Limit · Incremental Sort · Index Scan |
| bbox **ciudad** + categoría | **0,40** | 0,47 | 50 | 227 | `reporte_creado` | Limit · Incremental Sort · Index Scan |
| bbox chico **por la vista hoy** | 0,13 | 0,20 | 8 | 48 | `reporte_geom_publico_gist` | Limit · Sort · Index Scan |
| bbox barrio **por la vista hoy** | 24,60 | 31,11 | 50 | 16 978 | `reporte_creado` | Limit · Incremental Sort · Index Scan |
| bbox ciudad **por la vista hoy** | 0,34 | 0,51 | 50 | 227 | `reporte_creado` | Limit · Incremental Sort · Index Scan |
| bbox barrio **completo (con JOINs)** | 27,43 | 30,51 | 50 | 17 333 | `reporte_creado` + pkeys + `reporte_foto_reporte` | Nested Loop (planning 2,44 ms) |
| **primera página** (sin bbox) + categoría | 0,42 | 0,71 | 50 | 226 | `reporte_creado` | Limit · Incremental Sort · Index Scan |
| **agregados por UV** + categoría | **354,70** | 392,06 | 576 | 19 907 | `reporte_agregado_uv` (Index Only Scan) + pkeys | Nested Loop · Aggregate |
| **DBSCAN** de una categoría (verificados ≈162 740) | **1 037,28** | 1 051,18 | 162 740 | 49 953 | — (Seq Scan `reporte`) | WindowAgg · Seq Scan |

### 3.1 Hallazgo central: el bbox de **barrio** [MEDIDO + RECOMENDACIÓN]

El listado público ordena por `creado_en DESC LIMIT 50`. Con un bbox:

- **chico** (8 coincidencias en toda la ciudad): el planificador usa el **GIST** (`reporte_geom_publico_gist`),
  trae las 8 y ordena → 0,15 ms, 48 bloques.
- **ciudad** (220 545 coincidencias): recorrer `creado_en DESC` encuentra 50 coincidencias casi al
  instante → 0,40 ms, 227 bloques.
- **barrio** (~3 011 coincidencias): es el punto intermedio patológico. El planificador **abandona el
  GIST** y recorre `reporte_creado` (btree por fecha) descendente filtrando bbox+categoría hasta
  juntar 50; como las coincidencias están repartidas en el tiempo, lee **16 978 bloques** → 18,83 ms
  (27,79 peor). La vista de hoy da lo mismo (24,60 ms) y con los JOINs del panel, 27,43 ms.

Es el caso del **mapa de barrio**, que es justo la vista habitual. Ninguna variante de GIST lo
cambia (ver §4); el único índice que lo arregla es el **btree parcial `(categoria, creado_en DESC)`**.

## 4. Comparación de opciones de índice para «bbox + categoría» [MEDIDO]

Cada candidato (b, c, d) se midió **aislado**: dentro de una transacción revertida (`ROLLBACK`) se
borró el GIST competidor `reporte_geom_publico_gist` y se creó solo el candidato, para ver su costo
sin que el planificador se escapara al GIST actual. **(a)** es la línea base con los índices de hoy.

| Opción | crear | tamaño | chico: mediana (bloques, índice) | barrio: mediana (bloques, índice) | ciudad: mediana (bloques, índice) |
|---|---|---|---|---|---|
| **(a)** GIST actual + categoría como filtro | — | 50 MB | 0,15 (48, `reporte_geom_publico_gist`) | 18,83 (16 978, **`reporte_creado`**) | 0,40 (227, `reporte_creado`) |
| **(b)** GIST compuesto `(categoria, geom_publico)` + `btree_gist`, INCLUDE `publicar_en` | **6 870 ms** | **66 MB** | 0,20 (15, `cand`) | 19,92 (16 978, **`reporte_creado`**) | 0,32 (227, `reporte_creado`) |
| **(c)** GIST parcial por categoría (`geom_publico` WHERE públicos AND `categoria='inundacion'`) | 970 ms | **11 MB** (×4 cat ≈ 44 MB) | 0,12 (15, `cand`) | 23,09 (16 978, **`reporte_creado`**) | 0,35 (227, `reporte_creado`) |
| **(d)** btree parcial `(categoria, creado_en DESC)` WHERE públicos | 1 099 ms | 31 MB | **167,85** (51 139, bitmap `cand`) | **6,33** (3 818, `cand`) | 0,26 (56, `cand`) |

Además, con **(d)** la **primera página sin bbox + categoría** baja a 0,16 ms (54 bloques) frente a
0,42 ms de la línea base.

Lecturas de la tabla [RECOMENDACIÓN]:

- **(b) y (c) no arreglan el barrio.** Aun con el GIST competidor fuera, el planificador sigue
  prefiriendo `reporte_creado` para el bbox de barrio (16 978 bloques). Solo mejoran marginalmente el
  bbox chico (15 vs 48 bloques). (b) es el más caro de construir (6,9 s) y el más grande (66 MB); (c)
  es chico (11 MB) pero habría que crear **uno por categoría** y tampoco sirve para el caso que duele.
- **(d) arregla el barrio** (6,33 vs 18,83 ms; 3 818 vs 16 978 bloques) y vuelve trivial la primera
  página por categoría. **Su número del bbox chico (167,85 ms) es un artefacto de la medición
  aislada**: se tomó con el GIST borrado, así que la única opción era recorrer toda la categoría por
  bitmap. Con el GIST presente, el planificador elige el GIST para el bbox chico y el btree para el
  barrio — confirmado en §4.1.

### 4.1 Combinación GIST + btree parcial, ambos presentes [MEDIDO] — decisiva

Prueba de la recomendación: `reporte_geom_publico_gist` (actual) **más** el btree parcial `combo_btree
= (categoria, creado_en DESC) WHERE estado IN (públicos)` (opción (d)), los dos a la vez, dejando que
el planificador elija. 9 repeticiones, caché caliente.

| Consulta | mediana ms | peor ms | filas | bloques | **índice que elige el planificador** |
|---|---|---|---|---|---|
| bbox **chico** + categoría | 0,12 | 0,18 | 8 | 48 | **`reporte_geom_publico_gist`** (el GIST) |
| bbox **barrio** + categoría | **2,92** | 4,11 | 50 | **3 818** | **`combo_btree`** (el btree parcial) |
| bbox **ciudad** + categoría | 0,12 | 0,23 | 50 | 56 | `combo_btree` |
| **primera página** (sin bbox) + categoría | 0,09 | 0,14 | 50 | 54 | `combo_btree` |

**El planificador reparte bien**: usa el GIST en el bbox selectivo (chico) y el btree parcial en el de
barrio, ciudad y la primera página. El barrio pasa de **18,83 ms / 16 978 bloques** (línea base, §3) a
**2,92 ms / 3 818 bloques** (≈6,5× más rápido, ¼ de los bloques), sin tocar el bbox chico (sigue en
0,12 ms por el GIST). Es exactamente el resultado que hacía falta para recomendar (d) **junto** al
GIST.

## 5. Planes resumidos [MEDIDO, desde el árbol del plan en JSON]

- **bbox chico (línea base):** `Limit → Sort → Index Scan` sobre `reporte_geom_publico_gist`. El GIST
  acota a ~8 filas y se ordenan en memoria. 48 bloques.
- **bbox barrio (línea base):** `Limit → Incremental Sort → Index Scan` sobre **`reporte_creado`** (NO
  el GIST). Recorre por fecha descendente filtrando bbox+categoría en el heap; 16 978 bloques leídos.
- **bbox ciudad (línea base):** igual que barrio pero encuentra las 50 enseguida; 227 bloques.
- **agregados por UV:** `Nested Loop` de las 576 UV contra un **Index Only Scan** de
  `reporte_agregado_uv` (el índice parcial que la 0020 recreó con `categoria` en el INCLUDE), con
  `Aggregate`. 19 907 bloques, 354 ms: es O(nº de reportes publicables de la categoría).
- **DBSCAN:** `WindowAgg` sobre un **Seq Scan** de `reporte` filtrando `estado IN (validado,resuelto)
  AND categoria=...`; 49 953 bloques, ~1,04 s. Ningún índice acelera el clustering en sí.

Textos `EXPLAIN (ANALYZE, BUFFERS)` del caso de barrio (una sola corrida cada uno; la de línea base
quedó con caché fría — 309 ms, 11 178 bloques de disco — pero el **recuento de bloques coincide** con
la mediana caliente de §3: 5 800 + 11 178 = 16 978; la combinación son 3 818, todos de caché):

```
-- LÍNEA BASE, bbox barrio (elige reporte_creado, btree por fecha)
Limit (actual time=242.204..309.817 rows=50)
  Buffers: shared hit=5800 read=11178
  -> Incremental Sort (Sort Key: creado_en DESC, id DESC; Presorted Key: creado_en)
       -> Index Scan using reporte_creado on reporte r  (rows=51)
            Filter: geom_publico && <envelope> AND categoria='inundacion' AND estado=ANY(...) AND publicar_en<=now()
            Rows Removed by Filter: 16844
            Buffers: shared hit=5800 read=11178

-- COMBINACIÓN, bbox barrio (elige combo_btree = (categoria, creado_en DESC) WHERE públicos)
Limit (actual time=2.022..2.958 rows=50)
  Buffers: shared hit=3818
  -> Incremental Sort (Sort Key: creado_en DESC, id DESC; Presorted Key: creado_en)
       -> Index Scan using combo_btree on reporte r  (rows=51)
            Index Cond: categoria='inundacion'
            Filter: geom_publico && <envelope> AND publicar_en<=now()
            Rows Removed by Filter: 3745
            Buffers: shared hit=3818
```

El `Index Cond: categoria='inundacion'` del btree parcial es la diferencia: restringe el recorrido por
fecha a **una** categoría, así que descarta 3 745 filas en vez de 16 844 para juntar las 50.

## 6. Recomendación para la migración de M3 [RECOMENDACIÓN — confirmada por la medición]

1. **Conservar `reporte_geom_publico_gist`** (0005/0015). Es imprescindible para los bbox selectivos
   (chico: 0,15 ms). Con 4 categorías, el filtro `categoria` en el heap a esa selectividad es gratis.
   [MEDIDO: chico 0,15 ms / 48 bloques.]
2. **La 0020 ya hizo lo necesario para los agregados**: recreó `reporte_agregado_uv` con `categoria`
   en el INCLUDE, y el agregado por UV mantiene el **Index Only Scan**. No hace falta índice nuevo ahí.
   [MEDIDO: Index Only Scan, 354 ms a 1 M.]
3. **NO crear el GIST compuesto (b)** ni el **GIST parcial por categoría (c)** para el listado: ninguno
   arregla el caso que duele (barrio) y (b) es caro y grande. [MEDIDO.]
4. **Crear en M3 el btree parcial `(categoria, creado_en DESC) WHERE estado IN (públicos)`** (opción
   (d), que es el primer bullet de 13.2 §5.3), **junto** al GIST, no en su lugar. Es el único que baja
   el bbox de barrio y la primera página por categoría, por 31 MB y ~1,1 s de construcción. La
   combinación (§4.1) **confirma** que con los dos presentes el planificador usa el GIST en los bbox
   selectivos (chico 0,12 ms) y el btree en los de barrio (2,92 ms vs 18,83) y ciudad. [MEDIDO, aislado
   y en combinación.]
5. **Agregados (354 ms) y DBSCAN (1,04 s)**: no son decisiones de índice de M2/M3 para el listado. El
   DBSCAN por categoría de M3 (`PARTITION BY categoria`) ya restringe a una categoría; ningún índice
   acelera el clustering. Quedan **para vigilar** cuando el volumen real de una categoría crezca; el
   umbral de vista materializada ya está anotado en `0007_*.sql` y `docs/operaciones/produccion.md`.
6. **Caveat de datos:** el costo del bbox de barrio depende en parte de la decorrelación
   tiempo/espacio del banco. El btree `(categoria, creado_en)` es robusto en ambos escenarios; conviene
   repetir la medición con datos correlacionados (`--correlacionado` del banco) antes de fijar M3.

## 7. Qué NO se midió y por qué

- **Medición con datos tiempo/espacio correlacionados** (cota superior realista: un barrio entero
  reportando en una tormenta) — no se hizo. No cambia la recomendación: el btree `(categoria,
  creado_en)` es robusto en los dos escenarios (restringe el recorrido por fecha a una categoría pase
  lo que pase con la distribución temporal). Queda como verificación opcional antes de fijar la
  migración de M3 (`scripts/banco-datos.mjs … --correlacionado` como referencia del patrón).

## 8. Artefactos de la corrida (scratchpad, fuera del repo)

`…/scratchpad/m2-banco/`: `generar.mjs` (generador 1 M × 4), `medir.mjs` (arnés principal),
`resultado.json` (cifras de §1–§4), `medir-combo.mjs` + `resultado-combo.json` (combinación, §4.1).
La base efímera `curichi_sdd_m2_banco` se borró con `dropdb` al terminar (§9).

## 9. Limpieza hecha y verificación opcional pendiente

**Hecho:** `dropdb` de `curichi_sdd_m2_banco` el 2026-10-08; se comprobó que no queda ninguna
`curichi_sdd_*` (nunca se tocó `curichi` ni `curichi_revision`).

**Opcional (no bloquea M3):** repetir la combinación con datos tiempo/espacio correlacionados para
confirmar la cota superior. Si hiciera falta rehacer el banco: createdb → migrar hasta 0020 → ETL de
distrito y UV → `generar.mjs 1000000 50000` → `medir-combo.mjs`, con `DATABASE_URL` derivado del `.env`
hacia una base efímera `curichi_sdd_*` (nunca `curichi`), y `dropdb` al terminar.
