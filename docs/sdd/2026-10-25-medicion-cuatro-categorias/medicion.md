# M9 — Medición real de cuatro categorías

**Estado: cerrada en local el2026-10-27.**71/71casos,136sentencias/1200muestras,
178etapas/exit0;revisión independiente conforme y demo conservada/reabierta.
[Informe final y límites](informe.md). Las notas de interrupción de abajo son históricas.

La revisión independiente contrastó todas las muestras,medianas/máximos,índices/buffers y
tablas con0discrepancias: [dictamen](revision.md). Detalle completo de136filas y1200planes
en `.turbo/m9-2026-10-25/operacion/medicion-tabla.md`, `medicion-resumen.json` y archivos
`consulta-*.json`en los tres folders de ejecución;cada caso usa la captura de su mismo folder.
MuestrasSQL:2047.805–4284.328MiB libres;condiciones del equipo variables, sin SLA municipal.

## Banco y preparación comprobados

Banco aprobado `curichi_sdd_m9_20261025`, OID197700, migraciones hasta0021 y definiciones
reales de contracts0.24.0. Capas de distrito y UV `DM_UV_MZ_2025`; manzanas omitidas
porque ninguna consulta medida las utiliza. Se conservan restricciones y disparadores.

| Categoría | Reportes |
|---|---:|
| Inundaciones | 250000 |
| Baches | 250000 |
| Basura | 250000 |
| Áreas verdes | 250000 |
| Total | 1000000 |

Semilla `m9-2026-10-25-v1`;100lotes de10000. Validación territorial del millón:
0inválidos,0sobre borde y4422casos de distrito discrepante. Se conserva la regla de
prioridad del distrito de la UV y su indicador. No son reportes ciudadanos reales.

Distribución efectiva, obtenida del artefacto de validación; cada categoría cubre576UV
y los12meses. Se guardan204974combinaciones cruzadas de categoría/estado/UV/mes/privacidad;
no se deduce independencia estadística perfecta de estos marginales.

| Categoría | Nuevo | Validado | Resuelto | Rechazado | Duplicado | Vivienda/predio |
|---|---:|---:|---:|---:|---:|---:|
| Áreas verdes | 62288 | 137524 | 25097 | 12527 | 12564 | 49623 |
| Baches | 62279 | 137422 | 24980 | 12570 | 12749 | 50158 |
| Basura | 62667 | 137504 | 24949 | 12335 | 12545 | 49958 |
| Inundaciones | 62084 | 137742 | 25279 | 12496 | 12399 | 50269 |

El universo verificado del recálculo es650497reportes (`validado`+`resuelto`).
El trigger`reporte_sincronizar_detalle`está habilitado (`O`). Resumen reproducido desde
`ejecucion-d82d2cc1-1217-4128-ab23-ba6f1551b0cc/distribucion.json` en
`.turbo/m9-2026-10-25/operacion/distribucion-resumen.json`.

| Etapa | Duración de la etapa (ms) |
|---|---:|
| Migraciones | 680.6644 |
| Carga de capas | 125.0981 |
| Activación | 110.3769 |
| Suma de100lotes de carga | 353799.4486 |
| ANALYZE | 853.5761 |
| Validación | 25961.8660 |

La suma de lotes excluye las guardas de recursos previas; no es latencia SQL ni el tiempo
total de pared. No se compara directamente con M2 sin ajustar método y versión.
Evidencia: `.turbo/m9-2026-10-25/operacion/preparacion-resumen.json` y runtime
`relevo-implementador/operacion/ejecucion-bd92cfda-8ed5-436d-8aea-0a57795df593/`.

## Interrupción, recuperación y medición en curso

**TOP50cerrado27/10 09:14Bolivia:** revisiónindependiente95PASS0conforme/hashestable.
PruebaPGREADONLYacepta50UVy rechaza ordenJSyconteofalsoenmemoria conORACULO_TOP50_UV;
matrizindependiente11417grupos. Evidencia`operacion/verificacion-top50-real.json`.
`recuperar-consulta-top50`terminó0y conservó160completed/54queries;pendingnull.
Salida`ejecucion-72e53632-107f-4046-9a84-88c25142a02e`. Se medirán17casos pendientes,
sin repetir los54anteriores ni los recálculos. El cambio corrige orden del medidor;
no modifica el SQL del producto ni la selección de50UV.

