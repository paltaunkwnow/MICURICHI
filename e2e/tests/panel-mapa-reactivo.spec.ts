import { expect, type Locator, type Page, test } from '@playwright/test';
import { CREDENCIALES_TECNICO, esperarPila, PANEL, sesionDelPanelEnElNavegador } from './ayudas';

/**
 * Mapa reactivo de la bandeja técnica (/reportes del PANEL; el mapa de la app pública lo cubre
 * `mapa-seleccion.spec.ts`). Tras el arreglo del 2026-10-03 (punto 4):
 *
 * - Tocar una zona filtra la bandeja por su unidad vecinal, con el id REAL (`unidad_vecinal:…`) que
 *   sale de `properties.id`, no el índice `0, 1, 2…` que MapLibre inventa y que dejaba la tabla
 *   siempre vacía (defecto descrito en `lib/mapa-seleccion.ts`).
 * - El interruptor «Filtrar por el área del mapa» pone el bbox en la URL al mover, y apagado no.
 * - Un solo manejador de clic: tocar un punto abre su tarjeta con «Ver detalle» y resalta su fila,
 *   sin cambiar el filtro de la zona de abajo.
 *
 * Los puntos del seed son escasos y repartidos por toda la ciudad (24 en UV distintas), así que casi
 * cualquier lugar del mapa es zona vacía: tocar el centro resuelve la UV del centro, que es la que el
 * chip «Mirando» ya nombró.
 */

interface FeatureTecnico {
  properties: { id: string; unidad_vecinal: { id: string } | null };
}

const CANVAS = 'canvas.maplibregl-canvas';

async function entrarEnReportes(page: Page, ruta = '/reportes'): Promise<void> {
  await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
  await page.goto(`${PANEL}${ruta}`);
  await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible({
    timeout: 60_000,
  });
}

/** El bbox que la bandeja tiene puesto en la URL (null si no filtra por el área del mapa). */
function bboxActual(page: Page): string | null {
  return new URL(page.url()).searchParams.get('bbox');
}

async function centroDelMapa(canvas: Locator): Promise<{ x: number; y: number }> {
  const caja = await canvas.boundingBox();
  if (!caja) throw new Error('el mapa no tiene caja: no cargó');
  return { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 };
}

