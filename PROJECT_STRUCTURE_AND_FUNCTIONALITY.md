# Project Structure & Functionality — Mi Curichi

> Documento de referencia técnica escrito el **2026-10-06** a partir de la **lectura del código**
> de la versión más reciente de `origin/main`. Sirve como contexto para futuras sesiones. No
> sustituye a `CLAUDE.md`, que sigue siendo el manual operativo y de reglas del repositorio.
>
> **Informes detallados por parte** (puesta en marcha, cada paquete, flujos, escalado y ecosistema):
> [`docs/arquitectura/`](docs/arquitectura/README.md).
>
> **2026-10-07 · FASE 2**: las conclusiones vigentes de arquitectura, acoplamiento, escalabilidad
> (con mediciones nuevas) y estrategia están en
> [`docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md`](docs/arquitectura/12-evaluacion-arquitectonica-y-escalabilidad.md).
> Se analizó la misma versión (`3121a0f`), así que lo de este documento sigue vigente salvo donde
> el 12 lo corrige.
>
> **Leyenda usada en todo el documento**
>
> - **[C] Confirmado por código.** Se leyó en el código fuente, en las migraciones o en la configuración.
> - **[I] Inferido.** Parece funcionar así, pero no se ejecutó ni se trazó de punta a punta.
> - **[D] Desconocido.** No se pudo determinar en esta sesión.
> - **[Doc] Según documentación.** Lo afirma un documento del repo y no se volvió a comprobar en el código.
>
> Los problemas encontrados están en §26 y §27 y **no se corrigieron**.

---

## 1. Project Overview

**Mi Curichi** es una plataforma web para que los vecinos reporten, con ubicación, los **puntos donde
se inunda o se estanca el agua** en una ciudad. *Curichi* es una palabra cruceña que nombra un bajío
donde el agua se estanca. La instalación actual es para **Santa Cruz de la Sierra, Bolivia** (ciudad
`<a confirmar>` según CLAUDE.md).

Qué hace el sistema [C]:

1. Un **mapa público** (sin cuenta) con los reportes publicados, agrupados visualmente y cruzados
   con las capas oficiales: **distrito municipal**, **unidad vecinal (UV)** y **manzana**.
2. **Cuentas ciudadanas** (registro y login). Hace falta una cuenta para **reportar**, pero no para ver el mapa.
3. Un **formulario de reporte** en 4 pasos con estas reglas:
   - La ubicación del dispositivo es obligatoria. El punto se ajusta dentro de **60 m** de esa
     posición y se exige una precisión de **≤ 50 m**.
   - Si el dispositivo no llega a esa precisión, por ejemplo una computadora, se usa el camino de
     **ubicación aproximada** (ADR 0007).
   - La foto es opcional y se saca solo con la cámara dentro de la página. El servidor la recodifica
     a WebP sin metadatos.
4. **Publicación diferida sin moderación previa** (ADR 0006): el reporte se publica solo a los
   60 s (1.º del día) o a los 240 s (2.º y 3.º), con la etiqueta «NO SE HA VERIFICADO».
5. Un **panel técnico/administrativo** con estas funciones:
   - bandeja con tabla y mapa;
   - moderación: validar, rechazar, fusionar, reclasificar y retirar;
   - exportación CSV y GeoJSON;
   - indicadores;
   - activación de versiones de capas;
   - una pantalla **ejecutiva**.
6. **Severidad reproducible** calculada con una función pura (profundidad × frecuencia).
7. **Puntos críticos**: agrupaciones de reportes verificados en un radio de 25 m (DBSCAN).
8. **ETL** shapefile → GeoJSON → PostGIS para las capas del municipio.
9. **Infraestructura**:
   - Docker Compose con un proxy Caddy (TLS);
   - observabilidad con Prometheus y Alertmanager;
   - respaldos cifrados;
   - CI en GitHub Actions;
   - un lanzador `Mi-Curichi.exe` para Windows.

Lo que **no es**: un modelo hidráulico, un estudio de drenaje ni un instrumento para decidir
inversiones. Los datos son de percepción y esa advertencia (`NOTA_METODOLOGICA`) viaja en cada
exportación [C].

**Estado del proyecto** [Doc + C]: la Fase 1 (local) sigue en curso, falta su cierre. No hay
despliegue público. La Fase 2 (VPS por ciudad, ADR 0006) está preparada en el Compose y el CI,
pero **no aprobada ni operada**.

---

## 2. Repository Information

| Dato | Valor |
|---|---|
| Remoto oficial (`origin`) | `https://github.com/paltaunkwnow/MICURICHI.git` |
| Rama principal | `main` (`origin/HEAD → origin/main`) |
| Carpeta local | `C:\Users\HP\Desktop\MICURICHI` |
| Tipo de repo | Monorepo **pnpm workspaces + Turborepo** |
| Archivos versionados | 666 (en el commit analizado) |
| Commits en `main` | 87 |
| Autores en el historial de `main` | `paltaunkwnow` (64), `Juan Pablo Cabrera` (18), `Gelomiterizzio` (4), `Claude` (1) |
| Licencia | **Ninguna declarada** (README: no hay `LICENSE`, se aplica el derecho de autor por defecto) |

Ramas remotas al 2026-10-06 (después de `git fetch --all --prune`) [C]:

| Rama | Último commit | Situación |
|---|---|---|
| `origin/main` | `3121a0f` · 2026-10-04 22:16 -0400 | **Analizada** |
| `origin/feat/repo/produccion-vps` | `888bce8` · 2026-10-04 | Ya contenida en `main` |
| `origin/feat/repo/cuentas-ciudadanas-y-auditoria` | `a06d281` · 2026-09-25 | Ya contenida en `main` |
| `origin/claude/disaster-alert-platforms-research-c6sjk5` | `8a8c843` · 2026-09-18 | No es ancestro de `main`. Su contenido (documentación de investigación en `docs/dominio/`) está en `main` en una versión posterior [I] |
| `origin/dependabot/...` (5 ramas) | 2026-10-05 | PR automáticos **sin fusionar**: `actions/checkout` 7.0.1, `actions/setup-node` 7.0.0, `docker/setup-buildx-action` 4.4.1, `geojson-vt` 5.0.3 y el grupo `menores-y-parches` (19 actualizaciones) |

---

## 3. Current Version Analyzed

| Dato | Valor |
|---|---|
| Rama analizada | `main` |
| Commit exacto | **`3121a0ff9d496fde84a888f4f9131080966bde63`** |
| Fecha del commit | 2026-10-04 22:16:09 -0400 |
| Mensaje | `feat(repo): reportar con ubicación aproximada desde dispositivos sin GPS (ADR 0007)` |
| Versión de contratos | `packages/contracts` **0.18.0** |
| Última migración | `0019_ubicacion_aproximada.sql` |

**Sincronización realizada en esta sesión** [C]:

- Estado previo:
  - la carpeta estaba en la rama `feat/repo/cuentas-ciudadanas-y-auditoria` (`a06d281`, 2026-09-25), **65 commits por detrás** de `origin/main`;
  - la rama local `main` estaba en `b2df394`, 69 commits por detrás.
- Pasos:
  1. `git fetch --all --prune`;
  2. avance rápido de la rama local `main` con `git fetch origin main:main`;
  3. `git checkout main`.
- Garantías:
  - no hubo merge, rebase, stash, reset, commit ni push;
  - la rama de trabajo anterior quedó intacta.
- Resultado: `main...origin/main` **sin diferencias** (0 por delante, 0 por detrás).
- Working tree: dos archivos modificados que ya estaban así antes de sincronizar:
  - `apps/panel-admin/next-env.d.ts` y `apps/web-ciudadano/next-env.d.ts`;
  - los regenera `next dev` (cambian `./.next/types/...` por `./.next/dev/types/...`);
  - se conservaron sin tocar.
- Archivo nuevo: este documento (sin versionar).

**Artefactos locales que no están en git** [C, por listado de carpetas; su contenido no se leyó]:

- `.env` existe. **No se leyó** porque contiene secretos.
- `data/raw/DM_UV_MZ_2025/` tiene los shapefiles reales y un `.zip`.
- `data/processed/` tiene salidas para `DM_UV_MZ_2025`, `PRUEBA` y `SINPRJ`.
- Existen `infra/.pglite/` (base local PGlite) e `infra/.storage/` (fotos locales).
- `node_modules/` es del **2026-09-23**, anterior al `pnpm-lock.yaml` actual: probablemente haga
  falta `pnpm install` antes de ejecutar esta versión [I]. **No se instaló nada.**
- `Mi-Curichi.exe` **no** está compilado.

---

## 4. Technology Stack

Versiones exactas tomadas de los `package.json`, del Compose y de los Dockerfiles [C]:

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | `>=24 <25` (`.nvmrc` = 24). Imágenes: `node:24.21.0-slim` fijada por digest |
| Gestor / orquestador | pnpm / Turborepo | 12.4.1 / 2.10.12 |
| Lenguaje | TypeScript | 5.9.3 (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) |
| Lint/formato | Biome | 2.5.13 |
| Git hooks | Husky / lint-staged / commitlint | 9.1 / 17.5 / 21.2 |
| Frontends | Next.js (App Router) / React | 16.3.6 / 19.3.0 |
| Estilos | Tailwind CSS (v4, `@tailwindcss/postcss`) | 4.3.3 |
| Estado de servidor | TanStack Query | 5.102.8 |
| Formularios | React Hook Form + `@hookform/resolvers` | 7.88.0 / 5.9.1 |
| Mapa | MapLibre GL JS | 6.9.0 |
| Iconos / fuentes | lucide-react / `@fontsource` (Sora, Source Sans 3) | 1.45.0 / 5.3.0 |
| Validación | Zod | 4.6.4 |
| Backend | Fastify (+ cors, cookie, multipart, rate-limit, sensible, compress, swagger, swagger-ui, static) | 5.12.4 |
| ORM / driver | Drizzle ORM (solo como espejo de tipos) / `pg` | 0.45.2 / 8.23.0 |
| Imágenes | sharp (libvips) | 0.35.4 |
| Hash de contraseñas | `hash-wasm` (Argon2id) + `node:crypto` (`argon2Sync` en workers) | 4.12.0 |
| Base de datos | PostgreSQL 18 + PostGIS 3.6 | imagen `postgis/postgis:18-3.6` |
| Base sin Docker / pruebas | PGlite + `pglite-postgis` + `pglite-socket` | 0.5.8 / 0.2.8 / 0.2.11 |
| Teselas al vuelo | geojson-vt / vt-pbf | 4.0.3 / 3.1.3 |
| ETL | mapshaper / `@turf/turf` / rbush | 0.7.61 / 7.4.0 / 4.0.1 |
| Pruebas | Vitest / Playwright | 4.1.11 / 1.63.0 |
| Proxy de entrada | Caddy | `caddy:2.11.4-alpine` (por digest) |
| Fotos S3 (solo desarrollo) | MinIO | `ghcr.io/coollabsio/minio:RELEASE.2025-10-15…` (por digest) |
| Observabilidad | Prometheus / Alertmanager / blackbox-exporter | v3.15.0 / v0.34.1 / v0.28.0 |
| CI | GitHub Actions + gitleaks + Trivy + Dependabot | — |
| Lanzador Windows | C# 5 compilado con el `csc` de .NET Framework 4 | — |

No hay GDAL, Python ni tippecanoe: el ETL está en TypeScript (ADR 0002) [C].

---

## 5. Project Structure

```text
MICURICHI/
├── CLAUDE.md                     Manual operativo (reglas de oro, 5 partes, dominio, contratos)
├── README.md · CONTRIBUTING.md · SECURITY.md
├── package.json                  Scripts raíz (turbo, db:*, etl:*, secretos, auditoria, privilegios)
├── pnpm-workspace.yaml           Workspaces + cuarentena de 24 h (minimumReleaseAge) + allowBuilds + overrides
├── turbo.json                    Tareas build/dev/test/typecheck/test:e2e + globalEnv (lista blanca de variables)
├── biome.json · tsconfig.base.json · commitlint.config.js · .lintstagedrc.json · .husky/
├── .env.example                  TODAS las variables documentadas, con etiquetas [OBLIGATORIA]/[PRODUCCIÓN]/…
├── docker-compose.yml            postgis (+ perfiles servicios, minio, respaldos, observabilidad)
├── .github/                      workflows/ci.yml · dependabot.yml · PULL_REQUEST_TEMPLATE.md
├── .claude/                      launch.json (preview), skill /sdd y agentes sdd-* / trabajador-raiz
│
├── apps/
│   ├── web-ciudadano/            Parte 1 — Next.js: mapa público, detalle, reporte, cuenta, PWA (:3000)
│   └── panel-admin/              Parte 2 — Next.js: bandeja, moderación, indicadores, ejecutivo, capas (:3100)
├── services/
│   ├── api-core/                 Parte 3 — Fastify: API REST de negocio (:3001)
│   └── geo-service/              Parte 4 — Fastify: PIP, capas, teselas, agregados (:3002), SOLO LECTURA
├── packages/
│   ├── contracts/                Transversal — enums, Zod, severidad, config de dominio, OpenAPI generado
│   └── db/                       Parte 4 — migraciones SQL, espejo Drizzle, cliente pg, cuentas, puntos críticos, seeds
├── pipelines/
│   └── geodata-etl/              Parte 5 — ETL shapefile → GeoJSON → PostGIS (TypeScript + mapshaper)
├── e2e/                          Parte 5 — Playwright transversal (28 specs) + runner local
├── infra/
│   ├── docker/                   Dockerfiles: servicio (api/geo), app (Next), proxy (Caddy), respaldo
│   ├── proxy/                    Caddyfile + arrancar.sh (valida variables)
│   ├── sql/                      Init de PostGIS: 00-extensiones.sql, 01-roles.sh (roles curichi_api/geo)
│   ├── minio/ · respaldo/ · observabilidad/   (inicializar.sh, respaldo.sh, prometheus/alertas/alertmanager)
├── scripts/                      lanzador/ (Mi-Curichi.exe), buscar-secretos.mjs, respaldo.mjs, banco-*.mjs
├── data/
│   ├── raw/<version>/            Shapefiles originales — INMUTABLE, no versionado (solo MANIFEST.md)
│   ├── processed/                Salida del ETL — no versionada
│   └── samples/                  Muestras SINTÉTICAS versionadas (geo/*.geojson, shp/DM_UV_MZ_SAMPLE)
└── docs/
    ├── TRASPASO.md               Estado y defectos al 2026-09-27 (1460 líneas)
    ├── decisiones/               ADR 0001–0007
    ├── revision/                 Revisiones (2026-09-26 producción, 2026-10-03 mapeo y pruebas)
    ├── sdd/                      Corridas de verificación SDD (2026-09-25, 2026-10-04 ×2)
    ├── seguridad/                Modelo de seguridad, auditoría 2026-09, checklist de PR
    ├── operaciones/              Manual, producción, observabilidad, respaldo y restauración
    ├── dominio/                  Drenaje y pavimento; investigación de plataformas de riesgo
    └── proceso/sdd.md            Proceso de verificación SDD
```

Los paquetes del workspace se llaman igual que su carpeta (`web-ciudadano`, `panel-admin`,
`api-core`, `geo-service`, `contracts`, `db`, `geodata-etl`, `e2e`), así que funciona
`pnpm --filter <nombre> <script>` [C].

---

## 6. Application Architecture

### 6.1 Patrón general [C]

- **Monorepo modular por responsabilidades.** Son 5 «partes» con carpetas propias (ADR 0001) y un
  paquete de contratos compartido.
