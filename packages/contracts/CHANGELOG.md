# Changelog — contracts

## 0.17.0 — 2026-10-04

**Sin ruptura: `ResolverRespuesta.manzana` queda obsoleto (siempre `null`).** geo-service deja de
calcular el point-in-polygon de manzana. Corría en cada resolución —una consulta espacial más contra
`geo.manzana_vigente` (27 527 polígonos)— y **ningún consumidor lo lee**: el reporte dejó de guardar
manzana en la migración 0010 (0.4.0) y los dos mapas solo dibujan distritos y UV.

- **`ResolverRespuestaSchema.manzana`**: no cambia de forma (sigue siendo
  `{ id, codigo } | null`), así que no rompe tipos. Se marca **`deprecated`** en el OpenAPI, con la
  nota de que es siempre `null` desde 0.17.0. Se quita en una **contracción posterior**, no ahora:
  un cliente con la app vieja en caché que todavía lea el campo recibe `null` en vez de un error.
- **OpenAPI**: el resumen de `POST /geo/v1/resolver` ya no menciona «manzana» (pasa a «distrito y
  UV»); el componente `ResolverRespuesta` marca `manzana` como `deprecated`.
- `TIPOS_CAPA` (incluye `manzana`) y la capa `manzana` como dato geográfico **no cambian**:
  geo-service la sigue listando y sirviendo en `/geo/v1/capas` (la E2E y el contrato la esperan).
  Lo único que cambia es que el resolver ya no devuelve una manzana.

**Consumidores:** geo-service (resolverPunto devuelve `manzana: null` y no consulta
`geo.manzana_vigente`). api-core, web-ciudadano, panel-admin y e2e no cambian: ya ignoraban el campo.

## 0.16.0 — 2026-10-03

**Sin ruptura: `GET /api/v1/indicadores` acepta filtros para las tortas del panel.** Las
estadísticas en porcentajes se reemplazan por dos tortas (reportes por distrito y por UV) con
filtro de severidad y drill-down por distrito; el panel necesita pedir el subconjunto que quiere
dibujar.

- **`IndicadoresFiltrosSchema`** (componente `IndicadoresFiltros` solo como parámetros de query,
  no como esquema de respuesta): dos filtros, los dos opcionales.
  - `severidad`: lista separada por comas de `SEVERIDADES`, sobre la severidad **efectiva**
    (`COALESCE(severidad_manual, severidad_calculada)`), con el mismo helper `listaDesdeQuery` que
    `GET /api/v1/reportes`. `?severidad=critica,alta`.
  - `distrito_id`: string no vacío; al tocar un distrito en la torta, la torta de UV muestra solo
    las suyas.
  - Sin ningún parámetro, la respuesta es idéntica a la de antes. Un valor de severidad fuera de
    `baja|media|alta|critica` da **400 FILTROS_INVALIDOS** (api-core valida con este esquema).
- **`IndicadoresSchema.por_unidad_vecinal`** ya traía `distrito_id` y `nombre` (desde 0.x): no
  cambia. El panel usa `distrito_id` para agrupar y para el clic en el distrito.

**Qué cuenta cada agregado con los filtros (decisión de api-core, documentada acá):** los dos
filtros acotan el subconjunto de reportes, y `total`, `por_estado`, `por_severidad`, `por_distrito`
y `por_unidad_vecinal` cuentan ese mismo subconjunto (`por_estado` sobre todos los estados, el resto
sobre `nuevo`/`validado`/`resuelto`, como siempre). `puntos_criticos_recurrentes` se filtra **solo
por `distrito_id`** (la columna existe en `punto_critico`), **no por `severidad`**: un punto crítico
agrupa reportes de varias severidades y su `severidad_max` no es la de un reporte, así que no casa
con la lista del filtro.

**Consumidores:** api-core aplica los filtros (SQL parametrizado) y valida la query. panel-admin
(tortas reactivas) los usa. geo-service, web-ciudadano y e2e no cambian.

## 0.15.0 — 2026-09-27

