import { expect, type Locator, type Page, type Request, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_EJECUTIVO,
  CREDENCIALES_TECNICO,
  crearReportePorApi,
  cuentaNuevaConSesion,
  esperarPila,
  esperarPublicacion,
  esperarRedQuieta,
  loginEjecutivo,
  loginTecnico,
  PANEL,
  sesionDelPanelEnElNavegador,
  vigilarRed,
} from './ayudas';

/**
 * Panel ejecutivo: un rol que solo mira. Ve el resumen por severidad, estado y distrito, y nada
 * más: no modera, no exporta, no entra a las pantallas de trabajo del técnico.
 *
 * Desde contracts 0.6.0 la cifra grande es la inundación ACTIVA (en revisión + verificadas): un
 * reporte resuelto sale de ella y cuenta solo como trabajo hecho. Cada pestaña de severidad lleva
 * su propio conteo; la cifra grande no cambia al elegir una.
 *
 * Pantalla limpia (plan 2026-09-26, S27): la cifra grande con «N verificadas · M en revisión», las
 * pestañas, las dos gráficas por distrito y la nota en una línea. Sin mapa, sin selector de
 * período (siempre el histórico, `ventana=todo`), sin «actualizado hace…» ni «Último reporte». Los
 * distritos de una capa anterior se listan en Indicadores. El refresco de cada 10 s y el de volver
 * a la pestaña, con `x-curichi-sondeo: 1`, están en `panel-al-dia.spec.ts`.
 */

const RESUMEN = `${API}/api/v1/ejecutivo/resumen`;

/** Lo que salió de la pantalla ejecutiva en S27: ninguno puede volver. */
const QUITADOS_DEL_EJECUTIVO = [
  'ejecutivo-mapa',
  'ejecutivo-ventana',
  'ejecutivo-cargando-periodo',
  'ejecutivo-capa-anterior',
  'indicadores-capa-anterior',
];

interface ConteoActivas {
  total: number;
  verificadas: number;
  en_revision: number;
  por_severidad: { critica: number; alta: number; media: number; baja: number };
}
interface ConteoPorEstado {
  nuevo: number;
  validado: number;
  resuelto: number;
}
interface Resumen {
  generado_en: string;
  activas: ConteoActivas;
  resueltas: number;
  por_estado: ConteoPorEstado;
  por_distrito: Array<{
    distrito_id: string;
    codigo: string;
    nombre: string;
    en_capa_vigente: boolean;
    activas: ConteoActivas;
    por_estado: ConteoPorEstado;
    ultimo_reporte_en: string | null;
  }>;
  ultimo_reporte_en: string | null;
}

/**
 * Primer número que muestra un elemento, admitiendo separador de miles («1.234», «1 234»): el
 * formato es el del locale de la ciudad configurada. `\s` incluye los espacios duros.
 */
async function numeroEn(elemento: Locator): Promise<number | null> {
  const texto = (await elemento.textContent()) ?? '';
  const r = /\d[\d.\s]*/.exec(texto);
  return r ? Number(r[0].replace(/\D/g, '')) : null;
}

/** Las igualdades que fija `ConteoActivasSchema`, con un mensaje que dice dónde falló. */
function comprobarActivas(a: ConteoActivas, donde: string) {
  const s = a.por_severidad;
  expect(a.total, `${donde}: total = verificadas + en revisión`).toBe(
    a.verificadas + a.en_revision,
  );
  expect(s.critica + s.alta + s.media + s.baja, `${donde}: la severidad reparte las activas`).toBe(
    a.total,
  );
}

function comprobarTruncadaAlMinuto(v: string | null, donde: string) {
  if (v === null) return;
  expect(Date.parse(v) % 60_000, `${donde}: ultimo_reporte_en sin segundos (privacidad)`).toBe(0);
}

function esResumen(r: Request): boolean {
  return new URL(r.url()).pathname.endsWith('/api/v1/ejecutivo/resumen');
}

async function entrarComoEjecutivo(page: Page) {
  await page.goto(`${PANEL}/login`);
  await page.locator('#email').fill(CREDENCIALES_EJECUTIVO.email);
  await page.locator('#password').fill(CREDENCIALES_EJECUTIVO.password);
  await page.getByTestId('boton-login').click();
  // El ejecutivo no tiene nada que hacer en «Reportes»: aterriza directamente en su panel.
  await expect(page).toHaveURL(/\/ejecutivo$/, { timeout: 60_000 });
}

