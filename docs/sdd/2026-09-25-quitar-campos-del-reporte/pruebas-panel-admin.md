# Pruebas en rojo — Quitar campos del reporte · `apps/panel-admin`

- **Spec:** `spec.md` (aprobada el 2026-09-25, §9)
- **Escritas el:** 2026-09-25
- **Alcance de este archivo:** criterios CA-P1 a CA-P4. Los demás paquetes tienen su propio `pruebas-*.md`.

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-P1 | E2E | `e2e/tests/quitar-campos-panel.spec.ts:48` | `pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts -g "CA-P1"` | no ejecutada (pila no disponible) |
| CA-P2 | unitaria (render estático) | `apps/panel-admin/src/componentes/FactoresSeveridad.test.ts:45`, `:55`, `:59` | `pnpm --filter panel-admin exec vitest run src/componentes/FactoresSeveridad.test.ts -t "CA-P2"` | rojo (3/3) |
| CA-P2 | E2E | `e2e/tests/quitar-campos-panel.spec.ts:79` | `pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts -g "CA-P2"` | no ejecutada (pila no disponible) |
| CA-P3 | unitaria | `apps/panel-admin/src/lib/formato-sin-campos.test.ts:5` | `pnpm --filter panel-admin exec vitest run src/lib/formato-sin-campos.test.ts -t "CA-P3"` | rojo |
| CA-P3 | comando | — | `pnpm --filter panel-admin typecheck` | hoy verde (ver hallazgos) |
| CA-P4 | E2E | `e2e/tests/quitar-campos-panel.spec.ts:96` | `pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts -g "CA-P4"` | no ejecutada (pila no disponible) |

`pnpm --filter e2e exec playwright test tests/quitar-campos-panel.spec.ts --list` lista las 3 pruebas (proyecto `chromium`).
Biome (`biome check`) y `tsc --noEmit` de panel-admin pasan sobre los archivos nuevos.

## Salida literal de cada fallo (recortada)

### CA-P2 (unitaria)

```
 ❯ src/componentes/FactoresSeveridad.test.ts (3 tests | 3 failed) 31ms
     × CA-P2: con T = muslo y F = permanente hay exactamente dos filas, Tirante ×2 y Frecuencia 17ms
     × CA-P2: el título dice «Cómo se llegó a 10 de 12 puntos» 6ms
     × CA-P2: la fórmula es «puntaje = 2 × tirante + frecuencia» y no nombra duración ni afectación 4ms

AssertionError: expected [ 'Tirante ×2', 'Duración', …(2) ] to have a length of 2 but got 4
 ❯ src/componentes/FactoresSeveridad.test.ts:47:21

AssertionError: expected 'Cómo se llegó a 10 de 20 puntos Tiran…' to contain 'Cómo se llegó a 10 de 12 puntos'
Received: "Cómo se llegó a 10 de 20 puntos Tirante ×2 3/4 Duración /4 Frecuencia 4/4 Afectación /4
  puntaje = 2 × tirante + duración + frecuencia + afectación. El tirante pesa doble …"
 ❯ src/componentes/FactoresSeveridad.test.ts:56:25

AssertionError: expected 'Cómo se llegó a 10 de 20 puntos Tiran…' to contain 'puntaje = 2 × tirante + frecuencia'
 ❯ src/componentes/FactoresSeveridad.test.ts:61:15
```

### CA-P3

```
 FAIL  src/lib/formato-sin-campos.test.ts > formato sin duración ni afectación > CA-P3: formato.ts no exporta etiquetaAfectacion ni etiquetaDuracion y conserva tirante y frecuencia
AssertionError: expected [ 'ZONA_HORARIA', …(27) ] to not include 'etiquetaAfectacion'
 ❯ src/lib/formato-sin-campos.test.ts:7:28
      6|     const exportados = Object.keys(formato);
      7|     expect(exportados).not.toContain('etiquetaAfectacion');
      8|     expect(exportados).not.toContain('etiquetaDuracion');
```

### CA-P1, CA-P2 (E2E), CA-P4

No ejecutadas: `curl -s http://127.0.0.1:3001/ready` no responde (código 7, conexión rechazada).
Fallo esperado con la pila levantada y sin implementar: CA-P1 encuentra «Manzana», «Dirección
aproximada», «Duración estimada» y «Afectación» entre los `dl.lista-datos > dt`; CA-P2 lee
«Cómo se llegó a 10 de 20 puntos» y 4 filas; CA-P4 registra peticiones a
`/geo/v1/teselas/manzana/16/…` (o al GeoJSON de manzana) desde el detalle, que abre el mapa en zoom 16.

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|
| El detalle del panel conserva «En el mapa público se ve» | ninguno previo; lo cubre la nueva `quitar-campos-panel.spec.ts:48` (CA-P1), que además comprueba el texto «En su sitio, redondeado a 5 decimales» para `via_publica` |
| La capa `manzana` se sigue sirviendo | `e2e/tests/datos-reales.spec.ts:222`, `e2e/tests/api-contratos.spec.ts:99` (no tocados); CA-P4 además exige que `GET /geo/v1/capas` siga listando `manzana` |
| Etiquetas de severidad, estado, tirante, fechas, avisos de resolución | `apps/panel-admin/src/lib/formato.test.ts` (sin cambios) |

## No ejecutadas y por qué

| CA | Motivo |
|---|---|
| CA-P1 | E2E; pila no disponible (`/ready` en 3001 no responde) |
| CA-P2 (E2E) | Ídem; el criterio queda en rojo por la unitaria |
| CA-P4 | Ídem |

## Hallazgos sobre la spec

- **CA-P2:** la spec pide E2E «o unitaria si el cálculo se extrae a `lib/`». Para no tocar
  producción, la unitaria renderiza el componente real con `react-dom/server`
  (`renderToStaticMarkup`) en un `.test.ts` dentro de `src/componentes/`; entra en el `include` de
  `vitest.config.ts` (`src/**/*.test.ts`). Se mantiene también la E2E. Lectura estricta: además de
  contener la fórmula, el desglose no puede nombrar «duración» ni «afectación», y los puntos de las
  filas deben ser `3/4` y `4/4`.
- **CA-P3:** `pnpm --filter panel-admin typecheck` hoy pasa porque contracts aún no cambió; se
  pondrá rojo cuando contracts quite `Duracion`, `Afectacion`, `PUNTOS.duracion`, etc., y vuelve a
  verde solo con la implementación. No es una prueba escrita sino un comando de la puerta.
- **CA-P4:** la spec pide «no hay capa ni fuente `capa-manzana`», pero el mapa del panel no expone
  la instancia de MapLibre (ni en `window` ni con `data-testid`), así que los ids de capa no son
  observables desde Playwright sin tocar producción. La prueba verifica lo observable: ninguna
  petición a la URL de la capa `manzana` (prefijo de su `url` en `/geo/v1/capas` y
  `/geo/v1/teselas/manzana/`) y sí a las de distrito y UV, con el mapa del detalle en zoom 16. Si
  un implementador dibujara manzanas desde otra fuente ya cargada, esta prueba no lo detectaría.
- CA-P4 usa `waitForTimeout(1500)` tras ver las peticiones de UV para dar margen a una eventual
  petición de manzana; es la única espera fija del archivo.
- Fuera de mi alcance: `pnpm --filter e2e exec tsc --noEmit` falla hoy por
  `e2e/tests/quitar-campos-web.spec.ts:43` y `:281` (archivo de otro redactor); mi archivo no
  aporta errores.
