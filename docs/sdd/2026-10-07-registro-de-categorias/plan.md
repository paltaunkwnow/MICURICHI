# Plan de la corrida M1 — Registro de categorías y políticas en `contracts`

- **Fecha:** 2026-10-07.
- **Aprobado por el usuario:** «Apruebo las ADR y el plan M0 junto al plan M1, autorizo editar
  CLAUDE.md». Plan original en `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` §7.
- **Proceso:** CLAUDE.md §12.4 (no es un `/sdd` completo). Este plan, ya aprobado, hace de spec: sus
  metas son los criterios. Verificación SDD por subagentes: `sdd-verificador` (línea base y
  verificación), `sdd-revisor` y `sdd-auditor`.
- **ADR que aplica:** 0009 (registro), 0014–0017 (preferencia, URL, filtros, cupo), 0019 (`Point`),
  0021 (formularios) y 0022 (paleta), en `docs/decisiones/`.

## Clasificación (F0)

| Campo | Valor |
|---|---|
| Parte | **3** (custodia de `packages/contracts`) |
| Carpeta designada | **`packages/contracts/`** |
| No puede tocar | `services/*`, `apps/*`, `packages/db`, `pipelines/*`, `infra/*`, `e2e/*`, `scripts/*`, raíz, `CLAUDE.md`, `docs/*` (salvo esta carpeta de corrida, que la escribe el agente principal) |
| Banderas | **`base`**, **`contrato`** (ruta `packages/contracts/`), **`privacidad`** (palabra «público»: campos públicos), **`seguridad`** (palabra «cupo»). En la duda se activa (matriz) |
| Cambio de contrato | **Sí, anunciado.** Exportaciones nuevas y aditivas; **sin cambios de API**: el OpenAPI tiene que regenerarse idéntico |
| Rama | `feat/contracts/registro-de-categorias` (desde `main` = `3121a0f`) |
| Foto | `refs/sdd/registro-de-categorias` = `4f84ab5` (`git stash create`, incluye lo ajeno modificado) |
| Cambios ajenos | **Declarados y dejados** (decisión del usuario). Ninguno en `packages/contracts`. Detalle en `arbol-inicial.txt` |
| Ventana E2E (G1, de `contrato` y `privacidad`) | **No autorizada** → «no verificado: el usuario no autorizó la ventana E2E» |
| En vivo | No aplica (no hay bandera `ui`, `api` ni `infra`) |
| Base del usuario | `curichi` en la migración 0009 y el repo en la 0019 (conocido, no se toca) |

## Objetivo

Que `packages/contracts` tenga el **registro de categorías y las políticas** (preferencia y URL,
alcance de filtros, cupo) con **Inundaciones como única definición**, **sin cambiar ningún
comportamiento ni la API**.

## Criterios de aceptación (metas verificables)

### CA1 · Tipos

`src/categorias/tipos.ts` exporta los tipos:

- `SlugCategoria`;
- `DefinicionCategoria<D>`;
- `Pregunta` (y sus opciones);
- `FiltroDef`, con **`alcance: 'global' | 'categoria'`**;
- `ReglaCupo`, con `{ id; ambito: 'cuenta' | 'cuenta+categoria' | …extensible; ventana: 'dia_local' | 'hora'; limite }`;
- `geometria: 'punto'`;
- un campo opcional para registrar un **componente especial** del paso 2 (ADR 0021).

Lo comprueban `typecheck` y las pruebas que los usan.

### CA2 · Slugs y URL

`src/categorias/slugs.ts`:

- `SLUGS_CATEGORIA = ['inundacion', 'bache', 'area_verde', 'basura']`: canónicos, en el orden de
  presentación;
- forma pública de URL: `inundacion`, `bache`, `area-verde`, `basura`;
- `normalizarSlugCategoria(valor)`: acepta **alias** (plural, guiones o guiones bajos, mayúsculas,
  con o sin tildes: `baches`, `areas-verdes`, `Área-Verde`, `inundaciones`…) y devuelve el canónico o
  `null`;
- `slugParaUrl(slug)`.

Pruebas de tabla.

### CA3 · Categoría inicial

Función **pura** `resolverCategoriaInicial({ url, guardada, activas })` (ADR 0014 y 0015). Prioridad:

1. URL válida y activa;
2. guardada válida y activa;
3. `inundacion` si está activa;
4. la primera activa en el orden canónico.

Devuelve el slug efectivo, el **origen** y si la URL era inválida o inactiva. Con `activas` vacía,
devuelve un resultado explícito: nunca una categoría inactiva.

Pruebas de tabla que cubren cada rama.

### CA4 · Inundación como definición

`src/categorias/inundacion/definicion.ts` (ADR 0009). Lleva:

