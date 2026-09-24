# Traspaso — estado exacto al 2026-09-15

Este documento dice **dónde quedó el trabajo**, **qué funciona verificado**, **qué falta** y **cómo retomarlo**. Léelo junto con `CLAUDE.md`, que es el manual operativo y no cambia con el traspaso.

- **Fase 0 (manual):** aprobada.
- **Fase 1 (local):** las cinco partes corren y la tarea 9 está cerrada: los E2E se ejecutaron (17 en verde, 1 omitido en móvil a propósito), la revisión de seguridad está escrita en `docs/seguridad/revision-fase1.md` y el ADR 0002 registrado. Falta la **aprobación explícita del usuario** para cruzar a la Fase 2.
- **Fase 2 (web):** no empezada. Requiere decisiones del usuario (§6).

> **Fase 2 de endurecimiento (2026-09-15).** Sobre lo anterior se hizo una segunda pasada
> centrada en lo que quedaba pendiente. Lo más importante:
> el recálculo de puntos críticos pasó a ser **incremental** (medido: de 11 964 ms a 17 ms con
> 10 000 reportes, con 9 tests que prueban que da exactamente el mismo resultado que el completo);
> contraseñas a **Argon2id** con migración transparente de los hashes viejos; **idempotencia** en
> la creación de reportes; freno de fuerza bruta por cuenta además de por IP y caducidad de sesión
> por inactividad; **CSP** y `Permissions-Policy` en las dos apps; `/metrics` y `X-Request-Id`
> de punta a punta; conteo acotado y tope de `OFFSET` en el listado; `/agregados` en una sola
> pasada y con caché; `pnpm audit` de 6 avisos (3 altos) a **cero**; escáner de secretos en
> pre-commit y CI. Detalle en §7.
>
> **Auditoría del 2026-09-14.** Se revisó el repositorio completo y se corrigieron, entre otros:
> `pnpm install` (fallaba, con él todo el CI), el formulario público de reporte (no se podía
> enviar desde el navegador: dos fallos independientes de validación), las transacciones emitidas
> sobre un `Pool` (no eran transacciones), una carrera en las transiciones de estado, el rate
> limit saltable falsificando `X-Forwarded-For`, una ruta interna de `geo-service` abierta al
> público, el jitter reversible desde el `id`, la inyección de fórmulas en el CSV exportado y la
> retención de datos de §13, que no existía. El detalle, en §3 y en la revisión de seguridad.

---

## 1. Cómo levantar todo desde cero

Requisitos ya presentes en la máquina de desarrollo: Node 24 (nvm) y pnpm 12. **No** hacen falta Docker, Homebrew, GDAL ni Python: la Fase 1 corre sin ellos (ver [ADR 0002](decisiones/0002-modo-local-sin-docker-y-etl-en-typescript.md) y §4 de este documento).

```bash
pnpm install

# Terminal 1 — PostGIS local sin Docker (PGlite + pglite-socket en 127.0.0.1:5433)
pnpm db:local

# Terminal 2 — datos. Solo la primera vez o al reiniciar la base:
pnpm --filter geodata-etl samples:generar          # muestra sintética (opcional si ya hay capas reales)
pnpm etl:run  -- --version DM_UV_MZ_2025 --forzar  # ver §3.1 sobre --forzar
pnpm etl:load -- --version DM_UV_MZ_2025 --activar
pnpm db:seed:samples                               # reportes sintéticos + usuarios locales

# Terminal 2 — servicios y apps
pnpm --filter geo-service dev    # http://127.0.0.1:3002
pnpm --filter api-core dev       # http://127.0.0.1:3001  (OpenAPI en /docs)
pnpm --filter web-ciudadano dev  # http://localhost:3000
pnpm --filter panel-admin dev    # http://localhost:3100
```

`pnpm dev` (Turborepo) arranca los cuatro servicios juntos y **ya no** intenta levantar la base: `packages/db` dejó de tener script `dev` y la base se levanta solo con `pnpm db:local` (§3.6, corregido).

**Usuarios locales** creados por el seed, solo para desarrollo: `tecnico@curichi.local` / `curichi-tecnico-local` y `admin@curichi.local` / `curichi-admin-local` (se cambian con `SEED_TECNICO_PASSWORD` y `SEED_ADMIN_PASSWORD`).

---

## 2. Qué está verificado funcionando

Comprobado ejecutándolo, no por lectura del código:

| Área | Evidencia |
|---|---|
| Pruebas unitarias y de integración | 5 paquetes en verde: contracts 20, db 5, geo-service 9, api-core 18, geodata-etl 7. `pnpm test` por paquete |
| Lint y tipos | `pnpm exec biome check .` limpio y `tsc --noEmit` limpio en los 7 paquetes |
| Base de datos sin Docker | PGlite 0.5.8 + PostGIS 3.6 (GEOS, PROJ) por socket en 5433, migraciones idempotentes |
| ETL con datos reales | Las tres capas de `DM_UV_MZ_2025` procesadas: 16 distritos, 576 UV, 27 527 manzanas, reproyectadas de EPSG:32720 a EPSG:4326 |
| Point-in-polygon real | La plaza 24 de Septiembre resuelve a Unidad Vecinal CI, Distrito 11, con su manzana |
| API de negocio | Crear reporte, 404 por moderación previa, validar, reclasificar, fusionar, exportar CSV y GeoJSON, indicadores, rate limit, honeypot, 422 fuera de cobertura |
| Fotos | Reprocesadas con sharp; el test comprueba que el objeto guardado no conserva EXIF ni GPS |
| Teselas vectoriales | `manzana` (26,9 MB) se sirve por teselas generadas al vuelo; una tesela z16 del centro responde en 0,06 s |
| Apps web | Ambas compilan y responden 200; el mapa público muestra Santa Cruz con las tarjetas y los KPI reales |
| E2E transversales (2026-09-14) | `pnpm test:e2e` con la pila levantada: 17 en verde, 1 omitido a propósito. Cubre el recorrido ciudadano → técnico → mapa público → exportación, contratos de API, EXIF y accesibilidad con axe |
| Suite unitaria y de integración (2026-09-14) | 114 tests en 7 paquetes: contracts 20, panel-admin 19, web-ciudadano 8, geodata-etl 7, db 10, geo-service 12, api-core 38 |
| Cabeceras y rate limit (2026-09-14) | Comprobado con `curl`: CSP/nosniff/X-Frame-Options en api-core, nosniff en geo-service, y 125 peticiones seguidas a geo-service dan 115 × 200 y 10 × 429 |
| Migraciones (2026-09-14) | 0001 y 0002 aplican desde cero sobre PGlite + PostGIS 3.6 y volver a arrancar no reaplica nada |

---

## 3. Defectos y tareas pendientes, en orden de prioridad

### 3.1 El ETL exigía `--forzar` con los datos reales — CORREGIDO (falta confirmar con datos reales)
`pnpm etl:run -- --version DM_UV_MZ_2025` se detiene porque, al resolver los 21 solapes entre distritos, dos de ellos cambian de área más del 0,1 % permitido. El cambio real del área total de la capa es **0,0135 %**, es decir, despreciable.

**Hecho:** se separaron los dos umbrales, que era la causa raíz. `tolerancia_cambio_area` (0,1 %)
sigue controlando el área **total** de la capa, y `tolerancia_cambio_area_feature` (1 %) controla
el área de **una** feature. Resolver un solape mueve área de un polígono a su vecino: el total
apenas varía y los dos implicados sí, así que con un único número cualquier solape legítimo
abortaba el pipeline. Todo cambio se sigue listando en `reporte_calidad.md`, pase o no el umbral.

**Dónde:** `pipelines/geodata-etl/src/{config,pipeline}.ts` y `config/capas.yaml`.

**Pendiente:** el 1 % es un valor razonado, **no medido**: `data/raw/DM_UV_MZ_2025/` no se versiona
y en este equipo no estaban los shapefiles, así que no se pudo reproducir la corrida. Al volver a
tener los datos, correr `pnpm etl:run -- --version DM_UV_MZ_2025` **sin** `--forzar` y ajustar el
valor con el número real del reporte de calidad.

### 3.2 El mapa base no quedó oscuro (medio) — SIN TOCAR a propósito

> La auditoría del 2026-09-14 no tocó nada visual: el usuario pidió expresamente dejar el diseño
> intacto hasta una fase dedicada al frontend. Queda tal cual.

El diseño pide un mapa oscuro. Se cambió de CARTO (ahora exige clave de API y estampa "API KEY REQUIRED" sobre las teselas) a OpenStreetMap, que sí carga, pero el resultado es **gris claro**, no la tinta del diseño. Los valores de `raster-brightness-max`, `raster-opacity` y `raster-saturation` ya están puestos pero no produjeron el efecto esperado.

**Dónde:** `apps/web-ciudadano/src/componentes/Mapa.tsx` y el mismo archivo en `apps/panel-admin`, constante `ESTILO_BASE`.

**Alternativas:** ajustar los valores de pintura hasta lograrlo, o usar un estilo vectorial oscuro auto-hospedado. Recordar que OSM no permite uso en producción: la Fase 2 necesita una base propia de todos modos (`CLAUDE.md` §14.3).

### 3.3 El mapa no encuadra los reportes al abrir (medio) — SIN TOCAR a propósito

> Ídem §3.2: `fitBounds` cambia el encuadre inicial, que es decisión de la fase de diseño. La
> alternativa que no toca la vista (sembrar los reportes de muestra concentrados) sigue abierta.

El mapa arranca centrado en el centro de la ciudad con zoom 13, pero los reportes sintéticos están repartidos por todo el municipio, que llega hasta la longitud −62,80. Resultado: se ven pocos o ningún punto al entrar.

**Qué hacer:** al cargar la primera página de reportes, ajustar la vista a su extensión (`fitBounds`), o sembrar los reportes de muestra concentrados en el casco urbano.

**Dónde:** `apps/web-ciudadano/src/componentes/VistaMapa.tsx` y `packages/db/src/seeds/samples.ts`.

### 3.4 Los E2E nunca se ejecutaron — HECHO
Se ejecutaron el 2026-09-14 contra la pila levantada: **17 pasan y 1 se omite** (el filtro de
severidad vive en el panel de escritorio). La sospecha era correcta: fallaron 7 de 18 en la
primera corrida.

- 5 fallos venían de un **bug real de la app**: el formulario público no se podía enviar. Ver §3.9.
- 2 eran **selectores ambiguos del test** (`strict mode violation`): `Reportar un punto` casa con
  dos enlaces en móvil, y `Crítica` casa con el chip del filtro y con cada tarjeta de esa
  severidad. Corregidos con `data-testid` y `exact: true`.

También se añadió `RATE_LIMIT_REPORTES_POR_HORA` al `webServer` de `playwright.config.ts`: la
suite crea varios reportes desde la misma IP y con el límite de producción (10/h) el resultado
dependía de cuántas veces se hubiera corrido antes.

**Cómo:** `pnpm db:local` + `pnpm db:seed:samples` en una terminal y `pnpm test:e2e` en otra
(Playwright levanta las apps por su cuenta). La primera vez:
`pnpm --filter e2e exec playwright install chromium`.

**Trampa documentada en `e2e/README.md`:** si ya hay un `pnpm dev` corriendo, Playwright lo
reutiliza y no puede pasarle el límite alto, así que tras ~10 reportes la suite empieza a recibir
429 y fallan los casos del recorrido. O se cierra ese `pnpm dev`, o se arranca con
`RATE_LIMIT_REPORTES_POR_HORA=1000`.

### 3.5 Documentos de la Parte 5 sin escribir — HECHO
- `docs/decisiones/0002-modo-local-sin-docker-y-etl-en-typescript.md`: escrito y listado en el índice.
- `docs/seguridad/revision-fase1.md`: escrito, recorriendo `checklist-pr.md` punto por punto con la
  evidencia de cada uno y distinguiendo lo verificado ejecutándolo de lo verificado por lectura.
- `.github/workflows/ci.yml`: añadido el job `e2e`, que corre en `main` y bajo demanda
  (`workflow_dispatch`), levanta la base local, siembra y sube el informe de Playwright.

