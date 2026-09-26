# Changelog — contracts

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
