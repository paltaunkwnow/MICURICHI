# M10.4 — Verificación independiente inicial

Informe de Hegel, original SHA256 `20af43e05f6805c79e4efceddecf5af87690849965ca54a7fa4169acc15ed6b7`; vínculos relativos adaptados. Dictamen inicial **NO_CIERRE** por formato, conservado. La [confirmación correctiva CIERRE_APTO](verificacion-formato.md) tiene evidencia propia y no sobrescribe este intento.

Meta: **NO_CIERRE**. Verificador independiente; producto/docs en solo lectura. Resultado estructurado: [resultado.json](../../../.turbo/m10-4-2026-10-28/verificador/resultado.json).

Bloqueante: **packages/db/test/m10-consumidores-internos.test.ts:347**, Biome exit1, formato de la cadena orm.insert().values(). Riesgo: criterio de formato/CI no satisfecho. No se tocó producto; principal coordina corrección con implementador.

Baseline reutilizada por SHA: DB350 PASS; API562 PASS/12 SKIP. Baselines y argumentos originales constan en freeze-antes.json. Esas 12 omisiones no se contabilizan como PASS.

Salida literal baseline DB:

```text
 Test Files  30 passed (30)
      Tests  350 passed (350)
   Start at  14:58:17
   Duration  304.59s (transform 2.25s, setup 0ms, import 10.62s, tests 286.85s, environment 2ms)

JSON report written to C:/Users/HP/Desktop/MICURICHI/.turbo/m10-4-2026-10-28/parte4/baseline-db-03.vitest.json
```

Salida literal DB propio, full original en una pasada:

```text
 Test Files  31 passed (31)
      Tests  361 passed (361)
   Start at  20:40:56
   Duration  307.90s (transform 2.15s, setup 0ms, import 10.85s, tests 289.85s, environment 2ms)

JSON report written to C:/Users/HP/Desktop/MICURICHI/.turbo/m10-4-2026-10-28/verificador/db-full-01-retry-02/vitest.json
```

350 nombres previos conservados y aprobados, 11 nuevos aprobados, cero retirados/regresiones/omisiones nuevas. La revisión AST reutilizada por SHA conserva 76 casos/186 expect de los siete archivos históricos; las 13 fuentes de su captura coinciden. No se cargó virtual-http.mjs, no se cambiaron hooks/timeouts/aserciones ni se filtraron casos.

Salida literal baseline API:

```text
 Test Files  36 passed | 2 skipped (38)
      Tests  562 passed | 12 skipped (574)
   Start at  15:03:44
   Duration  274.87s (transform 3.57s, setup 0ms, import 40.55s, tests 224.49s, environment 3ms)

JSON report written to C:/Users/HP/Desktop/MICURICHI/.turbo/m10-4-2026-10-28/parte4/baseline-api.vitest.json
```

Salida literal API propia posterior:

```text
 Test Files  36 passed | 2 skipped (38)
      Tests  562 passed | 12 skipped (574)
   Start at  20:46:47
   Duration  256.72s (transform 3.35s, setup 0ms, import 38.45s, tests 209.35s, environment 3ms)

JSON report written to C:/Users/HP/Desktop/MICURICHI/.turbo/m10-4-2026-10-28/verificador/api-full-01/vitest.json
```

La comparación usa archivo+nombre completo+ordinal; sólo normaliza el prefijo MICURICHI/ de la evidencia de Hume. Los 574 casos y los 12 SKIP son exactamente los mismos; no hay casos retirados ni skips nuevos. Comparación exhaustiva (cada caso anterior y los nuevos): [comparacion-casos.json](../../../.turbo/m10-4-2026-10-28/verificador/comparacion-casos.json).

Arnés Node propio, comando exacto de CI `node --test scripts/bancos-internos.test.mjs`:

