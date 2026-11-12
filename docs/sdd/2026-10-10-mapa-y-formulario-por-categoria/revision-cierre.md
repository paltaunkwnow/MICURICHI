# Revisión independiente de cierre M4

Fecha: 2026-10-14. Rol: revisor SDD, modelo heredado disponible en Codex. **Revisión inicial: cierre no conforme todavía.** Hay un bloqueante de equivalencia de pruebas y hallazgos importantes de implementación. No se ha demostrado una regresión mediante ejecución en esta revisión.

## Estado y alcance de la evidencia

- Código examinado: **`09930a381c41d918d263c2b11a573f838835dcc0`**, leído con `git show`, en la rama de continuación `codex/cierre-m4`. Todas las líneas de código citadas abajo pertenecen a ese commit, aunque el archivo del árbol de trabajo cambie después.
- Base de comparación: **`refs/sdd/mapa-y-formulario-por-categoria = 48b1e408ea57ef924e94625f1d720bb98c6ae6cf`**. El respaldo `09930a3` contiene la implementación M4; no es la línea base anterior a M4.
- Se leyeron AGENTS.md completo, VentanaContexto.md, la skill SDD, las instrucciones del revisor, plan, línea base, implementación, auditoría recuperada, archivos.txt y el inventario inicial; se contrastaron código, pruebas y ADR relevantes. La continuación del plan permite evaluar las correcciones de web sin activar categorías nuevas.
- **No se ejecutaron pruebas, builds, E2E, servicios ni operaciones Docker/DB. No se leyeron credenciales.** Las únicas escrituras de este revisor son este documento. No hay commits ni push.
- Los resultados 303/625 y los preflight comunicados por el principal/implementador son antecedentes atribuidos a sus ejecuciones. No son resultados propios de esta revisión ni sustituyen la verificación posterior del árbol corregido.
- La revisión inicial se fija a `09930a3` porque hay un escritor independiente preparando correcciones en web. Ningún hallazgo se considera resuelto por una descripción de cambios: requiere un nuevo diff, estado identificable y revisión posterior.

### Snapshot incompleto: cómo se evitó atribuir M0–M3b a M4

Se compararon los SHA-256 de los **19 archivos de código entonces sin seguimiento** registrados en `arbol-inicial.txt:266–284` contra los bytes de sus blobs en `09930a3`:

- **16 coinciden exactamente**: esquema, resolver y slugs de categorías; pruebas de contracts 0.19/0.20; siete archivos de DB/migraciones/reversas/pruebas; cuatro de servicios. Los `A` que Git muestra para esos archivos no son altas de M4.
- **Tres difieren y están declarados en archivos.txt:** `packages/contracts/src/categorias/{index.ts,tipos.ts,inundacion/definicion.ts}`. Su contenido actual se inspeccionó para CA1. Como sus contenidos anteriores no están en la ref, el hash inicial solo acredita que cambiaron; no permite recuperar ni certificar por sí solo cada línea del cambio. No se presenta su alta aparente como un diff histórico completo.
- Formulario, borrador y sus pruebas **sí existen en la ref**: su comparación es directa, sin reconstrucción por conteos.
- El OpenAPI guardado en ambas revisiones tiene SHA-256 **`aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac`**. Esto demuestra igualdad de los archivos guardados, no una regeneración actual.
- En panel, servicios, DB, infra y scripts, el diff examinado solo presenta las altas antiguas de DB/servicios cuyos hashes coinciden. No se atribuyen al trabajador M4.

## Hallazgos ordenados por severidad

### H1 — BLOQUEANTE de cobertura: se debilitó la aceptación del envío aproximado

**Archivo:** `apps/web-ciudadano/src/lib/formulario-reporte.test.ts:525–535`. **Criterio:** CA5, regla del plan de conservar las pruebas sin debilitarlas.

