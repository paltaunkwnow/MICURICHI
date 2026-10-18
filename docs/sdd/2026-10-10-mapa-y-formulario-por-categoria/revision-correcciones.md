# Revisión independiente de las correcciones de cierre M4

Fecha: **2026-10-15**. Parte 5, revisión de calidad y seguridad; única escritura autorizada: este documento.

**Dictamen actualizado con anexo de evidencia: R1/H2 y R2/H3 resueltos por lectura; R3/H7 atendido mediante evidencia DOM externa contrastada.** H1, H4, H5 y H6 conservan su resolución anterior por lectura; H8 queda documentado como representación compatible. El lector de pantalla real sigue no verificado. No se declara el cierre global de M4: el principal debe integrar sus verificaciones y el hallazgo de CSP/Zod en producción continúa pendiente en una corrida separada. No se afirma ninguna ejecución propia de pruebas.

## Alcance y procedencia

- Leídos completos `AGENTS.md`, `VentanaContexto.md`, `plan.md`, `revision-cierre.md` y `correcciones-cierre.md`; contrastados diff, archivos nuevos sin seguimiento, código consumidor, pruebas y ADR aplicables.
- Comparación: árbol de trabajo de `codex/cierre-m4` contra **`09930a381c41d918d263c2b11a573f838835dcc0`**, también HEAD. Es la implementación M4 respaldada, no la línea base anterior a M4.
- Captura de huellas: **2026-10-15T07:53:50-04:00**. Las líneas citadas pertenecen al árbol corregido identificado al final, salvo indicación expresa.
- Se reconoce la excepción explícita del usuario para que el principal corrigiera código tras los límites de los agentes anteriores. Los cambios adicionales de Parte 5 están autorizados. No se exige repetir el reparto interrumpido para revisar este resultado.
- **No ejecuté suites, builds, typechecks, E2E, instalaciones, comandos Docker ni consultas o escrituras DB; tampoco hice commits, activaciones ni cambios de código.** Solo utilicé lecturas, búsquedas, diff/estado Git y huellas de archivos.
- Las ejecuciones descritas por el principal en `correcciones-cierre.md` son evidencia atribuida a ese documento; no son resultados propios ni sustituyen esta revisión. La verificación de consumidores y E2E corresponde al principal durante esta revisión.
- **Vuelta 2 focal, 2026-10-15T08:01:26-04:00:** contraste limitado a los cambios de `Mapa.tsx`, `formulario-categorias/registro.ts` y sus pruebas `Mapa-conteos.test.ts` y `registro.test.ts`. No se repitió la exploración completa ni se ejecutaron pruebas. Las referencias y resoluciones actualizadas de R1/R2 corresponden a esta captura; el resto conserva la revisión anterior. El rojo previo comunicado por el principal es un resultado atribuido, no una ejecución de este revisor.
- **Anexo R3, 2026-10-15T08:21:51-04:00:** lectura del harness, entrada, resultado JSON y log aportados por el principal; contraste de la huella del componente real sin cambios. No es una ronda nueva de revisión de código ni una ejecución propia. Los resultados E2E se atribuyen a `verificacion-ejecucion.md` y a lo comunicado por el principal.

## Contraste focal final de R1 y R2

### R1 / H2 — RESUELTO por lectura: la fuente conservada recibe la serie vigente

**Archivos:** `apps/web-ciudadano/src/componentes/Mapa.tsx:1117–1123,1299–1303`; prueba: `src/componentes/Mapa-conteos.test.ts:28–59`.

El defecto de la primera vuelta era que `aplicarCapas` omitía fusionar los conteos si `apuntarFuenteA` devolvía `'igual'`. La corrección elimina ese condicionamiento: con fuente existente del mismo modo solicita la fusión tanto para URL igual como cambiada. La deduplicación y el token del helper siguen decidiendo qué operación puede escribir. `reiniciarConteos` conserva la invalidación de la serie anterior y la limpieza cuando aún faltan agregados.

La prueba nueva importa **las funciones reales** `aplicarCapas` y `reiniciarConteos`; solo simula MapLibre y la red. Conserva una misma fuente y URL, aplica A con nueve reportes y después B con dos. Sus dos variantes cubren:

1. B disponible en caché: reinicio sin limpieza y escritura final de B sobre la geometría conservada.
2. B posterior al inicio de una limpieza: deja pendiente la respuesta de limpieza, aplica B y luego libera esa respuesta antigua. Comprueba que la etiqueta y `properties.n` finales sigan siendo los de B.

La espera inicial por `setData` también detecta el defecto original de la fuente existente. Esta cobertura ya atraviesa el llamador que faltaba en la primera vuelta; no se limita a probar directamente el helper. Exportar las dos funciones no incorpora fixtures ni ejecuciones de prueba al componente productivo. **R1 queda cerrado por lectura de implementación y aserciones**, sin afirmar que este revisor ejecutó o vio pasar la prueba ni el recorrido de navegador entre categorías reales.

### R2 / H3 — RESUELTO por lectura: reutilizar valida además el detalle efectivo

**Archivo:** `apps/web-ciudadano/src/componentes/formulario-categorias/registro.ts:28–56`; prueba: `formulario-categorias/registro.test.ts:14–53`.

La rama de slug distinto conserva la validación original del adaptador y le agrega un `superRefine` que construye el detalle con `aDetalle` y lo valida con `definicion.esquemaDetalle`. Así, la restricción efectiva participa en el resolver de envío, además de la previsualización. No sustituye ni debilita las comprobaciones originales.

Los errores cuyo primer campo tiene entrada propia en `adaptador.pasoDeCampo` vuelven a ese campo plano; los restantes se sitúan bajo `detalle`. La rama agrega `detalle: 2` al mapa de pasos para localizar estos últimos. Mantiene el slug, el tipo de lugar inicial y el cálculo de severidad de la definición efectiva.

La prueba nueva entra expresamente en esta rama: una definición sintética `bache` reutiliza el componente especial de inundación, restringe frecuencia a `permanente` y define una severidad `critica`. Atraviesa `crearResolverFormulario`, exige error en `frecuencia` para `ocasional`, acepta `permanente`, construye el cuerpo con `armarEnvio`, comprueba el slug `bache`, valida el detalle resultante y exige la banda efectiva. La definición vive en el archivo de prueba y no activa categorías.

**R2 queda cerrado por lectura de implementación y aserciones.** La rama alternativa de error bajo `detalle` está inspeccionada en el código; no se le atribuye una prueba específica que el caso añadido no contiene. Se mantiene la validación del servidor. No se detectó un nuevo bloqueante en este contraste y no se ejecutó la prueba.

## Resolución de evidencia de R3

### R3 / H7 — ATENDIDO mediante evidencia DOM externa; lector real no verificado

**Archivo:** `apps/web-ciudadano/src/componentes/AnuncioCategoria.test.ts:6–14`. Implementación: `AnuncioCategoria.tsx:6–23`; usos: `VistaMapa.tsx:763`, `FormularioReporte.tsx:984`.

La primera vuelta dejó pendiente una comprobación que `renderToStaticMarkup` no podía aportar: identidad y actualización del nodo con efectos React ejecutados. El principal entregó ahora un harness Chromium con el componente real y ReactDOM instalado. El script, sus aserciones y los dos resultados guardados son coherentes con el ciclo requerido; el detalle y las huellas constan en el anexo final.

**R3 queda atendido en su alcance DOM**, por contraste de evidencia externa, sin modificar el componente. La situación «sesión ya resuelta» se modela desmontando y remontando el componente con un mensaje previo: no es una prueba adicional del login completo. El comportamiento con lector de pantalla real sigue **no verificado**; un PASS DOM no demuestra el anuncio audible.

## Resolución H1–H8 por lectura

Las rutas de esta tabla parten de `apps/web-ciudadano/`, salvo indicación.

