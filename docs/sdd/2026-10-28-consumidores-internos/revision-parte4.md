# M10.4 — Revisión independiente del delta de Parte 4

Copia documental del informe de Godel. Original SHA256 `e6385e1c049ca14e85e4e15f60dddeec989a78a60fe4309fda3cc4dc890e1352`; solo se adaptan vínculos relativos. El principal no ejecutó las pruebas referidas.


**Dictamen: CONFORME ESTÁTICO CON LÍMITES.** No identifico hallazgos atribuibles al delta P4 que requieran corrección. Esto no declara una corrida completa DB verde ni cierra M10.4. La corrida completa limpia y API posterior quedan pendientes del verificador después de P5.

Se revisaron exclusivamente los 13 archivos de P4 contra las copias F0, el plan aprobado, el protocolo y el mapa previo de 76 casos/186 aserciones. El SHA de `freeze.json` es `dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc`: 13/13 fuentes coinciden al capturarlas y al terminar la lectura. Copias completas en [p4-fuente/](../../../.turbo/m10-4-2026-10-28/revision/p4-fuente/); identidad y evidencia reutilizada en [p4-captura.json](../../../.turbo/m10-4-2026-10-28/revision/p4-captura.json). No se usó HEAD como base.

## Conservación de pruebas: nombres, aserciones y significado

La comparación independiente por AST encuentra los 76 nombres originales una sola vez, sin `skip`/`only` nuevos en esos casos, y conserva las 186 expresiones `expect`, incluidas las dos compartidas fuera de los casos. No cambiaron sus matchers, valores esperados, negativos ni rechazos. De los 76 cuerpos, 65 siguen iguales salvo formato; los otros 11 cambian consultas o referencias al espejo dentro de lo autorizado. También se revisaron hooks y fixtures: el único hook histórico modificado acota una base de 0014 a esa versión, descrito abajo.

| Archivo de prueba | Casos F0 → P4 | Aserciones F0 → P4 | Evaluación semántica |
|---|---:|---:|---|
| `esquema-drizzle.test.ts` | 3 → 4 | 4 → 11 | Los tres casos originales quedan intactos: tabla física estricta, excepción de vista por `relkind` y enums completos. Se agrega FK/catálogo. |
| `db.test.ts` | 9 → 9 | 34 → 34 | Tabla física real y filtros flood; mismos IDs, agrupación 4 reportes/2 puntos, retención, fotos y datos vivos. |
| `migracion-0010-quitar-campos.test.ts` | 8 → 8 | 34 → 34 | Conserva hashes 0001–0009, transición histórica, 16 combinaciones, igualdad estricta y búsqueda de campos retirados. Cambios solo en base actual/mirror/seed. |
| `migracion-0013-distancia-dispositivo.test.ts` | 14 → 14 | 27 → 27 | SQL histórico y bordes 0/60/1000 contra -1/1001 intactos. Solo cambia el espejo actual a `reporte`. |
| `migracion-0014-cuota-diaria.test.ts` | 17 → 17 | 31 → 31 | Histórico separado de mantenimiento vigente; se conservan los negativos, la FK de cuenta, índices y limpieza antigua. |
| `migracion-0015-publicacion.test.ts` | 20 → 20 | 45 → 45 | Freno sin bandera, rollback, SET LOCAL, límites de publicación, planes positivos y negativo ANY intactos. Solo seed/mirror actuales. |
| `servidor-local.test.ts` | 5 → 5 | 11 → 11 | INSERT histórico 0014, abortar y opciones intactos; lectura después de migrar todo sobre `reporte` filtrado. |

Detalle completo, cuerpos anteriores/posteriores y correspondencia de cada aserción: [p4-pruebas-comparacion-estatica.json](../../../.turbo/m10-4-2026-10-28/revision/p4-pruebas-comparacion-estatica.json). Los deltas de los 12 archivos existentes se conservaron en `p4-delta/`; el archivo nuevo está completo en `p4-fuente/`.

