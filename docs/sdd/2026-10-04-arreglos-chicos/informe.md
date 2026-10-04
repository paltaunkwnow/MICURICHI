# Informe — arreglos chicos, pestañas de severidad y fusión con cercanos

- **Corrida:** `docs/sdd/2026-10-04-arreglos-chicos/`
- **Rama:** `fix/repo/arreglos-chicos`
- **Partes:** P1, P2, P3, P4 y P5. Una carpeta por tarea (`plan.md`).
- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `geo`, `api`, `ui`, `infra`.
- **Cambio de contrato:** sí. contracts 0.16.0 → **0.17.0**: `ResolverRespuesta.manzana` obsoleto, siempre
  `null`. Sin ruptura.
- **Vueltas implementador ↔ verificación:** 1. El revisor marcó IMPORTANTE la documentación de la 0018
  y T4 la corrigió.
- **Foto:** `refs/sdd/arreglos-chicos`.
- **Cambios ajenos:** `CLAUDE.md` (regla §12.4, y la puesta al día de §4.4 y §4.8 por esta corrida),
  `.claude/agents/trabajador-raiz.md` y `docs/sdd/2026-10-04-reportar-desde-computadora/`. Van en un
  commit aparte, o en la próxima corrida.
- **Línea base:** `linea-base.md`. 38 comandos, 27 verdes, 0 rojos y 11 no verificados (Docker apagado).
- **Modelos:**
  - plan y cierre: agente principal (Opus 5.5);
  - T1, T2, T3, T4 y los `sdd-*`: Opus 4.8;
  - T5, T6 y T7+T8: Sonnet 5.5.

## Qué cambia

Los errores reales y arreglos chicos del análisis del 2026-10-04 (punto 2), más dos pedidos del
usuario hechos durante la corrida.

- **api-core:**
  - el ID corto se resuelve por rango sobre la clave primaria, no con `LIKE`;
  - el detalle público no delata reportes ocultos.
- **geo-service:**
  - deja de cruzar cada punto con las manzanas;
  - arma el índice de teselas recién cuando alguien pide una.
- **db:** migración 0018, con dos CHECK de moderación (validación condicional) y sin el índice
  redundante `reporte_estado`.
- **Infraestructura:** `shm_size` de PostgreSQL.
- **web:**
  - el error al enviar se ve y se anuncia;
  - el correo del alta ya no viaja en la URL.
- **Panel:**
  - ficha imprimible sin contenido inventado, con la nota metodológica y manejo de foco;
  - criterios del ejecutivo tomados de contracts;
  - las cifras por UV se refrescan;
  - **pestañas de severidad con «Todo»** en Indicadores (T7);
  - **fusión solo con validados cercanos** (100 m, ampliable a 300 m y 1 km), sin campo de ID (T8).

## Regresión contra la línea base

| Comando | Línea base | Después | Clasificación |
|---|---|---|---|
| #1 `pnpm lint` | verde, 452 archivos y 1 warning ya existente | verde, 477 archivos, el mismo warning | igual |
| #2 typecheck | 9/9 | 9/9 | igual |
| #3 `turbo run test` (alcance) | 1200 verdes, 11 omitidos | **1841 verdes**, 11 omitidos | sin regresión: cada verde de la base sigue verde (comparado test por test) |
| #4 build | 7/7 | 7/7 | igual |
| #5 secretos, #6 sin rastrear | sin hallazgos | sin hallazgos | igual (#6: 3 coincidencias dentro de `linea-base.md`, que son texto del comando, no credenciales) |
| #7/#8 contracts build y OpenAPI idempotente | verde | verde | igual |
| #12 privacidad · #13 jitter · #15 seguridad | 76 · 4 · 152 | 76 · 4 · 152 | igual |
| #17 audit high | 0 high (6 moderate) | 0 high (6 moderate) | igual |
| #19 `db test` | 236 | 251 | **intermitente**: en la corrida conjunta venció un `beforeAll` (240 s, contención: 764 s contra 238 s). Pasó dentro de #3 y al reintentarlo solo (54 s) |
| #25 geo-service | 57 | 61 | sin regresión |
| #36/#37 compose config y puertos | verde | verde | igual |

