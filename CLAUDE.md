# CLAUDE.md — Mi Curichi

> **Manual operativo permanente del repositorio.** Cualquier agente o persona que trabaje aquí debe leer este archivo completo antes de tocar nada.
> Estado actual: **Fase 1 — Local, en curso.** Fase 0 aprobada el 2026-09-13. Tarea 1 (Parte 5, arranque) hecha en `fase-1/repo`. El 2026-09-13 el usuario ordenó **completar toda la Fase 1 sin detenerse por aprobaciones por tarea**, probar la ejecución y desplegar en localhost; esa orden sustituye la puerta por tarea de §10.2 solo para la Fase 1.
> Última actualización: 2026-09-13. Versiones de software verificadas en esa fecha (ver §8). Distribución del trabajo en **5 partes** fijada por el usuario (§4).

## 0. Reglas de oro (leer aunque no se lea nada más)

1. **Solo se tocan las carpetas designadas de la parte que ejecuta la tarea** (§4 y §5). Fuera de ellas: documentar y avisar, nunca editar.
2. **No se cruza una puerta de fase sin un "aprobado" explícito del usuario** (§10).
3. **`data/raw/` es inmutable.** Todo `data/processed/` se regenera con un solo comando (§6).
4. **Nunca convertir un shapefile sin conocer su CRS.** Si falta `.prj`, detenerse y preguntar.
5. **Distrito y unidad vecinal se calculan por point-in-polygon**, nunca se toman de texto escrito por el usuario.
6. **No inventar** normativas, versiones, cifras ni fuentes. Lo no verificado se escribe como `<a confirmar>`.
7. **Ningún secreto en el repo.** Todo por variables de entorno con `.env.example` sin valores reales.
8. **La ubicación de un reporte es dato sensible.** Vista pública con precisión degradada cuando corresponda; identidad del reportante nunca en el mapa público.
9. **Antes de programar cualquier parte: plan corto → aprobación → código.** Sin excepciones.
10. **Alcance de la Misión 1 cerrado** (§3). Todo lo demás va al backlog (§15).

---

## 1. Propósito del proyecto y problema que resuelve

**Nombre:** Mi Curichi. En el habla de Santa Cruz (Bolivia), *curichi* es un bajío o zona pantanosa donde el agua se estanca; el nombre alude a los charcos recurrentes que cada vecino conoce en su barrio.

**Problema.** En la ciudad existen puntos recurrentes de inundación y estancamiento de agua (anegamientos) que hoy no están sistematizados. La municipalidad no dispone de un inventario georreferenciado, alimentado por la ciudadanía, que permita saber **dónde**, **con qué frecuencia**, **con qué tirante** y **con qué afectación** se anega la ciudad.

**Solución.** Plataforma web de **reporte ciudadano georreferenciado de puntos de inundación**. El vecino marca dónde se estanca el agua, adjunta foto y datos del evento; el sistema acumula, valida, clasifica por severidad y visualiza los puntos sobre un mapa, cruzándolos automáticamente con la división administrativa oficial (**distrito municipal** y **unidad vecinal**).

**Usuarios.**

| Usuario | Qué hace | Parte |
|---|---|---|
| Ciudadano / vecino | Reporta un punto (GPS o clic en el mapa), adjunta foto, consulta el mapa público | Parte 1 (`apps/web-ciudadano`) |
| Técnico municipal / analista | Valida, rechaza, fusiona duplicados, reclasifica, filtra, exporta, analiza | Parte 2 (`apps/panel-admin`) |
| Administrador | Gestiona capas base, usuarios, moderación y configuración | Parte 2 (`apps/panel-admin`) |

**Contexto territorial.** Ciudad: **Santa Cruz de la Sierra, Bolivia** `<a confirmar>` (inferido por el nombre "curichi" y por la división distrito municipal / unidad vecinal, propia de esa ciudad). Capas administrativas provistas por el municipio en **shapefile**, en una carpeta llamada **`DM_UV_MZ_2025`** con tres capas: distritos municipales (DM), unidades vecinales (UV) y **manzanas** (MZ). Fuente oficial y fecha de vigencia `<a confirmar>`. Las manzanas se usan para el **render del mapa interactivo**; el point-in-polygon del MVP resuelve distrito y UV (la manzana se anota si el punto cae en una, como dato opcional).

**Lo que este sistema ES y NO ES.** Es un **inventario de reportes ciudadanos** (percepción, no medición). **No es** un modelo hidráulico, ni un estudio de drenaje, ni un instrumento para decidir inversiones por sí solo. Ver §9.5.

---

## 2. Glosario del dominio

| Término | Definición operativa en este proyecto |
|---|---|
| **Anegamiento** | Acumulación de agua sobre la superficie (calle, acera, predio) que no drena en un tiempo razonable tras la lluvia. Es el fenómeno que se reporta. |
| **Inundación** | Anegamiento con tirante y extensión suficientes para afectar personas, vehículos o viviendas. En el sistema no se distingue formalmente de anegamiento; la severidad (§9.1) hace la gradación. |
| **Tirante** | Altura de la lámina de agua sobre el suelo. Se estima por referencia corporal: tobillo (<10 cm), rodilla (10–40 cm), muslo (40–70 cm), >70 cm. |
| **Duración del anegamiento** | Tiempo que el agua permanece estancada tras el fin de la lluvia. |
| **Recurrencia / frecuencia** | Cuántas veces se anega el mismo punto: primera vez, ocasional, cada lluvia fuerte, permanente. |
| **Escorrentía** | Fracción de la lluvia que no infiltra y corre por la superficie hacia el sistema de drenaje. |
| **Sumidero (boca de tormenta, rejilla)** | Estructura de captación que toma el agua de la calle y la lleva al colector. Tiene una capacidad de captación limitada; si está tapado o es insuficiente, el agua se acumula. |
| **Cuneta** | Canal longitudinal al borde de la calzada que conduce el agua hacia los sumideros. Requiere pendiente longitudinal para funcionar. |
| **Colector** | Tubería o canal principal que recibe el agua de los sumideros. Si se satura, el agua deja de entrar e incluso puede brotar por los sumideros (sobrecarga). |
| **Bombeo (pendiente transversal)** | Inclinación de la calzada desde el eje hacia los bordes para evacuar el agua a las cunetas. Si se pierde (deformación, mal recapado), el agua queda en el carril. |
| **Contrapendiente** | Tramo donde la pendiente longitudinal se invierte y crea un punto bajo sin salida por gravedad. Causa típica de charcos permanentes. |
| **Hundimiento** | Asentamiento localizado del pavimento (subrasante débil, fuga de tubería que lava finos). Genera una depresión que atrapa agua. |
| **Ahuellamiento** | Deformación en las huellas de los neumáticos. Las huellas se convierten en canales de agua estancada. |
| **Bache** | Pérdida de material en la carpeta. Actúa como trampa de agua y el agua acelera su crecimiento (ciclo vicioso). |
| **PCI** | *Pavement Condition Index* (ASTM D6433), índice 0–100 del estado superficial del pavimento. Solo referencia; no se calcula en este sistema. |
| **IRI** | *International Roughness Index* (m/km), regularidad longitudinal. Solo referencia. |
| **Curva IDF** | Intensidad–Duración–Frecuencia de lluvia; relaciona intensidad de precipitación con su duración y período de retorno. No se implementa en Misión 1. |
| **Período de retorno** | Intervalo medio (años) entre eventos de lluvia de cierta magnitud. Referencia para diseño de drenaje. |
| **Método racional** | Q = C · i · A: caudal pico = coeficiente de escorrentía × intensidad × área. Referencia para fases futuras. |
| **Distrito municipal** | Unidad administrativa mayor de la ciudad. Capa oficial en shapefile. |
| **Unidad vecinal (UV)** | Subdivisión del distrito. Es la unidad de agregación principal del sistema. Cada UV pertenece a exactamente un distrito. |
| **Manzana (MZ)** | Bloque urbano delimitado por calles, dentro de una UV. Capa de referencia visual en el mapa; entre manzanas hay huecos (calles) por diseño, no por error. |
| **Point-in-polygon (PIP)** | Operación espacial que determina en qué polígono cae un punto. Es como el sistema asigna distrito y UV a cada reporte. |
| **Punto crítico** | Agrupación analítica de reportes validados dentro de un radio configurable (§9.2). No reemplaza a los reportes individuales. |
| **CRS / SRS** | Sistema de referencia de coordenadas. Define cómo se interpretan los números de una coordenada. |
| **EPSG:4326** | WGS 84 geográfico (lat/lon en grados). CRS obligatorio para todo lo que consume la web y para `geom` en base de datos. |
| **UTM** | Proyección métrica por zonas. Santa Cruz cae en la zona 20 Sur: WGS 84 / UTM 20S = **EPSG:32720**; capas antiguas pueden venir en PSAD56 / UTM 20S = **EPSG:24880**. `<a confirmar leyendo el .prj de cada capa>`. |
| **Shapefile** | Formato vectorial de ESRI. Un "shapefile" son varios archivos: `.shp` (geometría), `.shx` (índice), `.dbf` (atributos), `.prj` (CRS), `.cpg` (encoding). |
| **GeoJSON** | Formato JSON para geometrías. Por RFC 7946 debe estar en EPSG:4326. |
| **Teselas vectoriales / PMTiles** | Capa cortada en mosaicos por nivel de zoom, para renderizar capas grandes sin descargar todo el GeoJSON. PMTiles empaqueta todas las teselas en un único archivo servible por HTTP con *range requests*. |
| **PostGIS / índice GIST** | Extensión espacial de PostgreSQL. El índice GIST hace que el PIP sea O(log n) en lugar de recorrer todos los polígonos. |
| **Clustering visual** | Agrupación de puntos en el mapa según el zoom, solo para render (MapLibre `cluster: true`). Distinto del punto crítico, que es analítico. |
| **Jitter** | Desplazamiento aleatorio pequeño y determinista aplicado a una coordenada en la vista pública para no exponer una vivienda exacta. |

---

## 3. Alcance de la Misión 1 (MVP) y fuera de alcance

### 3.1 Dentro del alcance (y solo esto)

1. **Mapa interactivo** que renderiza los puntos de inundación reportados (con clustering visual) — Parte 1.
2. **Panel de detalle** (Parte 1) al tocar/hacer clic en un punto, con como mínimo:
   - Coordenadas lat/lon (EPSG:4326) y dirección aproximada (geocodificación inversa, **opcional**).
   - **Distrito municipal** y **unidad vecinal** del punto, calculados por PIP.
   - Fecha/hora del reporte, descripción, foto (si existe), severidad y estado de validación.
3. **Resolución espacial por point-in-polygon** contra las capas oficiales cargadas en PostGIS — Parte 4.
4. **Formulario de reporte** para crear un punto nuevo, con ubicación por GPS del dispositivo o por selección manual en el mapa, y con los campos del modelo (§7.1) — Parte 1 (interfaz) y Parte 3 (creación, validación y severidad).
5. **Panel técnico mínimo** (Parte 2): tabla + mapa con filtros, moderación (validar / rechazar / fusionar / reclasificar), exportación CSV y GeoJSON, indicadores básicos.
6. **Pipeline ETL** shapefile → GeoJSON → PostGIS, reproducible con un comando — Parte 5.
7. **Entorno local completo** con Docker Compose — Parte 5.

### 3.2 Explícitamente fuera de alcance (va a §15)

- Modelación hidráulica o hidrológica de cualquier tipo.
- Priorización de inversión, cálculo de costos, ranking de obras.
- Notificaciones (email, SMS, push), suscripciones, alertas.
- Aplicación móvil nativa (la PWA cubre el MVP).
- Integración con datos de lluvia en tiempo real, pluviómetros, radar.
- Analítica avanzada, series temporales, mapas de calor por período de retorno.
- Gestión de órdenes de trabajo o seguimiento de obras.
- Autenticación social, perfiles de ciudadano, gamificación.
- Multi-municipio.

---

## 4. Arquitectura: 5 partes

El trabajo se divide **exactamente** en estas cinco partes. Cada parte tiene carpetas designadas, responsabilidades, límites, contratos y Definition of Done propios. Toda tarea se asigna a **una** parte.

