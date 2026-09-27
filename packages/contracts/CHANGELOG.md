# Changelog — contracts

## 0.8.0 — 2026-09-26

**Dos cambios con ruptura: la respuesta de `POST /api/v1/fotos` y quién ve una foto sin reporte
en `GET /api/v1/fotos/{key}`.** Toda foto nueva se guarda en WebP, con 1600 px por lado como
máximo y sin metadatos, y una foto que todavía no tiene reporte solo la ve quien la subió. Es la
versión de la tanda T1 del plan de producción (`docs/revision/2026-09-26-plan-produccion-vps.md`,
paso S01).

### Con ruptura: `FotoSubidaSchema.mime`

| 0.7.0 | 0.8.0 |
|---|---|
| `mime: string` (api-core mandaba `image/jpeg`) | `mime: 'image/webp'` (`z.literal(FOTO_FORMATO_SALIDA)`) |

Una respuesta con `image/jpeg`, `image/png` o cualquier otro valor ya no pasa el esquema. El tipo
inferido `FotoSubida['mime']` pasa de `string` al literal `'image/webp'`.

### Con ruptura: una foto sin reporte solo la ve quien la subió

| 0.7.0 | 0.8.0 |
|---|---|
| `GET /fotos/{key}` de una foto sin reporte: `200` a cualquiera, con sesión o sin ella, durante las 24 h que puede quedar sin reporte | `200` solo a la cuenta que la subió (`subido_por`), con `private, no-store`; `404` a cualquier otro, técnicos y admin incluidos |

Sin moderación previa (tanda T4), servirla a cualquiera la volvía un alojamiento público de
imágenes. Un cliente que usaba la URL del servidor como miniatura sin sesión, o con la de otra
cuenta, recibe `404`: la miniatura del formulario tiene que salir de la imagen local
(`URL.createObjectURL`), como hace `web-ciudadano` desde esta versión.

### Parámetros (`CONFIG_DOMINIO`, también en `dist/dominio.json`)

| Constante | Valor | Qué es |
|---|---|---|
| `FOTO_FORMATO_SALIDA` | `'image/webp'` | Nueva. Formato en que se guarda y se sirve toda foto nueva, sea cual sea el de entrada |
| `FOTO_CALIDAD_WEBP` | `80` | Nueva. Calidad de la codificación WebP `<a confirmar con el municipio>` |
| `FOTO_ALTO_MAX_PX` | `1600` | Nueva. Con `FOTO_ANCHO_MAX_PX` (sin cambios, 1600), el tope pasa a ser **por lado**: la foto entra en 1600 × 1600 sin deformarse. Antes solo se acotaba el ancho y una foto vertical de 1200 × 4000 se guardaba entera |
| `FOTO_MIME_PERMITIDOS` | sin cambios: JPEG, PNG y WebP | Pasa a ser solo la lista de formatos de **entrada**, reconocidos por su contenido. La salida es siempre `FOTO_FORMATO_SALIDA` |

### OpenAPI

- `POST /api/v1/fotos`: la descripción dice qué entra (JPEG, PNG o WebP) y qué se guarda (WebP de
  calidad 80, 1600 px por lado como máximo, sin EXIF ni XMP ni perfil ICC, solo el primer cuadro
  de una imagen animada). La respuesta 201 dice `image/webp`. Se documentan `400 SIN_ARCHIVO`,
  `413 ARCHIVO_GRANDE` y `415 TIPO_NO_PERMITIDO` / `IMAGEN_INVALIDA`, que api-core ya devolvía.
