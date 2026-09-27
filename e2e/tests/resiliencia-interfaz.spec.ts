import { expect, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  botonCompartirUbicacion,
  CREDENCIALES_TECNICO,
  compartirUbicacion,
  crearCuentaYEntrarPorUi,
  cuentaNuevaEnElNavegador,
  esperarPila,
  GPS_EN_EL_CENTRO,
  llegarAFotos,
  mapaDelPaso1,
  numeroDePaso,
  PANEL,
  pasoActual,
  sacarFotoConLaCamara,
} from './ayudas';

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
  await compartirUbicacion(page);
  await llegarAFotos(page);
  const texto = `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}${Date.now()}`;
  await page.locator('textarea[name="descripcion"]').fill(texto);
  return texto;
}

/**
 * Un borrador retomado vuelve al paso 1 a pedir la ubicación, que no se guarda con él (plan
 * 2026-09-26, pedido E). Se comparte otra vez y «Continuar» lleva al paso donde se había quedado.
 */
async function retomarConLaUbicacion(page: Page, pasoGuardado: number) {
  await expect(page.getByTestId('borrador-retomado')).toContainText(
    'volvé a compartir tu ubicación: no la guardamos',
  );
  expect(await numeroDePaso(page)).toBe(1);
  await compartirUbicacion(page);
  await page.getByTestId('boton-siguiente').click();
  await expect.poll(() => numeroDePaso(page)).toBe(pasoGuardado);
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

  test('«Mis reportes» dice que no pudo preguntar, y no que la cuenta no tenga reportes', async ({
    page,
  }) => {
    // La lista sale de la cuenta (`GET /api/v1/mis-reportes`), no del navegador: hace falta sesión.
    await cuentaNuevaEnElNavegador(page, 'mis-500-');
    await page.route('**/api/v1/mis-reportes', (ruta) =>
      ruta.fulfill(errorApi(500, 'ERROR_INTERNO', 'Error interno.')),
    );

    await page.goto('/mis-reportes');
    const aviso = page.getByTestId('error-mis-reportes');
    await expect(aviso).toBeVisible();
    // Lo que NO puede pasar: afirmar que la cuenta no envió nada, ni pedirle que entre.
    await expect(page.getByTestId('mis-reportes-vacio')).toHaveCount(0);
    await expect(page.getByText('Todavía no enviaste ninguno')).toHaveCount(0);
    await expect(page.getByTestId('acceso-mis-reportes')).toHaveCount(0);

    // Vuelve la API: «Reintentar» trae la lista (vacía: la cuenta es nueva) sin recargar.
    await page.unroute('**/api/v1/mis-reportes');
    await aviso.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('mis-reportes-vacio')).toBeVisible();
    await expect(page.getByTestId('error-mis-reportes')).toHaveCount(0);
  });

  test('un código de seguimiento que no es de la cuenta no se dibuja como reporte propio', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'seguimiento-');
    await page.goto('/mis-reportes/00000000-0000-4000-8000-0000000000bb');
    await expect(page.getByTestId('seguimiento-desconocido')).toBeVisible();
    await expect(page.getByText('No encontramos ese reporte')).toBeVisible();
    // Lo que NO puede pasar: dibujar la línea de tiempo, que afirma que el reporte existe y
    // que está esperando revisión. (Se busca un hito y no «Lo enviaste», porque ese texto
    // aparece también dentro del propio aviso: "Si lo enviaste con otra cuenta…".)
    await expect(page.getByText('Un técnico lo revisó')).toHaveCount(0);
    await expect(page.locator('main ol')).toHaveCount(0);
  });
});

