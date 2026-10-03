# Mapeo de la app, pruebas y pendientes — 2026-10-03

Documento de revisión de la rama `feat/repo/produccion-vps`. Reúne, sobre el árbol de trabajo
actual (con ~50 archivos sin commitear de otro agente de IA), el mapa de la aplicación, los cambios
sin commitear agrupados por área, lo que se hizo hoy, los resultados de pruebas con veredictos
honestos, el estado de la base de datos y las conexiones, y los problemas pendientes ordenados por
severidad. Lo que no se ejecutó se marca como **no verificado** y se dice por qué.

Fuentes: mapeo previo verificado (`mapas.txt`, lectura del código y pruebas en vivo de agentes
hermanos), `git diff --stat`, y las corridas de esta tanda (línea base, auditoría de base de datos,
lanzador, runner E2E, arreglo del login y despliegue a la pila Docker). Nada se commiteó.

---

## 1. Mapa de la aplicación

Monorepo pnpm + Turborepo. Cinco partes más un paquete de contratos transversal (CLAUDE.md §4).

| Carpeta | Qué hace |
|---|---|
| `apps/web-ciudadano` | Frontend público (Next.js 16 + MapLibre). Mapa con distritos/UV y puntos, hoja de detalle, flujo de reporte en 4 pasos (ubicación del teléfono obligatoria con círculo de 60 m, profundidad/frecuencia, foto con la cámara en la página, revisión), login/alta de cuenta ciudadana, «Mis reportes». Habla con los servicios por rutas relativas que reenvía `src/proxy.ts`. |
| `apps/panel-admin` | Frontend administrativo (Next.js 16, puerto interno 3100). Login técnico/admin/ejecutivo, bandeja `/reportes` (tabla + mapa sincronizados), detalle con moderación (validar, rechazar, resolver, fusionar, reabrir; retirar solo admin), indicadores, `/ejecutivo` y administración de capas. Sondeo cada 10 s con `x-curichi-sondeo`. |
| `services/api-core` | Backend Fastify, único que escribe reportes. Login y sesión por cookie, alta de cuentas, creación de reportes con radio de 60 m, demora `publicar_en`, cupo diario, fotos a WebP, máquina de estados (§7.3), vista pública con jitter y vista técnica, exportación, indicadores y resumen ejecutivo. La visibilidad vive en un solo lugar (`condicionPublico`/`condicionPublicado`). |
| `services/geo-service` | Servicio geoespacial Fastify, solo lectura. `POST /resolver` (point-in-polygon con GIST → distrito/UV/manzana), capas GeoJSON y teselas al vuelo con huella del contenido, agregados por UV, puntos críticos. |
| `packages/contracts` | Única fuente de verdad: enums y etiquetas, función pura de severidad, esquemas Zod, OpenAPI 3.1 generado desde Zod, configuración de dominio. Lo consumen todas las partes. |
| `packages/db` | Esquema Drizzle (`public` y `geo`), migraciones SQL numeradas (runner `src/migrar.ts`), seeds sintéticos y recálculo de puntos críticos. Cliente tipado para `api-core` y `geo-service`. |
| `pipelines/geodata-etl` | ETL en TypeScript con mapshaper (ADR 0002): shapefile → GeoJSON → PostGIS. Reproyecta, limpia topología, simplifica y carga `DM_UV_MZ_2025` (16 distritos, 576 UV, 27 527 manzanas). |
| `e2e` | Playwright transversal (recorrido ciudadano → técnico → mapa → exportación). 185 tests en 24 archivos. |
| `infra` | Dockerfiles, `docker-compose.yml`, Caddyfile del proxy HTTPS, init de PostGIS. |

**Cómo se conectan.** Topología de la pila (perfiles `servicios` + `minio`):

```
navegador ──HTTPS──▶ Caddy (proxy, :443/:80, único que publica puertos)
                      │  enruta por Host:
                      ├─ localhost        ▶ web-ciudadano (Next, 3000 interno)
                      └─ panel.localhost  ▶ panel-admin   (Next, 3100 interno)
                                             │ /api/* y /geo/* los reenvía src/proxy.ts
                                             ▼
                               api-core (3001) ◀──POST /geo/v1/resolver──▶ geo-service (3002)
                                             │                                  │
                                             ├──────────── PostGIS (curichi-postgis, 127.0.0.1:5432)
                                             └──────────── MinIO / disco (fotos)
```

Caddy termina TLS con CA interna y reescribe `X-Forwarded-For` con la IP del socket. Las apps Next
no hablan con la base: todo pasa por `api-core` (escritura) y `geo-service` (lectura).

