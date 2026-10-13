# Implementación — Registro de categorías y políticas en `contracts`

Transcripción, hecha por el agente principal, de los informes de los dos implementadores. Las salidas
son las que pegaron ellos; la verificación independiente es la de `verificacion.md` (F4a).

| Tarea | Agente | Criterios | Archivos |
|---|---|---|---|
| M1.1–M1.3 | `trabajador-raiz` (Opus 4.8) | CA1–CA7 | `src/index.ts` (+1 línea), `src/categorias/{tipos,slugs,resolver,index}.ts`, `src/categorias/inundacion/{esquema,definicion}.ts`, `test/contrato-0-19.test.ts` |
| M1.4 | `general-purpose` (Sonnet) | CA8 | `package.json`, `CHANGELOG.md`, `README.md`, `test/contrato-0-16.test.ts` (líneas 101 y 106) |

Lista completa en `archivos.txt`.

## Preflight (antes de tocar, M1.1–M1.3)

- `npx -y pnpm@12.4.1 --filter contracts exec vitest run` → 17 files / 237 tests passed.
- `npx -y pnpm@12.4.1 --filter contracts typecheck` → exit 0.
- Copia de `openapi/openapi.yaml` (179 349 bytes) al scratchpad.
- RAM libre al inicio: 3926 MB. `git status -- packages/contracts`: limpio.

## Por criterio

| CA | Qué y dónde | Prueba |
|---|---|---|
| CA1 | `src/categorias/tipos.ts`: `DefinicionCategoria<D, S extends string = SlugCategoria>`, `Pregunta`, `OpcionPregunta`, `TipoPregunta`, `FiltroDef` (`alcance: 'global' \| 'categoria'`), `ReglaCupo` (`ambito: 'cuenta' \| 'cuenta+categoria' \| (string & {})`, `ventana: 'dia_local' \| 'hora'`), `GeometriaCategoria = 'punto'`, `componenteEspecialPaso2?: string` | `typecheck` y usos en `contrato-0-19` |
| CA2 | `src/categorias/slugs.ts`: `SLUGS_CATEGORIA`, `normalizarSlugCategoria(valor: unknown)` (compacta sin tildes, separadores ni mayúsculas, con alias en plural), `slugParaUrl` | `contrato-0-19` «CA2» |
| CA3 | `src/categorias/resolver.ts`: `resolverCategoriaInicial` → `{ slug, origen, urlInvalida, urlInactiva }`; `activas` vacía → `{ slug: null, origen: 'ninguna' }` | `contrato-0-19` «CA3» (una rama por caso + invariante) |
| CA4 | `src/categorias/inundacion/esquema.ts` (6 campos de `ReporteCrearSchema.shape` + regla del sumidero **reescrita**) y `definicion.ts` (`DEFINICION_INUNDACION`: textos, `'Waves'`, colores, severidad v2 reexportada, filtro `severidad` de categoría, radio y cupo desde `CONFIG_DOMINIO`, `camposPublicos`, `camposExportacion`, `NOTA_METODOLOGICA`, `'punto'`) | `contrato-0-19` «CA4» |
| CA5 | `src/categorias/index.ts`: `REGISTRO_CATEGORIAS` (solo inundación), `crearRegistroCategorias` (valida slugs únicos), `DefinicionCategoriaCualquiera`; `src/index.ts` reexporta | `contrato-0-19` «CA5» |
| CA6 | `test/contrato-0-19.test.ts` (28 pruebas): slugs, `camposPublicos ⊆` detalle, filtros a campos reales, contraste WCAG calculado (c7/blanco ≈ 9,6; c7/`#EEF2EF` ≈ 8,5), equivalencia con `ReporteCrearSchema`, cupo = CONFIG, categoría sintética | la propia suite |
| CA7 | Nada existente cambia; OpenAPI byte-idéntico | `cmp` exit 0; `turbo run typecheck --filter=...contracts --concurrency=1` exit 0; `biome check packages/contracts` exit 0 |
| CA8 | `package.json` 0.19.0; entrada `## 0.19.0 — 2026-10-07` en el CHANGELOG; sección «Categorías (registro y políticas)» en el README; `test/contrato-0-16.test.ts` fija 0.19.0 (convención de cada subida, como en 3121a0f y 7369132) | `contrato-0-16`; `dist/dominio.json` igual tras el build (`diff` exit 0) |

## Después (salidas pegadas por los implementadores)

- `… --filter contracts exec vitest run` → **18 files / 265 tests passed**, exit 0.
- `… --filter contracts build` → exit 0; `cmp openapi.antes.yaml openapi.yaml` → **exit 0**.
- `diff dist/dominio.json` contra la copia → **exit 0** (el archivo no lleva la versión del paquete).
- `turbo run typecheck --filter=...contracts --concurrency=1` → 9 successful, exit 0.
- `biome check packages/contracts` → «Checked 42 files … No fixes applied.», exit 0.

## Decisiones técnicas de los implementadores

1. **Regla del sumidero reescrita** en `DetalleInundacionSchema`: Zod 4.6 no permite `.pick()` sobre un objeto
   con `superRefine`, y la regla está embebida en `ReporteCrearSchema` (no exportada). Los enums se toman de
   `.shape` (sin duplicar listas); la prueba de equivalencia ata las dos reglas.
2. **Segundo genérico** `S` en `DefinicionCategoria` (por defecto `SlugCategoria`), para registrar la sintética sin `as`.
3. **Un `any`** comentado con `biome-ignore` en `DefinicionCategoriaCualquiera` (tipo existencial del registro).
4. `camposPublicos` = `profundidad_estimada`, `frecuencia`, `causa_presunta` (los de dominio de `ReportePublicoSchema`);
   `camposExportacion` = los 6 de dominio del CSV de `services/api-core/src/rutas/admin.ts`.
5. Metadatos nuevos sin efecto hoy: `detalleVersion: 1`, `ubicacionTipoPorDefecto: 'via_publica'`, `verbo`,
   `componenteEspecialPaso2: 'inundacion/paso2'`.
6. Etiqueta literal `'Severidad'` del filtro (no hay rótulo de campo en `ETIQUETAS`).
7. **Alcance ampliado por el agente principal** a `test/contrato-0-16.test.ts` (líneas 101 y 106), dentro de CA8.

## Observaciones del agente principal para la revisión

- Algunos textos de las preguntas son literales (`'Frecuencia'`, `'¿Por qué creés que pasa?'`,
  `'El agua brota del sumidero cuando llueve'`, la ayuda de profundidad): confirmar que son los de la web actual.
- `resolverCategoriaInicial` no mira `v` de la preferencia guardada (ADR 0014 la define como `{v:1, slug}`).
- Confirmar `camposPublicos` contra la vista pública real (`ReportePublicoSchema` y la ruta pública de api-core).

Fuera de la carpeta: ningún defecto informado.
