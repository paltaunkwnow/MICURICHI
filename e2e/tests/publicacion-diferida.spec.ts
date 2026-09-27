import {
  type APIRequestContext,
  type APIResponse,
  type Browser,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  API,
  CREDENCIALES_ADMIN,
  CREDENCIALES_TECNICO,
  cuentaNuevaConSesion,
  DEMORA_E2E_PRIMERO_S,
  DEMORA_E2E_SIGUIENTES_S,
  ETIQUETA_PUBLICA,
  esperarPila,
  loginTecnico,
  PANEL,
  PNG_1X1,
  PUBLICA,
  REPORTES_POR_DIA,
  reporteValido,
  sesionDelPanelEnElNavegador,
} from './ayudas';

/**
 * Publicación sin moderación previa, con demora (plan 2026-09-26, pedidos C, G y B; paso S24).
 *
 * El reporte llega al servidor en cuanto se envía, y lo que tarda es que aparezca: el 1.º del día
 * de la cuenta, `DEMORA_PUBLICACION_PRIMERO_S` después, y los siguientes, más. Durante la espera
 * no lo ve nadie, ni los técnicos, salvo su autora, que ve su reporte y su foto. Pasada la
 * demora, lo ve cualquiera con el texto exacto «NO SE HA VERIFICADO»; validarlo lo pasa a
 * «Verificado», rechazarlo lo saca del mapa (detalle y foto), y un verificado lo puede retirar
 * solo un admin.
 *
 * La pila E2E corre con 2 y 4 s (`DEMORA_E2E_*`, playwright.config.ts) en lugar de 60 y 240: lo
 * que se prueba es la regla, no el número. Las consultas «durante la espera» salen todas juntas
 * apenas vuelve el envío y cada una se da por válida solo si volvió cuando el reporte seguro seguía
 * sin publicarse: si la máquina estuviera tan cargada que no llegan, el fallo lo dice en vez de
 * parecer un defecto.
 *
 * En serie: la cuenta A envía dos reportes y los casos siguientes los moderan.
 */
test.describe.configure({ mode: 'serial' });

/** Desde que vuelve el envío hasta que se ve publicado, como máximo (con la demora de prueba). */
const PLAZO_PUBLICACION_MS = 10_000;

const MOTIVO = 'Prueba E2E de publicación diferida: no corresponde.';

/** Lo que devuelve `POST /api/v1/reportes` (la vista de la autora) y cuándo volvió. */
interface Enviado {
  id: string;
  /** Ruta de la foto en api-core (`/api/v1/fotos/<clave>`). */
  foto: string;
  /** `publicar_en - creado_en`, los dos del reloj de la base: la demora que fijó el servidor. */
  demoraMs: number;
  segundos: number;
  /**
   * Hasta cuándo, con el reloj de esta máquina, el reporte seguro no está publicado: el INSERT
   * ocurrió después de mandar el envío, así que se publica `demoraMs` después de eso o más tarde.
   * No se compara `publicar_en` con `Date.now()`: con la base en Docker (una máquina virtual en
   * Windows), su reloj puede ir corrido del de acá.
   */
  seguroEnEsperaHasta: number;
  /** `Date.now()` al volver el 201: desde acá se mide cuánto tarda en verse. */
  recibidoEn: number;
}

