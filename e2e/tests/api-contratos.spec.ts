import { expect, test } from '@playwright/test';
import {
  API,
  crearReportePublicadoPorApi,
  cuentaNuevaConSesion,
  esperarPila,
  GEO,
  leerWebp,
  loginTecnico,
  PNG_1X1,
  PRECISION_GPS_M,
  PUNTO_CENTRO,
  PUNTO_FUERA,
  REPORTES_POR_DIA,
  reporteValido,
  TROZOS_DE_METADATOS,
  tesela,
} from './ayudas';

const DIA_MS = 86_400_000;

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

  test('sin sesión no se puede crear un reporte ni subir una foto', async ({ request }) => {
    // Los dos caminos de escritura de la app pública exigen cuenta desde la Fase 5: el límite
    // por IP no resiste a una IP dinámica y sin identidad no hay nada estable que limitar.
    const reporte = await request.post(`${API}/api/v1/reportes`, {
      data: reporteValido('sin-sesion'),
    });
    expect(reporte.status()).toBe(401);
    expect((await reporte.json()).codigo).toBe('SIN_SESION');
    const foto = await request.post(`${API}/api/v1/fotos`, {
      multipart: { archivo: { name: 'x.png', mimeType: 'image/png', buffer: PNG_1X1 } },
    });
    expect(foto.status()).toBe(401);
  });

  test('la creación de reportes valida el payload, el honeypot y la cobertura', async ({
    request,
  }) => {
    // Cuenta nueva y no la del seed: si alguno de los tres pasara por error, gastaría el cupo del
    // día de una cuenta que comparte toda la suite.
    await cuentaNuevaConSesion(request, 'validacion-');
    // Los tres casos se rechazan ANTES de tocar el cupo: dos en la validación del cuerpo y el
    // tercero al resolver la unidad vecinal, los tres fuera de la transacción. Por eso pueden
    // ir seguidos con la misma cuenta.
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

    // El teléfono va en el mismo punto: si no, el rechazo sería por el radio de 60 m, que se
    // comprueba antes que la cobertura.
    const fuera = await request.post(`${API}/api/v1/reportes`, {
      data: reporteValido('fuera', PUNTO_FUERA),
    });
    expect(fuera.status()).toBe(422);
    expect((await fuera.json()).codigo).toBe('FUERA_DE_COBERTURA');

    // Ninguno gastó el cupo del día.
    const yo = await (await request.get(`${API}/api/v1/auth/yo`)).json();
    expect(yo.reportes_restantes_hoy).toBe(REPORTES_POR_DIA);
  });

  test('CA-X1: el payload sin duración ni afectación crea un reporte con severidad v2', async ({
    request,
  }) => {
    // `reporteValido` ya no lleva esos dos campos: si la API todavía los exige, esto es 400. La
    // vista técnica lo muestra recién pasada su demora de publicación.
    const id = await crearReportePublicadoPorApi(request, `E2E-X1-${Date.now()}`);
    const r = await request.get(`${API}/api/v1/tecnico/reportes/${id}`);
    expect(r.status()).toBe(200);
    const p = (await r.json()).properties;
    expect(p.estado).toBe('nuevo');
    expect(p.unidad_vecinal?.id).toBeTruthy();
    // Severidad v2: 2·2 (rodilla) + 3 (cada lluvia fuerte) = 7 → media.
    expect(p.severidad_calculada).toBe('media');
    expect(p.severidad_puntaje).toBe(7);
    // El punto en la posición del teléfono (contracts 0.9.0): el método lo deriva el servidor.
    expect(p.ubicacion_metodo).toBe('gps');
    expect(p.precision_gps_m).toBe(PRECISION_GPS_M);
    expect(p.distancia_dispositivo_m).toBe(0);
  });

  test('la exportación exige sesión de técnico', async ({ request }) => {
    const anonimo = await request.get(`${API}/api/v1/exportar?formato=csv`);
    expect(anonimo.status()).toBe(401);
    await loginTecnico(request);
    const conSesion = await request.get(`${API}/api/v1/exportar?formato=geojson`);
    expect(conSesion.status()).toBe(200);
    expect((await conSesion.json()).nota_metodologica).toContain('percepción');
  });

  test('la exportación dice cuántos reportes trae de cuántos y avisa si se recortó', async ({
    request,
  }) => {
    await loginTecnico(request);
    const entera = await request.get(`${API}/api/v1/exportar?formato=geojson`);
    expect(entera.status()).toBe(200);
    const e = await entera.json();
    expect(e.type).toBe('FeatureCollection');
    expect(typeof e.generado_en).toBe('string');
    expect(e.exportados).toBe(e.features.length);
    // Sin `limite`, el tope es EXPORTAR_MAX_FILAS (50 000): la base local cabe entera.
    expect(e.truncado).toBe(false);
    expect(e.total).toBe(e.exportados);
    expect(entera.headers()['x-curichi-truncado']).toBeUndefined();
    expect(
      e.total,
      'hace falta más de un reporte para recortar (`pnpm db:seed:samples`)',
    ).toBeGreaterThan(1);

    // Con un tope menor que la selección: el archivo lo dice y la cabecera también.
    const recortada = await request.get(`${API}/api/v1/exportar?formato=geojson&limite=1`);
    expect(recortada.status()).toBe(200);
    const r = await recortada.json();
    expect(r.exportados).toBe(1);
    expect(r.features).toHaveLength(1);
    expect(r.total).toBe(e.total);
    expect(r.truncado).toBe(true);
    expect(recortada.headers()['x-curichi-truncado']).toBe('1');

    const csv = await request.get(`${API}/api/v1/exportar?formato=csv&limite=1`);
    expect(csv.status()).toBe(200);
    const texto = await csv.text();
    expect(texto).toContain(`· 1 de ${e.total} reportes ·`);
    expect(texto).toContain('# INCOMPLETO');
  });

  test('fusionar un reporte consigo mismo da 409, también con el id en mayúsculas', async ({
    request,
  }) => {
    // Publicado: mientras espera su demora, la moderación responde 404 y no llegaría al 409.
    const id = await crearReportePublicadoPorApi(request, `E2E-FUSION-${Date.now()}`);

    // Antes el id en mayúsculas pasaba la comprobación de «distinto» y el reporte quedaba
    // duplicado de sí mismo.
    const atajo = await request.post(`${API}/api/v1/reportes/${id.toUpperCase()}/fusionar`, {
      data: { canonico_id: id, motivo: 'Prueba E2E de fusión' },
    });
    expect(atajo.status(), await atajo.text()).toBe(409);
    expect((await atajo.json()).codigo).toBe('FUSION_CONSIGO_MISMO');

    const porEstado = await request.patch(`${API}/api/v1/reportes/${id}/estado`, {
      data: { estado: 'duplicado', estado_motivo: 'Prueba E2E', fusionado_en_id: id.toUpperCase() },
    });
    expect(porEstado.status(), await porEstado.text()).toBe(409);
    expect((await porEstado.json()).codigo).toBe('FUSION_CONSIGO_MISMO');

    const sigue = await request.get(`${API}/api/v1/tecnico/reportes/${id}`);
    expect((await sigue.json()).properties.estado).toBe('nuevo');
  });

  test('evento_en posterior a ahora o de hace más de un año se rechaza con 400', async ({
    request,
  }) => {
    await cuentaNuevaConSesion(request, 'evento-');
    // La validación del cuerpo va antes de la cuota: los rechazos no gastan el turno de la cuenta.
    for (const [caso, fecha] of [
      ['dentro de dos días', new Date(Date.now() + 2 * DIA_MS).toISOString()],
      ['2099', '2099-01-01T12:00:00.000Z'],
      ['hace 400 días', new Date(Date.now() - 400 * DIA_MS).toISOString()],
    ] as const) {
      const r = await request.post(`${API}/api/v1/reportes`, {
        data: { ...reporteValido(`E2E-evento-${caso}`), evento_en: fecha },
      });
      expect(r.status(), caso).toBe(400);
      const cuerpo = await r.json();
      expect(cuerpo.codigo, caso).toBe('PAYLOAD_INVALIDO');
      expect(
        (cuerpo.detalles as Array<{ campo: string }>).map((d) => d.campo),
        caso,
      ).toContain('evento_en');
    }

    // Ayer sí: el campo no se rechaza entero.
    const ayer = await request.post(`${API}/api/v1/reportes`, {
      data: {
        ...reporteValido('E2E-evento-ayer'),
        evento_en: new Date(Date.now() - DIA_MS).toISOString(),
      },
    });
    expect(ayer.status(), await ayer.text()).toBe(201);
  });

  test('un JSON mal formado responde 400 PAYLOAD_INVALIDO, sin códigos internos de Fastify', async ({
    request,
  }) => {
    await cuentaNuevaConSesion(request, 'json-roto-');
    for (const ruta of ['/api/v1/reportes', '/api/v1/auth/login']) {
      const r = await request.post(`${API}${ruta}`, {
        headers: { 'content-type': 'application/json' },
        data: '{"lat": -17.78, "lon":',
      });
      expect(r.status(), ruta).toBe(400);
      const texto = await r.text();
      // Antes salía `FST_ERR_CTP_INVALID_JSON_BODY` con el mensaje interno en inglés.
      expect(texto, ruta).not.toContain('FST_');
      const cuerpo = JSON.parse(texto);
      expect(cuerpo.codigo, ruta).toBe('PAYLOAD_INVALIDO');
      expect(cuerpo.mensaje, ruta).toBeTruthy();
    }
  });

  test('GET /api/v1/configuracion publica la ciudad del despliegue, válida y cacheable', async ({
    playwright,
    request,
  }) => {
    const anonimo = await playwright.request.newContext();
    try {
      const r = await anonimo.get(`${API}/api/v1/configuracion`);
      expect(r.status()).toBe(200);
      // Es la misma para cualquiera: una caché compartida puede guardarla.
      expect(r.headers()['cache-control'] ?? '').toMatch(/^public\b.*max-age=\d+/);
      const cuerpo = await r.json();
      expect(Object.keys(cuerpo)).toEqual(['ciudad']);
      const c = cuerpo.ciudad;
      expect(Object.keys(c).sort()).toEqual(
        ['centro', 'locale', 'nombre', 'pais', 'zona_horaria', 'zoom_inicial'].sort(),
      );
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.nombre).toBe(c.nombre.trim());
      expect(c.pais).toMatch(/^[A-Z]{2}$/);
      // Lo que rompería `Intl` en el navegador de cada visitante tiene que fallar acá.
      expect(() => new Intl.DateTimeFormat('es', { timeZone: c.zona_horaria })).not.toThrow();
      expect(Intl.getCanonicalLocales(c.locale)).toEqual([c.locale]);
      expect(c.centro.lon).toBeGreaterThanOrEqual(-180);
      expect(c.centro.lon).toBeLessThanOrEqual(180);
      expect(c.centro.lat).toBeGreaterThanOrEqual(-90);
      expect(c.centro.lat).toBeLessThanOrEqual(90);
      expect(c.zoom_inicial).toBeGreaterThanOrEqual(0);
      expect(c.zoom_inicial).toBeLessThanOrEqual(22);

      // Pública de verdad: con una sesión puesta no cambia ni un byte.
      await loginTecnico(request);
      const conSesion = await request.get(`${API}/api/v1/configuracion`);
      expect(await conSesion.text()).toBe(await r.text());
    } finally {
      await anonimo.dispose();
    }
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

  test('las fotos se guardan en WebP sin metadatos y, sin reporte, solo las ve quien las subió', async ({
    request,
    playwright,
  }) => {
    // Cuenta nueva: la del seed tiene cupo de fotos y la suite puede correr varias veces seguidas.
    await cuentaNuevaConSesion(request, 'foto-');
    const r = await request.post(`${API}/api/v1/fotos`, {
      multipart: { archivo: { name: 'charco.png', mimeType: 'image/png', buffer: PNG_1X1 } },
    });
    expect(r.status(), await r.text()).toBe(201);
    const foto = await r.json();
    expect(foto.exif_sanitizado).toBe(true);
    // Entra un PNG y sale WebP (contracts 0.8.0).
    expect(foto.mime).toBe('image/webp');
    expect(foto.objeto_key).toMatch(/^[a-f0-9-]{36}\.webp$/);

    const ruta = new URL(foto.url, API).pathname;
    const servida = await request.get(`${API}${ruta}`);
    expect(servida.status()).toBe(200);
    expect(servida.headers()['content-type']).toBe('image/webp');
    expect(servida.headers()['x-content-type-options']).toBe('nosniff');
    expect(servida.headers()['cache-control']).toBe('private, no-store');
    const webp = leerWebp(await servida.body());
    expect({ ancho: webp.ancho, alto: webp.alto }).toEqual({ ancho: foto.ancho, alto: foto.alto });
    expect(webp.trozos.filter((t) => TROZOS_DE_METADATOS.includes(t))).toEqual([]);

    // Todavía sin reporte, nadie más la ve: ni sin sesión ni un técnico.
    const anonimo = await playwright.request.newContext();
    const tecnico = await playwright.request.newContext();
    try {
      expect((await anonimo.get(`${API}${ruta}`)).status(), 'sin sesión').toBe(404);
      await loginTecnico(tecnico);
      expect((await tecnico.get(`${API}${ruta}`)).status(), 'un técnico').toBe(404);
    } finally {
      await anonimo.dispose();
      await tecnico.dispose();
    }
    // Solo .webp y las .jpg anteriores: otra extensión no existe, aunque el nombre sea el mismo.
    const otra = await request.get(`${API}${ruta.replace(/\.webp$/, '.png')}`);
    expect(otra.status()).toBe(404);
  });

  test('rechaza archivos que no son imágenes aunque la extensión mienta', async ({ request }) => {
    // Cuenta nueva: la del seed comparte con toda la suite su cupo de 12 fotos por día.
    await cuentaNuevaConSesion(request, 'foto-falsa-');
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
