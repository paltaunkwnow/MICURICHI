# Observabilidad

Tres piezas, ninguna opcional: **saber si responde**, **poder seguir una petición** y **saber qué
está pasando**.

## 1. Salud: `/health` y `/ready`

| Ruta | Qué dice | Para qué |
|---|---|---|
| `GET /health` | El proceso está vivo y acepta HTTP | *Liveness*: si falla, reiniciar el contenedor |
| `GET /ready` | Además, la base responde. En api-core mira también geo-service y el almacén de fotos: con S3, que responda; en disco, que se pueda escribir (escribe y borra un archivo temporal) y que quede más que `FOTOS_MIN_LIBRE_BYTES` libre. Sin base da 503; lo demás da 200 con `degradado: true` | *Readiness*: si falla, sacarlo del balanceador, no reiniciarlo |

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
`METRICAS_TOKEN` (cabecera `X-Token-Metricas`) cuando el endpoint es alcanzable desde fuera. El
Prometheus del perfil `observabilidad` manda esa cabecera (§6); si cambiás `METRICAS_RUTA`, cambiá
también `metrics_path` en `infra/observabilidad/prometheus.yml`.

| Métrica | Tipo | Etiquetas | Por qué está |
|---|---|---|---|
| `curichi_http_peticiones_total` | contador | `ruta`, `metodo`, `codigo` | Tráfico y reparto de códigos. Base de la tasa de error |
| `curichi_http_duracion_segundos` | histograma | `ruta`, `metodo` | Latencia por percentiles, que es lo que nota la gente |
| `curichi_rate_limit_total` | contador | `ruta` | Si sube, o hay abuso o el límite quedó corto |
| `curichi_errores_5xx_total` | contador | `ruta` | Lo que despierta a alguien de madrugada |
| `curichi_reportes_creados_total` | contador | `severidad`, `rol` | Señal de producto: si cae a cero, algo se rompió aunque no haya errores. `rol` separa lo que reporta el vecindario de lo que carga un técnico |
| `curichi_moderacion_total` | contador | `desde`, `hacia` | Cuánto modera el municipio y hacia dónde |
| `curichi_reportes_fuera_de_radio_total` | contador | `codigo` | Reportes rechazados con 422 por la ubicación del dispositivo (fuera de los 60 m, precisión insuficiente o posición vencida). Si sube mucho, el radio o la precisión exigida dejan afuera a gente real |
| `curichi_cuota_reportes_rechazos_total`, `curichi_cuota_fotos_rechazos_total` | contador | — | Rechazos `429` por el cupo diario de cada cuenta (3 reportes y 12 fotos por día). El de fotos es el de `CuotaDeFotosRechazando` |
| `curichi_reportes_sin_verificar_antiguedad_segundos` | medidor | — | Antigüedad del reporte publicado sin verificar más viejo. Sin moderación previa, es lo que dice si la bandeja se atrasa (`BandejaSinVerificarAtrasada`) |
| `curichi_fotos_subidas_total` | contador | `resultado` (`aceptada`, `rechazada_tipo`, `rechazada_tamano`, `rechazada_cuota`, `rechazada_espacio`, `error`) | Cada intento de `POST /fotos` y por qué se cae. `rechazada_espacio` es el `507 SIN_ESPACIO` de la guarda de disco; un pico de `error` es el almacén o la base |
| `curichi_fotos_procesado_segundos` | histograma | — | Lo que tarda sharp en pasar cada foto a WebP, sin el multipart ni la base: la parte que puede saturar la CPU |
| `curichi_fotos_disco_libre_bytes`, `curichi_fotos_disco_total_bytes` | medidor | — | Espacio del disco de fotos, solo con el almacén en disco (el de la VPS). Ese disco es también el de PostgreSQL (`DiscoDeFotos*`) |
| `curichi_fotos_disco_min_libre_bytes` | medidor | — | El umbral configurado (`FOTOS_MIN_LIBRE_BYTES`; 0 si la guarda está apagada). Las alertas `DiscoDeFotos*` comparan contra este valor, así que cambiar la variable no obliga a tocar `alertas.yml` |

`ruta` es la **plantilla** (`/api/v1/reportes/:id`), no la URL concreta: con la URL, cada id
crearía su propia serie temporal y la métrica sería inservible.

