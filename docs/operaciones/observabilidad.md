# Observabilidad

Tres piezas, ninguna opcional: **saber si responde**, **poder seguir una petición** y **saber qué
está pasando**.

## 1. Salud: `/health` y `/ready`

| Ruta | Qué dice | Para qué |
|---|---|---|
| `GET /health` | El proceso está vivo y acepta HTTP | *Liveness*: si falla, reiniciar el contenedor |
| `GET /ready` | Además, la base responde y (en api-core) geo-service también | *Readiness*: si falla, sacarlo del balanceador, no reiniciarlo |

`/ready` **no** devuelve el detalle del fallo: el mensaje de `pg` incluye host, usuario y base de
datos. El detalle va al log. Está limitado a 60 peticiones por minuto para que no sirva de
amplificador contra la base.

## 2. Seguir una petición: `X-Request-Id`

```
navegador → Next (rewrite) → api-core → geo-service
```

- api-core toma el `X-Request-Id` entrante si tiene forma de id (`[A-Za-z0-9_.:-]{1,128}`); si no,
  genera uno. Se valida porque llega de fuera y acaba escrito en los logs.
- Lo devuelve en la respuesta, así que quien reporta un problema puede citarlo.
- Lo propaga a geo-service al resolver un punto, y geo-service lo devuelve a su vez.

Comprobado:

```bash
curl -s -D - -o /dev/null http://127.0.0.1:3001/health -H "x-request-id: trazado-abc-123" | grep -i x-request-id
```

```bash
curl -s -D - -o /dev/null -X POST http://127.0.0.1:3002/geo/v1/resolver \
  -H "content-type: application/json" -H "x-request-id: trazado-abc-123" \
  -d '{"lat":-17.7833,"lon":-63.1821}' | grep -i x-request-id
```

Ambos devuelven `trazado-abc-123`; sin cabecera, api-core genera uno propio.

## 3. Métricas: `/metrics`

Formato de exposición de Prometheus. Se apaga con `METRICAS_RUTA=` (vacío) y se protege con
`METRICAS_TOKEN` (cabecera `X-Token-Metricas`) cuando el endpoint es alcanzable desde fuera.

| Métrica | Tipo | Etiquetas | Por qué está |
|---|---|---|---|
| `curichi_http_peticiones_total` | contador | `ruta`, `metodo`, `codigo` | Tráfico y reparto de códigos. Base de la tasa de error |
| `curichi_http_duracion_segundos` | histograma | `ruta`, `metodo` | Latencia por percentiles, que es lo que nota la gente |
| `curichi_rate_limit_total` | contador | `ruta` | Si sube, o hay abuso o el límite quedó corto |
| `curichi_errores_5xx_total` | contador | `ruta` | Lo que despierta a alguien de madrugada |
| `curichi_reportes_creados_total` | contador | `severidad`, `anonimo` | Señal de producto: si cae a cero, algo se rompió aunque no haya errores |
| `curichi_moderacion_total` | contador | `desde`, `hacia` | Cuánto modera el municipio y hacia dónde |

`ruta` es la **plantilla** (`/api/v1/reportes/:id`), no la URL concreta: con la URL, cada id
crearía su propia serie temporal y la métrica sería inservible.

### Lo que NO se mide (a propósito)

Nada por usuario ni por IP: serían datos personales en el sistema de métricas y series temporales
sin cota. Para investigar un caso concreto están los logs con su `ipHash`.

## 4. Logs

- JSON estructurado (pino) en producción; con formato legible en desarrollo.
- **Nunca una IP en claro.** Donde hace falta correlacionar (por ejemplo, un login fallido) se
  escribe `ipHash`, que es sha256 de la IP con la sal secreta, recortado a 16 caracteres.
- El detalle de los errores internos va al log; la respuesta HTTP solo lleva un código estable y
  un mensaje en español sin detalles del sistema.

## 5. Alertas sugeridas (pendiente de la Fase 2)

No se configuran aquí porque no hay todavía sistema de alertas, pero estas son las que importan:

| Condición | Gravedad |
|---|---|
| `/ready` en 503 más de 2 minutos | Crítica |
| Tasa de `curichi_errores_5xx_total` > 1 % durante 5 minutos | Crítica |
| p95 de `curichi_http_duracion_segundos` > 1 s durante 10 minutos | Alta |
| `curichi_rate_limit_total` con una subida súbita | Media: o hay abuso, o el límite molesta a gente real |
| `curichi_reportes_creados_total` sin crecer en 24 h en temporada de lluvias | Media: el formulario puede estar roto sin dar error |

> Esa última existe por experiencia propia de este repositorio: el formulario público estuvo
> completamente inutilizable y ningún indicador técnico lo delataba, porque el fallo era una
> validación de cliente que ni siquiera llegaba a hacer la petición.

## Configuración por entorno

