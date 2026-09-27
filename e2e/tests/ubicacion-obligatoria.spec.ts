import { expect, test } from '@playwright/test';
import {
  API,
  abrirFormulario,
  compartirUbicacion,
  cuentaNuevaConSesion,
  cuentaNuevaEnElNavegador,
  desplazar,
  dispositivoEn,
  elegirPuntoPorCoordenadas,
  escribirCoordenadas,
  esperarPila,
  GPS_EN_EL_CENTRO,
  llegarARevision,
  loginTecnico,
  mapaDelPaso1,
  numeroDePaso,
  POSICION_ANTIGUEDAD_MAX_S,
  PRECISION_DISPOSITIVO_MAX_M,
  PRECISION_GPS_M,
  PUNTO_AJUSTADO,
  PUNTO_CENTRO,
  RADIO_DISPOSITIVO_M,
  reporteValido,
  tocarCompartirUbicacion,
  vigilarSensores,
} from './ayudas';

/**
 * Ubicación obligatoria y permisos (plan 2026-09-26, pedidos E y F; contracts 0.9.0).
 *
 * - Al abrir la web no se pide ni se lee nada: ni la ubicación, ni el permiso, ni la cámara. La
 *   ubicación se pide solo al tocar «Compartir mi ubicación» dentro del reporte.
 * - Sin ubicación, o con una peor que 50 m, no se reporta.
 * - El punto se mueve solo dentro de 60 m del teléfono, y api-core lo vuelve a comprobar: lo que
 *   la interfaz no deja hacer, un POST directo tampoco lo consigue.
 * - La posición del teléfono sirve para esa comprobación y no se guarda: el técnico ve la
 *   distancia y la precisión, no dónde estaba el teléfono.
 *
 * Corre en escritorio y en el proyecto `movil` (Pixel 7). El teléfono es el GPS simulado de
 * Chromium (`GPS_EN_EL_CENTRO`), y el permiso lo da o lo niega el contexto de cada prueba.
 */

test.beforeAll(async ({ request }) => {
  await esperarPila(request);
});

/** Coordenadas del teléfono de la suite, para buscarlas en lo que guarda y devuelve el servidor. */
const COORDENADAS_DEL_TELEFONO = [PUNTO_CENTRO.lat, PUNTO_CENTRO.lon];

/** Claves y números de un JSON, a cualquier profundidad. */
function recorrer(valor: unknown, claves: string[] = [], numeros: number[] = []) {
  if (typeof valor === 'number') numeros.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) recorrer(v, claves, numeros);
  else if (valor && typeof valor === 'object')
    for (const [k, v] of Object.entries(valor)) {
      claves.push(k);
      recorrer(v, claves, numeros);
    }
  return { claves, numeros };
}

test.describe('al abrir la web no se pide ni se lee nada', () => {
  // Con los dos permisos ya dados, pedir la ubicación o la cámara no mostraría ningún aviso: la
  // única forma de verlo es el espía. Es el peor caso, el de quien ya los había dado antes.
  test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation', 'camera'] });

  test('ni las pantallas públicas ni el formulario piden la ubicación o la cámara hasta tocar «Compartir mi ubicación»', async ({
    page,
  }) => {
    const sensores = await vigilarSensores(page);
    const sinNada = async (donde: string) => {
      const s = await sensores();
      expect(s.geolocalizacion, `${donde}: lecturas de la ubicación`).toEqual([]);
      expect(s.camara, `${donde}: pedidos de la cámara`).toBe(0);
      expect(
        s.permisos.filter((p) => p === 'geolocation' || p === 'camera'),
        `${donde}: consultas de permisos`,
      ).toEqual([]);
    };

    for (const ruta of ['/inicio', '/', '/como-funciona', '/mis-reportes']) {
      await page.goto(ruta);
      // `#contenido` y no el primer `h1`: en el teléfono la portada esconde el de escritorio.
      await expect(page.locator('#contenido')).toBeAttached();
      if (ruta === '/')
        await expect(page.getByTestId('resumen-mapa')).toContainText(/punto|Ningún/, {
          timeout: 60_000,
        });
      // Lo que se pida al cargar sale en la primera tanda: con la red quieta ya habría salido.
      await page.waitForLoadState('networkidle');
      await sinNada(ruta);
    }

    // El formulario tampoco: la pantalla explica para qué es y espera el botón.
    await cuentaNuevaEnElNavegador(page, 'sin-pedir-');
    await abrirFormulario(page);
    await page.waitForLoadState('networkidle');
    await sinNada('/reportar');

    // Al tocarlo: una sola vigilancia, precisa y sin posiciones guardadas, que se apaga en cuanto
    // llega a la precisión (un GPS encendido gasta la batería de quien reporta).
    await tocarCompartirUbicacion(page);
    await expect(mapaDelPaso1(page)).toBeVisible({ timeout: 30_000 });
    const s = await sensores();
    expect(s.geolocalizacion).toEqual([
      { metodo: 'watchPosition', opciones: { enableHighAccuracy: true, maximumAge: 0 } },
    ]);
    expect(s.apagadas, 'la vigilancia se apaga al llegar a la precisión').toBeGreaterThan(0);
    expect(s.camara, 'la cámara se pide al tocar «Sacar foto», no antes').toBe(0);
  });
});

