# Pruebas en rojo — quitar campos del reporte

- **Spec:** `spec.md` (aprobada el 2026-09-25)
- **Escritas el:** 2026-09-25, por seis redactores en paralelo (uno por paquete). Cada sección conserva su informe original.


---

# Paquete: contracts

## Pruebas en rojo — Quitar manzana, dirección aproximada, duración y afectación del reporte · `packages/contracts`

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Archivos:** `packages/contracts/test/severidad.test.ts` (reescrito: la tabla v1 de 256 combinaciones se sustituye por la v2), `packages/contracts/test/esquemas.test.ts` (ampliado; `valido` pasa a ser el payload nuevo sin duración ni afectación).
- **Resultado global antes de implementar:** `29 failed | 12 passed (41)`.

## Mapa criterio → prueba

Comando base: `pnpm --filter contracts exec vitest run <archivo> -t "<CA>"` (en esta máquina se ejecutó `npx vitest run` desde `packages/contracts`, que es equivalente).

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-C1 | contracts | `packages/contracts/test/esquemas.test.ts:75` | `pnpm --filter contracts exec vitest run test/esquemas.test.ts -t "CA-C1"` | rojo |
| CA-C2 | contracts | `packages/contracts/test/esquemas.test.ts:81` | `pnpm --filter contracts exec vitest run test/esquemas.test.ts -t "CA-C2"` | rojo |
| CA-C3 (shape) | contracts | `packages/contracts/test/esquemas.test.ts:86` | `pnpm --filter contracts exec vitest run test/esquemas.test.ts -t "CA-C3"` | rojo |
| CA-C3 (parse técnica + `manzana_id`) | contracts | `packages/contracts/test/esquemas.test.ts:95` | ídem | rojo |
| CA-C4 (enums y etiquetas quitados) | contracts | `packages/contracts/test/esquemas.test.ts:100` | `pnpm --filter contracts exec vitest run test/esquemas.test.ts -t "CA-C4"` | rojo |
| CA-C4 (la capa manzana se conserva) | contracts | `packages/contracts/test/esquemas.test.ts:109` | ídem | **verde** (guarda de regresión, ver hallazgos) |
| CA-C5 (la tabla tiene las 16 filas) | contracts | `packages/contracts/test/severidad.test.ts:60` | `pnpm --filter contracts exec vitest run test/severidad.test.ts -t "CA-C5"` | verde (verifica la tabla del test, no el código) |
| CA-C5 (16 aserciones, una por combinación) | contracts | `packages/contracts/test/severidad.test.ts:68` | ídem | rojo ×16 |
| CA-C6 (`SEVERIDAD_VERSION`) | contracts | `packages/contracts/test/severidad.test.ts:80` | `pnpm --filter contracts exec vitest run test/severidad.test.ts -t "CA-C6"` | rojo |
| CA-C6 (`PESOS`, `PUNTOS`) | contracts | `packages/contracts/test/severidad.test.ts:84` | ídem | rojo |
| CA-C6 (`BANDAS` contiguas 3..12) | contracts | `packages/contracts/test/severidad.test.ts:96` | ídem | rojo |
| CA-C7 (sin E2 ni E3, crítica ⇔ T = 4) | contracts | `packages/contracts/test/severidad.test.ts:113` | `pnpm --filter contracts exec vitest run test/severidad.test.ts -t "CA-C7"` | rojo |
| CA-C7 (monotonía en T y F) | contracts | `packages/contracts/test/severidad.test.ts:130` | ídem | rojo |
| CA-C8 | contracts | `packages/contracts/test/severidad.test.ts:147` | `pnpm --filter contracts exec vitest run test/severidad.test.ts -t "CA-C8"` | rojo |
| CA-C9 | comando — **no aplica Vitest** | `packages/contracts/openapi/openapi.yaml`, `packages/contracts/dist/dominio.json` | ver abajo | rojo (medido) |
| CA-C10 | comando — **no aplica Vitest** | `packages/contracts/CHANGELOG.md` | ver abajo | rojo (medido) |

Comandos de CA-C9 (desde la raíz; todos deben cumplirse tras implementar):

```bash
pnpm contracts:build
git status --porcelain packages/contracts/openapi          # vacío
for c in manzana_id direccion_aprox duracion_estimada afectacion; do grep -c "$c" packages/contracts/openapi/openapi.yaml; done   # 0 cada uno
node -e "const d=require('./packages/contracts/dist/dominio.json');if(d.severidad.version!==2||'duracion' in d.severidad.pesos||'afectacion' in d.severidad.pesos)process.exit(1)"
grep -n -- "- manzana$" packages/contracts/openapi/openapi.yaml   # sigue en el enum de capa (≥ 1 línea)
```

Comandos de CA-C10:

```bash
grep -m1 '^## ' packages/contracts/CHANGELOG.md                                   # "## 0.4.0 — 2026-09-25"
awk '/^## /{n++} n==1' packages/contracts/CHANGELOG.md | grep -c 'con ruptura'     # ≥ 1
awk '/^## /{n++} n==1' packages/contracts/CHANGELOG.md | grep -E 'manzana_id|direccion_aprox|duracion_estimada|afectacion|DURACIONES|AFECTACIONES|E2'
```

La primera entrada debe nombrar además la fórmula v2 (`2·T + F`) y las bandas 3–4 / 5–7 / 8–10 / 11–12 (revisión visual o `grep` de esas cadenas).

## Salida literal de cada fallo (recortada)

### CA-C1

```
FAIL  test/esquemas.test.ts > quitar manzana, dirección, duración y afectación del reporte > CA-C1: el payload sin duración ni afectación es válido y el esquema no declara los cuatro campos
AssertionError: expected false to be true // Object.is equality
- true
+ false
 ❯ test/esquemas.test.ts:76:58
     76|     expect(ReporteCrearSchema.safeParse(valido).success).toBe(true);
```

### CA-C2

```
FAIL  test/esquemas.test.ts > … > CA-C2: un payload viejo se acepta y las claves quitadas se descartan
AssertionError: expected true to be false // Object.is equality
 ❯ test/esquemas.test.ts:83:59
     82|     const r = ReporteCrearSchema.parse(viejo);
     83|     for (const campo of CUATRO_CAMPOS) expect(campo in r).toBe(false);
```

(`parse` no lanza; la clave que sobrevive es `duracion_estimada`.)

### CA-C3

