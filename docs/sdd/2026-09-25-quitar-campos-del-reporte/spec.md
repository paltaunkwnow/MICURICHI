# Spec — Quitar manzana, dirección aproximada, duración y afectación del reporte

- **Corrida:** `docs/sdd/2026-09-25-quitar-campos-del-reporte/`
- **Rama:** `feat/repo/quitar-campos-del-reporte`
- **Parte:** transversal (P1–P5), UNA corrida por decisión de F0 · **Carpetas designadas:** `packages/contracts` (primero, cambio de contrato anunciado) → en paralelo `packages/db`, `services/api-core`, `apps/web-ciudadano`, `apps/panel-admin`, `e2e`, raíz (`CLAUDE.md` §7.1 y §9.1, `README.md`, `scripts/banco-*.mjs`). `services/geo-service` y `pipelines/geodata-etl` **no se tocan** (solo regresión).
- **Banderas:** `base`, `contrato`, `privacidad`, `datos`, `geo`, `ui` (confirmadas; no se añade ninguna)
- **Cambio de contrato:** sí, **con ruptura** (ver §3)
- **Estado:** borrador — decisiones D1–D4 tomadas por el usuario el 2026-09-25 (transmitidas por el agente principal); queda **una pregunta BLOQUEANTE** (§8, P-1) solo para `packages/db` y `apps/panel-admin`

## 1. Objetivo

Que el reporte de inundación deje de tener `manzana_id`, `direccion_aprox`, `duracion_estimada` y `afectacion` en todo el sistema (contrato, base, API, apps, E2E, scripts), con la severidad recalculada por una fórmula v2 que solo usa tirante y frecuencia.

## 2. Alcance y fuera de alcance

**Decisiones tomadas por el usuario (2026-09-25):**

- **D1 · Severidad v2:** `puntaje = 2·T + F`, rango 3–12; bandas 3–4 `baja`, 5–7 `media`, 8–10 `alta`, 11–12 `critica`; se conservan E1 (T = 4 → `critica`) y E3 (F = 4 → mínimo `media`); **E2 desaparece**. `severidad_version = 2` (la columna ya existe: `packages/db/migraciones/0001_inicial.sql:158`, `integer NOT NULL DEFAULT 1`; api-core ya la escribe en `rutas/reportes.ts:186`). El usuario **autoriza** editar `CLAUDE.md` §7.1 y §9.1.
- **D2 · Manzana:** se quita **solo del reporte y de las vistas** (`manzana_id` en contracts, db, api-core) y **del dibujo** en los mapas de las dos apps. Se conservan `geo.manzana`, `geo.manzana_vigente`, sus privilegios (`0008`), el ETL, las teselas y `TIPOS_CAPA`. **Opción elegida por ser la menos invasiva:** `geo-service` y `ResolverRespuestaSchema` **no cambian** (siguen devolviendo `manzana` en `/geo/v1/resolver`); es `api-core` quien deja de guardarla (`rutas/reportes.ts:199`, `geo.manzana?.id`). Así el único contrato roto es el del reporte y `geo-service` queda fuera de la corrida. Esto difiere de la nota «decisión mínima» de `inventario.md` para geo-service: prevalece esta spec.
- **D3 · Base de datos:** migración nueva `packages/db/migraciones/0010_*.sql` con `DROP COLUMN` de `direccion_aprox`, `duracion_estimada`, `afectacion`, `manzana_id` en `reporte_inundacion`, y `DROP TYPE duracion_estimada` / `DROP TYPE afectacion` (tipos creados en `0001:9,11`, solo los usa esa tabla; ninguna vista depende de esas columnas). `0001`–`0009` intactas. El seed se regenera.
- **D4 · Scripts de banco de la raíz:** entran en la corrida (Parte 5).

**Dentro:**

- `packages/contracts`: enums, etiquetas, `severidad.ts`, esquemas de reporte, OpenAPI y `dominio.json` regenerados, `CHANGELOG.md`, tests.
- `packages/db`: migración `0010_*`, esquema Drizzle, seeds, `test-utils.ts`, `banco-puntos-criticos.ts`, tests.
- `services/api-core`: `vistas.ts`, `rutas/reportes.ts`, `rutas/admin.ts` (exportación), tests.
- `apps/web-ciudadano`: `FormularioReporte`, `HojaDetalle`, `VistaMapa`, `SeguimientoReporte`, `MisReportes`, `ComoFunciona`, `Mapa.tsx` (capa manzana), `lib/formato.ts` y tests.
- `apps/panel-admin`: detalle `reportes/[id]/page.tsx`, `FactoresSeveridad`, `lib/formato.ts`, `Mapa.tsx` (capa manzana).
- `e2e`: `ayudas.ts`, `recorrido-completo`, `resiliencia-interfaz`, `navegacion`.
- Raíz: `CLAUDE.md` §7.1 y §9.1 (autorizado), `README.md:89`, `scripts/banco-datos.mjs`, `banco-consultas.mjs`, `banco-concurrencia.mjs`.

**Fuera:**

