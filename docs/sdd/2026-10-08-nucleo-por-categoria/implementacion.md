# Implementación — M3a, lecturas por categoría

Transcripción, hecha por el agente principal, de los informes de los implementadores. Las salidas son
las que pegaron ellos; la verificación independiente va en `verificacion.md`.

| Tarea | Agente | Criterio | Carpeta |
|---|---|---|---|
| M3.1 · `contracts` 0.20.0 | `trabajador-raiz` | CA1 | `packages/contracts/` |
| M3.2 · 0021 y DBSCAN por categoría | `trabajador-raiz` (segundo intento: el primero se detuvo antes de escribir; el usuario pidió relanzarlo) | CA2 | `packages/db/` |
| M3.3 · api-core, lecturas | `trabajador-raiz` | CA3 | `services/api-core/` |
| M3.4 · geo-service | `trabajador-raiz` | CA4 | `services/geo-service/` |
| M3.5 · README de api-core y geo-service | `general-purpose` (Sonnet) | CA9 (parte) | los dos `README.md` |

Lista completa en `archivos.txt`. Hubo varios cortes por límite de sesión; en todos se comprobó que no
quedara nada a medias antes de retomar.

## Por tarea (según los implementadores)

### M3.1 · Contrato 0.20.0
- **Filtro `CategoriaFiltroSchema`** (`comunes.ts`), en listados, exportar, indicadores y ejecutivo:
  - sin valor → `inundacion`;
  - alias normalizados;
  - `todas` reconocido;
  - desconocido → `null`.
  - El servidor decide si una ruta admite `todas` (las públicas no).
- **Respuestas** con `categoria`, `subtipo` y `detalle` **opcionales** (regla 5: los consumidores y los *fixtures* tipados de las apps).
- **Forma nueva de crear** (`ReporteCrearCategoriaSchema`), con el núcleo tomado de `ReporteCrearSchema.shape`:
  - funciones `esReporteCrearPorCategoria`, `reportePlanoACategoria` y `normalizarReporteCrear`;
  - `DetalleInundacionSchema` pasa a `z.strictObject`.
- **Fusión**: `fusionado_en_id` acepta UUID o ID corto, con la constante compartida `ID_REPORTE_CORTO_O_UUID`.
- **Sesión y configuración**:
  - `SesionActual` suma `cupos` y `fotos_restantes_hoy`;
  - `ConfiguracionPublica` suma `categorias_activas`;
  - todos opcionales.
- **Códigos de error**: `CATEGORIA_NO_DISPONIBLE` y `FUSION_ENTRE_CATEGORIAS`.
- **geo-service en el contrato**: `GeoAgregadosQuerySchema` y `GeoPuntosCriticosQuerySchema`.
- **OpenAPI** con `oneOf` en `POST /reportes`, los errores nuevos y el parámetro `categoria` en geo-service.
- **Versión y documentación**: 0.20.0, con CHANGELOG (incluye la nota de D3), README y `contrato-0-16` al día.
- Salidas:
  - contracts: 18/265 → **19/289**;
  - `typecheck --filter=...contracts`: 9/9;
  - web-ciudadano 34/486 y panel-admin 40/458, iguales a la línea base;
  - Biome limpio.

### M3.2 · Base de datos
- **Migración 0021**: `reporte_categoria_creado ON reporte (categoria, creado_en DESC) WHERE estado IN ('nuevo','validado','resuelto')`, con su reversa, que también borra su fila de `_migraciones`.
- **DBSCAN completo**: una pasada por categoría sobre `reporte`, con el radio de cada definición. Una categoría sin definición no se agrupa (falla cerrado) y se informa en `categoriasSinDefinicion`. `punto_critico.categoria` se escribe.
- **Recálculo incremental**: solo mira vecinos de la misma categoría, con el radio de esa categoría.
- **Firmas**: `radioM` opcional (explícito, fuerza el radio en todas las categorías) y `registro` inyectable. Los llamadores no cambian.
- **`insertarReporte`** acepta una categoría.
- **Pruebas**: `migracion-0021`, `puntos-criticos-categoria` (bache e inundación a 5 m no se agrupan, radio por definición, mismos grupos de inundación, incremental) y ajustes en `puntos-criticos-volumen` y en `migracion-0020` (la reversa de la 0021 va antes que la de la 0020).
- Salidas:
  - db: 26/284 → **28/294**. El preflight tuvo un *timeout* por contención en `migracion-0015`, que en aislado dio 20/20;
  - api-core 405, geo-service 61 y geodata-etl 21, iguales a la línea base;
  - PostgreSQL real: `migrate` dos veces, `privilegios` y `EXPLAIN` con `Index Scan using reporte_categoria_creado`;
  - Biome limpio.

