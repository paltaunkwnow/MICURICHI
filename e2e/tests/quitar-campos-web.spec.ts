import { expect, type Page, test } from '@playwright/test';
import {
  API,
  compartirUbicacion,
  crearCuentaYEntrarPorUi,
  esperarPila,
  esperarRedQuieta,
  GEO,
  GPS_EN_EL_CENTRO,
  numeroDePaso,
  pasoActual,
  vigilarRed,
} from './ayudas';

/**
 * Corrida SDD `2026-09-25-quitar-campos-del-reporte`, criterios CA-W1…CA-W8 de la app pública.
 *
 * El reporte deja de tener `manzana_id`, `direccion_aprox`, `duracion_estimada` y `afectacion`,
 * y la severidad pasa a la fórmula v2 (`puntaje = 2 × profundidad + frecuencia`, rango 3–12).
 *
 * El número de pasos del formulario todavía puede ser 4 o 5 (pregunta P-4 de la spec), así que
 * el recorrido no los enumera: en cada paso contesta lo que haya y sigue. Así la prueba describe
 * la spec y no una implementación concreta.
 */

const CAMPOS_QUITADOS = ['manzana_id', 'direccion_aprox', 'duracion_estimada', 'afectacion'];

// El recorrido reporta: el teléfono es el GPS simulado en PUNTO_CENTRO con 10 m de precisión, y el
// permiso de ubicación se da acá, no en toda la suite (reportar exige compartirla).
test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

interface PasoVisto {
  n: number;
  m: number;
  controles: number;
  camposViejos: string[];
  preguntaProfundidad: boolean;
  preguntaFrecuencia: boolean;
}

/**
 * Controles con los que el vecino contesta algo en este paso (sin el honeypot ni ocultos): un
 * input, un textarea, un select, el mapa (canvas, que carga diferido) o un botón propio del paso
 * (p. ej. «Compartir mi ubicación» en el paso 1).
 */
async function contarControles(page: Page): Promise<number> {
  return page
    .locator(
      '#contenido form input:not([type="hidden"]):not([name="sitio_web"]), #contenido form textarea, #contenido form select, #contenido form canvas, #contenido form button:not([data-testid="boton-siguiente"]):not([data-testid="boton-enviar"]):not([type="submit"])',
    )
    .count();
}

async function camposViejosEnPantalla(page: Page): Promise<string[]> {
  const presentes: string[] = [];
  for (const c of ['duracion_estimada', 'afectacion']) {
    if ((await page.locator(`input[name="${c}"]`).count()) > 0) presentes.push(c);
  }
  return presentes;
}

/**
 * Contesta lo que pida el paso en pantalla: la ubicación en el primero (se comparte y el punto
 * queda en la del teléfono), la descripción donde esté, y en cada grupo de radios sin elegir, una
 * opción. No sabe qué preguntas hay: si el formulario sigue pidiendo algo, lo contesta igual, para
 * que el envío llegue a producirse.
 */
async function contestarPaso(page: Page, n: number) {
  if (n === 1) {
    await compartirUbicacion(page);
    return;
  }
  const preferidos: Record<string, string> = {
    profundidad_estimada: 'rodilla',
    frecuencia: 'cada_lluvia_fuerte',
    ubicacion_tipo: 'via_publica',
  };
  const nombres = await page
    .locator('#contenido form input[type="radio"]')
    .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))]);
  for (const nombre of nombres) {
    const grupo = page.locator(`input[type="radio"][name="${nombre}"]`);
    if ((await page.locator(`input[type="radio"][name="${nombre}"]:checked`).count()) > 0) continue;
    // Las preguntas opcionales (p. ej. el sumidero) van plegadas en un `<details>`: no hace
    // falta contestarlas para seguir, y plegadas no se pueden marcar.
    if (!(await grupo.first().isVisible())) continue;
    const valor = preferidos[nombre];
    if (valor) await page.locator(`input[name="${nombre}"][value="${valor}"]`).check();
    else await grupo.first().check();
  }
  const descripcion = page.locator('textarea[name="descripcion"]');
  if ((await descripcion.count()) > 0 && (await descripcion.inputValue()).trim() === '') {
    await descripcion.fill(
      `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${Date.now()}`,
    );
  }
}

/**
 * Recorre el formulario de principio a fin y devuelve lo que vio en cada paso. Se detiene en el
 * último (el que tiene «Enviar reporte») sin enviar.
 */