/** El panel ya pintó el resumen (la cifra grande lleva un número). */
async function esperarResumen(page: Page) {
  await expect(page.getByTestId('ejecutivo-total')).toHaveText(/\d/, { timeout: 60_000 });
}

/**
 * Abre una pantalla del panel con sesión y va guardando el último resumen que le llegó. La pantalla
 * se refresca sola cada 10 s: se la compara con lo último que recibió, dentro de `toPass`, y no con
 * otra lectura pedida aparte, que podría caer a un lado u otro de un refresco con un reporte
 * publicado en el medio.
 */
async function abrirSiguiendoElResumen(
  page: Page,
  ruta = '/ejecutivo',
  credenciales = CREDENCIALES_EJECUTIVO,
): Promise<() => Resumen> {
  let ultimo: Resumen | undefined;
  page.on('response', async (r) => {
    if (!esResumen(r.request()) || r.status() !== 200) return;
    try {
      ultimo = (await r.json()) as Resumen;
    } catch {
      // La página se cerró antes de leer el cuerpo: no hay nada que comparar.
    }
  });
  await sesionDelPanelEnElNavegador(page, credenciales);
  const primera = page.waitForResponse((r) => esResumen(r.request()) && r.status() === 200);
  await page.goto(`${PANEL}${ruta}`);
  ultimo ??= (await (await primera).json()) as Resumen;
  return () => ultimo as Resumen;
}

test.describe('panel ejecutivo · API', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('sin sesión, el resumen responde 401', async ({ request }) => {
    const r = await request.get(RESUMEN);
    expect(r.status()).toBe(401);
    expect((await r.json()).codigo).toBe('SIN_SESION');
  });

  test('con sesión de ciudadano, el resumen responde 403', async ({ request }) => {
    await cuentaNuevaConSesion(request, 'ejec-');
    const r = await request.get(RESUMEN);
    expect(r.status()).toBe(403);
    expect((await r.json()).codigo).toBe('SIN_PERMISO');
  });

  test('con sesión de ejecutivo, el resumen separa las activas de las resueltas y cuadra (0.6.0)', async ({
    request,
  }) => {
    await loginEjecutivo(request);
    const r = await request.get(RESUMEN);
    expect(r.status(), await r.text()).toBe(200);
    const resumen = (await r.json()) as Resumen & Record<string, unknown>;

    // La forma anterior (0.5.0) contaba los resueltos en la cifra grande: no puede volver.
    expect(resumen).not.toHaveProperty('total');
    expect(resumen).not.toHaveProperty('por_severidad');

    comprobarActivas(resumen.activas, 'raíz');
    expect(resumen.activas.verificadas).toBe(resumen.por_estado.validado);
    expect(resumen.activas.en_revision).toBe(resumen.por_estado.nuevo);
    expect(resumen.resueltas).toBe(resumen.por_estado.resuelto);
    comprobarTruncadaAlMinuto(resumen.ultimo_reporte_en, 'raíz');

    expect(
      resumen.por_distrito.length,
      'el seed tiene reportes en al menos un distrito (`pnpm db:seed:samples`)',
    ).toBeGreaterThanOrEqual(1);
    expect(
      resumen.por_distrito.some((d) => d.en_capa_vigente),
      'al menos un distrito es de la capa vigente',
    ).toBe(true);
    for (const d of resumen.por_distrito) {
      expect(typeof d.en_capa_vigente, d.distrito_id).toBe('boolean');
      comprobarActivas(d.activas, d.distrito_id);
      expect(d.activas.verificadas, d.distrito_id).toBe(d.por_estado.validado);
      expect(d.activas.en_revision, d.distrito_id).toBe(d.por_estado.nuevo);
      comprobarTruncadaAlMinuto(d.ultimo_reporte_en, d.distrito_id);
    }
  });

  test('un reporte resuelto sale de las activas y pasa a «resueltas»', async ({ request }) => {
    const id = await crearReportePorApi(request, `E2E-EJ-${Date.now()}`);
    await loginTecnico(request);
    // Durante su demora de publicación nadie lo ve, ni el técnico que lo tendría que validar.
    await esperarPublicacion(request, id);
    const validar = await request.patch(`${API}/api/v1/reportes/${id}/estado`, {
      data: { estado: 'validado' },
    });
    expect(validar.status(), await validar.text()).toBe(200);

    // api-core no guarda el resumen en caché: estas dos lecturas son frescas.
    const antes = (await (await request.get(`${RESUMEN}?ventana=todo`)).json()) as Resumen;
    const resolver = await request.patch(`${API}/api/v1/reportes/${id}/estado`, {
      data: { estado: 'resuelto', estado_motivo: 'Se destapó el sumidero (prueba E2E).' },
    });
    expect(resolver.status(), await resolver.text()).toBe(200);
    const despues = (await (await request.get(`${RESUMEN}?ventana=todo`)).json()) as Resumen;

    expect(despues.resueltas).toBe(antes.resueltas + 1);
    expect(despues.activas.verificadas).toBe(antes.activas.verificadas - 1);
    expect(despues.activas.en_revision).toBe(antes.activas.en_revision);
    expect(despues.activas.total).toBe(antes.activas.total - 1);
  });

  test('el ejecutivo no abre ninguna puerta técnica', async ({ request }) => {
    await loginEjecutivo(request);
    for (const ruta of [
      '/api/v1/tecnico/reportes',
      '/api/v1/exportar?formato=csv',
      '/api/v1/indicadores',
    ]) {
      const r = await request.get(`${API}${ruta}`);
      expect(r.status(), ruta).toBe(403);
    }
  });
});

