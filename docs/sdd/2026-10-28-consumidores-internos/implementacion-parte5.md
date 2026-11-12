# M10.4 — Entrega de Parte5

Original SHA256 `a2fa30c0b1cba38d40e48dcb4735c861364c5671494dbc6681701d066cb1436a`; copia documental con vínculos adaptados. Las ejecuciones de este informe pertenecen al implementador Popper, no al principal ni al verificador independiente.

Meta Parte5: **implementada y verificada localmente**. Verificación independiente/cierre M10.4 pendientes del principal. Heavy **LIBRE**.

Comando demostrativo, con entorno hijo allowlist OS + NODE_ENV=test y operadores reales bloqueados:

`node --test scripts/bancos-internos.test.mjs`

Salida literal (exit0; stdout completo en [ci-node-exacto.stdout.log](../../../.turbo/m10-4-2026-10-28/parte5/ci-node-exacto.stdout.log)):

```text
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7745.5527
```

Solo los cinco archivos de producto autorizados cambiaron desde la foto inicial; los cambios ajenos ya existentes se conservaron. Las13fuentes P4 siguen idénticas a su freeze. F0 global contiene990archivos; foto local991entradas (incluye ausencia del arnés nuevo). No se usó HEAD como línea base. [Comparación](../../../.turbo/m10-4-2026-10-28/parte5/comparacion.json), [foto previa](../../../.turbo/m10-4-2026-10-28/parte5/inicio.json), [Git inicial](../../../.turbo/m10-4-2026-10-28/parte5/git-status-inicial.txt).

Archivos exactos y SHA-256 (también en [freeze.json](../../../.turbo/m10-4-2026-10-28/parte5/freeze.json)):

- `scripts/banco-datos.mjs` — `7778ea39cfd5309211f5356600405c23d49918c939166af7c0f0a26f3f6ebafa`
- `scripts/banco-consultas.mjs` — `0ee6487d812077279124623f7cab4b4c43d17de5ad9a183b07dea7b18cbdd771`
- `scripts/sembrar-30-puntos.sql` — `ea7e8e9db90c9bc92346e55516d6888d3f2c90c64857db05a1206209bcba582e`
- `scripts/bancos-internos.test.mjs` — `32ffaf4a971f266e275df65fe002d33b65fc52868941fc1abfa67d1f0686f589`
- `.github/workflows/ci.yml` — `29cc9978e8a8c2c7a73490dddd59d930cc52d76dcc8e4e43150c057b1a39cf7e`

SHA-256 del freeze: `1984a1f69aa41814afb76f91ad536a5f2c7f749868265e52587355a689d9e417`.

Antes/después:

| Control | Antes de editar | Después |
|---|---|---|
| Suite de estos bancos | No había arnés; no se ejecutaron bancos reales |19PASS/0FAIL/0SKIP/0cancelados,exit0 |
| Cobertura nueva antes del fix |17casos:16FAIL/1PASS,exit1 |17conservados y2añadidos,19PASS;0retirados/0regresiones |
| Sintaxis Node |2scripts,exit0 cada uno |3scripts,exit0 cada uno |
| Biome |Checked2files.No fixes applied.exit0 |Checked3files.No fixes applied.exit0 |
| YAML |7jobs,0errores,exit0 |7jobs,0errores,exit0 |
| Typecheck TS |No aplica al ámbito .mjs/SQL/YAML aprobado |No se ejecutaron db/API/tipos ajenos |

Extractos literales de controles estáticos:

```text
Checked 2 files in 12ms. No fixes applied.
YAML válido: 7 jobs; 0 errores
Checked 3 files in 24ms. No fixes applied.
YAML válido: 7 jobs; 0 errores
```

Cada ejecución conserva stdout/stderr/control(exit,RAM,argv,claves de entorno) en esta carpeta. RAM mínima medida antes de controles:5365MiB,umbral1500MiB. Sin heavy paralelo. Fuentes previas copiadas bajo fuente/ y comparadas con F0 antes de escribir.

Los builders quedan dentro de los bancos. Importarlos no exige URL, no abre pool ni corre CLI. Las fábricas inyectadas prueban guardas de producción/faltaURL con operador bloqueado. El generador conserva lotes, RNG, proporciones, fechas, estados, precisión, geometrías y publicación de F0. ANALYZE/VACUUM apuntan a reporte; el tamaño se etiqueta como tabla física de todas las categorías, sin estrechar PC/capas globales.

