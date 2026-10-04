# Modelo de seguridad de Mi Curichi

Qué protege el sistema, de quién, y con qué. Escrito tras la auditoría de ciberseguridad del
2026-09-19; los hallazgos concretos y su corrección están en `docs/seguridad/auditoria-2026-09.md`.

Este documento no repite la política de CLAUDE.md §13: la explica y dice dónde está implementada
cada cosa, para que quien toque el código sepa qué invariante puede estar rompiendo.

---

## 1. Qué hay que proteger

| Activo | Por qué importa | Dónde vive |
|---|---|---|
| **Ubicación exacta de un reporte de vivienda** | Es lo más sensible del sistema: dice dónde vive una persona que además declaró que se le inunda la casa | `reporte_inundacion.geom` |
| Ubicación publicable | Lo que sí puede ver cualquiera | `reporte_inundacion.geom_publico` |
| Reportes sin verificar | Se publican sin moderación previa, con «NO SE HA VERIFICADO», pasada su demora (ADR 0006): pueden contener datos personales o errores hasta que un técnico los retire. Mientras esperan no los ve nadie más que su autor (§7.3) | `estado = 'nuevo'`, `publicar_en` |
| Posición del teléfono al reportar | Dice dónde estaba la persona, que suele ser su casa. **No se guarda**: solo se usa para comprobar el radio de 60 m | Solo en memoria de la petición; queda `distancia_dispositivo_m` redondeada |
| Fotografías | Pueden mostrar una fachada, una cara o una matrícula, y las de reportes sin verificar se ven en público | Disco de la VPS (o S3), servidas por api-core |
| Cuentas de técnico, admin y ejecutivo | Técnico y admin ven TODA la ubicación exacta; el ejecutivo, solo cifras | `usuario`, `sesion` |
| Cuentas de ciudadano | Correo y nombre de quien reporta. Nunca se publican | `usuario` |
| `ip_hash` | Dato personal seudonimizado del antispam | `reporte_inundacion.ip_hash`, borrado a los 30 días |
| Credenciales de infraestructura | Base de datos, MinIO, token interno, sales | Variables de entorno, nunca en el repositorio |

**Ver el mapa no necesita cuenta y nunca la va a necesitar.** Lo que sí la exige, desde la Fase 5,
es **crear** un reporte. El motivo es antiabuso: el límite por IP no resiste a una IP dinámica
—modo avión y de vuelta, y el contador vuelve a cero—, así que sin una identidad estable no hay
nada a lo que aplicar un límite que signifique algo.

Que exista una cuenta **no** significa que el reporte deje de ser anónimo hacia fuera: `autor_id`
no sale en ninguna vista pública, ni el correo, ni el nombre. Lo sabe el municipio, no el mapa.
CLAUDE.md §13 (fila «Cuenta y autor») lo recoge desde el 2026-09-26.

Las lecturas públicas siguen saliendo del navegador **sin cookies** (`credentials: 'omit'`).
Ya no hace falta —el servidor no puede cambiar de representación por una cookie— pero es gratis y
significa que la respuesta del mapa no depende de quién la pida.

---

## 2. De quién