- **El dato «En el mapa público se ve»** del detalle del panel técnico (`apps/panel-admin/src/app/(panel)/reportes/[id]/page.tsx:154`): **fuera de alcance: se conserva por decisión del usuario.** Ningún criterio lo elimina; es invariante (§5).
- La capa `manzana` como dato geográfico: ETL (`pipelines/geodata-etl`), tablas `geo.manzana*`, teselas `/geo/v1/teselas/manzana/…`, `e2e/tests/datos-reales.spec.ts:222–244`, `e2e/tests/api-contratos.spec.ts:99`, `scripts/banco-carga.mjs:65–66`, `scripts/banco-sostenido.mjs:51`, `.env.example` (`UMBRAL_TESELAS_BYTES`), `docker-compose.yml`, `apps/panel-admin/src/app/(panel)/plano/page.tsx:117` (texto que describe la entrega).
- `services/geo-service` completo (ver D2).
- Resto de campos del reporte (`tirante_estimado`, `frecuencia`, `causa_presunta`, sumidero, `ubicacion_tipo`, fotos…).
- Secciones de `CLAUDE.md` distintas de §7.1 y §9.1 y los documentos de `docs/` que mencionan los campos (ver §8, P-2 y P-6).

## 3. Cambios de contrato (`packages/contracts`)

| Esquema / enum / campo | Cambio | ¿Ruptura? | Consumidores afectados |
|---|---|---|---|
| `ReporteCrearSchema.duracion_estimada` | se quita | **sí** (quien la envíe: `z.object` la descarta al validar; quien la use del tipo deja de compilar) | web-ciudadano, e2e, api-core, db (seed), scripts |
| `ReporteCrearSchema.afectacion` | se quita | **sí** | ídem |
| `ReportePublicoSchema` (y por herencia `ReporteTecnicoSchema`, `ReporteFeatureSchema`, `ReporteFeatureCollectionSchema`): `manzana_id`, `direccion_aprox`, `duracion_estimada`, `afectacion` | se quitan | **sí** | api-core, web-ciudadano, panel-admin, e2e |
| `DURACIONES`, `type Duracion`, `AFECTACIONES`, `type Afectacion` (`dominio/enums.ts`) | se quitan | **sí** | severidad, esquemas, apps (`formato.ts`) |
| `ETIQUETAS.duracion`, `ETIQUETAS.afectacion` | se quitan | **sí** | apps (`formato.ts`, `FormularioReporte`, detalle) |
| `EntradaSeveridad` | queda `{ tirante_estimado, frecuencia }` | **sí** | api-core, db (seed, banco), apps |
| `PUNTOS` | quedan `tirante` y `frecuencia` | **sí** | panel-admin (`FactoresSeveridad`), `scripts/generar.ts` |
| `PESOS` | `{ tirante: 2, frecuencia: 1 }` | **sí** | ídem |
| `BANDAS` | 3–4 / 5–7 / 8–10 / 11–12 | **sí** (valores) | ídem |
| `SEVERIDAD_VERSION` | `1` → `2` | **sí** (valores) | api-core, db |
| `openapi/openapi.yaml`, `dist/dominio.json` | regenerados con `pnpm contracts:build` | **sí** (derivados) | `/docs` de api-core, ETL (no usa severidad) |
| `ResolverRespuestaSchema.manzana` | **sin cambio** (D2) | no | — |
| `TIPOS_CAPA` (`manzana`), `ETIQUETAS.tipo_capa.manzana`, `CapasVigentesSchema`, `CapaInfoSchema` | **sin cambio** | no | — |
| `CHANGELOG.md` | nueva entrada `0.4.0 — 2026-09-25` marcada «con ruptura» | — | — |

## 4. Criterios de aceptación

Nomenclatura: `CA-C` contracts · `CA-D` db · `CA-A` api-core · `CA-G` geo-service · `CA-E` geodata-etl · `CA-W` web-ciudadano · `CA-P` panel-admin · `CA-X` e2e · `CA-R` raíz. **«Los cuatro campos»** = `manzana_id`, `direccion_aprox`, `duracion_estimada`, `afectacion`.

Orden de implementación: `CA-C*` primero (contracts listo y `pnpm contracts:build` hecho); después, en paralelo, un implementador por carpeta con solo sus criterios.

### CA · contracts

#### CA-C1 — El payload de creación ya no pide duración ni afectación
- **Dado** un payload con `lat`, `lon`, `ubicacion_metodo`, `ubicacion_tipo`, `descripcion` (≥ 10 caracteres), `tirante_estimado` y `frecuencia`, sin `duracion_estimada` ni `afectacion`
- **Cuando** se valida con `ReporteCrearSchema.safeParse`
- **Entonces** `success === true`; y `Object.keys(ReporteCrearSchema.shape)` no contiene ninguno de los cuatro campos
- **Capa de prueba:** contracts

#### CA-C2 — Un payload viejo se acepta y las claves quitadas se descartan
- **Dado** el mismo payload más `duracion_estimada: '2h_12h'`, `afectacion: 'vehicular'`, `direccion_aprox: 'x'`, `manzana_id: 'manzana:1'`
- **Cuando** se valida con `ReporteCrearSchema.parse`
- **Entonces** no lanza, y el objeto resultante no tiene ninguna de esas cuatro claves (`'duracion_estimada' in r === false`, etc.)
- **Capa de prueba:** contracts

#### CA-C3 — Las vistas de reporte no declaran los cuatro campos
- **Dado** `ReportePublicoSchema` y `ReporteTecnicoSchema`
- **Cuando** se leen sus `shape`
- **Entonces** ninguno contiene los cuatro campos; y un objeto válido de la vista técnica al que se le añade `manzana_id` pasa `parse` y sale sin esa clave
- **Capa de prueba:** contracts

#### CA-C4 — Enums y etiquetas quitados; la capa manzana se conserva
- **Dado** el módulo `contracts`
- **Cuando** se importa
- **Entonces** no exporta `DURACIONES` ni `AFECTACIONES`; `ETIQUETAS` no tiene claves `duracion` ni `afectacion`; `TIPOS_CAPA` sigue siendo `['distrito_municipal', 'unidad_vecinal', 'manzana']`; `ResolverRespuestaSchema.shape.manzana` sigue existiendo
- **Capa de prueba:** contracts

