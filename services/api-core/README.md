# api-core — Parte 3 (API y lógica de negocio)

Fastify + PostGIS. Único punto de escritura de reportes. Contratos en `packages/contracts` (OpenAPI en `/docs`).

| Ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/v1/reportes` | público (rate limit 10/h por IP, honeypot) | Resuelve UV en geo-service, calcula severidad (§9.1), crea en `nuevo` |
| `GET /api/v1/reportes`, `GET /api/v1/reportes/:id` | público / técnico | Público: solo `validado`/`resuelto`, coordenadas redondeadas y con jitter si es vivienda. Técnico: todo, exacto |
| `PATCH /api/v1/reportes/:id/estado` | técnico, admin | Máquina de estados §7.3 con auditoría y recálculo de puntos críticos |
| `PATCH /api/v1/reportes/:id/severidad` | técnico, admin | Reclasificación manual con motivo (la calculada se conserva) |
| `POST /api/v1/reportes/:id/fusionar` | técnico, admin | Marca duplicado de un canónico validado |
| `POST /api/v1/fotos`, `GET /api/v1/fotos/:key` | público | Magic bytes, reprocesado con sharp **sin metadatos EXIF**, ancho máx. 1600 px, JPEG |
| `GET /api/v1/exportar?formato=csv\|geojson` | técnico, admin | Con nota metodológica |
| `GET /api/v1/indicadores` | técnico, admin | Conteos por estado, severidad, distrito, UV; puntos críticos recurrentes |
| `GET /api/v1/admin/capas`, `POST /api/v1/admin/capas/:id/activar` | técnico / admin | Versiones de capas; activar una (invalida la caché de geo-service) |
| `POST /api/v1/auth/login`, `logout`, `GET /api/v1/auth/yo` | | Sesión por cookie `curichi_sesion` (httpOnly, SameSite=Lax); contraseñas con scrypt |
| `GET /health`, `GET /ready`, `GET /docs` | | |

```bash
pnpm --filter api-core dev    # http://127.0.0.1:3001
pnpm --filter api-core test   # PostGIS efímero + resolver falso: camino crítico, estados, privacidad, export, rate limit, EXIF
```

Fotos en local: `infra/.storage/fotos/` (adaptador `AlmacenDisco`). En Fase 2, adaptador S3/MinIO con la misma interfaz.
