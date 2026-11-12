# 09 · Calidad y pruebas

> Parte **5** (la estrategia transversal y `e2e/`). Cada parte escribe sus propias pruebas. Leyenda:
> **[C]** confirmado en código · **[I]** inferido · **[Doc]** según documentación.

## 1. Pirámide de pruebas

```text
                 ┌──────────────────────────────┐
                 │ CI «postgres-real» + imágenes │  migraciones reales, privilegios, réplicas
                 │ + simulacro de recuperación   │  concurrentes, Trivy, arranque endurecido
                 ├──────────────────────────────┤
                 │   E2E Playwright (28 specs)  │  navegador real, cámara y GPS simulados,
                 │                              │  pila completa contra una base aparte
                 ├──────────────────────────────┤
                 │ Integración HTTP (api-core,  │  app.inject + PGlite + falsos inyectados
                 │ geo-service) y base (db)     │
                 ├──────────────────────────────┤
                 │ Unitarias: contracts, lib/   │  funciones puras: severidad, radio, jitter,
                 │ de las apps, ETL             │  filtros, moderación, tortas…
                 └──────────────────────────────┘
```

Cifras del 2026-10-04 [Doc]:

| Paquete | Pruebas |
|---|---|
| contracts | 227 |
| panel-admin | 432 |
| db | 251 |
| web-ciudadano | 458 |
| api-core | 391 (+11 omitidas sin PostgreSQL real) |
| geo-service | 61 |
| geodata-etl | 21 |
| **Total unitarias e integración** | **≈ 1841** |

E2E del 2026-10-03: 175 en verde y 8 fallos explicados. **En esta sesión no se ejecutaron pruebas.**

## 2. Herramientas y cómo corren

| Tipo | Herramienta | Comando |
|---|---|---|
| Unitarias e integración | Vitest 4.1 | `pnpm test` (turbo, todo) · `pnpm --filter <pkg> test` |
| Tipos | `tsc --noEmit` | `pnpm typecheck` |
| Lint, formato, a11y | Biome 2.5 | `pnpm lint` |
| E2E | Playwright 1.63 (Chromium completo, `--use-fake-device-for-media-stream`) | `pnpm test:e2e` o `node e2e/scripts/correr-local.mjs --grupo G1…G5\|todos` |
| Seguridad | Escaneo propio + gitleaks + `pnpm audit` + Trivy | `pnpm secretos` · `pnpm auditoria` |
| Privilegios reales | Script contra PostgreSQL | `pnpm privilegios` |
| Rendimiento | `scripts/banco-*.mjs` | Ver [08](08-infraestructura-y-devops.md) §10 |

**Bases de prueba**:

- Las pruebas de `db`, `api-core` y `geo-service` usan **PGlite** en memoria (`db/test-utils`). Es de
  **una sola conexión**: no sirve para probar bloqueos ni concurrencia.
- La concurrencia real se prueba con `DATABASE_URL_PG_REAL` (`cuota-concurrencia-pg`,
  `fotos-cuota-concurrencia-pg`) y en el job `postgres-real` del CI.

## 3. E2E (`e2e/`) [C]

- `playwright.config.ts`:
  - `baseURL` http://localhost:3000, `locale` es-BO, zona `America/La_Paz`;
  - **1 worker** y 1 reintento;
  - proyectos `chromium` y `movil` (Pixel 7: mapa, cámara, ubicación).
- El permiso de cámara y de ubicación se declara **por prueba** con
  `test.use({ permissions, geolocation })`.
- `global-setup.ts` espera los servicios y precalienta las rutas.
- `tests/ayudas.ts` (1067 líneas) concentra login, crear un reporte por API, adelantar el reloj y los
  puntos de prueba.
- **Runner local** `e2e/scripts/correr-local.mjs`:
  - levanta los cuatro procesos contra una base **aparte**, `curichi_e2e`; **nunca** toca `curichi`;
  - con su entorno de prueba (demoras en 0, etc.);
  - exige los puertos libres y 2,5 GB de RAM.

| Grupo | Specs |
|---|---|
| G1 | api-contratos · separacion-publica-tecnica · cuenta-ciudadana · acceso-panel · publicacion-diferida |
| G2 | mapa-publico · mapa-seleccion · trafico-publico · datos-reales · navegacion |
| G3 | formulario-reporte · formulario-sumidero-y-fotos · ubicacion-obligatoria · ubicacion-aproximada · camara-foto · resiliencia-interfaz · quitar-campos-web |
| G4 | recorrido-completo · panel-tecnico · panel-al-dia · panel-ejecutivo · panel-indicadores-tortas · panel-mapa-reactivo · quitar-campos-panel |
| G5 | accesibilidad (axe) · responsive · csp |

> Para correrlos con la pila de esta revisión levantada, hay que **detener antes `pnpm dev`**: el
> runner necesita los puertos 3000–3002 y 3100.

## 4. Lo que está bien cubierto [C]

- **Reglas de negocio puras**: severidad (todas las combinaciones), máquina de estados, radio,
  jitter, cupo diario y demora.
- **Privacidad**:
  - tabla de visibilidad que recorre **todas** las rutas (pública, técnica, exportación,
    indicadores, ejecutivo, fotos, agregados);
  - el bbox público no sirve de oráculo;
  - fotos sin EXIF, XMP ni ICC (comprobado por los trozos RIFF);
  - la posición del dispositivo no se guarda ni se registra.
- **Concurrencia**: cuota con 50 envíos simultáneos, idempotencia, migraciones con réplicas
  concurrentes (CI).
- **Migraciones**: una prueba por migración desde la 0010, idempotencia y espejo Drizzle frente a la base.
- **Resiliencia**: base o geo-service caídos → 503 con `Retry-After`; `/ready` degradado.
- **Contrato**: una prueba por versión de contracts y el OpenAPI regenerado se compara en el CI.

## 5. Huecos o riesgos de cobertura [I]

| Área | Por qué |
|---|---|
| `Mapa.tsx` (1311 líneas) y `FormularioReporte.tsx` (1859) | La lógica está en `lib/` con pruebas; la composición y las interacciones de MapLibre solo por E2E |
| Varias réplicas detrás de Caddy, en carga | No hay prueba automática; el CI prueba el arranque concurrente, no el tráfico repartido [Doc] |
| Respaldo a un S3 externo real | El simulacro restaura en local |
| Soak de horas | Se midió uno de 12 minutos [Doc] |
| Volúmenes de más de 1 M de reportes | Proyectados, no medidos [Doc] |
| `MiCurichi.cs` | Sin pruebas automáticas visibles |
| El botón de ubicación de prueba en producción (D2) | Las pruebas lo usan; ninguna prueba exige que **no** aparezca en producción |

## 6. Proceso de verificación del repositorio (SDD)

`CLAUDE.md` §12.4 y `docs/proceso/sdd.md` exigen, para todo cambio de código:

1. **Línea base**: correr las suites antes de tocar.
2. **Plan aprobado**, con metas verificables.
3. **Verificación**: comparar prueba por prueba contra la línea base (una regresión bloquea) + revisión
   + auditoría de seguridad si se toca api-core, fotos o auth.
4. **En vivo** sobre la pila Docker si hay UI, API o infraestructura.

Las corridas quedan en `docs/sdd/<fecha>-<slug>/`. Los agentes están en `.claude/agents/sdd-*` y la
skill en `.claude/skills/sdd/`.