| Actor | Qué puede intentar | Control principal |
|---|---|---|
| Visitante anónimo | Leer más de lo publicado; deducir ubicaciones exactas; abusar de recursos | Vista pública separada por ruta; jitter; rate limit. No puede escribir nada |
| Vecino malicioso con cuenta | Inundar de reportes falsos; subir archivos peligrosos; publicar una foto o un texto inapropiado, que sin moderación previa se ve hasta que lo retiren | 3 reportes y 12 fotos por cuenta y por día (atómico, en la base), demora de publicación de 1 y 4 min, honeypot, rate limit por IP, idempotencia por cuenta, validación por *magic bytes*; retiro por el técnico (y por el admin, aun verificado) con auditoría, y alerta si la bandeja sin verificar se atrasa |
| El mismo, falseando el GPS | Reportar desde lejos lo que no vio | Nada lo impide del todo: el radio de 60 m compara con la posición que **declara** el teléfono. Frenan la cuenta, el cupo, la auditoría y el rechazo del técnico; un reporte sin verificar no suma a puntos críticos ni al color de gravedad por barrio |
| El mismo, con IPs dinámicas | Reiniciar el límite cambiando de conexión | El límite que manda es el de la CUENTA, que la IP no mueve |
| El mismo, creando cuentas en masa | Una cuenta nueva por cada 3 reportes | Freno de altas por IP en memoria y en la base: 5 por hora y 10 por día (`ALTAS_POR_DIA_POR_IP`), que puede afectar a un barrio detrás de una misma IP |
| Cuenta ciudadana comprometida | Llegar a la vista técnica o a la moderación | Rol exigido por ruta: 403. El alta pública no puede crear otro rol |
| Técnico curioso o comprometido | Ver o exportar más de lo que le toca; borrar rastro | Rol por ruta, auditoría que el runtime no puede leer ni borrar |
| Atacante con una vulnerabilidad de la aplicación | Convertir una lectura de más en control del servidor | Roles de PostgreSQL con mínimo privilegio; contenedores sin capabilities |
| Caché o proxy mal configurado | Servir una respuesta técnica a un anónimo | Rutas distintas para vistas distintas; `Cache-Control` cerrado por defecto |
| Dependencia comprometida | Ejecutar código en el servicio | Lockfile fijo, base Docker por digest, cargadores de imagen bloqueados |

---

## 3. La regla que ordena todo: pública y técnica son cosas distintas

El sistema sirve **dos representaciones** de un reporte:

```
GET  /api/v1/reportes              → SIEMPRE pública. nuevo/validado/resuelto con publicar_en <= now(),
                                     ubicación degradada, sin autor.
GET  /api/v1/reportes/:id          → SIEMPRE pública. 404 si espera su publicar_en, o si está
                                     rechazado o duplicado.
GET  /api/v1/mis-reportes          → exige sesión. Solo los del autor de la sesión, en cualquier estado.
GET  /api/v1/tecnico/reportes      → técnica. Exige rol tecnico/admin. Coordenada exacta.
GET  /api/v1/tecnico/reportes/:id  → técnica. Cualquier estado, pero nunca lo que espera su publicar_en.
POST /api/v1/reportes              → exige sesión (cualquier rol). El autor sale de la sesión.
POST /api/v1/fotos                 → exige sesión. Era el último camino de escritura abierto.
```

La visibilidad vive en un solo lugar: `ESTADOS_PUBLICOS` en `contracts` y `condicionPublico` /
`condicionPublicado` en `services/api-core/src/visibilidad.ts`, que usan la vista pública, la
técnica, la exportación, indicadores, ejecutivo, moderación y fotos (y geo-service, en los
agregados). Una prueba de tabla recorre todas las rutas con un reporte en espera. El filtro
`estado` de la ruta pública se aplica **dentro** de los públicos: pedir `rechazado` devuelve vacío.

Tener sesión **no acerca a la vista técnica**: un rol `ciudadano` recibe 403 en `/api/v1/tecnico/*`
y el listado público devuelve los mismos bytes con su cookie y sin ella. Hay pruebas de las dos
cosas, en Vitest y en Playwright, precisamente porque añadir cuentas a la app pública es la forma
más plausible de reabrir el hallazgo A-01 sin darse cuenta.

**La intención va en la ruta, no en una cookie.** Antes de la auditoría era al revés: una sola URL
devolvía una u otra cosa según si la petición traía sesión. Eso falló de tres maneras a la vez y
las tres estaban activas:

1. Las cookies no distinguen puertos ni rutas, así que el panel y el mapa público en el mismo host
   compartían sesión y el mapa público mostraba ubicaciones exactas.
2. La URL era idéntica en ambos casos, así que cualquier caché compartida podía guardar la
   respuesta de un técnico y servírsela a un anónimo.
3. Cualquier despliegue o reenvío futuro que arrastrara la cookie reabría el agujero en silencio.

Hoy el manejador público **no puede** construir una vista técnica: no mira `req.usuario`. Y la
ruta técnica responde 401/403 en lugar de degradar a la vista pública, porque un error de
configuración tiene que verse, no taparse.

**Si añadís una ruta que devuelva datos distintos según quién pregunte, no lo hagas: hacé dos
rutas.**

### Caché

