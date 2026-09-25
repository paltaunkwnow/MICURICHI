import { expect, type Page, test } from '@playwright/test';
import {
  CREDENCIALES_ADMIN,
  CREDENCIALES_TECNICO,
  CREDENCIALES_VECINA,
  esperarPila,
  PANEL,
} from './ayudas';

/**
 * El botón «Panel técnico» de la app pública.
 *
 * Antes, un técnico o un administrador que entraba en la app pública no tenía ninguna pista de
 * dónde estaba su herramienta: el panel es otra aplicación, en otro puerto. Ahora la app le ofrece
 * el botón, en la barra de arriba (escritorio) y en «Cuenta» (el único camino en móvil).
 *
 * Esconderle el botón a un ciudadano es solo navegación; lo que le cierra la puerta es el panel y
 * la API, y eso lo comprueba `cuenta-ciudadana.spec.ts`.
 */
async function entrarEnLaAppPublica(page: Page, credenciales: { email: string; password: string }) {
  await page.goto('/ingresar?volver=%2Fcuenta');
  await page.locator('#email').fill(credenciales.email);
  await page.locator('#password').fill(credenciales.password);
  await page.locator('#contenido').getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/cuenta');
  await expect(page.getByText(credenciales.email)).toBeVisible();
}

test.describe('acceso al panel técnico desde la app pública', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  for (const [rol, credenciales] of [
    ['técnico', CREDENCIALES_TECNICO],
    ['administrador', CREDENCIALES_ADMIN],
  ] as const) {
    test(`con cuenta de ${rol} aparece el botón y lleva al panel ya dentro`, async ({ page }) => {
      await entrarEnLaAppPublica(page, credenciales);
      const destino = new URL(PANEL).href;

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

  test('con cuenta de ciudadano no aparece', async ({ page }) => {
    // Cada «no aparece» se comprueba con la sesión ya resuelta: antes, la ausencia no prueba nada.
    await entrarEnLaAppPublica(page, CREDENCIALES_VECINA);
    await expect(page.getByRole('link', { name: /panel técnico/i })).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('header.topnav a[href="/cuenta"]')).toBeVisible();
    await expect(page.getByRole('link', { name: /panel técnico/i })).toHaveCount(0);
  });

  test('sin sesión no aparece', async ({ page }) => {
    await page.goto('/cuenta');
    await expect(
      page.locator('#contenido').getByRole('link', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /panel técnico/i })).toHaveCount(0);
  });
});
