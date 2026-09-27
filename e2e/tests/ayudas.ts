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

// ------------------------------------------------------------------ el teléfono

/**
 * Topes de la ubicación del dispositivo (contracts 0.9.0, `CONFIG_DOMINIO`). La suite no depende
 * de `contracts`: si cambian allá, se cambian acá, y las pruebas del radio lo van a notar.
 */
export const RADIO_DISPOSITIVO_M = 60;
export const PRECISION_DISPOSITIVO_MAX_M = 50;
export const POSICION_ANTIGUEDAD_MAX_S = 600;

/** Precisión del GPS simulado en toda la suite: holgada dentro de los 50 m que se exigen. */
export const PRECISION_GPS_M = 10;

/**
 * El teléfono de los recorridos de reporte, para `test.use({ geolocation })`: en PUNTO_CENTRO y
 * con 10 m de precisión. Reportar exige compartir la ubicación y el punto tiene que quedar a 60 m
 * o menos de ella (plan 2026-09-26, pedido E).
 *
 * La posición sola no alcanza: el permiso lo da el contexto, igual que el de la cámara, y solo en
 * las pruebas que reportan (`permissions: ['geolocation']`). Sin él, Chromium lo niega al primer
 * pedido, como quien toca «Bloquear».
 */
export const GPS_EN_EL_CENTRO = {
  latitude: PUNTO_CENTRO.lat,
  longitude: PUNTO_CENTRO.lon,
  accuracy: PRECISION_GPS_M,
};

/** Radio medio de la Tierra de `contracts` (haversine), para que las distancias coincidan. */
const RADIO_TIERRA_M = 6_371_008.8;
const METROS_POR_GRADO = (RADIO_TIERRA_M * Math.PI) / 180;
const siete = (x: number) => Math.round(x * 1e7) / 1e7;

/**
 * El punto a `norteM` y `esteM` metros de `base` (negativos: al sur y al oeste), con 7 decimales,
 * que es lo que se escribe en el campo de coordenadas.
 */
export function desplazar(
  base: { lat: number; lon: number },
  { norteM = 0, esteM = 0 }: { norteM?: number; esteM?: number },
) {
  const mLon = METROS_POR_GRADO * Math.cos((base.lat * Math.PI) / 180);
  return { lat: siete(base.lat + norteM / METROS_POR_GRADO), lon: siete(base.lon + esteM / mLon) };
}

/** Distancia en metros, con la misma fórmula que `distanciaMetros` de `contracts`. */
export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lo que dice el paso 1 de la distancia entre el punto y el teléfono (`distancia-al-punto`). */
export function textoDistancia(punto: { lat: number; lon: number }, telefono = PUNTO_CENTRO) {
  const n = Math.round(distanciaM(punto, telefono));
  return n < 1 ? 'El punto está justo donde estás.' : `Ese punto está a ${n} m de vos.`;
}

/**
 * Un punto a 50 m del teléfono (30 al norte y 40 al este), dentro del círculo: el vecino lo
 * ajustó a mano. Ni su latitud ni su longitud coinciden con las del teléfono, así que se puede
 * buscar la posición del teléfono en lo que guarda el servidor sin confundirla con la del punto.
 */
export const PUNTO_AJUSTADO = desplazar(PUNTO_CENTRO, { norteM: 30, esteM: 40 });

/** El `dispositivo` de `POST /api/v1/reportes`: el teléfono en `punto`, con 10 m y recién leído. */
export function dispositivoEn(
  punto: { lat: number; lon: number },
  { precisionM = PRECISION_GPS_M, antiguedadS = 0 } = {},
) {
  return { lat: punto.lat, lon: punto.lon, precision_m: precisionM, antiguedad_s: antiguedadS };
}

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
 *
 * Desde contracts 0.9.0 lleva el `dispositivo`, en el mismo `punto` que el reporte, con 10 m de
 * precisión: el servidor exige el punto a 60 m o menos del teléfono y deriva de ahí el método
 * (`gps`, a 2 m o menos). Ya no lleva `ubicacion_metodo` ni `precision_gps_m`.
 */
