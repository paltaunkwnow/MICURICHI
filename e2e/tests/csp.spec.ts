import { expect, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  CABECERA_SONDEO,
  CREDENCIALES_EJECUTIVO,
  CREDENCIALES_TECNICO,
  compartirUbicacion,
  comprobarCspConNonce,
  comprobarSinViolacionesCsp,
  continuar,
  cuentaNuevaEnElNavegador,
  esperarPila,
  esperarPuntosEnElMapa,
  esperarRedQuieta,
  GPS_EN_EL_CENTRO,
  INTERVALO_SONDEO_MS,
  llegarAFotos,
  PANEL,
  sacarFotoConLaCamara,
  sesionDelPanelEnElNavegador,
  vigilarCsp,
  vigilarRed,
} from './ayudas';

/**
 * CSP con nonce en las dos apps (plan 2026-09-26, tanda T9, pasos S40 y S41): `script-src` con un
 * nonce por petición y 'strict-dynamic', sin 'unsafe-inline'. Estas pruebas recorren las pantallas
 * que más cargan (el mapa con su worker, la cámara con su miniatura `blob:`, el sondeo del panel) y
 * exigen que el navegador no haya bloqueado nada: ni un evento `securitypolicyviolation`, ni un
 * mensaje de la CSP en la consola, ni una petición cortada. Antes de eso comprueban que la página
 * llegó con la CSP de nonce, porque sin CSP «sin violaciones» no probaría nada.
 */

const esPost = (ruta: string) => (r: { url(): string; request(): { method(): string } }) =>
  r.request().method() === 'POST' && new URL(r.url()).pathname === ruta;

// ------------------------------------------------------------------ panel

interface PantallaPanel {
  nombre: string;
  credenciales: { email: string; password: string };
  ruta: (page: Page) => Promise<string>;
  /** La consulta que el panel refresca sola en esa pantalla. */
  consulta: (pathname: string) => boolean;
  lista: (page: Page) => Promise<void>;
}

const PANTALLAS_PANEL: PantallaPanel[] = [
  {
    nombre: 'la bandeja',
    credenciales: CREDENCIALES_TECNICO,
    ruta: async () => '/reportes',
    consulta: (p) => p === '/api/v1/tecnico/reportes',
    lista: (page) =>
      expect(page.getByText(/reportes con los filtros actuales/)).toBeVisible({ timeout: 60_000 }),
  },
  {
    nombre: 'el detalle',
    credenciales: CREDENCIALES_TECNICO,
    // Uno con foto si hay: así la página carga también una imagen servida por api-core.
    ruta: async (page) => {
      const r = await page.request.get(`${PANEL}/api/v1/tecnico/reportes?limite=50`);
      expect(r.status(), await r.text()).toBe(200);
      const lista = ((await r.json()).features ?? []) as Array<{
        properties: { id: string; fotos?: string[] };
      }>;
      const elegido = lista.find((f) => f.properties.fotos?.length) ?? lista[0];
      expect(elegido, 'hace falta al menos un reporte (`pnpm db:seed:samples`)').toBeDefined();
      return `/reportes/${elegido?.properties.id}`;
    },
    consulta: (p) => p.startsWith('/api/v1/tecnico/reportes/'),
    lista: (page) => expect(page.getByTestId('estado-actual')).toBeVisible({ timeout: 60_000 }),
  },
  {
    nombre: 'el panel ejecutivo',
    credenciales: CREDENCIALES_EJECUTIVO,
    ruta: async () => '/ejecutivo',
    consulta: (p) => p === '/api/v1/ejecutivo/resumen',
    lista: (page) =>
      expect(page.getByTestId('ejecutivo-total')).toHaveText(/\d/, { timeout: 60_000 }),
  },
];

