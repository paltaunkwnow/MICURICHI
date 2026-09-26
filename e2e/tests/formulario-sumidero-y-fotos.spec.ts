import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  continuar,
  crearCuentaYEntrarPorUi,
  cuentaNuevaEnElNavegador,
  elegirPuntoPorCoordenadas,
  enviarYLeerCuerpo,
  esperarPila,
  llegarAFotos,
  llegarARevision,
  numeroDePaso,
  PNG_1X1,
  PUNTO_CENTRO,
  retenerPeticiones,
} from './ayudas';

/**
 * Formulario de reporte (contracts 0.5.0 y 0.6.0): el sumidero se pregunta con dos respuestas
 * cerradas —¿hay uno cerca? Sí / No; ¿está tapado? Tapado / No tapado— sin opción «No sé» (no
 * contestar ya es «no sé»), y en el paso de fotos el vecino puede sumar otro detalle sacándolo con
 * la cámara.
 *
 * Las primeras pruebas no enumeran los pasos: avanzan contestando lo que pida cada uno hasta
 * llegar a la pregunta buscada, para describir lo que ve el vecino y no el orden de los pasos.
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
    await expect.poll(() => numeroDePaso(page)).toBe(n);
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

  test('con «No» en el sumidero cercano no se pregunta si el agua brota ni si está tapado', async ({
    page,
  }) => {
    const cercano = pregunta(page, SUMIDERO_CERCANO);
    await avanzarHasta(
      page,
      async () => (await cercano.count()) > 0,
      `la pregunta «${SUMIDERO_CERCANO}»`,
    );

    const brota = page.locator('#contenido form input[name="agua_brota_sumidero"]');
    // Sin contestar, la casilla está y sin marcar (lo que se envía en ese caso, `null`, lo
    // comprueba la prueba del envío más abajo).
    await expect(brota).toHaveCount(1);
    await expect(brota).not.toBeChecked();

    // Sin sumidero cerca no hay de dónde brotar el agua (contracts 0.6.0 lo rechaza).
    await elegir(cercano, 'No');
    await expect(brota).toHaveCount(0);
    await expect(pregunta(page, SUMIDERO_TAPADO)).toHaveCount(0);

    // «Dejar sin responder» vuelve al estado inicial.
    await page.getByRole('button', { name: 'Dejar sin responder' }).click();
    await expect(brota).toHaveCount(1);
    await expect(brota).not.toBeChecked();
  });
});

test.describe('formulario: lo que se envía del sumidero y cómo se suben las fotos', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('sin tocar el sumidero, el envío lo manda como «sin contestar» (null), no como «no»', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'sumidero-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
    await llegarARevision(page, `E2E-sumidero-${Date.now()}`);

    const cuerpo = await enviarYLeerCuerpo(page);
    // Antes la casilla mandaba `false` al montarse: todo reporte decía que el agua no brotaba.
    for (const campo of ['sumidero_cercano', 'sumidero_estado', 'agua_brota_sumidero']) {
      expect(cuerpo, campo).toHaveProperty(campo, null);
    }
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });

  test('mientras una foto sube, «Continuar» espera y lo dice; al terminar se puede seguir', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'foto-lenta-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
    await llegarAFotos(page);
    await page
      .locator('textarea[name="descripcion"]')
      .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. ${Date.now()}`);
    const siguiente = page.getByTestId('boton-siguiente');
    await expect(siguiente).toBeEnabled();

    const subida = await retenerPeticiones(page, '**/api/v1/fotos');
    await page
      .locator('#fotos')
      .setInputFiles({ name: 'charco.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await subida.llegada;

    // Seguir con la foto a medio subir creaba el reporte sin ella y la dejaba huérfana.
    await expect(page.getByTestId('foto-subiendo-mosaico')).toBeVisible();
    await expect(siguiente).toBeDisabled();
    await expect(siguiente).toHaveText('Subiendo foto…');
    await expect(page.getByTestId('boton-otro-detalle')).toBeDisabled();

    subida.liberar();
    await expect(page.getByRole('img', { name: 'Foto que subiste' })).toHaveCount(1);
    await expect(page.getByTestId('foto-subiendo-mosaico')).toHaveCount(0);
    await expect(siguiente).toHaveText('Continuar');
    await continuar(page);
    // En la revisión no queda nada «subiendo» y se puede enviar.
    await expect(page.getByTestId('foto-subiendo')).toHaveCount(0);
    await expect(page.getByTestId('boton-enviar')).toBeEnabled();
  });

  test('cancelar la cámara no deja un espacio vacío, y con dos fotos la tercera entra', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'camara-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
    await llegarAFotos(page);

    const miniaturas = page.getByRole('img', { name: 'Foto que subiste' });
    for (const i of [1, 2]) {
      await page
        .locator('#fotos')
        .setInputFiles({ name: `charco-${i}.png`, mimeType: 'image/png', buffer: PNG_1X1 });
      await expect(miniaturas).toHaveCount(i);
    }

    const espacio = page.getByTestId('espacio-camara');
    const agregar = page.getByRole('button', { name: 'Agregar', exact: true });
    const otroDetalle = page.getByTestId('boton-otro-detalle');

    // Se abre la cámara y la persona la cierra sin sacar nada. El selector se intercepta para que
    // no quede un diálogo nativo abierto, y se le manda al input el `cancel` que manda el navegador.
    let selector = page.waitForEvent('filechooser');
    await otroDetalle.click();
    let camara = await selector;
    expect(await camara.element().evaluate((e) => (e as Element).hasAttribute('capture'))).toBe(
      true,
    );
    await expect(espacio).toBeVisible();
    await expect(agregar).toHaveCount(0);
    await camara.element().dispatchEvent('cancel');
    // Antes el espacio vacío quedaba para siempre y ocupaba el tercer lugar.
    await expect(espacio).toHaveCount(0);
    await expect(agregar).toBeVisible();
    await expect(otroDetalle).toBeEnabled();

    // La tercera foto entra, esta vez sí por la cámara.
    selector = page.waitForEvent('filechooser');
    await otroDetalle.click();
    camara = await selector;
    await camara.setFiles({ name: 'detalle.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(miniaturas).toHaveCount(3);
    await expect(espacio).toHaveCount(0);
    await expect(otroDetalle).toBeDisabled();
    await expect(page.getByText(/Ya llegaste al máximo de \d+ fotos/)).toBeVisible();
  });
});
