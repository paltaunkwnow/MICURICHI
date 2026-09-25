# Pruebas en rojo — Quitar campos del reporte · apps/web-ciudadano

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-W1 | E2E | `e2e/tests/quitar-campos-web.spec.ts:140` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W1"` | no ejecutada (pila no disponible); rojo previsto: el paso 2 tiene `input[name="duracion_estimada"]` |
| CA-W2 | E2E | `e2e/tests/quitar-campos-web.spec.ts:172` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W2"` | no ejecutada; **previsiblemente verde** con el código actual (ver hallazgos) |
| CA-W3 | E2E | `e2e/tests/quitar-campos-web.spec.ts:183` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W3"` | no ejecutada; rojo previsto: el cuerpo del POST lleva `duracion_estimada` y `afectacion` |
| CA-W4 | unitaria | `apps/web-ciudadano/src/lib/borrador.test.ts:113` | `pnpm --filter web-ciudadano exec vitest run src/lib/borrador.test.ts -t "CA-W4"` | rojo |
| CA-W5 | unitaria | `apps/web-ciudadano/src/lib/formato.test.ts:32` | `pnpm --filter web-ciudadano exec vitest run src/lib/formato.test.ts -t "CA-W5"` | verde (ya se cumple: título por nombre de UV / «Unidad vecinal sin datos») |
| CA-W5 | unitaria | `apps/web-ciudadano/src/lib/formato.test.ts:42` | ídem | rojo |
| CA-W5 | unitaria | `apps/web-ciudadano/src/lib/formato.test.ts:53` | ídem | rojo |
| CA-W5 | typecheck | — | `pnpm --filter web-ciudadano typecheck` | verde hoy; se pone rojo cuando contracts quite los campos y la app siga leyéndolos |
| CA-W6 | E2E | `e2e/tests/quitar-campos-web.spec.ts:199` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W6"` | no ejecutada; rojo previsto: `HojaDetalle` tiene `<dt>Duración</dt>` y `<dt>Afectación</dt>` |
| CA-W7 | E2E | `e2e/tests/quitar-campos-web.spec.ts:227` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W7"` | no ejecutada; rojo previsto: a zoom 16 se piden `/geo/v1/teselas/manzana/…` (o `/geo/v1/capas/manzana`) |
| CA-W8 | E2E | `e2e/tests/quitar-campos-web.spec.ts:268` | `pnpm --filter e2e exec playwright test tests/quitar-campos-web.spec.ts -g "CA-W8"` | no ejecutada; rojo previsto: el texto es `puntaje = 2 × tirante + duración + frecuencia + afectación` y las bandas 5–8 / 9–12 / 13–16 / 17–20 |

`pnpm` falla en esta máquina con el wrapper de `.tools\pnpm\12.4.1`; los comandos se corrieron con `npx -y pnpm@12.4.1 …`. `playwright test --list` lista los 6 tests del archivo nuevo sin errores; `tsc --noEmit` de `e2e` y `biome check` quedan limpios para los tres archivos tocados.

## Salida literal de cada fallo (recortada)

### CA-W4

```
 FAIL  src/lib/borrador.test.ts > borrador del formulario de reporte > CA-W4: un borrador guardado antes del cambio se restaura sin duración ni afectación
AssertionError: expected [ 'descripcion', …(4) ] to not include 'duracion_estimada'
 ❯ src/lib/borrador.test.ts:138:56
    136|     const restaurado = b as Borrador | null;
    137|     expect(restaurado).not.toBeNull();
    138|     expect(Object.keys(restaurado?.valores ?? {})).not.toContain('dura…
       |                                                        ^
```

### CA-W5

```
 FAIL  src/lib/formato.test.ts > formato > CA-W5: el título no usa la dirección aproximada aunque llegue en un objeto viejo
AssertionError: expected 'Av. Piraí esq. Los Tajibos' to be 'Los Lotes' // Object.is equality
Expected: "Los Lotes"
Received: "Av. Piraí esq. Los Tajibos"
 ❯ src/lib/formato.test.ts:50:34

 FAIL  src/lib/formato.test.ts > formato > CA-W5: formato.ts no exporta etiquetaDuracion ni etiquetaAfectacion
AssertionError: expected [ 'SEVERIDADES_ORDEN', …(19) ] to not include 'etiquetaDuracion'
 ❯ src/lib/formato.test.ts:54:38

 Test Files  2 failed (2)
      Tests  3 failed | 19 passed (22)
```

### CA-W1, CA-W2, CA-W3, CA-W6, CA-W7, CA-W8

