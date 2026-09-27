import { expect, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_TECNICO,
  crearCuentaYEntrarPorUi,
  elegirPuntoPorCoordenadas,
  esperarPila,
  GPS_EN_EL_CENTRO,
  loginTecnico,
  PANEL,
  PRECISION_GPS_M,
  PUNTO_AJUSTADO,
  RADIO_DISPOSITIVO_M,
} from './ayudas';

/**
 * Camino crítico transversal (CLAUDE.md §4.7): el vecino reporta desde la app pública, el técnico lo
 * valida en el panel, el punto aparece en el mapa público y sale en la exportación.
 *
 * El vecino comparte su ubicación (el GPS simulado en PUNTO_CENTRO, con 10 m de precisión) y
 * ajusta el punto a 50 m, dentro del círculo de 60 m. El técnico ve la distancia y la precisión,
 * no la posición del teléfono (contracts 0.9.0).
 */
test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

/** Distancia entre `PUNTO_AJUSTADO` y el teléfono, redondeada al metro como la guarda api-core. */
const DISTANCIA_M = 50;

test.describe('recorrido completo ciudadano → técnico → mapa público → exportación', () => {
  const marca = `E2E-${Date.now()}`;
  let idReporte = '';

  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('CA-X1: un vecino crea una cuenta, entra y reporta desde la app pública sin duración ni afectación', async ({
    page,
  }) => {
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

    // Paso 1 · dónde. Se comparte la ubicación y el punto se ajusta con la alternativa accesible al
    // arrastre: escribir las coordenadas, a 60 m o menos del teléfono.
    await elegirPuntoPorCoordenadas(page, PUNTO_AJUSTADO);

    const resuelta = page.getByTestId('ubicacion-resuelta');
    await expect(resuelta).toBeVisible();
    await expect(resuelta).toContainText('UV');
    await expect(resuelta).toContainText('Distrito');
    await page.getByTestId('boton-siguiente').click();

    // Hasta dónde llegó el agua y cada cuánto pasa: son las dos únicas preguntas de la severidad
    // v2. El formulario ya no pregunta duración ni afectación (CA-W1). Si profundidad y frecuencia van
    // en el mismo paso o en dos seguidos lo decide P-4 de la spec; el recorrido vale para ambos,
    // porque cada paso se desmonta al avanzar y solo existe en el DOM el que se está viendo.
    await page.locator('input[name="profundidad_estimada"][value="rodilla"]').check();
    if ((await page.locator('input[name="frecuencia"]').count()) === 0)
      await page.getByTestId('boton-siguiente').click();
    await page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check();
    // Severidad v2: 2×2 (rodilla) + 3 (cada lluvia fuerte) = 7 de 12 → media.
    await expect(page.getByText('Severidad media')).toBeVisible();
    await expect(page.getByText('7/12')).toBeVisible();
    // El máximo ya no es 20: ningún «N/20» de la fórmula v1 puede quedar en pantalla.
    await expect(page.getByText(/\d+\/20\b/)).toHaveCount(0);
    await page.getByTestId('boton-siguiente').click();

    // Fotos y descripción.
    await page
      .locator('textarea[name="descripcion"]')
      .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}`);
    await page.getByTestId('boton-siguiente').click();

    // Revisión y envío.
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

    // Cómo se ubicó: ajustado a mano dentro del radio, con la precisión y la distancia al teléfono.
    await expect(
      page.getByText(`Ajustado a mano, a ≤ ${RADIO_DISPOSITIVO_M} m del GPS`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`± ${PRECISION_GPS_M} m`, { exact: true })).toBeVisible();
    await expect(page.getByText(`a ${DISTANCIA_M} m del GPS`, { exact: true })).toBeVisible();
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
    const propio = datos.features.find((x: { id: string }) => x.id === idReporte);
    expect(propio, 'el reporte tiene que estar en la exportación').toBeTruthy();
    expect(propio.properties).toMatchObject({
      ubicacion_metodo: 'manual',
      precision_gps_m: PRECISION_GPS_M,
      distancia_dispositivo_m: DISTANCIA_M,
    });
    expect(Object.keys(propio.properties)).not.toContain('dispositivo');

    const csv = await request.get(`${API}/api/v1/exportar?formato=csv`);
    expect(csv.status()).toBe(200);
    const texto = await csv.text();
    expect(texto).toContain('id,estado,severidad');
    expect(texto).toContain('distancia_dispositivo_m');
    expect(texto).toContain(idReporte);
  });
});
