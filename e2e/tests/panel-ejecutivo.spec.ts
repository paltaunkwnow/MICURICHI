import { expect, type Locator, type Page, type Request, test } from '@playwright/test';
import {
  API,
  CREDENCIALES_EJECUTIVO,
  crearReportePorApi,
  cuentaNuevaConSesion,
  esperarPila,
  loginEjecutivo,
  loginTecnico,
  PANEL,
  retenerPeticiones,
  sesionDelPanelEnElNavegador,
} from './ayudas';

/**
 * Panel ejecutivo: un rol que solo mira. Ve el resumen por severidad, estado y distrito, y nada
 * más: no modera, no exporta, no entra a las pantallas de trabajo del técnico.
 *
 * Desde contracts 0.6.0 la cifra grande es la inundación ACTIVA (en revisión + verificadas): un
 * reporte resuelto sale de ella y cuenta solo como trabajo hecho. Cada pestaña de severidad lleva
 * su propio conteo; la cifra grande no cambia al elegir una.
 *
 * El refresco automático (cada 60 s, y al volver a la pestaña) sale marcado con
 * `x-curichi-sondeo: 1` para no renovar la inactividad de la sesión; lo que pide la persona, no.
 */

const RESUMEN = `${API}/api/v1/ejecutivo/resumen`;
const CABECERA_SONDEO = 'x-curichi-sondeo';

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

function esResumen(r: Request, ventana?: string): boolean {
  const u = new URL(r.url());
  return (
    u.pathname.endsWith('/api/v1/ejecutivo/resumen') &&
    (ventana === undefined || u.searchParams.get('ventana') === ventana)
  );
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
 * Abre `/ejecutivo` con sesión y devuelve el resumen que recibió la pantalla. Se compara la
 * pantalla con ESA respuesta y no con otra pedida aparte: api-core cachea el resumen 30 s y dos
 * lecturas a cada lado del vencimiento pueden traer cifras distintas sin que nada esté mal.
 */
async function abrirConSuResumen(page: Page): Promise<Resumen> {
  await sesionDelPanelEnElNavegador(page, CREDENCIALES_EJECUTIVO);
  const respuesta = page.waitForResponse((r) => esResumen(r.request()) && r.status() === 200);
  await page.goto(`${PANEL}/ejecutivo`);
  const resumen = (await (await respuesta).json()) as Resumen;
  await esperarResumen(page);
  return resumen;
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
    const validar = await request.patch(`${API}/api/v1/reportes/${id}/estado`, {
      data: { estado: 'validado' },
    });
    expect(validar.status(), await validar.text()).toBe(200);

    // Cada transición olvida el resumen cacheado: estas dos lecturas son frescas.
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

  test('tras el login aterriza en /ejecutivo con las activas, las pestañas y las dos gráficas', async ({
    page,
  }) => {
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
    await expect(page.getByTestId('ejecutivo-mapa')).toBeVisible();
  });

  test('cada pestaña lleva su conteo de activas y la cifra grande no cambia al elegir una', async ({
    page,
  }) => {
    const resumen = await abrirConSuResumen(page);
    const s = resumen.activas.por_severidad;
    const esperados: Record<string, number> = {
      // «Crítica» suma crítica y alta (decisión del usuario, 2026-09-25).
      critica: s.critica + s.alta,
      media: s.media,
      baja: s.baja,
      todas: resumen.activas.total,
    };

    const total = page.getByTestId('ejecutivo-total');
    expect(await numeroEn(total)).toBe(resumen.activas.total);
    for (const [pestana, n] of Object.entries(esperados)) {
      expect(
        await numeroEn(page.getByTestId(`ejecutivo-pestana-${pestana}`).locator('.n')),
        `conteo de la pestaña «${pestana}»`,
      ).toBe(n);
    }

    const media = page.getByTestId('ejecutivo-pestana-media');
    await expect(async () => {
      await media.click();
      await expect(media).toHaveAttribute('aria-selected', 'true');
    }).toPass({ timeout: 15_000 });
    // La pestaña filtra el mapa y las gráficas; la cifra grande es siempre toda la inundación activa.
    expect(await numeroEn(total)).toBe(resumen.activas.total);
  });

  test('los distritos de una capa anterior van aparte, y solo si los hay', async ({ page }) => {
    const resumen = await abrirConSuResumen(page);
    const anteriores = resumen.por_distrito.filter((d) => !d.en_capa_vigente);

    const seccion = page.getByTestId('ejecutivo-capa-anterior');
    if (!anteriores.length) {
      await expect(seccion).toHaveCount(0);
      return;
    }
    await expect(seccion).toBeVisible();
    // Con el código completo: acortado podría repetir el de un distrito vigente.
    for (const d of anteriores) await expect(seccion).toContainText(`${d.codigo} · ${d.nombre}`);
  });

  test('cambiar el período consulta esa ventana sin marca de sondeo y avisa mientras carga', async ({
    page,
  }) => {
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_EJECUTIVO);
    await page.goto(`${PANEL}/ejecutivo`);
    await esperarResumen(page);

    // La respuesta se retiene para poder ver las cifras viejas atenuadas y rotuladas.
    const retenida = await retenerPeticiones(page, /\/api\/v1\/ejecutivo\/resumen\?.*ventana=7d/);
    const peticion = page.waitForRequest((r) => esResumen(r, '7d'));
    await page.getByTestId('ejecutivo-ventana').selectOption('7d');
    const enviada = await peticion;
    expect(
      await enviada.headerValue(CABECERA_SONDEO),
      'lo que pide la persona renueva la sesión: no va marcado como sondeo',
    ).toBeNull();

    await retenida.llegada;
    await expect(page.getByTestId('ejecutivo-cargando-periodo')).toBeVisible();
    await expect(page.getByTestId('ejecutivo-contenido')).toHaveAttribute('aria-busy', 'true');

    retenida.liberar();
    await expect(page.getByTestId('ejecutivo-cargando-periodo')).toHaveCount(0);
    await expect(page.getByTestId('ejecutivo-contenido')).not.toHaveAttribute('aria-busy', 'true');
  });

  test('el refresco automático cada 60 s sale marcado como sondeo', async ({ page }) => {
    // Reloj de la página controlado: el minuto se salta en vez de esperarlo. Instalado, el reloj
    // corre como el real hasta que se lo adelanta, así que la página carga y se usa con normalidad.
    await page.clock.install();
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_EJECUTIVO);
    await page.goto(`${PANEL}/ejecutivo`);
    await esperarResumen(page);

    const refresco = page.waitForRequest((r) => esResumen(r));
    await page.clock.fastForward('01:05');
    const r = await refresco;
    expect(await r.headerValue(CABECERA_SONDEO)).toBe('1');
    // Y el panel sigue mostrando cifras tras el refresco.
    await esperarResumen(page);
  });

  test('volver a la pestaña del navegador refresca también como sondeo', async ({ page }) => {
    await page.clock.install();
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_EJECUTIVO);
    await page.goto(`${PANEL}/ejecutivo`);
    await esperarResumen(page);

    // El panel da los datos por frescos 30 s (`staleTime` del QueryClient): se los envejece sin
    // llegar al minuto del refresco periódico, para que el que salga sea el de la pestaña.
    const refresco = page.waitForRequest((r) => esResumen(r));
    await page.clock.fastForward('00:31');
    // Es lo que hace el navegador al volver a la pestaña; TanStack Query refresca al oírlo.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    const r = await refresco;
    expect(await r.headerValue(CABECERA_SONDEO)).toBe('1');
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
