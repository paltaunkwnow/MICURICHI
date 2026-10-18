# Revisión independiente focal — Zod/CSP y evidencia R3

Fecha de lectura inicial: **2026-10-15, 08:27, America/La_Paz**. Actualizaciones de evidencia externa: **08:30 y 08:32**, mismo día y zona. Parte 5, calidad y seguridad. Única escritura autorizada de este revisor: este archivo. Se leyeron `AGENTS.md`, `plan.md` y `linea-base.md`, los dos hooks, las fuentes instaladas necesarias y las evidencias indicadas. Revisión estática manual (SAST por lectura) y contraste documental de resultados ejecutados por el principal; **sin ejecutar pruebas, builds, DB, navegador, instalaciones ni commits**. `revision-correcciones.md` pertenece a otro autor y no se modifica.

**Dictamen focal final: favorable para la corrección Zod/CSP en ambas apps.** Sin hallazgos bloqueantes por lectura en los dos hooks; la configuración corresponde a Zod 4.6.4 y el orden de carga se sostiene tanto en Next 16.3.6 instalado como en los chunks de producción existentes. Se añade evidencia runtime externa de **G5-jitless: 18/18 aprobadas**, incluidos los cinco casos CSP antes rojos, y **recorrido-jitless: 5/5 aprobadas**, ambos sin flaky ni omitidas, con ejecución de producción y `exit 0` atribuidos al principal. Los artefactos se contrastan al final de este documento; no es una ejecución propia. **R3 queda satisfecho en su alcance estructural DOM; lector real no verificado.** El coordinador comunica finalización de sus procesos, cuatro puertos libres y PostGIS/MinIO sanos. No se declara cerrada M4 ni una puerta de fase.

**Configuración y momento de aplicación.** Ambos `src/instrumentation-client.ts` contienen el mismo `import { z } from 'zod'` y `z.config({ jitless: true })` en el nivel superior, sin diferirlo a un efecto, una función de registro o una importación de componentes/contratos. El comentario adicional explica el motivo y no altera el contenido aprobado. Las dependencias instaladas de ambas apps y `packages/contracts` apuntan al mismo paquete `node_modules/.pnpm/zod@4.6.4/node_modules/zod`.

- `zod/index.js:1` reexporta la API clásica v4; `v4/classic/external.js:7` reexporta `config` desde core. `v4/core/core.js:135–140` mantiene la configuración en `globalThis.__zod_globalConfig` y la actualiza con `Object.assign`.
- `v4/core/util.js:218–235` define la sonda diferida `allowsEval`: devuelve `false` si `globalConfig.jitless` está activo, antes de alcanzar `new F("")`. Capturar la excepción de la sonda no habría evitado el evento CSP; esta configuración evita intentarla.
- `v4/core/schemas.js:1166–1168` captura `jit` al construir el esquema y usa el cortocircuito `jit && allowsEval.value`. Con `jitless: true` no consulta la sonda. En `:1183–1192`, la ruta JIT queda deshabilitada y se conserva `superParse(payload, ctx)`. No se omite la validación.
- El momento temprano es necesario: cambiar la configuración después de construir un esquema no cambia el `jit` que ese esquema ya capturó. Los hooks no importan módulos de la aplicación que creen esquemas antes de configurar Zod. Entre los consumidores revisados, `FormularioAcceso.tsx:36` y `FormularioLogin.tsx:16` construyen sus `z.object` al evaluar sus módulos; no se trasladó esta configuración a esos formularios ni al backend.

**Next reconoce y conecta el hook.** Referencias bajo `apps/web-ciudadano/node_modules/next/`, instalación compartida por ambas apps:

| Fuente instalada | Evidencia por lectura |
|---|---|
| `dist/build/create-compiler-aliases.js:169–185` | En el compilador cliente, `private-next-instrumentation-client-user` busca primero `src/instrumentation-client`, después el archivo raíz y finalmente el módulo vacío. Ambas rutas creadas coinciden. |
| `dist/build/webpack-config.js:1583–1596` y `dist/build/webpack/loaders/next-instrumentation-client-loader.js:11–27` | El stub se reemplaza por un módulo que requiere el hook del usuario. No depende de exportar `register`; la llamada en el nivel superior es la que debe ejecutarse. |
| `dist/lib/require-instrumentation-client.js:11,26` | Requiere sincrónicamente la instrumentación tanto en desarrollo como en la rama restante. No es una integración exclusiva de desarrollo. |
| `dist/client/app-next.js:10–18` | Requiere la instrumentación antes de llamar a `appBootstrap`; `app-index` y `hydrate` se requieren/invocan después, dentro del callback. |
| `dist/client/app-next-turbopack.js:11–15` | Mantiene ese mismo orden en la entrada Turbopack. |

