# Entrega M10.2 — implementación acotada, 2026-10-27

Meta alcanzada en lógica unitaria simulada. FUENTE_QUIETA: seis archivos congelados. Revisión independiente a cargo del principal; no se espera para este handback.

## Archivos y freeze SHA-256

- scripts/respaldo.mjs: `e302dc061bc5279cd47d46e4f3099b46a69dd18c931a4227b3486ca88efb7c0d`
- scripts/respaldo.test.mjs: `e5219c753edc5897d0999d658ad477fd8b7361474ff89ce4dc9c8c013a39d325`
- infra/respaldo/respaldo.sh: `64223b6da233de4d06b154b341b50803776a88c7ddef0a1277b794aac95f2dde`
- infra/respaldo/respaldo.test.sh: `608fa28ce9445efccbf4293fa2140b50d317798a695e04b4484b9ffb70b68708`
- .github/workflows/ci.yml: `c8c9381e0f8c2735e4a25ad8a756580df8b6af93473eb42eb1d37f1d3f538755`
- docs/operaciones/respaldo-y-restauracion.md: `9a978a5d5b8859d47c014ee111f41c54802d05545744d1371d40304fb7f0e392`

## Antes/después

No había suite anterior ni typecheck propio para estos scripts nativos. No se atribuye un PASS vacío. Baseline: Node --check y Biome verdes; Bash -n bloqueado inicialmente por MSYS/sandbox y verde en el reintento exclusivamente estático. Rojo planificado: Node 1 PASS/17 FAIL (18 tests); Bash estricto 2 PASS/14 FAIL (16 casos). Final: Node 23 PASS/0 FAIL/0 SKIP; Bash 23 PASS/0 FAIL. Los 18 casos Node y 16 Bash iniciales siguen presentes; se añadieron 5 y 7, respectivamente. Sintaxis Node/Bash y Biome verdes, sin regresiones de los controles previos. Typecheck TS no aplica a estos archivos .mjs/.sh; no se ejecutó una suite ajena ni un build.

## CA → pruebas y evidencia

| CA | Evidencia |
|---|---|
| 1 | Node tabla física actual/previa, rechazo de relkind vista; Bash actual/previo y rechazo de TABLE DATA de vista |
| 2 | Pérdida bache/basura/area_verde; cinco cambios de campos con igual conteo; NULL/vacío; catálogo alterado; evidencia incompleta; proyección antigua y columna nueva legítima |
| 3 | Destino ocupado por otras categorías, falta de ejecutor/error SQL; manifiesto omitido, duplicado, versión/objeto/formato/tamaños/hashes/conteos inconsistentes |
| 4 | Importación sin acción, operadores bloqueados, SQL inyectado obligatorio; cifrar/descifrar idénticos a F0, manifiesto formato 1 preservado |
| 5 | Rojo y verde guardados; tres mutantes detectados por aserciones, sin SQL/operadores reales |
| 6 | Node/Bash syntax, Biome, YAML instalado; job postgres-real idéntico a F0; shellcheck ausente y conservado en CI |

## Límites y entrega

Solo mocks. No se restauró ni cifró un respaldo real, ni se conectó a PG/Docker/S3/HTTP/red, ni se ejecutó el CLI operativo. Entornos de hijos privados por allowlist y sentinels sintéticos; sin leer .env ni persistir credenciales. Temporales propios comprobados por ruta absoluta y limpiados solo dentro del scratch. No se modificaron Git, dependencias, AGENTS/CLAUDE, contratos, DB, apps, API, geo, datos ni procesos/sesiones de la demo. No hubo nuevos hallazgos confirmados fuera de los seis archivos; los cambios ajenos iniciales no fueron editados ni revertidos. Shellcheck NO_VERIFICADO localmente por ausencia, sin descarga. La semántica SQL, restauración y cifrado reales y el ensayo multitemático operacional siguen pendientes. El shell valida integridad del archivo y conteos completos; la igualdad del contenido restaurado la compara el simulacro Node. No cierra producción, M10 completo ni Fase 1.

## Salidas literales

### baseline-node

```text
RAM=2551 MiB
$ node --check scripts/respaldo.mjs
EXIT=0
```

### baseline-bash

```text
RAM=2553 MiB
$ C:/Program Files/Git/bin/bash.exe -n infra/respaldo/respaldo.sh
      0 [main] bash (18480) C:\Program Files\Git\bin\..\usr\bin\bash.exe: *** fatal error - NtCreateDirectoryObject(\BaseNamedObjects\msys-2.0S5-1888ae32e00d56aa): 0xC0000022
EXIT=3221225794
```

### baseline-bash-reintento

```text
RAM=2590 MiB
$ C:/Program Files/Git/bin/bash.exe -n infra/respaldo/respaldo.sh
EXIT=0
```

### baseline-biome

```text
RAM=2552 MiB
$ C:/Users/HP/.local/bin/pnpm.exe --config.verify-deps-before-run=false exec biome check scripts/respaldo.mjs
Checked 1 file in 14ms. No fixes applied.
EXIT=0
```

### final-node

