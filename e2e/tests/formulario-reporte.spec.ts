import { expect, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  compartirUbicacion,
  continuar,
  cuentaNuevaEnElNavegador,
  desplazar,
  elegirPuntoPorCoordenadas,
  enviarYLeerCuerpo,
  esperarMapaDelPaso1,
  esperarPila,
  GPS_EN_EL_CENTRO,
  llegarARevision,
  mapaDelPaso1,
  numeroDePaso,
  PRECISION_GPS_M,
  PUBLICA,
  PUNTO_AJUSTADO,
  PUNTO_CENTRO,
  RADIO_DISPOSITIVO_M,
  reporteValido,
  responderPaso2,
  retenerPeticiones,
  textoDistancia,
} from './ayudas';

/**
 * El formulario de reporte de la app pública, paso por paso, contra la pila real.
 *
 * Paso 1 (plan 2026-09-26, pedido E): sin la posición del teléfono no hay mapa; al compartirla, el
 * punto arranca en ella y se ajusta dentro de un círculo de 60 m, se conserva al ir y volver, y
 * si el teléfono se movió antes de enviar se vuelve a ajustar. El envío lleva la posición aparte
 * (`dispositivo`) y ya no manda método ni precisión. Además: la fecha del evento se valida en su
 * campo, y el aviso de turno aparece en cuanto el turno se gasta, sin recargar.
 *
 * El teléfono es el GPS simulado de Chromium en PUNTO_CENTRO con 10 m de precisión, con el
 * permiso dado (`GPS_EN_EL_CENTRO`). Los casos sin permiso, con mala precisión y el POST directo
 * fuera del radio están en `ubicacion-obligatoria.spec.ts`.
 *
 * La sesión se pone por API (`cuentaNuevaEnElNavegador`): una cuenta nueva por caso, porque cada
 * cuenta solo puede enviar un reporte por hora.
 */

test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

/** Pasos del formulario: el último es la revisión, con «Enviar reporte». */
const PASOS = 4;

/** Marca que se pierde si la página se recarga: para afirmar que algo pasó «sin recargar». */
async function marcarPagina(page: Page) {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__e2eSinRecargar = true;
  });
}

async function sigueSinRecargar(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__e2eSinRecargar === true,
  );
}

/** `AAAA-MM-DD` de hoy + `dias`, en la zona horaria del NAVEGADOR (la que usa el formulario). */
function diaEnElNavegador(page: Page, dias: number): Promise<string> {
  return page.evaluate((d) => {
    const f = new Date(Date.now() + d * 86_400_000);
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
  }, dias);
}

/** Rótulo del aviso de turno de arriba del formulario (el de `error-envio` es una frase más larga). */
const AVISO_TURNO = 'Ya enviaste un reporte hace poco';

test.beforeAll(async ({ request }) => {
  await esperarPila(request);
});

