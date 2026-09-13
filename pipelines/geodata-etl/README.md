# geodata-etl — Parte 5 (frente GIS)

Shapefile → GeoJSON (EPSG:4326) → PostGIS, con validación topológica, normalización, simplificación y reporte de calidad. Implementado en TypeScript con **mapshaper** y **turf** (ADR 0002: la máquina no tiene GDAL ni Python 3.12).

## Flujo

```bash
# 1) Copiá la carpeta del municipio tal cual a data/raw/DM_UV_MZ_2025/ (con MANIFEST.md)
pnpm etl:inspect -- --version DM_UV_MZ_2025     # archivos, CRS del .prj, campos, nulos, bbox, campos sugeridos
#    → completá config/capas.yaml (archivo y campos por capa) si la autodetección no acierta
pnpm etl:run     -- --version DM_UV_MZ_2025     # reproyecta, valida, repara (reportado), normaliza, simplifica
pnpm etl:load    -- --version DM_UV_MZ_2025     # carga a PostGIS (vigente solo si no hay otra versión vigente; --activar para forzar)
pnpm etl:all                                    # run + load de todas las versiones cuya carpeta exista
```

Sin `.prj` y sin `crs_origen` en la config, el ETL **se detiene** y pide el CRS. No se adivina.

## Salidas por capa: `data/processed/<version>/<capa>/`

`<capa>.full.geojson` (7 decimales), `<capa>.web.geojson` (simplificado con bordes compartidos preservados), `reporte_calidad.md` + `.json`, `metadata.json` (CRS origen, hashes de entrada y salida, tolerancias, fecha).

## Muestra sintética

```bash
pnpm --filter geodata-etl samples:generar   # data/samples/geo/*.geojson + data/samples/shp/DM_UV_MZ_SAMPLE/ (EPSG:32720)
pnpm etl:all -- --version DM_UV_MZ_SAMPLE
```

## Tests

`pnpm --filter geodata-etl test`: shapefiles generados al vuelo en UTM 20S → detección de capa, lectura del `.prj`, parada sin `.prj`, solapes, huecos, geometrías inválidas y duplicadas, normalización y pipeline completo.