En `migracion-0014-cuota-diaria.test.ts:222`, «desde cero» ahora aplica hasta 0014 para comparar su estructura histórica con la procedente de 0013. Es la separación autorizada por el plan, no un anclaje general a 0021: el mantenimiento del mismo archivo sigue aplicando todas las migraciones en `:242`, y la nueva fixture lo hace en `m10-consumidores-internos.test.ts:48`. Sus 17 cuerpos y 31 aserciones permanecen intactos. La prueba nueva verifica simultáneamente ambas cuotas sobre latest.

## Revisión funcional y de seguridad

| Criterio | Referencia P4 | Conclusión de lectura |
|---|---|---|
| FK física y cascade | `src/esquema/index.ts:343`; `test/esquema-drizzle.test.ts:101`; nuevo test `:341` | El único cambio ejecutable del espejo es `reporteFoto.reporteId → reporte.id`, manteniendo cascade. Se comprueba tabla/vista, catálogo efectivo de fixture y asociación de cuatro fotos con IDs/categorías concretos; cada borrado conserva las restantes y una foto huérfana. |
| Seed y filtros | `src/seeds/samples.ts:190`, `:232`, `:280`, `:283`; nuevo test `:236` | INSERT explícito de inundación; ambos DELETE y el conteo retienen marca y filtro de categoría. Se mantienen capas, cuentas recreadas, geometría pública y recálculo global. Dos siembras ejercitan otras tres categorías con la misma marca y `sin_uv`, autor ajeno, fotos asociadas y flood sin marca; además hay eliminación positiva de muestra flood/foto. |
| RNG, fechas y JSON | `src/seeds/samples.ts:192`; nuevo test `:173` | No se añadió ni reordenó ninguna llamada RNG. La huella `409522bd0209d681bcbbebeb82856d1a0a63746c0a968d65b9d9c9a18468bd42` coincide, calculada solo sobre el JSON de parámetros del baseline congelado. Conserva publicación al crear, evento -3 h, validación +1 día, severidad y geometría pública. El trigger vigente sigue armando JSON desde los campos planos. |
| Helper/defaults/false | `src/test-utils.ts:84`; nuevo test `:63`, `:136` | Firma, defaults, parámetros, RETURNING ID y rama de otras categorías intactos, incluido `causa_presunta = NULL`. La comparación con escritura histórica usa dos filas positivas dentro de una transacción; distingue ausencia de la clave y `agua_brota_sumidero: false`. Las cuatro categorías recorren cinco estados. |
| Puntos críticos y negativos | nuevo test `:278`, `:320` | Se compara la fila completa excepto `punto_critico_id` y `actualizado_en`, y después se exige membresía válida/categoría para las cuatro filas. Es coherente con el recálculo global preexistente; no se promete conservar UUID de puntos reconstruidos. La limpieza de puntos de `scripts/banco-datos.mjs` corresponde a P5 y no se revisó ahora. |
| Cuotas/ACL/DDL | nuevo test `:394`; `README.md:89`, `:207` | Sigue la limpieza antigua y la vigente, con resúmenes distintos. Prueba cinco claves, hoy/futuro, segunda pasada y medianoche de La Paz con sesión UTC. Matriz ACL declarada conservada; no se atribuye certificación de roles reales. Migraciones, mantenimiento y matriz no cambian frente a F0. |
| Banco TS/importación | `banco-puntos-criticos.ts:15`, `:18`, `:40`, `:77`; nuevo test `:452` | Builder puro y selección flood explícita. Conexión y operación solo bajo entrada directa; importar no ejecuta el banco. Rejilla, volúmenes 100/1000/5000, cinco muestras, fórmula y comparación completo/incremental permanecen. La fixture bloquea la apertura del banco y ejecuta únicamente su SQL sintético; no acredita tiempos ni SQL HTTP actual. |
| Alcance/documentación | `README.md:89`, `:123`, `:130`, `:189`, `:207` | Distingue cuota histórica/vigente, coexistencia de planos/JSON y alcance ficticio de las pruebas. Conserva vista, trigger, enums, esquema físico y puertas posteriores. No modifica API/contracts/apps/geo. |

