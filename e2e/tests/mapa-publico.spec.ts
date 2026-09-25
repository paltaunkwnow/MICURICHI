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
      // Hay dos enlaces a /reportar en móvil (el botón circular del mapa y el del panel):
      // se identifica el principal por su testid en vez de por el nombre accesible.
      await expect(page.getByTestId('boton-reportar')).toBeVisible();
      return;
    }

    await expect(page.getByTestId('kpi-publicados')).toBeVisible();
    const tarjetas = page.getByTestId('tarjeta-reporte');
    await expect(tarjetas.first()).toBeVisible();

    await tarjetas.first().click();
    // `hoja-detalle` es la copia de escritorio (la de móvil es `hoja-detalle-movil`), así que no
    // hace falta desambiguar con `.first()`.
    const hoja = page.getByTestId('hoja-detalle');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByTestId('detalle-uv')).toContainText('UV');
    await expect(hoja.getByTestId('detalle-distrito')).toContainText('Distrito');
  });

  test('filtra por severidad sin recargar la página', async ({ page, isMobile }) => {
    // Corre también en móvil: los chips de severidad flotan sobre el mapa (C-01 del prototipo),
    // no solo en el panel de escritorio. Estaba omitido con esa explicación, que era falsa.
    await page.goto('/');
    if (isMobile) await expect(page.getByTestId('boton-reportar')).toBeVisible();
    else await expect(page.getByTestId('tarjeta-reporte').first()).toBeVisible();
    // 'Crítica' aparece también dentro del nombre accesible de cada tarjeta con esa severidad:
    // el chip del filtro es el único cuyo nombre es exactamente 'Crítica'. En móvil el chip está
    // una sola vez; en escritorio, en la columna.
    const chip = page.getByRole('button', { name: 'Crítica', exact: true }).first();
    // El clic se reintenta: la página se sirve renderizada y un clic anterior a la hidratación
    // se pierde, así que reintentar solo la aserción no sirve de nada.
    await expect(async () => {
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
    }).toPass({ timeout: 15_000 });
  });
});
