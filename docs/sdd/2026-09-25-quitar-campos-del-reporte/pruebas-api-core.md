# Pruebas en rojo — Quitar manzana, dirección, duración y afectación del reporte · `services/api-core`

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Paquete:** `services/api-core` únicamente (CA-A1 … CA-A6)
- **Comando base:** `npx -y pnpm@12.4.1 --filter api-core exec vitest run <archivo>` (`pnpm` directo falla en esta máquina: `.tools\pnpm\12.4.1 … no se reconoce`)

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-A1 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:153` (4 casos: rodilla+cada_lluvia_fuerte 7/media, tobillo+ocasional 4/baja, muslo+permanente 10/alta, mas_70+primera_vez 9/critica) | `… vitest run test/quitar-campos-del-reporte.test.ts -t "CA-A1"` | rojo (4) |
| CA-A1 (adaptación) | integración PGlite | `services/api-core/test/reportes.test.ts:82,98,190` y `test/cuentas-y-cuota.test.ts:241` (valores v1 → v2: `alta`→`media`, 13→7) | `… vitest run test/reportes.test.ts test/cuentas-y-cuota.test.ts` | rojo (4) |
| CA-A2 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:187` | `… -t "CA-A2"` | rojo |
| CA-A3 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:203` | `… -t "CA-A3"` | rojo |
| CA-A4 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:252` (público, `ReportePublicoSchema.strict()`), `:271` (técnico, `ReporteTecnicoSchema.strict()`), `:290` (vivienda degradada) | `… -t "CA-A4"` | rojo (2) · verde (1, guarda de invariante, ver hallazgos) |
| CA-A5 | integración PGlite | `services/api-core/test/quitar-campos-del-reporte.test.ts:309` (CSV), `:323` (GeoJSON) | `… -t "CA-A5"` | rojo (2) |
| CA-A6 | integración PGlite | `services/api-core/test/privacidad-ubicacion.test.ts:163` (bloque sustituido, 2 casos) | `… vitest run test/privacidad-ubicacion.test.ts -t "CA-A6"` | rojo (2) |
| CA-A6 | unitaria | `services/api-core/test/seguridad.test.ts:129` («desplaza la vivienda y oculta la dirección»), `:150` (vía pública / técnico) | `… vitest run test/seguridad.test.ts -t "CA-A6"` | rojo (2) |
| CA-A6 | integración PGlite | `services/api-core/test/privacidad-ubicacion.test.ts:196` (fixture de «el bbox público no puede usarse como oráculo…»; tests en `:216,228,236,257`, aserciones sin cambios) | `… vitest run test/privacidad-ubicacion.test.ts -t "oráculo"` | rojo (4, por el fixture: ver abajo) |
| CA-A6 | integración PGlite | `services/api-core/test/privacidad-ubicacion.test.ts:271` («el punto crítico no publica…», sin tocar) | `… -t "punto crítico"` | verde (invariante; debe seguir verde) |

## Salida literal de cada fallo (recortada)

### CA-A1

```
FAIL test/quitar-campos-del-reporte.test.ts > CA-A1: camino crítico con el payload nuevo > CA-A1: rodilla + cada_lluvia_fuerte sin duración ni afectación → 201, nuevo, UV resuelta, severidad v2 7/media
(ídem tobillo + ocasional, muslo + permanente, mas_70 + primera_vez)
AssertionError: {"codigo":"PAYLOAD_INVALIDO","mensaje":"Revisá los datos del reporte.","detalles":[{"campo":"duracion_estimada","mensaje":"Invalid option: expected one of \"menos_30min\"|\"30min_2h\"|\"2h_12h\"|\"mas_12h\""},{"campo":"afectacion","mensaje":"Invalid option: expected one of \"peatonal\"|\"vehicular\"|\"ingreso_viviendas\"|\"corte_total_via\""}]}: expected 400 to be 201
- 201
+ 400

FAIL test/reportes.test.ts > … > crea el reporte con UV resuelta y severidad calculada
AssertionError: expected 'alta' to be 'media'
FAIL test/reportes.test.ts > … > el técnico sí lo ve, con coordenada exacta y campos de moderación
AssertionError: expected 13 to be 7
FAIL test/reportes.test.ts > … > fusiona duplicados y reclasifica severidad con motivo
AssertionError: expected 'alta' to be 'media'
FAIL test/cuentas-y-cuota.test.ts > … > los campos que decide el servidor no se pueden fijar desde el cuerpo
AssertionError: expected 'alta' to be 'media'
```

### CA-A2

```
FAIL test/quitar-campos-del-reporte.test.ts > CA-A2: un cliente viejo (PWA en caché) no rompe la creación > CA-A2: con los cuatro campos responde 201 y ni la respuesta ni la vista técnica los traen
AssertionError: respuesta de POST: manzana_id: expected { …(20) } to not have property "manzana_id"
- Expected:
undefined
+ Received:
"manzana:A-1"
```

### CA-A3

