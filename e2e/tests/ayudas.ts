import { type APIRequestContext, expect, type Page, type Request } from '@playwright/test';

export const API = 'http://127.0.0.1:3001';
export const GEO = 'http://127.0.0.1:3002';
export const PANEL = process.env.PANEL_ADMIN_URL ?? 'http://localhost:3100';

/**
 * Punto dentro de la cobertura de las capas cargadas (la plaza principal de la entrega
 * `DM_UV_MZ_2025`). Es un dato de las capas, no de la ciudad configurada: la ciudad llega por
 * `GET /api/v1/configuracion` y se lee con `leerCiudad`.
 */
export const PUNTO_CENTRO = { lat: -17.7833, lon: -63.1821 };
/** Punto claramente fuera del municipio. */
export const PUNTO_FUERA = { lat: -17.5, lon: -63.0 };

export const CREDENCIALES_TECNICO = {
  email: process.env.E2E_TECNICO_EMAIL ?? 'tecnico@curichi.local',
  password: process.env.E2E_TECNICO_PASSWORD ?? 'curichi-tecnico-local',
};

export const CREDENCIALES_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@curichi.local',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'curichi-admin-local',
};

/**
 * Cuenta ejecutiva del seed (migración 0011 de `packages/db`). Solo ve el panel ejecutivo
 * (`/ejecutivo` y `GET /api/v1/ejecutivo/resumen`): no modera ni exporta. El seed toma la
 * contraseña de `SEED_EJECUTIVO_PASSWORD`; si se cambia allí, hay que pasar la misma aquí.
 */
export const CREDENCIALES_EJECUTIVO = {
  email: process.env.E2E_EJECUTIVO_EMAIL ?? 'ejecutivo@curichi.local',
  password: process.env.E2E_EJECUTIVO_PASSWORD ?? 'curichi-ejecutivo-local',
};

/** Cuenta ciudadana del seed. Desde la Fase 5, crear un reporte exige sesión. */
export const CREDENCIALES_VECINA = {
  email: process.env.E2E_VECINA_EMAIL ?? 'vecina@curichi.local',
  password: process.env.E2E_VECINA_PASSWORD ?? 'curichi-vecina-local',
};

/**
 * Payload mínimo válido de `POST /api/v1/reportes`. Desde la severidad v2 (corrida
 * 2026-09-25-quitar-campos-del-reporte) el reporte solo pregunta profundidad y frecuencia: ya no lleva
 * duración ni afectación, y la severidad de este payload es 2·2 (rodilla) + 3 (cada lluvia fuerte)
 * = 7 → media.
 */
export function reporteValido(marca: string) {
  return {
    lat: PUNTO_CENTRO.lat,
    lon: PUNTO_CENTRO.lon,
    ubicacion_metodo: 'manual' as const,
    ubicacion_tipo: 'via_publica' as const,
    descripcion: `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}`,
    profundidad_estimada: 'rodilla' as const,
    frecuencia: 'cada_lluvia_fuerte' as const,
    causa_presunta: 'sumidero_tapado' as const,
    sitio_web: '',
  };
}

export const PUBLICA = process.env.E2E_PUBLICA_URL ?? 'http://localhost:3000';

/**
 * Espera a que los dos servicios respondan. El precalentado de las páginas de Next vive en
 * `global-setup.ts`, no aquí: dentro de un hook se come el timeout del test y el fallo aparece
 * como intermitente en una prueba que no tiene nada que ver.
 */
export async function esperarPila(request: APIRequestContext) {
  await expect
    .poll(async () => (await request.get(`${API}/ready`)).status(), {
      timeout: 120_000,
      intervals: [1000],
    })
    .toBe(200);
  await expect
    .poll(async () => (await request.get(`${GEO}/health`)).status(), { timeout: 30_000 })
    .toBe(200);
}