**Cómo se levanta.** Doble clic en **`Mi-Curichi.exe`** (raíz del repo): levanta la pila completa en
Docker (perfiles `servicios` + `minio`), espera a que cada servicio quede sano y abre
`https://localhost`. Alternativa manual: `docker compose up -d postgis` + `pnpm db:migrate` +
`pnpm etl:load` + `pnpm dev`. El binario se regenera con `scripts/lanzador/compilar.ps1` y no se
versiona (`.gitignore`).

**Cómo se comparte.** El modo compartir abre dos túneles `cloudflared` contra Caddy (uno para
`localhost` y otro para `panel.localhost`, con el Host reescrito) y entrega URLs
`https://<x>.trycloudflare.com`. Es una forma de demo, no de producción: la topología del túnel
tiene limitaciones conocidas (IP única compartida, `panel_url` fija) que se detallan en §6.

---

## 2. Cambios sin commitear del otro agente, por área

`git diff --stat`: 69 archivos, +2922 / −694, más 11 sin seguir (`??`). Agrupados por área y
propósito. Los hallazgos vienen del mapeo verificado (`mapas.txt`).

**contracts (cambio de contrato, sin versionar).**
`packages/contracts/src/dominio/enums.ts`, `severidad.ts`, `esquemas/auth.ts`, `esquemas/reporte.ts`
+ `openapi.yaml` regenerado. Agregan la frecuencia `agua_estancada` (5 puntos; banda crítica 11–13),
`LoginSchema` acepta usuario sin `@` (lo completa `@curichi.local`) y baja la contraseña mínima a 1,
y `canonico_id` de fusión acepta un «ID corto» de 8 hex. **`SEVERIDAD_VERSION` sigue en 2**
(verificado: `severidad.ts:9`) y **`package.json` sigue en `0.15.0` sin entrada en
`CHANGELOG.md`** (verificado). Propósito aparente: ID cortos para moderar y una frecuencia nueva.

**db (migración y seeds).**
`packages/db/src/esquema/index.ts` (+`agua_estancada`), `migraciones/0017_frecuencia_agua_estancada.sql`
(**sin seguir en git**), `src/seeds/samples.ts` (contraseñas por defecto ahora iguales al usuario:
`admin`/`admin`, etc.) y `scripts/sembrar-30-puntos.sql` (**sin seguir**: 30 reportes `validado`
inventados, con distrito/UV a mano y sin marca de sintético). Propósito: datos para la demo.

**api-core (comportamiento y autorización).**
`src/rutas/admin.ts:165` abre `GET /exportar` al rol **ejecutivo** (antes técnico/admin).
`src/rutas/moderacion.ts` y `reportes.ts` aceptan ID cortos de 8 hex. Las pruebas se ajustaron.
El `README.md` del servicio dice que el ejecutivo exporta; CLAUDE.md no se actualizó. (El atajo de
login que describía el mapeo ya no está: ver §3.)

**panel-admin.**
`Mapa.tsx` rehecho (puntos solo como círculos del canvas, selector de capas, clic en UV/distrito),
`reportes/page.tsx` con consulta propia del mapa (500 filas, sondeo), `TablaReportes.tsx` con fila
clicable, `ReporteUnitarioModal.tsx` nuevo (ficha imprimible), `PanelEjecutivo.tsx` con mapa, lista
de UV, tarjetas de criterios y exportación CSV/GeoJSON (contra §4.4), `FactoresSeveridad.tsx` sobre
13 puntos, `FormularioLogin.tsx` con «Usuario o Email».

**web-ciudadano.**
`PedirUbicacion.tsx` con botón **«Usar ubicación de prueba (Santa Cruz)»** visible en todos los
estados, `ubicacion-dispositivo.ts` con `simular()` (ancla fija −17.7833,−63.1821) y reemplazo de
timestamps viejos por «ahora», `FormularioReporte.tsx` (frecuencia `agua_estancada`, Enter global que
avanza de paso, sincronización lat/lon), `FormularioAcceso.tsx` con login por usuario,
`AvisoPuntoResuelto.tsx` nuevo (aviso al reportante cuando su reporte pasa a resuelto),
`Mapa.tsx`/`VistaMapa.tsx` con clic por relleno de distrito/UV, `HojaDetalle.tsx` con enlace al panel.