**Con ruptura en los tipos, no en el cable: los tres campos transitorios pasan a obligatorios.**
Tanda T8 del plan de producción (paso S37, segunda mitad).

| Campo | Desde | Ahora |
|---|---|---|
| `SesionActual.reportes_restantes_hoy` | 0.10.0 | obligatorio |
| `SesionActual.demora_proximo_s` | 0.11.0 | obligatorio |
| `ReportePublico.verificado` (y por herencia `ReporteTecnico` y la Feature pública) | 0.11.0 | obligatorio |

api-core ya los mandaba siempre, así que ninguna respuesta cambia. En el OpenAPI entran en
`required` de `SesionActual`, `ReporteTecnico` y las `properties` de `ReporteFeature`, y sus
descripciones dejan de decir «el esquema lo exige desde 0.15.0».

**Consumidores:** api-core, geo-service, panel-admin y e2e compilan sin tocarlos. web-ciudadano:
las cuatro pruebas que armaban sesiones y Features sin estos campos ahora los incluyen
(`src/lib/cupo.test.ts`, `publicacion.test.ts`, `sesion.test.ts` y `verificacion.test.ts`). La app
sigue tolerando su ausencia (una respuesta de un api-core anterior): sin `verificado` vale el
estado, y sin los del cupo no inventa minutos ni turnos.

## 0.14.0 — 2026-09-27

**Con ruptura, sin consumidores: se quitan las dos constantes deprecadas.** Tanda T8 del plan de
producción (paso S37).

| Se quita | Reemplazo (desde 0.10.0) |
|---|---|
| `CONFIG_DOMINIO.MINUTOS_ENTRE_REPORTES_POR_CUENTA` (60) | `REPORTES_POR_DIA_POR_CUENTA` (3): ya no hay espera entre reportes |
| `CONFIG_DOMINIO.FOTOS_POR_HORA_POR_CUENTA` (12) | `FOTOS_POR_DIA_POR_CUENTA` (12): el cupo es diario |

Tampoco están en `dist/dominio.json`. Antes de quitarlas se buscó en `services/`, `apps/`, `e2e/` y
`pipelines/`: nadie las usa (la única mención es la prueba de web-ciudadano que comprueba que no se
usen). No queda nada marcado `@deprecated`.

### Transitorios hasta 0.15.0

api-core ya manda siempre los tres campos (`/auth/yo` con `SesionActualSchema.parse`, y `verificado`
en la vista base de las tres vistas de reporte), pero el esquema los sigue aceptando ausentes:
volverlos obligatorios rompe la compilación de web-ciudadano, que arma sesiones y Features sin ellos
en cuatro pruebas. Pasan a obligatorios en 0.15.0, cuando esas pruebas los incluyan.

| Campo | Desde | Prueba de web-ciudadano que lo omite |
|---|---|---|
| `SesionActual.reportes_restantes_hoy` | 0.10.0 | `src/lib/cupo.test.ts`, `publicacion.test.ts` y `sesion.test.ts` (la constante `PERSONA`) |
| `SesionActual.demora_proximo_s` | 0.11.0 | ídem |
| `ReportePublico.verificado` (y por herencia `ReporteTecnico`) | 0.11.0 | `src/lib/verificacion.test.ts` (la función `reporte`, con `as ReporteFeature`) |

En el OpenAPI, la descripción de cada uno dice «api-core lo manda siempre; el esquema lo exige desde
0.15.0» en lugar de «Opcional hasta 0.14.0».

### OpenAPI: `GET /api/v1/fotos/{key}` y la moderación

Solo documentación: describe lo que api-core ya hace (`modoDeFoto` en `rutas/fotos.ts`).

- Técnico y admin ven, con `private, no-store`, las fotos de un reporte ya publicado que después se
  rechazó o se fusionó (`rechazado` o `duplicado`), para moderarlo.
- La foto de un reporte que todavía espera su `publicar_en` no la ve nadie más que el autor,
  tampoco técnicos ni admin.