**Tercer tramoSQL:54/71confirmados.** Sesión28951terminó1en`query:indicadores:basura`,
ORACULO_TOP50_UV;160completed conservados. Diagnóstico de solo lectura en
`operacion/diagnostico-top50.json`:el SQL sí desempata por id. PostgreSQLen_US.utf8ordena
ET3antesET-92,ambasUVcon420reportes;JavaScript`<`lasinvierte. Solo se permutan puestos32/33,
no el límite50(ET77/n417). Los576conteos completos ordenados enPGcoinciden con la API.
Se conserva la comparación exacta y se corregirá el orden del control independiente;
no se aceptan empates arbitrarios ni se modifica el SQL productivo. Recuperación explícita
pendiente de pruebas/revisión;54mediciones permanecen guardadas. M10.1 sigue dependiente deM9.

**ControlBBOX concluido26/10 23:33Bolivia:** revisiónindependienteconforme88PASS0,
fuentequieta/hashestable. PruebaPGrealREADONLY:50filasaceptadas (954coincidencias públicas
exactas del predicado bbox); una coordenada0,0alterada solo en memoria fue rechazada con
ORACULO_BBOX. Diario intacto. Artefacto`operacion/verificacion-bbox-real.json`.
Recuperación explícita terminó0 y conservó137completed/31queries; todavía no cuenta como
medición de la consulta fallida. Salida`ejecucion-715fb81a-5a94-48f7-8aee-529704d203f2`.
Se reanudará `medir`para los40casos restantes, sin repetir los anteriores ni los acotados.

**Segundo intentoSQL:31/71confirmados y parada controlada.** La sesión39320terminó1
en`query:publico:area_verde:barrio`por`ORACULO_BBOX`; diario137completed conservado.
La recuperación de puntos críticos anterior sigue aprobada y no se repetirá.