#### CA-C5 — Severidad v2: tabla completa de las 16 combinaciones
- **Dado** cada combinación de `tirante_estimado` (T = 1..4) y `frecuencia` (F = 1..4)
- **Cuando** se llama `calcularSeveridad({ tirante_estimado, frecuencia })`
- **Entonces** devuelve exactamente (todas con `version: 2`):

| T | F | puntaje | banda_base | reglas | banda |
|---|---|---|---|---|---|
| 1 tobillo | 1 primera_vez | 3 | baja | [] | baja |
| 1 | 2 ocasional | 4 | baja | [] | baja |
| 1 | 3 cada_lluvia_fuerte | 5 | media | [] | media |
| 1 | 4 permanente | 6 | media | [] | media |
| 2 rodilla | 1 | 5 | media | [] | media |
| 2 | 2 | 6 | media | [] | media |
| 2 | 3 | 7 | media | [] | media |
| 2 | 4 | 8 | alta | [] | alta |
| 3 muslo | 1 | 7 | media | [] | media |
| 3 | 2 | 8 | alta | [] | alta |
| 3 | 3 | 9 | alta | [] | alta |
| 3 | 4 | 10 | alta | [] | alta |
| 4 mas_70 | 1 | 9 | alta | ['E1'] | critica |
| 4 | 2 | 10 | alta | ['E1'] | critica |
| 4 | 3 | 11 | critica | ['E1'] | critica |
| 4 | 4 | 12 | critica | ['E1'] | critica |

  E1 se anota siempre que T = 4, como hace hoy `severidad.ts:72–75`.
- **Capa de prueba:** contracts

#### CA-C6 — Parámetros exportados de la severidad v2
- **Dado** el módulo `dominio/severidad.ts`
- **Cuando** se leen sus constantes
- **Entonces** `SEVERIDAD_VERSION === 2`; `PESOS` es `{ tirante: 2, frecuencia: 1 }`; `Object.keys(PUNTOS)` es `['tirante', 'frecuencia']`; `BANDAS` es `baja 3–4, media 5–7, alta 8–10, critica 11–12`, contiguas y cubriendo 3..12 sin huecos
- **Capa de prueba:** contracts

#### CA-C7 — E2 no existe; E3 se conserva como guarda
- **Dado** las 16 combinaciones de CA-C5
- **Cuando** se calcula la severidad
- **Entonces** ninguna devuelve `'E2'` en `reglas`; ninguna devuelve `'E3'` (con las bandas de D1, F = 4 da puntaje ≥ 6, ya `media`); `banda === 'critica'` si y solo si T = 4; y `banda` nunca es menor que `banda_base`
- **Capa de prueba:** contracts

#### CA-C8 — La severidad sigue siendo función pura
- **Dado** una entrada congelada con `Object.freeze`
- **Cuando** se llama `calcularSeveridad` dos veces con ella
- **Entonces** no lanza por mutación y los dos resultados son `toStrictEqual`
- **Capa de prueba:** contracts

#### CA-C9 — Artefactos derivados regenerados, no editados a mano
- **Dado** el código de contracts ya cambiado
- **Cuando** se ejecuta `pnpm contracts:build`
- **Entonces** `git status --porcelain packages/contracts/openapi` queda vacío (el `openapi.yaml` commiteado es el generado); `grep -c` de cada uno de los cuatro campos en `openapi.yaml` da 0; `dist/dominio.json` tiene `severidad.version === 2` y `severidad.pesos` sin `duracion` ni `afectacion`; `manzana` sigue en el enum de capa del OpenAPI
- **Capa de prueba:** contracts (comando)

#### CA-C10 — CHANGELOG
- **Dado** `packages/contracts/CHANGELOG.md`
- **Cuando** se lee su primera entrada
- **Entonces** es `0.4.0 — 2026-09-25`, dice «con ruptura» y nombra los cuatro campos, los enums quitados y la severidad v2 (fórmula, bandas, E2 eliminada)
- **Capa de prueba:** comando (`grep`)

### CA · db

#### CA-D1 — Migración 0010 quita las cuatro columnas y los dos tipos
- **Dado** un PostGIS vacío (PGlite en tests)
- **Cuando** se aplican todas las migraciones
- **Entonces** existe un archivo nuevo `packages/db/migraciones/0010_*.sql`; `information_schema.columns` de `public.reporte_inundacion` no tiene ninguno de los cuatro campos y sí tiene `tirante_estimado`, `frecuencia`, `severidad_version`; `pg_type` no tiene `duracion_estimada` ni `afectacion`
- **Capa de prueba:** integración PGlite

#### CA-D2 — Migraciones anteriores intactas e idempotencia
- **Dado** la rama frente a `main`
- **Cuando** se ejecuta `git diff --name-only main...HEAD -- packages/db/migraciones`
- **Entonces** el único archivo listado es el `0010_*.sql` nuevo; y volver a migrar después de aplicar 0010 no aplica nada (test existente de `db.test.ts` «es idempotente: volver a migrar no aplica nada»)
- **Capa de prueba:** integración PGlite + comando

