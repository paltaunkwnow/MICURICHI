import { expect, type Page, test } from '@playwright/test';
import { CREDENCIALES_TECNICO, esperarPila, PANEL, sesionDelPanelEnElNavegador } from './ayudas';

/**
 * Indicadores con tortas (donas) reactivas (plan 2026-10-03, punto 3). Las barras de «proporción»
 * confusas se reemplazaron por dos donas claras —por distrito y por unidad vecinal— con filtro de
 * severidad, y clics que reaccionan: tocar un distrito acota la torta de UV y tocar una UV abre la
 * bandeja ya filtrada. El estado vive en la URL (`?severidad=…&distrito=…`).
 *
 * Nada se escribe a mano: las severidades que tienen datos y los ids de distrito/UV salen de lo que
 * api-core publique al correr. La pantalla se compara con la última respuesta de /api/v1/indicadores
 * que recibió ELLA (se refresca sola cada 10 s), no con una lectura aparte, para no cruzarse con los
 * reportes que publican otras pruebas del grupo.
 */

interface RespuestaIndicadores {
  total: number;
  por_severidad: Record<string, number>;
  por_distrito: Array<{ distrito_id: string; nombre: string | null; n: number }>;
  por_unidad_vecinal: Array<{
    unidad_vecinal_id: string;
    nombre: string | null;
    distrito_id: string | null;
    n: number;
  }>;
}

/** Clave con que se guarda cada respuesta: los dos filtros de query, `severidad|distrito_id`. */
function claveDe(url: URL): string {
  return `${url.searchParams.get('severidad') ?? ''}|${url.searchParams.get('distrito_id') ?? ''}`;
}

/** Guarda la última respuesta de /api/v1/indicadores que recibió la página, por sus filtros. */
function capturarIndicadores(page: Page): Map<string, RespuestaIndicadores> {
  const porClave = new Map<string, RespuestaIndicadores>();
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (url.pathname !== '/api/v1/indicadores' || res.status() !== 200) return;
    const cuerpo = (await res.json().catch(() => null)) as RespuestaIndicadores | null;
    if (cuerpo) porClave.set(claveDe(url), cuerpo);
  });
  return porClave;
}

/** Suma de reportes de `por_distrito`: lo que la torta de distritos dibuja en el centro. */
function sumaDistrito(r: RespuestaIndicadores): number {
  return r.por_distrito.reduce((s, x) => s + x.n, 0);
}

/** Número grande del centro de una dona; 0 si está en su estado vacío. */
async function totalEnElCentro(page: Page, testId: string): Promise<number> {
  if (
    await page
      .getByTestId(`${testId}-vacio`)
      .isVisible()
      .catch(() => false)
  )
    return 0;
  const texto = (await page.getByTestId(testId).locator('svg text').first().textContent()) ?? '';
  return Number(texto.replace(/\D/g, ''));
}

/** Botón de una severidad en el filtro (ficha nativa con color + texto + barritas). */
function fichaSeveridad(page: Page, etiqueta: string) {
  return page
    .getByTestId('indicadores-filtro-severidad')
    .getByRole('button', { name: etiqueta, exact: true });
}

const ETIQUETA_SEVERIDAD = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
} as const;

