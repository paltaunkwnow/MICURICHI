# Cierre M10 — integración en curso

**Código verificado, cierre operacional pendiente.** Las fuentes de producto están
congeladas y Carver emitió CIERRE_CODIGO_APTOCONLIMITES el03/11. Esta corrida parte de
su F0 propio, no de HEAD; conserva los cambios anteriores.

Reanudación01/11: se recuperaron los controles antes de repetir comandos. La revisión
independiente guardada encontró DDL-01P1 y DDL-02/03/04P2 (grants heredados al volver,
archivo sinPK, CHECK homónimo vacío y grants heredados del esquema privado). Se corrigen
en fixtures antes de aceptar el DDL. No se da por cerrada su entrega provisional anterior.
El usuario autorizó commit/push y PR **al terminar**; no autorizó merge ni operaciones reales.

Reanudación02/11: se recuperó el fullDB del corte anterior; terminó321PASS/18FAIL/83omisiones
automáticas por erroresEACCES en conexiones propias, no un full verde. La revisión API
guardada fue conforme por lectura y añadió DDL-03-R/DDL-05 para la reversa y ACL de columna.
Ambos se reprodujeron en siete casos rojos; el dirigido posterior aprobó7/7 (45filtrados).
El fullDB escalado terminó429/429,0omisiones, con el mismo transporte original y sin
cambiar timeouts. Conservó los375casos previos y recuperó los101no verdes del intento
EACCES. Tipos, buildDB y Biome raíz sobre su alcance aprobaron;33fuentes y80dist quedaron
congelados. Handoff completo en `parte4/continuacion-20261102/handoff.md` yJSON hermano.
La conformidad estática de API, por sí sola, no acredita su GREEN/full posterior.
El full posterior de API ya se recuperó completo:612PASS/12SKIP de624,0diferencias por
caso; tipos/build/ROOTBiome exit0 con28fuentes quietas. La adenda de revisión independiente
confirma las dos fixtures y AST equivalente del formato de runtime; no ejecutó las suites.

## Alcance y decisiones

Plan92rutas, ampliación4 y ampliación del escáner3 aprobados:98rutas únicas, porque CI ya
estaba incluida; [guía de arranque](../../../ARRANCAR.md) adicional
solicitada expresamente. [Lista de archivos](archivos.txt) provisional, que se completará
al congelar las entregas. Captura inicial de alcance en
`.turbo/m10-cierre-2026-10-29/alcance-provisional-01.json`, sin tratarla como freeze final.

- JSON pasa a ser la fuente física de los detalles; HTTPv1, ambos POST y alias/CSV se
  conservan. Contracts0.24.0 y OpenAPI no requieren cambio de contrato.
- Cuota histórica pasa a archivo restringido al dueño, sin mezclarla con `cupo_contador`.
- Código y esquema se actualizan y recuperan coordinadamente. El servidor JSON debe
  rechazar un esquema21, futuro o incompleto antes de escuchar o iniciar mantenimiento.
- Arranque ordinario no concede consentimiento de0022 ni migra por sorpresa.

## Evidencias parciales conservadas

| Parte | Resultado comprobado hasta este corte | Falta |
|---|---|---|
| DB |Propio e independiente429/429,0SKIP;375casos previos conservados; tipos/build/ROOTBiome aprobados; revisión de seis hallazgos DDL conforme |Ensayo real posterior autorizado; no sumar parciales como casos únicos |
| API |Propio e independiente612PASS/12SKIP de624; tipos/build/ROOTBiome aprobados; adenda de revisión conforme. Formato7fixtures:98/98posteriores y47bytesexactos |Mantener12SKIP como no verificados; sin repetir full por formato demostrado |
| Geoespacial |Propio e independiente110/110,0SKIP; tipos/ROOTBiome aprobados;324aserciones/14hooks/68HTTP conservados; runtime quieto |Recorrido operacional posterior autorizado |
| Operadores |Propio e independiente: bancos19, respaldo55, local54, ensayo nuevo25, legacy31 y medición inyectada95; Node279PASS y Bash47PASS. Revisión P5 conforme |Operador privado:OP01–03 corregidos,21+32mocks aprobados y revisión conforme; falta acreditar el runtime |
| Escáner |157PASS independientes,154casos anteriores conservados; tres escaneos sin alertas; SCAN01 cerrado por revisión |Hooks y CI remoto se verifican al publicar; no sumar repeticiones |
| Documentación |ADR0026, adendas de compatibilidad, índices/traspaso/producción y guía de arranque |Actualizar estado final con resultados efectivos, sin adelantarlo |

La integración DB inicial tuvo65PASS/1FAIL por una lectura plana en el bloque actual de0010;
tras corregirla, ese mismo archivo aprobó8/8. No es un fullDB limpio de una sola ejecución.
Se conservan el intento de guardas44/49 por denegaciones de herramienta y su reintento49/49.
El primer rojo API tuvoEACCES al conectar su fixture efímera; el reintento del mismo control
eliminó esa omisión accidental y comprobó los50criterios seleccionados. No se sustituyó el
transporte original ni se conectó una instalación real.

Artefactos propios por parte en `.turbo/m10-cierre-2026-10-29/{parte4,parte3,geo,parte5}/`;
baseline independiente y resultados por nombre en `baseline/`. Los números dirigidos no se
suman como si fueran casos únicos de una suite completa. Los12SKIP históricos PG/S3 deAPI
siguen sin verificación real; los casos filtrados de un dirigido no son nuevos SKIP de producto.

## Interfaz de arranque

`SELECT version, integro FROM public.estado_esquema_m10()` debe devolver exactamente
una fila con integer22 y booleantrue. La función tiene ruta de búsqueda fija y ejecución
limitada a dueño/API; no concede SELECT de `_migraciones` al servicio. Comprueba historial,
columnas/restricciones críticas, objetos retirados y archivo. Los contraejemplos incluyen
una fila futura de historial sin cambiar las tablas y renombrar campos críticos.
[Acuerdo detallado](interfaces.md); handoff P4 provisional en `parte4/interfaz-esquema.md`.

## Límites y continuación

Un escritor por carpeta y un único proceso pesado global, con transferencia explícita.
No se ha operado ninguna base real, demo, Docker, S3, respaldo/restauración, E2E o despliegue
en esta corrida. Las cápsulas históricas21/M9/M10.3 se conservan; dist21 por sí solo no
demuestra un release recuperable con todas sus dependencias.

Después de las suites y revisión independientes se completará el
[protocolo operacional propuesto](protocolo-operacional-propuesto.md) y se presentará la
última aprobación concreta. Preparación local para `micurichi.lat`; sin despliegue ahora.
