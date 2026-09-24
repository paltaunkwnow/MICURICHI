# Auditoría de ciberseguridad — 2026-09-19

Auditoría ofensiva y defensiva de Mi Curichi antes de producción. Todo se ejecutó contra la pila
local (Docker: PostgreSQL 18.6 + PostGIS 3.6.4, MinIO, api-core, geo-service; y las dos apps Next).
No se atacó ningún sistema de terceros.

Lo que sigue es el registro de qué se intentó romper, qué se rompió, qué se corrigió y cómo se
comprobó que la corrección aguanta. El modelo de seguridad resultante está en
[`modelo-de-seguridad.md`](modelo-de-seguridad.md).

---

## Resumen

Nueve hallazgos corregidos: tres P1, dos P2 y cuatro P3. Los dos más importantes son **variantes del
mismo error de diseño** —que un dato sensible dependiera de una señal ambiental en vez de una
decisión explícita— y uno de ellos ya había causado el P0 de la auditoría anterior por otra vía.

El hallazgo de mayor alcance no estaba en ninguna lista: **los dos servicios se conectaban a
PostgreSQL como `SUPERUSER`**. Eso no es una vulnerabilidad por sí sola, pero convierte cualquier
vulnerabilidad futura de lectura en control del servidor de base de datos.

Se comprobaron y se dieron por correctos treinta y tantos controles que ya existían. Dos hipótesis
propias resultaron **falsas al medirlas** y se dejan escritas como tales, porque una auditoría que
solo publica lo que confirma no es una auditoría.

---

## 1. Hallazgos corregidos

### [A-01] La vista técnica se activaba con una cookie, no con una decisión

| | |
|---|---|
| **Severidad** | P1 |
| **Componente** | `services/api-core` · `GET /api/v1/reportes`, `GET /api/v1/reportes/:id` |
| **OWASP** | A01 Broken Access Control · API1 BOLA · API3 Broken Object Property Authorization |
| **Estado** | Corregido y re-explotado |

**Ataque.** Iniciar sesión como técnico y pedir la URL **pública** del mapa.

```
GET /api/v1/reportes?limite=500        sin cookie  → 35 reportes, ubicación degradada
GET /api/v1/reportes?limite=500        con cookie  → 47 reportes, coordenada EXACTA
                                                     + 17 propiedades técnicas (autor_id incluido)
```

**Impacto.** La ubicación exacta de viviendas que reportaron inundación, y reportes todavía sin
moderar, servidos desde la URL que consume el mapa público. Alcanzable desde el navegador: las
cookies no distinguen puertos ni rutas, así que un técnico con el panel abierto en otra pestaña
veía el mapa público «enriquecido» sin saberlo. La auditoría anterior lo encontró por el lado del
navegador y lo tapó con `credentials: 'omit'` en el cliente; eso es una mitigación del cliente para
un problema del servidor.

**Causa raíz.** Una sola URL devolvía dos representaciones distintas según si la petición **traía**
una cookie. Autoridad ambiental: nadie había pedido la vista técnica, llegaba sola.

**Corrección.** Rutas separadas. El manejador público ya no mira `req.usuario` —no puede construir
una vista técnica ni equivocándose— y la vista técnica vive en `/api/v1/tecnico/reportes` con
`requerirRol('tecnico','admin')`. Sin sesión responde 401 y con rol equivocado 403: **nunca degrada
en silencio a la vista pública**, porque un error de configuración tiene que verse.

**Re-explotación.** Mismo ataque contra la pila reconstruida:

```
con cookie de técnico → 37 reportes, sin campos técnicos
sin cookie            → 37 reportes, sin campos técnicos
respuestas byte a byte idénticas
```

También a través del reenvío de Next, con la cookie puesta por el panel en el mismo navegador.

**Tests.** `services/api-core/test/vista-publica-vs-tecnica.test.ts` (19 casos) y
`e2e/tests/separacion-publica-tecnica.spec.ts` (6 casos).

---

### [A-02] Respuestas que dependían de la sesión sin declarar nada de caché

| | |
|---|---|
| **Severidad** | P1 |
| **Componente** | `services/api-core`, todas las rutas |
| **OWASP** | A02 Security Misconfiguration · API8 |
| **Estado** | Corregido |

**Ataque.** Observar las cabeceras de una respuesta cuyo contenido cambia con la cookie:

```
HTTP/1.1 200 OK
vary: Origin                  ← y nada más: ni Cache-Control ni Vary: Cookie
```

**Impacto.** Una caché compartida delante del servicio —un proxy del municipio, una CDN— puede
almacenar por heurística una respuesta 200 de un GET sin información de frescura, y sin `Vary:
Cookie` no tiene motivo para indexarla por sesión. Resultado: la respuesta de un técnico
(coordenadas exactas) servida a cualquiera. Es la misma fuga que A-01 por otra puerta, y no
requiere que el atacante tenga sesión: le basta con pedir después que un técnico.