`services/api-core/src/cache.ts` decide en un solo sitio y **cerrado por defecto**:

| Respuesta | Cabecera |
|---|---|
| Listado y detalle públicos | `Cache-Control: public, no-cache` |
| Todo lo demás (vistas técnicas, exportación, `/auth/*`, `/mis-reportes`, indicadores, ejecutivo) | `Cache-Control: private, no-store` + `Vary: Cookie` |
| Foto de reporte publicado (`nuevo` pasada la demora, `validado`, `resuelto`) | `public, no-cache` con `ETag`; la visibilidad se comprueba **antes** de responder `304`, así que una foto retirada da `404` aunque el navegador tenga su `ETag` |
| Foto del autor (en espera, rechazada o duplicada), de un reporte retirado para técnico y admin, o sin reporte para quien la subió | `private, no-store` |
| Cualquier otra foto | `404` con `no-store` |

Las fotos publicadas no van con `max-age` ni `immutable`: sin moderación previa, retirar es el único
control, y una caché compartida seguiría sirviendo la foto retirada hasta que venciera.

Una ruta nueva que se olvide del tema cae en `private, no-store`: se pierde caché, no privacidad.

---

## 4. Privacidad geográfica

| Control | Dónde | Qué impide |
|---|---|---|
| Jitter determinista hasta 30 m | `packages/contracts/src/geo/jitter.ts` | Publicar la coordenada de una vivienda |
| Sal secreta del jitter | `JITTER_SAL`, mínimo 32 caracteres | Recalcular el desplazamiento (el hash es FNV-1a, no criptográfico) |
| Punto publicable guardado (`geom_publico`) | Migración 0005 | Que el filtro por bbox use la exacta y la respuesta la desplazada: eso convertía el bbox en un oráculo por bisección |
| El reporte no guarda ni publica manzana ni dirección (quitados el 2026-09-25) | `vistas.ts`, `contracts` | Ya no hay campo que cruzar con el disco de 30 m; si se reincorpora uno derivado de la geometría, debe ocultarse cuando hay jitter |
| Punto crítico publicado desde `geom_publico` | `puntos-criticos.ts` | Que un grupo de un solo miembro publique su coordenada exacta como centroide |
| Sin `radio_m`, `diametro_m` ni `advertencia_diametro` en la ruta pública | `geo-service/src/app.ts` | Publicar una medida exacta junto a una posición deliberadamente inexacta |
| La posición del teléfono (`dispositivo`) no se guarda: solo `distancia_dispositivo_m` redondeada y la precisión | `api-core/src/ubicacion-dispositivo.ts`, migración 0013 | Dejar en la base, sin que nadie lo decida, dónde estaba la persona al reportar (casi siempre, su casa) |
| pino redacta `body.dispositivo`; la auditoría y la huella de idempotencia no lo incluyen | `api-core/src/registro.ts`, `rutas/reportes.ts` | Que la posición del teléfono termine en los logs o en otra tabla |
| La web no pide ni lee ubicación ni cámara al cargar; `Permissions-Policy: geolocation=(self), camera=(self)` | `apps/web-ciudadano` | Leer la ubicación de quien solo mira el mapa |

**Riesgo residual documentado.** El campo `punto_critico_id` es público y dos reportes que lo
comparten están, en coordenadas exactas, a 25 m o menos por cercanía transitiva (§9.2). Eso acota
algo la posición real de una vivienda. Se midió con el jitter real sobre 110 casos simulados: el
radio de la región donde puede estar la vivienda pasa de 29,2 m a 29,1 m de mediana. Es
información, pero no es suficiente para identificar una dirección, y el dato es necesario para la
función de recurrencia, que es el propósito del sistema. Queda aceptado y escrito.

---

## 5. Mínimo privilegio en PostgreSQL

Tres roles, tres trabajos:

| Rol | Quién lo usa | Qué puede |
|---|---|---|
| `curichi` | Migraciones, seeds, ETL | Dueño del esquema: DDL |
| `curichi_api` | api-core en ejecución | DML acotado tabla por tabla (0008) y, en `usuario`, columna por columna (0009) |
| `curichi_geo` | geo-service en ejecución | `SELECT` sobre cinco tablas y nada más |

