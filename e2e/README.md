# e2e — Parte 5 (calidad)

Pruebas end-to-end **transversales**: las que cruzan varias partes. Los E2E propios de cada app viven dentro de la app.

| Archivo | Qué cubre |
|---|---|
| `tests/recorrido-completo.spec.ts` | Vecino comparte su ubicación y ajusta el punto a 50 m → la confirmación trae la cuenta regresiva y la marca «NO SE HA VERIFICADO» → pasada su demora (`esperarPublicacion`) se ve en el mapa público sin moderación, `nuevo` y `verificado: false`, con el chip exacto y `aviso-sin-verificar` → el técnico ve «Visible en el mapa público como NO SE HA VERIFICADO», valida, y el detalle dice «Ajustado a mano, a 50 m del teléfono al enviar», «± 10 m» y «a 50 m del GPS» → el mapa público lo muestra como «Verificado» → sale en CSV (con la columna `distancia_dispositivo_m`) y GeoJSON, sin la posición del teléfono |
| `tests/publicacion-diferida.spec.ts` | Plan 2026-09-26, S24 (pedidos C, G y B). La cuenta A envía con foto (`publicar_en − creado_en` = 2 s, `demora_proximo_s` en `/auth/yo`): durante la espera, B, un anónimo y el técnico reciben 404 en el detalle, la vista técnica, la moderación y la foto (cada consulta vale solo si volvió cuando el reporte seguro seguía sin publicarse), y A ve su foto (`private, no-store`) y su reporte en `GET /mis-reportes`. En 10 s o menos B lo ve, `nuevo` y sin autor, con la foto `public, no-cache` y ETag; en la app, el chip exacto «NO SE HA VERIFICADO», `aviso-sin-verificar`, la pastilla «Punto de severidad media, no se ha verificado» y `leyenda-mapa`; en el panel, `visibilidad-publica`. El 2.º envío del día (4 s) tarda más. Validar → «Verificado». Rechazar → 404 en el detalle y en la foto, también con `If-None-Match`; la autora sigue viendo su foto y lo ve «Retirado del mapa» en *Mis reportes*. Un validado: el técnico recibe 403 `SIN_PERMISO` y no ve `boton-retirar`; el admin lo retira con motivo y sale del mapa |
| `tests/api-contratos.spec.ts` | Sin navegador: `/ready`, point-in-polygon dentro y fuera, validación de payload, honeypot, 422 fuera de cobertura (con el teléfono en el mismo punto), un reporte en la posición del teléfono sale `gps` con distancia 0, 401 sin sesión, capas y teselas, fotos en WebP (`image/webp`, `nosniff`, sin trozos EXIF/XMP/ICCP leídos del RIFF) que, sin reporte, solo ve quien las subió (404 sin sesión, a un técnico y con otra extensión), rechazo por *magic bytes*. Exportación con `total`/`exportados`/`truncado` (y `X-Curichi-Truncado`, `# INCOMPLETO` en el CSV); fusión consigo mismo con el id en mayúsculas → 409 `FUSION_CONSIGO_MISMO`; `evento_en` futuro o de más de un año → 400; JSON roto → 400 `PAYLOAD_INVALIDO` sin códigos `FST_`; `GET /api/v1/configuracion` (ciudad válida, pública y cacheable). Los rechazos del cuerpo y de cobertura no gastan el cupo del día; la vista técnica y la moderación se consultan con el reporte ya publicado (`crearReportePublicadoPorApi`); todo lo que reporta o sube fotos usa una cuenta nueva |
| `tests/mapa-publico.spec.ts` | Mapa público en escritorio y en móvil (proyecto `movil`) |
| `tests/mapa-seleccion.spec.ts` | El reporte elegido sobrevive al zoom, al arrastre y al cambio de consulta; las agrupaciones cuentan sus reportes y se abren al acercar; el 404 del detalle se dice. También en móvil |
| `tests/separacion-publica-tecnica.spec.ts` | Que la vista pública siga siendo pública aunque el navegador lleve cookie de técnico (el par de lecturas se repite si un reporte cumple su demora entre una y otra); que solo muestre `nuevo`, `validado` y `resuelto`, con `verificado` falso solo en los nuevos; que la vista técnica exija rol; cabeceras de caché; y que los puntos críticos no publiquen medidas de la geometría exacta |
| `tests/responsive.spec.ts` | Que ninguna pantalla se desborde a lo ancho, de 320 a 1920 px |
| `tests/accesibilidad.spec.ts` | `lang`, `h1`, `alt`, etiquetas de campos, nombres de botones y enlace de salto; también en `/ejecutivo` con sesión de ejecutivo |
| `tests/datos-reales.spec.ts` | Las capas vigentes se usan de verdad: nombres, bbox, point-in-polygon y búsqueda. La ciudad sale de `/api/v1/configuracion`: las capas caen alrededor de su centro, el centro cae dentro de los distritos y el mapa público la nombra |
| `tests/navegacion.spec.ts` | Los cuatro destinos de la barra, cambio de pestaña sin recargar, capas del mapa, *Mis reportes* de la cuenta (`acceso-mis-reportes` sin sesión, `mis-reportes-vacio` con una cuenta nueva; la lista vieja `curichi.mis-reportes.v1` del navegador se borra sola y no se muestra) y el plano oficial del panel, que solo existe si la ciudad configurada es la del plano |
| `tests/resiliencia-interfaz.spec.ts` | Que la interfaz no invente cuando la API falla: mapa; *Mis reportes* con `GET /mis-reportes` en 500 → `error-mis-reportes` y no «Todavía no enviaste ninguno», y «Reintentar» la recupera; un seguimiento que no es de la cuenta → `seguimiento-desconocido`; `/auth/yo` con 503 → `error-sesion` y no «Necesitás una cuenta»; `POST /fotos` con 401 → «Se cerró tu sesión» con el borrador guardado; 429 `CUOTA_DE_FOTOS` → el mensaje del servidor en `error-foto` sin perder nada (las fotos se sacan con la cámara). Y que el borrador sobreviva a una recarga (CA-X1): retomado, vuelve al paso 1 a pedir la ubicación, que no se guarda, y «Continuar» lleva al paso donde iba; «Empezar de nuevo» olvida lo elegido sin volver a pedirla |
| `tests/formulario-reporte.spec.ts` | Paso a paso del formulario: al abrir no hay mapa ni «Continuar» hasta compartir la ubicación, y el punto arranca en el teléfono (`distancia-al-punto`, `ayuda-circulo`); volver al paso 1 conserva el punto ajustado y es el que se envía, con `dispositivo` aparte y sin `ubicacion_metodo` ni `precision_gps_m`; «mover 5 m» pasa a `ubicacion-pendiente` y «Continuar» espera; abrir, compartir y salir (también por «Me pasa a mí») no deja `borrador-retomado`; un enlace a 200 m pone el punto en el teléfono y lo dice (`aviso-ubicacion`); si el teléfono se movió 70 m antes de enviar, no se envía: vuelve al paso 1 con «Te moviste 70 m» y, ajustado, a la revisión; fecha futura o de más de un año → `error-campo-evento_en`. Cupo del día (S16): `cupo-reportes` dice «Te quedan 3 de 3 reportes hoy», `aviso-demora` avisa cuándo se publica y con qué marca, la `cuenta-regresiva` termina en «Ya está publicado · recargá el mapa para verlo», y al volver sin recargar dice «Te quedan 2 de 3»; `cupo-agotado` aparece recién al gastar el 3.º, sin recargar y sin pedir la ubicación (`vigilarSensores`); si el último se gastó en otro lado, el 429 `CUOTA_DE_REPORTES` lleva al mismo aviso |
| `tests/panel-ejecutivo.spec.ts` | Rol ejecutivo (contracts 0.6.0): 401 sin sesión, 403 a un ciudadano; el resumen separa `activas` (nuevo + validado) de `resueltas` y cuadra en la raíz y por distrito; un reporte resuelto sale de las activas; 403 en `/tecnico/reportes`, `/exportar` e `/indicadores`. En el panel, la pantalla limpia (plan 2026-09-26, S27): `ejecutivo-total` fijo (`activas.total`) con `ejecutivo-verificadas`, `ejecutivo-anuncio` y `ejecutivo-nota`; sin mapa (no pide nada de `/geo/`), sin selector de período (el resumen va siempre con `ventana=todo`), sin «actualizado hace…» ni «Último reporte»; el conteo de cada pestaña en `ejecutivo-pestana-<id> .n`; la gráfica de inundaciones con una barra por distrito vigente más «Otros» solo si hay activas fuera de ellos, y sumando la cifra grande; `indicadores-capa-anterior` en `/indicadores` solo si hay distritos de una capa anterior; `/reportes` → `/ejecutivo` con aviso. La pantalla se compara con el último resumen que recibió (se refresca cada 10 s) |
| `tests/panel-al-dia.spec.ts` | Plan 2026-09-26, S28: con el reloj real, la bandeja muestra un reporte recién publicado (`esperarPublicacion`) en 15 s o menos y el panel ejecutivo sube «en revisión», los dos sin recargar el documento. Con `page.clock`: en la bandeja, el detalle, los indicadores y el ejecutivo la primera carga va sin `x-curichi-sondeo` y dos saltos de 10 s refrescan con `x-curichi-sondeo: 1`; con la pestaña oculta (`simularPestana`) 30 s no se pide nada y al volver se refresca como sondeo |
| `tests/trafico-publico.spec.ts` | Plan 2026-09-26, S33: el mapa público abierto 3 minutos (con `page.clock`, de a 10 s, sin esperarlos), con seis idas y vueltas a otra pestaña y un corte de red, no vuelve a pedir `/api/v1/reportes` ni `/geo/v1/agregados` (mirando el contexto entero, service worker incluido). Una tesela con la huella de `CapaInfo.url` responde `public, max-age=31536000, immutable`, por la app y directo a geo-service |
| `tests/csp.spec.ts` | Plan 2026-09-26, S40 y S41: la página llega con CSP de nonce y sin 'unsafe-inline' en `script-src` (`comprobarCspConNonce`), y `vigilarCsp` no junta ningún `securitypolicyviolation`, mensaje de la CSP en la consola ni petición cortada: en la bandeja, el detalle (con foto si hay) y el ejecutivo del panel, con un sondeo de por medio; en el mapa público, que dibuja puntos (el worker de MapLibre cargó); en el formulario con la cámara simulada (la miniatura se ve), el envío y *Mis reportes* |
| `tests/panel-tecnico.spec.ts` | Una cuenta ciudadana ve «sin acceso» y sale con `cerrar-sesion-sin-acceso`; `/login` no la rebota. `enlace-inicio` de la raíz, el 404 y la pantalla de error según el rol (el ejecutivo entra por `/` sin aviso). «Exportar GeoJSON» es un botón que descarga, y `aviso-exportacion` si viene truncada. Indicadores `indicador-vigentes`/`-validados`/`-nuevos`/`-puntos-criticos` sin rechazados ni duplicados, comparados con la última respuesta que recibió la pantalla (se refresca sola). Reabrir un rechazado exige motivo (API y formulario); los reportes se moderan ya publicados |
| `tests/acceso-panel.spec.ts` | `panel_url` de `/auth/yo` solo para técnico, admin y ejecutivo (al ciudadano ni la clave); el botón «Panel técnico» (técnico, admin) y «Panel ejecutivo» (ejecutivo, a `/ejecutivo`) salen de ahí y llevan al panel ya dentro |
| `tests/cuenta-ciudadana.spec.ts` | El mapa sin cuenta, el envío con cuenta, alta sin enumeración de correos. Cupo diario (S17): una cuenta nueva ve «Te quedan 3 de 3 reportes hoy» (`cupo-cuenta`); tres envíos seguidos entran y `/auth/yo` baja de 3 a 0; el 4.º da 429 `CUOTA_DE_REPORTES` con el mensaje del contrato, `Retry-After` y `disponible_en` hasta la próxima medianoche (lo mismo que `puede_reportar_desde`) y no guarda nada; cinco envíos simultáneos dejan exactamente 3; cambiar `X-Forwarded-For`, `X-Real-IP` o `Forwarded` no da más turnos; otra cuenta sí puede |
| `tests/quitar-campos-web.spec.ts`, `tests/quitar-campos-panel.spec.ts` | Sin manzana, dirección, duración ni afectación en el formulario, el detalle, el envío y los mapas (la capa de manzanas no se pide) |
| `tests/formulario-sumidero-y-fotos.spec.ts` | El sumidero se pregunta con Sí/No y Tapado/No tapado, sin «No sé»; con «No» desaparece «el agua brota»; sin tocarlo se envía `null` en los tres campos. Cámara: «Sacar foto» abre el diálogo dentro de la página (ningún `input[type=file]` ni selector de archivos), no la pide antes de tocarlo, la pide trasera y con 1920 de ancho ideal, y la apaga al cerrar (botón o Escape) con el foco de vuelta en «Sacar foto». Una foto lenta deshabilita «Continuar» y «Sacar foto» (`foto-subiendo-mosaico`); con dos fotos la tercera entra, y completas ya no se pide la cámara |
| `tests/ubicacion-obligatoria.spec.ts` | En escritorio y en móvil (plan 2026-09-26, pedidos E y F): con un espía (`vigilarSensores`), ni `/inicio`, ni el mapa, ni *Cómo funciona*, ni *Mis reportes*, ni el formulario leen la ubicación, consultan su permiso o piden la cámara al cargar, aun con los permisos ya dados; «Compartir mi ubicación» abre una sola vigilancia (`enableHighAccuracy`, `maximumAge: 0`) que se apaga al llegar. «Ir a mi ubicación» sin permiso muestra `aviso-ubicacion-al-reportar` sin leer la ubicación (el permiso sigue en «preguntar»); con el permiso dado la lee una vez. Permiso negado → `ubicacion-bloqueada` sin mapa ni «Continuar», y al habilitarlo sigue solo. Con 200 m de precisión, «Precisión actual: 200 m» y no se avanza hasta llegar a 50 m; a los 30 s (`page.clock`), «Salí a un lugar abierto» con el GPS apagado. Coordenadas a 80 m → `error-coordenadas`; a 50 m entran y el técnico ve `manual`, ± 10 m y 50 m, sin la posición del teléfono. Tocar el mapa fuera del círculo deja el punto a 60 m. Sin navegador: un POST a 80 m → 422 `UBICACION_FUERA_DE_RADIO`, con 80 m de precisión → 422 `PRECISION_INSUFICIENTE`, de 601 s → 422 `POSICION_VENCIDA`, sin `dispositivo` → 400; ninguno gasta el cupo (`reportes_restantes_hoy` sigue en 3) y a 60 m entra |
| `tests/camara-foto.spec.ts` | En escritorio y en móvil (proyecto `movil`, Pixel 7): la foto de la cámara sale en `image/webp` con el ancho del cuadro del video hasta 1600 px (leído de los bytes) y sin metadatos; antes del reporte solo la ve quien la sacó (404 desde otro navegador sin sesión, por la app y por la API, y a un técnico); el reporte se envía con esa foto. Sin el permiso de cámara, «Sacar foto» dice cómo habilitarlo, no deja la cámara prendida y el reporte se envía sin foto |