### 4.1 Tabla resumen

| Parte | Nombre | Carpetas designadas | Qué entrega |
|---|---|---|---|
| **1** | Frontend público / experiencia ciudadana | `apps/web-ciudadano/` | Mapa público, panel de detalle, formulario de reporte, PWA accesible |
| **2** | Frontend administrativo / plataforma técnica | `apps/panel-admin/` | Moderación, filtros, exportación, indicadores, administración de capas y usuarios |
| **3** | Backend / API y lógica de negocio | `services/api-core/` (custodia `packages/contracts/`) | API REST, reglas de negocio, severidad, máquina de estados, auth, fotos, auditoría, antispam |
| **4** | Datos / base de datos y arquitectura geoespacial | `packages/db/`, `services/geo-service/` | Esquema PostGIS, migraciones, seeds sintéticos, point-in-polygon, capas, agregaciones, puntos críticos |
| **5** | GIS / DevOps / seguridad / infraestructura / calidad | `pipelines/geodata-etl/`, `infra/`, `e2e/`, `.github/`, `data/`, configuración raíz | ETL shapefile → PostGIS, Docker Compose, CI, política de seguridad, E2E transversal, calidad medida |
| — | Transversal | `packages/contracts/` | Única fuente de verdad de tipos, esquemas Zod y OpenAPI (§4.8) |

### 4.2 Diagrama

```mermaid
flowchart LR
  subgraph P1[Parte 1 · Frontend público]
    WEB[apps/web-ciudadano<br/>Next.js + MapLibre]
  end
  subgraph P2[Parte 2 · Frontend administrativo]
    ADM[apps/panel-admin<br/>Next.js + MapLibre]
  end
  subgraph P3[Parte 3 · Backend / API]
    API[services/api-core<br/>Fastify]
  end
  subgraph P4[Parte 4 · Datos y geoespacial]
    GEO[services/geo-service<br/>Fastify + PostGIS]
    DBP[packages/db<br/>esquema + migraciones]
    DB[(PostgreSQL + PostGIS)]
  end
  subgraph P5[Parte 5 · GIS / DevOps / seguridad / calidad]
    ETL[pipelines/geodata-etl<br/>Python + GDAL]
    INFRA[infra/ · docker-compose · .github · e2e/]
    RAW[/data/raw shapefiles/]
    PROC[/data/processed GeoJSON + PMTiles/]
  end
  C[(packages/contracts<br/>Zod + OpenAPI)]
  S3[(MinIO fotos)]

  WEB -->|REST JSON / GeoJSON| API
  ADM -->|REST JSON / GeoJSON| API
  WEB -->|capas GeoJSON / PMTiles| GEO
  ADM -->|capas GeoJSON / PMTiles| GEO
  API -->|POST /geo/v1/resolver| GEO
  API --> DB
  API --> S3
  GEO --> DB
  DBP -->|migraciones| DB
  RAW --> ETL --> PROC
  ETL -->|carga con GIST| DB
  INFRA -.levanta.-> DB
  INFRA -.levanta.-> S3
  C -.tipos y esquemas.-> WEB
  C -.-> ADM
  C -.-> API
  C -.-> GEO
  C -.dominio.json.-> ETL
```

Reglas de dependencia: los frontends (Partes 1 y 2) **nunca** hablan directo con la base de datos. `api-core` (Parte 3) es el único que escribe reportes. `geo-service` (Parte 4) es de **solo lectura**. Solo `packages/db` (Parte 4) cambia el esquema, vía migraciones. Solo el ETL (Parte 5) escribe las tablas de capas.

### 4.3 Parte 1 — Frontend público / experiencia ciudadana (`apps/web-ciudadano/`)

| Aspecto | Detalle |
|---|---|
| **Propósito** | Que cualquier vecino, desde el celular, vea el mapa y reporte un punto en menos de 2 minutos. |
| **Responsabilidades** | Mapa MapLibre con capa base atribuida, capa de UV/distritos, puntos con clustering visual; popup/panel de detalle; formulario de reporte con geolocalización, selección manual, subida de foto, validación de campos con Zod + React Hook Form; previsualización de la UV resuelta antes de enviar; PWA instalable; mobile-first; WCAG 2.2 AA; español; texto de limitaciones (§9.5) visible. |
| **NO le corresponde** | Calcular severidad, distrito o UV (los muestra, no los decide). Moderar. Almacenar fotos directamente. Hablar con la base de datos. Definir tipos de intercambio por su cuenta. |
| **Entradas** | `GET /api/v1/reportes` (GeoJSON público), `GET /api/v1/reportes/:id`, `POST /geo/v1/resolver` (previsualización), capas de `geo-service`, configuración pública. |
| **Salidas** | `POST /api/v1/reportes`, `POST /api/v1/fotos`. |
| **Dependencias** | `packages/contracts`; Parte 3 (`api-core`); Parte 4 (`geo-service`, capas). |
| **Comandos** | `pnpm --filter web-ciudadano dev / build / test / test:e2e / lint / typecheck` |
| **Definition of Done** | Compila; lint + typecheck + Vitest verdes; Playwright propio cubre: (a) abrir mapa, clic en punto, ver distrito y UV en el panel; (b) crear reporte por selección manual con foto; README con comandos; `.env.example`; Lighthouse accesibilidad ≥ 90 en local `<umbral a confirmar>`. |

### 4.4 Parte 2 — Frontend administrativo / plataforma técnica (`apps/panel-admin/`)

| Aspecto | Detalle |
|---|---|
| **Propósito** | Que el técnico municipal convierta reportes crudos en un inventario validado, exportable y consultable. |
| **Responsabilidades** | Login (técnico/admin); tabla + mapa sincronizados con filtros (distrito, UV, severidad, estado, rango de fechas); moderación: validar / rechazar (con motivo) / fusionar duplicados / reclasificar severidad (con motivo); exportación CSV y GeoJSON de la selección filtrada; indicadores básicos: reportes por UV, por distrito, por estado, recurrencia (puntos críticos con n ≥ 2); coropletas por UV. Admin: gestión de usuarios técnicos y activación de la versión vigente de capas. |
| **NO le corresponde** | Ejecutar el ETL (solo ve y activa versiones cargadas). Calcular severidad ni puntos críticos (los solicita). Analítica avanzada. |
| **Entradas** | Endpoints autenticados de `api-core`; capas y agregados de `geo-service`. |
| **Salidas** | `PATCH /api/v1/reportes/:id/estado`, `PATCH /api/v1/reportes/:id/severidad`, `POST /api/v1/reportes/:id/fusionar`, `GET /api/v1/exportar`, `POST /api/v1/admin/capas/:id/activar`. |
| **Dependencias** | `packages/contracts`; Parte 3 (`api-core`); Parte 4 (`geo-service`). |
| **Comandos** | `pnpm --filter panel-admin dev / build / test / test:e2e / lint / typecheck` |
| **Definition of Done** | Compila; lint + typecheck + tests verdes; Playwright propio cubre login → filtrar por UV → validar un reporte → exportar GeoJSON; README; `.env.example`. |

### 4.5 Parte 3 — Backend / API y lógica de negocio (`services/api-core/`)

| Aspecto | Detalle |
|---|---|
| **Propósito** | Ser el único punto de escritura del dominio y el guardián de las reglas de negocio. |
| **Responsabilidades** | CRUD de reportes; máquina de estados (§7.3); cálculo de severidad (§9.1) con función pura testeada; llamada a `geo-service` para resolver distrito/UV al crear o mover un reporte; disparo del recálculo de puntos críticos en cada transición (§9.2); autenticación (sesión) y autorización por rol; validación de payloads con los esquemas de `contracts`; auditoría de cada cambio; rate limiting y antispam en creación; gestión de fotos (límite de tamaño, tipos por *magic bytes*, **sanitización EXIF**, redimensionado, subida a MinIO); exportación CSV/GeoJSON con nota metodológica; healthchecks; logging estructurado. **Custodia `packages/contracts`**: revisa todo cambio de contrato propuesto por otras partes. |
| **NO le corresponde** | Definir el esquema de base de datos ni escribir migraciones (Parte 4; consume el cliente de `packages/db`). Operaciones espaciales sobre polígonos (Parte 4). ETL, infraestructura, CI (Parte 5). Render. |
| **Entradas** | Peticiones HTTP de Partes 1 y 2; respuesta de `geo-service`; cliente tipado de `packages/db`. |
| **Salidas** | Filas en `reporte_inundacion`, `reporte_foto`, `auditoria`, `usuario`; objetos en MinIO; JSON/GeoJSON a clientes. |
| **Dependencias** | `packages/contracts`, `packages/db`, PostgreSQL/PostGIS, MinIO, `geo-service`. |
| **Comandos** | `pnpm --filter api-core dev / build / test / lint / typecheck` |
| **Definition of Done** | Compila; lint + typecheck + Vitest verdes; test de integración del camino crítico: `POST /reportes` → se resuelve UV → severidad calculada → estado `nuevo`; test de tabla de severidad (§9.1) con todos los casos de escalamiento; test que sube una foto con EXIF GPS y verifica que el objeto guardado no lo contiene; README; `.env.example`; OpenAPI publicado en `/docs`. |

### 4.6 Parte 4 — Datos / base de datos y arquitectura geoespacial (`packages/db/`, `services/geo-service/`)

| Aspecto | Detalle |
|---|---|
| **Propósito** | Ser dueña del modelo de datos y de toda operación espacial: que el esquema evolucione solo por migraciones y que "¿en qué distrito y UV cae este punto?" se responda en milisegundos. |
| **Responsabilidades** | **`packages/db`**: esquema Drizzle de `public` y `geo` (§7); migraciones versionadas (extensiones PostGIS, tablas, índices GIST, vistas `*_vigente`); cliente tipado exportado a `api-core` y `geo-service`; seeds **sintéticos** (`db:seed:samples`) desde `data/samples/`; consulta DBSCAN y script de recálculo de puntos críticos (§9.2). **`services/geo-service`**: `POST /geo/v1/resolver` (PIP con GIST, manejo de borde, hueco y cobertura, §7.4); capas GeoJSON web o PMTiles con ETag por versión; consultas por bbox; agregaciones por UV/distrito; `GET /geo/v1/puntos-criticos`; healthchecks; caché en memoria de la versión vigente. |
| **NO le corresponde** | Escribir reportes (Parte 3). Ejecutar el ETL ni cargar capas (Parte 5). Autenticación de usuarios. Render. |
| **Entradas** | Coordenadas y bbox; tablas `geo.*` cargadas por el ETL; `data/processed/` (solo lectura) para servir PMTiles. |
| **Salidas** | Migraciones aplicadas; cliente `db`; JSON de resolución (§7.4); GeoJSON; PMTiles; puntos críticos. |
| **Dependencias** | `packages/contracts`, PostGIS. |
| **Comandos** | `pnpm --filter db migrate / generate / seed:samples / test / puntos-criticos:recalcular`; `pnpm --filter geo-service dev / build / test / lint / typecheck` |
| **Definition of Done** | Las migraciones aplican desde cero sobre un PostGIS vacío y son idempotentes; seeds sintéticos cargan; tests de `geo-service` con capa sintética: punto interior → UV correcta; punto en borde → determinista y `en_limite = true`; punto en hueco → `asignado_por_proximidad = true`; punto fuera → `dentro_cobertura = false`; `EXPLAIN` del PIP muestra uso de índice GIST (documentado en README); README y `.env.example` en ambos paquetes. |

### 4.7 Parte 5 — GIS / DevOps / seguridad / infraestructura / calidad (`pipelines/geodata-etl/`, `infra/`, `e2e/`, `.github/`, `data/`, configuración raíz)