/** Sube una foto y envía un reporte con ella, con la cuenta de `autora`. */
async function enviarConFoto(autora: APIRequestContext, marca: string): Promise<Enviado> {
  const subida = await autora.post(`${API}/api/v1/fotos`, {
    multipart: { archivo: { name: 'charco.png', mimeType: 'image/png', buffer: PNG_1X1 } },
  });
  expect(subida.status(), await subida.text()).toBe(201);
  const { objeto_key: clave } = (await subida.json()) as { objeto_key: string };

  const enviadoEn = Date.now();
  const r = await autora.post(`${API}/api/v1/reportes`, {
    data: { ...reporteValido(marca), fotos: [clave] },
  });
  const recibidoEn = Date.now();
  expect(r.status(), await r.text()).toBe(201);
  const f = await r.json();
  const p = f.properties;
  // La respuesta es la vista de la autora (contracts 0.11.0): con cuándo se publica.
  expect(p.estado).toBe('nuevo');
  expect(p.verificado).toBe(false);
  expect(p.retirado).toBe(false);
  expect(typeof p.publicar_en).toBe('string');
  expect(Number.isInteger(p.segundos_para_publicar)).toBe(true);
  expect(p.fotos).toHaveLength(1);
  // La demora la fija la base en el INSERT: creado_en y publicar_en salen del mismo now().
  const demoraMs = Date.parse(p.publicar_en) - Date.parse(p.creado_en);
  return {
    id: f.id as string,
    foto: new URL(p.fotos[0] as string, API).pathname,
    demoraMs,
    segundos: p.segundos_para_publicar,
    seguroEnEsperaHasta: enviadoEn + demoraMs,
    recibidoEn,
  };
}

/**
 * Una consulta hecha durante la espera: la respuesta y si volvió a tiempo. Una respuesta que
 * volvió antes de `seguroEnEsperaHasta` se armó con el reporte todavía sin publicar.
 */
async function durante(e: Enviado, pedido: Promise<APIResponse>) {
  const r = await pedido;
  return { r, aTiempo: Date.now() < e.seguroEnEsperaHasta };
}

function aTiempo(x: { aTiempo: boolean }, quien: string) {
  expect(
    x.aTiempo,
    `${quien}: la respuesta volvió cuando el reporte ya podía estar publicado, así que no prueba nada: la máquina está demasiado cargada para la demora de prueba`,
  ).toBe(true);
}

/** Pregunta hasta que `quien` ve el reporte en el detalle público; devuelve cuándo lo vio. */
async function esperarQueLoVea(quien: APIRequestContext, e: Enviado): Promise<number> {
  const restante = e.recibidoEn + PLAZO_PUBLICACION_MS - Date.now();
  await expect
    .poll(async () => (await quien.get(`${API}/api/v1/reportes/${e.id}`)).status(), {
      message: `el reporte ${e.id} tiene que verse en ${PLAZO_PUBLICACION_MS / 1000} s o menos`,
      timeout: Math.max(1_000, restante),
      intervals: [200],
    })
    .toBe(200);
  const visto = Date.now();
  expect(visto - e.recibidoEn, 'se ve en 10 s o menos').toBeLessThanOrEqual(PLAZO_PUBLICACION_MS);
  return visto;
}

/** Un reporte de la lista de `GET /mis-reportes` de la cuenta de `quien`. */
async function miReporte(quien: APIRequestContext, id: string) {
  const r = await quien.get(`${API}/api/v1/mis-reportes`);
  expect(r.status()).toBe(200);
  expect(r.headers()['cache-control']).toBe('private, no-store');
  const lista = (await r.json()).features as Array<{
    id: string;
    properties: Record<string, unknown>;
  }>;
  const f = lista.find((x) => x.id === id);
  expect(f, `el reporte ${id} tiene que estar en «Mis reportes» de su autora`).toBeTruthy();
  return (f as { properties: Record<string, unknown> }).properties;
}

/** Un navegador aparte con la sesión del panel de `credenciales`. */
async function panelCon(browser: Browser, credenciales: { email: string; password: string }) {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await sesionDelPanelEnElNavegador(pagina, credenciales);
  return { contexto, pagina };
}

/** El detalle público de escritorio (`hoja-detalle`), ya cargado. */
async function detallePublico(page: Page, id: string) {
  await page.goto(`${PUBLICA}/reporte/${id}`);
  const hoja = page.getByTestId('hoja-detalle');
  await expect(hoja).toBeVisible({ timeout: 30_000 });
  return hoja;
}