`/indicadores` y `/ejecutivo/resumen` no tienen caché en api-core (el panel los pide cada 10 s):
las peticiones simultáneas se juntan en una sola consulta, y no hay métricas de caché ni cabecera
`X-Cache` en api-core. `X-Cache` (`hit`, `miss` o `stale`) queda solo en las cifras públicas de
geo-service (agregados por UV y puntos críticos), con sus `curichi_geo_cache_*`.

### Lo que NO se mide (a propósito)

Nada por usuario ni por IP: serían datos personales en el sistema de métricas y series temporales
sin cota. Para investigar un caso concreto están los logs con su `ipHash`.

## 4. Logs

- JSON estructurado (pino) en producción; con formato legible en desarrollo.
- **Nunca una IP en claro.** Donde hace falta correlacionar (por ejemplo, un login fallido) se
  escribe `ipHash`, que es sha256 de la IP con la sal secreta, recortado a 16 caracteres.
- El detalle de los errores internos va al log; la respuesta HTTP solo lleva un código estable y
  un mensaje en español sin detalles del sistema.

## 5. Alertas

Configuradas en `infra/observabilidad/alertas.yml` y activas con el perfil `observabilidad` del
Compose (ver §6). Cada una lleva `gravedad`, `servicio` e `instalacion` (la ciudad, de
`INSTALACION_NOMBRE`).

| Alerta | Condición | Gravedad | Qué hacer |
|---|---|---|---|
| `ServicioCaido` | Una réplica no entrega `/metrics` durante 2 min | Crítica | `docker compose ps` y `logs` del servicio. Si todas las demás métricas están bien, revisar que `METRICAS_TOKEN` sea el mismo en Prometheus y en el servicio |
| `ServicioSinReplicas` | Ninguna réplica de api-core (o de geo-service) sana durante 2 min | Crítica | Lo mismo; sin geo-service no se ubica ningún reporte |
| `NoListo` | `/ready` no da 200 durante 2 min | Crítica | En api-core solo pasa sin base: `docker compose logs postgis`, conexiones, disco |
| `Degradado` | `/ready` da 200 con `"degradado": true` durante 5 min | Alta | `/ready` dice si es `geo` (geo-service) o `fotos` (almacén caído, o `poco_espacio` en el disco). El mapa sigue; crear reportes o subir fotos, no |
| `TasaDeErrores5xx` | Más del 1 % de 5xx durante 5 min (con un mínimo de tráfico) | Crítica | Logs por `reqId`; los 503 por base saturada también cuentan |
| `LatenciaAlta` | p95 > 1 s durante 10 min (sin la exportación) | Alta | Mirar primero `curichi_db_pool_esperando` (§«Qué mirar primero») |
| `PoolDeConexionesSaturado` | Peticiones esperando conexión en cada lectura de 5 min | Alta | Falta CPU en la base o sobra concurrencia. Subir el pool NO sirve sin CPU (produccion.md) |
| `BaseNoDisponible` | api-core respondió 503 por base saturada o caída | Alta | Capacidad de la base |
| `RateLimitDisparado` | Más de 50 rechazos por límite en 15 min en una ruta | Media | Abuso, o un límite que molesta. Si todos los rechazos comparten `ipHash`, `TRUST_PROXY` está mal (produccion.md) |
| `CuotaDeFotosRechazando` | Más de 20 subidas de fotos rechazadas por cuota en 1 h | Media | Subidas en masa, o un tope por cuenta corto |
| `ReportesSinCrecer` | Ningún reporte nuevo en 24 h, con api-core en marcha, durante 6 h | Media | En temporada de lluvias: probar el formulario a mano. Fuera de temporada, silenciarla |
| `PuntosCriticosFallando` | El recálculo de puntos críticos falló | Media | Logs de api-core; el mantenimiento lo reintenta |
| `DiscoDeFotosPorLlenarse` | Queda menos del doble de `FOTOS_MIN_LIBRE_BYTES` libre en el disco de fotos, durante 30 min | Alta | Agrandar el disco o liberar espacio (`df -h`, `docker system df`, `docker image prune`) antes de que empiecen los 507 |
| `DiscoDeFotosBajoElUmbral` | Queda menos de `FOTOS_MIN_LIBRE_BYTES` libre, durante 5 min: las fotos ya dan `507 SIN_ESPACIO` | Crítica | Lo mismo, ya: ese disco es también el de PostgreSQL. Inhibe el `Degradado` de api-core, que es la misma causa |
| `BandejaSinVerificarAtrasada` | El reporte sin verificar más antiguo pasó el plazo de revisión (24 h, provisional `<a confirmar con el municipio>`), durante 10 min | Alta | Moderar la bandeja del panel técnico: el reporte está a la vista con «NO SE HA VERIFICADO» |
| `AppCaida` | Una réplica de web-ciudadano o panel-admin no da 200 en `/` durante 2 min | Crítica | `docker compose ps` y `logs` de esa app. Si quedan réplicas sanas, el proxy ya reparte entre ellas |
| `AppSinReplicas` | Ninguna réplica de una de las dos apps da 200 en `/` durante 2 min | Crítica | Lo mismo. Inhibe el `ProxyNoResponde` de ese sitio, que es consecuencia |
| `ProxyNoResponde` | Un sitio no da 200 entrando por el proxy como un navegador (TLS con su nombre) durante 2 min | Crítica | `docker compose ps proxy` y `logs proxy`. Con `PROXY_TLS=acme` salta también si el certificado no valida o venció |
| `CertificadoPorVencer` | Al certificado público de un sitio le quedan menos de 10 días, durante 1 h (solo `PROXY_TLS=acme`) | Alta | Caddy renueva a un tercio de la vida: la renovación lleva días fallando. `docker compose logs proxy \| grep -i acme`: DNS, puerto 80, límite de la autoridad |
| `RespaldoFallido` | La envía el propio trabajo de respaldos al fallar | Crítica | `docker compose logs respaldo` y respaldo-y-restauracion.md |
| `AlertasSinSalir` | Alertmanager no consigue entregar avisos durante 15 min | Alta | `ALERTAS_WEBHOOK_URL` y `docker compose logs alertmanager` |
| `PrometheusSinAlertmanager` | Prometheus no encuentra a Alertmanager | Alta | Las reglas se evalúan pero nadie se entera |

