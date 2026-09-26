# Respaldo y restauración

> Responde a una sola pregunta: **«se perdió la base de datos, ¿cómo volvemos a tener el sistema
> en pie?»**. Todo lo de aquí son comandos que se pueden copiar y pegar, no buenas intenciones.

## Qué hay que respaldar y qué no

| Dato | ¿Respaldo? | Por qué |
|---|---|---|
| Tablas de `public` (reportes, fotos, usuarios, auditoría, puntos críticos) | **Sí, es lo único irrecuperable** | Lo escribieron los vecinos y los técnicos. Si se pierde, no hay de dónde sacarlo. |
| Objetos de fotos (volumen `fotos-data` o el bucket S3) | **Sí, aparte** | Las filas de `reporte_foto` sin el objeto dejan fotos rotas. El respaldo de la base NO las lleva. |
| Tablas de `geo.*` (distritos, unidades vecinales, manzanas) | Van en el respaldo | Se podrían regenerar con el ETL desde `data/raw/`, pero los reportes guardan el id de su unidad vecinal y la versión con que se resolvieron: restaurarlas tal cual es lo seguro. |
| `_migraciones` | **No, a propósito** | Se anota aparte cuál era la última; ver «Cómo se restaura». |
| `data/processed/` | No | Es salida del ETL, reproducible con un comando (CLAUDE.md §6.10). |
| `data/raw/` | **Sí, pero fuera de este sistema** | Es la entrega del municipio, inmutable. Debe estar en el almacenamiento del municipio, no solo aquí (§16, punto 2). |

## Cómo se restaura, y por qué el respaldo excluye `_migraciones`

Un respaldo se restaura **con el código que haya ese día**, que puede ir varias migraciones por
delante del que lo generó. Por eso nunca se carga un volcado completo (esquema incluido):

1. Base vacía, migrada **`--hasta` la versión del respaldo** → el esquema exacto de los datos.
2. Se cargan **solo los datos** de `public` y `geo`.
3. Se aplican **el resto de migraciones** → convierten esos datos igual que convirtieron los de
   producción en su día.

Para el paso 1 hay que saber la versión: cada respaldo la lleva anotada al lado (en el manifiesto
del respaldo automático, en `<archivo>.migracion` del manual). La tabla `_migraciones` queda fuera
del volcado porque en el paso 2 ya existe, la rellenó el paso 1, y sus filas chocarían con la
clave primaria: `pg_restore` escupiría `duplicate key value violates unique constraint
"_migraciones_pkey"`.

Comprobado el 2026-09-26: un respaldo tomado en la migración 0011 se restauró con el código de la
0012 (esquema `--hasta 0011`, datos, y la 0012 aplicada después) y las doce comprobaciones del
simulacro coincidieron con el original.

---

## Respaldo automático (perfil `respaldos`)

El servicio `respaldo` del Compose (`infra/respaldo/respaldo.sh`, imagen
`infra/docker/respaldo.Dockerfile`) hace, cada día a `RESPALDO_HORA` (hora de `ZONA_HORARIA`) y
una vez al arrancar:

| Paso | Qué | Si falla |
|---|---|---|
| 1 | Anota la última migración y hace `pg_dump -Fc` sin `_migraciones`. Relee la migración: si cambió durante el volcado, lo descarta | No se sube nada |
| 2 | Lee el volcado **entero** con `pg_restore` y cuenta las filas de cada tabla de `public` y `geo` | Un volcado corrupto no llega al bucket |
| 3 | Cifra con gpg (AES-256, integridad protegida), comprueba que descifra byte a byte al mismo volcado y borra el volcado en claro | No se sube nada |
| 4 | Sube el cifrado y su **manifiesto** (migración, sha256 del volcado y del cifrado, filas por tabla, versiones de PostgreSQL y PostGIS; nada personal) a `diario/`; los domingos también a `semanal/` y el día 1 a `mensual/`. Comprueba el tamaño de lo subido | El respaldo cuenta como fallido |
| 5 | **Solo entonces** aplica la retención: 7 diarios, 4 semanales, 12 mensuales (`RESPALDO_RETENCION_*`) | — |
| 6 | Llama a `RESPALDO_URL_LATIDO` y cierra la alerta `RespaldoFallido` si estaba abierta | — |

Si falla cualquier paso, abre la alerta `RespaldoFallido` en Alertmanager (si
`RESPALDO_ALERTMANAGER_URL` está definida), el contenedor pasa a `unhealthy` a las 26 h sin un
respaldo bueno, y el vigilante externo deja de recibir el latido. **La retención nunca corre
después de un fallo**: si los respaldos dejan de salir, no se borra el último bueno.

