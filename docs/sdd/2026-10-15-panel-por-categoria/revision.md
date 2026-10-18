# M5 — Revisión independiente

**Revisión final conforme: Newton y Feynman para la fuente; Cicero para el delta E2E autorizado.**
Los apartados registran las vueltas históricas; los dictámenes finales y resolución aparecen
al final. Criterios del
[plan aprobado](plan.md) y [ampliación contractual](ampliacion-exportacion.md).

## M5.0 — Dictamen de Euclid

Revisor independiente `01a142a9-0664-7bc2-8bad-496e1331e72c`, solo lectura.
**Conforme, sin hallazgos bloqueantes en fuente, pruebas y artefacto generado.**

- Primera rama técnica intacta; los payloads antes válidos siguen admitidos. La rama
  adicional exige categoría explícita no vacía distinta del literal `inundacion` y
  únicamente amplía los tres enums planos con `null`.
- Los esquemas generales público/técnico, geometría, demás campos técnicos y
  metadatos/totales/truncamiento permanecen iguales.
- Riesgo inicial de indexación por `string` en la prueba corregido; los tipos ejecutados
  por el implementador pasaron. No se eliminaron ni modificaron pruebas anteriores.
- Comparación semántica del YAML con el parser local: de **33 componentes**, solo cambia
  `ExportacionGeoJson`; resto del documento idéntico. `info.version` conserva `1.0.0`,
  que es la versión de la API, mientras el paquete sube a 0.22.0.
- SHA-256 revisado:
  `7b50c9251903450377c29197e4797d9bd97f4d3f3b924659e7b142510da2fa94`.

El revisor no ejecutó suites/builds/tipos duplicados; la evidencia de ejecución es la del
implementador en [implementacion.md](implementacion.md). La conformidad contractual no
certifica todavía integración del panel, conteos, fusión, accesibilidad ni CA10/E2E.

## Pendiente para el dictamen final de M5

Revisar el diff completo P2 contra las copias iniciales, CA1–12 y conservación de aserciones,
más las revisiones de privacidad/seguridad y la comparación final con la línea base.
No presentar esta revisión parcial como cierre de M5.

## Revisión temprana M5.1 — no es una vuelta F4

Euclid revisó configuración, disponibilidad y URL durante la implementación, por lectura.
Dos bordes confirmados se devolvieron a Ampere; **resolución todavía pendiente de entrega**:

1. Con disponibilidad desconocida (`configuracion=null`), no eliminar una categoría solicitada
   de la URL. Debe permanecer sin consultar datos hasta recuperar configuración válida, para
   poder restaurar la selección. Es distinto del cero explícito confirmado por la instalación.
2. La renovación asíncrona del lector servidor podía devolver un estado previo sin aviso al
   cliente; el segundo lector lo consideraba recién leído por otros cinco minutos. Comprobar
   el traspaso SSR→cliente ante renovación fallida y mostrar la limitación junto al último valor
   válido, conservando el comportamiento del lector de ciudad anterior.

Además, una autocorrección que cambie el ámbito efectivo debe reiniciar severidad/página;
normalizar únicamente el alias del mismo ámbito no debe borrar sus filtros.

El resto revisado coincide con Q1 y el plan: intersección ordenada, cero sin actividad
inferida, aliases/forma pública de URL sin bucle evidente y sin acceso a la preferencia del
mapa público. Los 40 archivos de pruebas previos conservaban sus hashes iniciales en esta
lectura. No se ejecutaron pruebas ni se acepta M5.1 por esta revisión parcial.

**Dictamen acotado posterior de Euclid: CONFORME.** Comprobó por lectura que el estado
desconocido ya no canonicaliza la URL, que el lector completo servidor espera la renovación
y propaga su aviso, y que Reportes consume `filtrosDelAmbitoPanel` antes de crear las queries.
La autocorrección reinicia severidad/página; normalizar un alias conserva ambas. No identificó
bloqueantes adicionales de configuración/URL. El focal posterior aprobó esos casos, pero la
suite completa aún tiene dos fallos del arnés CapaAnterior por adaptar; no se acepta M5.1 ni
se extiende este dictamen a las pantallas restantes o a F4.

**Estado posterior verificado:** esos dos fallos del arnés se corrigieron conservando sus
aserciones; M5.1 fue aceptada por el principal con 497/42, tipos y Biome verdes, según
`implementacion.md`. El párrafo anterior conserva el dictamen de su momento y no describe
un bloqueo todavía abierto. M5.2 tiene 518/44 y controles estáticos verdes recuperados del
ejecutor anterior; Newton realiza su revisión independiente. F4 completa permanece pendiente.

## Revisión temprana M5.2 — Newton, 2026-10-16

