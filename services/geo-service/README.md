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

## Cabecera interna y cupo del resolver

`POST /geo/v1/resolver` lo llama api-core una vez por cada `POST /reportes`, siempre desde el mismo origen. Para que ese tráfico no comparta cupo con la previsualización pública (el navegador del vecino, antes de enviar), las peticiones que traen la cabecera **`x-token-interno`** con el mismo valor que `GEO_TOKEN_INTERNO` (comparada en tiempo constante) quedan fuera del cupo de `GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO`. Sin `GEO_TOKEN_INTERNO` configurado (solo pasa en el modo local sin Docker), el criterio cae a "viene de loopback", igual que en `/geo/v1/capas/invalidar`. Sin ese token, o con uno incorrecto, la petición sigue limitada por IP como cualquier tráfico público.

## Variables de entorno propias

| Variable | Por defecto | Qué hace |
|---|---|---|
| `GEO_TOKEN_INTERNO` | (vacío → solo loopback) | Cabecera `x-token-interno` para `/geo/v1/capas/invalidar` y para la exención de cupo de `/geo/v1/resolver`. Obligatoria en producción. |
| `GEO_DATABASE_URL` | usa `DATABASE_URL`, y si tampoco está, `postgresql://curichi:curichi@127.0.0.1:5433/curichi` | Cadena de conexión propia de este servicio, con el rol `curichi_geo` (solo lectura) en vez del rol dueño (`curichi`) que trae `DATABASE_URL`. `pnpm dev` carga el `.env` de la raíz si existe (`tsx watch --env-file-if-exists=../../.env`). |
| `GEO_DB_STATEMENT_TIMEOUT_MS` | `5000` | `statement_timeout` propio del pool de este servicio. El pool de `packages/db` usa 30 s por defecto (pensado para escrituras de api-core); sin este tope corto, una consulta lenta seguía ocupando una conexión hasta 25 s después de que api-core ya hubiera abandonado la espera (timeout de 5 s en `services/api-core/src/resolver.ts`), agravando la saturación. Si PostGIS cancela una consulta por este timeout (SQLSTATE `57014`), el resolver responde `503` con `Retry-After` en vez de `500`. |
