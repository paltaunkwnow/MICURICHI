# geodata-etl — Parte 5 (frente GIS)

Shapefile → GeoJSON (EPSG:4326) → PostGIS, con validación topológica, normalización, simplificación y reporte de calidad. Implementado en TypeScript con **mapshaper** y **turf** (ADR 0002: la máquina no tiene GDAL ni Python 3.12).

## Flujo

```bash
# 1) Copiá la carpeta del municipio tal cual a data/raw/DM_UV_MZ_2025/ (con MANIFEST.md)
pnpm etl:inspect -- --version DM_UV_MZ_2025     # archivos, CRS del .prj, campos, nulos, bbox, campos sugeridos
#    → completá config/capas.yaml (archivo y campos por capa) si la autodetección no acierta
pnpm etl:run     -- --version DM_UV_MZ_2025     # reproyecta, valida, repara (reportado), normaliza, simplifica
pnpm etl:load    -- --version DM_UV_MZ_2025     # carga a PostGIS, todas las capas en una transacción
pnpm etl:all                                    # run + load de todas las versiones cuya carpeta exista
```

Sin `.prj` y sin `crs_origen` en la config, el ETL **se detiene** y pide el CRS. No se adivina.

`etl:load` **no activa versiones** (CLAUDE.md §6.9): eso lo hace un administrador desde el panel (**Capas → Activar**), que queda en auditoría. Solo si una capa no tiene ninguna versión vigente (base nueva) la carga la activa, y lo registra en `auditoria` sin actor, con `activado_en` y el motivo «arranque del ETL». Recargar la versión vigente no cambia su activación. `--activar` ya no existe.

## Salidas por capa: `data/processed/<version>/<capa>/`

`<capa>.full.geojson` (7 decimales), `<capa>.web.geojson` (simplificado con bordes compartidos preservados), `reporte_calidad.md` + `.json`, `metadata.json` (CRS origen, hashes de entrada y salida, tolerancias, fecha).

- Cada hallazgo nombra la feature por el código configurado en `config/capas.yaml` (o su `respaldo`, p. ej. `OBJECTID`) con la forma del id final, `<capa>:<codigo>`; la posición (`#12`) solo si no tiene ninguno.
- Si la reparación corre sobre una capa sin clave única por feature, el control `tolerancia_cambio_area_feature` no se puede aplicar: se avisa con `!! AVISO` en consola y en la sección **Avisos**, al principio de `reporte_calidad.md` (y en `avisos` del `.json`).
- Los códigos repetidos se desambiguan con `-2`, `-3`… y los vacíos sin respaldo con `sin_codigo_1`, `_2`…, en un orden que sale de la geometría de cada feature y no del orden del archivo; ningún sufijo pisa un código que ya existe en la capa.

## Muestra sintética

```bash
pnpm --filter geodata-etl samples:generar   # data/samples/geo/*.geojson + data/samples/shp/DM_UV_MZ_SAMPLE/ (EPSG:32720)
pnpm etl:all -- --version DM_UV_MZ_SAMPLE
```

## Tests

`pnpm etl:test`: shapefiles generados al vuelo en UTM 20S → detección de capa, lectura del `.prj`, parada sin `.prj`, solapes, huecos, geometrías inválidas y duplicadas, normalización, ids estables ante un reordenamiento, avisos e ids del reporte de calidad, y pipeline completo. La carga se prueba contra un PostGIS efímero en memoria (PGlite, puerto libre): una falla en la tercera capa no deja nada de la versión, y la activación solo ocurre en el arranque y queda auditada. Las pruebas escriben en carpetas temporales, nunca en `data/`.
