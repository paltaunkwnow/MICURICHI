# M9 — Cierre local de medición de cuatro categorías

**Cerrada el27/10/2026.** Plan aprobado el25/10; medición real terminada exit0,
178etapas/71casos/136sentencias/1200muestras. Revisión independiente conforme, con límites
expresos, conservación de demo y reapertura comprobadas. No cierra Fase1 ni producción.

## Resultado y alcance

Banco conservado `curichi_sdd_m9_20261025`, OID197700, migraciones0021, contracts0.24.0,
PostgreSQL18.6/PostGIS3.6.4. Un millón sintético total,250000por categoría;16DM/576UV reales.
Manzanas omitidas porque no intervienen en estas consultas. Sin cambios de código productivo,
esquema, contratos o dependencias; solo herramienta/pruebas M9 y documentación aprobada.

| Control | Resultado |
|---|---|
| Casos SQL | 36listados,5exportaciones,5indicadores,15ejecutivos,4UV,4DBSCAN,2PIP |
| Estadística | 9muestras por sentencia,3DBSCAN,calentamiento declarado;mediana/máximo,sin p95 |
| Verificación independiente | 136sentencias/1200muestras y tablas contrastadas;0discrepancias |
| Herramienta | 95PASS/0FAIL,sintaxis0/0,Biome0; revisiones de guardas/deltas conformes |
| Recurrencia | 650497verificados/517762grupos;particiones y radios25/10m correctos;4acotados reales equivalentes |
| Territorio | 0inválidos;4422discrepancias distrito/UV conservadas con prioridad UV y su flag |
| Relación reporte | Heap833.961MiB,índices527.445MiB,total1361.672MiB |
| Base completa | 1542.623MiB;retener banco y evidencia, sin DROP automático |
| Demo conservada | Conteos y digests iguales en6tablas:9usuarios/48reportes/6fotos/10cupos/45auditorías/4categorías |
| Demo reabierta | Web4000/panel4100/API4001/geo4002 responden200;APIready sin degradación;4categorías activas |

Resultados y método: [medicion.md](medicion.md). Dictamen independiente:
[revision.md](revision.md). La disponibilidad posterior se acreditó por el principal en
`.turbo/m9-2026-10-25/operacion/reapertura-demo-20261027.json`, después de ese dictamen.

## Valores representativos, SQL exclusivamente

| Sentencia | Mediana ms | Máximo ms |
|---|---:|---:|
| Listado público inundación,bbox chico,4filas | 0.176 | 0.215 |
| Listado público inundación,barrio,50filas | 23.504 | 27.668 |
| Listado público inundación,ciudad,50filas | 1.125 | 1.215 |
| Listado técnico Todas,ciudad,50filas | 2.090 | 2.287 |
| Exportación Todas,selección50000filas | 461.119 | 487.022 |
| Agregados576UV,inundación | 590.829 | 597.316 |
| SELECT DBSCAN,inundación,163021verificados | 917.271 | 970.404 |

Son sentencias individuales: no latencia HTTP ni del flujo completo. Las exportaciones
truncan a50000;su conteo total es250000por categoría/1M enTodas. El mayor tiempo observado
de toda la corrida fue1741.655ms en una sentencia de indicadores/Áreas verdes (mediana129.140ms);
se conserva sin descartarlo como atípico. No se atribuye una mejora/regresión causal frente aM2.

## Incidencias y límites

La parada por recursos perdió el tiempo del recálculo completo: **NO_MEDIDO**, igual que
el tiempo total del pipeline. La recuperación posterior verificó las particiones existentes
y cuatro acotados reales; no repitió el completo ni fabricó un speedup. Cada acotado tiene
una sola muestra (24.144–60.979ms);su verificación global posterior se contabiliza aparte.

Se corrigieron dos falsos rechazos del medidor: contención numérica distinta de `&&` y
orden JavaScript distinto de la collationPG. Se conservaron todos los controles y se
acreditaron negativos reales READONLY con coordenada lejana, orden y conteos alterados
solo en memoria. Las recuperaciones fueron explícitas,con manifiestos/procedencia y sin
avanzar etapas no medidas. El historial de intentos y el NO CONFORME RR1 permanecen guardados.

Los tres tramos31+23+17 usan SQL idéntico;cada resultado conserva captura y parámetros de
su propio folder. Cambian anclas temporales de ejecutivo7d/30d: no son una foto global única.
No se midieron HTTP,serializaciónCSV/GeoJSON,front,concurrencia,p95,caché fría,borde/huecoPIP,
cámara física,lectores reales,CIglobal,Dockerhabitual,producción ni pérdida de energía.

## Integridad y continuidad

No se consultaron ni migraron `curichi`, `curichi_revision` o `postgres`.
`curichi_e2e`solo bootstrap de metadatos;demo sin seed/load/migración nueva. Sin descargas,
limpieza de cachés/logs,cambios persistentes o roles globales. Sin commits,push ni PR.
Los rojos globales y omisiones previos siguen declarados en la línea base;no se corrigieron
de pasada ni se presentan como verificación actual de dependencias.

La demo permanece en sesión44362/PID29340: http://127.0.0.2:4000 y http://127.0.0.2:4100.
La apertura del panel de navegador de Codex quedó `queued`;eso no prueba que se mostrara.
El avisoNextstandalone se conserva;HTTPfunciona, no certifica otro método de despliegue.

Siguiente: ejecutar [M10.1 aprobado](../2026-10-26-contraccion-compatible/plan.md),ocho archivos
API y documentación,conservando compatibilidad. No autoriza DROP,retiradaHTTP,producción o Git.