/** Inicia sesión como técnico sobre el contexto de request (guarda la cookie de sesión). */
export async function loginTecnico(request: APIRequestContext) {
  const r = await request.post(`${API}/api/v1/auth/login`, { data: CREDENCIALES_TECNICO });
  expect(r.status(), 'el técnico debe poder iniciar sesión con los usuarios del seed').toBe(200);
  return r.json();
}

/** Inicia sesión como ejecutivo sobre el contexto de request (guarda la cookie de sesión). */
export async function loginEjecutivo(request: APIRequestContext) {
  const r = await request.post(`${API}/api/v1/auth/login`, { data: CREDENCIALES_EJECUTIVO });
  expect(
    r.status(),
    'el ejecutivo debe poder iniciar sesión (¿migración 0011 aplicada y `pnpm db:seed:samples`?)',
  ).toBe(200);
  return r.json();
}

/** Inicia sesión como ciudadana sobre el contexto de request. */
export async function loginCiudadano(request: APIRequestContext, datos = CREDENCIALES_VECINA) {
  const r = await request.post(`${API}/api/v1/auth/login`, { data: datos });
  expect(
    r.status(),
    'la cuenta ciudadana debe poder iniciar sesión (¿corriste `pnpm db:seed:samples`?)',
  ).toBe(200);
  return r.json();
}

/**
 * Crea una cuenta ciudadana nueva y entra con ella, devolviendo sus credenciales.
 *
 * Existe porque cada cuenta solo puede enviar **un reporte por hora**: si todos los casos
 * usaran la cuenta del seed, el segundo que intentara crear algo recibiría 429 y el resultado
 * dependería del orden y de cuántas veces se hubiera corrido la suite antes. Una cuenta por
 * caso hace que cada prueba parta de un estado limpio sin tocar la base por debajo ni apagar
 * el límite, que es justamente una de las cosas que hay que comprobar.
 */
export async function cuentaNuevaConSesion(request: APIRequestContext, marca = '') {
  const datos = {
    email: `e2e-${marca}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@curichi.test`,
    nombre: 'Vecina de prueba',
    password: 'contrasena-de-prueba-e2e',
  };
  const alta = await request.post(`${API}/api/v1/auth/registro`, { data: datos });
  expect(alta.status(), 'el alta de cuenta debe responder 201').toBe(201);
  await loginCiudadano(request, { email: datos.email, password: datos.password });
  return datos;
}

/** Crea un reporte por API con una cuenta recién creada (para no gastar la cuota de otra). */
export async function crearReportePorApi(request: APIRequestContext, marca: string) {
  await cuentaNuevaConSesion(request, 'rep-');
  const r = await request.post(`${API}/api/v1/reportes`, { data: reporteValido(marca) });
  expect(r.status(), await r.text()).toBe(201);
  const f = await r.json();
  return f.id as string;
}

/** Coordenadas de tesela (slippy map) para un punto y un zoom. */
export function tesela(lat: number, lon: number, z: number) {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
  return { x, y, z };
}

/** PNG 1×1 válido, para probar la subida de fotos sin depender de archivos del repo. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Crea una cuenta y entra con ella **por la interfaz**, como haría un vecino.
 *
 * Cuenta nueva en cada llamada por el mismo motivo que en la API: una cuenta solo puede enviar
 * un reporte por hora, así que reutilizar la del seed haría que la suite fallara a partir del
 * segundo caso y, peor, que fallara solo a veces según cuándo se hubiera corrido la anterior.
 */