`tests/ayudas.ts` reúne lo compartido: credenciales, cuentas nuevas por caso, `numeroDePaso` y
`pasoActual` (leen «Paso N de M», sin depender de clases), los pasos del formulario, `leerCiudad`,
`retenerPeticiones` (para ver estados intermedios), `vigilarRed` + `esperarRedQuieta` y, para las
fotos, `vigilarCamara` (qué se le pidió a `getUserMedia` y si quedó alguna pista prendida),
`sacarFotoConLaCamara` y `leerWebp`. Para la ubicación: `GPS_EN_EL_CENTRO`, `reporteValido` (con
`dispositivo`), `dispositivoEn`, `desplazar`, `distanciaM`, `textoDistancia`, `compartirUbicacion`,
`elegirPuntoPorCoordenadas` y `vigilarSensores` (ubicación, permisos y cámara pedidos desde que
empieza el documento). Para la publicación y el panel: `esperarPublicacion` (pregunta a la vista
técnica hasta que el reporte pasó su demora; no afirma nada sobre la demora),
`crearReportePublicadoPorApi` (cuenta nueva, envío, sesión de técnico y espera: listo para
moderar), `DEMORA_E2E_PRIMERO_S`/`DEMORA_E2E_SIGUIENTES_S`, `REPORTES_POR_DIA`, `textoCupo`,
`TEXTO_CUPO_AGOTADO`, `TEXTO_YA_PUBLICADO` y `ETIQUETA_PUBLICA` (los textos exactos de
`ETIQUETAS.estado_publico`: «NO SE HA VERIFICADO», «Verificado», «Resuelto»), `CABECERA_SONDEO`,
`INTERVALO_SONDEO_MS` y `simularPestana` (fija `document.visibilityState` y dispara
`visibilitychange`, porque Chromium sin ventana deja todas las pestañas «visibles»). Para el mapa
público, `puntosEnElMapa` y `esperarPuntosEnElMapa` (leen `resumen-mapa`, que solo cuenta lo que
el worker de MapLibre ya procesó). Para la CSP, `vigilarCsp`, `comprobarSinViolacionesCsp` y
`comprobarCspConNonce`. `vigilarRed(page, { todoElContexto: true })` mira también las otras
pestañas y el service worker.

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

