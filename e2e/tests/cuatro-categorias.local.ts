import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import type {
  ExportacionGeoJson,
  MiReporteFeature,
  ReporteFeatureCollection,
  SesionActual,
} from '../../packages/contracts/dist/index.js';

// La config valida las cuatro URLs juntas ANTES de crear el navegador o enviar tráfico.
const WEB = process.env.MULTITEMATICA_E2E_WEB ?? 'http://127.0.0.2:4000';
const API = process.env.MULTITEMATICA_E2E_API ?? 'http://127.0.0.2:4001';
const GEO = process.env.MULTITEMATICA_E2E_GEO ?? 'http://127.0.0.2:4002';
const PANEL = process.env.MULTITEMATICA_E2E_PANEL ?? 'http://127.0.0.2:4100';
const PERSONA =
  'Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona.';
const QUEMA = 'Reportar quema de basura no sustituye la atención de emergencias.';
const AGUA = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
] as const;
const CASOS = [
  { slug: 'inundacion', nombre: 'Inundaciones', url: 'inundacion', severidad: 'media' },
  { slug: 'bache', nombre: 'Baches', url: 'bache', severidad: 'alta' },
  { slug: 'basura', nombre: 'Basura', url: 'basura', severidad: 'critica' },
  { slug: 'area_verde', nombre: 'Áreas verdes', url: 'area-verde', severidad: 'alta' },
] as const;
type Caso = (typeof CASOS)[number];
type Creado = { caso: Caso; id: string; publicarEn: number; descripcion: string; fotos: number };
type Cuenta = { email: string; password: string };
type Evento = Record<string, string | number | boolean>;
type Punto = { lat: number; lon: number };

const MARGEN_CAJA = 0.002;
const PUNTO_CHROMIUM = 'MULTITEMATICA_E2E_PUNTO_CHROMIUM';
const PUNTO_MOVIL = 'MULTITEMATICA_E2E_PUNTO_MOVIL';
const puntosDeCorrida = leerPuntosDeCorrida();
let cuenta: Cuenta;
let punto: Punto;
let marca: string;
const creados: Creado[] = [];
let eventos: Evento[] = [];
let erroresPagina: string[] = [];
let pendientes: Promise<void>[] = [];

function huella(valor: string | Buffer): string {
  return createHash('sha256').update(valor).digest('hex');
}

function clase(texto: string): string {
  if (/webgl|context.*lost/i.test(texto)) return 'webgl';
  if (/content.security|csp|refused to/i.test(texto)) return 'csp';
  if (/worker/i.test(texto)) return 'worker';
  if (/network|fetch|load/i.test(texto)) return 'red';
  return 'otro';
}

function recurso(urlCruda: string): string {
  try {
    const url = new URL(urlCruda);
    if (url.protocol === 'blob:') return 'blob-worker';
    if (url.hostname !== new URL(WEB).hostname)
      return /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) ? 'osm' : 'externo';
    if (url.pathname.includes('worker')) return 'worker-local';
    if (url.pathname.startsWith('/geo/')) return 'geo';
    if (url.pathname.startsWith('/api/')) return 'api';
    if (url.pathname.startsWith('/_next/')) return 'next';
    return 'documento-local';
  } catch {
    return 'desconocido';
  }
}

function registrar(evento: Evento) {
  if (eventos.length < 500) eventos.push(evento);
}