| Aspecto | Detalle |
|---|---|
| **Propósito** | Que los datos oficiales entren limpios y versionados, que todo se levante con un comando, que nada inseguro llegue a `main` y que la calidad se mida en vez de suponerse. |
| **Responsabilidades (5 frentes)** | **GIS**: pipeline completo de §6 (inspección, reproyección, validación topológica, normalización, simplificación, PMTiles, carga a PostGIS, reporte de calidad, manifiestos). **DevOps**: monorepo pnpm + Turborepo, Biome, Husky/lint-staged/commitlint, Dockerfiles, Docker Compose, GitHub Actions, README raíz. **Seguridad**: política de §13, escaneo de secretos en pre-commit y CI, auditoría de dependencias, cabeceras y CORS en infraestructura, revisión de seguridad de cada PR que toque `api-core`, fotos o autenticación. **Infraestructura**: volúmenes, redes Docker, healthchecks, `pg_dump` manual, observabilidad mínima (logs JSON, `/metrics`). **Calidad**: umbrales de cobertura `<a confirmar>`, E2E transversal en `e2e/` (recorrido ciudadano → técnico → mapa público → exportación), auditoría de accesibilidad y rendimiento (§14), checklist de DoD en la plantilla de PR. |
| **NO le corresponde** | Lógica de negocio (Parte 3). Esquema de base de datos ni migraciones (Parte 4; el ETL carga en tablas que Parte 4 define). Interfaz (Partes 1 y 2). Implementar la seguridad dentro del código de otras partes: la define, la configura en infra/CI y la audita; cada parte la implementa en lo suyo. |
| **Entradas** | `data/raw/<capa>/<version>/` + `MANIFEST.md` (solo lectura); código de las demás partes para construir, probar y auditar. |
| **Salidas** | `data/processed/` y `data/samples/`; tablas `geo.*` cargadas; imágenes Docker; pipelines de CI; reportes de E2E, accesibilidad, rendimiento y seguridad. |
| **Dependencias** | GDAL, mapshaper, tippecanoe, Python + GeoPandas/Shapely/pyogrio, Docker, PostGIS; `packages/contracts` (`dominio.json`). |
| **Comandos** | `pnpm etl:inspect / etl:run / etl:load / etl:all / etl:test`; `docker compose up -d`; `pnpm lint / typecheck / test / build`; `pnpm test:e2e` (ver §11). |
| **Definition of Done** | `pnpm etl:all` regenera todo `data/processed/` desde cero sin intervención manual y pytest cubre reproyección, reparación reportada, normalización y detección de solape/hueco con fixture sintético; `docker compose up -d` deja todos los servicios `healthy`; CI verde en cada PR; `pnpm test:e2e` verde con el recorrido completo; escaneo de secretos activo; README raíz con la secuencia de arranque; `.env.example` raíz. |

### 4.8 Transversal — `packages/contracts` (custodia: Parte 3)

- Contiene: enums del dominio, esquemas Zod de cada payload y respuesta, tipos TypeScript inferidos (`z.infer`), especificación **OpenAPI 3.1** (`openapi/openapi.yaml`), **tabla de severidad** (§9.1) como constante versionada, constantes de configuración de dominio (radio de recurrencia, jitter, límites de foto).
- Regla: **ninguna parte define un tipo de intercambio por su cuenta.** Si lo necesita, lo agrega aquí en una tarea que lo anuncie explícitamente; la Parte 3 revisa el cambio.
- Los cambios de contrato son **breaking por defecto**: se versionan (`/api/v1`), se documentan en `packages/contracts/CHANGELOG.md`, y las partes consumidoras se adaptan en sus propias tareas.
- El ETL en Python (Parte 5) consume los enums vía un JSON exportado por `contracts` (`pnpm --filter contracts build` genera `dist/dominio.json`), para que los valores de `tipo` de capa y nombres de campos sean los mismos en ambos lenguajes.

---

## 5. Estructura de carpetas y regla estricta de carpetas designadas

### 5.1 Estructura objetivo

```
MI CURICHI/
  CLAUDE.md                 # este archivo; se edita solo con autorización
  README.md                 # cómo levantar el proyecto en 5 líneas                 [Parte 5]
  package.json              # raíz del monorepo (pnpm workspaces)                   [Parte 5]
  pnpm-workspace.yaml       #                                                       [Parte 5]
  turbo.json                #                                                       [Parte 5]
  biome.json                #                                                       [Parte 5]
  docker-compose.yml        #                                                       [Parte 5]
  .nvmrc  .env.example  .gitignore  .gitattributes  .husky/                        [Parte 5]
  .github/workflows/        # CI                                                    [Parte 5]
  apps/
    web-ciudadano/          # Parte 1 — frontend público
    panel-admin/            # Parte 2 — frontend administrativo
  services/
    api-core/               # Parte 3 — API y lógica de negocio
    geo-service/            # Parte 4 — servicio geoespacial
  packages/
    contracts/              # Transversal — tipos, Zod, OpenAPI, severidad (custodia Parte 3)
    db/                     # Parte 4 — esquema Drizzle, migraciones, seeds sintéticos, cliente
  pipelines/
    geodata-etl/            # Parte 5 — ETL shapefile → GeoJSON → PostGIS (Python + uv)
  e2e/                      # Parte 5 — Playwright transversal (recorrido completo)
  data/
    raw/                    # shapefiles originales. INMUTABLE. Solo lectura. No se versiona.
      <capa>/<version>/     # p. ej. unidad_vecinal/2026-09/
        *.shp *.shx *.dbf *.prj *.cpg
        MANIFEST.md         # fuente, fecha de recepción, sha256 de cada archivo, CRS declarado
    processed/              # generado por el ETL (Parte 5). Reproducible. No se versiona.
      <capa>/<version>/
    samples/                # muestras pequeñas (< 1 MB c/u), SINTÉTICAS, versionables (Parte 5)
  docs/
    decisiones/             # ADRs; cada parte escribe los suyos; índice a cargo de Parte 5
    dominio/                # notas técnicas de drenaje y pavimento
    seguridad/              # política, checklist de revisión de PR (Parte 5)
  infra/
    docker/                 # Dockerfiles por servicio (Parte 5)
    sql/                    # init del contenedor PostGIS: solo extensiones y roles (Parte 5).
                            # Tablas, índices y vistas van SIEMPRE por migración en packages/db (Parte 4).
```

### 5.2 Regla estricta (no negociable)

- Cada tarea se asigna a **una parte** y declara **una carpeta designada** de esa parte. Dentro de ella se puede crear, editar y borrar. Fuera de ella, **no**.
- Excepción única: `packages/contracts/` cuando el cambio es de contrato **y** se anuncia explícitamente en el plan de la tarea. La Parte 3 lo revisa.
- `docs/decisiones/` admite el ADR de la propia tarea, anunciado en el plan.
- Si se detecta un bug o mejora fuera de la carpeta designada: se documenta en el resumen de la tarea (archivo, línea, síntoma, riesgo) y se avisa. **No se toca.**
- Para tocar algo fuera de la carpeta: pedir autorización explícita describiendo **archivo, motivo y riesgo**, y esperar el "aprobado".
- La raíz del repositorio la toca **solo la Parte 5** y solo cuando la tarea declara qué archivos raíz incluye. `CLAUDE.md` se edita únicamente con autorización del usuario.
- `data/raw/` es de solo lectura para todas las partes, incluida la Parte 5.

### 5.3 Tabla `Parte → Carpetas → Puede tocar / No puede tocar`

| Parte | Carpetas designadas | Puede tocar | No puede tocar |
|---|---|---|---|
| **1** Frontend público | `apps/web-ciudadano/` | Su carpeta; `packages/contracts/` solo con cambio de contrato anunciado; su ADR en `docs/decisiones/` | `apps/panel-admin/`, `services/*`, `packages/db/`, `pipelines/*`, `data/*`, `infra/*`, `e2e/*`, raíz |
| **2** Frontend administrativo | `apps/panel-admin/` | Ídem | `apps/web-ciudadano/`, `services/*`, `packages/db/`, `pipelines/*`, `data/*`, `infra/*`, `e2e/*`, raíz |
| **3** Backend / API | `services/api-core/` | Su carpeta; `packages/contracts/` (custodia: propone y revisa cambios); su ADR en `docs/decisiones/` | `services/geo-service/`; `packages/db/` (consume el cliente, **no** edita esquema ni migraciones); `apps/*`, `pipelines/*`, `data/*`, `infra/*`, `e2e/*`, raíz |
| **4** Datos / geoespacial | `packages/db/`, `services/geo-service/` | Sus carpetas; `packages/contracts/` con anuncio; su ADR en `docs/decisiones/` | `services/api-core/`, `apps/*`, `pipelines/*`, `data/*` (lectura sí, escritura no), `infra/*`, `e2e/*`, raíz |
| **5** GIS / DevOps / seguridad / infra / calidad | `pipelines/geodata-etl/`, `infra/`, `e2e/`, `.github/`, `data/processed/`, `data/samples/`, `docs/` (índice y `seguridad/`), archivos raíz de configuración declarados | Sus carpetas; **escritura** en `data/processed/` y `data/samples/`; tablas `geo.*` en PostGIS (carga de datos, no cambio de esquema); `packages/contracts/` con anuncio | `data/raw/` (solo lectura, **nunca** modificar ni renombrar); `apps/*`; `services/*`; `packages/db/` (el esquema es de Parte 4); `CLAUDE.md` sin autorización |
| — Transversal | `packages/contracts/` | Cualquier parte, solo con cambio de contrato anunciado en su plan; Parte 3 revisa | Código de las partes consumidoras (ellas se adaptan en sus propias tareas) |

---

## 6. Pipeline geoespacial: shapefile → GeoJSON → PostGIS

Todo el pipeline vive en `pipelines/geodata-etl/` y es responsabilidad de la **Parte 5** (frente GIS). Se ejecuta con **un comando** por capa y versión, y con **un comando** para todo. Es **idempotente**: correrlo dos veces produce byte a byte los mismos archivos (salvo `fecha_ejecucion` en `metadata.json`).

### 6.1 Ingesta

- Los shapefiles entran en `data/raw/<version>/` tal como los entrega el municipio; la primera versión real es la carpeta **`DM_UV_MZ_2025`**, que contiene las tres capas (`distrito_municipal`, `unidad_vecinal`, `manzana`), cada una con su conjunto completo: `.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`. La correspondencia archivo → capa y los nombres de campos se declaran en `pipelines/geodata-etl/config/capas.yaml`; el comando `etl:inspect` lista archivos y campos para completarla.
- Junto a ellos, `MANIFEST.md` escrito a mano con: fuente oficial, persona/oficina que entregó, fecha de recepción, fecha de vigencia declarada, CRS declarado, y `sha256` de cada archivo (`shasum -a 256 *`).
- **Si falta `.prj`: el pipeline se detiene con error y se pregunta el CRS de origen. No se adivina.** Una vez confirmado, se registra en `MANIFEST.md` y se pasa por parámetro `--crs-origen EPSG:xxxxx`.
- Si falta `.cpg`: intentar UTF-8; si aparecen caracteres corruptos en `nombre`, probar `ISO-8859-1` con `-oo ENCODING=ISO-8859-1` y **registrar la decisión** en el reporte de calidad.

### 6.2 Inspección previa (`pnpm etl:inspect`)

Comando subyacente:

```bash
ogrinfo -al -so "data/raw/unidad_vecinal/2026-09/unidad_vecinal.shp"
```

El ETL emite `reporte_calidad.md` sección "Inspección" con: CRS detectado (nombre + EPSG si se resuelve), número de features, tipos de geometría (y si hay mezcla Polygon/MultiPolygon), listado de atributos con tipo, conteo de nulos por atributo, encoding detectado/asumido, extensión (bbox) en CRS origen y en EPSG:4326.

Si el bbox en 4326 no cae en el entorno esperado de la ciudad (`<bbox de referencia a confirmar>`), el ETL avisa: probable CRS mal declarado.

### 6.3 Reproyección

- Salida **siempre** en **EPSG:4326**. El CRS de origen se conserva en `metadata.json` (`crs_origen`, `crs_origen_wkt`) y en la tabla `capa_version`.
- Comando subyacente (genera el `.full.geojson`):

```bash
ogr2ogr -f GeoJSON \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -makevalid \
  -lco RFC7946=YES \
  -lco COORDINATE_PRECISION=7 \
  "data/processed/unidad_vecinal/2026-09/unidad_vecinal.full.geojson" \
  "data/raw/unidad_vecinal/2026-09/unidad_vecinal.shp"
```

