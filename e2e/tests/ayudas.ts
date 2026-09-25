import { type APIRequestContext, expect, type Page } from '@playwright/test';

export const API = 'http://127.0.0.1:3001';
export const GEO = 'http://127.0.0.1:3002';
export const PANEL = process.env.PANEL_ADMIN_URL ?? 'http://localhost:3100';

/** Punto dentro de la cobertura municipal (plaza 24 de Septiembre, Santa Cruz de la Sierra). */
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

/** Cuenta ciudadana del seed. Desde la Fase 5, crear un reporte exige sesión. */
export const CREDENCIALES_VECINA = {
  email: process.env.E2E_VECINA_EMAIL ?? 'vecina@curichi.local',
  password: process.env.E2E_VECINA_PASSWORD ?? 'curichi-vecina-local',
};

export function reporteValido(marca: string) {
  return {
    lat: PUNTO_CENTRO.lat,
    lon: PUNTO_CENTRO.lon,
    ubicacion_metodo: 'manual' as const,
    ubicacion_tipo: 'via_publica' as const,
    descripcion: `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}`,
    tirante_estimado: 'rodilla' as const,
    duracion_estimada: '2h_12h' as const,
    frecuencia: 'cada_lluvia_fuerte' as const,
    afectacion: 'vehicular' as const,
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