#### CA-D3 — La migración conserva el resto del reporte
- **Dado** una base con 0001–0009 aplicadas y N ≥ 3 reportes con los cuatro campos rellenos
- **Cuando** se aplica 0010
- **Entonces** siguen existiendo N filas con los mismos `id`, `geom`, `geom_publico`, `tirante_estimado`, `frecuencia`, `estado`, `severidad_manual`, `autor_id`
- **Capa de prueba:** integración PGlite

#### CA-D4 — Severidad de los reportes existentes (depende de P-1, BLOQUEANTE)
- **Dado** los N reportes de CA-D3 con `severidad_version = 1`, cubriendo las 16 combinaciones de T × F
- **Cuando** se aplica 0010
- **Entonces**
  - **si opción A (recomendada):** todas las filas tienen `severidad_version = 2` y `(severidad_calculada, severidad_puntaje)` igual a `calcularSeveridad({ tirante_estimado, frecuencia })` de contracts; `severidad_manual` y `severidad_motivo` no cambian;
  - **si opción B:** las filas conservan `severidad_version = 1` y sus valores de severidad sin cambios.
- **Capa de prueba:** integración PGlite

#### CA-D5 — Esquema Drizzle y capa manzana
- **Dado** `packages/db/src/esquema/index.ts`
- **Cuando** se ejecuta `pnpm --filter db typecheck` y se migra
- **Entonces** la tabla `reporteInundacion` no tiene propiedades para los cuatro campos; la tabla `manzana` (esquema `geo`) sigue exportada; `geo.manzana` y `geo.manzana_vigente` existen; `src/cli/verificar-privilegios.mjs` sigue exigiendo `SELECT` sobre `geo.manzana`
- **Capa de prueba:** unitaria (typecheck) + integración PGlite

#### CA-D6 — Seed sintético regenerado
- **Dado** una base migrada
- **Cuando** se ejecuta `pnpm db:seed:samples`
- **Entonces** termina con código 0; todos los reportes tienen `severidad_version = 2` y severidad igual a `calcularSeveridad` v2; `SELECT count(*) FROM geo.manzana` > 0 (la capa se sigue cargando)
- **Capa de prueba:** integración PGlite

#### CA-D7 — Utilidades y banco internos sin los campos
- **Dado** `src/test-utils.ts`, `banco-puntos-criticos.ts`, `test/puntos-criticos-entorno.test.ts`, `src/seeds/samples.ts`
- **Cuando** se ejecutan `pnpm --filter db typecheck` y `pnpm --filter db test`
- **Entonces** ambos pasan y `grep -rn "duracion_estimada\|afectacion\|direccion_aprox\|manzana_id"` sobre `packages/db/src`, `packages/db/test` y `packages/db/banco-puntos-criticos.ts` no encuentra código (como mucho, comentarios que expliquen el cambio)
- **Capa de prueba:** unitaria + integración PGlite

### CA · api-core

#### CA-A1 — Camino crítico con el payload nuevo
- **Dado** un geo-service de prueba que resuelve UV y distrito
- **Cuando** se hace `POST /api/v1/reportes` con sesión ciudadana y un payload sin duración ni afectación
- **Entonces** responde 201; la fila tiene `estado = 'nuevo'`, `unidad_vecinal_id` resuelto, `severidad_version = 2` y `severidad_calculada` / `severidad_puntaje` iguales a `calcularSeveridad` v2
- **Capa de prueba:** integración PGlite

#### CA-A2 — Un cliente viejo (PWA en caché) no rompe la creación
- **Dado** el payload de CA-A1 más los cuatro campos
- **Cuando** se envía a `POST /api/v1/reportes`
- **Entonces** responde 201 (no 400 ni 500) y ni la respuesta ni la vista técnica del reporte contienen esas claves
- **Capa de prueba:** integración PGlite

#### CA-A3 — La manzana que devuelve geo-service no se guarda ni se publica
- **Dado** un geo-service de prueba cuya respuesta trae `manzana: { id: 'manzana:A-1', codigo: 'A-1' }`
- **Cuando** se crea un reporte en `via_publica`, se valida y se consulta por la ruta pública, la técnica y `GET /api/v1/exportar` (csv y geojson)
- **Entonces** ninguna respuesta contiene la clave `manzana_id` ni el texto `manzana:A-1`
- **Capa de prueba:** integración PGlite

#### CA-A4 — Vistas pública y técnica sin los cuatro campos
- **Dado** un reporte validado en `vivienda_o_predio` y otro en `via_publica`
- **Cuando** se piden `GET /api/v1/reportes`, `GET /api/v1/reportes/:id` (público) y sus equivalentes técnicos
- **Entonces** `properties` no tiene ninguno de los cuatro campos en ninguna respuesta; las públicas pasan `ReportePublicoSchema.strict()` y las técnicas `ReporteTecnicoSchema.strict()` (sin claves sobrantes ni faltantes); la de vivienda sigue con `precision_degradada = true` y coordenada distinta de la exacta
- **Capa de prueba:** integración PGlite

#### CA-A5 — Exportación sin las columnas
- **Dado** un técnico con sesión
- **Cuando** pide `GET /api/v1/exportar?formato=csv` y `?formato=geojson`
- **Entonces** el encabezado del CSV no contiene ninguno de los cuatro nombres; las `properties` del GeoJSON tampoco; ambas conservan la nota metodológica
- **Capa de prueba:** integración PGlite