- `GET /api/v1/fotos/{key}`:
  - 200 declara `image/webp` para las fotos nuevas e `image/jpeg` solo para las anteriores a
    0.8.0, que se sirven como están y no se reconvierten.
  - La clave sigue el patrón `^[a-f0-9-]{36}\.(webp|jpg)$`; cualquier otra da 404.
  - Documenta la regla nueva de visibilidad de una foto sin reporte (arriba, «Con ruptura»).
  - Sin cambios en T1: la foto de un reporte publicado la ve cualquiera, y la de uno sin publicar
    solo técnico y admin.
  - Sesión opcional (`security: [{}, { cookieSesion: [] }]`): el público no la necesita; el dueño
    de una foto sin reporte, sí.
  - Se documentan las cabeceras `Cache-Control` (`public, max-age=3600` solo con el reporte
    publicado; `private, no-store` en cualquier otro caso) y `X-Content-Type-Options: nosniff`,
    y las respuestas `404 NO_EXISTE` y `429`.
- Componente `FotoSubida`: `mime` con `const: image/webp`.

### Qué tienen que hacer los consumidores

- `api-core` (paso S02): procesar con
  `.rotate().resize({ width: FOTO_ANCHO_MAX_PX, height: FOTO_ALTO_MAX_PX, fit: 'inside', withoutEnlargement: true }).webp({ quality: FOTO_CALIDAD_WEBP })`,
  sin `withMetadata` y con solo el primer cuadro; clave `${uuid}.webp`; el INSERT, el almacén y la
  respuesta con `FOTO_FORMATO_SALIDA`. `GET /fotos/:key` acepta `.webp` y `.jpg`, y una foto sin
  reporte se sirve solo si `subido_por` es la cuenta de la sesión, con `private, no-store`. Las
  `.jpg` existentes no se tocan.
- `web-ciudadano` (paso S03): la miniatura sale de `URL.createObjectURL` y no de la URL del
  servidor; un borrador restaurado la pide con la cookie de su dueño. `FOTO_MIME_PERMITIDOS` ya no
  hace falta en el `accept` de un input, porque la foto sale de la cámara dentro de la página.
- `panel-admin`: nada. Muestra las fotos por su URL y el navegador sigue el `Content-Type`.
- `e2e`: toda comprobación de que una foto subida vuelve como `image/jpeg` pasa a `image/webp`.

## 0.7.0 — 2026-09-26

**Aditivo.** Mi Curichi se despliega una vez por ciudad con la misma imagen. La ciudad (centro,
locale, nombre, zona horaria) estaba escrita en el código de las apps y la URL del panel viajaba
en el JavaScript público de la app ciudadana. Ahora las dos cosas llegan desde api-core en tiempo
de ejecución.

### Configuración pública (`GET /api/v1/configuracion`, pública y cacheable)

- `ConfiguracionPublicaSchema` (`type ConfiguracionPublica`) = `{ ciudad: CiudadSchema }`, en
  `src/esquemas/configuracion.ts`. `CiudadSchema` (`type Ciudad`):

  ```
  { nombre, pais, zona_horaria, locale, centro: { lon, lat }, zoom_inicial }
  ```

  | Campo | Regla |
  |---|---|
  | `nombre` | texto de 1 a 100 caracteres, sin espacios sobrantes |
  | `pais` | ISO 3166-1 alfa-2 en mayúsculas (`BO`) |
  | `zona_horaria` | nombre IANA que `Intl` reconoce (`America/La_Paz`); un desfase como `-04:00` no sirve. Es el mismo criterio que ya aplica api-core a `ZONA_HORARIA` |
  | `locale` | BCP 47 en forma canónica: idioma y, si hacen falta, escritura y región (`es-BO`, `es-419`). `es_BO` se rechaza porque hace que `Intl` lance RangeError en el cliente; `es-bo` también, para que haya una sola forma |
  | `centro.lon` / `centro.lat` | −180..180 / −90..90 (EPSG:4326) |
  | `zoom_inicial` | 0..22; admite fracciones, como MapLibre |

- `CONFIG_DOMINIO.CIUDAD_POR_DEFECTO`: Santa Cruz de la Sierra, `BO`, `ZONA_HORARIA_POR_DEFECTO`,
  `es-BO`, centro `{ lon: -63.18, lat: -17.78 }` y zoom 13. Son el centro y el zoom con los que
  abre hoy el mapa público, así que la instalación actual no necesita configurar nada. También
  sale en `dist/dominio.json`.