**e2e.**
`panel-ejecutivo.spec.ts` espera ahora 200 para el ejecutivo en `/exportar`. Tres scripts sueltos
**sin seguir** (`e2e/auditoria-{exhaustiva,profunda,visual}.mjs`): Playwright fuera del runner, con
rutas de otra herramienta y «ok» sin comprobar nada.

**sdd / .claude y docs.**
Gran reescritura de `.claude/skills/sdd/*` y `.claude/agents/sdd-*` (proceso SDD con línea base),
más `docs/proceso/sdd.md`, `docs/sdd/README.md`, `CONTRIBUTING.md`, `README.md` y `.gitignore`.

**Nota de alcance.** El conjunto toca a la vez las cinco partes, contracts, db, e2e y la raíz, sin un
plan ni autorización por parte registrados en el repo (CLAUDE.md §5.2, reglas 1 y 9). No se puede
confirmar si el usuario lo aprobó; se deja como dato.

---

## 3. Lo hecho hoy

1. **Lanzador nuevo (`Mi-Curichi.exe`).** Un solo ejecutable reemplaza los cinco lanzadores viejos
   (`iniciar.bat/.ps1`, `compartir-amigos.bat/.ps1`, `Iniciar-Curichi.exe`, `scripts/Launcher.cs`),
   que eran sin seguir y se movieron (no se borraron) al scratchpad. Nuevos:
   `scripts/lanzador/MiCurichi.cs`, `compilar.ps1`, `README.md`; `/Mi-Curichi.exe` agregado a
   `.gitignore`; sección «Arrancar con un clic» en `README.md`. Corrige los defectos conocidos: no
   toca el `.env`, no edita `hosts` ni pide elevación, no abre `localhost:3100`, no imprime
   contraseñas, sin rutas fijas, mata los túneles con un Job Object, nunca hace `down` ni borra
   volúmenes. Compiló sin warnings; `--ayuda` y `--estado` dan verde. **No ejecutado:** `--iniciar`
   y las opciones que cambian la pila se dejaron para otra fase (el despliegue de hoy sí usó
   `--iniciar`, ver punto 2).

2. **Puertos de web/panel cerrados.** El WIP publicaba `3000`/`3100` en `0.0.0.0` (saltándose Caddy).
   Hoy `docker-compose.yml` quedó **igual que HEAD** (verificado: `git status` no lo marca; HEAD no
   publica esos puertos). Tras reconstruir y relanzar con `Mi-Curichi.exe --iniciar`, `netstat`
   confirma que nadie escucha `3000` ni `3100`; solo Caddy publica `80`/`443`. `postgis`, `minio`,
   `api-core` y `geo-service` siguen atados a `127.0.0.1`.

3. **Puerta trasera del login quitada.** El árbol WIP tenía en `services/api-core/src/rutas/auth.ts`
   un bloque `esCuentaTest` que aceptaba `admin/admin`, `tecnico/tecnico`, etc. aunque el hash no
   coincidiera, sin condición de entorno. Se eliminó: `auth.ts` quedó **idéntico a HEAD** (verificado:
   `git diff HEAD -- auth.ts` vacío). En `test/autenticacion.test.ts` se reemplazaron las 3 pruebas
   del atajo por 2 anti-backdoor. En vivo, el login de las 4 cuentas del seed da 200 con la
   contraseña real y la contraseña de atajo da **401 CREDENCIALES_INVALIDAS**.

4. **Runner E2E con base aparte (`curichi_e2e`).** Nuevo `e2e/scripts/correr-local.mjs` (Node ESM,
   sin dependencias). Levanta api-core, geo-service, web (3000) y panel (3100) con `next dev
   --webpack` contra una base **`curichi_e2e`** en el mismo Postgres —nunca contra `curichi`—, con
   el entorno de prueba de `playwright.config.ts`, y corre Playwright. Chequea puertos, RAM y Docker;
   migra, carga capas y siembra solo en base nueva o con `--resembrar`. Se corrigió un bug de comillas
   en Windows antes de cualquier corrida. Se ejecutó con los cinco grupos (ver §4).

5. **Proceso `/sdd` con línea base.** Se reescribieron `.claude/skills/sdd` (SKILL, matriz, 6
   plantillas) y los 6 agentes `sdd-*` para que ningún subagente cambie código sin medir antes:
   fase FB de línea base, preflight del redactor y del implementador, regresión = BLOQUEANTE,
   prueba en vivo en la pila Docker y modo túnel. Los subagentes pasan a Opus 4.8
   (`claude-opus-4-8`). Detalle en `docs/proceso/sdd.md`.

---

## 4. Resultados de pruebas