```text
banco-datos: no se ejecuta contra producción. Inserta cientos de miles de filas.
banco-datos: falta DATABASE_URL
banco-consultas: no se ejecuta contra producción.
banco-consultas: falta DATABASE_URL
banco-datos: 12 reportes repartidos entre 1 unidades vecinales (tiempo independiente del espacio)
  12/12 (0 s)   
banco-datos: ANALYZE para que el planificador tenga estadísticas al día…
banco-datos: listo en 0 s
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘
banco-datos: 12 reportes repartidos entre 1 unidades vecinales (tiempo CORRELACIONADO con el espacio: peor caso)
  12/12 (0 s)   
banco-datos: ANALYZE para que el planificador tenga estadísticas al día…
banco-datos: listo en 0 s
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘
banco-datos: 20003 reportes repartidos entre 1 unidades vecinales (tiempo independiente del espacio)
  20000/20003 (0 s)     20003/20003 (0 s)   
banco-datos: ANALYZE para que el planificador tenga estadísticas al día…
banco-datos: listo en 0 s
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘
banco-datos: 10000 reportes repartidos entre 1 unidades vecinales (tiempo independiente del espacio)
  10000/10000 (0 s)   
banco-datos: ANALYZE para que el planificador tenga estadísticas al día…
banco-datos: listo en 0 s
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘

banco-consultas histórico · 0 reportes · mediana de 1 corridas

┌─────────┬─────────────────────────────────────────────────┬────────────┬────────────────────────────────┐
│ (index) │ consulta                                        │ mediana ms │ peor ms                        │
├─────────┼─────────────────────────────────────────────────┼────────────┼────────────────────────────────┤
│ 0       │ 'listado público · conteo acotado'              │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 1       │ 'listado público · primera página'              │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 2       │ 'listado público · página 100 (OFFSET 5000)'    │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 3       │ 'listado público · bbox del mapa'               │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 4       │ 'listado técnico · filtro por unidad vecinal'   │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 5       │ 'agregados por unidad vecinal (coropletas)'     │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 6       │ 'puntos críticos por bbox'                      │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 7       │ 'point-in-polygon (resolver UV)'                │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 8       │ 'vecinos a 25 m (recálculo de puntos críticos)' │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 9       │ 'mantenimiento · reportes sin geom_publico'     │ 'ERROR'    │ 'fallo sintético por consulta' │
└─────────┴─────────────────────────────────────────────────┴────────────┴────────────────────────────────┘
  · listado público · conteo acotado: el LIMIT interior es lo que impide que el conteo crezca con la tabla
  · listado público · página 100 (OFFSET 5000): el OFFSET obliga a recorrer y descartar; es el coste que crece con la profundidad
  · listado público · bbox del mapa: debe entrar por el GIST parcial reporte_geom_publico_gist
  · agregados por unidad vecinal (coropletas): recorre TODOS los reportes publicables; es la consulta que más crece con el volumen
  · point-in-polygon (resolver UV): debe usar unidad_vecinal_geom_gist; es el camino crítico de POST /reportes
  · vecinos a 25 m (recálculo de puntos críticos): una sola semilla; el coste real se multiplica por el tamaño de la componente conexa
  · mantenimiento · reportes sin geom_publico: debe entrar por el índice parcial reporte_sin_geom_publico

banco-consultas histórico · 0 reportes · mediana de 1 corridas

┌─────────┬─────────────────────────────────────────────────┬────────────┬────────────────────────────────┐
│ (index) │ consulta                                        │ mediana ms │ peor ms                        │
├─────────┼─────────────────────────────────────────────────┼────────────┼────────────────────────────────┤
│ 0       │ 'listado público · conteo acotado'              │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 1       │ 'listado público · primera página'              │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 2       │ 'listado público · página 100 (OFFSET 5000)'    │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 3       │ 'listado público · bbox del mapa'               │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 4       │ 'listado técnico · filtro por unidad vecinal'   │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 5       │ 'agregados por unidad vecinal (coropletas)'     │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 6       │ 'puntos críticos por bbox'                      │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 7       │ 'point-in-polygon (resolver UV)'                │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 8       │ 'vecinos a 25 m (recálculo de puntos críticos)' │ 'ERROR'    │ 'fallo sintético por consulta' │
│ 9       │ 'mantenimiento · reportes sin geom_publico'     │ 'ERROR'    │ 'fallo sintético por consulta' │
└─────────┴─────────────────────────────────────────────────┴────────────┴────────────────────────────────┘
  · listado público · conteo acotado: el LIMIT interior es lo que impide que el conteo crezca con la tabla
  · listado público · página 100 (OFFSET 5000): el OFFSET obliga a recorrer y descartar; es el coste que crece con la profundidad
  · listado público · bbox del mapa: debe entrar por el GIST parcial reporte_geom_publico_gist
  · agregados por unidad vecinal (coropletas): recorre TODOS los reportes publicables; es la consulta que más crece con el volumen
  · point-in-polygon (resolver UV): debe usar unidad_vecinal_geom_gist; es el camino crítico de POST /reportes
  · vecinos a 25 m (recálculo de puntos críticos): una sola semilla; el coste real se multiplica por el tamaño de la componente conexa
  · mantenimiento · reportes sin geom_publico: debe entrar por el índice parcial reporte_sin_geom_publico

banco-consultas histórico · 2 reportes · mediana de 3 corridas

┌─────────┬─────────────────────────────────────────────────┬────────────┬─────────┬────────────────┬─────────────────────┬───────────────────┐
│ (index) │ consulta                                        │ mediana ms │ peor ms │ bloques leídos │ escaneo secuencial  │ índices           │
├─────────┼─────────────────────────────────────────────────┼────────────┼─────────┼────────────────┼─────────────────────┼───────────────────┤
│ 0       │ 'listado público · conteo acotado'              │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 1       │ 'listado público · primera página'              │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 2       │ 'listado público · página 100 (OFFSET 5000)'    │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 3       │ 'listado público · bbox del mapa'               │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 4       │ 'listado técnico · filtro por unidad vecinal'   │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 5       │ 'agregados por unidad vecinal (coropletas)'     │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 6       │ 'puntos críticos por bbox'                      │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 7       │ 'point-in-polygon (resolver UV)'                │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 8       │ 'vecinos a 25 m (recálculo de puntos críticos)' │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
│ 9       │ 'mantenimiento · reportes sin geom_publico'     │ 2.35       │ 2.35    │ 7              │ 'reporte (2 filas)' │ 'indice_ficticio' │
└─────────┴─────────────────────────────────────────────────┴────────────┴─────────┴────────────────┴─────────────────────┴───────────────────┘
  · listado público · conteo acotado: el LIMIT interior es lo que impide que el conteo crezca con la tabla
  · listado público · página 100 (OFFSET 5000): el OFFSET obliga a recorrer y descartar; es el coste que crece con la profundidad
  · listado público · bbox del mapa: debe entrar por el GIST parcial reporte_geom_publico_gist
  · agregados por unidad vecinal (coropletas): recorre TODOS los reportes publicables; es la consulta que más crece con el volumen
  · point-in-polygon (resolver UV): debe usar unidad_vecinal_geom_gist; es el camino crítico de POST /reportes
  · vecinos a 25 m (recálculo de puntos críticos): una sola semilla; el coste real se multiplica por el tamaño de la componente conexa
  · mantenimiento · reportes sin geom_publico: debe entrar por el índice parcial reporte_sin_geom_publico
banco-datos: no hay unidades vecinales vigentes; corré antes db:seed:samples
banco-datos: 100 reportes repartidos entre 1 unidades vecinales (tiempo independiente del espacio)
  100/100 (0 s)   
banco-datos: ANALYZE para que el planificador tenga estadísticas al día…
banco-datos: listo en 0 s
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘
banco-datos: 0 reportes sintéticos y 0 puntos críticos huérfanos borrados en 0 s
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘
┌─────────┐
│ (index) │
├─────────┤
│ 0       │
└─────────┘
✔ datos: importar sin URL o en producción no opera ni termina el proceso (6435.2354ms)
✔ datos: guardas CLI con fábrica bloqueada, sin ejecutar CLI real (3.6458ms)
✔ consultas: importar sin URL o en producción no opera ni termina el proceso (276.8121ms)
✔ consultas: guardas CLI con fábrica bloqueada, sin ejecutar CLI real (2.0183ms)
✔ generador: misma sentencia, parámetros, distribución y publicación que F0; categoría explícita (3.5707ms)
✔ generador: lotes de 20000 y resto, defaults CLI y cierre de pool (1.4815ms)
✔ consultas: mantiene diez nombres, parámetros, joins vigentes, estados y límites históricos (2.4878ms)
✔ errores: ERROR no es equivalencia; el manejo histórico por consulta y cierre se conserva (3.2305ms)
✔ simuladores: métricas EXPLAIN exitosas, total filtrado y error del generador con release/cierre (2.5429ms)
✔ SQL literal manual: mismas 30 tuplas de F0, transacción, fechas, geometrías y JSON del trigger vigente (38.0288ms)
✔ SQL generador literal: volumen ficticio, JSON coherente, geometría, proporciones y tiempo F0 (104.4491ms)
✔ SQL limpieza: marca/IDs/fotos/PC de otras tres categorías e inundación sin marca sobreviven (29.0133ms)
✔ SQL consultas: equivalencia F0 de las diez consultas con otras categorías presentes (178.114ms)
✔ SQL alias JSON: strings, NULL/ausencia y false booleano; JSON es fuente de los seis alias (26.615ms)
✔ SQL LEFT JOIN conserva UV vacías/solo otras; vecinos filtra ambos lados y semilla; PC bbox global (15.525ms)
✔ SQL estado: conteos flood y mantenimiento; tamaño físico todas categorías, PC/capas globales (11.4978ms)
✔ SQL público histórico: excluye nuevo y sin punto, incluye futuro validado; página profunda no vacía (303.7754ms)
✔ CI humo SQL exacto: flood positivo; sin flood, otras tres presentes, falla; UV obligatoria (33.1923ms)
✔ CI humo SQL exacto: conserva fail-closed e invalidez, sin contaminación de otras categorías (9.5775ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7686.2135
```

