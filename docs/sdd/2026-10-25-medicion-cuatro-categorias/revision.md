# M9 — Revisión final de RESULTADOS, 27/10/2026

**CONFORME PARA EL INFORME, CON LÍMITES EXPLÍCITOS.** Sin hallazgos bloqueantes en los resultados auditados. Este dictamen no cierra M9, M10 ni Fase 1. **CA9 conserva pendiente la disponibilidad de la demo tras su reapertura por el principal.** La conservación de sus datos ya está acreditada.

Parte 5, bajo el plan M9 aprobado y AGENTS §12.4. Solo lectura de fuentes/evidencias y análisis Node de archivos locales. Escrituras exclusivas: estos `resultado.json` y `revision.md`. Sin suites, imports del runner, PG, Docker, HTTP, `.env`, Git ni hijos persistentes. Slot libre. Las 95 pruebas, sintaxis, Biome y revisiones de deltas previamente entregadas se reutilizan, sin repetirlas.

## Corte y trazabilidad

Las fuentes actuales coinciden por SHA-256 con `fix-top50-27/freeze.json`:

- Runner: `5081586d766c668144397253e4af8fc6aae86495abaf8ef059df9375af17b6de`.
- Tests: `3a55d34b7e799c38bc52501a8cc32eef63b04b9d1df486986d16dfd05631f7b2`.

Runtime: `.turbo/m9-2026-10-25/relevo-implementador/operacion/`. Diario: banco fijo `curichi_sdd_m9_20261025`, OID197700, 178 etapas únicas, 71 consultas, `pending:null`. El exit0 de sesión73385 fue comunicado por el principal; esta revisión contrasta el estado final y sus artefactos, sin afirmar haber observado nuevamente ese proceso.

| Tramo | Folder bajo el runtime | Casos | SHA del runner en su manifiesto |
|---|---|---:|---|
| 1 | `ejecucion-36d2f81d-df91-4856-94ee-2eae04ea5d30` | 31 | `b2be5543…` |
| 2 | `ejecucion-ee025c03-d5f7-4dcf-b4f4-103531d17dcb` | 23 | `f4124cdc…` |
| 3 | `ejecucion-924adb89-24d0-462d-b259-3dce3d2c8b42` | 17 | `5081586d…` |

Los 54 casos anteriores y 17 nuevos están presentes, sin duplicados. Cada resultado se contrasta con **`consultas.json` de su propio folder** y su manifiesto, conservando identidad de código. Los SQL textuales coinciden entre las tres capturas; las únicas variaciones de parámetros son anclas temporales de ejecutivo7d/30d. Por ejemplo, las capturas pasan de `2026-10-20T02:40:56.403Z` a `2026-10-20T03:34:33.768Z` y `2026-10-20T13:16:01.504Z` en inundación7d. No se atribuye una foto temporal global a los tres tramos. Dentro de cada caso el runner usa REPEATABLE READ READ ONLY.

Las 229 entradas ajenas a los dos scripts coinciden entre los manifiestos de los tramos. Se conservan diario, eventos, manifiestos e historial de recuperación. Las recuperaciones BBOX y TOP50 mantuvieron respectivamente 137/160 etapas y 31/54 consultas, sin sumar mediciones al despejar `pending`. Se reutiliza la comprobación F0 del principal: 938 archivos, cinco documentos únicos cambiados, cero missing y dos scripts M9 nuevos; no se repitió ese inventario.

## Contraste completo de estadísticas

Se recalcularon desde los JSON originales **las 136 sentencias y 1.200 muestras EXPLAIN**, y se contrastaron todas las 136 filas de `operacion/medicion-tabla.md` con `operacion/medicion-resumen.json`. **Cero discrepancias.**

Se verificaron Execution/Planning Time, secuencias de muestras, mediana, máximo, n, filas del nodo raíz, unión de índices observados, buffers hit/read y ruta/digest registrados. Son nueve repeticiones por sentencia y tres para cada SELECT DBSCAN; una ejecución de calentamiento por sentencia. El digest de resultados se coteja como metadato: sin PG ni todas las filas originales no se reconstruye su contenido a partir de ese hash.

Cobertura: 36 listados, cinco exportaciones, cinco indicadores, 15 ejecutivos, cuatro agregados UV, cuatro DBSCAN y dos PIP. Las 24 matrices de control conservan 297.488 filas agregadas; sus sumas y categorías cuadran con los universos de control. Las cinco exportaciones devuelven 50.000 filas y declaran truncamiento: 250.000 filas técnicas por categoría y 1.000.000 en Todas. No acredita serialización CSV/GeoJSON, nota metodológica ni respuesta HTTP.

El mayor Execution Time observado es 1.741,655ms en indicadores/áreas verdes, sentencia3; su mediana es129,140ms. Se conserva ese máximo real, sin descartarlo como atípico ni llamarlo p95. Los planes PIP usan GIST de UV/distritos; no todas sus sentencias necesitan GIST: la búsqueda del distrito por id usa su PK.

## CA1–9