async function observar(page: Page) {
  page.on('console', (mensaje) => {
    if (['error', 'warning'].includes(mensaje.type()))
      registrar({
        tipo: 'consola',
        nivel: mensaje.type(),
        clase: clase(mensaje.text()),
        sha256: huella(mensaje.text()),
      });
  });
  page.on('pageerror', (error) => {
    const hash = huella(error.message);
    erroresPagina.push(hash);
    registrar({ tipo: 'pageerror', clase: clase(error.message), sha256: hash });
  });
  page.on('requestfailed', (peticion) =>
    registrar({
      tipo: 'recurso-fallido',
      recurso: recurso(peticion.url()),
      sha256: huella(peticion.failure()?.errorText ?? ''),
    }),
  );
  page.on('worker', (worker) => registrar({ tipo: 'worker', recurso: recurso(worker.url()) }));
  page.on('response', (respuesta) => {
    const tipo = recurso(respuesta.url());
    if (tipo === 'osm' && respuesta.ok())
      registrar({ tipo: 'raster-recibido', estado: respuesta.status() });
    if (respuesta.status() >= 400)
      registrar({ tipo: 'http-error', recurso: tipo, estado: respuesta.status() });
    if (tipo === 'worker-local' && respuesta.ok()) {
      const pendiente = respuesta
        .body()
        .then((bytes) => {
          registrar({
            tipo: 'worker-fuente',
            bytes: bytes.length,
            sha256: huella(bytes),
            mime: respuesta.headers()['content-type'] ?? '',
          });
        })
        .catch(() => registrar({ tipo: 'worker-fuente-no-disponible' }));
      pendientes.push(pendiente);
    }
  });
  await page.addInitScript(() => {
    // Solo observa eventos reales; no modifica sensores, mapas, red ni respuestas.
    const observados = { contextosPerdidos: 0, csp: 0 };
    Object.defineProperty(window, '__cuatroObservados', { value: observados });
    document.addEventListener(
      'webglcontextlost',
      () => {
        observados.contextosPerdidos++;
      },
      true,
    );
    document.addEventListener('securitypolicyviolation', () => {
      observados.csp++;
    });
  });
}

async function sesion(request: APIRequestContext): Promise<SesionActual> {
  const respuesta = await request.get(`${WEB}/api/v1/auth/yo`);
  expect(respuesta.status()).toBe(200);
  return respuesta.json();
}

async function entrarCiudadano(page: Page) {
  const respuesta = await page.request.post(`${WEB}/api/v1/auth/login`, { data: cuenta });
  expect(respuesta.status()).toBe(200);
  expect((await sesion(page.request)).rol).toBe('ciudadano');
}

async function continuar(page: Page, paso: number) {
  await expect(page.getByTestId('boton-siguiente')).toBeEnabled();
  await page.getByTestId('boton-siguiente').click();
  await expect(page.getByText(`Paso ${paso + 1} de 4`, { exact: true }).first()).toBeVisible();
}

async function elegir(page: Page, nombre: string, valor: string) {
  await page.locator(`input[name="${nombre}"][value="${valor}"]`).check();
}

async function avisos(page: Page, caso: Caso, revision = false) {
  if (caso.slug === 'area_verde') {
    await expect(page.getByText(PERSONA, { exact: true })).toBeVisible();
    if (revision) {
      const destino = page
        .locator('dt')
        .filter({ hasText: /^Destino previsto$/ })
        .locator('..')
        .locator('dd');
      await expect(destino).toContainText('Desarrollo Social');
      await expect(destino).toBeVisible();
    } else {
      await expect(page.getByText(/Destino previsto: Desarrollo Social/)).toBeVisible();
    }
    await expect(page.getByText(/No hay derivación municipal automática/)).toBeVisible();
  }
  if (caso.slug === 'basura') await expect(page.getByText(QUEMA, { exact: true })).toBeVisible();
}

async function responder(page: Page, caso: Caso) {
  if (caso.slug === 'inundacion') {
    await elegir(page, 'profundidad_estimada', 'rodilla');
    await elegir(page, 'frecuencia', 'ocasional');
    return;
  }
  await expect(
    page.locator('input[name="profundidad_estimada"], input[name="frecuencia"]'),
  ).toHaveCount(0);
  if (caso.slug === 'bache') {
    await elegir(page, 'subtipo', 'hundimiento_calzada');
    await elegir(page, 'detalle.gravedad_declarada', 'peligroso');
    await elegir(page, 'detalle.tamano', 'rueda');
  } else if (caso.slug === 'basura') {
    await elegir(page, 'subtipo', 'quema_basura');
    await avisos(page, caso);
    await elegir(page, 'subtipo', 'microbasural');
    await expect(page.getByText(QUEMA, { exact: true })).toHaveCount(0);
    await elegir(page, 'subtipo', 'quema_basura');
    await elegir(page, 'detalle.gravedad_declarada', 'quema_o_desague');
    await elegir(page, 'detalle.tamano', 'bolsas');
  } else {
    await elegir(page, 'subtipo', 'persona_situacion_calle');
    await avisos(page, caso);
    await elegir(page, 'subtipo', 'parque_plaza_descuidada');
    await expect(page.getByText(PERSONA, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Destino previsto: Parques y jardines/)).toBeVisible();
    await elegir(page, 'subtipo', 'persona_situacion_calle');
    await elegir(page, 'detalle.gravedad_declarada', 'riesgo');
    await elegir(page, 'detalle.tamano', 'rincon');
  }
  await avisos(page, caso);
}

