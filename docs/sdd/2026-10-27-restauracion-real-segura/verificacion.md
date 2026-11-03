> Informe original del subagente, con vínculos relativos adaptados a su evidencia local ignorada en `.turbo/`. Resultados y texto conservados. SHA-256 del original: `41159929efe17a99bb0aa4187b1fa76efe2b8fe12a9d1646feebdb052feb8008`.

# Verificación independiente M10.3 — gate previa al ensayo

**CONFORME UNITARIO: 77/77 propios, 0 fallos, 0 skip, 0 regresiones.** Ejecutado por Meitner el 28/10/2026. El principal debe combinar este resultado con la revisión funcional y de seguridad de Laplace antes de operar. Este dictamen acredita preparación unitaria; no acredita ni ejecuta el ensayo real.

- Node 29/29, runner 15/15 y Bash 33/33. Los 46 anteriores conservan nombres, orden, cuerpos y aserciones; 31 nuevos coinciden con las listas de Turing. Comparación exacta de regiones F0 normalizando solo CRLF, sin trim: [77 casos](../../../.turbo/m10-3-2026-10-27/verificador/comparacion-test-por-test.md), [detalle y hashes](../../../.turbo/m10-3-2026-10-27/verificador/comparacion-test-por-test.json).
- Sintaxis Node 4/4, Bash 2/2, Biome 4 archivos sin modificaciones y YAML 2.9.1 instalado con claves únicas: aprobados. No se repitió ningún control aprobado.
- [CI contra F0](../../../.turbo/m10-3-2026-10-27/verificador/comparacion-ci.json): otros seis jobs, incluido `postgres-real`, idénticos. Global/guardas y resto de pasos de `infra` iguales. Delta: pnpm/action-setup, `pnpm install --frozen-lockfile` y ampliación del paso de sintaxis/suites. El job completo **no es offline**; conserva Docker/Compose/build e instalación sin `--offline`. CI remoto NO_EJECUTADO.
- **ShellCheck NO_VERIFICADO: ausente.** Detector Git Bash exit3 y where.exe exit1; ningún exit del detector se cuenta como aprobación de ShellCheck.
- RAM libre antes de cada subproceso registrada, mínimo **2235 MiB**, umbral 1500. Hijos con entorno privado por lista permitida: COMSPEC, SystemRoot, WINDIR, PATH fijo, TEMP/TMP propios, M10_SCRATCH y NO_COLOR. No heredan PG/AWS/S3, NODE_OPTIONS ni BASH_ENV.

Baseline reutilizada: Turing 23 Node + 23 Bash; logs/metadata/hashes atribuidos en la comparación. Rojos heredados conservados y no repetidos. HEAD no se usa como antes; el antes son las seis copias íntegras F0 y dos archivos nuevos ausentes.

## Aislamiento y significado de las pruebas

Las dos suites Node bloquean procesos, red y lectura síncrona de `.env` antes del import; la suite Bash instala denegadores antes del source y reinicia su entorno con `env -i`. Se ejercitan fallos cerrados por operadores/SQL ausentes, destino ocupado, catálogo alterado, errores SQL, checkpoints inciertos y rollback en la misma sesión simulada. El arnés Bash crea y retira únicamente sus fixtures temporales propios dentro de este ownership.

La suite Node ejercita SQL literal del catálogo Node y Shell en PGlite/WASM en memoria; incluye semillas exactas, cambios de configuración, datos ajenos y rollback. Esto no prueba PostGIS ni PostgreSQL externo. Las comprobaciones estáticas y mocks no acreditan dump/restore/cifrado reales.

Sin CLI operativo ni invocación adicional de estado, sin `.env`/credenciales, PostgreSQL externo/PostGIS, Docker/GPG/psql/pg_dump/pg_restore/rclone reales, HTTP/red/S3, descargas/instalación o escrituras Git. Sin producto/documentos ajenos editados. Escritura propia solo en `verificador/`. No diario operativo creado. Sin TS/build/apps ni suite global innecesaria.

## Incidencias del entorno y cierre

MSYS `0xC0000022` impidió arrancar la suite, ambas sintaxis Bash y el detector ShellCheck en sandbox. Los mismos arneses/argumentos se reintentaron fuera por herramienta: suite/sintaxis exit0; detector exit3 por ausencia. Ambos intentos se conservan; no son regresiones de producto.

`pnpm exec biome` no encontró el comando con el entorno reducido (exit1); la invocación directa del Biome ya instalado por Node aprobó sin instalar ni cambiar fuentes. Un intento de consulta de hijos mediante PowerShell -File falló por AuthorizationManager. Se sustituyó por Get-Process local, sin cambios de políticas.

Hubo recambio del host de herramientas entre YAML14:12 y comparación14:47; se recuperaron los artefactos, sin repetir suites. Las duraciones son las registradas por cada proceso, no el intervalo de esa interrupción.

[Cierre de procesos](../../../.turbo/m10-3-2026-10-27/verificador/hijos.json): cero PIDs propios registrados activos, cero Node/Bash y cero sesiones pendientes a 14:50:27UTC. Todos los ejecutores esperaron su terminación. No se afirma inventario PPID global por CIM. No se crearon subagentes. Recursos heavy liberados para el principal.

## Integridad