Se conservan los17 nombres del rojo P5(16 FAIL/1 PASS) y los2 adicionales de su entrega:19 PASS propios, cero retirados/regresiones. Esas pruebas no equivalen al job remoto de CI ni a medir rendimiento operacional.

Controles propios en serie (args/entorno/RAM/exit en cada control.json):

| Control | Exit | RAM antes/después MiB | Evidencia |
|---|---:|---:|---|
| api-full-01 | 0 | 5615/5708 | [control](../../../.turbo/m10-4-2026-10-28/verificador/api-full-01/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/api-full-01/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/api-full-01/stderr.log) |
| biome-delta | 1 | 5701/5688 | [control](../../../.turbo/m10-4-2026-10-28/verificador/biome-delta/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/biome-delta/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/biome-delta/stderr.log) |
| db-full-01 | 1 | 5490/5483 | [control](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01/stderr.log) |
| db-full-01-retry-02 | 0 | 5538/5564 | [control](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01-retry-02/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01-retry-02/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01-retry-02/stderr.log) |
| node-19 | 0 | 5738/5725 | [control](../../../.turbo/m10-4-2026-10-28/verificador/node-19/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/node-19/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/node-19/stderr.log) |
| secretos | 0 | 5643/5627 | [control](../../../.turbo/m10-4-2026-10-28/verificador/secretos/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/secretos/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/secretos/stderr.log) |
| secretos-nuevos | 0 | 5601/5616 | [control](../../../.turbo/m10-4-2026-10-28/verificador/secretos-nuevos/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/secretos-nuevos/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/secretos-nuevos/stderr.log) |
| secretos-untracked | 1 | 5627/5622 | [control](../../../.turbo/m10-4-2026-10-28/verificador/secretos-untracked/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/secretos-untracked/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/secretos-untracked/stderr.log) |
| syntax-consultas | 0 | 5724/5723 | [control](../../../.turbo/m10-4-2026-10-28/verificador/syntax-consultas/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/syntax-consultas/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/syntax-consultas/stderr.log) |
| syntax-datos | 0 | 5734/5724 | [control](../../../.turbo/m10-4-2026-10-28/verificador/syntax-datos/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/syntax-datos/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/syntax-datos/stderr.log) |
| syntax-test | 0 | 5714/5713 | [control](../../../.turbo/m10-4-2026-10-28/verificador/syntax-test/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/syntax-test/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/syntax-test/stderr.log) |
| typegraph | 1 | 5670/5665 | [control](../../../.turbo/m10-4-2026-10-28/verificador/typegraph/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/typegraph/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/typegraph/stderr.log) |
| typegraph-retry-02 | 0 | 5687/5600 | [control](../../../.turbo/m10-4-2026-10-28/verificador/typegraph-retry-02/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/typegraph-retry-02/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/typegraph-retry-02/stderr.log) |
| yaml | 0 | 5723/5713 | [control](../../../.turbo/m10-4-2026-10-28/verificador/yaml/control.json), [stdout](../../../.turbo/m10-4-2026-10-28/verificador/yaml/stdout.log), [stderr](../../../.turbo/m10-4-2026-10-28/verificador/yaml/stderr.log) |

