# Docker

Imágenes de los servicios Node, de las dos apps Next, del proxy de entrada y del trabajo de
respaldos, y entorno completo con Compose.

| Dockerfile | Imagen | Contexto | Qué excluye del contexto |
|---|---|---|---|
| `servicio.Dockerfile` | api-core, geo-service (`PAQUETE`, `PUERTO`) | raíz | `/.dockerignore` (lista negra) |
| `app.Dockerfile` | web-ciudadano, panel-admin (`APP`, `PUERTO`) | raíz | `app.Dockerfile.dockerignore` (lista **blanca**) |
| `proxy.Dockerfile` | proxy de entrada (Caddy) | `infra/` | `proxy.Dockerfile.dockerignore` (solo `proxy/`) |
| `respaldo.Dockerfile` | trabajo de respaldos | `infra/` | `respaldo.Dockerfile.dockerignore` |

BuildKit usa el `<Dockerfile>.dockerignore` que está junto al Dockerfile antes que el de la raíz.

> **Estado: verificado en ejecución el 2026-09-15 (Fase 4)** y revisado para producción el
> 2026-09-26: job de migraciones, perfiles `minio`, `respaldos` y `observabilidad`, escalado sin
> `container_name`. Lo que sigue sin comprobarse está al final.

## Construir y levantar

```bash
cp .env.example .env    # y completar los secretos
docker compose --profile servicios build
docker compose --profile servicios --profile minio up -d
```