```text
RAM=3031 MiB
$ node --test scripts/respaldo.test.mjs
✔ importar no imprime, cambia exitCode ni inicia CLI/procesos (1.6782ms)
✔ sin SQL inyectado falla cerrado (0.4092ms)
✔ actual compara tabla física y las cuatro categorías con contenido (8.679ms)
✔ rechaza pérdida de bache aunque Inundaciones siga intacta (0.4817ms)
✔ rechaza pérdida de basura aunque Inundaciones siga intacta (0.3789ms)
✔ rechaza pérdida de area_verde aunque Inundaciones siga intacta (0.3261ms)
✔ rechaza cambio en categoria con igual cantidad total (0.3689ms)
✔ rechaza cambio en detalle con igual cantidad total (0.2848ms)
✔ rechaza cambio en detalle_version con igual cantidad total (0.3063ms)
✔ rechaza cambio en geom con igual cantidad total (0.4054ms)
✔ rechaza cambio en descripcion con igual cantidad total (0.2853ms)
✔ NULL no se confunde con cadena vacía (0.4404ms)
✔ orden de filas no afecta evidencia (0.26ms)
✔ previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas (0.4115ms)
✔ columna actual perdida no se oculta como compatibilidad (0.2684ms)
✔ rechaza vista usada como tabla física (0.1332ms)
✔ rechaza migración ausente o inconsistente y error SQL (1.027ms)
✔ mock no previsto y operadores reales permanecen bloqueados (0.1605ms)
✔ pérdida o cambio de catálogo de categorías falla (0.2181ms)
✔ evidencia parcial de categorías no puede pasar por completa (0.2809ms)
✔ conteos inválidos, geometría inválida e índices perdidos fallan (0.5486ms)
✔ mismas columnas actuales en versión posterior admite columna nueva (0.2124ms)
✔ oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL (0.3018ms)
ℹ tests 23
ℹ suites 0
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 128.7549
EXIT=0
```

### final-node-sintaxis

```text
RAM=3032 MiB
$ node --check scripts/respaldo.mjs
EXIT=0
```

### final-node-test-sintaxis

```text
RAM=3038 MiB
$ node --check scripts/respaldo.test.mjs
EXIT=0
```

### final-bash

```text
RAM=2990 MiB
$ C:/Program Files/Git/bin/bash.exe --noprofile --norc infra/respaldo/respaldo.test.sh
PASS actual exige reporte físico
PASS previo0020 acepta tabla antigua
PASS actual rechaza vista como TABLE DATA
PASS previo rechaza versión inconsistente
PASS migración inválida
PASS destino vacío actual
PASS destino ocupado solo otras categorías
PASS sin ejecutor SQL no hay fallback
PASS error SQL no es vacío
PASS manifiesto completo coincide con archivo leído
PASS manifiesto omite tabla física
PASS versión de manifiesto inconsistente
PASS manifiesto omite otra tabla
PASS formato desconocido
PASS manifiesto sin integridad
PASS manifiesto sin tamaño
PASS manifiesto con tamaño inválido
PASS objeto y migración deben coincidir
PASS conteo distinto del archivo
PASS tabla duplicada en manifiesto
PASS manifiesto previo0020 compatible
PASS parser COPY cuenta filas reales incluidas NULL/vacío
PASS error al leer archivo propaga fallo
TOTAL=23 PASS=23 FAIL=0
EXIT=0
```

### final-bash-sintaxis

```text
RAM=3007 MiB
$ C:/Program Files/Git/bin/bash.exe -n infra/respaldo/respaldo.sh
EXIT=0
```

### final-bash-test-sintaxis

```text
RAM=2992 MiB
$ C:/Program Files/Git/bin/bash.exe -n infra/respaldo/respaldo.test.sh
EXIT=0
```

### final-biome

```text
RAM=3031 MiB
$ C:/Users/HP/.local/bin/pnpm.exe --config.verify-deps-before-run=false exec biome check scripts/respaldo.mjs scripts/respaldo.test.mjs
Checked 2 files in 20ms. No fixes applied.
EXIT=0
```

### final-yaml

```text
RAM=3030 MiB
$ node .turbo/m10-2-2026-10-27/implementador/herramientas.mjs
Node v24.15.0
YAML válido; controles aislados presentes, infra sin install, postgres-real idéntico a F0
EXIT=0
```

### final-efectividad

```text
RAM=3028 MiB
$ node .turbo/m10-2-2026-10-27/implementador/efectividad.mjs
DETECTADO sin-comparar-contenido; EXIT=1; RAM=3016 MiB
DETECTADO tabla-vista-actual; EXIT=1; RAM=3019 MiB
DETECTADO ignorar-catalogo; EXIT=1; RAM=3000 MiB
EXIT=0
```

### shellcheck

```text
RAM=2537 MiB
$ C:/Program Files/Git/bin/bash.exe --noprofile --norc -c if command -v shellcheck >/dev/null 2>&1; then shellcheck -x infra/respaldo/respaldo.sh infra/respaldo/respaldo.test.sh; else printf "Shellcheck NO_VERIFICADO: no instalado; se conserva en CI\n"; fi
Shellcheck NO_VERIFICADO: no instalado; se conserva en CI
EXIT=0
```