**Requiere correcciones; no se acepta M5.2 todavía.** Informe íntegro ignorado:
`.turbo/m5-2026-10-15/revision-m5-2-retoma.md`. Revisor
`01a14515-5c61-7021-b8ea-99322b8d5487`, lectura y reproducción breve en memoria con
QueryClient/QueryObserver reales; sin red, bases ni suites duplicadas.

1. Con cero categorías, deshabilitar la query no retira sus datos en caché: bandeja/mapa/KPI
   pueden conservar Inundaciones mientras el selector anuncia ninguna disponible. No se deben
   consumir respuestas sin ámbito efectivo ni vaciar globalmente la caché compartida.
2. Sin parámetro `categoria`, un cambio implícito de disponibilidad de Inundaciones a Baches
   no reinicia severidad/página antes de la primera query. Debe conservar los filtros comunes;
   normalizar únicamente un alias del mismo ámbito debe seguir conservando los específicos.

Ambos se devolvieron a Godel para corrección y prueba de transición. Son hallazgos tempranos
durante implementación, no una vuelta formal de F4. Los 518/44 verdes no cubrían estos bordes.
Newton comprobó que 39 de las 40 pruebas anteriores mantienen hash; la restante solo adapta
el proveedor de CapaAnterior conservando las aserciones. DOM real e ida/vuelta de detalle
siguen pendientes. No se identificó una redirección externa en el helper de retorno.

**Recheck temprano recibido:** `.turbo/revision-m5-2-retoma.md` conserva el original y
confirma el segundo P2 corregido. En el primero ya se retiran filas/puntos/KPI sin vaciar
caché, pero la cabecera y el estado central todavía convierten la indisponibilidad en «0
reportes»/«ningún reporte». Se devolvió ese resto al mismo escritor y se ampliará la prueba
de transición. M5.2 aún no recibe conformidad. No es el dictamen formal final de F4.

**Recheck final acotado: CONFORME.** Newton comprobó la cabecera y el estado central sin
ámbito y las nuevas aserciones: ya no inventan cero ni ausencia de reportes. Ambos P2 y su
resto quedan resueltos; logs del worker 532/47, tipos y Biome verdes, sin duplicar ejecuciones.
El principal acepta M5.2. El anexo fechado conserva los hallazgos y sus correcciones;
esta conformidad no se extiende al dictamen CA1–12 de F4, todavía pendiente.

## Auditoría temprana M5.0–4 — Aquinas

Informe `.turbo/m5-2026-10-15/auditoria-m5-retoma.md`, lectura independiente sin suites ni
conexiones. **A-M5-01, P2 abierto:** el reintento manual de ejecutivo llama a `refetch()`
sin categoría efectiva. `enabled: false` no bloquea ese camino y termina consultando el
resumen implícito de Inundaciones. No se confirmó fuga técnica ni cambio de rol; sí incumple
el aislamiento de consultas. Devuelto a Godel para guarda y prueba de interacción en P2.

Sin otros hallazgos confirmados en el alcance leído de roles, sesión/CSP, transporte,
coordenadas públicas, exportación, ficha, fusión y composición de «Todas». Es un checkpoint
temprano, no el dictamen formal completo. La revisión final espera M5.5 y la corrección.

**Recheck A-M5-01: CONFORME.** Aquinas comprobó guarda, botón deshabilitado y prueba que
invoca el callback sin producir otra petición. El rojo se reprodujo antes del cambio;
focal final 8/8 en dos archivos (`m5-1-m5-5-focal-1792169616733.log`, worker Godel).
Se preservó el hallazgo en el mismo informe ignorado. No hay otros hallazgos confirmados
en ese checkpoint; dictamen completo y pruebas independientes siguen pendientes de F4.

## Revisión integral previa a la entrega final — Newton

Matriz CA1–12 en `.turbo/m5-2026-10-15/revision-final-m5.md`. Dos P2 nuevos devueltos a Godel:

- **R1:** ejecutivo A→B→A restaura la pestaña antigua si no se tocó la severidad en B.
  El estado debe reiniciarse en cada transición efectiva, antes de mostrar una selección vieja.
- **R2:** al cambiar de categoría con puntos cacheados y «Filtrar por el área» apagado, la
  primera entrega consume la guarda de encuadre; una respuesta fresca posterior puede ejecutar
  `fitBounds`. Debe conservar centro/zoom ante ambas entregas, distinguiendo una acción manual
  de una actualización automática. Se requiere prueba con mapa persistente y fitBounds observado.