Sin perfiles, `docker compose up -d` levanta solo PostgreSQL, que es lo que hace falta para
desarrollar con `pnpm dev`. Los perfiles y qué trae cada uno están en
[`docs/operaciones/manual.md`](../../docs/operaciones/manual.md#docker).

**Construí de a uno si la máquina va justa de memoria.** Construir los dos en paralelo tumbó el
demonio de BuildKit en una máquina con 8 GB asignados a WSL2 (`failed to receive status: rpc
error: ... EOF`, y el motor de Docker se cayó entero):

```bash
docker compose --profile servicios build geo-service
docker compose --profile servicios build api-core
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
| `pnpm deploy --prod --legacy` | Deja el paquete con solo sus dependencias de producción y sin enlaces simbólicos al workspace, que es lo único que se copia a la imagen final. **Solo dentro del build**: en la máquina reinstala el workspace sin dependencias de desarrollo. |
| `node_modules/db` incluye `dist/cli/migrar.js` y `migraciones/` | Es lo que ejecuta el job `migraciones` del Compose con la imagen de api-core. El CI comprueba que está. |
| Base `node:24.21.0-slim@sha256:…` escrita en los dos `FROM` | Versión exacta y digest: una reconstrucción trae siempre el mismo binario. Literal y no con `ARG` porque Dependabot solo actualiza `FROM` literales, y es él quien abre el PR cuando sale un parche de Node. El build falla si la base trae otra versión mayor que la LTS (`NODE_MAYOR`). |
| `/datos/fotos` creada con dueño `node` | Un volumen con nombre NUEVO copia dueño y permisos de la carpeta de la imagen. Sin ella, `fotos-data` nacía `root:root` y api-core (que corre como `node`) no podía escribir la primera foto. |
| `tini` como PID 1 | Recoge procesos zombis y reenvía `SIGTERM` al proceso Node, que es quien tiene el cierre ordenado. |
| `USER node` | Nada corre como root. |
| `HEALTHCHECK` con `node -e`, no con curl | La imagen `slim` no trae curl y añadirlo solo para esto engorda y suma superficie. |
| `API_CORE_HOST=0.0.0.0` | Dentro de un contenedor, escuchar solo en loopback deja el servicio inalcanzable desde los demás contenedores y desde el puerto publicado. |

Tamaño resultante: **api-core ~507 MB, geo-service ~455 MB**. La mayor parte es la imagen base de
Node más `sharp` en el caso de api-core.

**Volumen de fotos creado antes de este cambio** (queda `root:root`, porque Docker solo copia el
dueño al crear el volumen): una vez, con api-core parado,

```bash
docker run --rm -v mi-curichi_fotos-data:/datos/fotos busybox chown -R 1000:1000 /datos/fotos
```

### Actualizar la imagen base de Node

Normalmente llega sola como PR de Dependabot. A mano: `docker pull node:<versión>-slim`, copiar el
digest que imprime (`Digest: sha256:…`) y cambiarlo, con la versión, en **los dos** `FROM`. Después
`docker compose --profile servicios build` y `docker run --rm mi-curichi-api-core:local node -v`.

## Imagen de las apps Next

`app.Dockerfile`, un solo archivo para las dos (`--build-arg APP=web-ciudadano|panel-admin`,
`PUERTO=3000|3100`), con la misma base de Node fijada por digest que los servicios. **Una imagen
sirve a cualquier ciudad**: no hay ningún ARG de despliegue; `API_CORE_URL`, `GEO_SERVICE_URL`,
`PROXY_DE_CONFIANZA` y `HSTS` los lee `src/proxy.ts` en cada petición y la ciudad llega de api-core.
El build lo comprueba: todas las rutas salen `ƒ (Dynamic)` y ningún manifiesto lleva una URL de
desarrollo.

| Decisión | Por qué |
|---|---|
| Etapa `deps` compartida | No depende de `APP`: instala el workspace de las dos apps y `contracts`, así la capa cara (next, react, maplibre) se construye una vez para las dos imágenes. |
| `pnpm --filter <app> build` corre su `prebuild` | Copia el worker de MapLibre a `public/maplibre/` desde el paquete instalado (no se versiona). El build **falla** si no quedó: sin él el mapa se queda sin nada vectorial y sin avisar. |
| `output: 'standalone'` | `.next/standalone/apps/<app>/server.js` con solo las dependencias que usa. `public/` y `.next/static` se copian aparte, en la etapa de build. |
| Sin sharp ni libvips | Entran en el trazado porque `next` los declara para `/_next/image`, y ninguna app usa `next/image`. Se borran del standalone (y el build falla si siguen): la app pasa de 48 a 29 MB y la imagen de 377 a 350 MiB (medido el 2026-09-26). Sin sharp, Next sirve `/_next/image` sin optimizar y escribe en su caché: el proxy corta esa ruta. Si una app empieza a usar `next/image`, quitar las dos cosas. |
| El código queda de `root`, el proceso corre como `node` | Aunque alguien ejecutara código dentro, no puede reescribir la app. `.next/cache` (lo único donde Next escribiría) es de `node` y en el Compose va en tmpfs. |
| `HOSTNAME=0.0.0.0` en la imagen | `server.js` escucha en `HOSTNAME`, y Docker lo rellena con el nombre del contenedor si la imagen no lo define: escucharía solo en la IP del contenedor y el HEALTHCHECK (127.0.0.1) no llegaría. |
| HEALTHCHECK a `/icono.svg` con `node -e` | Sin curl. Mide que la app sirve (pasa por `src/proxy.ts`) sin depender de api-core, y falla si a la imagen le faltara `public/`. |
| Lista blanca en `app.Dockerfile.dockerignore` | Con la lista negra entraba cualquier cosa no nombrada, incluido un `apps/<app>/.env.local` que `next build` lee. Contexto resultante: ~580 KB. |

Tamaño: **350 MiB** cada una (antes de quitar sharp, 377), casi todo la base de Node; la app en
sí son 29–30 MB. En reposo, **~85 MB** de memoria.

## Imagen del proxy de entrada

`proxy.Dockerfile`, contexto `infra/`: Caddy 2.11.4 (alpine, fijado por digest) con
`infra/proxy/Caddyfile` y `infra/proxy/arrancar.sh` **horneados**. No se monta la configuración:
Docker Desktop no puede montar carpetas de `A:` en contenedores nuevos (punto 5 de abajo), y así lo
que se probó es lo que se despliega. Qué hace y por qué: el propio Caddyfile y
[`produccion.md`](../../docs/operaciones/produccion.md#topología).

| Decisión | Por qué |
|---|---|
| Sin root: usuario `caddy` (10001), escucha en 8080/8443 | El Compose publica 80 y 443. Caddy no añade esos puertos internos a sus redirecciones y atiende los desafíos ACME en ellos. |
| `setcap -r /usr/bin/caddy` | La imagen oficial le pone NET_BIND_SERVICE al binario. Con `cap_drop: ALL` el kernel se niega a ejecutar un binario con capabilities de archivo que no puede conceder: `exec /usr/bin/caddy: operation not permitted` (comprobado). |
| `arrancar.sh` antes de Caddy | Caddy arrancaría con un dominio vacío. El script para con la lista de lo que falta: dominios vacíos o iguales, con esquema o puerto, modo desconocido, `ACME_EMAIL` con `acme`. |
| `caddy fmt` y `caddy validate` en los tres modos al construir | Un Caddyfile roto o sin formatear no llega a ser imagen. |
| `/data` en un volumen (`proxy-datos`) | Certificados, cuenta ACME y CA interna. Sin él, cada arranque pediría certificados nuevos y Let's Encrypt limita cuántos por semana. |
| HEALTHCHECK con `wget` (busybox) a `127.0.0.1:8099` | Un sitio de salud que solo escucha en loopback. |

Tamaño: **~154 MB**. En reposo, **~11 MB** de memoria.

## Imagen del trabajo de respaldos

`respaldo.Dockerfile`, contexto `infra/`. Parte de la **misma imagen que la base**
(`postgis/postgis:18-3.6`, fijada por digest) para que `pg_dump` sea siempre de la versión del
servidor, y añade gnupg, curl y rclone 1.75.1 (el paquete oficial, verificado con su sha256; el de
Debian es de 2022). Corre como `postgres`, sin root. El script es `infra/respaldo/respaldo.sh` y el
procedimiento, [`docs/operaciones/respaldo-y-restauracion.md`](../../docs/operaciones/respaldo-y-restauracion.md).

Un detalle que costó un build: ningún `ARG` del Dockerfile puede empezar por `RCLONE_`, porque
rclone toma toda variable `RCLONE_<OPCIÓN>` del entorno como una opción (`RCLONE_VERSION` era
`--version` y rompía el build).

## `.dockerignore`

Sin él, el contexto de build era el repositorio entero: los `node_modules` de la raíz solos pesan
**960 MB**, más el historial de git, las capas de `data/` y la base local de `infra/.pglite`.
Además `.env` acababa viajando al demonio sin ninguna necesidad.

## Cosas que aparecieron al levantar esto

Se dejan escritas porque volverán a pasarle a quien lo monte de cero:

1. **MinIO ya no publica imágenes.** `minio/minio` desapareció de Docker Hub (Fase 4) y, desde el
   24-09-2026, `quay.io/minio/minio` responde 401 a las descargas anónimas: la edición comunitaria
   se archivó en abril de 2026. El perfil `minio` usa `ghcr.io/coollabsio/minio` en
   RELEASE.2025-10-15T17-29-55Z (la versión con el parche de CVE-2025-62506), compilada desde el
   código oficial y fijada por digest. Es solo para desarrollo: en producción, S3 gestionado
   ([`produccion.md`](../../docs/operaciones/produccion.md#fotos-en-producción-s3-gestionado-no-minio)).
   La imagen (ubi-micro) no trae `grep` ni `sed`: `infra/minio/inicializar.sh` usa `case`.
2. **La pila corre con `NODE_ENV=production`**, así que `api-core` exige `COOKIE_SEGURA=1` (el
   Compose lo fija). Un cliente que no sea navegador solo devuelve una cookie `Secure` por HTTPS:
   desde el 2026-09-26 la pila tiene su proxy TLS delante, y con `PROXY_TLS=interno` el login del
   panel se prueba con `curl -k https://panel.curichi.localhost:8443/…`.
3. **Los dos servicios exigen `METRICAS_TOKEN`** si `METRICAS_RUTA` no está vacía. Si falta, el
   contenedor muere en bucle con un mensaje claro en el log.
4. **Docker Desktop puede quedarse colgado por sockets huérfanos.** Si el motor no arranca y el
   log de `com.docker.backend.exe` dice `initializing Inference manager: ... remove
   ...\Docker\run\dockerInference: The file cannot be accessed by the system`, el arreglo es
   renombrar `%LOCALAPPDATA%\Docker\run` y `%LOCALAPPDATA%\docker-secrets-engine` y volver a
   arrancar. No tiene nada que ver con el proyecto.
5. **Docker Desktop y la unidad `A:`** (2026-09-26): los contenedores nuevos no podían montar
   carpetas de `A:` (`mkdir /run/desktop/mnt/host/a: file exists`); los ya creados seguían bien.
   Las pruebas de ese día se hicieron con una copia de `infra/` en `C:`. Construir sí funciona (el
   contexto lo envía el cliente, no es un montaje): por eso la configuración del proxy va horneada.
   geo-service monta `data/processed`: para la verificación de las apps y el proxy se usó un
   `-f override.yml` fuera del repositorio con `volumes: !override` hacia una copia en `C:`.
6. **Una variable obligatoria (`:?`) en un servicio de un perfil rompe TODO el Compose**, aunque
   el perfil no se use: `docker compose up -d postgis` fallaba en un clon nuevo por `IP_HASH_SAL`.
   Por eso los servicios de perfil no llevan `:?`; validan ellos al arrancar. El CI comprueba el
   Compose con el `.env.example` tal cual.

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
| Varias réplicas de `api-core` detrás de un balanceador | El Compose ya lo permite (`--scale`, sin `container_name`), pero no se ha medido detrás de un proxy real. Lo que sí se probó es el **arranque concurrente**: ocho procesos aplicando migraciones a la vez contra una base vacía (y el CI lo repite en cada PR). |
| Despliegue sin corte (rolling update) | Necesita orquestador; Compose reemplaza el contenedor de golpe. El proxy reintenta 5 s en otra réplica, lo que con dos réplicas de una app disimula el cambio, pero no está automatizado. |
| La pila completa levantada con los perfiles `respaldos` y `observabilidad` a la vez | Cada pieza se probó por separado el 2026-09-26 (respaldo, restauración y retención contra un MinIO desechable; Prometheus, Alertmanager y blackbox arrancando con sus envoltorios), no todo junto en un servidor. |
| Certificados públicos (`PROXY_TLS=acme`) | Hace falta un dominio que apunte a la máquina. El proxy se probó el 2026-09-26 con la CA interna (`PROXY_TLS=interno`), con las apps y los servicios detrás; el modo `acme` solo se validó (`caddy validate`, al construir). |
| El DNS público y el cortafuegos | Las sondas del perfil `observabilidad` entran por el contenedor del proxy, no desde internet: hace falta un vigilante externo. |
