# M10.1 — Línea base

Capturada el27/10 antes de editar producto por el trabajador raíz nativo Feynman.
Plan aprobado el26/10, ejecutable tras el cierreM9. Foto de952archivos/74copias API
en `.turbo/m10-2026-10-26/f0/`; cambios locales anteriores preservados como ajenos.

## Entorno y restricciones

Node24, pnpm local con`--config.verify-deps-before-run=false`. Sin cargar.env; el wrapper
retira URLs deDB, PG/S3/AWS y otros habilitantes de integración real de los procesos hijos.
TMP/TEMP/TMPDIR se fijan únicamente para esos procesos dentro del scratch de la corrida.
Pruebas PGlite y servidores locales de fixtures; ninguna conexión a PostgreSQL real,
demo, bases protegidas o S3. La demo permanece con sus builds anteriores.

## Intentos conservados y resultado válido

| Intento | Resultado |
|---|---|
| `baseline-test` | Exit1 antes de tests, EPERM al renombrar temporales Vite del sandbox;37archivos no cargaron. No es una suite ejecutada ni una regresión |
| `baseline-test-local-temp` | Exit1: temporales resueltos, pero conexiones loopback de fixtures bloqueadas por sandbox;104PASS/4FAIL/415SKIP. No usar ese conteo como baseline funcional |
| `baseline-test-escalado` | Mismo alcance, entorno aislado y temporales del proceso, con ejecución fuera de la restricción del sandbox: exit0,511PASS/12SKIP. Baseline funcional válido |

Comando efectivo, con el wrapper que guarda metadatos/salida en`implementador/`:

```text
pnpm --config.verify-deps-before-run=false --filter api-core test
  --maxWorkers=1 --no-file-parallelism --reporter=default --reporter=json
  --outputFile.json=<scratch>/baseline-test-escalado.json
```

Salida final literal:

```text
Test Files  35 passed | 2 skipped (37)
     Tests  511 passed | 12 skipped (523)
  Duration  248.58s
EXIT=0 SIGNAL=null
```

Omisiones:8cuota-concurrencia-PG,2fotos-cuota-concurrencia-PG y2almacenS3.
No son aprobaciones de concurrencia real o almacenamiento externo. Los avisos previos
de clientePG sobre consultas superpuestas se conservan; no se modificó su comportamiento.

Evidencia íntegra: `.turbo/m10-2026-10-26/implementador/baseline-test*.{log,json}`
y archivos`.resultado.json` con comando, RAM, fecha, exit y política de aislamiento.
RAM al primer intento3989MiB; guardas posteriores documentadas por el wrapper.

## Controles estáticos

`pnpm exec turbo run typecheck --filter=...contracts --concurrency=1`: exit0 el27/10
a13:59UTC, evidencia`baseline-tipos-grafo.{log,resultado.json}`. Biome del paquete también
exit0, evidencia`baseline-biome.{log,resultado.json}`. Los argumentos completos efectivos
están en cada metadato; el wrapper antepone el ajuste local de verificación pnpm.

BuildAPI posterior y controles después de implementar siguen pendientes. Estos resultados
son de la corridaM10.1, no atribuciones deM6–M8. No hay todavía cierre deM10.1.

## Reanudación RF-01, antes de modificar sus tres archivos

El nuevo baseline completo del trabajador Dewey terminó con533PASS/2FAIL/12SKIP,469.60s,
exit1. Los fallos son los casos de exportación deNULL/ausente en
`test/exportacion.test.ts:543`, por timeout5000ms. No se editaron esos tests, límites ni
producto:8/8huellas seguían iguales alfreezeM10.1 previamente verificado535/12.
Los otros545casos conservaron estado. TiposAPI yBiome volvieron a pasar.

Fuente y logs en`rf01/implementador/`: `baseline-test`, `baseline-tipos`, `baseline-biome`,
`entrega.md`, `freeze-final8.json`. No se atribuye causa al timeout sin probarla. El principal
recibió los rojos, los comunicó y pidió repetir solo el archivo afectado, conservando el
baseline real; no otra suite completa idéntica ni corrección ajena aRF-01.
RF-01 yM10.2 ya están aprobados; la reserva no cancela esa autorización ni habilita
arreglar exportación de pasada. El resultado del reintento se añadirá al obtenerse.
