import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import {
  esperarPila,
  esperarPuntosEnElMapa,
  esperarRedQuieta,
  GEO,
  PUBLICA,
  PUNTO_CENTRO,
  simularPestana,
  tesela,
  vigilarRed,
} from './ayudas';

/**
 * La página pública no hace tráfico automático (plan 2026-09-26, tanda T6, paso S33).
 *
 * Con muchos vecinos mirando el mapa a la vez, cada refresco automático se multiplica por todas
 * las pestañas abiertas. Los datos se piden al abrir la pantalla o al mover el mapa, nunca porque
 * pasó un rato, la pestaña recuperó el foco o volvió la red. Y lo que no cambia (capas y teselas)
 * va con la huella del contenido en la URL, cacheado un año como `immutable`.
 *
 * Los 3 minutos no se esperan de verdad: el reloj de la página es el de Playwright (`page.clock`),
 * que corre como el real y se adelanta de a 10 s. Cada salto dispara, una vez, los temporizadores
 * vencidos, así que un `refetchInterval` de cualquier período, un `setInterval` propio o un
 * `staleTime` vencido antes de un cambio de foco saldrían en la red.
 */

const DURACION_S = 180;
const PASO_S = 10;

const esReportes = (u: string) => new URL(u).pathname.startsWith('/api/v1/reportes');
const esAgregados = (u: string) => new URL(u).pathname.startsWith('/geo/v1/agregados');
const esVigilada = (u: string) => esReportes(u) || esAgregados(u);

/** La persona se va a otra pestaña y vuelve: la real pasa adelante y la página lo oye. */
async function irseAOtraPestana(page: Page, otra: Page) {
  await otra.bringToFront();
  await simularPestana(page, 'oculta');
}

async function volverALaPestana(page: Page) {
  await page.bringToFront();
  await simularPestana(page, 'visible');
}

/** Se corta la red y vuelve: el navegador dispara `offline` y `online`. */
async function cortarYVolverLaRed(contexto: BrowserContext) {
  await contexto.setOffline(true);
  await contexto.setOffline(false);
}

test.describe('la página pública no hace tráfico automático', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('abierta 3 minutos, con cambios de foco y de red, no vuelve a pedir reportes ni agregados', async ({
    page,
    context,
  }) => {
    // Todo el contexto: también lo que pidiera el service worker por su cuenta.
    const red = vigilarRed(page, { todoElContexto: true });
    await page.clock.install();
    await page.goto('/');
    await esperarPuntosEnElMapa(page);
    // La carga inicial (el listado, el de la vista del mapa y los agregados) ya terminó.
    await esperarRedQuieta(red, esVigilada, { quietudMs: 3_000 });

    const alAbrir = red.pedidas.length;
    const inicial = red.pedidas.filter(esVigilada);
    // Si la carga inicial no los pidiera, los filtros no estarían mirando nada.
    expect(inicial.filter(esReportes).length, 'al abrir se piden los reportes').toBeGreaterThan(0);
    expect(inicial.filter(esAgregados).length, 'al abrir se piden los agregados').toBeGreaterThan(
      0,
    );

    const otra = await context.newPage();
    await page.bringToFront();
    for (let s = PASO_S; s <= DURACION_S; s += PASO_S) {
      // Cada 30 s la persona pasa 10 s en otra pestaña y vuelve, con los datos cada vez más viejos.
      const afuera = s % 30 === 0;
      if (afuera) await irseAOtraPestana(page, otra);
      await page.clock.fastForward(PASO_S * 1000);
      if (afuera) await volverALaPestana(page);
      if (s === 90) await cortarYVolverLaRed(context);
    }
    await esperarRedQuieta(red, esVigilada, { quietudMs: 3_000 });

    expect(
      red.pedidas.slice(alAbrir).filter(esVigilada),
      '3 minutos abierta, con cambios de foco y de red: ni reportes ni agregados',
    ).toEqual([]);
    // Y la página sigue mostrando lo que ya tenía.
    await esperarPuntosEnElMapa(page);
  });

  test('una tesela con huella se sirve immutable por un año, por la app y directo', async ({
    request,
  }) => {
    const r = await request.get(`${PUBLICA}/geo/v1/capas`);
    expect(r.status(), await r.text()).toBe(200);
    const capas = (await r.json()) as Array<{ capa: string; url: string }>;
    const uv = capas.find((c) => c.capa === 'unidad_vecinal');
    expect(uv, 'la capa de unidades vecinales tiene versión vigente').toBeDefined();

    // La huella viaja en `CapaInfo.url` (contracts 0.12.0), sea el GeoJSON o las teselas.
    const url = uv?.url ?? '';
    const huella = /\/geo\/v1\/(?:capas\/[a-z_]+\/v|teselas\/[a-z_]+)\/([^/]+)/.exec(url)?.[1];
    expect(huella, `CapaInfo.url con la huella: ${url}`).toMatch(/^[0-9a-f]{16}$/);

    const { x, y, z } = tesela(PUNTO_CENTRO.lat, PUNTO_CENTRO.lon, 14);
    const ruta = `/geo/v1/teselas/unidad_vecinal/${huella}/${z}/${x}/${y}.mvt`;
    for (const origen of [PUBLICA, GEO]) {
      const t = await request.get(`${origen}${ruta}`);
      // En el centro de la ciudad la tesela tiene unidades vecinales; vacía sería un 204.
      expect(t.status(), `${origen}${ruta}`).toBe(200);
      const cache = t.headers()['cache-control'] ?? '';
      expect(cache, `${origen}: cacheable por cualquiera`).toContain('public');
      expect(cache, `${origen}: por un año`).toContain('max-age=31536000');
      expect(cache, `${origen}: sin volver a preguntar`).toContain('immutable');
    }
  });
});