### Línea base (estática y unitaria) — VERDE salvo lint

Medida sobre el árbol actual, sin tocar código. Los 7 paquetes pasan typecheck + test: **1535
tests passed, 11 skipped**, 135 archivos. `e2e` compila (`tsc` EXIT 0) y lista 185 tests en 24
archivos. El build de `contracts`+`db` regenera un OpenAPI **idéntico** al versionado (sin drift).

| Paquete | typecheck | test |
|---|---|---|
| contracts | verde | verde — 214 passed (14 arch.) |
| db | verde | verde — 227 passed (22 arch., bases PGlite efímeras, no toca `curichi`) |
| geo-service | verde | verde — 57 passed (5 arch.) |
| api-core | verde | verde — 376–377 passed + 11 skipped (29 arch.) |
| web-ciudadano | verde | verde — 425 passed (30 arch.) |
| panel-admin | verde | verde — 214 passed (30 arch.) |
| geodata-etl | verde | verde — 21 passed (3 arch.) |

**Único rojo: `pnpm lint` (biome, EXIT 1, 11 errores)**, todo dentro del WIP sin commitear: formateo
pendiente en 5 archivos, 3 scripts scratch `e2e/auditoria-*.mjs` sin seguir, y 2 reglas de fondo
(`useHookAtTopLevel` en `sesion.tsx:181`, `useKeyWithClickEvents` en `TablaReportes.tsx:88`). Sin
fallos intermitentes.

### E2E por grupo y spec — 175 ok, 8 fallos (todos explicados)

Corrida con el runner contra `curichi_e2e` (la base `curichi` quedó intacta: 37 reportes). La
base de prueba se preparó con 17 migraciones, capas reales (16 distritos, 576 UV, 27 527 manzanas) y
el seed.

| Grupo | Resultado | Fallos |
|---|---|---|
| G1 (api-contratos, separación pública/técnica, cuenta ciudadana, acceso al panel, publicación diferida) | 45/45 verde | — |
| G2 (mapa público, selección, tráfico, datos reales, navegación) | 30 verde + 1 intermitente | `navegacion:27` falló el 1.er intento por compilación en frío de `/inicio` y pasó en el reintento |
| G3 (formulario, sumidero y fotos, ubicación, cámara, resiliencia, quitar campos web) | 54 verde, 1 rojo, 1 salteado por diseño | `quitar-campos-web:271`: espera la banda crítica [11,12] y ahora es [11,13] |
| G4 (recorrido completo, panel técnico, al día, ejecutivo, quitar campos panel) | 28 verde, 7 rojos | `recorrido-completo:40` («7/12» vs «7/13») y 4 en cascada; `quitar-campos-panel:86` («de 12» vs «de 13»); `panel-ejecutivo:236` (la pantalla tiene mapa) |
| G5 (accesibilidad, responsive, CSP) | 18/18 verde | — |

Siete de los ocho fallos son pruebas desactualizadas por la frecuencia nueva `agua_estancada` (el
máximo de severidad pasó de 12 a 13). El otro es el mapa de `/ejecutivo`, que contradecía
CLAUDE.md: el usuario decidió conservarlo y quitar la exportación del ejecutivo (ver §8).

### En vivo por función — VERDE (pila Docker tras el despliegue de hoy)

Tras reconstruir api-core y geo-service y relanzar con `Mi-Curichi.exe --iniciar`:

| Comprobación | Resultado |
|---|---|
| `https://localhost/` | 200 |
| `GET /api/v1/configuracion` | JSON ciudad Santa Cruz de la Sierra (BO, America/La_Paz) |
| `https://panel.localhost/login` | 200 |
| `GET /ready` (api-core) | `{ok:true, db:ok, geo:ok, fotos:ok, degradado:false}` |
| Login 4 cuentas del seed | 200 cada una con la contraseña real |
| Puerta trasera (contraseña de atajo) | **401 CREDENCIALES_INVALIDAS** |
| Puertos 3000/3100 | no publicados (netstat) |
| Cabecera CSP | `script-src` con nonce + `strict-dynamic`, **sin** `unsafe-inline`; `unsafe-inline` persiste solo en `style-src` (preexistente) |

### Recorrido completo en vivo — VERDE

Con Playwright sobre la pila Docker (`https://localhost` y `https://panel.localhost`):

- **Público:** mapa con 34 puntos, capas, leyenda, detalle con distrito/UV, «NO SE HA VERIFICADO» y
  texto de limitaciones.
