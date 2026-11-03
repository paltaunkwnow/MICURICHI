# M10.5 — Implementación entregada

Parte4, trabajador raíz Hume, siete archivos del [plan aprobado](plan.md).
Entrega terminada el29/10/2026; la confirmación independiente tiene evidencia propia
en los documentos de revisión/verificación. Este registro describe la ejecución del
implementador y no la sustituye por una certificación independiente.

## Resultado y conservación

| Antes de editar | Después de editar |
|---|---|
| DB361/361,31archivos,0FAIL/SKIP | DB375/375,31archivos,0FAIL/SKIP |
| TiposDB exit0 | TiposDB exit0 |
| 361casos existentes | Los361 conservados y14nuevos,0casos retirados/renombrados/regresiones |

Comparación estructural del implementador: las137aserciones y27hooks anteriores de los
seis TS se conservan; ningún timeout de hook retirado o relajado. Se comparan nombres,
matchers/valores y SQL equivalente, no solo conteos. Mapa completo:
`.turbo/m10-5-2026-10-29/parte4/comparacion.json` y `resumen-comparacion.json`.

## Cambios aplicados

| Archivo relativo a packages/db/ | Resultado |
|---|---|
| `test/puntos-criticos-entorno.test.ts` | Tabla física y filtro Inundaciones explícito en SQL propio. Conserva latest, unión/división/grupos lejanos/2000filas/concurrencia; dos casos nuevos de alcance y aislamiento de otras categorías. |
| `test/puntos-criticos-metrica.test.ts` | Tabla física y alcance en ambos lados de distancias y limpieza; mismos CRS/coordenadas/radios. Dos casos nuevos con las otras tres categorías y conservación de sus filas/grupos. |
| `test/migracion-0017-frecuencia-agua-estancada.test.ts` | Transición0016→0017, desde cero e idempotencia fijadas a0017; dos nuevos casos verifican catálogo/tablas/filas y enum, sin sustituir nombre histórico. |
| `test/migracion-0019-ubicacion-aproximada.test.ts` | Transición0018→0019, desde cero e idempotencia fijadas a0019; dos casos de catálogo/filas, precisión178 y distanciaNULL. |
| `test/migracion-0020-base-multicategoria.test.ts` | Pruebas exactas0020 de catálogo/vista/sincronizador/permisos; conserva reversa21→19→21 y rechazo de otras categorías. Cuatro casos nuevos verifican transiciones y negativos sobre su versión real. |
| `test/migracion-0021-indice-categoria-creado.test.ts` | Índice e idempotencia fijados a0021, mismas aserciones de EXPLAIN; dos casos nuevos de catálogo/filas y aislamiento histórico. |
| `README.md` | Distingue prueba histórica de versión fija, integración actual latest y medición histórica; no presenta un PASS histórico como certificado del esquema futuro. |

Una migración centinela posterior existe únicamente en una copia temporal de fixtures
para demostrar aislamiento de las suites históricas. No se creó una migración de producto,
no se reservó un número por esa centinela ni se conectó una base real.

## Rojo y verde con evidencia

Antes de aplicar el cambio de comportamiento a fixtures históricas/SQL, los nuevos
criterios dieron **13FAIL/65PASS de78**, exit1; los64casos anteriores del ámbito siguieron
aprobados. Se conserva el intento, no se borra ni se confunde con un rojo de la línea base.
Los14casos nuevos no equivalen a14fallos: un caso de conservación ya era verde.

Después: recurrencia22/22 y cuatro archivos históricos56/56; tiposDB y Biome desde raíz
de los seis TS exit0. Se aplicó formato desde raíz antes de esos controles finales.

Salida literal full final del implementador:

```text
 Test Files  31 passed (31)
      Tests  375 passed (375)
   Start at  07:28:19
   Duration  465.01s (transform 3.02s, setup 0ms, import 13.21s, tests 442.01s, environment 3ms)
```

RAM antes de cada comando:3647–4616MiB. Full final inicio11:28:18.739Z,
fin11:36:04.724Z, exit0, RAM4616→3668MiB. Hora local UTC−4.
Biome: `Checked 6 files in 23ms. No fixes applied.`

Argumentos exactos, stdout/stderr, exit, RAM y casos:
`.turbo/m10-5-2026-10-29/parte4/entrega.json`, `*.control.json`, `*.stdout.log`,
`*.stderr.log` y `*.vitest.json`; informe original `parte4/informe.md`.
Diff frente al antes propio: `parte4/diff-f0.patch`.

Freeze de siete archivos `parte4/freeze.json`, SHA256:
`e3b1fab1d993cd2dd5ed081e7a705bf9e16d542e12b6e8c7b83a08dbe33d174c`.

## Límites

No cambia código funcional, DDL, migraciones/reversas, contratos/OpenAPI, API/geo/apps,
operadores, CI o manuales. Se cotejaron81fuentes relevantes de producción/contratos y
nueve fuentes/dist conservadas de M10.4. El cotejo general contra F0 complementa ese
control acotado. No se repitieron API/UI/Node/builds intactos: no son ejecuciones de hoy.

Solo fixtures/PGlite y loopback original propio; entorno hijo aislado según protocolo.
Sin PostgreSQL/Docker/S3/HTTP de instalaciones, lectura de secretos, operaciones en demo
o bancos, Git mutante, instalaciones, limpieza o cambios persistentes del sistema.
Hume terminó con0procesos propios y liberó heavy para Hegel. Los12SKIP históricos API
siguen NO_VERIFICADOS. Este bloque no cierra automáticamente M10 completo/Fase1/producción.
