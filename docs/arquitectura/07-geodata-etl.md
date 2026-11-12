# 07 · `pipelines/geodata-etl` — capas oficiales: shapefile → GeoJSON → PostGIS

> Parte **5** (frente GIS). TypeScript + mapshaper 0.7.61 + @turf/turf 7.4 (ADR 0002: sin GDAL,
> Python ni tippecanoe). Leyenda: **[C]** confirmado en código · **[I]** inferido · **[Doc]** según
> documentación.

## 1. Para qué existe

Hace que las **capas administrativas del municipio** (distritos, unidades vecinales y manzanas)
entren a la base **limpias, versionadas y reproducibles**, con un reporte de calidad que dice qué se
reparó. El PIP del sistema depende de ellas.

## 2. Estructura

| Archivo | Responsabilidad |
|---|---|
| `config/capas.yaml` | Versiones, carpeta, fuente, CRS, encoding, archivo → capa, mapeo de campos, plantillas de nombre, tolerancias de simplificación y de reparación |
| `src/cli.ts` | `inspect`, `run`, `load` y `all` (`--version`, `--capa`, `--forzar`) |
| `src/config.ts`, `src/argumentos.ts` | Lectura y validación del YAML y de los argumentos |
| `src/shapefile.ts` | Descubre el conjunto `.shp/.shx/.dbf/.prj/.cpg` y lee el encoding |
| `src/mapshaper.ts` | Envoltorio de `mapshaper.applyCommands` en memoria: reproyectar, `-clean`, simplificar, escribir shapefiles (muestras) |
| `src/pipeline.ts` | `inspeccionar` y `procesarVersion` (el corazón, §3) |
| `src/pasos/calidad.ts` | Validación (inválidas, vacías, duplicadas, solapes con rbush, huecos), asignación de padre y estadísticas |
| `src/pasos/normalizar.ts` | Ids estables `<tipo>:<codigo>`, desambiguación de códigos repetidos, `snake_case`, campos mínimos, redondeo |
| `src/pasos/cargar.ts` | Carga a PostGIS en **una transacción por versión** |
| `src/samples/generar.ts` | Genera la muestra **sintética** (`data/samples/shp/DM_UV_MZ_SAMPLE`) |
| `test/` | `etl.test.ts`, `calidad-e-ids.test.ts`, `carga.test.ts` |

## 3. `pnpm etl:run -- --version <v>` paso a paso [C]

Para cada capa, en orden (distritos → UV → manzanas, porque cada una usa la anterior como «padre»):

1. **Sin `.prj` y sin `crs_origen` declarado → se DETIENE**. No adivina el CRS (regla de oro 4).
2. **Inspección**: CRS, cantidad, tipos, atributos y nulos, encoding, bbox.
3. **Reproyección**: `mapshaper -proj wgs84` (precisión 1e-7, RFC 7946).
4. **Clave estable** por feature con los campos configurados. Si no es única, la verificación por
   feature se apaga y queda un **aviso** explícito.
5. **Validación antes de reparar**: inválidas, vacías, duplicadas y solapes (en UV y distritos).
6. **Exclusión** de vacías y duplicadas, **por posición**: miles de manzanas tienen `OBJECTID = 0`.
7. **Reparación** con `-clean`:
   - teselada para distritos y UV;
   - `allow-overlaps no-snap` para manzanas, porque entre ellas hay calles;
   - se verifica el **cambio de área**: total ≤ 0,1 % y por feature ≤ 1 %;
   - si se pasa de esos límites, **aborta** salvo `--forzar`.
8. **Jerarquía**:
   - la UV toma el distrito y la manzana toma la UV;
   - se resuelve lo declarado frente a la contención espacial;
   - si no hay padre declarado, se infiere por el punto representativo (`distrito_inferido`).
9. **Normalización**:
   - campos `id`, `codigo`, `nombre` (con plantilla si la capa no trae nombre), `tipo`, `distrito_id`,
     `unidad_vecinal_id`, `version_capa`, `fuente` y `fecha_vigencia`;
   - coordenadas a 7 decimales.
10. **Huecos** entre UV dentro de su distrito: se **informan**, no se rellenan.
11. **Salidas** en `data/processed/<version>/<capa>/`:
    - `<capa>.full.geojson`: sin simplificar, va a PostGIS;
    - `<capa>.web.geojson`: Visvalingam (5/4/2 m) + `keep-shapes` + `-clean`, 6 decimales, solo
      campos de dibujo, lo sirve geo-service;
    - `reporte_calidad.md` y `.json`: hallazgos por id;
    - `metadata.json`: CRS de origen y WKT, conteos, sha256 de entrada, del MANIFEST y de salida, fecha.

