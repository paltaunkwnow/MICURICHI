# Pruebas en rojo — Quitar manzana, dirección aproximada, duración y afectación del reporte (paquete `e2e`)

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Alcance de este archivo:** solo los archivos existentes de `e2e/tests/` (`ayudas.ts`, `recorrido-completo.spec.ts`, `resiliencia-interfaz.spec.ts`, `navegacion.spec.ts`, `separacion-publica-tecnica.spec.ts`, `api-contratos.spec.ts`, `datos-reales.spec.ts`). `quitar-campos-web.spec.ts` y `quitar-campos-panel.spec.ts` son de otros redactores.

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-X1 (ayuda) | E2E | `e2e/tests/ayudas.ts:28` (`reporteValido` sin `duracion_estimada` ni `afectacion`) | — (la usan los tests de abajo) | — |
| CA-X1 (API) | E2E | `e2e/tests/api-contratos.spec.ts:87` | `pnpm --filter e2e exec playwright test tests/api-contratos.spec.ts -g "CA-X1"` | no ejecutado: pila no disponible; rojo esperado (400 `PAYLOAD_INVALIDO`, ver sonda) |
| CA-X1 (recorrido) | E2E | `e2e/tests/recorrido-completo.spec.ts:24` | `pnpm --filter e2e exec playwright test tests/recorrido-completo.spec.ts -g "CA-X1"` | no ejecutado: pila no disponible; rojo esperado |
| CA-X1 (borrador) | E2E | `e2e/tests/resiliencia-interfaz.spec.ts:96` | `pnpm --filter e2e exec playwright test tests/resiliencia-interfaz.spec.ts -g "CA-X1"` | no ejecutado; probablemente **verde** hoy (ver hallazgos) |
| CA-X2 | E2E | `e2e/tests/navegacion.spec.ts:42` | `pnpm --filter e2e exec playwright test tests/navegacion.spec.ts -g "CA-X2"` | no ejecutado: pila no disponible; rojo esperado |
| CA-X3 | E2E | `e2e/tests/separacion-publica-tecnica.spec.ts:142` | `pnpm --filter e2e exec playwright test tests/separacion-publica-tecnica.spec.ts -g "CA-X3"` | no ejecutado: pila no disponible; rojo esperado |
| CA-X4 | E2E | `e2e/tests/api-contratos.spec.ts:112` y `e2e/tests/datos-reales.spec.ts:222` (sin modificar) | `pnpm --filter e2e exec playwright test tests/api-contratos.spec.ts tests/datos-reales.spec.ts -g "capas se sirven\|capa de manzanas"` | no ejecutado; debe seguir **verde** (es regresión, no rojo) |

`playwright test --list` (con `npx -y pnpm@12.4.1`, porque el `pnpm` global falla con `.tools\pnpm\12.4.1`) lista los 90 tests de 14 archivos sin errores de compilación; `tsc --noEmit -p e2e/tsconfig.json` y `biome lint` sobre los seis archivos tocados pasan.

## Salida literal de cada fallo (recortada)

La pila no estaba levantada (`curl -s http://127.0.0.1:3001/ready` → código 7, conexión rechazada; 3000, 3002 y 3100 igual), así que no hay salida de Playwright. Lo que sigue es la razón por la que cada prueba falla hoy.

### CA-X1 (API y todo lo que usa `reporteValido`)

Sonda contra el contrato vigente (`packages/contracts/dist`) con el payload nuevo de `reporteValido`:

```
safeParse(reporteValido).success = false
duracion_estimada: Invalid option: expected one of "menos_30min"|"30min_2h"|"2h_12h"|"mas_12h"
afectacion: Invalid option: expected one of "peatonal"|"vehicular"|"ingreso_viviendas"|"corte_total_via"
```

api-core valida con ese esquema, así que `crearReportePorApi` recibe 400 y falla en
`expect(r.status(), await r.text()).toBe(201)` (`ayudas.ts`, `crearReportePorApi`). Tras implementar,
el test además exige `severidad_calculada === 'media'` y `severidad_puntaje === 7` (2·2 + 3) en la vista técnica.

### CA-X1 (recorrido)