```
FAIL  test/esquemas.test.ts > … > CA-C3: ReportePublicoSchema y ReporteTecnicoSchema no declaran los cuatro campos
AssertionError: expected [ 'id', 'creado_en', …(18) ] to not include 'manzana_id'
 ❯ test/esquemas.test.ts:90:27

FAIL  test/esquemas.test.ts > … > CA-C3: una vista técnica válida con manzana_id añadido pasa parse y sale sin esa clave
ZodError: [
  { "expected": "string", "code": "invalid_type", "path": [ "direccion_aprox" ], … },
  { "code": "invalid_value", "path": [ "duracion_estimada" ], … },
  { "code": "invalid_value", "path": [ "afectacion" ], … }
]
 ❯ test/esquemas.test.ts:96:36
```

### CA-C4

```
FAIL  test/esquemas.test.ts > … > CA-C4: no se exportan DURACIONES ni AFECTACIONES y ETIQUETAS no tiene duracion ni afectacion
AssertionError: expected [ 'construirOpenApi', …(65) ] to not include 'DURACIONES'
 ❯ test/esquemas.test.ts:102:28
```

### CA-C5 (las 16 fallan igual)

```
FAIL  test/severidad.test.ts > matriz de severidad v2 (CLAUDE.md §9.1) > CA-C5: tobillo/primera_vez → 3 baja — → baja (v2)
…
FAIL  test/severidad.test.ts > … > CA-C5: mas_70/permanente → 12 critica E1 → critica (v2)
Error: Puntaje fuera de rango: NaN
 ❯ calcularSeveridad src/dominio/severidad.ts:66:20
     65|   const base = BANDAS.find((b) => puntaje >= b.min && puntaje <= b.max…
     66|   if (!base) throw new Error(`Puntaje fuera de rango: ${puntaje}`);
 ❯ test/severidad.test.ts:62:17
```

(La v1 exige duración y afectación: con solo T y F el puntaje es `NaN`.)

### CA-C6

```
FAIL  … > CA-C6: SEVERIDAD_VERSION es 2
AssertionError: expected 1 to be 2 // Object.is equality

FAIL  … > CA-C6: PESOS es { tirante: 2, frecuencia: 1 } y PUNTOS solo tiene tirante y frecuencia
AssertionError: expected { tirante: 2, duracion: 1, …(2) } to strictly equal { tirante: 2, frecuencia: 1 }
+   "afectacion": 1,
+   "duracion": 1,

FAIL  … > CA-C6: BANDAS es baja 3–4, media 5–7, alta 8–10, critica 11–12, contiguas y sin huecos
-     "max": 4,        +     "max": 8,
-     "min": 3,        +     "min": 5,
```

### CA-C7

```
FAIL  … > CA-C7: ninguna combinación aplica E2 ni E3; critica ⇔ T = 4; banda nunca baja de banda_base
Error: Puntaje fuera de rango: NaN
 ❯ calcularSeveridad src/dominio/severidad.ts:66:20
FAIL  … > CA-C7: es monótona: subir tirante o frecuencia nunca baja la banda
Error: Puntaje fuera de rango: NaN
```

### CA-C8

```
FAIL  … > CA-C8: es función pura: con entrada congelada no muta y da resultados idénticos
Error: Puntaje fuera de rango: NaN
 ❯ calcularSeveridad src/dominio/severidad.ts:66:20
```

### CA-C9 (medido sobre el estado actual)

```
manzana_id 6
direccion_aprox 6
duracion_estimada 8
afectacion 8
dominio.json → severidad.version = 1, pesos = [ 'tirante', 'duracion', 'frecuencia', 'afectacion' ]
```

### CA-C10 (medido sobre el estado actual)

```
## Changelog — contracts

## 0.3.0 — 2026-09-22
```

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| Máquina de estados (§7.3) | `packages/contracts/test/esquemas.test.ts` «máquina de estados» (sin cambios, verde) |
| Jitter determinista ≤ 30 m y redondeo a 5 decimales | `packages/contracts/test/jitter.test.ts` (sin cambios, verde) |
| Validaciones de `ReporteCrearSchema` (descripción corta, honeypot, fotos, coordenadas) | `packages/contracts/test/esquemas.test.ts` «ReporteCrearSchema» (mismos tests; ahora usan el payload nuevo) |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-C9 | No es Vitest. Se midió el estado actual con `grep -c` y `node -e`; `pnpm contracts:build` no se ejecutó para no reescribir `openapi.yaml` (artefacto de producción, fuera del alcance del redactor). |
| CA-C10 | No es Vitest; comandos `grep`/`awk` documentados arriba, medidos sobre el CHANGELOG actual. |

## Hallazgos sobre la spec

- **CA-C4, parte «la capa manzana se conserva»** (`esquemas.test.ts:109`) ya pasa: es una guarda de regresión (D2), no algo por implementar. Se deja porque la spec lo exige y protege contra quitar de más.
- **CA-C5, fila de control** (`severidad.test.ts:60`) pasa: comprueba que la tabla del test cubre las 16 combinaciones, no el código.
- **CA-C8** hoy falla por `NaN` (la v1 no admite la entrada de dos campos), no por mutación: la pureza solo podrá distinguirse cuando exista la v2. El test además comprueba que la entrada no cambia y que T = muslo, F = permanente da 10 / `alta`, coherente con CA-P2.
- **CA-C1 y CA-C2**: `direccion_aprox` y `manzana_id` nunca estuvieron en `ReporteCrearSchema`; para esas dos claves el criterio ya se cumplía. El rojo lo producen `duracion_estimada` y `afectacion`.
- **Tests previos que se vuelven rojos a propósito**: en `esquemas.test.ts`, «acepta un reporte válido…» y «rechaza el honeypot…» fallan porque `valido` ahora es el payload v2. Describen el contrato nuevo y se pondrán verdes al implementar CA-C1.
- **Typecheck**: `pnpm --filter contracts typecheck` fallará hasta implementar (los tests llaman a `calcularSeveridad({ tirante_estimado, frecuencia })` y leen `PUNTOS` con dos claves). Es lo esperado.
- Se eliminaron el test v1 de «256 combinaciones» y el de monotonía en cuatro variables; la monotonía se conserva en v2 sobre T y F (`severidad.test.ts:130`).

---

# Paquete: db

## Pruebas en rojo — quitar campos del reporte · `packages/db`

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

---

# Paquete: api-core

