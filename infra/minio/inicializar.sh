#!/bin/sh
# Inicialización del MinIO LOCAL (servicio `minio-init`, perfil `minio` del Compose). Parte 5.
#
# Deja tres cosas y termina:
#   1. El bucket de fotos, PRIVADO (sin acceso anónimo): las fotos las sirve api-core, que es quien
#      sabe si el reporte está publicado (§13).
#   2. Una política que alcanza SOLO a ese bucket: leer, escribir y borrar objetos, y listar el
#      bucket. Listar hace falta aunque api-core nunca liste: sin s3:ListBucket, S3 responde 403 (y
#      no 404) a una clave que no existe, y la comprobación de arranque de api-core no distinguiría
#      «no está» de «no tengo permiso».
#   3. El usuario de api-core (S3_ACCESS_KEY / S3_SECRET_KEY) con esa política y nada más.
#
# Antes, api-core usaba la credencial ROOT de MinIO: cualquier fallo que llegara a ejecutar código
# en api-core podía borrar todos los buckets, crear usuarios o cambiar la configuración del
# servidor. Por eso este script se NIEGA a seguir si la credencial de api-core es la root.
#
# Idempotente: se ejecuta en cada `docker compose up` y deja el mismo estado.
set -eu

fallar() {
  echo "minio-init: ERROR: $*" >&2
  exit 1
}

[ -n "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_SECRET_KEY:-}" ] ||
  fallar "definí S3_ACCESS_KEY y S3_SECRET_KEY en el .env: son la credencial de api-core, distinta de la root."
[ "$S3_ACCESS_KEY" != "$MINIO_ROOT_USER" ] ||
  fallar "S3_ACCESS_KEY no puede ser el usuario root de MinIO (MINIO_ROOT_USER). Poné uno propio, p. ej. curichi-fotos."
[ "$S3_SECRET_KEY" != "$MINIO_ROOT_PASSWORD" ] ||
  fallar "S3_SECRET_KEY no puede ser la contraseña root de MinIO."
# Límites del propio MinIO: clave de acceso de 3 caracteres o más y secreta de 8 o más.
[ "${#S3_ACCESS_KEY}" -ge 3 ] || fallar "S3_ACCESS_KEY necesita al menos 3 caracteres."
[ "${#S3_SECRET_KEY}" -ge 8 ] || fallar "S3_SECRET_KEY necesita al menos 8 caracteres."
# Con `case` y no con grep: la imagen (ubi-micro) no trae grep.
case "$S3_BUCKET" in
  '' | ? | ?? | *[!a-z0-9.-]* | [.-]* | *[.-])
    fallar "S3_BUCKET «$S3_BUCKET» no es un nombre de bucket válido (3 a 63 minúsculas, números, punto y guion)."
    ;;
esac
[ "${#S3_BUCKET}" -le 63 ] || fallar "S3_BUCKET tiene más de 63 caracteres."

# `mc ready` en el healthcheck dice que el servidor responde, no que la API de administración ya
# acepte operaciones: se reintenta un rato.
i=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 30 ] || fallar "MinIO no respondió a tiempo."
  echo "minio-init: esperando a MinIO..."
  sleep 2
done

mc mb --ignore-existing "local/$S3_BUCKET"
mc anonymous set none "local/$S3_BUCKET" >/dev/null

POLITICA=curichi-fotos
cat > /tmp/politica-fotos.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET}"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET}/*"]
    }
  ]
}
EOF
# `create` sobre una política existente la reemplaza: si cambia el bucket, la política lo sigue.
mc admin policy create local "$POLITICA" /tmp/politica-fotos.json >/dev/null
# Con un usuario existente, `user add` le actualiza la clave: rotar S3_SECRET_KEY es volver a subir.
mc admin user add local "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
# `attach` falla si la política ya estaba asociada; eso es el estado buscado, no un error.
if ! salida=$(mc admin policy attach local "$POLITICA" --user "$S3_ACCESS_KEY" 2>&1); then
  case "$(mc admin user info local "$S3_ACCESS_KEY" 2>&1)" in
    *"$POLITICA"*) ;;
    *) fallar "no se pudo asociar la política $POLITICA al usuario de api-core: $salida" ;;
  esac
fi

echo "minio-init: bucket «$S3_BUCKET» privado; usuario de api-core con acceso solo a ese bucket."
