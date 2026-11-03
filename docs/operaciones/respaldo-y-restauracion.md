# Respaldo y restauración

> Responde a una sola pregunta: **«se perdió la base de datos, ¿cómo volvemos a tener el sistema
> en pie?»**. Los procedimientos dependen de la versión, el destino y su autorización operacional.

## Transición compatible a0022 — estado02/11/2026

El código del cierreM10 incorpora las rutas19/21/22; su confirmación independiente está
en curso. No se ha ejecutado un ensayo real22 ni migrado la demo, que conserva21. Los
ensayos M10.3 del27/10 fueron21→21 y19→21: se conservan sus cápsulas y no se repiten para
atribuirles soporte22. El [protocolo operacional](../sdd/2026-10-29-cierre-m10/protocolo-operacional-propuesto.md)
necesita concretarse, revisarse y aprobarse antes de operar instalaciones.

- En22 el respaldo también incluye **`resguardo_m10.cuota_reporte_diaria`**, datos
  restringidos al dueño. Tras una reversa21 puede seguir existiendo el archivo; el perfil
  efectivo debe conservarlo. No limpiar, sobrescribir ni excluirlo por su esquema privado.
- `snapshotContraccion` obtiene evidencia lógica versionada de tablas/filas completas,
  categorías/detalle, auxiliares, geometría, cuota/archivo, claves, FK, índices y ACL.
  `compararSnapshotsContraccion` reconstruye la proyección de los seis campos retirados
  para comparar entre19/21/22; no acepta solo la intersección de columnas ni conteos.
  La evidencia cruda del dump y su SHA permanecen separadas de esa equivalencia lógica.
- El snapshot legado queda limitado a19/21. No interpretar sus éxitos históricos como
  una comparación22. Se mantienen la interfaz histórica, formato del manifiesto/cifrado
  y los controles de corrupción, identidad, vacío y catálogo.
- Restaurar exige destino nuevo, versión exacta del respaldo, carga íntegra y validación
  antes del upgrade. Alcanzar22 requiere consentimiento explícito transaccional para0022.
  Un destino ocupado se rechaza; no se borra ni se recrea para continuar.
- La recuperación multicategoría se prueba22→21→22 con código y dependencias de cada
  versión, datos aceptados durante ambas y cuota idéntica. No es la reversa0020 ni un
  permiso para ejecutar una CLI general contra la demo o las bases protegidas.

Los comandos históricos de este documento que mencionan `curichi` no se ejecutan en
esta continuidad. Tampoco se conectan `curichi_revision` ni `postgres`; cualquier ensayo
nuevo usa únicamente los destinos y herramientas de su protocolo aprobado.

## Qué hay que respaldar y qué no

| Dato | ¿Respaldo? | Por qué |
|---|---|---|
| Tablas de `public` (reportes, fotos, usuarios, auditoría, puntos críticos) | **Sí, es lo único irrecuperable** | Lo escribieron los vecinos y los técnicos. Si se pierde, no hay de dónde sacarlo. |
| Archivo `resguardo_m10.cuota_reporte_diaria`, si existe | **Sí, restringido al dueño** | Se conserva íntegro en22 y tras reexpandir; no tiene limpieza automática ni se mezcla con el cupo operativo. |
| Objetos de fotos (volumen `fotos-data` o el bucket S3) | **Sí, aparte** | Las filas de `reporte_foto` sin el objeto dejan fotos rotas. El respaldo de la base NO las lleva. |
| Tablas de `geo.*` (distritos, unidades vecinales, manzanas) | Van en el respaldo | Se podrían regenerar con el ETL desde `data/raw/`, pero los reportes guardan el id de su unidad vecinal y la versión con que se resolvieron: restaurarlas tal cual es lo seguro. |
| `_migraciones` | **No, a propósito** | Se anota aparte cuál era la última; ver «Cómo se restaura». |
| `data/processed/` | No | Es salida del ETL, reproducible con un comando (CLAUDE.md §6.4, regla 2). |
| `data/raw/` | **Sí, pero fuera de este sistema** | Es la entrega del municipio, inmutable. Debe estar en el almacenamiento del municipio, no solo aquí (CLAUDE.md §16, punto 1). |

