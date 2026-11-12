import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Independiente de la config, setup y helpers de la suite habitual y del piloto M6.
const listado = process.argv.includes('--list');
const corrida = process.env.MULTITEMATICA_E2E_RUN_ID;
const destino = process.env.MULTITEMATICA_E2E_DESTINO;
const nuevo = destino !== undefined && destino !== 'curichi_multitematica';
const urls = {
  web: process.env.MULTITEMATICA_E2E_WEB ?? 'http://127.0.0.2:4000',
  api: process.env.MULTITEMATICA_E2E_API ?? 'http://127.0.0.2:4001',
  geo: process.env.MULTITEMATICA_E2E_GEO ?? 'http://127.0.0.2:4002',
  panel: process.env.MULTITEMATICA_E2E_PANEL ?? 'http://127.0.0.2:4100',
};
if (nuevo) {
  if (
    !/^[a-z0-9][a-z0-9_]{0,24}$/.test(corrida ?? '') ||
    !['origen22', 'copia19', 'copia21', 'copia22'].some(
      (s) => destino === `curichi_sdd_m10c_${corrida}_${s}`,
    ) ||
    process.env.MULTITEMATICA_E2E_ESQUEMA !== '22'
  )
    throw new Error('BANCO_M10_NUEVO_NO_CONFIRMADO');
  const endpoints = Object.entries(urls).map(([rol, valor]) => {
    if (!process.env[`MULTITEMATICA_E2E_${rol.toUpperCase()}`])
      throw new Error('ENDPOINT_M10_EXPLICITO_REQUERIDO');
    const u = new URL(valor);
    if (
      u.protocol !== 'http:' ||
      !['127.0.0.1', '127.0.0.3'].includes(u.hostname) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/' ||
      !u.port ||
      Number(u.port) < 1024 ||
      [3000, 3001, 3002, 3100, 4000, 4001, 4002, 4100, 5432, 5433].includes(Number(u.port))
    )
      throw new Error('ENDPOINT_M10_NO_AISLADO');
    return u;
  });
  if (
    new Set(endpoints.map((u) => u.hostname)).size !== 1 ||
    new Set(endpoints.map((u) => u.port)).size !== 4
  )
    throw new Error('ENDPOINTS_M10_NO_AISLADOS');
} else if (
  Object.values(urls).join('|') !==
  'http://127.0.0.2:4000|http://127.0.0.2:4001|http://127.0.0.2:4002|http://127.0.0.2:4100'
) {
  throw new Error('ENDPOINT_LEGADO_NO_MODIFICABLE');
}
if (
  (corrida !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(corrida)) ||
  (!listado &&
    (!corrida ||
      (!nuevo && destino !== 'curichi_multitematica') ||
      !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')))
)
  throw new Error('CUATRO_CATEGORIAS_REQUIERE_INSTALACION_CONFIRMADA');

const salida = path.resolve(
  __dirname,
  nuevo
    ? '../.turbo/m10-cierre-2026-10-29/parte5/continuacion-20261101/e2e/salidas'
    : '../.turbo/cuatro-categorias-2026-10-22/e2e/salidas',
  corrida ?? 'listado',
);

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  testMatch: 'cuatro-categorias.local.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  maxFailures: 1,
  timeout: 360_000,
  globalTimeout: 1_200_000,
  expect: { timeout: 30_000 },
  // El operador inicia la instalación existente con scripts/multitematica-local.mjs.
  // La suite no crea servidores ni prepara, migra, siembra o activa ninguna base.
  webServer: [],
  outputDir: path.join(salida, 'artefactos'),
  reporter: [['list'], ['json', { outputFile: path.join(salida, 'playwright.json') }]],
  use: {
    baseURL: urls.web,
    browserName: 'chromium',
    channel: 'chromium',
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    permissions: ['geolocation', 'camera'],
    launchOptions: { args: ['--use-fake-device-for-media-stream'] },
    // Las trazas y los videos pueden capturar secretos de login. Diagnóstico saneado en la suite.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
});