**Corrección.** La política vive en un solo sitio (`src/cache.ts`) y está **cerrada por defecto**:
lo que no se declare público sale con `Cache-Control: private, no-store` y `Vary: Cookie`. Solo el
listado y el detalle públicos se declaran `public, no-cache`. Una ruta nueva que se olvide del tema
pierde caché, no privacidad.

Además, al separar las rutas (A-01) la clave de caché ya distingue las dos representaciones por
construcción: ninguna caché puede confundirlas aunque ignore las cabeceras.

**Verificación.** Test con una caché compartida de juguete que aplica la regla de un proxy ingenuo
(clave = método + URL, guarda todo lo que no diga `no-store`), en los dos órdenes: técnico primero
y público primero. Y en vivo:

```
/api/v1/reportes          → cache-control: public, no-cache
/api/v1/tecnico/reportes  → cache-control: private, no-store · vary: Origin, Cookie
/api/v1/auth/yo           → cache-control: private, no-store
```

---

### [A-03] api-core y geo-service se conectaban como SUPERUSER

| | |
|---|---|
| **Severidad** | P1 |
| **Componente** | PostgreSQL · los dos servicios |
| **OWASP** | A01 Broken Access Control · A04 Insecure Design |
| **Estado** | Corregido y re-explotado |

**Hallazgo.** El rol de aplicación era el dueño del esquema y además:

```
ROL: curichi  super=true  createrole=true  createdb=true  bypassrls=true  login=true
```

**Impacto.** No es explotable por sí solo, y por eso es fácil que sobreviva a varias auditorías.
Lo que hace es multiplicar el daño de cualquier otro fallo: una inyección SQL futura, una
dependencia comprometida o una credencial filtrada dejan de ser «leer una tabla de más» y pasan a
ser control del servidor —`COPY ... PROGRAM` ejecuta órdenes del sistema operativo, `pg_read_file`
lee archivos—. Y geo-service, que por contrato (§4.6) **solo lee**, tenía permiso para borrar la
tabla de reportes y para leer los hashes de contraseña y las cookies de sesión activas.

**Corrección.** Tres roles con tres trabajos, y los permisos concedidos **uno a uno**:

| Rol | Lo usa | Privilegios |
|---|---|---|
| `curichi` | migraciones, seeds, ETL | dueño del esquema (DDL) |
| `curichi_api` | api-core | DML tabla por tabla |
| `curichi_geo` | geo-service | `SELECT` sobre cinco tablas |

No se usó `GRANT ON ALL TABLES` ni `ALTER DEFAULT PRIVILEGES`: una tabla nueva empieza sin permisos
y falla a la vista, en vez de quedar abierta sin que nadie lo decida.

Tres capas: `infra/sql/01-roles.sh` crea los roles, la migración `0008` concede, y los servicios
**comprueban al arrancar** y en producción se niegan a servir si su rol tiene privilegios de más.
geo-service comprueba además que no puede escribir en `reporte_inundacion`.

**Re-explotación.** Con las credenciales de cada rol, contra la base real: `curichi_geo` mantiene el
`SELECT` que necesita y tiene bloqueados el borrado y la modificación de reportes, la lectura de
`usuario` y `sesion`, `TRUNCATE`, `DROP`, la creación de roles, la lectura de archivos del servidor
y la ejecución de órdenes. `curichi_api` conserva el `INSERT` de reportes y tiene bloqueados el
borrado de reportes, la **lectura y el borrado de su propia auditoría**, la creación de roles y
tablas, el `DROP`, y el acceso al sistema de archivos y al intérprete de órdenes.

**Herramienta permanente.** `pnpm privilegios` compara la matriz efectiva con la documentada y falla
si sobra o falta algo. Probado en negativo: al conceder `DELETE` de más sobre `reporte_inundacion`,
responde `curichi_api · public.reporte_inundacion: SOBRA DELETE` y sale con código 1.

**Tests.** `packages/db/test/privilegios.test.ts` (6 casos) + el verificador contra base real.

---

### [A-04] Node.js 24.15.0 en producción, con 11 CVE sin parchear

| | |
|---|---|
| **Severidad** | P2 |
| **Componente** | `infra/docker/servicio.Dockerfile` |
| **OWASP** | A06 Vulnerable and Outdated Components · A03 Supply Chain |
| **Estado** | Corregido y verificado dentro de los contenedores |

**Hallazgo.** `node -v` dentro de los dos contenedores devolvía **v24.15.0**, aunque la imagen se
había construido el 18-09-2026 y la línea 24 va por 24.21.0 (07-09-2026). Causa: `FROM node:24-slim`
es una etiqueta flotante y el build reutilizó una base vieja que seguía en la caché local de Docker.
Una etiqueta flotante no avisa: sigue diciendo «24» mientras sirve lo de hace meses.

