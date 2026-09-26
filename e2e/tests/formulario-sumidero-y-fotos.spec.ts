import { expect, type Locator, type Page, test } from '@playwright/test';
import { crearCuentaYEntrarPorUi, esperarPila, PUNTO_CENTRO } from './ayudas';

/**
 * Formulario de reporte (contracts 0.5.0): el sumidero se pregunta con dos respuestas cerradas
 * —¿hay uno cerca? Sí / No; ¿está tapado? Tapado / No tapado— sin opción «No sé» (no contestar ya
 * es «no sé»), y en el paso de fotos el vecino puede sumar otro detalle sacándolo con la cámara.
 *
 * No se enumeran los pasos: se avanza contestando lo que pida cada uno hasta llegar a la pregunta
 * buscada, para que la prueba describa lo que ve el vecino y no el orden actual de los pasos.
 */

const SUMIDERO_CERCANO = '¿Hay sumidero cercano?';
const SUMIDERO_TAPADO = '¿Está tapado?';

/** Abre los bloques plegados («Opcional») del paso en pantalla: lo opcional puede ir dentro. */
async function desplegarOpcionales(page: Page) {
  const plegados = page.locator('#contenido form details:not([open]) > summary');
  for (let i = await plegados.count(); i > 0; i--) await plegados.first().click();
}

/** Contesta lo mínimo para poder seguir: la ubicación en el paso 1 y un valor por grupo. */
async function contestarPaso(page: Page, n: number) {
  if (n === 1) {
    await page.getByTestId('opcion-coordenadas').click();
    await page.locator('#lat').fill(String(PUNTO_CENTRO.lat));
    await page.locator('#lon').fill(String(PUNTO_CENTRO.lon));
    await page.getByTestId('boton-confirmar-ubicacion').click();
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    return;
  }
  const preferidos: Record<string, string> = {
    profundidad_estimada: 'rodilla',
    frecuencia: 'cada_lluvia_fuerte',
    ubicacion_tipo: 'via_publica',
  };
  for (const [nombre, valor] of Object.entries(preferidos)) {
    const radio = page.locator(`input[name="${nombre}"][value="${valor}"]`);
    if ((await radio.count()) > 0) await radio.check();
  }
  const descripcion = page.locator('textarea[name="descripcion"]');
  if ((await descripcion.count()) > 0 && (await descripcion.inputValue()).trim() === '') {
    await descripcion.fill(
      `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${Date.now()}`,
    );
  }
}

/** Avanza por el formulario hasta que `llegó` sea cierto en el paso en pantalla. */
async function avanzarHasta(page: Page, llego: () => Promise<boolean>, que: string) {
  await crearCuentaYEntrarPorUi(page, '/reportar');
  await page.waitForURL('**/reportar');
  await expect(page.getByRole('heading', { name: 'Reportar un punto' })).toBeVisible();

  for (let n = 1; n <= 8; n++) {
    await expect(page.locator('p.pno')).toHaveText(new RegExp(`^Paso ${n} de \\d+$`));
    await desplegarOpcionales(page);
    if (await llego()) return;
    await contestarPaso(page, n);
    const siguiente = page.getByTestId('boton-siguiente');
    if ((await siguiente.count()) === 0) break;
    await expect(siguiente, `el paso ${n} tiene que poder continuarse`).toBeEnabled();
    await siguiente.click();
  }
  throw new Error(`el formulario no llegó a ${que}`);
}

/**
 * La pregunta, sea un grupo de radios (`radiogroup` o `fieldset` con su leyenda) o un `<select>`
 * con su etiqueta. La spec fija las respuestas posibles, no el control.
 */
function pregunta(page: Page, texto: string): Locator {
  const form = page.locator('#contenido form');
  return form
    .getByRole('radiogroup', { name: texto, exact: true })
    .or(form.getByRole('group', { name: texto, exact: true }))
    .or(form.getByRole('combobox', { name: texto, exact: true }));
}

/** Respuestas que ofrece la pregunta, tal como las lee el vecino. */
async function respuestas(control: Locator): Promise<{ elegibles: string[]; todas: string[] }> {
  return control.first().evaluate((el) => {
    const limpio = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
    if (el instanceof HTMLSelectElement) {
      const opciones = Array.from(el.options);
      return {
        // La opción vacía es el «sin contestar» del select, no una respuesta.
        elegibles: opciones.filter((o) => o.value !== '').map((o) => limpio(o.textContent)),
        todas: opciones.map((o) => limpio(o.textContent)),
      };
    }
    const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const nombres = radios.map((r) =>
      limpio(r.getAttribute('aria-label') ?? r.labels?.[0]?.textContent),
    );
    return { elegibles: nombres, todas: nombres };
  });
}

async function elegir(control: Locator, respuesta: string) {
  const el = control.first();
  if ((await el.evaluate((e) => e.tagName.toLowerCase())) === 'select') {
    await el.selectOption({ label: respuesta });
  } else {
    await el.getByRole('radio', { name: respuesta, exact: true }).check();
  }
}

test.describe('formulario: sumidero con respuestas cerradas y foto de otro detalle', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('«¿Hay sumidero cercano?» ofrece Sí y No; con Sí aparece «¿Está tapado?» sin «No sé»', async ({
    page,
  }) => {
    const cercano = pregunta(page, SUMIDERO_CERCANO);
    await avanzarHasta(
      page,
      async () => (await cercano.count()) > 0,
      `la pregunta «${SUMIDERO_CERCANO}»`,
    );

    const deCercano = await respuestas(cercano);
    expect(deCercano.elegibles).toEqual(['Sí', 'No']);
    expect(deCercano.todas.filter((t) => /no s[eé]/i.test(t))).toEqual([]);

    const tapado = pregunta(page, SUMIDERO_TAPADO);
    // Sin sumidero cerca no tiene sentido preguntar si está tapado.
    await expect(tapado).toHaveCount(0);
    await elegir(cercano, 'Sí');
    await expect(tapado.first()).toBeVisible();

    const deTapado = await respuestas(tapado);
    expect(deTapado.elegibles).toEqual(['Tapado', 'No tapado']);
    expect(deTapado.todas.filter((t) => /no s[eé]/i.test(t))).toEqual([]);
    // «No sé» sigue siendo una respuesta válida de «¿Por qué creés que pasa?» (causa
    // `desconocida`); lo que no puede tenerlo es ninguna de las dos preguntas del sumidero.
    await expect(cercano.first()).not.toContainText(/No s[eé]/i);
    await expect(tapado.first()).not.toContainText(/No s[eé]/i);
  });

  test('en el paso de fotos, «¿Querés añadir otro detalle?» abre la cámara', async ({ page }) => {
    const boton = page.getByTestId('boton-otro-detalle');
    await avanzarHasta(page, async () => (await boton.count()) > 0, 'el paso de fotos');

    await expect(boton).toBeVisible();
    await expect(boton).toHaveText(/¿Querés añadir otro detalle\?/);

    const camara = page.locator('#contenido form input[type="file"][capture]');
    const antes = await camara.count();
    // Si el botón abre el selector de archivos, se intercepta aquí para que no quede un diálogo
    // nativo abierto, y se anota si lo abrió un input de cámara.
    let abrioCamara = false;
    page.on('filechooser', async (fc) => {
      abrioCamara = await fc.element().evaluate((e) => (e as Element).hasAttribute('capture'));
    });

    await boton.click();
    await expect
      .poll(async () => (await camara.count()) > antes || abrioCamara, {
        message: 'el botón añade (o abre) un input de archivo con `capture`',
      })
      .toBe(true);
    await expect(camara.first()).toBeAttached();
  });
});