- La descripción de `Cache-Control` nombra los tres casos de `private, no-store`: el autor (sus
  fotos en cualquier estado), técnico y admin con un reporte publicado y después rechazado o
  duplicado, y el dueño de una foto sin reporte.

**Consumidores:** ninguno cambia. api-core, geo-service, web-ciudadano, panel-admin y e2e compilan
con 0.14.0 sin tocarlos.

## 0.13.0 — 2026-09-27

**Sin ruptura: `507 SIN_ESPACIO` en `POST /api/v1/fotos` y `fotos: 'poco_espacio'` en `/ready`.**
Tanda T7 del plan de producción (paso S34): las fotos comparten el disco de la VPS con PostgreSQL.

- `POST /api/v1/fotos` → `507 SIN_ESPACIO` si, con las fotos en disco, queda menos que
  `FOTOS_MIN_LIBRE_BYTES` (variable de api-core, propuesta 2 GiB). Se responde **antes de
  procesar** la imagen y **sin gastar cupo**.
- `GET /ready` de api-core tiene esquema: `ReadyApiCoreSchema` (componente `ReadyApiCore`),
  `{ ok, db: 'ok' | 'error', geo: string, fotos: 'ok' | 'error' | 'poco_espacio', degradado }`.
  `ESTADOS_FOTOS_READY` lista los tres valores de `fotos`. Con `poco_espacio`, `200` y
  `degradado: true`: la réplica sigue en rotación. Solo la base da `503`.

**Consumidores:** api-core (S35): `AlmacenDisco.espacioLibre()`, el 507 antes de sharp y sin
reservar `fotos_n`, y `fotos: 'poco_espacio'` en `/ready`. web-ciudadano puede mostrar un texto
propio para el 507 (hoy cae en el genérico).

### Transitorios hasta 0.14.0 (vale para 0.10.0 a 0.13.0; en 0.14.0 se corrió a 0.15.0, ver arriba)

Para no romper a api-core a mitad de las tandas T3 a T7, estos campos nuevos son **opcionales**
hasta 0.14.0 (paso S37), que los vuelve obligatorios junto con quitar lo marcado `@deprecated`:

| Campo | Desde | Por qué opcional |
|---|---|---|
| `SesionActual.reportes_restantes_hoy` | 0.10.0 | api-core valida su respuesta de `/auth/yo` con el esquema: obligatorio antes de que lo mande, `/auth/yo` daría 500 |
| `SesionActual.demora_proximo_s` | 0.11.0 | ídem |
| `ReportePublico.verificado` (y por herencia `ReporteTecnico`) | 0.11.0 | api-core tipa su vista con `ReportePublico`: obligatorio rompería su compilación. Sin el campo, vale `ESTADOS_VERIFICADOS.includes(estado)` |

Deprecados, se quitan en 0.14.0: `CONFIG_DOMINIO.MINUTOS_ENTRE_REPORTES_POR_CUENTA` y
`CONFIG_DOMINIO.FOTOS_POR_HORA_POR_CUENTA`.

## 0.12.0 — 2026-09-27

**Sin ruptura: capas y teselas con la huella del contenido en la URL.** Tanda T6 (paso S29).

- `HuellaCapaSchema`: 16 caracteres hexadecimales en minúscula, los primeros 64 bits del SHA-256
  del GeoJSON web que geo-service tiene en memoria (del que salen también las teselas). Es del
  contenido servido: recargar la misma versión con otra geometría la cambia.
- `rutaCapaConHuella(capa, huella)` → `/geo/v1/capas/{capa}/v/{huella}` y
  `rutaTeselasConHuella(capa, huella)` → `/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt`
  (con `{z}/{x}/{y}` literales). Son las que geo-service pone en `CapaInfo.url`.
- `CODIGO_CAPA_CAMBIO = 'CAPA_CAMBIO'`: el `410` de una huella que ya no es la vigente, con
  `Cache-Control: no-store`. El cliente vuelve a pedir `/geo/v1/capas` y usa la url nueva.
- `CapaInfo` no cambia de forma: la huella viaja en `url`, que ahora está descrita.

