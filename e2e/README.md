# e2e — Parte 5 (calidad)

Pruebas end-to-end **transversales**: las que cruzan varias partes. Los E2E propios de cada app viven dentro de la app.

| Archivo | Qué cubre |
|---|---|
| `tests/recorrido-completo.spec.ts` | Vecino reporta → moderación previa (404 en público) → técnico valida → aparece en el mapa público → sale en CSV y GeoJSON |
| `tests/api-contratos.spec.ts` | Sin navegador: `/ready`, point-in-polygon dentro y fuera, validación de payload, honeypot, 422 fuera de cobertura, 401 sin sesión, capas y teselas, fotos en WebP (`image/webp`, `nosniff`, sin trozos EXIF/XMP/ICCP leídos del RIFF) que, sin reporte, solo ve quien las subió (404 sin sesión, a un técnico y con otra extensión), rechazo por *magic bytes*. Exportación con `total`/`exportados`/`truncado` (y `X-Curichi-Truncado`, `# INCOMPLETO` en el CSV); fusión consigo mismo con el id en mayúsculas → 409 `FUSION_CONSIGO_MISMO`; `evento_en` futuro o de más de un año → 400; JSON roto → 400 `PAYLOAD_INVALIDO` sin códigos `FST_`; `GET /api/v1/configuracion` (ciudad válida, pública y cacheable) |
| `tests/mapa-publico.spec.ts` | Mapa público en escritorio y en móvil (proyecto `movil`) |
| `tests/mapa-seleccion.spec.ts` | El reporte elegido sobrevive al zoom, al arrastre y al cambio de consulta; las agrupaciones cuentan sus reportes y se abren al acercar; el 404 del detalle se dice. También en móvil |
| `tests/separacion-publica-tecnica.spec.ts` | Que la vista pública siga siendo pública aunque el navegador lleve cookie de técnico; que la vista técnica exija rol; cabeceras de caché; y que los puntos críticos no publiquen medidas de la geometría exacta |
| `tests/responsive.spec.ts` | Que ninguna pantalla se desborde a lo ancho, de 320 a 1920 px |
| `tests/accesibilidad.spec.ts` | `lang`, `h1`, `alt`, etiquetas de campos, nombres de botones y enlace de salto; también en `/ejecutivo` con sesión de ejecutivo |
| `tests/datos-reales.spec.ts` | Las capas vigentes se usan de verdad: nombres, bbox, point-in-polygon y búsqueda. La ciudad sale de `/api/v1/configuracion`: las capas caen alrededor de su centro, el centro cae dentro de los distritos y el mapa público la nombra |
| `tests/navegacion.spec.ts` | Los cuatro destinos de la barra, cambio de pestaña sin recargar, capas del mapa, «Borrar esta lista» de *Mis reportes* (`mis-reportes-vacio`) y el plano oficial del panel, que solo existe si la ciudad configurada es la del plano |
| `tests/resiliencia-interfaz.spec.ts` | Que la interfaz no invente cuando la API falla: mapa, *Mis reportes*, seguimiento; `/auth/yo` con 503 → `error-sesion` y no «Necesitás una cuenta»; `POST /fotos` con 401 → «Se cerró tu sesión» con el borrador guardado; 429 `CUOTA_DE_FOTOS` → el mensaje del servidor en `error-foto` sin perder nada (las fotos se sacan con la cámara). Y que el borrador sobreviva a una recarga (CA-X1: el punto se elige, el centro del mapa ya no cuenta) |
| `tests/formulario-reporte.spec.ts` | Paso a paso del formulario: sin punto al abrir; volver al paso 1 conserva el punto (y es el que se envía); mover el mapa pasa a `ubicacion-pendiente` y «Continuar» espera; abrir y salir (también por «Me pasa a mí») no deja `borrador-retomado`; GPS de 20 m se envía como `gps` y uno de 20 km avisa (`aviso-ubicacion-aproximada`) y se envía `manual`; fecha futura o de más de un año → `error-campo-evento_en`; tras un 201 o un 429 de cuota aparece «Ya enviaste…» sin recargar |
| `tests/panel-ejecutivo.spec.ts` | Rol ejecutivo (contracts 0.6.0): 401 sin sesión, 403 a un ciudadano; el resumen separa `activas` (nuevo + validado) de `resueltas` y cuadra en la raíz y por distrito; un reporte resuelto sale de las activas; 403 en `/tecnico/reportes`, `/exportar` e `/indicadores`. En el panel: `ejecutivo-total` fijo (`activas.total`) con `ejecutivo-verificadas` y `ejecutivo-anuncio`; el conteo de cada pestaña en `ejecutivo-pestana-<id> .n`; `ejecutivo-capa-anterior` solo si hay distritos de una capa anterior; cambiar el período sin cabecera de sondeo y con `ejecutivo-cargando-periodo`; el refresco de cada 60 s y el de volver a la pestaña con `x-curichi-sondeo: 1` (reloj controlado con `page.clock`); `/reportes` → `/ejecutivo` con aviso |
| `tests/panel-tecnico.spec.ts` | Una cuenta ciudadana ve «sin acceso» y sale con `cerrar-sesion-sin-acceso`; `/login` no la rebota. `enlace-inicio` de la raíz, el 404 y la pantalla de error según el rol (el ejecutivo entra por `/` sin aviso). «Exportar GeoJSON» es un botón que descarga, y `aviso-exportacion` si viene truncada. Indicadores `indicador-vigentes`/`-validados`/`-nuevos`/`-puntos-criticos` sin rechazados ni duplicados. Reabrir un rechazado exige motivo (API y formulario) |
| `tests/acceso-panel.spec.ts` | `panel_url` de `/auth/yo` solo para técnico, admin y ejecutivo (al ciudadano ni la clave); el botón «Panel técnico» (técnico, admin) y «Panel ejecutivo» (ejecutivo, a `/ejecutivo`) salen de ahí y llevan al panel ya dentro |
| `tests/cuenta-ciudadana.spec.ts` | El mapa sin cuenta, el envío con cuenta, un reporte por hora por cuenta, alta sin enumeración de correos |
| `tests/quitar-campos-web.spec.ts`, `tests/quitar-campos-panel.spec.ts` | Sin manzana, dirección, duración ni afectación en el formulario, el detalle, el envío y los mapas (la capa de manzanas no se pide) |
| `tests/formulario-sumidero-y-fotos.spec.ts` | El sumidero se pregunta con Sí/No y Tapado/No tapado, sin «No sé»; con «No» desaparece «el agua brota»; sin tocarlo se envía `null` en los tres campos. Cámara: «Sacar foto» abre el diálogo dentro de la página (ningún `input[type=file]` ni selector de archivos), no la pide antes de tocarlo, la pide trasera y con 1920 de ancho ideal, y la apaga al cerrar (botón o Escape) con el foco de vuelta en «Sacar foto». Una foto lenta deshabilita «Continuar» y «Sacar foto» (`foto-subiendo-mosaico`); con dos fotos la tercera entra, y completas ya no se pide la cámara |
| `tests/camara-foto.spec.ts` | En escritorio y en móvil (proyecto `movil`, Pixel 7): la foto de la cámara sale en `image/webp` con el ancho del cuadro del video hasta 1600 px (leído de los bytes) y sin metadatos; antes del reporte solo la ve quien la sacó (404 desde otro navegador sin sesión, por la app y por la API, y a un técnico); el reporte se envía con esa foto. Sin el permiso de cámara, «Sacar foto» dice cómo habilitarlo, no deja la cámara prendida y el reporte se envía sin foto |

