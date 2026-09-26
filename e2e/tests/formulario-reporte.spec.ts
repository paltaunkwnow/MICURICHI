import { expect, type Page, test } from '@playwright/test';
import {
  abrirFormulario,
  continuar,
  cuentaNuevaEnElNavegador,
  elegirPuntoPorCoordenadas,
  enviarYLeerCuerpo,
  esperarMapaDelPaso1,
  esperarPila,
  llegarARevision,
  numeroDePaso,
  PUBLICA,
  PUNTO_CENTRO,
  reporteValido,
  responderPaso2,
  retenerPeticiones,
} from './ayudas';

/**
 * El formulario de reporte de la app pública, paso por paso, contra la pila real.
 *
 * Cubre lo que se corrigió en la revisión de producción: el punto del paso 1 lo elige la persona
 * (el centro del mapa ya no cuenta) y se conserva al ir y volver; un GPS impreciso no se presenta
 * como GPS; la fecha del evento se valida en su campo; y el aviso de turno aparece en cuanto el
 * turno se gasta, sin recargar.
 *
 * La sesión se pone por API (`cuentaNuevaEnElNavegador`): una cuenta nueva por caso, porque cada
 * cuenta solo puede enviar un reporte por hora.
 */

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

test.describe('paso 1: el punto lo elige la persona', () => {
  test('al abrir no hay punto: el centro del mapa no cuenta y «Continuar» espera', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'abrir-');
    await abrirFormulario(page);
    // Con el mapa ya cargado: antes, su `load` tomaba el centro como punto elegido.
    await expect(page.getByTestId('ubicacion-pendiente')).toContainText(
      'Mové el mapa hasta el punto exacto.',
    );
    await expect(page.getByTestId('ubicacion-resuelta')).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toBeDisabled();
  });

  test('volver al paso 1 conserva el punto elegido, y es ese el que se envía', async ({ page }) => {
    await cuentaNuevaEnElNavegador(page, 'vuelta-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
    const lugar = await page.getByTestId('ubicacion-resuelta').locator('b').innerText();

    await continuar(page);
    await page.getByRole('button', { name: 'Volver al paso anterior' }).click();
    await expect.poll(() => numeroDePaso(page)).toBe(1);
    // El mapa del paso 1 se vuelve a crear al entrar: se espera a que cargue, que es cuando
    // antes pisaba el punto con el centro por defecto.
    await esperarMapaDelPaso1(page);
    await expect(page.getByTestId('ubicacion-resuelta').locator('b')).toHaveText(lugar);
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();

    await llegarARevision(page, `E2E-vuelta-${Date.now()}`);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.lat).toBeCloseTo(PUNTO_CENTRO.lat, 6);
    expect(cuerpo.lon).toBeCloseTo(PUNTO_CENTRO.lon, 6);
    expect(cuerpo.ubicacion_metodo).toBe('manual');
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });

  test('mover el mapa vuelve a preguntar la unidad vecinal y «Continuar» espera la respuesta', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'mover-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
    const siguiente = page.getByTestId('boton-siguiente');
    await expect(siguiente).toBeEnabled();

    // La respuesta del punto nuevo se retiene para poder mirar el estado intermedio.
    const resolver = await retenerPeticiones(page, '**/geo/v1/resolver');
    const mapa = await esperarMapaDelPaso1(page);
    // Con el bloque de coordenadas abierto la pantalla puede haberse desplazado.
    await mapa.scrollIntoViewIfNeeded();
    const caja = await mapa.locator('canvas').first().boundingBox();
    expect(caja, 'el mapa del paso 1 tiene que estar dibujado').toBeTruthy();
    const { x, y, width, height } = caja as { x: number; y: number; width: number; height: number };
    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();
    await page.mouse.move(x + width / 2 - 120, y + height / 2 - 60, { steps: 10 });
    await page.mouse.up();

    await resolver.llegada;
    await expect(page.getByTestId('ubicacion-pendiente')).toContainText(
      'Buscando la unidad vecinal',
    );
    await expect(page.getByTestId('ubicacion-resuelta')).toHaveCount(0);
    await expect(siguiente).toBeDisabled();

    resolver.liberar();
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    await expect(siguiente).toBeEnabled();
  });

  test('abrir el formulario y salir sin hacer nada no deja un borrador para retomar', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'salir-');
    await abrirFormulario(page);
    await page.getByRole('link', { name: 'Salir del reporte' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/');

    await abrirFormulario(page);
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    expect(await numeroDePaso(page)).toBe(1);
    await expect(page.getByTestId('ubicacion-pendiente')).toBeVisible();
  });

  test('el punto que trae «Me pasa a mí» sirve de partida, pero no cuenta como algo empezado', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'enlace-');
    await abrirFormulario(page, `/reportar?lat=${PUNTO_CENTRO.lat}&lon=${PUNTO_CENTRO.lon}`);
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    await page.getByRole('link', { name: 'Salir del reporte' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/');

    await abrirFormulario(page);
    await expect(page.getByTestId('borrador-retomado')).toHaveCount(0);
    await expect(page.getByTestId('ubicacion-pendiente')).toBeVisible();
  });
});

test.describe('paso 1 con el GPS del teléfono · preciso (20 m)', () => {
  test.use({
    geolocation: { latitude: PUNTO_CENTRO.lat, longitude: PUNTO_CENTRO.lon, accuracy: 20 },
    permissions: ['geolocation'],
  });

  test('«Usar mi ubicación» envía el punto como GPS con su precisión', async ({ page }) => {
    await cuentaNuevaEnElNavegador(page, 'gps-');
    await abrirFormulario(page);
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    await expect(page.getByTestId('aviso-ubicacion-aproximada')).toHaveCount(0);

    await llegarARevision(page, `E2E-gps-${Date.now()}`);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.ubicacion_metodo).toBe('gps');
    expect(cuerpo.precision_gps_m).toBe(20);
    expect(cuerpo.lat).toBeCloseTo(PUNTO_CENTRO.lat, 6);
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });
});

test.describe('paso 1 con el GPS del teléfono · aproximado (20 km)', () => {
  test.use({
    geolocation: { latitude: PUNTO_CENTRO.lat, longitude: PUNTO_CENTRO.lon, accuracy: 20_000 },
    permissions: ['geolocation'],
  });

  test('una ubicación de kilómetros de error se avisa y se envía como elección manual', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'gps-aprox-');
    await abrirFormulario(page);
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await expect(page.getByTestId('aviso-ubicacion-aproximada')).toContainText(
      'Tu ubicación es aproximada',
    );
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();

    await llegarARevision(page, `E2E-gps-aprox-${Date.now()}`);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.ubicacion_metodo).toBe('manual');
    expect(cuerpo.precision_gps_m).toBeNull();
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });
});

test.describe('paso 2: la fecha del evento', () => {
  test('una fecha futura o de hace más de un año se marca en su campo y no deja continuar', async ({
    page,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'fecha-');
    await abrirFormulario(page);
    await elegirPuntoPorCoordenadas(page);
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
    await elegirPuntoPorCoordenadas(page);
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
    await elegirPuntoPorCoordenadas(page);
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