Salida literal de controles mínimos:


syntax-datos:

```text

```

syntax-consultas:

```text

```

syntax-test:

```text

```

yaml:

```text
YAML válido: 7 jobs; 0 errores
```

biome-delta:

```text
Checked 15 files in 45ms. No fixes applied.
Found 1 error.
```

Stderr literal:

```text
packages\db\test\m10-consumidores-internos.test.ts format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
    345 345 │         const id = await utils.insertarReporte(ex, -63.195, -17.79, 'validado', 'media', categoria);
    346 346 │         ids.push(id);
    347     │ - ······await·orm
    348     │ - ········.insert(esquema.reporteFoto)
    349     │ - ········.values({
    350     │ - ··········reporteId:·id,
    351     │ - ··········objetoKey:·`${categoria}.webp`,
    352     │ - ··········mime:·'image/webp',
    353     │ - ··········bytes:·1,
    354     │ - ··········ancho:·1,
    355     │ - ··········alto:·1,
    356     │ - ··········exifSanitizado:·true,
    357     │ - ········});
        347 │ + ······await·orm.insert(esquema.reporteFoto).values({
        348 │ + ········reporteId:·id,
        349 │ + ········objetoKey:·`${categoria}.webp`,
        350 │ + ········mime:·'image/webp',
        351 │ + ········bytes:·1,
        352 │ + ········ancho:·1,
        353 │ + ········alto:·1,
        354 │ + ········exifSanitizado:·true,
        355 │ + ······});
    358 356 │       }
    359 357 │       await orm
  

check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
```