Además de la fuente del framework, se inspeccionaron **sin construirlos ni ejecutarlos** los chunks ya producidos por la ejecución del principal:

- Web: `apps/web-ciudadano/.next/static/chunks/2f75_rt_xy0kr.js`, módulo `51923`.
- Panel: `apps/panel-admin/.next/static/chunks/0ob8-fnzi_lee.js`, módulo `87449`.

Los dos contienen `z.config({jitless:!0})`. Su módulo `48740` resuelve `private-next-instrumentation-client` al módulo correspondiente del hook; la entrada requiere `48740` antes de `appBootstrap` y requiere el módulo de hidratación `71522` dentro de su callback. Por tanto, **no se deduce la integración solo por el nombre del archivo**: el grafo compilado incluye la llamada y el orden esperado antes de evaluar los consumidores de la aplicación durante la hidratación. La presencia en el bundle no demuestra por sí sola que el navegador haya recorrido ese grafo sin violaciones.

**Límites de seguridad y alcance.** Los hooks no modifican cabeceras, nonce, validadores, servicios ni tests. La configuración queda en el entorno cliente que carga esta entrada; no hay un nuevo import desde los procesos de backend. La inspección de `git diff` no mostró cambios respecto de HEAD en `services/`, `packages/`, `infra/`, panel versionado, `pnpm-lock.yaml`, los dos `next.config.ts`, los dos `src/proxy.ts` ni `e2e/tests/csp.spec.ts`. El árbol contiene otros cambios de M4: no se atribuyen a esta corrección ni se certifica el alcance global de ese trabajo.

En los proxies, `script-src` conserva nonce y `strict-dynamic`; `unsafe-eval` se agrega únicamente con `NODE_ENV === 'development'` (`web/proxy.ts:134–145`, `panel/proxy.ts:120–131`). La excepción existente de estilos no se modifica. Los cinco casos CSP siguen recorriendo bandeja, detalle, ejecutivo, mapa y formulario; la vigilancia de `ayudas.ts:1005–1057` conserva los eventos, mensajes y peticiones bloqueadas y exige listas vacías. El diff de ese helper afecta textos de cupo de M4, no las funciones CSP. No se encontraron relajaciones de expectativas CSP en lo contrastado.

**Riesgos y recomendaciones acotadas.**

1. La configuración es global para los validadores Zod de cada entorno de navegador y desactiva su aceleración JIT. Puede reducir rendimiento; no hay medición propia ni evidencia para cuantificarlo. La ruta de validación por intérprete permanece disponible y la verificación funcional corresponde a las suites/E2E del principal ya previstas en el plan.
2. El verde de desarrollo no sustituye la comprobación de producción: allí se permite `unsafe-eval`. Además, `comprobarCspConNonce` comprueba nonce y ausencia de `unsafe-inline`, pero no exige expresamente ausencia de `unsafe-eval`. La actualización se apoya en la corrida de producción comunicada por el principal, los cinco casos aprobados y la fuente de la política intacta, que excluye `unsafe-eval` en producción. Los artefactos aportados no incluyen un volcado de las cabeceras efectivas: no se afirma una captura independiente de ellas por este revisor ni se propone modificar expectativas.
3. G5-jitless resuelve los cinco fallos CSP documentados en la línea base y el recorrido posterior está aprobado en su JSON. Mantener el alcance de dos hooks y estas evidencias; la integración del cierre global corresponde al principal. No se recomienda ampliar archivos, filtrar eventos ni cambiar la política.

**R3 de M4: satisfecho en su alcance estructural DOM, con ejecución atribuida al principal.** Se contrastaron `.turbo/cierre-m4-2026-10-14/anuncio-dom.mjs`, `anuncio-entrada.tsx`, `anuncio-dom-resultado.json` y `anuncio-dom.log` con el componente actual:

- La entrada importa directamente `apps/web-ciudadano/src/componentes/AnuncioCategoria` (`anuncio-entrada.tsx:4`); no reimplementa ni simula su JSX. `FormularioReporte.tsx:984` utiliza ese mismo componente.
- El componente real inicializa el anuncio a `null` y lo actualiza en `useEffect`, manteniendo el `<p role="status" aria-live="polite" aria-atomic="true">` (`AnuncioCategoria.tsx:7–19`).
- El harness obtiene el nodo inicialmente vacío (`anuncio-dom.mjs:26–29`) y compara su identidad mediante el ElementHandle original después del aviso, del cambio y de la limpieza (`:30–38`). Comprueba **vacío → aviso → otro aviso → vacío sobre el mismo nodo**.
- Para modelar la aparición del formulario con sesión ya lista y aviso previo, desmonta y crea una raíz nueva con ese mensaje (`anuncio-entrada.tsx:10–13`). Espera el aviso y exige que las dos inserciones del nodo hayan ocurrido vacías mediante `assert.deepEqual(montajes, ['', ''])` (`anuncio-dom.mjs:39–42`). Esa simulación cubre el requisito estructural del montaje con mensaje previo; no reproduce el login completo.
- El JSON y el log coinciden en `PASS`, identidad del nodo, vacío inicial, cambio/limpieza y remonte con aviso previo. El harness escribe el PASS después de sus aserciones. Esta revisión **leyó el PASS ejecutado por el principal y no lo volvió a ejecutar**.

La evidencia DOM complementa la prueba SSR existente, que solo acredita marcado inicial. **No acredita anuncio audible por un lector de pantalla real, hidratación de la página completa ni login E2E.** El propio JSON declara `lectorDePantalla: 'no verificado'`; se conserva esa limitación.

**Huellas SHA-256 de lo contrastado.**

| Archivo | SHA-256 |
|---|---|
| Cada uno de los dos `src/instrumentation-client.ts` | `2ebbb76b853dafcb436b26c318dfe77835318d22ae6f427c1ab855820d0ed375` |
| Chunk web `2f75_rt_xy0kr.js` | `ca491536730cc9dfcea61d4b70918328aa96adbe70a8103b66f89ab621c51daf` |
| Chunk panel `0ob8-fnzi_lee.js` | `f76ad978c42f104701bd0728afefc834e47d90774bb608589f57f9b468103260` |
| `AnuncioCategoria.tsx` | `f1fb27cc1fbc73ba549932941f497b974893cf3735441e61dbc38dafafc535af` |
| `anuncio-dom.mjs` | `b11f211c3ab4c4ac6e948a49a9054eff22de599184933407903724e648f274b0` |
| `anuncio-entrada.tsx` | `b5d3f03e077b0ebc64528c272e9e3f884c3dd0444e41e580fb0a19042bd6416a` |
| `anuncio-dom-resultado.json` | `38c2c536b3aeb02209cc0344a46e8e719049170d40185518727d470bf778649c` |
| `anuncio-dom.log` | `b295a081e38e03a12d6e766a08ddc03ffadda188184bd66d631656b7d4c30350` |

**Anexo de validación runtime externa — G5-jitless, 2026-10-15.** Esta actualización reemplaza el pendiente de evidencia de producción del dictamen inicial. El principal comunica una ejecución de producción con `exit 0`, tests y política inmutables, 18/18 aprobadas en 81,768 s. Se leyeron directamente los siguientes archivos, sin repetir la corrida:

- `.turbo/cierre-m4-2026-10-14/G5-jitless-resultado.json`.
- `.turbo/cierre-m4-2026-10-14/e2e-G5-jitless.log`.

El JSON registra inicio `2026-10-15T12:28:41.292Z` (08:28:41,292 local), duración `81768.68900000001` ms (aproximadamente 81,7687 s), `expected: 18`, `unexpected: 0`, `flaky: 0`, `skipped: 0` y `errors: []`. Los 18 casos tienen estado `expected` y un único resultado `passed`, con `retry: 0`. El log coincide: un worker, 18 casos y `18 passed (1.4m)`. El carácter de producción y el código de salida cero se atribuyen a lo comunicado por el principal; el log de Playwright y el JSON contrastados no consignan por sí solos esos dos datos.

