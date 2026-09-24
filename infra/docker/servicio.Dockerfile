# Imagen de producción para los servicios Node del monorepo (api-core y geo-service).
#
# Un solo Dockerfile parametrizado en vez de dos casi idénticos: los dos son paquetes pnpm del
# mismo workspace, se construyen igual y solo cambian el nombre del paquete y el puerto.
#
#   docker build -f infra/docker/servicio.Dockerfile --build-arg PAQUETE=api-core    -t curichi/api-core .
#   docker build -f infra/docker/servicio.Dockerfile --build-arg PAQUETE=geo-service -t curichi/geo-service .
#
# LA IMAGEN BASE VA FIJADA POR VERSIÓN EXACTA Y POR DIGEST.
#
# `node:24-slim` es una etiqueta flotante, y eso ya se pagó una vez: la auditoría de seguridad
# encontró los dos contenedores corriendo **Node 24.15.0** aunque la imagen se había construido el
# 18-09-2026, porque el build reutilizó una base vieja que seguía en la caché local de Docker.
# Node 24.15.0 arrastra los 11 CVE corregidos en 24.18.1 (publicados el 28-07-2026), tres de ellos
# de severidad alta, y entre ellos CVE-2026-58044: truncado de cabeceras en el parser HTTP que
# habilita *request smuggling*. Es justo el escenario de este despliegue, que lleva un proxy
# delante. Una etiqueta flotante no avisa de nada: sigue diciendo «24» mientras sirve lo viejo.
#
# Con el digest, una reconstrucción trae SIEMPRE el mismo binario, haya caché o no. Para
# actualizar: `docker pull node:<nueva>-slim`, copiar el digest que imprime y cambiar los dos ARG
# de abajo. El procedimiento y la comprobación posterior están en `infra/docker/README.md`.
ARG NODE_VERSION=24.21.0
ARG NODE_DIGEST=sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

# --- 1) Dependencias del workspace ------------------------------------------------------------
# El contexto de build es la RAÍZ del repositorio: pnpm necesita ver el workspace entero para
# resolver los enlaces `workspace:*` (contracts y db).
FROM node:${NODE_VERSION}-slim@${NODE_DIGEST} AS deps
ENV PNPM_HOME=/pnpm CI=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
# Primero solo los manifiestos: así la capa de dependencias se reaprovecha mientras no cambien,
# que es lo que hace que una reconstrucción tras tocar código tarde segundos y no minutos.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY services/api-core/package.json services/api-core/
COPY services/geo-service/package.json services/geo-service/
# --ignore-scripts no: sharp necesita su binario nativo para la plataforma de la imagen.
RUN pnpm install --frozen-lockfile

# --- 2) Compilación ---------------------------------------------------------------------------
FROM deps AS build
ARG PAQUETE
WORKDIR /repo
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY services/api-core services/api-core
COPY services/geo-service services/geo-service
COPY tsconfig.base.json ./
# `contracts` y `db` son dependencias de build de ambos servicios (tipos y cliente).
RUN pnpm --filter contracts build \
 && pnpm --filter db build \
 && pnpm --filter "${PAQUETE}" build
# `deploy` deja en /salida el paquete con SOLO sus dependencias de producción y sin enlaces
# simbólicos al workspace: es lo que se copia a la imagen final.
RUN pnpm --filter "${PAQUETE}" --prod --legacy deploy /salida

# --- 3) Imagen final --------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim@${NODE_DIGEST} AS runtime
ARG NODE_VERSION
ARG PAQUETE
ARG PUERTO=3001
ENV NODE_ENV=production \
    PAQUETE=${PAQUETE} \
    PUERTO=${PUERTO}
# tini como PID 1: recoge procesos zombis y reenvía SIGTERM al proceso Node, que es quien tiene
# el cierre ordenado (cierra el servidor y el pool antes de salir).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
# El binario que se va a ejecutar tiene que ser el que dice el ARG. Es barato y cierra la puerta
# a que una base cacheada o un `--build-arg` a medias dejen otra vez un runtime viejo en marcha
# sin que nadie lo note: si no coincide, el build falla aquí y no hay imagen que desplegar.
RUN test "v${NODE_VERSION}" = "$(node -v)" \
 || { echo "ERROR: la imagen base trae $(node -v) y se esperaba v${NODE_VERSION}" >&2; exit 1; }
# Usuario sin privilegios. La imagen de Node ya trae `node` (uid 1000); no se crea otro.
WORKDIR /app
COPY --from=build --chown=node:node /salida /app
USER node
EXPOSE ${PUERTO}
# 0.0.0.0 y no el 127.0.0.1 por defecto: dentro de un contenedor, escuchar solo en loopback deja
# el servicio inalcanzable desde los demás contenedores y desde el puerto publicado.
ENV API_CORE_HOST=0.0.0.0 \
    GEO_SERVICE_HOST=0.0.0.0
# El healthcheck usa Node y no curl: la imagen slim no trae curl y añadirlo solo para esto
# engorda la imagen y suma superficie.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PUERTO+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/servidor.js"]
