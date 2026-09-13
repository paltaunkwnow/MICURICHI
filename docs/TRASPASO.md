# Traspaso — estado exacto al 2026-09-13

Este documento dice **dónde quedó el trabajo**, **qué funciona verificado**, **qué falta** y **cómo retomarlo**. Léelo junto con `CLAUDE.md`, que es el manual operativo y no cambia con el traspaso.

- **Fase 0 (manual):** aprobada.
- **Fase 1 (local):** las cinco partes están escritas y corren. Falta cerrar la tarea 9 (E2E ejecutados, revisión de seguridad, auditorías) y arreglar los defectos listados en §3.
- **Fase 2 (web):** no empezada. Requiere decisiones del usuario (§6).

---

## 1. Cómo levantar todo desde cero

Requisitos ya presentes en la máquina de desarrollo: Node 24 (nvm) y pnpm 12. **No** hacen falta Docker, Homebrew, GDAL ni Python: la Fase 1 corre sin ellos (ver `docs/decisiones/0002-*.md`, pendiente de escribir, y §4 de este documento).

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

`pnpm dev` (Turborepo) arranca todo junto, pero también intenta levantar `db`, que choca con el `pnpm db:local` de la terminal 1. Mientras no se arregle eso (§3.6), conviene arrancar por paquete.

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

---

## 3. Defectos y tareas pendientes, en orden de prioridad

### 3.1 El ETL exige `--forzar` con los datos reales (alto)
`pnpm etl:run -- --version DM_UV_MZ_2025` se detiene porque, al resolver los 21 solapes entre distritos, dos de ellos cambian de área más del 0,1 % permitido. El cambio real del área total de la capa es **0,0135 %**, es decir, despreciable.

**Qué decidir:** o se sube `tolerancia_cambio_area` en `pipelines/geodata-etl/config/capas.yaml` a un valor justificado (por ejemplo 0,02 para el área total y otro por feature), o se separa el umbral por feature del umbral de capa. Hoy ambos usan el mismo número, que es la causa del falso positivo.

**Dónde:** `pipelines/geodata-etl/src/pipeline.ts`, sección "5) reparación con -clean".

### 3.2 El mapa base no quedó oscuro (medio)
El diseño pide un mapa oscuro. Se cambió de CARTO (ahora exige clave de API y estampa "API KEY REQUIRED" sobre las teselas) a OpenStreetMap, que sí carga, pero el resultado es **gris claro**, no la tinta del diseño. Los valores de `raster-brightness-max`, `raster-opacity` y `raster-saturation` ya están puestos pero no produjeron el efecto esperado.

**Dónde:** `apps/web-ciudadano/src/componentes/Mapa.tsx` y el mismo archivo en `apps/panel-admin`, constante `ESTILO_BASE`.

**Alternativas:** ajustar los valores de pintura hasta lograrlo, o usar un estilo vectorial oscuro auto-hospedado. Recordar que OSM no permite uso en producción: la Fase 2 necesita una base propia de todos modos (`CLAUDE.md` §14.3).

### 3.3 El mapa no encuadra los reportes al abrir (medio)
El mapa arranca centrado en el centro de la ciudad con zoom 13, pero los reportes sintéticos están repartidos por todo el municipio, que llega hasta la longitud −62,80. Resultado: se ven pocos o ningún punto al entrar.

**Qué hacer:** al cargar la primera página de reportes, ajustar la vista a su extensión (`fitBounds`), o sembrar los reportes de muestra concentrados en el casco urbano.

**Dónde:** `apps/web-ciudadano/src/componentes/VistaMapa.tsx` y `packages/db/src/seeds/samples.ts`.

### 3.4 Los E2E nunca se ejecutaron (alto)
Están escritos y `pnpm exec playwright test --list` reconoce los 18 casos en 4 archivos, con Chromium ya descargado. **No se corrieron nunca.** Es muy probable que algún selector no coincida con el marcado final.

**Cómo:** levantar la pila (§1) y `cd e2e && pnpm test:e2e`. Empezar por `tests/api-contratos.spec.ts`, que no usa navegador y debería pasar tal cual.

### 3.5 Documentos de la Parte 5 sin escribir (medio)
- `docs/decisiones/0002-modo-local-sin-docker-y-etl-en-typescript.md`: la decisión está tomada y aplicada, y `CLAUDE.md` §8.2 la resume, pero falta el registro formal. El índice `docs/decisiones/README.md` todavía no lo lista.
- `docs/seguridad/revision-fase1.md`: falta recorrer `docs/seguridad/checklist-pr.md` contra el código real y marcar cada punto con su evidencia.
- El flujo de trabajo `e2e` opcional en `.github/workflows/ci.yml` tampoco se agregó.

### 3.6 `pnpm dev` choca con la base local (medio)
El script `dev` de `packages/db` levanta un segundo servidor PGlite en el puerto 5433 y falla si ya hay uno. Conviene quitar `dev` de ese paquete o hacerlo detectar un servidor existente.

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

### 3.8 Pendientes menores
- Falta el archivo del logotipo. El usuario lo envió como imagen en el chat; hay un marcador provisional en `apps/web-ciudadano/public/icono.svg`. El definitivo va en `apps/web-ciudadano/public/logo.png`.
- El `README.md` de la raíz todavía muestra la tabla de tareas con casi todo "pendiente".
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