Diagnóstico de solo lectura:`operacion/diagnostico-bbox.json`:50filas; una coordenada
pública sintética está0.39637801m fuera del rectángulo numérico, pero su predicado SQL
`geom_publico && envelope`da true y`ST_Intersects`da false. El control numérico del medidor
exigía otra semántica que la consulta actual. `&&`contrasta cajas2D y aprovecha índices;
ver [documentación oficial PostGIS](https://postgis.net/docs/geometry_overlaps.html).
No se modifica el SQL productivo ni se introduce una tolerancia arbitraria.
Se corrige el control de coordenadas devueltas y se prepara recuperación explícita de
esa única consulta de solo lectura, conservando31resultados y sin avanzar una etapa no medida.
Se requiere positivo de borde y negativo con coordenada lejana, además de guardas de
manifiesto/procedencia. M9 sigue abierta; M10.1 no comienza hasta cerrarla.

**Recuperación terminada exit0,26/10 22:40Bolivia.** El diario llegó a106etapas sin
pending. Se contrastaron las particiones existentes con el SELECT DBSCAN de cada categoría
y se efectuaron cuatro recálculos acotados reales; se conservaron las particiones y los
identificadores ajenos.517762grupos/650497verificados. Artefacto`equivalencia.json`en la
ejecución de recuperación indicada abajo. El tiempo del completo permanece null/NO_MEDIDO.

| Categoría | Afectados | Puntos creados/disueltos | Tiempo acotado observado (ms) | Verificación global posterior (ms) |
|---|---:|---:|---:|---:|
| Inundaciones | 2 | 1/1 | 60.979 | 4914.376 |
| Baches | 2 | 1/1 | 24.144 | 5353.807 |
| Áreas verdes | 3 | 1/1 | 29.268 | 4858.048 |
| Basura | 4 | 1/1 | 26.912 | 4853.090 |

Son **una ejecución por categoría**, sin presentarlas como medianas o p95. La verificación
global compara el banco entero y queda fuera del tiempo de la función acotada. La prueba
inicial de particiones tomó14146.956ms; tampoco representa el recálculo completo perdido.

`medir`está activo en sesión39320/PID9584 desde02:40:29.715UTCdel27/10
(26/10 22:40Bolivia),run`24cb503a-7046-42cc-85dc-ca7cc778ae24`. A22:44Bolivia:
27/71casos confirmados, etapa ejecutivoBaches30d; controles de resultados aprobados hasta
ese punto, no el banco completo. Recursos observados en esa etapa~3544MiB/C9.152GiB.

**Actualización26/10 22:39Bolivia:** revisión independienteRR1conforme,81PASS0 y
fuentequieta. El diagnóstico de solo lectura acreditó650497verificados asignados,
517762puntos críticos,0huérfanos y0asignaciones incoherentes; radios25m inundación/10m demás.
No acredita por sí solo equivalencia completa: esa comprobación se está ejecutando.
Recuperación real en sesión70066/PID12924 desde02:38:57UTC del27/10
(22:38:57Bolivia26/10), run`5e278268-5827-466a-819a-2b79b1ef8d29`.
Evidencia en`relevo-implementador/operacion/ejecucion-240ddaca-bf1a-42f4-ba75-8c72771ffdea/`.
RAM inicial de diagnóstico4048MiB,C9.319GiB/volumenDB935.457GiB. No se repite el completo.

`node scripts/medir-cuatro-categorias.mjs medir` comenzó14:46:32UTC y terminó exit1
a15:12:35UTC del26/10: `RECURSOS_INSUFICIENTES_CONSERVAR_EVIDENCIA`. El diario conserva
`pending:equivalence`, sin `equivalencia.json`. La sesión20503/PID18404 terminó.
No se interpreta el tiempo total del intento como duración del algoritmo. Antes del fallo
se observaron INSERT recientes del recálculo completo; su finalización aún no está acreditada.
A18:13UTC no quedaban otras conexiones en el banco; se conservaron datos/diario/evidencia.

Se revisa una recuperación explícita con checkpoints, sin bajar guardas ni repetir una
etapa incierta automáticamente. Las71consultas SQL y la equivalencia final siguen pendientes.
Se informarán mediana y máximo de9repeticiones (3para DBSCAN), calentamiento declarado.
HTTP, concurrencia y rendimiento del navegador quedan fuera de esta medición SQL.
La demo está pausada; comparación de sus datos y reapertura pendientes al finalizar.

## Condiciones y comparación con M2

Control del26/10 a18:18UTC: Windows11Home10.0.26200, IntelCorei5-13420H,
8núcleos/12procesadores lógicos,16024.51MiB visibles,4632.40MiB libres y8.056GiB
libres enC:. No se cambió configuración de potencia. Este control posterior al fallo
no demuestra cuáles fueron los recursos exactos cuando se activó la guarda.
Evidencia: `.turbo/m9-2026-10-25/operacion/maquina-20261026.json`.

| Aspecto | M2, antecedente del08/10 | M9 |
|---|---|---|
| Volumen | 1M/250kcada categoría | Igual volumen, nuevas combinaciones válidas de0.24 |
| Modelo | Migración0020 | 0021, índice categoría/fecha ya presente |
| Carga | 20lotes de50k,78s informados | 100lotes de10k; suma de etapas353.799s, método distinto |
| Categorías | Catálogo con fixtures del spike | Cuatro definiciones reales y calculadores versionados |
| Consultas | Spike de índices y variantes aisladas/combinadas | SELECT actuales completos, sin quitar/forzar índices |
| Puntos críticos | SELECT DBSCAN de una categoría | SELECT por categoría y algoritmo completo/acotado con escritura derivada |
| Estadística | 9repeticiones/3DBSCAN; documento aproxima máximo a p95 | Mediana y máximo, sin atribuir p95 a9muestras |
| Capas | Distrito/UV reales, sin manzanas | Mismo alcance territorial |

Hasta terminar M9 no se calcula una aceleración o regresión frente a M2. Incluso al obtener
valores nuevos, las diferencias de payload, distribución, estado del equipo y alcance de
consulta impiden tratar cada comparación como un cambio causado solo por el índice.
Antecedente: [informe de M2](../2026-10-08-base-multicategoria/medicion.md).