typegraph-retry-02:

```text

   • Packages in scope: api-core, db, geo-service, geodata-etl
   • Running typecheck in 4 packages
   • Remote caching disabled

contracts:build: cache miss, executing e3bebfc5b103f617
contracts:build: $ tsc -p tsconfig.build.json && tsx scripts/generar.ts
contracts:build: contracts: openapi/openapi.yaml y dist/dominio.json generados
db:build: cache miss, executing b6ddc8feee82d1e7
db:build: $ tsc -p tsconfig.build.json
db:typecheck: cache miss, executing a5f9204146234c9a
db:typecheck: $ tsc -p tsconfig.json --noEmit
geodata-etl:typecheck: cache miss, executing 4227909f618ac470
geodata-etl:typecheck: $ tsc -p tsconfig.json --noEmit
api-core:typecheck: cache miss, executing 9d07d63ed249c982
api-core:typecheck: $ tsc -p tsconfig.json --noEmit
geo-service:typecheck: cache miss, executing ef20dd4afc818158
geo-service:typecheck: $ tsc -p tsconfig.json --noEmit

 Tasks:    6 successful, 6 total
Cached:    0 cached, 6 total
  Time:    19.29s
```

secretos:

```text
[secretos] sin hallazgos
```

Stderr literal:

```text
$ node scripts/buscar-secretos.mjs --todos
```

