# web-ciudadano — Parte 1 — Frontend público / experiencia ciudadana

App pública: mapa de puntos de inundación, panel de detalle y formulario de reporte. Especificación
en `CLAUDE.md` §4.3. Implementada (tarea 7 de la Fase 1); el estado y los pendientes están en
[`docs/TRASPASO.md`](../../docs/TRASPASO.md).

```bash
pnpm --filter web-ciudadano dev        # 3000; necesita api-core (3001) y geo-service (3002)
pnpm --filter web-ciudadano test       # Vitest
pnpm --filter web-ciudadano build && pnpm --filter web-ciudadano start   # modo producción
```

Variables: `API_CORE_URL` y `GEO_SERVICE_URL` (destino de los *rewrites* de Next; la app habla con
los servicios por rutas relativas, así que el navegador nunca ve otro origen). Ver `.env.example`.

## Pantallas

La interfaz reproduce el prototipo funcional que entregó el usuario
(«Mi Curichi · Prototipo (compartible).html»), que es la fuente de verdad visual. Cada ruta
corresponde a una pantalla suya:

| Ruta | Pantalla del prototipo | Qué hace |
|---|---|---|
| `/` | C-01 en móvil, W-01 en escritorio | Mapa público. Buscador, filtros de severidad, capas, lista lateral en escritorio |
| `/reporte/:id` | C-02 / W-02 | Detalle de un punto con enlace propio |
| `/reportar` | C-07 a C-12 | Asistente de cinco pasos y confirmación con código de seguimiento |
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

El asistente de cinco pasos guarda un borrador en `sessionStorage` (`src/lib/borrador.ts`). El
caso que lo justifica es el teléfono: al tocar «Agregar» foto el navegador cede el control a la
cámara, y en un móvil con poca memoria eso puede descartar la pestaña. El borrador conserva
también **la clave de idempotencia**, para que reintentar el envío después de una recarga no cree
un segundo reporte. Caduca a las 12 h, antes que el vale de 24 h de las fotos ya subidas, y vive
en la sesión de la pestaña: no queda nada guardado en un teléfono prestado.

## Cabeceras

`next.config.ts` aplica CSP, `Permissions-Policy`, `nosniff`, `X-Frame-Options: DENY` y
`Referrer-Policy`. Dos avisos para quien las toque:

- El mapa base de MapLibre 6 pide las teselas raster con `fetch`, **no** con `<img>`: hace falta
  `connect-src`, con `img-src` solo el mapa queda en negro.
- `'unsafe-eval'` está **solo** en desarrollo (lo necesita el recargado en caliente de Next). En
  producción no aparece; comprobado sobre `next start`.
- `HSTS=1` añade `Strict-Transport-Security`. Solo detrás de HTTPS.

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