- **Arquitectura de servicios pequeños.**
  - Dos frontends Next.js que hacen de **BFF/proxy**: reenvían `/api/*` y `/geo/*` desde el mismo
    origen.
  - Dos APIs Fastify con responsabilidades separadas: escritura de negocio frente a lectura geoespacial.
  - Una sola base PostgreSQL/PostGIS.
- **Contract-first.** `packages/contracts` es la única fuente de enums, esquemas Zod, constantes de
  dominio y la función de severidad. El OpenAPI 3.1 se **genera** desde Zod.
- **Dentro de cada servicio no hay capas de controller/service/repository.**
  - Las rutas de Fastify contienen la lógica.
  - Las consultas usan **SQL parametrizado escrito a mano** con `pg`.
  - Hay módulos auxiliares puros: `visibilidad.ts`, `vistas.ts`, `consultas.ts`, `cuota.ts`,
    `idempotencia.ts`, `ubicacion-dispositivo.ts`.
  - Drizzle está declarado, pero el esquema Drizzle es solo un **espejo tipado** que se verifica
    contra la base. No se usan sus queries en las rutas.
- **Inyección de dependencias manual.** `crearApp({ pool, cfg, resolver, almacen, logger })` en
  api-core y `crearApp({ pool, cfg, logger })` en geo-service. Permite pruebas con falsos
  (`AlmacenMemoria`, resolvers falsos, PGlite).
- **Configuración en tiempo de ejecución**, una instalación por ciudad (ADR 0004). La ciudad, la
  zona horaria y el CRS métrico llegan por variables y `GET /api/v1/configuracion`, no al compilar.

### 6.2 Topología

```text
                         Navegador (vecino / técnico / ejecutivo)
                                      │ HTTPS (en Docker)
                         ┌────────────▼─────────────┐
                         │ proxy Caddy (perfil       │  único que publica puertos hacia fuera
                         │ servicios): TLS, XFF real │  (local: 127.0.0.1:8080/8443)
                         └──────┬─────────────┬──────┘
               dominio público  │             │ dominio panel
                 ┌──────────────▼──┐      ┌───▼──────────────┐
                 │ web-ciudadano   │      │ panel-admin       │  Next.js 16 (standalone)
                 │ :3000           │      │ :3100             │  src/proxy.ts: CSP con nonce,
                 └──────┬──────┬───┘      └───┬──────┬────────┘  reenvío /api y /geo, HSTS opcional
                        │/api  │/geo          │/api  │/geo
               ┌────────▼──────┴──────────────▼──┐   │
               │ api-core :3001 (Fastify)        │   │
               │ negocio, auth, fotos, auditoría │   │
               └────┬──────────┬──────────┬──────┘   │
   POST /geo/v1/    │          │ fotos    │          │
   resolver +       │          ▼          │          │
   x-token-interno  │   disco (volumen)   │   ┌──────▼──────────────────┐
                    │   o S3/MinIO        │   │ geo-service :3002        │
                    └────────────────────►│   │ PIP, capas, MVT, agreg.  │
                                          │   └──────┬──────────────────┘
                              rol curichi_api        │ rol curichi_geo (SELECT)
                                          ▼          ▼
                         ┌──────────────────────────────────────┐
                         │ PostgreSQL 18 + PostGIS 3.6           │
                         │ public.* (reportes, usuarios, …)      │
                         │ geo.* (capas versionadas + vistas)    │
                         └──────────────────────────────────────┘
                                  ▲                     ▲
                 migraciones (rol dueño curichi)   ETL geodata-etl (rol dueño)
```

### 6.3 Reglas de dependencia (verificadas en código) [C]

- Los frontends **nunca** hablan con la base: solo usan `fetch` a `/api` y `/geo` en el propio origen.
- `api-core` es el **único** que escribe reportes, fotos, sesiones y auditoría.
- `geo-service` es de **solo lectura**:
  - su rol `curichi_geo` solo tiene `SELECT`;
  - al arrancar comprueba `puedeEscribir('reporte_inundacion')` y en producción se niega a servir si
    tiene escritura.
- Solo `packages/db` define el esquema (migraciones SQL). El ETL y los seeds usan el rol dueño.
- En el Compose, api-core y geo-service publican solo un puerto efímero en `127.0.0.1` para
  diagnóstico, y las apps no publican ninguno.

### 6.4 Puntos de entrada [C]

| Componente | Punto de entrada |
|---|---|
| api-core | `services/api-core/src/servidor.ts` (crea pools, almacén, resolver, `crearApp`, verifica privilegios, escucha, programa mantenimiento) |
| geo-service | `services/geo-service/src/servidor.ts` |
| web-ciudadano | `apps/web-ciudadano/src/app/layout.tsx` + `src/proxy.ts` (proxy/middleware de Next 16) |
| panel-admin | `apps/panel-admin/src/app/layout.tsx` + `src/proxy.ts` |
| Migraciones | `packages/db/src/cli/migrar.ts` (tsx) / `dist/cli/migrar.js` (producción, job `migraciones`) |
| Base sin Docker | `packages/db/src/local/servidor.ts` (`pnpm db:local`) |
| Seeds | `packages/db/src/cli/seed-samples.ts` |
| Cuentas de staff | `packages/db/src/cli/cuentas.ts` (`crear` / `desactivar` / `reactivar`) |
| ETL | `pipelines/geodata-etl/src/cli.ts` (`inspect`, `run`, `load`, `all`) |
| E2E | `e2e/playwright.config.ts` · `e2e/scripts/correr-local.mjs` |

---

## 7. Frontend Architecture

Las dos apps comparten patrón [C]:

- Next.js 16 App Router con `output: 'standalone'`.
- TanStack Query para el estado de servidor.
- Componentes propios, sin shadcn, y Tailwind 4 con `globals.css`.
- MapLibre con el **worker servido localmente** (`public/maplibre/`, copiado por
  `scripts/copiar-worker-maplibre.mjs` en `predev` y `prebuild`) y glifos locales en `public/glifos/`.
- `src/proxy.ts` resuelve en cada petición:
  - el **reenvío** de `/api/*` a `API_CORE_URL` y de `/geo/*` a `GEO_SERVICE_URL`;
  - la **CSP con nonce** y `strict-dynamic`;
  - HSTS si `HSTS=1`;
  - el **borrado** de `X-Forwarded-For`, `X-Real-IP`, `Forwarded` y `X-Client-IP` cuando
    `PROXY_DE_CONFIANZA≠1`.
- Las cabeceras fijas van en `next.config.ts`: `nosniff`, `Referrer-Policy`,
  `X-Frame-Options: DENY` y `Permissions-Policy: geolocation=(self), camera=(self), …`.
- La ciudad se lee **en el servidor** en el layout raíz (`ciudad-servidor.ts` → `GET /api/v1/configuracion`,
  con caché de 5 min y respaldo `CIUDAD_POR_DEFECTO`). `connection()` obliga a renderizar por
  petición, que es lo que permite el nonce.
- Cliente HTTP propio (`src/lib/api.ts`):
  - `fetch` con plazos (lectura 15 s, escritura 30 s, subida 180 s);
  - `ErrorApi(codigo, mensaje, estado, detalles)`.

### 7.1 `apps/web-ciudadano` (Parte 1) [C]

**Rutas (`src/app`)**

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/` | `page.tsx` → `VistaMapa` | Mapa público con filtros (severidad, UV, distrito, punto crítico), búsqueda local, lista de tarjetas, detalle |
| `/inicio` | `Portada` (escritorio) / `Bienvenida` (móvil) | Portada y láminas de bienvenida |
| `/reportar` | `FormularioReporte` (1859 líneas) | Flujo de reporte de 4 pasos |
| `/reporte/[id]` | `page.tsx` + `HojaDetalle` + `MapaDiferido` | Detalle con enlace propio |
| `/mis-reportes`, `/mis-reportes/[id]` | `MisReportes`, `SeguimientoReporte` | Reportes propios en cualquier estado, cuenta regresiva |
| `/ingresar`, `/crear-cuenta` | `FormularioAcceso` (modo `entrar` / `alta`) | Login y alta; `?volver=` validado contra redirección abierta |
| `/cuenta` | `PanelCuenta` | Estado de sesión, botón al panel para staff |
| `/como-funciona` | `ComoFunciona` | Severidad, PIP y datos |
| `error.tsx`, `global-error.tsx`, `not-found.tsx` | — | Errores |

**Componentes clave**

- **Mapa**:
  - `Mapa.tsx`: MapLibre, capa raster de OSM, fuente `reportes` con `cluster: true` y capas de
    distrito/UV/manzana desde `CapaInfo.url` (GeoJSON o MVT con huella; ante un `410 CAPA_CAMBIO`
    vuelve a pedir la lista);
  - `VistaMapa.tsx` y `MapaDiferido.tsx` (carga diferida con `next/dynamic`).
- **Detalle**: `HojaDetalle`, `TarjetaReporte`, `ChipSeveridad`, `IconoSinVerificar` y `LeyendaMapa`.
- **Reporte**:
  - `FormularioReporte`, `PedirUbicacion`, `CamaraReporte` (cámara con `getUserMedia`);
  - `CuentaRegresiva`, `CupoAgotado`, `AccesoRequerido` y `AvisosDelReporte`.
- **Navegación**: `BarraSuperior` (escritorio), `BarraInferior` (móvil), `Toast` y `AvisoPuntoResuelto`.

**Lógica pura en `src/lib`** (casi todo con pruebas Vitest)

| Ámbito | Archivos |
|---|---|
| Ubicación del dispositivo | `ubicacion-dispositivo.ts`: `ControladorUbicacion` (único archivo que toca `navigator.geolocation`), `decidirEnvio`, `DispositivoCongelado` |
| Radio de 60 m | `radio.ts`: mover, recortar al círculo, coordenadas escritas |
| Cámara y fotos | `camara.ts`, `foto.ts` |
| Borrador | `borrador.ts`, en **sessionStorage** |
| Armado del envío | `formulario-reporte.ts`: pasos y `armarEnvio` |
| Errores | `errores.ts`: traduce los códigos de la API |
| Cupo y demora | `cupo.ts`, `publicacion.ts` |
| Capas con huella | `capas-con-huella.ts` |
| Sesión | `sesion.tsx`: `useSesion`, `useCerrarSesion`, consulta de `/auth/yo` con `staleTime` de 5 min |
| Botón al panel | `panel.ts`: `panel_url` de `/auth/yo` |
| Configuración | `configuracion.ts`, `servicios.ts` |
| Estado público | `verificacion.ts`: texto «NO SE HA VERIFICADO» |
| Mis reportes | `misReportes.ts` |

**Estado**

- Estado de servidor: TanStack Query (`consultas.ts`).
  - **Sin tráfico automático** en la página pública: no hay `refetchOnWindowFocus`,
    `refetchOnReconnect` ni `refetchInterval`.
  - Los datos públicos (`reportes`, `agregados`, `reporte`) tienen `staleTime: Infinity`.
- Estado local: `useState` y `useSyncExternalStore` (ubicación, hidratación).
- Persistencia en el navegador:
  - **sessionStorage**: borrador del reporte y correo recién registrado;
  - **localStorage**: solo los «resueltos vistos» por cuenta (`AvisoPuntoResuelto`) y el borrado
    de la lista vieja de mis reportes.
  - No se guarda ningún token: la sesión va en una cookie HttpOnly.

**Lecturas públicas con `credentials: 'omit'`**: el mapa nunca envía la cookie. Login, logout,
registro, reportar, fotos, `/mis-reportes` y `/auth/yo` usan `same-origin`.

**PWA**:

- `public/manifest.webmanifest` y `public/sw.js` (v6, solo lectura):
  - navegación: red primero;
  - capas y estáticos con huella: caché primero;
  - `/api/` no se cachea nunca;
  - topes de 400 entradas de capas y 120 de shell.
- El SW solo se registra en producción.

**Cómo una acción del usuario produce un cambio** (ejemplo, filtrar por severidad):

1. `VistaMapa` actualiza `severidad`.
2. Se recalcula el memo `filtros` y cambia la `queryKey` `['reportes', filtros]`.
3. TanStack aborta la petición anterior y hace `GET /api/v1/reportes?severidad=…&bbox=…&limite=300`.
   `keepPreviousData` evita el parpadeo.
4. El proxy de Next reenvía a api-core.
5. Llega una FeatureCollection pública y `Mapa` actualiza la fuente `reportes`.

### 7.2 `apps/panel-admin` (Parte 2) [C]

**Rutas**

| Ruta | Rol | Qué hace |
|---|---|---|
| `/` | — | Redirige según el rol (`rutaInicial`): ejecutivo → `/ejecutivo`, técnico y admin → `/reportes`; sin sesión → `/login` |
| `/login` | — | `FormularioLogin` (`?caducada=1` si la sesión venció) |
| `(panel)/reportes` | técnico, admin | Bandeja: `FiltrosReportes`, `TablaReportes`, `Mapa`, `Paginacion`, exportación CSV/GeoJSON; filtros y `bbox` en la URL |
| `(panel)/reportes/[id]` | técnico, admin | Detalle técnico, `PanelAcciones` (validar/rechazar/fusionar/reclasificar/resolver/retirar/reabrir), `CandidatosFusion`, `DatosUbicacion`, `FactoresSeveridad`, `ReporteUnitarioModal` (ficha imprimible) |
| `(panel)/indicadores` | técnico, admin | Tarjetas, `PestanasPorSeveridad`, `FiltroSeveridad`, tortas por distrito y UV, `CapaAnterior` |
| `(panel)/ejecutivo` | ejecutivo, técnico, admin | `PanelEjecutivo`: cifra grande, `PestanasSeveridad`, `Graficas`, `CriteriosSeveridad` y un mapa de distritos y UV con los reportes **públicos** |
| `(panel)/capas` | admin (UI) | Lista de versiones de capa y activación |
| `(panel)/plano` | técnico, admin | Plano de zonificación de Santa Cruz (`public/plano-zonificacion.webp`); solo si la ciudad coincide (`plano.ts`) |

**Control de acceso en la UI** (`lib/sesion.tsx` + `lib/roles.ts`):

- `<Protegido>` consulta `GET /api/v1/auth/yo`.
- Casos que maneja:
  - 401 → `/login`;
  - rol `ciudadano` → `SinAccesoPanel`;
  - ejecutivo fuera de `/ejecutivo` → lo redirige allí con un aviso.
- El evento global `curichi:sesion-caducada` (emitido por `api.ts` ante cualquier 401) limpia la
  caché y lleva a `/login?caducada=1`.
- **Es solo la puerta de la interfaz**: el permiso real lo aplica api-core.

**Sondeo** (`lib/consultas.ts`):

- Bandeja, detalle, indicadores y ejecutivo se refrescan **cada 10 s**, solo con la pestaña visible
  y con `staleTime: 0`.
- Los refrescos automáticos llevan `x-curichi-sondeo: 1`, para que **no renueven la inactividad de
  la sesión**.
- La geometría de las capas se pide una vez. La lista de capas vence a los 60 s.

**Fusión** (`lib/fusion-cercana.ts`):

- Solo ofrece reportes **validados** a 100 m (ampliable a 300 m y 1 km).
- Los busca con `bbox` alineado a una cuadrícula de 0,0005° para no dejar la coordenada exacta en
  los logs, y mide la distancia con `distanciaMetros` de contracts.
- No permite pegar un ID.

**Exportación**:

- GeoJSON: `fetch` con un plazo de 180 s y descarga como Blob.
- CSV: URL `/api/v1/exportar?formato=csv&…`.

---

## 8. Backend Architecture

### 8.1 `services/api-core` (Parte 3) [C]

**Arranque (`servidor.ts`)**:

1. `leerConfig()` valida toda la configuración. En producción, `verificarProduccion` exige:
   - sales de 32 caracteres o más que no sean las de ejemplo;
   - `GEO_TOKEN_INTERNO` de 32 o más;
   - `COOKIE_SEGURA=1`;
   - `PANEL_ADMIN_URL` https;
   - CORS sin `*`;
   - `METRICAS_TOKEN` si se expone `/metrics`.
2. Crea dos pools: el de peticiones (`DB_POOL_MAX`, 8 por defecto) y otro de 2 conexiones para el mantenimiento.
3. Elige el almacén: `AlmacenS3` si hay `S3_ENDPOINT` (firma SigV4 propia, sin SDK) o, si no,
   `AlmacenDisco(STORAGE_DIR)`.
4. `crearApp(...)`.
5. Espera a la base y ejecuta `verificarPrivilegios` (rol esperado `curichi_api`; en producción
   falla si es superusuario o dueño de tablas).
6. Comprueba S3 si corresponde, escucha y llama a `programarMantenimiento`.
7. Cierre ordenado con un plazo de 15 s; también cierra los workers de hashing.

**Plugins y hooks (`app.ts`)**:

- Plugins:
  - `sensible`, `compress` (gzip/deflate desde 1 KB), `cors` (orígenes de `CORS_ORIGENES`,
    `credentials: true`), `cookie`;
  - `multipart` (8 MB, 1 archivo), `rate-limit` (`global: false`; cada ruta declara el suyo).
- Hooks y servicios:
  - `instalarObservabilidad` (métricas Prometheus en memoria; `/metrics` con token);
  - `instalarAuth`: hook `onRequest` que resuelve `req.usuario` a partir de la cookie `curichi_sesion`.
- `onSend` añade a toda respuesta:
  - `nosniff`, `Referrer-Policy` y `X-Frame-Options: DENY`;
  - `Cache-Control: private, no-store` + `Vary: Cookie` **por defecto**;
  - una CSP `default-src 'none'` (salvo en `/docs`).
- **Manejador de errores único**:
  - 429 → `RATE_LIMIT`;
  - 4xx de Fastify (`FST_*`) → códigos del dominio (`PAYLOAD_INVALIDO`, `PAYLOAD_DEMASIADO_GRANDE`,
    `TIPO_DE_CONTENIDO_NO_ADMITIDO`);
  - base no disponible (pool agotado, ECONNREFUSED/ENOTFOUND, SQLSTATE 57P03/53300/08006/08001/57P01)
    → **503 `NO_DISPONIBLE`** con `Retry-After: 2`;
  - `GeoNoDisponible` → 503 con `Retry-After: 5`;
  - el resto → 500 `ERROR_INTERNO`, con el detalle solo en el log.
- `/docs`: Swagger UI estático desde `packages/contracts/openapi/openapi.yaml`, solo fuera de
  producción (o con `EXPONER_DOCS=1`).

**Módulos de rutas (`src/rutas/`)**

| Archivo | Rutas |
|---|---|
| `auth.ts` | `POST /api/v1/auth/registro`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/yo` |
| `configuracion.ts` | `GET /api/v1/configuracion` |
| `reportes.ts` | `POST /api/v1/reportes`, `GET /reportes`, `GET /reportes/:id`, `GET /tecnico/reportes`, `GET /tecnico/reportes/:id`, `GET /mis-reportes` |
| `moderacion.ts` | `PATCH /reportes/:id/estado`, `POST /reportes/:id/fusionar`, `PATCH /reportes/:id/severidad` |
| `fotos.ts` | `POST /api/v1/fotos`, `GET /api/v1/fotos/:key` |
| `admin.ts` | `GET /api/v1/exportar`, `GET /indicadores`, `GET /admin/capas`, `POST /admin/capas/:id/activar` |
| `ejecutivo.ts` | `GET /api/v1/ejecutivo/resumen` |
| `app.ts` | `GET /health`, `GET /ready`, `/metrics` (con token), `/docs` |