### Sesión (`GET /api/v1/auth/yo`)

- `SesionActualSchema.panel_url`, opcional: `string | null`. URL base del panel, absoluta
  `http`/`https` y sin usuario ni contraseña (la misma regla que aplicaba la app ciudadana a
  `PANEL_ADMIN_URL`). `null` = el despliegue no configuró el panel.
- Solo para `ROLES_DEL_PANEL` (nueva constante: `tecnico`, `admin`, `ejecutivo`; tipo
  `RolDelPanel`). Una sesión de `ciudadano` con `panel_url`, aunque sea `null`, no pasa el
  esquema: al ciudadano el campo no se le manda.
- Cambio de comportamiento del esquema, no de la forma: `SesionActualSchema` lleva ahora un
  refinamiento, así que zod no permite `.pick()`, `.omit()` ni `.partial()` sobre él. Nadie lo
  hacía.

### OpenAPI

- `GET /api/v1/configuracion` (etiqueta nueva `configuracion`, sin seguridad): 200 →
  `ConfiguracionPublica`, con la cabecera `Cache-Control` documentada.
- `GET /api/v1/auth/yo`: la descripción explica `panel_url`; el componente `SesionActual` lo
  incluye como opcional.
- Componente nuevo: `ConfiguracionPublica`.

### Qué tienen que hacer los consumidores

- `api-core`: servir `GET /api/v1/configuracion` con `CIUDAD_POR_DEFECTO` sobrescrita por su
  configuración (y la zona tomada de `ZONA_HORARIA`, que ya lee), validada con
  `ConfiguracionPublicaSchema` al arrancar; `Cache-Control: public`. En `/auth/yo`, agregar
  `panel_url` solo si el rol está en `ROLES_DEL_PANEL`.
- `web-ciudadano` y `panel-admin`: leer la ciudad de `/api/v1/configuracion` en lugar de las
  constantes (`CENTRO_INICIAL`, `'es-BO'`, «Santa Cruz», zona horaria).
- `web-ciudadano`: tomar la URL del panel de `panel_url` y dejar de fijar `PANEL_ADMIN_URL` al
  compilar. Para `ejecutivo` sigue agregando la ruta `ejecutivo`, igual que hoy.

## 0.6.0 — 2026-09-26

**Cambio con ruptura en el resumen ejecutivo.** El resto es aditivo o valida más estricto.

### Con ruptura: resumen ejecutivo (`ResumenEjecutivoSchema`)

La cifra grande del panel pasa a ser la **inundación activa**: reportes en `nuevo` (en revisión)
o `validado` (verificadas). Los `resuelto` salen de ella y cuentan solo como trabajo hecho.

| 0.5.0 | 0.6.0 |
|---|---|
| `total` (nuevo + validado + resuelto) | `activas.total` (nuevo + validado) |
| `por_severidad` (los tres estados) | `activas.por_severidad` (solo las activas, severidad efectiva) |
| — | `activas.verificadas` (= `validado`), `activas.en_revision` (= `nuevo`) |
| — | `resueltas` |
| `por_estado` | sin cambios (gráfica del trabajo) |
| `por_distrito[].total`, `por_distrito[].por_severidad` | `por_distrito[].activas` (misma forma que en la raíz) |
| — | `por_distrito[].en_capa_vigente` (`false` = distrito que solo existe en una capa anterior) |
| `ultimo_reporte_en` (raíz y distrito) | igual, **truncado al minuto** (privacidad) |

Forma exacta:

```
{ generado_en, ventana: { desde, hasta },
  activas: { total, verificadas, en_revision, por_severidad: { critica, alta, media, baja } },
  resueltas,
  por_estado: { nuevo, validado, resuelto },
  por_distrito: [{ distrito_id, codigo, nombre, en_capa_vigente,
                   activas: { total, verificadas, en_revision, por_severidad },
                   por_estado: { nuevo, validado, resuelto }, ultimo_reporte_en }],
  ultimo_reporte_en }
```

El esquema valida además estas igualdades. api-core parsea su propia respuesta con él, así que un
desajuste da 500 en vez de llegar al panel como cifras que no cuadran:

- `activas.total = verificadas + en_revision` y `critica + alta + media + baja = activas.total`.
- `activas.verificadas = por_estado.validado` y `activas.en_revision = por_estado.nuevo`, en la
  raíz y en cada distrito; `resueltas = por_estado.resuelto` en la raíz.
- `ultimo_reporte_en`, en la raíz y en cada distrito, con segundos y milisegundos en cero.
- No se exige que la raíz sea la suma de los distritos: un reporte sin distrito cuenta en la raíz
  y no tiene fila propia.

Nuevo `ConteoActivasSchema` (`type ConteoActivas`). Siguen `ConteoPorSeveridadSchema`,
`ConteoPorEstadoResumenSchema`, `ResumenDistritoSchema` y `ResumenEjecutivoQuerySchema`.

### Valida más estricto

- `ReporteCambiarEstadoSchema`: pasar a `nuevo` (reabrir un rechazado, §7.3) exige
  `estado_motivo`, igual que rechazar, fusionar y resolver. Antes se reabría sin motivo y la
  auditoría no guardaba el porqué.
- `ReporteCrearSchema.evento_en`: se rechaza si es posterior a ahora +
  `EVENTO_TOLERANCIA_FUTURO_MIN` (10 min) o anterior a ahora − `EVENTO_MAX_DIAS_ATRAS` (365 días).
  Compara instantes, así que la zona horaria del cliente no cambia el resultado. Antes
  `2099-01-01` daba 201. «Ahora» es el reloj del momento de validar: el del celular en el
  formulario y el de api-core en el servidor, que es el que decide.
- `ReporteCrearSchema`: con `sumidero_cercano: 'no'`, `sumidero_estado` tiene que ser `null` o
  ausente y `agua_brota_sumidero` no puede ser `true`. El error va en ese campo.
- `ExportarQuerySchema.limite`: el valor por defecto pasa de 10 000 a `EXPORTAR_MAX_FILAS`
  (50 000, que ya era el máximo). Quien no mandaba `limite` recibía como mucho 10 000 filas sin
  ningún aviso.

### Aditivo

- `ReporteTecnicoFeatureSchema` (`type ReporteTecnicoFeature`): Feature con la coordenada exacta y
  `properties` = `ReporteTecnicoSchema`. `ReporteTecnicoFeatureCollectionSchema`
  (`type ReporteTecnicoFeatureCollection`): la misma paginación que la colección pública
  (`total`, `total_exacto?`, `pagina`, `limite`).
- `ExportacionGeoJsonSchema` (`type ExportacionGeoJson`): `{ type, nota_metodologica,
  generado_en, total, exportados, truncado, features: ReporteTecnicoFeature[] }`. `total` cuenta
  la selección sin tope y `truncado` es `total > exportados`.
- `CONFIG_DOMINIO`: `EVENTO_TOLERANCIA_FUTURO_MIN` (10), `EVENTO_MAX_DIAS_ATRAS` (365),
  `EXPORTAR_MAX_FILAS` (50 000), `FOTOS_POR_HORA_POR_CUENTA` (12) y `ZONA_HORARIA_POR_DEFECTO`
  (`'America/La_Paz'`: es el valor por defecto de un despliegue por ciudad y api-core lo
  sobrescribe con la variable `ZONA_HORARIA`). Salen también en `dist/dominio.json`.
- `ErrorApiSchema` no cambia: `codigo` es texto libre, así que `PAYLOAD_INVALIDO` no necesita alta.

### OpenAPI