### 3.6 `pnpm dev` choca con la base local — CORREGIDO
Se quitó el script `dev` de `packages/db` (queda `local`) y se añadió `db:local` al
`package.json` raíz, que `CLAUDE.md` §11 documentaba pero **no existía**.

Además, el servidor local aceptaba `maxConnections: 12`. Entre `api-core` y `geo-service` se usan
8, y al reiniciar los servicios las conexiones viejas tardan en cerrarse: el cupo se agotaba y
todo caía con `read ECONNRESET`. Ahora son 40, configurable con `PGLITE_MAX_CONEXIONES`.

### 3.7 Calidad de los datos reales, para consultar con el municipio (medio)
El ETL los procesó y los reportó; no son errores del código sino del origen. Están en `data/processed/DM_UV_MZ_2025/<capa>/reporte_calidad.md`:

| Capa | Hallazgos |
|---|---|
| Distritos (16) | 21 solapes entre distritos; 2 geometrías que PostGIS reparó con `ST_MakeValid` al cargar |
| Unidades vecinales (582 → 576) | 263 solapes, 16 huecos respecto de su distrito, 6 geometrías vacías, 7 sin código, 25 códigos repetidos |
| Manzanas (27 817 → 27 527) | 358 inválidas, 70 duplicadas, 214 vacías, 7 526 códigos repetidos, 391 sin unidad vecinal asignable |

Decisiones que se tomaron y conviene confirmar con quien entregó los datos:
- El campo `CodigoManz` viene vacío en 23 508 de 27 817 filas, así que **el código de manzana se tomó de `OBJECTID`**. Pero `OBJECTID` vale 0 en 6 440 filas, de modo que los identificadores repetidos se desambiguaron agregando un sufijo (`-2`, `-3`). Esto es aceptable porque la manzana es capa de referencia visual, no de cálculo, pero hay que decirlo.
- Distritos y unidades vecinales no traen campo de nombre: se generan como "Distrito {código}" y "Unidad Vecinal {código}". En las UV el código suele ser un nombre real ("Nueva Feria-Barrio Lindo"), así que el resultado se lee bien.

### 3.8 El formulario público de reporte no se podía enviar (crítico) — CORREGIDO

Lo destapó la primera corrida de los E2E (§3.4). Desde el navegador, el botón "Enviar reporte"
**no hacía nada**: ni petición de red ni mensaje de error. Eran dos defectos independientes, los
dos en `apps/web-ciudadano/src/componentes/FormularioReporte.tsx`:

1. `lat`, `lon`, `ubicacion_metodo` y `precision_gps_m` viven en estado de React y solo se
   inyectaban **dentro** del callback de `handleSubmit`. Pero el resolver del formulario es
   `zodResolver(ReporteCrearSchema)`, que los exige: la validación fallaba antes, y
   `handleSubmit` no llega a llamar al callback cuando falla. Ahora se registran con
   `form.setValue` al fijar la ubicación.
2. Los dos `<select>` opcionales de sumidero devuelven `''` cuando no se eligen, y sus campos son
   `z.enum(...).nullable().optional()`: `''` no es ni un valor válido ni `null`. Fallaba **siempre
   que el vecino no abría el desplegable de datos opcionales**, o sea, en el camino normal. Ahora
   se registran con `setValueAs` para convertir `''` en `null`.

Se añadió además un `onInvalid` a `handleSubmit`: si la validación falla por un campo sin control
visible, el formulario lo dice y vuelve al paso 1, en vez de quedarse mudo.

Verificado a mano en el navegador y cubierto por el E2E "un vecino crea un reporte desde la app
pública", que antes fallaba.

### 3.9 Pendientes menores
- Falta el archivo del logotipo. El usuario lo envió como imagen en el chat; hay un marcador provisional en `apps/web-ciudadano/public/icono.svg`. El definitivo va en `apps/web-ciudadano/public/logo.png`.
- ~~El `README.md` de la raíz todavía muestra la tabla de tareas con casi todo "pendiente".~~ Hecho:
  además se corrigió la sección de arranque, que mandaba usar Docker, GDAL y tippecanoe pese a que
  el ADR 0002 los descartó; quien siguiera el README se bloqueaba en el primer paso.
- `CLAUDE.md` §14.4 menciona una sección 14.5 (PWA) que sí existe, pero conviene releer la numeración tras los cambios.

---

## 4. Decisiones técnicas que conviene conocer antes de tocar nada

1. **PostGIS corre dentro de Node**, no en Docker: PGlite compilado a WebAssembly más la extensión oficial `@electric-sql/pglite-postgis` (marcada como experimental por sus autores), expuesta por el protocolo de PostgreSQL con `@electric-sql/pglite-socket`. `api-core` y `geo-service` se conectan con el driver `pg` normal y la misma `DATABASE_URL` que usarían contra Docker, así que **migrar a Docker no exige cambios de código**: basta apuntar `DATABASE_URL` al 5432 y usar el `docker-compose.yml` que ya está en el repositorio.
2. **El ETL está escrito en TypeScript con mapshaper y turf**, no con GDAL y Python, porque la máquina no tiene esas herramientas ni permisos para instalarlas. Los comandos equivalentes de GDAL y tippecanoe quedaron documentados en `CLAUDE.md` §6 como referencia.
3. **Las teselas se generan al vuelo** con `geojson-vt` y `vt-pbf` dentro de `geo-service`, en lugar de precompilarlas con tippecanoe. Una capa pasa a teselas automáticamente cuando su GeoJSON web supera 5 MB.
4. **Las fotos se guardan en disco** (`infra/.storage/fotos`) tras un adaptador con interfaz de tipo S3. Cambiar a MinIO o S3 es implementar esa interfaz.
5. **Las contraseñas usan scrypt** de Node, no Argon2id, para no depender de binarios nativos. Está anotado como pendiente para la Fase 2.
6. **La interfaz es propia**, sin shadcn/ui, para no depender de su registro remoto con la conexión lenta disponible. Los tokens del sistema de diseño viven en el bloque `@theme` de `globals.css` de cada app.

Dos errores propios que se encontraron y corrigieron, por si reaparecen: la verificación de reparaciones del ETL comparaba features **por posición** y `-clean` descarta features, lo que producía miles de falsos positivos; y la hoja de estilos de MapLibre impone `position: relative` sobre `.maplibregl-map`, lo que anulaba la clase `absolute` de Tailwind y dejaba el mapa con altura cero.

---

## 5. Mapa del repositorio

```
CLAUDE.md                  manual operativo (la referencia, no lo contradiga)
docs/TRASPASO.md           este documento
apps/web-ciudadano/        Parte 1 · mapa público, detalle, formulario, PWA
apps/panel-admin/          Parte 2 · login, moderación, filtros, exportación, indicadores, capas
services/api-core/         Parte 3 · API de negocio, severidad, estados, auth, fotos
services/geo-service/      Parte 4 · point-in-polygon, capas, teselas, agregados
packages/db/               Parte 4 · esquema, migraciones, seeds, PostGIS local
packages/contracts/        transversal · enums, severidad, Zod, OpenAPI (custodia Parte 3)
pipelines/geodata-etl/     Parte 5 · shapefile → GeoJSON → PostGIS
e2e/                       Parte 5 · pruebas transversales
data/raw/DM_UV_MZ_2025/    entrega del municipio. INMUTABLE. Fuera de git salvo MANIFEST.md
data/processed/            salida del ETL, regenerable. Fuera de git
infra/                     Docker Compose, SQL de init, datos locales (fuera de git)
```

La regla de carpetas designadas de `CLAUDE.md` §5 sigue vigente: cada tarea toca una sola parte.

---

## 6. Lo que hace falta preguntar al usuario

1. Confirmar ciudad, fuente oficial de las capas y licencia de uso de `DM_UV_MZ_2025` (el manual asume Santa Cruz de la Sierra y lo marca "a confirmar").
2. Validar con un técnico municipal la matriz de severidad, el radio de recurrencia de 25 m y el desplazamiento de privacidad de 30 m.
3. Decidir qué hacer con los códigos de manzana repetidos y los solapes entre unidades vecinales (§3.7).
4. Hosting, dominio y presupuesto para la Fase 2.
5. El archivo del logotipo.
6. Si quiere repositorio remoto en GitHub y con qué visibilidad.

---

## 7. Fase 2 de endurecimiento (2026-09-15)

### 7.1 Lo que se corrigió y cómo se comprobó

| Qué | Evidencia |
|---|---|
| Recálculo de puntos críticos **incremental** por vecindad | `packages/db/src/puntos-criticos-entorno.ts`. 9 tests comparan su resultado con el del recálculo completo en alta, baja, fusión y división. Medido con `pnpm --filter db exec tsx banco-puntos-criticos.ts` |
| **Argon2id** (hash-wasm) con compatibilidad y migración | 7 tests en `packages/db/test/password.test.ts` + un test de integración que entra con un hash scrypt viejo y comprueba que queda migrado |
| **Idempotencia** de `POST /reportes` | 10 tests, incluido el de tres envíos SIMULTÁNEOS con la misma clave que crean un solo reporte |
| Freno de fuerza bruta por cuenta y por IP; sesión con caducidad por inactividad | 12 tests en `services/api-core/test/autenticacion.test.ts` |
| **CSP** y `Permissions-Policy` en ambas apps | Comprobado en el navegador. Ver §7.2: la primera versión rompió el mapa |
| `/metrics` y `X-Request-Id` propagado a geo-service | Comprobado con `curl`: el mismo id vuelve de los dos servicios; el histograma registró las 1 800 peticiones de la prueba de carga |
| `/agregados` de subconsulta por UV a una sola pasada, con caché | 2 179–2 515 req/s en la prueba de carga |
| Paginación: conteo acotado a 10 000 y tope de `OFFSET` | `services/api-core/src/consultas.ts` |
| `pnpm audit`: de 6 avisos (3 altos) a **cero** | `overrides` en `pnpm-workspace.yaml`; verificado con `pnpm etl:test` |
| Escáner de secretos en pre-commit y gitleaks en CI | `scripts/buscar-secretos.mjs`, probado con secretos falsos de 4 clases |

### 7.2 Fallos que introdujo la propia Fase 2 (y se corrigieron)

Se anotan porque son el tipo de cosa que vuelve a pasar:

1. **La CSP dejó el mapa en negro.** MapLibre 6 pide las teselas raster con `fetch`, no con
   `<img>`, así que `img-src` no alcanzaba: hacía falta `connect-src`. Se vio en el navegador
   ("Refused to connect" por cada tesela), no en los tests.
2. **Un `Set-Content` de PowerShell corrompió `pnpm-workspace.yaml`**: le metió BOM, CRLF y
   mojibake en los comentarios. `pnpm` lo toleraba, `turbo` no: dejó de ver los paquetes del
   workspace y `pnpm dev` murió con `recursive_turbo_invocations`. **No editar archivos del
   repositorio con PowerShell.**
3. **Turbo 2.x corre en `envMode: strict`** y no pasaba NINGUNA variable de entorno a las tareas:
   con `pnpm dev` los servicios ignoraban `DATABASE_URL`, las sales y los límites. Corregido con
   la lista `globalEnv` de `turbo.json`. **Toda variable nueva hay que declararla ahí.**

### 7.3 Hallazgos de accesibilidad y de entorno

- El botón de geolocalización de MapLibre se quedaba **sin nombre accesible** cuando el navegador
  no ofrece geolocalización (WCAG 2.2 AA 4.1.2). Lo delató un E2E intermitente. Corregido en
  `apps/*/src/lib/accesibilidad-mapa.ts`, que además pone los controles en español.
- El límite del login estaba **fijo en el código** (20/15 min). Ahora es `LOGIN_PETICIONES_POR_VENTANA`.
- La prueba de carga deja cientos de intentos fallidos en `intento_login`, que es el freno de
  fuerza bruta y **vive en la base**: durante los minutos siguientes, los E2E fallan al iniciar
  sesión desde esa IP. Está documentado en el propio script y `e2e/playwright.config.ts` sube
  ambos frenos.