### M3.3 · api-core, lecturas
- **Proveedor de categorías** (`src/categorias.ts`): catálogo y registro inyectado, caché de 30 s y falla cerrado. Expone `categoriaPublica` y `categoriaPanel`.
- **Lecturas**: todas leen `reporte` con `r.categoria = $n`.
  - Rutas públicas: dan `400 CATEGORIA_NO_DISPONIBLE`.
  - Rutas del panel: admiten `todas`.
  - Detalle público por id: `404` si la categoría está inactiva.
  - Técnico por id: ve todas las categorías.
- **Respuestas**:
  - `SELECT_REPORTE` suma `categoria`, `subtipo` y `detalle`;
  - la vista pública recorta `detalle` a los `camposPublicos`;
  - la vista técnica y la de «Mis reportes» lo devuelven completo.
- **Otros endpoints**:
  - la exportación suma `categoria`, `subtipo` y `detalle` al final;
  - `/configuracion` trae `categorias_activas`;
  - `/fotos/:key` solo sirve en público la foto de una categoría activa.
- **Métrica de bandeja y mantenimiento**: cubren todas las categorías.
- **Escrituras**: siguen sobre la vista hasta M3b.
- **Pruebas**:
  - nueva `no-contaminacion-categoria` (13);
  - la tabla de visibilidad suma la dimensión categoría (+4);
  - ajustes: el espía de `indicadores` pasa a `/FROM\s+reporte\b/` con el mismo propósito, `configuracion` con pool de mentira y la fábrica `fila()` de `seguridad`.
- Salidas:
  - api-core: 405 → **422** (+11 omitidas);
  - privacidad 90 → 94;
  - seguridad 152 = 152;
  - PostgreSQL real 9/9;
  - `typecheck --filter=...contracts`: 9/9;
  - Biome limpio.
  - Un *timeout* intermitente de `exportacion` en una corrida intermedia, que en aislado dio 10/10.

### M3.4 · geo-service
- **Rutas**: `agregados/unidades-vecinales` y `puntos-criticos` aceptan `?categoria=`.
  - Leen `reporte` y `punto_critico.categoria`.
  - Responden `400 CATEGORIA_NO_DISPONIBLE` (también con `todas`).
  - Agregan `categoria` a la respuesta.
- **Proveedor** propio, copia del de api-core.
- **Caché**: una por categoría (`CachePorCategoria`), sin cambios en `X-Cache` ni en `Cache-Control`.
- **Pruebas**:
  - nueva `no-contaminacion-categoria` (10);
  - `plan-agregados` liga `$1 = 'inundacion'` y sigue exigiendo el Index Only Scan.
- Salidas:
  - geo-service: 61 → **71**;
  - `typecheck --filter=...contracts`: 9/9;
  - Biome limpio.

## Decisiones técnicas para la revisión
1. **Campos de respuesta opcionales** (regla 5 del plan). Pasan a obligatorios en M4 y M5.
2. **`todas`**: lo reconoce el contrato y lo valida cada ruta del servidor. Un mismo esquema sirve para la ruta pública y la del panel.
3. **Detalle público por id**: sin `?categoria`; si la categoría está inactiva, da el mismo `404` que un reporte oculto.
4. **Categoría activa en el catálogo pero sin definición**: se trata como inactiva y se registra.
5. **DBSCAN**: no agrupa una categoría sin definición. Un `radioM` explícito fuerza el mismo radio en todas las categorías.
6. **Pruebas existentes ajustadas**: `indicadores`, `configuracion`, `seguridad`, `puntos-criticos-volumen`, `migracion-0020` y `plan-agregados`. Según los implementadores, siguen midiendo lo mismo; el revisor lo comprueba.
