# geo-service — Parte 4 (servicio geoespacial)

Fastify + PostGIS. Responde "¿en qué distrito y UV cae este punto?" y sirve las capas al mapa.

| Ruta | Qué hace |
|---|---|
| `POST /geo/v1/resolver` `{lat, lon}` | Point-in-polygon con reglas §7.4: interior, borde (determinista + `en_limite`), hueco (UV más cercana a ≤ 20 m + `asignado_por_proximidad`), fuera de cobertura |
| `GET /geo/v1/capas/vigentes` | Versión vigente por capa |
| `GET /geo/v1/capas` | Info por capa: modo `geojson` o `teselas`, bytes, bbox y la `url` con huella que usan los clientes |
| `GET /geo/v1/capas/:capa/v/:huella` | GeoJSON web de la capa vigente (413 si supera 5 MB) con ETag; 410 `CAPA_CAMBIO` si la huella ya no es la vigente |
| `GET /geo/v1/teselas/:capa/:huella/:z/:x/:y.mvt` | Teselas vectoriales al vuelo (geojson-vt + vt-pbf); 410 con una huella vieja |
| `GET /geo/v1/capas/:capa`, `GET /geo/v1/teselas/:capa/:z/:x/:y.mvt` | Alias sin huella de las dos anteriores |
| `GET /geo/v1/agregados/unidades-vecinales` | Reportes publicados por UV (nuevo, validado y resuelto con `publicar_en <= now()`), con `n_verificados` y `severidad_max_verificada` solo de validado y resuelto |
| `GET /geo/v1/puntos-criticos?bbox=` | Puntos críticos (§9.2), armados solo con verificados |
| `POST /geo/v1/capas/invalidar` | Vacía la caché tras activar una versión |
| `GET /health`, `GET /ready` | |

## Huella de las capas y cachés

La huella son los primeros 16 caracteres hexadecimales del SHA-256 del GeoJSON web que el servicio tiene en memoria (del que salen también las teselas). Cambia con el contenido, no con el nombre de la versión: si el ETL recarga la misma versión (actualiza `geo.capa_version.cargado_en`), el servicio lo ve en 10 s como máximo y reconstruye la capa; si la geometría cambió, cambia la huella.

| Respuesta | Cache-Control |
|---|---|
| Capa o tesela con la huella vigente | `public, max-age=31536000, immutable`, con ETag |
| Capa o tesela con una huella vieja | `410 CAPA_CAMBIO` con `no-store`: el cliente vuelve a pedir `/geo/v1/capas` |
| Alias sin huella, `/geo/v1/capas`, `/geo/v1/capas/vigentes` | `public, no-cache` |
| Agregados y puntos críticos | `public, no-cache`; en el servidor se recalculan a los 100 s (por detrás) y nunca se sirven con más de 120 s |

Los puntos críticos se guardan enteros en memoria y el `bbox` se filtra en el servicio: cada vista del mapa pide un bbox distinto y una caché por bbox casi nunca acertaría.

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
| `GEO_CACHE_AGREGADOS_MS` | `100000` | Edad a la que se recalculan las cifras públicas (agregados por UV y puntos críticos), por detrás y sirviendo la copia anterior. Nunca pasa de `GEO_CACHE_AGREGADOS_EDAD_MAX_MS`. Un valor que no sea un número ≥ 0 impide arrancar. |
| `GEO_CACHE_AGREGADOS_EDAD_MAX_MS` | `120000` | Edad máxima de una cifra pública servida: pasado este tiempo sin recálculo, la petición espera al valor nuevo. Número ≥ 0 y como mucho 120000 (lo que promete el contrato); si no, el servicio no arranca. La edad cuenta desde que empezó el cálculo. |
| `GEO_DB_STATEMENT_TIMEOUT_MS` | `5000` | `statement_timeout` propio del pool de este servicio. El pool de `packages/db` usa 30 s por defecto (pensado para escrituras de api-core); sin este tope corto, una consulta lenta seguía ocupando una conexión hasta 25 s después de que api-core ya hubiera abandonado la espera (timeout de 5 s en `services/api-core/src/resolver.ts`), agravando la saturación. Si PostGIS cancela una consulta por este timeout (SQLSTATE `57014`), el resolver responde `503` con `Retry-After` en vez de `500`. |