## Cómo se restaura, y por qué el respaldo excluye `_migraciones`

Un respaldo se restaura **con el código que haya ese día**, que puede ir varias migraciones por
delante del que lo generó. Por eso nunca se carga un volcado completo (esquema incluido):

1. Base vacía, migrada **`--hasta` la versión del respaldo** → el esquema exacto de los datos.
2. Se comprueba que no haya datos ni configuración; desde 0020 se retiran únicamente las cuatro
   semillas exactas de `categoria` que acaba de crear la migración. Se cargan **solo los datos**
   de `public` y `geo` en una transacción.
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
docker compose --profile respaldos run --rm respaldo restaurar ultimo curichi_restaurada --destino-nuevo

# 4) El resto de las migraciones (convierten los datos al esquema del código actual).
MIGRAR_BASE=curichi_restaurada docker compose --profile servicios run --rm --no-deps migraciones
```

El paso 3 se niega, con el motivo, si la base no está migrada hasta la versión del respaldo, si
ya tiene datos o configuración, si el catálogo inicial difiere, si el archivo no coincide con su manifiesto o si la clave no es la
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
SELECT categoria, count(*) FROM public.reporte GROUP BY categoria ORDER BY categoria;
SELECT capa, version FROM geo.capa_version WHERE vigente;
SELECT rol, count(*) FROM usuario GROUP BY rol;
SELECT count(*) FROM public.reporte WHERE NOT ST_IsValid(geom);   -- 0, todas las categorías
```

y `/ready` de api-core (`docker compose exec api-core node -e "fetch('http://127.0.0.1:3001/ready').then(r=>r.text()).then(console.log)"`).

Los puntos críticos vienen en el respaldo. Si se quiere recalcularlos desde los reportes (por
ejemplo, con otro radio): `pnpm --filter db puntos-criticos:recalcular` desde una máquina con el
repositorio y `DATABASE_URL` del rol dueño.

Con un archivo manual (`.dump` sin cifrar y su migración), los pasos 3 y 4 son:

```bash
docker compose cp ./respaldos/curichi-….dump postgis:/tmp/curichi.dump
# El CLI crea el destino: no ejecutar createdb ni migrarlo antes en esta variante.
node --env-file=.env scripts/respaldo.mjs restaurar /tmp/curichi.dump curichi_restaurada \
  --hasta NNNN --base-administrativa template1
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
time docker compose --profile respaldos run --rm respaldo restaurar ultimo curichi_simulacro --destino-nuevo
MIGRAR_BASE=curichi_simulacro docker compose --profile servicios run --rm --no-deps migraciones
docker compose exec postgis psql -U curichi -d curichi_simulacro \
  -c "SELECT categoria, count(*) AS reportes, count(*) FILTER (WHERE NOT ST_IsValid(geom)) AS invalidas FROM public.reporte GROUP BY categoria ORDER BY categoria"
# Conservar la base y los artefactos como evidencia; no hay limpieza automática.
```

Da por bueno el simulacro solo si: `restaurar` terminó con «restauración de datos completa y
verificada» (filas iguales al manifiesto, tabla por tabla), las migraciones posteriores terminaron
con 0, hay reportes, 0 geometrías inválidas y el respaldo tiene menos de 26 h. Anotá en el registro
de operación la fecha, el objeto, su tamaño y el tiempo del paso de datos (es el RTO medido).

Si algo falla, **es un incidente**: los respaldos no sirven hasta que se entienda por qué.

En la máquina de desarrollo, el mismo recorrido en un comando (respalda, restaura en
`<base>_simulacro` en tres pasos, compara conteos y contenido con el original y conserva la base de
prueba); devuelve código distinto de cero si algo no coincide. Si el destino ya existe, se detiene:

```bash
node --env-file=.env scripts/respaldo.mjs simulacro
```

El CI lo ejecuta en cada PR contra PostgreSQL real (job `postgres-real`), así que un cambio de
esquema que rompa la restauración de los respaldos se ve antes de llegar a `main`.