test.describe('CSP del panel', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  for (const pantalla of PANTALLAS_PANEL) {
    test(`${pantalla.nombre}: sin violaciones de la CSP, también con el sondeo`, async ({
      page,
    }) => {
      const csp = await vigilarCsp(page);
      const red = vigilarRed(page);
      // El sondeo de 10 s se salta con el reloj de Playwright en vez de esperarlo.
      await page.clock.install();
      await sesionDelPanelEnElNavegador(page, pantalla.credenciales);
      const ruta = await pantalla.ruta(page);

      const respuesta = await page.goto(`${PANEL}${ruta}`);
      comprobarCspConNonce(respuesta?.headers()['content-security-policy'], pantalla.nombre);
      await pantalla.lista(page);

      const sondeo = page.waitForRequest(
        (r) => pantalla.consulta(new URL(r.url()).pathname) && r.headers()[CABECERA_SONDEO] === '1',
      );
      await page.clock.fastForward(INTERVALO_SONDEO_MS + 1_000);
      await sondeo;
      await pantalla.lista(page);
      await esperarRedQuieta(red, () => true, { plazoMs: 60_000 });

      comprobarSinViolacionesCsp(csp, pantalla.nombre);
    });
  }
});

// ------------------------------------------------------------------ app pública

test.describe('CSP de la app pública', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('el mapa dibuja sus puntos (el worker de MapLibre cargó) sin violaciones', async ({
    page,
  }) => {
    const csp = await vigilarCsp(page);
    const red = vigilarRed(page);
    const respuesta = await page.goto('/');
    comprobarCspConNonce(respuesta?.headers()['content-security-policy'], 'el mapa');

    await esperarPuntosEnElMapa(page);
    await esperarRedQuieta(red, () => true, { plazoMs: 60_000 });
    comprobarSinViolacionesCsp(csp, 'el mapa');
  });

  test.describe('reportar', () => {
    // Reportar exige la ubicación, y la foto sale de la cámara simulada de Chromium.
    test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['camera', 'geolocation'] });

    test('el formulario con la cámara, el envío y Mis reportes, sin violaciones', async ({
      page,
    }) => {
      await cuentaNuevaEnElNavegador(page, 'csp-');
      const csp = await vigilarCsp(page);

      const documento = page.waitForResponse(
        (r) => r.request().isNavigationRequest() && new URL(r.url()).pathname === '/reportar',
      );
      await abrirFormulario(page);
      comprobarCspConNonce((await documento).headers()['content-security-policy'], 'el formulario');
      await compartirUbicacion(page);
      comprobarSinViolacionesCsp(csp, 'el paso 1, con su mapa');

      await llegarAFotos(page);
      const subida = page.waitForResponse(esPost('/api/v1/fotos'));
      await sacarFotoConLaCamara(page);
      const foto = await subida;
      expect(foto.status(), await foto.text()).toBe(201);
      // La miniatura sale de la foto recién sacada: si la CSP no admitiera su origen, no se vería.
      const miniatura = page.getByRole('img', { name: 'Foto que sacaste' });
      await expect(miniatura).toHaveCount(1);
      await expect
        .poll(() => miniatura.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), {
          message: 'la miniatura de la foto se ve',
        })
        .toBe(true);
      comprobarSinViolacionesCsp(csp, 'la cámara y la miniatura');

      await page
        .locator('textarea[name="descripcion"]')
        .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. csp-${Date.now()}`);
      await continuar(page);
      const envio = page.waitForResponse(esPost('/api/v1/reportes'));
      await page.getByTestId('boton-enviar').click();
      const enviado = await envio;
      expect(enviado.status(), await enviado.text()).toBe(201);
      comprobarSinViolacionesCsp(csp, 'el envío');

      const red = vigilarRed(page);
      await page.goto('/mis-reportes');
      await expect(page.getByRole('heading', { level: 1, name: 'Mis reportes' })).toBeVisible();
      await esperarRedQuieta(red, () => true, { plazoMs: 60_000 });
      comprobarSinViolacionesCsp(csp, 'Mis reportes');
    });
  });
});