En la base, el caso «el envío manda ubicacion_aproximada: true y pasa el contrato» comprueba `ReporteCrearSchema.safeParse(cuerpo)`: incluye núcleo y dominio de inundación. En `09930a3`, comprueba `ReporteCrearCategoriaSchema.safeParse(cuerpo)`. Este último define `detalle` como `z.record(z.string(), z.unknown())` (`packages/contracts/src/esquemas/reporte.ts:201`), por lo que un `detalle: {}` también satisface esa parte del esquema. Una pérdida de profundidad/frecuencia específica del camino aproximado ya no sería detectada por esta aserción.

El caso de equivalencia de `formulario-reporte.test.ts:377–418` ayuda, pero envía `ubicacion_aproximada: false`; no recupera la garantía del caso aproximado. La aceptación de `:349–353` también comprueba ahora solo el sobre, aunque el caso sin fotos de `:298–305` sí añade `DetalleInundacionSchema`.

**Corrección estrictamente M4:** validar los cuerpos de esos casos con `normalizarReporteCrear` y exigir `resultado.exito`, o sumar la validación explícita del detalle conservando la del núcleo. Mantener las comprobaciones de posición congelada, antigüedad y bandera aproximada. Cubrir detalle inválido en el camino aproximado con una prueba que no pueda pasar validando solo el sobre. No cambiar el esquema HTTP para acomodar las pruebas.

**Límite:** no afirmo que el código actual envíe un detalle vacío; el defecto demostrado por lectura es la pérdida de una garantía anterior. Es bloqueante de equivalencia, no una suite roja medida.

### H2 — IMPORTANTE: las etiquetas pueden volver a una categoría anterior por una respuesta tardía

**Archivo:** `apps/web-ciudadano/src/componentes/Mapa.tsx:1265–1284`, reinicio en `:1297–1307` y efecto en `:832–838`. **Criterio:** CA4, ausencia de contaminación al cambiar categoría.

`fusionarConteosEnLaCapa` captura las tablas de una categoría, espera `fetch`/`json` y finalmente llama a `fuente.setData`. Después de la espera solo comprueba `urlDeFuente(fuente) === c.url`. La URL identifica la geometría municipal, compartida por las categorías, no la serie de conteos. El reinicio borra `feature-state` y `yaFusionadas`, pero no invalida las operaciones pendientes.

Secuencia posible por lectura: empieza una fusión de A; se elige B y se limpia la capa; se escriben etiquetas de B; termina la fusión pendiente de A y repone sus números. También una limpieza vacía pendiente puede terminar después de la escritura de B. Las claves de React Query no protegen estas escrituras directas de MapLibre.

**Corrección estrictamente M4:** asociar la fusión a una generación vigente por mapa/fuente, invalidada al cambiar categoría o fuente, y comprobarla antes de `setData`. No alcanza con agregar el slug a la clave de deduplicación. Cubrir con promesas controladas que terminan en orden inverso, para A→B y limpieza→datos de B; conservar geometría, centro y zoom. El helper de limpieza probado en `conteos-mapa.test.ts` no ejercita esta carrera.

**Límite:** riesgo inferido del flujo asíncrono, no reproducido en navegador. Se puede corregir y probar con datos sintéticos en M4; solo el recorrido E2E entre categorías reales está diferido a M6.

### H3 — IMPORTANTE: el registro ignora el identificador de componente especial

**Archivo:** `apps/web-ciudadano/src/componentes/formulario-categorias/registro.ts:12–22`. **Criterio:** CA5 y regla 7 del plan.

`adaptadores[definicion.slug]` decide el adaptador y nunca consulta `definicion.componenteEspecialPaso2`. Una definición con un identificador especial registrado y otro slug acaba en el genérico; quitar el identificador de inundación no cambia su selección. La prueba `adaptadores.test.ts:57–62` consolida la selección por slug, sin probar el contrato declarado en `tipos.ts:145–148` de contracts.

**Corrección estrictamente M4:** resolver por el identificador de la definición, usar el genérico cuando está ausente y tratar un identificador no registrado de forma explícita, sin fingir un formulario compatible. Probar identificador reconocido, ausente y desconocido. Al reutilizar un adaptador, conservar el slug y la definición efectivos para envío y severidad; no basta con devolver un objeto que siempre mande `inundacion`.

