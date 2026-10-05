# web-ciudadano — Parte 1 — Frontend público / experiencia ciudadana

App pública: mapa de puntos de inundación, panel de detalle y formulario de reporte. Especificación
en `CLAUDE.md` §4.3. Implementada (tarea 7 de la Fase 1); el estado y los pendientes están en
[`docs/TRASPASO.md`](../../docs/TRASPASO.md).

```bash
pnpm --filter web-ciudadano dev        # 3000; necesita api-core (3001) y geo-service (3002)
pnpm --filter web-ciudadano test       # Vitest
pnpm --filter web-ciudadano build && pnpm --filter web-ciudadano start   # modo producción
```

## Una imagen, cualquier ciudad: variables de tiempo de ejecución

Mi Curichi se instala una vez por ciudad con la **misma imagen**. Por eso la app no tiene ninguna
variable de compilación que dependa del despliegue: todas se leen en el servidor, en cada
petición, y cambiarlas no exige volver a construir. Ver `.env.example`.

| Variable | Cuándo se lee | Para qué |
|---|---|---|
| `API_CORE_URL` | En cada petición (`src/proxy.ts`, `src/lib/ciudad-servidor.ts`) | Destino de `/api/*` y origen de la ciudad. Sin valor, `http://127.0.0.1:3001` |
| `GEO_SERVICE_URL` | En cada petición (`src/proxy.ts`) | Destino de `/geo/*`. Sin valor, `http://127.0.0.1:3002` |
| `PROXY_DE_CONFIANZA` | En cada petición (`src/proxy.ts`) | `1` solo con un proxy propio delante que reescriba `X-Forwarded-For` |
| `HSTS` | En cada petición (`src/proxy.ts`) | `1` añade `Strict-Transport-Security`. Solo detrás de HTTPS |
| `NODE_ENV` | En cada petición (`src/proxy.ts`) y al compilar | Distingue `next dev` de la imagen: `'unsafe-eval'` en la CSP y el registro del service worker. No cambia entre despliegues |

Lo que **ya no** se configura en esta app:

- **La ciudad** (nombre, centro y zoom del mapa, locale, zona horaria): la sirve api-core en
  `GET /api/v1/configuracion` (contracts 0.7.0) a partir de sus variables `CIUDAD_*`. El layout
  raíz la lee **en el servidor, antes del primer HTML** (`src/lib/ciudad-servidor.ts`) y la
  reparte por contexto (`useCiudad()`), así que ninguna pantalla enseña otra ciudad ni un
  instante. Se guarda 5 minutos y se renueva por detrás (`src/lib/configuracion.ts`). Si api-core
  no responde y nunca respondió, se usa `CONFIG_DOMINIO.CIUDAD_POR_DEFECTO` (Santa Cruz), se
  registra en el log del servidor y **no** se guarda: la petición siguiente vuelve a preguntar.
  Consecuencia: todas las páginas se generan al pedirlas (`connection()`), nunca al compilar;
  si no, `next build` dejaría escrita en el HTML la ciudad del momento de construir.
- **La URL del panel**: llega en `panel_url` de `GET /api/v1/auth/yo`, que api-core solo manda a
  técnico, admin y ejecutivo (se configura en api-core con `PANEL_ADMIN_URL`). Antes se fijaba al
  compilar y viajaba en el JavaScript público.

### Imagen de producción (`output: 'standalone'`)

`next build` deja en `.next/standalone` un servidor mínimo con solo las dependencias que usa. En
este monorepo la raíz del trazado es la del repositorio (Next la detecta por el lockfile), así
que el servidor queda en `.next/standalone/apps/web-ciudadano/server.js`. Como indica Next,
`public/` y `.next/static` no se copian solos:

```bash
cp -r public .next/standalone/apps/web-ciudadano/
cp -r .next/static .next/standalone/apps/web-ciudadano/.next/
PORT=3000 HOSTNAME=0.0.0.0 API_CORE_URL=http://api-core:3001 GEO_SERVICE_URL=http://geo-service:3002 \
  node .next/standalone/apps/web-ciudadano/server.js
```

### El reenvío de `/api` y `/geo` (`src/proxy.ts`)

El navegador solo habla con el propio origen; `src/proxy.ts` (Next 16: corre en el runtime de
Node, en cada petición) reenvía `/api/*` a api-core y `/geo/*` a geo-service con
`NextResponse.rewrite` a un origen externo. Next hace de proxy HTTP con la petición entera
—método, cuerpo, cabeceras y cookies, y vuelven los `Set-Cookie`—, por el mismo camino que usaban
antes los `rewrites` externos de `next.config.ts`. Límites de Next que aplican igual que antes:

- **Cuerpo**: con proxy, Next guarda en memoria hasta 10 MB del cuerpo
  (`experimental.proxyClientMaxBodySize`); por encima lo trunca y avisa en el log. La foto más
  grande que admite api-core es de 8 MB, así que no se toca.
- **Plazo**: el reenvío corta a los 30 s sin actividad (`experimental.proxyTimeout`).
- Next añade a la respuesta la cabecera `x-middleware-rewrite` con la URL de destino, es decir,
  la dirección interna de api-core o geo-service. No es un secreto, pero si no se quiere
  publicar, el proxy TLS de delante debe quitarla.

## Pantallas

La interfaz reproduce el prototipo funcional que entregó el usuario
(«Mi Curichi · Prototipo (compartible).html»), que es la fuente de verdad visual. Cada ruta
corresponde a una pantalla suya:

| Ruta | Pantalla del prototipo | Qué hace |
|---|---|---|
| `/` | C-01 en móvil, W-01 en escritorio | Mapa público. Buscador, filtros de severidad, capas, lista lateral en escritorio |
| `/reporte/:id` | C-02 / W-02 | Detalle de un punto con enlace propio |
| `/reportar` | C-07 a C-12 | Asistente de cuatro pasos, anclado a la posición del teléfono, y confirmación con código de seguimiento |
| `/mis-reportes` | C-16 | Reportes de la cuenta en cualquier estado (`GET /api/v1/mis-reportes`), con la cuenta regresiva de los que esperan su publicación |
| `/mis-reportes/:id` | C-17 | Línea de tiempo del reporte propio |
| `/como-funciona` | C-06 | Tres pestañas: los pasos, los colores, qué no es |
| `/inicio` | C-00 en móvil, W-00 en escritorio | Portada: láminas de bienvenida o página de inicio |

El perfil con puntos y logros del prototipo (C-15, C-19) **no** está: los perfiles de ciudadano y la
gamificación están fuera del alcance de la Misión 1 (`CLAUDE.md` §3.2), así que inventarlo habría
sido una pantalla bonita sin nada detrás. La cuenta ciudadana existe solo para reportar (§16.4):
alta en `/crear-cuenta`, entrada en `/ingresar` y el estado de la sesión en `/cuenta`; ver el mapa
no la necesita. Lo que sí existe es el seguimiento: «Mis reportes» es la lista de la cuenta, que
da el servidor (`GET /api/v1/mis-reportes`, `src/lib/misReportes.ts`), así que es la misma en
cualquier teléfono y muestra cada reporte en cualquier estado: esperando su publicación, «NO SE HA
VERIFICADO», verificado, resuelto, o retirado del mapa. El navegador no guarda qué se reportó: la
lista que guardaba antes en `localStorage` se borra sola, y al perder la sesión la de la cuenta
sale de la caché.

Después del alta, «Ya podés entrar» lleva a `/ingresar?volver=…` **sin el correo en la URL**, que
lo dejaría en el historial y en los registros. El correo viaja por `sessionStorage`
(`src/lib/correo-para-entrar.ts`): el alta lo guarda, `/ingresar` lo toma una sola vez al montar
(en el cliente, para no desajustar la hidratación) y lo borra; sin almacenamiento, el campo queda
vacío. `/ingresar` ya no lee `?email=`. La pantalla es la misma exista o no el correo y no inicia
sesión sola: con un correo ya registrado, eso revelaría que existe.

En el formulario de reporte, los avisos de error se anuncian al aparecer (`role="alert"`) y quedan
junto a su acción: el del envío (`error-envio`) va en el pie del paso 4, encima de «Enviar
reporte», y no al final del área con scroll; los de foto (`error-foto`), debajo de «Sacar foto» y
junto a la fila «Fotos» de la revisión (`src/componentes/AvisosDelReporte.tsx`).

## El mapa

MapLibre, con la base raster desaturada y los marcadores en pastilla del prototipo (punto de
color + nombre de la severidad escrito). Las pastillas son HTML y por eso se dibujan **solo cuando
la vista trae pocos puntos**; por encima de ese tope manda el agrupamiento de MapLibre, que los
resuelve en la GPU. Los distritos y las unidades vecinales se rellenan según cuántos reportes
tienen, con el conteo escrito en la etiqueta.

