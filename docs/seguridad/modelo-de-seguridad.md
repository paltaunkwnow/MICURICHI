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
| Reportes sin moderar | Pueden contener datos personales o errores; no se publican (§7.3) | `estado = 'nuevo'` |
| Fotografías | Pueden mostrar una fachada o una matrícula | MinIO/S3, servidas por api-core |
| Cuentas de técnico y admin | Dan acceso a TODA la ubicación exacta | `usuario`, `sesion` |
| Cuentas de ciudadano | Correo y nombre de quien reporta. Nunca se publican | `usuario` |
| `ip_hash` | Dato personal seudonimizado del antispam | `reporte_inundacion.ip_hash`, borrado a los 30 días |
| Credenciales de infraestructura | Base de datos, MinIO, token interno, sales | Variables de entorno, nunca en el repositorio |

**Ver el mapa no necesita cuenta y nunca la va a necesitar.** Lo que sí la exige, desde la Fase 5,
es **crear** un reporte. El motivo es antiabuso: el límite por IP no resiste a una IP dinámica
—modo avión y de vuelta, y el contador vuelve a cero—, así que sin una identidad estable no hay
nada a lo que aplicar un límite que signifique algo.

Que exista una cuenta **no** significa que el reporte deje de ser anónimo hacia fuera: `autor_id`
no sale en ninguna vista pública, ni el correo, ni el nombre. Lo sabe el municipio, no el mapa.
Esto divergió de CLAUDE.md §13 y §16.4, que describen el reporte anónimo sin cuenta; el cambio lo
pidió el usuario en la Fase 5 y CLAUDE.md necesita su autorización para actualizarse.

Las lecturas públicas siguen saliendo del navegador **sin cookies** (`credentials: 'omit'`).
Ya no hace falta —el servidor no puede cambiar de representación por una cookie— pero es gratis y
significa que la respuesta del mapa no depende de quién la pida.

---

## 2. De quién

| Actor | Qué puede intentar | Control principal |
|---|---|---|
| Visitante anónimo | Leer más de lo publicado; deducir ubicaciones exactas; abusar de recursos | Vista pública separada por ruta; jitter; rate limit. No puede escribir nada |
| Vecino malicioso con cuenta | Inundar de reportes falsos; subir archivos peligrosos | Un reporte por cuenta cada 60 min (atómico), honeypot, rate limit por IP, idempotencia, validación por *magic bytes* |
| El mismo, con IPs dinámicas | Reiniciar el límite cambiando de conexión | El límite que manda es el de la CUENTA, que la IP no mueve |
| El mismo, creando cuentas en masa | Una cuenta por reporte | Freno de altas por IP en memoria y en la base; cada cuenta vale un reporte por hora |
| Cuenta ciudadana comprometida | Llegar a la vista técnica o a la moderación | Rol exigido por ruta: 403. El alta pública no puede crear otro rol |
| Técnico curioso o comprometido | Ver o exportar más de lo que le toca; borrar rastro | Rol por ruta, auditoría que el runtime no puede leer ni borrar |
| Atacante con una vulnerabilidad de la aplicación | Convertir una lectura de más en control del servidor | Roles de PostgreSQL con mínimo privilegio; contenedores sin capabilities |
| Caché o proxy mal configurado | Servir una respuesta técnica a un anónimo | Rutas distintas para vistas distintas; `Cache-Control` cerrado por defecto |
| Dependencia comprometida | Ejecutar código en el servicio | Lockfile fijo, base Docker por digest, cargadores de imagen bloqueados |

---

## 3. La regla que ordena todo: pública y técnica son cosas distintas

El sistema sirve **dos representaciones** de un reporte:

```
GET  /api/v1/reportes              → SIEMPRE pública. Solo validado/resuelto, ubicación degradada.
GET  /api/v1/reportes/:id          → SIEMPRE pública. 404 si no está publicado.
GET  /api/v1/tecnico/reportes      → técnica. Exige rol tecnico/admin. Coordenada exacta.
GET  /api/v1/tecnico/reportes/:id  → técnica. Cualquier estado.
POST /api/v1/reportes              → exige sesión (cualquier rol). El autor sale de la sesión.
POST /api/v1/fotos                 → exige sesión. Era el último camino de escritura abierto.
```

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
| Todo lo demás | `Cache-Control: private, no-store` + `Vary: Cookie` |
| Foto de reporte publicado | `public, max-age=86400, immutable` |
| Foto de reporte sin publicar | `private, no-store` |