Tras marcar `tirante_estimado=rodilla`, en el paso 2 actual no hay `input[name="frecuencia"]`, se pulsa «Siguiente» y el
formulario lo bloquea porque falta la duración (paso 2 de hoy = tirante + duración); la frecuencia nunca aparece y
`locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check()` agota el tiempo. Si el formulario dejara pasar,
fallaría después en `getByText('7/12')` (hoy muestra `N/20`) y en la ausencia de `/\d+\/20\b/`.

### CA-X2

`getByText('puntaje = 2 × tirante + frecuencia', { exact: true })` no encuentra nada: `ComoFunciona.tsx:229` dice
`puntaje = 2 × tirante + duración + frecuencia + afectación`, y con `exact: true` no hay coincidencia parcial.

### CA-X3

`vistas.ts:137–151` serializa `manzana_id`, `direccion_aprox`, `duracion_estimada` y `afectacion` en la vista pública y en la
técnica, así que `expect(camposQuitadosPresentes(f.properties)).toEqual([])` falla en el primer reporte de la
primera vista («pública sin sesión») con los cuatro nombres en el array recibido.

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| La ruta pública devuelve lo mismo con cookie de técnico que sin ella | `separacion-publica-tecnica.spec.ts:67` y `:89` (sin cambios) |
| La vista técnica exige sesión (401) y no degrada a la pública | `separacion-publica-tecnica.spec.ts:114` (sin cambios) |
| Los puntos críticos no publican medidas de la geometría exacta | `separacion-publica-tecnica.spec.ts:184` (sin cambios) |
| Moderación previa: un reporte `nuevo` no es público | `recorrido-completo.spec.ts` «el reporte no se publica hasta que lo validan» (sin cambios) |
| Exportación con nota metodológica | `recorrido-completo.spec.ts` «sale en la exportación del técnico…», `api-contratos.spec.ts` «la exportación exige sesión de técnico» (sin cambios) |
| La capa `manzana` se sigue listando y sirviendo (CA-X4) | `api-contratos.spec.ts:112` (espera `['distrito_municipal','manzana','unidad_vecinal']`), `datos-reales.spec.ts:222` — **no se modificaron**, a propósito |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-X1, CA-X2, CA-X3, CA-X4 | Pila no disponible (api-core 3001, geo-service 3002, web 3000 y panel 3100 sin escuchar). No se levantó: correr `pnpm db:local`, `pnpm db:seed:samples`, `pnpm dev` y luego los comandos de la tabla. |

## Hallazgos sobre la spec

- **P-4 sin decidir** (§9 no lo resuelve): el recorrido y el test del borrador aceptan 4 o 5 pasos. El recorrido detecta si la frecuencia está en el mismo paso que el tirante; el borrador exige `^Paso 2 de [45]$` y que el total sea el mismo al volver al paso 1. Si se decide P-4, conviene fijar el número.
- **`7/12` en la vista previa del formulario:** ningún criterio fija el formato del puntaje en el formulario (hoy `FormularioReporte.tsx:813–814,1036` escribe `/20` a mano). Elegí la lectura más estricta de D1 (rango 3–12): el recorrido exige `7/12` y que no quede ningún `N/20`. Si el implementador de web-ciudadano quita el puntaje en vez de cambiarlo, este test lo marcará.
- **CA-X1 (borrador) probablemente pasa hoy:** tras quitar la línea de duración, marcar solo el tirante y recargar no depende de la implementación. Se deja porque es la adaptación que exige CA-X1 («ninguno referencia `duracion_estimada` ni `afectacion`»), no una prueba de rojo; el rojo de CA-X1 lo dan el recorrido y el test de API.
- **CA-X1 «ninguno referencia…» es estático:** se verifica con `grep -n "duracion_estimada\|afectacion" e2e/tests/ayudas.ts e2e/tests/recorrido-completo.spec.ts e2e/tests/resiliencia-interfaz.spec.ts` → sin coincidencias (código 1). Por eso las pruebas de ausencia de esos radios no están en estos archivos: las cubre CA-W1 en `quitar-campos-web.spec.ts`.
- **Rojo colateral esperado:** mientras la API exija los dos campos, también fallan por el mismo 400 `api-contratos.spec.ts:60` (el caso «fuera» espera 422 y recibirá 400) y los casos de `cuenta-ciudadana.spec.ts` que usan `reporteValido` (archivo fuera de este encargo, no tocado). Todos vuelven a verde con CA-C1 + CA-A1.
- **CA-X3 depende del seed:** necesita al menos un reporte `validado` publicado; con `pnpm db:seed:samples` lo hay.