Los hallazgos anteriores permanecen cerrados. No se confirmó debilitamiento de las 40 pruebas
históricas de panel ni de las 20 de contracts: solo el proveedor añadido a CapaAnterior y casos
nuevos. Se compararon 514 hashes ajenos sin diferencias, omitiendo nueve rutas sensibles/datos
que no se leyeron en ese barrido. Los verdes previos no cubrían R1/R2. M5.5/entrega y dictamen
formal completo pendientes; aún no se han ejecutado las pruebas independientes F4.

## Integración del principal — actualización automática de configuración

Hallazgo concreto CA10 devuelto al escritor y al auditor: el nuevo proveedor de categorías
renueva configuración cada cinco minutos/con visibilidad. El lector completo hacía fetch
sin omitir credenciales ni marcar sondeo. En el navegador del panel enviaría la cookie a
`/configuracion`; el hook global de `services/api-core/src/auth.ts:82` renueva uso de sesión
salvo `x-curichi-sondeo: 1`, también en esa ruta pública. Ese tráfico automático puede impedir
la expiración por inactividad. Conclusión por lectura del flujo, sin conexión ni prueba DB.

Corrección acotada autorizada por CA10 dentro del nuevo lector P2: omitir credenciales de
la configuración pública o marcar su actualización automática, con prueba de opciones de
fetch. No cambiar backend, sesión, permisos ni el lector legado. Pendiente de entrega/recheck;
no atribuir al verde previo una cobertura de este caso.

**Recheck de R1/R2: CONFORME.** Newton verificó estado persistente A→B→A, entrega
caché→respuesta fresca y conservación del encuadre explícito por UV. Delta M5.5/README
revisados sin hallazgos adicionales; focal del worker 11/11 verde. Falta la entrega completa
actual para dictamen formal; los 547/50 anteriores no cubrían estas correcciones.

El lector nuevo ya tiene `credentials: 'omit'`; la suite completa posterior está en curso.
La auditoría de ese ajuste y los controles finales siguen pendientes de entrega, sin pruebas
de DB ni cambio de backend atribuidos al principal.

## Dictamen formal de fuente recibido — Newton

**CONFORME CA1–12 en fuente y evidencia de implementación, sin hallazgos abiertos.**
Emitido el 2026-10-16 a las 13:10:18 de La Paz, en
`.turbo/m5-2026-10-15/revision-final-m5.md`. Contrastó las 150 entradas del inventario P2:
150 hashes iguales, cero faltantes/diferencias. Los 551/52, tipos y Biome actuales pertenecen
al escritor y fueron contrastados, no ejecutados de nuevo por el revisor. A-M5-01/A-M5-02 y
R1/R2 cerrados; el cambio del lector nuevo no amplía el legado.

Este dictamen libera la revisión de código, no el cierre global: builds, DOM/CSP y E2E
siguen siendo responsabilidad del verificador. Aquinas dejó ambos rechecks de auditoría
conformes, pero su dictamen formal se interrumpió por uso; Feynman lo retoma solo sobre
el delta final/inventario, sin reauditar ni ejecutar suites ajenas.

## Dictamen formal final de auditoría — Feynman

**CONFORME de fuente, sin hallazgos abiertos**, en
`.turbo/m5-2026-10-15/auditoria-final-cierre.md`. Confirmó 150/150 hashes congelados,
roles/sesión/CSP intactos y los rechecks A-M5-01/A-M5-02. Comparó las siete rutas que
diferían de las últimas huellas sucesivas de Aquinas, más el delta localizado del inventario;
no las presentó como una nueva auditoría exhaustiva. El lector legado de ciudad permanece
idéntico y el lector completo público omite cookie; la consulta manual mantiene same-origin.

Las dos revisiones formales de fuente están completas. El timeout del grafo no es PASS y
las validaciones de runtime/build/DOM/E2E siguen pendientes de Cicero. Ninguna de estas
conformidades sustituye la comparación final con la línea base ni cierra M5 por sí sola.

## Delta E2E autorizado — revisión independiente de Cicero

La expectativa del enlace del mapa se ajustó según `ampliacion-e2e-mapa.md`, autorizada
por el usuario. Cicero leyó el diff y la evidencia antes/después: **CONFORME**, sustitución
única exacta de lo aprobado y resto del archivo intacto; preflight rojo y focal posterior 1/1,
tipos/Biome verdes. Confirmó de nuevo 150 P2 y seis P3 por hash, sin cambio de producto.
Dictamen: `.turbo/m5-2026-10-15/f4/revision-independiente-patch-enlace.md`.
La repetición independiente posterior pasó G4 **43/43**, sin retries usados; la comparación
consolida 132/132 E2E con nombres/proyecto idénticos a FB. Integridad P2/P3 conservada y
único delta E2E aprobado, limpieza y estado Docker confirmados en `verificacion.md`.