```
FAIL test/quitar-campos-del-reporte.test.ts > CA-A3: la manzana que devuelve geo-service no se guarda ni se publica > CA-A3: ni la ruta pública, ni la técnica, ni la exportación traen manzana_id ni manzana:A-1
AssertionError: POST (respuesta) contiene la clave manzana_id: expected '{"type":"Feature","id":"c474e3ec-e71b…' not to contain 'manzana_id'
Expected: "manzana_id"
Received: "{…"unidad_vecinal":{"id":"unidad_vecinal:A",…},"manzana_id":"manzana:A-1","direccion_aprox":null,…"duracion_estimada":"2h_12h",…"afectacion":"ingreso_viviendas",…}"
```

### CA-A4

```
FAIL … > CA-A4: listado y detalle públicos no traen los cuatro campos y pasan ReportePublicoSchema.strict()
AssertionError: lista pública dbc7fa7a-…: manzana_id: expected { …(20) } to not have property "manzana_id"
- Expected:
undefined
+ Received:
null
FAIL … > CA-A4: listado y detalle técnicos no traen los cuatro campos y pasan ReporteTecnicoSchema.strict()
AssertionError: lista técnica dbc7fa7a-…: manzana_id: expected { …(37) } to not have property "manzana_id"
✓ CA-A4: la vivienda sigue degradada en público y exacta para el técnico
```

### CA-A5

```
FAIL … > CA-A5: el encabezado del CSV no nombra los cuatro campos y conserva la nota metodológica
AssertionError: manzana_id: expected [ 'id', 'estado', 'severidad', …(31) ] to not include 'manzana_id'
FAIL … > CA-A5: las properties del GeoJSON exportado no traen los cuatro campos y hay nota metodológica
AssertionError: export 1d2ae3b0-…: manzana_id: expected { …(37) } to not have property "manzana_id"
- Expected:
undefined
+ Received:
"manzana:A-1"
```

### CA-A6

```
FAIL test/privacidad-ubicacion.test.ts > CA-A6: ni la vista pública ni la técnica traen manzana_id > CA-A6: vivienda_o_predio: …
FAIL test/privacidad-ubicacion.test.ts > CA-A6: ni la vista pública ni la técnica traen manzana_id > CA-A6: via_publica: …
AssertionError: expected { …(20) } to not have property "manzana_id"
+ Received:
null
FAIL test/privacidad-ubicacion.test.ts > el bbox público no puede usarse como oráculo de la coordenada exacta > (los 4 tests)
error: null value in column "duracion_estimada" of relation "reporte_inundacion" violates not-null constraint
 ❯ insertarConPuntoPublicable test/privacidad-ubicacion.test.ts:197:22
FAIL test/seguridad.test.ts > jitter público (§13) > CA-A6: desplaza la vivienda y oculta la dirección
AssertionError: expected { …(20) } to not have property "direccion_aprox"
+ Received:
null
FAIL test/seguridad.test.ts > jitter público (§13) > CA-A6: la vía pública no se degrada y el técnico siempre ve la coordenada exacta
AssertionError: expected { …(37) } to not have property "direccion_aprox"
✓ con minpoints=1 un reporte solo forma su punto crítico: el centroide va degradado
```

### Qué asserts cambian en los tests existentes (CA-A6) y por qué