## Pruebas en rojo — Quitar manzana, dirección, duración y afectación del reporte · `services/api-core`

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Paquete:** `services/api-core` únicamente (CA-A1 … CA-A6)
- **Comando base:** `npx -y pnpm@12.4.1 --filter api-core exec vitest run <archivo>` (`pnpm` directo falla en esta máquina: `.tools\pnpm\12.4.1 … no se reconoce`)

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-A1 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:153` (4 casos: rodilla+cada_lluvia_fuerte 7/media, tobillo+ocasional 4/baja, muslo+permanente 10/alta, mas_70+primera_vez 9/critica) | `… vitest run test/quitar-campos-del-reporte.test.ts -t "CA-A1"` | rojo (4) |
| CA-A1 (adaptación) | integración PGlite | `services/api-core/test/reportes.test.ts:82,98,190` y `test/cuentas-y-cuota.test.ts:241` (valores v1 → v2: `alta`→`media`, 13→7) | `… vitest run test/reportes.test.ts test/cuentas-y-cuota.test.ts` | rojo (4) |
| CA-A2 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:187` | `… -t "CA-A2"` | rojo |
| CA-A3 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:203` | `… -t "CA-A3"` | rojo |
| CA-A4 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:252` (público, `ReportePublicoSchema.strict()`), `:271` (técnico, `ReporteTecnicoSchema.strict()`), `:290` (vivienda degradada) | `… -t "CA-A4"` | rojo (2) · verde (1, guarda de invariante, ver hallazgos) |
| CA-A5 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:309` (CSV), `:323` (GeoJSON) | `… -t "CA-A5"` | rojo (2) |
| CA-A6 | integración PGlite | `services/api-core/test/privacidad-ubicacion.test.ts:163` (bloque sustituido, 2 casos) | `… vitest run test/privacidad-ubicacion.test.ts -t "CA-A6"` | rojo (2) |
| CA-A6 | unitaria | `services/api-core/test/seguridad.test.ts:129` («desplaza la vivienda y oculta la dirección»), `:150` (vía pública / técnico) | `… vitest run test/seguridad.test.ts -t "CA-A6"` | rojo (2) |
| CA-A6 | integración PGlite | `services/api-core/test/privacidad-ubicacion.test.ts:196` (fixture de «el bbox público no puede usarse como oráculo…»; tests en `:216,228,236,257`, aserciones sin cambios) | `… vitest run test/privacidad-ubicacion.test.ts -t "oráculo"` | rojo (4, por el fixture: ver abajo) |
| CA-A6 | integración PGlite | `services/api-core/test/privacidad-ubicacion.test.ts:271` («el punto crítico no publica…», sin tocar) | `… -t "punto crítico"` | verde (invariante; debe seguir verde) |

## Salida literal de cada fallo (recortada)

### CA-A1

```
FAIL test/quitar-campos-del-reporte.test.ts > CA-A1: camino crítico con el payload nuevo > CA-A1: rodilla + cada_lluvia_fuerte sin duración ni afectación → 201, nuevo, UV resuelta, severidad v2 7/media
(ídem tobillo + ocasional, muslo + permanente, mas_70 + primera_vez)
AssertionError: {"codigo":"PAYLOAD_INVALIDO","mensaje":"Revisá los datos del reporte.","detalles":[{"campo":"duracion_estimada","mensaje":"Invalid option: expected one of \"menos_30min\"|\"30min_2h\"|\"2h_12h\"|\"mas_12h\""},{"campo":"afectacion","mensaje":"Invalid option: expected one of \"peatonal\"|\"vehicular\"|\"ingreso_viviendas\"|\"corte_total_via\""}]}: expected 400 to be 201
- 201
+ 400

FAIL test/reportes.test.ts > … > crea el reporte con UV resuelta y severidad calculada
AssertionError: expected 'alta' to be 'media'
FAIL test/reportes.test.ts > … > el técnico sí lo ve, con coordenada exacta y campos de moderación
AssertionError: expected 13 to be 7
FAIL test/reportes.test.ts > … > fusiona duplicados y reclasifica severidad con motivo
AssertionError: expected 'alta' to be 'media'
FAIL test/cuentas-y-cuota.test.ts > … > los campos que decide el servidor no se pueden fijar desde el cuerpo
AssertionError: expected 'alta' to be 'media'
```

### CA-A2

```
FAIL test/quitar-campos-del-reporte.test.ts > CA-A2: un cliente viejo (PWA en caché) no rompe la creación > CA-A2: con los cuatro campos responde 201 y ni la respuesta ni la vista técnica los traen
AssertionError: respuesta de POST: manzana_id: expected { …(20) } to not have property "manzana_id"
- Expected:
undefined
+ Received:
"manzana:A-1"
```

### CA-A3

```
FAIL test/quitar-campos-del-reporte.test.ts > CA-A3: la manzana que devuelve geo-service no se guarda ni se publica > CA-A3: ni la ruta pública, ni la técnica, ni la exportación traen manzana_id ni manzana:A-1
AssertionError: POST (respuesta) contiene la clave manzana_id: expected '{"type":"Feature","id":"c474e3ec-e71b…' not to contain 'manzana_id'
Expected: "manzana_id"
Received: "{…"unidad_vecinal":{"id":"unidad_vecinal:A",…},"manzana_id":"manzana:A-1","direccion_aprox":null,…"duracion_estimada":"2h_12h",…"afectacion":"ingreso_viviendas",…}"
```

### CA-A4

```
FAIL … > CA-A4: listado y detalle públicos no traen los cuatro campos y pasan ReportePublicoSchema.strict()
AssertionError: lista pública dbc7fa7a-…: manzana_id: expected { …(20) } to not have property "manzana_id"
- Expected:
undefined
+ Received:
null
FAIL … > CA-A4: listado y detalle técnicos no traen los cuatro campos y pasan ReporteTecnicoSchema.strict()
AssertionError: lista técnica dbc7fa7a-…: manzana_id: expected { …(37) } to not have property "manzana_id"
✓ CA-A4: la vivienda sigue degradada en público y exacta para el técnico
```

### CA-A5

```
FAIL … > CA-A5: el encabezado del CSV no nombra los cuatro campos y conserva la nota metodológica
AssertionError: manzana_id: expected [ 'id', 'estado', 'severidad', …(31) ] to not include 'manzana_id'
FAIL … > CA-A5: las properties del GeoJSON exportado no traen los cuatro campos y hay nota metodológica
AssertionError: export 1d2ae3b0-…: manzana_id: expected { …(37) } to not have property "manzana_id"
- Expected:
undefined
+ Received:
"manzana:A-1"
```

### CA-A6

```
FAIL test/privacidad-ubicacion.test.ts > CA-A6: ni la vista pública ni la técnica traen manzana_id > CA-A6: vivienda_o_predio: …
FAIL test/privacidad-ubicacion.test.ts > CA-A6: ni la vista pública ni la técnica traen manzana_id > CA-A6: via_publica: …
AssertionError: expected { …(20) } to not have property "manzana_id"
+ Received:
null
FAIL test/privacidad-ubicacion.test.ts > el bbox público no puede usarse como oráculo de la coordenada exacta > (los 4 tests)
error: null value in column "duracion_estimada" of relation "reporte_inundacion" violates not-null constraint
 ❯ insertarConPuntoPublicable test/privacidad-ubicacion.test.ts:197:22