Notas: `-nlt PROMOTE_TO_MULTI` homogeneiza a MultiPolygon; `-makevalid` repara geometrías inválidas (ver 6.4, se reporta antes/después); `COORDINATE_PRECISION=7` ≈ 1 cm, suficiente para precisión completa. Si se pasó `--crs-origen`, se agrega `-s_srs EPSG:xxxxx`.

### 6.4 Validación topológica (Python, GeoPandas/Shapely)

Se ejecuta **antes y después** de la reparación, y cada corrección se lista con el `id` afectado:

| Chequeo | Método | Acción |
|---|---|---|
| Geometría inválida (auto-intersección, anillos mal orientados) | `geom.is_valid`, `explain_validity` | `make_valid()`; si el área cambia > 0,1 % `<umbral a confirmar>`, marcar como "reparación no segura" y **preguntar** |
| Polígono vacío o área 0 | `geom.is_empty`, `area == 0` | Excluir y reportar |
| Duplicados exactos | hash de WKB | Excluir el segundo y reportar |
| Duplicados de código/nombre | `codigo` repetido | **No** reparar automáticamente; reportar y preguntar |
| Solapes entre UV | `sjoin` predicate `overlaps` + área de intersección | Reportar pares y área; solo reparar si el solape es < 1 m² `<a confirmar>` (deslizamiento de vértices) |
| Huecos entre UV dentro de un distrito | `unary_union` del distrito − `unary_union` de sus UV | Reportar área y ubicación; **no** rellenar automáticamente (ver 7.4 para el manejo en runtime) |
| UV sin distrito o con centroide fuera de su distrito | `sjoin` con `within` sobre el punto representativo | Reportar; asignar `distrito_id` por el distrito que contiene el `representative_point()` y marcar `distrito_inferido = true` |

### 6.5 Normalización de atributos

- Nombres de campo en `snake_case`, sin tildes ni ñ, en minúsculas.
- Campos mínimos de salida:

| Campo | Tipo | distrito_municipal | unidad_vecinal |
|---|---|---|---|
| `id` | string estable (`<tipo>:<codigo>`) | ✔ | ✔ |
| `codigo` | string | ✔ | ✔ |
| `nombre` | string UTF-8 | ✔ | ✔ |
| `tipo` | `distrito_municipal` \| `unidad_vecinal` \| `manzana` | ✔ | ✔ |
| `distrito_id` | string (FK lógica) | — | ✔ (y en `manzana`, junto con `unidad_vecinal_id`) |
| `version_capa` | string (`2026-09`) | ✔ | ✔ |
| `fuente` | string | ✔ | ✔ |
| `fecha_vigencia` | date ISO o null | ✔ | ✔ |

- El mapeo de campos originales → normalizados se declara en `pipelines/geodata-etl/config/<capa>.yaml` (p. ej. `NOM_UV → nombre`, `COD_UV → codigo`). Los nombres reales de los campos del municipio están `<a confirmar>` hasta ver los shapefiles.
- Encoding de salida **UTF-8** siempre.

### 6.6 Simplificación (dos salidas)

| Salida | Uso | Herramienta | Tolerancia inicial |
|---|---|---|---|
| `<capa>.full.geojson` | Consultas espaciales del backend; carga a PostGIS | ogr2ogr (6.3) | Sin simplificar |
| `<capa>.web.geojson` | Render en el mapa | mapshaper | `interval=3` (≈ 3 m, Visvalingam, con preservación de bordes compartidos) `<ajustar viendo el resultado>` |

Comando subyacente:

```bash
npx mapshaper "data/processed/unidad_vecinal/2026-09/unidad_vecinal.full.geojson" \
  -simplify visvalingam interval=3 keep-shapes \
  -clean \
  -o format=geojson precision=0.000001 \
     "data/processed/unidad_vecinal/2026-09/unidad_vecinal.web.geojson"
```

Se usa mapshaper y no `ogr2ogr -simplify` porque mapshaper simplifica **preservando la topología entre polígonos vecinos** (los bordes compartidos no se separan ni se cruzan). `keep-shapes` evita que desaparezcan UV pequeñas. La tolerancia usada queda en `metadata.json`.

### 6.7 Teselas vectoriales (si `web.geojson` > 5 MB)

```bash
tippecanoe -o "data/processed/unidad_vecinal/2026-09/unidad_vecinal.pmtiles" \
  -l unidad_vecinal \
  -Z 9 -z 15 \
  --detect-shared-borders \
  --no-feature-limit --no-tile-size-limit \
  --force \
  "data/processed/unidad_vecinal/2026-09/unidad_vecinal.full.geojson"
```

Rango de zoom `9–15` es inicial `<ajustar>`. En ese caso `geo-service` sirve el `.pmtiles` (archivo estático con *range requests*) y el frontend lo consume con el protocolo `pmtiles://` de MapLibre.

### 6.8 Salida y metadatos

`data/processed/<capa>/<version>/` contiene:

- `<capa>.full.geojson`, `<capa>.web.geojson`, opcional `<capa>.pmtiles`.
- `reporte_calidad.md` (humano) y `reporte_calidad.json` (máquina).
- `metadata.json`: `capa`, `version`, `crs_origen`, `crs_salida = EPSG:4326`, `n_features_entrada`, `n_features_salida`, `tolerancia_web_m`, `sha256_entrada` (del MANIFEST), `sha256_salida`, `herramientas` (versiones de GDAL/mapshaper/tippecanoe/GeoPandas), `fecha_ejecucion`.

### 6.9 Carga a PostGIS (`pnpm etl:load`)

```bash
ogr2ogr -f PostgreSQL "PG:$DATABASE_URL" \
  -nln geo.unidad_vecinal_stage \
  -lco GEOMETRY_NAME=geom \
  -lco SPATIAL_INDEX=GIST \
  -lco FID=fid \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -overwrite \
  "data/processed/unidad_vecinal/2026-09/unidad_vecinal.full.geojson"
```

Luego un SQL versionado en `pipelines/geodata-etl/sql/promover_capa.sql` inserta desde `*_stage` a la tabla definitiva con `version_capa`, crea la fila en `capa_version` (con `vigente = false`), y verifica: `ST_IsValid(geom)` en todas las filas, índice GIST presente (`\d geo.unidad_vecinal`), `SELECT count(*)` = `n_features_salida`. **Activar** una versión (`vigente = true`) es acción del administrador desde el panel administrativo (Parte 2), no del ETL.

### 6.10 Reglas duras

1. `data/raw/` es **inmutable**: ni renombrar, ni "arreglar" un `.dbf`, ni agregar `.prj` a mano. Si hay que corregir algo del origen, es una **nueva versión** con su propio `MANIFEST.md`.
2. Todo `data/processed/` se regenera con **`pnpm etl:all`**. Si algo requiere un paso manual, el pipeline está roto.
3. **No se versionan archivos pesados en git.** `data/raw/` y `data/processed/` están en `.gitignore`. La reproducibilidad se garantiza con los `sha256` del `MANIFEST.md` (versionado) y con `metadata.json`. Los originales se guardan en almacenamiento externo del municipio/equipo `<ubicación a confirmar>`. Decisión: **no** usar Git LFS en Fase 1 (agrega fricción y cuota sin beneficio mientras el repo es local); revisar en Fase 2.
4. `data/samples/` solo contiene geometrías **sintéticas** pequeñas (< 1 MB por archivo), claramente etiquetadas como tales en un `README.md` dentro de la carpeta. Nunca un recorte real presentado como muestra sin decirlo.
5. **Contrato con el backend:** el PIP se hace en PostGIS contra `geo.<capa>` con índice **GIST** sobre `geom`, de modo que sea O(log n). Nunca cargar el GeoJSON en memoria del servicio para iterar polígonos.

### 6.11 Herramientas permitidas

`ogrinfo` / `ogr2ogr` (GDAL), `mapshaper`, GeoPandas + Shapely + pyogrio, `tippecanoe`. Nada más sin justificarlo en un ADR en `docs/decisiones/`.

**Implementación de Fase 1 (ADR 0002):** la máquina de desarrollo no tiene GDAL, Python 3.12 ni tippecanoe y no se pueden instalar sin permisos de administrador. El ETL se implementa en **TypeScript con mapshaper** (lee shapefiles con su `.prj`, reproyecta, limpia topología, simplifica preservando bordes compartidos y escribe GeoJSON) más `@turf/turf` para el reporte de calidad, y se prueba con Vitest. Las teselas se generan **al vuelo** en `geo-service` con `geojson-vt` + `vt-pbf` desde el `web.geojson` vigente, en lugar de PMTiles con tippecanoe. Los comandos de GDAL/tippecanoe de esta sección quedan como referencia equivalente para cuando existan.

---

## 7. Modelo de datos y contratos de API

El modelo de datos es propiedad de la **Parte 4**: el esquema Drizzle y las migraciones viven en `packages/db/` y ninguna otra parte crea tablas, columnas ni índices. Los contratos HTTP viven en `packages/contracts/` (custodia: Parte 3). El ETL (Parte 5) solo **carga filas** en las tablas `geo.*` que define la Parte 4.

### 7.1 Tabla `reporte_inundacion` (esquema `public`)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | generado por el servidor |
| `geom` | `geometry(Point, 4326)` | índice GIST; coordenada exacta (solo visible a técnico/admin) |
| `creado_en` / `actualizado_en` | `timestamptz` | |
| `evento_en` | `timestamptz` null | cuándo ocurrió el anegamiento; si null se asume `creado_en` |
| `autor_id` | `uuid` null FK `usuario` | null = anónimo |
| `distrito_id` | `text` FK `geo.distrito_municipal.id` | **calculado por el sistema** |
| `unidad_vecinal_id` | `text` FK `geo.unidad_vecinal.id` | **calculado por el sistema** |
| `manzana_id` | `text` null | calculado por el sistema si el punto cae en una manzana; solo informativo |
| `version_capa` | `text` | versión de capa con la que se resolvió; permite recalcular si cambia la capa |
| `resolucion_flags` | `jsonb` | `{ en_limite, asignado_por_proximidad, distancia_m }` (§7.4) |
| `ubicacion_metodo` | enum `gps` \| `manual` | |
| `precision_gps_m` | `numeric` null | de `Geolocation.coords.accuracy` |
| `ubicacion_tipo` | enum `via_publica` \| `vivienda_o_predio` \| `otro` | activa jitter público (§13) |
| `direccion_aprox` | `text` null | geocodificación inversa opcional |
| `descripcion` | `text` | 10–1000 caracteres `<límites a confirmar>` |
| `tirante_estimado` | enum `tobillo` \| `rodilla` \| `muslo` \| `mas_70` | <10 / 10–40 / 40–70 / >70 cm |
| `duracion_estimada` | enum `menos_30min` \| `30min_2h` \| `2h_12h` \| `mas_12h` | |
| `frecuencia` | enum `primera_vez` \| `ocasional` \| `cada_lluvia_fuerte` \| `permanente` | |
| `afectacion` | enum `peatonal` \| `vehicular` \| `ingreso_viviendas` \| `corte_total_via` | se guarda la **máxima** declarada |
| `causa_presunta` | enum `sumidero_tapado` \| `falta_sumidero` \| `hundimiento_pavimento` \| `contrapendiente` \| `colector_saturado` \| `desborde_cauce` \| `desconocida` | |
| `sumidero_cercano` | enum `si` \| `no` \| `no_sabe` null | observación opcional (§9.3) |
| `sumidero_estado` | enum `libre` \| `obstruido` \| `danado` \| `no_sabe` null | opcional |
| `agua_brota_sumidero` | `boolean` null | opcional; síntoma de colector sobrecargado |
| `severidad_calculada` | enum `baja` \| `media` \| `alta` \| `critica` | función pura §9.1; **nunca** editable a mano |
| `severidad_manual` | enum ídem, null | reclasificación del técnico |
| `severidad_motivo` | `text` null | obligatorio si hay `severidad_manual` |
| `estado` | enum `nuevo` \| `validado` \| `duplicado` \| `rechazado` \| `resuelto` | §7.3 |
| `estado_motivo` | `text` null | obligatorio en `rechazado` y `duplicado` |
| `fusionado_en_id` | `uuid` null FK self | si `duplicado`, apunta al reporte canónico |
| `punto_critico_id` | `uuid` null FK | §9.2; se recalcula, no se edita |
| `validado_por` / `validado_en` | `uuid` null / `timestamptz` null | |
| `ip_hash` | `text` null | hash con sal, solo antispam; se borra a los N días `<N a confirmar, propuesto 30>` |