export async function crearCuentaYEntrarPorUi(page: Page, volver = '/reportar') {
  const datos = {
    email: `e2e-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@curichi.test`,
    password: 'contrasena-de-prueba-e2e',
    nombre: 'Vecina de prueba',
  };
  await page.goto(`/crear-cuenta?volver=${encodeURIComponent(volver)}`);
  // Los localizadores van acotados a `#contenido`: la barra superior tiene sus propios enlaces
  // «Iniciar sesión» y «Crear cuenta», y sin acotar, Playwright encuentra dos y falla por modo
  // estricto. Que existan los dos es correcto —uno navega y el otro es la acción de la pantalla—.
  const principal = page.locator('#contenido');
  await page.locator('#nombre').fill(datos.nombre);
  await page.locator('#email').fill(datos.email);
  await page.locator('#password').fill(datos.password);
  await principal.getByRole('button', { name: 'Crear cuenta' }).click();

  // La respuesta es la misma exista o no el correo, así que la pantalla no dice «creada»: dice
  // que ya se puede entrar. Desde ahí, el enlace lleva al login con el correo ya puesto.
  await expect(page.getByRole('heading', { name: 'Ya podés entrar' })).toBeVisible();
  await principal.getByRole('link', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('#email')).toHaveValue(datos.email);
  await page.locator('#password').fill(datos.password);
  await principal.getByRole('button', { name: 'Entrar' }).click();
  return datos;
}

/**
 * Crea una cuenta ciudadana y deja su sesión en el NAVEGADOR de la prueba sin recorrer las
 * pantallas de alta y de ingreso, que ya recorren `cuenta-ciudadana.spec.ts` y
 * `recorrido-completo.spec.ts`. Para las pruebas del formulario es tiempo que no prueba nada.
 *
 * Va por `page.request`, que comparte las cookies con el contexto del navegador, y contra el
 * origen de la app pública: la cookie queda para `localhost` igual que si la hubiera puesto el
 * formulario de ingreso. Necesita `COOKIE_SEGURA=0` (ver README): con la cookie `Secure` sobre
 * http el cliente de Playwright no la guarda.
 */
export async function cuentaNuevaEnElNavegador(page: Page, marca = '') {
  const datos = {
    email: `e2e-nav-${marca}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@curichi.test`,
    nombre: 'Vecina de prueba',
    password: 'contrasena-de-prueba-e2e',
  };
  const alta = await page.request.post(`${PUBLICA}/api/v1/auth/registro`, { data: datos });
  expect(alta.status(), 'el alta de cuenta debe responder 201').toBe(201);
  const login = await page.request.post(`${PUBLICA}/api/v1/auth/login`, {
    data: { email: datos.email, password: datos.password },
  });
  expect(login.status(), 'la cuenta recién creada debe poder iniciar sesión').toBe(200);
  return datos;
}

/**
 * Sesión del panel en el navegador, sin pasar por el formulario de ingreso: para las pruebas en
 * las que entrar no es lo que se comprueba. El panel reenvía `/api/*` a api-core en su propio
 * origen, así que la cookie queda para el host del panel.
 */
export async function sesionDelPanelEnElNavegador(
  page: Page,
  credenciales: { email: string; password: string },
) {
  const r = await page.request.post(`${PANEL}/api/v1/auth/login`, { data: credenciales });
  expect(r.status(), `${credenciales.email} debe poder iniciar sesión en el panel`).toBe(200);
  return r.json();
}

/** Ciudad del despliegue, tal como la sirve api-core (contracts 0.7.0). */
export interface CiudadConfigurada {
  nombre: string;
  pais: string;
  zona_horaria: string;
  locale: string;
  centro: { lon: number; lat: number };
  zoom_inicial: number;
}

/**
 * La ciudad llega por `GET /api/v1/configuracion` y las apps la leen al atender cada página. Las
 * pruebas que necesitan su nombre, su centro o su formato de números la leen de ahí en vez de
 * escribir «Santa Cruz»: la misma suite tiene que valer en cualquier instalación.
 */
export async function leerCiudad(request: APIRequestContext): Promise<CiudadConfigurada> {
  const r = await request.get(`${API}/api/v1/configuracion`);
  expect(r.status(), 'GET /api/v1/configuracion').toBe(200);
  return (await r.json()).ciudad as CiudadConfigurada;
}

// ------------------------------------------------------------------ formulario de reporte

const RE_PASO = /^\s*Paso \d+ de \d+\s*$/;

