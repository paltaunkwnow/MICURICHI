# Ampliación propuesta — expectativa del enlace de detalle en E2E

**APROBADO por el usuario el 2026-10-16:** «Sí, ajustar y verificar esa expectativa».
Cambio aplicado por Sagan tras preflight rojo y focal posterior 1/1, tipos y Biome aprobados
antes/después. Cicero revisó conforme y G4 completo independiente pasó **43/43**, sin retry.
Parte 5; un único archivo:
`e2e/tests/panel-mapa-reactivo.spec.ts`, en el caso que empieza en la línea 130,
exclusivamente la expectativa de `popup-ver-detalle` alrededor de las líneas 174–177.

## Evidencia y motivo

G4 de F4 reproduce el fallo en ambos intentos. La tarjeta se abre y su enlace existe;
el fallo es `toHaveAttribute('href', '/reportes/<id>')`. La URL recibida lleva
`?categoria=inundacion&volver=...`, con el retorno a la bandeja y su UV. Esto corresponde
a CA2 y §4.1/§4.4 del plan M5 aprobado: conservar la selección y filtros al ir y volver.
Retirar esos parámetros del producto para satisfacer la expectativa antigua perdería el
comportamiento aprobado. No se ha confirmado un fallo funcional de apertura del mapa.

Traza y error-context originales se conservan en `.turbo/m5-2026-10-15/f4/G4-f4-artefactos/`.
CA10 de pestaña oculta sí pasó en el primer intento. G1 pasó 47/47; G5/fronteras pueden
continuar independientemente y luego pasaron completos. El rojo original se conserva;
el recheck completo independiente posterior pasó 43/43 con la expectativa autorizada.

## Cambio exacto propuesto

Reemplazar solo la igualdad literal del href por comprobaciones semánticas más completas:

```ts
const href = await page.getByTestId('popup-ver-detalle').getAttribute('href');
expect(href).toBeTruthy();
if (!href) throw new Error('La tarjeta debe enlazar al detalle del reporte.');
const destino = new URL(href, PANEL);
expect(destino.origin).toBe(new URL(PANEL).origin);
expect(destino.pathname).toBe(`/reportes/${idReporte}`);
expect(destino.searchParams.get('categoria')).toBe('inundacion');
const volver = destino.searchParams.get('volver');
expect(volver).toBeTruthy();
if (!volver) throw new Error('El detalle debe conservar el retorno a la bandeja.');
const retorno = new URL(volver, PANEL);
expect(retorno.origin).toBe(new URL(PANEL).origin);
expect(retorno.pathname).toBe('/reportes');
expect(retorno.searchParams.get('categoria')).toBe('inundacion');
expect(retorno.searchParams.get('unidad_vecinal_id')).toBe(uvId);
```

Se conservan sin modificación las aserciones de tarjeta visible, fila resaltada, UV sin
alterar, ubicación del punto y todos los demás casos. No se retira ni omite la prueba, no
se cambian timeouts, fixtures, configuración E2E, servicios ni código del producto.

## Riesgo y verificación

Riesgo: que ampliar una expectativa de URL oculte un enlace equivocado. Se evita validando
origen, ruta/ID exactos, categoría y destino/UV del retorno; no usando un mero prefijo o
regex permisivo. La ordenación/serialización de query params no se trata como contrato.

Tras autorización: un escritor P5, preflight del caso rojo y reproducción posterior sobre
la misma fuente de producto congelada; repetir G4 completo y comparar sus 43 nombres con
FB, sin repetir grupos independientes ya completos. Tipos/Biome del archivo y diff propios.
El verificador conserva único turno pesado; el escritor espera su concesión antes de ejecutar.
F4 cierra solo con la prueba actualizada aprobada y verificada, nunca ignorando el rojo actual.
AGENTS.md §5.2 exige autorización explícita con archivo, motivo y riesgo para este ajuste.
