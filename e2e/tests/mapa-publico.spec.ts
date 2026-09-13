import { expect, test } from '@playwright/test';
import { esperarPila } from './ayudas';

/** Se ejecuta en escritorio y en móvil (proyecto `movil` del playwright.config). */
test.describe('mapa público', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('muestra los puntos publicados y abre el detalle al tocar una tarjeta', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');

    if (isMobile) {
      // En móvil la acción principal queda al alcance del pulgar
      await expect(page.getByRole('link', { name: /Reportar un punto/ })).toBeVisible();
      return;
    }

    await expect(page.getByTestId('kpi-publicados')).toBeVisible();
    const tarjetas = page.getByTestId('tarjeta-reporte');
    await expect(tarjetas.first()).toBeVisible();

    await tarjetas.first().click();
    const hoja = page.getByTestId('hoja-detalle').first();
    await expect(hoja).toBeVisible();
    await expect(page.getByTestId('detalle-uv').first()).toContainText('UV');
    await expect(page.getByTestId('detalle-distrito').first()).toContainText('Distrito');
  });

  test('filtra por severidad sin recargar la página', async ({ page, isMobile }) => {
    test.skip(isMobile, 'los chips de severidad viven en el panel de escritorio');
    await page.goto('/');
    await expect(page.getByTestId('tarjeta-reporte').first()).toBeVisible();
    await page.getByRole('button', { name: 'Crítica' }).click();
    await expect(page.getByRole('button', { name: 'Crítica' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