### 7.4 Prueba de carga (medida, no estimada)

Pila local con PGlite, 600 peticiones por nivel, **cero fallos** en todos los casos:

| Endpoint | 10 conc. | 100 conc. | 500 conc. |
|---|---|---|---|
| `GET /api/v1/reportes` | 158 req/s · p50 62 ms | 172 req/s · p50 577 ms | 175 req/s · p50 2 057 ms |
| `POST /geo/v1/resolver` | 171 req/s · p50 58 ms | 194 req/s · p50 500 ms | 196 req/s · p50 2 392 ms |
| `GET /geo/v1/agregados` (con caché) | 2 179 req/s · p50 4,6 ms | 2 257 req/s | 2 515 req/s · p50 146 ms |
| `GET /geo/v1/teselas` (en memoria) | 2 765 req/s · p50 2,7 ms | 3 863 req/s | 3 636 req/s · p50 84 ms |

**Cómo leerlo:** los dos primeros tocan la base y se quedan clavados en ~170–200 req/s pase lo que
pase, mientras la latencia crece de forma lineal con la concurrencia. Eso **no** es un límite de la
aplicación: es PGlite, que multiplexa todo sobre un único backend y serializa. Los dos últimos, que
no tocan la base, llegan a 2 200–3 900 req/s. **Estas cifras no valen como promesa de producción**:
hay que repetirlas contra PostgreSQL real (ver [ADR 0003](decisiones/0003-pglite-solo-en-local-y-pruebas.md)).

### 7.5 Documentación nueva

- [ADR 0003 — PGlite solo en local y pruebas](decisiones/0003-pglite-solo-en-local-y-pruebas.md)
- [operaciones/respaldo-y-restauracion.md](operaciones/respaldo-y-restauracion.md)
- [operaciones/observabilidad.md](operaciones/observabilidad.md)
- [operaciones/produccion.md](operaciones/produccion.md)

### 7.6 Cierre de la Fase 2 (2026-09-15)

**Estabilidad de los E2E.** Cuatro corridas completas seguidas, todas `17 passed · 1 skipped`. Una
quinta falló y **no fue el código**: la máquina entró en modo de espera moderno a mitad de la
corrida (registro de eventos: `Kernel-Power` 506 a las 12:11:51 y 12:12:02, red `Disconnected ·
Motivo: Policy Setting` a las 12:12:15, vuelta a las 12:14:07) y Chromium abortó la navegación con
`net::ERR_NETWORK_IO_SUSPENDED`. Los otros dos fallos de esa corrida eran consecuencia: el archivo
`recorrido-completo.spec.ts` es un recorrido en serie y el reporte nunca llegó a validarse. Está
documentado en `e2e/README.md` para que no se persiga como intermitencia.

**CSP de producción, comprobada en el navegador.** Hasta ahora solo se había visto la de desarrollo.
Se construyó y se levantó con `next start` (no `next dev`) y se cargó la app: `'unsafe-eval'` no
aparece, no hay ni una violación de CSP en consola, y las peticiones a `/api/v1/*`, `/geo/v1/capas`,
`/geo/v1/puntos-criticos` y `/geo/v1/agregados/*` responden 200. Lo mismo en el panel, que además
lleva `geolocation=()`.

**Fallo encontrado al hacerlo: el service worker guardaba las capas para siempre.** `public/sw.js`
servía `/geo/v1/capas/*` y `/geo/v1/teselas/*` desde caché sin caducidad ni revalidación. Al activar
una versión nueva de capa desde el panel, un vecino que ya hubiera abierto la app **seguiría viendo
los límites viejos indefinidamente**, hasta borrar los datos del sitio. Contradice `CLAUDE.md` §14.5
("invalidada por `version_capa`"), y geo-service ya publicaba la versión dentro del `ETag`. Además,
el shell que se guardaba en `install` no lo servía nadie: el manejador `fetch` salía antes. Ambas
cosas corregidas y cubiertas con 7 tests que cargan el archivo real (`src/lib/sw.test.ts`).

> **No comprobado:** el registro del service worker en un navegador real. El navegador integrado de
> la sesión rechaza `navigator.serviceWorker.register` con un error opaco aunque `/sw.js` se sirva
> con 200 y `application/javascript`, y no había otro navegador conectado. La lógica está probada;
> el registro, no.

**Otro límite del modo local, encontrado al cerrar.** Tras varias horas en marcha y un ciclo de
suspensión, la base local dejó de responder: el servidor de sockets de PGlite empezó a cortar
conexiones (`ECONNRESET`), el point-in-polygon devolvió `dentro_cobertura: false` donde antes daba
`true` y api-core se cayó detrás. Reiniciar `pnpm db:local` lo resolvió sin perder datos (persisten
en `infra/.pglite`) y la suite volvió a pasar entera. Refuerza lo que dice el
[ADR 0003](decisiones/0003-pglite-solo-en-local-y-pruebas.md): PGlite sirve para desarrollo y
pruebas, no para producción.

**Corridas de E2E de esta fase:** cinco completas en verde (`17 passed · 1 skipped`), la última ya
con el service worker corregido. Tres corridas se perdieron por causas de entorno —una por la
suspensión de la máquina, una porque un `api-core` suelto en 3001 hizo que Playwright diera la pila
por levantada, y una por la degradación de PGlite—; las tres están explicadas en `e2e/README.md`
para que nadie las persiga como intermitencia del código.

---

## 8. Fase 3 de auditoría extrema (2026-09-15)

Auditoría con «ojos nuevos» sobre el árbol que dejó la Fase 2, sin dar por bueno nada de lo
anterior. Lo que sigue es lo que se encontró, lo que se corrigió y —sobre todo— lo que **no** se
pudo comprobar.

### 8.1 Dos fugas de la ubicación exacta (P0) — CORREGIDAS

`CLAUDE.md` §0.8 y §13 dicen que la ubicación de un reporte es dato sensible y que la vista pública
va con precisión degradada. El jitter estaba bien implementado, pero **solo protegía una de las dos
puertas por las que salen las coordenadas**, y las dos eran públicas:

1. **El `bbox` del listado público era un oráculo.** `GET /api/v1/reportes?bbox=` filtraba por la
   geometría **exacta** y devolvía la **desplazada**. Encogiendo el bbox y mirando si el reporte
   sigue apareciendo, una bisección de unas cuarenta peticiones recupera la coordenada real con
   precisión de centímetros. El jitter no servía de nada.
2. **El punto crítico publicaba el centroide sin degradar.** DBSCAN corre con `minpoints = 1`
   (§9.2), así que un reporte sin vecinos forma su propio grupo y ese centroide **es** su
   coordenada exacta. `GET /geo/v1/puntos-criticos` es público y lo consume el mapa ciudadano
   (`apps/web-ciudadano/src/lib/api.ts`), de modo que la vivienda salía publicada en el mapa.

Las dos tienen la misma raíz: el punto publicable se calculaba al serializar la respuesta, así que
todo lo demás —filtros, agregaciones— seguía trabajando con el exacto.

**Corrección.** El punto publicable pasa a ser un dato guardado, no un cálculo de última hora:
la migración `0005_geometria_publica.sql` añade `geom_publico` a `reporte_inundacion` y a
`punto_critico`, con índices GIST. El listado público **filtra y responde** por esa columna; el
centroide publicable de un punto crítico se calcula con los puntos ya degradados de sus miembros.
La regla vive en un solo sitio: `coordenadaPublica()` en `packages/contracts`.

El relleno va en dos tiempos porque el jitter necesita `JITTER_SAL`, que es un secreto del servidor
y no puede estar en la base: la migración rellena lo que no lo necesita (vía pública y «otro», que
solo llevan redondeo) y api-core completa el resto al arrancar. **Quedar en NULL es la opción
segura**: las consultas públicas exigen `geom_publico IS NOT NULL`, así que un reporte sin rellenar
desaparece del mapa en vez de aparecer con su coordenada real.

Comprobado de punta a punta contra la base local persistente, que ya tenía datos:

```
migración sobre la base existente  -> 39 reportes rellenados por SQL, 8 en NULL (vivienda)
api-core al arrancar               -> "mantenimiento: geom_publico completado, rellenados: 8"
tras el arranque                   -> 0 reportes sin geom_publico; 14/14 puntos críticos con centroide publicable
desplazamiento de esas 8 viviendas -> entre 7,3 m y 29,3 m (radio declarado: 30 m)
GET /geo/v1/puntos-criticos        -> 5 decimales como máximo (antes, el float completo)
```

Cubierto por 5 tests de regresión en `services/api-core/test/privacidad-ubicacion.test.ts`, que
**fallaban antes del arreglo**.

### 8.2 La IP del cliente no era la del cliente (P1) — CORREGIDO

De acertar la IP dependen tres controles de §13: el rate limit de `POST /reportes`, el freno de
fuerza bruta del login por IP y el `ip_hash` del antispam.

Comprobado con un servicio de eco detrás del *rewrite* de Next: **Next pasa el `X-Forwarded-For`
del navegador tal cual y no añade ninguno propio**. Las dos configuraciones posibles fallaban:

- sin `TRUST_PROXY`, todos los vecinos comparten un único cubo: el límite de 10 reportes por hora
  pasaba a ser de la ciudad entera;
- con `TRUST_PROXY=1` (que significaba «confiar en todo»), Fastify tomaba el valor **más a la
  izquierda** de la cabecera, que es exactamente el que escribe el cliente: cualquiera se elegía
  la IP desde el navegador y se saltaba los tres controles.

**Corrección.** Dos piezas: `proxy.ts` en cada app Next borra las cabeceras de reenvío que mande el
navegador salvo que se declare `PROXY_DE_CONFIANZA=1`; y `TRUST_PROXY` deja de ser un interruptor
para expresar confianza acotada (`0`, número de saltos, o lista de IP/CIDR), rechazando `true` y
`*`. Verificado con el mismo eco: la cabecera forjada ya no llega al servicio y el reenvío sigue
funcionando.

### 8.3 Otros hallazgos corregidos

| # | Hallazgo | Severidad |
|---|---|---|
| 1 | El listado público —la consulta más cara— **no tenía rate limit**: `@fastify/rate-limit` se registra con `global: false` y solo limita las rutas que lo declaran. Medido: 500 peticiones concurrentes daban 500 respuestas 200, con p95 de 1,9 s | P1 |
| 2 | Bomba de descompresión en la subida de fotos: sharp permitía 268 megapíxeles, así que un PNG de menos de 1 kB que declare 20000 × 20000 reservaba del orden de 1 GB | P1 |
| 3 | `/metrics` quedaba **público sin token** por defecto en producción; ahora el arranque falla si se expone sin `METRICAS_TOKEN` | P1 |
| 4 | Las migraciones no tomaban ningún lock: con varias réplicas arrancando a la vez, una aplica y las demás mueren en bucle. Ahora van con `pg_advisory_xact_lock` | P1 |
| 5 | Las fotos se servían **sin mirar el estado del reporte**: la de uno rechazado o sin moderar seguía siendo pública para quien tuviera la clave. Contradecía la moderación previa de §13 | P2 |
| 6 | Esa misma ruta mandaba `Cache-Control: public` incluso cuando la foto solo la veía el técnico: una caché compartida podía dejarla servible para cualquiera | P2 |
| 7 | Carrera en la idempotencia: con una clave **caducada** y dos peticiones simultáneas, ambas la daban por vencida y ambas creaban un reporte. Ahora se resuelve con `FOR UPDATE` | P2 |
| 8 | Si la clave de idempotencia apuntaba a un reporte inexistente, el código seguía adelante **después del `ROLLBACK`**: el `INSERT` corría fuera de transacción | P2 |
| 9 | `openapi.yaml` llevaba desde la Fase 2 sin regenerar (faltaba `total_exacto`): el contrato publicado no describía la API. Ahora lo comprueba CI | P2 |
| 10 | Los seeds sintéticos podían correr contra producción: crean usuarios con contraseñas documentadas y borran reportes. Ahora fallan con `NODE_ENV=production` | P2 |
| 11 | Las sales no tenían longitud mínima. El jitter siembra con FNV-1a, un hash no criptográfico: lo único que lo protege es que la sal no se adivine. Mínimo 32 caracteres en producción | P2 |
| 12 | PGlite (unos 100 MB de WebAssembly) era dependencia de **producción** de `packages/db`. Solo lo usan `db:local` y los tests, los dos con importación dinámica: pasó a `devDependencies` | P2 |
| 13 | Comparación de tokens (`/metrics` y el token interno de geo-service) con `!==`: filtraba el secreto por tiempo. Ahora `timingSafeEqual` | P3 |