test.describe('publicación diferida y «NO SE HA VERIFICADO»', () => {
  let autora: APIRequestContext;
  let credencialesAutora: { email: string; password: string };
  let vecino: APIRequestContext;
  let anonimo: APIRequestContext;
  let tecnico: APIRequestContext;
  let primero: Enviado;
  let segundo: Enviado;
  let tardanzaPrimero = 0;

  test.beforeAll(async ({ playwright, request }) => {
    await esperarPila(request);
    autora = await playwright.request.newContext();
    vecino = await playwright.request.newContext();
    anonimo = await playwright.request.newContext();
    tecnico = await playwright.request.newContext();
    // A y B: cuentas nuevas, con el día entero (el 1.º reporte de A es el de la demora corta).
    credencialesAutora = await cuentaNuevaConSesion(autora, 'diferida-a-');
    await cuentaNuevaConSesion(vecino, 'diferida-b-');
    await loginTecnico(tecnico);
  });

  test.afterAll(async () => {
    await Promise.all([autora, vecino, anonimo, tecnico].map((c) => c?.dispose()));
  });

  test('A envía: durante la espera ni B, ni un anónimo, ni el técnico lo ven; A ve su reporte y su foto', async () => {
    const yo = await (await autora.get(`${API}/api/v1/auth/yo`)).json();
    expect(yo.reportes_restantes_hoy).toBe(REPORTES_POR_DIA);
    expect(yo.demora_proximo_s, 'antes de enviar, /auth/yo dice cuánto va a tardar').toBe(
      DEMORA_E2E_PRIMERO_S,
    );

    primero = await enviarConFoto(autora, `E2E-DIFERIDA-1-${Date.now()}`);
    // La demora la fija la base en el INSERT: creado_en y publicar_en salen del mismo now().
    expect(primero.demoraMs).toBe(DEMORA_E2E_PRIMERO_S * 1000);
    expect(primero.segundos).toBeGreaterThan(0);
    expect(primero.segundos).toBeLessThanOrEqual(DEMORA_E2E_PRIMERO_S);

    // Todo junto, apenas vuelve el envío.
    const [paraB, paraAnonimo, paraTecnico, moderar, fotoB, fotoAnonimo, fotoTecnico, fotoA] =
      await Promise.all([
        durante(primero, vecino.get(`${API}/api/v1/reportes/${primero.id}`)),
        durante(primero, anonimo.get(`${API}/api/v1/reportes/${primero.id}`)),
        durante(primero, tecnico.get(`${API}/api/v1/tecnico/reportes/${primero.id}`)),
        // Una transición que no existe desde «nuevo»: mientras espera, 404 (nadie modera lo que
        // todavía no se publicó); si llegara tarde sería 409, y no cambiaría nada.
        durante(
          primero,
          tecnico.patch(`${API}/api/v1/reportes/${primero.id}/estado`, {
            data: { estado: 'resuelto', estado_motivo: MOTIVO },
          }),
        ),
        durante(primero, vecino.get(`${API}${primero.foto}`)),
        durante(primero, anonimo.get(`${API}${primero.foto}`)),
        durante(primero, tecnico.get(`${API}${primero.foto}`)),
        durante(primero, autora.get(`${API}${primero.foto}`)),
      ]);

    for (const [x, quien] of [
      [paraB, 'B (detalle público)'],
      [paraAnonimo, 'un anónimo (detalle público)'],
      [paraTecnico, 'el técnico (vista técnica)'],
      [moderar, 'el técnico (moderación)'],
      [fotoB, 'B (foto)'],
      [fotoAnonimo, 'un anónimo (foto)'],
      [fotoTecnico, 'el técnico (foto)'],
    ] as const) {
      aTiempo(x, quien);
      expect(x.r.status(), `${quien} no lo ve durante la espera`).toBe(404);
    }
    // Un 404 que ninguna caché compartida puede guardar y servir después de publicado.
    expect(fotoB.r.headers()['cache-control']).toBe('private, no-store');

    // La autora sí: su foto, solo para ella.
    aTiempo(fotoA, 'A (su foto)');
    expect(fotoA.r.status(), 'A ve su foto durante la espera').toBe(200);
    expect(fotoA.r.headers()['cache-control']).toBe('private, no-store');
    expect(fotoA.r.headers()['content-type']).toBe('image/webp');

    // Y su reporte en «Mis reportes», con lo que falta para publicarse.
    const propio = await miReporte(autora, primero.id);
    expect(propio).toMatchObject({ estado: 'nuevo', verificado: false, retirado: false });
    expect(propio.fotos).toHaveLength(1);
    expect(propio).not.toHaveProperty('autor_id');
    // Lo que queda de la espera, en segundos: nunca más que la demora.
    expect(propio.segundos_para_publicar as number).toBeLessThanOrEqual(DEMORA_E2E_PRIMERO_S);
  });

  test('pasada la demora, B y el técnico lo ven en 10 s o menos, como «NO SE HA VERIFICADO»', async ({
    page,
    browser,
  }) => {
    const visto = await esperarQueLoVea(vecino, primero);
    tardanzaPrimero = visto - primero.recibidoEn;
    expect(visto, 'no se ve antes de cumplir su demora').toBeGreaterThanOrEqual(
      primero.seguroEnEsperaHasta,
    );

    const f = await (await vecino.get(`${API}/api/v1/reportes/${primero.id}`)).json();
    expect(f.properties).toMatchObject({ estado: 'nuevo', verificado: false });
    expect(f.properties).not.toHaveProperty('autor_id');
    expect(f.properties.fotos).toHaveLength(1);
    expect((await tecnico.get(`${API}/api/v1/tecnico/reportes/${primero.id}`)).status()).toBe(200);

    // La foto ya es pública, cacheable pero revalidada en cada uso.
    const foto = await vecino.get(`${API}${primero.foto}`);
    expect(foto.status()).toBe(200);
    expect(foto.headers()['cache-control']).toBe('public, no-cache');
    expect(foto.headers().etag).toBeTruthy();

    // B, en la app pública: el texto exacto, con su aviso y en la pastilla del mapa.
    const hoja = await detallePublico(page, primero.id);
    await expect(hoja.locator('[data-estado="nuevo"]')).toHaveText(ETIQUETA_PUBLICA.nuevo);
    await expect(hoja.getByTestId('aviso-sin-verificar')).toContainText(ETIQUETA_PUBLICA.nuevo);
    await expect(
      page.getByRole('button', { name: 'Punto de severidad media, no se ha verificado' }),
    ).toBeVisible({ timeout: 30_000 });
    // La leyenda del mapa explica la marca con el mismo texto.
    await page.goto(`${PUBLICA}/`);
    await expect(page.getByTestId('leyenda-mapa')).toContainText(ETIQUETA_PUBLICA.nuevo);

    // El técnico, en el panel: ya es público y lo dice antes de moderarlo.
    const { contexto, pagina } = await panelCon(browser, CREDENCIALES_TECNICO);
    try {
      await pagina.goto(`${PANEL}/reportes/${primero.id}`);
      await expect(pagina.getByTestId('visibilidad-publica')).toHaveText(
        `Visible en el mapa público como ${ETIQUETA_PUBLICA.nuevo}`,
        { timeout: 60_000 },
      );
    } finally {
      await contexto.close();
    }
  });

  test('el 2.º envío del día tarda más en verse', async () => {
    const yo = await (await autora.get(`${API}/api/v1/auth/yo`)).json();
    expect(yo.reportes_restantes_hoy).toBe(REPORTES_POR_DIA - 1);
    expect(yo.demora_proximo_s).toBe(DEMORA_E2E_SIGUIENTES_S);

    segundo = await enviarConFoto(autora, `E2E-DIFERIDA-2-${Date.now()}`);
    expect(segundo.demoraMs).toBe(DEMORA_E2E_SIGUIENTES_S * 1000);
    expect(segundo.demoraMs).toBeGreaterThan(primero.demoraMs);
    expect(segundo.segundos).toBeGreaterThan(0);
    expect(segundo.segundos).toBeLessThanOrEqual(DEMORA_E2E_SIGUIENTES_S);

    const paraB = await durante(segundo, vecino.get(`${API}/api/v1/reportes/${segundo.id}`));
    aTiempo(paraB, 'B (detalle público del 2.º)');
    expect(paraB.r.status(), 'B no ve el 2.º durante su espera').toBe(404);

    const visto = await esperarQueLoVea(vecino, segundo);
    const tardanzaSegundo = visto - segundo.recibidoEn;
    expect(
      tardanzaSegundo,
      `el 2.º tardó ${tardanzaSegundo} ms y el 1.º ${tardanzaPrimero} ms`,
    ).toBeGreaterThan(tardanzaPrimero);
  });

  test('validar lo pasa a «Verificado»', async ({ page }) => {
    const r = await tecnico.patch(`${API}/api/v1/reportes/${primero.id}/estado`, {
      data: { estado: 'validado' },
    });
    expect(r.status(), await r.text()).toBe(200);

    const f = await (await vecino.get(`${API}/api/v1/reportes/${primero.id}`)).json();
    expect(f.properties).toMatchObject({ estado: 'validado', verificado: true });
    expect(await miReporte(autora, primero.id)).toMatchObject({
      estado: 'validado',
      verificado: true,
      retirado: false,
    });

    const hoja = await detallePublico(page, primero.id);
    await expect(hoja.locator('[data-estado="validado"]')).toHaveText(ETIQUETA_PUBLICA.validado);
    await expect(hoja.getByTestId('aviso-sin-verificar')).toHaveCount(0);
    await expect(hoja.getByText(ETIQUETA_PUBLICA.nuevo)).toHaveCount(0);
  });

  test('rechazar lo retira: 404 en el detalle público y en la foto, y la autora lo sigue viendo', async ({
    page,
    browser,
  }) => {
    // Publicada, la foto del 2.º la ve cualquiera, con su ETag.
    const antes = await vecino.get(`${API}${segundo.foto}`);
    expect(antes.status()).toBe(200);
    const etag = antes.headers().etag;
    expect(etag).toBeTruthy();

    const r = await tecnico.patch(`${API}/api/v1/reportes/${segundo.id}/estado`, {
      data: { estado: 'rechazado', estado_motivo: MOTIVO },
    });
    expect(r.status(), await r.text()).toBe(200);

    for (const [quien, contexto] of [
      ['B', vecino],
      ['un anónimo', anonimo],
    ] as const) {
      expect(
        (await contexto.get(`${API}/api/v1/reportes/${segundo.id}`)).status(),
        `${quien}: detalle`,
      ).toBe(404);
      const foto = await contexto.get(`${API}${segundo.foto}`);
      expect(foto.status(), `${quien}: foto`).toBe(404);
      expect(foto.headers()['cache-control'], `${quien}: el 404 no se guarda`).toBe(
        'private, no-store',
      );
    }
    // Aunque la caché del navegador tenga la foto: 404 y no 304.
    const conEtag = await vecino.get(`${API}${segundo.foto}`, {
      headers: { 'if-none-match': etag as string },
    });
    expect(conEtag.status(), 'una foto retirada no se revalida con su ETag').toBe(404);

    // La autora sigue viendo su reporte (retirado) y su foto, solo para ella.
    expect(await miReporte(autora, segundo.id)).toMatchObject({
      estado: 'rechazado',
      retirado: true,
    });
    const suya = await autora.get(`${API}${segundo.foto}`);
    expect(suya.status()).toBe(200);
    expect(suya.headers()['cache-control']).toBe('private, no-store');

    // En la app pública, el detalle dice que ya no está en el mapa.
    await page.goto(`${PUBLICA}/reporte/${segundo.id}`);
    await expect(
      page.getByRole('heading', { name: 'Este reporte no está en el mapa' }),
    ).toBeVisible({ timeout: 30_000 });

    // Y en «Mis reportes» de la autora figura como retirado, no desaparece.
    const contexto = await browser.newContext();
    try {
      const suyaPagina = await contexto.newPage();
      const login = await suyaPagina.request.post(`${PUBLICA}/api/v1/auth/login`, {
        data: credencialesAutora,
      });
      expect(login.status()).toBe(200);
      await suyaPagina.goto(`${PUBLICA}/mis-reportes`);
      await expect(suyaPagina.getByTestId('resumen-mis-reportes')).toBeVisible({
        timeout: 30_000,
      });
      await expect(suyaPagina.locator('[data-estado="rechazado"]')).toHaveText('Retirado del mapa');
      await expect(suyaPagina.locator('[data-estado="validado"]')).toHaveText(
        ETIQUETA_PUBLICA.validado,
      );
    } finally {
      await contexto.close();
    }
  });

  test('un verificado lo retira solo el admin: el técnico recibe 403 y no ve «Retirar del mapa»', async ({
    page,
    browser,
  }) => {
    // API: el técnico no puede pasar un validado a rechazado; el reporte sigue publicado.
    const intento = await tecnico.patch(`${API}/api/v1/reportes/${primero.id}/estado`, {
      data: { estado: 'rechazado', estado_motivo: MOTIVO },
    });
    expect(intento.status(), await intento.text()).toBe(403);
    expect((await intento.json()).codigo).toBe('SIN_PERMISO');
    expect((await vecino.get(`${API}/api/v1/reportes/${primero.id}`)).status()).toBe(200);

    // Panel: el técnico no ve el botón.
    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
    await page.goto(`${PANEL}/reportes/${primero.id}`);
    await expect(page.getByTestId('estado-actual')).toContainText('Validado', { timeout: 60_000 });
    await expect(page.getByTestId('visibilidad-publica')).toHaveText(
      `Visible en el mapa público como ${ETIQUETA_PUBLICA.validado}`,
    );
    await expect(page.getByTestId('boton-retirar')).toHaveCount(0);

    // El admin sí: «Retirar del mapa» con motivo obligatorio.
    const { contexto, pagina } = await panelCon(browser, CREDENCIALES_ADMIN);
    try {
      await pagina.goto(`${PANEL}/reportes/${primero.id}`);
      const retirar = pagina.getByTestId('boton-retirar');
      await expect(retirar).toBeVisible({ timeout: 60_000 });
      await expect(retirar).toHaveText('Retirar del mapa');
      await retirar.click();
      await pagina.locator('#motivo').fill('Foto inapropiada (prueba E2E).');
      const respuesta = pagina.waitForResponse(
        (res) =>
          res.request().method() === 'PATCH' &&
          res.url().includes(`/reportes/${primero.id}/estado`),
      );
      await pagina.getByTestId('confirmar-accion').click();
      expect((await respuesta).status()).toBe(200);
      await expect(pagina.getByTestId('estado-actual')).toContainText('Rechazado');
      await expect(pagina.getByTestId('visibilidad-publica')).toHaveText(
        'No se ve en el mapa público: está rechazado',
      );
    } finally {
      await contexto.close();
    }

    // Fuera del mapa: detalle y foto.
    expect((await vecino.get(`${API}/api/v1/reportes/${primero.id}`)).status()).toBe(404);
    expect((await vecino.get(`${API}${primero.foto}`)).status()).toBe(404);
    expect(await miReporte(autora, primero.id)).toMatchObject({ retirado: true });
  });
});
