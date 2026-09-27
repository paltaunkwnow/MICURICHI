# api-core — Parte 3 (API y lógica de negocio)

Fastify + PostGIS. Único punto de escritura de reportes. Contratos en `packages/contracts` (OpenAPI en `/docs`).

| Ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/v1/reportes` | sesión (1 por cuenta cada 60 min, 10/h por IP, honeypot) | Resuelve UV en geo-service, calcula severidad (§9.1), crea en `nuevo`. Solo adjunta fotos subidas por la misma cuenta, sin reporte y de menos de 24 h (si no, 400 `FOTOS_INVALIDAS`) |
| `GET /api/v1/reportes`, `GET /api/v1/reportes/:id` | público / técnico | Público: solo `validado`/`resuelto`, coordenadas redondeadas y con jitter si es vivienda. Técnico: todo, exacto |
| `PATCH /api/v1/reportes/:id/estado` | técnico, admin | Máquina de estados §7.3 con auditoría y recálculo de puntos críticos |
| `PATCH /api/v1/reportes/:id/severidad` | técnico, admin | Reclasificación manual con motivo (la calculada se conserva) |
| `POST /api/v1/reportes/:id/fusionar` | técnico, admin | Marca duplicado de un canónico validado |
| `POST /api/v1/fotos` | sesión (`FOTOS_POR_HORA_POR_CUENTA` = 12/h por cuenta, 30/h por IP) | Entra JPEG, PNG o WebP (por magic bytes) y sale siempre **WebP** (calidad `FOTO_CALIDAD_WEBP` = 80), 1600 px por lado como máximo sin agrandar, **sin EXIF, XMP ni perfil ICC** (se comprueba recorriendo el RIFF) y solo el primer cuadro de una imagen animada. Clave `<uuid>.webp`. Guarda quién la subió (`subido_por`). Sin cupo: 429 `CUOTA_DE_FOTOS` con `Retry-After`, antes de leer el archivo |
| `GET /api/v1/fotos/:key` | público, sesión opcional | Claves `<uuid>.webp` y `<uuid>.jpg` (las anteriores al contrato 0.8.0, que no se reconvierten y se sirven como `image/jpeg`); otra extensión, 404. Una foto **sin reporte** solo la ve quien la subió (`subido_por` = sesión), técnicos incluidos afuera; la de un reporte publicado, cualquiera; la de uno sin publicar, técnico y admin. `Cache-Control`: publicada `public, max-age=3600`; el resto, 404 incluido, `private, no-store` |
| `GET /api/v1/exportar?formato=csv\|geojson` | técnico, admin | Con nota metodológica |
| `GET /api/v1/indicadores` | técnico, admin | Conteos por estado, severidad, distrito, UV; puntos críticos recurrentes |
| `GET /api/v1/ejecutivo/resumen?ventana=7d\|30d\|todo` | ejecutivo, técnico, admin | Resumen del panel ejecutivo (`ResumenEjecutivoSchema`): totales, por severidad efectiva, por estado (`nuevo`/`validado`/`resuelto`; duplicados y rechazados no cuentan) y por distrito vigente (incluidos los que tienen 0). Ventana sobre `creado_en`. Caché en memoria de 30 s por ventana; `Cache-Control: private, no-store` |
| `GET /api/v1/admin/capas`, `POST /api/v1/admin/capas/:id/activar` | técnico / admin | Versiones de capas; activar una (invalida la caché de geo-service) |
| `GET /api/v1/configuracion` | público | Ciudad del despliegue (`ConfiguracionPublicaSchema`: nombre, país, zona horaria, locale, centro y zoom inicial del mapa). Una instalación es una ciudad; los frontends la leen en tiempo de ejecución en vez de fijarla al compilar. `Cache-Control: public, max-age=300` |
| `POST /api/v1/auth/login`, `logout`, `GET /api/v1/auth/yo` | | Sesión por cookie `curichi_sesion` (httpOnly, SameSite=Lax); contraseñas con scrypt. `/auth/yo` agrega `panel_url` (URL de `apps/panel-admin`, o `null` si no se configuró) solo para `tecnico`, `admin` y `ejecutivo`; al ciudadano no se le manda el campo |
| `GET /health`, `GET /ready`, `GET /docs` | | |

**Roles.** `ciudadano` (alta pública), `tecnico`, `admin` y `ejecutivo` (contracts 0.5.0; se asigna
fuera de `/auth/registro`). El ejecutivo inicia sesión, puede reportar y subir fotos como cualquier
sesión y ve `/api/v1/ejecutivo/resumen`; recibe 403 `SIN_PERMISO` en `/api/v1/tecnico/*`,
`/api/v1/exportar`, `/api/v1/indicadores`, `/api/v1/admin/*` y en toda la moderación.

**Sondeo.** Una petición con la cabecera `x-curichi-sondeo: 1` (la manda el panel ejecutivo en su
consulta automática cada 60 s) valida la sesión pero no renueva `ultimo_uso_en`: si no, un panel
abierto mantenía viva la sesión para siempre y la caducidad por inactividad (`SESION_IDLE_HORAS`,
12 h) no llegaba nunca.

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
