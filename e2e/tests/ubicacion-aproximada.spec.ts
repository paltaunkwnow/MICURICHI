import { expect, test } from '@playwright/test';
import {
  API,
  abrirFormulario,
  CREDENCIALES_TECNICO,
  crearReportePorApi,
  cuentaNuevaConSesion,
  cuentaNuevaEnElNavegador,
  DEMORA_E2E_PRIMERO_S,
  desplazar,
  dispositivoEn,
  distanciaM,
  escribirCoordenadas,
  esperarMapaDelPaso1,
  esperarOfertaDeUbicacionAproximada,
  esperarPila,
  esperarPublicacion,
  GPS_EN_EL_CENTRO,
  llegarARevision,
  loginTecnico,
  mapaDelPaso1,
  PANEL,
  POSICION_ANTIGUEDAD_MAX_S,
  PRECISION_DISPOSITIVO_MAX_M,
  PUNTO_CENTRO,
  RADIO_DISPOSITIVO_M,
  REPORTES_POR_DIA,
  recorrer,
  reporteValido,
  sesionDelPanelEnElNavegador,
  tocarCompartirUbicacion,
} from './ayudas';

/**
 * Reportar con ubicación aproximada desde un dispositivo sin GPS preciso (plan 2026-10-04, C6;
 * ADR 0007; contracts 0.18.0). Es el camino de quien reporta desde una computadora, que se ubica
 * por Wi-Fi o por IP y declara cientos de metros o kilómetros de error.
 *
 * - Con una lectura de más de 50 m, el paso 1 ofrece «Reportar con ubicación aproximada». El camino
 *   normal sigue cerrado (sin mapa ni «Continuar»): eso lo afirma `ubicacion-obligatoria.spec.ts`.
 * - Elegido, el punto lo pone la persona en cualquier lugar de la cobertura (el point-in-polygon se
 *   sigue exigiendo), sin círculo de 60 m, y el envío lleva `ubicacion_aproximada: true`.
 * - api-core lo hace cumplir: con 50 m o menos de precisión rechaza la marca (422
 *   `UBICACION_PRECISA_DISPONIBLE`, sin gastar cupo), así que un teléfono con GPS no puede saltarse
 *   los 60 m. Con más, no comprueba el radio y guarda `ubicacion_metodo = 'aproximada'`, la
 *   precisión declarada y la distancia en `null`. La posición del dispositivo sigue sin guardarse
 *   ni devolverse (CLAUDE.md §0, regla 8).
 * - No cambian la demora de publicación, el cupo diario ni lo que ve el público (sigue «NO SE HA
 *   VERIFICADO», sin el método). Los técnicos sí ven la marca: «Aproximada» en la bandeja y
 *   «Ubicación aproximada — sin comprobar con el dispositivo» en el detalle y la ficha.
 *
 * Corre solo en escritorio (proyecto `chromium`): es el camino de las computadoras. Cada prueba que
 * reporta usa una cuenta nueva, porque cada cuenta envía 3 reportes por día.
 */

/** Precisión de una computadora ubicada por Wi-Fi: cientos de metros. */
const PRECISION_APROXIMADA_M = 300;
/** Una ubicada por IP puede declarar kilómetros. Es más que el tope viejo del esquema (10 000 m). */
const PRECISION_POR_IP_M = 25_000;
/** La de un teléfono con GPS al aire libre: llega a los 50 m, así que no le corresponde este camino. */
const PRECISION_BUENA_M = 30;

/** La computadora de la prueba: en PUNTO_CENTRO, con 300 m de precisión. */
const GPS_DE_COMPUTADORA = { ...GPS_EN_EL_CENTRO, accuracy: PRECISION_APROXIMADA_M };

/**
 * El lugar del agua, que la persona pone a mano: a 150 m de la computadora (120 al norte y 90 al
 * este), más de dos veces el radio de 60 m del camino normal. Cae dentro de una unidad vecinal tanto
 * en las capas reales como en las sintéticas del CI. Ni su latitud ni su longitud coinciden con las
 * de la computadora, así que se puede buscar la posición de la computadora en lo que guarda el
 * servidor sin confundirla con la del punto.
 */
