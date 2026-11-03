import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type APIRequestContext,
  type ConsoleMessage,
  expect,
  type Page,
  type Request,
  type Response,
  type TestInfo,
  test,
  type Worker,
} from '@playwright/test';
import {
  normalizarSlugCategoria,
  REGISTRO_CATEGORIAS,
  type ReporteFeatureCollection,
  type ReporteTecnicoFeature,
} from '../../packages/contracts/dist/index.js';
import {
  CREDENCIALES_EJECUTIVO,
  CREDENCIALES_TECNICO,
  comprobarCspConNonce,
  comprobarSinViolacionesCsp,
  continuar,
  cuentaNuevaConSesion,
  cuentaNuevaEnElNavegador,
  desplazar,
  elegirPuntoPorCoordenadas,
  esperarPublicacion,
  esperarRedQuieta,
  loginTecnico,
  numeroDePaso,
  PNG_1X1,
  reporteValido,
  sacarFotoConLaCamara,
  sesionDelPanelEnElNavegador,
  vigilarCsp,
  vigilarRed,
} from './ayudas';

// Solo se descubre con la config dedicada. Ningún helper adelanta publicar_en por SQL.
const PUBLICA = 'http://localhost:3000';
const PANEL = 'http://localhost:3100';
const API = 'http://127.0.0.1:3001';
type Categoria = 'inundacion' | 'bache';
type Punto = { lat: number; lon: number };
interface Escenario {
  schema: 1;
  runId: string;
  puntos: Record<string, Punto>;
}
interface Control {
  schema: 1;
  runId: string;
  nonce: string;
  ok: boolean;
  phase?: string;
  database?: string;
  id?: string;
  categoria?: Categoria;
  aislado?: boolean;
  metodo?: string;
}

