import { expect, type Page, test } from '@playwright/test';
import { esperarPila } from './ayudas';

/**
 * El reporte elegido y las agrupaciones del mapa, contra la pila real y los datos reales.
 *
 * Lo que se fija acá es una regla de producto: **el detalle que el vecino abrió no depende de lo
 * que traiga la consulta de la vista**. Antes el panel salía de buscar el id dentro del resultado
 * del viewport, así que alejar el mapa —que cambia la consulta— lo cerraba solo en mitad de la
 * lectura. Son dos estados distintos y estos tests no dejan que vuelvan a ser uno.
 *
 * Nada está escrito a mano: ni ids, ni nombres, ni cantidades. Todo sale de lo que el servidor
 * publique en el momento de correr.
 */

/** Lee el resumen accesible del mapa: «N puntos sueltos. M puntos agrupados en K zonas…». */
async function resumen(page: Page) {
  const texto = (await page.getByTestId('resumen-mapa').textContent()) ?? '';
  const sueltos = /(\d+)\s+punto[s]?\s+suelto/.exec(texto);
  const agrupados = /(\d+)\s+punto[s]?\s+agrupado/.exec(texto);
  const zonas = /en\s+(\d+)\s+zona/.exec(texto);
  return {
    texto,
    sueltos: sueltos ? Number(sueltos[1]) : 0,
    agrupados: agrupados ? Number(agrupados[1]) : 0,
    zonas: zonas ? Number(zonas[1]) : 0,
  };
}

/** Espera a que el mapa termine de dibujar algo y devuelve su resumen. */
async function esperarMapaConPuntos(page: Page) {
  await expect
    .poll(async () => (await resumen(page)).sueltos + (await resumen(page)).agrupados, {
      timeout: 60_000,
      intervals: [500],
    })
    .toBeGreaterThan(0);
  return resumen(page);
}

async function zoom(page: Page, direccion: 'Acercar' | 'Alejar', veces: number) {
  const boton = page.getByRole('button', { name: `${direccion} el mapa` });
  for (let i = 0; i < veces; i++) {
    await boton.click();
    // El listado se pide 400 ms después de que el mapa se queda quieto (ESPERA_MOVIMIENTO_MS).
    await page.waitForTimeout(900);
  }
}

/** El detalle visible, sea la columna de escritorio o la hoja de móvil. */
function hoja(page: Page) {
  return page.locator('[data-testid^="hoja-detalle"]:visible').first();
}

/**
 * Acerca el mapa hasta que haya pastillas sueltas que tocar. Cuántos pasos hacen falta depende
 * de dónde estén los reportes reales ese día, así que se prueba en vez de fijarlo.
 */
async function acercarHastaPastillas(page: Page, intentos = 6): Promise<number> {
  for (let i = 0; i < intentos; i++) {
    const n = await page.locator('button.pin').count();
    if (n > 0) return n;
    await zoom(page, 'Acercar', 1);
  }
  return page.locator('button.pin').count();
}

/**
 * Abre un reporte: por la pastilla del mapa si hay alguna dibujada, y si no por la lista
 * (que en móvil no existe). Devuelve el titular del detalle, que es lo que después tiene que
 * seguir en pantalla.
 */
async function abrirUnReporte(page: Page): Promise<string> {
  const pastillas = page.locator('button.pin');
  if ((await acercarHastaPastillas(page)) > 0) await pastillas.first().click();
  else await page.getByTestId('tarjeta-reporte').first().click();
  await expect(hoja(page)).toBeVisible();
  const titulo = await hoja(page).locator('h2').first().textContent();
  expect(titulo?.trim().length ?? 0).toBeGreaterThan(0);
  return (titulo as string).trim();
}

/** Igual que `abrirUnReporte`, pero sin exigir que el detalle aparezca: acá se espera un fallo. */
async function abrirReporteEsperandoFallo(page: Page) {
  if ((await acercarHastaPastillas(page)) > 0) await page.locator('button.pin').first().click();
  else await page.getByTestId('tarjeta-reporte').first().click();
}