No se necesita definir Baches ni modificar contracts. El usuario informó que el implementador trabaja en este punto; **pendiente de revisar su diff**.

### H4 — IMPORTANTE: el genérico omite subtipos y ubicación por defecto

**Archivo:** `apps/web-ciudadano/src/componentes/formulario-categorias/generico.tsx:194–215`; `src/lib/formulario-reporte.ts:125–163` y `:62–65`. **Criterio:** CA5, formulario conducido por la definición; continuación aprobada del plan.

El genérico solo inicializa `detalle: {}`, valida preguntas y construye filas de esas preguntas. No ofrece ni transporta `def.subtipos`, aunque `armarEnvio` admite `adaptador.subtipo`. Tampoco usa `def.ubicacionTipoPorDefecto`: el núcleo siempre comienza con `via_publica`. Con una definición que prescribe otra ubicación, el dato inicial enviado puede ser incorrecto si la persona no lo cambia; si corresponde degradar la precisión por el tipo de lugar, no debe ignorarse ese valor por defecto.

**Corrección estrictamente M4:** consumir los campos existentes: selector de subtipo cuando hay opciones, conservación/restauración y envío en el primer nivel, filas/errores correspondientes, y ubicación inicial desde la definición. Al cambiar categoría, conservar el tipo elegido explícitamente por la persona; distinguirlo del valor inicial anterior para poder adoptar el nuevo defecto cuando corresponde. Probar con una definición sintética coherente, sin activar categorías ni inventar subtipos municipales.

**Límite:** inundación actual no tiene subtipos y usa `via_publica`; no se atribuye a este hueco una regresión observada en la categoría activa. Los subtipos reales y sus reglas de negocio pertenecen a M6–M8.

### H5 — IMPORTANTE: la categoría sintética no permite verificar un envío declarativo válido

**Archivo:** `apps/web-ciudadano/src/lib/categoria-de-prueba.ts:20–62`; `componentes/formulario-categorias/adaptadores.test.ts:164–170,210–227`. **Criterio:** CA5, prueba del renderizador con definición sintética.

La definición de prueba hereda `esquemaDetalle` y severidad de inundación, pero pregunta `tamano`, `hay_riesgo` y `afecta_a`. La prueba de previsualización rellena profundidad/frecuencia que esa interfaz no pregunta y reconoce que el detalle de bache se rechaza. La prueba llamada «el cuerpo que se envía» solo llama a `aDetalle`; no atraviesa `crearResolverFormulario` ni `armarEnvio`. Se puede tener esa batería favorable y un formulario declarativo imposible de enviar.

**Corrección estrictamente M4:** una fixture de pruebas con preguntas, esquema y cálculo de severidad compatibles. Verificar respuestas → resolver → cuerpo con categoría/detalle/subtipo → borrador/restauración/revisión; incluir rechazo y localización de errores. Mantener la fixture fuera del grafo de producción. No es la categoría real Baches de M6.

### H6 — IMPORTANTE: el texto de cupo afirma un límite que el cliente no conoce

**Archivo:** `apps/web-ciudadano/src/lib/cupo.ts:38–44`, `componentes/FormularioReporte.tsx:979`, `componentes/CupoAgotado.tsx:26–29`. **Criterio:** CA5, cupos por categoría; ADR 0017.

Los restantes y la demora se obtienen correctamente de `cupos[categoria]`, con el respaldo aprobado. Sin embargo, `textoCupo` y `TEXTO_CUPO_AGOTADO` siguen afirmando el límite global de CONFIG. Un límite efectivo distinto puede producir «Te quedan 5 de 3» o «Ya enviaste los 3» sin fundamento. Usar solamente `def.cupo.limite` tampoco resuelve un override por instalación: `services/api-core/src/categorias.ts:126` documenta esa sustitución, y la respuesta actual no entrega `limite`.

