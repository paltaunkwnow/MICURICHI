import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  continuar,
  crearCuentaYEntrarPorUi,
  cuentaNuevaEnElNavegador,
  dialogoCamara,
  elegirPuntoPorCoordenadas,
  enviarYLeerCuerpo,
  esperarPila,
  llegarAFotos,
  llegarARevision,
  numeroDePaso,
  PUNTO_CENTRO,
  retenerPeticiones,
  sacarFotoConLaCamara,
  vigilarCamara,
} from './ayudas';

/**
 * Formulario de reporte (contracts 0.5.0 y 0.6.0): el sumidero se pregunta con dos respuestas
 * cerradas —¿hay uno cerca? Sí / No; ¿está tapado? Tapado / No tapado— sin opción «No sé» (no
 * contestar ya es «no sé»), y en el paso de fotos la foto sale de la cámara dentro de la página,
 * sin galería ni selector de archivos (plan 2026-09-26, pedido D).
 *
 * Las primeras pruebas no enumeran los pasos: avanzan contestando lo que pida cada uno hasta
 * llegar a la pregunta buscada, para describir lo que ve el vecino y no el orden de los pasos.
 */

// Todas las pruebas de este archivo recorren el formulario de reporte: el permiso de cámara es
// suyo. La cámara es la falsa de Chromium (ver playwright.config.ts).
test.use({ permissions: ['camera'] });

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

test.describe('formulario: sumidero con respuestas cerradas y cámara dentro de la página', () => {
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

  test('en el paso de fotos, «Sacar foto» abre la cámara dentro de la página y no un selector de archivos', async ({
    page,
  }) => {
    const camara = await vigilarCamara(page);
    const boton = page.getByTestId('boton-sacar-foto');
    await avanzarHasta(page, async () => (await boton.count()) > 0, 'el paso de fotos');

    let abrioSelector = false;
    page.on('filechooser', () => {
      abrioSelector = true;
    });
    await expect(boton).toBeVisible();
    await expect(boton).toHaveText('Sacar foto');
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    // Llegar al paso no pide la cámara: se pide al tocar el botón (pedido F).
    expect((await camara()).pedidos).toEqual([]);

    await boton.click();
    const dialogo = dialogoCamara(page);
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByLabel('Vista en vivo de la cámara')).toBeVisible();
    await expect(dialogo.getByTestId('boton-disparo')).toBeEnabled({ timeout: 20_000 });
    const { pedidos, encendidas } = await camara();
    expect(pedidos).toHaveLength(1);
    // La trasera y en alta: sin ancho ni alto, Chrome entrega 640 × 480. Sin audio.
    expect(pedidos[0]).toMatchObject({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    });
    expect(encendidas).toBeGreaterThan(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    // Cerrar sin sacar nada apaga la cámara y devuelve el foco a «Sacar foto».
    await dialogo.getByRole('button', { name: 'Cerrar la cámara' }).click();
    await expect(dialogo).toBeHidden();
    await expect(boton).toBeFocused();
    await expect.poll(async () => (await camara()).encendidas).toBe(0);
    expect(abrioSelector, 'nada abrió un selector de archivos').toBe(false);
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

test.describe('formulario: lo que se envía del sumidero y cómo se sacan y suben las fotos', () => {
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
    await sacarFotoConLaCamara(page);
    await subida.llegada;

    // Seguir con la foto a medio subir creaba el reporte sin ella y la dejaba huérfana.
    await expect(page.getByTestId('foto-subiendo-mosaico')).toBeVisible();
    await expect(siguiente).toBeDisabled();
    await expect(siguiente).toHaveText('Subiendo foto…');
    // Mientras sube, la cámara no se vuelve a abrir (`aria-disabled`, para que el foco pueda
    // volver al botón).
    await expect(page.getByTestId('boton-sacar-foto')).toBeDisabled();

    subida.liberar();
    await expect(page.getByRole('img', { name: 'Foto que sacaste' })).toHaveCount(1);
    await expect(page.getByTestId('foto-subiendo-mosaico')).toHaveCount(0);
    await expect(siguiente).toHaveText('Continuar');
    await continuar(page);
    // En la revisión no queda nada «subiendo» y se puede enviar.
    await expect(page.getByTestId('foto-subiendo')).toHaveCount(0);
    await expect(page.getByTestId('boton-enviar')).toBeEnabled();
  });

  test('cerrar la cámara sin sacar nada no ocupa un lugar, y con dos fotos la tercera entra', async ({
    page,
  }) => {
    const camara = await vigilarCamara(page);
    await cuentaNuevaEnElNavegador(page, 'camara-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
    await llegarAFotos(page);

    const miniaturas = page.getByRole('img', { name: 'Foto que sacaste' });
    const sacar = page.getByTestId('boton-sacar-foto');
    for (const i of [1, 2]) {
      await sacarFotoConLaCamara(page);
      await expect(miniaturas).toHaveCount(i);
    }

    // Se abre la cámara y la persona la cierra con Escape sin sacar nada: la cámara se apaga y no
    // queda un lugar a medio ocupar.
    await sacar.click();
    const dialogo = dialogoCamara(page);
    await expect(dialogo.getByTestId('boton-disparo')).toBeEnabled({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(sacar).toBeFocused();
    await expect.poll(async () => (await camara()).encendidas).toBe(0);
    await expect(miniaturas).toHaveCount(2);
    await expect(page.getByTestId('foto-subiendo-mosaico')).toHaveCount(0);
    await expect(sacar).toBeEnabled();

    // La tercera entra, y con ella se completan.
    await sacarFotoConLaCamara(page);
    await expect(miniaturas).toHaveCount(3);
    await expect(sacar).toBeDisabled();
    await expect(page.getByText(/Ya llegaste al máximo de \d+ fotos/)).toBeVisible();

    // Completas, tocar «Sacar foto» no pide la cámara. `getUserMedia` se llamaría dentro del
    // mismo clic, así que al volver el clic ya estaría anotado.
    const pedidos = (await camara()).pedidos.length;
    await sacar.click({ force: true });
    await expect(dialogo).toBeHidden();
    expect((await camara()).pedidos).toHaveLength(pedidos);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