async function fotografiar(page: Page) {
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByTestId('boton-sacar-foto').click();
  await expect(page.getByTestId('boton-disparo')).toBeEnabled();
  const cuadro = await page.locator('video').evaluate((v: HTMLVideoElement) => ({
    ancho: v.videoWidth,
    alto: v.videoHeight,
  }));
  expect(cuadro.ancho).toBeGreaterThan(0);
  expect(cuadro.alto).toBeGreaterThan(0);
  await page.getByTestId('boton-disparo').click();
  await expect(page.getByTestId('boton-usar-foto')).toBeVisible();
  const [subida] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/fotos',
    ),
    page.getByTestId('boton-usar-foto').click(),
  ]);
  expect(subida.status()).toBe(201);
  await expect(page.getByTestId('foto-subiendo-mosaico')).toHaveCount(0);
  await expect(page.getByAltText('Foto que sacaste')).toBeVisible();
}

function leerPunto(variable: string, valor: string): Punto {
  const par = /^([+-]?(?:\d*\.)?\d+),([+-]?(?:\d*\.)?\d+)$/.exec(valor);
  const lat = Number(par?.[1]);
  const lon = Number(par?.[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    throw new Error(`${variable} debe ser un par decimal lat,lon en rango`);
  return { lat, lon };
}

function leerPuntosDeCorrida() {
  const valorChromium = process.env[PUNTO_CHROMIUM];
  const valorMovil = process.env[PUNTO_MOVIL];
  if (valorChromium === undefined && valorMovil === undefined) return;
  if (process.env.MULTITEMATICA_E2E_DESTINO !== 'curichi_multitematica')
    throw new Error('PUNTOS_E2E_REQUIEREN_DESTINO_EXPLICITO_CURICHI_MULTITEMATICA');
  if (valorChromium === undefined || valorMovil === undefined)
    throw new Error(`Se requieren ${PUNTO_CHROMIUM} y ${PUNTO_MOVIL} juntos`);

  const chromium = leerPunto(PUNTO_CHROMIUM, valorChromium);
  const movil = leerPunto(PUNTO_MOVIL, valorMovil);
  const [oeste, sur, este, norte] = limitesCaja(chromium);
  const [otroOeste, otroSur, otroEste, otroNorte] = limitesCaja(movil);
  if (oeste <= otroEste && otroOeste <= este && sur <= otroNorte && otroSur <= norte)
    throw new Error('CAJAS_E2E_SUPERPUESTAS');
  return { chromium, movil };
}

function limitesCaja({ lat, lon }: Punto) {
  return [lon - MARGEN_CAJA, lat - MARGEN_CAJA, lon + MARGEN_CAJA, lat + MARGEN_CAJA] as const;
}

function caja(centro = punto): string {
  // ~200 m: exigir vacío antes de crear; nunca usar ni moderar fixtures ajenos.
  return limitesCaja(centro).join(',');
}

async function verificarAreaLibre(request: APIRequestContext, centro: Punto) {
  const resuelta = await request.post(`${GEO}/geo/v1/resolver`, { data: centro });
  expect(resuelta.status()).toBe(200);
  expect((await resuelta.json()).dentro_cobertura).toBe(true);
  for (const caso of CASOS) {
    const respuesta = await request.get(
      `${API}/api/v1/reportes?categoria=${caso.slug}&bbox=${caja(centro)}`,
    );
    expect(respuesta.status()).toBe(200);
    const datos = (await respuesta.json()) as ReporteFeatureCollection;
    expect(
      datos.total,
      'Zona ocupada: conservar datos y pedir otro punto; no limpiar fixtures',
    ).toBe(0);
  }
}

function credenciales(rol: 'TECNICO' | 'ADMIN' | 'EJECUTIVO'): Cuenta | null {
  const email = process.env[`MULTITEMATICA_E2E_${rol}_EMAIL`];
  const password = process.env[`MULTITEMATICA_E2E_${rol}_PASSWORD`];
  if (Boolean(email) !== Boolean(password)) throw new Error(`CREDENCIALES_${rol}_INCOMPLETAS`);
  return email && password ? { email, password } : null;
}

async function entrarPanel(page: Page, datos: Cuenta, rol: string) {
  // Las credenciales de staff no entran en acciones fill ni capturas; el alta/login ciudadano
  // sí recorre las pantallas con contraseña sintética. El panel usa la cookie real de esta API.
  const respuesta = await page.request.post(`${PANEL}/api/v1/auth/login`, { data: datos });
  expect(respuesta.status()).toBe(200);
  expect((await sesion(page.request)).rol).toBe(rol);
  await page.goto(`${PANEL}/${rol === 'ejecutivo' ? 'ejecutivo' : 'reportes'}`);
}

function celdas(linea: string): string[] {
  const resultado: string[] = [];
  let valor = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i];
    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        valor += '"';
        i++;
      } else entreComillas = !entreComillas;
    } else if (caracter === ',' && !entreComillas) {
      resultado.push(valor);
      valor = '';
    } else valor += caracter;
  }
  resultado.push(valor);
  return resultado;
}

