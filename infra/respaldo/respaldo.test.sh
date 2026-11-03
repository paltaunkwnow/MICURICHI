#!/usr/bin/env bash
# Solo helpers de texto/SQL inyectado. Nunca invoca acciones operativas.
set -Eeuo pipefail
if [[ ${1:-} != --aislado ]]; then
  exec env -i PATH='/usr/bin:/bin' M10_SCRATCH="${M10_SCRATCH:-$PWD/.turbo/m10-2-2026-10-27/implementador}" \
    bash --noprofile --norc "$0" --aislado "$@"
fi
shift
SOLO_F2=0
if [[ $# == 1 && $1 == --solo-f2 ]]; then SOLO_F2=1
elif [[ $# != 0 ]]; then printf 'Uso: respaldo.test.sh [--solo-f2]\n' >&2; exit 64; fi
readonly RAIZ="$(cd -- "$(dirname -- "$0")/../.." && pwd -P)"
mkdir -p -- "$M10_SCRATCH"
readonly SCRATCH="$(cd -- "$M10_SCRATCH" && pwd -P)"
readonly FIXTURE="$(mktemp -d "$SCRATCH/shell-fixture.XXXXXX")"
limpiar_fixture() {
  local absoluto
  absoluto=$(cd -- "$FIXTURE" && pwd -P)
  case "$absoluto" in "$SCRATCH"/shell-fixture.*) rm -rf -- "$absoluto" ;; *) exit 99 ;; esac
}
trap limpiar_fixture EXIT
denegar() { printf 'OPERADOR BLOQUEADO\n' >&2; return 97; }
psql() { denegar; }; pg_dump() { denegar; }; pg_restore() { denegar; }
rclone() { denegar; }; gpg() { denegar; }; docker() { denegar; }; curl() { denegar; }
createdb() { denegar; }; dropdb() { denegar; }; wget() { denegar; }
# Barreras instaladas ANTES del source; nunca se usa el CLI operativo para probar.
# shellcheck source=infra/respaldo/respaldo.sh
source "$RAIZ/infra/respaldo/respaldo.sh" __source_sin_accion__
trap limpiar_fixture EXIT
trap - ERR
export RESPALDO_DATABASE_URL='postgresql://sentinel:sentinel@invalid.example/mock'
export RESPALDO_CLAVE_CIFRADO='SENTINEL_SINTETICO_NO_ES_UNA_CLAVE_REAL'
TOTAL=0 FALLOS=0 FILTRADOS=0
caso() {
  local nombre=$1 esperado=$2 estado
  shift 2
  if [[ $SOLO_F2 == 1 && $nombre != 'M10 final'* ]]; then
    FILTRADOS=$((FILTRADOS + 1)); return 0
  fi
  set +e
  ( set -e; "$@" ) >"$FIXTURE/salida" 2>&1
  estado=$?
  set -e
  TOTAL=$((TOTAL + 1))
  if { [[ $esperado == ok && $estado == 0 ]] || [[ $esperado == falla && $estado != 0 && $estado != 127 && $estado != 97 ]]; }; then
    printf 'PASS %s\n' "$nombre"
  else
    FALLOS=$((FALLOS + 1)); printf 'FAIL %s (exit=%s)\n' "$nombre" "$estado"; cat "$FIXTURE/salida"
  fi
}
printf 'public.reporte\t4\npublic.usuario\t0\n' >"$FIXTURE/actual.tsv"
printf 'public.reporte_inundacion\t4\npublic.usuario\t0\n' >"$FIXTURE/previo.tsv"
caso 'actual exige reporte físico' ok validar_tabla_filas "$FIXTURE/actual.tsv" 0021_mock.sql
caso 'previo0020 acepta tabla antigua' ok validar_tabla_filas "$FIXTURE/previo.tsv" 0019_mock.sql
caso 'actual rechaza vista como TABLE DATA' falla validar_tabla_filas "$FIXTURE/previo.tsv" 0021_mock.sql
caso 'previo rechaza versión inconsistente' falla validar_tabla_filas "$FIXTURE/actual.tsv" 0019_mock.sql
caso 'migración inválida' falla tabla_reportes sin_version
mock_vacio() {
  [[ $2 == *'FROM public.reporte)'* && $2 != *reporte_inundacion* ]] || return 98
  printf '0\n'
}
mock_otras_categorias() {
  # Si usa la vista errónea, la fixture de Inundaciones está vacía: detecta ese mutante.
  if [[ $2 == *'FROM public.reporte)'* ]]; then printf '3\n'; else printf '0\n'; fi
}
mock_error() { return 42; }
caso 'destino vacío actual' ok comprobar_destino_vacio mock_url 0021_mock.sql mock_vacio
caso 'destino ocupado solo otras categorías' falla comprobar_destino_vacio mock_url 0021_mock.sql mock_otras_categorias
caso 'sin ejecutor SQL no hay fallback' falla comprobar_destino_vacio mock_url 0021_mock.sql
caso 'error SQL no es vacío' falla comprobar_destino_vacio mock_url 0021_mock.sql mock_error
cat >"$FIXTURE/manifiesto.json" <<'JSON'
{
  "formato": 1,
  "instalacion": "fixture",
  "objeto": "fixture-20261027T000000Z-m0021.dump.gpg",
  "creado_en": "2026-10-27T00:00:00Z",
  "migracion": "0021",
  "migracion_archivo": "0021_mock.sql",
  "excluye": ["public._migraciones"],
  "servidor_postgresql": "18-fixture",
  "postgis": "3-fixture",
  "pg_dump": "pg_dump-fixture",
  "cifrado": "gpg simétrico AES256 (s2k SHA512)",
  "bytes_volcado": 10,
  "sha256_volcado": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "bytes_cifrado": 20,
  "sha256_cifrado": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "tablas": {
    "public.reporte": 4,
    "public.usuario": 0
  }
}
JSON
caso 'manifiesto completo coincide con archivo leído' ok validar_manifiesto "$FIXTURE/manifiesto.json" "$FIXTURE/actual.tsv"
sed '/"public.reporte"/d' "$FIXTURE/manifiesto.json" >"$FIXTURE/incompleto.json"
caso 'manifiesto omite tabla física' falla validar_manifiesto "$FIXTURE/incompleto.json" "$FIXTURE/actual.tsv"
sed 's/0021_mock/0019_mock/' "$FIXTURE/manifiesto.json" >"$FIXTURE/version.json"
caso 'versión de manifiesto inconsistente' falla validar_manifiesto "$FIXTURE/version.json" "$FIXTURE/actual.tsv"
sed '/"public.usuario"/d' "$FIXTURE/manifiesto.json" >"$FIXTURE/omitida.json"
caso 'manifiesto omite otra tabla' falla validar_manifiesto "$FIXTURE/omitida.json" "$FIXTURE/actual.tsv"
sed 's/"formato": 1/"formato": 2/' "$FIXTURE/manifiesto.json" >"$FIXTURE/formato.json"
caso 'formato desconocido' falla validar_manifiesto "$FIXTURE/formato.json" "$FIXTURE/actual.tsv"
sed '/"sha256_volcado"/d' "$FIXTURE/manifiesto.json" >"$FIXTURE/sin-hash.json"
caso 'manifiesto sin integridad' falla validar_manifiesto "$FIXTURE/sin-hash.json" "$FIXTURE/actual.tsv"
sed '/"bytes_cifrado"/d' "$FIXTURE/manifiesto.json" >"$FIXTURE/sin-tamano.json"
caso 'manifiesto sin tamaño' falla validar_manifiesto "$FIXTURE/sin-tamano.json" "$FIXTURE/actual.tsv"
sed 's/"bytes_cifrado": 20/"bytes_cifrado": 0/' "$FIXTURE/manifiesto.json" >"$FIXTURE/tamano.json"
caso 'manifiesto con tamaño inválido' falla validar_manifiesto "$FIXTURE/tamano.json" "$FIXTURE/actual.tsv"
sed 's/-m0021/-m0019/' "$FIXTURE/manifiesto.json" >"$FIXTURE/objeto.json"
caso 'objeto y migración deben coincidir' falla validar_manifiesto "$FIXTURE/objeto.json" "$FIXTURE/actual.tsv"
sed 's/"public.reporte": 4/"public.reporte": 5/' "$FIXTURE/manifiesto.json" >"$FIXTURE/conteo.json"
caso 'conteo distinto del archivo' falla validar_manifiesto "$FIXTURE/conteo.json" "$FIXTURE/actual.tsv"
sed '/"public.reporte"/p' "$FIXTURE/manifiesto.json" >"$FIXTURE/duplicada.json"
caso 'tabla duplicada en manifiesto' falla validar_manifiesto "$FIXTURE/duplicada.json" "$FIXTURE/actual.tsv"
sed -e 's/0021/0019/g' -e 's/public.reporte"/public.reporte_inundacion"/' "$FIXTURE/manifiesto.json" >"$FIXTURE/antiguo.json"
caso 'manifiesto previo0020 compatible' ok validar_manifiesto "$FIXTURE/antiguo.json" "$FIXTURE/previo.tsv"
# Única herramienta operacional simulada, con argumento estricto y texto COPY sintético.
pg_restore() {
  [[ $* == '--data-only --schema=public --schema=geo --file=- fixture_dump' ]] || return 97
  printf 'COPY public.reporte (id, categoria, descripcion) FROM stdin;\na\tbasura\t\\N\nb\tbache\t\n\\.\nCOPY public.usuario (id) FROM stdin;\n\\.\n'
}
printf 'public.reporte\t2\npublic.usuario\t0\n' >"$FIXTURE/oraculo.tsv"
contar_mock() { contar_filas fixture_dump >"$FIXTURE/contadas.tsv"; diff -u "$FIXTURE/oraculo.tsv" "$FIXTURE/contadas.tsv"; }
caso 'parser COPY cuenta filas reales incluidas NULL/vacío' ok contar_mock
pg_restore() { return 42; }
caso 'error al leer archivo propaga fallo' falla contar_filas fixture_dump
mock_preparar() {
  [[ $2 == *'pg_class'* && $2 == *'LOCK TABLE'* && $2 == *'IS DISTINCT FROM'* && $2 == *'activada_por'* && $2 == *'DELETE FROM public.categoria'* ]] || return 98
  [[ $2 != *CASCADE* && $2 != *TRUNCATE* && $2 != *DROP* ]] || return 98
}
mock_previo() { [[ $2 == *'pg_class'* && $2 != *'DELETE FROM'* ]]; }
mock_catalogo_modificado() { return 42; }
mock_configuracion_existente() { return 43; }
caso 'M10.3 semillas exactas y vacío antes de borrar solo catálogo inicial' ok preparar_catalogo mock_url 0021_mock.sql destino_nuevo mock_preparar
caso 'M10.3 histórico vacío no borra catálogo inexistente' ok preparar_catalogo mock_url 0019_mock.sql destino_nuevo mock_previo
caso 'M10.3 catálogo inesperado aborta' falla preparar_catalogo mock_url 0021_mock.sql destino_nuevo mock_catalogo_modificado
caso 'M10.3 configuración/otros datos existentes aborta' falla preparar_catalogo mock_url 0021_mock.sql destino_nuevo mock_configuracion_existente
caso 'M10.3 error SQL aborta preparación' falla preparar_catalogo mock_url 0021_mock.sql destino_nuevo mock_error
caso 'M10.3 sin declaración de destino nuevo aborta' falla preparar_catalogo mock_url 0021_mock.sql existente mock_preparar
caso 'M10.3 preparación sin SQL no tiene fallback' falla preparar_catalogo mock_url 0021_mock.sql destino_nuevo
mock_carga_sql() {
  case $2 in
    *'max(nombre)'*) printf '0019_mock.sql' ;;
    *'SELECT rolsuper'*) printf t ;;
    *'SELECT (SELECT count('* ) printf 0 ;;
    'DO $'*) return 0 ;;
    *) return 98 ;;
  esac
}
mock_restaurador() { [[ $* == '--dbname=mock_url --data-only --schema=public --schema=geo --disable-triggers --exit-on-error --single-transaction fixture_dump' ]]; }
mock_restaurador_prohibido() { printf 'CARGA NO DEBE OCURRIR'; return 97; }
caso 'M10.3 carga compartida histórica verifica esquema/vacío y usa transacción' ok cargar_datos_local mock_url fixture_dump 0019_mock.sql destino_nuevo mock_carga_sql mock_restaurador
caso 'M10.3 carga aborta antes del operador si SQL falla' falla cargar_datos_local mock_url fixture_dump 0019_mock.sql destino_nuevo mock_error mock_restaurador_prohibido
caso 'M10.3 carga aborta sin ejecutores explícitos' falla cargar_datos_local mock_url fixture_dump 0019_mock.sql destino_nuevo
# Criterios0022 pendientes de primera corrida roja. Ningún operador real está habilitado.
printf 'public.reporte\t4\npublic.usuario\t0\nresguardo_m10.cuota_reporte_diaria\t1\n' >"$FIXTURE/contraida.tsv"
caso 'M10 final22 acepta archivo restringido cualificado en filas' ok validar_tabla_filas "$FIXTURE/contraida.tsv" 0022_contraccion_compatible.sql
caso 'M10 final22 exige archivo incluso cuando no tiene filas' falla validar_tabla_filas "$FIXTURE/actual.tsv" 0022_contraccion_compatible.sql
printf 'public.reporte\t4\npublic.usuario\t0\nresguardo_m10.cuota_reporte_diaria\t0\n' >"$FIXTURE/contraida-vacia.tsv"
caso 'M10 final22 conserva archivo con cero filas' ok validar_tabla_filas "$FIXTURE/contraida-vacia.tsv" 0022_contraccion_compatible.sql
printf 'public.reporte\t4\nresguardo_m10.otra_tabla\t1\n' >"$FIXTURE/archivo-ajeno.tsv"
caso 'M10 final22 no admite tablas arbitrarias del esquema de resguardo' falla validar_tabla_filas "$FIXTURE/archivo-ajeno.tsv" 0022_contraccion_compatible.sql
caso 'M10 final21 reexpandido puede contener archivo conservado' ok validar_tabla_filas "$FIXTURE/contraida.tsv" 0021_indice_categoria_creado.sql
mock_preparar22() {
  [[ $2 == *'resguardo_m10'* && $2 == *'LOCK TABLE'* && $2 == *'IS DISTINCT FROM'* ]] || return 98
  [[ $2 != *DROP* && $2 != *TRUNCATE* && $2 != *CASCADE* ]] || return 98
}
caso 'M10 final22 preparación inspecciona archivo antes de cargar' ok preparar_catalogo mock_url 0022_contraccion_compatible.sql destino_nuevo mock_preparar22
pg_restore() {
  [[ $* == '--data-only --schema=public --schema=geo --schema=resguardo_m10 --file=- fixture22_dump' ]] || return 97
  printf 'COPY public.reporte (id) FROM stdin;\nfila\n\\.\nCOPY resguardo_m10.cuota_reporte_diaria (usuario_id, dia, reportes_n, fotos_n, actualizado_en) FROM stdin;\nusuario\tdia\t2\t4\tfecha\n\\.\n'
}
printf 'public.reporte\t1\nresguardo_m10.cuota_reporte_diaria\t1\n' >"$FIXTURE/oraculo22.tsv"
contar22_mock() {
  contar_filas fixture22_dump 0022_contraccion_compatible.sql >"$FIXTURE/contadas22.tsv"
  diff -u "$FIXTURE/oraculo22.tsv" "$FIXTURE/contadas22.tsv"
}
caso 'M10 final22 parser de dump incluye filas de cuota archivada' ok contar22_mock
mock_carga22_sql() {
  case $2 in
    *'max(nombre)'*) printf '0022_contraccion_compatible.sql' ;;
    *'SELECT rolsuper'*) printf t ;;
    *'SELECT (SELECT count('* ) printf 0 ;;
    'DO $'*) [[ $2 == *resguardo_m10* ]] ;;
    *) return 98 ;;
  esac
}
mock_restaurador22() {
  [[ $* == '--dbname=mock_url --data-only --schema=public --schema=geo --schema=resguardo_m10 --disable-triggers --exit-on-error --single-transaction fixture22_dump' ]]
}
mock_evidencia_carga22() { [[ $* == 'mock_url fixture22_dump 0022_contraccion_compatible.sql' ]] && printf true; }
mock_evidencia_carga_falsa() { printf false; }
caso 'M10 final22 carga incluye archivo y exige contraste semántico posterior' ok cargar_datos_local mock_url fixture22_dump 0022_contraccion_compatible.sql destino_nuevo mock_carga22_sql mock_restaurador22 archivo mock_evidencia_carga22
caso 'M10 final22 carga no usa conteos como sustituto del contraste' falla cargar_datos_local mock_url fixture22_dump 0022_contraccion_compatible.sql destino_nuevo mock_carga22_sql mock_restaurador22 archivo mock_evidencia_carga_falsa
caso 'M10 final22 sin verificador de carga aborta antes de operadores' falla cargar_datos_local mock_url fixture22_dump 0022_contraccion_compatible.sql destino_nuevo mock_error mock_restaurador_prohibido
mock_snapshot_m10() { [[ $2 == m10-contraccion-v1 ]] && printf 'sobre-%s' "$1"; }
mock_comparar_m10() { [[ $* == 'sobre-origen sobre-copia' ]] && printf true; }
mock_comparar_m10_falso() { printf false; }
caso 'M10 final contraste semántico exige ambos sobres versionados' ok verificar_contraccion_local origen copia mock_snapshot_m10 mock_comparar_m10
caso 'M10 final pérdida detectada por comparador bloquea cierre' falla verificar_contraccion_local origen copia mock_snapshot_m10 mock_comparar_m10_falso
caso 'M10 final no hay comparador SQL real por omisión' falla verificar_contraccion_local origen copia
printf 'public.reporte\t4\nresguardo_m10.cuota_reporte_diaria\t0\n' >"$FIXTURE/futura.tsv"
caso 'M10 final versión futura no se interpreta como22' falla validar_tabla_filas "$FIXTURE/futura.tsv" 0023_futura.sql
printf 'TOTAL=%s PASS=%s FAIL=%s\n' "$TOTAL" "$((TOTAL - FALLOS))" "$FALLOS"
if [[ $SOLO_F2 == 1 ]]; then printf 'FILTRADOS_POR_NOMBRE=%s\n' "$FILTRADOS"; fi
[[ $FALLOS == 0 ]]