**Impacto.** Los 11 CVE corregidos en **24.18.1** (28-07-2026), tres de severidad alta. El relevante
para esta arquitectura es **CVE-2026-58044**: truncado de cabeceras en el parser HTTP que habilita
*request smuggling*, justo el escenario de un despliegue con proxy delante. Los dos HIGH de HTTP/2
(CVE-2026-56846, CVE-2026-56848) no aplican —los servicios sirven HTTP/1.1— pero el runtime seguía
siendo el vulnerable.

**Corrección.** Imagen base fijada por **versión exacta y digest**, y el build **falla** si el
binario no coincide con lo declarado:

```dockerfile
ARG NODE_VERSION=24.21.0
ARG NODE_DIGEST=sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
FROM node:${NODE_VERSION}-slim@${NODE_DIGEST} AS runtime
RUN test "v${NODE_VERSION}" = "$(node -v)" || { echo "ERROR: ..." >&2; exit 1; }
```

**Verificación.** Reconstruido y comprobado **dentro** de los contenedores, no en `package.json`:

```
docker exec curichi-api-core    node -v  → v24.21.0
docker exec curichi-geo-service node -v  → v24.21.0
```

---

### [A-05] La IP del cliente iba en claro a los logs, en cada petición

| | |
|---|---|
| **Severidad** | P2 |
| **Componente** | `services/api-core`, `services/geo-service` |
| **OWASP** | A09 Security Logging Failures · CLAUDE.md §13 |
| **Estado** | Corregido |

**Hallazgo.** El log real del contenedor:

```json
{"req":{"method":"GET","url":"/health","remoteAddress":"172.18.0.1","remotePort":36666},...}
```

**Impacto.** El proyecto se toma un trabajo considerable en no registrar IPs: `privacidad.ts` existe
para hashearlas, `rutas/auth.ts` registra `ipHash` y nunca `req.ip`, y la retención de `ip_hash` en
la base es de 30 días. Y el serializador **por defecto** de Fastify escribía la dirección en claro
dos veces por petición, sin retención ninguna más allá de la rotación del contenedor. Todo el
cuidado del resto del código quedaba anulado por una opción por defecto. Es el tipo de fallo que no
aparece leyendo el código de la aplicación: hay que mirar la salida.

**Corrección.** Serializadores propios (`src/registro.ts`): la dirección se sustituye por el mismo
hash con sal que usa el antispam, `remotePort` desaparece y las cabeceras no se registran —ahí
viajan la cookie de sesión y `Authorization`—. Sigue sirviendo para agrupar peticiones de un mismo
origen al investigar un abuso, que es para lo que hacía falta.

**Tests.** 5 casos en `seguridad.test.ts`: que no quede rastro de la dirección, que no se registren
cabeceras, que el mismo origen dé el mismo hash y dos orígenes distintos hashes distintos, y que
con otra sal deje de ser correlacionable.

---

### [A-06] Medidas de la geometría exacta publicadas en una ruta pública

| | |
|---|---|
| **Severidad** | P3 |
| **Componente** | `geo-service` · `GET /geo/v1/puntos-criticos` |
| **OWASP** | A01 · API3 Broken Object Property Authorization |
| **Estado** | Corregido |

**Hallazgo.** La ruta publicaba `radio_m`, `diametro_m` y `advertencia_diametro`. `diametro_m` es la
distancia entre los dos miembros **más separados del grupo**, calculada sobre coordenadas exactas y
redondeada a 0,1 m — publicada junto a un centroide deliberadamente desplazado. Ningún cliente los
usaba: ni el mapa público ni el panel.

**Medición antes de afirmar nada.** Simulé el ataque con el jitter real del repositorio sobre 110
casos de grupos de dos viviendas:

| Información disponible | Radio del 95 % de la región donde puede estar la vivienda |
|---|---|
| Solo el punto publicado | 29,2 m |
| + comparte punto crítico (≤ 25 m) | 29,1 m |
| + `diametro_m` publicado | 28,9 m (mínimo 24,8 m) |

**La fuga es real pero débil**: no compromete una dirección por sí sola. Mi hipótesis inicial era que
sería grave y la medición dice que no. Se corrige igualmente porque no cuesta nada, nadie lo usaba y
es dato mínimo (§13) — no porque fuera una emergencia.

**Corrección.** Fuera del esquema público y de la consulta. Siguen en la tabla para el análisis del
técnico (§9.2, advertencia de encadenamiento de DBSCAN).

**Tests.** 2 en `geo-service.test.ts` + 1 E2E que comprueba el cuerpo entero de la respuesta.

---

### [A-07] Todos los cargadores de imagen de libvips habilitados

| | |
|---|---|
| **Severidad** | P3 |
| **Componente** | `services/api-core` · subida de fotos |
| **OWASP** | A08 Software and Data Integrity · A06 |
| **Estado** | Corregido |

**Hallazgo.** El proceso llevaba activos todos los cargadores de libvips 8.18.6: heif, tiff, gif,
svg, pdf, jxl, magick, dcraw, openslide, fits… Cada uno es un parser en C sobre datos de un
desconocido. La aplicación solo acepta JPEG, PNG y WebP.