- `PATCH /reportes/{id}/estado`, `PATCH /reportes/{id}/severidad`, `POST /reportes/{id}/fusionar`
  y `GET /tecnico/reportes/{id}` responden `ReporteTecnicoFeature`; `GET /tecnico/reportes`
  responde `ReporteTecnicoFeatureCollection`. Antes declaraban `ReporteTecnico` plano o
  `ReporteFeature` (propiedades públicas), y api-core devuelve una Feature técnica. Se documentan
  los 400/401/403/404/409 de la moderación.
- `GET /exportar`: 200 `application/geo+json` → `ExportacionGeoJson` y `text/csv`; 400, 401, 403.
- `POST /fotos`: 429 por IP y por cuenta.
- Componentes nuevos: `ReporteTecnicoFeature`, `ReporteTecnicoFeatureCollection`,
  `ExportacionGeoJson`.

### Qué tienen que hacer los consumidores

- `api-core`:
  - resumen ejecutivo: calcular `activas` y `resueltas`, `en_capa_vigente` (el distrito está en la
    capa vigente) y truncar `ultimo_reporte_en` al minuto en la raíz y en cada distrito. Con la
    forma vieja, su `ResumenEjecutivoSchema.parse` falla.
  - `/exportar`: contar sin el tope del listado y devolver `exportados` y `truncado` (en el CSV,
    en el encabezado).
  - `POST /fotos`: cuota por cuenta con `FOTOS_POR_HORA_POR_CUENTA`.
  - zona horaria: `ZONA_HORARIA` o, si no está, `ZONA_HORARIA_POR_DEFECTO`.
  - `{ estado: 'nuevo' }` sin motivo ahora es 400 `PAYLOAD_INVALIDO` antes de mirar la transición:
    la prueba que esperaba 409 para `validado → nuevo` tiene que mandar motivo.
- `panel-admin`: usar `ReporteTecnicoFeature` y `ReporteTecnicoFeatureCollection` del contrato
  en lugar de los tipos hechos a mano, y el panel ejecutivo con la forma nueva.
- `web-ciudadano`: el formulario valida con `ReporteCrearSchema`, así que las reglas nuevas
  también corren en el navegador. La fecha del evento se guarda como `T12:00:00Z` del día
  elegido, y elegir hoy antes de las 11:50 UTC (07:50 en La Paz) queda en el futuro. La casilla
  «El agua brota del sumidero» se ve aunque se conteste «No». Ninguno de los dos errores tiene
  hoy un mensaje visible en su paso.

## 0.5.0 — 2026-09-25

**Cambio con ruptura.** «Tirante estimado» pasa a llamarse «Profundidad estimada» en todo el
contrato (API y base), las respuestas del sumidero se reducen a dos valores, aparece el rol
`ejecutivo` y el esquema del panel ejecutivo. La fórmula de severidad **no cambia** (sigue
`SEVERIDAD_VERSION = 2`): solo cambian los nombres.

### Renombres (viejo → nuevo)

| Viejo | Nuevo |
|---|---|
| campo `tirante_estimado` (en `ReporteCrearSchema`, `ReportePublicoSchema`, `ReporteTecnicoSchema`, `ReporteFeatureSchema`, `ReporteFeatureCollectionSchema` y, por lo tanto, en exportación CSV/GeoJSON) | `profundidad_estimada` |
| `TIRANTES` | `PROFUNDIDADES` (mismos valores: `tobillo`, `rodilla`, `muslo`, `mas_70`) |
| `type Tirante` | `type Profundidad` |
| `EntradaSeveridad = { tirante_estimado, frecuencia }` | `{ profundidad_estimada, frecuencia }` |
| `PUNTOS.tirante` | `PUNTOS.profundidad` (mismos puntos 1–4) |
| `PESOS = { tirante: 2, frecuencia: 1 }` | `PESOS = { profundidad: 2, frecuencia: 1 }` |
| `ETIQUETAS.tirante` | `ETIQUETAS.profundidad` (mismas etiquetas por valor) |
| `dist/dominio.json` → `enums.tirante` | `enums.profundidad` |