test.describe('panel ejecutivo · interfaz', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('tras el login aterriza en /ejecutivo con la pantalla limpia: activas, pestañas y dos gráficas', async ({
    page,
  }) => {
    const red = vigilarRed(page);
    await entrarComoEjecutivo(page);
    await esperarResumen(page);

    await expect(page.getByTestId('ejecutivo-contenido')).toBeVisible();
    await expect(page.getByTestId('ejecutivo-verificadas')).toHaveText(
      /^\d[\d.\s]* verificadas? · \d[\d.\s]* en revisión$/,
    );
    // La región viva dice las cifras, no el reloj de «actualizado hace…».
    await expect(page.getByTestId('ejecutivo-anuncio')).toHaveText(
      /inundaci(ón|ones) activas?: .*verificadas? y .* en revisión\.$/,
    );

    for (const pestana of ['critica', 'media', 'baja', 'todas']) {
      await expect(page.getByTestId(`ejecutivo-pestana-${pestana}`)).toBeVisible();
    }

    for (const grafica of ['ejecutivo-grafica-inundaciones', 'ejecutivo-grafica-trabajo']) {
      const g = page.getByTestId(grafica);
      await expect(g).toBeVisible();
      await expect
        .poll(() => g.locator('rect').count(), { message: `${grafica} dibuja al menos una barra` })
        .toBeGreaterThan(0);
    }
    await expect(page.getByTestId('ejecutivo-nota')).toBeVisible();

    // Lo que salió de la pantalla (S27).
    for (const testId of QUITADOS_DEL_EJECUTIVO) {
      await expect(page.getByTestId(testId), `sin «${testId}»`).toHaveCount(0);
    }
    await expect(page.locator('.maplibregl-map'), 'sin mapa').toHaveCount(0);
    await expect(page.getByText(/actualizado hace/i)).toHaveCount(0);
    await expect(page.getByText(/último reporte/i)).toHaveCount(0);

    // Sin mapa no se pide ninguna capa, y el resumen es siempre el histórico entero.
    await esperarRedQuieta(red, () => true);
    const pedidas = red.pedidas.map((u) => new URL(u));
    expect(
      pedidas.filter((u) => u.pathname.startsWith('/geo/')).map((u) => u.pathname),
      'sin mapa, ninguna capa ni tesela',
    ).toEqual([]);
    const resumenes = pedidas.filter((u) => u.pathname.endsWith('/api/v1/ejecutivo/resumen'));
    expect(resumenes.length, 'la pantalla pidió el resumen').toBeGreaterThan(0);
    for (const u of resumenes) expect(u.searchParams.get('ventana'), u.href).toBe('todo');
  });

  test('cada pestaña lleva su conteo de activas y la cifra grande no cambia al elegir una', async ({
    page,
  }) => {
    const resumen = await abrirSiguiendoElResumen(page);
    await esperarResumen(page);
    const total = page.getByTestId('ejecutivo-total');

    await expect(async () => {
      const r = resumen();
      const s = r.activas.por_severidad;
      const esperados: Record<string, number> = {
        // «Crítica» suma crítica y alta (decisión del usuario, 2026-09-25).
        critica: s.critica + s.alta,
        media: s.media,
        baja: s.baja,
        todas: r.activas.total,
      };
      expect(await numeroEn(total)).toBe(r.activas.total);
      for (const [pestana, n] of Object.entries(esperados)) {
        expect(
          await numeroEn(page.getByTestId(`ejecutivo-pestana-${pestana}`).locator('.n')),
          `conteo de la pestaña «${pestana}»`,
        ).toBe(n);
      }
    }).toPass({ timeout: 15_000 });

    const media = page.getByTestId('ejecutivo-pestana-media');
    await expect(async () => {
      await media.click();
      await expect(media).toHaveAttribute('aria-selected', 'true');
    }).toPass({ timeout: 15_000 });
    // La pestaña filtra la gráfica de inundaciones; la cifra grande es siempre toda la inundación
    // activa.
    await expect(async () => {
      expect(await numeroEn(total)).toBe(resumen().activas.total);
    }).toPass({ timeout: 15_000 });
  });

  test('la gráfica de inundaciones suma las activas, con «Otros» solo si hay activas fuera de los distritos vigentes', async ({
    page,
  }) => {
    const resumen = await abrirSiguiendoElResumen(page);
    await esperarResumen(page);
    const grafica = page.getByTestId('ejecutivo-grafica-inundaciones');
    // La tabla que acompaña a la gráfica para los lectores de pantalla, con los valores sin formato.
    const tabla = page.getByRole('table', { name: /^Inundaciones activas por distrito/ });

    await expect(async () => {
      const r = resumen();
      const vigentes = r.por_distrito.filter((d) => d.en_capa_vigente);
      const otros = r.activas.total - vigentes.reduce((s, d) => s + d.activas.total, 0);
      await expect(grafica.locator('g[data-barra]'), 'una barra por distrito vigente').toHaveCount(
        vigentes.length + (otros > 0 ? 1 : 0),
        { timeout: 1_000 },
      );
      await expect(
        grafica.locator('g[data-barra="otros"]'),
        `«Otros» con ${otros} activas fuera de los distritos vigentes`,
      ).toHaveCount(otros > 0 ? 1 : 0, { timeout: 1_000 });
      const valores = (await tabla.locator('tbody td').allTextContents()).map(Number);
      expect(
        valores.reduce((s, n) => s + n, 0),
        'las barras suman la cifra grande',
      ).toBe(r.activas.total);
    }).toPass({ timeout: 15_000 });
  });

  test('los distritos de una capa anterior se listan en Indicadores, y solo si los hay', async ({
    page,
  }) => {
    // Indicadores es del técnico: el ejecutivo no entra.
    const resumen = await abrirSiguiendoElResumen(page, '/indicadores', CREDENCIALES_TECNICO);
    await expect(page.getByTestId('indicador-vigentes')).toHaveText(/\d/, { timeout: 60_000 });
    const seccion = page.getByTestId('indicadores-capa-anterior');

    await expect(async () => {
      const anteriores = resumen().por_distrito.filter((d) => !d.en_capa_vigente);
      if (!anteriores.length) {
        await expect(seccion).toHaveCount(0, { timeout: 1_000 });
        return;
      }
      await expect(seccion).toBeVisible({ timeout: 1_000 });
      // Con el código completo: acortado podría repetir el de un distrito vigente.
      for (const d of anteriores)
        await expect(seccion).toContainText(`${d.codigo} · ${d.nombre}`, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });

  test('el ejecutivo que escribe /reportes en la barra vuelve a /ejecutivo, con el aviso', async ({
    page,
  }) => {
    await entrarComoEjecutivo(page);
    await page.goto(`${PANEL}/reportes`);
    await expect(page).toHaveURL(/\/ejecutivo$/, { timeout: 60_000 });
    // Acá sí corresponde explicar por qué no está donde pidió (distinto de entrar por la raíz).
    await expect(page.getByTestId('aviso-acceso')).toContainText('Te trajimos al panel ejecutivo');
  });
});
