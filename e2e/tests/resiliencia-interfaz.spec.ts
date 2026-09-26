import { expect, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  CREDENCIALES_TECNICO,
  crearCuentaYEntrarPorUi,
  cuentaNuevaEnElNavegador,
  elegirPuntoPorCoordenadas,
  esperarMapaDelPaso1,
  esperarPila,
  llegarAFotos,
  numeroDePaso,
  PANEL,
  PNG_1X1,
  pasoActual,
} from './ayudas';

/** Una foto cualquiera para el input de la galería. */
const FOTO = { name: 'charco.png', mimeType: 'image/png', buffer: PNG_1X1 };

/** Respuesta de error de api-core, con la forma `{ codigo, mensaje }` de todas sus rutas. */
function errorApi(status: number, codigo: string, mensaje: string, extra: object = {}) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ codigo, mensaje, ...extra }),
  };
}

/** Hasta el paso de fotos con una descripción escrita, que es lo que no se puede perder. */
async function formularioEnFotos(page: Page, marca: string) {
  await cuentaNuevaEnElNavegador(page, marca);
  await abrirFormulario(page);
  await elegirPuntoPorCoordenadas(page);
  await llegarAFotos(page);
  const texto = `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}${Date.now()}`;
  await page.locator('textarea[name="descripcion"]').fill(texto);
  return texto;
}

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
  test('CA-X1: al recargar, retoma el borrador en el paso donde iba', async ({ page }) => {
    // Reportar exige cuenta desde la Fase 5, así que el formulario ni se monta sin sesión. Una
    // cuenta nueva por caso: cada una solo puede enviar un reporte por hora y compartir la del
    // seed haría que el resultado dependiera del orden en que corrieron los tests.
    await crearCuentaYEntrarPorUi(page, '/reportar');
    await page.waitForURL('**/reportar');

    // Paso 1: el centro del mapa ya NO es la ubicación al cargar; el punto lo elige la persona.
    await esperarMapaDelPaso1(page);
    await expect(page.getByTestId('boton-siguiente')).toBeDisabled();
    await elegirPuntoPorCoordenadas(page);
    await page.getByTestId('boton-siguiente').click();
    await expect.poll(() => numeroDePaso(page)).toBe(2);

    // Paso 2: profundidad y frecuencia, suficiente para que haya algo que perder. Duración y
    // afectación ya no existen (severidad v2).
    await page.locator('input[name="profundidad_estimada"][value="rodilla"]').check();
    await page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check();
    const { m: total } = await pasoActual(page);

    await page.reload();

    await expect(page.getByTestId('borrador-retomado')).toBeVisible();
    // El total de pasos no puede cambiar a mitad del recorrido.
    expect(await pasoActual(page)).toEqual({ n: 2, m: total });
    await expect(page.locator('input[name="profundidad_estimada"][value="rodilla"]')).toBeChecked();
    await expect(
      page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]'),
    ).toBeChecked();

    // Y se puede descartar a propósito, que es la otra mitad del trato: vuelve al paso 1 sin
    // punto elegido.
    await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    await expect.poll(() => numeroDePaso(page)).toBe(1);
    expect((await pasoActual(page)).m).toBe(total);
    await expect(page.getByTestId('ubicacion-pendiente')).toBeVisible();
  });

  test('si la sesión vence al subir una foto, dice «Se cerró tu sesión» y lo escrito sigue', async ({
    page,
  }) => {
    const texto = await formularioEnFotos(page, 'foto-401-');
    // api-core responde 401 a la subida: la sesión venció mientras se elegía la foto.
    await page.route('**/api/v1/fotos', (ruta) =>
      ruta.fulfill(errorApi(401, 'SIN_SESION', 'Iniciá sesión para subir una foto.')),
    );
    await page.locator('#fotos').setInputFiles(FOTO);

    await expect(page.getByRole('heading', { name: 'Se cerró tu sesión' })).toBeVisible();
    await expect(
      page.getByText('Lo que hayas completado se guarda en este dispositivo'),
    ).toBeVisible();

    // La sesión de verdad sigue viva (el 401 era simulado): al volver, el formulario retoma el
    // paso de fotos con lo escrito.
    await page.unroute('**/api/v1/fotos');
    await page.reload();
    await expect(page.getByTestId('borrador-retomado')).toBeVisible();
    await expect.poll(() => numeroDePaso(page)).toBe(3);
    await expect(page.locator('textarea[name="descripcion"]')).toHaveValue(texto);
  });

  test('si se acabó el cupo de fotos, muestra el mensaje del servidor y no pierde nada', async ({
    page,
  }) => {
    const texto = await formularioEnFotos(page, 'foto-429-');
    const miniaturas = page.getByRole('img', { name: 'Foto que subiste' });
    await page.locator('#fotos').setInputFiles(FOTO);
    await expect(miniaturas).toHaveCount(1);

    // El texto es inventado a propósito: tiene que verse el del servidor, no uno genérico.
    const mensaje =
      'Llegaste al máximo de fotos por hora (prueba E2E). Vas a poder subir otra en 37 minutos.';
    await page.route('**/api/v1/fotos', (ruta) =>
      ruta.fulfill(
        errorApi(429, 'CUOTA_DE_FOTOS', mensaje, {
          detalles: { disponible_en: new Date(Date.now() + 37 * 60_000).toISOString() },
        }),
      ),
    );
    await page.locator('#fotos').setInputFiles({ ...FOTO, name: 'otra.png' });

    await expect(page.getByTestId('error-foto')).toContainText(mensaje);
    // Nada de lo ya cargado se pierde, y se puede seguir sin esa foto.
    await expect(miniaturas).toHaveCount(1);
    await expect(page.locator('textarea[name="descripcion"]')).toHaveValue(texto);
    expect(await numeroDePaso(page)).toBe(3);
    await expect(page.getByRole('heading', { name: 'Se cerró tu sesión' })).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();
  });
});

test.describe('no saber si hay sesión no es «no tenés cuenta»', () => {
  test('con /auth/yo caído, el formulario y la cuenta lo dicen y se recuperan al reintentar', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/yo', (ruta) =>
      ruta.fulfill(
        errorApi(
          503,
          'NO_DISPONIBLE',
          'El servicio está saturado. Probá de nuevo en unos segundos.',
        ),
      ),
    );

    await page.goto('/reportar');
    const aviso = page.getByTestId('error-sesion');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('No pudimos cargar tu sesión');
    // Lo que NO puede pasar: mandar a crear una cuenta a quien quizá ya la tiene.
    await expect(page.getByRole('heading', { name: 'Necesitás una cuenta' })).toHaveCount(0);
    // La barra de arriba tampoco afirma nada: ni «Iniciar sesión» ni un nombre.
    await expect(
      page.locator('header.topnav').getByRole('link', { name: 'Iniciar sesión' }),
    ).toHaveCount(0);

    await page.goto('/cuenta');
    await expect(page.getByTestId('error-sesion')).toBeVisible();
    await expect(page.getByText('Todavía no iniciaste sesión')).toHaveCount(0);

    // Vuelve el servicio: «Reintentar» resuelve sin recargar. Sin cookie, ahora sí es «sin sesión».
    await page.unroute('**/api/v1/auth/yo');
    await page.getByTestId('error-sesion').getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('error-sesion')).toHaveCount(0);
    await expect(page.getByText('Todavía no iniciaste sesión')).toBeVisible();
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