### OpenAPI

| Ruta | Cache-Control |
|---|---|
| `GET /geo/v1/capas/{capa}/v/{huella}` (nueva) | con la huella vigente, `public, max-age=31536000, immutable` y `ETag`; con una vieja, `410 CAPA_CAMBIO` y `no-store`; `413 USAR_TESELAS` igual que antes |
| `GET /geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt` (nueva) | ídem; `204` si la tesela está vacía |
| `GET /geo/v1/capas/{capa}` y `GET /geo/v1/teselas/{capa}/{z}/{x}/{y}.mvt` | **alias** sin huella, `public, no-cache` |
| `GET /geo/v1/capas` y `GET /geo/v1/capas/vigentes` | `public, no-cache` |
| `GET /geo/v1/agregados/unidades-vecinales` y `GET /geo/v1/puntos-criticos` | `public, no-cache`; cifras con 120 s de antigüedad como máximo (TTL 100 s, `GEO_CACHE_AGREGADOS_MS`; edad máxima 120 s, `GEO_CACHE_AGREGADOS_EDAD_MAX_MS`) |

**Consumidores:** geo-service (S30): la huella, las rutas nuevas, el 410 y las cabeceras.
web-ciudadano (S31): capas y teselas solo por `CapaInfo.url`; el service worker reconoce la huella
en la ruta. panel-admin (S32): la URL escrita a mano en `api.ts` pasa a `CapaInfo.url`.

## 0.11.0 — 2026-09-27

**Publicación sin moderación previa.** Tanda T4 (paso S18, ADR 0006). Un reporte `nuevo` se
publica solo cuando llega su `publicar_en`, con la etiqueta exacta «NO SE HA VERIFICADO».
Cambios con ruptura en `ESTADOS_PUBLICOS`, `ReportePublicoSchema.estado`, `AgregadoUvSchema`,
la respuesta de `POST /api/v1/reportes` y la forma de `TRANSICIONES`.

### Visibilidad (`src/dominio/enums.ts`)

| Constante | 0.10.0 | 0.11.0 |
|---|---|---|
| `ESTADOS_PUBLICOS` | `validado`, `resuelto` | `nuevo`, `validado`, `resuelto` (type `EstadoPublico`) |
| `ESTADOS_VERIFICADOS` | — | `validado`, `resuelto`: `verificado = true`; los únicos que arman puntos críticos y el color público por UV |
| `ESTADOS_RETIRADOS` | — | `rechazado`, `duplicado`: rechazar o fusionar saca el reporte del mapa |
| `ETIQUETAS.estado_publico` | — | `nuevo` «NO SE HA VERIFICADO», `validado` «Verificado», `resuelto` «Resuelto». `ETIQUETAS.estado` (rótulos del panel) no cambia |

La vista pública es siempre `estado ∈ ESTADOS_PUBLICOS` **y** `publicar_en <= now()`. api-core y
geo-service arman el literal SQL desde `ESTADOS_PUBLICOS` (no `ANY($n)`), para que PostgreSQL use
los índices parciales de la migración 0015. `dist/dominio.json` suma `enums.estado_publico`,
`enums.estado_verificado` y `enums.estado_retirado`.

### Esquemas

- `ReportePublicoSchema.estado` pasa a `z.enum(ESTADOS_PUBLICOS)`: **rechaza** `rechazado` y
  `duplicado`, también en `ReporteFeatureSchema` y `ReporteFeatureCollectionSchema`.
  `ReporteTecnicoSchema.estado` sigue aceptando todos los estados.
- `ReportePublicoSchema.verificado: boolean`, **opcional hasta 0.14.0** (arriba).
- `MiReporteSchema` (nuevo): la vista pública, en cualquier estado, más `verificado`,
  `publicar_en`, `segundos_para_publicar` (entero ≥ 0, calculado en la base; 0 si ya pasó) y
  `retirado`. Sin autor ni campos de moderación. `MiReporteFeatureSchema` lleva la coordenada
  **exacta**: es solo para su autor, igual que el 201 de siempre. `MisReportesSchema`:
  `FeatureCollection` de hasta `MIS_REPORTES_MAX` (50).
