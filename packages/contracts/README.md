# contracts — transversal (custodia Parte 3)

Única fuente de verdad de los contratos entre partes: enums del dominio, matriz de severidad, parámetros de dominio, esquemas Zod de cada payload y respuesta, y la especificación OpenAPI generada.

| Qué | Dónde |
|---|---|
| Enums y etiquetas en español; estados públicos, verificados y retirados, y la etiqueta exacta «NO SE HA VERIFICADO» | `src/dominio/enums.ts` |
| Severidad (función pura, §9.1) | `src/dominio/severidad.ts` |
| Categorías: definiciones, registro, slugs y categoría inicial (ver la sección de abajo) | `src/categorias/` |
| Parámetros (radio 25 m, jitter 30 m, radio del dispositivo 60 m, precisión 50 m, cupo de 3 reportes y 12 fotos por día, 10 altas por IP y por día, demora de publicación de 60 y 240 s, fotos, fecha del evento, exportación, zona horaria y ciudad por defecto) | `src/dominio/config.ts` |
| Máquina de estados (`TRANSICIONES`, `transicionPermitida`, `transicionExiste`) y vista del autor (`MiReporte`, `/mis-reportes`) | `src/esquemas/reporte.ts` |
| Huella de capas y teselas (`HuellaCapaSchema`, `rutaCapaConHuella`, `rutaTeselasConHuella`, 410 `CAPA_CAMBIO`) | `src/esquemas/geo.ts` |
| Distancia (haversine) y radio del dispositivo, la misma cuenta en la interfaz y en api-core | `src/dominio/geo.ts` |
| Configuración pública de la ciudad (`GET /api/v1/configuracion`) | `src/esquemas/configuracion.ts` |
| Esquemas Zod | `src/esquemas/*.ts` |
| Jitter determinista | `src/geo/jitter.ts` |
| OpenAPI 3.1 generado | `openapi/openapi.yaml` (no editar a mano) |
| Export para otros lenguajes | `dist/dominio.json` |

```bash
pnpm --filter contracts build      # tsc + genera openapi.yaml y dominio.json
pnpm --filter contracts test       # vitest: severidad (256 combinaciones), esquemas, jitter, radio, categorías
pnpm --filter contracts typecheck
```

Regla: todo cambio aquí es cambio de contrato. Se anuncia en el plan de la tarea, se versiona en `CHANGELOG.md` y lo revisa la Parte 3.

## Exportación GeoJSON multitemática (0.22.0)

`ExportacionGeoJsonSchema` conserva el feature técnico legado y acepta además una variante
con `categoria` explícita, no vacía y distinta del literal `inundacion`: sus campos planos
`profundidad_estimada`, `frecuencia` y `causa_presunta` admiten `null`, como requiere la
representación de otras categorías en la migración 0020. Los otros tres campos planos de agua
ya admitían nulos. Una colección puede mezclar ambas representaciones.

Los payloads antes válidos se conservan, incluidos el legado sin categoría y otras categorías
con enums no nulos. Inundaciones y el legado siguen exigiendo los tres enums no nulos. La
geometría, las propiedades técnicas y los metadatos de exportación mantienen su validación.
La condición también se publica en OpenAPI mediante la unión y el patrón de categoría.

Esta ampliación se limita a la exportación y a su tipo inferido `ExportacionGeoJson`; los
esquemas generales públicos y técnicos no cambian. No normaliza slugs ni comprueba actividad
de categorías. Pruebas focales: `pnpm --filter contracts exec vitest run test/contrato-0-22.test.ts`.

## Categorías (registro y políticas)

Desde la 0.19.0 la plataforma describe cada categoría de reporte como **datos**, en un registro común, en vez de ramificar por categoría en cada parte (ADR [0009](../../docs/decisiones/0009-nucleo-y-registro-de-categorias.md)). Una `DefinicionCategoria` reúne los textos, el icono (su nombre como cadena: este paquete no importa React), los colores (ADR [0022](../../docs/decisiones/0022-paleta-e-iconografia-de-categorias.md)), el esquema Zod del detalle, la severidad versionada, las preguntas declarativas del paso 2 (ADR [0021](../../docs/decisiones/0021-formularios-por-categoria.md)), los filtros con su alcance (ADR [0016](../../docs/decisiones/0016-reinicio-de-filtros-al-cambiar-categoria.md)), el radio de recurrencia, la regla de cupo (ADR [0017](../../docs/decisiones/0017-cupo-por-categoria-configurable.md)) y la geometría (hoy solo punto, ADR [0019](../../docs/decisiones/0019-areas-verdes-con-point.md)).