Todo lo anterior se configura por variables de entorno (ver `.env.example` de cada servicio).

> **Importante con Turborepo:** turbo 2.x corre en `envMode: strict` y solo pasa a las tareas las
> variables declaradas en `globalEnv` de `turbo.json`. Si se añade una variable nueva que se lee
> en el arranque o en el build, **hay que declararla ahí** o `pnpm dev` y `pnpm build` la
> ignorarán en silencio y el servicio usará el valor por defecto.

---

## Métricas añadidas en la Fase 4

El objetivo era poder responder a «¿por qué está lento?» sin adivinar. Antes solo había latencia y
códigos HTTP, que dicen *que* algo va lento pero no *dónde*. Faltaban justo las dos cosas que
separan los dos problemas opuestos: «la base tarda» y «no quedan conexiones».

### api-core

| Métrica | Tipo | Etiquetas | Para qué |
|---|---|---|---|
| `curichi_db_consulta_segundos` | histograma | `operacion` (verbo SQL) | Cuánto del tiempo de una petición se va en la base. En la prueba de carga dio la respuesta de una: el 83 % del tiempo del listado eran consultas. |
| `curichi_db_errores_total` | contador | `operacion` | Consultas que fallan, separadas de los 5xx de HTTP. |
| `curichi_db_pool_conexiones` | medidor | `estado` (`total`, `libre`, `en_uso`) | Estado del pool en el momento del scrape. |
| `curichi_db_pool_esperando` | medidor | — | **La más importante de todas.** Peticiones que ya pidieron conexión y están en cola. Si esto no es cero de forma sostenida, el cuello de botella es el pool o la base, no el código. |
| `curichi_db_pool_max` | medidor | — | Para poder leer la anterior en proporción. |
| `curichi_db_no_disponible_total` | contador | `ruta` | Veces que se respondió 503 por base saturada o inalcanzable. Separado de los 5xx a propósito: es un problema de capacidad, no un fallo. |
| `curichi_puntos_criticos_desbordes_total` | contador | — | Moderaciones en las que la componente conexa creció más de la cuenta y el recálculo quedó para el mantenimiento. Si sube, el radio de recurrencia está agrupando de más en alguna zona. |

### geo-service

Este servicio **no tenía ninguna métrica**. Ahora expone `/metrics` con el mismo formato y token
que api-core.

| Métrica | Tipo | Etiquetas | Para qué |
|---|---|---|---|
| `curichi_geo_http_peticiones_total` | contador | `ruta`, `metodo`, `codigo` | Volumen y errores por ruta. |
| `curichi_geo_http_duracion_segundos` | histograma | `ruta`, `metodo` | Latencia por ruta. |
| `curichi_geo_rate_limit_total` | contador | `ruta` | Rechazos por límite. |
| `curichi_geo_db_consulta_segundos` | histograma | `operacion` | Igual que en api-core. |
| `curichi_geo_db_pool_conexiones`, `..._esperando` | medidor | — | Igual que en api-core. |
| `curichi_geo_cache_aciertos_total` / `_fallos_total` | contador | `cache` (`capas`, `agregados`) | Un fallo en la caché de capas **no** es «una consulta más»: obliga a releer la capa entera de PostGIS y a reconstruir su índice de teselas. Si este contador no es casi plano, algo está invalidando de más. |
| `curichi_geo_cache_revalidaciones_total` | contador | `cache` | Veces que se sirvió una copia caducada mientras se recalculaba por detrás. |
| `curichi_geo_cache_construccion_segundos` | histograma | `capa` | Cuánto cuesta reconstruir cada capa. |
| `curichi_geo_cache_capas_bytes`, `_cargadas` | medidor | — | Memoria retenida por las capas en caché. Es lo que más crece en este proceso. |

### Cardinalidad

Ninguna etiqueta lleva identificadores, coordenadas, bbox ni IP. Las rutas se etiquetan con la
**plantilla** (`/geo/v1/teselas/:capa/:z/:x/:y`), no con la URL concreta: con la URL concreta,
cada tesela pedida sería una serie temporal nueva y el almacenamiento de métricas se cae solo. El
verbo SQL tiene siete valores posibles y cualquier otra cosa cae en `otra`.

### Qué mirar primero cuando algo va lento

1. `curichi_db_pool_esperando` > 0 sostenido → falta capacidad en la base o sobra concurrencia.
   Subir el pool **no** es la respuesta si la base no tiene CPU (ver `produccion.md`).
2. `curichi_db_consulta_segundos` alto con el pool vacío → es una consulta concreta; mirar
   `log_min_duration_statement` en el log de PostgreSQL, que está en 1000 ms.
3. Latencia HTTP alta con la base rápida → serialización, compresión o el bucle de eventos.
4. `curichi_geo_cache_fallos_total` subiendo → invalidaciones de capa de más.
