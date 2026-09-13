import { expect, type Page, test } from '@playwright/test';
import { esperarPila, PANEL } from './ayudas';

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

  test('panel técnico: inicio de sesión', async ({ page }) => {
    await revisar(page, `${PANEL}/login`);
  });
});