`severidad_efectiva` se expone en la API como `COALESCE(severidad_manual, severidad_calculada)`.

### 7.2 Tablas complementarias

**`reporte_foto`**: `id uuid`, `reporte_id uuid FK`, `objeto_key text` (clave en MinIO), `mime text`, `bytes int`, `ancho int`, `alto int`, `exif_sanitizado boolean NOT NULL DEFAULT false` (debe ser `true` antes de servirse), `creado_en`. La API expone `foto_url[]` firmadas/temporales.

**`geo.distrito_municipal`**, **`geo.unidad_vecinal`** y **`geo.manzana`**: `id text`, `codigo text`, `nombre text`, `geom geometry(MultiPolygon, 4326)` con **GIST**, `version_capa text`, `fuente text`, `fecha_vigencia date null`, `distrito_id text` (UV y manzana), `unidad_vecinal_id text` (solo manzana), `distrito_inferido boolean` (UV). PK compuesta `(id, version_capa)`; vistas `geo.<capa>_vigente` filtran por `capa_version.vigente = true`. La manzana es capa de render; `reporte_inundacion.manzana_id` es opcional.

**`geo.capa_version`**: `id`, `capa`, `version`, `fuente`, `fecha_vigencia`, `crs_origen`, `sha256_manifiesto`, `n_features`, `cargado_en`, `vigente boolean`, `activado_por`, `activado_en`.

**`punto_critico`**: `id uuid`, `geom geometry(Point, 4326)` (centroide), `n_reportes int`, `primer_reporte_en`, `ultimo_reporte_en`, `severidad_max`, `distrito_id`, `unidad_vecinal_id`, `radio_m numeric`, `calculado_en`. Ver §9.2.

**`usuario`**: `id`, `email` (único), `nombre`, `rol` enum `ciudadano` \| `tecnico` \| `admin`, `activo`, `creado_en`. Contraseñas: hash con Argon2id `<a confirmar proveedor de auth, ver §16>`.

**`auditoria`**: `id`, `entidad`, `entidad_id`, `accion`, `actor_id null`, `antes jsonb`, `despues jsonb`, `creado_en`. Se escribe en cada transición de estado, reclasificación, fusión y activación de capa.

### 7.3 Máquina de estados del reporte

```
nuevo ──validar──▶ validado ──resolver──▶ resuelto
  │                    │
  ├──rechazar──▶ rechazado
  │                    │
  └──fusionar──▶ duplicado ◀──fusionar──┘
```

| Transición | Quién | Requiere |
|---|---|---|
| `nuevo → validado` | técnico, admin | — |
| `nuevo → rechazado` | técnico, admin | `estado_motivo` |
| `nuevo/validado → duplicado` | técnico, admin | `fusionado_en_id` (debe estar `validado`) |
| `validado → resuelto` | técnico, admin | `estado_motivo` (qué se hizo) |
| `rechazado → nuevo` | admin | `estado_motivo` (reapertura) |

Vista pública: solo `validado` y `resuelto`. `nuevo` no se publica (moderación previa). Al pasar a `validado` se recalcula el punto crítico de su entorno.

### 7.4 Resolución point-in-polygon (contrato de `geo-service`)

Consulta base (usa GIST automáticamente por el operador `&&` implícito en `ST_Contains`):

```sql
SELECT uv.id, uv.codigo, uv.nombre, uv.distrito_id
FROM geo.unidad_vecinal_vigente uv
WHERE ST_Contains(uv.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
LIMIT 1;
```

Reglas:

1. **Interior de exactamente una UV** → caso normal. El distrito se toma de `uv.distrito_id` y se cruza con un PIP sobre `geo.distrito_municipal_vigente`; si difieren, se devuelve el de la UV y se registra `resolucion_flags.distrito_discrepante = true`.
2. **Punto sobre un borde** (más de una UV con `ST_Intersects`): se elige de forma determinista la de menor `id` y se marca `en_limite = true`.
3. **Punto en un hueco entre UV** (dentro del distrito pero sin UV): se busca la UV más cercana con `ST_DWithin(geography, 20 m)` `<tolerancia a confirmar>`, se asigna y se marca `asignado_por_proximidad = true` con `distancia_m`. Si no hay ninguna a esa distancia → caso 4.
4. **Fuera de cobertura municipal** (ningún distrito lo contiene ni está a la tolerancia): `dentro_cobertura = false` y `api-core` responde `422` con código `FUERA_DE_COBERTURA`. El reporte **no se crea**.

Respuesta:

```json
{
  "dentro_cobertura": true,
  "distrito": { "id": "distrito_municipal:07", "codigo": "07", "nombre": "…" },
  "unidad_vecinal": { "id": "unidad_vecinal:123", "codigo": "123", "nombre": "…" },
  "version_capa": "2026-09",
  "en_limite": false,
  "asignado_por_proximidad": false,
  "distancia_m": null
}
```

### 7.5 Endpoints de `api-core` — Parte 3 (prefijo `/api/v1`)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /reportes` | público (rate limited) | Crea un reporte en `nuevo`. Body validado con `ReporteCrearSchema`. Resuelve UV vía `geo-service`, calcula severidad. |
| `POST /fotos` | público (rate limited) | Multipart; máx. `FOTO_MAX_BYTES` (propuesto 8 MB) y 3 fotos por reporte `<a confirmar>`; solo `image/jpeg`, `image/png`, `image/webp`, `image/heic` `<HEIC a confirmar>`; devuelve `objeto_key` temporal a asociar. |
| `GET /reportes` | público / técnico | Query: `bbox`, `estado`, `distrito_id`, `unidad_vecinal_id`, `severidad`, `desde`, `hasta`, `pagina`, `limite`. Público: solo `validado`/`resuelto`, con jitter y sin autor. Técnico: todo, exacto. Responde `FeatureCollection`. |
| `GET /reportes/:id` | público / técnico | Detalle; misma política de visibilidad. |
| `PATCH /reportes/:id/estado` | técnico, admin | `{ estado, estado_motivo?, fusionado_en_id? }` según §7.3. |
| `PATCH /reportes/:id/severidad` | técnico, admin | `{ severidad_manual, severidad_motivo }` o `null` para volver a la calculada. |
| `POST /reportes/:id/fusionar` | técnico, admin | Atajo: marca `:id` como `duplicado` de `{ canonico_id }`. |
| `GET /exportar` | técnico, admin | `formato=csv|geojson` + mismos filtros de `GET /reportes`. |
| `GET /indicadores` | técnico, admin | Conteos por UV, distrito, estado, severidad; puntos críticos con `n_reportes ≥ 2`. |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/yo` | — / autenticado | Sesión para técnico/admin. |
| `GET /admin/capas`, `POST /admin/capas/:id/activar` | admin | Lista versiones cargadas; activa una. |
| `GET /health`, `GET /ready` | público | Liveness / readiness (DB, MinIO, geo-service). |
| `GET /docs` | público en local | OpenAPI UI. |

### 7.6 Endpoints de `geo-service` — Parte 4 (prefijo `/geo/v1`)

| Método y ruta | Descripción |
|---|---|
| `POST /resolver` | `{ lat, lon }` → §7.4. Interno (red Docker) y también público para que el formulario muestre la UV antes de enviar. |
| `GET /capas/distritos` | GeoJSON `web` de la versión vigente, o `302` al `.pmtiles`. Cache-Control largo con ETag por `version_capa`. |
| `GET /capas/unidades-vecinales` | Ídem. |
| `GET /capas/vigentes` | `{ distrito_municipal: "2026-09", unidad_vecinal: "2026-09" }`. |
| `GET /agregados/unidades-vecinales` | Conteo de reportes validados por UV (para coropletas en la Parte 2). |
| `GET /puntos-criticos?bbox=` | Puntos críticos §9.2. |
| `GET /health`, `GET /ready` | |

### 7.7 Dónde vive cada contrato

- `packages/contracts/src/dominio/enums.ts` — todos los enums de §7.1.
- `packages/contracts/src/dominio/severidad.ts` — tabla de puntos, pesos, bandas y reglas de escalamiento (§9.1).
- `packages/contracts/src/esquemas/reporte.ts`, `geo.ts`, `auth.ts`, `admin.ts` — Zod.
- `packages/contracts/openapi/openapi.yaml` — generado desde Zod (`pnpm --filter contracts build`), no editado a mano.
- `packages/contracts/dist/dominio.json` — export para Python (ETL).

---

## 8. Stack tecnológico y justificación

### 8.1 Versiones estables verificadas (2026-09-13)

Fuentes: registro npm (`npm view <pkg> version`), `nodejs.org/dist/index.json`, Docker Hub (`postgis/postgis`), PyPI, GitHub Releases. Se fija el **rango de minor** y se congela el patch exacto en el lockfile al instalar en Fase 1.

| Componente | Versión estable verificada | Decisión / nota |
|---|---|---|
| Node.js | **24.x LTS** (24.21.0 "Krypton") | Node 26 es *Current* (26.8.2), no LTS todavía → **no usar**. Fijar en `.nvmrc` y `engines`. |
| pnpm | 12.4.x | Gestor del monorepo. |
| Turborepo | 2.10.x | Orquestación de tareas y caché. |
| TypeScript | 7.0.x | `strict: true`. Si alguna herramienta del monorepo aún no soporta TS 7, fijar **5.9.x** `<a confirmar al instalar>`. |
| Next.js | 16.3.x (App Router) | Partes 1 y 2. |
| React | 19.3.x | |
| Tailwind CSS | 4.3.x | |
| shadcn/ui | CLI vigente (los componentes se copian al repo, no es dependencia versionada) | |
| TanStack Query | 5.102.x | Estado de servidor en frontends. |
| Zod | 4.6.x | Validación compartida en `contracts`. |
| React Hook Form | 7.88.x | Formulario de reporte. |
| MapLibre GL JS | 6.9.x | Mapa. Sin servicios propietarios de pago. |
| pmtiles (JS) | 4.5.x | Protocolo `pmtiles://` para MapLibre. |
| deck.gl | — | **No** en Misión 1. Solo si los puntos superan ~50 000 en pantalla `<umbral a confirmar>`; se decidirá con ADR. |
| Fastify | 5.12.x | `api-core` y `geo-service`. |
| Drizzle ORM | 0.45.x | Prisma está en **8.0.0-rc** (no estable) → descartado por ahora. Geometría vía SQL crudo tipado con la plantilla `sql` de Drizzle (p. ej. `ST_Contains`). |
| PostgreSQL + PostGIS | imagen `postgis/postgis:18-3.6` (PG 18, PostGIS 3.6) | PG 19 está en beta → no usar. |
| MinIO | imagen oficial `<tag a confirmar>` | Almacenamiento S3-compatible de fotos en local. |
| sharp | 0.35.x | Redimensionado y **eliminación de EXIF** en `api-core`. |
| Vitest | 5.0.x (recién publicada) | Si los plugins de Next/React no la soportan al instalar, usar **4.x** `<a confirmar>`. |
| Playwright | 1.63.x | E2E de mapa y formulario. |
| Biome | 2.5.x | Lint + formato en un solo binario (elegido sobre ESLint + Prettier). Reglas a11y incluidas. |
| Husky + lint-staged + commitlint | vigentes `<versiones a confirmar>` | Conventional Commits. |
| GDAL | 3.13.x | `ogrinfo`, `ogr2ogr`. |
| mapshaper | 0.7.x | Simplificación con topología. |
| tippecanoe (felt) | 2.79.x | PMTiles. |
| Python | 3.12+ `<a confirmar>` | Solo para el ETL. Gestionado con `uv` `<versión a confirmar>`. |
| GeoPandas / Shapely / pyogrio | 1.1.x / 2.1.x / 0.13.x | Validación topológica y reporte de calidad. |
| pytest | vigente `<a confirmar>` | Tests del ETL. |