| Hallazgo inicial | Resolución y evidencia concreta |
|---|---|
| **H1 — cobertura del envío** | **Resuelto por lectura.** `src/lib/formulario-reporte.test.ts:349–354,526–540` comprueba tanto el sobre como `DetalleInundacionSchema` sobre el detalle realmente construido. Conserva identidad del dispositivo congelado en el caso normal y bandera, precisión y antigüedad en el aproximado; el esquema rechaza detalle vacío. El diff añade aserciones sin quitar las anteriores. No se confunde `normalizarReporteCrear` con validación del dominio. |
| **H2 — etiquetas tardías** | **Resuelto por lectura en vuelta 2, R1.** Se conserva el token por mapa/fuente y la comprobación de instancia/URL. `Mapa.tsx:1117–1123` entrega al helper la serie vigente también con geometría idéntica; `Mapa-conteos.test.ts:28–59` recorre las funciones reales y comprueba el resultado B con caché y con limpieza tardía. Sin ejecución propia. |
| **H3 — registro especial** | **Resuelto por lectura en vuelta 2, R2.** La resolución por identificador y la protección de propiedades propias se mantienen. `registro.ts:33–56` añade validación del detalle efectivo al esquema del adaptador, localiza errores y conserva slug/severidad efectivos. `registro.test.ts:14–53` cubre rechazo y aceptación mediante resolver y cuerpo al reutilizar con otro slug. Sin ejecución propia. |
| **H4 — subtipo y lugar inicial** | **Resuelto por lectura para el genérico.** `generico.tsx:168–188,219–263` ofrece opciones, valida pertenencia, localiza el error en paso 2, produce revisión y transporta subtipo. `FormularioReporte.tsx:345–353,441–443,483–491,527–539,1512` usa el defecto de la definición y registra elección explícita; el cambio conserva esa elección, y un borrador conserva su valor. `generico.test.ts:35–100` cubre cuerpo/restauración y la función de cambio con y sin elección. No es una prueba de interacción React. |
| **H5 — fixture coherente** | **Resuelto en el alcance de pruebas de lógica.** `src/lib/categoria-de-prueba.ts:28–41` define esquema y severidad para las respuestas declarativas. `generico.test.ts:35–89` atraviesa resolver, cuerpo, validación del sobre y dominio, revisión de subtipo y almacenamiento/restauración, además de errores. `adaptadores.test.ts:149–227` cubre render estático, filas de respuestas y previsualización. El nombre «extremo a extremo» de la prueba no equivale a E2E de navegador. |
| **H6 — total supuesto de cupo** | **Resuelto por lectura.** `src/lib/cupo.ts:29–45` mantiene restantes por categoría y muestra solo N; el respaldo de agotamiento no inventa total. `ComoFunciona.tsx:304` y `PanelCuenta.tsx:112` dejan de afirmar el máximo fijo. `e2e/tests/ayudas.ts:274–282` separa texto UI y texto API; `cuenta-ciudadana.spec.ts:119–153` conserva creaciones, cuarta rechazada, mensaje HTTP exacto, Retry-After y ausencia de escritura adicional. Las pruebas de bloqueo de permisos no fueron debilitadas por este diff. |
| **H7 — región viva** | **Atendido mediante evidencia DOM externa, R3.** El principal aporta PASS sobre el componente real: mismo nodo vacío → aviso → cambio → limpieza y dos montajes inicialmente vacíos, incluido el remonte con aviso previo. Harness y resultados contrastados en el anexo. La prueba SSR sigue siendo limitada; no se le atribuye esta cobertura ni se afirma verificación con lector real. |
| **H8 — borrador plano** | **Desviación documental explicitada, sin migración nueva.** `src/lib/borrador.ts:53–55,204–220,264–281` permanece idéntico a `09930a3`: formato 3 incluye categoría; inundación conserva valores planos y el genérico usa `valores.detalle`. README `:398–404` describe la diferencia. Esta tabla deja explícita la excepción literal de CA5; no afirma que todo borrador tenga detalle anidado. |

## Seguridad y privacidad de las correcciones

**No identifiqué una vulnerabilidad nueva adicional por lectura en este diff.** Esto no certifica seguridad de despliegue ni reemplaza pruebas.

El hallazgo posterior de CSP/Zod en producción comunicado por el principal se registra en el anexo y permanece pendiente; el dictamen de lectura anterior no lo declara resuelto.