const PUNTO_LEJOS = desplazar(PUNTO_CENTRO, { norteM: 120, esteM: 90 });
const DISTANCIA_AL_PUNTO_M = Math.round(distanciaM(PUNTO_LEJOS, PUNTO_CENTRO));

/** Lo que dice el panel de un reporte aproximado (`etiquetaMetodo` de panel-admin). */
const ETIQUETA_PANEL = 'Ubicación aproximada — sin comprobar con el dispositivo';

/** El cuerpo de `POST /api/v1/reportes` de la computadora: aproximado, con el punto a 150 m de ella. */
function reporteAproximado(marca: string, cambios: Record<string, unknown> = {}) {
  return {
    ...reporteValido(marca, PUNTO_LEJOS),
    ubicacion_aproximada: true,
    dispositivo: dispositivoEn(PUNTO_CENTRO, { precisionM: PRECISION_APROXIMADA_M }),
    ...cambios,
  };
}

test.beforeAll(async ({ request }) => {
  await esperarPila(request);
});

test.describe('desde la interfaz, una computadora sin GPS preciso reporta con ubicación aproximada', () => {
  // Con el permiso dado, como en las demás pruebas que reportan: lo que cambia es la precisión.
  test.use({ geolocation: GPS_DE_COMPUTADORA, permissions: ['geolocation'] });

  test(`con ${PRECISION_APROXIMADA_M} m se ofrece el camino aproximado; el punto se pone a mano a ${DISTANCIA_AL_PUNTO_M} m, el envío lleva la marca y el técnico lo ve «aproximada», sin distancia ni posición del dispositivo`, async ({
    page,
    request,
  }) => {
    expect(
      DISTANCIA_AL_PUNTO_M,
      'el punto queda más lejos que el radio: por el camino normal daría error',
    ).toBeGreaterThan(RADIO_DISPOSITIVO_M);

    await cuentaNuevaEnElNavegador(page, 'aprox-ui-');
    await abrirFormulario(page);
    await tocarCompartirUbicacion(page);

    // Por el camino normal no se avanza (sin mapa ni «Continuar»), y se ofrece el aproximado.
    await expect(page.getByTestId('precision-actual')).toContainText(
      `Precisión actual: ${PRECISION_APROXIMADA_M} m`,
    );
    await expect(mapaDelPaso1(page)).toHaveCount(0);
    await expect(page.getByTestId('boton-siguiente')).toHaveCount(0);
    const boton = await esperarOfertaDeUbicacionAproximada(page);
    await boton.click();

    // El modo aproximado se dice, el mapa se abre y no hay círculo de 60 m que explicar.
    await expect(page.getByTestId('aviso-ubicacion-aproximada')).toContainText(
      'Ubicación aproximada',
    );
    await esperarMapaDelPaso1(page);
    await expect(page.getByText(/El círculo marca/)).toHaveCount(0);

    // El punto va a mano, sin tope de distancia: a 150 m de la computadora, donde por el camino
    // normal el formulario diría que tiene que quedar a 60 m o menos.
    await escribirCoordenadas(page, PUNTO_LEJOS);
    await expect(page.getByTestId('error-coordenadas')).toHaveCount(0);
    await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
    await llegarARevision(page, `E2E-aprox-ui-${Date.now()}`);

    // La revisión lo dice. Se busca por el texto: el paso 4 es el único que existe en el DOM.
    await expect(page.getByText(/aproximada/i).first()).toBeVisible();

    const respuesta = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
    );
    await page.getByTestId('boton-enviar').click();
    const r = await respuesta;
    expect(r.status(), await r.text()).toBe(201);
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    expect(cuerpo.ubicacion_aproximada).toBe(true);
    expect(cuerpo.lat).toBeCloseTo(PUNTO_LEJOS.lat, 7);
    expect(cuerpo.lon).toBeCloseTo(PUNTO_LEJOS.lon, 7);
    // La computadora va aparte, con la precisión que leyó el navegador.
    const dispositivo = cuerpo.dispositivo as Record<string, number>;
    expect(dispositivo.lat).toBeCloseTo(PUNTO_CENTRO.lat, 7);
    expect(dispositivo.lon).toBeCloseTo(PUNTO_CENTRO.lon, 7);
    expect(dispositivo.precision_m).toBe(PRECISION_APROXIMADA_M);
    // El método y la precisión guardada los deriva el servidor (contracts 0.9.0).
    expect(Object.keys(cuerpo)).not.toContain('ubicacion_metodo');
    expect(Object.keys(cuerpo)).not.toContain('precision_gps_m');
    await expect(page.getByTestId('reporte-creado')).toBeVisible();

    // Lo que guardó el servidor, visto por un técnico por la API técnica.
    const id = ((await r.json()) as { id: string }).id;
    await loginTecnico(request);
    await esperarPublicacion(request, id);
    const tecnica = await request.get(`${API}/api/v1/tecnico/reportes/${id}`);
    expect(tecnica.status()).toBe(200);
    const f = await tecnica.json();
    expect(f.properties).toMatchObject({
      ubicacion_metodo: 'aproximada',
      precision_gps_m: PRECISION_APROXIMADA_M,
      distancia_dispositivo_m: null,
    });
    // El punto es el que puso la persona, y quedó en una unidad vecinal: el point-in-polygon se
    // sigue exigiendo aunque no se compruebe el radio.
    expect(f.geometry.coordinates[0]).toBeCloseTo(PUNTO_LEJOS.lon, 6);
    expect(f.geometry.coordinates[1]).toBeCloseTo(PUNTO_LEJOS.lat, 6);
    expect(f.properties.unidad_vecinal?.id).toBeTruthy();
    expect(f.properties.distrito?.id).toBeTruthy();
    // La posición de la computadora no se guarda.
    const { claves, numeros } = recorrer(f);
    expect(claves).not.toContain('dispositivo');
    for (const c of [PUNTO_CENTRO.lat, PUNTO_CENTRO.lon])
      expect(numeros, `la vista técnica no puede tener ${c}`).not.toContain(c);
  });
});