**Por qué importa aunque la comprobación previa funcione.** La validación por *magic bytes* es
nuestra y depende de que siga bien escrita; los cargadores son la capa de abajo. El RCE **crítico**
de Next.js de agosto de 2026 (GHSA-g89c-p67h-r497) estaba en **libheif**, y los cuatro CVE de
libvips de este año en los cargadores de GIF, TIFF y VIPS. Ninguno de esos formatos se acepta aquí.

**Corrección.** `sharp.block()` sobre los 16 cargadores que no se usan, al importar el módulo (no
dentro del manejador: la primera imagen del arranque pasaría sin bloquear). Añadidos además un
plazo de 10 s por imagen y un tope de 2 hilos de libvips, que faltaban: el tope de píxeles acota la
memoria pero no el tiempo, y sin límite de hilos unas pocas subidas simultáneas se quedan con toda
la CPU del contenedor.

**Verificación.** Un TIFF válido se rechaza en las dos capas —magic bytes y cargador apagado— y
JPEG, PNG y WebP siguen procesándose. 5 casos nuevos en `fotos-abuso.test.ts`.

---

### [A-08] Cuarentena de paquetes configurada pero no activada

| | |
|---|---|
| **Severidad** | P3 |
| **Componente** | `pnpm-workspace.yaml` |
| **OWASP** | A03 Software Supply Chain Failures |
| **Estado** | Corregido |

**Hallazgo.** `minimumReleaseAgeExclude` estaba escrito con dos excepciones, pero
`minimumReleaseAge` —la opción a la que esas excepciones pertenecen— no estaba puesta. La lista de
exclusiones guardaba una protección que no existía.

**Impacto.** Sin cuarentena, el proyecto puede instalar una versión publicada hace minutos. Es
exactamente la ventana que explotan los ataques de cadena de suministro de npm: se compromete la
cuenta de un mantenedor, se publica una versión con código malicioso y se retira a las pocas horas;
el daño lo sufre quien instaló durante ese rato.

**Corrección.** `minimumReleaseAge: 1440` (24 h). No retrasa un parche de seguridad legítimo: para
eso está la lista de exclusiones. Comprobado que `pnpm install --frozen-lockfile` sigue pasando
(«Lockfile passes supply-chain policies»).

---

### [A-09] Contenedores sin endurecer

| | |
|---|---|
| **Severidad** | P3 |
| **Componente** | `docker-compose.yml` |
| **OWASP** | A02 Security Misconfiguration |
| **Estado** | Corregido y verificado |

**Hallazgo.** Los contenedores ya corrían como usuario `node` (bien), pero sin `no-new-privileges`,
sin `cap_drop`, con el sistema de archivos raíz escribible y sin tope de procesos.

**Corrección y verificación en ejecución:**

```
usuario: node (uid 1000) | read_only: true | no-new-privileges: true | pids: 512
capabilities eliminadas: [ALL] | añadidas: []
touch /app/x → cannot touch '/app/x': Read-only file system
```

`/tmp` en tmpfs con `noexec,nosuid`. Topes de procesos en los cuatro servicios.

---

## 2. Hipótesis propias que resultaron falsas

Se dejan escritas porque descartarlas costó trabajo y porque una auditoría que solo publica lo que
confirma no sirve para decidir.

**Los 500 bajo concurrencia en la idempotencia.** Con 50 envíos simultáneos con la misma clave,
varias respuestas eran 500 (`34000 portal "" does not exist`, `26000 unnamed prepared statement does
not exist`). Parecía una carrera sin controlar. Repetido contra **PostgreSQL 18.6 real**, con base
temporal y el mismo código:

```
concurrencia  3 → {"200":2,"201":1}  | 1 reporte | 1 id distinto
concurrencia 10 → {"200":9,"201":1}  | 1 reporte | 1 id distinto
concurrencia 50 → {"200":49,"201":1} | 1 reporte | 1 id distinto
```

Ni un 5xx. Era un artefacto de PGlite, que es de una sola conexión y multiplexa sesiones sobre el
mismo motor, pisándose el portal sin nombre del protocolo extendido ([ADR
0003](../decisiones/0003-pglite-solo-en-local-y-pruebas.md)). **La implementación de idempotencia es
correcta.** El test lo documenta y afirma las invariantes del dominio, no los códigos de estado, a
esa concurrencia.

**La inferencia por `diametro_m`.** Ver A-06: esperaba una fuga seria y la medición dio 29,2 → 28,9 m
de radio. Se corrigió por dato mínimo, no por gravedad.

---

## 3. Controles comprobados y correctos

Todo esto se atacó y aguantó. No se cambió nada.

