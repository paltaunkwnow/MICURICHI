# Imagen de producción de las apps Next.js del monorepo (web-ciudadano y panel-admin).
#
# Un solo Dockerfile para las dos, como servicio.Dockerfile para los servicios: son paquetes del
# mismo workspace, se construyen igual y solo cambian el nombre y el puerto.
#
#   docker build -f infra/docker/app.Dockerfile --build-arg APP=web-ciudadano --build-arg PUERTO=3000 -t mi-curichi-web-ciudadano:local .
#   docker build -f infra/docker/app.Dockerfile --build-arg APP=panel-admin   --build-arg PUERTO=3100 -t mi-curichi-panel-admin:local .
#
# UNA IMAGEN SIRVE A CUALQUIER CIUDAD. Nada de lo que depende del despliegue se fija al compilar:
# adónde se reenvían /api y /geo (API_CORE_URL, GEO_SERVICE_URL), si hay un proxy de confianza
# delante (PROXY_DE_CONFIANZA) y HSTS los lee `src/proxy.ts` en cada petición, y la ciudad llega de
# api-core (GET /api/v1/configuracion). Por eso aquí no hay ningún ARG de despliegue.
#
# Contexto de build = raíz del repositorio (pnpm necesita el workspace para resolver `contracts`),
# recortado por app.Dockerfile.dockerignore a lo que las dos apps necesitan.
#
# Base: la MISMA que servicio.Dockerfile, por versión exacta y digest, escrita en los dos FROM (el
# porqué y cómo actualizarla, en ese archivo y en infra/docker/README.md).
ARG NODE_MAYOR=24

# --- 1) Dependencias ------------------------------------------------------------------------------
# No depende de APP: las dos imágenes comparten esta capa, que es la cara (next, react, maplibre).
FROM node:24.21.0-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS deps
ENV PNPM_HOME=/pnpm CI=1 HUSKY=0 NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
# Primero solo los manifiestos: la capa de dependencias se reaprovecha mientras no cambien.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web-ciudadano/package.json apps/web-ciudadano/
COPY apps/panel-admin/package.json apps/panel-admin/
# Con scripts de instalación: sharp y el compilador de Tailwind traen binarios nativos.
RUN pnpm install --frozen-lockfile

# --- 2) Compilación -------------------------------------------------------------------------------
FROM deps AS build
ARG APP
RUN case "${APP}" in \
      web-ciudadano|panel-admin) ;; \
      *) echo "APP tiene que ser web-ciudadano o panel-admin (vale «${APP}»)" >&2; exit 1 ;; \
    esac
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/${APP} apps/${APP}
# `contracts` primero: la app lo importa desde su `dist/`. `build` de la app corre antes su
# `prebuild`, que copia el worker de MapLibre a public/maplibre/ (no se versiona: sale del paquete
# instalado). Si no está, el mapa se queda sin nada vectorial y sin avisar, así que se comprueba.
RUN pnpm --filter contracts build \
 && pnpm --filter "${APP}" build \
 && test -f "apps/${APP}/public/maplibre/maplibre-gl-worker.mjs" \
 && test -f "apps/${APP}/.next/standalone/apps/${APP}/server.js"
# `output: 'standalone'` deja en .next/standalone un servidor mínimo con SOLO lo que la app usa,
# con la raíz del trazado en la del monorepo. `public/` y `.next/static` no se copian solos: se
# juntan aquí para que la imagen final sea una sola copia.
RUN cp -r "apps/${APP}/public" "apps/${APP}/.next/standalone/apps/${APP}/public" \
 && cp -r "apps/${APP}/.next/static" "apps/${APP}/.next/standalone/apps/${APP}/.next/static"
# sharp y libvips (~19 MB de los ~48 de la app) entran en el trazado porque `next` los declara para
# optimizar imágenes en `/_next/image`, y ninguna de las dos apps usa `next/image`. Fuera: menos peso
# y menos superficie (libvips decodifica formatos de imagen de terceros). Next solo carga sharp al
# atender `/_next/image`, así que el servidor arranca y sirve igual; esa ruta, que ya no tiene nada
# detrás, la corta el proxy (infra/proxy/Caddyfile). Si una app empieza a usar `next/image`, este
# paso sobra. Después quedan enlaces simbólicos de pnpm que apuntaban a lo borrado: fuera también.
RUN set -e; \
    cd "apps/${APP}/.next/standalone"; \
    rm -rf node_modules/.pnpm/sharp@* node_modules/.pnpm/@img+*; \
    find . -xtype l -delete; \
    rmdir node_modules/.pnpm/node_modules/@img 2>/dev/null || true; \
    if ls node_modules/.pnpm | grep -qE '^(sharp@|@img\+)' || [ -e node_modules/.pnpm/node_modules/sharp ]; then \
      echo "sharp sigue en el standalone: ¿cambió el trazado de Next o el diseño de pnpm?" >&2; exit 1; \
    fi

# --- 3) Imagen final ------------------------------------------------------------------------------
FROM node:24.21.0-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
ARG NODE_MAYOR
ARG APP
ARG PUERTO=3000
# HOSTNAME=0.0.0.0 es imprescindible: server.js escucha en HOSTNAME, y Docker lo rellena con el
# nombre del contenedor si la imagen no lo define. Escuchando en esa IP, el HEALTHCHECK (127.0.0.1)
# no llega y el contenedor queda «unhealthy» para siempre.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP=${APP} \
    PORT=${PUERTO} \
    HOSTNAME=0.0.0.0
# tini como PID 1: recoge procesos zombis y reenvía SIGTERM a Node.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
# Solo Node LTS (CLAUDE.md §8.1): el build falla si la base trae otra versión mayor.
RUN node -v \
 && case "$(node -v)" in "v${NODE_MAYOR}".*) ;; \
      *) echo "ERROR: la imagen base trae $(node -v) y aquí solo va Node ${NODE_MAYOR} LTS" >&2; exit 1 ;; \
    esac
WORKDIR /app
# El código queda de root y el proceso corre como `node`: aunque alguien ejecutara código dentro,
# no puede reescribir la app (en el Compose, además, el sistema de archivos es de solo lectura).
COPY --from=build /repo/apps/${APP}/.next/standalone /app
# La única carpeta en la que Next escribiría (caché de `next/image` e incremental). Hoy ninguna de
# las dos apps la usa; queda con dueño `node` para que un uso futuro no falle con EACCES, y en el
# Compose va en tmpfs porque el resto es de solo lectura.
RUN mkdir -p "/app/apps/${APP}/.next/cache" && chown node:node "/app/apps/${APP}/.next/cache"
WORKDIR /app/apps/${APP}
USER node
EXPOSE ${PUERTO}
# Sin curl (la base slim no lo trae): Node pide un archivo de public/ que tienen las dos apps. Pasa
# por `src/proxy.ts` pero no por api-core: mide que la app sirve, no que los servicios respondan
# (eso lo miden sus propios healthchecks). Y si faltara public/ en la imagen, falla.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/icono.svg').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
