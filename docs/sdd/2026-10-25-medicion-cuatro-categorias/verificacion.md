# M9 — Verificación

Actualizado:2026-10-27. Plan aprobado25/10. **M9 cerrada en local.**
El [informe final](informe.md) y la [revisión independiente](revision.md) prevalecen sobre
los estados de ejecución históricos conservados debajo.

## Cierre verificado del27/10

- Herramienta congelada:95PASS,0fallos; sintaxis yBiome exit0. Evidencia
  `.turbo/m9-2026-10-25/fix-top50-27/freeze.json` y revisión independiente conforme.
- `medir` terminó exit0:178etapas confirmadas,71casos/136sentencias/1200muestras,
  sin etapa pendiente. Última ejecución `ejecucion-924adb89-24d0-462d-b259-3dce3d2c8b42`.
- Revisor independiente comparó las136estadísticas y1200muestras:0discrepancias.
  Artefactos `review-resultados-27/` del scratchM9. No ejecutó las comprobaciones HTTP posteriores.
- `node .turbo/m9-2026-10-25/operacion/snapshot-demo.mjs despues-medicion` terminó0,
  `M9_CONSERVA_DATOS_DE_DEMO`: conteos y huellas iguales en las seis tablas comprobadas.
- `node scripts/multitematica-local.mjs iniciar` reabrió la demo sin preparar/seed/migración.
  ControlHTTP posterior: web/panel/APIready/geoready200, API sin degradación y cuatro
  categorías anunciadas; evidencia `operacion/reapertura-demo-20261027.json`,13:35UTC.
- El tiempo perdido del recálculo completo sigue **NO_MEDIDO**. Los valores de las consultas
  son medianas/máximos SQL secuenciales; no se certifican p95, HTTP, concurrencia o producción.

Las rutas de evidencia abreviadas son relativas a `.turbo/m9-2026-10-25/`.
No se presentan controles unitarios del medidor como capacidad medida de la plataforma.

## Implementación congelada para revisión

Anscombe entregó únicamente `scripts/medir-cuatro-categorias.mjs` y su `.test.mjs`.
No cambió las fuentes de apps/API/DB/geo/contracts/ETL ni ejecutó conexiones reales.
La comparación de F0938 archivos solo detectó cinco cambios documentales autorizados.

| Control del escritor | Resultado y evidencia |
|---|---|
| Estado recibido | 44PASS/5FAIL, con rojos previos preservados; no eran un cierre válido |
| Nuevos adversarios semánticos | `rojo-semantico.txt` conserva los fallos de los controles; los errores previos `CONTROL_NO_SIMULADO` no se presentan como prueba semántica válida |
| Post final | `post-formato.txt`:57tests/57pass/0fail/0skipped/0cancelled, duración1954ms |
| Regresión | Se conservan los44verdes anteriores; cinco observacionesP4 implementadas y nuevos controles positivos/diagnóstico |
| Sintaxis | `node --check` de ambos archivos, exit0/0 |
| Biome | `Checked 2 files in 38ms. No fixes applied.`, exit0 |

La evidencia del escritor está en `.turbo/m9-2026-10-25/relevo-26-implementador/`.
`freeze.json` conserva comparación por prueba y huellas. Copias estáticas de lectura en
`revision-final-26/`, con igual hash; esas copias no se ejecutan.

- Runner SHA256:`d79b033c073dfe6065693603686ddeaf50c0f6859676515c50391fba10051c1b`.
- Tests SHA256:`781eb6b06857191333c98b9fb24c9dad444c8d2c8bbc9f478be25749e2ff4847`.

Revisión independiente iniciada sobre este corte: seguridad/operación y pruebas por Mendel;
SQL/fixtures/oráculos por Parfit. Sin permiso de PG del banco hasta completar dictámenes.
El escritor liberó el turno y cerró sus hijos. No confundir esa entrega con ejecución SQL.

## F4 independiente del primer freeze

[P4/SQL](revision-p4.md): CONFORME ESTÁTICO para operar en su alcance, cinco observaciones
P2 previas cerradas. No ejecutó código, SQL o conexiones; no certifica datos/tiempos reales.

[Seguridad y operación](revision-seguridad.md): **NO CONFORME para primer PG**.
Ejecutó57/57M9 y40/40runner anterior, sin regresiones de esas suites, sintaxis0/0 yBiome0,
con iguales hashes antes/después. Los negativos propios encontraron dos huecos adicionales:

- S1: archivo de diario existente con JSON `null`, `false`, `0` o cadena vacía alcanzaba
  Client falso como si no hubiera diario. Debe rechazarse antes de Client y conservarse;
  únicamente ENOENT representa ausencia.
- S2: ambos destinos podían usarIPv6, mientras la sonda de espacio acreditaba un volumen
  publicado en127.0.0.1. Debe vincularse el endpoint al volumen acreditado.

Los tests propios de la auditoría no abrieron PG: el constructor falso abortó con sentinela.
El exit0 de esa reproducción no significa conformidad. Anscombe reanudó ownership de
los dos archivos para corrección acotada; no cambiará SQL/oráculos ya conformes.
No ejecutar el banco por el mero verde57/40 ni por el dictamen P4 hasta cerrar S1/S2.