| Área | Qué se intentó | Resultado |
|---|---|---|
| **Control de acceso** | 9 rutas privadas sin sesión, con sesión de rol insuficiente, y detalle de reportes sin publicar | 401 / 403 / 404 según corresponde |
| **IDOR / BOLA** | IDs de otros recursos, inexistentes, con codificación, malformados | 404 sin distinguir «no existe» de «no autorizado» |
| **Inyección SQL** | 7 filtros con comillas, `OR 1=1`, `DROP TABLE`, `pg_sleep`, `UNION` | Todo parametrizado; 200 sin efecto o 400 de Zod |
| **Límites y agotamiento** | `limite=999999999`, `pagina=999999999`, negativos, bbox mundial, `NaN`, `1e400`, bbox de 5 elementos | 400 en todos; el bbox mundial responde en 10 ms acotado |
| **Traversal** | 5 variantes sobre `/api/v1/fotos/:key`, incluida doble codificación y byte nulo | 404; la clave se valida con expresión regular antes de tocar disco o S3 |
| **CORS** | Origen arbitrario, `null`, preflight de `PATCH` | Sin `ACAO` para orígenes ajenos; `allow-methods` no incluye `PATCH` |
| **Evasión de rate limit** | `X-Forwarded-For` distinto en cada petición, `X-Real-IP`, `Forwarded`, cabecera duplicada | El contador baja igual: con `TRUST_PROXY=0` no se mira ninguna |
| **Confianza en proxy acotada** | Con `TRUST_PROXY=2`, cliente antepone entradas falsas a `X-Forwarded-For` | Gana la IP escrita por un proxy de confianza; `true` y `*` ya no se aceptan |
| **Host header** | `Host: evil.example` y `host@evil.example` | Sin efecto: no se construyen URLs con datos del cliente; las de fotos son relativas |
| **`/metrics`** | Sin token, en los dos servicios | 403 |
| **Ruta interna de invalidación** | Sin token y con token incorrecto | 403; comparación en tiempo constante |
| **Autenticación** | Enumeración por tiempo, fuerza bruta, sesión caducada, sesión inactiva, cookie manipulada | Hash señuelo, freno por cuenta e IP antes del Argon2id, doble caducidad |
| **Entradas hostiles a geo-service** | `lat/lon` infinitos, `NaN`, `null`, objetos anidados, teselas con coordenadas enormes o traversal | 400 con mensaje de Zod; 204 en teselas vacías |
| **Almacén de fotos** | Claves manipuladas, traversal, extensiones falsas | Validación por expresión regular; sin URLs prefirmadas, sin listado, bucket privado |
| **Secretos en el navegador** | Búsqueda de `NEXT_PUBLIC` y `process.env` en código de cliente | Ninguna variable llega al bundle |
| **Service worker** | Caché de respuestas de API | `/api/` excluido explícitamente; solo capas y estáticos del propio origen |
| **ETL** | `child_process`, `eval`, rutas desde entrada | No invoca procesos externos; rutas resueltas contra la raíz del repositorio y versión validada contra la configuración |
| **Cadena de suministro** | Scripts de instalación, dependencias por git o tarball | `allowBuilds` con lista explícita; el install aborta si aparece un paquete no declarado; 0 dependencias fuera del registro |
| **Condiciones de carrera** | 50 envíos simultáneos con la misma clave; moderación concurrente | Un solo reporte; `FOR UPDATE` en los cambios de estado |

### Versiones comprobadas contra los avisos vigentes

| Paquete | Instalado | Aviso | ¿Afecta? |
|---|---|---|---|
| `@fastify/multipart` | 10.1.1 | CVE-2026-18549 (alto), corregido en 10.1.1 | **No**: es la versión corregida |
| `@fastify/busboy` | 3.2.2 | CVE-2026-74866, corregido en 3.2.2 | **No**: es la versión corregida |
| `sharp` / libvips | 0.35.4 / 8.18.6 | GHSA-f88m-g3jw-g9cj, corregido en 0.35.0 | **No**: posterior |
| `next` | 16.3.5 | CVE-2026-75604 y RCE de AVIF, corregidos en 16.3.3 | **No**: posterior, y no se usa `next/image`, y el host es Linux |
| PostgreSQL | 18.6 | CVE-2026-2006 y otros, corregidos en 18.6 | **No**: es la versión corregida |
| Node.js | 24.15.0 → **24.21.0** | 11 CVE corregidos en 24.18.1 | **Sí** → ver A-04 |

`pnpm audit`: sin vulnerabilidades conocidas.

---

## 4. Inventario de endpoints

26 rutas documentadas en OpenAPI (incluidas las dos técnicas y, desde el 2026-09-22,
`POST /api/v1/auth/registro`; ver §9). Dos deliberadamente **no**
documentadas en la especificación pública, por ser internas:

| Ruta | Clasificación | Control |
|---|---|---|
| `/metrics` (ambos servicios) | Infraestructura | Token obligatorio en producción; el servicio no arranca con ruta y sin token |
| `POST /geo/v1/capas/invalidar` | Interna | Token compartido comparado en tiempo constante; sin token, solo loopback |

No se encontraron endpoints de depuración, legacy ni olvidados. `/docs` (Swagger UI) se expone solo
fuera de producción.

---

## 5. Riesgos residuales

Los que quedan, con el motivo por el que quedan.

