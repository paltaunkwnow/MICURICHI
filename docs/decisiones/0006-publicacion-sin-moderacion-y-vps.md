# ADR 0006 — Publicación sin moderación previa, ubicación del dispositivo, cámara y WebP en una VPS

- **Estado:** aceptada. Se implementa por tandas T1 a T9; el avance está en `docs/TRASPASO.md`.
- **Fecha:** 2026-09-26
- **Decide:** el usuario, a partir del plan de producción en una VPS
  (`docs/revision/2026-09-26-plan-produccion-vps.md`), aprobado completo el 2026-09-26

## Contexto

Hasta ahora Mi Curichi tenía **moderación previa**: un reporte en `nuevo` no se publicaba hasta que
un técnico lo validaba. Con cuentas obligatorias (decisión anterior del mismo día) y la puesta en
producción en puerta, el usuario pidió:

- Que los reportes se vean sin esperar a un técnico, marcados con el texto exacto
  «NO SE HA VERIFICADO», con una demora corta: 1 minuto el 1.º reporte del día y 4 minutos el 2.º
  y el 3.º.
- Que para reportar haga falta compartir la ubicación y que el punto quede cerca del teléfono.
- Que la foto salga solo de la cámara, sin galería ni archivos, y que las fotos e imágenes se
  guarden en WebP.
- Que la web no pida ni lea ubicación ni cámara al cargar.
- 3 reportes por cuenta y por día y 12 fotos por día, sin la espera de 60 min entre reportes.
- Técnicos y ejecutivo al día cada 10 s; la página pública, sin tráfico automático.
- Producción en **una VPS** (una instalación por ciudad, ADR 0004), con las fotos en su disco.

Sacar la moderación previa cambia el modelo de riesgo: lo que antes filtraba un técnico ahora se
ve en público hasta que alguien lo retira. Las críticas adversariales del plan señalaron, entre
otros riesgos: que una demora en el cliente se salta con `curl`; que el literal de estados públicos
estaba repetido en unos 10 lugares; que un solo reporte falso de más de 70 cm pintaría de crítica
una UV entera; que una foto sin reporte, servida a cualquiera, sería un alojamiento público de
imágenes; que el tope de precisión en Zod daría `400` y no un `422` útil; que guardar la posición
del teléfono dejaría rastro de la vivienda del vecino; y que una migración que pusiera `DEFAULT
now()` y un `CHECK` sobre filas viejas fallaría o publicaría de golpe reportes enviados bajo la
promesa de revisión previa.

## Decisión

### Publicación sin moderación previa, con demora en el servidor

- La vista pública muestra `nuevo` («NO SE HA VERIFICADO»), `validado` («Verificado») y `resuelto`
  («Resuelto»). `rechazado` y `duplicado` no se publican: rechazar o fusionar retira del mapa.
- `publicar_en` se fija en el INSERT: `now()` + 60 s si es el 1.º reporte del día de la cuenta y
  + 240 s si es el 2.º o el 3.º. El número sale del `RETURNING` del contador atómico del cupo diario,
  en la misma transacción. **No hay ningún proceso que publique**: la visibilidad es el filtro
  `publicar_en <= now()`. Durante la espera no lo ve nadie, técnicos incluidos, salvo su autor.
- La visibilidad vive en un solo lugar: `ESTADOS_PUBLICOS` en `contracts` y las condiciones
  `condicionPublico` y `condicionPublicado` en `api-core`, aplicadas en la vista pública, la técnica,
  la exportación, indicadores, ejecutivo, moderación, fotos y agregados, con una prueba de tabla que
  recorre todas las rutas. El fragmento SQL se arma con el literal y no con `ANY($n)`, para que
  PostgreSQL use los índices parciales con un plan genérico.
- **Las fotos de reportes sin verificar se muestran en público junto con el reporte** (decisión del
  usuario). Las publicadas se sirven con `public, no-cache` y `ETag`, comprobando la visibilidad
  antes de un `304`; el autor ve las suyas en cualquier estado; una foto **sin reporte la ve solo
  quien la subió**.
- Puntos críticos y color público de gravedad por UV **solo con verificados**
  (`n_verificados`, `severidad_max_verificada`).
- Un **admin** puede retirar un verificado (`validado → rechazado`, con motivo y auditoría).
- La migración 0015 rellena `publicar_en = creado_en` antes de `NOT NULL` y del `CHECK`, y **aborta**
  si quedan reportes en `nuevo` anteriores, salvo con `--publicar-nuevos-existentes`.
- Alertmanager avisa cuando el reporte sin verificar más antiguo supera el plazo de revisión de la
  bandeja `<plazo a confirmar con el municipio>`.

### Ubicación del dispositivo con radio de 60 m

- El cliente manda `dispositivo` (`lat`, `lon`, `precision_m`, `antiguedad_s`). Zod solo acota
  rangos físicos; `api-core` aplica los topes de negocio con `422` propios, que no gastan cupo:
  precisión de **50 m** como máximo (decisión del usuario, configurable), posición de 600 s como
  máximo `<a confirmar>` y punto a **60 m** o menos del dispositivo.
- La posición del dispositivo **no se guarda** ni se registra en logs ni en auditoría; queda solo
  `distancia_dispositivo_m` redondeada (migración 0013). `ubicacion_metodo` lo deriva el servidor.
- Los permisos de ubicación y cámara se piden solo dentro del flujo de reporte, nunca al cargar.

### Cámara dentro de la página y WebP

- La foto sale de `getUserMedia` con resolución pedida de 1920×1080 (y `ImageCapture.takePhoto()`
  si existe), sin ningún input de archivo. El cliente manda JPEG; el servidor convierte a **WebP**
  (calidad 80, 1600 px por lado como máximo, primer cuadro, sin metadatos). Las `.jpg` anteriores
  se sirven como están.
