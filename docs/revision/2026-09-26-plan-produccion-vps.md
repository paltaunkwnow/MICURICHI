# Plan de producción en una VPS — 2026-09-26

Estado: **aprobado por el usuario el 2026-09-26.** Reemplaza el plan anterior de la revisión para producción. Se armó con lectores del código, un arquitecto, dos críticos adversariales y un integrador.

## Cómo queda cada pedido

- **A. Imágenes en WebP.** Toda foto nueva la convierte el servidor a WebP de 1600 px por lado como máximo y sin metadatos. Las imágenes de las dos webs (catedral, plano y logo) también pasan a WebP. Las fotos .jpg que ya existen se siguen viendo y no se reconvierten. El único PNG que queda es el ícono de iPhone, porque iOS lo exige.
- **B. Sin etiqueta «solo vos».** No existe en ningún lado. Tu reporte aparece igual para todos, vos incluido, con la misma etiqueta.
- **C. Demora de 1 y 4 minutos.** El reporte llega al servidor en cuanto tocás Enviar, y lo que tarda es que aparezca: 1 minuto el 1.º del día y 4 minutos el 2.º y el 3.º. A medianoche vuelve a 1 minuto. Así ves los errores al momento y no se pierde si cerrás la app. Durante la espera no lo ve nadie, ni los técnicos, y la regla vale para todas las cuentas. Mientras tanto ves una cuenta regresiva.
- **D. Foto solo con la cámara.** No queda ningún botón que abra la galería o los archivos. «Sacar foto» abre la cámara dentro de la página, con Repetir y Usar esta foto. La foto sigue siendo opcional: sin cámara, igual se puede enviar el reporte.
- **E. Ubicación obligatoria y radio de 60 m.** Para reportar tenés que compartir tu ubicación. El punto se puede mover solo dentro de un círculo de 60 m alrededor tuyo, y el servidor lo vuelve a comprobar. Tu posición se usa para esa comprobación y no se guarda. Además, el teléfono tiene que ubicarte con un error de 50 m o menos.
- **F. Permisos solo al reportar.** Al abrir la web no se pide ni se lee nada. La ubicación se pide al tocar «Compartir mi ubicación» dentro del reporte y la cámara al tocar «Sacar foto». El botón del mapa «Ir a mi ubicación» ya no pide permiso: si todavía no lo diste, te dice que la ubicación se pide al reportar.
- **G. Visibles sin moderación con «NO SE HA VERIFICADO».** Pasada la espera, el reporte se ve en el mapa, en las tarjetas y en el detalle con el texto exacto «NO SE HA VERIFICADO». Rechazarlo o fusionarlo lo saca del mapa. Consecuencias aprobadas: los validados dicen «Verificado»; las cifras muestran el total y cuántos están verificados; los puntos críticos y el color de gravedad por barrio cuentan solo verificados, para que un reporte falso no los arme; un admin puede sacar del mapa un reporte ya verificado si resulta inapropiado; el autor ve su propio reporte y su foto aunque estén en espera o rechazados.
- **H. Reglas de CLAUDE.md.** El primer paso reescribe CLAUDE.md con todo esto e indica que se implementa por tandas, con el avance en docs/TRASPASO.md.
- **Lo que ya habíamos decidido y sigue igual.** 3 reportes por cuenta y por día. Fotos: 3 por reporte y 12 por día. Se quita la espera de 60 min. La página pública no se actualiza sola. Técnicos y ejecutivo se actualizan cada 10 s. Pantalla ejecutiva limpia. Mapa en caché. Guarda de disco. CSP al final, separable.

## Tandas

| Tanda | Objetivo |
|---|---|
| T0 | Reglas escritas: CLAUDE.md, ADR 0006 y TRASPASO reflejan lo aprobado antes de tocar código. |
| T1 | Fotos solo desde la cámara dentro de la página, guardadas en WebP con 1600 px por lado como máximo. Las imágenes de las dos webs pasan a WebP. Una foto sin reporte solo la ve quien la subió. |
| T2 | Reportar exige compartir la ubicación y el punto queda a 60 m o menos del teléfono. La web no pide ni lee nada al cargar. |
| T3 | Cupo de 3 reportes y 12 fotos por día, contado en la base. Sin espera de 60 min, idempotencia por cuenta y tope diario de altas por IP. |
| T4 | Publicación sin moderación, con 1 o 4 min de demora y «NO SE HA VERIFICADO». Sin «solo vos». El autor ve lo suyo. El admin puede retirar un verificado. |
| T5 | Técnicos y ejecutivo al día cada 10 s, sin caché. Pantalla ejecutiva limpia. |
| T6 | La página pública no hace tráfico automático. Capas y teselas con huella, cacheadas 1 año. Cifras con 2 min como máximo. |
| T7 | Guarda de disco y alertas de disco y de bandeja sin revisar. |
| T8 | Limpieza en un despliegue posterior: se quita lo deprecado, se aplica la migración de contracción y se escribe la lista «Antes de producción». |
| T9 | CSP con nonce en las dos apps. Separable y postergable. |

## Pasos

### S00 · T0 · CLAUDE.md, ADR 0006, TRASPASO y carpetas de docs

- **Requisito:** H, todos · **Tamaño:** chico
- **Parte y carpetas:** Parte 5 (con autorización del usuario, requisito H) · CLAUDE.md, docs/decisiones/, docs/TRASPASO.md
- **Contrato:** no · **Migración:** no
- **Depende de:** aprobación del plan

Se aplican a CLAUDE.md todos los cambios de cambios_claude_md. En la cabecera va «Cambios aprobados el 2026-09-26; se implementan por tandas T1 a T9; avance en docs/TRASPASO.md». En §5.3 se suman docs/TRASPASO.md y docs/operaciones/ a las carpetas de la Parte 5. Se escribe el ADR 0006: publicación sin moderación previa con demora en el servidor, ubicación del dispositivo con radio de 60 m, cámara dentro de la página y WebP, una VPS con sondeo de 10 s. Se actualiza el índice docs/decisiones/README.md y se agrega a TRASPASO la tabla de tandas. Archivos que toca, para aprobarlos de forma explícita: CLAUDE.md, docs/decisiones/0006-*.md, docs/decisiones/README.md y docs/TRASPASO.md.

**Pruebas:** Revisión manual. Un grep de «moderación previa», «un reporte cada 60», «solo vos», «cada 60 s», «selección manual» y «la que aún no tiene reporte se sirve» no devuelve reglas vigentes.

### S01 · T1 · Contrato 0.8.0: WebP de salida y tope por lado

- **Requisito:** A, D · **Tamaño:** chico
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.7.0 → 0.8.0 (rompe: mime literal) · **Migración:** no
- **Depende de:** S00

CONFIG_DOMINIO suma FOTO_FORMATO_SALIDA = 'image/webp', FOTO_CALIDAD_WEBP = 80 y FOTO_ALTO_MAX_PX = 1600. FOTO_MIME_PERMITIDOS pasa a ser la lista de formatos de entrada. FotoSubidaSchema.mime pasa a z.literal('image/webp'). En OpenAPI, POST /fotos dice «se convierte a WebP, máx. 1600 px por lado, sin metadatos», y GET /fotos/{key} declara image/webp, image/jpeg para las fotos anteriores, y que una foto sin reporte solo la ve quien la subió. Se regeneran openapi.yaml y dominio.json y se agrega la entrada al CHANGELOG.

**Pruebas:** En rojo antes: FotoSubidaSchema rechaza 'image/jpeg' y acepta 'image/webp'; las constantes existen; el OpenAPI lista image/webp.

### S02 · T1 · api-core: WebP, 1600 px por lado y foto sin reporte solo para su dueño

- **Requisito:** A, D · **Tamaño:** mediano
- **Parte y carpetas:** Parte 3 · services/api-core/
- **Contrato:** consume 0.8.0 · **Migración:** no
- **Depende de:** S01

sanitizarImagen: .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: FOTO_CALIDAD_WEBP }), sin withMetadata, y se toma solo el primer cuadro de una entrada animada. La clave pasa a `${uuid}.webp` y el INSERT, el almacén y la respuesta usan 'image/webp'. GET /fotos/:key acepta `^[a-f0-9-]{36}\.(webp|jpg)$`, con jpg solo para las anteriores. Una foto sin reporte se sirve solo si subido_por coincide con la sesión, con 'private, no-store'; a cualquier otro, técnicos incluidos, 404. Las .jpg existentes no se tocan.

