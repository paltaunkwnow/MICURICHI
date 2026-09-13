# data

| Carpeta | Contenido | En git | Quién escribe |
|---|---|---|---|
| `raw/` | Shapefiles oficiales tal como se recibieron. **INMUTABLE.** | Solo `README.md` y `MANIFEST.md` | Nadie (se copian una vez) |
| `processed/` | GeoJSON, PMTiles, reportes de calidad y metadatos generados por el ETL. | No | ETL (Parte 5) |
| `samples/` | Muestras **sintéticas** pequeñas (< 1 MB c/u) para seeds y tests. | Sí | Parte 5 |

Reglas completas en `CLAUDE.md` §6.10. Todo `processed/` se regenera con `pnpm etl:all`.
