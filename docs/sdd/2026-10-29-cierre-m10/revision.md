# Cierre M10 — revisión independiente parcial

**API y P5 conformes por lectura; cierre global pendiente.** Peirce revisó el delta contra
las preimágenes F0, sin ejecutar producto ni pruebas y sin usar HEAD como estado anterior.
Su revisión y auditoría están en
`.turbo/m10-cierre-2026-10-29/revision-independiente-20261101/`.

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
La confirmación independiente mediante suites propias sigue pendiente.

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
Estos resultados son propios del implementador; falta su confirmación independiente.

La adenda de P5 del02/11 contrastó las15fuentes/copias con su freeze y encontró0P1/P2
nuevos. Confirmó P5-01/02, conservación de casos F0 y los siete cuerpos E2E sin cambios;
la configuración mantiene desktop/móvil, sin haber ejecutado E2E. Siete archivos JS/TS
conservan el AST normalizado del corte post-RED. Otros tres tienen deltas funcionales
leídos y delimitados; no existe su copia completa exacta inmediatamente antes del formato,
por lo que no se afirma equivalencia AST total ni se atribuyen verdes antiguos a SHA nuevos.
Carver ejecuta las suites propias sobre las fuentes finales. Artefactos de revisión en
`revision-independiente-20261101/adenda-p5-freeze-20261102/`.

El revisor encontró además tres defectos P2 en el operador privado preparado para el
ensayo real: callback de checkpoint que bloquea el recorrido nominal, oráculo que no exige
el incremento de cuota y efectos legítimos del login21 sin modelar. Se prepararán sus
negativos y correcciones antes de presentar la autorización operacional. No se ha ejecutado
ese operador ni se ha pedido aprobar un protocolo que todavía falla la revisión.

## Ampliación del escáner — SCAN01 pendiente

La entrega aprobada del03/11 corrigió las nueve alertas originales y aprobó154casos,
también ejecutados por el verificador independiente. La revisión estática detectó SCAN01P2:
la excepción de lectura calculada admitía un prefijo seguro con un literal sensible añadido
mediante `||`, `??` o `+`. Es un contraejemplo sintético, no un secreto real encontrado.
Los154PASS no lo cubren ni permiten publicar. El autor reproducirá los negativos y acotará
el final de expresión dentro de las mismas tres rutas aprobadas, antes de otra adenda.
Evidencia: `revision-independiente-20261101/adenda-escaneo-20261103/revision.md`.

## Límites

La ejecución independiente global y el protocolo operacional continúan en curso.
Sin operaciones reales, despliegue, CI remoto ni aprobación de apertura de producción
en esta revisión. Los12SKIP PG/S3 conservan sus nombres y condición de no verificados.
