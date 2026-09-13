# db — Parte 4 (datos, base de datos y arquitectura geoespacial)

Esquema, migraciones SQL, cliente tipado (Drizzle + `pg`), seeds sintéticos y **PostGIS local sin Docker**.

## Modo local sin Docker (ADR 0002)

```bash
pnpm db:local           # PGlite + postgis por socket en 127.0.0.1:5433, aplica migraciones pendientes
pnpm db:seed:samples    # capas y reportes SINTÉTICOS de data/samples/geo + usuarios locales
```

`DATABASE_URL` por defecto: `postgresql://curichi:curichi@127.0.0.1:5433/curichi` (sin SSL). Con Docker: `docker compose up -d` y `DATABASE_URL` al puerto 5432; los comandos son los mismos.

Datos persistentes en `infra/.pglite/` (ignorado por git). `PGLITE_MEMORIA=1 pnpm db:local` usa memoria.

## Usuarios locales creados por el seed (SOLO desarrollo)

| Email | Rol | Contraseña por defecto | Variable para cambiarla |
|---|---|---|---|
| `admin@curichi.local` | admin | `curichi-admin-local` | `SEED_ADMIN_PASSWORD` |
| `tecnico@curichi.local` | técnico | `curichi-tecnico-local` | `SEED_TECNICO_PASSWORD` |

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm db:migrate` | Aplica migraciones pendientes (`migraciones/NNNN_*.sql`, registro en `_migraciones`) |
| `pnpm db:generate <nombre>` | Crea un archivo de migración nuevo |
| `pnpm --filter db puntos-criticos:recalcular` | Recalcula puntos críticos (§9.2) |
| `pnpm --filter db test` | Vitest sobre un PostGIS efímero en memoria: migraciones, PIP, DBSCAN, conexiones concurrentes |

## Qué exporta

- `crearPool`, `crearDrizzle`, `esperarBaseDeDatos`, `esquema` (tablas Drizzle).
- `aplicarMigraciones`, `ejecutorPg`, `ejecutorPglite`.
- `recalcularPuntosCriticos` (usa `ST_ClusterDBSCAN`; si la build de PostGIS no lo tiene, DBSCAN equivalente en Node).
- `db/test-utils`: `levantarBaseEfimera()` para tests de otras partes.
