# api-core — Parte 3 (API y lógica de negocio)

Fastify + PostGIS. Único punto de escritura de reportes. Contratos en `packages/contracts` (OpenAPI en `/docs`).

| Ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/v1/reportes` | sesión (3 por cuenta, por día y por categoría; 10/h por IP; honeypot) | Acepta dos formas de cuerpo: la plana de hoy (= inundación) y `{ …núcleo, categoria, subtipo?, detalle }` (ver «Escrituras por categoría»). Una categoría inactiva o desconocida da 422 `CATEGORIA_NO_DISPONIBLE`, antes de resolver la UV y sin gastar cupo. Comprueba la posición del teléfono (`dispositivo`, ver abajo), resuelve UV en geo-service, calcula severidad con la definición de la categoría (§9.1 en Inundaciones) y crea en `nuevo`, en la tabla `reporte`, con `publicar_en` (ver «Publicación»). Reserva el turno de la categoría en `cupo_contador` (ver «Cupo diario»): agotado, 429 `CUOTA_DE_REPORTES` con `detalles.categoria`. Solo adjunta fotos subidas por la misma cuenta, sin reporte y de menos de 24 h (si no, 400 `FOTOS_INVALIDAS`). Responde `MiReporteFeature` (201, y 200 en el replay idempotente) |
| `GET /api/v1/reportes`, `GET /api/v1/reportes/:id` | público | `nuevo` (con `verificado: false`), `validado` y `resuelto` ya publicados (`publicar_en <= now()`); coordenadas redondeadas y con jitter si es vivienda; nunca el autor. En espera, rechazado o duplicado: 404. El listado filtra por `?categoria=` (sin el parámetro, `inundacion`) y ambas rutas devuelven `categoria`, `subtipo` y `detalle` recortado a los campos públicos de la categoría (ver «Categorías») |
| `GET /api/v1/tecnico/reportes(/:id)` | técnico, admin | Todos los estados, exactos, con los campos de moderación y el `detalle` completo; solo los ya publicados. El listado admite `?categoria=` (también `todas`) |
| `GET /api/v1/mis-reportes` | sesión | Los reportes de la cuenta (50 como máximo, los más recientes primero) en cualquier estado, también en espera, rechazados o fusionados (`retirado`), con `publicar_en` y `segundos_para_publicar`. `private, no-store` y `Vary: Cookie`. Son de todas las categorías, con `categoria` en cada uno |
| `PATCH /api/v1/reportes/:id/estado` | técnico, admin | Máquina de estados §7.3 con auditoría y recálculo de puntos críticos, sobre la tabla `reporte` (cualquier categoría). `validado → rechazado` (retirar del mapa un verificado) y reabrir un rechazado son de admin: al técnico, 403 `SIN_PERMISO`. Un reporte que espera su `publicar_en` da 404. `fusionado_en_id` acepta un UUID o el ID corto de 8 caracteres; si el canónico es de otra categoría, 409 `FUSION_ENTRE_CATEGORIAS` |
| `PATCH /api/v1/reportes/:id/severidad` | técnico, admin | Reclasificación manual con motivo (la calculada se conserva), de un reporte de cualquier categoría |
| `POST /api/v1/reportes/:id/fusionar` | técnico, admin | Marca duplicado de un canónico validado (`canonico_id`: UUID o ID corto). 409 `FUSION_ENTRE_CATEGORIAS` si el canónico es de otra categoría |
| `POST /api/v1/fotos` | sesión (cupo global `fotos:cuenta`: `FOTOS_POR_DIA_POR_CUENTA` = 12 por cuenta y por día entre todas las categorías, 30/h por IP) | Entra JPEG, PNG o WebP (por magic bytes) y sale siempre **WebP** (calidad `FOTO_CALIDAD_WEBP` = 80), 1600 px por lado como máximo sin agrandar, **sin EXIF, XMP ni perfil ICC** (se comprueba recorriendo el RIFF) y solo el primer cuadro de una imagen animada. Clave `<uuid>.webp`. Guarda quién la subió (`subido_por`). Sin cupo: 429 `CUOTA_DE_FOTOS` con `Retry-After` hasta la medianoche, antes de leer el archivo; si la foto no se guarda, el turno se devuelve. Con poco disco: 507 `SIN_ESPACIO` (ver «Guarda de disco») |
| `GET /api/v1/fotos/:key` | público, sesión opcional | Claves `<uuid>.webp` y `<uuid>.jpg` (las anteriores al contrato 0.8.0, que no se reconvierten y se sirven como `image/jpeg`); otra extensión, 404. La de un reporte público, cualquiera, con `public, no-cache` y `ETag` (`If-None-Match` da 304, pero la visibilidad se mira antes: una foto retirada da 404). El autor del reporte ve las suyas en cualquier estado, y técnico y admin las de un reporte ya publicado aunque esté rechazado o duplicado, con `private, no-store`. Una foto **sin reporte** solo la ve quien la subió, técnicos incluidos afuera. Todo lo demás, 404 con `private, no-store`. Para el público cuenta además que la categoría del reporte esté activa |
| `GET /api/v1/exportar?formato=csv\|geojson` | técnico, admin | Con nota metodológica. Admite `?categoria=` (también `todas`) y suma `categoria`, `subtipo` y `detalle` al final de las columnas del CSV y a las propiedades del GeoJSON |
| `GET /api/v1/indicadores` | técnico, admin | Conteos por estado, severidad, distrito, UV; puntos críticos recurrentes. Solo reportes publicados. Sin caché: los pedidos simultáneos comparten el cálculo en curso. Admite `?categoria=` (también `todas`), que acota también los puntos críticos recurrentes |
| `GET /api/v1/ejecutivo/resumen?ventana=7d\|30d\|todo` | ejecutivo, técnico, admin | Resumen del panel ejecutivo (`ResumenEjecutivoSchema`): totales, por severidad efectiva, por estado (`nuevo`/`validado`/`resuelto`; duplicados y rechazados no cuentan) y por distrito vigente (incluidos los que tienen 0). Solo reportes publicados; ventana sobre `creado_en`. Admite `?categoria=` (también `todas`). Sin caché, con deduplicación en vuelo por ventana y categoría; `Cache-Control: private, no-store` |
| `GET /api/v1/admin/capas`, `POST /api/v1/admin/capas/:id/activar` | técnico / admin | Versiones de capas; activar una (invalida la caché de geo-service) |
| `GET /api/v1/configuracion` | público | Ciudad del despliegue (`ConfiguracionPublicaSchema`: nombre, país, zona horaria, locale, centro y zoom inicial del mapa) y `categorias_activas` (los slugs activos, en el orden del catálogo). Una instalación es una ciudad; los frontends la leen en tiempo de ejecución en vez de fijarla al compilar. `Cache-Control: public, max-age=300` |
| `POST /api/v1/auth/registro` | público | Alta de cuenta ciudadana. Freno por IP: `REGISTRO_MAX_POR_IP` por hora y `ALTAS_POR_DIA_POR_IP` (10) por día de la ciudad, contados en la base (429 `DEMASIADAS_CUENTAS`) |
| `POST /api/v1/auth/login`, `logout`, `GET /api/v1/auth/yo` | | Sesión por cookie `curichi_sesion` (httpOnly, SameSite=Lax); contraseñas con Argon2id. `/auth/yo` agrega `reportes_restantes_hoy`, `puede_reportar_desde` (null, o la próxima medianoche local si no le quedan) y `demora_proximo_s` (60 o 240), que son los de **inundación**; `cupos` (`{ <categoria>: { restantes, demora_proximo_s, puede_reportar_desde } }`, una entrada por categoría activa) y `fotos_restantes_hoy` (el cupo de fotos es global); y `panel_url` (URL de `apps/panel-admin`, o `null` si no se configuró) solo para `tecnico`, `admin` y `ejecutivo`; al ciudadano no se le manda ese campo |
| `GET /health`, `GET /ready`, `GET /docs` | | `/ready` (`ReadyApiCoreSchema`): 503 solo sin base; `fotos: 'error'` o `'poco_espacio'` y `degradado: true` siguen en 200 |

**Roles.** `ciudadano` (alta pública), `tecnico`, `admin` y `ejecutivo` (contracts 0.5.0; se asigna
fuera de `/auth/registro`). El ejecutivo inicia sesión, puede reportar y subir fotos como cualquier
sesión y ve `/api/v1/ejecutivo/resumen`; recibe 403 `SIN_PERMISO` en `/api/v1/tecnico/*`,
`/api/v1/exportar`, `/api/v1/indicadores`, `/api/v1/admin/*` y en toda la moderación.

**Sondeo.** Una petición con la cabecera `x-curichi-sondeo: 1` (la mandan los paneles técnico y
ejecutivo en su consulta automática) valida la sesión pero no renueva `ultimo_uso_en`: si no, un
panel abierto mantenía viva la sesión para siempre y la caducidad por inactividad
(`SESION_IDLE_HORAS`, 12 h) no llegaba nunca.

**Cupo diario (contracts 0.10.0; por categoría desde la corrida M3b, 0.20.0, [ADR 0017](../../docs/decisiones/0017-cupo-por-categoria-configurable.md)).**
Cada cuenta tiene un cupo de reportes **por categoría** y uno de fotos **global**, por día
calendario en `ZONA_HORARIA`. Se cuentan en la base, en `cupo_contador` (`usuario_id`, `clave`,
`ventana_inicio`, `n`; migración 0020), con un `INSERT … ON CONFLICT DO UPDATE … WHERE n < máximo`
atómico (`src/cuota.ts`: vale igual con varias réplicas):

| Cupo | Clave en `cupo_contador` | Límite por cuenta y por día |
|---|---|---|
| Reportes | `reportes:<categoria>` (p. ej. `reportes:inundacion`) | El de la regla de cupo de la categoría (`cupo.limite`: 3 en Inundaciones). Si se define `REPORTES_POR_DIA_POR_CUENTA`, ese valor lo reemplaza **en todas las categorías** de la instalación |
| Fotos | `fotos:cuenta` | `FOTOS_POR_DIA_POR_CUENTA` (12), sumando todas las categorías |

Las dos variables son enteros de 1 a 10 000; presente pero inválida, el servicio no arranca. Cada
categoría cuenta en su propia fila: agotar Inundaciones no toca el cupo de otra. `ventana_inicio`
es la medianoche local de hoy, calculada en SQL con la zona de la instalación y no con
`current_date` (que en una sesión de PostgreSQL en UTC cambiaría el día a las 20:00 en La Paz).

El turno de reporte se reserva dentro de la transacción del reporte y después de la idempotencia:
un replay no gasta turno, y un envío que falla (por ejemplo `FOTOS_INVALIDAS`) lo devuelve con el
`ROLLBACK`. El número que devuelve el contador de la categoría es el del reporte del día **en esa
categoría** y fija la demora de publicación (60 s el 1.º, 240 s el 2.º y el 3.º; ver «Publicación»).
El turno de foto se reserva antes de leer la imagen, en su propia sentencia, y se devuelve (en la
ventana en que se reservó) si la foto no se guarda; borrar fotos huérfanas no devuelve turnos.
Agotado: 429 `CUOTA_DE_REPORTES` («Ya enviaste los N reportes de hoy. Vas a poder enviar otro
mañana.», con `detalles.categoria`) o 429 `CUOTA_DE_FOTOS`, con `Retry-After` hasta la medianoche
local y `detalles.disponible_en` con el desfase de la ciudad. `GET /auth/yo` lee los mismos
contadores (solo lectura, `leerCupos`) para mostrar cuántos quedan: es cortesía, la autoridad es el
contador al crear. El mantenimiento borra las ventanas de días anteriores. La clave de idempotencia
se guarda con el prefijo de la cuenta (`<usuario_id>:<clave>`): la misma clave en dos cuentas crea
dos reportes. `usuario.ultimo_reporte_en` ya no se lee ni se escribe (se quita en la 0016).

`cuota_reporte_diaria` (migración 0014) quedó **sin uso** desde M3b: nada la lee ni la escribe, pero
no se borra hasta M10 (el mantenimiento sigue limpiando sus días viejos).

**Reglas de cupo al arrancar (falla cerrado).** `src/servidor.ts` llama a
`verificarReglasDeCupoActivas` después de comprobar los privilegios de la base y antes de escuchar.
Lee del catálogo las categorías activas, pide cada definición al registro y
`validarReglasDeCupo` lanza si alguna trae un `ambito` distinto de `cuenta+categoria` o una
`ventana` distinta de `dia_local`: no se arranca, porque cobrar mal (o no cobrar) un control
antiabuso es peor que no servir.

**Publicación (contracts 0.11.0, ADR 0006).** No hay moderación previa: un reporte se publica
cuando llega su `publicar_en`, que se fija al crearlo con el número de reporte del día **de la
categoría** que devuelve el contador del cupo (`reportes:<categoria>`), en la misma transacción:
60 s el 1.º del día de la cuenta en esa categoría (`DEMORA_PUBLICACION_PRIMERO_S`) y 240 s el 2.º y
el 3.º. Mientras espera no lo ve nadie más que su autor, técnicos incluidos: ni en
las vistas pública y técnica, ni en la exportación, los indicadores, el resumen ejecutivo o las
fotos, y moderarlo da 404. La regla vive en `src/visibilidad.ts` (`condicionPublico`, con el
literal de `ESTADOS_PUBLICOS` para que PostgreSQL use los índices parciales de la 0015, y
`condicionPublicado`). `REPORTE_DEMORA_PRIMERO_S` y `REPORTE_DEMORA_SIGUIENTES_S` (0 a 3600) existen
solo para las pruebas: `test/ayudas.ts` (`configDePrueba`) arranca con 0 y 0, y en producción
definirlas deja un aviso en el log del arranque. La métrica
`curichi_reportes_sin_verificar_antiguedad_segundos` dice cuánto hace que está publicado el `nuevo`
más viejo (0 si no hay), para la alerta `BandejaSinVerificarAtrasada`.

**Guarda de disco (contracts 0.13.0).** Con las fotos en disco, si queda menos que
`FOTOS_MIN_LIBRE_BYTES` (2 GiB por defecto; 0 la apaga) según `statfs` del directorio de fotos,
`POST /fotos` responde 507 `SIN_ESPACIO` antes de leer la imagen y sin gastar cupo, y `/ready` sale
con `fotos: 'poco_espacio'` y `degradado: true`. En la VPS ese disco es también el de PostgreSQL.
`/metrics` expone `curichi_fotos_disco_libre_bytes`, `curichi_fotos_disco_total_bytes` (los de las
alertas `DiscoDeFotos*`) y `curichi_fotos_disco_min_libre_bytes` (el umbral configurado), leídos
en cada scrape. Con S3 no hay guarda ni esas métricas.

**Posición del teléfono (contracts 0.9.0).** `POST /api/v1/reportes` exige `dispositivo`
(`{ lat, lon, precision_m, antiguedad_s }`). Después de Zod y antes de resolver la UV se revisa, en
este orden (`src/ubicacion-dispositivo.ts`):

- precisión mayor a `PRECISION_DISPOSITIVO_MAX_M` (50 m): 422 `PRECISION_INSUFICIENTE`;
- antigüedad mayor a `POSICION_ANTIGUEDAD_MAX_S` (600 s): 422 `POSICION_VENCIDA`;
- punto a más de `REPORTE_RADIO_DISPOSITIVO_M` (60 m) + `REPORTE_RADIO_TOLERANCIA_M` (0,5 m, por
  el redondeo de las coordenadas) del teléfono: 422 `UBICACION_FUERA_DE_RADIO`.

Ninguno gasta cupo y los tres suman a `curichi_reportes_fuera_de_radio_total{codigo}`. Se guardan
solo `precision_gps_m` (la precisión declarada), `distancia_dispositivo_m` (redondeada al metro y
nunca mayor que el radio) y `ubicacion_metodo`, que deriva el servidor: `gps` si el punto quedó
dentro del margen de error del teléfono (a `max(2 m, precision_m)` o menos), `manual` si quedó más
lejos. El margen hace falta porque el punto que puso el GPS en el paso 1 y la posición releída al
enviar difieren unos metros aunque nadie lo mueva. La posición del teléfono no queda en la fila,
ni en la auditoría, ni en la huella de idempotencia (un reintento que relee el GPS devuelve el mismo reporte), ni en el log: el
logger oculta cualquier clave `dispositivo` (`RUTAS_OCULTAS_DEL_LOG` en `src/registro.ts`). La
exportación CSV suma la columna `distancia_dispositivo_m`.

**Errores.** Los 4xx que genera Fastify antes de la ruta (JSON mal formado, cuerpo demasiado
grande, tipo de contenido sin parser) salen con código propio y el mismo estado:
`PAYLOAD_INVALIDO` (400), `PAYLOAD_DEMASIADO_GRANDE` (413), `TIPO_DE_CONTENIDO_NO_ADMITIDO` (415),
`PETICION_INVALIDA` (resto). El código interno (`FST_*`) va solo al log.

**geo-service.** Todas las llamadas llevan `x-token-interno` (`GEO_TOKEN_INTERNO`): con él, el
resolver queda fuera del cupo por IP de geo-service. En producción es obligatorio y de al menos 32
caracteres (el servicio no arranca sin él). Si la invalidación de capas falla, queda un aviso en
el log y la métrica `curichi_geo_invalidacion_fallida_total`.

**Ciudad del despliegue.** Una instalación de Mi Curichi es una ciudad; lo que antes estaba fijado
en el JavaScript de cada frontend (centro del mapa, locale, nombre, zona horaria) se configura acá
con `CIUDAD_NOMBRE`, `CIUDAD_PAIS`, `CIUDAD_LOCALE`, `CIUDAD_CENTRO_LON`, `CIUDAD_CENTRO_LAT`,
`CIUDAD_ZOOM_INICIAL` y `ZONA_HORARIA`, y se publica en `GET /api/v1/configuracion`. Cada variable
vacía o ausente cae en Santa Cruz de la Sierra (`CONFIG_DOMINIO.CIUDAD_POR_DEFECTO`); una presente
pero inválida (un `CIUDAD_LOCALE=es_BO`, una `CIUDAD_CENTRO_LAT` fuera de rango) impide arrancar,
con el motivo. `PANEL_ADMIN_URL` (URL de `apps/panel-admin`, sin usuario ni contraseña) se
normaliza y viaja como `panel_url` en `/api/v1/auth/yo`; en producción es obligatoria y tiene que
ser `https`.

```bash
pnpm --filter api-core dev    # http://127.0.0.1:3001
pnpm --filter api-core test   # PostGIS efímero + resolver falso: camino crítico, estados, privacidad, export, rate limit, EXIF
```

**Desarrollo con PostgreSQL en Docker.** `dev` carga el `.env` de la raíz si existe
(`tsx watch --env-file-if-exists=../../.env`); lo que ya esté definido en la terminal manda sobre
el archivo. La URL de la base es `API_DATABASE_URL` y, si está vacía o no existe, `DATABASE_URL`.
En el `.env` raíz, `DATABASE_URL` es la del rol dueño del esquema (migraciones, seeds, ETL), así que
para que api-core use su rol de privilegios mínimos hay que definir ahí
`API_DATABASE_URL=postgresql://curichi_api:<API_DB_PASSWORD>@localhost:5432/curichi`. Sin ella se
conecta como dueño y el arranque lo avisa. Con `S3_ENDPOINT` en ese `.env`, las fotos van a MinIO en
lugar del disco.

Las pruebas de concurrencia contra PostgreSQL real (`cuota-concurrencia-pg.test.ts` y
`fotos-cuota-concurrencia-pg.test.ts`) se omiten salvo que se defina `DATABASE_URL_PG_REAL` (URL de
administración; cada una crea y borra su propia base temporal). Ejercitan el *upsert* de
`cupo_contador`: envíos simultáneos que dejan exactamente el cupo, dos cuentas que no se estorban y,
en la de reportes, dos categorías a la vez (una categoría sintética activa) con su cupo cada una.

Fotos en local: `infra/.storage/fotos/` (adaptador `AlmacenDisco`). En Fase 2, adaptador S3/MinIO con la misma interfaz.

## Categorías (plataforma multitemática)

Desde `contracts` 0.20.0 (ver el [CHANGELOG](../../packages/contracts/CHANGELOG.md)) api-core trabaja
por categoría sobre la tabla `reporte`: las **lecturas** (corrida M3a) con un filtro `categoria`
explícito y las **escrituras** (corrida M3b: crear, cupo, fotos, `/auth/yo` y moderación) con la
categoría del reporte (ver «Escrituras por categoría»). El
núcleo es común a todas las categorías ([ADR 0009](../../docs/decisiones/0009-nucleo-y-registro-de-categorias.md)),
no hay `/api/v2` y sin el parámetro todo se comporta como antes
([ADR 0012](../../docs/decisiones/0012-compatibilidad-de-api.md)), y los datos se piden por categoría
([ADR 0013](../../docs/decisiones/0013-mapa-unico-con-datos-por-categoria.md)). El registro de
`contracts` define hoy solo Inundaciones (`REGISTRO_CATEGORIAS`), así que es la única categoría que
puede estar activa.

### El parámetro `categoria`

Lo lee `CategoriaFiltroSchema` (`packages/contracts/src/esquemas/comunes.ts`) en la query de las rutas de
lectura:

| Valor | Resultado |
|---|---|
| Ausente o vacío | `inundacion` (valor por defecto) |
| Un slug o un alias: `inundacion`, `inundaciones`, `baches`, `area-verde`, `Área Verde`… | El slug canónico (`inundacion`, `bache`, `area_verde`, `basura`). Los alias admiten plural, guion o guion bajo, mayúsculas y tildes |
| `todas` | Sin filtro de categoría. Solo lo admiten las rutas del panel |
| Cualquier otro valor | Categoría desconocida |

El esquema solo normaliza; si la categoría está activa lo decide el servidor (ver más abajo). Qué rutas
lo aceptan y qué responden:

| Ruta | `categoria` | Comportamiento |
|---|---|---|
| `GET /api/v1/reportes` | Sí, pública | Exige **una** categoría activa. Desconocida, inactiva o `todas`: 400 `CATEGORIA_NO_DISPONIBLE` |
| `GET /api/v1/reportes/:id` | No | Sirve el reporte público de cualquier categoría activa. Si es de una categoría inactiva, 404 como uno oculto. El ID corto de 8 caracteres es global, no de una categoría |
| `GET /api/v1/tecnico/reportes`, `GET /api/v1/exportar`, `GET /api/v1/indicadores`, `GET /api/v1/ejecutivo/resumen` | Sí, del panel | Admiten `todas` y cualquier categoría **conocida**, esté activa o no. Una desconocida da 400 `FILTROS_INVALIDOS` (`categoria: la categoría indicada no existe.`) |
| `GET /api/v1/tecnico/reportes/:id` | No | Cualquier categoría; solo reportes ya publicados |
| `GET /api/v1/mis-reportes` | No | Los de la cuenta, de todas las categorías |
| `GET /api/v1/fotos/:key` | No | Para el público depende de que la categoría del reporte esté activa; el autor y los técnicos siguen viendo la foto |
| `GET /api/v1/configuracion` | No | Suma `categorias_activas` |

La categoría se suma a los filtros que cada ruta ya tenía. En `GET /indicadores` el filtro también acota
`puntos_criticos_recurrentes` (por `punto_critico.categoria`), y la deduplicación en vuelo de indicadores y
del resumen ejecutivo distingue la categoría pedida.

**Respuestas.** Las tres vistas (pública, técnica y del autor) traen `categoria`, `subtipo` y `detalle`
además de los campos planos de inundación, que siguen hasta la contracción (M10). La vista **pública**
recorta el `detalle` a los `camposPublicos` de la definición de la categoría (`detallePublico` en
`src/vistas.ts`; para inundación, `profundidad_estimada`, `frecuencia` y `causa_presunta`), y sin
definición en el registro va vacío. La técnica y la del autor llevan el `detalle` completo. La
exportación suma `categoria`, `subtipo` y `detalle` (JSON) al final de las columnas del CSV y a las
propiedades del GeoJSON; en una categoría que no es inundación las columnas de dominio de inundación
quedan vacías.

**Métricas y mantenimiento.** `curichi_reportes_sin_verificar_antiguedad_segundos` mira los `nuevo`
publicados de **todas** las categorías (la alerta `BandejaSinVerificarAtrasada` vale para todas), y el
mantenimiento (relleno de `geom_publico`, puntos críticos pendientes) recorre la tabla `reporte` entera.

### Cómo se decide si una categoría está activa

Lo decide `src/categorias.ts` (`crearProveedorCategorias`, disponible como `app.categorias`). Una categoría
está **activa** cuando se cumplen las dos cosas:

1. el catálogo `categoria` la tiene con `activa = true`, y
2. el registro de categorías tiene su definición.

Si falta cualquiera de las dos cuenta como **inactiva** (falla cerrado). El caso que no debería pasar,
activa en el catálogo pero sin definición en el registro, deja un aviso en el log. La lista (en el orden
`orden` del catálogo) se recuerda `CATEGORIAS_ACTIVAS_TTL_MS` = 30 s, así que un cambio del catálogo se ve
en ese plazo sin reiniciar el proceso; un fallo de la base no se cachea. `app.categorias.invalidar()`
olvida la caché. La usan `GET /reportes`, el detalle público, `GET /fotos/:key`, `GET /configuracion`
y, desde M3b, `POST /reportes` (422 `CATEGORIA_NO_DISPONIBLE`) y `GET /auth/yo` (los `cupos`).

### Probar con una categoría sintética (`dep.registro`)

`crearApp(dep)` recibe el registro como dependencia opcional (`Dependencias.registro`). Sin él se usa
`REGISTRO_CATEGORIAS`, que es lo que hace `src/servidor.ts`. Para ejercitar el camino multicategoría sin
tocar `contracts`, una prueba arma un registro propio con `crearRegistroCategorias([...])` y lo pasa:

```ts
const app = await crearApp({ pool, cfg, resolver, almacen, registro: miRegistro });
```

Como la actividad exige catálogo **y** registro, la prueba también marca la fila del catálogo
(`UPDATE categoria SET activa = true WHERE slug = '…'`) y llama a `app.categorias.invalidar()` para que
la caché de 30 s lo vea ya. El ejemplo es `test/no-contaminacion-categoria.test.ts`: reportes de las
cuatro categorías en las mismas coordenadas, sin parámetro solo sale inundación y con la categoría
sintética activa salen solo los suyos.

### Escrituras por categoría (corrida M3b)

Desde la corrida M3b ([plan](../../docs/sdd/2026-10-09-cupo-por-categoria/plan.md)) crear y moderar
escriben en la tabla `reporte` con la categoría del reporte; ya no pasan por la vista de
compatibilidad `reporte_inundacion`. Como el registro solo trae Inundaciones, las otras categorías
existen todavía solo en las pruebas (registro inyectado y filas insertadas por SQL).

**Dos formas de cuerpo en `POST /api/v1/reportes`.** Es la nueva si trae `categoria` o `detalle`; si
no, es la plana de hoy, que crea una inundación idéntica a la de siempre
(`normalizarReporteCrear`, de `contracts`):

```jsonc
// Plana (= inundación). Los seis campos de dominio van sueltos.
{ "lat": -17.78, "lon": -63.18,
  "dispositivo": { "lat": -17.78, "lon": -63.18, "precision_m": 12, "antiguedad_s": 4 },
  "ubicacion_tipo": "via_publica", "descripcion": "Se junta agua frente a la escuela.",
  "profundidad_estimada": "rodilla", "frecuencia": "cada_lluvia_fuerte" }

// Por categoría. El núcleo es el mismo; lo propio de la categoría va en `detalle`.
{ "lat": -17.78, "lon": -63.18,
  "dispositivo": { "lat": -17.78, "lon": -63.18, "precision_m": 12, "antiguedad_s": 4 },
  "ubicacion_tipo": "via_publica", "descripcion": "Se junta agua frente a la escuela.",
  "categoria": "inundacion", "subtipo": null,
  "detalle": { "profundidad_estimada": "rodilla", "frecuencia": "cada_lluvia_fuerte" } }
```

El orden de las comprobaciones, antes de tocar el cupo: núcleo (400 `PAYLOAD_INVALIDO`), categoría
(422 `CATEGORIA_NO_DISPONIBLE` si es desconocida o está inactiva en el catálogo, sin gastar cupo),
`detalle` (400 `PAYLOAD_INVALIDO`), posición del teléfono (422, ver arriba) y UV (422
`FUERA_DE_COBERTURA`). Después, dentro de la transacción: idempotencia, turno de cupo y `INSERT`. La
huella de idempotencia incluye `categoria`, `subtipo` y `detalle` (y no `dispositivo`), así que dos
envíos de categorías o detalles distintos no se confunden con un replay.

**El `detalle` es estricto.** Se valida con el Zod de la definición de la categoría
(`esquemaDetalle`; en Inundaciones, `DetalleInundacionSchema`, un objeto estricto): una clave de más
o un valor fuera de rango da 400 `PAYLOAD_INVALIDO` con `detalles[].campo` como `detalle.<clave>`. Un
`detalle` de más de 8192 bytes también da 400: api-core lo mide antes del PIP y del cupo, con el
mismo tope que el CHECK `detalle_tope` de la base, que queda de respaldo junto al CHECK de objeto. En
la forma plana los seis campos pasan por `ReporteCrearSchema` y se mueven a `detalle`.

**Qué se guarda.** `categoria`, `subtipo`, `detalle` (el validado) y `detalle_version` (de la
definición). En una **inundación** las seis columnas planas de dominio (`profundidad_estimada`,
`frecuencia`, `causa_presunta`, `sumidero_cercano`, `sumidero_estado`, `agua_brota_sumidero`) salen
del `detalle`, porque el disparador de la 0020 rearma `detalle` desde ellas en cada escritura de
inundación. En **otra categoría** esas seis van en `NULL`, y `causa_presunta` explícitamente, porque
su `DEFAULT` es `'desconocida'` y violaría el CHECK `no_inundacion_sin_campos`.

**Severidad.** La calcula la definición de la categoría (`severidad.calcular(detalle)`) y se guardan
la banda (`severidad_calculada`), el `severidad_puntaje` y `severidad_version`, que es la de su
modelo (2 en Inundaciones, §9.1). La auditoría `crear` lleva `categoria`, `ubicacion_metodo`,
`severidad`, `puntaje`, las `reglas` de escalamiento que aplicó la definición (p. ej. `E1`),
`publicar_en` y nunca la posición del teléfono.

**Cupo.** El turno es de la categoría (`reportes:<categoria>`) y la demora de publicación sale del
número que devuelve su contador; el 429 trae `detalles.categoria`. `GET /auth/yo` suma `cupos` por
categoría activa y `fotos_restantes_hoy`. Detalle en «Cupo diario».

**Moderación entre categorías.** `PATCH /estado`, `PATCH /severidad` y `POST /fusionar` leen y
escriben `reporte`, con la misma visibilidad de siempre (un reporte que espera su `publicar_en` da
404); el ID corto es un prefijo del UUID y vale en todas las categorías. Fusionar con un canónico de
otra categoría da 409 `FUSION_ENTRE_CATEGORIAS`: se comprueba con las dos filas bloqueadas, antes de
exigir que el canónico esté `validado`, y no cambia nada. Los reportes de categorías distintas nunca
se agrupan en un punto crítico: al moderar, el recálculo del entorno usa el radio de recurrencia de
la categoría del reporte.