test.describe('bandeja técnica · mapa reactivo', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('tocar una zona filtra la bandeja por su unidad vecinal, con el id real', async ({
    page,
  }) => {
    await entrarEnReportes(page);
    const canvas = page.locator(CANVAS);
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    // El chip «Mirando: … UV …» confirma que las capas pintaron y que el centro cae en una UV.
    await expect(page.getByTestId('chip-mirando')).toContainText('UV', { timeout: 60_000 });

    const { x, y } = await centroDelMapa(canvas);
    // El centro es zona vacía casi siempre; si un clic cae sobre un punto no cambia el filtro de
    // zona, así que se prueba en puntos cercanos hasta que la URL trae una unidad vecinal.
    const alrededores: Array<[number, number]> = [
      [0, 0],
      [0, -70],
      [70, 0],
      [0, 70],
      [-70, 0],
      [90, 90],
    ];
    await expect(async () => {
      for (const [dx, dy] of alrededores) {
        await page.mouse.click(x + dx, y + dy);
        const uv = new URL(page.url()).searchParams.get('unidad_vecinal_id');
        if (uv?.startsWith('unidad_vecinal:')) return;
      }
      throw new Error('ningún clic resolvió una unidad vecinal todavía');
    }).toPass({ timeout: 30_000 });

    const uvId = new URL(page.url()).searchParams.get('unidad_vecinal_id') ?? '';
    expect(uvId, 'el filtro lleva el id real de la UV, no el índice del mapa').toMatch(
      /^unidad_vecinal:/,
    );

    // La tabla refleja esa UV contra la vista técnica: con reportes no queda vacía (la regresión que
    // se guarda es justo la tabla siempre vacía por filtrar con un id inventado).
    const r = await page.request.get(
      `${PANEL}/api/v1/tecnico/reportes?unidad_vecinal_id=${encodeURIComponent(uvId)}&limite=1`,
    );
    expect(r.status()).toBe(200);
    const total = (await r.json()).total as number;
    if (total > 0) {
      await expect(page.getByText('No hay reportes', { exact: false })).toHaveCount(0);
      await expect(page.getByTestId('fila-reporte').first()).toBeVisible({ timeout: 30_000 });
    } else {
      await expect(page.getByText('No hay reportes con estos filtros')).toBeVisible();
    }
  });

  test('«Filtrar por el área del mapa» pone el bbox en la URL al mover, y apagado no', async ({
    page,
  }) => {
    await entrarEnReportes(page);
    const canvas = page.locator(CANVAS);
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    const interruptor = page.getByTestId('seguir-mapa');
    await expect(interruptor).toBeChecked();

    // Encendido, al quedarse quieto el mapa escribe su bbox (la primera vez, en la carga).
    await expect.poll(() => bboxActual(page), { timeout: 60_000 }).not.toBeNull();
    const bboxInicial = bboxActual(page);

    // Mover (acercar) cambia el bbox.
    await page.getByRole('button', { name: 'Acercar el mapa' }).click();
    await expect.poll(() => bboxActual(page), { timeout: 30_000 }).not.toBe(bboxInicial);

    // Apagar el interruptor quita el bbox del filtro en el acto.
    await interruptor.uncheck();
    await expect.poll(() => bboxActual(page), { timeout: 30_000 }).toBeNull();

    // Apagado, mover el mapa NO vuelve a poner el bbox.
    await page.getByRole('button', { name: 'Alejar el mapa' }).click();
    await page.waitForTimeout(1_500);
    expect(bboxActual(page), 'apagado, moverse no filtra por el área').toBeNull();

    // Volver a encenderlo recupera el bbox.
    await interruptor.check();
    await expect.poll(() => bboxActual(page), { timeout: 30_000 }).not.toBeNull();
  });

  test('tocar un punto abre su tarjeta «Ver detalle» y resalta su fila', async ({ page }) => {
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);

    // Una UV con un único reporte publicado: así el mapa, al encuadrar a sus puntos, deja ese punto
    // en el centro del lienzo y se puede tocar sin adivinar píxeles. La UV del centro de la ciudad
    // acumula los reportes que crean otras pruebas, así que nunca tiene exactamente uno y no se elige.
    const lista = await page.request.get(`${PANEL}/api/v1/tecnico/reportes?limite=500`);
    expect(lista.status()).toBe(200);
    const features = ((await lista.json()).features ?? []) as FeatureTecnico[];
    const porUv = new Map<string, FeatureTecnico[]>();
    for (const f of features) {
      const uv = f.properties.unidad_vecinal?.id;
      if (!uv) continue;
      const grupo = porUv.get(uv) ?? [];
      grupo.push(f);
      porUv.set(uv, grupo);
    }
    const unica = [...porUv.entries()].find(([, fs]) => fs.length === 1);
    expect(unica, 'el seed deja UV con un solo reporte para tocar un punto suelto').toBeTruthy();
    if (!unica) return;
    const uvId = unica[0];
    const idReporte = unica[1][0]?.properties.id ?? '';
    expect(idReporte).toMatch(/^[0-9a-f-]{36}$/);

    await page.goto(`${PANEL}/reportes?unidad_vecinal_id=${encodeURIComponent(uvId)}`);
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible({
      timeout: 60_000,
    });
    const canvas = page.locator(CANVAS);
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    // La fila del reporte ya está en la tabla: confirma que la UV y su punto cargaron.
    const fila = page.locator(`[data-testid="fila-reporte"][data-id="${idReporte}"]`);
    await expect(fila).toBeVisible({ timeout: 30_000 });

    // Apagar «seguir» encuadra el mapa a los puntos de la UV (uno): queda en el centro del lienzo.
    await page.getByTestId('seguir-mapa').uncheck();
    await page.waitForTimeout(1_500);

    const { x, y } = await centroDelMapa(canvas);
    await page.mouse.click(x, y);

    // Tocar el punto abre la tarjeta con «Ver detalle» (no navega sola) y resalta la fila.
    const tarjeta = page.getByTestId('popup-punto');
    await expect(tarjeta).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('popup-ver-detalle')).toHaveAttribute(
      'href',
      `/reportes/${idReporte}`,
    );
    await expect(fila).toHaveClass(/\bon\b/);
    // No cambió el filtro de la zona de abajo: sigue la misma UV, no se eligió otra.
    expect(new URL(page.url()).searchParams.get('unidad_vecinal_id')).toBe(uvId);
  });
});