La captura coteja también los 75 archivos preexistentes de `packages/db/` fuera del inventario P4: todos conservan SHA F0. No aparecieron fuentes nuevas inesperadas en `src/`, `test/` o `migraciones/`; la única nueva es la prueba autorizada. Los seis artefactos `dist` entregados coinciden con sus SHA declarados. Es un cotejo de archivos; no se ejecutó ni regeneró `dist`.

## Evidencia reutilizada y límites de ejecución

El revisor ejecutó **cero pruebas, builds, consultas SQL, HTTP o CLI de producto**. Solo leyó/copió archivos, calculó hashes y usó el parser TypeScript instalado para comparar texto. Toda la evidencia de ejecución siguiente pertenece a Hume y está identificada por SHA en las capturas.

- Baseline: DB 350/350; API 562 PASS y 12 SKIP.
- Rojo previo: 6 FAIL y 8 PASS; los seis fallos corresponden a FK, helper flood, dos criterios de seed, fotos y banco TS.
- Criterios modificados: 87/87, exit 0, según el registro de Hume.
- `final-db-02`: **exit 1**, 352 PASS y 9 auto-SKIP. El error es timeout del `beforeAll` de `db.test.ts:16` a 120000 ms; no son nueve omisiones voluntarias ni casos aprobados.
- `final-db-03-dirigido`: 9/9 PASS, exit 0. La consolidación independiente encuentra exactamente esos nueve nombres recuperados, conserva los 350 casos anteriores y agrega 11. El consolidado suma 361 PASS **entre dos ejecuciones**; no constituye una corrida completa limpia.
- Typecheck/build DB: exit 0 en controles previos/posteriores de Hume. Biome informa 12 archivos y exit 0. No se repitieron aquí.
- API posterior, corrida completa DB limpia y controles de consumidores posteriores a P5: **pendientes**. Las 12 omisiones PG/S3 del baseline siguen sin verificar.

Lectura independiente de casos, recuperación del timeout y huella RNG: [p4-consolidacion-independiente.json](../../../.turbo/m10-4-2026-10-28/revision/p4-consolidacion-independiente.json). Salidas literales/control/casos copiados en `p4-evidencia/`; originales en la entrega de Hume. No se infiere el origen del timeout ni se presenta como resuelto.

## Observaciones preexistentes fuera del delta

Sin solicitud de arreglo dentro de P4:

- `packages/db/src/mantenimiento.ts:87`: el comentario dice «sin uso desde M3b» mientras la propia función sigue limpiando la tabla. Texto anterior, SHA F0 conservado; la lógica y sus resúmenes siguen intactos.
- `packages/db/test/matriz-privilegios.test.ts:48`: el nombre del caso atribuye reserva/liberación a la cuota antigua. Nombre anterior, SHA F0 conservado; sus aserciones siguen comprobando la ACL que este plan mantiene.

La documentación autorizada de P4 expresa correctamente esa coexistencia. No se editó ninguno de esos archivos. Tampoco se revisó el delta inestable P5, ni se operó la cápsula/diarios/bancos de M10.3, servicios reales, `.env`, datos raw, Git, instalaciones u otros agentes.

## Reanudación acotada

El JSON adjunto conserva los 13 SHA y el dictamen de cada criterio. Si al retomar siguen coincidiendo con `dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc`, reutilizar esta revisión P4 y revisar solo P5, documentación/alcance final y la nueva evidencia del verificador. Una fuente P4 distinta requiere revisar su delta adicional. M10 completo, Fase 1 y producción mantienen sus puertas.
