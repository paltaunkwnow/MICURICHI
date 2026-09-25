# Pruebas en rojo — quitar campos del reporte · `packages/db`

- **Spec:** `spec.md` (aprobada el 2026-09-25; P-1 = opción A, ver §9)
- **Escritas el:** 2026-09-25
- **Archivo único:** `packages/db/test/migracion-0010-quitar-campos.test.ts` (8 `it`, dos bases PGlite + postgis en memoria)
  - base «vieja»: se copian 0001–0009 a un directorio temporal, se aplican, se cargan las capas de prueba y 16 reportes (las 16 combinaciones T × F) con los cuatro campos rellenos, severidad v1, autor, `geom_publico` nulo o no, y `severidad_manual` en 4 de ellos; después se aplica el directorio real (debe traer la 0010).
  - base «nueva»: PostGIS vacío con todas las migraciones reales (CA-D1, CA-D2, CA-D5, CA-D6).
  - La tabla v2 esperada se copia de CA-C5 de la spec y **no** se deriva de `contracts`, para que la fórmula en SQL de la 0010 se compare con una referencia independiente.

## Mapa criterio → prueba

Comando base (si `pnpm` falla por `.tools\pnpm\12.4.1`, anteponer `npx -y pnpm@12.4.1`):
`pnpm --filter db exec vitest run test/migracion-0010-quitar-campos.test.ts -t "<CA>"`

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-D1 | integración PGlite | `packages/db/test/migracion-0010-quitar-campos.test.ts:258` | `… -t "CA-D1"` | rojo |
| CA-D2 | integración PGlite + comando | `…/migracion-0010-quitar-campos.test.ts:279`; existente `packages/db/test/db.test.ts:37` («es idempotente…») | `… -t "CA-D2"`; `git diff --name-only 3db01e1 -- packages/db/migraciones && git status --porcelain packages/db/migraciones` (ver hallazgo 1) | rojo (vitest); comando: hoy vacío, al terminar debe listar solo `0010_*.sql` |
| CA-D3 | integración PGlite | `…/migracion-0010-quitar-campos.test.ts:297` | `… -t "CA-D3"` | rojo |
| CA-D4 | integración PGlite | `…/migracion-0010-quitar-campos.test.ts:313` | `… -t "CA-D4"` | rojo |
| CA-D5 | unitaria + integración PGlite | `…/migracion-0010-quitar-campos.test.ts:351` y `:366`; más `pnpm --filter db typecheck` | `… -t "CA-D5"` | rojo (los dos) |
| CA-D6 | integración PGlite | `…/migracion-0010-quitar-campos.test.ts:381` | `… -t "CA-D6"` | rojo |
| CA-D7 | unitaria (búsqueda en código) | `…/migracion-0010-quitar-campos.test.ts:417`; más `pnpm --filter db typecheck` y `pnpm --filter db test` | `… -t "CA-D7"` | rojo |

## Salida literal de cada fallo (recortada)

### CA-D1

```
× CA-D1: existe 0010_*.sql y, migrando desde vacío, quita las cuatro columnas y los dos tipos
AssertionError: no hay ningún archivo migraciones/0010_*.sql: expected [] to have a length of 1 but got +0
- 1
+ 0
 ❯ test/migracion-0010-quitar-campos.test.ts:255:68
```

### CA-D2

```
× CA-D2: 0001–0009 intactas, 0010 es el único archivo nuevo y volver a migrar no aplica nada
AssertionError: expected [ '0001_inicial.sql', …(8) ] to deeply equal [ '0001_inicial.sql', …(9) ]
@@ -6,7 +6,6 @@
    "0008_privilegios_minimos.sql",
    "0009_cuentas_ciudadanas.sql",
-   StringMatching /^0010_.+\.sql$/,
  ]
 ❯ test/migracion-0010-quitar-campos.test.ts:276:22
```

El mismo `it` compara el sha256 (con LF) de 0001–0009 contra el valor de antes de la corrida y exige que re-migrar no aplique nada.

### CA-D3

```
× CA-D3: sobre una base con reportes, 0010 conserva filas, id, geometrías, tirante, frecuencia, estado, severidad_manual y autor
AssertionError: al migrar la base con 0001–0009 no se aplicó ninguna 0010_*.sql: expected [] to have a length of 1 but got +0
- 1
+ 0
 ❯ exigir0010Aplicada test/migracion-0010-quitar-campos.test.ts:248:5
```

### CA-D4

```
× CA-D4: 0010 recalcula la severidad de los reportes existentes con la v2 (16 combinaciones) y no toca la manual
AssertionError: al migrar la base con 0001–0009 no se aplicó ninguna 0010_*.sql: expected [] to have a length of 1 but got +0
- 1
+ 0
 ❯ exigir0010Aplicada test/migracion-0010-quitar-campos.test.ts:248:5
```

Después de esa guarda: 16 filas, 16 combinaciones distintas, `severidad_version = 2`, `(severidad_calculada, severidad_puntaje)` = tabla CA-C5, `severidad_manual` y `severidad_motivo` iguales a los de antes.

### CA-D5

