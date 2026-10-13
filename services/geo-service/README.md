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
| `GET /geo/v1/agregados/unidades-vecinales?categoria=` | Reportes publicados por UV (nuevo, validado y resuelto con `publicar_en <= now()`), con `n_verificados` y `severidad_max_verificada` solo de validado y resuelto. Cuenta solo la categoría pedida (sin el parámetro, `inundacion`) y cada fila trae su `categoria`; ver «Categorías» |
| `GET /geo/v1/puntos-criticos?bbox=&categoria=` | Puntos críticos (§9.2), armados solo con verificados, de la categoría pedida (sin el parámetro, `inundacion`) |
| `POST /geo/v1/capas/invalidar` | Vacía la caché tras activar una versión |
| `GET /health`, `GET /ready` | |

## Huella de las capas y cachés

La huella son los primeros 16 caracteres hexadecimales del SHA-256 del GeoJSON web que el servicio tiene en memoria (del que salen también las teselas). Cambia con el contenido, no con el nombre de la versión: si el ETL recarga la misma versión (actualiza `geo.capa_version.cargado_en`), el servicio lo ve en 10 s como máximo y reconstruye la capa; si la geometría cambió, cambia la huella.

| Respuesta | Cache-Control |
|---|---|
| Capa o tesela con la huella vigente | `public, max-age=31536000, immutable`, con ETag |
| Capa o tesela con una huella vieja | `410 CAPA_CAMBIO` con `no-store`: el cliente vuelve a pedir `/geo/v1/capas` |
| Alias sin huella, `/geo/v1/capas`, `/geo/v1/capas/vigentes` | `public, no-cache` |
| Agregados y puntos críticos | `public, no-cache`; en el servidor se recalculan a los 100 s (por detrás) y nunca se sirven con más de 120 s, con una caché por categoría |

Los puntos críticos de cada categoría se guardan enteros en memoria y el `bbox` se filtra en el servicio: cada vista del mapa pide un bbox distinto y una caché por bbox casi nunca acertaría.

```bash
pnpm --filter geo-service dev     # http://127.0.0.1:3002
pnpm --filter geo-service test    # PostGIS efímero: interior, borde, hueco, fuera, teselas, agregados
```

Índice GIST: la consulta `ST_Intersects(geom, punto)` sobre `geo.unidad_vecinal_vigente` usa el índice `unidad_vecinal_geom_gist` (el planificador lo elige cuando la tabla tiene tamaño real; con 3 filas de test hace Seq Scan). Verificable con `EXPLAIN`.

## Categorías (plataforma multitemática)

Desde `contracts` 0.20.0 (corrida M3a, ver el [CHANGELOG](../../packages/contracts/CHANGELOG.md)) las dos
rutas de cifras públicas trabajan por categoría ([ADR 0009](../../docs/decisiones/0009-nucleo-y-registro-de-categorias.md),
[ADR 0012](../../docs/decisiones/0012-compatibilidad-de-api.md) y
[ADR 0013](../../docs/decisiones/0013-mapa-unico-con-datos-por-categoria.md)): los agregados leen la tabla
`reporte` filtrada por `r.categoria` y los puntos críticos leen `punto_critico.categoria`. El resto del
servicio (resolver, capas y teselas) no depende de la categoría. El registro de `contracts` define hoy solo
Inundaciones (`REGISTRO_CATEGORIAS`), así que es la única categoría que puede estar activa.

### El parámetro `categoria`

Lo leen `GeoAgregadosQuerySchema` y `GeoPuntosCriticosQuerySchema` (`packages/contracts/src/esquemas/geo.ts`),
que usan `CategoriaFiltroSchema`:

| Valor | Resultado |
|---|---|
| Ausente o vacío | `inundacion` (valor por defecto) |
| Un slug o un alias: `inundacion`, `inundaciones`, `baches`, `area-verde`, `Área Verde`… | El slug canónico (`inundacion`, `bache`, `area_verde`, `basura`). Los alias admiten plural, guion o guion bajo, mayúsculas y tildes |
| `todas` | **No** se admite: ambas rutas son públicas y exigen una categoría |
| Cualquier otro valor | Categoría desconocida |

Las dos rutas exigen **una** categoría activa. Si la categoría es desconocida, está inactiva o es `todas`,
responden 400 con `{ "codigo": "CATEGORIA_NO_DISPONIBLE", "mensaje": "La categoría pedida no está disponible." }`.
Con `?categoria=` válida y activa, `X-Cache` y `Cache-Control` son los de siempre (`public, no-cache`).

### Cómo se decide si una categoría está activa

Lo decide `src/categorias.ts` (`crearProveedorCategorias`, disponible como `app.categorias`), con el mismo
criterio que api-core. Una categoría está **activa** cuando se cumplen las dos cosas:

1. el catálogo `categoria` la tiene con `activa = true` (el servicio lo consulta con el rol `curichi_geo`,
   que tiene `SELECT` sobre esa tabla desde la migración 0020), y
2. el registro de categorías tiene su definición.

