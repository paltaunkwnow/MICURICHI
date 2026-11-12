# Cierre M10 — informe de código y preparación operacional

**M10 técnico local verificado el 11/11.** La demo está en esquema 22,
pasó 14/14 E2E y el reinicio conservó sus ocho reportes y cuatro fotos de prueba.
La [continuación del 04–05/11](continuacion-20261104.md) documenta los cambios posteriores
en base y respaldos, los controles aislados y el intento nuevo de recuperación.
La aprobación vigente cubre código y pruebas aisladas. El ensayo real de recuperación y
la actualización de la demo conservan sus autorizaciones específicas posteriores.

## Resultado verificado

La contracción compatible conserva HTTP v1, las dos formas de crear reportes, los alias
de Inundaciones y las exportaciones. El detalle JSON pasa a ser almacenamiento único.
La cuota histórica queda en un archivo restringido al dueño; los cupos actuales no cambian.
La migración 0022 requiere consentimiento explícito y el arranque rechaza un esquema
incompatible antes de escuchar. ADR0026 mantiene diferida la retirada de compatibilidad HTTP.

Carver confirmó independientemente **1634 pruebas aprobadas, cero fallos y 12 omisiones
históricas**: DB429, API612, geo110, Node279, Bash47 y escáner157. Conservó los1306casos
anteriores por nombre, estado y multiplicidad. Los dirigidos y las repeticiones de otras
sesiones no se suman a esas cifras. Tipos, compilaciones afectadas, formato del delta,
sintaxis y YAML aprobaron. OpenAPI permanece idéntico.

Peirce cerró los seis hallazgos de migración/reversa/ACL y las revisiones de API, P5 y
SCAN01. Los tres escaneos independientes finales no encontraron alertas. La corrección
de formato retiró exactamente47espacios finales en siete fixtures SQL y conservó sus
tokens y aserciones; el dirigido posterior aprobó98/98.

El dictamen es `CIERRE_CODIGO_APTOCONLIMITES`, no una certificación de producción.
Los12casos omitidos de PG/S3 siguen no verificados y el lint global conserva una deuda
ajena de1error/6warnings en la automatización de contexto. No se ejecutó CI remoto aquí.
Los resultados y los intentos fallidos se detallan en [verificación](verificacion.md),
[revisión](revision.md) e [implementación](implementacion.md).

## Preparación de recuperación

El 05/11, la verificación independiente de las fuentes corregidas aprobó 431 casos
de base y 56 de respaldo. Conservó todos los casos anteriores de ambas suites.
El release 22 cotejó 399 archivos con el freeze y se acreditaron las dependencias de
ambas versiones. La carga independiente abrió los módulos compilados de API y geo,
validó sus configuraciones y comprobó 12 guardas, sin arrancar servidores.

La primera candidata pasó 107 casos privados. GPG recuperó datos sintéticos byte por
byte, el lanzador comprobó el transporte por FD 3 y PowerShell rechazó el permiso de
ejemplo. La revisión del sello de 113 entradas identificó un faltante en el inventario
transitivo y tres guardas incompletas. R2 corrigió los cuatro puntos, aprobó 114 de
114 casos y repitió la carga aislada con 731 módulos cotejados. La revisión posterior
del nuevo sello de 108 entradas dio un dictamen conforme. La comprobación completa de
la puerta aprobó y rechazó el permiso de ejemplo. Evidencias y límites en la
[continuación](continuacion-20261104.md).

## Ensayo autorizado del 06/11

El ensayo R2 llegó a 15 de 24 etapas verificadas. Creó los seis bancos, guardó tres
respaldos cifrados, restauró y cotejó las tres copias y las llevó a esquema 22.
La API aceptó los cinco POST sintéticos y sus reintentos devolvieron los mismos IDs.
El control posterior de filas emitió `POST_REPORTE_SEMANTICA`. El proceso confirmó
su cierre. Quedaron conservados los bancos y el diario. La reversa, la reaplicación
y la actualización de la demo siguen pendientes.

