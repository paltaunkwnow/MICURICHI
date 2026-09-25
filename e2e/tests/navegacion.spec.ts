import { expect, test } from '@playwright/test';
import { CREDENCIALES_TECNICO, esperarPila, PANEL } from './ayudas';

/**
 * Recorrido de la interfaz nueva (la del prototipo): que cada destino exista, cargue y responda.
 * No comprueba píxeles —el proyecto no usa capturas de referencia— sino que lo que el diseño
 * promete esté ahí y funcione.
 */
test.describe('navegación de la app pública', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('la barra superior lleva a los cuatro destinos', async ({ page, isMobile }) => {
    test.skip(isMobile, 'en móvil navega la barra inferior, no la superior');
    await page.goto('/');

    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Mis reportes' })
      .click();
    await expect(page).toHaveURL(/\/mis-reportes$/);
    await expect(page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Cómo funciona' })
      .click();
    await expect(page).toHaveURL(/\/como-funciona$/);

    await page.getByRole('link', { name: 'Mi Curichi, inicio' }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Mapa' })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('«Cómo funciona» cambia de pestaña sin recargar', async ({ page }) => {
    await page.goto('/como-funciona');
    const pasos = page.getByRole('tab', { name: 'Los pasos' });
    await expect(pasos).toHaveAttribute('aria-selected', 'true');

    const colores = page.getByRole('tab', { name: 'Los colores' });
    // El clic se reintenta: la página se sirve renderizada y uno anterior a la hidratación se pierde.
    await expect(async () => {
      await colores.click();
      await expect(colores).toHaveAttribute('aria-selected', 'true');
    }).toPass({ timeout: 15_000 });
    await expect(
      page.getByText('puntaje = 2 × tirante + duración + frecuencia + afectación'),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Qué no es' }).click();
    await expect(page.getByText('Si hay riesgo para la vida, llamá al 911.')).toBeVisible();
  });

  test('«Mis reportes» explica que la lista vive en el dispositivo', async ({ page }) => {
    // Sin cuentas de ciudadano, la lista sale de lo que guardó este navegador: en uno limpio está
    // vacía, y eso es lo que tiene que decir en vez de fingir que no hay reportes en el sistema.
    await page.goto('/mis-reportes');
    await expect(page.getByRole('heading', { name: 'Todavía no enviaste ninguno' })).toBeVisible();
    // La acción del estado vacío, no la de la barra superior (que también lleva a reportar).
    await expect(
      page.locator('#contenido').getByRole('link', { name: 'Reportar un punto' }),
    ).toBeVisible();
  });

  test('el mapa deja cambiar la capa administrativa', async ({ page, isMobile }) => {
    test.skip(isMobile, 'los chips de capa se solapan con la hoja en el viewport de móvil');
    await page.goto('/');
    const soloDistritos = page.getByRole('button', { name: 'Solo distritos' });
    await expect(async () => {
      await soloDistritos.click();
      await expect(soloDistritos).toHaveAttribute('aria-pressed', 'true');
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Distritos y UV' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

test.describe('panel técnico', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('el plano oficial se sirve con su advertencia', async ({ page, isMobile }) => {
    test.skip(isMobile, 'el panel técnico es de escritorio');
    await page.goto(`${PANEL}/login`);
    await page.locator('#email').fill(CREDENCIALES_TECNICO.email);
    await page.locator('#password').fill(CREDENCIALES_TECNICO.password);
    await page.getByTestId('boton-login').click();
    await expect(page).toHaveURL(/\/reportes/);

    await page.goto(`${PANEL}/plano`);
    await expect(
      page.getByRole('heading', { name: 'Plano oficial de zonificación' }),
    ).toBeVisible();
    const imagen = page.getByRole('img', { name: /Plano de zonificación/ });
    await expect(imagen).toBeVisible();
    // La advertencia es lo que impide que alguien tome los límites de esta imagen por los que
    // el sistema usa de verdad. El texto se busca por su idea, no palabra por palabra: lo que no
    // puede faltar es que diga que el plano y la capa vigente son fuentes distintas.
    await expect(
      page.getByText('Este plano y las capas del sistema no son la misma fuente.'),
    ).toBeVisible();
    await expect(page.getByText(/manda la capa vigente/)).toBeVisible();
  });
});
