# Mi Curichi

Plataforma web de **reporte ciudadano georreferenciado de puntos de inundación**.

En Santa Cruz de la Sierra hay calles que se anegan cada vez que llueve fuerte. Los vecinos saben
exactamente cuáles, pero el municipio no tiene un inventario de eso: ni dónde, ni con qué
frecuencia, ni con cuánta agua, ni a quién afecta. Mi Curichi es ese inventario, y lo llena la
gente que vive ahí.

Un vecino marca el punto en el mapa desde el celular, dice hasta dónde llegó el agua y cuánto
tardó en irse, y adjunta una foto. El sistema calcula una **severidad reproducible** con una
tabla publicada, cruza el punto por *point-in-polygon* con el **distrito municipal** y la **unidad
vecinal** oficiales, y lo deja en cola. Un técnico lo valida, lo rechaza o lo fusiona con otro.
Solo entonces aparece en el mapa público, con la ubicación degradada si el reporte era de una
vivienda.

> *Curichi*: en el habla cruceña, un bajío donde el agua se estanca.

**Lo que este sistema NO es**: ni un modelo hidráulico, ni un estudio de drenaje, ni un
diagnóstico de pavimento. Los datos son de **percepción**, no medidos: el tirante se estima por
referencia corporal, la duración es recordada, la ubicación tiene el error del GPS de un celular.
Sirve para saber **dónde** y **cuánto se repite**. Cualquier decisión de obra necesita un estudio
técnico formal. Esa advertencia va en la interfaz y en cada exportación, no solo aquí.

El manual operativo completo —dominio, arquitectura, reglas de carpetas, pipeline de datos, stack
y fases— está en **[CLAUDE.md](CLAUDE.md)**. Leelo antes de tocar nada.

---

## Cuentas para probar

