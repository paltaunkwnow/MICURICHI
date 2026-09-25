# Lista de comprobación para producción

Lo que hay que tener resuelto **antes** de abrir el sistema al público. Lo marcado como
`PENDIENTE` depende de infraestructura que todavía no existe; no se ha inventado configuración
para ello.

## Secretos y configuración

`api-core` **no arranca** con `NODE_ENV=production` si alguno de estos sigue con el valor de
ejemplo (`verificarProduccion` en `services/api-core/src/config.ts`):

| Variable | Qué pasa si falta |
|---|---|
| `IP_HASH_SAL` | El hash de IP del antispam sería adivinable: el espacio de IPv4 es pequeño. **Mínimo 32 caracteres** |
| `JITTER_SAL` | El desplazamiento de la vista pública se podría revertir y quedaría expuesta la vivienda. **Mínimo 32 caracteres**: el jitter siembra con un hash no criptográfico (FNV-1a), así que lo único que lo protege es que la sal no se pueda adivinar |
| `COOKIE_SEGURA=1` | La cookie de sesión viajaría por HTTP |
| `CORS_ORIGENES` | No puede ser `*` con cookies de sesión, ni estar vacío |
| `METRICAS_TOKEN` | `/metrics` enumera rutas, conteos de peticiones y de errores. Es obligatorio salvo que se vacíe `METRICAS_RUTA` |

Además, sin ser bloqueantes:

| Variable | Recomendación |
|---|---|
| `GEO_TOKEN_INTERNO` | Obligatorio si api-core y geo-service no comparten host: sin él, `/geo/v1/capas/invalidar` solo se acepta desde loopback |
| `TRUST_PROXY` | Ver la sección siguiente. Ya **no** es un interruptor: es cuánta confianza, y equivocarse deja el rate limit sin efecto |
| `EXPONER_DOCS=0` | `/docs` (Swagger UI) queda apagado por defecto en producción |
| `HSTS=1` | Solo detrás de HTTPS; anunciarlo sobre http deja el navegador sin marcha atrás |

> **Turborepo:** toda variable que se lea al arrancar o al construir tiene que estar en
> `globalEnv` de `turbo.json`. Turbo 2.x corre en `envMode: strict` y las que no estén ahí **no
> llegan** a la tarea, en silencio. Ya pasó una vez: los servicios ignoraban los límites por
> mucho que se exportaran.

## La IP del cliente, y por qué es un asunto de seguridad

De acertar la IP del cliente dependen tres controles de §13: el rate limit de `POST /reportes`,
el freno de fuerza bruta del login por IP y el `ip_hash` del antispam. Si la IP está mal, los tres
dejan de hacer su trabajo, y en silencio.

**Lo que se comprobó en la Fase 3** (servicio de eco detrás del *rewrite* de Next):

- El `rewrite` de Next **pasa el `X-Forwarded-For` del navegador tal cual**.
- Y **no añade ninguno propio**: si el cliente no manda la cabecera, al servicio no le llega nada.

Es decir, la app Next es un proxy más, y uno que no reescribe nada. Eso dejaba dos escenarios y
los dos malos: sin `TRUST_PROXY`, todos los vecinos comparten un único cubo de rate limit (el
límite de 10 reportes por hora pasa a ser de la ciudad entera); con `TRUST_PROXY` activado a la
antigua, el navegador elegía su propia IP y se saltaba los tres controles.

**Cómo queda configurado.** Dos piezas que van juntas:

| Variable | Dónde | Valor correcto en producción |
|---|---|---|
| `PROXY_DE_CONFIANZA` | apps Next | `1` **solo** si hay un proxy propio delante que reescriba `X-Forwarded-For`. Con `0`, el `proxy.ts` de cada app borra las cabeceras de reenvío que mande el navegador |
| `TRUST_PROXY` | `api-core` y `geo-service` | `2` en la topología documentada (navegador → proxy TLS → Next → servicio). Es un **número de saltos contados desde el servicio**, no un interruptor |

`TRUST_PROXY` admite `0` (no mirar la cabecera), un número de saltos, o una lista de IP/CIDR.
`true` y `*` **ya no se aceptan**: con ellos Fastify tomaba el valor más a la izquierda de
`X-Forwarded-For`, que es exactamente el que escribe el cliente.

