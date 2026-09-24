import { expect, test } from '@playwright/test';
import { esperarPila, PANEL } from './ayudas';

/**
 * Que ninguna pantalla se desborde a lo ancho.
 *
 * Un desbordamiento horizontal no rompe nada y por eso se cuela: la página sigue funcionando,
 * pero aparece una barra de desplazamiento lateral, el contenido se puede arrastrar fuera de
 * sitio y en un teléfono el pulgar la encuentra sola. Se mide con los tamaños concretos que hay
 * que soportar, empezando por 320 px, que es el ancho más chico que todavía se ve en la calle.
 */
const TAMANOS = [
  { nombre: 'móvil 320', width: 320, height: 640 },
  { nombre: 'móvil 390', width: 390, height: 844 },
  { nombre: 'móvil 412', width: 412, height: 915 },
  { nombre: 'escritorio 1280', width: 1280, height: 800 },
  { nombre: 'escritorio 1440', width: 1440, height: 900 },
  { nombre: 'escritorio 1920', width: 1920, height: 1080 },
];

const PANTALLAS_PUBLICAS = ['/', '/inicio', '/reportar', '/como-funciona', '/mis-reportes'];

test.describe('sin desbordamiento horizontal', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  for (const t of TAMANOS) {
    test(`app pública a ${t.nombre}`, async ({ page }) => {
      await page.setViewportSize({ width: t.width, height: t.height });
      for (const ruta of PANTALLAS_PUBLICAS) {
        await page.goto(ruta);
        // El mapa tarda en pintar y puede empujar el ancho al colocarse.
        await page.waitForTimeout(600);
        const medida = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          cliente: document.documentElement.clientWidth,
          culpables: Array.from(document.querySelectorAll('body *'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
            })
            .slice(0, 5)
            .map((el) =>
              `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`.slice(0, 70),
            ),
        }));
        expect(
          medida.scroll,
          `${ruta} se desborda a ${t.nombre}: ${medida.culpables.join(' | ')}`,
        ).toBeLessThanOrEqual(medida.cliente + 1);
      }
    });
  }

  test('panel técnico a 1280 y a 390', async ({ page }) => {
    for (const t of [TAMANOS[3], TAMANOS[1]] as Array<{ width: number; height: number }>) {
      await page.setViewportSize({ width: t.width, height: t.height });
      await page.goto(`${PANEL}/login`);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        cliente: document.documentElement.clientWidth,
      }));
      expect(m.scroll, `el login del panel se desborda a ${t.width} px`).toBeLessThanOrEqual(
        m.cliente + 1,
      );
    }
  });
});