async function recorrerFormulario(page: Page): Promise<PasoVisto[]> {
  await page.goto('/reportar');
  await crearCuentaYEntrarPorUi(page, '/reportar');
  await page.waitForURL('**/reportar');
  await expect(page.getByRole('heading', { name: 'Reportar un punto' })).toBeVisible();

  const vistos: PasoVisto[] = [];
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const { n, m } = await pasoActual(page);
    vistos.push({
      n,
      m,
      controles: await contarControles(page),
      camposViejos: await camposViejosEnPantalla(page),
      preguntaProfundidad: (await page.locator('input[name="profundidad_estimada"]').count()) > 0,
      preguntaFrecuencia: (await page.locator('input[name="frecuencia"]').count()) > 0,
    });
    await contestarPaso(page, n);
    if (await page.getByTestId('boton-enviar').isVisible()) return vistos;
    const siguiente = page.getByTestId('boton-siguiente');
    await expect(siguiente, `el paso ${n} tiene que poder continuarse`).toBeEnabled();
    await siguiente.click();
    await expect.poll(() => numeroDePaso(page)).toBe(n + 1);
  }
  throw new Error('el formulario no llegó al botón «Enviar reporte» en 8 pasos');
}

test.describe('quitar campos del reporte · app pública', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('CA-W1: el formulario no pregunta duración ni afectación y el resumen tampoco las muestra', async ({
    page,
  }) => {
    const vistos = await recorrerFormulario(page);

    for (const p of vistos)
      expect(p.camposViejos, `el paso ${p.n} no puede preguntar duración ni afectación`).toEqual(
        [],
      );
    expect(await page.locator('input[name="duracion_estimada"]').count()).toBe(0);
    expect(await page.locator('input[name="afectacion"]').count()).toBe(0);
    // Profundidad y frecuencia se siguen preguntando: son las dos entradas de la severidad v2.
    expect(
      vistos.some((p) => p.preguntaProfundidad),
      'algún paso pregunta la profundidad',
    ).toBe(true);
    expect(
      vistos.some((p) => p.preguntaFrecuencia),
      'algún paso pregunta la frecuencia',
    ).toBe(true);

    // Resumen final: lo que se va a enviar, fila por fila.
    const filas = (await page.locator('#contenido form dl dt').allTextContents()).map((t) =>
      t.trim(),
    );
    expect(filas).toContain('Profundidad');
    expect(filas).toContain('Frecuencia');
    expect(filas).not.toContain('Duración');
    expect(filas).not.toContain('Afectación');
    await expect(page.locator('#contenido form')).not.toContainText(/Duración|Afectación/);
  });

  test('CA-W2: «Paso N de M» es coherente y ningún paso queda vacío', async ({ page }) => {
    const vistos = await recorrerFormulario(page);

    const totales = [...new Set(vistos.map((p) => p.m))];
    expect(totales, 'todos los pasos anuncian el mismo total').toHaveLength(1);
    expect(totales[0], 'el total anunciado es el número de pasos recorridos').toBe(vistos.length);
    expect(vistos.map((p) => p.n)).toEqual(vistos.map((_, i) => i + 1));
    for (const p of vistos)
      expect(p.controles, `el paso ${p.n} tiene al menos un control`).toBeGreaterThan(0);
  });

  test('CA-W3: el cuerpo de POST /api/v1/reportes no lleva los cuatro campos', async ({ page }) => {
    await recorrerFormulario(page);

    const peticion = page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
    );
    await page.getByTestId('boton-enviar').click();
    const cuerpo = (await peticion).postDataJSON() as Record<string, unknown>;

    for (const c of CAMPOS_QUITADOS) expect(Object.keys(cuerpo), c).not.toContain(c);
    // Lo que sí tiene que viajar.
    expect(cuerpo.profundidad_estimada).toBeTruthy();
    expect(cuerpo.frecuencia).toBeTruthy();
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });

  test('CA-W6: la hoja de detalle muestra profundidad y frecuencia, y no duración ni afectación', async ({
    page,
    request,
  }) => {
    // Un reporte ya publicado del seed sintético (validado o resuelto).
    const r = await request.get(`${API}/api/v1/reportes?limite=1`);
    expect(r.status()).toBe(200);
    const lista = await r.json();
    const id = lista.features?.[0]?.id as string | undefined;
    expect(id, 'hace falta al menos un reporte publicado (`pnpm db:seed:samples`)').toBeTruthy();

    await page.goto(`/reporte/${id}`);
    const hoja = page.getByTestId('hoja-detalle');
    await expect(hoja).toBeVisible();
    const etiquetas = (await hoja.locator('dt').allTextContents()).map((t) => t.trim());
    expect(etiquetas).toContain('Profundidad');
    expect(etiquetas).toContain('Frecuencia');
    expect(etiquetas).not.toContain('Duración');
    expect(etiquetas).not.toContain('Afectación');
    await expect(hoja).not.toContainText(/Duración|Afectación/);
  });

  test.describe('CA-W7: capas del mapa público', () => {
    // «Centrar el mapa en mi ubicación» solo lee la ubicación si el permiso ya se dio.
    test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

    test('CA-W7: al acercar a zoom ≥ 15 no se pide la capa de manzanas; distritos y UV sí', async ({
      page,
      request,
    }) => {
      // Corre solo en el proyecto de escritorio: el proyecto `movil` filtra por nombre de archivo.
      // Dado: geo-service sigue ofreciendo la capa de manzanas.
      const capas = await (await request.get(`${GEO}/geo/v1/capas`)).json();
      expect(capas.map((c: { capa: string }) => c.capa)).toContain('manzana');

      // No hay acceso a la instancia de MapLibre desde la página, así que la capa se observa por
      // lo que el mapa pide: dibujar una capa implica pedir su GeoJSON o sus teselas.
      const red = vigilarRed(page);
      const esCapa = (capa: string) => (u: string) => {
        const ruta = new URL(u).pathname;
        return ruta.startsWith(`/geo/v1/teselas/${capa}/`) || ruta === `/geo/v1/capas/${capa}`;
      };
      const baseAZoom15 = (u: string) => /tile\.openstreetmap\.org\/(1[5-9])\//.test(u);

      await page.goto('/');
      await expect(page.getByTestId('tarjeta-reporte').first()).toBeVisible();

      // Acercar hasta la calle: «Centrar el mapa en mi ubicación» vuela a zoom 16. El clic se
      // reintenta porque uno anterior a la hidratación se pierde.
      const centrar = page.getByRole('button', { name: 'Centrar el mapa en mi ubicación' });
      await expect(async () => {
        await centrar.click();
        await expect.poll(() => red.pedidas.some(baseAZoom15), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 30_000 });

      await expect.poll(() => red.pedidas.some(esCapa('distrito_municipal'))).toBe(true);
      await expect.poll(() => red.pedidas.some(esCapa('unidad_vecinal'))).toBe(true);
      // Las teselas de manzanas saldrían en la misma tanda que las de UV a este zoom. En vez de
      // un margen fijo (que pasaba igual con el mapa todavía cargando), se espera a que la red de
      // geo-service se quede quieta: todo lo pedido volvió y no sale nada nuevo.
      await esperarRedQuieta(red, (u) => new URL(u).pathname.startsWith('/geo/v1/'));

      const manzanas = red.pedidas.filter(esCapa('manzana'));
      expect(manzanas, 'el mapa público no dibuja manzanas').toEqual([]);
    });
  });

  test('CA-W8: «Cómo funciona» explica la fórmula v2 sin duración ni afectación', async ({
    page,
  }) => {
    await page.goto('/como-funciona');
    const colores = page.getByRole('tab', { name: 'Los colores' });
    await expect(async () => {
      await colores.click();
      await expect(colores).toHaveAttribute('aria-selected', 'true');
    }).toPass({ timeout: 15_000 });

    const panel = page.locator('#panel-colores');
    await expect(
      panel.getByText('puntaje = 2 × profundidad + frecuencia', { exact: true }),
    ).toBeVisible();

    // La spec fija los rangos, no cómo se escriben («3–4», «3 a 4»…): se comparan los números.
    const filas = panel.locator('table tbody tr');
    const bandas = await filas.evaluateAll((trs) =>
      trs.map((tr) => {
        const [rango = '', banda = ''] = Array.from(
          tr.querySelectorAll('td'),
          (td) => td.textContent ?? '',
        );
        return { rango: (rango.match(/\d+/g) ?? []).map(Number), banda: banda.trim() };
      }),
    );
    expect(bandas).toEqual([
      { rango: [3, 4], banda: 'Baja' },
      { rango: [5, 7], banda: 'Media' },
      { rango: [8, 10], banda: 'Alta' },
      { rango: [11, 12], banda: 'Crítica' },
    ]);
    await expect(panel).not.toContainText(/duración|afectación/i);
  });
});