### 8.2 Justificación de cada elección

- **Monorepo pnpm + Turborepo.** Cinco partes con un paquete de contratos compartido; pnpm resuelve workspaces con enlaces estrictos (evita dependencias fantasma) y Turborepo cachea lint/test/build por paquete, lo que hace el CI barato.
- **TypeScript `strict`.** Los contratos entre partes son tipos; el modo estricto es lo que hace que un cambio de contrato rompa el `typecheck` del consumidor en lugar de romper en producción.
- **Next.js App Router para las Partes 1 y 2.** Un solo framework para ambos frontends, PWA soportada, renderizado en servidor para la página pública (SEO y primera carga en móvil), y ecosistema shadcn/ui + Tailwind para construir rápido con accesibilidad razonable de base.
- **MapLibre GL JS.** Open source, sin token ni cuota, render vectorial por GPU, clustering nativo, y soporte de PMTiles. Los mapas base se sirven con atribución correcta (ver §14). No se depende de Mapbox ni Google Maps.
- **Fastify para `api-core`.** Ligero, rápido, con validación por esquema JSON integrada (se enchufan los esquemas Zod de `contracts`) y generación de OpenAPI. NestJS se descartó por añadir capas de abstracción que no aportan en dos servicios pequeños.
- **`geo-service` en Node + PostGIS (no Python).** Decisión propuesta `<a confirmar en §16>`. Razones: (1) el trabajo pesado (PIP, bbox, agregaciones) lo hace PostGIS con GIST, no el lenguaje del servicio; (2) comparte `contracts` en TypeScript sin traducción; (3) una sola toolchain en runtime simplifica Docker y CI; (4) FastAPI + GeoPandas brillaría si hubiera que hacer geometría en memoria por petición, y aquí no hay que hacerlo. Python queda donde sí aporta: el ETL.
- **ETL en Python (GeoPandas/Shapely/pyogrio) + CLI de GDAL/mapshaper/tippecanoe.** GeoPandas ofrece `make_valid`, `sjoin`, `overlaps`, `unary_union` y `explain_validity` listos para el reporte de calidad; pyogrio lee shapefiles rápido y respeta encoding. Corre offline, no en el camino de una petición, así que el segundo lenguaje no afecta la latencia ni el despliegue de los servicios.
- **PostgreSQL + PostGIS.** Estándar de facto para datos espaciales: índices GIST, `ST_Contains`, `ST_ClusterDBSCAN`, `geography` para distancias en metros, y un solo motor para reportes y capas.
- **Drizzle ORM.** Migraciones versionadas en SQL legible, tipos inferidos del esquema y `sql` crudo tipado para PostGIS. Esquema y migraciones centralizados en `packages/db` (Parte 4), consumidos por `api-core` y `geo-service`. Prisma está en RC (8.0.0-rc.14) al momento de esta verificación.
- **Docker Compose.** `postgis`, `minio`, `api-core`, `geo-service` y (opcional) los frontends. `pnpm dev` + `docker compose up -d` levantan todo.
- **Modo local sin Docker (ADR 0002).** Como la máquina de desarrollo no tiene Docker, la Fase 1 corre PostGIS **dentro de Node** con PGlite (Postgres compilado a WASM) + la extensión oficial `@electric-sql/pglite-postgis` (experimental), expuesto por protocolo de PostgreSQL con `@electric-sql/pglite-socket` en el puerto 5433 con multiplexado de conexiones. `api-core` y `geo-service` se conectan con el driver `pg` y la misma `DATABASE_URL` que usarían contra Docker; el SQL (ST_Contains, GIST, ST_ClusterDBSCAN) es el mismo. Las fotos se guardan en disco (`infra/.storage/`) mediante un adaptador con interfaz S3-compatible; MinIO se usa cuando exista Docker. `pnpm db:local` levanta esa base y aplica migraciones pendientes.
- **Fuentes tipográficas** vía `@fontsource` (Sora y Source Sans 3 empaquetadas, sin llamadas a Google Fonts en runtime).
- **Componentes de UI** hechos a medida siguiendo el UI kit del usuario (§14.4); shadcn/ui no se usa en Fase 1 para no depender de su registro remoto con la red lenta disponible.
- **Contraseñas** con `scrypt` de Node (sin dependencias nativas); Argon2id queda `<a confirmar>` para Fase 2.
- **Biome.** Un binario para lint y formato, mucho más rápido que ESLint + Prettier, con reglas de accesibilidad. Si en Fase 1 se necesita una regla que Biome no tiene (p. ej. específica de Next), se evalúa añadir ESLint solo para eso, con ADR.
- **Vitest + Playwright + pytest.** Vitest comparte config con Vite/Next y es rápido; Playwright es el estándar para E2E con soporte de geolocalización simulada (`context.setGeolocation`), esencial para probar el formulario; pytest para el ETL.
- **GitHub Actions.** Lint, typecheck, test y build en cada PR, con caché de Turborepo.
- **Observabilidad mínima.** Logs JSON (pino en Fastify), `X-Request-Id` propagado de `api-core` a `geo-service`, `/health` y `/ready`, y métricas básicas (latencia por ruta, reportes creados, rechazos por rate limit) expuestas en `/metrics` `<formato a confirmar, propuesto Prometheus>`.

---

## 9. Criterios técnicos de dominio

### 9.1 Matriz de severidad (explícita y reproducible)

La severidad es una **función pura** `severidad(tirante, duracion, frecuencia, afectacion) → { puntaje, banda }` que vive en `packages/contracts/src/dominio/severidad.ts` y se ejecuta en `api-core` (Parte 3). El frontend solo la muestra (puede pre-visualizarla con la misma función, pero el valor guardado es el del servidor).

**Paso 1 — puntos por variable (1 a 4):**

| Puntos | Tirante (T) | Duración (D) | Frecuencia (F) | Afectación (A) |
|---|---|---|---|---|
| 1 | tobillo (<10 cm) | <30 min | primera vez | peatonal |
| 2 | rodilla (10–40 cm) | 30 min – 2 h | ocasional | vehicular |
| 3 | muslo (40–70 cm) | 2 – 12 h | cada lluvia fuerte | ingreso a viviendas |
| 4 | >70 cm | >12 h | permanente | corte total de vía |

**Paso 2 — puntaje ponderado:**

```
puntaje = 2·T + 1·D + 1·F + 1·A        → rango 5 … 20
```

El tirante pesa doble porque es la variable más ligada al riesgo directo para personas y vehículos (pérdida de estabilidad al caminar, ingreso de agua a motores) y a la probabilidad de daño en viviendas.

**Paso 3 — banda base:**

| Puntaje | Banda |
|---|---|
| 5 – 8 | `baja` |
| 9 – 12 | `media` |
| 13 – 16 | `alta` |
| 17 – 20 | `critica` |

**Paso 4 — reglas de escalamiento (solo suben, nunca bajan; se aplican en orden):**

| Regla | Condición | Efecto | Razón |
|---|---|---|---|
| E1 | T = 4 (>70 cm) | banda = `critica` | Tirante por encima del muslo es riesgo de arrastre y de daño mayor, sin importar el resto. |
| E2 | A ≥ 3 **y** F ≥ 3 | banda mínima `alta` | Afectación a viviendas o corte de vía que se repite en cada lluvia fuerte es un problema estructural, no un evento. |
| E3 | F = 4 (permanente) | banda mínima `media` | Agua permanente indica falla de drenaje (contrapendiente o colector) aunque el tirante sea bajo. |

**Ejemplos de verificación (deben estar en el test):**

| T | D | F | A | Puntaje | Base | Escalamiento | Final |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 5 | baja | — | `baja` |
| 2 | 2 | 2 | 2 | 10 | media | — | `media` |
| 1 | 1 | 4 | 1 | 8 | baja | E3 | `media` |
| 2 | 1 | 3 | 3 | 11 | media | E2 | `alta` |
| 4 | 1 | 1 | 1 | 11 | media | E1 | `critica` |
| 3 | 4 | 4 | 4 | 18 | critica | — | `critica` |

Los pesos, cortes y reglas son **parámetros iniciales** propuestos por este documento; deben validarse con el técnico municipal en Fase 1 `<a confirmar>`. Cualquier cambio es un cambio de contrato con versión (`severidad_version` guardado junto al reporte).

### 9.2 Recurrencia espacial (puntos críticos)

- **Objetivo:** que varios reportes del mismo charco se vean como **un punto crítico** con historial, sin perder ningún reporte individual.
- **Radio:** `RECURRENCIA_RADIO_M = 25` (configurable en `contracts`) `<a confirmar>`. Justificación: cubre el error típico de GPS de celular en calle urbana más el ancho de una calzada; radios mayores empiezan a fusionar esquinas distintas.
- **Algoritmo:** `ST_ClusterDBSCAN(geom_m, eps := RECURRENCIA_RADIO_M, minpoints := 1) OVER ()` sobre los reportes en estado `validado` o `resuelto`, con `geom_m` = `ST_Transform(geom, 32720)` `<EPSG métrico a confirmar>` para que `eps` esté en metros. Se eligió DBSCAN porque es determinista, no requiere fijar el número de grupos y agrupa por cercanía transitiva.
- **Salida:** tabla `punto_critico` (§7.2) con centroide, `n_reportes`, primer y último reporte, `severidad_max` (de `severidad_efectiva`), distrito y UV (resueltos por PIP del centroide). Cada reporte guarda `punto_critico_id`.
- **Cuándo se recalcula:** en cada transición a `validado`/`resuelto`/`duplicado` (para la vecindad del reporte) y con un job completo bajo demanda (`pnpm --filter db puntos-criticos:recalcular`). La consulta DBSCAN y el script viven en `packages/db` (Parte 4); `api-core` (Parte 3) dispara el recálculo en cada transición; `geo-service` (Parte 4) expone el resultado.
- **Limitación conocida:** DBSCAN encadena; una fila de reportes a lo largo de una calle puede unirse en un solo grupo alargado. Se reporta como advertencia cuando el diámetro del grupo supera `4 × radio`; el técnico decide si fusiona o separa manualmente `<a confirmar>`.
- **No confundir con el clustering visual** de MapLibre, que depende del zoom y solo sirve para dibujar.

### 9.3 Vínculo con el drenaje urbano

Un charco recurrente es un **síntoma**; la causa suele ser una de estas cuatro, y los campos opcionales del reporte ayudan a distinguirlas:

| Causa presunta | Mecanismo | Síntomas que el vecino puede observar | Campos que la sugieren |
|---|---|---|---|
| **Contrapendiente / punto bajo** | El punto está más bajo que su salida; el agua no tiene adónde ir por gravedad. Solo se va por infiltración o evaporación. | El agua queda **mucho después** de la lluvia; no hay sumidero cerca o el sumidero está más alto que el charco. | `duracion ≥ 2h_12h`, `frecuencia = permanente`, `sumidero_cercano = no` |
| **Sumidero insuficiente o tapado** | El caudal que llega supera la capacidad de captación de la rejilla (o está obstruida por basura/sedimento). | Se acumula **durante** la lluvia y drena rápido al terminar; rejilla visible con basura. | `sumidero_cercano = si`, `sumidero_estado = obstruido`, `duracion ≤ 30min_2h` |
| **Colector saturado (sobrecarga)** | La red aguas abajo está llena; el agua no entra e incluso **sube** por los sumideros (efecto de remanso). | Agua que **brota** de la rejilla o levanta tapas; el charco crece aunque el sumidero esté limpio. | `agua_brota_sumidero = true` |
| **Desborde de cauce o canal** | Un canal o arroyo cercano supera su capacidad. | Extensión grande, agua con sedimento, coincide con crecidas. | `causa_presunta = desborde_cauce` |