1. **`punto_critico_id` es público y acota algo la ubicación exacta.** Dos reportes que lo comparten
   están a ≤ 25 m en coordenadas exactas por cercanía transitiva. Medido: el radio de la región
   posible pasa de 29,2 m a 29,1 m. Es información, pero no identifica una dirección, y el dato es
   necesario para la función de recurrencia, que es el propósito del sistema. **Aceptado.**
2. **La unidad vecinal de un reporte se calcula sobre la coordenada exacta.** Cerca de un límite,
   eso dice de qué lado de la calle está la vivienda. La agregación por UV es la función central del
   sistema (§4.6). **Aceptado y escrito.**
3. **`script-src` lleva `'unsafe-inline'`.** Next inyecta el payload de hidratación en línea;
   quitarlo exige nonces por middleware y renderizado dinámico de todas las páginas, lo que acabaría
   con el mapa público estático. La app no renderiza HTML de terceros en ningún punto y no hay
   `dangerouslySetInnerHTML`. **Asumido a sabiendas**, ya documentado en `next.config.ts`.
4. **PostgreSQL sin TLS en local.** Las conexiones van por la red interna de Docker con los puertos
   atados a loopback. En producción, `sslmode=require` está en la lista de `produccion.md`.
   **Pendiente de la infraestructura del municipio.**
5. **No se ha probado un proxy inverso real delante.** El análisis de *request smuggling* se resolvió
   actualizando el runtime (A-04), pero no se montó una topología nginx → Node para provocar
   divergencias de parseo. Requiere decidir antes qué proxy usará el municipio. **No verificado; se
   dice explícitamente.**

---

## 6. Qué no se pudo comprobar

Con honestidad, y sin convertir «no lo probé» en «está bien»:

- **DAST / OWASP ZAP**: no está instalado en esta máquina y no se añadió por no meter una
  dependencia grande sin necesidad. La superficie HTTP se atacó a mano con `curl` y con Playwright.
- **Escaneo de imágenes con Trivy o similar**: no instalado. La comprobación de versiones se hizo
  contra los avisos oficiales de cada proyecto, uno a uno, y verificando el binario **dentro** del
  contenedor.
- **SBOM formal**: no se generó. El lockfile está fijado, el CI usa `--frozen-lockfile` y no hay
  dependencias fuera del registro.
- **Request smuggling con proxy real**: ver riesgo residual 5.
- **TLS de extremo a extremo**: no hay certificados ni dominio todavía; es un bloqueador externo ya
  registrado en `produccion.md`.

---

## 7. Resultados de la verificación final

```
Lint                245 archivos, sin errores
Typecheck           9 paquetes
Unit + integración  329 pasan, 2 omitidos   (antes: 284 + 2)
E2E                 61 pasan, 0 fallos      (antes: 55)
Build               7 tareas
Secretos            sin hallazgos
Dependencias        sin vulnerabilidades conocidas
Privilegios         matriz correcta contra la base real
Docker              4 contenedores healthy, /ready {db, geo, fotos} = ok
Node en contenedor  v24.21.0 (api-core y geo-service)
```

**45 tests nuevos** (39 unitarios/integración + 6 E2E), todos ligados a un hallazgo concreto.

Base de datos con los datos reales del municipio: 16 distritos, 576 unidades vecinales, 27 527
manzanas, capa `DM_UV_MZ_2025` vigente.

---

## 8. Estado

**SEGURO PARA STAGING · CONDICIONALMENTE LISTO PARA PRODUCCIÓN.**

Condicionado a cosas que **no dependen del código** y que ya estaban registradas como bloqueadores:
dominio y TLS, mapa base propio en lugar de las teselas de OpenStreetMap, política de retención
acordada con el municipio, y respaldos cifrados con destino definido. A esa lista se añade ahora
montar y probar el proxy inverso real (riesgo residual 5).

Desde el punto de vista del código y de la configuración local, los nueve hallazgos están corregidos,
cada uno tiene un test que falla si alguien los deshace, y cada corrección se comprobó repitiendo el
ataque original contra la pila reconstruida.

No se afirma que el sistema sea inexpugnable: eso no es demostrable. Lo que sí se puede demostrar es
lo que hay en este documento.

---

## 9. Cuentas ciudadanas y cuota antiabuso (2026-09-22)

Cambio de producto pedido por el usuario: **ver el mapa sigue sin cuenta; crear un reporte la
exige**, y cada cuenta puede enviar **uno cada 60 minutos**. El motivo es el que se observó: sin
cuenta y con IPs dinámicas, el único freno (por IP) se reiniciaba a voluntad.

> Esto diverge de CLAUDE.md §13 y §16.4, que describen el reporte anónimo sin cuenta. CLAUDE.md no
> se ha editado: necesita la autorización del usuario. Hacia fuera el reporte sigue siendo
> anónimo —`autor_id` no sale en ninguna vista pública—; lo que cambia es que el municipio sabe
> qué cuenta lo envió.

### Qué se implementó

