#!/bin/sh
# Arranque del proxy de entrada (Parte 5). Comprueba la configuración y cede el proceso a Caddy.
#
# Caddy no tiene variables obligatorias: con un dominio vacío arrancaría igual y serviría otra cosa
# (o pediría certificados para un nombre que no es), y un modo mal escrito daría un error críptico.
# Aquí se para con la lista de motivos. Mismo criterio que api-core con NODE_ENV=production.
#
# Los errores no son `:?` del Compose a propósito: un `:?` en un servicio de un perfil rompe TODO el
# Compose, también `docker compose up -d postgis` en una máquina de desarrollo.
set -eu

PROXY_TLS="${PROXY_TLS:-acme}"
export PROXY_TLS

fallos=""
anotar() {
	fallos="${fallos}
 - $1"
}

# Un nombre de host y nada más: sin esquema, sin puerto, sin ruta. Con `https://` delante Caddy lo
# tomaría como otra dirección de sitio, y con un puerto dejaría de escuchar en 443.
nombre_valido() {
	case "$1" in
		"" | .* | *. | *..* | *[!A-Za-z0-9.-]*) return 1 ;;
		*) return 0 ;;
	esac
}

comprobar_dominio() {
	if [ -z "$2" ]; then
		anotar "$1 está vacía (p. ej. mapa.ciudad.gob.bo y panel.ciudad.gob.bo)"
	elif ! nombre_valido "$2"; then
		anotar "$1=«$2» no es un nombre de host (sin https://, sin puerto, sin ruta)"
	fi
}
comprobar_dominio DOMINIO_PUBLICO "${DOMINIO_PUBLICO:-}"
comprobar_dominio DOMINIO_PANEL "${DOMINIO_PANEL:-}"

# La cookie de sesión no distingue puertos ni rutas: con el mismo nombre, el navegador mandaría la
# sesión del técnico también a la app pública (docs/operaciones/produccion.md, «HTTP y red»).
if [ -n "${DOMINIO_PUBLICO:-}" ] && [ "${DOMINIO_PUBLICO:-}" = "${DOMINIO_PANEL:-}" ]; then
	anotar "DOMINIO_PUBLICO y DOMINIO_PANEL tienen que ser nombres distintos"
fi

case "$PROXY_TLS" in
	acme)
		if [ -z "${ACME_EMAIL:-}" ]; then
			anotar "ACME_EMAIL está vacía: la cuenta ACME de los certificados necesita un correo"
		else
			case "$ACME_EMAIL" in
				*@*.*) ;;
				*) anotar "ACME_EMAIL=«$ACME_EMAIL» no parece un correo" ;;
			esac
		fi
		;;
	interno | no) ;;
	*) anotar "PROXY_TLS=«$PROXY_TLS» no es válido: acme, interno o no" ;;
esac

if [ -n "$fallos" ]; then
	printf 'proxy: configuración inválida, no arranco:%s\n' "$fallos" >&2
	exit 1
fi

printf 'proxy: PROXY_TLS=%s · pública %s · panel %s\n' "$PROXY_TLS" "$DOMINIO_PUBLICO" "$DOMINIO_PANEL"
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
