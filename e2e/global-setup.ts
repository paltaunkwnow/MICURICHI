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

export default async function preparar(): Promise<void> {
  const contexto = await request.newContext();
  try {
    // 1) Los servicios, que son los que tienen que estar antes de nada.
    await esperar(contexto, `${API}/ready`, 180_000);
    await esperar(contexto, `${GEO}/health`, 60_000);
    // 2) Las páginas, para que el primer test no pague el compilado.
    for (const url of [
      `${PUBLICA}/`,
      `${PUBLICA}/reportar`,
      `${PUBLICA}/como-funciona`,
      `${PANEL}/login`,
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