| Pieza | Dónde | Decisión |
|---|---|---|
| Alta de cuenta | `POST /api/v1/auth/registro` | Respuesta idéntica exista o no el correo; hash siempre; sin cookie; sin campo `rol` |
| Autorización de escritura | `POST /reportes`, `POST /fotos` | `requerirRol('ciudadano','tecnico','admin')`; el autor sale de la sesión |
| Cuota | `services/api-core/src/cuota.ts` | `UPDATE` condicional sobre `usuario.ultimo_reporte_en`, dentro de la transacción, después de la idempotencia |
| Privilegios por columna | Migración 0009 | `curichi_api`: INSERT (email, nombre, password_hash) y UPDATE (password_hash, ultimo_reporte_en) en `usuario`. Ni `rol` ni `activo` ni DELETE |
| Freno de altas | `packages/db/src/intentos-login.ts` | Ráfaga por IP en memoria + altas por IP y hora en la base (cuenta también los correos existentes) |
| Rotación de sesión | `abrirSesion` en `rutas/auth.ts` | La sesión que trae la petición se borra antes de crear la nueva |
| Frontend | `web-ciudadano` | `/ingresar`, `/crear-cuenta`, `/cuenta`, panel «Necesitás una cuenta» en `/reportar`; las lecturas siguen con `credentials: 'omit'` |

### Ataques intentados contra la pila reconstruida desde cero

Pila: `docker compose down -v` → `docker compose --profile servicios up -d` → `pnpm db:migrate` →
capas reales → `pnpm db:seed:samples`, con las imágenes reconstruidas con el código nuevo. Todo
contra `127.0.0.1`.

| Ataque | Resultado |
|---|---|
| `POST /reportes` sin sesión | **401 SIN_SESION**, 0 filas nuevas |
| `POST /fotos` sin sesión | **401** |
| Alta con `rol=admin`, `role=admin`, `activo=true` | 201 y la cuenta queda **ciudadano** |
| Conectarse como `curichi_api` e intentar `INSERT … rol='admin'`, `UPDATE rol`, `UPDATE activo`, `UPDATE email`, `DELETE` | **Los seis rechazados por PostgreSQL**: `42501 permission denied for table usuario`. Las tres escrituras permitidas funcionan |
| Ciudadano contra `/tecnico/reportes`, `/exportar`, `/indicadores`, `/admin/capas` | **403** las cuatro, por API y desde el panel |
| Cuerpo con `autor_id`, `autorId`, `usuario_id`, `usuarioId`, `user_id`, `userId`, `owner_id`, `ownerId`, `created_by`, `actor_id` | El reporte se atribuye **siempre** a la sesión (10 variantes, en test) |
| Cuerpo con `estado`, `severidad_*`, `creado_en`, `created_at`, `validado_por`, `ip_hash`, `id`, `rol` | Todos ignorados: `nuevo`, severidad calculada, fecha del servidor |
| `__proto__` y `constructor.prototype` en el cuerpo | Sin efecto; `Object.prototype` intacto |
| Segundo reporte de la misma cuenta | **429 CUOTA_DE_REPORTES** con `Retry-After` y hora exacta |
| Rotar `X-Forwarded-For`, `X-Real-IP` y `Forwarded` (IPv4 e IPv6) | **429** igual: el freno es de la cuenta. Con `TRUST_PROXY=1` y una IP distinta por intento (test): 1 × 201 y 5 × 429 de cuota |
| 50 envíos simultáneos, claves distintas, PostgreSQL 18 real | **1 × 201, 49 × 429, ningún 5xx** |
| 50 simultáneos con la misma clave | 1 × 201, 49 × 200 por idempotencia, 0 × 429, 0 × 401, un solo id |
| 50 simultáneos sin clave | 1 × 201 |
| Dos cuentas a la vez | Una aceptada por cuenta |
| Reenvío idempotente tras crear | 200 `Idempotent-Replay`, no gasta turno |
| Envío que falla después de consumir la cuota (foto caducada) | La transacción se deshace y **el turno se devuelve** |
| Enumeración por alta: correo nuevo, repetido y de un técnico existente | **Respuesta idéntica** en los tres; la contraseña del segundo intento no pisa la cuenta |
| Correo con mayúsculas y espacios | Misma cuenta; se entra escribiéndolo como salga |
| Alta en masa desde una IP | 429 DEMASIADAS_CUENTAS al pasar el cupo; sondear correos existentes también lo gasta |
| Fijación de sesión | La cookie previa deja de valer al iniciar sesión (401 en `/auth/yo`) |
| Cierre de sesión | La cookie deja de servir para reportar (401) |
| `?volver=//ajeno.example` y `?volver=/\ajeno.example` | Se reescriben a `/`: no hay redirección abierta tras el login |

### A-01 a A-09, repetidos después del cambio