**GPS simulado.** Reportar exige compartir la ubicación, con 50 m de precisión o menos, y el
punto tiene que quedar a 60 m o menos del teléfono (contracts 0.9.0). Cada archivo que reporta
declara `test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] })`: el teléfono en
`PUNTO_CENTRO` con 10 m de precisión, y los puntos del reporte a 60 m o menos de ahí
(`PUNTO_AJUSTADO`, a 50 m). Igual que con la cámara, el permiso lo da solo el contexto. Sin
`permissions`, queda en «preguntar» y Chromium sin ventana niega el primer pedido, como quien toca
«Bloquear»; con `permissions: []` lo da por negado de entrada, así que para probar que nadie lo pidió
hay que dejarlo sin declarar. `context.setGeolocation` mueve el teléfono en medio de una prueba y
`context.grantPermissions` lo habilita (el formulario escucha el cambio). Los topes (60 m, 50 m,
600 s) están copiados en `ayudas.ts`: la suite no depende de `contracts`.

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
| `LOGIN_*`, `REGISTRO_*`, `ALTAS_POR_DIA_POR_IP` | altos | Una cuenta nueva por caso que reporta: los topes de altas por IP (5 por hora, 10 por día) dejarían fuera a casi toda la suite |
| `REPORTES_POR_DIA_POR_CUENTA` | `3` | El de producción, fijo para que un `.env` local no lo cambie: `cuenta-ciudadana.spec.ts` comprueba que el 4.º se rechaza |
| `REPORTE_DEMORA_PRIMERO_S`, `REPORTE_DEMORA_SIGUIENTES_S` | `2` y `4` | En producción, 60 y 240 s. Con estos se prueba que durante la espera nadie lo ve y que el 2.º tarda más, y las pruebas que moderan un reporte recién creado no se comen el timeout (`esperarPublicacion`). Los mismos valores están en `DEMORA_E2E_*` de `tests/ayudas.ts` |
| `COOKIE_SEGURA` | `0` | Con `1` la cookie sale `Secure` y el cliente HTTP de Playwright (`request`, `page.request`) no la manda sobre http: las rutas con sesión dan 401 |
| `PANEL_ADMIN_URL` | `http://localhost:3100` (o la de la variable) | api-core la manda en `panel_url` de `/auth/yo`; sin ella el botón «Panel técnico/ejecutivo» no aparece y fallan `acceso-panel.spec.ts` y `panel-tecnico.spec.ts` |

