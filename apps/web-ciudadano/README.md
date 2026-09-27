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
| `NODE_ENV` | Al compilar (`next.config.ts`) | Distingue `next dev` de la imagen: `'unsafe-eval'` en la CSP y el registro del service worker. No cambia entre despliegues |

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
| `/reportar` | C-07 a C-12 | Asistente de cuatro pasos y confirmación con código de seguimiento |
| `/mis-reportes` | C-16 | Reportes enviados desde este dispositivo |
| `/mis-reportes/:id` | C-17 | Línea de tiempo del reporte propio |
| `/como-funciona` | C-06 | Tres pestañas: los pasos, los colores, qué no es |
| `/inicio` | C-00 en móvil, W-00 en escritorio | Portada: láminas de bienvenida o página de inicio |

Dos pantallas del prototipo **no** están: las de cuenta de ciudadano (C-13, C-14) y el perfil con
puntos y logros (C-15, C-19). No hay backend para eso —el reporte es anónimo a propósito
(`CLAUDE.md` §16.4) y la gamificación está fuera del alcance de la Misión 1 (§3.2)—, así que
inventarlo habría sido una pantalla bonita sin nada detrás. Lo que sí existe es el seguimiento:
el navegador recuerda los identificadores que devolvió la API y «Mis reportes» consulta su estado
real (`src/lib/misReportes.ts`).

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

Las reglas del asistente que no necesitan React (qué habilita cada paso, la fecha del evento en la
hora local, el GPS aproximado, la coherencia del sumidero, el paso al que lleva cada error) viven
en `src/lib/formulario-reporte.ts` y están probadas en su `.test.ts`.

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

`next.config.ts` aplica CSP, `Permissions-Policy`, `nosniff`, `X-Frame-Options: DENY` y
`Referrer-Policy`: son fijas, no dependen del despliegue. Avisos para quien las toque:

- `Permissions-Policy` deja `geolocation` y `camera` al propio origen (`(self)`): sin
  `camera=(self)`, `getUserMedia` falla con `NotAllowedError` aunque la persona diga que sí.
  Micrófono, pagos y USB quedan cerrados.
- El mapa base de MapLibre 6 pide las teselas raster con `fetch`, **no** con `<img>`: hace falta
  `connect-src`, con `img-src` solo el mapa queda en negro.
- `'unsafe-eval'` está **solo** en desarrollo (lo necesita el recargado en caliente de Next). En
  producción no aparece; comprobado sobre `next start`.
- La CSP no nombra api-core ni geo-service: el navegador les habla por `/api` y `/geo` en el
  propio origen. `src/lib/next-config.test.ts` falla si aparece un origen nuevo.
- `HSTS=1` añade `Strict-Transport-Security`, y lo decide `src/proxy.ts` en cada petición (antes
  quedaba fijado al compilar). Solo detrás de HTTPS.

## PWA y service worker

`public/sw.js` se registra desde `src/app/proveedores.tsx` **solo en producción**. Hace tres cosas:

| Petición | Estrategia | Por qué |
|---|---|---|
| Navegación | Red primero; sin red, el shell guardado | Al revés se sirve un HTML viejo que pide fragmentos de JS que ya no existen tras un despliegue, y la app queda en blanco |
| `/geo/v1/capas/*` y `/geo/v1/teselas/*` | Copia fresca (5 min) → revalidación con `If-None-Match` → copia vieja si no hay red | geo-service publica la `version_capa` dentro del `ETag`. Guardar sin mirarlo deja al vecino con los límites viejos **para siempre** en cuanto el administrador activa una versión nueva (`CLAUDE.md` §14.5) |
| `/api/*` | Nunca se cachea | Un reporte viejo es peor que ninguno |

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

## Pruebas end-to-end

Esta app no tiene una suite Playwright propia: el recorrido que la atraviesa (ciudadano reporta →
técnico valida → aparece en el mapa público → sale en la exportación), la accesibilidad de sus
pantallas y los contratos de la API se cubren desde la suite transversal de `e2e/`.

```bash
pnpm db:local          # terminal 1
pnpm db:seed:samples
pnpm --filter e2e test:e2e
```

La Definition of Done de `CLAUDE.md` §4.3 y §4.4 pide además una suite propia por app; queda
pendiente de decidir si aporta algo sobre la transversal o si se consolida allí.