async function abrirIndicadores(page: Page): Promise<void> {
  await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
  await page.goto(`${PANEL}/indicadores`);
  await expect(page.getByRole('heading', { name: 'Indicadores', level: 1 })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('indicadores · tortas reactivas', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('dibuja dos tortas y «Crítica» cambia los totales', async ({ page }) => {
    const indicadores = capturarIndicadores(page);
    await abrirIndicadores(page);

    await expect(page.getByTestId('torta-distrito')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('torta-uv')).toBeVisible();

    // Sin filtro, el centro de la torta de distritos muestra la suma de la respuesta que recibió.
    await expect(async () => {
      const sin = indicadores.get('|');
      expect(sin, 'la página tiene que haber pedido /indicadores sin filtro').toBeTruthy();
      if (sin) expect(await totalEnElCentro(page, 'torta-distrito')).toBe(sumaDistrito(sin));
    }).toPass({ timeout: 30_000 });
    const totalTodos = indicadores.get('|')?.total ?? 0;

    // Clic en «Crítica»: la ficha queda marcada, la URL lleva la severidad y sale una petición con ella.
    const critica = fichaSeveridad(page, 'Crítica');
    await critica.click();
    await expect(critica).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('severidad')).toBe('critica');
    await expect.poll(() => indicadores.get('critica|') ?? null).not.toBeNull();

    const soloCriticos = indicadores.get('critica|');
    expect(soloCriticos).toBeTruthy();
    if (!soloCriticos) return;
    // El centro baja a los críticos (un subconjunto del total) y sigue cuadrando con los datos.
    await expect(async () => {
      expect(await totalEnElCentro(page, 'torta-distrito')).toBe(sumaDistrito(soloCriticos));
    }).toPass({ timeout: 30_000 });
    expect(soloCriticos.total, 'los críticos no pueden superar al total').toBeLessThanOrEqual(
      totalTodos,
    );
  });

  test('tocar un distrito acota la torta de unidades vecinales a ese distrito', async ({
    page,
  }) => {
    const indicadores = capturarIndicadores(page);
    await abrirIndicadores(page);

    const uv = page.getByTestId('torta-uv');
    await expect(uv).toBeVisible({ timeout: 60_000 });
    await expect(uv.locator('figcaption')).toContainText('En toda la ciudad');

    // La primera fila de la leyenda de distritos es el mayor, un distrito real (nunca «Otros»).
    const fila = page.getByTestId('torta-distrito-leyenda').locator('tbody tr').first();
    const boton = fila.getByRole('button');
    await expect(boton).toBeVisible();
    const idDistrito = await fila.getAttribute('data-id');
    expect(idDistrito, 'la fila trae el id del distrito en data-id').toMatch(
      /^distrito_municipal:/,
    );
    if (!idDistrito) return;

    await boton.click();
    await expect(boton).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('distrito')).toBe(idDistrito);

    // Sale una segunda consulta acotada al distrito y la torta de UV deja de ser la de toda la ciudad.
    await expect.poll(() => indicadores.get(`|${idDistrito}`) ?? null).not.toBeNull();
    await expect(page.getByTestId('torta-uv-cargando')).toHaveCount(0, { timeout: 30_000 });
    await expect(uv).toBeVisible();
    await expect(uv.locator('figcaption')).not.toContainText('toda la ciudad');
    await expect(uv.locator('figcaption')).toContainText('En ');
  });

  test('tocar una unidad vecinal abre la bandeja filtrada por esa UV y la severidad', async ({
    page,
  }) => {
    const indicadores = capturarIndicadores(page);
    await abrirIndicadores(page);
    await expect(page.getByTestId('torta-uv')).toBeVisible({ timeout: 60_000 });

    // Una severidad que de verdad tenga reportes, tomada de la respuesta (no adivinada).
    await expect.poll(() => indicadores.get('|') ?? null).not.toBeNull();
    const base = indicadores.get('|');
    const sev = (['critica', 'alta', 'media', 'baja'] as const).find(
      (s) => (base?.por_severidad[s] ?? 0) > 0,
    );
    expect(sev, 'el seed tiene reportes de alguna severidad').toBeTruthy();
    if (!sev) return;

    await fichaSeveridad(page, ETIQUETA_SEVERIDAD[sev]).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('severidad')).toBe(sev);
    await expect.poll(() => indicadores.get(`${sev}|`) ?? null).not.toBeNull();

    // La primera fila con enlace es una UV real (la porción «Otras UV» no es un enlace).
    const enlace = page.getByTestId('torta-uv-leyenda').getByRole('link').first();
    await expect(enlace).toBeVisible();
    await enlace.click();

    await page.waitForURL(/\/reportes\?/, { timeout: 30_000 });
    const q = new URL(page.url()).searchParams;
    expect(q.get('unidad_vecinal_id')).toMatch(/^unidad_vecinal:/);
    expect(q.get('severidad')).toBe(sev);
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('cada leyenda reparte 100 % (±1)', async ({ page }) => {
    await abrirIndicadores(page);
    for (const testId of ['torta-distrito', 'torta-uv']) {
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 60_000 });
      const porcentajes = page
        .getByTestId(`${testId}-leyenda`)
        .locator('tbody td')
        .filter({ hasText: '%' });
      const n = await porcentajes.count();
      expect(n, `${testId}: la leyenda tiene que tener filas`).toBeGreaterThan(0);
      let suma = 0;
      for (let i = 0; i < n; i++) {
        const texto = (await porcentajes.nth(i).textContent()) ?? '';
        suma += Number(texto.replace(/\D/g, ''));
      }
      expect(suma, `${testId}: los porcentajes suman ~100`).toBeGreaterThanOrEqual(99);
      expect(suma, `${testId}: los porcentajes suman ~100`).toBeLessThanOrEqual(101);
    }
  });

  test('se opera con el teclado: el filtro y la leyenda, sin ratón', async ({ page }) => {
    await abrirIndicadores(page);

    // La ficha de severidad es un botón nativo: Enter la marca y la desmarca, y la URL lo refleja.
    const critica = fichaSeveridad(page, 'Crítica');
    await critica.focus();
    await expect(critica).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(critica).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('severidad')).toBe('critica');
    await critica.focus();
    await page.keyboard.press('Enter');
    await expect(critica).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => new URL(page.url()).searchParams.get('severidad')).toBeNull();

    // La leyenda de la torta de distritos también se activa con el teclado (su control es un botón).
    await expect(page.getByTestId('torta-distrito')).toBeVisible({ timeout: 60_000 });
    const botonDistrito = page
      .getByTestId('torta-distrito-leyenda')
      .locator('tbody tr')
      .first()
      .getByRole('button');
    await botonDistrito.focus();
    await expect(botonDistrito).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(botonDistrito).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('distrito'))
      .toMatch(/^distrito_municipal:/);
  });
});