test.describe('paso 1: el punto, a 60 m o menos del teléfono', () => {
  test('al abrir no hay mapa ni «Continuar»: primero se comparte la ubicación, y el punto arranca en el teléfono', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'abrir-');
    await abrirFormulario(page);
    await expect(
      page.getByText('Usamos tu ubicación solo para comprobarlo: no la guardamos ni la ve nadie.'),
    ).toBeVisible();
    await expect(mapaDelPaso1(page)).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toHaveCount(0);

    await compartirUbicacion(page);
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(
      'El punto está justo donde estás.',
    );
    await expect(page.getByTestId('ayuda-circulo')).toContainText(
      `El círculo marca ${RADIO_DISPOSITIVO_M} m alrededor de tu ubicación (precisión de ${PRECISION_GPS_M} m)`,
    );
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();
  });

  test('volver al paso 1 conserva el punto ajustado, y es ese el que se envía, con el teléfono aparte', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'vuelta-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page, PUNTO_AJUSTADO);
    const lugar = await page.getByTestId('ubicacion-resuelta').locator('b').innerText();

    await continuar(page);
    await page.getByRole('button', { name: 'Volver al paso anterior' }).click();
    await expect.poll(() => numeroDePaso(page)).toBe(1);
    // El mapa del paso 1 se vuelve a crear al entrar: se espera a que cargue, que es cuando
    // antes pisaba el punto con el centro por defecto. La ubicación no se vuelve a pedir.
    await esperarMapaDelPaso1(page);
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(textoDistancia(PUNTO_AJUSTADO));
    await expect(page.getByTestId('ubicacion-resuelta').locator('b')).toHaveText(lugar);
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();

    await llegarARevision(page, `E2E-vuelta-${Date.now()}`);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.lat).toBeCloseTo(PUNTO_AJUSTADO.lat, 7);
    expect(cuerpo.lon).toBeCloseTo(PUNTO_AJUSTADO.lon, 7);
    expect(cuerpo.dispositivo).toMatchObject({
      lat: PUNTO_CENTRO.lat,
      lon: PUNTO_CENTRO.lon,
      precision_m: PRECISION_GPS_M,
    });
    // El método y la precisión ya no los manda la app: los deriva el servidor (contracts 0.9.0).
    expect(cuerpo).not.toHaveProperty('ubicacion_metodo');
    expect(cuerpo).not.toHaveProperty('precision_gps_m');
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });

  test('mover el punto vuelve a preguntar la unidad vecinal y «Continuar» espera la respuesta', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'mover-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    const siguiente = page.getByTestId('boton-siguiente');
    await expect(siguiente).toBeEnabled();

    // La respuesta del punto nuevo se retiene para poder mirar el estado intermedio.
    const resolver = await retenerPeticiones(page, '**/geo/v1/resolver');
    await page.getByRole('button', { name: 'Mover el punto 5 m al norte' }).click();

    await resolver.llegada;
    await expect(page.getByTestId('ubicacion-pendiente')).toContainText(
      'Buscando la unidad vecinal',
    );
    await expect(page.getByTestId('ubicacion-resuelta')).toHaveCount(0);
    await expect(siguiente).toBeDisabled();

    resolver.liberar();
    await expect(page.getByTestId('distancia-al-punto')).toHaveText('Ese punto está a 5 m de vos.');
    await expect(siguiente).toBeEnabled();
  });

  test('abrir el formulario, compartir la ubicación y salir no deja un borrador para retomar', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'salir-');
    await abrirFormulario(page);
    // El punto que pone la app en la posición del teléfono no es algo empezado.
    await compartirUbicacion(page);
    await page.getByRole('link', { name: 'Salir del reporte' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/');

    await abrirFormulario(page);
    // Compartir exige la página hidratada: para entonces, un borrador ya se habría retomado.
    await compartirUbicacion(page);
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    expect(await numeroDePaso(page)).toBe(1);
  });

  test('«Me pasa a mí»: el punto del enlace sirve de partida si queda cerca, y no cuenta como algo empezado', async ({
    page,
  }) => {
    const enlace = desplazar(PUNTO_CENTRO, { norteM: -30 });
    await cuentaNuevaEnElNavegador(page, 'enlace-');
    await abrirFormulario(page, `/reportar?lat=${enlace.lat}&lon=${enlace.lon}`);
    await compartirUbicacion(page);
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(
      'Ese punto está a 30 m de vos.',
    );
    await expect(page.getByTestId('aviso-ubicacion')).toHaveCount(0);
    await page.getByRole('link', { name: 'Salir del reporte' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/');

    await abrirFormulario(page);
    await compartirUbicacion(page);
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(
      'El punto está justo donde estás.',
    );
  });

  test('«Me pasa a mí» de un punto lejano: el punto va a la posición del teléfono y lo dice', async ({
    page,
  }) => {
    const enlace = desplazar(PUNTO_CENTRO, { norteM: -200 });
    await cuentaNuevaEnElNavegador(page, 'enlace-lejos-');
    await abrirFormulario(page, `/reportar?lat=${enlace.lat}&lon=${enlace.lon}`);
    await compartirUbicacion(page);
    await expect(page.getByTestId('aviso-ubicacion')).toContainText(
      `El punto del enlace queda a 200 m de vos, y solo se puede reportar a ${RADIO_DISPOSITIVO_M} m o menos de donde estás.`,
    );
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(
      'El punto está justo donde estás.',
    );
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();
  });

  test('si el teléfono se movió más de 60 m antes de enviar, vuelve al paso 1 a ajustar el punto', async ({
    page,
    context,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'movido-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    await llegarARevision(page, `E2E-movido-${Date.now()}`);

    // Al enviar se relee la posición: el teléfono ya está 70 m más al norte.
    const nuevo = desplazar(PUNTO_CENTRO, { norteM: 70 });
    await context.setGeolocation({
      ...GPS_EN_EL_CENTRO,
      latitude: nuevo.lat,
      longitude: nuevo.lon,
    });
    const envios: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes')
        envios.push(r.url());
    });
    await page.getByTestId('boton-enviar').click();

    await expect.poll(() => numeroDePaso(page)).toBe(1);
    await expect(page.getByTestId('error-ubicacion')).toHaveText(
      `Te moviste 70 m: ajustá el punto para que quede a ${RADIO_DISPOSITIVO_M} m o menos de donde estás.`,
    );
    await expect(page.getByTestId('boton-siguiente')).toBeDisabled();
    expect(envios, 'no se envió un punto que el servidor iba a rechazar').toEqual([]);

    // El círculo ya está en la posición nueva: el punto se lleva hasta ahí y se vuelve a la
    // revisión, que es donde se había quedado.
    await page.getByRole('button', { name: 'Poner el punto en mi ubicación' }).click();
    await expect(page.getByTestId('distancia-al-punto')).toHaveText(
      'El punto está justo donde estás.',
    );
    await page.getByTestId('boton-siguiente').click();
    await expect.poll(() => numeroDePaso(page)).toBe(PASOS);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.lat).toBeCloseTo(nuevo.lat, 7);
    expect(cuerpo.dispositivo).toMatchObject({ lat: nuevo.lat, lon: nuevo.lon });
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });
});

