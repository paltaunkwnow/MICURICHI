# Manual de operación

Todo lo que hay que saber para instalar, desarrollar, cargar los datos del municipio, desplegar y
arreglar Mi Curichi. Es el punto de entrada: lo que ya está escrito con más detalle en otro sitio
se enlaza en vez de repetirse, porque una copia es una copia que se queda vieja.

| Necesito… | Está en |
|---|---|
| Levantarlo por primera vez | Aquí: [Instalación](#instalación) y [Desarrollo](#desarrollo) |
| Levantarlo con Docker | Aquí: [Docker](#docker) · detalle en [`infra/docker/README.md`](../../infra/docker/README.md) |
| Cargar las capas del municipio | Aquí: [Los datos `DM_UV_MZ_2025`](#los-datos-dm_uv_mz_2025) y [ETL](#etl) · detalle en [`pipelines/geodata-etl/README.md`](../../pipelines/geodata-etl/README.md) |
| Saber qué variable de entorno hace qué | [`.env.example`](../../.env.example), que las lleva todas clasificadas |
| Desplegar | [`produccion.md`](produccion.md) |
| Respaldar y restaurar | [`respaldo-y-restauracion.md`](respaldo-y-restauracion.md) |
| Ver si está vivo y qué está haciendo | Aquí: [Healthchecks](#healthchecks) · detalle en [`observabilidad.md`](observabilidad.md) |
| Arreglar algo que no arranca | Aquí: [Cuando algo no funciona](#cuando-algo-no-funciona) |

---

## Instalación

Hace falta **Node 24 LTS** (está fijado en `.nvmrc`) y **pnpm 12** (`corepack enable` basta: la
versión exacta está en `packageManager`). Nada más: no hacen falta GDAL, tippecanoe ni Python,
porque el ETL está escrito en TypeScript ([ADR 0002](../decisiones/0002-modo-local-sin-docker-y-etl-en-typescript.md)).

```bash
pnpm install
cp .env.example .env
```

El `.env` copiado arranca en local sin tocar nada. Lo único que conviene cambiar desde el primer
día son las contraseñas de ejemplo. En producción **ninguna** de ellas sirve: los servicios se
niegan a arrancar con los valores de ejemplo (ver [`produccion.md`](produccion.md)).

## Desarrollo

Dos maneras, y las dos están probadas. La diferencia es de dónde sale PostGIS.

### Con Docker (la recomendada)

PostgreSQL de verdad en un contenedor; servicios y apps en la máquina:

```bash
docker compose up -d postgis                                # PostgreSQL 18 + PostGIS en 127.0.0.1:5432
export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"  # rol dueño: los comandos de pnpm no leen .env
pnpm db:migrate
pnpm etl:load -- --version DM_UV_MZ_2025                    # si tenés la salida del ETL; si no, saltalo
pnpm db:seed:samples
pnpm dev                                                    # api-core 3001, geo-service 3002, apps 3000 y 3100
```

`pnpm dev` sí lee el `.env` raíz: api-core y geo-service se conectan con `API_DATABASE_URL` y
`GEO_DATABASE_URL` (sus roles con privilegios mínimos; definilas, o caen al rol dueño). La primera
vez, `docker compose up -d postgis` crea el volumen y los roles de aplicación. En PowerShell, el
`export` es `$env:DATABASE_URL = ((Get-Content .env) -match '^DATABASE_URL=')[0] -replace '^DATABASE_URL=', ''`.

> No uses `set -a; . ./.env; set +a` para cargar el `.env` en bash: `CIUDAD_NOMBRE=Santa Cruz de la
> Sierra` lleva espacios sin comillas, y bash intenta ejecutar `Cruz`. Docker Compose y Node
> (`--env-file`) sí lo leen bien.

### Sin Docker (PGlite)

```bash
pnpm db:local        # PostGIS dentro de Node (PGlite) en 127.0.0.1:5433; aplica migraciones
```

Esa terminal se queda abierta: es la base. En otra:

```bash
pnpm db:seed:samples # usuarios locales + reportes SINTÉTICOS dentro de las UV vigentes
pnpm dev             # api-core 3001, geo-service 3002, app pública 3000, panel 3100
```

**Su límite:** tras unas horas de uso o después de suspender la máquina, PGlite deja de responder
(peticiones colgadas o cortadas) y hay que cerrar `pnpm db:local` y abrirlo otra vez; los datos
siguen en `infra/.pglite`. Es de una sola conexión, así que tampoco sirve para probar concurrencia.

Usuarios de desarrollo: `tecnico@curichi.local` / `tecnico`,
`admin@curichi.local` / `admin` y `vecina@curichi.local` /
`vecina`.

La cuenta ciudadana hace falta desde la migración 0009: **crear un reporte exige sesión** (ver el
mapa no). Lo que conviene saber al probar (ADR 0006):

- **Cupo diario.** Cada cuenta puede enviar **3 reportes y 12 fotos por día** calendario en
  `ZONA_HORARIA`; a medianoche vuelve a empezar. El 4.º reporte recibe `429 CUOTA_DE_REPORTES` y la
  13.ª foto `429 CUOTA_DE_FOTOS`, con `Retry-After` hasta la medianoche: es eso y no un fallo. Para
  probar más, creá cuentas nuevas o subí `REPORTES_POR_DIA_POR_CUENTA` y `FOTOS_POR_DIA_POR_CUENTA`
  **solo en desarrollo**. Las altas de cuenta también tienen tope por IP: 5 por hora
  (`REGISTRO_MAX_POR_IP`) y 10 por día (`ALTAS_POR_DIA_POR_IP`).
- **Demora de publicación.** El reporte llega al servidor al tocar Enviar, pero aparece en el mapa
  **1 minuto** después si es el 1.º del día de esa cuenta y **4 minutos** después si es el 2.º o
  el 3.º. Mientras espera no lo ve nadie más que su autor (en «Mis reportes», con una cuenta
  regresiva), técnicos incluidos: la bandeja del panel tampoco lo muestra. La página pública no se
  actualiza sola: hay que recargarla. `REPORTE_DEMORA_PRIMERO_S` y `REPORTE_DEMORA_SIGUIENTES_S`
  cambian la demora (de 0 a 3600 s) **solo para pruebas**; en producción no se definen.
- **«NO SE HA VERIFICADO».** Pasada la demora, el reporte se ve en el mapa, en las tarjetas y en
  el detalle con esa etiqueta exacta, con su foto. Validarlo lo pasa a «Verificado»; rechazarlo o
  fusionarlo lo saca del mapa, y el admin puede retirar uno ya verificado. Los puntos críticos y
  el color de gravedad por barrio cuentan solo verificados.
- **Permisos.** La web no pide ubicación ni cámara al cargar. La ubicación se pide al tocar
  «Compartir mi ubicación» dentro del reporte, y la cámara al tocar «Sacar foto». Sin ubicación con
  un margen de 50 m o menos no se puede reportar, y el punto solo se mueve dentro de 60 m de esa
  posición. Los dos permisos exigen HTTPS: `localhost` cuenta como seguro, pero un teléfono que
  entra por la IP de la red local sin el proxy con TLS no puede reportar.

### La pila entera en Docker

La que más se parece a producción:

```bash
docker compose --profile servicios --profile minio up -d --build
```

Con el perfil `servicios`, primero corre el job `migraciones` y, si termina bien, arrancan
api-core y geo-service, después las dos apps y al final el **proxy de entrada** (Caddy), todos con
**`NODE_ENV=production`**. Se entra por el proxy: con los valores del `.env.example`,
<https://curichi.localhost:8443> y <https://panel.curichi.localhost:8443>, con un certificado de la
CA interna de Caddy (el navegador avisa). En ese modo la cookie de sesión es `Secure` y **solo
viaja por HTTPS**, así que curl necesita `-k` y HTTPS. Los E2E de Playwright se siguen corriendo
contra `pnpm dev`. Las apps no publican puertos; los dos servicios publican uno **efímero** en
`127.0.0.1` (`docker compose port api-core 3001`). Topología, variables y primer despliegue:
[`produccion.md`](produccion.md#topología).

## Docker

```bash
docker compose --profile servicios build      # de a uno si la máquina va justa de memoria
docker compose --profile servicios --profile minio up -d
docker compose ps                             # migraciones y minio-init «Exited (0)»; el resto «healthy»
docker compose logs -f api-core
docker compose --profile servicios --profile minio down   # sin -v: los volúmenes se conservan
```

| Perfil | Servicios | Para qué |
|---|---|---|
| (ninguno) | `postgis` | Desarrollar con `pnpm dev` |
| `servicios` | `migraciones` (job), `api-core`, `geo-service`, `web-ciudadano`, `panel-admin`, `proxy` | La aplicación en contenedores, como en producción. Solo el proxy publica puertos hacia fuera |
| `minio` | `minio`, `minio-init` (job) | S3 local para las fotos. En producción, S3 gestionado |
| `respaldos` | `respaldo` | Respaldo diario cifrado a un S3 externo ([respaldo-y-restauracion.md](respaldo-y-restauracion.md)) |
| `observabilidad` | `prometheus`, `alertmanager`, `blackbox` | Métricas y alertas ([observabilidad.md](observabilidad.md)) |

Los jobs (`migraciones`, `minio-init`) terminan: que aparezcan como `Exited (0)` es lo correcto.
`minio-init` crea el bucket privado y el usuario de api-core con acceso solo a ese bucket, y se
niega a seguir si `S3_ACCESS_KEY` es la credencial root. Los servicios y las apps no tienen
`container_name` (se llaman `mi-curichi-api-core-1`, …) para poder escalarlos con `--scale`; el
proxy reparte entre las réplicas de las apps por el DNS de Docker.

> **Windows y la unidad A:** el 2026-09-26, en la máquina de desarrollo, Docker Desktop no podía
> montar carpetas de la unidad `A:` en contenedores nuevos (`mkdir /run/desktop/mnt/host/a: file
> exists`); los que ya estaban creados seguían funcionando. Afecta a todo lo que el Compose monta
> desde el repositorio (`infra/sql`, `infra/minio`, `infra/observabilidad`, `data/processed`). Si
> aparece, reiniciar Docker Desktop o trabajar con el repositorio en `C:`.

Detalle de las imágenes, las tres etapas del Dockerfile y los límites de recursos:
[`infra/docker/README.md`](../../infra/docker/README.md).

## Los datos `DM_UV_MZ_2025`

Es la entrega de capas administrativas del **Gobierno Autónomo Municipal de Santa Cruz de la
Sierra** `<organismo exacto a confirmar>`, con fecha de archivo 2025-03-05. Vive en
`data/raw/DM_UV_MZ_2025/`, que es **inmutable**: no se renombra, no se corrige un `.dbf`, no se
añade un `.prj` a mano. Una corrección del origen es una versión nueva con su propio
`MANIFEST.md` (CLAUDE.md §6.10).

| Archivo | Capa | Features | Campos que usa el ETL |
|---|---|---:|---|
| `DM.shp` | Distrito municipal | 16 | `DIS` → código; nombre por plantilla «Distrito {código}» |
| `UV.shp` | Unidad vecinal | 582 | `UV` → código, `DM` → distrito, `OBJECTID` de respaldo |
| `MZ.shp` | Manzana | 27 817 | `OBJECTID` → código, `UV` y `DM` → padres |

Los tres vienen en **EPSG:32720** (WGS 84 / UTM 20S, declarado en el `.prj`) y **UTF-8** (`.cpg`).
El ETL reproyecta a EPSG:4326, que es lo único que sale hacia la web.

**No se versionan en git** (§6.10.3): `.gitignore` deja pasar únicamente el `MANIFEST.md`, que
lleva el `sha256` de cada archivo. Antes de trabajar con la carpeta conviene comprobar que es la
misma entrega:

```bash
cd data/raw/DM_UV_MZ_2025 && sha256sum *.shp *.shx *.dbf *.prj *.cpg
```

y contrastar con la tabla del `MANIFEST.md`. Si un hash no coincide, **parar**: no es la misma
entrega y los campos declarados en `config/capas.yaml` pueden no valer.

### Lo que la entrega tiene de particular

Está medido, no supuesto, y el ETL lo reporta en `data/processed/DM_UV_MZ_2025/<capa>/reporte_calidad.md`:

| Qué | Cuánto | Qué hace el ETL |
|---|---:|---|
| Geometrías nulas o vacías | 3 en UV, 214 en MZ | Se excluyen antes de reparar y quedan contadas |
| Geometrías inválidas | 1 en UV, 358 en MZ | `-clean` de mapshaper; lo que PostGIS siga viendo inválido se repara con `ST_MakeValid` al cargar (2 + 1 + 17 filas) |
| Duplicados exactos de geometría | 70 en MZ | Se excluye la segunda copia |
| Unidades vecinales sin código | 7 | Se usa `OBJECTID` como respaldo |
| Códigos de unidad vecinal repetidos | 25 | Se desambiguan con sufijo `-2`, `-3`… asignado por la geometría, no por el orden del archivo |
| **Manzanas sin identificador único** | — | `OBJECTID` vale 0 en 6 596 filas y solo tiene 20 001 valores distintos de 27 527. Ningún campo ni combinación de campos es única (ver los números en `config/capas.yaml`). El id de manzana es, por tanto, un **subrogado del ETL**: no depende del orden de las filas, pero puede cambiar si cambia la geometría de alguna manzana que comparte código |
| Manzanas que declaran un padre inexistente | 879 unidades vecinales, 97 distritos | Se usa el polígono que las contiene; si no hay ninguno, se dejan en `NULL`. Nunca se guarda una referencia que no resuelva |
| Manzanas sin ningún padre | 454 sin unidad vecinal, 24 sin distrito | Quedan en `NULL` y contadas |

Tras la carga: **16 distritos, 576 unidades vecinales y 27 527 manzanas**, todas con geometría
válida, no vacía, `MULTIPOLYGON` y SRID 4326.

## ETL

```bash
pnpm etl:inspect -- --version DM_UV_MZ_2025   # archivos, CRS, campos, nulos, bbox. No toca nada
pnpm etl:run     -- --version DM_UV_MZ_2025   # reproyecta, valida, repara, normaliza, simplifica
pnpm etl:load    -- --version DM_UV_MZ_2025   # carga a PostGIS
pnpm etl:all                                  # run + load de todas las versiones cuya carpeta exista
```

`etl:load` carga todas las capas de la versión en **una sola transacción**: si falla una, no
queda ninguna a medias. **No activa versiones**: activar es decisión del administrador y se hace
desde el panel (**Capas → Activar**), que la deja en `auditoria` con su usuario. La única
excepción es el arranque: si una capa no tiene **ninguna** versión vigente (base nueva), la carga
la activa, porque sin capa vigente no se puede ubicar ningún reporte, y lo registra en `auditoria`
sin actor, con `activado_en` y el motivo «arranque del ETL». Recargar la versión que ya rige no
cambia su activación. La opción `--activar` ya no existe.

Cuando la reparación topológica corre sobre una capa cuyas features no tienen una clave única
(pasa en unidades vecinales y manzanas de la entrega real), el control de cambio de área por
feature no se puede aplicar: `etl:run` lo avisa con `!! AVISO` en consola y al principio de
`reporte_calidad.md`.

Los códigos repetidos se desambiguan con `-2`, `-3`… **por la geometría de cada feature, no por
el orden del archivo**, así que una reentrega con las filas en otro orden da los mismos ids. Esto
cambió el 2026-09-26: regenerar con este ETL una versión que se cargó con uno anterior puede
reasignar los sufijos de los códigos repetidos, y los reportes guardan el id de su unidad
vecinal. No la recargues encima de la versión vigente: declarala como otra versión (una entrada
nueva en `config/capas.yaml`, con otro `version` y la misma `carpeta`), cargala y activala
desde el panel.

`etl:load` habla con la base por `DATABASE_URL`. Si no está en el entorno del proceso, usa la del
modo local (`127.0.0.1:5433`), **no** la del `.env`: los comandos de pnpm no leen ese archivo.
Contra el PostGIS del Compose hay que pasarla:

```bash
export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"   # rol dueño, desde tu .env
pnpm etl:load -- --version DM_UV_MZ_2025
```

Tiempos medidos con la entrega real (2026-09-18): `etl:run` **43 s** para las tres capas;
`etl:load` **7 s** contra PostgreSQL 18 en Docker y **15 s** contra PGlite. Salidas en
`data/processed/DM_UV_MZ_2025/`: 56 MB de `full.geojson` y 16 MB de `web.geojson` para manzanas.

## PostgreSQL / PostGIS

Producción usa **PostgreSQL 18 + PostGIS 3.6** de verdad. PGlite es solo para desarrollo y tests
([ADR 0003](../decisiones/0003-pglite-solo-en-local-y-pruebas.md)).

### Migraciones

```bash
pnpm db:migrate        # aplica las pendientes; idempotente y con registro propio
pnpm db:generate       # crea un archivo de migración nuevo con marca de tiempo
```

`pnpm db:migrate` usa `DATABASE_URL`, que es la del rol **dueño** (`curichi`). Los servicios NO
usan ese rol: cada uno tiene el suyo con privilegios mínimos (ver abajo).

**La migración 0015 aborta si quedan reportes en `nuevo`.** Es la que publica sin moderación
previa, y esos reportes se enviaron con el texto «un técnico lo revisa antes de publicarlo»: el
log dice cuántos son y no cambia nada. Lo normal es moderarlos antes (validar, rechazar o
fusionar) y volver a migrar. Solo si publicarlos tal como están es una decisión tomada a sabiendas
(en desarrollo, donde los `nuevo` son datos de ejemplo y de pruebas), se migra con la bandera, que
vale solo para esa ejecución:

```bash
pnpm db:migrate -- --publicar-nuevos-existentes
```

En producción, lo mismo con el job: [`produccion.md`](produccion.md#migración-0015-publicación-sin-moderación-previa).
La 0016 (contracción) va recién en un despliegue posterior al de la 0014 y la 0015.

### Roles de aplicación

Tres roles, tres trabajos. `curichi` crea el esquema; `curichi_api` y `curichi_geo` lo usan en
ejecución con lo justo. Los servicios comprueban al arrancar que su rol no tiene privilegios de
más y en producción se niegan a servir si los tiene.

```bash
pnpm privilegios       # compara la matriz real con la documentada en la migración 0008
```

Con Docker, `infra/sql/01-roles.sh` los crea solo al **inicializar el volumen**. Basta con tener
`API_DB_PASSWORD` y `GEO_DB_PASSWORD` en el `.env` antes del primer `docker compose up`.

#### Roles de aplicación en una base que ya existe

El script de init no vuelve a ejecutarse sobre un volumen creado. Para una base que ya está en
marcha (o un servidor del municipio), se aplica a mano una vez:

```bash
export API_DB_PASSWORD="$(sed -n 's/^API_DB_PASSWORD=//p' .env)"
export GEO_DB_PASSWORD="$(sed -n 's/^GEO_DB_PASSWORD=//p' .env)"
docker exec -e API_DB_PASSWORD -e GEO_DB_PASSWORD -e POSTGRES_USER=curichi -e POSTGRES_DB=curichi \
  -i curichi-postgis bash < infra/sql/01-roles.sh
```

(`-e VARIABLE` sin valor la toma del entorno: la contraseña no queda en la línea de órdenes.)

Y después las migraciones, que son las que conceden los permisos:

```bash
export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"
pnpm db:migrate && pnpm privilegios
```

Fuera de Docker es el mismo script contra el servidor real, con `psql` en el `PATH` y las mismas
variables de entorno.

Viven en `packages/db/migraciones/` y se aplican en orden por nombre. El runner toma un
`pg_advisory_xact_lock`, así que **varias réplicas arrancando a la vez no se pisan**: probado con
8 simultáneas contra una base vacía. Una migración que crea un índice bloquea las escrituras de
esa tabla mientras dura (0,95 s con 750 000 filas).

Nunca se edita una migración ya aplicada: se escribe otra.

### Consultas útiles

```sql
-- qué capa rige ahora mismo
SELECT capa, version, n_features, vigente FROM geo.capa_version ORDER BY capa, cargado_en DESC;

-- salud geométrica de una versión
SELECT count(*) FILTER (WHERE NOT ST_IsValid(geom)) AS invalidas,
       count(*) FILTER (WHERE ST_IsEmpty(geom))     AS vacias,
       min(ST_SRID(geom)) AS srid, ST_Extent(geom)::text AS bbox
  FROM geo.unidad_vecinal WHERE version_capa = 'DM_UV_MZ_2025';

-- tamaño de las tablas geográficas
SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'geo' AND c.relkind = 'r' ORDER BY 2 DESC;
```

## MinIO / S3

Las fotos van al disco del proceso **o** a un servicio compatible con S3, y la elección es
explícita: se activa S3 poniendo `S3_ENDPOINT` (o `S3_ENDPOINT_DOCKER` si api-core corre en el
Compose). Con el disco, las réplicas de **una misma máquina** comparten el volumen `fotos-data`
del Compose, y es el modo oficial en la VPS (ADR 0006), con la guarda de espacio
`FOTOS_MIN_LIBRE_BYTES`; entre máquinas hace falta S3.
`api-core` lo dice en el log al arrancar (`… · fotos en …`) y comprueba el bucket **antes** de
escuchar: con una credencial equivocada se niega a arrancar en lugar de aceptar reportes y perder
sus fotos de una en una.

El bucket debe ser **privado**: las fotos las sirve `api-core`, que es quien sabe si el reporte
está publicado. Al cambiar de modo, las fotos ya guardadas **no se mueven solas**.

Consola de MinIO en local: `http://127.0.0.1:9001`.

## Variables de entorno

Todas están en [`.env.example`](../../.env.example), cada una etiquetada como `[OBLIGATORIA]`,
`[PRODUCCIÓN]`, `[OPCIONAL]`, `[SOLO DESARROLLO]` y `[SENSIBLE]`. Dos cosas que no se ven en el
archivo:

- **Turborepo corre en `envMode: strict`.** Una variable que no esté en `globalEnv` de
  `turbo.json` **no llega** a la tarea, y no avisa. Ya pasó una vez: los servicios ignoraban los
  límites de uso por mucho que se exportaran.
- **Los comandos de pnpm no leen `.env`.** Lo leen Docker Compose y las apps Next. Para un
  `pnpm etl:load` o un `pnpm db:migrate` contra otra base hay que pasar `DATABASE_URL` delante.

## Producción

[`produccion.md`](produccion.md) tiene la lista completa. En una línea: una instalación por
ciudad con las cinco imágenes del CI por SHA, `DOMINIO_PUBLICO` y `DOMINIO_PANEL` distintos con
`PROXY_TLS=acme` (el proxy saca los certificados solo), secretos generados (`GEO_TOKEN_INTERNO`
incluido, de 32 caracteres o más), la IP del cliente comprobada con una cabecera falsa (el Compose
ya pone `TRUST_PROXY=1` y `PROXY_DE_CONFIANZA=1`), `/metrics` con token, migraciones por el job `migraciones`,
TLS con la base con `sslmode=verify-full` y su CA si no está en la misma máquina, fotos en el
disco de la VPS con su guarda de espacio y una copia fuera de la máquina, perfiles `respaldos` y
`observabilidad` en marcha, y un mapa base que no sea el servidor público de OpenStreetMap. Lo que
bloquea la apertura, en orden: [«Antes de producción»](produccion.md#antes-de-producción).

## Respaldo y restauración

[`respaldo-y-restauracion.md`](respaldo-y-restauracion.md). En producción los hace el servicio
`respaldo` (perfil `respaldos`): diario, cifrado, a un S3 externo, con retención y alerta si falla.
En la máquina de desarrollo, el simulacro completo —respalda sin `_migraciones`, crea una base
nueva, la migra `--hasta` la versión del respaldo, carga los datos, migra el resto, compara y
borra la base de prueba— es un comando:

```bash
node --env-file=.env scripts/respaldo.mjs simulacro
```

Devuelve código distinto de cero si algo no coincide, así que se puede enganchar a una tarea
programada. Con la base real de 82 MB tarda **5,3 s** en total.

## Healthchecks

| Ruta | Qué responde | Para qué |
|---|---|---|
| `GET /health` | `{ok:true, servicio}` mientras el proceso viva, aunque la base no esté | *Liveness*: reiniciar el contenedor |
| `GET /ready` (api-core) | `{ok, db, geo, fotos, degradado}` | *Readiness*: mandarle tráfico o no |
| `GET /ready` (geo-service) | `{ok, capas}` con las versiones vigentes | Ídem |
| `GET /metrics` | Texto Prometheus, con token | Alertas y paneles |

`/ready` de api-core devuelve **503 solo si la base no está**: es lo único que la réplica no puede
suplir. Con geo-service o el almacén de fotos caídos (en disco, también si no se puede escribir:
escribe y borra un archivo de prueba), o con `fotos: "poco_espacio"` (menos que
`FOTOS_MIN_LIBRE_BYTES` libre), responde 200 y marca `degradado: true`,
porque el mapa y el listado siguen sirviéndose y sacar todas las réplicas de rotación convertiría
«no se pueden crear reportes» en «el sitio no existe».

## Cuando algo no funciona

### El mapa sale vacío o en gris

Mirar, en este orden: `GET /geo/v1/capas/vigentes` (¿hay versión vigente?), `GET /geo/v1/capas`
(¿`n_features` > 0 y `bbox` sobre Santa Cruz?) y la consola del navegador. Un `bbox` en mitad del
Atlántico significa CRS mal leído. Si no hay versión vigente, es que nadie la activó: panel →
**Capas** → Activar.

### `etl:load` dice «Base de datos no disponible tras 10 intentos: ECONNREFUSED 127.0.0.1:5433»

Está intentando el PGlite local porque no tiene `DATABASE_URL`. O se levanta `pnpm db:local`, o se
le pasa la URL del Compose delante del comando.

### El ETL se detiene pidiendo el CRS

Falta el `.prj` de esa capa y la versión no declara `crs_origen` en `config/capas.yaml`. **No se
adivina** (CLAUDE.md §0.4): hay que confirmar el CRS con quien entregó los datos y declararlo.

### `pg_dump` responde «could not open output file "C:/Users/…/Temp/…"»

Es Git Bash en Windows traduciendo `/tmp/...` a una ruta de Windows antes de pasarla al
contenedor. Se evita con `MSYS_NO_PATHCONV=1` delante del comando, o escribiendo `//tmp/...`.

### `pg_restore` dice «duplicate key value violates unique constraint "_migraciones_pkey"»

El respaldo trae la tabla de control de migraciones y la base de destino ya las aplicó. El
respaldo debe hacerse con `--exclude-table=_migraciones` (ver el runbook). Ojo: sin
`--exit-on-error`, `pg_restore` cuenta esto como «error ignorado» y **sale con código 0**.

### Al crear un reporte responde 503 «No pudimos ubicar el punto ahora mismo»

geo-service no responde: parado, reiniciándose o saturado. `docker compose ps` y
`docker compose logs geo-service`. Es transitorio por diseño; el reintento es seguro porque el
envío lleva clave de idempotencia.

### Al subir una foto responde 500

Casi siempre el almacén: `curl -s http://127.0.0.1:3001/ready` y mirar `fotos`. Si dice `error`,
con S3 MinIO está caído o las credenciales cambiaron; con disco, la carpeta de fotos no se puede
escribir (volumen de solo lectura o de otro dueño).

### Al subir una foto responde 507 `SIN_ESPACIO`

Queda menos que `FOTOS_MIN_LIBRE_BYTES` (2 GiB por defecto) libre en el disco de las fotos, que en
la VPS es también el de PostgreSQL. No se gastó cupo y los reportes sin foto siguen entrando;
`/ready` dice `"fotos":"poco_espacio"` y avisan las alertas `DiscoDeFotos*`. `df -h` y
`docker system df`; liberar espacio o agrandar el disco. En desarrollo, `FOTOS_MIN_LIBRE_BYTES=0`
apaga la guarda.

### Envié un reporte y no aparece en el mapa

Se publica 1 minuto después de enviarlo, o 4 desde el 2.º del día de esa cuenta, y la página
pública no se actualiza sola: hay que recargarla. Mientras espera no lo ve nadie más que su autor,
en «Mis reportes», ni siquiera el técnico. Si pasó la demora y sigue sin verse, puede estar
rechazado o fusionado: «Mis reportes» lo dice.

### El técnico ve `unidad_vecinal:…` donde debería ir el nombre de un barrio

Ese reporte se resolvió con una versión de capa que ya no está cargada en `geo.*`. Los nombres se
leen de la versión con la que se resolvió CADA reporte (`version_capa`), no de la vigente; si esa
versión se borró de las tablas, no hay de dónde sacar el nombre. No se borran versiones viejas.

### Los E2E fallan con 401 al exportar

Se están corriendo contra la pila del Compose, que va con `NODE_ENV=production` y por tanto con
`COOKIE_SEGURA=1`. El cliente HTTP de Playwright no es un navegador: no aplica la excepción que
estos hacen con `localhost`, así que no devuelve una cookie `Secure` por `http`.

`e2e/playwright.config.ts` ya pasa `COOKIE_SEGURA=0` al servidor que levanta **él mismo**, pero si
los contenedores están arriba Playwright los reutiliza (`reuseExistingServer`) y el ajuste no
llega. Hay que apartarlos y levantar los dos servicios en modo desarrollo contra la misma base:

```bash
docker compose stop api-core geo-service
```

Después, con las variables de `.env` cargadas más `NODE_ENV=development`, `COOKIE_SEGURA=0` y
`S3_ENDPOINT=http://127.0.0.1:9000`:

```bash
pnpm --filter geo-service dev
```

```bash
pnpm --filter api-core dev
```

Y las dos apps (`pnpm --filter web-ciudadano dev`, `pnpm --filter panel-admin dev`). Al terminar:

```bash
docker compose up -d api-core geo-service
```

**No intentar lo contrario** —arrancar el contenedor con `COOKIE_SEGURA=0`—: api-core se niega a
levantar con `NODE_ENV=production` y la cookie sin `Secure`, y hace bien. El contenedor queda en
`Restarting` con «Configuración inválida para producción».

### Una variable de entorno «no hace nada»

Comprobar que está en `globalEnv` de `turbo.json`. Con `envMode: strict`, Turbo no la pasa y no
avisa.

### Docker Desktop tumbado al construir las imágenes

Construir las dos imágenes en paralelo tumbó BuildKit en una máquina con 8 GB para WSL2. Se
construyen de a una (ver [`infra/docker/README.md`](../../infra/docker/README.md)).