```
× CA-D5: el esquema Drizzle de reporteInundacion no declara los cuatro campos ni sus enums; manzana sigue exportada
AssertionError: columna manzana_id: expected [ 'id', 'geom', 'creado_en', …(33) ] to not include 'manzana_id'

× CA-D5: tras 0010 geo.manzana y geo.manzana_vigente existen y verificar-privilegios sigue exigiendo SELECT sobre geo.manzana
AssertionError: la base nueva no registra ninguna 0010: expected +0 to be 1 // Object.is equality
```

### CA-D6

```
× CA-D6: el seed sintético termina, deja todos los reportes con severidad v2 y sigue cargando la capa manzana
AssertionError: rodilla|ocasional: expected { version: 1, banda: 'media', …(1) } to strictly equal { version: 2, banda: 'media', …(1) }
  {
    "banda": "media",
-   "puntaje": 6,
-   "version": 2,
+   "puntaje": 10,
+   "version": 1,
  }
```

### CA-D7

```
× CA-D7: ni src, ni test, ni banco-puntos-criticos.ts nombran los cuatro campos en código
AssertionError: banco-puntos-criticos.ts:31: tirante_estimado, duracion_estimada, frecuencia, afectacion, …
src\esquema\index.ts:31: export const duracionEnum = pgEnum('duracion_estimada', [
src\esquema\index.ts:43: export const afectacionEnum = pgEnum('afectacion', [
src\esquema\index.ts:179: manzanaId: text('manzana_id'),
src\esquema\index.ts:185: direccionAprox: text('direccion_aprox'),
src\seeds\samples.ts:90: const AFECTACIONES = ['peatonal', 'vehicular', 'ingreso_viviendas', 'corte_total_via'] as const;
src\seeds\samples.ts:224: `INSERT INTO reporte_inundacion (… manzana_id, …
src\test-utils.ts:95: tirante_estimado, duracion_estimada, frecuencia, afectacion, …
test\puntos-criticos-entorno.test.ts:36: … duracion_estimada, frecuencia, afectacion, …
test\puntos-criticos-entorno.test.ts:221: … duracion_estimada, frecuencia, afectacion, …
(18 hallazgos en total)
```

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| Migrar es idempotente (volver a migrar no aplica nada) | `packages/db/test/db.test.ts:37` («es idempotente: volver a migrar no aplica nada»); CA-D2 lo repite solo para exigir que la 0010 esté incluida |
| Migraciones bajo advisory lock, una transacción por archivo | `packages/db/test/migrar.test.ts` |
| Privilegios mínimos de `curichi_api` / `curichi_geo` (incluido `SELECT` sobre `geo.manzana`) | `packages/db/test/privilegios.test.ts`; `pnpm --filter db privilegios` (PostgreSQL real) |
| Puntos críticos (DBSCAN, `severidad_max`) siguen funcionando con reportes sin los cuatro campos | `packages/db/test/db.test.ts` («puntos críticos…»), `puntos-criticos-entorno.test.ts`, `puntos-criticos-volumen.test.ts` (deben seguir verdes tras adaptar `test-utils.ts`) |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-D2 (parte comando) | El comando `git diff … main...HEAD` de la spec no sirve en este repo (hallazgo 1); se ejecutó la variante contra `3db01e1` y hoy sale vacío, como corresponde antes de implementar. |
| CA-D1 contra PostgreSQL real | Solo PGlite en esta máquina (spec §7). |

## Hallazgos sobre la spec

1. **CA-D2, comando roto.** `main` (local y `origin/main`, en `b2df394`) no contiene 0002–0009: `git diff --name-only main...HEAD -- packages/db/migraciones` lista hoy **ocho** archivos y nunca podrá listar solo la 0010. Se usa en su lugar el sha256 de 0001–0009 dentro del test (independiente de git) y, como comando, `git diff --name-only 3db01e1 -- packages/db/migraciones` + `git status --porcelain packages/db/migraciones` (`3db01e1` = HEAD al crear la rama).
2. **CA-D3/CA-D4 frente a CA-D7.** Para probar la 0010 hay que insertar filas con los cuatro campos antes de migrar, así que el test de la migración nombra esas columnas en código. CA-D7 excluye **solo** su propio archivo (`migracion-0010-quitar-campos.test.ts`) de la búsqueda; el resto de `src/`, `test/` y `banco-puntos-criticos.ts` se revisa entero, quitando comentarios `//`, `/* */` y `-- `.
3. **CA-D7, lectura más estricta.** La búsqueda es insensible a mayúsculas: además de las columnas, marca la constante local `AFECTACIONES` de `src/seeds/samples.ts:90`. `DURACIONES` (misma función) no la marca el patrón de la spec; queda al criterio del implementador quitarla también.
4. **CA-D5, lectura más estricta.** Además de las columnas de `reporteInundacion`, el test exige que el esquema Drizzle no exporte `pgEnum` con `enumName` `duracion_estimada` ni `afectacion` (coherente con CA-D1: esos tipos dejan de existir en la base).
5. **CA-D4:** la tabla esperada es la de CA-C5 copiada a mano; si contracts cambiara la v2, este test no lo seguiría solo (a propósito: compara el SQL de la migración contra la spec).
