import { defineConfig, devices } from '@playwright/test';

/**
 * E2E propio del panel técnico. No levanta servidores: espera que el panel corra en el
 * puerto 3100 y que api-core, geo-service y la base con el seed local estén arriba
 * (ver README.md).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PANEL_ADMIN_URL ?? 'http://localhost:3100',
    locale: 'es-BO',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
