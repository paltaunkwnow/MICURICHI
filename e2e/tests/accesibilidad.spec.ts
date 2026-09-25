import { expect, type Page, test } from '@playwright/test';
import { CREDENCIALES_TECNICO, esperarPila, PANEL } from './ayudas';

/**
 * Comprobaciones de accesibilidad sin dependencias extra (WCAG 2.2 AA, CLAUDE.md §14.1).
 * No reemplazan una auditoría completa: cubren lo que más se rompe al iterar.
 */
async function revisar(page: Page, url: string, opciones: { conSalto?: boolean } = {}) {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('h1').first()).toBeVisible();

  const imagenesSinAlt = await page.locator('img:not([alt])').count();
  expect(imagenesSinAlt, `hay imágenes sin alt en ${url}`).toBe(0);

  const camposSinNombre = await page.evaluate(() => {
    const campos = Array.from(document.querySelectorAll('input, textarea, select'));
    return campos
      .filter((c) => {
        const el = c as HTMLInputElement;
        if (el.type === 'hidden' || el.getAttribute('aria-hidden') === 'true') return false;
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
        if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        if (el.closest('label')) return false;
        return true;
      })
      .map((c) => (c as HTMLElement).outerHTML.slice(0, 80));
  });
  expect(camposSinNombre, `campos sin etiqueta en ${url}`).toEqual([]);

  const botonesSinNombre = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter(
        (b) => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'),
      )
      .map((b) => b.outerHTML.slice(0, 80)),
  );
  expect(botonesSinNombre, `botones sin nombre accesible en ${url}`).toEqual([]);

  if (opciones.conSalto) {
    await expect(page.getByRole('link', { name: 'Ir al contenido' })).toBeAttached();
  }
}

test.describe('accesibilidad básica', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('app pública: mapa, formulario y cómo funciona', async ({ page }) => {
    await revisar(page, '/', { conSalto: true });
    await revisar(page, '/reportar', { conSalto: true });
    await revisar(page, '/como-funciona', { conSalto: true });
  });

  test('app pública: portada y mis reportes', async ({ page }) => {
    await revisar(page, '/inicio', { conSalto: true });
    await revisar(page, '/mis-reportes', { conSalto: true });
  });

  test('panel técnico: inicio de sesión', async ({ page }) => {
    await revisar(page, `${PANEL}/login`);
  });

  test('panel técnico: las pantallas de trabajo, ya con sesión', async ({ page }) => {
    // Hasta ahora solo se revisaba el login, que es la única pantalla del panel que se ve sin
    // entrar. Las cuatro de dentro son donde el técnico pasa el día, y son las que crecieron al
    // llegar las capas reales: el desplegable de unidades vecinales pasó de 12 opciones a 576.
    await page.goto(`${PANEL}/login`);
    await page.locator('#email').fill(CREDENCIALES_TECNICO.email);
    await page.locator('#password').fill(CREDENCIALES_TECNICO.password);
    await page.getByTestId('boton-login').click();
    await expect(page).toHaveURL(/\/reportes/);

    for (const ruta of ['/reportes', '/indicadores', '/capas', '/plano']) {
      await revisar(page, `${PANEL}${ruta}`);
    }
  });

  test('el foco se ve al recorrer con el teclado', async ({ page }) => {
    // WCAG 2.4.7: un foco invisible deja el teclado inutilizable aunque el orden sea correcto.
    // Se comprueba que el navegador dibuja algo distinto en el elemento enfocado, sin fijar
    // cómo: el diseño usa `outline` y `box-shadow` según el control.
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Ir al contenido' })).toBeAttached();

    const visibles: string[] = [];
    const invisibles: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const marca = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // Se mira el elemento y sus dos contenedores: marcar el foco en el envoltorio es un
        // patrón legítimo y el que usa el diseño para los controles compuestos (la pastilla del
        // buscador, las tarjetas de opción). Comprobar solo el elemento daría falsos fallos.
        const marcado = (n: HTMLElement | null) => {
          if (!n) return false;
          const e = getComputedStyle(n);
          return (
            (e.outlineStyle !== 'none' && Number.parseFloat(e.outlineWidth) > 0) ||
            (e.boxShadow !== 'none' && e.boxShadow !== '')
          );
        };
        const hayAnillo =
          marcado(el) ||
          marcado(el.parentElement) ||
          marcado(el.parentElement?.parentElement ?? null);
        return { etiqueta: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60), hayAnillo };
      });
      if (!marca) continue;
      (marca.hayAnillo ? visibles : invisibles).push(marca.etiqueta);
    }
    expect(visibles.length, 'el tabulador no llegó a ningún control').toBeGreaterThan(3);
    expect(invisibles, 'controles que reciben el foco sin marcarlo').toEqual([]);
  });
});