- Las imágenes propias de las dos webs pasan a WebP; `logo.png` queda solo como `apple-touch-icon`.

### Cupo diario e idempotencia por cuenta

- 3 reportes y 12 fotos por cuenta y por día calendario en `ZONA_HORARIA`, contados en
  `cuota_reporte_diaria` (migración 0014), y un tope diario de altas de cuenta por IP (10
  `<a confirmar>`). Se quita la espera de 60 min entre reportes.
- La clave de idempotencia se guarda como `<usuario_id>:<clave>` en la PK de texto actual, sin
  migración.

### Una VPS con sondeo de 10 s

- Técnicos y ejecutivo se actualizan cada 10 s con `x-curichi-sondeo`, solo con la pestaña
  visible, sin caché en `/indicadores` ni `/ejecutivo/resumen` y con deduplicación en vuelo.
- La página pública no hace tráfico automático. Capas y teselas llevan la huella del contenido en
  la URL, `immutable` por 1 año, y `410 CAPA_CAMBIO` con una huella vieja. Las cifras públicas
  tienen 2 min de antigüedad como máximo.
- Las fotos van al disco de la VPS con guarda de espacio (`FOTOS_MIN_LIBRE_BYTES`: por debajo,
  `507 SIN_ESPACIO` y `/ready` degradado) y alerta de disco; S3 sigue disponible con `S3_ENDPOINT`.

### Cómo se entrega

Una versión de contrato por tanda (0.8.0 a 0.14.0) con sus consumidores en el mismo PR, y
migraciones que primero solo agregan (0013 a 0015) y contraen en un despliegue posterior (0016:
borra `usuario.ultimo_reporte_en` y el `DEFAULT` de `publicar_en`). La CSP con nonce (T9) es
separable y postergable.

## Consecuencias

- Los reportes se ven sin depender de que un técnico esté disponible, y los errores (cobertura,
  radio, cupo) aparecen al momento, porque el reporte llega al servidor al tocar Enviar. Un reporte
  enviado no se pierde si se cierra la app.
- Lo sin revisar, **fotos incluidas**, se ve desde que se publica hasta que un técnico lo retira.
  No hay difuminado de caras ni de patentes, ni filtro de texto, y una foto no se retira sin
  retirar su reporte. El control es la cuenta, el cupo, la auditoría, el retiro y la alerta de
  bandeja atrasada, por eso acordar el plazo de revisión con el municipio **bloquea la apertura**.
- Desplegar T4 exige moderar la bandeja antes de migrar, o usar la bandera a sabiendas.
- El radio de 60 m no prueba la presencia: el GPS se puede falsear. «Solo cámara» es una barrera
  de interfaz: con su sesión, alguien puede mandar cualquier imagen a la API.
- Solo puede reportar quien tenga una ubicación con 50 m de precisión o menos; un teléfono bajo
  techo puede no llegar. Cámara y ubicación exigen HTTPS: sin dominio con TLS nadie puede reportar.
- El cupo es por cuenta: crear cuentas lo multiplica; el tope de altas por IP lo encarece, pero
  puede afectar a barrios detrás de una misma IP.
- El público ve lo nuevo al recargar, y las cifras pueden tardar hasta 2 min más; técnicos y
  ejecutivo lo ven hasta 10 s después de publicado.
- Todo el estado de la publicación diferida vive en la base, así que vale igual con N réplicas.
- Pasan al backlog: SSE en los paneles, anular envío, retirar una sola foto, «Reportar contenido»,
  re-codificar las `.jpg` anteriores y difuminado de caras y patentes.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Mantener la moderación previa | El usuario pidió que los reportes se vean sin esperar a un técnico. |
| Demora en el cliente (esperar antes de enviar) | Se salta con `curl` o un cliente modificado, los errores llegan tarde y el reporte se pierde si se cierra la app. |
| Un proceso que publique los reportes al vencer la demora | Más piezas que pueden fallar; el filtro `publicar_en <= now()` no necesita ninguna y vale con N réplicas. |
| Guardar la posición del dispositivo | Dejaría rastro de la vivienda del vecino (§13). Alcanza con la distancia redondeada. |
| Tope de precisión en el esquema Zod | La respuesta sería `400 PAYLOAD_INVALIDO` y nunca el `422 PRECISION_INSUFICIENTE` que la interfaz necesita para explicar qué pasa. |
| `<input type="file" capture>` | En escritorio y en algunos WebView abre la galería. |
| Codificar WebP en el teléfono | Safari de iOS no codifica WebP desde un canvas; el servidor convierte igual para todos. |
| Puntos críticos y coropleta con reportes sin verificar | Un solo reporte falso de más de 70 cm pintaría de crítica una UV entera. |
| Servir a cualquiera una foto sin reporte | Sin moderación previa sería un alojamiento público de imágenes. |
| Fotos publicadas con `max-age=3600` | Retirar un reporte no dejaría de servir su foto durante una hora; con `no-cache` y `ETag` revalidan siempre y un `304` es barato. |
| Cambiar la PK de `idempotencia` por migración | Rompía el `ON CONFLICT (clave)` del `api-core` anterior mientras corría el job de migraciones. |
| SSE o `LISTEN/NOTIFY` para los paneles | Con una VPS, una réplica y pocas pantallas internas, el sondeo de 10 s cuesta poco; SSE queda en el backlog. |
| S3 gestionado como modo oficial de las fotos | En una VPS el disco es más simple; la guarda de espacio y la alerta cubren el riesgo, y `S3_ENDPOINT` sigue disponible. |