### 8.4 Un test propio que era intermitente

La primera versión del test del punto crítico fallaba una de cada cinco corridas. No era el código:
el jitter desplaza el punto y **el redondeo a 5 decimales (≈ 1 m) devuelve a veces la latitud o la
longitud a su valor de partida**, así que exigir que cada componente difiriera del original no es
una invariante. Se reescribió para comprobar lo que de verdad importa —que el centroide publicable
sale del punto publicable del miembro— y el caso del bbox se fijó con geometrías controladas en vez
de depender del azar del jitter. Ocho corridas seguidas en verde después.

### 8.5 Rendimiento medido (PGlite, **no** producción)

Pila local, 500 peticiones por nivel. **Estas cifras no representan producción**: PGlite serializa
sobre un único backend, así que el listado mide sobre todo esa serialización.

| Escenario | conc. | rps | p50 | p95 | p99 |
|---|---|---|---|---|---|
| `GET /api/v1/reportes` (antes del límite) | 500 | 240 | 1143 ms | 1938 ms | 2052 ms |
| `GET /api/v1/reportes` (con límite de 240/min) | 500 | 2221 | 162 ms | 172 ms | 173 ms |
| `POST /geo/v1/resolver` | 10 | 748 | 5,4 ms | 41,9 ms | 68,8 ms |
| `GET /geo/v1/agregados` (con caché) | 10 | 5346 | 1,4 ms | 3,6 ms | 6,4 ms |
| `GET /geo/v1/teselas/...` (caché en memoria) | 10 | 3734 | 1,0 ms | 6,0 ms | 52,7 ms |

El segundo caso no es «más rápido»: es que el servidor deja de absorber 500 consultas caras y
rechaza barato las que sobran, que es justamente lo que debe hacer un rate limit.

### 8.6 Docker: escrito, no construido

`infra/docker/servicio.Dockerfile` (multi-etapa, usuario no root, `tini`, `HEALTHCHECK`,
`pnpm deploy --prod`) y los dos servicios enganchados al perfil `servicios` de Compose. Valida con
`docker compose --profile servicios config`.

**Nadie los ha construido ni ejecutado.** El motor Linux de Docker Desktop no llegó a responder en
la máquina de desarrollo: el proceso arranca y la distribución `docker-desktop` de WSL está
presente, pero `docker version` se queda colgado hasta agotar el plazo. La lista de lo que hay que
comprobar en la primera máquina con Docker está en `infra/docker/README.md`.

### 8.7 Lo que sigue sin poderse comprobar aquí

| Qué | Por qué |
|---|---|
| PostgreSQL real (concurrencia, locks, `EXPLAIN` con volumen) | No hay Docker ni PostgreSQL nativo; PGlite serializa y no sirve para medir concurrencia |
| Construcción y arranque de las imágenes Docker | El motor de Docker nunca respondió |
| Respaldo y restauración cronometrados | `pg_dump` y `pg_restore` no están instalados y PGlite no los expone |
| Migraciones concurrentes entre réplicas | El lock está puesto, pero PGlite es de conexión única: no se puede ejercitar |
| Registro del service worker en un navegador real | Sigue pendiente desde la Fase 2 |
| ETL contra los shapefiles reales | `data/raw/DM_UV_MZ_2025/` solo conserva su `MANIFEST.md` |

### 8.8 Estado al cerrar la Fase 3

```
pnpm install --frozen-lockfile   0
pnpm secretos                    0
pnpm auditoria                   0     (0 vulnerabilidades)
pnpm lint                        0     (Biome, 185 archivos)
pnpm typecheck                   0     (9 paquetes)
pnpm test                        0     184 tests (eran 164)
pnpm build                       0
pnpm test:e2e                    0     17 passed y 1 skipped, cuatro corridas seguidas
```

El `1 skipped` es correcto y debe seguir ahí: es `test.skip(isMobile, …)` en `mapa-publico.spec.ts`,
porque los chips de severidad viven en el panel de escritorio y en móvil no existen.

Sin commit, sin push, sin nada tocado en GitHub.

---

## 9. Fase 4: escalabilidad real y preparación para producción (2026-09-15)

La Fase 3 cerró con una lista de cosas que no se habían podido comprobar porque el motor de
Docker no arrancaba en la máquina de desarrollo: PostgreSQL real, construcción de imágenes,
migraciones concurrentes, respaldo y restauración cronometrados. Esta fase empieza desbloqueando
eso y midiendo todo lo que la Fase 3 solo pudo razonar.

### 9.1 Docker: por qué no arrancaba (y no era el proyecto)

El backend de Docker Desktop se caía al arrancar con:

```
starting services: initializing Inference manager: listening on unix://…\Docker\run\dockerInference:
remove …\Docker\run\dockerInference: The file cannot be accessed by the system.
```

Un socket AF_UNIX huérfano de un cierre anterior que Windows no deja borrar; cada intento fallido
dejaba otro. El arreglo fue renombrar `%LOCALAPPDATA%\Docker\run` y
`%LOCALAPPDATA%\docker-secrets-engine` y desactivar las funciones de IA de Docker Desktop
(`EnableDockerAI`), que son las que abren esos sockets. **Nada de esto tiene que ver con el
repositorio**, pero queda escrito porque le va a pasar a alguien más.

Con eso: PostgreSQL **18.6** + PostGIS **3.6.4**, motor Linux, 12 CPU y 8 GB en la VM de WSL2.

### 9.2 Lo que se encontró midiendo, no leyendo

Todo lo que sigue apareció **ejecutando**: levantando la pila, generando volumen, tirando
servicios. Ninguno se ve leyendo el código con atención.

| # | Hallazgo | Sev. | Cómo apareció |
|---|---|---|---|
| 1 | **Una petición de creación necesitaba DOS conexiones del pool a la vez.** `POST /reportes` tomaba una para su transacción y, sin soltarla, pedía otra para releer el reporte. Con un pool de N, N peticiones simultáneas se bloqueaban entre sí hasta agotar el timeout. Medido: 6 simultáneas → 6 × 201 en 91 ms; **8 simultáneas → 7 × 503 a los 10 071 ms**. | **P0** | Prueba de concurrencia contra PostgreSQL real |
| 2 | **El recálculo de puntos críticos reventaba con volumen.** `Math.min(...lats)` con 750 000 miembros → `RangeError: Maximum call stack size exceeded`. Tumbaba el trabajo de mantenimiento entero. | **P0** | Arrancar la pila con un millón de reportes |
| 3 | **Una de cada ocho réplicas moría al arrancar.** `CREATE TABLE IF NOT EXISTS _migraciones` corría FUERA del advisory lock, y `IF NOT EXISTS` no es atómico: `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`. | **P1** | 6 procesos aplicando migraciones a la vez |
| 4 | **Cuatro claves foráneas sin índice.** Un `DELETE` de reportes **no terminó en 14 min 36 s**. Con los índices: **22,2 s** para 2 000 000 de filas. | **P1** | Intentar borrar los datos de prueba |
| 5 | **Argon2id bloqueaba el bucle de eventos 670 ms** con 20 logins simultáneos; durante ese rato el proceso no atendía nada. `POST /auth/login` es público. | **P1** | Medición con un medidor calibrado |
| 6 | **`minio/minio` ya no existe en Docker Hub.** `docker compose up` fallaba en seco. | **P1** | Levantar la pila por primera vez |
| 7 | **El recálculo completo corría dentro de una petición HTTP.** 41,9 s con 750 000 publicables, con el advisory lock global tomado y `statement_timeout` en 30 s. | **P1** | Medir el recálculo completo |
| 8 | **Respuestas de 265 KB sin comprimir.** gzip las deja en 14 KB (18,9×) por 1,3 ms de CPU. | **P1** | Mirar el tamaño de una respuesta real |
| 9 | **El recálculo completo no tomaba el advisory lock**, solo se serializaba dentro del proceso: con réplicas podía pisar a uno incremental. | **P1** | Revisión del código a la luz de lo anterior |
| 10 | **`/ready` devolvía 503 si geo-service estaba caído**, sacando a TODAS las réplicas de rotación a la vez. | **P1** | Parar el contenedor de geo-service |
| 11 | **El agregado por UV crece lineal**: 5,3 ms → 47 ms → 721 ms al pasar de 10 000 a 1 000 000 de reportes. | **P2** | `EXPLAIN (ANALYZE, BUFFERS)` por escalones |
| 12 | **No había `.dockerignore`.** El contexto de build era el repo entero (960 MB solo de `node_modules`), con `.env` incluido. | **P2** | Primera construcción |
| 13 | **Con la base caída, el listado devolvía 500**, no 503. Un problema de capacidad disfrazado de fallo. | **P2** | Parar el contenedor de PostgreSQL |
| 14 | **El mantenimiento arrancaba a la vez que el tráfico** y competía por el mismo pool. | **P2** | Ver 503 justo tras arrancar |
| 15 | **Dos inserciones cuadráticas** en el agrupador: `mapa.set(k, [...viejo, x])` copia el array entero en cada inserción. | **P2** | Leer el código alrededor del fallo 2 |
| 16 | **La caché del service worker no tenía tope** (teselas sin límite) y **los estáticos no se guardaban**, así que el modo sin red servía un shell que pedía un JS inexistente. | **P2** | Auditoría del service worker |
| 17 | **Sin cancelación de peticiones ni plazos en el frontend**, y el bbox del mapa disparaba una consulta por cada movimiento. | **P2** | Auditoría del frontend |
| 18 | **geo-service no tenía ninguna métrica** y a api-core le faltaban las del pool y las consultas. | **P2** | Intentar diagnosticar la lentitud |
| 19 | **Ni el pool ni los límites eran configurables** sin recompilar. | **P2** | Intentar ajustar para medir |
| 20 | **El cierre ordenado no tenía plazo** ni paraba el temporizador de mantenimiento. | **P3** | Revisión del arranque y parada |

### 9.3 Una sospecha que resultó falsa, y por qué importa

A mitad de camino parecía que el listado por bbox no usaba el índice GIST y crecía lineal con la
tabla: 1,1 ms → 4,75 ms → **45,5 ms** al pasar de 10 000 a 1 000 000, con 121 432 bloques leídos.

Era un artefacto **de mi propio generador de datos**. `ST_GeneratePoints` produce los puntos
unidad vecinal por unidad vecinal, y yo derivaba `creado_en` del número de fila: espacio y tiempo
quedaban perfectamente correlacionados, así que el recorrido por fecha tenía que descartar barrios
enteros antes de llegar a la ventana pedida. Con las fechas repartidas de forma independiente, la
misma consulta baja a **0,76 ms y 613 bloques**.

Queda como opción (`--correlacionado`) porque también es un caso realista —un barrio entero
reportando durante la misma tormenta— pero es una cota superior, no el comportamiento normal. Se
escribe aquí porque el error de medición estuvo a punto de justificar un cambio de código que
habría empeorado las cosas: las alternativas que probé (CTE materializado forzando el camino
espacial) eran **peores en tres de cuatro escenarios**.

### 9.4 La base es el cuello de botella, y por bastante

| CPU de `postgis` | Listado por bbox, 10 conc. | 100 conc. |
|---|---|---|
| 2 CPU | 21 rps, p95 613 ms | 20 rps, p95 5 904 ms, **433 × 503** |
| 6 CPU | **142 rps**, p95 84 ms | **117 rps**, p95 1 715 ms, **0 × 503** |

Mientras tanto los servicios Node estaban al **0,03 % de CPU**, y las métricas nuevas lo
confirmaron desde dentro: **el 83 % del tiempo de cada petición era espera a la base**.

