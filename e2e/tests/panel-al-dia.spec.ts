import { expect, type Page, type Request, test } from '@playwright/test';
import {
  CABECERA_SONDEO,
  CREDENCIALES_EJECUTIVO,
  CREDENCIALES_TECNICO,
  crearReportePorApi,
  esperarPila,
  esperarPublicacion,
  esperarRedQuieta,
  INTERVALO_SONDEO_MS,
  loginTecnico,
  PANEL,
  sesionDelPanelEnElNavegador,
  simularPestana,
  vigilarRed,
} from './ayudas';

/**
 * El panel al día sin recargar (plan 2026-09-26, tanda T5, paso S28).
 *
 * La bandeja, el detalle, los indicadores y el panel ejecutivo se refrescan solos cada 10 s y
 * api-core no guarda esas cifras en caché: un reporte recién publicado aparece sin que nadie
 * recargue. El refresco sale con `x-curichi-sondeo: 1`, que no renueva la inactividad de la
 * sesión; la primera carga de cada pantalla la pide la persona y va sin la cabecera. Con la pestaña
 * oculta no se pide nada, y al volver se refresca.
 *
 * Las dos primeras pruebas corren con el reloj real: miden lo que ve la persona. Las del sondeo
 * usan el reloj de Playwright (`page.clock`) para saltar los 10 s en vez de esperarlos.
 */

/** Desde que el reporte está publicado hasta que la pantalla lo muestra: un sondeo y margen. */
const PLAZO_AL_DIA_MS = 15_000;

interface Pantalla {
  nombre: string;
  credenciales: { email: string; password: string };
  /** Ruta del panel; el detalle necesita un id, que se busca con la sesión ya puesta. */
  ruta: (page: Page) => Promise<string>;
  /** La consulta que se refresca sola en esa pantalla, por su ruta en api-core. */
  consulta: (pathname: string) => boolean;
  /** La pantalla ya mostró sus datos. */
  lista: (page: Page) => Promise<void>;
}

const BANDEJA: Pantalla = {
  nombre: 'la bandeja',
  credenciales: CREDENCIALES_TECNICO,
  ruta: async () => '/reportes',
  consulta: (p) => p === '/api/v1/tecnico/reportes',
  lista: (page) =>
    expect(page.getByText(/reportes con los filtros actuales/)).toBeVisible({ timeout: 60_000 }),
};

const DETALLE: Pantalla = {
  nombre: 'el detalle',
  credenciales: CREDENCIALES_TECNICO,
  ruta: async (page) => {
    const r = await page.request.get(`${PANEL}/api/v1/tecnico/reportes?limite=1`);
    expect(r.status(), await r.text()).toBe(200);
    const id = (await r.json()).features?.[0]?.properties?.id as string | undefined;
    expect(id, 'hace falta al menos un reporte (`pnpm db:seed:samples`)').toBeTruthy();
    return `/reportes/${id}`;
  },
  consulta: (p) => p.startsWith('/api/v1/tecnico/reportes/'),
  lista: (page) => expect(page.getByTestId('estado-actual')).toBeVisible({ timeout: 60_000 }),
};

const INDICADORES: Pantalla = {
  nombre: 'los indicadores',
  credenciales: CREDENCIALES_TECNICO,
  ruta: async () => '/indicadores',
  consulta: (p) => p === '/api/v1/indicadores',
  lista: (page) =>
    expect(page.getByTestId('indicador-vigentes')).toHaveText(/\d/, { timeout: 60_000 }),
};

const EJECUTIVO: Pantalla = {
  nombre: 'el panel ejecutivo',
  credenciales: CREDENCIALES_EJECUTIVO,
  ruta: async () => '/ejecutivo',
  consulta: (p) => p === '/api/v1/ejecutivo/resumen',
  lista: (page) =>
    expect(page.getByTestId('ejecutivo-total')).toHaveText(/\d/, { timeout: 60_000 }),
};

function esDe(pantalla: Pantalla) {
  return (r: Request | string) =>
    pantalla.consulta(new URL(typeof r === 'string' ? r : r.url()).pathname);
}

/** Marca el documento para poder comprobar después que nadie recargó la página. */
async function marcarDocumento(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __sinRecargarE2E?: boolean }).__sinRecargarE2E = true;
  });
}

async function comprobarSinRecargar(page: Page) {
  expect(
    await page.evaluate(
      () => (window as unknown as { __sinRecargarE2E?: boolean }).__sinRecargarE2E,
    ),
    'la pantalla se actualizó sola: es el mismo documento, sin recargar',
  ).toBe(true);
}

/** «N verificadas · M en revisión» del panel ejecutivo → M. */
async function enRevision(page: Page): Promise<number | null> {
  const texto = (await page.getByTestId('ejecutivo-verificadas').textContent()) ?? '';
  const r = /(\d[\d.\s]*)\s+en revisión/.exec(texto);
  return r?.[1] ? Number(r[1].replace(/\D/g, '')) : null;
}