| Caso CSP existente | Resultado posterior contrastado | Duración del caso |
|---|---|---|
| `csp.spec.ts:90`, bandeja con sondeo | `passed`, primer intento | 3500 ms |
| `csp.spec.ts:90`, detalle con sondeo | `passed`, primer intento | 2950 ms |
| `csp.spec.ts:90`, ejecutivo con sondeo | `passed`, primer intento | 3247 ms |
| `csp.spec.ts:124`, mapa público y worker | `passed`, primer intento | 7137 ms |
| `csp.spec.ts:141`, formulario, cámara, envío y Mis reportes | `passed`, primer intento | 7605 ms |

Estos son los mismos cinco casos documentados como fallidos por CSP/eval en la línea base de producción; el resultado posterior aporta **cinco cambios de rojo a verde y ningún fallo en G5**. Los otros trece casos son los seis de accesibilidad básica y siete de presentación adaptable del grupo. No se extrapola ese verde al resto de la E2E ni a un lector de pantalla real.

En esta actualización se repitió solo la lectura de integridad: las huellas de ambos hooks y de `anuncio-dom-resultado.json` coinciden con la tabla anterior; `git diff --name-only` continúa vacío para los dos proxies, los dos `next.config.ts` y `e2e/tests/csp.spec.ts`. La inspección anterior del diff de `ayudas.ts` ya distinguía los textos de cupo de las expectativas CSP intactas. La inmutabilidad durante la ejecución es asimismo parte de lo comunicado por el principal; no se confunde la lectura posterior con una vigilancia propia de la corrida.

| Evidencia adicional | SHA-256 |
|---|---|
| `G5-jitless-resultado.json` | `8c5b1f5f78b2d7cfb6cc7718e94547c0a4f0e725a41c5295e8ab3c4a614ed2a6` |
| `e2e-G5-jitless.log` | `170f0610320a3053267fe71d7bdf69255e9df205e56e0cd090e8d96c34f186a4` |

**Anexo final — recorrido-jitless, 08:32 local.** Se leyó `.turbo/cierre-m4-2026-10-14/recorrido-jitless-resultado.json`, ejecutado por el principal. Registra inicio `2026-10-15T12:30:05.1Z`, duración `16097.807` ms (16,097807 s, consistente con los 16,098 s comunicados), `expected: 5`, `unexpected: 0`, `flaky: 0`, `skipped: 0` y `errors: []`. Cada caso tiene un único resultado `passed`, con `retry: 0`:

| Caso de `recorrido-completo.spec.ts` | Resultado contrastado |
|---|---|
| `:40`, crear cuenta, entrar y reportar desde la app pública | `passed`, primer intento |
| `:99`, publicación tras la demora como «NO SE HA VERIFICADO» | `passed`, primer intento |
| `:121`, validación desde el panel técnico | `passed`, primer intento |
| `:148`, mapa público como «Verificado» con su unidad vecinal | `passed`, primer intento |
| `:173`, exportación técnica con nota metodológica | `passed`, primer intento |

SHA-256 del JSON del recorrido: `ab04d2f0b04143aad80ed088b6e3862bc52b6c13e167c57fd5f45a2614122930`. El `exit 0` se atribuye al principal; no es un campo del JSON leído.

El coordinador comunica haber cerrado cuatro árboles de procesos propios, comprobado cuatro puertos libres y dejado PostGIS/MinIO sanos. Se registra como comprobación externa atribuida, sin ejecutar inspección propia de procesos, puertos ni Docker. El principal comunica asimismo que continúa con la actualización de informes, sin cambios de código; esta revisión no edita esos informes.

**Cierre de esta revisión focal.** La lectura del mecanismo, su inclusión previa a hidratación, G5 posterior **18/18** y recorrido **5/5**, ejecutados por el principal y contrastados documentalmente, respaldan la corrección aprobada en ambas apps, sin bloqueantes focales pendientes. R3 conserva su PASS DOM atribuido al principal y la limitación de lector real no verificado. No se extrapolan estos dos grupos al cierre global de M4 ni a una aprobación de fase: esa integración corresponde al principal y al usuario. Este revisor solo actualiza `revision.md` y no modifica documentos de otro autor.
