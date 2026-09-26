#!/bin/sh
# Arranque de Prometheus (perfil `observabilidad`). Parte 5.
#
# Prometheus no expande variables de entorno en su configuración, y el contenedor es de solo
# lectura. Este envoltorio deja en el tmpfs /tmp lo que depende del .env y ejecuta Prometheus:
#   - /tmp/metricas_token: el METRICAS_TOKEN que exigen api-core y geo-service en /metrics
#   - /tmp/prometheus.yml: la configuración con el nombre de la instalación en las etiquetas y,
#     en el job `proxy`, los dominios y el modo TLS del proxy de entrada
#
# `arrancar-prometheus.sh comprobar` genera lo mismo y, en vez de arrancar, pasa `promtool check
# config` (reglas incluidas): es lo que corre el CI, con la plantilla real y no con una copia.
set -eu
umask 077

# Un nombre de host y nada más (el mismo criterio que infra/proxy/arrancar.sh): va dentro de un sed.
nombre_valido() {
  case "$1" in
    '' | .* | *. | *..* | *[!A-Za-z0-9.-]*) return 1 ;;
    *) return 0 ;;
  esac
}

if [ -z "${METRICAS_TOKEN:-}" ]; then
  echo "prometheus: ERROR: METRICAS_TOKEN está vacío; es el token que api-core y geo-service exigen en /metrics." >&2
  exit 1
fi
case "${INSTALACION_NOMBRE:-}" in
  '' | *[!a-z0-9-]*)
    echo "prometheus: ERROR: INSTALACION_NOMBRE solo admite minúsculas, números y guiones." >&2
    exit 1
    ;;
esac

# La entrada por el proxy (job `proxy`): los mismos nombres y el mismo modo que el servicio `proxy`.
if ! nombre_valido "${DOMINIO_PUBLICO:-}" || ! nombre_valido "${DOMINIO_PANEL:-}"; then
  echo "prometheus: ERROR: DOMINIO_PUBLICO y DOMINIO_PANEL tienen que ser los nombres de host del proxy (sin https:// ni puerto)." >&2
  exit 1
fi
PROXY_TLS="${PROXY_TLS:-acme}"
case "$PROXY_TLS" in
  acme) modulo=https_publico url=https://proxy:8443 ;;
  interno) modulo=https_interno url=https://proxy:8443 ;;
  no) modulo=http_app url=http://proxy:8080 ;;
  *)
    echo "prometheus: ERROR: PROXY_TLS=«$PROXY_TLS» no es válido: acme, interno o no." >&2
    exit 1
    ;;
esac

printf '%s' "$METRICAS_TOKEN" >/tmp/metricas_token
unset METRICAS_TOKEN
sed -e "s/__INSTALACION__/${INSTALACION_NOMBRE}/" \
  -e "s/__DOMINIO_PUBLICO__/${DOMINIO_PUBLICO}/g" \
  -e "s/__DOMINIO_PANEL__/${DOMINIO_PANEL}/g" \
  -e "s/__PROXY_TLS__/${PROXY_TLS}/g" \
  -e "s/__MODULO_PROXY__/${modulo}/" \
  -e "s#__URL_PROXY__#${url}#g" \
  /etc/prometheus/prometheus.yml >/tmp/prometheus.yml

if [ "${1:-}" = comprobar ]; then
  exec /bin/promtool check config /tmp/prometheus.yml
fi

exec /bin/prometheus \
  --config.file=/tmp/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time="${PROMETHEUS_RETENCION:-30d}" \
  --storage.tsdb.retention.size="${PROMETHEUS_RETENCION_TAMANO:-5GB}" \
  --web.listen-address=:9090