**Pruebas:** En rojo antes: un JPEG con EXIF GPS se guarda como RIFF…WEBP. Recorriendo los chunks RIFF (no solo sharp.metadata) no hay EXIF, XMP ni ICCP. El GET da image/webp con nosniff. PNG y WebP de entrada también salen en WebP. Un WebP animado sale con pages = 1. Una imagen de 1200×4000 sale con alto 1600. Una .jpg anterior se sirve como image/jpeg y otra extensión da 404. Una foto sin reporte: 200 para su dueño, 404 para un anónimo, para otra cuenta y para un técnico. Se ajusta fotos.test.ts:119.

### S03 · T1 · web-ciudadano: cámara dentro de la página, sin galería

- **Requisito:** D, F · **Tamaño:** grande
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** consume 0.8.0 · **Migración:** no
- **Depende de:** S01

Componente nuevo CamaraReporte.tsx. Al tocar «Sacar foto», y nunca antes, llama a getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }). Si existe, captura con ImageCapture.takePhoto(); si no, canvas escalado a 1600 px por lado y toBlob('image/jpeg', 0.9). El diálogo atrapa el foco y tiene <video playsinline muted autoplay>, disparo de 48 px usable con teclado, Repetir y Usar esta foto. La miniatura sale de URL.createObjectURL, y un borrador restaurado usa la URL del servidor, que el dueño ve con su cookie. Al cerrar, desmontar, cambiar de paso o caducar la sesión se llama track.stop() en cada pista. Se quitan los inputs #fotos y #foto-camara y la vigilancia del regreso de la cámara, y se simplifica mosaicoDeFotos. Cada error tiene su texto: sin navigator.mediaDevices («Este navegador no permite usar la cámara: abrí la página en Chrome o Safari»), NotAllowedError, NotFoundError («podés enviar el reporte sin foto») y contexto no seguro. La foto sigue siendo opcional. next.config.ts: Permissions-Policy 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()'.

**Pruebas:** En rojo antes (Vitest con getUserMedia simulado): no se llama al montar el mapa ni el formulario; se pide con width ideal 1920; con mediaDevices undefined aparece la rama de navegador sin cámara; NotAllowed y NotFound muestran su texto y se puede enviar sin foto; stop() en cada pista al cerrar; ningún input[type=file] en la página; next-config.test comprueba camera=(self).

### S04 · T1 · web-ciudadano: imágenes propias en WebP

- **Requisito:** A · **Tamaño:** chico
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** no · **Migración:** no
- **Depende de:** S00

santa-cruz-catedral.jpg pasa a .webp y logo.png pasa a logo.webp en BarraSuperior y Bienvenida. Se convierten una vez con sharp y se versiona el resultado. logo.png queda solo como apple-touch-icon en layout.tsx, porque iOS lo exige. Se revisan manifest.webmanifest y sw.js por si listan los nombres viejos.

**Pruebas:** En rojo antes: prueba que recorre public/ y src/ y no encuentra referencias a .jpg ni .png, salvo el apple-touch-icon.

### S05 · T1 · panel-admin: imágenes propias en WebP

- **Requisito:** A · **Tamaño:** chico
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** no · **Migración:** no
- **Depende de:** S00

plano-zonificacion.jpg pasa a .webp, calidad alta, verificando que se lea a simple vista, tanto en la vista como en la descarga. logo.png pasa a logo.webp en BarraLateral.

**Pruebas:** En rojo antes: la misma prueba de public/ y src/ sin .jpg ni .png.

### S06 · T1 · E2E con cámara simulada

- **Requisito:** A, D · **Tamaño:** mediano
- **Parte y carpetas:** Parte 5 · e2e/
- **Contrato:** no · **Migración:** no
- **Depende de:** S02, S03

playwright.config.ts agrega --use-fake-ui-for-media-stream y --use-fake-device-for-media-stream y otorga el permiso 'camera' solo en los tests que reportan. En formulario-sumidero-y-fotos.spec y resiliencia-interfaz.spec, setInputFiles('#fotos') pasa a ser el disparo de la cámara.

**Pruebas:** Desktop Chrome y Pixel 7 sacan foto. El GET responde image/webp. El ancho guardado coincide con videoWidth hasta 1600. No hay ningún input[type=file]. La foto sin reporte da 404 desde otro contexto sin sesión.

### S07 · T2 · Contrato 0.9.0: ubicación del dispositivo y 60 m

- **Requisito:** E · **Tamaño:** mediano
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.8.0 → 0.9.0 (rompe: dispositivo obligatorio) · **Migración:** no
- **Depende de:** S00

CONFIG_DOMINIO: REPORTE_RADIO_DISPOSITIVO_M = 60, PRECISION_DISPOSITIVO_MAX_M = 50 (decisión del usuario) y POSICION_ANTIGUEDAD_MAX_S = 600 <a confirmar>. Nuevo src/dominio/geo.ts con distanciaMetros (haversine) y dentroDelRadio. ReporteCrearSchema suma dispositivo obligatorio { lat, lon, precision_m 0..10000, antiguedad_s ≥ 0 } y deja de recibir ubicacion_metodo y precision_gps_m. Códigos 422 UBICACION_FUERA_DE_RADIO, PRECISION_INSUFICIENTE y POSICION_VENCIDA. ReporteTecnico suma distancia_dispositivo_m. NOTA_METODOLOGICA suma la limitación de §9.5 «El radio de 60 m no prueba que el vecino estuviera en el lugar: el GPS del teléfono se puede falsear», que así llega al campo nota_metodologica y al encabezado del CSV de toda exportación (agregado en la revisión de T0 y T1). OpenAPI y CHANGELOG.

**Pruebas:** En rojo antes: NOTA_METODOLOGICA contiene la frase del radio de 60 m; dentroDelRadio acepta 59 y 60 m y rechaza 61 m; haversine contra valores conocidos a la latitud de Santa Cruz; precision_m = 80 pasa Zod; sin dispositivo falla; los 422 están en el OpenAPI.

### S08 · T2 · Migración 0013: distancia al dispositivo

- **Requisito:** E · **Tamaño:** chico
- **Parte y carpetas:** Parte 4 · packages/db/
- **Contrato:** no · **Migración:** 0013_distancia_dispositivo.sql
- **Depende de:** S07

0013_distancia_dispositivo.sql: reporte_inundacion.distancia_dispositivo_m smallint NULL con CHECK de 0 a 1000. Se actualiza Drizzle.

**Pruebas:** Migra desde cero y desde 0012 con filas existentes, y es idempotente. pnpm privilegios.

### S09 · T2 · api-core: radio, precisión y antigüedad sin guardar la posición

- **Requisito:** E · **Tamaño:** mediano
- **Parte y carpetas:** Parte 3 · services/api-core/
- **Contrato:** consume 0.9.0 · **Migración:** no (usa 0013)
- **Depende de:** S07, S08

Después de Zod y antes del resolver se revisa: precisión mayor al máximo, PRECISION_INSUFICIENTE; antigüedad mayor al máximo, POSICION_VENCIDA; distancia mayor a 60 m + 0,5 m, UBICACION_FUERA_DE_RADIO. Todos son 422, no consumen cupo y suman a la métrica curichi_reportes_fuera_de_radio_total. Se guardan precision_gps_m y distancia_dispositivo_m redondeada. ubicacion_metodo lo deriva el servidor: 'gps' con 2 m o menos, 'manual' en otro caso. dispositivo sale de la huella de idempotencia. pino redacta body.dispositivo y la auditoría no lo incluye. Se ajustan test/ayudas.ts y los payloads.

**Pruebas:** En rojo antes: a 61 m da 422 sin reporte ni cupo gastado; a 60 m se crea; con precisión de 80 m, 422 PRECISION_INSUFICIENTE (no 400); un reintento con otra antiguedad_s da Idempotent-Replay; ni la fila ni el log capturado contienen la lat/lon del dispositivo.

### S10 · T2 · web-ciudadano: paso 1 anclado al GPS y nada al cargar

- **Requisito:** E, F · **Tamaño:** grande
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** consume 0.9.0 · **Migración:** no
- **Depende de:** S07