secretos-nuevos:

```text
{"archivos":11,"paths":["docs/sdd/2026-10-28-consumidores-internos/arbol-inicial.txt","docs/sdd/2026-10-28-consumidores-internos/archivos.txt","docs/sdd/2026-10-28-consumidores-internos/implementacion-parte5.md","docs/sdd/2026-10-28-consumidores-internos/implementacion.md","docs/sdd/2026-10-28-consumidores-internos/informe.md","docs/sdd/2026-10-28-consumidores-internos/linea-base.md","docs/sdd/2026-10-28-consumidores-internos/plan-m10-5.md","docs/sdd/2026-10-28-consumidores-internos/protocolo-verificacion.md","docs/sdd/2026-10-28-consumidores-internos/revision-parte4.md","packages/db/test/m10-consumidores-internos.test.ts","scripts/bancos-internos.test.mjs"],"hallazgos":[],"reglasSHA":"a9b7fb3b67028226d54f9b767e82111a3726c17eb0f30592052b17a5b2e8c299","valoresImpresos":false}
```

secretos-untracked:

```text
{"archivos":124,"hallazgos":[{"archivo":"docs/sdd/2026-10-22-cuatro-categorias/verificacion.md","linea":234,"regla":"secreto asignado en línea"},{"archivo":"infra/respaldo/respaldo.test.sh","linea":27,"regla":"cadena de conexión con contraseña"},{"archivo":"scripts/ensayar-respaldo-multitematico.mjs","linea":753,"regla":"secreto asignado en línea"},{"archivo":"scripts/ensayar-respaldo-multitematico.test.mjs","linea":72,"regla":"cadena de conexión con contraseña"},{"archivo":"scripts/ensayar-respaldo-multitematico.test.mjs","linea":186,"regla":"cadena de conexión con contraseña"},{"archivo":"scripts/ensayar-respaldo-multitematico.test.mjs","linea":550,"regla":"cadena de conexión con contraseña"},{"archivo":"scripts/medir-cuatro-categorias.mjs","linea":2155,"regla":"secreto asignado en línea"},{"archivo":"scripts/medir-cuatro-categorias.test.mjs","linea":14,"regla":"cadena de conexión con contraseña"},{"archivo":"scripts/multitematica-local.mjs","linea":894,"regla":"secreto asignado en línea"}],"reglasSHA":"a9b7fb3b67028226d54f9b767e82111a3726c17eb0f30592052b17a5b2e8c299","valoresImpresos":false}
```

Typegraph: mismo comando `pnpm --config.verify-deps-before-run=false exec turbo run typecheck --filter=...db --concurrency=1`, ejecutado sobre copia por SHA de cinco paquetes bajo verificador/typecheck-workspace. Así toda salida dist/OpenAPI/log/cache queda dentro del ownership. Mismos tsconfig/package/lock/workspace/turbo y dependencias instaladas por junctions de lectura. Consumidores API/geo/ETL, DB y builds de sus dependencias DB/contracts; cero builds de apps. Los consumidores importan el dist original DB congelado que ya usó API. [Manifest del espejo](../../../.turbo/m10-4-2026-10-28/verificador/typecheck-workspace.json).

Los seis artefactos DB compilados en la copia coinciden con el dist de Hume: true. Primer intento de preparación bloqueado por EPERM al crear junction; repetido con escalación, sin borrar evidencia. El typegraph inicial conserva exit1 por turbo no encontrado cuando faltaba ese junction; typegraph-retry-02 completo:exit0,6/6tareas. No es un fallo de tipos.

Tipos/build DB antes/después **reutilizados**, no presentados como ejecución propia; fuentes quietas por freeze, controles con exit0:


