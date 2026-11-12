# M10.5 — revisión independiente funcional y de seguridad

**Dictamen: CONFORME en el alcance estático revisado. Hallazgos: 0 (P0/P1/P2/P3: 0).** No se detectan pérdidas de cobertura histórica, debilitamiento de negativos ni modificaciones de producción fuera del inventario aprobado. Esta entrega termina la revisión de las siete fuentes; el cierre de M10.5 depende de los controles restantes y del dictamen del verificador independiente.

Comparación exclusiva contra `f0/manifest.json` y `f0/fuente/` de **M10.5, corrida 2026-10-29**. No se utilizó HEAD ni la base de M10.4 para determinar el delta. Se reutilizan los mapas y lecturas ya realizados, sin repetir la auditoría de fuentes. Último cotejo de integridad de las siete fuentes: **2026-10-29T15:51:53Z**, 7/7 iguales a la copia revisada y al freeze final de Parte 4. SHA-256 de `parte4/freeze.json`: `e3b1fab1d993cd2dd5ed081e7a705bf9e16d542e12b6e8c7b83a08dbe33d174c`.

## Conservación comprobada

El mapa independiente conserva todos los nombres de casos previos, los 137 `expect` históricos y los 27 hooks en su orden y con sus timeouts. No hay expectativas eliminadas o relajadas ni cambios en los números de los casos históricos. Los cambios de cuerpos de hooks corresponden a los límites de versión y a la limpieza filtrada autorizados; no se afirma igualdad textual de esos cuerpos.

| Fuente bajo `packages/db/` | Declaraciones de caso F0 → actual | `expect` F0 → actual | Hooks conservados |
|---|---:|---:|---:|
| `test/puntos-criticos-entorno.test.ts` | 10 → 12 | 29 → 45 | 3 |
| `test/puntos-criticos-metrica.test.ts` | 3 → 5 | 16 → 35 | 4 |
| `test/migracion-0017-frecuencia-agua-estancada.test.ts` | 9 → 11 | 11 → 16 | 4 |
| `test/migracion-0019-ubicacion-aproximada.test.ts` | 9 → 11 | 16 → 23 | 4 |
| `test/migracion-0020-base-multicategoria.test.ts` | 24 → 28 | 54 → 64 | 8 |
| `test/migracion-0021-indice-categoria-creado.test.ts` | 4 → 6 | 11 → 16 | 4 |
| **Total** | **59 → 73** | **137 → 199** | **27** |

Una declaración parametrizada representa seis casos. Por ello el ámbito pasa de **64 a 78 casos ejecutables**, con 14 incorporaciones. El cotejo independiente de los JSON de resultados de Hume conserva **los 361 nombres y estados PASS de la suite completa F0**, añade 14 y no encuentra bajas ni regresiones: 375 casos finales. Este cotejo de resultados no es una ejecución propia.

## Criterios funcionales y de seguridad

Todas las referencias siguientes corresponden a las fuentes congeladas revisadas; las líneas son puntos de entrada, no rangos.

