#!/bin/sh
# Arranque de Alertmanager (perfil `observabilidad`). Parte 5.
#
# La URL del webhook suele llevar el secreto dentro (Slack, Teams, ntfy…), así que llega por
# variable de entorno y se deja en el tmpfs /tmp para `url_file`. Sin ella, Alertmanager arranca
# igual con una configuración sin destino y lo avisa: mejor ver las alertas en la interfaz que no
# tener Alertmanager.
set -eu
umask 077

configuracion=/etc/alertmanager/alertmanager.yml
if [ -n "${ALERTAS_WEBHOOK_URL:-}" ]; then
  printf '%s' "$ALERTAS_WEBHOOK_URL" >/tmp/webhook_url
else
  echo "alertmanager: AVISO: ALERTAS_WEBHOOK_URL está vacía. Las alertas se ven en la interfaz (127.0.0.1:9093) pero NO salen de esta máquina." >&2
  configuracion=/etc/alertmanager/sin-destino.yml
fi
unset ALERTAS_WEBHOOK_URL

# --cluster.listen-address vacío: un solo Alertmanager, sin modo de alta disponibilidad.
set -- \
  --config.file="$configuracion" \
  --storage.path=/alertmanager \
  --cluster.listen-address= \
  --web.listen-address=:9093
if [ -n "${ALERTAS_URL_EXTERNA:-}" ]; then
  set -- "$@" --web.external-url="$ALERTAS_URL_EXTERNA"
fi
exec /bin/alertmanager "$@"