Totales por paquete (antes → después):

| Paquete | Antes | Después |
|---|---|---|
| contracts | 222 | 227 |
| panel-admin | 249 | 432 |
| db | 236 | 251 |
| web-ciudadano | 425 | 458 |
| api-core | 380 | 391 |
| geo-service | 57 | 61 |
| geodata-etl | 21 | 21 |

## Criterios

| Meta | Prueba | Antes | Después |
|---|---|---|---|
| M-1.1 | `services/geo-service/test/geo-service.test.ts` (manzana null; espía: ninguna consulta a manzana) | rojo | verde |
| M-1.2 / M-1.3 | `geo-service.test.ts` (índice perezoso; huella, bytes, n_features, bbox y modo sin cambio) | rojo | verde |
| M-1.4 | `packages/contracts/test/contrato-0-17.test.ts` | rojo | verde |
| M-2.1 … M-2.4 | `services/api-core/test/resolucion-id-corto.test.ts` y `resolucion-id-corto-indice.test.ts` | rojo | verde |
| M-3.1 … M-3.4 | `packages/db/test/migracion-0018-integridad-moderacion.test.ts` (15) | rojo | verde |
| M-4.1 … M-4.4 | `docker compose config` · chequeo de puertos · #38 `.env.example` | #38 rojo | verde |
| M-5.1 … M-5.4 | `apps/panel-admin/src/componentes/ReporteUnitarioModal.test.ts`, `lib/severidad.test.ts`, `lib/dialogo.test.ts` | rojo | verde |
| M-5.5 | `componentes/ejecutivo/CriteriosSeveridad.test.ts`, `PanelEjecutivo.test.ts`, `lib/ejecutivo.test.ts` | rojo | verde |
| M-5.6 | `lib/consultas.test.ts` («agregados por UV…») | rojo | verde |
| M-6.1 | `apps/web-ciudadano/src/componentes/AvisosDelReporte.test.ts` | rojo | verde |
| M-6.2 / M-6.3 | `lib/correo-para-entrar.test.ts`, `componentes/FormularioAcceso.test.ts` | rojo | verde |
| M-7.1 … M-7.5 | `lib/indicadores-pestanas.test.ts`, `componentes/indicadores/PestanasPorSeveridad.test.ts`, `lib/consultas.test.ts` | rojo | verde |
| M-8.1 … M-8.5 | `lib/fusion-cercana.test.ts`, `componentes/CandidatosFusion.test.ts`, `PanelAcciones.test.ts`, `lib/consultas.test.ts` | rojo | verde |

## En vivo y túnel

Corrió (F4b) con el permiso del usuario. El detalle está en `verificacion.md`, § «En vivo (F4b)».

- **Respaldo:** `pg_dump` de `curichi` antes de migrar: `$SCRATCH/curichi-antes-arreglos-chicos.dump`,
  18,4 MB, fuera del repo.
- **Imágenes:** api-core, geo-service, web-ciudadano y panel-admin reconstruidas. Las de antes quedaron
  guardadas como `:antes-arreglos-chicos`.
- **Migración 0018:** aplicada, **sin NOTICE**. Las dos CHECK quedaron `convalidated = t` en `curichi`,
  `reporte_estado` ausente y `reporte_estado_creado` presente.
- **Humo por el proxy:**
  - `/`, `/api/v1/configuracion` y `panel.localhost/login` → 200;
  - CSP con nonce y `strict-dynamic`, `nosniff`, sin `x-middleware-*`;
  - `/ready` sin `degradado`.
- **Auditor:**
  - (a) el ID corto de un reporte oculto y `99999999` dan un `404` idéntico byte a byte;
  - (b) la primera tesela de manzanas tarda 0,587 s y las siguientes unos 0,07 s; `/capas` no arma el
    índice.
