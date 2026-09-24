# Docker

Imágenes de los servicios Node y entorno completo con Compose.

> **Estado: verificado en ejecución el 2026-09-15 (Fase 4).** Las imágenes se construyeron, la
> pila se levantó con los cuatro contenedores en `healthy`, las migraciones se aplicaron contra
> PostgreSQL 18.6 + PostGIS 3.6.4 y se corrieron pruebas de carga, concurrencia, resiliencia y un
> simulacro de respaldo y restauración. Lo que sigue sin comprobarse está al final.

## Construir y levantar

```bash
cp .env.example .env    # y completar los secretos
docker compose --profile servicios build
docker compose --profile servicios up -d
```

Sin el perfil, `docker compose up -d` levanta solo PostGIS y MinIO, que es lo que hace falta para
desarrollar con `pnpm dev`.

**Construí de a uno si la máquina va justa de memoria.** Construir los dos en paralelo tumbó el
demonio de BuildKit en una máquina con 8 GB asignados a WSL2 (`failed to receive status: rpc
error: ... EOF`, y el motor de Docker se cayó entero):

```bash
docker build -f infra/docker/servicio.Dockerfile --build-arg PAQUETE=geo-service --build-arg PUERTO=3002 -t mi-curichi-geo-service .
docker build -f infra/docker/servicio.Dockerfile --build-arg PAQUETE=api-core    --build-arg PUERTO=3001 -t mi-curichi-api-core .
```

## Un solo Dockerfile para los dos servicios

`servicio.Dockerfile` está parametrizado con `PAQUETE` y `PUERTO`. Los dos servicios son paquetes
del mismo workspace de pnpm, se construyen igual y solo cambian el nombre y el puerto: dos
archivos casi idénticos se habrían desincronizado a la primera.

| Decisión | Por qué |
|---|---|
| Contexto de build = raíz del repositorio | pnpm necesita ver el workspace entero para resolver los enlaces `workspace:*` de `contracts` y `db`. |
| Manifiestos primero, código después | La capa de `pnpm install` se reaprovecha mientras no cambien las dependencias: reconstruir tras tocar código tarda segundos, no minutos. |
| Tres etapas (`deps`, `build`, `runtime`) | La imagen final no lleva ni el código TypeScript ni las dependencias de desarrollo. |
| `pnpm deploy --prod --legacy` | Deja el paquete con solo sus dependencias de producción y sin enlaces simbólicos al workspace, que es lo único que se copia a la imagen final. |
| `tini` como PID 1 | Recoge procesos zombis y reenvía `SIGTERM` al proceso Node, que es quien tiene el cierre ordenado. |
| `USER node` | Nada corre como root. |
| `HEALTHCHECK` con `node -e`, no con curl | La imagen `slim` no trae curl y añadirlo solo para esto engorda y suma superficie. |
| `API_CORE_HOST=0.0.0.0` | Dentro de un contenedor, escuchar solo en loopback deja el servicio inalcanzable desde los demás contenedores y desde el puerto publicado. |

Tamaño resultante: **api-core 497 MB, geo-service 455 MB**. La mayor parte es la imagen base de
Node (`node:24-slim`) más `sharp` en el caso de api-core.

## `.dockerignore`

Sin él, el contexto de build era el repositorio entero: los `node_modules` de la raíz solos pesan
**960 MB**, más el historial de git, las capas de `data/` y la base local de `infra/.pglite`.
Además `.env` acababa viajando al demonio sin ninguna necesidad.

## Cosas que aparecieron al levantar esto por primera vez

Se dejan escritas porque volverán a pasarle a quien lo monte de cero:

1. **`minio/minio` ya no se puede descargar de Docker Hub** (`pull access denied ... repository
   does not exist`). El Compose apunta ahora a `quay.io/minio/minio` con una versión fija.
2. **La pila corre con `NODE_ENV=production`**, así que `api-core` exige `COOKIE_SEGURA=1`. Con el
   Compose tal cual (HTTP sin TLS) el navegador **no enviará la cookie de sesión**, y por tanto el
   panel administrativo no permite iniciar sesión contra `http://localhost:3001`. Es el
   comportamiento correcto, no un fallo: para probar el panel, o se pone un proxy TLS delante o se
   usa `pnpm dev`, que no corre en modo producción.
3. **Los dos servicios exigen `METRICAS_TOKEN`** si `METRICAS_RUTA` no está vacía. Si falta, el
   contenedor muere en bucle con un mensaje claro en el log.
4. **Docker Desktop puede quedarse colgado por sockets huérfanos.** Si el motor no arranca y el
   log de `com.docker.backend.exe` dice `initializing Inference manager: ... remove
   ...\Docker\run\dockerInference: The file cannot be accessed by the system`, el arreglo es
   renombrar `%LOCALAPPDATA%\Docker\run` y `%LOCALAPPDATA%\docker-secrets-engine` y volver a
   arrancar. No tiene nada que ver con el proyecto.

## Recursos y por qué están así

`postgis` tiene **4 CPU** y los servicios Node 2 cada uno. No es arbitrario: la base es el cuello
de botella con diferencia, y en las pruebas de carga los servicios Node estaban al 0,03 % de CPU
mientras PostgreSQL se saturaba. Con `postgis` limitado a 2 CPU, el listado por bbox daba 20 rps y
433 respuestas 503; con 6 CPU, 117 rps y ninguna. El detalle está en
`docs/operaciones/produccion.md`.

Todos los servicios llevan además rotación de logs (`max-size: 10m`, `max-file: 3`): sin eso, el
log de un contenedor crece hasta llenar el disco del host.

## Lo que sigue SIN comprobarse

| Qué | Por qué |
|---|---|
| Varias réplicas de `api-core` a la vez detrás de un balanceador | El Compose define una sola instancia por servicio (usa `container_name`). Lo que sí se probó es el **arranque concurrente**: ocho procesos aplicando migraciones a la vez contra una base vacía. |
| Despliegue sin corte (rolling update) | Necesita orquestador; Compose reemplaza el contenedor de golpe. |
| Fotos con varias réplicas | `AlmacenDisco` escribe en el volumen del contenedor. Ver la ruta hacia S3 en `docs/operaciones/produccion.md`. |
| El adaptador S3 contra MinIO | MinIO arranca y su bucket se crea, pero ningún código lo usa todavía. |
| TLS, dominio y proxy de entrada | Fase 2 del plan; aquí todo va por HTTP en loopback. |