test.describe('paso 2: la fecha del evento', () => {
  test('una fecha futura o de hace más de un año se marca en su campo y no deja continuar', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'fecha-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    await continuar(page);
    await responderPaso2(page);

    const siguiente = page.getByTestId('boton-siguiente');
    const fecha = page.locator('#evento');
    const error = page.getByTestId('error-campo-evento_en');
    await expect(siguiente).toBeEnabled();

    await fecha.fill(await diaEnElNavegador(page, 3));
    await expect(error).toContainText('no puede ser posterior a hoy');
    await expect(fecha).toHaveAttribute('aria-invalid', 'true');
    await expect(siguiente).toBeDisabled();

    await fecha.fill(await diaEnElNavegador(page, -400));
    await expect(error).toContainText('dentro del último año');
    await expect(siguiente).toBeDisabled();

    // Ayer es válido: el error se va y se puede seguir.
    await fecha.fill(await diaEnElNavegador(page, -1));
    await expect(error).toHaveCount(0);
    await expect(siguiente).toBeEnabled();
  });
});

test.describe('después de enviar: el turno de la cuenta', () => {
  test('tras un envío aceptado, «Ya enviaste…» aparece sin recargar la página', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'turno-');
    await abrirFormulario(page);
    await expect(page.getByText(AVISO_TURNO, { exact: true })).toHaveCount(0);
    await compartirUbicacion(page);
    await llegarARevision(page, `E2E-turno-${Date.now()}`);
    await enviarYLeerCuerpo(page);
    const creado = page.getByTestId('reporte-creado');
    await expect(creado).toBeVisible();

    // Navegación dentro de la app (enlaces), sin recargar: la sesión en caché tiene que saber ya
    // que el turno se gastó. Antes lo sabía recién cinco minutos después.
    await marcarPagina(page);
    await creado.getByRole('link', { name: 'Volver al mapa' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/');
    await page.locator('header.topnav').getByRole('link', { name: 'Reportar un punto' }).click();
    await page.waitForURL('**/reportar');
    await expect(page.getByText(AVISO_TURNO, { exact: true })).toBeVisible();
    expect(await sigueSinRecargar(page), 'la página no se tiene que haber recargado').toBe(true);
  });

  test('si el turno ya se gastó en otro lado, el 429 lo dice y «Ya enviaste…» aparece sin recargar', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'cuota-ui-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    await llegarARevision(page, `E2E-cuota-ui-${Date.now()}`);

    // La misma cuenta envía desde otro sitio (otra pestaña, otro teléfono) DESPUÉS de que esta
    // pantalla preguntara por la sesión: aquí todavía no hay aviso.
    const otro = await page.request.post(`${PUBLICA}/api/v1/reportes`, {
      data: reporteValido(`E2E-cuota-otro-${Date.now()}`),
    });
    expect(otro.status(), await otro.text()).toBe(201);
    await expect(page.getByText(AVISO_TURNO, { exact: true })).toHaveCount(0);

    await marcarPagina(page);
    const respuesta = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
    );
    await page.getByTestId('boton-enviar').click();
    expect((await respuesta).status()).toBe(429);

    // El texto del servidor, que dice cuánto falta, y no un «probá de nuevo».
    await expect(page.getByTestId('error-envio')).toContainText(
      'Ya enviaste un reporte hace poco. Vas a poder enviar otro en',
    );
    await expect(page.getByText(AVISO_TURNO, { exact: true })).toBeVisible();
    await expect(page.getByTestId('reporte-creado')).toHaveCount(0);
    expect(await sigueSinRecargar(page), 'la página no se tiene que haber recargado').toBe(true);
  });
});
