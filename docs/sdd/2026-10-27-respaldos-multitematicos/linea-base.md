# Línea base de M10.2

Consolidación del principal el **2026-10-27**, a partir de los controles ejecutados por
el trabajador raíz Bernoulli antes de editar. No se repitió la versión previa ni se usó
HEAD para reconstruirla. [F0 e inventario](arbol-inicial.txt) conservan cuatro copias y
sus SHA-256; las dos suites son nuevas. No existía una suite de respaldo anterior y
no se atribuye un resultado de cero pruebas como aprobado.

## Controles previos ejecutados

Salidas literales del implementador en
`.turbo/m10-2-2026-10-27/implementador/baseline-*.log` y [entrega](implementacion.md).

```text
$ node --check scripts/respaldo.mjs
EXIT=0

$ C:/Program Files/Git/bin/bash.exe -n infra/respaldo/respaldo.sh
fatal error - NtCreateDirectoryObject(...): 0xC0000022
EXIT=3221225794

$ C:/Program Files/Git/bin/bash.exe -n infra/respaldo/respaldo.sh
EXIT=0

$ C:/Users/HP/.local/bin/pnpm.exe --config.verify-deps-before-run=false exec biome check scripts/respaldo.mjs
Checked 1 file in 14ms. No fixes applied.
EXIT=0
```

La línea abreviada del error MSYS omite únicamente su identificador de sesión; el log
original conserva el mensaje completo. El primer Bash no llegó a validar el código;
el reintento de la misma comprobación estática fuera del sandbox aprobó. RAM libre
de estos controles: 2551–2590 MiB. No se instalaron herramientas.

## Rojos planificados y defectos de partida

- Node: 18 casos, **1 aprobado y 17 fallidos**. Bash estricto: 16 casos,
  **2 aprobados y 14 fallidos**. Evidencias `rojo-node.log` y `rojo-bash-estricto.log`.
- Los helpers nuevos aún no existían y el import Node anterior iniciaba el CLI.
  Ese rojo no acredita por sí solo detección semántica de pérdidas; la evidencia posterior
  incluye tres mutantes que fallan por aserciones sobre contenido, tabla y catálogo.
- Node contaba la vista de Inundaciones; Shell esperaba datos de esa vista y su guarda
  de vacío omitía otras categorías. Se corrigen dentro del inventario aprobado.
- **Heredado y conservado:** `restaurar` en Node borra/recrea su destino y solo protege
  BASE por igualdad. La nueva guarda de vacío es de Shell. No se ejecutó ni se declara
  seguro el CLI Node de restauración sobre un destino ocupado; su corrección y ensayo
  están propuestos en M10.3.

## Alcance de la comparación

Se comparan sintaxis/formato preexistentes y las nuevas suites. No corresponden typecheck,
builds ni suites de apps intactas a estos cambios `.mjs`/`.sh`. ShellCheck está ausente:
**NO_VERIFICADO local**, conservado en CI. Los rojos globales históricos de lint/audit y
las omisiones PG/S3 de la API no se arreglan ni se presentan como pruebas de esta corrida.

Todos los operadores de las pruebas se sustituyeron antes de import/source, con entorno
privado y sin `.env`. No hubo PostgreSQL, Docker, S3, HTTP, GPG o red reales en estos tests.
La operación normal de la demo se registra por separado y no amplía esta línea base.