| Qué | Dónde |
|---|---|
| Tipos de la definición (`DefinicionCategoria`, `Pregunta`, `FiltroDef`, `ReglaCupo`…) | `src/categorias/tipos.ts` |
| Textos de pantalla por categoría (`TextosCategoria`, `textosDeCategoria`; 0.21.0, ADR 0021) | `src/categorias/textos.ts` |
| Slugs canónicos, alias y forma de URL (`SLUGS_CATEGORIA`, `normalizarSlugCategoria`, `slugParaUrl`; ADR [0015](../../docs/decisiones/0015-prioridad-url-y-categoria-guardada.md)) | `src/categorias/slugs.ts` |
| Categoría inicial del mapa: URL, preferencia guardada, defecto (`resolverCategoriaInicial`; ADR [0014](../../docs/decisiones/0014-categoria-inicial-en-el-dispositivo.md) y 0015) | `src/categorias/resolver.ts` |
| Registro (`REGISTRO_CATEGORIAS`) y fábrica (`crearRegistroCategorias`); código `CODIGO_CATEGORIA_NO_DISPONIBLE` | `src/categorias/index.ts` |
| Una categoría: esquema del detalle y definición | `src/categorias/<slug>/esquema.ts` y `definicion.ts` |
| Filtro `categoria` de las lecturas (`CategoriaFiltroSchema`, `CATEGORIA_TODAS`; sin parámetro = inundación, `todas` solo en el panel) | `src/esquemas/comunes.ts` |

Desde la **0.20.0** (M3, ADR 0012) la API es consciente de la categoría, de forma aditiva: las lecturas aceptan el filtro `categoria` (sin el parámetro, inundación); las respuestas de reporte suman `categoria`, `subtipo` y `detalle` (opcionales hasta M4/M5, regla 5); `POST /api/v1/reportes` acepta la forma plana de hoy y la forma nueva por categoría (`ReporteCrearCategoriaSchema` + `normalizarReporteCrear`); `fusionado_en_id` de `PATCH /estado` acepta UUID o ID corto (`ID_REPORTE_CORTO_O_UUID`); `SesionActual` suma `cupos` y `fotos_restantes_hoy`, y `/configuracion`, `categorias_activas`. Códigos nuevos: `CATEGORIA_NO_DISPONIBLE` (400 público / 422 POST) y `FUSION_ENTRE_CATEGORIAS` (409). Que el contrato acepte un slug **no** significa que la categoría esté activa: eso lo decide el servidor con el catálogo.

Desde la **0.21.0** (M4, aditivo, sin cambios en el OpenAPI) la definición suma `textos?`: los textos de pantalla que la web pública tenía fijos con «inundación» y «agua» (el título y el `aria-label` del mapa, el h1 del detalle, el cuerpo de la lista vacía, el título del paso 2, el aviso de percepción y la descripción de `/reportar`). Se prefieren fragmentos que el consumidor compone (p. ej. `puntosDelMapa = 'puntos de inundación'` → `Mapa de ${puntosDelMapa} de ${ciudad}`) a plantillas con marcadores. `textosDeCategoria(def)` devuelve los textos con todos los campos resueltos, rellenando los que falten desde `nombre`, `nombreCorto` y `descripcion`, para que ningún consumidor invente su respaldo. `DEFINICION_INUNDACION.textos` los trae idénticos a los de hoy, así que con una sola categoría activa no cambia nada visible.

**Qué está activo hoy:** solo **Inundaciones** (`src/categorias/inundacion/`), descrita sin cambiar su comportamiento: la severidad v2, el radio de recurrencia y el cupo salen de `dominio/severidad.ts` y de `CONFIG_DOMINIO`. Los otros tres slugs (`bache`, `area_verde`, `basura`) están reservados en `SLUGS_CATEGORIA`, pero no tienen definición ni están registrados: una categoría se suma cuando completa su fase del roadmap (`docs/arquitectura/14-decisiones-m0-y-plan-m1.md`). Por ahora ninguna parte consume el registro; lo harán la base, `api-core` y las dos apps en M2–M4.

**Cómo se agrega una categoría:**

1. Creá `src/categorias/<slug>/esquema.ts` (el esquema Zod del detalle) y `definicion.ts` (la `DefinicionCategoria`), con el de Inundaciones como modelo. Los cuatro slugs iniciales ya tienen su alias y su forma de URL en `slugs.ts`.
2. Registrala en la lista que `categorias/index.ts` pasa a `crearRegistroCategorias` y exportá su esquema desde ese mismo archivo. La fábrica exige slugs únicos y no obliga a tocar el núcleo.
3. Para probar el mecanismo sin una categoría real, armá un registro propio con `crearRegistroCategorias([…])` y una definición sintética (el slug admite cualquier `string`); `test/contrato-0-19.test.ts` lo hace sin modificar `REGISTRO_CATEGORIAS`.
4. Agregá su prueba, subí la versión del paquete y anotá el cambio en `CHANGELOG.md`. Una geometría que no sea punto, o una categoría fuera de las cuatro iniciales, queda fuera del alcance cerrado (`CLAUDE.md` §3 y §15) y necesita aprobación y su propia ADR.

Que una categoría esté registrada no la activa: qué categorías están activas lo decide cada instalación, y las funciones de este paquete reciben esa lista (por ejemplo `activas` en `resolverCategoriaInicial`).