**Módulos de soporte**

| Módulo | Responsabilidad |
|---|---|
| `auth.ts` | `crearSesion` (32 bytes aleatorios en hex), `usuarioDeSesion` (caducidad absoluta + inactividad, refresco de `ultimo_uso_en` cada 60 s salvo sondeo), `requerirRol(...)` (401 `SIN_SESION` / 403 `SIN_PERMISO`) |
| `visibilidad.ts` | **Fuente única de visibilidad**: `condicionPublico` (estado público y `publicar_en <= now()`) y `condicionPublicado` (`publicar_en <= now()`), armadas como **literal SQL** desde `ESTADOS_PUBLICOS` para que el planificador use los índices parciales |
| `consultas.ts` | `armarWhere` (filtros; el bbox público filtra por `geom_publico`, el técnico por `geom`), `listarReportes` (conteo acotado a 10 000, `MAX_OFFSET` 50 000), `seleccionarParaExportar` (REPEATABLE READ), `obtenerReporte(…, 'publico'\|'publicado'\|'cualquiera')`, `reportesDelAutor` |
| `vistas.ts` | `SELECT_REPORTE` (une las capas por `(id, version_capa)`, fotos sanitizadas, punto crítico) y las vistas `vistaPublica` (geometría pública, sin autor; lanza si el estado no es público), `vistaTecnica` (exacta + moderación) y `vistaMiReporte` (exacta + `publicar_en`, `segundos_para_publicar`, `retirado`) |
| `ubicacion-dispositivo.ts` | `revisarDispositivo`: precisión ≤ 50 m (o > 50 m en el camino aproximado), antigüedad ≤ 600 s, radio ≤ 60 + 0,5 m; deriva `ubicacion_metodo` (`gps` si la distancia ≤ max(2 m, precisión), si no `manual`; `aproximada`) |
| `cuota.ts` | Cupo diario por cuenta en `cuota_reporte_diaria` con `INSERT … ON CONFLICT DO UPDATE … WHERE n < max RETURNING n`; el día se calcula en la zona de la ciudad; devolución del turno de foto |
| `idempotencia.ts` | Cabecera `Idempotency-Key` (8 a 200 caracteres) con prefijo de cuenta; huella SHA-256 del payload sin `dispositivo`; reclamación dentro de la transacción |
| `id-reporte.ts` | Acepta un UUID o un **ID corto** de 8 hex resuelto por rango sobre la PK, con la condición de visibilidad de la ruta (0 o 2 coincidencias → 404) |
| `resolver.ts` | `ResolverHttp`: `POST /geo/v1/resolver` con `x-token-interno` y `x-request-id`, plazo de 5 s; un 5xx o 429 → `GeoNoDisponible`; `invalidarCapas` de mejor esfuerzo |
| `almacen.ts` / `almacen-s3.ts` / `guarda-disco.ts` | Almacenes de fotos; guarda de disco `FOTOS_MIN_LIBRE_BYTES` (2 GiB) |
| `cache.ts` | Política de caché cerrada por defecto |
| `privacidad.ts` / `registro.ts` | Hash de IP con sal (logs y antispam); serializadores pino sin IP; `redact` de `dispositivo` |
| `proxy.ts` | Confianza acotada en `X-Forwarded-For` (`TRUST_PROXY`: 0, N saltos o lista de IP/CIDR; `true` y `*` se rechazan) |
| `mantenimiento.ts` | Pasada cada 6 h (la primera a 30 s) bajo `pg_try_advisory_lock(4023)`: rellenar `geom_publico`, recalcular puntos críticos pendientes, `ejecutarMantenimiento` y borrar objetos de fotos huérfanas |
| `observabilidad.ts` | Contadores e histogramas Prometheus propios; métricas del pool, de la bandeja sin verificar y de las fotos |

**Flujo de una petición** (genérico):

```text
HTTP → Fastify (bodyLimit 1 MB, trustProxy acotado)
     → onRequest: X-Request-Id, métricas; instalarAuth → req.usuario (cookie → sesion JOIN usuario)
     → rate-limit de la ruta (si la declara)
     → preHandler: requerirRol(...)  (401 / 403)
     → handler: safeParse con Zod de contracts → 400 PAYLOAD_INVALIDO / FILTROS_INVALIDOS
              → reglas de negocio (dispositivo, cupo, transición, visibilidad)
              → SQL parametrizado con pg (transacción con BEGIN/COMMIT y FOR UPDATE donde hace falta)
              → auditoría (INSERT auditoria) en la misma transacción
              → mapeo de vista (pública / técnica / autor) → GeoJSON Feature(Collection)
     → onSend: cabeceras de seguridad + Cache-Control por defecto
     → setErrorHandler para cualquier excepción
```

### 8.2 `services/geo-service` (Parte 4) [C]

- Arranque:
  - verifica privilegios (rol `curichi_geo`) y que **no pueda escribir** en `reporte_inundacion`;
  - el log guarda un hash de la IP con `IP_HASH_SAL` o con una sal aleatoria por arranque.
- `crearApp`:
  - `compress` (JSON/GeoJSON/texto; los MVT no);
  - `cors`;
  - **rate limit global de 600/min por IP** y uno de 120/min para las rutas que consultan PostGIS;
  - el **resolver** exime del cupo a las peticiones internas (token válido o loopback sin token);
  - `X-Request-Id` propagado;
  - SQLSTATE 57014 (`statement_timeout`, 5 s por defecto) → 503 `NO_DISPONIBLE`.
- `resolver.ts` (PIP, §7.4) [C]:
  1. UV con `ST_Intersects` sobre `geo.unidad_vecinal_vigente` y, en paralelo, el distrito por PIP.
  2. Si hay más de una UV → `en_limite = true` (gana la de menor id).
  3. Si no hay ninguna, busca la UV más cercana a 20 m o menos: primero un prefiltro en grados que
     usa GIST y después `ST_DWithin` sobre geography → `asignado_por_proximidad` + `distancia_m`.
  4. El distrito sale de la UV y, si no coincide con el del PIP, `distrito_discrepante = true`.
  5. Sin UV → `dentro_cobertura = false` (devuelve igual el distrito si lo encontró).
  - `manzana` es siempre `null` (obsoleto desde contracts 0.17.0).
- `capas.ts` (`CacheCapas`):
  - Lee la capa vigente desde `data/processed/<version>/<capa>/<capa>.web.geojson` o, si no existe,
    simplifica en PostGIS (`ST_SimplifyPreserveTopology`, tolerancia de 0,00003°).
  - Guarda el **texto** y su **huella** (SHA-256, 16 hex).
  - Arma el índice `geojson-vt` de **forma perezosa** con la primera tesela.
  - Si la capa supera `UMBRAL_TESELAS_BYTES` (5 MiB) se sirve por teselas: en los datos reales, las
    manzanas (≈15,5 MB) van por MVT [Doc].
  - Revisa la versión vigente cada 10 s, junto con `cargado_en`.
  - Deduplica las cargas que están en vuelo.
- `cache-corta.ts`: caché de un solo valor con stale-while-revalidate para los agregados por UV y
  los puntos críticos (TTL 100 s, edad máxima 120 s).
- `visibilidad.ts`: `SQL_AGREGADOS_UV`, que cuenta los publicados y saca la severidad máxima de los
  **verificados** aparte.

---

## 9. Database Architecture

### 9.1 Tecnología y acceso [C]

- **PostgreSQL 18 + PostGIS 3.6**. Hay dos esquemas: `public` y `geo`.
- Acceso con `pg.Pool` (`packages/db/src/cliente.ts`):
  - `statement_timeout` de 30 s;
  - `idle_in_transaction_session_timeout` de 60 s;
  - `connectionTimeoutMillis` de 10 s.
- Abstracción `Ejecutor` (`ejecutor.ts`): unifica `pg` y PGlite. `transaccion()` usa una conexión
  dedicada.
- Migraciones (`migrar.ts`):
  - archivos `NNNN_*.sql` aplicados **una por transacción**;
  - **advisory lock 4022**;
  - `statement_timeout = 0` y `lock_timeout = MIGRAR_LOCK_TIMEOUT_MS` (10 s);
  - registro en `_migraciones`;
  - opción `--hasta NNNN` para restauraciones y `--publicar-nuevos-existentes` (freno de la 0015).
- **El DDL vive en las migraciones SQL.** `src/esquema/index.ts` (Drizzle) es un espejo que
  `test/esquema-drizzle.test.ts` compara con una base migrada.

### 9.2 Tablas [C]

| Tabla | Propósito y columnas clave |
|---|---|
| `public.reporte_inundacion` | Reporte. Ver detalle abajo |
| `public.reporte_foto` | `objeto_key` único (`<uuid>.webp`), `mime`, `bytes`, `ancho`, `alto`, `exif_sanitizado`, `reporte_id` (nulo mientras no se asocia), `subido_por`, `creado_en` |
| `public.usuario` | `email` (índice único `lower(email)`), `nombre`, `rol` (`ciudadano`, `tecnico`, `ejecutivo`, `admin`), `password_hash` (Argon2id PHC o scrypt legado), `activo` |
| `public.sesion` | `id` (64 hex), `usuario_id`, `creado_en`, `expira_en` (tope absoluto), `ultimo_uso_en` (inactividad) |
| `public.intento_login` | `clave` hasheada (`email:` / `ip:` / `registro:`), `exito`, `creado_en`. Freno de fuerza bruta y tope de altas por IP |
| `public.idempotencia` | `clave` (`<usuario_id>:<clave>`), `huella`, `reporte_id`, `creado_en` |
| `public.cuota_reporte_diaria` | PK `(usuario_id, dia)`, `reportes_n`, `fotos_n` (CHECK ≥ 0), `actualizado_en` |
| `public.punto_critico` | `geom` (centroide exacto), `geom_publico` (centroide de puntos degradados), `n_reportes`, `primer_reporte_en`, `ultimo_reporte_en`, `severidad_max`, `distrito_id`, `unidad_vecinal_id`, `radio_m`, `diametro_m`, `advertencia_diametro`, `calculado_en` |
| `public.auditoria` | `entidad`, `entidad_id`, `accion`, `actor_id`, `antes`, `despues` (jsonb), `creado_en` |
| `public._migraciones` | Control de migraciones |
| `geo.capa_version` | `capa`, `version` (UNIQUE juntos), `fuente`, `fecha_vigencia`, `crs_origen`, `sha256_manifiesto`, `n_features`, `cargado_en`, `vigente` (índice único parcial: **una vigente por capa**), `activado_por`, `activado_en` |
| `geo.distrito_municipal`, `geo.unidad_vecinal`, `geo.manzana` | `id`, `codigo`, `nombre`, `geom MultiPolygon 4326` (GIST), `version_capa`, `fuente`, `fecha_vigencia`; UV con `distrito_id` y `distrito_inferido`; manzana con `distrito_id` y `unidad_vecinal_id`. PK `(id, version_capa)` |
| Vistas `geo.*_vigente` | JOIN con `capa_version` donde `vigente` |

**`reporte_inundacion`** (estado tras las migraciones 0001–0019):

- Geometría: `id uuid` (lo genera api-core), `geom Point 4326` exacta, `geom_publico` (redondeada a 5
  decimales y con jitter si es vivienda).
- Fechas: `creado_en`, `actualizado_en`, `publicar_en NOT NULL` (CHECK entre `creado_en` y
  `creado_en + 1 h`, sin DEFAULT desde la 0016) y `evento_en`.
- Ubicación administrativa: `autor_id`, `distrito_id`, `unidad_vecinal_id` (texto),
  `version_capa` y `resolucion_flags jsonb`.