> **Si ya tenés `pnpm dev` corriendo**, Playwright lo reutiliza (`reuseExistingServer`) y **no**
> puede pasarle ese entorno. La suite crea muchos reportes y cuentas desde la misma IP y los
> límites de producción la cortan a los pocos casos; con la demora de producción (60 s) cada
> prueba que modera un reporte recién creado se queda esperándolo. Una pila con `COOKIE_SEGURA=1`
> (como la del Compose) tampoco sirve. `global-setup.ts` lo comprueba antes de empezar (con una
> cuenta nueva, `/auth/yo` tiene que decir `demora_proximo_s: 2` y `reportes_restantes_hoy: 3`) y,
> si no, corta con el motivo. Arrancá ese `pnpm dev` al menos así:
>
> ```bash
> RATE_LIMIT_REPORTES_POR_HORA=1000 COOKIE_SEGURA=0 PANEL_ADMIN_URL=http://localhost:3100 \
>   REPORTE_DEMORA_PRIMERO_S=2 REPORTE_DEMORA_SIGUIENTES_S=4 REPORTES_POR_DIA_POR_CUENTA=3 \
>   ALTAS_POR_DIA_POR_IP=10000 REGISTRO_MAX_POR_IP=1000 REGISTRO_PETICIONES_POR_VENTANA=1000 \
>   pnpm dev
> ```
>
> (en PowerShell, cada una con `$env:NOMBRE='valor';` antes de `pnpm dev`), o simplemente cerralo
> y dejá que Playwright lo levante.

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
| `api-core no corre con el entorno de prueba` en la preparación, o `el reporte … tiene que publicarse` en muchas pruebas | La pila corre con la demora o el cupo de producción: un `pnpm dev` previo sin `REPORTE_DEMORA_*_S=2/4` | Ver el aviso de arriba sobre `reuseExistingServer` |
| `la respuesta volvió cuando el reporte ya podía estar publicado` en `publicacion-diferida.spec.ts` | La máquina está tan cargada que unas consultas locales tardaron más que la demora de prueba (2 s) | No es un defecto del código: repetir con la máquina menos cargada |
| `401` en exportación, indicadores o `/auth/yo` justo después de un login por API que dio 200 | La pila corre con `COOKIE_SEGURA=1`: la cookie es `Secure` y el cliente de Playwright no la manda sobre http | Correr contra un `pnpm dev` con `COOKIE_SEGURA=0` (lo pone `webServer`), no contra la pila de producción ni la del Compose |
| `panel_url` es `null` en `acceso-panel.spec.ts` | api-core arrancó sin `PANEL_ADMIN_URL` | Ver la tabla del entorno de prueba |
