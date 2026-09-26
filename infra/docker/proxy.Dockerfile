# Proxy de entrada de Mi Curichi: Caddy con la configuración HORNEADA. Parte 5.
#
#   docker build -f infra/docker/proxy.Dockerfile -t mi-curichi-proxy:local infra
#
# Contexto = infra/ (solo entra infra/proxy/, ver proxy.Dockerfile.dockerignore). La configuración
# va dentro de la imagen y no montada: Docker Desktop no puede montar carpetas de la unidad A: en
# contenedores nuevos (infra/docker/README.md), y así lo que se probó es exactamente lo que se
# despliega. Qué hace el Caddyfile y por qué: infra/proxy/Caddyfile y docs/operaciones/produccion.md.
#
# Base fijada por versión Y digest, como las demás: una etiqueta sigue diciendo «2.11» mientras sirve
# lo que haya en la caché. Dependabot (ecosistema docker, /infra/docker) propone las nuevas.
# Actualizar a mano: `docker buildx imagetools inspect caddy:<versión>-alpine` y copiar el Digest.
FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

# 1) Sin root. La imagen oficial corre como root y le pone al binario la capability
#    NET_BIND_SERVICE para poder abrir 80 y 443. Aquí escucha en 8080/8443 (el Compose publica 80 y
#    443), así que no la necesita, y además ESTORBA: con `cap_drop: ALL` el kernel se niega a
#    ejecutar un binario con capabilities de archivo que no puede conceder («exec /usr/bin/caddy:
#    operation not permitted», comprobado el 2026-09-26). Se le quita.
# 2) /data guarda los certificados, la cuenta ACME y la CA de `tls internal`: en el Compose es un
#    volumen con nombre, y un volumen NUEVO copia dueño y permisos de esta carpeta.
RUN setcap -r /usr/bin/caddy \
 && addgroup -S -g 10001 caddy \
 && adduser -S -D -H -u 10001 -G caddy -h /data -s /sbin/nologin caddy \
 && mkdir -p /data/caddy /config/caddy \
 && chown -R caddy:caddy /data /config \
 && chmod 0700 /data/caddy

COPY --chmod=0444 proxy/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=0555 proxy/arrancar.sh /usr/local/bin/arrancar-proxy

# La configuración se comprueba AL CONSTRUIR, en los tres modos: un Caddyfile roto no llega a ser
# imagen. Con nombres de ejemplo y un directorio de datos temporal (`tls internal` genera ahí una CA
# al validar; no puede quedar en la imagen). `caddy fmt` sale con 1 si el archivo no está en su
# formato canónico (Caddy lo avisaría en cada arranque): `caddy fmt --overwrite` lo arregla.
RUN caddy fmt /etc/caddy/Caddyfile > /dev/null \
 && for modo in acme interno no; do \
      env XDG_DATA_HOME=/tmp/validar XDG_CONFIG_HOME=/tmp/validar PROXY_TLS="$modo" \
          DOMINIO_PUBLICO=mapa.ejemplo.org DOMINIO_PANEL=panel.ejemplo.org ACME_EMAIL=ti@ejemplo.org \
        caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
      || { echo "El Caddyfile no valida con PROXY_TLS=$modo" >&2; exit 1; }; \
    done \
 && rm -rf /tmp/validar

USER caddy
WORKDIR /data
EXPOSE 8080 8443
# wget viene en la base (busybox): no hace falta añadir curl. /salud solo escucha en 127.0.0.1.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8099/ || exit 1
# `arrancar-proxy` valida las variables y hace `exec caddy run`: Caddy queda como PID 1 y atiende
# SIGTERM con su cierre ordenado (grace_period). Al definir ENTRYPOINT, el CMD de la base se anula.
ENTRYPOINT ["/usr/local/bin/arrancar-proxy"]