- **WeakMap/token:** separa mapas y fuentes; conserva una sola entrada vigente por id, sin historial global de series. Una operación vieja que falla no elimina el token de otra nueva; un fallo vigente permite reintentar la misma clave. La clave serializa URL y tablas completas de conteos, evitando colisiones por sumar únicamente totales. No agrega persistencia, identidad del autor ni coordenadas del dispositivo. En vuelta 2 el llamador ya entrega la fusión vigente con URL idéntica, sin ampliar los datos enviados.
- **Registro:** los identificadores vienen de definiciones compiladas; no se introduce evaluación dinámica, carga de módulos por URL ni HTML sin escapar. El chequeo de propiedad propia evita selección por prototipo. Un identificador desconocido falla cerrado. Vuelta 2 suma validación cliente del detalle efectivo y mantiene la protección del servidor; los nuevos errores son mensajes de validación, sin persistencia ni logs nuevos.
- **Ubicación y borrador:** el defecto de tipo de lugar procede de la definición y la elección explícita se conserva; esto respeta la selección que determina degradación pública para vivienda/predio. Los cambios no solicitan permisos, no agregan un almacén para el dispositivo y no modifican los controles de jitter del servidor. `borrador.ts` conserva exclusión de `dispositivo`, plazo y almacenamiento de sesión.
- **Subtipo y anuncios:** se renderizan como texto/opciones React y pasan por el resolver; no aparecen nuevos sumideros de HTML, logs o envíos a terceros. La nueva región solo expone mensajes de categoría. No se cambia autenticación, cookies, autorización ni publicación.
- **Fixture fuera de producción:** las referencias de `categoria-de-prueba` encontradas en `src/` pertenecen exclusivamente a `*.test.ts`; no se importa desde un componente productivo ni desde un índice del registro real. `packages/contracts/src/`, servicios, DB e infra no tienen cambios contra la referencia. No hay activación nueva en el diff. Es inspección del grafo de importaciones, no inspección de un bundle construido.
- **Runner autorizado:** el único cambio de `e2e/scripts/correr-local.mjs:443` es `-d postgres` en la consulta de existencia. Sigue siendo `SELECT` sobre `pg_database`, con argumentos de proceso, sin sustituir los destinos de migraciones/servicios ni agregar comandos destructivos. No ejecuté el runner ni consulté sus credenciales.
- **Expectativas E2E:** solo cambian las frases visuales y se separa la constante HTTP exacta. No se reemplazan aserciones por regex permisivas ni se cambia el límite de la instalación E2E.

## Condiciones de cierre y límites

R1 y R2 quedan resueltos por el contraste focal de vuelta 2; R3 queda atendido con la evidencia DOM externa contrastada en el anexo. El principal integra sus verificaciones de consumidores y E2E y cubrirá la verificación final de producción tras la corrida separada de CSP/Zod. No se requiere implementar M5 ni activar M6–M8 para estas comprobaciones. El recorrido entre dos categorías reales sigue diferido a M6 según D3. No se inicia otra ronda automática de revisión.

Los CA1–CA3 y las partes de CA4/CA5 fuera de las correcciones conservan la revisión inicial como antecedente; no se declara una nueva ejecución ni una certificación integral de ellos. R1 deja de ser pendiente de CA4, R2 deja de ser pendiente de CA5 y la evidencia DOM de R3 queda aportada. CA6 y consumidores/build/OpenAPI se sustentan en las ejecuciones atribuidas al principal, no en ejecuciones de este revisor. CA7 debe reflejar los pendientes hasta resolverlos. El lector real permanece no verificado y producción CSP/Zod pendiente; no se declara M4 cerrada.

## Huellas del árbol revisado

SHA-256 de la **primera vuelta**, conservados como referencia histórica, incluidos los archivos entonces nuevos sin seguimiento. Las rutas `src/…` parten de `apps/web-ciudadano/`. Las cuatro huellas de vuelta 2 que siguen a esta tabla sustituyen las anteriores para esos archivos; el resto no se reexaminó en esta vuelta focal. Cambios posteriores necesitan contraste adicional.

