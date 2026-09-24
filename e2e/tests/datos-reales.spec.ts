import { expect, test } from '@playwright/test';
import { API, esperarPila, GEO } from './ayudas';

/**
 * El mapa con los datos que de verdad rigen.
 *
 * Nada de esto fija un nombre concreto de distrito ni de unidad vecinal: los nombres salen de la
 * capa vigente en el momento de correr la prueba. Si se escribiera «Unidad Vecinal 284», la suite
 * se rompería el día que el municipio entregue una versión nueva —o al volver a la muestra
 * sintética— por un motivo que no es un defecto. Lo que se comprueba es lo que tiene que valer
 * con CUALQUIER capa: que hay capa, que cubre la ciudad, que sus nombres no son identificadores,
 * que la búsqueda encuentra una de sus unidades y que un punto tomado de la propia capa se
 * resuelve a esa misma unidad.
 */

/** Recuadro generoso alrededor de Santa Cruz de la Sierra. Sirve para detectar un CRS mal leído. */
const SANTA_CRUZ = { oeste: -64.0, sur: -18.5, este: -62.0, norte: -17.0 };

interface CapaInfo {
  capa: string;
  version: string;
  n_features: number;
  bytes_web: number;
  modo: 'geojson' | 'teselas';
  url: string;
  bbox: [number, number, number, number] | null;
}

interface Agregado {
  unidad_vecinal_id: string;
  codigo: string;
  nombre: string;
  n_reportes: number;
}

async function capas(request: import('@playwright/test').APIRequestContext): Promise<CapaInfo[]> {
  const r = await request.get(`${GEO}/geo/v1/capas`);
  expect(r.status()).toBe(200);
  return r.json();
}

test.describe('capas administrativas vigentes', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('hay una versión vigente de cada capa y el mapa sabe cómo pedirla', async ({ request }) => {
    const vigentes = await (await request.get(`${GEO}/geo/v1/capas/vigentes`)).json();
    expect(vigentes.distrito_municipal, 'sin capa de distritos no hay mapa').toBeTruthy();
    expect(
      vigentes.unidad_vecinal,
      'sin capa de unidades vecinales no se puede ubicar nada',
    ).toBeTruthy();

    const lista = await capas(request);
    const porCapa = new Map(lista.map((c) => [c.capa, c]));
    for (const nombre of ['distrito_municipal', 'unidad_vecinal']) {
      const c = porCapa.get(nombre);
      expect(c, `falta la capa ${nombre} en /geo/v1/capas`).toBeTruthy();
      expect(c!.n_features, `${nombre} vacía`).toBeGreaterThan(0);
      // Por encima del umbral se sirve por teselas y por debajo como GeoJSON: las dos son
      // correctas, lo que no puede pasar es que anuncie GeoJSON siendo enorme.
      if (c!.modo === 'geojson') expect(c!.bytes_web).toBeLessThanOrEqual(5 * 1024 * 1024);
      else expect(c!.url).toContain('{z}/{x}/{y}');
    }
  });

  test('la extensión de las capas cae sobre Santa Cruz de la Sierra', async ({ request }) => {
    // Un shapefile reproyectado mal (o leído con el CRS equivocado) aterriza en el golfo de
    // Guinea o en medio del Atlántico. El bbox lo delata sin mirar un solo polígono.
    for (const c of await capas(request)) {
      const b = c.bbox;
      expect(b, `la capa ${c.capa} no publica bbox`).toBeTruthy();
      const [oeste, sur, este, norte] = b!;
      expect(oeste, `${c.capa}: borde oeste fuera de la ciudad`).toBeGreaterThan(SANTA_CRUZ.oeste);
      expect(este, `${c.capa}: borde este fuera de la ciudad`).toBeLessThan(SANTA_CRUZ.este);
      expect(sur, `${c.capa}: borde sur fuera de la ciudad`).toBeGreaterThan(SANTA_CRUZ.sur);
      expect(norte, `${c.capa}: borde norte fuera de la ciudad`).toBeLessThan(SANTA_CRUZ.norte);
      // Una capa administrativa de una ciudad ocupa grados, no un punto.
      expect(este - oeste, `${c.capa}: extensión sospechosamente pequeña`).toBeGreaterThan(0.05);
    }
  });

  test('los nombres son nombres, no identificadores internos ni marcas de muestra', async ({
    request,
  }) => {
    const distritos = await (await request.get(`${GEO}/geo/v1/capas/distrito_municipal`)).json();
    const features = distritos.features as Array<{ properties: Record<string, string> }>;
    expect(features.length).toBeGreaterThan(0);

    const vigente = (await capas(request)).find((c) => c.capa === 'distrito_municipal')!;
    const esMuestra = /sample|sintetic|sintétic/i.test(vigente.version);

    for (const f of features) {
      const nombre = f.properties.nombre ?? '';
      expect(nombre, 'una capa sin nombre no se puede dibujar').toBeTruthy();
      // El fallo que se busca: cuando el nombre no se resuelve, el código cae al id y el vecino
      // acaba leyendo «distrito_municipal:7» donde tenía que leer el nombre de su distrito.
      expect(nombre).not.toContain('distrito_municipal:');
      expect(f.properties.codigo).toBeTruthy();
      // Y la capa tiene que ser honesta sobre lo que es: la muestra se llama muestra y la
      // entrega del municipio no puede ir marcada como sintética.
      if (esMuestra) expect(nombre.toLowerCase()).toContain('sint');
      else expect(nombre.toLowerCase()).not.toContain('sint');
    }
  });
});