- Cómo se ubicó: `ubicacion_metodo` (`gps`, `manual`, `aproximada`), `precision_gps_m`,
  `distancia_dispositivo_m` (CHECK 0–1000) y `ubicacion_tipo`.
- Contenido: `descripcion` (CHECK 10–1000), `profundidad_estimada`, `frecuencia`, `causa_presunta`,
  `sumidero_cercano`, `sumidero_estado` y `agua_brota_sumidero`.
- Severidad: `severidad_calculada`, `severidad_puntaje`, `severidad_version` (DEFAULT 2),
  `severidad_manual` y `severidad_motivo`.
- Moderación: `estado`, `estado_motivo`, `fusionado_en_id`, `punto_critico_id`, `validado_por` y
  `validado_en`.
- Antispam: `ip_hash`.
- CHECK de integridad:
  - `severidad_manual_con_motivo`;
  - `motivo_en_rechazo_y_duplicado` y `fusion_solo_en_duplicado` (0018, `NOT VALID` y validados solo
    si no hay filas que los violen).

### 9.3 Relaciones [C]

```text
usuario 1─N sesion                       (ON DELETE CASCADE)
usuario 1─N cuota_reporte_diaria         (CASCADE)
usuario 1─N reporte_inundacion.autor_id  (SET NULL)
usuario 1─N reporte_inundacion.validado_por (SET NULL)
usuario 1─N reporte_foto.subido_por      (SET NULL)
reporte_inundacion 1─N reporte_foto      (CASCADE)
reporte_inundacion N─1 reporte_inundacion.fusionado_en_id (self, SET NULL)
reporte_inundacion N─1 punto_critico     (SET NULL)
idempotencia.reporte_id → reporte_inundacion (CASCADE)
reporte_inundacion.distrito_id / unidad_vecinal_id → geo.*  ⚠ relación LÓGICA, sin FK
     (las capas tienen PK compuesta (id, version_capa); se une por (id, version_capa))
auditoria.actor_id, capa_version.activado_por → sin FK
```

### 9.4 Índices relevantes [C]

- GIST:
  - `reporte_geom_gist`;
  - `reporte_geom_publico_gist`: **parcial** con `estado IN ('nuevo','validado','resuelto')` e
    `INCLUDE (publicar_en)`;
  - `punto_critico_geom_gist` y `punto_critico_geom_publico_gist`;
  - GIST en `geom` de las tres capas.
- `reporte_agregado_uv`: parcial, de cobertura para los agregados (Index Only Scan).
- `reporte_estado_creado (estado, creado_en DESC)`; el índice `reporte_estado` se eliminó en la 0018
  por redundante.
- Índices parciales en todas las FK del lado que referencia (0006).
- Índices de mantenimiento: sesiones por caducar, fotos huérfanas, `ip_hash`, intentos e idempotencia.
- `reporte_sin_geom_publico` (pendientes de jitter).
- `cuota_reporte_diaria_dia`.

### 9.5 Historia de migraciones (resumen) [C]

| # | Cambio |
|---|---|
| 0001 | Esquema inicial (tirante/duración/afectación, sumidero de 3–4 valores, 3 roles) |
| 0002 | Índices de retención y del listado |
| 0003 | `intento_login`; `sesion.ultimo_uso_en` |
| 0004 | `idempotencia` |
| 0005 | `geom_publico` en reporte y punto crítico (cierra el oráculo de bbox y el centroide exacto) |
| 0006 | Índices de FK parciales |
| 0007 | Índice de cobertura de agregados por UV |
| 0008 | **Privilegios mínimos** para `curichi_api` y `curichi_geo` (por tabla) |
| 0009 | Cuentas ciudadanas; privilegios **por columna** en `usuario` (INSERT de email, nombre y password_hash; UPDATE de password_hash) |
| 0010 | Quita manzana, dirección, duración y afectación; severidad v2 recalculada |
| 0011 | `tirante` → `profundidad`; sumidero de 2 valores; rol `ejecutivo` |
| 0012 | `reporte_foto.subido_por` |
| 0013 | `distancia_dispositivo_m` |
| 0014 | `cuota_reporte_diaria` |
| 0015 | `publicar_en`; índices públicos con 3 estados; **freno** si quedan `nuevo` anteriores |
| 0016 | Contracción: borra `usuario.ultimo_reporte_en` y el DEFAULT de `publicar_en` |
| 0017 | `frecuencia` += `agua_estancada` |
| 0018 | CHECK de moderación; borra el índice redundante |
| 0019 | `ubicacion_metodo` += `aproximada` |

Cada migración desde la 0010 tiene su prueba `test/migracion-NNNN-*.test.ts` [C].

### 9.6 Seeds [C]

`sembrarSamples` (`packages/db/src/seeds/samples.ts`):

- Se niega a correr con `NODE_ENV=production`.
- Capas: carga las capas **sintéticas** de `data/samples/geo` solo si no hay una capa real vigente.
- Cuentas: crea `admin`, `tecnico`, `vecina` y `ejecutivo` en `@curichi.local`, cada una con la
  **contraseña igual al nombre de usuario** (o la de `SEED_*_PASSWORD`).
- Reportes:
  - siembra alrededor de 24 puntos, más focos, marcados `[muestra sintética]`, dentro de las UV
    vigentes;
  - rellena `geom_publico` y recalcula los puntos críticos.

### 9.7 Puntos críticos (§9.2) [C]

- **Recálculo completo** (`recalcularPuntosCriticos`):
  - usa `ST_ClusterDBSCAN(ST_Transform(geom, CRS_METRICO_EPSG), eps 25 m, minpoints 1)` sobre los
    `validado` y `resuelto`;
  - si PostGIS no tiene la función, cae a un DBSCAN equivalente en Node;
  - se serializa con el advisory lock 4021.
- **Recálculo incremental** (`recalcularEntornoDeReporte`):
  - recorre solo la componente conexa afectada, con la misma métrica y el mismo lock;
  - si supera 5000 nodos, se marca `desbordado` y lo termina el mantenimiento.
- El centroide **público** es la media de los `geom_publico` de los miembros; si falta alguno, no se publica.

---

## 10. Authentication & Authorization

### 10.1 Autenticación [C]

- **Autenticación propia de api-core**, sin proveedor externo.
- **Sesión por cookie**:
  - nombre `curichi_sesion`: 64 hex aleatorios, `HttpOnly`, `SameSite=Lax`, `Path=/`;
  - `Secure` si `COOKIE_SEGURA=1`, obligatorio en producción;
  - caduca a los `SESION_DIAS` (7) o tras `SESION_IDLE_HORAS` (12) de inactividad.
- **Login** (`POST /api/v1/auth/login`):
  1. `LoginSchema`: si el usuario no trae `@`, se completa con `@curichi.local`.
  2. Freno de fuerza bruta **consultado antes de verificar** la contraseña: 10 fallos por cuenta y 30
     por IP en 15 min, en la base.
  3. `verificarPassword` (Argon2id en workers) con un **hash señuelo** si el usuario no existe, para
     igualar los tiempos.
  4. Rehash transparente de scrypt a Argon2id.
  5. **Rotación de sesión**: se borra la sesión previa de la cookie.
  6. Auditoría `login`.
- Topes en memoria: `LOGIN_PETICIONES_POR_VENTANA` (20/15 min por IP).
- **Registro** (`POST /api/v1/auth/registro`):
  - el rol siempre es `ciudadano` (el esquema no tiene campo de rol y la base no permite escribir la columna);
  - la respuesta es **idéntica** exista o no el correo, y **no inicia sesión**;
  - topes por IP: 10 por ventana en memoria, 5/h y 10/día en la base, con un advisory lock por IP.
- **Cuentas de staff**: se crean solo por CLI con el rol dueño (`pnpm --filter db cuentas -- crear …`).
  Nunca por la API.
- **Hash de contraseñas**:
  - Argon2id con m=19 MiB, t=2, p=1;
  - 2 workers y una cola de 128 (`PASSWORD_WORKERS`, `PASSWORD_COLA_MAX`);
  - si la cola se llena, la verificación da `false`.

### 10.2 Autorización [C]

- `requerirRol(...roles)` en el `preHandler` de cada ruta protegida.
- El autor de un reporte sale **siempre** de `req.usuario`.
- Transiciones de estado: `TRANSICIONES` de contracts.
  - `transicionExiste` distingue el 403 (permiso) del 409 (transición imposible).

| Recurso | Sin sesión | ciudadano | ejecutivo | técnico | admin |
|---|---|---|---|---|---|
| Mapa y lecturas públicas | ✔ | ✔ | ✔ | ✔ | ✔ |
| Crear reporte / subir foto / mis reportes | 401 | ✔ | ✔ | ✔ | ✔ |
| `/tecnico/reportes*`, moderación, `/exportar`, `/indicadores`, `GET /admin/capas` | 401 | 403 | 403 | ✔ | ✔ |
| `validado → rechazado` (retirar), `rechazado → nuevo` (reabrir) | — | — | — | 403 | ✔ |
| `POST /admin/capas/:id/activar` | 401 | 403 | 403 | 403 | ✔ |
| `/ejecutivo/resumen` | 401 | 403 | ✔ | ✔ | ✔ |
| Fotos (`GET /fotos/:key`) | Las de reportes públicos | + las suyas en cualquier estado | ídem | + las de reportes publicados en cualquier estado | ídem |

- Máquina de estados (`packages/contracts/src/esquemas/reporte.ts`):
  - `nuevo → validado | rechazado | duplicado` (técnico, admin);
  - `validado → resuelto | duplicado` (técnico, admin) y `validado → rechazado` (solo admin);
  - `rechazado → nuevo` (solo admin);
  - `duplicado` y `resuelto` son finales.
  - Exigen motivo: `nuevo` (reabrir), `rechazado`, `resuelto` y `duplicado`.
  - El canónico de una fusión debe estar `validado`, publicado y no ser el mismo reporte.
- **Nadie modera un reporte antes de su `publicar_en`**: todas las rutas de moderación filtran con
  `condicionPublicado` y responden 404.

---

## 11. Main User Flows

### 11.1 Ver el mapa (sin cuenta) [C]

1. `GET /` (Next): el layout pide la ciudad en el servidor (`GET {API_CORE_URL}/api/v1/configuracion`).
2. `VistaMapa` (cliente) hace en paralelo:
   - `GET /api/v1/reportes?bbox&limite=300`;
   - `GET /geo/v1/capas`;
   - `GET /geo/v1/agregados/unidades-vecinales`.
   - Las teselas base salen de `tile.openstreetmap.org`.
3. Al hacer clic en un punto, `GET /api/v1/reportes/:id` → `HojaDetalle` con:
   - distrito y UV;
   - severidad (con color, etiqueta y barras);
   - estado público («NO SE HA VERIFICADO», «Verificado» o «Resuelto»);
   - descripción y fotos (`GET /api/v1/fotos/<key>`).

### 11.2 Crear cuenta e iniciar sesión [C]

- `/crear-cuenta` → `POST /api/v1/auth/registro` → 201 `CUENTA_LISTA`. El correo pasa al login por
  sessionStorage.
- `/ingresar?volver=/reportar` → `POST /auth/login` → cookie → `invalidateQueries(['yo'])` →
  redirección a la ruta interna validada.

### 11.3 Reportar un punto [C]

```text
/reportar ─► refrescarSesion (/auth/yo: reportes_restantes_hoy, demora_proximo_s)
   ├─ sin sesión → AccesoRequerido (Iniciar sesión / Crear cuenta)
   ├─ cupo 0 → CupoAgotado (puede_reportar_desde)
   └─ Paso 1: «Compartir mi ubicación» → ControladorUbicacion.compartir() (watchPosition)
         ├─ precisión ≤ 50 m → ancla → mapa con círculo de 60 m; punto ajustable
         │     (arrastrar, flechas, «mover 5 m», coordenadas escritas)
         ├─ imprecisa → «Reportar con ubicación aproximada» (ADR 0007): punto libre dentro de la ciudad
         └─ «Usar ubicación de prueba (Santa Cruz)»: posición simulada de 5 m de precisión  ⚠ ver §27
       Previsualización: POST /geo/v1/resolver (600 ms de espera, abortable) → UV/distrito o «fuera del municipio»
   Paso 2–3: profundidad (tarjetas), frecuencia, sumidero (sí/no → ¿tapado? → ¿brota?), causa,
             tipo de ubicación, descripción (10–1000), fecha del evento; fotos:
             CamaraReporte (getUserMedia) → File → validación local → POST /api/v1/fotos (multipart)
             → { objeto_key } (hasta 3). Borrador en sessionStorage.
   Paso 4: revisión → Enviar:
             relee la posición (ubicador.releer) → decidirEnvio: vencida | movido | ok
             → DispositivoCongelado (los reintentos repiten el mismo dispositivo)
             → POST /api/v1/reportes  (Idempotency-Key fija por formulario)
             → 201 MiReporte { publicar_en, segundos_para_publicar } → Confirmación + CuentaRegresiva
             → invalida ['yo'], ['mis-reportes'], ['reportes'], ['agregados']
   Errores: 401 → «se cerró tu sesión» (el borrador se conserva); 422 de ubicación → vuelve al paso 1;
            429 de cuota → mensaje del servidor; 422 FUERA_DE_COBERTURA; 503 → reintentar.
```

### 11.4 Seguir mis reportes [C]

- `/mis-reportes` → `GET /api/v1/mis-reportes` (máximo 50, cualquier estado, `private, no-store`).
- Muestra la cuenta regresiva hasta `publicar_en` y si el reporte fue retirado.
- `AvisoPuntoResuelto` avisa cuando un reporte propio pasó a `resuelto`.

### 11.5 Moderar (técnico o admin) [C]

1. `/login` del panel → `/reportes`.
2. Bandeja: `GET /api/v1/tecnico/reportes` cada 10 s, con filtros en la URL, interruptor de «área del
   mapa» (`bbox`) y clic en una zona → filtro con el id real.
3. Detalle `/reportes/[id]` → `PanelAcciones`:
   - validar: `PATCH estado {validado}`;
   - rechazar o resolver: con motivo;
   - fusionar: `POST /fusionar {canonico_id, motivo}`, eligiendo entre `CandidatosFusion` cercanos;
   - reclasificar: `PATCH severidad`;
   - admin: retirar (`validado → rechazado`) y reabrir.
4. En el servidor (`cambiarEstado`):
   - `FOR UPDATE` del reporte y del canónico, en orden de id;
   - comprueba la transición y el rol;
   - UPDATE y auditoría `estado:a->b`;
   - reapunta los duplicados con auditoría `fusion:reapuntar`;
   - COMMIT;
   - recalcula los puntos críticos del entorno si el cambio toca `validado` o `resuelto`;
   - invalida los cálculos de indicadores y del resumen ejecutivo que estén en vuelo.

### 11.6 Exportar, ver indicadores, ejecutivo y capas [C]

- **Exportar** (técnico, admin): `GET /api/v1/exportar?formato=csv|geojson&filtros`.
  - Usa la vista técnica, hasta 50 000 filas, `nota_metodologica`, `total`, `exportados` y `truncado`.
  - El CSV lleva BOM, comentario inicial y **neutralización de fórmulas**.
- **Indicadores**: `GET /api/v1/indicadores?severidad&distrito_id` → tortas por distrito y por UV
  (las 8 mayores y «Otros»).
- **Ejecutivo**:
  - `GET /api/v1/ejecutivo/resumen?ventana=todo`, cada 10 s;
  - devuelve activas (nuevo + validado), resueltas, por estado y por distrito;
  - `ultimo_reporte_en` va **truncado al minuto**.
  - El mapa usa la ruta **pública** de reportes.