## 4. `pnpm etl:load -- --version <v>` [C]

- Comprueba que existan los `.full.geojson` **antes** de abrir la transacción.
- **Una transacción para toda la versión**: o entran las tres capas o ninguna.
- `DELETE` de la versión y `INSERT` por lotes de 200 con `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON))`.
- `ST_IsValid`: lo inválido se repara con `ST_MakeValid` y se informa. Si algo sigue inválido, aborta.
- Comprueba el conteo contra el archivo.
- `geo.capa_version`: `INSERT … ON CONFLICT DO UPDATE`, así se conserva el id y la activación.
- **No activa** versiones. Única excepción: si la capa **no tiene ninguna vigente** (base nueva), la
  activa y deja auditoría sin actor («arranque del ETL»).
- Usa el **rol dueño** (`DATABASE_URL`). Los scripts de pnpm **no leen `.env`**: hay que exportarla.

Hoy contra `curichi_revision` [C]: 16 + 576 + 27 527 features, con 2, 1 y 17 geometrías reparadas en
PostGIS, activadas en el arranque.

## 5. Los datos reales `DM_UV_MZ_2025` [C, `config/capas.yaml`]

| Capa | Archivo | Entrada | Salida | Código / nombre |
|---|---|---|---|---|
| Distritos | `DM.shp` | 16 | 16 | `DIS` / «Distrito {codigo}» (la capa no trae nombre) |
| UV | `UV.shp` | 582 (3 geometrías nulas, nulos en DM/UV) | 576 | `UV` / «Unidad Vecinal {codigo}»; padre `DM` |
| Manzanas | `MZ.shp` | 27 817 (58 geometrías nulas) | 27 527 (web: 27 434) | `OBJECTID` (**no es único**: el ETL desambigua con `-2`, `-3`… según la geometría) |

- CRS: EPSG:32720 (WGS 84 / UTM 20S), declarado en los `.prj`; UTF-8.
- Fuente, vigencia y licencia: `<a confirmar>`.
- La entrega real **no se versiona**. Está en `data/raw/DM_UV_MZ_2025/` (también como `.zip`) en esta
  máquina.

## 6. Cómo cargar otra ciudad o una nueva entrega (checklist)

1. Copiar los shapefiles a `data/raw/<VERSION>/` **sin tocarlos** y escribir `MANIFEST.md`: fuente,
   quién entregó, fechas, CRS declarado y `sha256` de cada archivo.
2. `pnpm etl:inspect -- --version <VERSION>` para ver campos, nulos, CRS y bbox.
3. Agregar la versión a `config/capas.yaml`: archivos, `campos.codigo`, `nombre` o
   `plantilla_nombre`, `distrito`, `unidad_vecinal` y `respaldo`.
4. `pnpm etl:run -- --version <VERSION>` y leer cada `reporte_calidad.md`. `--forzar` solo con una
   decisión explícita.
5. `export DATABASE_URL=<rol dueño>` y `pnpm etl:load -- --version <VERSION>`.
6. Activar desde el panel (Capas → Activar, solo admin), o se activa sola si es la primera.
7. Para otra ciudad, además: `CIUDAD_*`, `ZONA_HORARIA` y **`CRS_METRICO_EPSG`** (su zona UTM) en
   api-core y db.

## 7. Pruebas [C]

21 pruebas Vitest sobre la muestra sintética:

- reproyección y parada sin `.prj`;
- reparación verificada por área;
- normalización e ids estables;
- solapes y huecos;
- carga atómica y activación solo en el primer arranque.

## 8. Observaciones

| # | Observación |
|---|---|
| E-1 | Las salidas de `data/processed/DM_UV_MZ_2025` son del **2026-09-17**. El paso de carga cambió el 2026-09-26, pero el de procesado no hacía falta volver a correrlo para levantar [C/I] |
| E-2 | La simplificación web descarta 93 manzanas (27 527 → 27 434), probablemente por el `-clean` posterior a `keep-shapes` [I] |
| E-3 | El código de manzana es un subrogado del ETL; el municipio debería entregar uno único (CLAUDE.md §16.1) |
| E-4 | `etl:all` corre `run` + `load` de **todas** las versiones con carpeta en disco (incluida la muestra sintética si existe) |
