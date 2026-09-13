# Mi Curichi

Plataforma de **reporte ciudadano georreferenciado de puntos de inundación**. El vecino marca dónde se estanca el agua; el sistema lo valida, calcula una severidad reproducible y lo cruza por point-in-polygon con el **distrito municipal** y la **unidad vecinal** oficiales.

> El manual operativo completo (dominio, arquitectura en 5 partes, reglas de carpetas, pipeline de datos, stack, seguridad y fases) está en [CLAUDE.md](CLAUDE.md). Léelo antes de tocar nada.

## Estado

**Fase 1 — Local**, en curso. Orden de tareas en `CLAUDE.md` §10.2.

| Tarea | Parte | Qué | Estado |
|---|---|---|---|
| 1 | 5 | Arranque del repositorio | hecha (rama `fase-1/repo`) |
| 2 | transversal | `packages/contracts` | pendiente |
| 3 | 4 | `packages/db` | pendiente |
| 4 | 5 | `pipelines/geodata-etl` | pendiente |
| 5 | 4 | `services/geo-service` | pendiente |
| 6 | 3 | `services/api-core` | pendiente |
| 7 | 1 | `apps/web-ciudadano` | pendiente |
| 8 | 2 | `apps/panel-admin` | pendiente |
| 9 | 5 | E2E, seguridad, cierre | pendiente |

## Requisitos en local

- Node 24 LTS (`.nvmrc`) y pnpm 12: `npm install -g pnpm@12`
- Docker Desktop u OrbStack (PostGIS y MinIO) — necesario desde la tarea 3
- Para el ETL (tarea 4): GDAL, tippecanoe y uv — `brew install gdal tippecanoe uv`

## Arranque

```bash
cp .env.example .env      # completar POSTGRES_PASSWORD y MINIO_ROOT_PASSWORD
pnpm install
docker compose up -d
pnpm db:migrate           # disponible desde la tarea 3
pnpm etl:all              # disponible desde la tarea 4
pnpm dev
```

## Estructura

```
apps/web-ciudadano     Parte 1 — frontend público
apps/panel-admin       Parte 2 — frontend administrativo
services/api-core      Parte 3 — API y lógica de negocio
services/geo-service   Parte 4 — servicio geoespacial
packages/db            Parte 4 — esquema, migraciones, seeds
packages/contracts     transversal — tipos, Zod, OpenAPI (custodia Parte 3)
pipelines/geodata-etl  Parte 5 — ETL shapefile → GeoJSON → PostGIS
e2e/                   Parte 5 — pruebas transversales
infra/                 Parte 5 — Docker, SQL de init
data/                  raw (inmutable) · processed (generado) · samples (sintético)
docs/                  decisiones (ADR), dominio, seguridad
```

## Comandos

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:e2e` · `pnpm db:*` · `pnpm etl:*` · `pnpm contracts:build`. Detalle en `CLAUDE.md` §11.

## Convenciones

Conventional Commits en español con scope obligatorio (`feat(geo-service): ...`), una rama por paquete y fase, nada directo a `main`. Los hooks de git (Husky) lo verifican. Detalle en `CLAUDE.md` §12.
