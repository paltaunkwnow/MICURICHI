# M10.1 y RF-01 — Informe de cierre local

**Completados y verificados en local el27/10.** La API lee los seis campos de inundación
desde`detalle` manteniendo los aliases de respuesta yCSV. Conserva ambas formasPOST,
privacidad, validación, escritura dual y estructuras antiguas. La instrumentación registra
forma/resultado con etiquetas finitas y sin datos personales.

RF-01, defecto heredado detectado durante la revisión, se corrigió con aprobación explícita.
Ambos formatos aplican los defaults a la huella y reconocen la única variante histórica
admitida para causa`desconocida`, sin alterar las claves vigentes. Un cambio real de causa,
descripción, coordenada o categoría sigue respondiendo409. Cupo,auditoría,cuenta yvencimiento
conservan sus reglas.

## Verificación

| Control | Resultado |
|---|---|
| API completa del implementador | 562PASS/12SKIP,0fallos |
| Comparación con los547casos anteriores | Ninguno perdido;27nuevos aprobados |
| TiposAPI y grafo de consumidores | Exit0;9/9tareas en el grafo |
| Verificación independiente del delta | 75/75,0omisiones,exit0 |
| TiposAPI,build normal yBiome independientes | Exit0 |
| Revisión funcional y de privacidad del delta | Conforme estático,8/8huellas estables |

Los dos timeouts de exportación de la reanudación se conservaron y reprodujeron aislados.
Se acotaron porUV solo los tres casos nuevosM10.1 que recorrían el dataset masivo de otro
grupo. Se conservaron todas sus aserciones,selectores y los casos masivos históricos,
sin ampliar tiempos ni omitir casos. Después el archivo completo aprobó24/24.

Las huellas antiguas se capturaron con la API previa alfix. Los casos nuevos verifican
claves históricas,defaults,negativos,caducidad,cuentas y conservación de filas/cupos/auditoría.
Los doceSKIP corresponden aPGreal/S3;no son verificaciones de esos servicios.

La evidencia completa y las interrupciones de redactores están documentadas en
[verificacion.md](verificacion.md),[implementacion.md](implementacion.md) y[revision.md](revision.md).
El verificador terminó sus comandos antes del límite de uso;el principal consolidó sus
salidas sin atribuirle un informe final que no llegó a escribir. No se repitieron pruebas
ya aprobadas sobre fuentes con huellas idénticas.

## Alcance y continuidad

Ocho archivosAPI del inventarioM10.1;RF-01 añadió su corrección en tres y el ajuste de
fixture se mantuvo dentro del archivo de pruebas aprobado originalmente. Contratos0.24,
OpenAPI,esquema,migraciones,apps,geo y dependencias permanecen sin cambios propios.
Build normalAPI actualizado;la reapertura de la demo se documentará como operación aparte,
sinresembrar ni migrar. Las medicionesM9 siguen correspondiendo a su fuente anterior capturada.

M10 completo sigue abierto: no se retiraron columnas,vistas,cuota antigua ni formasHTTP.
La ventana de convivencia,consumidores internos,ensayo cifrado/restaurado y reversa
multitemática mantienen sus puertas. El siguiente bloque [M10.2 de respaldos](../2026-10-27-respaldos-multitematicos/plan.md)
ya fue aprobado en el mismo mensaje,«Aprobar ambos bloques,en orden»;se ejecuta después
deeste cierre y solo con mocks,sin restauraciones reales. No solicitar esa aprobación otra vez.

Sincommits,push,PR,limpieza de cachés/logs,descargas,cambios persistentes o bases protegidas.
No se certifica producción ni cierre humano deFase1.

## Reapertura operativa de la demo

El27/10 por la noche (America/La_Paz),solo`iniciar` del runner autorizado reabrió la
instalación existente. No se ejecutaron preparar,seed,carga ni migración. Web,panel,APIready
ygeoready devolvieron200;API sin degradación yconfiguración con las cuatro categorías.
Evidencia `.turbo/m10-2026-10-26/operacion/reapertura-demo-rf01-20261027.json`
(28/10 00:09UTC). Se mantuvo el avisoNextstandalone ya conocido;no se certifica otro despliegue.

Sesión38277,launcher22204;geo15012,API17032,web14504,panel27616. No reutilizar esosPIDs
sin comprobar identidad al retomar. La sesión anterior ya no existía y su lock se conservó
en evidencia tras verificar que su propietario había terminado;ningún proceso ajeno se detuvo.
