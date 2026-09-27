import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_TECNICO,
  cuentaNuevaConSesion,
  esperarPila,
  esperarPublicacion,
  esperarRedQuieta,
  GEO,
  loginTecnico,
  PANEL,
  reporteValido,
  vigilarRed,
} from './ayudas';

/**
 * Corrida `2026-09-25-quitar-campos-del-reporte`, criterios del panel técnico (CA-P1, CA-P2, CA-P4).
 *
 * El reporte dejó de tener manzana, dirección aproximada, duración y afectación, y la severidad
 * pasó a la v2 (`puntaje = 2·P + F`, sobre 12). El detalle del panel no debe mostrar esos cuatro
 * datos, pero sí conserva «En el mapa público se ve» (decisión del usuario). El mapa del panel deja
 * de dibujar las manzanas aunque la capa se siga sirviendo.
 */

/** Crea un reporte `nuevo` con P = muslo y F = permanente (10 de 12 puntos en la v2). */
async function crearReporteMusloPermanente(request: APIRequestContext, marca: string) {
  await cuentaNuevaConSesion(request, 'panel-');
  const r = await request.post(`${API}/api/v1/reportes`, {
    data: { ...reporteValido(marca), profundidad_estimada: 'muslo', frecuencia: 'permanente' },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).id as string;
}

async function entrarAlPanel(page: Page) {
  await page.goto(`${PANEL}/login`);
  await page.locator('#email').fill(CREDENCIALES_TECNICO.email);
  await page.locator('#password').fill(CREDENCIALES_TECNICO.password);
  await page.getByTestId('boton-login').click();
  await expect(page).toHaveURL(/\/reportes/);
}

test.describe('panel técnico sin manzana, dirección, duración ni afectación', () => {
  const marca = `E2E-QC-${Date.now()}`;
  let idReporte = '';

  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
    idReporte = await crearReporteMusloPermanente(request, marca);
    // Mientras espera su publicación, ni el técnico lo ve: el detalle del panel daría 404.
    await loginTecnico(request);
    await esperarPublicacion(request, idReporte);
  });

  test('CA-P1: el detalle no muestra los cuatro datos y conserva «En el mapa público se ve»', async ({
    page,
  }) => {
    await entrarAlPanel(page);
    await page.goto(`${PANEL}/reportes/${idReporte}`);
    await expect(page.getByTestId('estado-actual')).toBeVisible({ timeout: 60_000 });

    // Las etiquetas de los `<Dato>` del detalle (bloques «Ubicación» y «Evento reportado»).
    const etiquetas = (await page.locator('dl.lista-datos > dt').allTextContents()).map((t) =>
      t.trim(),
    );
    for (const quitada of ['Manzana', 'Dirección aproximada', 'Duración estimada', 'Afectación']) {
      expect(etiquetas, `el detalle no debe mostrar «${quitada}»`).not.toContain(quitada);
    }
    for (const sigue of [
      'Distrito',
      'Unidad vecinal',
      'Profundidad estimada',
      'Frecuencia',
      'En el mapa público se ve',
    ]) {
      expect(etiquetas, `el detalle debe seguir mostrando «${sigue}»`).toContain(sigue);
    }

    // «En el mapa público se ve» no solo sigue: sigue diciendo lo correcto para una vía pública.
    const publico = page
      .locator('dl.lista-datos > dt', { hasText: 'En el mapa público se ve' })
      .locator('xpath=following-sibling::dd[1]');
    await expect(publico).toHaveText('En su sitio, redondeado a 5 decimales');
  });

  test('CA-P2: el desglose de la severidad v2 tiene dos filas, 10 de 12 puntos y la fórmula nueva', async ({
    page,
  }) => {
    await entrarAlPanel(page);
    await page.goto(`${PANEL}/reportes/${idReporte}`);

    const titulo = page.getByRole('heading', { name: /^Cómo se llegó a/ });
    await expect(titulo).toHaveText('Cómo se llegó a 10 de 12 puntos', { timeout: 60_000 });
    const desglose = titulo.locator('xpath=..');
    const filas = desglose.locator('dl > div > dt');
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toHaveText(/^Profundidad\s*×2$/);
    await expect(filas.nth(1)).toHaveText('Frecuencia');
    await expect(desglose).toContainText('puntaje = 2 × profundidad + frecuencia');
    await expect(desglose).not.toContainText(/duración|afectación/i);
  });

  test('CA-P4: el mapa del panel a zoom 16 no pide la capa de manzanas y sí distritos y UV', async ({
    page,
    request,
  }) => {
    // Dado: la capa manzana se sigue listando (y sirviendo); solo deja de dibujarse.
    const capas = (await (await request.get(`${GEO}/geo/v1/capas`)).json()) as Array<{
      capa: string;
      url: string;
    }>;
    const prefijo = (capa: string) => {
      const c = capas.find((x) => x.capa === capa);
      expect(c, `GET /geo/v1/capas debe seguir listando «${capa}»`).toBeTruthy();
      return (c as { url: string }).url.split('{')[0] as string;
    };
    const manzana = prefijo('manzana');
    const distrito = prefijo('distrito_municipal');
    const uv = prefijo('unidad_vecinal');

    await entrarAlPanel(page);
    // Vigilar la red recién ACÁ (no antes de entrar al panel) para no arrastrar el ruido de la
    // bandeja (`/reportes`), que dibuja su propio mapa y pide las mismas capas.
    const red = vigilarRed(page);
    const pedidas = () => red.pedidas.map((u) => new URL(u).pathname);

    // El detalle abre el mapa en zoom 16 sobre el reporte: por encima del umbral de 15.
    await page.goto(`${PANEL}/reportes/${idReporte}`);
    await expect(
      page.getByRole('region', { name: 'Mapa con la ubicación exacta del reporte' }),
    ).toBeVisible({ timeout: 60_000 });

    await expect
      .poll(() => pedidas().some((p) => p.startsWith(distrito)), {
        message: 'el mapa debe seguir dibujando los distritos',
        timeout: 30_000,
      })
      .toBe(true);
    await expect
      .poll(() => pedidas().some((p) => p.startsWith(uv)), {
        message: 'el mapa debe seguir dibujando las unidades vecinales',
        timeout: 30_000,
      })
      .toBe(true);
    // Las fuentes se añaden en la misma pasada: la de manzanas, si la hubiera, saldría en la
    // misma tanda que las de UV. En vez de un margen fijo, se espera a que la red de geo-service
    // se quede quieta (todo lo pedido volvió y no sale nada nuevo).
    await esperarRedQuieta(red, (u) => new URL(u).pathname.startsWith('/geo/v1/'));

    const deManzana = pedidas().filter(
      (p) => p.startsWith(manzana) || p.includes('/geo/v1/teselas/manzana/'),
    );
    expect(deManzana, 'el panel no debe pedir teselas ni GeoJSON de manzanas').toEqual([]);
  });
});