- `AgregadoUvSchema` suma, **obligatorios**, `n_verificados` (entero ≥ 0) y
  `severidad_max_verificada` (severidad o `null`), solo con `validado` y `resuelto`. `n_reportes`
  y `severidad_max` pasan a contar también los `nuevo` publicados. La coropleta pública usa
  `severidad_max_verificada` y pinta neutra la UV sin verificados.
- `SesionActualSchema.demora_proximo_s`: entero de 0 a 3600, **opcional hasta 0.14.0**. 60 si la
  cuenta todavía no envió ningún reporte hoy, 240 si ya envió alguno. El tope es el de las
  variables de api-core (las pruebas corren con 0).

### Parámetros (`CONFIG_DOMINIO`, también en `dist/dominio.json`)

| Constante | Valor | Qué es |
|---|---|---|
| `DEMORA_PUBLICACION_PRIMERO_S` | `60` | Demora del 1.º reporte del día de la cuenta `<a confirmar con el municipio>` |
| `DEMORA_PUBLICACION_SIGUIENTES_S` | `240` | Demora del 2.º y el 3.º |
| `MIS_REPORTES_MAX` | `50` | Reportes que devuelve `GET /mis-reportes` |

`NOTA_METODOLOGICA` suma «Los reportes marcados «NO SE HA VERIFICADO» no fueron revisados por un
técnico y pueden ser erróneos.» (§9.5), antes de la frase del radio. Sigue en una línea.

### Máquina de estados

- Nueva transición `validado → rechazado`, **solo admin** y con `estado_motivo` (ya lo exigía
  `ReporteCambiarEstadoSchema` para `rechazado`): retira del mapa un verificado inapropiado.
- `TRANSICIONES` cambia de forma: de `{ [desde]: { a, rol } }` a `{ [desde]: { [hacia]: roles } }`,
  porque los roles ahora dependen de la transición y no del estado de origen. Nadie fuera de
  contracts lo leía directamente; `transicionPermitida(desde, hacia, rol)` no cambia de firma.
- `transicionExiste(desde, hacia)` (nueva): permite responder `403 SIN_PERMISO` a un técnico que
  intenta `validado → rechazado`, y `409 TRANSICION_NO_PERMITIDA` solo cuando la transición no
  existe.

### OpenAPI

- `POST /api/v1/reportes`: el `201` y el replay (`200`, `Idempotent-Replay: true`) devuelven
  `MiReporteFeature`, con `publicar_en` y `segundos_para_publicar`. El replay devuelve el mismo
  `publicar_en`. El resumen explica la demora de 60 y 240 s.
- `GET /api/v1/mis-reportes` (nueva): con sesión, `MisReportes`, `private, no-store` y
  `Vary: Cookie`; `401` sin sesión.
- `GET /reportes` y `/reportes/{id}`: la vista pública con `nuevo`; el `404` del detalle cubre el
  reporte en espera, rechazado o duplicado.
- `GET /fotos/{key}`: las publicadas con `public, no-cache` y `ETag` (antes `max-age=3600`), la
  visibilidad se comprueba antes del `304`; el autor ve las suyas en cualquier estado con
  `private, no-store`; una foto sin reporte, solo quien la subió; el resto `404` con `no-store`.
- `PATCH /reportes/{id}/estado`: `403` para la transición que existe pero no para el rol, `404`
  mientras el reporte espera su `publicar_en`.
- Técnica, exportación, indicadores y resumen ejecutivo: solo reportes ya publicados.
- `/auth/yo` menciona `demora_proximo_s`; `AgregadoUv` requiere los dos campos nuevos.

**Consumidores:** api-core (S20), geo-service (S21), web-ciudadano (S22: `ETIQUETAS.estado_publico`,
`MiReporte`, sin «solo vos»), panel-admin (S23: «Retirar del mapa» con `transicionPermitida`), e2e
(S24).

## 0.10.0 — 2026-09-27