async function descargar(page: Page, formato: 'geojson' | 'csv') {
  const llegada = page.waitForEvent('download');
  await page.getByTestId(`exportar-${formato}`).click();
  const descarga = await llegada;
  expect(await descarga.failure()).toBeNull();
  const ruta = await descarga.path();
  expect(ruta).not.toBeNull();
  return readFile(ruta as string, 'utf8');
}

async function abrirExportacionPropia(page: Page, categoria: string) {
  await page.goto(`${PANEL}/reportes?categoria=${categoria}&bbox=${caja()}`);
  await page.getByTestId('seguir-mapa').uncheck();
  // La URL es una entrada pública del panel. Mantener el área explícita sin el sondeo del mapa.
  await page.evaluate(
    (url) => window.history.pushState(null, '', url),
    `${PANEL}/reportes?categoria=${categoria}&bbox=${caja()}`,
  );
  await expect
    .poll(async () => {
      const enlace = await page.getByTestId('exportar-csv').getAttribute('href');
      return enlace ? new URL(enlace, PANEL).searchParams.get('bbox') : null;
    })
    .toBe(caja());
}

test.describe
  .serial('Cuatro categorías locales: recorridos con datos sintéticos propios', () => {
    test.beforeAll(async ({ request }, info) => {
      if (
        (process.env.MULTITEMATICA_E2E_DESTINO !== 'curichi_multitematica' &&
          !['origen22', 'copia19', 'copia21', 'copia22'].some(
            (s) =>
              process.env.MULTITEMATICA_E2E_DESTINO ===
              `curichi_sdd_m10c_${process.env.MULTITEMATICA_E2E_RUN_ID}_${s}`,
          )) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(process.env.MULTITEMATICA_E2E_RUN_ID ?? '') ||
        info.config.workers !== 1 ||
        info.project.retries !== 0 ||
        info.repeatEachIndex !== 0
      )
        throw new Error('EJECUCION_LOCAL_SERIAL_SIN_REINTENTOS_REQUERIDA');
      marca = `Cuatro ${process.env.MULTITEMATICA_E2E_RUN_ID} ${info.project.name} ${randomUUID().slice(0, 8)}`;
      if (!credenciales('TECNICO'))
        throw new Error('FALTA_SECRETO_LOCAL_TECNICO_ANTES_DE_CREAR_DATOS');
      punto =
        info.project.name === 'movil'
          ? (puntosDeCorrida?.movil ?? { lat: -17.801217, lon: -63.175163 })
          : (puntosDeCorrida?.chromium ?? { lat: -17.792, lon: -63.18 });
      const configuracion = await request.get(`${API}/api/v1/configuracion`);
      expect(configuracion.status()).toBe(200);
      expect((await configuracion.json()).categorias_activas.slice().sort()).toEqual(
        CASOS.map((c) => c.slug).sort(),
      );
      await verificarAreaLibre(request, punto);
      // Chromium corre primero con un solo worker. Comprobar también el área móvil antes del alta.
      if (puntosDeCorrida && info.project.name === 'chromium')
        await verificarAreaLibre(request, puntosDeCorrida.movil);
    });

    test.beforeEach(async ({ page }) => {
      eventos = [];
      erroresPagina = [];
      pendientes = [];
      await observar(page);
      await page
        .context()
        .setGeolocation({ latitude: punto.lat, longitude: punto.lon, accuracy: 10 });
    });

    test.afterEach(async ({ page }, info: TestInfo) => {
      try {
        await Promise.race([
          Promise.allSettled(pendientes),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        if (!page.isClosed() && !/\/(login|ingresar|crear-cuenta)(\?|$)/.test(page.url())) {
          const mapa = await page.evaluate(() => ({
            canvas: Array.from(
              document.querySelectorAll<HTMLCanvasElement>('canvas.maplibregl-canvas'),
            ).map((c) => ({ ancho: c.width, alto: c.height })),
            observados: (
              window as unknown as {
                __cuatroObservados?: { contextosPerdidos: number; csp: number };
              }
            ).__cuatroObservados,
          }));
          await info.attach('mapa-observado.json', {
            body: JSON.stringify(mapa),
            contentType: 'application/json',
          });
          await info.attach('pantalla-sintetica.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
        }
      } catch (error) {
        registrar({ tipo: 'captura-no-disponible', sha256: huella(String(error)) });
        if (info.status === 'passed') throw new Error('DIAGNOSTICO_FINAL_NO_DISPONIBLE');
      } finally {
        await info.attach('diagnostico-saneado.json', {
          body: JSON.stringify(eventos),
          contentType: 'application/json',
        });
      }
      expect(erroresPagina, 'Errores reales de JavaScript: ver diagnóstico por huella').toEqual([]);
    });

    test('selector de cuatro categorías, URL prioritaria y última preferencia', async ({
      page,
    }) => {
      await page.goto('/?categoria=inundacion');
      const selector = page
        .locator(
          '[data-testid="selector-categoria"]:visible, [data-testid="selector-categoria-movil"]:visible',
        )
        .first();
      await expect(selector.getByRole('tab')).toHaveCount(4);
      for (const caso of CASOS) {
        const pestana = selector.getByRole('tab', { name: caso.nombre, exact: true });
        await pestana.click();
        await expect(pestana).toHaveAttribute('aria-selected', 'true');
        await expect(page).toHaveURL(new RegExp(`categoria=${caso.url}(?:&|$)`));
      }
      await page.goto('/');
      await expect(page).toHaveURL(/categoria=area-verde/);
      await page.goto('/?categoria=bache');
      await expect(selector.getByRole('tab', { name: 'Baches', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await page.goto('/');
      await expect(page).toHaveURL(/categoria=bache/);
    });

    test('cuenta nueva y cuatro formularios reales: GPS, cámara opcional y avisos', async ({
      page,
    }) => {
      cuenta = {
        email: `cuatro-${randomUUID()}@example.test`,
        password: `Sintetica-${randomUUID()}`,
      };
      await page.goto('/crear-cuenta');
      await page.getByLabel('Tu nombre').fill(`Persona sintética ${randomUUID().slice(0, 8)}`);
      await page.getByLabel('Correo electrónico', { exact: true }).fill(cuenta.email);
      await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.password);
      const alta = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/registro',
      );
      await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
      expect((await alta).ok()).toBe(true);
      await expect(page.getByRole('heading', { name: 'Ya podés entrar' })).toBeVisible();
      await page
        .locator('#contenido')
        .getByRole('link', { name: 'Iniciar sesión', exact: true })
        .click();
      await page.getByLabel('Correo electrónico o usuario').fill(cuenta.email);
      await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.password);
      const login = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/login',
      );
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      expect((await login).status()).toBe(200);
      await expect(page).toHaveURL((url) => url.pathname === '/');
      let fotos = 0;
      for (const caso of CASOS) {
        const antes = await sesion(page.request);
        expect(antes.cupos?.[caso.slug]).toMatchObject({ restantes: 3, demora_proximo_s: 60 });
        expect(antes.fotos_restantes_hoy).toBe(12 - fotos);
        await page.goto(`/reportar?categoria=${caso.url}`);
        await expect(page.getByTestId('categoria-del-reporte')).toContainText(caso.nombre);
        await page.getByRole('button', { name: 'Compartir mi ubicación', exact: true }).click();
        await expect(page.getByTestId('ubicacion-resuelta')).toContainText('Distrito');
        await page.getByTestId('opcion-coordenadas').click();
        await page.locator('#lat').fill(String(punto.lat));
        await page.locator('#lon').fill(String(punto.lon));
        await page.getByTestId('boton-confirmar-ubicacion').click();
        await expect(page.getByTestId('error-coordenadas')).toHaveCount(0);
        await continuar(page, 1);
        await responder(page, caso);
        await continuar(page, 2);
        const conFoto = caso.slug === 'inundacion' || caso.slug === 'basura';
        if (conFoto) {
          await fotografiar(page);
          fotos++;
        } else await expect(page.locator('input[type="file"]')).toHaveCount(0);
        if (caso.slug === 'area_verde') await avisos(page, caso);
        const descripcion = `${marca}: ${caso.nombre}, observación sintética sin personas reales.`;
        await page.locator('textarea[name="descripcion"]').fill(descripcion);
        await continuar(page, 3);
        await avisos(page, caso, true);
        await elegir(page, 'ubicacion_tipo', 'via_publica');
        await expect(page.getByTestId('aviso-demora')).toContainText('NO SE HA VERIFICADO');
        const llegada = page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
        );
        await page.getByTestId('boton-enviar').click();
        const respuesta = await llegada;
        expect(
          respuesta.status(),
          'No reintentar automáticamente: cada intento consume el presupuesto de IP',
        ).toBe(201);
        const creado = ((await respuesta.json()) as MiReporteFeature).properties;
        expect(creado.id).toMatch(/^[a-f0-9-]{36}$/);
        expect(creado.segundos_para_publicar).toBeGreaterThan(0);
        expect(creado.segundos_para_publicar).toBeLessThanOrEqual(60);
        expect(Date.parse(creado.publicar_en) - Date.parse(creado.creado_en)).toBe(60_000);
        creados.push({
          caso,
          id: creado.id,
          publicarEn: Date.now() + creado.segundos_para_publicar * 1000,
          descripcion,
          fotos: conFoto ? 1 : 0,
        });
        const cuerpo = respuesta.request().postDataJSON() as Record<string, unknown>;
        expect(cuerpo.categoria).toBe(caso.slug);
        expect(cuerpo.dispositivo).toMatchObject({ precision_m: 10 });
        if (caso.slug !== 'inundacion')
          for (const campo of AGUA) expect(cuerpo).not.toHaveProperty(campo);
        await expect(page.getByTestId('reporte-creado')).toContainText('NO SE HA VERIFICADO');
        expect((await page.request.get(`${WEB}/api/v1/reportes/${creado.id}`)).status()).toBe(404);
        const propios = await page.request.get(`${WEB}/api/v1/mis-reportes`);
        expect(propios.status()).toBe(200);
        expect(
          ((await propios.json()) as ReporteFeatureCollection).features.map((f) => f.properties.id),
        ).toContain(creado.id);
        const despues = await sesion(page.request);
        expect(despues.cupos?.[caso.slug]).toMatchObject({ restantes: 2, demora_proximo_s: 240 });
        expect(despues.fotos_restantes_hoy).toBe(12 - fotos);
      }
      expect(creados).toHaveLength(4);
    });

    test('publicación real, detalle de cuatro categorías y marcador ARIA real de M6', async ({
      page,
      request,
    }) => {
      for (const creado of creados) {
        const restante = Math.max(0, creado.publicarEn - Date.now());
        expect(restante).toBeLessThanOrEqual(60_000);
        await expect
          .poll(
            async () => {
              const respuesta = await request.get(`${API}/api/v1/reportes/${creado.id}`);
              expect([200, 404]).toContain(respuesta.status());
              return respuesta.status();
            },
            { timeout: restante + 10_000, intervals: [1000, 2000] },
          )
          .toBe(200);
        const respuesta = await request.get(`${API}/api/v1/reportes/${creado.id}`);
        const reporte = (await respuesta.json()) as ReporteFeatureCollection['features'][number];
        expect(reporte.properties).toMatchObject({
          categoria: creado.caso.slug,
          estado: 'nuevo',
          verificado: false,
          severidad: creado.caso.severidad,
          descripcion: creado.descripcion,
        });
        expect(reporte.properties.fotos).toHaveLength(creado.fotos);
        expect(reporte.properties.distrito).not.toBeNull();
        expect(reporte.properties.unidad_vecinal).not.toBeNull();
        expect(reporte.properties).not.toHaveProperty('autor_id');
        expect(reporte.properties).not.toHaveProperty('dispositivo');
        const comienzoMapa = eventos.length;
        await page.goto(`/reporte/${creado.id}`);
        const detalle = page
          .locator(
            '[data-testid="hoja-detalle"]:visible, [data-testid="hoja-detalle-movil"]:visible',
          )
          .first();
        await expect(detalle).toBeVisible();
        await expect(detalle).toContainText(creado.descripcion);
        await expect(detalle.getByTestId('aviso-sin-verificar')).toContainText(
          'NO SE HA VERIFICADO',
        );
        await expect(detalle.locator('img')).toHaveCount(creado.fotos);
        if (creado.fotos)
          await expect
            .poll(() =>
              detalle.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
            )
            .toBeGreaterThan(0);
        if (creado.caso.slug === 'area_verde') await expect(detalle).toContainText(PERSONA);
        // Misma exigencia que el diagnóstico M6: un detalle cargado no acredita que el mapa pintó.
        const marcador = page.getByRole('button', {
          name: `Punto de severidad ${creado.caso.severidad === 'critica' ? 'crítica' : creado.caso.severidad}, no se ha verificado`,
          exact: true,
        });
        await expect(marcador).toBeVisible();
        await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
        await expect
          .poll(() => eventos.slice(comienzoMapa).some((e) => e.tipo === 'raster-recibido'))
          .toBe(true);
        const observados = await page.evaluate(
          () =>
            (
              window as unknown as {
                __cuatroObservados: { contextosPerdidos: number; csp: number };
              }
            ).__cuatroObservados,
        );
        expect(observados).toEqual({ contextosPerdidos: 0, csp: 0 });
        await test.info().attach(`${creado.caso.slug}-mapa.png`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    });

    test('panel técnico modera solo los propios publicados y descarga GeoJSON/CSV por categoría', async ({
      page,
    }) => {
      const tecnico = credenciales('TECNICO');
      test.skip(
        !tecnico,
        'Falta secreto local MULTITEMATICA_E2E_TECNICO_*: moderación/exportación NO VERIFICADAS',
      );
      await entrarPanel(page, tecnico as Cuenta, 'tecnico');
      for (const creado of creados) {
        const propio = await page.request.get(`${PANEL}/api/v1/tecnico/reportes/${creado.id}`);
        expect(propio.status()).toBe(200);
        expect((await propio.json()).properties.descripcion).toBe(creado.descripcion);
        await page.goto(`${PANEL}/reportes/${creado.id}?categoria=${creado.caso.url}`);
        await expect(page.getByTestId('estado-actual')).toContainText('Nuevo');
        await page.getByTestId('boton-validar').click();
        await expect(page.getByTestId('estado-actual')).toContainText('Validado');
        await expect(page.getByTestId('boton-retirar')).toHaveCount(0);
        await abrirExportacionPropia(page, creado.caso.url);
        const selector = page.getByRole('group', { name: 'Elegir categoría' });
        await expect(
          selector.getByRole('button', { name: new RegExp(creado.caso.nombre) }),
        ).toHaveAttribute('aria-pressed', 'true');
        const geojson = JSON.parse(await descargar(page, 'geojson')) as ExportacionGeoJson;
        expect(geojson.truncado).toBe(false);
        expect(geojson.features.map((f) => f.properties.id)).toEqual([creado.id]);
        expect(geojson.features.every((f) => f.properties.categoria === creado.caso.slug)).toBe(
          true,
        );
        const fila = geojson.features.find((f) => f.properties.id === creado.id);
        expect(fila?.properties).toMatchObject({
          descripcion: creado.descripcion,
          estado: 'validado',
        });
        expect(geojson.nota_metodologica).toMatch(/percepci[oó]n/i);
        if (creado.caso.slug === 'area_verde')
          expect(geojson.nota_metodologica).toContain('Desarrollo Social');
        if (creado.caso.slug !== 'inundacion')
          for (const campo of AGUA) expect(fila?.properties).toHaveProperty(campo, null);
        const csv = await descargar(page, 'csv');
        const lineas = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
        expect(lineas.filter((l) => l.startsWith('#')).join(' ')).toMatch(/percepci[oó]n/i);
        const cabecera = celdas(lineas.find((l) => l.startsWith('id,')) ?? '');
        const filaCsv = celdas(lineas.find((l) => l.startsWith(`${creado.id},`)) ?? '');
        expect(filaCsv[cabecera.indexOf('categoria')]).toBe(creado.caso.slug);
        expect(filaCsv[cabecera.indexOf('descripcion')]).toBe(creado.descripcion);
        if (creado.caso.slug !== 'inundacion') {
          for (const campo of AGUA) {
            expect(cabecera).toContain(campo);
            expect(filaCsv[cabecera.indexOf(campo)]).toBe('');
          }
          expect(JSON.parse(filaCsv[cabecera.indexOf('detalle')] ?? '')).toMatchObject({
            gravedad_declarada: expect.any(String),
            tamano: expect.any(String),
          });
        }
      }
      await abrirExportacionPropia(page, 'todas');
      const todas = JSON.parse(await descargar(page, 'geojson')) as ExportacionGeoJson;
      expect(todas.features.map((f) => f.properties.id).sort()).toEqual(
        creados.map((c) => c.id).sort(),
      );
    });

    test('rol ciudadano conserva prohibición de panel, exportación y moderación', async ({
      page,
    }) => {
      await entrarCiudadano(page);
      await page.goto(`${PANEL}/reportes`);
      await expect(
        page.getByText('Tu cuenta no tiene acceso al panel técnico.', { exact: true }),
      ).toBeVisible();
      expect(
        (
          await page.request.get(`${PANEL}/api/v1/exportar?formato=geojson&categoria=todas`)
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.patch(`${PANEL}/api/v1/reportes/${creados[0]?.id}/estado`, {
            data: { estado: 'validado' },
          })
        ).status(),
      ).toBe(403);
    });

    for (const rol of ['EJECUTIVO', 'ADMIN'] as const) {
      test(`rol ${rol.toLowerCase()} con secreto local explícito`, async ({ browser }) => {
        const datos = credenciales(rol);
        test.skip(!datos, `Falta secreto local MULTITEMATICA_E2E_${rol}_*: rol NO VERIFICADO`);
        // Contexto aparte: no reemplaza cookies de la cuenta ciudadana ni de los otros roles.
        const contexto: BrowserContext = await browser.newContext({ baseURL: PANEL });
        try {
          const pagina = await contexto.newPage();
          await observar(pagina);
          await entrarPanel(pagina, datos as Cuenta, rol.toLowerCase());
          if (rol === 'EJECUTIVO') {
            await expect(pagina).toHaveURL(/\/ejecutivo/);
            expect(
              (
                await pagina.request.get(`${PANEL}/api/v1/exportar?formato=geojson&categoria=todas`)
              ).status(),
            ).toBe(403);
            expect(
              (
                await pagina.request.patch(`${PANEL}/api/v1/reportes/${creados[0]?.id}/estado`, {
                  data: { estado: 'validado' },
                })
              ).status(),
            ).toBe(403);
          } else {
            await pagina.goto(`${PANEL}/reportes/${creados[0]?.id}`);
            await expect(pagina.getByTestId('estado-actual')).toContainText('Validado');
            await expect(pagina.getByTestId('boton-retirar')).toBeVisible();
            expect(
              (
                await pagina.request.get(
                  `${PANEL}/api/v1/exportar?formato=geojson&categoria=todas&bbox=${caja()}`,
                )
              ).status(),
            ).toBe(200);
          }
        } finally {
          await contexto.close();
        }
      });
    }
  });