`tests/ayudas.ts` reúne lo compartido: credenciales, cuentas nuevas por caso, `numeroDePaso` y
`pasoActual` (leen «Paso N de M», sin depender de clases), los pasos del formulario, `leerCiudad`,
`retenerPeticiones` (para ver estados intermedios), `vigilarRed` + `esperarRedQuieta` y, para las
fotos, `vigilarCamara` (qué se le pidió a `getUserMedia` y si quedó alguna pista prendida),
`sacarFotoConLaCamara` y `leerWebp`.

**Cámara falsa.** La foto sale solo de la cámara dentro de la página: no hay input de archivo al
que pasarle una imagen. `playwright.config.ts` usa el Chromium completo en modo sin ventana
(`channel: 'chromium'`) con `--use-fake-device-for-media-stream`: una cámara sintética que da
1920 × 1080 si se piden. El permiso lo da solo el contexto: cada prueba que saca fotos lo declara con
`test.use({ permissions: ['camera'] })`, y las demás no tienen cámara. No se usa
`--use-fake-ui-for-media-stream`, que acepta cualquier pedido y le daba cámara a todas; sin él, el
`chromium-headless-shell` de siempre responde `NotSupportedError` aun con el permiso, y por eso el
canal `chromium`. Así el permiso negado es el real: `camara-foto.spec.ts` corre una prueba sin él y
`getUserMedia` responde `NotAllowedError`, como a quien toca «Bloquear». La foto se compara con el
ancho del cuadro que dio la cámara y no con 1920, porque la falsa no está obligada a respetarlo
(plan 2026-09-26, decisión 3).