#### CA-A6 — Tests de privacidad adaptados, no borrados
- **Dado** `test/privacidad-ubicacion.test.ts` y `test/seguridad.test.ts`
- **Cuando** se ejecuta `pnpm --filter api-core test`
- **Entonces** el bloque «la manzana no se publica junto a una coordenada desplazada» queda sustituido por una aserción de que **ni** la vista pública **ni** la técnica traen `manzana_id`; «desplaza la vivienda y oculta la dirección» sigue comprobando el desplazamiento; los bloques «el bbox público no puede usarse como oráculo…» y «el punto crítico no publica la coordenada exacta…» siguen presentes, sin cambios de aserción, y en verde
- **Capa de prueba:** integración PGlite

### CA · geo-service

#### CA-G1 — Sin cambios y sin regresión
- **Dado** la rama
- **Cuando** se ejecutan `git diff --name-only main...HEAD -- services/geo-service` y `pnpm --filter geo-service test`
- **Entonces** el diff está vacío y la suite pasa entera, incluidos «punto interior → UV y distrito correctos», «borde → en_limite», «hueco → proximidad», «fuera de cobertura» y «punto dentro de la manzana la informa»
- **Capa de prueba:** integración PGlite + comando

### CA · geodata-etl

#### CA-E1 — Sin cambios y sin regresión
- **Dado** la rama
- **Cuando** se ejecutan `git diff --name-only main...HEAD -- pipelines/geodata-etl` y `pnpm etl:test`
- **Entonces** el diff está vacío y los tests pasan (la capa `manzana` se sigue procesando)
- **Capa de prueba:** unitaria + comando

### CA · web-ciudadano

#### CA-W1 — El formulario no pregunta duración ni afectación
- **Dado** el formulario de reporte abierto
- **Cuando** se recorre de principio a fin
- **Entonces** no existe ningún `input[name="duracion_estimada"]` ni `input[name="afectacion"]`; siguen los de `tirante_estimado` y `frecuencia`; el resumen final muestra tirante y frecuencia y no muestra «Duración» ni «Afectación»
- **Capa de prueba:** E2E

#### CA-W2 — Pasos coherentes
- **Dado** el formulario
- **Cuando** se avanza paso a paso
- **Entonces** el texto «Paso N de M» usa el mismo M en todos los pasos, M es igual al número de pasos recorribles, y todo paso tiene al menos un control (el número lo fija P-4; el criterio vale para 4 o 5)
- **Capa de prueba:** E2E

#### CA-W3 — El payload enviado no lleva los campos
- **Dado** un reporte completado en el navegador
- **Cuando** se intercepta la petición `POST /api/v1/reportes`
- **Entonces** el cuerpo JSON no tiene ninguno de los cuatro campos
- **Capa de prueba:** E2E

#### CA-W4 — Borrador guardado antes del cambio
- **Dado** un borrador en almacenamiento local con `duracion_estimada` y `afectacion`
- **Cuando** se restaura con `lib/borrador.ts`
- **Entonces** no lanza y los valores restaurados no contienen esas dos claves
- **Capa de prueba:** unitaria (`borrador.test.ts`)

#### CA-W5 — Título sin dirección aproximada
- **Dado** un reporte con `unidad_vecinal.nombre = 'Los Lotes'` y otro con `unidad_vecinal = null`
- **Cuando** se llama `tituloReporte`
- **Entonces** devuelve `'Los Lotes'` y `'Unidad vecinal sin datos'`; `lib/formato.ts` no exporta `etiquetaDuracion` ni `etiquetaAfectacion`; `VistaMapa`, `SeguimientoReporte`, `MisReportes` y `FormularioReporte` compilan sin leer `direccion_aprox` (`pnpm --filter web-ciudadano typecheck`)
- **Capa de prueba:** unitaria (`formato.test.ts`) + typecheck

#### CA-W6 — Hoja de detalle
- **Dado** un reporte publicado
- **Cuando** se abre su hoja de detalle en el mapa
- **Entonces** muestra tirante y frecuencia, y no muestra las etiquetas «Duración» ni «Afectación»
- **Capa de prueba:** E2E

#### CA-W7 — El mapa público no dibuja la capa de manzanas
- **Dado** `GET /geo/v1/capas` que sigue listando `manzana`
- **Cuando** se carga el mapa y se acerca hasta zoom ≥ 15
- **Entonces** no existe ninguna capa MapLibre cuyo id empiece por `capa-manzana` ni la fuente `capa-manzana`; no se hace ninguna petición a `/geo/v1/teselas/manzana/`; `capa-distrito_municipal` y `capa-unidad_vecinal` siguen presentes
- **Capa de prueba:** E2E

#### CA-W8 — «Cómo funciona» muestra la fórmula v2
- **Dado** la pestaña de severidad de «Cómo funciona» (`ComoFunciona.tsx`)
- **Cuando** se abre
- **Entonces** se ve `puntaje = 2 × tirante + frecuencia` y la tabla de bandas 3–4 / 5–7 / 8–10 / 11–12; no aparecen «duración» ni «afectación»
- **Capa de prueba:** E2E

### CA · panel-admin

#### CA-P1 — Detalle del reporte sin los cuatro datos
- **Dado** el detalle de un reporte en el panel técnico
- **Cuando** se renderiza
- **Entonces** no hay `<Dato>` con etiqueta «Manzana», «Dirección aproximada», «Duración estimada» ni «Afectación»; siguen «Distrito», «Unidad vecinal», «Tirante estimado», «Frecuencia» y **«En el mapa público se ve»**
- **Capa de prueba:** E2E

#### CA-P2 — Desglose de la severidad v2
- **Dado** un reporte técnico con T = muslo (3) y F = permanente (4)
- **Cuando** se muestra `FactoresSeveridad`
- **Entonces** hay exactamente dos filas («Tirante» ×2 y «Frecuencia»), el título dice «Cómo se llegó a 10 de 12 puntos» y el texto de fórmula es `puntaje = 2 × tirante + frecuencia`
- **Capa de prueba:** E2E (panel-admin no tiene tests de componentes; unitaria si el cálculo de filas se extrae a `lib/`)