- **Vecina:** login escribiendo solo «vecina» → 200; reporte con GPS simulado, ajuste a 50 m (dentro
  de 60), frecuencia nueva «agua estancada», foto de la cámara simulada → WebP, envío 201; aparece en
  «Mis reportes» y en el mapa como «NO SE HA VERIFICADO».
- **Técnico:** bandeja, detalle con precisión (10 m), distancia al dispositivo (50 m) y método
  manual; modal `ReporteUnitarioModal`; **validar** → el público lo muestra «Verificado»; exportación
  CSV y GeoJSON con nota metodológica, sin recorte; indicadores.
- **Ejecutivo:** `/ejecutivo` carga. Podía exportar la vista técnica (200): corregido después por
  decisión del usuario (§8).
- **Admin:** **retirar** el reporte de prueba (validado → rechazado) → 404 público y su foto también 404.
  La base quedó limpia.
- Posible defecto menor: tras cerrar `ReporteUnitarioModal` con Escape, un clic inmediato en
  «Validar» no respondió una vez (¿capa del modal que tarda en desmontarse?). Sin confirmar.

### Túnel (cloudflared) — VERDE sin sesión

Se abrieron dos túneles propios y se cerraron al final (no quedó ningún `cloudflared`). Sin mandar
contraseñas por el túnel: `/` 200 sin redirecciones a `localhost`; CSP con nonce y sin
`x-middleware-*`; el HTML no trae URLs absolutas a `localhost`; `/api/v1/configuracion` 200;
`/api/v1/auth/yo` 401; panel `/login` 200; en Chromium el mapa dibuja 34 puntos y las capas cargan
sin errores de CSP. Un login con `Origin` del túnel y credenciales falsas da **401** (no 403), así que
un amigo con una cuenta real puede entrar. Lo que exige sesión lo prueba el usuario (§7).

---

## 5. Base de datos y conexiones (auditoría de solo lectura)

Contenedor `curichi-postgis` (127.0.0.1:5432), base `curichi`. No se ejecutó ningún
INSERT/UPDATE/DELETE/DDL.

**Migraciones.** Las 17 (0001–0017) figuran aplicadas en `_migraciones`. Hallazgos:

- **[ALTA] Deriva de la 0016.** Figura aplicada, pero su contracción **no corrió** sobre esta base:
  `usuario.ultimo_reporte_en` sigue existiendo y `curichi_api` conserva `UPDATE` sobre ella, así que
  `pnpm --filter db privilegios` sale con **código 1** («UPDATE SOBRA en `ultimo_reporte_en`»). La
  base viva quedó divergente de lo que produciría un despliegue limpio desde el repo.
- **[MEDIA] 0017 sin commitear.** `0017_frecuencia_agua_estancada.sql` está aplicada y en el esquema,
  pero el archivo está **sin seguir en git** y no tiene prueba propia. Un despliegue limpio desde el
  repo versionado no crearía el valor de enum `agua_estancada` (ya hay 2 reportes que lo usan).
- **[MEDIA] Causa raíz.** El runner (`packages/db/src/migrar.ts`) rastrea por **nombre, sin
  checksum**: editar o commitear tarde una migración ya registrada no se detecta. Fue lo que pasó con
  la 0016.

**Datos.** 37 reportes (32 `validado`, 3 `duplicado`, 2 `nuevo`; todos publicados; 2 con
`agua_estancada`). Sin FKs huérfanas. Acumulación de datos de prueba (BAJA): 441 usuarios (414
`e2e_`, 429 `@curichi.test`), 765 sesiones (738 inactivas > 2 días), 1638 filas de auditoría. El
script `sembrar-30-puntos.sql` inserta 30 reportes con `autor_id` NULL (contradice el invariante
post-0009) y `validado_por` fijo a un técnico que sí existe.

**Conexiones.** 9 backends, 1 activo, 0 ociosos > 10 min; `max_connections=100`, pool 8/proceso. Sin
conexiones ajenas a `curichi`. Stats del planner desactualizadas (`last_autoanalyze` nulo;
`n_live_tup` estimaba 6 usuarios vs 441 reales).

**Host.** Todo lo de la app lo publica Docker; no hay node/next/cloudflared sueltos ni PGlite en
5433. `postgis`/`minio`/`api`/`geo` solo en `127.0.0.1`.

---

## 6. Problemas pendientes (por severidad)

Casi todos son WIP sin commitear de otro agente; no se tocaron. Citas `archivo:línea` del mapeo
verificado.

### Alta