Destino: `s3://<RESPALDO_S3_BUCKET>/<RESPALDO_S3_PREFIJO o INSTALACION_NOMBRE/postgres>/`, con
nombres como `santa-cruz-20260926T071500Z-m0012.dump.gpg` y `….json` (la `m0012` es la migración).

### Puesta en marcha

1. Un bucket **fuera de esta máquina** y **distinto** del de las fotos, con versionado activado y,
   si el proveedor lo ofrece, bloqueo de objetos (*object lock*) de al menos 7 días: así ni una
   credencial robada del servidor puede borrar los respaldos recientes.
2. Una credencial propia limitada al prefijo (política estilo AWS; los demás proveedores tienen su
   equivalente):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": ["arn:aws:s3:::<bucket>"],
         "Condition": { "StringLike": { "s3:prefix": ["<prefijo>/*", "<prefijo>"] } } },
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": ["arn:aws:s3:::<bucket>/<prefijo>/*"] }
     ]
   }
   ```

   `DeleteObject` es para la retención. Con *object lock*, ese borrado deja un marcador y el objeto
   sobrevive hasta que vence el bloqueo.
3. En el `.env` (bloque «Respaldos automáticos» de `.env.example`): `RESPALDO_CLAVE_CIFRADO`
   (`openssl rand -base64 48`), `RESPALDO_S3_ENDPOINT`, `RESPALDO_S3_BUCKET`,
   `RESPALDO_S3_ACCESS_KEY`, `RESPALDO_S3_SECRET_KEY`, y recomendado `RESPALDO_URL_LATIDO`.
4. **La clave de cifrado se guarda también fuera del servidor** (gestor de secretos del municipio,
   sobre cerrado en caja fuerte, lo que haya). Sin ella los respaldos no se abren, y si solo vive en
   el servidor se pierde con él, justo el día que hace falta.

```bash
docker compose --profile respaldos build respaldo
docker compose --profile respaldos run --rm respaldo verificar    # base y bucket (sube y borra una prueba)
docker compose --profile respaldos up -d respaldo                 # respalda ya y después cada día
docker compose logs -f respaldo                                   # una línea JSON por evento
docker compose --profile respaldos run --rm respaldo listar       # qué hay en el bucket
docker compose --profile respaldos run --rm respaldo respaldar    # uno ahora, fuera de horario
```

Si se prefiere que lo dispare el cron del servidor en vez del bucle del contenedor:
`docker compose --profile respaldos run --rm respaldo respaldar` sale con 0 o 1.

**Comprobado el 2026-09-26** contra un PostGIS 18.6 y un MinIO desechables, con una credencial
limitada al prefijo y el contenedor en solo lectura y sin capabilities: respaldo de la base
sembrada (91 KB cifrado, 3 s), manifiesto con las filas exactas, retención (borró un objeto
plantado con 10 días y conservó los nuevos), restauración con conteos verificados, rechazo de una
base sin migrar, de una base en otra versión, de una base con datos y de la clave equivocada, y
parada limpia con SIGTERM.

### Respaldo manual (sin el perfil)

```bash
docker compose exec -T postgis pg_dump -U curichi -d curichi --format=custom --compress=6 \
  --exclude-table=public._migraciones --file=/tmp/curichi.dump
docker compose exec -T postgis psql -U curichi -d curichi -tAc "SELECT max(nombre) FROM _migraciones"
docker compose cp postgis:/tmp/curichi.dump ./respaldos/curichi-$(date +%Y%m%d-%H%M)-m<NNNN>.dump
```

Apuntá la migración en el nombre del archivo: sin ella no se sabe hasta dónde migrar al
restaurar. O directamente `node --env-file=.env scripts/respaldo.mjs respaldar`, que hace lo mismo
y deja `<archivo>.migracion` al lado. **Sin cifrar no sale de la máquina.**

> **En Git Bash sobre Windows**, `docker exec … /tmp/curichi.dump` no funciona: la shell traduce
> la ruta a `C:/Users/…/Temp/curichi.dump` antes de pasarla al contenedor y `pg_dump` responde
> `could not open output file`. Se evita con `MSYS_NO_PATHCONV=1` delante del comando, o usando
> `//tmp/curichi.dump`. En PowerShell, en macOS y en Linux no hace falta.

### Sin Docker (modo local, PGlite)

PGlite guarda todo en un directorio. Con el proceso **parado**:

```bash
tar -czf respaldos/pglite-$(date +%Y%m%d-%H%M).tar.gz infra/.pglite
```

> En caliente no sirve: se copiaría un estado a medias. Para un respaldo lógico con la base en
> marcha se usa `pg_dump` normal contra `127.0.0.1:5433`, que es un PostgreSQL de verdad por el
> socket.

### Fotos

Con S3 gestionado (producción): versionado del bucket activado y, si el proveedor lo permite,
replicación a otra región. Con el disco o el MinIO local:

```bash
docker run --rm -v mi-curichi_fotos-data:/fotos:ro -v "$PWD/respaldos:/destino" busybox \
  tar -czf /destino/fotos-$(date +%Y%m%d-%H%M).tar.gz -C /fotos .
```

---

## Restauración

Todo se hace **en una base nueva**, nunca encima de la que hay: se comprueba y después se cambia.

```bash
# 0) Qué respaldo y en qué migración está (la «m0012» del nombre, o el manifiesto).
docker compose --profile respaldos run --rm respaldo listar

# 1) Base vacía. Si se perdió el servidor entero: `docker compose up -d postgis` sobre un volumen
#    nuevo (el init crea los roles de aplicación) y la base se llama como siempre.
docker compose exec postgis createdb -U curichi curichi_restaurada

# 2) Esquema EXACTAMENTE hasta la versión del respaldo, con el job de migraciones.
MIGRAR_BASE=curichi_restaurada docker compose --profile servicios run --rm --no-deps \
  migraciones node node_modules/db/dist/cli/migrar.js --hasta 0012

# 3) Datos: baja el respaldo, comprueba su sha256, lo descifra, comprueba que la base está en esa
#    versión y vacía, carga public y geo, y compara las filas de cada tabla con el manifiesto.
docker compose --profile respaldos run --rm respaldo restaurar ultimo curichi_restaurada

# 4) El resto de las migraciones (convierten los datos al esquema del código actual).
MIGRAR_BASE=curichi_restaurada docker compose --profile servicios run --rm --no-deps migraciones
```

El paso 3 se niega, con el motivo, si la base no está migrada hasta la versión del respaldo, si
ya tiene reportes o usuarios, si el archivo no coincide con su manifiesto o si la clave no es la
del respaldo. Carga con `--disable-triggers` si el rol es superusuario y, en una base gestionada,
con `session_replication_role=replica`: el orden de las tablas no respeta las claves foráneas.

5. **Cambiar de base**, con los servicios parados:

```bash
docker compose --profile servicios stop api-core geo-service
docker compose exec postgis psql -U curichi -d postgres \
  -c "ALTER DATABASE curichi RENAME TO curichi_anterior" \
  -c "ALTER DATABASE curichi_restaurada RENAME TO curichi"
docker compose --profile servicios up -d
```

6. **Fotos**: restaurar el volumen o el bucket del mismo momento.

7. **Comprobar** antes de dar por buena la restauración:

```sql
-- Debe haber reportes, capas vigentes y usuarios con rol.
SELECT count(*) FROM reporte_inundacion;
SELECT capa, version FROM geo.capa_version WHERE vigente;
SELECT rol, count(*) FROM usuario GROUP BY rol;
SELECT count(*) FROM reporte_inundacion WHERE NOT ST_IsValid(geom);   -- 0
```

y `/ready` de api-core (`docker compose exec api-core node -e "fetch('http://127.0.0.1:3001/ready').then(r=>r.text()).then(console.log)"`).

Los puntos críticos vienen en el respaldo. Si se quiere recalcularlos desde los reportes (por
ejemplo, con otro radio): `pnpm --filter db puntos-criticos:recalcular` desde una máquina con el
repositorio y `DATABASE_URL` del rol dueño.

Con un archivo manual (`.dump` sin cifrar y su migración), los pasos 3 y 4 son:

```bash
docker compose cp ./respaldos/curichi-….dump postgis:/tmp/curichi.dump
docker compose exec -T postgis pg_restore -U curichi -d curichi_restaurada --data-only \
  --schema=public --schema=geo --disable-triggers --exit-on-error -j 4 /tmp/curichi.dump
MIGRAR_BASE=curichi_restaurada docker compose --profile servicios run --rm --no-deps migraciones
```

`--exit-on-error` es lo que convierte un problema en un fallo: por defecto `pg_restore` sigue
adelante, imprime «errors ignored on restore» y termina con código 0, de modo que una tarea
automática daría la restauración por buena. `--schema=public --schema=geo` deja fuera los datos de
otras extensiones de la imagen (`tiger`, `topology`), que no son de la aplicación y no existen en
una base creada por las migraciones.

---

## Simulacro mensual

> «Tenemos respaldos» no es evidencia de nada. Un respaldo que nunca se restauró es una hipótesis.

**El primer lunes de cada mes**, en el servidor de cada ciudad, con el respaldo REAL del bucket
(no uno recién hecho: se trata de probar lo que habría el día del desastre):

```bash
docker compose exec postgis createdb -U curichi curichi_simulacro
docker compose --profile respaldos run --rm respaldo listar                    # anotar la mNNNN del último
MIGRAR_BASE=curichi_simulacro docker compose --profile servicios run --rm --no-deps \
  migraciones node node_modules/db/dist/cli/migrar.js --hasta NNNN
time docker compose --profile respaldos run --rm respaldo restaurar ultimo curichi_simulacro
MIGRAR_BASE=curichi_simulacro docker compose --profile servicios run --rm --no-deps migraciones
docker compose exec postgis psql -U curichi -d curichi_simulacro \
  -c "SELECT count(*) AS reportes, count(*) FILTER (WHERE NOT ST_IsValid(geom)) AS invalidas FROM reporte_inundacion"
docker compose exec postgis dropdb -U curichi curichi_simulacro
```

Da por bueno el simulacro solo si: `restaurar` terminó con «restauración de datos completa y
verificada» (filas iguales al manifiesto, tabla por tabla), las migraciones posteriores terminaron
con 0, hay reportes, 0 geometrías inválidas y el respaldo tiene menos de 26 h. Anotá en el registro
de operación la fecha, el objeto, su tamaño y el tiempo del paso de datos (es el RTO medido).

Si algo falla, **es un incidente**: los respaldos no sirven hasta que se entienda por qué.

En la máquina de desarrollo, el mismo recorrido en un comando (respalda, restaura en
`<base>_simulacro` en tres pasos, compara doce comprobaciones con el original y borra la base de
prueba); devuelve código distinto de cero si algo no coincide:

```bash
node --env-file=.env scripts/respaldo.mjs simulacro
```

El CI lo ejecuta en cada PR contra PostgreSQL real (job `postgres-real`), así que un cambio de
esquema que rompa la restauración de los respaldos se ve antes de llegar a `main`.

---

## Medidas

### Fase 4 (2026-09-15), PostgreSQL 18.6 + PostGIS 3.6.4 en Docker

Base de **1 004 MB** con **1 000 025 reportes** (750 021 publicables), 15 índices y 7 migraciones:

| Paso | Tiempo | Resultado |
|---|---:|---|
| `pg_dump -Fc -Z 6` | **5,2 s** | 68 MB (≈15× de compresión) |
| `pg_restore -j 4` en base vacía | **14,4 s** | — |
| **Total de recuperación** | **19,6 s** | — |

Verificación de la copia restaurada, todo coincidente con el original: 1 000 025 reportes,
750 021 publicables, 1 000 025 con `geom_publico`, **0 geometrías inválidas**, 12 unidades
vecinales, 2 usuarios, 7 migraciones, 15 índices, 1 punto crítico.

### 2026-09-18, con las capas reales del municipio cargadas

Base de **82 MB**: 38 reportes, 1 foto, 222 filas de auditoría, 23 puntos críticos y las dos
versiones de capas (las reales —16 distritos, 576 unidades vecinales, 27 527 manzanas— y la
muestra sintética que quedó cargada pero no vigente).

| Paso | Tiempo | Resultado |
|---|---:|---|
| `pg_dump -Fc -Z 6` | **3,3 s** | 19 MB |
| `pg_restore -j 4` en base nueva | **2,0 s** | — |
| **Total de recuperación** | **5,3 s** | — |

(Estas dos medidas son del procedimiento anterior, con volcado completo. El actual añade dos
pasadas de migraciones, de segundos, y el cifrado y la subida.)

### RPO y RTO

- **RTO** (tiempo hasta volver a estar en pie): unos **20 segundos de proceso por gigabyte**, más
  la descarga y el descifrado del respaldo, las migraciones y lo que tarde en existir la máquina y
  en arrancar los contenedores. El simulacro mensual lo mide de verdad.
- **RPO** (cuántos datos se pueden perder): **lo que haya entre respaldos**. Con el respaldo diario,
  hasta 24 horas de reportes. Si eso no es aceptable —y para reportes ciudadanos probablemente no
  lo sea en temporada de lluvias—, el paso siguiente es archivado continuo de WAL
  (`archive_mode = on` + `archive_command`, o la recuperación a un instante de una base gestionada),
  que baja el RPO a minutos. Eso NO está montado todavía y no se puede fingir que sí.
- `PENDIENTE`: los dos objetivos, acordados con el municipio.
