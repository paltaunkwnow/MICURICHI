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

### Sin Docker (la más rápida)

```bash
pnpm db:local        # PostGIS dentro de Node (PGlite) en 127.0.0.1:5433; aplica migraciones
```

Esa terminal se queda abierta: es la base. En otra:

```bash
pnpm db:seed:samples # usuarios locales + reportes SINTÉTICOS dentro de las UV vigentes
pnpm dev             # api-core 3001, geo-service 3002, app pública 3000, panel 3100
```

Usuarios de desarrollo: `tecnico@curichi.local` / `curichi-tecnico-local`,
`admin@curichi.local` / `curichi-admin-local` y `vecina@curichi.local` /
`curichi-vecina-local`.

La cuenta ciudadana hace falta desde la migración 0009: **crear un reporte exige sesión** (ver el
mapa no). Cada cuenta puede enviar un reporte cada 60 minutos; si al probar recibís un 429 con
código `CUOTA_DE_REPORTES`, es eso y no un fallo. Para probar con varios reportes seguidos, creá
varias cuentas o bajá `REPORTE_MINUTOS_ENTRE_ENVIOS` **solo en desarrollo**.

### Con Docker

```bash
docker compose up -d                          # solo PostGIS y MinIO
pnpm db:migrate && pnpm dev                   # el resto, en la máquina
```

O la pila entera, que es la que más se parece a producción:

```bash
docker compose --profile servicios up -d --build
```

Con el perfil `servicios`, api-core y geo-service corren dentro de Docker con
**`NODE_ENV=production`**. Eso tiene una consecuencia que conviene saber antes de tropezarse con
ella: en ese modo `COOKIE_SEGURA` es obligatoriamente `1`, así que la cookie de sesión sale
marcada como `Secure` y **solo viaja por HTTPS**. Un navegador la manda igual contra `localhost`
—lo trata como contexto seguro—, pero un cliente HTTP que no sea navegador, no. Por eso los E2E
de Playwright se corren contra `pnpm dev` y no contra el Compose.

## Docker

```bash
docker compose --profile servicios build      # de a uno si la máquina va justa de memoria
docker compose --profile servicios up -d
docker compose ps                             # los cuatro tienen que llegar a `healthy`
docker compose logs -f api-core
docker compose --profile servicios down       # sin -v: los volúmenes (base y fotos) se conservan
```

Los cuatro servicios son `postgis`, `minio`, `api-core` y `geo-service`. Los dos últimos están
bajo el perfil `servicios` para que `docker compose up -d` a secas levante solo lo que hace falta
para desarrollar. `minio-init` crea el bucket una vez y termina: que aparezca como `Exited (0)`
es lo correcto.

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
| Códigos de unidad vecinal repetidos | 25 | Se desambiguan con sufijo `-2`, `-3`… estable por orden de archivo |
| **Manzanas sin identificador único** | — | `OBJECTID` vale 0 en 6 596 filas y solo tiene 20 001 valores distintos de 27 527. Ningún campo ni combinación de campos es única (ver los números en `config/capas.yaml`). El id de manzana es, por tanto, un **subrogado del ETL**, estable mientras el archivo no cambie |
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

`etl:load` marca la versión como vigente **solo si no hay otra vigente** para esa capa. Activar
una versión cuando ya rige otra es una decisión del administrador y se hace desde el panel
(**Capas → Activar**), no desde la línea de comandos; `--activar` existe para automatizar el
primer arranque de un entorno nuevo.

`etl:load` habla con la base por `DATABASE_URL`. Si no está en el entorno del proceso, usa la del
modo local (`127.0.0.1:5433`), **no** la del `.env`: los comandos de pnpm no leen ese archivo.
Contra el PostGIS del Compose hay que pasarla:

```bash
set -a && . ./.env && set +a    # carga DATABASE_URL (rol dueño) desde tu .env
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
set -a; . ./.env; set +a
docker exec -e API_DB_PASSWORD="$API_DB_PASSWORD" -e GEO_DB_PASSWORD="$GEO_DB_PASSWORD" \
  -e POSTGRES_USER=curichi -e POSTGRES_DB=curichi \
  -i curichi-postgis bash < infra/sql/01-roles.sh
```

Y después las migraciones, que son las que conceden los permisos:

```bash
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
Compose). Con el disco, una foto subida a una réplica no existe para las demás; con S3, sí.
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

[`produccion.md`](produccion.md) tiene la lista completa. En una línea: secretos generados,
`COOKIE_SEGURA=1`, `CORS_ORIGENES` con los orígenes reales, `TRUST_PROXY` con el número de saltos
real, `/metrics` con token o apagado, PostGIS de verdad con `sslmode=require`, respaldos fuera de
la máquina y un mapa base que no sea el servidor público de OpenStreetMap.

## Respaldo y restauración

[`respaldo-y-restauracion.md`](respaldo-y-restauracion.md). El simulacro completo —respalda, crea
una base nueva, restaura, compara y borra la base de prueba— es un comando:

```bash
node scripts/respaldo.mjs simulacro
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
suplir. Con geo-service o el almacén de fotos caídos responde 200 y marca `degradado: true`,
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
MinIO está caído o las credenciales cambiaron.

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