test.describe('api-core hace cumplir el camino aproximado', () => {
  test(`con ${PRECISION_DISPOSITIVO_MAX_M} m o menos da 422 UBICACION_PRECISA_DISPONIBLE y no gasta el cupo; con más, sin comprobar el radio, entra como «aproximada», sin distancia`, async ({
    request,
  }) => {
    await cuentaNuevaConSesion(request, 'aprox-api-');
    const marca = `E2E-aprox-api-${Date.now()}`;
    const enviar = (cambios: Record<string, unknown>) =>
      request.post(`${API}/api/v1/reportes`, {
        data: { ...reporteValido(marca, PUNTO_LEJOS), ...cambios },
      });

    // Con una precisión de 50 m o menos hay ubicación precisa disponible: corresponde el camino
    // normal. El borde de 50 m cuenta como precisa. El teléfono está en el mismo punto, así que
    // ningún otro tope podría ser el motivo del rechazo.
    for (const precisionM of [PRECISION_BUENA_M, PRECISION_DISPOSITIVO_MAX_M]) {
      const precisa = await enviar({
        ubicacion_aproximada: true,
        dispositivo: dispositivoEn(PUNTO_LEJOS, { precisionM }),
      });
      expect(precisa.status(), `precisión de ${precisionM} m: ${await precisa.text()}`).toBe(422);
      const cuerpo = await precisa.json();
      expect(cuerpo.codigo, `precisión de ${precisionM} m`).toBe('UBICACION_PRECISA_DISPONIBLE');
      // La respuesta no repite la posición del dispositivo.
      for (const c of [PUNTO_LEJOS.lat, PUNTO_LEJOS.lon])
        expect(recorrer(cuerpo).numeros, `la respuesta no puede tener ${c}`).not.toContain(c);
    }

    // Sin la marca todo sigue igual (C-3.2): la misma imprecisión sigue siendo
    // PRECISION_INSUFICIENTE y, con buena precisión, un punto a más de 60 m del teléfono sigue
    // fuera del radio.
    const imprecisa = await enviar({
      dispositivo: dispositivoEn(PUNTO_LEJOS, { precisionM: PRECISION_APROXIMADA_M }),
    });
    expect(imprecisa.status()).toBe(422);
    expect((await imprecisa.json()).codigo).toBe('PRECISION_INSUFICIENTE');

    const fuera = await enviar({ dispositivo: dispositivoEn(PUNTO_CENTRO) });
    expect(fuera.status()).toBe(422);
    const fueraCuerpo = await fuera.json();
    expect(fueraCuerpo.codigo).toBe('UBICACION_FUERA_DE_RADIO');
    expect(fueraCuerpo.detalles).toEqual({
      distancia_m: DISTANCIA_AL_PUNTO_M,
      maximo_m: RADIO_DISPOSITIVO_M,
    });

    // Con la marca se sigue pidiendo el dispositivo, y su posición no puede estar vencida.
    const vieja = await enviar({
      ubicacion_aproximada: true,
      dispositivo: dispositivoEn(PUNTO_CENTRO, {
        precisionM: PRECISION_APROXIMADA_M,
        antiguedadS: POSICION_ANTIGUEDAD_MAX_S + 1,
      }),
    });
    expect(vieja.status()).toBe(422);
    expect((await vieja.json()).codigo).toBe('POSICION_VENCIDA');

    const { dispositivo: _sinDispositivo, ...sinComputadora } = reporteValido(marca, PUNTO_LEJOS);
    const sin = await request.post(`${API}/api/v1/reportes`, {
      data: { ...sinComputadora, ubicacion_aproximada: true },
    });
    expect(sin.status()).toBe(400);
    const faltante = await sin.json();
    expect(faltante.codigo).toBe('PAYLOAD_INVALIDO');
    expect(faltante.detalles.map((d: { campo: string }) => d.campo.split('.')[0])).toContain(
      'dispositivo',
    );

    // Ninguno de los rechazos gastó el cupo del día.
    const antes = await (await request.get(`${API}/api/v1/auth/yo`)).json();
    expect(antes.reportes_restantes_hoy, 'los rechazos no gastan el cupo').toBe(REPORTES_POR_DIA);

    // Con más de 50 m entra aunque el punto quede a 150 m de la computadora: el radio no se
    // comprueba. Con kilómetros de error (ubicada por IP, a 3 km del punto) también: si la
    // distancia se guardara, rompería el límite de 1000 m de la base.
    const creado = await request.post(`${API}/api/v1/reportes`, { data: reporteAproximado(marca) });
    expect(creado.status(), await creado.text()).toBe(201);
    const nuevo = await creado.json();
    const porIp = await enviar({
      ubicacion_aproximada: true,
      dispositivo: dispositivoEn(desplazar(PUNTO_CENTRO, { norteM: 3000 }), {
        precisionM: PRECISION_POR_IP_M,
      }),
    });
    expect(porIp.status(), await porIp.text()).toBe(201);
    const idPorIp = (await porIp.json()).id as string;

    // Misma demora y mismo cupo que por el camino normal: se publica sin moderación previa.
    expect(nuevo.properties).toMatchObject({ estado: 'nuevo', verificado: false });
    expect(Date.parse(nuevo.properties.publicar_en) - Date.parse(nuevo.properties.creado_en)).toBe(
      DEMORA_E2E_PRIMERO_S * 1000,
    );
    const despues = await (await request.get(`${API}/api/v1/auth/yo`)).json();
    expect(despues.reportes_restantes_hoy, 'cada uno gastó un reporte del día').toBe(
      REPORTES_POR_DIA - 2,
    );

    // Lo que guardó, visto por un técnico: el método, la precisión declarada y ninguna distancia
    // ni posición del dispositivo.
    await loginTecnico(request);
    await esperarPublicacion(request, nuevo.id);
    await esperarPublicacion(request, idPorIp);
    const guardados: [string, number, { lat: number; lon: number }][] = [
      [nuevo.id, PRECISION_APROXIMADA_M, PUNTO_CENTRO],
      [idPorIp, PRECISION_POR_IP_M, desplazar(PUNTO_CENTRO, { norteM: 3000 })],
    ];
    for (const [id, precision, telefono] of guardados) {
      const tecnica = await request.get(`${API}/api/v1/tecnico/reportes/${id}`);
      expect(tecnica.status()).toBe(200);
      const f = await tecnica.json();
      expect(f.properties, `precisión de ${precision} m`).toMatchObject({
        ubicacion_metodo: 'aproximada',
        precision_gps_m: precision,
        distancia_dispositivo_m: null,
      });
      const { claves, numeros } = recorrer(f);
      expect(claves).not.toContain('dispositivo');
      for (const c of [telefono.lat, telefono.lon])
        expect(numeros, `la vista técnica no puede tener ${c}`).not.toContain(c);
    }

    // El público no ve nada distinto: sigue «NO SE HA VERIFICADO», sin el método ni la precisión.
    const publica = await request.get(`${API}/api/v1/reportes/${nuevo.id}`);
    expect(publica.status()).toBe(200);
    const p = (await publica.json()).properties;
    expect(p).toMatchObject({ estado: 'nuevo', verificado: false });
    for (const campo of ['ubicacion_metodo', 'precision_gps_m', 'distancia_dispositivo_m'])
      expect(p, `la vista pública no puede tener ${campo}`).not.toHaveProperty(campo);
  });
});

