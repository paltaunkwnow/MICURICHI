import { expect, test } from '@playwright/test';
import { CREDENCIALES_TECNICO, crearCuentaYEntrarPorUi, esperarPila, PANEL } from './ayudas';

/**
 * Qué ve una persona cuando algo falla.
 *
 * La Fase 5 encontró que la app **inventaba** en los tres sitios donde más duele: con api-core
 * caído el mapa decía «Todavía nadie reportó en esta zona», «Mis reportes» pintaba todo como «en
 * revisión» y `/mis-reportes/<lo-que-sea>` dibujaba la línea de tiempo de un reporte que no
 * existe. Los tres eran afirmaciones sobre el mundo hechas a partir de un fallo de red.
 *
 * Los fallos se simulan interceptando la petición en el navegador y no parando servicios: así la
 * suite no depende de poder manejar contenedores ni deja la pila a medias si un test falla.
 */
test.describe('la interfaz no inventa cuando la API falla', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('el mapa dice que no pudo cargar, y no que el barrio esté limpio', async ({ page }) => {
    await page.route('**/api/v1/reportes?*', (ruta) =>
      ruta.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno.' }),
      }),
    );
    await page.goto('/');

    const aviso = page.getByTestId('error-reportes').first();
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('No pudimos cargar los reportes');
    await expect(page.getByText('Todavía nadie reportó en esta zona')).toHaveCount(0);

    // Y al volver la API, el botón recupera la vista sin recargar ni perder el mapa. Se
    // reintenta el conjunto porque el aviso puede desaparecer entre el clic y la comprobación:
    // lo que importa es que la vista se recupere sin recargar la página.
    await page.unroute('**/api/v1/reportes?*');
    await expect(async () => {
      const boton = page.getByTestId('error-reportes').first().getByRole('button', {
        name: 'Reintentar',
      });
      if (await boton.count()) await boton.click({ timeout: 5000 });
      await expect(page.getByTestId('error-reportes')).toHaveCount(0);
    }).toPass({ timeout: 30_000 });
  });

  test('«Mis reportes» separa «en revisión» de «no pudimos preguntar»', async ({ page }) => {
    await page.goto('/');
    // Un reporte recordado por este dispositivo, como lo deja el formulario tras enviar.
    await page.evaluate(() => {
      localStorage.setItem(
        'curichi.mis-reportes.v1',
        JSON.stringify([
          {
            id: '00000000-0000-4000-8000-0000000000aa',
            enviado_en: new Date().toISOString(),
            titulo: 'Punto de prueba',
            unidad_vecinal: 'UV-105',
            distrito: 'D02',
            severidad: 'alta',
            tiene_foto: false,
          },
        ]),
      );
    });
    await page.route('**/api/v1/reportes/**', (ruta) =>
      ruta.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno.' }),
      }),
    );

    await page.goto('/mis-reportes');
    await expect(page.getByTestId('error-mis-reportes')).toBeVisible();
    await expect(page.getByText('Estado desconocido')).toBeVisible();
    await expect(page.getByText('esperando revisión')).toHaveCount(0);
  });

  test('un código de seguimiento que nadie reconoce no se dibuja como reporte propio', async ({
    page,
  }) => {
    await page.goto('/mis-reportes/00000000-0000-4000-8000-0000000000bb');
    await expect(page.getByTestId('seguimiento-desconocido')).toBeVisible();
    await expect(page.getByText('No encontramos ese reporte')).toBeVisible();
    // Lo que NO puede pasar: dibujar la línea de tiempo, que afirma que el reporte existe y
    // que está esperando revisión. (Se busca un hito y no «Lo enviaste», porque ese texto
    // aparece también dentro del propio aviso: "Si lo enviaste desde otro teléfono…".)
    await expect(page.getByText('Un técnico lo revisó')).toHaveCount(0);
    await expect(page.locator('main ol')).toHaveCount(0);
  });
});

test.describe('el formulario no pierde lo escrito', () => {
  test('al recargar, retoma el borrador en el paso donde iba', async ({ page }) => {
    // Reportar exige cuenta desde la Fase 5, así que el formulario ni se monta sin sesión. Una
    // cuenta nueva por caso: cada una solo puede enviar un reporte por hora y compartir la del
    // seed haría que el resultado dependiera del orden en que corrieron los tests.
    await crearCuentaYEntrarPorUi(page, '/reportar');
    await page.waitForURL('**/reportar');

    // Paso 1: el punto es el centro del mapa; se espera a que la unidad vecinal resuelva.
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('boton-siguiente').click();

    // Paso 2: dos respuestas, suficientes para que haya algo que perder.
    await page.locator('input[name="tirante_estimado"][value="rodilla"]').check();
    await page.locator('input[name="duracion_estimada"][value="2h_12h"]').check();

    await page.reload();

    await expect(page.getByTestId('borrador-retomado')).toBeVisible();
    // `.pno` es el rótulo del paso; hay otro igual solo para lectores de pantalla.
    await expect(page.locator('p.pno')).toHaveText('Paso 2 de 5');
    await expect(page.locator('input[name="tirante_estimado"][value="rodilla"]')).toBeChecked();

    // Y se puede descartar a propósito, que es la otra mitad del trato.
    await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    await expect(page.locator('p.pno')).toHaveText('Paso 1 de 5');
  });
});

test.describe('el panel avisa cuando la sesión caduca', () => {
  /**
   * Regresión: entrar al panel sin sesión mandaba a `/login?caducada=1` y decía «tu sesión
   * caducó por inactividad» a alguien que nunca había iniciado sesión. El 401 de `GET /auth/yo`
   * es la respuesta normal a «¿hay sesión?», no una caducidad.
   */
  test('una primera visita sin sesión va al login sin hablar de caducidad', async ({ browser }) => {
    // Contexto nuevo: sin ninguna cookie de las pruebas anteriores.
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();
    try {
      await pagina.goto(`${PANEL}/`);
      await expect(pagina).toHaveURL(/\/login$/);
      await expect(pagina.getByTestId('sesion-caducada')).toHaveCount(0);
    } finally {
      await contexto.close();
    }
  });

  test('un 401 a mitad de trabajo lleva al login explicando por qué', async ({ page }) => {
    await page.goto(`${PANEL}/login`);
    await page.getByLabel('Email').fill(CREDENCIALES_TECNICO.email);
    await page.getByLabel('Contraseña').fill(CREDENCIALES_TECNICO.password);
    await page.getByTestId('boton-login').click();
    await expect(page).toHaveURL(/\/reportes$/);
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();

    // A partir de acá, api-core contesta 401: es lo que pasa cuando vence SESION_IDLE_HORAS.
    // El patrón cubre `/api/v1/tecnico/reportes`, que es por donde lee el panel desde que la
    // vista técnica dejó de vivir en la ruta pública (auditoría de seguridad): la técnica exige
    // rol y responde 401 sin sesión, en vez de degradar en silencio a la vista pública.
    await page.route('**/api/v1/**reportes**', (ruta) =>
      ruta.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ codigo: 'NO_AUTORIZADO', mensaje: 'Sesión no válida.' }),
      }),
    );
    await page.reload();

    await expect(page).toHaveURL(/\/login\?caducada=1$/);
    await expect(page.getByTestId('sesion-caducada')).toContainText('Tu sesión caducó');
  });
});