test.describe('panel al día sin recargar', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('la bandeja muestra un reporte recién publicado en 15 s o menos, sin recargar', async ({
    page,
    request,
  }) => {
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
    await page.goto(`${PANEL}/reportes`);
    await BANDEJA.lista(page);
    await marcarDocumento(page);

    const id = await crearReportePorApi(request, `E2E-AL-DIA-BANDEJA-${Date.now()}`);
    await loginTecnico(request);
    await esperarPublicacion(request, id);

    // La bandeja va por fecha de creación, de la más nueva: el reporte entra en la primera página.
    await expect(
      page.locator(`[data-testid="fila-reporte"][data-id="${id}"]`),
      'la bandeja lo muestra sola, con el sondeo de 10 s',
    ).toBeVisible({ timeout: PLAZO_AL_DIA_MS });
    await comprobarSinRecargar(page);
  });

  test('el panel ejecutivo sube «en revisión» en 15 s o menos, sin recargar', async ({
    page,
    request,
  }) => {
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_EJECUTIVO);
    await page.goto(`${PANEL}/ejecutivo`);
    await expect(page.getByTestId('ejecutivo-verificadas')).toHaveText(/en revisión/, {
      timeout: 60_000,
    });
    await marcarDocumento(page);
    const antes = await enRevision(page);
    expect(antes, '«N verificadas · M en revisión»').not.toBeNull();

    const id = await crearReportePorApi(request, `E2E-AL-DIA-EJECUTIVO-${Date.now()}`);
    await loginTecnico(request);
    await esperarPublicacion(request, id);

    await expect
      .poll(() => enRevision(page), {
        message: '«en revisión» sube sola con el reporte nuevo',
        timeout: PLAZO_AL_DIA_MS,
        intervals: [500],
      })
      .toBeGreaterThan(antes as number);
    await comprobarSinRecargar(page);
  });

  for (const pantalla of [BANDEJA, DETALLE, INDICADORES, EJECUTIVO]) {
    test(`${pantalla.nombre}: la primera carga va sin marca y el refresco de cada 10 s, marcado como sondeo`, async ({
      page,
    }) => {
      const esConsulta = esDe(pantalla);
      // Reloj de la página controlado: corre como el real y los 10 s se saltan en vez de esperarlos.
      await page.clock.install();
      await sesionDelPanelEnElNavegador(page, pantalla.credenciales);
      const ruta = await pantalla.ruta(page);
      const red = vigilarRed(page);

      const primera = page.waitForRequest(esConsulta);
      await page.goto(`${PANEL}${ruta}`);
      expect(
        await (await primera).headerValue(CABECERA_SONDEO),
        'la primera carga la pide la persona: renueva la sesión',
      ).toBeNull();
      await pantalla.lista(page);

      // Dos saltos seguidos: el refresco se repite cada 10 s, no es uno solo al rato de abrir.
      for (const [i, salto] of [INTERVALO_SONDEO_MS + 1_000, INTERVALO_SONDEO_MS].entries()) {
        // Lo anterior terminó (la bandeja pide tres listas a la vez): lo que llegue es de este salto.
        await esperarRedQuieta(red, esConsulta);
        const refresco = page.waitForRequest(esConsulta);
        await page.clock.fastForward(salto);
        expect(
          await (await refresco).headerValue(CABECERA_SONDEO),
          `refresco automático n.º ${i + 1}`,
        ).toBe('1');
      }
      await pantalla.lista(page);
    });
  }

  for (const pantalla of [BANDEJA, EJECUTIVO]) {
    test(`${pantalla.nombre}: con la pestaña oculta no pide nada y al volver refresca, como sondeo`, async ({
      page,
    }) => {
      const esConsulta = esDe(pantalla);
      await page.clock.install();
      await sesionDelPanelEnElNavegador(page, pantalla.credenciales);
      await page.goto(`${PANEL}${await pantalla.ruta(page)}`);
      await pantalla.lista(page);

      await simularPestana(page, 'oculta');
      // Se empieza a mirar con la pestaña ya oculta: lo que salió antes no cuenta.
      const red = vigilarRed(page);
      for (let i = 0; i < 3; i++) await page.clock.fastForward(INTERVALO_SONDEO_MS);
      await esperarRedQuieta(red, esConsulta);
      expect(red.pedidas.filter(esConsulta), '30 s con la pestaña oculta: ningún refresco').toEqual(
        [],
      );

      const vuelta = page.waitForRequest(esConsulta);
      await simularPestana(page, 'visible');
      expect(
        await (await vuelta).headerValue(CABECERA_SONDEO),
        'al volver a la pestaña refresca, marcado como sondeo',
      ).toBe('1');
      await pantalla.lista(page);
    });
  }
});