### Verificación multitemática y compatibilidad (M10.2)

La migración **0020** renombró la tabla física: desde esa versión el volcado y el manifiesto
deben incluir **`public.reporte`**, que contiene todas las categorías. `reporte_inundacion` es
una vista filtrada, sin `TABLE DATA`. Para respaldos anteriores a 0020 la tabla física sigue
siendo `public.reporte_inundacion`; las consultas manuales de arriba se adaptan a esa versión.
Se conserva el formato custom, el manifiesto de formato 1, los SHA-256 y el cifrado AES256
con su comprobación de ida y vuelta.

Antes de cargar, el servicio comprueba la versión exacta del destino y que no tenga usuarios
ni reportes **de ninguna categoría**. Lee todos los datos del archivo y exige que su lista de
tablas y conteos coincida íntegramente con el manifiesto: una lista vacía, incompleta,
duplicada, una versión inconsistente o un error de lectura impiden continuar. Después compara
los conteos del destino contra esa lista ya validada, incluidas todas las filas de `reporte`.
La comprobación SHA-256 protege el contenido del archivo; los conteos del servicio por sí solos
no prueban igualdad de contenido en la base restaurada.

El simulacro Node añade huellas SHA-256 de **todas las columnas de cada reporte**, agrupadas por
categoría, y del catálogo de categorías. Compara valores JSONB con sus tipos, `NULL`, detalle,
versión de detalle y geometría; cambiar contenido sin cambiar el conteo también falla. Las
huellas de reportes ordenan las filas y no dependen del orden de lectura. No se imprimen datos
personales ni huellas. Para un origen anterior a 0020, proyecta las columnas antiguas sobre la
tabla nueva: las columnas agregadas legítimamente se ignoran en esa comparación, sin excluir
ninguna columna que ya tuviera el respaldo. Se admiten más migraciones e índices al avanzar
de versión; nunca menos. La fuente debe permanecer quieta durante respaldo y comparación:
los cambios concurrentes de datos invalidan la comparación con el origen vivo.

Controles aislados, sin cargar `.env` ni usar PostgreSQL, Docker, S3 o cifrado reales:

```bash
node --test scripts/respaldo.test.mjs
bash infra/respaldo/respaldo.test.sh
```

El producto Node usa módulos nativos; la prueba de catálogo usa el PGlite ya instalado del paquete
`db`, en memoria. Las funciones de verificación exigen SQL inyectado. Importar no ejecuta el CLI.
El arnés Bash sanea su entorno, bloquea operadores
antes del `source` y prueba helpers con texto COPY y SQL simulado. Sus temporales están bajo
`.turbo/m10-2-2026-10-27/implementador/` (o `M10_SCRATCH`) y solo limpia su propia fixture.
El job `infra` incorpora estos controles con las dependencias fijadas por el lock y conserva shellcheck;
el simulacro real existente de `postgres-real` permanece separado.

### Guardas y ensayo M10.3

El CLI Node rechaza un destino existente **antes de CREATE, migraciones o carga**. No borra ni
recrea bases. `restaurarNode` exige la base administrativa y todos los operadores por inyección;
el CLI admite `--base-administrativa template1`. La preparación corre en una sentencia `DO`:
bloquea las tablas de `public` y `geo`, exige cero filas fuera de `_migraciones` y los datos
estándar de PostGIS, y desde 0020 exige las cuatro filas exactas originales de `categoria`, con
actor y fecha nulos. Rechaza activaciones, órdenes distintos, filas faltantes/adicionales,
configuración y errores SQL. Solo entonces elimina esas cuatro semillas, sin CASCADE.
La carga usa `--single-transaction --exit-on-error`. Una carga fallida se conserva para revisión;
no se reintenta sobre el mismo destino.