/**
 * Número del paso en pantalla, sin afirmar nada: para esperar a que cambie con `expect.poll`. Lo
 * lee de «Paso N de M», que el formulario escribe dos veces (el rótulo visible y la región viva
 * para lectores de pantalla); no depende de la clase con que se dibuje.
 */
export async function numeroDePaso(page: Page): Promise<number | null> {
  const t = await page
    .getByText(RE_PASO)
    .first()
    .textContent({ timeout: 5_000 })
    .catch(() => null);
  const r = t ? /Paso (\d+) de/.exec(t) : null;
  return r ? Number(r[1]) : null;
}

/** «Paso N de M» del paso que está en pantalla. El rótulo y la región viva tienen que coincidir. */
export async function pasoActual(page: Page): Promise<{ n: number; m: number }> {
  const textos = await page.getByText(RE_PASO).allTextContents();
  expect(textos.length, 'cada paso tiene que anunciar «Paso N de M»').toBeGreaterThan(0);
  const leidos = textos.map((t) => {
    const r = /Paso (\d+) de (\d+)/.exec(t);
    return { n: Number(r?.[1]), m: Number(r?.[2]) };
  });
  for (const l of leidos) expect(l, `«${textos.join('» / «')}»`).toEqual(leidos[0]);
  return leidos[0] as { n: number; m: number };
}

/**
 * Abre `/reportar` (o el enlace dado) con la sesión ya puesta y espera a que el formulario haya
 * decidido si retoma un borrador: el mapa del paso 1 no se monta hasta después de leerlo, así que
 * verlo es la señal de que «borrador-retomado» ya está o ya no va a estar.
 */
export async function abrirFormulario(page: Page, url = '/reportar') {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Reportar un punto' })).toBeVisible();
  if ((await numeroDePaso(page)) === 1) await esperarMapaDelPaso1(page);
}

/**
 * El mapa del paso 1 cargado: montado y con su primer `idle` (se va «Cargando el mapa…»). Antes
 * del arreglo, el `load` del mapa pisaba el punto con el centro: afirmar algo sobre el punto antes
 * de esto no probaría nada.
 */
export async function esperarMapaDelPaso1(page: Page) {
  const mapa = page.getByRole('region', { name: 'Mapa para elegir la ubicación del reporte' });
  await expect(mapa).toBeVisible({ timeout: 30_000 });
  await expect(mapa.getByText('Cargando el mapa…')).toHaveCount(0, { timeout: 30_000 });
  return mapa;
}

/** Paso 1 por la alternativa accesible al mapa: escribir las coordenadas. */
export async function elegirPuntoPorCoordenadas(page: Page, punto = PUNTO_CENTRO) {
  // El botón abre y cierra el bloque: al volver al paso 1 puede seguir abierto.
  if (!(await page.locator('#lat').isVisible()))
    await page.getByTestId('opcion-coordenadas').click();
  await page.locator('#lat').fill(String(punto.lat));
  await page.locator('#lon').fill(String(punto.lon));
  await page.getByTestId('boton-confirmar-ubicacion').click();
  await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
}

/** «Continuar» y espera al paso siguiente. */
export async function continuar(page: Page) {
  const n = await numeroDePaso(page);
  const boton = page.getByTestId('boton-siguiente');
  await expect(boton, `el paso ${n} tiene que poder continuarse`).toBeEnabled();
  await boton.click();
  await expect.poll(() => numeroDePaso(page)).toBe((n ?? 0) + 1);
}

/** Paso 2: profundidad y frecuencia (las dos entradas de la severidad v2). */
export async function responderPaso2(
  page: Page,
  { profundidad = 'rodilla', frecuencia = 'cada_lluvia_fuerte' } = {},
) {
  await page.locator(`input[name="profundidad_estimada"][value="${profundidad}"]`).check();
  await page.locator(`input[name="frecuencia"][value="${frecuencia}"]`).check();
}

/** Del paso 1, con el punto ya elegido, hasta el paso 3 (fotos y descripción). */
export async function llegarAFotos(page: Page) {
  await continuar(page);
  await responderPaso2(page);
  await continuar(page);
}