#### CA-P3 — Formato y tipos
- **Dado** `apps/panel-admin/src/lib/formato.ts`
- **Cuando** se ejecutan `pnpm --filter panel-admin typecheck` y `test`
- **Entonces** ambos pasan y `formato.ts` no exporta `etiquetaAfectacion` ni `etiquetaDuracion`
- **Capa de prueba:** unitaria

#### CA-P4 — El mapa del panel no dibuja la capa de manzanas
- **Dado** el mapa del panel con `manzana` en la lista de capas
- **Cuando** se acerca a zoom ≥ 15
- **Entonces** no hay capa ni fuente `capa-manzana` y no se piden teselas `/geo/v1/teselas/manzana/`; distritos y UV siguen dibujándose
- **Capa de prueba:** E2E

### CA · e2e

#### CA-X1 — Ayudas y recorrido completo
- **Dado** `e2e/tests/ayudas.ts` (`reporteValido`), `recorrido-completo.spec.ts` y `resiliencia-interfaz.spec.ts`
- **Cuando** se ejecuta `pnpm test:e2e`
- **Entonces** ninguno referencia `duracion_estimada` ni `afectacion`, y el recorrido ciudadano → técnico → mapa público → exportación pasa
- **Capa de prueba:** E2E

#### CA-X2 — Texto de la fórmula
- **Dado** `navegacion.spec.ts`
- **Cuando** se ejecuta
- **Entonces** espera `puntaje = 2 × tirante + frecuencia` y pasa
- **Capa de prueba:** E2E

#### CA-X3 — Separación pública / técnica sin los cuatro campos
- **Dado** un reporte validado
- **Cuando** se piden la ruta pública (con y sin sesión) y la técnica
- **Entonces** ninguna `properties` tiene los cuatro campos, y los tests existentes de `separacion-publica-tecnica.spec.ts` siguen pasando
- **Capa de prueba:** E2E

#### CA-X4 — La capa manzana se sigue sirviendo
- **Dado** `datos-reales.spec.ts` y `api-contratos.spec.ts`
- **Cuando** se ejecutan
- **Entonces** «la capa de manzanas se sirve entera o por teselas, pero se sirve» y la lista de capas con `manzana` siguen pasando sin modificación
- **Capa de prueba:** E2E

### CA · raíz (Parte 5)

#### CA-R1 — CLAUDE.md §7.1 y §9.1 (autorizado por el usuario el 2026-09-25 vía agente principal; se registra en el PR)
- **Dado** `CLAUDE.md`
- **Cuando** se leen §7.1 y §9.1
- **Entonces** la tabla de §7.1 no tiene filas `manzana_id`, `direccion_aprox`, `duracion_estimada`, `afectacion`; §9.1 dice `severidad(tirante, frecuencia)`, `puntaje = 2·T + 1·F → rango 3 … 12`, las bandas de D1, reglas E1 y E3 sin E2, y su tabla de ejemplos es un subconjunto exacto de la tabla de CA-C5; `git diff main...HEAD -- CLAUDE.md` no toca otras secciones salvo que P-2 lo autorice
- **Capa de prueba:** comando (`git diff` + `grep`)

#### CA-R2 — Scripts de banco
- **Dado** `scripts/banco-datos.mjs`, `banco-consultas.mjs`, `banco-concurrencia.mjs`
- **Cuando** se ejecuta `node --check` sobre cada uno y `grep -n "duracion_estimada\|afectacion\|direccion_aprox\|manzana_id" scripts/`
- **Entonces** `node --check` pasa y el grep no encuentra nada; ejecutados contra `pnpm db:local` con 0010 aplicada no fallan con `column … does not exist`; `banco-carga.mjs` y `banco-sostenido.mjs` (teselas de manzana) no cambian
- **Capa de prueba:** comando / integración PGlite

#### CA-R3 — README
- **Dado** `README.md`
- **Cuando** se busca `direccion_aprox`
- **Entonces** no aparece (la línea 89 se quita o se reescribe sin el campo)
- **Capa de prueba:** comando

## 5. Invariantes que no se pueden romper