test.describe('en el panel, el técnico ve que la ubicación es aproximada', () => {
  test('la bandeja marca con «Aproximada» solo a ese reporte, y el detalle y la ficha dicen «Ubicación aproximada — sin comprobar con el dispositivo»', async ({
    page,
    request,
  }) => {
    // Uno por el camino normal, para comprobar que la marca no es de todos, y uno aproximado, de
    // otra cuenta nueva (cada cuenta envía 3 por día). Entran en la primera página de la bandeja,
    // que va por fecha de creación, de la más nueva.
    const marca = `E2E-aprox-panel-${Date.now()}`;
    const idNormal = await crearReportePorApi(request, `${marca}-normal`);
    await cuentaNuevaConSesion(request, 'aprox-panel-');
    const creado = await request.post(`${API}/api/v1/reportes`, {
      data: reporteAproximado(marca),
    });
    expect(creado.status(), await creado.text()).toBe(201);
    const id = ((await creado.json()) as { id: string }).id;
    await loginTecnico(request);
    await esperarPublicacion(request, idNormal);
    await esperarPublicacion(request, id);

    await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
    await page.goto(`${PANEL}/reportes`);
    const fila = page.locator(`[data-testid="fila-reporte"][data-id="${id}"]`);
    await expect(fila).toBeVisible({ timeout: 60_000 });
    await expect(fila.getByTestId('insignia-ubicacion-aproximada')).toContainText('Aproximada');
    const filaNormal = page.locator(`[data-testid="fila-reporte"][data-id="${idNormal}"]`);
    await expect(filaNormal).toBeVisible();
    await expect(filaNormal.getByTestId('insignia-ubicacion-aproximada')).toHaveCount(0);

    // El detalle lo dice, y no lo hace pasar por un punto ajustado a mano cerca del teléfono.
    await page.goto(`${PANEL}/reportes/${id}`);
    await expect(page.getByTestId('estado-actual')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(ETIQUETA_PANEL).first()).toBeVisible();
    await expect(page.getByText('Movido a mano por la persona')).toHaveCount(0);

    // Y la ficha imprimible, que es la que se lleva el técnico.
    await page.getByTestId('btn-abrir-reporte-unitario').click();
    const ficha = page.getByRole('dialog', { name: /Ficha Técnica/ });
    await expect(ficha.getByText(ETIQUETA_PANEL).first()).toBeVisible();
  });
});
