import { readFile } from 'node:fs/promises';
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_ADMIN,
  CREDENCIALES_EJECUTIVO,
  CREDENCIALES_TECNICO,
  crearReportePorApi,
  cuentaNuevaConSesion,
  esperarPila,
  leerCiudad,
  loginTecnico,
  PANEL,
  sesionDelPanelEnElNavegador,
} from './ayudas';

/**
 * Panel técnico (Parte 2) después de la revisión de producción:
 *
 * - La puerta por rol: una cuenta ciudadana que entra al panel ve «sin acceso» y puede salir; y
 *   `/login` no la rebota, para que pueda entrar con otra cuenta.
 * - «Volver al inicio» (raíz, 404 y pantalla de error) lleva a la pantalla de cada rol. El
 *   ejecutivo que entra por la raíz llega a su panel SIN el aviso de «te trajimos».
 * - «Exportar GeoJSON» es un botón que descarga y avisa si la selección no cupo en el archivo.
 * - Los indicadores cuentan los reportes vigentes: el total no suma rechazados ni duplicados.
 * - Reabrir un rechazado exige motivo, en la API y en el formulario.
 */

/** Id con formato válido que no existe: para simular respuestas sin tocar datos reales. */
const ID_FALSO = '00000000-0000-4000-8000-00000000e2e0';

async function entrarPorElFormulario(
  page: Page,
  credenciales: { email: string; password: string },
) {
  await page.goto(`${PANEL}/login`);
  await page.locator('#email').fill(credenciales.email);
  await page.locator('#password').fill(credenciales.password);
  await page.getByTestId('boton-login').click();
}

/** Primer número de un elemento (los KPI del panel lo muestran sin formato). */
async function numeroEn(elemento: Locator): Promise<number | null> {
  const r = /\d[\d.\s]*/.exec((await elemento.textContent()) ?? '');
  return r ? Number(r[0].replace(/\D/g, '')) : null;
}

/** Un reporte de una cuenta nueva, rechazado por el técnico. Deja `request` con sesión de técnico. */
async function crearReporteRechazado(request: APIRequestContext, marca: string) {
  const id = await crearReportePorApi(request, marca);
  await loginTecnico(request);
  const r = await request.patch(`${API}/api/v1/reportes/${id}/estado`, {
    data: { estado: 'rechazado', estado_motivo: 'Prueba E2E: no corresponde.' },
  });
  expect(r.status(), await r.text()).toBe(200);
  return id;
}

test.beforeAll(async ({ request }) => {
  await esperarPila(request);
});

test.describe('panel técnico · la puerta por rol', () => {
  test('una cuenta ciudadana ve que no tiene acceso y puede cerrar la sesión desde ahí', async ({
    page,
    request,
  }) => {
    const vecina = await cuentaNuevaConSesion(request, 'panel-sin-acceso-');
    await entrarPorElFormulario(page, vecina);

    const salir = page.getByTestId('cerrar-sesion-sin-acceso');
    await expect(salir).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Tu cuenta no tiene acceso al panel técnico.')).toBeVisible();

    await salir.click();
    await expect(page).toHaveURL(/\/login$/);
    // La sesión se cerró de verdad, no solo en la pantalla.
    expect((await page.request.get(`${PANEL}/api/v1/auth/yo`)).status()).toBe(401);
  });

  test('con sesión ciudadana, /login muestra el formulario y deja entrar con otra cuenta', async ({
    page,
    request,
  }) => {
    const vecina = await cuentaNuevaConSesion(request, 'panel-login-');
    await entrarPorElFormulario(page, vecina);
    await expect(page.getByTestId('cerrar-sesion-sin-acceso')).toBeVisible({ timeout: 60_000 });

    // Antes /login la devolvía a «sin acceso» y no había forma de entrar con otra cuenta.
    const yo = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/auth/yo');
    await page.goto(`${PANEL}/login`);
    expect((await yo).status(), 'la sesión ciudadana sigue viva al abrir /login').toBe(200);
    await page.locator('#email').fill(CREDENCIALES_TECNICO.email);
    await page.locator('#password').fill(CREDENCIALES_TECNICO.password);
    await page.getByTestId('boton-login').click();
    await expect(page).toHaveURL(/\/reportes$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();
  });

  const ROLES = [
    {
      rol: 'técnico',
      credenciales: CREDENCIALES_TECNICO,
      inicio: '/reportes',
      texto: 'Ir a la bandeja',
      // El detalle de un reporte que llega con una forma imposible: la pantalla falla al dibujarlo.
      pantallaQueFalla: `/reportes/${ID_FALSO}`,
      respuestaRota: `**/api/v1/tecnico/reportes/${ID_FALSO}`,
    },
    {
      rol: 'ejecutivo',
      credenciales: CREDENCIALES_EJECUTIVO,
      inicio: '/ejecutivo',
      texto: 'Ir al panel ejecutivo',
      pantallaQueFalla: '/ejecutivo',
      respuestaRota: '**/api/v1/ejecutivo/resumen*',
    },
  ] as const;

  for (const r of ROLES) {
    test(`${r.rol}: la raíz, el 404 y la pantalla de error llevan a ${r.inicio}`, async ({
      page,
    }) => {
      await sesionDelPanelEnElNavegador(page, r.credenciales);

      await page.goto(`${PANEL}/`);
      await expect(page).toHaveURL(new RegExp(`${r.inicio}$`), { timeout: 60_000 });
      if (r.rol === 'ejecutivo')
        await expect(page.getByTestId('ejecutivo-total')).toHaveText(/\d/, { timeout: 60_000 });
      else await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();
      // Entrar por la raíz no es «pisar una sección ajena»: no hay nada que explicar.
      await expect(page.getByTestId('aviso-acceso')).toHaveText('');

      await page.goto(`${PANEL}/esta-pantalla-no-existe-e2e`);
      await expect(page.getByRole('heading', { name: 'Esa pantalla no existe' })).toBeVisible();
      const enlace404 = page.getByTestId('enlace-inicio');
      await expect(enlace404).toHaveAttribute('href', r.inicio);
      await expect(enlace404).toHaveText(r.texto);

      await page.route(r.respuestaRota, (ruta) =>
        ruta.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
      );
      await page.goto(`${PANEL}${r.pantallaQueFalla}`);
      await expect(page.getByRole('heading', { name: 'La pantalla falló' })).toBeVisible({
        timeout: 60_000,
      });
      const enlaceError = page.getByTestId('enlace-inicio');
      await expect(enlaceError).toHaveAttribute('href', r.inicio);
      await expect(enlaceError).toHaveText(r.texto);
    });
  }

  test('sin sesión, el 404 lleva a la raíz, que decide (al login)', async ({ page }) => {
    await page.goto(`${PANEL}/esta-pantalla-no-existe-e2e`);
    await expect(page.getByRole('heading', { name: 'Esa pantalla no existe' })).toBeVisible();
    const enlace = page.getByTestId('enlace-inicio');
    await expect(enlace).toHaveAttribute('href', '/');
    await expect(enlace).toHaveText('Ir al inicio');
    await enlace.click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 60_000 });
  });
});

