import { expect, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_TECNICO,
  crearCuentaYEntrarPorUi,
  esperarPila,
  loginTecnico,
  PANEL,
  PUNTO_CENTRO,
} from './ayudas';

/**
 * Camino crítico transversal (CLAUDE.md §4.7): el vecino reporta desde la app pública, el técnico lo
 * valida en el panel, el punto aparece en el mapa público y sale en la exportación.
 */
test.describe('recorrido completo ciudadano → técnico → mapa público → exportación', () => {
  const marca = `E2E-${Date.now()}`;
  let idReporte = '';

  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('un vecino crea una cuenta, entra y reporta desde la app pública', async ({ page }) => {
    // El mapa se ve sin cuenta; enviar un reporte no. Al entrar a reportar sin sesión, la app
    // no da un 401 pelado: explica qué hace falta y ofrece las dos puertas.
    await page.goto('/reportar');
    const panel = page.locator('#contenido');
    await expect(panel.getByRole('heading', { name: 'Necesitás una cuenta' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();

    await crearCuentaYEntrarPorUi(page, '/reportar');
    await page.waitForURL('**/reportar');
    await expect(page.getByRole('heading', { name: 'Reportar un punto' })).toBeVisible();

    // Paso 1 · dónde. Alternativa accesible al mapa: escribir las coordenadas.
    await page.getByTestId('opcion-coordenadas').click();
    await page.locator('#lat').fill(String(PUNTO_CENTRO.lat));
    await page.locator('#lon').fill(String(PUNTO_CENTRO.lon));
    await page.getByTestId('boton-confirmar-ubicacion').click();

    const resuelta = page.getByTestId('ubicacion-resuelta');
    await expect(resuelta).toBeVisible();
    await expect(resuelta).toContainText('UV');
    await expect(resuelta).toContainText('Distrito');
    await page.getByTestId('boton-siguiente').click();

    // Paso 2 · hasta dónde llegó el agua y cuánto tardó en irse.
    await page.locator('input[name="tirante_estimado"][value="rodilla"]').check();
    await page.locator('input[name="duracion_estimada"][value="2h_12h"]').check();
    await page.getByTestId('boton-siguiente').click();

    // Paso 3 · cada cuánto pasa y a quién afecta. Acá queda determinada la severidad.
    await page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check();
    await page.locator('input[name="afectacion"][value="vehicular"]').check();
    // 2×2 (rodilla) + 3 (2 a 12 h) + 3 (cada lluvia fuerte) + 2 (vehicular) = 12 → media.
    await expect(page.getByText('Severidad media')).toBeVisible();
    await expect(page.getByText('12/20')).toBeVisible();
    await page.getByTestId('boton-siguiente').click();

    // Paso 4 · fotos y descripción.
    await page
      .locator('textarea[name="descripcion"]')
      .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}`);
    await page.getByTestId('boton-siguiente').click();

    // Paso 5 · revisión y envío.
    await page.locator('input[name="ubicacion_tipo"][value="via_publica"]').check();
    await page.getByTestId('boton-enviar').click();

    const exito = page.getByTestId('reporte-creado');
    await expect(exito).toBeVisible();
    await expect(exito).toContainText('en revisión');
    idReporte = (await exito.locator('[data-id]').first().getAttribute('data-id')) ?? '';
    expect(idReporte).not.toBe('');
  });

  test('el reporte no se publica hasta que lo validan', async ({ request }) => {
    expect(idReporte, 'el test anterior debe haber creado el reporte').not.toBe('');
    const r = await request.get(`${API}/api/v1/reportes/${idReporte}`);
    expect(r.status(), 'moderación previa: un reporte nuevo no es público').toBe(404);
  });

  test('el técnico lo valida desde el panel', async ({ page }) => {
    await page.goto(`${PANEL}/login`);
    await page.locator('#email').fill(CREDENCIALES_TECNICO.email);
    await page.locator('#password').fill(CREDENCIALES_TECNICO.password);
    await page.getByTestId('boton-login').click();
    await expect(page).toHaveURL(/\/reportes/);

    await page.goto(`${PANEL}/reportes/${idReporte}`);
    await page.getByTestId('boton-validar').click();
    const confirmar = page.getByTestId('confirmar-accion');
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click();

    await expect(page.getByTestId('estado-actual')).toContainText('Validado');
  });

  test('ya validado, aparece en el mapa público con su unidad vecinal', async ({
    page,
    request,
  }) => {
    const r = await request.get(`${API}/api/v1/reportes/${idReporte}`);
    expect(r.status()).toBe(200);
    const f = await r.json();
    expect(f.properties.estado).toBe('validado');
    expect(f.properties.unidad_vecinal?.id).toBeTruthy();
    expect(f.properties.distrito?.id).toBeTruthy();
    expect(f.properties.severidad).toBeTruthy();

    await page.goto(`/reporte/${idReporte}`);
    // El detalle se coloca dos veces (columna de escritorio y hoja de móvil) y solo una se ve en
    // cada tamaño; se consulta dentro de la que corresponde a este proyecto de Playwright.
    const hoja = page.getByTestId('hoja-detalle');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByTestId('detalle-uv')).toContainText('UV');
    await expect(hoja.getByTestId('detalle-distrito')).toContainText('Distrito');
  });

  test('sale en la exportación del técnico, con nota metodológica', async ({ request }) => {
    await loginTecnico(request);

    const geojson = await request.get(`${API}/api/v1/exportar?formato=geojson`);
    expect(geojson.status()).toBe(200);
    const datos = await geojson.json();
    expect(datos.nota_metodologica).toContain('inventario de reportes ciudadanos');
    expect(datos.features.some((x: { id: string }) => x.id === idReporte)).toBe(true);

    const csv = await request.get(`${API}/api/v1/exportar?formato=csv`);
    expect(csv.status()).toBe(200);
    const texto = await csv.text();
    expect(texto).toContain('id,estado,severidad');
    expect(texto).toContain(idReporte);
  });
});