No ejecutadas: `curl http://127.0.0.1:3001/ready` no responde (código 7, pila no levantada). Salida de `--list`:

```
Listing tests:
  [chromium] › quitar-campos-web.spec.ts:140:7 › … › CA-W1: el formulario no pregunta duración ni afectación y el resumen tampoco las muestra
  [chromium] › quitar-campos-web.spec.ts:172:7 › … › CA-W2: «Paso N de M» es coherente y ningún paso queda vacío
  [chromium] › quitar-campos-web.spec.ts:183:7 › … › CA-W3: el cuerpo de POST /api/v1/reportes no lleva los cuatro campos
  [chromium] › quitar-campos-web.spec.ts:199:7 › … › CA-W6: la hoja de detalle muestra tirante y frecuencia, y no duración ni afectación
  [chromium] › quitar-campos-web.spec.ts:227:9 › … › CA-W7: capas del mapa público › CA-W7: al acercar a zoom ≥ 15 no se pide la capa de manzanas; distritos y UV sí
  [chromium] › quitar-campos-web.spec.ts:268:7 › … › CA-W8: «Cómo funciona» explica la fórmula v2 sin duración ni afectación
Total: 6 tests in 1 file
```

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| El borrador conserva la clave de idempotencia y descarta basura o caducados | `apps/web-ciudadano/src/lib/borrador.test.ts` («conserva la clave de idempotencia…», «descarta un borrador caducado…», «ignora basura…») |
| Caché del service worker de teselas (usa URLs de manzana como ejemplo; la capa se sigue sirviendo, D2) | `apps/web-ciudadano/src/lib/sw.test.ts:266–274`, sin cambios |
| El detalle muestra UV y distrito resueltos por PIP | `e2e/tests/recorrido-completo.spec.ts`, `e2e/tests/mapa-publico.spec.ts` |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-W1, CA-W2, CA-W3, CA-W6, CA-W7, CA-W8 | Pila no disponible (`api-core` en 3001 no responde). Requieren `pnpm db:local`, `pnpm db:seed:samples` y `pnpm dev`. |

## Hallazgos sobre la spec

- **CA-W2 ya se cumple hoy**: el formulario actual tiene 5 pasos coherentes («Paso N de 5» constante, cada paso con controles). El recorrido del test contesta cualquier grupo de radios que encuentre, así que no depende de si hay 4 o 5 pasos (P-4 sigue abierta) y previsiblemente pasa sin implementar. Se deja como guarda de regresión del riesgo `ui` de §6; el orquestador decide si se conserva.
- **CA-W5, primera aserción ya se cumple**: con el objeto de la spec (sin `direccion_aprox`), `tituloReporte` ya devuelve el nombre de la UV. Lectura estricta adoptada: el título no puede usar `direccion_aprox` aunque llegue en un objeto viejo (caché de la PWA); eso sí está en rojo. Se reescribió el test existente «usa el nombre de la UV cuando no hay dirección», que afirmaba lo contrario.
- **CA-W7**: la instancia de MapLibre no está expuesta a la página, así que no se pueden consultar ids de capa (`capa-manzana*`) desde Playwright. La prueba lo observa por red: tras volar a zoom 16 con «Centrar el mapa en mi ubicación» (geolocalización simulada en `PUNTO_CENTRO`, confirmado por teselas OSM de z ≥ 15) exige peticiones de `distrito_municipal` y `unidad_vecinal` y ninguna de `/geo/v1/teselas/manzana/` ni `/geo/v1/capas/manzana`. Usa una espera fija de 3 s para dar tiempo a una petición de manzana que llegara tarde.
- **CA-W8**: la spec escribe las bandas como «3–4 / 5–7…»; la tabla actual usa «5 a 8». La prueba compara solo los números y el nombre de la banda, no el separador.
- **Sin criterio**: el formulario muestra el puntaje como `{puntaje}/20` (`FormularioReporte.tsx`, paso 5) y el párrafo de reglas de «Cómo funciona» describe E2 («si entra a las viviendas o corta la vía…»). Con v2 deberían ser `/12` y sin E2; ningún CA-W lo exige. CA-W8 solo prohíbe las palabras «duración» y «afectación», que ese párrafo no usa.
- **Sin criterio**: `leerBorrador` acota `paso` a 1..5; si P-4 se resuelve con 4 pasos, un borrador viejo en el paso 5 quedaría fuera de rango.
- CA-W6 abre `/reporte/<id>` (hoja de detalle sobre el mapa) con el primer reporte publicado del seed, como hace `recorrido-completo.spec.ts`; no crea reportes, así que no depende de que `ayudas.ts#reporteValido` ya esté adaptado.