| Criterio | Resultado y evidencia de lectura |
|---|---|
| SQL físico y equivalencia flood | **Conforme.** `puntos-criticos-entorno.test.ts:37` limita ambos DELETE a inundación; `:43`, `:56` y `:67` conservan parámetros, estados y partición, con INSERT/UPDATE/SELECT sobre `reporte` y categoría explícita. `puntos-criticos-metrica.test.ts:100` conserva los cálculos y parámetros de distancia y filtra tanto `a` como `b`. Se evalúa la equivalencia semántica de tabla física más predicado, no una igualdad de bytes del SQL. |
| Recurrencia vigente y negativos | **Conforme.** Ambas suites conservan la base latest y contrastan el historial real de migraciones. Persisten los radios, distancias 24/24,9/25,1, CRS, fallback Node, volumen de 2000, límites de componente y concurrencia históricos. Los nuevos negativos superponen bache/basura/área verde: `entorno:310` y `metrica:239` comprueban filas/estados/grupos ajenos y limpieza flood; métrica comprueba las dos orientaciones del par cruzado. La limpieza final por IDs pertenece a las fixtures negativas creadas por el propio caso. |
| Versiones históricas reales | **Conforme.** `migracion-0017…:67` verifica tabla física, ausencia de `reporte`, enum válido/negativo y catálogo exacto hasta 0017; `:94` acota la transición. `migracion-0019…:82` comprueba catálogo/tabla, fila aproximada con precisión 178 y distancia NULL, y enum inválido; `:111` acota la transición. Los caminos desde cero e idempotentes quedan igualmente acotados. |
| Migración 0020 y reversa excepcional | **Conforme.** `migracion-0020…:46` comprueba tabla/vista, datos y ausencia del índice 0021; transición, desde cero e idempotencia quedan en 0020. `:538` conserva la excepción explícita **0021→0019→0021** y los catálogos; `:612` añade comprobación positiva de filas/fotos, historial exacto y conservación de datos por conteos/huellas. Continúa el rechazo de la reversa con otras categorías. No habilita una reversa operativa. |
| Permisos negativos | **Conforme.** `migracion-0020…:634` crea roles antes de la migración histórica. Conserva denegación a `curichi_geo`/PUBLIC, privilegio específico de API, protección del trigger, `search_path` y positivo por la vista (`:670`, `:679`, `:684`, `:688`). La nueva comprobación `:696` sitúa esas expectativas en 0020 exacta. No se extrapola esta fixture a permisos actuales en PostgreSQL real. |
| Límite 0021 efectivo | **Conforme.** `migracion-0021…:23` copia las migraciones reales a una fixture temporal y añade allí una migración posterior con DDL comprobable; `:35` comprueba su exclusión y catálogo exacto 0021. No se añade una migración de producto. Se conservan índice, predicado, orden, idempotencia y EXPLAIN histórico, las 100 filas/categorías/estados; `:141` y `:184` añaden positivos de datos. |
| README y alcance | **Conforme.** `README.md:330` distingue fixtures históricas, recurrencia latest y excepción de reversa. El resto de su contenido se conserva. Los resultados de fixtures no certifican rendimiento, concurrencia o ACL actuales en PostgreSQL real, ni una futura migración. |

## Alcance e integridad

La captura de alcance consolidada registra **996 archivos F0 ajenos al inventario sin cambios**, incluidas las fuentes de producción, migraciones, API, geo, contracts, apps, scripts, CI y manuales. La única diferencia preexistente ajena a las siete fuentes es `VentanaContexto.md`, documentación de contexto permitida. Las nuevas rutas detectadas pertenecen a la documentación de esta corrida. No se detectan fuentes nuevas no autorizadas. Dos entradas de `data/raw/` quedaron expresamente excluidas de lectura/cotejo; no se certifica su integridad por hash.

La evidencia autoritativa del alcance es `alcance-f0-corregido.json`, consolidada en `consolidacion.json`. `alcance-f0.json` es una salida preliminar **invalidada** por asumir una propiedad `exists` que el manifiesto no tiene; no sustenta este dictamen. Se preserva para trazabilidad. El alcance amplio corresponde a esa captura; al terminar se recotejaron únicamente los siete SHA de las fuentes revisadas.

No se reabre M10.4. No se revisa el contenido de `plan-cierre-m10.md` ni se certifica planificación futura.

## Ejecución, evidencia ajena y condición de entrega

Trabajo propio: lectura de planes/protocolo/base, deltas, SQL y fuentes; copias de evidencia dentro de `revision/`; SHA-256; análisis estático mediante el parser TypeScript ya instalado; mapas de nombres/hooks/expectativas/números; cotejo de JSON existentes; Git de solo lectura. **Cero suites, builds, operadores, SQL, HTTP, Docker o bases reales ejecutados por esta revisión. Cero procesos propios activos o en segundo plano; cero heavy.** No se importaron ni ejecutaron las fuentes de producto o de pruebas para revisarlas.

Evidencia de Hume leída y cotejada: baseline 361/361; rojo dirigido 13 FAIL/65 PASS (78, con los casos históricos conservados); verde dirigido 22+56; full final 375/375, sin fallos ni skips; typecheck y Biome con exit 0. Los controles y sus hashes están en `consolidacion.json`. No son ejecuciones de este revisor.

Según la actualización del principal, Hegel terminó además su full independiente 375/375 a las **11:51:48Z**. Se registra como información recibida: esta entrega no auditó sus controles posteriores ni anticipa su dictamen. **Controles restantes y dictamen de Hegel pendientes a esta entrega.** Los 12 SKIP históricos de API PG/S3 siguen NO_VERIFICADO; no se presentan como ejecuciones M10.5.

**Handback:** revisión funcional/seguridad/alcance estática terminada, **0 hallazgos y 0 bloqueos propios** sobre las siete fuentes congeladas. M10.5 no se declara cerrado; tampoco M10, Fase 1 ni producción.

Evidencia local: `comparacion-independiente.json`, `consolidacion.json`, `alcance-f0-corregido.json`, `captura.json`, `delta/`, `f0/` y `fuente-revisada/`. Dictamen estructurado: `resultado.json`.