> `DiscoDeFotos*` no tienen el umbral escrito: comparan el espacio libre con
> `curichi_fotos_disco_min_libre_bytes`, que api-core publica desde `FOTOS_MIN_LIBRE_BYTES`. Si dos
> réplicas difieren (a mitad de un despliegue), manda el umbral más alto, y con 0 (guarda apagada)
> no avisan. El plazo de `BandejaSinVerificarAtrasada` (86 400 s) sí está escrito en
> `alertas.yml`, porque es un acuerdo con el municipio y no una variable de api-core: si cambia, se
> cambia ahí y en `alertas.test.yml`, y se corre `promtool test rules`.

> `ReportesSinCrecer` existe por experiencia propia de este repositorio: el formulario público
> estuvo completamente inutilizable y ningún indicador técnico lo delataba, porque el fallo era una
> validación de cliente que ni siquiera llegaba a hacer la petición.

La «cola de fotos» no tiene métrica propia: api-core no expone cuántas imágenes esperan a
procesarse. Se cubre con `Degradado` (almacén caído), `DiscoDeFotos*` (espacio) y
`CuotaDeFotosRechazando`; una métrica de
cola del procesado de imágenes queda pendiente para la Parte 3.

## 6. Monitoreo con el perfil `observabilidad`

```bash
docker compose --profile servicios --profile observabilidad up -d
```

| Servicio | Qué hace | Interfaz |
|---|---|---|
| `prometheus` | Lee `/metrics` de **todas** las réplicas de api-core y geo-service cada 15 s (las descubre por DNS, así que `--scale` no requiere tocar nada), con el `METRICAS_TOKEN` en la cabecera `X-Token-Metricas`. Evalúa las reglas | `http://127.0.0.1:9090` |
| `blackbox` | Prueba `/ready` de cada réplica de los servicios y distingue «no lista» de «degradada»; `/` de cada réplica de las apps (no tienen ruta de salud propia); y cada sitio a través del proxy como un navegador: TLS con el nombre del sitio (el parámetro `hostname` fija la cabecera Host y el SNI), proxy y app. Con `PROXY_TLS=acme` verifica el certificado y mide cuánto le queda | — |
| `alertmanager` | Agrupa, deduplica, inhibe (con la réplica caída no avisa también de su latencia) y envía | `http://127.0.0.1:9093` |