/** Del paso 1, con el punto ya elegido, hasta la revisión, sin tocar lo opcional. */
export async function llegarARevision(page: Page, marca: string) {
  await llegarAFotos(page);
  await page
    .locator('textarea[name="descripcion"]')
    .fill(`Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}`);
  await continuar(page);
}

/** Pulsa «Enviar reporte» y devuelve el cuerpo que salió hacia `POST /api/v1/reportes`. */
export async function enviarYLeerCuerpo(page: Page): Promise<Record<string, unknown>> {
  const peticion = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reportes',
  );
  await page.getByTestId('boton-enviar').click();
  return (await peticion).postDataJSON() as Record<string, unknown>;
}

// ------------------------------------------------------------------ red

/**
 * Retiene las peticiones que casan con `patron` hasta `liberar()`, para poder mirar el estado
 * intermedio (una foto que sube, una unidad vecinal que se está buscando) sin depender de que el
 * servidor tarde. `llegada` se cumple con la primera retenida.
 */
export async function retenerPeticiones(page: Page, patron: string | RegExp) {
  let liberar: () => void = () => {};
  const liberadas = new Promise<void>((r) => {
    liberar = r;
  });
  let avisarLlegada: () => void = () => {};
  const llegada = new Promise<void>((r) => {
    avisarLlegada = r;
  });
  // Si la prueba falla antes de liberar, la página se cierra: la espera no puede quedar colgada.
  const cerrada = new Promise<void>((r) => {
    page.once('close', () => r());
  });
  await page.route(patron, async (ruta) => {
    avisarLlegada();
    await Promise.race([liberadas, cerrada]);
    // La página pudo cancelarla mientras esperaba (el punto cambió otra vez): no es un fallo.
    await ruta.continue().catch(() => {});
  });
  return { llegada, liberar: () => liberar() };
}

/** Lo que pidió la página desde que se empezó a mirar, y lo que sigue en vuelo. */
export interface RedVigilada {
  pedidas: string[];
  enVuelo: Set<Request>;
}

/** Registrar ANTES de navegar: lo que salga antes no se ve. */
export function vigilarRed(page: Page): RedVigilada {
  const red: RedVigilada = { pedidas: [], enVuelo: new Set() };
  page.on('request', (r) => {
    red.pedidas.push(r.url());
    red.enVuelo.add(r);
  });
  const terminar = (r: Request) => {
    red.enVuelo.delete(r);
  };
  page.on('requestfinished', terminar);
  page.on('requestfailed', terminar);
  return red;
}

/**
 * Espera a que la red de lo que cumple `filtro` se quede quieta: nada en vuelo y ninguna petición
 * nueva durante `quietudMs`. Es la señal para poder afirmar una AUSENCIA («el mapa no pidió
 * manzanas»): MapLibre pide las teselas de todas las fuentes visibles en la misma tanda, así que
 * cuando las de UV y distritos ya volvieron y no sale nada más, una de manzanas ya habría salido.
 * Reemplaza a un `waitForTimeout` fijo, que pasaba igual con el mapa todavía cargando.
 */
export async function esperarRedQuieta(
  red: RedVigilada,
  filtro: (url: string) => boolean,
  { quietudMs = 1_500, plazoMs = 30_000 } = {},
) {
  let conteo = -1;
  let quietaDesde = Date.now();
  await expect
    .poll(
      () => {
        const ahora = Date.now();
        const n = red.pedidas.filter(filtro).length;
        const pendientes = [...red.enVuelo].some((r) => filtro(r.url()));
        if (pendientes || n !== conteo) {
          conteo = n;
          quietaDesde = ahora;
          return false;
        }
        return ahora - quietaDesde >= quietudMs;
      },
      {
        message: `la red no se quedó quieta ${quietudMs} ms (peticiones en vuelo o nuevas)`,
        timeout: plazoMs,
        intervals: [250],
      },
    )
    .toBe(true);
}
