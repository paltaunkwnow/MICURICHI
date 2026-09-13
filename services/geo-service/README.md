# geo-service — Parte 4 (servicio geoespacial)

Fastify + PostGIS. Responde "¿en qué distrito, UV y manzana cae este punto?" y sirve las capas al mapa.

| Ruta | Qué hace |
|---|---|
| `POST /geo/v1/resolver` `{lat, lon}` | Point-in-polygon con reglas §7.4: interior, borde (determinista + `en_limite`), hueco (UV más cercana a ≤ 20 m + `asignado_por_proximidad`), fuera de cobertura |
| `GET /geo/v1/capas/vigentes` | Versión vigente por capa |
| `GET /geo/v1/capas` | Info por capa: modo `geojson` o `teselas`, bytes, bbox |
| `GET /geo/v1/capas/:capa` | GeoJSON web de la capa vigente (413 si supera 5 MB) con ETag |
| `GET /geo/v1/teselas/:capa/:z/:x/:y.mvt` | Teselas vectoriales al vuelo (geojson-vt + vt-pbf) |
| `GET /geo/v1/agregados/unidades-vecinales` | Reportes validados por UV |
| `GET /geo/v1/puntos-criticos?bbox=` | Puntos críticos (§9.2) |
| `POST /geo/v1/capas/invalidar` | Vacía la caché tras activar una versión |
| `GET /health`, `GET /ready` | |

```bash
pnpm --filter geo-service dev     # http://127.0.0.1:3002
pnpm --filter geo-service test    # PostGIS efímero: interior, borde, hueco, fuera, teselas, agregados
```

Índice GIST: la consulta `ST_Intersects(geom, punto)` sobre `geo.unidad_vecinal_vigente` usa el índice `unidad_vecinal_geom_gist` (el planificador lo elige cuando la tabla tiene tamaño real; con 3 filas de test hace Seq Scan). Verificable con `EXPLAIN`.