La revisión independiente cotejó los tres cifrados, seis descifrados, tres
comparaciones exactas origen–copia y seis identidades en la evidencia. El censo
CIM posterior confirmó cero procesos propios y cero puertos del ensayo ocupados.
El código comparaba literalmente la fecha de PostgreSQL con la respuesta ISO.
Una prueba con `to_jsonb(timestamptz)` en PostgreSQL efímero reprodujo el rechazo
para el mismo instante. La corrección aislada aprobó cinco casos dirigidos y
conserva el rechazo de una diferencia de un milisegundo. La causa exacta del primer
predicado fallido en R2 no quedó registrada porque la captura posterior no se guardó.

La prueba integrada posterior con las APIs compiladas encontró que PostGIS 3.6.2
serializa la geometría de `to_jsonb` como GeoJSON, mientras el oráculo exigía EWKB.
R3 usa la misma consulta de captura en el operador y en la prueba, con EWKB de
orden fijo y comprobación del punto, coordenadas y SRID 4326. Pasaron ambos casos
integrados en PostgreSQL efímero con PostGIS: dos altas y reintentos en 21, cinco en
22, y cotejo de filas, cupos, idempotencia, auditoría y foto. El resultado real de
R2 conserva su estado parcial.

R3 pasó 121/121, con los 114 casos de referencia conservados. La carga independiente
cotejó 731 módulos y 480 aristas con 13 guardas. La revisión posterior del sello de 79
archivos fue conforme, con cero P1 y P2. La comprobación de la puerta salió 0 y
rechazó el permiso de ejemplo. El usuario autorizó los
[seis destinos de R3](protocolo-operacional-propuesto.md#siguiente-intento-propuesto-r3).

## Ensayo R3 del 06/11

R3 registró seis creaciones, tres respaldos cifrados y tres restauraciones exactas,
con 12 de 24 etapas verificadas. La última es `cargar22`, en `diario/000024.json`.
El lanzador salió con código 1 y sin `resultado.json`. El usuario informó que la
consola se cerró sola. El censo no encontró puertos de ensayo ocupados. Detectó el
agente GPG propio, que se cerró con `gpgconf` tras validar ruta, ACL, marca y PID.
El contenedor siguió saludable, sin reinicio ni señal de caída en el intervalo.
La causa de la salida de R3 sigue indeterminada. El recorrido completo se verificó
después en R4, con la evidencia y los límites de la sección siguiente.

## Evidencia R4 recuperada el 09/11

Otra sesión ejecutó R4 en seis destinos distintos. Su archivo de resultado
registra 24 de 24 etapas verificadas, cierre propio confirmado y ausencia de errores.
El coordinador cotejó las 79 rutas del sello y el cierre de procesos y puertos.
El resultado conserva SHA256
`634a38732b82d007ba3385e07250b35e9165a921213633cda217cbb1196995d2`.
La revisión original fue escrita por la sesión autora. Plato emitió después una
confirmación independiente de la cadena y de las 24 etapas: siete altas conservadas
tras la reversa y la reaplicación y otras copias conservadas. Informe independiente
SHA256 `7393cae9b7cdbb4f90fe2daf0a1b68f2178ba81873edf82d131b02766dcf2903`,
en `correcciones-20261104/revision-operador/revision-operacion-r4-plato-20261109.json`
bajo el scratch de M10. La existencia del resultado
no acredita custodia recuperable de los cifrados: el auxiliar R4 genera una frase
aleatoria en memoria. En ese corte aún quedaba actualizar la demo.

La nueva carga independiente de R4 aprobó con actor `plato`, sin efectos operacionales.
Las fuentes de los 399 archivos del freeze público siguen coincidiendo. La suite
sobre la carpeta R4 ya ejecutada registró 119 aprobadas y dos fallos de fixture:
ambos casos esperan una carpeta sin operación previa, pero R4 conserva su diario.
La copia diagnóstica separada permite comprobar ese estado inicial y las mejoras
de desconexión sin cambiar las evidencias del ensayo terminado.
La baseline de esa copia pasó 121/121 tras aislar la consulta al estado inicial.
Los dos fallos del control sobre R4 se conservan como resultado histórico de ese
fixture y no se reclasifican retroactivamente.

La mejora del transporte y del lanzador en la copia diagnóstica pasó 143/143
pruebas del autor, incluidos los 121 casos conservados. El verificador independiente
ejecutó los 22 casos nuevos con salida cero, comprobó fuentes sin divergencias y
censo de cero procesos propios. El listener se conserva desde `connect` hasta
`end`, y el registro del hijo guarda metadatos y drena sus salidas. Estas pruebas
no determinan la causa de la caída histórica de R3.

El [protocolo propuesto](protocolo-operacional-propuesto.md) delimita seis bancos
sintéticos nuevos, su conservación y la recuperación coordinada22→21→22 solo en copia22.
En ese corte, la demo `curichi_multitematica` seguía en esquema 21.

## Publicación

El siguiente paso tras las comprobaciones locales es publicar el PR solicitado
desde `codex/cuatro-categorias`. La apertura de producción sigue su propio plan.

La guía [ARRANCAR.md](../../../ARRANCAR.md) distingue demo y arranque habitual.
El cierre humano de Fase1, la VPS, el dominio del panel, DNS/TLS, licencias/parámetros
municipales y privacidad operativa siguen sus puertas propias. La web prevista es
`micurichi.lat`; el usuario pidió preparar la publicación para después, sin desplegar ahora.

El corte del 11/11 verificó 20/20 pruebas del adaptador, 36/36 de guardas, 6/6 de
PowerShell y 4/4 de FD 3 con datos sintéticos. El cotejo de compatibilidad 21/22
aprobó y detectó una huella divergente de Next en el negativo. La primera revisión
señaló que se ejecutaba Node antes de validarlo. La segunda confirmó que el
lanzador ahora coteja los hashes de runtime y Node antes del primer proceso.
El permiso de ejemplo se rechazó sin pedir claves. Las capturas y el sello están
en el [protocolo operacional](protocolo-operacional-propuesto.md).

La actualización real autorizada concluyó el 11/11 a las 21:29 de La Paz.
El resultado SHA256 `9eab9698b3850d2609c13e1c3699360b929adb8ec4fd6d3b7b83ae357aee0977`
confirma cierre propio y siete checkpoints. Se restauró y cotejó el respaldo
en `curichi_sdd_m10c_demo_20261109_copia21`, OID 299682. La demo quedó con
esquema y release 22 tras el control de equivalencia y permisos. El respaldo
cifrado se conserva con SHA256
`1d1213f60c06c8b0b1e1f49c5aa71bc2f8c275cb3610174a440436d16f30055e`.

La corrida `m10-demo-20261111` pasó siete pruebas en escritorio y siete en móvil.
Playwright salió 0 sin omisiones, fallos ni casos inestables. Su JSON tiene SHA256
`00f28123b239011f51e371942b93ec0394b8af2622aa400024ee64b0610f90f6`.
Se usaron dos zonas libres porque las históricas conservaban sus ocho reportes.
La parametrización conserva los 14 casos, sus aserciones y los valores por
defecto. Las zonas alternativas sólo se admiten en la demo separada.

El primer arranque terminó con cierre propio confirmado. Tras el segundo
arranque respondieron los cuatro servicios en 127.0.0.2. Se recuperaron por HTTP
los ocho reportes de la corrida y los bytes de sus cuatro fotos. Los archivos
`publicacion/demo22-reinicio-{antes,despues}.json` del scratch de M10 tienen
el mismo SHA256 `8616b4b41238a762e71177a2acc3facc201a19f474258f6f52da78de1abc150b`.
Las dos ventanas terminaron con cierre propio confirmado. Tras cerrar la
segunda se comprobaron libres los cuatro puertos. La demo queda preparada
para abrirla desde la guía de arranque.
La confirmación independiente final cotejó los E2E, las huellas y los dos
cierres. Sus referencias están en la [revisión](revision.md).
