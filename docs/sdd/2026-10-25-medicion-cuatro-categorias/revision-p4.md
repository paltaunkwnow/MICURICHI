# M9 · F4 final · Revisión independiente P4/SQL/plan

**26/10/2026 — CONFORME ESTÁTICO PARA OPERAR el runner congelado, dentro del alcance P4/SQL.**
Los cinco P2 de `revision-p4/codigo-inicial.md` quedan cerrados por lectura. No encuentro
P1/P2 bloqueantes nuevos en este alcance. CA3–CA6 cuentan con instrumentación y controles
estáticamente conformes; su aceptación con datos reales permanece **pendiente de PostgreSQL**.
Este dictamen no sustituye el del auditor de guardas y ejecución ni cierra M9/Fase 1.

Subtrabajo Parte 4, revisión por lectura, bajo el plan aprobado el 25/10. Leídos AGENTS.md,
el plan M9, `revision-p4/{codigo-inicial.md,diseno.md}`, runner/tests congelados, evidencia
indicada abajo y las fuentes productivas directamente pertinentes. No ejecuté el runner,
imports, suites, SQL, DB, builds ni servidores; no leí `.env`, instalé, borré ni usé Git.
Escritura limitada a este archivo y `.turbo/m9-2026-10-25/revision-final-26/p4/`.

## Identidad del corte

Las dos fuentes actuales y sus copias de lectura en `revision-final-26/` coinciden con
`relevo-26-implementador/freeze.json` (freeze `2026-10-26T12:13:42.393Z`). SHA-256 comprobados
al inicio y al cierre; capturas en
[huellas.json](C:/Users/HP/Desktop/MICURICHI/.turbo/m9-2026-10-25/revision-final-26/p4/huellas.json).

| Archivo | Bytes | SHA-256 inicial y final |
|---|---:|---|
| `scripts/medir-cuatro-categorias.mjs` | 72850 | `d79b033c073dfe6065693603686ddeaf50c0f6859676515c50391fba10051c1b` |
| `scripts/medir-cuatro-categorias.test.mjs` | 41374 | `781eb6b06857191333c98b9fb24c9dad444c8d2c8bbc9f478be25749e2ff4847` |

Las líneas siguientes corresponden a este corte. No se modificó producto ni las copias.

## Cierre de los cinco P2

| P2 previo | Evidencia en `scripts/medir-cuatro-categorias.mjs` | Tests actuales en `scripts/medir-cuatro-categorias.test.mjs` y juicio |
|---|---|---|
| 1. Totales que ocultaban estados, bandas, geografía y recurrentes falsos | L959–972: matriz completa categoría×estado×banda efectiva×distrito×UV, sin topes. L1010–1138: ejecutivo por distrito/estado/banda y fecha máxima; UV por identidad, distrito, ambos máximos, verificados y críticos; indicadores por estado×banda, distrito, recurrentes y top50 global. | L674,697,889,966,1025. Positivos y ataques que conservan totales; incluye una UV ganadora global ausente de los top50 individuales. **Cerrado**: permutar estados/bandas/UV o falsificar recurrencia/máximo ya falla. |
| 2. Página/exportación repetida o desordenada | L974–1007: selección independiente sobre `reporte`, filtros y orden `creado_en DESC,id DESC`. L1154–1195: conteo, longitud, unicidad y secuencia completa de id/categoría/estado/fecha/subtipo/detalle, además del bbox correcto. | L635,852. Positivos para listado y exportación; repetidos, inversión, sustitución de ID, detalle/subtipo alterados y conteo 10002→10001. **Cerrado**. El fixture persistido se valida aparte contra contracts, L658–678. |
| 3. Equivalencia que aceptaba un no-op o regenerar IDs ajenos | L1281–1421: MEMBERSHIP incluye `group_id`; testigos aislados y componente conocida de varios miembros. Exige afectados exactos, un punto y un disuelto, sin desborde/completo; compara partición propia sin UUID, ajenas con UUID, y exige desaparecer el grupo sustituido. | L845,1088,1103. No-op, UUID ajeno cambiado, partición propia alterada, grupo viejo conservado, disueltos/puntos falsos y desborde fallan; nuevo UUID propio correcto pasa. **Cerrado**. |
| 4. Cronómetro incremental que incluía la comprobación global | L1301–1322 y L1351–1410: `fullMs`/`durationMs` terminan inmediatamente tras cada algoritmo; `fullVerificationMs`/`verificationMs` separados. | L1088: reloj simulado distingue 10 de 3000 ms y 7 de 1000 ms. **Cerrado por lectura y prueba positiva discriminante registrada**; no atribuyo un rojo histórico específico a este cronómetro. |
| 5. PIP que aceptaba cualquier UV coincidente | L648–652 y L679–700: carga y control territorial de todo el banco usan primera UV ordenada, distrito de UV, versión y flags cruzados con distrito PIP. L1218–1266: orden, SQL/parámetros/ramas exactos y replay del resolver real; compara UV elegida, distrito, versión y flags. | L766,1147: UV anterior inesperada, versión/distrito/flags erróneos y cada rama exterior no vacía fallan; interior y exterior vacíos pasan. **Cerrado**. La ejecución territorial municipal sigue pendiente. |

