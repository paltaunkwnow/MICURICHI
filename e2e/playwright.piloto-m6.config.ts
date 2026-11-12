import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Entorno efímero del arnés; no se lee .env ni se construyen clientes al cargar configuración.
const listing = process.argv.includes('--list');
const mode = process.env.M6_PILOTO_MODO ?? (listing ? 'piloto' : '');
const runId = process.env.M6_PILOTO_RUN_ID;
if (
  !['grupo', 'piloto'].includes(mode) ||
  (runId !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) ||
  (!listing && !runId)
)
  throw new Error('PILOTO_M6_REQUIERE_ARNES');

const groups: Record<string, string[]> = {
  G1: [
    'api-contratos',
    'separacion-publica-tecnica',
    'cuenta-ciudadana',
    'acceso-panel',
    'publicacion-diferida',
  ],
  G2: ['mapa-publico', 'mapa-seleccion', 'trafico-publico', 'datos-reales', 'navegacion'],
  G3: [
    'formulario-reporte',
    'formulario-sumidero-y-fotos',
    'ubicacion-obligatoria',
    'ubicacion-aproximada',
    'camara-foto',
    'resiliencia-interfaz',
    'quitar-campos-web',
  ],
  G4: [
    'recorrido-completo',
    'panel-tecnico',
    'panel-al-dia',
    'panel-ejecutivo',
    'panel-indicadores-tortas',
    'panel-mapa-reactivo',
    'quitar-campos-panel',
  ],
  G5: ['accesibilidad', 'responsive', 'csp'],
};
const group = process.env.M6_PILOTO_GRUPO;
const diagnostic = process.env.M6_DIAGNOSTICO_MAPA;
if (diagnostic !== undefined && (diagnostic !== '1' || mode !== 'grupo' || group !== 'G1'))
  throw new Error('DIAGNOSTICO_MAPA_INVALIDO');
if (mode === 'grupo' && (!group || !Object.hasOwn(groups, group)))
  throw new Error('GRUPO_INVALIDO');
if (mode === 'piloto' && group) throw new Error('OPCIONES_INVALIDAS');

const selected =
  mode === 'grupo' && !diagnostic
    ? (groups[group ?? ''] ?? []).map((name) => `${name}.spec.ts`)
    : ['piloto-m6.piloto.ts'];
const mobileFiles = new Set([
  'mapa-publico.spec.ts',
  'mapa-seleccion.spec.ts',
  'camara-foto.spec.ts',
  'ubicacion-obligatoria.spec.ts',
]);
const mobile = diagnostic
  ? []
  : mode === 'piloto'
    ? selected
    : selected.filter((file) => mobileFiles.has(file));
// Raíz hermana: listado y regresión no crean diarios y no pueden ocupar su espacio de nombres.
const output = path.resolve(__dirname, '../.turbo/piloto-m6-artefactos', runId ?? 'listado');

export default defineConfig({
  ...base,
  testDir: path.join(__dirname, 'tests'),
  testMatch: selected,
  grep: diagnostic ? /@diag-mapa-g1/ : undefined,
  grepInvert: diagnostic ? undefined : /@diag-mapa-g1/,
  globalSetup: mode === 'grupo' ? path.join(__dirname, 'global-setup.ts') : undefined,
  webServer: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: path.join(output, 'artefactos'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'playwright.json') }]],
  use: {
    ...base.use,
    baseURL: 'http://localhost:3000',
    channel: 'chromium',
    // Las trazas pueden contener cookies y contraseñas del login. Capturas sin tráfico HTTP.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testMatch: selected, use: { ...devices['Desktop Chrome'] } },
    ...(mobile.length
      ? [{ name: 'movil', testMatch: mobile, use: { ...devices['Pixel 7'] } }]
      : []),
  ],
});