- **Capas** (admin): `GET /admin/capas` → `POST /admin/capas/:id/activar`.
  - En una transacción: desmarca las vigentes, marca la elegida y escribe la auditoría.
  - Después invalida la caché de geo-service con `POST /geo/v1/capas/invalidar` y el token.

### 11.7 Cargar capas del municipio (operador) [C]

```text
pnpm etl:inspect -- --version DM_UV_MZ_2025   (CRS, campos, nulos, bbox)
pnpm etl:run     -- --version DM_UV_MZ_2025   (mapshaper -proj wgs84, validación/reparación -clean
                                              verificada por área, normalización, ids estables,
                                              web.geojson simplificado, reporte_calidad.md/json, metadata.json)
pnpm etl:load    -- --version DM_UV_MZ_2025   (una transacción para todas las capas; ST_MakeValid;
                                              capa_version vigente=false, salvo en el arranque sin
                                              vigente → activa y audita sin actor)
```

---

## 12. Main Technical Flows

### 12.1 `POST /api/v1/reportes` paso a paso [C]

1. Rate limit por IP: `RATE_LIMIT_REPORTES_POR_HORA` (10/h).
2. `requerirRol` con los cuatro roles. Sin sesión → 401.
3. `ReporteCrearSchema.safeParse`. Si falla → 400 `PAYLOAD_INVALIDO` con `detalles[]`.
4. `revisarDispositivo`. Si falla → 422, **sin gastar cupo**:
   - `PRECISION_INSUFICIENTE`;
   - `UBICACION_PRECISA_DISPONIBLE`;
   - `POSICION_VENCIDA`;
   - `UBICACION_FUERA_DE_RADIO`.
5. `resolver.resolver(lat, lon, requestId)` → geo-service. Fuera de cobertura → 422 `FUERA_DE_COBERTURA`.
6. Valida `Idempotency-Key`; calcula la huella del payload sin `dispositivo`, `calcularSeveridad`,
   `ipHashDiario`, `randomUUID` y `coordenadaPublica` (jitter con `id|JITTER_SAL`).
7. `BEGIN`. Luego `reclamarClave`:
   - si es una repetición → devuelve el mismo reporte con `Idempotent-Replay: true`;
   - si choca o está en curso → 409.
8. `reservarTurnoDeReporte`: sin cupo → 429 `CUOTA_DE_REPORTES` + `Retry-After` hasta la medianoche
   local. La demora es de 60 s si `n = 1` y de 240 s si no.
9. `INSERT reporte_inundacion` con `publicar_en = now() + demora`.
10. Asocia las fotos (de la misma cuenta, de menos de 24 h y sanitizadas). Si no se asocian todas →
    ROLLBACK, 400 `FOTOS_INVALIDAS`, y el cupo se devuelve.
11. `INSERT auditoria` (sin la posición del dispositivo), `anotarResultado` y `COMMIT`.
12. Relee por la **misma conexión** (evita el bloqueo mutuo del pool) → 201 `vistaMiReporte`.

### 12.2 Fotos [C]

- **Subida**:
  1. Guarda de disco: si falta espacio → 507 `SIN_ESPACIO`.
  2. Reserva el turno diario de foto (12): sin cupo → 429 `CUOTA_DE_FOTOS`.
  3. Multipart de 8 MB como máximo.
  4. **Magic bytes** (JPEG, PNG, WebP; si no → 415).
  5. Lee la **cabecera** de la imagen: más de 60 MP → rechazo.
  6. sharp con un plazo de 10 s, `rotate`, máximo 1600 px por lado, WebP con calidad 80 y **sin
     metadatos**.
  7. Doble verificación: `metadata()` y el recorrido de los trozos RIFF (sin EXIF, XMP, ICCP ni animación).
  8. INSERT de la fila y después `almacen.guardar`. Si falla el almacén, se borra la fila.
  9. Si la foto no llegó a guardarse, se devuelve el turno.
- `sharp.block` desactiva los cargadores de libvips que no se usan (HEIF, GIF, TIFF, SVG, PDF, JXL,
  Magick…). `sharp.concurrency(2)` y `cache(false)`.
- **Servido**: `modoDeFoto` decide `publica` (`public, no-cache` + ETag), `privada`
  (`private, no-store`) o 404. La visibilidad se decide antes de mirar `If-None-Match`.

### 12.3 Visibilidad y publicación diferida [C]

- No hay ningún proceso que «publique»: la visibilidad es el **filtro** `publicar_en <= now()`.
- Vistas:
  - **Público**: `estado IN ('nuevo','validado','resuelto') AND publicar_en <= now()` y además
    `geom_publico IS NOT NULL`.
  - **Técnico, exportación, indicadores y ejecutivo**: `publicar_en <= now()`, en cualquier estado.
  - **Autor**: cualquier estado, sin filtro.

### 12.4 Privacidad geográfica [C]

- **Jitter**:
  - determinista (FNV-1a sembrado con `id|JITTER_SAL`), uniforme en un disco de 30 m;
  - solo para `vivienda_o_predio`;
  - todas las coordenadas públicas se redondean a 5 decimales;
  - se calcula **una vez** al crear y se guarda en `geom_publico`.
- El filtro bbox público usa `geom_publico`, para que no sirva de oráculo de la posición exacta.
- Los puntos críticos publican el centroide de los puntos degradados y **no** publican `radio_m`,
  `diametro_m` ni `advertencia_diametro`.
- La posición del dispositivo no se guarda, no se audita y se redacta en los logs (`redact` de
  `dispositivo`).

### 12.5 Caché y tráfico [C]

| Respuesta | Cache-Control |
|---|---|
| api-core por defecto | `private, no-store` + `Vary: Cookie` |
| Listado y detalle públicos | `public, no-cache` |
| Configuración | `public, max-age=300` |
| Fotos públicas | `public, no-cache` + ETag |
| geo-service: capas y teselas con huella | `immutable` 1 año; con huella vieja → `410 CAPA_CAMBIO`; alias sin huella → `no-cache` + ETag/304 |

- Agregados por UV y puntos críticos: caché en memoria SWR de 100/120 s.
- Indicadores y resumen ejecutivo: **sin caché**, solo se deduplican los cálculos en vuelo por clave
  de filtros, con un contador de «generación» que invalida al moderar.
- La página pública no hace tráfico automático. El panel sondea cada 10 s.

### 12.6 Mantenimiento periódico [C]

Cada 6 h, en una sola réplica (lock 4023):

- relleno de `geom_publico`;
- recálculo de puntos críticos si hace falta;
- borrado de sesiones caducadas;
- `ip_hash` a `NULL` pasados 30 días;
- borrado de fotos huérfanas de más de 24 h (fila y objeto);
- borrado de intentos de login y de claves de idempotencia de más de 24 h;
- borrado de las cuotas de días anteriores (en la zona de la ciudad).

### 12.7 Comunicación entre servicios [C]

- **Navegador → Next**: mismo origen. El proxy de Next reenvía a api-core y geo-service por las URL
  de entorno.
- **api-core → geo-service**:
  - `fetch` directo a `GEO_SERVICE_URL`, con `x-token-interno` en **todas** las llamadas, para quedar
    fuera del cupo por IP;
  - propaga `x-request-id`;
  - plazo de 5 s (resolver) y de 3 s (invalidar).
- **Readiness**: `/ready` de api-core consulta la base, el `/health` de geo-service y el almacén de
  fotos. Solo la base lo pone en 503; lo demás lo deja en `degradado: true`.

---

## 13. API Architecture

**Estilo**: REST con JSON y GeoJSON, versionado en el prefijo (`/api/v1`, `/geo/v1`). Los errores
son `{ codigo, mensaje, detalles? }` con códigos estables en mayúsculas. OpenAPI 3.1 generado en
`packages/contracts/openapi/openapi.yaml` (5012 líneas; el CI comprueba que está al día) [C].

### 13.1 api-core (`/api/v1`) [C]

| Método y ruta | Auth | Rate limit | Notas |
|---|---|---|---|
| `POST /auth/registro` | — | 10/ventana (memoria) + 5/h y 10/día en la base | 201 idéntico; 429 `DEMASIADAS_CUENTAS` |
| `POST /auth/login` | — | 20/15 min (memoria) + freno en la base | 401 `CREDENCIALES_INVALIDAS`; 429 `DEMASIADOS_INTENTOS` |
| `POST /auth/logout` | cookie | — | 204, borra la sesión |
| `GET /auth/yo` | sesión | — | `SesionActual` + cupo + `panel_url` (solo roles del panel) |
| `GET /configuracion` | — | 240/min | Ciudad |
| `POST /reportes` | 4 roles | 10/h | Ver §12.1 |
| `GET /reportes` | — (no mira la sesión) | 240/min | Vista pública, filtros, paginación (máximo 500) |
| `GET /reportes/:id` | — | 240/min | UUID o ID corto; 404 si no es público |
| `GET /mis-reportes` | 4 roles | 240/min | Vista del autor |
| `GET /tecnico/reportes`, `/tecnico/reportes/:id` | técnico, admin | 240/min | Vista técnica |
| `PATCH /reportes/:id/estado` | técnico, admin | — | `ReporteCambiarEstadoSchema` |
| `POST /reportes/:id/fusionar` | técnico, admin | — | `canonico_id` UUID o ID corto |
| `PATCH /reportes/:id/severidad` | técnico, admin | — | `severidad_manual` + motivo, o `null` |
| `POST /fotos` | 4 roles | 30/h | Multipart `archivo` |
| `GET /fotos/:key` | opcional | 240/min | `modoDeFoto` |
| `GET /exportar` | técnico, admin | — | CSV o GeoJSON |
| `GET /indicadores` | técnico, admin | — | Filtros `severidad` y `distrito_id` |
| `GET /ejecutivo/resumen` | ejecutivo, técnico, admin | — | `ventana=7d\|30d\|todo` |
| `GET /admin/capas` | técnico, admin | — | Versiones |
| `POST /admin/capas/:id/activar` | admin | — | Auditoría + invalidación |
| `GET /health`, `GET /ready` | — | `/ready` 60/min | |
| `GET /metrics` | token | — | Prometheus |
| `GET /docs` | — | — | Solo fuera de producción |

### 13.2 geo-service (`/geo/v1`) [C]

| Ruta | Notas |
|---|---|
| `POST /resolver` | PIP; 120/min por IP, salvo las internas |
| `GET /capas`, `GET /capas/vigentes` | Lista con `url` con huella / versión por capa |
| `GET /capas/{capa}/v/{huella}` | GeoJSON web; `immutable`; 410/413 |
| `GET /capas/{capa}` | Alias sin huella |
| `GET /teselas/{capa}/{huella}/{z}/{x}/{y}.mvt` (y sin huella) | MVT al vuelo; 204 si está vacía |
| `GET /agregados/unidades-vecinales` | Caché SWR |
| `GET /puntos-criticos?bbox=` | Máximo 5000, caché SWR, solo `geom_publico` |
| `POST /capas/invalidar` | **Interna** (token o loopback); Caddy la corta con 404 |
| `GET /health`, `/ready`, `/metrics` | |

### 13.3 DTOs y esquemas (contracts) [C]

| Ámbito | Esquemas |
|---|---|
| Reportes | `ReporteCrearSchema`, `DispositivoSchema`, `ReporteFiltrosSchema`, `ReportePublicoSchema`, `ReporteTecnicoSchema`, `MiReporteSchema` y sus `*FeatureCollection` |
| Moderación | `ReporteCambiarEstadoSchema`, `ReporteReclasificarSchema`, `ReporteFusionarSchema` |
| Fotos | `FotoSubidaSchema` |
| Auth | `LoginSchema`, `RegistroSchema`, `UsuarioSchema`, `SesionActualSchema` |
| Administración | `CapaVersionSchema`, `ExportarQuerySchema`, `ExportacionGeoJsonSchema`, `IndicadoresFiltrosSchema`, `IndicadoresSchema`, `ReadyApiCoreSchema` |
| Ejecutivo | `ResumenEjecutivoQuerySchema`, `ResumenEjecutivoSchema` (con refinamientos de cuadre) |
| Geo | `ResolverEntradaSchema`, `ResolverRespuestaSchema`, `CapaInfoSchema`, `AgregadoUvSchema`, `PuntoCriticoSchema`, `HuellaCapaSchema`, `CapasVigentesSchema` |
| Configuración | `ConfiguracionPublicaSchema`, `CiudadSchema` |

---

## 14. Important Components

| Componente | Ubicación | Rol |
|---|---|---|
| `FormularioReporte` | `apps/web-ciudadano/src/componentes/FormularioReporte.tsx` | Orquesta los 4 pasos, la ubicación, las fotos, el borrador, el envío idempotente y los errores |
| `PedirUbicacion` | `…/componentes/PedirUbicacion.tsx` | Estados de la ubicación; botones compartir, aproximada y **prueba** |
| `CamaraReporte` | `…/componentes/CamaraReporte.tsx` | Diálogo de cámara (`getUserMedia`), captura a File, foco atrapado |
| `Mapa` (público) | `…/componentes/Mapa.tsx` | MapLibre: base OSM, capas con huella, clusters, selección, círculo de 60 m |
| `VistaMapa` | `…/componentes/VistaMapa.tsx` | Filtros, búsqueda, listado, detalle seleccionado por su propia consulta |
| `HojaDetalle` | `…/componentes/HojaDetalle.tsx` | Detalle público y botón al panel para staff |
| `Protegido` | `apps/panel-admin/src/lib/sesion.tsx` | Puerta de sesión y rol del panel |
| `PanelAcciones` | `apps/panel-admin/src/componentes/PanelAcciones.tsx` | Moderación |
| `CandidatosFusion` | `…/componentes/CandidatosFusion.tsx` | Fusión con validados cercanos |
| `PanelEjecutivo` | `…/componentes/ejecutivo/PanelEjecutivo.tsx` | Pantalla ejecutiva |
| `TortaReportes` | `…/componentes/indicadores/TortaReportes.tsx` | Tortas de indicadores |
| `ReporteUnitarioModal` | `…/componentes/ReporteUnitarioModal.tsx` | Ficha imprimible |

---

## 15. Important Services

| Servicio / módulo | Ubicación | Rol |
|---|---|---|
| `crearApp` (api-core) | `services/api-core/src/app.ts` | Composición de Fastify, seguridad y errores |
| Rutas de reportes | `services/api-core/src/rutas/reportes.ts` | Creación transaccional y lecturas público/técnico/autor |
| Moderación | `services/api-core/src/rutas/moderacion.ts` | Máquina de estados con bloqueo y recálculo |
| Fotos | `services/api-core/src/rutas/fotos.ts` | Saneamiento y servido |
| Auth | `services/api-core/src/rutas/auth.ts` + `auth.ts` | Registro, login, sesión, `/yo` |
| Admin | `services/api-core/src/rutas/admin.ts` | Exportación, indicadores, capas |
| Cupo | `services/api-core/src/cuota.ts` | Cupo diario atómico |
| Mantenimiento | `services/api-core/src/mantenimiento.ts` | Retención y recálculos |
| Resolver PIP | `services/geo-service/src/resolver.ts` | §7.4 |
| `CacheCapas` | `services/geo-service/src/capas.ts` | Capas, huella y teselas |
| Migraciones | `packages/db/src/migrar.ts` | Runner con locks |
| Puntos críticos | `packages/db/src/puntos-criticos*.ts` | DBSCAN completo e incremental |
| Contraseñas | `packages/db/src/password.ts` | Argon2id en workers |
| Freno de login | `packages/db/src/intentos-login.ts` | Fuerza bruta y altas por IP |
| ETL | `pipelines/geodata-etl/src/pipeline.ts`, `pasos/cargar.ts` | Procesado y carga |