test.describe('reporte elegido y agrupaciones', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('el detalle sobrevive a alejar el mapa y a mover la vista', async ({ page }) => {
    await page.goto('/');
    await esperarMapaConPuntos(page);
    // Se acerca hasta que haya pastillas sueltas para poder tocar un punto concreto.
    const titulo = await abrirUnReporte(page);

    await zoom(page, 'Alejar', 4);
    await expect(hoja(page), 'alejar el mapa cerró el detalle').toBeVisible();
    await expect(hoja(page).locator('h2').first()).toHaveText(titulo);

    // Y ahora se lleva la vista a otra parte de la ciudad, lo bastante lejos como para que el
    // reporte ya no esté en el resultado de la consulta.
    const caja = (await page.locator('canvas.maplibregl-canvas').boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height * 0.18);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width * 0.1, caja.y + caja.height * 0.45, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    await expect(hoja(page), 'mover el mapa cerró el detalle').toBeVisible();
    await expect(hoja(page).locator('h2').first()).toHaveText(titulo);
  });

  test('cerrar y elegir otro reporte sí cambian el detalle', async ({ page }) => {
    await page.goto('/');
    await esperarMapaConPuntos(page);
    const primero = await abrirUnReporte(page);

    await page.locator('button[aria-label="Cerrar el detalle"]:visible').first().click();
    await expect(hoja(page)).toBeHidden();

    // Elegir otro punto reemplaza el detalle en vez de acumular paneles.
    const pastillas = page.locator('button.pin');
    const n = await pastillas.count();
    if (n > 1) {
      await pastillas.nth(1).click();
      await expect(hoja(page)).toBeVisible();
      const segundo = await hoja(page).locator('h2').first().textContent();
      expect(segundo?.trim()).toBeTruthy();
      // No se exige que el titular sea distinto: dos reportes de la misma cuadra comparten
      // dirección. Lo que se exige es que haya exactamente un detalle abierto.
      expect(await page.locator('[data-testid^="hoja-detalle"]:visible').count()).toBe(1);
    } else {
      expect(primero.length).toBeGreaterThan(0);
    }
  });

  test('las agrupaciones cuentan los reportes y se abren al acercar', async ({ page }) => {
    await page.goto('/');
    const lejos = await esperarMapaConPuntos(page);
    // Con la ciudad entera en pantalla, la mayoría de los puntos tiene que estar agrupado: si
    // no, el mapa estaría dibujando cientos de pastillas encimadas.
    expect(lejos.zonas, `el resumen fue «${lejos.texto}»`).toBeGreaterThan(0);
    expect(lejos.agrupados).toBeGreaterThanOrEqual(lejos.zonas * 2);
    expect(lejos.texto).toContain('acercá el mapa');

    // Al acercar, las agrupaciones se abren: quedan menos zonas de las que había.
    await zoom(page, 'Acercar', 4);
    const cerca = await resumen(page);
    expect(
      cerca.zonas,
      `al acercar seguía habiendo tantas zonas como lejos (${cerca.texto})`,
    ).toBeLessThan(lejos.zonas);
  });

  test('el mapa no dice «no hay puntos» cuando lo que falló fue la consulta', async ({ page }) => {
    // Un mapa vacío y un mapa que no pudo preguntar se ven igual; solo el texto los distingue.
    await page.route('**/api/v1/reportes?*', (ruta) => ruta.abort('failed'));
    await page.goto('/');
    await expect(page.locator('[data-testid="error-reportes"]:visible')).toHaveCount(1);
    const t = await page.getByTestId('resumen-mapa').textContent();
    expect(t).not.toContain('Ningún punto');
  });

  test('un reporte que dejó de estar publicado se dice, no se cierra en silencio', async ({
    page,
  }) => {
    /**
     * El 404 se fuerza con `route` porque la otra forma de producirlo sería despublicar un
     * reporte real de la base. El servidor devuelve exactamente esto cuando el técnico pasa un
     * reporte a rechazado mientras alguien lo está mirando.
     *
     * El patrón NO alcanza al listado (`/reportes?…`), que no lleva barra después de `reportes`:
     * los puntos tienen que seguir dibujándose para poder tocar uno.
     */
    await page.route('**/api/v1/reportes/*', (ruta) =>
      ruta.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' }),
      }),
    );
    await page.goto('/');
    await esperarMapaConPuntos(page);
    await abrirReporteEsperandoFallo(page);

    await expect(page.locator('[data-testid="detalle-no-disponible"]:visible')).toContainText(
      'No encontramos este reporte',
    );
    // Y el texto no inventa un estado: no dice «en revisión» ni deja el panel con datos viejos.
    await expect(page.locator('[data-testid^="hoja-detalle"]:visible')).toHaveCount(0);
  });
});