Una ruta nueva que se olvide del tema cae en `private, no-store`: se pierde caché, no privacidad.

---

## 4. Privacidad geográfica

| Control | Dónde | Qué impide |
|---|---|---|
| Jitter determinista hasta 30 m | `packages/contracts/src/geo/jitter.ts` | Publicar la coordenada de una vivienda |
| Sal secreta del jitter | `JITTER_SAL`, mínimo 32 caracteres | Recalcular el desplazamiento (el hash es FNV-1a, no criptográfico) |
| Punto publicable guardado (`geom_publico`) | Migración 0005 | Que el filtro por bbox use la exacta y la respuesta la desplazada: eso convertía el bbox en un oráculo por bisección |
| `manzana_id` y `direccion_aprox` ocultos si hay jitter | `vistas.ts` | Cruzar el disco de 30 m con el polígono de la manzana |
| Punto crítico publicado desde `geom_publico` | `puntos-criticos.ts` | Que un grupo de un solo miembro publique su coordenada exacta como centroide |
| Sin `radio_m`, `diametro_m` ni `advertencia_diametro` en la ruta pública | `geo-service/src/app.ts` | Publicar una medida exacta junto a una posición deliberadamente inexacta |

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
| `UPDATE` | `password_hash`, `ultimo_reporte_en` |

`rol` y `activo` no están, y `DELETE` tampoco. El registro **no puede** crear un técnico ni un
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

- Tres roles con cuenta: `ciudadano`, `tecnico` y `admin`. Contraseñas con Argon2id; los hashes
  viejos de scrypt se migran solos al entrar.
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

Frenos del alta: tope de ráfaga por IP en memoria del proceso, y altas por IP y hora contadas en
la base —sobreviven al reinicio y valen con varias réplicas—. Los intentos contra correos que ya
existen **también** consumen cupo, para que sondear no salga gratis.

### Cuota de creación de reportes

Un reporte por cuenta cada `REPORTE_MINUTOS_ENTRE_ENVIOS` (60 por defecto), ventana deslizante
desde el último aceptado. Se aplica con un `UPDATE` condicional sobre la fila del usuario, dentro
de la misma transacción que inserta el reporte:

```sql
UPDATE usuario SET ultimo_reporte_en = now()
 WHERE id = $1
   AND (ultimo_reporte_en IS NULL OR ultimo_reporte_en <= now() - interval)
```

En READ COMMITTED, la segunda transacción que intenta lo mismo espera al commit de la primera y
**vuelve a evaluar el WHERE contra la fila nueva**: ya no lo cumple, actualiza 0 filas y su
reporte se rechaza. La forma intuitiva —leer, comparar la hora, insertar— tiene una ventana de
carrera justo ahí, y no es teórica: es lo que hace un script que envía en paralelo.

Medido contra PostgreSQL 18 real (`cuota-concurrencia-pg.test.ts`): **50 envíos simultáneos con
claves de idempotencia distintas → 1 × 201 y 49 × 429, ni un 5xx**; con la misma clave → 1 × 201 y
49 × 200 por idempotencia, sin gastar un segundo turno; dos cuentas a la vez → una cada una.

Va **después** de reclamar la clave de idempotencia (para que un reenvío del mismo formulario no
gaste el turno otra vez) y **dentro** de la transacción (para que un fallo posterior lo devuelva).

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
6. Reprocesado con sharp que **descarta** EXIF, ICC, XMP e IPTC, verificado tras codificar.
7. Nombre generado por el servidor (uuid); la clave se valida con expresión regular antes de tocar
   el disco o S3.
8. Errores traducidos: al vecino nunca le llega un mensaje de libvips.

Las fotos de reportes sin publicar solo las ve el técnico, y se sirven con `private, no-store`.

---

## 8. Infraestructura

- **Contenedores**: usuario `node` (uid 1000), sistema de archivos raíz en solo lectura, `/tmp` en
  tmpfs con `noexec,nosuid`, **todas** las capabilities eliminadas, `no-new-privileges`, tope de
  procesos y de memoria.
- **Red**: todos los puertos publicados en `127.0.0.1`. PostgreSQL y MinIO no salen de la máquina.
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