Prometheus necesita además `DOMINIO_PUBLICO`, `DOMINIO_PANEL` y `PROXY_TLS`, los mismos del proxy:
su envoltorio rellena con ellos el job `proxy` y elige el módulo del blackbox (sin ellos no
arranca y lo dice). Esa sonda entra por el contenedor del proxy, no por el DNS público: el DNS y el
cortafuegos de la máquina los tiene que vigilar un servicio **externo** (el mismo tipo de vigilante
que `RESPALDO_URL_LATIDO`). Las reglas de la entrada tienen pruebas propias
(`infra/observabilidad/alertas.test.yml`, `promtool test rules`, en el CI). Comprobado el 2026-09-26
con la pila levantada: las cuatro sondas en 1; con el panel congelado (`docker pause`), `AppCaida`,
`AppSinReplicas` y `ProxyNoResponde` del panel en *firing* y nada de la app pública, y en
Alertmanager el `ProxyNoResponde` quedó inhibido; al reanudar, todo volvió a 1.

Las dos interfaces quedan en `127.0.0.1` del servidor. Para verlas desde fuera, un túnel:
`ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 usuario@servidor`. No se publican a internet:
enumeran rutas y tráfico, lo mismo que protege `METRICAS_TOKEN`.

Retención de métricas: `PROMETHEUS_RETENCION` (30 días) o `PROMETHEUS_RETENCION_TAMANO` (5 GB), lo
que llegue antes. Todas las imágenes van fijadas por versión y digest.

### Adónde llegan las alertas

A un webhook, cuya URL va en `ALERTAS_WEBHOOK_URL` (`[SENSIBLE]`: suele llevar el secreto dentro).
Alertmanager le hace un `POST` con su JSON estándar (`status`, `alerts[]` con `labels` y
`annotations`) al abrirse la alerta, cada `repeat_interval` mientras siga (1 h las críticas, 4 h las
altas, 24 h el resto) y al resolverse. Sin la variable, Alertmanager arranca igual, sin destino, y lo
avisa en su log: las alertas se ven en su interfaz pero no salen de la máquina.

Si el destino no entiende ese JSON, hay dos caminos:

- **Un receptor nativo de Alertmanager** en `infra/observabilidad/alertmanager.yml`: Slack
  (`slack_configs` con `api_url_file`), Microsoft Teams (`msteamsv2_configs` con
  `webhook_url_file`), Telegram (`telegram_configs`), Discord, correo (`email_configs`, necesita
  SMTP) o PagerDuty. Los `*_file` leen el secreto de un archivo: se escribe desde una variable en
  `arrancar-alertmanager.sh`, igual que se hace hoy con el webhook.
- **Un servicio que acepte webhooks genéricos** (ntfy, Uptime Kuma, Better Stack…) y los reenvíe
  al teléfono.

### Probar que las alertas llegan

Antes de dar el monitoreo por bueno, una alerta de prueba de punta a punta:

```bash
docker compose exec alertmanager amtool alert add PruebaDeAlertas gravedad=media servicio=prueba \
  instalacion=manual --annotation='resumen="Alerta de prueba: si la ves, las alertas llegan"' \
  --alertmanager.url=http://127.0.0.1:9093
```

Tiene que llegar al destino en menos de un minuto. Y conviene un **vigilante del vigilante**: un
servicio externo que avise si deja de recibir el latido de los respaldos (`RESPALDO_URL_LATIDO`),
porque si el servidor entero se cae, nada de lo que corre dentro puede avisar.

### Retención de logs

- **Hoy:** cada contenedor rota su log a 10 MB × 3 archivos (`x-comun` del Compose). Es decir,
  unos 30 MB por contenedor: días u horas según el tráfico. Sirve para diagnosticar lo reciente,
  no para investigar un abuso de hace dos semanas.
- **Qué hay en los logs:** JSON de pino, una línea por petición, con `reqId`, ruta, código, tiempo
  e `ipHash` (hash con sal, nunca la IP). Aun así es un dato personal seudonimizado (§13): la
  retención no debe superar la de `ip_hash` en la base, **30 días**.
- **Para producción** (`PENDIENTE`): enviar los logs a un almacén con retención fija, con el
  recolector que tenga el hosting o uno propio (Grafana Loki con Promtail o Alloy, Vector,
  Fluent Bit) leyendo los logs de Docker; retención de 30 días, acceso solo para operación. El
  formato JSON no necesita ningún parseo especial: todos los servicios, el job de migraciones y
  el de respaldos escriben la misma forma.

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
