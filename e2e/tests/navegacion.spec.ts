import { expect, test } from '@playwright/test';
import {
  CREDENCIALES_TECNICO,
  cuentaNuevaEnElNavegador,
  esperarPila,
  leerCiudad,
  PANEL,
} from './ayudas';

/**
 * El plano de zonificación que trae el panel es contenido de la instalación de Santa Cruz de la
 * Sierra, no del producto: el panel solo lo muestra si la ciudad configurada es esa
 * (`hayPlanoDeReferencia` en `apps/panel-admin/src/lib/plano.ts`).
 */
const CIUDAD_DEL_PLANO = { nombre: 'santa cruz de la sierra', pais: 'BO' };

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

  test('CA-X2: «Cómo funciona» cambia de pestaña sin recargar y muestra la fórmula v2', async ({
    page,
  }) => {
    await page.goto('/como-funciona');
    const pasos = page.getByRole('tab', { name: 'Los pasos' });
    await expect(pasos).toHaveAttribute('aria-selected', 'true');

    const colores = page.getByRole('tab', { name: 'Los colores' });
    // El clic se reintenta: la página se sirve renderizada y uno anterior a la hidratación se pierde.
    await expect(async () => {
      await colores.click();
      await expect(colores).toHaveAttribute('aria-selected', 'true');
    }).toPass({ timeout: 15_000 });
    // Severidad v2 (spec 2026-09-25, D1 y CA-C6): solo profundidad y frecuencia. Texto exacto: la
    // fórmula v1 contiene más términos y no debe pasar por una coincidencia parcial.
    await expect(
      page.getByText('puntaje = 2 × profundidad + frecuencia', { exact: true }),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Qué no es' }).click();
    await expect(page.getByText('Si hay riesgo para la vida, llamá al 911.')).toBeVisible();
  });

  test('«Mis reportes» es de la cuenta: sin sesión pide entrar, y con una cuenta nueva está vacía', async ({
    page,
  }) => {
    // Sin sesión no hay lista que mostrar: se ofrece entrar, sin fingir que no hay reportes.
    await page.goto('/mis-reportes');
    await expect(page.getByTestId('acceso-mis-reportes')).toBeVisible();
    await expect(page.getByTestId('mis-reportes-vacio')).toHaveCount(0);

    // Con sesión, la lista sale de `GET /api/v1/mis-reportes`: una cuenta recién creada no envió
    // nada, y eso es lo que tiene que decir.
    await cuentaNuevaEnElNavegador(page, 'mis-vacia-');
    await page.goto('/mis-reportes');
    await expect(page.getByTestId('mis-reportes-vacio')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Todavía no enviaste ninguno' })).toBeVisible();
    // La acción del estado vacío, no la de la barra superior (que también lleva a reportar).
    await expect(
      page.locator('#contenido').getByRole('link', { name: 'Reportar un punto' }),
    ).toBeVisible();
  });

  test('la lista vieja que guardaba el navegador se borra y no se muestra', async ({ page }) => {
    // Hasta contracts 0.11.0, el navegador recordaba los reportes enviados desde el dispositivo en
    // `curichi.mis-reportes.v1`. Ya no se usa: la lista es la de la cuenta, en cualquier teléfono,
    // y no queda en el dispositivo rastro de qué se reportó.
    await cuentaNuevaEnElNavegador(page, 'lista-vieja-');
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'curichi.mis-reportes.v1',
        JSON.stringify([
          {
            id: '00000000-0000-4000-8000-0000000000cc',
            enviado_en: new Date().toISOString(),
            titulo: 'Punto de la lista vieja',
            unidad_vecinal: 'UV-105',
            distrito: 'D02',
            severidad: 'media',
            tiene_foto: false,
          },
        ]),
      );
    });

    await page.goto('/mis-reportes');
    await expect(page.getByTestId('mis-reportes-vacio')).toBeVisible();
    await expect(page.getByText('Punto de la lista vieja')).toHaveCount(0);
    // Ya no hay nada que borrar a mano: la app la borra sola.
    await expect(page.getByTestId('boton-borrar-lista')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('curichi.mis-reportes.v1')))
      .toBeNull();
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

  test('el plano oficial se sirve con su advertencia (solo en la instalación que lo tiene)', async ({
    page,
    request,
    isMobile,
  }) => {
    test.skip(isMobile, 'el panel técnico es de escritorio');
    const ciudad = await leerCiudad(request);
    const hayPlano =
      ciudad.pais === CIUDAD_DEL_PLANO.pais &&
      ciudad.nombre.localeCompare(CIUDAD_DEL_PLANO.nombre, 'es', { sensitivity: 'base' }) === 0;

    await page.goto(`${PANEL}/login`);
    await page.locator('#email').fill(CREDENCIALES_TECNICO.email);
    await page.locator('#password').fill(CREDENCIALES_TECNICO.password);
    await page.getByTestId('boton-login').click();
    await expect(page).toHaveURL(/\/reportes/);

    // La barra lateral ofrece el plano solo donde existe.
    await expect(
      page.getByRole('navigation', { name: 'Secciones del panel' }).getByRole('link', {
        name: 'Plano oficial',
      }),
    ).toHaveCount(hayPlano ? 1 : 0);

    await page.goto(`${PANEL}/plano`);
    await expect(
      page.getByRole('heading', { name: 'Plano oficial de zonificación' }),
    ).toBeVisible();
    if (!hayPlano) {
      // En otra ciudad ese plano sería el de otro municipio: se dice que no hay y se remite a Capas.
      await expect(page.getByTestId('plano-no-disponible')).toContainText(ciudad.nombre);
      await expect(page.getByRole('img', { name: /Plano de zonificación/ })).toHaveCount(0);
      return;
    }
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