Shell exige `--destino-nuevo`, versión exacta y las mismas comprobaciones. `cargar_datos_local`
es el helper compartido entre la restauración descargada y `cargar-local`; esta segunda entrada
requiere archivo local, nombre completo de migración y `RESPALDO_DATABASE_URL` privada explícita.
No descarga, crea ni migra bases. La declaración de destino nuevo es responsabilidad del operador;
las comprobaciones de vacío y semillas nunca se omiten.

El ensayo aprobado está en `scripts/ensayar-respaldo-multitematico.mjs`. Su operación real espera
la revisión independiente y el freeze de los ocho archivos. **Esta implementación y sus pruebas
aisladas no acreditan todavía PostgreSQL/PostGIS, GPG, Docker ni una restauración real.**

Comando de consulta, sin SQL, procesos, `.env` ni creación de archivos:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs estado
```

Solo después del mensaje del principal que habilite la operación técnica:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs iniciar --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar preflight --operar
# Revisar salida, diario y memoria antes de invocar cada etapa siguiente.
node scripts/ensayar-respaldo-multitematico.mjs ejecutar crear_actual --operar
```

Orden exacto, sin bucle automático: `preflight`; para `actual` y después `pre0020`, las etapas
`crear_…`, `sembrar_…`, `respaldar_…`, `cifrar_…`, `restaurar_…`, `verificar_…` y `negativos_…`.
No admite otros modos, nombres, rutas o SQL desde argumentos. Los cuatro bancos fijos son
`curichi_sdd_m10_20261027_{actual,copia_actual,pre0020,copia_pre0020}`. `template1` solo recibe
metadatos y CREATE. Se deriva una URL privada loopback, puerto 5432, rol dueño `curichi`; opciones
de conexión o SQL remoto se rechazan. Se compara la identidad del servidor TCP con la del
contenedor instalado. Si faltan herramientas o privilegios, se aborta sin instalarlos.

El caso actual usa `respaldarNode` y `restaurarNode`, los mismos helpers del CLI operativo.
El histórico restaura en 0019 con `restaurarNode` y el helper Shell `cargar_datos_local`, y migra
a 0021 después. Ambos usan de verdad `snapshot`/`verificar` de M10.2 y comparan además todas las
tablas auxiliares, sus claves y contenido. Los datos son pequeños y ficticios: cuenta, referencias
de fotos, cupos, auditoría, idempotencia y puntos; no copia fotos, municipio ni otra instalación.
Los negativos de igual conteo y categoría perdida usan UN cliente persistente de la copia para
BEGIN, mutación, todas las consultas del verificador y ROLLBACK; comparan antes y después.

Scratch fijo: `.turbo/m10-3-2026-10-27/implementador/ensayo/`; freeze en `implementador/freeze8.json`.
El diario conserva OID, dueño, servidor, versiones, recibos de operadores, duración, tamaño y
huellas; escribe checkpoints antes de pasar a otra guarda de recursos (mínimo 1500 MiB libres).
La clave GPG se genera solo en memoria y pasa por stdin/descriptor, sin argv ni archivo. Homedir
propio por caso, sin opciones del usuario; cierra solo el agente de ese homedir. Se conservan dumps,
cifrados, descifrados y sus SHA-256, junto con la comprobación byte a byte.

Para retomar, ejecutar `estado`, contrastar el freeze, las identidades y el último checkpoint.
Solo se puede ejecutar la próxima etapa ausente si todas las anteriores están completas e íntegras.
Una etapa iniciada o incierta, un lock sin archivar, un artefacto existente inesperado, un nombre
sin identidad propia o una discrepancia de OID detienen el ensayo. No editar el diario para forzar
la reanudación; entregar el estado al principal. No existe modo reset/reintentar/limpiar ni DROP.
Los locks terminados se archivan por etapa; los checkpoints y bancos siempre se conservan.

Pruebas aisladas adicionales:

```powershell
node --test scripts/ensayar-respaldo-multitematico.test.mjs
```

### Continuación manual del intento GPG del 28/10 (corrección acotada)

