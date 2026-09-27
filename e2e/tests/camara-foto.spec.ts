import { expect, test } from '@playwright/test';
import {
  API,
  abrirFormulario,
  compartirUbicacion,
  continuar,
  cuentaNuevaEnElNavegador,
  dialogoCamara,
  enviarYLeerCuerpo,
  esperarPila,
  GPS_EN_EL_CENTRO,
  leerWebp,
  llegarAFotos,
  loginTecnico,
  PUBLICA,
  sacarFotoConLaCamara,
  TROZOS_DE_METADATOS,
  vigilarCamara,
} from './ayudas';

/**
 * La foto sale de la cámara dentro de la página y se guarda en WebP (plan 2026-09-26, pedidos A y
 * D). Corre en escritorio y en el proyecto `movil` (Pixel 7), con la cámara falsa de Chromium: el
 * cuadro es sintético, pero el disparo, la captura, la subida y la conversión son los reales.
 */

/** 1600 px por lado como máximo, en el teléfono y en el servidor (contracts 0.8.0). */
const LADO_MAX_PX = 1600;

// Los permisos de cámara y de ubicación, solo en las pruebas que reportan: reportar exige compartir
// la ubicación (el GPS simulado en PUNTO_CENTRO con 10 m de precisión).
test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['camera', 'geolocation'] });

test.describe('foto con la cámara dentro de la página', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('saca la foto, la guarda en WebP del tamaño del cuadro y, antes del reporte, solo la ve quien la sacó', async ({
    page,
    browser,
    request,
  }) => {
    const camara = await vigilarCamara(page);
    let abrioSelector = false;
    page.on('filechooser', () => {
      abrioSelector = true;
    });
    await cuentaNuevaEnElNavegador(page, 'camara-webp-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    await llegarAFotos(page);

    // Ni galería ni selector de archivos, en ningún equipo.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    expect((await camara()).pedidos, 'la cámara se pide al tocar «Sacar foto», no antes').toEqual(
      [],
    );

    const respuesta = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/fotos',
    );
    const cuadro = await sacarFotoConLaCamara(page);
    const subida = await respuesta;
    expect(subida.status(), await subida.text()).toBe(201);
    const foto = (await subida.json()) as {
      objeto_key: string;
      url: string;
      ancho: number;
      alto: number;
      mime: string;
    };
    await expect
      .poll(async () => (await camara()).encendidas, { message: 'usar la foto apaga la cámara' })
      .toBe(0);
    await expect(page.getByRole('img', { name: 'Foto que sacaste' })).toHaveCount(1);

    expect(foto.mime).toBe('image/webp');
    expect(foto.objeto_key).toMatch(/^[a-f0-9-]{36}\.webp$/);
    // Se compara con el cuadro que dio la cámara y no con 1920: la falsa de Chromium puede no
    // respetar lo pedido (plan, decisión 3). Lo pedido lo prueba Vitest en web-ciudadano.
    expect(cuadro.ancho, 'la cámara tiene que haber dado imagen').toBeGreaterThan(0);
    const escala = Math.min(1, LADO_MAX_PX / Math.max(cuadro.ancho, cuadro.alto));
    expect(
      Math.abs(foto.ancho - Math.round(cuadro.ancho * escala)),
      `guardada de ${foto.ancho}×${foto.alto} para un cuadro de ${cuadro.ancho}×${cuadro.alto}`,
    ).toBeLessThanOrEqual(1);
    expect(Math.max(foto.ancho, foto.alto)).toBeLessThanOrEqual(LADO_MAX_PX);

    // Quien la sacó la ve, en WebP, sin metadatos y sin pasar por cachés compartidas.
    const ruta = new URL(foto.url, PUBLICA).pathname;
    const propia = await page.request.get(`${PUBLICA}${ruta}`);
    expect(propia.status()).toBe(200);
    expect(propia.headers()['content-type']).toBe('image/webp');
    expect(propia.headers()['cache-control']).toContain('no-store');
    const webp = leerWebp(await propia.body());
    expect({ ancho: webp.ancho, alto: webp.alto }).toEqual({ ancho: foto.ancho, alto: foto.alto });
    expect(webp.trozos.filter((t) => TROZOS_DE_METADATOS.includes(t))).toEqual([]);

    // Todavía sin reporte, nadie más: ni otro navegador sin sesión (por la app y directo a la
    // API) ni un técnico.
    const ajeno = await browser.newContext();
    try {
      for (const origen of [PUBLICA, API]) {
        const r = await ajeno.request.get(`${origen}${ruta}`);
        expect(r.status(), `sin sesión, por ${origen}`).toBe(404);
      }
    } finally {
      await ajeno.close();
    }
    await loginTecnico(request);
    expect((await request.get(`${API}${ruta}`)).status(), 'un técnico').toBe(404);

    // Y el reporte sale con esa foto.
    await page
      .locator('textarea[name="descripcion"]')
      .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. camara-${Date.now()}`);
    await continuar(page);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.fotos).toEqual([foto.objeto_key]);
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    expect(abrioSelector, 'nada abrió un selector de archivos').toBe(false);
  });
});

test.describe('sin permiso de cámara', () => {
  // Como quien toca «Bloquear» en el aviso del navegador: el contexto no da la cámara y
  // `getUserMedia` responde `NotAllowedError` de verdad (ver playwright.config.ts). La ubicación
  // sí, que sin ella no se llega al paso de fotos.
  test.use({ permissions: ['geolocation'] });

  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('«Sacar foto» explica cómo habilitarla, no deja la cámara prendida y el reporte se envía sin foto', async ({
    page,
  }) => {
    const camara = await vigilarCamara(page);
    await cuentaNuevaEnElNavegador(page, 'camara-denegada-');
    await abrirFormulario(page);
    await compartirUbicacion(page);
    await llegarAFotos(page);

    await page.getByTestId('boton-sacar-foto').click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'No diste permiso para usar la cámara' }),
    ).toBeVisible();
    await expect(dialogoCamara(page)).toBeHidden();
    const vigilada = await camara();
    expect(vigilada.pedidos, 'la cámara se pidió una vez, al tocar el botón').toHaveLength(1);
    expect(vigilada.encendidas).toBe(0);
    await expect(page.getByTestId('boton-sacar-foto')).toBeEnabled();

    await page
      .locator('textarea[name="descripcion"]')
      .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. sin-camara-${Date.now()}`);
    await continuar(page);
    const cuerpo = await enviarYLeerCuerpo(page);
    expect(cuerpo.fotos ?? []).toEqual([]);
    await expect(page.getByTestId('reporte-creado')).toBeVisible();
  });
});