- **PostgreSQL real y S3:**
  - #22, concurrencia de cupos: 9 pruebas en verde;
  - #23, privilegios en base efímera: correctos; la base se borró al final y `curichi` quedó intacta;
  - #16, S3 contra MinIO: 11 pruebas en verde.
- **Estado final de la pila:** levantada y sana, con los 7 servicios `healthy`.
- **Desvío:** el comando del procedimiento (`docker compose run --rm migraciones`) **recreó
  `curichi-postgis`**, porque `run` resuelve la dependencia y el `shm_size` nuevo difería del contenedor
  en marcha. No hubo daño:
  - el volumen persistió (41 reportes, 442 usuarios, 576 UV);
  - el montaje de `./infra/sql` funcionó;
  - el `shm_size` quedó aplicado (256 MiB);
  - el dump ya estaba tomado.

  Se corrigió el procedimiento en la matriz: `run --rm --no-deps migraciones`.
- **No verificado en el navegador integrado:**
  - el proxy usa la CA interna de Caddy y el navegador rechaza el certificado; confiar en esa CA exige
    instalarla, cosa que §13 prohíbe;
  - la comprobación (c) del auditor (el `bbox` en el log), que necesitaba entrar al panel.

  Las conductas de interfaz están cubiertas por las pruebas unitarias de F4a.
- **Ventana E2E:** no autorizada. Corre en el CI al subir a `main`.

## Hallazgos del revisor y del auditor

| Severidad | Hallazgo | Resolución |
|---|---|---|
| IMPORTANTE (revisor) | `docs/operaciones/produccion.md` no documentaba las CHECK de la 0018 (M-4.3) | **Resuelto** en la vuelta 1: sección «Migración 0018: integridad de moderación» |
| MENOR (revisor) | `shm_size` no figuraba en `produccion.md` | **Resuelto** en la vuelta 1 |
| MENOR (revisor) | `packages/db/src/esquema/index.ts:240` sigue declarando `reporte_estado_idx` | Sin cambio. El esquema Drizzle no modela los índices reales (nombres decorativos que ninguna prueba verifica) ni las CHECK. Queda anotado |
| MENOR (auditor) | El `bbox` de la fusión con cercanos queda en el log de api-core (`registro.ts:38-44` registra la URL con la query) | Mitigado: la caja va alineada a una grilla de unos 56 m, no más fina que el desplazamiento del mapa público. **Recomendado:** no registrar la query de `/api/v1/tecnico/*` ni de `/exportar`. Va propuesto para la próxima corrida, que toca api-core |
| MENOR (auditor) | El índice perezoso de teselas se arma en el hilo principal (la primera tesela de manzanas, una vez por generación de caché) | Aceptado: nadie de afuera puede forzar reconstrucciones. Al backlog: construirlo fuera del hilo |
| — (auditor, ya existía) | `geojson-vt` cachea teselas sin desalojo, y `TeselaParams` no acota `x/y < 2^z` | Al backlog |
| INTERMITENTE (verificador) | #19 `db test`: `beforeAll` venció por contención | Pasó solo y dentro de #3. Ya estaba documentado (falta de RAM en las corridas conjuntas) |

Datos de prueba ajustados por la 0018 (solo datos, ninguna aserción):

- `packages/db/src/test-utils.ts`;
- `packages/db/test/puntos-criticos-entorno.test.ts`;
- `services/geo-service/test/plan-agregados.test.ts`;
- `services/api-core/test/{ejecutivo,indicadores,fotos}.test.ts`.

Pruebas existentes actualizadas a la conducta nueva:

- dos aserciones de `ReporteUnitarioModal.test.ts` (exigían el contenido institucional que M-5.3 manda
  quitar);