**Ausencias.** Para afirmar que algo NO pasó («el mapa no pidió manzanas») no se espera un tiempo
fijo: `esperarRedQuieta` espera a que no quede nada en vuelo ni salga nada nuevo durante 1,5 s, y
recién ahí se mira la lista. Un `waitForTimeout` pasaba igual con el mapa todavía cargando.

**La ciudad no se escribe en las pruebas.** Llega por `GET /api/v1/configuracion` (Santa Cruz por
defecto) y se lee con `leerCiudad`. `PUNTO_CENTRO` sí es fijo: es un punto de las capas cargadas,
no de la configuración.

**Sin despliegue.** Para comprobar que la suite compila y se carga sin levantar nada:

```bash
cd e2e
pnpm exec playwright test --list
pnpm exec tsc --noEmit
cd .. && pnpm exec biome check e2e
```

## Cómo correrlos

La primera vez hace falta el navegador:

```bash
pnpm --filter e2e exec playwright install chromium
```

Lo más simple es dejar que Playwright levante las apps: solo hay que tener la base en marcha.

```bash
pnpm db:local           # terminal 1: PostGIS local sin Docker (127.0.0.1:5433)
```

```bash
pnpm db:seed:samples && pnpm test:e2e    # terminal 2
```

`webServer` arranca `pnpm dev` por su cuenta (hasta 5 minutos la primera vez, por la compilación
de Next) con el entorno de prueba de `playwright.config.ts`:

| Variable | Valor | Por qué |
|---|---|---|
| `RATE_LIMIT_REPORTES_POR_HORA`, `RATE_LIMIT_LECTURAS_POR_MINUTO` | altos | La suite crea reportes y lee el mapa desde la misma IP |
| `GEO_RATE_LIMIT_POR_MINUTO`, `GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO` | altos | Detrás de Next, todas las teselas y resoluciones llegan desde una sola IP |
| `LOGIN_*`, `REGISTRO_*` | altos | Una cuenta nueva por caso; la cuota de **un reporte por hora por cuenta** no se toca |
| `COOKIE_SEGURA` | `0` | Con `1` la cookie sale `Secure` y el cliente HTTP de Playwright (`request`, `page.request`) no la manda sobre http: las rutas con sesión dan 401 |
| `PANEL_ADMIN_URL` | `http://localhost:3100` (o la de la variable) | api-core la manda en `panel_url` de `/auth/yo`; sin ella el botón «Panel técnico/ejecutivo» no aparece y fallan `acceso-panel.spec.ts` y `panel-tecnico.spec.ts` |

> **Si ya tenés `pnpm dev` corriendo**, Playwright lo reutiliza (`reuseExistingServer`) y **no**
> puede pasarle ese entorno. La suite crea varios reportes desde la misma IP y el límite de
> producción es 10/h: a partir de ahí `POST /api/v1/reportes` responde 429 y fallan los casos del
> recorrido completo. Una pila con los límites de producción y `COOKIE_SEGURA=1` (como la del
> Compose) tampoco sirve. Arrancá ese `pnpm dev` al menos así:
>
> ```bash
> RATE_LIMIT_REPORTES_POR_HORA=1000 COOKIE_SEGURA=0 PANEL_ADMIN_URL=http://localhost:3100 pnpm dev
> ```
>
> (en PowerShell: `$env:RATE_LIMIT_REPORTES_POR_HORA=1000; $env:COOKIE_SEGURA=0;
> $env:PANEL_ADMIN_URL='http://localhost:3100'; pnpm dev`), o simplemente cerralo y dejá que
> Playwright lo levante.