**Cupo diario por cuenta y tope diario de altas por IP.** Tanda T3 (paso S13). Se quita la espera
de 60 min entre reportes.

### Parámetros (`CONFIG_DOMINIO`, también en `dist/dominio.json`)

| Constante | Valor | Qué es |
|---|---|---|
| `REPORTES_POR_DIA_POR_CUENTA` | `3` | Nueva. Reportes por cuenta y por día calendario en `ZONA_HORARIA`, contados en la base (`cuota_reporte_diaria`, migración 0014) `<a confirmar con el municipio>` |
| `FOTOS_POR_DIA_POR_CUENTA` | `12` | Nueva. Fotos por cuenta y por día calendario |
| `ALTAS_POR_DIA_POR_IP` | `10` | Nueva. Cuentas nuevas desde una misma IP por día calendario, además del límite por hora |
| `MINUTOS_ENTRE_REPORTES_POR_CUENTA` | `60` | **`@deprecated`**: ya no hay espera entre reportes. Se quita en 0.14.0 |
| `FOTOS_POR_HORA_POR_CUENTA` | `12` | **`@deprecated`**: el cupo es diario. Se quita en 0.14.0 |

El día se cuenta en la zona horaria de la ciudad y no en UTC, y el cupo vuelve entero a la
medianoche local.

### `SesionActualSchema` (`GET /api/v1/auth/yo`)

- `reportes_restantes_hoy`: entero ≥ 0, **opcional hasta 0.14.0** (arriba).
- `puede_reportar_desde` no cambia de tipo, pero ahora es `null` o **la próxima medianoche
  local** (ISO 8601 con desfase) cuando no quedan reportes hoy.

### OpenAPI

- `POST /reportes` `429 CUOTA_DE_REPORTES`: «Ya enviaste los 3 reportes de hoy. Vas a poder
  enviar otro mañana.», con `Retry-After` hasta la medianoche local. Ya no menciona 60 min.
- `POST /fotos` `429 CUOTA_DE_FOTOS`: 12 fotos por cuenta y por día, reservadas antes de
  procesar y devueltas si el procesamiento falla.
- `POST /auth/registro` `429 DEMASIADAS_CUENTAS`: por hora o por el tope de 10 altas por día.
- `/auth/yo` describe `reportes_restantes_hoy` y la medianoche.

**Consumidores:** db (S14: `cuota_reporte_diaria`), api-core (S15: contador atómico, idempotencia
por cuenta, altas por IP, `reportes_restantes_hoy`), web-ciudadano (S16: «Te quedan N de 3
reportes hoy»; `errores.ts` y `PanelCuenta.tsx` todavía usan las dos constantes deprecadas), e2e
(S17).

## 0.9.0 — 2026-09-26

**Cambio con ruptura en `POST /api/v1/reportes`: la posición del dispositivo pasa a ser
obligatoria.** El punto del reporte tiene que estar a 60 m o menos de donde está el teléfono al
enviar, y api-core lo vuelve a comprobar. Es la versión de la tanda T2 del plan de producción
(`docs/revision/2026-09-26-plan-produccion-vps.md`, paso S07).

### Con ruptura: `ReporteCrearSchema`

| 0.8.0 | 0.9.0 |
|---|---|
| — | `dispositivo` **obligatorio**: `{ lat, lon, precision_m, antiguedad_s }` (`DispositivoSchema`, `type Dispositivo`) |
| `ubicacion_metodo` (`gps` \| `manual`), obligatorio | no existe: lo deriva api-core (`gps` si el punto quedó dentro del margen de error del dispositivo, a `max(2 m, dispositivo.precision_m)` o menos; `manual` si quedó más lejos, dentro del radio) |
| `precision_gps_m`, opcional | no existe: api-core guarda `dispositivo.precision_m` |

- `dispositivo.lat` / `dispositivo.lon`: los mismos rangos que `lat` / `lon` (EPSG:4326).
- `dispositivo.precision_m`: número de 0 a 10 000 (`Geolocation.coords.accuracy`).
- `dispositivo.antiguedad_s`: número ≥ 0, con decimales si hace falta. Si el reloj da la lectura
  en el futuro, el cliente manda 0.
