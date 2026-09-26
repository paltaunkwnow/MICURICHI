import { expect, type Page, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_ADMIN,
  CREDENCIALES_EJECUTIVO,
  CREDENCIALES_TECNICO,
  CREDENCIALES_VECINA,
  esperarPila,
  PANEL,
  PUBLICA,
} from './ayudas';

/**
 * El botón «Panel técnico» / «Panel ejecutivo» de la app pública.
 *
 * El panel es otra aplicación, en otro puerto. Desde contracts 0.7.0 su dirección NO viaja en el
 * JavaScript público: llega en `panel_url` de `GET /api/v1/auth/yo`, y api-core solo la manda a
 * técnico, admin y ejecutivo (`PANEL_ADMIN_URL`). Sin ese campo no hay botón.
 *
 * Esconderle el botón a un ciudadano es solo navegación; lo que le cierra la puerta es el panel y
 * la API, y eso lo comprueban `cuenta-ciudadana.spec.ts` y `panel-tecnico.spec.ts`.
 */

type Credenciales = { email: string; password: string };

async function entrarEnLaAppPublica(page: Page, credenciales: Credenciales) {
  await page.goto('/ingresar?volver=%2Fcuenta');
  await page.locator('#email').fill(credenciales.email);
  await page.locator('#password').fill(credenciales.password);
  await page.locator('#contenido').getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/cuenta');
  await expect(page.getByText(credenciales.email)).toBeVisible();
}

/** `panel_url` de `/auth/yo` con la sesión del navegador (la misma que usa la app). */
async function urlDelPanelDeLaSesion(page: Page): Promise<string> {
  const r = await page.request.get(`${PUBLICA}/api/v1/auth/yo`);
  expect(r.status()).toBe(200);
  const { panel_url } = await r.json();
  expect(
    panel_url,
    'api-core sin PANEL_ADMIN_URL manda panel_url = null y el botón no aparece (ver README)',
  ).toEqual(expect.any(String));
  return panel_url as string;
}

test.describe('panel_url en /auth/yo', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('solo técnico, admin y ejecutivo reciben la URL del panel; al ciudadano ni se le nombra', async ({
    playwright,
  }) => {
    for (const [rol, credenciales, recibe] of [
      ['técnico', CREDENCIALES_TECNICO, true],
      ['administrador', CREDENCIALES_ADMIN, true],
      ['ejecutivo', CREDENCIALES_EJECUTIVO, true],
      ['ciudadano', CREDENCIALES_VECINA, false],
    ] as const) {
      const contexto = await playwright.request.newContext();
      try {
        const login = await contexto.post(`${API}/api/v1/auth/login`, { data: credenciales });
        expect(login.status(), rol).toBe(200);
        const yo = await (await contexto.get(`${API}/api/v1/auth/yo`)).json();
        if (!recibe) {
          expect(yo, rol).not.toHaveProperty('panel_url');
          continue;
        }
        expect(
          yo.panel_url,
          `${rol}: api-core sin PANEL_ADMIN_URL manda null y el botón no aparece (ver README)`,
        ).toBe(new URL(PANEL).href);
      } finally {
        await contexto.dispose();
      }
    }
  });
});

test.describe('acceso al panel desde la app pública', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  for (const [rol, credenciales] of [
    ['técnico', CREDENCIALES_TECNICO],
    ['administrador', CREDENCIALES_ADMIN],
  ] as const) {
    test(`con cuenta de ${rol} aparece «Panel técnico» y lleva al panel ya dentro`, async ({
      page,
    }) => {
      await entrarEnLaAppPublica(page, credenciales);
      const destino = new URL(await urlDelPanelDeLaSesion(page)).href;

      await expect(
        page.locator('header.topnav').getByRole('link', { name: 'Panel técnico' }),
      ).toHaveAttribute('href', destino);
      const enCuenta = page
        .locator('#contenido')
        .getByRole('link', { name: 'Ir al panel técnico' });
      await expect(enCuenta).toHaveAttribute('href', destino);
      await expect(page.getByText(`Tu cuenta es de ${rol}.`)).toBeVisible();

      // Mismo host, otro puerto: el navegador manda la misma cookie de sesión, así que el panel
      // no vuelve a pedir la contraseña. La primera visita compila la página en desarrollo.
      await enCuenta.click();
      await page.waitForURL(`${new URL(PANEL).origin}/reportes**`, { timeout: 60_000 });
      await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible({
        timeout: 60_000,
      });
    });
  }

  test('con cuenta de ejecutivo aparece «Panel ejecutivo» y lleva a su resumen', async ({
    page,
  }) => {
    await entrarEnLaAppPublica(page, CREDENCIALES_EJECUTIVO);
    // Al ejecutivo no se le ofrece la bandeja técnica: el botón va directo a su panel.
    const destino = new URL('ejecutivo', await urlDelPanelDeLaSesion(page)).href;

    await expect(
      page.locator('header.topnav').getByRole('link', { name: 'Panel ejecutivo' }),
    ).toHaveAttribute('href', destino);
    await expect(page.getByRole('link', { name: /panel técnico/i })).toHaveCount(0);
    const enCuenta = page
      .locator('#contenido')
      .getByRole('link', { name: 'Ir al panel ejecutivo' });
    await expect(enCuenta).toHaveAttribute('href', destino);
    await expect(page.getByText('Tu cuenta es de ejecutivo.')).toBeVisible();

    await enCuenta.click();
    await page.waitForURL(`${new URL(PANEL).origin}/ejecutivo`, { timeout: 60_000 });
    await expect(page.getByTestId('ejecutivo-total')).toHaveText(/\d/, { timeout: 60_000 });
  });

  test('con cuenta de ciudadano no aparece', async ({ page }) => {
    // Cada «no aparece» se comprueba con la sesión ya resuelta: antes, la ausencia no prueba nada.
    await entrarEnLaAppPublica(page, CREDENCIALES_VECINA);
    await expect(page.getByRole('link', { name: /panel (técnico|ejecutivo)/i })).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('header.topnav a[href="/cuenta"]')).toBeVisible();
    await expect(page.getByRole('link', { name: /panel (técnico|ejecutivo)/i })).toHaveCount(0);
  });

  test('sin sesión no aparece', async ({ page }) => {
    await page.goto('/cuenta');
    await expect(
      page.locator('#contenido').getByRole('link', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /panel (técnico|ejecutivo)/i })).toHaveCount(0);
  });
});