FAIL test/seguridad.test.ts > jitter público (§13) > CA-A6: desplaza la vivienda y oculta la dirección
AssertionError: expected { …(20) } to not have property "direccion_aprox"
+ Received:
null
FAIL test/seguridad.test.ts > jitter público (§13) > CA-A6: la vía pública no se degrada y el técnico siempre ve la coordenada exacta
AssertionError: expected { …(37) } to not have property "direccion_aprox"
✓ con minpoints=1 un reporte solo forma su punto crítico: el centroide va degradado
```

### Qué asserts cambian en los tests existentes (CA-A6) y por qué

| Archivo | Antes | Después | Por qué |
|---|---|---|---|
| `privacidad-ubicacion.test.ts`, bloque «la manzana no se publica junto a una coordenada desplazada» (2 `it`) | `UPDATE … SET manzana_id = 'manzana:A-1'`; público de vivienda `manzana_id` `toBeNull()`; técnico `toBe('manzana:A-1')`; vía pública `toBe('manzana:A-1')` | Sustituido por `describe('CA-A6: ni la vista pública ni la técnica traen manzana_id')`, un `it` para `vivienda_o_predio` y otro para `via_publica`: detalle público, lista pública y detalle técnico `not.toHaveProperty('manzana_id')`; se mantiene `precision_degradada` según el tipo | La columna desaparece en 0010 (el UPDATE ya no se puede escribir) y D2 decide que el reporte no guarda manzana. La invariante de privacidad se endurece: ninguna vista, tampoco la técnica, trae nada derivado de la manzana |
| `privacidad-ubicacion.test.ts`, cabecera, punto 3 | describe la ocultación en vivienda | añade que desde esta corrida ninguna vista la trae | Documentación del cambio |
| `privacidad-ubicacion.test.ts`, `insertarConPuntoPublicable` (fixture del bloque «bbox … oráculo») | INSERT con `duracion_estimada`, `afectacion`, puntaje 10 | INSERT sin esas columnas, con `severidad_puntaje = 6`, `severidad_version = 2` | Tras 0010 las columnas no existen; las 4 aserciones del bloque no cambian. Hoy falla por `NOT NULL` y pasará con 0010 aplicada |
| `seguridad.test.ts`, `fila()` | trae `manzana_id`, `direccion_aprox`, `duracion_estimada`, `afectacion`; puntaje 10 | sin los cuatro; puntaje 6 (v2) | `FilaReporte` los pierde. Hasta que el implementador cambie `vistas.ts`, esto da un error de `typecheck` (TS2322) en `seguridad.test.ts:84` (esperado) |
| `seguridad.test.ts`, «desplaza la vivienda y oculta la dirección» | `direccion_aprox` `toBeNull()` | `not.toHaveProperty('direccion_aprox')` y `not.toHaveProperty('manzana_id')`; siguen `precision_degradada === true` y `lat !== f.lat` | La clave deja de existir; el desplazamiento se sigue comprobando igual |
| `seguridad.test.ts`, «la vía pública no se degrada y el técnico siempre ve la coordenada exacta» | técnico `direccion_aprox` `toBe('Calle Falsa 123')` | técnico `not.toHaveProperty('direccion_aprox' / 'manzana_id')` | CA-A4: el técnico tampoco lo recibe |

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| La ruta pública filtra y publica por `geom_publico`; con cookie de técnico devuelve lo mismo | `test/vista-publica-vs-tecnica.test.ts` («la ruta pública devuelve la vista pública pase lo que pase»); `test/privacidad-ubicacion.test.ts:216–257` («el bbox público no puede usarse como oráculo…», aserciones sin cambios) |
| Jitter determinista de vivienda y redondeo | `test/seguridad.test.ts` («jitter público (§13)»); `test/privacidad-ubicacion.test.ts` («la vista pública degrada la ubicación de una vivienda») |
| El punto crítico público no expone la coordenada exacta | `test/privacidad-ubicacion.test.ts:271` (sin cambios, verde) |
| La vista pública no publica autor ni `ip_hash` | `test/reportes.test.ts:232`; `test/cuentas-y-cuota.test.ts` |
| Ningún esquema de entrada acepta campos del servidor | `test/cuentas-y-cuota.test.ts` («los campos que decide el servidor no se pueden fijar desde el cuerpo»; solo cambia la banda esperada a v2) |
| Reclasificación manual con motivo; `severidad_efectiva` | `test/reportes.test.ts` («fusiona duplicados y reclasifica severidad con motivo») |
| Máquina de estados y moderación previa | `test/reportes.test.ts` |
| Exportaciones con nota metodológica; CSV sin inyección de fórmulas | `test/reportes.test.ts` («exporta GeoJSON y CSV…», «exportación CSV: contenido del vecino»); `test/seguridad.test.ts` («CSV: inyección de fórmulas»); CA-A5 también la comprueba |
| Fotos sin EXIF | `test/fotos.test.ts` (sin tocar) |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| — | Todas ejecutadas contra PGlite. No se corrió la suite completa de api-core; `tsc --noEmit` muestra solo el error esperado en `seguridad.test.ts:84`. |

## Hallazgos sobre la spec

- **CA-A3, CA-A4 y CA-A5 montan su escenario con el payload de una PWA vieja** (con `duracion_estimada` y `afectacion`; en A4 y A5, también con `direccion_aprox: 'Calle Falsa 123'` y `manzana_id`), no con el nuevo. Es la lectura más estricta (aunque el cliente mande los campos, no aparecen en ninguna salida) y hace que hoy fallen por la razón del criterio y no por el 400 de CA-A1. Así dependen de que CA-A2 se cumpla, cosa que la spec también exige.
- **CA-A1 compara contra valores escritos a mano** a partir de la tabla de CA-C5, no contra `calcularSeveridad`, para que un error en contracts no pase desapercibido aquí.
- **CA-A3:** el resolver de la suite (`resolverConManzana`, local al archivo) devuelve siempre `manzana: { id: 'manzana:A-1', codigo: 'A-1' }`, como el geo-service real (D2). Se busca el texto en el cuerpo crudo de las 7 respuestas (POST, lista y detalle públicos y técnicos, export CSV y GeoJSON).
- **CA-A4, «la vivienda sigue degradada…»** pasa hoy: es una guarda de la invariante de jitter dentro del mismo escenario, no un criterio nuevo. Se deja porque CA-A4 lo exige explícitamente y cubre el riesgo `privacidad` de §6 (perder la degradación al reescribir `vistas.ts:137–145`).
- **CA-A6, bloque «bbox … oráculo»:** la spec pide que siga «sin cambios de aserción, y en verde». Las aserciones no cambian, pero su fixture hace un INSERT directo con las columnas quitadas; se adaptó ahora, así que **hoy está en rojo** (por `NOT NULL` en `duracion_estimada`) y pasa a verde con la migración 0010 de `packages/db`. El implementador de api-core no debe tocarlo.
- **Tests con valores v1 adaptados a v2** (fuera de la lista literal de CA-A6, pero ligados a CA-A1): `reportes.test.ts:82,98,190` y `cuentas-y-cuota.test.ts:241` esperaban la banda y el puntaje v1 (`alta`, 13) del payload de `reporteValido`; ahora esperan `media` y 7. Valen igual antes y después de que el implementador quite los dos campos de `reporteValido`, porque v2 no los usa.
- **`test/resiliencia.test.ts:191,193`** usa un payload local con `duracion_estimada` y `afectacion`. No se tocó: tras el cambio el esquema los descarta (CA-A2) y el test sigue siendo válido. Si se quiere limpieza total, lo quita el implementador.
- `test/ayudas.ts` (`reporteValido`, líneas 93 y 95) sin tocar, como pidió el agente principal.

---

# Paquete: web-ciudadano

## Pruebas en rojo — Quitar campos del reporte · apps/web-ciudadano

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-W1 | E2E | `e2e/tests/quitar-campos-web.spec.ts:140` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W1"` | no ejecutada (pila no disponible); rojo previsto: el paso 2 tiene `input[name="duracion_estimada"]` |
| CA-W2 | E2E | `e2e/tests/quitar-campos-web.spec.ts:172` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W2"` | no ejecutada; **previsiblemente verde** con el código actual (ver hallazgos) |
| CA-W3 | E2E | `e2e/tests/quitar-campos-web.spec.ts:183` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W3"` | no ejecutada; rojo previsto: el cuerpo del POST lleva `duracion_estimada` y `afectacion` |
| CA-W4 | unitaria | `apps/web-ciudadano/src/lib/borrador.test.ts:113` | `pnpm --filter web-ciudadano exec vitest run src/lib/borrador.test.ts -t "CA-W4"` | rojo |
| CA-W5 | unitaria | `apps/web-ciudadano/src/lib/formato.test.ts:32` | `pnpm --filter web-ciudadano exec vitest run src/lib/formato.test.ts -t "CA-W5"` | verde (ya se cumple: título por nombre de UV / «Unidad vecinal sin datos») |
| CA-W5 | unitaria | `apps/web-ciudadano/src/lib/formato.test.ts:42` | ídem | rojo |
| CA-W5 | unitaria | `apps/web-ciudadano/src/lib/formato.test.ts:53` | ídem | rojo |
| CA-W5 | typecheck | — | `pnpm --filter web-ciudadano typecheck` | verde hoy; se pone rojo cuando contracts quite los campos y la app siga leyéndolos |
| CA-W6 | E2E | `e2e/tests/quitar-campos-web.spec.ts:199` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W6"` | no ejecutada; rojo previsto: `HojaDetalle` tiene `<dt>Duración</dt>` y `<dt>Afectación</dt>` |
| CA-W7 | E2E | `e2e/tests/quitar-campos-web.spec.ts:227` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W7"` | no ejecutada; rojo previsto: a zoom 16 se piden `/geo/v1/teselas/manzana/…` (o `/geo/v1/capas/manzana`) |
| CA-W8 | E2E | `e2e/tests/quitar-campos-web.spec.ts:268` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W8"` | no ejecutada; rojo previsto: el texto es `puntaje = 2 × tirante + duración + frecuencia + afectación` y las bandas 5–8 / 9–12 / 13–16 / 17–20 |

