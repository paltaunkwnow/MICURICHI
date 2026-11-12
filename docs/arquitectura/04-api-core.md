# 04 · `services/api-core` — API de negocio

> Parte **3**. Puerto **3001**, prefijo `/api/v1`. Leyenda: **[C]** confirmado en código · **[I]**
> inferido · **[Doc]** según documentación.

## 1. Para qué existe

Es el **único punto de escritura** del dominio y el guardián de sus reglas [C]:

- cuentas, sesiones y roles;
- creación de reportes con comprobación del dispositivo, PIP, severidad, cupo, idempotencia y demora
  de publicación;
- **visibilidad** pública, técnica y del autor;
- moderación (máquina de estados, fusión, reclasificación) con auditoría y recálculo de puntos críticos;
- fotos (saneamiento a WebP sin metadatos y servido según visibilidad);
- exportación, indicadores, resumen ejecutivo y activación de capas;
- mantenimiento periódico, observabilidad, readiness.

## 2. Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/servidor.ts` | Arranque. Ver §3 |
| `src/app.ts` | Composición Fastify: plugins, `instalarAuth`, cabeceras, manejador de errores, `/health`, `/ready`, `/docs` y registro de rutas |
| `src/config.ts` | Lectura y validación de toda la configuración; `verificarProduccion` |
| `src/rutas/reportes.ts` | `POST /reportes`, `GET /reportes`, `GET /reportes/:id`, `GET /tecnico/reportes[/:id]`, `GET /mis-reportes` |
| `src/rutas/moderacion.ts` | `PATCH /reportes/:id/estado`, `POST /reportes/:id/fusionar`, `PATCH /reportes/:id/severidad` |
| `src/rutas/fotos.ts` | `POST /fotos`, `GET /fotos/:key` y el saneamiento con sharp |
| `src/rutas/auth.ts` | Registro, login, logout, `/auth/yo` |
| `src/rutas/admin.ts` | `/exportar`, `/indicadores`, `/admin/capas`, `/admin/capas/:id/activar` |
| `src/rutas/ejecutivo.ts` | `/ejecutivo/resumen` |
| `src/rutas/configuracion.ts` | `/configuracion` |
| `src/auth.ts` | Sesión por cookie, `usuarioDeSesion`, `requerirRol` y la cabecera de sondeo |
| `src/visibilidad.ts` | **Una sola** definición: `condicionPublico` y `condicionPublicado` |
| `src/consultas.ts` | Filtros (`armarWhere`), listado (conteo acotado), exportación (REPEATABLE READ), `obtenerReporte` |
| `src/vistas.ts` | `SELECT_REPORTE` y los mapeos a vista pública, técnica y del autor |
| `src/ubicacion-dispositivo.ts` | Precisión, antigüedad y radio; deriva `ubicacion_metodo` |
| `src/cuota.ts` | Cupo diario atómico y la medianoche de la ciudad |
| `src/idempotencia.ts` | `Idempotency-Key` por cuenta |
| `src/id-reporte.ts` | UUID o ID corto (8 hex), resuelto por rango y con visibilidad |
| `src/resolver.ts` | Cliente HTTP de geo-service; `GeoNoDisponible` → 503 |
| `src/almacen.ts`, `src/almacen-s3.ts`, `src/guarda-disco.ts` | Disco, memoria (pruebas) y S3 (SigV4 propio); guarda de espacio |
| `src/cache.ts` | Caché **cerrada por defecto** (`private, no-store` + `Vary: Cookie`) |
| `src/privacidad.ts`, `src/registro.ts` | Hash de IP; serializadores pino sin IP; `redact` de `dispositivo` |
| `src/proxy.ts` | `TRUST_PROXY` acotado (0, N saltos o lista de IP/CIDR) |
| `src/mantenimiento.ts` | Pasada cada 6 h bajo el lock `4023` |
| `src/observabilidad.ts` | Métricas Prometheus propias (`curichi_*`) y `/metrics` con token |

## 3. Arranque (`servidor.ts`) [C]

