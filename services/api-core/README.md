# api-core — Parte 3 (API y lógica de negocio)

Fastify + PostGIS. Único punto de escritura de reportes. Contratos en `packages/contracts` (OpenAPI en `/docs`).

| Ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/v1/reportes` | sesión (3 por cuenta y por día, 10/h por IP, honeypot) | Comprueba la posición del teléfono (`dispositivo`, ver abajo), resuelve UV en geo-service, calcula severidad (§9.1), crea en `nuevo` con `publicar_en` (ver «Publicación»). Solo adjunta fotos subidas por la misma cuenta, sin reporte y de menos de 24 h (si no, 400 `FOTOS_INVALIDAS`). Responde `MiReporteFeature` (201, y 200 en el replay idempotente) |
| `GET /api/v1/reportes`, `GET /api/v1/reportes/:id` | público | `nuevo` (con `verificado: false`), `validado` y `resuelto` ya publicados (`publicar_en <= now()`); coordenadas redondeadas y con jitter si es vivienda; nunca el autor. En espera, rechazado o duplicado: 404 |
| `GET /api/v1/tecnico/reportes(/:id)` | técnico, admin | Todos los estados, exactos, con los campos de moderación; solo los ya publicados |
| `GET /api/v1/mis-reportes` | sesión | Los reportes de la cuenta (50 como máximo, los más recientes primero) en cualquier estado, también en espera, rechazados o fusionados (`retirado`), con `publicar_en` y `segundos_para_publicar`. `private, no-store` y `Vary: Cookie` |
| `PATCH /api/v1/reportes/:id/estado` | técnico, admin | Máquina de estados §7.3 con auditoría y recálculo de puntos críticos. `validado → rechazado` (retirar del mapa un verificado) y reabrir un rechazado son de admin: al técnico, 403 `SIN_PERMISO`. Un reporte que espera su `publicar_en` da 404 |
| `PATCH /api/v1/reportes/:id/severidad` | técnico, admin | Reclasificación manual con motivo (la calculada se conserva) |
| `POST /api/v1/reportes/:id/fusionar` | técnico, admin | Marca duplicado de un canónico validado |
| `POST /api/v1/fotos` | sesión (`FOTOS_POR_DIA_POR_CUENTA` = 12 por cuenta y por día, 30/h por IP) | Entra JPEG, PNG o WebP (por magic bytes) y sale siempre **WebP** (calidad `FOTO_CALIDAD_WEBP` = 80), 1600 px por lado como máximo sin agrandar, **sin EXIF, XMP ni perfil ICC** (se comprueba recorriendo el RIFF) y solo el primer cuadro de una imagen animada. Clave `<uuid>.webp`. Guarda quién la subió (`subido_por`). Sin cupo: 429 `CUOTA_DE_FOTOS` con `Retry-After` hasta la medianoche, antes de leer el archivo. Con poco disco: 507 `SIN_ESPACIO` (ver «Guarda de disco») |
| `GET /api/v1/fotos/:key` | público, sesión opcional | Claves `<uuid>.webp` y `<uuid>.jpg` (las anteriores al contrato 0.8.0, que no se reconvierten y se sirven como `image/jpeg`); otra extensión, 404. La de un reporte público, cualquiera, con `public, no-cache` y `ETag` (`If-None-Match` da 304, pero la visibilidad se mira antes: una foto retirada da 404). El autor del reporte ve las suyas en cualquier estado, y técnico y admin las de un reporte ya publicado aunque esté rechazado o duplicado, con `private, no-store`. Una foto **sin reporte** solo la ve quien la subió, técnicos incluidos afuera. Todo lo demás, 404 con `private, no-store` |
| `GET /api/v1/exportar?formato=csv\|geojson` | técnico, admin | Con nota metodológica |
| `GET /api/v1/indicadores` | técnico, admin | Conteos por estado, severidad, distrito, UV; puntos críticos recurrentes. Solo reportes publicados. Sin caché: los pedidos simultáneos comparten el cálculo en curso |
| `GET /api/v1/ejecutivo/resumen?ventana=7d\|30d\|todo` | ejecutivo, técnico, admin | Resumen del panel ejecutivo (`ResumenEjecutivoSchema`): totales, por severidad efectiva, por estado (`nuevo`/`validado`/`resuelto`; duplicados y rechazados no cuentan) y por distrito vigente (incluidos los que tienen 0). Solo reportes publicados; ventana sobre `creado_en`. Sin caché, con deduplicación en vuelo por ventana; `Cache-Control: private, no-store` |
| `GET /api/v1/admin/capas`, `POST /api/v1/admin/capas/:id/activar` | técnico / admin | Versiones de capas; activar una (invalida la caché de geo-service) |
| `GET /api/v1/configuracion` | público | Ciudad del despliegue (`ConfiguracionPublicaSchema`: nombre, país, zona horaria, locale, centro y zoom inicial del mapa). Una instalación es una ciudad; los frontends la leen en tiempo de ejecución en vez de fijarla al compilar. `Cache-Control: public, max-age=300` |
| `POST /api/v1/auth/registro` | público | Alta de cuenta ciudadana. Freno por IP: `REGISTRO_MAX_POR_IP` por hora y `ALTAS_POR_DIA_POR_IP` (10) por día de la ciudad, contados en la base (429 `DEMASIADAS_CUENTAS`) |
| `POST /api/v1/auth/login`, `logout`, `GET /api/v1/auth/yo` | | Sesión por cookie `curichi_sesion` (httpOnly, SameSite=Lax); contraseñas con Argon2id. `/auth/yo` agrega `reportes_restantes_hoy`, `puede_reportar_desde` (null, o la próxima medianoche local si no le quedan) y `demora_proximo_s` (60 o 240), y `panel_url` (URL de `apps/panel-admin`, o `null` si no se configuró) solo para `tecnico`, `admin` y `ejecutivo`; al ciudadano no se le manda ese campo |
| `GET /health`, `GET /ready`, `GET /docs` | | `/ready` (`ReadyApiCoreSchema`): 503 solo sin base; `fotos: 'error'` o `'poco_espacio'` y `degradado: true` siguen en 200 |

**Roles.** `ciudadano` (alta pública), `tecnico`, `admin` y `ejecutivo` (contracts 0.5.0; se asigna
fuera de `/auth/registro`). El ejecutivo inicia sesión, puede reportar y subir fotos como cualquier
sesión y ve `/api/v1/ejecutivo/resumen`; recibe 403 `SIN_PERMISO` en `/api/v1/tecnico/*`,
`/api/v1/exportar`, `/api/v1/indicadores`, `/api/v1/admin/*` y en toda la moderación.

**Sondeo.** Una petición con la cabecera `x-curichi-sondeo: 1` (la mandan los paneles técnico y
ejecutivo en su consulta automática) valida la sesión pero no renueva `ultimo_uso_en`: si no, un
panel abierto mantenía viva la sesión para siempre y la caducidad por inactividad
(`SESION_IDLE_HORAS`, 12 h) no llegaba nunca.

**Cupo diario (contracts 0.10.0).** Cada cuenta puede crear `REPORTES_POR_DIA_POR_CUENTA` (3)
reportes y subir `FOTOS_POR_DIA_POR_CUENTA` (12) fotos por día calendario en `ZONA_HORARIA`,
contados en la base (`cuota_reporte_diaria`, migración 0014, con un `INSERT … ON CONFLICT DO
UPDATE … WHERE n < máximo` atómico: vale igual con varias réplicas). El turno de reporte se
reserva dentro de la transacción del reporte y después de la idempotencia (un replay no gasta; un
envío que falla lo devuelve); el de foto, antes de leer la imagen, y se devuelve si la foto no se
guarda. Borrar fotos huérfanas no devuelve turnos. Agotado: 429 `CUOTA_DE_REPORTES` («Ya enviaste
los 3 reportes de hoy. Vas a poder enviar otro mañana.») o `CUOTA_DE_FOTOS`, con `Retry-After`
hasta la medianoche local y `detalles.disponible_en` con el desfase de la ciudad. La clave de
idempotencia se guarda con el prefijo de la cuenta (`<usuario_id>:<clave>`): la misma clave en
dos cuentas crea dos reportes. `usuario.ultimo_reporte_en` ya no se lee ni se escribe (se quita en
la 0016).

**Publicación (contracts 0.11.0, ADR 0006).** No hay moderación previa: un reporte se publica
cuando llega su `publicar_en`, que se fija al crearlo con el número de reporte del día que devuelve
el contador del cupo, en la misma transacción: 60 s el 1.º (`DEMORA_PUBLICACION_PRIMERO_S`) y
240 s el 2.º y el 3.º. Mientras espera no lo ve nadie más que su autor, técnicos incluidos: ni en
las vistas pública y técnica, ni en la exportación, los indicadores, el resumen ejecutivo o las
fotos, y moderarlo da 404. La regla vive en `src/visibilidad.ts` (`condicionPublico`, con el
literal de `ESTADOS_PUBLICOS` para que PostgreSQL use los índices parciales de la 0015, y
`condicionPublicado`). `REPORTE_DEMORA_PRIMERO_S` y `REPORTE_DEMORA_SIGUIENTES_S` (0 a 3600) existen
solo para las pruebas: `test/ayudas.ts` (`configDePrueba`) arranca con 0 y 0, y en producción
definirlas deja un aviso en el log del arranque. La métrica
`curichi_reportes_sin_verificar_antiguedad_segundos` dice cuánto hace que está publicado el `nuevo`
más viejo (0 si no hay), para la alerta `BandejaSinVerificarAtrasada`.

**Guarda de disco (contracts 0.13.0).** Con las fotos en disco, si queda menos que
`FOTOS_MIN_LIBRE_BYTES` (2 GiB por defecto; 0 la apaga) según `statfs` del directorio de fotos,
`POST /fotos` responde 507 `SIN_ESPACIO` antes de leer la imagen y sin gastar cupo, y `/ready` sale
con `fotos: 'poco_espacio'` y `degradado: true`. En la VPS ese disco es también el de PostgreSQL.
`/metrics` expone `curichi_fotos_disco_libre_bytes`, `curichi_fotos_disco_total_bytes` (los de las
alertas `DiscoDeFotos*`) y `curichi_fotos_disco_min_libre_bytes` (el umbral configurado), leídos
en cada scrape. Con S3 no hay guarda ni esas métricas.

**Posición del teléfono (contracts 0.9.0).** `POST /api/v1/reportes` exige `dispositivo`
(`{ lat, lon, precision_m, antiguedad_s }`). Después de Zod y antes de resolver la UV se revisa, en
este orden (`src/ubicacion-dispositivo.ts`):

- precisión mayor a `PRECISION_DISPOSITIVO_MAX_M` (50 m): 422 `PRECISION_INSUFICIENTE`;
- antigüedad mayor a `POSICION_ANTIGUEDAD_MAX_S` (600 s): 422 `POSICION_VENCIDA`;
- punto a más de `REPORTE_RADIO_DISPOSITIVO_M` (60 m) + `REPORTE_RADIO_TOLERANCIA_M` (0,5 m, por
  el redondeo de las coordenadas) del teléfono: 422 `UBICACION_FUERA_DE_RADIO`.

Ninguno gasta cupo y los tres suman a `curichi_reportes_fuera_de_radio_total{codigo}`. Se guardan
solo `precision_gps_m` (la precisión declarada), `distancia_dispositivo_m` (redondeada al metro y
nunca mayor que el radio) y `ubicacion_metodo`, que deriva el servidor: `gps` si el punto quedó
dentro del margen de error del teléfono (a `max(2 m, precision_m)` o menos), `manual` si quedó más
lejos. El margen hace falta porque el punto que puso el GPS en el paso 1 y la posición releída al
enviar difieren unos metros aunque nadie lo mueva. La posición del teléfono no queda en la fila,
ni en la auditoría, ni en la huella de idempotencia (un reintento que relee el GPS devuelve el mismo reporte), ni en el log: el
logger oculta cualquier clave `dispositivo` (`RUTAS_OCULTAS_DEL_LOG` en `src/registro.ts`). La
exportación CSV suma la columna `distancia_dispositivo_m`.

**Errores.** Los 4xx que genera Fastify antes de la ruta (JSON mal formado, cuerpo demasiado
grande, tipo de contenido sin parser) salen con código propio y el mismo estado:
`PAYLOAD_INVALIDO` (400), `PAYLOAD_DEMASIADO_GRANDE` (413), `TIPO_DE_CONTENIDO_NO_ADMITIDO` (415),
`PETICION_INVALIDA` (resto). El código interno (`FST_*`) va solo al log.

**geo-service.** Todas las llamadas llevan `x-token-interno` (`GEO_TOKEN_INTERNO`): con él, el
resolver queda fuera del cupo por IP de geo-service. En producción es obligatorio y de al menos 32
caracteres (el servicio no arranca sin él). Si la invalidación de capas falla, queda un aviso en
el log y la métrica `curichi_geo_invalidacion_fallida_total`.

**Ciudad del despliegue.** Una instalación de Mi Curichi es una ciudad; lo que antes estaba fijado
en el JavaScript de cada frontend (centro del mapa, locale, nombre, zona horaria) se configura acá
con `CIUDAD_NOMBRE`, `CIUDAD_PAIS`, `CIUDAD_LOCALE`, `CIUDAD_CENTRO_LON`, `CIUDAD_CENTRO_LAT`,
`CIUDAD_ZOOM_INICIAL` y `ZONA_HORARIA`, y se publica en `GET /api/v1/configuracion`. Cada variable
vacía o ausente cae en Santa Cruz de la Sierra (`CONFIG_DOMINIO.CIUDAD_POR_DEFECTO`); una presente
pero inválida (un `CIUDAD_LOCALE=es_BO`, una `CIUDAD_CENTRO_LAT` fuera de rango) impide arrancar,
con el motivo. `PANEL_ADMIN_URL` (URL de `apps/panel-admin`, sin usuario ni contraseña) se
normaliza y viaja como `panel_url` en `/api/v1/auth/yo`; en producción es obligatoria y tiene que
ser `https`.

```bash
pnpm --filter api-core dev    # http://127.0.0.1:3001
pnpm --filter api-core test   # PostGIS efímero + resolver falso: camino crítico, estados, privacidad, export, rate limit, EXIF
```

**Desarrollo con PostgreSQL en Docker.** `dev` carga el `.env` de la raíz si existe
(`tsx watch --env-file-if-exists=../../.env`); lo que ya esté definido en la terminal manda sobre
el archivo. La URL de la base es `API_DATABASE_URL` y, si está vacía o no existe, `DATABASE_URL`.
En el `.env` raíz, `DATABASE_URL` es la del rol dueño del esquema (migraciones, seeds, ETL), así que
para que api-core use su rol de privilegios mínimos hay que definir ahí
`API_DATABASE_URL=postgresql://curichi_api:<API_DB_PASSWORD>@localhost:5432/curichi`. Sin ella se
conecta como dueño y el arranque lo avisa. Con `S3_ENDPOINT` en ese `.env`, las fotos van a MinIO en
lugar del disco.

Las pruebas de concurrencia contra PostgreSQL real (`cuota-concurrencia-pg.test.ts` y
`fotos-cuota-concurrencia-pg.test.ts`) se omiten salvo que se defina `DATABASE_URL_PG_REAL` (URL de
administración; cada una crea y borra su propia base temporal).

Fotos en local: `infra/.storage/fotos/` (adaptador `AlmacenDisco`). En Fase 2, adaptador S3/MinIO con la misma interfaz.
