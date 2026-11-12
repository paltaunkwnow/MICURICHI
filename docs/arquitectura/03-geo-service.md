# 03 · `services/geo-service` — servicio geoespacial de solo lectura

> Parte **4**. Puerto **3002**. Leyenda: **[C]** confirmado en código · **[I]** inferido · **[Doc]** según documentación.

## 1. Para qué existe

Responde todo lo espacial que **no escribe** [C]:

1. **Point-in-polygon** (PIP): ¿en qué distrito y UV cae un punto? Lo usa api-core en cada reporte y
   el formulario para la vista previa.
2. **Capas administrativas** (distritos, UV, manzanas) como GeoJSON simplificado o como **teselas
   vectoriales MVT generadas al vuelo**, siempre con **huella de contenido** en la URL.
3. **Cifras públicas**: agregados por UV y puntos críticos (con centroide público).

Es de solo lectura **por diseño y por permisos**:

- su rol `curichi_geo` solo tiene `SELECT`;
- al arrancar comprueba que **no** puede escribir en `reporte_inundacion`, y en producción se niega a
  servir si puede.

## 2. Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/servidor.ts` | Arranque: config, pool, logger (IP hasheada), verificación de privilegios y de solo lectura, `listen`, cierre ordenado (15 s) |
| `src/config.ts` | Variables validadas. En producción exige `GEO_TOKEN_INTERNO`, `METRICAS_TOKEN` si se expone `/metrics` y CORS sin `*` |
| `src/app.ts` | Fastify: compress (no MVT), CORS, **rate limit global de 600/min** y **120/min en las rutas con consulta**, `X-Request-Id`, cabeceras, 57014 → 503 y todas las rutas |
| `src/resolver.ts` | PIP con las 4 reglas de §7.4 |
| `src/capas.ts` | `CacheCapas`: texto GeoJSON + huella + índice `geojson-vt` **perezoso** + MVT con `vt-pbf` |
| `src/cache-corta.ts` | Caché de un valor con *stale-while-revalidate* y deduplicación en vuelo |
| `src/visibilidad.ts` | SQL de agregados por UV (cuenta publicados; color y puntos críticos **solo con verificados**) |
| `src/observabilidad.ts` | Métricas Prometheus propias (HTTP, pool, caché, construcción de capas e índices) |
| `src/proxy.ts`, `src/comparar.ts` | Confianza en `X-Forwarded-For` y comparación de tokens en tiempo constante. Son copias deliberadas de las de api-core porque la Parte 4 no puede importar de la Parte 3 |

## 3. Rutas

| Ruta | Límite | Caché | Notas |
|---|---|---|---|
| `POST /geo/v1/resolver` | 120/min por IP; **las internas quedan fuera** (token válido o loopback sin token) | — | Body `{lat, lon}` |
| `GET /geo/v1/capas` | Global | `public, no-cache` | `CapaInfo[]` con `url` con huella y `modo` (`geojson` o `teselas`) |
| `GET /geo/v1/capas/vigentes` | Global | `public, no-cache` | Versión vigente por capa |
| `GET /geo/v1/capas/{capa}/v/{huella}` | Global | **`immutable` 1 año** + ETag/304 | Si la huella es vieja → `410 CAPA_CAMBIO`; si la capa pasa del umbral → `413 USAR_TESELAS` |
| `GET /geo/v1/capas/{capa}` | Global | `no-cache` + ETag | Alias sin huella |
| `GET /geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt` | Global | `immutable` + ETag | `204` si está vacía; mismas reglas de huella |
| `GET /geo/v1/agregados/unidades-vecinales` | 120/min | SWR 100 s / máx. 120 s, `X-Cache` | — |
| `GET /geo/v1/puntos-criticos?bbox=` | 120/min | SWR igual | Hasta 5000; solo `geom_publico`; **sin** `radio_m`, `diametro_m` ni `advertencia` |
| `POST /geo/v1/capas/invalidar` | — | — | **Interna** (token o loopback). Caddy la corta con 404 desde fuera |
| `GET /health`, `/ready`, `/metrics` | — | — | `/metrics` con token |

## 4. Cómo funciona por dentro

### 4.1 PIP (`resolver.ts`)

```text
1. En paralelo:
     UV  ← SELECT … FROM geo.unidad_vecinal_vigente WHERE ST_Intersects(geom, punto) ORDER BY id
     DM  ← SELECT … FROM geo.distrito_municipal_vigente WHERE ST_Intersects(geom, punto) ORDER BY id LIMIT 1
2. más de una UV → en_limite = true; gana la de menor id
3. ninguna UV → la más cercana a ≤ 20 m:
     prefiltro ST_DWithin(geom, punto, 20/55000 grados)        (usa el índice GIST)
     + ST_DWithin(geom::geography, punto::geography, 20)       (metros exactos)
     → asignado_por_proximidad = true, distancia_m
4. el distrito sale de la UV; si el del PIP es otro → distrito_discrepante = true
5. sin UV → dentro_cobertura = false (y api-core responde 422 FUERA_DE_COBERTURA)
```

`manzana` siempre es `null` desde contracts 0.17.0: el reporte no la guarda desde la 0010.

Medido [Doc]: p95 de 17,7 ms con 10 concurrentes. El prefiltro bajó el caso «hueco» de 38,9 ms
(escaneo secuencial) a 0,2 ms.

### 4.2 Capas y teselas (`capas.ts`)

1. **Versión vigente**: `SELECT capa, version, cargado_en FROM geo.capa_version WHERE vigente`,
   repetido como mucho cada 10 s. La clave es `version|cargado_en`, así que recargar la misma versión
   cambia la clave.
