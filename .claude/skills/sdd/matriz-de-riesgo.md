# Matriz de riesgo del proceso /sdd

Única fuente de qué verifica cada cambio. F0 activa banderas por **rutas** que se van a tocar y
por **palabras** de la descripción; en la duda, la bandera se activa. `base` va siempre.

Cuando aparece un defecto que ninguna bandera habría atrapado, se edita esta tabla: se añade la
ruta o la palabra que lo habría activado, y el comando que lo habría visto.

| Bandera | Rutas | Palabras | Agentes extra | Comandos obligatorios (en este orden) |
|---|---|---|---|---|
| `base` | siempre | siempre | revisor, verificador | `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm secretos` |
| `contrato` | `packages/contracts/` | payload, esquema, enum, endpoint nuevo, campo nuevo, campo que se quita, OpenAPI | revisor comprueba consumidores | `pnpm contracts:build && git diff --quiet -- packages/contracts/openapi` · `git diff --name-only <base>...HEAD \| grep packages/contracts/CHANGELOG.md` · `pnpm typecheck` (cubre los consumidores) · `pnpm --filter e2e exec playwright test tests/api-contratos.spec.ts` |
| `privacidad` | `coordenadaPublica`, `geom_publico`, `jitter`, `exportar`, vista pública, `puntos-criticos` | ubicación, coordenada, jitter, público, exportación, autor, `direccion_aprox`, manzana | auditor | `pnpm --filter api-core exec vitest run test/privacidad-ubicacion.test.ts test/vista-publica-vs-tecnica.test.ts` · `pnpm --filter contracts exec vitest run test/jitter.test.ts` · `pnpm --filter e2e exec playwright test tests/separacion-publica-tecnica.spec.ts` |
| `seguridad` | `autenticacion`, `sesion`, `fotos`, `rate`, `cuota`, `cabeceras`, `proxy`, `csp` | login, sesión, rol, foto, EXIF, límite, cuota, CSP, CORS, token, contraseña, registro | auditor (checklist completo) | `pnpm --filter api-core exec vitest run test/seguridad.test.ts test/autenticacion.test.ts test/fotos.test.ts test/fotos-abuso.test.ts test/cuentas-y-cuota.test.ts` · `pnpm auditoria` · `pnpm --filter e2e exec playwright test tests/acceso-panel.spec.ts tests/cuenta-ciudadana.spec.ts` |
| `datos` | `packages/db/migraciones/`, `packages/db/src/esquema`, `packages/db/src/seeds`, `verificar-privilegios` | migración, tabla, columna, índice, seed, privilegio, GRANT | auditor si toca privilegios | `pnpm --filter db test` · `git diff --name-only <base>...HEAD -- packages/db/migraciones \| grep -v` (ninguna migración anterior modificada; solo archivos nuevos) · con PostgreSQL real: `pnpm privilegios` y `DATABASE_URL_PG_REAL=… pnpm --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts` |
| `geo` | `services/geo-service/`, `pipelines/geodata-etl/`, `puntos-criticos*`, `packages/db/src/puntos-criticos*` | PIP, resolver, capa, tesela, ETL, punto crítico, UV, unidad vecinal, distrito, manzana, shapefile | verificador | `pnpm --filter geo-service test` · `pnpm etl:test` · `pnpm --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts` · `pnpm --filter e2e exec playwright test tests/datos-reales.spec.ts` · con PostgreSQL real: `node scripts/banco-consultas.mjs` (ningún escaneo secuencial) |
| `concurrencia` | `idempotencia`, `pool`, `transaccion`, `advisory` | idempotente, simultáneo, réplica, lock, pool, transacción, carrera | verificador | `pnpm --filter api-core exec vitest run test/idempotencia.test.ts test/pool-conexiones.test.ts` · con PostgreSQL real: `node scripts/banco-concurrencia.mjs` |
| `ui` | `apps/web-ciudadano/`, `apps/panel-admin/` | pantalla, mapa, formulario, botón, panel, campo, tarjeta, hoja, accesible, móvil, texto | verificador con navegador | `pnpm --filter <app> test` · `pnpm --filter e2e exec playwright test tests/accesibilidad.spec.ts tests/responsive.spec.ts tests/resiliencia-interfaz.spec.ts` más los specs de las pantallas tocadas (`mapa-publico`, `mapa-seleccion`, `recorrido-completo`, `navegacion`, `cuenta-ciudadana`) · `pnpm --filter <app> build && pnpm --filter <app> start` + navegador integrado: consola sin errores de CSP ni `Failed to load`, captura guardada |
| `infra` | `docker-compose.yml`, `infra/`, `.github/`, `turbo.json`, `.env.example`, `biome.json` | Docker, CI, variable de entorno, compose, healthcheck, workflow | verificador | `docker compose --profile servicios config` (si hay Docker) · toda variable nueva aparece en `turbo.json` `globalEnv` y en `.env.example` con etiqueta |

## Lo que no se puede ejecutar

Se marca **no verificado** con el motivo, nunca PASS. Casos conocidos: Docker apagado (todo lo
«con PostgreSQL real»), shapefiles reales ausentes en `data/raw/` (E2E `datos-reales` corre sobre
las capas sintéticas y lo dice), navegador integrado sin service worker (`docs/TRASPASO.md` §7.6).