El primer `cifrar_actual` terminó **incierto**, GPG exit 2: produjo un cifrado pero no se
descifró ni se comprobó su validez. La clave efímera se perdió. El diagnóstico posterior con
`gpgconf --list-dirs` confirmó que Git GPG/GPGCONF interpretan el homedir Windows como relativo;
la ruta POSIX `/c/Users/...` devuelve el home y socket esperados. El stderr original solo quedó
como hash: este defecto comprobado no demuestra que fuera la única causa del exit 2.

El runner convierte ahora **solo argumentos de ruta de GPG/GPGCONF** (home, entrada y salida),
manteniendo nativos los ejecutables, el filesystem Node y Docker. Antes de cifrar verifica por
`gpgconf` el home y `agent-socket` exactos. Los homes nuevos son fijos, cortos y exclusivos:
`.turbo/m10-3-2026-10-27/g2-a` y `g2-h`. Rechaza homes preexistentes, rutas redirigidas/symlinks,
probes diferentes y todo exit distinto de cero. No interpreta un archivo parcial como éxito.
Los errores guardan un diagnóstico máximo de 2048 caracteres, redactando claves, contraseñas
y URLs; nunca guardan stdin. El hash de stderr comprende todo el flujo, aunque el texto exceda
su límite. Antes de salir conserva tamaños y hashes de artefactos parciales y cierra solo el
agente del home propio que comprobó; no borra archivos ni toca el llavero del usuario.

La continuación **no modifica** `implementador/freeze8.json`, `ensayo/diario.json`, el dump,
sidecar, cifrado fallido, lock archivado o home original. El nuevo freeze de ocho fuentes vive
en `implementador/correccion-gpg/freeze8.json`; solo tres fuentes cambian (runner, pruebas y
este documento). El diario hijo, `sello.json` y los artefactos nuevos viven en
`implementador/correccion-gpg/continuacion-02/`.

El sello enlaza el freeze antiguo con el nuevo, el hash exacto del diario archivado, OID
`205892`, dueño y servidor `7688456033622585387`, cuatro checkpoints completos, dump,
sidecar, cifrado fallido, home original vacío, lock del primer intento y ambos diagnósticos.
Compara el padre y freeze actuales con sus archivos preservados en `cierre/` antes de sellar
y en cada ejecución posterior. El hijo hereda esas cuatro etapas como evidencia, sin volver a
ejecutarlas. Solo se admite este intento concreto de `cifrar_actual`; no se recuperan cargas
o restauraciones inciertas. El cifrado nuevo no usa ni sobrescribe el cifrado fallido.

Consulta local sin `.env`, SQL, GPG ni Docker:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs estado-continuacion
```

**Solo tras revisión/verificación y freeze independientes de la corrección**, el principal
invoca cada línea por separado, revisando sus checkpoints:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs sellar-continuacion --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar-continuacion cifrar_actual --operar
```

Sellar solo crea el sello y diario hijo, mediante archivos nuevos; no abre conexiones.
El segundo comando usa una nueva clave exclusivamente en memoria/stdin. Solo con exit 0,
SHA-256 iguales y comparación byte a byte habilita las siguientes etapas ausentes:
`restaurar_actual`, `verificar_actual`, `negativos_actual`, y luego las siete etapas de
`pre0020`, siempre mediante `ejecutar-continuacion ETAPA --operar`. Mantienen los cuatro bancos
del plan y los mismos helpers operativos Node/Shell y verificador M10.2.

Si hay sello/hijo parcial, hash diferente, home o artefacto nuevo ya existente, etapa iniciada
o incierta, se detiene y conserva todo para revisión. Ni `sellar-continuacion` ni ejecutar una
etapa se pueden repetir encima. No editar el padre/hijo para forzar avance ni volver a crear,
sembrar o respaldar la fuente actual. No existe continuación automática del intento 02 fallido.
Las pruebas aisladas no certifican que la corrección haya superado aún un cifrado real.

**Alcance de la evidencia local del 27/10:** lógica unitaria y sintaxis con mocks. No acredita
restauración, cifrado, conectividad ni recuperación reales. El ensayo operacional multitemático
con origen/destino expresamente autorizados y la revisión independiente siguen pendientes.
No cierra producción, M10 completo ni Fase 1.

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
