# 08 · Infraestructura, DevOps y operación

> Parte **5**. Carpetas: `infra/`, `docker-compose.yml`, `.github/`, `scripts/`, configuración raíz.
> Leyenda: **[C]** confirmado en código o configuración · **[I]** inferido · **[Doc]** según documentación.

## 1. Monorepo y herramientas [C]

| Pieza | Configuración |
|---|---|
| pnpm 12.4.1 (`packageManager`) | `pnpm-workspace.yaml`: workspaces `apps/*`, `services/*`, `packages/*`, `pipelines/*` y `e2e`; **cuarentena de 24 h** a versiones recién publicadas (`minimumReleaseAge: 1440`); `allowBuilds` explícito (esbuild, sharp, @tailwindcss/oxide…); `overrides` de transitivas vulnerables |
| Turborepo 2.10 | Tareas `build`, `dev`, `typecheck`, `test` y `test:e2e` con `dependsOn: ["^build"]`. **`globalEnv`** es la lista blanca de variables: una variable nueva que no esté ahí **no llega** al proceso |
| TypeScript 5.9 | `tsconfig.base.json` en modo estricto (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext) |
| Biome 2.5 | `pnpm lint` = `biome check .` (formato + reglas + a11y) |
| Husky | `pre-commit`: lint-staged (Biome) + `scripts/buscar-secretos.mjs`. `commit-msg`: commitlint (Conventional Commits en español con scope obligatorio) |

## 2. Docker Compose (`docker-compose.yml`, proyecto `mi-curichi`) [C]

```text
sin perfil:      postgis (curichi-postgis, 127.0.0.1:5432)          → modo `pnpm dev`
--profile servicios:
   postgis ─healthy─► migraciones (job: node node_modules/db/dist/cli/migrar.js, rol dueño)
           ─ok─► geo-service ─healthy─► api-core ─healthy─► web-ciudadano + panel-admin ─healthy─► proxy (Caddy)
--profile minio:          minio + minio-init (bucket privado + usuario limitado)   [solo desarrollo]
--profile respaldos:      respaldo (pg_dump cifrado → S3 externo, retención 7/4/12)
--profile observabilidad: prometheus + alertmanager + blackbox
volúmenes: postgis-data, fotos-data, minio-data, proxy-datos, respaldo-trabajo, prometheus-data, alertmanager-data
```

- **PostgreSQL**:
  - imagen `postgis/postgis:18-3.6`, `max_connections=100`, `shm_size` 256 MB;
  - init con `infra/sql/00-extensiones.sql` (PostGIS) y `01-roles.sh` (crea `curichi_api` y
    `curichi_geo` con `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
    NOBYPASSRLS` y `search_path` fijo; lee `API_DB_PASSWORD` y `GEO_DB_PASSWORD`). Solo corre al
    **crear** el volumen.
- **Servicios Node**:
  - `read_only` y tmpfs de 64 MB, `cap_drop: ALL`, `no-new-privileges`;
  - límites de CPU, memoria y pids (api-core: 2 CPU y 768 MB);
  - puerto **efímero** en loopback;
  - **sin `container_name`**, así que se pueden escalar con `--scale`;
  - `stop_grace_period` de 20 s y logs json-file 10m×3.
- **Variables fijas dentro del Compose**: `NODE_ENV=production`, `COOKIE_SEGURA=1`,
  `TRUST_PROXY=1`, `PROXY_DE_CONFIANZA=1` en las apps y `HSTS=0` en las apps (lo pone Caddy).
  `CORS_ORIGENES` y `PANEL_ADMIN_URL` se derivan de `DOMINIO_PUBLICO` y `DOMINIO_PANEL`.
- **Fotos**: volumen `fotos-data` (modo disco, el de la VPS) o S3 con `S3_ENDPOINT_DOCKER`.

## 3. Imágenes (`infra/docker/`) [C]

| Dockerfile | Qué construye | Detalles |
|---|---|---|
| `servicio.Dockerfile` (`PAQUETE=api-core\|geo-service`) | Servicios | Base `node:24.21.0-slim` **fijada por digest** (Dependabot la actualiza); etapas deps → build → `pnpm deploy` → runtime; `USER node`, tini y healthcheck a `/health`; el build falla si la base no es Node 24 |
| `app.Dockerfile` (`APP=web-ciudadano\|panel-admin`) | Apps Next | Salida standalone; sin el optimizador de imágenes; healthcheck a `/icono.svg` |
| `proxy.Dockerfile` | Caddy 2.11.4-alpine (digest) | Caddyfile **horneado** en la imagen; `arrancar.sh` valida las variables |
| `respaldo.Dockerfile` | Base postgis + rclone + gpg | `infra/respaldo/respaldo.sh` |