test.describe('panel técnico · exportación', () => {
  /** Filtro para que el archivo sea chico: lo que se prueba es la forma, no el volumen. */
  const FILTRO = 'estado=validado';

  async function exportar(page: Page) {
    const boton = page.getByTestId('exportar-geojson');
    // Es un botón (va por `fetch` para poder leer `truncado`), no un enlace de descarga.
    expect(await boton.evaluate((e) => e.tagName)).toBe('BUTTON');
    const descarga = page.waitForEvent('download');
    const respuesta = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/exportar');
    await boton.click();
    const [d, r] = await Promise.all([descarga, respuesta]);
    // El botón vuelve a su estado cuando terminó todo, aviso incluido.
    await expect(boton).toHaveText(/Exportar GeoJSON/);
    await expect(boton).toBeEnabled();
    return { descarga: d, respuesta: r };
  }

  test('«Exportar GeoJSON» descarga la selección filtrada y no avisa si vino entera', async ({
    page,
  }) => {
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
    await page.goto(`${PANEL}/reportes?${FILTRO}`);
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();

    const { descarga, respuesta } = await exportar(page);
    expect(new URL(respuesta.url()).searchParams.get('estado')).toBe('validado');
    expect(new URL(respuesta.url()).searchParams.get('formato')).toBe('geojson');
    expect(descarga.suggestedFilename()).toMatch(
      /^mi-curichi-reportes-\d{4}-\d{2}-\d{2}\.geojson$/,
    );

    const archivo = JSON.parse(await readFile(await descarga.path(), 'utf8'));
    expect(archivo.type).toBe('FeatureCollection');
    expect(archivo.nota_metodologica).toContain('percepción');
    expect(archivo.exportados).toBe(archivo.features.length);
    expect(archivo.truncado).toBe(false);
    expect(archivo.total).toBe(archivo.exportados);
    for (const f of archivo.features) expect(f.properties.estado).toBe('validado');
    await expect(page.getByTestId('aviso-exportacion')).toHaveText('');
  });

  test('si la exportación viene recortada, el panel lo avisa con las dos cifras', async ({
    page,
    request,
  }) => {
    const { locale } = await leerCiudad(request);
    let exportados = -1;
    let total = -1;
    // Recortar de verdad exigiría más de 50 000 reportes: se toma la respuesta real y se le pone
    // el `total` de una selección más grande, como la mandaría api-core con el tope alcanzado.
    await page.route('**/api/v1/exportar?*', async (ruta) => {
      const real = await ruta.fetch();
      const cuerpo = await real.json();
      exportados = cuerpo.exportados;
      total = cuerpo.exportados + 7;
      // Las cabeceras de la respuesta real (el nombre del archivo va en Content-Disposition), sin
      // las que describen el cuerpo original: el nuevo va sin comprimir y mide otra cosa.
      const cabeceras = { ...real.headers() };
      for (const h of ['content-length', 'content-encoding', 'transfer-encoding'])
        delete cabeceras[h];
      await ruta.fulfill({
        status: real.status(),
        headers: cabeceras,
        body: JSON.stringify({ ...cuerpo, total, truncado: true }),
      });
    });
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
    await page.goto(`${PANEL}/reportes?${FILTRO}`);
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();

    await exportar(page);
    // Las cifras, con el formato de números de la ciudad configurada.
    const n = new Intl.NumberFormat(locale);
    await expect(page.getByTestId('aviso-exportacion')).toHaveText(
      `Se exportaron ${n.format(exportados)} de ${n.format(total)} reportes; afiná los filtros.`,
    );
  });
});