Las pruebas que solo necesitan una sesión la ponen por API (`cuentaNuevaEnElNavegador`,
`sesionDelPanelEnElNavegador`), que comparte cookies con el navegador; entrar por la pantalla ya lo
recorren `cuenta-ciudadana.spec.ts`, `recorrido-completo.spec.ts` y `panel-ejecutivo.spec.ts`.

Credenciales: se toman de variables de entorno y, si no están, usan los usuarios sintéticos del seed (ver `packages/db/README.md`):

| Rol | Variables | Por defecto |
|---|---|---|
| Técnico | `E2E_TECNICO_EMAIL`, `E2E_TECNICO_PASSWORD` | `tecnico@curichi.local` |
| Administrador | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | `admin@curichi.local` |
| Ejecutivo | `E2E_EJECUTIVO_EMAIL`, `E2E_EJECUTIVO_PASSWORD` | `ejecutivo@curichi.local` (migración 0011) |
| Ciudadana | `E2E_VECINA_EMAIL`, `E2E_VECINA_PASSWORD` | `vecina@curichi.local` |

La contraseña del ejecutivo la fija el seed con `SEED_EJECUTIVO_PASSWORD` (por defecto la local de desarrollo). Si la cambiás al sembrar, pasá la misma en `E2E_EJECUTIVO_PASSWORD`: el seed corre aparte, no dentro de `webServer`.

## Fallos que no son del código

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `page.goto: net::ERR_NETWORK_IO_SUSPENDED` y, en el reintento, `Test timeout of 90000ms exceeded` esperando un elemento | La máquina entró en **modo de espera moderno** (*connected standby*) a mitad de la corrida y Windows cortó la red por directiva. Chromium aborta las peticiones en vuelo con ese código | No es intermitencia de la suite. Comprobalo en el registro de eventos (`Kernel-Power` 506/507 y 172 `Disconnected. Motivo: Policy Setting`) y volvé a correrla con la máquina despierta |
| Tres fallos seguidos en `recorrido-completo.spec.ts` a partir de «el técnico lo valida desde el panel» | Ese archivo es un **recorrido en serie**: si la validación no ocurre, los dos casos siguientes comprueban un reporte que sigue en `nuevo` | Mirar solo el primer fallo; los otros dos son consecuencia |
| `No respondió http://localhost:3000/ en 300 s` en la preparación, con los servicios arriba | `webServer` solo vigila `127.0.0.1:3001/health`. Si quedó un `api-core` suelto en ese puerto, `reuseExistingServer` da la pila por levantada y **no arranca `pnpm dev`**: las apps de Next nunca escuchan | Cerrar lo que haya en 3000, 3001, 3002 y 3100 y volver a correr, o levantar `pnpm dev` entero a mano con los límites de prueba |
| `dentro_cobertura: false` donde antes daba `true`, o `ECONNREFUSED 127.0.0.1:3001` a mitad de la corrida | La base local (PGlite sobre `pglite-socket`) lleva horas en marcha y se degradó: el socket empieza a cortar conexiones (`ECONNRESET`) y api-core se cae detrás. Visto tras un ciclo de suspensión de la máquina | Reiniciar `pnpm db:local` (los datos persisten en `infra/.pglite`) y volver a correr. Es un límite del modo local, no del código: ver [ADR 0003](../docs/decisiones/0003-pglite-solo-en-local-y-pruebas.md) |
| `429` en `POST /api/v1/reportes` o en `/auth/login` | Un `pnpm dev` previo sin los límites de prueba, o un banco de carga que dejó filas en `intento_login` | Ver el aviso de arriba sobre `reuseExistingServer`; para el login, `DELETE FROM intento_login` |
| `401` en exportación, indicadores o `/auth/yo` justo después de un login por API que dio 200 | La pila corre con `COOKIE_SEGURA=1`: la cookie es `Secure` y el cliente de Playwright no la manda sobre http | Correr contra un `pnpm dev` con `COOKIE_SEGURA=0` (lo pone `webServer`), no contra la pila de producción ni la del Compose |
| `panel_url` es `null` en `acceso-panel.spec.ts` | api-core arrancó sin `PANEL_ADMIN_URL` | Ver la tabla del entorno de prueba |