### El worker de MapLibre hay que servirlo aparte

MapLibre 6 calcula la URL de su worker con `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
Dentro de Next eso apunta al chunk empaquetado, así que pide
`/_next/static/chunks/maplibre-gl-worker.mjs`, que no existe: el servidor responde la página 404 en
HTML y el navegador rechaza el módulo por MIME. **El worker no arranca, y como ahí se procesa todo
lo vectorial, el mapa se queda solo con las teselas raster**: sin puntos, sin agrupaciones y sin
los polígonos de distrito y unidad vecinal. No aparece ningún error del mapa en la consola; solo un
`Failed to load module script` suelto.

Por eso `scripts/copiar-worker-maplibre.mjs` copia el worker (y el módulo compartido que importa) a
`public/maplibre/` antes de `dev` y de `build`, y `src/lib/worker-maplibre.ts` se lo declara a
MapLibre con `setWorkerUrl`. La copia **no se versiona**: se regenera desde el paquete instalado
para que no pueda quedar desincronizada.

### Las letras del mapa también se sirven aparte

Las etiquetas de distrito y unidad vecinal necesitan glifos SDF. Estaban pedidos a
`demotiles.maplibre.org`, que es el servidor de **demostración** de MapLibre, y encima con una
tipografía que allí no existe: cada etiqueta provocaba un 404 contra un tercero y las letras
acababan dibujadas por el navegador como último recurso. Ahora salen de
`public/glifos/NotoSans-Bold/0-255.pbf` (81 KB; ese rango cubre el castellano entero, tildes, ñ,
¿, ¡ y ·). Si alguna vez hiciera falta un carácter de fuera del rango, MapLibre lo dibuja
localmente, que es exactamente lo que hacía antes con todo el texto.

## El formulario no pierde lo escrito

El asistente de cuatro pasos guarda un borrador en `sessionStorage` (`src/lib/borrador.ts`). El
caso que lo justifica es el teléfono: con la cámara abierta, o al salir un momento a otra
aplicación, un móvil con poca memoria puede descartar la pestaña. El borrador conserva
también **la clave de idempotencia**, para que reintentar el envío después de una recarga no cree
un segundo reporte. Caduca a las 12 h **contadas desde que se empezó** (seguir escribiendo o
restaurarlo no renueva el plazo), cada foto recuerda cuándo se subió y al restaurar se descartan
las de más de 23 h, antes de que venza su vale de 24 h. Vive en la sesión de la pestaña: no queda
nada guardado en un teléfono prestado. Abrir `/reportar` (o llegar desde «Me pasa a mí») sin
tocar nada no deja borrador que retomar.

El borrador guarda el punto del reporte, **nunca la posición del teléfono**: un borrador retomado
vuelve al paso 1 a pedir la ubicación, y «Continuar» lleva de vuelta al paso donde había quedado.

Las reglas del asistente que no necesitan React (qué habilita cada paso, la fecha del evento en la
hora local, la coherencia del sumidero, el paso al que lleva cada error, el cuerpo del envío)
viven en `src/lib/formulario-reporte.ts` y están probadas en su `.test.ts`.

## Paso 1: anclado a la posición del teléfono

Para reportar hay que compartir la ubicación (plan 2026-09-26, pedidos E y F; contracts 0.9.0).

- **Nada al cargar.** Ni el mapa ni el formulario piden o leen la ubicación al abrirse. Se pide al
  tocar «Compartir mi ubicación» dentro del reporte. `navigator.geolocation` y
  `navigator.permissions` aparecen en un único archivo, `src/lib/ubicacion-dispositivo.ts`, y
  `ubicacion-pagina.test.ts` comprueba sobre todo el código fuente que ningún efecto los usa.
- **Precisión.** `watchPosition` (`enableHighAccuracy`, `maximumAge: 0`) muestra «Precisión
  actual: N m» hasta llegar a 50 m o menos (`PRECISION_DISPOSITIVO_MAX_M`). Si en 30 s no llega:
  «Salí a un lugar abierto» con «Reintentar».
- **Permiso negado.** Un bloqueo con instrucciones. Se escucha el `change` del permiso: si la
  persona lo habilita en los ajustes del sitio, la búsqueda sigue sola.
- **El círculo de 60 m.** El mapa arranca en la posición del teléfono con el círculo
  (`REPORTE_RADIO_DISPOSITIVO_M`) y el marcador recortado a él. El punto se mueve arrastrando el
  marcador, tocando el mapa, con las flechas (el marcador es un botón: 5 m por toque, 1 m con
  Mayúsculas), con los botones «mover 5 m» o escribiendo coordenadas, que se rechazan si quedan a
  más de 60 m («Ese punto está a 80 m de vos…»). La cuenta es la de `contracts`
  (`distanciaMetros`, `dentroDelRadio` sin tolerancia), la misma con la que api-core lo vuelve a
  comprobar (api-core suma `REPORTE_RADIO_TOLERANCIA_M`, 0,5 m, por el redondeo). La geometría
  está en `src/lib/radio.ts`.
- **«Me pasa a mí».** El punto del enlace se usa solo si queda a 60 m o menos del teléfono; si no,
  el punto va a la posición del teléfono y se dice por qué.
- **El punto aceptado no se muda.** Si hay que volver a compartir la ubicación con el resto ya
  contestado (un 422 de la posición, una posición vencida o un borrador retomado), el punto que
  la persona aceptó con «Continuar» sigue donde estaba, aunque lo haya puesto el GPS, mientras
  quede a 60 m o menos de la posición nueva; si no, pasa a la posición del teléfono y se dice por
  qué (`puntoYaElegido` y `puntoInicial`). Así no se envía otro lugar en silencio, y un reintento
  tras recargar la página conserva la huella de idempotencia.
- **Al enviar se relee la posición** (`getCurrentPosition`, sin caché). Si la nueva deja el punto
  fuera del círculo, se vuelve al paso 1 con «Te moviste N m: ajustá el punto». Si la lectura
  falla, se usa la última mientras tenga 10 min o menos (`POSICION_ANTIGUEDAD_MAX_S`); si no hay
  ninguna, hay que volver a compartirla.
- **Lo que viaja** es `dispositivo: { lat, lon, precision_m, antiguedad_s }`. `antiguedad_s` nunca
  es negativa (0 si el reloj da la lectura en el futuro) y queda **congelada** para los reintentos
  tras un fallo dudoso (red, plazo, 5xx): el reintento es la misma petición. Un 4xx la suelta.
  `ubicacion_metodo` y `precision_gps_m` ya no se mandan: los deriva el servidor.
- **Ubicación aproximada (ADR 0007).** Cuando el dispositivo no llega a los
  `PRECISION_DISPOSITIVO_MAX_M` m (una computadora ubicada por Wi-Fi o IP), el paso 1 ofrece
  «Reportar con ubicación aproximada» ya con la primera lectura imprecisa, sin esperar los 30 s.
  En ese camino el mapa se centra en la posición aproximada y **no hay círculo de 60 m**: el punto
  se pone a mano en cualquier lugar de la cobertura (arrastre, flechas, «mover 5 m» o coordenadas),
  la previsualización de la unidad vecinal sigue igual, un aviso «Ubicación aproximada» queda a la
  vista y la revisión lo marca. Al enviar se relee la posición (tiene que tener
  `POSICION_ANTIGUEDAD_MAX_S` o menos, con cualquier precisión) y viaja `ubicacion_aproximada: true`;
  el borrador recuerda el modo. Si el GPS mejoró y el servidor responde `422
  UBICACION_PRECISA_DISPONIBLE`, se vuelve al paso 1 a compartir la ubicación por el camino normal.
  El modo sale de `esModoAproximado` (`src/lib/ubicacion-aproximada.ts`) y las reglas sin radio, de
  `radio.ts` y `formulario-reporte.ts`.
- **Los 422** `PRECISION_INSUFICIENTE`, `UBICACION_PRECISA_DISPONIBLE`, `POSICION_VENCIDA` y
  `UBICACION_FUERA_DE_RADIO` tienen cada uno su texto (`src/lib/errores.ts`) y llevan al paso 1 a
  compartir la ubicación de nuevo.
- **«Ir a mi ubicación» del mapa** consulta el permiso al tocarlo: si ya se dio dentro de un
  reporte, centra el mapa; si no, muestra «Tu ubicación se pide solo al reportar un punto» junto a
  «Reportar un punto», sin disparar ningún aviso del navegador.
- Es una comprobación de coherencia, no una prueba de presencia: la posición la informa el
  teléfono y se puede falsear (CLAUDE.md §9.5 y §13).

## La foto sale de la cámara, dentro de la página

No hay ningún input de archivo ni galería (plan 2026-09-26, pedidos D y F). «Sacar foto»
(`src/componentes/CamaraReporte.tsx`) pide la cámara con `getUserMedia` **recién al tocarlo**,
nunca al cargar, con `facingMode: { ideal: 'environment' }` y 1920 × 1080 ideales (sin ancho ni
alto, Chrome entrega 640 × 480). La vista va en un diálogo modal con el foco atrapado, un disparo
de 72 px que se acciona con Enter o Espacio, «Repetir» y «Usar esta foto».

- **Captura**: con `ImageCapture.takePhoto()` donde existe (Chrome), achicada a 1600 px por lado;
  si no, el cuadro del video en un lienzo de 1600 px por lado como máximo y
  `toBlob('image/jpeg', 0.9)`. Se manda JPEG porque Safari en iPhone no codifica WebP desde un
  lienzo; el servidor la guarda en WebP y le quita los metadatos.
- **Miniatura**: `URL.createObjectURL`, sin pedirla al servidor. Un borrador retomado usa la URL
  del servidor, que al dueño se la sirve con su cookie.
- **Se apaga** (`track.stop()` en cada pista) al cerrar, al usar la foto, al desmontar (cambiar de
  paso, caducar la sesión, salir del formulario), en `pagehide` y cuando el permiso llega después
  de haber cerrado.
- **Errores**, cada uno con su texto: contexto no seguro (sin https no hay cámara), navegador sin
  `mediaDevices`, permiso negado, sin cámara, cámara ocupada o cortada. La foto es opcional: en
  todos los casos el reporte se puede enviar sin ella.
- Es una barrera de la interfaz, no una garantía: con la sesión, cualquiera puede mandar otra
  imagen a la API (CLAUDE.md §13).

La lógica está en `src/lib/camara.ts` y se prueba sin navegador, con `getUserMedia` simulado
(`camara.test.ts` y `camara-pagina.test.ts`).

## Imágenes propias en WebP

`public/santa-cruz-catedral.webp` y `public/logo.webp` se convirtieron una vez con sharp y se
versionan así. El único PNG que queda es `public/logo.png`, solo como `apple-touch-icon`
(`src/app/layout.tsx`), porque iOS no acepta WebP ahí. `src/lib/imagenes-propias.test.ts` falla si
aparece otra referencia a un `.jpg` o `.png` propio en `src/` o `public/`.

## Cabeceras

`next.config.ts` aplica `Permissions-Policy`, `nosniff`, `X-Frame-Options: DENY` y
`Referrer-Policy`: son fijas, no dependen del despliegue. La CSP la pone `src/proxy.ts`, con un
nonce nuevo en cada petición. Avisos para quien las toque:

- `script-src` lleva `'nonce-…'` y `'strict-dynamic'`, sin `'unsafe-inline'`: los <script> en
  línea de Next pasan porque llevan el nonce (Next lo lee de la CSP de la petición, que el proxy
  reescribe igual que la de la respuesta), y lo que ellos cargan después —chunks, el worker de
  MapLibre y su `import`— pasa por `'strict-dynamic'`. Toda página tiene que renderizarse por
  petición (lo asegura `connection()` en `src/lib/ciudad-servidor.ts`): una prerenderizada saldría
  sin nonce y no arrancaría. Lo que va a `/api` y `/geo` lleva una CSP cerrada, sin nonce.
  `style-src` conserva `'unsafe-inline'` sin nonce: con un nonce el navegador lo ignoraría y los
  atributos `style` de React y MapLibre quedarían bloqueados.
- `img-src` lleva `blob:` por la miniatura de la foto recién sacada con la cámara.
- `Permissions-Policy` deja `geolocation` y `camera` al propio origen (`(self)`): sin
  `camera=(self)`, `getUserMedia` falla con `NotAllowedError` aunque la persona diga que sí. Las
  dos se piden solo dentro del reporte, nunca al cargar.
  Micrófono, pagos y USB quedan cerrados.
- El mapa base de MapLibre 6 pide las teselas raster con `fetch`, **no** con `<img>`: hace falta
  `connect-src`, con `img-src` solo el mapa queda en negro.
- `'unsafe-eval'` está **solo** en desarrollo (lo necesita el recargado en caliente de Next). En
  producción no aparece; comprobado sobre `next start`.
- La CSP no nombra api-core ni geo-service: el navegador les habla por `/api` y `/geo` en el
  propio origen. `src/lib/proxy.test.ts` falla si aparece un origen nuevo, y
  `src/lib/next-config.test.ts` si vuelve una CSP fija.
- El worker de MapLibre (`?v=` con la versión del paquete) y los glifos (`?v=` con la huella de
  `public/glifos/`) se sirven `public, max-age=31536000, immutable`, solo cuando la URL lleva
  `?v=`. `scripts/copiar-worker-maplibre.mjs` escribe la misma versión en el `import` del módulo
  compartido. Si cambian los glifos, `src/lib/recursos-mapa.test.ts` dice la huella nueva.
- `HSTS=1` añade `Strict-Transport-Security`, y lo decide `src/proxy.ts` en cada petición (antes
  quedaba fijado al compilar). Solo detrás de HTTPS.

## PWA y service worker

`public/sw.js` (v6) se registra desde `src/app/proveedores.tsx` **solo en producción**:

| Petición | Estrategia | Por qué |
|---|---|---|
| Navegación | Red primero; sin red, el shell guardado | Al revés se sirve un HTML viejo que pide fragmentos de JS que ya no existen tras un despliegue, y la app queda en blanco |
| Capas y teselas con huella (`/geo/v1/capas/{capa}/v/{huella}`, `/geo/v1/teselas/{capa}/{huella}/…`) | Caché primero; un 410 no se guarda y llega a la página | La huella es del contenido (contracts 0.12.0): lo guardado no puede quedar viejo. Las huellas que dejan de ser vigentes se borran al activarse, al pasar la lista `/geo/v1/capas` y ante un `410 CAPA_CAMBIO` (una sola petición de la lista por ráfaga) |
| `/_next/static/…`, y `/maplibre/…` y `/glifos/…` con `?v=` | Caché primero | La URL cambia cuando cambia el contenido |
| Lista de capas, agregados, alias sin huella y el resto del origen | Red primero; sin red, la última copia | Son `no-cache`: la revalidación con `ETag` la hace la caché HTTP del navegador |
| `/api/*` | Nunca se cachea | Un reporte viejo es peor que ninguno |

Ante un `410 CAPA_CAMBIO` el mapa vuelve a pedir `/geo/v1/capas` y apunta su fuente a la URL
nueva sin recargar la página (`src/lib/capas-con-huella.ts`). Solo recarga si el 410 es de la
huella que el mapa está usando: los rezagados de una ráfaga no vuelven a pedir la lista.

Además, al instalarse guarda el shell **y sus hojas de estilo**, que saca leyendo el HTML. Hace
falta: el CSS bloquea el render, el navegador lo pide en el preescaneo y, al venir marcado
`immutable`, esa petición no siempre vuelve a pasar por el service worker, así que no se guardaba
nunca. El síntoma era un modo sin red que devolvía el shell correcto **en Times New Roman**. El
nombre del archivo lleva el hash del contenido, así que no puede estar en la lista fija.

La lógica está cubierta por `src/lib/sw.test.ts`, que carga el archivo real y conduce el manejador
`fetch` a mano. Y desde la Fase 5 está **comprobado en un navegador**: sobre `next start` el
service worker registra, activa, controla la página, no guarda ni una petición de `/api/`, borra
las cachés de la versión anterior al actualizar y, con el servidor apagado, devuelve el shell con
sus estilos.

## Sin tráfico automático

La página pública no se refresca sola (`src/lib/consultas.ts`): ninguna consulta se vuelve a pedir
por recuperar el foco, por volver la red ni por intervalo, y los reportes, los agregados y el
detalle tienen `staleTime: Infinity`. Lo nuevo aparece al abrir una pantalla, al mover el mapa o
tras enviar un reporte (invalidación explícita). `src/lib/consultas.test.ts` falla si alguna
pantalla vuelve a poner `refetchInterval` o el refresco por foco o reconexión. Un `staleTime`
escrito en el propio `useQuery` pisa el `Infinity`: las pantallas no deben ponerlo para esas claves.

## Pruebas end-to-end

Esta app no tiene una suite Playwright propia: el recorrido que la atraviesa (ciudadano reporta →
pasada la demora aparece en el mapa público con «NO SE HA VERIFICADO» → el técnico lo verifica y
pasa a «Verificado» → sale en la exportación), la accesibilidad de sus pantallas y los contratos de
la API se cubren desde la suite transversal de `e2e/`.

```bash
pnpm db:local          # terminal 1
pnpm db:seed:samples
pnpm --filter e2e test:e2e
```

La Definition of Done de `CLAUDE.md` §4.3 y §4.4 pide además una suite propia por app; queda
pendiente de decidir si aporta algo sobre la transversal o si se consolida allí.