`pnpm` falla en esta máquina con el wrapper de `.tools\pnpm\12.4.1`; los comandos se corrieron con `npx -y pnpm@12.4.1 …`. `playwright test --list` lista los 6 tests del archivo nuevo sin errores; `tsc --noEmit` de `e2e` y `biome check` quedan limpios para los tres archivos tocados.

## Salida literal de cada fallo (recortada)

### CA-W4

```
 FAIL  src/lib/borrador.test.ts > borrador del formulario de reporte > CA-W4: un borrador guardado antes del cambio se restaura sin duración ni afectación
AssertionError: expected [ 'descripcion', …(4) ] to not include 'duracion_estimada'
 ❯ src/lib/borrador.test.ts:138:56
    136|     const restaurado = b as Borrador | null;
    137|     expect(restaurado).not.toBeNull();
    138|     expect(Object.keys(restaurado?.valores ?? {})).not.toContain('dura…
       |                                                        ^
```

### CA-W5

```
 FAIL  src/lib/formato.test.ts > formato > CA-W5: el título no usa la dirección aproximada aunque llegue en un objeto viejo
AssertionError: expected 'Av. Piraí esq. Los Tajibos' to be 'Los Lotes' // Object.is equality
Expected: "Los Lotes"
Received: "Av. Piraí esq. Los Tajibos"
 ❯ src/lib/formato.test.ts:50:34

 FAIL  src/lib/formato.test.ts > formato > CA-W5: formato.ts no exporta etiquetaDuracion ni etiquetaAfectacion
AssertionError: expected [ 'SEVERIDADES_ORDEN', …(19) ] to not include 'etiquetaDuracion'
 ❯ src/lib/formato.test.ts:54:38

 Test Files  2 failed (2)
      Tests  3 failed | 19 passed (22)
```

### CA-W1, CA-W2, CA-W3, CA-W6, CA-W7, CA-W8

No ejecutadas: `curl http://127.0.0.1:3001/ready` no responde (código 7, pila no levantada). Salida de `--list`:

```
Listing tests:
  [chromium] › quitar-campos-web.spec.ts:140:7 › … › CA-W1: el formulario no pregunta duración ni afectación y el resumen tampoco las muestra
  [chromium] › quitar-campos-web.spec.ts:172:7 › … › CA-W2: «Paso N de M» es coherente y ningún paso queda vacío
  [chromium] › quitar-campos-web.spec.ts:183:7 › … › CA-W3: el cuerpo de POST /api/v1/reportes no lleva los cuatro campos
  [chromium] › quitar-campos-web.spec.ts:199:7 › … › CA-W6: la hoja de detalle muestra tirante y frecuencia, y no duración ni afectación
  [chromium] › quitar-campos-web.spec.ts:227:9 › … › CA-W7: capas del mapa público › CA-W7: al acercar a zoom ≥ 15 no se pide la capa de manzanas; distritos y UV sí
  [chromium] › quitar-campos-web.spec.ts:268:7 › … › CA-W8: «Cómo funciona» explica la fórmula v2 sin duración ni afectación
Total: 6 tests in 1 file
```

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| El borrador conserva la clave de idempotencia y descarta basura o caducados | `apps/web-ciudadano/src/lib/borrador.test.ts` («conserva la clave de idempotencia…», «descarta un borrador caducado…», «ignora basura…») |
| Caché del service worker de teselas (usa URLs de manzana como ejemplo; la capa se sigue sirviendo, D2) | `apps/web-ciudadano/src/lib/sw.test.ts:266–274`, sin cambios |
| El detalle muestra UV y distrito resueltos por PIP | `e2e/tests/recorrido-completo.spec.ts`, `e2e/tests/mapa-publico.spec.ts` |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-W1, CA-W2, CA-W3, CA-W6, CA-W7, CA-W8 | Pila no disponible (`api-core` en 3001 no responde). Requieren `pnpm db:local`, `pnpm db:seed:samples` y `pnpm dev`. |

## Hallazgos sobre la spec

- **CA-W2 ya se cumple hoy**: el formulario actual tiene 5 pasos coherentes («Paso N de 5» constante, cada paso con controles). El recorrido del test contesta cualquier grupo de radios que encuentre, así que no depende de si hay 4 o 5 pasos (P-4 sigue abierta) y previsiblemente pasa sin implementar. Se deja como guarda de regresión del riesgo `ui` de §6; el orquestador decide si se conserva.
- **CA-W5, primera aserción ya se cumple**: con el objeto de la spec (sin `direccion_aprox`), `tituloReporte` ya devuelve el nombre de la UV. Lectura estricta adoptada: el título no puede usar `direccion_aprox` aunque llegue en un objeto viejo (caché de la PWA); eso sí está en rojo. Se reescribió el test existente «usa el nombre de la UV cuando no hay dirección», que afirmaba lo contrario.
- **CA-W7**: la instancia de MapLibre no está expuesta a la página, así que no se pueden consultar ids de capa (`capa-manzana*`) desde Playwright. La prueba lo observa por red: tras volar a zoom 16 con «Centrar el mapa en mi ubicación» (geolocalización simulada en `PUNTO_CENTRO`, confirmado por teselas OSM de z ≥ 15) exige peticiones de `distrito_municipal` y `unidad_vecinal` y ninguna de `/geo/v1/teselas/manzana/` ni `/geo/v1/capas/manzana`. Usa una espera fija de 3 s para dar tiempo a una petición de manzana que llegara tarde.
- **CA-W8**: la spec escribe las bandas como «3–4 / 5–7…»; la tabla actual usa «5 a 8». La prueba compara solo los números y el nombre de la banda, no el separador.
- **Sin criterio**: el formulario muestra el puntaje como `{puntaje}/20` (`FormularioReporte.tsx`, paso 5) y el párrafo de reglas de «Cómo funciona» describe E2 («si entra a las viviendas o corta la vía…»). Con v2 deberían ser `/12` y sin E2; ningún CA-W lo exige. CA-W8 solo prohíbe las palabras «duración» y «afectación», que ese párrafo no usa.
- **Sin criterio**: `leerBorrador` acota `paso` a 1..5; si P-4 se resuelve con 4 pasos, un borrador viejo en el paso 5 quedaría fuera de rango.
- CA-W6 abre `/reporte/<id>` (hoja de detalle sobre el mapa) con el primer reporte publicado del seed, como hace `recorrido-completo.spec.ts`; no crea reportes, así que no depende de que `ayudas.ts#reporteValido` ya esté adaptado.

---

# Paquete: panel-admin

## Pruebas en rojo — Quitar campos del reporte · `apps/panel-admin`

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Alcance de este archivo:** criterios CA-P1 a CA-P4. Los demás paquetes tienen su propio `pruebas-*.md`.

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-P1 | E2E | `e2e/tests/quitar-campos-panel.spec.ts:48` | `pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts -g "CA-P1"` | no ejecutada (pila no disponible) |
| CA-P2 | unitaria (render estático) | `apps/panel-admin/src/componentes/FactoresSeveridad.test.ts:45`, `:55`, `:59` | `pnpm --filter panel-admin exec vitest run src/componentes/FactoresSeveridad.test.ts -t "CA-P2"` | rojo (3/3) |
| CA-P2 | E2E | `e2e/tests/quitar-campos-panel.spec.ts:79` | `pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts -g "CA-P2"` | no ejecutada (pila no disponible) |
| CA-P3 | unitaria | `apps/panel-admin/src/lib/formato-sin-campos.test.ts:5` | `pnpm --filter panel-admin exec vitest run src/lib/formato-sin-campos.test.ts -t "CA-P3"` | rojo |
| CA-P3 | comando | — | `pnpm --filter panel-admin typecheck` | hoy verde (ver hallazgos) |
| CA-P4 | E2E | `e2e/tests/quitar-campos-panel.spec.ts:96` | `pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts -g "CA-P4"` | no ejecutada (pila no disponible) |

`pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts --list` lista las 3 pruebas (proyecto `chromium`).
Biome (`biome check`) y `tsc --noEmit` de panel-admin pasan sobre los archivos nuevos.

## Salida literal de cada fallo (recortada)

### CA-P2 (unitaria)

```
 ❯ src/componentes/FactoresSeveridad.test.ts (3 tests | 3 failed) 31ms
     × CA-P2: con T = muslo y F = permanente hay exactamente dos filas, Tirante ×2 y Frecuencia 17ms
     × CA-P2: el título dice «Cómo se llegó a 10 de 12 puntos» 6ms
     × CA-P2: la fórmula es «puntaje = 2 × tirante + frecuencia» y no nombra duración ni afectación 4ms

AssertionError: expected [ 'Tirante ×2', 'Duración', …(2) ] to have a length of 2 but got 4
 ❯ src/componentes/FactoresSeveridad.test.ts:47:21

AssertionError: expected 'Cómo se llegó a 10 de 20 puntos Tiran…' to contain 'Cómo se llegó a 10 de 12 puntos'
Received: "Cómo se llegó a 10 de 20 puntos Tirante ×2 3/4 Duración /4 Frecuencia 4/4 Afectación /4
  puntaje = 2 × tirante + duración + frecuencia + afectación. El tirante pesa doble …"
 ❯ src/componentes/FactoresSeveridad.test.ts:56:25

AssertionError: expected 'Cómo se llegó a 10 de 20 puntos Tiran…' to contain 'puntaje = 2 × tirante + frecuencia'
 ❯ src/componentes/FactoresSeveridad.test.ts:61:15
```

