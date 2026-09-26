#!/usr/bin/env bash
# Mi Curichi — respaldo de PostgreSQL, cifrado, a un S3 externo (servicio `respaldo`). Parte 5.
#
#   curichi-respaldo programado                 bucle: un respaldo al arrancar y otro cada día a
#                                               RESPALDO_HORA (hora local de TZ). Es el de por defecto.
#   curichi-respaldo respaldar                  un respaldo ahora y termina (para un cron del host)
#   curichi-respaldo listar                     respaldos del bucket, con su migración
#   curichi-respaldo restaurar <objeto|ultimo> <base>
#                                               baja, verifica, descifra y carga los DATOS en <base>,
#                                               que tiene que estar migrada hasta la versión del respaldo
#   curichi-respaldo verificar                  configuración, base y bucket (sube y borra una prueba)
#   curichi-respaldo salud                      0 si el último respaldo bueno tiene menos de 26 h
#
# QUÉ HACE UN RESPALDO, EN ORDEN (si falla cualquier paso, no se sube nada ni se borra nada):
#   1. Anota la última migración aplicada. El volcado EXCLUYE `_migraciones`: al restaurar, las
#      migraciones se aplican primero `--hasta` esa versión, luego se cargan los datos y luego se
#      migra el resto. Así un respaldo viejo se restaura con el código nuevo.
#   2. pg_dump -Fc. Vuelve a leer la migración: si cambió durante el volcado, lo descarta.
#   3. Lee el volcado ENTERO con pg_restore (descomprime cada bloque de datos) y cuenta las filas
#      de cada tabla de `public` y `geo`. Un volcado corrupto falla aquí y no llega al bucket.
#   4. Cifra con gpg (AES-256, integridad protegida), comprueba que descifra byte a byte igual y
#      borra el volcado en claro.
#   5. Sube el cifrado y su manifiesto (migración, sha256, filas por tabla; nada personal) a
#      diario/, y además a semanal/ los domingos y a mensual/ el día 1.
#   6. Solo entonces aplica la retención. Si los respaldos fallan, la retención no corre: nunca se
#      borra el último respaldo bueno porque hayan dejado de salir los nuevos.
#
# El volcado lleva datos personales (coordenadas exactas de viviendas, correos, ip_hash): no sale
# de la máquina sin cifrar, y la clave no se escribe nunca en un archivo ni en un log.
set -Eeuo pipefail
# Sin esto, un fallo dentro de `$(…)` no corta la función que lo contiene.
shopt -s inherit_errexit
umask 077

readonly ESTADO=/tmp/estado
readonly VERSION_MANIFIESTO=1

INSTALACION_NOMBRE="${INSTALACION_NOMBRE:-mi-curichi}"

# --- Registro: una línea JSON por evento, con la forma de pino (como api-core y las migraciones) --