Si falta cualquiera de las dos cuenta como **inactiva** (falla cerrado). El caso que no debería pasar, activa
en el catálogo pero sin definición en el registro, deja un aviso en el log. La lista se recuerda
`CATEGORIAS_ACTIVAS_TTL_MS` = 30 s, así que un cambio del catálogo se ve en ese plazo sin reiniciar el
servicio; un fallo de la base no se cachea. `app.categorias.invalidar()` olvida la caché.

### Una caché por categoría

Las cifras de inundación y las de otra categoría cuentan cosas distintas y no pueden compartir celda.
`CachePorCategoria` (`src/cache-corta.ts`) crea una `CacheCorta` por categoría la primera vez que se pide,
todas con el mismo TTL (`GEO_CACHE_AGREGADOS_MS`) y la misma edad máxima (`GEO_CACHE_AGREGADOS_EDAD_MAX_MS`).
Hay una para los agregados y otra para los puntos críticos. La consulta de categoría inválida se corta con
400 antes de llegar a la caché, así que las claves son solo las de categorías activas y no crecen sin tope.

### Probar con una categoría sintética (`dep.registro`)

`crearApp(dep)` recibe el registro como dependencia opcional (`DependenciasGeo.registro`). Sin él se usa
`REGISTRO_CATEGORIAS`, que es lo que hace `src/servidor.ts`. Para ejercitar el camino multicategoría sin
tocar `contracts`, una prueba arma un registro propio con `crearRegistroCategorias([...])`:

```ts
const app = await crearApp({ pool, cfg, registro: miRegistro });
```

Como la actividad exige catálogo **y** registro, la prueba también marca la fila del catálogo
(`UPDATE categoria SET activa = true WHERE slug = '…'`) y llama a `app.categorias.invalidar()` para que la
caché de 30 s lo vea ya. Para tener puntos críticos de la categoría sintética llama a
`recalcularPuntosCriticos(ex, radio)` de `db` con un radio explícito. El ejemplo es
`test/no-contaminacion-categoria.test.ts`: reportes de inundación y de una categoría sintética en la misma UV
y las mismas coordenadas; sin parámetro solo salen los de inundación, con la categoría activa salen solo los
suyos, y una inactiva, desconocida o `todas` da 400.

## Cabecera interna y cupo del resolver

`POST /geo/v1/resolver` lo llama api-core una vez por cada `POST /reportes`, siempre desde el mismo origen. Para que ese tráfico no comparta cupo con la previsualización pública (el navegador del vecino, antes de enviar), las peticiones que traen la cabecera **`x-token-interno`** con el mismo valor que `GEO_TOKEN_INTERNO` (comparada en tiempo constante) quedan fuera del cupo de `GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO`. Sin `GEO_TOKEN_INTERNO` configurado (solo pasa en el modo local sin Docker), el criterio cae a "viene de loopback", igual que en `/geo/v1/capas/invalidar`. Sin ese token, o con uno incorrecto, la petición sigue limitada por IP como cualquier tráfico público.

## Variables de entorno propias

| Variable | Por defecto | Qué hace |
|---|---|---|
| `GEO_TOKEN_INTERNO` | (vacío → solo loopback) | Cabecera `x-token-interno` para `/geo/v1/capas/invalidar` y para la exención de cupo de `/geo/v1/resolver`. Obligatoria en producción. |
| `GEO_DATABASE_URL` | usa `DATABASE_URL`, y si tampoco está, `postgresql://curichi:curichi@127.0.0.1:5433/curichi` | Cadena de conexión propia de este servicio, con el rol `curichi_geo` (solo lectura) en vez del rol dueño (`curichi`) que trae `DATABASE_URL`. `pnpm dev` carga el `.env` de la raíz si existe (`tsx watch --env-file-if-exists=../../.env`). |
| `GEO_CACHE_AGREGADOS_MS` | `100000` | Edad a la que se recalculan las cifras públicas (agregados por UV y puntos críticos, cada categoría con su caché), por detrás y sirviendo la copia anterior. Nunca pasa de `GEO_CACHE_AGREGADOS_EDAD_MAX_MS`. Un valor que no sea un número ≥ 0 impide arrancar. |
| `GEO_CACHE_AGREGADOS_EDAD_MAX_MS` | `120000` | Edad máxima de una cifra pública servida: pasado este tiempo sin recálculo, la petición espera al valor nuevo. Número ≥ 0 y como mucho 120000 (lo que promete el contrato); si no, el servicio no arranca. La edad cuenta desde que empezó el cálculo. |
| `GEO_DB_STATEMENT_TIMEOUT_MS` | `5000` | `statement_timeout` propio del pool de este servicio. El pool de `packages/db` usa 30 s por defecto (pensado para escrituras de api-core); sin este tope corto, una consulta lenta seguía ocupando una conexión hasta 25 s después de que api-core ya hubiera abandonado la espera (timeout de 5 s en `services/api-core/src/resolver.ts`), agravando la saturación. Si PostGIS cancela una consulta por este timeout (SQLSTATE `57014`), el resolver responde `503` con `Retry-After` en vez de `500`. |