| Invariante | De dónde sale | Test existente que la cubre |
|---|---|---|
| La ruta pública filtra y publica por `geom_publico`; con cookie de técnico devuelve lo mismo que sin ella | §13, `0005_geometria_publica.sql` | `api-core/test/vista-publica-vs-tecnica.test.ts` («la ruta pública devuelve la vista pública pase lo que pase»); `privacidad-ubicacion.test.ts` («el bbox público no puede usarse como oráculo…»); `e2e/tests/separacion-publica-tecnica.spec.ts` |
| Jitter determinista de vivienda (≤ 30 m) y redondeo a 5 decimales | §13 | `api-core/test/seguridad.test.ts` («jitter público (§13)»); `privacidad-ubicacion.test.ts` («la vista pública degrada la ubicación de una vivienda»); `contracts/test/jitter.test.ts` |
| El punto crítico público no expone la coordenada exacta de un reporte aislado | §9.2, §13 | `privacidad-ubicacion.test.ts` («el punto crítico no publica…»); `geo-service.test.ts` («no publica ninguna medida derivada…») |
| La vista pública no publica autor ni `ip_hash` | §0.8, §13 | `api-core/test/reportes.test.ts:232`; `cuentas-y-cuota.test.ts:708`; `e2e/tests/cuenta-ciudadana.spec.ts:191–195` |
| Ningún esquema de entrada acepta `autor_id`, `rol`, `estado`, `severidad_*`, `ip_hash` (se descartan) | §4.8, §13 | `api-core/test/cuentas-y-cuota.test.ts` («ningún alias de «autor»…», «los campos que decide el servidor no se pueden fijar desde el cuerpo») |
| `severidad_calculada` es función pura de contracts, ejecutada en api-core, nunca editable a mano | §9.1, §7.1 | `contracts/test/severidad.test.ts` (se reescribe con CA-C5…C8); `api-core/test/reportes.test.ts` («crea el reporte con UV resuelta y severidad calculada») |
| Reclasificación manual con motivo; `severidad_efectiva = COALESCE(manual, calculada)` | §7.1 | `api-core/test/reportes.test.ts` («fusiona duplicados y reclasifica severidad con motivo») |
| Máquina de estados y moderación previa (`nuevo` no se publica) | §7.3 | `contracts/test/esquemas.test.ts` («máquina de estados»); `api-core/test/reportes.test.ts` («no publica reportes nuevos…», «respeta la máquina de estados…») |
| Migraciones anteriores intactas; solo archivos nuevos; migrar es idempotente | §7, matriz de riesgo `datos` | `packages/db/test/db.test.ts` («es idempotente…»); `migrar.test.ts`; `git diff --name-only main...HEAD -- packages/db/migraciones` |
| Privilegios mínimos de `curichi_api` / `curichi_geo` sin cambios | `0008_privilegios_minimos.sql` | `packages/db/test/privilegios.test.ts`; `pnpm privilegios` (PostgreSQL real) |
| El PIP sigue resolviendo distrito y UV (interior, borde, hueco, fuera de cobertura → 422) | §7.4 | `geo-service/test/geo-service.test.ts` («POST /geo/v1/resolver (§7.4)»); `api-core/test/reportes.test.ts` («rechaza puntos fuera de cobertura con 422»); `cambio-de-capa.test.ts` |
| Las exportaciones llevan la nota metodológica | §9.5 | `api-core/test/reportes.test.ts` («exporta GeoJSON y CSV con nota metodológica solo para técnicos») |
| El CSV neutraliza inyección de fórmulas | §13 | `api-core/test/seguridad.test.ts` («CSV: inyección de fórmulas»); `reportes.test.ts` («exportación CSV: contenido del vecino») |
| El detalle del panel conserva «En el mapa público se ve» | decisión del usuario 2026-09-25 | ninguno (lo cubre CA-P1) |
| La capa `manzana` se sigue cargando, sirviendo y con `SELECT` para los roles | D2 | `geo-service.test.ts` («punto dentro de la manzana la informa»); `e2e/tests/datos-reales.spec.ts:222`; `api-contratos.spec.ts:99` |
| Fotos sin EXIF | §13 | `api-core/test/fotos.test.ts` (no se toca; debe seguir verde) |

## 6. Riesgos por bandera

| Bandera | Riesgo concreto | Qué prueba lo cubre |
|---|---|---|
| `contrato` | Un consumidor sigue leyendo `p.direccion_aprox` / `p.manzana_id` y muestra `undefined` en vez de fallar | `pnpm typecheck` en todo el monorepo; CA-W5, CA-P1, CA-P3 |
| `contrato` | `openapi.yaml` editado a mano y desalineado de Zod | CA-C9 |
| `contrato` | La PWA en caché envía el payload viejo y recibe 400 | CA-A2 |
| `privacidad` | Al reescribir `vistas.ts` se pierde la degradación por `ubicacion_tipo` (hoy va en las mismas líneas que `direccion_aprox` / `manzana_id`, `vistas.ts:137–145`) | CA-A4, CA-A6 e invariantes de jitter y bbox-oráculo |
| `privacidad` | La manzana reaparece al copiar la respuesta de geo-service al reporte | CA-A3 |
| `datos` | 0010 falla en PostgreSQL real por algo que PGlite no reproduce | CA-D1 en PGlite; §7 |
| `datos` | Se pierden de forma irreversible los valores de las cuatro columnas en `infra/.pglite` | P-5 (copia previa); CA-D3 comprueba que no se pierde nada más |
| `datos` | Reportes v1 y v2 mezclados (puntaje 5–20 frente a 3–12) confunden el panel y `severidad_max` de los puntos críticos | CA-D4 según P-1; CA-P2 |
| `geo` | Quitar el dibujo de manzana arrastra la capa de UV o de distrito (misma función `aplicarCapas`) | CA-W7, CA-P4 |
| `geo` | Se toca geo-service o el ETL sin necesidad | CA-G1, CA-E1 (diff vacío) |
| `ui` | Un paso del formulario queda vacío o el contador «Paso N de M» miente | CA-W2 |
| `ui` | «Cómo funciona» y el desglose del panel siguen mostrando la fórmula v1 | CA-W8, CA-P2, CA-X2 |
| `base` | Tests que usan `reporteValido` / `test-utils` con los campos viejos fallan en cadena | CA-D7, CA-X1, `pnpm test` global |

## 7. Lo que no se va a poder verificar en esta máquina

Se completa en F4. Previsible:

- Migración 0010 y `pnpm privilegios` contra **PostgreSQL real / Docker** (esta máquina usa PGlite, ADR 0002). Lo cubre el paso de CI con PostgreSQL real si corre.
- `e2e/tests/datos-reales.spec.ts` con los shapefiles reales si `data/raw/DM_UV_MZ_2025` no está presente.
- Comportamiento de una **PWA ya instalada** con el shell viejo en caché (CA-A2 lo aproxima desde el servidor).
- Lighthouse / axe del formulario con menos pasos (auditoría de Parte 5, fuera de esta corrida salvo que se pida).

## 8. Preguntas abiertas para el usuario

- [ ] **P-1 · `BLOQUEANTE` (solo para `packages/db` y `apps/panel-admin`; contracts, api-core, web-ciudadano, e2e y raíz pueden avanzar):** ¿qué pasa con la severidad de los reportes que ya existen (`severidad_version = 1`, puntaje 5–20)?
  - **Opción A (recomendada):** la migración 0010 los recalcula con v2 (solo necesita `tirante_estimado` y `frecuencia`, que se conservan), pone `severidad_version = 2` y no toca `severidad_manual`; después se corre `pnpm --filter db puntos-criticos:recalcular` para que `severidad_max` sea coherente. Costo: la fórmula queda escrita también en SQL una vez; CA-D4 prueba que coincide con `calcularSeveridad` en las 16 combinaciones.
  - **Opción B:** se dejan como históricos v1. Costo: `FactoresSeveridad` no puede explicar un puntaje v1 sin duración ni afectación, así que habría que añadir `severidad_version` a `ReporteTecnicoSchema` (aditivo) y ramificar el panel; los puntos críticos mezclarían bandas de dos fórmulas.
- [ ] **P-2 (no bloqueante):** otras secciones de `CLAUDE.md` nombran los campos quitados: §1 («la manzana se anota…»), §2 (glosario: «Duración del anegamiento»), §3.1 punto 2 («dirección aproximada»), §7.2 (`reporte_inundacion.manzana_id` opcional), §9.3 (tabla con `duracion ≥ 2h_12h`), §9.4 (`afectacion = vehicular`), §9.5 («la duración es recordada»), §13 (jitter: «no muestra `direccion_aprox`»). La autorización cubre solo §7.1 y §9.1. **Recomiendo** autorizar también estas, para que el manual no describa campos que no existen; si no, quedan como inconsistencia conocida en el informe.
- [ ] **P-3 (no bloqueante, ligada a P-2):** `NOTA_METODOLOGICA` (`packages/contracts/src/dominio/config.ts`) dice «la duración es recordada» y va en cada exportación. **Recomiendo** quitar esa frase (texto en contracts + §9.5). Si se aprueba, se añade un criterio: la nota exportada no contiene «duración».
- [ ] **P-4 (no bloqueante):** el formulario tiene 5 pasos (`FormularioReporte.tsx:77`); hoy el paso 2 es tirante + duración y el 3 frecuencia + afectación. **Recomiendo** unir tirante y frecuencia en un solo paso (4 pasos, más cerca del objetivo «menos de 2 minutos» de §4.3). CA-W2 vale para ambas opciones.
- [ ] **P-5 (no bloqueante):** `DROP COLUMN` borra para siempre esos valores en `infra/.pglite` (datos locales). **Recomiendo** que el usuario copie `infra/.pglite` antes de migrar; no lo hace un implementador.
- [ ] **P-6 (hallazgo, no bloqueante):** fuera de las carpetas de la corrida mencionan los campos: `docs/seguridad/checklist-pr.md:17`, `docs/seguridad/modelo-de-seguridad.md:113`, `docs/seguridad/revision-fase1.md:34`, `docs/proceso/sdd.md:11` (ejemplo), `.claude/skills/sdd/matriz-de-riesgo.md`, y `apps/web-ciudadano/src/lib/sw.test.ts:266–274` usa URLs de teselas de manzana como ejemplo de caché (sigue siendo válido porque la capa se sirve). Se dejan como hallazgo del informe salvo que se pidan.
- [ ] **P-7 (informativo):** con las bandas de D1, E3 no se dispara nunca (F = 4 da puntaje ≥ 6, ya `media`) y `critica` equivale exactamente a T = 4. E3 se conserva como guarda, como decidió el usuario; CA-C7 lo deja probado.
- [ ] **P-8 (informativo):** con D2, `/geo/v1/resolver` (público) sigue calculando y devolviendo la manzana del punto consultado. No es fuga (es la coordenada que envía quien pregunta), pero es una consulta PIP de más por petición; quitarla sería otra corrida con ruptura en `ResolverRespuestaSchema`.

## 9. Decisiones de la puerta 1 (usuario, 2026-09-25)

- Spec **aprobada**.
- P-1: **opción A**. La migración 0010 recalcula `severidad_calculada` y `severidad_puntaje` de los reportes existentes con la fórmula v2 y pone `severidad_version = 2`.
- P-2: **autorizado** actualizar también §1, §2, §3.1, §7.2, §9.3, §9.4, §9.5 y §13 de `CLAUDE.md` (solo quitar menciones; ninguna regla cambia).
- «En el mapa público se ve» se conserva (decisión previa del usuario).
- P-3: **sí**. `NOTA_METODOLOGICA` deja de decir «la duración es recordada» (cubierto por la prueba `P-3` en `packages/contracts/test`).
- P-4: **4 pasos** en el formulario público (ubicación · tirante y frecuencia · fotos y descripción · revisión). Los borradores del formato viejo traducen su paso.
- P-5: la base local se respaldó en el scratchpad de la sesión antes de aplicar la 0010; la carpeta `infra/.pglite` original estaba corrupta (PGlite abortaba al abrirla) y se recreó desde cero.