## Evidencia de pruebas, solo leída

En `.turbo/m9-2026-10-25/relevo-26-implementador/`:

- `baseline-test.txt` registra 44 aprobadas/5 fallidas. Su primer fallo P4-3 es
  `CONTROL_NO_SIMULADO`; por sí solo no prueba el defecto semántico de equivalencia.
- `rojo-semantico.txt` conserva cinco negativos con **Missing expected rejection**, incluido
  P4-3. Acredita que el resultado incorrecto era aceptado, sin confundir importación/simulador
  roto con el rojo de dominio. Son cinco pruebas, no cinco hallazgos distintos: dos cubren P2-1.
- `post-primer-parche.txt` registra 49/49; `post-formato.txt` y el freeze final, **57/57**.
  Los ocho casos añadidos incluyen positivos y negativos complementarios, el reloj separado,
  Todas antes del top50 y diagnóstico seguro. Leí sus aserciones; no volví a ejecutarlos.
- `comparacion-test-por-test.json` declara `regressions: []`. Las segundas ocurrencias
  `MISSING` de los fallos corresponden a su repetición en el resumen de errores del log;
  no son diez pruebas retiradas. La certificación de ejecución pertenece al otro auditor.

## CA3–CA6 y SQL real

**CA3:** L774–807 captura `listarReportes` real: cuatro categorías × público/técnico ×
bbox chico/barrio/ciudad/primera página, más Todas técnico. Conserva SELECT_REPORTE completo,
JOIN y fotos; conteo SQL 10001, página explícita 50 y offset 0. El control independiente
L907–928 cuenta sin esos topes; L974–1007 selecciona los IDs ordenados. Público usa geometría
publicable y excluye NULL; técnico incluye todos los estados publicados y geometría exacta.
La transformación pública/HTTP no se acredita con estas filas SQL.

**CA4:** L809–849 captura exportación, indicadores, ejecutivo (`todo/7d/30d`) y agregado UV.
Fuentes contrastadas: `api-core/src/consultas.ts:93,129`, `rutas/admin.ts:124`,
`rutas/ejecutivo.ts:49` y `geo-service/src/visibilidad.ts:53`, además de las plantillas
correspondientes en `dist` que importa el runner. SQL y parámetros se guardarán en
`consultas.json`. Todas no filtra categoría: controles completos previos al tope; no se suman
páginas ni cuatro top50. Exportación cuenta todo y selecciona hasta **50000**, con truncamiento
declarado. Indicadores compara la matriz de los cinco estados y geografía de los tres públicos;
recurrentes usa grupos n≥2, sin confundirlos con el endpoint de críticos públicos. Ejecutivo
contrasta nuevo/validado/resuelto y bandas solo de activas por distrito, con máximo temporal.
UV contrasta ambas severidades máximas por orden baja<media<alta<critica y críticos distintos
por UV; no los suma como número global de grupos. Todas público/geo no existe y no se inventa.
CSV/GeoJSON serializado, nota y truncamiento de respuesta HTTP permanecen fuera de esta medición SQL.

**CA5:** L850–866 captura la consulta mediante `recalcularPuntosCriticos` real, con radio
`undefined` y registro actual: parámetros `[25,32720,'inundacion']` y
`[10,32720,slug]` para cada otra categoría. Fuente `db/src/puntos-criticos.ts:94`:
exactas proyectadas, validado/resuelto, **sin publicar_en ni exigencia geom_publico**.
Testigos 2/3/4/5 y distancia 20 m están dentro del millón y aislados 100 m del resto.
L1205–1214 comprueba categoría/radios sobre esos testigos. L1290–1421 reconstruye completo
y contrasta incremental: sin huérfanos, pertenencia coherente, conteos por categoría y radios;
preserva IDs ajenos y permite UUID nuevo propio. Rechaza motor Node y desborde como éxito.
El recálculo completo incluye construcción/PIP/escritura de derivadas; su tiempo no es el
del SELECT/WindowAgg de DBSCAN. El control prueba reconstrucción de componentes existentes;
no añade una campaña de transiciones, puentes o concurrencia al plan aprobado.