Las diez consultas preservan nombres, límites, bbox, estados, joins y cálculos históricos. PUBLICO mantiene validado/resuelto sin publicar_en. PC por bbox sigue global. Los seis alias leen JSON con strings/NULL/ausencia y boolean false/true. UV vacías sobreviven al LEFT JOIN; ambos lados de vecinos y su semilla son flood. La página100 se comparó con5002filas publicables. Los simuladores ejercitan métricas EXPLAIN con mocks y detectan ERROR como no equivalencia; se conserva el exit0 histórico del banco de consultas ante errores por consulta. No se afirma que mida SQL HTTP actual.

El DELETE aprobado conserva filas/IDs/fotos/PC de las otras tres categorías con la misma marca y flood sin marca, además de puntos flood con miembros de otra categoría. Se ejecutó SQL literal en PGlite/PostGIS real en memoria, incluidas las30tuplas manuales completas con BEGIN/COMMIT, validador y capas ficticias. El trigger vigente construye detalle coherente. Para comparar azar se usó wrapper de fixture que llama al PostGIS real con semilla explícita, sin editar SQL de producto. Fechas del manual se comparan por desplazamientos exactos relativos al ancla de cada transacción; las tuplas normalizadas coinciden con F0 original por SHA.

El bloque de humo se extrae literalmente de CI y se ejecuta en esa memoria: cero flood con las otras tres presentes falla; flood pasa; UV obligatoria, fail-closed e invalidez permanecen; ajenos no contaminan. La comparación de CI reconstruye exactamente tres sustituciones SQL y una línea de arnés contra F0. Todos los pasos M10.3 quedan idénticos. El arnés no necesita dist, build ni tsx: carga todos los SQL vigentes solo en memoria.

Incidentes conservados, sin declararlos PASS:

- green-p5-01:16PASS/1FAIL de fixture; RNG PostGIS no depende de setseed(). Solucionado con wrapper reproducible solo de fixture.
- green-p5-03:control spawnSync incompleto por timeout240s/SIGTERM tras salida parcial; sin resumen de casos. Causa no determinada; sustituido por control asíncrono y corridas completas. No omitió casos ni relajó aserciones.
- green-p5-04:18PASS/1FAIL de fixture por distrito/UV obligatorios ausentes en alta ficticia de volumen; corregida fixture.
- biome-01:formato inicial nuevo y regex; resuelto. Sintaxis y formato final verdes.
- CIM no disponible para RAM; node:os.freemem() midió todas las guardas.

Sin hallazgos nuevos fuera del inventario. Los textos históricos sobre cuota señalados por P4 en mantenimiento.ts:87 y matriz-privilegios.test.ts:48 son evidencia heredada de su informe, no cambios ni verificaciones nuevas de P5.

Limitaciones: CI real no ejecutado. Node/PGlite no es HTTP ni benchmark de rendimiento. DBfull361 y API562+12SKIP se reservan al verificador independiente por instrucción expresa; no se repitieron aquí. Los93tests de respaldos intactos no se repitieron. Sin PostgreSQL/Docker/S3/HTTP operacional, bancosCLI/SQLmanual reales, .env, cambios de sistema, instalaciones, Git de escritura o raw. M10.3/cápsula y demo intactas. M10 completo,Fase1 y producción siguen abiertos.

Todas las ejecuciones propias concluyeron y PGlite fue cerrado por after(); no se abrió servidor/puerto ni se detuvo proceso ajeno. Heavy libre para el verificador.

Resultados estructurados: [entrega.json](../../../.turbo/m10-4-2026-10-28/parte5/entrega.json), [resultado.json](../../../.turbo/m10-4-2026-10-28/parte5/resultado.json). Casos/comparación: [comparacion.json](../../../.turbo/m10-4-2026-10-28/parte5/comparacion.json). TAP completo: [final-node.stdout.log](../../../.turbo/m10-4-2026-10-28/parte5/final-node.stdout.log). Rojo: [red-p5.stdout.log](../../../.turbo/m10-4-2026-10-28/parte5/red-p5.stdout.log).