Referencias conceptuales que **no** se implementan en Misión 1: método racional (Q = C·i·A) para estimar el caudal de una cuenca urbana pequeña; curvas IDF locales y período de retorno de diseño `<fuente de IDF local a confirmar>`; capacidad de captación de sumideros según tipo de rejilla y pendiente. Todo esto requiere topografía, inventario de la red y un estudio hidráulico formal; el sistema solo aporta el **dónde** y el **cuánto se repite**.

### 9.4 Vínculo con el pavimento

| Patología | Por qué atrapa agua | Relación con el reporte |
|---|---|---|
| **Hundimiento** | Asentamiento de la subrasante (suelo débil, compactación deficiente) o lavado de finos por fuga de tubería. Crea una depresión cerrada. | `causa_presunta = hundimiento_pavimento`; suele coincidir con `frecuencia = permanente`. |
| **Ahuellamiento** | Las huellas de neumáticos se deforman y forman canales longitudinales que retienen agua (riesgo de hidroplaneo). | Charcos alargados en la huella, `afectacion = vehicular`. |
| **Pérdida de bombeo transversal** | Si la calzada pierde su pendiente hacia los bordes (deformación o recapados sucesivos sin corregir sección), el agua queda en el carril en vez de ir a la cuneta. | Charcos en el centro del carril con cuneta seca. |
| **Baches** | El bache retiene agua y el agua acelera el deterioro del bache (bombeo de finos, pérdida de adherencia). Ciclo vicioso agua ↔ pavimento. | Muchos reportes pequeños de `tirante = tobillo` recurrentes. |

Indicadores usuales como referencia, **sin valores normativos afirmados aquí**: **PCI** (ASTM D6433, 0–100, evaluación visual de fallas) e **IRI** (m/km, regularidad longitudinal). Los umbrales de intervención y la pendiente transversal mínima de diseño dependen de la normativa local `<a confirmar>`. Un punto crítico con muchos reportes es un buen candidato para levantar PCI/IRI en campo, no un sustituto de ese levantamiento.

### 9.5 Limitaciones explícitas (deben mostrarse en la UI pública y en toda exportación)

- Mi Curichi es un **inventario de reportes ciudadanos**. Los datos son de **percepción**, no medidos: el tirante es estimado por referencia corporal, la duración es recordada, la ubicación tiene el error del GPS del celular o de la mano del usuario.
- **No es** un modelo hidráulico ni hidrológico, ni un estudio de drenaje, ni un diagnóstico de pavimento.
- Cualquier decisión de inversión, obra o priorización **requiere estudio técnico formal** (topografía, inventario de red, modelación, evaluación de pavimento).
- La ausencia de reportes en una zona **no significa** ausencia de anegamiento (sesgo de participación).
- Cada exportación incluye estas limitaciones en un campo `nota_metodologica` y en el encabezado del CSV.

---

## 10. Fases, puertas de aprobación y Definition of Done

### 10.1 Fases

| Fase | Entregable | Dónde corre | Puerta de salida |
|---|---|---|---|
| **0 — CLAUDE.md** (esta) | Este archivo | — | **Aprobación explícita del usuario** |
| **1 — Local** | Las 5 partes funcionando en `~/Proyectos/MI CURICHI` con Docker Compose y datos de muestra (sintéticos + shapefiles reales si están disponibles). Sin despliegue, sin dominios, sin nube. | Máquina local | **Aprobación explícita del usuario** |
| **2 — Web completa** | Despliegue, dominio, CDN, HTTPS, backups, monitoreo, hardening. | Hosting `<a confirmar>` | Solo después del "aprobado" de Fase 1 |

**Nunca se cruza una puerta sin un "aprobado" explícito del usuario.** Al terminar cada fase (y cada parte dentro de una fase) se entrega un resumen corto con: qué se hizo, cómo verificarlo (comandos), qué quedó pendiente y qué decisión se necesita.

### 10.2 Orden sugerido dentro de la Fase 1

Cada paso = una tarea asignada a una parte, con carpeta designada, plan corto → aprobación → código → resumen.

1. **Parte 5** — arranque del repositorio: estructura, workspace, Turborepo, Biome, Husky, CI, `docker-compose.yml` (postgis, minio), `README.md`, `.env.example`.
2. **Transversal** — `packages/contracts`: enums, esquemas, severidad, OpenAPI (revisa Parte 3).
3. **Parte 4** — `packages/db`: esquema, migraciones, seeds sintéticos.
4. **Parte 5** — `pipelines/geodata-etl`: ETL con muestra sintética; con shapefiles reales cuando existan.
5. **Parte 4** — `services/geo-service`: PIP, capas, agregados, puntos críticos.
6. **Parte 3** — `services/api-core`: reportes, severidad, fotos, moderación, auth, export.
7. **Parte 1** — `apps/web-ciudadano`: mapa, panel de detalle, formulario, PWA.
8. **Parte 2** — `apps/panel-admin`: login, filtros, moderación, export, indicadores, capas.
9. **Parte 5** — cierre: E2E transversal en `e2e/`, revisión de seguridad, auditoría de accesibilidad y rendimiento, resumen de fase.

### 10.3 Definition of Done por parte

Una parte (o cada paquete dentro de ella) está terminada cuando **todo** esto se cumple:

- [ ] Compila (`build`) sin warnings nuevos.
- [ ] `lint`, `typecheck` y `test` verdes en local y en CI.
- [ ] Al menos un test cubre el **camino crítico** de la parte (definido en §4).
- [ ] `README.md` propio con: propósito, comandos, variables de entorno, cómo probar.
- [ ] `.env.example` con todas las variables, sin valores reales.
- [ ] Sin datos ficticios presentados como reales; lo sintético vive en `samples/` y se dice que lo es.
- [ ] Sin cambios fuera de la carpeta designada (o con autorización registrada en el PR).
- [ ] Resumen entregado al usuario con qué, cómo verificar, pendientes y decisiones.

---

## 11. Comandos del repositorio

Los nombres de estos comandos **son el contrato**; se implementan en la primera tarea de la Parte 5 en Fase 1. Los paquetes del workspace se llaman igual que su carpeta (`web-ciudadano`, `panel-admin`, `api-core`, `geo-service`, `db`, `contracts`, `geodata-etl`, `e2e`) para que `pnpm --filter <nombre>` funcione sin prefijos.

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala todo el monorepo (Node 24 LTS, ver `.nvmrc`). |
| `docker compose up -d` | Levanta `postgis`, `minio`, `geo-service`, `api-core`. |
| `pnpm dev` | Turborepo: todos los `dev` en paralelo (frontends y servicios). |
| `pnpm db:local` | Levanta PostGIS local sin Docker (PGlite + pglite-socket en `localhost:5433`) y aplica migraciones pendientes. `pnpm dev` lo incluye. |
| `pnpm db:generate` | Crea un archivo de migración SQL nuevo con marca de tiempo en `packages/db/migraciones/` (Parte 4). |
| `pnpm db:migrate` | Aplica las migraciones de `packages/db` (Parte 4): extensiones PostGIS, esquemas `public` y `geo`, índices GIST, vistas vigentes. |
| `pnpm db:seed:samples` | Carga reportes **sintéticos** y capas de `data/samples/` (script de `packages/db`). |
| `pnpm etl:inspect --capa unidad_vecinal --version 2026-09` | Inspección previa (§6.2). |
| `pnpm etl:run --capa unidad_vecinal --version 2026-09` | Reproyección, validación, normalización, simplificación, tiles, reporte (§6.3–6.8). |
| `pnpm etl:load --capa unidad_vecinal --version 2026-09` | Carga a PostGIS (§6.9). |
| `pnpm etl:all` | `run` + `load` para todas las capas/versiones declaradas en `pipelines/geodata-etl/config/capas.yaml`. **Un solo comando regenera todo.** |
| `pnpm etl:test` | pytest del ETL. |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | En todo el monorepo vía Turborepo. |
| `pnpm test:e2e` | Playwright transversal de `e2e/` (Parte 5) más los E2E propios de cada app (requiere `docker compose up` y `pnpm dev`). |
| `pnpm build` | Build de todos los paquetes. |
| `pnpm --filter <paquete> <script>` | Cualquier script de un paquete concreto. |
| `pnpm contracts:build` | Regenera OpenAPI y `dominio.json` desde Zod. |

Requisitos del sistema en local: Docker Desktop, Node 24 LTS, pnpm 12, GDAL 3.13 (`brew install gdal`), tippecanoe (`brew install tippecanoe`), Python 3.12+ y `uv` `<a confirmar>`. mapshaper se instala vía npm en el workspace.

---

## 12. Convenciones de código, git y PR

### 12.1 Código

- TypeScript `strict`; sin `any` salvo con comentario justificado; sin `// @ts-ignore`.
- Biome como única fuente de formato y lint. Nada se mergea con errores de Biome.
- Nombres en **español** para el dominio (`reporte`, `unidad_vecinal`, `severidad`) y en inglés para lo técnico genérico (`handler`, `repository`, `middleware`). Nunca mezclar dentro del mismo identificador.
- Columnas y campos de API en `snake_case`; variables TS en `camelCase`; mapeo explícito en la capa de acceso a datos.
- Funciones de dominio (severidad, máquina de estados) son **puras** y viven en `contracts` o en `dominio/` del servicio, sin acceso a red ni DB.
- Todo texto visible al usuario en español, sin anglicismos evitables.
- Comentarios solo donde el *por qué* no es evidente. Nada de comentarios que repiten el código.

### 12.2 Git

