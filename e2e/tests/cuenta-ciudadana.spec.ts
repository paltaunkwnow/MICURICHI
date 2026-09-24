import { expect, test } from '@playwright/test';
import {
  API,
  crearCuentaYEntrarPorUi,
  cuentaNuevaConSesion,
  esperarPila,
  loginCiudadano,
  PUNTO_CENTRO,
  reporteValido,
} from './ayudas';

/**
 * Cuentas ciudadanas: qué se puede hacer sin una y qué no.
 *
 * LA LÍNEA. Ver el mapa, moverlo, abrir un reporte y consultar los datos públicos **no** necesita
 * cuenta y no la va a necesitar. Lo único que la pide es **crear** un reporte, porque el límite
 * por IP no resiste a una IP dinámica: modo avión y de vuelta, y el contador empieza de cero.
 *
 * Estas pruebas van en serie y cada una que necesita reportar se crea su propia cuenta: una
 * cuenta solo puede enviar un reporte por hora, y compartirla haría que el resultado dependiera
 * del orden y de cuándo se corrió la suite la última vez.
 */
test.describe.configure({ mode: 'serial' });

test.describe('cuenta ciudadana: el mapa abierto, el envío con cuenta', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('sin cuenta se navega el mapa entero', async ({ page }) => {
    await page.goto('/');
    // Nada de «Debés iniciar sesión para usar Mi Curichi»: el mapa carga y se usa.
    await expect(page.getByText(/iniciá sesión para (ver|usar)/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reportar un punto' }).first()).toBeVisible();

    // Y los datos públicos llegan sin credenciales de ningún tipo.
    const lista = await page.request.get(`${API}/api/v1/reportes?limite=5`);
    expect(lista.status()).toBe(200);
    expect((await lista.json()).type).toBe('FeatureCollection');
  });

  test('al intentar reportar sin cuenta, la app explica qué falta y ofrece las dos puertas', async ({
    page,
  }) => {
    await page.goto('/reportar');
    // Acotado a `#contenido`: la barra superior también ofrece «Iniciar sesión», y eso está bien;
    // lo que se comprueba acá es el panel del flujo de reporte.
    const panel = page.locator('#contenido');
    await expect(panel.getByRole('heading', { name: 'Necesitás una cuenta' })).toBeVisible();
    await expect(
      panel.getByText(/Para agregar un reporte hace falta tener una cuenta/i),
    ).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Cancelar' })).toBeVisible();

    // «Cancelar» devuelve al mapa sin pedir nada.
    await panel.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForURL('**/');
  });

  test('crear cuenta, entrar y ver el estado de la sesión', async ({ page }) => {
    const datos = await crearCuentaYEntrarPorUi(page, '/cuenta');
    await page.waitForURL('**/cuenta');
    await expect(page.getByRole('heading', { name: datos.nombre })).toBeVisible();
    await expect(page.getByText(datos.email)).toBeVisible();
    await expect(page.getByText('Podés enviar un reporte ahora.')).toBeVisible();

    // Cerrar sesión deja la app como estaba: el mapa sigue ahí.
    await page.locator('#contenido').getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL('**/');
    await page.goto('/cuenta');
    await expect(
      page.locator('#contenido').getByRole('link', { name: 'Iniciar sesión' }),
    ).toBeVisible();
  });

  test('una cuenta solo puede enviar un reporte por hora', async ({ request }) => {
    await cuentaNuevaConSesion(request, 'cuota-');
    const primero = await request.post(`${API}/api/v1/reportes`, {
      data: reporteValido('E2E-cuota-1'),
    });
    expect(primero.status(), await primero.text()).toBe(201);

    const segundo = await request.post(`${API}/api/v1/reportes`, {
      data: reporteValido('E2E-cuota-2'),
    });
    expect(segundo.status()).toBe(429);
    const cuerpo = await segundo.json();
    expect(cuerpo.codigo).toBe('CUOTA_DE_REPORTES');
    // Se le dice cuándo, no solo que no.
    expect(Number(segundo.headers()['retry-after'])).toBeGreaterThan(0);
    expect(new Date(cuerpo.detalles.disponible_en).getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * CAMBIAR DE IP NO DEVUELVE EL TURNO. Es el ataque que motivó pedir cuenta: con IPs dinámicas,
   * un límite por conexión se reinicia a voluntad. El servicio de esta suite no confía en
   * `X-Forwarded-For` (TRUST_PROXY viene apagado), así que estas cabeceras no cambian nada
   * —que es el comportamiento correcto— y el freno de la cuenta actúa igual.
   */
  test('cambiar las cabeceras de IP no da más turnos', async ({ request }) => {
    await cuentaNuevaConSesion(request, 'ip-');
    expect(
      (await request.post(`${API}/api/v1/reportes`, { data: reporteValido('E2E-ip-1') })).status(),
    ).toBe(201);

    for (const ip of ['203.0.113.7', '198.51.100.23', '2001:db8::1']) {
      const r = await request.post(`${API}/api/v1/reportes`, {
        data: reporteValido(`E2E-ip-${ip}`),
        headers: { 'x-forwarded-for': ip, 'x-real-ip': ip, forwarded: `for=${ip}` },
      });
      expect(r.status(), `con IP declarada ${ip}`).toBe(429);
      expect((await r.json()).codigo).toBe('CUOTA_DE_REPORTES');
    }
  });

  test('otra cuenta puede reportar aunque la primera haya gastado su turno', async ({
    request,
  }) => {
    await cuentaNuevaConSesion(request, 'a-');
    expect(
      (await request.post(`${API}/api/v1/reportes`, { data: reporteValido('E2E-A') })).status(),
    ).toBe(201);
    expect(
      (await request.post(`${API}/api/v1/reportes`, { data: reporteValido('E2E-A2') })).status(),
    ).toBe(429);

    // La misma sesión de navegación, otra cuenta: el límite es de la cuenta, no del dispositivo.
    await cuentaNuevaConSesion(request, 'b-');
    expect(
      (await request.post(`${API}/api/v1/reportes`, { data: reporteValido('E2E-B') })).status(),
    ).toBe(201);
  });

  test('el alta no revela qué correos ya tienen cuenta', async ({ request }) => {
    const nuevo = {
      email: `e2e-enum-${Date.now()}@curichi.test`,
      nombre: 'Vecina',
      password: 'contrasena-de-prueba-e2e',
    };
    const primera = await request.post(`${API}/api/v1/auth/registro`, { data: nuevo });
    const repetida = await request.post(`${API}/api/v1/auth/registro`, { data: nuevo });
    expect(repetida.status()).toBe(primera.status());
    expect(await repetida.json()).toEqual(await primera.json());

    // Y contra una cuenta técnica existente, exactamente lo mismo.
    const contraTecnico = await request.post(`${API}/api/v1/auth/registro`, {
      data: { ...nuevo, email: 'tecnico@curichi.local' },
    });
    expect(contraTecnico.status()).toBe(primera.status());
    expect(await contraTecnico.json()).toEqual(await primera.json());
  });

  test('una cuenta ciudadana no abre ninguna puerta técnica', async ({ request }) => {
    await loginCiudadano(request);
    for (const ruta of [
      '/api/v1/tecnico/reportes',
      '/api/v1/exportar?formato=csv',
      '/api/v1/indicadores',
      '/api/v1/admin/capas',
    ]) {
      const r = await request.get(`${API}${ruta}`);
      expect(r.status(), ruta).toBe(403);
    }
  });

  /**
   * El hallazgo A-01 de la auditoría fue que la vista técnica se activaba por la simple presencia
   * de una cookie. Ahora la app pública tiene cookies propias, así que hay que volver a
   * comprobar que la cosa sigue cerrada: con sesión ciudadana, el mapa devuelve exactamente lo
   * mismo que sin ella.
   */
  test('con sesión de ciudadano el mapa público no cambia ni un byte', async ({ request }) => {
    const anonimo = await request.get(`${API}/api/v1/reportes?limite=50`);
    const cuerpoAnonimo = await anonimo.text();
    await loginCiudadano(request);
    const conCuenta = await request.get(`${API}/api/v1/reportes?limite=50`);
    expect(conCuenta.status()).toBe(200);
    expect(await conCuenta.text()).toBe(cuerpoAnonimo);
  });

  test('el mapa público no expone el correo ni el identificador de quien reportó', async ({
    request,
  }) => {
    const r = await request.get(`${API}/api/v1/reportes?limite=50`);
    const cuerpo = await r.text();
    expect(cuerpo).not.toContain('@curichi.local');
    expect(cuerpo).not.toContain('@curichi.test');
    expect(cuerpo).not.toContain('autor_id');
    const { features } = JSON.parse(cuerpo) as {
      features: Array<{ properties: Record<string, unknown> }>;
    };
    for (const f of features) expect(f.properties).not.toHaveProperty('autor_id');
  });

  test('el punto elegido sigue resolviéndose sin cuenta', async ({ request }) => {
    // `POST /geo/v1/resolver` lo usa el formulario para mostrar la unidad vecinal ANTES de
    // enviar, y también la página pública: si pidiera sesión, el mapa perdería esa ayuda.
    const r = await request.post('http://127.0.0.1:3002/geo/v1/resolver', { data: PUNTO_CENTRO });
    expect(r.status()).toBe(200);
    expect((await r.json()).dentro_cobertura).toBe(true);
  });
});
