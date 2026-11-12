# Revisión independiente M10.2: funcional y seguridad

**Dictamen: CONFORME ESTÁTICO CON LIMITACIONES.** No identifiqué hallazgos nuevos bloqueantes en el delta de los seis archivos. La conclusión cubre el análisis de fuentes y las evidencias del implementador; no acredita una restauración real ni el cierre de M10, producción o Fase 1.

Parte 5. Autorización del 27/10: «Aprobar ambos bloques, en orden»; RF-01 cerrado previamente según el encargo. Lectura de AGENTS.md completo y de `docs/sdd/2026-10-27-respaldos-multitematicos/plan.md`. Ownership exclusivo de este informe y `resultado.json`; sin descendientes, cambios al producto ni documentación operativa.

## Base y estabilidad

Comparé los cuatro archivos existentes con `.turbo/m10-2-2026-10-27/f0/antes/`, nunca con HEAD. Los SHA-256 de las cuatro copias coinciden con `f0/manifest.json`. Las dos pruebas son archivos nuevos.

Los seis hashes al cierre coinciden con los del inicio. No quedó delta concurrente pendiente de revisión ni se esperó un freeze. `resultado.json` conserva los hashes iniciales y finales completos.

| Archivo | SHA-256 al inicio y al cierre |
|---|---|
| `scripts/respaldo.mjs` | `e302dc061bc5279cd47d46e4f3099b46a69dd18c931a4227b3486ca88efb7c0d` |
| `scripts/respaldo.test.mjs` | `e5219c753edc5897d0999d658ad477fd8b7361474ff89ce4dc9c8c013a39d325` |
| `infra/respaldo/respaldo.sh` | `64223b6da233de4d06b154b341b50803776a88c7ddef0a1277b794aac95f2dde` |
| `infra/respaldo/respaldo.test.sh` | `608fa28ce9445efccbf4293fa2140b50d317798a695e04b4484b9ffb70b68708` |
| `.github/workflows/ci.yml` | `c8c9381e0f8c2735e4a25ad8a756580df8b6af93473eb42eb1d37f1d3f538755` |
| `docs/operaciones/respaldo-y-restauracion.md` | `9a978a5d5b8859d47c014ee111f41c54802d05545744d1371d40304fb7f0e392` |

## Criterios revisados

| Criterio | Resultado y evidencia |
|---|---|
| CA1: tabla física por migración | Conforme estático. Node elige `reporte` desde 0020 y `reporte_inundacion` antes; exige `relkind r/p` (`scripts/respaldo.mjs:270–284`). Shell exige la tabla física correspondiente y rechaza la otra en TABLE DATA (`infra/respaldo/respaldo.sh:203–218`). |
| CA2: categorías y contenido | Conforme estático. Las consultas no filtran por categoría activa ni dependen del registro de contracts. Agrupan todas las filas por categoría y comparan conteos, huellas de las columnas y catálogo. JSONB conserva NULL y tipos; se exige que la copia contenga todas las columnas del origen. La proyección de origen admite columnas añadidas por una migración posterior sin esconder columnas perdidas (`scripts/respaldo.mjs:285–385`). |
| CA3: destino, manifiesto, versiones y errores | Conforme estático dentro del alcance aprobado. La guarda Shell consulta la tabla física completa más usuarios antes de pg_restore; un error SQL no es un cero. Se validan campos requeridos, formato, migraciones coherentes, hashes, tamaños positivos y coincidencia íntegra de tablas/conteos del archivo y manifiesto (`infra/respaldo/respaldo.sh:221–275,513–565`). Node rechaza retroceso o nombre inconsistente de la misma migración y conteos inválidos. Ver límite heredado de DROP más abajo. |
| CA4: seguridad | Conforme estático del delta. Las guardas de import/source evitan iniciar el CLI. Se conservan GPG AES256, paso de clave por descriptor, comprobación de ida/vuelta y SHA-256 previos a la carga. Los identificadores interpolados nuevos proceden de constantes o listas validadas. No hay nuevos logs de filas, huellas, PII o credenciales. |
| CA5: aislamiento y eficacia | Conforme estático y evidencia del implementador. Node bloquea exec/execFile/spawn/fork y variantes sync antes del import y sincroniza exports ESM. SQL exige inyección sin fallback. Bash sanea el entorno, instala denegaciones antes del source y restringe la limpieza a la fixture absoluta bajo scratch. Los tres mutantes fallan por aserciones de controles relevantes, no únicamente por falta de helpers. |
| CA6: controles y CI | Conforme con no verificados explícitos. Los logs finales del implementador muestran 23/23 Node y 23/23 Bash, sintaxis y Biome correctos. Parseo YAML con librería ya existente; job postgres-real idéntico a F0. El job infra añade pruebas nativas y Bash sin instalar paquetes. ShellCheck local ausente; CI no ejecutado en esta revisión. |