```text
leerConfig()                       ← valida; en producción verificarProduccion() o no arranca
crearPool(peticiones, DB_POOL_MAX) + crearPool(mantenimiento, 2)
almacén = S3 (si S3_ENDPOINT) | Disco(STORAGE_DIR)
crearApp({pool, cfg, resolver: ResolverHttp(GEO_SERVICE_URL, GEO_TOKEN_INTERNO), almacen, logger})
esperarBaseDeDatos → verificarPrivilegios(rol esperado curichi_api)
S3? → almacenS3.comprobar() (si falla, no arranca)
listen → programarMantenimiento (primera pasada a los 30 s, después cada 6 h)
SIGTERM/SIGINT → cierre ordenado con plazo de 15 s (también cierra los workers de Argon2)
```

## 4. Pipeline de una petición [C]

```text
Fastify (bodyLimit 1 MB, trustProxy acotado)
 ├─ onRequest: X-Request-Id · métricas · instalarAuth → req.usuario
 │     (cookie curichi_sesion → sesion JOIN usuario, caducidad absoluta + inactividad;
 │      renueva ultimo_uso_en cada 60 s, salvo con la cabecera x-curichi-sondeo: 1)
 ├─ rate limit de la ruta (si lo declara: global=false)
 ├─ preHandler requerirRol(...) → 401 SIN_SESION / 403 SIN_PERMISO
 ├─ handler: Zod (contracts) → reglas → SQL parametrizado (pg) → auditoría → vista
 ├─ onSend: nosniff · Referrer-Policy · X-Frame-Options DENY · CSP default-src 'none'
 │          · Cache-Control por defecto private, no-store + Vary: Cookie
 └─ setErrorHandler:
      429 → RATE_LIMIT · FST_* 4xx → PAYLOAD_INVALIDO / … · base caída o pool agotado → 503 NO_DISPONIBLE
      GeoNoDisponible → 503 (Retry-After 5) · otro → 500 ERROR_INTERNO (el detalle va solo al log)
```

## 5. Rutas y reglas

### 5.1 Crear un reporte (`POST /reportes`)

1. Rate limit por IP (10/h) y `requerirRol` con los cuatro roles (sin sesión → 401).
2. `ReporteCrearSchema`. Si falla → 400 `PAYLOAD_INVALIDO` con `detalles[]`.
3. `revisarDispositivo`. Si falla → 422, **sin gastar cupo**:
   - `PRECISION_INSUFICIENTE`;
   - `UBICACION_PRECISA_DISPONIBLE` (camino aproximado con precisión de 50 m o menos);
   - `POSICION_VENCIDA`;
   - `UBICACION_FUERA_DE_RADIO`.
4. PIP en geo-service. Si no hay UV → 422 `FUERA_DE_COBERTURA`.
5. Huella del cuerpo **sin** `dispositivo`, severidad, `ip_hash` diario, `id = randomUUID()` y
   **coordenada pública** (jitter con `id|JITTER_SAL`).
6. `BEGIN`:
   1. reclamar la clave de idempotencia (repetida → devuelve el mismo reporte; conflicto o en curso → 409);
   2. reservar el turno del cupo diario (sin turno → 429 `CUOTA_DE_REPORTES` + `Retry-After` hasta la
      medianoche local). El turno `n` fija la demora: 60 s si es el primero y 240 s si no;
   3. `INSERT` con `publicar_en = now() + demora`;
   4. asociar las fotos (de la misma cuenta, de menos de 24 h y sanitizadas). Si falta alguna →
      ROLLBACK y 400 `FOTOS_INVALIDAS`, y el turno vuelve;
   5. auditoría `crear` (sin la posición del dispositivo) y `anotarResultado`;
   6. `COMMIT`.
7. Relectura **por la misma conexión**: el defecto P0 de la Fase 4 era un bloqueo mutuo del pool.
   Responde 201 con la vista del autor (`publicar_en`, `segundos_para_publicar`).

### 5.2 Lecturas