| Archivo | SHA-256 |
|---|---|
| `src/componentes/Mapa.tsx` | `29952e4dccee36f7f903b41f138a6ec7cebdc74b8939717e644a4a5241eb1535` |
| `src/lib/conteos-mapa.ts` | `57a2603484243ced441a4590a57f6bdb6d6cac58b272191df77411728ea6af0e` |
| `src/lib/conteos-mapa.test.ts` | `45fe2b7153599a7b5d5a17a5cd50dfd1758e4e24aac30899390c033802d48f30` |
| `src/componentes/formulario-categorias/registro.ts` | `ab2b1bb58d7de934b2e9eb10a8f0dfbd7a45020c6b5c187042fc64c0e169fff3` |
| `src/componentes/formulario-categorias/registro.test.ts` | `0f8c6613b63eda48344bf7d60c05e85eb78d7698cb511c7f77e594f44e168ef0` |
| `src/componentes/formulario-categorias/generico.tsx` | `77dfec30394986e05c00557310a264702bdf367cc0a87af02b9ebbffaeb65c4a` |
| `src/componentes/formulario-categorias/generico.test.ts` | `e457dab1c03b04218e9aeb5ec8d4c642364dc656bb180ee0d2dae778e0d8f9a8` |
| `src/componentes/FormularioReporte.tsx` | `264ea2ad63f6ae8cbc931b70369e8e33cc3171501dcc86ccaa1f0efd11b10c91` |
| `src/lib/formulario-reporte.ts` | `9825c9c53a8e9e4362b1704d067342bff01c2d0a559e5935189640b88cec1e26` |
| `src/lib/formulario-reporte.test.ts` | `63e7db1a21dc7d8d916868d48195a6f83a35705f409a31f53a5ed0ec83f97216` |
| `src/lib/categoria-de-prueba.ts` | `f00e77679065d0f03e17afe694a3bed17721138c0df47fc7f42415a904840765` |
| `src/lib/cupo.ts` | `188cf7880823a225fac1590b7d4c1051bae1a798b1d61252fbf2c18a6b4599fc` |
| `src/componentes/AnuncioCategoria.tsx` | `f1fb27cc1fbc73ba549932941f497b974893cf3735441e61dbc38dafafc535af` |
| `src/componentes/AnuncioCategoria.test.ts` | `bfa8a19fb91dc3e42170c13b684ad29180e66ae5c7ac42f96b231f2ee71d8d9e` |
| `src/componentes/VistaMapa.tsx` | `8bc1131e1d5cacfcff3a0a239738c1fdd2b40e4180c784b65f9691141319966a` |
| `README.md` | `7586eeabb03a64492b835aa192d1ed02a0459ba52cc35e27749e6e071395901f` |
| `e2e/scripts/correr-local.mjs` | `61de0102da58a6d4488c0276cffb7f04fec275aebb1eb192b07f655839982473` |
| `e2e/tests/ayudas.ts` | `bfd6321657c80709a6dea54c96a7d70fda56011e546ff7ab7adeed792dbfe3ac` |
| `e2e/tests/cuenta-ciudadana.spec.ts` | `d6ba8dc449d424af87870c2291e8e32f375bc823aa5b6ffac3b416340bb6b8b8` |

### Vuelta 2 — huellas del contraste focal

Captura: **2026-10-15T08:01:26-04:00**. Solo estos cuatro archivos se contrastaron de nuevo para R1/R2.

| Archivo | SHA-256 |
|---|---|
| `src/componentes/Mapa.tsx` | `ac37d2b26ba73990a3e908ae32581c88a58049796a7c71e6c9e42aabaac0cba8` |
| `src/componentes/Mapa-conteos.test.ts` | `34f265ca138a4dfeee00de29a4d4510f36a6dc5493205f97dd7a2ab390f4c412` |
| `src/componentes/formulario-categorias/registro.ts` | `abd0706970d733c9465770228751b91fe3c5dc9aa20bace87bcf3ba9925d97b8` |
| `src/componentes/formulario-categorias/registro.test.ts` | `4cea303cf1709313daf2857e53b5b0083b2dfaabe5c9bea065d73176f7ee6161` |

## Anexo R3 — evidencia DOM externa contrastada

Captura de lectura y huellas: **2026-10-15T08:21:51-04:00**. Ejecución del **principal**, no de este revisor. No se recompiló ni se lanzó Chromium durante este contraste.

**Procedencia y comprobaciones del harness:**