1. **Deriva de la migración 0016** — `base curichi` + `packages/db/migraciones/0016_contraccion.sql`.
   `pnpm --filter db privilegios` en rojo. Propuesta: ver decisión D7.
2. **Puertos sin Caddy (si vuelven a abrirse)** — `docker-compose.yml` (WIP revertido hoy). Publicar
   `3000`/`3100` en `0.0.0.0` con `PROXY_DE_CONFIANZA=1` y `TRUST_PROXY=1` deja elegir la IP y saltar
   rate limit, freno de login, tope de altas y antispam. **Cerrado hoy**; vigilar que no vuelva en el
   próximo WIP. Es el Compose de producción (ADR 0006).

(La puerta trasera del login, que el mapeo marcaba como ALTA, se **eliminó hoy** — §3.3.)

### Media

3. **Exportación abierta al ejecutivo** — `services/api-core/src/rutas/admin.ts:165`. Ver decisión D1.
4. **`panel_url` fija para amigos** — `services/api-core/src/rutas/auth.ts:307` y
   `apps/web-ciudadano/src/componentes/HojaDetalle.tsx:59`. Ver decisión D4.
5. **IP única por el túnel** — `infra/proxy/Caddyfile:98`. Ver decisión D5.
6. **Demora de publicación en 0** — `.env:40-41` (`REPORTE_DEMORA_PRIMERO_S=0`,
   `REPORTE_DEMORA_SIGUIENTES_S=0`). Los reportes se publican al instante, contra ADR 0006. Es
   configuración local (no código, no WIP). Propuesta: comentar esas líneas y recrear solo api-core
   (`docker compose ... up -d api-core`) para producción; dejarlas solo para demos conscientes.
7. **Severidad `agua_estancada` sin versionar** — `packages/contracts/src/dominio/severidad.ts:9` y
   `enums.ts`. Ver decisión D3.
8. **0017 sin commitear y sin prueba** — `packages/db/migraciones/0017_*.sql`. Propuesta: commitear
   (Parte 4) y agregar `migracion-0017-*.test.ts` como las 0011–0016.
9. **Doble manejador de clic en el mapa del panel** — `apps/panel-admin/src/componentes/Mapa.tsx:259`
   (y `web-ciudadano/Mapa.tsx:660`). El clic en un punto puede disparar a la vez el detalle y el
   filtro por UV. Deducido del código, no visto en el navegador. Propuesta: `stopPropagation` entre
   capas o una sola capa de clic.
10. **Enter global en el formulario de reporte** — `apps/web-ciudadano/src/componentes/FormularioReporte.tsx:924`.
    Intercepta Enter en botones, enlaces y el diálogo de la cámara; rompe el uso con teclado (§14.1).
    Propuesta: acotar el `onKeyDown` a los inputs de texto, no al `<form>`.
11. **Ejecutivo con mapa/exportación/criterios** — `apps/panel-admin/src/componentes/ejecutivo/PanelEjecutivo.tsx:461`.
    Contra §4.4 («sin mapa, sin coropleta»). Además la exportación manda solo `severidad=critica` y
    omite las altas que la pantalla cuenta (`:140`). Ver también D1.

### Baja

12. **Lint en rojo** — `apps/web-ciudadano/src/lib/sesion.tsx:181` (`useHookAtTopLevel`),
    `apps/panel-admin/src/componentes/TablaReportes.tsx:88` (`useKeyWithClickEvents`), formateo
    pendiente en 5 archivos y 3 scripts scratch. Rompe el DoD de CI (§10.3). Propuesta: `biome check
    --write` para el formato, `biome-ignore` justificado o reestructurar para las 2 reglas, y mover o
    ignorar los scratch `e2e/auditoria-*.mjs`.
13. **Resolución de ID corto sin filtro de visibilidad** — `services/api-core/src/rutas/reportes.ts:418`.
    Oráculo de existencia por el mensaje 404 y recorrido de tabla con `LIKE`. Riesgo práctico bajo
    (32 bits de prefijo).
14. **Datos de prueba acumulados** — base `curichi` (441 usuarios, 765 sesiones, 1638 auditoría). Ver
    decisión D8.
15. **`sembrar-30-puntos.sql`** — `autor_id` NULL, distrito/UV a mano (contra regla 5), `geom_publico`
    sin redondear, sin auditoría, sin marca de sintético (contra §10.3). Propuesta: no usarlo como
    dato realista; si se mantiene, marcarlo sintético y agregar `autor_id` de una cuenta de siembra.