[SHA antes](../../../.turbo/m10-3-2026-10-27/verificador/sha-antes.json) 14:09:22UTC y [SHA después](../../../.turbo/m10-3-2026-10-27/verificador/sha-despues.json) 14:49:48UTC: **8/8 fuentes iguales al freeze**, **6/6 copias F0 íntegras**. Freeze SHA256 `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f`. HEAD `59b80781030707b8c3334bfbfd40f80000c60a57`, rama `codex/cuatro-categorias`, coinciden con F0.

| Fuente | SHA256 final |
|---|---|
| scripts/respaldo.mjs | 546d47ad980e1d7961d0c340bf78139ad340dc528ae9df8f9ec6c6fcb5509afa |
| scripts/respaldo.test.mjs | 23a53a5c95f2f84ee4597bad3fa28c7ab202f53d712b1373c42b37123d0d9e5b |
| infra/respaldo/respaldo.sh | 58c793facdf7476f6d2d8a3af6d265aa43bb203209aca7c2513cd89c7968a1c8 |
| infra/respaldo/respaldo.test.sh | e9b9753c9a65faee7d895c9f3b04a8bad23a6f5afed0c0064c7a75223a7a29b8 |
| scripts/ensayar-respaldo-multitematico.mjs | 8d0f84159d16a066fc77946d321f9ad09994f4a739a67e3ad584c6d77d7180b5 |
| scripts/ensayar-respaldo-multitematico.test.mjs | d7b8b685cdd9cbec6cba476e6e730ef8b6689f3c418c15070000645a61c2cd3f |
| .github/workflows/ci.yml | 3d71edf78157c03dcdb8bb71297e3ebdf8b6a22960001ae7d676432d44297aac |
| docs/operaciones/respaldo-y-restauracion.md | 9fe662583c9028a772bd92d8c86c0c6429a8fb118fba4099d125ce4bf484a766 |

## Evidencia propia literal

Los enlaces contienen stdout/stderr íntegros y JSON con comando, argumentos, exit, RAM, UTC y duración. Los intentos fallidos se conservan.

| Control/intento | Exit | RAM MiB | Duración ms | Logs/metadatos |
|---|---:|---:|---:|---|
| node-suite.1 | 0 | 2246 | 2022 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-suite.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-suite.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-suite.1.json) |
| runner-suite.1 | 0 | 2260 | 232 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/runner-suite.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/runner-suite.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/runner-suite.1.json) |
| bash-suite.1 | 3221225794 | 2347 | 595 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-suite.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-suite.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-suite.1.json) |
| bash-suite.2 | 0 | 2321 | 17524 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-suite.2.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-suite.2.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-suite.2.json) |
| node-syntax-1.1 | 0 | 2333 | 91 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-1.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-1.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-1.1.json) |
| node-syntax-2.1 | 0 | 2329 | 87 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-2.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-2.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-2.1.json) |
| node-syntax-3.1 | 0 | 2334 | 92 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-3.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-3.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-3.1.json) |
| node-syntax-4.1 | 0 | 2330 | 100 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-4.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-4.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/node-syntax-4.1.json) |
| bash-syntax.1 | 3221225794 | 2312 | 402 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-syntax.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-syntax.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-syntax.1.json) |
| bash-test-syntax.1 | 3221225794 | 2334 | 380 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-test-syntax.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-test-syntax.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-test-syntax.1.json) |
| biome.1 | 1 | 2343 | 480 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/biome.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/biome.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/biome.1.json) |
| bash-syntax.2 | 0 | 2264 | 84 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-syntax.2.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-syntax.2.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-syntax.2.json) |
| bash-test-syntax.2 | 0 | 2235 | 105 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-test-syntax.2.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-test-syntax.2.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/bash-test-syntax.2.json) |
| biome-instalado.1 | 0 | 2786 | 299 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/biome-instalado.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/biome-instalado.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/biome-instalado.1.json) |
| yaml-ci.1 | 0 | 2774 | 260 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/yaml-ci.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/yaml-ci.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/yaml-ci.1.json) |
| comparar.1 | 0 | 2935 | 592 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/comparar.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/comparar.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/comparar.1.json) |
| shellcheck-windows.1 | 1 | 2342 | 85 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-windows.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-windows.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-windows.1.json) |
| shellcheck-detectar.1 | 3221225794 | 2354 | 647 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-detectar.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-detectar.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-detectar.1.json) |
| head.1 | 0 | 2357 | 75 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/head.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/head.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/head.1.json) |
| branch.1 | 0 | 2256 | 92 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/branch.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/branch.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/branch.1.json) |
| shellcheck-detectar.2 | 3 | 2347 | 147 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-detectar.2.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-detectar.2.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/shellcheck-detectar.2.json) |
| hijos.1 | 1 | 2412 | 304 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador/logs/hijos.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador/logs/hijos.1.stderr.log) · [args/exit/RAM](../../../.turbo/m10-3-2026-10-27/verificador/logs/hijos.1.json) |

Resultado estructurado: [resultado.json](../../../.turbo/m10-3-2026-10-27/verificador/resultado.json). Ningún bloqueante detectado por esta verificación unitaria. ShellCheck, CI remoto, operación real, fotos externas/S3, custodia durable, corte eléctrico, concurrencia, producción, todos los esquemas históricos y cierre M10/Fase1 permanecen fuera de lo acreditado.