Después de levantar el proyecto ([Instalación desde cero](#instalación-desde-cero)),
`pnpm db:seed:samples` crea estas tres cuentas. Sirven para probar **las dos partes**: la app
pública como vecino y el panel técnico como administrador.

| Para probar | Dónde entrar | Correo | Contraseña | Rol |
|---|---|---|---|---|
| **Usuario normal** (reportar un punto) | App pública · <http://localhost:3000/ingresar> | `vecina@curichi.local` | `curichi-vecina-local` | ciudadano |
| **Administrador** (moderar, exportar, activar capas) | Panel técnico · <http://localhost:3100> | `admin@curichi.local` | `curichi-admin-local` | admin |
| Técnico (moderar y exportar, sin administración) | Panel técnico · <http://localhost:3100> | `tecnico@curichi.local` | `curichi-tecnico-local` | técnico |

- **El mapa se ve sin entrar.** La cuenta solo hace falta para **enviar** un reporte.
- Desde la app pública también se puede **crear una cuenta nueva** en «Crear cuenta»; siempre
  queda con rol `ciudadano`.
- La cuenta de usuario normal **no entra al panel técnico**: el panel lo dice y la API responde 403.
- Cada cuenta puede enviar **un reporte cada 60 minutos**. Si querés probar varios envíos
  seguidos, usá varias cuentas.
- El administrador y el técnico también pueden entrar a la app pública, pero ahí ven lo mismo que
  cualquiera: la vista con coordenadas exactas está solo en el panel.

> **Solo para desarrollo.** Estas contraseñas están escritas aquí a propósito para que el equipo
> pueda probar. No deben existir en ninguna instalación real: el seed se niega a ejecutarse con
> `NODE_ENV=production`. Se pueden cambiar con `SEED_VECINA_PASSWORD`, `SEED_ADMIN_PASSWORD` y
> `SEED_TECNICO_PASSWORD` en `.env` antes de correr el seed.

---

## Estado

**Fase 1 (local), completa.** Corre entera en una máquina. **No hay despliegue público ni está
desplegada en ningún sitio.**

### Qué funciona

| | |
|---|---|
| **Mapa público** | Sin cuenta. Agrupaciones, filtros, detalle, capas administrativas, PWA instalable |
| **Reporte ciudadano** | Formulario de 5 pasos con GPS o selección manual, foto, previsualización de la unidad vecinal antes de enviar, borrador que sobrevive a una recarga |
| **Cuentas de ciudadano** | Alta, ingreso, cierre de sesión. **Reportar exige cuenta; ver el mapa no** |
| **Panel técnico** | Login, tabla y mapa sincronizados, filtros, validar/rechazar/fusionar/reclasificar, exportación CSV y GeoJSON, indicadores, coropletas, gestión de capas |
| **Geoespacial** | PIP con índice GIST, bordes, huecos y fuera de cobertura; capas como GeoJSON o teselas vectoriales al vuelo; puntos críticos por DBSCAN |
| **ETL** | Shapefile → GeoJSON → PostGIS, reproducible con un comando, con reporte de calidad |
| **Seguridad** | Roles de PostgreSQL con privilegios mínimos, separación estricta de vista pública y técnica, cuota antiabuso por cuenta, EXIF eliminado, contenedores endurecidos. Ver [SECURITY.md](SECURITY.md) |

### Qué no está implementado

- **Despliegue.** No hay dominio, TLS, CDN, respaldos automáticos ni monitoreo. Es la Fase 2 y
  todavía no está aprobada.
- **Notificaciones** de cualquier tipo (correo, SMS, push). Eso significa, en concreto, que el
  alta de cuenta **no verifica el correo** y que no hay recuperación de contraseña: quien la
  pierde necesita que un administrador se la cambie en la base.
- **Reporte sin conexión** con cola de envío. La PWA solo cachea lectura.
- **Geocodificación inversa** robusta: `direccion_aprox` queda vacío salvo que se rellene a mano.
- Analítica avanzada, cruce con datos de lluvia, órdenes de trabajo, app nativa, multi-municipio.
  El backlog completo está en [CLAUDE.md §15](CLAUDE.md).

### Qué necesita algo de fuera

- **Las capas del municipio** (16 distritos, 576 unidades vecinales, 27 527 manzanas) llegaron en
  shapefile y **no se versionan**: pesan demasiado y sus condiciones de uso no están cerradas.
  Sin ellas el proyecto arranca igual, con capas sintéticas de muestra. Ver
  [Datos geográficos](#datos-geográficos).
- **Docker** solo si querés PostgreSQL y MinIO de verdad. Sin Docker también corre (ver abajo).
- **El mapa base** son teselas de OpenStreetMap, aptas solo para desarrollo. Producción necesita
  otra fuente (Protomaps auto-hospedado u OpenFreeMap, a decidir).

### Licencia

**No hay licencia declarada.** No se pone una aquí: es decisión de quien es dueño del proyecto.
Mientras no exista un archivo `LICENSE`, se aplica el derecho de autor por defecto y no hay
permiso implícito para usar, copiar ni redistribuir el código.

---

## Arquitectura

Cinco partes, cada una con su carpeta y su contrato. Los frontends **nunca** hablan con la base de
datos; `api-core` es el único que escribe reportes; `geo-service` es de solo lectura; solo
`packages/db` cambia el esquema, y solo por migración.

```
                      ┌──────────────────┐      ┌──────────────────┐
                      │ apps/            │      │ apps/            │
                      │ web-ciudadano    │      │ panel-admin      │
                      │ Next.js+MapLibre │      │ Next.js+MapLibre │
                      │ :3000  (Parte 1) │      │ :3100  (Parte 2) │
                      └────────┬─────────┘      └────────┬─────────┘
                               │  REST / GeoJSON (mismo origen vía rewrite de Next)
              ┌────────────────┴───────────────┬─────────┘
              ▼                                ▼
   ┌────────────────────┐   POST /resolver  ┌────────────────────┐
   │ services/api-core  │ ────────────────► │ services/geo-      │
   │ Fastify   :3001    │                   │ service   :3002    │
   │ (Parte 3)          │                   │ (Parte 4)          │
   │ reportes · auth    │                   │ PIP · capas ·      │
   │ severidad · fotos  │                   │ agregados · MVT    │
   │ moderación · export│                   │ SOLO LECTURA       │
   └─────┬────────┬─────┘                   └─────────┬──────────┘
         │        │                                   │
         │        │ fotos                             │
         │        ▼                                   │
         │   ┌──────────┐                             │
         │   │  MinIO   │  :9000                      │
         │   │  (S3)    │                             │
         │   └──────────┘                             │
         ▼                                            ▼
   ┌──────────────────────────────────────────────────────────┐
   │        PostgreSQL 18 + PostGIS 3.6      :5432            │
   │  public.*  reportes, usuarios, sesiones, auditoría       │
   │  geo.*     distritos, unidades vecinales, manzanas       │
   │  roles: curichi (dueño) · curichi_api · curichi_geo      │
   └──────────────────────────────────────────────────────────┘
         ▲                                   ▲
         │ migraciones                       │ carga de capas
   ┌─────┴────────┐                  ┌───────┴──────────────┐
   │ packages/db  │                  │ pipelines/           │
   │ (Parte 4)    │                  │ geodata-etl (Parte 5)│
   │ esquema·seeds│                  │ shapefile → PostGIS  │
   └──────────────┘                  └──────────────────────┘

   packages/contracts  ← transversal: enums, Zod, OpenAPI, tabla de severidad.
                         Ninguna parte define por su cuenta un tipo que viaje entre partes.
```

| Carpeta | Parte | Qué hace |
|---|---|---|
| `apps/web-ciudadano/` | 1 | Mapa público, detalle, formulario de reporte, cuenta, PWA |
| `apps/panel-admin/` | 2 | Moderación, filtros, exportación, indicadores, capas |
| `services/api-core/` | 3 | API REST, reglas de negocio, severidad, auth, fotos, auditoría |
| `services/geo-service/` | 4 | Point-in-polygon, capas, agregados, puntos críticos |
| `packages/db/` | 4 | Esquema Drizzle, migraciones SQL, seeds sintéticos, cliente |
| `packages/contracts/` | — | Enums, esquemas Zod, OpenAPI, severidad (custodia: Parte 3) |
| `pipelines/geodata-etl/` | 5 | ETL shapefile → GeoJSON → PostGIS |
| `e2e/` | 5 | Playwright transversal |
| `infra/` | 5 | Dockerfiles, SQL de inicialización |
| `data/` | 5 | `raw/` inmutable · `processed/` generado · `samples/` sintético |

---

## Requisitos

| | Mínimo | Nota |
|---|---|---|
| **Node.js** | 24 LTS (`.nvmrc` dice `24`) | `engines` exige `>=24 <25`. Node 26 es *Current*, no LTS |
| **pnpm** | 12 | `corepack enable` basta: la versión está fijada en `packageManager` |
| **Git** | cualquiera reciente | |
| **Docker** | opcional | Desktop en Windows/macOS, Engine + plugin Compose en Linux |
| **RAM** | 8 GB para desarrollar · **16 GB** si levantás Docker y las dos apps a la vez | Next en modo desarrollo se lleva la mayor parte |
| **Disco** | ~1 GB de dependencias + ~4 GB de imágenes Docker + ~1 GB de volúmenes | Sin Docker, ~1,5 GB en total |

Sistemas donde se ha ejecutado: **Windows 11** (el desarrollo se hizo ahí) y **Linux**. **macOS**
debería funcionar igual —no hay nada específico de plataforma— pero no se ha probado y no se
afirma que sí.

**No hacen falta** GDAL, tippecanoe ni Python: el ETL está escrito en TypeScript y PostGIS puede
correr dentro de Node. El porqué está en el
[ADR 0002](docs/decisiones/0002-modo-local-sin-docker-y-etl-en-typescript.md).

---

## Instalación desde cero

```bash
git clone https://github.com/paltaunkwnow/MICURICHI.git
cd MICURICHI
corepack enable
pnpm install
```

`pnpm install` tarda unos minutos la primera vez: compila `sharp` y descarga los binarios de
Biome y esbuild. Si se corta con `ERR_PNPM_IGNORED_BUILDS`, mirá
[Problemas comunes](#problemas-comunes).

### Variables de entorno

```bash
cp .env.example .env
```

Y editá **al menos** estas cuatro, que el Compose exige y que no tienen valor por defecto:

```bash
POSTGRES_PASSWORD=...     # rol dueño de PostgreSQL
API_DB_PASSWORD=...       # rol de api-core (privilegios mínimos)
GEO_DB_PASSWORD=...       # rol de geo-service (solo lectura)
MINIO_ROOT_PASSWORD=...   # administración de MinIO
```

Para generar cada una:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

`.env.example` documenta **todas** las variables, una por una, con su etiqueta:
`[OBLIGATORIA]`, `[PRODUCCIÓN]`, `[OPCIONAL]`, `[SOLO DESARROLLO]` y `[SENSIBLE]`. No copies
valores de ahí a producción: ninguno es real y los servicios **se niegan a arrancar** con
`NODE_ENV=production` si detectan los de ejemplo.

### Camino A — con Docker (lo más parecido a producción)

```bash
docker compose --profile servicios up -d
```

**El `--profile servicios` importa.** Sin él, `docker compose up -d` levanta solo PostgreSQL y
MinIO, y los dos servicios se quedan fuera: es el modo pensado para desarrollar api-core y
geo-service en la máquina contra una base de verdad. Con el perfil se levanta todo.

Esperá a que los cuatro digan `healthy` (la primera vez construye las imágenes y tarda varios
minutos):

```bash
docker compose ps
```

Después, migraciones y datos de desarrollo:

```bash
pnpm db:migrate
pnpm db:seed:samples
```

Y las dos aplicaciones, que siempre corren fuera de Docker:

```bash
pnpm --filter web-ciudadano dev   # http://localhost:3000
pnpm --filter panel-admin dev     # http://localhost:3100
```

### Camino B — sin Docker

PostGIS corre dentro de Node con PGlite (ADR 0002) y las fotos van a disco.

```bash
pnpm db:local          # dejá esta terminal abierta: PostGIS en 127.0.0.1:5433
```

En otra terminal:

```bash
pnpm db:seed:samples
pnpm dev               # api-core 3001, geo-service 3002, apps 3000 y 3100
```

`pnpm db:local` aplica las migraciones pendientes al arrancar, así que no hace falta
`pnpm db:migrate` aparte.

### Comprobar que está arriba

```bash
curl http://127.0.0.1:3001/ready
```

Tiene que responder algo así:

```json
{"ok":true,"db":"ok","geo":"ok","fotos":"ok","degradado":false}
```

Y entonces:

| Dónde | Qué |
|---|---|
| <http://localhost:3000> | Mapa público |
| <http://localhost:3100> | Panel técnico |
| <http://127.0.0.1:3001/docs> | OpenAPI (solo fuera de producción) |
| <http://127.0.0.1:9001> | Consola de MinIO (solo con Docker) |

### El recorrido completo, a mano

1. Abrí <http://localhost:3000>. **El mapa se ve sin cuenta.**
2. Tocá «Reportar un punto». Como no hay sesión, aparece: *Necesitás una cuenta*, con
   **Iniciar sesión**, **Crear cuenta** y **Cancelar**.
3. **Crear cuenta** → nombre, correo y contraseña (mínimo 10 caracteres) → **Crear cuenta**.
4. **Iniciar sesión** con eso mismo. Volvés al formulario.
5. Completá los 5 pasos y enviá. Queda en estado `nuevo`: **no sale en el mapa todavía**.
6. Intentá enviar otro. Sale **429** con el minuto exacto en que vas a poder: **un reporte por
   cuenta cada 60 minutos**.
7. Entrá al panel en <http://localhost:3100> con `tecnico@curichi.local` /
   `curichi-tecnico-local`, buscá el reporte y validalo.
8. Volvé al mapa público: ahí está.

---

## Cuentas y permisos

| | Ver el mapa | Crear reporte | Moderar, exportar | Administrar |
|---|---|---|---|---|
| **Sin cuenta** | ✅ | ❌ | ❌ | ❌ |
| **`ciudadano`** | ✅ | ✅ (1 cada 60 min) | ❌ | ❌ |
| **`tecnico`** | ✅ | ✅ | ✅ | ❌ |
| **`admin`** | ✅ | ✅ | ✅ | ✅ |

- **El mapa público nunca pide cuenta**, y una cuenta de ciudadano **no** cambia lo que muestra:
  devuelve exactamente los mismos bytes con sesión y sin ella. Hay pruebas que lo comprueban.
- El alta pública crea **siempre** rol `ciudadano`. No se puede pedir otro: el esquema no tiene
  campo de rol y, por si acaso, el rol de PostgreSQL con el que corre la API **no tiene permiso
  para escribir la columna `rol`**. La escalada no depende de que el código sea cuidadoso.
- Las cuentas técnicas se crean fuera de la aplicación, con el rol dueño de la base.
- **Un reporte por cuenta cada 60 minutos**, ventana deslizante desde el último aceptado. Se
  aplica con un `UPDATE` condicional atómico dentro de la misma transacción que inserta, así que
  ni la concurrencia ni los reintentos lo saltan. Medido con 50 envíos simultáneos contra
  PostgreSQL real: 1 aceptado, 49 rechazados, ningún 5xx.
- Cambiar de IP **no** devuelve el turno: el límite es de la cuenta. El límite por IP sigue
  existiendo y es independiente.

### Cuentas de desarrollo

Correos y contraseñas en **[Cuentas para probar](#cuentas-para-probar)**, al principio de este
documento. Las crea `pnpm db:seed:samples`; son solo de desarrollo.

---

## Docker

| Contenedor | Puerto (en `127.0.0.1`) | Depende de | Qué es |
|---|---|---|---|
| `curichi-postgis` | 5432 | — | PostgreSQL 18 + PostGIS 3.6 |
| `curichi-minio` | 9000, 9001 | — | Almacenamiento S3 de fotos |
| `curichi-api-core` | 3001 | postgis, minio | API y reglas de negocio |
| `curichi-geo-service` | 3002 | postgis | Servicio geoespacial |

`api-core` y `geo-service` están bajo el **perfil `servicios`**: sin `--profile servicios` no se
levantan, y eso es a propósito —así se puede tener la base en Docker y los servicios en la
máquina mientras se trabaja en ellos—. Hay además un `minio-init` que crea el bucket y termina.
**Todos los puertos se publican en `127.0.0.1`**: nada sale de la máquina.

```bash
docker compose --profile servicios up -d      # levantar todo
docker compose up -d                          # solo PostgreSQL y MinIO
docker compose ps                             # salud de cada uno
docker compose logs -f api-core               # ver logs
docker compose restart api-core               # reiniciar uno
docker compose stop                           # parar sin borrar
docker compose down                           # parar y borrar contenedores (los datos quedan)
docker compose --profile servicios build --no-cache api-core   # reconstruir una imagen
```

**Borrar todo y empezar de cero** (se pierden la base y las fotos):

```bash
docker compose down -v
```

Los servicios corren con la imagen base fijada **por versión y por digest**, en solo lectura, sin
capabilities y sin poder escalar privilegios. Si `docker compose build` falla diciendo que la
versión de Node no coincide, es esa comprobación funcionando: la etiqueta flotante cambió.

---

## Base de datos

**PostgreSQL 18 + PostGIS 3.6.** Dos esquemas: `public` (reportes, usuarios, sesiones, auditoría)
y `geo` (capas administrativas y sus versiones).

### Roles

Tres, con privilegios mínimos. No es cosmético: antes los servicios se conectaban como
superusuario, y con eso cualquier SQL no previsto dejaba de ser «leer de más» para pasar a ser
control del servidor.

| Rol | Quién lo usa | Qué puede |
|---|---|---|
| `curichi` | Migraciones, seeds, ETL | Dueño del esquema: DDL |
| `curichi_api` | api-core en ejecución | DML acotado tabla por tabla, y en `usuario` **columna por columna** |
| `curichi_geo` | geo-service en ejecución | `SELECT` sobre cinco tablas y nada más |

Los crea `infra/sql/01-roles.sh` al inicializar el volumen; los permisos concretos los dan las
migraciones 0008 y 0009. Los servicios comprueban al arrancar que su rol no tiene privilegios de
más y **en producción se niegan a servir** si los tiene.

### Comandos

```bash
pnpm db:migrate              # aplicar migraciones pendientes
pnpm db:generate             # crear un archivo de migración nuevo
pnpm db:seed:samples         # capas y reportes sintéticos + cuentas de desarrollo
pnpm privilegios             # comprobar la matriz real de privilegios contra la documentada
pnpm --filter db puntos-criticos:recalcular
```

Comprobar la conexión:

```bash
docker compose exec postgis psql -U curichi -d curichi -c "select postgis_version();"
```

Resetear en desarrollo: `docker compose down -v && docker compose up -d`, luego `pnpm db:migrate`
y `pnpm db:seed:samples`.

### En producción, nunca

- `pnpm db:seed:samples`: crea cuentas con contraseñas conocidas y borra los reportes de muestra.
  Se niega a correr con `NODE_ENV=production`, pero no lo pongas a prueba.
- `docker compose down -v`: borra el volumen.
- Editar una migración ya aplicada. Si hay que corregir algo, va otra encima.
- Conectar un servicio con el rol dueño.

---

## Datos geográficos

El municipio entregó tres capas en shapefile (distritos municipales, unidades vecinales y
manzanas) en una carpeta `DM_UV_MZ_2025`.

**Esos archivos no están en el repositorio y no se pueden incluir**: pesan cientos de megabytes y
sus condiciones de uso no están documentadas todavía. No hay un enlace público de donde bajarlos;
hay que pedirlos al Gobierno Autónomo Municipal de Santa Cruz de la Sierra. No se inventa aquí una
URL que no existe.

**Sin ellos el proyecto funciona igual**: `pnpm db:seed:samples` carga capas **sintéticas** de
`data/samples/` —claramente etiquetadas como tales— y coloca reportes de muestra dentro.

Con la entrega real:

```
data/raw/DM_UV_MZ_2025/
  ├── distrito_municipal.shp  .shx  .dbf  .prj  .cpg
  ├── unidad_vecinal.shp      .shx  .dbf  .prj  .cpg
  ├── manzana.shp             .shx  .dbf  .prj  .cpg
  └── MANIFEST.md     ← fuente, fecha, CRS declarado y sha256 de cada archivo
```

```bash
pnpm etl:inspect -- --version DM_UV_MZ_2025            # qué trae, sin tocar nada
pnpm etl:run     -- --version DM_UV_MZ_2025            # reproyectar, validar, simplificar
pnpm etl:load    -- --version DM_UV_MZ_2025 --activar  # cargar en PostGIS y activar la versión
pnpm etl:test                                          # pruebas del ETL
```

El resultado queda en `data/processed/<capa>/<version>/`, con `reporte_calidad.md` (qué
geometrías estaban rotas y qué se hizo con ellas) y `metadata.json` (CRS de origen, número de
features, sha256, versiones de las herramientas).

Reglas duras: **`data/raw/` es inmutable** —si algo del origen está mal, es una entrega nueva con
su propio manifiesto— y todo `data/processed/` se regenera con un comando. Detalle completo en
[CLAUDE.md §6](CLAUDE.md) y en el [manual de operación](docs/operaciones/manual.md).

---

## Frontend

Las dos aplicaciones son Next.js 16 (App Router) con MapLibre GL. Hablan con los servicios por
rutas relativas: Next reenvía `/api/*` a api-core y `/geo/*` a geo-service, así que **todo va por
el mismo origen** y las cookies y el CORS se comportan.

```bash
pnpm --filter web-ciudadano dev      # :3000
pnpm --filter panel-admin dev        # :3100

pnpm --filter web-ciudadano build && pnpm --filter web-ciudadano start
pnpm --filter panel-admin build   && pnpm --filter panel-admin start
```

`pnpm dev` en la raíz levanta las dos y los dos servicios a la vez.

---

## Pruebas

```bash
pnpm lint          # Biome: formato, reglas y accesibilidad
pnpm typecheck     # tsc --noEmit en los 9 paquetes
pnpm test          # Vitest en todo el monorepo
pnpm build         # build de los 7 paquetes que lo tienen
pnpm test:e2e      # Playwright transversal (necesita la pila levantada y sembrada)
```

Seguridad:

```bash
pnpm secretos      # escaneo de secretos en el árbol
pnpm auditoria     # pnpm audit --audit-level high
pnpm privilegios   # matriz real de privilegios (necesita PostgreSQL de verdad)
```

La primera vez, Playwright necesita su navegador:

```bash
pnpm --filter e2e exec playwright install chromium
```

Dos cosas que conviene saber antes de pelearse con una prueba:

- **PGlite es de una sola conexión.** Vale para probar lógica, **no** para probar bloqueos de fila
  ni concurrencia alta. Lo que necesita concurrencia real vive aparte y se omite salvo que le
  pases una base de verdad:

  ```bash
  # La URL de un rol que pueda CREATE DATABASE; sale de tu .env, no se escribe a mano aquí.
  export DATABASE_URL_PG_REAL="${DATABASE_URL%/*}/postgres"
  pnpm --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts
  ```

  Crea su propia base temporal, trabaja dentro y la borra.
- **Cada cuenta puede crear un reporte por hora**, también en las pruebas. Las que necesitan
  varios usan un ayudante que adelanta el reloj de esa cuenta (no apaga el límite) o se crean una
  cuenta por caso.

---

## Seguridad

Mi Curichi guarda **dónde se le inunda la casa a alguien**. Ese es el dato que ordena todo lo
demás.

- **Vista pública y vista técnica son rutas distintas.** `GET /api/v1/reportes` devuelve lo mismo
  a todo el mundo y su manejador **ni siquiera mira la sesión**; la vista con coordenada exacta
  vive en `/api/v1/tecnico/*` y exige rol. Antes era una sola ruta que cambiaba según si llegaba
  una cookie, y eso filtraba ubicaciones exactas al mapa público.
- **La ubicación se degrada** con un desplazamiento determinista de hasta 30 m, sembrado con una
  sal secreta, en los reportes de vivienda. El punto publicable se guarda, así que el filtro por
  bbox no se puede usar como oráculo para recuperar el exacto.
- **Quien reporta no aparece nunca** en la vista pública: ni correo, ni nombre, ni identificador.
- **Autenticación**: Argon2id, cookie `HttpOnly` + `SameSite=Lax` + `Secure` en producción, doble
  caducidad (absoluta y por inactividad), rotación de sesión al entrar, freno de fuerza bruta
  consultado *antes* de verificar la contraseña. Ningún token en `localStorage` ni en la URL.
- **Autorización**: rol exigido por ruta. El autor de un reporte sale **siempre** de la sesión; el
  esquema de entrada no tiene campo de autor, de rol ni de estado.
- **Antiabuso**: cuenta obligatoria para escribir, un reporte por cuenta cada 60 minutos (atómico
  en la base), límites por IP para reportes, lecturas, ingresos y altas de cuenta, idempotencia en
  la creación y honeypot en el formulario.
- **Fotos**: tipo por *magic bytes* (no por extensión), tope de megapíxeles leído en la cabecera
  antes de decodificar, cargadores de libvips que no se usan **bloqueados**, plazo por imagen,
  EXIF eliminado y verificado después de codificar, nombre generado por el servidor.
- **Base de datos**: tres roles con privilegios mínimos, concedidos uno a uno. El rol de la API no
  puede escribir la columna `rol` de `usuario`.
- **Contenedores**: solo lectura, sin capabilities, `no-new-privileges`, tope de procesos, imagen
  base fijada por digest.
- **Secretos**: solo por variables de entorno, con escaneo en pre-commit y en CI.

Documentos: **[SECURITY.md](SECURITY.md)** (cómo reportar una vulnerabilidad) ·
[modelo de seguridad](docs/seguridad/modelo-de-seguridad.md) ·
[auditoría 2026-09](docs/seguridad/auditoria-2026-09.md), donde están los riesgos residuales
aceptados **y las comprobaciones que no se han hecho**. No se afirma que el sistema sea seguro: se
dice qué se probó y qué no.

---

## Problemas comunes

| Síntoma | Qué pasa |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` al instalar | Un paquete con script de instalación no está declarado en `allowBuilds` de `pnpm-workspace.yaml`. Añadilo con `true` (se compila) o `false` (se omite a propósito) y explicá por qué |
| `EBADENGINE` o errores raros de TypeScript | Node equivocado. Pedimos 24 LTS: `node -v` tiene que decir `v24.x`. Con nvm, `nvm use` |
| `Unsupported pnpm version` | `corepack enable` y dejá que use la versión de `packageManager` |
| `docker compose up` falla con `variable is not set` | Faltan `POSTGRES_PASSWORD`, `API_DB_PASSWORD`, `GEO_DB_PASSWORD` o `MINIO_ROOT_PASSWORD` en `.env`. El Compose se niega a levantar sin ellas, a propósito |
| `bind: address already in use` | Otro proceso ocupa 3000, 3001, 3002, 3100, 5432 o 9000. Cambiá el puerto en `.env` o liberalo (`netstat -ano \| findstr :3001` en Windows, `lsof -i :3001` en Linux/macOS) |
| `/ready` devuelve 503 con `"db":"error"` | PostgreSQL todavía no aceptó conexiones. `docker compose ps` hasta que diga `healthy`. Si tarda siempre, revisá `docker compose logs postgis` |
| Las migraciones fallan con `permission denied` | `DATABASE_URL` apunta a `curichi_api` en vez de al rol dueño. Las migraciones van con `curichi` |
| `relation "reporte_inundacion" does not exist` | Falta `pnpm db:migrate` |
| `/ready` dice `"fotos":"error"` y `degradado:true` | MinIO no está. La app sigue sirviendo el mapa y los reportes, pero no guarda ni devuelve fotos. Es intencional: no se saca de rotación por eso |
| El mapa se ve negro | La CSP bloqueó las teselas, o no hay red. Mirá la consola del navegador: MapLibre 6 pide las teselas con `fetch`, así que `tile.openstreetmap.org` tiene que estar en `connect-src` además de `img-src` |
| El mapa no carga y la consola habla del *worker* | El worker de MapLibre se sirve desde `public/maplibre/`. Si falta, `pnpm --filter web-ciudadano build` lo vuelve a copiar |
| No puedo iniciar sesión y api-core responde 401 | Con `COOKIE_SEGURA=1` sobre `http://` el navegador no devuelve la cookie. En local tiene que valer `0` |
| Inicio sesión en el panel y me saca al momento | La sesión caduca por inactividad (`SESION_IDLE_HORAS`) además de por tiempo total. Con relojes desfasados entre el contenedor y la máquina también pasa |
| **429 al enviar un segundo reporte** | Es la cuota: **un reporte por cuenta cada 60 minutos**. No es un fallo. Para probar con varios, creá varias cuentas o bajá `REPORTE_MINUTOS_ENTRE_ENVIOS` **solo en desarrollo** |
| **429 al crear cuentas seguidas** | Límite de altas por IP (5/h). En desarrollo se sube con `REGISTRO_MAX_POR_IP` |
| `pnpm etl:run` no encuentra los shapefiles | `data/raw/<version>/` está vacío. Es normal en un clon limpio: usá las capas sintéticas |
| El ETL se detiene pidiendo el CRS | Falta el `.prj` de una capa. **No se adivina**: hay que preguntarle al municipio y pasarlo con `--crs-origen EPSG:xxxxx` |
| Los E2E fallan con timeouts raros | Suele haber dos pilas compitiendo. Cerrá cualquier `pnpm dev` y dejá que Playwright levante la suya |
| Una variable de entorno nueva «no llega» a un servicio | Turborepo 2 filtra el entorno: hay que declararla en `globalEnv` de `turbo.json` |

---

## Comandos

| | |
|---|---|
| `pnpm dev` | Todo en paralelo (servicios y apps) |
| `pnpm build` · `pnpm lint` · `pnpm lint:fix` · `pnpm typecheck` · `pnpm test` | Monorepo |
| `pnpm test:e2e` | Playwright transversal |
| `pnpm secretos` · `pnpm auditoria` · `pnpm privilegios` | Seguridad |
| `pnpm db:local` · `pnpm db:migrate` · `pnpm db:generate` · `pnpm db:seed:samples` | Base de datos |
| `pnpm etl:inspect` · `pnpm etl:run` · `pnpm etl:load` · `pnpm etl:all` · `pnpm etl:test` | ETL |
| `pnpm contracts:build` | Regenera OpenAPI y `dominio.json` desde Zod |
| `pnpm --filter <paquete> <script>` | Cualquier script de un paquete |

---

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) tiene el flujo completo. Lo esencial: cada tarea pertenece a
**una parte** y toca **una carpeta**; fuera de ahí se documenta y se avisa, no se edita. Conventional
Commits en español con scope (`feat(api-core): ...`), nada directo a `main`, y la lista de
[docs/PR_CHECKLIST.md](docs/PR_CHECKLIST.md) antes de abrir un PR.

Más documentación: [decisiones (ADR)](docs/decisiones/) · [manual de operación](docs/operaciones/manual.md) ·
[respaldo y restauración](docs/operaciones/respaldo-y-restauracion.md) ·
[observabilidad](docs/operaciones/observabilidad.md) ·
[lista para producción](docs/operaciones/produccion.md) · [traspaso](docs/TRASPASO.md).