**Corrección estrictamente M4 recomendada:** mensajes de UI sin denominador ni cantidad total supuesta, basados en `restantes` («Te quedan N reportes hoy») y en agotamiento de la categoría. Las fotos siguen teniendo cupo global; no convertirlo a cupo por categoría. No modificar servidor/contrato para arreglar una frase.

**Compatibilidad que debe resolverse antes de cierre:** la regla original de M4 exigía textos idénticos con una activa. Esta corrección deliberada cambia esa invariante textual; documentarla como corrección de la continuación, preservando contador, bloqueo y permisos. Hay expectativas exactas en `src/lib/cupo.test.ts:68–71,100–104`, `e2e/tests/ayudas.ts:274–280`, `cuenta-ciudadana.spec.ts:101` y `formulario-reporte.spec.ts:323,350,365,381–382,403,425`.

**No reemplazar globalmente la constante E2E de agotamiento:** `cuenta-ciudadana.spec.ts:135` la compara contra el mensaje de la API, que no se modifica. Separar expectativa de UI y expectativa HTTP; actualizar solo los literales de UI y mantener comprobaciones exactas de N, rechazo y ausencia de permisos con cupo agotado. No ampliar a regex permisivas ni cambiar producción para cumplir un texto obsoleto. Estos E2E adicionales no estaban entre los dos ajustes D2 originales: el coordinador debe registrar su alcance para esta corrección antes del cierre. Este revisor no los edita.

### H7 — IMPORTANTE: no está acreditado el anuncio de URL inválida con una sola activa

**Archivo:** `apps/web-ciudadano/src/componentes/VistaMapa.tsx:762–767`, `FormularioReporte.tsx:968–974`. **Criterio:** CA3 y anuncio accesible de CA4/CA5.

El mapa con una activa y el formulario montan la región viva cuando el mensaje ya tiene texto. No hay una región previa cuyo contenido cambie en ese caso. La propia implementación identifica el riesgo de que no se anuncie. `VistaMapa.test.ts:44–48` exige que no exista al inicio; la prueba de presencia de región de `:96–99` solo cubre dos activas y render estático. Nada de eso demuestra el anuncio tras hidratación.

**Corrección estrictamente M4:** usar una región viva estable, vacía antes de la actualización, o reutilizar una región existente sin perder sus anuncios. Si se añade un nodo invisible estable, documentar la excepción al DOM idéntico y conservar la presentación visual. Añadir prueba de actualización sobre el mismo nodo; dejar como no verificado el comportamiento de lector de pantalla hasta una comprobación real del verificador.

**Límite:** no se afirma que todos los lectores fallen ni que exista una falla de accesibilidad reproducida. El defecto de cierre es garantizar un anuncio sin evidencia que cubra este ciclo.

### H8 — MENOR: formato 3 conserva valores planos de inundación

**Archivo:** `apps/web-ciudadano/src/lib/borrador.ts:48–53,206–220,265–280`; `FormularioReporte.tsx:463–472`. **Criterio:** CA5, frase «con categoria y detalle».

El formato 3 guarda la categoría, pero el detalle de inundación sigue plano dentro de `valores`; solo el genérico usa `valores.detalle`. Es una desviación literal de la redacción del criterio, documentada en implementación/README, sin pérdida funcional demostrada: el adaptador reconstruye el detalle al enviar y la lectura conserva compatibilidad.

**Recomendación M4:** hacer explícita en la trazabilidad CA5 esta representación interna compatible, sin afirmar que todo borrador guardado contiene detalle estructurado. Si se exige la forma literal, serializar/deserializar mediante el adaptador conservando formatos antiguos y nombres DOM; no forzar una migración de almacenamiento solo para uniformar nombres. No presento esto como regresión ni propongo un rediseño general del borrador.

## Equivalencia semántica contra 48b1e40

El número de pruebas no es evidencia suficiente. La comparación por escenarios y aserciones da:

| Grupo | Comparación del contenido | Dictamen de lectura |
|---|---|---|
| Formulario: ubicación, cobertura/PIP, precisión, radio, errores de dispositivo | Se conservan entradas y resultados exigidos | Equivalentes en lo leído; no ejecutados |
| Fechas locales, límites, reloj y ubicación del error | La validación de fecha sigue el mismo campo reutilizado de contracts; el bloqueo del paso 2 pasa al adaptador y el componente lo llama | Equivalentes; no confundir prueba de adaptador con recorrido DOM |
| Sumidero, fotos opcionales/en curso y valores iniciales independientes | Las aserciones pasan a `ADAPTADOR_INUNDACION`; se conservan normalización y referencias nuevas | Equivalentes; las fotos del núcleo siguen comprobando independencia |
| Construcción de envío | Se conserva ubicación desde estado, fotos, dispositivo congelado y exclusión de campos derivados; sumidero se comprueba dentro de detalle | Adaptación D2 justificada |
| Aceptación del contrato completo | Sobre genérico no equivale a validar dominio, especialmente en aproximado | **No conforme: H1** |
| Resolver de inundación | Conserva el contrato plano mediante el adaptador, contexto lat/lon y normalización del sumidero | No se detectó pérdida de las aserciones anteriores; el caso de descripción corta ahora tiene el resto válido, lo que aísla mejor el error |
| Borrador: 24 casos previos | Solo dos literales tipados suman `categoria`; las aserciones previas permanecen. Continúan privacidad del dispositivo, caducidad no deslizante, fotos vencidas, fechas y migraciones antiguas | Equivalencia preservada por lectura |
| Borrador: nuevas garantías | Cuatro casos de categoría/formato 2 y comprobación de detalle vacío frente a respuesta | Aditivas; falta un recorrido coherente declarativo, H5 |
| Radio y proveedores | `radio.test.ts` suma adaptador; `radio-configurable`/`ubicacion-pagina` suman proveedor sin cambiar aserciones | Ajustes de firma/contexto justificados |
| E2E D2 autorizadas | `quitar-campos-web` conserva exclusiones y las amplía a detalle; `formulario-sumidero-y-fotos` exige los mismos null dentro de detalle | No debilitadas por el diff; ejecución posterior pendiente |

La prueba de equivalencia nuevo/plano es útil para el caso que construye; no demuestra todas las combinaciones, el camino aproximado ni la interacción React. No se encontraron eliminaciones de escenarios anteriores en formulario/borrador ni nuevas omisiones en esos dos archivos, pero H1 impide declarar equivalencia plena.

## Trazabilidad CA1–CA7

| CA | Implementación y pruebas inspeccionadas | Estado inicial y evidencia que falta |
|---|---|---|
| **CA1** | `contracts/src/categorias/{textos,tipos,index}.ts`, definición de inundación; `test/contrato-0-21.test.ts:32`; versión/CHANGELOG 0.21.0 | Compatible por lectura; OpenAPI guardado idéntico por hash. Sin regeneración ni compilación de consumidores propias. Limitación del snapshot para tres archivos antiguos sin seguimiento registrada arriba |
| **CA2** | `lib/configuracion.ts`, `ciudad-servidor.ts`, `categorias-contexto.tsx:40–57`, layout/proveedores; `configuracion.test.ts` | Implementado por lectura: respaldo, normalización y filtrado contra registro. Las 11 garantías del lector siguen presentes más cuatro casos de categorías; no ejecutados aquí |
| **CA3** | `lib/categoria.ts:72–174`, `categorias-contexto.tsx:95–118`; `categoria.test.ts` | Prioridad, try/catch, alias y D1 presentes. La resolución en efecto mantiene consultas deshabilitadas durante hidratación; no es por sí sola una regresión. Anuncio pendiente H7 |
| **CA4** | `VistaMapa.tsx:119–171,377–419`, `Mapa.tsx`, selector/presentadores; `categoria-mapa.test.ts`, `SelectorCategoria.test.ts`, `VistaMapa.test.ts`, `conteos-mapa.test.ts` | Claves por categoría, reemplazo de puntos, filtros por alcance, selección y textos presentes. Pendientes H2/H7. QueryObserver prueba datos de consultas, no todas las escrituras asíncronas de MapLibre |
| **CA5** | `FormularioReporte.tsx`, `formulario-categorias/`, `formulario-reporte.ts`, `borrador.ts`, cupo/demora/errores; pruebas correspondientes | **No conforme**: H1 y H3–H7; desviación menor H8. Conservación visible de inundación no acreditada mediante E2E posterior |
| **CA6** | Dos E2E D2 modificadas y permitidas; línea base histórica 159 aprobadas + una omitida | La línea base antecede a la implementación. No existe evidencia final propia de G1/G2/G3/G5/recorrido-completo. La spec nueva no se exige porque no fue autorizada; cambio entre categorías reales diferido a M6. El arreglo de textos requiere coordinar las expectativas adicionales señaladas en H6 |
| **CA7** | README web:150 y :395; ADR 0015:20; doc 14:347 | Documentación presente. Debe actualizarse tras las correcciones y reflejar H8/pendientes. AGENTS/CLAUDE no se tocan; su versión antigua ya estaba excluida |