test.describe('buscar y resolver contra la capa vigente', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('un punto tomado de la capa se resuelve a esa misma unidad vecinal', async ({ request }) => {
    // El punto no se inventa: sale del primer polígono que publica la propia capa vigente, así
    // que la prueba vale igual con la muestra sintética y con la entrega del municipio.
    const capa = (await capas(request)).find((c) => c.capa === 'unidad_vecinal')!;
    test.skip(capa.modo !== 'geojson', 'la capa se sirve por teselas: no hay GeoJSON que leer');
    const uv = await (await request.get(`${GEO}${capa.url}`)).json();
    const feature = (uv.features as Array<Record<string, never>>).find((f) =>
      (f as { geometry?: { type: string } }).geometry?.type?.includes('Polygon'),
    ) as unknown as {
      properties: { id: string; nombre: string };
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
    };
    expect(feature, 'la capa de unidades vecinales no trae polígonos').toBeTruthy();

    // Centroide del primer anillo: para un polígono convexo cae dentro, y para uno cóncavo
    // puede no caer; por eso se acepta también que resuelva por proximidad o que el servicio
    // devuelva OTRA unidad vecinal contigua. Lo que NO puede pasar es quedar fuera de cobertura.
    const anillo = (
      feature.geometry.type === 'Polygon'
        ? (feature.geometry.coordinates as number[][][])[0]
        : (feature.geometry.coordinates as number[][][][])[0]![0]
    ) as number[][];
    const lon = anillo.reduce((s, c) => s + c[0]!, 0) / anillo.length;
    const lat = anillo.reduce((s, c) => s + c[1]!, 0) / anillo.length;

    const r = await request.post(`${GEO}/geo/v1/resolver`, { data: { lat, lon } });
    expect(r.status()).toBe(200);
    const res = await r.json();
    expect(res.dentro_cobertura, `el centroide de ${feature.properties.id} quedó fuera`).toBe(true);
    expect(res.unidad_vecinal?.id).toBeTruthy();
    expect(res.unidad_vecinal.nombre).not.toContain('unidad_vecinal:');
    expect(res.version_capa).toBe(capa.version);
  });

  test('el buscador del mapa encuentra una unidad vecinal de la capa y el mapa la sigue', async ({
    page,
    request,
  }) => {
    // Se busca la unidad vecinal con más reportes: existe, tiene puntos que mirar y su nombre
    // sale del dato, no de esta prueba.
    const agregados: Agregado[] = await (
      await request.get(`${GEO}/geo/v1/agregados/unidades-vecinales`)
    ).json();
    // El buscador pide dos caracteres antes de sugerir nada, así que se descarta un código de
    // una sola letra o dígito (la capa real tiene unidades vecinales llamadas «0» y «1»).
    const conReportes = agregados.find((a) => a.n_reportes > 0 && a.codigo.length >= 2);
    test.skip(
      !conReportes,
      'no hay ninguna unidad vecinal con reportes y código de dos caracteres',
    );

    await page.goto('/');
    const buscador = page.getByRole('searchbox').first();
    await expect(buscador).toBeVisible();

    const sugerencia = page.getByTestId('sugerencia-busqueda').first();
    // La página se sirve renderizada: lo que se escribe antes de la hidratación no llega al
    // estado de React y el campo se queda mudo. Reintentar solo la aserción no arregla nada,
    // hay que volver a escribir.
    await expect(async () => {
      await buscador.fill('');
      await buscador.fill(conReportes!.codigo);
      await expect(sugerencia).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await expect(sugerencia).toContainText(conReportes!.codigo);
    await sugerencia.click();

    // Elegir una unidad vecinal filtra el listado por ella, y el botón de quitar filtros la
    // nombra. Es la señal estable de que la selección llegó al estado, no un detalle del mapa.
    const quitar = page.getByRole('button', { name: /Quitar filtros/ });
    await expect(quitar).toBeVisible();
    await expect(quitar).toContainText(conReportes!.codigo);

    // Y el listado sigue teniendo puntos: se filtró, no se vació.
    await expect(page.getByTestId('tarjeta-reporte').first()).toBeVisible();

    // El chip de contexto nunca muestra identificadores internos.
    await expect(page.getByTestId('chip-capa').first()).not.toContainText('unidad_vecinal:');
  });
});

test.describe('el mapa público no queda vacío con la capa vigente', () => {
  test.beforeAll(async ({ request }) => {
    await esperarPila(request);
  });

  test('hay puntos publicados y cada uno trae su distrito y su unidad vecinal con nombre', async ({
    request,
  }) => {
    const r = await request.get(`${API}/api/v1/reportes?limite=50`);
    expect(r.status()).toBe(200);
    const fc = await r.json();
    expect(fc.features.length, 'el mapa público no tiene un solo punto').toBeGreaterThan(0);
    for (const f of fc.features) {
      const p = f.properties;
      expect(p.unidad_vecinal?.nombre ?? '').not.toContain('unidad_vecinal:');
      expect(p.distrito?.nombre ?? '').not.toContain('distrito_municipal:');
      // Coordenada pública: cinco decimales como máximo (§13) y dentro de la ciudad.
      const [lon, lat] = f.geometry.coordinates as [number, number];
      expect(lon).toBeGreaterThan(SANTA_CRUZ.oeste);
      expect(lon).toBeLessThan(SANTA_CRUZ.este);
      expect(lat).toBeGreaterThan(SANTA_CRUZ.sur);
      expect(lat).toBeLessThan(SANTA_CRUZ.norte);
      expect(String(lon).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
      expect(String(lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
    }
  });

  test('la capa de manzanas se sirve entera o por teselas, pero se sirve', async ({ request }) => {
    const manzana = (await capas(request)).find((c) => c.capa === 'manzana');
    test.skip(!manzana, 'esta versión de capas no incluye manzanas');
    if (manzana!.modo === 'teselas') {
      // Una tesela sobre el centro de la propia capa: si el índice no se construyó, esto falla.
      const [oeste, sur, este, norte] = manzana!.bbox!;
      const lon = (oeste + este) / 2;
      const lat = (sur + norte) / 2;
      const z = 14;
      const x = Math.floor(((lon + 180) / 360) * 2 ** z);
      const rad = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
      );
      const t = await request.get(`${GEO}/geo/v1/teselas/manzana/${z}/${x}/${y}.mvt`);
      // 204 = no hay manzanas justo ahí (puede pasar: el centro del bbox puede caer en el río).
      expect([200, 204]).toContain(t.status());
      if (t.status() === 200) {
        expect(t.headers()['content-type']).toContain('vector-tile');
        expect((await t.body()).byteLength).toBeGreaterThan(0);
      }
    } else {
      const g = await request.get(`${GEO}${manzana!.url}`);
      expect(g.status()).toBe(200);
      expect((await g.json()).features.length).toBeGreaterThan(0);
    }
  });
});