test.describe('panel técnico · indicadores y moderación', () => {
  test('los indicadores cuentan los vigentes: el total no suma rechazados ni duplicados', async ({
    page,
    request,
  }) => {
    // Precondición: al menos un rechazado, para que la diferencia se vea.
    await crearReporteRechazado(request, `E2E-IND-${Date.now()}`);

    // Se compara la pantalla con la respuesta que recibió ella misma: api-core cachea los
    // indicadores 30 s y una lectura aparte podría caer al otro lado del vencimiento.
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
    const respuesta = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/indicadores' && res.status() === 200,
    );
    await page.goto(`${PANEL}/indicadores`);
    const d = await (await respuesta).json();
    const e = d.por_estado as Record<string, number>;
    const vigentes = (e.nuevo ?? 0) + (e.validado ?? 0) + (e.resuelto ?? 0);
    const recibidos = Object.values(e).reduce((a, b) => a + b, 0);
    expect(d.total, 'total = nuevos + validados + resueltos').toBe(vigentes);
    expect(e.rechazado ?? 0).toBeGreaterThan(0);
    expect(d.total, 'los rechazados no cuentan en el total').toBeLessThan(recibidos);

    const kpi = (id: string) => page.getByTestId(id).locator('p').first();
    await expect(page.getByTestId('indicador-vigentes')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('indicador-vigentes')).toContainText(
      'sin rechazados ni duplicados',
    );
    expect(await numeroEn(kpi('indicador-vigentes'))).toBe(d.total);
    expect(await numeroEn(kpi('indicador-validados'))).toBe(e.validado ?? 0);
    expect(await numeroEn(kpi('indicador-nuevos'))).toBe(e.nuevo ?? 0);
    expect(await numeroEn(kpi('indicador-puntos-criticos'))).toBe(d.puntos_criticos_recurrentes);
  });

  test('reabrir un rechazado exige motivo, en la API y en el formulario', async ({
    page,
    request,
  }) => {
    const id = await crearReporteRechazado(request, `E2E-REABRIR-${Date.now()}`);

    // API: sin motivo, 400 y el reporte sigue rechazado.
    const admin = await request.post(`${API}/api/v1/auth/login`, { data: CREDENCIALES_ADMIN });
    expect(admin.status()).toBe(200);
    const sinMotivo = await request.patch(`${API}/api/v1/reportes/${id}/estado`, {
      data: { estado: 'nuevo' },
    });
    expect(sinMotivo.status()).toBe(400);
    expect((await sinMotivo.json()).codigo).toBe('PAYLOAD_INVALIDO');
    const sigue = await request.get(`${API}/api/v1/tecnico/reportes/${id}`);
    expect((await sigue.json()).properties.estado).toBe('rechazado');

    // Formulario: sin motivo no sale ninguna petición y se dice por qué.
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_ADMIN);
    await page.goto(`${PANEL}/reportes/${id}`);
    await expect(page.getByTestId('estado-actual')).toHaveText('Rechazado', { timeout: 60_000 });
    let cambios = 0;
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes(`/reportes/${id}/estado`)) cambios++;
    });

    await page.getByTestId('boton-reabrir').click();
    const motivo = page.locator('#motivo');
    const confirmar = page.getByTestId('confirmar-accion');
    // Vacío o con solo espacios lo dice el panel (el formulario es noValidate: el globo nativo del
    // navegador no aparece), que valida con el mismo esquema que api-core.
    await confirmar.click();
    await expect(page.getByText('Para reabrir el reporte escribí el motivo')).toBeVisible();
    await motivo.fill('   ');
    await confirmar.click();
    await expect(page.getByText('Para reabrir el reporte escribí el motivo')).toBeVisible();
    expect(cambios, 'sin motivo no sale ningún PATCH').toBe(0);

    await motivo.fill('Se reabre para revisarlo de nuevo (prueba E2E).');
    const respuesta = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().includes(`/reportes/${id}/estado`),
    );
    await confirmar.click();
    expect((await respuesta).status()).toBe(200);
    await expect(page.getByTestId('estado-actual')).toHaveText('Nuevo');
    await expect(page.getByTestId('mensaje-accion')).toContainText('Estado actualizado');
  });
});