Cada imagen de app y del proxy tiene su `.dockerignore` como **lista blanca**. El `.dockerignore`
raíz excluye `node_modules`, `.env*`, `data/`, `docs`, `e2e` y las pruebas.

## 4. Proxy de entrada (`infra/proxy/Caddyfile`) [C]

- Es lo **único** que publica puertos hacia fuera: 80/443 en producción, `127.0.0.1:8080/8443` en local.
- **TLS** según `PROXY_TLS`: `acme` (Let's Encrypt/ZeroSSL), `interno` (CA de Caddy) o `no`.
- Dos sitios:
  - `DOMINIO_PUBLICO` → `web-ciudadano:3000` (cuerpo de 10 MiB como máximo, por las fotos);
  - `DOMINIO_PANEL` → `panel-admin:3100` (1 MiB; espera de hasta 185 s por la exportación).
- **IP real**: `header_up X-Forwarded-For {client_ip}` y borrado de `X-Real-IP`, `Forwarded`,
  `X-Client-IP` y `True-Client-IP`. De esto dependen el rate limit, el freno de login y el antispam.
- **Cortes**: `/geo/v1/capas/invalidar` → 404 y `/_next/image` → 404. También quita
  `x-middleware-rewrite`, `X-Powered-By`, `Server` y `Via`.
- **Réplicas**: `dynamic a` (DNS de Docker cada 5 s), `round_robin` y `lb_try_duration` de 5 s.
  **Sin chequeo pasivo**, a propósito: un 413 dejaba la réplica fuera [Doc].
- HSTS de 1 año **solo** con ACME. HTTP/1.1 y HTTP/2 (sin HTTP/3). `admin off`.

## 5. Topología de seguridad de la IP del cliente

```text
navegador ──► Caddy (reescribe XFF = IP real) ──► Next (proxy.ts: NO añade entrada a XFF)
          ──► api-core / geo-service (TRUST_PROXY=1 → confía en el último salto = Caddy)
```

Con `pnpm dev` no hay Caddy. Por eso:

- `TRUST_PROXY=0` en los servicios;
- `PROXY_DE_CONFIANZA=0` en las apps, que **borran** las cabeceras de reenvío del navegador.

Resultado: todos comparten la IP de Next. Es degradado, pero no suplantable.

## 6. CI (`.github/workflows/ci.yml`) [C]

| Job | Cuándo | Qué |
|---|---|---|
| `secretos-historial` | Siempre | gitleaks sobre todo el historial (`.gitleaks.toml`) |
| `verificar` | Siempre | `pnpm install --frozen-lockfile` → secretos → `pnpm audit --audit-level high` → OpenAPI regenerado sin diferencias → lint → typecheck → test → build |
| `e2e` | push y manual | PGlite + seeds + Playwright (`chromium`) + informe |
| `postgres-real` | Siempre | Contra PostgreSQL real: roles, extensiones, migraciones desde cero e **idempotentes**, `pnpm privilegios`, **réplicas concurrentes**, cuota concurrente real, seeds, humo, **simulacro de recuperación** |
| `imagenes-docker` | Siempre | Construye las 5 imágenes + **Trivy** (falla con HIGH/CRITICAL que tengan arreglo) + arranque endurecido |
| `infra` | Siempre | shellcheck, `compose config` con y sin perfiles, promtool y amtool, imagen de respaldo |
| `publicar-imagenes` | `main` | GHCR con tag = SHA del commit |

**Dependabot** (`.github/dependabot.yml`):

- revisa npm, docker, docker-compose y github-actions cada semana;
- **cooldown** de 7 días;
- agrupa menores y parches.

Hoy hay 5 PR abiertos, entre ellos versiones mayores.

## 7. Observabilidad (`infra/observabilidad/`, perfil `observabilidad`) [C]

- **Prometheus**:
  - descubre las réplicas por **DNS** (`dns_sd_configs`);
  - lee `/metrics` con `X-Token-Metricas`;
  - pone la etiqueta `instalacion` en cada alerta (una instalación por ciudad);
  - `blackbox` entra por el proxy como un navegador y vigila el certificado.
- **Alertas** (`alertas.yml`, 23 reglas, con pruebas en `alertas.test.yml`):
  - servicios: `ServicioCaido`, `ServicioSinReplicas`, `NoListo`, `Degradado`, `AppCaida`, `ProxyNoResponde`;
  - TLS: `CertificadoPorVencer`;
  - rendimiento: `TasaDeErrores5xx`, `LatenciaAlta`, `PoolDeConexionesSaturado`, `BaseNoDisponible`;
  - abuso: `RateLimitDisparado`, `CuotaDeFotosRechazando`;
  - negocio: `ReportesSinCrecer`, `PuntosCriticosFallando`, **`BandejaSinVerificarAtrasada`** (24 h);
  - disco: `DiscoDeFotosBajoElUmbral`, `DiscoDeFotosPorLlenarse`;
  - la propia cadena de alertas: `AlertasSinSalir` y `PrometheusSinAlertmanager`.
- **Alertmanager**: webhook configurable. Sin destino, las alertas se ven en `127.0.0.1:9093`.
- **Métricas propias** (registro hecho a mano, sin librería):
  - HTTP por ruta;
  - pool (total, libre, esperando);
  - consultas;
  - fotos (subidas por resultado, procesado, disco);
  - reportes creados por rol, rechazos de cuota;
  - antigüedad de la bandeja sin verificar;
  - caché de geo-service.

## 8. Respaldos (`infra/respaldo/respaldo.sh`, perfil `respaldos`) [C]

- Orden de un respaldo:
  1. anota la migración aplicada y hace `pg_dump -Fc` sin `_migraciones`;
  2. **lee el volcado entero** con `pg_restore` y cuenta las filas;
  3. cifra con gpg (AES-256) y verifica que descifre igual;
  4. lo sube a S3 externo (`diario/`, `semanal/` los domingos, `mensual/` el día 1) con un manifiesto;
  5. **recién entonces** aplica la retención (7/4/12).
- Restaurar: migrar `--hasta` la versión del respaldo, cargar los datos y migrar el resto.
- Latido externo opcional (`RESPALDO_URL_LATIDO`) y alerta al Alertmanager.
- **Las fotos en disco no entran** en el respaldo: es un pendiente que bloquea la apertura [Doc].
- `scripts/respaldo.mjs simulacro`: respalda, restaura en una base nueva y compara (lo corre el CI).

## 9. Lanzador `Mi-Curichi.exe` (`scripts/lanzador/`) [C]

- `MiCurichi.cs` (C# 5) se compila con el `csc` de .NET Framework, que trae Windows
  (`compilar.ps1`). El `.exe` no se versiona.
- Qué hace:
  - detecta el proyecto y Docker; **enciende Docker Desktop** si hace falta;
  - crea el `.env` solo si no existe;
  - `compose up` de los perfiles `servicios` + `minio` y espera a que todo esté `healthy`;
  - abre el navegador.
- Menú: panel, estado, logs, actualizar (`--build`), **compartir por túneles de Cloudflare** (se
  cierran al salir), E2E y detener.
- Flags: `--iniciar [--sin-navegador]`, `--estado`, `--detener` y `--ayuda`.

## 10. Scripts de medición (`scripts/`) [C/Doc]

| Script | Uso |
|---|---|
| `banco-datos.mjs generar N` / `limpiar` | Genera N reportes sintéticos dentro de las UV para medir volumen |
| `banco-consultas.mjs` | `EXPLAIN (ANALYZE, BUFFERS)` de las consultas críticas (¿índice o seq scan?) |
| `banco-carga.mjs 10,100,500` | Latencias y rps por nivel de concurrencia |
| `banco-concurrencia.mjs` | Carreras de idempotencia contra PostgreSQL real |
| `banco-sostenido.mjs 30 8` | Prueba sostenida: memoria, pool y cachés |
| `buscar-secretos.mjs` | Escaneo propio de secretos (pre-commit y CI) |
| `sembrar-30-puntos.sql` | ⚠ Siembra manual con distrito y UV escritos a mano, fuera de las reglas (ver la revisión del 2026-10-03) |

Son las herramientas para la **prueba de escalado**. Ver [11](11-escalado-y-ecosistema.md).

## 11. Observaciones

| # | Observación |
|---|---|
| I-1 | En esta máquina quedan contenedores de una versión anterior del Compose (`curichi-api-core`, `curichi-geo-service`, con `container_name`, imagen del 2026-09-23). Llevan los mismos nombres de servicio que el Compose actual, que al levantar el perfil `servicios` debería **recrearlos** con la configuración nueva (`mi-curichi-api-core-1`…) [I] |
| I-2 | El `.env` local no trae las variables de la topología con proxy (`DOMINIO_*`, `PROXY_TLS`, `PANEL_ADMIN_URL_DOCKER`). Con los valores por defecto del Compose, `PROXY_TLS=acme` y el dominio vacío harían fallar el proxy [I, por `arrancar.sh` y los valores por defecto] |
| I-3 | MinIO archivó su edición comunitaria: solo sirve para desarrollo [Doc] |
| I-4 | Rate limit por proceso: con `--scale` el límite por IP se multiplica. La recomendación documentada es ponerlo en el proxy [Doc] |