`puntaje = 2·P + F` (P = puntos de profundidad), mismas bandas, E1 (P = 4 → `critica`) y E3
(F = 4 → mínimo `media`). `NOTA_METODOLOGICA` dice ahora «la profundidad se estima por referencia
corporal».

### Sumidero (valores que desaparecen)

- `SUMIDERO_CERCANO`: `['si', 'no', 'no_sabe']` → **`['si', 'no']`**. El campo sigue opcional y
  nullable: «no contestó» es `null`.
- `SUMIDERO_ESTADOS`: `['libre', 'obstruido', 'danado', 'no_sabe']` → **`['tapado', 'no_tapado']`**.
- Migración de datos existentes:
  - `sumidero_cercano`: `no_sabe` → `null`.
  - `sumidero_estado`: `libre` → `no_tapado`; `obstruido` → `tapado`; `danado` → `tapado`;
    `no_sabe` → `null`.
- `agua_brota_sumidero` no cambia.
- `ETIQUETAS.sumidero_cercano = { si: 'Sí', no: 'No' }`;
  `ETIQUETAS.sumidero_estado = { tapado: 'Tapado', no_tapado: 'No tapado' }`.
- `dist/dominio.json` exporta ahora también `enums.sumidero_cercano` y `enums.sumidero_estado`.

### Etiquetas nuevas

- `ETIQUETAS.campos`: `profundidad_estimada: 'Profundidad estimada'`, `profundidad: 'Profundidad'`
  (forma corta), `sumidero_cercano: '¿Hay sumidero cercano?'`, `sumidero_estado: '¿Está tapado?'`.
- `ETIQUETAS.rol`: `ciudadano: 'Ciudadano'`, `tecnico: 'Técnico'`, `admin: 'Administrador'`,
  `ejecutivo: 'Ejecutivo'`.

### Rol `ejecutivo`

- `ROLES = ['ciudadano', 'tecnico', 'admin', 'ejecutivo']`; `UsuarioSchema` y `SesionActualSchema`
  lo aceptan. **El alta pública sigue creando solo `ciudadano`**: `RegistroSchema` no gana campo de
  rol. El rol ejecutivo se asigna fuera de `/auth/registro`.
- `TRANSICIONES` no cambia: el ejecutivo **no** modera.

### Panel ejecutivo (nuevo, `src/esquemas/ejecutivo.ts`)

- `GET /api/v1/ejecutivo/resumen`, roles `ejecutivo`, `tecnico`, `admin` (401 `SIN_SESION`, 403
  `SIN_PERMISO`). Publicado en OpenAPI con el componente `ResumenEjecutivo`.
- `ResumenEjecutivoQuerySchema = { ventana: '7d' | '30d' | 'todo' }`, por defecto `todo`
  (`VENTANAS_RESUMEN`, `type VentanaResumen`).
- `ResumenEjecutivoSchema` (`type ResumenEjecutivo`):
  `{ generado_en, ventana: { desde, hasta } (null = histórico completo), total,
  por_severidad: { critica, alta, media, baja }, por_estado: { nuevo, validado, resuelto },
  por_distrito: ResumenDistrito[], ultimo_reporte_en }`. `total` cuenta solo reportes en `nuevo`,
  `validado` o `resuelto`; `por_severidad` usa la severidad efectiva. Conteos enteros ≥ 0; fechas
  ISO 8601 con zona.
- `ResumenDistritoSchema`: `{ distrito_id, codigo, nombre, total, por_severidad, por_estado,
  ultimo_reporte_en }`. Auxiliares exportados: `ConteoPorSeveridadSchema`,
  `ConteoPorEstadoResumenSchema`.

### Qué tienen que hacer los consumidores