### CA-P3

```
 FAIL  src/lib/formato-sin-campos.test.ts > formato sin duración ni afectación > CA-P3: formato.ts no exporta etiquetaAfectacion ni etiquetaDuracion y conserva tirante y frecuencia
AssertionError: expected [ 'ZONA_HORARIA', …(27) ] to not include 'etiquetaAfectacion'
 ❯ src/lib/formato-sin-campos.test.ts:7:28
      6|     const exportados = Object.keys(formato);
      7|     expect(exportados).not.toContain('etiquetaAfectacion');
      8|     expect(exportados).not.toContain('etiquetaDuracion');
```

### CA-P1, CA-P2 (E2E), CA-P4

No ejecutadas: `curl -s http://127.0.0.1:3001/ready` no responde (código 7, conexión rechazada).
Fallo esperado con la pila levantada y sin implementar: CA-P1 encuentra «Manzana», «Dirección
aproximada», «Duración estimada» y «Afectación» entre los `dl.lista-datos > dt`; CA-P2 lee
«Cómo se llegó a 10 de 20 puntos» y 4 filas; CA-P4 registra peticiones a
`/geo/v1/teselas/manzana/16/…` (o al GeoJSON de manzana) desde el detalle, que abre el mapa en zoom 16.

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| El detalle del panel conserva «En el mapa público se ve» | ninguno previo; lo cubre la nueva `quitar-campos-panel.spec.ts:48` (CA-P1), que además comprueba el texto «En su sitio, redondeado a 5 decimales» para `via_publica` |
| La capa `manzana` se sigue sirviendo | `e2e/tests/datos-reales.spec.ts:222`, `e2e/tests/api-contratos.spec.ts:99` (no tocados); CA-P4 además exige que `GET /geo/v1/capas` siga listando `manzana` |
| Etiquetas de severidad, estado, tirante, fechas, avisos de resolución | `apps/panel-admin/src/lib/formato.test.ts` (sin cambios) |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-P1 | E2E; pila no disponible (`/ready` en 3001 no responde) |
| CA-P2 (E2E) | Ídem; el criterio queda en rojo por la unitaria |
| CA-P4 | Ídem |

## Hallazgos sobre la spec

- **CA-P2:** la spec pide E2E «o unitaria si el cálculo se extrae a `lib/`». Para no tocar
  producción, la unitaria renderiza el componente real con `react-dom/server`
  (`renderToStaticMarkup`) en un `.test.ts` dentro de `src/componentes/`; entra en el `include` de
  `vitest.config.ts` (`src/**/*.test.ts`). Se mantiene también la E2E. Lectura estricta: además de
  contener la fórmula, el desglose no puede nombrar «duración» ni «afectación», y los puntos de las
  filas deben ser `3/4` y `4/4`.
- **CA-P3:** `pnpm --filter panel-admin typecheck` hoy pasa porque contracts aún no cambió; se
  pondrá rojo cuando contracts quite `Duracion`, `Afectacion`, `PUNTOS.duracion`, etc., y vuelve a
  verde solo con la implementación. No es una prueba escrita sino un comando de la puerta.
- **CA-P4:** la spec pide «no hay capa ni fuente `capa-manzana`», pero el mapa del panel no expone
  la instancia de MapLibre (ni en `window` ni con `data-testid`), así que los ids de capa no son
  observables desde Playwright sin tocar producción. La prueba verifica lo observable: ninguna
  petición a la URL de la capa `manzana` (prefijo de su `url` en `/geo/v1/capas` y
  `/geo/v1/teselas/manzana/`) y sí a las de distrito y UV, con el mapa del detalle en zoom 16. Si
  un implementador dibujara manzanas desde otra fuente ya cargada, esta prueba no lo detectaría.
- CA-P4 usa `waitForTimeout(1500)` tras ver las peticiones de UV para dar margen a una eventual
  petición de manzana; es la única espera fija del archivo.
- Fuera de mi alcance: `pnpm --filter e2e exec tsc --noEmit` falla hoy por
  `e2e/tests/quitar-campos-web.spec.ts:43` y `:281` (archivo de otro redactor); mi archivo no
  aporta errores.

---

# Paquete: e2e

## Pruebas en rojo — Quitar manzana, dirección aproximada, duración y afectación del reporte (paquete `e2e`)

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Alcance de este archivo:** solo los archivos existentes de `e2e/tests/` (`ayudas.ts`, `recorrido-completo.spec.ts`, `resiliencia-interfaz.spec.ts`, `navegacion.spec.ts`, `separacion-publica-tecnica.spec.ts`, `api-contratos.spec.ts`, `datos-reales.spec.ts`). `quitar-campos-web.spec.ts` y `quitar-campos-panel.spec.ts` son de otros redactores.

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-X1 (ayuda) | E2E | `e2e/tests/ayudas.ts:28` (`reporteValido` sin `duracion_estimada` ni `afectacion`) | — (la usan los tests de abajo) | — |
| CA-X1 (API) | E2E | `e2e/tests/api-contratos.spec.ts:87` | `pnpm --filter e2e exec playwright test tests/api-contratos.spec.ts -g "CA-X1"` | no ejecutado: pila no disponible; rojo esperado (400 `PAYLOAD_INVALIDO`, ver sonda) |
| CA-X1 (recorrido) | E2E | `e2e/tests/recorrido-completo.spec.ts:24` | `pnpm --filter e2e exec playwright test tests/recorrido-completo.spec.ts -g "CA-X1"` | no ejecutado: pila no disponible; rojo esperado |
| CA-X1 (borrador) | E2E | `e2e/tests/resiliencia-interfaz.spec.ts:96` | `pnpm --filter e2e exec playwright test tests/resiliencia-interfaz.spec.ts -g "CA-X1"` | no ejecutado; probablemente **verde** hoy (ver hallazgos) |
| CA-X2 | E2E | `e2e/tests/navegacion.spec.ts:42` | `pnpm --filter e2e exec playwright test tests/navegacion.spec.ts -g "CA-X2"` | no ejecutado: pila no disponible; rojo esperado |
| CA-X3 | E2E | `e2e/tests/separacion-publica-tecnica.spec.ts:142` | `pnpm --filter e2e exec playwright test tests/separacion-publica-tecnica.spec.ts -g "CA-X3"` | no ejecutado: pila no disponible; rojo esperado |
| CA-X4 | E2E | `e2e/tests/api-contratos.spec.ts:112` y `e2e/tests/datos-reales.spec.ts:222` (sin modificar) | `pnpm --filter e2e exec playwright test tests/api-contratos.spec.ts tests/datos-reales.spec.ts -g "capas se sirven\|capa de manzanas"` | no ejecutado; debe seguir **verde** (es regresión, no rojo) |

