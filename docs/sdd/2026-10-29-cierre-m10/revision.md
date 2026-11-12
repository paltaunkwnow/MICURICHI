# Cierre M10 — revisión independiente parcial

**Adenda del 09/11.** La confirmación posterior de Plato acreditó documentalmente
el recorrido R4 de 24 etapas, con límites registrados en el [informe](informe.md).
La revisión de robustez y sus 22 pruebas independientes fueron conformes. El
adaptador de actualización de la demo se revisa antes de su aprobación operacional.

**Código conforme por lectura; cierre operacional pendiente.** Peirce revisó el delta contra
las preimágenes F0, sin ejecutar producto ni pruebas y sin usar HEAD como estado anterior.
Su revisión y auditoría están en
`.turbo/m10-cierre-2026-10-29/revision-independiente-20261101/`.

**Adenda04/11:** Plato confirmó por lectura los dos casos DB añadidos y el arreglo
integrado de respaldo,0P1/0P2; falta su ejecución independiente. La SQL vuelve al SHA
original03/11. La revisión de cambios privados posteriores de otra sesión encontró
4P1/3P2: se corrigen en un intento nuevo sin adoptar el diario incierto anterior.
Los resultados de abajo son sus cortes fechados, no una aprobación automática de ese
operador nuevo. [Continuación y evidencias](continuacion-20261104.md).

## API y corrección de las cinco inspecciones

La revisión inicial confirmó la escritura de25argumentos, persistencia JSON equivalente
a0020, conservación de RF-01/idempotencia/cupos/auditoría/visibilidad y arranque que exige
22íntegro. El módulo se puede importar sin arrancar servicios ni leer configuración.
La adenda del02/11 confirmó el formato con AST equivalente y las28fuentes quietas respecto
de runtime-final.json, SHA7a8452e19e3b1b9406ba96b8193e51764075e5ed1cf65aa52f6892aaf60890b0.

En las fixtures M6/M7/M8, los alias SQL conservan las seis comprobaciones NULL y se añade
la fila física íntegra: ausencia de columnas retiradas, ausencia de claves de agua y
detalle completo de cada categoría. Permanecen los tres casos de Baches y el recorrido
de los cinco subtipos de Basura/Áreas verdes. Los controles HTTP NULL públicos/técnicos,
severidad, ubicación, aislamiento y auditoría se conservaron. No se eliminaron los cinco
casos que habían fallado.

Resultados ejecutados por otros y cotejados por el revisor: fullAPI612PASS/12SKIP de624;
tipos/build/ROOTBiome exit0. Son evidencias de Lorentz/principal; **el revisor no los ejecutó**.
Carver confirmó después el mismo alcance mediante su suite independiente:612PASS/12SKIP.

## Datos y operadores

La revisión DDL encontró cuatro problemas iniciales y dos posteriores (reversa e attacl).
Raman entregó correcciones, pruebas negativas y fullDB429/429, con tipos/build/formato y
freeze33fuentes/dist80. Esa entrega no es un ensayo PostgreSQL real ni una nueva ejecución
independiente atribuible al revisor.

La adenda del03/11 cerró por lectura los seis hallazgos DDL-01/02/03/04/03-R/05 en las
dos migraciones finales y el verificador de privilegios:0P1/P2 pendientes en ese alcance.
Confirmó PK/igualdad, saneamiento de grants heredados solo en objetos nuevos, CHECK
efectivos, reversa condicionada y ACL de columna. Sus tres SHA coincidieron con la entrega
probada; no se ejecutó PostgreSQL real ni se cambiaron roles/defaults globales. Evidencia:
`revision-independiente-20261101/adenda-ddl-resolucion-20261103.md`.

P5-01 exige distinguir columnas clave e INCLUDE al comparar índices. El retrospectivo final
aprobó1/1 sobre la preimagen21 reconstruida; es posterior a la corrección, no un rojo previo
a programar. Los intentos fallidos de la guarda del artefacto permanecen conservados.
P5-02 exige revalidar checkpoints pertinentes antes de una nueva etapa mutante: los dos
negativos fallaron antes del parche y aprobaron después; el ensayo completo aprobó25/25.
Estos resultados propios fueron confirmados después por las suites independientes de Carver.