2. **Contenido**:
   - si existe `data/processed/<version>/<capa>/<capa>.web.geojson` (salida del ETL), se lee tal cual;
   - si no, se simplifica en PostGIS (`ST_SimplifyPreserveTopology`, tolerancia de 0,00003°).
3. Se guarda **solo el texto**, no el objeto parseado, más su **huella** (SHA-256, 16 hex) y el bbox.
4. **Modo**:
   - hasta `UMBRAL_TESELAS_BYTES` (5 MiB) se sirve como GeoJSON;
   - por encima, como teselas.
   - Con los datos reales [C, hoy]: distritos 34 KB y UV 387 KB → GeoJSON; manzanas 15,9 MB → teselas.
5. **Teselas**:
   - el índice `geojson-vt` se arma **la primera vez que alguien pide una tesela** de esa capa y
     queda en memoria;
   - parámetros: `maxZoom` 16, `indexMaxZoom` 10, `extent` 4096, `buffer` 64;
   - `vt-pbf` codifica cada tesela en MVT v2.
6. **Concurrencia**: N peticiones a una capa fría comparten una sola carga.
7. **Invalidación**:
   - api-core la llama al activar una versión (`/capas/invalidar`);
   - además la versión se vuelve a leer sola cada 10 s.

**Por qué la huella**: la URL cambia si cambia el contenido. Por eso se puede cachear un año
(`immutable`) en el navegador, en el service worker y en una CDN. Una URL vieja responde **410**, y el
cliente vuelve a pedir `/geo/v1/capas`.

### 4.3 Cifras públicas (`cache-corta.ts`, `visibilidad.ts`)

- Agregados por UV:
  - un `LEFT JOIN` de las UV vigentes con los reportes publicados (`estado` público y
    `publicar_en <= now()`), en una sola pasada;
  - `severidad_max_verificada` sale solo de validados y resueltos, para que un reporte falso no pinte
    de crítica una UV.
- Caché SWR:
  - se recalcula a los 100 s;
  - mientras recalcula sigue sirviendo la copia vieja;
  - nadie ve cifras de más de 120 s.
- Los puntos críticos (hasta 100 000 en memoria) se filtran por bbox **en memoria**.

## 5. Configuración

| Variable | Defecto | Notas |
|---|---|---|
| `GEO_SERVICE_PORT` / `GEO_SERVICE_HOST` | 3002 / 127.0.0.1 | En el contenedor, `0.0.0.0` |
| `GEO_DATABASE_URL` → `DATABASE_URL` | PGlite 5433 | Debería ser el rol `curichi_geo` |
| `GEO_DB_STATEMENT_TIMEOUT_MS` | 5000 | Por debajo del plazo de 5 s de api-core |
| `CORS_ORIGENES` | localhost 3000, 3100 | — |
| `UMBRAL_TESELAS_BYTES` | 5 MiB | — |
| `TOLERANCIA_SIMPLIFICACION` | 0.00003 | Solo sin `web.geojson` |
| `DIR_PROCESSED` | `../../data/processed` | En el Compose se monta en solo lectura |
| `GEO_TOKEN_INTERNO` | — | **Obligatoria** en producción |
| `GEO_RATE_LIMIT_POR_MINUTO` / `_CONSULTAS_` | 600 / 120 | — |
| `GEO_CACHE_AGREGADOS_MS` / `_EDAD_MAX_MS` | 100 000 / 120 000 | La edad máxima tiene tope de 120 000 |
| `TRUST_PROXY` | 0 | En Docker, **1** |
| `METRICAS_RUTA` / `METRICAS_TOKEN` | `/metrics` / — | — |

## 6. Estado y escalado

- **Estado en memoria por proceso**: caché de capas (texto + índice de teselas; las manzanas pesan
  decenas de MB), cifras SWR y contadores de rate limit.
- Con N réplicas: cada una reconstruye su caché (más memoria, sin inconsistencia) y la invalidación
  explícita llega a **una** réplica, pero las demás se actualizan en 10 s o menos [Doc].
- No escribe, así que escala horizontalmente sin coordinación. El límite real es PostGIS (PIP y
  agregados) [Doc].
- Ver [11 · Escalado y ecosistema](11-escalado-y-ecosistema.md).

## 7. Pruebas [C]

Cinco archivos con PGlite y capas sintéticas:

- `geo-service.test.ts`: interior, borde, hueco, fuera de cobertura, manzana `null`, índice perezoso.
- `huella-y-cifras.test.ts`: 410, `immutable`, edad de las cifras.
- `plan-agregados.test.ts`: plan de la consulta.
- `cache-corta.test.ts` y `config.test.ts`.

## 8. Observaciones (pendientes)

| # | Observación | Dónde |
|---|---|---|
| G-1 | Los comentarios dicen que el valor correcto de `TRUST_PROXY` es **2**. El resto del repo (api-core, `.env.example`, Compose) dice **1** y explica que 2 permite elegir la IP | `src/proxy.ts:17`, `src/config.ts:60` |
| G-2 | La capa web de manzanas tiene **27 434** features y la completa **27 527**: la simplificación con `-clean` del ETL descartó 93 polígonos de la capa de dibujo [C, `/geo/v1/capas` frente a `etl:load`] | Salida del ETL |
| G-3 | La invalidación de capas no llega a todas las réplicas (desfase de hasta 10 s) | `capas.ts` |
| G-4 | El rate limit es por proceso (×N con réplicas) | `app.ts` |