16. **Etiquetas de frecuencia cambiadas** — `packages/contracts/src/dominio/enums.ts:110`.
    `permanente` pasa a mostrarse como «Cada lluvia»: cambia el significado de reportes viejos sin
    migrar datos. Ligado a D3.
17. **CHANGELOG de contracts sin entrada** — `packages/contracts/package.json:3` sigue en `0.15.0`
    con 3 cambios de contrato. Ligado a D3. Verificado: el CHANGELOG termina en 0.15.0.
18. **Checksum de migraciones** — `packages/db/src/migrar.ts`. Propuesta: columna `sha256` en
    `_migraciones` y fallo si una migración ya aplicada cambió de contenido.

### Decisiones que necesita tomar el usuario

- ~~**D1 — Exportación para el ejecutivo.**~~ **Resuelta (2026-10-03, §8):** mapa sí, exportar no. ¿Se mantiene abierto `GET /exportar` al rol ejecutivo
  (`admin.ts:165`), que le entrega la vista técnica con coordenada exacta y `autor_id`, o se vuelve a
  técnico/admin como dice §7.5 y §13? Si se mantiene, hace falta ADR y actualizar CLAUDE.md.
- **D2 — Botón «Usar ubicación de prueba» en producción.** `apps/web-ciudadano/src/componentes/PedirUbicacion.tsx:154`
  permite reportar sin compartir la posición real, en todos los estados y en el build de producción
  (anula §3.1.4, §4.3, §13 y ata coordenadas de Santa Cruz al código, contra ADR 0004). ¿Se retira,
  se condiciona a un entorno de demo, o se deja?
- **D3 — Versión de severidad y CHANGELOG.** `agua_estancada`=5 y banda 11–13 entraron con
  `SEVERIDAD_VERSION=2` sin cambiar y sin entrada en `CHANGELOG.md` (§9.1 exige versionar). ¿Se sube
  la versión, se valida la matriz con el técnico municipal y se migran los datos de `permanente`?
- **D4 — `panel_url` para amigos.** Por el túnel, `panel_url` apunta a `panel.localhost` de la
  máquina del amigo (enlace roto). No se puede cambiar sin recrear api-core. ¿Se ajusta en el modo
  compartir o se acepta como límite de la demo?
- **D5 — IP compartida por el túnel.** Todos los amigos comparten una IP para rate limit, freno de
  login, altas y antispam (`Caddyfile:98`): pocos usuarios bastan para 429 y un amigo que falla el
  login bloquea a todos. ¿Se sube el límite en modo compartir, se lee `Cf-Connecting-IP`, o se
  acepta?
- **D6 — Demora de publicación.** ¿Se restaura la demora de 60/240 s (ADR 0006) quitando
  `REPORTE_DEMORA_*_S=0` del `.env`, o se deja en 0 solo mientras sea demo?
- **D7 — Deriva de la 0016 en la base local.** Opción A: `REVOKE UPDATE (ultimo_reporte_en) ... FROM
  curichi_api; ALTER TABLE usuario DROP COLUMN ultimo_reporte_en;` sobre la base local (revisar antes
  que ningún api-core la escriba). Opción B: recrear la base desde cero (la tarea actual prohíbe
  recrear `postgis`). Objetivo: `pnpm --filter db privilegios` en verde.
- **D8 — Contraseñas simples del seed y limpieza.** *Contraseñas resueltas (2026-10-03, §8): el usuario las quiere simples; queda la limpieza.* El seed usa contraseñas iguales al usuario
  (`samples.ts:157`) y el modo compartir las reparte. ¿Se vuelve a `curichi-*-local` (o algo no
  adivinable) y se corre una limpieza de las 414 cuentas `e2e_` y sesiones inactivas?

---

## 7. Qué probar desde el celular por el túnel (con sesión)

Checklist para el usuario cuando abra la URL `trycloudflare` del túnel en el teléfono:

1. **Ver el mapa sin cuenta.** Abre `https://<x>.trycloudflare.com`, confirma que carga el mapa con
   puntos y que al tocar un punto se abre la hoja de detalle con distrito, UV, severidad y estado.
2. **Crear cuenta ciudadana y entrar.** Regístrate con un correo, inicia sesión y verifica que
   «Reportar un punto» pide la ubicación.
3. **Reportar con la ubicación real del teléfono.** Comparte la ubicación (no uses «ubicación de
   prueba»), ajusta el punto dentro del círculo de 60 m, saca una foto con la cámara en la página,
   completa profundidad/frecuencia/descripción y envía. Confirma que aparece la cuenta regresiva.
   (Ojo: con la demora en 0 el reporte se publica al instante; ver D6.)
