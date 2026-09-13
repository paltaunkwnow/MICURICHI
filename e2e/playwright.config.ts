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
      testMatch: /mapa-publico\.spec\.ts/,
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
  },
});