- `geo-service.test.ts`, la prueba de la manzana;
- el pin de versión de `contrato-0-16.test.ts`.

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|
| Las pantallas en el navegador integrado (indicadores, fusión, ficha, ejecutivo, alta) y el `bbox` en el log (auditor c) | El navegador rechaza el certificado de la CA interna de Caddy, e instalarla está prohibido (§13) | Que el usuario las mire en su navegador, o las E2E del CI |
| Ventanas E2E | No autorizadas | CI en `main`, o permiso para la ventana local |
| Límite de teselas (429 pasadas las 600 por minuto) | No se corrió la ráfaga | Comprobarlo en una ventana dedicada |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `services/api-core/src/registro.ts:38-44` | Registra la URL completa; el comentario dice que la query «no identifica a nadie», y con la fusión eso tiene una excepción | Bajo (mitigado con la grilla) |
| `e2e/` | Ninguna spec cubre el diálogo de la ficha, los criterios del ejecutivo, las pestañas de Indicadores ni la fusión con cercanos | Medio: hoy solo hay pruebas unitarias |
| `apps/panel-admin/README.md` | La fila de `/ejecutivo` decía «Sin mapa» (T5) | Bajo |
| `CLAUDE.md` §4.4 | No menciona que «UV con mayor incidencia» también se refresca cada 10 s | Bajo |

## Cómo volver atrás (si no se aprueba)

- **Código:** `git checkout refs/sdd/arreglos-chicos -- <archivo>` por cada archivo modificado de
  `archivos.txt`, y borrar los nuevos de la corrida. Lo ajeno no se toca.
- **Pila:** `docker tag mi-curichi-<svc>:antes-arreglos-chicos mi-curichi-<svc>:local && docker compose --profile servicios --profile minio up -d --no-deps --force-recreate <svc>`,
  para api-core, geo-service, web-ciudadano y panel-admin.
- **Base `curichi`:** tiene la 0018 aplicada. Para volver, se restaura
  `$SCRATCH/curichi-antes-arreglos-chicos.dump` (`pg_restore`). Lo decide el usuario.

---

## Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`)

### Parte y carpeta designada

- **Partes:** P1 `apps/web-ciudadano`, P2 `apps/panel-admin`, P3 `services/api-core`, P4
  `packages/db` + `services/geo-service` (+ `packages/contracts` anunciado), P5 `docker-compose.yml`
  (postgis) + `.env.example` + `docs/operaciones/produccion.md`.
- **Plan:** `docs/sdd/2026-10-04-arreglos-chicos/plan.md`.

### Qué cambia

Ver «Qué cambia» arriba.

### Cómo verificarlo

```bash
docker compose --profile servicios --profile minio up -d --build --no-deps api-core geo-service web-ciudadano panel-admin
npx -y pnpm@12.4.1 exec turbo run test --filter=...contracts --concurrency=1
```

Antes de reconstruir api-core: `pg_dump` de `curichi`, porque la imagen corre el job `migraciones` y
aplica la 0018.

### Cambios de contrato (`packages/contracts`)

- [x] Sí, anunciados en el plan: 0.17.0, `ResolverRespuesta.manzana` obsoleto (siempre `null`;
  `deprecated` en el OpenAPI). Sin ruptura de tipos.

### Hallazgos fuera de la carpeta designada (documentados, NO tocados)

Ver la tabla de arriba.

### Definition of Done (CLAUDE.md §10)

- [x] Compila sin warnings nuevos (build 7/7, lint con el mismo warning de antes)
- [x] `pnpm lint`, `typecheck` y `test` en verde, sin regresiones contra la línea base
- [x] Al menos un test cubre el camino crítico de cada parte tocada
- [x] README propio actualizado (geo-service, web-ciudadano, panel-admin)
- [x] `.env.example` sin valores reales (`POSTGRES_SHM_SIZE` comentada)
- [x] Sin datos ficticios presentados como reales (se quitaron oficinas y acciones inventadas)
- [x] Sin cambios fuera de las carpetas designadas
- [x] Checklist de seguridad revisado por `sdd-auditor` (api-core y autenticación de la web)