Corolario incómodo: **agrandar el pool no ayuda si la base no tiene CPU**. Con 2 CPU, subir
`DB_POOL_MAX` de 8 a 24 empeoró el resultado (de 106 a 433 respuestas 503). Más conexiones sobre
los mismos núcleos es más contención, no más trabajo hecho.

### 9.5 Lo que se probó y funcionó

| Prueba | Resultado |
|---|---|
| Migraciones desde cero contra PostgreSQL 18 real | 7 migraciones aplicadas |
| 8 réplicas arrancando a la vez, 3 rondas | 24/24 sin fallo, 5 migraciones registradas una sola vez |
| Construcción de las dos imágenes | api-core 497 MB, geo-service 455 MB |
| Pila completa con healthchecks | 4 contenedores en `healthy` |
| Concurrencia de idempotencia | 12 envíos con la misma clave → 1 reporte; con claves distintas → 12 |
| Creación concurrente tras el arreglo | 48 simultáneas, todas 201, peor 203 ms |
| Respaldo y restauración de 1 004 MB | dump 5,2 s / 68 MB, restore 14,4 s, todos los conteos coincidentes, 0 geometrías inválidas |
| Resiliencia: geo-service caído | api-core sigue en `ready`, marca `degradado: true`, el mapa sigue sirviéndose |
| Resiliencia: PostgreSQL caído | `/health` 200, `/ready` 503, sin bucle de reinicio; recuperación en 1 s sin reiniciar nada |
| Argon2 con workers | 50 logins simultáneos y `/health` en p50 3 ms, peor 38 ms |

### 9.6 Lo que sigue SIN comprobarse

| Qué | Por qué |
|---|---|
| Varias réplicas de api-core a la vez detrás de un balanceador | El Compose define una instancia por servicio (usa `container_name`). Lo que sí se probó es el arranque concurrente de ocho procesos contra la misma base. |
| Fotos con varias réplicas | `AlmacenDisco` escribe en el volumen del contenedor. La ruta hacia S3 está escrita en `docs/operaciones/produccion.md`, pero no implementada. |
| El adaptador S3 contra MinIO | MinIO arranca y crea su bucket, pero ningún código lo usa. |
| Despliegue sin corte | Necesita orquestador. |
| Soak de horas | Se corrió uno de doce minutos. Una fuga lenta podría no verse en ese plazo. |
| Volúmenes de 5 y 10 millones | Se midió hasta 1 000 000. Lo de más allá son estimaciones fundadas en la pendiente medida, y están marcadas como tales. |
| ETL contra los shapefiles reales | `data/raw/DM_UV_MZ_2025/` solo conserva su `MANIFEST.md`. |
| Registro del service worker en un navegador real | Sigue pendiente desde la Fase 2; la lógica sí está cubierta por tests. |

### 9.7 Herramientas nuevas para poder repetir todo esto

| Comando | Qué hace |
|---|---|
| `node scripts/banco-datos.mjs generar N` | Genera N reportes sintéticos DENTRO de las unidades vecinales. `limpiar` los borra. |
| `node scripts/banco-consultas.mjs` | `EXPLAIN (ANALYZE, BUFFERS)` de las consultas críticas; dice si alguna cae en escaneo secuencial. |
| `node scripts/banco-carga.mjs 10,100,500` | Latencias y throughput por escenario. |
| `node scripts/banco-concurrencia.mjs` | Carreras de idempotencia contra PostgreSQL real. |
| `node scripts/banco-sostenido.mjs 30 8` | Prueba sostenida vigilando memoria, pool y cachés. |
| `node scripts/respaldo.mjs simulacro` | Respalda, restaura en una base nueva, compara y mide. |

### 9.8 Estado al cerrar la Fase 4

```
pnpm install --frozen-lockfile   0
pnpm secretos                    0     (sin hallazgos)
pnpm auditoria                   0     (0 vulnerabilidades)
pnpm lint                        0     (Biome, 194 archivos, 0 errores y 0 avisos)
pnpm typecheck                   0     (9 paquetes)
pnpm test                        0     210 tests (eran 184)
pnpm build                       0     (7 tareas)
pnpm test:e2e                    0     17 pasan, 1 omitido
docker compose --profile servicios config   0
docker compose --profile servicios build    0
docker compose --profile servicios up -d    0   (4 contenedores en healthy)
```

Migraciones nuevas: `0006_indices_de_claves_foraneas.sql`, `0007_agregado_por_unidad_vecinal.sql`.
Dependencia nueva: **una sola**, `@fastify/compress`, justificada con la medición de 18,9×.

Sin commit, sin push, sin nada tocado en GitHub.

---

## 10. El prototipo como frontend real (2026-09-16)

El usuario entregó un prototipo funcional en HTML —«Mi Curichi · Prototipo (compartible).html»,
un bundle autoextraíble con Leaflet, las fuentes y las imágenes dentro— y pidió que dejara de ser
una maqueta aparte para convertirse en la interfaz de la aplicación. No copiar el HTML: rehacer el
frontend con su diseño y conectarlo a lo que ya existe.

### 10.1 Qué era el prototipo

Tres modos en una sola página (ciudadano móvil, ciudadano escritorio, panel municipal) y unas
veinticinco pantallas numeradas (C-00…C-19, W-00…W-07, M-02…M-09, A-02, A-06), con su propio
enrutador, sus animaciones de transición y datos de ejemplo en memoria. El armazón de demostración
—el marco de celular, el marco de navegador, la nota al pie con el código de pantalla— **no** forma
parte del producto: lo que sí lo es son las pantallas de dentro.

Su sistema de diseño coincide con `CLAUDE.md` §14.4 (paleta del logotipo, Sora + Source Sans 3,
severidad con color + nombre + barras), así que el kit se pudo trasladar tal cual a
`globals.css` de las dos apps.

### 10.2 El fallo que el prototipo destapó

Al reproducir el mapa apareció algo que llevaba desde la Fase 1 sin detectarse: **el worker de
MapLibre nunca arrancaba dentro de Next**.