`playwright test --list` (con `npx -y pnpm@12.4.1`, porque el `pnpm` global falla con `.tools\pnpm\12.4.1`) lista los 90 tests de 14 archivos sin errores de compilación; `tsc --noEmit -p e2e/tsconfig.json` y `biome lint` sobre los seis archivos tocados pasan.

## Salida literal de cada fallo (recortada)

La pila no estaba levantada (`curl -s http://127.0.0.1:3001/ready` → código 7, conexión rechazada; 3000, 3002 y 3100 igual), así que no hay salida de Playwright. Lo que sigue es la razón por la que cada prueba falla hoy.

### CA-X1 (API y todo lo que usa `reporteValido`)

Sonda contra el contrato vigente (`packages/contracts/dist`) con el payload nuevo de `reporteValido`:

```
safeParse(reporteValido).success = false
duracion_estimada: Invalid option: expected one of "menos_30min"|"30min_2h"|"2h_12h"|"mas_12h"
afectacion: Invalid option: expected one of "peatonal"|"vehicular"|"ingreso_viviendas"|"corte_total_via"
```

api-core valida con ese esquema, así que `crearReportePorApi` recibe 400 y falla en
`expect(r.status(), await r.text()).toBe(201)` (`ayudas.ts`, `crearReportePorApi`). Tras implementar,
el test además exige `severidad_calculada === 'media'` y `severidad_puntaje === 7` (2·2 + 3) en la vista técnica.

### CA-X1 (recorrido)

Tras marcar `tirante_estimado=rodilla`, en el paso 2 actual no hay `input[name="frecuencia"]`, se pulsa «Siguiente» y el
formulario lo bloquea porque falta la duración (paso 2 de hoy = tirante + duración); la frecuencia nunca aparece y
`locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check()` agota el tiempo. Si el formulario dejara pasar,
fallaría después en `getByText('7/12')` (hoy muestra `N/20`) y en la ausencia de `/\d+\/20\b/`.

### CA-X2

`getByText('puntaje = 2 × tirante + frecuencia', { exact: true })` no encuentra nada: `ComoFunciona.tsx:229` dice
`puntaje = 2 × tirante + duración + frecuencia + afectación`, y con `exact: true` no hay coincidencia parcial.

### CA-X3

`vistas.ts:137–151` serializa `manzana_id`, `direccion_aprox`, `duracion_estimada` y `afectacion` en la vista pública y en la
técnica, así que `expect(camposQuitadosPresentes(f.properties)).toEqual([])` falla en el primer reporte de la
primera vista («pública sin sesión») con los cuatro nombres en el array recibido.

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| La ruta pública devuelve lo mismo con cookie de técnico que sin ella | `separacion-publica-tecnica.spec.ts:67` y `:89` (sin cambios) |
| La vista técnica exige sesión (401) y no degrada a la pública | `separacion-publica-tecnica.spec.ts:114` (sin cambios) |
| Los puntos críticos no publican medidas de la geometría exacta | `separacion-publica-tecnica.spec.ts:184` (sin cambios) |
| Moderación previa: un reporte `nuevo` no es público | `recorrido-completo.spec.ts` «el reporte no se publica hasta que lo validan» (sin cambios) |
| Exportación con nota metodológica | `recorrido-completo.spec.ts` «sale en la exportación del técnico…», `api-contratos.spec.ts` «la exportación exige sesión de técnico» (sin cambios) |
| La capa `manzana` se sigue listando y sirviendo (CA-X4) | `api-contratos.spec.ts:112` (espera `['distrito_municipal','manzana','unidad_vecinal']`), `datos-reales.spec.ts:222` — **no se modificaron**, a propósito |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-X1, CA-X2, CA-X3, CA-X4 | Pila no disponible (api-core 3001, geo-service 3002, web 3000 y panel 3100 sin escuchar). No se levantó: correr `pnpm db:local`, `pnpm db:seed:samples`, `pnpm dev` y luego los comandos de la tabla. |

## Hallazgos sobre la spec

- **P-4 sin decidir** (§9 no lo resuelve): el recorrido y el test del borrador aceptan 4 o 5 pasos. El recorrido detecta si la frecuencia está en el mismo paso que el tirante; el borrador exige `^Paso 2 de [45]$` y que el total sea el mismo al volver al paso 1. Si se decide P-4, conviene fijar el número.
- **`7/12` en la vista previa del formulario:** ningún criterio fija el formato del puntaje en el formulario (hoy `FormularioReporte.tsx:813–814,1036` escribe `/20` a mano). Elegí la lectura más estricta de D1 (rango 3–12): el recorrido exige `7/12` y que no quede ningún `N/20`. Si el implementador de web-ciudadano quita el puntaje en vez de cambiarlo, este test lo marcará.
- **CA-X1 (borrador) probablemente pasa hoy:** tras quitar la línea de duración, marcar solo el tirante y recargar no depende de la implementación. Se deja porque es la adaptación que exige CA-X1 («ninguno referencia `duracion_estimada` ni `afectacion`»), no una prueba de rojo; el rojo de CA-X1 lo dan el recorrido y el test de API.
- **CA-X1 «ninguno referencia…» es estático:** se verifica con `grep -n "duracion_estimada\|afectacion" e2e/tests/ayudas.ts e2e/tests/recorrido-completo.spec.ts e2e/tests/resiliencia-interfaz.spec.ts` → sin coincidencias (código 1). Por eso las pruebas de ausencia de esos radios no están en estos archivos: las cubre CA-W1 en `quitar-campos-web.spec.ts`.
- **Rojo colateral esperado:** mientras la API exija los dos campos, también fallan por el mismo 400 `api-contratos.spec.ts:60` (el caso «fuera» espera 422 y recibirá 400) y los casos de `cuenta-ciudadana.spec.ts` que usan `reporteValido` (archivo fuera de este encargo, no tocado). Todos vuelven a verde con CA-C1 + CA-A1.
- **CA-X3 depende del seed:** necesita al menos un reporte `validado` publicado; con `pnpm db:seed:samples` lo hay.
