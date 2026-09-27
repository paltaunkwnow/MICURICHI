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
    /**
     * La foto sale de la cámara dentro de la página (`getUserMedia`), sin input de archivo al que
     * pasarle una imagen. Chromium trae una cámara falsa que entrega cuadros sintéticos de verdad
     * (1920 × 1080 si se piden), así que el disparo, la captura y la subida son los reales.
     *
     * El permiso lo da SOLO el contexto: cada prueba que saca fotos declara
     * `test.use({ permissions: ['camera'] })` y las demás no tienen cámara (`getUserMedia` da
     * `NotAllowedError`, como a quien la niega). Por eso no se usa `--use-fake-ui-for-media-stream`,
     * que acepta cualquier pedido y le daba cámara a todas. Y por eso el Chromium completo en modo
     * sin ventana (`channel: 'chromium'`): el `chromium-headless-shell` que se usa por defecto
     * responde `NotSupportedError` a todo pedido sin ese argumento, aun con el permiso dado.
     * `playwright install chromium` baja los dos.
     *
     * La ubicación sigue la misma regla (plan 2026-09-26, pedido E): reportar exige compartirla, y
     * cada prueba que reporta declara el teléfono y el permiso con
     * `test.use({ geolocation: GPS_EN_EL_CENTRO, permissions: ['geolocation'] })` (tests/ayudas.ts:
     * PUNTO_CENTRO con 10 m de precisión). Sin el permiso, Chromium niega el primer pedido, como
     * quien toca «Bloquear»; con `permissions: []`, lo da por negado de entrada.
     */
    channel: 'chromium',
    launchOptions: { args: ['--use-fake-device-for-media-stream'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'movil',
      use: { ...devices['Pixel 7'] },
      // El mapa es lo que más cambia entre tamaños: en móvil el detalle sube como hoja sobre el
      // mapa y no hay lista lateral donde caerse. Los dos archivos del mapa corren también acá, y
      // la cámara y la ubicación del reporte, que en el teléfono es donde se usan.
      testMatch: /(mapa-publico|mapa-seleccion|camara-foto|ubicacion-obligatoria)\.spec\.ts/,
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
      // Lo mismo en geo-service: detrás de las apps de Next todas las teselas y resoluciones
      // llegan desde la misma IP, y la suite abre decenas de mapas por minuto.
      GEO_RATE_LIMIT_POR_MINUTO: '100000',
      GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO: '100000',
      /**
       * Dirección del panel que api-core manda en `panel_url` de `/auth/yo` (contracts 0.7.0): de
       * ahí sale el botón «Panel técnico/ejecutivo» de la app pública. Tiene que ser la misma en
       * la que la suite busca el panel (`PANEL` en tests/ayudas.ts); sin ella, api-core manda
       * null y el botón no aparece.
       */
      PANEL_ADMIN_URL: process.env.PANEL_ADMIN_URL ?? 'http://localhost:3100',
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