- `packages/db`: migración que renombra la columna `tirante_estimado` → `profundidad_estimada` (y
  su tipo enum si lo hay), reduce los enums del sumidero con el mapeo de arriba y añade `ejecutivo`
  al enum de rol. `severidad_*` no se recalcula (los números no cambian).
- `api-core`: usar `profundidad_estimada` en lectura, escritura, exportación y `calcularSeveridad`;
  implementar `GET /api/v1/ejecutivo/resumen`; autorizar `ejecutivo` solo ahí (no en moderación
  ni en exportación).
- `web-ciudadano`, `panel-admin`, `e2e`: nombres y etiquetas nuevas; el sumidero con Sí/No y
  Tapado/No tapado, sin opción «No sé».

## 0.4.0 — 2026-09-25

**Cambio con ruptura.** El reporte deja de tener `manzana_id`, `direccion_aprox`,
`duracion_estimada` y `afectacion`, y la severidad pasa a la versión 2, que solo usa tirante y
frecuencia. La capa `manzana` como dato geográfico no cambia.

### Esquemas Zod

- `ReporteCrearSchema`: se quitan `duracion_estimada` y `afectacion`. Un cliente viejo que las
  siga enviando no recibe error: `z.object` descarta las claves que no declara.
- `ReportePublicoSchema` (y por herencia `ReporteTecnicoSchema`, `ReporteFeatureSchema`,
  `ReporteFeatureCollectionSchema`): se quitan `manzana_id`, `direccion_aprox`,
  `duracion_estimada` y `afectacion`.
- `ResolverRespuestaSchema.manzana`, `TIPOS_CAPA` (`manzana`) y `ETIQUETAS.tipo_capa.manzana` **no
  cambian**: `/geo/v1/resolver` sigue devolviendo la manzana; es api-core quien deja de guardarla.

### Enums y etiquetas

- Se quitan `DURACIONES`, `type Duracion`, `AFECTACIONES`, `type Afectacion`,
  `ETIQUETAS.duracion` y `ETIQUETAS.afectacion`. `dist/dominio.json` ya no trae los enums
  `duracion` ni `afectacion`.
- `NOTA_METODOLOGICA` ya no dice «la duración es recordada».

### Severidad v2 (`SEVERIDAD_VERSION = 2`)

- `puntaje = 2·T + F`, rango 3–12. `EntradaSeveridad` queda `{ tirante_estimado, frecuencia }`;
  `PUNTOS` y `PESOS` solo tienen `tirante` y `frecuencia` (`PESOS = { tirante: 2, frecuencia: 1 }`).
- Bandas: 3–4 `baja`, 5–7 `media`, 8–10 `alta`, 11–12 `critica`.
- Reglas: E1 (T = 4 → `critica`) y E3 (F = 4 → mínimo `media`) se conservan. **E2 se elimina**
  (dependía de la afectación). Con estas bandas E3 no llega a dispararse; queda como guarda.

### Qué tienen que hacer los consumidores

- `packages/db`: la migración 0010 quita las cuatro columnas y los tipos `duracion_estimada` y
  `afectacion`, y **recalcula** `severidad_calculada` y `severidad_puntaje` de los reportes
  existentes con la fórmula v2, con `severidad_version = 2`.
- `api-core`, `web-ciudadano`, `panel-admin`, `e2e` y los scripts de banco dejan de enviar, leer y
  mostrar los cuatro campos, cada uno en su propia tarea.

## 0.3.0 — 2026-09-22

**Cambio con ruptura para los clientes de escritura.** Crear un reporte y subir una foto exigen
ahora una sesión. Las lecturas públicas no cambian.

### Esquemas Zod

- Nuevo `RegistroSchema` (`email`, `nombre`, `password`): alta de cuenta ciudadana. **No tiene
  campo de rol**, a propósito: el rol lo pone el servidor y siempre es `ciudadano`.