json_escapar() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# log <info|warn|error> <mensaje> [clave=valor ...]
log() {
  local nivel=$1 msg=$2 numero=30 extra="" par clave valor
  shift 2
  case $nivel in warn) numero=40 ;; error) numero=50 ;; esac
  for par in "$@"; do
    clave=${par%%=*}
    valor=${par#*=}
    if [[ $valor =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
      extra+=",\"$clave\":$valor"
    else
      extra+=",\"$clave\":\"$(json_escapar "$valor")\""
    fi
  done
  local linea
  linea=$(printf '{"level":%d,"time":%s,"name":"respaldo","instalacion":"%s","msg":"%s"%s}' \
    "$numero" "$(date +%s%3N)" "$(json_escapar "$INSTALACION_NOMBRE")" "$(json_escapar "$msg")" "$extra")
  if [ "$numero" -ge 50 ]; then printf '%s\n' "$linea" >&2; else printf '%s\n' "$linea"; fi
}

fallar() {
  log error "$1"
  exit 1
}

# Cualquier orden que falle sin pasar por `fallar` deja rastro de cuál fue.
al_fallar() {
  log error "orden fallida" orden="$BASH_COMMAND" linea="$1"
}
trap 'al_fallar "$LINENO"' ERR

# --- Configuración ------------------------------------------------------------------------------

entero_positivo() {
  [[ ${2:-} =~ ^[1-9][0-9]*$ ]] || fallar "$1 tiene que ser un entero positivo (vale «${2:-}»)."
}

verificar_configuracion() {
  local faltan=() v
  for v in RESPALDO_DATABASE_URL RESPALDO_CLAVE_CIFRADO RESPALDO_S3_BUCKET RESPALDO_S3_ACCESS_KEY RESPALDO_S3_SECRET_KEY; do
    [ -n "${!v:-}" ] || faltan+=("$v")
  done
  if [ "${RESPALDO_S3_PROVEEDOR:-Other}" != AWS ] && [ -z "${RESPALDO_S3_ENDPOINT:-}" ]; then
    faltan+=(RESPALDO_S3_ENDPOINT)
  fi
  [ ${#faltan[@]} -eq 0 ] || fallar "faltan variables: ${faltan[*]} (ver .env.example, bloque «Respaldos»)."
  # Clave larga: el cifrado es simétrico y lo único que protege el archivo en el bucket es ella.
  [ "${#RESPALDO_CLAVE_CIFRADO}" -ge 32 ] ||
    fallar "RESPALDO_CLAVE_CIFRADO necesita al menos 32 caracteres (openssl rand -base64 48)."
  [[ $INSTALACION_NOMBRE =~ ^[a-z0-9][a-z0-9-]*$ ]] ||
    fallar "INSTALACION_NOMBRE solo admite minúsculas, números y guiones (vale «$INSTALACION_NOMBRE»)."
  [[ ${RESPALDO_HORA:-03:15} =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] ||
    fallar "RESPALDO_HORA tiene que ser HH:MM (vale «${RESPALDO_HORA:-}»)."
  entero_positivo RESPALDO_RETENCION_DIARIA "${RESPALDO_RETENCION_DIARIA:-7}"
  entero_positivo RESPALDO_RETENCION_SEMANAL "${RESPALDO_RETENCION_SEMANAL:-4}"
  entero_positivo RESPALDO_RETENCION_MENSUAL "${RESPALDO_RETENCION_MENSUAL:-12}"
  PREFIJO="${RESPALDO_S3_PREFIJO:-$INSTALACION_NOMBRE/postgres}"
  PREFIJO=${PREFIJO#/}
  PREFIJO=${PREFIJO%/}
  [[ $PREFIJO =~ ^[A-Za-z0-9._/-]+$ ]] || fallar "RESPALDO_S3_PREFIJO tiene caracteres no admitidos."

  # rclone se configura entero por variables: no hay archivo de configuración con credenciales.
  : >"$RCLONE_CONFIG"
  export RCLONE_CONFIG_DESTINO_TYPE=s3
  export RCLONE_CONFIG_DESTINO_PROVIDER="${RESPALDO_S3_PROVEEDOR:-Other}"
  export RCLONE_CONFIG_DESTINO_ENV_AUTH=false
  export RCLONE_CONFIG_DESTINO_ACCESS_KEY_ID="$RESPALDO_S3_ACCESS_KEY"
  export RCLONE_CONFIG_DESTINO_SECRET_ACCESS_KEY="$RESPALDO_S3_SECRET_KEY"
  export RCLONE_CONFIG_DESTINO_REGION="${RESPALDO_S3_REGION:-us-east-1}"
  if [ -n "${RESPALDO_S3_ENDPOINT:-}" ]; then
    export RCLONE_CONFIG_DESTINO_ENDPOINT="$RESPALDO_S3_ENDPOINT"
  fi
  # 1 = bucket en el camino (MinIO y la mayoría de compatibles); 0 = subdominio (AWS).
  if [ "${RESPALDO_S3_ESTILO_RUTA:-1}" = 1 ]; then
    export RCLONE_CONFIG_DESTINO_FORCE_PATH_STYLE=true
  else
    export RCLONE_CONFIG_DESTINO_FORCE_PATH_STYLE=false
  fi
  # El bucket lo crea quien administra el almacenamiento; esta credencial no debe poder crearlos.
  export RCLONE_CONFIG_DESTINO_NO_CHECK_BUCKET=true
  # Las dos cuelgan directamente de /tmp, así que `-m` se aplica a las dos.
  mkdir -p "$GNUPGHOME" "$ESTADO"
  chmod 0700 "$GNUPGHOME" "$ESTADO"
}

remoto() {
  printf 'destino:%s/%s%s' "$RESPALDO_S3_BUCKET" "$PREFIJO" "${1:+/$1}"
}

# Carpetas de trabajo de pasadas que no terminaron (un `docker stop` a mitad de un volcado mata el
# proceso sin darle tiempo a limpiar). Más de 12 h: ninguna pasada viva dura tanto.
limpiar_restos() {
  find /trabajo -mindepth 1 -maxdepth 1 \( -name 'respaldo.*' -o -name 'restaurar.*' \) \
    -mmin +720 -exec rm -rf {} + 2>/dev/null || true
}

rclone_() {
  rclone --retries 5 --low-level-retries 10 --stats 0 --log-level ERROR "$@"
}

# Reemplaza el nombre de la base en una URL postgresql://usuario:<clave>@host:puerto/base?parámetros
url_con_base() {
  local url=$1 base=$2 consulta=""
  if [[ $url == *\?* ]]; then
    consulta="?${url#*\?}"
    url=${url%%\?*}
  fi
  printf '%s/%s%s' "${url%/*}" "$base" "$consulta"
}

sql() {
  psql "$1" -X -q -t -A -v ON_ERROR_STOP=1 -c "$2"
}

# Nombre del archivo de la última migración aplicada, o vacío si la base no tiene ninguna.
# Asignar antes de comparar: el estado de `$(…)` solo cuenta en una asignación, y así una base
# inalcanzable es un error y no «una base sin migraciones».
ultima_migracion() {
  local existe
  existe=$(sql "$1" "SELECT to_regclass('public._migraciones') IS NOT NULL")
  [ "$existe" = t ] || return 0
  sql "$1" "SELECT coalesce(max(nombre), '') FROM _migraciones"
}

# --- Cifrado ------------------------------------------------------------------------------------
# La clave entra por el descriptor 3, nunca por la línea de órdenes (se vería en `ps`).

cifrar() {
  gpg --batch --yes --no-tty --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --compress-algo none --output "$2" "$1" 3<<<"$RESPALDO_CLAVE_CIFRADO"
}

descifrar() {
  gpg --batch --yes --no-tty --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt --output "$2" "$1" 3<<<"$RESPALDO_CLAVE_CIFRADO"
}

# Filas de cada tabla de `public` y `geo` que hay DENTRO del volcado. pg_restore descomprime todos
# los bloques de datos (un bloque dañado falla aquí) y awk cuenta las líneas de cada COPY.
# `spatial_ref_sys` no cuenta: es la tabla de configuración de PostGIS; el volcado solo lleva los
# SRID añadidos a mano (ninguno) y `CREATE EXTENSION postgis` ya trae los ~8500 estándar.
contar_filas() {
  pg_restore --data-only --schema=public --schema=geo --file=- "$1" |
    awk -v OFS='\t' '
      /^COPY / { tabla = $2; n = 0; dentro = 1; next }
      dentro && $0 == "\\." { if (tabla != "public.spatial_ref_sys") print tabla, n; dentro = 0; next }
      dentro { n++ }
    ' | sort
}

# --- Alertas y latido ---------------------------------------------------------------------------

# alertar <firing|resolved> <descripción>: POST a la API de Alertmanager si está configurada. La
# alerta `RespaldoFallido` queda activa 25 h, hasta la siguiente pasada, que la renueva o la cierra.
alertar() {
  [ -n "${RESPALDO_ALERTMANAGER_URL:-}" ] || return 0
  local estado=$1 descripcion=$2 ahora fin
  ahora=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [ "$estado" = firing ]; then fin=$(date -u -d '+25 hours' +%Y-%m-%dT%H:%M:%SZ); else fin=$ahora; fi
  local cuerpo
  cuerpo=$(printf '[{"labels":{"alertname":"RespaldoFallido","gravedad":"critica","job":"respaldo","instalacion":"%s"},"annotations":{"resumen":"El respaldo de la base de %s falló","descripcion":"%s"},"startsAt":"%s","endsAt":"%s"}]' \
    "$(json_escapar "$INSTALACION_NOMBRE")" "$(json_escapar "$INSTALACION_NOMBRE")" "$(json_escapar "$descripcion")" "$ahora" "$fin")
  curl -fsS --max-time 10 --retry 2 -H 'Content-Type: application/json' \
    -X POST --data "$cuerpo" "${RESPALDO_ALERTMANAGER_URL%/}/api/v2/alerts" >/dev/null ||
    log warn "no se pudo avisar a Alertmanager"
}

# Latido a un servicio de «dead man's switch» (healthchecks.io, Uptime Kuma, Better Stack…): si
# deja de llegar, ESE servicio avisa. Cubre justo lo que una alerta propia no puede: que el
# contenedor de respaldos ni siquiera esté corriendo.
latido() {
  [ -n "${RESPALDO_URL_LATIDO:-}" ] || return 0
  curl -fsS --max-time 10 --retry 3 "$RESPALDO_URL_LATIDO" >/dev/null || log warn "no se pudo enviar el latido"
}

# --- Respaldo -----------------------------------------------------------------------------------

respaldar() {
  verificar_configuracion
  local inicio dia_semana dia_mes marca trabajo
  inicio=$(date +%s)
  marca=$(date -u +%Y%m%dT%H%M%SZ)
  dia_semana=$(date +%u)
  dia_mes=$(date +%d)
  limpiar_restos
  trabajo=$(mktemp -d /trabajo/respaldo.XXXXXX)
  # shellcheck disable=SC2064 # se expande ahora a propósito: es la carpeta de ESTA pasada
  trap "rm -rf '$trabajo'" EXIT

  local migracion migracion_despues
  migracion=$(ultima_migracion "$RESPALDO_DATABASE_URL")
  [ -n "$migracion" ] || fallar "la base no tiene migraciones aplicadas: no hay esquema que respaldar."
  local base="${INSTALACION_NOMBRE}-${marca}-m${migracion:0:4}"
  local volcado="$trabajo/$base.dump" cifrado="$trabajo/$base.dump.gpg" manifiesto="$trabajo/$base.json"

  log info "respaldo: volcando la base" migracion="$migracion"
  pg_dump --dbname="$RESPALDO_DATABASE_URL" --format=custom --compress=6 \
    --exclude-table=public._migraciones --file="$volcado"
  migracion_despues=$(ultima_migracion "$RESPALDO_DATABASE_URL")
  [ "$migracion" = "$migracion_despues" ] ||
    fallar "se aplicó una migración durante el volcado ($migracion → $migracion_despues); se descarta y se reintenta en la próxima pasada."

  contar_filas "$volcado" >"$trabajo/filas.tsv"
  grep -q $'^public\\.reporte_inundacion\t' "$trabajo/filas.tsv" ||
    fallar "el volcado no trae los datos de public.reporte_inundacion: no se sube."

  local sha_volcado bytes_volcado
  sha_volcado=$(sha256sum "$volcado" | cut -d' ' -f1)
  bytes_volcado=$(stat -c %s "$volcado")
  cifrar "$volcado" "$cifrado"
  rm -f "$volcado"
  # Ida y vuelta: lo que se sube descifra exactamente al volcado que se leyó entero en el paso 3.
  [ "$(descifrar "$cifrado" - | sha256sum | cut -d' ' -f1)" = "$sha_volcado" ] ||
    fallar "el archivo cifrado no descifra al mismo volcado: no se sube."

  local sha_cifrado bytes_cifrado servidor postgis
  sha_cifrado=$(sha256sum "$cifrado" | cut -d' ' -f1)
  bytes_cifrado=$(stat -c %s "$cifrado")
  servidor=$(sql "$RESPALDO_DATABASE_URL" "SHOW server_version")
  postgis=$(sql "$RESPALDO_DATABASE_URL" "SELECT coalesce((SELECT extversion FROM pg_extension WHERE extname = 'postgis'), '')")
  {
    printf '{\n'
    printf '  "formato": %d,\n' "$VERSION_MANIFIESTO"
    printf '  "instalacion": "%s",\n' "$INSTALACION_NOMBRE"
    printf '  "objeto": "%s.dump.gpg",\n' "$base"
    printf '  "creado_en": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "migracion": "%s",\n' "${migracion:0:4}"
    printf '  "migracion_archivo": "%s",\n' "$(json_escapar "$migracion")"
    printf '  "excluye": ["public._migraciones"],\n'
    printf '  "servidor_postgresql": "%s",\n' "$(json_escapar "$servidor")"
    printf '  "postgis": "%s",\n' "$(json_escapar "$postgis")"
    printf '  "pg_dump": "%s",\n' "$(json_escapar "$(pg_dump --version)")"
    printf '  "cifrado": "gpg simétrico AES256 (s2k SHA512)",\n'
    printf '  "bytes_volcado": %s,\n' "$bytes_volcado"
    printf '  "sha256_volcado": "%s",\n' "$sha_volcado"
    printf '  "bytes_cifrado": %s,\n' "$bytes_cifrado"
    printf '  "sha256_cifrado": "%s",\n' "$sha_cifrado"
    printf '  "tablas": {\n'
    awk -F'\t' '{ printf "%s    \"%s\": %s", (NR > 1 ? ",\n" : ""), $1, $2 } END { print "" }' "$trabajo/filas.tsv"
    printf '  }\n'
    printf '}\n'
  } >"$manifiesto"

  # El manifiesto va DESPUÉS del cifrado: si existe el manifiesto, el respaldo subió entero.
  local clase
  local clases=(diario)
  [ "$dia_semana" = 7 ] && clases+=(semanal)
  [ "$dia_mes" = 01 ] && clases+=(mensual)
  for clase in "${clases[@]}"; do
    rclone_ copyto "$cifrado" "$(remoto "$clase/$base.dump.gpg")"
    rclone_ copyto "$manifiesto" "$(remoto "$clase/$base.json")"
  done
  local subidos
  subidos=$(rclone_ size --json "$(remoto "diario/$base.dump.gpg")" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
  [ "$subidos" = "$bytes_cifrado" ] ||
    fallar "el bucket dice ${subidos:-0} bytes y se subieron $bytes_cifrado: el respaldo no quedó bien."

  aplicar_retencion

  date -u +%s >"$ESTADO/ultimo-ok"
  log info "respaldo completo" objeto="$(remoto "diario/$base.dump.gpg")" clases="${clases[*]}" \
    migracion="$migracion" bytes="$bytes_cifrado" segundos="$(($(date +%s) - inicio))"
  latido
  alertar resolved "El último respaldo salió bien."
}

# Borra lo que excede la retención, contando por antigüedad del objeto. Los umbrales dejan medio
# día de margen para que el horario del respaldo no haga caer uno de más:
#   diario   N días    → se borra lo que tenga más de N×24−12 h (quedan N)
#   semanal  N semanas → más de N×168−12 h (quedan N)
#   mensual  N meses   → más de N×31 días (quedan al menos N; los meses no miden lo mismo)
aplicar_retencion() {
  local diaria=${RESPALDO_RETENCION_DIARIA:-7} semanal=${RESPALDO_RETENCION_SEMANAL:-4} mensual=${RESPALDO_RETENCION_MENSUAL:-12}
  borrar_viejos diario "$((diaria * 24 - 12))h"
  borrar_viejos semanal "$((semanal * 168 - 12))h"
  borrar_viejos mensual "$((mensual * 31))d"
}

borrar_viejos() {
  # semanal/ no existe hasta el primer domingo ni mensual/ hasta el primer día 1: nada que borrar.
  rclone_ lsf --dirs-only --max-depth 1 "$(remoto)" 2>/dev/null | grep -qx "$1/" || return 0
  rclone_ delete --min-age "$2" --include "*.dump.gpg" --include "*.json" "$(remoto "$1")"
}

# Un respaldo, con aviso si falla. Deja el resultado en ULTIMA_PASADA y devuelve SIEMPRE 0.
#
# Ni `if (respaldar)` ni `(respaldar) || …`: bash ignora `set -e` dentro de todo lo que se evalúa
# como condición, subshells incluidas, y un pg_dump fallido seguiría adelante hasta subir un
# archivo roto y aplicar la retención. Por eso la subshell corre como orden suelta con su propio
# `set -e`, y el estado se lee después.
ULTIMA_PASADA=0
pasada() {
  set +e
  # Fuera la trampa ERR mientras tanto: el fallo ya lo registra la subshell con la orden concreta.
  trap - ERR
  (
    set -e
    trap 'al_fallar "$LINENO"' ERR
    respaldar
  )
  ULTIMA_PASADA=$?
  trap 'al_fallar "$LINENO"' ERR
  set -e
  if [ "$ULTIMA_PASADA" -ne 0 ]; then
    alertar firing "El respaldo diario falló. Ver los logs: docker compose logs respaldo"
  fi
  return 0
}

segundos_hasta() {
  local ahora objetivo
  ahora=$(date +%s)
  objetivo=$(date -d "today $1" +%s)
  if [ "$objetivo" -le "$ahora" ]; then objetivo=$(date -d "tomorrow $1" +%s); fi
  echo $((objetivo - ahora))
}

programado() {
  verificar_configuracion
  date -u +%s >"$ESTADO/arranque"
  trap 'log info "parada solicitada"; exit 0' TERM INT
  log info "respaldos programados" hora="${RESPALDO_HORA:-03:15}" zona="${TZ:-UTC}" destino="$(remoto)"
  if [ "${RESPALDO_AL_ARRANCAR:-1}" = 1 ]; then pasada; fi
  while :; do
    local espera
    espera=$(segundos_hasta "${RESPALDO_HORA:-03:15}")
    log info "próximo respaldo" en_segundos="$espera"
    sleep "$espera" &
    wait $!
    pasada
  done
}

# --- Consulta y restauración --------------------------------------------------------------------

listar() {
  verificar_configuracion
  local clase
  for clase in diario semanal mensual; do
    echo "== $clase ($(remoto "$clase"))"
    rclone_ lsf --files-only --include "*.dump.gpg" --format tsp --separator '  ' "$(remoto "$clase")" | sort -k3 || true
  done
}

# Resuelve `ultimo`, un nombre suelto o una ruta `clase/nombre` a una ruta dentro del prefijo.
resolver_objeto() {
  local pedido=$1 clase nombre
  if [ "$pedido" = ultimo ]; then
    nombre=$({ rclone_ lsf --files-only --include "*.dump.gpg" "$(remoto diario)" 2>/dev/null || true; } | sort | tail -n 1)
    [ -n "$nombre" ] || fallar "no hay ningún respaldo en $(remoto diario)."
    printf 'diario/%s' "$nombre"
    return
  fi
  [[ $pedido == *.dump.gpg ]] || pedido="$pedido.dump.gpg"
  if [[ $pedido == */* ]]; then
    printf '%s' "$pedido"
    return
  fi
  for clase in diario semanal mensual; do
    if rclone_ lsf --files-only "$(remoto "$clase/$pedido")" 2>/dev/null | grep -q .; then
      printf '%s/%s' "$clase" "$pedido"
      return
    fi
  done
  fallar "no existe el respaldo «$1» en diario/, semanal/ ni mensual/."
}

campo_manifiesto() {
  sed -n "s/^  \"$2\": \"\\{0,1\\}\\([^\",]*\\)\"\\{0,1\\},\\{0,1\\}\$/\\1/p" "$1" | head -n 1
}

restaurar() {
  local pedido=${1:-} base_destino=${2:-}
  [ -n "$pedido" ] && [ -n "$base_destino" ] || fallar "uso: curichi-respaldo restaurar <objeto|ultimo> <base_destino>"
  [[ $base_destino =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || fallar "nombre de base no admitido: «$base_destino»."
  verificar_configuracion
  local objeto trabajo
  objeto=$(resolver_objeto "$pedido")
  limpiar_restos
  trabajo=$(mktemp -d /trabajo/restaurar.XXXXXX)
  # shellcheck disable=SC2064
  trap "rm -rf '$trabajo'" EXIT
  log info "restauración: descargando" objeto="$objeto" base="$base_destino"
  rclone_ copyto "$(remoto "$objeto")" "$trabajo/respaldo.dump.gpg"
  rclone_ copyto "$(remoto "${objeto%.dump.gpg}.json")" "$trabajo/manifiesto.json"

  local migracion migracion_archivo
  migracion=$(campo_manifiesto "$trabajo/manifiesto.json" migracion)
  migracion_archivo=$(campo_manifiesto "$trabajo/manifiesto.json" migracion_archivo)
  [[ $migracion =~ ^[0-9]{4}$ ]] || fallar "el manifiesto no dice la migración del respaldo."
  [ "$(sha256sum "$trabajo/respaldo.dump.gpg" | cut -d' ' -f1)" = "$(campo_manifiesto "$trabajo/manifiesto.json" sha256_cifrado)" ] ||
    fallar "el archivo descargado no coincide con el sha256 de su manifiesto."
  descifrar "$trabajo/respaldo.dump.gpg" "$trabajo/respaldo.dump"
  rm -f "$trabajo/respaldo.dump.gpg"
  [ "$(sha256sum "$trabajo/respaldo.dump" | cut -d' ' -f1)" = "$(campo_manifiesto "$trabajo/manifiesto.json" sha256_volcado)" ] ||
    fallar "el volcado descifrado no coincide con el de su manifiesto (¿otra clave?)."

  local url
  url=$(url_con_base "$RESPALDO_DATABASE_URL" "$base_destino")
  if ! sql "$url" "SELECT 1" >/dev/null 2>&1; then
    fallar "no se pudo conectar a la base «$base_destino»: ¿existe? (createdb y migrar --hasta $migracion primero)."
  fi
  local actual
  actual=$(ultima_migracion "$url")
  if [ "$actual" != "$migracion_archivo" ]; then
    fallar "la base «$base_destino» está en «${actual:-sin migraciones}» y el respaldo en «$migracion_archivo». Primero migrala hasta esa versión: migrar.js --hasta $migracion (docs/operaciones/respaldo-y-restauracion.md)."
  fi
  [ "$(sql "$url" "SELECT (SELECT count(*) FROM reporte_inundacion) + (SELECT count(*) FROM usuario)")" = 0 ] ||
    fallar "la base «$base_destino» ya tiene reportes o usuarios: se restaura sobre una base vacía, nunca encima."

  # Las claves foráneas se desactivan mientras se carga (el orden de las tablas no las respeta, y
  # `fusionado_en_id` se apunta a sí misma). Como superusuario, --disable-triggers; si no (base
  # gestionada), session_replication_role=replica, que los proveedores suelen permitir al rol admin.
  local superusuario
  superusuario=$(sql "$url" "SELECT rolsuper FROM pg_roles WHERE rolname = current_user")
  log info "restauración: cargando datos" migracion="$migracion_archivo" superusuario="$superusuario"
  local inicio
  inicio=$(date +%s)
  if [ "$superusuario" = t ]; then
    pg_restore --dbname="$url" --data-only --schema=public --schema=geo --disable-triggers \
      --exit-on-error --jobs="${RESPALDO_RESTAURAR_HILOS:-4}" "$trabajo/respaldo.dump"
  else
    PGOPTIONS='-c session_replication_role=replica' pg_restore --dbname="$url" --data-only \
      --schema=public --schema=geo --exit-on-error --jobs="${RESPALDO_RESTAURAR_HILOS:-4}" "$trabajo/respaldo.dump"
  fi

  # Comprobación: filas de cada tabla, exactamente las que el manifiesto dice que se respaldaron.
  local tabla filas reales distintas=0
  while IFS=$'\t' read -r tabla filas; do
    [[ $tabla =~ ^(public|geo)\.[a-z_][a-z0-9_]*$ ]] || continue
    reales=$(sql "$url" "SELECT count(*) FROM $tabla")
    if [ "$reales" != "$filas" ]; then
      log error "restauración: no coinciden las filas" tabla="$tabla" respaldadas="$filas" restauradas="$reales"
      distintas=$((distintas + 1))
    fi
  done < <(sed -n 's/^    "\([a-z_]*\.[a-z0-9_]*\)": \([0-9]*\),\{0,1\}$/\1\t\2/p' "$trabajo/manifiesto.json")
  [ "$distintas" -eq 0 ] || fallar "restauración: $distintas tabla(s) con un número de filas distinto al respaldado."
  log info "restauración de datos completa y verificada" base="$base_destino" migracion="$migracion_archivo" \
    segundos="$(($(date +%s) - inicio))"
  echo "Siguiente paso: aplicar las migraciones posteriores a $migracion sobre «$base_destino» (sin --hasta)."
}

verificar() {
  verificar_configuracion
  local migracion
  migracion=$(ultima_migracion "$RESPALDO_DATABASE_URL")
  log info "base accesible" migracion="${migracion:-ninguna}"
  local prueba
  prueba="verificacion-$(date -u +%Y%m%dT%H%M%SZ).txt"
  printf 'prueba de escritura de %s\n' "$INSTALACION_NOMBRE" | rclone_ rcat "$(remoto "$prueba")"
  rclone_ deletefile "$(remoto "$prueba")"
  log info "bucket accesible: se pudo escribir y borrar" destino="$(remoto)"
}

salud() {
  local maximo=$((${RESPALDO_MAX_HORAS_SIN_EXITO:-26} * 3600)) ahora
  ahora=$(date -u +%s)
  if [ -f "$ESTADO/ultimo-ok" ]; then
    local ultimo
    ultimo=$(cat "$ESTADO/ultimo-ok")
    if [ $((ahora - ultimo)) -le "$maximo" ]; then exit 0; fi
    echo "el último respaldo bueno es de hace $(((ahora - ultimo) / 3600)) h"
    exit 1
  fi
  if [ -f "$ESTADO/arranque" ] && [ $((ahora - $(cat "$ESTADO/arranque"))) -le "$maximo" ]; then
    exit 0
  fi
  echo "ningún respaldo bueno desde que arrancó el contenedor"
  exit 1
}

accion=${1:-programado}
shift || true
case $accion in
  programado) programado ;;
  respaldar)
    pasada
    exit "$ULTIMA_PASADA"
    ;;
  listar) listar ;;
  restaurar) restaurar "$@" ;;
  verificar) verificar ;;
  salud) salud ;;
  *)
    echo "uso: curichi-respaldo programado|respaldar|listar|restaurar <objeto|ultimo> <base>|verificar|salud" >&2
    exit 2
    ;;
esac