test.describe('«Ir a mi ubicación» del mapa', () => {
  test.describe('sin el permiso dado', () => {
    // Sin `permissions`: el permiso queda en «preguntar», como en la primera visita. Con
    // `permissions: []` Playwright lo pondría en «denegado» de entrada.
    test.use({ geolocation: GPS_EN_EL_CENTRO });

    test('no dispara el aviso del navegador: dice que la ubicación se pide al reportar', async ({
      page,
    }) => {
      const sensores = await vigilarSensores(page);
      await page.goto('/');
      const aviso = page.getByTestId('aviso-ubicacion-al-reportar');
      // Un toque anterior a la hidratación se pierde: se repite hasta que responda.
      await expect(async () => {
        await page.getByRole('button', { name: 'Centrar el mapa en mi ubicación' }).click();
        await expect(aviso).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });

      await expect(aviso).toContainText('Tu ubicación se pide solo al reportar un punto.');
      await expect(aviso.getByRole('link', { name: 'Reportar un punto' })).toHaveAttribute(
        'href',
        '/reportar',
      );
      // Consultó el permiso, pero no leyó la ubicación: eso habría abierto el aviso. Sin ventana,
      // Chromium niega ese aviso solo y el permiso pasaría a «denegado»: sigue en «preguntar».
      expect((await sensores()).geolocalizacion).toEqual([]);
      expect(
        await page.evaluate(
          async () => (await navigator.permissions.query({ name: 'geolocation' })).state,
        ),
        'nadie pidió el permiso',
      ).toBe('prompt');

      await aviso.getByRole('button', { name: 'Entendido' }).click();
      await expect(aviso).toHaveCount(0);
    });
  });

  test.describe('con el permiso ya dado en un reporte', () => {
    test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

    test('lee la ubicación una vez y no muestra el aviso', async ({ page }) => {
      const sensores = await vigilarSensores(page);
      await page.goto('/');
      await expect(async () => {
        await page.getByRole('button', { name: 'Centrar el mapa en mi ubicación' }).click();
        await expect
          .poll(async () => (await sensores()).geolocalizacion.length, { timeout: 3_000 })
          .toBeGreaterThan(0);
      }).toPass({ timeout: 30_000 });
      expect((await sensores()).geolocalizacion.map((g) => g.metodo)).toEqual([
        'getCurrentPosition',
      ]);
      await expect(page.getByTestId('aviso-ubicacion-al-reportar')).toHaveCount(0);
    });
  });
});

