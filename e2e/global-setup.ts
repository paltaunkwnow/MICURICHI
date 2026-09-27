/**
 * Preparación única de la suite, antes de cualquier test.
 *
 * Existe por una razón concreta: en desarrollo Next compila cada ruta la primera vez que se pide,
 * y ese compilado puede pasar del minuto en una máquina cargada. Si esa espera cae dentro de un
 * test (o de su `beforeAll`), se come el timeout de 90 s y el fallo aparece como intermitente en
 * una prueba que no tiene nada que ver. Aquí no hay timeout de test: se espera lo que haga falta.
 */
import { request } from '@playwright/test';

const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';
const GEO = process.env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002';
const PUBLICA = process.env.E2E_PUBLICA_URL ?? 'http://localhost:3000';
const PANEL = process.env.PANEL_ADMIN_URL ?? 'http://localhost:3100';

/** Reintenta hasta que la URL responda algo (lo que sea) o se agote el plazo. */
async function esperar(
  contexto: Awaited<ReturnType<typeof request.newContext>>,
  url: string,
  plazoMs: number,
): Promise<void> {
  const limite = Date.now() + plazoMs;
  let ultimo = 'sin respuesta';
  while (Date.now() < limite) {
    try {
      const r = await contexto.get(url, { timeout: 120_000 });
      if (r.status() < 500) return;
      ultimo = `HTTP ${r.status()}`;
    } catch (e) {
      // Mientras el servidor arranca, la petición lanza en vez de devolver un código.
      ultimo = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`No respondió ${url} en ${plazoMs / 1000} s (último intento: ${ultimo})`);
}

/** Lo que `playwright.config.ts` le pasa a api-core (ver `DEMORA_E2E_*` en tests/ayudas.ts). */
const ENTORNO_E2E = { demoraPrimeroS: 2, reportesPorDia: 3 };

const COMO_ARRANCAR =
  'Arrancá la pila con el entorno de prueba de playwright.config.ts (lo más simple: cerrá el ' +
  '`pnpm dev` que haya y dejá que Playwright lo levante), o al menos con ' +
  'REPORTE_DEMORA_PRIMERO_S=2 REPORTE_DEMORA_SIGUIENTES_S=4 REPORTES_POR_DIA_POR_CUENTA=3 ' +
  'ALTAS_POR_DIA_POR_IP=10000 COOKIE_SEGURA=0 (ver e2e/README.md).';

/**
 * La pila corre con la demora y el cupo de prueba. Sin esto, con la demora de producción (60 s)
 * cada prueba que modera un reporte recién creado se come su timeout esperándolo y el fallo no
 * dice por qué. Se pregunta con una cuenta nueva: `/auth/yo` devuelve cuánto tardaría en
 * publicarse su primer reporte y cuántos le quedan hoy.
 */
async function comprobarEntornoDePrueba(
  contexto: Awaited<ReturnType<typeof request.newContext>>,
): Promise<void> {
  const cuenta = {
    email: `e2e-preparacion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@curichi.test`,
    nombre: 'Preparación de la suite',
    password: 'contrasena-de-prueba-e2e',
  };
  const alta = await contexto.post(`${API}/api/v1/auth/registro`, { data: cuenta });
  if (alta.status() !== 201)
    throw new Error(
      `No se pudo crear la cuenta de comprobación (HTTP ${alta.status()}): ¿api-core con el tope de altas de producción (ALTAS_POR_DIA_POR_IP=10)? ${COMO_ARRANCAR}`,
    );
  const login = await contexto.post(`${API}/api/v1/auth/login`, {
    data: { email: cuenta.email, password: cuenta.password },
  });
  if (login.status() !== 200)
    throw new Error(
      `La cuenta de comprobación no pudo entrar (HTTP ${login.status()}): ¿el tope de logins de producción? ${COMO_ARRANCAR}`,
    );
  const respuesta = await contexto.get(`${API}/api/v1/auth/yo`);
  if (respuesta.status() !== 200)
    throw new Error(
      `/auth/yo respondió ${respuesta.status()} justo después de entrar: la pila corre con COOKIE_SEGURA=1 y el cliente de Playwright no manda la cookie Secure sobre http. ${COMO_ARRANCAR}`,
    );
  const yo = (await respuesta.json()) as {
    demora_proximo_s?: number;
    reportes_restantes_hoy?: number;
  };
  if (
    yo.demora_proximo_s !== ENTORNO_E2E.demoraPrimeroS ||
    yo.reportes_restantes_hoy !== ENTORNO_E2E.reportesPorDia
  )
    throw new Error(
      `api-core no corre con el entorno de prueba: /auth/yo dice demora_proximo_s=${yo.demora_proximo_s} ` +
        `y reportes_restantes_hoy=${yo.reportes_restantes_hoy}, y la suite espera ` +
        `${ENTORNO_E2E.demoraPrimeroS} y ${ENTORNO_E2E.reportesPorDia}. ${COMO_ARRANCAR}`,
    );
  await contexto.post(`${API}/api/v1/auth/logout`);
}

export default async function preparar(): Promise<void> {
  const contexto = await request.newContext();
  try {
    // 1) Los servicios, que son los que tienen que estar antes de nada.
    await esperar(contexto, `${API}/ready`, 180_000);
    await esperar(contexto, `${GEO}/health`, 60_000);
    await comprobarEntornoDePrueba(contexto);
    // 2) Las páginas, para que el primer test no pague el compilado.
    for (const url of [
      `${PUBLICA}/`,
      `${PUBLICA}/reportar`,
      `${PUBLICA}/como-funciona`,
      `${PUBLICA}/mis-reportes`,
      `${PUBLICA}/cuenta`,
      `${PANEL}/login`,
      `${PANEL}/ejecutivo`,
      `${PANEL}/reportes`,
      `${PANEL}/indicadores`,
    ]) {
      try {
        await esperar(contexto, url, 300_000);
      } catch (e) {
        // La causa casi siempre es la misma y el mensaje de origen no la sugiere: `webServer`
        // solo vigila el puerto de api-core, así que un api-core suelto de una sesión anterior
        // hace que Playwright dé la pila por levantada, no arranque `pnpm dev`, y las apps Next
        // no lleguen a existir. Ha costado dos corridas averiguarlo; que lo diga el error.
        throw new Error(
          `${(e as Error).message}\n\n` +
            'Lo más probable: quedó un api-core suelto en 3001 de una sesión anterior. Playwright ' +
            'mira solo ese puerto (reuseExistingServer), da la pila por levantada y nunca arranca ' +
            'las apps.\n' +
            'Comprobalo y liberá los cuatro puertos (3000, 3001, 3002, 3100) antes de repetir:\n' +
            '  netstat -ano | findstr "LISTENING" | findstr ":300"',
        );
      }
    }
  } finally {
    await contexto.dispose();
  }
}