MapLibre 6 calcula la URL de su worker con `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
Empaquetado por Next, eso apunta al chunk, así que pedía
`/_next/static/chunks/maplibre-gl-worker.mjs` → 404 → página HTML → el navegador rechaza el módulo
por MIME. En la consola solo quedaba un `Failed to load module script` suelto, sin ninguna
referencia al mapa.

Como todo lo vectorial se procesa en ese worker, el mapa dibujaba **únicamente las teselas
raster**: nada de puntos, nada de agrupaciones y nada de polígonos de distrito o unidad vecinal.
Se veía igual en desarrollo y en `next start`. La comprobación que lo cerró:

```js
// antes: el origen nunca termina de cargar, ni siquiera con datos en línea
m.addSource('prueba', { type: 'geojson', data: { type: 'FeatureCollection', features: [ … ] } });
m.getSource('prueba').loaded()   // false, para siempre
```

Arreglo: `scripts/copiar-worker-maplibre.mjs` (uno por app) copia el worker y su módulo compartido
a `public/maplibre/` en cada `dev` y `build`, y `src/lib/worker-maplibre.ts` se lo declara a
MapLibre con `setWorkerUrl`. La copia se ignora en git para que no pueda quedar desincronizada de
la versión instalada del paquete. Tras el arreglo, `querySourceFeatures('capa-distrito_municipal')`
devuelve las 12 features y los polígonos se dibujan.

### 10.3 Lo que se decidió no inventar

El prototipo tiene cuenta de ciudadano, perfil, puntos, niveles y logros (C-13, C-14, C-15, C-19).
Nada de eso tiene backend: el reporte es anónimo a propósito (§16.4) y la gamificación está fuera
del alcance de la Misión 1 (§3.2). Se dejaron fuera en vez de simularlos.

Lo que sí se pudo dar de verdad es el seguimiento: el navegador recuerda los identificadores que
devolvió la API al enviar, y «Mis reportes» consulta el estado real de cada uno
(`GET /api/v1/reportes/:id`; un 404 significa «todavía en revisión», porque la vista pública solo
expone validados y resueltos). La pantalla dice explícitamente que esa lista vive en el
dispositivo y se pierde al borrar los datos del navegador.

La tabla de los quince distritos con población y número de barrios que el prototipo muestra en la
portada tampoco se trajo a la app pública: son cifras que no se han podido verificar (§0.6). La
información del plano que sí se conserva está en la pantalla del técnico `/plano`, con la
advertencia de que es referencial y hay que confirmarla con la Dirección de Planificación.

### 10.4 Estado al cerrar

```
pnpm lint                        0     (Biome, 217 archivos, 0 errores y 0 avisos)
pnpm typecheck                   0     (9 paquetes)
pnpm test                        0     221 tests (eran 210)
pnpm build                       0     (7 tareas)
pnpm test:e2e                    0     23 pasan, 1 omitido (eran 17)
```

Dependencias nuevas: **ninguna**. Todo lo que hacía falta —MapLibre, lucide-react, las fuentes—
ya estaba instalado.

---

## 11. Fase 5: que lo use una persona de verdad (2026-09-16)

La Fase 4 midió escalabilidad y la anterior integró el prototipo como frontend. Esta fase se
propuso una cosa distinta y más incómoda: **usar el producto como lo usaría alguien que no lo
conoce, y arreglar lo que apareciera**. Casi todo lo que apareció tiene la misma forma — la
aplicación afirmaba cosas que no sabía.

### 11.1 La interfaz inventaba estados cuando la API fallaba

Con `api-core` parado (probado parando el contenedor), la app pública no daba ningún error. Daba
**respuestas**, y eran falsas:

| Dónde | Qué decía con la API caída | Por qué importa |
|---|---|---|
| Mapa público | «Todavía nadie reportó en esta zona» | Es una afirmación sobre el barrio construida a partir de un fallo de red, y justo la contraria a la que el propio sistema advierte en `CLAUDE.md` §9.5. En móvil ni siquiera eso: mapa vacío y silencio. |
| «Mis reportes» | Todos los reportes como «En revisión» | Un reporte ya validado y publicado se mostraba como pendiente. `useQueries` trataba cualquier error igual que el 404 que sí significa «en revisión». |
| `/mis-reportes/<lo-que-sea>` | Línea de tiempo completa: «Mi reporte · En revisión · Lo enviaste ✓» | Para un identificador inventado. El seguimiento se apoya en dos fuentes —el navegador y la API— y, cuando ninguna sabe nada, dibujaba el reporte igual. |

Corregido con un componente único (`ErrorDeCarga`) que dice qué no se pudo cargar, por qué y
ofrece reintentar sin recargar la página; con un estado `error` propio en cada reporte seguido
(«Estado desconocido», contador «Sin consultar · N») y con un caso explícito de «no encontramos
ese reporte». Cubierto por `e2e/tests/resiliencia-interfaz.spec.ts`, que simula el fallo
interceptando la petición en el navegador en lugar de parar servicios.

### 11.2 Mensajes de error que no decían nada, o decían de más

- **Un plazo agotado caía en el cajón de sastre.** `AbortSignal.timeout` lanza un `DOMException`
  con `name === 'TimeoutError'`, que no es `ErrorApi` ni `TypeError`: el vecino leía «Ocurrió un
  error inesperado» justo cuando más falta le hace saber que la petición salió y no volvió.
- **Y en el envío del reporte eso es la pregunta entera**: «¿se mandó o no?». Ahora, cuando no se
  puede saber (plazo, red cortada, 503), el mensaje lo dice y añade que reintentar es seguro,
  porque el envío lleva clave de idempotencia. Cuando el servidor dijo que no (4xx), no lo dice.
- **Una foto corrupta filtraba las tripas de la biblioteca de imágenes**: «No se pudo procesar la
  imagen: Input buffer has corrupt header: VipsJpeg: Corrupt JPEG data: 85 extraneous bytes
  before marker 0x14…», tal cual, en el aviso rojo del formulario. Ahora el detalle va al log y
  la persona lee algo accionable (§13: nada de detalles internos hacia fuera).
- El login del panel mostraba «TypeError: Failed to fetch» cuando api-core no respondía.

### 11.3 El formulario perdía todo al recargar

Cinco pantallas contestadas y un toque en «Agregar» foto: el navegador cede el control a la
cámara y en un móvil con poca memoria eso puede descartar la pestaña. Al volver, el paso 1 en
blanco. Ahora hay borrador en `sessionStorage` (`src/lib/borrador.ts`), que **también conserva la
clave de idempotencia** para que reintentar tras una recarga no pueda crear un segundo reporte.
Se avisa de que se retomó y se puede descartar a propósito. Caduca a las 12 h, antes que el vale
de 24 h de las fotos ya subidas.

### 11.4 El mapa pedía sus letras a un servidor de demostración, y le devolvía 404

`glyphs` apuntaba a `https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf` con
`text-font: ['Open Sans Bold']`. Comprobado pidiendo el archivo a mano: **esa tipografía ahí no
existe** (404) y `Noto Sans Bold` sí (200). Es decir: cada etiqueta del mapa provocaba una
petición fallida contra un tercero —que además es el servidor de DEMOSTRACIÓN de MapLibre, sin
compromiso de servicio— y las letras acababan dibujadas por el navegador como último recurso.

Ahora los glifos se sirven desde la propia app (`public/glifos/NotoSans-Bold/0-255.pbf`, 81 KB,
el rango que cubre el castellano entero) y `demotiles.maplibre.org` **salió de la CSP** de las dos
apps. Verificado en una pestaña limpia: consola sin un solo aviso y etiquetas con sus tildes.

### 11.5 El modo sin red devolvía el shell en Times New Roman

El registro del service worker estaba **pendiente desde la Fase 2**. Se comprobó por fin en un
navegador real con `next start`: registra, activa, controla la página y no guarda ni una petición
de `/api/`. Pero al apagar el servidor y recargar, el shell salía **sin estilos**.

La causa: la hoja de estilo bloquea el render, el navegador la pide en el preescaneo y, al venir
marcada `immutable`, esa petición no siempre vuelve a pasar por el service worker; nunca se
guardaba. El JS sí, porque llega más tarde. Como el nombre lleva el hash del contenido no puede
estar en la lista fija, así que ahora el `install` **lee el HTML del shell y guarda sus hojas de
estilo**. Caché a `v5`; verificado que las `v4` se borran solas al activar.

De paso, el mapa mostraba «Cargando el mapa…» para siempre sin red, porque MapLibre no llega a
`idle` reintentando teselas que no van a venir. Tiene tope de 12 s.

### 11.6 Fotos: `AlmacenS3` existe y está probado

Era el «abierto, con camino escrito» de la Fase 4. Ya no: `services/api-core/src/almacen-s3.ts`
habla S3 con `fetch` y firma SigV4 con `node:crypto`, **sin añadir una sola dependencia**
(`@aws-sdk/client-s3` son decenas de megabytes para hacer PUT, GET y DELETE). Se activa con
`S3_ENDPOINT`; sin esa variable todo sigue igual que antes, en disco.

Probado contra el MinIO del Compose, no simulado: el objeto aparece en el bucket, vuelve por
`GET /api/v1/fotos/:key` con sus bytes intactos, el volumen del contenedor queda vacío y una
credencial equivocada impide arrancar en lugar de perder fotos silenciosamente. Detalle y
variables en `docs/operaciones/produccion.md`.

### 11.7 El panel no avisaba de que la sesión había caducado

La sesión del técnico vence por inactividad (12 h por defecto). Hasta ahora eso se notaba en
mitad de una moderación: «Confirmar rechazo» devolvía `ERROR (401)` dentro del formulario, sin
decir qué había pasado y sin forma de volver a entrar que no fuera adivinar la URL. Ahora
cualquier 401 que no venga del propio login lo anuncia, y el panel tira la caché y lleva a
`/login?caducada=1`, que lo explica.

También se añadieron `error.tsx`, `global-error.tsx` y `not-found.tsx`: una excepción en un
componente de cliente dejaba al vecino con la pantalla por defecto de Next, en inglés y sin
salida.

### 11.8 Lo que se revisó y estaba bien

No todo lo mirado estaba roto, y conviene dejarlo escrito para no volver a mirarlo:

- **Privacidad de la ubicación.** El filtro por bbox público opera sobre `geom_publico` (si no,
  encogerlo por bisección sería un oráculo de la coordenada real) y `/geo/v1/puntos-criticos` es
  fail-closed sobre la misma columna. Comprobado además en vivo: la vista pública sale a cinco
  decimales, sin autor, sin `ip_hash` y sin `ubicacion_tipo`.
- **Datos falsos en producción.** Se buscaron arrays fijos, JSON de demostración y respuestas
  simuladas en todo el código de ejecución: no hay. Lo sintético vive en `data/samples/` y se
  llama a sí mismo «(sintético)» en pantalla.
- **Límites de foto.** 413 por tamaño, 415 por tipo y por imagen ilegible, tope de megapíxeles
  contra la bomba de descompresión, y como máximo tres por reporte. Se añadió una comprobación
  **antes** de subir: rechazar 8 MB después de mandarlos por datos móviles lo paga quien peor
  conexión tiene.
- **Rate limiting.** Sigue siendo por proceso y se multiplica por el número de réplicas; es una
  decisión deliberada y documentada. El freno que de verdad importa —fuerza bruta en el login—
  vive en la base de datos y ya es global.

### 11.9 Lo que sigue bloqueado desde fuera

| Qué falta | Quién lo tiene que dar | Sin ello |
|---|---|---|
| Los shapefiles reales `DM_UV_MZ_2025` (DM.shp, UV.shp, MZ.shp con sus `.dbf`, `.prj`, `.shx`, `.cpg`) | El usuario; `data/raw/` no se versiona por decisión de `CLAUDE.md` §6.10.3 y solo conserva el `MANIFEST.md` con sus sha256 | La base sirve las capas **sintéticas** (3 distritos, 12 UV, 1152 manzanas, todas con «(sintético)» en el nombre) en vez de las reales (16, 582 y 27 817). El ETL ya está configurado y verificado para ellas en `pipelines/geodata-etl/config/capas.yaml`: basta copiar la carpeta y correr `pnpm etl:all` |
| Dominio, certificado y proxy de entrada | El municipio | No se puede poner `COOKIE_SEGURA=1` con sentido, ni HSTS, ni fijar `TRUST_PROXY` al número de saltos real, del que dependen el rate limit y el `ip_hash` |
| Decisión sobre el alojamiento | El usuario (§16, punto 6) | Sigue sin poder cerrarse la Fase 2 |
| Validación de los parámetros de dominio con el técnico municipal | El municipio (§16, punto 7) | Severidad, radio de 25 m, jitter de 30 m y límites siguen siendo propuestas |

### 11.10 Estado al cerrar la Fase 5

Los números exactos de la última corrida están en el informe entregado al usuario. Dependencias
nuevas: **ninguna**.

Nota sobre los E2E: la suite se corre contra `pnpm dev`. Contra la pila del Compose fallan dos
casos de exportación, y es correcto que fallen: allí `COOKIE_SEGURA=1` marca la cookie de sesión
como `Secure` y el cliente HTTP de Playwright —que no es un navegador— no la manda por `http`. Un
navegador sí lo hace, porque trata `localhost` como contexto seguro.

Sin commit, sin push, sin nada tocado en GitHub.

---

## 12. Fase 6: los datos reales del municipio (2026-09-18)

La Fase 5 dejó el producto usable y un solo bloqueador escrito con todas las letras: faltaban los
shapefiles. Ya están. Esta fase los integra y, al hacerlo, encuentra lo que solo se ve cuando los
datos dejan de ser doce polígonos de juguete.

### 12.1 La entrega es la que el ETL esperaba, y aun así no encajaba del todo

Los quince archivos de `data/raw/DM_UV_MZ_2025/` coinciden **hash por hash** con el bloque
`sha256` del `MANIFEST.md`, así que son exactamente la entrega contra la que se escribió
`config/capas.yaml`: 16 distritos, 582 unidades vecinales, 27 817 manzanas, EPSG:32720, UTF-8.

Lo que no coincidía era una afirmación del propio archivo de configuración. Decía, sobre el código
de manzana: *«se usa OBJECTID, que es único y sin nulos»*. Medido sobre la entrega real:

| Campo | Valores con dato | Distintos |
|---|---:|---:|
| `OBJECTID` | 27 527 | **20 001** — vale `0` en 6 596 filas |
| `CodigoManz` | 4 300 | 4 146 |
| `Mz` | 19 012 | 1 001 |
| `DM`+`UV`+`Mz` | 27 527 | 17 420 |

**La capa de manzanas no trae ningún identificador único**, ni en un campo ni combinando campos.
No es un defecto del ETL ni algo que se arregle eligiendo mejor: es lo que hay en el origen. Se
dejó `OBJECTID` porque es el que menos códigos sintéticos genera, se corrigió el comentario con
los números medidos y se anotó que la solución de fondo es pedirle al municipio un código de
manzana. El id resultante es un subrogado, estable mientras el archivo no cambie, y así está
escrito donde alguien lo va a leer.

### 12.2 Referencias a padres que no existen

879 manzanas declaraban una unidad vecinal que **no está en `UV.shp`**, y 97 un distrito que no
está en `DM.shp`. `asignarPadre` prefería el valor declarado sobre la contención espacial, así que
esas referencias se copiaban tal cual a PostGIS y se quedaban apuntando a la nada.

Ahora, cuando el padre declarado no existe en su capa, manda el polígono que **sí** contiene al
hijo —que es un dato verificado, no una suposición— y el caso queda contado como
`padre_inexistente` en el reporte de calidad. Si tampoco hay polígono contenedor, el campo queda
en `NULL`: mejor vacío que mintiendo. Resultado en la base: **0 referencias rotas**, 454 manzanas
sin unidad vecinal y 24 sin distrito, todas honestas.

Hubo que tocar dos sitios, y el segundo es el que importaba: `normalizar` volvía a leer el campo
declarado por su cuenta, así que arreglar solo `asignarPadre` no cambiaba nada. Ahora el padre
resuelto es autoritativo.

### 12.3 De los 27 MB del GeoJSON de manzanas, 16 eran propiedades que nadie dibuja

Medido antes de tocar nada: el `web.geojson` de manzanas pesaba 26,9 MB, de los cuales **16,2 MB
eran propiedades y 8,9 MB geometría**. Dentro de cada una de las 27 434 features viajaban la
cadena de `fuente` (74 caracteres), `fecha_vigencia`, doce campos `orig_*` con fechas de edición
del origen y `SHAPE_STAr`… y viajaban también dentro de cada feature de cada tesela MVT que llega
al navegador.

El GeoJSON de render se queda ahora solo con lo que el mapa usa —los mismos siete campos que
`geo-service` construye cuando tiene que leer la capa de PostGIS, así que las dos rutas
coinciden—. Manzanas: **26,9 → 15,5 MB**. Unidades vecinales: 559 → 378 KB. Los atributos
originales siguen enteros en `full.geojson`, que es lo que se carga a la base.

### 12.4 El PIP del hueco recorría la capa entera

`EXPLAIN ANALYZE` sobre las 576 unidades vecinales reales: la consulta de respaldo de §7.4 —la
que busca la UV más cercana cuando el punto cae en una calle— tardaba **38,9 ms** barriendo la
tabla, mientras los otros tres point-in-polygon de la misma función iban por índice en 0,2 ms. El
motivo es viejo y conocido: el índice GIST está sobre `geom`, y escribir `geom::geography` lo
inutiliza.

Se añadió un prefiltro en grados que sí entra por el índice, dejando la comprobación exacta en
metros para las pocas que pasan. **38,9 ms → 0,14 ms** fuera de la ciudad y 7,9 ms dentro. El
prefiltro es deliberadamente más ancho que la tolerancia (divide por 55 000 en vez de por 111 320,
que cubre hasta los 60° de latitud), y hay un test que fija justo eso: un punto a 25 m de una UV
—dentro del prefiltro, fuera de los 20 m reales— tiene que quedar fuera de cobertura.

### 12.5 Activar una capa nueva dejaba sin nombre a los reportes viejos

Al activar `DM_UV_MZ_2025`, un reporte de la fase anterior pasó a mostrarle al vecino
`unidad_vecinal:UV-105` donde tenía que leer el nombre de su barrio. La consulta unía contra la
vista `*_vigente`, y la vista vigente ya no conocía esa unidad vecinal; el código caía al id.

Para eso existe `version_capa` (§7.1): es la versión con la que se resolvió **ese** reporte. Ahora
la unión es por `(id, version_capa)`, tanto en la vista pública como en los indicadores del panel.
El reporte viejo volvió a mostrar su nombre —«Unidad Vecinal 105 (sintética)»—, que es exactamente
lo que era. Hay un test que carga una segunda versión de capas, la activa y comprueba que los
reportes anteriores conservan su nombre.

### 12.6 La manzana estrechaba el jitter

La vista pública publicaba `manzana_id` junto al punto desplazado. Con las 1 152 manzanas
sintéticas eso era teórico; con las 27 527 reales, no: una manzana mide del orden de 100 m de lado
y el desplazamiento llega a 30 m, así que cruzar las dos cosas deja la vivienda en la intersección
de un disco con un polígono, bastante más estrecha que el disco solo. En una esquina, unos pocos
metros.

`manzana_id` se oculta ahora exactamente cuando se aplica jitter, por el mismo motivo y en la
misma línea que `direccion_aprox`. En vía pública se sigue publicando: ahí el punto ya sale en su
sitio. Dos tests nuevos fijan las dos mitades.

### 12.7 Con geo-service caído, el vecino recibía «Error interno»

Crear un reporte necesita resolver la unidad vecinal. Con geo-service parado, `POST /reportes`
devolvía **500 ERROR_INTERNO**: al vecino le decía que la aplicación está rota y al panel de
errores que hay un defecto que investigar, cuando lo que pasa es que una dependencia no está
ahora mismo. Es el mismo razonamiento que ya se había aplicado a la base en la Fase 4.

Ahora es **503 con `Retry-After`** y un mensaje que se entiende: «No pudimos ubicar el punto ahora
mismo. Probá de nuevo en unos segundos; el reporte no se duplica». Un 4xx de geo-service —que sí
sería un defecto nuestro— sigue saliendo como 500 para que alguien lo mire.

De paso, `/ready` de api-core también miraba solo la base y geo-service. Con MinIO caído decía
`ok` mientras toda subida y toda lectura de foto fallaba con un 500. Ahora informa de `fotos` y lo
marca en `degradado`, sin llevar la réplica a 503: el mapa y el listado siguen sirviéndose.

### 12.8 El mapa, encuadrado por el dato y no por una constante

El centro y el zoom por defecto eran una constante, y una constante no puede acertar con una
ciudad que no conoce: con la muestra sintética el zoom 13 era correcto y con los 48 km de Santa
Cruz mostraba un barrio. El mapa público encuadra ahora sobre el **bbox de la capa vigente**, que
`geo-service` ya publicaba en `/geo/v1/capas`.

No es geolocalización: no se consulta dónde está quien mira, solo dónde está la ciudad. Y se hace
una vez y únicamente si nadie tocó el mapa todavía (`movestart` con `originalEvent` marca el
gesto), así que no le arrebata la vista a nadie. La geolocalización sigue siendo un botón.

Lo otro que cambió en el mapa: el origen vectorial de manzanas declaraba `minzoom: 0` aunque la
capa solo se dibuja desde z14. Medido contra el servicio, la tesela z10 de manzanas son **2,0 MB**
y la z12, 515 KB, frente a 42 KB en z14. Ahora el origen declara el mismo `minzoom` que su capa.

### 12.9 Lo que se comprobó y estaba bien

- **No hay un solo `TODO`, `FIXME` ni `HACK` en el repositorio.** Las 26 coincidencias del barrido
  son la palabra castellana «todo», `UBICACION_METODOS` y `NOTA_METODOLOGICA`.
- **No hay mocks en código de ejecución**: los únicos `mock*` están en archivos `.test.ts`.
- **No hay URLs de desarrollo** fuera del mapa base de OpenStreetMap, que está documentado, lleva
  su atribución y tiene sección propia en `produccion.md` con las tres alternativas para
  producción y lo que hay que conseguir para cada una. No se inventó ninguna credencial.
- **El filtro por bbox sigue operando sobre `geom_publico`**: comprobado en vivo con la entrega
  real, un bbox de 10 m sobre la coordenada exacta no devuelve el reporte y el mismo bbox sobre la
  publicada sí.
- **Exportaciones, indicadores y capas siguen exigiendo sesión**: 401 sin cookie.
- **La idempotencia aguanta**: 8 envíos simultáneos con la misma clave → un reporte; misma clave
  con cuerpo distinto → 409; sin clave → dos reportes.
- **Multi-réplica de fotos, probado de verdad**: subida en una réplica, lectura byte a byte
  idéntica desde otra levantada aparte, nada en el disco local, el objeto en el bucket y el JPEG
  empezando en `ff d8 ff db` (sin `APP1`, es decir sin EXIF).

### 12.10 Cosas que quedaron anotadas y no se tocaron

- La entrega tiene 16 distritos (1 a 15 más «PI») y el plano escaneado del panel numera doce. Son
  fuentes distintas y de fechas distintas; el aviso de esa pantalla decía que los mapas «no usan
  estos límites todavía», lo cual dejó de ser cierto al activar las capas. Reescrito para decir lo
  que pasa de verdad: manda la capa vigente.
- El `web.geojson` de manzanas tiene 27 434 features y la tabla 27 527. La diferencia son 93
  polígonos minúsculos que la simplificación descarta. Solo afecta al dibujo; el point-in-polygon
  trabaja sobre PostGIS, que las tiene todas.
- El desplegable de unidades vecinales del panel pasó de 12 opciones a 576. Es un `<select>`
  nativo y sigue siendo usable; si el técnico pide buscar dentro, es una tarea aparte.

### 12.11 Estado al cerrar la Fase 6

Números exactos en el informe entregado al usuario. Dependencias nuevas: **ninguna**.

Sin commit, sin push, sin nada tocado en GitHub.

---

## 13. Fase 7: el punto que el vecino eligió, y cuántos hay (2026-09-19)

Dos pedidos concretos —que el detalle no se cierre solo al mover el mapa, y que las agrupaciones
digan cuántos reportes reúnen— destaparon media docena de cosas que nadie había mirado porque con
doce puntos de juguete ninguna se notaba.

### 13.1 El detalle dependía de la consulta del viewport

`VistaMapa` sacaba el reporte abierto de dentro del resultado del listado:

```ts
const elegido = todas.find((f) => f.properties.id === seleccionado) ?? null;
```

`todas` es lo que devuelve `GET /api/v1/reportes?bbox=…`, y ese bbox cambia con cada movimiento del
mapa. Alejar, arrastrar o escribir en el buscador cambiaba el conjunto, y si el reporte abierto ya
no estaba dentro, el panel se cerraba **en mitad de la lectura**. Con el tope de 300 features de la
API, alejar lo suficiente bastaba para que se cayera aunque siguiera en pantalla.

Son dos cosas distintas y ahora son dos estados distintos:

| | de dónde sale | cuándo cambia |
|---|---|---|
| Qué hay en esta vista | `['reportes', filtros]` | cada vez que el mapa se queda quieto |
| Qué eligió mirar el vecino | `['reporte', id]` | solo cuando elige otro o cierra |

El detalle vive en su propia consulta contra `GET /api/v1/reportes/:id`, que es la fuente de verdad
(mismos campos públicos, misma coordenada desplazada). Mientras viaja se muestra la copia que ya
traía el listado (`placeholderData`), así que abrir un punto sigue siendo instantáneo y además
queda confirmado contra el servidor. `gcTime` de cinco minutos para que sobreviva a cualquier
cambio de vista.

Un **404 pesa más que esa copia**: si el técnico rechaza el reporte mientras alguien lo mira, el
panel pasa a decir «No encontramos este reporte» en vez de seguir enseñando un estado que dejó de
ser cierto. Con un fallo de red, en cambio, la copia se conserva y se ofrece reintentar: ahí el
dato sigue valiendo, lo que falta es la confirmación.

El punto elegido también se añade a lo que dibuja el mapa aunque la vista ya no lo traiga
(`conSeleccionado`), porque un panel abierto sobre un mapa donde ese punto desapareció se lee como
un error.

### 13.2 Arrastrar el mapa era ver los puntos parpadear

La consulta del listado no tenía `placeholderData`, así que cada movimiento —que cambia la
`queryKey`— devolvía `undefined` hasta que llegaba la respuesta: el listado volvía a «Buscando
puntos…» y el mapa se quedaba sin un solo punto durante el viaje de ida y vuelta. Con
`keepPreviousData` se ve lo último bueno hasta que llega lo siguiente, y un indicador discreto dice
«Actualizando…».

### 13.3 Con más de sesenta puntos en la vista, el mapa no dibujaba nada

El interruptor entre pastillas HTML y círculos de la GPU comparaba el **listado entero** con el
tope de 60:

```ts
const conPastillas = lista.length > 0 && lista.length <= MAX_PASTILLAS;
for (const capa of ['clusters', 'clusters-n', 'puntos-ancla'])
  m.setLayoutProperty(capa, 'visibility', conPastillas ? 'none' : 'visible');
