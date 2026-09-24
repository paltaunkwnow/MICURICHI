import { defineConfig, devices } from '@playwright/test';

/**
 * E2E transversales de Mi Curichi (Parte 5). Cruzan las cinco partes:
 * ciudadano reporta → técnico valida → aparece en el mapa público → sale en la exportación.
 *
 * Antes de correrlos hace falta la pila local levantada y con datos:
 *   pnpm db:local        (PostGIS sin Docker en 127.0.0.1:5433)
 *   pnpm db:seed:samples (capas y reportes sintéticos + usuarios locales)
 *   pnpm dev             (api-core 3001, geo-service 3002, apps 3000 y 3100)
 * Si no hay nada escuchando, `webServer` levanta `pnpm dev` por su cuenta.
 */
export default defineConfig({
  testDir: './tests',
  // Espera a los servicios y precalienta las rutas de Next una sola vez, sin timeout de test.
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'movil',
      use: { ...devices['Pixel 7'] },
      // El mapa es lo que más cambia entre tamaños: en móvil el detalle sube como hoja sobre el
      // mapa y no hay lista lateral donde caerse. Los dos archivos del mapa corren también acá.
      testMatch: /(mapa-publico|mapa-seleccion)\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: '..',
    url: 'http://127.0.0.1:3001/health',
    timeout: 300_000,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // La suite crea varios reportes desde la misma IP; con el límite de producción (10/h)
      // los últimos casos recibirían 429 y el resultado dependería de cuántas veces se corrió.
      // Solo afecta al servidor que levanta Playwright.
      RATE_LIMIT_REPORTES_POR_HORA: '1000',
      // El listado público pasó a tener límite en la Fase 3 (240/min). La suite lo consulta
      // muchas veces por test; sin subirlo, los últimos casos recibirían 429.
      RATE_LIMIT_LECTURAS_POR_MINUTO: '100000',
      // Igual con el login: la suite entra varias veces desde la misma IP. Hay DOS frenos y
      // hay que subir los dos: el tope bruto de peticiones por ventana y el contador de fallos
      // por cuenta y por IP, que vive en la base y sobrevive a un reinicio del servicio.
      LOGIN_PETICIONES_POR_VENTANA: '1000',
      /**
       * Altas de cuenta. La suite crea una cuenta por caso que necesite reportar, porque cada
       * cuenta solo puede enviar un reporte por hora y compartirla haría que el resultado
       * dependiera del orden. El límite real (5 por IP y hora) dejaría fuera a la mitad de la
       * suite desde la misma máquina.
       *
       * La cuota de un reporte por hora NO se toca: es una de las cosas que hay que comprobar,
       * y `cuenta-ciudadana.spec.ts` verifica que el segundo envío de una cuenta se rechaza.
       */
      REGISTRO_PETICIONES_POR_VENTANA: '1000',
      REGISTRO_MAX_POR_IP: '1000',
      LOGIN_MAX_FALLOS_IP: '100000',
      LOGIN_MAX_FALLOS_EMAIL: '100000',
      /**
       * La suite corre sobre `http://localhost`, sin TLS. Con `COOKIE_SEGURA=1` la cookie de
       * sesión sale marcada `Secure` y el `APIRequestContext` de Playwright —que no es un
       * navegador y no aplica la excepción que los navegadores hacen con `localhost`— no la
       * vuelve a mandar: los casos que exigen sesión de técnico (exportación, indicadores)
       * reciben 401 y parece un fallo de autorización cuando es del transporte.
       *
       * Solo afecta al servidor que levanta Playwright en esta máquina. En producción manda
       * `.env` y ahí vale 1; el `docker compose` del repo también arranca con 1.
       */
      COOKIE_SEGURA: '0',
    },
  },
});