La adenda de P5 del02/11 contrastó las15fuentes/copias con su freeze y encontró0P1/P2
nuevos. Confirmó P5-01/02, conservación de casos F0 y los siete cuerpos E2E sin cambios;
la configuración mantiene desktop/móvil, sin haber ejecutado E2E. Siete archivos JS/TS
conservan el AST normalizado del corte post-RED. Otros tres tienen deltas funcionales
leídos y delimitados; no existe su copia completa exacta inmediatamente antes del formato,
por lo que no se afirma equivalencia AST total ni se atribuyen verdes antiguos a SHA nuevos.
Carver terminó las suites propias sobre las fuentes finales. Artefactos de revisión en
`revision-independiente-20261101/adenda-p5-freeze-20261102/`.

El revisor encontró además tres defectos P2 en el operador privado preparado para el
ensayo real: callback de checkpoint que bloquea el recorrido nominal, oráculo que no exige
el incremento de cuota y efectos legítimos del login21 sin modelar. Kant reprodujo12fallos
funcionales y corrigió los drivers privados:21/21mocks originales y32/32casos adicionales,
sin modificar los tests para obtener el verde. Login21 borra los fallos previstos y crea
sesión/auditoría; no inserta intento_login. Peirce cerró los tres arreglos por lectura,
0P1/0P2, en `operador-privado-20261102/adenda-op01-03-20261103.md`. Los positivos
modelan21 y el recorrido nominal llega al siguiente límite mutante inyectado; no prueban
las24fases reales. Dos negativos de sesión preservan la fila anterior, no acreditan por sí
solos los atributos de una sesión nueva. No se ha operado contra instalaciones reales.

## Ampliación del escáner — SCAN01 cerrado

La entrega aprobada del03/11 corrigió las nueve alertas originales y aprobó154casos,
también ejecutados por el verificador independiente. La revisión estática detectó SCAN01P2:
la excepción de lectura calculada admitía un prefijo seguro con un literal sensible añadido
mediante `||`, `??` o `+`. Es un contraejemplo sintético, no un secreto real encontrado.
Los154PASS iniciales no cubrían el defecto. El autor reprodujo tres negativos y acotó
el final de expresión dentro de las mismas tres rutas aprobadas. Peirce confirmó su
resolución por lectura,0P1/0P2, conservando los154casos anteriores. Carver ejecutó después
la suite final independiente:157PASS/0FAIL/0SKIP, más los tres escaneos sin alertas.
Evidencia: `revision-independiente-20261101/adenda-escaneo-20261103/revision.md`.

## Límites

La verificación independiente del código terminó con límites documentados. Continúan
la acreditación del operador y la puerta operacional.
Sin operaciones reales, despliegue, CI remoto ni aprobación de apertura de producción
en esta revisión. Los12SKIP PG/S3 conservan sus nombres y condición de no verificados.

## Cotejo documental del 11/11

Boyle confirmó el resultado de actualización, su preimagen, los siete
checkpoints, el registro de creación de copia, la huella del cifrado y el
cierre del hijo. El informe del scratch tiene SHA256
`b2f716a0eef0de8493584c1af563f1128024d3ce51e997bb3baf0c540444b3c6`.
También cotejó por lectura que la parametrización E2E conserva los 14
casos, las aserciones, los puntos por defecto y la comprobación de ambas
zonas nuevas antes de crear datos. La verificación efectiva con navegador
y el reinicio están en el [informe de cierre](informe.md).

El dictamen final de Boyle cotejó 14/14 E2E, las huellas iguales y el cierre
de ambas ventanas. SHA256 `7f32aee5132421ec1080bfb97459ed78b898bc4530d32ccf5d0cd6b86ef454de`.
El coordinador comprobó en vivo los cuatro HTTP 200 del reinicio y los
cuatro puertos libres tras el cierre.