baseline-typecheck, control SHA256 f46b42674fc0723f61c830e134ad7ab193336b602fc64a64c85fe1e013f06df1:

```text
$ tsc -p tsconfig.json --noEmit
```

final-typecheck, control SHA256 c979ee798a2a08d0d5ef3d4f6f03814a5b97de248cfebb61321fb614174fd6c5:

```text
$ tsc -p tsconfig.json --noEmit
```

baseline-build, control SHA256 46023723e4c34a10c10d3db6ecdbc471366d7b7ad6b9c26861de39c52b31a728:

```text
$ tsc -p tsconfig.build.json
```

final-build, control SHA256 7d67b484f98e69c4c5a0d265f13f759743a2ddbe11b2099989825a5656edf4a8:

```text
$ tsc -p tsconfig.build.json
```

Incidente propio conservado: db-full-01 bajo sandbox terminó exit1,265PASS/15FAIL/81auto-SKIP, con EACCES explícito en fixtures loopback. Se escaló **el mismo comando guardián**, manteniendo allowlist/offline, archivo nuevo de puertos y config idéntica. El reintento completo pasó361/361. El intento fallido no se suma ni se presenta como PASS. No se necesitaron suites dirigidas ni cambios de producto. [stderr original](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01/stderr.log).

CIM inicial sin permiso conservado como limitación de herramienta; se usó node:os.freemem para todas las guardas. La consulta CIM propia escalada fue solo lectura. Un error de conversión DateTime del auxiliar se corrigió únicamente en procesos.ps1. Consulta final con identidad PID+CreationDate y descendientes: **0 procesos propios**, sin procesos/servidores propios remanentes; los hooks originales cerraron PGlite/servidores. [Identidad durante corrida](../../../.turbo/m10-4-2026-10-28/verificador/procesos-db-escalado.json), [cierre](../../../.turbo/m10-4-2026-10-28/verificador/procesos-final.json). No se cerró ni mató ningún proceso ajeno.

18fuentes y6artefactos dist coinciden al inicio/final; migraciones/reversas23 y fuentes de consumidores480 intactas contra F0. Rama/HEAD inmutables: codex/cuatro-categorias / 59b80781030707b8c3334bfbfd40f80000c60a57. [Freeze inicial](../../../.turbo/m10-4-2026-10-28/verificador/freeze-antes.json), [freeze final](../../../.turbo/m10-4-2026-10-28/verificador/freeze-despues.json), [alcance](../../../.turbo/m10-4-2026-10-28/verificador/alcance-estatico.json). El estado Git inicial se conserva en git-status-antes.txt; todos los cambios de producto encontrados ya existían. Archivos modificados/creados por este verificador: exclusivamente verificador/.

Hallazgos fuera sin editar (heredados de P4): mantenimiento.ts:87 y matriz-privilegios.test.ts:48, textos históricos de cuota; riesgo de confusión documental. No constituyen regresión nueva ni autorizan editar esos archivos.

Escaneo adicional de124archivos sin seguimiento:exit1 con9patrones heredados, todos en archivos idénticos por SHA a F0; se registran sólo archivo/línea/regla, sin valores. No se clasifican como secretos reales ni como regresiones M10.4. Comprobación acotada de archivos sin seguimiento nuevos respecto de F0:exit0,0hallazgos; pnpm secretos:exit0,sin hallazgos. [Patrones históricos](../../../.turbo/m10-4-2026-10-28/verificador/secretos-historicos.json), [nuevos](../../../.turbo/m10-4-2026-10-28/verificador/secretos-nuevos.json). No se modificó el escáner ni sus reglas.

No verificado: los12casos PG/S3 omitidos; CI remoto; PostgreSQL/S3/Docker/demo/E2E/túneles y bancos/SQL manual operacionales. Sin instalaciones ni audit de red, cambios de entorno persistente, Git de escritura, secretos impresos o data/raw. Revisión P5 estática y cierre documental corresponden a Godel/principal. M10 completo, Fase1 y producción permanecen abiertos.
