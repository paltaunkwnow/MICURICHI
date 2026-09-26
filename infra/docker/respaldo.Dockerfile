# Imagen del trabajo de respaldos (servicio `respaldo`, perfil `respaldos` del Compose). Parte 5.
#
#   docker compose --profile respaldos build respaldo
#
# El contexto de build es `infra/`, no la raíz: la imagen solo necesita su script.
#
# BASE = LA MISMA IMAGEN QUE LA BASE DE DATOS. `pg_dump` tiene que ser de la misma versión mayor
# que el servidor o más nueva (un pg_dump 17 no vuelca un PostgreSQL 18), y la forma más simple de
# no desincronizarlos nunca es usar la imagen del propio servidor, que ya está descargada. Fijada
# por digest y escrita literal (Dependabot solo actualiza FROM literales): una reconstrucción trae
# siempre los mismos binarios. A mano: `docker pull postgis/postgis:18-3.6` y copiar el digest.
FROM postgis/postgis:18-3.6@sha256:60f6ad1d21ea86a67d47780b9a0d1e1d200500f62b19293fa834d0dea80b8677

# rclone habla con cualquier S3 (AWS, R2, B2, Spaces, MinIO…) con la configuración por variables
# de entorno, reintenta, verifica el hash de lo subido y sabe borrar por antigüedad. El de Debian
# (1.60.1, de 2022) es viejo; se instala el paquete oficial con versión y sha256 fijados (tomados de
# https://downloads.rclone.org/v1.75.1/SHA256SUMS el 2026-09-26). Si el hash no coincide, no hay
# imagen.
#
# Ningún ARG empieza por RCLONE_: rclone lee TODA variable de entorno RCLONE_<OPCIÓN> como una
# opción, y un ARG está en el entorno del RUN. Con `RCLONE_VERSION`, `rclone version` fallaba con
# «Invalid value when setting --version from environment variable».
ARG VERSION_RCLONE=v1.75.1
ARG SHA256_RCLONE_AMD64=09c9f7606ed9e31eecc1eec26a89992cf2931a8d2d1a5f0ae2bb1c11630ffb15
ARG SHA256_RCLONE_ARM64=773f3a76615f91f7d4654183a537afddce3343c8d99ac1d74984f060f2ade2d9
ARG TARGETARCH

# gnupg: cifrado simétrico AES-256 con protección de integridad (un byte cambiado hace fallar el
# descifrado). curl: latido al servicio de vigilancia y alertas a Alertmanager.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    arquitectura="${TARGETARCH:-amd64}"; \
    case "$arquitectura" in \
      amd64) suma="$SHA256_RCLONE_AMD64" ;; \
      arm64) suma="$SHA256_RCLONE_ARM64" ;; \
      *) echo "arquitectura sin rclone verificado: $arquitectura" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/rclone.deb \
      "https://downloads.rclone.org/${VERSION_RCLONE}/rclone-${VERSION_RCLONE}-linux-${arquitectura}.deb"; \
    echo "${suma}  /tmp/rclone.deb" | sha256sum -c -; \
    dpkg -i /tmp/rclone.deb; \
    rm -f /tmp/rclone.deb; \
    rm -rf /var/lib/apt/lists/*; \
    rclone version; \
    pg_dump --version

COPY respaldo/respaldo.sh /usr/local/bin/curichi-respaldo
# /trabajo: donde se escribe el volcado antes de cifrarlo. Un volumen con nombre NUEVO hereda el
# dueño de esta carpeta, así que el usuario `postgres` puede escribir sin correr como root.
RUN chmod 0755 /usr/local/bin/curichi-respaldo \
 && mkdir -p /trabajo \
 && chown postgres:postgres /trabajo \
 && chmod 0700 /trabajo

# Sin root: `postgres` (uid 999) ya existe en la imagen. Nada de esto necesita privilegios.
USER postgres
WORKDIR /trabajo
ENV GNUPGHOME=/tmp/gnupg \
    RCLONE_CONFIG=/tmp/rclone.conf
ENTRYPOINT ["/usr/local/bin/curichi-respaldo"]
CMD ["programado"]