**CA6:** L869–899 captura SQL del resolver real con parámetros `[lon,lat]`; exterior fuerza
capturar también proximidad `[lon,lat,20]`. Contraste contra `geo-service/src/resolver.ts:24–98`:
UV por ST_Intersects ordenado, distrito ordenado, prioridad de distrito UV, proximidad en
geometry+geography y flags. L679–700 deja previsto `control-territorial.json` sobre el millón,
incluidos solapes/discrepancias efectivos. L1218 exige vacías **todas** las ramas del exterior.
L1519–1522 declara borde/hueco/discrepancia **NO_MEDIDO** sin testigo municipal identificado.
La rama de proximidad vacía del exterior no acredita un hueco asignado. No hay afirmación de
uso efectivo de GIST antes de leer los planes de PG; tampoco se deshabilitan índices ni fuerza
el planificador.

## Datos, privacidad y estadística

L15–18,257–323,538–711 fija **1.000.000 total/250.000 por categoría**, con testigos incluidos.
Los ejes estado/espacio/tiempo/privacidad/detalle/reclasificación usan dominios SHA distintos;
categoría balanceada por índice no comparte un módulo corto con esos ejes. La distribución
efectiva cruzada se guardará, no se presume demostrada por la muestra unitaria.

Fixtures usan cada esquema y calculador del registro 0.24.0: 20 combinaciones de inundación
y 80 de cada categoría restante; detalle v1, severidad inundación v2 y restantes v1.
L670–678 compara detalle/subtipo/versiones/puntaje/banda persistidos con esos fixtures.
Los puntajes solo se calculan/validan dentro de su modelo; no se suman, promedian ni comparan
entre categorías. Las bandas efectivas sí se cuentan según el producto.

No demuestro por lectura un error inevitable del INSERT L626–653: las columnas de inundación
salen del detalle; las seis son NULL en las otras categorías, incluida causa. Respeta el
trigger 0020, cuya actividad se comprueba L701–707, descripción, motivos, enum aproximada
y publicar_en=creado_en+60s. Los duplicados sintéticos quedan sin canónico, permitido por
0018; los campos antiguos obligatorios retirados en 0010 no se omiten por error. No hay
desactivación de restricciones. Resolver y volumen pueden abortar si la generación real no
cumple: esa posibilidad se conserva; no se presenta como carga ya exitosa.

`coordenadaPublica` calcula jitter/redondeo L592–600 con sal exclusivamente sintética, sin
posición de dispositivo; NULL públicos deliberados conservan el universo L distinto de S/D.
No se introduce contraseña ni sal real mediante SET/set_config; el runner no contiene una
llamada a set_config. Configura search_path/plazos y consume el migrador existente.
L29–64 y L1853–1879 emiten diagnóstico codificado sin message/stack/cause; no se exponen
credenciales en la evidencia prevista. La auditoría integral de guardas/logs es del otro auditor.

L1452–1496 separa calentamiento y comprobación de resultados de los planes:
**9 repeticiones por statement SQL y 3 por SELECT DBSCAN**, cada una
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, en REPEATABLE READ READ ONLY. Conserva planes,
muestras de Execution/Planning Time, mediana y máximo; **no p95**, caché fría ni latencia HTTP.
Los tiempos de `despues_job` incluyen envoltura operativa y no sustituyen `fullMs`/`durationMs`
ni el tiempo de SELECT. L1503–1511 captura tamaños e índices; L1513–1525 limita conclusiones
a SQL secuencial, distingue M2/0020 de M9/0021 y deja HTTP CA8 condicional **NO_MEDIDO**, válido.

## Límite del dictamen

Puede avanzarse al turno operativo previsto por el plan una vez conforme la auditoría
complementaria. No se requiere ampliar HTTP ni inventar fixtures de borde para este cierre
estático. La procedencia del banco, carga real, distribución, control territorial efectivo,
equivalencia en PG, planes/GIST, tamaños, tiempos y preservación/reapertura de demo deberán
acreditarse con la corrida y sus resultados. Aquí no se afirma PostgreSQL verde.