- **Conventional Commits en español**, con scope del paquete:
  `feat(geo-service): resolver UV por point-in-polygon con manejo de borde`
  `fix(api-core): rechazar fotos sin sanitizar EXIF`
  `chore(repo): configurar turborepo y biome`
  `docs(claude): actualizar matriz de severidad`
  Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`. Scopes: `web-ciudadano`, `panel-admin`, `api-core`, `geo-service`, `db`, `geodata-etl`, `contracts`, `infra`, `e2e`, `docs`, `repo`, `claude`.
  Correspondencia: Parte 1 → `web-ciudadano`; Parte 2 → `panel-admin`; Parte 3 → `api-core`, `contracts`; Parte 4 → `db`, `geo-service`; Parte 5 → `geodata-etl`, `infra`, `e2e`, `repo`, `docs` (los cambios de CI usan tipo `ci` con scope `infra`).
- **Una rama por paquete y fase**: `fase-1/<scope>` para la primera implementación, luego `feat/<scope>/<descripcion-corta>`, `fix/<scope>/<descripcion-corta>`.
- **Nada de commits directos a `main`.** `main` está protegida; solo entra por PR con CI verde.
- Commitlint + Husky verifican el formato en `commit-msg`; lint-staged corre Biome en `pre-commit`.
- `.gitattributes` fija `eol=lf`.

### 12.3 Pull Requests

- Un PR por tarea, con la **parte y la carpeta designada** en el título: `[P3 api-core] Máquina de estados del reporte`.
- Plantilla (`.github/PULL_REQUEST_TEMPLATE.md`): qué cambia, cómo verificarlo, parte y carpeta designada, cambios de contrato (sí/no y cuáles), hallazgos fuera de la carpeta (documentados, no tocados), checklist DoD (§10.3).
- CI obligatorio: lint, typecheck, test, build. E2E en `main` y bajo demanda.
- Revisión: el usuario aprueba. El agente no se auto-mergea.

---

## 13. Seguridad, privacidad y manejo de datos

**Responsable de la política: Parte 5.** Define esta tabla, la configura en infraestructura y CI (escaneo de secretos, cabeceras, CORS, auditoría de dependencias) y revisa cada PR que toque `api-core`, fotos o autenticación. Cada parte implementa en su propio código lo que le aplica; la mayor carga recae en la Parte 3 (EXIF, rate limiting, validación en servidor, autorización) y en la Parte 4 (permisos de base de datos, `geo-service` sin escritura).

| Tema | Regla |
|---|---|
| **Ubicación como dato sensible** | Reporte **anónimo permitido** (`autor_id` null). La identidad del reportante **nunca** aparece en el mapa público ni en exportaciones públicas. |
| **Jitter público** | Si `ubicacion_tipo = vivienda_o_predio`, la vista pública aplica un desplazamiento **determinista** (semilla = `id`) de hasta `JITTER_PUBLICO_M = 30` `<a confirmar>` y **no** muestra `direccion_aprox`. El técnico ve la coordenada exacta. Además, la vista pública redondea coordenadas a 5 decimales. |
| **EXIF** | `api-core` reprocesa cada imagen con sharp (re-encode sin metadatos) **antes** de guardarla en MinIO. `exif_sanitizado = true` es condición para servir la foto. Test obligatorio que sube una foto con GPS y verifica que el objeto guardado no lo tiene. |
| **Rate limiting** | `POST /reportes` y `POST /fotos`: límite por IP (propuesto 10/h `<a confirmar>`) y por sesión; respuesta `429` con `Retry-After`. Honeypot en el formulario. `ip_hash` con sal rotativa, borrado a los N días. |
| **Moderación previa** | Nada se publica en estado `nuevo`. |
| **Secretos** | Nunca en el repo. `.env.example` con nombres y descripción, sin valores. `.env` en `.gitignore`. En CI, GitHub Secrets. Escaneo de secretos en pre-commit `<herramienta a confirmar>`. |
| **Validación en servidor** | Todos los payloads pasan por los esquemas Zod de `contracts` en `api-core`. La validación del cliente es solo UX. |
| **Archivos** | Tipos permitidos por *magic bytes*, no por extensión; tamaño máximo; redimensionado a un ancho máximo `<propuesto 1600 px, a confirmar>`; nombres de objeto generados por el servidor (uuid), nunca el nombre original. |
| **Autorización** | Por rol en cada handler; los endpoints de moderación y export exigen `tecnico` o `admin`. `geo-service` no expone escritura. |
| **Auditoría** | Toda transición de estado, reclasificación, fusión y activación de capa queda en `auditoria` con actor y antes/después. |
| **Cabeceras** | CSP, HSTS (Fase 2), `X-Content-Type-Options`, CORS restringido a los orígenes de las Partes 1 y 2. |
| **Datos personales** | Se recoge lo mínimo: para anónimos, nada identificable salvo `ip_hash` temporal. Para técnicos, email y nombre. Política de retención `<a confirmar con el municipio>`. |
| **Backups** | Fase 2. En Fase 1, volumen Docker + `pg_dump` manual documentado. |

---

## 14. Accesibilidad, rendimiento y presupuesto de carga del mapa

### 14.1 Accesibilidad (WCAG 2.2 AA)

- Todo el flujo de reporte debe completarse **con teclado** y con lector de pantalla: el mapa tiene alternativa (buscar/ingresar coordenadas o usar GPS) para quien no puede arrastrar un marcador.
- Contraste mínimo 4,5:1 en texto; los colores de severidad van acompañados de **texto y forma** (no solo color).
- Tamaño de objetivos táctiles ≥ 24×24 px CSS (criterio 2.5.8 de WCAG 2.2).
- Formularios con etiquetas asociadas, errores descritos en texto y anunciados (`aria-live`).
- Idioma `lang="es"`, textos en español claro; nada de siglas sin expandir en la UI pública.
- Auditoría: Lighthouse accesibilidad y `axe` en Playwright en las dos vistas principales; la ejecuta la Parte 5 desde `e2e/`; las Partes 1 y 2 corrigen.

### 14.2 Presupuesto de carga (objetivos iniciales `<a confirmar en Fase 1 con medición>`)

| Métrica | Objetivo | Cómo se cumple |
|---|---|---|
| LCP en móvil 4G, página pública | < 2,5 s | Mapa carga después del contenido crítico; capa base ligera; SSR de la cabecera. |
| Mapa interactivo (primer tile + puntos) | < 4 s en 4G | Puntos como GeoJSON con `cluster: true` limitado por bbox; capas en `web.geojson` o PMTiles. |
| Peso del `unidad_vecinal.web.geojson` | ≤ 1,5 MB gzip; si más, PMTiles | Simplificación §6.6. |
| JS inicial de la Parte 1 | Medir en Fase 1 y fijar presupuesto; MapLibre se carga diferido | `next/dynamic` para el mapa. |
| Puntos en pantalla sin degradación | hasta ~10 000 con clustering | Por encima: bbox + paginación; deck.gl solo con ADR. |
| Consulta PIP | < 50 ms p95 en local | GIST + capa vigente en tabla, `EXPLAIN` documentado. |

### 14.3 Mapa base

- Fase 1 (local): teselas raster de OpenStreetMap **solo para desarrollo**, con atribución `© OpenStreetMap contributors`, respetando su política de uso (no apta para producción).
- Fase 2: mapa base vectorial sin dependencia propietaria de pago, opciones a evaluar con ADR: extracto PMTiles auto-hospedado (Protomaps) u OpenFreeMap `<a confirmar>`. Siempre con atribución visible.

### 14.4 Sistema de diseño (fijado por el usuario con mockups, 2026-09-13)

- **Paleta, tomada del logotipo (capibara sobre círculo verde y azul):** verde marca `#28934D` (acción, marca, severidad baja; botones rellenos con el paso 700 `#1B6B38` para contraste 6:1), azul agua `#0D6189` (enlaces, datos de agua, estado resuelto), azul profundo o *tinta* `#0F2D43` (todo el texto, mapa oscuro, tarjetas invertidas; contraste 12,8:1). Cada rol con rampa 100/300/500/700/900. Fondo de página verde-gris muy claro, superficies blancas.
- **Severidad = color + etiqueta + forma** (contador de barras), nunca solo color: baja relleno `#28934D` texto `#1B6B38`; media relleno `#C98A0E` texto `#8A5A00`; alta relleno `#E4601B` texto `#B84A0E`; crítica relleno `#B3200A`, texto blanco sobre tinta.
- **Tipografía:** Sora 600 para titulares y cifras (52/54 titular de pantalla, 32/36 título de sección, 20/24 título de tarjeta); Source Sans 3 400/600 para interfaz (18/28 cuerpo del flujo de reporte, 16/24 interfaz, 13,5/20 metadatos). Mínimo 16 px en interfaz y 18 px en el cuerpo del flujo de reporte.
- **UI kit:** radios de 12 a 30 px, controles en pastilla completa, objetivos táctiles de 48 px, foco visible en verde. Botón primario relleno verde 700; secundario blanco con filete; acciones del mapa en tinta; deshabilitado verde apagado. Chips de filtro con punto de color y nombre (activo en tinta). Botones circulares (filtros, +, ubicación) y buscador en pastilla. Campo de texto con contador «Mínimo 10 caracteres · 0/1000» y error en rojo. Tirante elegido en tarjetas radio por referencia corporal.
- **Layouts:** móvil = mapa a toda altura, «Reportar un punto» fijo al alcance del pulgar, hoja de detalle redondeada que sube sobre el punto; estado vacío «Todavía nadie reportó en esta zona» con «Reportar el primero acá». Escritorio = panel izquierdo con «N puntos cerca de vos», chips de severidad y tarjetas de reporte; mapa oscuro a la derecha con buscador, chip «Distrito 07 · UV-123 · capa oficial vigente», marcadores en pastilla «● Crítica» y KPIs abajo. Tono cercano con voseo («cerca de vos», «contanos qué ves»).
- **Logo:** el usuario lo envió como imagen; el archivo definitivo va en `apps/web-ciudadano/public/logo.png` `<pendiente de recibir el archivo>`.

### 14.5 PWA

- `manifest.webmanifest`, service worker con caché de shell y de la capa `web.geojson`/PMTiles vigente (invalidada por `version_capa`).
- Reporte **offline** (guardar y enviar luego) queda en backlog (§15); en Misión 1 la PWA solo garantiza instalación y caché de lectura.

---

## 15. Backlog de fases futuras (no implementar sin nueva aprobación)

| Prioridad orientativa | Ítem | Notas |
|---|---|---|
| Alta | Reporte offline con cola de envío | PWA + Background Sync. |
| Alta | Geocodificación inversa robusta | Nominatim auto-hospedado u otro `<a confirmar>`; en Misión 1 es opcional. |
| Alta | Fase 2: despliegue, dominio, CDN, HTTPS, backups, monitoreo | Solo tras aprobación de Fase 1. |
| Media | Analítica: series temporales por UV, estacionalidad, mapa de calor | Sobre reportes validados. |
| Media | Cruce con lluvia registrada (pluviómetros, radar) | Fuente `<a confirmar>`; permite distinguir "llovió mucho" de "drena mal". |
| Media | Capas adicionales: red de drenaje, sumideros, canales, curvas de nivel | Si el municipio las provee; nuevo tipo de capa en el ETL. |
| Media | Notificaciones al reportante sobre cambio de estado | Requiere contacto opcional y consentimiento. |
| Media | Órdenes de trabajo y seguimiento de intervención | Integración con sistemas municipales `<a confirmar>`. |
| Baja | App móvil nativa | La PWA cubre el MVP. |
| Baja | Modelo de priorización de inversión | Requiere estudio técnico; el sistema solo aporta insumos. |
| Baja | Modelación hidráulica (método racional, IDF, SWMM u otro) | Fuera del propósito del sistema; posible exportación de insumos. |
| Baja | Multi-municipio | Requiere multi-tenant en capas y usuarios. |
| Baja | deck.gl para volúmenes grandes de puntos | Solo con ADR y medición. |

---

## 16. Supuestos abiertos y decisiones pendientes

Cada ítem se cierra con una respuesta del usuario y se actualiza en este archivo.

| # | Punto | Supuesto provisional adoptado | Decisión necesaria |
|---|---|---|---|
| 1 | Ciudad, país y fuente oficial de las capas | Santa Cruz de la Sierra, Bolivia; capas del Gobierno Autónomo Municipal `<a confirmar>` | Confirmar ciudad y quién entrega los shapefiles (oficina, fecha, licencia de uso). |
| 2 | Existencia y CRS de los shapefiles | Carpeta `DM_UV_MZ_2025` anunciada por el usuario, aún no entregada. El ETL se desarrolla con muestra sintética hasta tenerla. | Copiarla a `data/raw/DM_UV_MZ_2025/` con `MANIFEST.md`. ¿Traen `.prj`? ¿CRS? (probable EPSG:32720 o EPSG:24880). |
| 3 | Nombres de campos originales de las capas | `<a confirmar>`; el mapeo vive en `config/<capa>.yaml`. | Ver el `.dbf` real. |
| 4 | Autenticación en el MVP | Reporte ciudadano **anónimo** sin cuenta; login solo para técnico/admin con email + contraseña (Argon2id) gestionado por `api-core`. | Confirmar; alternativa: proveedor externo de identidad en Fase 2. |
| 5 | Lenguaje de `geo-service` (Parte 4) | **Node + Fastify + PostGIS** (§8.2). ETL en Python (Parte 5). | Confirmar o pedir Python/FastAPI. |
| 6 | Hosting en Fase 2 | Ninguno asumido. | ¿Servidor municipal on-premise, nube, presupuesto, dominio institucional? |
| 7 | Parámetros de dominio | Severidad (§9.1), radio 25 m, jitter 30 m, tolerancia de hueco 20 m, rate limit 10/h, foto 8 MB × 3 | Validar con técnico municipal en Fase 1. |
| 8 | Git y remoto | Repo local sin remoto hasta indicación. | ¿Inicializar git ahora? ¿Crear remoto en GitHub (org/usuario)? |
| 9 | README y estructura vacía | No creados en Fase 0 (solo `CLAUDE.md`). | Autorizar su creación como primera tarea de la Parte 5 en Fase 1. |
| 10 | Versiones marcadas `<a confirmar>` en §8.1 | Rango de minor fijado; patch se congela al instalar. | Ninguna; se resuelven al ejecutar `pnpm install` en Fase 1 y se anotan aquí. |
| 11 | Retención de `ip_hash` y de datos personales | 30 días para `ip_hash`. | Confirmar con el municipio. |
| 12 | Formato de métricas | Prometheus. | Confirmar. |
| 13 | Fuente de curvas IDF y normativa local de drenaje/pavimento | Ninguna citada. | Solo relevante para fases futuras; documentar cuando exista. |