test.describe('el formulario no pierde lo escrito', () => {
  // Pruebas del formulario de reporte: las fotos salen de la cámara dentro de la página (la falsa
  // de Chromium, ver playwright.config.ts) y reportar exige compartir la ubicación (el GPS
  // simulado en PUNTO_CENTRO con 10 m de precisión). Los dos permisos son solo de ellas.
  test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['camera', 'geolocation'] });

  test('CA-X1: al recargar, retoma el borrador en el paso donde iba', async ({ page }) => {
    // Reportar exige cuenta desde la Fase 5, así que el formulario ni se monta sin sesión. Una
    // cuenta nueva por caso: cada una puede enviar 3 reportes por día y compartir la del seed
    // haría que el resultado dependiera del orden en que corrieron los tests.
    await crearCuentaYEntrarPorUi(page, '/reportar');
    await page.waitForURL('**/reportar');

    // Paso 1: sin la ubicación compartida no hay mapa ni «Continuar»; al compartirla, el punto
    // queda en la del teléfono.
    await expect(botonCompartirUbicacion(page)).toBeVisible();
    await expect(page.getByTestId('boton-siguiente')).toHaveCount(0);
    await compartirUbicacion(page);
    await page.getByTestId('boton-siguiente').click();
    await expect.poll(() => numeroDePaso(page)).toBe(2);

    // Paso 2: profundidad y frecuencia, suficiente para que haya algo que perder. Duración y
    // afectación ya no existen (severidad v2).
    await page.locator('input[name="profundidad_estimada"][value="rodilla"]').check();
    await page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check();
    const { m: total } = await pasoActual(page);

    await page.reload();

    // La posición del teléfono no viaja con el borrador: se vuelve a pedir y se sigue en el paso 2.
    await retomarConLaUbicacion(page, 2);
    // El total de pasos no puede cambiar a mitad del recorrido.
    expect(await pasoActual(page)).toEqual({ n: 2, m: total });
    await expect(page.locator('input[name="profundidad_estimada"][value="rodilla"]')).toBeChecked();
    await expect(
      page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]'),
    ).toBeChecked();

    // Y se puede descartar a propósito, que es la otra mitad del trato: vuelve al paso 1 con lo
    // elegido olvidado. La ubicación ya compartida no se vuelve a pedir: el punto vuelve a la del
    // teléfono.
    await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    await expect.poll(() => numeroDePaso(page)).toBe(1);
    expect((await pasoActual(page)).m).toBe(total);
    await expect(mapaDelPaso1(page)).toBeVisible();
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(
      'El punto está justo donde estás.',
    );
    await page.getByTestId('boton-siguiente').click();
    await expect(page.locator('input[name="profundidad_estimada"]:checked')).toHaveCount(0);
  });

  test('si la sesión vence al subir una foto, dice «Se cerró tu sesión» y lo escrito sigue', async ({
    page,
  }) => {
    const texto = await formularioEnFotos(page, 'foto-401-');
    // api-core responde 401 a la subida: la sesión venció mientras se sacaba la foto.
    await page.route('**/api/v1/fotos', (ruta) =>
      ruta.fulfill(errorApi(401, 'SIN_SESION', 'Iniciá sesión para subir una foto.')),
    );
    await sacarFotoConLaCamara(page);

    await expect(page.getByRole('heading', { name: 'Se cerró tu sesión' })).toBeVisible();
    await expect(
      page.getByText('Lo que hayas completado se guarda en este dispositivo'),
    ).toBeVisible();

    // La sesión de verdad sigue viva (el 401 era simulado): al volver, el formulario retoma el
    // paso de fotos con lo escrito, después de volver a compartir la ubicación.
    await page.unroute('**/api/v1/fotos');
    await page.reload();
    await retomarConLaUbicacion(page, 3);
    await expect(page.locator('textarea[name="descripcion"]')).toHaveValue(texto);
  });

  test('si se acabó el cupo de fotos, muestra el mensaje del servidor y no pierde nada', async ({
    page,
  }) => {
    const texto = await formularioEnFotos(page, 'foto-429-');
    const miniaturas = page.getByRole('img', { name: 'Foto que sacaste' });
    await sacarFotoConLaCamara(page);
    await expect(miniaturas).toHaveCount(1);

    // El texto es inventado a propósito: tiene que verse el del servidor, no uno genérico.
    const mensaje =
      'Llegaste al máximo de fotos de hoy (prueba E2E). Vas a poder subir otra en 37 minutos.';
    await page.route('**/api/v1/fotos', (ruta) =>
      ruta.fulfill(
        errorApi(429, 'CUOTA_DE_FOTOS', mensaje, {
          detalles: { disponible_en: new Date(Date.now() + 37 * 60_000).toISOString() },
        }),
      ),
    );
    await sacarFotoConLaCamara(page);

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