- Zod solo acota esos **rangos físicos**. Con 80 m de precisión o 900 s de antigüedad el cuerpo
  pasa el esquema: los topes de negocio son `422` de api-core (abajo). Si el tope estuviera en
  Zod, la respuesta sería `400 PAYLOAD_INVALIDO` y la interfaz no podría explicar qué pasa.
- Un cuerpo sin `dispositivo`, o con `null`, falla con el error en `dispositivo`. Un cliente
  anterior (PWA en caché) recibe `400 PAYLOAD_INVALIDO` hasta que se actualiza.
- Un cuerpo que todavía manda `ubicacion_metodo` o `precision_gps_m` no falla: Zod descarta esas
  claves.

### Con ruptura: `ReporteTecnicoSchema.distancia_dispositivo_m`

Campo nuevo y **obligatorio** en la vista técnica (`GET /tecnico/reportes`, `GET
/tecnico/reportes/{id}`, respuestas de moderación): entero de 0 a 1000 o `null`. Es la distancia
redondeada entre el punto y la posición del dispositivo al enviar (migración 0013); `null` en los
reportes anteriores. La vista pública no lo lleva. `ubicacion_metodo` y `precision_gps_m` siguen
en la vista técnica, ahora con su descripción.

### `422` nuevos de `POST /api/v1/reportes`

`CODIGOS_UBICACION_DISPOSITIVO`, en el orden en que api-core los comprueba (después de Zod y
antes de resolver la ubicación). Ninguno gasta cupo.

| Código | Cuándo |
|---|---|
| `PRECISION_INSUFICIENTE` | `dispositivo.precision_m` > `PRECISION_DISPOSITIVO_MAX_M` (50 m) |
| `POSICION_VENCIDA` | `dispositivo.antiguedad_s` > `POSICION_ANTIGUEDAD_MAX_S` (600 s) |
| `UBICACION_FUERA_DE_RADIO` | el punto está a más de `REPORTE_RADIO_DISPOSITIVO_M` + `REPORTE_RADIO_TOLERANCIA_M` (60 m + 0,5 m) de `dispositivo` |

`FUERA_DE_COBERTURA` sigue igual.

### Distancias (`src/dominio/geo.ts`, nuevo)

- `distanciaMetros(a, b)`: haversine sobre la esfera de radio medio `RADIO_TIERRA_M`
  (6 371 008,8 m). A 60 m, en Santa Cruz, difiere del elipsoide WGS 84 en unos 0,3 m como mucho.
- `dentroDelRadio(punto, centro, { radioM?, toleranciaM? })`: `true` si la distancia, medida al
  milímetro, es ≤ `radioM` + `toleranciaM`. El radio por defecto es `REPORTE_RADIO_DISPOSITIVO_M`
  y la tolerancia, 0. Acepta 59 y 60 m y rechaza 61 m. Medir al milímetro evita que un punto
  puesto justo en el borde quede afuera por la coma flotante (60,00000000005 m).
- Tipos `PuntoLatLon`, `OpcionesRadio` y `CodigoUbicacionDispositivo`.

La misma cuenta sirve a la interfaz, que recorta el marcador al círculo, y a api-core, que la
vuelve a comprobar. `distanciaAproximadaM` (equirectangular) no cambia.

### Parámetros (`CONFIG_DOMINIO`, también en `dist/dominio.json`)

| Constante | Valor | Qué es |
|---|---|---|
| `REPORTE_RADIO_DISPOSITIVO_M` | `60` | Nueva. Distancia máxima entre el punto y la posición del dispositivo |
| `PRECISION_DISPOSITIVO_MAX_M` | `50` | Nueva. Precisión máxima que se acepta (decisión del usuario, configurable) |
| `POSICION_ANTIGUEDAD_MAX_S` | `600` | Nueva. Antigüedad máxima de la posición `<a confirmar con el municipio>` |
| `REPORTE_RADIO_TOLERANCIA_M` | `0.5` | Nueva. Metros que api-core suma al radio al comprobarlo, por el redondeo de las coordenadas. La interfaz recorta sin tolerancia |