4. **Mis reportes.** Verifica que tu reporte aparece en «Mis reportes» con su foto y estado «NO SE HA
   VERIFICADO».
5. **Cupo diario.** Intenta enviar un 4.º reporte el mismo día y confirma el `429 CUOTA_DE_REPORTES`
   («Ya enviaste los 3 reportes de hoy»).
6. **Que la foto del reporte se vea en público** desde otra sesión o sin iniciar sesión.
7. **Panel técnico (si probás con cuenta de rol).** Si entrás como técnico/admin, revisá que el botón
   «Panel técnico» no abre (`panel_url` apunta a tu máquina, D4): es el límite conocido del túnel, no
   un reporte que subiste.
8. **Límites compartidos.** Si varios amigos usan el túnel a la vez, anotá si aparecen `429
   RATE_LIMIT` o `DEMASIADAS_CUENTAS`: es la IP única del túnel (D5), esperable.

> **Importante:** no compartas la URL del panel ni cuentas con rol técnico/admin mientras las
> contraseñas del seed sigan siendo triviales (D8). La puerta trasera ya no existe (§3.3), pero
> `admin/admin` se adivina al primer intento.

---

## 8. Arreglos para subir a `main` (2026-10-03, tarde)

Decisiones del usuario:

- **Ejecutivo: mapa sí, exportar no.** `GET /api/v1/exportar` vuelve a `requerirRol('tecnico', 'admin')`;
  `/ejecutivo` conserva el mapa de distritos y UV y no tiene botones de exportar. `CLAUDE.md` §1 y §4.4
  lo dicen. Pruebas: `services/api-core/test/ejecutivo.test.ts` (403) y `e2e/tests/panel-ejecutivo.spec.ts`.
- **Contraseñas de desarrollo cortas.** Por defecto, el nombre del rol (`admin`, `tecnico`, `vecina`,
  `ejecutivo`) en el seed, la E2E, el runner, `.env.example` y la documentación; se entra con el
  usuario solo. El seed se niega a correr con `NODE_ENV=production`. `Mi-Curichi.exe` las muestra en el
  estado local y nunca en el modo compartir.

Arreglos:

- Lint del repo en 0 errores: `sesion.tsx` sin hook condicional (`useSesionOpcional` llama siempre
  los mismos hooks), `TablaReportes.tsx` con el `stopPropagation` en el enlace (un subagente lo había
  devuelto a HEAD; se recuperó el cambio del otro agente desde una copia), formatos pendientes.
- `packages/db/test/migracion-0017-frecuencia-agua-estancada.test.ts` (9 pruebas).
- Pruebas E2E de severidad al máximo 13 y del ejecutivo; `e2e/auditoria-*.mjs` fuera del repo
  (rompían el lint y usaban puertos que ya no existen).
- Seguridad de dependencias: `next` 16.3.5 → **16.3.6** (RCE crítica en `next/og`) y override
  `brace-expansion: ^5.0.11` (DoS alto, transitiva de api-core). `pnpm audit --audit-level high`
  pasa (quedan 6 moderadas).

Verificación:

| Comprobación | Resultado |
|---|---|
| `pnpm secretos` | sin hallazgos |
| `pnpm audit --audit-level high` | verde (6 moderadas) |
| OpenAPI regenerado | idéntico al versionado |
| `pnpm lint` | 0 errores |
| `turbo run typecheck` | 9/9 |
| Tests | contracts, web, panel, api-core, geo, etl en verde; `db` 236/236 solo (en la corrida conjunta un worker murió por falta de RAM) |
| `turbo run build` | 7/7; las dos apps otra vez con `next` 16.3.6 |
| Redespliegue con `Mi-Curichi.exe` | 7/7 sanos; 4 logins 200; ejecutivo `/exportar` 403 |
| Redespliegue final (api-core, web y panel con `next` 16.3.6) | 7/7 sanos; `vecina`/`vecina`, `tecnico`/`tecnico`, `admin`/`admin` y `ejecutivo`/`ejecutivo` dan 200 con el usuario solo; `/exportar`: técnico y admin 200, ejecutivo y vecina 403 |
| Recorrido en vivo y túnel | verde (ver §4) |
| E2E G1–G5 después de los arreglos | **no corrida**: la RAM libre (~1,5–2 GB) no llega al mínimo del runner (2,5 GB). Corre en el CI de GitHub al subir a `main`, o localmente cerrando el navegador |