Ninguno de los dos roles de aplicación tiene `SUPERUSER`, `CREATEROLE`, `CREATEDB` ni `BYPASSRLS`,
ni es dueño de ninguna tabla, ni puede `CREATE` en ningún esquema.

Los grants se escriben **uno a uno**. No se usa `GRANT ON ALL TABLES` ni `ALTER DEFAULT
PRIVILEGES`: una tabla nueva debe empezar sin permisos y fallar a la vista.

Sobre `usuario` el grant es **por columna**, porque desde la Fase 5 api-core escribe ahí desde una
ruta pública (el alta):

| Operación | Columnas |
|---|---|
| `INSERT` | `email`, `nombre`, `password_hash` |
| `UPDATE` | `password_hash` |

El cupo diario vive en la tabla `cuota_reporte_diaria` (migración 0014, con `SELECT`, `INSERT`,
`UPDATE` y `DELETE` para `curichi_api`). La columna vieja `ultimo_reporte_en` y su permiso los
quitó la migración 0016 de contracción. `rol` y `activo` no están, y `DELETE` tampoco. El registro **no puede** crear un técnico ni un
administrador, y no porque el código sea cuidadoso: porque no tiene permiso.

Tres capas de comprobación:

1. `infra/sql/01-roles.sh` crea los roles al inicializar el volumen.
2. La migración `0008_privilegios_minimos.sql` concede exactamente lo necesario.
3. Los servicios comprueban al arrancar que su rol no tiene privilegios de más y **en producción se
   niegan a servir** si los tiene (`packages/db/src/privilegios.ts`). geo-service comprueba además
   que no puede escribir en `reporte_inundacion`.

Para auditar en cualquier momento: `pnpm privilegios` compara la realidad contra la matriz y falla
si sobra o falta algo.

---

## 6. Autenticación y sesiones

- Cuatro roles con cuenta: `ciudadano`, `tecnico`, `ejecutivo` y `admin`. Contraseñas con
  Argon2id; los hashes viejos de scrypt se migran solos al entrar. Las cuentas que no son
  ciudadanas se crean con el CLI de `packages/db` (`cuentas crear`) y el rol dueño de la base.
- Cookie `curichi_sesion`: `HttpOnly`, `SameSite=Lax`, `Secure` en producción (`COOKIE_SEGURA=1`,
  obligatorio: el servicio no arranca sin él), `Path=/`, **sin `Domain`** para que sea del host.
- Doble caducidad: absoluta (`SESION_DIAS`) y por inactividad (`SESION_IDLE_HORAS`).
- Freno de fuerza bruta por cuenta y por IP, consultado **antes** de verificar la contraseña para
  que un ataque no consuma el Argon2id.
- Hash señuelo cuando el email no existe: el tiempo de respuesta no delata si la cuenta existe.
- **Rotación al entrar**: la sesión que trajera la petición se borra antes de crear la nueva, así
  que un identificador plantado de antemano no sobrevive al inicio de sesión (fijación).
- CSRF: `SameSite=Lax` impide que la cookie viaje en peticiones cross-site que cambian estado, y
  el preflight de CORS no permite `PATCH` desde orígenes ajenos.

### Alta de cuenta ciudadana

`POST /api/v1/auth/registro`. Tres decisiones que conviene entender antes de cambiarlas:

1. **No acepta `rol`.** El rol lo pone el DEFAULT de la columna, y el rol de PostgreSQL con el que
   corre api-core **no tiene permiso para escribir esa columna** (migración 0009). Aunque alguien
   lograra colar el campo, la base lo rechaza. Comprobado conectándose con ese rol: `INSERT` con
   `rol='admin'` devuelve `42501 permission denied for table usuario`.
2. **La respuesta es la misma exista o no el correo**, y el hash se calcula siempre, en las dos
   ramas, para que el tiempo tampoco lo delate. Sin esto, la ruta sería un oráculo para saber
   quién tiene cuenta en el sistema de reportes de inundación del municipio.
3. **No inicia sesión sola.** Devolver cookie solo cuando la cuenta es nueva delataría justo lo
   que oculta el punto 2. Se paga con un paso más en la interfaz.