Paso 1: pantalla «Para reportar necesitamos tu ubicación» con el botón «Compartir mi ubicación». Después watchPosition (enableHighAccuracy, maximumAge 0) con «Precisión actual: N m» hasta llegar al máximo o 30 s; si no llega, «Salí a un lugar abierto» con Reintentar. El mapa arranca en el ancla, con el círculo de 60 m y el marcador recortado a él: se mueve arrastrando, con las flechas, con los botones «mover 5 m» o escribiendo coordenadas («Ese punto está a N m de vos»). Si se niega el permiso, un bloqueo con instrucciones y permissions.query().onchange. Al enviar se relee la posición: si la nueva deja el punto fuera del radio, vuelve al paso 1 con «Te moviste N m: ajustá el punto»; si falla la lectura, se usa la última vigente. antiguedad_s se limita a [0, ∞), con 0 si el timestamp viene del futuro, y queda congelada para los reintentos. «Me pasa a mí» usa el punto del enlace solo si está a 60 m o menos. Un borrador retomado vuelve a pedir la posición. Se quitan ubicacionDesdeGps de 10 km y PRECISION_GPS_MAX_M. useUbicacionUsuario pasa a automatica=false. «Ir a mi ubicación» consulta el permiso al tocarlo: si está concedido centra el mapa, y si no, muestra «Tu ubicación se pide solo al reportar un punto» junto a «Reportar un punto», sin disparar ningún aviso del navegador.

**Pruebas:** En rojo antes (Vitest): montar la portada y el mapa no llama a geolocation; «Ir a mi ubicación» sin permiso no llama a geolocation; el recorte al círculo; las coordenadas a 80 m se rechazan; puedeAvanzar(1) es false sin ancla o con precisión mala; moverse 70 m antes de enviar vuelve al paso 1; un timestamp del futuro da antiguedad_s 0; el envío lleva la antigüedad congelada; con NotAllowed aparece el bloqueo.

### S11 · T2 · panel-admin: método, precisión y distancia

- **Requisito:** E · **Tamaño:** chico
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** consume 0.9.0 · **Migración:** no
- **Depende de:** S07

etiquetaMetodo: 'gps' se muestra como «En la posición del GPS» y 'manual' como «Ajustado a mano, a ≤ 60 m del GPS». El detalle muestra la precisión y la distancia al dispositivo.

**Pruebas:** En rojo antes: formato.test y el detalle muestran «a 12 m del GPS».

### S12 · T2 · E2E de ubicación obligatoria y permisos

- **Requisito:** E, F · **Tamaño:** mediano
- **Parte y carpetas:** Parte 5 · e2e/
- **Contrato:** no · **Migración:** no
- **Depende de:** S09, S10

ayudas.ts y todos los recorridos de reporte usan geolocation concedida con una precisión de 10 m y puntos a 60 m o menos de PUNTO_CENTRO. Hoy son unos 18 usos, en ayudas, formulario-reporte, formulario-sumidero-y-fotos, quitar-campos-web, recorrido-completo, resiliencia-interfaz y mapa-seleccion. Casos nuevos: con el permiso negado no se reporta; las coordenadas a 80 m se rechazan en la interfaz; un POST directo con el punto a 80 m da 422; con 200 m de precisión no se avanza; al cargar la portada no hay llamadas a geolocation ni a getUserMedia (espía con addInitScript).

**Pruebas:** pnpm test:e2e en verde en escritorio y en móvil.

### S13 · T3 · Contrato 0.10.0: cupo diario y altas por IP

