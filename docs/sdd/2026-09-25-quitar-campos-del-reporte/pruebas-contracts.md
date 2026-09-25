# Pruebas en rojo — Quitar manzana, dirección aproximada, duración y afectación del reporte · `packages/contracts`

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
# Changelog — contracts

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