test.describe('sin ubicación no se reporta', () => {
  // Como quien toca «Bloquear» en el aviso: sin el permiso dado, Chromium sin ventana niega el
  // primer pedido de verdad y el permiso queda «denegado».
  test.use({ geolocation: GPS_EN_EL_CENTRO });

  test('con el permiso negado aparece el bloqueo con instrucciones, sin mapa ni «Continuar», y al habilitarlo sigue solo', async ({
    page,
    context,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'gps-negado-');
    await abrirFormulario(page);
    await tocarCompartirUbicacion(page);

    const bloqueo = page.getByTestId('ubicacion-bloqueada');
    await expect(bloqueo).toContainText('No diste permiso para usar tu ubicación');
    await expect(bloqueo).toContainText('Sin ella no se puede reportar');
    await expect(bloqueo.locator('ol li')).toHaveCount(3);
    await expect(page.getByTestId('boton-reintentar-ubicacion')).toHaveText('Probar de nuevo');
    await expect(mapaDelPaso1(page)).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toHaveCount(0);

    // «En cuanto la habilites, seguimos solos»: el formulario escucha el cambio del permiso.
    await context.grantPermissions(['geolocation']);
    await expect(bloqueo).toHaveCount(0);
    await expect(mapaDelPaso1(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();
  });
});

test.describe(`con una ubicación peor que ${PRECISION_DISPOSITIVO_MAX_M} m no se avanza`, () => {
  const IMPRECISO = { ...GPS_EN_EL_CENTRO, accuracy: 200 };
  test.use({ geolocation: IMPRECISO, permissions: ['geolocation'] });

  test('con 200 m muestra la precisión y no deja seguir hasta que el teléfono llega a 50 m', async ({
    page,
    context,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'gps-200-');
    await abrirFormulario(page);
    await tocarCompartirUbicacion(page);

    await expect(page.getByTestId('precision-actual')).toContainText('Precisión actual: 200 m');
    await expect(page.getByTestId('precision-actual')).toContainText(
      `Hace falta ${PRECISION_DISPOSITIVO_MAX_M} m o menos`,
    );
    await expect(page.getByRole('button', { name: 'Buscando tu ubicación…' })).toBeDisabled();
    await expect(mapaDelPaso1(page)).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toHaveCount(0);

    // El teléfono mejora mientras se sigue buscando (al salir afuera): llega sola.
    await context.setGeolocation(GPS_EN_EL_CENTRO);
    await expect(mapaDelPaso1(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ayuda-circulo')).toContainText(
      `precisión de ${PRECISION_GPS_M} m`,
    );
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();
  });

  test('si a los 30 s no llega a 50 m, pide salir a un lugar abierto, apaga el GPS y ofrece reintentar', async ({
    page,
  }) => {
    const sensores = await vigilarSensores(page);
    await cuentaNuevaEnElNavegador(page, 'gps-plazo-');
    // Reloj de la página propio, para no esperar 30 s de verdad. Corre solo, igual que el real.
    await page.clock.install();
    await abrirFormulario(page);
    await tocarCompartirUbicacion(page);
    await expect(page.getByTestId('precision-actual')).toContainText('Precisión actual: 200 m');

    await page.clock.fastForward('00:31');
    const imprecisa = page.getByTestId('ubicacion-imprecisa');
    await expect(imprecisa).toContainText('Salí a un lugar abierto');
    await expect(imprecisa).toContainText('la última lectura fue de 200 m');
    await expect(page.getByTestId('boton-reintentar-ubicacion')).toHaveText('Reintentar');
    await expect(mapaDelPaso1(page)).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toHaveCount(0);
    expect((await sensores()).apagadas, 'el GPS se apaga al vencer el plazo').toBeGreaterThan(0);
  });
});

test.describe(`el punto no sale del círculo de ${RADIO_DISPOSITIVO_M} m`, () => {
  test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

  test('unas coordenadas a 80 m se rechazan en la interfaz; a 50 m entran, y el envío lleva el teléfono aparte, que no se guarda', async ({
    page,
    request,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'radio-ui-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    const distancia = page.getByTestId('distancia-al-punto');
    await expect(distancia).toHaveText('El punto está justo donde estás.');

    await escribirCoordenadas(page, desplazar(PUNTO_CENTRO, { norteM: 80 }));
    await expect(page.getByTestId('error-coordenadas')).toHaveText(
      `Ese punto está a 80 m de vos: tiene que quedar a ${RADIO_DISPOSITIVO_M} m o menos de donde estás.`,
    );
    // El punto no se movió.
    await expect(distancia).toHaveText('El punto está justo donde estás.');

    await elegirPuntoPorCoordenadas(page, PUNTO_AJUSTADO);
    await expect(distancia).toHaveText('Ese punto está a 50 m de vos.');
    await llegarARevision(page, `E2E-radio-ui-${Date.now()}`);

    const respuesta = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
    );
    await page.getByTestId('boton-enviar').click();
    const r = await respuesta;
    expect(r.status(), await r.text()).toBe(201);
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    expect(cuerpo.lat).toBeCloseTo(PUNTO_AJUSTADO.lat, 7);
    expect(cuerpo.lon).toBeCloseTo(PUNTO_AJUSTADO.lon, 7);
    const dispositivo = cuerpo.dispositivo as Record<string, number>;
    expect(dispositivo.lat).toBeCloseTo(PUNTO_CENTRO.lat, 7);
    expect(dispositivo.lon).toBeCloseTo(PUNTO_CENTRO.lon, 7);
    expect(dispositivo.precision_m).toBe(PRECISION_GPS_M);
    expect(Number.isInteger(dispositivo.antiguedad_s)).toBe(true);
    expect(dispositivo.antiguedad_s).toBeGreaterThanOrEqual(0);
    // El método y la precisión los deriva el servidor (contracts 0.9.0).
    expect(Object.keys(cuerpo)).not.toContain('ubicacion_metodo');
    expect(Object.keys(cuerpo)).not.toContain('precision_gps_m');
    await expect(page.getByTestId('reporte-creado')).toBeVisible();

    // Lo que guardó: la distancia y la precisión, no la posición del teléfono.
    const id = ((await r.json()) as { id: string }).id;
    await loginTecnico(request);
    const tecnica = await request.get(`${API}/api/v1/tecnico/reportes/${id}`);
    expect(tecnica.status()).toBe(200);
    const f = await tecnica.json();
    expect(f.properties).toMatchObject({
      ubicacion_metodo: 'manual',
      precision_gps_m: PRECISION_GPS_M,
      distancia_dispositivo_m: 50,
    });
    const { claves, numeros } = recorrer(f);
    expect(claves).not.toContain('dispositivo');
    for (const c of COORDENADAS_DEL_TELEFONO)
      expect(numeros, `la vista técnica no puede tener ${c}`).not.toContain(c);
  });

  test('tocar el mapa fuera del círculo deja el punto en el borde, y los botones lo mueven de a 5 m', async ({
    page,
    isMobile,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'radio-toque-');
    await abrirFormulario(page);
    const mapa = await compartirUbicacion(page);
    const distancia = page.getByTestId('distancia-al-punto');

    // La esquina del mapa queda fuera del círculo, que está encuadrado entero con margen.
    await mapa.scrollIntoViewIfNeeded();
    const caja = await mapa.locator('canvas').first().boundingBox();
    expect(caja, 'el mapa del paso 1 tiene que estar dibujado').toBeTruthy();
    const { x, y } = caja as { x: number; y: number };
    if (isMobile) await page.touchscreen.tap(x + 12, y + 12);
    else await page.mouse.click(x + 12, y + 12);
    await expect(distancia).toHaveText(`Ese punto está a ${RADIO_DISPOSITIVO_M} m de vos.`);
    await expect(page.getByTestId('boton-siguiente')).toBeEnabled();

    await page.getByRole('button', { name: 'Poner el punto en mi ubicación' }).click();
    await expect(distancia).toHaveText('El punto está justo donde estás.');
    await page.getByRole('button', { name: 'Mover el punto 5 m al norte' }).click();
    await page.getByRole('button', { name: 'Mover el punto 5 m al norte' }).click();
    await expect(distancia).toHaveText('Ese punto está a 10 m de vos.');
  });
});

test.describe('el punto aceptado no se muda al volver a compartir la ubicación', () => {
  test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] });

  test('tras un 422 POSICION_VENCIDA, el punto aceptado sin moverlo sigue en su lugar aunque el teléfono esté a 40 m', async ({
    page,
    context,
  }) => {
    await cuentaNuevaEnElNavegador(page, 'aceptado-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    const distancia = page.getByTestId('distancia-al-punto');
    // El punto que puso la app, aceptado tal cual con «Continuar».
    await expect(distancia).toHaveText('El punto está justo donde estás.');
    await llegarARevision(page, `E2E-aceptado-${Date.now()}`);

    // El primer envío lo rechaza «el servidor» por la antigüedad de la posición (simulado en el
    // navegador: con el reloj real habría que esperar 10 min). El segundo llega a api-core.
    let rechazado = false;
    await page.route('**/api/v1/reportes', async (ruta) => {
      if (ruta.request().method() !== 'POST' || rechazado) return ruta.fallback();
      rechazado = true;
      await ruta.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          codigo: 'POSICION_VENCIDA',
          mensaje: 'Tu ubicación es de hace más de 10 minutos.',
          detalles: { antiguedad_s: POSICION_ANTIGUEDAD_MAX_S + 100, maximo_s: 600 },
        }),
      });
    });
    await page.getByTestId('boton-enviar').click();
    await expect(page.getByTestId('aviso-ubicacion')).toContainText('Volvé a compartirla');
    expect(await numeroDePaso(page)).toBe(1);

    // Vuelve a compartir desde 40 m al norte: el punto es el lugar del agua, no el teléfono.
    const telefono = desplazar(PUNTO_CENTRO, { norteM: 40 });
    await context.setGeolocation({
      latitude: telefono.lat,
      longitude: telefono.lon,
      accuracy: PRECISION_GPS_M,
    });
    await compartirUbicacion(page);
    await expect(distancia).toHaveText('Ese punto está a 40 m de vos.');

    // «Continuar» lleva de vuelta a la revisión, y lo que sale es el punto aceptado.
    await page.getByTestId('boton-siguiente').click();
    await expect.poll(() => numeroDePaso(page)).toBe(4);
    const respuesta = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
    );
    await page.getByTestId('boton-enviar').click();
    const r = await respuesta;
    expect(r.status(), await r.text()).toBe(201);
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    expect(cuerpo.lat).toBeCloseTo(PUNTO_CENTRO.lat, 7);
    expect(cuerpo.lon).toBeCloseTo(PUNTO_CENTRO.lon, 7);
    const dispositivo = cuerpo.dispositivo as Record<string, number>;
    expect(dispositivo.lat).toBeCloseTo(telefono.lat, 7);
    expect(dispositivo.lon).toBeCloseTo(telefono.lon, 7);
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });
});