- Nuevo `SesionActualSchema` = `UsuarioSchema` + `puede_reportar_desde` (ISO 8601 o `null`).
  Aditivo: `GET /auth/yo` devuelve un campo más y quien lo ignore no nota nada.
- `LoginSchema` normaliza el correo (recorta espacios y pasa a minúsculas) antes de validarlo.
- `CONFIG_DOMINIO` gana `MINUTOS_ENTRE_REPORTES_POR_CUENTA` (60), `PASSWORD_MIN_LONGITUD` (10)
  y `PASSWORD_MAX_LONGITUD` (200). El login sigue aceptando contraseñas desde 8 caracteres para
  no dejar fuera a las cuentas creadas antes.
- `ReporteCrearSchema` no cambia, y en particular **sigue sin tener campo de autor**: el autor
  sale de la sesión.

### Cambios de API

- `POST /api/v1/reportes` → **401 `SIN_SESION`** sin sesión. Con sesión, **429
  `CUOTA_DE_REPORTES`** si la cuenta ya envió un reporte en los últimos 60 minutos, con
  `Retry-After` y `detalles.disponible_en`.
- `POST /api/v1/fotos` → **401** sin sesión.
- Nueva ruta `POST /api/v1/auth/registro`. Responde `201 CUENTA_LISTA` **tanto si el correo es
  nuevo como si ya existía**, sin cookie en ninguno de los dos casos. `429 DEMASIADAS_CUENTAS` por
  IP.
- `POST /api/v1/auth/login` ahora acepta cualquier rol (antes solo se documentaba para técnico y
  admin; el código ya lo permitía) y **rota la sesión**: la cookie que traiga la petición deja de
  valer.
- Nuevos códigos de error: `SIN_SESION` (ya existía en rutas técnicas, ahora también en las de
  escritura), `CUOTA_DE_REPORTES`, `DEMASIADAS_CUENTAS`, `CUENTA_LISTA`.

### Qué tienen que hacer los consumidores

- `web-ciudadano`: enviar la cookie (`credentials: 'same-origin'`) en crear reporte, subir foto y
  las rutas de cuenta; mantener `omit` en las lecturas públicas. Hecho en la misma tarea.
- `panel-admin`: nada; ya mandaba la cookie en todo.

## 0.2.0 — 2026-09-15

Cambios **aditivos**: ningún consumidor existente se rompe.

- `ReporteFeatureCollectionSchema` gana `total_exacto?: boolean`. El listado dejó de contar
  todas las filas que casan con el filtro en cada petición (era un escaneo completo por carga del
  panel) y ahora cuenta hasta un tope; cuando hay más resultados que ese tope, `total` es el tope
  y `total_exacto` es `false`. Quien lo ignore sigue viendo `total` como antes.
- Sin cambios en enums, severidad (sigue en `SEVERIDAD_VERSION = 1`) ni en los payloads de
  entrada.

### Cambios de API que NO tocan los esquemas Zod

- `POST /api/v1/reportes` acepta la cabecera **`Idempotency-Key`** (opcional). Con ella, repetir
  el mismo envío devuelve `200` con la cabecera `Idempotent-Replay: true` y el reporte ya creado,
  en vez de crear otro. Reutilizarla con otro contenido devuelve `409 CLAVE_IDEMPOTENCIA_REUSADA`.
- `GET /api/v1/reportes` devuelve `400 PAGINA_DEMASIADO_PROFUNDA` por encima del tope de
  `OFFSET`.
- Nuevos códigos de error: `FOTOS_INVALIDAS`, `DEMASIADOS_INTENTOS`, `ENVIO_EN_CURSO`,
  `CLAVE_IDEMPOTENCIA_INVALIDA`.
- Todas las respuestas llevan `X-Request-Id`.

## 0.1.0 — 2026-09-13
- Primera versión: enums, severidad v1 (§9.1), config de dominio, esquemas de reporte, geo, auth, admin, OpenAPI 3.1 generado y `dominio.json` para el ETL.