---

## 16. Data Models

### 16.1 Enums de dominio (contracts `enums.ts`) [C]

| Enum | Valores |
|---|---|
| `PROFUNDIDADES` | `tobillo`, `rodilla`, `muslo`, `mas_70` |
| `FRECUENCIAS` | `primera_vez`, `ocasional`, `cada_lluvia_fuerte` («Solo cuando llueve fuerte»), `permanente` («Cada lluvia»), `agua_estancada` |
| `CAUSAS_PRESUNTAS` | 7 valores, incluido `desconocida` («No sé») |
| `SEVERIDADES` | `baja`, `media`, `alta`, `critica` |
| `ESTADOS_REPORTE` | `nuevo`, `validado`, `duplicado`, `rechazado`, `resuelto` |
| `ESTADOS_PUBLICOS` | `nuevo`, `validado`, `resuelto` |
| `ESTADOS_VERIFICADOS` | `validado`, `resuelto` |
| `ESTADOS_RETIRADOS` | `rechazado`, `duplicado` |
| `ROLES` | `ciudadano`, `tecnico`, `admin`, `ejecutivo` |
| `ROLES_DEL_PANEL` | `tecnico`, `admin`, `ejecutivo` |
| `UBICACION_METODOS` | `gps`, `manual`, `aproximada` |
| `UBICACION_TIPOS` | `via_publica`, `vivienda_o_predio`, `otro` |
| `SUMIDERO_CERCANO` | `si`, `no` |
| `SUMIDERO_ESTADOS` | `tapado`, `no_tapado` |
| `TIPOS_CAPA` | `distrito_municipal`, `unidad_vecinal`, `manzana` |

### 16.2 Severidad v2 (`severidad.ts`) [C]

- `puntaje = 2·P + F`:
  - P: tobillo 1, rodilla 2, muslo 3, más de 70 cm 4;
  - F: primera vez 1, ocasional 2, cada lluvia fuerte 3, permanente 4, agua estancada 5.
- Bandas: 3–4 baja · 5–7 media · 8–10 alta · 11–13 crítica.
- Reglas: **E1** (P = 4 → crítica) y **E3** (F ≥ 4 → mínimo media; en la práctica no se dispara).
- `SEVERIDAD_VERSION = 2` se guarda en cada reporte.
- La severidad efectiva es `COALESCE(severidad_manual, severidad_calculada)`.

### 16.3 Constantes de dominio (`CONFIG_DOMINIO`) [C]

| Grupo | Constantes |
|---|---|
| Radios | Recurrencia 25 m (advertencia de diámetro 100 m) · jitter 30 m · 5 decimales públicos · tolerancia de hueco 20 m · CRS métrico 32720 |
| Dispositivo | Radio 60 m (+0,5 m) · precisión 50 m · antigüedad 600 s |
| Fotos | 8 MB · 3 por reporte · JPEG/PNG/WebP de entrada → WebP con calidad 80, 1600×1600 |
| Cupos | 10 reportes/h por IP · 3 reportes y 12 fotos por día y cuenta · 10 altas por día e IP |
| Publicación | Demoras de 60 y 240 s · `MIS_REPORTES_MAX` 50 |
| Formularios | Contraseña de 10 a 200 caracteres · descripción de 10 a 1000 · evento hasta 10 min en el futuro y 365 días atrás |
| Exportación y retención | Exportación de 50 000 filas · `ip_hash` 30 días |
| Ciudad | Zona horaria `America/La_Paz` · ciudad por defecto Santa Cruz (centro -63.18/-17.78, zoom 13) |

---

## 17. External Integrations

| Integración | Uso | Notas |
|---|---|---|
| OpenStreetMap tile server | Mapa base raster en las dos apps | **Solo desarrollo** según su política; en producción hace falta otra fuente (Protomaps u OpenFreeMap, `<a confirmar>`) [C/Doc] |
| Geolocation API / MediaDevices (`getUserMedia`) | Ubicación y cámara en el navegador | Se piden solo dentro del flujo de reporte [C] |
| S3 compatible (MinIO en desarrollo, S3/R2 en producción) | Fotos, si hay `S3_ENDPOINT` | Firma SigV4 propia [C] |
| S3 externo (rclone) | Respaldos cifrados (perfil `respaldos`) | [C por Compose/Dockerfile; contenido del script no revisado en detalle] |
| Let's Encrypt / ZeroSSL (ACME vía Caddy) | Certificados con `PROXY_TLS=acme` | [C] |
| Cloudflare quick tunnels (`cloudflared`) | «Compartir con amigos» desde el lanzador | Solo pruebas; IP compartida para los límites [Doc] |
| Webhook de Alertmanager / latido externo de respaldos | Alertas | Opcional [C por `.env.example`] |
| GitHub Container Registry | Imágenes publicadas por el CI | [C por el CI] |

No hay geocodificación, ni notificaciones (correo/SMS/push), ni proveedores de identidad externos [C].

---

## 18. State Management

| Dónde | Mecanismo |
|---|---|
| Servidor (verdad) | PostgreSQL. Visibilidad, cupos, sesiones e idempotencia viven **en la base**, para que valgan con varias réplicas [C] |
| api-core en memoria (por proceso) | Contadores de rate limit de `@fastify/rate-limit` · cálculos de indicadores y resumen en vuelo · cola de workers de hashing · métricas [C] |
| geo-service en memoria (por proceso) | `CacheCapas` (texto, huella, índice de teselas) · `CacheCorta` de agregados y puntos críticos · versión vigente (10 s) [C] |
| Frontends | TanStack Query (estado de servidor) · `useState` y `useSyncExternalStore` · contextos `ProveedorCiudad`, `ProveedorToast`, `ContextoUsuario` (panel) · sessionStorage (borrador) · localStorage (resueltos vistos) · cookie HttpOnly (sesión, invisible para JS) [C] |
| Caché del navegador / SW | Capas y teselas con huella, estáticos [C] |

---

## 19. Error Handling

- **api-core**: manejador único (§8.1).
  - Los 4xx de las rutas devuelven `{codigo, mensaje, detalles?}` con códigos del dominio.
  - Los 5xx se diferencian entre **503 transitorio** (base o geo-service) y **500** (defecto), con el
    detalle solo en el log.
  - Las transacciones hacen `ROLLBACK` con un `.catch` que conserva el error original.
- **geo-service**: 503 si vence el `statement_timeout`. `/ready` no expone el mensaje de `pg`.
- **Recálculo de puntos críticos** después de moderar: si falla, **no** convierte la moderación en
  error. Borra el punto afectado para que lo rehaga el mantenimiento y lo registra en métricas.
- **Frontends**:
  - `ErrorApi` y `errores.ts` traducen los códigos (`CUOTA_DE_REPORTES`, 422 de ubicación,
    `SIN_SESION`, `NO_DISPONIBLE`, …) a mensajes en español.
  - `ErrorDeCarga` con reintento.
  - `error.tsx` y `global-error.tsx`.
  - Un 401 a mitad del formulario conserva el borrador.
  - En el panel, un 401 dispara `curichi:sesion-caducada`.
- **Fotos**: los mensajes de libvips nunca llegan al usuario (`mensajePublicoDeImagen`).

---

## 20. Security Model

Resumen de cómo funciona hoy la seguridad (no es una auditoría) [C, salvo indicación]:

| Tema | Implementación actual |
|---|---|
| Separación público/técnico | Rutas distintas (`/reportes` frente a `/tecnico/reportes`). El handler público no lee la sesión. Las lecturas públicas del front van con `credentials: 'omit'` |
| Vista pública | Sin autor; jitter en vivienda; 5 decimales; bbox sobre `geom_publico`; puntos críticos sin medidas exactas |
| Auth | Argon2id en workers, hash señuelo, freno de fuerza bruta en la base, rotación de sesión, doble caducidad, cookie HttpOnly/Lax/Secure, sin tokens en JS |
| Autorización | `requerirRol` por ruta; transiciones por rol en contracts; autor desde la sesión; rol nunca desde la API |
| Base de datos | Roles `curichi_api` (DML por tabla y por columna en `usuario`), `curichi_geo` (SELECT), `curichi` (dueño, solo migraciones/ETL/seeds). Los servicios verifican sus privilegios al arrancar. Matriz comprobable con `pnpm privilegios` |
| SQL | Parametrizado. Los literales de estado se generan desde constantes y se validan con regex |
| Validación | Zod de contracts en el servidor, en todas las entradas. Topes de negocio con 422 propios |
| Antiabuso | Cupos diarios por cuenta en la base; rate limits por IP (en memoria por proceso); tope de altas por IP en la base; honeypot `sitio_web`; idempotencia por cuenta; `ip_hash` diario con sal |
| Fotos | Magic bytes, tope de MP en la cabecera, cargadores de libvips bloqueados, plazo, WebP sin metadatos con doble verificación, nombres generados por el servidor, foto sin reporte visible solo para quien la subió |
| Cabeceras | Apps: CSP con nonce y `strict-dynamic` (style-src con `unsafe-inline`), `X-Frame-Options DENY`, `Permissions-Policy`, nosniff, Referrer-Policy, HSTS (en el proxy con ACME). APIs: CSP `default-src 'none'`, nosniff, DENY, CORS con orígenes exactos y credenciales |
| IP real | Caddy reescribe `X-Forwarded-For` con `{client_ip}` y borra las demás. Las apps borran las cabeceras de reenvío si no hay proxy de confianza. Servicios con `TRUST_PROXY=1` en Docker |
| Logs | Pino JSON; IP hasheada; `redact` de `dispositivo`; sin cabeceras; CLI de migraciones y cuentas con formato pino |
| Secretos | Variables de entorno; `.env` en `.gitignore`; escaneo propio (`scripts/buscar-secretos.mjs`) en el pre-commit y en el CI; gitleaks del historial en el CI; producción se niega a arrancar con valores de ejemplo |
| Cadena de suministro | Cuarentena de 24 h en pnpm, `allowBuilds` explícito, overrides de transitivas vulnerables, `pnpm audit --audit-level high` en el CI, imágenes por digest, Trivy, Dependabot con cooldown de 7 días |
| Contenedores | `read_only`, tmpfs, sin capabilities, `no-new-privileges`, tope de procesos, `USER node`, tini [C por Compose/Dockerfile; no se ejecutó] |
| Rutas internas | `/geo/v1/capas/invalidar` con token comparado en tiempo constante y cortada por Caddy; `/_next/image` cortado por Caddy |
| Redirecciones | `?volver=` acepta solo rutas internas (rechaza `//` y `/\`) |

Documentos de referencia: `SECURITY.md`, `docs/seguridad/modelo-de-seguridad.md`,
`docs/seguridad/auditoria-2026-09.md` (con riesgos residuales y comprobaciones no hechas) y
`docs/seguridad/checklist-pr.md`.

---

## 21. Testing

| Tipo | Herramienta | Dónde | Qué cubre |
|---|---|---|---|
| Unitarias y de contrato | Vitest | `packages/contracts/test/` (17 archivos) | Severidad, esquemas, jitter, cada versión del contrato (0.5 → 0.18), nota metodológica |
| Integración de base | Vitest + **PGlite** (PostGIS en WASM, en memoria) | `packages/db/test/` (25) | Runner de migraciones, una prueba por migración (0010–0019), esquema Drizzle frente a la base, contraseñas, cuentas CLI, privilegios (matriz), puntos críticos (métrica, volumen, entorno), servidor local |
| Integración HTTP | Vitest + `app.inject` + PGlite | `services/api-core/test/` (36) | Reportes, publicación diferida, cupo, idempotencia, fotos (WebP sin EXIF, abuso, cupo), moderación, exportación, indicadores, ejecutivo, privacidad, separación público/técnico, seguridad, resiliencia, ubicación del dispositivo y aproximada, ID corto, zona horaria, pool |
| Concurrencia real | Vitest contra PostgreSQL real | `cuota-concurrencia-pg.test.ts`, `fotos-cuota-concurrencia-pg.test.ts` | Se omiten sin `DATABASE_URL_PG_REAL`; las corre el CI |
| geo-service | Vitest | `services/geo-service/test/` (5) | PIP (interior, borde, hueco, fuera), huella y cifras, plan de agregados, caché, configuración |
| ETL | Vitest | `pipelines/geodata-etl/test/` (3) | Pipeline, calidad e ids, carga |
| Frontends | Vitest (lógica pura y `renderToStaticMarkup`) | `apps/*/src/**/*.test.ts` | Ubicación, radio, cámara, borrador, errores, proxy/CSP, SW, sesión, filtros, fusión, tortas, ejecutivo… |
| E2E | Playwright 1.63 (Chromium completo, cámara falsa, geolocalización simulada) | `e2e/tests/` (28 specs; proyectos `chromium` y `movil` Pixel 7) | Recorrido completo, formulario, ubicación obligatoria y aproximada, cámara, panel (técnico, ejecutivo, tortas, mapa reactivo, al día), publicación diferida, separación público/técnico, CSP, accesibilidad (axe), responsive, contratos de API, resiliencia, tráfico público |
| Infra | CI | `ci.yml` | Migraciones desde cero e idempotentes, privilegios, réplicas concurrentes, seeds, humo, **simulacro de recuperación**, construcción de imágenes + Trivy + arranque endurecido, shellcheck, `compose config`, reglas de Prometheus y Alertmanager |

**Cómo se ejecutan** [C]:

```bash
pnpm test
pnpm --filter <pkg> test
pnpm etl:test
pnpm test:e2e
node e2e/scripts/correr-local.mjs --grupo G1…G5|todos
```

- `correr-local.mjs` usa una base aparte, `curichi_e2e`, y necesita los puertos 3000–3002 y 3100
  libres y 2,5 GB de RAM.

**Cifras** [Doc, `docs/sdd/2026-10-04-arreglos-chicos/informe.md`]:

- Unitarias: alrededor de 1841 en verde y 11 omitidas.
  - Por paquete: contracts 227 · panel-admin 432 · db 251 · web-ciudadano 458 · api-core 391 ·
    geo-service 61 · geodata-etl 21.
- E2E del 2026-10-03: 175 en verde y 8 fallos explicados.
- La corrida posterior (ubicación aproximada) añadió pruebas.
- **En esta sesión no se ejecutó ninguna prueba.**

**Áreas con menos cobertura** [I]:

- Interacción real del mapa MapLibre: se cubre por E2E, no unitariamente.
- `Mapa.tsx` (1311 líneas) y `FormularioReporte.tsx` (1859): lógica en `lib/` probada, componentes
  solo por E2E.
- Lanzador `MiCurichi.cs`: sin pruebas automatizadas visibles.
- Scripts `banco-*.mjs`: herramientas de medición, no pruebas.
- Respaldo S3 externo real: el simulacro del CI restaura en local.

---

## 22. Configuration

- **Variables**: todas en `.env.example` raíz (alrededor de 500 líneas comentadas, con etiquetas), más
  `.env.example` por paquete. Turborepo **filtra el entorno**: toda variable nueva va en `globalEnv`
  de `turbo.json` [C].
- **Carga**: `pnpm dev` de los servicios usa `tsx watch --env-file-if-exists=../../.env`. **Los
  scripts de pnpm de la base y el ETL no leen `.env`**: hay que exportar `DATABASE_URL` [C/Doc].
- **Precedencia de URL de base**:
  - api-core: `API_DATABASE_URL || DATABASE_URL || postgresql://curichi:curichi@127.0.0.1:5433/curichi`;
  - geo-service: `GEO_DATABASE_URL ?? DATABASE_URL ?? …` (con `noVacia`) [C].
- **Validación al arrancar**:
  - zona horaria IANA;
  - `CiudadSchema`;
  - enteros en rango (cupos, demoras de 0 a 3600);
  - `PANEL_ADMIN_URL`;
  - CRS métrico;
  - lock timeout;
  - producción estricta (§8.1).
  - Las variables de prueba `REPORTE_DEMORA_*_S` dejan un aviso si están definidas en producción [C].
- **Compose**: fija en los contenedores `NODE_ENV=production`, `COOKIE_SEGURA=1`, `TRUST_PROXY=1`
  (o `TRUST_PROXY_DOCKER`), `PROXY_DE_CONFIANZA=1`, `HSTS=0` (lo pone el proxy) y deriva
  `CORS_ORIGENES` y `PANEL_ADMIN_URL` de `DOMINIO_*` [C/Doc].
- **Ciudad**: `CIUDAD_NOMBRE`, `CIUDAD_PAIS`, `CIUDAD_LOCALE`, `CIUDAD_CENTRO_LON/LAT`,
  `CIUDAD_ZOOM_INICIAL`, `ZONA_HORARIA`, `CRS_METRICO_EPSG` e `INSTALACION_NOMBRE` [C].

---

## 23. Development Workflow

- **Requisitos**:
  - Node 24 LTS y pnpm 12 (`corepack enable`);
  - Docker opcional (recomendado; ADR 0005);
  - RAM: 8 GB, o 16 GB con Docker y las dos apps;
  - Windows 11 (entorno principal) y Linux [Doc].
- **Arranque con Docker** (recomendado):

  ```bash
  docker compose up -d postgis
  export DATABASE_URL=…
  pnpm db:migrate
  pnpm etl:load -- --version DM_UV_MZ_2025
  pnpm db:seed:samples
  pnpm dev
  ```

  `pnpm etl:load` es opcional y solo aplica si están los datos reales.
- **Sin Docker**: `pnpm db:local` (PGlite en `127.0.0.1:5433`; aplica las migraciones) +
  `pnpm db:seed:samples` + `pnpm dev`. PGlite se cuelga tras horas de uso y es de una sola conexión.
- **Pila completa**: `docker compose --profile servicios --profile minio up -d --build`. Queda en
  `https://curichi.localhost:8443` y `https://panel.curichi.localhost:8443` con la CA interna de Caddy.
- **Con un clic**: `Mi-Curichi.exe`, que se compila con
  `powershell -ExecutionPolicy Bypass -File scripts\lanzador\compilar.ps1`. Menú: estado, logs,
  actualizar, compartir por túnel, E2E y detener.
- **Cuentas de desarrollo** (las crea el seed): `admin`, `tecnico`, `vecina`, `ejecutivo`. La
  contraseña es igual al nombre de usuario y se entra escribiendo solo el usuario.
- **Convenciones**:
  - Conventional Commits en español con scope obligatorio (commitlint);
  - Husky: el pre-commit corre lint-staged (Biome) y el escaneo de secretos;
  - `eol=lf`;
  - nada directo a `main`; PR con plantilla y checklist DoD;
  - reglas de **carpetas designadas por parte** (CLAUDE.md §5) y proceso **plan → aprobación → reparto
    a subagentes por nivel + verificación SDD** (CLAUDE.md §12.4, `.claude/skills/sdd`, `docs/proceso/sdd.md`).
- **Preview en el app**: `.claude/launch.json` define `web-ciudadano` (:3000), `panel-admin` (:3100)
  y `web-ciudadano-produccion`. No define los servicios ni la base [C].

---

## 24. Build & Deployment

- **Build**: `pnpm build` (Turborepo, `dependsOn ^build`). Siete paquetes producen salida:
  - contracts: `tsc` y genera `openapi.yaml` y `dist/dominio.json`;
  - db, servicios y ETL: `tsc`;
  - apps: `next build` con salida **standalone** [C/Doc].
- **Imágenes** (`infra/docker/`) [C]:

  | Dockerfile | Imagen |
  |---|---|
  | `servicio.Dockerfile` (`--build-arg PAQUETE=api-core\|geo-service`) | Multi-etapa, `pnpm deploy`, `USER node`, tini, healthcheck a `/health`. La de api-core lleva el CLI de migraciones |
  | `app.Dockerfile` | Next standalone, healthcheck a `/icono.svg` |
  | `proxy.Dockerfile` | Caddy con el Caddyfile horneado |
  | `respaldo.Dockerfile` | Base `postgis/postgis:18-3.6` + respaldo |

- **Orden en el Compose** [C]:
  1. `postgis` healthy;
  2. job `migraciones` (`node node_modules/db/dist/cli/migrar.js`, rol dueño) termina en 0;
  3. `api-core` y `geo-service` healthy;
  4. apps;
  5. `proxy`.
  - Escalable con `--scale`; Caddy reparte por DNS.
- **CI** (`.github/workflows/ci.yml`) [C]:

  | Job | Qué hace |
  |---|---|
  | `secretos-historial` | gitleaks |
  | `verificar` | install, secretos, audit, OpenAPI al día, lint, typecheck, test, build |
  | `e2e` | Solo en push y en dispatch; PGlite + seeds + Playwright |
  | `postgres-real` | Migraciones, privilegios, réplicas concurrentes, cuota real, seeds, humo, simulacro de recuperación |
  | `imagenes-docker` | Construcción + Trivy + arranque endurecido |
  | `infra` | shellcheck, `compose config`, promtool y amtool, imagen de respaldo |
  | `publicar-imagenes` | Imágenes en GHCR con tag = SHA |

- **Producción** (Fase 2, ADR 0006) [Doc]:
  - una VPS por ciudad con el mismo Compose y las imágenes del CI fijadas a un SHA;
  - `PROXY_TLS=acme`, puertos 80/443, fotos en disco con guarda;
  - respaldos diarios cifrados a S3 externo;
  - observabilidad con alertas.
  - **No hay ninguna instalación en marcha.** Guía: `docs/operaciones/produccion.md`.

---

## 25. Important Dependencies

| Dependencia | Por qué es crítica |
|---|---|
| `zod` 4.6.4 (fijada; excluida de la cuarentena) | Toda la validación y el OpenAPI generado |
| `fastify` 5.12.4 + plugins | Las dos APIs |
| `pg` 8.23.0 | Único driver; ojo: `sslmode=require` equivale a `verify-full` en esta versión [Doc] |
| PostGIS 3.6 / PostgreSQL 18 | PIP, DBSCAN, GIST, geography |
| `sharp` 0.35.4 (libvips 8.18.x) | Saneamiento de fotos; superficie de ataque mitigada con `block` |
| `hash-wasm` / `node:crypto argon2Sync` | Contraseñas (los dos producen el mismo PHC) |
| `maplibre-gl` 6.9.0 | Mapas; el worker se copia a `public/` |
| `next` 16.3.6 | Subido por un aviso crítico (`next/og`) el 2026-10-03 |
| `geojson-vt` 4.0.3 / `vt-pbf` | Teselas al vuelo (hay un PR de Dependabot a 5.0.3 **sin fusionar**) |
| `mapshaper` 0.7.61 / `@turf/turf` | ETL (arrastra transitivas con overrides de seguridad) |
| `@electric-sql/pglite*` | Pruebas y modo sin Docker |
| TypeScript 5.9.3 / Vitest 4.1.11 | **Fijadas a propósito**: subir a TS 7 o Vitest 5 exige un ADR |

---

## 26. Known Observations

Hechos relevantes, no necesariamente defectos [C salvo indicación]:

1. **El README está parcialmente desactualizado** frente al código y a CLAUDE.md:
   - dice que el reporte «queda en cola, un técnico lo valida… Solo entonces aparece en el mapa
     público», pero hoy se publica **sin moderación previa** (ADR 0006);
   - en «Pruebas» dice «Cada cuenta puede crear un reporte por hora», pero hoy son 3 por día;
   - la tabla «Cuentas y permisos» no incluye el rol `ejecutivo`.
2. **`docs/TRASPASO.md`** está fechado el 2026-09-27. Lo posterior está en
   `docs/revision/2026-10-03-mapeo-y-pruebas.md` y en `docs/sdd/2026-10-04-*`. Varios pendientes de
   la revisión del 2026-10-03 ya se resolvieron en `main`:
   - la exportación volvió a ser solo de técnico y admin;
   - la 0017 tiene prueba;
   - contracts tiene CHANGELOG hasta 0.18.0;
   - el ID corto se resuelve por rango y con visibilidad;
   - las contraseñas «puerta trasera» se eliminaron.
3. **Rate limits por IP en memoria por proceso**: no se comparten entre réplicas. Está documentado
   y en el backlog. Los cupos por cuenta y el tope de altas sí viven en la base.
4. **La relación reporte → capa es lógica (sin FK)**, por la PK compuesta `(id, version_capa)` de las
   capas. CLAUDE.md §7.1 la describe como «FK».
5. **Drizzle** está como dependencia, pero las rutas usan SQL a mano. El esquema Drizzle es un espejo
   verificado por prueba.
6. Las apps leen la ciudad en el servidor y **renderizan por petición**: no hay páginas estáticas
   prerenderizadas.
7. **El panel ejecutivo usa la ruta pública** de reportes para su mapa: coordenadas con jitter, sin
   autor.
8. **Cifras de las capas reales**: `config/capas.yaml` anota UV.shp con 582 features y MZ.shp con
   27 817 (con nulos y geometrías nulas). CLAUDE.md habla de 576 UV y 27 527 manzanas cargadas. La
   diferencia se explica, probablemente, por las exclusiones del ETL [I].
9. **Rama `claude/disaster-alert-platforms-research-c6sjk5`**: no es ancestro de `main`, pero su
   contenido llegó a `main` en versión posterior [I].
10. **Hay cinco PR de Dependabot abiertos** (2026-10-05), entre ellos versiones **mayores** (`actions/checkout`
    7, `setup-node` 7, `setup-buildx` 4, `geojson-vt` 5). CLAUDE.md §8.1 pide no mezclar mayores
    sin probar y sin ADR.

---

## 27. Potential Concerns Found During Analysis

> Ninguna se corrigió. Estado de todas: **Pendiente de revisión.**

**P-01. Botón «Usar ubicación de prueba» visible en producción (D2 abierto)**

- **Observación**: `PedirUbicacion` muestra siempre «📍 Usar ubicación de prueba (Santa Cruz)» cuando
  `FormularioReporte` le pasa `alSimular`, y se lo pasa **siempre**.
  `ControladorUbicacion.simular()` ancla una posición fija (-17.7833, -63.1821) con 5 m de precisión.
- **Ubicación**: `apps/web-ciudadano/src/componentes/FormularioReporte.tsx:1027`,
  `componentes/PedirUbicacion.tsx:194-205`, `lib/ubicacion-dispositivo.ts:207`.
- **Por qué importa**: permite reportar sin compartir la posición real. El servidor solo compara el
  punto con la posición declarada, que es la simulada. Además ata coordenadas de Santa Cruz al código
  (contra ADR 0004).
- **Impacto potencial**: anula la «ubicación obligatoria» del MVP (CLAUDE.md §3.1.4 y §13) en el
  build de producción.

**P-02. Severidad con `agua_estancada` sin versionar (D3 abierto)**

- **Observación**: `agua_estancada` = 5 amplió el puntaje a 13 con `SEVERIDAD_VERSION = 2` sin
  cambiar. Las etiquetas de `permanente` («Cada lluvia») y `cada_lluvia_fuerte` («Solo cuando llueve
  fuerte») cambiaron sin migrar datos.
- **Ubicación**: `packages/contracts/src/dominio/severidad.ts`, `enums.ts`.
- **Por qué importa**: §9.1 exige versionar todo cambio de la matriz.
- **Impacto potencial**: reportes viejos interpretados con otro significado; trazabilidad de la
  severidad ambigua.

**P-03. Comentarios contradictorios sobre `TRUST_PROXY`**

- **Observación**: geo-service dice que con la topología documentada el valor correcto es **2**.
  api-core, `apps/*/src/proxy.ts`, `.env.example` y el Compose dicen **1**, y explican que 2 permite
  elegir la IP.
- **Ubicación**: `services/geo-service/src/proxy.ts:17` y `services/geo-service/src/config.ts:60`.
- **Por qué importa**: quien configure geo-service guiándose por su comentario podría poner 2.
- **Impacto potencial**: suplantación de IP en el rate limit de geo-service (el resolver público).
  El Compose usa 1 por defecto, así que el riesgo depende de una configuración manual [I].

**P-04. `Enter` global en el formulario de reporte**

- **Observación**: el `onKeyDown` del `<form>` intercepta Enter en cualquier elemento (salvo
  `TEXTAREA`) de los pasos 1–3 y hace `preventDefault`.
- **Ubicación**: `apps/web-ciudadano/src/componentes/FormularioReporte.tsx:948-955`.
- **Por qué importa**: Enter sobre un botón (cámara, opciones, mover el punto) o un enlace no lo
  activa, sino que avanza de paso [I, deducido del código; señalado también en la revisión del
  2026-10-03].
- **Impacto potencial**: incumple la operación con teclado (WCAG, CLAUDE.md §14.1).

**P-05. `PATCH /reportes/:id/estado` con `duplicado` no acepta ID corto**

- **Observación**: `ReporteCambiarEstadoSchema.fusionado_en_id` es `z.uuid()`. Solo
  `POST /fusionar` acepta UUID o ID corto. CLAUDE.md §7.3 dice «UUID o ID corto» para la transición.
- **Ubicación**: `packages/contracts/src/esquemas/reporte.ts` (`ReporteCambiarEstadoSchema`).
- **Por qué importa**: inconsistencia entre el contrato y la documentación.
- **Impacto potencial**: bajo (el panel usa `/fusionar`).

**P-06. Rotación del `ip_hash` diario en UTC**

- **Observación**: `ipHashDiario` usa `hoy.toISOString().slice(0,10)`, la fecha UTC, mientras el
  resto del sistema usa el día de la ciudad.
- **Ubicación**: `services/api-core/src/privacidad.ts`.
- **Por qué importa**: en La Paz el «día» del hash cambia a las 20:00.
- **Impacto potencial**: menor; afecta la correlación antispam por día.

**P-07. Duplicación de enums en el frontend**

- **Observación**: `FRECUENCIAS`, `CAUSAS` y `UBICACION_TIPOS` se redeclaran localmente en lugar de
  importarlos de contracts. El orden de `CAUSAS` es intencionalmente distinto [I].
- **Ubicación**: `apps/web-ciudadano/src/componentes/FormularioReporte.tsx:124-140`.
- **Por qué importa**: contradice «ninguna parte define un tipo de intercambio por su cuenta». Un
  valor nuevo en contracts no aparecería en el formulario.
- **Impacto potencial**: deriva silenciosa del formulario frente al contrato. `agua_estancada` ya
  está incluido.

**P-08. Tipo incorrecto en el panel para la ruta pública**

- **Observación**: `obtenerReportesPublicos` está tipada como `ReporteTecnicoFeatureCollection`, pero
  `/api/v1/reportes` devuelve la vista **pública**.
- **Ubicación**: `apps/panel-admin/src/lib/api.ts:224-229`.
- **Por qué importa**: el compilador dejaría leer campos técnicos que no vienen.
- **Impacto potencial**: errores en tiempo de ejecución o `undefined` en la UI ejecutiva.

**P-09. Contraseñas triviales del seed y modo «compartir» (D8 parcialmente abierto)**

- **Observación**: el seed crea `admin`/`admin`, `tecnico`/`tecnico`, etc. El lanzador puede
  exponer la pila por un túnel de Cloudflare.
- **Ubicación**: `packages/db/src/seeds/samples.ts`, `scripts/lanzador/`.
- **Por qué importa**: si se comparte el panel por el túnel, las cuentas se adivinan al primer intento.
- **Impacto potencial**: acceso de administración a la instancia de demo. El seed sí se niega a
  correr con `NODE_ENV=production`.

**P-10. Estado local reportado en documentos, no verificado aquí (D6/D7)**

- **Observación**: la revisión del 2026-10-03 indica `REPORTE_DEMORA_PRIMERO_S=0` y
  `REPORTE_DEMORA_SIGUIENTES_S=0` en el `.env` local y deriva de la migración 0016 en la base local
  (`pnpm privilegios` en rojo).
- **Ubicación**: `.env` (no leído), base local `curichi`.
- **Por qué importa**: la demo publica al instante (contra ADR 0006) y la matriz de privilegios no cuadra.
- **Impacto potencial**: conclusiones equivocadas al probar en local [D: no verificado en esta sesión].

**P-11. Dependencias locales posiblemente desactualizadas**

- **Observación**: `node_modules` es del 2026-09-23 y el lockfile cambió con los 65 commits nuevos.
- **Ubicación**: raíz.
- **Por qué importa**: ejecutar sin `pnpm install` puede fallar o usar versiones viejas (por ejemplo,
  Next 16.3.6) [I].
- **Impacto potencial**: errores de arranque o de pruebas no relacionados con el código.

**P-12. Sin checksum de migraciones aplicadas**

- **Observación**: `_migraciones` guarda solo el nombre. Si se edita una migración ya aplicada, no se detecta.
- **Ubicación**: `packages/db/src/migrar.ts`.
- **Por qué importa**: las reglas prohíben editar migraciones aplicadas, pero nada lo hace cumplir.
- **Impacto potencial**: esquemas divergentes entre instalaciones.

**P-13. `scripts/sembrar-30-puntos.sql` fuera de las reglas**

- **Observación**: inserta reportes con distrito y UV escritos a mano, `autor_id` NULL, sin
  auditoría ni marca de sintético (según la revisión del 2026-10-03; se leyó el inicio del archivo).
- **Ubicación**: `scripts/sembrar-30-puntos.sql`.
- **Por qué importa**: contradice la regla 5 (PIP) y la de datos sintéticos etiquetados.
- **Impacto potencial**: datos de demo que parecen reales.

**P-14. Documentación de paquetes desactualizada (menor)**

- **Observación**:
  - `packages/contracts/README.md` habla de «severidad (256 combinaciones)», pero v2 tiene 20;
  - `packages/db/.env.example` no lista `SEED_VECINA_PASSWORD` ni `SEED_EJECUTIVO_PASSWORD`;
  - el mensaje de `seed-samples.ts` omite la cuenta `ejecutivo`;
  - `services/api-core/src/almacen.ts` dice «En Fase 2: adaptador S3» aunque ya existe.
- **Por qué importa**: confunde a quien lee primero los README.
- **Impacto potencial**: bajo.

**P-15. Comportamientos señalados en revisiones y no verificados en esta sesión**

- **Observación**: «Doble manejador de clic en el mapa del panel» (clic en un punto que dispara
  detalle y filtro por UV).
- **Ubicación**: `apps/panel-admin/src/componentes/Mapa.tsx`, `apps/web-ciudadano/src/componentes/Mapa.tsx`.
- **Por qué importa**: posible UX errática.
- **Impacto potencial**: [D] no verificado; las líneas citadas en la revisión pueden haber cambiado.

---

## 28. Files That Are Especially Important

| Archivo | Responsabilidad | Depende de | Utilizado por |
|---|---|---|---|
| `CLAUDE.md` | Reglas, partes, dominio, contratos, proceso | — | Todo el equipo y los agentes |
| `packages/contracts/src/dominio/enums.ts` | Enums, etiquetas, colores, estados públicos/verificados/retirados, roles del panel | — | Todo |
| `packages/contracts/src/dominio/config.ts` | `CONFIG_DOMINIO`, `NOTA_METODOLOGICA` | `enums.ts` | api-core, db, geo, apps, ETL |
| `packages/contracts/src/dominio/severidad.ts` | Función pura de severidad | `enums.ts` | api-core (cálculo), apps (vista previa), db (seeds) |
| `packages/contracts/src/dominio/geo.ts` | `distanciaMetros`, `dentroDelRadio`, códigos 422 de ubicación | `config.ts` | api-core, web-ciudadano, panel (fusión) |
| `packages/contracts/src/geo/jitter.ts` | `coordenadaPublica`, `aplicarJitter` | — | api-core, db |
| `packages/contracts/src/esquemas/reporte.ts` | Esquemas de reporte, `TRANSICIONES` | `comunes.ts`, `config.ts` | api-core, apps |
| `packages/contracts/src/openapi.ts` + `scripts/generar.ts` | OpenAPI y `dominio.json` | Esquemas | `/docs`, CI |
| `packages/db/migraciones/*.sql` | DDL real | — | Runner, CI |
| `packages/db/src/migrar.ts` | Runner con locks | `ejecutor.ts`, `configuracion.ts` | CLI, `db:local`, pruebas |
| `packages/db/src/password.ts` | Argon2id en workers | `hash-wasm`, `node:crypto` | api-core (auth), cuentas, seeds |
| `packages/db/src/puntos-criticos.ts` / `-entorno.ts` | Recurrencia | `contracts`, `configuracion.ts` | api-core (moderación, mantenimiento), seeds, CLI |
| `packages/db/src/intentos-login.ts` | Freno de login y altas | — | api-core (`auth.ts`) |
| `services/api-core/src/app.ts` | Composición, seguridad, errores, `/ready` | Todos los módulos | `servidor.ts`, pruebas |
| `services/api-core/src/config.ts` | Configuración y verificación de producción | contracts, db | `servidor.ts`, `app.ts` |
| `services/api-core/src/rutas/reportes.ts` | Crear y leer reportes | `consultas`, `vistas`, `cuota`, `idempotencia`, `ubicacion-dispositivo`, `resolver` | Apps |
| `services/api-core/src/rutas/moderacion.ts` | Estados, fusión, severidad | contracts, db (puntos críticos) | panel-admin |
| `services/api-core/src/rutas/fotos.ts` | Saneamiento y servido de fotos | sharp, `cuota`, `almacen` | web-ciudadano, panel |
| `services/api-core/src/visibilidad.ts` | Fuente única de visibilidad | contracts | consultas, rutas |
| `services/api-core/src/vistas.ts` | SELECT base y vistas | contracts | rutas |
| `services/geo-service/src/resolver.ts` | PIP | PostGIS | geo `app.ts` (y api-core vía HTTP) |
| `services/geo-service/src/capas.ts` | Capas, huella, MVT | geojson-vt, vt-pbf, `data/processed` | geo `app.ts` |
| `apps/*/src/proxy.ts` | Reenvío, CSP con nonce, saneamiento de XFF, HSTS | `lib/servicios.ts` | Next (cada petición) |
| `apps/web-ciudadano/src/lib/api.ts` | Cliente HTTP público | contracts (tipos) | Componentes |
| `apps/web-ciudadano/src/lib/ubicacion-dispositivo.ts` | Geolocalización y decisión de envío | contracts | `FormularioReporte`, `PedirUbicacion` |
| `apps/web-ciudadano/src/componentes/FormularioReporte.tsx` | Flujo de reporte | Casi todo `lib/` | `/reportar` |
| `apps/panel-admin/src/lib/api.ts` + `consultas.ts` | Cliente y sondeo | contracts | Páginas del panel |
| `apps/panel-admin/src/lib/sesion.tsx` + `roles.ts` | Puerta de sesión y rol | `api.ts` | Layout `(panel)` |
| `pipelines/geodata-etl/config/capas.yaml` | Mapeo de los shapefiles del municipio | — | ETL |
| `pipelines/geodata-etl/src/pipeline.ts` / `pasos/cargar.ts` | Procesado y carga | mapshaper, turf, db | CLI ETL |
| `docker-compose.yml` | Topología local y de producción | `infra/*` | Operación, lanzador, CI |
| `infra/proxy/Caddyfile` | TLS, IP real, cortes de rutas internas | — | Imagen del proxy |
| `infra/sql/01-roles.sh` | Roles de mínimo privilegio | — | Init de PostGIS |
| `.github/workflows/ci.yml` | Calidad, seguridad, imágenes | — | GitHub |
| `.env.example` | Contrato de configuración | — | Todos |
| `turbo.json` | Tareas y `globalEnv` | — | pnpm/turbo |
| `pnpm-workspace.yaml` | Workspaces, cuarentena, builds nativos, overrides | — | pnpm |

---

## 29. Project Dependency Map

```text
MI CURICHI (monorepo pnpm + turbo)
│
├── packages/contracts  ◄──────────────── (lo importan TODOS)
│   ├── dominio/ (enums, config, severidad, geo)
│   ├── geo/jitter
│   ├── esquemas/ (comunes, reporte, auth, admin, geo, ejecutivo, configuracion)
│   └── openapi.ts → openapi/openapi.yaml · dist/dominio.json
│
├── packages/db  ──► contracts
│   ├── migraciones/0001…0019.sql  (DDL)
│   ├── cliente (pg Pool) · ejecutor (pg | PGlite) · migrar · configuracion
│   ├── password (Argon2id workers) · intentos-login · cuentas · privilegios
│   ├── puntos-criticos (+ entorno) · geometria-publica · mantenimiento
│   ├── seeds/samples ──► data/samples/geo/*.geojson
│   └── local/servidor (PGlite + pglite-socket :5433)
│
├── services/geo-service  ──► contracts, db
│   ├── servidor → app (Fastify)
│   │   ├── resolver (PIP)        ──► PostGIS (geo.*_vigente)
│   │   ├── capas (CacheCapas)    ──► data/processed/*.web.geojson | PostGIS
│   │   ├── cache-corta           ──► SQL_AGREGADOS_UV, punto_critico
│   │   └── observabilidad · proxy · comparar · visibilidad
│   └── rol curichi_geo (SELECT)
│
├── services/api-core  ──► contracts, db, sharp, (HTTP) geo-service, almacén de fotos
│   ├── servidor → app (Fastify + plugins + onRequest auth + onSend headers + errorHandler)
│   │   ├── rutas/auth ─────► db(password, intentos-login), auth.ts (sesión), cuota
│   │   ├── rutas/reportes ─► ubicacion-dispositivo, resolver(geo), idempotencia, cuota,
│   │   │                     consultas ─► visibilidad, vistas
│   │   ├── rutas/moderacion ► contracts(TRANSICIONES), db(recalcularEntorno), id-reporte
│   │   ├── rutas/fotos ────► sharp, cuota, almacen (Disco | S3), guarda-disco
│   │   ├── rutas/admin ────► consultas(exportar), indicadores, capas → resolver.invalidarCapas
│   │   ├── rutas/ejecutivo · rutas/configuracion
│   │   └── observabilidad · cache · registro · privacidad · proxy
│   ├── mantenimiento (cada 6 h, lock 4023) ──► db
│   └── rol curichi_api (DML acotado)
│
├── apps/web-ciudadano (Next 16)  ──► contracts (tipos/funciones puras)
│   ├── proxy.ts ──/api──► api-core   ──/geo──► geo-service
│   ├── app/ (/, /inicio, /reportar, /reporte/[id], /mis-reportes, /ingresar, /crear-cuenta, /cuenta, /como-funciona)
│   ├── componentes/ (VistaMapa, Mapa, FormularioReporte, PedirUbicacion, CamaraReporte, HojaDetalle…)
│   ├── lib/ (api, sesion, consultas, ubicacion-dispositivo, radio, camara, borrador, errores…)
│   └── public/ (sw.js, manifest, maplibre worker, glifos, logos)
│
├── apps/panel-admin (Next 16)  ──► contracts
│   ├── proxy.ts ──/api──► api-core   ──/geo──► geo-service
│   ├── app/(panel)/ (reportes, reportes/[id], indicadores, ejecutivo, capas, plano) · login
│   ├── componentes/ (Mapa, TablaReportes, PanelAcciones, CandidatosFusion, ejecutivo/*, indicadores/*)
│   └── lib/ (api, consultas [sondeo 10 s], sesion, roles, filtros, fusion-cercana, indicadores-*…)
│
├── pipelines/geodata-etl  ──► contracts, db, mapshaper, turf
│   data/raw/<v>/*.shp ─► etl:run ─► data/processed/<v>/<capa>/{full,web}.geojson ─► etl:load ─► geo.*
│
├── e2e (Playwright) ──► levanta/usa web-ciudadano, panel-admin, api-core, geo-service, db
│
└── infra + docker-compose
    postgis ─► migraciones(job) ─► api-core, geo-service ─► web-ciudadano, panel-admin ─► proxy(Caddy)
    perfiles: minio(+init) · respaldos · observabilidad(prometheus, alertmanager, blackbox)
```

---

## 30. Final Understanding of the System

Mi Curichi es un **inventario georreferenciado de anegamientos alimentado por vecinos**, construido
como un monorepo TypeScript muy disciplinado. La disciplina se ve en las reglas por partes, el
contrato único, la verificación de privilegios al arrancar y unas 1800 pruebas unitarias más E2E.

- **El contrato manda.** `packages/contracts` define los valores, las reglas (severidad,
  transiciones, visibilidad, radio, jitter) y la forma de cada mensaje. Servicios y apps solo lo
  aplican. Un cambio de contrato rompe el `typecheck` de quien lo consume.
- **La base es la autoridad del estado.**
  - La visibilidad es un filtro sobre `publicar_en`.
  - Los cupos son upserts atómicos.
  - La idempotencia, las sesiones y el freno de login viven en tablas.
  - Así el sistema escala horizontalmente. Lo que vive en memoria (rate limit por IP, cachés de
    geo-service) es aceptado como «por réplica».
- **Separaciones deliberadas**:
  - lectura pública frente a técnica (rutas distintas, geometrías distintas);
  - escritura (api-core) frente a lectura geoespacial (geo-service);
  - rol dueño frente a roles de runtime.
- **Privacidad por diseño**:
  - la posición del dispositivo no se guarda;
  - las coordenadas de vivienda tienen jitter determinista con sal;
  - las fotos se recodifican sin metadatos;
  - las IP solo se guardan con hash;
  - la identidad del autor nunca es pública.
- **Flujo de valor**:

  ```text
  vecino con cuenta → reporte con posición del dispositivo comprobada y PIP
  → publicación diferida «NO SE HA VERIFICADO»
  → técnico valida, rechaza o fusiona (recalcula puntos críticos)
  → mapa público, indicadores, resumen ejecutivo y exportación con nota metodológica
  ```

- **Estado**: Fase 1 local en curso, con Docker y Compose listos para una VPS por ciudad, pero sin
  despliegue ni aprobación de Fase 2.
- **Pendientes de producto abiertos**:
  - D2: botón de ubicación de prueba;
  - D3: versión de severidad;
  - parámetros de dominio a validar con el municipio;
  - fuente del mapa base de producción;
  - licencia de los datos y del código.

Para retomar trabajo:

1. Leer `CLAUDE.md` (reglas y proceso obligatorio: plan → aprobación → reparto por nivel →
   verificación SDD).
2. Leer este documento.
3. Leer `docs/revision/2026-10-03-mapeo-y-pruebas.md` y los informes de `docs/sdd/2026-10-04-*`.
4. Antes de ejecutar algo, hacer `pnpm install`, porque los `node_modules` locales son anteriores a esta
   versión.