- **textos:** los de la interfaz actual (p. ej. «¿Dónde se junta el agua?»);
- **icono:** `'Waves'` (cadena);
- **colores:** los *tokens* `agua-*` existentes (`c1 #E3EEF5`, `c5 #0D6189`, `c7 #0A4A69`);
- **esquema de detalle** con los campos de dominio actuales (`profundidad_estimada`, `frecuencia`,
  `causa_presunta`, `sumidero_cercano`, `sumidero_estado`, `agua_brota_sumidero`) y **sus mismas
  reglas** (incluida la del sumidero), **derivado** de los esquemas existentes, sin duplicar listas;
- **severidad:** la v2 actual **reexportada** desde `dominio/severidad.ts`, sin moverla ni cambiarla,
  con `version: 2`;
- **filtros de categoría:** al menos `severidad`, con `alcance 'categoria'`;
- **radio de recurrencia:** referencia a `CONFIG_DOMINIO.RECURRENCIA_RADIO_M`, sin un `25` literal;
- **regla de cupo:** `cuenta+categoria`, `dia_local`, con el límite **leído** de
  `CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA`, sin un `3` literal;
- **campos públicos y de exportación:** **iguales** a los que hoy exponen la vista pública y la
  exportación (contrastar con `esquemas/reporte.ts` y con `services/api-core/src/rutas/admin.ts`,
  solo lectura);
- **nota metodológica:** la existente;
- `geometria: 'punto'`.

### CA5 · Registro

`src/categorias/index.ts`:

- registro con **solo** inundación;
- búsqueda por slug;
- una **fábrica pura** que arma un registro a partir de una lista de definiciones, para que una
  categoría sintética de prueba se registre **sin tocar el núcleo**.

Las exportaciones nuevas salen por `src/index.ts`. Ninguna exportación existente cambia.

### CA6 · Pruebas de invariantes

En `test/`, siguiendo la convención `contrato-0-NN.test.ts` u otra que el paquete ya use:

- slugs únicos y en `snake_case`;
- `camposPublicos ⊆ claves del esquema de detalle`;
- cada filtro de categoría apunta a un campo real;
- **contraste WCAG** de los colores de cada definición: `c7` contra blanco ≥ 4,5 y `c7` contra el
  fondo del mapa `#EEF2EF` ≥ 3, calculado en la prueba;
- **equivalencia**: para un conjunto de cargas válidas e inválidas, el esquema de detalle de
  inundación acepta y rechaza lo mismo que `ReporteCrearSchema` en esos campos;
- el límite de la regla de cupo es igual a `CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA`;
- una **categoría sintética** (definida en la prueba) se registra con la fábrica y se resuelve, sin
  tocar código del núcleo.

La comprobación de que el nombre del icono existe en `lucide-react` **pasa a M4**: `contracts` no
depende de `lucide-react`.

### CA7 · Sin cambio de comportamiento

- `ReporteCrearSchema` y todas las exportaciones existentes, sin cambios.
- **OpenAPI regenerado idéntico** (comando `cmp` de la bandera `contrato`).
- `typecheck` y `test` de **todos los consumidores** (`--filter=...contracts`) iguales a la línea
  base.
- `pnpm lint` (Biome) en verde.

### CA8 · Versión y documentación (M1.4)

- `packages/contracts/package.json` en **0.19.0**.
- Entrada **0.19.0** en `CHANGELOG.md`: «registro de categorías y políticas; sin cambios de API ni
  de OpenAPI».
- Sección en el `README.md` del paquete.
- `dist/dominio.json` regenerado por el build, sin cambios manuales.

## Tareas y reparto (§12.4)

| Tarea | Agente | Nivel | Criterios |
|---|---|---|---|
| M1.1–M1.3 | `trabajador-raiz` (Opus 4.8, sin pasar `model`). **Único escritor** en `packages/contracts` | Raíz | CA1–CA7 |
| M1.4 | `general-purpose` con `model: 'sonnet'`, **después** de M1.1–M1.3 (un escritor por vez) | Estándar | CA8 |
| Verificación | `sdd-verificador` (línea base, antes de tocar, y verificación, después); `sdd-revisor` contra este plan; `sdd-auditor` (banderas `privacidad` y `seguridad`) | — | Regresión = bloqueante |

Ningún subagente commitea. El commit, solo con el «aprobado» del usuario en la puerta 2.

## Fuera de esta corrida

| Qué | Fase |
|---|---|
| Base de datos, cupo por categoría en la API, `/auth/yo` y `/configuracion` | M2 y M3 |
| Preferencia local, selector y URL en la web | M4 |
| Definiciones de Baches, Basura y Áreas verdes | M6–M8 |
| Cupo de fotos, D3, `fusionado_en_id` | Siguen abiertos (CLAUDE.md §16, fila 7) |