```

Con 61 puntos o más se apagaban las pastillas y quedaba encendida `puntos-ancla`, que tiene
`circle-opacity: 0` porque solo existe para el clic. Por encima del zoom de agrupación —donde ya no
hay círculos que dibujar— eso es un mapa **literalmente vacío** con 61 reportes dentro. Con los 32
publicados de hoy no se veía; con 3 456 puntos de prueba, sí.

Ahora se le pregunta a MapLibre qué está dibujando suelto (`queryRenderedFeatures` sobre el ancla)
y el tope se aplica a eso, que es lo que de verdad ocupa nodos del DOM. Y hay una capa `puntos`
visible, con el color de la severidad, para cuando no caben las pastillas.

De paso, el otro efecto: antes, por debajo de 60 puntos **no se agrupaba nunca**. Con los datos
reales el vecino no veía una sola agrupación. Ahora agrupa siempre MapLibre y las pastillas se
dibujan para los que quedan sueltos.

### 13.4 Las agrupaciones dicen cuántos, cuánto y qué tan grave

| | antes | ahora |
|---|---|---|
| Número | `point_count_abbreviated` («1.2K», en inglés) | `numeroCompacto`: exacto hasta 999, «1,2 mil» por encima |
| Tamaño | 3 escalones, 18–30 px de radio | 5 bandas, 16–32 px, con mínimo y máximo |
| Severidad | ninguna | anillo del color de la más grave que hay dentro |
| Crítica | ninguna | el anillo engorda de 3 a 4,5 px |

La severidad va al **estilo** del círculo y no al relleno (opción C de las cuatro planteadas):
pintar el relleno por severidad haría que un círculo grande y rojo significara a la vez «muchos» y
«graves», que son dos cosas distintas. El color no viaja solo, como pide `CLAUDE.md` §14.1: lleva
también la forma —el grosor del anillo— y el texto del resumen accesible.

El número lo escribe MapLibre con una expresión, porque `text-field` es una propiedad de layout y
se evalúa dentro del motor; la misma regla está escrita como función TypeScript (`numeroCompacto`)
para el resto de la interfaz, y el test fija los dos cortes.

**Lo que hay dibujado, en texto.** Un lienzo WebGL no expone nada al árbol de accesibilidad, así
que el número dentro de un círculo no existe para un lector de pantalla. Una región viva lo cuenta:
«3 puntos sueltos. 29 puntos agrupados en 9 zonas; acercá el mapa para verlos uno a uno». Con tres
estados separados, porque un mapa vacío, uno que todavía pregunta y uno que no pudo preguntar se
ven exactamente igual.

### 13.5 Un bucle de repintado que se comía la batería

`sincronizarPines` corre en `idle`, y escribía el filtro del anillo de selección y la visibilidad
de la capa de puntos **en cada pasada**, con el mismo valor. `setFilter` y `setLayoutProperty`
marcan la capa como sucia y piden un repintado; el repintado dispara `idle`; `idle` vuelve a
escribir. Un bucle a la velocidad de la pantalla, invisible y permanente.

Medido con 3 488 reportes publicados y 300 en el mapa, en desarrollo, mientras se aleja el mapa dos
pasos:

| | antes | después |
|---|---|---|
| Fotograma, mediana | 9,4 ms | **6,9 ms** |
| Fotograma, p95 | 24,6 ms | **7,4 ms** |
| Fotograma, máximo | 190 ms | **11 ms** |
| Tareas largas (>50 ms) | 9, de 52 a 174 ms | **ninguna** |

Ahora las dos escrituras se hacen solo cuando el valor cambia.

### 13.6 El mapa público le enseñaba al técnico la ubicación exacta

Esto apareció solo, mirando por qué el titular decía «44 puntos publicados» cuando hay 32.

`GET /api/v1/reportes` devuelve la vista **técnica** —coordenada sin desplazar, y también los
reportes en revisión— cuando la petición trae una sesión de técnico. Es lo correcto: el panel usa
ese mismo endpoint. Pero **las cookies no distinguen puertos**. Con el panel en `localhost:3100` y
el mapa público en `localhost:3000`, el navegador manda la cookie de sesión a los dos, y el mapa
público pasaba a servir los 44 reportes con la ubicación sin degradar a cualquiera que tuviera
sesión de técnico abierta en la misma máquina.

En producción, con el panel en otro nombre de dominio, no pasaría. Pero apoyarse en la topología
del despliegue para no filtrar una ubicación es apoyarse en lo que no se controla: si algún día los
dos se sirven desde el mismo host, vuelve. La aplicación pública **no manda cookies nunca**
(`credentials: 'omit'`): acá el vecino no tiene cuenta y no hay una sola petición que necesite
sesión (§16.4). Hay un test que recorre las cuatro llamadas y lo fija.

### 13.7 En un teléfono, abrir un punto era no poder mover el mapa

La hoja de detalle ocupaba `82dvh`. Con el detalle abierto no quedaba mapa que mirar y, peor, la
hoja tapaba los botones de zoom: Playwright lo dijo con todas las letras —*«`<div class="hoja">`
intercepts pointer events»*— al intentar alejar el mapa con el detalle abierto. Justo lo que esta
fase venía a permitir.

Ahora la hoja mide `58dvh` (el resto se lee desplazándola) y los controles de zoom y ubicación se
levantan por encima de ella mientras está abierta. Medido a 412×839: la hoja empieza en y=368 y el
botón de alejar termina en y=226.

### 13.8 «300 de 3,5 mil»

La API acota cada consulta a 300 features y devuelve el total de la vista. Sin decirlo, los números
de las agrupaciones sumarían 300 y el vecino leería «300 puntos» donde hay miles: el mapa estaría
mintiendo sobre la densidad, que es exactamente lo que las agrupaciones existen para contar. Ahora,
cuando la vista viene recortada, lo dice: «Se muestran 300 de 3.488 puntos de esta vista: los más
recientes» —el orden es `creado_en DESC`, comprobado en la consulta—.

El relleno graduado de distritos y unidades vecinales sigue saliendo de
`/geo/v1/agregados/unidades-vecinales`, que cuenta **todos** los reportes; así que la densidad
completa sí está representada, aunque los puntos vengan recortados.

### 13.9 El prototipo, otra vez

El HTML original sigue en `Descargas/Mi Curichi · Prototipo (compartible).html` y se volvió a
extraer para comparar. Lo relevante para esta fase:

- **No tenía agrupación**: 24 reportes de ejemplo, un marcador cada uno. Agrupar es una decisión de
  esta fase, obligada por los datos reales.
- **El detalle era una pantalla propia** (C-02 en móvil, con su propio mapa centrado en el punto) y
  en escritorio reemplazaba la columna izquierda (W-02). Es decir: el detalle nunca dependió del
  viewport. Lo que se arregló acá es que la versión web se había alejado de eso.
- De ahí sale también el encuadre al elegir desde la lista: si el punto no se ve, el mapa se acerca
  a él, como hacía C-02.
- El zoom por rueda estaba desactivado en el prototipo (`scrollWheelZoom:false`) porque vivía
  dentro de un marco de celular dibujado en una página; acá no aplica.

### 13.10 Medido con 3 456 puntos de prueba, y borrados después

Para medir de verdad se generaron 3 456 reportes dentro de las unidades vecinales reales
(`ST_GeneratePoints` sobre `geo.unidad_vecinal_vigente`, seis por unidad, semilla fija), marcados
con `[CARGA DE PRUEBA LOCAL]` en la descripción. Al terminar se borraron por esa marca y la base
volvió a sus 44 filas / 32 publicados, comprobado.

Con 3 488 publicados, sirviendo el listado de 300 features:

| | |
|---|---|
| Listado por bbox (con conexión abierta) | 14–26 ms |
| Tamaño de la respuesta | 260 KB, **15,7 KB** con gzip |
| Agregados por unidad vecinal | 14 ms, 108 KB |
| Detalle de un reporte | ~15 ms |
| Inserción de las 3 456 filas | 1,2 s |

El tope de `limite` es 500 por contrato; el mapa pide 300.

### 13.11 Lo que se comprobó y estaba bien

- **Las agrupaciones no abren ningún canal de ubicación.** `getClusterLeaves` y
  `getClusterExpansionZoom` trabajan sobre el origen GeoJSON del navegador, que son exactamente las
  features que devolvió la API pública: coordenada ya desplazada y redondeada a cinco decimales.
  `clusterProperties` solo suma cuántos hay de cada severidad. El centroide de un grupo es el
  promedio de puntos ya desplazados, es decir menos preciso, no más. Comprobado además que un
  reporte con `ubicacion_tipo = vivienda_o_predio` sale con `manzana_id: null`,
  `direccion_aprox: null` y la coordenada movida respecto a la de la base.
- **Ningún `TODO`, `FIXME` ni `HACK` real** en el repositorio; las tres coincidencias son la palabra
  castellana «todo» en mayúsculas.
- **Ningún mock en código de ejecución**: los únicos están en archivos `.test.ts`.
- **Ningún `dangerouslySetInnerHTML`**. Los dos `innerHTML` que hay escriben la cadena vacía para
  limpiar un marcador antes de volver a rellenarlo con `document.createTextNode`.
- **Los errores de foto no filtran nada de dentro**: ni libvips, ni rutas, ni trazas. El mensaje
  público es «No pudimos leer esa imagen…» y el detalle va al log.
- **Sin desbordamiento horizontal** en las cinco pantallas públicas a 320, 390, 412, 1280, 1440 y
  1920 px, ni en el login del panel. Hay un test que lo fija y nombra al culpable si aparece.
- **`pnpm secretos` sin hallazgos** y **`pnpm audit` sin vulnerabilidades altas**.

### 13.12 Cosas anotadas y no tocadas

- El mapa del panel técnico **no agrupa**, y está bien: la tabla pagina de a 50 y el mapa dibuja
  esos 50. Si algún día el panel muestra miles de puntos a la vez, habrá que traerle lo mismo.
- `api-core` se **niega a arrancar** con `NODE_ENV=production` y `COOKIE_SEGURA=0`. Se comprobó sin
  querer al intentar levantar el contenedor con la cookie relajada para los E2E. Es la protección
  funcionando; por eso la suite corre contra servicios en modo desarrollo (ver 13.13).
- El buscador del mapa filtra sobre lo que ya está cargado. Con la vista recortada a 300, buscar
  una calle que está en el reporte 301 no la encuentra. Las sugerencias de unidad vecinal sí van
  contra el servidor. Está anotado, no resuelto.

### 13.13 Cómo correr los E2E

La suite habla con `api-core` por HTTP sin TLS. Con `COOKIE_SEGURA=1` la cookie de sesión sale
marcada `Secure` y el `APIRequestContext` de Playwright —que no es un navegador y no aplica la
excepción que los navegadores hacen con `localhost`— no la devuelve: los casos con sesión de
técnico reciben 401. `e2e/playwright.config.ts` ya pasa `COOKIE_SEGURA=0` al servidor que levanta
él mismo.

Si los servicios ya están corriendo en Docker (perfil `servicios`, que va con
`NODE_ENV=production`), Playwright los reutiliza y esos dos casos fallan. Para una pasada completa:

```bash
docker compose stop api-core geo-service
```

y levantar los dos en modo desarrollo contra la misma base de Docker, con `COOKIE_SEGURA=0` y
`NODE_ENV=development`. Al terminar, `docker compose up -d api-core geo-service` los devuelve a
producción con la cookie segura.

### 13.14 Estado al cerrar la Fase 7

```
pnpm lint          0    (Biome, 238 archivos)
pnpm typecheck     0    (9 paquetes)
pnpm test          0    284 pasan + 2 omitidos (eran 281 + 2)
pnpm build         0    (7 tareas)
pnpm test:e2e      0    55 pasan, 0 omitidos (eran 45 + 1 omitido + 2 en rojo)
pnpm secretos      0    sin hallazgos
pnpm audit         0    sin vulnerabilidades altas
```

Dependencias nuevas: **ninguna**.

Sin commit, sin push, sin nada tocado en GitHub.

---

## 14. Cuentas ciudadanas, cuota antiabuso y preparación del PR (2026-09-22)

**Ver el mapa sigue sin cuenta. Crear un reporte (y subir una foto) exige cuenta**, y cada cuenta
puede enviar **un reporte cada 60 minutos**. El detalle de seguridad —qué se implementó, qué se
atacó y con qué resultado, riesgos nuevos— está en
[`docs/seguridad/auditoria-2026-09.md` §9](seguridad/auditoria-2026-09.md).

> **Pendiente de decisión del usuario:** CLAUDE.md §13 y §16.4 siguen describiendo el reporte
> anónimo sin cuenta. No se editaron porque CLAUDE.md solo se toca con autorización.

Qué cambió, por dónde empezar a leer:

| Qué | Dónde |
|---|---|
| Migración | `packages/db/migraciones/0009_cuentas_ciudadanas.sql` (columna `ultimo_reporte_en`, grants por columna en `usuario`) |
| Cuota atómica | `services/api-core/src/cuota.ts` |
| Alta, rotación de sesión, `/auth/yo` con `puede_reportar_desde` | `services/api-core/src/rutas/auth.ts` |
| Escritura con sesión | `rutas/reportes.ts`, `rutas/fotos.ts` |
| Contrato | `packages/contracts/src/esquemas/auth.ts` (`RegistroSchema`, `SesionActualSchema`); CHANGELOG 0.3.0 |
| Interfaz | `apps/web-ciudadano`: `/ingresar`, `/crear-cuenta`, `/cuenta`, `AccesoRequerido`, `FormularioAcceso`, `lib/sesion.tsx` |
| Pruebas | `api-core/test/cuentas-y-cuota.test.ts`, `cuota-concurrencia-pg.test.ts` (PostgreSQL real), `e2e/tests/cuenta-ciudadana.spec.ts` |
| Documentación para el PR | `README.md` reescrito, `SECURITY.md`, `CONTRIBUTING.md`, `docs/PR_CHECKLIST.md`, `.env.example` |

Cuenta de desarrollo nueva: `vecina@curichi.local` / `curichi-vecina-local` (la crea el seed).

Dos cosas que sorprenden la primera vez:

- **`docker compose up -d` no levanta los servicios.** api-core y geo-service están bajo el perfil
  `servicios`: hace falta `docker compose --profile servicios up -d`.
- **Turborepo 2 filtra el entorno.** Una variable que no esté en `globalEnv` de `turbo.json` no
  llega a ningún servicio arrancado con `pnpm dev` ni con `pnpm test:e2e`.

Resultado: lint 256 archivos · typecheck 9 paquetes · 363 tests + 6 omitidos · concurrencia real
4/4 · **74 E2E, 0 fallos** · build 7 · secretos y auditoría limpios · privilegios correctos ·
Docker desde volumen vacío, 4 contenedores sanos.

Sin commit, sin push, sin PR.
