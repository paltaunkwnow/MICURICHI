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

## Respuestas multitemáticas (0.23.0; exportación desde 0.22.0)

Las vistas pública, técnica y propia, sus features/colecciones y `ExportacionGeoJsonSchema`
conservan los payloads legados y aceptan además una variante
con `categoria` explícita, no vacía y distinta del literal `inundacion`: sus campos planos
`profundidad_estimada`, `frecuencia` y `causa_presunta` admiten `null`, como requiere la
representación de otras categorías en la migración 0020. Los otros tres campos planos de agua
ya admitían nulos. Una colección puede mezclar ambas representaciones.

Los payloads antes válidos se conservan, incluidos el legado sin categoría y otras categorías
con enums no nulos. Inundaciones y el legado siguen exigiendo los tres enums no nulos. La
geometría, las propiedades técnicas y los metadatos de exportación mantienen su validación.
La condición también se publica en OpenAPI mediante la unión y el patrón de categoría.

Los tres finales siguen siendo `ZodObject`: conservan `.shape`, `.strict()` y strip de extras.
Un fragmento Zod compartido valida la condición y genera sus metadatos `allOf`/`anyOf` en modo
input/inline, sin referencias a `$defs` inaccesibles. Se aplican check y metadatos después de
derivar las bases; `.safeExtend()` conserva checks, pero una derivación que vaya a serializarse
debe recibir los metadatos al finalizar (`derivado.meta(original.meta()!)`), porque Zod no los
hereda al cambiar la definición. No normaliza slugs ni comprueba actividad de categorías.
No se endurecen los campos aditivos de respuesta; su detalle sigue describiendo datos históricos.
Pruebas focales: `test/contrato-0-22.test.ts` y `test/contrato-0-23.test.ts`.

## Baches v1 — piloto M6 (ADR 0024)

`src/categorias/bache/` exporta cinco subtipos y el detalle estricto con dos enums obligatorios:
`gravedad_declarada` y `tamano`. El subtipo va fuera del detalle. API usa el esquema de la
definición para validar el detalle; la obligatoriedad/pertenencia del subtipo corresponde a M6.2.
No hay respuestas por defecto ni medidas de tamaño inventadas: plato, rueda, medio carril y
todo el carril son referencias visuales. Gravedad y tamaño son percepción ciudadana, no una
medición de pavimento ni una comprobación de accidente.

Severidad v1 guarda el índice auxiliar `g+t+2` (2–8), y la banda combinada con piso en la
gravedad declarada. Un mismo índice puede producir bandas distintas; no compararlo con
puntajes de Inundaciones. La matriz de 16 casos se comprueba en `test/bache-severidad.test.ts`.
Radio de recurrencia 10 m, distinto del radio del dispositivo (60 m); cupo desde CONFIG_DOMINIO.
El detalle tiene versión 1 y es público; CSV conserva categoría/subtipo/detalle JSON.
La definición no promete derivaciones municipales, no cambia roles/estados ni activa el catálogo.
Parámetros aprobados para piloto local, pendientes de validación municipal antes de producción.

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

**Qué está registrado (0.24.0):** las cuatro definiciones iniciales disponibles: Inundaciones
(v2, radio 25 m), Baches (v1, radio 10 m), Áreas verdes y Basura (v1, radio 10 m cada una).
Registro y catálogo son puertas distintas: esta entrega de contracts no consulta ni activa
ninguna base. Se conservan los modelos de Inundaciones y Baches sin cambios.

**Cómo se agrega una categoría:**

1. Creá `src/categorias/<slug>/esquema.ts` (el esquema Zod del detalle) y `definicion.ts` (la `DefinicionCategoria`), con el de Inundaciones como modelo. Los cuatro slugs iniciales ya tienen su alias y su forma de URL en `slugs.ts`.
2. Registrala en la lista que `categorias/index.ts` pasa a `crearRegistroCategorias` y exportá su esquema desde ese mismo archivo. La fábrica exige slugs únicos y no obliga a tocar el núcleo.
3. Para probar el mecanismo sin una categoría real, armá un registro propio con `crearRegistroCategorias([…])` y una definición sintética (el slug admite cualquier `string`); `test/contrato-0-19.test.ts` lo hace sin modificar `REGISTRO_CATEGORIAS`.
4. Agregá su prueba, subí la versión del paquete y anotá el cambio en `CHANGELOG.md`. Una geometría que no sea punto, o una categoría fuera de las cuatro iniciales, queda fuera del alcance cerrado (`CLAUDE.md` §3 y §15) y necesita aprobación y su propia ADR.

Que una categoría esté registrada no la activa: qué categorías están activas lo decide cada instalación, y las funciones de este paquete reciben esa lista (por ejemplo `activas` en `resolverCategoriaInicial`).

## Basura y Áreas verdes v1 — entrega local (0.24.0)

Las carpetas `src/categorias/basura/` y `src/categorias/area_verde/` exportan definición,
esquema/tipo del detalle, esquema/tipo y valores de los cinco subtipos, enums y cálculo de
severidad. Todas las exportaciones salen por el entrypoint habitual del paquete.
Los identificadores y etiquetas exactos están en sus esquemas/definiciones y corresponden
al §2 del plan aprobado `docs/sdd/2026-10-22-cuatro-categorias/plan.md`.

El detalle v1 es estricto: solo `{ gravedad_declarada, tamano }`, ambos obligatorios, sin
valores por defecto. El subtipo es obligatorio en el núcleo, fuera del detalle. Como en
Baches, el contrato HTTP conserva el núcleo genérico: API debe validar detalle y subtipo
por la definición antes de consumir cupo. No se agregan campos HTTP ni preguntas nuevas.
Las dos preguntas declarativas y los dos campos públicos/exportables coinciden con el esquema.

Cada modelo v1 usa g,t de 0 a 3: índice auxiliar g+t+2, banda combinada crítica desde 7,
alta desde 5, media desde 4, baja en otro caso; la banda final no baja de la gravedad
declarada. Cada matriz de 16 combinaciones tiene expectativas explícitas independientes.
No comparar índices entre categorías. Son referencias de percepción ciudadana, no mediciones.
Radio de recurrencia provisional 10 m, Point sin capa de parques, dispositivo 60 m sin cambios,
cupo desde CONFIG_DOMINIO por cuenta/categoría/día y fotos globales según las reglas existentes.

Los identificadores de formulario `basura/paso2` y `area_verde/paso2` permiten wrappers
declarativos de P1 para Quema y Persona, sin componentes React en contracts. Persona se conserva
con las mismas dos preguntas; su destino previsto es Desarrollo Social para ofrecer ayuda,
no seguridad; para los demás subtipos se prevé Parques y jardines. No existe envío municipal
automático. La nota de la definición pide no subir caras y documenta el comportamiento local:
no se garantiza ocultación/difuminado, se usan personas/fotos sintéticas en pruebas y quedan
pendientes visibilidad, fotos, moderación, retención y marco legal antes de producción.
Quema no sustituye atención de emergencias. Los avisos de selección/revisión/detalle pertenecen
a las tareas de interfaz; este paquete solo entrega datos y políticas.

Pruebas: `basura-severidad.test.ts`, `area-verde-severidad.test.ts`, `contrato-0-24.test.ts`.
OpenAPI se regenera sin editar YAML a mano; el núcleo HTTP genérico sigue intacto.
Las cuatro definiciones disponibles no acreditan cuatro categorías activas en una instalación.
