import { expect, test } from '@playwright/test';
import {
  API,
  esperarPila,
  GEO,
  loginTecnico,
  PNG_1X1,
  PUNTO_CENTRO,
  PUNTO_FUERA,
  reporteValido,
  tesela,
} from './ayudas';

test.describe('contratos de la API (sin navegador)', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('los servicios reportan su estado', async ({ request }) => {
    const listo = await (await request.get(`${API}/ready`)).json();
    expect(listo.ok).toBe(true);
    expect(listo.db).toBe('ok');
    expect(listo.geo).toBe('ok');
    const geo = await (await request.get(`${GEO}/health`)).json();
    expect(geo.servicio).toBe('geo-service');
  });

  test('point-in-polygon distingue dentro y fuera de la cobertura', async ({ request }) => {
    const dentro = await (
      await request.post(`${GEO}/geo/v1/resolver`, { data: PUNTO_CENTRO })
    ).json();
    expect(dentro.dentro_cobertura).toBe(true);
    expect(dentro.unidad_vecinal?.id).toBeTruthy();
    expect(dentro.distrito?.id).toBeTruthy();
    expect(dentro.version_capa).toBeTruthy();

    const fuera = await (
      await request.post(`${GEO}/geo/v1/resolver`, { data: PUNTO_FUERA })
    ).json();
    expect(fuera.dentro_cobertura).toBe(false);
    expect(fuera.unidad_vecinal).toBeNull();
  });

  test('la creación de reportes valida el payload, el honeypot y la cobertura', async ({
    request,
  }) => {
    const corto = await request.post(`${API}/api/v1/reportes`, {
      data: { ...reporteValido('corto'), descripcion: 'agua' },
    });
    expect(corto.status()).toBe(400);
    const cuerpo = await corto.json();
    expect(cuerpo.codigo).toBe('PAYLOAD_INVALIDO');
    expect(cuerpo.detalles[0].campo).toBe('descripcion');

    const bot = await request.post(`${API}/api/v1/reportes`, {
      data: { ...reporteValido('spam'), sitio_web: 'http://spam' },
    });
    expect(bot.status()).toBe(400);

    const fuera = await request.post(`${API}/api/v1/reportes`, {
      data: { ...reporteValido('fuera'), ...PUNTO_FUERA },
    });
    expect(fuera.status()).toBe(422);
    expect((await fuera.json()).codigo).toBe('FUERA_DE_COBERTURA');
  });

  test('la exportación exige sesión de técnico', async ({ request }) => {
    const anonimo = await request.get(`${API}/api/v1/exportar?formato=csv`);
    expect(anonimo.status()).toBe(401);
    await loginTecnico(request);
    const conSesion = await request.get(`${API}/api/v1/exportar?formato=geojson`);
    expect(conSesion.status()).toBe(200);
    expect((await conSesion.json()).nota_metodologica).toContain('percepción');
  });

  test('las capas se sirven como GeoJSON o teselas según su tamaño', async ({ request }) => {
    const capas = await (await request.get(`${GEO}/geo/v1/capas`)).json();
    expect(capas.map((c: { capa: string }) => c.capa).sort()).toEqual([
      'distrito_municipal',
      'manzana',
      'unidad_vecinal',
    ]);
    for (const c of capas) {
      expect(c.n_features).toBeGreaterThan(0);
      expect(['geojson', 'teselas']).toContain(c.modo);
    }
    const { x, y, z } = tesela(PUNTO_CENTRO.lat, PUNTO_CENTRO.lon, 15);
    const t = await request.get(`${GEO}/geo/v1/teselas/unidad_vecinal/${z}/${x}/${y}.mvt`);
    expect([200, 204]).toContain(t.status());
    if (t.status() === 200) {
      expect(t.headers()['content-type']).toBe('application/vnd.mapbox-vector-tile');
      expect((await t.body()).length).toBeGreaterThan(10);
    }
  });

  test('las fotos se guardan sin metadatos EXIF', async ({ request }) => {
    const r = await request.post(`${API}/api/v1/fotos`, {
      multipart: { archivo: { name: 'charco.png', mimeType: 'image/png', buffer: PNG_1X1 } },
    });
    expect(r.status()).toBe(201);
    const foto = await r.json();
    expect(foto.exif_sanitizado).toBe(true);
    expect(foto.mime).toBe('image/jpeg');
    const servida = await request.get(`${API}${new URL(foto.url, API).pathname}`);
    expect(servida.status()).toBe(200);
  });

  test('rechaza archivos que no son imágenes aunque la extensión mienta', async ({ request }) => {
    const r = await request.post(`${API}/api/v1/fotos`, {
      multipart: {
        archivo: {
          name: 'falsa.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('<html>no soy una imagen</html>'),
        },
      },
    });
    expect(r.status()).toBe(415);
  });
});