`implementacion.md` resume salidas transmitidas por los implementadores, pero no aporta toda la evidencia detallada de preflight/comparación final. La auditoría recuperada es histórica y de seguridad; no resuelve H1 ni sustituye revisión funcional. En el inventario leído no estaba `verificacion.md` ni `informe.md`; la preparación del verificador no equivale a su cierre. Las filas de ejecución faltantes quedan pendientes, no verdes.

## Correcciones M4 y trabajo futuro

**Orden recomendado dentro de M4:** recuperar la aceptación completa de pruebas (H1); proteger etiquetas ante respuestas tardías (H2); terminar registro y soporte declarativo con fixture coherente (H3–H5); corregir texto de cupo y sus expectativas conservando el contrato API (H6); estabilizar anuncio (H7); actualizar trazabilidad/README y resolver la precisión documental H8. Todo el código propuesto cabe en web; los ajustes adicionales de E2E requieren reparto/alcance documentados por su responsable.

**M6:** definir y activar Baches con campos, subtipos, severidad y demás decisiones de producto; ejecutar cambio real A→B en navegador conforme D3. M7/M8 incorporan sus definiciones y decisiones propias. No diferir a M6 los mecanismos comunes ya exigidos por M4 ni introducir ahora datos de prueba en producción. Panel es M5; compatibilidad plana/vista/cuotas antiguas se retira en M10. Ninguno de esos hitos se implementa en esta revisión.

Para la segunda revisión, identificar archivos modificados y hashes del árbol corregido, contrastar el diff **contra `09930a3`**, conservar esta base de hallazgos y actualizar su resolución con evidencia. La ejecución la entrega el verificador, en serie y dentro de sus permisos; este documento no autoriza tocar DB, Docker ni el alcance de otro agente.

## Identificadores para reproducir la revisión

Blobs Git en `09930a3`:

| Archivo | Blob |
|---|---|
| `src/componentes/Mapa.tsx` | `cb37bf97e2bea77c0e4ffbfb39c9e2629b6f8e9b` |
| `src/componentes/FormularioReporte.tsx` | `2bf213b71942513713948366d60a4d0504a25b28` |
| `src/componentes/formulario-categorias/registro.ts` | `1e5c1b58a84d0f07a172e1b13e3bc6fbd00287e9` |
| `src/componentes/formulario-categorias/generico.tsx` | `b9fb1cdc7b97286bfac0f3504c7064f4bd9575a3` |
| `src/lib/formulario-reporte.test.ts` | `90e54b69afe8818a003a69fa063f8e6a6faad291` |
| `src/lib/borrador.test.ts` | `517c2130e9e7fd86cb829fbd92e47bb0367c7453` |

Las rutas abreviadas de esta tabla parten de `apps/web-ciudadano/`. No se certifican cambios posteriores del escritor. La revisión inicial queda disponible para corregir sin esperar al cierre de su implementación.