- **Requisito:** cupo (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.9.0 → 0.10.0 · **Migración:** no
- **Depende de:** S00

REPORTES_POR_DIA_POR_CUENTA = 3, FOTOS_POR_DIA_POR_CUENTA = 12 y ALTAS_POR_DIA_POR_IP = 10 <a confirmar>, por día calendario en ZONA_HORARIA. MINUTOS_ENTRE_REPORTES_POR_CUENTA y FOTOS_POR_HORA_POR_CUENTA quedan @deprecated. SesionActual suma reportes_restantes_hoy, y puede_reportar_desde pasa a ser null o la próxima medianoche local. OpenAPI con los 429 diarios y CHANGELOG.

**Pruebas:** En rojo antes: las constantes valen 3, 12 y 10, y SesionActual exige reportes_restantes_hoy.

### S14 · T3 · Migración 0014: cuota diaria

- **Requisito:** cupo (decisión previa) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 4 · packages/db/
- **Contrato:** no · **Migración:** 0014_cuota_diaria.sql
- **Depende de:** S13

0014_cuota_diaria.sql: cuota_reporte_diaria(usuario_id FK ON DELETE CASCADE, dia date, reportes_n smallint, fotos_n smallint, actualizado_en, PK (usuario_id, dia)) con GRANT SELECT, INSERT, UPDATE y DELETE a curichi_api. No toca ultimo_reporte_en ni la tabla de idempotencia. ejecutarMantenimiento borra las cuotas de días anteriores según la zona horaria. Drizzle y verificar-privilegios.

**Pruebas:** En rojo antes: migrar desde cero y desde 0013 con filas; pnpm privilegios; el mantenimiento a las 21:00 de La Paz, con la base en UTC, borra la fila de ayer y conserva la de hoy.

### S15 · T3 · api-core: 3 reportes y 12 fotos por día, idempotencia por cuenta, altas por IP

- **Requisito:** cupo (decisión previa) · **Tamaño:** grande
- **Parte y carpetas:** Parte 3 · services/api-core/
- **Contrato:** consume 0.10.0 · **Migración:** no (usa 0014)
- **Depende de:** S14

cuota.ts: INSERT … ON CONFLICT DO UPDATE … WHERE reportes_n < max RETURNING reportes_n, dentro de la transacción y después de la idempotencia; exporta n para T4. Las fotos reservan fotos_n antes de sharp y lo liberan si el procesamiento falla; la limpieza de huérfanas no lo toca. La idempotencia guarda la clave como `${usuario_id}:${clave}` en la PK actual, sin migración. El alta de cuentas suma un tope diario por IP contado en intento_login, además del límite por hora. /auth/yo devuelve reportes_restantes_hoy. El 429 dice «Ya enviaste los 3 reportes de hoy. Vas a poder enviar otro mañana» con Retry-After hasta la medianoche. Se deja de usar ultimo_reporte_en. liberarCuota de las pruebas pasa a la tabla nueva. README y .env.example.

**Pruebas:** En rojo antes: el 4.º reporte da 429; 50 envíos concurrentes dejan exactamente 3; una fila de ayer no bloquea; 23:59 y 00:01 locales caen en días distintos; un replay no incrementa; FOTOS_INVALIDAS devuelve el turno; la 13.ª foto da 429 aunque se hayan borrado las huérfanas; la misma clave en dos cuentas crea dos reportes; una clave vieja sin prefijo sigue sin romper nada; la 11.ª alta del día desde una IP da 429.

### S16 · T3 · web-ciudadano: «Te quedan N de 3 reportes hoy»

- **Requisito:** cupo (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** consume 0.10.0 · **Migración:** no
- **Depende de:** S13

sesion.tsx expone reportesRestantesHoy. Al tocar «Reportar un punto» se revalida /auth/yo y, si quedan 0, se avisa antes de pedir ubicación o cámara. El formulario y PanelCuenta muestran «Te quedan N de 3 reportes hoy». Se quitan los textos «cada 60 minutos» y el de fotos pasa a decir «12 fotos por día».

**Pruebas:** En rojo antes: con 0 restantes no se llama a geolocation y aparece el aviso; «Te quedan 1 de 3»; errores.test.

### S17 · T3 · E2E y variables del cupo diario

- **Requisito:** cupo (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 5 · e2e/, docker-compose.yml, .env.example, turbo.json
- **Contrato:** no · **Migración:** no
- **Depende de:** S15, S16

cuenta-ciudadana.spec: el 4.º envío da 429 y cambiar las cabeceras de IP no suma turnos. Se revisan las specs que reportan con cuentas compartidas o sembradas y se pasan a cuentas nuevas por caso. REPORTES_POR_DIA_POR_CUENTA=3 queda fijo en la pila de E2E y documentado en e2e/README. Variables nuevas en docker-compose.yml, .env.example y turbo.json. REPORTE_MINUTOS_ENTRE_ENVIOS queda deprecada.

**Pruebas:** pnpm test:e2e en verde también con --retries=2 y --repeat-each=2 sin agotar el cupo; docker compose config muestra las variables.

### S18 · T4 · Contrato 0.11.0: publicación sin moderación, etiqueta, demora y retiro de verificados

- **Requisito:** G, C, B · **Tamaño:** mediano
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.10.0 → 0.11.0 · **Migración:** no
- **Depende de:** S13

ESTADOS_PUBLICOS = ['nuevo','validado','resuelto'] y ReportePublico.estado = z.enum(ESTADOS_PUBLICOS). Se suma verificado: boolean. ETIQUETAS.estado_publico: nuevo «NO SE HA VERIFICADO», validado «Verificado», resuelto «Resuelto». NOTA_METODOLOGICA suma la frase sobre los no verificados. AgregadoUv suma n_verificados y severidad_max_verificada. DEMORA_PUBLICACION_PRIMERO_S = 60 y DEMORA_PUBLICACION_SIGUIENTES_S = 240. El POST (201 y replay) responde publicar_en y segundos_para_publicar, y SesionActual suma demora_proximo_s. GET /mis-reportes devuelve la vista pública más estado, verificado, publicar_en y retirado. TRANSICIONES suma validado → rechazado, solo para admin y con motivo. OpenAPI (fotos: autor y dueño; /mis-reportes) y CHANGELOG.

**Pruebas:** En rojo antes: ESTADOS_PUBLICOS sin rechazado ni duplicado; ReportePublico rechaza 'rechazado'; la etiqueta es exactamente «NO SE HA VERIFICADO»; las demoras valen 60 y 240; validado → rechazado se permite solo a admin; ningún texto contiene «solo vos».

### S19 · T4 · Migración 0015: publicar_en, índices públicos y freno a publicar lo anterior

- **Requisito:** C, G · **Tamaño:** mediano
- **Parte y carpetas:** Parte 4 · packages/db/
- **Contrato:** no · **Migración:** 0015_publicacion_sin_moderacion.sql
- **Depende de:** S18

0015_publicacion_sin_moderacion.sql. (1) Si hay filas en 'nuevo' y current_setting('curichi.publicar_nuevos_existentes', true) no es 'si', hace RAISE EXCEPTION con el conteo y la instrucción de moderarlas o migrar con la bandera. (2) ADD COLUMN publicar_en timestamptz NULL; UPDATE publicar_en = creado_en; SET DEFAULT now(); SET NOT NULL; ADD CONSTRAINT CHECK (publicar_en >= creado_en AND publicar_en <= creado_en + interval '1 hour'). (3) Se recrean reporte_geom_publico_gist y reporte_agregado_uv con WHERE estado IN ('nuevo','validado','resuelto') y publicar_en en el INCLUDE, con el bloqueo documentado. El CLI migrar suma --publicar-nuevos-existentes (SET LOCAL). Drizzle y samples.ts (publicar_en = creado_en). El DBSCAN no cambia.

**Pruebas:** En rojo antes: migrar desde 0014 con filas de creado_en = now() - 2 days en todos los estados (sin 'nuevo': pasa, y cada publicar_en = creado_en); con un 'nuevo' aborta y con la bandera pasa; desde cero; el EXPLAIN de la consulta exacta que emite api-core (con parámetros y plan genérico) usa reporte_geom_publico_gist; el agregado sigue siendo Index Only Scan; pnpm privilegios.

### S20 · T4 · api-core: vista pública sin moderación, demora de 1 o 4 min, fotos del autor y Mis reportes

- **Requisito:** G, C, B · **Tamaño:** grande
- **Parte y carpetas:** Parte 3 · services/api-core/
- **Contrato:** consume 0.11.0 · **Migración:** no (usa 0015)
- **Depende de:** S18, S19, S15

condicionPublico (literal generado desde ESTADOS_PUBLICOS y publicar_en <= now()) y condicionPublicado se aplican en armarWhere (vistas pública, técnica y exportación), en los detalles, en indicadores (también por_estado), en SQL_RESUMEN del ejecutivo, en el FOR UPDATE de moderación (404 mientras espera) y en fotos. El INSERT fija publicar_en con el n de S15. El POST y el replay devuelven publicar_en y segundos_para_publicar calculados en la base, y /auth/yo devuelve demora_proximo_s. Fotos: publicadas con 'public, no-cache' y ETag, comprobando la visibilidad antes del 304; el autor ve las suyas en cualquier estado con 'private, no-store'; el resto da 404 con no-store. GET /mis-reportes pide sesión, filtra por autor, trae 50 como máximo, 'private, no-store' y Vary: Cookie. La moderación permite validado → rechazado solo a admin. Métrica curichi_reportes_sin_verificar_antiguedad_segundos. REPORTE_DEMORA_PRIMERO_S y REPORTE_DEMORA_SIGUIENTES_S (0 a 3600): test/ayudas.ts arranca con 0 y 0, y solo la suite de publicación diferida usa demoras reales o publicarYa. La auditoría de crear registra publicar_en.

**Pruebas:** En rojo antes: 60 s en el 1.º reporte y 240 s en el 2.º y el 3.º; dos POST simultáneos dan 60 y 240; un replay devuelve el mismo publicar_en. Prueba de tabla: un reporte en espera no aparece en /reportes, /reportes/:id, /tecnico/reportes(/:id), /exportar csv y geojson, /indicadores, /ejecutivo/resumen ni /fotos/:key (404 para otra cuenta y para el técnico, 200 para el autor), y el PATCH da 404; con publicarYa aparece en todas. Un anónimo ve un nuevo con verificado=false y sin autor. Rechazado y duplicado dan 404 al público, y el autor sigue viendo su foto. Una foto rechazada con If-None-Match da 404, no 304. El admin retira un validado y el técnico recibe 403. /mis-reportes solo devuelve lo propio y da 401 sin sesión.

### S21 · T4 · geo-service: agregados con no verificados, n_verificados y severidad verificada

- **Requisito:** G, C · **Tamaño:** chico
- **Parte y carpetas:** Parte 4 · services/geo-service/
- **Contrato:** consume 0.11.0 · **Migración:** no
- **Depende de:** S18, S19

Los agregados por UV cuentan nuevo, validado y resuelto con publicar_en <= now() (literal generado desde ESTADOS_PUBLICOS). Suman n_verificados y severidad_max_verificada, ambos solo con validado y resuelto. /puntos-criticos no cambia.

**Pruebas:** En rojo antes: un nuevo publicado suma a n_reportes y no a n_verificados; un nuevo de más de 70 cm no cambia severidad_max_verificada; uno en espera no suma; rechazado y duplicado no suman; la respuesta cumple AgregadoUvSchema 0.11.0.

### S22 · T4 · web-ciudadano: «NO SE HA VERIFICADO», cuenta regresiva y Mis reportes

- **Requisito:** G, C, B · **Tamaño:** grande
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** consume 0.11.0 · **Migración:** no
- **Depende de:** S18

ChipEstado muestra «NO SE HA VERIFICADO» con texto visible, color de aviso e icono, con contraste AA, en el detalle y en TarjetaReporte. Las pastillas del mapa llevan el icono y el aria-label «Punto de severidad X, no se ha verificado», y la leyenda del mapa muestra el icono junto al texto exacto «NO SE HA VERIFICADO». La coropleta usa severidad_max_verificada y pinta neutras las UV sin verificados. Se reescriben los textos de moderación previa en Bienvenida, ComoFunciona, Portada, FormularioReporte, reporte/[id], VistaMapa, SeguimientoReporte y MisReportes: el 404 pasa a decir «retirado del mapa o sumado a otro punto» y «puntos publicados» pasa a «puntos reportados». Antes de enviar se avisa «Se publica 1 minuto después de enviarlo» (o 4). La confirmación muestra la cuenta regresiva y después «Ya está publicado · recargá el mapa para verlo». MisReportes y SeguimientoReporte usan GET /mis-reportes. Se borra la clave localStorage curichi.mis-reportes.v1 y, al perder la sesión, se hace removeQueries. No hay ninguna etiqueta «solo vos».

**Pruebas:** En rojo antes: el texto literal «NO SE HA VERIFICADO» aparece en la tarjeta, en el detalle y en la leyenda del mapa; la pastilla tiene el aria-label; con el reloj simulado 10 min adelantado, 240 s muestran 4:00 y después «Ya está publicado»; el aviso previo dice 4 con demora_proximo_s = 240; ningún texto del bundle contiene «antes de publicarlo» ni «solo vos»; la clave vieja de localStorage desaparece.

### S23 · T4 · panel-admin: avisos de publicación y retiro de verificados

- **Requisito:** G · **Tamaño:** chico
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** consume 0.11.0 · **Migración:** no
- **Depende de:** S18

El detalle de un nuevo dice «Visible en el mapa público como NO SE HA VERIFICADO». Rechazar dice «Lo retira del mapa público». La bandeja avisa que los nuevos ya son públicos. Para el admin se suma «Retirar del mapa» en un validado, con motivo obligatorio.

**Pruebas:** En rojo antes: el texto del detalle según el estado; «Retirar del mapa» visible solo para admin en un validado.

### S24 · T4 · E2E: publicación diferida y etiqueta

- **Requisito:** G, C, B · **Tamaño:** mediano
- **Parte y carpetas:** Parte 5 · e2e/, docker-compose.yml, .env.example, turbo.json
- **Contrato:** no · **Migración:** no
- **Depende de:** S20, S21, S22, S23

La pila de Playwright arranca con REPORTE_DEMORA_PRIMERO_S=2 y REPORTE_DEMORA_SIGUIENTES_S=4. e2e/tests/ayudas.ts suma esperarPublicacion(id), con expect.poll sobre el detalle técnico. Se aplica en todas las specs que crean y después moderan o consultan; según el grep de hoy: recorrido-completo, panel-tecnico, panel-ejecutivo, quitar-campos-panel, quitar-campos-web, separacion-publica-tecnica, api-contratos, cuenta-ciudadana, datos-reales, mapa-seleccion, formulario-reporte y resiliencia-interfaz. El paso vuelve a correr el grep y lista el resultado. Spec nueva publicacion-diferida: la cuenta A envía; B y el técnico no lo ven enseguida; en 10 s o menos lo ven con «NO SE HA VERIFICADO»; A sí ve su foto durante la espera; el 2.º envío tarda más. recorrido-completo: validar lo pasa a «Verificado»; rechazar da 404 en el detalle y en la foto. separacion-publica-tecnica acepta nuevo, validado y resuelto. Variables en docker-compose.yml, .env.example y turbo.json, y e2e/README.

**Pruebas:** En rojo contra la pila actual y en verde después de T4, también con --repeat-each=3, sin fallas intermitentes.

### S25 · T5 · api-core: ejecutivo e indicadores sin caché

- **Requisito:** técnicos y ejecutivo (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 3 · services/api-core/
- **Contrato:** no · **Migración:** no
- **Depende de:** S20

Se quitan TTL_RESUMEN_MS, el Map, X-Cache y el TTL de 30 s de indicadores. Queda la deduplicación en vuelo con contador de generación. Se confirma que x-curichi-sondeo no renueva la inactividad.

**Pruebas:** En rojo antes: después de publicarYa, en_revision e /indicadores suben sin esperar; diez GET simultáneos hacen un solo cálculo.

### S26 · T5 · panel-admin: sondeo cada 10 s marcado como sondeo

- **Requisito:** técnicos y ejecutivo (decisión previa) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** no · **Migración:** no
- **Depende de:** S25

Bandeja, detalle, indicadores y ejecutivo con refetchInterval 10000, refetchIntervalInBackground false y staleTime 0. La meta de TanStack agrega x-curichi-sondeo: 1. La geometría sigue con staleTime Infinity.

**Pruebas:** En rojo antes (temporizadores simulados): a los 10 s vuelve a pedir con la cabecera; con la pestaña oculta no pide; las capas no se vuelven a pedir.

### S27 · T5 · panel-admin: pantalla ejecutiva limpia

- **Requisito:** ejecutivo (decisión previa) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** no · **Migración:** no
- **Depende de:** S26

Queda la cifra grande con «N verificadas · M en revisión», las pestañas de severidad, «Inundaciones activas por distrito» con «Otros», «Cómo va el trabajo» y la nota metodológica en una línea. Sale el mapa, el selector de período (ventana 'todo'), «actualizado hace…», «Último reporte» y los textos de ayuda. La tabla «De una capa anterior» se muda a Indicadores.

**Pruebas:** En rojo antes (PanelEjecutivo.test): no está lo que sale; sí el total, las pestañas y las dos gráficas; las barras más «Otros» suman activas.total; la tabla aparece en Indicadores.

### S28 · T5 · E2E: panel al día sin recargar

- **Requisito:** técnicos y ejecutivo (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 5 · e2e/
- **Contrato:** no · **Migración:** no
- **Depende de:** S26, S27

El técnico ve un reporte publicado en 15 s o menos sin recargar, y el ejecutivo ve subir «en revisión». panel-ejecutivo.spec pasa a la pantalla limpia.

**Pruebas:** Las specs en verde a través de Caddy.

### S29 · T6 · Contrato 0.12.0: capas y teselas con huella

- **Requisito:** cachés (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.11.0 → 0.12.0 (no rompe) · **Migración:** no
- **Depende de:** S00

CapaInfo.url lleva la huella. Rutas /geo/v1/capas/{capa}/v/{huella} y /geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt, y 410 CAPA_CAMBIO. Las rutas sin huella se documentan como alias. CHANGELOG.

**Pruebas:** En rojo antes: el OpenAPI tiene la huella y el 410.

### S30 · T6 · geo-service: huella del contenido servido y cifras con 2 min como máximo

- **Requisito:** cachés (decisión previa) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 4 · services/geo-service/
- **Contrato:** consume 0.12.0 · **Migración:** no
- **Depende de:** S29

La huella es el sha del GeoJSON en memoria. versionesVigentes suma cargado_en. Con la huella vigente, 'public, max-age=31536000, immutable' y ETag; con una vieja, 410 con no-store. Los alias, /capas y /capas/vigentes van con 'public, no-cache'. Agregados y puntos críticos: TTL de 100 s, edad máxima de 120 s y 'public, no-cache'. Variable GEO_CACHE_AGREGADOS_EDAD_MAX_MS.

**Pruebas:** En rojo antes: recargar la misma versión con otro contenido cambia la huella; una huella vieja da 410; a los 121 s simulados se recalcula.

### S31 · T6 · web-ciudadano: sin tráfico automático y service worker v6

- **Requisito:** público sin refresco (decisión previa) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** consume 0.12.0 · **Migración:** no
- **Depende de:** S30

QueryClient sin refetchOnWindowFocus, refetchOnReconnect ni refetchInterval, y staleTime Infinity para reportes, agregados y detalle. sw.js v6: capas y teselas con huella primero de la caché; al activar borra las huellas viejas; ante un 410 vuelve a pedir /geo/v1/capas. El worker de MapLibre y los glifos llevan ?v= y se sirven immutable.

**Pruebas:** En rojo antes: un foco a los 60 s no dispara otro GET; sw.test comprueba la caché con huella y el borrado de las viejas; un 410 recarga CapaInfo.

### S32 · T6 · panel-admin: capas por CapaInfo.url

- **Requisito:** cachés (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** consume 0.12.0 · **Migración:** no
- **Depende de:** S30

Se quita la URL escrita a mano en api.ts:335 y se usa CapaInfo.url.

**Pruebas:** En rojo antes: la URL sale de CapaInfo.

### S33 · T6 · E2E: cero tráfico automático público

- **Requisito:** público sin refresco (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 5 · e2e/
- **Contrato:** no · **Migración:** no
- **Depende de:** S31

Con la página pública abierta 3 min y cambios de foco no se pide /api/v1/reportes ni /geo/v1/agregados. Una tesela con huella responde immutable.

**Pruebas:** En rojo contra la pila actual.

### S34 · T7 · Contrato 0.13.0: 507 SIN_ESPACIO

- **Requisito:** disco (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.12.0 → 0.13.0 (no rompe) · **Migración:** no
- **Depende de:** S00

OpenAPI: POST /fotos con 507 SIN_ESPACIO y /ready con fotos: 'poco_espacio'. CHANGELOG.

**Pruebas:** En rojo antes: el OpenAPI lista el 507.

### S35 · T7 · api-core: guarda de espacio en disco

- **Requisito:** disco (decisión previa) · **Tamaño:** chico
- **Parte y carpetas:** Parte 3 · services/api-core/
- **Contrato:** consume 0.13.0 · **Migración:** no
- **Depende de:** S34, S15

AlmacenDisco.espacioLibre() con statfs y FOTOS_MIN_LIBRE_BYTES (propuesto 2 GiB). Por debajo, 507 antes de sharp y sin reservar turno, y /ready degradado. Métricas curichi_fotos_disco_libre_bytes y curichi_fotos_disco_total_bytes.

**Pruebas:** En rojo antes: con statfs simulado bajo el umbral, 507 sin llamar a sharp ni reservar fotos_n, y /ready degradado.

### S36 · T7 · Variables, alertas y guía de la VPS

- **Requisito:** disco y bandeja sin revisar · **Tamaño:** chico
- **Parte y carpetas:** Parte 5 · docker-compose.yml, .env.example, turbo.json, infra/, docs/operaciones/
- **Contrato:** no · **Migración:** no
- **Depende de:** S35, S30, S20

FOTOS_MIN_LIBRE_BYTES y GEO_CACHE_AGREGADOS_EDAD_MAX_MS en docker-compose.yml, .env.example y turbo.json. Reglas de Alertmanager: disco de fotos bajo el umbral y reporte sin verificar más antiguo que X horas <a confirmar con el municipio>, sobre curichi_reportes_sin_verificar_antiguedad_segundos. En produccion.md, el disco de la VPS pasa a ser el modo oficial y se corrigen las líneas 643-645 y la tabla de cachés.

**Pruebas:** docker compose config muestra las variables; promtool check rules en verde.

### S37 · T8 · Contrato 0.14.0: quitar lo deprecado

- **Requisito:** limpieza · **Tamaño:** chico
- **Parte y carpetas:** Transversal (custodia Parte 3) · packages/contracts/
- **Contrato:** sí, 0.13.0 → 0.14.0 (rompe, sin consumidores restantes) · **Migración:** no
- **Depende de:** S17, S24

Se quitan MINUTOS_ENTRE_REPORTES_POR_CUENTA, FOTOS_POR_HORA_POR_CUENTA y todo lo marcado @deprecated. CHANGELOG.

**Pruebas:** pnpm typecheck del monorepo; un grep de los nombres quitados no encuentra nada.

### S38 · T8 · Migración 0016 de contracción (despliegue posterior)

- **Requisito:** limpieza · **Tamaño:** chico
- **Parte y carpetas:** Parte 4 · packages/db/
- **Contrato:** no · **Migración:** 0016_contraccion.sql
- **Depende de:** S15, S20

0016_contraccion.sql: REVOKE y DROP COLUMN usuario.ultimo_reporte_en, y ALTER COLUMN publicar_en DROP DEFAULT. Drizzle y verificar-privilegios. Va en un release posterior a T3 y T4, y produccion.md lo documenta.

**Pruebas:** En rojo antes: migrar desde cero y desde 0015 con filas antiguas; un INSERT sin publicar_en falla; pnpm privilegios; la suite de api-core en verde.

### S39 · T8 · Documentación de operación y lista «Antes de producción»

- **Requisito:** H, todos · **Tamaño:** chico
- **Parte y carpetas:** Parte 5 · docs/operaciones/, docs/seguridad/, docs/TRASPASO.md, e2e/README.md
- **Contrato:** no · **Migración:** no
- **Depende de:** S37, S38

produccion.md suma «Antes de producción», con los bloqueantes primero. Se actualizan docs/seguridad/modelo-de-seguridad.md, docs/operaciones/manual.md (cupo diario, demora, etiqueta, permisos, bandera de migración) y e2e/README. TRASPASO marca las tandas cerradas.

**Pruebas:** Un grep de «un reporte cada 60», «moderación previa», «solo vos» y «ancho máximo 1600» solo aparece en el historial.

### S40 · T9 · CSP con nonce en web-ciudadano

- **Requisito:** seguridad (decisión previa, separable) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 1 · apps/web-ciudadano/
- **Contrato:** no · **Migración:** no
- **Depende de:** S31, S03

script-src con nonce por petición y 'strict-dynamic', sin 'unsafe-inline'. Se conservan blob: en img-src (miniatura de la cámara) y connect-src sin comodines.

**Pruebas:** En rojo antes: sin 'unsafe-inline' y el nonce cambia entre peticiones. Playwright sin violaciones con el mapa, la cámara falsa y el formulario.

### S41 · T9 · CSP con nonce en panel-admin

- **Requisito:** seguridad (decisión previa, separable) · **Tamaño:** mediano
- **Parte y carpetas:** Parte 2 · apps/panel-admin/
- **Contrato:** no · **Migración:** no
- **Depende de:** S27

Lo mismo que S40 para el panel.

**Pruebas:** En rojo antes: sin 'unsafe-inline'. Playwright sin violaciones en la bandeja, el detalle y el ejecutivo con el sondeo activo.

## Decisiones de arquitectura

- **La demora es de publicación y la decide el servidor. publicar_en se fija en el INSERT: now() + 60 s si n = 1 y now() + 240 s si n ≥ 2. n es el RETURNING del contador atómico de la cuota diaria, en la misma transacción. No hay ningún proceso que publique: la regla es un filtro (publicar_en <= now()). El usuario la aprobó.** Así no se puede saltar: curl o un cliente modificado no adelantan la publicación. El reporte no se pierde al cerrar la app, porque el borrador está en sessionStorage y el service worker no encola POST. Los errores (cobertura, 60 m, cupo) se ven al momento. Dos envíos simultáneos reciben 60 y 240 s sin carrera. Un reintento idempotente devuelve el mismo publicar_en. El cliente muestra los segundos restantes que calcula la base, no los del reloj del teléfono. *Cómo crece:* Todo el estado está en la base, así que vale con N réplicas. Las demoras son constantes del contrato y variables solo para pruebas. «Anular envío» queda en el backlog: sería una ruta que marca el reporte mientras publicar_en > now().
- **La visibilidad vive en un solo lugar. ESTADOS_PUBLICOS = nuevo, validado y resuelto. condicionPublico (estado IN (<literal generado desde ESTADOS_PUBLICOS>) AND publicar_en <= now()) y condicionPublicado (publicar_en <= now()) se usan en la vista pública, la técnica, la exportación, indicadores, ejecutivo, moderación FOR UPDATE, fotos y agregados. Una prueba de tabla recorre todas las rutas.** Hoy el literal ('validado','resuelto') está repetido en unos 10 lugares y ESTADOS_PUBLICOS no se usa en ninguno. El fragmento se arma con el literal SQL y no con ANY($n) (crítica de producción aceptada): con un plan genérico, PostgreSQL no puede demostrar que se cumple el predicado del índice parcial. now() no puede ir en el predicado del índice, así que publicar_en va en el INCLUDE. *Cómo crece:* Un estado nuevo o una regla de visibilidad nueva se cambia en un solo sitio, y la prueba de tabla detecta la vista que quede afuera.
- **Fotos. Las de validado o resuelto se sirven 'public, no-cache' con ETag, y las de nuevo publicado igual. La visibilidad se comprueba antes de responder 304. El autor (sesión = autor_id) ve las suyas en espera, rechazadas o duplicadas con 'private, no-store'. Una foto todavía sin reporte la ve solo quien la subió, técnicos incluidos afuera. La miniatura del formulario sale de URL.createObjectURL. Todo lo demás da 404 con no-store.** Aplica las críticas aceptadas. Se deja de usar max-age=3600 porque retirar contenido es el único control que queda sin moderación previa, y una caché compartida seguiría sirviendo una hora la foto retirada. Hoy una foto sin reporte es pública 24 h (fotos.ts:336-351) y sin moderación sería un alojamiento público de imágenes. Sin la regla del autor, el vecino vería su propia foto rota en «Mis reportes» durante la espera. *Cómo crece:* Con un CDN no hay nada que purgar, porque todo revalida con ETag. Un 304 es barato.
- **Puntos críticos y color de gravedad público solo con verificados. geo-service suma n_verificados y severidad_max_verificada, y la coropleta pública usa este último. Una UV que solo tiene reportes sin verificar se pinta neutra, con la marca «NO SE HA VERIFICADO».** Crítica aceptada: un solo reporte falso de más de 70 cm pintaría una UV entera de crítica. §9.2 sigue siendo analítico. *Cómo crece:* Si el municipio quiere mostrar la gravedad sin verificar, alcanza con cambiar qué campo usa el cliente.
- **Un admin puede pasar validado → rechazado con motivo y auditoría. Aprobado por el usuario.** Sin moderación previa, es la única forma de retirar algo inapropiado que se detectó tarde. Hoy solo se puede marcar como duplicado (reporte.ts:247-253). AFECTA_PUNTOS ya recalcula cuando el estado anterior es validado. *Cómo crece:* Vale igual con más técnicos y más ciudades.
- **La ubicación del dispositivo es el ancla. El cliente manda dispositivo {lat, lon, precision_m, antiguedad_s}. Zod solo acota los rangos físicos (precision_m de 0 a 10 000, antiguedad_s ≥ 0). Los topes de negocio (60 m, 50 m, 600 s) los aplica api-core con 422 propios. La posición no se guarda ni se registra en logs. Se guarda distancia_dispositivo_m redondeada. dispositivo no entra en la huella de idempotencia.** Crítica aceptada: si Zod tuviera el tope de 50 m, la respuesta sería 400 PAYLOAD_INVALIDO y nunca el 422 PRECISION_INSUFICIENTE. Guardar la posición del teléfono dejaría rastro de la vivienda del vecino (§13). *Cómo crece:* Radio, precisión y antigüedad son constantes de contrato: otra ciudad las ajusta sin tocar código.
- **Cámara dentro de la página con getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }). Si existe, se usa ImageCapture.takePhoto(). Sin mediaDevices, rama propia con «abrí la página en Chrome o Safari». No hay ningún input de archivo. El cliente manda JPEG y el servidor convierte a WebP.** Crítica aceptada: sin restricciones, Chrome entrega 640×480. iOS Safari no codifica WebP desde canvas. Con <input capture>, el escritorio y algunos WebView abren la galería. *Cómo crece:* Una app nativa usaría la misma ruta POST /fotos.
- **Idempotencia ligada a la cuenta sin migración: el código nuevo guarda la clave como `${usuario_id}:${clave}` en la PK de texto actual. Se descarta la migración de cambio de PK del plan anterior.** Crítica de producción aceptada. Cambiar la PK rompía el ON CONFLICT (clave) del api-core anterior (idempotencia.ts:67 y 87) mientras corrían las migraciones. clave es text sin límite (0004), y las claves viejas sin prefijo vencen solas por TTL. *Cómo crece:* No hay deuda de esquema. Si algún día hace falta la columna, se agrega con ampliar y después contraer.
- **La migración de publicación (0015) rellena publicar_en = creado_en antes de poner NOT NULL y el CHECK. Además se niega a publicar de golpe los reportes en «nuevo» anteriores: aborta salvo que el CLI de migración se ejecute con --publicar-nuevos-existentes (SET LOCAL curichi.publicar_nuevos_existentes).** Críticas aceptadas. Con DEFAULT now() el CHECK fallaba en toda fila de más de 1 h. Además, esos reportes se enviaron bajo el texto «un técnico revisa antes de publicarlo», y un recordatorio se puede saltear. *Cómo crece:* El mismo mecanismo de bandera sirve para cualquier migración que cambie la visibilidad de datos ya recibidos.
- **Una versión de contrato por tanda (0.8.0 a 0.14.0), cada una con su contrato y sus consumidores en el mismo PR, y ampliar y después contraer en las migraciones: 0013 a 0015 solo agregan, y 0016 borra ultimo_reporte_en y el DEFAULT de publicar_en en un despliegue posterior.** Cada tanda deja el CI verde (§12.3) y el api-core anterior no falla durante el job de migraciones. *Cómo crece:* El mismo patrón sirve para futuros cambios de /api/v1.
- **Técnicos y ejecutivo con sondeo de 10 s (x-curichi-sondeo, sin pestañas ocultas, sin caché y con deduplicación en vuelo). La página pública no se refresca sola. Capas y teselas con huella del contenido servido, immutable por 1 año y 410 si la huella es vieja. Cifras públicas con 120 s como máximo.** Una VPS con una réplica y pocas pantallas internas: el costo es despreciable y no hacen falta SSE ni LISTEN/NOTIFY. *Cómo crece:* SSE para los paneles queda en el backlog, detrás de la misma invalidación de TanStack. Las URL con huella pueden ir detrás de un CDN.
- **Guarda de disco: statfs con FOTOS_MIN_LIBRE_BYTES. Por debajo, 507 SIN_ESPACIO antes de sharp y /ready degradado. Alertas de Alertmanager para el disco y para el reporte sin verificar más antiguo (métrica nueva).** Las fotos comparten disco con PostgreSQL. Sin moderación previa, además, algo tiene que avisar cuando la bandeja se atrasa (faltante de la crítica de producción). *Cómo crece:* Con S3_ENDPOINT las fotos salen del disco. La alerta de bandeja vale igual con más técnicos.
- **Críticas adoptadas con ajuste. (1) «Ir a mi ubicación»: no se quita el botón, pero ya no pide permiso; solo actúa si el permiso ya se dio dentro de un reporte (se consulta al tocar). (2) Imágenes estáticas: logo.png se conserva solo como apple-touch-icon, porque iOS no acepta WebP ahí. (3) Ancho real de la foto: el E2E compara el ancho guardado con videoWidth del cuadro y no exige más de 640, porque la cámara falsa de Chromium puede no respetar 1920; la exigencia de resolución queda en Vitest (restricciones pedidas) y en la prueba de campo. (4) Retirar una sola foto sin retirar el reporte no entra: queda en el backlog y en los límites.** Cada ajuste cumple la intención de la crítica sin prometer algo que el entorno de prueba o el navegador no garantizan. *Cómo crece:* Los cuatro pueden cerrarse por completo en una tanda futura sin rehacer lo anterior.

## Cambios en CLAUDE.md (autorizados por el usuario)

- **Cabecera:** Revisión del 2026-09-26: publicación sin moderación previa con «NO SE HA VERIFICADO», demora de 1 y 4 min, ubicación obligatoria a 60 m, cámara dentro de la página, WebP y 3 reportes por día. «Se implementa por tandas T1 a T9; avance en docs/TRASPASO.md».
- **§0 regla 8:** La posición del dispositivo nunca se guarda ni se registra en logs. Los permisos de ubicación y cámara se piden solo al reportar, nunca al cargar.
- **§1 Usuarios (filas Ciudadano y Ejecutivo):** Ciudadano: para reportar comparte su ubicación y la foto solo se toma con la cámara dentro de la página. Ejecutivo: sin coropleta y actualización cada 10 s (en lugar de «cada 60 s»).
- **§3.1 puntos 2 y 4:** El detalle muestra el estado de verificación. Formulario: GPS obligatorio con ajuste dentro de 60 m; se quita «o selección manual en el mapa» como alternativa independiente.
- **§4.3 Parte 1:** Responsabilidades: cámara con getUserMedia sin input de archivo, ancla GPS con círculo de 60 m, permisos solo dentro del flujo, «NO SE HA VERIFICADO» visible, cuenta regresiva y sin refresco automático. Salidas: POST /reportes con dispositivo y GET /mis-reportes. DoD (b): «crear reporte con GPS simulado, ajuste dentro de 60 m y foto de la cámara simulada», en lugar de «por selección manual con foto».
- **§4.4 Parte 2:** Ejecutivo: cifra grande, pestañas y dos gráficas por distrito, sin coropleta ni período. Técnico y ejecutivo con sondeo cada 10 s, sin caché. El admin puede retirar un reporte verificado.
- **§4.5 / §4.6:** api-core: WebP, publicar_en, cupo diario en la base, validación del radio, fotos del autor y /mis-reportes. geo-service: agregados con nuevo, n_verificados y severidad_max_verificada; capas y teselas con huella.
- **§5.3:** Parte 5 suma docs/TRASPASO.md y docs/operaciones/ a sus carpetas.
- **§7.1:** Nuevas publicar_en timestamptz y distancia_dispositivo_m smallint. ubicacion_metodo lo deriva el servidor ('gps' con 2 m o menos). precision_gps_m es la precisión del dispositivo.
- **§7.2:** reporte_foto: las nuevas son image/webp con 1600 px por lado como máximo, y las .jpg anteriores se sirven igual. Nueva tabla cuota_reporte_diaria. La clave de idempotencia se guarda con el prefijo de la cuenta.
- **§7.3:** Vista pública: nuevo (NO SE HA VERIFICADO), validado (Verificado) y resuelto, solo con publicar_en <= now(). rechazado y duplicado no se publican. Nueva transición validado → rechazado, solo admin y con motivo. Reabrir un rechazado lo vuelve público. Nadie modera antes de publicar_en. Se quita «nuevo no se publica».
- **§7.5:** POST /reportes: dispositivo obligatorio; 422 de radio, precisión y antigüedad; 3 por día; publicar_en a 1 y 4 min. POST /fotos: entra JPEG, PNG o WebP y sale WebP; 12 por día; 507. GET /fotos/:key: publicadas con 'public, no-cache' y ETag; el autor ve las suyas en cualquier estado; una foto sin reporte solo la ve quien la subió; en lugar de «la que aún no tiene reporte se sirve». Nuevo GET /mis-reportes. /auth/yo con reportes_restantes_hoy y demora_proximo_s. /ejecutivo/resumen e /indicadores sin caché. /auth/registro con tope diario por IP.
- **§7.6:** Capas y teselas con {huella}, immutable, y 410 con huella vieja. Agregados con nuevo, validado y resuelto publicados, más n_verificados y severidad_max_verificada; caché de 2 min como máximo.
- **§9.2:** Los puntos críticos y el color público de gravedad se arman solo con verificados, para que los reportes sin revisar no fabriquen recurrencia.
- **§9.5:** Nuevas limitaciones: «Los reportes NO SE HA VERIFICADO no fueron revisados y pueden ser erróneos» y «El radio de 60 m no prueba la presencia: el GPS del teléfono se puede falsear».
- **§13:** «Moderación previa» pasa a «Publicación sin moderación previa»: demora, etiqueta, retiro al rechazar o fusionar, alerta de bandeja atrasada. Nuevas filas «Ubicación del dispositivo» y «Permisos». Fotos: WebP de 1600 px por lado; sin reporte, solo para su dueño. Rate limiting: 3 reportes y 12 fotos por día más el tope de altas por IP; se quita lo de 60 min. «Solo cámara» es una barrera de interfaz, no una garantía.
- **§14.1 / §14.4:** La alternativa al arrastre es escribir coordenadas, usar las flechas o los botones «mover 5 m», dentro del radio. La foto es opcional. Sin ubicación precisa no se reporta, y la interfaz lo dice. §14.4: el llamado «Reportar el primero acá» explica que hace falta un dispositivo con ubicación precisa. Imágenes de la interfaz en WebP.
- **§15 / §16:** Backlog: SSE en paneles, anular envío, retirar una sola foto, «Reportar contenido», re-codificar las .jpg anteriores, difuminado de caras y patentes. §16.7: 60 m, 50 m, 600 s, 60 y 240 s, 3, 12 y 10 por día, calidad WebP 80 y plazo de revisión de la bandeja, a validar con el municipio. §16.11: retención de fotos de reportes rechazados <a confirmar>.

## Lo que una web no puede garantizar

- Solo cámara: ninguna web lo garantiza. La interfaz no ofrece la galería en ningún equipo, pero alguien con su sesión puede mandar cualquier imagen a la API con curl. El servidor no distingue de dónde salió la foto.
- Radio de 60 m: la posición la informa el teléfono y se puede falsear. El servidor solo rechaza lo que no concuerda con lo declarado. Los controles reales son la cuenta, el cupo, la auditoría y el rechazo del técnico.
- Quién puede reportar: solo quien tenga una ubicación con la precisión exigida. Un teléfono bajo techo puede no llegar. Una computadora con Wi‑Fi a veces sí llega, porque la precisión la declara el dispositivo, no la app.
- Permisos: la app garantiza que no pide ni lee nada al cargar. Si la persona ya dio el permiso antes, el navegador no vuelve a preguntar. Safari en iPhone puede preguntar por la cámara en cada visita.
- Cámara y ubicación exigen HTTPS. Probar desde un teléfono por la IP de la red local sin el proxy con TLS no funciona.
- Calidad de foto: aun pidiendo 1080p, algunos navegadores entregan menos y sin flash. De noche la foto puede salir oscura.
- WebP no se ve en Safari anterior a 14. Las fotos .jpg anteriores quedan como están. El ahorro de peso se mide, no se promete.
- Demora: el público ve lo nuevo al recargar, y las cifras pueden tardar hasta 2 min más. Técnicos y ejecutivo lo ven hasta 10 s después de publicado.
- Sin moderación, las fotos y los textos sin revisar se ven desde que se publican hasta que un técnico los retira. No hay difuminado de caras ni de patentes, ni filtro de texto. Una foto no se puede retirar sola, sin retirar el reporte.
- El cupo es por cuenta: crear cuentas lo multiplica. El tope de altas por IP lo encarece, pero puede afectar a barrios detrás de una misma IP.

## Recordatorios antes de producción

- BLOQUEA LA APERTURA: HTTPS real con dominio (DOMINIO_PUBLICO, DOMINIO_PANEL, PROXY_TLS=acme). Sin HTTPS no hay cámara ni ubicación, y nadie puede reportar.
- BLOQUEA LA APERTURA: mapa base de producción (Protomaps autohospedado, OpenFreeMap u otro proveedor) en lugar de tile.openstreetmap.org, con la CSP ajustada.
- BLOQUEA LA APERTURA: respaldo diario de la base y de las fotos fuera de la VPS, con claves guardadas fuera de la máquina y una restauración de prueba cronometrada.
- BLOQUEA LA APERTURA: secretos generados (IP_HASH_SAL, JITTER_SAL, GEO_TOKEN_INTERNO, METRICAS_TOKEN, COOKIE_SEGURA=1, TRUST_PROXY=1, EXPONER_DOCS=0), cuentas de desarrollo borradas y primer admin real creado.
- BLOQUEA LA APERTURA: número de emergencias. Hoy el 911 está escrito en el código (ComoFunciona.tsx:64, Portada.tsx:156): confirmarlo o hacerlo configurable.
- BLOQUEA LA APERTURA: acordar con el municipio el plazo máximo de revisión de la bandeja sin verificar y quién atiende la alerta.
- BLOQUEA EL DESPLIEGUE DE T4: moderar la bandeja antes de migrar. La migración 0015 aborta si quedan reportes en nuevo, salvo que se use --publicar-nuevos-existentes a sabiendas.
- Probar cámara y ubicación en teléfonos reales: iPhone con Safari, Android con Chrome y los navegadores internos de WhatsApp, Facebook e Instagram. Anotar la resolución real de la foto.
- Validar con el municipio: 60 m, precisión de 50 m, 10 min de antigüedad, demoras de 1 y 4 min, 3 reportes y 12 fotos por día, 10 altas por IP, WebP 80, severidad, radio de 25 m y jitter.
- Disco de la VPS: tamaño, FOTOS_MIN_LIBRE_BYTES, alertas y medición del peso real de las fotos (avg(bytes) de reporte_foto).
- Acordar la retención de ip_hash, de los datos personales y de las fotos de reportes rechazados, además del RPO y el RTO.
- Aplicar la migración 0016 de contracción recién en un release posterior al de T3 y T4.

## Decisiones del usuario sobre las preguntas abiertas

- **Demora:** se aplica en el servidor. El reporte llega al tocar Enviar y aparece 1 minuto después, o 4 desde el segundo del día.
- **Precisión del GPS:** 50 m como máximo, configurable.
- **Fotos de reportes sin verificar:** se muestran en público junto con el reporte, con la etiqueta «NO SE HA VERIFICADO».
- **Cambios propuestos por el plan:** aprobados todos, incluidos los verificados en puntos críticos y coropleta, el retiro de verificados por un admin y la foto sin reporte visible solo para quien la subió.