| Ruta | Quién | Qué ve |
|---|---|---|
| `GET /reportes` | Cualquiera (**no lee la sesión**) | Estado público, `publicar_en <= now()` y `geom_publico` no nulo; el bbox filtra **sobre `geom_publico`**; conteo acotado a 10 000; `OFFSET` máximo de 50 000; `public, no-cache` |
| `GET /reportes/:id` | Cualquiera | Igual; un reporte oculto da el mismo 404 que uno inexistente |
| `GET /tecnico/reportes[/:id]` | técnico, admin | Todo lo **publicado** en cualquier estado, coordenada exacta, campos de moderación |
| `GET /mis-reportes` | Cualquier sesión | Los propios (50), en cualquier estado, con `retirado` y la cuenta regresiva |

### 5.3 Moderación

- `cambiarEstado`:
  1. resuelve el canónico, si hay fusión, entre los publicados;
  2. `SELECT … FOR UPDATE` del reporte y del canónico **en orden de id**;
  3. `transicionPermitida`;
  4. `UPDATE` y auditoría `estado:a->b`;
  5. reapunta los duplicados con auditoría `fusion:reapuntar`;
  6. `COMMIT`;
  7. recalcula los puntos críticos del **entorno** (si falla, borra el punto para que lo rehaga el
     mantenimiento y lo registra);
  8. invalida los cálculos en vuelo de indicadores y del resumen ejecutivo.
- Reclasificar: misma forma, con `FOR UPDATE` y auditoría `severidad:reclasificar`.
- Los reportes que todavía esperan su `publicar_en` → **404** para todos.

### 5.4 Fotos

- **Subida** (`POST /fotos`):
  1. Guarda de disco: si falta espacio → 507.
  2. Reserva el turno diario (12): sin cupo → 429.
  3. Multipart de 8 MB.
  4. **Magic bytes** (JPEG, PNG, WebP).
  5. Megapíxeles leídos de la **cabecera** (60 MP como máximo).
  6. sharp con un plazo de 10 s: `rotate`, 1600 px como máximo, WebP con calidad 80, **sin metadatos**.
  7. Verificación doble (metadata + recorrido de los trozos RIFF).
  8. INSERT de la fila y después el almacén. Si falla, se deshace y se devuelve el turno.
- Endurecimiento de sharp: `sharp.block` desactiva 16 cargadores de libvips que no se usan;
  `concurrency(2)` y `cache(false)`.
- **Servido** (`modoDeFoto`):
  - foto sin reporte → solo quien la subió;
  - reporte público → `public, no-cache` + ETag;
  - autor → la suya en cualquier estado (`private`);
  - técnico → las de reportes publicados (`private`);
  - el resto → 404.

### 5.5 Auth

- **Registro**:
  - advisory lock por `ipHash`;
  - topes de 5/h y 10/día por IP **en la base** y otro en memoria;
  - hash calculado **siempre**, exista o no el correo;
  - `INSERT … ON CONFLICT DO NOTHING`;
  - la misma respuesta 201 en los dos casos, y no inicia sesión.
- **Login**:
  - freno en la base consultado **antes** de verificar;
  - hash señuelo si el usuario no existe;
  - rehash de scrypt a Argon2id;
  - borra la sesión previa (fijación);
  - cookie `HttpOnly`, `SameSite=Lax`, `Secure` según `COOKIE_SEGURA`;
  - auditoría `login`.
- **`/auth/yo`**: usuario + cupo del día + `demora_proximo_s`; `panel_url` solo para el staff.
  Valida su propia respuesta con `SesionActualSchema`.

### 5.6 Administración, exportación y ejecutivo

- **Exportación** (técnico, admin):
  - vista técnica, 50 000 filas como máximo;
  - `total`, `exportados`, `truncado` y `X-Curichi-Truncado`;
  - CSV con BOM, nota metodológica y **neutralización de fórmulas** (`=+-@` → `'`).
- **Indicadores**: dos tandas en paralelo, como mucho dos conexiones; sin caché; deduplicados por
  clave de filtros + «generación».
- **Resumen ejecutivo**: un `FULL JOIN` con la capa vigente; `ultimo_reporte_en` **truncado al
  minuto** (privacidad).
- **Activar capa**: transacción + auditoría + `invalidarCapas()` (best effort, con métrica si falla).

## 6. Configuración clave

Todas las variables están en `.env.example`. Las críticas:

| Variable | Defecto | Producción |
|---|---|---|
| `API_DATABASE_URL` → `DATABASE_URL` | PGlite 5433 | Rol `curichi_api` |
| `IP_HASH_SAL`, `JITTER_SAL` | Valores de ejemplo | **32 caracteres o más, no el de ejemplo** |
| `GEO_TOKEN_INTERNO` | — | **32 caracteres o más**, igual en geo-service |
| `COOKIE_SEGURA` | 0 | **1** |
| `PANEL_ADMIN_URL` | null | **https** |
| `CORS_ORIGENES` | localhost 3000, 3100 | Sin `*` |
| `METRICAS_TOKEN` | — | Obligatorio si se expone `/metrics` |
| `TRUST_PROXY` | 0 | **1** detrás de Caddy |
| `S3_ENDPOINT` | vacío = disco | Vacío en la VPS (ADR 0006) |
| `FOTOS_MIN_LIBRE_BYTES` | 2 GiB | Ajustar al disco |
| `REPORTES_POR_DIA_POR_CUENTA` / `FOTOS_…` / `ALTAS_POR_DIA_POR_IP` | 3 / 12 / 10 | Decisión del municipio |
| `REPORTE_DEMORA_PRIMERO_S` / `_SIGUIENTES_S` | 60 / 240 | **Solo pruebas**; en producción dejan un aviso |
| `ZONA_HORARIA`, `CIUDAD_*` | Santa Cruz | Por instalación |
| `DB_POOL_MAX` | 8 | 2 a 4 conexiones por núcleo de la base, sumando todas las réplicas [Doc] |

## 7. Estado en memoria (importante para escalar)

| Estado | ¿Compartido entre réplicas? |
|---|---|
| Sesiones, cupos, idempotencia, freno de login y altas, puntos críticos | **Sí**: viven en la base |
| Rate limit de `@fastify/rate-limit` | **No**: por proceso, ×N con réplicas |
| Deduplicación en vuelo de indicadores y resumen | No, y no hace falta |
| Workers de Argon2, métricas | Por proceso (Prometheus suma) |
| Fotos en disco | Solo entre réplicas de **la misma máquina** (volumen); entre máquinas, S3 |

## 8. Pruebas (36 archivos) [C]

- Usan `app.inject` sobre PGlite con un `ResolverGeo` falso y `AlmacenMemoria` (`test/ayudas.ts`).
- Cubren:
  - camino crítico, publicación diferida, cupo diario, idempotencia;
  - ubicación del dispositivo (incluida la aproximada);
  - vista pública frente a técnica (tabla que recorre todas las rutas), privacidad de la ubicación;
  - moderación, ID corto;
  - fotos (WebP sin EXIF, XMP ni ICC; abuso; cupo);
  - exportación, indicadores, ejecutivo;
  - resiliencia (base o geo caídos → 503), pool, errores de Fastify, zona horaria, seguridad.
- Hay dos pruebas contra **PostgreSQL real** que se omiten sin `DATABASE_URL_PG_REAL`:
  `cuota-concurrencia-pg` (50 envíos simultáneos dejan exactamente 3) y `fotos-cuota-concurrencia-pg`.

## 9. Observaciones (pendientes)

| # | Observación | Dónde |
|---|---|---|
| A-1 | El `ip_hash` diario usa la fecha **UTC** (`toISOString`); el resto usa el día de la ciudad | `src/privacidad.ts` |
| A-2 | `PATCH /estado` con `duplicado` no acepta un ID corto (el esquema exige UUID) | contracts |
| A-3 | Rate limit por proceso (decisión deliberada documentada) | `app.ts` |
| A-4 | El logout depende de `SameSite=Lax` como protección CSRF (no hay token) | `rutas/auth.ts` |
| A-5 | Comentario desactualizado («En Fase 2: adaptador S3» y el S3 ya existe) | `src/almacen.ts:1` |
| A-6 | Hay identificadores atados al producto: cookie `curichi_sesion`, cabecera `x-curichi-sondeo`, métricas `curichi_*`, `X-Curichi-Truncado` y el dominio `@curichi.local` | Varios |