| | Resultado |
|---|---|
| **A-01** | Listado público idéntico byte a byte con cookie de técnico, con cookie de ciudadano y sin cookie. Sin `autor_id` |
| **A-02** | Pública `public, no-cache`; técnica `private, no-store` + `Vary: Origin, Cookie` |
| **A-03** | `pnpm privilegios` correcto, ahora también **por columna** |
| **A-04** | `node -v` = v24.21.0 dentro de los dos contenedores reconstruidos |
| **A-05** | 0 apariciones de `remoteAddress`, `remotePort` o `headers` en el log; `ipHash` en todas las peticiones. La única IP en claro es la dirección de escucha del propio servicio al arrancar |
| **A-06** | `/geo/v1/puntos-criticos` sin `radio_m`, `diametro_m` ni `advertencia_diametro` |
| **A-07** | Pruebas de `fotos-abuso.test.ts` en verde |
| **A-08** | `minimumReleaseAge: 1440` sigue en `pnpm-workspace.yaml` |
| **A-09** | uid 1000; escritura en `/app` rechazada (`Read-only file system`) |

### Hallazgos durante la implementación

1. **Turborepo 2 filtra el entorno.** Las variables nuevas no llegaban a los servicios porque no
   estaban en `globalEnv`: la suite E2E pasaba `REGISTRO_MAX_POR_IP=1000` y api-core usaba 5.
   Corregido en `turbo.json` y documentado en el README.
2. **`has_table_privilege` no ve los grants por columna.** La primera versión del verificador
   esperaba INSERT/UPDATE de tabla en `usuario` y fallaba. Ahora exige **solo SELECT** a nivel de
   tabla —una aserción en negativo: que apareciera INSERT sería el fallo— y comprueba las columnas
   una a una con `has_column_privilege`.
3. **Panel técnico (previo, no introducido aquí).** Cualquier primera visita sin sesión mostraba
   «Tu sesión caducó por inactividad», porque el 401 de `GET /auth/yo` se trataba como caducidad.
   Corregido en `apps/panel-admin/src/lib/api.ts`, con prueba E2E.
4. **PGlite no sirve para probar la cuota bajo concurrencia.** Con 50 envíos la prueba se
   colgaba: una transacción esperando un bloqueo de fila deja al motor de una sola conexión entero
   esperando. Además, el primer estallido concurrente de un proceso sobre PGlite devuelve un 401
   espurio de forma reproducible (la consulta de sesión vuelve vacía). **Se comprobó que no es un
   fallo del código**: contra PostgreSQL real, 50 peticiones autenticadas simultáneas dan 0 × 401.
   La prueba de concurrencia vive en `cuota-concurrencia-pg.test.ts` y el CI la ejecuta en el
   trabajo que tiene PostgreSQL de verdad.

### Riesgos residuales nuevos

| # | Riesgo | Por qué queda |
|---|---|---|
| 6 | **No hay verificación de correo.** Cualquiera puede registrar una dirección que no es suya | Requiere enviar correo, que está en el backlog (notificaciones). Mitigado por el freno de altas y por la cuota: cada cuenta vale un reporte por hora y nada se publica sin moderación |
| 7 | **Creación de cuentas distribuida**: con muchas IPs distintas, el freno de altas por IP no limita el total | Es el caso para el que se suele añadir CAPTCHA. **No se añadió**: se pidió no hacerlo sin necesidad demostrada, y el daño está acotado a un reporte por cuenta y hora que además pasa por moderación. Si en producción se observa, la siguiente defensa es un límite global de altas por hora o una prueba de trabajo, antes que un servicio externo |
| 8 | **Sin recuperación de contraseña** | Mismo motivo que el 6. Hoy la cambia un administrador en la base |
| 9 | **Los alias de correo** (`a+1@`, `a+2@`) son cuentas distintas | Normalizarlos es política de cada proveedor, no del estándar, y uniría direcciones que no son la misma. El límite por IP y la cuota acotan el efecto |
| 10 | Una petición rechazada por cuota ya hizo la llamada a geo-service | La cuota va dentro de la transacción y el resolver fuera, a propósito: no se mantiene una transacción abierta durante una llamada HTTP. Acotado por el límite por IP |

### Resultado

```
pnpm lint              0   256 archivos
pnpm typecheck         0   9 paquetes
pnpm test              0   363 pasan + 6 omitidos (eran 329 + 2; los 4 omitidos nuevos son la
                           prueba de concurrencia real, que corre con DATABASE_URL_PG_REAL)
cuota-concurrencia-pg      4/4 contra PostgreSQL 18.6
pnpm test:e2e          0   74 pasan, 0 fallan (eran 61)
pnpm build             0   7 tareas
pnpm secretos          0   sin hallazgos
pnpm auditoria         0   sin vulnerabilidades conocidas
pnpm privilegios       0   matriz correcta, incluida la de columnas
Docker                     4 contenedores healthy desde un volumen vacío; /ready ok
```

El estado de §8 se mantiene: **SEGURO PARA STAGING · CONDICIONALMENTE LISTO PARA PRODUCCIÓN**, con
los mismos condicionantes externos y los riesgos 6 a 10 escritos arriba.