test.describe('api-core vuelve a comprobar la ubicación', () => {
  test.skip(({ isMobile }) => isMobile, 'Sin navegador: basta con correrlo una vez.');

  test(`un POST directo con el punto a 80 m da 422 y no gasta el turno; a ${RADIO_DISPOSITIVO_M} m entra`, async ({
    request,
  }) => {
    await cuentaNuevaConSesion(request, 'radio-api-');
    const marca = `E2E-radio-api-${Date.now()}`;
    const enviar = (cambios: Record<string, unknown>) =>
      request.post(`${API}/api/v1/reportes`, { data: { ...reporteValido(marca), ...cambios } });

    const lejos = desplazar(PUNTO_CENTRO, { norteM: 80 });
    const fuera = await enviar({ ...lejos, dispositivo: dispositivoEn(PUNTO_CENTRO) });
    expect(fuera.status(), await fuera.text()).toBe(422);
    const cuerpo = await fuera.json();
    expect(cuerpo.codigo).toBe('UBICACION_FUERA_DE_RADIO');
    expect(cuerpo.detalles).toEqual({ distancia_m: 80, maximo_m: RADIO_DISPOSITIVO_M });
    // La respuesta no repite la posición del teléfono.
    for (const c of COORDENADAS_DEL_TELEFONO)
      expect(recorrer(cuerpo).numeros, `la respuesta no puede tener ${c}`).not.toContain(c);

    // Los topes de negocio son 422 propios, no un 400 del esquema: la interfaz los explica.
    const imprecisa = await enviar({
      dispositivo: dispositivoEn(PUNTO_CENTRO, { precisionM: 80 }),
    });
    expect(imprecisa.status()).toBe(422);
    expect((await imprecisa.json()).codigo).toBe('PRECISION_INSUFICIENTE');

    const vieja = await enviar({
      dispositivo: dispositivoEn(PUNTO_CENTRO, { antiguedadS: POSICION_ANTIGUEDAD_MAX_S + 1 }),
    });
    expect(vieja.status()).toBe(422);
    expect((await vieja.json()).codigo).toBe('POSICION_VENCIDA');

    const { dispositivo: _sinDispositivo, ...sinTelefono } = reporteValido(marca);
    const sin = await request.post(`${API}/api/v1/reportes`, { data: sinTelefono });
    expect(sin.status()).toBe(400);
    const faltante = await sin.json();
    expect(faltante.codigo).toBe('PAYLOAD_INVALIDO');
    expect(faltante.detalles.map((d: { campo: string }) => d.campo.split('.')[0])).toContain(
      'dispositivo',
    );

    // En el borde entra. Con una cuenta que solo puede enviar un reporte por hora, que entre
    // prueba que ninguno de los rechazos de arriba gastó el turno.
    const borde = desplazar(PUNTO_CENTRO, { norteM: RADIO_DISPOSITIVO_M });
    const dentro = await enviar({ ...borde, dispositivo: dispositivoEn(PUNTO_CENTRO) });
    expect(dentro.status(), await dentro.text()).toBe(201);
    const id = (await dentro.json()).id as string;

    await loginTecnico(request);
    const f = await (await request.get(`${API}/api/v1/tecnico/reportes/${id}`)).json();
    expect(f.properties).toMatchObject({
      ubicacion_metodo: 'manual',
      precision_gps_m: PRECISION_GPS_M,
      distancia_dispositivo_m: RADIO_DISPOSITIVO_M,
    });
    expect(recorrer(f).claves).not.toContain('dispositivo');
  });
});