| CA | Resultado auditado y límites |
|---|---|
| 1 | Conforme: manifiestos del banco fijo, contracts0.24.0,21 migraciones hasta0021,16 distritos y576UV `DM_UV_MZ_2025`. Manzanas omitidas declaradamente. Negativos de destinos/guardas y cierre S1/S2 se reutilizan de la revisión independiente previa; no se ejecutaron aquí. |
| 2 | Conforme:1.000.000 exacto,250.000 por categoría, semilla `m9-2026-10-25-v1`. Las204.974 celdas crudas reproducen todos los marginales publicados:576UV y12meses por categoría,650.497 verificados. Etapa validate confirmada; código y fixtures comparan detalle/subtipo/versiones/puntaje/banda contra contracts; trigger habilitado `O`. Territorio:0inválidos,4422discrepancias con prioridad del distrito UV. No se presume independencia estadística perfecta ni origen ciudadano. |
| 3 | Conforme SQL: público/técnico, bbox chico/barrio/ciudad y primera página; Todas solo técnico. Conteos, límites y categorías cuadran. El control sigue la semántica real `&&`, sin certificar contención geométrica exacta. |
| 4 | Conforme SQL: UV por categoría; distrito en indicadores/ejecutivo; Todas donde existe; exportación50000 con truncamiento. Matrices completas anteriores a topes y TOP50 exacto. No se inventa endpoint geo distrito/Todas. |
| 5 | Conforme semántico: DBSCAN con parámetros reales25m inundación/10m restantes y CRS32720; separación de categorías. Recuperación verifica517.762grupos/650.497verificados y cuatro acotados reales, preservando particiones e IDs ajenos. Tiempo full perdido declarado. |
| 6 | Conforme en casos representativos interior/fuera, con planes ANALYZE/BUFFERS y GIST. El resolver actual usa ST_Intersects; la rama exterior captura ST_DWithin geometry+geography. ST_Contains del medidor selecciona espacio para testigos, no reemplaza la consulta PIP productiva; no se introduce ST_Covers ni epsilon. Borde y hueco asignado quedan NO_MEDIDO, aunque el control territorial integral detecta discrepancias. |
| 7 | Conforme para consultas, carga y tamaños. Todas las medianas/máximos9/3, calentamiento y muestras están contrastados. Límite material: duración del recálculo completo y del pipeline total NO_MEDIDO. No afirmar cumplimiento temporal integral, p95 ni caché fría. |
| 8 | Condicional no ejercido: HTTP,front y concurrencia NO_MEDIDO. Una conexión SQL secuencial no demuestra capacidad multiusuario. |
| 9 | Revisión de resultados conforme; comparación M2 con límites y conservación de demo comprobadas. Pendiente solo acreditar disponibilidad tras reapertura, a cargo del principal. No cruzar puertas de fase por este dictamen. |

## Recuperación y tiempos que no se deben confundir

En `ejecucion-240ddaca-bf1a-42f4-ba75-8c72771ffdea/`, `equivalencia-full-verificado.json`, los cuatro pares commit/verificado, `equivalencia.json` y la transición105→106 del diario coinciden. `fullMs:null`, `fullTime:NO_MEDIDO: duración anterior perdida`. Los14.146,956ms son verificación de particiones existentes, no duración del algoritmo completo.

| Categoría | Afectados | Tiempo del acotado ms | Verificación posterior ms |
|---|---:|---:|---:|
| Inundación | 2 | 60,979 | 4914,376 |
| Bache | 2 | 24,144 | 5353,807 |
| Áreas verdes | 3 | 29,268 | 4858,048 |
| Basura | 4 | 26,912 | 4853,090 |

Cada acotado crea/disuelve un punto y declara `completo:false`; el código comprueba el conjunto exacto afectado, desaparición del grupo sustituido, particiones propias e identidad de grupos ajenos antes de emitir verificado. Es una ejecución por categoría. No permite mediana/p95 de acotados ni speedup contra el full perdido. Los SELECT DBSCAN medidos3veces tampoco equivalen al recálculo completo que construye/PIP/escribe derivadas.

La suma de los100eventos de carga reproduce **353.799,4486ms**. Es suma de etapas de lotes, sin guardas previas ni tiempo total de pared. Tamaños crudos: heap874.471.424B; índices553.066.496B; total reporte1.427.816.448B; base1.617.557.183B. Total de relación incluye más que heap+índices; no se fuerza esa suma como igualdad. Motor registrado PostgreSQL18.6/PostGIS3.6.4. Las1200sondas de muestras registran2047,805–4284,328MiB libres; no describen todos los instantes de la operación interrumpida.

## Oráculos, demo y alcance de la conclusión

`operacion/verificacion-bbox-real.json` registra positivo50filas y negativo lejano `ORACULO_BBOX`; el diagnóstico previo observa un punto0,39637801m fuera del rectángulo numérico con `&& true` e intersección exacta false. No es una tolerancia elegida. `operacion/verificacion-top50-real.json` registra positivo50, matriz11.417grupos y rechazo de orden/conteo alterados. El control independiente usa collation PG y orden/conteos exactos, no desempates arbitrarios. Son ejecuciones previas del principal leídas aquí.

`operacion/antes-medicion.json` y `despues-medicion.json`, OID181316, coinciden en conteos **y** digests de usuario9,reporte48,fotos6,cupos10,auditoría45,categorías4. Esto acredita conservación de esas seis tablas; no acredita por sí solo disponibilidad. No se abrió PG para comprobarla. La reapertura es tarea paralela del principal.

M2 empleó0020, otros fixtures y consultas,20lotes de50k y condiciones de memoria distintas; M9 usa0021, definiciones reales0.24 y100lotes de10k. No se infiere aceleración/regresión causal ni un SLA municipal de su comparación. No se certifican HTTP, cámara física, front, concurrencia, CI global, Docker habitual, producción o pérdida de energía.

`medicion.md` leído conserva historia y estado en curso; el principal tiene asignada su reescritura final. Esta revisión entrega resultados y límites para esa integración, sin editar documentos compartidos ni aprobar una versión futura no leída. **0hijos propios persistentes; slot LIBRE.**