- `.turbo/cierre-m4-2026-10-14/anuncio-entrada.tsx` importa directamente `apps/web-ciudadano/src/componentes/AnuncioCategoria`, además de React, ReactDOM/client y `flushSync` instalados en la web. No copia ni reemplaza la implementación del componente.
- `anuncio-dom.mjs` compila esa entrada para navegador, con modo React de producción, mediante esbuild instalado; usa Playwright con `channel: 'chromium'`. El principal identifica su instalación como Chromium1243; el JSON no incluye una versión del binario y esta revisión no lo ejecutó.
- Antes del render intercepta `Node.prototype.appendChild` y registra el texto de cada región insertada con `data-testid="anuncio-categoria"`. Las aserciones comparan el ElementHandle original con el elemento actual tras aviso, cambio y limpieza, no solo el texto encontrado por un selector.
- Para simular la aparición tras sesión resuelta desmonta la raíz, crea otra y renderiza con un aviso ya disponible. Exige que la nueva región llegue al aviso y que ambas inserciones registradas hayan tenido texto vacío: `['', '']`.
- `anuncio-dom-resultado.json` y `anuncio-dom.log` coinciden: `estado: PASS`, mismo nodo, vacío antes de aviso, cambio/limpieza y montaje con aviso previo; ambos declaran `lectorDePantalla: 'no verificado'`. El PASS se escribe después de las aserciones.
- La huella de `AnuncioCategoria.tsx` coincide con la primera revisión. No hubo una modificación al componente para satisfacer esta comprobación.

**Resolución:** la evidencia aporta la actualización DOM ausente en R3/H7: vacío → aviso → otro aviso → limpieza sobre el mismo nodo y montaje inicialmente vacío con mensaje previo. Se acepta en ese alcance. No acredita lector de pantalla, hidratación de la página completa ni un login completo; esos alcances no se infieren de una prueba aislada del componente.

### Resultados externos y pendiente de producción

Se registran los resultados comunicados por el principal y recogidos en `verificacion-ejecucion.md`, **sin ejecución ni reauditoría de logs E2E por este revisor**:

| Ejecución del principal | Resultado atribuido |
|---|---|
| G1 | 47 aprobadas |
| G2 | 31 aprobadas |
| G3 | 57 estables, 1 aprobada tras retry y 1 omitida |
| G5 en desarrollo | 18 aprobadas |
| Recorrido completo en desarrollo | 5 aprobadas |
| Cámara móvil aislada, sin retry | 2 aprobadas; el fallo intermitente previo no se considera borrado |
| G5 en producción | 13/18, cinco casos con eventos CSP de `eval`; pendiente |

El principal comunica cinco eventos de `eval` de la sonda de Zod core, reproducidos también en el panel inalterado. Esto se registra como **hallazgo externo pendiente**, sin atribuirle resolución ni una reproducción propia. El usuario autorizó exclusivamente los dos `instrumentation-client.ts` con `z.config`/`jitless` en la corrida separada `docs/sdd/2026-10-15-csp-zod/`; su implementador estaba trabajando al aportar esta evidencia. Este anexo no revisa ni aprueba ese cambio ni amplía su alcance. **El principal cubrirá producción final.**

El principal informa además cierre de sus procesos y puertos libres; no se realizó una comprobación de procesos, puertos, DB o Docker desde esta revisión. Los resultados de desarrollo y el PASS DOM no convierten la corrida de producción en aprobada.

### Huellas de la evidencia R3

Artefactos locales ignorados bajo `.turbo/`; conservarlos junto con la evidencia del principal. La última fila identifica el componente real usado.

| Archivo | SHA-256 |
|---|---|
| `.turbo/cierre-m4-2026-10-14/anuncio-dom.mjs` | `b11f211c3ab4c4ac6e948a49a9054eff22de599184933407903724e648f274b0` |
| `.turbo/cierre-m4-2026-10-14/anuncio-entrada.tsx` | `b5d3f03e077b0ebc64528c272e9e3f884c3dd0444e41e580fb0a19042bd6416a` |
| `.turbo/cierre-m4-2026-10-14/anuncio-dom-resultado.json` | `38c2c536b3aeb02209cc0344a46e8e719049170d40185518727d470bf778649c` |
| `.turbo/cierre-m4-2026-10-14/anuncio-dom.log` | `b295a081e38e03a12d6e766a08ddc03ffadda188184bd66d631656b7d4c30350` |
| `apps/web-ciudadano/src/componentes/AnuncioCategoria.tsx` | `f1fb27cc1fbc73ba549932941f497b974893cf3735441e61dbc38dafafc535af` |