El precio de (2) es que **no hay verificación de correo**: sin enviar un mensaje no se puede
distinguir a quien escribe una dirección que no es suya. Es un riesgo aceptado y escrito, no un
descuido: con las notificaciones (backlog) habría que revisarlo.

Frenos del alta: tope de ráfaga por IP en memoria del proceso, y altas por IP contadas en la base
—por hora (`REGISTRO_MAX_POR_IP`, 5) y por día calendario (`ALTAS_POR_DIA_POR_IP`, 10
`<a confirmar>`)—, que sobreviven al reinicio y valen con varias réplicas. Los intentos contra
correos que ya existen **también** consumen cupo, para que sondear no salga gratis. El tope
diario existe porque el cupo es por cuenta y cada cuenta nueva lo multiplica; su precio es que un
barrio detrás de una misma IP (un colegio, un operador con CGNAT) comparte esas 10 altas.

### Cupo diario de reportes y fotos

**3 reportes y 12 fotos por cuenta y por día** calendario en `ZONA_HORARIA` (a medianoche local
vuelve a empezar; `REPORTES_POR_DIA_POR_CUENTA` y `FOTOS_POR_DIA_POR_CUENTA`, constantes del
contrato). Se cuenta en la tabla `cuota_reporte_diaria` con un solo `INSERT` atómico, dentro de la
misma transacción que inserta el reporte (`services/api-core/src/cuota.ts`):

```sql
INSERT INTO cuota_reporte_diaria (usuario_id, dia, reportes_n)
VALUES ($1, (now() AT TIME ZONE $zona)::date, 1)
ON CONFLICT (usuario_id, dia) DO UPDATE
  SET reportes_n = cuota_reporte_diaria.reportes_n + 1
  WHERE cuota_reporte_diaria.reportes_n < $maximo
RETURNING reportes_n
```

Sin fila devuelta, `429 CUOTA_DE_REPORTES` con `Retry-After` hasta la medianoche. En READ
COMMITTED, la segunda transacción que choca con la misma fila espera al commit de la primera y
**vuelve a evaluar el WHERE contra la fila nueva**, así que el máximo no se pasa. La forma
intuitiva —leer, comparar, insertar— tiene una ventana de carrera justo ahí, y no es teórica: es
lo que hace un script que envía en paralelo. El `n` devuelto fija además la demora de publicación
(60 s el 1.º, 240 s el 2.º y el 3.º): dos envíos simultáneos reciben 60 y 240 sin carrera.

La prueba contra PostgreSQL 18 real (`cuota-concurrencia-pg.test.ts`, se omite sin
`DATABASE_URL_PG_REAL`) exige que **50 envíos simultáneos con claves de idempotencia distintas
dejen exactamente 3**, y que con la misma clave quede uno solo, por idempotencia y sin gastar un
segundo turno.

Va **después** de reclamar la clave de idempotencia (para que un reenvío del mismo formulario no
gaste el turno otra vez) y **dentro** de la transacción (para que un fallo posterior lo devuelva).
La clave se guarda con el prefijo de la cuenta (`<usuario_id>:<clave>`): la misma clave en dos
cuentas crea dos reportes. Los rechazos por ubicación (`422` de radio, precisión o antigüedad)
se deciden antes y no gastan cupo.

Las fotos reservan su turno (`fotos_n`) antes de procesar la imagen y lo devuelven si el
procesamiento falla; borrar las fotos huérfanas no lo devuelve, para que subir y abandonar no
salga gratis. El mantenimiento borra las filas de días anteriores.

**Despliegue: el panel y la app pública deben ir en hosts distintos.** Nunca con `Domain` en el
dominio padre. Ver `docs/operaciones/produccion.md`.

---

## 7. Subida de fotografías

Defensa en capas, de fuera hacia dentro:

1. Tamaño máximo (`FOTO_MAX_BYTES`) y un solo archivo por petición.
2. Tipo por **magic bytes**, no por extensión ni por `Content-Type`: solo JPEG, PNG y WebP.
3. Dimensiones leídas en la **cabecera** antes de decodificar: tope de 60 megapíxeles (bomba de
   descompresión).