- [ ] El proxy TLS reescribe `X-Forwarded-For` (en nginx, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`).
- [ ] `TRUST_PROXY` coincide con el número real de saltos. Comprobarlo mirando qué IP registra
      un `429` en los logs: si todas las peticiones comparten `ip_hash`, el valor es demasiado bajo.

## Base de datos

- [ ] PostgreSQL 18 + PostGIS 3.6 **real**, no PGlite (ver [ADR 0003](../decisiones/0003-pglite-solo-en-local-y-pruebas.md)).
- [ ] Migraciones aplicadas con `pnpm db:migrate`. Son idempotentes y llevan su propio registro.
- [ ] `PENDIENTE` Ejecutar la suite completa contra ese PostgreSQL antes de abrir.
- [ ] Conexiones cifradas (`sslmode=require` en `DATABASE_URL`).

### Roles de aplicación con privilegios mínimos

Hasta la auditoría de seguridad del 2026-09-19, api-core y geo-service se conectaban **los dos**
con el rol `curichi`, que era `SUPERUSER` con `CREATEROLE`, `CREATEDB` y `BYPASSRLS`. Con ese rol,
cualquier ejecución de SQL no prevista dejaba de ser «leer una tabla de más» y pasaba a ser control
del servidor: `COPY ... PROGRAM` ejecuta órdenes del sistema operativo. Y geo-service, que por
contrato (§4.6) solo lee, podía borrar la tabla de reportes.

Ahora hay tres roles y **ningún servicio usa el del esquema**:

| Rol | Lo usa | Privilegios |
|---|---|---|
| `curichi` | migraciones, seeds, ETL | dueño del esquema (DDL) |
| `curichi_api` | api-core | DML tabla por tabla, migración 0008 |
| `curichi_geo` | geo-service | `SELECT` sobre cinco tablas |

- [ ] `API_DB_PASSWORD` y `GEO_DB_PASSWORD` definidas **antes** de crear el volumen de PostgreSQL:
      las lee `infra/sql/01-roles.sh`, que solo se ejecuta al inicializar.
      Generalas con `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
- [ ] `DATABASE_URL` de cada servicio apunta a **su** rol, no a `curichi`. En el Compose ya es así;
      fuera de él, `API_DATABASE_URL` y `GEO_DATABASE_URL`.
- [ ] `pnpm privilegios` en verde contra la base real. Compara la matriz efectiva con la
      documentada y falla si sobra o falta un permiso.
- [ ] Ningún rol de aplicación es `SUPERUSER`, ni dueño de tablas, ni puede `CREATE` en un esquema.
      Los servicios lo comprueban al arrancar y **en producción se niegan a servir** si lo son.

**Sobre una base que ya existe** (el volumen no se vuelve a inicializar), el procedimiento manual
está en [`manual.md`](manual.md#roles-de-aplicación-en-una-base-que-ya-existe).

**Si añadís una tabla**, la migración tiene que conceder el permiso explícitamente: no hay
`ALTER DEFAULT PRIVILEGES` a propósito, para que una tabla nueva empiece cerrada y el fallo se vea
en la primera prueba en vez de quedar abierta sin que nadie lo decida.

## HTTP y red

- [ ] TLS terminado en un proxy propio; `TRUST_PROXY` y `PROXY_DE_CONFIANZA` según la sección anterior.
- [ ] `geo-service` **no** expuesto a internet: solo api-core y las apps lo necesitan.
- [ ] Puertos de base de datos y almacenamiento sin publicar a la red.
- [ ] Cabeceras: las aplican las apps Next y los dos servicios (CSP, `nosniff`, `X-Frame-Options`,
      `Referrer-Policy`, `Permissions-Policy`). Comprobar que el proxy no las pise.
- [ ] **El panel y la app pública, en nombres de dominio distintos.** La cookie de sesión se emite
      sin atributo `Domain`, así que queda atada al host que la puso… pero las cookies **no
      distinguen puertos**: `panel.ejemplo:3100` y `ejemplo:3000` son el mismo host para el
      navegador. Servir las dos aplicaciones desde el mismo nombre (aunque sea en puertos o rutas
      distintas) hace que el navegador mande la sesión del técnico también a la app pública.
      No es un agujero abierto —la app pública manda `credentials: 'omit'` en todas sus
      peticiones, justamente por esto— pero es una capa menos.
- [ ] Al poner el `Domain` de la cookie, **no usar el dominio padre** (`.ejemplo.bo`): eso la
      repartiría a todos los subdominios, incluida la app pública.

## Datos personales (§13)

- [x] `ip_hash` con sal y rotación diaria; borrado a los 30 días por el trabajo de mantenimiento.
- [x] Sesiones caducadas, fotos huérfanas, intentos de login y claves de idempotencia se limpian
      solos cada 6 h.
- [x] Ninguna IP en claro en los logs.
- [x] De un reporte marcado como *vivienda o predio*, la vista pública no publica ni la dirección
      aproximada ni `manzana_id`. La manzana se quitó al integrar las capas reales: es un polígono
      de unos 100 m de lado y el desplazamiento público llega a 30 m, así que publicar las dos
      cosas juntas dejaba la vivienda en la intersección de las dos, bastante más estrecha que el
      desplazamiento solo. En vía pública sí se publica: ahí el punto ya sale en su sitio.
- [ ] `PENDIENTE` Retención acordada con el municipio (§16, punto 11 de `CLAUDE.md`).
- [ ] `PENDIENTE` Respaldos cifrados: contienen correos de técnicos y coordenadas exactas.

## Respaldo y recuperación

Ver [respaldo-y-restauracion.md](respaldo-y-restauracion.md). Antes de abrir:

- [ ] `PENDIENTE` Respaldo automático fuera de la máquina que corre la base.
- [ ] `PENDIENTE` Una restauración de prueba hecha de verdad y cronometrada.
- [ ] `PENDIENTE` RPO y RTO acordados. Sin ellos, «hacemos respaldos» no significa nada.

## Observabilidad

Ver [observabilidad.md](observabilidad.md).

- [x] `/health`, `/ready`, `/metrics`, `X-Request-Id` de punta a punta.
- [x] `/ready` de api-core informa de `db`, `geo` y `fotos`, y marca `degradado` cuando alguno
      falla sin que el fallo impida servir el mapa. Solo la base lo lleva a 503: es lo único que
      esta réplica no puede suplir. Con MinIO parado responde
      `{"ok":true,"db":"ok","geo":"ok","fotos":"error","degradado":true}`, que es lo que hay que
      vigilar para enterarse de que no se pueden subir ni ver fotos.
- [ ] `PENDIENTE` Prometheus (u otro) recogiendo `/metrics`.
- [ ] `PENDIENTE` Alertas: 5xx, p95, `/ready` caído, caída de reportes creados.
- [ ] `PENDIENTE` Retención y envío de logs.

## Arranque y parada

- [x] Los servicios esperan a la base al arrancar (`esperarBaseDeDatos`) y salen con código 1 si
      no aparece: el orquestador reintenta.
- [x] `SIGINT`/`SIGTERM` cierran el servidor HTTP y el pool antes de salir.
- [x] Dockerfiles de `api-core` y `geo-service` (`infra/docker/servicio.Dockerfile`, perfil
      `servicios` del Compose): construidos y ejecutados. La pila completa —PostGIS 18 + PostGIS
      3.6, MinIO, los dos servicios— corrió con los cuatro contenedores en `healthy` durante la
      integración de las capas reales, incluyendo el ETL, el respaldo y la prueba de dos réplicas.
- [ ] Varias réplicas: **cuidado**, hoy hay estado en memoria de proceso. Ver abajo.

### Qué pasa con más de una réplica

| Estado en memoria | Consecuencia con N réplicas | Gravedad |
|---|---|---|
| Rate limit de `@fastify/rate-limit` | Cada réplica cuenta por su lado: el límite efectivo se multiplica por N | Media. Se resuelve con el `redis` que soporta el plugin |
| Métricas del registro propio | Cada réplica expone las suyas; Prometheus las suma | Ninguna, es lo esperado |
| Caché de capas y de agregados de `geo-service` | Cada réplica tiene la suya; se invalidan por separado | Baja. `/capas/invalidar` habría que mandarlo a todas |
| Serialización del recálculo completo | Es por proceso, pero el incremental usa `pg_advisory_xact_lock`, que **sí** es global | Ninguna para el camino normal |

El freno de fuerza bruta del login **no** está en memoria: vive en la tabla `intento_login`, así
que funciona igual con N réplicas.

## Antes de abrir al público

- [x] Los seeds sintéticos ya **no corren** con `NODE_ENV=production`: `sembrarSamples` falla de
      entrada. Creaban `admin@curichi.local` y `tecnico@curichi.local` con contraseñas
      documentadas y borraban los reportes de muestra.
- [ ] Aun así, comprobar que esos dos usuarios no existen en la base de producción.
- [ ] Crear el primer usuario admin real y verificar que entra.
- [ ] Cargar y **activar** la versión de capas del municipio desde el panel.
      Al activar una versión nueva, los navegadores que ya tengan la app instalada tardan hasta
      5 minutos en cambiar de capa: es la ventana de frescura del service worker, que revalida con
      el `ETag` que publica geo-service. No hay que borrar nada a mano.
- [ ] Revisar los parámetros de dominio con el técnico municipal (`CLAUDE.md` §16, punto 7):
      matriz de severidad, radio de 25 m, jitter de 30 m, rate limit de 10 reportes/hora.
- [ ] Mapa base propio: ver la sección «El mapa base» más abajo. **Es un bloqueador para abrir al público.**

## El mapa base: lo único del mapa que no es nuestro

Las capas administrativas y los puntos salen del propio sistema. El fondo sobre el que se dibujan,
no: hoy son las teselas raster del servidor estándar de OpenStreetMap.

**Dónde está configurado.** En un solo sitio por aplicación, dentro del estilo de MapLibre:

| Archivo | Qué declara |
|---|---|
| `apps/web-ciudadano/src/componentes/Mapa.tsx` | `sources.base.tiles = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']`, `maxzoom: 19` y la atribución |
| `apps/panel-admin/src/componentes/Mapa.tsx` | Lo mismo |
| `apps/*/next.config.ts` | `tile.openstreetmap.org` en `img-src` **y** en `connect-src` de la CSP: MapLibre 6 pide las teselas con `fetch`, así que con solo `img-src` el mapa base queda en negro |

**Atribución.** Está puesta y visible: el estilo declara
`© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors` y el control
de atribución de MapLibre la muestra en el mapa. Eso cubre el requisito de la licencia ODbL.

**Por qué no sirve para producción.** La *Tile Usage Policy* de la OSMF describe ese servidor como
un recurso costeado por donaciones para uso de desarrollo y de proyectos pequeños, y desaconseja
expresamente apoyar en él aplicaciones con tráfico. No es un límite técnico que se pueda subir
pagando: es que no es el sitio. Una aplicación municipal abierta a los vecinos de Santa Cruz no
entra en ese uso.

**Qué hace falta, y qué NO hay que inventar.** Ninguna de las opciones necesita cambiar el código
del mapa más allá de la URL del origen y la línea de atribución; lo que necesitan es una decisión
y, en dos de los tres casos, una cuenta que el municipio debe abrir. Aquí no se ha creado ninguna
ni se ha escrito ninguna credencial de ejemplo.

| Opción | Qué hay que conseguir | Qué cambia en el código |
|---|---|---|
| Extracto de Protomaps auto-hospedado | Un `.pmtiles` de Bolivia o de Santa Cruz y un sitio donde servirlo con *range requests* | El origen pasa de `raster` a `vector` con protocolo `pmtiles://`, y hay que elegir un estilo vectorial. `pmtiles` ya está en las dependencias |
| OpenFreeMap | Nada que pagar; confirmar que su política admite este uso | Igual que arriba, con la URL de su estilo |
| Proveedor comercial (MapTiler, Stadia…) | Cuenta y clave de API del municipio | Solo la URL del origen y la clave, por variable de entorno. **No inventar la clave**: hoy no existe |

Mientras no se decida, el mapa sigue funcionando con OpenStreetMap, que es lo correcto para
desarrollo y para la demostración al municipio, y el cambio sigue siendo de una tarde.

## ¿Hacen falta PMTiles o un CDN para las capas?

**Todavía no.** La decisión razonada, con los números:

| Dato | Valor |
|---|---|
| Capa más pesada (manzanas, entrega real del municipio) | 27 527 features en PostGIS; 27 434 en el GeoJSON de render, **15,5 MB** |
| Cómo se sirve hoy | `geo-service` la carga una vez en memoria y corta teselas al vuelo con `geojson-vt` + `vt-pbf` |
| Memoria del proceso con las tres capas cargadas | 256 MB de los 1024 MB del contenedor |
| Construcción de las tres cachés en frío | 2,2 s (primera petición a `/geo/v1/capas`) |
| Coste medido de una tesela con los datos reales | z14 sobre el centro: 41 KB, p50 11,1 ms · z16: 3,6 KB, p50 7,0 ms |
| Cada cuánto cambia la capa | Cuando el municipio entrega una versión nueva: **una o dos veces al año** |
| Cacheabilidad | `Cache-Control: public, max-age=300` y `ETag` por `version_capa` |

> El GeoJSON de render pasó de 26,9 MB a 15,5 MB al dejar en él solo los campos que el mapa
> dibuja (`id`, `codigo`, `nombre`, `tipo`, `version_capa`, `distrito_id`,
> `unidad_vecinal_id`). De los 26,9 MB originales, **16,2 MB eran propiedades y 8,9 MB
> geometría**: el resto era la cadena de `fuente` repetida 27 000 veces, las fechas de edición
> del origen y `SHAPE_STAr`, que no dibuja nadie y sin embargo viajaban dentro de cada feature de
> cada tesela. Los atributos originales siguen enteros en `<capa>.full.geojson`, que es lo que se
> carga a PostGIS.

Con esos números, precompilar PMTiles y poner un CDN delante **no compra nada** y sí añade: un
paso más al ETL, un artefacto binario que versionar o publicar, y un sitio más donde algo puede
quedar desactualizado cuando se activa una versión de capa.

Lo que sí conviene hacer, y es mucho más barato:

1. **Subir el `max-age` de las teselas.** Cinco minutos es un valor de desarrollo. Como la URL ya
   lleva el `ETag` con `version_capa`, se puede servir con `max-age=31536000, immutable` y forzar
   la recarga cambiando la versión. Un CDN por delante, si lo hay, hace el resto solo.
2. **Reverse proxy con caché** (nginx, Cloudflare) sobre `/geo/v1/teselas/*`: quita del servicio
   la mayor parte del tráfico sin tocar una línea de código.

**Cuándo replantearlo.** Si aparece alguna de estas, PMTiles empieza a tener sentido:

- La capa de manzanas crece por encima de ~100 MB, o se añaden capas nuevas (red de drenaje,
  sumideros) y el conjunto no cabe cómodo en memoria del proceso.
- Se despliegan varias réplicas de `geo-service`: hoy cada una mantendría su propia copia de la
  capa en memoria, y ahí un artefacto estático compartido sí sale a cuenta.
- La latencia de tesela deja de estar en milisegundos en las mediciones reales de producción.

La arquitectura ya es compatible con el cambio: `geo-service` decide entre GeoJSON y teselas por
tamaño (`UMBRAL_TESELAS_BYTES`) y el frontend consume una URL de plantilla `{z}/{x}/{y}`, que es
la misma que serviría un CDN o un archivo PMTiles.

---

# Escalabilidad: lo que se midió y a partir de dónde duele (Fase 4)

Todo lo de esta sección son números tomados contra **PostgreSQL 18.6 + PostGIS 3.6.4 reales** en
Docker, con las imágenes del proyecto construidas y corriendo, no contra PGlite. Donde algo no se
pudo medir, se dice.

## Presupuestos internos de ingeniería

No son un SLA con nadie: son las líneas que, al cruzarse, obligan a mirar. Se eligieron a partir
de lo medido, con margen.

| Qué | Presupuesto | Medido hoy (1 000 000 de reportes) |
|---|---|---|
| `GET /api/v1/reportes` p95, 10 concurrentes | < 300 ms | 110 ms |
| `GET /api/v1/reportes?bbox=` p95, 10 concurrentes | < 800 ms | 84 ms (con 6 CPU en la base) |
| `POST /api/v1/reportes` p95, 48 concurrentes | < 500 ms | 203 ms |
| `POST /geo/v1/resolver` (point-in-polygon) p95 | < 100 ms | 17,7 ms a 10 concurrentes |
| Teselas desde caché p95 | < 100 ms | 5,4 ms a 10 concurrentes |
| Agregados por UV (consulta en frío) | < 1 s | 264 ms |
| Consulta más cara de la base, mediana | < 100 ms | 264 ms (agregados) — **fuera de presupuesto, ver abajo** |
| Bloqueo del bucle de eventos, peor caso | < 50 ms | 11,6 ms con 20 logins simultáneos |
| Arranque de un servicio hasta `healthy` | < 60 s | unos 25 s |
| Construcción de una imagen (caché caliente) | < 5 min | ~1 min |
| Recuperación desde respaldo, por GB | < 60 s | 19,6 s |

El agregado por unidad vecinal es el único que queda fuera de presupuesto, y es sabido: ver el
umbral de replanteo más abajo.

## Qué se rompe primero al crecer

Orden en que aparecen los problemas, según lo medido:

| Volumen | Qué empieza a doler | Qué hacer |
|---|---|---|
| ~10 000 | Nada. Todas las consultas por debajo de 6 ms. | — |
| ~100 000 | El agregado por UV llega a 47 ms. | Nada todavía. |
| ~1 000 000 | El agregado por UV llega a 264 ms (721 ms antes del índice de la migración 0007) y su ordenación se sale de `work_mem` a disco. El listado profundo (`OFFSET 5000`) sube a 24 ms. | Vigilar. La caché con revalidación en segundo plano hace que ningún usuario lo pague. |
| ~5 000 000 | El agregado pasaría del segundo y el `count(DISTINCT punto_critico_id)` escribe cada vez más temporales. | **Vista materializada** refrescada en segundo plano, no otro índice. |
| ~10 000 000 | El recálculo COMPLETO de puntos críticos (41,9 s con 750 000 publicables) pasaría de varios minutos. La tabla ronda los 5 GB y deja de caber en `shared_buffers`. | Recálculo por zonas en vez de global, y revisar el dimensionado de memoria de la base. |

## La base es el cuello de botella, y por bastante

Medido con el listado por bbox que pide el mapa, un millón de reportes:

| CPU del contenedor `postgis` | 10 concurrentes | 100 concurrentes |
|---|---|---|
| 2 CPU | 21 rps, p95 613 ms | 20 rps, p95 5 904 ms, **433 respuestas 503** |
| 6 CPU | **142 rps**, p95 84 ms | **117 rps**, p95 1 715 ms, **ningún 503** |

Mientras tanto `api-core` y `geo-service` estaban al **0,03 % de CPU**. Las métricas lo confirman
desde dentro: de los 21 143 s de tiempo HTTP acumulado en el listado, **21 244 s se fueron en
consultas**, o sea el 83 % de cada petición esperando a la base.

Consecuencias prácticas:

1. Al dimensionar, la CPU va a la base. Ahogar a `postgis` para "repartir" con servicios que están
   ociosos es tirar rendimiento.
2. **Agrandar el pool no ayuda si la base no tiene CPU.** Con 2 CPU, subir `DB_POOL_MAX` de 8 a 24
   empeoró las cosas (de 106 a 433 respuestas 503): más conexiones sobre los mismos núcleos es más
   contención, no más trabajo hecho. La regla útil es mantener el total de conexiones
   (`réplicas × DB_POOL_MAX`) en el entorno de 2 a 4 por núcleo de la base.
3. Añadir réplicas de API **no** sube el techo por sí solo. Lo que lo sube es CPU en la base y,
   después, réplicas de lectura.

## Varias réplicas: qué está resuelto y qué no

| Mecanismo | Aguanta N réplicas | Cómo |
|---|---|---|
| Migraciones al arrancar | **Sí** | `pg_advisory_xact_lock`, y desde la Fase 4 también la creación de la tabla de control. Probado con 8 réplicas simultáneas contra una base vacía, 3 rondas, 24 de 24 sin fallo. |
| Recálculo de puntos críticos | **Sí** | Advisory lock compartido (clave 4021) entre el camino incremental y el completo. |
| Trabajo de mantenimiento | **Sí** | `pg_try_advisory_lock` (clave 4023): la réplica que no lo consigue se salta la pasada. Además usa un pool propio para no competir con el tráfico. |
| Idempotencia de creación | **Sí** | `SELECT ... FOR UPDATE` más `INSERT ... ON CONFLICT`. Probado con 12 envíos simultáneos con la misma clave: un solo reporte. |
| Sesiones | **Sí** | Viven en la tabla `sesion`, no en memoria. |
| **Rate limiting** | **NO** | `@fastify/rate-limit` guarda los contadores **en memoria del proceso**. Con N réplicas el límite efectivo es N veces el configurado. Ver abajo. |
| Caché de capas de geo-service | **Sí, con matices** | Es por proceso, así que cada réplica reconstruye la suya: más memoria y más trabajo, pero sin inconsistencia. La invalidación explícita solo llega a una réplica; las demás se enteran solas en 10 s o menos por el TTL de `versionesVigentes`. |
| Caché de agregados | **Sí, con matices** | Igual: por proceso. Lo único que pasa es que N réplicas hacen N veces la consulta. |
| Métricas | **Sí** | Cada réplica expone las suyas y Prometheus las suma. |
| Fotos | **Sí, con `S3_ENDPOINT`** | `AlmacenS3` (Fase 5) las guarda en un servicio compatible con S3, así que todas las réplicas ven las mismas. Sin esa variable sigue usando `AlmacenDisco`, que es correcto **solo con una réplica**. Ver abajo. |

### Rate limiting con varias réplicas

Un atacante multiplica el límite por el número de réplicas: con 3 réplicas y 10 reportes por hora,
puede meter 30. **No se ha cambiado**, y la decisión es deliberada:

- Meter Redis solo para esto añade un servicio, un punto de fallo y una decisión incómoda (si
  Redis no responde, se abre o se cierra) a cambio de un factor 3 sobre un límite que ya es
  conservador.
- La alternativa sin dependencias nuevas es llevar los contadores a PostgreSQL, pero eso convierte
  cada petición limitada en una escritura contra el recurso que precisamente es escaso (ver arriba).
- El freno que de verdad importa, el de fuerza bruta del login, **ya está en la base**
  (`intento_login`), así que ese sí es global desde el primer día.

Lo razonable es poner el límite en el balanceador o el proxy de entrada, que ve todo el tráfico y
es donde ese trabajo cuesta menos. Si el municipio acaba necesitando límites finos por IP dentro
de la aplicación y ya hay un Redis en casa, entonces sí: `@fastify/rate-limit` acepta un almacén
Redis sin tocar el resto del código.

### Fotos: dos modos, y la elección es explícita

`api-core` decide al arrancar y lo dice en el log (`… · fotos en …`):

| `S3_ENDPOINT` | Implementación | Réplicas que aguanta |
|---|---|---|
| vacío | `AlmacenDisco` sobre `STORAGE_DIR` | **una**; con dos, una foto subida a la réplica A no existe para la B |
| definido | `AlmacenS3` | las que haga falta |

`AlmacenS3` (`services/api-core/src/almacen-s3.ts`, Fase 5) habla S3 directamente con `fetch` y
firma SigV4 con `node:crypto`: **no añade ninguna dependencia**. Solo hace PUT, GET y DELETE de un
objeto, que es todo lo que el proyecto necesita; las fotos las sigue sirviendo `api-core`, que es
quien sabe si el reporte está publicado (§13), así que **el bucket debe ser privado**.

Comprobado en la Fase 5 contra el MinIO del Compose: subida por `POST /api/v1/fotos`, el objeto
aparece en el bucket (`mc ls`), `GET /api/v1/fotos/:key` lo devuelve con sus bytes intactos y el
volumen del contenedor queda vacío. Con una credencial equivocada, el servicio **se niega a
arrancar** en vez de aceptar reportes y perder sus fotos de una en una.

Variables (ver `.env.example`):

```text
S3_ENDPOINT     origen del servicio. Hay dos por una razón concreta: desde la máquina
S3_ENDPOINT_DOCKER   es http://localhost:9000 y desde dentro del Compose, http://minio:9000.
S3_BUCKET       bucket privado; el Compose lo crea con `minio-init`
S3_ACCESS_KEY / S3_SECRET_KEY
S3_REGION       us-east-1 sirve para MinIO
S3_ESTILO_RUTA  1 = endpoint/bucket/clave (MinIO); 0 = bucket.endpoint/clave (AWS)
```

**Al cambiar de modo, las fotos ya guardadas no se mueven solas.** Si se pasa de disco a S3 con
fotos existentes, hay que copiar el contenido de `STORAGE_DIR` al bucket antes (los nombres de
objeto son los mismos), o las viejas darán 404 mientras las nuevas funcionan.

## Índices de la tabla de reportes y por qué está cada uno

Con un millón de reportes, `reporte_inundacion` tiene 15 índices. No es gratis: cada `INSERT` los
actualiza todos. El reparto:

| Índice | Para qué | Añadido en |
|---|---|---|
| `reporte_inundacion_pkey` | Clave primaria | 0001 |
| `reporte_geom_gist` | Consultas espaciales del técnico (coordenada exacta) | 0001 |
| `reporte_estado`, `reporte_uv`, `reporte_distrito`, `reporte_creado`, `reporte_punto_critico` | Filtros del listado | 0001 |
| `reporte_estado_creado` | Listado público: filtro por estado más orden por fecha | 0002 |
| `reporte_con_ip_hash`, `reporte_foto_huerfanas` | Retención (§13); parciales y pequeños | 0002 |
| `reporte_geom_publico_gist` | Listado público por bbox sobre la geometría **publicable** | 0005 |
| `reporte_sin_geom_publico` | Encontrar lo pendiente de rellenar sin recorrer la tabla | 0005 |
| `reporte_fusionado_en`, `reporte_autor`, `reporte_validado_por` | **Claves foráneas sin índice**: sin ellos, borrar reportes o usuarios era inviable | 0006 |
| `reporte_agregado_uv` | Agregado por UV con index only scan | 0007 |

Sobre la 0006: con un millón de reportes, un `DELETE` masivo **no terminó en 14 minutos** y hubo
que cancelarlo, porque la autorreferencia `fusionado_en_id` obligaba a recorrer la tabla entera
por cada fila borrada. Con los índices puestos, el mismo borrado de 2 000 000 de filas tardó
**22,2 s**.

## Límites conocidos que NO se han resuelto

| Qué | Estado | Por qué |
|---|---|---|
| Un solo punto crítico gigante | **Abierto** | Con un millón de reportes densos, DBSCAN con `minpoints = 1` encadenó los 750 021 publicables en **un solo** punto crítico. Es la limitación documentada en CLAUDE.md §9.2 llevada al extremo. El radio de 25 m es un parámetro de dominio que §16 (punto 7) deja pendiente de validar con el técnico municipal: no es una decisión de ingeniería. Lo que sí se arregló es que eso ya no revienta el proceso ni bloquea una petición HTTP. |
| Rate limiting por proceso | **Abierto, deliberado** | Ver arriba. |
| Fotos en disco local | **Resuelto en la Fase 5** | `AlmacenS3` existe, está probado contra MinIO y se activa con `S3_ENDPOINT`. Queda abierto solo el traslado de las fotos ya guardadas al cambiar de modo, que es una operación manual de una vez. |
| `CREATE INDEX` bloquea escrituras | **Aceptado** | Una migración que crea un índice toma un lock que impide escribir en la tabla. Medido: 0,95 s con 750 000 filas indexadas. A diez millones serían unos 10 s de escrituras bloqueadas. Si eso deja de ser tolerable, hace falta `CREATE INDEX CONCURRENTLY`, que no puede correr dentro de una transacción y obliga a cambiar el ejecutor de migraciones. |