### Nota metodológica

`NOTA_METODOLOGICA` suma la limitación de §9.5 «El radio de 60 m no prueba que el vecino
estuviera en el lugar: el GPS del teléfono se puede falsear.», que así llega al campo
`nota_metodologica` y al encabezado del CSV de toda exportación. Sigue en una sola línea.

### OpenAPI

- `POST /api/v1/reportes`: la descripción explica `dispositivo`, que su posición no se guarda, no
  se registra ni entra en la huella de idempotencia, y que `ubicacion_metodo` y `precision_gps_m`
  los deriva el servidor. `400` suma el caso del `dispositivo` ausente o fuera de rango; `422`
  documenta los tres códigos nuevos y `FUERA_DE_COBERTURA`. El de `UBICACION_FUERA_DE_RADIO` dice
  la distancia con la que rechaza api-core: más de 60,5 m (el radio más la tolerancia).
- Componente `ReporteCrear`: `dispositivo` en `required`, sin `ubicacion_metodo` ni
  `precision_gps_m`.
- Componente `ReporteTecnico` (y los que lo incluyen): `distancia_dispositivo_m` en `required`, y
  `ubicacion_metodo` describe la regla del margen de error (abajo).

### Cómo se deriva `ubicacion_metodo`

`gps` si la distancia entre el punto y `dispositivo` es de `max(2 m, dispositivo.precision_m)` o
menos; `manual` si es mayor. El plan decía «`gps` con 2 m o menos», pero la revisión
de la tanda T2 mostró que no sirve con un teléfono real: la interfaz envía la posición releída al
tocar Enviar y el punto sigue donde lo dejó el GPS en el paso 1, así que dos lecturas precisas
difieren varios metros aunque nadie haya movido el punto, y casi todo salía `manual` («Ajustado a
mano» en el panel). Con el margen de error, `gps` es «el punto está donde el teléfono dice estar,
dentro de lo que el propio teléfono declara que puede errar», y `manual`, que quedó más lejos que
eso: lo movieron o la persona caminó entre el paso 1 y el envío. La precisión y la distancia se
guardan igual y el panel las muestra.

### Qué tienen que hacer los consumidores

- `packages/db` (paso S08): migración 0013 con `reporte_inundacion.distancia_dispositivo_m
  smallint NULL` y `CHECK` de 0 a 1000.
- `api-core` (paso S09): después de Zod y antes del resolver, en este orden: precisión >
  `PRECISION_DISPOSITIVO_MAX_M` → `422 PRECISION_INSUFICIENTE`; antigüedad >
  `POSICION_ANTIGUEDAD_MAX_S` → `422 POSICION_VENCIDA`;
  `!dentroDelRadio({ lat, lon }, dispositivo, { toleranciaM: REPORTE_RADIO_TOLERANCIA_M })` →
  `422 UBICACION_FUERA_DE_RADIO`. Ninguno gasta cupo. Guardar `precision_gps_m` =
  `dispositivo.precision_m` y `distancia_dispositivo_m` redondeada, y derivar `ubicacion_metodo`
  con el margen de error.
  Devolver `distancia_dispositivo_m` en la vista técnica. `dispositivo` fuera de la huella de
  idempotencia, de la auditoría y de los logs (pino redacta `body.dispositivo`).
- `web-ciudadano` (paso S10): mandar `dispositivo` y dejar de mandar `ubicacion_metodo` y
  `precision_gps_m`. Recortar el marcador y validar coordenadas con `dentroDelRadio`, sin
  tolerancia. Mostrar un texto propio para cada `422`.
- `panel-admin` (paso S11): mostrar la precisión y `distancia_dispositivo_m` en el detalle.
- `e2e` (paso S12): todo `POST /reportes` lleva `dispositivo` a 60 m o menos del punto.

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