export function reporteValido(marca: string, punto: { lat: number; lon: number } = PUNTO_CENTRO) {
  return {
    lat: punto.lat,
    lon: punto.lon,
    dispositivo: dispositivoEn(punto),
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
 * Existe porque cada cuenta solo puede enviar **3 reportes por día** (contracts 0.10.0): si los
 * casos usaran la cuenta del seed, a partir del cuarto envío del día recibirían 429 y el
 * resultado dependería del orden y de cuántas veces se hubiera corrido la suite ese día (con
 * `--repeat-each` o `--retries`, en la misma corrida). Además, el 1.º reporte del día de una
 * cuenta se publica antes que los siguientes. Una cuenta por caso hace que cada prueba parta de
 * un estado limpio sin tocar la base por debajo ni apagar el límite, que es justamente una de las
 * cosas que hay que comprobar.
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

/**
 * Crea un reporte por API con una cuenta recién creada (para no gastar la cuota de otra). Queda
 * en espera de su publicación: para moderarlo o consultarlo hay que `esperarPublicacion` (o usar
 * `crearReportePublicadoPorApi`).
 */
export async function crearReportePorApi(request: APIRequestContext, marca: string) {
  await cuentaNuevaConSesion(request, 'rep-');
  const r = await request.post(`${API}/api/v1/reportes`, { data: reporteValido(marca) });
  expect(r.status(), await r.text()).toBe(201);
  const f = await r.json();
  return f.id as string;
}

/**
 * Crea un reporte con una cuenta nueva, entra como técnico y espera a que se publique: deja
 * `request` con la sesión del TÉCNICO, lista para moderarlo. Durante la demora nadie lo ve, ni
 * los técnicos: un PATCH antes de tiempo da 404.
 */
export async function crearReportePublicadoPorApi(request: APIRequestContext, marca: string) {
  const id = await crearReportePorApi(request, marca);
  await loginTecnico(request);
  await esperarPublicacion(request, id);
  return id;
}

// ------------------------------------------------------------------ publicación y cupo

/**
 * Demoras de publicación de la pila E2E (`REPORTE_DEMORA_*_S` en playwright.config.ts): el 1.º
 * reporte del día de una cuenta se ve 2 s después de enviarlo y los siguientes, 4 s. En
 * producción son 60 y 240 (contracts 0.11.0). `global-setup.ts` comprueba que la pila corra así.
 */
export const DEMORA_E2E_PRIMERO_S = 2;
export const DEMORA_E2E_SIGUIENTES_S = 4;

/** Reportes por cuenta y por día (contracts 0.10.0, `REPORTES_POR_DIA_POR_CUENTA`). */
export const REPORTES_POR_DIA = 3;

/**
 * Etiqueta pública de cada estado (contracts 0.11.0, `ETIQUETAS.estado_publico`). «NO SE HA
 * VERIFICADO» es un texto exacto que decidió el usuario: no se traduce ni se abrevia.
 */
export const ETIQUETA_PUBLICA = {
  nuevo: 'NO SE HA VERIFICADO',
  validado: 'Verificado',
  resuelto: 'Resuelto',
} as const;

/** «Te quedan N de 3 reportes hoy» (`cupo-reportes` del formulario y `cupo-cuenta` de la cuenta). */
export function textoCupo(restantes: number) {
  return `Te quedan ${restantes} de ${REPORTES_POR_DIA} reportes hoy`;
}

/** El mensaje del 429 `CUOTA_DE_REPORTES`, el mismo en api-core y en la app pública. */
export const TEXTO_CUPO_AGOTADO = `Ya enviaste los ${REPORTES_POR_DIA} reportes de hoy. Vas a poder enviar otro mañana.`;

/** Lo que dice la cuenta regresiva de la confirmación (`cuenta-regresiva`) al llegar a cero. */
export const TEXTO_YA_PUBLICADO = 'Ya está publicado · recargá el mapa para verlo';

/**
 * Espera a que el reporte `id` esté publicado. El servidor lo guarda al enviarlo y lo muestra
 * pasada su demora (plan 2026-09-26, pedido C; en la pila E2E, `REPORTE_DEMORA_*_S` de pocos
 * segundos), y durante la espera no lo ve nadie, ni los técnicos. Se lo pregunta a la vista técnica,
 * así que `request` tiene que tener sesión de técnico o de admin (`loginTecnico`).
 *
 * Devuelve el momento (`Date.now()`) en que se lo vio publicado, para medir desde ahí cuánto tarda
 * una pantalla en mostrarlo. No afirma nada sobre la demora en sí.
 */
export async function esperarPublicacion(
  request: APIRequestContext,
  id: string,
  plazoMs = 30_000,
): Promise<number> {
  await expect
    .poll(async () => (await request.get(`${API}/api/v1/tecnico/reportes/${id}`)).status(), {
      message: `el reporte ${id} tiene que publicarse (¿api-core con REPORTE_DEMORA_*_S de prueba?)`,
      timeout: plazoMs,
      intervals: [250],
    })
    .toBe(200);
  return Date.now();
}

/** Coordenadas de tesela (slippy map) para un punto y un zoom. */
export function tesela(lat: number, lon: number, z: number) {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
  return { x, y, z };
}

/** PNG 1×1 válido, para probar la subida de fotos por API sin depender de archivos del repo. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Trozos RIFF que llevan metadatos: ninguna foto servida puede tenerlos. */
export const TROZOS_DE_METADATOS = ['EXIF', 'XMP ', 'ICCP'];

/**
 * Medidas y trozos de un WebP leídos de los bytes, y no de lo que diga el servidor. Falla si no es
 * un contenedor RIFF…WEBP.
 */
export function leerWebp(datos: Buffer): { ancho: number; alto: number; trozos: string[] } {
  expect(datos.subarray(0, 4).toString('latin1'), 'la foto tiene que ser un RIFF').toBe('RIFF');
  expect(datos.subarray(8, 12).toString('latin1'), 'la foto tiene que ser un WEBP').toBe('WEBP');
  const trozos: string[] = [];
  let ancho = 0;
  let alto = 0;
  for (let i = 12; i + 8 <= datos.length; ) {
    const tipo = datos.subarray(i, i + 4).toString('latin1');
    const largo = datos.readUInt32LE(i + 4);
    const d = datos.subarray(i + 8, i + 8 + largo);
    trozos.push(tipo);
    if (tipo === 'VP8X') {
      // Lienzo extendido: ancho y alto menos uno, en 24 bits.
      ancho = d.readUIntLE(4, 3) + 1;
      alto = d.readUIntLE(7, 3) + 1;
    } else if (tipo === 'VP8 ' && !ancho) {
      // Con pérdida: 3 bytes de cabecera de cuadro y 3 del código de inicio, luego 14 bits por lado.
      ancho = d.readUInt16LE(6) & 0x3fff;
      alto = d.readUInt16LE(8) & 0x3fff;
    } else if (tipo === 'VP8L' && !ancho) {
      const bits = d.readUInt32LE(1);
      ancho = (bits & 0x3fff) + 1;
      alto = ((bits >>> 14) & 0x3fff) + 1;
    }
    // Cada trozo se rellena hasta un largo par.
    i += 8 + largo + (largo % 2);
  }
  return { ancho, alto, trozos };
}

/**
 * Crea una cuenta y entra con ella **por la interfaz**, como haría un vecino.
 *
 * Cuenta nueva en cada llamada por el mismo motivo que en la API: una cuenta solo puede enviar
 * 3 reportes por día, así que reutilizar la del seed haría que la suite fallara a partir del
 * cuarto caso y, peor, que fallara solo a veces según cuántas veces se hubiera corrido ese día.
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

/** El mapa del paso 1, que solo existe con la posición del teléfono ya compartida. */
export function mapaDelPaso1(page: Page) {
  return page.getByRole('region', { name: 'Mapa para elegir la ubicación del reporte' });
}

/** «Compartir mi ubicación», el único botón que pide la ubicación (plan 2026-09-26, pedido F). */
export function botonCompartirUbicacion(page: Page) {
  return page.getByTestId('boton-compartir-ubicacion');
}

/**
 * Abre `/reportar` (o el enlace dado) con la sesión ya puesta. En el paso 1 todavía no hay mapa:
 * sin la posición del teléfono solo está «Para reportar necesitamos tu ubicación» con su botón,
 * y la ubicación no se pide hasta tocarlo.
 */
export async function abrirFormulario(page: Page, url = '/reportar') {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Reportar un punto' })).toBeVisible();
  if ((await numeroDePaso(page)) === 1) {
    await expect(
      page.getByRole('heading', { name: 'Para reportar necesitamos tu ubicación' }),
    ).toBeVisible();
    await expect(botonCompartirUbicacion(page)).toBeVisible();
  }
}

/**
 * Toca «Compartir mi ubicación». Un toque anterior a la hidratación se pierde sin error, así que
 * se repite mientras el botón siga ahí; cuando la búsqueda arranca, el botón desaparece (queda
 * «Buscando tu ubicación…», o el bloqueo si se negó el permiso).
 */
export async function tocarCompartirUbicacion(page: Page) {
  const boton = botonCompartirUbicacion(page);
  await expect(async () => {
    if (await boton.isVisible()) await boton.click({ timeout: 2_000 });
    await expect(boton).toBeHidden({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Paso 1 con el teléfono de la prueba (`GPS_EN_EL_CENTRO` o el que declare el contexto): comparte
 * la ubicación, espera el mapa con el círculo y que se resuelva la unidad vecinal del punto, que
 * arranca en la posición del teléfono.
 */
export async function compartirUbicacion(page: Page) {
  await tocarCompartirUbicacion(page);
  const mapa = await esperarMapaDelPaso1(page);
  await expect(page.getByTestId('ubicacion-resuelta')).toBeVisible();
  return mapa;
}

/**
 * El mapa del paso 1 cargado: montado y con su primer `idle` (se va «Cargando el mapa…»). Antes
 * del arreglo, el `load` del mapa pisaba el punto con el centro: afirmar algo sobre el punto antes
 * de esto no probaría nada.
 */
export async function esperarMapaDelPaso1(page: Page) {
  const mapa = mapaDelPaso1(page);
  await expect(mapa).toBeVisible({ timeout: 30_000 });
  await expect(mapa.getByText('Cargando el mapa…')).toHaveCount(0, { timeout: 30_000 });
  return mapa;
}

/** Escribe unas coordenadas en «Ingresar coordenadas» y las confirma, sin afirmar el resultado. */
export async function escribirCoordenadas(page: Page, punto: { lat: number; lon: number }) {
  // El botón abre y cierra el bloque: al volver al paso 1 puede seguir abierto.
  if (!(await page.locator('#lat').isVisible()))
    await page.getByTestId('opcion-coordenadas').click();
  await page.locator('#lat').fill(String(punto.lat));
  await page.locator('#lon').fill(String(punto.lon));
  await page.getByTestId('boton-confirmar-ubicacion').click();
}

/**
 * Paso 1 por la alternativa accesible al arrastre: escribir las coordenadas de un punto a 60 m o
 * menos del teléfono. Si la ubicación todavía no se compartió, la comparte primero: sin ella no
 * hay dónde escribirlas.
 */
export async function elegirPuntoPorCoordenadas(
  page: Page,
  punto: { lat: number; lon: number } = PUNTO_CENTRO,
  telefono = PUNTO_CENTRO,
) {
  if (await botonCompartirUbicacion(page).isVisible()) await compartirUbicacion(page);
  await escribirCoordenadas(page, punto);
  await expect(page.getByTestId('error-coordenadas')).toHaveCount(0);
  // La distancia es la del punto nuevo: con la unidad vecinal del anterior todavía a la vista,
  // «ubicacion-resuelta» sola no probaría que el punto cambió.
  await expect(page.getByTestId('distancia-al-punto')).toHaveText(textoDistancia(punto, telefono));
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

// ------------------------------------------------------------------ cámara

/**
 * Lo que registró `vigilarCamara`: las restricciones de cada `getUserMedia`, en orden, y cuántas
 * pistas siguen encendidas.
 */
export interface CamaraVigilada {
  pedidos: MediaStreamConstraints[];
  encendidas: number;
}

interface RegistroCamara {
  pedidos: MediaStreamConstraints[];
  pistas: MediaStreamTrack[];
}

/**
 * Envuelve `getUserMedia` para saber cuándo se pidió la cámara, con qué restricciones y si quedó
 * prendida. Registrar ANTES de navegar: se instala al empezar cada documento. Devuelve la función
 * que lee el registro.
 *
 * La cámara es la falsa de Chromium (`--use-fake-device-for-media-stream`, en la configuración):
 * entrega un cuadro sintético de verdad, así que el disparo, la captura y la subida son los reales.
 */
export async function vigilarCamara(page: Page): Promise<() => Promise<CamaraVigilada>> {
  await page.addInitScript(() => {
    const dispositivos = navigator.mediaDevices;
    if (!dispositivos?.getUserMedia) return;
    const original = dispositivos.getUserMedia.bind(dispositivos);
    const registro: RegistroCamara = { pedidos: [], pistas: [] };
    Object.defineProperty(window, '__camaraE2E', { value: registro });
    dispositivos.getUserMedia = async (restricciones) => {
      registro.pedidos.push(JSON.parse(JSON.stringify(restricciones ?? {})));
      const flujo = await original(restricciones);
      registro.pistas.push(...flujo.getTracks());
      return flujo;
    };
  });
  return () =>
    page.evaluate(() => {
      const registro = (window as unknown as { __camaraE2E?: RegistroCamara }).__camaraE2E;
      return {
        pedidos: registro?.pedidos ?? [],
        encendidas: registro?.pistas.filter((p) => p.readyState === 'live').length ?? 0,
      };
    });
}

/** Lo que registró `vigilarSensores` desde que empezó el documento. */
export interface SensoresVigilados {
  /** Cada lectura de la ubicación, en orden, con las opciones con que se pidió. */
  geolocalizacion: { metodo: 'getCurrentPosition' | 'watchPosition'; opciones: unknown }[];
  /** Vigilancias de la ubicación apagadas con `clearWatch`. */
  apagadas: number;
  /** Nombre de cada permiso consultado con `navigator.permissions.query`. */
  permisos: string[];
  /** Llamadas a `getUserMedia` y a `enumerateDevices`: pedir o espiar la cámara. */
  camara: number;
}

/**
 * Espía la ubicación, los permisos y la cámara desde que empieza cada documento, para comprobar
 * que al abrir la web no se pide ni se lee nada (plan 2026-09-26, pedido F). Registrar ANTES de
 * navegar. No cambia lo que devuelve cada llamada: solo la anota.
 */
export async function vigilarSensores(page: Page): Promise<() => Promise<SensoresVigilados>> {
  await page.addInitScript(() => {
    const registro = { geolocalizacion: [], apagadas: 0, permisos: [], camara: 0 } as {
      geolocalizacion: { metodo: string; opciones: unknown }[];
      apagadas: number;
      permisos: string[];
      camara: number;
    };
    Object.defineProperty(window, '__sensoresE2E', { value: registro });
    const copia = (x: unknown) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

    const geo = navigator.geolocation;
    if (geo) {
      const leer = geo.getCurrentPosition.bind(geo);
      const vigilar = geo.watchPosition.bind(geo);
      const apagar = geo.clearWatch.bind(geo);
      geo.getCurrentPosition = (exito, error, opciones) => {
        registro.geolocalizacion.push({ metodo: 'getCurrentPosition', opciones: copia(opciones) });
        leer(exito, error, opciones);
      };
      geo.watchPosition = (exito, error, opciones) => {
        registro.geolocalizacion.push({ metodo: 'watchPosition', opciones: copia(opciones) });
        return vigilar(exito, error, opciones);
      };
      geo.clearWatch = (id) => {
        registro.apagadas += 1;
        apagar(id);
      };
    }
    const permisos = navigator.permissions;
    if (permisos?.query) {
      const consultar = permisos.query.bind(permisos);
      permisos.query = (descriptor) => {
        registro.permisos.push(String(descriptor?.name));
        return consultar(descriptor);
      };
    }
    const dispositivos = navigator.mediaDevices;
    if (dispositivos?.getUserMedia) {
      const pedir = dispositivos.getUserMedia.bind(dispositivos);
      const listar = dispositivos.enumerateDevices.bind(dispositivos);
      dispositivos.getUserMedia = (restricciones) => {
        registro.camara += 1;
        return pedir(restricciones);
      };
      dispositivos.enumerateDevices = () => {
        registro.camara += 1;
        return listar();
      };
    }
  });
  return () =>
    page.evaluate(
      () =>
        (window as unknown as { __sensoresE2E?: SensoresVigilados }).__sensoresE2E ?? {
          geolocalizacion: [],
          apagadas: 0,
          permisos: [],
          camara: 0,
        },
    );
}

/** El diálogo de la cámara, que se llama como el botón que lo abre. */
export function dialogoCamara(page: Page) {
  return page.getByRole('dialog', { name: 'Sacar foto' });
}

/**
 * «Sacar foto» → disparo → «Usar esta foto», como lo hace el vecino. Devuelve el tamaño del cuadro
 * del video al disparar. No espera la subida: quien necesite la respuesta de `POST /fotos` la
 * espera (o la retiene) por su cuenta.
 */
export async function sacarFotoConLaCamara(page: Page): Promise<{ ancho: number; alto: number }> {
  await page.getByTestId('boton-sacar-foto').click();
  const camara = dialogoCamara(page);
  await expect(camara).toBeVisible();
  // El disparo se habilita con el primer cuadro del video: antes, la foto saldría negra.
  const disparo = camara.getByTestId('boton-disparo');
  await expect(disparo).toBeEnabled({ timeout: 20_000 });
  const cuadro = await camara
    .locator('video')
    .evaluate((v: HTMLVideoElement) => ({ ancho: v.videoWidth, alto: v.videoHeight }));
  await disparo.click();
  await camara.getByTestId('boton-usar-foto').click();
  await expect(camara).toBeHidden();
  return cuadro;
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

/**
 * Registrar ANTES de navegar: lo que salga antes no se ve. Con `todoElContexto` mira el contexto
 * entero: las otras pestañas y lo que pida el service worker por su cuenta, que Chromium informa
 * en el contexto y no en la página.
 */
export function vigilarRed(page: Page, { todoElContexto = false } = {}): RedVigilada {
  const red: RedVigilada = { pedidas: [], enVuelo: new Set() };
  const anotar = (r: Request) => {
    red.pedidas.push(r.url());
    red.enVuelo.add(r);
  };
  const terminar = (r: Request) => {
    red.enVuelo.delete(r);
  };
  if (todoElContexto) {
    const contexto = page.context();
    contexto.on('request', anotar);
    contexto.on('requestfinished', terminar);
    contexto.on('requestfailed', terminar);
  } else {
    page.on('request', anotar);
    page.on('requestfinished', terminar);
    page.on('requestfailed', terminar);
  }
  // Una navegación de página completa (`page.goto` a otra URL) puede cortar a mitad una petición
  // de la página vieja. Esa petición nunca dispara `requestfinished` ni `requestfailed` —limitación
  // conocida de Chromium/CDP: el frame principal es el MISMO objeto antes y después de navegar, así
  // que no sirve mirar si quedó «destruido»— y se queda «en vuelo» para siempre: sin este oyente,
  // `esperarRedQuieta` nunca ve la red quieta después de una navegación así (visto con un
  // diagnóstico ad hoc: `enVuelo` se quedaba en 1 desde el primer tick hasta el último, por una
  // petición de la página anterior). Al terminar la navegación del frame principal ya no puede
  // haber nada legítimamente «en vuelo» de la página vieja, así que se limpia.
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) red.enVuelo.clear();
  });
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

// ------------------------------------------------------------------ panel: sondeo

/**
 * Cabecera con que el panel marca sus refrescos automáticos: api-core no renueva con ellos la
 * inactividad de la sesión. Lo que pide la persona (la primera carga de cada pantalla, un filtro)
 * no la lleva.
 */
export const CABECERA_SONDEO = 'x-curichi-sondeo';

/** Cada cuánto se refrescan solas la bandeja, el detalle, los indicadores y el panel ejecutivo. */
export const INTERVALO_SONDEO_MS = 10_000;

/**
 * Pone la pestaña oculta o visible, como cuando la persona se va a otra y vuelve. Chromium sin
 * ventana deja todas las pestañas «visibles» aunque otra pase adelante, así que se fija lo que
 * leen las páginas (`document.visibilityState` y `document.hidden`) y se disparan los eventos que
 * el navegador dispararía: `visibilitychange` (el que escucha TanStack Query) y `blur`/`focus`.
 */
export async function simularPestana(page: Page, estado: 'oculta' | 'visible') {
  await page.evaluate((oculta) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (oculta ? 'hidden' : 'visible'),
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    window.dispatchEvent(new Event(oculta ? 'blur' : 'focus'));
  }, estado === 'oculta');
}

// ------------------------------------------------------------------ mapa público

/**
 * Puntos que el mapa público tiene dibujados, leídos de su resumen accesible (`resumen-mapa`:
 * «N puntos sueltos. M puntos agrupados en K zonas…»). El resumen sale de `queryRenderedFeatures`,
 * que solo responde con lo que el worker de MapLibre ya procesó: más de cero quiere decir que el
 * worker cargó y trabajó.
 */
export async function puntosEnElMapa(page: Page): Promise<number> {
  const texto = await page
    .getByTestId('resumen-mapa')
    .textContent({ timeout: 5_000 })
    .catch(() => null);
  const sueltos = /(\d+)\s+puntos?\s+suelto/.exec(texto ?? '');
  const agrupados = /(\d+)\s+puntos?\s+agrupado/.exec(texto ?? '');
  return Number(sueltos?.[1] ?? 0) + Number(agrupados?.[1] ?? 0);
}

/** Espera a que el mapa público dibuje al menos un punto (ver `puntosEnElMapa`). */
export async function esperarPuntosEnElMapa(page: Page) {
  await expect
    .poll(() => puntosEnElMapa(page), {
      message: 'el mapa público tiene que dibujar puntos (worker de MapLibre cargado)',
      timeout: 60_000,
      intervals: [500],
    })
    .toBeGreaterThan(0);
}

// ------------------------------------------------------------------ CSP

/** Una violación de la Content-Security-Policy, como la describe `securitypolicyviolation`. */
export interface ViolacionCsp {
  pagina: string;
  directiva: string;
  bloqueado: string;
  origen: string;
  disposicion: string;
}

/** Lo que junta `vigilarCsp` desde que se la llamó, en todas las navegaciones de la página. */
export interface VigilanciaCsp {
  violaciones: ViolacionCsp[];
  /** Errores de consola y excepciones sin atrapar, cada uno con la página en que salió. */
  errores: { pagina: string; texto: string }[];
  /** Peticiones que el navegador cortó por la CSP. */
  bloqueadas: { pagina: string; url: string }[];
}

/** Cómo escribe Chromium en la consola lo que bloquea la CSP. */
const RE_MENSAJE_CSP =
  /Content[ -]Security[ -]Policy|Refused to (load|execute|evaluate|connect|apply|create|frame|display|send|compile)/i;

/**
 * Junta los eventos `securitypolicyviolation`, los errores de consola, las excepciones sin atrapar
 * y las peticiones cortadas por la CSP. Registrar ANTES de navegar: el oyente se instala al empezar
 * cada documento, antes que cualquier script de la página, y la función expuesta sobrevive a las
 * navegaciones.
 */
export async function vigilarCsp(page: Page): Promise<VigilanciaCsp> {
  const v: VigilanciaCsp = { violaciones: [], errores: [], bloqueadas: [] };
  await page.exposeBinding('__violacionCspE2E', ({ frame }, d: Omit<ViolacionCsp, 'pagina'>) => {
    v.violaciones.push({ pagina: frame.url(), ...d });
  });
  await page.addInitScript(() => {
    document.addEventListener(
      'securitypolicyviolation',
      (e) => {
        const d = {
          directiva: e.effectiveDirective || e.violatedDirective,
          bloqueado: e.blockedURI,
          origen: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : '',
          disposicion: e.disposition,
        };
        const avisar = (window as unknown as { __violacionCspE2E?: (d: unknown) => void })
          .__violacionCspE2E;
        // Sin la función expuesta, que igual quede en la consola, donde también se mira.
        if (avisar) void avisar(d);
        else console.error(`Content Security Policy (E2E): ${JSON.stringify(d)}`);
      },
      true,
    );
  });
  page.on('console', (m) => {
    if (m.type() === 'error') v.errores.push({ pagina: page.url(), texto: m.text() });
  });
  page.on('pageerror', (e) =>
    v.errores.push({ pagina: page.url(), texto: `${e.name}: ${e.message}` }),
  );
  page.on('requestfailed', (r) => {
    if (/csp/i.test(r.failure()?.errorText ?? ''))
      v.bloqueadas.push({ pagina: page.url(), url: r.url() });
  });
  return v;
}

/**
 * Ninguna violación de la CSP hasta ahora: ni eventos, ni mensajes de la CSP en la consola, ni
 * peticiones cortadas. Los demás errores de consola no se juzgan acá (un 401 de `/auth/yo` sin
 * sesión también sale como error), pero van en el mensaje para diagnosticar.
 */
export function comprobarSinViolacionesCsp(v: VigilanciaCsp, donde: string) {
  const deLaCsp = v.errores.filter((e) => RE_MENSAJE_CSP.test(e.texto));
  const otros = v.errores.filter((e) => !RE_MENSAJE_CSP.test(e.texto)).map((e) => e.texto);
  expect(
    { violaciones: v.violaciones, consola: deLaCsp, bloqueadas: v.bloqueadas },
    `${donde}: sin violaciones de la CSP${otros.length ? ` (otros errores de consola: ${otros.slice(0, 5).join(' | ')})` : ''}`,
  ).toEqual({ violaciones: [], consola: [], bloqueadas: [] });
}

/**
 * La página llegó con la CSP de nonce (plan 2026-09-26, S40 y S41): sin ella, «sin violaciones» no
 * probaría nada. `script-src` lleva un nonce y no lleva 'unsafe-inline'.
 */
export function comprobarCspConNonce(csp: string | undefined, donde: string) {
  expect(csp, `${donde}: la página tiene que llegar con Content-Security-Policy`).toBeTruthy();
  const scriptSrc =
    (csp ?? '')
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src ')) ?? '';
  expect(scriptSrc, `${donde}: script-src con nonce`).toMatch(/'nonce-[A-Za-z0-9+/=]{16,}'/);
  expect(scriptSrc, `${donde}: script-src sin 'unsafe-inline'`).not.toContain("'unsafe-inline'");
}