4. Cargadores de libvips que no se usan **bloqueados** (`sharp.block`): heif, tiff, gif, svg, pdf,
   jxl, magick y el resto. Cada uno es un parser en C sobre datos de un desconocido, y los CVE
   recientes de libvips y el RCE de libheif de agosto de 2026 estaban justo ahí.
5. Plazo de 10 s por imagen y tope de 2 hilos de libvips.
6. Reprocesado con sharp a **WebP** (calidad 80, 1600 px por lado como máximo, primer cuadro si es
   animada) que **descarta** EXIF, ICC, XMP e IPTC, verificado tras codificar recorriendo los
   chunks RIFF del archivo guardado.
7. Nombre generado por el servidor (`<uuid>.webp`); la clave se valida con expresión regular antes
   de tocar el disco o S3 (`.jpg` solo para las fotos anteriores).
8. Errores traducidos: al vecino nunca le llega un mensaje de libvips.
9. Cupo de 12 fotos por cuenta y por día, reservado antes de procesar (ver arriba).
10. Guarda de disco: con menos que `FOTOS_MIN_LIBRE_BYTES` libre, `507 SIN_ESPACIO` **antes** de
    procesar y sin gastar cupo. En la VPS las fotos comparten disco con PostgreSQL: si se llena,
    cae la base.

Quién ve cada foto (`modoDeFoto` en `services/api-core/src/rutas/fotos.ts`): la de un reporte
publicado, cualquiera, con su reporte y su etiqueta; el autor, las suyas en cualquier estado;
técnico y admin, en privado, las de reportes ya publicados que después se rechazaron o fusionaron;
una foto sin reporte, solo quien la subió, técnicos incluidos afuera (servirla a cualquiera la
volvía un alojamiento público de imágenes). Mientras el reporte espera su `publicar_en`, su foto
solo la ve el autor.

**Lo que no se garantiza.** «Solo cámara» es una barrera de interfaz: alguien con su sesión puede
mandar cualquier imagen a `POST /fotos` con curl, y el servidor no distingue de dónde salió. Sin
moderación previa, una foto sin revisar se ve desde que se publica hasta que un técnico retira el
reporte; no hay difuminado de caras ni de patentes, y una foto no se puede retirar sola (backlog).

---

## 8. Infraestructura

- **Contenedores**: usuario `node` (uid 1000), sistema de archivos raíz en solo lectura, `/tmp` en
  tmpfs con `noexec,nosuid`, **todas** las capabilities eliminadas, `no-new-privileges`, tope de
  procesos y de memoria.
- **Red**: hacia fuera solo publica el proxy (80 y 443); lo demás no publica nada o lo hace en
  `127.0.0.1`. PostgreSQL y MinIO no salen de la máquina.
- **Imagen base**: fijada por versión **y digest**. Una etiqueta flotante ya dejó Node 24.15.0 en
  producción con 11 CVE sin parchear; el build ahora falla si la versión no coincide.
- **Secretos**: solo por variables de entorno, escaneadas en pre-commit y CI (`pnpm secretos`).
  Las sales tienen longitud mínima obligatoria y el servicio no arranca con las de ejemplo.

---

## 9. Registro

Ni IPs en claro, ni cabeceras, ni secretos. El serializador de `services/api-core/src/registro.ts`
sustituye la dirección por el mismo hash con sal que usa el antispam y descarta `remotePort` y las
cabeceras enteras —ahí viajan la cookie de sesión y `Authorization`—. Antes de la auditoría, el
serializador por defecto de Fastify escribía `remoteAddress` en cada petición, lo que dejaba sin
efecto todo el cuidado que el resto del código ponía en no registrar IPs.

Los errores públicos son genéricos; el detalle va al log. Los mensajes de `pg` llevan host, usuario
y base de datos, y los de libvips delatan la biblioteca y su versión: ninguno sale al cliente.

---

## 10. Qué comprobar antes de dar por buena una corrección

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm secretos          # secretos en el árbol
pnpm audit             # dependencias con CVE conocido
pnpm privilegios       # matriz de privilegios contra la base real
pnpm test:e2e          # recorridos completos (ver e2e/README.md)
```

Y, si la corrección era de seguridad: **volvé a ejecutar el ataque original.** Que el código
parezca correcto no es evidencia.