Escaneo del inventario, incluyendo archivos nuevos, con reglas canónicas intactas:
11archivos/2coincidencias. AST/dataflow del auditor justifican ambos falsos positivos:
valor dinámico `decodeURIComponent(url.password)` y fixture sintético de URL en tests.
No se imprimieron valores ni se alteraron reglas; no se informa cero coincidencias ni
un certificado global de secretos. Evidencia: `revision-final-26/secretos.json` y
`seguridad/clasificacion-secretos.json`.

## Corrección de S1/S2 — pendiente del delta independiente

Anscombe conservó el intento rojo y cerró la corrección acotada:57PASS antes,
68PASS después, cero fallos/omisiones/regresiones; sintaxis0/0 yBiome0. Los11casos
añadidos usan archivos reales de prueba, clientes falsos y recursos falsos; ningún PG real.
Solo ENOENT significa ausencia de diario. Los JSONfalsy/estructuras inválidas se rechazan
antes de Client; el intento de creación conocido sinOID conserva su inspección sin replay.
La nueva herramienta admite soloIPv4loopback y localhost normalizado al endpoint acreditado.
No modifica la disponibilidad IPv6 de las apps o de servicios existentes.

Nuevo freeze `correccion-seguridad-26/freeze.json`,26/10 14:18:27UTC:
runner`0cf52d79a85d230aeb91aabeb931226cb23bbcd00be2f932f00c31e44c086673`;
tests`435e8751290854849d5c8c7c71b70627c266adae89e99a55e3d39a587f05f8d8`.
SQL/oráculos/P4 permanecen idénticos byte por byte en un bloque de47620bytes
(SHA256`40883414e4154f66a4979c84863a177af6765850b47190fe6f7a168c3e9fd9e0`),
según comparación estática preservada. Las funciones tocadas son validación de credencial,
entrada de createBank, adaptador Client/load e inspectState; no cambios de producto.

Fuente quieta y escritor cerrado. Mendel revisa y ejecuta el delta independiente antes
de permitir el primerPG; el dictamen anterior NO CONFORME permanece como histórico.

## Vuelta independiente de seguridad y comienzo real

Archimedes entregóCONFORME para operar el banco fijo: S1/S2cerrados,68/68 más adversarios
con exit0,sintaxis/Biome0,hashes antes/después iguales. Reutilizó40casos anteriores por
hashsin repetirlos y comprobó47620bytesP4idénticos. No abrióPG; cerró sus hijos y liberó
el turno. El dictamen anterior NO CONFORME se conserva íntegro y la vuelta está añadida
en `revision-seguridad.md`, con evidencia `revision-final-26/seguridad-vuelta1/`.

El principal ejecutó después el runner original congelado con hash comprobado, acción
`preparar`. La operación creó exclusivamente `curichi_sdd_m9_20261025`, OID197700 y marker
`medir-cuatro-categorias/v1/c46b85bb-77d9-40de-9dbc-c4b59e4878c0`. Migraciones/capas/activación
completadas; primer control190000filas/19lotes de10000 confirmados, carga aún en curso.
SesiónPTY47148/PID4472. Fuente runtime en `relevo-implementador/operacion/` del scratch.
No se atribuye ese progreso a una medición completada ni a un millón ya validado.

## Conservación y estado de la demo

Tras la interrupción y el arranque de Windows del26/10, los cinco PIDs anteriores estaban
ausentes y los cuatro puertos de demo libres. Se preservó el lock obsoleto26852 en
`operacion/demo-lock-anterior-20261026.txt`, tras comprobar rutas absolutas dentro del
workspace. No se borraron cachés, logs o datos. La demo está detenida, no disponible ahora.

El helper de control terminó0 y escribió `operacion/antes-medicion.json`:9usuarios,
48reportes,6fotos,10contadores,45auditorías y4categorías, con huellas agregadas.
Es una lectura exclusivamente de `curichi_multitematica`, necesaria para la comparación
de conservación aprobada. El medidor del banco no puede conectarse a esa base.
La comparación posterior y reapertura están pendientes; no repetir preparación/seed/load.

## Fuera de esta ejecución

**Actualización real26/10 a18:13UTC:** preparar terminó0/105etapas,1Mexacto/250kcada,
0inválidos territoriales. Medir comenzó14:46:32UTC y terminó1a15:12:35UTC por
`RECURSOS_INSUFICIENTES_CONSERVAR_EVIDENCIA`, etapaequivalence incierta conservada,
sinartefacto final. Banco sin otras conexiones a18:13UTC. Se revisa recuperación explícita;
no atribuir duración del intento al algoritmo ni marcar CA5/consultas como verificadas.

Las suites de producto y14E2E de la entrega anterior se mantienen como evidencia histórica
identificada, sin repetirlas por cambios exclusivos de herramientas. Rojo global de lint,
vulnerabilidades previas y12omisiones API permanecen declarados. No hay certificación de
producción, concurrencia, HTTP o medición M9 todavía.