| Archivo | Antes | Después | Por qué |
|---|---|---|---|
| `privacidad-ubicacion.test.ts`, bloque «la manzana no se publica junto a una coordenada desplazada» (2 `it`) | `UPDATE … SET manzana_id = 'manzana:A-1'`; público de vivienda `manzana_id` `toBeNull()`; técnico `toBe('manzana:A-1')`; vía pública `toBe('manzana:A-1')` | Sustituido por `describe('CA-A6: ni la vista pública ni la técnica traen manzana_id')`, un `it` para `vivienda_o_predio` y otro para `via_publica`: detalle público, lista pública y detalle técnico `not.toHaveProperty('manzana_id')`; se mantiene `precision_degradada` según el tipo | La columna desaparece en 0010 (el UPDATE ya no se puede escribir) y D2 decide que el reporte no guarda manzana. La invariante de privacidad se endurece: ninguna vista, tampoco la técnica, trae nada derivado de la manzana |
| `privacidad-ubicacion.test.ts`, cabecera, punto 3 | describe la ocultación en vivienda | añade que desde esta corrida ninguna vista la trae | Documentación del cambio |
| `privacidad-ubicacion.test.ts`, `insertarConPuntoPublicable` (fixture del bloque «bbox … oráculo») | INSERT con `duracion_estimada`, `afectacion`, puntaje 10 | INSERT sin esas columnas, con `severidad_puntaje = 6`, `severidad_version = 2` | Tras 0010 las columnas no existen; las 4 aserciones del bloque no cambian. Hoy falla por `NOT NULL` y pasará con 0010 aplicada |
| `seguridad.test.ts`, `fila()` | trae `manzana_id`, `direccion_aprox`, `duracion_estimada`, `afectacion`; puntaje 10 | sin los cuatro; puntaje 6 (v2) | `FilaReporte` los pierde. Hasta que el implementador cambie `vistas.ts`, esto da un error de `typecheck` (TS2322) en `seguridad.test.ts:84` (esperado) |
| `seguridad.test.ts`, «desplaza la vivienda y oculta la dirección» | `direccion_aprox` `toBeNull()` | `not.toHaveProperty('direccion_aprox')` y `not.toHaveProperty('manzana_id')`; siguen `precision_degradada === true` y `lat !== f.lat` | La clave deja de existir; el desplazamiento se sigue comprobando igual |
| `seguridad.test.ts`, «la vía pública no se degrada y el técnico siempre ve la coordenada exacta» | técnico `direccion_aprox` `toBe('Calle Falsa 123')` | técnico `not.toHaveProperty('direccion_aprox' / 'manzana_id')` | CA-A4: el técnico tampoco lo recibe |

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| La ruta pública filtra y publica por `geom_publico`; con cookie de técnico devuelve lo mismo | `test/vista-publica-vs-tecnica.test.ts` («la ruta pública devuelve la vista pública pase lo que pase»); `test/privacidad-ubicacion.test.ts:216–257` («el bbox público no puede usarse como oráculo…», aserciones sin cambios) |
| Jitter determinista de vivienda y redondeo | `test/seguridad.test.ts` («jitter público (§13)»); `test/privacidad-ubicacion.test.ts` («la vista pública degrada la ubicación de una vivienda») |
| El punto crítico público no expone la coordenada exacta | `test/privacidad-ubicacion.test.ts:271` (sin cambios, verde) |
| La vista pública no publica autor ni `ip_hash` | `test/reportes.test.ts:232`; `test/cuentas-y-cuota.test.ts` |
| Ningún esquema de entrada acepta campos del servidor | `test/cuentas-y-cuota.test.ts` («los campos que decide el servidor no se pueden fijar desde el cuerpo»; solo cambia la banda esperada a v2) |
| Reclasificación manual con motivo; `severidad_efectiva` | `test/reportes.test.ts` («fusiona duplicados y reclasifica severidad con motivo») |
| Máquina de estados y moderación previa | `test/reportes.test.ts` |
| Exportaciones con nota metodológica; CSV sin inyección de fórmulas | `test/reportes.test.ts` («exporta GeoJSON y CSV…», «exportación CSV: contenido del vecino»); `test/seguridad.test.ts` («CSV: inyección de fórmulas»); CA-A5 también la comprueba |
| Fotos sin EXIF | `test/fotos.test.ts` (sin tocar) |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| — | Todas ejecutadas contra PGlite. No se corrió la suite completa de api-core; `tsc --noEmit` muestra solo el error esperado en `seguridad.test.ts:84`. |

## Hallazgos sobre la spec

- **CA-A3, CA-A4 y CA-A5 montan su escenario con el payload de una PWA vieja** (con `duracion_estimada` y `afectacion`; en A4 y A5, también con `direccion_aprox: 'Calle Falsa 123'` y `manzana_id`), no con el nuevo. Es la lectura más estricta (aunque el cliente mande los campos, no aparecen en ninguna salida) y hace que hoy fallen por la razón del criterio y no por el 400 de CA-A1. Así dependen de que CA-A2 se cumpla, cosa que la spec también exige.
- **CA-A1 compara contra valores escritos a mano** a partir de la tabla de CA-C5, no contra `calcularSeveridad`, para que un error en contracts no pase desapercibido aquí.
- **CA-A3:** el resolver de la suite (`resolverConManzana`, local al archivo) devuelve siempre `manzana: { id: 'manzana:A-1', codigo: 'A-1' }`, como el geo-service real (D2). Se busca el texto en el cuerpo crudo de las 7 respuestas (POST, lista y detalle públicos y técnicos, export CSV y GeoJSON).
- **CA-A4, «la vivienda sigue degradada…»** pasa hoy: es una guarda de la invariante de jitter dentro del mismo escenario, no un criterio nuevo. Se deja porque CA-A4 lo exige explícitamente y cubre el riesgo `privacidad` de §6 (perder la degradación al reescribir `vistas.ts:137–145`).
- **CA-A6, bloque «bbox … oráculo»:** la spec pide que siga «sin cambios de aserción, y en verde». Las aserciones no cambian, pero su fixture hace un INSERT directo con las columnas quitadas; se adaptó ahora, así que **hoy está en rojo** (por `NOT NULL` en `duracion_estimada`) y pasa a verde con la migración 0010 de `packages/db`. El implementador de api-core no debe tocarlo.
- **Tests con valores v1 adaptados a v2** (fuera de la lista literal de CA-A6, pero ligados a CA-A1): `reportes.test.ts:82,98,190` y `cuentas-y-cuota.test.ts:241` esperaban la banda y el puntaje v1 (`alta`, 13) del payload de `reporteValido`; ahora esperan `media` y 7. Valen igual antes y después de que el implementador quite los dos campos de `reporteValido`, porque v2 no los usa.
- **`test/resiliencia.test.ts:191,193`** usa un payload local con `duracion_estimada` y `afectacion`. No se tocó: tras el cambio el esquema los descarta (CA-A2) y el test sigue siendo válido. Si se quiere limpieza total, lo quita el implementador.
- `test/ayudas.ts` (`reporteValido`, líneas 93 y 95) sin tocar, como pidió el agente principal.
