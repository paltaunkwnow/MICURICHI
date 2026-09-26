import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_EJECUTIVO,
  cuentaNuevaConSesion,
  esperarPila,
  loginEjecutivo,
  PANEL,
} from './ayudas';

/**
 * Panel ejecutivo (contracts 0.5.0): un rol que solo mira. Ve el resumen por severidad, estado y
 * distrito, y nada más: no modera, no exporta, no entra a las pantallas de trabajo del técnico.
 *
 * Lo que se prueba aquí es la puerta en los dos sentidos: el resumen se abre a quien corresponde
 * y se cierra al ciudadano; y el ejecutivo no se cuela en lo técnico ni por la API ni por la URL.
 */

const RESUMEN = `${API}/api/v1/ejecutivo/resumen`;

/** Primer número que muestra un elemento, admitiendo separador de miles («1.234», «1 234»). */
async function numeroEn(elemento: Locator): Promise<number | null> {
  const texto = (await elemento.textContent()) ?? '';
  const r = /\d[\d.\s ]*/.exec(texto);
  return r ? Number(r[0].replace(/\D/g, '')) : null;
}

async function entrarComoEjecutivo(page: Page) {
  await page.goto(`${PANEL}/login`);
  await page.locator('#email').fill(CREDENCIALES_EJECUTIVO.email);
  await page.locator('#password').fill(CREDENCIALES_EJECUTIVO.password);
  await page.getByTestId('boton-login').click();
  // El ejecutivo no tiene nada que hacer en «Reportes»: aterriza directamente en su panel.
  await expect(page).toHaveURL(/\/ejecutivo$/, { timeout: 60_000 });
}

/**
 * Elige la ventana de tiempo sin fijar cómo se dibuja el control: un `<select>` o un grupo de
 * botones/radios. La spec fija el efecto (qué se consulta), no el widget.
 */
async function elegirVentana(page: Page, valor: '7d') {
  const control = page.getByTestId('ejecutivo-ventana');
  await expect(control).toBeVisible();
  if ((await control.evaluate((e) => e.tagName.toLowerCase())) === 'select') {
    await control.selectOption(valor);
    return;
  }
  const porValor = control.locator(`[value="${valor}"], [data-valor="${valor}"]`);
  if ((await porValor.count()) > 0) {
    await porValor.first().click();
    return;
  }
  await control
    .getByText(/7\s*d[ií]as/i)
    .first()
    .click();
}

test.describe('panel ejecutivo · API', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('sin sesión, el resumen responde 401', async ({ request }) => {
    const r = await request.get(RESUMEN);
    expect(r.status()).toBe(401);
    expect((await r.json()).codigo).toBe('SIN_SESION');
  });

  test('con sesión de ciudadano, el resumen responde 403', async ({ request }) => {
    await cuentaNuevaConSesion(request, 'ejec-');
    const r = await request.get(RESUMEN);
    expect(r.status()).toBe(403);
    expect((await r.json()).codigo).toBe('SIN_PERMISO');
  });

  test('con sesión de ejecutivo, el resumen trae el total y el desglose por distrito', async ({
    request,
  }) => {
    await loginEjecutivo(request);
    const r = await request.get(RESUMEN);
    expect(r.status(), await r.text()).toBe(200);
    const resumen = await r.json();
    expect(typeof resumen.total).toBe('number');
    expect(Array.isArray(resumen.por_distrito)).toBe(true);
    expect(
      resumen.por_distrito.length,
      'el seed tiene reportes en al menos un distrito (`pnpm db:seed:samples`)',
    ).toBeGreaterThanOrEqual(1);
  });

  test('el ejecutivo no abre ninguna puerta técnica', async ({ request }) => {
    await loginEjecutivo(request);
    for (const ruta of [
      '/api/v1/tecnico/reportes',
      '/api/v1/exportar?formato=csv',
      '/api/v1/indicadores',
    ]) {
      const r = await request.get(`${API}${ruta}`);
      expect(r.status(), ruta).toBe(403);
    }
  });
});

test.describe('panel ejecutivo · interfaz', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('tras el login aterriza en /ejecutivo con el total, las pestañas y las dos gráficas', async ({
    page,
  }) => {
    await entrarComoEjecutivo(page);

    const total = page.getByTestId('ejecutivo-total');
    await expect(total).toBeVisible({ timeout: 60_000 });
    await expect(total).toHaveText(/\d/);

    for (const pestana of ['critica', 'media', 'baja', 'todas']) {
      await expect(page.getByTestId(`ejecutivo-pestana-${pestana}`)).toBeVisible();
    }

    for (const grafica of ['ejecutivo-grafica-inundaciones', 'ejecutivo-grafica-trabajo']) {
      const g = page.getByTestId(grafica);
      await expect(g).toBeVisible();
      await expect
        .poll(() => g.locator('rect').count(), { message: `${grafica} dibuja al menos una barra` })
        .toBeGreaterThan(0);
    }
    await expect(page.getByTestId('ejecutivo-mapa')).toBeVisible();
  });

  test('la pestaña «Media» cambia el conteo mostrado', async ({ page, request }) => {
    // Precondición: con los datos del seed, «Media» no puede coincidir con el total; si
    // coincidiera, que el número no cambie no probaría nada.
    await loginEjecutivo(request);
    const resumen = await (await request.get(RESUMEN)).json();
    expect(
      resumen.por_severidad.media,
      'el seed debe tener reportes de más de una severidad para que la pestaña se note',
    ).not.toBe(resumen.total);

    await entrarComoEjecutivo(page);
    const total = page.getByTestId('ejecutivo-total');
    await expect(total).toHaveText(/\d/, { timeout: 60_000 });
    const antes = await numeroEn(total);

    const media = page.getByTestId('ejecutivo-pestana-media');
    // El clic se reintenta: uno anterior a la hidratación se pierde.
    await expect(async () => {
      await media.click();
      expect(await numeroEn(total)).not.toBe(antes);
    }).toPass({ timeout: 15_000 });
  });

  test('cambiar la ventana vuelve a consultar el resumen con ventana=7d', async ({ page }) => {
    await entrarComoEjecutivo(page);
    await expect(page.getByTestId('ejecutivo-total')).toBeVisible({ timeout: 60_000 });

    const peticion = page.waitForRequest((r) => {
      const u = new URL(r.url());
      return (
        u.pathname.endsWith('/api/v1/ejecutivo/resumen') && u.searchParams.get('ventana') === '7d'
      );
    });
    await elegirVentana(page, '7d');
    await peticion;
  });

  test('el ejecutivo que escribe /reportes en la barra vuelve a /ejecutivo', async ({ page }) => {
    await entrarComoEjecutivo(page);
    await page.goto(`${PANEL}/reportes`);
    await expect(page).toHaveURL(/\/ejecutivo$/, { timeout: 60_000 });
  });
});