## Evidencias leídas y atribución

Todos los resultados de ejecución pertenecen al trabajador raíz. El revisor no ejecutó suites, builds, SQL, operadores ni nuevas probes. Se hicieron lecturas acotadas, diferencias contra F0 y hashes. No hubo acceso a .env, HTTP, Docker, PostgreSQL, S3 o configuración persistente.

- `implementador/baseline-node.log`, `baseline-biome.log`: exit 0. El primer Bash falló por el sandbox MSYS; `baseline-bash-reintento.log` termina en 0. No se atribuye ese primer fallo al código.
- `rojo-node.log`: 18 casos, 1 pass y 17 fallos; helpers no exportados y efecto de import del CLI anterior. `rojo-bash-estricto.log`: 16 casos, 2 pass y 14 fallos por helpers ausentes. El arnés estricto excluye 127/97 de los negativos aceptables. Estos rojos muestran el estado previo, no equivalen por sí solos a probar pérdidas semánticas.
- `final-node.log`: 23 pass, 0 fallos, exit 0. `final-bash.log`: TOTAL=23 PASS=23 FAIL=0, exit 0. También se leyeron sintaxis Node/Bash, `final-biome.log` y `final-yaml.log`, con exit 0.
- `efectividad.mjs` crea copias mutantes únicamente en scratch y comprueba su ruta absoluta antes de eliminarlas. `final-efectividad.log` y los tres logs individuales corroboran: omitir comparación de contenido produce seis fallos; usar la vista actual produce dieciocho; ignorar catálogo produce uno. Se observan aserciones de contenido/NULL, tabla física y catálogo, respectivamente.
- `herramientas.mjs` y `final-yaml.log`: parser YAML ya disponible, controles aislados presentes, sin instalación de dependencias en infra y postgres-real conservado respecto de F0. No se ejecutó CI aquí.
- `shellcheck.log`: **NO_VERIFICADO local, herramienta no instalada**. El exit 0 del detector no significa que ShellCheck haya aprobado los scripts.

Los arneses verifican control de flujo, comparaciones y SQL mediante mocks. En Node, el oráculo deriva las huellas de las filas sintéticas con JavaScript; no interpreta ni ejecuta la consulta PostgreSQL. En Bash, COPY es texto sintético. El análisis estático de la consulta complementa esa evidencia; no sustituye al motor real.

## Límite heredado que debe advertirse antes del ensayo real

`scripts/respaldo.mjs:195–215` ya borraba y recreaba la base destino en F0, con protección solo por igualdad con BASE. M10.2 no introduce ese DROP ni añade a esa ruta la guarda de destino vacío de Shell. Conforme al alcance indicado, no se registra como defecto nuevo del delta.

**Riesgo heredado:** un destino ocupado elegido para ese CLI puede perderse. Antes de un futuro ensayo real deben identificarse y autorizarse expresamente origen/destino y advertirse este comportamiento. Este informe no autoriza ese ensayo ni afirma que la ruta Node rechace cualquier destino ocupado.

## Limitaciones exactas

ShellCheck permanece no verificado localmente y debe conservarse en CI. No se verificaron PostgreSQL/PostGIS, las transformaciones reales de migraciones históricas, GPG real, un respaldo/restore real, conectividad ni recuperación. Las fuentes deben permanecer quietas durante la futura comparación con el origen vivo, como documenta el procedimiento.

Quedan fuera convivencia de clientes, reversa multitemática, contracción física/HTTP, producción, demo/API/RF y una auditoría global del repositorio. No se cambió Git ni se solicitaron archivos nuevos de funcionalidad. Las limitaciones no se presentan como ejecuciones realizadas ni como una certificación operacional.

El dictamen corresponde únicamente a los seis SHA-256 registrados.