let runId: string;
let directory: string;
let point: Punto;
let project: string;
let bacheId = '';
let inundacionId = '';
let cuenta: Awaited<ReturnType<typeof cuentaNuevaEnElNavegador>>;
let controlCancellation = new AbortController();
type ControlModule = {
  requestControl(options: {
    directory: string;
    runId: string;
    message: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<Control>;
};

/**
 * Canal de archivos sin secretos con el coordinador vivo. Publicación atómica compartida.
 * `aislamiento` exige lectura métrica PG bajo su lock antes de cada moderación de esta spec;
 * la spec no abre PG ni decide que un fixture es seguro a partir de coordenadas públicas.
 */
async function control(
  action: 'estado' | 'registrar' | 'aislamiento',
  payload: { id?: string; categoria?: Categoria } = {},
): Promise<Control> {
  const nonce = randomUUID();
  const { requestControl } = (await import(
    pathToFileURL(path.join(__dirname, '../scripts/piloto-m6.mjs')).href
  )) as ControlModule;
  return requestControl({
    directory: path.join(directory, 'control'),
    runId,
    message: { schema: 1, runId, nonce, project, action, ...payload },
    signal: controlCancellation.signal,
  });
}

async function aislamiento(id: string, categoria: Categoria) {
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  const proof = await control('aislamiento', { id, categoria });
  expect(proof).toMatchObject({ id, categoria, aislado: true, metodo: 'postgis_crs_metrico' });
}

async function registrar(id: string, categoria: Categoria) {
  const receipt = await control('registrar', { id, categoria });
  expect(receipt).toMatchObject({ id, categoria });
}

async function entrarCiudadano(page: Page) {
  const response = await page.request.post(`${PUBLICA}/api/v1/auth/login`, {
    data: { email: cuenta.email, password: cuenta.password },
  });
  expect(response.status()).toBe(200);
}

async function publico(request: APIRequestContext, id: string) {
  const response = await request.get(`${API}/api/v1/reportes/${id}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ReporteFeatureCollection['features'][number];
}

async function validarPorPanel(page: Page, id: string, categoria: Categoria) {
  await page.goto(`${PANEL}/reportes/${id}?categoria=${categoria}`);
  await expect(page.getByTestId('estado-actual')).toContainText('Nuevo');
  // Última operación antes de actuar: abortar si el coordinador no certifica separación métrica.
  await aislamiento(id, categoria);
  await page.getByTestId('boton-validar').click();
  const confirmation = page.getByTestId('confirmar-accion');
  if (await confirmation.isVisible().catch(() => false)) await confirmation.click();
  await expect(page.getByTestId('estado-actual')).toContainText('Validado');
}

function csvCells(row: string): string[] {
  const values: string[] = [];
  let text = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (quoted && row[i + 1] === '"') {
        text += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(text);
      text = '';
    } else text += char;
  }
  values.push(text);
  return values;
}

test.use({ permissions: ['geolocation', 'camera'] });
if (process.env.M6_DIAGNOSTICO_MAPA !== '1')
  test.describe
    .serial('M6: dos definiciones reales y datos propios aislados', () => {
      test.beforeAll(async ({ request }, testInfo: TestInfo) => {
        const env = process.env;
        if (
          env.M6_PILOTO_MODO !== 'piloto' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(env.M6_PILOTO_RUN_ID ?? '')
        )
          throw new Error('PILOTO_M6_REQUIERE_ARNES');
        runId = env.M6_PILOTO_RUN_ID ?? '';
        project = testInfo.project.name;
        if (!['chromium', 'movil'].includes(project)) throw new Error('PROYECTO_INVALIDO');
        directory = path.resolve(__dirname, '../../.turbo/piloto-m6-artefactos', runId);
        const scenario = JSON.parse(
          await readFile(path.join(directory, 'escenario.json'), 'utf8'),
        ) as Escenario;
        if (scenario.schema !== 1 || scenario.runId !== runId)
          throw new Error('ESCENARIO_INVALIDO');
        const selectedPoint = scenario.puntos[project];
        if (
          !selectedPoint ||
          !Number.isFinite(selectedPoint.lat) ||
          !Number.isFinite(selectedPoint.lon)
        )
          throw new Error('ESCENARIO_INVALIDO');
        point = selectedPoint;
        const state = await control('estado');
        expect(state).toMatchObject({ phase: 'applied', database: 'curichi_e2e' });
        expect(REGISTRO_CATEGORIAS.definiciones.map((definition) => definition.slug)).toEqual([
          'inundacion',
          'bache',
        ]);
        const configuration = await request.get(`${API}/api/v1/configuracion`);
        expect(configuration.status()).toBe(200);
        expect((await configuration.json()).categorias_activas).toEqual(['inundacion', 'bache']);
      });

      test.beforeEach(async ({ context }) => {
        controlCancellation = new AbortController();
        const phone = desplazar(point, { norteM: -30, esteM: -40 });
        await context.setGeolocation({ latitude: phone.lat, longitude: phone.lon, accuracy: 10 });
      });
      test.afterEach(() => {
        controlCancellation.abort();
      });
      test.afterAll(() => {
        controlCancellation.abort();
      });

      test('CA8: cuatro pasos Bache, cámara real simulada y envío sin campos de agua', async ({
        page,
      }) => {
        const csp = await vigilarCsp(page);
        cuenta = await cuentaNuevaEnElNavegador(page, `m6-${runId}-${project}-`);
        const response = await page.goto('/reportar?categoria=bache');
        comprobarCspConNonce(response?.headers()['content-security-policy'], 'formulario Bache');
        await expect(page.getByRole('heading', { name: 'Reportar un punto' })).toBeVisible();
        await expect(page.getByTestId('categoria-del-reporte')).toContainText('Baches');
        expect(await numeroDePaso(page)).toBe(1);
        await elegirPuntoPorCoordenadas(page, point, desplazar(point, { norteM: -30, esteM: -40 }));
        await expect(page.getByTestId('ubicacion-resuelta')).toContainText('Distrito');
        await continuar(page);
        await page.locator('input[name="subtipo"][value="hundimiento_calzada"]').check();
        await page.locator('input[name="detalle.gravedad_declarada"][value="peligroso"]').check();
        await page.locator('input[name="detalle.tamano"][value="rueda"]').check();
        await expect(
          page.locator('input[name="profundidad_estimada"], input[name="frecuencia"]'),
        ).toHaveCount(0);
        await continuar(page);
        const photoResponse = page.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/fotos',
        );
        await sacarFotoConLaCamara(page);
        expect((await photoResponse).status()).toBe(201);
        await expect(page.locator('input[type="file"]')).toHaveCount(0);
        await page
          .locator('textarea[name="descripcion"]')
          .fill(`M6 ${runId} ${project}: hundimiento sintético aislado.`);
        await continuar(page);
        expect(await numeroDePaso(page)).toBe(4);
        await expect(page.getByText('Hundimiento de calzada', { exact: true })).toBeVisible();
        await page.locator('input[name="ubicacion_tipo"][value="via_publica"]').check();
        const created = page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
        );
        await page.getByTestId('boton-enviar').click();
        const sent = await created;
        expect(sent.status()).toBe(201);
        bacheId = ((await sent.json()) as { id: string }).id;
        expect(bacheId).toMatch(/^[a-f0-9-]{36}$/);
        await registrar(bacheId, 'bache');
        await expect(page.getByTestId('reporte-creado')).toContainText('NO SE HA VERIFICADO');
        comprobarSinViolacionesCsp(csp, 'flujo Bache');
      });

      test('CA8/9: propio, detalle y cupos independientes con Inundación en el mismo punto', async ({
        page,
        request,
      }) => {
        await entrarCiudadano(page);
        const yo = await page.request.get(`${PUBLICA}/api/v1/auth/yo`);
        expect(yo.status()).toBe(200);
        expect((await yo.json()).cupos).toMatchObject({
          bache: { restantes: 2 },
          inundacion: { restantes: 3 },
        });
        await page.goto('/mis-reportes');
        await expect(
          page.getByText(`M6 ${runId} ${project}: hundimiento sintético aislado.`),
        ).toBeVisible();
        const flood = await page.request.post(`${PUBLICA}/api/v1/reportes`, {
          data: reporteValido(`M6 ${runId} ${project} inundacion`, point),
        });
        expect(flood.status()).toBe(201);
        inundacionId = ((await flood.json()) as { id: string }).id;
        await registrar(inundacionId, 'inundacion');
        const after = await page.request.get(`${PUBLICA}/api/v1/auth/yo`);
        expect((await after.json()).cupos).toMatchObject({
          bache: { restantes: 2 },
          inundacion: { restantes: 2 },
        });
        await loginTecnico(request);
        await esperarPublicacion(request, bacheId);
        await esperarPublicacion(request, inundacionId);
        const bache = await publico(request, bacheId);
        const agua = await publico(request, inundacionId);
        expect(bache.properties).toMatchObject({
          categoria: 'bache',
          subtipo: 'hundimiento_calzada',
          detalle: { gravedad_declarada: 'peligroso', tamano: 'rueda' },
        });
        expect(agua.properties.categoria).toBe('inundacion');
        expect(bache.geometry.coordinates).toEqual(agua.geometry.coordinates);
        expect(bache.properties).not.toHaveProperty('autor_id');
        expect(bache.properties).not.toHaveProperty('dispositivo');
        await page.goto(`/reporte/${bacheId}?categoria=bache`);
        const detail = page.locator('[data-testid^="hoja-detalle"]:visible').first();
        await expect(detail).toContainText('Hundimiento de calzada');
        await expect(detail).toContainText('Como una rueda');
        await expect(detail).toContainText('NO SE HA VERIFICADO');
      });

      test('CA10: panel valida cada categoría solo tras aislamiento métrico nuevo', async ({
        page,
        request,
      }) => {
        const csp = await vigilarCsp(page);
        await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
        await validarPorPanel(page, bacheId, 'bache');
        await page.getByTestId('btn-abrir-reporte-unitario').click();
        const sheet = page.getByRole('dialog');
        await expect(sheet).toContainText('Hundimiento de calzada');
        await expect(sheet).toContainText('Como una rueda');
        await page.keyboard.press('Escape');
        await validarPorPanel(page, inundacionId, 'inundacion');
        await loginTecnico(request);
        const technical = await request.get(`${API}/api/v1/tecnico/reportes/${bacheId}`);
        expect(technical.status()).toBe(200);
        const feature = (await technical.json()) as ReporteTecnicoFeature;
        for (const key of [
          'profundidad_estimada',
          'frecuencia',
          'causa_presunta',
          'sumidero_cercano',
          'sumidero_estado',
          'agua_brota_sumidero',
        ])
          expect(Reflect.get(feature.properties, key)).toBeNull();
        comprobarSinViolacionesCsp(csp, 'moderación y ficha');
      });

      test('CA10: selección/exportación separada, Todas y roles sin ampliación', async ({
        page,
        request,
      }) => {
        await sesionDelPanelEnElNavegador(page, CREDENCIALES_TECNICO);
        await page.goto(`${PANEL}/reportes?categoria=bache`);
        const selector = page.getByRole('group', { name: 'Elegir categoría' });
        await expect(selector.getByRole('button', { name: /Baches/ })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await selector.getByRole('button', { name: /Todas/ }).click();
        await expect(page).toHaveURL(/categoria=todas/);
        await loginTecnico(request);
        const bbox = [
          point.lon - 0.0001,
          point.lat - 0.0001,
          point.lon + 0.0001,
          point.lat + 0.0001,
        ].join(',');
        for (const categoria of ['bache', 'inundacion', 'todas']) {
          const exported = await request.get(
            `${API}/api/v1/exportar?formato=geojson&categoria=${categoria}&bbox=${bbox}`,
          );
          expect(exported.status()).toBe(200);
          const data = (await exported.json()) as ReporteFeatureCollection & {
            nota_metodologica: string;
          };
          const ids = data.features.map((f) => f.id);
          expect(ids).toContain(categoria === 'inundacion' ? inundacionId : bacheId);
          if (categoria !== 'todas')
            expect(data.features.every((f) => f.properties.categoria === categoria)).toBe(true);
          else expect(ids).toContain(inundacionId);
          if (categoria !== 'inundacion') expect(data.nota_metodologica).toContain('pavimento');
        }
        const csv = await request.get(
          `${API}/api/v1/exportar?formato=csv&categoria=bache&bbox=${bbox}`,
        );
        expect(csv.status()).toBe(200);
        const lines = (await csv.text()).replace(/^\uFEFF/, '').split(/\r?\n/);
        const header = csvCells(lines.find((line) => line.startsWith('id,')) ?? '');
        const row = csvCells(lines.find((line) => line.startsWith(`${bacheId},`)) ?? '');
        expect(row[header.indexOf('subtipo')]).toBe('hundimiento_calzada');
        expect(JSON.parse(row[header.indexOf('detalle')] ?? '')).toMatchObject({
          gravedad_declarada: 'peligroso',
          tamano: 'rueda',
        });
        for (const key of ['profundidad_estimada', 'frecuencia', 'causa_presunta'])
          expect(row[header.indexOf(key)]).toBe('');
        await aislamiento(bacheId, 'bache');
        const fusion = await request.post(`${API}/api/v1/reportes/${bacheId}/fusionar`, {
          data: { canonico_id: inundacionId },
        });
        expect(fusion.status()).toBe(409);
        expect((await fusion.json()).codigo).toBe('FUSION_ENTRE_CATEGORIAS');
        const login = await request.post(`${API}/api/v1/auth/login`, {
          data: CREDENCIALES_EJECUTIVO,
        });
        expect(login.status()).toBe(200);
        expect(
          (await request.get(`${API}/api/v1/exportar?formato=geojson&categoria=bache`)).status(),
        ).toBe(403);
        await aislamiento(bacheId, 'bache');
        expect(
          (
            await request.patch(`${API}/api/v1/reportes/${bacheId}/estado`, {
              data: {
                estado: 'resuelto',
                estado_motivo: 'Intento sintético prohibido del ejecutivo.',
              },
            })
          ).status(),
        ).toBe(403);
      });

      test('CA9/12: mapa conserva área, limpia selección/severidad y permite teclado/URL', async ({
        page,
      }) => {
        const requests: URL[] = [];
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.pathname === '/api/v1/reportes') requests.push(url);
        });
        const red = vigilarRed(page);
        await page.goto('/?categoria=bache');
        const selector = page
          .locator(
            '[data-testid="selector-categoria"]:visible, [data-testid="selector-categoria-movil"]:visible',
          )
          .first();
        await expect(selector).toBeVisible();
        const listado = (url: string) => new URL(url).pathname === '/api/v1/reportes';
        const severity = page
          .getByRole('group', { name: 'Filtrar por severidad' })
          .filter({ visible: true })
          .first();
        await severity.getByRole('button', { name: 'Alta', exact: true }).click();
        await expect(severity.getByRole('button', { name: 'Alta', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await esperarRedQuieta(red, listado);
        const last = (categoria: Categoria) =>
          requests
            .filter(
              (url) => normalizarSlugCategoria(url.searchParams.get('categoria')) === categoria,
            )
            .at(-1);
        const before = last('bache')?.searchParams.get('bbox');
        expect(before).toBeTruthy();
        expect(last('bache')?.searchParams.get('severidad')).toBe('alta');
        const flood = selector.getByRole('tab', { name: /Inundaciones/ });
        await flood.focus();
        await page.keyboard.press('Enter');
        await expect(flood).toHaveAttribute('aria-selected', 'true');
        await expect
          .poll(() => normalizarSlugCategoria(new URL(page.url()).searchParams.get('categoria')))
          .toBe('inundacion');
        await esperarRedQuieta(red, listado);
        expect(last('inundacion')?.searchParams.get('bbox')).toBe(before);
        expect(last('inundacion')?.searchParams.has('severidad')).toBe(false);
        await expect(severity.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(page.locator('[data-testid^="hoja-detalle"]:visible')).toHaveCount(0);
        expect(
          await page.evaluate(
            () => JSON.parse(localStorage.getItem('micurichi.mapa.categoria') ?? '{}').slug,
          ),
        ).toBe('inundacion');
        await page.goto('/?categoria=bache');
        await expect(
          page
            .locator(
              '[data-testid="selector-categoria"]:visible, [data-testid="selector-categoria-movil"]:visible',
            )
            .first()
            .getByRole('tab', { name: /Baches/ }),
        ).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      });

      test('CA9: borrador cambia ámbito sin arrastrar respuestas de Baches a Inundaciones', async ({
        page,
      }) => {
        await cuentaNuevaEnElNavegador(page, `m6-draft-${runId}-${project}-`);
        await page.goto('/reportar?categoria=bache');
        await elegirPuntoPorCoordenadas(page, point, desplazar(point, { norteM: -30, esteM: -40 }));
        await continuar(page);
        await page.locator('input[name="subtipo"][value="bache"]').check();
        await page.locator('input[name="detalle.gravedad_declarada"][value="peligroso"]').check();
        await page.locator('input[name="detalle.tamano"][value="plato"]').check();
        await page.getByRole('button', { name: 'Volver al paso anterior' }).click();
        await page.getByTestId('cambiar-categoria').click();
        await page.getByTestId('elegir-categoria-inundacion').click();
        await continuar(page);
        await expect(page.locator('input[name="profundidad_estimada"]')).not.toHaveCount(0);
        await expect(
          page.locator('input[name="detalle.gravedad_declarada"], input[name="subtipo"]'),
        ).toHaveCount(0);
        await page.locator('input[name="profundidad_estimada"][value="rodilla"]').check();
        await page.locator('input[name="frecuencia"][value="cada_lluvia_fuerte"]').check();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                JSON.parse(sessionStorage.getItem('curichi.borrador-reporte.v1') ?? '{}').categoria,
            ),
          )
          .toBe('inundacion');
        const draft = await page.evaluate(
          () => sessionStorage.getItem('curichi.borrador-reporte.v1') ?? '',
        );
        expect(draft).not.toContain('gravedad_declarada');
        expect(draft).not.toContain('dispositivo');
        await page.reload();
        await expect(page.getByTestId('borrador-retomado')).toBeVisible();
        await expect(page.getByTestId('categoria-del-reporte')).toContainText('Inundaciones');
      });
    });

if (process.env.M6_DIAGNOSTICO_MAPA === '1') {
  test('@diag-mapa-g1 Inundación publicada: marcador ARIA original con observación saneada', async ({
    page,
    request,
  }, testInfo) => {
    expect(process.env.M6_PILOTO_MODO).toBe('grupo');
    expect(process.env.M6_PILOTO_GRUPO).toBe('G1');
    expect(testInfo.project.name).toBe('chromium');
    const ownRunId = process.env.M6_PILOTO_RUN_ID ?? '';
    expect(ownRunId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
    const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
    const messageClass = (text: string) =>
      /webgl|context.*lost/i.test(text)
        ? 'webgl'
        : /content.security|csp|refused to/i.test(text)
          ? 'csp'
          : /worker/i.test(text)
            ? 'worker'
            : /fetch|network|load/i.test(text)
              ? 'network'
              : 'other';
    const resource = (raw: string) => {
      try {
        const url = new URL(raw);
        if (url.protocol === 'blob:') return 'worker-blob';
        const local = [PUBLICA, PANEL, API, 'http://127.0.0.1:3002'].includes(url.origin);
        if (!local)
          return /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) ? 'osm-raster' : 'external';
        if (url.pathname.startsWith('/maplibre/')) return 'worker-local';
        if (url.pathname.startsWith('/_next/static/')) return 'next-static';
        if (url.pathname.startsWith('/api/v1/reportes/')) return 'report-detail';
        if (url.pathname.startsWith('/api/v1/fotos/')) return 'photo';
        if (url.pathname.startsWith('/geo/')) return 'geo';
        return 'local-other';
      } catch {
        return 'unclassified';
      }
    };
    const started = Date.now();
    const events: Record<string, unknown>[] = [];
    const pending = new Set<Promise<void>>();
    const add = (value: Record<string, unknown>) => {
      if (events.length < 300 || value.kind === 'dom-final')
        events.push({ ms: Date.now() - started, ...value });
    };
    const onConsole = (message: ConsoleMessage) => {
      if (['warning', 'error'].includes(message.type()))
        add({
          kind: 'console',
          level: message.type(),
          class: messageClass(message.text()),
          messageHash: hash(message.text()),
        });
    };
    const onError = (error: Error) =>
      add({
        kind: 'pageerror',
        class: messageClass(error.message),
        messageHash: hash(error.message),
      });
    const onFailed = (request: Request) =>
      add({
        kind: 'requestfailed',
        resource: resource(request.url()),
        type: request.resourceType(),
        errorHash: hash(request.failure()?.errorText ?? ''),
      });
    const onResponse = (response: Response) => {
      const category = resource(response.url());
      if (
        response.status() < 400 &&
        !['worker-local', 'next-static', 'osm-raster', 'geo'].includes(category)
      )
        return;
      add({ kind: 'response', resource: category, status: response.status() });
      if (category === 'worker-local') {
        const work = (async () => {
          try {
            const body = await response.body();
            const mime = response.headers()['content-type']?.split(';')[0] ?? '';
            add({
              kind: 'worker-body',
              status: response.status(),
              bytes: body.length,
              mime: [
                'application/javascript',
                'text/javascript',
                'text/html',
                'text/plain',
                'application/octet-stream',
              ].includes(mime)
                ? mime
                : 'other',
              sha256: body.length <= 8 * 1024 ** 2 ? hash(body) : 'over-limit',
            });
          } catch (error) {
            add({
              kind: 'worker-body-failed',
              messageHash: hash(error instanceof Error ? error.message : 'unknown'),
            });
          }
        })();
        pending.add(work);
        void work.finally(() => pending.delete(work));
      }
    };
    const onWorker = (worker: Worker) => {
      add({ kind: 'worker-open', resource: resource(worker.url()) });
      worker.once('close', () => add({ kind: 'worker-close' }));
    };
    const onLoad = () => add({ kind: 'load' });
    const onDom = () => add({ kind: 'domcontentloaded' });
    page.on('console', onConsole);
    page.on('pageerror', onError);
    page.on('requestfailed', onFailed);
    page.on('response', onResponse);
    page.on('worker', onWorker);
    page.on('load', onLoad);
    page.on('domcontentloaded', onDom);
    let fixtureHash: string | undefined;
    try {
      const config = await request.get(`${API}/api/v1/configuracion`);
      expect(config.status()).toBe(200);
      expect((await config.json()).categorias_activas).toEqual(['inundacion']);
      // Mismos helpers/payload/foto que G1; cuenta propia y marca identificada. Sin moderación.
      await cuentaNuevaConSesion(request, `${ownRunId}-diag-`);
      const upload = await request.post(`${API}/api/v1/fotos`, {
        multipart: { archivo: { name: 'charco.png', mimeType: 'image/png', buffer: PNG_1X1 } },
      });
      expect(upload.status()).toBe(201);
      const photo = (await upload.json()).objeto_key as string;
      const created = await request.post(`${API}/api/v1/reportes`, {
        data: { ...reporteValido(`M6 ${ownRunId} diagnostico-mapa`), fotos: [photo] },
      });
      expect(created.status()).toBe(201);
      const id = (await created.json()).id as string;
      expect(id).toMatch(/^[a-f0-9-]{36}$/);
      fixtureHash = hash(id);
      await loginTecnico(request);
      await esperarPublicacion(request, id);
      const detail = await request.get(`${API}/api/v1/reportes/${id}`);
      expect(detail.status()).toBe(200);
      expect((await detail.json()).properties).toMatchObject({
        estado: 'nuevo',
        verificado: false,
      });
      const navigation = await page.goto(`${PUBLICA}/reporte/${id}`);
      expect(navigation?.status()).toBe(200);
      await expect(page.getByTestId('hoja-detalle')).toBeVisible();
      await expect(page.getByTestId('aviso-sin-verificar')).toContainText('NO SE HA VERIFICADO');
      await expect(
        page.getByRole('button', { name: 'Punto de severidad media, no se ha verificado' }),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled([...pending]),
          new Promise((resolve) => {
            timer = setTimeout(resolve, 5000);
          }),
        ]);
        add({
          kind: 'dom-final',
          sheetVisible: await page.getByTestId('hoja-detalle').isVisible(),
          markerVisible: await page
            .getByRole('button', { name: 'Punto de severidad media, no se ha verificado' })
            .isVisible(),
          workers: page.workers().length,
          canvas: await page.locator('canvas').evaluateAll((nodes) =>
            nodes.map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                width: (node as HTMLCanvasElement).width,
                height: (node as HTMLCanvasElement).height,
                rect: { width: rect.width, height: rect.height },
                visible: rect.width > 0 && rect.height > 0,
              };
            }),
          ),
        });
      } catch (error) {
        add({
          kind: 'dom-final-unavailable',
          messageHash: hash(error instanceof Error ? error.message : 'unknown'),
        });
      } finally {
        clearTimeout(timer);
      }
      try {
        await testInfo.attach('diag-mapa-screenshot', {
          body: await page.screenshot({ fullPage: false }),
          contentType: 'image/png',
        });
      } catch (error) {
        add({
          kind: 'screenshot-unavailable',
          messageHash: hash(error instanceof Error ? error.message : 'unknown'),
        });
      }
      page.off('console', onConsole);
      page.off('pageerror', onError);
      page.off('requestfailed', onFailed);
      page.off('response', onResponse);
      page.off('worker', onWorker);
      page.off('load', onLoad);
      page.off('domcontentloaded', onDom);
      await testInfo.attach('diag-mapa-saneado', {
        body: Buffer.from(JSON.stringify({ schema: 1, runId: ownRunId, fixtureHash, events })),
        contentType: 'application/json',
      });
    }
  });
}
